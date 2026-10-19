/**
 * shape.mjs — The tree shape of a Markdown file: what a translation must leave
 * unchanged.
 *
 * READS nothing and WRITES nothing: a pure function over a file's text.
 */

import { parseMarkdown } from './parse.mjs';
import { applyHeadingIds } from './heading-id.mjs';

/**
 * The shape of a Markdown file: the sequence of its syntax-tree node types in
 * document order, inline nodes included, and its counts of list items, table rows
 * and table cells. Explicit heading identifiers are stripped first
 * (`applyHeadingIds`), so a translated file and its source compare equal when the
 * translation changed text only.
 *
 * @param {string} text
 * @returns {{types: string[], listItems: number, tableRows: number, tableCells: number}}
 */
export function markdownTreeShape(text) {
  const { tree } = parseMarkdown(text);
  applyHeadingIds(tree, text);
  const shape = { types: [], listItems: 0, tableRows: 0, tableCells: 0 };
  (function visit(node) {
    shape.types.push(node.type);
    if (node.type === 'listItem') shape.listItems++;
    if (node.type === 'tableRow') shape.tableRows++;
    if (node.type === 'tableCell') shape.tableCells++;
    for (const child of node.children || []) visit(child);
  })(tree);
  return shape;
}

export default { markdownTreeShape };
