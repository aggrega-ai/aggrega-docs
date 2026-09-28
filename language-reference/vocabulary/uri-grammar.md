# URI grammar and format-string inventory

Aggrega entities reference each other through URI strings that appear at multiple distinct authoring positions. The same URI shape (`core/postgres:1.0.0`) appears in five+ entity-kind contexts, with the compiler inferring the entity kind from the schema position rather than from a sigil or prefix. Authors reading or maintaining a YAML file must hold the position-based interpretation rules in mind to know whether `core/postgres:1.0.0` refers to a Component type, an Aggregate module, a Recipe, a FeatureRecipe, or a Wasm plugin.

This page consolidates the URI grammar across all positions, the precedence rules for versioned vs unversioned `type:` keys at the Manifest's mapping tiers, the OCI URI shorthand inference rules, and the broader format-string inventory across the corpus (Go template syntax, Sprig functions, JSON Schema 2020-12 declarations, JSONPath, glob patterns, SemVer regex). Authors who need to know "what does Aggrega do with this string?" should find the answer here.

## Position-based entity-kind inference

The same URI string carries different entity-kind meaning depending on where it appears in the schema. The table below enumerates every position where Aggrega expects an entity-reference URI, along with the inferred entity kind:

| Position | Inferred entity kind | OCI path expansion |
| --- | --- | --- |
| `Aggregate.spec.components.<id>.type` | Component | `/component/{publisher}/{category}/{name}` |
| `Aggregate.spec.subsystems.<name>.<id>.type` | Component (same as components — subsystems are component grouping) | `/component/{publisher}/{category}/{name}` |
| `Aggregate.spec.aggregates.<id>.type` | Aggregate (sub-aggregate module) | `/aggregate/{publisher}/{name}` |
| `Aggregate.spec.components.<id>.features.<id>.type` | Feature | `/feature/{publisher}/{name}` |
| `Aggregate.spec.components.<id>.features.<id>.type` | Feature (credential — labeled `feature.aggrega.ai/kind: secret`) | `/feature/{publisher}/{name}` |
| `Manifest.spec.mappings.components.type.<key>` | Component (the URI used as the lookup key); the value is a Recipe URI | key: `/component/`; value: `/recipe/{provider}/{name}` |
| `Manifest.spec.mappings.components.name.<id>` | Recipe (granular override binding) | `/recipe/{provider}/{name}` |
| `Manifest.spec.mappings.features.type.<key>` | Feature (lookup key); the value is a FeatureRecipe URI | key: `/feature/`; value: `/featurerecipe/{provider}/{name}` |
| `Manifest.spec.mappings.features.name.<id>` | FeatureRecipe (granular override binding) | `/featurerecipe/{provider}/{name}` |
| `Manifest.spec.mappings.features.annotations.<key>.feature` | Feature (annotation-bound) | `/feature/{publisher}/{name}` |
| `Recipe.spec.implements` | Component (interface contract) | `/component/{publisher}/{category}/{name}` |
| `FeatureRecipe.spec.implements` | Feature (interface contract) | `/feature/{publisher}/{name}` |
| `Recipe.spec.extends` / `FeatureRecipe.spec.extends` | Recipe / FeatureRecipe (parent in inheritance chain) | `/recipe/{provider}/{name}` or `/featurerecipe/{provider}/{name}` |
| `Component.spec.extends` / `Feature.spec.extends` | Component / Feature (parent in inheritance chain) | `/component/{publisher}/{category}/{name}` or `/feature/{publisher}/{name}` |
| `Manifest.spec.extends` | Manifest (parent in mapping inheritance chain) | not a URI position — a relative path, or the bare `metadata.name` of a Manifest beside the Release |
| `Release.spec.extends` | Release (parent in the inheritance chain) | not a URI position — a relative path to a Release file, and no other form |
| `Release.spec.aggregate` | Aggregate (the Release's deployment target) | `/aggregate/{publisher}/{name}` |
| `Release.spec.manifest` | Manifest (the Release's mapping lockfile) | `/manifest/{publisher}/{name}` |
| `FeatureRecipe.spec.pipeline.<step>.plugin` | Wasm plugin | `/plugin/{pluginType}/{name}` |

**Two positions are listed because authors reach for them expecting a URI, and they are not one.** A Manifest and a Release are deployment-side documents authored beside each other rather than catalog-indexed entities, so neither one's `extends:` is resolved against the catalog or a registry: the value names a **file**, and a registry coordinate written at either position is refused with the accepted form named in the diagnostic. The two are not spelled alike either — a Manifest also accepts the bare `metadata.name` of a Manifest sitting beside the Release, while a Release accepts the relative path and nothing else. See [`entities/release.md`](../entities/release.md#composite-release-and-extends-inheritance) for the Release form and [`errors/fatal-halts.md`](../errors/fatal-halts.md) for what each refusal says.

The inference rule: **the YAML schema position determines the entity kind**. There is no surface marker (sigil, prefix, schema-level annotation) telling the author which entity kind a particular `type:` field references. Authors hold the position-based rules in mind when reading YAML; tooling (IDE autocomplete, `aggrega inspect`, hub UI) reads the same rules to surface entity-kind-specific suggestions.

## Two URI shapes — derived-coordinate plugins vs metadata-kinded catalog entities

A catalog-entity URI carries no kind sigil (the previous section). Plugin URIs are the deliberate counterpoint: a plugin URI *does* spell a classifying segment — its socket type — directly in the path. The two reference families read differently on purpose, and knowing which family a URI belongs to tells you where to look for its classification.

**Plugin coordinates are derived from the plugin's type.** A plugin reference is `oci://hub.aggrega.ai/plugin/<pluginType>/<name>`. The coordinate is *derived*: the `<pluginType>` segment and the bare `<name>` come from the plugin's addressing block — `metadata.pluginType` and `metadata.name` — composed into the path. The socket is not path-encoded into the name; `metadata.name` is bare. The derived coordinate IS the registry (and embedded-plugin-set) key, so the registry organizes plugins by socket. Core plugins resolve to coordinates like `plugin/provider/helm`, `plugin/linter/publishing`, and `plugin/cli/moo` — each the composition of a bare `metadata.name` (`helm`, `publishing`, `moo`) with its `metadata.pluginType` (`provider`, `linter`, `cli`). The `<pluginType>` segment is exactly the plugin's socket type: the same bare `<name>` under a different `pluginType` is a different plugin, because the derived coordinate — and therefore the identity — differs. For the full socket taxonomy the `<pluginType>` segment classifies against, see [`entities/plugin.md`](../entities/plugin.md).

**Catalog entities carry the kind in metadata.** The authored reference is `<publisher>/<category>/<name>` (for example, `core/datastore/postgres`). The entity `kind:` lives in the file; the URI's entity-kind is inferred from schema position, per [Position-based entity-kind inference](#position-based-entity-kind-inference) above. The path organizes by category, not by kind: a Component carries a category segment (`core/datastore/postgres`); a Recipe or FeatureRecipe carries its render capability as the first segment (`helm/postgres`); the remaining kinds are flat `<publisher>/<name>`. Nothing in the path spells the entity kind.

**Why the two shapes differ.** Plugins are registry-organized by socket, so the socket segment is the natural registry key and is present in every plugin URI. Catalog entities are registry-organized by category, so the category — not the kind — is what the path spells. A URI therefore tells you the socket for a plugin from the path alone, but tells you a catalog entity's kind only after you read the file (the kind lives in `metadata`, the position supplies it at a reference site). This asymmetry is intentional: each family's path mirrors how that family is organized in the registry, not a single uniform grammar imposed across both.

## URI shape — versioned vs unversioned

Every URI position above accepts a reference in one of three forms — unversioned, or pinned after a colon with an exact version or a caret range:

| Form | Example | Semantics |
| --- | --- | --- |
| Unversioned | `core/postgres` | Resolves to "any version" or "latest registered", depending on the position's resolution semantics |
| Exact pin | `core/postgres:1.0.0` | Pins to one specific version. The version is a semantic version, the form every entity's `metadata.version` takes |
| Caret pin | `core/postgres:^1.0.0` | Selects the highest version compatible with the one named — for `^1.0.0`, at or above `1.0.0` and below `2.0.0` |

The pin is the text after the reference's **last** colon, and only when that text carries no `/`. A reference to a registry host with a port — `localhost:5000/core/postgres` — therefore carries no pin: the text after the port's colon continues the reference.

A pin that is none of these forms — a caret whose text does not read as a version range (`core/postgres:^garbage`), or an exact pin that is not a semantic version (`core/postgres:1.x`, `core/postgres:1.0`, `core/postgres:v1.0.0`) — names no version at all. When a command resolves such a reference and it does not resolve, the refusal names the reference, the pin, and the three forms above, rather than reporting an entity or a version the catalog does not hold; the diagnostic is described in [`errors/fatal-halts.md`](../errors/fatal-halts.md) under "A version pin is none of the forms a pin takes". The pin is judged only there, so a malformed pin never changes which references resolve, and a well-formed pin that no available version satisfies is reported as that. No schema states the pin grammar, so a malformed pin is reported when something resolves the reference — `aggrega validate`, `aggrega pull`, `aggrega build` — rather than when the file loads.

The forms coexist in the same position. Authors choose based on whether they need version pinning or version flexibility. The Manifest's `mappings.{components,features}.type` tier supports both variants as distinct dictionary keys with **versioned-wins-over-unversioned** precedence — a versioned key (`core/api-server:1.0.0`) takes precedence over the unversioned key (`core/api-server`) when both match the same lookup. The two variants are not exclusive; both can sit in the same `type:` map and the resolver picks the most specific. Provider dispatch flows from the resolved Recipe's `spec.capability` field at orchestrator time, so the Manifest maps a type to a Recipe and nothing more.

For the per-entity version-consumption regime (which entities actually have their version field consumed by resolution dispatch vs descriptive provenance), see [`vocabulary/inheritance-and-interface.md`](inheritance-and-interface.md) "Cross-entity version consumption".

A reference to a Component, Feature, Aggregate or Plugin also accepts a caret range (`core/postgres:^1.0.0`), and whichever form it takes it selects the highest satisfying version among those the catalog holds, by one rule every command applies — see [`version-resolution.md`](../version-resolution.md). For three-form `implements:` matching, which is the consistency check on a mapping rather than a selection, see [`10-status.md`](../10-status.md) "Version matching".

## Identity, not location

A canonical entity reference — including a plugin reference — is an *identity*, not a location: it names *what* the entity is, never *where* it currently lives.

The identity is **bare and host-free**. It carries no registry host; the host is a resolution coordinate supplied by configuration through `default_registry` and bound at resolution time. Relocating a registry, or mirroring the same entity elsewhere, is a configuration change — the references that name the entity are untouched.

The identity is also **version-free**. A reference may carry an optional `:version` floor to constrain which versions satisfy it, and each Release records the exact resolved version as a pin in its lockfile, but the version is supplied alongside the identity rather than baked into it.

At resolution time the compiler joins the bare identity to the configured host and the pinned version to reach concrete bytes. Because both are supplied separately, the same reference resolves against a different registry or a different pinned version with no edit to the source that names it.

## OCI URI shorthand inference

Authors do not have to spell every URI as a fully-qualified OCI URI. The compiler applies four orthogonal inference rules to expand shorthand authoring forms into canonical OCI URIs at resolution time. The rules:

### Rule 1 — Domain default

Any URI lacking a domain is prefixed with the configured `default_registry` from `.aggrega-config.yaml` (default: `hub.aggrega.ai/`).

```yaml
# Shorthand
type: core/postgres:1.0.0

# Equivalent canonical form
type: hub.aggrega.ai/component/core/postgres:1.0.0
```

### Rule 2 — Contextual entity expansion

The compiler appends the correct entity-type segment based on the schema position. The mapping is the same as the position-inference table above (`/component/`, `/aggregate/`, `/recipe/`, `/featurerecipe/`, `/feature/`, `/plugin/`).

```yaml
# Same string, two positions, two expansions
Aggregate.spec.components.foo.type: core/postgres:1.0.0
# → hub.aggrega.ai/component/core/postgres:1.0.0

Manifest.spec.mappings.components.type."core/postgres:1.0.0": helm/postgres:1.0.0
# Key: hub.aggrega.ai/component/core/postgres:1.0.0
# Value: hub.aggrega.ai/recipe/helm/postgres:1.0.0
```

### Rule 3 — Three-Tier Precedence

Before applying the OCI inference, the compiler resolves the URI through the Three-Tier Entity Resolution Model documented at [`architecture/13-catalog-and-registry.md`](../../architecture/13-catalog-and-registry.md):

1. **Tier 1 — Explicit local paths.** A reference carrying a local-path prefix resolves against that path directly. A URI matching a local file resolves to it; OCI inference does not run.
2. **Tier 2 — The workspace catalog search stack, then the cache.** The `.aggrega-config.yaml` workspace's `catalog_dirs:` directories — or, for a Release the configuration gives directories of its own under `workspace.releases`, that Release's — are searched in the order written, and the workspace root's `catalog/` directory is searched **last** — after every listed entry, and only when that directory exists. A match anywhere in the stack short-circuits OCI inference. A miss then consults `artifact_cache_dir`, which holds what earlier Tier 3 resolutions pulled.
3. **Tier 3 — Remote OCI registry.** When Tier 1 and Tier 2 miss, the OCI inference rules apply and the URI resolves to a remote registry pull.

The cascade lets authors mix explicitly-pathed content (Tier 1) with vendored and workspace-local catalog content (Tier 2) with remote-fetched registry content (Tier 3) without authoring distinct URI shapes per tier.

When `catalog_dirs:` lists more than one directory, the list is an ordered **first-win precedence stack**: an entity identity present in more than one listed directory resolves to the earliest-listed directory, and the later occurrence is shadowed (overridden, not an error) — so a project can layer its own catalog directory ahead of a shared one and override entities by identity while the rest fall through. The override is reported in the resolution detail. Two files claiming the same identity *within a single* directory remain an authoring mistake that halts the load.

The workspace root's `catalog/` directory sits at the end of that stack rather than at its head, so anything a project lists wins over it on a collision, and listing one unrelated directory never stops it being read. It is skipped when a listed entry already reaches it — the walk of a listed directory is recursive, so a stack naming the workspace root has read it already. Omitting `catalog_dirs:` and writing it as an empty list are different statements: omitted, the workspace still reads `catalog/`; written as `[]`, it reads no local catalog at all, which is how a workspace says it has none.

### Rule 4 — Version handling

A URI may include or omit the version segment. The version handling depends on the resolution position (Manifest tier resolution, `implements:` matching, sub-aggregate import) per the position's own version-consumption rules. See [`inheritance-and-interface.md`](inheritance-and-interface.md) "Cross-entity version consumption" for the per-entity version semantics.

## Format-string inventory

Beyond URI strings, Aggrega's authoring surface carries several distinct format-string conventions. Authors writing or reading YAML files encounter the following formats in different positions:

| Format | Where authored | Validated by |
| --- | --- | --- |
| Go template (`{{ .field }}`) | Recipe `valuesMapping:` / `workload:` / `artifacts:` / `provides:` / `locals:` / `source:`; FeatureRecipe `injectMapping:` / pipeline `with:`; Aggregate `parameters:` interpolation; Release `directory:` / `subDirectory:` | Go template parser at evaluation time; per-site availability rules at [`templates/expansion-matrix.md`](../templates/expansion-matrix.md) |
| Sprig function reference (`{{ default 1 .v }}` etc.) | Same surfaces as Go templates | Sprig v3 FuncMap registered at template-engine init; full helper list at [`templates/sprig-functions.md`](../templates/sprig-functions.md) |
| JSON Schema 2020-12 (compact or full form) | Component / Feature `schema:` content (or `schemaRef:` pointing at a SchemaLibrary entry) | JSON Schema validator at entity load during resolution |
| JSON Pointer (RFC 6901) | Recipe `locals.<*_path>:` keys (`volumes_path`, `containers_path`, etc.); FeatureRecipe `pipeline:` step output references; Wasm plugin JSONPatch payloads | RFC 6901 baseline per the Wasm plugin contract; declared in `plugins/plugin-contract.md` |
| SemVer regex | `metadata.version` fields on every entity | JSON Schema regex `^(0\|[1-9]\d*)\.(0\|[1-9]\d*)\.(0\|[1-9]\d*)(?:-...)?$` per entity schema |
| Version pin (`:<version>`, `:^<version>`) | The version segment of an entity reference, at every URI position above | The compiler, when it resolves the reference: an exact pin is a semantic version and a caret pin's range parses, and a malformed pin is refused under its own condition — see [URI shape](#uri-shape--versioned-vs-unversioned) above |
| Glob pattern (filesystem path) | Catalog-relative paths (e.g., `.aggrega-config.yaml` `catalog_dirs:` entries); Recipe `$import:` file paths in `workload:` / `artifacts:` / `valuesMapping:` | Filesystem-walk semantics at resolution |
| Label selector expression | `Component.spec.usesSchema.<socket>.selector`; Feature `appliesTo:` / `appliesToAnyOf:` | Aggrega selector parser per [`pkg/selector/`](../../../aggrega-cli/pkg/selector/); selector grammar documented at [`vocabulary/topology-triad.md`](topology-triad.md) |
| Annotation-key shape (`<namespace>/<name>`) | `metadata.annotations` keys; Manifest `features.annotations` keys; boundary annotation cascade | JSON Schema regex per entity; reserved-prefix discipline at [`vocabulary/labels-and-annotations.md`](labels-and-annotations.md) |
| Provider name (bare string) | `Recipe.spec.capability`; `FeatureRecipe.spec.capability` | Provider dispatch lookup at base rendering |
| Inject delivery key (`env.<KEY>`, `file.<path>`, `arg.<flag>`) | Aggregate `inject:` blocks; FeatureRecipe `injectMapping:` output | Inject schema at [`vocabulary/topology-triad.md`](topology-triad.md) |

Each format has its own grammar, its own validator, and its own error-reporting shape. Authors who hit a format-string parse error read the per-format reference for the syntax rules.

A future LSP / scaffolders integration could validate every format at authoring time rather than at compile time — surfacing format errors in the IDE before the author runs `aggrega build`. Today's authoring surface relies on the compiler's per-format validation; the LSP integration is `planned` per the architectural roadmap and not yet wired.

## Cross-references

- [`entities/manifest.md`](../entities/manifest.md) — Manifest mapping tier resolution + Context-Aware Shorthand URIs section.
- [`entities/plugin.md`](../entities/plugin.md) — Plugin socket taxonomy + the `plugin/<socket>/<name>` socket-encoded URI shape.
- [`architecture/13-catalog-and-registry.md`](../../architecture/13-catalog-and-registry.md) — Three-Tier Entity Resolution Model + canonical OCI taxonomy for catalog distribution.
- [`vocabulary/inheritance-and-interface.md`](inheritance-and-interface.md) — `implements:` Interface Binding + Cross-entity version consumption.
- [`templates/expansion-matrix.md`](../templates/expansion-matrix.md) — per-template-site availability rules for Go template format strings.
- [`templates/sprig-functions.md`](../templates/sprig-functions.md) — Sprig v3 helper inventory wired into the template engine.
- [`vocabulary/topology-triad.md`](topology-triad.md) — selector expression grammar + inject delivery key conventions.
- [`vocabulary/labels-and-annotations.md`](labels-and-annotations.md) — annotation-key shape and reserved-prefix discipline.
- [`10-status.md`](../10-status.md) — readiness state for `implements:` three-form matching, OCI shorthand registry resolution, and the LSP / scaffolders integration.
