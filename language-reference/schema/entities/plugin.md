# Aggrega Core (Plugin) schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/plugin-v1alpha1.schema.json`

A Wasm plugin: a WebAssembly module published to an OCI registry and identified by its `metadata.pluginType` — the socket it implements — plus its bare `metadata.name`, declaring the ABI version it targets, an optional signature pointer, and an optional runtime block. The entity and its `.wasm` publish as one OCI manifest tagged by metadata.version — the entity YAML as the manifest's config blob, the `.wasm` as an inline layer, signed once. Identity is the `metadata.pluginType`/`metadata.name` coordinate plus the entity's metadata.version; the `.wasm` location is derived from that coordinate plus the configured registry, and the resolved content digest lives in the lockfile, not in the entity. The closure records the digest and the per-registry trust policy verifies the artifact's signature at pull. The compiler is blind to the plugin's behavior — it routes the reference; the WebAssembly runtime executes the bytes.

See the [plugin authoring reference](../../entities/plugin.md) for prose guidance on authoring plugin entities; this page documents the structural schema that reference describes.

**Top-level type:** `object`

## Properties

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `apiVersion` | const "aggrega.ai/v1alpha1" | yes | Constant: `"aggrega.ai/v1alpha1"` |
| `kind` | const "Plugin" | yes | Constant: `"Plugin"` |
| `metadata` | object | yes |  |
| `spec` | object | yes | The ABI version the plugin targets, an optional signature pointer, and an optional runtime block. The plugin's `.wasm` location is derived from the plugin's identity — its `metadata.pluginType` (the socket) plus its bare `metadata.name` — and the configured registry; it is not carried in the spec. |

_Additional properties are not permitted._

#### `plugin.metadata`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes |  |
| `version` | string | yes | Strict Semantic Versioning of the Plugin entity (e.g., 1.0.0). |
| `pluginType` | string (enum) | yes | The socket type this plugin implements. A plugin implements exactly one socket type, drawn from the plugin-type taxonomy the runtime recognises: `provider` (renders IR nodes into provider-native artifacts), `linter` (inspects authored content and raises diagnostics), `pipeline-step` (a feature-recipe-pipeline step that transforms IR within a pipeline), `governance` (serves the build-pipeline governance roles — transforming node labels at topology construction, or rendering an accept/reject verdict over the IR graph at static analysis or over the rendered artifacts at rendering; the role it is attached at, not its kind, fixes what it may emit), `cli` (contributes a runtime `aggrega <cmd>` subcommand an operator invokes at the command line — a runtime socket, distinct from the compile-time render and pipeline sockets), `parser` (turns a foreign source text into a canonical structured tree so a consumer reads the tree without carrying its own language parser, advertising the formats it handles as `parse:<format>` capabilities), `importer` (turns a foreign infrastructure or agent-definition source into draft Aggrega authoring files, advertising the formats it handles as `import:<format>` capabilities). Allowed values: `"provider"`, `"linter"`, `"pipeline-step"`, `"governance"`, `"cli"`, `"parser"`, `"importer"` |
| `description` | string | no | A concise, one-sentence summary of what the entity does. |
| `maintainers` | object[] | no | List of maintainers who own this entity. |
| `license` | string | no | Legal compliance license (e.g., Apache-2.0). |
| `repository` | string | no | The URL to the Git repository where the source files live. |
| `home` | string | no | The URL of this entity's home page, wiki, or documentation. |
| `keywords` | string[] | no | A list of descriptive keywords for UI discoverability. |

_Additional properties are not permitted._

##### `plugin.metadata.maintainers[]`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes |  |
| `email` | string | no |  |
| `url` | string | no |  |

_Additional properties are not permitted._

#### `plugin.spec`

