# Aggrega Wasm Annotation-Transform Socket schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/wasm-annotation-transform-v1beta1.schema.json`

The wire shapes a governance plugin attached at the annotation-transform role consumes (AnnotationTransformInput) and emits (AnnotationTransformOutput). The role runs after resolve and before annotation expansion: the plugin reads the resolved injection targets and the Manifest's registered binding keys, and returns a list of annotation injections the host applies to those targets before expansion turns bound annotations into Feature attachments. The Go, Rust and TypeScript payload types are generated from this schema into the plugin-ABI packages, so the three languages read and write one wire; a guest imports them from those packages, or through its plugin kit where the kit re-exports them.

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

The response shape the annotation-transform plugin emits: a list of annotation injections the host applies to the named targets. The host applies only annotation additions to existing target coordinates, each carrying a value an author could write on that annotation — a string, or an object of subkeys; an injection naming a non-existent coordinate, or carrying a value of any other shape, halts the build loudly.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `injections` | AnnotationInjection[] | yes | Annotation injections to apply, in order. Each names an existing target coordinate and the annotation key and value to add there. |
| `error` | string | no | A failure message set when the guest ran but could not complete the operation; absent on success. The host surfaces a present error as a failed plugin invocation. |

_Additional properties are not permitted._

### `AnnotationTarget`

One resolved injection target the plugin may inject annotations onto: its boundary path and component name, and the annotation set the component already carries.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `boundary_path` | string | yes | The slash-separated boundary path the component sits under in the Release. |
| `component_name` | string | yes | The component's name within its boundary. |
| `annotations` | map of string or object or null | yes | The annotations the Release writes on the component itself, keyed by annotation key in the order they are written. Each value is what the author wrote: a string, an object of subkeys in its own written order, or null where the component opts out of an annotation it would otherwise inherit. Every key is present whatever its value, so a plugin can tell an annotation the component already carries from one it does not and add only what is absent. |

_Additional properties are not permitted._

### `AnnotationInjection`

One annotation to inject onto a target: the target coordinate plus the annotation key and its value.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `boundary_path` | string | yes | The slash-separated boundary path of the target component. Must name a target the host supplied; an unknown coordinate halts the build. |
| `component_name` | string | yes | The name of the target component. Must name a target the host supplied; an unknown coordinate halts the build. |
| `annotation_key` | string | yes | The annotation key to add on the target component. |
| `annotation_value` | string or object | yes | The annotation's value, carried as its JSON: a string, or an object whose keys are subkeys and whose entries are what an author may write under a subkey of a structured annotation. The host reads it exactly as it reads the same value written on the component in the Release, keeping the object's key order, so an object can feed a binding that routes several subkeys at once while a string feeds a binding that routes one. Null, a list, a number, a boolean and an object with no subkeys are refused, naming the injection: an injection adds an annotation and never removes or opts out of one. |

_Additional properties are not permitted._

### `AnnotationSource`

One definition file handed to the plugin: its base-name path and the file's content. Both are carried verbatim; the host does not parse the content.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `path` | string | yes | The base name of the source file. The host supplies the base name only, never an absolute host path, so the wire is portable and deterministic. |
| `content` | string | yes | The source file's content, carried verbatim as an opaque string. |

_Additional properties are not permitted._
