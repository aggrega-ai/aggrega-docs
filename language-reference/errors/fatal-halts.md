# Fatal Halts

A fatal halt is a compile-time error that stops the build before any output is produced. Each halt names the file, the entity, and the field at fault, explains what the compiler could not resolve, and points at the concrete authoring change that fixes it. The compiler never silently repairs or rewrites your input — if something is wrong, the build stops and tells you where.

This catalog is organized by the stage of compilation at which each halt fires. Entries marked **[pending]** describe halts whose implementation is not yet complete; the rule is declared but the error message below is the intended user-facing behavior, not what currently ships.

## When loading your files

The compiler reads every Aggregate, Manifest, Component, Feature, Recipe, FeatureRecipe, Plugin, and Release referenced by your build, validates each against its schema, and interpolates typed parameters from the Release into the Aggregate.

### YAML anchor aliased inside its own content

<!-- covers: pkg/validator/envelope.ErrEntityEnvelope -->

A document anchors a node with `&name` and then aliases it with `*name` somewhere inside the content that anchor covers. Expanding the alias reproduces the anchor, whose content carries the alias again, so the document describes a structure with no end. There is nothing finite to read, let alone validate, and the build stops instead of starting a walk that cannot finish.

Reading YAML into a tree does not expand aliases, so a document in this shape is read without complaint and fails only when something walks it. The refusal therefore sits between the reading and the walk — and a build reads authored YAML at more than one point, so the same condition can be met at more than one. Four points report it, each framing the same explanation with whatever locates the document on that surface:

- **An entity file, as it is read.** The build stops before that entity is checked against its schema, so this halt names an anchor rather than a field, and carries no line and column: at that point the document has no position a diagnostic could usefully point at.
- **A schema body, as it is compiled.** A `spec.schema:` pillar is compiled from compact form into a JSON Schema document after its file has been read, so this halt fires during that compilation rather than ahead of it, and it does carry a line. The shape an earlier read cannot catch is a `$jsonschema:` escape body: an escape body is a block scalar — plain text, carrying no anchors — while the surrounding file is read, and its anchors become anchors only when that text is itself parsed, one level down. Where the cycle sat inside such a block, the halt also names `$jsonschema` as the keyword whose body carried it.
- **A provider Plugin's workload schema, as the Plugin loads.** `spec.provider.workloadSchema` is written as a block scalar: plain text while the Plugin file itself is read, carrying no anchors at that point, and its anchors become anchors only when that text is parsed as a document of its own, one level down. That parse and the compilation that follows both happen as the Plugin loads, so this halt fires there rather than when the file is read, and it carries a line. Where the cycle sat inside a `$jsonschema:` escape within the schema body, the halt also names `$jsonschema` as the keyword whose body carried it. See [../entities/plugin.md](../entities/plugin.md) for the field's authoring surface.
- **A rendered CloudFormation fragment, as the provider reads it.** A cloudformation Recipe authors a fragment, and an `artifacts:` body is a template — so what the provider reads is the text that template rendered to, content that did not exist while your files were being read. This halt therefore fires while output is being rendered, after every schema check has already passed. See [../providers/cloudformation.md](../providers/cloudformation.md) for the fragment authoring surface.

The refusal is of recursion, never of re-use or of depth. Anchoring shared content and referencing it from many places is a supported authoring pattern — see [../entities/aggregate.md](../entities/aggregate.md) "YAML anchor patterns (`defs:` block)" and [../entities/manifest.md](../entities/manifest.md) "YAML anchors for DRY manifests" — and a reference that expands and terminates loads normally, however many times it appears and however deeply the document nests; depth on its own is never a reason for this halt. What halts is an anchor reached while the build is still inside it, including where it is reached indirectly, through a second anchor declared beneath it. The message names the anchor the loop closes back onto, which is not necessarily the outermost anchor in the document.

**Emitted messages.** All four carry the same explanation, which is deliberate: it is one condition met at four points, and an author who has learned to read it once should not have to learn it again. Only the frame that locates the document differs.

> anchor `&<anchor>` is aliased by `*<anchor>` inside its own content, so the document expands without end; point that alias at content declared outside `&<anchor>`, or write the content out in full

An entity file is framed by the path it was read from:
> envelope: parse `<path>`: `<the explanation above>`

A schema body is framed by its position within the schema, and by the escape keyword when the cycle sat inside a `$jsonschema:` block. The build reports it under a `CATALOG_ERROR` tag, which also names the file, the entity, and the pillar whose body failed to compile:
> compactform at `<schema-path>`:`<line>` (keyword `"$jsonschema"`): `<the explanation above>`

A provider Plugin's workload schema carries that same compact-form frame; what differs is the `CATALOG_ERROR` tag around it, which names the Plugin and `spec.provider.workloadSchema` in place of the entity and its pillar.

A rendered fragment is framed by the provider that read it:
> cloudformation-provider: parse fragment: `<the explanation above>`

**How to fix:** point the alias at content declared outside the anchor it currently sits inside, or write the repeated content out in full at the point of use. On an Aggregate or a Manifest, the root-level `defs:` block is the natural home for shared anchors — it sits outside every block that references it, so an anchor declared there cannot be reached from within itself. On the other entity kinds, which have no `defs:` block, anchor the shared content somewhere the referring block is not a descendant of. An anchor may be referenced from any number of places and from any depth; the one shape it cannot take is a reference that lands back inside the content the anchor covers.

The same remedy applies wherever the halt was met, and the frame tells you which document to open: the entity file itself, the `$jsonschema:` block inside a schema pillar, the `workloadSchema` body inside a provider Plugin, or the `artifacts:` body whose rendered output the provider read. In that last case the anchor is in the template you authored, not in the rendered text — the rendering reproduced it faithfully.

### Parameter type mismatch / contract violation

<!-- covers: pkg/resolver.ErrParameterContractViolation, pkg/resolver.ErrParameterMissing -->

The Release supplied a value whose type or shape does not match what the Aggregate declared for that parameter. The parameter-contract validator catches type mismatches, enum violations, range violations, pattern violations, and missing required parameters before any template interpolation runs.

Emitted message shape:
> parameter contract violated at `<aggregate-path>` slot `<slot-name>`: `<constraint detail>` (got `<received-type>` value `<received-value>`)

For a parameter declared `required: true` with no `default:` and no Release-supplied value, the validator emits the missing-parameter form:
> required parameter not supplied at `<aggregate-path>` slot `<slot-name>`

**How to fix:** change the Release value to match the parameter's declared `type` / `enum` / `min` / `max` / `pattern` constraints, supply a missing required parameter, or widen the Aggregate's declaration to accept the shape you actually need.

### External parameters file cannot be loaded

<!-- covers: pkg/resolver.ErrParametersImportLoad -->

A Release declares `parameters: { $import: <path> }` pointing at an external parameter file that does not exist, cannot be read, or cannot be parsed as YAML.

Emitted message:
> failed to read file: `<path>`: `<underlying-error>`
> failed to unmarshal YAML: `<path>`: `<underlying-error>`

**How to fix:** verify the `$import:` path is correct relative to the Release file, confirm the file exists and is readable by the build process, and check that its contents parse as valid YAML. If the file is committed to the repository, confirm the Release's build context can see it (for example, a gitignored `.env` file is not available during a CI build).

### Recipe shape rules

A Recipe composes its output from three input kinds — sourced, synthesized, and artifacts — described in [../../architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md). The shape of a valid Recipe is constrained by five composition rules; four are checked when the Recipe is loaded, one is checked at emission time. The rules apply to Recipes that target a non-`eval` provider; the `eval` provider has its own constraint (below). The rule numbering preserves a gap at Rule 3 for cross-reference stability across releases.

Every Recipe-shape error carries the same message shape:

> Recipe `<name>:<version>`: validation error at `<file-path>` — rule `<N>`: `<rule description>`. `<rule-specific detail>`

The build prints it under a `CATALOG_ERROR` tag, which signals that the failure is attributable to the catalog entity (the Recipe, or the provider it binds to), not to the Aggregate or the Release.

#### Rule 1 — `valuesMapping` requires `source`

<!-- covers: pkg/validator.ErrRecipeRule1 -->

A Recipe declares `valuesMapping` but not `source`. Without a source to overlay, there is nothing to receive the mapped values.

Emitted message:
> Recipe `<name>:<version>`: validation error at `<path>` — rule 1: valuesMapping requires source. declare a source: pointer alongside valuesMapping (or remove the valuesMapping if no overlay is intended)

**How to fix:** add a `source:` pointer (a chart, module, or compose-file reference) alongside the `valuesMapping`, or remove the `valuesMapping` and adopt a different input kind (`workload:` for synthesized output, `artifacts:` for direct manifest emission).

#### Rule 2 — `source` requires `valuesMapping`

A Recipe declares `source` but no `valuesMapping`. An externally-loaded chart or module needs values; a source with no values overlay is underspecified.

Emitted message:
> Recipe `<name>:<version>`: validation error at `<path>` — rule 2: source requires valuesMapping. declare a valuesMapping alongside source, or use a different input kind (workload, artifacts)

**How to fix:** declare a `valuesMapping:` (inline Go template, or file `$import:`, or library `$import:` to a [MappingLibrary](../entities/mappinglibrary.md) entry) that produces the values overlay for the source, or remove the `source:` and adopt the input kind that matches your authoring intent.

#### Rule 4 — `workload:` requires a provider that can synthesize

