# Plugin

A `Plugin` is a content-addressed WebAssembly plugin: an OCI-hosted `.wasm` artifact pinned by `sha256` digest, declaring the socket type(s) it implements, the ABI version it targets, an optional signature pointer, and an optional runtime block. The entity is the authoring and metadata surface for a plugin; dependency resolution pins the artifact by digest and the per-registry trust policy verifies its signature at pull. The compiler is blind to the plugin's behaviour — it routes the pinned reference; the WebAssembly runtime executes the bytes.

This page covers the `Plugin` catalog authoring surface field by field. For the end-to-end author workflow — what a plugin is, the `describe()` self-report, the publish→pull→build lifecycle, signing, and versioning — see the [Wasm plugin developer guide](../plugins/plugin-developer-guide.md). For the socket points a plugin attaches to and their input/output shapes, see the [Wasm plugin contract](../plugins/plugin-contract.md).

## The Plugin's role

A `Plugin` ties a logical plugin identity to a concrete `.wasm` artifact and to the capability and runtime metadata the host needs to load and run it safely. A pipeline step or a plugin socket references the entity by its URI; the entity carries the declared capabilities, the runtime limits, and the signature pointer, while the resolved content digest lives in the release lockfile. The `.wasm` location is derived from the plugin's identity — the addressable coordinate `plugin/<pluginType>/<name>`, itself composed from `metadata.pluginType` and the bare `metadata.name`, plus the configured registry — and is not an authored field. The indirection through the entity is mandatory — a bare `.wasm` or artifact reference is rejected at load because no entity matches it.

A Plugin declares two distinct render surfaces, and keeping them apart is the key to reading the entity:

- **`spec.capabilities`** — a top-level served-list naming the capabilities this plugin serves. A *capability* is the render dimension a consumer requests — a provider engine kind such as `helm` or `compose`. It is monomorphic: every entry means the same thing, discriminated only by `metadata.pluginType`. A Recipe or FeatureRecipe requests one capability (`spec.capability`); the plugin whose `spec.capabilities` list includes that name serves it.
- **`spec.provider.contract`** — a per-type render-behavior contract (input kinds, boundary assembly, artifact delimiters, source filter, instance reuse). Unlike a capability, the contract is polymorphic render *behavior*, not a served dimension, so it sits under `spec.provider` beside the other provider-socket metadata.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Plugin
metadata:
  name: aws-secrets-manager
  version: 1.2.0
  pluginType: pipeline-step
spec:
  abiVersion: v1alpha1
  capabilities:
    - helm
    - compose
  signature:
    type: sigstore-cosign
  runtime:
    maxMemoryPages: 256
    timeoutMs: 5000
    # hostFunctions is stamped by publish from the .wasm — do not author it.
  exports:
    - name: fetch
      operates: emit
      scope: own
      selector: external-secret resources for the bound credential
