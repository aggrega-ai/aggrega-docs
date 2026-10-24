// Text formatting for the two machine-readable documentation files, llms.txt
// and llms-full.txt. Everything here is a pure function of its arguments — no
// file access, no clock, no environment — so the same pages in the same order
// always yield the same bytes. Collecting the pages and their order is the
// endpoint's job (src/pages/[file].txt.ts); this module only renders them.
//
// llms.txt follows the shape published at llmstxt.org: a level-one heading with
// the product's name, a blockquote summary, a short paragraph, then one
// level-two section per sidebar group, each a list of `[title](url): description`
// entries. llms-full.txt carries the same pages' Markdown text concatenated in
// the same order, each preceded by the address it is published at.

// The longest description written after a link, in characters. A longer first
// paragraph is cut at the last word boundary before the limit.
const DESCRIPTION_LIMIT = 200;

const HEADING = /^#{1,6}(\s|$)/;
const LIST_ITEM = /^([-*+]|\d+[.)])\s/;
const THEMATIC_BREAK = /^(-{3,}|\*{3,}|_{3,})$/;
const LINK_DEFINITION = /^\[[^\]]+\]:\s/;
const FENCE_OPEN = /^(`{3,}|~{3,})/;

// A line that opens a block which is not a prose paragraph: a heading, a list,
// a table, a quotation, raw HTML, a thematic break, an image, or a link
// reference definition.
function opensNonProseBlock(line) {
  return (
    HEADING.test(line) ||
    LIST_ITEM.test(line) ||
    line.startsWith("|") ||
    line.startsWith(">") ||
    line.startsWith("<") ||
    line.startsWith("![") ||
    THEMATIC_BREAK.test(line) ||
    LINK_DEFINITION.test(line)
  );
}

// Reduces inline Markdown to its visible text: images are dropped, a link keeps
// its text, code spans and emphasis keep their content, HTML tags and
// backslash escapes are removed, and runs of whitespace collapse to one space.
export function toPlainText(markdown) {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
    .replace(/`+([^`]+?)`+/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/(\*\*|__)(\S(?:.*?\S)?)\1/g, "$2")
    .replace(/(^|[\s(])\*(\S(?:[^*]*?\S)?)\*(?=[\s).,;:!?]|$)/g, "$1$2")
    .replace(/(^|[\s(])_(\S(?:[^_]*?\S)?)_(?=[\s).,;:!?]|$)/g, "$1$2")
    .replace(/\\([\\`*_{}[\]()#+\-.!|])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

// Returns the plain text of the first prose paragraph of a Markdown page, or
// "" when the page has none. Headings, lists, tables, quotations, raw HTML,
// fenced code and HTML comments are skipped; a block that is skipped is skipped
// up to the next blank line, so a list item's continuation line is never read
// as a paragraph.
export function firstParagraph(markdown) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const paragraph = [];
  let fence = null;
  let inComment = false;
  let skipping = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (fence !== null) {
      if (line.startsWith(fence)) fence = null;
      continue;
    }
    if (inComment) {
      if (line.includes("-->")) inComment = false;
      continue;
    }
    const opener = line.match(FENCE_OPEN);
    if (opener) {
      if (paragraph.length > 0) break;
      fence = opener[1];
      continue;
    }
    if (line.startsWith("<!--")) {
      if (paragraph.length > 0) break;
      if (!line.includes("-->")) inComment = true;
      continue;
    }
    if (line === "") {
      if (paragraph.length > 0) break;
      skipping = false;
      continue;
    }
    if (paragraph.length === 0) {
      if (skipping) continue;
      if (HEADING.test(line)) continue;
      if (opensNonProseBlock(line)) {
        skipping = true;
        continue;
      }
    } else if (HEADING.test(line) || LIST_ITEM.test(line)) {
      // A heading or a list directly under the paragraph ends it.
      break;
    }
    paragraph.push(line);
  }
  return toPlainText(paragraph.join(" "));
}

// Shortens text to one description line of at most DESCRIPTION_LIMIT
// characters, cutting at a word boundary and marking the cut with an ellipsis.
export function toDescription(text) {
  if (text.length <= DESCRIPTION_LIMIT) return text;
  const room = text.slice(0, DESCRIPTION_LIMIT - 1);
  const cut = room.lastIndexOf(" ");
  return `${(cut > 0 ? room.slice(0, cut) : room).replace(/[\s,;:.]+$/, "")}…`;
}

function escapeLinkText(text) {
  return text.replace(/([[\]])/g, "\\$1");
}

function header(name, summary) {
  return [`# ${name}`, "", `> ${summary}`, ""];
}

// Renders llms.txt.
//   name      the product's name, the level-one heading
//   summary   one paragraph of plain text, the blockquote
//   fullUrl   the absolute address of llms-full.txt
//   sections  [{ label, pages: [{ title, url, description }] }], in order
export function renderIndex({ name, summary, fullUrl, sections }) {
  const out = header(name, summary);
  out.push(
    `Every page listed below, with its full Markdown text in the same order, is in [llms-full.txt](${fullUrl}).`,
    "",
  );
  for (const section of sections) {
    out.push(`## ${section.label}`, "");
    for (const page of section.pages) {
      const link = `[${escapeLinkText(page.title)}](${page.url})`;
      out.push(page.description ? `- ${link}: ${page.description}` : `- ${link}`);
    }
    out.push("");
  }
  return `${out.join("\n").trimEnd()}\n`;
}

// Renders llms-full.txt.
//   name, summary  as for renderIndex
//   pages          [{ url, body }], in order; body is the page's Markdown
export function renderFull({ name, summary, pages }) {
  const out = header(name, summary);
  for (const page of pages) {
    out.push("---", "", `Source: ${page.url}`, "", page.body.replace(/\r\n?/g, "\n").trim(), "");
  }
  return `${out.join("\n").trimEnd()}\n`;
}
