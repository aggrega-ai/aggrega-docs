import path from "node:path";
import { languageOfRoute, routeOf } from "../translations.mjs";

// Gives the documentation's home the home site's look, from the plain Markdown
// of the corpus's root README.md and of its translation in every published
// language.
//
// The page stays Markdown that reads as it is anywhere else; the site adds only
// classes for src/styles/home.css to style:
//
// - the whole body is wrapped in an element of the class `docs-home`, so the
//   home's rules reach nothing outside it;
// - a list each of whose items opens with a paragraph holding nothing but one
//   bold link — `- **[Learn Aggrega](learn.md)**`, then the
//   item's text as a paragraph of its own — is given the class
//   `docs-home-cards` and shown as a row of cards, each card the link's page.
//
// Every string the page shows is the page's own, so a translated home shows its
// own language throughout.

const isWhitespace = (node) => node.type === "text" && node.value.trim() === "";

// Whether a list item opens with a paragraph holding one bold link and nothing else.
function opensWithBoldLink(item) {
  const first = item.children?.[0];
  if (!first || first.type !== "paragraph") return false;
  const content = first.children.filter((node) => !isWhitespace(node));
  if (content.length !== 1 || content[0].type !== "strong") return false;
  const inner = content[0].children.filter((node) => !isWhitespace(node));
  return inner.length === 1 && inner[0].type === "link";
}

/** Whether a corpus file, given relative to the corpus root, is the documentation's home in any language. */
export function isHome(rel, contentRoot) {
  if (!rel.toLowerCase().endsWith(".md")) return false;
  const route = routeOf(rel, contentRoot);
  return route === "" || languageOfRoute(route)?.locale === route;
}

export default function docsHome(options = {}) {
  const { contentRoot } = options;
  return function transformer(tree, file) {
    const abs = file.path || (file.history && file.history[0]);
    if (!abs || !contentRoot) return;
    const rel = path.relative(contentRoot, abs).split(path.sep).join("/");
    if (!isHome(rel, contentRoot)) return;
    for (const node of tree.children) {
      if (node.type === "list" && !node.ordered && node.children.length > 0 && node.children.every(opensWithBoldLink)) {
        node.data = { ...node.data, hProperties: { ...node.data?.hProperties, className: ["docs-home-cards"] } };
      }
    }
    tree.children = [
      {
        type: "docsHome",
        data: { hName: "div", hProperties: { className: ["docs-home"] } },
        children: tree.children,
      },
    ];
  };
}
