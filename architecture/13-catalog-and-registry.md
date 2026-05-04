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
├── cue/                      # SHARED LIBRARIES: Base types imported by schemas
│   └── core/
│       ├── metadata.cue
│       ├── network.cue
│       └── parameter.cue
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

### 2. The Split Schema & Unification Pipeline

To eliminate complex CUE polymorphism boilerplate, Aggrega introduces a split validation engine:

1. **`usesSchema` (Native YAML):** Defines and enables the topology. The `usesSchema` keys are the only valid socket names a developer may use in `uses` blocks — a catalog entity without `usesSchema` cannot accept `uses` declarations. The Go CLI natively reads this to extract `selector` strings for Step 4 label matching and to validate allowed `inject` paradigms. Each socket entry supports an optional `required: true` field (default `false`) — when set, the compiler emits a validation error if no dependency is declared in that socket. This is the soft equivalent of the `required: true` semantics on `secretsSchema` entries.
2. **Desugaring:** If developers use the YAML array shorthand (`uses: databases: ["db1"]`), the CLI normalizes it into a map (`{"db1": {"target": "db1"}}`).
3. **`baseUsesCueSchema` Generation:** The compiler dynamically translates the YAML `usesSchema` into a strict CUE representation in memory (locking down the topology). The `selector` string from the YAML is embedded as a CUE attribute tag for traceability — CUE ignores it during unification, but the Go compiler extracts it programmatically via the CUE SDK's `Attribute()` API in Step 4 for native label matching. *Rule: For each defined edge, the compiler generates:* `[EdgeName]?: { [Name=string]: { target: string @selector("<SELECTOR>"), inject?: { <EACH_ALLOWED_INJECT>: {[string]: string} } } }`.
4. **Unification:** The Ops engineer writes a strict `cueSchema` defining `values`, `infra`, and `provides`. The Go engine evaluates: `finalCue := baseUsesCueSchema & userCueSchema`. This guarantees perfect cross-pillar validation without requiring the Ops engineer to write any `uses` boilerplate.

**Example Pipeline Generation:**
**Step 1: The Platform Architect's YAML**

```yaml
spec:
  usesSchema:
    databases:
      selector: "component.aggrega.ai/type=stateful-server"
      inject: ["env", "file", "ssm_param"] # Agnostic! env and file are core schema, ssm_param is a user provided mechanism

  cueSchema: |
    values: { ha_mode: bool | *false }
    infra: { replicas?: int }
    provides: { host: string }
    
    // Ops CAN write advanced cross-validation which safely unifies with baseUsesCueSchema
    if values.ha_mode == true {
        uses: databases: { _min: len(uses.databases) >= 2 }
    }
```

**Step 2: The Compiler-Generated `baseUsesCueSchema`**

```cue
uses: {
    databases?: {
        [Name=string]: {
            target: string @selector("component.aggrega.ai/type=stateful-server")
            inject?: {
                env?: { [string]: string }
                file?: { [string]: string }
                ssm_param?: { [string]: string }
            }
        }
    }
}
```

**Step 3: Execution**
The compiler executes `baseUsesCueSchema & userCueSchema` to produce the unified structural lock.

### Kubernetes-Style Selectors in usesSchema

The Go compiler's native label-matching engine evaluates selector strings using standard Kubernetes-style selection semantics (`AND` via comma, `OR` via `in()`, `NOT` via `!=`/`notin()`). This same engine also evaluates the structured selectors on Feature catalog entities (`appliesTo`, `appliesToExpressions`, `appliesToAnyOf`). CUE remains completely blind to the routing logic — CUE's role is strictly structural validation of the `values`, `infra`, and `provides` pillars. After the Go compiler draws the topological edges in Step 2, the Static Analyzer (Step 4) extracts the `selector` strings (either directly from the resolved `usesSchema` or from the `@selector()` CUE attribute tag on the generated `baseUsesCueSchema`) and evaluates them against the target node's Catalog `labels` to validate cross-node type safety.

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

To provide both strict validation and standard catalog metadata (author, version, description), Domain 2 (Interfaces) and Domain 3 (Implementations) definitions are written as YAML envelopes. Domain 2 utilizes embedded CUE schemas.

To maintain the DRY (Don't Repeat Yourself) principle, the Catalog employs two distinct composition mechanisms:

* **Shared CUE Libraries (Mixins):** Reusable data structures (like standard model capability definitions) are stored in the `cue/` directory. They are imported directly via OCI URIs into the YAML schemas and unified using the `&` operator.
* **Single Inheritance (`extends`):** For complete component baselines, entities can use the `extends: "URI"` property. The Go compiler recursively fetches the parent, performing a **Two-Tiered Merge**: it deep-merges the YAML metadata (overwriting labels on conflict and appending arrays) and auto-unifies the CUE schemas in memory (`ParentSchema & ChildSchema`).

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

*(Note: `aggrega pull` lockfile mechanics — pinning exact resolved versions and checksums for reproducible builds — are deferred to implementation analysis.)*

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
* `hub.aggrega.ai/plugin/security/lakera-guard:1.0.0` — Wasm plugin

Recipe names do NOT include the `ops/` prefix or the provider name. The entity type directory and provider directory provide all context needed.

**Naming Convention:** Domain 2 entities (Component, Feature, Aggregate) use `{namespace}/{name}` where the namespace is the vendor/author (`core` = official standard library, `acme` = enterprise). Domain 3 entities (Recipe, FeatureRecipe) use `{provider}/{name}` where the provider is the execution engine. The `ops/` prefix is a legacy naming convention and MUST NOT be used — all Recipes are Domain 3 (Ops) by definition, and the entity type directory (`recipe/`, `feature-recipe/`) already identifies the domain. Recipe names do NOT include the provider name either when it would be redundant with the provider directory.

Recipes utilize the `implements` keyword to bind to the interface they fulfill. The `implements` field supports exact, major-compatible range, or unversioned matching (see [vocabulary/inheritance-and-interface](../language-reference/vocabulary/inheritance-and-interface.md) for `implements` Version Matching).

When an Ops engineer runs `aggrega push`, the CLI bundles the entity YAML and its associated source files into an immutable `.tar.gz` package. The compiler downloads this tarball via the Three-Tier Resolution Model, extracts it, and caches it in `.aggrega/oci-cache/` locally.

### 7. The Recipe Architecture: Pointers and Mappers

See [entities/recipe](../language-reference/entities/recipe.md) for the complete Recipe authoring surface — source (pointer), valuesMapping / valuesMappingFile / valuesMappingJsonnet (mapper), Wasm-driven source schemas, native IaC support, Jsonnet evaluation mechanics, and worked examples.

### 8. The Default Registry & Context-Aware Shorthand URIs

To eliminate YAML bloat, the compiler resolves shorthand URIs context-aware against the schema position in which they appear. The default registry is configured in `aggrega.yaml` (defaulting to `hub.aggrega.ai`).

Shorthand URIs resolve context-aware against the Manifest; see [`../language-reference/entities/manifest.md`](../language-reference/entities/manifest.md) §Context-Aware Shorthand URIs for the specific inference rules.
