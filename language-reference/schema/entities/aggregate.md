# Aggrega Developer Intent (Aggregate) schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/aggregate-v1alpha1.schema.json`

The recursive, parameterized AI architecture. Acts as both the root of a build and a reusable module.

See the [Aggregate authoring reference](../../entities/aggregate.md) for prose guidance on authoring Aggregate entities; this page documents the structural schema that reference describes.

**Top-level type:** `object`

## Properties

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `apiVersion` | const "aggrega.ai/v1alpha1" | yes | Constant: `"aggrega.ai/v1alpha1"` |
| `kind` | const "Aggregate" | yes | Constant: `"Aggregate"` |
| `metadata` | object | yes |  |
| `defs` | string[] | no | Optional block for standard YAML anchors (& and *) to keep the Aggregate DRY while maintaining a flat O(1) dictionary for the compiler. Mirrors the equivalent block on Manifest. |
| `spec` | object | yes | The Developer Intent surface: the global parameter contract, nested aggregate imports, the exported-component public API, subsystem groupings, and the component instances that make up the module. |

_Additional properties are not permitted._

#### `aggregate.metadata`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | At least 1 character long. |
| `version` | string | yes | Strict Semantic Versioning of the aggregate module. Pattern: `^(0\|[1-9]\d*)\.(0\|[1-9]\d*)\.(0\|[1-9]\d*)(?:-((?:0\|[1-9]\d*\|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0\|[1-9]\d*\|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$`. |
| `description` | string | no |  |
| `maintainers` | object[] | no | List of maintainers who own this entity. |
| `license` | string | no | SPDX identifier for the license of the software this entity describes, such as MIT or AGPL-3.0. It records the terms of that software, not the terms of this file. |
| `repository` | string | no | The URL to the Git repository where the source files live. |
| `home` | string | no | The URL of this entity's home page, wiki, or documentation. |
| `keywords` | string[] | no | A list of descriptive keywords for UI discoverability. |
| `labels` | map of string | no | Module-level duck-typing labels for catalog discovery, policy evaluation, and Studio/IDE filtering. These labels describe the Aggregate's identity as a reusable module (e.g., aggregate.aggrega.ai/tier: infrastructure, aggregate.aggrega.ai/compliance: pci-dss). They do NOT cascade to child component nodes — component labels come exclusively from the Component catalog entity in Domain 2. |

_Additional properties are not permitted._

##### `aggregate.metadata.maintainers[]`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes |  |
| `email` | string | no |  |
| `url` | string | no |  |

_Additional properties are not permitted._

#### `aggregate.spec`

The Developer Intent surface: the global parameter contract, nested aggregate imports, the exported-component public API, subsystem groupings, and the component instances that make up the module.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `parameters` | map of object | no | Global environment contract. Each entry is a typed-contract object authoring the compact-form vocabulary subset (type, description, default, enum, min/max, minLength/maxLength, pattern, format, validate, validateMessage, required, items, valuesType, properties). Nested structure is expressed via the typed-form properties: sub-field. Release fulfillment may be inline (parameters: {...}) or single-source file import (parameters: {$import: <path>}); the parameter-contract layer validates the merged map against this contract before parameter interpolation. The Aggregate page of the language reference teaches the full vocabulary. |
| `aggregates` | map of object | no | Nested aggregates acting as imported modules. Keys: one or more letters, digits, underscores or hyphens. A dot is not permitted. Pattern: `^[a-zA-Z0-9_-]+$`. |
| `exportedComponents` | map of string | no | The Public API Interface. Maps an exposed public name to an internal component ID. Parent Aggregates importing this module reference components by these public names. |
| `subsystems` | map of subsystem | no | Named logical groupings of an Aggregate's components into subsystems. Mutually exclusive with top-level components — declaring both is rejected. A subsystem the author names default is an ordinary declared subsystem, distinct from the synthesized default the compiler creates for a components-only Aggregate. Keys: one or more letters, digits, underscores or hyphens. A dot is not permitted. Pattern: `^[a-zA-Z0-9_-]+$`. |
| `components` | map of component_instance | no | The map of logical atomic components that make up this Aggregate, authored directly at the top level. Top-level components and subsystems are mutually exclusive — declaring both is rejected. When components are authored here (without subsystems), the compiler folds them into a synthesized default subsystem at load, and the IR marks that subsystem as synthesized. Keys: one or more letters, digits, underscores or hyphens. A dot is not permitted. Pattern: `^[a-zA-Z0-9_-]+$`. |

_Additional properties are not permitted._

## Definitions

### `inject_delivery`

