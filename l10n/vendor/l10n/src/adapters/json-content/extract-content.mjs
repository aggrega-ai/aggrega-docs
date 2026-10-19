/**
 * extract-content.mjs — Extraction of the source catalog from the source-locale
 * content pages.
 *
 * READS every `*.json` file in the source-locale content directory it is given.
 * WRITES nothing at all: persisting the catalog and the source map is
 * `engine.extract()`'s job, not this module's.
 *
 * For each translatable leaf — the rules are the caller's, built by
 * `createFieldRules` in `fields.mjs` — it produces a source unit keyed by
 * `keyOf(value)` and deduplicated site-wide: identical strings collapse onto a
 * single unit carrying several `usages` (`{file, path}`). The `format` and an
 * advisory `context` are carried along.
 *
 * It returns the catalog in the shape the engine expects:
 *   { generated_at, source_lang, units: { <key>: { source, format, context?,
 *     usages: [...] } } }
 *
 * The walk itself is `readContentPages`: each content file in name order, its
 * translatable leaves in document order. `extractContent` folds it into the
 * catalogue and the adapter's `pages()` view reads it as pages, so the two can
 * never disagree on what a page holds.
 */

import nodeFs from 'node:fs';
import path from 'node:path';

import { keyOf, normalize } from '../../normalize.mjs';

/**
 * Reads every source-locale content file as an ordered list of its translatable
 * leaves, each with its key.
 *
 * @param {Object} opts
 * @param {import('./fields.mjs').FieldRules} opts.rules
 * @param {string} opts.contentDir     the source-locale content directory (absolute).
 * @param {string} opts.fileLabelDir   the logical prefix of each file's label.
 * @param {typeof nodeFs} [opts.fsImpl]
 * @returns {Array<{file:string, leaves:Array<{key:string, source:string, format:'text'|'html', path:string, context:string}>}>}
 *          per file, in name order: its label (`<fileLabelDir>/<file name>`) and its leaves in document order.
 */
export function readContentPages({ rules, contentDir, fileLabelDir, fsImpl = nodeFs }) {
  const fs = fsImpl;
  const files = fs
    .readdirSync(contentDir)
    .filter((n) => n.endsWith('.json'))
    .sort();
  const pages = [];
  for (const name of files) {
    const raw = fs.readFileSync(path.join(contentDir, name), 'utf8');
    if (!raw || !raw.trim()) continue;
    const page = JSON.parse(raw);
    const leaves = rules.translatableLeaves(page).map((leaf) => {
      const source = normalize(leaf.value);
      return { key: keyOf(source), source, format: leaf.format, path: leaf.path, context: leaf.context };
    });
    pages.push({ file: `${fileLabelDir}/${name}`, leaves });
  }
  return pages;
}

/**
 * Extracts the source catalog.
 *
 * @param {Object} opts
 * @param {import('./fields.mjs').FieldRules} opts.rules  the traversal rules.
 * @param {string} opts.contentDir     the source-locale content directory (absolute).
 * @param {string} opts.sourceLang     the source locale code, recorded as `source_lang`.
 * @param {string} opts.fileLabelDir   the logical prefix for `usages[].file`
 *                                     (`<fileLabelDir>/<file name>`).
 * @param {typeof nodeFs} [opts.fsImpl] injectable fs (a test seam).
 * @param {() => string} [opts.now]     timestamp generator (a test seam).
 * @returns {{generated_at:string, source_lang:string, units:Object}}
 */
export function extractContent({
  rules,
  contentDir,
  sourceLang,
  fileLabelDir,
  fsImpl = nodeFs,
  now = () => new Date().toISOString(),
}) {
  const units = {};

  for (const { file, leaves } of readContentPages({ rules, contentDir, fileLabelDir, fsImpl })) {
    for (const leaf of leaves) {
      const { key, source } = leaf;
      const usage = { file, path: leaf.path };

      const existing = units[key];
      if (!existing) {
        const unit = { source, format: leaf.format, usages: [usage] };
        if (leaf.context) unit.context = leaf.context;
        units[key] = unit;
      } else {
        existing.usages.push(usage);
        // If any occurrence is HTML the unit is HTML, so markup is preserved.
        if (leaf.format === 'html') existing.format = 'html';
        // The context is advisory, so the first one encountered is kept.
      }
    }
  }

  return { generated_at: now(), source_lang: sourceLang, units };
}

export default { extractContent, readContentPages };
