/**
 * fields.mjs — The single definition of "what is translatable" in a JSON content
 * page, parameterized by the project's rules.
 *
 * READS nothing and WRITES nothing — pure functions over the page objects and the
 * rules their caller supplies.
 *
 * Used by BOTH extraction AND generation (and by seeding), deliberately: they have
 * to agree leaf for leaf, or the drift guard turns noisy and the translation
 * memory fills with keys nothing uses. One canonical traversal of a content page
 * lives here and nowhere else, and the adapter builds ONE rule set from the
 * configuration and hands that same object to every caller.
 *
 * THE CONTENT MODEL is a block-composed page: `{ path, template, <page fields>,
 * blocks: [{ name, data }] }`. The walk descends only into each `block.data` and
 * into the configured page-level fields, so `block.name`, `block.id`,
 * `page.path` and `page.template` are never traversed — and a `name` key found
 * INSIDE `data` (an item label in a list block, say) is content and stays
 * translatable. With `document.walk` set to `whole`, or to `auto` for a file
 * that holds no `blocks` array, the file is walked whole instead: every key,
 * under the same rules, its leaf paths relative to the file and its leaves'
 * context named by the value of `document.contextKey`.
 *
 * THE MODEL IS A DENYLIST TRAVERSAL, and the direction matters: a string leaf is
 * translatable BY DEFAULT and has to be excluded, rather than opted in. A new
 * block with a new text field is therefore translated the day it is added, with
 * no edit to the rules — while the opposite default would silently ship an
 * untranslated field and report nothing. A leaf is excluded only by:
 *
 *   (a) a DENYLISTED KEY (`denylistKeys`, matched case-insensitively, or a
 *       `denylistKeyPatterns` entry, `_*` say) — a key whose whole subtree
 *       carries assets, markers or configuration tokens, never human text;
 *   (b) a VALUE GUARD (`valueGuards`) — an empty string always; a value beginning
 *       with one of `refPrefixes` (a path, URL or anchor); a value ending in one of
 *       `assetExtensions` (optionally followed by a query string); a bare number
 *       when `excludeNumbers`; `true`/`false` when `excludeBooleans`;
 *   (c) an IDENTIFIER STRING (`identifierStrings`) — a string under a key whose
 *       strings are identifiers while its objects are content: as the key's own
 *       value (`where: "value"`), as an element of its list (`"list"`), or both
 *       (`"any"`);
 *   (d) a SKIP IN A PARENT (`skipInParent`) — the string value of a key inside a
 *       parent object the rule describes by the key it sits under
 *       (`parentKey`), the keys it holds (`parentHas`) or the only keys it may
 *       hold (`parentOnly`), so the same key elsewhere stays content.
 *
 * PAGE-LEVEL FIELDS (`pageFields`, `{ <object key>: [<field>, …] }`) are a strict
 * allowlist: only the named fields of the named sibling objects of `blocks` are
 * extracted, before the blocks.
 *
 * Do-not-translate terms are held verbatim by the translation backend from the
 * glossary, never filtered out here: filtering at extraction would lose the
 * string's position and leave the target file with a hole.
 */

/** A bare number, with either `.` or `,` as the decimal separator. */
const PURE_NUMBER_RE = /^[+-]?\d+([.,]\d+)?$/;
/** A boolean written as a string. */
const BOOL_RE = /^(true|false)$/i;
/** HTML-markup detector: an opening tag such as `<p`, `<strong>` or `<a …>`. */
const HTML_TAG_RE = /<[a-z][\s\S]*?>/i;

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The format of a leaf: `'html'` when the key is `html` OR when the value
 * contains an HTML tag; `'text'` otherwise.
 */
export function detectFormat(key, value) {
  if (String(key).toLowerCase() === 'html') return 'html';
  if (typeof value === 'string' && HTML_TAG_RE.test(value)) return 'html';
  return 'text';
}

