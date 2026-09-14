# Aggrega Dependency Lockfile (Manifest) schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/manifest-v1alpha1.schema.json`

A single, global lockfile that maps abstract Developer Interfaces to concrete Ops Implementations via O(1) dictionary lookups based strictly on Instance Names.

See the [manifest authoring reference](../../entities/manifest.md) for prose guidance on authoring manifest entities; this page documents the structural schema that reference describes.

**Top-level type:** `object`

## Properties

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `apiVersion` | const "aggrega.ai/v1alpha1" | yes | Constant: `"aggrega.ai/v1alpha1"` |
| `kind` | const "Manifest" | yes | Constant: `"Manifest"` |
| `metadata` | object | yes |  |
| `defs` | string[] | no | Optional block for standard YAML anchors (& and *) to keep the Manifest DRY while maintaining a flat O(1) dictionary for the compiler. |
| `spec` | object | yes | The Manifest's mapping declarations plus optional base inheritance: mappings connects abstract component and feature types to concrete Recipe and FeatureRecipe implementations; extends inherits mappings from a base Manifest. |

_Additional properties are not permitted._

#### `manifest.metadata`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes |  |
| `version` | string | yes | Strict Semantic Versioning of the manifest lockfile (e.g., 1.0.0). |
| `description` | string | no | What this entity is and what it is for, written for someone deciding whether to use it. Open with a sentence naming the thing, then add what a reader needs in order to choose it and use it correctly — what it expects from a deployment, and anything surprising about how it behaves. A short paragraph is the usual length. |
| `maintainers` | object[] | no | List of maintainers who own this entity. |
| `license` | string | no | SPDX identifier for the license of the software this entity describes, such as MIT or AGPL-3.0. It records the terms of that software, not the terms of this file. |
| `repository` | string | no | The URL to the Git repository where the source files live. |
| `home` | string | no | The URL of this entity's home page, wiki, or documentation. |
| `keywords` | string[] | no | A list of descriptive keywords for UI discoverability. |

_Additional properties are not permitted._

##### `manifest.metadata.maintainers[]`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes |  |
| `email` | string | no |  |
| `url` | string | no |  |

_Additional properties are not permitted._

#### `manifest.spec`

The Manifest's mapping declarations plus optional base inheritance: mappings connects abstract component and feature types to concrete Recipe and FeatureRecipe implementations; extends inherits mappings from a base Manifest.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `extends` | string | no | URI of a base Manifest to inherit mappings from. Child mappings safely overwrite the base to support frictionless local dev loops. |
| `mappings` | object | yes | Maps abstract interfaces to concrete implementations. Declare mappings under the top-level keys 'components' and 'features', each mapping component-type / feature-type URIs directly to Recipe / FeatureRecipe URIs. These two keys are the whole surface; no other key is accepted here. The mapping is capability-agnostic at the Manifest layer — capability determination flows from each resolved Recipe's spec.capability at orchestrator-time. Keys: One of `"components"`, `"features"`. |

_Additional properties are not permitted._

##### `manifest.spec.mappings`

Maps abstract interfaces to concrete implementations. Declare mappings under the top-level keys 'components' and 'features', each mapping component-type / feature-type URIs directly to Recipe / FeatureRecipe URIs. These two keys are the whole surface; no other key is accepted here. The mapping is capability-agnostic at the Manifest layer — capability determination flows from each resolved Recipe's spec.capability at orchestrator-time.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `components` | mapping_tier | no | Component-type to Recipe URI mapping. A Recipe URI carries at most two segments — an optional leading capability, then the recipe name — plus an optional version; a reference with a third segment matches no recipe. Version forms: exact ('postgres-bitnami:1.2.0'), range ('postgres-bitnami:^1.2.0'), or unversioned ('postgres-bitnami'); the resolver pins the resolved version in the lockfile at first resolve. A reference may additionally be capability-qualified ('terraform/mariadb-rds:1.0.0', the segment before the first '/' naming the recipe's spec.capability) — required when more than one recipe ships the same name; an ambiguous bare reference halts resolution loudly rather than silently picking one. |
| `features` | mapping_tier | no | Feature-type to FeatureRecipe URI mapping. Includes both operational Features and credential Features (labeled feature.aggrega.ai/kind: secret). |

**Keys:** One of `"components"`, `"features"`.

_Additional properties are not permitted._

## Definitions

### `mapping_tier`

Two-tier resolution: 'type' maps by catalog type (DRY bulk), 'name' maps by instance name (granular override). Both are optional but at least one must be present. Name wins over type during resolution. Versioned type keys win over unversioned.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `type` | map of string | no | Maps catalog type URIs to Recipe URIs. Supports versioned keys ('core/api-server:1.0.0') for exact match, range keys ('core/api-server:^1.0.0') for major-compatible match, or unversioned keys ('core/api-server') for any-version match. |
| `name` | map of string | no | Maps specific instance names to Recipe URIs. Takes precedence over type-based mapping. |
| `annotations` | map of object | no | Annotation-driven Feature shortcuts. Maps annotation keys to a Feature URI plus a pillar-grouped routing table from dotted-path subkey to Feature pillar (values or infra). Validation derives from the target Feature's spec.schema.<pillar>.<dotted-path> declaration; the binding declares routing only. The Feature URI referenced by 'feature' MUST also appear in the 'type' section (that is where the FeatureRecipe version binding lives). |

_Additional properties are not permitted._
