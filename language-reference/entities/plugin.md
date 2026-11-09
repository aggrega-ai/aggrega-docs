# Plugin

A `Plugin` is a content-addressed WebAssembly plugin: an OCI-hosted `.wasm` artifact pinned by `sha256` digest, declaring the socket type it implements, the ABI version it targets, an optional signature pointer, and an optional runtime block. The entity is the authoring and metadata surface for a plugin; dependency resolution pins the artifact by digest and the per-registry trust policy verifies its signature at pull. The compiler does not interpret the plugin's behaviour — it routes the pinned reference; the WebAssembly runtime executes the bytes.

This page covers the `Plugin` catalog authoring surface field by field. For the end-to-end author workflow — what a plugin is, the `describe()` self-report, the publish→pull→build lifecycle, signing, and versioning — see the [Wasm plugin developer guide](../plugins/plugin-developer-guide.md). For the socket points a plugin attaches to and their input/output shapes, see the [Wasm plugin contract](../plugins/plugin-contract.md).

## The Plugin's role

A `Plugin` ties a logical plugin identity to a concrete `.wasm` artifact and to the capability and runtime metadata the host needs to load and run it safely. A pipeline step or a plugin socket references the entity by its URI; the entity carries the declared capabilities, the runtime limits, and the signature pointer, while the resolved content digest lives in the release lockfile. The `.wasm` location is derived from the plugin's identity — the addressable coordinate `plugin/<pluginType>/<name>`, itself composed from `metadata.pluginType` and the bare `metadata.name`, plus the configured registry — and is not an authored field. The indirection through the entity is mandatory — a bare `.wasm` or artifact reference is rejected at load because no entity matches it.

A Plugin's declarations are grouped by socket type, and that grouping is where reading the entity starts:

- **One block per socket type** — `spec.provider`, `spec.pipelineStep`, `spec.parser`, `spec.importer`. A plugin carries the one block its `metadata.pluginType` names, and every block holds a `capabilities:` list — recorded from the plugin's own `describe()` by `aggrega plugin gen-catalog` — whose meaning belongs to that block alone: a provider's list names the capabilities it serves, a pipeline step's names the provider capabilities its step is compatible with, and a parser's and an importer's name source formats, written `parse:<format>` and `import:<format>`. Containment is what carries the meaning — a capability entry cannot be reached without first reading the block that says which kind of claim it is.
- **A provider block carries more than its list** — `spec.provider` also declares how the plugin translates the Workload kind, which platform-native annotations it reads, and its render-behavior contract (`spec.provider.contract`: input kinds, boundary assembly, artifact delimiters, instance reuse). Those describe render *behavior* rather than a served dimension, which is why they sit beside the provider's capability list rather than inside it.
- **A cross-cutting socket declares no capabilities** — a `linter`, `governance`, or `cli` plugin carries none of the four blocks, because it serves no render dimension and no source format.

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Plugin
metadata:
  name: aws-secrets-manager
  version: 1.2.0
  pluginType: pipeline-step
spec:
  abiVersion: v1beta1
  pipelineStep:
    # capabilities is recorded by `aggrega plugin gen-catalog` from the plugin's describe(); an author may narrow it.
    capabilities:
      - helm
      - compose
  signature:
    type: sigstore-cosign
  runtime:
    maxMemoryPages: 256
    timeoutMs: 5000
    # hostFunctions is recorded by `aggrega plugin sync` from the .wasm — do not author it.
  exports:
    - name: fetch
      operates: emit
      scope: own
      selector: external-secret resources for the bound credential
