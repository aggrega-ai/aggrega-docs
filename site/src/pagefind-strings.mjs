import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { publishedLanguages } from "./translations.mjs";

// The search dialog's own messages ("N results for …", "Load more results").
//
// The dialog is Pagefind's. In the browser it would pick its translation from
// the page's language, but the build of the dialog that ships in the npm package
// does that pick in a step that never runs, so every page shows the English
// messages. Starlight passes the dialog the `pagefind.*` strings of its own
// translation table instead, and has them for only a few languages. Pagefind
// itself carries a translation for most languages, bundled in the dialog's
// script and not exported; this module reads those tables from the installed
// package, chooses each published language's the way the dialog would (script
// and region, then region, then language), and hands them to Starlight as the
// language's `pagefind.*` strings (src/content.config.ts). No text is written
// or translated here. A published language Pagefind has no translation for
// stops the build, naming it.

const require = createRequire(import.meta.url);

// The Starlight keys of the strings the dialog takes, each the Pagefind key
// with the `pagefind.` prefix.
const KEYS = [
  "clear_search",
  "load_more",
  "search_label",
  "filters_label",
  "zero_results",
  "many_results",
  "one_result",
  "alt_search",
  "search_suggestion",
  "searching",
];

let tables;

/** Pagefind's translation tables, keyed by the lower-case language code of the file naming each. */
export function pagefindTables() {
  if (tables) return tables;
  const packageDir = path.dirname(require.resolve("@pagefind/default-ui/package.json"));
  const source = readFileSync(path.join(packageDir, "npm_dist/mjs/ui-core.mjs"), "utf-8");
  tables = new Map();
  const sections = source.split(/^\/\/ \.\.\/translations\/([^\n]+)\.json$/m);
  // split() with a capture group alternates: text, code, text, code, …
  for (let i = 1; i < sections.length; i += 2) {
    const match = sections[i + 1].match(/^var strings\d* = (\{[\s\S]*?\n\});$/m);
    if (match) tables.set(sections[i], new Function(`return ${match[1]}`)());
  }
  if (tables.size === 0) {
    throw new Error("Pagefind's translation tables were not found in @pagefind/default-ui: its build changed shape.");
  }
  return tables;
}

/** The table Pagefind's dialog would use for a language code, or undefined when it has none. */
export function pagefindTableFor(lang) {
  const all = pagefindTables();
  const parts = lang.toLowerCase().split("-");
  const [language, ...rest] = parts;
  const candidates = [];
  if (rest.length > 0) candidates.push(parts.join("-"));
  if (rest.length > 1) candidates.push(`${language}-${rest[rest.length - 1]}`);
  candidates.push(language);
  for (const candidate of candidates) if (all.has(candidate)) return all.get(candidate);
  return undefined;
}

/**
 * Starlight's `pagefind.*` strings for every published language, keyed by the
 * language code. Stops with an error naming each published language whose
 * dialog messages Pagefind has no translation for.
 */
export function pagefindStrings(languages = publishedLanguages) {
  const missing = [];
  const entries = [];
  for (const { lang } of languages) {
    const table = pagefindTableFor(lang);
    const data = table && Object.fromEntries(KEYS.map((key) => [`pagefind.${key}`, table[key]]));
    if (!data || Object.values(data).some((value) => typeof value !== "string" || value === "")) {
      missing.push(lang);
      continue;
    }
    entries.push([lang, data]);
  }
  if (missing.length > 0) {
    throw new Error(
      `The search dialog has no translated messages for ${missing.join(", ")}: Pagefind carries none for ` +
        `${missing.length === 1 ? "that language" : "those languages"}, so the dialog would show English on its pages.`,
    );
  }
  return entries;
}
