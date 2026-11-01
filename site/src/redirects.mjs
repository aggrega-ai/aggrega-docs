import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { holdsPage, movedPages } from "./moved-pages.mjs";
import { corpusRoot, publishedLanguages } from "./translations.mjs";

// The redirects that keep the earlier address of every moved page working
// (src/moved-pages.mjs lists them).
//
// The documentation is served as static assets, and a Worker serving static
// assets reads its redirects from a file named `_redirects` at the root of its
// assets: one rule per line, `<from> <to> <status>`, each `<from>` matched
// against the request's path exactly. The build writes that file into its
// output directory; the version build (deploy/web/docs/build-matrix.sh) moves
// it to the root of the Worker's assets, the directory above the pages.
//
// A page gets its redirects only in a version whose corpus holds it at its new
// path and not at its earlier one, so a version built from a tag that still
// holds the earlier path serves that page there and redirects nothing. A build
// with no redirect to write writes no file.
//
// Each earlier address is redirected with 301, the permanent status, under the
// build's base path, in English and in every published language, with and
// without its trailing slash, since a rule matches one path exactly. A rule's
// target carries no fragment, so a browser keeps the fragment of the address it
// was asked for: `…/authoring/setup/#connect-an-mcp-client` lands on
// `…/install/#connect-an-mcp-client`. The rules follow the order of the list,
// then English and the published languages in their published order, so the
// same corpus always gives the same file.

/** The file Workers static assets read redirects from. */
export const REDIRECTS_FILE = "_redirects";

/** The redirect rules of a build served under a base path, one string per rule. */
export function redirectRules(base, root = corpusRoot) {
  const prefix = base.replace(/\/+$/, "");
  const segments = ["", ...publishedLanguages.map(({ locale }) => `${locale}/`)];
  const rules = [];
  for (const { from, to } of movedPages) {
    if (!holdsPage(to, root) || holdsPage(from, root)) continue;
    for (const segment of segments) {
      const target = `${prefix}/${segment}${to}/`;
      rules.push(`${prefix}/${segment}${from} ${target} 301`);
      rules.push(`${prefix}/${segment}${from}/ ${target} 301`);
    }
  }
  return rules;
}

/** An Astro integration writing the build's redirect rules to `_redirects` in its output directory. */
export default function movedPageRedirects() {
  let base = "/";
  return {
    name: "aggrega-docs-moved-page-redirects",
    hooks: {
      "astro:config:done": ({ config }) => {
        base = config.base;
      },
      "astro:build:done": ({ dir, logger }) => {
        const rules = redirectRules(base);
        if (rules.length === 0) return;
        writeFileSync(new URL(REDIRECTS_FILE, dir), `${rules.join("\n")}\n`);
        logger.info(`${rules.length} redirect rules written to ${fileURLToPath(new URL(REDIRECTS_FILE, dir))}`);
      },
    },
  };
}
