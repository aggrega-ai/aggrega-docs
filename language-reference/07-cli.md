# CLI Overview

The `aggrega` CLI is the compiler's entry point. Every interaction with Aggrega — compiling an Aggregate into deployable artifacts, inspecting the catalog or the IR, fetching catalog entities from an OCI registry, linting Aggregate content against enterprise rules — runs through a subcommand of `aggrega`. This chapter set covers each subcommand's flags, inputs, and outputs.

The CLI follows the Single Entry Point Principle: the Release is the sole compilation input. `aggrega build release.yaml` reads the Release's `aggregate:` and `manifest:` pointers to locate the rest of the topology, and produces per-boundary output under `dist/boundaries/`. Other subcommands (`inspect`, `pull`, `lint`) are built around the same invocation shape. The global flags page documents flags that apply across every subcommand.

## Per-command reference

- [`aggrega build`](cli/aggrega-build.md) — the primary compile command. Reads a Release pointer, resolves the Aggregate and Manifest it references, and emits per-boundary compiled artifacts.
- [`aggrega inspect`](cli/aggrega-inspect.md) — catalog and IR inspection. Produces the compiled IR Graph as a machine-readable stream, and exposes catalog-entity inspection for authoring-time validation.
- [`aggrega pull`](cli/aggrega-pull.md) — fetch catalog entities (Recipes, Features, FeatureRecipes, Wasm plugins) from OCI registries into the local workspace cache.
- [`aggrega lint`](cli/aggrega-lint.md) — run enterprise-authored linter plugins against compiled output or authored content as an optional CI/CD gate.
- [Global flags](cli/global-flags.md) — flags shared across subcommands (workspace location, registry configuration, offline mode, output verbosity).
