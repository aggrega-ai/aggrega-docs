# Catalog and Registry

This chapter defines how the platform scales across the enterprise via the Open Container Initiative (OCI) Catalog, automated bootstrapping factories, and strict WebAssembly (Wasm) plugin guardrails.

## The Aggrega Catalog: Registry Taxonomy and Resolution

The Aggrega compiler relies on a strictly typed, OAM-inspired registry to resolve abstract Developer Intent (Domain 1) into concrete Ops Reality (Domain 3). To support an open, distributed ecosystem while maintaining a seamless developer experience, all schemas, infrastructure bindings, programmable policies, and adapter plugins follow a standardized Open Container Initiative (OCI) URI taxonomy. Because every catalog entity is addressable by URI, the compiler fetches them on demand during compilation. The developer's local workspace contains only their Aggregate and Release files, not a copy of the catalog.

### 1. Core Directory Structure (The Catalog)

An official `aggrega-catalog` repository (and any compliant third-party catalog) is organized to physically enforce the Separation of Concerns. The structure explicitly separates abstract interfaces from their concrete infrastructure implementations.

For Components and Features, URI segments map 1:1 to filesystem path segments. Components use a three-segment URI (`{publisher}/{category}/{name}`) where the category segment carries one of a closed set of cognitive categories — the same word as the component's `component.aggrega.ai/category` label (the 1:1 directory mirror, checked by the publishing linter's `category-matches-directory` rule). Features remain flat (`{publisher}/{name}`) — a small set, growing slowly. Operational ontology classification (`stateful-server`, `server`, etc.) lives in the `component.aggrega.ai/type` label, never in directory structure; cognitive capability labels (`datastore.aggrega.ai/engine`, `agent.aggrega.ai/autonomy`, …) layer behavioral subsets on top. The hub web UI uses labels for filtering and search; categories serve both filesystem navigation and the catalog's browse axis.

The tree below is illustrative in its contents and exact in its shape. Where an entity is drawn in full it runs all the way down to its leaf file, so a whole real path can be read off the diagram: which directory level carries which URI segment, where the mandatory version segment sits, and which filename each entity kind uses at the leaf. It shows a handful of entries per level rather than the catalog's full contents — `...` marks an elision, and the names written beside one are further entries at that same level.

```text
aggrega-catalog/
│
├── schemalibrary/            # TIER 3: Reusable JSON Schema 2020-12 definitions
│   │                         # Shared shapes (BaseComponentParameter,
│   │                         # BaseDatastoreParameter) consumed from a Component or
│   │                         # Feature schema via $ref: <Library>#/schemas/<name>
│   │                         # Path: {name}/{version}/library.yaml
│   │
│   ├── ai-datastores/
│   │   └── 1.0.0/
│   │       └── library.yaml
│   └── base-components/
│       └── 1.0.0/
│           └── library.yaml
│
├── workloadlibrary/          # TIER 3: Reusable Workload template fragments
│   │                         # Shared bodies (StatelessService) consumed from a
│   │                         # Recipe via workload: { $import: <Library>#/workloads/<name> }
│   │                         # Path: {name}/{version}/library.yaml
│   │
│   └── base-workloads/
│       └── 1.0.0/
│           └── library.yaml
│
├── component/                # DOMAIN 2: Abstract Interfaces
│   │                         # URI: {publisher}/{category}/{name}
│   │                         # Path: {publisher}/{category}/{name}/{version}/component.yaml
│   │                         #   type: core/datastore/mariadb:1.0.0
│   │                         #   → component/core/datastore/mariadb/1.0.0/component.yaml
│   │
│   ├── core/                 # "core" = official Aggrega standard library
│   │   ├── ai-agent/         # AI agent frameworks, platforms, patterns
│   │   │   └── ...           # anthropic, crewai, langflow, pydantic-ai, …
│   │   ├── ai-model/         # model providers and inference runtimes
│   │   │   └── ...           # ai21, anthropic, azure-openai, openai, …
│   │   ├── ai-tool/          # tools agents invoke
│   │   │   └── ...           # browser, mcp, search, …
│   │   ├── ai-pipeline/      # AI data/processing pipelines
│   │   │   └── ...           # argo-workflows, temporal
│   │   ├── datastore/        # persistent datastores
│   │   │   ├── mariadb/
│   │   │   │   └── 1.0.0/
│   │   │   │       └── component.yaml
│   │   │   ├── postgres/
│   │   │   │   └── 1.0.0/
│   │   │   │       └── component.yaml
│   │   │   └── ...           # etcd, ferretdb, qdrant, redis, valkey, …
│   │   ├── gateway/          # API and AI gateways
│   │   │   └── ...           # apisix, contour, kong, nginx, …
│   │   ├── compute/          # generic compute primitives
│   │   │   └── ...           # function, keda, server, task, worker, …
│   │   ├── messaging/        # event buses, queues
│   │   │   └── ...           # kafka, nats, rabbitmq, …
│   │   ├── observability/    # metrics, logs, traces
│   │   │   └── ...           # grafana, loki, prometheus, tempo, …
│   │   ├── security/         # identity, secrets, certificates
│   │   │   └── ...           # cert-manager, external-secrets, keycloak, …
│   │   ├── devtool/          # developer-facing tooling
│   │   │   └── ...           # adminer, promptlayer, …
│   │   └── storage/          # object/file storage
│   │       └── minio/
│   │           └── 1.0.0/
│   │               └── component.yaml
│   └── example/              # a second publisher, same three-segment shape
│       └── compute/
│           └── greeter/
│               └── 1.0.0/
│                   └── component.yaml
│
├── feature/                  # DOMAIN 2: Abstract Interfaces
│   │                         # Flat: {publisher}/{name} (no category segment)
│   │                         # Path: {publisher}/{name}/{version}/feature.yaml
│   │                         #   type: core/data-masking:1.0.0
│   │                         #   → feature/core/data-masking/1.0.0/feature.yaml
│   │
│   ├── core/
│   │   ├── data-masking/
│   │   │   └── 1.0.0/
│   │   │       └── feature.yaml
│   │   ├── secret-value/     # feature.aggrega.ai/kind: secret
│   │   │   └── 1.0.0/
│   │   │       └── feature.yaml
│   │   └── ...               # k8s-dns-resolver, public-ingress, retry-policy, …
│   └── ...                   # other publishers, same flat shape
│
├── aggregate/                # DOMAIN 1: Reusable Aggregate Modules
│   │                         # Path: {publisher}/{name}/{version}/aggregate.yaml
│   └── core/
│       ├── keycloak/
│       │   └── 1.0.0/
│       │       └── aggregate.yaml
│       └── ...               # agenta, apisix, dify, harbor, kong, thanos, …
│
├── recipe/                   # DOMAIN 3: Concrete Implementations
│   │                         # Organized by CAPABILITY (the one a Recipe declares
│   │                         # in spec.capability).
│   │                         # Path: {capability}/{name}/{version}/recipe.yaml
│   │                         # The version directory may bundle the Recipe's own
│   │                         # source charts or modules beside recipe.yaml.
│   │                         #   OCI: hub.aggrega.ai/recipe/helm/mariadb:1.0.0
│   │
│   ├── helm/
│   │   ├── mariadb/
│   │   │   └── 1.0.0/
│   │   │       └── recipe.yaml
│   │   └── postgres/
│   │       └── 1.0.0/
│   │           └── recipe.yaml
│   ├── compose/
│   │   └── mariadb/
│   │       └── 1.0.0/
│   │           └── recipe.yaml
│   ├── terraform/
│   │   └── mariadb-rds-module/
│   │       └── 1.0.0/
│   │           ├── recipe.yaml
│   │           └── module/   # bundled Terraform source
│   │               ├── main.tf
│   │               └── variables.tf
│   └── cloudformation/
│       └── postgres-rds/
│           └── 1.0.0/
│               └── recipe.yaml
│
├── feature-recipe/           # DOMAIN 3: Concrete Implementations
│   │                         # Capability leads the path, same as recipes.
│   │                         # Path: {capability}/{name}/{version}/recipe.yaml
│   │
│   ├── helm/
│   │   ├── k8s-secret-from-parameter/
│   │   │   └── 1.0.0/
│   │   │       └── recipe.yaml
│   │   └── public-ingress/
│   │       └── 1.0.0/
│   │           ├── recipe.yaml
│   │           └── chart/    # bundled Helm source
│   │               ├── Chart.yaml
│   │               └── templates/
│   │                   └── ingress.yaml
│   ├── compose/
│   │   └── dotenv-secret/
│   │       └── 1.0.0/
│   │           └── recipe.yaml
│   └── ...                   # terraform, cloudformation
│
└── plugin/                   # ARTIFACTS: Plugin entities, each a content-addressed
    │                         # reference to a Wasm artifact. The compiled artifact
    │                         # is published separately and is not stored here.
    │                         # Path: {pluginType}/{name}/{version}/plugin.yaml
    │
    ├── linter/
    │   └── publishing/
    │       └── 0.5.0/
    │           └── plugin.yaml
    └── provider/             # the directory mirrors metadata.pluginType
        ├── helm/
        │   └── 0.5.0/
        │       └── plugin.yaml
        └── ...               # cloudformation, compose, helm-chart, terraform
```

