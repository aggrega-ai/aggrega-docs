# Aggrega Wasm FeatureRecipe-Pipeline Step Socket schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/wasm-frp-step-v1alpha1.schema.json`

The JSON wire shapes a feature-recipe-pipeline step plugin socket consumes (FRPStepInput) and emits (FRPStepOutput). An FRP step runs per inline pipeline entry declared in a Recipe or FeatureRecipe: the host hands the step the keyed document set whole, the step selects the documents it targets by content, and it returns key-addressed RFC 6902 patches plus side effects and diagnostics. This is a distinct guest contract from the mutator socket, which runs once over the whole topology graph and returns opaque label patches. The two wire shapes are co-canonical with the host's Go types for this socket; a field-coverage parity test catches drift.

## One of the following shapes

- `FRPStepInput`
- `FRPStepOutput`

## Definitions

### `FRPStepInput`

The payload a feature-recipe-pipeline guest receives for one pipeline step: the keyed document set the host hands whole, the step-local input the Recipe declared for this step, the render-time context, the step's position in the pipeline, and a record of the steps that already ran.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `documents` | DocumentSet | yes |  |
| `step_input` | object | no | The step's rendered `with` block, an author-ordered key set the guest reads as its step-local input. Preserves author order so the payload is byte-identical across runs of identical input. |
| `context` | object | yes | The render-time context the host hands the step. The step carries it through; the schema does not interpret its internal shape (an opaque passthrough), so the FRP socket schema does not bind to the cross-boundary render-context shape. The render context's own contract is the render-context wire shape; a guest that reads it consults that contract. |
| `step_index` | integer | yes | This step's zero-based position in the pipeline. |
| `preceding_steps` | PrecedingStep[] | no | The pipeline steps that ran before this step, so a guest can inspect what came before it. |

_Additional properties are not permitted._

### `FRPStepOutput`

The payload a feature-recipe-pipeline guest returns for one pipeline step: the RFC 6902 patches the host applies to the keyed document set, the side effects this step produced, and any diagnostics the guest raised.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `patches` | JSONPatchOp[] | no | Structured RFC 6902 operations the step emits against documents in the keyed set. Each names its target document by scope and key, then names the op, path, and value explicitly. Distinct from the mutator socket's opaque patch slice: an FRP step's patches are applied by the host and restored by snapshot on a failed step, so the operations are explicit here rather than opaque. |
| `side_effects` | SideEffect[] | no | The effects this step produced beyond patching an existing document (for example emitting a CRD or writing a file). |
| `diagnostics` | Diagnostic[] | no | Diagnostics the guest raised. Each element is the shared Wasm-plugin diagnostic shape. |
| `outputs` | object | no | The addressable outputs the guest returns for this step, an author-ordered key set that populates the step's outputs for a later step or a template to read. Preserves author order so the payload is byte-identical across runs of identical input. Absent when the step returns no outputs. |
| `error` | string | no | A failure message set when the guest ran but could not complete the operation; absent on success. It is distinct from any diagnostics the output carries: diagnostics report issues found during a run that still produced a result, while error reports that the operation itself did not complete. The host surfaces a present error as a failed plugin invocation. |

_Additional properties are not permitted._

### `DocumentSet`

The keyed, scope-rooted set of addressable units a pipeline guest receives as its input surface. The host hands the whole set and is blind to its content; the guest selects the documents it targets by content and addresses its patches by key.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `own` | map of Unit | yes | The node's own rendered output, keyed by unit token. Preserves key order so the set reaches the wire in a stable order and the payload is byte-identical across runs of identical input. |
| `host` | map of Unit | no | The rendered output of the component a component-scope FeatureRecipe is attached to — the cross-entity surface. Absent for Recipe steps and boundary-scope FeatureRecipe steps, which have no host component. Preserves key order so the set reaches the wire in a stable order and the payload is byte-identical across runs of identical input. |

_Additional properties are not permitted._

### `Unit`

One addressable piece a provider's emitted output carves into — the hybrid view of one piece of output. A structured unit carries a tree (an RFC-6902-addressable view) and is a PATCH target; an opaque unit carries only its media type and bytes (no tree) and is a SELECT and EMIT target but not a PATCH target.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `token` | string | yes | The opaque positional address the codec assigns — the emitted filename for a single-document file, or `<filename>#<ordinal>` (file order) when one file carries several documents. The guest treats it as opaque: it content-selects a unit and echoes the token, never parsing it. |
| `bytes` | string | no | The unit's original bytes, the reassembly source, base64-encoded on the wire. Reassembly is byte-faithful by construction: untouched bytes are re-joined from this verbatim. |
| `media_type` | string | no | The unit's content type (for example `application/yaml` for the stock YAML codec), so the guest knows what it is looking at. |
| `tree` | any | no | The unit's RFC-6902-addressable normalized view when the codec produced one, or absent when it did not. A unit with a tree is structured (a PATCH target); a unit with no tree is opaque. The document is opaque to the host, which pipes the bytes through without interpreting them, so the tree carries any JSON value at this schema layer. |

_Additional properties are not permitted._

### `JSONPatchOp`

One RFC 6902 JSON-Patch operation an FRP step emits against one document in the keyed set. Scope and key name the target document; op, path, value, and from carry the operation against a location within that document.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `scope` | string (enum) | yes | The document root the operation targets: own (the node's own rendered documents) or host (the documents of the component a component-scope FeatureRecipe is attached to). Allowed values: `"own"`, `"host"` |
| `key` | string | yes | The emitted-filename key within the named root — the key the guest learned at runtime from the document it selected by content. |
| `op` | string | yes | The RFC 6902 operation: one of add, remove, replace, move, copy, test. |
| `path` | string | yes | An RFC 6901 JSON Pointer to the target location within the named document. |
| `value` | any | no | The operand for add, replace, and test, omitted otherwise. An arbitrary JSON document fragment the guest authored, which the host pipes through opaquely; it carries any JSON value at this schema layer. |
| `from` | string | no | The source pointer for move and copy, omitted otherwise. |

_Additional properties are not permitted._

### `SideEffect`

One effect a feature-recipe-pipeline step produces beyond patching an existing document. Kind is an open string rather than a closed enum so a future effect kind extends the contract without an ABI break. When kind is emit_crd, crd carries the CRD document and file is omitted; when kind is emit_file, file carries the file to write and crd is omitted.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `kind` | string | yes | The effect kind — for example emit_crd or emit_file. An open string so a future effect kind extends the contract without an ABI break. |
| `scope` | string (enum) | no | The document root the emit contributes to: own (the node's own set) or host (the attached host component's set). An absent scope means own at apply time. Allowed values: `"own"`, `"host"` |
| `crd` | any | no | The CRD document the step emits when kind is emit_crd. Opaque to the host, which pipes it through without interpreting it; it carries any JSON value at this schema layer. |
| `file` | SideEffectFile | no |  |

_Additional properties are not permitted._

### `SideEffectFile`

The file an emit_file side effect writes: the target path and the file content.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `path` | string | yes | The target path the file is written to. |
| `content` | string | yes | The file content to write. |

_Additional properties are not permitted._

### `PrecedingStep`

One pipeline step that ran before the current step, so a guest can inspect what came before it: the step's pipeline index, the Wasm plugin URI that implemented it, and the side effects that step emitted.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `index` | integer | yes | The preceding step's zero-based position in the pipeline. |
| `plugin_uri` | string | yes | The Universal URI of the Wasm plugin that implemented the preceding step. |
| `side_effects` | SideEffect[] | no | The side effects the preceding step emitted. |

_Additional properties are not permitted._
