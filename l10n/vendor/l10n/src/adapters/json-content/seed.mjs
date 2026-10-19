/**
 * seed.mjs — Imports hand-written target-locale text into the HUMAN layer of the
 * translation memory.
 *
 * READS the source and target content pages and UI dictionaries at the paths the
 * adapter resolves from the configuration, plus the HUMAN layer of the target
 * locale (the layer seeding writes). WRITES the coverage report (coverage and
 * divergences) at the path it is given, which the adapter takes from the memory
 * directory; the entries it returns are persisted by `engine.seed()`, never by
 * this module, and never into the machine layer.
 *
 * Some target text is written by hand rather than generated — copy approved with
 * the design, or legal text drafted in both languages. Seeding records each such
 * pair as a `seed` entry keyed by the hash of the source text, so the generator
 * reproduces the hand-written file exactly and the drift guard stays quiet,
 * without calling any translation service.
 *
 * ALIGNMENT IS BY IDENTICAL STRUCTURAL POSITION, nothing fuzzier:
 *   - a source page is paired with the target page at the path the output plan
 *     gives it (`createOutputPlan`, the generator's own rule: the path strategy,
 *     the language map, and with `output.pairs: "langMap"` only a paired page),
 *     and a document with no `path` with the target file of the name the plan
 *     gives it;
 *   - within a pair, both pages are walked with `translatableLeaves` (the single
 *     definition extraction and generation share) and leaves are paired when their
 *     accessor is identical and the structure along it agrees (array lengths,
 *     block names);
 *   - UI-dictionary strings are paired by dictionary key (its path, in a nested
 *     dictionary).
 * Anything that does not line up is skipped and reported, never guessed.
 *
 * Idempotent and conservative: an entry already marked `human` or `reviewed` is
 * never re-emitted, an entry with the same target text is left alone, and when two
 * positions with the same source text carry different target texts the first wins
 * and the conflict is reported.
 */

import nodeFs from 'node:fs';
import path from 'node:path';

import { keyOf, normalize } from '../../normalize.mjs';
import { stableStringify } from '../../store.mjs';
import { STATUS } from '../../types.mjs';
import { parsePath } from './fields.mjs';
import { createOutputPlan } from './generate.mjs';
import { dictionaryStrings } from './extract-ui.mjs';

/** Reads every page of a directory; an absent directory has none. */
export function readPages(dir, fs = nodeFs) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => n.endsWith('.json'))
    .sort()
    .map((name) => ({ name, page: JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) }));
}

/** Reads a dictionary file; an absent or empty file is an empty dictionary. */
export function readDictionary(file, fs = nodeFs) {
  if (!file || !fs.existsSync(file)) return {};
  const raw = fs.readFileSync(file, 'utf8');
  return raw && raw.trim() ? JSON.parse(raw) : {};
}

/**
 * True when both pages agree structurally along a leaf's accessor: every array
 * walked has the same length, every key exists on both sides, and the blocks at
 * the same index have the same `name`.
 */
function structurallyAligned(sourcePage, targetPage, tokens) {
  let s = sourcePage;
  let t = targetPage;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (typeof token === 'number') {
      if (!Array.isArray(s) || !Array.isArray(t) || s.length !== t.length) return false;
    } else {
      if (!s || typeof s !== 'object' || Array.isArray(s)) return false;
      if (!t || typeof t !== 'object' || Array.isArray(t) || !(token in t)) return false;
    }
    s = s[token];
    t = t[token];
    if (s === undefined || t === undefined) return false;
    if (i === 1 && tokens[0] === 'blocks' && s && t && s.name !== t.name) return false;
  }
  return true;
}

/**
 * The pure aligner: source and target pages and dictionaries, plus the existing
 * human layer, in; the entries to emit, their source texts and a report out.
 *
 * @param {Object} args
 * @param {import('./fields.mjs').FieldRules} args.rules  the traversal rules.
 * @param {string} args.sourceLang  the source locale code.
 * @param {string} args.lang        the target locale code.
 * @returns {{entriesByLang:Object, sourceEntries:Object, report:Object}}
 */