```

## `metadata`

Standard catalog metadata. `name`, `version`, and `pluginType` are required; `version` is a strict Semantic Version (e.g. `1.2.0`). The optional fields — `description`, `maintainers`, `license`, `repository`, `home`, `keywords` — follow the same shape every catalog entity carries, and `metadata` accepts no other key. A published version is immutable: re-publishing an existing version is rejected at the publish gate.

`metadata.name` is bare — it carries no socket prefix. The plugin's addressable coordinate `plugin/<pluginType>/<name>` is derived from `metadata.pluginType` and the bare `metadata.name`; it is not authored into the name.

## `metadata.pluginType`

The socket type this plugin implements. It sits in the addressing block beside `name` and `version` because it is part of the plugin's identity: it supplies the `<pluginType>` segment of the derived `plugin/<pluginType>/<name>` coordinate. A plugin implements exactly one socket type, drawn from the plugin-type taxonomy the runtime recognises:

- `provider` — renders IR nodes into provider-native artifacts.
- `linter` — inspects authored content and raises diagnostics.
- `pipeline-step` — a step in a FeatureRecipe's or a Recipe's `pipeline:` that patches the rendered document set.
- `governance` — serves the build-pipeline governance roles. At topology construction it auto-tags topology-graph node labels, returning JSON Patch documents the host applies to a labels-only projection of the graph. At static analysis or the render stage it evaluates the IR graph or the rendered artifacts and returns an accept/reject verdict; a failed rule halts the build. The role it is attached at, not its kind, fixes what it may emit.
- `parser` — parses a foreign source format (HCL, TOML, YAML, JSON, …) into a structured JSON tree, so a consumer that needs to read a format the compiler does not parse natively works from a parsed tree rather than the raw text.
- `importer` — turns a foreign infrastructure or agent-definition source into draft Aggrega authoring files, advertising the formats it handles as `import:<format>` capabilities.
- `cli` — contributes a runtime `aggrega <cmd>` subcommand an operator invokes at the command line. A runtime socket, distinct from the compile-time render and pipeline sockets.

Required.

## `spec.abiVersion`

The host/guest ABI version the plugin targets. `v1beta1` is the accepted value; a new ABI revision adds one. Required.

## Declaring capabilities: one block per socket type

A *capability* is what a consumer asks a plugin for — a render capability a Recipe requests, or a source format a build needs read. A plugin's capabilities are recorded inside the block belonging to its socket type, so which block the list sits in is what fixes what its entries mean:

| `metadata.pluginType` | Where its capabilities are declared | What an entry names |
| --- | --- | --- |
| `provider` | [`spec.provider.capabilities`](#specprovidercapabilities) | A render capability this plugin serves, such as `helm` or `compose`. |
| `pipeline-step` | [`spec.pipelineStep.capabilities`](#specpipelinestep) | A provider whose rendered output this plugin's step is compatible with. |
| `parser` | [`spec.parser.capabilities`](#specparser) | A source format this plugin reads, written `parse:<format>`. |
| `importer` | [`spec.importer.capabilities`](#specimporter) | A foreign source format this plugin drafts entities from, written `import:<format>`. |
| `linter`, `governance`, `cli` | — | Nothing. These sockets serve no capability, so they carry none of the four blocks. |

A plugin implements exactly one socket type, so its entity carries one block. The list is the plugin's own report: `aggrega plugin gen-catalog` reads the plugin's `describe()` and writes each capability it reports into the block. An author may narrow the list before publishing, leaving out a capability the plugin reports that the published entity should not offer; `aggrega validate <entity> --plugin <file.wasm>` and `aggrega push` accept a narrowed list and print a notice naming each capability the plugin reports that the list leaves out. Neither accepts a list that names a capability the plugin does not report: both refuse it, naming each such capability and the capabilities the plugin does report, so a published list never offers more than the plugin provides. A pipeline-step entity whose plugin reports `helm` and `helm-chart`, listing `compose` as well, is refused like this:

```text
[E0080]
  entity "probe-step:1.0.0-rc.1" lists capabilities ["compose"], which the plugin's describe() does not report (it reports ["helm" "helm-chart"]); remove them from the list, which may name only capabilities the plugin reports: wasm: entity contract claim does not match plugin describe()
