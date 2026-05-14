# Manifest

The conceptual role of the Manifest entity (Domain 4 — the dependency lockfile mapping abstract interfaces to concrete Recipes) lives in [architecture/04-eight-entity-taxonomy.md](../../architecture/04-eight-entity-taxonomy.md). This page covers the Manifest authoring surface: how it sits alongside the Release, the flat-URI mapping shape, composition via `extends`, URI shorthand rules, annotation-driven Feature bindings, and the platform-reserved `aggrega.ai/` prefix.

## Manifest vs. Release: Concern Separation

The Manifest and the Release carry non-overlapping responsibilities:

* **The Manifest** dictates the *provider engine* (e.g., Helm, Terraform, Compose, Eval) per catalog type. It is the software lockfile — a per-project Git-committed record of which concrete Recipe implements each abstract interface.
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
        core/database/postgres: core/helm/postgres-bitnami:1.2.0
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

### Three forms for the URI version segment

A Recipe URI in the Manifest may carry the version in any of three forms:

* **Exact** — `core/helm/postgres-bitnami:1.2.0`. The lockfile must pin exactly this version; at first lockfile resolve, the resolver pins this version; if the catalog or registry does not contain this version at resolve time, the workspace load halts with an error.
* **Range** — `core/helm/postgres-bitnami:^1.2.0`. Semver range with the standard MVS rule; at first lockfile resolve, the resolver pins the highest available version satisfying the range.
* **Unversioned** — `core/helm/postgres-bitnami`. No `:version` suffix; at first lockfile resolve, the resolver pins the latest available version.

Subsequent builds use the lockfile-pinned version regardless of the user-typed form. Re-resolving to a newer version requires explicit user action (`aggrega catalog upgrade <URI>` or similar) — the lockfile is the source of truth for builds; the user-typed form is how the user expresses the version constraint at authoring time.

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

### Annotation-driven Feature bindings

The Manifest's `features.annotations` block declares bindings between annotation keys and Feature types plus their `infra:` schemas. The binding is the authoring surface for compressing repetitive per-component Feature attachments — the pattern where dozens of components across a boundary each carry an identical `features:` block — into single annotation declarations on Release boundaries or Aggregate subsystems.

```yaml
spec:
  mappings:
    features:
      type:
        core/tls-pinning: core/helm/tls-pinning-istio:1.0.0
      annotations:
        feature.aggrega.ai/tls-pinning:
          feature: core/tls-pinning
          infra:
            min_version: { type: string }
            enforce: { type: boolean, default: true }
```

The annotation-expansion sub-mechanism is currently **`accepted but inert`** — the schema accepts and parses the bindings; the compiler pass that synthesises per-component Feature attachments from matching annotations is not yet wired into the build pipeline. Manifests may author annotation bindings against this schema today; the attachment expansion will engage when the pass ships. Today's behaviour: annotation bindings are parsed without effect on rendered output. See [Status of the Language → Compilation pipeline phases](../10-status.md#compilation-pipeline-phases) for the current readiness state.

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

The Manifest's `features.annotations` block declares bindings between annotation keys and Feature types plus `infra:` schema fragments. The binding is the authoring surface for compressing repetitive per-component Feature attachments — the pattern where dozens of components across a boundary each carry an identical `features:` block — into single annotation declarations on Release boundaries or Aggregate subsystems.

*Annotation-triggered expansion — translating matching boundary or subsystem annotations into per-component synthetic Feature attachments at build time — is the intended consumer of these bindings. The binding shape is frozen at the schema layer today; the compiler pass that performs the expansion is under active development and not yet wired into the build pipeline. Manifests may author bindings against this schema now; attachment expansion will engage when the pass ships.*

**Schema shape:**

```yaml
spec:
  mappings:
    features:
      type:
        core/tls-pinning: core/helm/tls-pinning-helm:1.0.0
        core/data-masking: core/helm/lakera-guard-sidecar:1.0.0

      annotations:
        feature.aggrega.ai/tls-pinning:
          feature: core/tls-pinning
          infra:
            min_version: { type: string }
            enforce: { type: boolean, default: true }

        feature.aggrega.ai/data-masking:
          feature: core/data-masking
          infra:
            action: { type: string, default: "redact" }
            scope: { type: string, default: "all" }
```

The `feature` field references a Feature type that must also appear in the sibling `features.type` section (which is where the FeatureRecipe version binding lives). The `infra` block is a JSON Schema 2020-12 fragment (compact-form or full JSON Schema) that validates the annotation value's argument structure. Provider polymorphism for the same annotation key — e.g., `feature.aggrega.ai/rewrite-host` binding to `core/k8s-dns-resolver` in a Kubernetes deployment but to `core/compose-bridge` in a local Compose deployment — is expressed by choosing different Feature types in different Manifests; each Manifest binds the annotation to one Feature, and the chosen Feature's FeatureRecipe carries the provider-specific implementation.

**Annotation namespace separation:**

| Prefix | Owner | Purpose |
| --- | --- | --- |
| `aggrega.ai/` | Aggrega platform only | Platform-native annotations read directly by engine code (e.g., `aggrega.ai/namespace`). |
| `feature.aggrega.ai/` | Official standard library | Feature-annotation shortcuts bound in the Manifest. |
| `{any-other-domain}/` | Enterprise / community | Custom Feature-annotation shortcuts. |

## `aggrega.ai/` Prefix Reservation

Manifest `features.annotations` bindings cannot use the bare `aggrega.ai/` prefix — it is reserved for platform-native annotations emitted by the compiler (OTel/provenance labels, etc.). Scoped sub-prefixes (`component.aggrega.ai/*`, `compliance.aggrega.ai/*`, enterprise `acme.aggrega.ai/*`) remain available for user authoring. See [providers/well-known-annotations](../providers/well-known-annotations.md) for the platform-reserved annotation set.
