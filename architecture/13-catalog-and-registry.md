# Catalog and Registry

This chapter defines how the platform scales across the enterprise via the Open Container Initiative (OCI) Catalog, automated bootstrapping factories, and strict WebAssembly (Wasm) plugin guardrails.

## The Aggrega Catalog: Registry Taxonomy and Resolution

The Aggrega compiler relies on a strictly typed, OAM-inspired registry to resolve abstract Developer Intent (Domain 1) into concrete Ops Reality (Domain 3). To support an open, distributed ecosystem while maintaining a seamless developer experience, all schemas, infrastructure bindings, programmable policies, and adapter plugins follow a standardized Open Container Initiative (OCI) URI taxonomy. Because every catalog entity is addressable by URI, the compiler fetches them on demand during compilation. The developer's local workspace contains only their Aggregate and Release files, not a copy of the catalog.

### 1. Core Directory Structure (The Catalog)

An official `aggrega-catalog` repository (and any compliant third-party catalog) is organized to physically enforce the Separation of Concerns. The structure explicitly separates abstract interfaces from their concrete infrastructure implementations.

URI segments map 1:1 to filesystem path segments. Components use a three-segment URI (`{namespace}/{category}/{name}`) where the category segment carries one of 15 cognitive categories — the same word as the component's `component.aggrega.ai/category` label (the 1:1 directory mirror, checked by the publishing linter's `category-matches-directory` rule). Features remain flat (`{namespace}/{name}`) — a small set, growing slowly. Operational ontology classification (`stateful-server`, `server`, etc.) lives in the `component.aggrega.ai/type` label, never in directory structure; cognitive capability labels (`datastore.aggrega.ai/engine`, `agent.aggrega.ai/autonomy`, …) layer behavioral subsets on top. The hub web UI uses labels for filtering and search; categories serve both filesystem navigation and the catalog's browse axis.

