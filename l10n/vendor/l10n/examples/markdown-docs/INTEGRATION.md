# Adopting this example in the Aggrega documentation repository

What the documentation repository's own maintainers do to translate the corpus
with this example, in order. Each step ends with the check that shows it is
done. The paths are the documentation repository's: the corpus at its root, the
site under `site/`.

## 1. Copy the `l10n/` directory and the workflows

- Copy this example's `l10n/` directory to the repository's root, and
  `.github/workflows/l10n.yml` and `.github/workflows/l10n-collect.yml` to the
  repository's `.github/workflows/`.
- Vendor the package into `l10n/vendor/l10n/` with the `site-modules`
  repository's `scripts/vendor.sh l10n X.Y.Z l10n/vendor/l10n`, and commit the
  directory (see the package README, "Vendoring it").
- The workflows' Install step installs it from that directory alone, with the
  workflow-only install the package README states ("Without a `package.json`:
  only inside the translation workflow"), so the repository's root needs no
  `package.json`; `site/package.json` is the site's own and stays as it is.

**Check:** from the repository's root, with the package installed,
`npx l10n extract --config l10n/l10n.config.json` prints the corpus's file,
segment and word counts, and writes nothing outside `l10n/memory/`.

## 2. Declare the 14 locales in the site's internationalization configuration

- `site/astro.config.mjs` turns on locale routing with `DOCS_I18N_PROOF=1`: a
  root English locale, unprefixed, and the placeholder locale `xx`. Replace the
  placeholder with one locale per entry of `locales.targets` in
  `l10n/l10n.config.json`, each keyed by the directory the package writes it to
  under `l10n/` (`it`, `pt-BR`, `zh-CN`, …), with that tag as its `lang` and a
  `label` for the language picker.
- Read the list from `l10n/l10n.config.json` rather than copying it, so the
  configuration stays the one list of the target locales.

**Check:** a build with locale routing on offers English and the 14 target
languages in the language picker.

## 3. Point the content collection at `l10n/<locale>/`

- `site/src/content.config.ts` reads the corpus from the repository's root
  through the `docs` collection's glob loader. Add the translated trees to its
  patterns — for each target locale, `l10n/<locale>/README.md`,
  `l10n/<locale>/architecture/**/*.md`, `l10n/<locale>/authoring/**/*.md` and
  `l10n/<locale>/language-reference/**/*.md`, with the same exclusions as the
  source — and have `generateId` drop the leading `l10n/`, so a translated
  page's id is `<locale>/<path>` and `<locale>/README` becomes the locale's
  root.
- Those patterns never reach `l10n/memory/` or `l10n/prompts/`, which hold the
  memory and the prompt files.

**Check:** with locale routing on, `/docs/it/` renders `l10n/it/README.md`, and
a page that has no translation yet renders the English text the package copied
for it.

## 4. Register the heading-identifier plugin, and confirm an anchor resolves

- Every translated heading ends with `{#<source slug>}`. Add `remarkHeadingIds`,
  exported by `@aggrega-ai/l10n`, to `markdown.remarkPlugins` in
  `site/astro.config.mjs`, beside `rewriteRelativeMdLinks`: it strips the suffix
  and sets the heading's id (see the package README, "The syntax-tree plugin").
- The title loader in `site/src/content.config.ts` takes a page's title from
  its first `#` line, which on a translated page ends with the suffix: pass the
  heading through `parseHeadingId(heading).text`, also exported by the package.
- The site build then needs the package. Install it from the vendored
  directory in the build that turns locale routing on, and load the plugin only
  there, so the English site builds without it.

**Check:** build a translated page and confirm that each heading's `id`
attribute is the source page's slug and no `{#…}` text is shown; then follow an
anchor link from a translated page — a `page.md#some-heading` link written
against the source — and confirm it lands on its heading. Whether this site's
heading-id step keeps an identifier the plugin set is unverified until this
check passes.

## 5. Show the machine-translation notice on every translated page

- `site/src/components/Banner.astro` shows the notice on every page of a locale
  other than the root, and `site/astro.config.mjs` wires it only when
  `DOCS_I18N_PROOF=1`. Wire it under the same condition that turns on the 14
  locales, so no translated page is built without it.

**Check:** every built page under a target locale's path holds "This page was
machine-translated", and no English page does.

## 6. Add the deploy-time overlay

- In the build that publishes the translated site, after a checkout of every
  branch that persists no credential (`fetch-depth: 0`,
  `persist-credentials: false`) and after installing the package, run
  `npx l10n overlay --config l10n/l10n.config.json`, then
  `npx l10n generate --config l10n/l10n.config.json`, then the site build.
- A publishing build also runs `npx l10n gate --check --config l10n/l10n.config.json`
  as a blocking step, so it waits until every source segment has a translation.

**Check:** the build log prints the commit of `l10n-memory` the overlay read —
or, before the first translation run, that the build uses the committed memory —
and the published translated pages are the ones `generate` wrote.

## 7. Set the secrets and the watcher's token

- Both workflows read `ANTHROPIC_API_KEY`, the API key, in their `l10n ci` step
  alone; their Install step reads no secret. It is a
  repository secret: on GitHub Free, environment secrets are available only in
  public repositories. GitHub provides the job's own token; a ruleset on
  `l10n-memory`, if one is added, lets that token push the branch.
- A maintainer who runs the watcher, `npx l10n watch --config l10n/l10n.config.json`
  under a supervisor, keeps a token that can read this repository in
  `L10N_GIT_READ_TOKEN`, in the environment or in the dotenv file `--env-file`
  names. It needs read access and nothing more.

**Check:** a manual run of the translation workflow ends green and creates
`l10n-memory` — that run submits the first batch, which is billed — the
repository's Actions page then shows the collector enabled, and disabled again
after the run that collects the batch, which confirms the job's token may
switch it; and the watcher prints no idle message.

## 8. Run `doctor`

- From the repository's root: `npx l10n doctor --config l10n/l10n.config.json`.

**Check:** it prints eight passing lines and `doctor: all 8 checks passed.`, and
exits 0.

## 9. Expect the first full pass to spread across submissions

- The per-submission budgets the configuration sets in `backend.submission`
  hold a small part of the corpus's first full translation, so that translation
  spans many submissions, each made by a later run of either workflow once the
  batch before it has been collected. The README beside this file ("Cost
  planning") states the budgets, the most one submission can spend and what it
  is expected to spend, how many submissions the first pass takes, and the
  measured cost per language.

**Check:** `npx l10n submit --dry-run --config l10n/l10n.config.json` prints
the requests the first submission takes, per locale, and how many are left for
the next; it creates no client and no batch.
