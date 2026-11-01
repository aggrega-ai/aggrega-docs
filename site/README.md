# Documentation site

An [Astro](https://astro.build) + [Starlight](https://starlight.astro.build)
static site that renders the documentation corpus in this repository. It is
served at `aggrega.ai/docs`.

## How it is built

- **Single source.** The site renders the repository's root `README.md`,
  `install.md` and `learn.md` and the Markdown in `ai-assistants/`,
  `architecture/`, `authoring/`, and `language-reference/` in place. There is no second copy of
  any page: the `docs` content collection (`src/content.config.ts`) points its
  loader at the repository root (`base: ".."`) and reads the same files the
  repository ships. Page titles come from each file's first heading, since the
  corpus carries no frontmatter; Starlight renders the title above the page, so
  a remark plugin (`src/plugins/drop-title-heading.mjs`) leaves that heading out
  of the rendered body, and the title shows once.
- **Sidebar.** The sidebar is configured in `astro.config.mjs`. It opens with a
  "Start here" group: the home, the pages for working with an AI assistant
  (`ai-assistants/`), Install (`install.md`), and the Learn Aggrega path
  (`learn.md`) — each page's address matching its place in the menu; the
  Authoring group lists the pages of `authoring/`. Every version is built with
  this one site project from its own tag's pages, and an entry naming a page the
  tag lacks would stop the build, so each entry that a published tag may lack
  goes through `present()`, which keeps it only where the corpus holds the page.
  A group nested in another group is labelled at the size of the links beside
  it, in bold (`src/styles/sidebar.css`), whichever group it sits in. A renamed
  page is listed under both its names, and a page that moved is listed at
  whichever of its paths the corpus holds (`src/moved-pages.mjs`), so the tags
  holding the old file and the tree holding the new one each keep the entry
  they hold.
- **Moved pages.** Every page that moved keeps its earlier address working. The
  build writes a `_redirects` file (`src/redirects.mjs`) answering each earlier
  address, in English and in every published language, with a permanent (301)
  redirect to the new one; a browser keeps the fragment it was asked for. A
  version whose corpus still holds a page at its earlier path gets no redirect
  for it. Workers static assets read `_redirects` at the root of a Worker's
  assets, above the directory of the pages, and the version build moves it
  there.
- **The home.** The root `README.md` is plain Markdown. A remark plugin
  (`src/plugins/docs-home.mjs`) wraps its body in `.docs-home` and marks a list
  whose items each open with one bold link as a row of cards;
  `src/styles/home.css` gives it the home site's type, cards and labelled
  install commands. Its translations get the same treatment.
- **Copyable text.** A blockquote with `<!-- copyable -->` on the line above it,
  such as the prompt for an AI assistant, is shown as a code block with a copy
  button (`src/plugins/copyable-blockquote.mjs`, `src/styles/copyable.css`). It
  is a blockquote rather than a fenced block so that the translation tool
  translates its sentences, keeping every inline code span byte for byte.
- **Relative links.** Body prose links between pages are authored as relative
  Markdown paths (for example `../entities/component.md`). A remark plugin
  (`src/plugins/rewrite-relative-md-links.mjs`) rewrites those to the built
  route at render time, so they resolve as site links without editing any source
  file. Links are emitted route-relative, so they resolve under any base path.
- **Theme.** Colours, fonts, the logo, and the per-size tab icons come from the
  shared brand package, through Starlight's `customCss` and `logo` options and
  the page head. No brand value is retyped; every colour and size is a token
  reference. Code follows the site theme: fenced and inline code sit on the
  brand's code surface, light in the light theme and dark in the dark theme, and
  the syntax colours are the brand's syntax role tokens (`src/code-themes.mjs`).
  Callouts use the shared dark surface.
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
- **Analytics.** The site counts visits with Cloudflare Web Analytics, the
  cookieless beacon the home site and the catalog load with the same site token,
  so it shows no consent banner. It is the one analytics script the site loads
  (`src/analytics.mjs`), and a build adds it to every page's head only when the
  environment holds the site token in `SITE_WEB_ANALYTICS_TOKEN`; a build
  without it, such as a local one, loads none, and a token not made of letters
  and digits stops the build, naming the variable. Every page's footer links to
  the privacy page the home site serves at the domain's root, in the page's
  language (`src/components/Footer.astro`).
- **Accessibility panel.** Every page carries the reader's accessibility panel,
  `@cognitio/a11y`, carried in `vendor/` (see `vendor/VENDORED.md`): its button
  at the bottom right, rendered in the browser by `src/components/PageFrame.astro`,
  which wraps Starlight's page frame in the element the panel's settings act
  inside. Its configuration, `src/a11y-config.json`, is the same on the home site
  and the catalog, so a reader's settings carry between the three; its texts are
  `src/strings/accessibility-panel.json`, and its stylesheet, the two reading
  fonts and the site's rules for it (`src/styles/a11y.css`) are in `customCss`.

## Versions

Documentation versions are minor versions, labelled like `v0.8`. Each is built
from the newest Git tag of this repository in that minor version — the tag's
pages, rendered by this site project — and served under a version-prefixed path
such as `/docs/v0.8`; the newest minor version is the latest, served at `/docs`
as well. Only the latest is indexed — older versions emit `noindex,follow` and a
canonical link to the latest equivalent page in the same language. The
per-version builds and their cache are driven from outside this repository; the
version label, base path and latest flag for a single build come from the
environment (see `src/versioning.mjs`).

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
Every translated page opens with a one-line notice, in its language, that it was
machine-translated, linking to the same page in English
(`src/components/Banner.astro`); an English page carries none. The notice is
written once, in English, in `src/strings/machine-translation-notice.md`, which
the translation configuration translates with the pages but the site never
publishes as a page; a language whose memory has no translation of it shows it
in English.
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
- The sidebar's group labels and the labels it gives an entry ("What is
  Aggrega", "Install"), the version selector's accessible label, the
  footer's privacy link label and the accessibility panel's texts are written in
  English in the site project and show in English on every language's pages.
- Callout panels use the shared dark surface with the default per-type border; a
  per-type accent colour from the brand's semantic palette is a later refinement.
