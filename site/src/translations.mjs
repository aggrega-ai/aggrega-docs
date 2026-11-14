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

// The notice at the top of every translated page, saying it was
// machine-translated and linking to the same page in English, is written once,
// in English, in the file MACHINE_TRANSLATION_NOTICE. The translation
// configuration translates that file with the pages, so the version build
// generates its translation into each language's tree beside them; the site
// shows each language's translation on that language's pages, and the English
// text where the memory has none (machineTranslationNoticeModule()). The labels
// of the menu at the top of every page are written and translated the same way,
// in the file SITE_NAV_LABELS (siteNavModule()).

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

/**
 * The machine-translation notice's source, relative to the corpus root. It is
 * translated with the pages and is not a page: the site never publishes it.
 */
export const MACHINE_TRANSLATION_NOTICE = "site/src/strings/machine-translation-notice.md";

/**
 * The source of the labels of the menu at the top of every page, relative to the
 * corpus root. Like the notice, it is translated with the pages and is not a page.
 */
export const SITE_NAV_LABELS = "site/src/strings/site-nav.md";

/** The link destination the notice's source writes, which the site replaces with the English page's address. */
const NOTICE_LINK_DESTINATION = "english-original";

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
 * The corpus-relative path of the English page a path is a copy of: a path in a
 * published language's translated tree without the tree's prefix, and any other
 * path as it is.
 */
export function englishPathOf(rel, root = corpusRoot) {
  const language = languageOf(rel, root);
  return language ? rel.slice(translatedPath("", language.lang, root).length) : rel;
}

/**
 * The route of a page from its Markdown path relative to the corpus root. A page
 * in a published language's translated tree is served under that language's
 * path segment, at the route its English page has. The content collection names
 * its entries with this, and the link rewriter computes its targets with it.
 */
export function routeOf(rel, root = corpusRoot) {
  const language = languageOf(rel, root);
  const route = englishRoute(englishPathOf(rel, root));
  if (!language) return route;
  return route === "" ? language.locale : `${language.locale}/${route}`;
}

/** The published language a route is served under, or undefined for an English route. */
export function languageOfRoute(route) {
  return publishedLanguages.find(({ locale }) => route === locale || route.startsWith(`${locale}/`));
}

/**
 * The route of the English page a route of a published language shows, given
 * that language's path segment: the route without the segment. A route that
 * does not start with the segment is returned as it is.
 */