```

A consumer resolves against exactly what is listed.

## `spec.provider`

The provider-socket block for a `pluginType: provider` plugin: the capabilities it serves, how it translates the platform-owned `aggrega.ai/v1beta1` Workload kind, which platform-native annotations it reads, and its render-behavior contract. The block is present on every provider-rendering plugin and absent on every other plugin type. A provider that renders only sourced or artifact content with no Workload synthesis still carries the block — it declares its capabilities and its contract there, and simply omits `workloadSchema`.

### `spec.provider.capabilities`

The capabilities this provider serves — capability names such as `helm` or `compose` — whose output shape it renders. A provider is generic across artifacts that share a capability's output shape, not across all capabilities, so the list names the capabilities the plugin itself reports: `aggrega plugin gen-catalog` records it from the plugin's `describe()`, and an author may narrow it before publishing. Entries keep the order they are recorded in.

A Recipe's requested provider target (`spec.capability: helm`) resolves to the provider plugin whose list contains that target. When more than one provider plugin lists the same target, the workspace chooses: the `plugins.providers` selection in the workspace configuration names which plugin to use, resolved at `aggrega pull` and recorded in the lockfile. With no selection and exactly one candidate, that candidate is used; with no selection and more than one candidate, the build halts and names every candidate. Ambiguity is settled per workspace at the point of use rather than by a catalog-wide uniqueness rule. An empty or absent list declares no capability claim, so the plugin serves no target.

A capability name here carries no colon. A Recipe's `spec.capability` is read as the capability up to its last colon and a version pin after it, so a name containing one could never be asked for; a plugin whose `describe()` reports such a name is refused when it loads, and no entity is generated from it for publication. The same holds for the provider capabilities a `pipeline-step` plugin lists. The colon in a parser's `parse:<format>` and an importer's `import:<format>` is part of those names and stays.

### `spec.provider.workloadSchema`

A JSON Schema 2020-12 declaration documenting how this provider translates the `aggrega.ai/v1beta1` Workload kind into provider-native manifests. It is declared by convention on a provider that synthesizes: such a provider declares `workloadSchema` as the documented translation contract, describing what Workload fields the provider consumes, what closed sets each enum-shape field accepts, and what range constraints apply.

The body is compiled to JSON Schema 2020-12 when the Plugin loads — a structural guardrail that rejects a malformed schema at load rather than at render. Whether a `workload:` Recipe is supported is determined by the bound provider's synthesis capability, not by this field's presence: a synthesized-mode Recipe bound to a provider that cannot synthesize halts loudly at render time. The standard-library catalog keeps `workloadSchema` in sync with provider capability. The field is the documented contract; nothing else reads it. Workload bodies themselves are validated against the platform-owned embedded Workload schema, not against this per-provider field.

### `spec.provider.wellKnownAnnotations`

An ordered array enumerating the platform-native well-known annotation keys — those under the reserved `aggrega.ai/` namespace — that this provider reads, together with the behavior applied when each is absent. Each entry carries a `key` (the provider-read annotation, e.g. `aggrega.ai/namespace`), a `purpose` (what the annotation controls when present), an optional `defaultBehavior` (what the provider does when the annotation is absent), and an optional `scope` listing where the provider reads the key — `sourced`, `synthesized` or `artifactsStandalone`, the Recipe input kinds, or `boundary` for a key read once per boundary. `key` and `purpose` are required; entries preserve author order.

The field is the provider's support claim, and the compiler reads it in two ways. An entry whose `scope` names an input kind the block's own `contract.inputKinds` does not claim contradicts that claim, and the Plugin is refused, naming the key and the scope. And when a build renders through this provider, an `aggrega.ai/` annotation that no entry covers on any input kind the render declares draws a warning naming the key, the provider and those input kinds; the value still passes through untouched and the build does not halt. Absent, the field makes no claim at all, and no such warning is raised for this provider. Schema validation checks only the shape of each entry (the key sits under the `aggrega.ai/` namespace, `purpose` is present); it is distinct from the runtime check that governs binding a value into the reserved namespace.

```yaml
metadata:
  pluginType: provider
spec:
  abiVersion: v1beta1
  provider:
    capabilities:            # recorded by `aggrega plugin gen-catalog` from describe()
      - helm
    workloadSchema: |
      # how the Workload kind translates to this provider's native output
      ...
    wellKnownAnnotations:
      - key: aggrega.ai/namespace
        purpose: Overrides the target namespace the provider renders into.
        defaultBehavior: Renders into the boundary's default namespace.
```

The per-provider annotation sets and `workloadSchema` content the standard-library providers ship are documented at [`../providers/well-known-annotations.md`](../providers/well-known-annotations.md), [`../providers/helm.md`](../providers/helm.md), [`../providers/helm-chart.md`](../providers/helm-chart.md), and [`../providers/compose.md`](../providers/compose.md).

### `spec.provider.readsNoWellKnownAnnotations`

Declares that this provider reads none of the platform-native well-known annotation keys. It is a support claim covering no key, and it says something that leaving both it and `wellKnownAnnotations` out does not: an absent claim is silence, while this one is the provider's own statement that it reads nothing under the reserved `aggrega.ai/` namespace. A build rendering through such a provider warns about every `aggrega.ai/` annotation that reaches the render, naming the key, the provider and the input kinds the render declares; the value still passes through untouched and the build does not halt.

Only `true` may be written, so leaving the field out stays the one way to say nothing. It cannot be written together with `wellKnownAnnotations`: a provider that reads some of the keys lists those there instead. Both refusals are schema-level, so the Plugin is refused when it is read.

```yaml
spec:
  provider:
    capabilities:
      - terraform
    readsNoWellKnownAnnotations: true