A single delivery mechanism, authored as an array of entries. Each entry carries an 'in' (local identifier — env var name, file path, arg flag, or custom mechanism-specific key) plus exactly one of 'from' (a provides key to resolve) or 'value' (a literal string, optionally containing Go template expressions evaluated at self-inject resolution). 'from' resolves against the target's provides in uses[].inject context, against the provides the attachment's FeatureRecipe publishes in an attachment's features.<name>.inject context, or against the component's own provides in component.inject context. In an attachment's features.<name>.inject a 'from' naming a key the FeatureRecipe does not publish halts the build, unless that FeatureRecipe reads the attachment's entries itself at .inject in a template it evaluates against the attachment's render context (its valuesMapping, workload, artifacts, omits, or a pipeline step's with or when — not its injectMapping), in which case the key is one it consumes rather than one delivered through the component's .context.inject. 'value' is delivered only in component.inject: an entry carrying it in uses[].inject or in an attachment's features.<name>.inject halts the build, because those blocks deliver only keys another entity publishes.

**Type:** `object[]`

### `inject_block`

Agnostic injection routing. Maps local variables to target provides keys (uses[].inject), to the provides keys an attachment's FeatureRecipe publishes (features.<name>.inject), or to literal strings / template expressions and the component's own provides keys (component.inject). Each delivery mechanism (env, file, arg, or custom) is authored as an array of {in, from?, value?} entries — explicit 'from' for provides references and 'value' for literals. A custom mechanism may take any name except all: a template reads every mechanism merged into one view at .context.inject.all, so a mechanism of that name would be hidden by it, and naming one halts the build.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `env` | inject_delivery | no | A single delivery mechanism, authored as an array of entries. Each entry carries an 'in' (local identifier — env var name, file path, arg flag, or custom mechanism-specific key) plus exactly one of 'from' (a provides key to resolve) or 'value' (a literal string, optionally containing Go template expressions evaluated at self-inject resolution). 'from' resolves against the target's provides in uses[].inject context, against the provides the attachment's FeatureRecipe publishes in an attachment's features.<name>.inject context, or against the component's own provides in component.inject context. In an attachment's features.<name>.inject a 'from' naming a key the FeatureRecipe does not publish halts the build, unless that FeatureRecipe reads the attachment's entries itself at .inject in a template it evaluates against the attachment's render context (its valuesMapping, workload, artifacts, omits, or a pipeline step's with or when — not its injectMapping), in which case the key is one it consumes rather than one delivered through the component's .context.inject. 'value' is delivered only in component.inject: an entry carrying it in uses[].inject or in an attachment's features.<name>.inject halts the build, because those blocks deliver only keys another entity publishes. |
| `file` | inject_delivery | no | A single delivery mechanism, authored as an array of entries. Each entry carries an 'in' (local identifier — env var name, file path, arg flag, or custom mechanism-specific key) plus exactly one of 'from' (a provides key to resolve) or 'value' (a literal string, optionally containing Go template expressions evaluated at self-inject resolution). 'from' resolves against the target's provides in uses[].inject context, against the provides the attachment's FeatureRecipe publishes in an attachment's features.<name>.inject context, or against the component's own provides in component.inject context. In an attachment's features.<name>.inject a 'from' naming a key the FeatureRecipe does not publish halts the build, unless that FeatureRecipe reads the attachment's entries itself at .inject in a template it evaluates against the attachment's render context (its valuesMapping, workload, artifacts, omits, or a pipeline step's with or when — not its injectMapping), in which case the key is one it consumes rather than one delivered through the component's .context.inject. 'value' is delivered only in component.inject: an entry carrying it in uses[].inject or in an attachment's features.<name>.inject halts the build, because those blocks deliver only keys another entity publishes. |
| `arg` | inject_delivery | no | A single delivery mechanism, authored as an array of entries. Each entry carries an 'in' (local identifier — env var name, file path, arg flag, or custom mechanism-specific key) plus exactly one of 'from' (a provides key to resolve) or 'value' (a literal string, optionally containing Go template expressions evaluated at self-inject resolution). 'from' resolves against the target's provides in uses[].inject context, against the provides the attachment's FeatureRecipe publishes in an attachment's features.<name>.inject context, or against the component's own provides in component.inject context. In an attachment's features.<name>.inject a 'from' naming a key the FeatureRecipe does not publish halts the build, unless that FeatureRecipe reads the attachment's entries itself at .inject in a template it evaluates against the attachment's render context (its valuesMapping, workload, artifacts, omits, or a pipeline step's with or when — not its injectMapping), in which case the key is one it consumes rather than one delivered through the component's .context.inject. 'value' is delivered only in component.inject: an entry carrying it in uses[].inject or in an attachment's features.<name>.inject halts the build, because those blocks deliver only keys another entity publishes. |

### `component_uses_block`

The connections a component draws to the components it depends on, keyed by socket. Each socket lists its targets, or names each connection under an alias. A connection named under an alias may carry the developer's per-connection values and the attachments filling the slots the socket declares.

**Keys:** one or more letters, digits, underscores or hyphens. A dot is not permitted. Pattern: `^[a-zA-Z0-9_-]+$`.

Values are `string[] or map of object`.

