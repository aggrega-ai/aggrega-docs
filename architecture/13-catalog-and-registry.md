# Catalog and Registry

This chapter defines how the platform scales across the enterprise via the Open Container Initiative (OCI) Catalog, automated bootstrapping factories, and strict WebAssembly (Wasm) plugin guardrails.

## The Aggrega Catalog: Registry Taxonomy and Resolution

The Aggrega compiler relies on a strictly typed, OAM-inspired registry to resolve abstract Developer Intent (Domain 1) into concrete Ops Reality (Domain 3). To support an open, distributed ecosystem while maintaining a seamless developer experience, all schemas, infrastructure bindings, programmable policies, and adapter plugins follow a standardized Open Container Initiative (OCI) URI taxonomy. Because every catalog entity is addressable by URI, the compiler fetches them on demand during compilation. The developer's local workspace contains only their Aggregate and Release files, not a copy of the catalog.

### 1. Core Directory Structure (The Catalog)

An official `aggrega-catalog` repository (and any compliant third-party catalog) is organized to physically enforce the Separation of Concerns. The structure explicitly separates abstract interfaces from their concrete infrastructure implementations.

URI segments map 1:1 to filesystem path segments. Components use a three-segment URI (`{namespace}/{category}/{name}`) with 10 human-navigable categories. Features remain flat (`{namespace}/{name}`) — only ~25 files, growing slowly. Ontology classification (`stateful-server`, `server`, etc.) lives in `metadata.labels`, NOT in directory structure. The hub web UI uses labels for filtering and search. Categories are for human filesystem navigation.

```text
aggrega-catalog/
├── README.md
│
├── schemalibrary/            # TIER 3: Reusable JSON Schema 2020-12 definitions
│   │                         # Common shapes (PodResources, PersistenceSpec, etc.)
│   │                         # consumed via $ref: oci://<host>/<library>@<version>#/schemas/<name>
│   │                         #   schemalibrary/base-components.yaml
│   │                         #   schemalibrary/networking-primitives.yaml
│   └── ...
│
├── mappinglibrary/           # TIER 3: Reusable Go template fragments
│   │                         # Common valuesMapping helpers consumed via
│   │                         # valuesMapping: { $import: oci://<host>/<library>@<version>#/mappings/<name> }
│   │                         #   mappinglibrary/bitnami-helpers.yaml
│   └── ...
│
├── component/                # DOMAIN 2: Abstract Interfaces
│   │                         # URI: {namespace}/{category}/{name}
│   │                         #   type: core/database/mariadb:1.0.0
│   │                         #   → component/core/database/mariadb.yaml
│   │
│   └── core/                 # "core" = official Aggrega standard library
│       ├── database/         # stateful-server ontology
│       │   ├── mariadb.yaml
│       │   ├── postgres.yaml
│       │   └── redis.yaml
│       ├── model/            # AI model providers
│       │   ├── openai.yaml
│       │   └── openai-embedding.yaml
│       ├── agent/            # AI agent frameworks
│       │   ├── anthropic.yaml
│       │   └── pydantic-ai.yaml
│       ├── tool/             # AI tools
│       │   └── browser.yaml
│       ├── server/           # HTTP/gRPC endpoints, gateways, UIs
│       │   ├── api-server.yaml
│       │   ├── web-ui.yaml
│       │   └── llm-gateway.yaml
│       ├── worker/           # background processors
│       │   └── python-worker.yaml
│       ├── messaging/        # event buses, queues
│       ├── storage/          # object/file storage
│       ├── compute/          # tasks, functions, serverless
│       └── pipeline/         # data and AI pipelines
│
├── feature/                  # DOMAIN 2: Abstract Interfaces
│   │                         # Flat: {namespace}/{name} (no categories)
│   │                         #   type: core/data-masking:1.0.0
│   │                         #   → feature/core/data-masking.yaml
│   │
│   └── core/
│       ├── secret-value.yaml # feature.aggrega.ai/kind: secret
│       ├── data-masking.yaml
│       ├── k8s-dns-resolver.yaml
│       ├── env-override.yaml
│       ├── ingress.yaml
│       └── ...               # ~25 core features, flat
│
├── aggregate/                # DOMAIN 1: Reusable Aggregate Modules
│   └── core/
│       └── db-module/
│           └── aggregate.yaml
│
├── recipe/                   # DOMAIN 3: Concrete Implementations
│   │                         # Organized by PROVIDER (execution engine).
│   │                         # Each recipe is a directory (may bundle source charts/modules).
│   │                         #   recipe/helm/mariadb-bitnami/recipe.yaml
│   │                         #   OCI: hub.aggrega.ai/recipe/helm/mariadb-bitnami:1.0.0
│   │
│   ├── helm/
│   │   ├── mariadb-bitnami/
│   │   │   └── recipe.yaml
│   │   └── postgres-bitnami/
│   │       └── recipe.yaml
│   ├── terraform/
│   │   └── mariadb-rds/
│   │       └── recipe.yaml
│   ├── cloudformation/
│   │   └── mariadb-rds/
│   │       └── recipe.yaml
│   ├── compose/
│   │   └── mariadb/
│   │       └── recipe.yaml
│   └── eval/                 # Wasm Pass-Through formatter stubs
│
├── feature-recipe/           # DOMAIN 3: Concrete Implementations
│   │                         # Same provider-as-namespace pattern as recipes.
│   │
│   ├── helm/
│   │   ├── k8s-secret-from-parameter/
│   │   │   └── recipe.yaml
│   │   └── k8s-dns-patcher/
│   │       └── recipe.yaml
│   ├── compose/
│   │   └── dotenv-secret/
│   │       └── recipe.yaml
│   └── eval/
│
└── plugin/                   # ARTIFACTS: Compiled Wasm Adapter Binaries
    └── security/
        └── lakera-guard.wasm 
```

