import { open, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fromHtml } from "hast-util-from-html";
import { renderThaiWords } from "@aggrega-ai/brand/thai-words";

// Lays out every Thai page so that a line breaks only between Thai words.
//
// Thai writes no space between words, and a browser's own dictionary breaks
// most technical loanwords in the middle (คอมไพเลอร์, แคตตาล็อก). Once the pages
// are written, each page whose language is Thai (<html lang="th">) is read
// again: the brand's renderer puts each Thai word of its text in
// <span class="thai-word">, which the brand's typography makes unbreakable,
// and a <wbr> between two adjacent Thai words. Code, the page head, scripts,
// hydrated islands and attribute values are left alone, and so is every byte
// outside the changed text. A page in any other language is not rewritten.
//
// The search index must read the laid-out pages, so this integration is listed
// before Starlight's: Astro runs the integrations' build-done hooks one after
// the other, in the order the configuration lists them, and Starlight builds
// the Pagefind index in its own. The markup adds no character, so the index
// holds the same words either way.
const LANG_THAI = /<html\b[^>]*\slang=["']?th(?:-[^"'\s>]*)?["'\s>]/i;
const HEAD_BYTES = 4096;

async function startsAsThaiPage(file) {
  const handle = await open(file, "r");
  try {
    const buffer = Buffer.alloc(HEAD_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, HEAD_BYTES, 0);
    return LANG_THAI.test(buffer.subarray(0, bytesRead).toString("utf8"));
  } finally {
    await handle.close();
  }
}

export default function thaiLineBreaks() {
  return {
    name: "aggrega-docs-thai-line-breaks",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const pages = (await readdir(root, { recursive: true }))
          .filter((path) => path.endsWith(".html"))
          .sort();
        let laidOut = 0;
        for (const page of pages) {
          const file = join(root, page);
          if (!(await startsAsThaiPage(file))) continue;
          const html = await readFile(file, "utf8");
          const out = renderThaiWords(html, { parse: fromHtml });
          if (out === html) continue;
          await writeFile(file, out);
          laidOut += 1;
        }
        if (laidOut > 0) logger.info(`${laidOut} Thai pages laid out to break lines between words`);
      },
    },
  };
}
