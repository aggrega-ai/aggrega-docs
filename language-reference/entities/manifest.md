# Manifest

The conceptual role of the Manifest entity (Domain 4 — the dependency lockfile mapping abstract interfaces to concrete Recipes) lives in [architecture/04-eight-entity-taxonomy.md](../../architecture/04-eight-entity-taxonomy.md). This page covers the Manifest authoring surface: how it sits alongside the Release, the flat-URI mapping shape, composition via `extends`, URI shorthand rules, annotation-driven Feature bindings, and the platform-reserved `aggrega.ai/` prefix.

## Manifest vs. Release: Concern Separation

The Manifest and the Release carry non-overlapping responsibilities:

* **The Manifest** dictates the *provider engine* (e.g., Helm, Helm-chart, Compose) per catalog type. It is the software lockfile — a per-project Git-committed record of which concrete Recipe implements each abstract interface.
* **The Release** dictates the *destination* (e.g., the physical output folder for GitOps artifact generation). It is the deployment router — a per-environment description of where the compiled artifacts land.

The Release schema carries no `provider` field at any nesting level; provider dispatch belongs exclusively to the Manifest.

**The compilation path.** When a user runs `aggrega build --release release.yaml`, the compiler resolves physical artifacts by joining both sources:

1. **Read destination.** The compiler scans the Release's boundaries — for example, boundary `ovh-cluster-3` contains the component `user-db` (type: `core/postgres:1.0.0`).
2. **Scan Manifest.** It opens the Manifest lockfile the Release points at via its `manifest:` field.
3. **Two-tier lookup.** It checks the `name` tier for `"user-db"` first. If not found, it checks the `type` tier for `"core/postgres:1.0.0"` (versioned), then `"core/postgres"` (unversioned).
4. **Extract engine.** The matching tier sits under a specific provider block (e.g., `helm`), mapping to a specific Recipe.
5. **Output generation.** The compiler now knows the target folder (`dist/boundaries/ovh-cluster-3/`), the engine (Helm rendering via Wasm), and the artifact (the Recipe's source code). Ahead-of-time GitOps boundaries are respected end-to-end.

## Flat URI mapping

The Manifest's `mappings:` block is a flat map from **component-type URI** to **Recipe URI** (and from **feature-type URI** to **FeatureRecipe URI**). The mapping is provider-agnostic at the Manifest level; provider determination flows from each resolved Recipe's `spec.provider` field at orchestrator-time, not from the Manifest's structural shape. The block organises mappings under two top-level keys:

* **`components.type`** maps a component-type URI to a Recipe URI. Every component instance of the declared type resolves to the specified Recipe. The mapping is one-to-one per component-type.
* **`features.type`** maps a feature-type URI to a FeatureRecipe URI. Every Feature attachment of the declared type resolves to the specified FeatureRecipe. Credential Features (labeled `feature.aggrega.ai/kind: secret`) live in the same `features.type` map as operational Features — the unified Feature entity model.

Each block also accepts a **`name`** tier alongside `type`, mapping a specific **instance name** to a Recipe (or FeatureRecipe) URI. The name tier takes precedence over the type tier: an instance named in `components.name` resolves to that Recipe, while every other instance of the same type resolves through `components.type`. This expresses a per-instance override — two instances of one component type can deploy through two different Recipes (for example, most database instances use the bulk-mapped Recipe while one instance is pinned to a different physical implementation), without forking the component type or duplicating the Manifest. The override applies uniformly: the named instance both renders through and pins its source from the override Recipe. `features.name` is the symmetric tier for Feature attachments. The [per-instance recipe override example](../examples/per-instance-recipe-override/) walks a minimal two-instance case end to end.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Manifest
metadata:
  name: production-manifest
  version: 1.0.0
spec:
  mappings:
    components:
      type:
        # Component-type → Recipe URI. The Recipe URI's path segment carries the provider.
        core/datastore/postgres: core/helm/postgres-bitnami:1.2.0
        core/api-server: core/helm/api-helm:0.5.0
        core/python-worker: core/helm/standard-python-worker:2.0.0

    features:
      type:
        # Feature-type → FeatureRecipe URI. Credential Features (e.g., aws-secrets-manager) sit alongside operational ones.
        core/data-masking: core/helm/lakera-guard-istio:1.2.0
        core/aws-secrets-manager: core/helm/eso-aws-fetcher:1.0.0
```

**Provider determination at orchestrator-time.** The Manifest entry binds a component-type to a Recipe URI; the Recipe URI's `<namespace>/<provider>/<name>` path segment carries the provider. At orchestrator time, the resolver loads the Recipe via direct URI lookup against the lockfile and catalog, and each Recipe's `spec.provider` field determines the per-(path, provider) dispatch grouping. The Manifest's structural shape stays flat regardless of how many providers the broader catalog supports.

### Direct URI lookup, no `matchImplements` walking

The Manifest's mapping value is a Recipe URI. The catalog walker resolves the URI directly against the lockfile and catalog, returning the matching Recipe. The walker does not iterate `spec.implements` declarations to find a Recipe that "implements" a component-type. Each Manifest entry binds the developer's authored component-type to a specific Recipe URI; the choice is explicit and unambiguous in the Manifest content.

**`spec.implements` is a load-time consistency check.** The resolved Recipe's `spec.implements` value MUST match the Manifest's component-type key for that mapping entry; mismatch produces a `CATALOG_ERROR` at workspace load time with a clear diagnostic naming the Manifest entry, the resolved Recipe, and the conflicting `spec.implements` value. The check fires once per Manifest mapping entry at workspace load — static, no walking, deterministic.

**`spec.implements` also suggests candidates.** An instance whose type carries no Manifest mapping halts the build with a `CATALOG_ERROR` that lists the recipes whose `spec.implements` is able to implement that type as pin candidates; editor completion on a mapping value ranks those same matching recipes first. `spec.implements` thus declares what a recipe *can* implement and informs the human's choice — in the consistency check, the no-mapping diagnostic, and completion — but it never *resolves* a build. The Manifest mapping is the user's explicit deployment choice, pinned in the lockfile for reproducibility; the catalog never chooses a deployment on the user's behalf.

### Three forms for the URI version segment

A Recipe URI in the Manifest may carry the version in any of three forms:

* **Exact** — `core/helm/postgres-bitnami:1.2.0`. The lockfile must pin exactly this version; at first lockfile resolve, the resolver pins this version; if the catalog or registry does not contain this version at resolve time, the workspace load halts with an error.
* **Range** — `core/helm/postgres-bitnami:^1.2.0`. Semver range with the standard MVS rule; at first lockfile resolve, the resolver pins the highest available version satisfying the range.
* **Unversioned** — `core/helm/postgres-bitnami`. No `:version` suffix; at first lockfile resolve, the resolver pins the latest available version.

Subsequent builds use the lockfile-pinned version regardless of the user-typed form. Re-resolving to a newer version requires explicit user action (`aggrega catalog upgrade <URI>` or similar) — the lockfile is the source of truth for builds; the user-typed form is how the user expresses the version constraint at authoring time.

### Provider-qualified references

Recipe identity in the catalog is provider-scoped: two providers may each ship a recipe of the same `metadata.name` and version (the catalog tree places them at `recipe/{provider}/{name}/`, and the registry identity is `recipe/{provider}/{name}:{version}`). A Manifest mapping value names the recipe at either precision:

* **Bare** — `mariadb:1.0.0`. Resolves when exactly one provider ships the name; the common case for single-provider catalogs.
* **Provider-qualified** — `compose/mariadb:1.0.0`. The segment before the first `/` names the provider (`spec.provider`). Required when more than one provider ships the same recipe name: a bare reference that matches recipes under two providers is ambiguous and halts loudly at resolution rather than silently picking one.

The version-segment forms above apply to both shapes.

### Registry-published entities in mappings

An entity consumed from a registry rather than a local catalog is
addressed by its full host-qualified URI — the registry host followed by
the entity-kind path: `<registry>/component/<name>:<version>` for a
Component type, and the matching form for any other published kind. The
host-qualified URI is valid anywhere the entity is referenced: as a
component `type:` in the Aggregate, as the Manifest mapping key for that
type, and as a mapping value. At resolution time the three-tier cascade
finds no local or cached copy, pulls the entity from the named registry,
caches it, and pins the resolved version and content digest in the
lockfile; subsequent builds consume the cache without network access.

```yaml
# Aggregate fragment — a registry-published Component as the type:
components:
  db:
    type: hub.aggrega.ai/component/core/datastore/mariadb:1.0.0
```

A bare, host-less reference resolves against the workspace's
`default_registry` only for the entity kinds with name-to-location
binding (libraries and Aggregates); component-type references are either
local catalog names or full host-qualified URIs — the resolver never
guesses a host for them.

### Completeness check

After all mappings resolve, the compiler verifies that every component and feature instance (including credential Features attached via the Aggregate's `secrets:` block) in the developer's Aggregate has a resolved Recipe or FeatureRecipe. Unmapped entities cause a fatal halt with an explicit diagnostic listing every missing entity and suggesting which `components.type` or `features.type` key to add to close the gap.

### YAML anchors for DRY manifests

To avoid YAML bloat across large mapping sets, the Manifest supports an optional `defs:` block for standard YAML anchors (`&` and `*`):

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Manifest
metadata:
  name: global-base-manifest
  version: 1.0.0
defs:
  - &python_worker_recipe "core/helm/standard-python-worker:2.0.0"
spec:
  mappings:
    components:
      type:
        core/python-worker: *python_worker_recipe
        core/postgres: core/helm/postgres-bitnami:1.2.0
```

### Feature negotiation

The capability handshake uses the same flat-URI mapping:

1. The developer requests `features: [core/data-masking]` on a component in the Aggregate.
2. The compiler looks up `core/data-masking` in the Manifest's `features.type` map.
3. If the lookup resolves to a FeatureRecipe URI (e.g., `core/helm/lakera-guard-istio:1.2.0`), the capability exists and the FeatureRecipe's pipeline executes in the defined order.
4. If `features.type` contains no matching entry, the compiler halts the build and lists the unmapped Feature.

The Manifest also accepts a `features.annotations` block — a parallel authoring surface that lets a Release or Aggregate subsystem attach Features by annotation key rather than by per-component declaration. The binding shape, the side-vs-pillar partition that governs which authoring surface uses which routing paths, the explicit-attachment-wins discipline, and the schema-defaults rule live in the dedicated [Annotation-Driven Feature Bindings](#annotation-driven-feature-bindings) section further down.

## Composition via `extends`

A Manifest may declare a single `extends:` URI pointing to a base Manifest whose `mappings` it inherits. Child mappings overwrite the base on key collision, supporting environment-overlay patterns (staging/prod parity with surgical per-environment diffs) and local-development patterns without full-copy authoring.

**Merge semantics.** When a local Manifest extends a base Manifest, the compiler performs a **shallow key replacement** per tier — the `type` and `name` dictionaries are merged independently, not deep-merged — which guarantees O(1) dictionary lookups and keeps inheritance behavior predictable. Within each tier, child keys overwrite parent keys.

**The local-development bridge pattern.** A common use of `extends` is swapping a credential FeatureRecipe for local prototyping without touching the Aggregate. In production, the base Manifest maps the credential Feature `core/aws-secrets-manager` to a production FeatureRecipe under the `features.type` tier. For local prototyping, the platform team provides a `local-manifest` that extends the base and surgically overrides the credential Feature mapping to use `host-env-injector` — a local FeatureRecipe that outputs native Docker Compose syntax (`env_file: [".env"]` or `${SECRET_NAME}`). The developer gets a standard local workflow, and the Aggregate remains target-agnostic for production.

## Context-Aware Shorthand URIs

The Aggrega compiler utilizes **Context-Aware Inference** when resolving OCI URIs in Manifests. If an engineer omits the Fully Qualified Domain Name (FQDN) and the architectural entity type, the compiler automatically falls back to the default registry (configured in `aggrega.yaml`) and infers the entity type based on where the string is located in the schema.

**The Inference Rules:**

1. **Domain Default:** Any URI lacking a domain (e.g., `python-worker-helm:1.0`) is prefixed with the configured `default_registry` (default: `hub.aggrega.ai/`).
2. **Contextual Entity Expansion:** The compiler appends the correct entity path based on the strict schema dictionary:
    * Strings under `Aggregate.spec.components[].type` expand to `/component/`.
    * Strings under `Aggregate.spec.aggregates[].type` expand to `/aggregate/`.
    * Strings under `Manifest.mappings.*.components.type` or `Manifest.mappings.*.components.name` expand to `/recipe/`.
    * Strings under `Manifest.mappings.*.features.type` or `Manifest.mappings.*.features.name` expand to `/feature-recipe/`. This includes credential Features (labeled `feature.aggrega.ai/kind: secret`) — they use the same FeatureRecipe path.
    * Strings assigned to `pipeline[].plugin` expand to `/plugin/`.
3. **Three-Tier Precedence:** Before applying the OCI inference, the compiler checks local paths (Tier 1) and workspace directories (Tier 2) as defined in the [Three-Tier Entity Resolution Model](../../architecture/13-catalog-and-registry.md). OCI inference only applies when the entity reaches Tier 3 (remote registry).

**The Shorthand in Action:**

```yaml
# Verbose (allowed for custom private registries):
"core/postgres": "oci://private-registry.corp.com/recipe/postgres-bitnami:2.0"

# Shorthand (standard ecosystem):
"core/postgres": "postgres-bitnami:2.0"
# Compiler resolves via Tier 2 local catalog, or Tier 3: hub.aggrega.ai/recipe/helm/postgres-bitnami:2.0
```

**Legacy `ops/` prefix.** Older catalog conventions placed an `ops/` prefix before Recipe names. This prefix is no longer used — the `recipe/` entity type directory in the OCI taxonomy already identifies the domain, and Recipes ship under `recipe/{provider}/{name}` without additional prefixing. Manifests should reference Recipes by `{provider}/{name}` (or via the bare shorthand for context-aware inference). See [architecture/13-catalog-and-registry.md](../../architecture/13-catalog-and-registry.md) §6 for the full OCI taxonomy.

## Annotation-Driven Feature Bindings

The Manifest's `features.annotations` block declares bindings between annotation keys and Feature types plus the routing paths each binding sends the annotation value through. The binding is the authoring surface for compressing repetitive per-component Feature attachments — the pattern where dozens of components across a boundary each carry an identical `features:` block — into single annotation declarations on Release boundaries or Aggregate subsystems.

**Schema shape:**

```yaml
spec:
  mappings:
    features:
      type:
        core/rewrite-host: core/helm/rewrite-host-helm:1.0.0
        core/db-pool: core/helm/db-pool-helm:1.0.0

      annotations:
        feature.aggrega.ai/rewrite-host:
          feature: core/rewrite-host
          maps:
            infra:
              - upstream                  # Release-side: routes annotation value into infra.upstream

        feature.aggrega.ai/db-pool:
          feature: core/db-pool
          maps:
            values:
              - pool                      # Aggregate-side: routes annotation value into values.pool
```

A binding carries a `feature` field naming the target Feature type and a `maps` block grouping dotted-path subkey routes by target pillar. The `feature` field references a Feature type that must also appear in the sibling `features.type` section (which is where the FeatureRecipe version binding lives). The `maps` block declares two pillar-keyed lists — `maps.infra` and `maps.values` — each carrying dotted-path strings that point into the target Feature's `spec.schema.<pillar>.<path>` properties. A binding must declare at least one path across the two lists (the JSON Schema enforces `minProperties: 1` on `maps`).

Provider polymorphism for the same annotation key — e.g., `feature.aggrega.ai/rewrite-host` binding to `core/k8s-dns-resolver` in a Kubernetes deployment but to `core/compose-bridge` in a local Compose deployment — is expressed by choosing different Feature types in different Manifests; each Manifest binds the annotation to one Feature, and the chosen Feature's FeatureRecipe carries the provider-specific implementation.

**The side-vs-pillar partition.** The Aggregate-as-Authoring-Surface invariant restricts each authoring side to one pillar's routing paths. Aggregate-side annotations route only through `maps.values` paths; Release-side annotations route only through `maps.infra` paths. A binding declaring paths in both pillars supports cross-side composition: an Aggregate-side annotation fires the values-pillar subset; a Release-side annotation against the same key fires the infra-pillar subset; both contributions compose into one Feature attachment per (Component, Feature) pair with both pillars populated. A side-vs-pillar mismatch — e.g., an Aggregate-side annotation against a binding declaring only `maps.infra` — halts the build with a clear OPS_ERROR naming the annotation key, the routed pillar, the authoring side, and the source location.

**Path-target validation.** At catalog load, the compiler verifies that every dotted path declared under `maps.infra` and `maps.values` corresponds to a property the target Feature's `spec.schema.<pillar>` actually declares. A binding routing to a path the Feature schema does not list halts catalog load with a clear OPS_ERROR. Schema shapes that escape simple property-walk (`$ref`, `patternProperties`, `oneOf` / `anyOf` / `allOf` composition) terminate the static check at that branch and let downstream schema validation catch any mismatch.

**Annotation value shapes.** A binding consumes annotation values in three shapes. **Scalar** — a single YAML value (string, number, boolean). A scalar paired with a binding declaring exactly one path across both pillars routes the value to that single path; a scalar paired with a binding declaring more than one path is ambiguous routing and halts the build with a clear OPS_ERROR. **Structured** — a YAML map whose top-level subkeys each match a dotted-path entry under `maps.infra` or `maps.values`; each subkey routes to its declared pillar independently, and the side-vs-pillar partition applies per subkey. **Explicit YAML `null`** — opts out of the inherited binding at the cascade scope (with per-subkey `null` inside a structured value opting out of individual subkeys while siblings stand). For the canonical authoring teaching on structured values — cascade merge per subkey, cross-side composition, per-subkey type validation, the relaxed-default discipline for schema fields without a declared `type` — see [providers/well-known-annotations.md](../providers/well-known-annotations.md) §"Structured annotation values".

**Explicit attachment wins on key collision.** When a Release component or Aggregate component carries both an explicit `features:` entry and an annotation that expands to the same Feature key, the explicit entry is preserved and the annotation expansion for that key on that component is a no-op. The synthetic attachment never overwrites an author-declared Feature instance. Authors can therefore use annotation expansion for the bulk of components and surgically override individual components by writing an explicit `features:` entry with the same key — the explicit entry carries the per-component customization, the annotation cascades to every other component unchanged.

**Per-leaf explicit-wins on cross-side composition.** When an explicit attachment and an annotation contribution both populate the same Feature instance but write to different leaves, both contributions stand and the resulting Feature carries both leaves with per-leaf provenance recording each leaf's source. When an explicit attachment and an annotation contribution target the same leaf within the same pillar, the explicit contribution wins and the IR records the suppressed annotation provenance as an override marker on that leaf. Catalog load surfaces this override at build time via an advisory lint warning naming the suppressed annotation key + source.

**Schema defaults at expansion time.** The synthetic Feature attachment produced by annotation expansion carries only the leaves the annotation value populates through the binding's declared paths. Schema defaults declared on the target Feature's `spec.schema` are not merged into the synthetic attachment at expansion time. Default-value materialization is the FeatureRecipe rendering layer's responsibility, applied uniformly to explicit and synthetic attachments so the two paths produce the same downstream output for the same effective configuration.

**Annotation namespace separation:**

| Prefix | Owner | Purpose |
| --- | --- | --- |
| `aggrega.ai/` | Aggrega platform only | Platform-native annotations read directly by engine code (e.g., `aggrega.ai/namespace`). |
| `feature.aggrega.ai/` | Official standard library | Feature-annotation shortcuts bound in the Manifest. |
| `{any-other-domain}/` | Enterprise / community | Custom Feature-annotation shortcuts. |

## `aggrega.ai/` Prefix Reservation

Manifest `features.annotations` bindings cannot use the bare `aggrega.ai/` prefix — it is reserved for platform-native annotations emitted by the compiler (OTel/provenance labels, etc.). Scoped sub-prefixes (`component.aggrega.ai/*`, `compliance.aggrega.ai/*`, enterprise `acme.aggrega.ai/*`) remain available for user authoring. See [providers/well-known-annotations](../providers/well-known-annotations.md) for the platform-reserved annotation set.
