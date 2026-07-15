# Aggrega Core (Plugin) schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/plugin-v1alpha1.schema.json`

A Wasm plugin: a WebAssembly module published to an OCI registry and identified by its `metadata.name` — the `<socket>/<name>` path — declaring the socket type it implements, the ABI version it targets, an optional signature pointer, and an optional runtime block. The entity and its `.wasm` publish as one OCI manifest tagged by metadata.version — the entity YAML as the manifest's config blob, the `.wasm` as an inline layer, signed once. Identity is `metadata.name` plus the entity's metadata.version — the same shape every other entity carries; the `.wasm` location is derived from that identity plus the configured registry, and the resolved content digest lives in the lockfile, not in the entity. The closure records the digest and the per-registry trust policy verifies the artifact's signature at pull. The compiler is blind to the plugin's behavior — it routes the reference; the WebAssembly runtime executes the bytes.

See the [plugin authoring reference](../../../entities/plugin/) for prose guidance on authoring plugin entities; this page documents the structural schema that reference describes.

**Top-level type:** `object`

## Properties

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `apiVersion` | const "aggrega.ai/v1alpha1" | yes | Constant: `"aggrega.ai/v1alpha1"` |
| `kind` | const "Plugin" | yes | Constant: `"Plugin"` |
| `metadata` | object | yes |  |
| `spec` | object | yes | The socket type the plugin implements, the ABI version it targets, an optional signature pointer, and an optional runtime block. The plugin's `.wasm` location is derived from its identity — `metadata.name` (the `<socket>/<name>` path) plus the configured registry — not carried in the spec. |

_Additional properties are not permitted._

#### `plugin.metadata`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes |  |
| `version` | string | yes | Strict Semantic Versioning of the Plugin entity (e.g., 1.0.0). |
| `description` | string | no | A concise, one-sentence summary of what the entity does. |
| `maintainers` | object[] | no | List of maintainers who own this entity. |
| `license` | string | no | Legal compliance license (e.g., Apache-2.0). |
| `repository` | string | no | The URL to the Git repository where the source files live. |
| `home` | string | no | The URL of this entity's home page, wiki, or documentation. |
| `keywords` | string[] | no | A list of descriptive keywords for UI discoverability. |
| `deprecated` | boolean | no | Indicates whether this entity is deprecated and should no longer be used. |

_Additional properties are not permitted._

##### `plugin.metadata.maintainers[]`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes |  |
| `email` | string | no |  |
| `url` | string | no |  |

_Additional properties are not permitted._

#### `plugin.spec`

