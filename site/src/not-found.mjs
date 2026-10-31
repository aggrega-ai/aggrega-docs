import { access, rename, rmdir } from "node:fs/promises";
import { publishedLanguages } from "./translations.mjs";

// Gives each published language's not-found page the file name the host
// answers a missing page with. A host serving the built files answers a missing
// path with the nearest 404.html above it, so /docs/ja/<missing>/ needs
// /docs/ja/404.html. The site writes only its root not-found page under that
// name and every other page as a directory (ja/404/index.html), so after the
// build each language's page is moved to <language>/404.html.
export default function notFoundPages() {
  return {
    name: "aggrega-docs-not-found-pages",
    hooks: {
      "astro:build:done": async ({ dir }) => {
        for (const { locale } of publishedLanguages) {
          const built = new URL(`${locale}/404/index.html`, dir);
          await access(built);
          await rename(built, new URL(`${locale}/404.html`, dir));
          await rmdir(new URL(`${locale}/404/`, dir));
        }
      },
    },
  };
}
