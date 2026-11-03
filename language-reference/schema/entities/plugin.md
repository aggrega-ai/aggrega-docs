# Aggrega Core (Plugin) schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/plugin-v1alpha1.schema.json`

A Wasm plugin: a WebAssembly module published to an OCI registry and identified by its `metadata.pluginType` — the socket it implements — plus its bare `metadata.name`, declaring the ABI version it targets, an optional signature pointer, and an optional runtime block. The entity and its `.wasm` publish as one OCI manifest tagged by metadata.version — the entity YAML as the manifest's config blob, the `.wasm` as an inline layer, signed once. Identity is the `metadata.pluginType`/`metadata.name` coordinate plus the entity's metadata.version; the `.wasm` location is derived from that coordinate plus the configured registry, and the resolved content digest lives in the lockfile, not in the entity. The lockfile records the digest, and the per-registry trust policy verifies the artifact's signature at pull. The compiler does not interpret the plugin's behavior — it routes the reference; the WebAssembly runtime executes the bytes.

See the [Plugin authoring reference](../../entities/plugin.md) for prose guidance on authoring Plugin entities; this page documents the structural schema that reference describes.

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
| `name` | string | yes | At least 1 character long. |
| `version` | string | yes | Strict Semantic Versioning of the Plugin entity (e.g., 1.0.0). Pattern: `^(0\|[1-9]\d*)\.(0\|[1-9]\d*)\.(0\|[1-9]\d*)(?:-((?:0\|[1-9]\d*\|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0\|[1-9]\d*\|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$`. |
| `pluginType` | string (enum) | yes | The socket type this plugin implements. A plugin implements exactly one socket type, drawn from the plugin-type taxonomy the runtime recognises: `provider` (renders IR nodes into provider-native artifacts), `linter` (inspects authored content and raises diagnostics), `pipeline-step` (a step in a FeatureRecipe's or a Recipe's `pipeline:` that patches the rendered document set), `governance` (serves the build-pipeline governance roles — transforming node labels at topology construction, or rendering an accept/reject verdict over the IR graph at static analysis or over the rendered artifacts at rendering; the role it is attached at, not its kind, fixes what it may emit), `cli` (contributes a runtime `aggrega <cmd>` subcommand an operator invokes at the command line — a runtime socket, distinct from the compile-time render and pipeline sockets), `parser` (turns a foreign source text into a canonical structured tree so a consumer reads the tree without carrying its own language parser, advertising the formats it handles as `parse:<format>` capabilities), `importer` (turns a foreign infrastructure or agent-definition source into draft Aggrega authoring files, advertising the formats it handles as `import:<format>` capabilities). Allowed values: `"provider"`, `"linter"`, `"pipeline-step"`, `"governance"`, `"cli"`, `"parser"`, `"importer"` |
| `description` | string | no | What this entity is and what it is for, written for someone deciding whether to use it. Open with a sentence naming the thing, then add what a reader needs in order to choose it and use it correctly — what it expects from the build that runs it, and anything surprising about how it behaves. A short paragraph is the usual length. |
| `maintainers` | object[] | no | List of maintainers who own this entity. |
| `license` | string | no | SPDX identifier for the license of the software this entity describes, such as MIT or AGPL-3.0. It records the terms of that software, not the terms of this file. |
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
| `abiVersion` | string (enum) | yes | The host/guest ABI version the plugin targets. `v1alpha1` is the accepted value; a new ABI revision adds one. Allowed values: `"v1alpha1"` |
| `signature` | object | no | An optional descriptive pointer to the plugin's attached signature. This block is documentation only — it records where the signature lives and how it was produced for catalog readers; it does not itself gate or admit the plugin. The enforcing check is the per-registry trust policy applied at pull: a signature is fetched as an OCI referrer, verified against the registry's trusted identities or pinned key, and recorded as a verified fact in the lockfile. A registry that requires signatures halts the pull when a required signature is missing, untrusted, or invalid. |
| `runtime` | object | no | Optional execution constraints the host applies when loading and running the plugin. Outbound network access is not an authoring field: a plugin never reaches the network at build time (the ahead-of-time boundary), so there is no host-allowlist field to author here. |
| `exports` | object[] | no | The exports this plugin offers, each with its declared capability. An export is one named entry point the host dispatches to (for example `render_node`, `lint_naming`, `step`); the per-export capability block is the authored claim of what that export does, which the host cross-checks against the plugin's self-report at publish and at load. Entries preserve author order. Absent declares no authored export surface. |
| `commands` | object[] | no | Machine-owned, do not author: recorded by `aggrega plugin sync` (or `aggrega plugin gen-catalog`) from the plugin's self-report. The top-level `aggrega <command>` verbs a CLI plugin contributes are read from the plugin's self-report and recorded here in the order the self-report declares them, so the command surface a CLI plugin installs as is readable from the entity without loading the plugin. A non-CLI plugin contributes no commands and records an empty list. The host installs exactly this set; a recorded set that diverges from the plugin's self-report halts at load, and publish refuses a set out of sync with the binary and directs the author to re-record it. |
| `provider` | object | no | The provider-socket block for a `pluginType: provider` plugin: the capabilities it serves, how it translates the aggrega.ai/v1alpha1 Workload kind, which platform-native annotations it reads, and its render-behavior contract. Present only on provider-rendering plugins; absent on every other plugin type. |
| `pipelineStep` | object | no | The pipeline-step block for a `pluginType: pipeline-step` plugin: the provider capabilities its step is compatible with. Present only on pipeline-step plugins; absent on every other plugin type. |
| `parser` | object | no | The parser block for a `pluginType: parser` plugin: the source formats it turns into a canonical structured tree. Present only on parser plugins; absent on every other plugin type. |
| `importer` | object | no | The importer block for a `pluginType: importer` plugin: the foreign source formats it turns into draft Aggrega authoring files, and the signatures a source of those formats is recognised by. Present only on importer plugins; absent on every other plugin type. |

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

