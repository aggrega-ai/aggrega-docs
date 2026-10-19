/**
 * parse.mjs — Parsing a Markdown source file into a GitHub-flavoured syntax tree
 * whose positions index the file's own text.
 *
 * READS nothing and WRITES nothing: a pure function over a string.
 *
 * Three properties the rest of the adapter relies on:
 *   - Every `position.*.offset` is an index into the string passed in. The parser
 *     drops a leading byte-order mark and numbers from the character after it, so
 *     a file that opens with one has its offsets shifted back here.
 *   - A frontmatter block is blanked before parsing (each of its characters but
 *     the line endings becomes a space), so it yields no node and cannot be read
 *     as a thematic break and a heading, while every offset after it is
 *     unchanged.
 *   - A link's or an image's label text records its range as `data.labelRange`
 *     (`[start, end]`). The tree carries no position for an image's alt text, and
 *     the label range is what lets the adapter leave alt text translatable while
 *     keeping the destination byte-identical. It is read from the parser's own
 *     `labelText` token, which has no other `enter` handler.
 */

import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfm } from 'micromark-extension-gfm';
import { gfmFromMarkdown } from 'mdast-util-gfm';

import { findFrontmatter } from './frontmatter.mjs';

const BYTE_ORDER_MARK = 0xfeff;

/** Records a label's range on the link or image that owns it. */
const recordLabelRanges = {
  enter: {
    labelText(token) {
      const owner = this.stack[this.stack.length - 2];
      owner.data = { ...owner.data, labelRange: [token.start.offset, token.end.offset] };
    },
  },
};

/** Adds `by` to every offset in the tree, each point object once. */
function shiftOffsets(tree, by) {
  const seen = new Set();
  const shift = (point) => {
    if (point && !seen.has(point)) {
      seen.add(point);
      point.offset += by;
    }
  };
  (function visit(node) {
    if (node.position) {
      shift(node.position.start);
      shift(node.position.end);
    }
    if (node.data && Array.isArray(node.data.labelRange)) {
      node.data.labelRange = node.data.labelRange.map((o) => o + by);
    }
    for (const child of node.children || []) visit(child);
  })(tree);
}

/**
 * Parses a Markdown file with GitHub-flavoured Markdown (tables, task lists,
 * strikethrough, autolink literals, footnotes).
 *
 * @param {string} text  the file's text, byte-order mark included when present.
 * @returns {{tree: import('mdast').Root, bom: 0|1, frontmatter: ReturnType<typeof findFrontmatter>}}
 */
export function parseMarkdown(text) {
  const bom = text.charCodeAt(0) === BYTE_ORDER_MARK ? 1 : 0;
  const frontmatter = findFrontmatter(text, bom);
  const input = frontmatter
    ? text.slice(0, frontmatter.start) +
      text.slice(frontmatter.start, frontmatter.end).replace(/[^\r\n]/g, ' ') +
      text.slice(frontmatter.end)
    : text;
  const tree = fromMarkdown(input, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown(), recordLabelRanges],
  });
  if (bom) shiftOffsets(tree, bom);
  return { tree, bom, frontmatter };
}

export default { parseMarkdown };
