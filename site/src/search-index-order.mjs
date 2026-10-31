import { readFile, writeFile } from "node:fs/promises";

// Writes the search index's entry file with its languages in a fixed order.
// Pagefind, which Starlight runs when the build is done, lists one entry per
// language in pagefind/pagefind-entry.json in an order that changes from build
// to build, so two builds of the same pages would differ in that file alone.
// The languages are sorted by their code and nothing else in the file changes;
// the search reads each language's entry by its code, never by position. The
// integration is listed after Starlight's, so it runs once the index is written.
export default function searchIndexOrder() {
  return {
    name: "aggrega-docs-search-index-order",
    hooks: {
      "astro:build:done": async ({ dir }) => {
        const entry = new URL("pagefind/pagefind-entry.json", dir);
        let text;
        try {
          text = await readFile(entry, "utf-8");
        } catch (error) {
          if (error.code === "ENOENT") return;
          throw error;
        }
        const data = JSON.parse(text);
        const languages = Object.keys(data.languages ?? {}).sort();
        data.languages = Object.fromEntries(languages.map((code) => [code, data.languages[code]]));
        await writeFile(entry, JSON.stringify(data));
      },
    },
  };
}
