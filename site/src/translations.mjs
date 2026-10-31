import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import list from "./languages.json" with { type: "json" };

// The languages the site publishes, and where their translated pages sit.
//
// The published list is src/languages.json: English, the language every page is
// written in, served unprefixed at /docs, and each translated language, served
// under its own path segment (/docs/ja/…). The segment is the language code in
// lower case, so zh-CN is served at /docs/zh-cn/. Every part of the site and of
// the version build that needs the list reads it through this module; adding a
// language is one line in that file.
//
// The translation tool translates into more languages than the site publishes,
// so the list is kept apart from the tool's own target list: a language goes on
// it once its translation is complete. A published language the tool does not
// translate stops the build, naming it.
//
// The translated pages are not part of the repository. The version build
// generates them for each version from that version's own pages and the
// translation memory, into the directory the translation tool writes to, one
// tree per language with the same paths as the English pages. Beside the trees
// it writes the list of pages that still hold English text because the memory
// has no translation for some of their text; those pages carry Starlight's
// notice that the page is not fully translated.
//
// The functions that read files resolve them from the corpus root, which is
// this module's location in the repository: they run while the site is
// configured and its content is loaded, and in the version build's helper,
// never inside the built pages. A built page receives what it needs from the
// configuration, as the module untranslatedPagesModule() provides.

/** The language every page is written in, served at the unprefixed root. */
export const sourceLanguage = { lang: list.source.lang, label: list.source.label };

/** The translated languages the site publishes, each with the path segment it is served under. */
export const publishedLanguages = list.published.map(({ lang, label }) => ({
  lang,
  label,
  locale: lang.toLowerCase(),
}));

/** The corpus root: the repository directory holding this site project and the pages. */
export const corpusRoot = fileURLToPath(new URL("../..", import.meta.url));

/** The translation tool's configuration, relative to the corpus root. */
export const TRANSLATION_CONFIG = "l10n/l10n.config.json";

/** The list of pages left partly in English, written beside the translated trees. */
const UNTRANSLATED_FILE = "untranslated-pages.json";

/** Starlight's `locales` setting: English as the root locale, then every published language. */
export function starlightLocales() {
  return Object.fromEntries([
    ["root", { label: sourceLanguage.label, lang: sourceLanguage.lang }],
    ...publishedLanguages.map(({ locale, label, lang }) => [locale, { label, lang }]),
  ]);
}

const toPosix = (p) => p.split(path.sep).join("/");

const layouts = new Map();

/**
 * Where the translated trees of a corpus sit, read from the translation tool's
 * configuration: the directory it writes every language's tree under, as an
 * absolute path and relative to the corpus root. Stops with an error when the
 * published list names a language the tool does not translate.
 */
export function translationLayout(root = corpusRoot) {
  if (layouts.has(root)) return layouts.get(root);
  const configPath = path.join(root, TRANSLATION_CONFIG);
  const config = JSON.parse(readFileSync(configPath, "utf-8"));
  const locales =
    typeof config.locales === "string"
      ? JSON.parse(readFileSync(path.resolve(path.dirname(configPath), config.locales), "utf-8"))
      : config.locales;
  const targets = new Set(locales.targets);
  const refused = publishedLanguages.filter(({ lang }) => !targets.has(lang)).map(({ lang }) => lang);
  if (refused.length > 0) {
    throw new Error(
      `The published language list (site/src/languages.json) names ${refused.join(", ")}, ` +
        `which ${TRANSLATION_CONFIG} does not translate: every published language must be ` +
        `one of its locales.targets.`,
    );
  }
  const treesDir = path.resolve(path.dirname(configPath), config.adapter.outDir);
  const layout = {
    configPath,
    memoryDir: path.resolve(path.dirname(configPath), config.memory.dir),
    treesDir,
    treesFromCorpus: toPosix(path.relative(root, treesDir)),
    untranslatedFile: path.join(treesDir, UNTRANSLATED_FILE),
  };
  layouts.set(root, layout);
  return layout;
}

/** The corpus-relative path of a language's copy of an English page. */
export function translatedPath(rel, lang, root = corpusRoot) {
  const { treesFromCorpus } = translationLayout(root);
  return treesFromCorpus ? `${treesFromCorpus}/${lang}/${rel}` : `${lang}/${rel}`;
}

