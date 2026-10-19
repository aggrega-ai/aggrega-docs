/**
 * generate.mjs — Rewrites the target-locale content artifacts from source + TM.
 *
 * READS the source-locale pages (every `*.json` in the content directory it is
 * given) and a translation memory held in memory, plus — through `readLangMap` —
 * the optional slug-override map. WRITES one file per source page per target
 * locale into `outDir`, a per-locale pattern (`…/{lang}`) the caller resolves
 * from the configuration: the adapter passes the STAGING pattern for a routine
 * generate and the real target pattern only for `materialize`. With
 * `outDir: null` it writes nothing and only returns the generated objects, which
 * is what the drift guard and the tests use.
 *
 * For each target locale and each source page the OUTPUT PLAN pairs with it
 * (`createOutputPlan`, from `adapter.output` and the language map), it
 * deep-copies the source page, sets its `path` and `lang` as the plan says, and
 * replaces every translatable leaf (the same rules `extract` uses) with
 * `TM[lang][keyOf(source)].text`, falling back to the source text when the
 * memory has no entry. A missing entry is a warning rather than an error, so a
 * partially translated locale still generates; each file's count of such
 * leaves is returned, which is what `materialize`'s safe policy reads. The file
 * is written under the name the plan gives it, its keys sorted or in the source
 * file's order.
 *
 * THE PATH IS DERIVED, NOT MAPPED. By default a target page lives under a
 * locale prefix: `/servizi/` becomes `/en/servizi/` (`output.path: "prefixed"`);
 * a site that composes the prefix itself keeps the source path
 * (`"neutral"`). Either is a pure function of the source path and the locale,
 * so adding a page costs nothing here. A language map may still name a page's
 * path in a locale, for a translated slug, and with `output.pairs: "langMap"`
 * it also decides which pages a locale has at all: an unpaired page is not
 * generated. A file with no string `path` (a document walked whole) gets none.
 *
 * A page's slug is never machine-translated. It is either derived as above or
 * stated explicitly in the language map.
 */

import nodeFs from 'node:fs';
import path from 'node:path';

import { keyOf } from '../../normalize.mjs';
import { stableStringify } from '../../store.mjs';
import { expandLang } from '../../config.mjs';
import { setAtPath } from './fields.mjs';

/**
 * Reads the optional language map. No path, or a missing file, yields no
 * pairs, which is the normal case; an unreadable one is an error worth
 * surfacing rather than swallowing, because a map that exists is presumed to be
 * load-bearing.
 *
 * @param {Object} [args]
 * @param {string|null} [args.langMapPath]  absolute path of the map, or null.
 * @param {typeof nodeFs} [args.fsImpl]
 */
export function readLangMap({ langMapPath = null, fsImpl = nodeFs } = {}) {
  if (!langMapPath || !fsImpl.existsSync(langMapPath)) return null;
  return JSON.parse(fsImpl.readFileSync(langMapPath, 'utf8'));
}

/** The pair of the language map naming `sourcePath` under the source locale and a path in `lang`, or null. */
function pairFor(sourcePath, lang, langMap, sourceLang) {
  const pairs = (langMap && Array.isArray(langMap.pairs) && langMap.pairs) || [];
  for (const pair of pairs) {
    if (pair && pair[sourceLang] === sourcePath && typeof pair[lang] === 'string') return pair;
  }
  return null;
}

/**
 * The target path for a source path in a locale: the language map's pair when
 * it carries one; otherwise, under the `prefixed` strategy (the default), the
 * source path under the locale prefix, and under the `neutral` strategy the
 * source path unchanged.
 *
 * @param {string} sourcePath  the source page's `path` (leading slash).
 * @param {string} lang        target locale code.
 * @param {Object|null} langMap  `{ pairs: [{ <source>: '/a/', <lang>: '/b/' }] }` or null.
 * @param {string} sourceLang  the source locale code, the key a pair's source path sits under.
 * @param {{path?: 'prefixed'|'neutral'}} [strategy]
 * @returns {string}
 */
export function targetPath(sourcePath, lang, langMap, sourceLang, { path: strategy = 'prefixed' } = {}) {
  const pair = pairFor(sourcePath, lang, langMap, sourceLang);
  if (pair) return pair[lang];
  if (strategy === 'neutral') return sourcePath;
  const rest = sourcePath.startsWith('/') ? sourcePath : `/${sourcePath}`;
  return rest === '/' ? `/${lang}/` : `/${lang}${rest}`;
}

/** The file name of a page whose target path is `/`, under `output.fileName: "path"`. */
export const ROOT_FILE_NAME = 'index.json';

/** A target path as a file name: outer slashes removed, every other `/` written `-`, `/` itself `index.json`. */
export function fileNameOfPath(targetPathValue) {
  const trimmed = String(targetPathValue).replace(/^\/+|\/+$/g, '');
  return trimmed === '' ? ROOT_FILE_NAME : `${trimmed.replace(/\/+/g, '-')}.json`;
}

/**
 * The output plan: which source pages have a page in a target locale, at which
 * path and under which file name, with which `lang` and in which key order —
 * the one statement of it that generation, materialization, the drift guard and
 * seeding all read, so they cannot disagree on what a target file is.
 *
 * @param {Object} args
 * @param {string} args.sourceLang
 * @param {Object|null} [args.langMap]
 * @param {Object} [args.output]  the resolved `adapter.output` (`jsonContentSettings`).
 */
