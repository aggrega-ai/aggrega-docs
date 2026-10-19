/**
 * splice.mjs — The splice writer: a file's translated text is its source text with
 * segment ranges replaced, and nothing else changed.
 *
 * READS nothing and WRITES nothing: a pure function over strings.
 *
 * Splicing never re-serializes the syntax tree, so every byte outside a replaced
 * range — list markers, table alignment, blank lines, code blocks, line endings —
 * is the source's own byte, and a diff of a translated file shows only translated
 * text.
 */

/**
 * Replaces non-overlapping ranges of `text`. Every offset indexes the original
 * `text`, so the edits are assembled in one pass from the start; the result is the
 * one replacing them in reverse position order would give.
 *
 * @param {string} text
 * @param {Array<{start:number, end:number, text:string}>} edits  ranges into `text`; an
 *   empty range inserts.
 * @returns {string}
 * @throws {RangeError} when a range is out of bounds or two ranges overlap.
 */
export function splice(text, edits) {
  const sorted = [...edits].sort((a, b) => a.start - b.start || a.end - b.end);
  const pieces = [];
  let at = 0;
  for (const edit of sorted) {
    if (!(edit.start >= at && edit.end >= edit.start && edit.end <= text.length)) {
      throw new RangeError(`splice: range [${edit.start}, ${edit.end}) is out of bounds or overlaps the previous one`);
    }
    pieces.push(text.slice(at, edit.start), edit.text);
    at = edit.end;
  }
  pieces.push(text.slice(at));
  return pieces.join('');
}

export default { splice };