The ABI version the plugin targets, an optional signature pointer, and an optional runtime block. The plugin's `.wasm` location is derived from the plugin's identity — its `metadata.pluginType` (the socket) plus its bare `metadata.name` — and the configured registry; it is not carried in the spec.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `abiVersion` | string (enum) | yes | The host/guest ABI version the plugin targets. `v1alpha1` is the only accepted value in this iteration; a future ABI revision adds an accepted value. Allowed values: `"v1alpha1"` |
| `signature` | object | no | An optional descriptive pointer to the plugin's attached signature. This block is documentation only — it records where the signature lives and how it was produced for catalog readers; it does not itself gate or admit the plugin. The enforcing check is the per-registry trust policy applied at pull: a signature is fetched as an OCI referrer, verified against the registry's trusted identities or pinned key, and recorded as a verified fact in the lockfile. A registry that requires signatures halts the pull when a required signature is missing, untrusted, or invalid. |
| `runtime` | object | no | Optional execution constraints the host applies when loading and running the plugin. The fields are field-aligned with the loader's plugin input so a catalog-loaded entity maps to the loader's runtime block without field reinvention. Outbound network access is not an authoring field: a plugin never reaches the network at build time (the ahead-of-time boundary), so there is no host-allowlist field to author here. |
| `exports` | object[] | no | The exports this plugin offers, each with its declared capability. An export is one named entry point the host dispatches to (for example `render_node`, `lint_naming`, `step`); the per-export capability block is the authored claim of what that export does, which the host cross-checks against the plugin's self-report at publish and at load. Entries preserve author order. Absent declares no authored export surface. |
| `commands` | object[] | no | Derived from the plugin's `.wasm` describe() self-report at publish, recorded by the stamp step, verified at load; machine-owned, do not author. The top-level `aggrega <command>` verbs a CLI plugin contributes are read from the plugin's describe() self-report and recorded here in describe()-declared order, so the command surface a CLI plugin installs as is readable from the entity without loading the plugin. A non-CLI plugin contributes no commands and records an empty list. The host installs exactly this set; a recorded set that diverges from the plugin's describe() self-report halts at load, and publish refuses a set out of sync with the binary and directs the author to re-record it. |
| `provider` | object | no | The provider-socket block for a `pluginType: provider` plugin: the capabilities it serves, how it translates the aggrega.ai/v1alpha1 Workload kind, which platform-native annotations it reads, and its render-behavior contract. Present only on provider-rendering plugins; absent on every other plugin type. |
| `pipelineStep` | object | no | The pipeline-step block for a `pluginType: pipeline-step` plugin: the provider capabilities its step is compatible with. Present only on pipeline-step plugins; absent on every other plugin type. |
| `parser` | object | no | The parser block for a `pluginType: parser` plugin: the source formats it turns into a canonical structured tree. Present only on parser plugins; absent on every other plugin type. |
| `importer` | object | no | The importer block for a `pluginType: importer` plugin: the foreign source formats it turns into draft Aggrega authoring files. Present only on importer plugins; absent on every other plugin type. |

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

##### `plugin.spec.commands[]`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | The command verb the host registers — the `aggrega <name>` token an operator invokes, and the discriminator the host hands the plugin at invocation so a single plugin backing several commands routes on which command was called. |
| `description` | string | no | The command's one-line short-help text, shown in the command listing and help output. Documentation only; the host does not act on it. |
| `flags` | object[] | no | The command's flags, in declared order. Each entry contributes one flag the host registers on the command so aggrega help <command> renders it like a core command's flag. A command with no flags leaves it empty. |

_Additional properties are not permitted._

###### `plugin.spec.commands[].flags[]`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | The flag's long name — the --name token an operator passes on the command line. Every declared flag must name it. |
| `shorthand` | string | no | The flag's optional single-character short alias — the -x form an operator may pass instead of the long name. Absent means the flag has no short alias. |
| `description` | string | no | The flag's one-line help text, shown in the command's help output. It is optional documentation; the host neither validates nor acts on it. |
| `type` | string | no | The flag's value type — for example string, bool, or int. Absent carries no type claim. |
| `default` | string | no | The flag's default value when the operator does not pass it, expressed as a string. Absent means the flag declares no default. |

_Additional properties are not permitted._

##### `plugin.spec.provider`

The provider-socket block for a `pluginType: provider` plugin: the capabilities it serves, how it translates the aggrega.ai/v1alpha1 Workload kind, which platform-native annotations it reads, and its render-behavior contract. Present only on provider-rendering plugins; absent on every other plugin type.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `capabilities` | string[] | no | The capabilities this provider serves — capability names such as `helm` or `compose` — whose output shape it renders. A provider is generic across artifacts that share a capability's output shape, not across all capabilities, so the list is an explicit, tested-compatibility claim rather than an aspiration. Entries preserve author order. A Recipe's requested provider target resolves to the provider plugin whose list contains that target; a target listed by more than one provider plugin halts as ambiguous unless the workspace configuration's `plugins.providers` selection names which plugin to use. An empty or absent list declares no capability claim, so the plugin serves no target. |
| `workloadSchema` | string | no | JSON Schema 2020-12 documenting how this provider translates the aggrega.ai/v1alpha1 Workload kind into provider-native manifests. When present, the provider supports Recipes that declare a workload: block (synthesized mode) — the provider translates the Workload into provider-native manifests, informed by this schema as documentation/contract. Whether a workload: Recipe is supported is determined by the bound provider's synthesis capability, not by this field's presence: a synthesized-mode Recipe bound to a provider that cannot synthesize halts loudly at render time. The standard-library catalog declares workloadSchema on synthesizing providers as the documented contract, kept in sync with that capability. Today the field acts as a presence flag (any non-empty body indicates support); the body is compiled to JSON Schema 2020-12 at load and becomes executable input to Wasm translators in a future iteration. |
| `wellKnownAnnotations` | object[] | no | The provider's support claim: the platform-native well-known annotation keys (the aggrega.ai/ namespace) this provider reads, each with the scope it is read at and the behavior applied when it is absent. Declare a key only where the provider reads it — the published support matrix is rendered from these declarations, so a key listed here is a key an author can expect to change the rendered output at the scope it names. The compiler reads the declaration in one way: a `scope` naming an input kind the provider's own `contract.inputKinds` does not claim contradicts an adjacent claim in the same entity, and the build halts naming the key and the contradiction. Nothing else about a build branches on this field, and it is distinct from the rule that governs binding a value under the reserved aggrega.ai/ prefix. Absent declares no support claim. Entries are an ordered list and preserve author order. |
| `contract` | object | no | The provider's self-declared render-behavior contract: the input kinds it renders, how it assembles a dispatch group's per-node output, the template-delimiter pair it applies to imported artifact files, any restriction on which source files it consumes, whether one loaded instance may serve every crossing, and whether it wires cross-boundary edges. It is the publish-time record of the provider guest's `describe()` self-report, which the host cross-checks against `describe()` at publish and at load. Absent declares no render-behavior contract, and the cross-check compares only the per-export claims. |

