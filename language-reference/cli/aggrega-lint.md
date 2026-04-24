# aggrega lint

The `aggrega lint` subcommand will validate a catalog, an Aggregate, a Release, or a Manifest against the compiler's authoring rules without producing rendered output. It is a planned addition to the CLI that is not yet available.

## Current state

`aggrega lint` does not ship today. Invoking it on a current CLI build prints an "unknown command" error and exits non-zero. Validation is currently reached as a side effect of `aggrega build` — the compiler parses, resolves, and validates before any renderer runs, and any validation failure halts the build with the same diagnostics that `aggrega lint` will surface independently.

## Designed scope

When `aggrega lint` ships, the intended surface covers:

- **Schema validation.** Each entity file (Aggregate, Component, Feature, Recipe, FeatureRecipe, Provider, Manifest, Release) is checked against its JSON Schema.
- **Cross-entity resolution.** References between entities (a Release's `aggregate:` pointer, a Recipe's `implements:` target, an `extends:` chain) are resolved; broken references surface as diagnostics.
- **Composition rule enforcement.** Recipe input-kind rules (see [../entities/recipe.md](../entities/recipe.md)) are evaluated without rendering.
- **Style warnings.** The linter surface covers catalog-convention rules (naming, label usage, credential-declaration discipline) that the compiler does not enforce at build time.

## Reporting

Output format will follow the headless-friendly structure already used by the rest of the CLI: one diagnostic per line with category, severity, file path, and message, plus a `--format json` variant for programmatic consumers.

## See also

- [./aggrega-build.md](./aggrega-build.md) — which validates as part of compilation today.
- [./global-flags.md](./global-flags.md) — flags (such as `--catalog`, `--manifest`) shared across subcommands.
- [../errors/fatal-halts.md](../errors/fatal-halts.md) — fatal error categories linting will report.
- [../errors/warnings.md](../errors/warnings.md) — non-fatal warnings linting will surface.
