/**
 * materialize.mjs — Writes the generated target artifacts to their REAL location.
 *
 * READS the source-locale content and UI dictionary (through the generators)
 * and the lookup view of the translation memory it is handed; under the safe
 * policy, also the target files already on disk. WRITES each target locale's
 * content pages and UI dictionary at the configuration's real target patterns —
 * the files the site actually builds from — under the names, paths, `lang` and
 * key order the output plan gives them, and only for the pages it pairs.
 *
 * WHY THIS IS A SEPARATE COMMAND from `generate`. Generation writes to a staging
 * area, and that default is a safety property rather than an inconvenience: a
 * routine generate can then never overwrite committed content, so running one
 * while a translation is incomplete costs nothing. Materializing is the
 * deliberate act of promoting the result, so it is spelled differently and asked
 * for explicitly.
 *
 * THE POLICY (`adapter.output.materialize`):
 *   - `replace` (the default): every generated file is written. With no
 *     translation for a string the file carries the SOURCE text as a fallback,
 *     so materializing before translating produces target files in the source
 *     language: honest, visible, and reported by `gate --check`.
 *   - `safe`, for a site whose target files were written by hand: a generated
 *     file is written only when (a) none of its leaves falls back to the source
 *     text, and (b) the file does not exist yet, or none of the leaves the write
 *     would replace or remove is HAND-EDITED — the drift guard's
 *     classification (`antidrift.mjs`): a text in no source file, no recorded
 *     source text and no memory entry. Every other generated file is left as it
 *     is on disk and named, with the reason. So a safe materialize never writes
 *     source-language text into a target and never loses text the memory does
 *     not hold.
 * Under either policy a file on disk that nothing generates — an unpaired page's
 * hand-written target, a renamed page — is never touched, and nothing is deleted.
 *
 * 🔴 EVERY FILE THIS WRITES IS DERIVED. A hand edit to one survives until the next
 * run and then vanishes with no diff (under `replace`), or blocks that file's
 * next materialization (under `safe`). The `verify-drift` command is what
 * catches it; to change a target string, change the source string and
 * regenerate, or record the translation in the human layer.
 */

import nodeFs from 'node:fs';
import path from 'node:path';

import { expandLang } from '../../config.mjs';
import { generateContent, readSourcePages } from './generate.mjs';
import { generateUiDictionary } from './generate-ui.mjs';
import { detectDrift, readCurrentTargets, readCurrentUiDictionaries } from './antidrift.mjs';
import { knownTextsOf } from './verify-drift.mjs';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * Why the safe policy leaves one generated file as it is, or an empty list.
 *
 * @param {Object} args
 * @param {number} args.fallbacks     the file's leaves that keep their source text.
 * @param {*} args.current            the file on disk, or undefined when absent.
 * @param {*} args.generated          the regenerated file.
 * @param {Set<string>} args.known    the known texts of its locale.
 * @param {string} args.rel           its key in the comparison.
 * @returns {string[]}
 */
export function safeRefusals({ fallbacks, current, generated, known, rel }) {
  const reasons = [];
  if (fallbacks > 0) reasons.push(`${plural(fallbacks, 'leaf has', 'leaves have')} no translation and would be written in the source language`);
  if (current !== undefined) {
    const drift = detectDrift({ currentFiles: { [rel]: current }, generatedFiles: { [rel]: generated }, knownTexts: known });
    if (drift.handEdited.length) {
      const leaves = drift.handEdited.slice(0, 3).map((h) => h.leaf).join(', ');
      reasons.push(`${plural(drift.handEdited.length, 'hand-edited leaf', 'hand-edited leaves')} would be replaced or removed (${leaves}${drift.handEdited.length > 3 ? ', …' : ''})`);
    }
  }
  return reasons;
}

/**
 * Writes the real target artifacts and reports what it wrote through `log`.
 *
 * @param {Object} args
 * @param {Object} args.generateArgs        the shared generator arguments
 *                                          (rules, sourceLang, contentDir, langMap, plan, fsImpl).
 * @param {Object} args.tmByLang            the lookup view of the memory, per locale.
 * @param {string[]} args.targets           the target locales.
 * @param {string} args.contentTarget       the real content pattern (`…/{lang}`).
 * @param {string|null} args.uiDictPath     the source UI dictionary, or null when the site has none.
 * @param {string|null} args.uiTarget       the real UI dictionary pattern (`…/{lang}.json`).
 * @param {boolean} [args.nestedUi]         a nested UI dictionary (`adapter.ui.nested`).
 * @param {'replace'|'safe'} [args.policy]  what may be written (`adapter.output.materialize`).
 * @param {Object.<string, Set<string>>} [args.memoryTextsByLang]  every memory text per locale (the safe policy's known texts).
 * @param {Iterable<string>} [args.recordedSourceTexts]           the recorded source texts (the same).
 * @param {string|null} [args.root]         when given, files are named relative to it.
 * @param {boolean} [args.content]          write the content pages.
 * @param {boolean} [args.ui]               write the UI dictionaries.
 * @param {(...a:any[])=>void} [args.log]
 * @returns {{content:Object|null, ui:Object|null}}  each `{ written, kept, unpaired, warnings }`,
 *          `kept` listing `{ file, reasons }` for every generated file the safe policy left as it is.
 */
