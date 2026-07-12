# Aggrega Wasm Policy Validator Socket schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/wasm-policy-validator-v1alpha1.schema.json`

The JSON wire shapes the policy-validator.wasm plugin socket consumes (PolicyValidatorInput) and emits (PolicyValidatorOutput). The policy validator runs in Step 4 of the compilation pipeline; a fail verdict halts the build with a build-time diagnostic. The input graph is the full target-agnostic IR graph, referenced from ir-v1alpha1.schema.json rather than re-declared here, so the policy plugin sees the same node, edge, and attachment detail the compiler does; plugin authors track the IR schema version. The wire shapes are co-canonical with the host types in aggrega-cli (the IR graph) and the generated codec in aggrega-abi.

## One of the following shapes

- `PolicyValidatorInput`
- `PolicyValidatorOutput`

## Definitions

### `PolicyValidatorInput`

The payload Step 4 hands to the policy-validator socket: the full IR graph (the same shape the Topology Builder emits) plus the precalculated routing paths the analyzer enumerates alongside.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `graph` | IRGraph | yes | The full target-agnostic IR graph, single-sourced from ir-v1alpha1.schema.json. The policy plugin reasons over the complete node/edge/attachment detail rather than a narrow projection. |
| `precalculated_paths` | PrecalculatedPath[] | yes | Routing paths the analyzer pre-enumerated so policies can reason about reachability without re-walking the graph. |

_Additional properties are not permitted._

### `PolicyValidatorOutput`

The response shape the policy-validator plugin emits: one PolicyResult per evaluated rule. An empty results array signals 'no policy rules ran' (distinct from 'all rules passed', which is an array of pass=true results).

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `results` | PolicyResult[] | yes | One verdict per evaluated policy rule. |

_Additional properties are not permitted._

### `PrecalculatedPath`

One pre-enumerated routing path the analyzer materializes so policy rules can reason about reachability without re-walking the graph.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `path_id` | string | yes | Stable identifier for this path; deterministic across runs of identical input. |
| `nodes` | string[] | yes | Ordered sequence of node IDs the path traverses, from source to terminal. |
| `attached_features` | string[] | yes | Alphabetically sorted union of Feature type URIs attached to any node along the path. Set-membership semantics: a Feature appears once even if multiple nodes carry it. Empty when no node along the path carries any Feature attachment. |

_Additional properties are not permitted._

### `PolicyResult`

One rule's verdict. Pass=false halts the build with Message surfaced as a build-time diagnostic; Pass=true is informational and does not affect build outcome.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `pass` | boolean | yes | True when the rule's verdict permits the build to proceed; false halts the build. |
| `message` | string | yes | Human-readable diagnostic. Always populated. On pass=false the message surfaces as the build-time error; on pass=true it is informational. |

_Additional properties are not permitted._