```text
aggrega-catalog/
├── README.md
│
├── schemalibrary/            # TIER 3: Reusable JSON Schema 2020-12 definitions
│   │                         # Common shapes (PodResources, PersistenceSpec, etc.)
│   │                         # consumed via $ref: <Library>#/schemas/<name>
│   │                         #   schemalibrary/base-components.yaml
│   │                         #   schemalibrary/networking-primitives.yaml
│   └── ...
│
├── mappinglibrary/           # TIER 3: Reusable Go template fragments
│   │                         # Common valuesMapping helpers consumed via
│   │                         # valuesMapping: { $import: <Library>#/mappings/<name> }
│   │                         #   mappinglibrary/bitnami-helpers.yaml
│   └── ...
│
├── component/                # DOMAIN 2: Abstract Interfaces
│   │                         # URI: {namespace}/{category}/{name}
│   │                         #   type: core/datastore/mariadb:1.0.0
│   │                         #   → component/core/datastore/mariadb.yaml
│   │
│   └── core/                 # "core" = official Aggrega standard library
│       ├── ai-agent/         # AI agent frameworks, platforms, patterns
│       │   ├── anthropic.yaml
│       │   └── pydantic-ai.yaml
│       ├── ai-model/         # model providers and inference runtimes
│       │   ├── openai.yaml
│       │   └── openai-embedding.yaml
│       ├── ai-tool/          # tools agents invoke
│       │   └── browser.yaml
│       ├── ai-pipeline/      # AI data/processing pipelines
│       │   └── base.yaml
│       ├── datastore/        # persistent datastores
│       │   ├── ai-datastore.yaml
│       │   ├── base.yaml
│       │   └── mariadb.yaml
│       ├── gateway/          # API and AI gateways
│       │   └── ai-gateway.yaml
│       ├── compute/          # generic compute primitives
│       │   ├── function.yaml
│       │   ├── server.yaml
│       │   ├── task.yaml
│       │   └── worker.yaml
│       ├── messaging/        # event buses, queues
│       └── storage/          # object/file storage
│                             # (mesh/, network/, observability/, security/,
│                             #  bigdata/, devtool/ are created when their
│                             #  first entity lands)
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
│   │   └── postgres/
│   │       └── recipe.yaml
│   ├── helm-chart/
│   │   └── mariadb/
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

**The 15 Component Categories** (directory name = `component.aggrega.ai/category` label value, 1:1):

| Category | Contains | Typical ontology label(s) |
| --- | --- | --- |
| `ai-agent` | AI agent frameworks, platforms, and patterns | worker, server, resource |
| `ai-model` | Model providers and inference runtimes | server, resource |
| `ai-tool` | Tools agents invoke | function, server, resource |
| `ai-pipeline` | AI data/processing pipelines | worker, task |
| `datastore` | Persistent datastores (relational, vector, document, graph, KV) | stateful-server, resource |
| `gateway` | API and AI gateways | server |
| `mesh` | Service meshes | server |
| `network` | Network primitives | server, resource |
| `messaging` | Event buses, queues, streams | messaging |
| `storage` | Object/file storage, managed cloud resources (no compute) | resource |
| `compute` | Generic compute primitives (server, worker, task, function bases) | server, worker, task, function |
| `observability` | Telemetry, tracing, monitoring | varies |
| `security` | Security and compliance components | varies |
| `bigdata` | Large-scale data processing | varies |
| `devtool` | Developer tooling | varies |

The ontology column carries only the 7 operational primitives — cognitive vocabulary never appears on the `type` axis. The three-axis split: operational `type` (how infrastructure treats the component), cognitive `category` (what it is, mirrored by the directory), and per-role capability labels (behavioral subsets — a Postgres-with-pgvector is `category: datastore` plus `datastore.aggrega.ai/engine: vector`). AI-pure categories carry the `ai-` prefix; dual-use categories appear bare with AI flavor expressed by capability labels. Categories are chosen for how users navigate and browse, not how the compiler classifies — the compiler is blind to all of it. When a component moves to its category directory, the redundant type suffix is stripped (e.g., `openai-model.yaml` → `ai-model/openai.yaml`).

### 2. The Split Schema & Bridge Synthesis Pipeline

To eliminate per-Component boilerplate around the topology socket declarations, Aggrega splits validation into two parts and bridges them at compile time:

1. **`usesSchema` (declarative YAML).** Declares the topology sockets a catalog entity offers, and gives each one a contract. The Go CLI natively reads it to extract `x-aggrega-selector:` strings for label matching during static analysis and to validate allowed `inject` mechanisms. Each socket entry supports an optional `required: true` field (default `false`) — when set, the compiler emits a validation error if no dependency is declared in that socket. This is the soft equivalent of the `required: true` semantics on `featuresSchema` entries. Declaring a socket here is what the standard-library catalog does and remains the better path — but it is not the only way a developer can draw an edge. An Aggregate author may name a socket on their own component that this `usesSchema` does not declare, including on an entity that declares no `usesSchema` at all; such an ad-hoc socket carries no selector, no `inject` allowlist and no per-edge schema, precisely because there is no entry here to carry them. A Feature attachment's `uses` and a Release's per-edge `uses` are not open that way — both may only name a declared socket. See [dependency-resolution §"Domain 2: The Split Schema"](07-dependency-resolution.md) for the full contract and what an ad-hoc socket gives up.
2. **Desugaring.** If developers use the YAML array shorthand (`uses: databases: ["db1"]`), the CLI normalizes it into a map (`{"db1": {"target": "db1"}}`).
3. **Bridge synthesis.** The compiler walks each socket entry and emits a JSON Schema 2020-12 fragment with `x-aggrega-selector:` and `x-aggrega-inject:` extension keywords. The selector string from the YAML is preserved at the `x-aggrega-selector:` annotation for traceability — JSON Schema validation ignores extension keywords during structural validation, but the Go compiler extracts them programmatically during static analysis for native label matching.
4. **Composition.** The Ops engineer writes a strict `schema:` declaration (compact form or full JSON Schema 2020-12) defining `values`, `infra`, and `provides`. The Go engine composes the synthesized fragment with the user-authored schema via JSON Schema 2020-12 composition; the resulting unified schema validates the entity's instance content. This guarantees perfect cross-pillar validation without requiring the Ops engineer to write any `uses` boilerplate.

**Example bridge synthesis:**
**The Platform Architect's YAML**

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

**The compiler-synthesized JSON Schema fragment**

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

**Composition**
The compiler composes the synthesized fragment with the user-authored `schema:` to produce the unified validation schema. The Static Analyzer reads `x-aggrega-selector:` from the synthesized fragment + `appliesTo` / `appliesToAnyOf` from the Feature entities, and evaluates label matching against each target's `metadata.labels` to validate cross-node type safety.

### Kubernetes-Style Selectors in usesSchema

The Go compiler's native label-matching engine evaluates selector strings using standard Kubernetes-style selection semantics (`AND` via comma, `OR` via `in()`, `NOT` via `!=`/`notin()`). This same engine — and the same selector-string grammar — also evaluates the Feature attachment selectors (`appliesTo`, and each item of `appliesToAnyOf`). The selector layer is strictly the topology gate — the per-pillar `schema:` declarations validate `values`, `infra`, and `provides` content independently. After the Go compiler draws the topological edges at topology construction, the Static Analyzer extracts the `selector` strings from the synthesized JSON Schema fragment's `x-aggrega-selector:` annotation and evaluates them against the target node's Catalog `labels` to validate cross-node type safety.

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

**Why every catalog YAML repeats the envelope.** The envelope (`apiVersion`, `kind`, `metadata` block) appears at the top of every catalog file — Component, Feature, Recipe, FeatureRecipe, Aggregate, Manifest, Release, Plugin — regardless of how short the body is. The repetition is deliberate: each file is designed to parse, validate, lint, and inspect as a standalone artefact. A single file pulled from the OCI registry, dropped into a CI sandbox, or opened in a third-party editor must carry enough self-description that downstream tooling can identify what kind of entity it represents and which schema version applies. Catalog-relative-path inference (where the directory location implies the entity kind and the envelope could be omitted) is not implemented today — every parser, validator, and linter consumes the envelope explicitly. The cost is mechanical boilerplate per file; the benefit is that the standalone-tooling guarantee holds across the OCI distribution surface, the local filesystem, and the IDE / CI / inspect surfaces. Authors copy the envelope from existing files when authoring new catalog content; future scaffolders are expected to ship the boilerplate as starter templates.

To maintain the DRY (Don't Repeat Yourself) principle, the Catalog employs two distinct composition mechanisms:

* **Shared SchemaLibrary entries (cross-document `$ref:`):** Reusable JSON Schema definitions are stored in SchemaLibrary catalog entities (Tier 3). They are referenced by identity via cross-document `$ref:` (`<library>#/schemas/<entry>`, host-less — the version comes from the lockfile) from any consumer Component or Feature schema. The compactform compiler walks the chain at compile time via resolution-stack threading; each property in the resolved shape carries an `x-aggrega-source` annotation attributing it to the immediate-parent library entry. See [entities/schemalibrary](../language-reference/entities/schemalibrary.md) for the library entity's authoring shape and [vocabulary/cross-document-ref](../language-reference/vocabulary/cross-document-ref.md) for the resolution semantics.
* **Single Inheritance (`extends`):** For complete component baselines, entities can use the `extends: "URI"` property. The Go compiler recursively fetches the parent and deep-merges the YAML metadata (overwriting labels on conflict and appending arrays). The two catalog kinds then part company on the data pillars. A Feature's `schema:` composes with its base's under JSON Schema 2020-12 composition. An extending Component authors no pillar content at all: it writes the literal marker `schema: inherited` and receives its base's `schema:` block exactly as the base authored it, at every depth of a chain. What such a Component composes instead is structure — its attachment slots (`featuresSchema`), topology sockets (`usesSchema`), self-inject allowlist (`inject`) and named `assertions` all merge along the chain. See [entities/component](../language-reference/entities/component.md) for the base-and-child component extension examples + [governance-and-compliance §"Inheritance and publishing discipline"](11-governance-and-compliance.md#inheritance-and-publishing-discipline) for what inheritance settles by construction and what remains a publishing-discipline rule.