```

## `metadata`

Standard catalog metadata. `name`, `version`, and `pluginType` are required; `version` is a strict Semantic Version (e.g. `1.2.0`). The optional fields — `description`, `maintainers`, `license`, `repository`, `home`, `keywords`, `deprecated` — follow the same shape every catalog entity carries. A published version is immutable: re-publishing an existing version is rejected at the publish gate.

`metadata.name` is bare — it carries no socket prefix. The plugin's addressable coordinate `plugin/<pluginType>/<name>` is derived from `metadata.pluginType` and the bare `metadata.name`; it is not authored into the name.

## `metadata.pluginType`

The socket type this plugin implements. It sits in the addressing block beside `name` and `version` because it is part of the plugin's identity: it supplies the `<pluginType>` segment of the derived `plugin/<pluginType>/<name>` coordinate. A plugin implements exactly one socket type, drawn from the plugin-type taxonomy the runtime recognises:

- `provider` — renders IR nodes into provider-native artifacts.
- `linter` — inspects authored content and raises diagnostics.
- `pipeline-step` — a feature-recipe-pipeline step that transforms IR within a pipeline.
- `governance` — serves the build-pipeline governance roles. At topology construction it auto-tags topology-graph node labels, returning JSON Patch documents the host applies to a labels-only projection of the graph. At static analysis or the render stage it evaluates the IR graph or the rendered artifacts and returns an accept/reject verdict; a failed rule halts the build. The role it is attached at, not its kind, fixes what it may emit.
- `parser` — parses a foreign source format (HCL, TOML, YAML, JSON, …) into a structured JSON tree, so a consumer that needs to read a format the compiler does not parse natively works from a parsed tree rather than the raw text.
- `importer` — turns a foreign infrastructure or agent-definition source into draft Aggrega authoring files, advertising the formats it handles as `import:<format>` capabilities.
- `cli` — contributes a runtime `aggrega <cmd>` subcommand an operator invokes at the command line. A runtime socket, distinct from the compile-time render and pipeline sockets.

Required.

## `spec.abiVersion`

The host/guest ABI version the plugin targets. `v1alpha1` is the only accepted value; a future ABI revision adds an accepted value. Required.

## `spec.capabilities`

A single top-level field declaring the capabilities this plugin *serves*, as capability names such as `helm` or `compose`; entries preserve author order. A capability is the render dimension a consumer requests. Its meaning is discriminated by `metadata.pluginType`: for a `provider` plugin it names the render-engine capabilities (the provider engine kinds whose output shape the plugin renders); for a `pipeline-step` plugin it names the provider capabilities the step is compatible with; a cross-cutting socket (`linter`, `governance`) leaves it empty. The meaning stays uniform — "what this plugin serves" — and does not drift to unrelated per-socket semantics.

For a `pipeline-step` plugin the list is render-enforced. When a pipeline step touches a scope, the provider rendering that scope's documents must appear in this list, or the build halts. An empty or absent list matches nothing, so the runtime halts any pipeline step that uses the plugin. Declare every provider whose output the plugin is tested against.

For a `pluginType: provider` plugin, `capabilities` declares the render capability(-ies) the plugin *serves*. The capability a Recipe requests (`spec.capability: helm`) binds to the provider-rendering Plugin whose `capabilities` list includes that name. When more than one Plugin serves the same capability, the workspace chooses: a provider binding in `.aggrega-config.yaml` (resolved at `aggrega pull` and recorded in the lockfile) selects one; with no binding and exactly one candidate, that candidate is used; with no binding and more than one candidate, the build halts loudly naming every candidate. Ambiguity is resolved per workspace at the point of use, not by a catalog-wide uniqueness rule.

## `spec.provider`

The provider-socket metadata for a `pluginType: provider` plugin: how its rendering engine translates the platform-owned `aggrega.ai/v1alpha1` Workload kind, and which platform-native annotations the engine reads. The block is present only on provider-rendering plugins; it is absent on `linter` and `pipeline-step` plugins, and on provider plugins whose engine renders only sourced or artifact content with no Workload synthesis.

### `spec.provider.workloadSchema`

A JSON Schema 2020-12 declaration documenting how this provider translates the `aggrega.ai/v1alpha1` Workload kind into provider-native manifests. Its presence marks a provider whose engine synthesizes: a synthesis-capable provider declares `workloadSchema` as the documented translation contract, describing what Workload fields the provider consumes, what closed sets each enum-shape field accepts, and what range constraints apply.

The body is compiled to JSON Schema 2020-12 when the Plugin loads — a structural guardrail that rejects a malformed schema at load rather than at render. Whether a `workload:` Recipe is supported is determined by the bound engine's synthesis capability, not by this field's presence: a synthesized-mode Recipe bound to a provider whose engine cannot synthesize halts loudly at render time. The standard-library catalog keeps `workloadSchema` in sync with engine capability. Today the field acts as a documented contract and a presence flag; it becomes executable input to Wasm translators in a future iteration. Workload bodies themselves are validated against the platform-owned embedded Workload schema, not against this per-provider field.

### `spec.provider.wellKnownAnnotations`

An ordered array enumerating the platform-native well-known annotation keys — those under the reserved `aggrega.ai/` namespace — that this provider's rendering engine reads, together with the behavior applied when each is absent. Each entry carries a `key` (the engine-read annotation, e.g. `aggrega.ai/namespace`), a `purpose` (what the annotation controls when present), and an optional `defaultBehavior` (what the engine does when the annotation is absent). `key` and `purpose` are required; entries preserve author order.

The field is documentation-of-contract: it describes which platform directives the engine recognises, for catalog readers and the `aggrega inspect` surface. The compiler does not consume it to gate, branch, or reject a build — it never cross-checks the annotations a deployment actually carries against this list. Schema validation checks only the shape of each entry (the key sits under the `aggrega.ai/` namespace, `purpose` is present); it is distinct from the runtime check that governs binding a value into the reserved namespace.

```yaml
metadata:
  pluginType: provider
spec:
  abiVersion: v1alpha1
  capabilities:
    - helm
  provider:
    workloadSchema: |
      # how the Workload kind translates to this provider's native output
      ...
    wellKnownAnnotations:
      - key: aggrega.ai/namespace
        purpose: Overrides the target namespace the engine renders into.
        defaultBehavior: Renders into the boundary's default namespace.