**The component categories are a closed set**, and that set — not the filesystem — is the category authority. A category value with no entity yet is **reserved vocabulary**: the browse axis stays stable and an author knows where a future component will land, so an empty shelf is correct rather than a vacancy owing an occupant. Because the catalog carries no placeholder files, the directory for such a value is created when its first entity lands.

The authoritative list — every category, what it holds, the operational `type` values its entities typically carry, and which directories exist today — is the [Component Categories](https://github.com/aggrega-ai/aggrega-hub/blob/main/docs/catalog-conventions-and-patches.md#component-categories) section of the catalog conventions guide, published alongside the standard-library catalog it governs.

The `type` axis carries only the operational primitives — cognitive vocabulary never appears on it, and the published Component schema enumerates the values the reserved key takes, so a cognitive word written there is refused when the document loads. The three-axis split: operational `type` (how infrastructure treats the component), cognitive `category` (what it is, mirrored by the directory), and per-role capability labels (behavioral subsets — an entity is `category: datastore` plus whatever `datastore.aggrega.ai/engine` value its own product identity carries, so `core/datastore/qdrant` carries `vector` and `core/datastore/redis` carries `kv`, and both axes are queryable). A capability whose truth depends on what an author configures is not carried in the catalog at all: it is injected at compile time by the governance socket's `label-transform` role, which reads the developer's declared `values`. AI-pure categories carry the `ai-` prefix; dual-use categories appear bare with AI flavor expressed by capability labels. Categories are chosen for how users navigate and browse, not how the compiler classifies — the category vocabulary and the capability labels are ones the compiler matches selectors against and reads no meaning into. When a component moves to its category directory, the redundant type suffix is stripped (e.g., `openai-model.yaml` → `ai-model/openai.yaml`).

### 2. The Split Schema & Bridge Synthesis Pipeline

To eliminate per-Component boilerplate around the topology socket declarations, Aggrega splits validation into two parts and gates each where its subject lives:

1. **`usesSchema` (declarative YAML).** Declares the topology sockets a catalog entity offers, and gives each one a contract. The Go CLI natively reads it to extract the `selector:` strings for label matching during static analysis and to validate allowed `inject` mechanisms. Each socket entry supports an optional `required: true` field (default `false`) — when set, the compiler emits a validation error if no dependency is declared in that socket. This is the soft equivalent of the `required: true` semantics on `featuresSchema` entries. Declaring a socket here is what the standard-library catalog does and remains the better path — but it is not the only way a developer can draw an edge. An Aggregate author may name a socket on their own component that this `usesSchema` does not declare, including on an entity that declares no `usesSchema` at all; such an ad-hoc socket carries no selector, no `inject` allowlist and no per-edge schema, precisely because there is no entry here to carry them. A Feature attachment's `uses` and a Release's per-edge `uses` are not open that way — both may only name a declared socket. See [dependency-resolution §"Domain 2: The Split Schema"](07-dependency-resolution.md) for the full contract and what an ad-hoc socket gives up.
2. **Desugaring.** If developers use the YAML array shorthand (`uses: databases: ["db1"]`), the CLI normalizes it into a map (`{"db1": {"target": "db1"}}`).
3. **Bridge synthesis.** The compiler projects the `featuresSchema:` slot table into a JSON Schema 2020-12 fragment — one property per attachment slot, describing the shape of a fill that may bind it, with an `x-aggrega-inject:` extension keyword on a slot that declares an `inject` allowlist. JSON Schema validation ignores extension keywords during structural validation, and nothing reads one back off the fragment: a check wanting a slot's allowlist reads the slot itself. The `usesSchema:` socket table is projected into no fragment. A socket's `selector:` and `inject:` stay in the typed YAML the Architect wrote and are read from there, and a socket's per-edge `valueSchema:` / `infraSchema:` is wrapped and compiled on its own, with no constraint invented around it.
4. **Composition.** The Ops engineer writes a strict `schema:` declaration (compact form or full JSON Schema 2020-12) defining `values`, `infra`, and `provides`. That declaration is the entity's own contract and is compiled on its own: neither the slot fragment nor the socket table is folded into it. Each surface is checked where its subject lives, so a socket fault is reported against the socket entry the Architect wrote rather than at a path inside the `schema:` block — and the Ops engineer still writes no `uses` boilerplate.

**Example — a socket declaration and what the compiler does with it:**
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

  assertions:
    # Ops can write cross-pillar invariants against the unified instance content.
    ha-mode-needs-two-databases: |
      {{- if eq .values.ha_mode true -}}
        {{- if lt (len .uses.databases) 2 -}}
          {{- fail "ha_mode=true requires at least two database attachments" -}}
        {{- end -}}
      {{- end -}}
```

**What the compiler does with it**
The socket table is read as the typed YAML it is: the `selector:` string goes to the native label-matching engine, and the `inject:` list constrains which delivery mechanisms an edge through that socket may name. The `schema:` block is compiled separately, as the entity's own `values` / `infra` / `provides` contract. The Static Analyzer reads the `selector:` string from the socket entry the Architect wrote — together with `appliesTo` / `appliesToAnyOf` from the Feature entities — and evaluates label matching against each target's `metadata.labels` to validate cross-node type safety.

### Kubernetes-Style Selectors in usesSchema

The Go compiler's native label-matching engine evaluates selector strings using standard Kubernetes-style selection semantics (`AND` via comma, `OR` via `in()`, `NOT` via `!=`/`notin()`). This same engine — and the same selector-string grammar — also evaluates the Feature attachment selectors (`appliesTo`, and each item of `appliesToAnyOf`). The selector layer is strictly the topology gate — the per-pillar `schema:` declarations validate `values`, `infra`, and `provides` content independently. After the Go compiler draws the topological edges at topology construction, the Static Analyzer reads the `selector` strings from the socket entries the Architect authored and evaluates them against the target node's Catalog `labels` to validate cross-node type safety.

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

A selector the engine cannot read as one of its six requirement forms — an empty requirement, a key carrying whitespace or one of `=`, `!`, `(`, `)` and the comma, an unclosed set — halts the build on each edge it guards rather than being read as some other selector. [The selector grammar](../language-reference/vocabulary/modifier-system.md) lists the forms and every refusal.

### 3. Schema Formats and Composition

To provide both strict validation and standard catalog metadata (author, version, description), Domain 2 (Interfaces) and Domain 3 (Implementations) definitions are written as YAML envelopes. Domain 2 utilises embedded `schema:` declarations expressed in compact form (the default; ~15 keywords, mechanically transformed to JSON Schema 2020-12) or in full JSON Schema YAML.

**Why every catalog YAML repeats the envelope.** The envelope (`apiVersion`, `kind`, `metadata` block) appears at the top of every catalog file — Component, Feature, Recipe, FeatureRecipe, Aggregate, Manifest, Release, Plugin — regardless of how short the body is. The repetition is deliberate: each file is designed to parse, validate, lint, and inspect as a standalone artefact. A single file pulled from the OCI registry, dropped into a CI sandbox, or opened in a third-party editor must carry enough self-description that downstream tooling can identify what kind of entity it represents and which schema version applies. Catalog-relative-path inference (where the directory location implies the entity kind and the envelope could be omitted) is not implemented today — every parser, validator, and linter consumes the envelope explicitly. The cost is mechanical boilerplate per file; the benefit is that the standalone-tooling guarantee holds across the OCI distribution surface, the local filesystem, and the IDE / CI / inspect surfaces. Authors copy the envelope from existing files when authoring new catalog content; future scaffolders are expected to ship the boilerplate as starter templates.

To maintain the DRY (Don't Repeat Yourself) principle, the Catalog employs two distinct composition mechanisms:

* **Shared SchemaLibrary entries (cross-document `$ref:`):** Reusable JSON Schema definitions are stored in SchemaLibrary catalog entities (Tier 3). They are referenced by identity via cross-document `$ref:` (`<library>#/schemas/<entry>`, host-less — the version comes from the lockfile) from any consumer Component or Feature schema. The compactform compiler walks the chain at compile time via resolution-stack threading; each property in the resolved shape carries an `x-aggrega-source` annotation attributing it to the immediate-parent library entry. See [entities/schemalibrary](../language-reference/entities/schemalibrary.md) for the library entity's authoring shape and [vocabulary/cross-document-ref](../language-reference/vocabulary/cross-document-ref.md) for the resolution semantics.
* **Single Inheritance (`extends`):** For complete component baselines, entities can use the `extends: "URI"` property. The Go compiler recursively fetches the parent and deep-merges the YAML metadata (overwriting labels on conflict and appending arrays). The two catalog kinds then part company on the data pillars. A Feature's `schema:` composes with its base's under JSON Schema 2020-12 composition. An extending Component authors no pillar content at all: it writes the literal marker `schema: inherited` and receives its base's `schema:` block exactly as the base authored it, at every depth of a chain. What such a Component composes instead is structure — its attachment slots (`featuresSchema`), topology sockets (`usesSchema`), self-inject allowlist (`inject`) and named `assertions` all merge along the chain. See [entities/component](../language-reference/entities/component.md) for the base-and-child component extension examples + [governance-and-compliance §"Inheritance and publishing discipline"](11-governance-and-compliance.md#inheritance-and-publishing-discipline) for what inheritance settles by construction and what remains a publishing-discipline rule.

See [entities/component](../language-reference/entities/component.md) for the base-and-child component extension examples, and [entities/recipe](../language-reference/entities/recipe.md) for Recipe pointer-and-mapper authoring with complete examples.

### 4. The Workspace Config (`.aggrega-config.yaml`)

The `.aggrega-config.yaml` file at the workspace root is the project's workspace configuration — the workspace's own declaration, suited to source control the way `go.mod` or `package.json` is. The `.aggrega/` directory is **gitignored** (it is the equivalent of `node_modules/` or `.terraform/`).

The `workspace` section is the root marker: its presence marks the workspace root, and it carries only the root-defining catalog directories — `catalog_dirs`, and the `releases` map that gives a Release catalog directories of its own. Every other setting sits at the top level. Many are single values; others are sections gathering one concern's settings under a single key. Every field is optional with documented defaults. The complete, current set of top-level keys, each with its type, default and meaning, is generated from the schema at [schema/other/aggrega-config](../language-reference/schema/other/aggrega-config.md); the example below shows the root marker alongside a few of the single-value settings:

```yaml
# .aggrega-config.yaml
workspace:                    # Root marker; presence marks the workspace root
  catalog_dirs:               # Ordered list of local catalog directories (checked before cache)
    - ./aggrega-catalog
default_registry: hub.aggrega.ai  # Default registry for unqualified URIs
offline: false                # Set true for air-gapped environments
auto_pull: true               # Opt in to the implicit pull; the default is false, keeping build read-only
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

Mark a root with no vendored catalogs by writing `workspace: {}`. The `catalog_dirs` list supports monorepo setups where a shared catalog lives in a sibling directory. The compiler checks each directory in sequence. The `offline: true` flag prevents any network access — the compiler only uses local paths and the cache, halting if an entity is not found locally. The sectioned settings each gather one concern. Among them: build-time strictness dials and authoring hints; the workspace-level Wasm attachment sockets (`governance`, `linter`, `importer`, `providers`, `cli`), each taking a list of plugin references; per-rule lint strictness, including the publishing-discipline policy switches; the daemon's parse-cache tuning and its request-dispatch worker-pool size; and the size cap on the machine-wide compiled-module store. Others again carry the signing and signature-trust defaults and the daemon's own behaviour. Every top-level key is documented in full at [schema/other/aggrega-config](../language-reference/schema/other/aggrega-config.md).

Three distinct caches are configurable, and telling them apart is worth a moment because their names are similar and their scopes are not. `artifact_cache_dir` names the per-workspace on-disk content cache described below. `parse_cache` caps the daemon's in-memory parse cache, which lives only as long as the daemon does. `compiled_module_cache` caps the on-disk store of compiled plugin machine code — the one cache that is shared by every workspace on the machine, because a plugin's compiled form depends on the plugin and not on the project using it:

```yaml
# .aggrega-config.yaml — most at home in the global config file, since the store is machine-wide
compiled_module_cache:
  max_bytes: 53687091200      # Default 50 GiB; 0 disables the cap
```

That store is the only one that grows across projects, so it is the only one with a standing size cap. Every invocation that opens the store applies the cap before it compiles anything, removing whole entries oldest-compiled first until the remainder fits. (A build run with `--disable-plugin-cache` compiles into memory instead, so it neither grows the store nor trims it.) Removing an entry costs a later recompile and nothing else, which is what makes the cap safe to lower and safe to apply while other builds are running on the same machine. Set it above what a single build compiles: because the cap is applied before compiling, a cap below one build's own working set makes every build discard and recompile the same modules, and for the same reason the store can sit above the cap between builds and is trimmed again at the start of the next one. `aggrega cache status` reports the store's size, and `aggrega cache evict --max-size` trims it on demand to a cap given on the command line.

The `artifact_cache_dir` root carries three parallel subtrees that one `aggrega pull` invocation populates uniformly, one per class of pinned dependency: `<artifact_cache_dir>/entities/<URI-encoded>/<version>/` for catalog entities (Components, Features, Recipes, FeatureRecipes, Plugins); `<artifact_cache_dir>/source-artifacts/<kind>/<host>/<path>/<version>/<digest-prefix>/` for source artifacts pulled from Recipe / FeatureRecipe `spec.source` fields (Helm charts, compose fragments); and `<artifact_cache_dir>/inputs/sha256/<hex-digest>` for external inputs — the remote documents a provider asks the host for while it renders, such as a `$ref` in a chart's `values.schema.json` that points at a URL. Each source-artifact cache slot carries the authoritative `.tgz` archive, a derived `extracted/` directory regenerated on every build read, and a `metadata.yaml` file recording the artifact's `{kind, url, version, digest, mediatype, pulled_at}` identity. Each entity cache slot carries the published artifact as it was fetched and the OCI manifest it is verified against. The slot of each kind whose document can name a file beside it — a Recipe, a FeatureRecipe, a Component, a Feature — also carries a derived `extracted/` directory holding the files that artifact carries, in a directory named by the artifact's content digest: the document and the files the entity declared where it was published as an archive, and the document alone where it was published as its document (§6). The entity's directory is laid out there from the verified artifact on every read, the same way a source artifact's files are: every file is checked against the artifact, a file changed or added in that directory by hand is discarded rather than read, nothing else under `extracted/` is read, and an artifact that fails verification is refused before anything is laid out. A read rewrites only what differs from the artifact, so builds reading one cache at the same time — requests `aggrega serve` handles side by side, or two commands over one workspace — each find the files they were handed whole. The 12-character `<digest-prefix>` segment namespaces the same `{kind, url, version}` re-tagged at different upstream digests into distinct slots. An external input needs no such slot: it is stored as a single file named by the content digest the lockfile pins it to, so what a later build reads is addressed by the pin rather than by the URL the bytes arrived from — which is what lets that build serve the input with the network denied.

Two further directories may appear beside those three, and neither holds pinned dependency content: `index/` carries the per-registry searchable snapshots `aggrega registry update` writes (§8), and `signatures/` caches each verified signature bundle under its own digest, so a later read re-checks the cached blob against the digest it was recorded under rather than fetching the bundle again.

`artifact_cache_dir` is written relative to the workspace root, and it means the same directory no matter which directory a command is invoked from or which catalog directories are being scanned. An absolute value is refused when the configuration loads, with a diagnostic naming the field: every reader of the setting resolves it against the workspace root, so an absolute path would name a location none of them reach, and the failure would otherwise be silent — the cache a pull writes would quietly stop being the cache a build reads. The cache is free to sit inside a catalog directory, and in the default layout it does, since a catalog directory is commonly the workspace root itself. What it must not do is *be* a catalog directory: a catalog scan steps over the cache, so a cache directory that is also a catalog directory takes that directory's entire contents out of every scan. `artifact_cache_dir: .` names the workspace root, which in the default layout is exactly that, and it is refused when the configuration loads with a diagnostic naming the field — as is any other spelling that reduces to the workspace root. Those two shapes, together with the absolute path above, are the ones the configuration check can recognise on its own. A value naming some other catalog directory — `sub`, in a workspace whose `catalog_dirs` lists `sub` — loads without complaint, and the only symptom is that the entities under it stop being found. Keeping the cache out of every directory listed in `workspace.catalog_dirs` is therefore part of writing the configuration rather than something it checks for you.

Stepping over the cache is what keeps a resolution artifact from being read as though an author had written it. A cache slot holds bytes a registry fetch placed there, stored under the coordinate they were fetched at and vouched for by a lockfile digest; a scan that picked one up as authored catalog content would be taking bytes nothing has verified, on a path the author cannot edit. One consequence is worth stating plainly: if the cache holds an entity that no lockfile pins — left behind by an interrupted pull, copied in by hand, or stranded when a Release stopped referencing it — that entity is not visible to a catalog scan, and a build or validation that depends on it halts saying the entity was not found. The remedy is to pull the Release again, so the entity is resolved through the lockfile and its digest is recorded; the halt names the entity so the missing pin can be identified. The alternative — resolving it anyway — is the unverified read that stepping over the cache exists to prevent.

The lockfile is per-Release: resolving `release.yaml` writes `release.lock` next to it (the Release file's stem plus `.lock`). `aggrega pull` resolves dependencies and writes the lockfile; `aggrega build` reads it and uses the pinned versions regardless of registry state at build time. Workspaces commit the lockfile when build reproducibility across machines matters; after an entity, a library, a plugin or the Release itself changes in the workspace, `aggrega pull --release <release>` refreshes it, re-resolving what changed while holding every other pin, and `aggrega pull --upgrade --release <release>` is how a newer version a registry now offers is adopted. The lockfile records every resolved entity with its URI as authored, the resolved version, the content digest, and the referencing sites:

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

Each pinned entry carries the URI + resolved version + content-addressable digest. The digest is verified at every fetch; bytes that do not match the pinned digest halt the build with an integrity error. An entity's digest is taken over what a publication of it carries — its document and every file it declares beside it, each by its path, its bytes and whether it is executable — rather than over the bytes it travels as, so the same entity records the same digest read from a catalog directory or fetched from a registry, however its archive was compressed and whatever permission bits a checkout gave its files. The registry's own digest of the published bytes is what a fetch is checked against first, through the manifest, whose digest a registry-resolved entry records beside its own.

### 5. The Three-Tier Entity Resolution Model

The compiler resolves every entity reference encountered during compilation through a strict cascading lookup. The three tiers correspond to three authoring workflows that coexist in a healthy Aggrega project: an author iterating on an entity locally, a team consuming a checked-in catalog plus previously-pulled cache, and a production build reaching the registry for an unfetched artifact. The same cascade evaluates `type` fields in Aggregates, URI values in Manifest mappings, `implements` declarations on Recipes and FeatureRecipes, and `plugin` references inside FeatureRecipe pipelines.

**Tier 1 — Explicit local path.** A reference beginning with `./` or `../` (a POSIX relative-path prefix) is read directly from disk relative to the authoring file. No catalog lookup, no registry call. The explicit prefix disambiguates local-path intent from type-name lookup at the syntactic level: an Aggregate writing `type: core/api-server:1.0.0` is unambiguously a type reference; `type: ./local-api-variant` is unambiguously a local file. The resolver never sniffs string content to decide which tier applies — the prefix is the discriminator.

**Tier 2 — Workspace and cache.** A reference without an explicit local-path prefix is searched first against the directories listed in `workspace.catalog_dirs` (project-local catalog trees authored or vendored into the repository — see §4 for the configuration shape) — or, for a Release the configuration gives directories of its own under `workspace.releases`, against that Release's — then against the workspace root's `catalog/` directory, and then against `artifact_cache_dir` (the gitignored `.aggrega/cache/` location holding artifacts pulled from prior Tier 3 resolutions, whose subtrees §4 describes). The cache hit on second-and-subsequent builds is what keeps the inner loop network-free even when the project depends on remote catalog content.

**Tier 3 — Remote OCI registry.** If Tier 2 returns no match, the resolver issues an ORAS-based OCI pull against `default_registry` (default `hub.aggrega.ai`), unpacks the artifact into the cache for subsequent builds, and continues with the resolved entity. The OCI URI form the registry call constructs follows the entity-type taxonomy described in §6 (Artifact Packaging & OCI Taxonomy). Shorthand URIs in Aggregates and Manifests are expanded into their full OCI form before the Tier 3 call; the inference rules driving that expansion live at the Manifest's [Context-Aware Shorthand URIs](../language-reference/entities/manifest.md) reference and §8 below.

**Precedence and shadowing.** Resolution precedence is strictly Tier 1 > Tier 2 > Tier 3. A local file with the same name as a registry entity shadows the registry entity — this is intentional and lets catalog authors experiment with modifications before publishing. The same shadowing applies between `catalog_dirs` and the cache: an entity present in a workspace catalog directory is preferred over a cached copy, ensuring local edits to a vendored catalog take effect immediately.

Within Tier 2, `catalog_dirs` is an ordered **first-win precedence stack**. When the same entity identity appears in more than one listed catalog directory, the earlier-listed directory wins and the later occurrence is shadowed — overridden, not loaded, and not an error. This lets a project layer its own catalog directory ahead of a shared or vendored one and override selected entities by identity, while the rest fall through to the shared directory. The override is observable: the resolution detail reports which directory won and which was shadowed, so a layering is never silent. Shadowing applies only *across* directories; two files in a *single* directory that claim the same identity are an authoring mistake and halt the load. Because precedence follows the author-controlled directory order, the resolved set is deterministic.

The workspace root's `catalog/` directory joins that stack at its **end**, not at its head, and only when the directory exists — so anything a project lists wins over it on a collision, and listing one unrelated directory never silently stops it being read. It is skipped when a listed entry already reaches it, since the walk of a listed directory is recursive and a stack naming the workspace root has read it already. Omitting `catalog_dirs` and writing it as an empty list are different statements: omitted, the workspace still reads `catalog/`; written as `[]`, it reads no local catalog at all, which is how a workspace declares it has none.

**Air-gapped builds.** Setting `offline: true` (§4) skips Tier 3 entirely. A reference that fails to resolve in Tier 1 or Tier 2 surfaces a missing-entity error rather than silently attempting a network call, which gives CI pipelines that legally cannot reach the network a deterministic fail-fast contract.

**Where the cascade operates.** The cascade fetches the entity into memory; further resolution mechanics layered on top — the Manifest's two-tier `type` vs `name` lookup, the `implements` three-form version matching (exact / major-compatible range / unversioned) at [vocabulary/inheritance-and-interface](../language-reference/vocabulary/inheritance-and-interface.md), and the per-axis Recipe selection by provider and component instance — operate on entities the resolver has already pulled through this cascade.

### 6. Artifact Packaging & The OCI Taxonomy (Capability as the Leading Segment)

Aggrega treats infrastructure logic the same way Docker treats container images, utilizing Open Container Initiative (OCI) standards via ORAS (OCI Registry As Storage). Users can host their Aggrega catalog on any standard registry (GHCR, AWS ECR, Aggrega Hub).

Because Recipes are strictly **1:1 with a rendering capability** — a Recipe names one capability in `spec.capability` and cannot target two — the cleanest way to organize them in an OCI registry is to put the **capability in the leading repository segment**.

The OCI taxonomy covers all entity types. A repository name is the kind segment — the same lowercase token that kind's mediatype carries — followed by the entity's identity, lowercased throughout:

* `hub.aggrega.ai/component/core/datastore/mariadb:1.0.0` — Component, publisher `core`, category `datastore`
* `hub.aggrega.ai/component/core/compute/api-server:1.0.0` — Component, publisher `core`, category `compute`
* `hub.aggrega.ai/feature/core/data-masking:1.0.0` — Feature, publisher `core` (flat, no categories)
* `hub.aggrega.ai/aggregate/core/db-module:1.0.0` — Reusable Aggregate module
* `hub.aggrega.ai/recipe/helm/mariadb:1.0.0` — Recipe, capability `helm`
* `hub.aggrega.ai/recipe/helm-chart/mariadb:1.0.0` — Recipe, capability `helm-chart`
* `hub.aggrega.ai/recipe/compose/mariadb:1.0.0` — Recipe, capability `compose`
* `hub.aggrega.ai/featurerecipe/helm/k8s-secret-from-parameter:1.0.0` — FeatureRecipe, capability `helm`
* `hub.aggrega.ai/schemalibrary/aidatastores:1.0.0` — SchemaLibrary, shared schema definitions; the PascalCase `metadata.name` `AIDatastores` lowercases into the repository name
* `hub.aggrega.ai/mapping-library/aggrega/bitnami-helpers:1.0.0` — MappingLibrary, shared Go-template mapping fragments
* `hub.aggrega.ai/plugin/provider/helm:0.5.0` — Plugin, socket type `provider` (the `metadata.pluginType` segment)

The publishable kinds span the catalog authoring kinds together with the Aggregate, a reusable module (publishable whether it is later referenced as a Release's top-level `spec.aggregate` or nested in another Aggregate's `aggregates:` block), and the Plugin, a content-addressed reference to a WebAssembly artifact the compiler routes and the runtime executes. The Plugin is a structural publishable artifact rather than a catalog authoring kind. Release and Manifest are deployment-side inputs that live in source control and are never pushed — `aggrega push` rejects them — so they have no publish mediatype. `aggrega push --list-kinds` reports the set the installed binary publishes, one kind per line. Each publishable kind has its own OCI mediatype in each of the two shapes a publication takes:

| Entity kind | Published as its document | Published with the files it declares |
| --- | --- | --- |
| Component | `application/vnd.aggrega.component.v1alpha1+yaml` | `application/vnd.aggrega.component.v1alpha1+tar+gz` |
| Feature | `application/vnd.aggrega.feature.v1alpha1+yaml` | `application/vnd.aggrega.feature.v1alpha1+tar+gz` |
| Recipe | `application/vnd.aggrega.recipe.v1alpha1+yaml` | `application/vnd.aggrega.recipe.v1alpha1+tar+gz` |
| FeatureRecipe | `application/vnd.aggrega.featurerecipe.v1alpha1+yaml` | `application/vnd.aggrega.featurerecipe.v1alpha1+tar+gz` |
| Aggregate | `application/vnd.aggrega.aggregate.v1alpha1+yaml` | — declares no file |
| SchemaLibrary | `application/vnd.aggrega.schemalibrary.v1alpha1+yaml` | — declares no file |
| MappingLibrary | `application/vnd.aggrega.mappinglibrary.v1alpha1+yaml` | — declares no file |
| WorkloadLibrary | `application/vnd.aggrega.workloadlibrary.v1alpha1+yaml` | — declares no file |
| ArtifactLibrary | `application/vnd.aggrega.artifactlibrary.v1alpha1+yaml` | — declares no file |
| Plugin | `application/vnd.aggrega.wasmplugin.v1alpha1+yaml` | — publishes through its own manifest |

**What a publication carries, and so its shape, follows from what the entity declares — not from its kind, and not from what sits in its directory.** A publication carries the entity document and the files the entity itself names beside it: a Recipe's or FeatureRecipe's local `source:` — a directory travels with every file under it that the ignore rules recorded in its `entity.lock` keep — each file its `valuesMapping:`, `workload:` and `artifacts:` entries import with `$import:`, and the `entity.lock` its pin step wrote; and each schema file a Component or Feature imports, every file of an import chain included. Nothing else in the directory travels: a note, a README or a build's output beside the entity is no part of what it publishes, whatever it is called, and does not change the shape it publishes in. An entity that names nothing publishes as its authored document, byte for byte, under its kind's `+yaml` mediatype; one that names a file publishes as a gzipped tar of the document and those files, under its kind's `+tar+gz` mediatype. An Aggregate, a Plugin and the library kinds declare no file beside their document, so they always publish as the document — an Aggregate at a workspace root included, since every path it declares names another entity rather than a file it carries; a Recipe whose content is all inline does too. A remote source is a reference rather than a file, so it carries nothing, though the `entity.lock` recording its pin makes such a Recipe an archive. The version segment of each mediatype is common to every publishable kind, and the encoding segment says which of the two shapes the bytes are. Downstream tooling dispatches on the full mediatype string — kind, version, and encoding together.

**One authored shape names no directory a publication can know: a local source written as a template.** Its directory is picked only once a Release fills the template in, so the entity carries every file in its own directory that its recorded ignore rules keep, so that whichever directory a Release picks has travelled; `aggrega push` says so when it happens. **Carrying only what is named has a cost, and it falls on the consumer**: a file an entity reads and names nowhere does not travel, and it is a consumer's build — not the publisher's push — that meets its absence, naming the path inside its cache slot that is missing.

**Which files of a source directory belong to the entity is decided once, when the entity is pinned, and recorded.** The plugin serving the entity's capability in the author's workspace declares what its ecosystem never ships — a chart plugin's version-control directories and its honouring of a chart's `.helmignore`, a module plugin's `.terraform/` — and the author's `.aggregaignore` beside the entity has the last word. The pin step records that plugin and the composed rules in the `entity.lock`, and the publication, every comparison of the source's pins, the entity's lockfile row and the render all apply the recorded rules rather than asking a plugin again, so what is published is what the author's own build renders, and a changed binding or a newer binary moves no digest until the entity is pinned again. The compiler holds no opinion about any ecosystem: the rules come from the plugin and the author, and the compiler only matches them. A symbolic link among an entity's files is refused rather than followed, since what it points to would travel under its name. [`aggrega pin`](../language-reference/cli/aggrega-pin.md#which-files-ship-with-an-entity) teaches the rules in full.

Recipe names do NOT include the `ops/` prefix or the capability name. The entity type directory and capability directory provide all context needed.

**Naming Convention:** Domain 2 entities (Component, Feature, Aggregate) use `{publisher}/{name}` where the publisher segment names the vendor/author (`core` = official standard library, `acme` = enterprise). Domain 3 entities (Recipe, FeatureRecipe) use `{capability}/{name}`, where the capability is the provider the entity declares in `spec.capability`; a reference may also name the entity bare, as the leaf alone. The `ops/` prefix MUST NOT be used — all Recipes are Domain 3 (Ops) by definition, and the entity type directory (`recipe/`, `feature-recipe/`) already identifies the domain. Recipe names do NOT include the capability either, since it is already the leading segment of the canonical URI.

Recipes utilize the `implements` keyword to bind to the interface they fulfill. The `implements` field supports exact, major-compatible range, or unversioned matching (see [vocabulary/inheritance-and-interface](../language-reference/vocabulary/inheritance-and-interface.md) for `implements` Version Matching).

When an Ops engineer runs `aggrega push`, the CLI publishes the entity in that shape, immutably at its version. A consumer fetches it through the Three-Tier Resolution Model, caches it in `.aggrega/cache/` locally, and lays out what it carries in the entity's cache slot (§4) — the files of an archive, or the document alone.

**A pulled entity reads the files it carries exactly as it reads them beside it in a catalog directory.** The entity is read from its place in that laid-out tree, so a relative `source:` or `$import:` it declares — written out, or produced by a template — resolves inside what was published, and a path that leaves the entity's own directory is refused there just as it is in a catalog directory. Nothing outside the tree is read in its place: not the directory a build runs from, and not a file planted in the cache slot. A Component or Feature whose schema is imported from a file carries that file, so a pulled copy loads the contract that was published and validates the values authored against it exactly as a copy read from a catalog directory does.

Reading the entity back out of a package is the reverse step, and it identifies the entity by what the document **is** rather than by what it is called: the document at the top of the package whose `kind:` is a publishable entity kind. The entity file's name is a catalog convention and not a contract, so `recipe.yaml` is what the standard-library catalog writes rather than what the format requires, and a file carried beside the entity — a chart template, a compose fragment — is not mistaken for it. The rule cannot be the other way round, keyed on the kind the consumer is after: a kind is read *from* the entity, which is inside the package, so at the moment the package must be opened there is no kind to key on. The reading end halts rather than choose when the top of a package holds two entity documents — the package another client produces by packing a whole directory that holds two entities, which would then sit under each of their published coordinates as one artifact. This product's publication cannot produce it, because each entity carries only what it declares, and the publishing end refuses such a directory besides: every kind has a directory of its own except Aggregate, Release and Manifest, and `aggrega pin` and `aggrega push` refuse an entity of any other kind with another entity beside it, while a catalog load, a lint and a build leave the directory alone. What a directory is called is not judged at either end: the `<name>/<version>/` layout is the standard-library catalog's convention.

**A published entity is read through the same step.** A coordinate carries exactly one copy of its entity, in the shape its declarations gave it, and a person looks at it with `aggrega inspect oci://<registry>/<repository>:<tag>` rather than through a readable copy published beside it — so there is no second copy that could come to disagree with the one a build resolves. The command unpacks an archive by the rule above, reads a Plugin's entity from its manifest rather than from the executable published with it, and renders the result as a file of that kind renders; see [Reading a published entity](../language-reference/cli/aggrega-inspect.md#reading-a-published-entity).

**Searchable manifest annotations.** Every publish stamps a small set of searchable annotations onto the artifact's OCI manifest so a registry index or a catalog browser can filter artifacts by their catalog metadata without fetching and parsing each entity body. Every entity carries its human-readable description (the standard OCI description annotation) plus its catalog category and kind. A Plugin additionally carries its socket type and the capabilities it serves. These annotations are what `aggrega registry update` reads back into the local searchable index (§8).

**Every published file is named.** Each file a publication carries is named on the manifest with the standard `org.opencontainers.image.title` annotation, which is the name a generic OCI client writes that file to when it pulls the artifact into a directory. The name says what the file is, and its extension follows the file's media type:

| What is published | The file a generic OCI client writes |
| --- | --- |
| an entity published as its document | `entity.yaml` |
| an entity published with the files it declares | `entity.tar.gz` |
| a Plugin | `entity.yaml`, the entity, beside `entity.wasm`, its executable |
| a signature attached to an artifact | `signature.json` |
| a deprecation marker attached to an artifact | `deprecation.json` |
| a data artifact published with `aggrega push-artifact` | the name given with `--name` |

So `oras pull hub.aggrega.ai/component/core/compute/server:1.0.0 -o ./server` leaves the published entity at `./server/entity.yaml`, byte for byte as it was published. `oras` skips a descriptor that carries no name and still reports success, which is why every descriptor a publication packs carries one. The name is derived from the media type alone, never from the name of the file that was published, so the same bytes published from a differently named file produce the same manifest. An entity published with its files arrives as its package: `entity.tar.gz` names the package, and the entity inside it is found by the rule above rather than by any file name. Aggrega's own resolution never reads these names — it selects each file by its media type and trusts it by its digest — so they are there for every other client.

### 7. The Recipe Architecture: Pointers and Mappers

See [entities/recipe](../language-reference/entities/recipe.md) for the complete Recipe authoring surface — `source:` (pointer), `valuesMapping:` (mapper, with three authoring modes: inline block scalar, file `$import:`, library `$import:` to a MappingLibrary entry), Wasm-driven source schemas, native IaC support, and worked examples.

### 8. The Default Registry & Context-Aware Shorthand URIs

To eliminate YAML bloat, the compiler resolves shorthand URIs context-aware against the schema position in which they appear. The default registry is configured in `.aggrega-config.yaml` (defaulting to `hub.aggrega.ai`).

A registry host has one reading. Each `registries[].host` is written as the host itself — a lowercase host name containing a dot, `localhost`, a single name followed by a port, an IPv4 address, or an IPv6 address in brackets, each with an optional `:port`, and no scheme, path, credentials or capital letters — because that spelling is the key every per-registry trust policy is found under, and the official hub's built-in signature requirement is keyed on `hub.aggrega.ai`. `default_registry` names a host the same way, and may follow it with a repository path, such as `ghcr.io/acme`: everything published through the default then lands under that path, and every short reference resolves under it, while trust is still decided by the host alone. `default_registry` may instead be written as the `name:` of a `registries` entry, and then stands for that entry's host. The name is read once, as the configuration resolves, against the entries in force after every configuration file and the environment, so every reader of the default — publishing, the location binding, signature verification and every trust lookup — reads that one entry's host, and none of them reaches a host spelled like the name; a name followed by a path is refused, since a name stands for an entry rather than a location. A name is matched before a host spelling, and a name two entries carry is refused as ambiguous. The same reading decides three things a pull does with the host: the registry location a host-less catalog identity is bound to, whether the fetched artifact names a registry whose signature is checked at all, and which trust policy that check runs against. A spelling that could reach a registry while missing its policy — capitals, an explicit default HTTPS port, a scheme, credentials, a path on a `registries` entry's host — is refused where it is configured, naming the spelling to write, and so is a single name with no port that names no entry, which is the shape of a catalog identity's first segment rather than of a host. The refusal applies on every layer that can set the value: the configuration file, where the schema states the same shape as a pattern on each `registries[].host`; the `AGGREGA_DEFAULT_REGISTRY` environment variable; and the command line. So every host a configuration can name is one whose artifacts are verified under the policy written for it. The host is judged by its spelling alone; whether the name resolves, or a registry answers there, is runtime state the compiler never fetches. [configuration](../language-reference/cli/configuration.md#how-a-registry-host-is-written) spells out the accepted forms with examples.

Shorthand URIs resolve context-aware against the Manifest; see [`../language-reference/entities/manifest.md`](../language-reference/entities/manifest.md) §Context-Aware Shorthand URIs for the specific inference rules.

#### Managing registries

`aggrega registry` manages the registries the workspace knows and their signature trust policy. A registry's identity is its host; the subcommands share one addressing model:

* `aggrega registry add <host>` registers a registry and pins its trust policy, fetching the registry's advertised policy on first contact unless trust flags supply one by hand. An optional `--name <alias>` attaches a friendly alias to the same host-keyed entry — the host stays the identity, and the alias resolves to it wherever a registry is named. An alias is unique across registries.
* `aggrega registry list` prints every configured registry — host, alias, a short trust-posture summary, and a marker on the default — in ascending host order. It reads the resolved configuration and contacts no network.
* `aggrega registry remove <name|host>` drops a registry's trust-policy entry, addressed by its host or its alias. It removes the trust policy only: the `default_registry` pointer is left untouched and the ability to push to that host is unaffected, so the host reverts to default trust rather than becoming unreachable. A `default_registry` written as the removed entry's name names nothing afterwards, and is refused until it is rewritten.
* `aggrega registry update` refreshes the local searchable index, described below.

Wherever a registry is named — a `registry` subcommand argument or the `--registry` flag on `aggrega push` and `aggrega push-artifact` — the same resolver interprets the token: a configured alias resolves to its host, and any other token is read as the host it names, with a reference's scheme, path and credentials dropped. Where that host becomes something a signing decision is taken against — the destination of `aggrega push` or `aggrega push-artifact`, or the key `aggrega registry add` writes an entry under — it is held to the one reading above and refused, naming the spelling to write, when it is not written that way. An unregistered host that is written that way is a legitimate destination and is accepted.

#### The local searchable index

`aggrega registry update [<name|host>]` builds a local searchable index of the registries the workspace knows. It walks each configured registry's repositories, selects the highest released version of each, reads that version's searchable manifest annotations (§6), and writes a per-registry index to the artifact cache. With no argument it indexes every configured registry; with a single registry argument (a host or an alias) it indexes only that one.

The index follows the explicit-refresh model familiar from package managers: `registry update` is the command that contacts the registries, and a later `aggrega search` reads the written index offline. A registry's records file is deterministic — two updates against the same registry state produce byte-identical bytes, and the freshness timestamp lives in a sibling file so it never perturbs the records. A repository with no released version, or one that cannot be read, is skipped so a single unreadable repository never abandons the whole index.

### 9. Lockfile pinning and artifact immutability

Lockfile-pinning discipline anchors every dependency to a specific content-addressable artifact. At first lockfile-resolve (`aggrega pull`), the resolver consults the registry, picks a version per the URI's three-form constraint (exact / range / unversioned), and writes the pinned version + digest into the Release's `<release-stem>.lock`. Subsequent `aggrega build` invocations use the pinned values regardless of registry mutability; new versions can be published without affecting the existing lockfile.

The pinning model carries one load-bearing rule: once a `name:version` is published to a registry and resolves to digest `D`, that mapping is permanent. **Republishing the same `name:version` with different content is rejected at push time.** `aggrega push` itself enforces this on every publish: it resolves the existing artifact at `name:version` in the target registry; if present and the digest matches the content about to be pushed, the push is an idempotent no-op; if present and the digest differs, the push halts with an immutability-violation error citing both digests.

Immutability matters for two consequences:

1. **Lockfile pins are honest.** When the lockfile records `mariadb:1.0.0` at digest `D`, a build that fetches by digest receives `D`'s bytes. Without immutability, a registry-side mutation could replace `D`'s bytes underneath the lockfile pin, undermining lock-time-to-build-time stability. Reproducible builds rest on this guarantee.
2. **Post-publication metadata changes have a clear pathway.** Marking a published version as deprecated, rotating signing keys, or amending attestations cannot be done by mutating the published artifact (the rule forbids it). It must be done by publishing a new patch version or a sidecar artifact recording the metadata change separately. Either pathway is auditable — a new version or sidecar appears as a distinct registry entry — and neither alters the bytes of the original artifact.

The immutability rule applies uniformly to every OCI-published Aggrega artifact (entities, SchemaLibrary, MappingLibrary, Wasm plugins referenced by Recipe `pipeline[].plugin:` / FeatureRecipe `pipeline[].plugin:` / workspace config `plugins.{governance,linter,importer}[]:`). Anything pinned by `name:version` plus a content digest in the lockfile is subject to immutability.

**Immutability is unconditional, and no configuration relaxes it.** There is no flag and no workspace-config setting that permits an overwrite, because the registry exposes no overwrite path for an operator to opt into. Content that has changed is published under a new version, and `aggrega lint --pre-publish` verifies that the version bump matches the classification of the change.

Re-resolution to a newer version requires explicit user action: `aggrega pull --upgrade --release <release> <uri>` re-resolves a single dependency while holding every other pin, and `aggrega pull --upgrade --release <release>` re-resolves all dependencies against the current registry state. Range-form and unversioned-form dependencies re-resolve to the latest matching version; exact-form pins do not move unless the user explicitly upgrades to a different exact version. The lockfile is the source of truth for builds; the user-typed form expresses the version constraint at authoring time.

### 10. Catalog entity name-shape enforcement

Catalog entity names follow per-entity-kind patterns — enumerated below, and detailed per kind in the reference pages at [`../language-reference/entities/`](../language-reference/entities/). They are a different surface from the instance names a developer writes in an Aggregate or a Release, which share one pattern regardless of kind; that pattern is at [`../language-reference/02-naming-conventions.md`](../language-reference/02-naming-conventions.md#instance-names) "Instance Names". The `metadata.name` field a catalog YAML declares is not always identical to the entity's canonical reference URI: Component and Feature embed publisher and grouping segments directly in `metadata.name`; Recipe and FeatureRecipe declare a leaf-only `metadata.name`, and their canonical two-segment URI pairs that leaf with the `spec.capability` the entity declares; every library kind declares a PascalCase token in `metadata.name`.

Per-entity-kind shapes:

* **Component** — three kebab-case segments `{publisher}/{category}/{name}` declared in `metadata.name`. Example: `core/datastore/postgres`.
* **Feature** — two kebab-case segments `{publisher}/{name}` declared in `metadata.name`. Example: `core/data-masking`.
* **Recipe** — a single kebab-case leaf in `metadata.name` (e.g., `postgres`). The canonical reference URI `{capability}/{name}` (per §6 above) pairs the entity's declared `spec.capability` with that leaf; the leading segment is matched against `spec.capability`, not against the entity's location on disk, so moving a `recipe.yaml` does not change how it is referenced. The standard-library catalog places the entity at `<catalog-root>/recipe/<capability>/<name>/<version>/recipe.yaml` so the tree mirrors the coordinate, but that mirroring is a catalog convention rather than the source of the URI. A reference may also name the recipe **bare** — the leaf alone, with no capability segment — which is the dominant form in practice and resolves whenever a single recipe in the catalog carries the name. No publisher segment appears in a Recipe URI, and a reference carrying a third segment matches no recipe.
* **FeatureRecipe** — single kebab-case leaf in `metadata.name` (e.g., `k8s-secret-from-parameter`), symmetric with Recipe: canonical URI `{capability}/{name}` from the declared `spec.capability` plus the leaf, the bare leaf accepted the same way, and the `<catalog-root>/feature-recipe/<capability>/<name>/<version>/recipe.yaml` tree mirroring the coordinate by convention.
* **The library kinds** — SchemaLibrary, MappingLibrary, WorkloadLibrary and ArtifactLibrary — a PascalCase single token in `metadata.name` matching `^[A-Z][A-Za-z0-9]*$` (e.g., `BaseComponents`, `AIDatastores`, `BaseWorkloads`). The shape is the same on every library kind, so moving an entry between libraries never means renaming to a different convention. Each library kind's JSON Schema envelope declares the pattern as well, in addition to the check described below.

For Component, Feature, Recipe and FeatureRecipe, the JSON Schema for `metadata.name` accepts any non-empty string, so nothing about the shape is structural for those kinds. Every documented shape — including the library kinds, whose envelopes declare their pattern as well — is checked by the publishing-discipline plugin, which carries the patterns as a regex source-of-truth shared with the compiler distribution. No kind is given a shape here that the plugin then ignores.

The check is opt-in: one command performs it, and it only runs when an author asks for it. The two commands most often assumed to perform it do not:

* **`aggrega lint` reports name-shape violations.** The plugin compares each entity's `metadata.name` against the pattern for its kind. The check runs when an author invokes `aggrega lint` — over a single entity, over a Release's dependency closure with `--release`, or over every catalog entity when invoked with no argument — and the same rule set is reachable from the editor-facing tool surface the CLI exposes. Findings are advisory: they are reported at `warn` severity, and they do not halt.

```text
warn: E0278 name-shape: metadata.name "mariadbSynth" does not match the documented pattern for Recipe entities (^[a-z][a-z0-9-]*$)
```

  The finding opens with its severity and the short code its rule is registered under, which `aggrega explain E0278` expands. The offending file's path prints above the finding, and a whole-catalog run closes with a count of the entities checked and the advisory findings raised.

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

With the policy set, the name-shape rule reports nothing at all. It can also be set for a single invocation with `aggrega lint --allow-nonstandard-names`, or forced off again with `--no-allow-nonstandard-names`. Legitimate uses are catalogs that will never be published, multi-publisher experiments, and special-purpose entities.

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
