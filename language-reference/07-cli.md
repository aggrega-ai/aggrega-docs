# CLI Overview

The `aggrega` CLI is the compiler's entry point. Every interaction with Aggrega — compiling an Aggregate into deployable artifacts, inspecting the catalog or the IR, resolving and pinning dependencies, publishing catalog entities, checking correctness with `validate`, checking publishing conventions with `lint`, and serving an IDE — runs through a subcommand of `aggrega`. This chapter set covers each subcommand's flags, inputs, and outputs.

`aggrega validate` and `aggrega lint` are complementary checkers that mirror each other's three scopes — the whole catalog, a Release's dependency closure, or one entity. `aggrega validate` checks **correctness** (schema, pillars, reference resolution, `extends`, provider input-kind capability, and — for a rendering entity — an isolated render); `aggrega lint` checks **publishing conventions** (naming, category-directory alignment, annotation prefixes, and version-bump size). Neither emits artifacts; use `validate` to answer "is this correct?" and `lint` to answer "does this follow the catalog's publishing discipline?".

`aggrega build` follows the Single Entry Point Principle: the Release is the sole compilation input. `aggrega build release.yaml` reads the Release's `aggregate:` and `manifest:` pointers to locate the rest of the topology, and produces per-boundary output under `dist/boundaries/`. `aggrega inspect` and `aggrega pull` share the Release-as-input shape; `aggrega push` takes a catalog entity; `aggrega validate` and `aggrega lint` accept a catalog entity, a Release (via `--release`), or the whole catalog; `aggrega serve` runs as a long-lived process. The global flags page documents flags that apply across subcommands.

## Per-command reference

- [`aggrega build`](cli/aggrega-build.md) — the primary compile command. Reads a Release pointer, resolves the Aggregate and Manifest it references, and emits per-boundary compiled artifacts.
- [`aggrega inspect`](cli/aggrega-inspect.md) — catalog and IR inspection. Produces the compiled IR Graph as a machine-readable stream, and exposes catalog-entity inspection for authoring-time validation.
- [`aggrega pull`](cli/aggrega-pull.md) — resolve a Release's dependencies and write a per-Release lockfile pinning every dependency; cache catalog entities and source artifacts.
- [`aggrega push`](cli/aggrega-push.md) — publish a catalog entity (Component, Feature, Recipe, FeatureRecipe, Plugin, SchemaLibrary, MappingLibrary) to an OCI registry, optionally signing it at push time.
- [`aggrega sign`](cli/aggrega-sign.md) — sign one or more already-published artifacts and attach each signature as an OCI referrer.
- [`aggrega auth token`](cli/aggrega-auth.md) — acquire an OIDC identity token interactively and print it to stdout, for one authentication across a batch of keyless signs.
- [`aggrega registry`](cli/aggrega-registry.md) — manage the registries the workspace knows and their signature trust policy: add, list, and remove entries, and build a local searchable index of published catalog metadata with `registry update`.
- [`aggrega search`](cli/aggrega-search.md) — search the local index of configured registries for published catalog entities and installable CLI plugins, matching a free-text query and optional facet filters.
- [`aggrega validate`](cli/aggrega-validate.md) — check correctness (schema, pillars, reference resolution, `extends`, input-kind capability, isolated render) across the whole catalog, a Release's dependency closure (`--release`), or one entity.
- [`aggrega lint`](cli/aggrega-lint.md) — check publishing conventions across the whole catalog, a Release's dependency closure (`--release`), or one entity; `--pre-publish` adds the registry-aware version-bump gate.
- [`aggrega serve`](cli/aggrega-serve.md) — a long-running compiler-as-service daemon (JSON-RPC over stdin/stdout) for IDE integration.
- [`aggrega version`](cli/aggrega-version.md) — print the CLI version; `--json` emits a machine-readable object.
- [`aggrega get-schema`](cli/aggrega-get-schema.md) — print the canonical JSON Schema for an entity or contract kind; `--list` names every kind. The authoritative shape to author a file against.
- [`aggrega mcp`](cli/aggrega-mcp.md) — run a Model Context Protocol server over stdio so an MCP-capable client becomes an Aggrega-aware authoring assistant. See the [Authoring Guide](../authoring/getting-started.md).
- [Global flags](cli/global-flags.md) — flags shared across subcommands (workspace location, registry configuration, offline mode, output verbosity).

<!-- BEGIN GENERATED: command-list -->
| Command | Description |
| --- | --- |
| `aggrega acquire` | Pin the external inputs a Release's render consumes |
| `aggrega auth` | Manage the signing identity |
| `aggrega build` | Compile Aggregate + Release into Helm artifacts via the 5-step pipeline |
| `aggrega cache` | Inspect and maintain the on-disk caches |
| `aggrega config` | Inspect and manage the workspace configuration |
| `aggrega deprecate` | Attach a signed deprecation marker to an already-published artifact |
| `aggrega get-schema` | Print the JSON Schema for an entity or contract kind |
| `aggrega inspect` | Inspect a catalog Component or a Release file (resolves by entity kind) |
| `aggrega lint` | Check catalog publishing conventions across the catalog, a Release, or one entity |
| `aggrega login` | Authenticate to an OCI registry and store the credential |
| `aggrega logout` | Remove a stored registry credential |
| `aggrega mcp` | Run a Model Context Protocol server over stdio for AI-assistant integration |
| `aggrega plugin` | Inspect the Wasm plugins the CLI can resolve |
| `aggrega pull` | Resolve catalog and source dependencies into the cache and write the per-Release lockfile |
| `aggrega push` | Bundle and publish a catalog entity to an OCI registry |
| `aggrega push-artifact` | Publish a standalone data artifact (such as a documentation bundle) to an OCI registry |
| `aggrega registry` | Manage registries and their signature trust policy |
| `aggrega search` | Search the local index of configured registries |
| `aggrega serve` | Run as a long-running compiler-as-service over JSON-RPC 2.0 on stdin/stdout |
| `aggrega sign` | Sign one or more already-published artifacts and attach their signatures |
| `aggrega validate` | Check correctness across the catalog, a Release, or one entity |
| `aggrega version` | Print the aggrega CLI version |
<!-- END GENERATED: command-list -->

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