_Any other key is not permitted._

### `feature_uses_block`

The connections an attached Feature draws, keyed by a socket the Feature declares in its usesSchema. Each socket lists its targets, or names each connection under an alias. A connection a Feature draws carries no attachments of its own: a credential it needs fills a slot the Feature declares in its own featuresSchema and is attached beside the Feature.

**Keys:** one or more letters, digits, underscores or hyphens. A dot is not permitted. Pattern: `^[a-zA-Z0-9_-]+$`.

Values are `string[] or map of object`.

_Any other key is not permitted._

### `connection_attachment`

One attachment a connection carries: the Feature filling a slot the connection's socket declares, with the developer's configuration for it.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `type` | string | yes | The URI of the Feature interface this attachment requests (e.g. core/referenced-secret:1.0.0). |
| `description` | string | no | Optional documentation explaining why this connection carries the attachment. |
| `values` | object | no | Developer-provided configuration for the Feature, validated by its schema declaration. |

_Additional properties are not permitted._

### `subsystem`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `description` | string | no | Optional documentation describing this subsystem's purpose and the logical grouping it represents. |
| `annotations` | map of string or object or null | no | Developer-authored annotations on this subsystem. Values are strings, structured objects (a map of subkey to value, merged per subkey with an inherited structured value), or null; explicit null on a key inherited from a parent subsystem removes the inherited binding from this subsystem (annotation-driven Feature opt-out). Annotations declared here are inherited by nested subsystems and by contained components; closer-level wins per-key. Cascades down to the .context.annotations.aggregate bucket on each derived IR node. |
| `features` | map of object | no | Cross-cutting features attached to all components in this subsystem. Same schema as component-level features (type, values, uses, inject). Flattened into each component at graph finalization, positioned after component-level features in execution order. Keys: one or more letters, digits, underscores or hyphens. A dot is not permitted. Pattern: `^[a-zA-Z0-9_-]+$`. |
| `subsystems` | map of subsystem | no | Keys: one or more letters, digits, underscores or hyphens. A dot is not permitted. Pattern: `^[a-zA-Z0-9_-]+$`. |
| `components` | map of component_instance | no | Keys: one or more letters, digits, underscores or hyphens. A dot is not permitted. Pattern: `^[a-zA-Z0-9_-]+$`. |

_Additional properties are not permitted._

### `component_instance`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `type` | string | yes | The abstract Component requested, as a reference: its metadata.name plus an optional :version (e.g., core/api-server:1.0.0), never a file path. Resolved via the Three-Tier Entity Resolution Model (workspace catalog directories → cache → registry): a Component authored locally is placed under catalog/ at the workspace root or in a directory listed under workspace.catalog_dirs, and a type written as a relative file path halts the build as an entity no catalog holds. |
| `active` | boolean or string | no | Whether this component is present in the compiled topology. A boolean, or a string template over .parameters that must resolve to a boolean. When it resolves to false the component is pruned from the topology, cascading to its uses edges and its attachments. Driving the value from a parameter lets a Release toggle the component's presence by fulfilling that parameter. Defaults to true when omitted. Default: `true` |
| `description` | string | no | Optional documentation describing this component instance's role in the application. Carried through to the IR graph. |
| `annotations` | map of string or object or null | no | Developer-authored annotations on this component. Values are strings, structured objects (a map of subkey to value, merged per subkey with an inherited structured value), or null; explicit null on a key inherited from a parent subsystem removes the inherited binding from this component (annotation-driven Feature opt-out). Component-level annotations override inherited subsystem-level annotations per key; sibling components in the same subsystem retain their own annotation maps independently. |
| `values` | object | no | Opaque cognitive properties passed to the Component, validated by its schema. |
| `uses` | component_uses_block | no | The connections a component draws to the components it depends on, keyed by socket. Each socket lists its targets, or names each connection under an alias. A connection named under an alias may carry the developer's per-connection values and the attachments filling the slots the socket declares. |
| `inject` | inject_block | no | Component-level self-inject. Injects the component's own values (via 'value:') or own provides keys (via 'from:') directly into the delivery pipe (.context.inject). Only allowed if the Component catalog entity declares 'spec.inject' with the corresponding mechanisms. An inject key that collides with a key declared in uses[].inject halts the build as a duplicate delivery key across inject sources. |
| `features` | map of object | no | The Features attached to this component, keyed by the instance name the author gives each attachment. This is the single attachment surface: an operational Feature, a credential Feature (one labeled feature.aggrega.ai/kind: secret) and an identity Feature are all attached here, under the same keyword and the same shape. What differs between them is what the attachment produces, not how it is declared. An attachment whose instance name matches a slot the Component declares in featuresSchema fills that slot; any other instance name is a free attachment. Keys: one or more letters, digits, underscores or hyphens. A dot is not permitted. Pattern: `^[a-zA-Z0-9_-]+$`. |

_Additional properties are not permitted._
