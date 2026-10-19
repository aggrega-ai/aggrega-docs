/**
 * generate-ui.mjs — Regenerates a target-locale UI dictionary (`en.json`, for
 * instance) from the source locale plus the translation memory.
 *
 * READS the source-locale UI dictionary and a translation memory held in memory.
 * WRITES one file per target locale at `outFile`, a per-locale pattern
 * (`…/{lang}.json`) the caller resolves from the configuration: the adapter
 * passes the STAGING pattern for a routine generate and the real target pattern
 * only for `materialize`, so a routine run cannot overwrite a committed
 * dictionary by accident. With `outFile: null` it writes nothing and only
 * returns the generated objects, which is what the drift guard and the tests
 * use.
 *
 * For each target locale, for each entry of the source dictionary — a top-level
 * string, or with `adapter.ui.nested` a string at any depth — it replaces the
 * value with `TM[lang][keyOf(source)].text`, FALLING BACK to the source text
 * when the memory has no entry — the same rule `generate.mjs` applies to page
 * content. The dictionary's own keys (`nav.backToTop`, …) are NEVER translated:
 * they are identifiers.
 */

import nodeFs from 'node:fs';
import path from 'node:path';

import { keyOf } from '../../normalize.mjs';
import { stableStringify } from '../../store.mjs';
import { expandLang } from '../../config.mjs';
import { dictionaryStrings } from './extract-ui.mjs';

/** Sets `value` at the path `tokens` of `obj`, whose containers exist: the tokens come from a walk of the same value. */
function setAtTokens(obj, tokens, value) {
  let node = obj;
  for (const token of tokens.slice(0, -1)) node = node[token];
  node[tokens[tokens.length - 1]] = value;
}

/**
 * Generates the target-locale UI dictionaries.
 *
 * @param {Object} args
 * @param {Object} args.tmByLang       `{ [lang]: TM }`, TM being `{ key: {text,…} }`.
 * @param {string[]} args.targets      target locales.
 * @param {Object} [args.sourceDict]   the source dictionary already read (a test seam).
 * @param {string} [args.dictPath]     path of the source dictionary when `sourceDict` is absent.
 * @param {boolean} [args.nested]      a nested dictionary (`adapter.ui.nested`).
 * @param {(value:Object)=>string} [args.serialize]  the bytes a dictionary is written with (default: keys sorted).
 * @param {string|null} [args.outFile] the per-locale write pattern (`…/{lang}.json`); null writes nothing.
 * @param {typeof nodeFs} [args.fsImpl]
 * @returns {{files:Object, written:string[], fallbacks:Object.<string, number>, warnings:string[]}}
 *          `files` and `fallbacks` are `{ [lang]: … }`; `fallbacks` counts the entries that kept their source text.
 */
export function generateUiDictionary({
  tmByLang = {},
  targets,
  sourceDict = null,
  dictPath,
  nested = false,
  serialize = stableStringify,
  outFile = null,
  fsImpl = nodeFs,
}) {
  const fs = fsImpl;
  const dict = sourceDict || JSON.parse(fs.readFileSync(dictPath, 'utf8'));

  const files = {};
  const fallbacks = {};
  const written = [];
  const warnings = [];

  for (const lang of targets) {
    const tm = tmByLang[lang] || {};
    // Every non-string value is copied as it is; each string entry is replaced.
    const out = JSON.parse(JSON.stringify(dict));
    let missed = 0;
    for (const { dictKey, tokens, value } of dictionaryStrings(dict, nested)) {
      const key = keyOf(value);
      const entry = tm[key];
      setAtTokens(out, tokens, entry && typeof entry.text === 'string' ? entry.text : value);
      if (!entry) {
        missed += 1;
        warnings.push(`TM miss [${lang}] key=${key} @ ui-dictionary ${dictKey}`);
      }
    }
    files[lang] = out;
    fallbacks[lang] = missed;

    if (outFile) {
      const abs = expandLang(outFile, lang);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, serialize(out), 'utf8');
      written.push(abs);
    }
  }

  return { files, written, fallbacks, warnings };
}

export default { generateUiDictionary };