_Additional properties are not permitted._

###### `plugin.spec.provider.wellKnownAnnotations[]`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `key` | string | yes | The platform-native well-known annotation key the provider reads (e.g., aggrega.ai/namespace). Sits under the platform-reserved aggrega.ai/ annotation namespace — the provider-read platform directives. |
| `purpose` | string | yes | What the annotation controls — the rendering behavior it influences when present. |
| `defaultBehavior` | string | no | The behavior the provider applies when this annotation is absent. |
| `scope` | string (enum)[] | no | Where this provider reads the key. The first three values are the Recipe input kinds and name the render path the key is read on — `sourced` a vendored file set, `synthesized` a Workload the provider materialises, `artifactsStandalone` a node whose whole output is imported artifact documents. Each of those must be an input kind this provider's `contract.inputKinds` claims; naming one it does not halts the build. `boundary` is for a key resolved once per boundary rather than per node — the name of an assembled artifact, or the placement context a cross-boundary reference is shaped from — where input kind is not a meaningful axis, so it is not matched against `contract.inputKinds`. A key read on more than one path lists every one. Absent makes no per-path claim: nothing is checked, and the key states only that the provider reads it somewhere. |

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

##### `plugin.spec.pipelineStep`

The pipeline-step block for a `pluginType: pipeline-step` plugin: the provider capabilities its step is compatible with. Present only on pipeline-step plugins; absent on every other plugin type.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `capabilities` | string[] | no | The provider capabilities this plugin's pipeline step is compatible with — the provider capability names, such as `helm` or `compose`, whose rendered output the step knows how to transform. A step is written against one provider's output shape at a time, so the list is an explicit, tested-compatibility claim rather than an aspiration. Entries preserve author order. It is the catalog-readable record of that claim, published from the plugin's own describe() self-report; the build reads the same claim from the plugin when a step touches a scope and halts when the provider rendering that scope's documents is not among them. An empty or absent list declares no compatibility claim, so no scope admits the step. |

_Additional properties are not permitted._

##### `plugin.spec.parser`

The parser block for a `pluginType: parser` plugin: the source formats it turns into a canonical structured tree. Present only on parser plugins; absent on every other plugin type.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `capabilities` | string[] | no | The source formats this parser turns into a canonical structured tree, each written as `parse:<format>` — for example `parse:yaml`. The prefix is part of the entry, so one plugin advertising several formats lists one entry per format. Entries preserve author order. A requested format resolves to the parser whose list contains the matching entry; a format no parser advertises halts the build, and a format advertised by more than one parser plugin halts as ambiguous. An empty or absent list declares no format claim, so the plugin parses nothing. |

_Additional properties are not permitted._

##### `plugin.spec.importer`

The importer block for a `pluginType: importer` plugin: the foreign source formats it turns into draft Aggrega authoring files. Present only on importer plugins; absent on every other plugin type.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `capabilities` | string[] | no | The foreign source formats this importer turns into draft Aggrega authoring files, each written as `import:<format>` — for example `import:terraform`. The prefix is part of the entry, so one plugin advertising several formats lists one entry per format. Entries preserve author order. A requested import format resolves to the importer whose list contains the matching entry; a format no importer advertises halts the import, and a format advertised by more than one importer plugin halts as ambiguous. An empty or absent list declares no format claim, so the plugin imports nothing. |

_Additional properties are not permitted._
