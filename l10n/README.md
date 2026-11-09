# Translating this documentation

The documentation is written in English and translated with `@cognitio/l10n`,
vendored in this directory as its published archive under `vendor/`. Everything
the translation reads lives here:

- `l10n.config.json` — the locales, the Markdown adapter, the backend, and the
  translation-memory branch, `l10n-memory` (`ci.branch`).
- `glossary.json` — the terms never translated, and the terminology per locale.
- `prompts/` — the general prompt and the language guide of each locale.
- `memory/` — the translation memory. The machine layer, `memory/machine/`, has
  its home on the `l10n-memory` branch; `memory/session/` is a session's work
  directory and is never committed.

The package's own README states every command in full. It ships inside the
archive, as `package/README.md` in `vendor/cognitio-l10n-<version>.tgz`, and is
installed as `node_modules/@cognitio/l10n/README.md`.

## Installing the package

The repository root has no `package.json`, so the package is installed only
where a translation runs, from the vendored archive, and saved nowhere:

```sh
npm install --no-save --no-audit --no-fund "$(sh l10n/install.sh --cwd l10n path @cognitio/l10n)"
```

Run it at the root of the checkout that translates. It needs no credential.

## Two ways to translate

### In CI, with an API key

The **Translate** workflow, `.github/workflows/l10n.yml`, runs `l10n ci`: it
collects the batches that have ended, submits the segments still lacking a
translation, and pushes `l10n-memory`. Its collector,
`.github/workflows/l10n-collect.yml`, collects without submitting. Both are
started by hand, never by a push, because every submission is paid for, and
both read the API key from the repository secret `ANTHROPIC_API_KEY`.

### In a session, without an API key

A coding session translates with its own agents and no API key. The package
plans the batches, prints each agent's prompt, and validates every translation
before it reaches the memory. The session works in two linked worktrees of this
repository: one for the working branch, where the batches are exported and
imported, and one with `l10n-memory` checked out, where the machine layer is
committed.

```sh
git worktree add --detach ../docs-session dev
git fetch origin l10n-memory && git worktree add ../docs-memory l10n-memory
git -C ../docs-memory pull --ff-only
cd ../docs-session
npm install --no-save --no-audit --no-fund "$(sh l10n/install.sh --cwd l10n path @cognitio/l10n)"

npx --no l10n session export --config l10n/l10n.config.json --batches 2
#   … one fresh agent per batch, started with the prompt printed for it …
npx --no l10n session check 0001 --config l10n/l10n.config.json
npx --no l10n session import --config l10n/l10n.config.json
npx --no l10n session status --config l10n/l10n.config.json

npx --no l10n memory commit --config l10n/l10n.config.json --worktree ../docs-memory
```

`--no` makes `npx` refuse to download anything, so every command runs the
vendored package and nothing else. `memory commit` copies `memory/machine/`
into the `l10n-memory` worktree and commits exactly those paths there; it never
pushes. Where this repository is checked out as a submodule of a workspace that
installs a pre-commit hook, every linked worktree shares that hook, so the commit
is inspected like any other commit and a refusal names what to fix.

Pushing `l10n-memory` is done by a person, while no CI run is writing the
branch.

The full loop — the batches, the work directory, the output format, checking a
batch, and retrying rejected segments — is in the package README's section
**Translating in a session**.
