import type { APIRoute, GetStaticPaths } from "astro";
import config from "virtual:starlight/user-config";
// The sidebar and the route list are computed by Starlight itself, so the two
// files follow exactly the pages and the order the site publishes. Starlight
// exports neither helper from its package entry points, so they are imported by
// path; if a Starlight upgrade moves them, the build fails here rather than
// producing files that drift from the site.
import { getSidebarFromConfig } from "../../node_modules/@astrojs/starlight/utils/navigation.ts";
import { getLocaleRoutes } from "../../node_modules/@astrojs/starlight/utils/routing/index.ts";
import { resolveVersioning } from "../versioning.mjs";
import {
  firstParagraph,
  renderFull,
  renderIndex,
  toDescription,
} from "../llms/format.mjs";

// Generates llms.txt and llms-full.txt at the site root: a map of every
// published documentation page for an AI assistant, and the same pages' full
// Markdown text in one file. Both are built from the same content collection
// and the same sidebar the HTML pages are built from, so a page added, removed
// or reordered in the site is added, removed or reordered in both files.
//
// They are written for the latest version only. Older versions are served under
// a version-prefixed path and are not indexed, so they carry neither file.
//
// Pages appear in sidebar order, one section per sidebar group (a nested group
// is its own section, labelled with its parent's label first). A published page
// the sidebar does not list follows in a final section, in route order.

const { isLatest, base, site } = resolveVersioning();

// The section collecting published pages that no sidebar entry links to.
const UNLISTED_LABEL = "Other pages";

type Route = ReturnType<typeof getLocaleRoutes>[number];
type SidebarEntry = ReturnType<typeof getSidebarFromConfig>[number];
type Page = { title: string; url: string; description: string; body: string };
type Section = { label: string; pages: Page[] };

// The site-relative address a page is published at. Every page is a
// trailing-slash directory under the base; the site root is the base itself.
function hrefFor(id: string): string {
  return id === "" ? `${base}/` : `${base}/${id}/`;
}

function withTrailingSlash(path: string): string {
  return path.endsWith("/") ? path : `${path}/`;
}

function productName(): string {
  const title = config.title as string | Record<string, string>;
  if (typeof title === "string") return title;
  return title[config.defaultLocale.lang] ?? Object.values(title)[0];
}

function toPage(route: Route): Page {
  const body = route.entry.body;
  if (typeof body !== "string") {
    throw new Error(`llms.txt: the page "${route.id}" has no Markdown body to read`);
  }
  return {
    title: String(route.entry.data.title),
    url: new URL(hrefFor(route.id), site).href,
    description: toDescription(firstParagraph(body)),
    body,
  };
}

function collect() {
  const routes = getLocaleRoutes(undefined);
  const byHref = new Map<string, Route>();
  for (const route of routes) byHref.set(hrefFor(route.id), route);

  const sections: Section[] = [];
  const listed = new Set<string>();

  const walk = (entries: SidebarEntry[], trail: string[]) => {
    for (const entry of entries) {
      if (entry.type === "group") {
        walk(entry.entries, [...trail, entry.label]);
        continue;
      }
      // An absolute address is an external link, not a published page.
      if (/^[a-z][a-z0-9+.-]*:/i.test(entry.href)) continue;
      const href = withTrailingSlash(decodeURI(entry.href));
      const route = byHref.get(href);
      if (!route) {
        throw new Error(
          `llms.txt: the sidebar links "${entry.href}", which is not a published page`,
        );
      }
      if (listed.has(href)) continue;
      listed.add(href);
      const label = trail.length > 0 ? trail.join(" / ") : entry.label;
      const last = sections[sections.length - 1];
      if (last && last.label === label) last.pages.push(toPage(route));
      else sections.push({ label, pages: [toPage(route)] });
    }
  };
  walk(getSidebarFromConfig(config.sidebar, "", undefined), []);

  const unlisted = routes
    .filter((route) => !listed.has(hrefFor(route.id)))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(toPage);
  if (unlisted.length > 0) sections.push({ label: UNLISTED_LABEL, pages: unlisted });

  const home = byHref.get(hrefFor(""));
  if (!home || typeof home.entry.body !== "string") {
    throw new Error("llms.txt: the documentation has no root page to summarise");
  }
  const summary = firstParagraph(home.entry.body);
  if (!summary) {
    throw new Error("llms.txt: the root page has no opening paragraph to use as the summary");
  }

  const name = productName();
  const fullUrl = new URL(`${base}/llms-full.txt`, site).href;
  return {
    llms: renderIndex({ name, summary, fullUrl, sections }),
    "llms-full": renderFull({
      name,
      summary,
      pages: sections.flatMap((section) => section.pages),
    }),
  };
}

let files: ReturnType<typeof collect> | undefined;

export const getStaticPaths = (() =>
  isLatest
    ? [{ params: { file: "llms" } }, { params: { file: "llms-full" } }]
    : []) satisfies GetStaticPaths;

export const GET: APIRoute = ({ params }) => {
  files ??= collect();
  const text = files[params.file as keyof typeof files];
  return new Response(text, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
};