**The 10 Component Categories:**

| Category | Contains | Ontology label(s) |
| --- | --- | --- |
| `database` | Persistent datastores (relational, vector, document, graph, KV) | stateful-server |
| `model` | AI model providers and inference runtimes | server |
| `agent` | AI agent frameworks and patterns | worker, server |
| `tool` | AI tools invoked by agents | ai-tool |
| `server` | Long-running HTTP/gRPC endpoints, gateways, UIs | server |
| `worker` | Background processors, consumers | worker |
| `messaging` | Event buses, queues, streams | messaging |
| `storage` | Object/file storage, managed cloud resources (no compute) | resource |
| `compute` | Tasks, functions, serverless, run-to-completion jobs | task, function |
| `pipeline` | Data and AI pipelines | ai-pipeline |

Categories are chosen for how users navigate, not how the compiler classifies. Ontology classification stays in `metadata.labels`. When a component moves to its category directory, the redundant type suffix is stripped (e.g., `openai-model.yaml` → `model/openai.yaml`).

### 2. The Split Schema & Bridge Synthesis Pipeline

To eliminate per-Component boilerplate around the topology socket declarations, Aggrega splits validation into two parts and bridges them at compile time:

1. **`usesSchema` (declarative YAML).** Defines and enables the topology. The `usesSchema` keys are the only valid socket names a developer may use in `uses` blocks — a catalog entity without `usesSchema` cannot accept `uses` declarations. The Go CLI natively reads this to extract `x-aggrega-selector:` strings for Step 4 label matching and to validate allowed `inject` mechanisms. Each socket entry supports an optional `required: true` field (default `false`) — when set, the compiler emits a validation error if no dependency is declared in that socket. This is the soft equivalent of the `required: true` semantics on `secretsSchema` entries.
2. **Desugaring.** If developers use the YAML array shorthand (`uses: databases: ["db1"]`), the CLI normalizes it into a map (`{"db1": {"target": "db1"}}`).
3. **Bridge synthesis.** The compiler walks each socket entry and emits a JSON Schema 2020-12 fragment with `x-aggrega-selector:` and `x-aggrega-inject:` extension keywords. The selector string from the YAML is preserved at the `x-aggrega-selector:` annotation for traceability — JSON Schema validation ignores extension keywords during structural validation, but the Go compiler extracts them programmatically in Step 4 for native label matching.
4. **Composition.** The Ops engineer writes a strict `schema:` declaration (compact form or full JSON Schema 2020-12) defining `values`, `infra`, and `provides`. The Go engine composes the synthesized fragment with the user-authored schema via JSON Schema 2020-12 composition; the resulting unified schema validates the entity's instance content. This guarantees perfect cross-pillar validation without requiring the Ops engineer to write any `uses` boilerplate.

**Example bridge synthesis:**
**Step 1: The Platform Architect's YAML**

