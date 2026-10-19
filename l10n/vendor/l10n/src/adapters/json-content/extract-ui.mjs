/**
 * extract-ui.mjs — Extraction of source units from the source-locale UI dictionary.
 *
 * READS the source-locale UI dictionary file it is given and WRITES nothing.
 * Merging these units with the content ones into the unified catalog is the
 * adapter's `extract` (`index.mjs`).
 *
 * Chrome strings live in that dictionary as stable key → source text, rather
 * than hard-coded in a component where the pipeline could not see them. This
 * module turns them into source units for the engine's unified catalog with the
 * SAME mechanics as page content (`keyOf(normalize(text))`, `usages`, `format`),
 * so a UI string passes through the same translation memory.
 *
 * `usages[].file` is the dictionary's label and `usages[].path` is the stable
 * dictionary key (`nav.backToTop`, say), which is what tells `generate` where to
 * write the target value. A flat dictionary's entries are its top-level string
 * values; a nested one's (`adapter.ui.nested`) every string at any depth, its
 * key being its path (`menu.home`). UI strings are always `format:'text'`: plain labels,
 * no markup.
 */

import nodeFs from 'node:fs';

import { keyOf, normalize } from '../../normalize.mjs';
import { stringifyPath } from './fields.mjs';

/**
 * The string entries of a dictionary value, in key order: for a flat dictionary
 * its top-level string values, keyed by their own key; for a nested one every
 * string at any depth of its objects and lists, keyed by its path
 * (`menu.home`, `voci[0]`), with the path's tokens.
 *
 * @param {Object} dict
 * @param {boolean} [nested]
 * @returns {Array<{dictKey:string, tokens:(string|number)[], value:string}>}
 */
export function dictionaryStrings(dict, nested = false) {
  const out = [];
  if (!dict || typeof dict !== 'object') return out;
  if (!nested) {
    for (const dictKey of Object.keys(dict)) {
      if (typeof dict[dictKey] === 'string') out.push({ dictKey, tokens: [dictKey], value: dict[dictKey] });
    }
    return out;
  }
  const walk = (node, tokens) => {
    if (typeof node === 'string') out.push({ dictKey: stringifyPath(tokens), tokens, value: node });
    else if (Array.isArray(node)) node.forEach((el, i) => walk(el, [...tokens, i]));
    else if (node && typeof node === 'object') for (const key of Object.keys(node)) walk(node[key], [...tokens, key]);
  };
  walk(dict, []);
  return out;
}

/** Reads a dictionary file; an empty file is an empty dictionary. */
function readDict(dictPath, fsImpl) {
  const raw = fsImpl.readFileSync(dictPath, 'utf8');
  return raw && raw.trim() ? JSON.parse(raw) : {};
}

/**
 * Reads the source-locale UI dictionary as an ordered list of its translatable
 * entries, in the file's key order: the one walk `extractUi` folds into units and
 * the adapter's `pages()` view reads as a page.
 *
 * @param {Object} opts
 * @param {string} opts.dictPath     path of the source dictionary (absolute).
 * @param {boolean} [opts.nested]    a nested dictionary (`adapter.ui.nested`).
 * @param {typeof nodeFs} [opts.fsImpl]
 * @returns {Array<{dictKey:string, key:string, source:string}>}
 */
export function readUiEntries({ dictPath, nested = false, fsImpl = nodeFs }) {
  const entries = [];
  for (const { dictKey, value } of dictionaryStrings(readDict(dictPath, fsImpl), nested)) {
    const source = normalize(value);
    if (source === '') continue;
    entries.push({ dictKey, key: keyOf(source), source });
  }
  return entries;
}

/**
 * Extracts the source units from the source-locale UI dictionary.
 *
 * @param {Object} opts
 * @param {string} opts.dictPath     path of the source dictionary (absolute).
 * @param {string} opts.fileLabel    the logical label for `usages[].file`.
 * @param {boolean} [opts.nested]    a nested dictionary (`adapter.ui.nested`).
 * @param {typeof nodeFs} [opts.fsImpl] injectable fs (a test seam).
 * @returns {Object.<string, {source:string, format:'text', usages:Array<{file:string, path:string}>}>}
 *          A `key → unit` map, deduplicated: two different dictionary keys
 *          holding the same text collapse onto one unit with several `usages`.
 */
export function extractUi({ dictPath, fileLabel, nested = false, fsImpl = nodeFs }) {
  const units = {};
  for (const { dictKey, key, source } of readUiEntries({ dictPath, nested, fsImpl })) {
    const usage = { file: fileLabel, path: dictKey };

    const existing = units[key];
    if (!existing) {
      units[key] = { source, format: 'text', usages: [usage] };
    } else {
      existing.usages.push(usage);
    }
  }
  return units;
}

export default { extractUi, readUiEntries, dictionaryStrings };
