# Aggrega Developer Intent (Aggregate) schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/aggregate-v1alpha1.schema.json`

The recursive, parameterized AI architecture. Acts as both the root application and reusable module.

See the [aggregate authoring reference](../../../entities/aggregate/) for prose guidance on authoring aggregate entities; this page documents the structural schema that reference describes.

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
| `name` | string | yes |  |
| `version` | string | yes | Strict Semantic Versioning of the aggregate module. |
| `description` | string | no |  |
| `maintainers` | object[] | no | List of maintainers who own this entity. |
| `license` | string | no | Legal compliance license (e.g., Apache-2.0). |
| `repository` | string | no | The URL to the Git repository where the source files live. |
| `home` | string | no | The URL of this entity's home page, wiki, or documentation. |
| `keywords` | string[] | no | A list of descriptive keywords for UI discoverability. |
| `deprecated` | boolean | no | Indicates whether this entity is deprecated and should no longer be used. |
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
| `parameters` | map of object | no | Global environment contract. Each entry is a typed-contract object authoring the compact-form vocabulary subset (type, description, default, enum, min/max, minLength/maxLength, pattern, format, validate, validateMessage, required, items, valuesType, properties). Nested structure is expressed via the typed-form properties: sub-field. Release fulfillment may be inline (parameters: {...}) or single-source file import (parameters: {$import: <path>}); Step 1a validates the merged map against this contract before parameter interpolation. See aggrega-docs/language-reference/entities/aggregate.md for the full vocabulary. |
| `aggregates` | object | no | Nested aggregates acting as imported modules. |
| `exportedComponents` | map of string | no | The Public API Interface. Maps an exposed public name to an internal component ID. Parent Aggregates importing this module reference components by these public names. |
| `subsystems` | object | no | Named logical groupings of an Aggregate's components into subsystems. Mutually exclusive with top-level components — declaring both is rejected. A subsystem the author names default is an ordinary declared subsystem, distinct from the synthesized default the compiler creates for a components-only Aggregate. |
| `components` | object | no | The map of logical atomic components that make up this Aggregate, authored directly at the top level. Top-level components and subsystems are mutually exclusive — declaring both is rejected. When components are authored here (without subsystems), the compiler folds them into a synthesized default subsystem at load, so every downstream pass sees a uniform subsystem-bearing structure; the synthesized default is marked as such in the IR. |

_Additional properties are not permitted._

## Definitions

### `inject_delivery`

A single delivery mechanism, authored as an array of entries. Each entry carries an 'in' (local identifier — env var name, file path, arg flag, or custom mechanism-specific key) plus exactly one of 'from' (a provides key to resolve) or 'value' (a literal string, optionally containing Go template expressions evaluated during Step 5 Pass 2a). 'from' resolves against the target's provides in uses[].inject context, or against the component's own provides in component.inject context.

**Type:** `any or any[]`

### `inject_block`

Agnostic injection routing. Maps local variables to target provides keys (uses[].inject) or to literal strings / template expressions (component.inject). Each delivery mechanism (env, file, arg, or custom) is authored as an array of {in, from?, value?} entries — explicit 'from' for provides references and 'value' for literals.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `env` | inject_delivery | no |  |
| `file` | inject_delivery | no |  |
| `arg` | inject_delivery | no |  |

### `uses_block`

The Structural Topology - Developer Owned. Declares logical network edges and dependencies.

_This object declares no fixed properties and permits none._

### `subsystem`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `description` | string | no | Optional documentation describing this subsystem's purpose and the logical grouping it represents. |
| `annotations` | map of string or object or null | no | Developer-authored annotations on this subsystem. Values are strings or null; explicit null on a key inherited from a parent subsystem removes the inherited binding from this subsystem (annotation-driven Feature opt-out). Annotations declared here are inherited by nested subsystems and by contained components; closer-level wins per-key. Cascades down to the .context.annotations.aggregate bucket on each derived IR node. |
| `features` | object | no | Cross-cutting features attached to all components in this subsystem. Same schema as component-level features (type, values, uses, inject). Flattened into each component during Step 3 Graph Finalization, positioned after component-level features in execution order. |
| `subsystems` | object | no |  |
| `components` | object | no |  |

_Additional properties are not permitted._

### `component_instance`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `type` | string | yes | The abstract Component requested (e.g., core/api-server:1.0.0). Resolved via the Three-Tier Entity Resolution Model (local path → workspace dir → registry). |
| `description` | string | no | Optional documentation describing this component instance's role in the application. Passed through to the IR graph for augmenting rendering. |
| `annotations` | map of string or object or null | no | Developer-authored annotations on this component. Values are strings or null; explicit null on a key inherited from a parent subsystem removes the inherited binding from this component (annotation-driven Feature opt-out). Component-level annotations override inherited subsystem-level annotations per key; sibling components in the same subsystem retain their own annotation maps independently. |
| `values` | object | no | Opaque cognitive properties passed to the Component, validated by its schema. |
| `uses` | uses_block | no |  |
| `inject` | inject_block | no | Component-level self-inject. Injects the component's own values (via 'value:') or own provides keys (via 'from:') directly into the delivery pipe (.context.inject). Only allowed if the Component catalog entity declares 'spec.inject' with the corresponding mechanisms. The compiler validates that no inject key collides with keys declared in uses[].inject — collisions cause ErrInjectKeyCollision fatal halt. |
| `features` | object | no | Operational and security features attached to this component. |
| `secrets` | object | no | Credential Features mapped to this component. Only Features labeled feature.aggrega.ai/kind: secret are accepted here. The compiler enforces this partition: non-credential Features placed in secrets: cause a Fatal Halt. |

_Additional properties are not permitted._