```yaml
spec:
  usesSchema:
    databases:
      selector: "component.aggrega.ai/type=stateful-server"
      inject: ["env", "file", "ssm_param"] # env and file are core mechanisms; ssm_param is a user-provided mechanism

  schema:
    values:
      ha_mode: { type: boolean, default: false }
    infra:
      replicas: { type: integer, min: 1 }
    provides:
      host: { type: string, required: true }

  assertions: |
    {{- /* Ops can write cross-pillar invariants against the unified instance content */ -}}
    {{- if eq .values.ha_mode true -}}
      {{- if lt (len .uses.databases) 2 -}}
        {{- fail "ha_mode=true requires at least two database attachments" -}}
      {{- end -}}
    {{- end -}}
```

**Step 2: The compiler-synthesized JSON Schema fragment**

```yaml
uses:
  type: object
  properties:
    databases:
      type: object
      additionalProperties:
        type: object
        properties:
          target: { type: string }
          inject:
            type: object
            properties:
              env: { type: object, valuesType: string }
              file: { type: object, valuesType: string }
              ssm_param: { type: object, valuesType: string }
            additionalProperties: false
      x-aggrega-selector: "component.aggrega.ai/type=stateful-server"
```

**Step 3: Composition**
The compiler composes the synthesized fragment with the user-authored `schema:` to produce the unified validation schema. The Static Analyzer (Step 4) reads `x-aggrega-selector:` from the synthesized fragment + `appliesTo` / `appliesToExpressions` / `appliesToAnyOf` from the Feature entities, and evaluates label matching against each target's `metadata.labels` to validate cross-node type safety.

### Kubernetes-Style Selectors in usesSchema

The Go compiler's native label-matching engine evaluates selector strings using standard Kubernetes-style selection semantics (`AND` via comma, `OR` via `in()`, `NOT` via `!=`/`notin()`). This same engine also evaluates the structured selectors on Feature catalog entities (`appliesTo`, `appliesToExpressions`, `appliesToAnyOf`). The selector layer is strictly the topology gate — the per-pillar `schema:` declarations validate `values`, `infra`, and `provides` content independently. After the Go compiler draws the topological edges in Step 2, the Static Analyzer (Step 4) extracts the `selector` strings from the synthesized JSON Schema fragment's `x-aggrega-selector:` annotation and evaluates them against the target node's Catalog `labels` to validate cross-node type safety.

```yaml
usesSchema:
  # 1. The AND Operator (Comma)
  databases:
    selector: "component.aggrega.ai/type=stateful-server, compliance.aggrega.ai/data-class=restricted"
  
  # 2. The OR Operator (Set-based 'in')
  datastores:
    selector: "datastore.aggrega.ai/engine in (relational, vector)"
  
  # 3. The NOT Operator
  internal_systems:
    selector: "compliance.aggrega.ai/data-class!=public"
```

### 3. Schema Formats and Composition

To provide both strict validation and standard catalog metadata (author, version, description), Domain 2 (Interfaces) and Domain 3 (Implementations) definitions are written as YAML envelopes. Domain 2 utilises embedded `schema:` declarations expressed in compact form (the default; ~15 keywords, mechanically transformed to JSON Schema 2020-12) or in full JSON Schema YAML.

**Why every catalog YAML repeats the envelope.** The envelope (`apiVersion`, `kind`, `metadata` block) appears at the top of every catalog file — Component, Feature, Recipe, FeatureRecipe, Aggregate, Manifest, Release, Provider — regardless of how short the body is. The repetition is deliberate: each file is designed to parse, validate, lint, and inspect as a standalone artefact. A single file pulled from the OCI registry, dropped into a CI sandbox, or opened in a third-party editor must carry enough self-description that downstream tooling can identify what kind of entity it represents and which schema version applies. Catalog-relative-path inference (where the directory location implies the entity kind and the envelope could be omitted) is not implemented today — every parser, validator, and linter consumes the envelope explicitly. The cost is mechanical boilerplate per file; the benefit is that the standalone-tooling guarantee holds across the OCI distribution surface, the local filesystem, and the IDE / CI / inspect surfaces. Authors copy the envelope from existing files when authoring new catalog content; future scaffolders are expected to ship the boilerplate as starter templates.