export function createOutputPlan({ sourceLang, langMap = null, output = {} }) {
  const settings = {
    path: output.path || 'prefixed',
    langField: output.langField !== false,
    keyOrder: output.keyOrder || 'sorted',
    pairs: output.pairs || 'all',
    fileName: output.fileName || 'source',
  };
  if (settings.pairs === 'langMap' && !langMap) {
    throw new Error('output.pairs is "langMap" but the language map is missing: no page can be paired.');
  }
  const hasPath = (page) => Boolean(page) && typeof page.path === 'string';

  /** Whether a source page has a page in `lang`. */
  function paired(page, lang) {
    if (settings.pairs === 'all') return true;
    return hasPath(page) && pairFor(page.path, lang, langMap, sourceLang) !== null;
  }

  /** The target page's `path` in `lang`, or undefined for a page with no string `path`. */
  function pathFor(page, lang) {
    return hasPath(page) ? targetPath(page.path, lang, langMap, sourceLang, { path: settings.path }) : undefined;
  }

  /** The target file name of the source file `name` holding `page`, in `lang`. */
  function fileFor(name, page, lang) {
    if (settings.fileName === 'path' && hasPath(page)) return fileNameOfPath(pathFor(page, lang));
    return name;
  }

  /** The target page of a source page in `lang`: a copy, its `path` and `lang` set as the plan says. Leaves are not translated here. */
  function shape(page, lang) {
    const copy = JSON.parse(JSON.stringify(page));
    if (hasPath(page)) copy.path = pathFor(page, lang);
    const object = copy !== null && typeof copy === 'object' && !Array.isArray(copy);
    if (object && (settings.langField || 'lang' in copy)) copy.lang = lang;
    return copy;
  }

  /** The bytes a generated file is written with. */
  function serialize(value) {
    return settings.keyOrder === 'source' ? `${JSON.stringify(value, null, 2)}\n` : stableStringify(value);
  }

  return { settings, langMap, paired, pathFor, fileFor, shape, serialize };
}

/**
 * Reads the source-locale pages from a directory (read-only).
 * @returns {Array<{name:string, page:Object}>}
 */
export function readSourcePages(contentDir, fs = nodeFs) {
  return fs
    .readdirSync(contentDir)
    .filter((n) => n.endsWith('.json'))
    .sort()
    .map((name) => {
      const raw = fs.readFileSync(path.join(contentDir, name), 'utf8');
      return { name, page: JSON.parse(raw) };
    });
}

/**
 * Generates the target-locale content artifacts.
 *
 * @param {Object} args
 * @param {import('./fields.mjs').FieldRules} args.rules  the traversal rules.
 * @param {string} args.sourceLang    the source locale code.
 * @param {Object} args.tmByLang      `{ [lang]: TM }`, TM being `{ key: {text,…} }`.
 * @param {string[]} args.targets     target locales.
 * @param {Object|null} [args.langMap] the language map; null derives every path.
 * @param {ReturnType<typeof createOutputPlan>} [args.plan]  the output plan (default: every page, prefixed, sorted, source names).
 * @param {Array}  [args.sourcePages] source pages already read, `[{name,page}]` (test seam).
 * @param {string} [args.contentDir]  source directory, read when `sourcePages` is absent.
 * @param {string|null} [args.outDir] the per-locale write pattern (`…/{lang}`); null writes nothing.
 * @param {typeof nodeFs} [args.fsImpl]
 * @returns {{files:Object, written:string[], skipped:number, unpaired:string[], fallbacks:Object.<string, number>, warnings:string[]}}
 *          `files` and `fallbacks` are keyed `<lang>/<target file name>`; `fallbacks` counts the leaves
 *          that kept their source text; `unpaired` lists `<lang>/<source file name>` of each page not generated.
 */
export function generateContent({
  rules,
  sourceLang,
  tmByLang = {},
  targets,
  langMap = null,
  plan = null,
  sourcePages = null,
  contentDir,
  outDir = null,
  fsImpl = nodeFs,
}) {
  const fs = fsImpl;
  const pages = sourcePages || readSourcePages(contentDir, fs);
  const output = plan || createOutputPlan({ sourceLang, langMap });

  const files = {};
  const fallbacks = {};
  const written = [];
  const warnings = [];
  const unpaired = [];

  for (const lang of targets) {
    const tm = tmByLang[lang] || {};
    const from = new Map();

    for (const { name, page } of pages) {
      if (!output.paired(page, lang)) {
        unpaired.push(`${lang}/${name}`);
        continue;
      }
      const copy = output.shape(page, lang);
      let missed = 0;

      for (const leaf of rules.translatableLeaves(page)) {
        const key = keyOf(leaf.value);
        const entry = tm[key];
        const text = entry && typeof entry.text === 'string' ? entry.text : leaf.value;
        if (!entry) {
          missed += 1;
          warnings.push(`TM miss [${lang}] key=${key} @ ${name} ${leaf.path}`);
        }
        setAtPath(copy, leaf.path, text);
      }

      const outName = output.fileFor(name, page, lang);
      if (from.has(outName)) {
        throw new Error(`generate: ${name} and ${from.get(outName)} would both be written as ${lang}/${outName}; give one of them another path or pair.`);
      }
      from.set(outName, name);
      const rel = `${lang}/${outName}`;
      files[rel] = copy;
      fallbacks[rel] = missed;

      if (outDir) {
        const abs = path.join(expandLang(outDir, lang), outName);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, output.serialize(copy), 'utf8');
        written.push(abs);
      }
    }
  }

  return { files, written, skipped: unpaired.length, unpaired, fallbacks, warnings };
}

export default { generateContent, targetPath, readLangMap, readSourcePages, createOutputPlan, fileNameOfPath, ROOT_FILE_NAME };