See [entities/component](../language-reference/entities/component.md) for the base-and-child component extension examples, and [entities/recipe](../language-reference/entities/recipe.md) for Recipe pointer-and-mapper authoring with complete examples.

### 4. The Workspace Config (`.aggrega-config.yaml`)

The `.aggrega-config.yaml` file at the workspace root is the project's workspace configuration — the workspace's own declaration, suited to source control the way `go.mod` or `package.json` is. The `.aggrega/` directory is **gitignored** (it is the equivalent of `node_modules/` or `.terraform/`).

The `workspace` section is the root marker: its presence marks the workspace root, and it carries only the root-defining `catalog_dirs`. The remaining settings are top-level — `default_registry`, `offline`, `auto_pull`, and `artifact_cache_dir` — alongside the `build`, `plugins`, `lint`, `parse_cache`, and `concurrency` sections. Every field is optional with documented defaults:

```yaml
# .aggrega-config.yaml
workspace:                    # Root marker; presence marks the workspace root
  catalog_dirs:               # Ordered list of local catalog directories (checked before cache)
    - ./aggrega-catalog
default_registry: hub.aggrega.ai  # Default registry for unqualified URIs
offline: false                # Set true for air-gapped environments
auto_pull: true               # Default; build performs the implicit pull when no lockfile exists
artifact_cache_dir: .aggrega/cache  # On-disk artifact cache root
```

A `signing:` block carries the artifact-signing defaults used by `aggrega push --sign` and `aggrega sign`, at both the top level (global) and per-registry:

```yaml
# .aggrega-config.yaml
signing:                              # Global signing defaults
  fulcio_url: https://fulcio.sigstore.dev    # Keyless certificate authority (defaults to public-good)
  rekor_url: https://rekor.sigstore.dev      # Keyless transparency log (defaults to public-good)
  timestamp_url: https://tsa.example.com/api/v1/timestamp  # Optional RFC3161 timestamp authority (no default; opt-in)
  key_path: ./keys/signing.pem        # Optional: path to a held keyed-key PEM (a pointer, never inline material)
registries:
  - host: hub.example.com
    signing:                          # Per-registry override of the global signing block
      key_path: ./keys/hub.pem
```

Precedence per field is CLI flag > per-registry `signing` > global `signing` > public-good default. Fulcio and Rekor default to the public-good Sigstore instances, so they are optional; `timestamp_url` has no default — the keyless trusted timestamp comes from Rekor's transparency-log inclusion, and an RFC3161 timestamp authority is opt-in (set `timestamp_url`, or `--timestamp-url`, with a full endpoint to enable one). **Security:** the `signing:` block carries no secret material — the OIDC identity token is never a config field (a short-lived secret, supplied only at signing time via the `--identity-token` flag; automatic OIDC-token acquisition is not yet available), and the private key is never inline; `key_path` is a path to a key file. This is the deliberate asymmetry with the verify side, which pins an inline public key but only ever a key path on the sign side.

Mark a root with no vendored catalogs by writing `workspace: {}`. The `catalog_dirs` list supports monorepo setups where a shared catalog lives in a sibling directory. The compiler checks each directory in sequence. The `offline: true` flag prevents any network access — the compiler only uses local paths and the cache, halting if an entity is not found locally. The `build`, `plugins`, `lint`, `parse_cache`, and `concurrency` sections carry the build dials, the Wasm attachment sockets (`governance`, `linter`, `importer`, `providers`, `cli`), the publishing-discipline policy switches, parse-cache tuning, and the daemon's request-dispatch worker-pool size. (`artifact_cache_dir` names the on-disk content cache; `parse_cache` caps the daemon's in-memory parse cache — two distinct caches.)

