// The one analytics script the site loads: Cloudflare Web Analytics, the
// cookieless beacon the home site and the catalog load with the same site
// token, so a visit is counted the same way on all three.
//
// A build adds the beacon to every page's head only when its environment holds
// the site token in SITE_WEB_ANALYTICS_TOKEN, which the deploy sets for a
// production deploy alone. A build without it — a local one, a development
// mirror, a dry run — loads no beacon and counts nothing, and the development
// server never loads it. The beacon sets no cookie, so the site shows no
// consent banner.
//
// No page or component writes an analytics or tag script itself: the page head
// (src/components/Head.astro) renders what analyticsModule() provides.

/** The environment variable holding the site token. */
export const ANALYTICS_VARIABLE = "SITE_WEB_ANALYTICS_TOKEN";

// The form the token must take. It is written into every page's HTML, so the
// form admits no quote or angle bracket.
const TOKEN_FORM = /^[A-Za-z0-9]+$/;

// Cloudflare's manual snippet, as its dashboard gives it.
const beacon = (token) =>
  `<script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "${token}"}'></script>`;

/**
 * The HTML of the analytics tags for an environment: the beacon when the
 * environment holds the token, nothing when it does not. A token not in its
 * form stops with an error naming the variable.
 */
export function analyticsTags(env) {
  const token = env[ANALYTICS_VARIABLE]?.trim();
  if (!token) return [];
  if (!TOKEN_FORM.test(token)) {
    throw new Error(
      `${ANALYTICS_VARIABLE} is not a Cloudflare Web Analytics site token: expected ${TOKEN_FORM}.`,
    );
  }
  return [beacon(token)];
}

const ANALYTICS_MODULE = "virtual:aggrega-docs/analytics";

/**
 * A Vite plugin providing the module `virtual:aggrega-docs/analytics`: the
 * HTML of the analytics tags, as its default export. A build reads the token
 * from the environment when the site is configured, so a token not in its form
 * stops the build before any page is rendered; the development server provides
 * no tags.
 */
export function analyticsModule(env = process.env) {
  const resolved = `\0${ANALYTICS_MODULE}`;
  let tags = [];
  return {
    name: "aggrega-docs-analytics",
    configResolved(config) {
      tags = config.command === "build" ? analyticsTags(env) : [];
    },
    resolveId: (id) => (id === ANALYTICS_MODULE ? resolved : undefined),
    load: (id) => (id === resolved ? `export default ${JSON.stringify(tags)};` : undefined),
  };
}