The socket type the plugin implements, the ABI version it targets, an optional signature pointer, and an optional runtime block. The plugin's `.wasm` location is derived from its identity — `metadata.name` (the `<socket>/<name>` path) plus the configured registry — not carried in the spec.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `pluginType` | string (enum) | yes | The socket type this plugin implements. A plugin implements exactly one socket type, drawn from the plugin-type taxonomy the runtime recognises: `provider` (renders IR nodes into provider-native artifacts), `linter` (inspects authored content and raises diagnostics), `frp_step` (a feature-recipe-pipeline step that transforms IR within a pipeline), `mutator` (auto-tags topology-graph node labels at Step 2 via JSON Patch), `policy-validator` (evaluates the full IR graph at Step 4 and halts the build on a failed rule), `cli` (contributes a runtime `aggrega <cmd>` subcommand an operator invokes at the command line — a runtime socket, distinct from the compile-time render and pipeline sockets), `search` (answers a ranked full-text query over an indexed content set — a cross-cutting runtime socket that leaves `capabilities` empty). Allowed values: `"provider"`, `"linter"`, `"frp_step"`, `"mutator"`, `"policy-validator"`, `"cli"`, `"search"` |
| `abiVersion` | string (enum) | yes | The host/guest ABI version the plugin targets. `v1alpha1` is the only accepted value in this iteration; a future ABI revision adds an accepted value. Allowed values: `"v1alpha1"` |
| `capabilities` | string[] | no | The capabilities this plugin serves, interpreted per pluginType. A `provider` plugin lists the render-engine capabilities — provider engine names such as `helm` or `compose` — whose output shape it renders; an `frp_step` plugin lists the provider capabilities its pipeline step is compatible with; the cross-cutting sockets (`linter`, `mutator`, `policy-validator`) leave it empty. A plugin is generic across artifacts that share a capability's output shape, not across all capabilities; this list is an explicit, tested-compatibility claim. Entries preserve author order. The runtime consults the list when a pipeline step touches a scope: the provider rendering that scope's documents must appear here, or the build halts. An empty or absent list declares no capability claim, so it matches nothing and the runtime halts any pipeline step that uses the plugin. |
| `signature` | object | no | An optional descriptive pointer to the plugin's attached signature. This block is documentation only — it records where the signature lives and how it was produced for catalog readers; it does not itself gate or admit the plugin. The enforcing check is the per-registry trust policy applied at pull: a signature is fetched as an OCI referrer, verified against the registry's trusted identities or pinned key, and recorded as a verified fact in the lockfile. A registry that requires signatures halts the pull when a required signature is missing, untrusted, or invalid. |
| `runtime` | object | no | Optional execution constraints the host applies when loading and running the plugin. The fields are field-aligned with the loader's plugin input so a catalog-loaded entity maps to the loader's runtime block without field reinvention. Outbound network access is not an authoring field: a plugin never reaches the network at build time (the ahead-of-time boundary), so there is no host-allowlist field to author here. |
| `exports` | object[] | no | The exports this plugin offers, each with its declared capability. An export is one named entry point the host dispatches to (for example `render_node`, `lint_naming`, `step`); the per-export capability block is the authored claim of what that export does, which the host cross-checks against the plugin's self-report at publish and at load. Entries preserve author order. Absent declares no authored export surface. |
| `provider` | object | no | The provider-socket metadata for a `pluginType: provider` plugin: how its rendering engine translates the aggrega.ai/v1alpha1 Workload kind and which platform-native annotations the engine reads. Present only on provider-rendering plugins; absent on `linter`, `frp_step`, `mutator`, and `policy-validator` plugins, and on provider plugins whose engine renders only sourced or artifact content (no Workload synthesis). |
| `search` | object | no | The search-socket metadata for a `pluginType: search` plugin: the index format and format version the guest's `describe()` self-report stamps, and the ranked-query capabilities it advertises. The block is the publish-time record of the guest's self-report, the same way the provider block records a provider guest's self-report; the host cross-checks it against `describe()` at publish and at load. Present only on search plugins; absent on every other plugin type. |

_Additional properties are not permitted._

##### `plugin.spec.signature`

An optional descriptive pointer to the plugin's attached signature. This block is documentation only — it records where the signature lives and how it was produced for catalog readers; it does not itself gate or admit the plugin. The enforcing check is the per-registry trust policy applied at pull: a signature is fetched as an OCI referrer, verified against the registry's trusted identities or pinned key, and recorded as a verified fact in the lockfile. A registry that requires signatures halts the pull when a required signature is missing, untrusted, or invalid.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `type` | const "sigstore-cosign" | yes | The signature scheme. `sigstore-cosign` is the supported scheme. Constant: `"sigstore-cosign"` |
| `signatureRef` | string | no | The OCI referrer reference of the attached signature bundle, for documentation and discovery. Absent when the signature is discovered by referrer enumeration at pull rather than pinned here. |
| `publicKeyRef` | string | no | A pointer to the public key the signature was produced with, for a keyed signature. Absent indicates a keyless (OIDC-identity) signature, verified against the registry's trusted identities. |

_Additional properties are not permitted._

##### `plugin.spec.runtime`

