# Fatal Halts

A fatal halt is a compile-time error that stops the build before any output is produced. Each halt names the file, the entity, and the field at fault, explains what the compiler could not resolve, and points at the concrete authoring change that fixes it. The compiler never silently repairs or rewrites your input — if something is wrong, the build stops and tells you where.

This catalog is organized by the stage of compilation at which each halt fires. Entries marked **[pending]** describe halts whose implementation is not yet complete; the rule is declared but the error message below is the intended user-facing behavior, not what currently ships.

## When loading your files

The compiler reads every Aggregate, Manifest, Component, Feature, Recipe, FeatureRecipe, Provider, and Release referenced by your build, validates each against its schema, and interpolates typed parameters from the Release into the Aggregate.

### Parameter type mismatch **[pending]**

The Release supplied a value whose type does not match what the Aggregate declared for that parameter.

Intended message (not yet emitted):
> Parameter `<parameter-name>` in Aggregate `<aggregate-name>` expects type `<declared-type>`, received `<received-type>` value `<received-value>`.

**How to fix:** change the Release value to match the parameter's declared type, or widen the Aggregate's parameter declaration to accept the type you actually need.

### External parameters file cannot be loaded

A Release declares `parametersFrom:` pointing at an external parameter file that does not exist, cannot be read, or cannot be parsed as YAML.

Emitted message:
> parametersFrom load failed: `<path>`: `<underlying-error>`.

**How to fix:** verify the `parametersFrom:` path is correct relative to the Release file, confirm the file exists and is readable by the build process, and check that its contents parse as valid YAML. If the file is committed to the repository, confirm the Release's build context can see it (for example, a gitignored `.env` file is not available during a CI build).

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

### Recipe `implements` does not match the component type **[pending]**

The Manifest picked a Recipe whose `implements:` declaration does not match the Component's `type:` (under the three-form version matching rules — exact, range, unversioned).

Intended message (not yet emitted):
> Recipe `<recipe-name>:<version>` implements `<implements-ref>` but Component `<component-id>` in Aggregate `<aggregate-name>` has type `<component-type>`.

**How to fix:** either correct the Recipe's `implements:` declaration so it matches the Component type, or change the Manifest entry to point at a Recipe that does implement the right type.

### Ambiguous Recipe selection **[pending]**

Two or more Recipes tie for specificity when resolving a single Component through the Manifest's two-tier lookup.

Intended message (not yet emitted):
> Component `<component-id>` in Aggregate `<aggregate-name>` resolves to multiple Recipes with equal specificity: `<recipe-1>`, `<recipe-2>`. Disambiguate with a name-keyed Manifest entry.

**How to fix:** add a name-keyed entry in the local Manifest that explicitly routes this Component to one Recipe. Name-keyed entries beat type-keyed entries, so the ambiguity resolves.

### Divergent Release (extends + aggregate pointer) **[pending]**

A Release uses `extends:` to inherit from a base Release but also declares its own `aggregate:` pointer.

Intended message (not yet emitted):
> Release `<release-name>` declares both `extends: <parent-release>` and `aggregate: <aggregate-ref>`. A Release that extends another Release must inherit the parent's Aggregate pointer.

**How to fix:** remove the `aggregate:` field from the child Release. Inheritance intentionally forces the child to deploy the same Developer Intent as its parent; if you need to deploy a different Aggregate, author a fresh Release without `extends:`.

### Manifest merge strategy

When a local Manifest `extends` a base Manifest, the two tiers (`type:` map, `name:` map) merge independently. Within each tier, child keys overwrite parent keys at the top level — this is a shallow replacement, not a deep merge. A child entry for a given key fully replaces the parent's entry for that key.

When the same feature instance name appears on both the Aggregate side and the Release side with conflicting non-mergeable state (beyond the permitted `infra` layering), the compiler halts with a merge-conflict message identifying both source locations and the field where the conflict was detected.

Emitted message:
> feature merge conflict for instance `<instance-name>`: `<field>` declared in both Aggregate and Release with incompatible values.

**How to fix:** reconcile the two declarations. Aggregate-side and Release-side declarations of the same feature instance combine by pillar — Aggregate contributes `values`, Release contributes `infra`. If both sides specify the same non-pillar field (such as `type:`), the values must match; correct one side to match the other, or drop the redundant declaration.

