/**
 * verify-drift.mjs — The drift guard over the derived artifacts.
 *
 * The target files (each target locale's content pages and UI dictionary) are
 * DERIVED from the source locale plus the translation memory. Editing one by hand
 * is a workflow error: the source locale is the only editable surface. This guard
 * regenerates the targets IN MEMORY (from source plus memory) and classifies
 * every leaf of the target files on disk against that regeneration
 * (`antidrift.mjs`): a differing leaf whose text is known — a source-locale text,
 * a recorded source text, or a memory text of either layer, live or archived —
 * is STALE and reported; one whose text is known nowhere is HAND-EDITED, and the
 * `verify-drift` command exits non-zero naming its file and leaf. So a target
 * that lags its source passes, and an edit that no regeneration could produce
 * fails.
 *
 * READS the source-locale content, the source UI dictionary, the lookup view of
 * the memory and the known texts (both passed in), the optional slug-override
 * map, and the current target files. WRITES nothing at all — regeneration
 * happens in memory, which is what makes the guard safe to run at any time.
 *
 * SCOPE: `real` compares against each target locale's real destination;
 * `staging` against the last generated staging copy, which is how a hand edit
 * made to staging is caught. Both are per-locale patterns from the configuration.
 */

import nodeFs from 'node:fs';
import path from 'node:path';

import { expandLang } from '../../config.mjs';
import { generateContent, readSourcePages } from './generate.mjs';
import { generateUiDictionary } from './generate-ui.mjs';
import {
  detectDrift,
  formatDriftMessage,
  readCurrentTargets,
  readCurrentUiDictionaries,
  scalarTexts,
} from './antidrift.mjs';

/** The message a comparison with nothing to report prints. */
export const NO_DIVERGENCE_MESSAGE =
  'anti-drift: no divergence. The derived targets match the source locale plus the TM.';

/**
 * The known texts of each target locale, as the drift guard reads them: every
 * scalar of every source file and of the source UI dictionary, the texts the
 * memory directory records as source, and the locale's memory texts of either
 * layer, live or archived. A leaf holding a text outside them is hand-edited.
 *
 * @param {Object} args
 * @param {Array<{page:Object}>} args.pages            the source pages.
 * @param {Object|null} [args.dict]                    the source UI dictionary.
 * @param {Iterable<string>} [args.recordedSourceTexts]
 * @param {Object.<string, Set<string>>} [args.memoryTextsByLang]
 * @returns {(lang:string) => Set<string>}
 */
export function knownTextsOf({ pages, dict = null, recordedSourceTexts = [], memoryTextsByLang = {} }) {
  const sourceTexts = new Set(recordedSourceTexts);
  for (const { page } of pages) scalarTexts(page, sourceTexts);
  if (dict) scalarTexts(dict, sourceTexts);
  const knownByLang = {};
  return (lang) => {
    if (!knownByLang[lang]) knownByLang[lang] = new Set([...sourceTexts, ...(memoryTextsByLang[lang] || [])]);
    return knownByLang[lang];
  };
}

const hasReport = (r) => r.handEdited.length + r.stale.length + r.missing.length + r.extra.length > 0;

/**
 * Computes the drift of the derived targets. It performs I/O but is fully
 * parameterizable (a test seam): every source and destination is injectable, so
 * the tests operate on fixtures in a temporary directory.
 *
 * @param {Object} args
 * @param {import('./fields.mjs').FieldRules} args.rules  the traversal rules.
 * @param {string} args.sourceLang             the source locale code.
 * @param {string[]} args.targets              target locales.
 * @param {Object} args.tmByLang               the lookup view of the memory, per locale.
 * @param {Object.<string, Set<string>>} [args.memoryTextsByLang]  every memory text per locale,
 *                                             both layers, live and archived (`store.memoryTexts`).
 * @param {Iterable<string>} [args.recordedSourceTexts]  the source texts the memory directory records
 *                                             (the catalogue and the source map).
 * @param {string} [args.contentDir]           the source-locale content directory.
 * @param {Array}  [args.sourcePages]          source pages already read (a test seam).
 * @param {Object|null} [args.langMap]         the slug-override map, or null.
 * @param {string|null} [args.uiDictPath]      path of the source UI dictionary; null when the site has none.
 * @param {Object|null} [args.sourceDict]      an already-read source UI dictionary.
 * @param {string} args.currentContentDir      the per-locale pattern of the current content targets.
 * @param {string|null} [args.currentUiFile]   the per-locale pattern of the current UI dictionaries.
 * @param {string|null} [args.root]            when given, files are named relative to it.
 * @param {Object} [args.plan]                 the output plan (`createOutputPlan`): pairs, paths and file names.
 * @param {boolean} [args.nestedUi]            a nested UI dictionary (`adapter.ui.nested`).
 * @param {typeof nodeFs} [args.fsImpl]
 * @returns {{clean:boolean, contentResult:Object, uiResult:Object, message:string}}
 */
