# Aggrega Internal Path-Template Context schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/path-template-context-v1alpha1.schema.json`

The variable allowlist consumed by Go templates evaluated against Release.spec.boundaries[].directory and Release.spec.boundaries[].subDirectory (and the per-component subDirectory override) at orchestrator-time. Path templates use missingkey=error (distinct from the global missingkey=zero regime for value templates) plus parse-time validation: every field reference in a path template must appear in this allowlist for the relevant context (directory: vs subDirectory:); unknown fields produce a Loud Guardrail error at parse time, never at render time. The asymmetry with value-template laxity is documented at aggrega-docs/language-reference/path-template-variables.md.

**Top-level type:** `object`

## Properties

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `provider` | string | no | Available in directory: AND subDirectory:. The provider engine name resolved per-component from the recipe's target field. When directory: uses .provider, top-level boundaries with multiple providers in the subtree produce multiple evaluations (one per provider grouping). |
| `boundary_name` | string | no | Available in directory: AND subDirectory:. The map key in release.spec.boundaries.<key>. |
| `parameters` | object | no | Available in directory: AND subDirectory:. Typed parameter map from the Release. Path templates receive .parameters access as a deliberate carve-out from the parameters single-pass lifecycle — value templates do NOT receive .parameters; environment-shaped values flow into value templates via the already-interpolated Aggregate YAML. |
| `component_id` | string | no | Available in subDirectory: ONLY. The flattened per-component instance ID (e.g., 'backend' or 'data-layer.main-db'). Meaningless at boundary-level and rejected by parse-time validation in directory: templates. |
| `parent_boundary` | object | no | Available in directory: AND subDirectory:. The parent boundary's already-resolved values. Populated via depth-first walk evaluating each boundary's templates with its parent's resolved values; children never see their own values here. Top-level boundary referencing parent_boundary produces an explicit error: 'path template at <boundary_name> references {{ .parent_boundary.* }} but boundary is at the top level (no parent)'. |
| `manifest` | object | no | Available in directory: AND subDirectory:. Carries the resolved Recipe metadata as evaluated per-component. |

_Additional properties are not permitted._

#### `path-template-context.parent_boundary`

Available in directory: AND subDirectory:. The parent boundary's already-resolved values. Populated via depth-first walk evaluating each boundary's templates with its parent's resolved values; children never see their own values here. Top-level boundary referencing parent_boundary produces an explicit error: 'path template at <boundary_name> references {{ .parent_boundary.* }} but boundary is at the top level (no parent)'.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `directory` | string | no | Parent's evaluated directory string. |
| `subDirectory` | string | no | Parent's evaluated subDirectory string. |
| `boundary_name` | string | no | Parent's name (the map key in release.spec.boundaries). |

_Additional properties are not permitted._

#### `path-template-context.manifest`

Available in directory: AND subDirectory:. Carries the resolved Recipe metadata as evaluated per-component.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `recipe_name` | string | no | The resolved Recipe's name from the per-component lookup. |

_Additional properties are not permitted._