```

The standard-library `terraform` provider declares it; [`../providers/terraform.md`](../providers/terraform.md) says what that means for a Release rendered through it.

### `spec.provider.contract`

A provider-rendering plugin's self-declared compile-time render-behavior contract: the input kinds it renders, how it assembles a dispatch group's per-node output, the template-delimiter pair it applies to imported artifact files, whether one loaded instance may serve every crossing, whether it honours omit entries, and whether it accepts the files a Recipe contributes to its boundary's shared output. It sits beside `capabilities` in the same block but answers a different question: the capability list says *which* capabilities this plugin serves, while the contract says *how* it renders them. `aggrega plugin gen-catalog` records it from the plugin's own `describe()` self-report, and the host cross-checks it against that self-report at publish and at load; a disagreement halts. Absent declares no render-behavior contract, and the cross-check compares only the per-export claims. All fields are optional.

| Field | Effect |
| --- | --- |
| `inputKinds` | Which of the three Recipe input kinds the plugin renders, each an independent boolean claim: `sourced` (a sourced file set — a chart, a module, a compose file), `synthesized` (a synthesized Workload), and `artifactsStandalone` (a standalone node carrying imported artifact documents and no source or workload). The host gates a node's input kind against this set. |
| `boundaryAssembly` | How the plugin combines a dispatch group's per-node render output: `none` writes each node's output directly at the dispatch path; `merge` folds the per-node fragments into one document; `nest` places each node's output under its own position in an umbrella structure. Absent carries no assembly claim. |
| `artifactDelimiters` | The Go-template delimiter pair the plugin applies to imported artifact files, as `left` and `right`. Absent means the default `{{`/`}}` pair; a plugin whose target syntax collides with that pair declares an alternate pair (for example `[[`/`]]`). |
| `reusableInstance` | Whether one loaded plugin instance may serve every render, assemble, and validate crossing of a build rather than a fresh instance per crossing. Declared `true` only when the plugin holds no state across crossings, so a single instance produces byte-identical output whether reused or freshly loaded. Absent (`false`) loads a fresh instance per crossing, isolating a plugin that carries state by construction. `aggrega build --verify-determinism` proves a reusable plugin's output is stable by rendering each node twice and halting on any difference. |
| `omits` | Whether the plugin honours omit entries — entries naming rendered units to leave out of a node's output: it leaves every unit an entry matches out of what it renders, and reports how many units each entry matched. The value records the claim the plugin's `describe()` reports, so `true` is right only for a plugin that reports it, and a value that differs from the report halts. Absent (`false`) declares no such support. |
| `boundaryArtifacts` | Whether the plugin's target accepts the files a Recipe contributes to the shared output of the boundary it renders in, under the Recipe's [`spec.boundary.artifacts`](recipe.md#the-boundary-block--files-for-the-boundarys-shared-output): the compiler writes each such file once, beside what the plugin assembles for the boundary, and the target reads it as part of that output. The value records the claim the plugin's `describe()` reports, and a value that differs from the report halts. Absent (`false`) declares no such support, and a Recipe declaring the block for this plugin is refused before anything renders. |

```yaml
metadata:
  pluginType: provider
spec:
  provider:
    capabilities:            # recorded by `aggrega plugin gen-catalog` from describe()
      - helm-chart
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

## `spec.pipelineStep`

The pipeline-step block for a `pluginType: pipeline-step` plugin. Its one field, `capabilities`, names the providers whose rendered output the plugin's step knows how to transform — capability names such as `helm` or `compose`. A step is written against one provider's output shape at a time, so the list names the providers the plugin itself reports; entries keep the order they are recorded in. The block is present only on pipeline-step plugins.

