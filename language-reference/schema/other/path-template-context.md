# Aggrega Path-Template Context schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/path-template-context-v1alpha1.schema.json`

The variable allowlist consumed by Go templates evaluated against Release.spec.boundaries[].directory and Release.spec.boundaries[].subDirectory (and the per-component subDirectory override) when Aggrega builds the Release. Path templates use missingkey=error (distinct from the global missingkey=zero regime for value templates) plus parse-time validation: every field reference in a path template must appear in this allowlist for the relevant context (directory: vs subDirectory:); unknown fields produce a Loud Guardrail error at parse time, never at render time. The Path-Template Variables page of the language reference teaches the difference from value templates.

**Top-level type:** `object`

## Properties

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `capability` | string | no | Available in directory: AND subDirectory:. The rendering capability the contributing component's Recipe declares in spec.capability, with any version pin stripped — for example 'helm', 'helm-chart' or 'compose'. subDirectory: defaults to {{ .capability }}, which is what lands each capability's artifacts in their own sub-folder beneath the boundary's directory. In a directory: template the value is resolved per-component, so a boundary whose subtree contributes more than one capability evaluates to one directory per capability; the separate per-boundary walk that publishes .parent_boundary.directory runs before any component is bound and leaves this value empty. |
| `boundary_name` | string | no | Available in directory: AND subDirectory:. The map key in release.spec.boundaries.<key>. |
| `parameters` | object | no | Available in directory: AND subDirectory:. Typed parameter map from the Release. Path templates receive .parameters access as a deliberate carve-out from the parameters single-pass lifecycle — value templates do NOT receive .parameters; environment-shaped values flow into value templates via the already-interpolated Aggregate YAML. |
| `component_id` | string | no | Available in subDirectory: ONLY. The flattened per-component instance ID (e.g., 'backend' or 'data-layer.main-db'). Meaningless at boundary-level and rejected by parse-time validation in directory: templates. |
| `parent_boundary` | object | no | Available in directory: AND subDirectory:. The parent boundary's already-resolved values. Populated via depth-first walk evaluating each boundary's templates with its parent's resolved values; children never see their own values here. A top-level boundary has no parent, so a key read under parent_boundary there halts the build, naming the boundary, the template field and the missing key. |
| `manifest` | object | no | Available in directory: AND subDirectory:. Carries the resolved Recipe metadata as evaluated per-component. |

_Additional properties are not permitted._

#### `path-template-context.parent_boundary`

Available in directory: AND subDirectory:. The parent boundary's already-resolved values. Populated via depth-first walk evaluating each boundary's templates with its parent's resolved values; children never see their own values here. A top-level boundary has no parent, so a key read under parent_boundary there halts the build, naming the boundary, the template field and the missing key.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `directory` | string | no | Parent's evaluated directory string. |
| `boundary_name` | string | no | Parent's name (the map key in release.spec.boundaries). |
| `parameters` | object | no | The Release's parameter map — the same map .parameters carries. |
| `annotations` | map of string | no | The parent boundary's annotations after the cascade resolves. |

_Additional properties are not permitted._

#### `path-template-context.manifest`

Available in directory: AND subDirectory:. Carries the resolved Recipe metadata as evaluated per-component.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `recipe_name` | string | no | The resolved Recipe's name from the per-component lookup. |

_Additional properties are not permitted._
