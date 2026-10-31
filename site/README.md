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
- **Files for AI assistants.** The latest version's build writes `llms.txt` and
  `llms-full.txt` at the site root (`src/pages/[file].txt.ts`, rendered by
  `src/llms/format.mjs`). `llms.txt` follows the [llmstxt.org](https://llmstxt.org)
  shape: the product's name, the opening paragraph of the root page as its
  summary, then one section per sidebar group listing each page by title, with
  the page's first paragraph cut to one line as its description. `llms-full.txt`
  carries the same pages' Markdown in the same order, each under its address,
  without the HTML comments a rendered page does not show; a comment inside a
  code block is kept.
  Both are built from the same content collection and sidebar as the pages, in
  sidebar order; a published page the sidebar does not link follows under
  "Other pages". The same input always produces the same bytes.

## Versions

Documentation versions are Git tags of this repository. Each version is built from
its own tag — the tag's pages, rendered by this site project — with its own base
path; the newest tag is the latest version, served at `/docs`, every other
version under a version-prefixed path such as `/docs/v0.1`. Only the latest is
indexed — older versions emit `noindex,follow` and a canonical link to the latest
equivalent page in the same language. The per-version builds and their cache are
driven from outside this repository; the version label, base path and latest flag
for a single build come from the environment (see `src/versioning.mjs`).

A drop-down above the sidebar, in the shape of the language picker, selects the
version. Each page renders its own version as the selected option, so it reads
correctly without script; in the browser the other versions are filled in from
one list, `/docs/versions.json`, served with the latest version, which marks the
latest. No version's pages carry the list, so an older version is never rebuilt
because a version was added or withdrawn. Choosing a version opens the same page
in the same language in that version. A page that version lacks is answered with
its not-found page, one per language, which links to that version's home page in
the same language (`src/pages/[...locale]/404.astro`).

## Languages

The site is published in English, served unprefixed at `/docs`, and in each
language on the published list, `src/languages.json`, served under its language
code in lower case (`/docs/ja/`, `/docs/zh-cn/`). The list names the languages
whose translation is complete; adding one is one line in that file. Every part of
the site reads the list through `src/translations.mjs`, and a language on it that
the translation configuration does not translate stops the build, naming it.

The translated pages are not part of the repository. Each version's are
generated when that version is built, from the tag's own pages and the
translation memory, with the translation tool and configuration of the checkout,
one tree per language with the English pages' paths. For each language the
build prints the share of the version's text the memory translates. Text the
memory does not translate stays in English, and a page holding any carries
Starlight's notice, in the page's language, that it is not fully translated.
A translated heading keeps its English heading's anchor, so a link to a section
resolves in every language. A build with no translated pages present, such as a
local one, serves every page of a published language in English with that notice.
The sidebar is the English sidebar, each page link pointing at the page in the
reader's language under its translated title; `llms.txt` and `llms-full.txt`
stay English.

The translation configuration sits in `l10n/` at the repository root: the
target languages, a glossary of the product names kept in English, and one
instruction file per language. Two workflows (`.github/workflows/l10n.yml` and
`l10n-collect.yml`) translate the corpus in batches and keep the machine
translations on the branch `l10n-memory`. Both run only when started by hand:
no push and no schedule starts a translation, which is paid for per run. They
install the translation package themselves, from its published archive kept
under `l10n/vendor/` and named in `l10n/cognitio-modules.json`, so the site
still builds from a plain clone and no credential is needed to install it. A
maintainer holding a credential for the package's host moves it to a newer
version with `sh l10n/install.sh --cwd l10n upgrade` at the repository root, and
commits the change.

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
- The sidebar's group labels and the version selector's accessible label are
  written in English in the site configuration and show in English on every
  language's pages; a translated page carries no notice that it was
  machine-translated.
- Callout panels use the shared dark surface with the default per-type border; a
  per-type accent colour from the brand's semantic palette is a later refinement.