Optional execution constraints the host applies when loading and running the plugin. Outbound network access is not an authoring field: a plugin never reaches the network at build time (the ahead-of-time boundary), so there is no host-allowlist field to author here.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `maxMemoryPages` | integer | no | Caps the plugin's linear memory in Wasm pages (64 KiB per page). Zero or absent applies the platform default cap, so a load is never unbounded; an attachment that needs more raises this value. Minimum: `0`. |
| `timeoutMs` | integer | no | Caps how long the plugin's own code may run during one call, in milliseconds, not counting time spent inside the host functions it calls. On Linux the measure is processor time, so time spent waiting for a processor on a busy machine does not count; on other systems it is elapsed time. The first call to a freshly loaded plugin also counts the plugin's own start-up. Zero or absent applies the platform default cap, so a call is never uncancellable; an attachment that runs longer raises this value. Minimum: `0`. |
| `hostFunctions` | string[] | no | Machine-owned, do not author: the host functions the plugin imports, read from the .wasm import section by `aggrega plugin sync` (or `aggrega plugin gen-catalog`) and recorded here in canonical (sorted, de-duplicated) form. Publish re-derives them from the binary and refuses an entity whose record differs; pull re-derives and verifies them again. The host registers exactly this derived set and validates every entry against the curated allowlist. |
| `configKV` | map of string | no | Plugin-specific configuration the runtime hands to the plugin at start, as string-to-string key/value pairs. Entries preserve author order so the emitted record is byte-identical across runs. Absent leaves the runtime's default empty configuration in effect. |

_Additional properties are not permitted._

