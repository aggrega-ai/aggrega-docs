# Aggrega Wasm Policy Socket schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/wasm-policy-v1alpha1.schema.json`

The JSON wire shapes the policy.wasm plugin socket consumes (PolicyInput for the IR stage, RenderPolicyInput for the render stage) and emits (PolicyOutput). The policy validator runs during compilation; a deny verdict halts the build with a build-time diagnostic. The IR-stage input graph is the full capability-agnostic IR graph, referenced from ir-v1alpha1.schema.json rather than re-declared here, so the policy plugin sees the same node, edge, and attachment detail the compiler does; plugin authors track the IR schema version. The render-stage input carries the rendered output files instead of the graph. The wire shapes are co-canonical with the host types in aggrega-cli (the IR graph) and the generated codec in aggrega-abi.

## One of the following shapes

- `PolicyInput`
- `RenderPolicyInput`
- `PolicyOutput`

## Definitions

### `PolicyInput`

The payload Step 4 hands to the policy socket: the full IR graph (the same shape the Topology Builder emits) plus the precalculated routing paths the analyzer enumerates alongside.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `graph` | IRGraph | yes | The full capability-agnostic IR graph, single-sourced from ir-v1alpha1.schema.json. The policy plugin reasons over the complete node/edge/attachment detail rather than a narrow projection. |
| `precalculated_paths` | PrecalculatedPath[] | yes | Routing paths the analyzer pre-enumerated so policies can reason about reachability without re-walking the graph. |
| `sources` | PolicySource[] | no | Definition files the host reads at compile time and hands to the plugin verbatim, as an ordered list sorted by path. The host reads the bytes as opaque content and does not parse them. Absent when the attachment declares no sources. |
| `settings` | object | no | A free-form settings object the host hands to the plugin verbatim. The host does not parse or act on its content. Absent when the attachment declares no settings. |

_Additional properties are not permitted._

### `PolicyOutput`

The response shape the policy plugin emits: the verdicts that fired during evaluation, one PolicyResult per fired verdict. An allowing rule emits nothing, so an empty results array means no verdicts fired.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `results` | PolicyResult[] | yes | The fired verdicts, one PolicyResult each, in the order the plugin emits them. Empty when no verdict fired. |

_Additional properties are not permitted._

### `RenderPolicyInput`

The payload the render stage hands to a policy socket that declares the render stage: the rendered output files the policy reasons over. The render stage carries the rendered artifacts instead of the IR graph.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `artifacts` | RenderedArtifact[] | yes | The rendered output files the policy reasons over, as an ordered list sorted by path so the wire is byte-identical across runs of identical input. |
| `sources` | PolicySource[] | no | Definition files the host reads at compile time and hands to the plugin verbatim, as an ordered list sorted by path. The host reads the bytes as opaque content and does not parse them. Absent when the attachment declares no sources. |
| `settings` | object | no | A free-form settings object the host hands to the plugin verbatim. The host does not parse or act on its content. Absent when the attachment declares no settings. |

_Additional properties are not permitted._

### `RenderedArtifact`

One rendered output file: its path and the rendered content at that path.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `path` | string | yes | The output path of the rendered file, relative to the render root. |
| `content` | string | yes | The rendered content at this path. |

_Additional properties are not permitted._

### `PolicySource`

One definition file handed to the plugin: its base-name path and the file's content. Both are carried verbatim; the host does not parse the content.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `path` | string | yes | The base name of the source file. The host supplies the base name only, never an absolute host path, so the wire is portable and deterministic. |
| `content` | string | yes | The source file's content, carried verbatim as an opaque string. |

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

One fired policy verdict: its severity and a human-readable message. Only fired verdicts appear in the output; an allowing rule emits no result. Severity governs the build outcome: deny halts the build, warn flags the verdict and lets the build proceed, audit records the verdict without affecting the outcome.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `severity` | string (enum) | yes | The verdict's severity: deny halts the build, warn flags the verdict and lets the build proceed, audit records the verdict without affecting the build outcome. Allowed values: `"deny"`, `"warn"`, `"audit"` |
| `message` | string | yes | Human-readable diagnostic for the fired verdict, surfaced to the operator. |

_Additional properties are not permitted._
