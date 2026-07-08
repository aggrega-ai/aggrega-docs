# Fatal Halts

A fatal halt is a compile-time error that stops the build before any output is produced. Each halt names the file, the entity, and the field at fault, explains what the compiler could not resolve, and points at the concrete authoring change that fixes it. The compiler never silently repairs or rewrites your input — if something is wrong, the build stops and tells you where.

This catalog is organized by the stage of compilation at which each halt fires. Entries marked **[pending]** describe halts whose implementation is not yet complete; the rule is declared but the error message below is the intended user-facing behavior, not what currently ships.

## When loading your files

The compiler reads every Aggregate, Manifest, Component, Feature, Recipe, FeatureRecipe, Plugin, and Release referenced by your build, validates each against its schema, and interpolates typed parameters from the Release into the Aggregate.

### Parameter type mismatch / contract violation

The Release supplied a value whose type or shape does not match what the Aggregate declared for that parameter. The Step 1a parameter-contract validator catches type mismatches, enum violations, range violations, pattern violations, and missing required parameters before any template interpolation runs.

Emitted message shape:
> parameter contract violated at `<aggregate-path>` slot `<slot-name>`: `<constraint detail>` (got `<received-type>` value `<received-value>`)

For a parameter declared `required: true` with no `default:` and no Release-supplied value, the validator emits the missing-parameter form:
> required parameter not supplied at `<aggregate-path>` slot `<slot-name>`

**How to fix:** change the Release value to match the parameter's declared `type` / `enum` / `min` / `max` / `pattern` constraints, supply a missing required parameter, or widen the Aggregate's declaration to accept the shape you actually need.

### External parameters file cannot be loaded

A Release declares `parameters: { $import: <path> }` pointing at an external parameter file that does not exist, cannot be read, or cannot be parsed as YAML.

Emitted message:
> failed to read file: `<path>`: `<underlying-error>`
> failed to unmarshal YAML: `<path>`: `<underlying-error>`

**How to fix:** verify the `$import:` path is correct relative to the Release file, confirm the file exists and is readable by the build process, and check that its contents parse as valid YAML. If the file is committed to the repository, confirm the Release's build context can see it (for example, a gitignored `.env` file is not available during a CI build).

### Recipe shape rules

A Recipe composes its output from three input kinds — sourced, synthesized, and artifacts — described in [../../architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md). The shape of a valid Recipe is constrained by five composition rules; four are checked when the Recipe is loaded, one is checked at emission time. The rules apply to Recipes that target a non-`eval` provider; the `eval` provider has its own constraint (below). The rule numbering preserves a gap at Rule 3 for cross-reference stability across releases.

Every Recipe-shape error carries the same message shape:

> CATALOG_ERROR: Recipe `<file-path>` (`<name>:<version>`) violates rule `<N>`:
> `<rule description>`
> `<rule-specific detail>`

The `CATALOG_ERROR:` prefix signals that the failure is attributable to the catalog entity (the Recipe, or the provider it binds to), not to the Aggregate or the Release.

#### Rule 1 — `valuesMapping` requires `source`

A Recipe declares `valuesMapping` but not `source`. Without a source engine to overlay, there is nothing to receive the mapped values.

Emitted message:
> CATALOG_ERROR: Recipe `<path>` (`<name>:<version>`) violates rule 1:
> valuesMapping requires source
> declare a source: pointer alongside valuesMapping (or remove the valuesMapping if no overlay is intended)

**How to fix:** add a `source:` pointer (a chart, module, or compose-file reference) alongside the `valuesMapping`, or remove the `valuesMapping` and adopt a different input kind (`workload:` for synthesized output, `artifacts:` for direct manifest emission).

#### Rule 2 — `source` requires `valuesMapping`

A Recipe declares `source` but no `valuesMapping`. An externally-loaded chart or module needs values; a source with no values overlay is underspecified.

Emitted message:
> CATALOG_ERROR: Recipe `<path>` (`<name>:<version>`) violates rule 2:
> source requires valuesMapping
> declare a valuesMapping alongside source, or use a different input kind (workload, artifacts)

**How to fix:** declare a `valuesMapping:` (inline Go template, or file `$import:`, or library `$import:` to a [MappingLibrary](../entities/mappinglibrary.md) entry) that produces the values overlay for the source, or remove the `source:` and adopt the input kind that matches your authoring intent.

#### Rule 4 — `workload:` requires a provider whose engine can synthesize

A Recipe declares `workload:` (synthesized mode) for a provider whose rendering engine does not implement Workload synthesis. Synthesized-mode support is a property of the provider's engine — the standard-library catalog declares `workloadSchema` on synthesis-capable providers by convention, but the check keys on engine capability, not on that field's presence.

The check runs at render time (Step 5), via the central input-kind gate, after the node's provider engine is bound; the message names the node and the provider.

Emitted message:
> CATALOG_ERROR: node `<node-id>`: provider `<provider-name>` does not support synthesised recipes (this provider supports: `<kinds>`); declare one of the supported input kinds, or target a provider that supports synthesised

**How to fix:** either bind the Recipe to a provider whose engine synthesizes (most commonly `helm` or `compose`), or migrate the Recipe to a different input kind (`artifacts:` for direct manifest emission, or `source:` + `valuesMapping:` if a chart/module exists).

