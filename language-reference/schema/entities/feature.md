# Aggrega Catalog (Feature) schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/feature-v1alpha1.schema.json`

A modular operational feature that binds dynamically to components.

See the [feature authoring reference](../../entities/feature.md) for prose guidance on authoring feature entities; this page documents the structural schema that reference describes.

**Top-level type:** `object`

## Properties

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `apiVersion` | const "aggrega.ai/v1alpha1" | yes | Constant: `"aggrega.ai/v1alpha1"` |
| `kind` | const "Feature" | yes | Constant: `"Feature"` |
| `metadata` | object | yes |  |
| `spec` | object | yes | The validation, targeting, and interoperability contract for a catalog Feature: the free-form pillars (values, infra, provides) authored via schema, the fixed-shape pillars (usesSchema dependency sockets, featuresSchema attachment slots), component targeting (appliesTo and appliesToAnyOf), and interoperability controls. |

_Additional properties are not permitted._

#### `feature.metadata`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes |  |
| `version` | string | yes | Strict Semantic Versioning of the feature (e.g., 1.0.0). |
| `description` | string | no | A concise, one-sentence summary of what the entity does. |
| `maintainers` | object[] | no | List of maintainers who own this entity. |
| `license` | string | no | Legal compliance license (e.g., Apache-2.0). |
| `repository` | string | no | The URL to the Git repository where the source files live. |
| `home` | string | no | The URL of this entity's home page, wiki, or documentation. |
| `keywords` | string[] | no | A list of descriptive keywords for UI discoverability. |
| `labels` | object | no | Duck-typing labels for the Feature. The reserved label 'feature.aggrega.ai/kind' with value 'secret' marks this as a credential Feature for the author and for the tooling that surfaces it. A credential Feature and an ordinary Feature are attached the same way, under the same attachment surface; what an attachment produces is decided by the FeatureRecipe the Manifest maps its type to, not by the label. |
| `annotations` | map of string | no | Immutable, intrinsic feature characteristics authored by the Platform Architect in Domain 2. Cascades down to the .context.annotations.catalog bucket. |

_Additional properties are not permitted._

##### `feature.metadata.maintainers[]`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes |  |
| `email` | string | no |  |
| `url` | string | no |  |

_Additional properties are not permitted._

##### `feature.metadata.labels`

Duck-typing labels for the Feature. The reserved label 'feature.aggrega.ai/kind' with value 'secret' marks this as a credential Feature for the author and for the tooling that surfaces it. A credential Feature and an ordinary Feature are attached the same way, under the same attachment surface; what an attachment produces is decided by the FeatureRecipe the Manifest maps its type to, not by the label.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `feature.aggrega.ai/kind` | string (enum) | no | Feature kind label. Value 'secret' marks this as a credential Feature. Allowed values: `"secret"` |

#### `feature.spec`

The validation, targeting, and interoperability contract for a catalog Feature: the free-form pillars (values, infra, provides) authored via schema, the fixed-shape pillars (usesSchema dependency sockets, featuresSchema attachment slots), component targeting (appliesTo and appliesToAnyOf), and interoperability controls.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `extends` | string | no | URI of a base Feature to inherit YAML metadata from and auto-merge JSON Schema 2020-12 declarations with. |
| `featuresSchema` | map of object | no | Declarative attachment slot definitions: the named binding points at which this Feature expects a further Feature to be attached. A slot constrains which fill may bind it (selector) and how the fill's material may be delivered (inject); the fill's own Feature owns its values and infra contract. Declaring a slot never closes the attachment block — a deployment may attach a Feature under a name no slot declares. A slot is a binding point, not a dependency socket: usesSchema declares the separate topology surface. |
| `appliesTo` | string | no | Kubernetes-style label-selector string matching Components. Comma-separated requirements all must hold (AND). Supported forms: key=value, key!=value, key in (v1, v2), key notin (v1, v2), bare key (label present), !key (label absent). Example: "tier in (critical, production), !legacy". An empty or absent selector declares no constraint. The pattern here is a loose shape gate; the compiler's selector parser performs the full grammar validation. |
| `appliesToAnyOf` | string or map of string[] | no | A list of selectors; the Feature applies if ANY item matches (OR logic). Each item is either a label-selector string (same grammar as appliesTo; requirements inside the string AND together) or a flat key-value map where every pair must match (equality only). |
| `interoperability` | object | no | Advanced operational safety and interoperability controls. |
| `usesSchema` | object | no | Native YAML schema defining the topology. The Go CLI natively reads this to validate selectors and allowed inject paradigms. |
| `schema` | object | no | JSON Schema 2020-12 content covering the free-form pillars: values (the Developer's domain — application-shape parameters the Developer configures per Feature attachment in the Aggregate); infra (the Operator's domain — physical sizing knobs supplied by the Release); and provides (downstream context keys this Feature exposes to consumers via the topology pipe). Accepts three authoring modes via content-shape dispatch: (1) inline content (a YAML map carrying compact form, JSON Schema YAML, or mixed); (2) single-file replacement via {$import: <path>}; (3) cross-document reference via {$ref: <Library>#/schemas/<name>} into a SchemaLibrary entry by bare-name identity (the version is supplied by the per-Release lockfile; no registry host appears in the reference). The companion fields usesSchema and featuresSchema cover the fixed-shape pillars (dependency sockets, attachment slots); the bridge synthesis composes the three into the entity's unified validation surface. |
| `assertions` | map of string | no | Build-time cross-field validation. Each entry is a named assertion: the key is a stable rule identifier surfaced in error messages; the value is a Go template string with `{{ fail "message" }}` halt semantics. Multiple named assertions per entity evaluate per-instance in author-declared order; the first failing assertion halts the build. Feature assertions evaluate post-resolution, post-analyzer-gate and pre-render, and express architectural invariants of the contract. Template context: .values / .infra / .uses / .features / .metadata. The evaluator uses missingkey=error: references to undefined keys halt with a no-such-key diagnostic. Because the bare reference halts before any fallback can run, a plain `default` does not supply an optional-field fallback on this surface — gate the reference with `hasKey`, or read it through `index` and then apply `default`, or use the `optional` helper, which performs the presence check directly. |

_Additional properties are not permitted._

##### `feature.spec.interoperability`

Advanced operational safety and interoperability controls.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `conflictsWith` | string[] | no | List of feature names that cannot be attached to the same component simultaneously. |
| `componentRefPath` | string | no | String path defining where the compiler should inject the resolved target ID of the component. |

_Additional properties are not permitted._
