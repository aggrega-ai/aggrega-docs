# `@aggrega-ai/l10n` — build-time translation for block-composed sites and Markdown corpora

The package translates a site's source locale into its target locales at build
or CI time; nothing in it runs in a served site. It holds the engine (catalogue,
gate, two-layer translation memory, drift guard, materialization), two
translation backends — the Anthropic Messages API and Message Batches API through
the official SDK, and Claude Code run headless on a Claude subscription, with one
request builder for every transport — a JSON-content adapter for sites whose
content is JSON, block-composed or not, a Markdown adapter for documentation corpora, a
deterministic pseudo-localizer for tests and dry runs, and one command, `l10n`.
[`CHANGELOG.md`](CHANGELOG.md) lists what each version holds.

## Installing and wiring it

A project wires the package in the order below; `l10n doctor` then checks the
result. Both examples under [`examples/`](#examples) are wired this way, and
`doctor` passes in each.

### Vendoring it

A project carries the package's source in its own repository, at a version it
pins, and installs it from there. Its workflows and its contributors therefore
need no credential and no access to the package's host.

Each release is an archive on the tooling host, served only to a Basic
credential allowed the `l10n` publication; each consuming project, and each
customer, has a credential of its own, issued by the operator of the tooling
host. The script `scripts/vendor.sh` of the `site-modules` repository is the
one step that uses it, on a developer's machine, at the first install and at
each upgrade:

```sh
site-modules/scripts/vendor.sh l10n 1.1.0 vendor/l10n
```

It downloads `https://tooling.aggrega.ai/l10n/archives/l10n-1.1.0.tgz` with the
credential curl reads from `~/.netrc`
(`machine tooling.aggrega.ai login <username> password <password>`), unpacks
it into the directory it is given, replacing what a previous run put there,
and writes `VENDORED.json` beside the package naming the version, the URL and
the archive's sha256. The project reviews the change with `git diff` and
commits the directory. Moving to a new version is the same command with the
new version.

A project with a `package.json` depends on the vendored directory:

```json
"devDependencies": { "@aggrega-ai/l10n": "file:vendor/l10n" }
```

`npm install` links it into `node_modules/` and records its dependencies in
`package-lock.json`, so `npm ci` installs them from the public registry with no
credential. It links the `l10n` command into `node_modules/.bin/` and puts it
on the path of every npm script, so a project's scripts call it by name and
its workflows through `npx`:

```json
"i18n:check": "l10n gate --check"
```

### Without a `package.json`: only inside the translation workflow

A repository whose root has no `package.json`, and whose site builds without
the package, installs it in its translation workflow alone, from the vendored
directory, before the step that runs `l10n ci`:

```sh
npm install --no-save --no-audit --no-fund --install-links ./l10n/vendor/l10n
```

`--no-save` creates no `package.json` and no `package-lock.json`, and
`--install-links` installs the directory as a package with its dependencies
rather than as a link. A deploy build that runs the overlay below installs the
package the same way.

### The files a project carries

- **`l10n.config.json`** — the configuration ([reference](#the-configuration-file)):
  the locale set, the memory directory, the adapter, the backend, the mode, and
  for the CI mode the CI branch and the sync, for the local mode the `local`
  settings.
- **The glossary** — the do-not-translate terms, the site sentence and the
  terminology ([shape](#the-shape-of-the-glossary)).
- **The prompt files** — `<promptsDir>/<locale>.md` for every target locale,
  and optionally `<promptsDir>/_general.md` for what every language shares
  ([the system prompt](#the-system-prompt), [the method](#the-method)).
- **In the CI mode, the translation workflow and its collector** —
  `.github/workflows/l10n.yml` (or the file `ci.workflow` names) and
  `.github/workflows/l10n-collect.yml` (the file `ci.collector` names), copied
  from a template under `examples/` and adjusted: the working branch, the
  trigger paths, the configuration's path ([Running in CI](#running-in-ci)).
- **In the local mode, the pre-push hook, the `prepare` script that arms it,
  and the check workflow** — `.githooks/pre-push`, a `prepare` script in
  `package.json`, and `.github/workflows/l10n-check.yml`
  ([Translating locally](#translating-locally)).
- **An adapter of its own, only when neither shipped adapter fits** its content
  model. No configuration names one: it is an object with the methods the
  commands call — `extract()`, `pages()` and `generate()`, and for the commands
  that need them `materialize()`, `verifyDrift()` and `seedAlign()` — passed in
  code as `runCli(argv, { adapter })`. The
  configuration still validates in full, its `adapter` key included, and the
  injected adapter is used in place of the configured one.

### The CI secrets

In the CI mode, both workflows read one secret, by name, and one token GitHub
provides (the local mode's check workflow reads none; see
[The check workflow](#the-check-workflow)). The CI mode runs on the `anthropic`
backend, since `l10n ci` uses the Message Batches API:

| Name | Purpose | The step that reads it |
|---|---|---|
| `ANTHROPIC_API_KEY`, or the name `backend.apiKeyEnv` gives | The Anthropic API key `l10n ci` submits and collects batches with. Every request it pays for is made with it. | The `l10n ci` step alone. |
| `GITHUB_TOKEN` | Not a secret to create: GitHub gives every run one. The workflows' `permissions` let it push the CI branch (`contents: write`), and switch the collector and dispatch a workflow (`actions: write`). | The `l10n ci` step alone, as `${{ github.token }}`. |

The install needs no secret: the package is vendored ([Vendoring it](#vendoring-it)).
A CI-mode project keeps the API key as a **repository secret**: on GitHub Free, environment secrets are available only in public
repositories (GitHub's documentation, "Deployments and environments"). A
workflow receives a secret only where it names it, in a
`${{ secrets.<name> }}` expression, so no other secret reaches these two
workflows, and `doctor` checks that the API key's secret is named once in each,
in the `l10n ci` step. A name beginning `VITE_` is refused for the API key's
variable: Vite inlines such a variable into the client bundle it builds.

### Wiring the deploy-time overlay

The build that publishes the site takes the newest translations from the CI
branch rather than from the committed targets. After installing, it runs:

1. `npx l10n overlay`, which copies the CI branch's machine layer over the
   checkout's and prints the commit it read;
2. with the JSON-content adapter, `l10n extract` and `l10n verify-drift`, so a
   hand-edited target fails the build instead of vanishing, then
   `l10n materialize`; with the Markdown adapter, `l10n generate`;
3. the site's own build;
4. `l10n gate --check`, blocking for a publishing deploy and a report
   otherwise.

Its checkout fetches every branch and persists no credential
(`fetch-depth: 0`, `persist-credentials: false` for `actions/checkout`), so the
CI branch is readable with no token. [The deploy-time overlay](#the-deploy-time-overlay)
states what the command does when the branch cannot be read.

### The sync watcher and its token

`l10n watch`, run under a supervisor in the development environment, keeps the
working branch's derived files current: when the CI branch moves, it runs
`l10n sync`, which commits the machine layer and the paths `sync.paths` names,
regenerated by `sync.commands`, on top of `HEAD`, and pushes nothing
([Syncing a working branch](#syncing-a-working-branch)). Write each derived
command so it cannot install anything — `npx --no l10n materialize`, or an npm
script — since `npx` without `--no` installs a missing command from the
registry.

The watcher fetches only with a token, read at every poll from the variable
`sync.tokenEnv` names (default `L10N_GIT_READ_TOKEN`), in the environment or in
the dotenv file `--env-file` names. The token needs read access to the
project's own repository and nothing more: the watcher and the sync only fetch.
Without it the watcher says once that it is idle and keeps waiting.

### Checking the wiring: `l10n doctor`

```sh
npx l10n doctor                                  # the configuration at the repository root
npx l10n doctor --config l10n/l10n.config.json   # the configuration in a subdirectory
```

`doctor` prints one line per check, then a summary, and exits 1 when a check
does not pass:

1. **configuration** — the file is found as every command finds it, and
   validates;
2. **prompt files** — every target locale has a non-empty prompt file, and a
   general prompt file, when present, is not empty;
3. **glossary** — the configuration names one, it is a JSON object, its
   `do_not_translate_case`, when present, is `"insensitive"` or `"sensitive"`,
   and every entry object of `do_not_translate` is `{ "term", "case"? }`;
4. **API key variable** — `backend.apiKeyEnv`, or its default, is a variable
   name and does not begin `VITE_`; for the `claude-code` backend,
   `backend.tokenEnv`, the OAuth token's variable;
5. **workflow** — `.github/workflows/<ci.workflow>` exists at the repository
   root (the nearest directory at or above the configuration holding `.github`
   or `.git`) and holds every rule of [The workflows](#the-workflows), for the
   trigger paths this configuration implies, the working branch
   (`ci.dispatch.ref`, else the workflow's one push branch) and the API key's
   variable; when the configuration is not `l10n.config.json` at the
   repository root, the `l10n ci` step passes `--config <path>`;
6. **collector** — the configuration names `ci.collector`, and
   `.github/workflows/<ci.collector>` exists and holds every rule of
   [The workflows](#the-workflows) for the collector, passes `--config` as
   above, and shares the translation workflow's concurrency group;
7. **CI branch** — the configuration's `ci` key names `ci.branch`;
8. **derived commands and paths** — `sync.commands` and `sync.paths` each name
   at least one entry.

Under a local-mode configuration (`"mode": "local"`, read from the file as
written when it does not validate) the first four checks are the same, and the
CI-mode ones are replaced by:

5. **local commands and paths** — `local.commands` and `local.paths` each name
   at least one entry;
6. **pre-push hook** — `.githooks/pre-push` at the repository root exists, is
   executable, runs `l10n prepush` passing git's arguments (`"$@"`), and passes
   `--config <path>` when the configuration is not `l10n.config.json` at the
   repository root;
7. **prepare script** — the repository root's `package.json` has a `prepare`
   script that sets `core.hooksPath` to `.githooks`;
8. **check workflow** — `.github/workflows/l10n-check.yml` exists and holds
   every rule of [The check workflow](#the-check-workflow), for the trigger
   paths this configuration implies, with the same `--config` rule.

A check that needs the validated configuration is reported as not checked when
the configuration does not validate. `doctor` reads files only: it runs no git
command, makes no network call and writes nothing. It reads the workflow with a
reader of the YAML subset workflows are written in (block mappings and
sequences, one-line flow sequences, quoted and plain scalars, literal block
scalars, comments); a workflow using anything else — an anchor, a folded block
scalar, a multi-line plain scalar — fails the check as not readable, naming
the line, to be checked against the rules by hand.

### The method

Prompt files are the method of the FastAPI documentation's translations
(<https://fastapi.tiangolo.com/translations/>): a general prompt, and a short
file per language that a native speaker improves by editing it, so a correction
is made once rather than page by page. Here the general prompt has two owners:
the package's general rules, the same for every project, and the project's own
optional `_general.md`, for what all of its languages share; the per-language
files are the project's. This package adds page context with paragraph-level
memory, and the Message Batches API for unattended runs.

### Releasing a version

The package is the directory `packages/l10n/` of the `site-modules` repository,
beside the other modules. A release is a version and its tag:

1. Set `version` in `package.json` to the new version, and add its section to
   [`CHANGELOG.md`](CHANGELOG.md), above the previous one; commit both.
2. Push the commit, then the tag `l10n-v<version>`:

   ```sh
   git tag l10n-v1.1.0 && git push origin main l10n-v1.1.0
   ```

The tag starts the repository's `.github/workflows/release.yml`, which runs this
package's tests, refuses a tag whose version is not `package.json`'s, packs the
package, and uploads the archive as `l10n-<version>.tgz` to the tooling host's
bucket, where it is served as
`https://tooling.aggrega.ai/l10n/archives/l10n-<version>.tgz`. The workflow
reads two repository secrets: `TOOLING_R2_API_TOKEN`, a Cloudflare API token
that can write R2 objects in the bucket `tandem-tooling`, and
`CLOUDFLARE_ACCOUNT_ID`. A consumer's lockfile pins an archive's integrity, so
a published version is never tagged again: a new archive under the same name
breaks every lockfile that names it. The repository has no tag protection, so
anyone who can push to it can release.

The package directory holds everything it needs: its own test configuration
(`vitest.config.mjs`), its development dependency (`vitest`), and no import of
a path outside it, which a test asserts, so `npm install && npm test` pass in a
plain clone.

## The configuration file

A project carries one file, `l10n.config.json`. Every command finds it — through
`--config <path>`, else the `L10N_CONFIG` environment variable, else the nearest
`l10n.config.json` above the working directory — and validates it before it
reads anything else. An unknown key or a wrongly typed value stops the command
with exit 2 and names the key.

The project root is the directory holding the file; every relative path in it
resolves against that root. A path containing `{lang}` is a per-locale pattern.

The reference below is generated from the configuration's schema
(`src/config.mjs`), which carries each key's sentence, its readers and any
default applied outside the schema: every key, its type, its default, and the
commands that read it. `npm run reference` regenerates it, and a test fails
while the committed section differs from a fresh generation.

<!-- BEGIN GENERATED: config-reference -->

Generated from the schema in `src/config.mjs` by `npm run reference`: change a key there, then regenerate.

| Key | Type | Default | Read by | What it holds |
|---|---|---|---|---|
| `locales` | `string \| { source, targets }` | required | every command | The path of the project’s locale declaration, `{ "source": "it", "targets": ["en"] }`, read on every command; or the same object inline. Each code is a BCP 47 language tag of letters, digits and hyphens (`pt`, `pt-BR`, `zh-Hans`, `zh-Hant`), used as written in file names, paths and request identifiers; each target is listed once, and none is the source. |
| `memory.dir` | `string` | required | every command | The memory directory: the catalogue, the human layer `messages/`, the machine layer `machine/`, the pending file and the job logs; see [The memory](#the-memory-two-layers-one-writer-each). |
| `glossary` | `string` | none | `translate`, `pipeline`, `submit`, `collect`, `ci`, `local`, `prepush`, `doctor` | The glossary; see [The shape of the glossary](#the-shape-of-the-glossary). A command that translates runs without one, holding nothing verbatim and pinning no terminology; `doctor` reports its absence. |
| `promptsDir` | `string` | `<memory.dir>/prompts` | `translate`, `pipeline`, `submit`, `ci`, `local`, `prepush`, `doctor` | The directory of the prompt files: `<promptsDir>/<locale>.md` for every target locale, and the optional general prompt `<promptsDir>/_general.md`; see [The system prompt](#the-system-prompt). |
| `adapter.kind` | `"json-content" \| "markdown"` | required | `extract`, `translate`, `generate`, `materialize`, `pipeline`, `submit`, `ci`, `local`, `prepush`, `verify-drift`, `seed`, `doctor` | The adapter: `json-content` for a block-composed site’s JSON content, `markdown` for a Markdown corpus. Each takes the keys of its own table below. |
| `backend.kind` | `"anthropic" \| "claude-code"` | `"anthropic"` | `translate`, `pipeline`, `submit`, `collect`, `ci`, `local`, `doctor` | The translation backend: `anthropic`, the Anthropic Messages API and Message Batches API with an API key; `claude-code`, Claude Code run headless on a Claude subscription, one process per request, which has no batch transport (see [The Claude Code backend](#the-claude-code-backend)). `I18N_BACKEND`, when set, names the backend of one run. |
| `mode` | `"ci" \| "local"` | `"ci"` | `ci`, `overlay`, `sync`, `watch`, `local`, `prepush`, `doctor` | Where the project translates: `ci`, in CI through `l10n ci` (see [Running in CI](#running-in-ci)), or `local`, on the developer’s machine through `l10n local`, with `l10n prepush` refusing a push until it is translated (see [Translating locally](#translating-locally)). A local-mode configuration carries no `ci` and no `sync`; a CI-mode one carries no `local`. |
| `ci.branch` | `BranchName` | required in `ci` | `ci`, `overlay`, `sync`, `watch`, `doctor` | The CI branch: the branch holding the machine layer and the pending file, which only `ci` writes; see [Running in CI](#running-in-ci). |
| `ci.workflow` | `WorkflowFile` | `"l10n.yml"` | `doctor` | The file name, in the repository’s `.github/workflows/`, of the workflow that runs `l10n ci`. |
| `ci.collector` | `WorkflowFile` | none | `ci`, `doctor` | The file name, in the repository’s `.github/workflows/`, of the collector: the scheduled workflow that runs `l10n ci` while a batch is recorded. `ci` switches it on when it leaves a batch recorded and off when it leaves none; without this key `ci` switches nothing, and a batch is collected by the next push or a manual run. See [The collector](#the-collector). |
| `ci.dispatch.workflow` | `WorkflowFile` | required in `ci.dispatch` | `ci` | The workflow file `ci` asks GitHub to run after a collection that applied a translation; see [The dispatch](#the-dispatch). |
| `ci.dispatch.ref` | `BranchName` | required in `ci.dispatch` | `ci`, `doctor` | The branch that workflow runs on: the working branch. The configuration refuses a `ci.branch` equal to it. |
| `sync.commands` | `string[]` | `[]` | `sync`, `watch`, `doctor` | The derived commands `sync` runs, in order, each through the shell at the project root of a temporary worktree of `HEAD`; see [Syncing a working branch](#syncing-a-working-branch). `sync` needs `ci`. |
| `sync.paths` | `ProjectPath[]` | `[]` | `sync`, `watch`, `doctor` | The derived paths those commands regenerate, relative to the project root, which `sync` commits beside the machine layer. A path outside the repository, or one overlapping the machine layer, stops `sync` with exit 2. |
| `sync.tokenEnv` | `SecretName` | `"L10N_GIT_READ_TOKEN"` | `sync`, `watch` | The environment variable holding the read-only repository token `watch` fetches with, and `sync` when it is set. A name beginning `VITE_` is refused, as for `backend.apiKeyEnv`. |
| `sync.intervalSeconds` | `PositiveInteger` | `300` | `watch` | How often, in seconds, `watch` polls the CI branch. |
| `local.commands` | `string[]` | `[]` | `local`, `doctor` | The derived commands `local` runs, in order, each through the shell at the project root, after its last collection; see [Translating locally](#translating-locally). |
| `local.paths` | `ProjectPath[]` | `[]` | `local`, `prepush`, `doctor` | What the developer commits after a translation, relative to the project root: the machine layer and the paths those commands regenerate. `local` prints the `git add` of them, and `prepush` names it in a refusal; neither stages anything. |
| `local.pollSeconds` | `PositiveInteger` | `30` | `local` | How often, in seconds, `local` polls the batch it waits on. |

With `adapter.kind: "json-content"`:

| Key | Type | Default | Read by | What it holds |
|---|---|---|---|---|
| `adapter.content.source` | `LocalePath` | required | `extract`, `translate`, `generate`, `materialize`, `pipeline`, `submit`, `ci`, `local`, `prepush`, `verify-drift`, `seed`, `doctor` | The per-locale directory of the content files; with `{lang}` the source locale, where they are read. |
| `adapter.content.target` | `LocalePath` | required | `materialize`, `prepush`, `verify-drift`, `seed` | Where `materialize` writes each target locale’s content files, and what `verify-drift`, `seed` and `prepush` read there. |
| `adapter.content.staging` | `LocalePath` | required | `generate`, `pipeline`, `verify-drift` | Where `generate` writes each target locale’s content files, and what `verify-drift --scope staging` reads. |
| `adapter.content.usageLabel` | `string` | the source directory, relative to the root | `extract`, `translate`, `pipeline`, `submit`, `ci`, `local`, `prepush` | The prefix the catalogue’s usages and the request pages carry, with `{lang}` the source locale. |
| `adapter.ui.source` | `LocalePath` | required in `adapter.ui` | `extract`, `translate`, `generate`, `materialize`, `pipeline`, `submit`, `ci`, `local`, `prepush`, `verify-drift`, `seed`, `doctor` | The per-locale UI dictionary file; with `{lang}` the source locale, where it is read. |
| `adapter.ui.target` | `LocalePath` | required in `adapter.ui` | `materialize`, `prepush`, `verify-drift`, `seed` | Where `materialize` writes each target locale’s UI dictionary, and what `verify-drift`, `seed` and `prepush` read there. |
| `adapter.ui.staging` | `LocalePath` | required in `adapter.ui` | `generate`, `pipeline`, `verify-drift` | Where `generate` writes each target locale’s UI dictionary, and what `verify-drift --scope staging` reads. |
| `adapter.ui.usageLabel` | `string` | the source file, relative to the root | `extract`, `translate`, `pipeline`, `submit`, `ci`, `local`, `prepush` | The label the UI dictionary’s catalogue usages and its request page carry. |
| `adapter.ui.nested` | `boolean` | `false` | `extract`, `translate`, `generate`, `materialize`, `pipeline`, `submit`, `ci`, `local`, `prepush`, `verify-drift`, `seed` | Whether the dictionary is nested: `false`, a flat map whose top-level string values are its entries; `true`, every string at any depth of its objects and lists, keyed by its path (`menu.home`, `items[0]`), the generated dictionaries keeping the source’s shape. |
| `adapter.langMap` | `string` | none | `generate`, `materialize`, `pipeline`, `prepush`, `verify-drift`, `seed` | The language map, `{ "pairs": [{ "<source>": "/a/", "<target>": "/b/" }] }`: a pair names a source page’s path in a target locale, and with `output.pairs: "langMap"` which pages have one. Without it, a target path follows `output.path`. |
| `adapter.document.walk` | `"blocks" \| "whole" \| "auto"` | `"blocks"` | `extract`, `translate`, `generate`, `materialize`, `pipeline`, `submit`, `ci`, `local`, `prepush`, `verify-drift`, `seed` | How a content file is walked: `blocks`, the page-level fields and each `blocks[].data`; `whole`, every key of the file, under the same field rules, with leaf paths relative to the file; `auto`, a file holding a `blocks` array as `blocks` and any other file as `whole`. |
| `adapter.document.contextKey` | `string` | none | `extract`, `translate`, `generate`, `materialize`, `pipeline`, `submit`, `ci`, `local`, `prepush`, `verify-drift`, `seed` | For a file walked whole, the top-level key whose string or number value names the advisory context of its leaves (`<value>:<key>`), as a block’s `name` does for a block’s leaves; without it, or without that key in the file, the context is `document:<key>`. |
| `adapter.output.path` | `"prefixed" \| "neutral"` | `"prefixed"` | `generate`, `materialize`, `pipeline`, `prepush`, `verify-drift`, `seed` | A target page’s `path`: `prefixed`, the source path under the locale prefix (`/servizi/` → `/en/servizi/`); `neutral`, the source path unchanged, for a site that adds the prefix itself. A pair in the language map wins in both. A file with no string `path` gets none. |
| `adapter.output.langField` | `boolean` | `true` | `generate`, `materialize`, `pipeline`, `prepush`, `verify-drift`, `seed` | Whether a generated page carries `lang` set to its locale. With `false` a page carries `lang` only where its source does, set to the target locale. |
| `adapter.output.keyOrder` | `"sorted" \| "source"` | `"sorted"` | `generate`, `materialize`, `pipeline`, `prepush`, `verify-drift`, `seed` | The key order of every generated file, content and UI dictionary: `sorted`, alphabetical at every level; `source`, the source file’s. |
| `adapter.output.pairs` | `"all" \| "langMap"` | `"all"` | `generate`, `materialize`, `pipeline`, `prepush`, `verify-drift`, `seed` | Which source pages have a page in a target locale: `all`, every one; `langMap`, only a page whose `path` the language map pairs with that locale. An unpaired page is never generated, materialized, compared or seeded; it is still extracted and translated. |
| `adapter.output.fileName` | `"source" \| "path"` | `"source"` | `generate`, `materialize`, `pipeline`, `prepush`, `verify-drift`, `seed` | A generated content file’s name: `source`, the source file’s; `path`, its target `path` with the outer slashes removed and every other `/` written `-` (`/collezioni/self-levelling/` → `collezioni-self-levelling.json`, `/` → `index.json`), or the source file’s for a file with no `path`. |
| `adapter.output.materialize` | `"replace" \| "safe"` | `"replace"` | `materialize` | What `materialize` writes: `replace`, every generated file; `safe`, a file only when none of its leaves falls back to the source text and, when the file exists, none of the leaves it would replace or remove is hand-edited (see [Materializing safely](#materializing-safely)). |
| `adapter.fields.denylistKeys` | `string[]` | required | `extract`, `translate`, `generate`, `materialize`, `pipeline`, `submit`, `ci`, `local`, `prepush`, `verify-drift`, `seed` | Keys whose whole subtree is never translated, matched case-insensitively: assets, references, style tokens. |
| `adapter.fields.pageFields` | `Record<string, string[]>` | required | `extract`, `translate`, `generate`, `materialize`, `pipeline`, `submit`, `ci`, `local`, `prepush`, `verify-drift`, `seed` | The page-level fields translated, per sibling object of `blocks`, for example `{ "seo": ["title", "description"] }`; no other page-level field is. |
| `adapter.fields.valueGuards.refPrefixes` | `string[]` | required | `extract`, `translate`, `generate`, `materialize`, `pipeline`, `submit`, `ci`, `local`, `prepush`, `verify-drift`, `seed` | A string beginning with one of these — a path, a URL, an anchor — is not translated. |
| `adapter.fields.valueGuards.assetExtensions` | `string[]` | required | `extract`, `translate`, `generate`, `materialize`, `pipeline`, `submit`, `ci`, `local`, `prepush`, `verify-drift`, `seed` | A string ending in one of these file extensions, written without the dot and optionally followed by a query string, is not translated. |
| `adapter.fields.valueGuards.excludeNumbers` | `boolean` | required | `extract`, `translate`, `generate`, `materialize`, `pipeline`, `submit`, `ci`, `local`, `prepush`, `verify-drift`, `seed` | Whether a string holding a bare number is left untranslated. |
| `adapter.fields.valueGuards.excludeBooleans` | `boolean` | required | `extract`, `translate`, `generate`, `materialize`, `pipeline`, `submit`, `ci`, `local`, `prepush`, `verify-drift`, `seed` | Whether a string holding `true` or `false` is left untranslated. |
| `adapter.fields.denylistKeyPatterns` | `string[]` | `[]` | `extract`, `translate`, `generate`, `materialize`, `pipeline`, `submit`, `ci`, `local`, `prepush`, `verify-drift`, `seed` | Key patterns whose whole subtree is never translated, at any depth, matched case-insensitively like `denylistKeys`: `*` stands for any run of characters and `?` for one, so `_*` excludes every key that begins with an underscore. |
| `adapter.fields.identifierStrings` | `{ keys, where }[]` | `[]` | `extract`, `translate`, `generate`, `materialize`, `pipeline`, `submit`, `ci`, `local`, `prepush`, `verify-drift`, `seed` | Keys whose string values are identifiers, not text, while their object values are content: `{ "keys": [...], "where": "value" \| "list" \| "any" }`. `value` skips a string that is the key’s own value, `list` a string element of a list that is the key’s value, `any` both; an object, or an object in such a list, is walked as content. Keys match case-insensitively. |
| `adapter.fields.skipInParent` | `{ key, parentKey?, parentHas?, parentOnly? }[]` | `[]` | `extract`, `translate`, `generate`, `materialize`, `pipeline`, `submit`, `ci`, `local`, `prepush`, `verify-drift`, `seed` | A key whose string value is skipped only inside a given parent object: `{ "key", "parentKey"?, "parentHas"?, "parentOnly"? }`, at least one selector. `parentKey` names the keys the parent object sits under (an element of a list sits under the list’s key), `parentHas` keys the parent holds, and `parentOnly` the keys it may hold, besides those `denylistKeyPatterns` matches. Every selector given must hold; keys match case-insensitively. |

With `adapter.kind: "markdown"`:

| Key | Type | Default | Read by | What it holds |
|---|---|---|---|---|
| `adapter.sourceDir` | `string` | required | `extract`, `translate`, `generate`, `pipeline`, `submit`, `ci`, `local`, `prepush`, `doctor` | The corpus root. |
| `adapter.include` | `string[]` | required | `extract`, `translate`, `generate`, `pipeline`, `submit`, `ci`, `local`, `prepush`, `doctor` | Globs, relative to `sourceDir`, selecting the source files. At least one. |
| `adapter.exclude` | `string[]` | `[]` | `extract`, `translate`, `generate`, `pipeline`, `submit`, `ci`, `local`, `prepush` | Globs removing files from that selection. Neither a file the adapter writes nor one under the memory directory is ever read as a source. |
| `adapter.outDir` | `string` | required | `extract`, `translate`, `generate`, `pipeline`, `submit`, `ci`, `local`, `prepush` | Where the target locales are written: every source file, in every target locale, at `<outDir>/<locale>/<relative path>`. |
| `adapter.frontmatterKeys` | `string[]` | `[]` | `extract`, `translate`, `generate`, `pipeline`, `submit`, `ci`, `local`, `prepush` | The frontmatter keys whose values are translated. |
| `adapter.policies.paths` | `{ glob, policy }[]` | `[]` | `extract`, `translate`, `generate`, `pipeline`, `submit`, `ci`, `local`, `prepush` | An ordered list of `{ "glob", "policy" }`; the last entry whose glob matches a file’s relative path decides, and a file no entry matches is translated. |
| `adapter.policies.regions` | `Record<string, "translate" \| "keep">` | `{}` | `extract`, `translate`, `generate`, `pipeline`, `submit`, `ci`, `local`, `prepush` | A map from a generated section’s name to `translate` or `keep`; a section it does not name is translated. |

With `backend.kind: "anthropic"`:

| Key | Type | Default | Read by | What it holds |
|---|---|---|---|---|
| `backend.model` | `string \| { id, thinking?, effort?, fallbackId? }` | `"claude-opus-5-5"` | `translate`, `pipeline`, `submit`, `collect`, `ci`, `local`, `prepush` | The model: an id, or `{ "id", "thinking"?, "effort"?, "fallbackId"? }`. `thinking` (one of the API’s `adaptive`, `disabled`, `between_tools` or `enabled` shapes) and `effort` (`low` to `max`) are sent unchanged to the primary model; `fallbackId` is the model a refused request is resubmitted on once, with `effort` and without `thinking` (see [Replies, and the reasoning settings](#replies-and-the-reasoning-settings)). The glossary’s `model`, when set, replaces the id only. |
| `backend.apiKeyEnv` | `SecretName` | `"ANTHROPIC_API_KEY"` | `translate`, `pipeline`, `submit`, `collect`, `ci`, `local`, `doctor` | The environment variable holding the API key. A name beginning `VITE_` is refused: Vite inlines such a variable into the client bundle. |
| `backend.attempts` | `PositiveInteger` | `3` | `translate`, `pipeline`, `submit`, `collect`, `status`, `ci`, `local` | Requests per segment before it stays untranslated. |
| `backend.sectionTokens` | `PositiveInteger` | `8000` | `translate`, `pipeline`, `submit`, `ci`, `local`, `prepush` | A page whose estimated source exceeds this is translated one top-level section per request, a section itself above it divided at its own headings and then into runs of segments, each request given its own section, the sections immediately before and after it and the page’s heading outline as context (see [A request is a page](#a-request-is-a-page)). |
| `backend.submission.inputTokens` | `PositiveInteger` | `2000000` | `submit`, `ci`, `local` | The per-submission budget of input tokens, counted in the offline estimate (see [The budget](#the-budget-and-the-estimate-it-is-counted-in)). A `backend.submission` that is stated names both budgets. |
| `backend.submission.outputTokens` | `PositiveInteger` | `500000` | `submit`, `ci`, `local` | The per-submission budget of output tokens: the sum of the requests’ `max_tokens`. |

With `backend.kind: "claude-code"`:

| Key | Type | Default | Read by | What it holds |
|---|---|---|---|---|
| `backend.model` | `string \| { id, effort?, fallbackId? }` | `"claude-opus-5-5"` | `translate`, `pipeline`, `local`, `prepush` | The model, passed to the CLI as `--model`: an id or an alias the CLI accepts (`opus`, `sonnet`), or `{ "id", "effort"?, "fallbackId"? }`, `effort` passed as `--effort` and `fallbackId` the model a refused request is resubmitted on once. The glossary’s `model`, when set, replaces the id only. |
| `backend.tokenEnv` | `SecretName` | `"CLAUDE_CODE_OAUTH_TOKEN"` | `translate`, `pipeline`, `local`, `doctor` | The environment variable holding the OAuth token `claude setup-token` prints, handed to the CLI as `CLAUDE_CODE_OAUTH_TOKEN` in its environment alone. A name beginning `VITE_` is refused, as for `backend.apiKeyEnv`. |
| `backend.login` | `"never" \| "allowed"` | `"never"` | `translate`, `pipeline`, `local` | Whether the CLI’s own login is used when the token variable is unset: `never`, the run fails before any process starts; `allowed`, for a developer’s machine. `L10N_CLAUDE_CODE_LOGIN=1` allows it for one run. |
| `backend.command` | `string` | `"claude"` | `translate`, `pipeline`, `local` | The Claude Code command, found on the `PATH` or given as a path. |
| `backend.safeMode` | `boolean` | `true` | `translate`, `pipeline`, `local` | Whether the CLI runs with `--safe-mode`, so no instruction file, skill, plugin, hook or MCP server of the machine reaches the translator; `false` for a CLI that predates the flag. Each process runs in an empty temporary directory either way. |
| `backend.maxPromptBytes` | `PositiveInteger` | `102400` | `translate`, `pipeline`, `local` | A request whose system prompt and user message together exceed this many UTF-8 bytes is split in two by its requested segments, each half given the same context, until a part fits or asks for one segment. |
| `backend.timeoutSeconds` | `PositiveInteger` | `600` | `translate`, `pipeline`, `local` | How long one process may run before it is stopped and its request retried as a transient failure. |
| `backend.concurrency` | `PositiveInteger` | `1` | `translate`, `pipeline`, `local` | How many processes run at once; `--conc` overrides it for one run. |
| `backend.attempts` | `PositiveInteger` | `3` | `translate`, `pipeline`, `local` | Requests per segment before it stays untranslated. |
| `backend.sectionTokens` | `PositiveInteger` | `8000` | `translate`, `pipeline`, `local`, `prepush` | A page whose estimated source exceeds this is translated one top-level section per request, a section itself above it divided at its own headings and then into runs of segments, each request given its own section, the sections immediately before and after it and the page’s heading outline as context (see [A request is a page](#a-request-is-a-page)). |

The named types:

- `BranchName` — a git branch name: letters, digits, `.`, `_`, `-` and `/`, with no leading `-` or `/`, no `..`, `//` or `@{`, and no trailing `/` or `.lock`.
- `LocalePath` — a path, relative to the project root, containing `{lang}`, which each command expands with a locale.
- `PositiveInteger` — an integer greater than 0.
- `ProjectPath` — a path relative to the project root, with no `..` segment.
- `SecretName` — an environment-variable name (letters, digits and `_`, not starting with a digit) that does not begin `VITE_` in any case.
- `WorkflowFile` — a file name ending `.yml` or `.yaml`, with no directory.

<!-- END GENERATED: config-reference -->

## The commands

`l10n --help` prints them: `extract`, `gate` (`--check`), `translate`,
`generate`, `materialize`, `pipeline`, `submit` (`--dry-run`), `collect`,
`status`, `ci`, `overlay`, `sync` and `watch` (`--env-file <file>`), `local`,
`prepush` (`<commit>`, or git's pre-push arguments and standard input),
`verify-drift` (`--scope real|staging`), `seed`, `gc` and `doctor`.
`--targets a,b` narrows the configured target locales. Every command but
`doctor` stops with exit 2 on a configuration defect; `doctor` reports it as a
failed check (see [Checking the wiring](#checking-the-wiring-l10n-doctor)).

The mode decides four commands each way: under `"mode": "local"`, `ci`,
`overlay`, `sync` and `watch` stop with exit 2, naming the mode, before any git
command or network call; under the CI mode, `local` and `prepush` do.

`I18N_BACKEND`, when set, names the backend of that run, a supported one
(`anthropic` or `claude-code`); any other value stops `translate`, `pipeline`,
`submit`, `collect`, `ci` and `local` before any request. Under the
`claude-code` backend, which has no batch transport, `submit`, `collect` and
`ci` stop with exit 2 ([The Claude Code backend](#the-claude-code-backend)).

`materialize`, `verify-drift` and `seed` belong to the JSON-content adapter; with
the Markdown adapter each exits 2, naming what the configured adapter lacks.

**The drift guard, `verify-drift`, flags hand edits, not lag.** It regenerates
the targets in memory and classifies every leaf of the target files on disk. A
leaf that differs from its regeneration is **hand-edited** when its text is in
no source-locale file, no recorded source text (the catalogue and the source
map) and no memory entry of either layer, live or archived: the command exits 1
and names the file and the leaf. Any other differing leaf, a leaf the file
lacks, and a target file not yet generated are **stale**: reported, and the exit
stays 0, because the next materialize regenerates them.

## The JSON-content adapter

`"adapter": { "kind": "json-content", … }` translates a site whose content is
JSON files, one directory per locale, and an optional UI dictionary. Its keys
are in the [configuration reference](#the-configuration-file), under
`adapter.kind: "json-content"`. Every rule below is configuration: a site needs
no code of its own to fit its content model, and extraction, generation,
seeding, the drift guard and `materialize` all read the one rule set and the one
output plan, so they agree leaf for leaf and file for file.

### What is walked

A string leaf is translatable by default and is excluded by a rule, so a new
field is translated the day it is added. `adapter.document.walk` says where the
walk goes:

- `"blocks"` (the default) — a block-composed page,
  `{ path, template, <page fields>, blocks: [{ name, data }] }`: the fields
  `fields.pageFields` names, then each `blocks[i].data`. Leaf paths read
  `seo.title`, `blocks[3].data.sections[0].heading`.
- `"whole"` — every key of every file, under the same rules, leaf paths relative
  to the file (`articoli[0].titolo`), for a site whose content files are
  collections and shared data rather than pages.
- `"auto"` — a file holding a `blocks` array as `"blocks"`, any other file as
  `"whole"`.

A leaf's advisory context, which the request carries, is `<block name>:<key>`
for a block's leaf, `<object>:<field>` for a page field, and for a file walked
whole `<value>:<key>`, where the value is the file's own value under
`document.contextKey` (a `tipo` or `type` key, say), else `document`. A
top-level section of a request is a block or a page-field object for a block
page, and a top-level key for a file walked whole.

A leaf is excluded by:

- a key in `fields.denylistKeys`, or matching a pattern of
  `fields.denylistKeyPatterns` (`_*`: every key beginning with an underscore, a
  marker convention), which drops the key's whole subtree, at any depth, matched
  case-insensitively;
- a value guard, `fields.valueGuards`: the empty string, a reference prefix, an
  asset extension, a bare number, `true` or `false`;
- an identifier string, `fields.identifierStrings`, for a key whose strings are
  identifiers while its objects are content. `{ "keys": ["fase"], "where": "value" }`
  skips `"fase": "finitura"` and walks `"fase": { "titolo": … }`;
  `{ "keys": ["prodotti"], "where": "list" }` skips the codes in
  `"prodotti": ["64641", { "nome": … }]`, walks the object, and keeps
  `"prodotti": "Prodotti"`, a label; `"any"` is both;
- a skip in a parent, `fields.skipInParent`, for a key that is an identifier
  only inside one kind of object: `{ "key": "categoria", "parentHas": ["slug"],
  "parentOnly": ["slug", "categoria", "alt", "larghezze"] }` skips the
  `categoria` of an image reference — an object holding `slug` and nothing but
  those keys, besides keys a `denylistKeyPatterns` entry matches — and keeps
  the `categoria` of an article. `parentKey` names the keys the parent sits
  under instead, or as well; every selector given must hold.

### What is written: the output plan

`adapter.output` states what a target file is, for generation, `materialize`,
the drift guard and `seed` alike:

| Key | Values | |
|---|---|---|
| `path` | `"prefixed"` (default), `"neutral"` | A target page's `path`: under the locale prefix (`/servizi/` → `/en/servizi/`), or the source path unchanged, for a site that composes the prefix itself. A pair of the language map wins in both. A file with no string `path` gets none. |
| `langField` | `true` (default), `false` | Whether a generated page carries `lang`; with `false`, only a page whose source carries it does, set to the target locale. |
| `keyOrder` | `"sorted"` (default), `"source"` | Every generated file's keys, the UI dictionary's included: alphabetical at every level, or as in the source file. |
| `pairs` | `"all"` (default), `"langMap"` | Which source pages have a target page: every one, or only a page whose `path` the language map pairs with that locale (`{ "pairs": [{ "it": "/cataloghi/", "en": "/catalogues/" }] }`). An unpaired page is still extracted and translated, and is never generated, materialized, compared or seeded. |
| `fileName` | `"source"` (default), `"path"` | A target file's name: the source file's, or its target path with the outer slashes removed and every other `/` written `-` (`/collezioni/self-levelling/` → `collezioni-self-levelling.json`, `/` → `index.json`); a file with no `path` keeps its source name. Two pages that would be written under one name stop the command, naming both. |
| `materialize` | `"replace"` (default), `"safe"` | What `materialize` writes; see below. |

`generate` reports the source pages it did not pair as `unpaired`. `seed`
pairs a source page with the target page at its planned path, and a file with
no `path` with the target file of its planned name. A target file on disk that
no source page generates — a page written only in the target language — is
reported by the drift guard as generated from no source, and nothing touches
it.

### Materializing safely

`materialize` writes the target files the site builds from. Under
`output.materialize: "replace"` it writes every generated file, the source text
standing in for each leaf the memory does not translate. Under `"safe"`, for a
site whose target files were written by hand, it writes a generated file only
when

1. none of its leaves falls back to the source text, and
2. the file does not exist yet, or none of the leaves the write would replace or
   remove is hand-edited: each one that differs from its regeneration, or that
   the regeneration no longer has, holds a text the memory directory knows — a
   source-locale text, a recorded source text, or a memory entry of either layer,
   live or archived — the classification of the drift guard
   ([The commands](#the-commands)).

Every other generated file is left as it is, and the command names it with the
reason: how many leaves have no translation, or which hand-edited leaves would
be lost. Under both policies it writes only the pages `output.pairs` pairs, under
the names `output.fileName` gives, in the key order `output.keyOrder` gives;
it never writes into the source locale's directory, never deletes a file, and
never touches a target file that no source page generates. The UI dictionary
follows the same rule as one file. A hand-written target therefore enters the
generated set one file at a time: record its text in the human layer (`seed`,
or by hand) and the next safe materialize can write it.

### The UI dictionary

`adapter.ui` names a per-locale JSON dictionary. A flat one (the default) is a
map whose top-level string values are its entries, keyed by their own key
(`"nav.backToTop": "Torna su"`). With `adapter.ui.nested: true` every string at
any depth of its objects and lists is an entry, keyed by its path (`menu.home`,
`voci[0]`), and each generated dictionary keeps the source's shape, every
non-string value copied: a site can move a typed dictionary object to JSON as it
is. A request's top-level sections are the entries sharing their first key.

## The Markdown adapter

`"adapter": { "kind": "markdown", … }` translates a corpus of Markdown files — a
documentation tree — with its structure intact: every translated file is its
source file with only its prose segments replaced.

```json
"adapter": {
  "kind": "markdown",
  "sourceDir": "docs",
  "include": ["README.md", "guide/**/*.md"],
  "exclude": ["**/drafts/**"],
  "outDir": "i18n/out",
  "policies": {
    "paths": [{ "glob": "reference/schema/**", "policy": "keep" }],
    "regions": { "cli-flags": "keep" }
  }
}
```

Its keys are in the [configuration reference](#the-configuration-file), under
`adapter.kind: "markdown"`. Globs are matched with Node's `fs.globSync` and `path.matchesGlob`, so the
adapter needs a Node.js version that provides both. With Node's defaults, `**`
does not descend into a directory whose name begins with a dot.

### Segments

Each file is parsed into a GitHub-flavoured syntax tree (tables, task lists,
strikethrough, footnotes, literal autolinks). A **segment** is the raw source
slice of:

- a heading's text;
- a paragraph, wherever it sits: at the top level, in a list item, in a
  blockquote, in a footnote;
- a table cell whose content is not only inline code, numbers, punctuation
  (symbols included, as CommonMark counts punctuation) or empty — such a cell is
  left as it is;
- the value of a frontmatter key `frontmatterKeys` lists.

Fenced and indented code, HTML blocks, HTML comments, link definitions and the
frontmatter block are never segmented. A segment's key is the engine's own hash
of its slice (`keyOf`), so a paragraph repeated across files is one unit,
translated once. A unit's `format` is `markdown`, or `text` for a frontmatter
value. A file that is not valid UTF-8 is refused, naming it; a byte-order mark is
kept.

### Protected spans

Each unit carries `protected`: the ranges of its slice that a translation must
reproduce byte for byte. They are inline code; inline HTML tags and comments; a
link's or an image's destination and title; an autolink or a literal URL; a full
reference's `[label]`, and a collapsed or shortcut reference whole, because its
text is its label; footnote references; and character references such as
`&amp;`. So a link's title and a collapsed or shortcut reference's text stay in
the source language, while an image's alt text is translated.

The spans are computed from the whole file's tree, never from the slice alone: a
slice parsed on its own loses its context — `[text][ref]` is plain text without
the definition of `ref`. A request lists a requested segment's spans as its
`keep` strings, and a translation that drops or alters one, or adds one, is
rejected before it reaches the memory (see [Validation](#validation-and-resubmission)).

### Output, and what stays the source's

The output is splice-only: the source text with each translated segment's range
replaced. Every byte outside a segment — list markers, table alignment, code,
blank lines, line endings — is the source's own, so a diff of a translated file
shows only translated text. A segment with no translation keeps its source text,
so every source file exists in every locale and a relative link between two
pages of the corpus resolves inside each locale tree. A relative link to anything
else — an image beside its page, say — does not: only the selected Markdown files
are written under `<outDir>/<locale>/`, so a site serving a locale tree copies or
serves those files at the locale's paths.

### Policies

A **generated section** is the range between `<!-- BEGIN GENERATED: <name> -->`
and `<!-- END GENERATED: <name> -->`, each marker an HTML block of its own. A
section that is never closed, closed under another name, or nested in another is
refused, naming the file and the line.

`keep` copies the source bytes unchanged, headings included. A kept path is copied
whole, whatever its sections' policies; a kept section is copied inside an
otherwise translated page. Kept text contributes no catalogue unit.

### Heading identifiers

Every heading outside a kept path or section ends with a space and
`{#<slug>}`, where the slug is the **source** heading's, whether or not its text
has a translation. So a link such as `page.md#some-heading`, written against the
source page, resolves in every locale. An underscore in the slug is written `\_`
unless a letter, mark or digit sits on each side of it, which is exactly when
Markdown could read it as emphasis.

The slug rule: one `github-slugger` instance per file, called for every heading in
document order — kept headings included, so later headings keep the source page's
duplicate numbering — on the heading's text and inline-code values, with inline
HTML and image alt text excluded and no post-processing. That is the text Astro's
heading-id step reads, since it runs before raw HTML is parsed. Where an Astro
site's own slug for a source heading differs:

- Astro's default `smartypants` rewrites text before the slugger runs, turning
  `--` into a dash the slugger drops, so a heading holding `--` or `---` outside
  inline code gets another slug on the site;
- a footnote reference in a heading adds its number to the site's slug;
- a heading inside a footnote definition is moved to the end of the rendered page,
  so the site numbers duplicates in another order.

A kept heading carries no identifier, and the site's own slugger assigns its id.
That slugger numbers duplicates only among headings without an explicit
identifier, so a kept heading repeating an earlier heading's text can be numbered
differently from the source page, or repeat an identifier an earlier heading
carries.

### The syntax-tree plugin

```js
import { remarkHeadingIds } from '@aggrega-ai/l10n';
// Astro: export default defineConfig({ markdown: { remarkPlugins: [remarkHeadingIds] } });
```

`remarkHeadingIds` is a remark plugin. On every heading it strips the
`{#<slug>}` suffix, and the space before it, from the text, and sets the heading's
id (`data.id` and `data.hProperties.id`, which the Markdown-to-HTML step puts on
the element). It reads the id from the page's source text, at the position of the
heading's last text node, rather than from that node's value. A step that runs
before it and rewrites text therefore
leaves the id as written: Astro runs its default `smartypants` before any
registered remark plugin, and that would otherwise turn the `--` in an id such as
`errors--warnings` into a dash. Without the plugin, a translated heading shows its
suffix as text.

**A check the consuming site performs:** that its own heading-id step keeps an id
already set rather than computing another. Astro's does in
`@astrojs/markdown-remark` 7.2.1, which keeps a pre-set string id and calls the
slugger only for a heading without one. Build a translated page and confirm that
each heading's `id` attribute is the source slug.

`parseHeadingId(text)` is the one parser of the suffix, the one the plugin uses.
Any other reader calls it too — for example a loader that takes a page's title
from its raw first `#` line, which on a translated page ends with the suffix:
`parseHeadingId(line).text` is the title.

### Frontmatter

A leading YAML block (`---` … `---` or `...`) is never segmented unless
`frontmatterKeys` lists keys. A listed key is segmented only when it is a
top-level key whose value is a single-line scalar: plain, single-quoted or
double-quoted. The segment is the value without its quotes. Any other value under
a listed key — a block scalar, a sequence, a mapping, a flow collection, an
anchor, alias or tag, a value continuing on the next line, a repeated key — is
refused, naming the file and the key. A translation is spliced into the value as
it is, so a translation holding the value's own quote character ends the scalar
early; the adapter escapes nothing.

### What `extract` prints

With the Markdown adapter, `extract` prints a second line,
`extract: <F> files, <S> segments, <W> words.`:

- `F` — the source files `include` and `exclude` select, kept paths included;
- `S` — the translatable segments, each occurrence counted, outside kept paths
  and kept sections;
- `W` — the words in those segments outside protected spans, a word being a run
  of letters, marks and digits that starts with a letter or a digit.

The first line's unit count is the number of distinct segments.

### The pseudo-localizer

`createPseudoLocalizer()` returns a deterministic stand-in translator for tests
and dry runs. It honours the backend contract (`translate({items, lang})` →
`{translations, model}`), turns each ASCII letter outside an item's protected spans
into an accented letter, and keeps every other character. No configuration
selects it — no `backend.kind` and no `I18N_BACKEND` value names it — so it is
passed in code, as the backend `createEngine({ backend })` or
`runCli(argv, { backend })` receives:

```js
import { runCli, createPseudoLocalizer } from '@aggrega-ai/l10n';
const backend = createPseudoLocalizer();
for (const command of ['extract', 'translate', 'generate']) await runCli([command], { backend });
```

## Translating: pages, two transports, one builder

### A request is a page

A request translates one **page** into one locale: a content file or the UI
dictionary with the JSON-content adapter, a Markdown file with the Markdown
adapter. Each adapter lists its pages in a stable order through `pages()` —
content files by name and then the UI dictionary; Markdown files by path — with
each page's segments in document order. A request's user message is two JSON
parts, in two text blocks:

- **the context**, `{ "page", "outline"?, "segments" }`: the source segments
  the request is given, in order, each with its identifier (its key) and format
  — the whole page, or for a page split into sections the part described below
  — and, on a first request, the existing translations of the segments it does
  not request, as fixed context;
- **the request**, `{ "section"?, "translate", "keep"?, "corrections"?,
  "replyCorrections"? }`: the section, for a page split into sections; the
  identifiers to translate; for each requested Markdown segment, the strings its
  protected spans hold (`keep`); for a resubmitted segment the defect its earlier
  translation had (`corrections`); and each distinct defect an earlier reply had
  as a whole — no entries, a reply cut off or not parsing, a request that
  errored, expired, was canceled or was refused — stated once
  (`replyCorrections`), never once per segment.

The reply returns only the requested segments, and each is stored under its own
key, so the memory stays paragraph-level: unchanged text is never regenerated,
and an edit retranslates only what changed. A unit missing from a locale is
requested once, on the first page in that order that holds it; on a later page
it is plain source with no translation.

A page whose estimated source exceeds `backend.sectionTokens` is translated one
**top-level section** per request, each asking only for its section's segments,
so the split bounds what one request returns:

- a content file: each object of page-level fields (`seo`), then each block
  (`blocks[i]`);
- the UI dictionary: the keys sharing one prefix before the first dot (`nav`,
  `footer`, …);
- a Markdown file: the run from one `#` or `##` heading at the top level of the
  document to the next, and the text before the first.

A section itself above the budget is divided further: at its own headings first,
each segment the page view marks as a heading starting a part, and a part still
above the budget into runs of consecutive segments, the parts packed in order up
to the budget. A single segment above the budget stays one request. Each part is
a section of its own, labelled `<section> (part k of n)`, in the outline and in
the request. A section's request is given its own section, the sections
immediately before and after it, and the page's **outline**, and no other text
of the page. The outline is one entry per
section, in order, `{ "section", "headings"? }`, the headings being the text,
as the source writes it, of every segment the page view marks with the context
`"heading"` (`HEADING_CONTEXT`). The Markdown adapter gives that context to
every heading it segments, so a heading in a kept section is not listed; a
JSON-content page has no heading, so its outline is its section labels. On a
page with a divided section, the outline a request carries lists every top-level
section by its first heading only, and the parts of the request's own top-level
section each with all its headings, so the outline does not grow with every part
of every section. A page
within the budget is one request given the whole page, with no outline.

A **resubmission** — a request for a segment an earlier reply failed, whose
attempt is above 1 — is planned like a first request: it asks only for the
segments still missing, the failed ones, and is given the context a first
request for its section is given, but with no translation in it, so the
translations the earlier round accepted are not added. Either way the two
contexts hold the same outline and the same segments, in the same order, with
the same source text; over a memory that translated none of the page before the
first request, neither carries a translation. The user message carries no cache
marker: no two requests share it.

### The system prompt

Text blocks, in this order: the package's general rules (the languages, the
request and reply shapes, and the rules in priority order — do-not-translate
terms verbatim, glossary terminology, markup and protected spans byte for byte,
edge whitespace and punctuation); the project's glossary (its `site_context`
sentence, the do-not-translate terms and the terminology for the locale); the
project's general prompt `<promptsDir>/_general.md`, when the project keeps one
— its instructions for every target locale, such as who reads the corpus and
which words stay as written; and the per-language prompt file
`<promptsDir>/<locale>.md`. That is four blocks with a general prompt file and
three without one, and without it the three are the same bytes they are with
it. The last block carries `cache_control` with the one-hour duration, so the
whole system prompt is a cache prefix, byte-identical for every request of a
locale; it is the one cache marker a request carries. A prefix shorter than the
model's minimum cacheable length is not cached; the API reports that only as
`cache_creation_input_tokens: 0`. A command
that translates refuses, with exit 2 and naming the file, a target locale whose
prompt file is missing or empty, and a general prompt file that is present and
empty.

### Replies, and the reasoning settings

A reply is requested as structured JSON through `output_config.format`, with one
schema for every request: `{ "translations": [{ "id", "text" }] }`. Structured
outputs need `additionalProperties: false` on every object, so a map keyed by
identifier cannot be a schema; which identifiers came back is checked after the
reply instead.

Reasoning is billed as output and translation does not need it, so the
configuration turns it off or down, and the package sends `model.thinking` and
`model.effort` unchanged to the primary model. The settings Anthropic documents
for its current models:

| Model | `backend.model` |
|---|---|
| Claude Opus 5.5 | `{ "id": "claude-opus-5-5", "effort": "low" }` — thinking omitted: this model cannot turn it off, so effort is the only control. |
| Claude Sonnet 5.5 | `{ "id": "claude-sonnet-5-5", "thinking": { "type": "between_tools" } }` — it refuses `disabled`; `between_tools` is accepted at effort `high` or below. |
| Claude Haiku 5.5 | `{ "id": "claude-haiku-5-5", "thinking": { "type": "disabled" } }` — accepted at effort `high` or below. |

A request resubmitted on `model.fallbackId` carries `model.effort` and no
`thinking`. A thinking setting belongs to the model it was chosen for —
Claude Sonnet 5.5 alone accepts `between_tools`, and Claude Opus 5.5 refuses
`disabled` — while every model accepts a request without one, which leaves the
reasoning level to `effort`. So a configuration that names a fallback also sets
`effort`, at a level the fallback model accepts.

### Validation and resubmission

One validation, shared by both transports, runs on every reply before anything
is written. A segment is rejected when its translation is empty; when its HTML
tags or comments — generated-section markers among them — differ from the
source's; for a Markdown segment, when a protected span is dropped, altered or
added; or when it drops a do-not-translate term the source contains, in the
casing of the occurrence — found in the source in any casing, or only as
written under the glossary's `do_not_translate_case: "sensitive"`, or each
`{ "term", "case" }` entry in its own mode (see
[The shape of the glossary](#the-shape-of-the-glossary)), the reading rule 1
of the instructions states. A term written in Latin letters counts as kept
wherever no Latin letter or digit stands directly before or after it, so it may
sit against Hangul, kana or CJK characters (`Aggrega의`, `Componentを`) while
`Componentize` holds no `Component`; rule 1 states the same boundary. A segment is
rejected, too, when its translation holds UTF-8 text decoded in a single-byte
code page — `Ã©` for `é`, `â€”` for `—`, `Ă¤` for `ä`, read back through
Windows-1252, Windows-1250 or ISO-8859-1 — that its source does not hold. A reply
that omits an identifier rejects that segment. An identifier returned more than
once with the same text each time — a page holding one text twice lists it twice
in the context — is checked once like any other; one returned with different
texts rejects that segment alone. Only a reply with no entries at all is
rejected whole. An
identifier the request did not ask for is dropped and rejects nothing: each
requested segment is still accepted or rejected on its own, and the dropped
identifier is named in the job log's `dropped` (`id`, `lang`, `page`,
`section`) and, by `collect`, in its output. A rejected segment is never
written to the memory: it alone is resubmitted, with the defect stated, up to
`backend.attempts` requests, after which it stays untranslated and is named in
the job log.

A reply whose stop reason is `refusal` is resubmitted once on
`model.fallbackId` when the configuration names one, with the effort and
without the thinking setting, and otherwise on the same model like any other
defect. The API's server-side fallback parameter is not
used: the Message Batches API rejects it.

### The synchronous transport: `translate` and `pipeline`

`translate` sends each request as one Messages API call, writes each reply's
accepted segments to the machine layer at once, and plans again for the rejected
and refused ones until none is left or the attempt limit is reached. It suits
small local runs.

### The batch transport: `submit`, `collect`, `status`

For unattended runs, submission and collection are separate commands, so no CI
job waits on a batch.

- `submit` runs the gate — with nothing to translate it stops there and creates
  no client — builds the requests, and takes them in their stable order while
  they fit the per-submission budgets: it stops at the first request that does
  not fit and leaves it and the rest for the next submission. It creates one
  batch through the Message Batches API and records it in `pending.json`, with
  each request's custom identifier mapped to its page, section, locale, segment
  identifiers, attempt and model. When `pending.json` cannot be written after the
  batch was created, the batch would be recorded nowhere and its units requested
  again by the next submission, so `submit` cancels it through the Message
  Batches API, prints its id and whether the API accepted the cancellation — or
  that it could not be canceled, naming the error by its class and HTTP status
  alone — and exits 1; the cancellation's billing bound is the one below, under
  [What `l10n ci` does](#what-l10n-ci-does). It refuses while a recorded batch
  has not been collected, so one batch at a time is in flight. `--dry-run`
  builds the same requests and prints, per locale, the page count and the
  estimated input and output tokens, and each request's estimate, every input
  figure with its cached and uncached shares, the cached share being the system
  prompt's alone (see
  [The budget](#the-budget-and-the-estimate-it-is-counted-in)); it creates no
  client and writes no file.
- `collect` retrieves each recorded batch. One still processing stays recorded.
  For one that has ended, it reads the results keyed by custom identifier —
  results arrive in any order — validates each reply, writes the accepted
  segments to the machine layer, queues the rejected, refused, errored, expired
  and canceled ones for resubmission, names each identifier it dropped, writes
  a job log, and clears the batch.
  Applying the same results twice writes the same bytes: a machine entry carries
  the batch's identifier and creation time, and a queued segment's attempt count
  is the attempt recorded with its request.
- `status` prints the recorded batches and the resubmission queue, and makes no
  network call.

A custom identifier matches the API's pattern `^[a-zA-Z0-9_-]{1,64}$`: a
zero-padded request index, then the locale and as much of the page's path as
fits. The pending file, not the identifier, holds the mapping.

### The budget, and the estimate it is counted in

The budgets are ceilings. The output budget is the sum of the requests'
`max_tokens`, which the API enforces on each response, reasoning included. The
input budget is counted in an offline estimate, made with no call: one token per
UTF-8 byte of the system prompt, the user message and the output schema, plus 512
tokens per request for the message framing and the output-format instructions
the API adds. One token per byte is an upper bound on the assumption that every
token covers at least one byte; for Italian or English prose the estimate runs
well above what the API reports. A request's `max_tokens` is its requested
sources' estimate plus 24 per identifier, at least 1,024 so that a one-segment
section has room for the reply's JSON, plus 2,048 for reasoning when the request
can reason, at most 16,384. A request can reason unless the thinking
setting it carries is `disabled` or `between_tools` (`reservesReasoning`): so a
Claude Opus 5.5 request, configured with thinking omitted because that model
cannot turn it off, reserves the allowance, and so does every resubmission on
the fallback model, which is sent without a thinking setting, while a Claude
Haiku 5.5 request with `disabled` and a Claude Sonnet 5.5 request with
`between_tools` reserve none.
The API bills what a response generates, not its `max_tokens`, so the allowance
moves the budgets, never the bill.

`submit` and `submit --dry-run` print each input estimate as
`estimated input N tokens (C cached, U uncached)`. The cached share of a
request is the estimate of the longest cache-marked prefix it shares,
byte for byte and on the same model, with an earlier request of the same
submission — the system prompt of its locale, the one block a request marks —
and the uncached share is the rest, the first write of each prefix included,
which the API bills above the base input rate. The cached figure is what
caching saves at best, not a forecast: caching inside a batch is best-effort,
because requests run in any order and concurrently and an entry is readable
only once the request writing it has started to answer, and a prefix shorter
than the model's minimum cacheable length is not cached at all. So the budgets
count every request's whole input estimate, and the cached share is never
subtracted from them.

### The API key

The key is read from the variable `backend.apiKeyEnv` names, and that value is
the only credential the client ever uses: the client is built with it as its API
key and with every other source the SDK would consult closed —
`ANTHROPIC_AUTH_TOKEN`, profiles and other credential files,
`ANTHROPIC_CUSTOM_HEADERS` for the two authentication headers, and
`ANTHROPIC_BASE_URL`, so the key goes only to `https://api.anthropic.com`. A
missing key stops `submit` and `collect` with exit 1, and fails every request of
`translate`, in each case before any client exists; `pipeline` stops before
translating. The key never appears in a log line, an error message or the
pending file.

## The Claude Code backend

`"backend": { "kind": "claude-code" }` translates through Claude Code run
headless, on a Claude subscription (Pro, Max, Team or Enterprise), with no API
key. Each request the engine plans — the same page or section, the same
context, the same system prompt and the same output format as a Messages API
request — is one process:

```sh
claude -p --output-format json --json-schema <the output schema> --system-prompt <the system prompt> \
  --tools "" --no-session-persistence --safe-mode --model <backend.model> [--effort <level>]
```

with the user message on standard input, run in an empty temporary directory,
so no instruction file, setting, skill, hook or MCP server of the machine or the
project reaches the translator (`backend.safeMode: false` drops `--safe-mode`
for a CLI that predates it). The reply is the result's structured output, read
and validated as any reply ([Validation](#validation-and-resubmission)); an
error result is retried when the API's status is 429 or 5xx, or the model is
overloaded, and fails its segments otherwise; a process that outlives
`backend.timeoutSeconds` is stopped and retried. A request whose system prompt
and user message exceed `backend.maxPromptBytes` (100 KiB) is split in two by
its requested segments, each half given the same context, and the halves'
replies joined. `backend.concurrency` processes run at once (default 1;
`--conc` overrides it for a run). The model is `backend.model`, an id or an
alias the CLI accepts (`opus`, `sonnet`), with `effort` and `fallbackId` as for
the API; the glossary's `model` replaces the id.

**The credential.** The OAuth token `claude setup-token` prints is read from the
variable `backend.tokenEnv` names (default `CLAUDE_CODE_OAUTH_TOKEN`), from the
environment only, and passed to the process as `CLAUDE_CODE_OAUTH_TOKEN` in its
environment — never as an argument, never in a message, never in a file. On a
developer's machine where the CLI is logged in, its own login is used instead
when the run allows it explicitly: `backend.login: "allowed"` in the
configuration, or `L10N_CLAUDE_CODE_LOGIN=1` in the environment of one run.
Otherwise a missing token stops the command before any process starts, naming
the variable. The process receives no `ANTHROPIC_*` variable and none of the
third-party provider switches, so an API key in the environment is never spent
by the CLI, and the subscription is the only account a request can use.

**What runs on it.** `translate`, `pipeline` (whose missing-credential branch
reads the token, or the allowed login) and, in the local mode, `local`. It has
no batch transport: `submit`, `collect` and `ci` stop with exit 2 under it, and
a configuration with a `ci` key refuses it. `I18N_BACKEND=claude-code` selects
it for one run under an `anthropic` configuration, built from that
configuration's `model`, `attempts` and `sectionTokens`; `I18N_BACKEND=anthropic`
does the opposite. `doctor` checks the token's variable name as it checks the API
key's. `prepush` estimates the tokens a missing translation needs, with no price:
no API rate applies to a subscription.

**Terms of use.** Unattended use of a subscription is governed by its plan's
terms, and its limits are not published: a bulk translation can meet them. The
API-key backend remains the transport for CI; this backend is meant for a
developer translating on their own machine, or wherever the plan allows
automation.

## The memory: two layers, one writer each

Under `memory.dir`, per target locale:

- `messages/<lang>.json` — the **human layer**: seeded copy, corrections,
  reviewed entries. Written by people and by `seed`.
- `machine/<lang>.json` — the **machine layer**. Written by `translate`,
  `pipeline` and `collect`, and created by the first run that translates
  something.

A lookup prefers the human entry wherever both layers carry a key. Beside them:
`source.json` (the catalogue), `messages/_source.json` (key → source text),
`<layer>/_archive/<lang>.json` (entries `gc --apply` collected),
`seed-report.json`, `jobs/`, `pending.json` (the recorded batches and the
resubmission queue) and, by default, `prompts/`.

In a project that runs `l10n ci`, the newest machine layer and pending file are
on the CI branch; a working branch's copy of the machine layer lags it until
`l10n sync` commits it there. In a local-mode project the developer commits the
machine layer `l10n local` writes, and `pending.json` is local state, ignored
by git ([Translating locally](#translating-locally)).

## Running in CI

The CI mode — `mode` absent, or `"ci"` — is for a project that translates in CI: `l10n ci` is the one
command its two workflows run. The **translation workflow** runs it on a push
touching the sources, the human layer or the prompt files, and by hand; it has
no schedule. The **collector** runs it every 10 minutes, and by hand, while a
batch is pending ([The collector](#the-collector)). The package ships both
for each example:
[`examples/markdown-docs/.github/workflows/l10n.yml`](examples/markdown-docs/.github/workflows/l10n.yml)
and [`l10n-collect.yml`](examples/markdown-docs/.github/workflows/l10n-collect.yml)
for a Markdown corpus whose configuration sits in `l10n/`, and
[`examples/json-site/.github/workflows/l10n.yml`](examples/json-site/.github/workflows/l10n.yml)
and [`l10n-collect.yml`](examples/json-site/.github/workflows/l10n-collect.yml)
for a block-composed site whose configuration sits at the repository root. The
two examples differ in their trigger paths and in the `--config` the `l10n ci`
step passes.

### The CI branch

`ci.branch` names a branch holding the memory directory's `machine/` and
`pending.json`, at their paths in the repository, and nothing else. `l10n ci`
is its only writer, and it never commits to, moves or pushes the working
branch: it builds each commit from a temporary index, pushes it by the single
refspec `<commit>:refs/heads/<ci.branch>`, and refuses to run with the CI
branch checked out.

### What `l10n ci` does

In order:

1. fetches the CI branch and copies its machine layer and pending file over the
   checkout's — or, when the remote has no such branch, creates it as an orphan
   branch with its first commit;
2. runs `extract`, so the catalogue is the checked-out content's;
3. runs `collect`;
4. runs `submit`, unless the collection failed or left a recorded batch that has
   not ended;
5. commits the machine layer and the pending file, on top of the fetched commit,
   with one fixed one-line message — unless neither changed;
6. pushes that commit to the CI branch, and to nothing else;
7. when the configuration names `ci.collector`, switches the collector on when
   the pending file it left records a batch and off when it records none
   (`PUT /repos/{owner}/{repo}/actions/workflows/{collector}/enable` or
   `…/disable`), whatever state the collector is in;
8. when the collection applied at least one translation and the push succeeded,
   asks GitHub to run the workflow `ci.dispatch` names on its ref
   (`POST /repos/{owner}/{repo}/actions/workflows/{workflow}/dispatches`).

The commit and the push run even when `collect` or `submit` failed, so what a
collection applied is never lost; the command then fails as that step did. A
run with no batch to collect and nothing to translate creates no client, makes
no commit and pushes nothing.

When nothing reaches the CI branch — the commit or the push fails, for example
because a ruleset refuses the job's token — after `submit` created a batch in
the same run, that batch is recorded only in the runner's checkout, which CI
discards, and the next run would submit the same units again. So `l10n ci`
cancels that batch through the Message Batches API, prints its id and whether
the API accepted the cancellation, and exits 1. The cancellation is bounded by
the API's own behaviour: the batch enters `canceling`, and the API may complete
requests in progress that cannot be interrupted before it finalizes the
cancellation, so requests it had already processed, and those it completes,
may still be billed. When the cancellation itself fails, the command prints the
batch id and that the batch could not be canceled, so it can be canceled by
hand, naming the error by its class and HTTP status alone. A run that created
no batch cancels nothing, and also exits 1. When `submit` created a batch and
could not record it in `pending.json`, `submit` has already asked for its
cancellation (see `submit` above): the command exits 1 and never cancels that
batch again.

From the environment it reads: the API key (`backend.apiKeyEnv`);
`GITHUB_TOKEN`, which reaches git as an HTTP header scoped to
`GITHUB_SERVER_URL` (default `https://github.com`), through git's environment
configuration rather than an argument or a file, and the collector's switch and
the dispatch request as a bearer token, and which no message prints;
`GITHUB_REPOSITORY` and `GITHUB_API_URL` (default `https://api.github.com`)
for those two requests; and the
commit identity, `GIT_AUTHOR_*` and `GIT_COMMITTER_*`, which the workflow sets.

### The workflows

The templates hold these rules. They are stated once in code, as the
predicates of `src/workflow.mjs` (exported as `triggerProblems`,
`collectorTriggerProblems`, `pullRequestProblems`, `permissionProblems`,
`concurrencyProblems`, `checkoutProblems`, `secretProblems`,
`workflowProblems`, `collectorProblems` and `sharedGroupProblems`), which
`l10n doctor` applies and a consuming project's own tests can apply to its
workflows:

- **Triggers**: the translation workflow runs on a push to the working branch
  touching exactly the source files, the human layer (`messages/`) and the
  prompt files, and on manual dispatch; nothing else, and no schedule. The
  collector runs on a schedule every 10 minutes, its one automatic trigger, and
  on manual dispatch; nothing else. Either may instead run **by hand alone**,
  with manual dispatch its one trigger, so that no push and no schedule ever
  starts a paid run; the translation workflow then names the working branch in
  its checkout's `ref`, which `doctor` reads in place of the push branch.
  Neither runs on `pull_request` or `pull_request_target`: the job holds the API
  key.
- **Permissions**: `contents: write`, to push the CI branch, and
  `actions: write`, to switch the collector and dispatch; nothing else. One
  job, `translate`, with no permissions of its own.
- **Concurrency**: one named group, shared by the two workflows, with
  `cancel-in-progress: false`, so two runs never race for the CI branch and no
  run is cut off between creating a batch and recording it.
- **Checkout**: the first step checks out the working branch, because a
  scheduled run starts from the repository's default branch and a manual run
  from whichever branch it names, and it persists no credential.
- **Actions** are pinned by a full commit.
- **Secrets**: the API key's secret and `GITHUB_TOKEN` reach the `l10n ci` step
  alone — neither is set for the workflow, for the job or on another step — and
  the file names the API key's secret once.

The collector's job is the translation workflow's, the same steps and the same
command. The templates' install step, which runs before the `l10n ci` step and
reads no secret, is the form [Vendoring it](#vendoring-it) states; no predicate
checks it, since an install step's shape is the project's.

### The collector

While a batch is pending, the collector runs `l10n ci` every 10 minutes, which
collects the batch once it has ended. The command switches it on when a run
leaves a batch recorded on the CI branch and off when a run leaves none, so an
idle project runs nothing, and no job waits on a batch. The switch is made only
after the CI branch holds the pending file it reads. A refused switch-on fails
the run, naming the request, after the push and the dispatch: the batch stays
recorded, and the next push or a manual run collects it. A refused switch-off is
printed and the run exits 0, since a collector left on finds nothing to collect.
GitHub's documentation lists, for the enable and disable endpoints, the tokens
with the "Actions" repository permission (write), and does not name the job's
token; confirm at a project's first live run that the collector shows enabled
after a submission and disabled after the collection.

GitHub runs a schedule only from the default branch ("Scheduled workflows will
only run on the default branch", GitHub's documentation on the events that
trigger workflows, read 2026-10-17), so the collector collects only once both
workflows sit on the default branch; until then, the next push or a manual run
collects. A workflow file has no disabled state of its own: pushed, the
collector is enabled, and its first scheduled run switches it off unless that
run leaves a batch recorded. To skip even that run, disable it after the first
push, from the repository's Actions page or with
`gh workflow disable l10n-collect.yml`; the collector rests disabled from then
on, and `l10n ci` switches it on when it is needed.

### The dispatch

A push made with the job's own `GITHUB_TOKEN` starts no workflow, while a
`workflow_dispatch` raised with it does. So pushing the CI branch triggers
nothing, and the dispatch is how the deploy learns of new translations. The
dispatched workflow declares `on: workflow_dispatch`.

### The deploy-time overlay

`l10n overlay` is what a deploy build runs before it generates its targets. It
fetches the CI branch with whatever credentials git has, and otherwise reads
`refs/remotes/origin/<ci.branch>`, which a checkout of every branch leaves
(`fetch-depth: 0` for `actions/checkout`); it copies the branch's machine-layer
files over the checkout's and prints the commit it read. When neither source
has the branch — a first deploy before any CI run, or a private repository and
no credential — it prints that the build uses the committed memory, and exits
0. The build then regenerates its targets from the source and both layers
(`materialize` with the JSON-content adapter, `generate` with the Markdown
adapter), so a deploy carries the newest translations with no commit to the
working branch. It reads no token.

### The production-only refusal

`gate --check` exits 1 while any source unit lacks a translation. A publishing
deploy runs it as a blocking step, so it waits until the memory covers every
source string; a development deploy runs it as a report and publishes with the
source text as the fallback.

## Syncing a working branch

`l10n sync` brings the CI branch's machine layer into the checked-out branch as
one commit, with no merge, no rebase and no clean working tree required, and
`l10n watch` runs it when the CI branch moves. Neither pushes: publishing the
commit is the developer's own push.

### What `l10n sync` does

In order:

1. fetches the CI branch, with its whole history, into
   `refs/remotes/origin/<ci.branch>` — or, when the remote has no such branch,
   prints so and exits 0;
2. refuses, with exit 1, naming each path and committing nothing, when the
   checkout's index or working tree differs from `HEAD` under the machine layer
   (a file modified, staged or added), or when `HEAD`'s machine layer holds a
   blob the CI branch's history never held at that path. CI is the machine
   layer's one writer, so a local translation run, a hand edit, or a commit of
   either is refused rather than overwritten; a machine layer at `HEAD` that is
   an earlier version the CI branch held is the normal case, and the first sync,
   with no machine layer at `HEAD`, has nothing to check;
3. when the CI branch's machine layer equals `HEAD`'s, prints so and exits 0,
   with no commit;
4. adds a temporary worktree of `HEAD`, outside the checkout, replaces its
   machine layer with the CI branch's, and runs `sync.commands` there in order,
   each through the shell at the project root. Every derived file is therefore
   regenerated from `HEAD`'s tree plus both memory layers, never from the
   working tree, so a source edit not yet committed never reaches a committed
   derivative. The checkout's nearest `node_modules` directory at or above the
   project root, inside the repository, is linked into the worktree at the same
   place, so the commands run with the checkout's installed dependencies, this
   package included, wherever the configuration sits in the repository. The commands get
   the environment less the token's variable and git's location variables
   (`GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`), and, when the sync fetches
   with the token, less `SSH_AUTH_SOCK`. A command that exits non-zero, or runs
   longer than ten minutes, stops the sync with exit 1, naming it and printing
   the end of its output, and nothing is committed;
5. builds one commit on top of `HEAD` through a temporary index seeded from
   `HEAD`'s tree, in which exactly the owned paths are replaced: the machine
   layer by the CI branch's, blob for blob, and each `sync.paths` entry by the
   worktree's files under it that no ignore rule covers. Its message is the one
   line `chore(i18n): sync the translation memory from CI`. The pending file
   stays on the CI branch;
6. moves the checked-out branch to that commit by a compare-and-swap on the old
   head (`git update-ref HEAD <new> <old>`). When a commit landed on the branch
   meanwhile, the swap fails and the sync starts again from step 2 on the new
   head, so that commit stays in the history; after five attempts it stops with
   exit 1;
7. for each owned path the commit changed, updates its index entry unless the
   path has staged changes, and its working-tree file unless the path has staged
   changes or its working-tree copy differs from the old `HEAD`. A path left as
   it was is named in the output as left: the commit holds the version
   regenerated from `HEAD`, and the developer's next build regenerates the file.

Nothing else in the index or the working tree is written, so every unrelated
staged or unstaged change is byte-identical afterwards. The sync also refuses
with exit 1 while a merge, rebase, cherry-pick or revert is in progress, and
with exit 2 when `HEAD` is detached or the CI branch is checked out. The
worktree is removed when the sync ends; one that a killed sync left behind,
locked with that sync's process id, is removed by the next sync once that
process no longer runs.

### The token, and where the CI branch is fetched from

With a token — the variable `sync.tokenEnv` names, read from the environment,
else from the dotenv file `--env-file` names — every fetch goes to the HTTPS
form of `origin`'s configured URL: `git@host:path` and `ssh://host/path` become
`https://host/path`, an `https://` URL is used as it is, and an `http://` URL is
refused. The token travels as an HTTP header scoped to that host, through git's
environment configuration, as `l10n ci` sends `GITHUB_TOKEN`, and no message
prints it. `GIT_ALLOW_PROTOCOL` is then that URL's transport alone, so a URL
that git's configuration rewrites to SSH is refused by git before it connects,
and `SSH_AUTH_SOCK` is removed, so no SSH agent is reachable. Without a token,
`sync` fetches from `origin` with whatever credentials git has. A read-only
token suffices: the sync and the watcher only fetch.

`--env-file` reads one line shape, `NAME=value`, optionally after `export ` and
optionally quoted with `'` or `"`; an unquoted value ends at ` #`, and the last
assignment wins. Only the configured variable is read from the file.

### `l10n watch`

`l10n watch` polls the CI branch's head with `git ls-remote` every
`sync.intervalSeconds` and runs `sync` when that head differs from the one it
last synced, on its first poll included, so a restart catches up; a sync that
fails is run again at the next poll. It reads the token at every poll, so
writing it into the file starts the watcher with no restart. Without one, it
prints once that it is idle and keeps polling for it, never fetching without
it, and it never exits on its own. A failed poll is printed once per distinct
message. On SIGTERM or SIGINT it stops after the poll in progress, so a sync
that is running finishes.

## Translating locally

The local mode — `"mode": "local"` — is for a project that rarely changes and
should run nothing while it is idle. The developer translates before pushing,
through the Message Batches API, with one command that waits for the batch on
their own machine — or through Claude Code on their subscription
([below](#on-a-claude-subscription-with-no-api-key)); a pre-push hook refuses the push until every pushed commit
is fully translated, and a check workflow turns red on a push the hook never
saw. Nothing in this mode is scheduled, and the only thing that polls is the
command a developer is waiting on.

A local-mode configuration carries no `ci` and no `sync`, which the schema
refuses there, and may carry `local`:

```json
"mode": "local",
"local": {
  "commands": ["npm run i18n:materialize", "npm run prebuild"],
  "paths": ["i18n/machine/", "content/en/", "ui/en.json"],
  "pollSeconds": 30
}
```

`local.commands` are the derived commands run after the last collection;
`local.paths` are what the developer commits: the machine layer and the files
those commands regenerate. Write each command so it cannot install anything, as
for the sync.

### What `l10n local` does

1. `extract`, then the gate. With nothing missing and no batch recorded it says
   so, creates no client and makes no request, and goes to step 4.
2. With no batch recorded, `submit`: the requests the per-submission budgets
   admit, as one batch, recorded in `pending.json`. Then, every
   `local.pollSeconds`, `collect`, which prints one line while the batch is
   still processing and applies it once it has ended. What the validation or
   the model refused is queued, and the next `submit` resubmits it, up to the
   attempt limit; so is what the budgets left for the next submission. This
   repeats until `submit` finds nothing to request, or refuses — over budget,
   or no API key — which stops the command with exit 1 and runs no derived
   command.
3. A batch already recorded — the command was interrupted after a submission —
   is resumed: the next run submits nothing new and polls that batch.
4. `local.commands`, in order, each through the shell at the project root; a
   failing one stops the command with exit 1. Then it prints the `git add` of
   `local.paths` and `git commit`. It never stages, commits or pushes.

It exits 1 when units are still missing at the end, each at the attempt limit,
after running the commands. With the `anthropic` backend it only ever uses the
Message Batches API, never the synchronous Messages API, whatever the size of the
change. A project names it in an npm script, for example
`"i18n:local": "l10n local"`.

### On a Claude subscription, with no API key

With `"backend": { "kind": "claude-code" }` — or `I18N_BACKEND=claude-code` for
one run — `l10n local` translates through Claude Code on the developer's
machine ([The Claude Code backend](#the-claude-code-backend)), with no API key
and no batch: after `extract` and the gate it runs the synchronous translation,
one process per request, which resubmits what the validation or the model
refused up to the attempt limit; then `local.commands` and the `git add` of
`local.paths`, as above. Nothing is polled and `pending.json` is not written; a
batch it already records stops the command with exit 1, since this backend
cannot collect it. The CLI's login is used when the configuration says
`"login": "allowed"`, or the run sets `L10N_CLAUDE_CODE_LOGIN=1`; otherwise the
token is read from `backend.tokenEnv`. `prepush` and the check workflow are the
same: they judge the committed memory and targets, whichever backend wrote them.

```json
"mode": "local",
"backend": { "kind": "claude-code", "model": "opus", "login": "allowed" },
"local": { "commands": ["npm run i18n:materialize"], "paths": ["i18n/machine/", "src/data_build/content/"] }
```

`pending.json` is local state in this mode: the batch in flight on this
machine. A project's `.gitignore` ignores it.

### The push check: `l10n prepush`

```sh
l10n prepush <remote> <url>   # as a pre-push hook: git's arguments, and its lines on standard input
l10n prepush <commit>         # one commit, as the check workflow names the pushed one
```

It judges each pushed commit — the local commit of every line git gives the
hook that does not delete its ref — in a temporary worktree of that commit,
never in the working tree: an uncommitted edit, translated or not, changes
nothing. In the worktree it extracts the catalogue, runs the gate against both
memory layers as the commit holds them, and runs the drift guard over the
committed targets. A commit is refused when a unit has no translation in either
layer, or when its committed targets differ from their regeneration: every
stale leaf, target file not generated and file generated from no source counts,
beside the hand-edited leaves. `verify-drift` itself still fails on a hand edit
alone, so a build that runs it still publishes a target that merely lags. The
whole push is refused while `pending.json` records a batch.

A refusal names, per commit and per locale, how many units are missing and on
which pages, with an estimate of translating them: an upper bound, every
estimated input token at the one-hour cache-write rate and every `max_tokens`
token at the output rate, at the Message Batches rates the package records with
the day they were read (`src/cost.mjs`). Then the drift guard's report, and the
next three steps: the local command — the project's npm script that runs
`l10n local`, else `npx l10n local` — the `git add` of `local.paths`, and
`git commit`. It exits 0 when every pushed commit passes and no batch is
recorded, and on a push that only deletes refs. It makes no network call,
creates no client and spends nothing.

### The pre-push hook and the `prepare` script

The hook, `.githooks/pre-push`, executable:

```sh
#!/bin/sh
exec npx --no l10n prepush "$@"
```

`exec` hands it git's standard input, and `npx --no` runs the installed command
and never installs one. A configuration elsewhere than `l10n.config.json` at the
repository root is named with `--config <path>` before `"$@"`.

The `prepare` script in `package.json` arms it for every developer: npm runs
`prepare` on `npm install` with no arguments and on `npm ci`, so installing the
project sets `core.hooksPath`, and outside a git work tree it does nothing:

```json
"prepare": "if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then git config core.hooksPath .githooks; fi"
```

`git push --no-verify` skips the hook, and a push made from another machine —
by a tool that pushes from its own servers, or by a clone that never ran
`npm install` — never runs it. The check workflow is what catches those.

### The check workflow

`.github/workflows/l10n-check.yml` runs the same check on the pushed commit,
`npx --no l10n prepush "$GITHUB_SHA"`, so a push the hook never saw turns red
with the same message. Its rules, which `doctor` checks and the package's
workflow predicates (`checkWorkflowProblems`) state:

- **triggers** — a push touching exactly the source files, the whole memory
  directory, the prompt files when they lie outside it, and every target
  locale's committed targets, on any branch, and manual dispatch; nothing
  else;
- **pull requests** — never `pull_request_target`, which runs with the base
  repository's secrets;
- **permissions** — `contents: read` and no other, and one job, `check`, with
  none of its own;
- **steps** — the checkout persists no credential and checks out the pushed
  commit, every action is pinned by a full commit, and one step runs
  `l10n prepush` on the pushed commit, after the step named `Install`;
- **secrets** — no secret and no `github.token` anywhere but in the `Install`
  step. The install is the project's own `npm ci`; the credential for a
  private dependency of the project, if it has one, is passed there and nowhere
  else. The vendored package needs none.

[`examples/json-site/.github/workflows/l10n-check.yml`](examples/json-site/.github/workflows/l10n-check.yml)
is the template, for the example's local-mode configuration `l10n.local.json`.

## The shape of the glossary

```jsonc
{
  "model": "claude-sonnet-5-5",          // optional: replaces backend.model's id
  "site_context": "You are a professional translator for …", // one sentence about the site
  "target_lang_names": { "en": "English" }, // the human name of each target language
  "do_not_translate": [ "Cognitio", "Kubernetes", { "term": "LASTRA", "case": "sensitive" } ], // verbatim terms
  "do_not_translate_case": "sensitive",  // optional: match those terms only as written
  "glossary": {                          // terminology, per language
    "en": { "Servizi Cloud": "Cloud services", "Contatti": "Contact" }
  }
}
```

The translator reads these fields:

- `model` — a model id that replaces `backend.model`'s id, its other settings
  kept. No date suffix. For a bulk translation an operator can set a cheaper
  model (a current `sonnet` or `haiku`, say) without touching any code.
- `site_context` — the one sentence describing the site to the translator. It
  lives in the glossary rather than in the backend, which is what keeps the
  backend site-agnostic.
- `target_lang_names[lang]` — injected into the system prompt as the name of the
  target language ("English", for instance).
- `do_not_translate` — the list of terms the model keeps VERBATIM. Without
  `do_not_translate_case` they are matched case-insensitively, with the casing
  of each occurrence preserved. In either matching mode the validation bounds
  a term within its own script: a term written in Latin letters has no Latin
  letter or digit on either side, and any other term no letter or digit, so a
  longer word that begins with it is no occurrence of it, and any other form of
  the term, such as its plural, is a term of its own, listed too wherever it
  stays verbatim.
- `do_not_translate_case` — `"sensitive"` matches each term only as the list
  writes it, capital letters included, so a product noun such as `Component`
  stays verbatim while the ordinary word `component` is translated; rule 1 of
  the instructions states the mode in force and the validation applies it,
  `"insensitive"` is the default, and any other value stops `translate`,
  `pipeline`, `submit`, `collect` and `ci` with exit 2, naming the file and the
  key, and fails `doctor`'s glossary check. In that mode a
  word that only takes a capital at the start of a sentence is kept verbatim
  there too, since its casing then matches the term's.
- an entry `{ "term": "LASTRA", "case": "sensitive" }` of `do_not_translate`
  matches that term in its own mode, whatever the list's: a product name
  written in capitals (`LASTRA`, `VELATO`) stays verbatim while the common word
  (`lastra`, `velato`) is translated, in a list whose other terms keep matching
  in any casing; `"case": "insensitive"` is the converse inside a
  `"sensitive"` list. The glossary part of the instructions marks each such term
  `(exact case)` or `(any case)`, rule 1 states what the mark means, and the
  validation applies each term's mode. An entry that restates the list's mode is
  a plain term, and a list of plain terms gives the instructions they gave
  before. Any other entry object — no `term`, another `case`, another key —
  stops the commands that translate with exit 2, naming its position, and fails
  `doctor`'s glossary check.
- `glossary[lang]` — a source-term → target-term map, applied as TERMINOLOGY.

### How to extend `do_not_translate`

Add the proper nouns — brand, product or collection names — that must stay
identical in the target language. The criterion: include only proper nouns
confirmed verbatim in the generated target content, never common words (which
collide with ordinary translation) and never product codes (already excluded by
the field rules). A product noun spelled like a common word, such as an entity
kind `Component` beside the word `component`, belongs in the list only under
`do_not_translate_case: "sensitive"`, or as an entry `{ "term": "Component",
"case": "sensitive" }`, which keeps the two apart. The matching is
performed by the model, so the list must stay a curated set of names rather than
a dump of tokens.

### How to extend `glossary[lang]`

Add `"<source term>": "<target term>"` pairs to pin recurring terminology. The
glossary governs the CHOICE OF TERMS only; syntax and tone stay with the model.
Extend it conservatively, with confirmed terms only.

## How to add a language

1. Add it to the project's locale declaration's `targets`: a BCP 47 language
   tag of letters, digits and hyphens (`fr`, `de`, `es`, `pt`, `pt-BR`,
   `zh-Hans`, `zh-Hant`), used as written in the prompt file's name, the memory
   files, the target directories and paths, and the batch identifiers. The
   configuration refuses another shape (`en_US`), a target listed twice and the
   source among the targets.
2. Add the human name to `target_lang_names` (for example `"de": "German"`).
3. Add the terminology map to `glossary` (for example `"de": { ... }`).
4. Write the language's prompt file, `<promptsDir>/de.md`: its register,
   quotation marks, the terms kept as they are, and a line inviting a native
   speaker's correction.
5. `do_not_translate` is shared across languages — names stay verbatim
   everywhere — so it normally needs no per-language duplicate.
6. Where `sync.paths` names each target locale's derived files, add the new
   locale's.
7. Run `l10n doctor`: it names a target locale left without its prompt file.

No change to the package is needed: requests are per page and per locale, and
each carries that locale's system prompt. A project's `_general.md`, when it
keeps one, applies to the new language as it is.

## Examples

Each adapter has a runnable example under `examples/`, wired as
[Installing and wiring it](#installing-and-wiring-it) states, and the package's
tests run both, `doctor` included:

- [`examples/markdown-docs/`](examples/markdown-docs/README.md) — the
  configuration of the Aggrega documentation, a Markdown corpus translated from
  English into every target language its configuration names: the
  configuration, the glossary, the general prompt, one prompt file per
  language, and the workflow template.
  [`INTEGRATION.md`](examples/markdown-docs/INTEGRATION.md) lists what the
  documentation repository's maintainers do to adopt it.
- [`examples/json-site/`](examples/json-site/README.md) — a minimal
  English-source block-content site: two content files, a UI dictionary, the
  configuration, a glossary, two prompt files and the workflow template, run
  offline with the pseudo-localizer.

Beside them, [`examples/configurations/`](examples/configurations/README.md)
holds two configurations, validated by the tests and not runnable on their own,
for two shapes of JSON-content site: one whose target pages were written by
hand and are not one to one with the source pages, and one whose content files
are pages, collections and shared data with neutral paths, translated in the
local mode on a Claude subscription.
