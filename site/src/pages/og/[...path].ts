import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OGImageRoute } from "astro-og-canvas";
import { convert } from "fontverter";
import { getCollection } from "astro:content";
import { colors } from "@aggrega-ai/brand";
import { languageOfRoute } from "../../translations.mjs";

// Per-page Open Graph image, one PNG per documentation page, served at
// /og/<page-id>.png under the site base. The visual is the brand card: the
// title and a short description in the brand sans typeface on the dark brand
// surface, with a lime accent rule down the leading edge and a subtle petrol
// wash in the background gradient.
//
// The renderer decodes raw SFNT font data (TrueType/OpenType), so the brand's
// distributed WOFF2 face is converted to TrueType once at build start and the
// result is handed to the image generator by path. Colours are taken from the
// brand token package so the card never drifts from the site palette.

function rgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

const require = createRequire(import.meta.url);
const woff2 = await readFile(
  require.resolve("@aggrega-ai/brand/fonts/spline-sans-latin.woff2"),
);
const sansTtf = Buffer.from(await convert(woff2, "truetype"));
const fontPath = join(tmpdir(), "aggrega-docs-og-spline-sans.ttf");
await writeFile(fontPath, sansTtf);

const surface = rgb(colors.neutral["900"]);
const petrol = rgb(colors.petrol["800"]);
const lime = rgb(colors.brand.lime);
const titleInk = rgb(colors.neutral["50"]);
const bodyInk = rgb(colors.neutral["300"]);

const TAGLINE = "Aggrega documentation";

// One card per English page: a page in another language shares its English
// page's card, since the card's typeface carries the Latin alphabet only.
const entries = await getCollection("docs", (entry) => !languageOfRoute(entry.id));
const pages = Object.fromEntries(entries.map((entry) => [entry.id, entry]));

export const { getStaticPaths, GET } = await OGImageRoute({
  pages,
  getImageOptions: (_path, page) => ({
    title: page.data.title ?? "Aggrega",
    description:
      typeof page.data.description === "string" && page.data.description
        ? page.data.description
        : TAGLINE,
    bgGradient: [surface, petrol],
    border: { color: lime, width: 24, side: "inline-start" },
    padding: 72,
    font: {
      title: { color: titleInk, size: 72, weight: "Bold", lineHeight: 1.1 },
      description: { color: bodyInk, size: 34, weight: "Normal", lineHeight: 1.4 },
    },
    fonts: [fontPath],
  }),
});