The block is the catalog-readable record of that claim: `aggrega plugin gen-catalog` records it from the plugin's own `describe()` self-report, and an author may narrow it before publishing. The enforcement reads the same claim from the plugin: when a step touches a scope, the build halts unless the provider rendering that scope's documents is among the ones the plugin claims. An empty or absent list declares no compatibility claim, so no scope admits the step.

```yaml
metadata:
  pluginType: pipeline-step
spec:
  abiVersion: v1beta1
  pipelineStep:
    capabilities:            # recorded by `aggrega plugin gen-catalog` from describe()
      - helm
      - compose
```

## `spec.parser`

The parser block for a `pluginType: parser` plugin. Its one field, `capabilities`, names the source formats the plugin turns into a canonical structured tree, each written `parse:<format>`. The prefix is part of the entry, so a plugin that reads several formats lists one entry per format. `aggrega plugin gen-catalog` records the list from the plugin's own `describe()`, an author may narrow it before publishing, and entries keep the order they are recorded in. The block is present only on parser plugins.

A requested format resolves to the parser whose list contains the matching entry. A format no parser advertises halts the build, and a format advertised by more than one parser plugin halts as ambiguous, naming the candidates — there is no fallback, because a parser has no zero-configuration default to fall back to. An empty or absent list declares no format claim, so the plugin parses nothing.

```yaml
metadata:
  pluginType: parser
spec:
  abiVersion: v1beta1
  parser:
    capabilities:            # recorded by `aggrega plugin gen-catalog` from describe()
      - parse:hcl
      - parse:toml
```

## `spec.importer`

The importer block for a `pluginType: importer` plugin. Its `capabilities` field names the foreign source formats the plugin turns into draft Aggrega authoring files, each written `import:<format>`. The prefix is part of the entry, so a plugin that handles several formats lists one entry per format. `aggrega plugin gen-catalog` records the list from the plugin's own `describe()`, an author may narrow it before publishing, and entries keep the order they are recorded in. The block is present only on importer plugins.

A requested import format resolves to the importer whose list contains the matching entry. A format no importer advertises halts the import, and a format advertised by more than one importer plugin halts as ambiguous, naming the candidates, unless a `plugins.importer` entry in the workspace configuration attaches one of them, which is then the one that runs. An empty or absent list declares no format claim, so the plugin imports nothing.

Its `detect` field records the signatures a source of those formats is recognised by when an import names no format. It is machine-owned, like the host-function and command records: it is derived from what the plugin's `describe()` reports when the entity is generated from the plugin, in the order the plugin declares the signatures, and an author does not write it. Each signature names:

- `syntax` — the syntactic format the source is parsed as, the format a parser plugin advertises as `parse:<syntax>`, such as `json` or `yaml`.
- `files` — optional file-name patterns, matched against the end of the source's name: a pattern of one segment against the file's own name, one of several slash-separated segments against that many trailing segments of its path, so `.vscode/mcp.json` matches a file named `mcp.json` in a directory named `.vscode`. `*`, `?` and `[...]` match within a segment. Absent, the signature applies to a source that is one file, whatever it is called, and to no file of a directory. The patterns of an importer's signatures are also what decide which files of a directory [`aggrega import`](../cli/aggrega-import.md) hands it.
- `match` — the predicates the parsed tree must satisfy, all of them. Each has a `path`, keys joined by dots from the top of the tree, with a whole-number segment selecting an array position; an `is`, one of `present`, `absent`, `object`, `array`, `string`, `number` and `boolean`; and optionally `equals`, a string the value must be, or `prefix`, a string it must begin with — at most one of the two.

When an import names no format, the signatures of every importer the workspace's catalog holds — every version included — and of the compiler's [core importers](../plugins/core-importers.md) are matched against the source. The source is parsed once for each syntax a signature applying to its name reads it in, through the parser the workspace's catalog serves for that syntax — or, for a syntax the catalog serves no parser for, the one the compiler itself carries — and a source that does not parse in a syntax matches no signature naming it. A directory is matched through its files: each signature is tried against the files of the directory its patterns select, in name order, and a signature declaring no pattern applies to none of them. A source a signature matches is recognised as every format its importer advertises. Exactly one format recognised is the one the source is read as. A source no signature matches is refused, asking for the format and naming the formats the importers advertise — or, for a directory, asking for one of its files on its own or for a format whose importer declares file patterns, naming only those; a source recognised as more than one format is refused naming them, with the condition [More than one importer recognises the source](../errors/fatal-halts.md#more-than-one-importer-recognises-the-source). So an importer advertising more than one format has every source its signatures match refused as ambiguous, and an importer whose sources are to be recognised serves one format.