##### `plugin.spec.exports[]`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | The export's ABI name — the name the host dispatches to (for example `render_node`, `lint_naming`, `step`). At least 1 character long. |
| `operates` | string (enum) | no | The pipeline operation this export performs: `patch` (modify an existing rendered document) or `emit` (add a new document). Absent carries no operation claim. Allowed values: `"patch"`, `"emit"` |
| `scope` | string (enum) | no | The document root this export operates on: `own` (the node's own rendered documents) or `host` (the documents of the component a component-scope FeatureRecipe is attached to). Absent carries no scope claim. Allowed values: `"own"`, `"host"` |
| `selector` | string | no | A free-form, human-readable description of what the export acts on (for example `workloads carrying a pod template`). Documentation for catalog readers; the compiler does not interpret it. |

_Additional properties are not permitted._

##### `plugin.spec.commands[]`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | The command verb the host registers — the `aggrega <name>` token an operator invokes, and the discriminator the host hands the plugin at invocation so a single plugin backing several commands routes on which command was called. At least 1 character long. |
| `description` | string | no | The command's one-line short-help text, shown in the command listing and help output. Documentation only; the host does not act on it. |
| `flags` | object[] | no | The command's flags, in declared order. Each entry contributes one flag the host registers on the command so aggrega help <command> renders it like a core command's flag. A command with no flags leaves it empty. Within a command each flag name and each shorthand appears once, and none reuses a flag every aggrega command already has — `--help`, `-h` and the global flags; the host checks this when it adds the plugin's commands, and a plugin whose declarations fail is not added, with a warning. |

_Additional properties are not permitted._

###### `plugin.spec.commands[].flags[]`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | The flag's long name — the --name token an operator passes on the command line. Every declared flag must name it. At least 1 character long. |
| `shorthand` | string | no | The flag's optional short alias — the -x form an operator may pass instead of the long name — as a single ASCII letter or digit. Absent means the flag has no short alias. Pattern: `^[A-Za-z0-9]$`. |
| `description` | string | no | The flag's one-line help text, shown in the command's help output. It is optional documentation; the host neither validates nor acts on it. |
| `type` | string (enum) | no | The flag's value type — `string`, `bool` or `int` — and the kind of flag help renders it as. Absent renders it as a string flag. Allowed values: `"string"`, `"bool"`, `"int"` |
| `default` | string | no | The flag's default value when the operator does not pass it, expressed as a string. For a `bool` or `int` flag it is a value of that type. Absent means the flag declares no default. |

_Additional properties are not permitted._

##### `plugin.spec.provider`

The provider-socket block for a `pluginType: provider` plugin: the capabilities it serves, how it translates the aggrega.ai/v1alpha1 Workload kind, which platform-native annotations it reads, and its render-behavior contract. Present only on provider-rendering plugins; absent on every other plugin type.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `capabilities` | string[] | no | Recorded from the plugin's `.wasm` self-report by `aggrega plugin gen-catalog`, so the plugin is the source of this list. An author may narrow it before publishing, removing an entry this entity should not offer, and may add none the self-report does not name: publish, and `aggrega validate` given the plugin's `.wasm` with `--plugin`, refuse a list naming a capability the self-report does not name. Publish sends the entity as written, never rewriting this list, and notes each capability the self-report names that the list leaves out. The capabilities this provider serves — capability names such as `helm` or `compose` — whose output shape it renders. A provider is generic across artifacts that share a capability's output shape, not across all capabilities, so the list is an explicit, tested-compatibility claim rather than an aspiration. Entries preserve author order. A Recipe's requested provider target resolves to the provider plugin whose list contains that target; a target listed by more than one provider plugin halts as ambiguous unless the workspace configuration's `plugins.providers` selection names which plugin to use. An empty or absent list declares no capability claim, so the plugin serves no target. |
| `workloadSchema` | string | no | JSON Schema 2020-12 documenting how this provider translates the aggrega.ai/v1alpha1 Workload kind into provider-native manifests. When present, the provider supports Recipes that declare a workload: block (synthesized mode) — the provider translates the Workload into provider-native manifests, informed by this schema as documentation/contract. Whether a workload: Recipe is supported is determined by the bound provider's synthesis capability, not by this field's presence: a synthesized-mode Recipe bound to a provider that cannot synthesize halts loudly at render time. The standard-library catalog declares workloadSchema on synthesizing providers as the documented contract, kept in sync with that capability. The field is the documented contract: the body is compiled to JSON Schema 2020-12 at load to check it is well-formed, and nothing else reads it. |
| `wellKnownAnnotations` | object[] | no | The provider's support claim: the platform-native well-known annotation keys (the aggrega.ai/ namespace) this provider reads, each with the scope it is read at and the behavior applied when it is absent. Declare a key only where the provider reads it — the published support matrix is rendered from these declarations, so a key listed here is a key an author can expect to change the rendered output at the scope it names. The compiler reads the declaration in two ways: a `scope` naming an input kind the provider's own `contract.inputKinds` does not claim contradicts an adjacent claim in the same entity, and the build halts naming the key and the contradiction; and a build warns about an aggrega.ai/ annotation reaching a render through this provider when no entry covers it on any input kind that render declares. It is distinct from the rule that governs binding a value under the reserved aggrega.ai/ prefix. Absent declares no support claim, and no such warning is raised for this provider; a provider that reads none of these keys declares `readsNoWellKnownAnnotations` instead of this list. Entries are an ordered list and preserve author order. |
| `readsNoWellKnownAnnotations` | const true | no | Declares that this provider reads none of the platform-native annotation keys in the aggrega.ai/ namespace, the keys `wellKnownAnnotations` would otherwise list: a support claim covering no key, which is a statement where leaving both this field and `wellKnownAnnotations` out is silence. A build then warns about every aggrega.ai/ annotation that reaches a render through this provider, naming the key, the provider and the input kinds that render declares; the value still passes through untouched and the build does not halt. Only `true` may be written, so leaving the field out stays the one way to say nothing. It cannot be written together with `wellKnownAnnotations`: a provider that reads some of the keys lists those there instead. Constant: `true` |
| `contract` | object | no | The provider's self-declared render-behavior contract: the input kinds it renders, how it assembles a dispatch group's per-node output and which directories that output sits under, the template-delimiter pair it applies to imported artifact files, whether one loaded instance may serve every crossing, whether it wires cross-boundary edges, whether it honours omit entries, whether it accepts the files a Recipe contributes to its boundary's shared output, and which files its ecosystem never ships beside a source. It is the publish-time record of the provider plugin's self-report, which the host cross-checks against that self-report at publish and at load. Absent declares no render-behavior contract, and the cross-check compares only the per-export claims. |

_Additional properties are not permitted._

###### `plugin.spec.provider.wellKnownAnnotations[]`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `key` | string | yes | The platform-native well-known annotation key the provider reads (e.g., aggrega.ai/namespace). Sits under the platform-reserved aggrega.ai/ annotation namespace — the provider-read platform directives. Pattern: `^aggrega\.ai/.+`. |
| `purpose` | string | yes | What the annotation controls — the rendering behavior it influences when present. |
| `defaultBehavior` | string | no | The behavior the provider applies when this annotation is absent. |
| `scope` | string (enum)[] | no | Where this provider reads the key. The first three values are the Recipe input kinds and name the render path the key is read on — `sourced` a vendored file set, `synthesized` a Workload the provider materialises, `artifactsStandalone` a node whose whole output is imported artifact documents. Each of those must be an input kind this provider's `contract.inputKinds` claims; naming one it does not halts the build. `boundary` is for a key resolved once per boundary rather than per node — the name of an assembled artifact, or the placement context a cross-boundary reference is shaped from — where input kind is not a meaningful axis, so it is not matched against `contract.inputKinds`. A key read on more than one path lists every one. Absent makes no per-path claim: nothing is checked, and the key states only that the provider reads it somewhere. At least 1 entry. No entry may appear twice. Allowed values for each entry: `"sourced"`, `"synthesized"`, `"artifactsStandalone"`, `"boundary"`. |

_Additional properties are not permitted._

###### `plugin.spec.provider.contract`

The provider's self-declared render-behavior contract: the input kinds it renders, how it assembles a dispatch group's per-node output and which directories that output sits under, the template-delimiter pair it applies to imported artifact files, whether one loaded instance may serve every crossing, whether it wires cross-boundary edges, whether it honours omit entries, whether it accepts the files a Recipe contributes to its boundary's shared output, and which files its ecosystem never ships beside a source. It is the publish-time record of the provider plugin's self-report, which the host cross-checks against that self-report at publish and at load. Absent declares no render-behavior contract, and the cross-check compares only the per-export claims.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `inputKinds` | object | no | Which of the three Recipe input kinds this plugin renders: a sourced file set, a synthesized workload, and a standalone artifacts-only node. Each field is an independent claim. |
| `boundaryAssembly` | string (enum) | no | How the plugin combines a dispatch group's per-node render output: `none` writes each node's output directly at the dispatch path; `merge` folds the per-node fragments into one document; `nest` places each node's output under its own position in an umbrella structure. Absent carries no assembly claim. Allowed values: `"none"`, `"merge"`, `"nest"` |
| `artifactDelimiters` | object | no | The Go-template delimiter pair the plugin applies to imported artifact files. Absent means the default `{{`/`}}` pair; a plugin whose target syntax collides with that pair declares an alternate pair here. |
| `assemblyNameAnnotation` | object | no | The boundary annotation whose resolved value names the artifact the plugin assembles from a dispatch group. A plugin that folds a group's contributing boundaries into one named assembly declares the annotation key it reads and whether every contributing boundary must agree on that annotation's resolved value. Absent means the plugin names its assembly from the dispatch path alone. |
| `reusableInstance` | boolean | no | Whether one loaded plugin instance may serve every render, assemble, and validate crossing of a build rather than a fresh instance per crossing. Declared true only when the plugin holds no state across crossings — a pure function of its per-crossing input — so a single instance produces byte-identical output whether reused or freshly loaded. Absent (false) loads a fresh instance per crossing, isolating a plugin that carries state by construction. |
| `crossBoundaryLinking` | boolean | no | Whether the plugin wires a cross-boundary uses edge — a uses edge whose consuming and consumed ends assemble into different dispatch groups — by emitting provider-native cross-reference wiring through a paired link_publish/link_resolve export contract. Declared true only when the plugin exports both; a claim that does not match the export pair halts at load. Absent (false) declares no cross-boundary linking, so the host routes no link crossing to the plugin. |
| `omits` | boolean | no | Whether the provider honours omit entries — entries naming rendered units to leave out of a node's output: it leaves every unit an entry matches out of what it renders, and reports how many units each entry matched. It is the publish-time record of the `omits` claim the provider's self-report makes, and a value that differs from that report halts at load. Absent (false) declares no such support. |
| `boundaryArtifacts` | boolean | no | Whether the provider accepts the files a Recipe contributes to the shared output of the boundary it renders in, under the Recipe's `spec.boundary.artifacts`: the compiler writes each such file once, in the directory holding the boundary's assembled output, and the provider's target treats it as part of that output. It is the publish-time record of the `boundary_artifacts` claim the provider's self-report makes, and a value that differs from that report halts at load. Absent (false) declares no such support, and a Recipe declaring the block for this provider is refused before anything renders. |
| `nestSegment` | string | no | The directory this provider's target places each contributor's own sub-directory under, for a provider whose `boundaryAssembly` is `nest` — `charts` for a chart umbrella, `modules` for a root module. The compiler joins this directory, the contributor's name, and each file's own path. Read only for a nesting provider. Absent places each contributor's sub-directory directly at the boundary's own directory. The value names one directory and never a path. |
| `sourceIgnore` | object | no | The files this provider's ecosystem never ships beside a source it renders, as ignore rules in gitignore syntax — the publish-time record of the `source_ignore` rules its self-report declares. When an author pins a Recipe or FeatureRecipe whose capability this provider serves for them, these rules are composed with the author's own `.aggregaignore` and recorded in the `entity.lock` beside the entity, together with this plugin's name, and every later publication, comparison and render of the entity's local source applies the recorded rules. Where present it must equal what the self-report declares, and the load refuses a plugin whose report differs; absent makes no claim and is not compared. |

_Additional properties are not permitted._

###### `plugin.spec.provider.contract.inputKinds`

Which of the three Recipe input kinds this plugin renders: a sourced file set, a synthesized workload, and a standalone artifacts-only node. Each field is an independent claim.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `sourced` | boolean | no | Renders a sourced file set (a chart, a module, a compose file). |
| `synthesized` | boolean | no | Renders a synthesized workload into provider-native artifacts. |
| `artifactsStandalone` | boolean | no | Renders a standalone artifacts-only node — one carrying imported artifact documents and no source or workload. |

_Additional properties are not permitted._

###### `plugin.spec.provider.contract.artifactDelimiters`

The Go-template delimiter pair the plugin applies to imported artifact files. Absent means the default `{{`/`}}` pair; a plugin whose target syntax collides with that pair declares an alternate pair here.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `left` | string | yes | The opening delimiter. |
| `right` | string | yes | The closing delimiter. |

_Additional properties are not permitted._

###### `plugin.spec.provider.contract.assemblyNameAnnotation`

The boundary annotation whose resolved value names the artifact the plugin assembles from a dispatch group. A plugin that folds a group's contributing boundaries into one named assembly declares the annotation key it reads and whether every contributing boundary must agree on that annotation's resolved value. Absent means the plugin names its assembly from the dispatch path alone.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `annotation` | string | yes | The boundary annotation key the plugin reads the assembled artifact's name from. |
| `requireUnique` | boolean | no | Whether every boundary contributing to one dispatch group must agree on the annotation's resolved value. When true, a group whose contributing boundaries resolve the annotation to different values halts the build; when false, the plugin accepts the first resolved value. |

_Additional properties are not permitted._

###### `plugin.spec.provider.contract.sourceIgnore`

The files this provider's ecosystem never ships beside a source it renders, as ignore rules in gitignore syntax — the publish-time record of the `source_ignore` rules its self-report declares. When an author pins a Recipe or FeatureRecipe whose capability this provider serves for them, these rules are composed with the author's own `.aggregaignore` and recorded in the `entity.lock` beside the entity, together with this plugin's name, and every later publication, comparison and render of the entity's local source applies the recorded rules. Where present it must equal what the self-report declares, and the load refuses a plugin whose report differs; absent makes no claim and is not compared.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `patterns` | string[] | no | The ecosystem's own ignore patterns, each scoped to the root of the local source directory, in the order they apply. |
| `files` | string[] | no | The names of the ignore files the ecosystem honours inside a source — `.helmignore` for a chart. Each such file's lines are further patterns, scoped to the directory holding it. |

_Additional properties are not permitted._

##### `plugin.spec.pipelineStep`

The pipeline-step block for a `pluginType: pipeline-step` plugin: the provider capabilities its step is compatible with. Present only on pipeline-step plugins; absent on every other plugin type.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `capabilities` | string[] | no | Recorded from the plugin's `.wasm` self-report by `aggrega plugin gen-catalog`, so the plugin is the source of this list. An author may narrow it before publishing, removing an entry this entity should not offer, and may add none the self-report does not name: publish, and `aggrega validate` given the plugin's `.wasm` with `--plugin`, refuse a list naming a capability the self-report does not name. Publish sends the entity as written, never rewriting this list, and notes each capability the self-report names that the list leaves out. The provider capabilities this plugin's pipeline step is compatible with — the provider capability names, such as `helm` or `compose`, whose rendered output the step knows how to transform. A step is written against one provider's output shape at a time, so the list is an explicit, tested-compatibility claim rather than an aspiration. Entries preserve author order. It is the catalog-readable record of that claim; the build reads the same claim from the plugin when a step touches a scope and halts when the provider rendering that scope's documents is not among them. An empty or absent list declares no compatibility claim, so no scope admits the step. |

_Additional properties are not permitted._

##### `plugin.spec.parser`

The parser block for a `pluginType: parser` plugin: the source formats it turns into a canonical structured tree. Present only on parser plugins; absent on every other plugin type.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `capabilities` | string[] | no | Recorded from the plugin's `.wasm` self-report by `aggrega plugin gen-catalog`, so the plugin is the source of this list. An author may narrow it before publishing, removing an entry this entity should not offer, and may add none the self-report does not name: publish, and `aggrega validate` given the plugin's `.wasm` with `--plugin`, refuse a list naming a capability the self-report does not name. Publish sends the entity as written, never rewriting this list, and notes each capability the self-report names that the list leaves out. The source formats this parser turns into a canonical structured tree, each written as `parse:<format>` — for example `parse:yaml`. The prefix is part of the entry, so one plugin advertising several formats lists one entry per format. Entries preserve author order. A requested format resolves to the parser whose list contains the matching entry; a format no parser advertises halts the build, and a format advertised by more than one parser plugin halts as ambiguous. An empty or absent list declares no format claim, so the plugin parses nothing. |

_Additional properties are not permitted._

##### `plugin.spec.importer`

The importer block for a `pluginType: importer` plugin: the foreign source formats it turns into draft Aggrega authoring files, and the signatures a source of those formats is recognised by. Present only on importer plugins; absent on every other plugin type.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `capabilities` | string[] | no | Recorded from the plugin's `.wasm` self-report by `aggrega plugin gen-catalog`, so the plugin is the source of this list. An author may narrow it before publishing, removing an entry this entity should not offer, and may add none the self-report does not name: publish, and `aggrega validate` given the plugin's `.wasm` with `--plugin`, refuse a list naming a capability the self-report does not name. Publish sends the entity as written, never rewriting this list, and notes each capability the self-report names that the list leaves out. The foreign source formats this importer turns into draft Aggrega authoring files, each written as `import:<format>` — for example `import:terraform`. The prefix is part of the entry, so one plugin advertising several formats lists one entry per format. Entries preserve author order. A requested import format resolves to the importer whose list contains the matching entry; a format no importer advertises halts the import, and a format advertised by more than one importer plugin halts as ambiguous unless a `plugins.importer` entry in the workspace configuration attaches one of them, which then runs. An empty or absent list declares no format claim, so the plugin imports nothing. |
| `detect` | object[] | no | Machine-owned, do not author: derived from the plugin's `.wasm` self-report when the entity is generated from it, and recorded here in the order the self-report declares them. The signatures a source of this importer's formats is recognised by when an import names no format. `aggrega import` reads the signatures of every importer the workspace's catalog holds, every version included, and of the compiler's core importers, matches them against the source without knowing what any format is, and reads the source as the format of the one importer whose signature matches; a source no signature matches is refused asking for the format, and a source signatures of more than one format match is refused naming them. An importer recognising a source recognises it as every format it advertises, so an importer advertising more than one format has every match refused as ambiguous. Where present, the list must equal what the plugin's self-report declares, entry for entry and in order, and the load and the publication refuse a plugin whose report differs, naming this field. Absent makes no claim and is not compared, and the importer's formats are then reached only by naming them. |

_Additional properties are not permitted._

###### `plugin.spec.importer.detect[]`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `syntax` | string | yes | The syntactic format the source is parsed as — `json` or `yaml`, for example — which is the format a parser plugin advertises as `parse:<syntax>`. The source is parsed through the parser the workspace's catalog serves for that syntax, or, for a syntax the catalog serves none for, through the one the compiler carries, at most once whatever number of signatures name the syntax, and a source that does not parse in it matches no signature naming it. A syntax neither serves a parser for stops the recognition with that parser's absence named. At least 1 character long. |
| `files` | string[] | no | The file-name patterns the signature applies to, matched against the end of the source's name with its separators read as forward slashes: a pattern of one segment against the file's own name, and a pattern of several slash-separated segments against that many trailing segments of its path, so `.vscode/mcp.json` matches a file named `mcp.json` in a directory named `.vscode`. Within a segment `*` matches any run of characters, `?` one character, and `[...]` one character of a class. The signature applies when any pattern matches. Absent or empty applies it to a source that is one file, whatever it is called, and to no file of a directory. The patterns of an importer's signatures are also what decide which files of a directory `aggrega import` hands it. |
| `match` | object[] | no | The predicates the parsed tree must satisfy, all of them, in declared order. Absent or empty asks nothing of the tree beyond parsing in the syntax. |

_Additional properties are not permitted._

###### `plugin.spec.importer.detect[].match[]`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `path` | string | yes | Where in the tree the predicate looks, written as keys joined by dots from the top of the tree: `data.nodes` names the `nodes` member of the top-level `data` object. A segment written as a whole number, 0 or greater, selects that position of an array counting from zero, so `nodes.0.type` names the type of the first node; every other segment selects a member of an object. At least 1 character long. |
| `is` | string (enum) | yes | What the path must reach: `present` holds when it reaches a value of any kind, null included; `absent` holds when it reaches nothing; `object`, `array`, `string`, `number` and `boolean` each hold when it reaches a value of that kind. Allowed values: `"present"`, `"absent"`, `"object"`, `"array"`, `"string"`, `"number"`, `"boolean"` |
| `equals` | string | no | A string the value the path reaches must equal exactly; a value that is not a string never equals it. At most one of `equals` and `prefix` is declared on one predicate. At least 1 character long. |
| `prefix` | string | no | A string the value the path reaches must begin with; a value that is not a string never begins with it. At most one of `equals` and `prefix` is declared on one predicate. At least 1 character long. |

_Additional properties are not permitted._