### `usesSchema` unification failure on `extends` chain

A Component or Feature declares `extends:` against a parent whose `usesSchema` cannot be unified with the child's `usesSchema` via CUE's `&` operator. CUE unification is monotonic — a child may narrow a parent's constraints but cannot widen them. Attempting to declare a looser socket type than the parent permits produces a unification failure.

Emitted message:
> usesSchema unification failed: child `<child-uri>` socket `<socket-name>` conflicts with parent `<parent-uri>`: `<unification-detail>`.

**How to fix:** either narrow the child's `usesSchema` entry to satisfy the parent's constraint, or change the inheritance direction if the child's shape is genuinely broader than the parent. Review the parent chain with `aggrega inspect` to see the resolved socket contract the child must satisfy.

### Recipe `source:` is an empty string

A Recipe declares `source: ""` — an empty string. An empty-string `source:` is an authoring ambiguity between sourceless mode (no external artifact; the Recipe produces output entirely from its `valuesMapping` or other input kinds) and sourced mode (the Recipe references an external chart, module, or file). The compiler rejects the ambiguous form at Recipe load.

Emitted message:
> recipe source is empty string; use nil for sourceless mode or a non-empty path for sourced mode.

**How to fix:** omit the `source:` field entirely (or set it to null) if the Recipe is sourceless, or provide a non-empty path / URI / structured source object if the Recipe is sourced.

## When building the topology

Once every Component has a resolved Recipe, the compiler stitches Components together into the IR graph by reading each Component's `uses:` block and cross-referencing targets and feature attachments.

### Dangling `uses` target **[pending]**

A Component's `uses:` entry points at a target name that does not exist in the Aggregate.

Intended message (not yet emitted):
> Component `<component-id>` in Aggregate `<aggregate-name>` has `uses.<group>.<target-id>` pointing at `<target-id>`, which is not declared in this Aggregate.

**How to fix:** either declare the missing target Component in the Aggregate, or correct the target name in the `uses:` block to match an existing Component.

### `uses:` socket not declared in the target's `usesSchema`

A Component or Feature instance declares a `uses:` block with a socket name that does not exist in the target catalog entity's `usesSchema`. The `usesSchema` on the catalog entity is the enabling schema — every socket in an authored `uses:` block must correspond to a `usesSchema` key.

Emitted message:
> unknown uses socket `<socket-name>` on `<entity-uri>`: target entity declares no such socket in its usesSchema.

**How to fix:** either correct the socket name to match one of the keys the target catalog entity declares, or extend the target entity's `usesSchema` to declare the new socket (which requires editing the catalog entity, not the instance). If the catalog entity declares no `usesSchema` at all, the entity does not accept `uses:` declarations on its instances — remove the `uses:` block entirely.

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

Unlike tools that enforce a Directed Acyclic Graph on infrastructure dependencies, Aggrega allows cycles in the topology. Agent-to-agent architectures, callback patterns, and mutual-authentication pairs all produce cyclic edges, and the compiler accepts them. Ordering at deploy time is the renderer's concern (through `syncWaves` or equivalent), not the IR graph's.

## When checking inject contracts

After topology, the compiler walks every `inject:` block — both self-inject (a Component injecting into itself) and uses-inject (cross-Component wiring) — and validates the delivery contract against the target Component's `provides:` schema, the Feature's label partition, and the set of declared delivery keys.

### Inject `from` key is not in the target's `provides`

An `inject:` entry references a `from:` key that the target Component's `provides:` schema does not declare.

Emitted message:
> from-key `<from-key>` does not match any provides key on target; valid keys: `<key-1>, <key-2>, ...`

**How to fix:** either change the `from:` key to match one of the valid keys listed in the message, or extend the target Component's `provides:` schema to declare the key you need.

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

### `provides:` template references cross-node data

A Recipe's `provides:` template references `.context.inject` or `.context.uses`. The `provides` block is evaluated before the inject pipe is hydrated and before cross-node edges are walked — it may only reference data belonging to its own node (`.context.instance_id`, `.locals`, `.values`, `.infra`, and static strings).

