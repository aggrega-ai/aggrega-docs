import path from "node:path";
import { englishPathOf, languageOf, routeOf } from "../translations.mjs";

// Rewrites relative Markdown-file cross-links in body prose to their built
// route form, and re-anchors the relative images of a translated page to its
// English page.
//
// The documentation corpus is authored with source-relative links such as
// `../../architecture/04-entity-taxonomy.md` or `schemalibrary.md`.
// Because the corpus is loaded from a location outside the default content
// directory, the built-in relative-link resolution does not apply, so such
// links would otherwise ship unchanged into the HTML as `href="....md"` and
// fail to resolve. This plugin resolves each link against the current file,
// maps it to the page route with the function the content loader names its
// entries with (root `README.md` is the site root; a section `README.md` is
// that section's route; every other `<path>.md` is `<path>`; a page of a
// translated tree is under its language's path segment), and emits a
// route-relative href. A translated page holds the same relative links as its
// English page, inside a tree with the same paths, so its links reach the
// pages of its own language.
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
//
// Images are a different case. The site resolves a page's relative image from
// the page's own file, not from its route, so an English page's images need no
// rewriting. A translated page holds the same relative image paths as its English
// page, inside a tree with the same paths, but the images are not copied into the
// translated trees: they exist once, beside the English pages. So on a page of a
// translated tree each relative image path is resolved against the English
// page's directory and written relative to the translated page's own directory,
// and both pages show the same image file. This runs as a remark plugin, before
// the site collects a page's images, so the path it resolves is the rewritten one.

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

// Splits a relative URL into its path and its query-or-fragment suffix, or
// returns null for a URL that is not a relative path (absolute URLs,
// root-absolute paths, pure anchors).
function relativeParts(url) {
  if (!url) return null;
  if (url.startsWith("#")) return null; // pure anchor
  if (url.startsWith("//")) return null; // protocol-relative
  if (url.startsWith("/")) return null; // root-absolute
  if (SCHEME.test(url)) return null; // http:, https:, mailto:, data:, ...

  const splitAt = url.search(/[?#]/);
  return {
    pathPart: splitAt === -1 ? url : url.slice(0, splitAt),
    suffix: splitAt === -1 ? "" : url.slice(splitAt),
  };
}

// Returns the image path of a translated page re-anchored to its English page's
// directory, or null when the path must be left untouched (not a relative path,
// or one that resolves outside the corpus).
function reanchorImage(url, currentFileDir, englishFileDir) {
  const parts = relativeParts(url);
  if (parts === null) return null;
  const target = path.posix.normalize(path.posix.join(englishFileDir, parts.pathPart));
  if (target === ".." || target.startsWith("../")) return null; // escapes the corpus
  return path.posix.relative(currentFileDir, target) + parts.suffix;
}

// Returns the rewritten href, or null when the link must be left untouched
// (absolute URLs, root-absolute paths, pure anchors, non-Markdown targets, or
// targets that resolve outside the corpus).
function rewriteUrl(url, currentRoutePath, currentFileDir, contentRoot) {
  const parts = relativeParts(url);
  if (parts === null) return null;
  const { pathPart, suffix } = parts;
  if (!pathPart.toLowerCase().endsWith(".md")) return null;

  const targetRel = path.posix.normalize(
    path.posix.join(currentFileDir, pathPart),
  );
  if (targetRel === ".." || targetRel.startsWith("../")) return null; // escapes the corpus

  const targetRoute = routeOf(targetRel, contentRoot);
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
    const next = rewriteUrl(node.url, ctx.routePath, ctx.fileDir, ctx.contentRoot);
    if (next !== null) node.url = next;
  }
  if (node.type === "image" && ctx.englishFileDir !== null && typeof node.url === "string") {
    const next = reanchorImage(node.url, ctx.fileDir, ctx.englishFileDir);
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
    const routePath = routeOf(rel, contentRoot);
    const dirOf = (p) => {
      const dir = path.posix.dirname(p);
      return dir === "." ? "" : dir;
    };
    // The English page's directory, for a page of a translated tree only.
    const englishFileDir = languageOf(rel, contentRoot) ? dirOf(englishPathOf(rel, contentRoot)) : null;
    walk(tree, { routePath, fileDir: dirOf(rel), englishFileDir, contentRoot });
  };
}
