# CLI Overview

The `aggrega` CLI is the compiler's entry point. Every interaction with Aggrega — compiling an Aggregate into deployable artifacts, inspecting the catalog or the IR, resolving and pinning dependencies, publishing catalog entities, checking correctness with `validate`, checking publishing conventions with `lint`, and serving an IDE — runs through a subcommand of `aggrega`. This chapter set covers each subcommand's flags, inputs, and outputs.

`aggrega validate` and `aggrega lint` are complementary checkers that mirror each other's three scopes — the whole catalog, a Release's dependency closure, or one entity. `aggrega validate` checks **correctness** (schema, pillars, reference resolution, `extends`, provider input-kind capability, and — for a rendering entity — an isolated render); `aggrega lint` checks **publishing conventions** (naming, category-directory alignment, annotation prefixes, and version-bump size). Neither emits artifacts; use `validate` to answer "is this correct?" and `lint` to answer "does this follow the catalog's publishing discipline?".

`aggrega build` follows the Single Entry Point Principle: the Release is the sole compilation input. `aggrega build --release release.yaml` reads the Release's `aggregate:` and `manifest:` pointers to locate the rest of the topology, and produces per-boundary output under `dist/`: a named boundary renders under its declared `directory:`, or under `dist/boundaries/<boundary-name>/` when it declares none; a Release that declares top-level `components:` instead of named boundaries renders flat under `dist/`. Every component the topology holds must belong to one of those boundaries, and a component none of them holds halts the build: a component reaches a boundary either by being named under that boundary's `components:`, under the id it carries once sub-Aggregates are flattened, or by sitting inside a sub-Aggregate the boundary routes in under `aggregates:`. A component reaching neither would render outside every boundary the Release declares, taking its output location, sync wave, annotations and per-component `infra:` from nowhere, so the build stops and names the component rather than emitting artifacts the Release's boundary configuration was never applied to. The same relation is checked from the Release's side: a boundary entry naming a component the topology does not hold configures nothing, so it halts too and the diagnostic reports the id the entry addressed. `aggrega pull` shares the Release-as-input shape; `aggrega inspect` takes any entity — a catalog name, an entity file, a registry reference, or a Release; `aggrega push` takes a catalog entity; `aggrega validate` and `aggrega lint` accept a catalog entity, a Release (via `--release`), or the whole catalog; `aggrega serve` runs as a long-lived process. The global flags page documents flags that apply across subcommands.

## Per-command reference

