# Aggrega Catalog (MappingLibrary) schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/mappinglibrary-v1beta1.schema.json`

A reusable collection of Go template fragments that Recipes and FeatureRecipes consume at render time via `valuesMapping: { $import: ... }`. Tier 3 — opt-in for catalogs that need cross-Recipe mapping reuse. Single authoring mode: Go templates only.

See the [MappingLibrary authoring reference](../../entities/mappinglibrary.md) for prose guidance on authoring MappingLibrary entities; this page documents the structural schema that reference describes.

**Top-level type:** `object`

## Properties

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `apiVersion` | const "aggrega.ai/v1beta1" | yes | Constant: `"aggrega.ai/v1beta1"` |
| `kind` | const "MappingLibrary" | yes | Constant: `"MappingLibrary"` |
| `metadata` | object | yes |  |
| `spec` | object | yes | The MappingLibrary's content. spec.mappings is required and must declare at least one entry. spec carries additionalProperties: false — no parallel authoring modes are accepted at the envelope level. The single-authoring-mode posture keeps Recipe rendering uniform (Go template throughout) and avoids forcing authors to switch evaluation models mid-render when consuming imported fragments. |

_Additional properties are not permitted._

#### `mappinglibrary.metadata`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | PascalCase identifier for the library. It is the <Library> name in the bare-name identity reference <Library>#/mappings/<name>; the version is supplied by the per-Release lockfile and no registry host enters the reference or any derived identifier. Pattern: `^[A-Z][A-Za-z0-9]*$`. |
| `version` | string | yes | Strict Semantic Versioning of the library (e.g., 1.0.0). A consumer may assert this as an optional `:<version>` minimum-version floor in a bare-name reference (<Library>:<version>#/mappings/<name>); the per-Release lockfile owns the resolved version. Pattern: `^(0\|[1-9]\d*)\.(0\|[1-9]\d*)\.(0\|[1-9]\d*)(?:-((?:0\|[1-9]\d*\|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0\|[1-9]\d*\|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$`. |
| `description` | string | no | A concise summary of what the library covers. |
| `labels` | map of string | no | Author-declared labels. The compiler is content-neutral and does not interpret label values: they are opaque metadata, carried for whatever reads the library to match on. |
| `annotations` | map of string | no | Author-declared annotations. Same opaque-metadata posture as labels. |

_Additional properties are not permitted._

#### `mappinglibrary.spec`

The MappingLibrary's content. spec.mappings is required and must declare at least one entry. spec carries additionalProperties: false — no parallel authoring modes are accepted at the envelope level. The single-authoring-mode posture keeps Recipe rendering uniform (Go template throughout) and avoids forcing authors to switch evaluation models mid-render when consuming imported fragments.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `mappings` | map of string | yes | Named map of reusable Go template fragments. Each entry's body is opaque to the envelope validation — content semantics are handled by the Go template parser at consumption time. Keys: PascalCase identifier. Entry keys appear in canonical reference URLs (`#/mappings/<name>`); the envelope-level constraint prevents non-PascalCase keys from propagating through the catalog ecosystem. Pattern: `^[A-Z][A-Za-z0-9]*$`. At least 1 entry. |

_Additional properties are not permitted._
