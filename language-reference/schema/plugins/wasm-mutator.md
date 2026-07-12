# Aggrega Wasm Mutator Socket schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/wasm-mutator-v1alpha1.schema.json`

The JSON wire shapes the mutator.wasm plugin socket consumes (MutatorInput) and emits (MutatorOutput). The mutator runs in Step 2 of the compilation pipeline and applies JSON Patch documents to the topology graph before the IR builder consumes it. The two wire shapes are co-canonical with the Go types in aggrega-cli/internal/compiler/topology/wasm_types.go and with each per-language PDK's mirror; per-language round-trip tests catch drift.

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

_Additional properties are not permitted._

### `MutatorOutput`

The response shape the mutator plugin emits: a list of opaque JSON Patch documents the host applies to the topology graph. Patches stay opaque at the schema layer so the host need not duplicate the JSON Patch parser the guest already implements.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `patches` | any[] | yes | Opaque JSON Patch documents to apply to the topology graph, in order. |

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
