/**
 * index.mjs — The Markdown adapter: a documentation corpus of Markdown files,
 * translated with its structure intact.
 *
 * `createMarkdownAdapter` builds, from a loaded project (see `config.mjs`), the
 * object `createEngine({adapter})` expects:
 *   - `extract()`  → the source catalogue: one unit per distinct segment, keyed by
 *                    the engine's hash of the segment's raw source slice, each
 *                    carrying its protected spans and its usages (file and
 *                    position, in document order); plus the file, segment and
 *                    word counts the command line prints;
 *   - `pages()`    → the ordered pages a translation request is built from: each
 *                    selected file outside a kept path, in path order, with its
 *                    segments outside kept sections in document order;
 *   - `generate({tmByLang, targets})` → writes every source file in every target
 *                    locale under `<outDir>/<locale>/<relative path>`.
 *
 * A file's TOP-LEVEL SECTIONS — where a file above the configured section
 * budget is split — run from one top-level `#` or `##` heading (a heading that
 * is a direct child of the document, not inside a list or a blockquote) to the
 * next; the text before the first is a section of its own. A section is named
 * by its heading's source slug.
 *
 * READS the source files the configuration's `include` globs select under
 * `sourceDir`, less its `exclude` globs. WRITES only under `<outDir>/<locale>/`,
 * and only in `generate`. Neither a file it writes nor one under the memory
 * directory is ever read as a source.
 *
 * OUTPUT is splice-only (`splice.mjs`): a translated file is its source file with
 * each translated segment's range replaced. A segment with no translation keeps
 * its source text, so every file exists in every locale and a relative link
 * between pages resolves inside each locale tree. Every heading outside a kept
 * scope ends with ` {#<source slug>}` (`heading-id.mjs`), translated or not.
 *
 * POLICIES are configuration. `policies.paths` is an ordered list of
 * `{glob, policy}`, the last matching entry deciding; `policies.regions` maps a
 * generated-section name to a policy. A policy is `translate` (the default) or
 * `keep`, and `keep` copies the source bytes unchanged — headings included, so a
 * kept heading carries no explicit identifier and its id is the site's own. A kept
 * path is copied whole whatever its sections' policies; a kept section is copied
 * inside an otherwise translated page. Kept text contributes no catalogue unit,
 * and its headings still advance the file's slugger.
 */

import nodeFs from 'node:fs';
import path from 'node:path';

import { keyOf } from '../../normalize.mjs';
import { FORMAT } from '../../types.mjs';
import { segmentMarkdown, unprotectedParts } from './segment.mjs';
import { formatHeadingId } from './heading-id.mjs';
import { splice } from './splice.mjs';
import { MarkdownSourceError } from './source-error.mjs';

const KEEP = 'keep';

/** The section label of a file's text before its first top-level heading. */
const PREAMBLE_SECTION = '(before the first heading)';

/** The deepest heading level that opens a top-level section. */
const SECTION_DEPTH = 2;

/** A word: a run of letters, marks and digits that starts with a letter or a digit. */
const WORD = /[\p{L}\p{N}][\p{L}\p{M}\p{N}]*/gu;

const toPosix = (p) => p.split(path.sep).join('/');

/** The relative glob covering `dir`'s contents when `dir` lies strictly inside `root`, else null. */
function insideGlob(root, dir) {
  const rel = path.relative(root, dir);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return `${toPosix(rel)}/**`;
}

/**
 * Counts the words of a slice outside its protected spans.
 *
 * @param {string} source  the slice.
 * @param {Array<[number, number]>} spans  relative to the slice, sorted, merged.
 */
function countWords(source, spans) {
  let words = 0;
  for (const part of unprotectedParts(source, 0, source.length, spans)) {
    words += (part.match(WORD) || []).length;
  }
  return words;
}

/** Merges two sorted lists of spans into one sorted, merged list. */
function unionSpans(a, b) {
  const merged = [];
  for (const span of [...a, ...b].sort((x, y) => x[0] - y[0] || y[1] - x[1])) {
    const last = merged[merged.length - 1];
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
    else merged.push([span[0], span[1]]);
  }
  return merged;
}