> **Honest-pending — per-provider Workload-content validation.** Today the provider's `workloadSchema` is documentation-only and does not validate the Workload body; bodies are validated against the platform-owned embedded Workload schema. When the Wasm-based Workload synthesizer ships, `workloadSchema` becomes the per-provider contract the synthesizer validates the Workload body against (a distinct, content-level halt). See the roadmap's Wasm-based Workload synthesizers item.

#### Rule 5 — at least one input kind must be present

A Recipe declares no input kind: no `source` paired with `valuesMapping`, no `workload:`, no `artifacts:`. Such a Recipe produces no output and has no rendering surface.

Emitted message:
> CATALOG_ERROR: Recipe `<path>` (`<name>:<version>`) violates rule 5:
> at least one input kind must be present
> declare one of: source (with valuesMapping), workload, artifacts

**How to fix:** add the input kind that matches the Recipe's authoring intent. Recipes that only define `provides:` (virtual components that supply pointer strings without rendering anything) belong on the `eval` provider — see the eval-provider constraint below.

#### Rule 6 — `artifacts:` entry keys must be unique

A Recipe declares two or more entries under `artifacts:` with the same key. The key dictates the emitted filename (whether the entry's body is authored inline or loaded via per-entry `$import:`); duplicate keys would emit a file with the same name to the same boundary directory.

Emitted message:
> CATALOG_ERROR: Recipe `<path>` (`<name>:<version>`) violates rule 6:
> artifacts: entry keys collide
> colliding entry keys: `<key1>, <key2>, ...`

**How to fix:** rename one of the colliding entry keys so each `artifacts:` entry has a unique filename.

#### Rule 7 — emission-time filename collision across input kinds

A Recipe's three input kinds — sourced, synthesized, and artifacts — each emit files into the same boundary directory. If source-rendered, workload-synthesized, or artifact-emitted output produces a file whose name another input kind also produced, the build halts at emission with a message naming every contributor.

Rule 7 is checked at emission time (after Workload translation completes), not at Recipe load.

Emitted message (intended; emission-time detection ships incrementally):
> CATALOG_ERROR: Recipe `<path>` (`<name>:<version>`) violates rule 7:
> filename collision across input-kind origins at emission
> `<filename>` declared by: `<origin1>, <origin2>, ...`

**How to fix:** rename the colliding file in whichever input kind you control. If the collision involves a Workload-translated filename and an `artifacts:` entry, the Workload-translated names follow the provider's translation conventions (e.g., `<instance-id>-deployment.yaml` for helm) — adjust the `artifacts:` filename to a name the provider does not synthesise.

#### `eval`-provider constraint

A Recipe targets the `eval` provider but declares one or more input-kind fields (`source`, `workload`, `artifacts`, `valuesMapping`). The `eval` provider executes formatting in-memory and has no rendering surface; declaring input-kind fields on an eval Recipe is meaningless.

Emitted message:
> CATALOG_ERROR: Recipe `<path>` (`<name>:<version>`) violates rule eval:
> the eval provider executes formatting in-memory and forbids input-kind fields
> forbidden fields declared: `<field1>, <field2>, ...`

**How to fix:** remove the input-kind fields from the eval Recipe. An eval Recipe legitimately declares only `provides:` (and optionally `locals:`); it produces deterministic pointer strings for downstream consumers without rendering any artifacts.

### Instance name fails the naming pattern

An authored instance name — a key under `components`, `subsystems`, `features`, `secrets`, a sub-aggregate alias, or a `uses:` alias — contains characters outside the allowed pattern `^[a-zA-Z0-9_-]+$`. Dots, spaces, slashes, and other punctuation are not permitted in user-authored instance names; the dot in particular is reserved as the compiler's internal path separator for nested-aggregate flattening.

Emitted message:
> invalid instance name `<name>` at `<field-path>`: must match `^[a-zA-Z0-9_-]+$` (kebab-case or snake_case; no dots).

**How to fix:** rename the offending instance to use only alphanumerics, hyphens, and underscores. If the name came from an auto-generated source, adjust the generator; if you intended to express a nested-aggregate path, use the sub-aggregate import mechanism rather than embedding a dot in the name.

## When resolving the catalog

After loading, the compiler walks the Manifest's two tiers (type map, then name map) to pick the Recipe for every Component, and it walks any `extends` chains on Manifests, Components, or Features.

### Cyclic extends chain

A chain of `extends` pointers loops back on itself.

Emitted message:
> circular extends detected: `<entity-name>` already in chain. Remove the circular extends reference.

**How to fix:** inspect the `extends:` fields along the chain reported in the message and break the cycle by removing one of the pointers or by collapsing the duplicated content into a single base entity.

### Recipe `implements` does not match the mapped component type

The Manifest's mapping entry points at a Recipe whose `spec.implements:` declaration does not match the component-type key for that mapping entry. The check fires at workspace load time as a load-time consistency check (per the post-migration direct-URI-lookup model — `spec.implements` becomes a consistency check, not a dispatch mechanism).

Emitted message:
> CATALOG_ERROR: manifest mapping `<component-type>` → `<recipe-uri>`: recipe spec.implements is `<recipe-implements>` (expected `<component-type>`)

A parallel form fires when the mapping entry points at a Recipe URI that does not exist in the catalog at all:
> CATALOG_ERROR: manifest mapping `<component-type>` → `<recipe-uri>`: recipe not found in catalog

FeatureRecipe entries follow the same shape; the `features.type` mapping check emits `manifest feature mapping ... featurerecipe spec.implements is ... (expected ...)`.

**How to fix:** either correct the Recipe's `spec.implements:` declaration so it matches the Manifest's component-type key, or change the Manifest entry to point at a Recipe whose `spec.implements:` does match the component-type key.

### Ambiguous Recipe selection **[pending]**

Two or more Recipes tie for specificity when resolving a single Component through the catalog's three-form (exact / caret-range / unversioned) implements-index lookup — for example, two exact-version Recipes declaring the same `spec.implements:` URI, or two unversioned Recipes for the same Component type. The ambiguity-detection sentinel is designed but not yet shipped; today the catalog's exact-string lookup resolves only literal-key matches, and the broader three-form precedence (which is where within-form ties surface) ships alongside the range-match implementation. Until then, ambiguity does not surface as a fatal halt — authors with multiple Recipes declaring the same `spec.implements:` should disambiguate by version.

Intended message (not yet emitted):
> Component `<component-id>` in Aggregate `<aggregate-name>` resolves to multiple Recipes with equal specificity: `<recipe-1>`, `<recipe-2>`. Disambiguate with a name-keyed Manifest entry.

**How to fix:** add a name-keyed entry in the local Manifest that explicitly routes this Component to one Recipe. Name-keyed entries beat type-keyed entries, so the ambiguity resolves.

### Divergent Release (extends + aggregate pointer)

A Release uses `extends:` to inherit from a base Release but also declares its own `aggregate:` pointer. The Release JSON Schema rejects this shape at schema validation (Layer 1 envelope validation) via an `allOf` constraint: when `extends:` is present, `aggregate:` is forbidden; when `extends:` is absent, both `aggregate:` and `manifest:` are required.

Emitted message shape (Layer 1 schema validation):
> Release `<path>` failed schema validation: `aggregate` is not permitted when `extends` is set, or `aggregate`+`manifest` must be set when `extends` is absent.

**How to fix:** remove the `aggregate:` field from the child Release. Inheritance intentionally forces the child to deploy the same Developer Intent as its parent; if you need to deploy a different Aggregate, author a fresh Release without `extends:`.

### Manifest merge strategy

When a local Manifest `extends` a base Manifest, the two tiers (`type:` map, `name:` map) merge independently. Within each tier, child keys overwrite parent keys at the top level — this is a shallow replacement, not a deep merge. A child entry for a given key fully replaces the parent's entry for that key.

When the same feature instance name appears on both the Aggregate side and the Release side with conflicting non-mergeable state (beyond the permitted `infra` layering), the compiler halts with a merge-conflict message identifying both source locations and the field where the conflict was detected.

Emitted message:
> feature merge conflict for instance `<instance-name>`: `<field>` declared in both Aggregate and Release with incompatible values.

**How to fix:** reconcile the two declarations. Aggregate-side and Release-side declarations of the same feature instance combine by pillar — Aggregate contributes `values`, Release contributes `infra`. If both sides specify the same non-pillar field (such as `type:`), the values must match; correct one side to match the other, or drop the redundant declaration.

### `usesSchema` composition failure on `extends` chain

A Component or Feature declares `extends:` against a parent whose `usesSchema` cannot compose with the child's `usesSchema` under the monotonic-narrowing rule enforced by the publishing-discipline policy plugin. The rule: a child may narrow a parent's constraints (tighten an `enum:` set, shrink a numeric range, restrict a selector) but cannot relax them. Attempting to declare a looser socket type than the parent permits produces a composition failure.

Emitted message:
> usesSchema composition failed: child `<child-uri>` socket `<socket-name>` conflicts with parent `<parent-uri>`: `<composition-detail>`.

**How to fix:** either narrow the child's `usesSchema` entry to satisfy the parent's constraint, or change the inheritance direction if the child's shape is genuinely broader than the parent. Review the parent chain with `aggrega inspect` to see the resolved socket contract the child must satisfy.

### Annotation binding targets a non-existent Feature or path

A Manifest annotation binding's `feature:` field names a Feature that the catalog does not load, or the binding's `maps.infra` / `maps.values` lists declare dotted paths that the named Feature's `spec.schema` does not actually carry. Either condition halts workspace load — the binding would synthesise Feature attachments routing values into paths the runtime cannot resolve.

The validator fires three distinct conditions:

- **Feature not found.** The `feature:` value references a Feature URI absent from the loaded catalog.
- **Feature schema compile error.** The named Feature loads but its `spec.schema:` is malformed and cannot be compiled to a JSON Schema 2020-12 representation.
- **Binding path not in target schema.** The binding's `maps.infra` or `maps.values` entry names a dotted path the Feature's `spec.schema.<pillar>.<path>` does not declare.
- **Bound value does not conform to the target schema.** A value routed to a declared path does not satisfy the Feature schema's sub-schema at that path — a wrong type, or (now validated in full) an out-of-`enum` value, a `pattern` mismatch, an out-of-range number, or a malformed nested shape.

Emitted messages (Feature-not-found variant):

> CATALOG_ERROR: annotation binding `<key>` targets Feature `<feature-uri>`, but no such Feature is loaded in the catalog

Emitted messages (path-not-found variant):

> OPS_ERROR: annotation binding `<key>` routes through pillar `<pillar>` at path `<path>` on Feature `<feature-uri>`, but the Feature's spec.schema does not declare a property at that path

Emitted messages (value-conformance variant):

> OPS_ERROR: annotation subkey `<subkey>` value `<value>` does not conform to Feature `<feature-uri>` spec.schema.`<pillar>`.`<subkey>`: `<constraint failure>`

**Full validation at the located path; soft-skip only when the path cannot be located.** Once the bound subkey's sub-schema is located, the value is validated against the **complete** JSON Schema 2020-12 constraint set at that path (type, enum, pattern, numeric range, nested object/array shape) — a terminal `$ref` / `allOf` / `oneOf` is resolved against the schema's definitions and validated, not skipped. The soft-skip discipline applies only to *navigation*: when the walker meets an escape hatch (`$ref`, `patternProperties`, `oneOf`/`anyOf`/`allOf`, or schema-bodied `additionalProperties`) on an **intermediate** segment — before reaching the bound leaf — the path is not statically resolvable, so the validator continues without raising the error rather than risk a false halt; the runtime remains the validation surface for that binding.

**How to fix:** confirm the binding's `feature:` URI exists in the catalog and matches the case-sensitive URI a Recipe `implements:`. If the path-not-found variant fires on a path the Feature schema does declare, confirm the dotted path spelling (case-sensitive) and the pillar name (`infra` vs `values`). For the value-conformance variant, correct the bound value to satisfy the declared sub-schema, or widen that property's schema if the value is legitimate. When an intermediate composition operator makes a path unresolvable and the runtime later rejects it, narrow the schema to surface the property at the binding's path directly.

### Authored values or infra do not conform to the declared schema

A component instance's — or an attached Feature's or Secret's — resolved `values:` or `infra:` does not conform to the declared catalog schema. The build validates each pillar against its declared schema before rendering, so a typo'd key, a wrong-typed value, an out-of-range number, or a missing required field is caught at its source rather than producing a broken manifest at deploy time.

The check covers the standard schema constraints: a value of the wrong type (a string where the schema declares an integer), a value outside a declared range or `enum`, a value failing a declared `pattern`, and a **required** field that was not supplied. It is **default-aware**: a field the schema gives a `default:` is considered supplied even when it is omitted, so a required-with-default field never trips the "missing" check.

The **values** pillar is the developer's authoring surface. It is validated **closed** — a property the schema does not declare is rejected as a likely typo. A values schema that composes within its own document (a local `#/$defs` `$ref` or `allOf`) is resolved and validated against that definitional context.

The **infra** pillar is the operator's sizing surface, and it is checked only when the Component declares a `schema.infra` pillar — that declaration is the contract the component opts into. Because an operator may legitimately set provider-layered keys (such as `replicas`) that the rendering provider recognises but the Component schema does not list, the infra pillar is validated **closed against the union** of the Component's `schema.infra` keys and the rendering provider's recognised infra keys. A key in neither is rejected as a typo; a provider-recognised key is admitted; a key the Component schema declares still has its type and range enforced. Required-ness comes from the Component's `schema.infra` only — a provider's own required keys (which describe rendered output, not authored infra) are not imposed. When the rendering provider cannot be resolved, infra validation is skipped rather than risk rejecting a legitimate provider key.

**Feature and Secret attachments** are validated the same way, against the attached Feature's (or Secret's) declared `schema.values` / `schema.infra`. The value checked is the **effective merged result** after attachment values cascade across scopes (component, subsystem, boundary, and component-specific) — so a value introduced legally at one scope but overridden to an illegal value at a more specific scope is caught on the merged result, not the fragment. An attachment whose type declares no schema is not validated; attachment infra is validated against the attachment's own `schema.infra` (an attachment is an overlay and carries no provider union).