To maintain the DRY (Don't Repeat Yourself) principle, the Catalog employs two distinct composition mechanisms:

* **Shared SchemaLibrary entries (cross-document `$ref:`):** Reusable JSON Schema definitions are stored in SchemaLibrary catalog entities (Tier 3). They are referenced via cross-document `$ref:` URLs (`oci://hub.aggrega.ai/schema-library/<namespace>/<name>@<version>#/schemas/<entry>`) from any consumer Component or Feature schema. The compactform compiler walks the chain at compile time via resolution-stack threading; each property in the resolved shape carries an `x-aggrega-source` annotation attributing it to the immediate-parent library entry. See [entities/schemalibrary](../language-reference/entities/schemalibrary.md) for the library entity's authoring shape and [vocabulary/cross-document-ref](../language-reference/vocabulary/cross-document-ref.md) for the resolution semantics.
* **Single Inheritance (`extends`):** For complete component baselines, entities can use the `extends: "URI"` property. The Go compiler recursively fetches the parent, performing a **Two-Tiered Merge**: it deep-merges the YAML metadata (overwriting labels on conflict and appending arrays) and composes the schemas under JSON Schema 2020-12 composition. The publishing-discipline policy plugin enforces monotonic narrowing on the composed result at publish time — child schemas may narrow parent constraints but cannot relax them. See [entities/component](../language-reference/entities/component.md) for the base-and-child component extension examples + [governance-and-compliance §"Inheritance and policy narrowing"](11-governance-and-compliance.md#inheritance-and-policy-narrowing) for the narrowing enforcement mechanism.

See [entities/component](../language-reference/entities/component.md) for the base-and-child component extension examples, and [entities/recipe](../language-reference/entities/recipe.md) for Recipe pointer-and-mapper authoring with complete examples.

### 4. The Workspace Config (`aggrega.yaml`)

The `aggrega.yaml` file at the project root is the project's workspace configuration. It is **committed to Git** (it is the equivalent of `go.mod` or `package.json`). The `.aggrega/` directory is **gitignored** (it is the equivalent of `node_modules/` or `.terraform/`).

All fields are optional with sensible defaults:

```yaml
# aggrega.yaml
workspace:
  catalog_dirs:               # Ordered list of local catalog directories (checked before cache)
    - ./aggrega-catalog       # Default
  cache_dir: .aggrega/oci-cache  # Default OCI artifact cache
  default_registry: hub.aggrega.ai  # Default registry for unqualified URIs
  offline: false              # Default; set to true for air-gapped environments
```

The `catalog_dirs` list supports monorepo setups where a shared catalog lives in a sibling directory. The compiler checks each directory in sequence. The `offline: true` flag prevents any network access — the compiler only uses local paths and the cache, halting if an entity is not found locally.

The `.aggrega.lock` file at the workspace root records the resolved versions and content digests for every pinned dependency. `aggrega pull` fetches dependencies and writes the lockfile; `aggrega build` reads the lockfile and uses the pinned versions regardless of registry state at build time. The lockfile carries sections per entity kind:

```yaml
# .aggrega.lock
schema_libraries:
  - name: aggrega/datastores
    version: 1.0.0
    digest: sha256:abc123...

mapping_libraries:
  - name: aggrega/bitnami-helpers
    version: 1.0.0
    digest: sha256:def456...

components:
  - name: core/datastore/mariadb
    version: 1.0.0
    digest: sha256:789abc...

recipes:
  - name: core/helm/postgres-bitnami
    version: 1.2.0
    digest: sha256:ghi789...

# ... features, feature-recipes, providers, plugins ...
```

Each pinned entry carries name + version + content-addressable digest. The digest is verified at every fetch; bytes that do not match the pinned digest halt the build with an integrity error.

### 5. The Three-Tier Entity Resolution Model

The compiler resolves every entity reference encountered during compilation through a strict cascading lookup. The three tiers correspond to three authoring workflows that coexist in a healthy Aggrega project: an author iterating on an entity locally, a team consuming a checked-in catalog plus previously-pulled cache, and a production build reaching the registry for an unfetched artifact. The same cascade evaluates `type` fields in Aggregates, URI values in Manifest mappings, `implements` declarations on Recipes and FeatureRecipes, and `plugin` references inside FeatureRecipe pipelines.

**Tier 1 — Explicit local path.** A reference beginning with `./` or `../` (a POSIX relative-path prefix) is read directly from disk relative to the authoring file. No catalog lookup, no registry call. The explicit prefix disambiguates local-path intent from type-name lookup at the syntactic level: an Aggregate writing `type: core/api-server:1.0.0` is unambiguously a type reference; `type: ./local-api-variant` is unambiguously a local file. The resolver never sniffs string content to decide which tier applies — the prefix is the discriminator.

**Tier 2 — Workspace and cache.** A reference without an explicit local-path prefix is searched first against the directories listed in `workspace.catalog_dirs` (project-local catalog trees authored or vendored into the repository — see §4 for the configuration shape) and then against `workspace.cache_dir` (the gitignored `.aggrega/oci-cache/` location holding artifacts pulled from prior Tier 3 resolutions). The cache hit on second-and-subsequent builds is what keeps the inner loop network-free even when the project depends on remote catalog content.

**Tier 3 — Remote OCI registry.** If Tier 2 returns no match, the resolver issues an ORAS-based OCI pull against `workspace.default_registry` (default `hub.aggrega.ai`), unpacks the artifact into the cache for subsequent builds, and continues with the resolved entity. The OCI URI form the registry call constructs follows the entity-type taxonomy described in §6 (Artifact Packaging & OCI Taxonomy). Shorthand URIs in Aggregates and Manifests are expanded into their full OCI form before the Tier 3 call; the inference rules driving that expansion live at the Manifest's [Context-Aware Shorthand URIs](../language-reference/entities/manifest.md) reference and §8 below.

**Precedence and shadowing.** Resolution precedence is strictly Tier 1 > Tier 2 > Tier 3. A local file with the same name as a registry entity shadows the registry entity — this is intentional and lets catalog authors experiment with modifications before publishing. The same shadowing applies between `catalog_dirs` and the cache: an entity present in a workspace catalog directory is preferred over a cached copy, ensuring local edits to a vendored catalog take effect immediately.

**Air-gapped builds.** Setting `workspace.offline: true` (§4) skips Tier 3 entirely. A reference that fails to resolve in Tier 1 or Tier 2 surfaces a missing-entity error rather than silently attempting a network call, which gives CI pipelines that legally cannot reach the network a deterministic fail-fast contract.

**Where the cascade operates.** The cascade fetches the entity into memory; further resolution mechanics layered on top — the Manifest's two-tier `type` vs `name` lookup, the `implements` three-form version matching (exact / major-compatible range / unversioned) at [vocabulary/inheritance-and-interface](../language-reference/vocabulary/inheritance-and-interface.md), and the per-axis Recipe selection by provider and component instance — operate on entities the resolver has already pulled through this cascade.

### 6. Artifact Packaging & The OCI Taxonomy (Provider as Namespace)

Aggrega treats infrastructure logic the same way Docker treats container images, utilizing Open Container Initiative (OCI) standards via ORAS (OCI Registry As Storage). Users can host their Aggrega catalog on any standard registry (GHCR, AWS ECR, Aggrega Hub).

Because Recipes are strictly **1:1 with a physical execution engine** — a single Recipe cannot target multiple providers — the cleanest way to organize them in an OCI registry is to use the **Provider as the Namespace**.

The OCI taxonomy covers all entity types. URI segments map 1:1 to filesystem paths and OCI repository names:

* `hub.aggrega.ai/component/core/database/mariadb:1.0.0` — Component, namespace `core`, category `database`
* `hub.aggrega.ai/component/core/server/api-server:1.0.0` — Component, namespace `core`, category `server`
* `hub.aggrega.ai/feature/core/data-masking:1.0.0` — Feature, namespace `core` (flat, no categories)
* `hub.aggrega.ai/aggregate/core/db-module:1.0.0` — Reusable Aggregate module
* `hub.aggrega.ai/recipe/helm/mariadb-bitnami:1.0.0` — Recipe, provider `helm`
* `hub.aggrega.ai/recipe/terraform/mariadb-rds:1.0.0` — Recipe, provider `terraform`
* `hub.aggrega.ai/recipe/compose/mariadb:1.0.0` — Recipe, provider `compose`
* `hub.aggrega.ai/feature-recipe/helm/k8s-secret-from-parameter:1.0.0` — FeatureRecipe
* `hub.aggrega.ai/schema-library/aggrega/datastores:1.0.0` — SchemaLibrary, shared schema definitions
* `hub.aggrega.ai/mapping-library/aggrega/bitnami-helpers:1.0.0` — MappingLibrary, shared Go-template mapping fragments
* `hub.aggrega.ai/plugin/security/lakera-guard:1.0.0` — Wasm plugin

Each kind has a distinct OCI mediatype:

| Entity kind | Mediatype |
| --- | --- |
| Aggregate | `application/vnd.aggrega.aggregate.v1+json` |
| Component | `application/vnd.aggrega.component.v1+json` |
| Feature | `application/vnd.aggrega.feature.v1+json` |
| Recipe | `application/vnd.aggrega.recipe.v1+json` |
| FeatureRecipe | `application/vnd.aggrega.featurerecipe.v1+json` |
| Provider | `application/vnd.aggrega.provider.v1+json` |
| Manifest | `application/vnd.aggrega.manifest.v1+json` |
| Release | `application/vnd.aggrega.release.v1+json` |
| SchemaLibrary | `application/vnd.aggrega.schemalibrary.v1+json` |
| MappingLibrary | `application/vnd.aggrega.mappinglibrary.v1+json` |

The `v1` segment names a major schema version. If a future migration changes the on-the-wire envelope shape for an entity kind, that kind's mediatype version bumps to `v2`; downstream tooling dispatches on the mediatype version.

Recipe names do NOT include the `ops/` prefix or the provider name. The entity type directory and provider directory provide all context needed.

**Naming Convention:** Domain 2 entities (Component, Feature, Aggregate) use `{namespace}/{name}` where the namespace is the vendor/author (`core` = official standard library, `acme` = enterprise). Domain 3 entities (Recipe, FeatureRecipe) use `{provider}/{name}` where the provider is the execution engine. The `ops/` prefix is a legacy naming convention and MUST NOT be used — all Recipes are Domain 3 (Ops) by definition, and the entity type directory (`recipe/`, `feature-recipe/`) already identifies the domain. Recipe names do NOT include the provider name either when it would be redundant with the provider directory.

Recipes utilize the `implements` keyword to bind to the interface they fulfill. The `implements` field supports exact, major-compatible range, or unversioned matching (see [vocabulary/inheritance-and-interface](../language-reference/vocabulary/inheritance-and-interface.md) for `implements` Version Matching).

When an Ops engineer runs `aggrega push`, the CLI bundles the entity YAML and its associated source files into an immutable `.tar.gz` package. The compiler downloads this tarball via the Three-Tier Resolution Model, extracts it, and caches it in `.aggrega/oci-cache/` locally.

### 7. The Recipe Architecture: Pointers and Mappers

See [entities/recipe](../language-reference/entities/recipe.md) for the complete Recipe authoring surface — `source:` (pointer), `valuesMapping:` (mapper, with three authoring modes: inline block scalar, file `$import:`, library `$import:` to a MappingLibrary entry), Wasm-driven source schemas, native IaC support, and worked examples.

### 8. The Default Registry & Context-Aware Shorthand URIs

To eliminate YAML bloat, the compiler resolves shorthand URIs context-aware against the schema position in which they appear. The default registry is configured in `aggrega.yaml` (defaulting to `hub.aggrega.ai`).

Shorthand URIs resolve context-aware against the Manifest; see [`../language-reference/entities/manifest.md`](../language-reference/entities/manifest.md) §Context-Aware Shorthand URIs for the specific inference rules.

### 9. Lockfile pinning and artifact immutability

Lockfile-pinning discipline anchors every dependency to a specific content-addressable artifact. At first lockfile-resolve (`aggrega pull`), the resolver consults the registry, picks a version per the URI's three-form constraint (exact / range / unversioned), and writes the pinned version + digest into `.aggrega.lock`. Subsequent `aggrega build` invocations use the pinned values regardless of registry mutability; new versions can be published without affecting the existing lockfile.

The pinning model carries one load-bearing rule: once a `name:version` is published to a registry and resolves to digest `D`, that mapping is permanent. **Republishing the same `name:version` with different content is rejected at push time.** The publishing-discipline policy plugin enforces this rule on every `aggrega push`: it fetches the existing artifact at `name:version` from the target registry; if present and the digest matches the content about to be pushed, the push is an idempotent no-op; if present and the digest differs, the push halts with an immutability-violation error citing both digests.

Immutability matters for two consequences:

1. **Lockfile pins are honest.** When the lockfile records `mariadb:1.0.0` at digest `D`, a build that fetches by digest receives `D`'s bytes. Without immutability, a registry-side mutation could replace `D`'s bytes underneath the lockfile pin, undermining lock-time-to-build-time stability. Reproducible builds rest on this guarantee.
2. **Post-publication metadata changes have a clear pathway.** Marking a published version as deprecated, rotating signing keys, or amending attestations cannot be done by mutating the published artifact (the rule forbids it). It must be done by publishing a new patch version or a sidecar artifact recording the metadata change separately. Either pathway is auditable — a new version or sidecar appears as a distinct registry entry — and neither alters the bytes of the original artifact.

The immutability rule applies uniformly to every OCI-published Aggrega artifact (entities, SchemaLibrary, MappingLibrary, Wasm plugins referenced by Recipe `pipeline[].plugin:` / FeatureRecipe `pipeline[].plugin:` / Provider `plugin:` / workspace config `plugins.{mutator,policy,linter,importer}[]:`). Anything pinned by `name:version` plus a content digest in the lockfile is subject to immutability.

Workspace configuration permits a forensic opt-out:

```yaml
# .aggrega-config.yaml — lint section
lint:
  publishing_discipline:
    enforce_immutability: true   # default true; required for production catalogs
```

Setting `enforce_immutability: false` is logged at every push and surfaced in audit reports. The setting exists so a workspace operator can reproduce historical builds where overwrites occurred prior to the rule's introduction; routine use is discouraged.

Re-resolution to a newer version requires explicit user action (`aggrega catalog upgrade <URI>` for a single URI; `aggrega catalog upgrade --all` for all dependencies per the original form's constraint). Range-form and unversioned-form dependencies re-resolve to the latest matching version; exact-form pins do not move unless the user explicitly upgrades to a different exact version. The lockfile is the source of truth for builds; the user-typed form expresses the version constraint at authoring time.

### 10. Catalog entity name-shape enforcement

Catalog entity names follow per-entity-kind patterns documented at [`../language-reference/02-naming-conventions.md`](../language-reference/02-naming-conventions.md) "Catalog Entity Naming" and detailed in the per-entity reference pages at [`../language-reference/entities/`](../language-reference/entities/). The `metadata.name` field a catalog YAML declares is not always identical to the entity's canonical reference URI: Component and Feature embed namespace and grouping segments directly in `metadata.name`; Recipe, FeatureRecipe, and Provider declare a leaf-only `metadata.name` and the canonical URI is constructed at catalog load from the entity's filesystem path under `<catalog-root>/<kind>/...` plus the leaf; SchemaLibrary and MappingLibrary declare a PascalCase token in `metadata.name`.

Per-entity-kind shapes:

* **Component** — three kebab-case segments `{namespace}/{category}/{name}` declared in `metadata.name`. Example: `core/database/postgres`.
* **Feature** — two kebab-case segments `{namespace}/{name}` declared in `metadata.name`. Example: `core/data-masking`.
* **Recipe** — a single kebab-case leaf in `metadata.name` (e.g., `postgres-bitnami`). The canonical reference URI `{provider}/{name}` (per §6 above) is derived at catalog load from the recipe's filesystem path under `<catalog-root>/recipe/<provider>/<name>/recipe.yaml`: the `<provider>` segment of the path and the leaf `metadata.name` combine into the two-segment canonical form. No additional namespace component appears in the canonical Recipe URI.
* **FeatureRecipe** — single kebab-case leaf in `metadata.name` (e.g., `k8s-secret-from-parameter`), symmetric with Recipe. Canonical URI `{provider}/{name}` derived from `<catalog-root>/feature-recipe/<provider>/<name>/recipe.yaml` the same way.
* **Provider** — single kebab-case leaf in `metadata.name` (e.g., `helm`, `compose`, `terraform`). The canonical URI is the leaf itself; the filesystem path `<catalog-root>/provider/<name>.yaml` and the OCI repository name match the `metadata.name` directly.
* **SchemaLibrary** and **MappingLibrary** — a PascalCase single token in `metadata.name` matching `^[A-Z][A-Za-z0-9]*$` (e.g., `BaseComponents`, `AIDatastores`). This pattern is enforced by the JSON Schema envelope itself; structural validation rejects non-conforming names at parse time.

Structural JSON Schema validation enforces the SchemaLibrary and MappingLibrary PascalCase pattern at the envelope. For the other entity kinds (Component, Feature, Recipe, FeatureRecipe, Provider), the JSON Schema for `metadata.name` accepts any non-empty string and the per-entity-kind shapes above are enforced separately by two complementary mechanisms with a single shared regex source-of-truth:

* **Publishing-discipline plugin (publish time): rejects.** `aggrega push` invokes the publishing-discipline plugin, which checks every artifact's `metadata.name` against the per-entity-kind regex. A name that does not match the documented pattern halts the publish with a clear error pointing at the convention documentation.
* **`linter.wasm` (build time): warns.** `aggrega build` invokes `linter.wasm` per the extensibility-page architecture. The build-time linter emits a warning for the same name-shape violations the publishing-discipline plugin rejects:

```text
WARN: catalog/<entity-kind>/<name>: name shape "<invalid-name>"
does not match the documented per-entity-kind pattern. This
catalog will not be publishable to the registry as-authored.
See aggrega-docs/language-reference/02-naming-conventions.md
for documented patterns. (To proceed without warning, set
.aggrega-config.yaml lint.publishing_discipline.allow_nonstandard_names: true)
```

The build-time warning catches the edge case where a CI/CD pipeline succeeds (the rendered K8s / Helm output does not depend on Aggrega entity names), but a subsequent catalog publish fails because the names violate the publishing-discipline rule. Authors see the warning during local development and fix the names before CI deploys broken-state catalogs.

### 11. Annotation-driven Feature expansion

The Manifest's `mappings.features.annotations` block declares bindings between annotation keys and Feature types plus a pillar-grouped routing table (`maps.infra`, `maps.values`) naming the Feature schema properties each annotation may populate. The Step 1 annotation-expansion sub-phase walks Release boundaries outer-to-inner and Aggregate subsystems outer-to-inner, computes effective per-component annotation sets via cascade and override with whole-value and per-subkey null opt-out, and injects synthetic Feature attachments with `Origin: "annotation"` IR provenance. The full binding-shape and authoring teaching live at [`language-reference/entities/manifest.md`](../language-reference/entities/manifest.md) and [`language-reference/providers/well-known-annotations.md`](../language-reference/providers/well-known-annotations.md); this section documents the catalog-load-time and inspect-time mechanics the expansion path relies on.

**Schema compile cache.** Each Feature's `spec.schema.{infra,values}` is compiled once per build into a resolver-context-scoped cache and reused across cascade walks. Repeated per-subkey type validation against the same Feature schema (one cascade scope per component for hundreds of components in a deployment) reads from the cache rather than re-compiling. The cache lifetime is one build; cross-build invalidation is automatic via the resolver context's per-build lifetime.

**Binding-target validation (catalog load).** At catalog load, the compiler walks every Manifest `features.annotations` binding and verifies that every dotted path declared under `maps.infra` and `maps.values` corresponds to a property the referenced Feature's `spec.schema.<pillar>` actually declares. A binding routing to a path the Feature schema does not list halts catalog load with a clear OPS_ERROR naming the binding key, the missing path, the Feature URI, and the source location.

**Schema-pillar-overlap lint (catalog load).** An advisory warning fires when a Feature's `spec.schema` declares the same property name in both `infra` and `values` pillars. The overlap is rarely intentional — same-named properties across pillars confuse authoring intent (which pillar fires when an annotation targets the shared name?) and complicate diagnostic messages. The warning is non-blocking; authors can either rename the property in one pillar or annotate the catalog with an explicit opt-out.

**Binding-map-overlap lint (resolver pass).** An advisory warning fires when a subkey path appears under both `maps.infra` and `maps.values` across the Manifest's bindings. A path appearing in both pillar lists is incoherent — a single annotation subkey cannot route to both pillars simultaneously, and the deterministic tie-breaking the runtime applies (path appearing in both lists routes to infra; Aggregate-side fails side-vs-pillar) is a safety net, not an intended authoring shape. The warning is non-blocking; authors who run with the warning ignored still get a clean build, with the tie-breaking visible in the IR provenance.

**`aggrega inspect` provenance rendering.** The inspect command renders one bracket per Feature attachment recording the source of each populated leaf:

* `[explicit]` — the Feature was attached explicitly via an Aggregate or Release `features:` block.
* `[annotation: <key> from <source>]` — every populated leaf came from the same annotation key. The bracket names the key and the file:line source location.
* Per-leaf brackets — cross-side composition where each populated leaf is rendered with its own source bracket (some `[explicit]`, some `[annotation: <key> from <source>]`). This shape surfaces the IR builder's explicit-wins-per-field merge: when an explicit attachment and an annotation contribution target the same Feature instance on the same Component but write different leaves, both contributions stand on their respective leaves and the inspect output names each leaf's source individually.

The inspect rendering reads the IR's per-pillar `ValuesProvenance` and `InfraProvenance` maps (each `OrderedMap[FieldProvenance]`) — populated during Step 1 expansion alongside the synthetic attachment injection — and emits the bracket form that best summarises the leaves' collective source. The inspect mechanism is the canonical introspection surface for understanding why a given Feature attachment landed on a given Component and where its values came from.

The per-workspace `allow_nonstandard_names: true` opt-out suppresses build-time warnings; it does NOT bypass publishing-discipline rejections (publish-time enforcement remains in force per the discipline). Legitimate edge cases — one-off internal catalogs that will never publish, multi-namespace experiments, special-purpose entities — use the opt-out to silence the build noise without weakening the publishing rule.

The two enforcement modes share the same regex source; updating the convention updates both mechanisms in lockstep.