The `artifact_cache_dir` root carries two parallel subtrees that the future `aggrega pull` command populates uniformly in a single invocation: `<artifact_cache_dir>/entities/<URI-encoded>/<version>/` for catalog entities (Components, Features, Recipes, FeatureRecipes, Plugins) and `<artifact_cache_dir>/source-artifacts/<kind>/<host>/<path>/<version>/<digest-prefix>/` for source artifacts pulled from Recipe / FeatureRecipe `spec.source` fields (Helm charts, compose fragments). Each source-artifact cache slot carries the authoritative `.tgz` archive, a derived `extracted/` directory regenerated on every build read, and a `metadata.yaml` file recording the artifact's `{kind, url, version, digest, mediatype, pulled_at}` identity. The 12-character `<digest-prefix>` segment namespaces the same `{kind, url, version}` re-tagged at different upstream digests into distinct slots.

The lockfile is per-Release: resolving `release.yaml` writes `release.lock` next to it (the Release file's stem plus `.lock`). `aggrega pull` resolves dependencies and writes the lockfile; `aggrega build` reads it and uses the pinned versions regardless of registry state at build time. Workspaces commit the lockfile when build reproducibility across machines matters; after catalog identities or content change, `aggrega pull --upgrade --release <release>` refreshes it. The lockfile records every resolved entity with its URI as authored, the resolved version, the content digest, and the referencing sites:

```yaml
# release.lock
entities:
  - uri: core/datastore/mariadb:1.0.0
    resolved_version: 1.0.0
    digest: sha256:5deeedb9acc1be00d4e0f98e55e01d301a0bcc01d702c015a9d9628ff573650a
    referenced_from:
      - aggregate.spec.components.db.type
  - uri: mariadb-bitnami:1.0.0
    resolved_version: 1.0.0
    digest: sha256:215b54e2da1ce512fcdccff87f6f71daac707bc77e4214b60b946b27a24e483a
    referenced_from:
      - manifest.spec.mappings.components.type.core/datastore/mariadb:1.0.0
generated_at: "2026-06-11T16:48:15Z"
mapping_libraries: []
plugins: []
release: release.yaml
schema_libraries: []
source_artifacts: []
version: 1
```

Each pinned entry carries the URI + resolved version + content-addressable digest. The digest is verified at every fetch; bytes that do not match the pinned digest halt the build with an integrity error.

### 5. The Three-Tier Entity Resolution Model

The compiler resolves every entity reference encountered during compilation through a strict cascading lookup. The three tiers correspond to three authoring workflows that coexist in a healthy Aggrega project: an author iterating on an entity locally, a team consuming a checked-in catalog plus previously-pulled cache, and a production build reaching the registry for an unfetched artifact. The same cascade evaluates `type` fields in Aggregates, URI values in Manifest mappings, `implements` declarations on Recipes and FeatureRecipes, and `plugin` references inside FeatureRecipe pipelines.

**Tier 1 — Explicit local path.** A reference beginning with `./` or `../` (a POSIX relative-path prefix) is read directly from disk relative to the authoring file. No catalog lookup, no registry call. The explicit prefix disambiguates local-path intent from type-name lookup at the syntactic level: an Aggregate writing `type: core/api-server:1.0.0` is unambiguously a type reference; `type: ./local-api-variant` is unambiguously a local file. The resolver never sniffs string content to decide which tier applies — the prefix is the discriminator.

**Tier 2 — Workspace and cache.** A reference without an explicit local-path prefix is searched first against the directories listed in `workspace.catalog_dirs` (project-local catalog trees authored or vendored into the repository — see §4 for the configuration shape) and then against `artifact_cache_dir` (the gitignored `.aggrega/cache/` location holding artifacts pulled from prior Tier 3 resolutions, split into `entities/` and `source-artifacts/` subtrees per §4). The cache hit on second-and-subsequent builds is what keeps the inner loop network-free even when the project depends on remote catalog content.

**Tier 3 — Remote OCI registry.** If Tier 2 returns no match, the resolver issues an ORAS-based OCI pull against `default_registry` (default `hub.aggrega.ai`), unpacks the artifact into the cache for subsequent builds, and continues with the resolved entity. The OCI URI form the registry call constructs follows the entity-type taxonomy described in §6 (Artifact Packaging & OCI Taxonomy). Shorthand URIs in Aggregates and Manifests are expanded into their full OCI form before the Tier 3 call; the inference rules driving that expansion live at the Manifest's [Context-Aware Shorthand URIs](../language-reference/entities/manifest.md) reference and §8 below.

**Precedence and shadowing.** Resolution precedence is strictly Tier 1 > Tier 2 > Tier 3. A local file with the same name as a registry entity shadows the registry entity — this is intentional and lets catalog authors experiment with modifications before publishing. The same shadowing applies between `catalog_dirs` and the cache: an entity present in a workspace catalog directory is preferred over a cached copy, ensuring local edits to a vendored catalog take effect immediately.

Within Tier 2, `catalog_dirs` is an ordered **first-win precedence stack**. When the same entity identity appears in more than one listed catalog directory, the earlier-listed directory wins and the later occurrence is shadowed — overridden, not loaded, and not an error. This lets a project layer its own catalog directory ahead of a shared or vendored one and override selected entities by identity, while the rest fall through to the shared directory. The override is observable: the resolution detail reports which directory won and which was shadowed, so a layering is never silent. Shadowing applies only *across* directories; two files in a *single* directory that claim the same identity are an authoring mistake and halt the load. Because precedence follows the author-controlled directory order, the resolved set is deterministic.

**Air-gapped builds.** Setting `offline: true` (§4) skips Tier 3 entirely. A reference that fails to resolve in Tier 1 or Tier 2 surfaces a missing-entity error rather than silently attempting a network call, which gives CI pipelines that legally cannot reach the network a deterministic fail-fast contract.

**Where the cascade operates.** The cascade fetches the entity into memory; further resolution mechanics layered on top — the Manifest's two-tier `type` vs `name` lookup, the `implements` three-form version matching (exact / major-compatible range / unversioned) at [vocabulary/inheritance-and-interface](../language-reference/vocabulary/inheritance-and-interface.md), and the per-axis Recipe selection by provider and component instance — operate on entities the resolver has already pulled through this cascade.

### 6. Artifact Packaging & The OCI Taxonomy (Provider as Namespace)

Aggrega treats infrastructure logic the same way Docker treats container images, utilizing Open Container Initiative (OCI) standards via ORAS (OCI Registry As Storage). Users can host their Aggrega catalog on any standard registry (GHCR, AWS ECR, Aggrega Hub).

Because Recipes are strictly **1:1 with a physical execution engine** — a single Recipe cannot target multiple providers — the cleanest way to organize them in an OCI registry is to use the **Provider as the Namespace**.

The OCI taxonomy covers all entity types. URI segments map 1:1 to filesystem paths and OCI repository names:

* `hub.aggrega.ai/component/core/datastore/mariadb:1.0.0` — Component, namespace `core`, category `datastore`
* `hub.aggrega.ai/component/core/compute/api-server:1.0.0` — Component, namespace `core`, category `compute`
* `hub.aggrega.ai/feature/core/data-masking:1.0.0` — Feature, namespace `core` (flat, no categories)
* `hub.aggrega.ai/aggregate/core/db-module:1.0.0` — Reusable Aggregate module
* `hub.aggrega.ai/recipe/helm/mariadb-bitnami:1.0.0` — Recipe, provider `helm`
* `hub.aggrega.ai/recipe/helm-chart/mariadb:1.0.0` — Recipe, provider `helm-chart`
* `hub.aggrega.ai/recipe/compose/mariadb:1.0.0` — Recipe, provider `compose`
* `hub.aggrega.ai/feature-recipe/helm/k8s-secret-from-parameter:1.0.0` — FeatureRecipe
* `hub.aggrega.ai/schema-library/aggrega/datastores:1.0.0` — SchemaLibrary, shared schema definitions
* `hub.aggrega.ai/mapping-library/aggrega/bitnami-helpers:1.0.0` — MappingLibrary, shared Go-template mapping fragments
* `hub.aggrega.ai/plugin/security/lakera-guard:1.0.0` — Wasm plugin

The publishable kinds are the six catalog kinds — Component, Feature, Recipe, FeatureRecipe, SchemaLibrary, and MappingLibrary — plus the Aggregate, a reusable module (publishable whether it is later referenced as a Release's top-level `spec.aggregate` or nested in another Aggregate's `aggregates:` block), and the Plugin, a content-addressed reference to a WebAssembly artifact the compiler routes and the runtime executes. The Plugin is a structural publishable artifact rather than a catalog authoring kind. Release and Manifest are deployment-side inputs that live in source control and are never pushed — `aggrega push` rejects them — so they have no publish mediatype. Each publishable kind has a distinct OCI mediatype:

| Entity kind | Mediatype |
| --- | --- |
| Component | `application/vnd.aggrega.component.v1alpha1+yaml` |
| Feature | `application/vnd.aggrega.feature.v1alpha1+yaml` |
| Aggregate | `application/vnd.aggrega.aggregate.v1alpha1+yaml` |
| Recipe | `application/vnd.aggrega.recipe.v1alpha1+tar+gz` |
| FeatureRecipe | `application/vnd.aggrega.featurerecipe.v1alpha1+tar+gz` |
| SchemaLibrary | `application/vnd.aggrega.schemalibrary.v1+json` |
| MappingLibrary | `application/vnd.aggrega.mappinglibrary.v1+json` |
| Plugin | `application/vnd.aggrega.wasmplugin.v1alpha1+yaml` |

The encoding suffix reflects how each kind ships. Component, Feature, Aggregate, and Plugin are single documents, published as bare YAML (`+yaml`). Recipe and FeatureRecipe bundle their co-located sources — the `source:` tree, `$import:`-referenced templates, and inline `artifacts:` — so they ship as a gzipped tar (`+tar+gz`). SchemaLibrary and MappingLibrary ship as JSON (`+json`). The version segment is `v1alpha1` for the YAML and tar+gz kinds and `v1` for the two libraries; downstream tooling dispatches on the full mediatype string — kind, version, and encoding together.

Recipe names do NOT include the `ops/` prefix or the provider name. The entity type directory and provider directory provide all context needed.

**Naming Convention:** Domain 2 entities (Component, Feature, Aggregate) use `{namespace}/{name}` where the namespace is the vendor/author (`core` = official standard library, `acme` = enterprise). Domain 3 entities (Recipe, FeatureRecipe) use `{capability}/{name}`, where the capability is the execution engine the entity declares in `spec.capability`; a reference may also name the entity bare, as the leaf alone. The `ops/` prefix is a legacy naming convention and MUST NOT be used — all Recipes are Domain 3 (Ops) by definition, and the entity type directory (`recipe/`, `feature-recipe/`) already identifies the domain. Recipe names do NOT include the capability either, since it is already the leading segment of the canonical URI.

Recipes utilize the `implements` keyword to bind to the interface they fulfill. The `implements` field supports exact, major-compatible range, or unversioned matching (see [vocabulary/inheritance-and-interface](../language-reference/vocabulary/inheritance-and-interface.md) for `implements` Version Matching).

When an Ops engineer runs `aggrega push`, the CLI bundles the entity YAML and its associated source files into an immutable `.tar.gz` package. The compiler downloads this tarball via the Three-Tier Resolution Model, extracts it, and caches it in `.aggrega/cache/` locally.

**Searchable manifest annotations.** Every publish stamps a small set of searchable annotations onto the artifact's OCI manifest so a registry index or a catalog browser can filter artifacts by their catalog metadata without fetching and parsing each entity body. Every entity carries its human-readable description (the standard OCI description annotation) plus its catalog category and kind. A Plugin additionally carries its socket type and the capabilities it serves. These annotations are what `aggrega registry update` reads back into the local searchable index (§8).

### 7. The Recipe Architecture: Pointers and Mappers

See [entities/recipe](../language-reference/entities/recipe.md) for the complete Recipe authoring surface — `source:` (pointer), `valuesMapping:` (mapper, with three authoring modes: inline block scalar, file `$import:`, library `$import:` to a MappingLibrary entry), Wasm-driven source schemas, native IaC support, and worked examples.

### 8. The Default Registry & Context-Aware Shorthand URIs

To eliminate YAML bloat, the compiler resolves shorthand URIs context-aware against the schema position in which they appear. The default registry is configured in `.aggrega-config.yaml` (defaulting to `hub.aggrega.ai`).

Shorthand URIs resolve context-aware against the Manifest; see [`../language-reference/entities/manifest.md`](../language-reference/entities/manifest.md) §Context-Aware Shorthand URIs for the specific inference rules.

#### Managing registries

`aggrega registry` manages the registries the workspace knows and their signature trust policy. A registry's identity is its host; the subcommands share one addressing model:

* `aggrega registry add <host>` registers a registry and pins its trust policy, fetching the registry's advertised policy on first contact unless trust flags supply one by hand. An optional `--name <alias>` attaches a friendly alias to the same host-keyed entry — the host stays the identity, and the alias resolves to it wherever a registry is named. An alias is unique across registries.
* `aggrega registry list` prints every configured registry — host, alias, a short trust-posture summary, and a marker on the default — in ascending host order. It reads the resolved configuration and contacts no network.
* `aggrega registry remove <name|host>` drops a registry's trust-policy entry, addressed by its host or its alias. It removes the trust policy only: the `default_registry` pointer is left untouched and the ability to push to that host is unaffected, so the host reverts to default trust rather than becoming unreachable.
* `aggrega registry update` refreshes the local searchable index, described below.

Wherever a registry is named — a `registry` subcommand argument or the `--registry` flag on `aggrega push` and `aggrega push-artifact` — the same resolver interprets the token: a configured alias resolves to its host, and any other token is treated as a host and passed through. An unregistered host is a legitimate destination and is accepted as-is.

#### The local searchable index

`aggrega registry update [<name|host>]` builds a local searchable index of the registries the workspace knows. It walks each configured registry's repositories, selects the highest released version of each, reads that version's searchable manifest annotations (§6), and writes a per-registry index to the artifact cache. With no argument it indexes every configured registry; with a single registry argument (a host or an alias) it indexes only that one.

The index follows the explicit-refresh model familiar from package managers: `registry update` is the command that contacts the registries, and a later `aggrega search` reads the written index offline. A registry's records file is deterministic — two updates against the same registry state produce byte-identical bytes, and the freshness timestamp lives in a sibling file so it never perturbs the records. A repository with no released version, or one that cannot be read, is skipped so a single unreadable repository never abandons the whole index.

### 9. Lockfile pinning and artifact immutability

Lockfile-pinning discipline anchors every dependency to a specific content-addressable artifact. At first lockfile-resolve (`aggrega pull`), the resolver consults the registry, picks a version per the URI's three-form constraint (exact / range / unversioned), and writes the pinned version + digest into the Release's `<release-stem>.lock`. Subsequent `aggrega build` invocations use the pinned values regardless of registry mutability; new versions can be published without affecting the existing lockfile.

The pinning model carries one load-bearing rule: once a `name:version` is published to a registry and resolves to digest `D`, that mapping is permanent. **Republishing the same `name:version` with different content is rejected at push time.** The publishing-discipline policy plugin enforces this rule on every `aggrega push`: it fetches the existing artifact at `name:version` from the target registry; if present and the digest matches the content about to be pushed, the push is an idempotent no-op; if present and the digest differs, the push halts with an immutability-violation error citing both digests.

Immutability matters for two consequences:

1. **Lockfile pins are honest.** When the lockfile records `mariadb:1.0.0` at digest `D`, a build that fetches by digest receives `D`'s bytes. Without immutability, a registry-side mutation could replace `D`'s bytes underneath the lockfile pin, undermining lock-time-to-build-time stability. Reproducible builds rest on this guarantee.
2. **Post-publication metadata changes have a clear pathway.** Marking a published version as deprecated, rotating signing keys, or amending attestations cannot be done by mutating the published artifact (the rule forbids it). It must be done by publishing a new patch version or a sidecar artifact recording the metadata change separately. Either pathway is auditable — a new version or sidecar appears as a distinct registry entry — and neither alters the bytes of the original artifact.

The immutability rule applies uniformly to every OCI-published Aggrega artifact (entities, SchemaLibrary, MappingLibrary, Wasm plugins referenced by Recipe `pipeline[].plugin:` / FeatureRecipe `pipeline[].plugin:` / workspace config `plugins.{governance,linter,importer}[]:`). Anything pinned by `name:version` plus a content digest in the lockfile is subject to immutability.

Workspace configuration permits a forensic opt-out:

```yaml
# .aggrega-config.yaml — lint section
lint:
  publishing_discipline:
    enforce_immutability: true   # default true; required for production catalogs
```

Setting `enforce_immutability: false` is logged at every push and surfaced in audit reports. The setting exists so a workspace operator can reproduce historical builds where overwrites occurred prior to the rule's introduction; routine use is discouraged.

Re-resolution to a newer version requires explicit user action: `aggrega pull --upgrade --release <release> <uri>` re-resolves a single dependency while holding every other pin, and `aggrega pull --upgrade --release <release>` re-resolves all dependencies against the current registry state. Range-form and unversioned-form dependencies re-resolve to the latest matching version; exact-form pins do not move unless the user explicitly upgrades to a different exact version. The lockfile is the source of truth for builds; the user-typed form expresses the version constraint at authoring time.

### 10. Catalog entity name-shape enforcement

Catalog entity names follow per-entity-kind patterns documented at [`../language-reference/02-naming-conventions.md`](../language-reference/02-naming-conventions.md) "Catalog Entity Naming" and detailed in the per-entity reference pages at [`../language-reference/entities/`](../language-reference/entities/). The `metadata.name` field a catalog YAML declares is not always identical to the entity's canonical reference URI: Component and Feature embed namespace and grouping segments directly in `metadata.name`; Recipe and FeatureRecipe declare a leaf-only `metadata.name`, and their canonical two-segment URI pairs that leaf with the `spec.capability` the entity declares; SchemaLibrary and MappingLibrary declare a PascalCase token in `metadata.name`.

Per-entity-kind shapes:

* **Component** — three kebab-case segments `{namespace}/{category}/{name}` declared in `metadata.name`. Example: `core/datastore/postgres`.
* **Feature** — two kebab-case segments `{namespace}/{name}` declared in `metadata.name`. Example: `core/data-masking`.
* **Recipe** — a single kebab-case leaf in `metadata.name` (e.g., `postgres`). The canonical reference URI `{capability}/{name}` (per §6 above) pairs the entity's declared `spec.capability` with that leaf; the leading segment is matched against `spec.capability`, not against the entity's location on disk, so moving a `recipe.yaml` does not change how it is referenced. The standard-library catalog places the entity at `<catalog-root>/recipe/<capability>/<name>/recipe.yaml` so the tree mirrors the coordinate, but that mirroring is a catalog convention rather than the source of the URI. A reference may also name the recipe **bare** — the leaf alone, with no capability segment — which is the dominant form in practice and resolves whenever a single recipe in the catalog carries the name. No additional namespace component appears in a Recipe URI, and a reference carrying a third segment matches no recipe.
* **FeatureRecipe** — single kebab-case leaf in `metadata.name` (e.g., `k8s-secret-from-parameter`), symmetric with Recipe: canonical URI `{capability}/{name}` from the declared `spec.capability` plus the leaf, the bare leaf accepted the same way, and the `<catalog-root>/feature-recipe/<capability>/<name>/recipe.yaml` tree mirroring the coordinate by convention.
* **SchemaLibrary** and **MappingLibrary** — a PascalCase single token in `metadata.name` matching `^[A-Z][A-Za-z0-9]*$` (e.g., `BaseComponents`, `AIDatastores`). For these two kinds the JSON Schema envelope declares the pattern as well, in addition to the check described below.

For Component, Feature, Recipe and FeatureRecipe, the JSON Schema for `metadata.name` accepts any non-empty string, so nothing about the shape is structural for those kinds. Every documented shape — including the two library kinds, whose envelopes also declare their pattern — is checked by the publishing-discipline plugin, which carries the patterns as a regex source-of-truth shared with the compiler distribution.

The check is opt-in: one command performs it, and it only runs when an author asks for it. The two commands most often assumed to perform it do not:

* **`aggrega lint` reports name-shape violations.** The plugin compares each entity's `metadata.name` against the pattern for its kind. The check runs when an author invokes `aggrega lint` — over a single entity, over a Release's dependency closure with `--release`, or over every catalog entity when invoked with no argument — and the same rule set is reachable from the editor-facing tool surface the CLI exposes. Findings are advisory: they are reported at warning severity, and they do not halt.

```text
[warning] name-shape: metadata.name "mariadbSynth" does not match the documented pattern for Recipe entities (^[a-z][a-z0-9-]*$)
```

  The offending file's path prints above the finding, and a whole-catalog run closes with a count of the entities checked and the advisory findings raised.

* **`aggrega build` does not check name shape.** Rendered output does not depend on Aggrega entity names, so a build over a catalog carrying non-conforming names emits no warning and no diagnostic, and succeeds exactly as it would otherwise.
* **`aggrega push` does not check name shape either.** Publishing refuses on other grounds — most notably the immutability rule above, where republishing an existing `name:version` with different content halts. Where a refusal names `aggrega lint --pre-publish`, it is telling the author which command to run; the push does not run it.

Because neither building nor publishing checks the shape, a catalog that wants the convention held to runs `aggrega lint` deliberately — in a pre-commit hook, or as a pipeline step. Note that a name-shape finding is advisory: `aggrega lint` reports it and still exits successfully, so a pipeline that wants to gate on the convention reads the reported findings rather than relying on the exit status.

A per-workspace policy suppresses the rule:

```yaml
# .aggrega-config.yaml — lint section
lint:
  publishing_discipline:
    allow_nonstandard_names: true   # default false
```

With the policy set, the name-shape rule reports nothing at all. It can also be set for a single invocation with `aggrega lint --allow-nonstandard-names`, or forced off again with `--no-allow-nonstandard-names`. Legitimate uses are catalogs that will never be published, multi-namespace experiments, and special-purpose entities.

### 11. Annotation-driven Feature expansion

The Manifest's `mappings.features.annotations` block declares bindings between annotation keys and Feature types plus a pillar-grouped routing table (`maps.infra`, `maps.values`) naming the Feature schema properties each annotation may populate. The annotation-expansion sub-phase of resolution walks Release boundaries outer-to-inner and Aggregate subsystems outer-to-inner, computes effective per-component annotation sets via cascade and override with whole-value and per-subkey null opt-out, and injects synthetic Feature attachments with `Origin: "annotation"` IR provenance. The full binding-shape and authoring teaching live at [`language-reference/entities/manifest.md`](../language-reference/entities/manifest.md) and [`language-reference/providers/well-known-annotations.md`](../language-reference/providers/well-known-annotations.md); this section documents the catalog-load-time and inspect-time mechanics the expansion path relies on.

**Schema compile cache.** Each Feature's `spec.schema.{infra,values}` is compiled once per build into a resolver-context-scoped cache and reused across cascade walks. Repeated per-subkey type validation against the same Feature schema (one cascade scope per component for hundreds of components in a deployment) reads from the cache rather than re-compiling. The cache lifetime is one build; cross-build invalidation is automatic via the resolver context's per-build lifetime.

**Binding-target validation (catalog load).** At catalog load, the compiler walks every Manifest `features.annotations` binding and verifies that every dotted path declared under `maps.infra` and `maps.values` corresponds to a property the referenced Feature's `spec.schema.<pillar>` actually declares. A binding routing to a path the Feature schema does not list halts catalog load with a clear OPS_ERROR naming the binding key, the missing path, the Feature URI, and the source location.

**Schema-pillar-overlap lint (catalog load).** An advisory warning fires when a Feature's `spec.schema` declares the same property name in both `infra` and `values` pillars. The overlap is rarely intentional — same-named properties across pillars confuse authoring intent (which pillar fires when an annotation targets the shared name?) and complicate diagnostic messages. The warning is non-blocking; authors can either rename the property in one pillar or annotate the catalog with an explicit opt-out.

**Binding-map-overlap lint (resolver pass).** An advisory warning fires when a subkey path appears under both `maps.infra` and `maps.values` across the Manifest's bindings. A path appearing in both pillar lists is incoherent — a single annotation subkey cannot route to both pillars simultaneously, and the deterministic tie-breaking the runtime applies (path appearing in both lists routes to infra; Aggregate-side fails side-vs-pillar) is a safety net, not an intended authoring shape. The warning is non-blocking; authors who run with the warning ignored still get a clean build, with the tie-breaking visible in the IR provenance.

**`aggrega inspect` provenance rendering.** The inspect command renders one bracket per Feature attachment recording the source of each populated leaf:

* `[explicit]` — the Feature was attached explicitly via an Aggregate or Release `features:` block.
* `[annotation: <key> from <source>]` — every populated leaf came from the same annotation key. The bracket names the key and the file:line source location.
* Per-leaf brackets — cross-side composition where each populated leaf is rendered with its own source bracket (some `[explicit]`, some `[annotation: <key> from <source>]`). This shape surfaces the IR builder's explicit-wins-per-field merge: when an explicit attachment and an annotation contribution target the same Feature instance on the same Component but write different leaves, both contributions stand on their respective leaves and the inspect output names each leaf's source individually.

The inspect rendering reads the IR's per-pillar `ValuesProvenance` and `InfraProvenance` maps (each `OrderedMap[FieldProvenance]`) — populated during annotation expansion alongside the synthetic attachment injection — and emits the bracket form that best summarises the leaves' collective source. The inspect mechanism is the canonical introspection surface for understanding why a given Feature attachment landed on a given Component and where its values came from.
