# Aggrega Catalog (Feature) schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/feature-v1alpha1.schema.json`

A modular operational feature that binds dynamically to components.

See the [Feature authoring reference](../../entities/feature.md) for prose guidance on authoring Feature entities; this page documents the structural schema that reference describes.

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
| `name` | string | yes | At least 1 character long. |
| `version` | string | yes | Strict Semantic Versioning of the feature (e.g., 1.0.0). Pattern: `^(0\|[1-9]\d*)\.(0\|[1-9]\d*)\.(0\|[1-9]\d*)(?:-((?:0\|[1-9]\d*\|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0\|[1-9]\d*\|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$`. |
| `description` | string | no | What this entity is and what it is for, written for someone deciding whether to use it. Open with a sentence naming the thing, then add what a reader needs in order to choose it and use it correctly — what it expects from the Release that deploys it, and anything surprising about how it behaves. A short paragraph is the usual length. |
| `maintainers` | object[] | no | List of maintainers who own this entity. |
| `license` | string | no | SPDX identifier for the license of the software this entity describes, such as MIT or AGPL-3.0. It records the terms of that software, not the terms of this file. |
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
| `extends` | string | no | Reference to a base Feature this Feature inherits from. It names the base by its `metadata.name` rather than by the registry coordinate the Feature publishes under, and takes the same three version forms every catalog reference takes: bare (`core/queue`) for the highest available release, exact (`core/queue:1.0.0`), or a caret range (`core/queue:^1.0.0`). What inherits is more than metadata: the base's `metadata.labels` and `metadata.annotations`, its `appliesTo` and `appliesToAnyOf` selectors, its `interoperability` block, its `usesSchema` and its `featuresSchema` all merge downward, and its JSON Schema 2020-12 declarations on `schema` are auto-merged. The child's own value wins on a shared key, and identity fields never inherit. |
| `featuresSchema` | map of object | no | Declarative attachment slot definitions: the named binding points at which this Feature expects a further Feature to be attached. A slot constrains which fill may bind it (selector) and how the fill's material may be delivered (inject); the fill's own Feature owns its values and infra contract. Declaring a slot never closes the attachment block — an author may attach a Feature under a name no slot declares. A slot is a binding point, not a dependency socket: usesSchema declares the separate topology surface. |
| `appliesTo` | string | no | Kubernetes-style label-selector string matching Components. Comma-separated requirements all must hold (AND). Supported forms: key=value, key!=value, key in (v1, v2), key notin (v1, v2), bare key (label present), !key (label absent). Example: "tier in (critical, production), !legacy". An empty or absent selector declares no constraint. The selector is read against these forms each time an attachment of this Feature is evaluated, and a requirement outside them stops the build, naming it: an empty requirement (a leading, trailing or doubled comma), or a key carrying whitespace or any of = ! ( ) and the comma — so "!tier=frontend" is refused, and tier!=frontend is how a value is excluded. A value is the text after its operator, whatever characters it carries. The pattern on this field refuses only a few malformed shapes, before any attachment is evaluated. Pattern: `^(?:[^()]*[()][\s\S]*\|[ \t]*(?:![ \t]*[^,]*[^ \t,][^,]*\|[^ \t,!][^,]*)?(?:,[ \t]*(?:![ \t]*[^,]*[^ \t,][^,]*\|[^ \t,!][^,]*)?)*)$`. |
| `appliesToAnyOf` | string or map of string[] | no | A list of selectors; the Feature applies if ANY item matches (OR logic). Each item is either a label-selector string (same grammar as appliesTo; requirements inside the string AND together) or a flat key-value map where every pair must match (equality only). |
| `interoperability` | object | no | Advanced operational safety and interoperability controls. |
| `usesSchema` | map of object | no | The dependency sockets this entity declares, keyed by socket name; each connection drawn through a socket is checked against that socket's declaration — its selector and the inject mechanisms it allows. Keys: one or more letters, digits, underscores or hyphens. A dot is not permitted. Pattern: `^[a-zA-Z0-9_-]+$`. |
| `schema` | object | no | JSON Schema 2020-12 content covering the free-form pillars: values (the Developer's domain — application-shape parameters the Developer configures per Feature attachment in the Aggregate); infra (the Operator's domain — physical sizing knobs supplied by the Release); and provides (downstream context keys this Feature exposes to consumers via the topology pipe). Accepts three authoring modes via content-shape dispatch: (1) inline content (a YAML map carrying compact form, JSON Schema YAML, or mixed); (2) file replacement via {$import: <path>}, written at spec.schema to supply the whole contract from one file or at a single pillar to supply that pillar alone, with a relative path read against the directory holding the entity that declared it; (3) cross-document reference via {$ref: <Library>#/schemas/<name>} into a SchemaLibrary entry by bare-name identity (the version is supplied by the per-Release lockfile; no registry host appears in the reference). The companion fields usesSchema and featuresSchema cover the fixed-shape pillars (dependency sockets, attachment slots); the compiler composes the three into the one schema an instance is validated against. |
| `assertions` | map of string | no | Build-time cross-field validation. Each entry is a named assertion: the key is a stable rule identifier surfaced in error messages; the value is a Go template string with `{{ fail "message" }}` halt semantics. Multiple named assertions per entity evaluate per-instance in author-declared order; the first failing assertion halts the build. Feature assertions evaluate after resolution and static analysis, before render, and express architectural invariants of the contract. Template context: .values / .infra / .uses / .features / .metadata. The evaluator uses missingkey=error: references to undefined keys halt with a no-such-key diagnostic. Because the bare reference halts before any fallback can run, a plain `default` does not supply an optional-field fallback on this surface — gate the reference with `hasKey`, or use the `optional` helper, which performs the presence check directly. Reading the key through `index` does not supply one either: `index` halts on a map key the map does not hold, naming the key. |

_Additional properties are not permitted._

##### `feature.spec.interoperability`

Advanced operational safety and interoperability controls.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `conflictsWith` | string[] | no | Names of the Features this Feature cannot reach a component alongside, each written the way an attachment's type names a Feature. The build halts before rendering when one component ends up carrying this Feature and a Feature named here — whether each was attached on the component, on a subsystem or boundary holding it, on a Release component entry, or by annotation-driven expansion. One declaration is enough: the halt does not need the other Feature to list this one. Names are compared with any version removed, so an entry matches every version of the Feature it names. Two Features attached to sibling boundaries that share no component never meet and do not halt. |

_Additional properties are not permitted._
