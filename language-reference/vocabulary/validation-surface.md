# Validation surface

Aggrega validates authored content across four distinct schema layers. Each layer covers a different scope, runs at a different point in the compilation pipeline, and produces errors with a different shape. Authors who hit a validation error benefit from knowing which layer rejected the input — the same field can be governed by more than one layer, and the layer that fired determines what to fix and where.

This page documents the four layers, their pipeline placement, the error-shape convention each layer follows, and how layers interact when more than one applies to the same field.

## The four layers

### Layer 1 — JSON Schema envelope

**Scope.** The structural shape of every catalog YAML: `apiVersion`, `kind`, `metadata.{name, version, description, maintainers, license, ...}`, the top-level `spec:` block, and the per-entity required fields the schema declares. Each entity kind (Aggregate, Component, Feature, Recipe, FeatureRecipe, Manifest, Provider, Release) has its own JSON Schema at [`aggrega-schemas/json-schemas/`](../../../aggrega-schemas/json-schemas/).

**Validation runs.** At Step 1 (resolver / load), per file. The compiler unmarshals each YAML into the corresponding Go struct; YAML keys outside the struct's declared fields surface as parse errors before any further validation runs.

**Error shape.** Schema-mismatch failures surface as YAML unmarshal errors carrying the offending field path and the constraint violated:

```text
unmarshal Recipe "<path>": json: unknown field "<field>"
```

Required-field omissions and type mismatches surface in the same shape; the specific text varies by underlying YAML library.

### Layer 2 — CUE pillar (`cueSchema` / `secretsSchema` / `usesSchema`)

**Scope.** The data pillars an entity carries — `values`, `infra`, `parameters`, plus the `secrets:` block populated by `secretsSchema` and the `uses:` block governed by `usesSchema`. Domain 2 entities (Component, Feature) embed CUE schemas in their YAML envelope (`spec.cueSchema` inline or `spec.cueSchemaRef` pointing at a shared `.cue` file); Domain 3 entities (Recipe, FeatureRecipe) consume the resolved schemas during their own validation pass.

**Validation runs.** At Step 1, after the JSON Schema envelope passes. The compiler unifies the entity's authored `cueSchema` with auto-generated bases derived from `usesSchema` and `secretsSchema` declarations; the unified schema validates the developer-supplied `values:` / `infra:` / `secrets:` / `uses:` blocks on every component instance in the Aggregate.

**Error shape.** CUE unification failures and constraint violations surface as messages naming the entity, the path inside the pillar, and the unification detail:

```text
usesSchema unification failed: child <child-uri> socket <socket-name> conflicts with parent <parent-uri>: <unification-detail>.
```

Inline CUE constraint violations (e.g., a developer setting a port to `80` against a CUE rule requiring `>=1024`) surface at the same stage with the field path and the rule that rejected the value.

### Layer 3 — Provider source / `workloadSchema`

**Scope.** Two sub-surfaces, both governed by the Provider entity:

- The Provider's `baseSchema` — validates the values dictionary the Recipe passes to the provider engine for sourceless (generative) rendering. Each provider's accepted keyset for sourceless mode is declared here.
- The Provider's `workloadSchema` — validates the Workload content a Recipe synthesises for synthesized-mode rendering. Workload-mode Recipes target only Providers that declare `workloadSchema`; absence of `workloadSchema` means synthesis is not supported on that provider.

**Validation runs.** At Step 5 Phase B, after the Recipe's own valuesMapping has resolved. Layer 3 validates the *output* of valuesMapping (or the synthesised Workload) against the bound Provider's schema, gating provider-engine dispatch.

**Error shape.** Workload schema unification carries a `CATALOG_ERROR:` prefix attributing the failure to the catalog entity:

```text
CATALOG_ERROR: Recipe <path> (<name>:<version>) violates rule 4:
workload/workloadFrom requires the bound Provider to declare workloadSchema
Provider <provider-name> has no workloadSchema; Workload synthesis is not supported on this provider
```

Provider source-keyset violations follow the same `CATALOG_ERROR:` shape — the catalog entity (the Recipe's authored `source:` block, the Provider's declared schema) is what's at fault, not the developer's Aggregate.

### Layer 4 — Annotation-binding fragments

**Scope.** Annotation values bound at the Manifest's `mappings.<provider>.features.annotations.<key>.infra` (and `.values`) sections, where each annotation key declares a CUE schema fragment validating the annotation value's argument structure. When a Release authors `feature.aggrega.ai/<key>: "<value>"` on a boundary or component, the Manifest's binding determines which CUE fragment validates `<value>`.