```

The per-provider annotation sets and `workloadSchema` content the standard-library providers ship are documented at [`../providers/well-known-annotations.md`](../providers/well-known-annotations.md), [`../providers/helm.md`](../providers/helm.md), [`../providers/helm-chart.md`](../providers/helm-chart.md), and [`../providers/compose.md`](../providers/compose.md).

### `spec.provider.contract`

A provider-rendering plugin's self-declared compile-time render-behavior contract: the input kinds it renders, how it assembles a dispatch group's per-node output, the template-delimiter pair it applies to imported artifact files, any restriction on which source files it consumes, and whether one loaded instance may serve every crossing. Unlike a served `capability` (a render dimension), the contract is per-type render *behavior*, so it lives here under `spec.provider`. It is authored as the claim the host cross-checks against the plugin's own `describe()` self-report at publish and at load; a disagreement halts. Absent declares no render-behavior contract, and the cross-check compares only the per-export claims. All fields are optional.

| Field | Effect |
| --- | --- |
| `inputKinds` | Which of the three Recipe input kinds the plugin renders, each an independent boolean claim: `sourced` (a sourced file set — a chart, a module, a compose file), `synthesized` (a synthesized Workload), and `artifactsStandalone` (a standalone node carrying imported artifact documents and no source or workload). The host gates a node's input kind against this set. |
| `boundaryAssembly` | How the plugin combines a dispatch group's per-node render output: `none` writes each node's output directly at the dispatch path; `merge` folds the per-node fragments into one document; `nest` places each node's output under its own position in an umbrella structure. Absent carries no assembly claim. |
| `artifactDelimiters` | The Go-template delimiter pair the plugin applies to imported artifact files, as `left` and `right`. Absent means the default `{{`/`}}` pair; a plugin whose target syntax collides with that pair declares an alternate pair (for example `[[`/`]]`). |
| `sourceFilter` | The source-file paths the plugin consumes when a node supplies a file set, in author order. Absent means the plugin consumes every file in the set. |
| `reusableInstance` | Whether one loaded plugin instance may serve every render, assemble, and validate crossing of a build rather than a fresh instance per crossing. Declared `true` only when the plugin holds no state across crossings, so a single instance produces byte-identical output whether reused or freshly loaded. Absent (`false`) loads a fresh instance per crossing, isolating a plugin that carries state by construction. `aggrega build --verify-determinism` proves a reusable plugin's output is stable by rendering each node twice and halting on any difference. |

```yaml
metadata:
  pluginType: provider
spec:
  capabilities:
    - helm-chart
  provider:
    contract:
      inputKinds:
        sourced: true
        synthesized: false
        artifactsStandalone: false
      boundaryAssembly: nest
      artifactDelimiters:
        left: "[["
        right: "]]"
      reusableInstance: true