- [`aggrega build`](cli/aggrega-build.md) — the primary compile command. Reads a Release pointer, resolves the Aggregate and Manifest it references, and emits per-boundary compiled artifacts.
- [`aggrega inspect`](cli/aggrega-inspect.md) — a readable view of any entity: a catalog entity by name, an entity file by path, a published entity read straight from its registry, or a fully resolved Release, whose IR Graph `--ir-graph` writes as JSON and whose dependency closure `--closure` reports.
- [`aggrega pull`](cli/aggrega-pull.md) — resolve a Release's dependencies and write a per-Release lockfile pinning every dependency; cache catalog entities and source artifacts.
- [`aggrega push`](cli/aggrega-push.md) — publish a catalog entity to an OCI registry, optionally signing it at push time.
- [`aggrega sign`](cli/aggrega-sign.md) — sign one or more already-published artifacts and attach each signature as an OCI referrer.
- [`aggrega auth token`](cli/aggrega-auth.md) — acquire an OIDC identity token interactively and print it to stdout, for one authentication across a batch of keyless signs.
- [`aggrega registry`](cli/aggrega-registry.md) — manage the registries the workspace knows and their signature trust policy: add, list, and remove entries, and build a local searchable index of published catalog metadata with `registry update`.
- [`aggrega search`](cli/aggrega-search.md) — search the local index of configured registries for published catalog entities and installable CLI plugins, matching a free-text query and optional facet filters.
- [`aggrega validate`](cli/aggrega-validate.md) — check correctness (schema, pillars, reference resolution, `extends`, input-kind capability, isolated render) across the whole catalog, a Release's dependency closure (`--release`), or one entity.
- [`aggrega lint`](cli/aggrega-lint.md) — check publishing conventions across the whole catalog, a Release's dependency closure (`--release`), or one entity; `--pre-publish` adds the registry-aware version-bump gate.
- [`aggrega serve`](cli/aggrega-serve.md) — a long-running compiler-as-service daemon (JSON-RPC over stdin/stdout) for IDE integration.
- [`aggrega version`](cli/aggrega-version.md) — print the CLI version; `-o json` emits a machine-readable object.
- [`aggrega get-schema`](cli/aggrega-get-schema.md) — print the canonical JSON Schema for an entity or contract kind; `--list` names every kind. The authoritative shape to author a file against.
- [`aggrega scaffold`](cli/aggrega-scaffold.md) — print a starter document for an entity kind, derived from that kind's schema: the required fields, with the fixed ones filled in and a placeholder everywhere a value is needed. It writes no file; redirect it where you want it.
- [`aggrega mcp`](cli/aggrega-mcp.md) — run a Model Context Protocol server, over standard input and output or over HTTP, so an MCP-capable client becomes an Aggrega-aware authoring assistant. See the [Authoring Guide](../authoring/getting-started.md).
- [`aggrega skills`](cli/aggrega-skills.md) — install the skill that teaches an AI assistant to install and use Aggrega into that assistant's skill folder, for one project or, with `--global`, for every project of yours.
- [`aggrega cache`](cli/aggrega-cache.md) — inspect and maintain the on-disk caches: list what they hold, reclaim artifact-cache entries no lockfile references, trim the compiled-module cache to a size cap, or wipe every cache.
- [`aggrega config`](cli/aggrega-config.md) — inspect and manage the configuration Aggrega reads: show what applies and which layer decided each setting, seed a working configuration, and freeze the build-critical settings into the workspace.
- [`aggrega deprecate`](cli/aggrega-deprecate.md) — attach a signed deprecation marker to an already-published artifact.
- [`aggrega edit-document`](cli/aggrega-edit-document.md) — apply one bounded structured edit to a document, preserving every byte it does not touch.
- [`aggrega explain`](cli/aggrega-explain.md) — explain the halting condition a code names.
- [`aggrega import`](cli/aggrega-import.md) — turn a foreign source description into draft Aggrega authoring files.
- [`aggrega login`](cli/aggrega-login.md) — authenticate to an OCI registry and store the credential that `push`, `pull` and `lint --pre-publish` present.
- [`aggrega logout`](cli/aggrega-logout.md) — remove a stored registry credential.
- [`aggrega pin`](cli/aggrega-pin.md) — record the content pins for an entity's external inputs in the `entity.lock` beside it.
- [`aggrega plugin`](cli/aggrega-plugin.md) — list the Wasm plugins the CLI can resolve, add or remove a workspace binding, and check a guest before you publish it.
- [`aggrega push-artifact`](cli/aggrega-push-artifact.md) — publish a standalone data artifact, such as a documentation bundle, to an OCI registry under its `docs/` namespace.
- [Configuration](cli/configuration.md) — which file a setting belongs in, and how the layers combine. Start here: it opens with the two files most projects need and keeps the mechanisms a larger project reaches for behind that.
- [Global flags](cli/global-flags.md) — flags shared across subcommands (the workspace root, the global configuration file, color and plain accessible output, and the offline posture). Offline is reachable as a configuration setting and an environment variable too — see [Configuration](cli/configuration.md), the [configuration schema](schema/other/aggrega-config.md) and [environment variables](cli/environment-variables.md).
- [The workspace boundary](cli/workspace-boundary.md) — what lies inside a workspace, what a symbolic link leading out of it does to each kind of path, the paths that reach outside on purpose, and what to do when one is refused.

<!-- BEGIN GENERATED: command-list -->
| Command | Description |
| --- | --- |
| `aggrega auth` | Manage the signing identity |
| `aggrega build` | Compile an Aggregate and Release into provider-native artifacts under dist/ at the workspace root |
| `aggrega cache` | Inspect and maintain the on-disk caches |
| `aggrega config` | Inspect and manage the workspace configuration |
| `aggrega deprecate` | Attach a signed deprecation marker to an already-published artifact |
| `aggrega edit-document` | Apply one bounded structured edit to a document, preserving every byte it does not touch |
| `aggrega explain` | Explain the halting condition a code names |
| `aggrega get-schema` | Print the JSON Schema for an entity or contract kind |
| `aggrega import` | Turn a foreign source description into draft Aggrega authoring files |
| `aggrega inspect` | Inspect a catalog entity by name, an entity file by path, or a published entity by its registry reference |
| `aggrega lint` | Check catalog publishing conventions across the catalog, a Release, or one entity |
| `aggrega login` | Authenticate to an OCI registry and store the credential |
| `aggrega logout` | Remove a stored registry credential |
| `aggrega mcp` | Run a Model Context Protocol server over standard input and output, or over HTTP, for AI-assistant integration |
| `aggrega pin` | Record the content pins for an entity's external inputs in the entity.lock beside it |
| `aggrega plugin` | Inspect the Wasm plugins the CLI can resolve |
| `aggrega pull` | Resolve catalog and source dependencies into the cache and write the per-Release lockfile |
| `aggrega push` | Bundle and publish a catalog entity to an OCI registry |
| `aggrega push-artifact` | Publish a standalone data artifact (such as a documentation bundle) to an OCI registry |
| `aggrega registry` | Manage registries and their signature trust policy |
| `aggrega scaffold` | Draft a starter document for an entity kind from its schema |
| `aggrega search` | Search the local index of configured registries |
| `aggrega serve` | Run as a long-running compiler-as-service over JSON-RPC 2.0 on stdin/stdout |
| `aggrega sign` | Sign one or more already-published artifacts and attach their signatures |
| `aggrega skills` | Install the Aggrega skill into an AI assistant |
| `aggrega validate` | Check correctness across the catalog, a Release, or one entity |
| `aggrega version` | Print the aggrega CLI version |
<!-- END GENERATED: command-list -->

