# Aggrega Catalog (SchemaLibrary) schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/schemalibrary-v1alpha1.schema.json`

A reusable collection of JSON Schema 2020-12 definitions that catalog content (Components, Features, etc.) can $ref into via the bare-name identity reference <Library>#/schemas/<name> (the version is supplied by the per-Release lockfile; no registry host appears in the reference). Tier 3 — opt-in for catalogs that need cross-Component schema reuse.

See the [SchemaLibrary authoring reference](../../entities/schemalibrary.md) for prose guidance on authoring SchemaLibrary entities; this page documents the structural schema that reference describes.

**Top-level type:** `object`

## Properties

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `apiVersion` | const "aggrega.ai/v1alpha1" | yes | Constant: `"aggrega.ai/v1alpha1"` |
| `kind` | const "SchemaLibrary" | yes | Constant: `"SchemaLibrary"` |
| `metadata` | object | yes |  |
| `spec` | object | yes | The SchemaLibrary's content. spec.schemas is required and must declare at least one entry; spec.templates is optional and only present when the library uses parameterized helpers. |

_Additional properties are not permitted._

#### `schemalibrary.metadata`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | PascalCase identifier for the library. It is the <Library> name in the bare-name identity reference <Library>#/schemas/<name>; the version is supplied by the per-Release lockfile and no registry host enters the reference or any derived identifier. Pattern: `^[A-Z][A-Za-z0-9]*$`. |
| `version` | string | yes | Strict Semantic Versioning of the library (e.g., 1.0.0). The per-Release lockfile pins one version per library. Pattern: `^(0\|[1-9]\d*)\.(0\|[1-9]\d*)\.(0\|[1-9]\d*)(?:-((?:0\|[1-9]\d*\|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0\|[1-9]\d*\|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$`. |
| `description` | string | no | A concise summary of what the library covers. |
| `labels` | map of string | no | Author-declared labels. The compiler is content-neutral and does not interpret label values: they are opaque metadata, carried for whatever reads the library to match on. |
| `annotations` | map of string | no | Author-declared annotations. Same opaque-metadata posture as labels. |

_Additional properties are not permitted._

#### `schemalibrary.spec`

The SchemaLibrary's content. spec.schemas is required and must declare at least one entry; spec.templates is optional and only present when the library uses parameterized helpers.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `schemas` | map of object | yes | Named map of reusable schema definitions. Each entry's content is validated by the compact-form compiler at parse time; the envelope-level validation only checks the structural wrapping. Keys: PascalCase identifier — `^[A-Z][A-Za-z0-9]*$`. Entry keys appear in bare-name identity references (`<Library>#/schemas/<name>`); the envelope-level constraint prevents non-PascalCase keys from propagating through the catalog ecosystem. At least 1 entry. |
| `templates` | map of object | no | Optional named map of parameterized helpers. Schema entries reference templates by name via $instantiate:; literal scalar substitution only — no embedded Go templates, no conditionals, no loops. The library substitution layer is intentionally narrower than full template evaluation so authoring stays in the schema language rather than introducing a separate templating surface. Keys: PascalCase identifier — `^[A-Z][A-Za-z0-9]*$`. Same envelope-level discipline as schema entry keys; template names are referenced via $instantiate: at instantiation time. |

_Additional properties are not permitted._