Emitted message:
> node `<node-id>` provides[`<key>`]: template references `.context.inject` or `.context.uses`. The provides block is self-contained and may not reference cross-node data.

**How to fix:** refactor the template to pull only from the Recipe's own pillars. If the value you need depends on another node's output, that dependency belongs in a caller's `uses[].inject` block, not in the target's `provides`. Cross-node wiring is the consuming side's responsibility.

### Cross-node type safety violation via `@selector()`

A `usesSchema` socket declares a `@selector()` attribute tag that excludes the target Component attached at the other end of the edge. The selector is the catalog author's way of saying "this socket only accepts targets whose labels match this expression"; an edge that satisfies the socket-name lookup but fails the selector expression is a type-safety violation.

Emitted message:
> selector violation on edge `<source-id> --<socket>--> <target-id>`: target does not match selector `<selector-expression>`.

**How to fix:** either route the `uses:` edge to a Component whose labels satisfy the selector, or adjust the selector expression in the catalog entity to accept the intended target class. Review the target Component's `metadata.labels` with `aggrega inspect` to confirm which labels it carries.

### Jsonnet mapping path not supported **[pending]**

A Recipe declares `valuesMappingJsonnet:` as its mapping language. Jsonnet support is a planned extension; the schema accepts the field today, but the renderer rejects it with an explicit pointer to the supported alternatives.

Emitted message:
> valuesMappingJsonnet is not supported in ; use valuesMapping or valuesMappingFile.

**How to fix (current):** switch the Recipe to `valuesMapping:` (inline Go template) or `valuesMappingFile:` (Go template from a file path). Jsonnet support lands in a later milestone; Recipes requiring Jsonnet's expressiveness today must use Go templates as a short-term substitute.

### Unregistered provider

A Recipe declares `provider: <name>` where `<name>` does not match any registered Provider entity in the catalog. The compiler cannot dispatch rendering to a provider it has never heard of.

Emitted message:
> unsupported provider: `<provider-name>` — no Provider entity is registered under this name.

**How to fix:** confirm the provider name is spelled correctly (`helm`, `helm-chart`, `compose`, `terraform`, `cloudformation` are the standard-library names). If you intended a custom enterprise provider, ensure the Provider entity is present in the catalog workspace the build is pointed at. If you're evaluating a future provider that has not shipped yet, pick one of the standard-library providers until the target provider is available.

### Self-inject value template references cross-node data

A component-level `inject:` `value:` template pulls from `.context.inject` or `.context.uses`. The inject pipe is what this pass is constructing — a template inside a component's own self-inject value cannot read from it.

Emitted message:
> `<mechanism>[<key>]` value: template references `.context.inject` or `.context.uses`.

**How to fix:** move the cross-component wiring into a `uses[].inject` entry — that is where cross-node context is available. Keep component-level self-inject `value:` templates closed over the Component's own `values`, `parameters`, `infra`, and `locals`.

### Missing template key **[pending]**

A template in a Recipe, a FeatureRecipe, or a Provider eval references a parameter or context key that was never supplied.

Intended message (not yet emitted):
> template evaluation for `<entity>` at `<field-path>` references `<key>` which was not provided by Aggregate, Release, or upstream inject.

**How to fix:** supply the missing key — as a `parameters.*` declaration on the Aggregate with a Release value, as an upstream Component's `provides:` entry wired through `uses[].inject`, or as a `locals:` entry on the same entity. The template engine runs with missing-key-is-fatal semantics so that empty strings do not silently reach rendered artifacts.

## The linter domain (not fatal)

The compiler is strictly unopinionated about *execution*. It never halts the build for patterns that are merely suspicious — unused values, orphaned secrets, disconnected targets. Those belong to the linter domain, where enterprises opt in to Wasm plugins that enforce their own conventions.

### Orphaned credentials

A Secret declared without an `inject:` delivery contract is not a compile error. The core compiler preserves the declaration in the IR graph and emits no warning. Enterprise `linter.wasm` plugins may detect and warn on this pattern; enterprise renderers may also choose to mount orphaned secrets implicitly under their own Black-Box conventions. Because both interpretations are valid, the core compiler takes neither side.