Where the entity records `detect`, it must equal what the plugin's `describe()` reports, signature for signature and in order: loading the importer refuses a plugin whose report differs, naming `importer.detect`, and so does publishing it. An entity recording no `detect` makes no claim and is not compared, so it loads whatever signatures its plugin's `describe()` reports, and its importer's formats are then reached only by naming them.

```yaml
metadata:
  pluginType: importer
spec:
  abiVersion: v1beta1
  importer:
    capabilities:            # recorded by `aggrega plugin gen-catalog` from describe()
      - import:langflow
    detect:
      - syntax: json
        match:
          - path: data.nodes
            is: array
```

## `spec.signature`

An optional descriptive pointer to the plugin's attached signature. The block is documentation only — it records where the signature lives and how it was produced for catalog readers; it does not itself admit the plugin. The enforcing check is the per-registry trust policy applied at pull: a signature is fetched as an OCI referrer, verified against the registry's trusted identities or pinned key, and recorded as a verified fact in the lockfile. A registry that requires signatures halts the pull when a required signature is missing, untrusted, or invalid.

- `type` — the signature scheme. `sigstore-cosign` is the supported scheme. Required when the block is present.
- `signatureRef` — the OCI referrer reference of the attached signature bundle, for documentation and discovery. Absent when the signature is discovered by referrer enumeration at pull rather than pinned here.
- `publicKeyRef` — a pointer to the public key the signature was produced with, for a keyed signature. Absent indicates a keyless (OIDC-identity) signature, verified against the registry's trusted identities.

## `spec.runtime`

Optional execution constraints the host applies when loading and running the plugin. Outbound network access is not an authoring field: a plugin never reaches the network at build time — the ahead-of-time boundary — so there is no host-allowlist field here. Remote content a plugin needs arrives through the host-mediated, digest-pinned external-input channel recorded in the Release's lockfile, never through ambient network access; the [developer guide](../plugins/plugin-developer-guide.md) documents the fetch wrapper and the pin discipline.

| Field | Effect |
| --- | --- |
| `maxMemoryPages` | Caps the plugin's linear memory in Wasm pages (64 KiB per page). Zero or absent applies the platform default cap, so a load is never unbounded; an attachment that needs more raises this value. |
| `timeoutMs` | Caps how long the plugin's own code may run during one call, in milliseconds, not counting time spent inside the host functions it calls. On Linux the measure is processor time, so time spent waiting for a processor on a busy machine does not count; on other systems it is elapsed time. The first call to a freshly loaded plugin also counts the plugin's own start-up. Zero or absent applies the platform default cap, so a call is never uncancellable; an attachment that runs longer raises this value. |
| `hostFunctions` | The host function names the plugin imports. Machine-derived and read-only — do not author it: `aggrega plugin sync` reads the host functions from the `.wasm` import section and records this field, publish refuses a record that differs from the binary, and the value reflects the published binary, validated against the curated allowlist. The host registers exactly this set, giving each plugin the least-privilege host surface its binary needs; pull re-derives and verifies the stamp against the binary. To preview the value before publishing, run `aggrega inspect --plugin <file.wasm>`. |
| `configKV` | Plugin-specific configuration the runtime hands the plugin at start, as string-to-string key/value pairs. Entries preserve author order so the emitted record is byte-identical across runs. Absent leaves the runtime's default empty configuration in effect. |

## `spec.exports`

The exports the plugin offers, each with its declared capability, as an ordered list that preserves author order. An export is one named entry point the host dispatches to (for example `render_node`, `lint_naming`, `step`); the per-export capability block states what that export does, as `aggrega plugin gen-catalog` records it from the plugin's `describe()` self-report, and the host cross-checks it against that self-report at publish and at load. Absent declares no authored export surface.

