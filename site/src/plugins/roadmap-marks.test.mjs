// Checks the roadmap's marks through the Markdown pipeline the site renders
// with: a task-list item of the roadmap shows a mark holding the word for its
// state — done, ongoing or not done — in the page's language, and a task-list
// item elsewhere keeps its box.
//   node --test src/plugins/roadmap-marks.test.mjs        (from site/)
//
// Each test reads a corpus laid out in a scratch directory: the translation
// configuration and the roadmap's strings file of this checkout, and a
// translated tree for Arabic whose strings file translates one word only.
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { pathToFileURL } from "node:url";
import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import { ROADMAP_LABELS, TRANSLATION_CONFIG, corpusRoot, translatedPath } from "../translations.mjs";
import roadmapMarks from "./roadmap-marks.mjs";

const PAGE = [
  "# Roadmap",
  "",
  "- [x] **Finished.** Shipped work.",
  "- [ ] **Ahead.** Work to come.",
  "",
  "## Under way",
  "",
  "<!-- ongoing -->",
  "",
  "- [ ] **Started.** Work under way.",
  "- [x] **Landed.** Work finished.",
  "",
].join("\n");

let root;
let processor;

async function render(rel, markdown = PAGE) {
  const { code } = await processor.render(markdown, { fileURL: pathToFileURL(path.join(root, rel)) });
  return code;
}

before(async () => {
  root = mkdtempSync(path.join(tmpdir(), "roadmap-marks-"));
  for (const rel of [TRANSLATION_CONFIG, ROADMAP_LABELS]) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    cpSync(path.join(corpusRoot, rel), path.join(root, rel));
  }
  const arabic = path.join(root, translatedPath(ROADMAP_LABELS, "ar", root));
  mkdirSync(path.dirname(arabic), { recursive: true });
  writeFileSync(arabic, "- `done`: منجز\n- `notDone`: Not done\n");
  processor = await createMarkdownProcessor({ remarkPlugins: [[roadmapMarks, { contentRoot: root }]] });
});

after(() => rmSync(root, { recursive: true, force: true }));

describe("roadmap marks", () => {
  it("marks the English roadmap's items with the English words, and renders no checkbox", async () => {
    const html = await render("roadmap.md");
    assert.doesNotMatch(html, /<input/);
    assert.match(
      html,
      /<li class="roadmap-item"><span class="roadmap-mark roadmap-mark-done" data-pagefind-ignore=""><span class="sr-only">Done<\/span><\/span> <strong>Finished\.<\/strong> Shipped work\.<\/li>/,
    );
    assert.match(
      html,
      /<li class="roadmap-item"><span class="roadmap-mark roadmap-mark-open" data-pagefind-ignore=""><span class="sr-only">Not done<\/span><\/span> <strong>Ahead\.<\/strong> Work to come\.<\/li>/,
    );
  });

  it("marks an unticked item of a list below the ongoing comment as ongoing, and leaves the comment out", async () => {
    const html = await render("roadmap.md");
    assert.match(
      html,
      /<li class="roadmap-item"><span class="roadmap-mark roadmap-mark-ongoing" data-pagefind-ignore=""><span class="sr-only">Ongoing<\/span><\/span> <strong>Started\.<\/strong> Work under way\.<\/li>/,
    );
    assert.match(
      html,
      /<li class="roadmap-item"><span class="roadmap-mark roadmap-mark-done" data-pagefind-ignore=""><span class="sr-only">Done<\/span><\/span> <strong>Landed\.<\/strong>/,
    );
    assert.doesNotMatch(html, /<!--/);
    assert.equal(html.match(/roadmap-mark-ongoing/g).length, 1);
  });

  it("stops on an ongoing comment that stands above no task list, naming the page", async () => {
    await assert.rejects(
      render("roadmap.md", "# Roadmap\n\n<!-- ongoing -->\n\nA paragraph.\n"),
      (error) => error.message.includes("roadmap.md") && error.message.includes("must stand directly above a list holding task-list items"),
    );
  });

  it("says a translated word in the page's language and an untranslated one in English, marked as English", async () => {
    const html = await render(translatedPath("roadmap.md", "ar", root));
    assert.match(html, /<span class="roadmap-mark roadmap-mark-done" data-pagefind-ignore=""><span class="sr-only">منجز<\/span><\/span>/);
    assert.match(
      html,
      /<span class="roadmap-mark roadmap-mark-ongoing" data-pagefind-ignore=""><span class="sr-only" lang="en">Ongoing<\/span><\/span>/,
    );
    assert.match(
      html,
      /<span class="roadmap-mark roadmap-mark-open" data-pagefind-ignore=""><span class="sr-only" lang="en">Not done<\/span><\/span>/,
    );
  });

  it("leaves a task-list item on any other page as Markdown renders it", async () => {
    const html = await render("learn.md");
    assert.doesNotMatch(html, /roadmap-/);
    assert.match(html, /<li class="task-list-item"><input type="checkbox" checked disabled> <strong>Finished\.<\/strong>/);
  });

  it("leaves the roadmap's plain list items with their bullets", async () => {
    const html = await render("roadmap.md", "# Roadmap\n\n- **Plain.** No box.\n");
    assert.doesNotMatch(html, /roadmap-/);
    assert.match(html, /<li><strong>Plain\.<\/strong> No box\.<\/li>/);
  });
});
