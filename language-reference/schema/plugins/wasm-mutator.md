# Aggrega Wasm Mutator Socket schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/wasm-mutator-v1beta1.schema.json`

The wire shapes a governance plugin attached at the label-transform role consumes (MutatorInput) and emits (MutatorOutput). The role runs at topology construction, after the graph is built and before it is judged: the plugin returns JSON Patch documents, and the host applies them to node labels and to nothing else, halting the build on a patch that reaches any other part of the graph. The Go, Rust and TypeScript payload types are generated from this schema into the plugin-ABI packages, so the three languages read and write one wire; a guest imports them from those packages, or through its plugin kit where the kit re-exports them.

## One of the following shapes

- `MutatorInput`
- `MutatorOutput`

## Definitions

### `MutatorInput`

The payload the host hands the mutator plugin on each invocation: release-level compilation context plus a projection of the topology graph carrying each node's labels and the values its instance declares.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `compilation_context` | CompilationContext | yes | Release-level metadata the mutator reads when deciding which compliance, FinOps, or governance rules apply to the build. |
| `graph` | MutatorGraph | yes | The projection of the topology graph exposed to the mutator plugin: each node's Component, its resolved version, its labels and the values its instance declares. Intentionally narrower than the full topology result: edges and feature payloads are not exposed because the mutator's job is labelling, not topology reshaping. The values are there to be read, so a configuration the developer declared can decide a label; a patch reaches labels and nothing else, so the plugin cannot change them. |
| `sources` | MutatorSource[] | no | Definition files the host reads and hands to the plugin verbatim, as an ordered list sorted by path. The host reads the bytes as opaque content and does not parse them. Absent when the attachment declares no sources. |
| `settings` | object | no | A free-form settings object the host hands to the plugin verbatim. The host does not parse or act on its content. Absent when the attachment declares no settings. |

_Additional properties are not permitted._

### `MutatorOutput`

The response shape the mutator plugin emits: a list of opaque JSON Patch documents the host applies to the topology graph. Patches stay opaque at the schema layer so the host need not duplicate the JSON Patch parser the guest already implements.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `patches` | any[] | yes | Opaque JSON Patch documents to apply to the topology graph, in order. |
| `error` | string | no | A failure message set when the guest ran but could not complete the operation; absent on success. The host surfaces a present error as a failed plugin invocation. |

_Additional properties are not permitted._

### `CompilationContext`

Release-level metadata the mutator reads when deciding which compliance, FinOps, or governance rules apply to the build.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `release_name` | string | yes | The Release's metadata.name. |
| `environment` | string | yes | The environment label the Release runs under (e.g., dev, staging, prod). |

_Additional properties are not permitted._

### `MutatorGraph`

The projection of the topology graph exposed to the mutator plugin: each node's Component, its resolved version, its labels and the values its instance declares. Intentionally narrower than the full topology result: edges and feature payloads are not exposed because the mutator's job is labelling, not topology reshaping. The values are there to be read, so a configuration the developer declared can decide a label; a patch reaches labels and nothing else, so the plugin cannot change them.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `nodes` | map of MutatorNode | yes | Nodes keyed by absolute node ID. |

_Additional properties are not permitted._

### `MutatorNode`

The per-node projection the mutator plugin evaluates its rules against: which Component the node implements, which version of that Component resolved, which labels the node carries, and which values its instance declares.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `component` | string | yes | The name of the underlying Component the node instantiates. |
| `resolved_version` | string | yes | The exact Semantic Version of the Component the resolver pinned for this node. |
| `labels` | map of string | yes | The node's duck-typing and ontology labels. |
| `values` | object | no | The values the node's component instance declares in the Aggregate, keyed as the author wrote them and in the author's order. Every template in the Aggregate has already been evaluated against its parameters, so a value hoisted into a parameter arrives as the value the Release supplied, or as the parameter's default. Only the instance's own values are here: a default the Component's schema declares, and anything a Recipe or a Feature contributes, are not. A value the Component declares sensitive arrives withheld, exactly as the governance verdict over the whole graph receives it: in its place sits the same single-key withheld-marker object that verdict carries, naming the reason declared, and a sibling value no declaration reaches arrives as written. A plugin reads them to decide which labels to add; a patch cannot reach them. Absent when the instance declares no values. |

_Additional properties are not permitted._

### `MutatorSource`

One definition file handed to the plugin: its base-name path and the file's content. Both are carried verbatim; the host does not parse the content.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `path` | string | yes | The base name of the source file. The host supplies the base name only, never an absolute host path, so the wire is portable and deterministic. |
| `content` | string | yes | The source file's content, carried verbatim as an opaque string. |

_Additional properties are not permitted._
