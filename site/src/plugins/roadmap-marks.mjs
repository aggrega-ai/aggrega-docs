import path from "node:path";
import {
  ROADMAP_LABELS,
  languageOfRoute,
  roadmapLabels,
  routeOf,
  sourceLanguage,
  sourceRouteOf,
} from "../translations.mjs";

// Marks each item of the roadmap page as done, ongoing or not done, in every
// published language.
//
// The roadmap (roadmap.md) writes each item as a GitHub-flavoured task-list
// item: `- [x]` for finished work, `- [ ]` for work that is not. Wherever the
// Markdown is read as written — on GitHub, in llms-full.txt, through the
// documentation bundle — those are a ticked and an empty box. A list whose
// unticked items are under way is marked with an HTML comment on the line
// above it, which no reader of the rendered Markdown sees:
//
//   <!-- ongoing -->
//
//   - [ ] **A larger catalog.** …
//
// The translation tool keeps the boxes out of the text it translates and copies
// the comment as it is, so every language's page carries the same marks and
// marking an item changes no translation.
//
// On the site, each task-list item of the roadmap shows a mark in place of its
// bullet (src/styles/roadmap.css): a green box holding a tick for finished work,
// a half-filled box for work under way, and an empty box for work not started.
// The mark is not a form control. It holds, for screen readers only, the word
// for its state in the page's language, read from src/strings/roadmap.md
// (roadmapLabels in src/translations.mjs), and the search index leaves that
// word out. A word the language does not translate is said in English and
// marked as English. The comment is left out of the page.
//
// A comment marking anything but a list holding task-list items stops the
// build, naming the page. A task-list item on any other page keeps the box
// Markdown renders for it.

export const ONGOING_MARKER = "<!-- ongoing -->";

const ROADMAP_ROUTE = "roadmap";

/** Whether a corpus file, given relative to the corpus root, is the roadmap page in any language. */
export function isRoadmap(rel, contentRoot) {
  if (!rel.toLowerCase().endsWith(".md")) return false;
  const route = routeOf(rel, contentRoot);
  const language = languageOfRoute(route);
  return (language ? sourceRouteOf(route, language.locale) : route) === ROADMAP_ROUTE;
}

const isTaskItem = (node) => node.type === "listItem" && typeof node.checked === "boolean";

// The lists marked ongoing under `parent`, each marker taken out of the tree.
function takeOngoingLists(parent, file, lists = new Set()) {
  if (!Array.isArray(parent.children)) return lists;
  for (let i = 0; i < parent.children.length; i++) {
    const node = parent.children[i];
    if (node.type === "html" && node.value.trim() === ONGOING_MARKER) {
      const next = parent.children[i + 1];
      if (!next || next.type !== "list" || !next.children.some(isTaskItem)) {
        const where = file.path || (file.history && file.history[0]) || "the roadmap";
        throw new Error(`${where}: ${ONGOING_MARKER} must stand directly above a list holding task-list items`);
      }
      lists.add(next);
      parent.children.splice(i, 1);
      i -= 1;
      continue;
    }
    takeOngoingLists(node, file, lists);
  }
  return lists;
}

// The mark of one item: the box, holding the word a screen reader says for it.
function markNode(state, word, pageLang) {
  const wordProperties = { className: ["sr-only"] };
  if (word.lang !== pageLang) wordProperties.lang = word.lang;
  return {
    type: "roadmapMark",
    data: {
      hName: "span",
      hProperties: { className: ["roadmap-mark", `roadmap-mark-${state}`], dataPagefindIgnore: "" },
      hChildren: [{ type: "element", tagName: "span", properties: wordProperties, children: [{ type: "text", value: word.text }] }],
    },
  };
}

const WORD_OF_STATE = { done: "done", ongoing: "ongoing", open: "notDone" };

// Gives every task-list item under `parent` its mark in place of its box; an
// unticked item of a list marked ongoing is ongoing.
function markItems(parent, words, pageLang, ongoingLists) {
  if (!Array.isArray(parent.children)) return;
  const ongoing = ongoingLists.has(parent);
  for (const node of parent.children) {
    if (isTaskItem(node)) {
      const state = node.checked ? "done" : ongoing ? "ongoing" : "open";
      node.checked = null;
      node.data = { ...node.data, hProperties: { ...node.data?.hProperties, className: ["roadmap-item"] } };
      const mark = markNode(state, words[WORD_OF_STATE[state]], pageLang);
      // The mark leads the item's first paragraph, which holds the item's text,
      // and a space parts the word from that text for a screen reader.
      const first = node.children[0];
      if (first && first.type === "paragraph") first.children.unshift(mark, { type: "text", value: " " });
      else node.children.unshift(mark);
    }
    markItems(node, words, pageLang, ongoingLists);
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
      const missing = Object.values(WORD_OF_STATE).filter((key) => !labels[""][key]);
      if (missing.length > 0) {
        throw new Error(`${ROADMAP_LABELS} must list the words for the roadmap's marks; it lacks ${missing.join(" and ")}.`);
      }
    }
    const language = languageOfRoute(routeOf(rel, contentRoot));
    const words = labels[language?.locale ?? ""] ?? labels[""];
    markItems(tree, words, language?.lang ?? sourceLanguage.lang, takeOngoingLists(tree, file));
  };
}