// -- Path accessor: parse / stringify / get / set ------------------------------
//
// A path is a precise, readable accessor such as
// `blocks[3].data.sections[0].heading`, `seo.title`, or
// `blocks[2].data.sections[1].paragraphs[0]`.
// Tokenization: segments separated by `.`; each segment is a key optionally
// followed by one or more `[n]` indices.

/** Parses a path string into an array of tokens: a string is a key, a number an index. */
export function parsePath(pathStr) {
  const tokens = [];
  for (const segment of String(pathStr).split('.')) {
    if (segment === '') continue;
    const braceIdx = segment.indexOf('[');
    const key = braceIdx === -1 ? segment : segment.slice(0, braceIdx);
    if (key !== '') tokens.push(key);
    if (braceIdx !== -1) {
      const rest = segment.slice(braceIdx);
      const re = /\[(\d+)\]/g;
      let m;
      while ((m = re.exec(rest)) !== null) tokens.push(Number(m[1]));
    }
  }
  return tokens;
}

/** Recomposes an array of tokens into the canonical path string. */
export function stringifyPath(tokens) {
  let out = '';
  for (const tok of tokens) {
    if (typeof tok === 'number') out += `[${tok}]`;
    else out += out === '' ? tok : `.${tok}`;
  }
  return out;
}

/** Reads the value at the accessor `pathStr` on `obj`; undefined when absent. */
export function getAtPath(obj, pathStr) {
  let node = obj;
  for (const tok of parsePath(pathStr)) {
    if (node == null) return undefined;
    node = node[tok];
  }
  return node;
}

/**
 * Sets `value` at the accessor `pathStr` on `obj`. It MUTATES `obj`, so call it
 * on a deep copy. It never invents missing structure: the paths come from a real
 * traversal of the very same page, so an absent container is a bug rather than a
 * case to paper over, and it throws.
 */
export function setAtPath(obj, pathStr, value) {
  const tokens = parsePath(pathStr);
  if (tokens.length === 0) return obj;
  let node = obj;
  for (let i = 0; i < tokens.length - 1; i++) {
    node = node[tokens[i]];
    if (node == null) {
      throw new Error(`setAtPath: missing container at "${tokens.slice(0, i + 1).join('.')}" for path "${pathStr}"`);
    }
  }
  node[tokens[tokens.length - 1]] = value;
  return obj;
}

// -- The rules and the translatable traversal ---------------------------------

/** The context name of a file walked whole when it carries no `document.contextKey` value. */
export const WHOLE_DOCUMENT_CONTEXT = 'document';

/** A key pattern (`*` any run, `?` one character) as a case-insensitive whole-key regular expression. */
function patternRegExp(pattern) {
  const body = String(pattern)
    .split('')
    .map((ch) => (ch === '*' ? '.*' : ch === '?' ? '.' : escapeRegExp(ch)))
    .join('');
  return new RegExp(`^${body}$`, 'i');
}

const lower = (list) => new Set((list || []).map((k) => String(k).toLowerCase()));

/**
 * The traversal rules, built from the configuration's `adapter.fields` and
 * `adapter.document`.
 *
 * @typedef {Object} FieldRules
 * @property {Set<string>} denylist                   the denylisted keys, lowercased.
 * @property {Object.<string, string[]>} pageFields   the page-level allowlist.
 * @property {string} walk                            `blocks`, `whole` or `auto`.
 * @property {(key:string)=>boolean} isDenylistedKey
 * @property {(key:string)=>boolean} isPatternKey     true when a `denylistKeyPatterns` entry matches the key.
 * @property {(value:*)=>boolean} isTranslatableValue
 * @property {(page:Object)=>boolean} isBlockPage     true when the page is walked as a block-composed page.
 * @property {(page:Object)=>Array<{value:string, format:'text'|'html', path:string, context:string}>} translatableLeaves
 */