Optional execution constraints the host applies when loading and running the plugin. The fields are field-aligned with the loader's plugin input so a catalog-loaded entity maps to the loader's runtime block without field reinvention. Outbound network access is not an authoring field: a plugin never reaches the network at build time (the ahead-of-time boundary), so there is no host-allowlist field to author here.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `maxMemoryPages` | integer | no | Caps the plugin's linear memory in Wasm pages (64 KiB per page). Zero or absent applies the platform default cap, so a load is never unbounded; an attachment that needs more raises this value. |
| `timeoutMs` | integer | no | Caps per-call execution wall time in milliseconds. Zero or absent applies the platform default cap, so a call is never uncancellable; an attachment that runs longer raises this value. |
| `hostFunctions` | string[] | no | Derived from the published .wasm at publish, stamped, verified at pull; machine-owned, do not author. The host functions the plugin imports are read from the .wasm import section at publish time and stamped here in canonical (sorted, de-duplicated) form; the value reflects the published binary. Pull re-derives from the verified binary and halts if the stamp diverges. The host registers exactly this derived set and validates every entry against the curated allowlist. |
| `configKV` | map of string | no | Plugin-specific configuration the runtime hands to the plugin at start, as string-to-string key/value pairs. Entries preserve author order so the emitted record is byte-identical across runs. Absent leaves the runtime's default empty configuration in effect. |

_Additional properties are not permitted._