export function checkDrift({
  rules,
  sourceLang,
  targets,
  tmByLang,
  memoryTextsByLang = {},
  recordedSourceTexts = [],
  contentDir,
  sourcePages = null,
  langMap = null,
  uiDictPath = null,
  sourceDict = null,
  currentContentDir,
  currentUiFile = null,
  root = null,
  plan = null,
  nestedUi = false,
  fsImpl = nodeFs,
}) {
  const fs = fsImpl;
  const pages = sourcePages || readSourcePages(contentDir, fs);
  const dict = sourceDict || (uiDictPath ? JSON.parse(fs.readFileSync(uiDictPath, 'utf8')) : null);

  const knownFor = knownTextsOf({ pages, dict, recordedSourceTexts, memoryTextsByLang });
  const shown = (abs) => (root ? path.relative(root, abs) : abs);

  // Regeneration IN MEMORY: no outDir, so nothing is written to disk.
  const genContent = generateContent({
    rules,
    sourceLang,
    tmByLang,
    targets,
    sourcePages: pages,
    langMap,
    ...(plan ? { plan } : {}),
    fsImpl: fs,
  });
  const currentContent = readCurrentTargets({ dir: currentContentDir, langs: targets, fsImpl: fs });
  const contentResult = detectDrift({
    currentFiles: currentContent,
    generatedFiles: genContent.files,
    knownTexts: (rel) => knownFor(rel.split('/')[0]),
  });
  const contentName = (rel) => {
    const [lang, ...rest] = rel.split('/');
    return shown(path.join(expandLang(currentContentDir, lang), ...rest));
  };

  let uiResult = { handEdited: [], stale: [], drifted: [], missing: [], extra: [], clean: true };
  let uiName = (rel) => rel;
  if (dict) {
    const genUi = generateUiDictionary({ tmByLang, targets, sourceDict: dict, nested: nestedUi, fsImpl: fs });
    const currentUi = readCurrentUiDictionaries({ file: currentUiFile, langs: targets, fsImpl: fs });
    // Normalizes the generated UI dictionary's keys to `<lang>.json` for the comparison.
    const uiGenerated = {};
    for (const lang of targets) {
      if (genUi.files[lang] !== undefined) uiGenerated[`${lang}.json`] = genUi.files[lang];
    }
    uiResult = detectDrift({
      currentFiles: currentUi,
      generatedFiles: uiGenerated,
      knownTexts: (rel) => knownFor(rel.replace(/\.json$/, '')),
    });
    uiName = (rel) => (currentUiFile ? shown(expandLang(currentUiFile, rel.replace(/\.json$/, ''))) : rel);
  }

  const clean = contentResult.clean && uiResult.clean;

  const parts = [];
  if (hasReport(contentResult)) parts.push('content:\n' + formatDriftMessage(contentResult, { nameOf: contentName }));
  if (hasReport(uiResult)) parts.push('UI dictionary:\n' + formatDriftMessage(uiResult, { nameOf: uiName }));
  let message = parts.length ? parts.join('\n') : NO_DIVERGENCE_MESSAGE;
  if (!clean) message += '\nthese targets are derived: edit the source locale, not the target.';

  return { clean, contentResult, uiResult, message };
}

export default { checkDrift, knownTextsOf, NO_DIVERGENCE_MESSAGE };
