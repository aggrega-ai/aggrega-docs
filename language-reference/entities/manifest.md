# Manifest

The conceptual role of the Manifest entity (Domain 4 — the dependency lockfile mapping abstract interfaces to concrete Recipes) lives in [architecture/04-eight-entity-taxonomy.md](../../architecture/04-eight-entity-taxonomy.md). This page covers the Manifest authoring surface: how it sits alongside the Release, the two-tier Recipe lookup, composition via `extends`, URI shorthand rules, annotation-driven Feature bindings, and the platform-reserved `aggrega.ai/` prefix.

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

## Two-Tier Resolution

The Manifest's `mappings` block is grouped by provider — each provider section (`helm`, `terraform`, `compose`, `eval`) contains a `components` sub-section and a `features` sub-section, and each sub-section supports up to two tiers:

* **`type` (bulk DRY mapping)** maps a catalog type URI to a Recipe URI. All instances of that component type automatically resolve to the specified Recipe. The `type` tier supports versioned keys (`core/api-server:1.0.0` — exact match) and unversioned keys (`core/api-server` — any version). Versioned keys take precedence over unversioned.
* **`name` (granular override)** maps a specific instance name to a Recipe URI, overriding the type-based mapping for that single instance. Used when a specific instance requires a non-standard Recipe.

Credential Features (labeled `feature.aggrega.ai/kind: secret`) are mapped under the `features` sub-section alongside operational Features — there is no separate `secrets` sub-section, reflecting the unified Feature entity model.

**Resolution order (most specific wins):**

1. `name` lookup (exact instance name match) — highest priority.
2. `type` lookup with version (exact version match).
3. `type` lookup without version (any version match).
4. If no match — fatal halt listing the unmapped entity and suggesting which `type` or `name` key to add.

**YAML anchors for DRY manifests.** To avoid YAML bloat, the Manifest supports an optional `defs:` block for standard YAML anchors (`&` and `*`):

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Manifest
metadata:
  name: global-base-manifest
  version: 1.0.0
defs:
  - &python_worker "standard-python-worker:2.0.0"
spec:
  mappings:
    helm:
      components:
        type:
          "core/python-worker": *python_worker
          "core/postgres": "postgres-bitnami:1.2.0"
        name:
          # Override: this specific agent uses a custom recipe
          "legacy-billing-agent": "custom/legacy-worker:3.0.0"
      features:
        type:
          "core/data-masking": "lakera-guard-istio:1.2.0"
          "core/aws-secrets-manager": "eso-aws-fetcher:1.0.0"  # Credential Feature — same tier
```

**Feature negotiation.** The capability handshake relies on the same two-tier resolution:

1. The developer requests `features: [core/data-masking]` on a component in the Aggregate.
2. The compiler checks the Manifest's `features` section under the active provider.
3. If `"core/data-masking"` maps to a FeatureRecipe (e.g., `lakera-guard-istio:1.2.0`) in the `type` tier, the capability exists and the FeatureRecipe's Wasm pipeline executes in the defined order.
4. If neither `type` nor `name` tier contains a mapping, the compiler halts the build and lists the unmapped Feature.

**Completeness check.** After all resolution is complete, the compiler verifies that every component and feature instance (including credential Features from the `secrets:` block) in the Aggregate has a resolved Recipe or FeatureRecipe. Unmapped entities cause a fatal halt with an explicit diagnostic listing every missing entity and suggesting which `type` or `name` key to add to close the gap.

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

## Annotation-Driven Feature Bindings

The Manifest's per-provider `features.annotations` block declares bindings between annotation keys and Feature types plus `infra` CUE schemas. The binding is the authoring surface for compressing repetitive per-component Feature attachments — the pattern where dozens of components across a boundary each carry an identical `features:` block — into single annotation declarations on Release boundaries or Aggregate subsystems.

*Annotation-triggered expansion — translating matching boundary or subsystem annotations into per-component synthetic Feature attachments at build time — is the intended consumer of these bindings. The binding shape is frozen at the schema layer today; the compiler pass that performs the expansion is under active development and not yet wired into the build pipeline. Manifests may author bindings against this schema now; attachment expansion will engage when the pass ships.*

**Schema shape:**

```yaml
spec:
  mappings:
    helm:
      features:
        type:
          core/tls-pinning: tls-pinning-helm:1.0.0
          core/data-masking: lakera-guard-sidecar:1.0.0

        annotations:
          feature.aggrega.ai/tls-pinning:
            feature: core/tls-pinning
            infra:
              min_version: string
              enforce: bool | *true

          feature.aggrega.ai/data-masking:
            feature: core/data-masking
            infra:
              action: string | *"redact"
              scope: string | *"all"
```

The `feature` field references a Feature type that must also appear in the sibling `features.type` section (which is where the FeatureRecipe version binding lives). The `infra` block is a CUE schema fragment that validates the annotation value's argument structure. The same annotation key can map to different Feature types per provider — for example, `feature.aggrega.ai/rewrite-host` may bind to `core/k8s-dns-resolver` under the `helm` provider section and `core/compose-bridge` under the `compose` provider section, capturing per-provider polymorphism without forcing the Release (which does not declare a provider) to know which provider it targets.

**Annotation namespace separation:**

| Prefix | Owner | Purpose |
| --- | --- | --- |
| `aggrega.ai/` | Aggrega platform only | Platform-native annotations read directly by engine code (e.g., `aggrega.ai/namespace`). |
| `feature.aggrega.ai/` | Official standard library | Feature-annotation shortcuts bound in the Manifest. |
| `{any-other-domain}/` | Enterprise / community | Custom Feature-annotation shortcuts. |

## `aggrega.ai/` Prefix Reservation

Manifest `features.annotations` bindings cannot use the bare `aggrega.ai/` prefix — it is reserved for platform-native annotations emitted by the compiler (OTel/provenance labels, etc.). Scoped sub-prefixes (`component.aggrega.ai/*`, `compliance.aggrega.ai/*`, enterprise `acme.aggrega.ai/*`) remain available for user authoring. See [providers/well-known-annotations](../providers/well-known-annotations.md) for the platform-reserved annotation set.
