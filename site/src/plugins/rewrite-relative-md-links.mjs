import path from "node:path";

// Rewrites relative Markdown-file cross-links in body prose to their built
// route form.
//
// The documentation corpus is authored with source-relative links such as
// `../../architecture/04-entity-taxonomy.md` or `schemalibrary.md`.
// Because the corpus is loaded from a location outside the default content
// directory, the built-in relative-link resolution does not apply, so such
// links would otherwise ship unchanged into the HTML as `href="....md"` and
// fail to resolve. This plugin resolves each link against the current file,
// maps it to the page route using the same id rules as the content loader
// (root `README.md` is the site root; a section `README.md` is that section's
// route; every other `<path>.md` is `<path>`), and emits a route-relative
// href.
//
// The emitted href is route-relative — computed from the current page's route
// rather than pinned to a fixed prefix — so it resolves under any base path:
// the default build served at one root and a version-prefixed build served
// under a version segment resolve identically, because a relative href never
// encodes the base.
//
// Pages are served as trailing-slash directories, so a page at route
// `a/b/c` lives at the URL directory `.../a/b/c/`. Ascending one level per
// route segment reaches the base root; the target route is then appended.
// This is why a source link with N `../` steps becomes one with N+1 steps:
// the current page contributes an extra directory level that the source path,
// relative to the file rather than the route, did not account for.

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

// Maps a content-root-relative Markdown path to its route path, mirroring the
// content loader's id rules. Returns "" for the site root.
function toRoutePath(rel) {
  const withoutExtension = rel.replace(/\.md$/i, "");
  if (withoutExtension === "README") return "";
  if (withoutExtension.endsWith("/README")) {
    return withoutExtension.slice(0, -"/README".length);
  }
  return withoutExtension;
}

// Returns the rewritten href, or null when the link must be left untouched
// (absolute URLs, root-absolute paths, pure anchors, non-Markdown targets, or
// targets that resolve outside the corpus).
function rewriteUrl(url, currentRoutePath, currentFileDir) {
  if (!url) return null;
  if (url.startsWith("#")) return null; // pure anchor
  if (url.startsWith("//")) return null; // protocol-relative
  if (url.startsWith("/")) return null; // root-absolute
  if (SCHEME.test(url)) return null; // http:, https:, mailto:, ...

  const splitAt = url.search(/[?#]/);
  const pathPart = splitAt === -1 ? url : url.slice(0, splitAt);
  const suffix = splitAt === -1 ? "" : url.slice(splitAt);
  if (!pathPart.toLowerCase().endsWith(".md")) return null;

  const targetRel = path.posix.normalize(
    path.posix.join(currentFileDir, pathPart),
  );
  if (targetRel === ".." || targetRel.startsWith("../")) return null; // escapes the corpus

  const targetRoute = toRoutePath(targetRel);
  const depth =
    currentRoutePath === "" ? 0 : currentRoutePath.split("/").length;
  const ups = "../".repeat(depth);
  const down = targetRoute === "" ? "" : `${targetRoute}/`;
  const href = ups + down || "./";
  return href + suffix;
}

function walk(node, ctx) {
  if (!node || typeof node !== "object") return;
  if (
    (node.type === "link" || node.type === "definition") &&
    typeof node.url === "string"
  ) {
    const next = rewriteUrl(node.url, ctx.routePath, ctx.fileDir);
    if (next !== null) node.url = next;
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) walk(child, ctx);
  }
}

// contentRoot is the corpus root — the same directory the content loader reads
// from (the parent of this site project). Supplied by the site config so the
// route math mirrors the loader's id derivation from one source of truth.
export default function rewriteRelativeMdLinks(options = {}) {
  const { contentRoot } = options;
  return function transformer(tree, file) {
    const abs = file.path || (file.history && file.history[0]);
    if (!abs || !contentRoot) return;
    const rel = path.relative(contentRoot, abs).split(path.sep).join("/");
    if (!rel.toLowerCase().endsWith(".md")) return;
    const routePath = toRoutePath(rel);
    const dir = path.posix.dirname(rel);
    walk(tree, { routePath, fileDir: dir === "." ? "" : dir });
  };
}
