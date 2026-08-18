# Aggrega Catalog (ArtifactsLibrary) schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/artifactslibrary-v1alpha1.schema.json`

A reusable collection of named artifact bundles that Recipes and FeatureRecipes consume at render time via `artifacts.<name>: { $import: ... }`. Each bundle is a set of output files imported as one unit. Tier 3 — opt-in for catalogs that need cross-Recipe artifact reuse. Single authoring mode: Go templates only.

See the [artifactslibrary authoring reference](../../entities/artifactslibrary.md) for prose guidance on authoring artifactslibrary entities; this page documents the structural schema that reference describes.

**Top-level type:** `object`

## Properties

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `apiVersion` | const "aggrega.ai/v1alpha1" | yes | Constant: `"aggrega.ai/v1alpha1"` |
| `kind` | const "ArtifactsLibrary" | yes | Constant: `"ArtifactsLibrary"` |
| `metadata` | object | yes |  |
| `spec` | object | yes | The ArtifactsLibrary's content. spec.artifacts is required and must declare at least one bundle. spec carries additionalProperties: false — no parallel authoring modes are accepted at the envelope level. The single-authoring-mode posture keeps rendering uniform (Go template throughout) and avoids forcing authors to switch evaluation models mid-render when consuming imported bundles. |

_Additional properties are not permitted._

#### `artifactslibrary.metadata`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | PascalCase identifier for the library. It is the <Library> name in the bare-name identity reference <Library>#/artifacts/<name>; the version is supplied by the per-Release lockfile and no registry host enters the reference or any derived identifier. |
| `version` | string | yes | Strict Semantic Versioning of the library (e.g., 1.0.0). A consumer may assert this as an optional `:<version>` minimum-version floor in a bare-name reference (<Library>:<version>#/artifacts/<name>); the per-Release lockfile owns the resolved version. |
| `description` | string | no | A concise summary of what the library covers. |
| `labels` | map of string | no | Author-declared labels. The compiler does not interpret label values; labels are metadata for discovery + hub UI surfacing. |
| `annotations` | map of string | no | Author-declared annotations. Same opaque-metadata posture as labels. |

_Additional properties are not permitted._

#### `artifactslibrary.spec`

The ArtifactsLibrary's content. spec.artifacts is required and must declare at least one bundle. spec carries additionalProperties: false — no parallel authoring modes are accepted at the envelope level. The single-authoring-mode posture keeps rendering uniform (Go template throughout) and avoids forcing authors to switch evaluation models mid-render when consuming imported bundles.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `artifacts` | map of map of string | yes | Named map of reusable artifact bundles. Each bundle groups the output files that belong together (for example a CRD, its RBAC, and a ConfigMap). Each file body is opaque to the envelope validation — content semantics are handled by the Go template parser at consumption time. |

_Additional properties are not permitted._
