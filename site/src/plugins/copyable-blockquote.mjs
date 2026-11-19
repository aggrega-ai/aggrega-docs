// Shows a marked blockquote as a block of text with a copy button.
//
// Some text is meant to be copied whole and pasted elsewhere, such as a prompt
// for an AI assistant. Written as a fenced code block it would carry a copy
// button but stay in English on every translated page, because the translation
// tool never translates code. So the corpus writes it as a blockquote, which is
// translated sentence by sentence while every inline code span — a command, a
// flag, an address — is kept byte for byte, and marks it with an HTML comment
// on the line above, which no reader of the Markdown sees:
//
//   <!-- copyable -->
//
//   > Set up Aggrega for me …
//   >
//   > 1. Run `aggrega version`. …
//
// On the site the marked blockquote becomes a code block holding its text,
// which Expressive Code renders with its copy button, inside an element of the
// class `copyable-block` (src/styles/copyable.css wraps its lines and sets them
// in the page's direction). The text is
// the blockquote's as a reader sees it: one line per paragraph, one line per
// list item with its number or bullet, a blank line between blocks, inline code
// kept between backticks so that whoever reads the pasted text can tell a
// command from the sentence around it, emphasis as its text, and a link as its
// text followed by its address in parentheses where the two differ. A translated page is transformed the same
// way, so the button copies the text in the page's language.
//
// The blockquote may hold paragraphs and lists only; anything else in it, or a
// marker with no blockquote after it, stops the build, naming the page.

export const COPYABLE_MARKER = "<!-- copyable -->";

const ABSOLUTE_URL = /^[a-z][a-z0-9+.-]*:/i;

function refuse(file, message) {
  const where = file.path || (file.history && file.history[0]) || "a page";
  throw new Error(`${where}: ${message}`);
}

function inlineText(nodes, file) {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
          return node.value.replace(/[ \t]*\r?\n[ \t]*/g, " ");
        case "inlineCode": {
          const fence = "`".repeat(Math.max(0, ...[...node.value.matchAll(/`+/g)].map((m) => m[0].length)) + 1);
          const pad = node.value.startsWith("`") || node.value.endsWith("`") ? " " : "";
          return `${fence}${pad}${node.value}${pad}${fence}`;
        }
        case "strong":
        case "emphasis":
        case "delete":
          return inlineText(node.children, file);
        case "link": {
          const text = inlineText(node.children, file);
          return text === node.url || !ABSOLUTE_URL.test(node.url) ? text : `${text} (${node.url})`;
        }
        case "break":
          return "\n";
        case "html":
          return "";
        default:
          return refuse(file, `a copyable blockquote holds ${node.type}, which it cannot show as text`);
      }
    })
    .join("");
}

function blockText(node, file) {
  switch (node.type) {
    case "paragraph":
      return inlineText(node.children, file).trim();
    case "list": {
      const items = node.children.map((item, index) => {
        const marker = node.ordered ? `${(node.start ?? 1) + index}. ` : "- ";
        const body = item.children.map((child) => blockText(child, file)).join("\n\n");
        return marker + body.replace(/\n/g, `\n${" ".repeat(marker.length)}`);
      });
      return items.join(node.spread ? "\n\n" : "\n");
    }
    default:
      return refuse(file, `a copyable blockquote holds ${node.type}, which it cannot show as text`);
  }
}

/** The text a copyable blockquote's button copies. */
export function copyableText(blockquote, file = {}) {
  return blockquote.children.map((child) => blockText(child, file)).join("\n\n");
}

function transform(parent, file) {
  if (!Array.isArray(parent.children)) return;
  for (let i = 0; i < parent.children.length; i++) {
    const node = parent.children[i];
    if (node.type === "html" && node.value.trim() === COPYABLE_MARKER) {
      const next = parent.children[i + 1];
      if (!next || next.type !== "blockquote") {
        refuse(file, `${COPYABLE_MARKER} must stand directly above a blockquote`);
      }
      parent.children.splice(i, 2, {
        type: "copyableBlock",
        data: { hName: "div", hProperties: { className: ["copyable-block"] } },
        children: [{ type: "code", lang: "text", meta: null, value: copyableText(next, file) }],
      });
      continue;
    }
    transform(node, file);
  }
}

export default function copyableBlockquote() {
  return function transformer(tree, file) {
    transform(tree, file);
  };
}