export function materialize({
  generateArgs,
  tmByLang,
  targets,
  contentTarget,
  uiDictPath,
  uiTarget,
  nestedUi = false,
  policy = 'replace',
  memoryTextsByLang = {},
  recordedSourceTexts = [],
  root = null,
  content = true,
  ui = true,
  log = (...a) => console.log(...a),
}) {
  const fs = generateArgs.fsImpl || nodeFs;
  const plan = generateArgs.plan;
  const serialize = plan ? plan.serialize : undefined;
  const shown = (abs) => (root ? path.relative(root, abs) : abs);
  const safe = policy === 'safe';
  let uiResult = null;
  let contentResult = null;

  const pages = readSourcePages(generateArgs.contentDir, fs);
  const dict = ui && uiDictPath ? JSON.parse(fs.readFileSync(uiDictPath, 'utf8')) : null;
  const knownFor = safe ? knownTextsOf({ pages, dict, recordedSourceTexts, memoryTextsByLang }) : null;

  const write = (abs, value) => {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, serialize ? serialize(value) : `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  };
  const report = (label, result) => {
    log(`${label}: ${result.written.length} file(s) written${safe ? `, ${result.kept.length} left as they are (policy "safe")` : ''}`);
    for (const file of result.written) log(`  ${shown(file)}`);
    for (const { file, reasons } of result.kept) log(`  left as it is: ${shown(file)}: ${reasons.join('; ')}`);
    if (result.unpaired && result.unpaired.length) log(`  ${result.unpaired.length} source page(s) without a pair in a target locale, not written`);
    if (!safe && result.fallbacks > 0) log(`  ${result.fallbacks} string(s) fell back to the source language`);
  };

  if (ui && dict) {
    const gen = generateUiDictionary({ tmByLang, targets, sourceDict: dict, nested: nestedUi, ...(serialize ? { serialize } : {}), fsImpl: fs });
    const current = safe ? readCurrentUiDictionaries({ file: uiTarget, langs: targets, fsImpl: fs }) : {};
    uiResult = { written: [], kept: [], warnings: gen.warnings, fallbacks: 0 };
    for (const lang of targets) {
      const abs = expandLang(uiTarget, lang);
      const rel = `${lang}.json`;
      const reasons = safe ? safeRefusals({ fallbacks: gen.fallbacks[lang], current: current[rel], generated: gen.files[lang], known: knownFor(lang), rel }) : [];
      uiResult.fallbacks += gen.fallbacks[lang];
      if (reasons.length) {
        uiResult.kept.push({ file: abs, reasons });
        continue;
      }
      write(abs, gen.files[lang]);
      uiResult.written.push(abs);
    }
    report('ui-dictionary', uiResult);
  }

  if (content) {
    const gen = generateContent({ ...generateArgs, sourcePages: pages, tmByLang, targets, outDir: null });
    const current = safe ? readCurrentTargets({ dir: contentTarget, langs: targets, fsImpl: fs }) : {};
    contentResult = { written: [], kept: [], unpaired: gen.unpaired, warnings: gen.warnings, fallbacks: 0 };
    for (const rel of Object.keys(gen.files)) {
      const [lang, ...rest] = rel.split('/');
      const abs = path.join(expandLang(contentTarget, lang), ...rest);
      const reasons = safe ? safeRefusals({ fallbacks: gen.fallbacks[rel], current: current[rel], generated: gen.files[rel], known: knownFor(lang), rel }) : [];
      contentResult.fallbacks += gen.fallbacks[rel];
      if (reasons.length) {
        contentResult.kept.push({ file: abs, reasons });
        continue;
      }
      write(abs, gen.files[rel]);
      contentResult.written.push(abs);
    }
    report('content', contentResult);
  }

  return { content: contentResult, ui: uiResult };
}

export default { materialize, safeRefusals };