export function alignSeed({
  rules,
  sourceLang,
  lang,
  sourcePages,
  targetPages,
  sourceDictionary = {},
  targetDictionary = {},
  nestedUi = false,
  existingTM = {},
  langMap = null,
  plan = null,
  now = () => new Date().toISOString(),
}) {
  const output = plan || createOutputPlan({ sourceLang, langMap });
  const targetByPath = new Map();
  const targetByName = new Map();
  for (const entry of targetPages) {
    if (typeof entry.page?.path === 'string' && !targetByPath.has(entry.page.path)) {
      targetByPath.set(entry.page.path, entry);
    }
    targetByName.set(entry.name, entry);
  }

  const entries = {};
  const sourceEntries = {};
  const seen = new Map();
  const counts = { seeded: 0, unchanged: 0, preserved: 0, duplicate: 0 };
  const unpaired = [];
  const divergences = [];
  const collisions = [];

  function offer(sourceText, targetText, where) {
    const key = keyOf(sourceText);
    if (seen.has(key)) {
      if (seen.get(key) === targetText) counts.duplicate += 1;
      else collisions.push({ key, source: normalize(sourceText), kept: seen.get(key), dropped: targetText, where });
      return;
    }
    const existing = existingTM[key];
    if (existing && (existing.status === STATUS.HUMAN || existing.status === STATUS.REVIEWED)) {
      counts.preserved += 1;
      seen.set(key, existing.text);
      return;
    }
    seen.set(key, targetText);
    if (existing && existing.text === targetText) {
      counts.unchanged += 1;
      return;
    }
    entries[key] = { text: targetText, status: STATUS.SEED };
    sourceEntries[key] = normalize(sourceText);
    counts.seeded += 1;
  }

  for (const { name, page } of sourcePages) {
    // A page is paired by its target path; a document with no path, by the file name the plan gives it.
    const paired = output.paired(page, lang);
    const expected = paired ? (typeof page?.path === 'string' ? output.pathFor(page, lang) : output.fileFor(name, page, lang)) : null;
    const target = !paired ? null : typeof page?.path === 'string' ? targetByPath.get(expected) : targetByName.get(expected);
    if (!target) {
      unpaired.push({ file: name, path: page?.path ?? null, expected });
      continue;
    }
    const targetLeaves = new Map(rules.translatableLeaves(target.page).map((leaf) => [leaf.path, leaf.value]));
    for (const leaf of rules.translatableLeaves(page)) {
      const text = targetLeaves.get(leaf.path);
      if (text === undefined) {
        divergences.push({ page: page.path, path: leaf.path, reason: 'missing-in-target' });
      } else if (!structurallyAligned(page, target.page, parsePath(leaf.path))) {
        divergences.push({ page: page.path, path: leaf.path, reason: 'structure-differs' });
      } else {
        offer(leaf.value, text, `${page.path} ${leaf.path}`);
      }
    }
  }

  const targetStrings = new Map(dictionaryStrings(targetDictionary, nestedUi).map((entry) => [entry.dictKey, entry.value]));
  for (const { dictKey, value: sourceText } of dictionaryStrings(sourceDictionary, nestedUi)) {
    const text = targetStrings.get(dictKey);
    if (sourceText.trim() === '') continue;
    if (typeof text !== 'string' || text.trim() === '') {
      divergences.push({ page: 'ui-dictionary', path: dictKey, reason: 'missing-in-target' });
      continue;
    }
    offer(sourceText, text, `ui-dictionary ${dictKey}`);
  }

  const report = { generated_at: now(), lang, counts: { ...counts, unpaired: unpaired.length, divergences: divergences.length, collisions: collisions.length }, unpaired, divergences, collisions };
  return { entriesByLang: { [lang]: entries }, sourceEntries, report };
}

/**
 * Reads the pages, dictionaries and human layer for one target locale, aligns
 * them, and writes the coverage report when `reportPath` is given.
 *
 * @param {Object} args  `alignSeed`'s rules, sourceLang, lang and langMap, plus:
 * @param {string} args.sourceContentDir  the source-locale content directory.
 * @param {string} args.targetContentDir  the target locale's real content directory.
 * @param {string|null} [args.sourceDictPath]  the source-locale UI dictionary, if any.
 * @param {string|null} [args.targetDictPath]  the target locale's real UI dictionary, if any.
 * @param {Object} args.existingTM        the target locale's HUMAN layer.
 * @param {string|null} [args.reportPath] where the coverage report is written.
 */
export function seedLocale({
  rules,
  sourceLang,
  lang,
  langMap = null,
  plan = null,
  nestedUi = false,
  sourceContentDir,
  targetContentDir,
  sourceDictPath = null,
  targetDictPath = null,
  existingTM,
  reportPath = null,
  fsImpl = nodeFs,
  now = () => new Date().toISOString(),
}) {
  const result = alignSeed({
    rules,
    sourceLang,
    lang,
    sourcePages: readPages(sourceContentDir, fsImpl),
    targetPages: readPages(targetContentDir, fsImpl),
    sourceDictionary: readDictionary(sourceDictPath, fsImpl),
    targetDictionary: readDictionary(targetDictPath, fsImpl),
    existingTM,
    langMap,
    plan,
    nestedUi,
    now,
  });
  if (reportPath) {
    fsImpl.mkdirSync(path.dirname(reportPath), { recursive: true });
    fsImpl.writeFileSync(reportPath, stableStringify(result.report), 'utf8');
  }
  return result;
}

export default { alignSeed, seedLocale, readPages, readDictionary };
