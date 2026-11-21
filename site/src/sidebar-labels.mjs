import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { publishedLanguages, SIDEBAR_LABELS, sidebarLabels, sourceLanguage, translatedTreePresent } from "./translations.mjs";

// The labels of the sidebar, in every published language.
//
// Every label the sidebar's configuration (astro.config.mjs and
// src/examples-sidebar.mjs) gives a group, a link or a badge is written once, in
// English, in SIDEBAR_LABELS, which is translated with the documentation, and
// the configuration names it by its key: a group or a link as `{ key, … }`, a
// badge as `badge: { key }`. labelSidebar() turns each key into what Starlight
// reads, the English label and its translation in each published language
// whose translation of the file gives one, and stops the build on an entry that
// writes its label in English, so the English labels have one home. The titles
// of the Examples section's tiers are headings of a page translated with the
// documentation, and src/examples-sidebar.mjs gives each tier's group its
// English title with its translations, which labelSidebar() keeps.
//
// A page of a published language shows the English sidebar with its links
// pointing at the pages in that language (src/routeData.ts), and takes every
// label the configuration gives from a second sidebar, which Starlight builds
// from the configuration with its labels in that language
// (localizeSidebarConfig()).

const defaultLang = sourceLanguage.lang;

// Starlight's label and translations for the label a key names: the English
// text, and the text of each published language whose translation differs.
// `subject` names what names the key, for the error.
function labelled(key, labels, subject) {
  const source = labels[""][key];
  if (!source) {
    throw new Error(
      `${subject} names the key "${key}", which ${SIDEBAR_LABELS} does not list: ` +
        `add the label there as a list item \`${key}\`: <label>, or name a key the file lists.`,
    );
  }
  const translations = {};
  for (const { locale } of publishedLanguages) {
    const label = labels[locale]?.[key];
    if (label && label.lang !== defaultLang) translations[label.lang] = label.text;
  }
  return { label: source.text, translations };
}

// A badge's text in every published language, from the key it names.
function labelledBadge(badge, entryLabel, labels) {
  if (typeof badge === "string" || typeof badge?.text === "string") {
    const text = typeof badge === "string" ? badge : badge.text;
    throw new Error(
      `The badge "${text}" of the sidebar entry "${entryLabel}" is written in English: add it to ` +
        `${SIDEBAR_LABELS} as a list item \`<key>\`: ${text}, and give the badge as { key: "<key>" }.`,
    );
  }
  if (!badge || !("key" in badge)) return badge;
  const { key, ...rest } = badge;
  const { label, translations } = labelled(key, labels, `The badge of the sidebar entry "${entryLabel}"`);
  return { ...rest, text: { [defaultLang]: label, ...translations } };
}

// One entry of the configuration, labelled as labelSidebar() describes; `group`
// is the English label of the group holding it, for the errors.
function labelEntry(entry, labels, group) {
  if (typeof entry !== "object" || entry === null || "autogenerate" in entry) return entry;
  const { key, ...rest } = entry;
  let result = rest;
  if (key !== undefined) {
    if ("label" in rest) {
      throw new Error(
        `The sidebar entry "${rest.label}" names the key "${key}" and also writes its label in English: ` +
          `its label is the one ${SIDEBAR_LABELS} gives the key, so remove its label.`,
      );
    }
    if ("translations" in rest) {
      throw new Error(
        `The sidebar entry naming the key "${key}" also gives translations: its translations are the ones ` +
          `the translated ${SIDEBAR_LABELS} gives the key, so remove them.`,
      );
    }
    const subject = group ? `A sidebar entry inside "${group}"` : "A sidebar entry at the top level";
    result = { ...labelled(key, labels, subject), ...rest };
  } else if ("label" in rest && !("translations" in rest)) {
    throw new Error(
      `The sidebar entry "${rest.label}" writes its label in English: add the label to ${SIDEBAR_LABELS} ` +
        `as a list item \`<key>\`: ${rest.label}, and name it in the entry with key: "<key>" in place of its label.`,
    );
  }
  const name = result.label ?? result.slug ?? result.link;
  if ("badge" in result) result = { ...result, badge: labelledBadge(result.badge, name, labels) };
  if (Array.isArray(result.items)) {
    const { label } = result;
    result = { ...result, items: result.items.map((item) => labelEntry(item, labels, label)) };
  }
  return result;
}

/**
 * The sidebar's configuration as Starlight reads it, from entries that name
 * their labels by key: each entry's `key` becomes its `label`, the English text
 * SIDEBAR_LABELS gives the key, and its `translations`, the label's text in each
 * published language whose translation differs from the English, by language
 * code; a badge `{ key }` becomes a badge whose `text` holds the English text
 * under the default language's code and each translation under its language's,
 * beside any other field the badge gives. A group's items are labelled the same
 * way. A page's slug, an entry listing a directory (`autogenerate`), and an
 * entry giving its `label` with its `translations` are kept as they are.
 *
 * Stops with an error on a key SIDEBAR_LABELS does not list, on an entry that
 * gives a `label` without `translations` or beside a `key`, and on a badge
 * written as text, each naming the entry: such a label would show in English in
 * every language.
 */
export function labelSidebar(entries, labels = sidebarLabels()) {
  return entries.map((entry) => labelEntry(entry, labels, undefined));
}

/**
 * Starlight's parsed sidebar configuration with the labels of one language: a
 * copy of `items` in which each entry's `label` is its translation in `lang`
 * where the entry's `translations` give one, and each badge whose text is a
 * record of languages shows its text in `lang`, else its English text. A
 * group's items are copied the same way. It reads no file.
 */
