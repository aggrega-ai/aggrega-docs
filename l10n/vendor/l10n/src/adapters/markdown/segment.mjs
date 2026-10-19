/**
 * segment.mjs — Segmentation of a Markdown file: its translatable segments, the
 * protected spans inside each, its generated sections, and its heading slugs.
 *
 * READS nothing and WRITES nothing: a pure function over a file's text.
 *
 * A SEGMENT is a raw slice of the source text: the span of a node's children, so
 * the Markdown markers around it (`#`, `>`, list markers, table pipes, padding) stay
 * outside. Its key is the engine's hash of exactly that slice. The segments are:
 *   - every heading with content;
 *   - every paragraph, wherever it sits — top level, list items, blockquotes,
 *     footnote definitions;
 *   - every table cell whose content is not only inline code, numbers,
 *     punctuation (symbols included, as CommonMark counts punctuation) or empty;
 *   - the value of each frontmatter key the configuration lists (see
 *     `frontmatter.mjs`).
 * Nothing inside fenced or indented code, an HTML block, an HTML comment, a link
 * definition or the frontmatter block is ever a segment.
 *
 * PROTECTED SPANS are ranges of a segment that a translation must reproduce byte
 * for byte. This module is the ONE detector of them: the adapter stores them on
 * each catalogue unit, and the pseudo-localizer and any later validator read them
 * from there. They are computed here, from the tree of the whole file, because a
 * slice parsed on its own loses its context — `[text][ref]` is plain text without
 * the definition of `ref`. The spans are:
 *   - inline code, inline HTML (tags and comments) and footnote references, whole;
 *   - an autolink or a literal URL or e-mail address, whole;
 *   - a link's or an image's destination and title, `](…)`, and an image's `![`;
 *   - a full reference's `][label]`, and a collapsed or shortcut reference whole,
 *     because its text is also its label;
 *   - character references (`&amp;`, `&#169;`).
 *
 * GENERATED SECTIONS are the ranges between `<!-- BEGIN GENERATED: <name> -->` and
 * `<!-- END GENERATED: <name> -->`, each marker an HTML block of its own. A marker
 * inside a paragraph is inline HTML, protected but not a section boundary. A
 * section that is not closed, closed under another name, or nested in another is
 * refused, naming the file and line.
 */

import { parseMarkdown } from './parse.mjs';
import { frontmatterSegments } from './frontmatter.mjs';
import { createHeadingSlugger } from './slug.mjs';
import { MarkdownSourceError } from './source-error.mjs';

/** A generated-section marker, as the HTML block's trimmed value reads. */
const MARKER = /^<!-- (BEGIN|END) GENERATED: (\S+) -->$/;