/**
 * Builds the traversal rules.
 *
 * @param {Object} fields  `{ denylistKeys, pageFields, valueGuards: { refPrefixes,
 *                         assetExtensions, excludeNumbers, excludeBooleans },
 *                         denylistKeyPatterns?, identifierStrings?, skipInParent? }`,
 *                         as the configuration schema validates it.
 * @param {Object} [document]  `{ walk?, contextKey? }`: how a file is walked (default `blocks`).
 * @returns {FieldRules}
 */
export function createFieldRules(
  { denylistKeys, pageFields, valueGuards, denylistKeyPatterns = [], identifierStrings = [], skipInParent = [] },
  { walk: walkMode = 'blocks', contextKey = null } = {}
) {
  const denylist = new Set(denylistKeys.map((k) => String(k).toLowerCase()));
  const patterns = denylistKeyPatterns.map(patternRegExp);
  const refPrefixes = [...valueGuards.refPrefixes];
  const assetRe = valueGuards.assetExtensions.length
    ? new RegExp(`\\.(${valueGuards.assetExtensions.map(escapeRegExp).join('|')})(\\?|$)`, 'i')
    : null;
  const { excludeNumbers, excludeBooleans } = valueGuards;
  const pageFieldEntries = Object.entries(pageFields).map(([obj, list]) => [obj, [...list]]);

  // Identifier strings: the keys whose own string value is an identifier, and
  // those whose list's string elements are.
  const idAsValue = new Set();
  const idInList = new Set();
  for (const rule of identifierStrings) {
    for (const key of lower(rule.keys)) {
      if (rule.where !== 'list') idAsValue.add(key);
      if (rule.where !== 'value') idInList.add(key);
    }
  }
  const parentRules = skipInParent.map((rule) => ({
    key: String(rule.key).toLowerCase(),
    parentKey: rule.parentKey ? lower(rule.parentKey) : null,
    parentHas: rule.parentHas ? [...lower(rule.parentHas)] : null,
    parentOnly: rule.parentOnly ? lower(rule.parentOnly) : null,
  }));

  /** true when a `denylistKeyPatterns` entry matches the key. */
  function isPatternKey(key) {
    return patterns.some((re) => re.test(String(key)));
  }

  /** true when the key, matched case-insensitively, is on the denylist or matches one of its patterns. */
  function isDenylistedKey(key) {
    return denylist.has(String(key).toLowerCase()) || isPatternKey(key);
  }

  /**
   * true when the string VALUE is translatable human text, meaning it passes
   * every value guard.
   */
  function isTranslatableValue(value) {
    if (typeof value !== 'string') return false;
    const t = value.trim();
    if (t === '') return false;
    if (refPrefixes.some((p) => t.startsWith(p))) return false;
    if (assetRe && assetRe.test(t)) return false;
    if (excludeNumbers && PURE_NUMBER_RE.test(t)) return false;
    if (excludeBooleans && BOOL_RE.test(t)) return false;
    return true;
  }

  /** true when the string that is `key`'s own value in `parent`, which sits under `holder`, is skipped by a `skipInParent` rule. */
  function skippedInParent(key, parent, holder) {
    const k = String(key).toLowerCase();
    for (const rule of parentRules) {
      if (rule.key !== k) continue;
      if (rule.parentKey && !(typeof holder === 'string' && rule.parentKey.has(holder.toLowerCase()))) continue;
      const keys = Object.keys(parent);
      const present = new Set(keys.map((name) => name.toLowerCase()));
      if (rule.parentHas && !rule.parentHas.every((name) => present.has(name))) continue;
      if (rule.parentOnly && !keys.every((name) => rule.parentOnly.has(name.toLowerCase()) || isPatternKey(name))) continue;
      return true;
    }
    return false;
  }

  /**
   * Walks `node` accumulating the translatable leaves.
   * @param {*} node                     the current value
   * @param {(string|number)[]} tokens   the path tokens down to `node`
   * @param {string|number} leafKey      the last object key walked through (drives format, context and the identifier rules)
   * @param {string} blockName           the block's name, or the document's context name (for the advisory context)
   * @param {Array} out                  the accumulator
   * @param {boolean} inList             whether `node` was reached through a list index since `leafKey`
   * @param {string|number|null} holder  the key the object holding `node` sits under
   */
  function walk(node, tokens, leafKey, blockName, out, inList = false, holder = null) {
    if (typeof node === 'string') {
      if (!isTranslatableValue(node)) return;
      const key = String(leafKey).toLowerCase();
      if (inList ? idInList.has(key) : idAsValue.has(key)) return;
      out.push({
        value: node,
        format: detectFormat(leafKey, node),
        path: stringifyPath(tokens),
        context: `${blockName}:${leafKey}`,
      });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((el, idx) => walk(el, [...tokens, idx], leafKey, blockName, out, true, holder));
      return;
    }
    if (node && typeof node === 'object') {
      for (const key of Object.keys(node)) {
        if (isDenylistedKey(key)) continue; // skips the whole asset/config subtree
        const value = node[key];
        if (typeof value === 'string' && parentRules.length && skippedInParent(key, node, leafKey)) continue;
        walk(value, [...tokens, key], key, blockName, out, false, leafKey);
      }
    }
    // numbers, booleans and null are ignored
  }

  /** true when the page is walked as a block-composed page under this walk mode. */
  function isBlockPage(page) {
    if (walkMode === 'blocks') return true;
    if (walkMode === 'whole') return false;
    return Boolean(page) && typeof page === 'object' && Array.isArray(page.blocks);
  }

  /** The advisory context name of a document walked whole. */
  function documentName(page) {
    const value = contextKey && page && typeof page === 'object' && !Array.isArray(page) ? page[contextKey] : undefined;
    return typeof value === 'string' || typeof value === 'number' ? String(value) : WHOLE_DOCUMENT_CONTEXT;
  }

  /**
   * Returns a page's translatable leaves as `{ value, format, path, context }`,
   * in document order: for a block-composed page the page-level fields first and
   * then the blocks; for a document walked whole, every key in order.
   *
   * `path` is a precise accessor: `seo.title`,
   * `blocks[3].data.sections[0].heading`,
   * `blocks[2].data.sections[1].paragraphs[0]`, or, for a document walked
   * whole, `articoli[0].titolo`.
   *
   * @param {Object} page   the page object (`{ path, template, blocks?, … }`), or any document
   */
  function translatableLeaves(page) {
    const out = [];
    if (!page || typeof page !== 'object') return out;

    if (!isBlockPage(page)) {
      walk(page, [], WHOLE_DOCUMENT_CONTEXT, documentName(page), out);
      return out;
    }

    // Page-level fields: a strict allowlist.
    for (const [objKey, fieldNames] of pageFieldEntries) {
      const obj = page[objKey];
      if (!obj || typeof obj !== 'object') continue;
      for (const field of fieldNames) {
        const v = obj[field];
        if (typeof v === 'string' && isTranslatableValue(v)) {
          out.push({
            value: v,
            format: detectFormat(field, v),
            path: `${objKey}.${field}`,
            context: `${objKey}:${field}`,
          });
        }
      }
    }

    // Blocks: the walk descends ONLY into `block.data`.
    if (Array.isArray(page.blocks)) {
      page.blocks.forEach((block, i) => {
        if (!block || typeof block !== 'object' || !block.data) return;
        const blockName = typeof block.name === 'string' ? block.name : 'Block';
        walk(block.data, ['blocks', i, 'data'], 'data', blockName, out);
      });
    }

    return out;
  }

  return {
    denylist,
    pageFields: Object.fromEntries(pageFieldEntries),
    walk: walkMode,
    isDenylistedKey,
    isPatternKey,
    isTranslatableValue,
    isBlockPage,
    translatableLeaves,
  };
}

export default {
  createFieldRules,
  detectFormat,
  parsePath,
  stringifyPath,
  getAtPath,
  setAtPath,
};
