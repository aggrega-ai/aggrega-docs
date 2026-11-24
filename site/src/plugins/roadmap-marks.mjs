import path from "node:path";
import {
  ROADMAP_LABELS,
  languageOfRoute,
  roadmapLabels,
  routeOf,
  sourceLanguage,
  sourceRouteOf,
} from "../translations.mjs";

// Marks each item of the roadmap page as done or not done, in every published
// language.
//
// The roadmap (roadmap.md) writes each item as a GitHub-flavoured task-list
// item: `- [x]` for finished work, `- [ ]` for work ahead. Wherever the Markdown
// is read as written — on GitHub, in llms-full.txt, through the documentation
// bundle — those are a ticked and an empty box. The translation tool keeps the
// box out of the text it translates, so every language's page carries the same
// boxes and marking an item changes no translation.
//
// On the site, each such item of the roadmap shows a mark in place of its
// bullet: a green box holding a tick for finished work, an empty box for work
// ahead (src/styles/roadmap.css). The mark is not a form control. It holds, for
// screen readers only, the word for its state in the page's language, read
// from src/strings/roadmap.md (roadmapLabels in src/translations.mjs), and the
// search index leaves that word out. A word the language does not translate is
// said in English and marked as English.
//
// A task-list item on any other page keeps the box Markdown renders for it.

const ROADMAP_ROUTE = "roadmap";

/** Whether a corpus file, given relative to the corpus root, is the roadmap page in any language. */
export function isRoadmap(rel, contentRoot) {
  if (!rel.toLowerCase().endsWith(".md")) return false;
  const route = routeOf(rel, contentRoot);
  const language = languageOfRoute(route);
  return (language ? sourceRouteOf(route, language.locale) : route) === ROADMAP_ROUTE;
}

// The mark of one item: the box, holding the word a screen reader says for it.
function markNode(done, word, pageLang) {
  const wordProperties = { className: ["sr-only"] };
  if (word.lang !== pageLang) wordProperties.lang = word.lang;
  return {
    type: "roadmapMark",
    data: {
      hName: "span",
      hProperties: {
        className: ["roadmap-mark", done ? "roadmap-mark-done" : "roadmap-mark-open"],
        dataPagefindIgnore: "",
      },
      hChildren: [{ type: "element", tagName: "span", properties: wordProperties, children: [{ type: "text", value: word.text }] }],
    },
  };
}

// Gives every task-list item under `parent` its mark in place of its box.
function markItems(parent, words, pageLang) {
  if (!Array.isArray(parent.children)) return;
  for (const node of parent.children) {
    if (node.type === "listItem" && typeof node.checked === "boolean") {
      const done = node.checked;
      node.checked = null;
      node.data = { ...node.data, hProperties: { ...node.data?.hProperties, className: ["roadmap-item"] } };
      const mark = markNode(done, done ? words.done : words.notDone, pageLang);
      // The mark leads the item's first paragraph, which holds the item's text,
      // and a space parts the word from that text for a screen reader.
      const first = node.children[0];
      if (first && first.type === "paragraph") first.children.unshift(mark, { type: "text", value: " " });
      else node.children.unshift(mark);
    }
    markItems(node, words, pageLang);
  }
}

export default function roadmapMarks(options = {}) {
  const { contentRoot } = options;
  let labels;
  return function transformer(tree, file) {
    const abs = file.path || (file.history && file.history[0]);
    if (!abs || !contentRoot) return;
    const rel = path.relative(contentRoot, abs).split(path.sep).join("/");
    if (!isRoadmap(rel, contentRoot)) return;
    if (!labels) {
      labels = roadmapLabels(contentRoot);
      const missing = ["done", "notDone"].filter((key) => !labels[""][key]);
      if (missing.length > 0) {
        throw new Error(`${ROADMAP_LABELS} must list the words for the roadmap's marks; it lacks ${missing.join(" and ")}.`);
      }
    }
    const language = languageOfRoute(routeOf(rel, contentRoot));
    const words = labels[language?.locale ?? ""] ?? labels[""];
    markItems(tree, words, language?.lang ?? sourceLanguage.lang);
  };
}