A Recipe declares `workload:` (synthesized mode) for a provider that does not implement Workload synthesis. Synthesized-mode support is a property of the provider — the standard-library catalog declares `workloadSchema` on synthesis-capable providers by convention, but the check keys on provider capability, not on that field's presence.

The check runs at render time, via the central input-kind gate, after the node's provider is bound; the message names the node and the provider.

Emitted message:
> CATALOG_ERROR: node `<node-id>`: provider `<provider-name>` does not support synthesised recipes (this provider supports: `<kinds>`); declare one of the supported input kinds, or target a provider that supports synthesised

**How to fix:** either bind the Recipe to a provider that synthesizes (most commonly `helm` or `compose`), or migrate the Recipe to a different input kind (`artifacts:` for direct manifest emission, or `source:` + `valuesMapping:` if a chart/module exists).

> **Honest-pending — per-provider Workload-content validation.** Today the provider's `workloadSchema` is documentation-only and does not validate the Workload body; bodies are validated against the platform-owned embedded Workload schema. When the Wasm-based Workload synthesizer ships, `workloadSchema` becomes the per-provider contract the synthesizer validates the Workload body against (a distinct, content-level halt). See the roadmap's Wasm-based Workload synthesizers item.

#### Rule 5 — at least one input kind must be present

<!-- covers: pkg/validator.ErrRecipeRule5 -->

A Recipe declares no input kind: no `source` paired with `valuesMapping`, no `workload:`, no `artifacts:`. Such a Recipe produces no output and has no rendering surface.

Emitted message:
> Recipe `<name>:<version>`: validation error at `<path>` — rule 5: at least one input kind must be present. declare one of: source (with valuesMapping), workload, artifacts

**How to fix:** add the input kind that matches the Recipe's authoring intent. Recipes that only define `provides:` (virtual components that supply pointer strings without rendering anything) belong on the `eval` provider — see the eval-provider constraint below.

#### Rule 6 — `artifacts:` entry keys must be unique

A Recipe declares two or more entries under `artifacts:` with the same key. The key dictates the emitted filename (whether the entry's body is authored inline or loaded via per-entry `$import:`); duplicate keys would emit a file with the same name to the same boundary directory.

Emitted message:
> Recipe `<name>:<version>`: validation error at `<path>` — rule 6: artifacts: entry keys collide. colliding entry keys: `<key1>, <key2>, ...`

**How to fix:** rename one of the colliding entry keys so each `artifacts:` entry has a unique filename.

#### Rule 7 — emission-time filename collision across input kinds

<!-- covers: pkg/validator.ErrRecipeRule7 -->

A Recipe's three input kinds — sourced, synthesized, and artifacts — each emit files into the same boundary directory. If source-rendered, workload-synthesized, or artifact-emitted output produces a file whose name another input kind also produced, the build halts at emission with a message naming every contributor.

Rule 7 is checked at emission time (after Workload translation completes), not at Recipe load.

Emitted message (intended; emission-time detection ships incrementally):
> Recipe `<name>:<version>`: validation error at `<path>` — rule 7: filename collision across input-kind origins at emission. `<filename>` declared by: `<origin1>, <origin2>, ...`

**How to fix:** rename the colliding file in whichever input kind you control. If the collision involves a Workload-translated filename and an `artifacts:` entry, the Workload-translated names follow the provider's translation conventions (e.g., `<instance-id>-deployment.yaml` for helm) — adjust the `artifacts:` filename to a name the provider does not synthesise.

#### `eval`-provider constraint

<!-- covers: pkg/validator.ErrRecipeEvalProviderConstraint -->

A Recipe targets the `eval` provider but declares one or more input-kind fields (`source`, `workload`, `artifacts`, `valuesMapping`). The `eval` provider executes formatting in-memory and has no rendering surface; declaring input-kind fields on an eval Recipe is meaningless.

Emitted message:
> Recipe `<name>:<version>`: validation error at `<path>` — rule eval: the eval provider executes formatting in-memory and forbids input-kind fields. forbidden fields declared: `<field1>, <field2>, ...`

**How to fix:** remove the input-kind fields from the eval Recipe. An eval Recipe legitimately declares only `provides:` (and optionally `locals:`); it produces deterministic pointer strings for downstream consumers without rendering any artifacts.

### Instance name fails the naming pattern

<!-- covers: pkg/resolver.ErrInvalidInstanceName -->

An authored instance name — a key under `components`, `subsystems`, `features`, `secrets`, a sub-aggregate alias, or a `uses:` alias — contains characters outside the allowed pattern `^[a-zA-Z0-9_-]+$`. Dots, spaces, slashes, and other punctuation are not permitted in user-authored instance names; the dot in particular is reserved as the compiler's internal path separator for nested-aggregate flattening.

Emitted message:
> invalid instance name `<name>` at `<field-path>`: must match `^[a-zA-Z0-9_-]+$` (kebab-case or snake_case; no dots).

**How to fix:** rename the offending instance to use only alphanumerics, hyphens, and underscores. If the name came from an auto-generated source, adjust the generator; if you intended to express a nested-aggregate path, use the sub-aggregate import mechanism rather than embedding a dot in the name.

## When resolving the catalog

After loading, the compiler walks the Manifest's two tiers (type map, then name map) to pick the Recipe for every Component, and it walks any `extends` chains on Manifests, Components, or Features.

### Cyclic extends chain

<!-- covers: pkg/validator.ErrCyclicExtension -->

A chain of `extends` pointers loops back on itself.

Emitted message:
> circular extends detected: `<entity-name>` already in chain. Remove the circular extends reference.

**How to fix:** inspect the `extends:` fields along the chain reported in the message and break the cycle by removing one of the pointers or by collapsing the duplicated content into a single base entity.

### Recipe `implements` does not match the mapped component type

<!-- covers: pkg/catalog.ErrManifestImplementsMismatch -->

The Manifest's mapping entry points at a Recipe whose `spec.implements:` declaration does not match the component-type key for that mapping entry. The check fires at workspace load time as a load-time consistency check (per the post-migration direct-URI-lookup model — `spec.implements` becomes a consistency check, not a dispatch mechanism).

Emitted message:
> CATALOG_ERROR: manifest mapping `<component-type>` → `<recipe-uri>`: recipe spec.implements is `<recipe-implements>` (expected `<component-type>`)

A parallel form fires when the mapping entry points at a Recipe URI that does not exist in the catalog at all:
> CATALOG_ERROR: manifest mapping `<component-type>` → `<recipe-uri>`: recipe not found in catalog

FeatureRecipe entries follow the same shape; the `features.type` mapping check emits `manifest feature mapping ... featurerecipe spec.implements is ... (expected ...)`.

**How to fix:** either correct the Recipe's `spec.implements:` declaration so it matches the Manifest's component-type key, or change the Manifest entry to point at a Recipe whose `spec.implements:` does match the component-type key.

### Manifest mapping value carries more segments than a recipe reference accepts

<!-- covers: pkg/catalog.ErrMalformedRecipeReference -->

A Manifest mapping value names a Recipe or FeatureRecipe in a shape the reference grammar cannot express. A recipe reference accepts a bare name, a name with a version, a capability-qualified name, or a capability-qualified name with a version — at most one `/`. A value carrying more than that (a component-type-style path such as `core/helm/eso-aws-fetcher:1.0.0`) can never name a catalog entity, whatever the catalog holds.

The shape is judged as the Manifest is composed, before anything is looked up — the verdict comes from counting separators in a string, so it needs no catalog at all. Judging it there is what makes the diagnostic honest: the recipe the value *meant* is frequently present and correctly named, and being told it is missing sends you looking for the wrong thing. Every command that resolves a Release's dependencies reports it the same way, so it does not depend on which one you happen to run.

Emitted message:
> CATALOG_ERROR: malformed recipe reference in a Manifest mapping value: `spec.mappings.components.type.<key>` maps to `<value>`, which carries `<n>` slash-separated segments; a recipe reference accepts `"name"`, `"name:version"`, `"capability/name"` or `"capability/name:version"`; correct the mapping value in the Manifest

The `features` section and the per-provider mapping shape produce the same message against their own coordinate, and a feature recipe reference is named as such.

**How to fix:** shorten the mapping value to a shape the grammar accepts. A recipe is identified by its own `metadata.name` — optionally prefixed with its `spec.capability` and suffixed with its version — never by the component-type path it implements. The mapping's *key* is the component type; the mapping's *value* is the recipe.

**Not to be confused with** a well-shaped value naming a recipe the catalog does not hold: that is a genuinely absent entity and still reports as one, naming the URI and the mapping entry that referenced it.

### Ambiguous Recipe selection **[pending]**

Two or more Recipes tie for specificity when resolving a single Component through the catalog's three-form (exact / caret-range / unversioned) implements-index lookup — for example, two exact-version Recipes declaring the same `spec.implements:` URI, or two unversioned Recipes for the same Component type. The ambiguity-detection sentinel is designed but not yet shipped; today the catalog's exact-string lookup resolves only literal-key matches, and the broader three-form precedence (which is where within-form ties surface) ships alongside the range-match implementation. Until then, ambiguity does not surface as a fatal halt — authors with multiple Recipes declaring the same `spec.implements:` should disambiguate by version.

Intended message (not yet emitted):
> Component `<component-id>` in Aggregate `<aggregate-name>` resolves to multiple Recipes with equal specificity: `<recipe-1>`, `<recipe-2>`. Disambiguate with a name-keyed Manifest entry.

**How to fix:** add a name-keyed entry in the local Manifest that explicitly routes this Component to one Recipe. Name-keyed entries beat type-keyed entries, so the ambiguity resolves.

### Divergent Release (extends + aggregate pointer)

<!-- covers: pkg/validator/envelope.ErrEntityEnvelope -->

A Release uses `extends:` to inherit from a base Release but also declares its own `aggregate:` pointer. The Release JSON Schema rejects this shape at schema validation (Layer 1 envelope validation) via an `allOf` constraint: when `extends:` is present, `aggregate:` is forbidden; when `extends:` is absent, both `aggregate:` and `manifest:` are required.

Emitted message shape (Layer 1 schema validation):
> Release `<path>` failed schema validation: `aggregate` is not permitted when `extends` is set, or `aggregate`+`manifest` must be set when `extends` is absent.

**How to fix:** remove the `aggregate:` field from the child Release. Inheritance intentionally forces the child to deploy the same Developer Intent as its parent; if you need to deploy a different Aggregate, author a fresh Release without `extends:`.

### Manifest merge strategy

<!-- covers: pkg/resolver.ErrFeatureMergeConflict -->

When a local Manifest `extends` a base Manifest, the two tiers (`type:` map, `name:` map) merge independently. Within each tier, child keys overwrite parent keys at the top level — this is a shallow replacement, not a deep merge. A child entry for a given key fully replaces the parent's entry for that key.

When the same feature instance name appears on both the Aggregate side and the Release side with conflicting non-mergeable state (beyond the permitted `infra` layering), the compiler halts with a merge-conflict message identifying both source locations and the field where the conflict was detected.

Emitted message:
> feature merge conflict for instance `<instance-name>`: `<field>` declared in both Aggregate and Release with incompatible values.

**How to fix:** reconcile the two declarations. Aggregate-side and Release-side declarations of the same feature instance combine by pillar — Aggregate contributes `values`, Release contributes `infra`. If both sides specify the same non-pillar field (such as `type:`), the values must match; correct one side to match the other, or drop the redundant declaration.

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

<!-- covers: pkg/resolver.ErrSchemaConformance -->

A component instance's — or an attached Feature's or Secret's — resolved `values:` or `infra:` does not conform to the declared catalog schema. The build validates each pillar against its declared schema before rendering, so a typo'd key, a wrong-typed value, an out-of-range number, or a missing required field is caught at its source rather than producing a broken manifest at deploy time.

The check covers the standard schema constraints: a value of the wrong type (a string where the schema declares an integer), a value outside a declared range or `enum`, a value failing a declared `pattern`, and a **required** field that was not supplied. It is **default-aware**: a field the schema gives a `default:` is considered supplied even when it is omitted, so a required-with-default field never trips the "missing" check.

The **values** pillar is the developer's authoring surface. It is validated **closed** — a property the schema does not declare is rejected as a likely typo. A values schema that composes within its own document (a local `#/$defs` `$ref` or `allOf`) is resolved and validated against that definitional context.

The **infra** pillar is the operator's sizing surface, and it is checked only when the Component declares a `schema.infra` pillar — that declaration is the contract the component opts into. Because an operator may legitimately set provider-layered keys (such as `replicas`) that the rendering provider recognises but the Component schema does not list, the infra pillar is validated **closed against the union** of the Component's `schema.infra` keys and the rendering provider's recognised infra keys. A key in neither is rejected as a typo; a provider-recognised key is admitted; a key the Component schema declares still has its type and range enforced. Required-ness comes from the Component's `schema.infra` only — a provider's own required keys (which describe rendered output, not authored infra) are not imposed. When the rendering provider cannot be resolved, infra validation is skipped rather than risk rejecting a legitimate provider key.

**Feature and Secret attachments** are validated the same way, against the attached Feature's (or Secret's) declared `schema.values` / `schema.infra`. The value checked is the **effective merged result** after attachment values cascade across scopes (component, subsystem, boundary, and component-specific) — so a value introduced legally at one scope but overridden to an illegal value at a more specific scope is caught on the merged result, not the fragment. An attachment whose type declares no schema is not validated; attachment infra is validated against the attachment's own `schema.infra` (an attachment is an overlay and carries no provider union).

