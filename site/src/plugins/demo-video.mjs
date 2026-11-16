import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { languageOf, sourceLanguage } from "../translations.mjs";

// Shows Aggrega's demo video where a page marks it.
//
// The page writes an HTML comment, which no reader of the Markdown sees, with
// the video's caption as the paragraph directly under it:
//
//   <!-- demo-video -->
//
//   On aggrega.ai, this page shows a demo video that follows the AI track …
//
// On the site the two become a figure: a video that is downloaded and played
// only when the reader starts it (`preload="none"`, no autoplay), with the
// caption under it. The caption is a paragraph of the page, so the translation
// tool translates it with the page; it is worded to read on its own where the
// page is read without the player, as on GitHub.
//
// The video's files sit in this project's `public/video/`, published with the
// site: `aggrega-demo.web.mp4`, the poster `aggrega-demo.poster.jpg`, and one
// subtitle file `aggrega-demo.<lang>.vtt` per language, `<lang>` written as the
// published list writes it (`aggrega-demo.pt-BR.vtt`). A page carries one
// subtitle track, shown by default: its own language's where that file is
// present, and the English one where it is not. The addresses start at the
// build's base path (`/docs`, or a version's `/docs/v0.8`), so they hold on a
// page of any language, including a page a published language shows in
// English, which renders the English page under a deeper route. The video's
// width and height are given, so its place on the page is kept before it
// loads.
//
// A marker with no paragraph under it, or with the video or the English
// subtitles missing from `public/video/`, stops the build, naming the page.

export const DEMO_VIDEO_MARKER = "<!-- demo-video -->";

/** The directory the video's files are published from, and their address below the site root. */
const VIDEO_DIR = fileURLToPath(new URL("../../public/video/", import.meta.url));
const VIDEO_ROUTE = "video";

const VIDEO = "aggrega-demo.web.mp4";
const POSTER = "aggrega-demo.poster.jpg";
const trackFile = (lang) => `aggrega-demo.${lang}.vtt`;

/** The video's frame size. */
const WIDTH = 1920;
const HEIGHT = 1080;

function refuse(file, message) {
  const where = file.path || (file.history && file.history[0]) || "a page";
  throw new Error(`${where}: ${message}`);
}

/**
 * The subtitle track of a page in `language` (a published language, or
 * undefined for English), from the files `present` reports: that language's
 * file where present, the English one otherwise; null without the English one.
 */
export function demoVideoTrack(language, present) {
  if (language && present(trackFile(language.lang))) {
    return { file: trackFile(language.lang), lang: language.lang, label: language.label };
  }
  if (!present(trackFile(sourceLanguage.lang))) return null;
  return { file: trackFile(sourceLanguage.lang), lang: sourceLanguage.lang, label: sourceLanguage.label };
}

function figure(caption, ctx, file) {
  const present = (name) => existsSync(path.join(VIDEO_DIR, name));
  if (!present(VIDEO)) {
    refuse(file, `${DEMO_VIDEO_MARKER} shows ${VIDEO}, which ${VIDEO_DIR} does not hold`);
  }
  const track = demoVideoTrack(ctx.language, present);
  if (!track) {
    refuse(file, `${DEMO_VIDEO_MARKER} needs the English subtitles, ${trackFile(sourceLanguage.lang)}, in ${VIDEO_DIR}`);
  }
  const address = (name) => `${ctx.base}/${VIDEO_ROUTE}/${name}`;
  return {
    type: "demoVideo",
    data: { hName: "figure", hProperties: { className: ["demo-video"] } },
    children: [
      {
        type: "demoVideoPlayer",
        data: {
          hName: "video",
          hProperties: {
            controls: true,
            preload: "none",
            playsInline: true,
            width: WIDTH,
            height: HEIGHT,
            ...(present(POSTER) ? { poster: address(POSTER) } : {}),
          },
          hChildren: [
            { type: "element", tagName: "source", properties: { src: address(VIDEO), type: "video/mp4" }, children: [] },
            {
              type: "element",
              tagName: "track",
              properties: { kind: "subtitles", src: address(track.file), srcLang: track.lang, label: track.label, default: true },
              children: [],
            },
          ],
        },
      },
      { type: "demoVideoCaption", data: { hName: "figcaption" }, children: caption.children },
    ],
  };
}

function transform(parent, ctx, file) {
  if (!Array.isArray(parent.children)) return;
  for (let i = 0; i < parent.children.length; i++) {
    const node = parent.children[i];
    if (node.type === "html" && node.value.trim() === DEMO_VIDEO_MARKER) {
      const next = parent.children[i + 1];
      if (!next || next.type !== "paragraph") {
        refuse(file, `${DEMO_VIDEO_MARKER} must stand directly above the paragraph that captions the video`);
      }
      parent.children.splice(i, 2, figure(next, ctx, file));
      continue;
    }
    transform(node, ctx, file);
  }
}

// contentRoot is the corpus root, as the link rewriter takes it; base is the
// build's base path.
export default function demoVideo(options = {}) {
  const { contentRoot, base = "" } = options;
  return function transformer(tree, file) {
    const abs = file.path || (file.history && file.history[0]);
    if (!abs || !contentRoot) return;
    const rel = path.relative(contentRoot, abs).split(path.sep).join("/");
    if (!rel.toLowerCase().endsWith(".md")) return;
    const root = base.replace(/\/+$/, "");
    transform(tree, { language: languageOf(rel, contentRoot), base: root }, file);
  };
}
