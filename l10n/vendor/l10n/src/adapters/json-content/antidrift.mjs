/**
 * antidrift.mjs — The drift guard's comparison: it classifies every leaf of the
 * derived target artifacts on disk against their regeneration.
 *
 * The content files and UI dictionary of a target locale (`content/en/*.json`,
 * for instance) are DERIVED: they are generated from the source locale plus the
 * translation memory (see `generate.mjs`). A target may LAG its source —
 * translations arrive after the source change that needs them, and a deploy
 * regenerates the targets from the newest memory — and lag is not the defect
 * this guard exists to catch. A HAND EDIT is: an edit to a derived file survives
 * until the next regeneration and then vanishes with no diff.
 *
 * THE CLASSIFICATION, leaf by leaf, between a file on disk and its regeneration:
 *   - a leaf equal to its regeneration passes;
 *   - a leaf that differs from its regeneration, or that the regeneration no
 *     longer has, is HAND-EDITED when its text is not a known text — it is in no
 *     source-locale file, no recorded source text, and no memory entry of either
 *     layer, live or archived — and STALE otherwise: it holds an older
 *     translation, or the source text generation falls back to, and the next
 *     regeneration replaces it;
 *   - a leaf the regeneration has and the file lacks is STALE, and so is a
 *     generated file absent from disk (`missing`);
 *   - a file on disk that nothing generates is reported as EXTRA.
 * Only a hand-edited leaf fails: `clean` is false exactly when there is one.
 * A leaf is a string, number, boolean or null at a path of the file; a number or
 * boolean is compared with the known texts as its string form.
 *
 * READS nothing by itself and WRITES nothing: the classification operates on
 * in-memory maps of `{ relPath: value }` and the set of known texts its caller
 * builds (`verify-drift.mjs`). Two optional helpers read the current target files
 * from disk, for a caller that has only a path pattern.
 *
 * This module is a library, not a command: `verify-drift.mjs` (the
 * `verify-drift` command) is what runs it.
 */

import nodeFs from 'node:fs';
import path from 'node:path';

import { expandLang } from '../../config.mjs';
import { stringifyPath } from './fields.mjs';

/**
 * Every scalar leaf of a JSON value, keyed by its path tokens, with the path
 * written as the content accessors write it (`blocks[0].data.heading`).
 *
 * @param {*} value
 * @returns {Map<string, {leaf:string, value:*}>}
 */
export function scalarLeaves(value) {
  const out = new Map();
  const walk = (node, tokens) => {
    if (Array.isArray(node)) {
      node.forEach((el, i) => walk(el, [...tokens, i]));
    } else if (node !== null && typeof node === 'object') {
      for (const key of Object.keys(node)) walk(node[key], [...tokens, key]);
    } else if (node !== undefined) {
      out.set(JSON.stringify(tokens), { leaf: stringifyPath(tokens) || '(root)', value: node });
    }
  };
  walk(value, []);
  return out;
}

/** Every scalar of a JSON value, as text: the source texts a leaf may fall back to. */
export function scalarTexts(value, into = new Set()) {
  for (const { value: v } of scalarLeaves(value).values()) if (v !== null) into.add(String(v));
  return into;
}

const isKnown = (value, known) => value !== null && known.has(String(value));

/**
 * Classifies the current target files against the generated ones.
 *
 * @param {Object} args
 * @param {Object.<string, (Object|string)>} args.currentFiles    `{ relPath: value }` read from disk.
 * @param {Object.<string, (Object|string)>} args.generatedFiles  `{ relPath: value }` regenerated.
 * @param {Set<string>|((relPath:string)=>Set<string>)} [args.knownTexts]
 *        the known texts — every source-locale text, recorded source text and
 *        memory text for the file's locale; with none, every differing leaf is hand-edited.
 * @returns {{handEdited:{file:string, leaf:string}[], stale:{file:string, leaf:string}[],
 *            drifted:string[], missing:string[], extra:string[], clean:boolean}}
 *   drifted = the files holding a hand-edited leaf;
 *   missing = generated but absent from disk (a target still to be materialized);
 *   extra   = on disk but no longer generated (an orphan or a rename).
 */
