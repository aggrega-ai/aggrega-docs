# Aggrega Wasm Mutator Socket schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/wasm-mutator-v1alpha1.schema.json`

The JSON wire shapes the mutator.wasm plugin socket consumes (MutatorInput) and emits (MutatorOutput). The mutator runs at topology construction and applies JSON Patch documents to the topology graph before the IR builder consumes it. The two wire shapes are co-canonical with the host's Go types and with each per-language PDK's mirror; per-language round-trip tests catch drift.

## One of the following shapes

- `MutatorInput`
- `MutatorOutput`

## Definitions

### `MutatorInput`

The payload the host hands the mutator plugin on each invocation: release-level compilation context plus a labels-only projection of the topology graph.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `compilation_context` | CompilationContext | yes |  |
| `graph` | MutatorGraph | yes |  |
| `sources` | MutatorSource[] | no | Definition files the host reads and hands to the plugin verbatim, as an ordered list sorted by path. The host reads the bytes as opaque content and does not parse them. Absent when the attachment declares no sources. |
| `settings` | object | no | A free-form settings object the host hands to the plugin verbatim. The host does not parse or act on its content. Absent when the attachment declares no settings. |

_Additional properties are not permitted._

### `MutatorOutput`

The response shape the mutator plugin emits: a list of opaque JSON Patch documents the host applies to the topology graph. Patches stay opaque at the schema layer so the host need not duplicate the JSON Patch parser the guest already implements.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `patches` | any[] | yes | Opaque JSON Patch documents to apply to the topology graph, in order. |
| `error` | string | no | A failure message set when the guest ran but could not complete the operation; absent on success. It is distinct from any diagnostics the output carries: diagnostics report issues found during a run that still produced a result, while error reports that the operation itself did not complete. The host surfaces a present error as a failed plugin invocation. |

_Additional properties are not permitted._

### `CompilationContext`

Release-level metadata the mutator reads when deciding which compliance, FinOps, or governance rules apply to the build.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `release_name` | string | yes | The Release's metadata.name. |
| `environment` | string | yes | The environment label the Release runs under (e.g., dev, staging, prod). |

_Additional properties are not permitted._

### `MutatorGraph`

The labels-only projection of the topology graph exposed to the mutator plugin. Intentionally narrower than the full topology result: edges, values, and feature payloads are not exposed because the mutator's job is labelling, not topology reshaping.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `nodes` | map of MutatorNode | yes | Nodes keyed by absolute node ID. |

_Additional properties are not permitted._

### `MutatorNode`

The minimum per-node projection the mutator plugin needs to evaluate compliance rules: which Component the node implements, which version of that Component resolved, and which labels the node carries.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `component` | string | yes | The name of the underlying Component the node instantiates. |
| `resolved_version` | string | yes | The exact Semantic Version of the Component the resolver pinned for this node. |
| `labels` | map of string | yes | The node's duck-typing and ontology labels. |

_Additional properties are not permitted._

### `MutatorSource`

One definition file handed to the plugin: its base-name path and the file's content. Both are carried verbatim; the host does not parse the content.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `path` | string | yes | The base name of the source file. The host supplies the base name only, never an absolute host path, so the wire is portable and deterministic. |
| `content` | string | yes | The source file's content, carried verbatim as an opaque string. |

_Additional properties are not permitted._