## Positional arguments and exit status

Every command refuses a positional argument it has no use for, and reports that refusal through a non-zero exit status rather than completing as though the invocation were valid. The rule covers the commands that exist only to group subcommands, where a mistyped subcommand name arrives as an unrecognised positional: the command's help is printed and the exit status is non-zero, so a typo on a scripted surface fails loudly instead of reading as a successful run. `aggrega` invoked with an unrecognised command behaves the same way and additionally names the closest matching command.

Where positionals are meaningful, each command's own reference page documents what it accepts. An installed CLI plugin is the deliberate exception: its command keeps argument parsing to itself, so the whole argument vector is forwarded to the plugin, which is the sole parser of its own arguments — and the plugin's own exit status is what the invocation returns.

## Paths you type, and the workspace boundary

A path you type on the command line — a `--release`, a `--catalog`, an `--output-dir`, a file to validate, lint, pin or publish, a `--workspace-root` — is used where it leads, inside the workspace or outside it, through any link on the way. What the command then reads and writes on its own account is held to the workspace whoever runs it: it does not read the workspace's configuration files, a catalog document, a document beside a Release or a Release's lockfile through a link leading out of the workspace, follow a path a Release or a Manifest writes out of it, or write its output, its lockfile or its cache through such a link. A directory you name outside the workspace is held the same way for what lies beneath it, and a Release you name outside the workspace reaches only files in its own directory. `aggrega edit-document` is the one command whose typed path is held as well: it edits only a document the workspace carries. [The workspace boundary](cli/workspace-boundary.md) states the rule, the paths that reach outside on purpose, and the remedy for each refusal.

## Searching the catalog index

`aggrega search [query]` looks up published entities across the registries the workspace knows. The optional `[query]` is a case-insensitive substring matched against each entity's name and description. Facet filters narrow the result set:

- `--kind` restricts to one or more entity kinds (`component`, `feature`, `recipe`, `featurerecipe`, `workload`, `plugin`); it is repeatable and case-insensitive, and the kinds combine as OR.
- `-l`/`--selector` filters on the entity's catalog labels. Category is a label, not a dedicated flag: `-l component.aggrega.ai/category=datastore`.
- `--capability` and `--plugin-type` filter plugins by a declared capability or socket type; `--capability` is repeatable and combines as OR.
- `--registry` scopes the search to a single registry by host or friendly alias; by default every configured registry is searched.
- `--limit` caps the number of results.
- `-o`/`--output` selects the output format: `table` (the default, human-readable), `json` (a machine-readable array), or `names` (bare identifiers, one per line).

Search always reads the **local index** — the offline snapshot that `aggrega registry update` builds and refreshes. It contacts no network and fetches nothing on demand. When the index is absent, the command fails and tells you to run `aggrega registry update` first. Every run prints a per-registry "last updated" freshness line to standard error, so the `json` and `names` output on standard out stays clean for scripting.

## Shell completion

`aggrega completion <shell>` prints a completion script to stdout for `bash`, `zsh`, `fish`, or `powershell`. The script is generated from the CLI's live command tree at the moment you run it, so it always reflects the commands and flags of the binary that produced it — there is no static file to regenerate as the CLI grows.

To try completion in your current session without installing anything, source the script directly:

```bash
source <(aggrega completion bash)
```

To install completion permanently, write the script to the location your shell reads on startup.

### bash

Bash completion relies on the `bash-completion` package; install it through your OS package manager if it is not already present.

```bash
# Linux
aggrega completion bash > /etc/bash_completion.d/aggrega

# macOS (Homebrew)
aggrega completion bash > $(brew --prefix)/etc/bash_completion.d/aggrega
```

### zsh

If completion is not yet enabled in your shell, enable it once:

```zsh
echo "autoload -U compinit; compinit" >> ~/.zshrc
```

Then write the completion script into a directory on your `fpath`:

```zsh
# Linux
aggrega completion zsh > "${fpath[1]}/_aggrega"

# macOS (Homebrew)
aggrega completion zsh > $(brew --prefix)/share/zsh/site-functions/_aggrega
```

### fish

```fish
aggrega completion fish > ~/.config/fish/completions/aggrega.fish
```

### powershell

Append the generated script to your PowerShell profile so it loads in every session:

```powershell
aggrega completion powershell >> $PROFILE
```

Start a new shell for the installed completion to take effect.
