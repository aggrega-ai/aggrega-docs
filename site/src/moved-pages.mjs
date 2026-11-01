import { existsSync } from "node:fs";
import path from "node:path";
import { corpusRoot } from "./translations.mjs";

// The pages that moved from one path of the corpus to another, each named by
// its route before the move (`from`) and its route now (`to`): its Markdown
// path relative to the corpus root, without `.md`.
//
// Two parts of the site read this list:
//
// - the sidebar (astro.config.mjs) lists a moved page at whichever of its paths
//   the corpus holds, so a version built from a tag that still holds the page
//   at its earlier path keeps the entry;
// - the redirects (src/redirects.mjs) answer each earlier address with a
//   permanent redirect to the page's address now, in English and in every
//   published language, in a version whose corpus holds the page at its new
//   path and not at its earlier one.
export const movedPages = [
  { from: "authoring/ai-assistant", to: "ai-assistants/set-up" },
  { from: "authoring/mcp-server", to: "ai-assistants/mcp-server" },
  { from: "authoring/skill", to: "ai-assistants/skill" },
  { from: "authoring/what-your-assistant-can-do", to: "ai-assistants/what-it-can-do" },
  { from: "authoring/setup", to: "install" },
  { from: "authoring/learn-aggrega", to: "learn" },
];

/** Whether the corpus holds a page at a route: `<route>.md`, or a section's `<route>/README.md`. */
export function holdsPage(route, root = corpusRoot) {
  return [`${route}.md`, `${route}/README.md`].some((file) => existsSync(path.join(root, file)));
}

/**
 * The route the corpus holds a page at, given the page's route now: that route
 * where the corpus holds it, else the route the page moved from where the
 * corpus holds that, else undefined.
 */
export function heldRoute(route, root = corpusRoot) {
  if (holdsPage(route, root)) return route;
  return movedPages.filter(({ to }) => to === route).map(({ from }) => from).find((from) => holdsPage(from, root));
}