/**
 * Builds the Markdown adapter for a loaded project.
 *
 * @param {Object} args
 * @param {import('../../config.mjs').Project} args.project  the loaded project.
 * @param {typeof nodeFs} [args.fsImpl]  injectable fs (a test seam).
 * @param {() => string} [args.now]      timestamp generator for the catalogue (a test seam).
 */
export function createMarkdownAdapter({ project, fsImpl = nodeFs, now } = {}) {
  const settings = project.config.adapter;
  if (!settings || settings.kind !== 'markdown') {
    throw new Error(`createMarkdownAdapter: adapter.kind is "${settings && settings.kind}", not "markdown"`);
  }
  const { source: sourceLang, targets } = project.locales;
  const sourceDir = project.resolve(settings.sourceDir);
  const outDir = project.resolve(settings.outDir);
  const frontmatterKeys = settings.frontmatterKeys || [];
  const pathRules = (settings.policies && settings.policies.paths) || [];
  const regionRules = (settings.policies && settings.policies.regions) || {};
  // What the adapter writes is never read back as a source: the whole output
  // directory when it lies inside the corpus, or each target locale's directory
  // when the two are one directory.
  const written = outDir === sourceDir ? targets.map((lang) => `${lang}/**`) : [insideGlob(sourceDir, outDir)];
  const exclude = [...(settings.exclude || []), ...written, insideGlob(sourceDir, project.memoryDir)].filter(Boolean);
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  const pick = (requested) => (requested && requested.length ? requested : targets);

  /** The policy of a source path: the last matching rule's, else `translate`. */
  const pathPolicy = (rel) => {
    let policy = 'translate';
    for (const rule of pathRules) if (path.matchesGlob(rel, rule.glob)) policy = rule.policy;
    return policy;
  };
  /** Whether a segment is kept by its generated section's policy. */
  const keptRegion = (segment) =>
    segment.region !== null && Object.prototype.hasOwnProperty.call(regionRules, segment.region) &&
    regionRules[segment.region] === KEEP;

  /** The source files, as sorted forward-slash paths relative to `sourceDir`. */
  function listFiles() {
    const glob = fsImpl.globSync || nodeFs.globSync;
    const found = new Set();
    for (const pattern of settings.include) {
      for (const rel of glob(pattern, { cwd: sourceDir })) found.add(toPosix(rel));
    }
    return [...found]
      .filter((rel) => !exclude.some((pattern) => path.matchesGlob(rel, pattern)))
      .filter((rel) => fsImpl.statSync(path.join(sourceDir, rel)).isFile())
      .sort();
  }

  /** A source file's text; bytes that are not valid UTF-8 are refused, since a splice could not preserve them. */
  function decode(bytes, rel) {
    try {
      return decoder.decode(bytes);
    } catch {
      throw new MarkdownSourceError(`${rel}: not valid UTF-8; a translated copy could not keep its bytes.`);
    }
  }

  /** Reads and segments one source file. */
  function readSegmented(rel) {
    const bytes = fsImpl.readFileSync(path.join(sourceDir, rel));
    const text = decode(bytes, rel);
    return { bytes, text, ...segmentMarkdown(text, { frontmatterKeys, file: rel }) };
  }

  return {
    kind: 'markdown',
    sourceLang,
    targets: [...targets],
    sourceDir,
    outDir,
    listFiles,
    pathPolicy,

    /**
     * The source catalogue. A unit's `source` is the segment's raw slice, its key
     * `keyOf(source)`, its `format` `markdown` (`text` for a frontmatter value), and
     * its `protected` spans offsets into `source`. A slice used in several places is
     * one unit with every usage recorded, and its spans are the union of every
     * usage's. `stats` counts the source files, the translatable segments (each
     * occurrence) and their words outside protected spans.
     */
    extract() {
      const units = {};
      const stats = { files: 0, segments: 0, words: 0 };
      for (const rel of listFiles()) {
        stats.files += 1;
        if (pathPolicy(rel) === KEEP) continue;
        const { text, segments } = readSegmented(rel);
        for (const segment of segments) {
          if (keptRegion(segment)) continue;
          const source = text.slice(segment.start, segment.end);
          const key = keyOf(source);
          const spans = segment.protected.map(([s, e]) => [s - segment.start, e - segment.start]);
          const usage = { file: rel, path: `${segment.kind}@${segment.line}:${segment.column}` };
          const existing = units[key];
          if (!existing) {
            units[key] = {
              source,
              format: segment.kind === 'frontmatter' ? FORMAT.TEXT : FORMAT.MARKDOWN,
              usages: [usage],
              protected: spans,
            };
          } else {
            existing.usages.push(usage);
            // Spans are offsets into `source`; a slice equal only after Unicode
            // normalization has offsets of its own, so its spans are not merged.
            if (existing.source === source) existing.protected = unionSpans(existing.protected, spans);
          }
          stats.segments += 1;
          stats.words += countWords(source, spans);
        }
      }
      return { ...(now ? { generated_at: now() } : {}), source_lang: sourceLang, units, stats };
    },

    /**
     * The ordered pages: each selected file outside a kept path, in path order,
     * with its segments outside kept sections in document order. Each segment
     * carries its key (`keyOf` of its slice, as `extract` keys it), its slice,
     * format, protected spans relative to the slice, its kind as advisory
     * context, and its top-level section. A file with no segment is omitted.
     *
     * @returns {import('../../types.mjs').Page[]}
     */
    pages() {
      const out = [];
      for (const rel of listFiles()) {
        if (pathPolicy(rel) === KEEP) continue;
        const { text, segments, headings, tree } = readSegmented(rel);
        const slugAt = new Map(headings.map((h) => [h.start, h.slug]));
        const openings = tree.children
          .filter((node) => node.type === 'heading' && node.depth <= SECTION_DEPTH)
          .map((node) => ({ at: node.position.start.offset, label: `#${slugAt.get(node.position.start.offset)}` }));
        const sectionOf = (offset) => {
          let label = PREAMBLE_SECTION;
          for (const opening of openings) {
            if (opening.at > offset) break;
            label = opening.label;
          }
          return label;
        };
        const pageSegments = [];
        for (const segment of segments) {
          if (keptRegion(segment)) continue;
          const source = text.slice(segment.start, segment.end);
          pageSegments.push({
            key: keyOf(source),
            source,
            format: segment.kind === 'frontmatter' ? FORMAT.TEXT : FORMAT.MARKDOWN,
            protected: segment.protected.map(([s, e]) => [s - segment.start, e - segment.start]),
            context: segment.kind === 'frontmatter' ? `frontmatter:${segment.key}` : segment.kind,
            section: sectionOf(segment.start),
          });
        }
        if (pageSegments.length > 0) out.push({ id: rel, segments: pageSegments });
      }
      return out;
    },

    /**
     * Writes every source file in every requested target locale, under
     * `<outDir>/<locale>/<relative path>`. Returns the files written and, per
     * locale, the number of segments that fell back to their source text.
     */
    generate({ tmByLang = {}, targets: requested } = {}) {
      const langs = pick(requested);
      const written = [];
      const fallbacks = Object.fromEntries(langs.map((lang) => [lang, 0]));
      const write = (lang, rel, data) => {
        const file = path.join(outDir, lang, rel);
        fsImpl.mkdirSync(path.dirname(file), { recursive: true });
        fsImpl.writeFileSync(file, data);
        written.push(file);
      };
      for (const rel of listFiles()) {
        if (pathPolicy(rel) === KEEP) {
          const bytes = fsImpl.readFileSync(path.join(sourceDir, rel));
          for (const lang of langs) write(lang, rel, bytes);
          continue;
        }
        const { text, segments } = readSegmented(rel);
        for (const lang of langs) {
          const tm = tmByLang[lang] || {};
          const edits = [];
          for (const segment of segments) {
            if (keptRegion(segment)) continue;
            const source = text.slice(segment.start, segment.end);
            const entry = tm[keyOf(source)];
            let replacement = source;
            if (entry && typeof entry.text === 'string') replacement = entry.text;
            else fallbacks[lang] += 1;
            if (segment.kind === 'heading') replacement += formatHeadingId(segment.slug);
            edits.push({ start: segment.start, end: segment.end, text: replacement });
          }
          write(lang, rel, splice(text, edits));
        }
      }
      return { written, fallbacks };
    },
  };
}

export default { createMarkdownAdapter };