export function localizeSidebarConfig(items, lang) {
  return items.map((item) => {
    if (typeof item !== "object" || item === null) return item;
    const copy = { ...item };
    const translation = item.translations?.[lang];
    if (typeof translation === "string") copy.label = translation;
    if (item.badge && item.badge.text && typeof item.badge.text === "object") {
      copy.badge = { ...item.badge, text: item.badge.text[lang] ?? item.badge.text[defaultLang] };
    }
    if (Array.isArray(item.items)) copy.items = localizeSidebarConfig(item.items, lang);
    return copy;
  });
}

// Every labelled entry of a sidebar configuration, in configuration order, as
// the two sequences the built page shows: `labels` holds each group's and each
// link's label, a group's before its items'; `badges` holds each badge's text.
// Each expected entry records the English text and its translation in `lang`,
// when the entry has one.
function expectedLabels(items, lang, found = { labels: [], badges: [] }) {
  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;
    if (typeof item.label === "string") {
      found.labels.push({ english: item.label, expected: item.translations?.[lang] });
    }
    const text = item.badge?.text;
    if (text && typeof text === "object") {
      found.badges.push({ english: text[defaultLang], expected: text[lang] !== text[defaultLang] ? text[lang] : undefined });
    }
    if (Array.isArray(item.items)) expectedLabels(item.items, lang, found);
  }
  return found;
}

const NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };

// HTML text with its character references decoded.
function decodeEntities(text) {
  return text.replace(/&(?:#x([0-9a-f]+)|#(\d+)|([a-z]+));/gi, (match, hex, dec, name) => {
    if (hex) return String.fromCodePoint(parseInt(hex, 16));
    if (dec) return String.fromCodePoint(Number(dec));
    return NAMED_ENTITIES[name.toLowerCase()] ?? match;
  });
}

// The labels a built page's sidebar shows, in document order: the group labels
// and the link labels together, and the badges. The sidebar is the region inside
// <sl-sidebar-state-persist>; a group's label is the `large` span inside its
// `group-label` span, a link's label the first span inside its <a>.
function shownLabels(html) {
  const start = html.indexOf("<sl-sidebar-state-persist");
  const end = html.indexOf("</sl-sidebar-state-persist>", start);
  if (start < 0 || end < 0) return undefined;
  const region = html.slice(start, end);
  const token =
    /<span class="group-label[^"]*"[^>]*>\s*<span class="large[^"]*"[^>]*>([^<]*)<\/span>|<a\b[^>]*>\s*<span[^>]*>([^<]*)<\/span>|<span class="sl-badge[^"]*"[^>]*>([^<]*)<\/span>/g;
  const shown = { labels: [], badges: [] };
  for (const match of region.matchAll(token)) {
    if (match[3] !== undefined) shown.badges.push(decodeEntities(match[3]));
    else shown.labels.push(decodeEntities((match[1] ?? match[2]).trim()));
  }
  return shown;
}

// The expected entries that have a translation and are missing from `shown`,
// which must hold them, in order, as a subsequence: for each, the English text,
// the translation expected and what the page shows at the point where it was
// looked for.
function missingLabels(expected, shown, kind) {
  const misses = [];
  let at = 0;
  for (const { english, expected: translation } of expected) {
    if (translation === undefined) continue;
    const found = shown.indexOf(translation, at);
    if (found < 0) {
      misses.push({ kind, english, translation, shown: shown[at] ?? "(the end of the sidebar)" });
    } else {
      at = found + 1;
    }
  }
  return misses;
}

/**
 * An Astro integration that stops the build when a published language's built
 * pages show a sidebar label in English that has a translation. `sidebar` is
 * the configuration labelSidebar() returned. When the build is done, for each
 * published language whose translated tree is present it reads the language's
 * home page and takes, in document order, the group labels, the link labels
 * and the badges of the sidebar; every labelled entry of the configuration that
 * has a translation in the language must appear with that text, in
 * configuration order, as a subsequence of what the page shows (page titles
 * and autogenerated groups sit between the labels; badges are compared with
 * badges). All misses are collected, and one error lists each with its
 * language, the English label, the translation expected and the label the page
 * shows at that point. A build with no translated tree present checks nothing.
 */
export function sidebarLabelCheck(sidebar) {
  return {
    name: "aggrega-docs-sidebar-label-check",
    hooks: {
      "astro:build:done": ({ dir }) => {
        const problems = [];
        for (const { lang, locale } of publishedLanguages) {
          if (!translatedTreePresent(lang)) continue;
          const page = fileURLToPath(new URL(`${locale}/index.html`, dir));
          const shown = shownLabels(readFileSync(page, "utf-8"));
          if (!shown) {
            problems.push(`${lang}: ${page} has no sidebar to read.`);
            continue;
          }
          const expected = expectedLabels(sidebar, lang);
          const misses = [
            ...missingLabels(expected.labels, shown.labels, "label"),
            ...missingLabels(expected.badges, shown.badges, "badge"),
          ];
          for (const miss of misses) {
            problems.push(
              `${lang}: the ${miss.kind} "${miss.english}" is expected as "${miss.translation}" but the page shows "${miss.shown}"`,
            );
          }
        }
        if (problems.length > 0) {
          throw new Error(
            `A translated page's sidebar shows a label in English that has a translation:\n  ${problems.join("\n  ")}`,
          );
        }
      },
    },
  };
}
