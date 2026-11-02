// The Aggrega menu at the top of every page: the same entries, in the same order,
// as the home site's and the catalog's headers — the documentation, the catalog,
// the examples, and the GitHub repository — followed by the theme switch and the
// language picker (src/components/Header.astro).
//
// The home page and the catalog are separate sites on the same domain, so their
// addresses are root-relative paths outside this site's base, each under the
// page's language segment; the documentation's own entries are under this
// site's base, so a versioned build links within its version.

/** A path segment for a Starlight locale: "" for English, "ja/" for Japanese. */
const segment = (locale) => (locale ? `${locale}/` : "");

/** The Aggrega home page, at the domain's root, in a language. */
export function homeHref(locale) {
  return `/${segment(locale)}`;
}

/** The catalog's home page, in a language. */
export function catalogHref(locale) {
  return `/catalog/${segment(locale)}`;
}

/** A page of this site, by its route, in a language, under the site's base. */
export function docsHref(base, locale, route = "") {
  const root = base.endsWith("/") ? base : `${base}/`;
  return `${root}${segment(locale)}${route}`;
}

/** The repository the GitHub entry leads to. */
export const GITHUB_HREF = "https://github.com/aggrega-ai/aggrega-cli";

// The menu's labels are written in src/strings/site-nav.md and translated with
// the documentation; the header reads each language's labels from the module
// virtual:aggrega-docs/site-nav (siteNavLabels in src/translations.mjs).
