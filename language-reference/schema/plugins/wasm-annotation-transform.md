# Aggrega Wasm Annotation-Transform Socket schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/wasm-annotation-transform-v1alpha1.schema.json`

The wire shapes a governance plugin attached at the annotation-transform role consumes (AnnotationTransformInput) and emits (AnnotationTransformOutput). The role runs after resolve and before annotation expansion: the plugin reads the resolved injection targets and the Manifest's registered binding keys, and returns a list of annotation injections the host applies to those targets before expansion turns bound annotations into Feature attachments. The two wire shapes are co-canonical with the Go host types and with each per-language PDK's mirror; per-language round-trip tests catch drift.

## One of the following shapes

- `AnnotationTransformInput`
- `AnnotationTransformOutput`

## Definitions

### `AnnotationTransformInput`

The payload the host hands the annotation-transform plugin on each invocation: the resolved injection targets with their current annotations, the Manifest's registered annotation-binding keys, and the attachment's own pinned sources and settings.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `targets` | AnnotationTarget[] | yes | The injection targets — the resolved components the plugin may inject annotations onto, each with its current annotation set so the plugin can decide what to add without clobbering an existing key. Ordered deterministically by the host. |
| `binding_keys` | string[] | yes | The annotation keys the Manifest registers a binding for, in author order. An injection whose key is registered expands into a Feature attachment; the plugin reads this list so it injects only keys that will bind. The host does not require an injection to name a registered key — an unregistered injected annotation behaves exactly as an authored unbound annotation. |
| `sources` | AnnotationSource[] | no | Definition files the host reads and hands to the plugin verbatim, as an ordered list sorted by path. The host reads the bytes as opaque content and does not parse them. Absent when the attachment declares no sources. |
| `settings` | object | no | A free-form settings object the host hands to the plugin verbatim. The host does not parse or act on its content. Absent when the attachment declares no settings. |

_Additional properties are not permitted._

### `AnnotationTransformOutput`

The response shape the annotation-transform plugin emits: a list of annotation injections the host applies to the named targets. The host applies only annotation additions to existing target coordinates with string values; an injection naming a non-existent coordinate halts the build loudly.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `injections` | AnnotationInjection[] | yes | Annotation injections to apply, in order. Each names an existing target coordinate and the annotation key and string value to add there. |
| `error` | string | no | A failure message set when the guest ran but could not complete the operation; absent on success. It is distinct from any diagnostics the output carries: diagnostics report issues found during a run that still produced a result, while error reports that the operation itself did not complete. The host surfaces a present error as a failed plugin invocation. |

_Additional properties are not permitted._

### `AnnotationTarget`

One resolved injection target the plugin may inject annotations onto: its boundary path and component name, and the annotation set the component already carries.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `boundary_path` | string | yes | The slash-separated boundary path the component sits under in the Release. |
| `component_name` | string | yes | The component's name within its boundary. |
| `annotations` | map of string | yes | The component's current scalar annotation set, keyed by annotation key. |

_Additional properties are not permitted._

### `AnnotationInjection`

One annotation to inject onto a target: the target coordinate plus the annotation key and its string value.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `boundary_path` | string | yes | The slash-separated boundary path of the target component. Must name a target the host supplied; an unknown coordinate halts the build. |
| `component_name` | string | yes | The name of the target component. Must name a target the host supplied; an unknown coordinate halts the build. |
| `annotation_key` | string | yes | The annotation key to add on the target component. |
| `annotation_value` | string | yes | The annotation's string value. Values are strings only; the host rejects any other shape. |

_Additional properties are not permitted._

### `AnnotationSource`

One definition file handed to the plugin: its base-name path and the file's content. Both are carried verbatim; the host does not parse the content.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `path` | string | yes | The base name of the source file. The host supplies the base name only, never an absolute host path, so the wire is portable and deterministic. |
| `content` | string | yes | The source file's content, carried verbatim as an opaque string. |

_Additional properties are not permitted._
