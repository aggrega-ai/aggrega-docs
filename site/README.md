# Documentation site

An [Astro](https://astro.build) + [Starlight](https://starlight.astro.build)
static site that renders the documentation corpus in this repository. It is
served at `aggrega.ai/docs`.

## How it is built

- **Single source.** The site renders the Markdown in `architecture/`,
  `authoring/`, and `language-reference/` in place. There is no second copy of
  any page: the `docs` content collection (`src/content.config.ts`) points its
  loader at the repository root (`base: ".."`) and reads the same files the
  repository ships. Page titles come from each file's first heading, since the
  corpus carries no frontmatter.
- **Relative links.** Body prose links between pages are authored as relative
  Markdown paths (for example `../entities/component.md`). A remark plugin
  (`src/plugins/rewrite-relative-md-links.mjs`) rewrites those to the built
  route at render time, so they resolve as site links without editing any source
  file. Links are emitted route-relative, so they resolve under any base path.
- **Theme.** Colours, fonts, the logo, and the per-size tab icons come from the
  shared brand package, through Starlight's `customCss` and `logo` options and
  the page head. No brand value is retyped; every colour and size is a token
  reference. Code surfaces (inline, fenced, and callouts) all use the one shared
  dark surface.
- **Search.** Starlight's built-in Pagefind index provides client-side search
  over the built site. It is independent of any command-line search.
- **SEO.** Each page emits a self-referential canonical link, Open Graph and
  Twitter image tags backed by a generated per-page image (`src/pages/og/`), and
  a JSON-LD graph (a site descriptor, an article or API-reference descriptor, and
  a breadcrumb trail). A sitemap and `public/robots.txt` are served at the site
  root.

## Versions

Documentation versions are Git tags of this repository. The site is built once
per version from its tag; the latest version is served at `/docs` and every other
version under a version-prefixed path such as `/docs/v0.1`. Only the latest is
indexed — older versions emit `noindex,follow` and a canonical link to the latest
equivalent page — and a version switcher lists the available versions. The build
and per-version cache are driven from `deploy/web/docs` in the umbrella workspace;
the base path and latest flag for a single build come from the environment (see
`src/versioning.mjs`).

## Languages

English is the only active language. The full localisation structure — locale
routing, `hreflang` alternates, per-locale sitemaps, and a differential
translation-memory pipeline that only re-translates changed segments and
preserves a glossary of product names — is built and exercised behind an
environment flag (`DOCS_I18N_PROOF=1`, which adds a stub locale for testing), but
no translated content is shipped. Only the latest version is ever translated. The
pipeline lives in `deploy/web/i18n` in the umbrella workspace.

## Reference pages

The command reference pages under `language-reference/cli/` are authored by hand
and render as-is. The schema reference under `language-reference/schema/` is
generated from the machine-readable schemas (`scripts/gen-schema-reference.mjs`,
which reads `aggrega get-schema`) and committed so each tag renders without a
binary. Regenerate it after a schema change; it is deterministic.

## Develop

```sh
cd site
npm install
npm run build     # astro build -> dist/
npm run dev       # local preview
```

## Follow-ups

- Per-page meta descriptions fall back to a site tagline because the corpus has
  no frontmatter; a first-paragraph extraction (mirroring the title-from-heading
  approach) would improve them.
- Breadcrumb segments are humanised from route names, so an initialism such as
  "CLI" renders as "Cli" until a proper-noun map is added.
- Callout panels use the shared dark surface with the default per-type border; a
  per-type accent colour from the brand's semantic palette is a later refinement.
