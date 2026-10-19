/**
 * heading-id.mjs — The explicit heading identifier ` {#slug}`: its writer, its one
 * parser, and the syntax-tree plugin a site registers to honour it.
 *
 * READS nothing and WRITES nothing: pure functions over strings and syntax trees.
 *
 * A translated heading ends with ` {#<slug>}`, where the slug is the SOURCE
 * heading's, so a link written against the source page (`page.md#some-heading`)
 * resolves in every locale. The writer and every reader of that syntax live here:
 * the adapter writes it with `formatHeadingId`; `remarkHeadingIds` strips it from
 * a heading and sets the heading's id; and any other reader — a loader that takes
 * a page's title from its raw first heading line, for example — calls
 * `parseHeadingId` rather than matching the suffix itself.
 *
 * An underscore in a slug is written `\_` unless a letter, mark or digit sits on
 * both sides of it. That is exactly the case in which Markdown can never read the
 * underscore as emphasis, so every other underscore is escaped and the suffix
 * always parses back as plain text. `parseHeadingId` removes the escapes.
 */

/** A letter, mark or digit: an underscore between two of these is never emphasis. */
const WORD_CHARACTER = /[\p{L}\p{M}\p{N}]/u;

/** The suffix: whitespace, then `{#`, the id (no whitespace or braces; `\_` allowed), `}`, at the end. */
const SUFFIX = /[ \t]+\{#((?:[^\s{}\\]|\\_)*)\}[ \t]*$/;

/**
 * The suffix that gives a heading the explicit identifier `slug`.
 *
 * @param {string} slug  a slug as `github-slugger` produces it: no whitespace, braces or backslashes.
 * @returns {string}  ` {#<slug>}`, underscores escaped where Markdown could read them as emphasis.
 */
export function formatHeadingId(slug) {
  if (typeof slug !== 'string' || /[\s{}\\]/.test(slug)) {
    throw new TypeError(`formatHeadingId: ${JSON.stringify(slug)} cannot be written as a heading identifier`);
  }
  let id = '';
  for (let i = 0; i < slug.length; i++) {
    const inert = WORD_CHARACTER.test(slug[i - 1] || '') && WORD_CHARACTER.test(slug[i + 1] || '');
    id += slug[i] === '_' && !inert ? '\\_' : slug[i];
  }
  return ` {#${id}}`;
}

/**
 * Splits a heading's text from its explicit identifier.
 *
 * @param {string} text  a heading's text, as a syntax tree holds it or as its raw source line reads.
 * @returns {{text: string, id: string|null}}  the text without the suffix, and the id, or
 *   `{text, id: null}` when the text carries no suffix.
 */
export function parseHeadingId(text) {
  const match = SUFFIX.exec(text);
  if (!match) return { text, id: null };
  return { text: text.slice(0, match.index), id: match[1].replace(/\\_/g, '_') };
}

/** The source text a node covers, or null when there is no source or the node has no offsets. */
function sourceOf(node, source) {
  const position = node.position;
  if (typeof source !== 'string' || !position || !position.start || !position.end) return null;
  const { offset: start } = position.start;
  const { offset: end } = position.end;
  if (typeof start !== 'number' || typeof end !== 'number' || end > source.length) return null;
  return source.slice(start, end);
}

/**
 * Strips the explicit identifier from every heading in an mdast tree and sets it
 * as the heading's id: `data.id`, and `data.hProperties.id`, which a Markdown-to-HTML
 * step carries onto the heading element. Only a suffix at the end of the
 * heading's last text node counts; a text node left empty is removed. Mutates and
 * returns the tree.
 *
 * The id is read from `source` — the text the tree was parsed from, its offsets
 * indexing it — at the last text node's position, when both are available, and
 * from the node's value otherwise. A step that rewrites text before this one, such
 * as typographic quotes and dashes turning `--` into a dash, therefore leaves the
 * id as written.
 *
 * @param {import('mdast').Root} tree
 * @param {string} [source]  the text the tree's offsets index.
 * @returns {import('mdast').Root}
 */
export function applyHeadingIds(tree, source) {
  (function visit(node) {
    if (node.type === 'heading') {
      const last = node.children[node.children.length - 1];
      if (last && last.type === 'text') {
        const { text, id: idFromValue } = parseHeadingId(last.value);
        const raw = sourceOf(last, source);
        const idFromSource = raw === null ? null : parseHeadingId(raw).id;
        const id = idFromSource !== null ? idFromSource : idFromValue;
        if (idFromValue !== null) {
          const removed = last.value.length - text.length;
          if (text === '') {
            node.children.pop();
          } else {
            last.value = text;
            if (last.position && last.position.end) {
              last.position.end = {
                ...last.position.end,
                offset: last.position.end.offset - removed,
                column: last.position.end.column - removed,
              };
            }
          }
          const data = node.data || {};
          node.data = { ...data, id, hProperties: { ...(data.hProperties || {}), id } };
        }
      }
      return;
    }
    for (const child of node.children || []) visit(child);
  })(tree);
  return tree;
}

/**
 * The syntax-tree plugin (a remark plugin): registered in a site's Markdown
 * pipeline, it applies `applyHeadingIds` to every page, reading each id from the
 * page's source text (the file's `value`), so a translated heading keeps its
 * source anchor even after a typographic step has rewritten its text. The parser
 * numbers offsets from after a leading byte-order mark, and so does this plugin.
 * Whether the site's own heading-id step then keeps an id already set is a
 * property of that site, which it verifies.
 *
 * @returns {(tree: import('mdast').Root, file?: {value?: unknown}) => void}
 */
export function remarkHeadingIds() {
  return (tree, file) => {
    let source;
    if (file && file.value !== undefined && file.value !== null) {
      source = String(file.value);
      if (source.charCodeAt(0) === 0xfeff) source = source.slice(1);
    }
    applyHeadingIds(tree, source);
  };
}

export default { formatHeadingId, parseHeadingId, applyHeadingIds, remarkHeadingIds };
