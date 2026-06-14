# URI grammar and format-string inventory

Aggrega entities reference each other through URI strings that appear at multiple distinct authoring positions. The same URI shape (`core/postgres:1.0.0`) appears in five+ entity-kind contexts, with the compiler inferring the entity kind from the schema position rather than from a sigil or prefix. Authors reading or maintaining a YAML file must hold the position-based interpretation rules in mind to know whether `core/postgres:1.0.0` refers to a Component type, an Aggregate module, a Recipe, a FeatureRecipe, or a Wasm plugin.

This page consolidates the URI grammar across all positions, the precedence rules for versioned vs unversioned `type:` keys at the Manifest's mapping tiers, the OCI URI shorthand inference rules, and the broader format-string inventory across the corpus (Go template syntax, Sprig functions, JSON Schema 2020-12 declarations, JSONPath, glob patterns, SemVer regex). Authors who need to know "what does Aggrega do with this string?" should find the answer here.

## Position-based entity-kind inference

The same URI string carries different entity-kind meaning depending on where it appears in the schema. The table below enumerates every position where Aggrega expects an entity-reference URI, along with the inferred entity kind:

| Position | Inferred entity kind | OCI path expansion |
| --- | --- | --- |
| `Aggregate.spec.components.<id>.type` | Component | `/component/{namespace}/{category}/{name}` |
| `Aggregate.spec.subsystems.<name>.<id>.type` | Component (same as components — subsystems are component grouping) | `/component/{namespace}/{category}/{name}` |
| `Aggregate.spec.aggregates.<id>.type` | Aggregate (sub-aggregate module) | `/aggregate/{namespace}/{name}` |
| `Aggregate.spec.components.<id>.features.<id>.type` | Feature | `/feature/{namespace}/{name}` |
| `Aggregate.spec.components.<id>.secrets.<id>.type` | Feature (credential — labeled `feature.aggrega.ai/kind: secret`) | `/feature/{namespace}/{name}` |
| `Manifest.spec.mappings.components.type.<key>` | Component (the URI used as the lookup key); the value is a Recipe URI | key: `/component/`; value: `/recipe/{provider}/{name}` |
| `Manifest.spec.mappings.components.name.<id>` | Recipe (granular override binding) | `/recipe/{provider}/{name}` |
| `Manifest.spec.mappings.features.type.<key>` | Feature (lookup key); the value is a FeatureRecipe URI | key: `/feature/`; value: `/feature-recipe/{provider}/{name}` |
| `Manifest.spec.mappings.features.name.<id>` | FeatureRecipe (granular override binding) | `/feature-recipe/{provider}/{name}` |
| `Manifest.spec.mappings.features.annotations.<key>.feature` | Feature (annotation-bound) | `/feature/{namespace}/{name}` |
| `Recipe.spec.implements` | Component (interface contract) | `/component/{namespace}/{category}/{name}` |
| `FeatureRecipe.spec.implements` | Feature (interface contract) | `/feature/{namespace}/{name}` |
| `Recipe.spec.extends` / `FeatureRecipe.spec.extends` | Recipe / FeatureRecipe (parent in inheritance chain) | `/recipe/{provider}/{name}` or `/feature-recipe/{provider}/{name}` |
| `Component.spec.extends` / `Feature.spec.extends` | Component / Feature (parent in inheritance chain) | `/component/{namespace}/{category}/{name}` or `/feature/{namespace}/{name}` |
| `Manifest.spec.extends` | Manifest (parent in mapping inheritance chain) | `/manifest/{namespace}/{name}` |
| `Release.spec.extends` | Release (parent in deployment inheritance chain) | `/release/{namespace}/{name}` |
| `Release.spec.aggregate` | Aggregate (the Release's deployment target) | `/aggregate/{namespace}/{name}` |
| `Release.spec.manifest` | Manifest (the Release's mapping lockfile) | `/manifest/{namespace}/{name}` |
| `FeatureRecipe.spec.pipeline.<step>.plugin` | Wasm plugin | `/plugin/{category}/{name}` |

The inference rule: **the YAML schema position determines the entity kind**. There is no surface marker (sigil, prefix, schema-level annotation) telling the author which entity kind a particular `type:` field references. Authors hold the position-based rules in mind when reading YAML; tooling (IDE autocomplete, `aggrega inspect`, hub UI) reads the same rules to surface entity-kind-specific suggestions.

## URI shape — versioned vs unversioned

Every URI position above accepts two shape variants:

| Variant | Example | Semantics |
| --- | --- | --- |
| Versioned | `core/postgres:1.0.0` | Pins to one specific version |
| Unversioned | `core/postgres` | Resolves to "any version" or "latest registered", depending on the position's resolution semantics |

The two variants coexist in the same position. Authors choose based on whether they need version pinning or version flexibility. The Manifest's `mappings.{components,features}.type` tier supports both variants as distinct dictionary keys with **versioned-wins-over-unversioned** precedence — a versioned key (`core/api-server:1.0.0`) takes precedence over the unversioned key (`core/api-server`) when both match the same lookup. The two variants are not exclusive; both can sit in the same `type:` map and the resolver picks the most specific. Provider dispatch flows from the resolved Recipe's `spec.provider` field at orchestrator time; the Manifest's mapping shape is flat (no per-provider tier).

For the per-entity version-consumption regime (which entities actually have their version field consumed by resolution dispatch vs descriptive provenance), see [`vocabulary/inheritance-and-interface.md`](inheritance-and-interface.md) "Cross-entity version consumption".

For the readiness state of three-form `implements:` matching (exact / caret-range / unversioned with precedence iteration), see [`10-status.md`](../10-status.md) "Version matching" — exact form is `available` for verbatim string match; caret-range form is `planned`; precedence iteration with fallback ships alongside the caret implementation.

## OCI URI shorthand inference

Authors do not have to spell every URI as a fully-qualified OCI URI. The compiler applies four orthogonal inference rules to expand shorthand authoring forms into canonical OCI URIs at resolution time. The rules:

### Rule 1 — Domain default

Any URI lacking a domain is prefixed with the configured `default_registry` from `aggrega.yaml` (default: `hub.aggrega.ai/`).

```yaml
# Shorthand
type: core/postgres:1.0.0

# Equivalent canonical form
type: hub.aggrega.ai/component/core/postgres:1.0.0
```

### Rule 2 — Contextual entity expansion

The compiler appends the correct entity-type segment based on the schema position. The mapping is the same as the position-inference table above (`/component/`, `/aggregate/`, `/recipe/`, `/feature-recipe/`, `/feature/`, `/plugin/`).

```yaml
# Same string, two positions, two expansions
Aggregate.spec.components.foo.type: core/postgres:1.0.0
# → hub.aggrega.ai/component/core/postgres:1.0.0

Manifest.spec.mappings.components.type."core/postgres:1.0.0": helm/postgres-bitnami:1.0.0
# Key: hub.aggrega.ai/component/core/postgres:1.0.0
# Value: hub.aggrega.ai/recipe/helm/postgres-bitnami:1.0.0
```

### Rule 3 — Three-Tier Precedence

Before applying the OCI inference, the compiler resolves the URI through the Three-Tier Entity Resolution Model documented at [`architecture/13-catalog-and-registry.md`](../../architecture/13-catalog-and-registry.md):

1. **Tier 1 — Local catalog paths.** The `aggrega.yaml` workspace's `catalog_dirs:` directories are searched first. A URI matching a local path resolves to the local file; OCI inference does not run.
2. **Tier 2 — Workspace catalog directory.** The workspace's default `aggrega-catalog/` (or configured equivalent) is searched second. Same handling — local match short-circuits OCI inference.
3. **Tier 3 — Remote OCI registry.** When Tier 1 and Tier 2 miss, the OCI inference rules apply and the URI resolves to a remote registry pull.

The cascade lets authors mix locally-vendored content (Tier 1) with workspace-shared catalog content (Tier 2) with remote-fetched registry content (Tier 3) without authoring distinct URI shapes per tier.

When `catalog_dirs:` lists more than one directory, the list is an ordered **first-win precedence stack**: an entity identity present in more than one listed directory resolves to the earliest-listed directory, and the later occurrence is shadowed (overridden, not an error) — so a project can layer its own catalog directory ahead of a shared one and override entities by identity while the rest fall through. The override is reported in the resolution detail. Two files claiming the same identity *within a single* directory remain an authoring mistake that halts the load.

### Rule 4 — Version handling

A URI may include or omit the version segment. The version handling depends on the resolution position (Manifest tier resolution, `implements:` matching, sub-aggregate import) per the position's own version-consumption rules. See [`inheritance-and-interface.md`](inheritance-and-interface.md) "Cross-entity version consumption" for the per-entity version semantics.

## Format-string inventory

Beyond URI strings, Aggrega's authoring surface carries several distinct format-string conventions. Authors writing or reading YAML files encounter the following formats in different positions:

| Format | Where authored | Validated by |
| --- | --- | --- |
| Go template (`{{ .field }}`) | Recipe `valuesMapping:` / `workload:` / `artifacts:` / `provides:` / `locals:` / `source:`; FeatureRecipe `injectMapping:` / pipeline `with:`; Aggregate `parameters:` interpolation; Release `directory:` / `subDirectory:` | Go template parser at evaluation time; per-site availability rules at [`templates/expansion-matrix.md`](../templates/expansion-matrix.md) |
| Sprig function reference (`{{ default 1 .v }}` etc.) | Same surfaces as Go templates | Sprig v3 FuncMap registered at template-engine init; full helper list at [`templates/sprig-functions.md`](../templates/sprig-functions.md) |
| JSON Schema 2020-12 (compact or full form) | Component / Feature `schema:` content (or `schemaRef:` pointing at a SchemaLibrary entry) | JSON Schema validator at Step 1 entity load |
| JSON Pointer (RFC 6901) | Recipe `locals.<*_path>:` keys (`volumes_path`, `containers_path`, etc.); FeatureRecipe `pipeline:` step output references; Wasm plugin JSONPatch payloads | RFC 6901 baseline per the Wasm plugin contract; declared in `wasm/plugin-contract.md` |
| SemVer regex | `metadata.version` fields on every entity; URI version segments | JSON Schema regex `^(0\|[1-9]\d*)\.(0\|[1-9]\d*)\.(0\|[1-9]\d*)(?:-...)?$` per entity schema |
| Glob pattern (filesystem path) | Catalog-relative paths (e.g., `aggrega.yaml` `catalog_dirs:` entries); Recipe `$import:` file paths in `workload:` / `artifacts:` / `valuesMapping:` | Filesystem-walk semantics at Step 1 |
| Label selector expression | `Component.spec.usesSchema.<socket>.selector`; Feature `appliesTo:` / `appliesToAnyOf:` | Aggrega selector parser per [`pkg/selector/`](../../../aggrega-cli/pkg/selector/); selector grammar documented at [`vocabulary/topology-triad.md`](topology-triad.md) |
| Annotation-key shape (`<namespace>/<name>`) | `metadata.annotations` keys; Manifest `features.annotations` keys; boundary annotation cascade | JSON Schema regex per entity; reserved-prefix discipline at [`vocabulary/labels-and-annotations.md`](labels-and-annotations.md) |
| Provider name (bare string) | `Recipe.spec.provider`; `FeatureRecipe.spec.provider` | Engine-factory dispatch lookup at Step 5 Phase B |
| Inject delivery key (`env.<KEY>`, `file.<path>`, `arg.<flag>`) | Aggregate `inject:` blocks; FeatureRecipe `injectMapping:` output | Inject schema at [`vocabulary/topology-triad.md`](topology-triad.md) |

Each format has its own grammar, its own validator, and its own error-reporting shape. Authors who hit a format-string parse error read the per-format reference for the syntax rules.

A future LSP / scaffolders integration could validate every format at authoring time rather than at compile time — surfacing format errors in the IDE before the author runs `aggrega build`. Today's authoring surface relies on the compiler's per-format validation; the LSP integration is `planned` per the architectural roadmap and not yet wired.

## Cross-references

- [`entities/manifest.md`](../entities/manifest.md) — Manifest mapping tier resolution + Context-Aware Shorthand URIs section.
- [`architecture/13-catalog-and-registry.md`](../../architecture/13-catalog-and-registry.md) — Three-Tier Entity Resolution Model + canonical OCI taxonomy for catalog distribution.
- [`vocabulary/inheritance-and-interface.md`](inheritance-and-interface.md) — `implements:` Interface Binding + Cross-entity version consumption.
- [`templates/expansion-matrix.md`](../templates/expansion-matrix.md) — per-template-site availability rules for Go template format strings.
- [`templates/sprig-functions.md`](../templates/sprig-functions.md) — Sprig v3 helper inventory wired into the template engine.
- [`vocabulary/topology-triad.md`](topology-triad.md) — selector expression grammar + inject delivery key conventions.
- [`vocabulary/labels-and-annotations.md`](labels-and-annotations.md) — annotation-key shape and reserved-prefix discipline.
- [`10-status.md`](../10-status.md) — readiness state for `implements:` three-form matching, OCI shorthand registry resolution, and the LSP / scaffolders integration.
