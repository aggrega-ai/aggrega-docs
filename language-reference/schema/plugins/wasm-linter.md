# Aggrega Wasm Linter Socket schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/wasm-linter-v1alpha1.schema.json`

The JSON wire shapes the publishing-linter.wasm plugin socket consumes (LinterInput) and emits (LinterOutput). The linter runs at publish time over a previous-version + proposed-version entity pair (the schema-evolution rule) and at workspace lint time over individual entities (per-rule structural rules). One shipping Wasm plugin hosts many rules; the dispatcher selects which rule to run via the LinterInput.rule_id field. The two wire shapes are co-canonical with the corresponding PDK mirrors at aggrega-pdk/<lang>/src/types; per-language round-trip tests catch drift.

## One of the following shapes

- `LinterInput`
- `LinterOutput`

## Definitions

### `LinterInput`

The payload the host hands the publishing-linter plugin on each invocation. rule_id selects which rule the plugin dispatches to. entity_kind identifies the entity kind being linted (Component, Feature, Recipe, FeatureRecipe, SchemaLibrary, MappingLibrary, Aggregate). proposed carries the parsed entity structure being classified (the host parses YAML to JSON before sending; the plugin never sees raw bytes). previous carries the parsed previous-version entity for the schema-evolution rule; omitted when not applicable. policies carries the per-workspace publishing-discipline configuration the rule consults.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `rule_id` | string | yes | The rule the plugin should dispatch to. At v0.1.0 the only recognised value is 'schema-evolution'; the recognised set expands as further rules ship. Unknown rule_ids produce an 'unknown_rule' finding in the output. |
| `entity_kind` | string (enum) | yes | The entity kind the proposed/previous values encode. The schema-evolution rule's classification varies per kind; structural rules scope to specific kinds. Allowed values: `"Component"`, `"Feature"`, `"Recipe"`, `"FeatureRecipe"`, `"SchemaLibrary"`, `"MappingLibrary"`, `"Aggregate"` |
| `proposed` | object | yes | Parsed structure of the entity being classified. YAML → JSON conversion happens host-side; the plugin consumes the structured value via serde_json. |
| `previous` | object | no | Parsed structure of the previous-version entity, for rules that perform pairwise comparison (schema-evolution). Omitted when the rule does not need a previous-version reference (e.g., first publication, structural-only rules). |
| `parent` | object | no | Parsed structure of the resolved parent entity in the extends chain, for rules that perform child-vs-parent comparison (narrowing). The host caller resolves the entity's spec.extends URI before invocation. Omitted when no parent exists or the rule does not need parent context. |
| `source_path` | string | no | Filesystem path the entity was loaded from. Populated by host callers walking the catalog filesystem; consumed by path-aware rules (e.g., category-matches-directory). Omitted when the caller has no path context. |
| `policies` | Policies | no | The per-workspace publishing-discipline configuration the rule consults. The guest realizes it as the typed Policies object; the host pipes it through as an opaque payload it assembles from the workspace config and CLI overrides. |

_Additional properties are not permitted._

### `LinterOutput`

The response shape the publishing-linter plugin emits. findings carries one entry per rule invocation that produced a result. The schema-evolution rule emits exactly one finding (the classification verdict); structural rules may emit zero (no violations) or many (one per offence).

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `findings` | Diagnostic[] | yes | Per-rule findings produced by the plugin invocation, in plugin emit order. |
| `error` | string | no | A failure message set when the guest ran but could not complete the operation; absent on success. It is distinct from any diagnostics the output carries: diagnostics report issues found during a run that still produced a result, while error reports that the operation itself did not complete. The host surfaces a present error as a failed plugin invocation. |

_Additional properties are not permitted._

### `Policies`

Per-workspace publishing-discipline configuration the rule set consults. Mirrors workspaceconfig.PublishingDisciplineConfig field-for-field. Schema is the contract: both the Go workspaceconfig struct's godoc AND the Rust policies.rs struct doc cross-reference this $def. Field omission defaults each flag to false; the host's serialiser writes only fields with non-default values.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `enforce_monotonic_narrowing` | boolean | no | When true, the narrowing rule enforces the monotonic-narrowing invariant: every extending entity narrows the parent's schema (no widening, no semantic divergence). When false, the rule is suppressed. |
| `enforce_immutability` | boolean | no | When true, published artefacts are immutable at the registry path; re-publishing the same version is rejected. When false, the rule is suppressed (development-only). |
| `narrowing_exemptions` | NarrowingExemption[] | no | Per-entity exemptions from the narrowing-violation rule. Each entry names an entity and the specific schema paths that may legitimately widen. |
| `allow_dynamic_refs` | boolean | no | When true, $dynamicAnchor / $dynamicRef usage in SchemaLibrary entries is permitted (suppresses the dynamic_refs rule). Default false. |
| `allow_id_overrides` | boolean | no | When true, $id overrides in SchemaLibrary entries are permitted (suppresses the id_overrides rule). Default false. |
| `allow_direct_x_aggrega_extensions` | boolean | no | When true, direct x-aggrega-selector / x-aggrega-inject authoring is permitted (suppresses the x_aggrega_discouragement rule). Default false. |
| `allow_aggrega_ai_prefix` | boolean | no | When true, the annotation-prefix rule is suppressed entirely (both the bare aggrega.ai/ check and the feature.aggrega.ai/ kind-conditional check). Default false. Mirrors workspaceconfig.PublishingDisciplineConfig.AllowAggregaAIPrefix; the host serialises the field through the LinterInput.policies passthrough. |
| `allow_nonstandard_names` | boolean | no | When true, name-shape violations are permitted (suppresses the name_shape rule). Default false. |
| `allow_category_mismatches` | boolean | no | When true, suppress the category-matches-directory rule's findings. The standard-catalog convention requires Components under core/<category>/ to declare component.aggrega.ai/category={category} matching the directory segment, where {category} is one of the 15 closed-set values. Workspaces with legitimate persistent exceptions opt out here. Default false. |

_Additional properties are not permitted._

### `NarrowingExemption`

One per-entity exemption from the narrowing-violation rule. entity names the catalog entity; paths enumerates the schema paths within that entity that may legitimately widen; reason is the human-readable justification surfaced to reviewers.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `entity` | string | yes |  |
| `paths` | string[] | yes |  |
| `reason` | string | yes |  |

_Additional properties are not permitted._
