# Aggrega Catalog (WorkloadLibrary) schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/workloadlibrary-v1alpha1.schema.json`

A reusable collection of Workload template fragments that Recipes consume at render time via `workload: { $import: ... }`. Tier 3 — opt-in for catalogs that need cross-Recipe workload reuse. Single authoring mode: Go templates only.

See the [workloadlibrary authoring reference](../../entities/workloadlibrary.md) for prose guidance on authoring workloadlibrary entities; this page documents the structural schema that reference describes.

**Top-level type:** `object`

## Properties

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `apiVersion` | const "aggrega.ai/v1alpha1" | yes | Constant: `"aggrega.ai/v1alpha1"` |
| `kind` | const "WorkloadLibrary" | yes | Constant: `"WorkloadLibrary"` |
| `metadata` | object | yes |  |
| `spec` | object | yes | The WorkloadLibrary's content. spec.workloads is required and must declare at least one entry. spec carries additionalProperties: false — no parallel authoring modes are accepted at the envelope level. The single-authoring-mode posture keeps Recipe rendering uniform (Go template throughout) and avoids forcing authors to switch evaluation models mid-render when consuming imported fragments. |

_Additional properties are not permitted._

#### `workloadlibrary.metadata`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | PascalCase identifier for the library. It is the <Library> name in the bare-name identity reference <Library>#/workloads/<name>; the version is supplied by the per-Release lockfile and no registry host enters the reference or any derived identifier. |
| `version` | string | yes | Strict Semantic Versioning of the library (e.g., 1.0.0). A consumer may assert this as an optional `:<version>` minimum-version floor in a bare-name reference (<Library>:<version>#/workloads/<name>); the per-Release lockfile owns the resolved version. |
| `description` | string | no | A concise summary of what the library covers. |
| `labels` | map of string | no | Author-declared labels. The compiler does not interpret label values; labels are metadata for discovery + hub UI surfacing. |
| `annotations` | map of string | no | Author-declared annotations. Same opaque-metadata posture as labels. |

_Additional properties are not permitted._

#### `workloadlibrary.spec`

The WorkloadLibrary's content. spec.workloads is required and must declare at least one entry. spec carries additionalProperties: false — no parallel authoring modes are accepted at the envelope level. The single-authoring-mode posture keeps Recipe rendering uniform (Go template throughout) and avoids forcing authors to switch evaluation models mid-render when consuming imported fragments.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workloads` | map of string | yes | Named map of reusable Workload template fragments. Each entry's body is opaque to the envelope validation — content semantics are handled by the Go template parser at consumption time. |

_Additional properties are not permitted._
