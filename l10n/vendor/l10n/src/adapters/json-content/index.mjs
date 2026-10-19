/**
 * index.mjs — The JSON-content adapter: a block-composed site's content model,
 * driven by the project's configuration.
 *
 * The engine knows nothing about the content model; this module is the whole of
 * what it knows. `createJsonContentAdapter` builds, from a loaded project (see
 * `config.mjs`), the object `createEngine({adapter})` expects, plus the two
 * adapter-level commands the engine does not own:
 *
 *   - `extract()`  → the source catalogue (every translatable unit, keyed by a
 *                    hash of its normalized source text);
 *   - `pages()`    → the ordered pages a translation request is built from: each
 *                    content file in name order, then the UI dictionary, each with
 *                    its segments in document order (see below);
 *   - `generate({tmByLang, targets})` → rewrites the target-locale artifacts
 *                    into the STAGING area;
 *   - `seedAlign({store, targets})` → imports hand-written target text into the
 *                    human layer as `seed` entries; see `seed.mjs`;
 *   - `materialize({tmByLang, targets, content, ui})` → writes the targets to
 *                    their REAL destinations; see `materialize.mjs`;
 *   - `verifyDrift({tmByLang, targets, scope, memoryTextsByLang,
 *                    recordedSourceTexts})` → the drift guard; see
 *                    `verify-drift.mjs`;
 *   - `sourceLang`, `targets` → the locale set the configuration names;
 *   - `rules`, `usageLabels` → the traversal rules and catalogue labels it built.
 *
 * READS, through those methods, the source-locale content pages and UI
 * dictionary, the target files (seed, the drift guard and a safe materialize
 * only) and the optional language map, all at the paths the configuration states. WRITES nothing
 * itself: `generate` writes staging, `materialize` the real targets, `seedAlign`
 * the coverage report — each at a configured path, and never into the source
 * locale.
 *
 * THIS SITE'S RULES ARE DATA. The denylisted keys and key patterns, the value
 * guards, the identifier strings, the skips inside a parent and the page-level
 * fields come from `adapter.fields`; how a file is walked — as blocks, whole, or
 * by its shape — from `adapter.document`; which pages a target locale has, at
 * which path, under which file name, with or without `lang`, in which key
 * order, and what `materialize` may overwrite, from `adapter.output` and the
 * language map (`createOutputPlan`); the directories, the UI dictionary (flat
 * or nested) and the staging and real destinations from the rest of `adapter`. `extract`, `generate`, seed and the drift guard all share
 * the ONE rule set built here, deliberately: if they disagreed leaf for leaf,
 * the drift guard would report drift that is not there and the memory would
 * fill with keys nothing uses.
 *
 * PAGES AND SECTIONS. `pages()` reads the same per-file walk `extract` folds
 * into the catalogue (`readContentPages`, `readUiEntries`), so a page holds
 * exactly the leaves the catalogue counts, in document order. A page's
 * TOP-LEVEL SECTIONS — where a page above the configured section budget is
 * split — are, for a content file, each object of page-level fields (`seo`) and
 * then each block (`blocks[i]`); for the UI dictionary, the keys that share one
 * prefix before the first dot (`nav`, `footer`, …).
 */

import nodeFs from 'node:fs';
import path from 'node:path';

import { expandLang, jsonContentSettings } from '../../config.mjs';
import { LAYER } from '../../types.mjs';
import { createFieldRules, parsePath } from './fields.mjs';
import { extractContent, readContentPages } from './extract-content.mjs';
import { extractUi, readUiEntries } from './extract-ui.mjs';
import { createOutputPlan, generateContent, readLangMap } from './generate.mjs';
import { generateUiDictionary } from './generate-ui.mjs';
import { seedLocale } from './seed.mjs';
import { materialize } from './materialize.mjs';
import { checkDrift } from './verify-drift.mjs';

/** A label in the catalogue is a forward-slash path, whatever the platform. */
function toPosix(p) {
  return p.split(path.sep).join('/');
}

/** The top-level section of a content leaf: `blocks[i]` for a block's leaf, else the page-level object's key. */
function contentSection(leafPath) {
  const [first, second] = parsePath(leafPath);
  return first === 'blocks' && typeof second === 'number' ? `blocks[${second}]` : String(first);
}

/**
 * Builds the JSON-content adapter for a loaded project.
 *
 * @param {Object} args
 * @param {import('../../config.mjs').Project} args.project  the loaded project.
 * @param {typeof nodeFs} [args.fsImpl]  injectable fs (a test seam).
 * @param {() => string} [args.now]      timestamp generator (a test seam).
 */