**Per-edge connection config** is validated the same way against the socket's per-edge contract: an edge's developer-authored `values` against the socket's `valueSchema`, and an edge's operator-authored `infra` (from a Release) against the socket's `infraSchema`. A socket that declares no per-edge schema for a pillar accepts no validated config for it (omission = no contract, nothing to check). The diagnostic names the edge by consumer, socket, and alias.

**A leaf declared `sensitive: true` has its constraint failure withheld.** The failure text quotes the offending value, and a build diagnostic is read by anyone watching the build, so on a declared-sensitive leaf — or anywhere inside a declared-sensitive object — the `<constraint failure>` below reads `<redacted>` instead. The entity, the field path, the pillar and the contract name are all still named, so the diagnostic still tells you which leaf failed; only the text that would reproduce the value is dropped. Sensitivity is read per pillar, so a leaf named the same way in `values` and `infra` is withheld only in the pillar that declares it.

Emitted message:
> Aggregate `<name>` at `.spec.components.<component>.values.<field>`: values pillar does not conform to the Component schema: `<constraint failure>`.
> Aggregate `<name>` at `.spec.components.<component>.infra.<field>`: infra pillar does not conform to the declared infra schema: `<constraint failure>`.
> Aggregate `<name>` at `.spec.components.<component>.features.<attachment>.values.<field>`: values pillar does not conform to the Feature schema: `<constraint failure>`.
> Aggregate `<name>` at `.spec.components.<component>.features.<attachment>.values.<field>`: values pillar does not conform to the Secret schema: `<constraint failure>`.
> Aggregate `<name>` at `.spec.components.<component>.uses.<socket>.<alias>.values.<field>`: values pillar does not conform to the socket valueSchema: `<constraint failure>`.

