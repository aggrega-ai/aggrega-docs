# aggrega lint

`aggrega lint` checks **publishing conventions** — naming, category-directory alignment, annotation prefixes, schema-authoring discipline, and version-bump size. It has three modes, selected by its argument, that apply the same conventions discipline at three scopes: the **whole catalog** (no argument), a single **Release's dependency closure** (`--release`), and **one entity** file (an entity path, with an optional `--pre-publish` publish gate). Each scope answers the same question — "does this content follow the catalog's publishing discipline?" — over a different slice of the catalog.

Conventions are distinct from correctness. `aggrega lint` never checks whether content is well-formed or would compile — that is [`aggrega validate`](./aggrega-validate.md), which mirrors the same three scopes for schema, pillars, reference resolution, `extends`, input-kind capability, and render. The two commands are complementary: validate tells you whether content is correct; lint tells you whether it is publishable by the catalog's conventions.

`aggrega lint` is opt-in. The compiler itself stays unopinionated about catalog discipline; these rules live in a separate plugin you choose to run. A workspace that never runs `aggrega lint` still builds and publishes.

## Synopsis

```
aggrega lint [<entity-path>] [--release <release-path>] [--pre-publish] [--plugin <path>] [policy flags]
```

The entity path may be given positionally or with `--entity <path>`. `--release` is mutually exclusive with an entity argument — they select different scopes; passing both halts.

## Whole-catalog conventions (no argument)

`aggrega lint` with no argument runs the structural publishing-discipline rules over every catalog entity found under the configured catalog directories. Findings are advisory — reported at warning severity, they never halt on a convention finding alone. Use it to sweep a catalog for naming, category-directory, and annotation-prefix drift.

Whole-catalog conventions checking needs at least one catalog directory to scan: pass `--catalog` or set `workspace.catalog_dirs` in `.aggrega-config.yaml`. It refuses to enumerate the current working directory implicitly.

## Conventions across a Release (`--release`)

`aggrega lint --release <release-path>` runs the same structural rules over the catalog entity files a single Release's resolved closure reaches, rather than the whole catalog or one entity. It computes the closure through the same machinery a build uses, then lints each entity's author-owned catalog file. A registry-pinned entity living in a content-addressed cache slot carries no local file to lint and is skipped — the publishing rules apply to locally-authored files. As with the whole-catalog mode, findings are advisory and never halt on a convention finding alone.

This is the conventions counterpart to [`aggrega validate --release`](./aggrega-validate.md), which checks the same closure for correctness.

## Entity discipline: local and publish gate

The entity-path mode runs at one of two severities:

- **Default (local).** Runs the discipline rules over the local entity content at **warning** severity. No registry access; the version-bump check is skipped. Use it while authoring.
- **`--pre-publish` (publish gate).** Fetches the entity's latest published non-pre-release version from the registry, runs the same rules at **error** severity, and additionally classifies the change as `PATCH` / `MINOR` / `MAJOR` and halts if the proposed `metadata.version` bump is smaller than the change requires. Use it in the publish flow, before `aggrega push`. `--pre-publish` applies to the single-entity shape only.

Over-bumping is always allowed; under-bumping halts. The first publication of an entity (no prior version in the registry) skips the bump check and surfaces a warning noting that no verification was performed.

## The version-bump rubric

In `--pre-publish` mode the change is compared against the previous published version and classified:

- **`PATCH`** — documentation- or comment-only changes.
- **`MINOR`** — strictly additive changes (a new optional field, a new entry).
- **`MAJOR`** — removals, type narrowing, or a previously-optional field becoming required.

The comparison is per entity kind: Component, Feature, and SchemaLibrary are compared with awareness of their schema-bearing fields; MappingLibrary is compared at the entry-key level (entry bodies are opaque, so a changed body is treated conservatively as `MAJOR`); Recipe and FeatureRecipe are compared on their load-bearing fields. Under-bumping halts with a diagnostic naming the required bump.

## The discipline rules

Each rule has a per-workspace setting under `lint.publishing_discipline` in `.aggrega-config.yaml` and a matching CLI override. Every rule is on by default, and each default is grounded either in platform machinery or in a documented catalog convention; the settings are opt-outs for a workspace that has a reason to relax one.