export function sourceRouteOf(route, locale) {
  if (route === locale) return "";
  return route.startsWith(`${locale}/`) ? route.slice(locale.length + 1) : route;
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
 * The path of a language's translation of one of the site's own strings files,
 * which the translation configuration translates with the pages: undefined when
 * no translated tree of the language is present. A tree present without the file
 * stops with an error naming what the file holds, since that language would
 * show it in English with no sign of why.
 */
function translatedString(rel, lang, holds, root) {
  const { treesDir } = translationLayout(root);
  if (!existsSync(path.join(treesDir, lang))) return undefined;
  const file = path.join(root, translatedPath(rel, lang, root));
  if (!existsSync(file)) {
    throw new Error(
      `The translated pages of ${lang} are present without ${file}, ${holds} in ` +
        `that language: the translation configuration translates ${rel} with the pages.`,
    );
  }
  return file;
}

/** The site project's own directory, which the content collection's file paths are relative to. */
const siteProjectRoot = fileURLToPath(new URL("..", import.meta.url));

const NOTICE_LINK = new RegExp(String.raw`\[((?:\\.|[^\]\\])*)\]\(` + NOTICE_LINK_DESTINATION + String.raw`\)`, "g");

const unescapeMarkdown = (text) => text.replace(/\\([!-/:-@[-`{-~])/g, "$1");

// The notice's text, from its Markdown: one paragraph, outside any HTML comment,
// holding one link to NOTICE_LINK_DESTINATION; the text before the link, the
// link's text and the text after it, as plain text.
function noticeParts(markdown, file) {
  const paragraph = markdown.replace(/<!--[\s\S]*?-->/g, "").trim();
  if (/\n[ \t]*\r?\n/.test(paragraph)) {
    throw new Error(`${file} must hold one paragraph, the machine-translation notice; it holds more.`);
  }
  const text = paragraph.split(/\r?\n/).map((line) => line.trim()).join(" ");
  const links = [...text.matchAll(NOTICE_LINK)];
  if (links.length !== 1) {
    throw new Error(
      `${file} must hold exactly one link to ${NOTICE_LINK_DESTINATION}, the English page's address; ` +
        `it holds ${links.length}.`,
    );
  }
  const [link] = links;
  return {
    before: unescapeMarkdown(text.slice(0, link.index)),
    link: unescapeMarkdown(link[1]),
    after: unescapeMarkdown(text.slice(link.index + link[0].length)),
  };
}

/**
 * The machine-translation notice of each published language, by the language's
 * path segment: the language the text is in, the text before the link to the
 * English page, the link's text and the text after it, and the directory of the
 * language's translated pages relative to the site project, which a page's
 * content file sits under exactly when its text is the translation tool's.
 *
 * The text is the language's translation of MACHINE_TRANSLATION_NOTICE, which
 * the version build generates into the language's tree; a translation the
 * memory does not hold is generated as the English text, and is marked as
 * English. Without a translated tree the text is the English source. A
 * translated tree present without the notice stops with an error, since its
 * pages would show the notice in English with no sign of why.
 */
export function machineTranslationNotices(root = corpusRoot) {
  const sourceFile = path.join(root, MACHINE_TRANSLATION_NOTICE);
  const source = noticeParts(readFileSync(sourceFile, "utf-8"), sourceFile);
  const { treesDir } = translationLayout(root);
  return Object.fromEntries(
    publishedLanguages.map(({ lang, locale }) => {
      const tree = path.join(treesDir, lang);
      const entry = { tree: `${toPosix(path.relative(siteProjectRoot, tree))}/`, lang: sourceLanguage.lang, ...source };
      const file = translatedString(MACHINE_TRANSLATION_NOTICE, lang, "the machine-translation notice", root);
      if (!file) return [locale, entry];
      const parts = noticeParts(readFileSync(file, "utf-8"), file);
      const translated = parts.before !== source.before || parts.link !== source.link || parts.after !== source.after;
      return [locale, { ...entry, lang: translated ? lang : sourceLanguage.lang, ...parts }];
    }),
  );
}

const NOTICE_MODULE = "virtual:aggrega-docs/machine-translation-notice";

/**
 * A Vite plugin providing the module
 * `virtual:aggrega-docs/machine-translation-notice`: the notices
 * machineTranslationNotices() reads, as its default export, read once while the
 * site is configured.
 */
export function machineTranslationNoticeModule(root = corpusRoot) {
  const resolved = `\0${NOTICE_MODULE}`;
  return {
    name: "aggrega-docs-machine-translation-notice",
    resolveId: (id) => (id === NOTICE_MODULE ? resolved : undefined),
    load: (id) =>
      id === resolved ? `export default ${JSON.stringify(machineTranslationNotices(root))};` : undefined,
  };
}

// A label of the menu, from a line of its Markdown outside any HTML comment: a
// list item holding the label's key in inline code, then the label, after a
// colon a translation may write in its own script.
const LABEL_ITEM = /^\s*[-*+]\s+`([A-Za-z][A-Za-z0-9]*)`\s*[:：]?\s*(.*?)\s*$/;

function labelItems(markdown) {
  const labels = {};
  for (const line of markdown.replace(/<!--[\s\S]*?-->/g, "").split(/\r?\n/)) {
    const match = line.match(LABEL_ITEM);
    if (match && match[2] !== "") labels[match[1]] = unescapeMarkdown(match[2]);
  }
  return labels;
}

/**
 * The labels of the menu at the top of every page, by the path segment of the
 * language whose pages show them, English under "": for each key of
 * SITE_NAV_LABELS, the label's text and the language it is in.
 *
 * A language's labels are its translation of SITE_NAV_LABELS, which the version
 * build generates into the language's tree; a label the translation lacks, or
 * gives as the English text, is the English label, marked as English. Without a
 * translated tree every label is the English one. A translated tree present
 * without the file stops with an error.
 */
export function siteNavLabels(root = corpusRoot) {
  const sourceFile = path.join(root, SITE_NAV_LABELS);
  const source = labelItems(readFileSync(sourceFile, "utf-8"));
  if (Object.keys(source).length === 0) {
    throw new Error(`${sourceFile} must list the menu's labels, each a list item \`key\`: label; it lists none.`);
  }
  const english = Object.fromEntries(
    Object.entries(source).map(([key, text]) => [key, { text, lang: sourceLanguage.lang }]),
  );
  return Object.fromEntries([
    ["", english],
    ...publishedLanguages.map(({ lang, locale }) => {
      const file = translatedString(SITE_NAV_LABELS, lang, "the menu's labels", root);
      if (!file) return [locale, english];
      const translated = labelItems(readFileSync(file, "utf-8"));
      return [
        locale,
        Object.fromEntries(
          Object.keys(source).map((key) => {
            const text = translated[key];
            return [key, text && text !== source[key] ? { text, lang } : english[key]];
          }),
        ),
      ];
    }),
  ]);
}

const SITE_NAV_MODULE = "virtual:aggrega-docs/site-nav";

/**
 * A Vite plugin providing the module `virtual:aggrega-docs/site-nav`: the labels
 * siteNavLabels() reads, as its default export, read once while the site is
 * configured.
 */
export function siteNavModule(root = corpusRoot) {
  const resolved = `\0${SITE_NAV_MODULE}`;
  return {
    name: "aggrega-docs-site-nav",
    resolveId: (id) => (id === SITE_NAV_MODULE ? resolved : undefined),
    load: (id) => (id === resolved ? `export default ${JSON.stringify(siteNavLabels(root))};` : undefined),
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
