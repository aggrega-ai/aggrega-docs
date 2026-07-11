# CLI Overview

The `aggrega` CLI is the compiler's entry point. Every interaction with Aggrega — compiling an Aggregate into deployable artifacts, inspecting the catalog or the IR, resolving and pinning dependencies, publishing catalog entities, linting against publishing-discipline rules, and serving an IDE — runs through a subcommand of `aggrega`. This chapter set covers each subcommand's flags, inputs, and outputs.

`aggrega build` follows the Single Entry Point Principle: the Release is the sole compilation input. `aggrega build release.yaml` reads the Release's `aggregate:` and `manifest:` pointers to locate the rest of the topology, and produces per-boundary output under `dist/boundaries/`. `aggrega inspect` and `aggrega pull` share the Release-as-input shape; `aggrega push` and `aggrega lint` take a catalog entity; `aggrega serve` runs as a long-lived process. The global flags page documents flags that apply across subcommands.

## Per-command reference

- [`aggrega build`](cli/aggrega-build.md) — the primary compile command. Reads a Release pointer, resolves the Aggregate and Manifest it references, and emits per-boundary compiled artifacts.
- [`aggrega inspect`](cli/aggrega-inspect.md) — catalog and IR inspection. Produces the compiled IR Graph as a machine-readable stream, and exposes catalog-entity inspection for authoring-time validation.
- [`aggrega pull`](cli/aggrega-pull.md) — resolve a Release's dependencies and write a per-Release lockfile pinning every dependency; cache catalog entities and source artifacts.
- [`aggrega push`](cli/aggrega-push.md) — publish a catalog entity (Component, Feature, Recipe, FeatureRecipe, Plugin, SchemaLibrary, MappingLibrary) to an OCI registry, optionally signing it at push time.
- [`aggrega sign`](cli/aggrega-sign.md) — sign one or more already-published artifacts and attach each signature as an OCI referrer.
- [`aggrega auth token`](cli/aggrega-auth.md) — acquire an OIDC identity token interactively and print it to stdout, for one authentication across a batch of keyless signs.
- [`aggrega lint`](cli/aggrega-lint.md) — run the publishing-discipline rules over a catalog entity; `--pre-publish` adds the registry-aware version-bump gate.
- [`aggrega serve`](cli/aggrega-serve.md) — a long-running compiler-as-service daemon (JSON-RPC over stdin/stdout) for IDE integration.
- [`aggrega version`](cli/aggrega-version.md) — print the CLI version; `--json` emits a machine-readable object.
- [Global flags](cli/global-flags.md) — flags shared across subcommands (workspace location, registry configuration, offline mode, output verbosity).

<!-- BEGIN GENERATED: command-list -->
| Command | Description |
| --- | --- |
| `aggrega acquire` | Pin the external inputs a Release's render consumes |
| `aggrega auth` | Manage the signing identity |
| `aggrega build` | Compile Aggregate + Release into Helm artifacts via the 5-step pipeline |
| `aggrega cache` | Inspect and maintain the on-disk caches |
| `aggrega catalog` | Work with the catalog registry |
| `aggrega deprecate` | Attach a signed deprecation marker to an already-published artifact |
| `aggrega inspect` | Inspect a catalog Component or a Release file (resolves by entity kind) |
| `aggrega lint` | Validate the whole catalog, or run the publishing-linter over one entity |
| `aggrega login` | Authenticate to an OCI registry and store the credential |
| `aggrega logout` | Remove a stored registry credential |
| `aggrega plugin` | Inspect the Wasm plugins the CLI can resolve |
| `aggrega pull` | Resolve catalog and source dependencies into the cache and write the per-Release lockfile |
| `aggrega push` | Bundle and publish a catalog entity to an OCI registry |
| `aggrega push-artifact` | Publish a standalone data artifact (such as a documentation bundle) to an OCI registry |
| `aggrega registry` | Manage registries and their signature trust policy |
| `aggrega serve` | Run as a long-running compiler-as-service over JSON-RPC 2.0 on stdin/stdout |
| `aggrega sign` | Sign one or more already-published artifacts and attach their signatures |
| `aggrega version` | Print the aggrega CLI version |
<!-- END GENERATED: command-list -->

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