/** Whether a translated tree of any published language is present in the corpus. */
export function hasTranslatedTrees(root = corpusRoot) {
  const { treesDir } = translationLayout(root);
  return publishedLanguages.some(({ lang }) => existsSync(path.join(treesDir, lang)));
}

// A page's route, from its Markdown path relative to the corpus root: the root
// README.md is the site root (""), a section's README.md is that section's
// route, and every other `<path>.md` is `<path>`.
function englishRoute(rel) {
  const withoutExtension = rel.replace(/\.md$/i, "");
  if (withoutExtension === "README") return "";
  if (withoutExtension.endsWith("/README")) return withoutExtension.slice(0, -"/README".length);
  return withoutExtension;
}

/**
 * The published language whose translated tree holds a corpus-relative path,
 * or undefined for any other path.
 */
export function languageOf(rel, root = corpusRoot) {
  return publishedLanguages.find(({ lang }) => rel.startsWith(translatedPath("", lang, root)));
}

/**
 * The route of a page from its Markdown path relative to the corpus root. A page
 * in a published language's translated tree is served under that language's
 * path segment, at the route its English page has. The content collection names
 * its entries with this, and the link rewriter computes its targets with it.
 */
export function routeOf(rel, root = corpusRoot) {
  const language = languageOf(rel, root);
  if (!language) return englishRoute(rel);
  const route = englishRoute(rel.slice(translatedPath("", language.lang, root).length));
  return route === "" ? language.locale : `${language.locale}/${route}`;
}

/** The published language a route is served under, or undefined for an English route. */
export function languageOfRoute(route) {
  return publishedLanguages.find(({ locale }) => route === locale || route.startsWith(`${locale}/`));
}

/**
 * The routes of the translated pages that still hold English text, as the
 * version build recorded them. Empty when no translated tree is present; an
 * error when the trees are present without the record, since every such page
 * would then go unmarked.
 */
export function untranslatedRoutes(root = corpusRoot) {
  if (!hasTranslatedTrees(root)) return new Set();
  const { untranslatedFile } = translationLayout(root);
  if (!existsSync(untranslatedFile)) {
    throw new Error(
      `The translated pages are present without ${untranslatedFile}, the list of pages ` +
        `that still hold English text; the documentation build writes it when it generates them.`,
    );
  }
  const byLanguage = JSON.parse(readFileSync(untranslatedFile, "utf-8"));
  return new Set(Object.values(byLanguage).flat());
}

const UNTRANSLATED_MODULE = "virtual:aggrega-docs/untranslated-pages";

/**
 * A Vite plugin providing the module `virtual:aggrega-docs/untranslated-pages`:
 * the routes untranslatedRoutes() reads, as its default export, read once while
 * the site is configured.
 */
export function untranslatedPagesModule(root = corpusRoot) {
  const resolved = `\0${UNTRANSLATED_MODULE}`;
  return {
    name: "aggrega-docs-untranslated-pages",
    resolveId: (id) => (id === UNTRANSLATED_MODULE ? resolved : undefined),
    load: (id) =>
      id === resolved
        ? `export default ${JSON.stringify([...untranslatedRoutes(root)].sort())};`
        : undefined,
  };
}

/**
 * The content of the list of translated pages that still hold English text: for
 * each published language, the routes of those pages, sorted, so the same input
 * always gives the same bytes.
 */
export function formatUntranslatedFile(routesByLanguage) {
  const ordered = Object.fromEntries(
    publishedLanguages.map(({ lang }) => [lang, [...(routesByLanguage[lang] ?? [])].sort()]),
  );
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

let l10nPackage;

// Named through a variable so that bundling a page which imports this module
// does not try to resolve the package: no built page loads it.
const TRANSLATION_PACKAGE = "@cognitio/l10n";

/**
 * The translation package, which the translated pages need to read the source
 * heading identifier each translated heading carries. It is loaded only when a
 * translated tree is present, which only the documentation build produces, and
 * the build installs the package where the site resolves it.
 */
export async function translationPackage() {
  l10nPackage ??= import(/* @vite-ignore */ TRANSLATION_PACKAGE).catch((error) => {
    throw new Error(
      "The translated pages need the translation package @cognitio/l10n, which the " +
        "documentation build installs beside the work tree it builds in; it could not be loaded.",
      { cause: error },
    );
  });
  return l10nPackage;
}