| Field | Effect |
| --- | --- |
| `name` | The export's ABI name — the name the host dispatches to. Required for each entry. |
| `operates` | The pipeline operation the export performs: `patch` (modify an existing rendered document) or `emit` (add a new document). The host cross-checks the value against the plugin's self-report; it is a validated capability claim, not a dispatch switch — the operation a step performs is carried by the guest's returned result. Absent carries no operation claim. |
| `scope` | The document root the export operates on: `own` (the node's own rendered documents) or `host` (the documents of the component a component-scope FeatureRecipe is attached to). The host reads the declared scope ahead of the step to enforce provider compatibility against the provider rendering that scope. Absent defaults to `own`. |
| `selector` | A free-form, human-readable description of what the export acts on (for example `workloads carrying a pod template`). Documentation for catalog readers and the inspect surface; the compiler does not interpret it. |

## `spec.commands`

The top-level `aggrega <command>` verbs a `cli` plugin contributes, as an ordered list that preserves the order the plugin's `describe()` self-report declares. **Machine-owned and read-only — do not author it.** `aggrega plugin sync` reads the command surface from the plugin's `describe()` self-report and records it here, so the commands a CLI plugin installs are readable from the entity without loading the `.wasm`. A non-`cli` plugin contributes no commands and records an empty list. The host installs exactly this set; a recorded set that diverges from the plugin's `describe()` self-report halts at load, and publish refuses a set out of sync with the binary and directs the author to re-record it. To resync the record after changing the plugin, run [`aggrega plugin sync`](../cli/aggrega-plugin.md).

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
| `shorthand` | The flag's optional short alias — the `-x` form an operator may pass instead of the long name — as a single ASCII letter or digit. Absent means the flag has no short alias. |
| `description` | The flag's one-line help text, shown in the command's help output. Optional documentation; the host neither validates nor acts on it. |
| `type` | The flag's value type — `string`, `bool` or `int` — and the kind of flag help renders it as. Absent renders it as a string flag. |
| `default` | The flag's default value when the operator does not pass it, expressed as a string. For a `bool` or `int` flag it is a value of that type. Absent means the flag declares no default. |

A CLI plugin declares its commands and their flags in `describe()`; the host registers exactly that surface and renders each command's flags in `aggrega help <command>` the same way it renders a built-in command's flags.

The host checks every flag a plugin declares when it adds the plugin's commands, and a plugin whose declarations fail is **skipped rather than added**: none of its commands is registered, a warning names the plugin, the command, the flag and what is wrong with it, and every other command — built-in or from another plugin — keeps working. A declaration fails when:

- a flag has no name, or a command declares the same name twice;
- a shorthand is anything other than a single ASCII letter or digit, or a command declares the same shorthand for two flags;
- a name or shorthand reuses a flag every `aggrega` command already has — `--help`, its `-h`, and the global flags such as `--offline` and `--config`;
- a type is anything other than `string`, `bool` or `int`;
- a default does not parse as the flag's type — `maybe` for a `bool`, `three` for an `int`.

The single-character shape of `shorthand` and the three values of `type` are also part of this entity's schema, so a `Plugin` entity recording any other value is refused when the catalog loads. That a name or shorthand appears once per command, that none reuses a flag every command has, and that a default parses as its type are checked by the host alone. The check covers whether the host can declare a flag for help as written; it does not see whether the plugin reads the flags it declares, because the plugin parses its own arguments.

```yaml
metadata:
  pluginType: cli
spec:
  abiVersion: v1beta1
  # commands is recorded by `aggrega plugin sync` from the plugin's describe() — do not author it.
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

`aggrega inspect <path-to-Plugin.yaml>` renders a `Plugin` file: its identity and socket type, the capabilities its block declares, the per-export capability table in author order, the runtime constraints, and — at `--detail` — the signature pointer and the runtime config keys. A `Plugin` is addressable by file path, or by its `<pluginType>/<name>` coordinate against the catalog. See [`../cli/aggrega-inspect.md`](../cli/aggrega-inspect.md).

## Cross-references

- [Wasm plugin developer guide](../plugins/plugin-developer-guide.md) — the end-to-end author workflow: `describe()`, capability claims, runtime limits, lifecycle, signing, versioning.
- [Wasm plugin contract](../plugins/plugin-contract.md) — the socket points a plugin attaches to and their input/output shapes.
- [`entities/featurerecipe.md`](featurerecipe.md) — the FeatureRecipe `pipeline:` surface that references a plugin by entity URI.
- [`cli/aggrega-lint.md`](../cli/aggrega-lint.md) — the publishing-linter, the version-bump rubric, and immutability enforcement that govern publishing a `Plugin`.
