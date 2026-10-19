/**
 * source-error.mjs — The error the Markdown adapter raises on a source file it
 * refuses to segment.
 *
 * READS nothing and WRITES nothing: a declaration module.
 */

/**
 * A Markdown source file the adapter cannot segment without guessing: an
 * unbalanced or nested generated section, a listed frontmatter key whose value is
 * not a single-line scalar, or bytes that are not valid UTF-8. The message names
 * the file, and the line or key where one applies.
 */
export class MarkdownSourceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MarkdownSourceError';
  }
}

export default { MarkdownSourceError };