**Per-edge connection config** is validated the same way against the socket's per-edge contract: an edge's developer-authored `values` against the socket's `valueSchema`, and an edge's operator-authored `infra` (from a Release) against the socket's `infraSchema`. A socket that declares no per-edge schema for a pillar accepts no validated config for it (omission = no contract, nothing to check). The diagnostic names the edge by consumer, socket, and alias.

Emitted message:
> Aggregate `<name>` at `.spec.components.<component>.values.<field>`: values pillar does not conform to the Component schema: `<constraint failure>`.
> Aggregate `<name>` at `.spec.components.<component>.infra.<field>`: infra pillar does not conform to the declared infra schema: `<constraint failure>`.
> Aggregate `<name>` at `.spec.components.<component>.features.<attachment>.values.<field>`: values pillar does not conform to the Feature schema: `<constraint failure>`.
> Aggregate `<name>` at `.spec.components.<component>.secrets.<attachment>.values.<field>`: values pillar does not conform to the Secret schema: `<constraint failure>`.
> Aggregate `<name>` at `.spec.components.<component>.uses.<socket>.<alias>.values.<field>`: values pillar does not conform to the socket valueSchema: `<constraint failure>`.

**How to fix:** correct the offending value to satisfy the declared schema, or — if the value is legitimate — widen the declaring schema (the Component's `schema.values`/`schema.infra`, or the attached Feature's/Secret's) to declare it. Inspect a Component's declared schema with `aggrega inspect <component-type>` to see the exact types, ranges, defaults, and required fields each pillar expects.

### Recipe `source:` is an empty string

A Recipe declares `source: ""` — an empty string. An empty-string `source:` is an authoring ambiguity between sourceless mode (no external artifact; the Recipe produces output entirely from its `valuesMapping` or other input kinds) and sourced mode (the Recipe references an external chart, module, or file). The compiler rejects the ambiguous form at Recipe load.

Emitted message:
> recipe source is empty string; use nil for sourceless mode or a non-empty path for sourced mode.

**How to fix:** omit the `source:` field entirely (or set it to null) if the Recipe is sourceless, or provide a non-empty path / URI / structured source object if the Recipe is sourced.

## When building the topology

Once every Component has a resolved Recipe, the compiler stitches Components together into the IR graph by reading each Component's `uses:` block and cross-referencing targets and feature attachments.

### Dangling `uses` target

A `uses:` edge names a target component that does not exist in the resolved topology. The halt is origin-agnostic — a developer-authored Aggregate edge and a Release-wired edge are caught alike. A dangling target is a fatal halt, not a silent drop: an edge to a non-existent target would otherwise vanish and leave the consumer's injected values silently empty at deploy time. It is the structural sibling of the uses-socket allowlist — the socket must be declared *and* the target must resolve to an existing component before an edge is type-checked.

Emitted message:
> uses edge `<consumer>`/`<socket>`/`<alias>` targets `<target>`, which is not a component in the topology.

**How to fix:** declare the missing target component, or correct the target name in the `uses:` entry to match an existing component.

### `uses:` socket not declared in the target's `usesSchema`

A Component or Feature instance declares a `uses:` block with a socket name that does not exist in the target catalog entity's `usesSchema`. The `usesSchema` on the catalog entity is the enabling schema — every socket in an authored `uses:` block must correspond to a `usesSchema` key. The same halt fires for a per-edge `uses:` entry authored on a boundary component in a **Release**: a Release may only wire or configure edges within sockets the Component's `usesSchema` declares.

Emitted message:
> unknown uses socket `<socket-name>` on `<entity-uri>`: target entity declares no such socket in its usesSchema.

**How to fix:** either correct the socket name to match one of the keys the target catalog entity declares, or extend the target entity's `usesSchema` to declare the new socket (which requires editing the catalog entity, not the instance). If the catalog entity declares no `usesSchema` at all, the entity does not accept `uses:` declarations on its instances — remove the `uses:` block entirely.

### Release retargets a developer-declared edge

A Release per-edge `uses:` entry names a target that differs from the target the developer already wired for the same socket and alias. A Release may *configure* an edge the developer declared (set per-edge `infra`, naming the same target or omitting it) and may *wire* an edge into a declared-but-unbound socket, but it may not *retarget* an edge the developer declared — the developer owns the architecture they authored.

Emitted message:
> release edge `<consumer>`/`<socket>`/`<alias>` retargets developer-declared target `<declared-target>` to `<release-target>`.

**How to fix:** drop the differing `target` from the Release `uses:` entry to configure the existing edge (per-edge `infra` only), or, if the connection genuinely belongs to a different socket, wire it through a socket the developer left unbound. To change the target itself, change it in the Aggregate, where the topology is authored.

### Required `uses:` socket not populated

A catalog entity declares a socket in its `usesSchema` marked `required: true`, but an instance of that entity does not populate the socket in its `uses:` block.

Emitted message:
> required uses socket `<socket-name>` on instance `<instance-id>` (type `<entity-uri>`) is not populated.

**How to fix:** add a `uses:` entry for the required socket, wiring it to an appropriate target Component or Feature in the Aggregate. If the socket should no longer be required, update the catalog entity's `usesSchema` to set `required: false` or remove the `required` declaration.

### Sub-aggregate nesting depth exceeded

A chain of sub-aggregate imports exceeds the compiler's maximum nesting depth. The limit prevents runaway flattening of deeply nested topologies and forces architectural decomposition above a threshold.

Emitted message:
> max sub-aggregate nesting depth exceeded: depth `<depth>` at prefix `<flattened-prefix>`.

**How to fix:** restructure the aggregate topology to reduce nesting. A nesting depth this deep usually indicates the Aggregate shape mirrors organizational hierarchy rather than deployment topology — consider flattening groups of sub-aggregates into peer subsystems within one parent Aggregate.

### Feature type mismatch between Aggregate and Release

The Aggregate and the Release both attach a feature with the same instance name, but each declares a different `type:`.

Emitted message:
> node `<node-id>` feature `<instance-name>`: existing type `<type-in-aggregate>` conflicts with `<type-in-release>`.

**How to fix:** either drop the `type:` from the Release (it will inherit from the Aggregate), or change one side so both declare the same type. The Release is allowed to omit `type:` or repeat the Aggregate's type, but it cannot substitute a different one.

### Cyclic extends on Components or Features

A Component's `extends:` chain or a Feature's `extends:` chain loops back on itself.

Emitted message:
> circular extends detected: `<entity-name>` already in chain. Remove the circular extends reference.

**How to fix:** break the loop in the chain of Component or Feature definitions the message walks through.

### Intentional omission: the topology is not required to be acyclic

Unlike tools that enforce a Directed Acyclic Graph on infrastructure dependencies, Aggrega allows cycles in the topology. Agent-to-agent architectures, callback patterns, and mutual-authentication pairs all produce cyclic edges, and the compiler accepts them. Ordering at deploy time is the renderer's concern (through per-boundary `syncWave` or equivalent), not the IR graph's.

## When checking inject contracts

The compiler walks every `inject:` block — both self-inject (a Component injecting into itself) and uses-inject (cross-Component wiring) — and validates the delivery contract against the target Component's `provides:` schema, the Feature's label partition, and the set of declared delivery keys. The `from:`-key check runs early, right after the catalog resolves and before the topology is built, so a misspelled provides key fails fast against the line you wrote.

### Inject `from` key is not in the target's `provides`

An `inject:` entry references a `from:` key that the target Component's `provides:` schema does not declare. The compiler checks this as soon as the catalog is resolved, before it builds the topology, so the diagnostic points at the exact line you authored rather than at a later wiring stage. The target depends on where the reference lives: a Component-level self-inject `from:` resolves against that same Component's own `provides:`, while a `uses[]` cross-inject reference resolves against the used target Component's `provides:`. A Component that declares no `provides:` rejects every `from:` reference aimed at it.

Emitted message:
> inject from-key `<from-key>` is not declared in component type `<component-type>` provides; declared keys are: `[<key-1> <key-2> ...]`

When the target declares no `provides:` at all, the message names that explicitly:
> inject from-key `<from-key>` is not a provides key of component type `<component-type>`, which declares no provides keys

**How to fix:** either change the `from:` key to match one of the declared keys listed in the message, or extend the target Component's `provides:` schema to declare the key you need.

### Required feature not attached

The Component's `requiredFeatures:` list names a feature type that is not present among the features attached to this Component (across Aggregate, subsystem, and Release).

Emitted message:
> component type `<component-type>` requires feature `<required-type>` but it is not attached.

**How to fix:** attach a feature of the required type to the Component in the Aggregate or the Release. If the Component should no longer require the feature, update its catalog declaration.

### Credential label partition violated

A Feature's placement does not match its `feature.aggrega.ai/kind` label. Features labeled `secret` must go in the Component's `secrets:` block; features without that label must go in the `features:` block.

Emitted messages:
> Feature `<feature-instance>` has label `feature.aggrega.ai/kind=secret` and must be in `secrets:` block, not `features:`.
>
> Feature `<feature-instance>` does not have label `feature.aggrega.ai/kind=secret` and cannot be in `secrets:` block.

**How to fix:** move the Feature to the block that matches its label. If the Feature is mislabeled in the catalog, correct the label at the source.

### Duplicate delivery key across inject sources

The same delivery key (for example, the same env var name) is declared in two developer-authored inject sources — one at the Component level and one under a `uses[]` entry.

Emitted message:
> delivery key `<key>` in mechanism `<mechanism>` is declared in both component self-inject and uses-inject.

**How to fix:** rename one of the conflicting keys, or drop the duplicate declaration. Note that a FeatureRecipe's `injectMapping` overwriting a developer key is intentional Onion-Model interception and is not flagged. A separate render-time variant of this check may surface the same collision class at Step 5 if it escapes the Step 1 guard; the authoring fix is identical.

### Self-inject on a component without an allowlist

The developer wrote a component-level `inject:` block, but the Component catalog entity does not declare `spec.inject`. Components without a `spec.inject` allowlist are Black-Box types — they receive no developer-authored injection.

Emitted message:
> component type `<component-type>` has no spec.inject allowlist (Black-Box pattern) — self-inject is not allowed.

**How to fix:** remove the `inject:` block from this Component instance, or switch to a White-Box Component type whose catalog declaration includes `spec.inject`.

### Self-inject mechanism not in the component's allowlist

The developer wrote a component-level `inject:` block using a mechanism (for example, `env` or a specific file-mount form) that is not listed in the Component's `spec.inject` allowlist.

Emitted message:
> mechanism `<mechanism>` not in component type `<component-type>` spec.inject allowlist `[<mechanism-1>, <mechanism-2>, ...]`.

**How to fix:** switch to an allowlisted mechanism, or, if the Component should support the mechanism you need, extend its catalog `spec.inject` allowlist.

## When rendering output

After every contract is validated, the compiler evaluates Go templates on Component values, FeatureRecipe `injectMapping` blocks, and Recipe sources, then hands the result to the renderer.

### `provides:` template references a non-self-contained root

A Recipe's `provides:` template references a root outside the self-contained set. The `provides` block is evaluated in Pass 1, before the inject pipe is hydrated and before cross-node edges are walked, so it may reference only data belonging to its own node: `.context.instance_id`, `.values`, `.infra`, `.locals`, and static strings. The check is a positive allowlist, so any other root halts — `.context.inject` and `.context.uses` (cross-node), and `.context.annotations.*`, `.context.labels`, `.context.metadata`, and `.metadata.*` (placement- or deployment-coupled data the provides surface does not expose). Referencing one of these halts loudly rather than silently rendering an empty value.

Emitted message:
> node `<node-id>` provides[`<key>`]: Recipe `<recipe>` provides references `<expression>` — the provides block is self-contained and may reference only .context.instance_id, .values, .infra, .locals, and static text.

**How to fix:** refactor the template to pull only from the Recipe's own pillars. If the value depends on another node's output, that dependency belongs in a caller's `uses[].inject` block, not in the target's `provides`. If you were reaching for the deployment namespace (or other placement data) to build a cross-namespace host, publish the bare host here and qualify it on the consumer side with a routing feature — the producer's `provides` must not depend on where it was deployed.

### Cross-node type safety violation via `selector:`

A `usesSchema` socket declares a `selector:` field that excludes the target Component attached at the other end of the edge. The selector is the catalog author's way of saying "this socket only accepts targets whose labels match this expression"; an edge that satisfies the socket-name lookup but fails the selector expression is a type-safety violation. The synthesized JSON Schema carries the selector as the `x-aggrega-selector:` extension keyword consumed by the native Go selector engine.

Emitted message:
> selector violation on edge `<source-id> --<socket>--> <target-id>`: target does not match selector `<selector-expression>`.

**How to fix:** either route the `uses:` edge to a Component whose labels satisfy the selector, or adjust the selector expression in the catalog entity to accept the intended target class. Review the target Component's `metadata.labels` with `aggrega inspect` to confirm which labels it carries.

### Unknown provider

A Recipe declares `provider: <name>` where `<name>` names no rendering engine the compiler serves. The compiler cannot dispatch rendering to a provider it has never heard of.

Emitted message:
> unknown provider: `<provider-name>`

**How to fix:** confirm the provider name is spelled correctly — `helm`, `helm-chart`, and `compose` are the standard-library names. If you intended a custom enterprise provider, ensure a provider-rendering Plugin serving that name (`pluginType: provider` with the name in its `targets`) is present in the catalog workspace the build is pointed at.

### A render target is served by more than one provider plugin

A build reaches a render target — or a pull resolves one — served by more than one provider-rendering Plugin (`pluginType: provider`, each listing that target in its `targets`), and the workspace has not selected which one renders it. Rather than pick a rendering engine arbitrarily, the build halts and names both candidates. A catalog that carries two plugins for the same target is legal — two publishers may each ship a plugin for `helm` or `compose`, and the catalog accepts both. The ambiguity surfaces only at the point of use: the halt fires when a build or pull actually reaches the contested target, not at load time.

Emitted message:
> target `<target-name>` is served by more than one provider plugin (`<plugin-1>, <plugin-2>`); add a provider_bindings entry for `<target-name>` selecting one

**How to fix:** add a `provider_bindings` entry in the workspace config keyed by the render target, whose value selects the plugin identity that renders it. Keep both plugins in the federated catalog; the binding tells this workspace which one to dispatch to for the contested target.

### Path-template references a variable outside the allowlist

A `directory:` or `subDirectory:` template references a variable name that the path-template variable allowlist does not include — for example, a typo such as `{{ .parmaeters.region }}`, or a field that exists in the Recipe rendering context but is not exposed to path templates (such as `.context.inject` or `.values`).

Path templates are validated at parse time against a closed allowlist; the validation runs before any rendering work begins. The compiler also evaluates path templates with `missingkey=error` semantics, so an in-allowlist-but-undefined-at-eval-time reference produces an explicit error rather than silently rendering an empty string into a directory path.

Emitted message:
> PATH_TEMPLATE_INVALID_FIELD: `<directory|subDirectory>` template on boundary `<boundary-name>` references `<dotted-path>` which is not in the path-template variable allowlist. See `aggrega-docs/language-reference/path-template-variables.md` for the per-context matrix.

**How to fix:** correct the field name to one in the path-template allowlist, or remove the reference. The allowlist for `directory:` is `{{ .provider }}`, `{{ .boundary_name }}`, `{{ .parameters.X }}`, `{{ .manifest.recipe_name }}`, and `{{ .parent_boundary.* }}`; `subDirectory:` adds `{{ .component_id }}`. Other surfaces (Recipe `valuesMapping`, FR `injectMapping`, etc.) use a different context shape; references to `.context.*`, `.values`, `.infra`, or `.locals` are deliberately not exposed to path templates because path emission is a structural concern, not a value-rendering concern.

### Path collision: two contributors emit at incompatible paths

Two boundary contributors evaluate to the same physical assembly path but disagree on a property that must be uniform across the contributors at that path — for example, two boundaries assembling under the same `directory:` route through different providers, or one boundary declares a per-(path, provider) tuple a second boundary cannot satisfy.

Emitted message:
> PATH_COLLISION: assembly path `<path>` receives contributors from boundaries `<boundary-1>, <boundary-2>` with conflicting `<property>` (`<value-1>` vs `<value-2>`).

**How to fix:** either give each boundary a distinct `directory:` (so they assemble to separate paths), or align the conflicting property across the contributors. The compose-bridge pattern intentionally collapses two sub-boundaries into one assembly path; that pattern requires both boundaries to target the same provider and to carry compatible cascade-resolved annotations.

### Instance-ID collision across boundaries assembling to the same path

Two boundaries that assemble to the same per-(path, provider) tuple contribute components with identical instance IDs. The merged assembly cannot disambiguate the two component fragments — a single Helm chart cannot carry two Deployments named `web-server`, and a single docker-compose file cannot carry two services named `api`.

Emitted message:
> INSTANCE_ID_COLLISION: components with instance ID `<instance-id>` contributed to assembly path `<path>` (provider `<provider>`) from boundaries `<boundary-1>, <boundary-2>`.

**How to fix:** rename one of the colliding components in the Aggregate, or split the two boundaries onto separate `directory:` paths so each component instance lands in its own assembly.

### Chart-name mismatch on a merged helm-chart umbrella

Two or more boundaries contribute to the same `helm-chart`-provider assembly path but their effective `aggrega.ai/chart-name` annotations (resolved through the boundary annotation cascade) do not agree. A Helm umbrella chart has exactly one chart name; the renderer cannot pick one of the conflicting candidates.

Emitted message:
> CHART_NAME_MISMATCH: helm-chart assembly at `<path>` receives contributors with conflicting `aggrega.ai/chart-name` annotations: boundary `<boundary-1>` resolves to `<chart-name-1>`, boundary `<boundary-2>` resolves to `<chart-name-2>`.

**How to fix:** declare a matching `aggrega.ai/chart-name` annotation on every contributing boundary (the cascade mechanism makes this DRY when the contributors share a parent boundary — declare once on the parent), or split the boundaries onto separate `directory:` paths so each gets its own umbrella chart.

### FeatureRecipe template references a field outside its scope's allowlist

A FeatureRecipe with `executionScope: boundary` references a per-component-only field such as `.context.instance_id`, `.context.inject`, or `.context.uses` — fields that have no meaningful value at boundary scope. The mirror condition holds: a component-scope FeatureRecipe (the default) referencing `.boundary.*` fields fails the same validator. Validation runs at parse time against the relevant scope's field allowlist before any rendering work begins.

Emitted message:
> FR_TEMPLATE_INVALID_FIELD: FeatureRecipe `<name>` with `executionScope: <scope>` references `<dotted-path>` which is not available in `<scope>`-scope templates. Available alternatives: `<list>`. See `aggrega-docs/language-reference/entities/featurerecipe.md` for the per-scope template-context shape.

**How to fix:** rewrite the template against the scope's available fields, or change the FeatureRecipe's `executionScope`. Boundary-scope FRs reference `.boundary.path`, `.boundary.boundary_name`, `.boundary.components`, the `.boundary.*_uses_edges` collections, `.boundary.labels`, `.boundary.annotations`, and `.boundary.feature_attachments`. Component-scope FRs reference `.context.instance_id`, `.context.inject`, `.context.uses`, `.context.labels`, `.context.annotations`. Both scopes share `.values`, `.infra`, `.locals`, `.parameters`, `.steps`, and `.metadata`.

### Self-inject value template references cross-node data

A component-level `inject:` `value:` template pulls from `.context.inject` or `.context.uses`. The inject pipe is what this pass is constructing — a template inside a component's own self-inject value cannot read from it.

Emitted message:
> `<mechanism>[<key>]` value: template references `.context.inject` or `.context.uses`.

**How to fix:** move the cross-component wiring into a `uses[].inject` entry — that is where cross-node context is available. Keep component-level self-inject `value:` templates closed over the Component's own `values`, `parameters`, `infra`, and `locals`.

### Missing template key — asymmetric policy

The renderer's missing-key handling depends on the template surface:

- **Path templates** (Release boundary `directory:` / `subDirectory:`) evaluate with `missingkey=error` against a closed allowlist. A reference to an undeclared variable halts at parse time with `PATH_TEMPLATE_INVALID_FIELD`; an in-allowlist-but-undefined-at-eval-time reference produces an explicit error rather than silently rendering an empty string into a directory path.
- **Value templates** (Recipe `valuesMapping`, FeatureRecipe `injectMapping` / `provides` / `pipeline.with`, Workload bodies, Component / Feature `assertions`) evaluate with `missingkey=zero`. A reference to an undefined key renders as the type's zero value (empty string / `0` / `false`) without erroring. Catalog idioms like `{{ .values.optional_field | default "fallback" }}` continue to work; authors who need the absent-vs-zero discriminator use the `optional` helper documented at [`templates/sprig-functions.md`](../templates/sprig-functions.md).
- **Typed parameter contracts** catch missing-required-parameter and contract-violation cases at Step 1a (parameter-contract layer) with `ErrParameterContractViolation` / `ErrParameterMissing` — see "Parameter type mismatch / contract violation" above.

Path-template missing-key emit shape:
> PATH_TEMPLATE_INVALID_FIELD: `<directory|subDirectory>` template on boundary `<boundary-name>` references `<dotted-path>` which is not in the path-template variable allowlist.

**How to fix:** for path-template misses, correct the field name to one in the allowlist documented at [`path-template-variables.md`](../path-template-variables.md). For value-template misses where empty rendering is undesired, use the `optional` helper or supply the missing key as a typed `parameters.*` declaration on the Aggregate with a Release value, as an upstream Component's `provides:` entry wired through `uses[].inject`, or as a `locals:` entry on the same entity.

## The linter domain (not fatal)

The compiler is strictly unopinionated about *execution*. It never halts the build for patterns that are merely suspicious — unused values, orphaned secrets, disconnected targets. Those belong to the linter domain, where enterprises opt in to Wasm plugins that enforce their own conventions.

### Orphaned credentials

A Secret declared without an `inject:` delivery contract is not a compile error. The core compiler preserves the declaration in the IR graph and emits no warning. Enterprise `linter.wasm` plugins may detect and warn on this pattern; enterprise renderers may also choose to mount orphaned secrets implicitly under their own Black-Box conventions. Because both interpretations are valid, the core compiler takes neither side.
