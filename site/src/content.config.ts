import path from "node:path";
import { readFile } from "node:fs/promises";
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import type { Loader, LoaderContext } from "astro/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import {
  corpusRoot,
  languageOf,
  publishedLanguages,
  routeOf,
  translatedPath,
  translationPackage,
} from "./translations.mjs";

// The documentation corpus is authored as plain Markdown, and no page sets its
// title in front matter, so each page's title is its first level-one heading.
// Starlight's docs schema requires a title; the loader below reads that heading
// at load time and supplies it before schema validation. The corpus is read in
// place from the repository root (the collection base is the parent of this
// project) — there is no second copy of any content under this project.
//
// Some pages do open with front matter: each runnable example's README carries a
// header saying what the example is. The docs schema declares none of its keys,
// so it drops them, and the heading scan skips the block, so a line inside it is
// never read as the title.
//
// The translated pages of each published language are read the same way, from
// the tree the documentation build generates for it (see src/translations.mjs),
// which holds the English pages' paths. A translated heading ends with the
// source heading's identifier, so the title is read without it.

function firstHeading(markdown: string): string | undefined {
  let inFence = false;
  const lines = markdown.split(/\r?\n/);
  if (lines[0] === "---") {
    const close = lines.findIndex((line, i) => i > 0 && (line === "---" || line === "..."));
    if (close > 0) lines.splice(0, close + 1);
  }
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = line.match(/^#\s+(.+?)\s*#*\s*$/);
    if (match) return match[1].trim();
  }
  return undefined;
}

// A page's id is its route (see routeOf): the root README is the site root,
// which the collection names "index", and a README inside a section anchors
// that section's route.
function generateId({ entry }: { entry: string }): string {
  return routeOf(entry) || "index";
}

// Whether a file is a page of a translated tree.
function isTranslated(filePath: string): boolean {
  const rel = path.relative(corpusRoot, path.resolve(filePath)).split(path.sep).join("/");
  return languageOf(rel) !== undefined;
}

// Wraps the glob loader so an absent title is filled from the first heading.
// parseData receives the on-disk file path, so the heading is read there,
// immediately before the schema validates the entry. The glob loader still
// owns discovery, rendering, digests, and the data store.
function corpusLoader(patterns: string[]): Loader {
  const inner = glob({ base: "..", pattern: patterns, generateId });
  return {
    name: "aggrega-docs-corpus",
    load: (context: LoaderContext) =>
      inner.load({
        ...context,
        parseData: async ({ id, data, filePath }) => {
          let resolved = data as Record<string, unknown>;
          if (filePath && !resolved.title) {
            const raw = await readFile(filePath, "utf-8");
            let title = firstHeading(raw);
            if (title && isTranslated(filePath)) {
              const { parseHeadingId } = await translationPackage();
              title = parseHeadingId(title).text;
            }
            if (title) resolved = { ...resolved, title };
          }
          return context.parseData({ id, data: resolved, filePath });
        },
      }),
  };
}

// The pages of the corpus, and the same pages in each published language's
// translated tree. The translation configuration (l10n/l10n.config.json,
// adapter.include) and the documentation bundle (scripts/build-docs-bundle.sh)
// read the same pages.
const pages = [
  "README.md",
  "install.md",
  "learn.md",
  "ai-assistants/**/*.md",
  "architecture/**/*.md",
  "authoring/**/*.md",
  "language-reference/**/*.md",
];
const excluded = ["!**/.aggrega/**", "!**/examples/**/charts/**", "!**/examples/**/dist/**"];

export const collections = {
  docs: defineCollection({
    loader: corpusLoader([
      ...pages,
      ...publishedLanguages.flatMap(({ lang }) => pages.map((page) => translatedPath(page, lang))),
      ...excluded,
    ]),
    schema: docsSchema(),
  }),
};