##### `plugin.spec.exports[]`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | The export's ABI name — the name the host dispatches to (for example `render_node`, `lint_naming`, `step`). |
| `operates` | string (enum) | no | The pipeline operation this export performs: `patch` (modify an existing rendered document) or `emit` (add a new document). Absent carries no operation claim. Allowed values: `"patch"`, `"emit"` |
| `scope` | string (enum) | no | The document root this export operates on: `own` (the node's own rendered documents) or `host` (the documents of the component a component-scope FeatureRecipe is attached to). Absent carries no scope claim. Allowed values: `"own"`, `"host"` |
| `selector` | string | no | A free-form, human-readable description of what the export acts on (for example `workloads carrying a pod template`). Documentation for catalog readers; the compiler does not interpret it. |

_Additional properties are not permitted._

##### `plugin.spec.provider`

The provider-socket metadata for a `pluginType: provider` plugin: how its rendering engine translates the aggrega.ai/v1alpha1 Workload kind and which platform-native annotations the engine reads. Present only on provider-rendering plugins; absent on `linter`, `frp_step`, `mutator`, and `policy-validator` plugins, and on provider plugins whose engine renders only sourced or artifact content (no Workload synthesis).

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workloadSchema` | string | no | JSON Schema 2020-12 documenting how this provider translates the aggrega.ai/v1alpha1 Workload kind into provider-native manifests. When present, the provider supports Recipes that declare a workload: block (synthesized mode) — the compiler synthesizes provider-native manifests via a Go Engine, informed by this schema as documentation/contract. Whether a workload: Recipe is supported is determined by the bound engine's synthesis capability, not by this field's presence: a synthesized-mode Recipe bound to a provider whose engine cannot synthesize halts loudly at render time. The standard-library catalog declares workloadSchema on synthesizing providers as the documented contract, kept in sync with engine capability. Today the field acts as a presence flag (any non-empty body indicates support); the body is compiled to JSON Schema 2020-12 at load and becomes executable input to Wasm translators in a future iteration. |
| `wellKnownAnnotations` | object[] | no | Documentation-of-contract: the platform-native well-known annotation keys (the aggrega.ai/ namespace) this provider's rendering engine reads, with the behavior applied when each is absent. Each entry documents one engine-consumed annotation key for catalog readers and the inspect surface. The compiler does not consume this field to gate or branch a build — it is descriptive metadata about the annotations the engine recognises, not an enforcement list, and is distinct from the runtime check that governs binding a value into the reserved namespace. Entries are an ordered list and preserve author order. |
| `contract` | object | no | The provider's self-declared render-behavior contract: the input kinds it renders, how it assembles a dispatch group's per-node output, the template-delimiter pair it applies to imported artifact files, any restriction on which source files it consumes, whether one loaded instance may serve every crossing, and whether it wires cross-boundary edges. It is the publish-time record of the provider guest's `describe()` self-report, which the host cross-checks against `describe()` at publish and at load. Absent declares no render-behavior contract, and the cross-check compares only the per-export claims. |

_Additional properties are not permitted._

###### `plugin.spec.provider.wellKnownAnnotations[]`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `key` | string | yes | The platform-native well-known annotation key the engine reads (e.g., aggrega.ai/namespace). Sits under the platform-reserved aggrega.ai/ annotation namespace — the engine-read platform directives. |
| `purpose` | string | yes | What the annotation controls — the rendering behavior it influences when present. |
| `defaultBehavior` | string | no | The behavior the engine applies when this annotation is absent. |

_Additional properties are not permitted._

###### `plugin.spec.provider.contract`

The provider's self-declared render-behavior contract: the input kinds it renders, how it assembles a dispatch group's per-node output, the template-delimiter pair it applies to imported artifact files, any restriction on which source files it consumes, whether one loaded instance may serve every crossing, and whether it wires cross-boundary edges. It is the publish-time record of the provider guest's `describe()` self-report, which the host cross-checks against `describe()` at publish and at load. Absent declares no render-behavior contract, and the cross-check compares only the per-export claims.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `inputKinds` | object | no | Which of the three Recipe input kinds this plugin renders: a sourced file set, a synthesized workload, and a standalone artifacts-only node. Each field is an independent claim. |
| `boundaryAssembly` | string (enum) | no | How the plugin combines a dispatch group's per-node render output: `none` writes each node's output directly at the dispatch path; `merge` folds the per-node fragments into one document; `nest` places each node's output under its own position in an umbrella structure. Absent carries no assembly claim. Allowed values: `"none"`, `"merge"`, `"nest"` |
| `artifactDelimiters` | object | no | The Go-template delimiter pair the plugin applies to imported artifact files. Absent means the default `{{`/`}}` pair; a plugin whose target syntax collides with that pair declares an alternate pair here. |
| `sourceFilter` | string[] | no | The source-file paths the plugin consumes when a node supplies a file set. Absent means the plugin consumes every file in the set. |
| `assemblyNameAnnotation` | object | no | The boundary annotation whose resolved value names the artifact the plugin assembles from a dispatch group. A plugin that folds a group's contributing boundaries into one named assembly declares the annotation key it reads and whether every contributing boundary must agree on that annotation's resolved value. Absent means the plugin names its assembly from the dispatch path alone. |
| `reusableInstance` | boolean | no | Whether one loaded plugin instance may serve every render, assemble, and validate crossing of a build rather than a fresh instance per crossing. Declared true only when the plugin holds no state across crossings — a pure function of its per-crossing input — so a single instance produces byte-identical output whether reused or freshly loaded. Absent (false) loads a fresh instance per crossing, isolating a plugin that carries state by construction. |
| `crossBoundaryLinking` | boolean | no | Whether the plugin wires a cross-boundary uses edge — a uses edge whose consuming and consumed ends assemble into different dispatch groups — by emitting provider-native cross-reference wiring through a paired link_publish/link_resolve export contract. Declared true only when the plugin exports both; a claim that does not match the export pair halts at load. Absent (false) declares no cross-boundary linking, so the host routes no link crossing to the plugin. |

_Additional properties are not permitted._

##### `plugin.spec.search`

The search-socket metadata for a `pluginType: search` plugin: the index format and format version the guest's `describe()` self-report stamps, and the ranked-query capabilities it advertises. The block is the publish-time record of the guest's self-report, the same way the provider block records a provider guest's self-report; the host cross-checks it against `describe()` at publish and at load. Present only on search plugins; absent on every other plugin type.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `indexFormat` | string | no | The index format the guest reports it reads, a free-form identifier the host records and does not interpret (for example a documentation-corpus format name). It documents which index shape the guest is built against so a catalog reader and the inspect surface can see the guest's declared input; the compiler routes the query and does not parse the index itself. |
| `indexVersion` | string | no | The index format version the guest reports, paired with indexFormat to pin the exact index contract the guest reads. Empty carries no version claim. |
| `capabilities` | string[] | no | The ranked-query capabilities the guest advertises through its self-report (for example phrase matching, fuzzy matching, or field filtering), as free-form capability identifiers the host records for catalog readers and the inspect surface. Entries preserve author order so the emitted record is byte-identical across runs. The compiler does not act on the values; a guest realizes whichever capabilities it advertises. |

_Additional properties are not permitted._