- **Annotation prefix** — reserved namespaces (`aggrega.ai/`, and `feature.aggrega.ai/` outside a Feature) are platform-owned and rejected on other keys. Default on; opt out with `allow_aggrega_ai_prefix`.
- **Name shape** — each entity kind has a name-shape convention (segment counts for the cloud-native kinds; PascalCase for library kinds). Default on; opt out with `allow_nonstandard_names`.
- **Dynamic refs** — SchemaLibrary entries may not use `$dynamicAnchor` / `$dynamicRef` (the platform's compile-time `$ref` expansion cannot resolve them). Default on; opt out with `allow_dynamic_refs`.
- **Id overrides** — SchemaLibrary entries may not declare their own `$id` (the platform derives the canonical `$id`). Default on; opt out with `allow_id_overrides`.
- **Category matches directory** — a Component's `component.aggrega.ai/category` label must match the first directory segment under `core/`, drawn from the closed category set (`ai-agent`, `ai-model`, `ai-tool`, `ai-pipeline`, `datastore`, `gateway`, `mesh`, `network`, `messaging`, `storage`, `compute`, `observability`, `security`, `bigdata`, `devtool`). Default on for entities under a `core/` path; opt out with `allow_category_mismatches`.
- **Direct `x-aggrega-*` extensions** — directly authoring `x-aggrega-*` keys in a Component or Feature schema is discouraged in favor of the first-class authoring path. Default on; opt out with `allow_direct_x_aggrega_extensions`.
- **Immutability** — in `--pre-publish` mode, re-publishing a version that already exists in the registry is rejected. Controlled by `enforce_immutability`.

## Build-time and publish-time

The `x-aggrega-*` discouragement rule also runs during `aggrega build`, where it surfaces as a **warning**; `aggrega lint --pre-publish` raises the same finding to an **error**. Local builds carry the advisory; the publish gate enforces it.

## Flags

- `<entity-path>` (positional) or `--entity <path>` — the entity to lint.
- `--release <release-path>` — switch to the Release-closure conventions scope: lint the catalog files this Release's resolved closure reaches. Mutually exclusive with an entity argument.
- `--pre-publish` — switch to the registry-aware publish gate (error severity, version-bump check). Single-entity shape only.
- `--plugin <path>` — the publishing-linter Wasm plugin to run. When omitted, the plugin is taken from the `plugins.linter` entry in `.aggrega-config.yaml`.
- Per-rule overrides, each with a `--no-` counterpart: `--allow-dynamic-refs`, `--allow-id-overrides`, `--allow-direct-x-aggrega-extensions`, `--allow-aggrega-ai-prefix`, `--allow-nonstandard-names`, `--allow-category-mismatches`, `--enforce-immutability`. Precedence is `--no-<flag>` over `--<flag>` over the workspace-config value.

The per-rule override flags are per-invocation gates and intentionally have **no** environment variable — they are already config-backed in `.aggrega-config.yaml` under `lint.publishing_discipline`. The general `AGGREGA_*` precedence model is described in [environment-variables.md](environment-variables.md).

## Choosing the linter

The rules ship as a standard publishing-linter Wasm plugin. Because the rules live in a plugin rather than in the compiler, an enterprise can point `aggrega lint` at a different plugin to enforce its own catalog discipline without changing the compiler.

## Examples

Sweep the whole catalog for convention drift:

```
aggrega lint --catalog ./catalog
```

Lint an entity locally while authoring:

```
aggrega lint core/datastore/postgres/component.yaml
```

Run the publish gate before publishing a new version:

```
aggrega lint core/datastore/postgres/component.yaml --pre-publish
```

Relax one rule for a single run:

```
aggrega lint core/datastore/postgres/component.yaml --pre-publish --allow-nonstandard-names
```

## See also

- [./aggrega-validate.md](./aggrega-validate.md) — the correctness counterpart across the same three scopes.
- [./aggrega-build.md](./aggrega-build.md) — validates as part of compilation; surfaces the `x-aggrega-*` advisory at warning severity.
- [./aggrega-push.md](./aggrega-push.md) — publishes an entity to the registry; `aggrega lint --pre-publish` is the gate that precedes it.
- [./aggrega-pull.md](./aggrega-pull.md) — resolves and pins dependencies.
- [../errors/warnings.md](../errors/warnings.md) — non-fatal warnings, including the local-mode lint findings.

<!-- BEGIN GENERATED: cli-lint -->
**Synopsis**

```
aggrega lint [entity-path] [flags]
```

**Flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--allow-aggrega-ai-prefix` | `false` | Force allow_aggrega_ai_prefix=true |
| `--allow-category-mismatches` | `false` | Force allow_category_mismatches=true |
| `--allow-direct-x-aggrega-extensions` | `false` | Force allow_direct_x_aggrega_extensions=true |
| `--allow-dynamic-refs` | `false` | Force allow_dynamic_refs=true for this invocation |
| `--allow-id-overrides` | `false` | Force allow_id_overrides=true for this invocation |
| `--allow-nonstandard-names` | `false` | Force allow_nonstandard_names=true |
| `--baseline` | — | Diff the pre-publish evolution check against this specific already-published version instead of the auto-selected highest version below the one being published; must be a strict-SemVer tag present in the registry (requires --pre-publish) |
| `--catalog` | `[]` | Catalog directory; repeatable. Each --catalog is prepended to the workspace catalog_dirs search stack (first match wins). Used by the whole-catalog and --release conventions passes. |
| `--enforce-immutability` | `false` | Force enforce_immutability=true |
| `--entity` | — | Path to the entity YAML to lint (alternatively pass as the positional arg) |
| `--no-allow-aggrega-ai-prefix` | `false` | Force allow_aggrega_ai_prefix=false |
| `--no-allow-category-mismatches` | `false` | Force allow_category_mismatches=false |
| `--no-allow-direct-x-aggrega-extensions` | `false` | Force allow_direct_x_aggrega_extensions=false |
| `--no-allow-dynamic-refs` | `false` | Force allow_dynamic_refs=false for this invocation |
| `--no-allow-id-overrides` | `false` | Force allow_id_overrides=false for this invocation |
| `--no-allow-nonstandard-names` | `false` | Force allow_nonstandard_names=false |
| `--no-enforce-immutability` | `false` | Force enforce_immutability=false |
| `--plugin` | — | Filesystem path to the publishing-linter .wasm artifact (overrides workspace plugins.linter[0].uri) |
| `--pre-publish` | `false` | Fetch the previous registry version and verify the proposed bump against the schema-evolution classification |
| `--release` | — | Path to a Release YAML to check conventions over its resolved dependency closure (mutually exclusive with an entity argument) |
<!-- END GENERATED: cli-lint -->