```

## `spec.signature`

An optional descriptive pointer to the plugin's attached signature. The block is documentation only — it records where the signature lives and how it was produced for catalog readers; it does not itself admit the plugin. The enforcing check is the per-registry trust policy applied at pull: a signature is fetched as an OCI referrer, verified against the registry's trusted identities or pinned key, and recorded as a verified fact in the lockfile. A registry that requires signatures halts the pull when a required signature is missing, untrusted, or invalid.

- `type` — the signature scheme. `sigstore-cosign` is the supported scheme. Required when the block is present.
- `signatureRef` — the OCI referrer reference of the attached signature bundle, for documentation and discovery. Absent when the signature is discovered by referrer enumeration at pull rather than pinned here.
- `publicKeyRef` — a pointer to the public key the signature was produced with, for a keyed signature. Absent indicates a keyless (OIDC-identity) signature, verified against the registry's trusted identities.

## `spec.runtime`

Optional execution constraints the host applies when loading and running the plugin. Outbound network access is not an authoring field: a plugin never reaches the network at build time — the ahead-of-time boundary — so there is no host-allowlist field here. Remote content a plugin needs arrives through the host-mediated, digest-pinned external-input channel recorded in the Release's lockfile, never through ambient network access; the [developer guide](../plugins/plugin-developer-guide.md) documents the acquisition workflow.

| Field | Effect |
| --- | --- |
| `maxMemoryPages` | Caps the plugin's linear memory in Wasm pages (64 KiB per page). Zero or absent applies the platform default cap, so a load is never unbounded; an attachment that needs more raises this value. |
| `timeoutMs` | Caps per-call execution wall time in milliseconds. Zero or absent applies the platform default cap, so a call is never uncancellable; an attachment that runs longer raises this value. |
| `hostFunctions` | The host function names the plugin imports. Machine-derived and read-only — do not author it: publish reads the host functions from the `.wasm` import section and stamps this field, and the value reflects the published binary, validated against the curated allowlist. The host registers exactly this set, giving each plugin the least-privilege host surface its binary needs; pull re-derives and verifies the stamp against the binary. To preview the value before publishing, run `aggrega inspect --plugin <file.wasm>`. |
| `configKV` | Plugin-specific configuration the runtime hands the plugin at start, as string-to-string key/value pairs. Entries preserve author order so the emitted record is byte-identical across runs. Absent leaves the runtime's default empty configuration in effect. |

## `spec.exports`

The exports the plugin offers, each with its declared capability, as an ordered list that preserves author order. An export is one named entry point the host dispatches to (for example `render_node`, `lint_naming`, `step`); the per-export capability block is the authored claim of what that export does, which the host cross-checks against the plugin's `describe()` self-report at publish and at load. Absent declares no authored export surface.

| Field | Effect |
| --- | --- |
| `name` | The export's ABI name — the name the host dispatches to. Required for each entry. |
| `operates` | The pipeline operation the export performs: `patch` (modify an existing rendered document) or `emit` (add a new document). The host cross-checks the value against the plugin's self-report; it is a validated capability claim, not a dispatch switch — the operation a step performs is carried by the guest's returned result. Absent carries no operation claim. |
| `scope` | The document root the export operates on: `own` (the node's own rendered documents) or `host` (the documents of the component a component-scope FeatureRecipe is attached to). The host reads the declared scope ahead of the step to enforce provider compatibility against the provider rendering that scope. Absent defaults to `own`. |
| `selector` | A free-form, human-readable description of what the export acts on (for example `workloads carrying a pod template`). Documentation for catalog readers and the inspect surface; the compiler does not interpret it. |

## `spec.commands`

The top-level `aggrega <command>` verbs a `cli` plugin contributes, as an ordered list that preserves the order the plugin's `describe()` self-report declares. **Machine-owned and read-only — do not author it.** Publish reads the command surface from the plugin's `describe()` self-report and records it here, so the commands a CLI plugin installs are readable from the entity without loading the `.wasm`. A non-`cli` plugin contributes no commands and records an empty list. The host installs exactly this set; a recorded set that diverges from the plugin's `describe()` self-report halts at load, and publish refuses a set out of sync with the binary and directs the author to re-record it. To resync the record after changing the plugin, run [`aggrega plugin sync`](../cli/aggrega-plugin.md).

Each command entry carries:

| Field | Effect |
| --- | --- |
| `name` | The command verb the host registers — the `aggrega <name>` token an operator invokes, and the discriminator the host hands the plugin at invocation so a single plugin backing several commands routes on which command was called. Required for each entry. |
| `description` | The command's one-line short-help text, shown in the command listing and help output. Documentation only; the host does not act on it. |
| `flags` | The command's flags, in declared order. Each entry registers one flag on the command so `aggrega help <command>` renders it like a core command's flag. A command with no flags leaves it empty. |

Each `flags` entry declares one flag:

| Field | Effect |
| --- | --- |
| `name` | The flag's long name — the `--name` token an operator passes on the command line. Required for each entry. |
| `shorthand` | The flag's optional single-character short alias — the `-x` form an operator may pass instead of the long name. Absent means the flag has no short alias. |
| `description` | The flag's one-line help text, shown in the command's help output. Optional documentation; the host neither validates nor acts on it. |
| `type` | The flag's value type — for example `string`, `bool`, or `int`. Absent carries no type claim. |
| `default` | The flag's default value when the operator does not pass it, expressed as a string. Absent means the flag declares no default. |

A CLI plugin declares its commands and their flags in `describe()`; the host registers exactly that surface and renders each command's flags in `aggrega help <command>` the same way it renders a built-in command's flags.

```yaml
metadata:
  pluginType: cli
spec:
  abiVersion: v1alpha1
  # commands is recorded by publish from the plugin's describe() — do not author it.
  commands:
    - name: greet
      description: Print a friendly greeting
      flags:
        - name: name
          shorthand: n
          description: Who to greet
          type: string
          default: world
```

## Inspecting a Plugin

`aggrega inspect <path-to-Plugin.yaml>` renders a `Plugin` file: its identity and socket types, its `capabilities`, the per-export capability table in author order, the runtime constraints, and — at `--detail` — the signature pointer and the runtime config keys. A `Plugin` is inspectable by file path; the bare-name catalog lookup resolves Components only. See [`../cli/aggrega-inspect.md`](../cli/aggrega-inspect.md).

## Cross-references

- [Wasm plugin developer guide](../plugins/plugin-developer-guide.md) — the end-to-end author workflow: `describe()`, capability claims, runtime limits, lifecycle, signing, versioning.
- [Wasm plugin contract](../plugins/plugin-contract.md) — the socket points a plugin attaches to and their input/output shapes.
- [`entities/featurerecipe.md`](featurerecipe.md) — the FeatureRecipe `pipeline:` surface that references a plugin by entity URI.
- [`cli/aggrega-lint.md`](../cli/aggrega-lint.md) — the publishing-linter, the version-bump rubric, and immutability enforcement that govern publishing a `Plugin`.
