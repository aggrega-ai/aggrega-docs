# Aggrega Catalog (Component) schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/component-v1alpha1.schema.json`

The abstract definition of an atomic building block.

See the [component authoring reference](../../entities/component.md) for prose guidance on authoring component entities; this page documents the structural schema that reference describes.

**Top-level type:** `object`

## Properties

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `apiVersion` | const "aggrega.ai/v1alpha1" | yes | Constant: `"aggrega.ai/v1alpha1"` |
| `kind` | const "Component" | yes | Constant: `"Component"` |
| `metadata` | object | yes |  |
| `spec` | object | yes | Validation and schema definitions governing the developer's opaque values payload. |

_Additional properties are not permitted._

#### `component.metadata`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes |  |
| `version` | string | yes | Strict Semantic Versioning of the interface (e.g., 1.0.0). |
| `description` | string | no | A concise, one-sentence summary of what the entity does. |
| `maintainers` | object[] | no | List of maintainers who own this entity. |
| `license` | string | no | Legal compliance license (e.g., Apache-2.0). |
| `repository` | string | no | The URL to the Git repository where the source files live. |
| `home` | string | no | The URL of this entity's home page, wiki, or documentation. |
| `keywords` | string[] | no | A list of descriptive keywords for UI discoverability. |
| `labels` | object | yes | Duck-typing labels to declare characteristics. Must include the reserved 'component.aggrega.ai/type' key. |
| `annotations` | map of string | no | Immutable, intrinsic component characteristics authored by the Platform Architect in Domain 2. Cascades down to the .context.annotations.catalog bucket. |

_Additional properties are not permitted._

##### `component.metadata.maintainers[]`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes |  |
| `email` | string | no |  |
| `url` | string | no |  |

_Additional properties are not permitted._

##### `component.metadata.labels`

Duck-typing labels to declare characteristics. Must include the reserved 'component.aggrega.ai/type' key.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `component.aggrega.ai/type` | string (enum) | yes | The foundational 7-Type Cloud-Native Ontology mapping. Allowed values: `"server"`, `"worker"`, `"task"`, `"function"`, `"stateful-server"`, `"resource"`, `"messaging"` |

#### `component.spec`

Validation and schema definitions governing the developer's opaque values payload.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `extends` | string | no | URI of a base Component this Component extends. Extending composes structure: the base's metadata labels and annotations, its attachment slots (featuresSchema), its self-inject allowlist (inject) and its topology sockets (usesSchema) are inherited, and this Component may add to them or replace an inherited entry key by key. The base's data pillars are NOT composed — the base's schema block is inherited exactly as the base authored it, so an extending Component writes schema: inherited and authors no pillar content of its own. |
| `featuresSchema` | map of object | no | Declarative attachment slot definitions: the named binding points at which this entity expects a Feature to be attached. A slot constrains which fill may bind it (selector) and how the fill's material may be delivered (inject); the fill's own Feature owns its values and infra contract. Declaring a slot never closes the attachment block — a deployment may attach a Feature under a name no slot declares, so one entity serves both a slot-filled attachment and a credential shared at a broader scope. A slot is a binding point, not a dependency socket: usesSchema declares the separate topology surface. |
| `inject` | string[] | no | Allowlisted self-inject delivery mechanisms (e.g., ['env', 'file', 'arg']). When present, developers may use the inject: block at the component level in the Aggregate to inject their own values or provides keys directly into the delivery pipe. If omitted, component-level self-inject is forbidden (Black-Box pattern — the Recipe handles all internal wiring). Same semantics as usesSchema[].inject but governs the component's own values rather than cross-component topology. |
| `usesSchema` | object | no | Native YAML schema defining the topology. The Go CLI natively reads this to validate selectors and allowed inject paradigms. |
| `schema` | any | no | JSON Schema 2020-12 content covering the free-form pillars: values (the Developer's domain — application-shape parameters the Developer configures per Component instance in the Aggregate); infra (the Operator's domain — physical sizing knobs supplied by the Release); and provides (downstream context keys this Component exposes to consumers via the topology pipe). Accepts four authoring modes via content-shape dispatch: (1) inline content (a YAML map carrying compact form, JSON Schema YAML, or mixed); (2) single-file replacement via {$import: <path>}; (3) cross-document reference via {$ref: <Library>#/schemas/<name>} into a SchemaLibrary entry by bare-name identity (the version is supplied by the per-Release lockfile; no registry host appears in the reference); (4) the bare string inherited, which is the only form a Component declaring extends may write — it states that the three pillars come from the base Component exactly as the base authored them. Modes 1 to 3 author content and are available only to a Component that declares no extends; mode 4 authors none and is required of every Component that does. The companion fields usesSchema and featuresSchema cover the fixed-shape pillars (dependency sockets, attachment slots); the bridge synthesis composes the three into the entity's unified validation surface. |
| `assertions` | map of string | no | Build-time cross-field validation. Each entry is a named assertion: the key is a stable rule identifier surfaced in error messages; the value is a Go template string with `{{ fail "message" }}` halt semantics. Multiple named assertions per entity evaluate per-instance in author-declared order; the first failing assertion halts the build. Component assertions evaluate post-resolution, post-analyzer-gate and pre-render, and express architectural invariants of the contract that hold regardless of which Recipe binds. Template context: .values / .infra / .uses / .features / .metadata. The evaluator uses missingkey=error: references to undefined keys halt with a no-such-key diagnostic. Because the bare reference halts before any fallback can run, a plain `default` does not supply an optional-field fallback on this surface — gate the reference with `hasKey`, or read it through `index` and then apply `default`, or use the `optional` helper, which performs the presence check directly. Inheritance is additive: a Component declaring extends is evaluated against the assertions it inherits as well as its own, with the inherited rules first, and a chain of any depth accumulates from the chain root downward — so when more than one rule would fail, the one declared furthest up the chain is the one reported. Reusing an inherited name to declare a different rule is rejected when the extends chain is resolved against the catalog, naming both Components and the shared name — so it surfaces once the base Component is present, not from the extending document alone; an extending Component adds rules and never replaces one. Restating an inherited rule byte-for-byte under its own name is accepted as the no-op it is. Nothing checks whether two rules can both hold: a mutually unsatisfiable pair is an authoring error that surfaces as an ordinary assertion failure when an instance trips whichever fires first, never as a warning up front. |

_Additional properties are not permitted._

## Definitions

### `extending-component-must-declare-schema-inherited`

Applies when spec.extends is present. An extending Component receives its base's values / infra / provides exactly as the base authored them, so it declares spec.schema: inherited and authors no pillar content. Both other outcomes are errors, and they are different mistakes: omitting spec.schema entirely, which would leave a reader unable to tell an inherited pillar block from a forgotten one; and authoring pillar content under spec.schema, which would ask for a second, divergent contract on a Component whose contract is its base's.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `schema` | const "inherited" | yes | The inheritance marker, and the only value spec.schema takes on a Component that declares extends. It names where the pillars come from; the pillar content itself is the base Component's. Constant: `"inherited"` |

### `non-extending-component-authors-its-own-schema`

Applies when spec.extends is absent. A Component that extends no base authors its own values / infra / provides content under spec.schema, so the field carries authored content rather than the inherited marker: the marker states that pillars come from a base, and this Component has none.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `schema` | object | no | Authored pillar content — a map, in any of the three content-authoring modes spec.schema documents. |
