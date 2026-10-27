# Aggrega Wasm Policy Socket schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/wasm-policy-v1alpha1.schema.json`

The wire shapes a governance plugin attached at a verdict role consumes — PolicyInput at the ir-verdict role, RenderPolicyInput at the render-verdict role — and emits (PolicyOutput). A verdict of halt severity stops the build with a build-time diagnostic; a warn or info verdict is reported and the build continues. The IR-stage input graph is the full capability-agnostic IR graph, referenced from ir-v1alpha1.schema.json rather than re-declared here, so the policy plugin sees the same node, edge, and attachment detail the compiler does; plugin authors track the IR schema version. The render-stage input carries the rendered output files instead of the graph. The Go, Rust and TypeScript payload types are generated from this schema into the plugin-ABI packages, so the three languages read and write one wire; a guest imports them from those packages, or through its plugin kit where the kit re-exports them.

## One of the following shapes

- `PolicyInput`
- `RenderPolicyInput`
- `PolicyOutput`

## Definitions

### `PolicyInput`

The payload static analysis hands to the policy socket: the full IR graph (the same shape the Topology Builder emits) plus the precalculated routing paths the analyzer enumerates alongside.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `graph` | IRGraph | yes | The full capability-agnostic IR graph, single-sourced from ir-v1alpha1.schema.json. The policy plugin reasons over the complete node/edge/attachment detail rather than a narrow projection. |
| `precalculated_paths` | PrecalculatedPath[] | yes | Routing paths the analyzer pre-enumerated so policies can reason about reachability without re-walking the graph. |
| `sources` | PolicySource[] | no | Definition files the host reads at compile time and hands to the plugin verbatim, as an ordered list sorted by path. The host reads the bytes as opaque content and does not parse them. Absent when the attachment declares no sources. |
| `settings` | object | no | A free-form settings object the host hands to the plugin verbatim. The host does not parse or act on its content. Absent when the attachment declares no settings. |

_Additional properties are not permitted._

### `PolicyOutput`

The response shape the policy plugin emits: the verdicts that fired during evaluation, one diagnostic per fired verdict. An allowing rule emits nothing, so an empty results array means no verdicts fired.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `results` | Diagnostic[] | yes | The fired verdicts, one diagnostic each, in the order the plugin emits them. Empty when no verdict fired. |
| `error` | string | no | A failure message set when the guest ran but could not complete the operation; absent on success. It is distinct from any diagnostics the output carries: diagnostics report issues found during a run that still produced a result, while error reports that the operation itself did not complete. The host surfaces a present error as a failed plugin invocation. |

_Additional properties are not permitted._

### `RenderPolicyInput`

The payload a governance plugin attached at the render-verdict role receives: the rendered output files the policy reasons over, in place of the IR graph.

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
| `tree` | any | no | The parsed structured tree of this artifact, present when the host parsed the content before handing it to the plugin — the canonical JSON view of a source format the plugin does not read natively (an HCL artifact parsed to JSON, for example). The top level may be an object, an array, or a scalar, matching the parsed document's own shape. Absent when the host did not parse the artifact, in which case the plugin reads the native content directly. The host pipes the tree through opaquely, carrying it verbatim without interpreting its content. |
| `format` | string | no | The format the artifact was rendered in, present when the producing provider declared it. Absent when the producing provider declared no format. |

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
