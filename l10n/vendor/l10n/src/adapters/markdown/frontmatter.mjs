/**
 * frontmatter.mjs — The leading YAML block of a Markdown file, and the values of
 * the keys a configuration lists for translation.
 *
 * READS nothing and WRITES nothing: pure functions over strings.
 *
 * A file has frontmatter when it opens, after an optional byte-order mark, with a
 * line holding exactly `---`, and a later line holding exactly `---` or `...`
 * closes the block. The block is never segmented unless the configuration lists
 * keys (`adapter.frontmatterKeys`).
 *
 * A listed key is segmented only when it is a top-level key whose value is a
 * single-line scalar: plain, single-quoted or double-quoted. The segment is the
 * value without its quotes, so the quotes stay outside it. Any other value under
 * a listed key is refused, naming the file and the key, rather than parsed
 * partially: a block scalar, a flow collection, an anchor, alias or tag, a value
 * that continues on the next line, a nested value, or a key that appears twice.
 * This package carries no YAML parser, which is why the accepted shape is this
 * narrow.
 */

import { MarkdownSourceError } from './source-error.mjs';

/** The lines of `text` from `from`, each `{start, end, next}`: content start, content end, and the next line's start. */
function linesFrom(text, from) {
  const lines = [];
  const re = /[^\r\n]*(\r\n|\r|\n|$)/gy;
  re.lastIndex = from;
  while (re.lastIndex < text.length) {
    const start = re.lastIndex;
    const m = re.exec(text);
    if (!m) break;
    lines.push({ start, end: start + m[0].length - m[1].length, next: re.lastIndex });
    if (m[1] === '') break;
  }
  return lines;
}

/**
 * Locates the frontmatter block at `from` (the offset after any byte-order mark).
 *
 * @param {string} text
 * @param {number} [from]
 * @returns {{start:number, end:number, lines:Array<{start:number,end:number,next:number}>}|null}
 *   `start`/`end` bound the block from the opening `---` to the end of the closing
 *   line, its line ending excluded; `lines` are the lines between the two fences.
 *   Null when the file has no frontmatter.
 */
export function findFrontmatter(text, from = 0) {
  const lines = linesFrom(text, from);
  if (lines.length < 2) return null;
  const first = lines[0];
  if (text.slice(first.start, first.end) !== '---' || first.next === first.end) return null;
  for (let i = 1; i < lines.length; i++) {
    const content = text.slice(lines[i].start, lines[i].end);
    if (content === '---' || content === '...') {
      return { start: from, end: lines[i].end, lines: lines.slice(1, i) };
    }
  }
  return null;
}

/** The end (exclusive) of a quoted scalar opening at `at`, or -1 when it does not close on the line. */
function closingQuote(text, at, lineEnd) {
  const quote = text[at];
  for (let i = at + 1; i < lineEnd; i++) {
    const ch = text[i];
    if (quote === '"' && ch === '\\') {
      i++;
      continue;
    }
    if (ch === quote) {
      if (quote === "'" && text[i + 1] === "'") {
        i++;
        continue;
      }
      return i;
    }
  }
  return -1;
}

/**
 * The segments of the listed frontmatter keys: one per key present, each
 * `{kind:'frontmatter', key, start, end, protected:[]}` over the value without its
 * quotes. An absent key yields nothing; an empty value yields nothing.
 *
 * @param {string} text  the whole file.
 * @param {ReturnType<typeof findFrontmatter>} frontmatter
 * @param {string[]} keys  the configuration's `adapter.frontmatterKeys`.
 * @param {string} file  the file's name, for the refusal.
 * @throws {MarkdownSourceError} when a listed key's value is not a single-line scalar.
 */
export function frontmatterSegments(text, frontmatter, keys, file) {
  if (!frontmatter || keys.length === 0) return [];
  const segments = [];
  const refuse = (key, why) => {
    throw new MarkdownSourceError(
      `${file}: frontmatter key "${key}" ${why}; only a single-line scalar can be translated.`
    );
  };
  for (const key of keys) {
    const at = frontmatter.lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => {
        if (!text.startsWith(`${key}:`, line.start)) return false;
        const after = line.start + key.length + 1;
        return after === line.end || text[after] === ' ' || text[after] === '\t';
      });
    if (at.length === 0) continue;
    if (at.length > 1) refuse(key, 'appears more than once');
    const { line, index } = at[0];
    let start = line.start + key.length + 1;
    while (start < line.end && (text[start] === ' ' || text[start] === '\t')) start++;
    const head = text[start];
    if (start === line.end || head === '#') refuse(key, 'holds a nested or multi-line value');
    if (head === '|' || head === '>') refuse(key, 'holds a block scalar');
    if (head === '[' || head === '{') refuse(key, 'holds a flow collection');
    if (head === '&' || head === '*' || head === '!') refuse(key, 'holds an anchor, an alias or a tag');
    if (head === '%' || head === '@' || head === '`') refuse(key, 'opens with a reserved indicator');

    let end;
    let valueStart = start;
    if (head === '"' || head === "'") {
      const close = closingQuote(text, start, line.end);
      if (close === -1) refuse(key, 'holds a quoted value that does not close on its line');
      const trailing = text.slice(close + 1, line.end);
      if (!/^[ \t]*(#.*)?$/.test(trailing)) refuse(key, 'holds text after its closing quote');
      valueStart = start + 1;
      end = close;
    } else {
      const comment = text.slice(start, line.end).search(/[ \t]#/);
      end = comment === -1 ? line.end : start + comment;
      while (end > start && (text[end - 1] === ' ' || text[end - 1] === '\t')) end--;
    }
    const next = frontmatter.lines[index + 1];
    if (next && /^[ \t]+\S/.test(text.slice(next.start, next.end))) refuse(key, 'continues on the next line');
    if (end > valueStart) segments.push({ kind: 'frontmatter', key, start: valueStart, end, protected: [] });
  }
  return segments.sort((a, b) => a.start - b.start);
}

export default { findFrontmatter, frontmatterSegments };
