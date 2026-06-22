# aggrega lint

`aggrega lint` has three modes, selected by its argument. With **no argument** it runs **catalog-wide correctness validation** — loading every catalog entity and validating its pillars and cross-document `$ref` / `$import` chains, halting loudly on any schema-pillar violation or unresolvable reference. With **`--release <path>`** it runs **closure-scoped validation** — validating only the entities a Release's resolved closure reaches (the same set a build of that Release resolves) and surfacing closure-scoped advisories. With an **entity path** it checks that one entity against Aggrega's publishing-discipline rules — running them as a Wasm plugin and reporting findings; in its publish-gating mode it also fetches the entity's currently-published version from the registry and verifies that the proposed version bump matches the size of the change.

The whole-catalog and closure-scoped modes are complementary: whole-catalog validation checks everything published; `--release` checks exactly what one Release pulls in — the unserved middle between linting the whole catalog and linting a single entity. A build validates its own closure as part of compilation, so `--release` is "the build's closure validation and advisories, without the render."

`aggrega lint` is opt-in. The compiler itself stays unopinionated about catalog discipline; these rules live in a separate plugin you choose to run. A workspace that never runs `aggrega lint` still builds and publishes.

## Synopsis

```
aggrega lint [<entity-path>] [--release <release-path>] [--pre-publish] [--plugin <path>] [policy flags]
```

The entity path may be given positionally or with `--entity <path>`. `--release` is mutually exclusive with an entity argument — they select different scopes; passing both halts.

## Closure-scoped mode (`--release`)

`aggrega lint --release <release-path>` validates a single Release's resolved closure rather than the whole catalog or one entity. It computes the closure through the same machinery a build uses — so the entities it checks are exactly the entities a build of that Release would resolve — and then, over that closure only:

- validates each closure entity's schema pillars and `extends` chains (the same closure-scoped validation a build runs), failing with a non-zero exit on a schema-pillar or extends-resolution error;
- runs the **same value validation a build runs** — it resolves the Release's parameters into the authored values (so a `{{ .parameters.* }}` value is checked as resolved, not as a template) and validates them against the closure's schemas through the build's own pre-render validation, including conformance against the composed parent+child schema for an `extends`-ing entity. A value that violates its schema fails with a non-zero exit. This makes `--release` a true pre-build check: it catches what a build would reject, before the build;
- surfaces **schema-pillar overlap** advisories (two closure entities contributing overlapping pillars) and **narrowing-on-extend** advisories (a child widening an inherited constraint) as informational `notice:` lines that never change the exit code.