**Validation runs.** Reserved for the annotation-driven Feature expansion pass (currently `accepted but inert` — see [Status of the Language → Compilation pipeline phases](../10-status.md#compilation-pipeline-phases)). The Manifest accepts and parses the annotation bindings; the expansion pass that consumes them is not yet wired into the build pipeline. When the pass ships, Layer 4 validation runs at the same stage as Layer 2 (Step 1), against any annotation key whose Manifest binding matched a boundary or component declaration.

**Error shape.** When the pass ships, Layer 4 errors will follow the CUE-unification shape used by Layer 2 — entity, path inside the annotation `infra:` argument, unification detail.

## One error-formatting convention across layers

The four layers share one observable convention: **every Aggrega-attributable validation failure carries a path-plus-rationale shape** that names the offending field and the constraint that rejected it.

- Layer 1 (envelope) and Layer 2 (CUE pillar) errors come through unprefixed at Step 1 — they fire before any Aggrega-prefixed sentinel discipline applies, so the YAML library's or CUE engine's native error wraps with a positional prefix (`unmarshal <kind> "<path>": ...`, `<field-path>: <CUE rule violated>`).
- Layer 3 (Provider source / Workload) errors are catalog-entity-attributable by definition — the Recipe + Provider pair authored the schema that rejected the developer's input. These carry the `CATALOG_ERROR:` prefix declared at [`pkg/validator/recipe_validate_errors.go`](../../../aggrega-cli/pkg/validator/recipe_validate_errors.go) and [`pkg/validator/workload_validate_errors.go`](../../../aggrega-cli/pkg/validator/workload_validate_errors.go).
- Layer 4 (annotation-binding fragments) — once the expansion pass ships, errors are expected to follow the Layer 2 shape since the validating CUE fragment lives inside the Manifest binding.

For the full inventory of Aggrega-prefixed sentinels and the surfaces that produce them, see [`errors/error-translation.md`](../errors/error-translation.md). For the per-error catalog (`CATALOG_ERROR:` rules 1-7, sentinel-by-sentinel diagnostics), see [`errors/fatal-halts.md`](../errors/fatal-halts.md).

## Layer interaction when fields overlap

The same authored field can be governed by more than one layer. The most common overlap is a Workload's `containers.<name>.ports.<port>: <number>` field:

- Layer 1 (envelope) accepts it as part of the Workload schema's structural shape.
- Layer 2 (CUE pillar) does not constrain it directly — Workload content is a Recipe-internal structure, not a Component pillar.
- Layer 3 (`workloadSchema`) validates the integer range (e.g., `>=1, <=65535`) and any provider-specific constraints declared on the bound Provider.

When a developer authors `port: 80` and the Provider's `workloadSchema` declares `port: >=1024`, the Layer 3 pass rejects the value. The same field shape would have passed Layer 1 and Layer 2 (which never applied); the layer that fired tells the author where to look for the rule.

A second common overlap pattern: cross-pillar constraints declared in CUE that duplicate constraints in `workloadSchema`. When CUE allows port 80 (no constraint) but `workloadSchema` rejects ports below 1024, the Layer 3 pass surfaces the violation at Step 5 Phase B; the developer sees the failure attributed to the Recipe + Provider pairing, not to the Component's `cueSchema`. The constraint-layering convention is documented at [`vocabulary/data-pillars.md`](data-pillars.md) (Cross-pillar constraint behavior section).

## Pipeline placement summary

| Layer | Scope | Runs at | Error prefix |
| --- | --- | --- | --- |
| 1 — JSON Schema envelope | Structural shape (apiVersion, kind, metadata, top-level spec) | Step 1 (load) | unprefixed YAML / unmarshal error |
| 2 — CUE pillar (`cueSchema` / `secretsSchema` / `usesSchema`) | Per-pillar data validation (values, infra, secrets, uses) | Step 1 (after envelope) | unprefixed CUE unification error |
| 3 — Provider source / `workloadSchema` | Recipe output / Workload content gates | Step 5 Phase B | `CATALOG_ERROR:` |
| 4 — Annotation-binding fragments | Annotation-value argument structure | (planned) Step 1, alongside Layer 2 | (planned) CUE unification error |

## Cross-references

- [`errors/error-translation.md`](../errors/error-translation.md) — Aggrega-prefixed sentinel inventory and the surfaces that produce them.
- [`errors/fatal-halts.md`](../errors/fatal-halts.md) — per-error catalog of every fatal halt the compiler emits.
- [`vocabulary/data-pillars.md`](data-pillars.md) — the four data pillars (`values`, `infra`, `parameters`, `locals`) plus `secrets:` and `uses:` that Layer 2 validates.
- [`entities/component.md`](../entities/component.md) — Component authoring surface for `cueSchema` / `secretsSchema` / `usesSchema`.
- [`entities/provider.md`](../entities/provider.md) — Provider authoring surface for `baseSchema` / `workloadSchema`.
- [`entities/manifest.md`](../entities/manifest.md) — Manifest's `features.annotations` binding surface (Layer 4).
- [`10-status.md#compilation-pipeline-phases`](../10-status.md#compilation-pipeline-phases) — current readiness state for Layer 4's annotation-driven expansion pass.
