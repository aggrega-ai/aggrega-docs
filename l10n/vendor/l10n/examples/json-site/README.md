# Example: a block-composed site, English into Italian and German

A minimal site whose pages are data, laid out as such a site keeps them, with
the JSON-content adapter (see the package README, "The configuration file"):

```text
l10n.config.json             the configuration: source en, targets it and de, Claude Opus 5.5
l10n.local.json              the same site in the local mode
content/en/home.json         a content file: seo fields and two blocks
content/en/about.json        a second content file
ui/en.json                   the UI dictionary
i18n/glossary.json           the site sentence, the do-not-translate brand, the terminology
i18n/prompts/it.md           the Italian prompt file
i18n/prompts/de.md           the German prompt file
.github/workflows/l10n.yml   the translation workflow
.github/workflows/l10n-collect.yml  its collector
.github/workflows/l10n-check.yml    the local mode's check workflow
.githooks/pre-push           the local mode's push check
package.json                 the package's archive, the local command's script and the prepare script that arms the hook
.gitignore                   the pending file, local state in the local mode, and the staging area
```

The memory lives under `i18n/` (`memory.dir`), and `generate` writes the target
locales into the staging area `i18n/generated/`; `materialize` writes them to
`content/<locale>/` and `ui/<locale>.json`.

## The CI branch, the sync and the workflows

- **`ci.branch`** is `l10n-memory`, the branch `l10n ci` alone writes, and
  **`ci.collector`** is `l10n-collect.yml`. The configuration names no
  `ci.dispatch`.
- **`sync`** names what the sync regenerates when it brings that branch's
  machine layer into the working branch: the command
  `npx --no l10n materialize`, which cannot install anything, and the paths it
  writes, each target locale's content directory and UI dictionary. Adding a
  target locale adds its two paths here.
- **`.github/workflows/l10n.yml`** is the template a block-composed site
  installs at that path: `npx l10n ci` on a push to `main` touching
  `content/en/`, `ui/en.json`, the human layer or the prompt files, and by
  hand; it has no schedule. **`.github/workflows/l10n-collect.yml`** is its
  collector: the same command every 10 minutes while a batch is pending, which
  `l10n ci` switches on and off. Their comments list what they assume, and the
  package README ("Running in CI") states the rules they hold.

From this directory, `npx l10n doctor` checks all of it and passes every check.

## The local mode

`l10n.local.json` is the same site translated on the developer's machine
(`"mode": "local"`; see the package README, "Translating locally"): it carries
no `ci` and no `sync`, and its `local` key names the derived command,
`npx --no l10n materialize --config l10n.local.json`, and what the developer
commits after a translation: the machine layer and each target locale's content
directory and UI dictionary. The wiring is the one any local-mode project
carries:

- **`package.json`** — `npm run i18n:local` runs `l10n local`, and the
  `prepare` script sets `core.hooksPath` to `.githooks` when it runs inside a
  git work tree, so `npm install` or `npm ci` arms the hook;
- **`.githooks/pre-push`** — `npx --no l10n prepush` with git's arguments and
  standard input, which refuses a push until every pushed commit is fully
  translated;
- **`.github/workflows/l10n-check.yml`** — the same check on the pushed commit,
  for a push the hook never saw;
- **`.gitignore`** — `i18n/pending.json`, the batch in flight on this machine.

Each names `--config l10n.local.json`, which a project whose configuration is
`l10n.config.json` at its root drops. `npx l10n doctor --config l10n.local.json`
checks this wiring and passes every check. The package's own test runs the hook
in a temporary repository with a bare remote: an untranslated push is refused
and leaves the remote unchanged, and once `l10n local` has run and its output is
committed, the push succeeds.

## Running it without a model

The package's pseudo-localizer stands in for the translator: passed as the
backend, it accents every ASCII letter, so every command runs offline and a
translated string differs from its source wherever the source has an ASCII
letter.
The commands write the memory and the targets, so run them in a copy of this
directory, from its root:

```js
import { runCli, createPseudoLocalizer } from '@aggrega-ai/l10n';
const backend = createPseudoLocalizer();
for (const argv of [['extract'], ['gate'], ['translate'], ['gate', '--check'], ['generate'], ['verify-drift', '--scope', 'staging']]) {
  console.log(argv.join(' '), await runCli(argv, { backend }));
}
```

Each command prints what it did and returns 0. The package's own test of this
example runs the same sequence in a temporary copy.

The pseudo-localizer keeps nothing but a unit's protected spans, and a
JSON-content unit has none, so it accents a do-not-translate term too, and the
validation rejects that string. The fixtures therefore name the brand only in
the glossary; a run with the model keeps the brand as the glossary asks.

## Running it with the model

With the API key in `ANTHROPIC_API_KEY`, `l10n translate` sends one request per
page and locale, and `l10n submit` then `l10n collect` do the same through the
Message Batches API. Both spend tokens.

`backend.submission` allows 2,500,000 estimated input and 1,000,000 output
tokens per submission: at most USD 20 at Claude Opus 5.5's Message Batches
rates published on 2026-10-17, with every estimated input token billed as a
one-hour cache write (USD 4 per million) and every `max_tokens` token as output
(USD 10 per million).