**How to fix:** correct the offending value to satisfy the declared schema, or — if the value is legitimate — widen the declaring schema (the Component's `schema.values`/`schema.infra`, or the attached Feature's/Secret's) to declare it. Inspect a Component's declared schema with `aggrega inspect <component-type>` to see the exact types, ranges, defaults, and required fields each pillar expects.

### Recipe `source:` is an empty string

<!-- covers: plugins/internal/composecore.ErrEmptySource, plugins/internal/helmcore.ErrEmptySource -->

A Recipe declares `source: ""` — an empty string. An empty-string `source:` is an authoring ambiguity between sourceless mode (no external artifact; the Recipe produces output entirely from its `valuesMapping` or other input kinds) and sourced mode (the Recipe references an external chart, module, or file). The compiler rejects the ambiguous form at Recipe load.

Emitted message:
> recipe source is empty string; use nil for sourceless mode or a non-empty path for sourced mode.

**How to fix:** omit the `source:` field entirely (or set it to null) if the Recipe is sourceless, or provide a non-empty path / URI / structured source object if the Recipe is sourced.

## When building the topology

Once every Component has a resolved Recipe, the compiler stitches Components together into the IR graph by reading each Component's `uses:` block and cross-referencing targets and feature attachments.

### Dangling `uses` target

<!-- covers: internal/compiler/topology.ErrDanglingUsesTarget -->

A `uses:` edge names a target component that does not exist in the resolved topology. The halt is origin-agnostic — a developer-authored Aggregate edge and a Release-wired edge are caught alike. A dangling target is a fatal halt, not a silent drop: an edge to a non-existent target would otherwise vanish and leave the consumer's injected values silently empty at deploy time. It is the structural sibling of the uses-socket allowlist — the socket must be declared *and* the target must resolve to an existing component before an edge is type-checked.

Emitted message:
> uses edge `<consumer>`/`<socket>`/`<alias>` targets `<target>`, which is not a component in the topology.

**How to fix:** declare the missing target component, or correct the target name in the `uses:` entry to match an existing component.

### `uses:` socket not declared in the target's `usesSchema`

<!-- covers: pkg/resolver.ErrUnknownUsesSocket -->

A `uses:` block names a socket that the entity owning the surface does not declare in its `usesSchema`, on one of the two surfaces where only a declared socket may be named: a **Feature attachment's** `uses:`, where the socket must be declared on the attached Feature, and a **Release's** per-edge `uses:`, where it must be declared on the consuming Component. A Release may wire or configure edges only within sockets the Component's `usesSchema` already declares.

A **component's own** `uses:` block is deliberately not one of those surfaces, so this halt does not fire for it. A developer owns the application's topology and may name a socket the catalog did not declare; catalog silence about a socket means the connection was not anticipated, not that it is forbidden. Such a socket is legal and its edge is built — what it gives up is the selector and the per-edge contract a declared socket carries. A misspelled socket name there is therefore not a halt but an ad-hoc connection of its own, and is reported as a warning naming both spellings — see [warnings.md](warnings.md) "Uses-socket near-miss lint".

Emitted message:
> socket `<socket-name>` not defined in component type `<component-type>` usesSchema (valid: `[<declared-sockets>]`)

The attachment arm names the feature type in place of the component type; an attached Feature that declares no `usesSchema` at all reports instead that `uses:` declarations are not allowed for it.

**How to fix:** on an attachment, correct the socket name to one the attached Feature declares, or declare that socket in the Feature's `usesSchema`. On a Release per-edge entry, correct the socket name to one the consuming Component declares — a Release cannot introduce a socket the Component does not declare, and moving the declaration into the catalog entity is the supported path. If the catalog entity declares no `usesSchema` at all, it accepts no `uses:` declarations on that surface — remove the block.

### Release retargets a developer-declared edge

<!-- covers: internal/compiler/topology.ErrReleaseEdgeRetarget -->

A Release per-edge `uses:` entry names a target that differs from the target the developer already wired for the same socket and alias. A Release may *configure* an edge the developer declared (set per-edge `infra`, naming the same target or omitting it) and may *wire* an edge into a declared-but-unbound socket, but it may not *retarget* an edge the developer declared — the developer owns the architecture they authored.

Emitted message:
> release edge `<consumer>`/`<socket>`/`<alias>` retargets developer-declared target `<declared-target>` to `<release-target>`.

**How to fix:** drop the differing `target` from the Release `uses:` entry to configure the existing edge (per-edge `infra` only), or, if the connection genuinely belongs to a different socket, wire it through a socket the developer left unbound. To change the target itself, change it in the Aggregate, where the topology is authored.

### Release per-edge configuration has no edge to apply to

<!-- covers: internal/compiler/topology.ErrUnboundReleaseEdgeConfig -->

A Release per-edge `uses:` entry sets `infra:` but no edge exists at the consumer, socket and alias it names, once every edge in the build has been drawn.

The two things a Release entry can do are *wire* an edge and *configure* one, and which it does is decided by whether it names a `target:`. An entry with a target creates the edge it configures. An entry without one configures an edge that must already exist — declared by the developer in the Aggregate, or contributed by an attached Feature. So an entry that names no target and matches no existing edge applies to nothing: the `infra:` block below it never reaches any output. The build stops rather than accepting authoring that does nothing, because a successful build otherwise reads as confirmation that the infrastructure was applied.

The alias is part of what an entry names, so an entry configuring an alias the developer never declared reaches no edge even when the socket is bound under a different alias. So does an entry naming a component the Aggregate does not declare.

Two neighbouring conditions are reported by their own halts rather than this one, because each has more to tell you. A socket the consuming Component's `usesSchema` does not declare is reported as an undeclared socket, which can list the sockets that do exist. A `target:` naming no component is reported as a dangling target. A component switched off by an `active:` toggle takes its edges with it by design, so an entry left behind on one is accepted rather than halted.

Emitted message, where the entry names a component that exists:
> release edge `<consumer>`/`<socket>`/`<alias>` sets infra but no edge is bound there: an entry without a target configures an edge that must already exist, so give the entry a target to wire the edge or remove the entry.

Where it names one that does not:
> release edge `<consumer>`/`<socket>`/`<alias>` sets infra on `<consumer>`, which is not a component in the topology.

**How to fix:** add a `target:` to the entry, which wires the edge and applies the configuration to it; correct the alias to the one the Aggregate declared for that connection, so the entry configures the existing edge; correct the component name to one the Aggregate declares; or remove the entry if the configuration is no longer wanted.

### Required `uses:` socket not populated

<!-- covers: pkg/resolver.ErrMissingRequiredSocket -->

A catalog entity declares a socket in its `usesSchema` marked `required: true`, but an instance of that entity does not populate the socket in its `uses:` block.

Emitted message:
> required uses socket `<socket-name>` on instance `<instance-id>` (type `<entity-uri>`) is not populated.

**How to fix:** add a `uses:` entry for the required socket, wiring it to an appropriate target Component or Feature in the Aggregate. If the socket should no longer be required, update the catalog entity's `usesSchema` to set `required: false` or remove the `required` declaration.

### Sub-aggregate nesting depth exceeded

<!-- covers: internal/compiler/topology.ErrMaxDepth -->

A chain of sub-aggregate imports exceeds the compiler's maximum nesting depth. The limit prevents runaway flattening of deeply nested topologies and forces architectural decomposition above a threshold.

Emitted message:
> max sub-aggregate nesting depth exceeded: depth `<depth>` at prefix `<flattened-prefix>`.

**How to fix:** restructure the aggregate topology to reduce nesting. A nesting depth this deep usually indicates the Aggregate shape mirrors organizational hierarchy rather than deployment topology — consider flattening groups of sub-aggregates into peer subsystems within one parent Aggregate.

### Feature type mismatch between Aggregate and Release

<!-- covers: internal/compiler/ir.ErrFeatureTypeMismatch -->

The Aggregate and the Release both attach a feature with the same instance name, but each declares a different `type:`.

Emitted message:
> node `<node-id>` feature `<instance-name>`: existing type `<type-in-aggregate>` conflicts with `<type-in-release>`.

**How to fix:** either drop the `type:` from the Release (it will inherit from the Aggregate), or change one side so both declare the same type. The Release is allowed to omit `type:` or repeat the Aggregate's type, but it cannot substitute a different one.

### Cyclic extends on Components or Features

<!-- covers: pkg/validator.ErrCyclicExtension -->

A Component's `extends:` chain or a Feature's `extends:` chain loops back on itself.

Emitted message:
> circular extends detected: `<entity-name>` already in chain. Remove the circular extends reference.

**How to fix:** break the loop in the chain of Component or Feature definitions the message walks through.

### Intentional omission: the topology is not required to be acyclic

Unlike tools that enforce a Directed Acyclic Graph on infrastructure dependencies, Aggrega allows cycles in the topology. Agent-to-agent architectures, callback patterns, and mutual-authentication pairs all produce cyclic edges, and the compiler accepts them. Ordering at deploy time is the renderer's concern (through per-boundary `syncWave` or equivalent), not the IR graph's.

## When checking inject contracts

The compiler walks every `inject:` block — both self-inject (a Component injecting into itself) and uses-inject (cross-Component wiring) — and validates the delivery contract against the target Component's `provides:` schema, the Feature's label partition, and the set of declared delivery keys. The `from:`-key check runs early, right after the catalog resolves and before the topology is built, so a misspelled provides key fails fast against the line you wrote.

### Inject `from` key is not in the target's `provides`

<!-- covers: pkg/resolver.ErrInvalidInjectKey -->

An `inject:` entry references a `from:` key that the target Component's `provides:` schema does not declare. The compiler checks this as soon as the catalog is resolved, before it builds the topology, so the diagnostic points at the exact line you authored rather than at a later wiring stage. The target depends on where the reference lives: a Component-level self-inject `from:` resolves against that same Component's own `provides:`, while a `uses[]` cross-inject reference resolves against the used target Component's `provides:`. A Component that declares no `provides:` rejects every `from:` reference aimed at it.

Emitted message:
> inject from-key `<from-key>` is not declared in component type `<component-type>` provides; declared keys are: `[<key-1> <key-2> ...]`

When the target declares no `provides:` at all, the message names that explicitly:
> inject from-key `<from-key>` is not a provides key of component type `<component-type>`, which declares no provides keys

**How to fix:** either change the `from:` key to match one of the declared keys listed in the message, or extend the target Component's `provides:` schema to declare the key you need.

### Required feature not attached

<!-- covers: pkg/resolver.ErrMissingRequiredFeature -->

The Component declares a presence mandate — a `features.aggrega.ai/requiredType.<label>` annotation — naming a Feature type that is not present among the attachments this component instance ends up with, counting every scope: the Aggregate's component-level and subsystem-level blocks, the Release's boundary-level and component-level blocks, and annotation-driven expansion.

Emitted message:
> component type `<component-type>` requires an attachment of type `<required-type>` for `<label>`, but none is attached; attach a Feature of that type to the component, or at a scope it inherits from

**How to fix:** attach a Feature of the required type to the component in the Aggregate or the Release, or at a broader scope the component inherits from. If the Component should no longer require it, remove the mandate annotation from its catalog declaration.

### Malformed attachment requirement

<!-- covers: internal/compiler/analyzer.ErrMalformedAttachmentRequirement -->

A presence mandate's declaration cannot be evaluated. An annotation value is an opaque string, so nothing validates its shape before the compiler reads it: a value that is not a Feature type URI, or a key that names the mandate family without a label after the prefix, is reported as a broken declaration rather than as an unsatisfied requirement — a typo must never read as a satisfied requirement.

Emitted messages:
> component type `<component-type>` declares a malformed attachment requirement in annotation `<key>`: the value must be a Feature type URI of the form `<publisher>/<name>` in lower-case kebab segments, as in `core/prometheus-exporter`
>
> component type `<component-type>` declares a malformed attachment requirement in annotation `<key>`: the key needs a label naming the requirement, as in `features.aggrega.ai/requiredType.database`

**How to fix:** correct the Component catalog entity. The remediation is in the catalog, not in the Aggregate — which is why this halt is distinct from "Required feature not attached", where the deployment is what needs changing.

### Required attachment slot not bound

<!-- covers: internal/compiler/analyzer.ErrRequiredSlotUnfilled -->

A catalog entity declares an attachment slot with `required: true` in its `featuresSchema`, and nothing binds that slot's name on an instance of the entity. The check runs against the attachments the instance ends up with after every scope has folded — the Aggregate's component-level and subsystem-level `features:` blocks, the Release's boundary-level and component-level blocks, and attachments produced by annotation-driven expansion — so a credential attached once at a scope the instance inherits from binds the slot exactly as a fill authored on the instance does.

Emitted message:
> required attachment slot unfilled (`<component-type>`, `<slot>`)

The two values are the component type that declares the slot and the slot's own name, so one instance leaving two slots unbound reports two messages that differ. The report is positioned at the slot's key under the component's `features:` block; because that key is exactly what is missing, an editor places it on the nearest key that does exist — the `features:` block where the component writes one, and the component itself where it does not.

**How to fix:** attach a Feature under the slot's name — on the component, or at a broader scope every consumer of the slot shares. An attachment under a different name does not bind the slot: a slot is a named binding point, so the name is the binding. If the slot should no longer be required, update the catalog entity's `featuresSchema` to drop the `required` declaration.

### Attachment does not conform to its declared slot shape

<!-- covers: pkg/resolver.ErrAttachmentSlotShape -->

An attachment binds a declared slot but does not match the shape that slot declares. The common case is delivery: a slot's `inject` allowlist names the mechanisms a fill may deliver its material through, and an empty allowlist is blackbox — the Recipe delivers the material internally and a fill may dictate no delivery at all. An attachment under a name no slot declares is a free attachment and carries no slot constraint.

Emitted message:
> Aggregate `<name>` at `.spec.components.<component>.features.<attachment>.<key>`: attachment does not conform to the declared slot shape: this key is not part of the slot's declaration — remove it, or declare it on the slot in the entity's featuresSchema

An attachment declared at a broader scope — subsystem-wide, cascading onto every component beneath it — is held to the same shape, and it is checked against the slot on each component it reaches. The same attachment can therefore be in shape for one component and out of shape for another, so this form names the component and the slot it failed against, and locates the attachment at the scope where it was declared rather than at a key inside its delivery block:

> Aggregate `<name>` at `.spec.subsystems.<scope>.features["<attachment>"]`: this attachment is declared at a scope that reaches component `<component>`, whose attachment slot `<slot>` does not accept the delivery it carries: move the attachment down to the components that may receive it

**How to fix:** the two forms call for different edits, and the field path tells you which one you have. Where it names a key inside an attachment on a component, that key is the fault: remove it, or declare it on the slot in the entity's `featuresSchema` — adding the delivery mechanism to the slot's `inject` allowlist where the material is genuinely meant to reach the workload. Where it names an attachment at a scope, the attachment is well formed and its placement is the fault: move it down onto the components whose slot accepts the delivery, leaving outside its reach the components that reserve delivery to their Recipe.

### Duplicate delivery key across inject sources

<!-- covers: pkg/resolver.ErrInjectKeyCollision, internal/compiler/renderer.ErrSelfInjectKeyCollision -->

The same delivery key (for example, the same env var name) is declared in two developer-authored inject sources — one at the Component level and one under a `uses[]` entry.

Emitted message:
> delivery key `<key>` in mechanism `<mechanism>` is declared in both component self-inject and uses-inject.

**How to fix:** rename one of the conflicting keys, or drop the duplicate declaration. Note that a FeatureRecipe's `injectMapping` overwriting a developer key is intentional Onion-Model interception and is not flagged. A separate render-time variant of this check may surface the same collision class if it escapes the resolution-time guard; the authoring fix is identical.

### Self-inject on a component without an allowlist

<!-- covers: pkg/resolver.ErrSelfInjectForbidden -->

The developer wrote a component-level `inject:` block, but the Component catalog entity does not declare `spec.inject`. Components without a `spec.inject` allowlist are Black-Box types — they receive no developer-authored injection.

Emitted message:
> self-inject on component without spec.inject allowlist (`"inject"`, `"<component-type>"`)

The report is positioned at the `inject:` block itself, which is the element to remove.

**How to fix:** remove the `inject:` block from this Component instance, or switch to a White-Box Component type whose catalog declaration includes `spec.inject`.

### Self-inject mechanism not in the component's allowlist

<!-- covers: pkg/resolver.ErrSelfInjectForbidden -->

The developer wrote a component-level `inject:` block using a mechanism (for example, `env` or a specific file-mount form) that is not listed in the Component's `spec.inject` allowlist.

Emitted message:
> self-inject on component without spec.inject allowlist (`"<component-type>"`, `"<mechanism>"`, `"<allowlisted-mechanism-1>"`, `"<allowlisted-mechanism-2>"`, ...)

The mechanisms the type does allow follow the one that was dictated, so the message carries both what was written and what the type permits. A type declaring no allowlist at all reports the dictated mechanism with nothing after it.

**How to fix:** switch to an allowlisted mechanism, or, if the Component should support the mechanism you need, extend its catalog `spec.inject` allowlist.

### `uses` edge dictates delivery on a socket that allowlists none

<!-- covers: internal/compiler/ir.ErrUsesInjectForbidden -->

An `inject:` block on a `uses:` edge wires into a socket whose `usesSchema` entry declares no `inject:` allowlist, or declares an empty one. Such a socket is a Black-Box connection: the entity that declared it handles the dependency's values internally, so the consumer takes whatever the producer's Recipe emits and does not choose the delivery form. An absent `inject:` key and `inject: []` are the same declaration.

The socket is read on whichever entity declared it: an edge authored on a Feature attachment resolves against the attached Feature's `usesSchema`, and every other edge against the consuming Component's.

Emitted message:
> socket `<socket>` on component type `<component-type>` declares no inject allowlist (Black-Box pattern) — delivery dictation is not allowed.

**How to fix:** remove the `inject:` block from the edge and read the dependency's values from `.context.uses.<alias>.provides.<name>` in the consuming Recipe instead; or, if the connection is meant to be transparent, declare the delivery mechanisms the socket permits in its `usesSchema` entry's `inject:` allowlist.

A socket the declaring entity never declared at all is a different case and is not refused here: an ad-hoc socket carries no allowlist, so there is nothing for the edge to be outside of.

### `uses` edge dictates a delivery mechanism outside the socket's allowlist

<!-- covers: internal/compiler/ir.ErrUsesInjectForbidden -->

An `inject:` block on a `uses:` edge names a delivery mechanism the socket's `inject:` allowlist does not list. The allowlist is the declaring entity's statement of which delivery forms its entrypoint can actually read the dependency's values from, so a mechanism outside it would deliver values nothing consumes.

Every mechanism the block names is checked, and each one outside the allowlist is reported, so one build names them all rather than one per run.

Emitted message:
> mechanism `<mechanism>` not in socket `<socket>` inject allowlist `[<mechanism-1>, <mechanism-2>, ...]` on component type `<component-type>`.

**How to fix:** switch to one of the allowlisted mechanisms, or, if the entity should support the mechanism you need, widen that socket's `inject:` allowlist in its catalog `usesSchema` entry.

## When rendering output

After every contract is validated, the compiler evaluates Go templates on Component values, FeatureRecipe `injectMapping` blocks, and Recipe sources, then hands the result to the renderer.

### `provides:` template references a non-self-contained root

<!-- covers: internal/compiler/renderer.ErrProvidesSelfContainment -->

A Recipe's `provides:` template references a root outside the self-contained set. The `provides` block is evaluated at provides evaluation, before the inject pipe is hydrated and before cross-node edges are walked, so it may reference only data belonging to its own node: `.context.instance_id`, `.values`, `.infra`, the node's resolved `.locals`, and static strings. The check is a positive allowlist, so any other root halts — `.context.inject` and `.context.uses` (cross-node), `.context.annotations.*`, `.context.labels`, `.context.metadata`, and `.metadata.*` (placement- or deployment-coupled data the provides surface does not expose), and `.attachment_name` (a base Recipe's provides pass resolves no attachment). Referencing one of these halts loudly rather than silently rendering an empty value.

`.locals` is on the surface: a node's locals resolve in the preamble of the same stage, ahead of its provides, so a `provides` template reads them and receives resolved values.

Emitted message:
> node `<node-id>` provides[`<key>`]: Recipe `<recipe>` provides references `<expression>` — the provides block is self-contained and may reference only .context.instance_id, .values, .infra, .locals, and static text

**How to fix:** refactor the template to pull only from the Recipe's own pillars. If the value depends on another node's output, that dependency belongs in a caller's `uses[].inject` block, not in the target's `provides`. If the value is computed, put the expression in a `locals:` entry and read it from `provides` — the expression then lives in one place. If you were reaching for the deployment namespace (or other placement data) to build a cross-namespace host, publish the bare host here and qualify it on the consumer side with a routing feature — the producer's `provides` must not depend on where it was deployed.

A FeatureRecipe's `provides:` follows the same locals rule: its own `locals:` resolve before its `provides:`, so a FeatureRecipe `provides` entry reads `.locals` too.

### `locals:` entry references a sibling defined later in the same block

<!-- covers: internal/compiler/renderer.ErrLocalsForwardReference -->

A `locals:` block resolves in the order its entries are written, and an entry reads only a sibling defined **above** it. A direct `.locals.<key>` reference to an entry the block defines later halts: the compiler never sorts or reorders the block to make the reference resolve, because emitted output would then follow an inference rather than what was authored. Without the halt the reference would resolve through the missing-key policy to an empty string, so a derived hostname or secret name would silently lose the segment it was built from.

Emitted message:
> Recipe `<recipe>` locals[`<key>`] references `<expression>`, but the locals block defines `<referenced>` later — entries resolve in author order and an entry reads only a sibling defined above it. Resolved at this point: `<the locals available here>`. To fix: define `<referenced>` above `<key>` in the locals block

**How to fix:** move the referenced entry above its reader. Reordering a `locals:` block is a behavioural change wherever one entry reads another, so the fix is exactly the reorder the message names. A self-reference — an entry naming its own key — cannot be fixed by reordering; compute the value from `.values` and `.infra` directly instead, which the message says in place of the move-it instruction.

### `locals:` key does not exist

<!-- covers: internal/compiler/renderer.ErrLocalsUnknownReference -->

A template reads `.locals.<key>` for a key the `locals:` block does not declare at all — a misspelling, or a key that was renamed or removed. Every surface that reads the pillar raises this halt: a `locals:` entry, a `provides:` template, and a Recipe `source:` template. The locals pillar is an open keyed map, so an unknown key under it passes the root check and would otherwise resolve to an empty string; the halt is what stops that empty value from reaching an emitted artifact.

Emitted message:
> Recipe `<recipe>` provides[`<key>`] references `<expression>`, but the locals block declares no `<referenced>` — it declares `<the keys it does declare>`. To fix: correct the key name

**How to fix:** correct the key name to one the block declares; the message lists them. The halt is distinct from the ordering halt above because the remedies differ — no reordering makes a key that does not exist resolve.

Only **direct** `.locals.<key>` references are checked. A key reached indirectly — through `index .locals`, a `with .locals` block, or a variable bound to `.locals` — is not analysed, because recognising the key would mean reading template text and inferring what a computed key means. An absent key reached that way renders as an empty value rather than halting; the indirect form remains the way to reach a key whose name is itself computed.

### Template references a root the render context does not define

<!-- covers: internal/compiler/renderer.ErrTemplateUnknownRoot -->

A template references a top-level root — the first path segment after the leading dot — that its render context does not define: a misspelling such as `{{ .valeus.port }}`, or a root that does not exist on the surface being authored. The check is a positive allowlist over root *names*, and the admitted set is derived from the render context's own shape rather than kept as a separate list beside it, so the set the build refuses and the set the context actually delivers cannot drift apart. The diagnostic names the offending reference and lists the roots that context does define.

The halt fires identically whether the reference is bare or wrapped in a `default`, `if`, `with`, or `range` fallback, and the wrapped spelling is the one that matters most: a wrapper can supply a fallback for an absent *key* under a defined root, but never for an absent *root*, so without this halt the wrapped form would resolve quietly to an empty value and let the build finish successfully. An absent key under a defined root is untouched and still follows the `missingkey=zero` policy for value templates described in "Missing template key" below, so optional-key idioms such as `{{ .values.optional_field | default "fallback" }}` keep working exactly as before.

**The same halt covers a mistyped key one level down, under a pillar whose shape is declared.** Some pillars have a fixed set of keys the compiler defines: `.context`, `.metadata`, `.inject`, `.workload` and `.boundary` on the Recipe and FeatureRecipe render context, and `.manifest` on a path template. A reference to a key one of those pillars does not define — `{{ .context.nmae }}`, `{{ .metadata.typo }}`, `{{ .workload.containres }}`, `{{ .boundary.nmae }}` — halts exactly as a wrong root does, and the diagnostic lists the keys that pillar defines. Other pillars are **open**, because what they hold is keyed data rather than a set the compiler declares — among them `.values`, `.infra`, `.locals`, `.provides`, `.features` and `.steps` on the render context, and `.parameters` and `.parent_boundary` on a path template. An open pillar accepts any key. An absent key under an open pillar is not this halt — it follows the surface's missing-key policy described in "Missing template key" below, so `{{ .values.optional_field | default "fallback" }}` and every other optional-key idiom keep working unchanged.

Which pillars are declared and which are open is a property of the surface, not something a template can influence: the compiler reads it from the shape of the render context it is about to deliver. That is what lets the typo halt and the optional key render on the same template.

Emitted message when the root itself is not defined:
> template `<template-name>` references `<dotted-path>` — the render context defines `<the roots that context defines>`

And when the root is right but a key under a declared pillar is not:
> template `<template-name>` references `<dotted-path>` — `<pillar>` defines `<the keys that pillar defines>`

**How to fix:** correct the reference to one the diagnostic lists — most reports are a misspelling of `.values`, `.infra`, or `.context`, or of a key under `.context` or `.metadata`. Removing the fallback wrapper will not clear the halt, and adding one never suppressed it; the wrapper only ever hid which reference was wrong. If the data genuinely belongs to another node, it reaches this template through the inject pipe — wire it with a `uses[].inject` entry on the consumer and read it from `.context.inject` — rather than through a root of its own.

The check covers every template surface the renderer evaluates, each against the reference set its own surface defines: Recipe and FeatureRecipe `valuesMapping`, `injectMapping`, `workload`, `artifacts:` bodies, `provides:` and `locals:` entries, `source:`, `pipeline` step `when:` and `with:` bodies, `assertions:`, the component-level self-inject `value:` templates in an Aggregate, and the Release boundary path templates (`directory:` / `subDirectory:`). Two of those surfaces name some refusals with their own diagnostic, because the mistake they describe is more specific than "this reference does not exist": a path template reaching for a *variable* it is not given is covered by "Path-template references a variable outside the allowlist" below, and a boundary-scope FeatureRecipe reaching for a per-component pillar by "FeatureRecipe template references a field outside its scope's allowlist". Everything else those two surfaces refuse — including a mistyped key under a pillar they do admit — reports this halt, so no diagnostic tells you your reference is something it is not.

### An `artifacts:` template reads a pillar the Recipe does not declare

<!-- covers: internal/compiler/renderer.ErrArtifactPillarNotDeclared -->

An `artifacts:` entry's template reads `.workload`, or a key beneath it, in a Recipe that declares no `workload:`; or it reads `.source`, or a key beneath it, in a Recipe that declares no `source:`. Both pillars are always present on the artifacts render context — they are roots the surface defines — so the reference is well-formed and the halt is about the *declaration* being absent rather than the reference being wrong. A Recipe that renders a Deployment from its synthesized workload and a Recipe that renders a chart from a source are different shapes, and an `artifacts:` body written for one of them reaches for a pillar the other never fills.

The check runs before the entry is evaluated, and that ordering is what makes the report useful. An absent pillar arrives at the template as an empty value, so left to evaluation the build would either splice nothing into the emitted file or fail with whatever the template engine says about reading a key off nothing — neither of which names the pillar or the missing declaration. Refusing first lets the halt name the exact expression that reached for the pillar, quoted as you wrote it.

A `source:` that is declared but renders to an empty string reads as no source at all, because what the check reads is the source *after* its own template has been evaluated. That is the same value the provider goes on to render from, so a Recipe whose `source:` resolved to nothing has no source to offer an `artifacts:` body either.

Emitted messages — one per pillar, differing only in the pillar they name:

> artifact `<output-name>` template references `<expression>` but Recipe declares no workload:

> artifact `<output-name>` template references `<expression>` but Recipe declares no source:

**How to fix:** either declare the pillar the template reads, or stop reading it. Declaring it is the fix when the `artifacts:` body belongs with that Recipe shape — add the `workload:` the template's container, port or volume references expect, or the `source:` whose chart or module path it interpolates. Dropping the reference is the fix when the body was written against a different Recipe and reuses a fragment that does not apply here; where the value genuinely comes from elsewhere, publish it through the producing node's `provides:` and read it from the inject pipe instead of reaching for a pillar this Recipe does not fill. Guarding the reference with a fallback wrapper does not clear the halt — the pillar is missing, not the key under it — and neither does moving the reference to another entry in the same Recipe, because every entry in one `artifacts:` block is evaluated against the same pillars.

This halt is distinct from "Template references a root the render context does not define" above, and the two are worth telling apart because the remedies differ. That one fires on a root the surface does not define at all, or on a mistyped key beneath a pillar whose shape is fixed — `{{ .workload.containres }}` on a Recipe that *does* declare a workload. This one fires on a correctly spelled reference to a pillar that is simply not there.

### Cross-node type safety violation via `selector:`

<!-- covers: internal/compiler/analyzer.ErrSelectorViolation -->

One halt covers the two label expressions a catalog author writes to constrain what may be wired or attached, because both fail the same way: a label set that does not satisfy an expression a catalog entity declared.

**A `uses:` edge whose target fails its socket's `selector:`.** A `usesSchema` socket declares a `selector:` field that excludes the target Component attached at the other end of the edge. The selector is the catalog author's way of saying "this socket only accepts targets whose labels match this expression"; an edge that satisfies the socket-name lookup but fails the selector expression is a type-safety violation. The synthesized JSON Schema carries the selector as the `x-aggrega-selector:` extension keyword consumed by the native Go selector engine.

Emitted message:
> selector violation ("<selector-expression>", "<target-id>")

**An attachment whose component fails the Feature's `appliesTo:`.** A Feature declares which components it may attach to, on `appliesTo:` and on `appliesToAnyOf:`. The single expression's requirements hold together and the alternatives hold alternatively, any one of them being enough; both surfaces must hold, and a surface the Feature omits is satisfied by anything. An attachment whose component carries labels the Feature's declaration does not admit is the same class of violation as the edge case above.

Emitted message:
> selector violation ("<feature-type>", "<appliesTo-expression>")

Either expression may also be written in a form the label grammar cannot read at all. That is reported as the same halt carrying a third value, the reason it could not be read — its presence is what tells an expression that could not be evaluated apart from one that was evaluated and came out false:

> selector violation ("<feature-type>", "<appliesTo-expression>", "<why-it-could-not-be-read>")

The halt carries the authoring key it is about — the `uses:` socket entry, or the `features:` entry naming the attachment — alongside the file that declares it, so the position it reports is the entry you edit rather than the head of the document. A Component authored inside a subsystem is positioned at the subsystem it was authored under, level by level.

**How to fix an edge violation:** either route the `uses:` edge to a Component whose labels satisfy the selector, or adjust the selector expression in the catalog entity to accept the intended target class. Review the target Component's `metadata.labels` with `aggrega inspect` to confirm which labels it carries.

**How to fix an attachment violation:** either attach the Feature to a component whose labels its declaration admits, or widen the Feature's `appliesTo:` — adding an alternative under `appliesToAnyOf:` where the Feature genuinely serves more than one component class. Where the component is meant to qualify and does not, the missing piece is usually a label: review it with `aggrega inspect` and add what the expression asks for on the Component's `metadata.labels`.

### Unknown provider

<!-- covers: internal/compiler/renderer.ErrUnknownProvider -->

A Recipe declares `provider: <name>` where `<name>` names no provider the compiler serves. The compiler cannot dispatch rendering to a provider it has never heard of.

Emitted message:
> unknown provider: `<provider-name>`

**How to fix:** confirm the provider name is spelled correctly — `helm`, `helm-chart`, and `compose` are the standard-library names. If you intended a custom enterprise provider, ensure a provider-rendering Plugin serving that name (`pluginType: provider` with the name in its `spec.provider.capabilities`) is present in the catalog workspace the build is pointed at.

### A capability is served by more than one provider plugin

<!-- covers: pkg/catalog.ErrAmbiguousProviderPlugin -->

A build reaches a capability — or a pull resolves one — served by more than one provider-rendering Plugin (`pluginType: provider`, each listing that capability in its `spec.provider.capabilities`), and the workspace has not selected which one renders it. Rather than pick a provider arbitrarily, the build halts and names both candidates. A catalog that carries two plugins for the same capability is legal — two publishers may each ship a plugin for `helm` or `compose`, and the catalog accepts both. The ambiguity surfaces only at the point of use: the halt fires when a build or pull actually reaches the contested capability, not at load time.

Emitted message:
> capability `<capability-name>` is served by more than one provider plugin (`<plugin-1>, <plugin-2>`); add a plugins.providers entry for `<capability-name>` selecting one

**How to fix:** add a `plugins.providers` entry in the workspace config keyed by the capability, whose value selects the plugin identity that renders it. Keep both plugins in the federated catalog; the binding tells this workspace which one to dispatch to for the contested capability.

### Path-template references a variable outside the allowlist

<!-- covers: internal/compiler/renderer.ErrPathTemplateInvalidField -->

A `directory:` or `subDirectory:` template references a variable name that the path-template variable allowlist does not include — for example, a typo such as `{{ .parmaeters.region }}`, or a field that exists in the Recipe rendering context but is not exposed to path templates (such as `.context.inject` or `.values`). The same halt covers `{{ .component_id }}` in a `directory:` template: the variable exists, and `subDirectory:` templates may read it, but a boundary's `directory:` is evaluated once for the whole boundary rather than once per component, so a per-component variable there would make the emitted path depend on which component happened to be evaluated first.

Path templates are validated at parse time, before any rendering work begins, against the variables the path-template context defines less the ones the particular surface refuses. The compiler also evaluates path templates with `missingkey=error` semantics, so an allowlisted-but-undefined-at-eval-time reference produces an explicit error rather than silently rendering an empty string into a directory path.

This halt is about the *variable*. A mistyped key **under** a variable that is allowed — `{{ .manifest.recipe_nmae }}` — reports "Template references a root the render context does not define" above instead, naming the keys `.manifest` does define, because the variable itself was admitted and only the key was wrong.

Emitted message:
> path template references a field not in the documented allowlist: boundary `<boundary-name>` references unknown field `<dotted-path>`; allowlist: see aggrega-docs/language-reference/path-template-variables.md

**How to fix:** correct the field name to one in the path-template allowlist, or remove the reference. The allowlist for `directory:` is `{{ .capability }}`, `{{ .boundary_name }}`, `{{ .parameters.X }}`, `{{ .manifest.recipe_name }}`, and `{{ .parent_boundary.* }}`; `subDirectory:` adds `{{ .component_id }}`. Other surfaces (Recipe `valuesMapping`, FR `injectMapping`, etc.) use a different context shape; references to `.context.*`, `.values`, `.infra`, or `.locals` are deliberately not exposed to path templates because path emission is a structural concern, not a value-rendering concern.

### Path collision: two contributors emit at incompatible paths

<!-- covers: internal/compiler/renderer.ErrPathCollision -->

Two boundary contributors evaluate to the same physical assembly path but disagree on a property that must be uniform across the contributors at that path — for example, two boundaries assembling under the same `directory:` route through different providers, or one boundary declares a per-(path, provider) tuple a second boundary cannot satisfy.

Emitted message:
> OPS_ERROR: dispatch path collision: dispatch path `<path>` produced multiple provider outputs (`<providers>`); contributing boundaries `<boundaries>` resolve to the same path under their current `directory:` / `subDirectory:` settings; set distinct `subDirectory` values per provider or change one boundary's `directory`

**How to fix:** either give each boundary a distinct `directory:` (so they assemble to separate paths), or align the conflicting property across the contributors. The compose-bridge pattern intentionally collapses two sub-boundaries into one assembly path; that pattern requires both boundaries to target the same provider and to carry compatible cascade-resolved annotations.

### Instance-ID collision across boundaries assembling to the same path

<!-- covers: internal/compiler/renderer.ErrInstanceIDCollision -->

Two boundaries that assemble to the same per-(path, provider) tuple contribute components with identical instance IDs. The merged assembly cannot disambiguate the two component fragments — a single Helm chart cannot carry two Deployments named `web-server`, and a single docker-compose file cannot carry two services named `api`.

Emitted message:
> TRANSLATION_ERROR: instance id collision within an assembly group: dispatch path `<path>` provider `<provider>` already contains node `<instance-id>` (contributing boundaries: `<boundaries>`); component instance IDs must be unique within an assembly group

**How to fix:** rename one of the colliding components in the Aggregate, or split the two boundaries onto separate `directory:` paths so each component instance lands in its own assembly.

### Two contributors write the same output path

<!-- covers: internal/compiler/renderer.ErrAssembledOutputCollision -->

Two contributors to one assembly produce a file at the same output path. This is distinct from the instance-ID collision above: the components are named differently and the assembly can tell them apart — it is the *files* they emit that land on one path. It happens most often where a provider writes each contributor's output side by side rather than under a per-component position, so two components whose Recipes emit the same filename (two `artifacts:` entries both named `main.tf`, say) meet at one path. The assembler's own output can collide with a contributor's file the same way.

Whether two contributors emitting one filename collide depends on where their provider places them. A provider that nests each contributor under its own position in the assembly keeps two identically-named files apart; a provider that writes contributors side by side does not. The comparison is on the final path a file would be written to, not on the name the contributor emitted, so the nested case is not reported.

The build halts rather than writing one of the two files and discarding the other. There is no correct silent resolution: renaming or suffixing one file would invent a name nobody authored, and merging their contents would invent a document nobody wrote. Every colliding path is reported, and every contributor writing it is named, so one build tells you the whole picture rather than one collision at a time.

Emitted message:
> assembled output collision: two contributors write the same output path: `<output-path>` is written by `<contributor-1>` and `<contributor-2>`; rename one of the colliding files so each output path is written once

When the contributors declared different formats for their file, each is named with the format it declared — a disagreement there usually means two unrelated files were meant, and one of them is misnamed.

**How to fix:** rename the emitted file in whichever Recipe you control — an `artifacts:` key, or the filename a Workload translation derives — so the two no longer meet. Where the two contributors genuinely belong to separate outputs, give their boundaries distinct `directory:` paths so each assembles on its own.

### The same name is derived more than once inside the output

<!-- covers: internal/compiler/renderer.ErrDerivedKeyCollision -->

One assembly ends up with the same name used twice for something *inside* the files it emits, and the merged output has room for only one of it. It happens two ways: two contributors derive the same name, or a single contributor's own output carries that name twice. This is distinct from the two collisions above: where two contributors are involved, the components are named differently and their files land on different paths, so nothing about the assembly's shape is wrong — it is a name in the content, such as the identifier a target uses to address one resource, or the name under which one output is published for another to reference.

A provider decides those names itself, usually by deriving them from the component instance and the resource, so two components can arrive at one name whenever the parts they are derived from agree — and one component can arrive at one name twice the same way, when two of its own resources are built from parts that agree. Because the name lives in the file's own bytes, the assembly cannot see it: the provider reports the names it derived, and the build compares them. Nothing about a name's meaning is interpreted — two reported names are either the same text or they are not — which is why the same report covers every kind of name every provider derives.

A provider reports separately for each part of a component it renders, so the same name can appear in more than one report for one component. That is one resource named in each report it belongs to, not a name used twice, and it does not halt. What halts is a single report carrying one name twice, because that report describes output where the name is genuinely used twice.

The build halts rather than keeping one and discarding the other. There is no correct silent resolution: keeping the first would drop a resource you declared out of the output entirely and leave the build reporting success, and anything that referenced the dropped one would quietly resolve to the surviving one instead. Every colliding name is reported, grouped by the kind of name it is, with every contributor that derived it named — so one build tells you the whole picture rather than one collision at a time. A contributor whose own output carries the name twice is marked `(more than once)` after its name, which is what tells you the two things to separate are inside that one component rather than between two of them.

Emitted message, where two contributors derived the name:
> TRANSLATION_ERROR: derived name collision: one name is derived more than once in one key space: assembly path `<path>` provider `<provider>`: in key space `<kind-of-name>` the name `<name>` is derived by `<contributor-1>` and `<contributor-2>`; change what is derived so each name is derived once within its space

Emitted message, where one contributor's output carries the name twice:
> TRANSLATION_ERROR: derived name collision: one name is derived more than once in one key space: assembly path `<path>` provider `<provider>`: in key space `<kind-of-name>` the name `<name>` is derived by `<contributor>` (more than once); change what is derived so each name is derived once within its space

**How to fix:** where two contributors are named, rename one of them in the Aggregate, so the names derived from it no longer agree with the other's. Where both names are derived from something you set explicitly — a value the Recipe feeds the provider, or an annotation the provider reads — change that instead on whichever of the two you control. Where the two contributors genuinely belong to separate outputs, give their boundaries distinct `directory:` paths so each assembles on its own and the two names never meet. Where a single contributor is named and marked, the two colliding things are both inside that one component: find the two resources its Recipe produces whose names agree, and change what one of them is named after — the key it is declared under, or a value it is built from — so the provider derives a distinct name for each.

### Chart-name mismatch on a merged helm-chart umbrella

<!-- covers: internal/compiler/renderer.ErrChartNameMismatch -->

Two or more boundaries contribute to the same `helm-chart`-provider assembly path but their effective `aggrega.ai/chart-name` annotations (resolved through the boundary annotation cascade) do not agree. A Helm umbrella chart has exactly one chart name; the renderer cannot pick one of the conflicting candidates.

Emitted message:
> TRANSLATION_ERROR: merged-path assembly has conflicting assembly-name annotation values: boundaries `<boundaries>` merge to assembly path `<path>` under provider `<provider>` but their effective `<annotation>` annotations resolve to different values: `<values>`; the merged assembly has exactly one name; cascade or declare matching values explicitly

**How to fix:** declare a matching `aggrega.ai/chart-name` annotation on every contributing boundary (the cascade mechanism makes this DRY when the contributors share a parent boundary — declare once on the parent), or split the boundaries onto separate `directory:` paths so each gets its own umbrella chart.

### FeatureRecipe template references a field outside its scope's allowlist

<!-- covers: internal/compiler/renderer.ErrFRTemplateInvalidField -->

A FeatureRecipe with `executionScope: boundary` references a per-component-only field such as `.context.instance_id`, `.context.inject`, or `.context.uses` — fields that have no meaningful value at boundary scope. The mirror condition holds: a component-scope FeatureRecipe (the default) referencing `.boundary.*` fields fails the same validator. Validation runs at parse time against the relevant scope's field allowlist before any rendering work begins.

Emitted message:
> CATALOG_ERROR: FeatureRecipe template references a per-component-only field with executionScope: boundary: FeatureRecipe `<name>` with `executionScope: boundary` references per-component-only field `<dotted-path>` in `<label>`; boundary-scope FRs use `.boundary.*` pillars in place of `.context.*` / `.workload` / `.attachment_name` / `.inject` — see the FeatureRecipe entity reference

**How to fix:** rewrite the template against the scope's available fields, or change the FeatureRecipe's `executionScope`. Boundary-scope FRs reference `.boundary.path`, `.boundary.boundary_name`, `.boundary.components`, the `.boundary.*_uses_edges` collections, `.boundary.labels`, `.boundary.annotations`, and `.boundary.feature_attachments`. Component-scope FRs reference `.context.instance_id`, `.context.inject`, `.context.uses`, `.context.labels`, `.context.annotations`. Both scopes share `.values`, `.infra`, `.locals`, `.provides`, `.steps`, and `.metadata`. A Release parameter is not a pillar of its own on this surface — it reaches a FeatureRecipe template through a `values` or `infra` entry that references it.

### Self-inject value template references cross-node data

<!-- covers: internal/compiler/renderer.ErrTemplateUnknownRoot -->

A component-level `inject:` `value:` template pulls from `.context.inject` or `.context.uses`. The inject pipe is what this pass is constructing — a template inside a component's own self-inject value cannot read from it.

The surface's `.context` is what makes this so: it carries `instance_id`, `labels` and `annotations`, and nothing else. `.context.inject` and `.context.uses` are therefore keys this surface's context does not define, and the reference halts as "Template references a root the render context does not define" above, at parse time, before anything renders. The diagnostic names the mechanism and delivery key the template belongs to, and lists the keys `.context` does define here — so the same report covers a genuine reach for cross-node data and a plain misspelling such as `{{ .context.nmae }}`, which is the commoner mistake and would otherwise have rendered as nothing.

Emitted message — the reference-level detail; the surrounding report also names the node, the mechanism and the delivery key:
> template `self-inject.<mechanism>[<key>]` references `.context.inject` — `.context` defines `.context.instance_id`, `.context.labels`, `.context.annotations`

Every frame of the report is in the developer domain, because a component-level `inject:` block is authored in the Aggregate.

**How to fix:** move the cross-component wiring into a `uses[].inject` entry — that is where cross-node context is available. Keep component-level self-inject `value:` templates closed over the component's own `values` and `infra`, its `.context.instance_id` / `.context.labels` / `.context.annotations`, and `.metadata`.

### Missing template key — asymmetric policy

The renderer's missing-key handling depends on the template surface. Where an empty rendering lands somewhere bounded — a manifest field the author can read back — the miss is tolerated and the read renders nothing. Where an empty rendering would instead produce a wrong *structure* or a wrong *verdict*, the surface refuses the reference rather than resolve it to nothing.

- **Path templates** (Release boundary `directory:` / `subDirectory:`) evaluate with `missingkey=error`. A reference to a variable the surface does not give them halts at parse time — see "Path-template references a variable outside the allowlist" above — and so does a mistyped key under `.manifest`, whose keys are declared. An allowed-but-undefined-at-eval-time reference, such as a `.parameters` key the Release does not supply, produces an explicit error rather than silently rendering an empty string into a directory path.
- **`assertions`** (on a Component, Feature, Recipe, or FeatureRecipe) evaluate with `missingkey=error`. A reference to an undefined key halts with a no-such-key diagnostic naming the entity, the instance, and the assertion. The strictness is what makes an assertion trustworthy: a predicate whose reference rendered as an empty value would compare against nothing and pass, so a single typo would silently retire the rule the assertion was written to enforce. Because the bare reference halts before any fallback can run, a plain `default` does not supply an optional-field fallback on this surface — gate the reference with `hasKey`, or read it through `index` and then apply `default`, or use the `optional` helper, which performs the presence check directly.
- **Value templates** (Recipe `valuesMapping` and `source:`, `locals:` and `provides:` entries, `artifacts:` bodies, Workload bodies, FeatureRecipe `injectMapping` and `pipeline.with`, and component-level self-inject `value:` templates) evaluate with `missingkey=zero`, so a reference to an undefined key does not halt the build — the read renders nothing, and nothing is what reaches the artifact. What *does* still halt on this surface is a reference that descends **through** a container the author never supplied — `.values.tls.ca` where no `tls` was authored — because there is nothing to descend into. Only the final key of a reference whose containers are all present renders as nothing. Guarding works as expected: `{{ .values.optional_field | default "fallback" }}` does supply the fallback, because an unset value counts as empty for `default` and falsy for `if`. Authors who need the absent-vs-zero discriminator — telling "key absent" from "key present and empty" — use the `optional` helper documented at [`templates/sprig-functions.md`](../templates/sprig-functions.md), and read a given key one way per template: a key the same template also reads as `.values.<key>` counts as present, so `optional` reports its empty value rather than the fallback.
- **Typed parameter contracts** catch missing-required-parameter and contract-violation cases at the parameter-contract layer with `ErrParameterContractViolation` / `ErrParameterMissing` — see "Parameter type mismatch / contract violation" above.

The **helper set is the same across the surfaces above** — every value template, every path template, and every assertion: Sprig's functions plus Aggrega's `optional`, with `fail` added on the assertion surface because an assertion is the only surface whose purpose is to halt the build rather than produce text. What differs between these surfaces is the missing-key policy, not which functions an author may call — so `optional` is available in a path template too, where it reads a key out of `.parameters` without the strict policy firing first. Parameter interpolation in an Aggregate is a separate, earlier surface: it runs before the catalog resolves and offers Sprig's functions alone, so `optional` is not available there.

Path-template missing-variable emit shape:
> path template references a field not in the documented allowlist: boundary `<boundary-name>` references unknown field `<dotted-path>`; allowlist: see aggrega-docs/language-reference/path-template-variables.md

**How to fix:** for path-template misses, correct the field name to one in the allowlist documented at [`path-template-variables.md`](../path-template-variables.md). For an assertion miss, correct the reference — most reports are a misspelled key — or, where the field is genuinely optional, gate it with `hasKey`, read it through `index` before applying `default`, or use the `optional` helper; wrapping the bare reference in a `default` will not clear the halt, because the reference resolves before the fallback runs. For value-template misses where empty rendering is undesired, use the `optional` helper or supply the missing key as a typed `parameters.*` declaration on the Aggregate with a Release value, as an upstream Component's `provides:` entry wired through `uses[].inject`, or as a `locals:` entry on the same entity.

## The linter domain (not fatal)

The compiler is strictly unopinionated about *execution*. It never halts the build for patterns that are merely suspicious — unused values, orphaned secrets, disconnected targets. Those belong to the linter domain, where enterprises opt in to Wasm plugins that enforce their own conventions.

### Orphaned credentials

A Secret declared without an `inject:` delivery contract is not a compile error. The core compiler preserves the declaration in the IR graph and emits no warning. Enterprise `linter.wasm` plugins may detect and warn on this pattern; enterprise renderers may also choose to mount orphaned secrets implicitly under their own Black-Box conventions. Because both interpretations are valid, the core compiler takes neither side.
