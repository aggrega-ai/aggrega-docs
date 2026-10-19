# Changelog

Each version of `@aggrega-ai/l10n` is a git tag of its repository, `l10n-vX.Y.Z`,
whose release publishes the archive a consuming project vendors from
`https://tooling.aggrega.ai/l10n/archives/l10n-X.Y.Z.tgz`. 1.0.0 holds every
feature the package has at its first release; a feature added after it is
recorded under the next version, above this one.

## 1.1.2

- `doctor` accepts a translation workflow or a collector that runs by hand
  alone, with manual dispatch its one trigger, so no push and no schedule starts
  a paid run; for such a translation workflow it reads the working branch from
  the checkout's `ref`. The workflows with their automatic triggers are checked
  as before.

## 1.1.1

- The Aggrega documentation example's prompt files name the compiler's stance
  with `content-neutral` and `agnostic to`, with a rendering for each in every
  language, in place of the words they replaced, as the documentation itself
  does. Nothing else changes; a site that copied the example's prompts copies
  them again.

## 1.1.0

Every 1.0.0 configuration means what it meant: each new key is optional, and its
default is the 1.0.0 behaviour. Two changes are stricter, and are listed under
[What a consumer does](#what-a-consumer-does).

### The JSON-content adapter

Configuration now fits a site whose content is not, or not only, block pages,
and one whose target pages were written by hand, with no adapter of its own:

- `adapter.document.walk` — `blocks` (the default), `whole`, or `auto`: a file
  holding a `blocks` array is a page, any other file is walked whole, its leaf
  paths relative to the file; `adapter.document.contextKey` names a whole
  document's context.
- `adapter.fields.denylistKeyPatterns` — key patterns (`_*`) excluded at any
  depth; `adapter.fields.identifierStrings` — keys whose strings are identifiers
  while their objects are content, as the key's own value, in its list, or
  both; `adapter.fields.skipInParent` — a key skipped only inside a parent the
  rule describes by the key it sits under, the keys it holds or the only keys it
  may hold.
- `adapter.output` — `path` (`prefixed` or `neutral`), `langField`, `keyOrder`
  (`sorted` or `source`), `pairs` (`all` or `langMap`: only pages the language
  map pairs are generated, materialized, compared and seeded), `fileName`
  (`source` or `path`: a target file named after its target path) and
  `materialize` (`replace` or `safe`).
- `materialize` under `output.materialize: "safe"` writes a file only when none
  of its leaves falls back to the source text and none of the leaves it would
  replace or remove is hand-edited; it names every file it leaves, with the
  reason. Under either policy it writes only paired pages, under their planned
  names, and never touches a target file no source page generates.
- `adapter.ui.nested` — a nested UI dictionary, every string at any depth an
  entry keyed by its path, the generated dictionaries keeping its shape.
- A page with no `path` gets none in its targets (1.0.0 stopped on it), and
  `seed` pairs it with the target file of its planned name.
- `seed` now applies the language map's pairs, which 1.0.0 read and did not
  pass to the alignment, so a page whose target path the map names is seeded
  from that page.
- Two source pages planned under one target file name stop `generate`, naming
  both.

### The Claude Code backend

- `"backend": { "kind": "claude-code" }` translates each request through Claude
  Code run headless on a Claude subscription, one `claude -p` process per
  request with the same system prompt, context and output schema as an API
  request, the user message on standard input, in an empty temporary directory,
  with `--safe-mode`. A request above `backend.maxPromptBytes` is split by its
  requested segments. Its keys: `model`, `tokenEnv`, `login`, `command`,
  `safeMode`, `maxPromptBytes`, `timeoutSeconds`, `concurrency`, `attempts`,
  `sectionTokens`.
- The token is read from `backend.tokenEnv` (default `CLAUDE_CODE_OAUTH_TOKEN`)
  in the environment alone and handed to the process in its environment; the
  CLI's own login is used only when `backend.login` is `"allowed"` or the run
  sets `L10N_CLAUDE_CODE_LOGIN=1`. The process receives no `ANTHROPIC_*`
  variable.
- `translate`, `pipeline` and `local` run on it; `submit`, `collect` and `ci`
  refuse it, and so does a configuration with a `ci` key. `l10n local`
  translates through it synchronously, with no API key and no batch.
- `I18N_BACKEND` now names the backend of one run, `anthropic` or
  `claude-code`, the other kind built from the configuration's `model`,
  `attempts` and `sectionTokens`.
- `doctor` checks the token's variable name for this backend; `prepush`
  estimates tokens without a price for it.

### Do-not-translate terms

- An entry `{ "term": "LASTRA", "case": "sensitive" }` of `do_not_translate`
  matches its term only as written, in a list that otherwise matches in any
  casing (and `"case": "insensitive"` the converse): the glossary part marks
  the term `(exact case)`, rule 1 states the mark, and the validation applies
  it. A list of plain terms gives the same instructions as in 1.0.0.

### Name and licence

- The package is `@aggrega-ai/l10n`, formerly `@cognitio/l10n`, and is
  licensed under the Apache License 2.0. The archive's URL is unchanged in shape.
- The package lives in `packages/l10n/` of the `site-modules` repository, and a
  version's tag is `l10n-vX.Y.Z`.

### Vendoring

- A project vendors the package into its own repository with the
  `site-modules` repository's `scripts/vendor.sh`, the one step that needs a
  credential for the tooling host, and installs it from there: through a
  `file:` dependency, or in a workflow alone with
  `npm install --no-save --install-links`. Its workflows read no secret to
  install it, and the example templates and the README say so.

### Locale codes

- Every locale code is validated as a BCP 47 language tag of letters, digits
  and hyphens — `fr`, `de`, `es`, `pt`, `pt-BR`, `zh-Hans`, `zh-Hant` — and a
  target listed twice, or equal to the source, is refused; the package's tests
  run every command for `pt`, `es`, `fr`, `de`, `zh-Hans` and `zh-Hant`.

### What a consumer does

1. Vendor 1.1.0 (`scripts/vendor.sh l10n 1.1.0 <dir>`), and install it from
   that directory instead of the archive's URL; remove the `.npmrc` line and the
   `L10N_AUTH` secret the install used. Rename the dependency, and any
   `import` of the package, from `@cognitio/l10n` to `@aggrega-ai/l10n`.
2. Check the locale declaration: a code that is no BCP 47 tag of letters,
   digits and hyphens (`en_US`), a duplicate target, or the source among the
   targets, now stops every command with exit 2, naming it.
3. Check `do_not_translate`: an entry that is an object must now be
   `{ "term": string, "case"?: "sensitive" | "insensitive" }`.
4. To drop a site-specific adapter or backend wrapper, state its rules in the
   configuration (`document`, `output`, `fields`, `ui.nested`,
   `backend.kind: "claude-code"`), run `l10n extract` and compare the catalogue
   with the committed one, then call `l10n` directly.
5. A site whose target files were written by hand sets
   `output.materialize: "safe"` (with `output.pairs` and `output.fileName` as its
   files are named) before it runs `materialize`.

## 1.0.0

The first version a project installs from its published archive.

### Commands

One command line, `l10n`, every command reading the project's
`l10n.config.json` and validating it before anything else:

- `extract` — builds the source catalogue from the source locale.
- `gate` — compares the catalogue with the translation memory; `--check` exits
  1 while a source string lacks a translation, without translating anything or
  calling a model.
- `translate` — translates the missing strings one page per request, through
  the Anthropic Messages API.
- `generate` — writes every target locale from the source and the memory, into
  a staging area for JSON content and into the output directory for Markdown.
- `materialize` — writes the JSON-content target locales to their real
  destinations.
- `pipeline` — extracts, gates, and translates then generates when work
  remains.
- `submit`, `collect`, `status` — the unattended path, through the Message
  Batches API: submit what fits the per-submission token budgets, apply what
  has ended, and print what is pending, with no network call for `status`.
  `submit --dry-run` prints the estimate and creates nothing.
- `ci` — the one command a CI-mode project's two workflows run: collects,
  submits, and pushes the CI branch, which holds the machine translations and
  nothing else, switches the collector workflow on while a batch is recorded
  and off otherwise, then, when translations arrived, dispatches the workflow
  the configuration names.
- `overlay` — copies the CI branch's machine translations over the checkout's
  for a deploy build.
- `sync` and `watch` — bring the CI branch's machine translations, with the
  files regenerated from them, into the working branch as one commit; `watch`
  runs `sync` whenever the CI branch moves.
- `local` — the local mode's translation: submits through the Message Batches
  API, waits on the batch on the developer's machine, collects and resubmits
  until nothing is missing, runs the derived commands, and prints what to
  commit.
- `prepush` — the local mode's push check, as a pre-push hook or on one commit:
  refuses a push unless every pushed commit is fully translated and its targets
  match their regeneration, judging each commit in a temporary worktree, and
  says what to run, with an offline cost estimate.
- `verify-drift` — fails on a target file edited by hand, and reports one that
  merely lags its source.
- `seed` — imports hand-written target text into the memory's human layer.
- `gc` — reports memory entries nothing uses, and archives them with `--apply`.
- `doctor` — checks a project's wiring, one line per check: the configuration,
  the prompt files, the glossary, the API key's variable, the translation
  workflow, its collector, the CI branch, and the sync's commands and paths; in
  the local mode, the local commands and paths, the pre-push hook, the
  `prepare` script and the check workflow in place of the last four.

### Adapters

- **JSON content**, for a site whose pages are JSON content files composed of
  blocks, with a UI dictionary: which fields are translated is configuration,
  and a slug can be overridden per page.
- **Markdown**, for a documentation corpus: each file is parsed as
  GitHub-flavoured Markdown and only its prose is replaced, so code, links,
  tables and generated sections keep their source bytes, and every heading keeps
  its source anchor. A remark plugin, `remarkHeadingIds`, sets those anchors as
  the headings' ids in a site that renders the translated pages.

### Also

- A two-layer translation memory per locale: what people write, and what
  translation runs write, the first winning where both hold a string.
- One request per page, or per section of a long page given its neighbours and
  the page's outline, a section itself above the size divided at its own
  headings and then into runs of segments, and per-language prompt files beside
  an optional general one.
- One validation of every reply, in both transports, segment by segment: markup,
  protected spans, do-not-translate terms, and UTF-8 text decoded in a
  single-byte code page are each a defect of the one segment; an identifier the
  request did not ask for is dropped and logged, one returned twice is judged
  per segment, and a defect of the whole reply is stated once in the next
  request.
- Do-not-translate terms matched case-insensitively, or only as written with the
  glossary's `do_not_translate_case: "sensitive"`, a term bounded within its own
  script.
- Only the system prompt marked for caching; an output ceiling of at least 1,024
  tokens, with a reasoning allowance only on a request that can reason; and a
  refusal's resubmission on `model.fallbackId` with the configured effort and no
  thinking setting.
- A configuration reference, generated from the configuration's schema, in the
  README, with the install and wiring guide.
- Two modes, set by `mode`: `ci`, translating in CI, and `local`, translating
  on the developer's machine with the push refused until it is done.
- Two runnable examples, a JSON-content site and a Markdown corpus, each with
  its translation workflow and its collector; the JSON-content site also in the
  local mode, with its hook, `prepare` script and check workflow.