It runs no render and triggers no network pull: the closure resolves from the local catalog (and the Release's lockfile pins, when present); a registry-pinned closure that needs a lockfile surfaces an honest unresolvable-reference error rather than fetching. Narrowing is surfaced as advice, never enforced — the compiler takes no position on narrow-vs-relax (that stays the opt-in `--pre-publish` discipline rule below).

## Input-kind capability check

Both the whole-catalog and `--release` modes report a Recipe or FeatureRecipe that declares a `workload:` block (synthesized mode) bound to a provider whose engine cannot synthesize — for example a `workload:` Recipe targeting the `helm-chart` provider, which produces an umbrella-chart scaffold rather than rendered manifests. Such a Recipe can never build: it halts at render with a provider-capability error. Lint surfaces that guaranteed failure early — at catalog-author or pre-build time — as an **error** (non-zero exit), with the same message the build emits, so a Recipe that is unbuildable on the current provider engines is caught before any build resolves it. This is an early detector, not a new rule: the build's render-time check remains the authoritative one, and lint consults the same provider-engine capability, so the two never disagree.

The check fires only for a provider whose engine ships and definitively does not synthesize. A `workload:` Recipe naming a provider with no shipped engine yet — a forward-looking catalog entry for an engine that has not landed — is not flagged; lint does not reject scaffolding for engines that do not exist yet.

## Entity discipline: local and publish gate

The entity-path mode runs at one of two severities:

- **Default (local).** Runs the discipline rules over the local entity content at **warning** severity. No registry access; the version-bump check is skipped. Use it while authoring.
- **`--pre-publish` (publish gate).** Fetches the entity's latest published non-pre-release version from the registry, runs the same rules at **error** severity, and additionally classifies the change as `PATCH` / `MINOR` / `MAJOR` and halts if the proposed `metadata.version` bump is smaller than the change requires. Use it in the publish flow, before `aggrega push`.

Over-bumping is always allowed; under-bumping halts. The first publication of an entity (no prior version in the registry) skips the bump check and surfaces a warning noting that no verification was performed.

## The version-bump rubric

In `--pre-publish` mode the change is compared against the previous published version and classified:

- **`PATCH`** — documentation- or comment-only changes.
- **`MINOR`** — strictly additive changes (a new optional field, a new entry).
- **`MAJOR`** — removals, type narrowing, or a previously-optional field becoming required.

The comparison is per entity kind: Component, Feature, Provider, and SchemaLibrary are compared with awareness of their schema-bearing fields; MappingLibrary is compared at the entry-key level (entry bodies are opaque, so a changed body is treated conservatively as `MAJOR`); Recipe and FeatureRecipe are compared on their load-bearing fields; legacy CUE modules are treated conservatively (any change is `MAJOR`). Under-bumping halts with a diagnostic naming the required bump.

## The discipline rules

Each rule has a per-workspace setting under `lint.publishing_discipline` in `.aggrega-config.yaml` and a matching CLI override. Defaults are grounded either in platform machinery, in a documented catalog convention, or are off by default where the platform takes no position.

- **Annotation prefix** — reserved namespaces (`aggrega.ai/`, and `feature.aggrega.ai/` outside a Feature) are platform-owned and rejected on other keys. Default on; opt out with `allow_aggrega_ai_prefix`.
- **Name shape** — each entity kind has a name-shape convention (segment counts for the cloud-native kinds; PascalCase for library kinds). Default on; opt out with `allow_nonstandard_names`.
- **Monotonic narrowing** — when an entity uses `extends`, the child's schema must not broaden the parent's field types. The platform takes no position on which direction is correct, so this is **off by default**; enable it with `enforce_monotonic_narrowing`, and exempt specific entity paths with `narrowing_exemptions`.
- **Dynamic refs** — SchemaLibrary entries may not use `$dynamicAnchor` / `$dynamicRef` (the platform's compile-time `$ref` expansion cannot resolve them). Default on; opt out with `allow_dynamic_refs`.
- **Id overrides** — SchemaLibrary entries may not declare their own `$id` (the platform derives the canonical `$id`). Default on; opt out with `allow_id_overrides`.
- **Category matches directory** — a Component's `component.aggrega.ai/category` label must match the first directory segment under `core/`, drawn from the closed category set (`ai-agent`, `ai-model`, `ai-tool`, `ai-pipeline`, `datastore`, `gateway`, `mesh`, `network`, `messaging`, `storage`, `compute`, `observability`, `security`, `bigdata`, `devtool`). Default on for entities under a `core/` path; opt out with `allow_category_mismatches`.
- **Direct `x-aggrega-*` extensions** — directly authoring `x-aggrega-*` keys in a Component or Feature schema is discouraged in favor of the first-class authoring path. Default on; opt out with `allow_direct_x_aggrega_extensions`.
- **Immutability** — in `--pre-publish` mode, re-publishing a version that already exists in the registry is rejected. Controlled by `enforce_immutability`.

## Build-time and publish-time

The `x-aggrega-*` discouragement rule also runs during `aggrega build`, where it surfaces as a **warning**; `aggrega lint --pre-publish` raises the same finding to an **error**. Local builds carry the advisory; the publish gate enforces it.

## Flags

- `<entity-path>` (positional) or `--entity <path>` — the entity to lint.
- `--release <release-path>` — switch to closure-scoped mode: validate the entities in this Release's resolved closure (schema-pillar + extends validation, plus overlap and narrowing advisories). Mutually exclusive with an entity argument.
- `--pre-publish` — switch to the registry-aware publish gate (error severity, version-bump check).
- `--plugin <path>` — the publishing-linter Wasm plugin to run. When omitted, the plugin is taken from the `plugins.linter` entry in `.aggrega-config.yaml`.
- Per-rule overrides, each with a `--no-` counterpart: `--allow-dynamic-refs`, `--allow-id-overrides`, `--allow-direct-x-aggrega-extensions`, `--allow-aggrega-ai-prefix`, `--allow-nonstandard-names`, `--allow-category-mismatches`, `--enforce-monotonic-narrowing`, `--enforce-immutability`. Precedence is `--no-<flag>` over `--<flag>` over the workspace-config value. (`narrowing_exemptions` is workspace-config-only.)

The per-rule override flags are per-invocation gates and intentionally have **no** environment variable — they are already config-backed in `.aggrega-config.yaml` under `lint.publishing_discipline`. The general `AGGREGA_*` precedence model is described in [environment-variables.md](environment-variables.md).

## Choosing the linter

The rules ship as a standard publishing-linter Wasm plugin. Because the rules live in a plugin rather than in the compiler, an enterprise can point `aggrega lint` at a different plugin to enforce its own catalog discipline without changing the compiler.

## Examples

Lint an entity locally while authoring:

```
aggrega lint core/datastore/postgres/component.yaml
```

Run the publish gate before publishing a new version:

```
aggrega lint core/datastore/postgres/component.yaml --pre-publish
```

Enable monotonic-narrowing enforcement for one run:

```
aggrega lint core/datastore/postgres/component.yaml --pre-publish --enforce-monotonic-narrowing
```

## See also

- [./aggrega-build.md](./aggrega-build.md) — validates as part of compilation; surfaces the `x-aggrega-*` advisory at warning severity.
- [./aggrega-push.md](./aggrega-push.md) — publishes an entity to the registry; `aggrega lint --pre-publish` is the gate that precedes it.
- [./aggrega-pull.md](./aggrega-pull.md) — resolves and pins dependencies.
- [../errors/warnings.md](../errors/warnings.md) — non-fatal warnings, including the local-mode lint findings.