export function createJsonContentAdapter({ project, fsImpl = nodeFs, now } = {}) {
  const settings = project.config.adapter;
  if (!settings || settings.kind !== 'json-content') {
    throw new Error(`createJsonContentAdapter: adapter.kind is "${settings && settings.kind}", not "json-content"`);
  }
  const { source: sourceLang, targets } = project.locales;
  const resolved = jsonContentSettings(settings);
  const rules = createFieldRules(settings.fields, resolved.document);
  const nestedUi = resolved.ui.nested;
  const at = (pattern) => project.resolve(pattern);

  const content = {
    sourceDir: expandLang(at(settings.content.source), sourceLang),
    target: at(settings.content.target),
    staging: at(settings.content.staging),
    usageLabel: settings.content.usageLabel
      ? expandLang(settings.content.usageLabel, sourceLang)
      : toPosix(path.relative(project.root, expandLang(at(settings.content.source), sourceLang))),
  };
  const ui = settings.ui
    ? {
        sourceFile: expandLang(at(settings.ui.source), sourceLang),
        target: at(settings.ui.target),
        staging: at(settings.ui.staging),
        usageLabel: settings.ui.usageLabel
          ? expandLang(settings.ui.usageLabel, sourceLang)
          : toPosix(path.relative(project.root, expandLang(at(settings.ui.source), sourceLang))),
      }
    : null;
  const langMapPath = settings.langMap ? at(settings.langMap) : null;
  const loadLangMap = () => readLangMap({ langMapPath, fsImpl });
  const planFor = (langMap) => createOutputPlan({ sourceLang, langMap, output: resolved.output });

  const generateArgs = () => {
    const langMap = loadLangMap();
    return { rules, sourceLang, contentDir: content.sourceDir, langMap, plan: planFor(langMap), fsImpl };
  };
  const pick = (requested) => (requested && requested.length ? requested : targets);

  return {
    kind: 'json-content',
    sourceLang,
    targets: [...targets],
    rules,
    /** The resolved document, output and UI settings (`jsonContentSettings`). */
    settings: resolved,
    /** The labels catalogue usages carry: the content prefix and the UI dictionary's label. */
    usageLabels: { content: content.usageLabel, ui: ui ? ui.usageLabel : null },

    /**
     * The UNIFIED source catalogue: page-content units and UI-dictionary units in
     * one map. A UI string that is byte-identical to a content string collapses
     * onto a single unit with both usages recorded, so the site pays for
     * translating it once — that site-wide deduplication is a property of the hash
     * key, not a special case here.
     */
    extract() {
      const pages = extractContent({
        rules,
        contentDir: content.sourceDir,
        sourceLang,
        fileLabelDir: content.usageLabel,
        fsImpl,
        ...(now ? { now } : {}),
      });
      const units = { ...pages.units };
      if (ui) {
        const uiUnits = extractUi({ dictPath: ui.sourceFile, fileLabel: ui.usageLabel, nested: nestedUi, fsImpl });
        for (const key of Object.keys(uiUnits)) {
          const uiUnit = uiUnits[key];
          const existing = units[key];
          if (!existing) {
            units[key] = uiUnit;
          } else {
            existing.usages.push(...uiUnit.usages);
            // If any occurrence is HTML the unit is HTML, so the translator is
            // told to preserve markup rather than escaping it.
            if (uiUnit.format === 'html') existing.format = 'html';
          }
        }
      }
      return { generated_at: pages.generated_at, source_lang: pages.source_lang, units };
    },

    /**
     * The ordered pages: each content file in name order, then the UI
     * dictionary. Each segment carries its key, normalized source, format,
     * advisory context and top-level section. A page with no translatable leaf
     * is omitted.
     *
     * @returns {import('../../types.mjs').Page[]}
     */
    pages() {
      const out = [];
      for (const { file, leaves } of readContentPages({
        rules,
        contentDir: content.sourceDir,
        fileLabelDir: content.usageLabel,
        fsImpl,
      })) {
        if (leaves.length === 0) continue;
        out.push({
          id: file,
          segments: leaves.map((leaf) => ({
            key: leaf.key,
            source: leaf.source,
            format: leaf.format,
            context: leaf.context,
            section: contentSection(leaf.path),
          })),
        });
      }
      if (ui) {
        const entries = readUiEntries({ dictPath: ui.sourceFile, nested: nestedUi, fsImpl });
        if (entries.length > 0) {
          out.push({
            id: ui.usageLabel,
            segments: entries.map((entry) => ({
              key: entry.key,
              source: entry.source,
              format: 'text',
              context: `ui:${entry.dictKey}`,
              section: String(parsePath(entry.dictKey)[0] ?? entry.dictKey),
            })),
          });
        }
      }
      return out;
    },

    /**
     * Regenerates every target artifact from source + memory into the STAGING
     * area: the page content files and the UI dictionary. The real destinations
     * are written only by `materialize`, which is what keeps a routine run from
     * overwriting committed content by accident.
     */
    generate({ tmByLang, targets: requested } = {}) {
      const langs = pick(requested);
      const args = generateArgs();
      const pages = generateContent({ ...args, tmByLang, targets: langs, outDir: content.staging });
      const dict = ui
        ? generateUiDictionary({ tmByLang, targets: langs, dictPath: ui.sourceFile, nested: nestedUi, serialize: args.plan.serialize, outFile: ui.staging, fsImpl })
        : { files: {}, written: [], warnings: [] };
      return {
        files: pages.files,
        written: [...pages.written, ...dict.written],
        skipped: pages.skipped,
        unpaired: pages.unpaired,
        warnings: [...pages.warnings, ...dict.warnings],
        uiFiles: dict.files,
      };
    },

    /**
     * The hook `engine.seed()` calls: for each requested target locale, reads the
     * real files and that locale's HUMAN layer, aligns, writes the coverage
     * report beside the memory, and returns the entries for the engine to
     * persist. The report holds one locale, so seeding more than one target in a
     * single run is refused rather than overwriting one report with another.
     */
    seedAlign({ store, targets: requested } = {}) {
      const langs = pick(requested);
      if (langs.length !== 1) {
        throw new Error(
          `seed: one target locale per run (the coverage report covers one); ` +
            `pass --targets <lang> (configured targets: ${langs.join(', ')}).`
        );
      }
      const [lang] = langs;
      const langMap = loadLangMap();
      return seedLocale({
        rules,
        sourceLang,
        lang,
        langMap,
        plan: planFor(langMap),
        nestedUi,
        sourceContentDir: content.sourceDir,
        targetContentDir: expandLang(content.target, lang),
        sourceDictPath: ui ? ui.sourceFile : null,
        targetDictPath: ui ? expandLang(ui.target, lang) : null,
        existingTM: store.readLayer(LAYER.HUMAN, lang),
        reportPath: store.paths.seedReport,
        fsImpl,
        ...(now ? { now } : {}),
      });
    },

    /**
     * Writes the targets to their real destinations, under the configured
     * policy (`adapter.output.materialize`); see `materialize.mjs`. The safe
     * policy classifies the files on disk against the known texts the caller
     * reads from the store, as the drift guard does.
     */
    materialize({
      tmByLang,
      targets: requested,
      content: wantContent = true,
      ui: wantUi = true,
      memoryTextsByLang = {},
      recordedSourceTexts = [],
      log,
    } = {}) {
      return materialize({
        generateArgs: generateArgs(),
        tmByLang,
        targets: pick(requested),
        contentTarget: content.target,
        uiDictPath: ui ? ui.sourceFile : null,
        uiTarget: ui ? ui.target : null,
        nestedUi,
        policy: resolved.output.materialize,
        memoryTextsByLang,
        recordedSourceTexts,
        content: wantContent,
        ui: wantUi,
        ...(log ? { log } : {}),
      });
    },

    /**
     * The drift guard: regenerates in memory and classifies every leaf of the
     * targets on disk — the real destinations (`scope: 'real'`) or the staging
     * copy (`scope: 'staging'`) — as passing, stale or hand-edited, against the
     * known texts the caller reads from the store.
     */
    verifyDrift({ tmByLang, targets: requested, scope = 'real', memoryTextsByLang = {}, recordedSourceTexts = [] } = {}) {
      if (scope !== 'real' && scope !== 'staging') {
        throw new Error(`verify-drift: unknown scope "${scope}"; expected real or staging.`);
      }
      const staging = scope === 'staging';
      return checkDrift({
        ...generateArgs(),
        tmByLang,
        memoryTextsByLang,
        recordedSourceTexts,
        targets: pick(requested),
        uiDictPath: ui ? ui.sourceFile : null,
        currentContentDir: staging ? content.staging : content.target,
        currentUiFile: ui ? (staging ? ui.staging : ui.target) : null,
        nestedUi,
        root: project.root,
      });
    },
  };
}

export default { createJsonContentAdapter };