export function detectDrift({ currentFiles = {}, generatedFiles = {}, knownTexts = new Set() } = {}) {
  const knownFor = typeof knownTexts === 'function' ? knownTexts : () => knownTexts;
  const handEdited = [];
  const stale = [];
  const missing = [];
  const extra = [];

  for (const file of Object.keys(generatedFiles).sort()) {
    if (!(file in currentFiles)) {
      missing.push(file);
      continue;
    }
    const known = knownFor(file);
    const disk = scalarLeaves(currentFiles[file]);
    const generated = scalarLeaves(generatedFiles[file]);
    for (const [key, { leaf, value }] of disk) {
      const regenerated = generated.get(key);
      if (regenerated && Object.is(regenerated.value, value)) continue;
      (isKnown(value, known) ? stale : handEdited).push({ file, leaf });
    }
    for (const [key, { leaf }] of generated) {
      if (!disk.has(key)) stale.push({ file, leaf });
    }
  }
  for (const file of Object.keys(currentFiles).sort()) {
    if (!(file in generatedFiles)) extra.push(file);
  }

  const drifted = [...new Set(handEdited.map((h) => h.file))];
  return { handEdited, stale, drifted, missing, extra, clean: handEdited.length === 0 };
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * A human-readable account of a `detectDrift` outcome: the hand-edited leaves,
 * which fail, then the stale leaves and missing files, which do not.
 *
 * @param {ReturnType<typeof detectDrift>} result
 * @param {Object} [opts]
 * @param {(relPath:string)=>string} [opts.nameOf]  how a file is named in the message.
 * @returns {string}
 */
export function formatDriftMessage(result, { nameOf = (f) => f } = {}) {
  if (!result) return 'anti-drift: no divergence.';
  const lines = [];
  if (result.handEdited.length) {
    lines.push(
      `anti-drift: ${plural(result.handEdited.length, 'hand-edited leaf', 'hand-edited leaves')}, whose text is in no source file and no memory entry — edit the source locale, not the target.`
    );
    for (const { file, leaf } of result.handEdited) lines.push(`  hand-edited: ${nameOf(file)} ${leaf}`);
  }
  if (result.stale.length || result.missing.length) {
    lines.push(
      `anti-drift: ${plural(result.stale.length, 'stale leaf', 'stale leaves')} and ${plural(result.missing.length, 'target file', 'target files')} not yet generated: they lag the source or the memory, and the next materialize regenerates them.`
    );
    for (const { file, leaf } of result.stale) lines.push(`  stale: ${nameOf(file)} ${leaf}`);
    for (const file of result.missing) lines.push(`  not on disk: ${nameOf(file)}`);
  }
  if (result.extra.length) lines.push(`anti-drift: on disk but generated from no source (${result.extra.length}): ${result.extra.map(nameOf).join(', ')}`);
  return lines.length ? lines.join('\n') : 'anti-drift: no divergence.';
}

/**
 * An optional helper: READS the current target files of each locale into a
 * `{ '<lang>/<file>': pageObject }` map, for comparison with
 * `generateContent`'s output.
 *
 * @param {Object} args
 * @param {string} args.dir            the per-locale directory pattern (`…/{lang}`).
 * @param {string[]} args.langs        the locales to read.
 * @param {typeof nodeFs} [args.fsImpl]
 * @returns {Object.<string, Object>}
 */
export function readCurrentTargets({ dir, langs, fsImpl = nodeFs }) {
  const fs = fsImpl;
  const out = {};
  for (const lang of langs) {
    const langDir = expandLang(dir, lang);
    if (!fs.existsSync(langDir)) continue;
    for (const name of fs.readdirSync(langDir).filter((n) => n.endsWith('.json')).sort()) {
      out[`${lang}/${name}`] = JSON.parse(fs.readFileSync(path.join(langDir, name), 'utf8'));
    }
  }
  return out;
}

/**
 * An optional helper: READS the current target UI dictionaries into a
 * `{ '<lang>.json': dictObject }` map, for comparison with
 * `generateUiDictionary`'s output (which returns `{ [lang]: dictObject }`).
 * `detectDrift` walks any JSON value, so the UI dictionary passes through the
 * same classification as the content.
 *
 * @param {Object} args
 * @param {string} args.file           the per-locale file pattern (`…/{lang}.json`).
 * @param {string[]} args.langs        the locales to read.
 * @param {typeof nodeFs} [args.fsImpl]
 * @returns {Object.<string, Object>}
 */
export function readCurrentUiDictionaries({ file, langs, fsImpl = nodeFs }) {
  const fs = fsImpl;
  const out = {};
  for (const lang of langs) {
    const langFile = expandLang(file, lang);
    if (!fs.existsSync(langFile)) continue;
    out[`${lang}.json`] = JSON.parse(fs.readFileSync(langFile, 'utf8'));
  }
  return out;
}

export default { detectDrift, formatDriftMessage, scalarLeaves, scalarTexts, readCurrentTargets, readCurrentUiDictionaries };
