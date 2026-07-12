import { readFile } from "node:fs/promises";
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import type { Loader, LoaderContext } from "astro/loaders";
import { docsSchema } from "@astrojs/starlight/schema";

// The documentation corpus is authored as plain Markdown with no frontmatter,
// so each page's title is its first level-one heading. Starlight's docs schema
// requires a title; the loader below reads that heading at load time and
// supplies it before schema validation. The corpus is read in place from the
// repository root (the collection base is the parent of this project) — there
// is no second copy of any content under this project.

function firstHeading(markdown: string): string | undefined {
  let inFence = false;
  for (const line of markdown.split(/\r?\n/)) {
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

// A top-level README anchors the site root; a README inside a section anchors
// that section's route. Every other page keeps its path-derived id.
function generateId({ entry }: { entry: string }): string {
  const withoutExtension = entry.replace(/\.md$/, "");
  if (withoutExtension === "README") return "index";
  if (withoutExtension.endsWith("/README")) {
    return withoutExtension.slice(0, -"/README".length);
  }
  return withoutExtension;
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
            const title = firstHeading(raw);
            if (title) resolved = { ...resolved, title };
          }
          return context.parseData({ id, data: resolved, filePath });
        },
      }),
  };
}

export const collections = {
  docs: defineCollection({
    loader: corpusLoader([
      "README.md",
      "architecture/**/*.md",
      "authoring/**/*.md",
      "language-reference/**/*.md",
      "!**/.aggrega/**",
      "!**/examples/**/charts/**",
      "!**/examples/**/dist/**",
    ]),
    schema: docsSchema(),
  }),
};
