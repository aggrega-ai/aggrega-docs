/**
 * slug.mjs — The one rule by which the Markdown adapter computes a heading's
 * anchor slug.
 *
 * READS nothing and WRITES nothing: pure functions over syntax-tree nodes.
 *
 * THE RULE. One `github-slugger` instance per file, called for every heading in
 * document order — headings inside kept paths and kept regions included, so later
 * headings keep the source page's duplicate numbering — on the heading's slug
 * text, with no post-processing. The slug text is the concatenation of the
 * heading's text and inline-code values. Inline HTML and image alt text are
 * excluded, because a site whose heading-id step reads the rendered tree's text
 * nodes before raw HTML is parsed does not see them. That is the behaviour of the
 * Astro heading-id step the package's integration guide describes.
 *
 * What the rule does not reproduce is stated there too: a site that rewrites text
 * before computing slugs — typographic quotes and dashes, for example — computes a
 * different slug for a heading holding `--` or `---` outside inline code.
 */

import GithubSlugger from 'github-slugger';

/**
 * The text a heading's slug is computed from: its text and inline-code values,
 * in order, with inline HTML and images skipped.
 *
 * @param {import('mdast').Heading} heading
 * @returns {string}
 */
export function headingSlugText(heading) {
  let text = '';
  (function visit(node) {
    if (node.type === 'text' || node.type === 'inlineCode') {
      text += node.value;
      return;
    }
    if (node.type === 'html' || node.type === 'image' || node.type === 'imageReference') return;
    for (const child of node.children || []) visit(child);
  })(heading);
  return text;
}

/**
 * A per-file slugger: each call returns the next heading's slug, numbering a
 * repeated slug `-1`, `-2`, … in call order. Create one per file and call it for
 * every heading, in document order.
 *
 * @returns {(heading: import('mdast').Heading) => string}
 */
export function createHeadingSlugger() {
  const slugger = new GithubSlugger();
  return (heading) => slugger.slug(headingSlugText(heading));
}

export default { headingSlugText, createHeadingSlugger };