/** A character reference: named, decimal or hexadecimal. */
const CHARACTER_REFERENCE = /&(?:#[0-9]{1,7}|#[xX][0-9A-Fa-f]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/g;

/** Flow containers whose direct children may be HTML blocks or further flow content. */
const FLOW_CONTAINERS = new Set(['root', 'blockquote', 'list', 'listItem', 'footnoteDefinition']);

/** Nodes nothing inside of which is ever segmented. */
const OPAQUE = new Set(['code', 'html', 'definition']);

/**
 * A character that is not a number, punctuation (Unicode P and S, as CommonMark
 * counts it), whitespace or a control character: what makes a table cell more
 * than "only inline code, numbers, punctuation or empty".
 */
const WORDLIKE = /[^\p{N}\p{P}\p{S}\p{Z}\p{C}\s]/u;

const startOf = (node) => node.position.start.offset;
const endOf = (node) => node.position.end.offset;

/** Pushes the protected spans of a run of phrasing nodes onto `out`, as `[start, end, kind]`. */
function collectProtected(nodes, text, out) {
  for (const node of nodes) {
    const start = startOf(node);
    const end = endOf(node);
    const label = node.data && node.data.labelRange;
    switch (node.type) {
      case 'inlineCode':
      case 'html':
      case 'footnoteReference':
        out.push([start, end, node.type]);
        break;
      case 'link':
        if (!label) {
          out.push([start, end, 'autolink']);
        } else {
          collectProtected(node.children, text, out);
          out.push([label[1], end, 'destination']);
        }
        break;
      case 'linkReference':
        if (node.referenceType !== 'full' || !label) {
          out.push([start, end, 'reference']);
        } else {
          collectProtected(node.children, text, out);
          out.push([label[1], end, 'reference']);
        }
        break;
      case 'image':
      case 'imageReference':
        if (!label || (node.type === 'imageReference' && node.referenceType !== 'full')) {
          out.push([start, end, node.type === 'image' ? 'image' : 'reference']);
        } else {
          out.push([start, label[0], 'image']);
          out.push([label[1], end, node.type === 'image' ? 'destination' : 'reference']);
        }
        break;
      case 'text':
        for (const m of text.slice(start, end).matchAll(CHARACTER_REFERENCE)) {
          out.push([start + m.index, start + m.index + m[0].length, 'characterReference']);
        }
        break;
      default:
        if (node.children) collectProtected(node.children, text, out);
    }
  }
}

/** Sorts and merges spans, clipped to [lo, hi); the kind of a merged span is its first. */
function normalizeSpans(spans, lo, hi) {
  const sorted = spans
    .map(([s, e, kind]) => [Math.max(s, lo), Math.min(e, hi), kind])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged = [];
  for (const span of sorted) {
    const last = merged[merged.length - 1];
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
    else merged.push([...span]);
  }
  return merged;
}

/**
 * The parts of `text[start, end)` outside `spans`, in order.
 *
 * @param {string} text
 * @param {number} start
 * @param {number} end
 * @param {Array<[number, number]>} spans  sorted, merged, within [start, end).
 * @returns {string[]}
 */
export function unprotectedParts(text, start, end, spans) {
  const parts = [];
  let at = start;
  for (const [s, e] of spans) {
    if (s > at) parts.push(text.slice(at, s));
    at = Math.max(at, e);
  }
  if (end > at) parts.push(text.slice(at, end));
  return parts;
}

/** The generated sections of a tree, `{name, start, end, line}`, refusing an unbalanced or nested one. */
function findRegions(tree, file) {
  const markers = [];
  (function visit(node) {
    for (const child of node.children || []) {
      if (child.type === 'html') {
        const m = MARKER.exec(child.value.trim());
        if (m) markers.push({ kind: m[1], name: m[2], node: child });
      } else if (FLOW_CONTAINERS.has(child.type)) {
        visit(child);
      }
    }
  })(tree);

  const regions = [];
  let open = null;
  for (const marker of markers) {
    const line = marker.node.position.start.line;
    if (marker.kind === 'BEGIN') {
      if (open) {
        throw new MarkdownSourceError(
          `${file}:${line}: generated section "${marker.name}" opens inside "${open.name}" ` +
            `(opened at line ${open.node.position.start.line}); nested generated sections are not supported.`
        );
      }
      open = marker;
    } else if (!open) {
      throw new MarkdownSourceError(`${file}:${line}: generated section "${marker.name}" closes but was never opened.`);
    } else if (open.name !== marker.name) {
      throw new MarkdownSourceError(
        `${file}:${line}: generated section "${open.name}" (opened at line ${open.node.position.start.line}) ` +
          `is closed as "${marker.name}".`
      );
    } else {
      regions.push({ name: open.name, start: endOf(open.node), end: startOf(marker.node), line: open.node.position.start.line });
      open = null;
    }
  }
  if (open) {
    throw new MarkdownSourceError(
      `${file}:${open.node.position.start.line}: generated section "${open.name}" is never closed.`
    );
  }
  return regions;
}

/**
 * A segment's record.
 *
 * @typedef {Object} MarkdownSegment
 * @property {'heading'|'paragraph'|'tableCell'|'frontmatter'} kind
 * @property {number} start   offset of the slice in the file's text.
 * @property {number} end     offset just past the slice.
 * @property {number} line    the 1-based line the slice starts on.
 * @property {number} column  the 1-based column the slice starts at.
 * @property {Array<[number, number, string]>} protected  absolute, sorted, merged spans with their kind.
 * @property {string|null} region  the generated section holding the segment, or null.
 * @property {string} [slug]  for a heading: its slug.
 * @property {string} [key]   for a frontmatter value: the key.
 */

/**
 * Segments a Markdown file.
 *
 * @param {string} text  the whole file.
 * @param {Object} [options]
 * @param {string[]} [options.frontmatterKeys]  the frontmatter keys to segment (default: none).
 * @param {string} [options.file]  the file's name, for refusals.
 * @returns {{segments: MarkdownSegment[], headings: Array<{slug:string, start:number, end:number, line:number, region:string|null, segmented:boolean}>, regions: Array<{name:string,start:number,end:number,line:number}>, tree: import('mdast').Root}}
 * @throws {MarkdownSourceError} on an unbalanced or nested generated section, or a refused frontmatter value.
 */
export function segmentMarkdown(text, { frontmatterKeys = [], file = '<input>' } = {}) {
  const { tree, frontmatter } = parseMarkdown(text);
  const regions = findRegions(tree, file);
  const regionAt = (start, end) => {
    const r = regions.find((region) => start >= region.start && end <= region.end);
    return r ? r.name : null;
  };
  const pointAt = (offset) => {
    let line = 1;
    let lineStart = 0;
    for (let i = 0; i < offset; i++) {
      if (text[i] === '\n') {
        line++;
        lineStart = i + 1;
      }
    }
    return { line, column: offset - lineStart + 1 };
  };

  const slugOf = createHeadingSlugger();
  const segments = [];
  const headings = [];

  const push = (kind, node, extra = {}) => {
    const children = node.children || [];
    if (children.length === 0) return false;
    let start = startOf(children[0]);
    let end = endOf(children[children.length - 1]);
    while (start < end && /\s/.test(text[start])) start++;
    while (end > start && /\s/.test(text[end - 1])) end--;
    if (end <= start) return false;
    const spans = [];
    collectProtected(children, text, spans);
    const protectedSpans = normalizeSpans(spans, start, end);
    if (kind === 'tableCell') {
      const code = normalizeSpans(spans.filter(([, , k]) => k === 'inlineCode'), start, end);
      if (!unprotectedParts(text, start, end, code).some((p) => WORDLIKE.test(p))) return false;
    }
    const point = children[0].position.start;
    segments.push({
      kind,
      start,
      end,
      line: point.line,
      column: point.column,
      protected: protectedSpans,
      region: regionAt(start, end),
      ...extra,
    });
    return true;
  };

  (function visit(node) {
    for (const child of node.children || []) {
      if (OPAQUE.has(child.type)) continue;
      if (child.type === 'heading') {
        const slug = slugOf(child);
        const segmented = push('heading', child, { slug });
        headings.push({
          slug,
          start: startOf(child),
          end: endOf(child),
          line: child.position.start.line,
          region: regionAt(startOf(child), endOf(child)),
          segmented,
        });
      } else if (child.type === 'paragraph' || child.type === 'tableCell') {
        push(child.type, child);
      } else {
        visit(child);
      }
    }
  })(tree);

  for (const segment of frontmatterSegments(text, frontmatter, frontmatterKeys, file)) {
    segments.push({ ...segment, ...pointAt(segment.start), region: null });
  }
  segments.sort((a, b) => a.start - b.start);
  return { segments, headings, regions, tree };
}

/**
 * The protected substrings of a text parsed on its own, in document order —
 * what this module detects in a Markdown slice once its file's context is gone.
 * A reference whose definition lies elsewhere is plain text here, so comparing a
 * source slice with its translation this way treats both alike; the spans a unit
 * stores, computed with the whole file in view, are what catches an altered
 * reference.
 *
 * @param {string} text
 * @returns {string[]}
 * @throws {MarkdownSourceError} on an unbalanced or nested generated section in the text.
 */
export function standaloneProtectedTexts(text) {
  const { segments } = segmentMarkdown(text, { file: '<translation>' });
  return segments.flatMap((segment) => segment.protected.map(([start, end]) => text.slice(start, end)));
}

export default { segmentMarkdown, unprotectedParts, standaloneProtectedTexts };
