// Checks that the sidebar label check reads a Thai label through the line-break
// markup the build puts around Thai words before the check runs.
//   node --test src/sidebar-labels.test.mjs        (from site/)
//
// The page is laid out by the same renderer the build applies to a Thai page
// (src/thai-line-breaks.mjs), so the markup is the one a built page carries.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderThaiWords } from "@aggrega-ai/brand/thai-words";
import { fromHtml } from "hast-util-from-html";
import { missingChromeLabels, shownLabels, withoutThaiWordMarkup } from "./sidebar-labels.mjs";

const PAGE = [
  '<!DOCTYPE html><html lang="th"><head><title>Aggrega คืออะไร</title></head><body>',
  '<docs-version-select><span class="sr-only astro-r2">เวอร์ชันของเอกสาร</span></docs-version-select>',
  "<sl-sidebar-state-persist><ul>",
  '<li><a href="/docs/th/" aria-current="page" class="astro-oj"><span class="astro-oj">Aggrega คืออะไร</span></a></li>',
  '<li><details open><summary><span class="group-label astro-oj"><span class="large astro-oj">เริ่มที่นี่</span></span></summary>',
  '<ul><li><a href="/docs/th/install/" class="astro-oj"><span class="astro-oj">ติดตั้ง</span></a></li>',
  '<li><a href="https://hub.example/" class="astro-oj"><span class="astro-oj">แค็ตตาล็อก</span><span class="sl-badge default small astro-oj">ภายนอก</span></a></li></ul></details></li>',
  "</ul></sl-sidebar-state-persist>",
  '<p class="privacy-link astro-jo"><a href="/th/privacy/" lang="th" class="astro-jo">ความเป็นส่วนตัว</a></p>',
  "</body></html>",
].join("");

const LAID_OUT = renderThaiWords(PAGE, { parse: fromHtml });

const NAV_LABELS = {
  "": { privacy: { text: "Privacy" }, documentationVersion: { text: "Documentation version" } },
  th: {
    privacy: { text: "ความเป็นส่วนตัว", lang: "th" },
    documentationVersion: { text: "เวอร์ชันของเอกสาร", lang: "th" },
  },
};

describe("the sidebar label check on a Thai page", () => {
  it("is given a page that carries the line-break markup", () => {
    assert.match(LAID_OUT, /<span class="thai-word">/);
    assert.match(LAID_OUT, /<wbr>/);
    assert.match(LAID_OUT, /<span><span class="thai-word">/);
  });

  it("reads each group label, link label and badge as its text", () => {
    assert.deepEqual(shownLabels(LAID_OUT), {
      groups: ["เริ่มที่นี่"],
      links: ["Aggrega คืออะไร", "ติดตั้ง", "แค็ตตาล็อก"],
      badges: ["ภายนอก"],
    });
  });

  it("reads the same labels from the page with and without the markup", () => {
    assert.deepEqual(shownLabels(LAID_OUT), shownLabels(PAGE));
  });

  it("finds the footer's privacy link and the version selector's name", () => {
    assert.deepEqual(missingChromeLabels(LAID_OUT, "th", "th", NAV_LABELS), []);
  });

  it("still reports a label the page shows in English", () => {
    const english = LAID_OUT.replace(/(<p class="privacy-link[^>]*><a[^>]*>)[\s\S]*?(<\/a>)/, "$1Privacy$2");
    assert.deepEqual(missingChromeLabels(english, "th", "th", NAV_LABELS), [
      'th: the footer link "Privacy" is expected as "ความเป็นส่วนตัว" but the page shows "Privacy"',
    ]);
  });

  it("leaves a page with no Thai markup as it is", () => {
    const english = '<a href="/docs/install/" class="astro-x"><span class="astro-x">Install</span></a>';
    assert.equal(withoutThaiWordMarkup(english), english);
  });
});
