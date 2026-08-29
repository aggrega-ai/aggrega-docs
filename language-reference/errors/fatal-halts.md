# Fatal Halts

A fatal halt is a compile-time error that stops the build before any output is produced. Each halt names the file, the entity, and the field at fault, explains what the compiler could not resolve, and points at the concrete authoring change that fixes it. The compiler never silently repairs or rewrites your input — if something is wrong, the build stops and tells you where.

This catalog is organized by the stage of compilation at which each halt fires. Entries marked **[pending]** describe halts whose implementation is not yet complete; the rule is declared but the error message below is the intended user-facing behavior, not what currently ships.

Each entry below quotes the **message** a build prints for the condition it documents: the fixed sentence stating the condition, then whatever that occurrence supplied. In a terminal that message appears inside a frame — a bracketed head carrying the category and the condition's short code, a pointer to the file and key at fault, and the message on the line beneath — so a whole line pasted from a build will not match an entry here, while the message inside it will; [error-translation.md](error-translation.md) sets out the frame in full.

Arriving from a build with a short code in hand — the letter `E` and four digits, in the diagnostic's bracketed head — start at [Finding a halt from the short code the build printed](#finding-a-halt-from-the-short-code-the-build-printed) at the foot of this page, which lists every condition catalogued here against the short code a build prints for it.

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

An entity file is framed by the envelope check that was reading it and the path it was read from:
> document envelope validation failed: envelope: parse `<path>`: `<the explanation above>`

A schema body is framed by its position within the schema, and by the escape keyword when the cycle sat inside a `$jsonschema:` block. The build reports it under a `CATALOG_ERROR` tag, which also names the file, the entity, and the pillar whose body failed to compile:
> compactform at `<schema-path>`:`<line>` (keyword `"$jsonschema"`): `<the explanation above>`

A provider Plugin's workload schema carries that same compact-form frame; what differs is the `CATALOG_ERROR` tag around it, which names the Plugin and `spec.provider.workloadSchema` in place of the entity and its pillar.

A rendered fragment is framed by the provider that read it:
> cloudformation-provider: parse fragment: `<the explanation above>`

**How to fix:** point the alias at content declared outside the anchor it currently sits inside, or write the repeated content out in full at the point of use. On an Aggregate or a Manifest, the root-level `defs:` block is the natural home for shared anchors — it sits outside every block that references it, so an anchor declared there cannot be reached from within itself. On the other entity kinds, which have no `defs:` block, anchor the shared content somewhere the referring block is not a descendant of. An anchor may be referenced from any number of places and from any depth; the one shape it cannot take is a reference that lands back inside the content the anchor covers.

The same remedy applies wherever the halt was met, and the frame tells you which document to open: the entity file itself, the `$jsonschema:` block inside a schema pillar, the `workloadSchema` body inside a provider Plugin, or the `artifacts:` body whose rendered output the provider read. In that last case the anchor is in the template you authored, not in the rendered text — the rendering reproduced it faithfully.

### Parameter type mismatch / contract violation

<!-- covers: pkg/resolver.ErrParameterContractViolation, pkg/resolver.ErrParameterMissing -->

The Release supplied a value whose type or shape does not match what the Aggregate declared for that parameter. The parameter-contract validator catches type mismatches, enum violations, range violations, pattern violations, `validate:` predicate failures, and missing required parameters before any template interpolation runs.

Emitted message shape:
> parameter contract violated at `<aggregate-path>` slot `<slot-name>`: `<constraint detail>` (got `<received-type>` value `<received-value>`)

For a parameter declared `required: true` with no `default:` and no Release-supplied value, the validator emits the missing-parameter form:
> required parameter not supplied at `<aggregate-path>` slot `<slot-name>`

A parameter declaring a `validate:` predicate adds two further forms. When the supplied value does not satisfy the predicate, the validator emits that parameter's `validateMessage:` if it declares one, and otherwise:
> parameter `<parameter-path>` failed validate predicate

When the predicate itself cannot be evaluated, the failure is reported against the predicate rather than against the value:
> parameter `<parameter-path>` validate predicate error: `<detail>`

A `validate:` predicate reads the value under validation as `.value`, and that is the only name it defines. A predicate naming anything else is refused before it runs, so a mistyped reference is reported as the naming mistake it is instead of resolving to nothing and surfacing as a value that failed validation.

**How to fix:** change the Release value to match the parameter's declared `type` / `enum` / `min` / `max` / `pattern` constraints, supply a missing required parameter, correct a `validate:` predicate that names something other than `.value` or renders something other than `true` or `false`, or widen the Aggregate's declaration to accept the shape you actually need.

### External parameters file cannot be loaded

<!-- covers: pkg/resolver.ErrParametersImportLoad -->

A Release declares `parameters: { $import: <path> }` pointing at an external parameter file that does not exist, cannot be read, or cannot be parsed as YAML.

Emitted message:
> parameters $import: load failed (Release, at `.spec.parameters.$import: <path>`, failed to read file: `<underlying-error>`)
> parameters $import: load failed (Release, at `.spec.parameters.$import: <path>`, failed to unmarshal YAML: `<underlying-error>`)

**How to fix:** verify the `$import:` path is correct relative to the Release file, confirm the file exists and is readable by the build process, and check that its contents parse as valid YAML. If the file is committed to the repository, confirm the Release's build context can see it (for example, a gitignored `.env` file is not available during a CI build).

### Recipe shape rules

A Recipe composes its output from three input kinds — sourced, synthesized, and artifacts — described in [../../architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md). The shape of a valid Recipe is constrained by the composition rules below. They differ in when they are checked — when the Recipe is loaded, when a node renders, or when output is emitted — so read each entry for the point at which its own condition is checked. The rules apply to Recipes that target a non-`eval` provider; the `eval` provider has its own constraint (below).

Each rule is named by what it constrains. There is no numbering, and none is reserved: a name says which part of the Recipe to open, and it keeps saying it however the list below grows or is reordered. Where you need to record a condition durably — in a CI gate, an issue, a runbook — use its **code**, the identifier [sentinels.md](./sentinels.md) lists for the condition and the one that stays fixed as the packages around it evolve.

A Recipe-shape halt is composed the same way. It opens with the sentence that states the rule, then names what this particular Recipe supplied, then the detail specific to it:

> `<the rule's sentence>` (Recipe `<name>:<version>`, rule `<rule-name>`, at `<file-path>`). `<rule-specific detail>`

The leading sentence is fixed per rule — the same text every time that rule halts, whichever stage detected it — so it is the part of the output to match against, and it is the text [sentinels.md](./sentinels.md) lists for the rule's condition. Everything after it varies with the Recipe at fault: the parenthesised values say which document, which rule by name, and where, and the closing sentence is the advice for that occurrence.

The build prints the whole line under a `CATALOG_ERROR` tag, which signals that the failure is attributable to the catalog entity (the Recipe, or the provider it binds to), not to the Aggregate or the Release.

#### `valuesMapping` requires `source`

<!-- covers: pkg/validator.ErrRecipeValuesMappingRequiresSource -->

A Recipe declares `valuesMapping` but not `source`. Without a source to overlay, there is nothing to receive the mapped values. This rule is checked when the Recipe is loaded.

Emitted message:
> Recipe: valuesMapping requires source (Recipe `<name>:<version>`, rule values-mapping, at `<path>`). declare a source: pointer alongside valuesMapping (or remove the valuesMapping if no overlay is intended)

**How to fix:** add a `source:` pointer (a chart, module, or compose-file reference) alongside the `valuesMapping`, or remove the `valuesMapping` and adopt a different input kind (`workload:` for synthesized output, `artifacts:` for direct manifest emission).

#### `workload:` requires a provider that can synthesize

A Recipe declares `workload:` (synthesized mode) for a provider that does not implement Workload synthesis. Synthesized-mode support is a property of the provider — the standard-library catalog declares `workloadSchema` on synthesis-capable providers by convention, but the check keys on provider capability, not on that field's presence.

The check runs at render time, via the central input-kind gate, after the node's provider is bound; the message names the node and the provider.

Emitted message:
> CATALOG_ERROR: node `<node-id>`: provider `<provider-name>` does not support synthesised recipes (this provider supports: `<kinds>`); declare one of the supported input kinds, or target a provider that supports synthesised

**How to fix:** either bind the Recipe to a provider that synthesizes (most commonly `helm` or `compose`), or migrate the Recipe to a different input kind (`artifacts:` for direct manifest emission, or `source:` + `valuesMapping:` if a chart/module exists).

> **Honest-pending — per-provider Workload-content validation.** Today the provider's `workloadSchema` is documentation-only and does not validate the Workload body; bodies are validated against the platform-owned embedded Workload schema. When the Wasm-based Workload synthesizer ships, `workloadSchema` becomes the per-provider contract the synthesizer validates the Workload body against (a distinct, content-level halt). See the roadmap's Wasm-based Workload synthesizers item.

#### At least one input kind must be present

<!-- covers: pkg/validator.ErrRecipeNoInputKind -->

A Recipe declares no input kind: no `source` paired with `valuesMapping`, no `workload:`, no `artifacts:`. Such a Recipe produces no output and has no rendering surface. This rule is checked when the Recipe is loaded.

Emitted message:
> Recipe: at least one input kind required (Recipe `<name>:<version>`, rule input-kinds, at `<path>`). declare one of: source (with valuesMapping), workload, artifacts

**How to fix:** add the input kind that matches the Recipe's authoring intent. Recipes that only define `provides:` (virtual components that supply pointer strings without rendering anything) belong on the `eval` provider — see the eval-provider constraint below.

#### `artifacts:` entry keys must be unique

A Recipe declares two or more entries under `artifacts:` with the same key. The key dictates the emitted filename (whether the entry's body is authored inline or loaded via per-entry `$import:`); duplicate keys would emit a file with the same name to the same boundary directory.

The build refuses the Recipe while decoding the document into its typed form, naming the repeated key and the line it recurs on. That step runs after the envelope schema check and before the shape rules, so a Recipe with a duplicate `artifacts:` key reports valid schema and then this halt, and the remaining shape rules do not report on it.

**How to fix:** rename one of the colliding entry keys so each `artifacts:` entry has a unique filename.

#### Emission-time filename collision across input kinds

<!-- covers: pkg/validator.ErrRecipeFilenameCollisionAcrossInputKinds -->

A Recipe and a FeatureRecipe each declare input kinds that produce files: a `source:` the provider renders, a `workload:` the provider synthesizes, `artifacts:` entries, and a `pipeline:` whose steps may emit. Each of them chooses its output names independently of the others, and nothing declares those names distinct — so two of them can produce a file under a single name, and only one of the two would survive. The build halts and names the output name together with every block that produced it.

The check runs once per emitting document, as soon as that document's own emission is complete and before its output joins any assembly. Three documents emit, and each is checked on its own: a component's own Recipe, the FeatureRecipe an attachment binds on a component, and the FeatureRecipe a boundary-scope attachment binds. Keeping them separate is what makes the diagnostic name the right document — an attachment's files are rendered under its host component's identity, so a collision in the attachment's FeatureRecipe is reported against that FeatureRecipe rather than against the host.

Each colliding name is reported separately, so a document whose blocks met on two names reports both. A finding is positioned at the document you edit to fix it: the component instance for a Recipe, and the FeatureRecipe itself for an attachment, whose finding also names the attachment — a component or a boundary may bind several.

One block emitting several files under one name is not this halt. That is a single contributor rather than two blocks meeting, and duplicate `artifacts:` keys inside one block are refused while the document is decoded.

Emitted message:
> filename collision across input kinds: two input-kind blocks produced a file under one output name (output name `<filename>`, produced by `<origin1>, <origin2>`)

A collision in a FeatureRecipe carries the attachment as well:
> filename collision across input kinds: two input-kind blocks produced a file under one output name (output name `<filename>`, produced by `<origin1>, <origin2>`, attachment `<instance>`)

**How to fix:** rename the colliding file in whichever input kind you control. If the collision involves a Workload-translated filename and an `artifacts:` entry, the Workload-translated names follow the provider's translation conventions (e.g., `<instance-id>-deployment.yaml` for helm) — adjust the `artifacts:` filename to a name the provider does not synthesise.

#### `eval`-provider constraint

<!-- covers: pkg/validator.ErrRecipeEvalProviderConstraint -->

A Recipe targets the `eval` provider but declares one or more input-kind fields (`source`, `workload`, `artifacts`, `valuesMapping`). The `eval` provider executes formatting in-memory and has no rendering surface; declaring input-kind fields on an eval Recipe is meaningless.

Emitted message:
> recipe eval-provider constraint: input-kind fields are forbidden when provider is eval (Recipe `<name>:<version>`, rule eval, at `<path>`). forbidden fields declared: `<field1>, <field2>, ...`

**How to fix:** remove the input-kind fields from the eval Recipe. An eval Recipe legitimately declares only `provides:` (and optionally `locals:`); it produces deterministic pointer strings for downstream consumers without rendering any artifacts.

#### An output-label key uses a reserved namespace

<!-- covers: pkg/validator.ErrRecipeOutputLabelReservedNamespace -->

A Recipe names a label key under `aggrega.ai/` or `app.kubernetes.io/` — in `outputLabels:`, the block that stamps literal labels onto rendered output, or in `outputComponentLabels:`, the block that names component label keys whose values are promoted onto it. Both prefixes belong to the platform's own provenance keyspace: they are the keys the build stamps itself, so a Recipe that stamped one would be writing into the space that says where a resource came from. Reserving them is also what keeps a Recipe's label set disjoint from the provenance set, so the two never have to be reconciled when they are merged. This rule is checked when the Recipe is loaded.

The reservation is on the bare root only. A key that merely carries a reserved root deeper inside a namespace of its own — `component.aggrega.ai/hosting`, say — is a different keyspace the platform does not own, and stays authorable.

Emitted message. One condition covers both blocks, so its sentence cannot say which of the two was authored; the advice after it names the block by quoting the key you typed and the block you typed it in:
> recipe output-labels constraint: key uses a reserved namespace (Recipe `<name>:<version>`, rule output-labels, at `<path>`). key `"<key>"` in outputLabels uses a reserved namespace (`"aggrega.ai/"` and `"app.kubernetes.io/"` are reserved for platform provenance)

A key written in the promoted block reports under that block's rule name and names it in the advice:
> recipe output-labels constraint: key uses a reserved namespace (Recipe `<name>:<version>`, rule output-component-labels, at `<path>`). key `"<key>"` in outputComponentLabels uses a reserved namespace (`"aggrega.ai/"` and `"app.kubernetes.io/"` are reserved for platform provenance)

The literal block's keys are checked in sorted order and the promoted block's in the order you wrote them, so a Recipe breaking the rule in several places always reports the same one first.

**How to fix:** move the key into a namespace you own — your own domain, or a sub-prefixed one such as `component.aggrega.ai/…` — or drop it if the value you wanted is one the build already stamps. The provenance keys a rendered resource carries are listed in [../providers/well-known-annotations.md](../providers/well-known-annotations.md); reading one back needs no Recipe declaration.

#### A promoted component label is also declared literally

<!-- covers: pkg/validator.ErrRecipeOutputComponentLabelCollision -->

A Recipe names one key in both `outputComponentLabels:` and `outputLabels:`. The two blocks stamp onto the same label surface from different sources — the first promotes the value the component carries, the second writes the value the Recipe author typed — so a key named in both would arrive with two candidate values and nothing to say which wins. This rule is checked when the Recipe is loaded, after the reserved-namespace rule above, so a Recipe breaking both reports the reserved namespace first: that fault's fix does not depend on what the other block contains.

Emitted message:
> recipe output-component-labels constraint: key is also declared in outputLabels (Recipe `<name>:<version>`, rule output-component-labels, at `<path>`). key `"<key>"` is promoted through outputComponentLabels and also declared literally in outputLabels; keep whichever source the label should come from and drop the other

**How to fix:** decide where the label's value comes from and delete the other declaration. Keep the `outputComponentLabels:` entry when the value should track whatever the component carries, so two components bound to one Recipe stamp their own values; keep the `outputLabels:` entry when the value is the Recipe's own and is the same wherever the Recipe is bound.

### FeatureRecipe shape rules

A FeatureRecipe composes its output from the same input kinds a Recipe does, and two of the same composition rules constrain it. Both are checked when the FeatureRecipe is loaded, and both report in the shape a Recipe-shape halt takes — the rule's sentence, then the document at fault, the rule's name, and the advice for that occurrence — under a `CATALOG_ERROR` tag.

There is deliberately **no** at-least-one-input-kind rule here, and that is the difference from a Recipe. A FeatureRecipe that declares only a provider and what it implements is a legitimate pure-wiring attachment: it renders nothing, and its effect is the connection the Feature it implements carries. One that only declares `injectMapping:` is legitimate the same way.

#### A FeatureRecipe's `valuesMapping` requires `source`

<!-- covers: pkg/validator.ErrFeatureRecipeValuesMappingRequiresSource -->

A FeatureRecipe declares `valuesMapping` but not `source`. A values mapping is an overlay, so without a chart, module, or file to overlay onto there is nothing for the mapped values to reach.

Emitted message:
> FeatureRecipe: valuesMapping requires source (FeatureRecipe `<name>:<version>`, rule values-mapping, at `<path>`). declare a source: pointer alongside valuesMapping (or remove the valuesMapping if no overlay is intended)

**How to fix:** add the `source:` pointer the overlay was written for, or remove the `valuesMapping` and let the attachment do its work another way — `artifacts:` to emit files of its own, `injectMapping:` to reshape what it delivers, or neither, for a pure-wiring attachment.

#### A FeatureRecipe on the `eval` provider declares a render input kind

<!-- covers: pkg/validator.ErrFeatureRecipeEvalProviderConstraint -->

A FeatureRecipe binds the `eval` provider and also declares one or more of `source`, `valuesMapping`, `workload`, or `artifacts`. The `eval` provider evaluates in memory and has no rendering surface, so a render input kind declared beside it names output that nothing will produce.

`injectMapping:` is **not** one of the forbidden fields and stays available here. It transforms what an attachment delivers rather than rendering anything, which is exactly the work an eval FeatureRecipe exists to do.

Emitted message, listing every forbidden field the document declared rather than the first one found:
> featurerecipe eval-provider constraint: render input-kind fields are forbidden when provider is eval (FeatureRecipe `<name>:<version>`, rule eval, at `<path>`). forbidden fields declared: `<field1>, <field2>, ...`

**How to fix:** remove the render input kinds from the eval FeatureRecipe, or bind it to a provider that renders. An eval FeatureRecipe legitimately declares `provides:`, `locals:` and `injectMapping:` and nothing that emits.

### Instance name fails the naming pattern

<!-- covers: pkg/resolver.ErrInvalidInstanceName -->

An authored instance name — a key under `components`, `subsystems`, `features`, `secrets`, a sub-aggregate alias, or a `uses:` alias — contains characters outside the allowed pattern `^[a-zA-Z0-9_-]+$`. Dots, spaces, slashes, and other punctuation are not permitted in user-authored instance names; the dot in particular is reserved as the compiler's internal path separator for nested-aggregate flattening.

Emitted message:
> invalid instance name: names must match `^[a-zA-Z0-9_-]+$` (letters, digits, hyphen, underscore; no dots) (Aggregate `<name>`, at `<field-path>`, instance name `<instance-name>` is invalid: must match `^[a-zA-Z0-9_-]+$`)

**How to fix:** rename the offending instance to use only alphanumerics, hyphens, and underscores. If the name came from an auto-generated source, adjust the generator; if you intended to express a nested-aggregate path, use the sub-aggregate import mechanism rather than embedding a dot in the name.

### A file cannot be read, or its text is not well-formed YAML

<!-- covers: pkg/resolver.ErrYAMLLoad -->

One of the documents a build starts from — the Aggregate, the Release, or the Manifest — could not be turned into a document at all. Either the file could not be read from disk, or its bytes did not parse as YAML. Nothing downstream runs, because there is no document to check against a schema, no components to place, and no parameters to interpolate.

The halt is raised at every point one of the three is read, and the diagnostic names which document was being read and the path it was read from. The path is what tells a missing file from a malformed one: a read failure quotes the operating system's own reason, and a parse failure quotes the YAML parser's, which carries the line the parser gave up on.

Emitted message, where the file could not be read:
> YAML load failed: check the file exists, is readable, and contains well-formed YAML (Aggregate, at `<path>`, failed to read file: `<underlying reason>`)

and where its text did not parse:
> YAML load failed: check the file exists, is readable, and contains well-formed YAML (Aggregate, at `<path>`, failed to unmarshal YAML: `<underlying reason>`)

`Release` and `Manifest` appear in place of `Aggregate` when one of those is the document being read. The same condition also covers the two documents a parameter contract is read from — an Aggregate's declared `parameters:` and the file a Release's `parameters: { $import: … }` points at, when that file's own bytes fail to parse rather than its load failing outright.

**How to fix:** read the path in the message rather than the document's name — the two differ whenever a reference resolved somewhere unexpected. For a read failure, confirm the file exists at that path, that the path is spelled as the referring document writes it, and that the build has permission to read it; a file present locally and absent from a build agent's checkout is the common case. For a parse failure, open the file at the line the parser named — an unquoted value containing a colon, a tab used for indentation, and a list item indented under the wrong key are the three that account for most of them.

### A `{{ .parameters.* }}` reference cannot be interpolated

<!-- covers: pkg/resolver.ErrInvalidParameterRef -->

The Aggregate's text is evaluated as a template before it is read as a document, so that a `{{ .parameters.<key> }}` reference is replaced by the value the Release supplied for it. This halt fires when that evaluation cannot be completed: the text does not parse as a template, or it parses and fails while running.

Interpolation happens **before** the Aggregate is parsed as YAML, which is why a fault here is reported against the Aggregate as a whole rather than at a key inside it — at that point the document has no keys yet. It is also why the reference may be left unquoted: the substitution happens in the raw bytes, and YAML's own quoting rule then decides the value's type, so a bare reference yields the value's natural type and a quoted one yields a string.

A reference naming a key the Release did not supply is **not** this halt. An absent key resolves to an empty value here and is caught, with its type and its contract, by the parameter checks described under "Parameter type mismatch / contract violation" above. What this halt reports is text the template engine could not process at all — an unclosed `{{`, a mis-spelled function name, a pipeline whose stages do not fit together.

Emitted messages, for a template that does not parse and for one that fails while running:
> invalid parameter reference: check the {{ .parameters.* }} expression names a declared parameter and parses as a Go template (Aggregate, template parse error: `<underlying reason>`)
> invalid parameter reference: check the {{ .parameters.* }} expression names a declared parameter and parses as a Go template (Aggregate, template execution error: `<underlying reason>`)

**How to fix:** open the Aggregate and read the underlying reason, which names the position in the text and the construct that failed. Confirm every `{{` has its `}}`, that a function you called is one the surface offers — parameter interpolation offers Sprig's functions and nothing else, so the `optional` helper is **not** available here — and that a pipeline's stages accept what the stage before them produces.

### The Release directory declares one Aggregate or Manifest twice

<!-- covers: pkg/resolver.ErrDuplicateTriadIdentity -->

A Release resolves its `aggregate:` and `manifest:` references by scanning its own directory first, and that scan found two Aggregates — or two Manifests — carrying the same `metadata.name`. A bare-identity reference names an entity by that name, so two files claiming one name leave the reference with two answers and no rule for choosing between them.

This is the same-directory counterpart of the catalog's duplicate-identity refusal, and the two are reported separately so the message names the directory you are standing in rather than a catalog tier you may not have been thinking about.

Emitted message:
> duplicate Aggregate/Manifest identity (metadata.name) in the Release directory: Aggregate `"<name>"` declared more than once in `<release-directory>`

with `Manifest` in place of `Aggregate` where two Manifests collide.

**How to fix:** give one of the two entities a different `metadata.name`, or move it out of the Release's directory. Two Releases that genuinely deploy different Aggregates of the same name belong in directories of their own; copying a Release into a sibling file without renaming what it carries is the usual way this arises.

### A Release's `aggregate:` or `manifest:` reference resolves to nothing

<!-- covers: pkg/resolver.ErrTriadRefUnresolvable -->

A Release names an Aggregate or a Manifest by bare identity and no entity of that name was found on any of the surfaces a bare identity is looked up on: the Release's own directory, the catalog, and the registry.

Emitted message, where nothing matched anywhere:
> aggregate/manifest reference unresolvable: no Aggregate named `"<reference>"` in the Release directory, catalog, or registry

A file in the Release's directory that could not be indexed changes the report, because it changes what can honestly be claimed. Such a file might have been the entity, so the message says so rather than asserting an absence it cannot establish, and carries the parse failure that stopped it being read:
> aggregate/manifest reference unresolvable: Aggregate `"<reference>"` not found; unparseable file `<path>` could not be indexed and may be it: `<parse failure>`

and where an unparseable file is the one the reference names outright:
> aggregate/manifest reference unresolvable: needed Aggregate `"<reference>"` is the unparseable file `<path>`: `<parse failure>`

**How to fix:** where the reference is genuinely absent, correct its spelling — the identity is the entity's `metadata.name`, not its filename — or add the entity to the Release's directory or the catalog the build reads. Where the message names an unparseable file, fix that file first: its parse failure is quoted in the message, and repairing it often resolves the reference in the same edit. A `./` or `../` reference is a path rather than an identity and is resolved as one, so a leading dot changes which of the two mistakes you are looking for.

### A component is placed in more than one boundary

<!-- covers: pkg/resolver.ErrDuplicateBoundaryComponent -->

A Release's boundary tree places one component in two different boundaries. The two placements are neither merged nor ranked, and they cannot be: a component's boundary decides where its output is written, which sub-directory it lands in, which sync wave it joins, and which boundary annotations and boundary infra it inherits — while its per-edge `uses:` surface is read by a separate walk. A component named twice would take its output location from one placement and its per-edge configuration from the other.

**A boundary places components two ways, and both count.** Naming a component directly under `components:` places it; routing a whole sub-module into a boundary under `aggregates:` places every component that module contains. So this halt also covers one sub-module routed into two boundaries, a module routed into one boundary with a module nested inside it routed into another, and a component named at one boundary while the module containing it is routed into a different one.

Routing a module into a boundary and also naming one of its components under that **same** boundary is not a conflict — both placements agree on where the component belongs — and builds.

The conflicting placements are recorded in the order they were written, so the earlier site a message names is always the earlier one in your document rather than whichever was reached first.

Emitted messages. The sentence states the rule and what follows names both sites and how each of them placed the component. Where two direct declarations meet:
> component declared in more than one boundary: declare each component in exactly one boundary (Release `<name>`, at `<field-path>`, component `"<component>"` is declared in boundary `"<boundary-a>"` and again in boundary `"<boundary-b>"` (source `<path>`); a component belongs to exactly one boundary — remove whichever declaration is not intended)

Where a direct declaration meets a routed module, the message says which is which, because the remedies differ:
> component declared in more than one boundary: declare each component in exactly one boundary (Release `<name>`, at `<field-path>`, component `"<component>"` is declared in boundary `"<boundary-a>"` while the sub-module `"<module>"` that contains it is routed into boundary `"<boundary-b>"` (source `<path>`); a component belongs to exactly one boundary — either route the sub-module into `"<boundary-a>"` or drop the component declaration)

and where two routed modules claim the same components:
> component declared in more than one boundary: declare each component in exactly one boundary (Release `<name>`, at `<field-path>`, sub-module `"<module-a>"` is routed into boundary `"<boundary-a>"` and sub-module `"<module-b>"` into boundary `"<boundary-b>"` (source `<path>`); routing one sub-module into a boundary places every component it contains there, so these two placements claim the same components — remove whichever routing is not intended)

**How to fix:** delete whichever of the two placements you did not mean. The message names both, so the choice is yours rather than the compiler's. Where a direct declaration and a routed module disagree, decide whether the component belongs with its module or on its own: routing the module places it alongside everything else the module contains, and naming it directly separates it from them.

### A Manifest annotation binding claims the reserved `aggrega.ai/` prefix

<!-- covers: pkg/resolver.ErrManifestReservedPrefix -->

A Manifest declares an annotation binding under a key beginning with the bare `aggrega.ai/` prefix. That prefix is where the build stamps the keys it emits itself, so a binding claiming a key inside it would put your routing and the platform's own output in one keyspace, competing for the same names.

**It halts, and it could not be an advisory.** The reservation is the whole of what makes that keyspace the platform's; admitting the binding and mentioning it afterwards would leave the collision in the build.

The rule is about the keyspace an authored binding claims, so a key the presented Manifest does not declare a binding for is passed over rather than reported — there is no binding to be in violation.

Emitted message. The offending key leads, because it is what the sentence is about, and the values after it are each introduced by what they are:
> manifest annotation binding uses reserved prefix (Manifest, at `<field-path>`, `"<key>"`, reserved prefix `"aggrega.ai/"`, routing to Feature `"<feature-uri>"`, author the binding under a domain of your own such as `"feature.<your-domain>/"`)

**How to fix:** rename the binding key into a namespace you control. A sub-prefixed key is the supported shape and is not reserved: `feature.aggrega.ai/…` for a standard-library shortcut, or your own domain — `acme.aggrega.ai/…`, `compliance.example.com/…` — for an enterprise one. Renaming the key changes what an author writes on a component to trigger the binding, so update the annotations that use it in the same edit. The platform's own keys under the bare prefix are listed in [../providers/well-known-annotations.md](../providers/well-known-annotations.md).

### Two Manifest annotation bindings compete for one routing slot

<!-- covers: pkg/resolver.ErrManifestCrossBindingPillarCollision -->

Two annotation bindings in one Manifest route to the same Feature, through the same pillar, at the same path. A binding's job is to say where an annotation's value lands, and two bindings naming one destination leave the value with two routes and nothing to choose between them at expansion time.

Only one binding may declare a given path-and-pillar pair per target Feature. Two bindings targeting the same Feature at *different* paths are ordinary authoring and build; so are two bindings routing the same path to two *different* Features.

The bindings are walked in the order the Manifest declares them, so the binding a message names first is always the earlier one in your document.

Emitted message:
> manifest annotation bindings collide on same Feature path+pillar (Manifest, at `<path>`, annotation bindings `"<first-key>"` and `"<second-key>"` both target Feature `"<feature-uri>"` with path `"<path>"` routing to pillar `"<pillar>"`; only one binding may declare a given (path, pillar) pair per Feature)

**How to fix:** decide which binding owns the destination and remove the path from the other's `maps.infra` or `maps.values` list, or drop the second binding entirely. Where the two bindings exist because you wanted two annotation keys to reach one Feature field, keep one binding and let both annotation keys route through it; where they exist because two different values were meant to land in two places, correct whichever path was written by mistake.

### A Release reached resolution without passing through the load path

<!-- covers: pkg/resolver.ErrUnnormalizedRelease -->

A Release arrived at resolution carrying both a non-empty top-level `components:` surface and a synthesized `default` boundary. That combination cannot be produced by a Release that was loaded normally: the load path folds a top-level `components:` block into the default boundary and clears it, and a document that authored both outright is refused by its schema before it gets this far.

So this halt does not report anything you wrote. It reports that something reached resolution around the load path — a Release constructed in memory by an embedding program rather than read from a file, most often — and it stops there rather than letting a build proceed on a document whose two component surfaces disagree. Reading them in either order would produce output that silently omits or duplicates components, and the boundary walk and the per-edge walk would not even agree with each other about which.

Emitted message:
> release reached resolve un-normalized (non-empty root components alongside a synthesized default boundary): construct releases through the normalization core (types.NormalizeRelease via the load path), not a hand-built literal

**How to fix:** nothing, if you are authoring YAML — reaching this halt from `aggrega build`, `aggrega validate` or the editor means the compiler has a defect worth reporting, and the Release you were building is not at fault. If you are embedding the compiler and building a Release value in your own code, construct it through the load path rather than assembling the struct directly, so the normalization that folds the root components into the default boundary runs.

### A library reference expands into itself

<!-- covers: pkg/refcycle.ErrCycle -->

A cross-document reference chain comes back to a document it has already reached, so expanding it would never finish. Two authoring surfaces reach the same condition, and both are chains between library entities rather than anything inside one file: a `$ref:` from a schema pillar into a SchemaLibrary entry that references its way back, and an `$import:` into a MappingLibrary or a WorkloadLibrary entry that does the same.

The chain is compared on a **canonical** key — the library's identity and the entry's name, with any registry host and version spelling removed — so a cycle cannot escape the check by naming the same entry two different ways along its path. A reference that expands and terminates is fine however many times it appears and however deep the chain runs; depth on its own never causes this halt, and reusing one library entry from many places is the pattern libraries exist for.

Emitted message, for a `$import:` chain, which names the whole loop in the order it was walked so you can see which step closes it:
> circular reference expansion: `<Library>#/mappings/<entry>` -> `<Library>#/mappings/<entry>` -> `<Library>#/mappings/<entry>`

A `$ref:` chain is reported by the compact-form compiler instead, which frames it with the document and keyword it was reading:
> compactform at `<consumer-file>` (keyword `"$ref"`): circular cross-document $ref expansion: `<Library>#/schemas/<entry>` -> `<Library>#/schemas/<entry>` -> `<Library>#/schemas/<entry>`

**How to fix:** read the chain in the message and break it at whichever step was not intended. A cycle usually means two library entries were each written to extend the other; collapse the shared part into a third entry both reference, or inline it into one of them. The last step shown is the one that closed the loop, but it is not necessarily the wrong one — the whole chain is printed precisely because which link to cut is your decision.

The same condition also backs the anchor-recursion refusal documented under "YAML anchor aliased inside its own content" above. That one is a loop **inside** a single document's own text; this one is a loop **between** documents. The chain in the message tells the two apart at a glance: a loop between documents names library entries, and a loop inside one names an anchor.

### A declared schema cannot be resolved

<!-- covers: pkg/validator/jsonschema.ErrSchemaResolve -->

A schema reached the point of being used to validate something and could not be assembled into a schema at all. The commonest cause is a `$ref:` that names nothing resolvable; a schema that does not satisfy the JSON Schema meta-schema reaches the same halt, as does a `then:` or `else:` branch under a conditional keyword that cannot be resolved on its own.

The refusal comes **before** anything is validated against the schema, and that ordering is the point. Passing over an unreadable schema would leave everything it covers unvalidated while the build reported success — a check that has stopped running with nothing to say that it stopped.

Emitted message, naming the position inside the schema, the keyword that could not be resolved, and what the resolution reported:
> validator/jsonschema: schema resolution failed (at `<path-inside-the-schema>`, keyword `"<keyword>"`, `<what resolution reported>`)

Where the failure is at the schema's root rather than at a keyword inside it, the position and keyword are omitted and the sentence carries the reported reason alone.

**How to fix:** open the schema at the position the message names. A `$ref:` is the usual culprit: confirm the target exists, that an in-document reference spells its `#/$defs/…` path exactly, and that a cross-document reference names a SchemaLibrary entry the build's dependency closure actually holds. Where the message names a `then:` or `else:` branch, that branch is a schema in its own right and has to be resolvable on its own terms.

### An `x-aggrega-when:` or `x-aggrega-validate:` predicate cannot be evaluated

<!-- covers: pkg/validator/jsonschema.ErrExtensionEval -->

A schema declares one of the two template-valued extension keywords and the template could not be used: it is not a string, it does not parse as a template, it failed while running, or it rendered something other than `true` or `false`.

`x-aggrega-when:` decides whether a conditional branch of a schema applies; `x-aggrega-validate:` decides whether a value satisfies a rule the schema's own keywords cannot express. Both are read as verdicts, which is why a result that is not one is refused rather than interpreted: a predicate rendering an empty string would be read as false and would silently retire the rule it was written to enforce.

Emitted message:
> validator/jsonschema: x-aggrega extension evaluation failed (at `<path-inside-the-schema>`, keyword `"x-aggrega-validate"`, `<what evaluation reported>`)

with `"x-aggrega-when"` in place of the keyword where the conditional's predicate is the one at fault, and the reported reason naming the template fault — a parse position, a missing function, or the non-boolean the template produced.

**How to fix:** open the schema at the position the message names and read the reported reason. Confirm the keyword's value is a string, that the template parses, and that every path it walks is one the value under validation actually has — a predicate reads the value as `.value`, and reaching for anything else is the commonest mistake. Make sure the template ends by producing `true` or `false`: a comparison does, while a template that merely renders the value does not.

### A Workload does not satisfy the Workload schema

<!-- covers: pkg/validator.ErrWorkloadValidation -->

A Recipe's or FeatureRecipe's `workload:` block was read and checked against the Workload schema, and one or more fields do not satisfy it — a misspelled key, a value of the wrong type, a required field left out, a value outside a declared range or enumeration.

The report is **grouped**: one halt carries every field at fault, so a Workload with four mistakes tells you about all four in one build rather than one per build. The header names the Workload, the Recipe that declares it, and the file; each finding beneath it names the field path inside the Workload, what the schema required there, and the fix where one can be stated.

Emitted message:
> workload validation failed (Workload in Recipe `<name>:<version>`, at `<path>`, schema stage):
>   `.containers.<name>.<field>`: `<what the schema required>` — `<the fix, where one can be stated>`
>   `.initContainers[<i>].<field>`: `<what the schema required>` — `<the fix, where one can be stated>`

A failure with no per-field detail — the block could not be read at all, rather than read and found wanting — carries the whole reason as its single finding instead.

The build reports the halt under a `CATALOG_ERROR` tag, because a `workload:` block is written by the Recipe's author rather than by the Aggregate or the Release.

**How to fix:** open the Recipe at the field paths listed and correct each one. The paths are given from the Workload's own root, so `.containers.main.health.ready` is the `ready` block under the `main` container's `health` key. A named container is addressed by its key and an init container by its position, which is why the two read differently. What each field accepts is in the Workload authoring reference.

### A Workload attachment names a slot the entity does not declare, or a delivery the slot forbids

<!-- covers: pkg/validator.ErrWorkloadFeaturesSchema -->

A container's `attachments:` entry inside a `workload:` block refers to an attachment slot, and the reference does not line up with the slots the Component or Feature declares in its `featuresSchema`. Three shapes reach this halt, and the finding says which one you have.

- **The slot is not declared.** The entry's `from:` names a slot the entity's `featuresSchema` does not carry — a misspelling, or a slot that was renamed on one side only.
- **The slot is blackbox.** The slot declares an empty `inject:` allowlist, which reserves delivery to the Recipe's own plumbing. Such a slot is filled and consumed internally, so a Workload cannot reach for it.
- **The delivery is outside the slot's allowlist.** The entry's `as:` names a mechanism the slot's `inject:` list does not permit.

Every offending entry across every container is reported together, so one build names them all. Findings are grouped under one header naming the Workload, its Recipe, and the file.

Emitted message:
> workload featuresSchema cross-check failed (Workload in Recipe `<name>:<version>`, at `<path>`, featuresSchema stage):
>   `.containers.<name>.attachments.<KEY>.from`: references slot `"<slot>"` which is not declared in the Component's featuresSchema — either declare the slot in the Component (or Feature) featuresSchema, or rename the reference to an existing slot
>   `.containers.<name>.attachments.<KEY>.from`: slot `"<slot>"` is blackbox (no `inject:` allowlist) and cannot be referenced from a Workload attachments entry — blackbox slots are delivered by Recipe-internal plumbing; remove the Workload-side reference, or widen the slot's inject allowlist if Workload-side delivery is intended
>   `.containers.<name>.attachments.<KEY>.as`: delivery mechanism `"<as>"` is not permitted by slot `"<slot>"` (inject allowlist: `[<mechanisms>]`) — use one of the allowlisted delivery mechanisms (`[<mechanisms>]`), or widen the slot's inject allowlist in the Component/Feature featuresSchema

**How to fix:** each finding names both sides, so the choice is which side to change. For an undeclared slot, correct the `from:` spelling or declare the slot in the entity's `featuresSchema` — the field path's `.from` suffix points at the reference. For a blackbox slot, remove the Workload-side reference and let the Recipe deliver the material, unless Workload-side delivery is genuinely wanted, in which case give the slot an `inject:` allowlist. For a refused mechanism, switch `as:` to one the allowlist names, or add yours to it.

### A Workload references a slot whose fill publishes no locator

<!-- covers: pkg/validator.ErrSlotNotReferenceable -->

A container's `attachments:` entry names a slot by reference, and the attachment filling that slot does not publish the `provides` keys such a reference reads. Referring to a slot by name means asking for the resource it stands for to be addressed in the rendered output — by the name of the resource, and by the field inside it. A fill that publishes neither has no locator to point at, so the reference cannot be turned into anything.

**Which keys are required depends on the entry**, and the finding says which it wanted. An entry that names its own `key:` supplies the field itself, so only the resource's `name` must be published — which is what lets it reference a multi-key resource. An entry that names no `key:` reads the slot's single published field, so both `name` and `key` must be there.

The check reads only whether the keys are present; it never inspects their values. Every offending entry is reported together, under one header.

Emitted message:
> workload attachment slot is not referenceable (Workload in Recipe `<name>:<version>`, at `<path>`, slotReferenceability stage):
>   `.containers.<name>.attachments.<KEY>.from`: slot `"<slot>"` is not referenceable: its resolved provides does not expose `"<key>"` (a workload attachment reference reads the provides keys name and key) — reference a slot filled by an attachment whose schema.provides declares the keys this reference reads, or deliver it through the slot's inject pipe rather than a workload reference

**How to fix:** two directions, and which is right depends on what you meant. Where the reference is correct, the attachment filling the slot is the thing to change: attach a Feature whose `schema.provides` declares `name` — and `key`, where the entry names none of its own — so there is a locator to point at. Where the material was never meant to be addressed by name in the output, drop the reference and deliver it through the slot's `inject:` pipe instead, which carries the value rather than a pointer to where it lives.

## When resolving the catalog

After loading, the compiler walks the Manifest's two tiers (type map, then name map) to pick the Recipe for every Component, and it walks any `extends` chains on Manifests, Components, or Features.

### Cyclic extends chain

<!-- covers: pkg/validator.ErrCyclicExtension -->

A chain of `extends` pointers loops back on itself.

Emitted message. The sentence naming the condition opens it, and what follows names the entity, the authored key, and the pointer that closed the loop:
> cyclic extends chain (`<kind>` `<name>`, at `.spec.extends`, circular extends detected: `<entity-name>` already in chain). Remove the circular extends reference

A loop among Manifests opens with that same sentence and names the offending pair after it:
> cyclic extends chain: Manifest `<name>` extends `<reference>`, which is already in the chain; remove the circular reference

The opening sentence is the same either way, which is what makes it the part of the output to match on: it is the text [sentinels.md](./sentinels.md) lists for this condition, and it does not change with where the loop was found.

**How to fix:** inspect the `extends:` fields along the chain reported in the message and break the cycle by removing one of the pointers or by collapsing the duplicated content into a single base entity.

### Recipe `implements` does not match the mapped component type

<!-- covers: pkg/catalog.ErrManifestImplementsMismatch -->

The Manifest's mapping entry points at a Recipe whose `spec.implements:` declaration does not match the component-type key for that mapping entry. `spec.implements` is a consistency anchor rather than a dispatch mechanism: the mapping value names the Recipe directly, and this check confirms the Recipe the author named is one that declares the type they mapped.

The check reads the composed Manifest before any Recipe is resolved, so it reports the mapping entry the author wrote rather than a downstream symptom of it.

Emitted message:
> manifest mapping entry's recipe spec.implements does not match the mapped component-type / feature-type key (manifest mapping `"<component-type>"` -> `"<recipe-uri>"`, recipe spec.implements is `"<recipe-implements>"`, expected `"<component-type>"`, or a type `"<component-type>"` extends)

**Every command that reads a Release's dependencies performs this check; what differs is what each one does with the result.** `aggrega build` and `aggrega pull` halt, because both produce something you would go on to use — rendered artifacts and a lockfile. `aggrega validate` and `aggrega lint` report the finding alongside every other diagnostic they found and then exit non-zero: their job is to tell you everything that is wrong with the workspace, so a single fault does not cut the report short. In the editor the finding is published as a diagnostic beside the others, and whatever else that document had to report is unaffected. Note where it appears: the editor attaches a Release's dependency-level diagnostics to the Aggregate, so the finding surfaces while the Aggregate is open rather than while you are editing the Manifest the mapping is written in. Running `aggrega validate` reports it whichever document you have open.

A mapping entry naming a Recipe the catalog does not hold is not this condition: the check has nothing to compare against and skips the entry, and the unresolvable Recipe is reported when recipes are resolved.

FeatureRecipe entries follow the same shape; the `features.type` mapping check emits `manifest feature mapping ... featurerecipe spec.implements is ... (expected ...)`, and the feature arm matches on the mapping key itself, so it names no extends alternative.

**How to fix:** either correct the Recipe's `spec.implements:` declaration so it matches the Manifest's component-type key, or change the Manifest entry to point at a Recipe whose `spec.implements:` does match the component-type key.

### Manifest mapping value carries more segments than a recipe reference accepts

<!-- covers: pkg/catalog.ErrMalformedRecipeReference -->

A Manifest mapping value names a Recipe or FeatureRecipe in a shape the reference grammar cannot express. A recipe reference accepts a bare name, a name with a version, a capability-qualified name, or a capability-qualified name with a version — at most one `/`. A value carrying more than that (a component-type-style path such as `core/helm/eso-aws-fetcher:1.0.0`) can never name a catalog entity, whatever the catalog holds.

The shape is judged as the Manifest is composed, before anything is looked up — the verdict comes from counting separators in a string, so it needs no catalog at all. Judging it there is what makes the diagnostic honest: the recipe the value *meant* is frequently present and correctly named, and being told it is missing sends you looking for the wrong thing. Every command that resolves a Release's dependencies reports it the same way, so it does not depend on which one you happen to run.

Emitted message:
> malformed recipe reference in a Manifest mapping value: `spec.mappings.components.type.<key>` maps to `<value>`, which carries `<n>` slash-separated segments; a recipe reference accepts `"name"`, `"name:version"`, `"capability/name"` or `"capability/name:version"`; correct the mapping value in the Manifest

The `features` section produces the same message against its own coordinate, and a feature recipe reference is named as such.

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

It halts as an ordinary envelope violation, so the diagnostic takes that class's shape — see "The document-envelope failure class" in [error-translation.md](error-translation.md) — and the finding points at the key that is not permitted here:
> document envelope validation failed (Release, at `<path>`); `<line>`:`<column>`: spec.aggregate: value matches a shape that is not allowed here. correct the document to match its kind's schema

**How to fix:** remove the `aggregate:` field from the child Release. Inheritance intentionally forces the child to deploy the same Developer Intent as its parent; if you need to deploy a different Aggregate, author a fresh Release without `extends:`.

### Manifest merge strategy

<!-- covers: pkg/resolver.ErrFeatureMergeConflict -->

When a local Manifest `extends` a base Manifest, the two tiers (`type:` map, `name:` map) merge independently. Within each tier, child keys overwrite parent keys at the top level — this is a shallow replacement, not a deep merge. A child entry for a given key fully replaces the parent's entry for that key.

When the same feature instance name appears on both the Aggregate side and the Release side with conflicting non-mergeable state (beyond the permitted `infra` layering), the compiler halts and positions the diagnostic on the attachment it could not reconcile. The two conflicting declarations follow in a fixed order — the type the Aggregate declared first, then the type the Release declared — so you can tell which document said which without opening both.

Emitted message:
> feature merge conflict: reconcile the Aggregate and Release declarations for the feature (`"<aggregate-declared-type>"`, `"<release-declared-type>"`)

**How to fix:** reconcile the two declarations. Aggregate-side and Release-side declarations of the same feature instance combine by pillar — Aggregate contributes `values`, Release contributes `infra`. If both sides specify the same non-pillar field (such as `type:`), the values must match; correct one side to match the other, or drop the redundant declaration.

### Annotation binding does not resolve against its target Feature

<!-- covers: pkg/resolver.ErrAnnotationBindingTargetUnresolved -->

A Manifest annotation binding's `feature:` field names a Feature that the catalog does not load, or the binding's `maps.infra` / `maps.values` lists declare dotted paths that the named Feature's `spec.schema` does not actually carry. Either condition halts workspace load — the binding would synthesise Feature attachments routing values into paths the runtime cannot resolve.

One condition covers the three ways a binding's route fails to resolve, and the diagnostic names which of them was met:

- **Feature not found.** The `feature:` value references a Feature URI absent from the loaded catalog.
- **Feature schema compile error.** The named Feature loads but its `spec.schema:` is malformed and cannot be compiled to a JSON Schema 2020-12 representation. This variant carries the compile failure's own diagnostic behind it, so the reason the schema did not compile is readable from the same halt.
- **Binding path not in target schema.** The binding's `maps.infra` or `maps.values` entry names a dotted path the Feature's `spec.schema.<pillar>.<path>` does not declare.

Emitted message (Feature-not-found variant):

> annotation binding does not resolve against its target Feature (Manifest, at `.spec.mappings.features.annotations.<key>`, annotation binding `<key>` targets Feature `<feature-uri>`, but no such Feature is loaded in the catalog)

Emitted message (schema-compile variant):

> annotation binding does not resolve against its target Feature: annotation binding `<key>` targets Feature `<feature-uri>` whose spec.schema does not compile: `<compile failure>`

Emitted message (path-not-found variant):

> annotation binding does not resolve against its target Feature (Manifest, at `.spec.mappings.features.annotations.<key>`, annotation binding `<key>` routes through pillar `<pillar>` at path `<path>` on Feature `<feature-uri>`, but the Feature's spec.schema does not declare a property at that path)

**How to fix:** confirm the binding's `feature:` URI exists in the catalog and matches the case-sensitive URI a Recipe `implements:`. If the path-not-found variant fires on a path the Feature schema does declare, confirm the dotted path spelling (case-sensitive) and the pillar name (`infra` vs `values`).

### A bound annotation value does not conform to the target Feature's schema

<!-- covers: pkg/resolver.ErrAnnotationSubkeyNotConforming -->

An annotation you authored routes a value, through a binding, to a path on the target Feature — and the value does not satisfy the sub-schema the Feature declares at that path, or the Feature declares no property there at all. The condition is read over the value rather than over the binding, which is why it is separate from the binding-target halt above: that one refuses what the Manifest declares, this one refuses what was written through it.

**Full validation at the located path; soft-skip only when the path cannot be located.** Once the bound subkey's sub-schema is located, the value is validated against the **complete** JSON Schema 2020-12 constraint set at that path (type, enum, pattern, numeric range, nested object/array shape) — a terminal `$ref` / `allOf` / `oneOf` is resolved against the schema's definitions and validated, not skipped. The soft-skip discipline applies only to *navigation*: when the walker meets an escape hatch (`$ref`, `patternProperties`, `oneOf`/`anyOf`/`allOf`, or schema-bodied `additionalProperties`) on an **intermediate** segment — before reaching the bound leaf — the path is not statically resolvable, so the validator continues without raising the error rather than risk a false halt; the runtime remains the validation surface for that binding.

Emitted message (value-conformance variant):

> annotation subkey does not conform to the target Feature's schema at the routed pillar: annotation subkey `<subkey>` value `<value>` does not conform to Feature `<feature-uri>` spec.schema.`<pillar>`.`<subkey>`: `<constraint failure>`

Emitted message (undeclared-subkey variant):

> annotation subkey does not conform to the target Feature's schema at the routed pillar: annotation subkey `<subkey>` is not declared at Feature `<feature-uri>` spec.schema.`<pillar>`.`<subkey>`

The halt is raised during annotation expansion, so the diagnostic is wrapped with the scope the value was authored at — the boundary and component for a Release-side annotation, the component path for an Aggregate-side one — and the annotation key it came from.

**How to fix:** correct the bound value to satisfy the declared sub-schema, or widen that property's schema if the value is legitimate. The undeclared-subkey variant is usually pre-empted by the binding-target halt above; reaching it means the binding declares the path and the Feature's schema does not carry it, so correct whichever of the two is wrong. When an intermediate composition operator makes a path unresolvable and the runtime later rejects it, narrow the schema to surface the property at the binding's path directly.

### An annotation routes through a pillar its authoring side may not use

<!-- covers: pkg/resolver.ErrAnnotationSidePillarMismatch -->

Annotations are partitioned by authoring side, and the partition is the same one that governs every other authored pillar: an **Aggregate**-side annotation may route only through a binding path targeting `values`, and a **Release**-side annotation only through a path targeting `infra`. Any other pairing halts.

The partition is what stops the annotation shortcut from becoming a way to author the other side's pillar. A developer's annotation contributes application values; an operator's contributes infrastructure sizing. A binding that declares paths in both pillars is not itself an error — each side routes the subset it is permitted, and the other side's paths are simply not reachable from it.

A binding declaring one path in **both** pillar lists is the case that reaches this halt most often. The routing tie-break sends such a path through `infra`, which makes it unreachable from the Aggregate side, and an Aggregate-side annotation routing to it halts here. The advisory that names that binding shape before a build reaches this halt is described in [warnings.md](./warnings.md).

Emitted message:

> annotation routes through a pillar its authoring side may not use: annotation `<key>` at `<source>` routes through pillar `<pillar>` at path `<path>`, but `<side>`-side annotations may only route through pillar `<permitted-pillar>`

**How to fix:** route the annotation from the side whose pillar the binding targets, or add a binding — under its own annotation key — whose paths target the pillar the authoring side is permitted. Where one binding declares the same path in both pillar lists, split it into two bindings so each side has a path it can reach.

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
> authored pillar does not conform to its declared schema (Aggregate `<name>`, at `.spec.components.<component>.values.<field>`, values pillar does not conform to the Component schema: `<constraint failure>`)
> authored pillar does not conform to its declared schema (Aggregate `<name>`, at `.spec.components.<component>.infra.<field>`, infra pillar does not conform to the declared infra schema: `<constraint failure>`)
> authored pillar does not conform to its declared schema (Aggregate `<name>`, at `.spec.components.<component>.features.<attachment>.values.<field>`, values pillar does not conform to the Feature schema: `<constraint failure>`)
> authored pillar does not conform to its declared schema (Aggregate `<name>`, at `.spec.components.<component>.features.<attachment>.values.<field>`, values pillar does not conform to the Secret schema: `<constraint failure>`)
> authored pillar does not conform to its declared schema (Aggregate `<name>`, at `.spec.components.<component>.uses.<socket>.<alias>.values.<field>`, values pillar does not conform to the socket valueSchema: `<constraint failure>`)

**How to fix:** correct the offending value to satisfy the declared schema, or — if the value is legitimate — widen the declaring schema (the Component's `schema.values`/`schema.infra`, or the attached Feature's/Secret's) to declare it. Inspect a Component's declared schema with `aggrega inspect <component-type>` to see the exact types, ranges, defaults, and required fields each pillar expects.

### A declared schema contract does not compile

<!-- covers: pkg/resolver.ErrSchemaContractCompileFailure -->

A Component type declares a schema contract that cannot be compiled to JSON Schema 2020-12, so there is nothing to validate the configuration it covers against. Three contracts can carry the fault, each authored in its own field: the type's own `spec.schema`, and the two per-edge contracts a dependency socket declares — `valueSchema` for the developer's side of a connection and `infraSchema` for the operator's.

**Declaring no contract and declaring one that does not compile are different situations, and the build treats them differently.** A field that declares nothing is skipped: per-pillar and per-edge conformance is opt-in, so a socket that constrains neither pillar is ordinary authoring and draws no diagnostic. A field that declares something unreadable is refused. Passing it over would leave every payload it covers unvalidated while the build reported success — a check that has stopped running with nothing to say that it stopped. So the refusal is what keeps the two apart: silence means there was nothing to check, and a halt means there was something and it could not be read.

The refusal names the entity that **declared** the contract rather than the document that wrote the configuration, because that is where the correction goes. An application author handed a component type whose contract does not compile has nothing to change in their own file.

The message carries the compile failure as the compact-form compiler reported it: the key inside the contract, the source line, and the offending keyword. A typo'd keyword is the commonest cause — the compact form rejects an unknown keyword rather than ignoring it, precisely so that a mistyped constraint cannot silently become no constraint. A cross-document `$ref:` whose SchemaLibrary entry is not in the loaded closure reaches the same halt.

**A well-formed constraint beside a broken one is not enforced.** A contract compiles as one document, so a single unreadable keyword disables every constraint declared alongside it. That is why the halt is worth more than the constraints it costs: the alternative is a contract that looks enforced, reads as enforced, and enforces nothing.

Emitted message:
> declared schema contract failed to compile, so nothing was validated against it: correct the contract where it is declared, or remove it if the configuration it covers needs no validation (Component `<type>`, at `.spec.schema`, `<compile failure>`)
> declared schema contract failed to compile, so nothing was validated against it: correct the contract where it is declared, or remove it if the configuration it covers needs no validation (Component `<type>`, at `.spec.usesSchema.<socket>.valueSchema`, `<compile failure>`)
> declared schema contract failed to compile, so nothing was validated against it: correct the contract where it is declared, or remove it if the configuration it covers needs no validation (Component `<type>`, at `.spec.usesSchema.<socket>.infraSchema`, `<compile failure>`)

**How to fix:** open the field the diagnostic names and correct the fragment at the reported key and line — most often a mistyped keyword, checked against the keyword vocabulary in [`vocabulary/compact-form-authoring.md`](../vocabulary/compact-form-authoring.md). Where the failure names a cross-document reference, confirm the SchemaLibrary entry exists and that the library is reachable from the Release's dependency closure. If the configuration that field covers genuinely needs no validation, remove the field rather than leaving a contract nothing can read.

### Recipe `source:` is an empty string

<!-- covers: internal/compiler/renderer.ErrEmptySource -->

A Recipe declares `source: ""` — an empty string. A Recipe's `source:` selects between two authoring modes: **sourceless** mode, where there is no external artifact and the output is produced entirely from the Recipe's other input kinds, and **sourced** mode, where `source:` names an external chart, module, or file to render from. Omitting the field selects the first, a non-empty value selects the second, and an empty string selects neither — so it is an ambiguity rather than a value with a meaning.

The build halts instead of choosing one of the two readings for you. The refusal reads the value exactly as you wrote it, ahead of evaluating any template inside it, so it names the ambiguity itself rather than reporting whatever the empty value would have gone on to do. The commonest way to write an empty `source:` is to delete a URI and leave the key behind: sourced mode was intended, and admitting the empty string as sourceless would ship a deployment without the artifact and never say which of the two readings it took.

You may meet the refusal from `aggrega pull` before you meet it from a build. Pinning a Release's sources cannot tell what kind of artifact an empty reference names, so it reports that reference as ambiguous instead. The fix is the same either way.

Emitted message, captioned with the Recipe the empty `source:` was written in and the component instance being rendered:
> recipe source is an empty string, which names neither sourceless mode nor sourced mode (Recipe `<recipe>`, node `<instance>`). omit the source field for sourceless mode, or name a non-empty path or URI for sourced mode

**How to fix:** omit the `source:` field entirely (or set it to null) if the Recipe is sourceless, or provide a non-empty path / URI / structured source object if the Recipe is sourced.

### No Recipe is mapped for a component or feature instance

<!-- covers: pkg/catalog.ErrNoRecipeResolved -->

An instance's type has no Manifest mapping that resolves to a Recipe the catalog holds. Recipe selection is **mapping-only**: the compiler never picks a Recipe by reading `spec.implements:` and choosing among the candidates, so an unmapped type halts however many Recipes implement it. `implements` informs the choice; the author makes it; the Manifest records it.

The same condition covers a mapping that exists but leads nowhere — a value at an accepted reference shape naming a Recipe the catalog does not hold, including one present under a different version than the value pins, and one whose bare name two capabilities both offer. Neither resolves to a Recipe the author can be said to have chosen. A mapping value whose *shape* no reference can express is reported separately, under "Manifest mapping value carries more segments than a recipe reference accepts" above, so the claim that an entity is absent is only ever made about a reference that could have resolved.

Emitted messages. Where a mapping exists and names something absent:
> no recipe resolved for component/feature instance: add an explicit Manifest mapping for its type: component `"<instance>"` (type `"<type>"`): the Manifest maps it to recipe `"<uri>"`, which is not in the catalog

Where no mapping exists and Recipes implementing the type are present, they are listed as the candidates to pin:
> no recipe resolved for component/feature instance: add an explicit Manifest mapping for its type: component `"<instance>"` (type `"<type>"`); recipes implementing it: `[<recipe-uris>]`; pin one in the Manifest

And where nothing implements the type at all, there is nothing to list:
> no recipe resolved for component/feature instance: add an explicit Manifest mapping for its type: component `"<instance>"` (type `"<type>"`); no recipe implements this type

A feature instance reports the same three shapes with `feature` in place of `component` and `feature recipe` in place of `recipe`.

**How to fix:** add the mapping the message asks for, under `spec.mappings.components.type` in the Manifest, keyed by the component type and valued with the Recipe. Where the message lists candidates, pick one of them — that list is exactly the Recipes declaring they implement the type. Where it names a Recipe not in the catalog, either correct the value or add the Recipe to a catalog directory the build reads; a version in the value has to match a version the catalog holds. Where nothing implements the type, the missing piece is the Recipe itself.

### A Manifest maps two version-distinct keys onto one type

<!-- covers: pkg/catalog.ErrAmbiguousTypeMapping -->

A type lookup matched more than one Manifest mapping key. Type keys are matched version-tolerantly, so `core/api-server`, `core/api-server:1.0.0` and `core/api-server:2.0.0` written as separate mapping keys all answer for the same base type — and a lookup that reaches two of them has two Recipes to choose between and no rule for preferring one.

The build halts rather than resolving whichever key it happened to read first. Picking one would make the rendered output depend on the order the mapping was walked in, which is exactly the thing byte-identical output rules out.

Emitted message:
> manifest maps multiple version-distinct keys to the same base type; the type-to-recipe lookup is ambiguous: type `"<type>"` matches version-distinct keys `[<keys>]` — pin the authored type's version or remove the duplicate mapping keys

**How to fix:** two directions, and the message names both. Remove the duplicate mapping keys, keeping the one that should answer for the type — this is right when the extra keys are leftovers from a version bump. Or pin the version on the authoring side, so the type the component declares names the exact key you meant, which is right when the several keys are deliberate and different components genuinely want different Recipes.

### Two catalog entities in one directory share an identity

<!-- covers: pkg/catalog.ErrDuplicateEntityIdentity -->

Two entities of the same kind, loaded from the same catalog directory, carry the same identity. An identity is what a reference names, so two files claiming one identity leave every reference to it with two answers.

**Within a directory this halts; across directories it does not.** The same identity present in two different catalog directories is resolved as a first-win shadow — the directory listed earlier wins — which is what lets a local directory override a published entity deliberately. Only a collision *inside* one directory is an authoring mistake with no reading that makes it intentional.

The rule is the same for every indexed kind: Component, Feature, Recipe, FeatureRecipe, Plugin, SchemaLibrary, MappingLibrary, WorkloadLibrary, ArtifactsLibrary and Aggregate. The halt is positioned at the second file, and names the kind and the identity that collided.

Emitted message:
> duplicate entity identity within a single catalog directory (Component identity `"<identity>"`)

with the kind's own word in place of `Component` — `recipe identity`, `feature recipe identity`, `Plugin identity`, `SchemaLibrary identity` and so on.

**How to fix:** rename one of the two entities, or move it into a directory of its own. For a Recipe or FeatureRecipe the identity includes the provider scope and the version, so two files that differ only in version do not collide — a genuine collision there means the same version was published twice. Copying an entity file to start a new one and forgetting to change `metadata.name` is the usual cause.

### No catalog version satisfies a version constraint

<!-- covers: pkg/catalog.ErrUnsatisfiableEntityVersion -->

A reference names an entity the catalog holds and pins a version the catalog does not: an exact version that is absent, or a caret range nothing available matches. It is distinct from a plain miss, where the name itself is unknown — here the entity exists and only the version is unsatisfiable, which is why the message says so rather than reporting the entity as missing and sending you looking for a typo in the name.

Every kind reaches this through one selection, so an unsatisfiable pin behaves the same wherever it is written: a version typo on a Manifest's Recipe mapping is refused exactly as the same typo on a component type is.

The condition is recoverable, which is what lets the editor show it as a diagnostic while you keep typing rather than abandoning the document. On the command line it is joined into a halt.

Emitted message, for a pin on an `extends:` pointer:
> no catalog version satisfies the referenced version constraint (Component `<name>`, at `.extends`, no catalog version satisfies extends parent `"<reference>"`)

with `Feature` in place of `Component` where a Feature's chain carries the pin.

**How to fix:** change the pin to a version the catalog holds, or add that version to the catalog. `aggrega inspect` lists the versions an entity is available at. A caret range that matches nothing usually means the available versions are all below the floor it names — widen the range, or publish the version the reference is waiting for.

### Every version a reference could select has been withdrawn

<!-- covers: pkg/catalog.ErrAllVersionsRetracted -->

A reference resolves to a repository the registry holds, and every version discovery could have chosen from it has been marked withdrawn. There is nothing eligible left to select.

**This is deliberately not reported as a missing entity.** The repository exists and still holds those versions; calling it absent would name the wrong problem, send you looking for a typo, and read like a quiet fallback rather than the refusal it is. The message names each withdrawn version with the reason recorded against it, so what you are told is what the publisher recorded.

Naming a withdrawn version **outright** is not this halt. An exact version bypasses discovery entirely, so pinning one is how you deliberately keep using it; the build reports the withdrawal and carries on.

Emitted message:
> every published version this reference could select has been withdrawn: `<reference>`: withdrawn: `<version>` (`<recorded reason>`), `<version>` (`<recorded reason>`)

**How to fix:** read the recorded reasons, which usually name what to move to. Migrate to whatever replaces the withdrawn entity — that is the outcome a withdrawal is asking for. Where you have to keep the old one for now, pin an exact version in the reference: naming the version is what says you accept it, and the build then reports the withdrawal each time rather than refusing.

### A `plugins.providers` binding names a plugin that does not serve the capability

<!-- covers: pkg/catalog.ErrProviderBindingUnsatisfied -->

The workspace's `plugins.providers` block selects a plugin identity for a capability, and no provider-rendering Plugin serving that capability carries that identity. The binding is an explicit choice the catalog cannot honour, so it halts rather than quietly falling back to another plugin — a fallback would render your output through a plugin you had said not to use, and say nothing.

A binding selects by the plugin's **coordinate identity** — the plugin type and the plugin's name, which is also what the lockfile pins — and it may carry a version after it.

Emitted message:
> plugins.providers entry names a plugin no provider-rendering plugin serving the capability matches: capability `"<capability>"` is bound to plugin `"<plugin-identity>"`, but no provider-rendering plugin serving `"<capability>"` matches that identity

**How to fix:** check the binding's spelling against the plugin's own coordinate first — a binding naming the capability where it should name the plugin is the common slip. Then confirm the plugin is in the catalog the build reads and that it lists this capability under `spec.provider.capabilities`; a plugin that once served the capability and no longer declares it produces exactly this message. Removing the binding is the right fix where only one plugin serves the capability, since the binding then has nothing to disambiguate.

### No provider plugin version satisfies a Recipe's provider pin

<!-- covers: pkg/catalog.ErrProviderVersionUnsatisfiable -->

A Recipe binds a version-pinned provider — `helm:1.0.0`, or `helm:^1.0.0` — and no provider-rendering Plugin version satisfies the pin. The pin is an explicit request, so the build halts rather than ignoring it and rendering through whatever version happens to serve the provider; silently overriding a pin would produce output the author's own declaration says should not exist.

Two situations reach it, and the message tells them apart: nothing serves the capability at all, or something serves it and none of its versions satisfies the constraint.

This is distinct from an unsatisfiable *entity* version above. That one is about a catalog entity named at a version the catalog does not hold; this one is about selecting the plugin that renders a capability.

Emitted messages:
> no provider-rendering plugin version satisfies the recipe's provider version pin: capability `"<capability>"` pins `"<version>"` but no provider-rendering plugin serves it
> no provider-rendering plugin version satisfies the recipe's provider version pin: capability `"<capability>"` pins `"<version>"` but no serving plugin version satisfies it

**How to fix:** widen or correct the pin in the Recipe's `provider:` field, or add the plugin version it asks for to the catalog. A caret pin matches versions at or above the floor within the same major, so a pin of `^2.0.0` is not satisfied by a `1.x` plugin however recent. Where the message says nothing serves the capability, the pin is not the problem: the plugin is missing entirely, and dropping the pin will not help.

### No plugin advertises a requested parse or import format

<!-- covers: pkg/catalog.ErrNoParserForFormat, pkg/catalog.ErrNoImporterForFormat -->

A format was requested and no plugin advertises it. The two sockets that route by format each have their own condition, and they differ only in which work was asked for: a **parser** plugin reads a foreign source format, and an **importer** plugin brings foreign content in as Aggrega entities.

The format space is open and belongs entirely to the plugins. Neither socket holds a list of formats the compiler knows: a plugin declares the formats it handles as capabilities, and a new format ships as a new plugin with no change to the compiler. So this halt reports the advertised set as it stands rather than a fixed enumeration, and every miss is loud — there is no default to fall back to, so the request either has an advertiser or it cannot be honoured.

Emitted messages:
> no parser plugin advertises the requested format: no parser plugin advertises `"parse:<format>"`
> no importer plugin advertises the requested format: no importer plugin advertises `"import:<format>"`

A single parser plugin advertising the format but carrying a version shape that cannot be resolved is treated as no advertiser rather than as a silent pass, and says so:
> no parser plugin advertises the requested format: no parser plugin version resolves for `"parse:<format>"`

**How to fix:** confirm the format is spelled as the plugin advertises it — the capability is the socket's prefix and the format name, so a plugin advertising `parse:hcl` serves the format `hcl` and nothing else. Then confirm the plugin is present in the catalog the build reads. Where no plugin for the format exists, that plugin is the missing piece; the compiler cannot read a format nothing advertises.

### A parse or import format is advertised by more than one plugin

<!-- covers: pkg/catalog.ErrAmbiguousParserPlugin, pkg/catalog.ErrAmbiguousImporterPlugin -->

Two or more distinct plugins advertise the same format, and the request cannot be routed without guessing which one to use.

**A catalog holding both is legal and loads without complaint.** Two publishers may each ship a parser or an importer for one format, and federating their catalogs is a supported thing to do. The ambiguity is a point-of-use condition: it halts when the contested format is actually requested, so a competing pair sitting outside a build's reach never blocks it.

Every candidate is named, sorted, so the message is the same on every run.

Emitted messages:
> format is advertised by more than one parser plugin: format `"<format>"` is advertised by parser plugins `[<plugin-names>]`
> format is advertised by more than one importer plugin: format `"<format>"` is advertised by importer plugins `[<plugin-names>]`

**How to fix:** narrow the catalog the build reads so only the plugin you want is in it — pointing `--catalog` at the directory holding your choice is the direct way. Keeping both and choosing between them per workspace is supported for the **provider** socket, through a `plugins.providers` entry, and that surface is described under "A capability is served by more than one provider plugin" above; the parse and import sockets have no such selection, so removing the competing plugin from the build's catalog is the remedy for them.

### A plugin reference carries a registry host or an artifact path

<!-- covers: pkg/catalog.ErrQualifiedPluginReference -->

A Plugin reference leads with a registry-host-shaped segment — one containing a dot or a colon, as a DNS name or a host-and-port does — or with an artifact path. A Plugin is addressed by its **coordinate identity**: its plugin type, a slash, its name, and optionally a version. The pull binds that identity to a physical location by prefixing the configured registry and the plugin path itself, so a reference that already carries one would be prefixed twice and bind to a location that cannot be fetched.

It is refused where the location is formed rather than at the fetch, so the message names what you wrote instead of surfacing later as an unreadable tag error.

Emitted message, framed by the pull that was forming the location, with the remedy on the line beneath:
> catalog: tier-3 pull `<uri>`: wasm plugin reference must be the plugin coordinate identity (`<pluginType>/<name>:<version>`), not a registry-qualified or artifact path: `"<identity>"`
>   remediation: remove the registry host and the artifact path, leaving the coordinate alone — `<pluginType>/<name>:<version>`, for example `provider/helm:1.0.0`; the pull prefixes the configured registry itself, so a reference that already carries one is prefixed twice

**How to fix:** strip everything ahead of the plugin type, leaving the coordinate on its own — `provider/helm:1.0.0`, not `hub.example.com/plugin/provider/helm:1.0.0`. The registry a build pulls from is workspace configuration rather than part of an identity, which is what lets one catalog be served from more than one registry without editing the entities in it.

### A plugin or recipe reference carries no scope

<!-- covers: pkg/catalog.ErrUnscopedPluginReference, pkg/catalog.ErrUnscopedRecipeReference -->

A Plugin or Recipe reference has no leading scope segment — no slash at all, or an empty one before the slash, as in `/name`. Both kinds are identified by two parts, and the first is what keeps two same-named entities apart: a Plugin by its **plugin type** and its name, a Recipe by its **provider** and its name. Two sockets may each hold a plugin called `redact`, and two providers may each ship a recipe called `postgres`, so the scope is part of the identity rather than decoration on it.

A location built from an empty scope carries an empty path segment — a doubled slash — which cannot resolve, so the reference is refused where the location is formed rather than left to fail later as an unreadable fetch.

The two remedies are opposites of the qualified-plugin case above and of each other, which is why each is worded on its own: here a reference is **short** a segment and you add one, while a qualified reference carries an extra one and you remove it.

Emitted messages, each framed by the pull and carrying its own remedy beneath:
> catalog: tier-3 pull `<uri>`: wasm plugin reference must carry a pluginType scope (`<pluginType>/<name>`); an empty scope cannot bind to an OCI location: `"<identity>"`
>   remediation: add the missing pluginType segment — write the reference as `<pluginType>/<name>`, for example `provider/helm` or `governance/redact`, using the pluginType the plugin entity declares under `metadata.pluginType`

> catalog: tier-3 pull `<uri>`: recipe reference must be provider-scoped (`<provider>/<name>`); an empty provider cannot bind to an OCI location: `"<identity>"`
>   remediation: no local catalog directory held this reference, so it was looked for in the registry, where a provider segment is required; re-run as `aggrega pull --release <release> --catalog <dir>` so the directory that holds it is searched first (`--catalog` is repeatable)

**How to fix:** for a plugin, prefix the plugin type the Plugin entity declares under `metadata.pluginType`. For a recipe, prefix the provider the Recipe declares under `spec.capability`. The recipe remedy names a second possibility worth reading: reaching the registry at all means the local catalog directories were searched first and none held the reference, so if the recipe is meant to come from a local directory, point the build at that directory rather than adding a scope.

### The build consumes an artifact its publisher has deprecated

<!-- covers: pkg/deprecation.ErrDeprecatedEntity -->

A reference this build resolves carries a deprecation marker its publisher recorded, and that marker's severity is at or above the severity the workspace configured as its halting threshold. A marker is attached to a published artifact after the fact, so an artifact that built cleanly yesterday can carry one today without anything in your own files changing.

**Reporting and halting are separate, and only halting is configurable.** Every recorded marker is reported, at every severity, and no configuration silences that. Whether a marker also *stops* the build is what `halt_on_deprecated_severity` decides, comparing the recorded severity against the configured threshold in the order `warning` < `error` < `retracted`. With no threshold configured, nothing halts and every marker is an advisory. A severity outside the three, or a threshold outside them, never meets: a malformed value can neither cause a halt nor suppress one.

**Every notice is printed before the build stops, not only the one that halted**, so raising the threshold never costs you a finding — the halt itself names the single reference it stopped on. Findings are sorted by reference, so the same lockfile reports the same sequence on every run and the halting one is always the same.

Two stores are checked and both report the same way: the references the lockfile pins, and the plugins recorded as trusted for an accept-or-reject verdict. Neither check reaches a registry — both read what was already recorded — so the build stays ahead-of-time.

Emitted message. Each finding is printed as it is walked, and the halt then repeats the one that met the threshold and names the setting that stopped the build:
> ```text
>   deprecation: <reference> is retracted: <the publisher's recorded message> (recorded in the lockfile at pull, as of <when>; re-run `aggrega pull` to refresh it)
> ```
> deprecation: build consumes a deprecated entity: `<reference>` is retracted: `<the publisher's recorded message>` (recorded in the lockfile at pull, as of `<when>`; re-run `aggrega pull` to refresh it): halt_on_deprecated_severity is `"error"`

A marker at one of the two advisory severities is stated as `deprecated (warning)` or `deprecated (error)` in place of `retracted`. The distinction is kept because the two mean different things — discouraged but still selectable, against excluded from selection — and reporting the stronger as the weaker would understate what happened.

**How to fix:** read the recorded message, which is the publisher's own account of what to move to, and migrate. Where you cannot migrate yet, raising `halt_on_deprecated_severity` — or unsetting it — turns the halt back into an advisory you keep seeing; that is a deliberate acceptance rather than a workaround, and the notice keeps printing. A marker recorded against a version you no longer use disappears when the lockfile is refreshed with `aggrega pull`.

### A trusted plugin's recorded digest disagrees with the cached artifact

<!-- covers: pkg/resolver.ErrVerdictPluginTrustMismatch -->

A plugin attached in a role that accepts or rejects a build has a digest recorded as trusted for it, and the plugin's cached manifest reports a different one. The two are compared **before** the plugin's executable is read, and a disagreement stops the resolution there.

The comparison is what makes the recorded digest an authority rather than a restatement. Without one, a plugin's bytes are only ever checked against a pin derived from the very manifest whose bytes it then validates — self-consistent by construction, and unable to notice that the whole artifact has been replaced. Comparing what was recorded against what the manifest now reports is what gives that check an outside opinion.

This is distinct from a content-digest mismatch, which reports resolved *bytes* disagreeing with the digest claimed for them. Here nothing has been read, and the bytes may well agree with the manifest; what disagrees is which artifact is being resolved at all. Keeping the two apart matters because the remedies are opposites — one is a corrupted or tampered artifact, the other a legitimately changed plugin whose new identity has not been reviewed yet.

Emitted message:
> resolve verdict-socket plugin `"<plugin-identity>"`: the digest recorded as trusted for it is `<recorded-digest>`, but the plugin manifest in the content cache reports `<cached-digest>`; review what changed and re-record the trusted digest, or restore the recorded artifact: the digest recorded as trusted for this plugin does not match the digest its cached manifest reports

**How to fix:** find out what changed before you re-record anything — this is a plugin that can reject your builds, and the recorded digest is the statement that someone looked at it. Where the change is expected, because you upgraded the plugin deliberately, review the new artifact and re-record the trusted digest for it. Where it is not expected, restore the artifact the record names; the disagreement is telling you the identity moved without anyone deciding it should.

### An `extends:` chain cannot be assembled

<!-- covers: pkg/validator.ErrInheritanceMerge -->

A Component's or Feature's `extends:` chain was walked and could not be turned into a single resolved entity. Two situations reach it: the chain names a parent the catalog does not hold, and the chain is longer than the walk's depth bound of ten.

It is distinct from a cycle, which has its own condition and its own remedy — see "Cyclic extends chain" above — and from an unsatisfiable version pin, where the parent exists and only the version does not. This condition covers a chain that cannot be assembled for either of the two reasons below.

Emitted message, where a parent is absent:
> inheritance merge failed (Component `<name>`, at `.spec.extends`, parent entity `"<reference>"` not found in catalog). Verify the extends URI points to an existing catalog entity

and where the chain is too long:
> inheritance merge failed (Component `<name>`, at `.spec.extends`, inheritance chain exceeds maximum depth of 10). Reduce the inheritance chain length

`Feature` appears in place of `Component` where a Feature's chain is the one that failed.

**How to fix:** for an absent parent, confirm the `extends:` value names an entity the catalog holds, spelled as that entity's own `metadata.name` — case included. For a chain past the depth bound, collapse the middle of it: a chain that deep usually means each tier adds a little, and folding several tiers into one base entity is both the fix and the clearer shape.

### An assertion name is declared twice along an `extends:` chain

<!-- covers: pkg/validator.ErrAssertionNameCollision -->

An entity and something it extends both declare an assertion under the same name, and the two declare **different** rules. An extending entity's assertions add to its base's; they never replace one. So a name declared twice with two different rules would silently retire the base's invariant, which is the opposite of what extending an entity is for.

Declaring the same name with the *identical* rule is not a collision and builds. That is what keeps the check idempotent along a chain: without it, a three-deep chain would collide with its own middle tier every time.

Order is part of the contract rather than incidental. Assertions evaluate in the merged order and the first failing one halts, so a base's invariant is checked before a descendant's, and along a chain the set accumulates from the root down.

Emitted message:
> assertion name declared twice across the extends chain (Component `<name>`, at `.spec.assertions.<key>`, assertion `"<key>"` is already present on the base Component `"<base>"`, declaring a different rule). Rename the extending entity's assertion; an extending entity's assertions add to the base's and never replace one

**How to fix:** rename the extending entity's assertion, which the message names along with the base that already declares it. Where you meant to *replace* the base's rule, that is not something extending supports — narrow the base's assertion so it holds for every entity extending it, or move the rule down onto the entities that actually need it. Where the two rules are meant to be the same, make them textually identical and the collision goes away.

### An external input's URL uses a scheme that is not allowed

<!-- covers: pkg/externalinputs.ErrSchemeNotAllowed -->

A URL an entity points at uses a scheme outside the allowed set. Three are allowed: `https`; `http`, but only to a loopback host, so cleartext can only ever reach the local machine; and `oci`, for content pulled from a registry.

Emitted messages, for a non-loopback `http` URL and for any other scheme:
> externalinputs: `"<url>"`: plain http is allowed for loopback hosts only (allowed schemes: https, http to a loopback host, oci): externalinputs: URL scheme is not allowed
> externalinputs: `"<url>"`: scheme `"<scheme>"` is not allowed (allowed schemes: https, http to a loopback host, oci): externalinputs: URL scheme is not allowed

**How to fix:** switch the URL to `https`, or to `oci` where the content is published in a registry. A plain `http` URL to a remote host is refused rather than downgraded, so pointing it at the secure scheme is the fix; a local development server keeps working over `http` because a loopback host is allowed.

### An unpinned external input is requested while acquisition is off

<!-- covers: pkg/externalinputs.ErrAcquisitionDisabled -->

Something a build needs is fetched from a URL that the lockfile does not pin, and this run is not permitted to acquire anything. This is the frozen-closure guarantee doing its job: a run that may not acquire is one whose inputs are exactly what was pinned, and fetching an unpinned URL would quietly widen that set.

Emitted message:
> externalinputs: `"<url>"` is not pinned in the lockfile; re-run with acquisition enabled or run the standalone acquisition pass to pin it: externalinputs: acquisition is disabled for unpinned inputs

**How to fix:** pin the input. `aggrega pull --release <release>` fetches it and records its digest in the lockfile, after which every later run serves it from the pinned record without needing to acquire. Re-running with acquisition enabled does the same thing as part of the build. Where the URL is new because something you authored started pointing at it, the pull is the step that was skipped; where it is unexpected, the reference that introduced it is worth finding before you pin it.

### Fetched bytes do not match a pinned digest

<!-- covers: pkg/externalinputs.ErrDigestMismatch -->

A pinned URL was fetched again — because its stored copy was missing — and what came back is not what the lockfile pinned. **The recorded digest always wins:** nothing is written to the store, and no bytes are returned.

A refill is fetched by the recorded digest rather than by the URL's tag, so a tag that has been moved to point at different content cannot change what a pinned entry serves. Reaching this halt therefore means the content behind the digest itself failed to come back intact.

Emitted messages, for content pulled from a registry and for content fetched over HTTPS:
> externalinputs: `"<url>"`: refilled manifest digest is `<digest>`, pinned digest is `<digest>`: externalinputs: fetched bytes mismatch the pinned digest
> externalinputs: `"<url>"`: refetched bytes hash to `<digest>`, pinned digest is `<digest>`: externalinputs: fetched bytes mismatch the pinned digest

**How to fix:** treat it as a supply-chain question first rather than a lockfile to refresh — the pin is the statement that these exact bytes were what you built against, and the refusal is that statement holding. Confirm the source still publishes the content the digest names, and check whether anything between you and it is rewriting responses; a proxy or a mirror serving a substitute is a common cause. Only once you know what changed and accept it should you re-pin with `aggrega pull`, which records the new digest.

### A stored external input no longer matches its record

<!-- covers: pkg/externalinputs.ErrStoreCorrupt -->

A pinned input was read back from the local store and does not match the record pinned for it. The check runs on every read, before the bytes are served, so a store that has been corrupted or tampered with surfaces at the point of use rather than silently feeding a build.

What is compared depends on how the input is pinned. Content fetched over HTTPS is pinned by hashing the payload, so it is re-hashed on every read and both digests are reported. Content pulled from a registry is pinned by its manifest digest, which commits to the payload through the registry's own manifest rather than by hashing it directly, so a stored copy is checked against the recorded size — full digest verification anchors at acquisition and at every digest-addressed refill instead.

Emitted messages:
> externalinputs: `"<url>"`: store blob sha256 is `<digest>`, pinned digest is `<digest>`: externalinputs: store blob mismatches its pinned record
> externalinputs: `"<url>"`: store blob sha256/`<digest>` is `<n>` bytes but the pinned record says `<n>`: externalinputs: store blob mismatches its pinned record

**How to fix:** delete the offending blob from the store and let the next run refill it from the source, which is verified against the recorded digest before anything is written. If a refill then reports a digest mismatch as well, the disagreement is upstream rather than local and the entry above is the one to read. A store shared between machines, or one restored from a backup taken mid-write, is the usual local cause.

### A guard needs a catalog entity the build resolved and cannot see

<!-- covers: pkg/resolver.ErrGuardEntityViewInconsistency -->

A semantic guard reached for the catalog entity behind a component's type, and the entity is absent from the view the guard was given — even though resolution resolved that type as a catalog reference. A genuinely unresolvable reference halts earlier, at resolution, so reaching a guard with the entity missing means the build's resolved set and the guard's view have come apart.

The build stops rather than skipping the guard. Skipping would retire a check with nothing to say that it had gone, and the components the guard was about would pass unexamined while the build reported success.

A type written as a relative path — beginning `./` or `../` — is a local file rather than a catalog identity, so it legitimately has no catalog entity and is skipped rather than reported. Only a bare-token catalog reference reaches this halt.

Emitted message:
> guard catalog-entity view inconsistency (Aggregate `<name>`, at `<field-path>`, type `"<type>"` was resolved as a catalog reference but is absent from the guard's catalog view (build resolved-set / guard view divergence))

**How to fix:** nothing in your own files — this reports an inconsistency inside the compiler rather than a fault in what you wrote, and it is worth reporting as a defect with the type the message names. The component's type is almost certainly fine; if you need to get past it while the defect is investigated, writing the type as a relative path to a local entity file takes that component off the catalog-resolution path.

## When building the topology

Once every Component has a resolved Recipe, the compiler stitches Components together into the IR graph by reading each Component's `uses:` block and cross-referencing targets and feature attachments.

### Dangling `uses` target

<!-- covers: internal/compiler/topology.ErrDanglingUsesTarget -->

A `uses:` edge names a target component that does not exist in the resolved topology. The halt is origin-agnostic — a developer-authored Aggregate edge and a Release-wired edge are caught alike. A dangling target is a fatal halt, not a silent drop: an edge to a non-existent target would otherwise vanish and leave the consumer's injected values silently empty at deploy time. It is the structural sibling of the uses-socket allowlist — the socket must be declared *and* the target must resolve to an existing component before an edge is type-checked.

Emitted message:
> uses edge target does not exist: uses edge `<consumer>`/`<socket>`/`<alias>` targets `"<target>"`, which is not a component in the topology

**How to fix:** declare the missing target component, or correct the target name in the `uses:` entry to match an existing component.

### `uses:` socket not declared in the target's `usesSchema`

<!-- covers: pkg/resolver.ErrUnknownUsesSocket -->

A `uses:` block names a socket that the entity owning the surface does not declare in its `usesSchema`, on one of the two surfaces where only a declared socket may be named: a **Feature attachment's** `uses:`, where the socket must be declared on the attached Feature, and a **Release's** per-edge `uses:`, where it must be declared on the consuming Component. A Release may wire or configure edges only within sockets the Component's `usesSchema` already declares.

A **component's own** `uses:` block is deliberately not one of those surfaces, so this halt does not fire for it. A developer owns the application's topology and may name a socket the catalog did not declare; catalog silence about a socket means the connection was not anticipated, not that it is forbidden. Such a socket is legal and its edge is built — what it gives up is the selector and the per-edge contract a declared socket carries. A misspelled socket name there is therefore not a halt but an ad-hoc connection of its own, and is reported as a warning naming both spellings — see [warnings.md](warnings.md) "Uses-socket near-miss lint".

Emitted message:
> unknown uses socket: name a socket the entity declares in its usesSchema — only a component's own uses block may name one the catalog did not declare (socket `<socket-name>` not defined in component type `<component-type>` usesSchema (valid: `[<declared-sockets>]`))

The attachment arm names the feature type in place of the component type; an attached Feature that declares no `usesSchema` at all reports instead that `uses:` declarations are not allowed for it.

**How to fix:** on an attachment, correct the socket name to one the attached Feature declares, or declare that socket in the Feature's `usesSchema`. On a Release per-edge entry, correct the socket name to one the consuming Component declares — a Release cannot introduce a socket the Component does not declare, and moving the declaration into the catalog entity is the supported path. If the catalog entity declares no `usesSchema` at all, it accepts no `uses:` declarations on that surface — remove the block.

### Release retargets a developer-declared edge

<!-- covers: internal/compiler/topology.ErrReleaseEdgeRetarget -->

A Release per-edge `uses:` entry names a target that differs from the target the developer already wired for the same socket and alias. A Release may *configure* an edge the developer declared (set per-edge `infra`, naming the same target or omitting it) and may *wire* an edge into a declared-but-unbound socket, but it may not *retarget* an edge the developer declared — the developer owns the architecture they authored.

Emitted message:
> release edge retargets a developer-declared edge: release edge `<consumer>`/`<socket>`/`<alias>` retargets developer-declared target `"<declared-target>"` to `"<release-target>"`

**How to fix:** drop the differing `target` from the Release `uses:` entry to configure the existing edge (per-edge `infra` only), or, if the connection genuinely belongs to a different socket, wire it through a socket the developer left unbound. To change the target itself, change it in the Aggregate, where the topology is authored.

### Release per-edge configuration has no edge to apply to

<!-- covers: internal/compiler/topology.ErrUnboundReleaseEdgeConfig -->

A Release per-edge `uses:` entry sets `infra:` but no edge exists at the consumer, socket and alias it names, once every edge in the build has been drawn.

The two things a Release entry can do are *wire* an edge and *configure* one, and which it does is decided by whether it names a `target:`. An entry with a target creates the edge it configures. An entry without one configures an edge that must already exist — declared by the developer in the Aggregate, or contributed by an attached Feature. So an entry that names no target and matches no existing edge applies to nothing: the `infra:` block below it never reaches any output. The build stops rather than accepting authoring that does nothing, because a successful build otherwise reads as confirmation that the infrastructure was applied.

The alias is part of what an entry names, so an entry configuring an alias the developer never declared reaches no edge even when the socket is bound under a different alias. So does an entry naming a component the Aggregate does not declare.

Two neighbouring conditions are reported by their own halts rather than this one, because each has more to tell you. A socket the consuming Component's `usesSchema` does not declare is reported as an undeclared socket, which can list the sockets that do exist. A `target:` naming no component is reported as a dangling target. A component switched off by an `active:` toggle takes its edges with it by design, so an entry left behind on one is accepted rather than halted.

Emitted message, where the entry names a component that exists:
> release per-edge configuration has no edge to apply to: release edge `<consumer>`/`<socket>`/`<alias>` sets infra but no edge is bound there: an entry without a target configures an edge that must already exist, so give the entry a target to wire the edge or remove the entry

Where it names one that does not:
> release per-edge configuration has no edge to apply to: release edge `<consumer>`/`<socket>`/`<alias>` sets infra on `<consumer>`, which is not a component in the topology

**How to fix:** add a `target:` to the entry, which wires the edge and applies the configuration to it; correct the alias to the one the Aggregate declared for that connection, so the entry configures the existing edge; correct the component name to one the Aggregate declares; or remove the entry if the configuration is no longer wanted.

### Required `uses:` socket not populated

<!-- covers: pkg/resolver.ErrMissingRequiredSocket -->

A Component declares a socket in its `usesSchema` marked `required: true`, and nothing in the build wires a connection on that socket for one of the instances of that Component.

**Three surfaces can wire it, and the halt fires only when all three are empty.** The instance's own `uses:` block in the Aggregate; a Release per-edge `uses:` entry that names a `target:`, which creates the connection into a declared-but-unbound socket; and the connection set the composition produced, which is what answers for a component contributed by an imported Aggregate — such a component's `uses:` block lives in that Aggregate's own document, read only once the composition is assembled. Because the third surface is the last to be complete, the check runs once the whole composition exists rather than while the two authored documents are being read, and it asks the same question of every component whichever document declared it.

Two shapes that look like they should populate the socket do not. A Release entry naming no `target:` configures a connection that must already exist rather than creating one, so it wires nothing (and, where it carries `infra:`, is reported by its own halt above). And a Feature attachment's `uses:` names sockets declared on the attached Feature, a separate socket set on a separate entity, so an attachment can never populate a Component's own socket.

Emitted message:
> required uses socket not populated (`<socket-name>`, declared required by component type `<component-type>`)

The finding is positioned at the socket entry the author has to write, `.spec.components.<instance>.uses.<socket>`. The instance name in it is the name the component carries in the document that declares it, so for a component an imported Aggregate contributed the locator names a key that Aggregate's own file contains rather than the prefixed name the composition gave it.

Each unpopulated required socket is reported, on every component: one build tells you about all of them rather than about the first.

**How to fix:** add a `uses:` entry for the required socket, wiring it to a target the socket's `selector:` accepts; or wire it from the Release with an entry that names a `target:`. If the socket should no longer be required, update the Component's `usesSchema` to set `required: false` or remove the `required` declaration.

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
> feature type mismatch between Aggregate and Release (node `<node-id>`, attachment `<instance-name>`, existing type `<type-in-aggregate>` conflicts with `<type-in-release>`)

**How to fix:** either drop the `type:` from the Release (it will inherit from the Aggregate), or change one side so both declare the same type. The Release is allowed to omit `type:` or repeat the Aggregate's type, but it cannot substitute a different one.

### Cyclic extends on Components or Features

<!-- covers: pkg/validator.ErrCyclicExtension -->

A Component's `extends:` chain or a Feature's `extends:` chain loops back on itself.

Emitted message, with `Feature` in place of `Component` when a Feature chain is the one that loops:
> cyclic extends chain (Component `<name>`, at `.spec.extends`, circular extends detected: `<entity-name>` already in chain). Remove the circular extends reference

**How to fix:** break the loop in the chain of Component or Feature definitions the message walks through.

### Intentional omission: the topology is not required to be acyclic

Unlike tools that enforce a Directed Acyclic Graph on infrastructure dependencies, Aggrega allows cycles in the topology. Agent-to-agent architectures, callback patterns, and mutual-authentication pairs all produce cyclic edges, and the compiler accepts them. Ordering at deploy time is the renderer's concern (through per-boundary `syncWave` or equivalent), not the IR graph's.

## When checking inject contracts

The compiler walks every `inject:` block — both self-inject (a Component injecting into itself) and uses-inject (cross-Component wiring) — and validates the delivery contract against the target Component's `provides:` schema, the Feature's label partition, and the set of declared delivery keys. A `from:` key on a block the Aggregate's own component wrote is checked as soon as the catalog resolves, so it fails against the line you wrote; a `from:` key on a connection an attached Feature contributes is checked once every surface that can draw a connection has contributed, which is the earliest point at which such a connection exists to check.

### Inject `from` key is not in the target's `provides`

<!-- covers: pkg/resolver.ErrInvalidInjectKey -->

An `inject:` entry references a `from:` key that the target Component's `provides:` schema does not declare.

**The check applies wherever the connection was written.** A `uses:` connection reaches the built topology from more than one authoring surface — a Component's own `uses:` block, and the `uses:` block of a Feature attached to it, whether that attachment is written on the component, on a subsystem, on a Release boundary, or on a Release boundary's component entry — and the same misspelled key is refused on every one of them. The diagnostic points at the block whose author wrote it: an attachment's own `uses:` entry, at the site the attachment itself was declared, rather than at the consuming component's `uses:` block, which for a contributed connection holds nothing at all.

Where the reference resolves depends on where it lives. A Component-level self-inject `from:` resolves against that same Component's own `provides:`. A `from:` on a `uses:` connection resolves against the `provides:` of the component that connection points at — and where two surfaces write one socket and one alias, each connection resolves against the target it itself names. A Component that declares no `provides:` rejects every `from:` reference aimed at it.

A `value:` entry carries a literal and is resolved against nothing, so a literal that happens to read like a provides key is not refused. Only `from:` names a key.

The Release's own per-edge `uses:` surface carries `target` and `infra` and no `inject:`, so a connection wired there dictates no delivery and has no `from:` key to check.

Emitted message, for a `from:` read on a Component's own `inject:` block. The refusal comes first, then the key at fault, the component type it was resolved against, and that type's declared keys in sorted order — the alternatives to pick from:
> invalid inject key: the from-key must name a declared provides key of the target component type (`"<from-key>"`, `"<component-type>"`, `"<key-1>"`, `"<key-2>"`)

For a `from:` read on a `uses:` connection, the same refusal leads and the mechanism and delivery key the entry was written under come ahead of the key at fault:
> invalid inject key: the from-key must name a declared provides key of the target component type (`"<mechanism>"`, `"<delivery-key>"`, `"<from-key>"`, `"<component-type>"`, `"<key-1>"`)

When the target declares no `provides:` keys at all there are no alternatives to list, so the message ends after the component type.

**How to fix:** either change the `from:` key to match one of the declared keys listed in the message, or extend the target Component's `provides:` schema to declare the key you need.

### Required feature not attached

<!-- covers: pkg/resolver.ErrMissingRequiredFeature -->

The Component declares a presence mandate — a `features.aggrega.ai/requiredType.<label>` annotation — naming a Feature type that is not present among the attachments this component instance ends up with, counting every scope: the Aggregate's component-level and subsystem-level blocks, the Release's boundary-level and component-level blocks, and annotation-driven expansion.

Emitted message:
> missing required feature: attach a Feature of the required type to the component (`<component-type>`, `<required-type>`, `<label>`)

The three values are the component type that declares the mandate, the Feature type it demands, and the label the mandate carries — so a component demanding two different types reports two messages that differ, and two components declaring the mandate from different types are told which type made each demand. The report is positioned at the component's own key under `components:`, and a component written inside a subsystem is positioned under that subsystem's key first.

The name an attachment is written under does not matter here: the mandate asks whether an attachment of the named type is present at all. Binding a slot satisfies it, and so does an attachment under any other name.

**How to fix:** attach a Feature of the required type to the component in the Aggregate or the Release, or at a broader scope the component inherits from. If the Component should no longer require it, remove the mandate annotation from its catalog declaration.

### Malformed attachment requirement

<!-- covers: internal/compiler/analyzer.ErrMalformedAttachmentRequirement -->

A presence mandate's declaration cannot be evaluated. An annotation value is an opaque string, so nothing validates its shape before the compiler reads it: a value that is not a Feature type URI, or a key that names the mandate family without a label after the prefix, is reported as a broken declaration rather than as an unsatisfied requirement — a typo must never read as a satisfied requirement.

Emitted messages:
> malformed attachment requirement (`<component-type>`, `<key>`, the value must be a Feature type URI of the form `<publisher>/<name>` in lower-case kebab segments, as in `core/prometheus-exporter`)
>
> malformed attachment requirement (`<component-type>`, `<key>`, the key needs a label naming the requirement, as in `features.aggrega.ai/requiredType.database`)

The first value is the component type whose declaration is broken and the second is the annotation key, so the message names the entity to correct even though the report is positioned at the component instance that uses that type — the instance is where you see it, and the catalog entity is where the remedy is.

This halt is raised as soon as the composition is assembled, which is earlier than every check that reads the finished graph. A build carrying a broken mandate therefore reports it on its own: the checks that would run later are not reached, because they reason about what the declaration says and the declaration cannot be read. Correct it and rebuild to see the rest.

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
> attachment does not conform to its declared slot shape (Aggregate `<name>`, at `.spec.components.<component>.features.<attachment>.<key>`, attachment does not conform to the declared slot shape: this key is not part of the slot's declaration — remove it, or declare it on the slot in the entity's featuresSchema)

An attachment declared at a broader scope — subsystem-wide, cascading onto every component beneath it — is held to the same shape, and it is checked against the slot on each component it reaches. The same attachment can therefore be in shape for one component and out of shape for another, so this form names the component and the slot it failed against, and locates the attachment at the scope where it was declared rather than at a key inside its delivery block:

> attachment does not conform to its declared slot shape (Aggregate `<name>`, at `.spec.subsystems.<scope>.features["<attachment>"]`, this attachment is declared at a scope that reaches component `<component>`, whose attachment slot `<slot>` does not accept the delivery it carries: move the attachment down to the components that may receive it)

**How to fix:** the two forms call for different edits, and the field path tells you which one you have. Where it names a key inside an attachment on a component, that key is the fault: remove it, or declare it on the slot in the entity's `featuresSchema` — adding the delivery mechanism to the slot's `inject` allowlist where the material is genuinely meant to reach the workload. Where it names an attachment at a scope, the attachment is well formed and its placement is the fault: move it down onto the components whose slot accepts the delivery, leaving outside its reach the components that reserve delivery to their Recipe.

### Duplicate delivery key across inject sources

<!-- covers: pkg/resolver.ErrInjectKeyCollision, internal/compiler/renderer.ErrSelfInjectKeyCollision -->

The same delivery key (for example, the same env var name) is claimed by two developer-authored inject sources — one at the Component level and one under a `uses[]` entry, or two `uses[]` entries on the same component.

The build reads this in three places, because they see different sets of dependency connections and ask different questions of them, and each reports in its own form.

The first reads the connections you wrote in the Aggregate, and reports as your files are resolved. It names the delivery mechanism, the key, and then the socket and alias of the first connection in author order that also claims it:

> duplicate delivery key across inject sources (Aggregate `<name>`, at `.spec.components.<component>.inject.<mechanism>.<key>`, `"<mechanism>"`, `"<key>"`, `"<socket>"`, `"<alias>"`)

The second reads the connections the finished topology carries, which includes any a Feature attachment contributed on your behalf. It runs before anything renders, and it names the delivery key you wrote alongside the dependency socket that also delivers it:

> duplicate delivery key across self-inject and uses-inject (`"<key>"`, socket `"<socket>"`)

One authored key delivered through two dependency sockets reports once per socket, so a single build tells you about all of them rather than about whichever was reached first.

The third reads the same finished topology and asks a different question of it: whether two of a component's own dependency connections deliver one key between them, with the component itself claiming nothing. It reports once at each connection, positioned at that connection's own delivery entry, and names the entry's path followed by every socket delivering the key:

> duplicate delivery key across inject sources (`"inject.<mechanism>.<key>"`, `"<socket>"`, `"<socket>"`)

A socket named twice is what tells you the two connections sit on one socket under different aliases — there the position is the only thing separating them, so read the field path of each of the two reports rather than the socket names.

Neither connection is the offender and both are yours to change: rename one of the keys, or drop one of the two deliveries.

**Where the key is a path, the field path names the mechanism's block instead.** What a delivery key spells is the mechanism's own business, and a `file` mechanism delivers into a mount path — so such a key contains dots while a field path divides its own steps with them. A field path stops at the last step it can name without ambiguity rather than spelling one that would read as a walk through keys your document does not contain, so for a key like `/etc/app/config.yaml` it reads `.spec.components.<component>.inject.<mechanism>` and stops there. The message names the key either way, which is what keeps the report equally actionable: read the field path for the block, and the first quoted value for the key inside it.

**How to fix:** rename one of the conflicting keys, or drop the duplicate declaration. Note that a FeatureRecipe's `injectMapping` overwriting a developer key is intentional Onion-Model interception and is not flagged.

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

Emitted message. The refusal comes first, then the block to edit: the consuming component, the socket and alias, and the `inject:` block beneath them:
> uses-edge inject dictates a delivery mechanism the socket does not permit: component `"<consumer>"`.uses[`"<socket>"`][`"<alias>"`].inject: socket `"<socket>"` on component type `"<component-type>"` declares no inject allowlist (Black-Box pattern) — delivery dictation is not allowed

An edge authored on an attachment is located as `component "<consumer>" attachment "<attachment>"`, and one wired in the Release as `Release component "<consumer>"`. Where the socket was declared on the attached Feature, the message names the feature type in place of the component type. Several offending edges in one build are reported together, joined by `; `.

**How to fix:** remove the `inject:` block from the edge and read the dependency's values from `.context.uses.<alias>.provides.<name>` in the consuming Recipe instead; or, if the connection is meant to be transparent, declare the delivery mechanisms the socket permits in its `usesSchema` entry's `inject:` allowlist.

A socket the declaring entity never declared at all is a different case and is not refused here: an ad-hoc socket carries no allowlist, so there is nothing for the edge to be outside of.

### `uses` edge dictates a delivery mechanism outside the socket's allowlist

<!-- covers: internal/compiler/ir.ErrUsesInjectForbidden -->

An `inject:` block on a `uses:` edge names a delivery mechanism the socket's `inject:` allowlist does not list. The allowlist is the declaring entity's statement of which delivery forms its entrypoint can actually read the dependency's values from, so a mechanism outside it would deliver values nothing consumes.

Every mechanism the block names is checked, and each one outside the allowlist is reported, so one build names them all rather than one per run.

Emitted message. The refusal comes first, then each refused mechanism under the `inject:` block that named it, joined by `; `:
> uses-edge inject dictates a delivery mechanism the socket does not permit: component `"<consumer>"`.uses[`"<socket>"`][`"<alias>"`].inject.`<mechanism>`: mechanism `"<mechanism>"` not in socket `"<socket>"` inject allowlist `[<mechanism-1> <mechanism-2>]` on component type `"<component-type>"`

An edge authored on an attachment is located as `component "<consumer>" attachment "<attachment>"`, and one wired in the Release as `Release component "<consumer>"`. Where the socket was declared on the attached Feature, the message names the feature type in place of the component type.

**How to fix:** switch to one of the allowlisted mechanisms, or, if the entity should support the mechanism you need, widen that socket's `inject:` allowlist in its catalog `usesSchema` entry.

## When rendering output

After every contract is validated, the compiler evaluates Go templates on Component values, FeatureRecipe `injectMapping` blocks, and Recipe sources, then hands the result to the renderer.

### `provides:` template references a non-self-contained root

<!-- covers: internal/compiler/renderer.ErrProvidesSelfContainment -->

A Recipe's `provides:` template references a root outside the self-contained set. The `provides` block is evaluated at provides evaluation, before the inject pipe is hydrated and before cross-node edges are walked, so it may reference only data belonging to its own node: `.context.instance_id`, `.values`, `.infra`, the node's resolved `.locals`, and static strings. The check is a positive allowlist, so any other root halts — `.context.inject` and `.context.uses` (cross-node), `.context.annotations.*`, `.context.labels`, `.context.metadata`, and `.metadata.*` (placement- or deployment-coupled data the provides surface does not expose), and `.attachment_name` (a base Recipe's provides pass resolves no attachment). Referencing one of these halts loudly rather than silently rendering an empty value.

`.locals` is on the surface: a node's locals resolve in the preamble of the same stage, ahead of its provides, so a `provides` template reads them and receives resolved values.

Emitted message:
> provides block references a root outside the self-contained set (`"<expression>"`)

The halt is positioned at the Recipe that declares the entry and at the authored key inside it — `.spec.provides.<name>` — so it names the block to edit rather than the component that bound the Recipe. Every entry that reaches outside the surface is reported in the same build; where more than one does, the findings are grouped under `provides entries that reach outside the data they are evaluated against`.

**How to fix:** refactor the template to pull only from the Recipe's own pillars. If the value depends on another node's output, that dependency belongs in a caller's `uses[].inject` block, not in the target's `provides`. If the value is computed, put the expression in a `locals:` entry and read it from `provides` — the expression then lives in one place. If you were reaching for the deployment namespace (or other placement data) to build a cross-namespace host, publish the bare host here and qualify it on the consumer side with a routing feature — the producer's `provides` must not depend on where it was deployed.

A FeatureRecipe's `provides:` follows the same locals rule: its own `locals:` resolve before its `provides:`, so a FeatureRecipe `provides` entry reads `.locals` too.

### `locals:` entry references a sibling defined later in the same block

<!-- covers: internal/compiler/renderer.ErrLocalsForwardReference -->

A `locals:` block resolves in the order its entries are written, and an entry reads only a sibling defined **above** it. A direct `.locals.<key>` reference to an entry the block defines later halts: the compiler never sorts or reorders the block to make the reference resolve, because emitted output would then follow an inference rather than what was authored. Without the halt the reference would resolve through the missing-key policy to an empty string, so a derived hostname or secret name would silently lose the segment it was built from.

**Both resolutions of a `locals:` block decide this fault, and one of them is pinning.** A block is resolved for two different purposes: so the Recipe's own templates can read it while an artifact is rendered, and so a structured `source:` coordinate can be resolved and the artifact it names pinned. The fault is decided from the declared key order and the authored text, which is everything it needs, so both resolutions reach it and report the same condition — `aggrega pull`, and a build that fills the lockfile, refuse the block exactly as a render does. Two consequences are worth knowing while authoring. The **whole** block is read while a coordinate is resolved, so an out-of-order entry halts even where every `source:` field is literal and reads no local. And a Recipe whose `source:` is a plain string, or which declares no `source:` at all, resolves no coordinate, so on that Recipe the fault is reported when output is rendered.

Emitted message, for an entry in a component Recipe's own `locals:` block. It is positioned at the authored key inside the Recipe, and every offending entry is reported in one build; where more than one is, the findings are grouped under `locals entries that read a sibling they cannot`:
> locals entry references a sibling defined later in the same block (`"<expression>"`, the key it names is `"<referenced>"`, resolved at this point `"<the locals available here>"`, reached through the component `"<component>"`). define `"<referenced>"` above `"<key>"` in the locals block

A self-reference is the same condition — the key is declared and unresolved — and no reordering fixes it, so the message says so in place of the move-it instruction:
> locals entry references a sibling defined later in the same block (`"<expression>"`, the key it names is `"<key>"`, resolved at this point `"<the locals available here>"`, reached through the component `"<component>"`). a locals entry cannot read itself; compute the value from .values and .infra directly

**One Recipe is bound by many components, so one mistake in a shared block is reported once for each component that binds it — and `reached through the component` is what tells those findings apart.** They share a position, because they are all about the same authored entry in the same document; the position is where to edit, and the component name is which of your components each finding stands for. The findings are not merged into one, because merging would say that something is wrong without saying which components it reaches, and that is the part you have to act on.

The same fault in a `locals:` block a Feature's recipe declares reports the same way: positioned at the authored key inside that recipe, named by the component the attachment sits on, and grouped with any sibling entries carrying the same fault. Where the recipe is attached at more than one place, the fault is reported once for each — each attachment binds that block independently, so each is its own occurrence rather than a repeat of one.

Where that shape reports a self-reference, its position clause names the referencing entry itself rather than a later one, because that is where the key sits.

**How to fix:** move the referenced entry above its reader. Reordering a `locals:` block is a behavioural change wherever one entry reads another, so the fix is exactly the reorder the message names. A self-reference — an entry naming its own key — cannot be fixed by reordering; compute the value from `.values` and `.infra` directly instead, which the message says in place of the move-it instruction.

### `locals:` key does not exist

<!-- covers: internal/compiler/renderer.ErrLocalsUnknownReference -->

A template reads `.locals.<key>` for a key the `locals:` block does not declare at all — a misspelling, or a key that was renamed or removed. Every surface that reads the pillar raises this halt: a `locals:` entry, a `provides:` template, a Recipe `source:` template, and the resolution of a structured `source:` coordinate, which reads the whole block to pin the artifact the coordinate names. The locals pillar is an open keyed map, so an unknown key under it passes the root check and would otherwise resolve to an empty string; the halt is what stops that empty value from reaching an emitted artifact.

Emitted message, where the offending reference stands in a `provides:` template:
> template references a key the locals block does not declare (Recipe `<recipe>` provides[`<key>`] references `<expression>`, the locals block declares no `<referenced>`, it declares `<the keys it does declare>`). correct the key name

Emitted message, where it stands in a `locals:` entry itself. It carries the component the block was bound through, for the reason the ordering halt above states — one shared block is reported once per component that binds it, and this is what separates those findings:
> template references a key the locals block does not declare (`"<expression>"`, the missing key is `"<referenced>"`, the block declares `"<the keys it does declare>"`, reached through the component `"<component>"`). correct the key name

**How to fix:** correct the key name to one the block declares; the message lists them. The halt is distinct from the ordering halt above because the remedies differ — no reordering makes a key that does not exist resolve.

Only **direct** `.locals.<key>` references are checked. A key reached indirectly — through `index .locals`, a `with .locals` block, or a variable bound to `.locals` — is not analysed, because recognising the key would mean reading template text and inferring what a computed key means. An absent key reached that way renders as an empty value rather than halting; the indirect form remains the way to reach a key whose name is itself computed.

### Template references a root the render context does not define

<!-- covers: internal/compiler/renderer.ErrTemplateUnknownRoot -->

A template references a top-level root — the first path segment after the leading dot — that its render context does not define: a misspelling such as `{{ .valeus.port }}`, or a root that does not exist on the surface being authored. The check is a positive allowlist over root *names*, and the admitted set is derived from the render context's own shape rather than kept as a separate list beside it, so the set the build refuses and the set the context actually delivers cannot drift apart. The diagnostic names the offending reference and lists the roots that context does define.

The halt fires identically whether the reference is bare or wrapped in a `default`, `if`, `with`, or `range` fallback, and the wrapped spelling is the one that matters most: a wrapper can supply a fallback for an absent *key* under a defined root, but never for an absent *root*, so without this halt the wrapped form would resolve quietly to an empty value and let the build finish successfully. An absent key under a defined root is untouched and still follows the `missingkey=zero` policy for value templates described in "Missing template key" below, so optional-key idioms such as `{{ .values.optional_field | default "fallback" }}` keep working exactly as before.

**The same halt covers a mistyped key one level down, under a pillar whose shape is declared.** Some pillars have a fixed set of keys the compiler defines: `.context`, `.metadata`, `.inject`, `.workload` and `.boundary` on the Recipe and FeatureRecipe render context, and `.manifest` on a path template. A reference to a key one of those pillars does not define — `{{ .context.nmae }}`, `{{ .metadata.typo }}`, `{{ .workload.containres }}`, `{{ .boundary.nmae }}` — halts exactly as a wrong root does, and the diagnostic lists the keys that pillar defines. Other pillars are **open**, because what they hold is keyed data rather than a set the compiler declares — among them `.values`, `.infra`, `.locals`, `.provides`, `.features` and `.steps` on the render context, and `.parameters` and `.parent_boundary` on a path template. An open pillar accepts any key. An absent key under an open pillar is not this halt — it follows the surface's missing-key policy described in "Missing template key" below, so `{{ .values.optional_field | default "fallback" }}` and every other optional-key idiom keep working unchanged.

Which pillars are declared and which are open is a property of the surface, not something a template can influence: the compiler reads it from the shape of the render context it is about to deliver. That is what lets the typo halt and the optional key render on the same template.

Emitted message when the root itself is not defined:
> template references a root the render context does not define (template `<template-name>` references `<dotted-path>`, the render context defines `<the roots that context defines>`)

And when the root is right but a key under a declared pillar is not:
> template references a root the render context does not define (template `<template-name>` references `<dotted-path>`, `<pillar>` defines `<the keys that pillar defines>`)

**How to fix:** correct the reference to one the diagnostic lists — most reports are a misspelling of `.values`, `.infra`, or `.context`, or of a key under `.context` or `.metadata`. Removing the fallback wrapper will not clear the halt, and adding one never suppressed it; the wrapper only ever hid which reference was wrong. If the data genuinely belongs to another node, it reaches this template through the inject pipe — wire it with a `uses[].inject` entry on the consumer and read it from `.context.inject` — rather than through a root of its own.

The check covers every template surface the renderer evaluates, each against the reference set its own surface defines: Recipe and FeatureRecipe `valuesMapping`, `injectMapping`, `workload`, `artifacts:` bodies, `provides:` and `locals:` entries, `source:`, `pipeline` step `when:` and `with:` bodies, `assertions:`, the component-level self-inject `value:` templates in an Aggregate, and the Release boundary path templates (`directory:` / `subDirectory:`). Two of those surfaces name some refusals with their own diagnostic, because the mistake they describe is more specific than "this reference does not exist": a path template reaching for a *variable* it is not given is covered by "Path-template references a variable outside the allowlist" below, and a boundary-scope FeatureRecipe reaching for a per-component pillar by "FeatureRecipe template references a field outside its scope's allowlist". Everything else those two surfaces refuse — including a mistyped key under a pillar they do admit — reports this halt, so no diagnostic tells you your reference is something it is not.

### An `artifacts:` template reads a pillar the Recipe does not declare

<!-- covers: internal/compiler/renderer.ErrArtifactPillarNotDeclared -->

An `artifacts:` entry's template reads `.workload`, or a key beneath it, in a Recipe that declares no `workload:`; or it reads `.source`, or a key beneath it, in a Recipe that declares no `source:`. Both pillars are always present on the artifacts render context — they are roots the surface defines — so the reference is well-formed and the halt is about the *declaration* being absent rather than the reference being wrong. A Recipe that renders a Deployment from its synthesized workload and a Recipe that renders a chart from a source are different shapes, and an `artifacts:` body written for one of them reaches for a pillar the other never fills.

The check runs before the entry is evaluated, and that ordering is what makes the report useful. An absent pillar arrives at the template as an empty value, so left to evaluation the build would either splice nothing into the emitted file or fail with whatever the template engine says about reading a key off nothing — neither of which names the pillar or the missing declaration. Refusing first lets the halt name the exact expression that reached for the pillar, quoted as you wrote it.

A `source:` that is declared but renders to an empty string reads as no source at all, because what the check reads is the source *after* its own template has been evaluated. That is the same value the provider goes on to render from, so a Recipe whose `source:` resolved to nothing has no source to offer an `artifacts:` body either.

Emitted message, in one shape wherever the `artifacts:` entry was written. What varies is not the sentence but the captions after it, which say which document holds the entry.

*Every* offending reference in the template is named, so a body reaching for two absent pillars tells you about both rather than about whichever came first. Each reference is reported at the document that declares the entry, quoted as you wrote it and captioned with the output it belongs to:

> artifact template references a pillar the Recipe does not declare (`<expression>`, artifact `<output-name>`)

The expression names the pillar in its first segment, which is what tells you which declaration is missing: `.source.chart` reaches for `source:`, `.workload.containers` for `workload:`.

**An entry a component's own Recipe declares** is reported against that Recipe's `artifacts:` block.

**An entry a FeatureRecipe declares** — attached to a component as a feature, or declared at a boundary — is checked against the pillars *that* FeatureRecipe declares rather than the host component's, is reported against the FeatureRecipe's `artifacts:` block, and carries one further caption naming the attachment that binds it:

> artifact template references a pillar the Recipe does not declare (`<expression>`, artifact `<output-name>`, attachment `<attachment-name>`)

The attachment caption is what the position cannot say on its own: a component may carry several attachments, and an attachment declared at a boundary reaches every component the boundary holds. The sentence itself names a Recipe on either path; the position and the attachment caption together are what say which document to open.

Where one template names several references, each gets a report of its own beneath a line naming the entry they share, and that line names the document as well:

> artifact `<output-name>` references pillars its Recipe does not declare

> artifact `<output-name>` references pillars the FeatureRecipe attachment `<attachment-name>` binds does not declare

Every one of these reports carries the same halting condition, whichever document it is about, so anything matching on the condition rather than on the text sees no difference between them.

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

Emitted message. The rule that halted the build leads, and the specifics — which capability, which candidates, and the binding to write — follow it:
> capability is served by more than one provider plugin; add a plugins.providers entry to select one: capability `"<capability-name>"` is served by more than one provider plugin (`<plugin-1>, <plugin-2>`); add a plugins.providers entry for `"<capability-name>"` selecting one

**How to fix:** add a `plugins.providers` entry in the workspace config keyed by the capability, whose value selects the plugin identity that renders it. Keep both plugins in the federated catalog; the binding tells this workspace which one to dispatch to for the contested capability.

### The plugin serving a provider cannot assemble what that provider combines

<!-- covers: internal/compiler/renderer.ErrBoundaryAssemblerMissing -->

A provider states what becomes of a dispatch group's per-node output: each node's output written straight out at the dispatch path, the fragments folded into one document, or each node placed under its own position inside one enclosing structure. Where a provider states that the output is combined — a merged compose file, an umbrella chart — the plugin serving it has to offer the export that does the combining. This halt fires where it does not: the plugin advertises per-node rendering (`render_node`) and no matching `assemble_boundary`, so the group's nodes can be rendered and their output cannot be merged.

Both halves of that disagreement belong to the plugin. What becomes of a dispatch group's output is part of what the plugin reports about itself when it is loaded, and the export that would do the combining is one of the entries under a Plugin entity's `spec.exports`, cross-checked against that same report — so the halt names a plugin claiming an assembly its export surface does not provide.

The build halts rather than skipping the assembly. Skipping it would write each node's fragment at the path one artifact was expected at and report success, and nothing further along can tell those fragments from the flat per-node output a provider claiming no assembly emits by design — so a missing artifact would surface wherever the output is applied rather than at build time.

A dispatch group at no dispatch path is passed over. Output written at no path is per-node output, so nothing is assembled there for a claim about combining to govern.

Emitted message — one finding per offending dispatch group, naming the provider and the path that group assembles at:
> provider expected to assemble its dispatch group provides no boundary assembler (`"<provider>"`, dispatch path `"<path>"`)

Where more than one dispatch group is offending, the findings arrive together under the report `dispatch groups whose provider offers no boundary assembler`.

**How to fix:** serve the capability with a plugin that advertises both `render_node` and `assemble_boundary` — see [../entities/plugin.md](../entities/plugin.md) for the `spec.exports` authoring surface, and [../schema/plugins/wasm-provider.md](../schema/plugins/wasm-provider.md) for what the assembly export receives. Where you author the plugin, the two sides are yours to line up: add the assembly export, or report no assembly claim and let each node's output land at the dispatch path unmerged. Where you consume a published plugin, select a version that offers both exports, or select a plugin whose provider claims no assembly for that capability.

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

Two boundaries whose path declarations evaluate to the same assembly path route through **different providers**. Both assemble there, and each writes files the other knows nothing about, so one silently displaces the other on disk — and the build that produced the displaced output looks as though it succeeded.

The default `subDirectory:` gives each provider a sub-path of its own, so two providers reach one path only where the declarations were written to evaluate alike: two boundaries sharing a `directory:` and both pinning `subDirectory:` to the same literal, say.

**Emitted messages.** One finding is reported per contributing boundary, so every boundary whose output reached the path is named on its own rather than folded into a list inside one message. The fault is two providers meeting at one path, so there are always at least two findings, and they arrive together under a report stating what they have in common:
> assembly paths reached by more than one provider

Each finding names the path, the boundary whose output reached it, and the provider that boundary routes through:
> dispatch path produced multiple provider outputs (`"<path>"`, boundary `"<boundary>"`, provider `"<provider>"`)

A build whose `api-net` and `db-net` boundaries both declare `directory: ./dist/shared` and `subDirectory: merged`, one routing through `helm` and the other through `compose`, prints:

```text
[OPS_ERROR E0048]
  assembly paths reached by more than one provider
  caused by (2):
    [OPS_ERROR]
      dispatch path produced multiple provider outputs ("dist/shared/merged", boundary "db-net", provider "compose")
  ---
    [OPS_ERROR]
      dispatch path produced multiple provider outputs ("dist/shared/merged", boundary "api-net", provider "helm")
```

The report carries the short code and each finding beneath it carries its category alone, which is the shape every collected-failure report uses — see [error-translation.md](error-translation.md) for that grammar.

**How to fix:** either give each boundary a distinct `directory:` (so they assemble to separate paths), or leave `subDirectory:` at its default so each provider's output lands at a sub-path of its own. The compose-bridge pattern intentionally collapses two sub-boundaries into one assembly path; that pattern requires both boundaries to target the same provider and to carry compatible cascade-resolved annotations.

### Instance-ID collision across boundaries assembling to the same path

<!-- covers: internal/compiler/renderer.ErrInstanceIDCollision -->

Two boundaries that assemble to the same per-(path, provider) tuple contribute components with identical instance IDs. The merged assembly cannot disambiguate the two component fragments — a single Helm chart cannot carry two Deployments named `web-server`, and a single docker-compose file cannot carry two services named `api`.

Emitted message:
> multiple contributors share an instance ID at the same dispatch path: dispatch path `"<path>"` provider `"<provider>"` already contains node `"<instance-id>"` (contributing boundaries: `[<boundaries>]`); component instance IDs must be unique within an assembly group

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

Most such names are a provider's own, derived from the component instance and the resource, so two components can arrive at one name whenever the parts they are derived from agree — and one component can arrive at one name twice the same way, when two of its own resources are built from parts that agree. Because the name lives in the file's own bytes, the assembly cannot see it: the provider reports the names it derived, and the build compares them.

One kind of name is the build's own rather than a provider's, and it is reported the same way: the identity a FeatureRecipe's generated resources are named and labelled by, which reaches your output as the `aggrega.ai/component-id` label. It is reported under the kind of name `component-id`, so you can find the same string in your own emitted output. The two attachment sites build it differently, and only one of them can reach this halt in ordinary authoring.

For a feature attached to a **component** it is built from the attachment's own name — the key you wrote under `features:` — written into the characters a label value may carry. Writing a name into a narrower set of characters can only lose information, so two attachment keys differing solely in what that step removes reach one identity, and that is the case the bounds below are about.

For a feature attached to a **boundary** it is composed from the feature's name and the boundary's path rather than written through that narrowing, so a character the label alphabet refuses is written out rather than replaced and two boundary attachments you can tell apart always reach two identities. The one residue is length: a composed identity too long for a label value is shortened around a digest of the whole of it, and two shortened identities can in principle meet, at which point this halt is what reports it. See [`../providers/well-known-annotations.md`](../providers/well-known-annotations.md) for how each is built.

Nothing about a name's meaning is interpreted — two reported names are either the same text or they are not — which is why the same report covers every kind of name, whoever derived it.

A name can appear in more than one report for one component, because each part of a component is reported as it is rendered. That is one resource named in each report it belongs to, not a name used twice, and it does not halt. What halts is a single report carrying one name twice, because that report describes output where the name is genuinely used twice.

That reading turns on what counts as one contributor, and for the `component-id` kind the answer is the attachment rather than the component or the boundary it sits on. An attachment is identified by both coordinates you wrote for it — the component it is attached to together with the key under `features:`, or the boundary path together with the name at that boundary — so two attachments on **one** component are two contributors, exactly as two on different components are, and one feature name written at **two** boundaries is two contributors even though the name is the same at each. Two attachments reaching one identity therefore halt in every one of those arrangements, and each finding names both of its coordinates so you can tell which two things to separate. Where the two sit on one component and their keys differ only in a character the label step removes, give them names that differ in a letter or a digit rather than only in punctuation or spacing.

The other direction of that bound is a halt you will meet in ordinary authoring, so it is worth stating outright: the identity is built from the attachment's name and not from the component it sits on, so attaching a feature under the **same name** on two components makes both reach one identity, and a build halts wherever that feature's FeatureRecipe generates resources. Attaching one feature type to several components is entirely supported — give each attachment its own key, `metrics-api` and `metrics-web` rather than `metrics` on both, and each component's generated resources get an identity of their own. A feature whose FeatureRecipe builds no resources of its own — one that only injects, or one that only vendors a source and renders it as it stands — puts no identity of its own on anything emitted, so there is nothing to compare for it and one name may be reused across components freely.

The build halts rather than keeping one and discarding the other. There is no correct silent resolution: keeping the first would drop a resource you declared out of the output entirely and leave the build reporting success, and anything that referenced the dropped one would quietly resolve to the surviving one instead. Every colliding name is reported, each with the kind of name it is and with every contributor that derived it named — so one build tells you the whole picture rather than one collision at a time. A contributor whose own output carries the name twice is named as having derived the name more than once, which is what tells you the two things to separate are inside that one component rather than between two of them.

**Emitted messages.** One finding is reported per contributor per colliding name, so every contributor that derived the name is named on its own rather than folded into a list inside one message. Where two contributors derived the name there are at least two findings, and they arrive together under a report stating what they have in common:
> dispatch groups whose contributors derive one name more than once in one key space

Each finding names the name, the kind of name it is, the contributor that derived it, and the provider and path of the assembly their output merges into:
> derived name collision: one name is derived more than once in one key space (`"<name>"`, key space `"<kind-of-name>"`, derived by component `"<contributor>"`, provider `"<provider>"`, dispatch path `"<path>"`)

The contributor is named for what it is, which is what says where its name is written: `derived by component` for a component instance, and `derived by feature` for a feature attached to a boundary.

Where the contributor's own name does not identify it on its own, a second coordinate follows, and which one it is depends on the kind. A feature attached to a boundary carries the boundary's path, because one feature name may be written at more than one boundary:
> derived name collision: one name is derived more than once in one key space (`"<name>"`, key space `"<kind-of-name>"`, derived by feature `"<feature-name>"`, attached at boundary `"<boundary-path>"`, provider `"<provider>"`, dispatch path `"<path>"`)

A component carries the key of the attachment whose render derived the name, because a component carries one attachment per key you wrote:
> derived name collision: one name is derived more than once in one key space (`"<name>"`, key space `"<kind-of-name>"`, derived by component `"<component>"`, carrying attachment `"<attachment-key>"`, provider `"<provider>"`, dispatch path `"<path>"`)

A component's own rendering — a name its provider derived for the component itself rather than for one of its attachments — carries no second coordinate, so the finding ends at the component's name.

Where a single contributor's own output carries the name twice, that one contributor is the only finding, so it arrives on its own with no report above it — and it is named as having derived the name more than once, rather than as having met another contributor:
> derived name collision: one name is derived more than once in one key space (`"<name>"`, key space `"<kind-of-name>"`, derived more than once by component `"<contributor>"`, provider `"<provider>"`, dispatch path `"<path>"`)

The second coordinate follows the contributor here on the same terms as above, so a repeat inside one attachment's own output names that attachment rather than only the component carrying it.

**How to fix:** where two contributors are named, rename one of them in the Aggregate, so the names derived from it no longer agree with the other's. Where the kind of name is `component-id`, each finding already names the thing to rename: `carrying attachment "…"` is the key under that component's `features:` block, and a `feature "…"` `attached at boundary "…"` is the name under that boundary's `features:` block. Where the two findings differ only in the boundary they name, the two attachments carry one name at two boundaries — rename one of them, or give the two boundaries distinct `directory:` paths so their output no longer merges. In every case make the two differ in a letter or a digit rather than only in punctuation or spacing, since punctuation is what the label step removes. Where both names are derived from something you set explicitly — a value the Recipe feeds the provider, or an annotation the provider reads — change that instead on whichever of the two you control. Where the two contributors genuinely belong to separate outputs, give their boundaries distinct `directory:` paths so each assembles on its own and the two names never meet. Where a single contributor is named as having derived the name more than once, the two colliding things are both inside that one component: find the two resources its Recipe produces whose names agree, and change what one of them is named after — the key it is declared under, or a value it is built from — so the provider derives a distinct name for each.

### An authored export name is one the build derives for a cross-stack reference

<!-- covers: plugins/internal/cfncore.ErrLinkExportNameShadowed -->

A cloudformation Recipe's `Outputs:` block is authored CloudFormation, and an entry in it may carry its own `Export:` with a `Name:`; that name reaches the assembled stack exactly as written. Separately, when a `uses` edge crosses from one boundary to another, the provider publishes the consumed value as a stack `Output` with an `Export` under a name it derives from the release, boundary, component, and provided key. This halt fires where the two meet: the name you wrote is the name the derivation produced for the same build, so the stack would declare one export name twice from two places, and an export name has to be unique.

Only the coincidence halts. Declaring an export name on an `Outputs` entry is supported, and one matching no derived name publishes alongside the derived ones without comment.

The halt gives the derived export name together with the four parts it was built from, so you can see which cross-boundary reference produced it, and it names the stack output your declaration sits under — marked as a name the provider assembles rather than one a Recipe wrote, because building that name drops every separator and capitalises each word, so several differently-written entries reach one of them and none can be read back out of it. **The export name is the part to search for.** Your entry spells it exactly as the halt does, which is what makes the two a collision, so it is the one string that appears both in the message and in your own files.

The comparison is scoped to one stack: the export names that stack declares, against the names derived for the cross-boundary references publishing into it. Two stacks are not compared against each other, and an export name written as a CloudFormation intrinsic resolves at deploy time, so there is no name to compare. What a name meets among the exports already deployed into an account and region is a property of the deployment, which a build does not observe.

Emitted message — the publish's own detail; the surrounding report also names the `uses` edge being wired:
> cloudformation-provider: an export name a cross-boundary link derives is already declared by another Outputs entry in the same stack: the link derives the export name `<export-name>` for provides key `<provides-key>` of component `<component>` in boundary `<boundary>` of deployment `<deployment>`, and another Outputs entry of the same stack already declares that same export name — that declaration sits under the stack output `<stack-output>`, a name this provider assembles rather than one a Recipe wrote; each shadowing Outputs entry spells its export name exactly as the halt does, so searching your Recipes for that name reaches the entry — rename the export name the entry declares, or remove that entry's Export block and let the link publish the export

**How to fix:** search your Recipes for the export name the halt names — the `Outputs` entry declaring it spells it identically — then either rename that export name so it no longer matches, or remove that entry's `Export:` block and let the cross-stack wiring publish the export itself. Removing it is usually the right move where the entry existed to export the same value the edge consumes: the provider publishes an `Export` for that value anyway, so the authored one adds nothing. Keep the authored `Export:` and rename it instead where the entry exports the value for a different consumer that imports it under a name you chose.

### Chart-name mismatch on a merged helm-chart umbrella

<!-- covers: internal/compiler/renderer.ErrChartNameMismatch -->

Two or more boundaries contribute to the same `helm-chart`-provider assembly path but their effective `aggrega.ai/chart-name` annotations (resolved through the boundary annotation cascade) do not agree. A Helm umbrella chart has exactly one chart name; the renderer cannot pick one of the conflicting candidates.

**Emitted messages.** One finding is reported per contributing boundary, each carrying the value that boundary resolved to, so the disagreeing names arrive one to a finding rather than as one printed collection. The report they arrive under states what they have in common:
> merged dispatch groups whose boundaries disagree on the assembly name

Each finding names the value that boundary resolved to, the annotation it was read from, the boundary, the provider, and the path they merge to:
> merged-path assembly has conflicting assembly-name annotation values (`"<value>"`, annotation `"<annotation>"`, boundary `"<boundary>"`, provider `"<provider>"`, dispatch path `"<path>"`)

**How to fix:** declare a matching `aggrega.ai/chart-name` annotation on every contributing boundary (the cascade mechanism makes this DRY when the contributors share a parent boundary — declare once on the parent), or split the boundaries onto separate `directory:` paths so each gets its own umbrella chart.

### FeatureRecipe template references a field outside its scope's allowlist

<!-- covers: internal/compiler/renderer.ErrFRTemplateInvalidField -->

A FeatureRecipe with `executionScope: boundary` references a per-component-only field such as `.context.instance_id`, `.context.inject`, or `.context.uses` — fields that have no meaningful value at boundary scope. The mirror condition holds: a component-scope FeatureRecipe (the default) referencing `.boundary.*` fields fails the same validator. Validation runs at parse time against the relevant scope's field allowlist before any rendering work begins.

Emitted message:
> FeatureRecipe template references a per-component-only field with executionScope: boundary: FeatureRecipe `<name>` with `executionScope: boundary` references per-component-only field `<dotted-path>` in `<label>`; boundary-scope FRs use `.boundary.*` pillars in place of `.context.*` / `.workload` / `.attachment_name` / `.inject` — see the FeatureRecipe entity reference

**How to fix:** rewrite the template against the scope's available fields, or change the FeatureRecipe's `executionScope`. Boundary-scope FRs reference `.boundary.path`, `.boundary.boundary_name`, `.boundary.components`, the `.boundary.*_uses_edges` collections, `.boundary.labels`, `.boundary.annotations`, and `.boundary.feature_attachments`. Component-scope FRs reference `.context.instance_id`, `.context.inject`, `.context.uses`, `.context.labels`, `.context.annotations`. Both scopes share `.values`, `.infra`, `.locals`, `.provides`, `.steps`, and `.metadata`. A Release parameter is not a pillar of its own on this surface — it reaches a FeatureRecipe template through a `values` or `infra` entry that references it.

### Self-inject value template references cross-node data

<!-- covers: internal/compiler/renderer.ErrTemplateUnknownRoot -->

A component-level `inject:` `value:` template pulls from `.context.inject` or `.context.uses`. The inject pipe is what this pass is constructing — a template inside a component's own self-inject value cannot read from it.

The surface's `.context` is what makes this so: it carries `instance_id`, `labels` and `annotations`, and nothing else. `.context.inject` and `.context.uses` are therefore keys this surface's context does not define, and the reference halts as "Template references a root the render context does not define" above, at parse time, before anything renders. The diagnostic names the mechanism and delivery key the template belongs to, and lists the keys `.context` does define here — so the same report covers a genuine reach for cross-node data and a plain misspelling such as `{{ .context.nmae }}`, which is the commoner mistake and would otherwise have rendered as nothing.

Emitted message — the reference-level detail; the surrounding report also names the node, the mechanism and the delivery key:
> template references a root the render context does not define (template `self-inject.<mechanism>[<key>]` references `.context.inject`, `.context` defines `.context.instance_id`, `.context.labels`, `.context.annotations`)

Every frame of the report is in the developer domain, because a component-level `inject:` block is authored in the Aggregate.

**How to fix:** move the cross-component wiring into a `uses[].inject` entry — that is where cross-node context is available. Keep component-level self-inject `value:` templates closed over the component's own `values` and `infra`, its `.context.instance_id` / `.context.labels` / `.context.annotations`, and `.metadata`.

### Missing template key — asymmetric policy

Missing-key handling depends on the template surface. Where an empty rendering lands somewhere bounded — a manifest field the author can read back — the miss is tolerated and the read renders nothing. Where an empty rendering would instead produce a wrong *structure* or a wrong *verdict*, the surface refuses the reference rather than resolve it to nothing.

- **Path templates** (Release boundary `directory:` / `subDirectory:`) evaluate with `missingkey=error`. A reference to a variable the surface does not give them halts at parse time — see "Path-template references a variable outside the allowlist" above — and so does a mistyped key under `.manifest`, whose keys are declared. An allowed-but-undefined-at-eval-time reference, such as a `.parameters` key the Release does not supply, produces an explicit error rather than silently rendering an empty string into a directory path.
- **`assertions`** (on a Component, Feature, Recipe, or FeatureRecipe) evaluate with `missingkey=error`. A reference to an undefined key halts with a no-such-key diagnostic naming the entity, the instance, and the assertion. The strictness is what makes an assertion trustworthy: a predicate whose reference rendered as an empty value would compare against nothing and pass, so a single typo would silently retire the rule the assertion was written to enforce. Because the bare reference halts before any fallback can run, a plain `default` does not supply an optional-field fallback on this surface — gate the reference with `hasKey`, or read it through `index` and then apply `default`, or use the `optional` helper, which performs the presence check directly.
- **Value templates** (Recipe `valuesMapping`, `locals:` and `provides:` entries, `artifacts:` bodies, Workload bodies, FeatureRecipe `injectMapping` and `pipeline.with`, and component-level self-inject `value:` templates) evaluate with `missingkey=zero`, so a reference to an undefined key does not halt the build — the read renders nothing, and nothing is what reaches the artifact. What *does* still halt on this surface is a reference that descends **through** a container the author never supplied — `.values.tls.ca` where no `tls` was authored — because there is nothing to descend into. Only the final key of a reference whose containers are all present renders as nothing. Guarding works as expected: `{{ .values.optional_field | default "fallback" }}` does supply the fallback, because an unset value counts as empty for `default` and falsy for `if`. Authors who need the absent-vs-zero discriminator — telling "key absent" from "key present and empty" — use the `optional` helper documented at [`templates/sprig-functions.md`](../templates/sprig-functions.md), and read a given key one way per template: a key the same template also reads as `.values.<key>` counts as present, so `optional` reports its empty value rather than the fallback.
- **A `source:` coordinate** — the templated fields of a structured `source:` block on a Recipe or FeatureRecipe (`version`, `ref`, `chart`, `module_subdir`) — evaluates with `missingkey=error`. A reference to a key nothing supplies halts naming the source field, rather than resolving to nothing: an empty version or ref would pin a different artifact from the one the author named, and the pin is what every later build reproduces. This surface is also where the available function set differs, and where a `locals:` reference the block's own author order refuses halts before anything is evaluated — see below.
- **Typed parameter contracts** catch missing-required-parameter and contract-violation cases at the parameter-contract layer with `ErrParameterContractViolation` / `ErrParameterMissing` — see "Parameter type mismatch / contract violation" above.

The **helper set is the same across value templates, path templates and assertions**: Sprig's functions plus Aggrega's `optional`, with `fail` added on the assertion surface because an assertion is the only surface whose purpose is to halt the build rather than produce text. Between those three what differs is the missing-key policy — `optional` is available in a path template too, where it reads a key out of `.parameters` without the strict policy firing first. Resolving a `source:` coordinate differs in the function set itself, and has its own subsection below. Parameter interpolation in an Aggregate is a separate, earlier surface: it runs before the catalog resolves and offers Sprig's functions alone, so `optional` is not available there.

Path-template missing-variable emit shape:
> path template references a field not in the documented allowlist: boundary `<boundary-name>` references unknown field `<dotted-path>`; allowlist: see aggrega-docs/language-reference/path-template-variables.md

**How to fix:** for path-template misses, correct the field name to one in the allowlist documented at [`path-template-variables.md`](../path-template-variables.md). For an assertion miss, correct the reference — most reports are a misspelled key — or, where the field is genuinely optional, gate it with `hasKey`, read it through `index` before applying `default`, or use the `optional` helper; wrapping the bare reference in a `default` will not clear the halt, because the reference resolves before the fallback runs. For value-template misses where empty rendering is undesired, use the `optional` helper or supply the missing key as a typed `parameters.*` declaration on the Aggregate with a Release value, as an upstream Component's `provides:` entry wired through `uses[].inject`, or as a `locals:` entry on the same entity.

#### Resolving a `source:` coordinate registers a narrower function set

A structured `source:` block is resolved so the artifact it names can be pinned, and that resolution registers **Aggrega's `optional` and nothing else** — Sprig's functions are not available on it. Of the surfaces a Recipe or FeatureRecipe authors templates on, this is the one whose function set differs, so an expression that renders correctly elsewhere in the same Recipe can be refused here. Calling a Sprig function in a `source:` field, or in a `locals:` entry on the same entity, halts at parse time; the message names the entity, the entry, and the function it could not resolve:

> resolve: parse template at `<name>:<version>`.spec.locals.`<key>`: resolve: source-template evaluation failure at lock time (also resolve: source-template parse error) (cause: template: `<name>:<version>`.spec.locals.`<key>`:1: function `"<function>"` not defined)

**The reach is the whole `locals:` block, not only the entries the coordinate reads.** Every `locals:` entry on an entity with a structured `source:` is resolved as part of resolving that coordinate, so a Sprig call in any entry halts even where the `source:` fields are entirely literal and read no local at all. The entry the halt names is the offending one, so the report still points at the line to change.

**Two shapes sit outside this surface**, and knowing which one a Recipe is in explains why the same expression is accepted in one Recipe and refused in another:

- **A `source:` written as a plain string** — a URI or a local path rather than a mapping — is taken verbatim, so it has no fields to evaluate and the `locals:` block is not resolved here at all.
- **An entity declaring no `source:`** resolves no coordinate, so its `locals:` block is resolved only for that entity's own rendering, where the full function set applies.

**The reference-order contract is the same here, and that is the more consequential half.** Resolving a coordinate reads the whole `locals:` block, and it refuses the same references a render refuses: an entry reading a sibling the block declares below it, and any template reading a key the block does not declare. Both report the conditions documented above under "`locals:` entry references a sibling defined later in the same block" and "`locals:` key does not exist" — the same condition, with the same remedy, whichever resolution reached it first. So a block whose entries are in the wrong order is refused when the artifact is pinned, before any build renders it.

**What this surface does pass over is an entry a coordinate genuinely cannot resolve**: one reading data that exists only while an artifact is rendered, `.context.instance_id` being the case it is there for. Such an entry is skipped and the coordinate resolves from its own fields, so a Recipe carrying one is still pinned. Where the coordinate itself needed that entry, the resolution halts naming the `source:` field rather than the `locals:` entry — the missing-key report described for this surface above — because what cannot be produced at that point is the coordinate.

**Where the halt surfaces:** while the lockfile is being filled or refreshed — `aggrega pull`, or a build that fills it (`--auto-pull`, `--upgrade`, or the workspace `auto_pull` setting). A missing key on a `source:` field, as against an unavailable function, reports the same condition at execution rather than parse time, naming the field and the key it could not read.

**How to fix:** `optional` is registered on this surface *and* on every value template, path template and assertion, which makes it the portable choice — `{{ optional .values "chart_version" "25.0.8" }}` in place of `{{ default "25.0.8" .values.chart_version }}`. Read the semantic difference before substituting: `optional` fires on the key being **absent**, while `default` fires on the value being **empty**, so a key authored as an empty string or a zero keeps its authored value under `optional` and is replaced under `default`. Where the expression genuinely needs a Sprig function — reshaping a string rather than supplying a fallback — write it on the surface that consumes it (`valuesMapping`, a Workload body, an `artifacts:` entry) rather than in `locals:`, so that a `source:`-bearing entity's `locals:` block holds only expressions this surface can evaluate.

## Conditions that do not halt a build

Every condition above stops a build. A few conditions carry a short code and a message of their own without ever stopping one, and they are catalogued here so that a code you have in hand always resolves to something, whichever page you arrived from.

They fall into three kinds, and the difference is worth knowing before you go looking for a fix.

- **An advisory.** The build reports it and carries on, and the rendered output is the same whether or not you act on it. Each is taught in full on [warnings.md](./warnings.md) — what makes it fire, where in the compilation it is read, what it prints, and what to do about it — and the entries below say which section, rather than repeating it here.
- **A condition the editor absorbs.** It is answered by the editor integration itself and reaches neither a build's output nor a diagnostic.
- **A safeguard behind an earlier refusal.** The rule it protects is enforced ahead of it by a condition that does halt, so a build meets the earlier one first.

### An annotation binding declares one path in both pillar lists

<!-- covers: pkg/resolver.ErrAnnotationBindingPillarOverlap -->

An advisory. A Manifest annotation binding names the same dotted path in both its `maps.infra` and its `maps.values` list. Declaring the overlap is legal and the compiler does not police it: the routing tie-break deterministically sends the path through `infra`, which leaves the `values` side of that path unreachable from the Aggregate.

Its message opens:
> annotation binding declares one path in both pillar lists

It is what warns you before a build meets the halt described under "An annotation routes through a pillar its authoring side may not use" above — the advisory is the early surface, that halt is the enforcement one. The lint is taught under "Binding-map-overlap lint" in [warnings.md](./warnings.md).

### An attachment name is one edit from a declared slot

<!-- covers: pkg/resolver.ErrAttachmentSlotNearMiss -->

An advisory. A component attaches a Feature under a name that is not one of its type's declared slots but sits within a single edit of one — the shape a slot-name typo takes. An attachment under a name no slot declares is legal, so nothing halts; what the advisory names is the consequence, which is that the attachment is a free attachment rather than a fill of the slot you meant, and the slot stays empty.

Its message opens:
> attachment name is a near miss for a declared slot

Taught under "Attachment-slot near-miss lint" in [warnings.md](./warnings.md), with the pairing threshold and what it deliberately does not catch.

### A `uses:` socket name is one edit from a declared socket

<!-- covers: pkg/resolver.ErrUsesSocketNearMiss -->

An advisory. A component's own `uses:` block names a socket its type does not declare but which sits within a single edit of one. A developer owns their application's topology and may name a socket the catalog did not anticipate, so an undeclared socket name is legal on that surface and nothing halts. What the advisory names is the consequence: the misspelled name draws an ad-hoc connection of its own, carrying no selector and no per-edge contract, while the socket you meant stays unwired.

Its message opens:
> uses socket name is a near miss for a declared socket

Taught under "Uses-socket near-miss lint" in [warnings.md](./warnings.md). The two neighbouring surfaces where an undeclared socket name **does** halt are covered under "`uses:` socket not declared in the target's `usesSchema`" above.

### A Recipe publishes a `provides` key its Component does not declare

<!-- covers: pkg/resolver.ErrProvidesKeyNotDeclared -->

An advisory. The Recipe bound to a component publishes a key under `provides:` that the component's type does not declare in its `spec.schema.provides:` contract. Publishing more than the Component declares is legal and stays legal — the contract is subset-required and superset-permitted. What the advisory names is a consequence that is invisible from either side: a consumer reading across a `uses:` edge sees the target's **declared** contract, not whatever its Recipe emits, so an undeclared key is not delivered and a consuming template reading it renders empty.

Its message opens:
> Recipe publishes a provides key its Component does not declare

The opposite case is not advisory: a Component declaring a key its Recipe does not publish leaves the contract unfulfilled and halts. Taught under "Undeclared-provides-key lint" in [warnings.md](./warnings.md).

### A declared parameter is read by nothing

<!-- covers: pkg/resolver.ErrUnreadParameter -->

An advisory. An Aggregate declares an entry under `spec.parameters:` and no `{{ .parameters.<key> }}` reference in that Aggregate's own text reads it, so whatever a Release supplies for it, the rendered output is the same. The compiler does not police which knobs an author exposes, and a parameter may legitimately be declared ahead of the reference that will read it, so this advises rather than halting.

Its message opens:
> declared parameter is read by no reference in the Aggregate

Taught under "Unread declared-parameter warnings" in [warnings.md](./warnings.md), including why a default is not an exemption and which references the reading can and cannot see.

### An editor position falls outside the document

<!-- covers: pkg/yamlpos.ErrPositionOutOfRange -->

A condition the editor absorbs. Editor features that depend on where your cursor is — go-to-definition, hover, completion — locate the cursor inside the document's parsed structure first. This condition is what that step reports when the position addresses a line the document does not have, which happens transiently while an edit is in flight and the position the editor sent was measured against text the document has already moved past.

Its message reads:
> position out of range

**It reaches no build and no diagnostic.** Every feature that can meet it answers with no result rather than surfacing an error, which is the behaviour the editor protocol asks for: a request that cannot be answered returns nothing, and the editor asks again after the next keystroke.

There is nothing to fix in your files, and nothing appears in a build. A feature that stays unresponsive rather than recovering on the next edit is worth reporting as a defect.

### The schema-merge walk's own chain safeguards

<!-- covers: pkg/validator/merger.ErrCyclicExtension, pkg/validator/merger.ErrMaxDepth, pkg/validator/merger.ErrMergeInvalid -->

Safeguards behind an earlier refusal. When a Component or Feature extends another and both declare schemas, those schemas are combined into one. The walk that does the combining carries its own guards against a chain that loops, a chain deeper than ten levels, and an input it cannot merge structurally:

> merger: cyclic extends chain

> merger: extends chain exceeds maximum depth

> merger: invalid merge input

**A build does not reach them, because the rule each protects is enforced earlier.** An `extends:` chain is walked and checked before any schema is combined, so a loop is refused there — see "Cyclic extends chain" above — and so is a chain past the depth bound, under "An `extends:` chain cannot be assembled". By the time schemas are merged, the chain has already been established as finite, acyclic, and complete.

They are catalogued because they are declared and carry codes of their own, so a code in hand resolves. Nothing you can author produces one, and meeting one would mean the earlier refusal did not run — worth reporting as a defect rather than working around.

## Finding a halt from the short code the build printed

A halting diagnostic's bracketed head names the category the failure is attributable to and, where the failure names one of the conditions catalogued here, that condition's **short code** — the letter `E` and four digits, as in `[CATALOG_ERROR E0209]`. A number is handed out once and then fixed, so a short code you paste into a report or a search still names the condition it named when you recorded it. The other two identifiers a condition carries, and which of the three to reach for when, are taught in [sentinels.md](./sentinels.md).

The condition's own message line opens with a **fixed sentence** stating the condition. Everything after that sentence varies with the occurrence — the document at fault, the authored key, the offending value, and the advice for that occurrence — and the entries above quote the whole shape for the condition each one documents. The fixed sentence is the part that is the same every time, which is what makes it the part to match on.

The table below pairs the two, scoped to this page: for every condition catalogued here, the short code a build prints and the sentence its message line opens with, against the entry above that explains the authoring fix. Entry headings are quoted exactly, so searching this page for one lands on its entry. [The table of every condition](./sentinels.md#every-condition-by-short-code) resolves a short code over every condition the compiler declares, including those no entry here covers.

Where one entry appears against two short codes, it covers two distinct conditions and each registers its own sentence; read the sentences rather than the shared heading to tell which one a build reported.

<!-- BEGIN GENERATED: halt-condition-sentences -->
| Short code | Opens with | Documented under |
| --- | --- | --- |
| `E0003` | `malformed attachment requirement` | Malformed attachment requirement |
| `E0006` | `required attachment slot unfilled` | Required attachment slot not bound |
| `E0007` | `selector violation` | Cross-node type safety violation via `selector:` |
| `E0013` | `feature type mismatch between Aggregate and Release` | Feature type mismatch between Aggregate and Release |
| `E0015` | `uses-edge inject dictates a delivery mechanism the socket does not permit` | `uses` edge dictates delivery on a socket that allowlists none; `uses` edge dictates a delivery mechanism outside the socket's allowlist |
| `E0029` | `artifact template references a pillar the Recipe does not declare` | An `artifacts:` template reads a pillar the Recipe does not declare |
| `E0032` | `assembled output collision: two contributors write the same output path` | Two contributors write the same output path |
| `E0035` | `provider expected to assemble its dispatch group provides no boundary assembler` | The plugin serving a provider cannot assemble what that provider combines |
| `E0036` | `merged-path assembly has conflicting assembly-name annotation values` | Chart-name mismatch on a merged helm-chart umbrella |
| `E0038` | `derived name collision: one name is derived more than once in one key space` | The same name is derived more than once inside the output |
| `E0039` | `FeatureRecipe template references a per-component-only field with executionScope: boundary` | FeatureRecipe template references a field outside its scope's allowlist |
| `E0041` | `multiple contributors share an instance ID at the same dispatch path` | Instance-ID collision across boundaries assembling to the same path |
| `E0042` | `locals entry references a sibling defined later in the same block` | `locals:` entry references a sibling defined later in the same block |
| `E0043` | `template references a key the locals block does not declare` | `locals:` key does not exist |
| `E0048` | `dispatch path produced multiple provider outputs` | Path collision: two contributors emit at incompatible paths |
| `E0049` | `path template references a field not in the documented allowlist` | Path-template references a variable outside the allowlist |
| `E0057` | `provides block references a root outside the self-contained set` | `provides:` template references a non-self-contained root |
| `E0059` | `duplicate delivery key across self-inject and uses-inject` | Duplicate delivery key across inject sources |
| `E0060` | `template references a root the render context does not define` | Template references a root the render context does not define; Self-inject value template references cross-node data |
| `E0061` | `unknown provider` | Unknown provider |
| `E0066` | `uses edge target does not exist` | Dangling `uses` target |
| `E0068` | `max sub-aggregate nesting depth exceeded` | Sub-aggregate nesting depth exceeded |
| `E0071` | `release edge retargets a developer-declared edge` | Release retargets a developer-declared edge |
| `E0074` | `release per-edge configuration has no edge to apply to` | Release per-edge configuration has no edge to apply to |
| `E0089` | `every published version this reference could select has been withdrawn` | Every version a reference could select has been withdrawn |
| `E0090` | `format is advertised by more than one importer plugin` | A parse or import format is advertised by more than one plugin |
| `E0091` | `format is advertised by more than one parser plugin` | A parse or import format is advertised by more than one plugin |
| `E0092` | `capability is served by more than one provider plugin; add a plugins.providers entry to select one` | A capability is served by more than one provider plugin |
| `E0093` | `manifest maps multiple version-distinct keys to the same base type; the type-to-recipe lookup is ambiguous` | A Manifest maps two version-distinct keys onto one type |
| `E0094` | `duplicate entity identity within a single catalog directory` | Two catalog entities in one directory share an identity |
| `E0095` | `malformed recipe reference in a Manifest mapping value` | Manifest mapping value carries more segments than a recipe reference accepts |
| `E0096` | `manifest mapping entry's recipe spec.implements does not match the mapped component-type / feature-type key` | Recipe `implements` does not match the mapped component type |
| `E0097` | `no importer plugin advertises the requested format` | No plugin advertises a requested parse or import format |
| `E0098` | `no parser plugin advertises the requested format` | No plugin advertises a requested parse or import format |
| `E0099` | `no recipe resolved for component/feature instance: add an explicit Manifest mapping for its type` | No Recipe is mapped for a component or feature instance |
| `E0100` | `plugins.providers entry names a plugin no provider-rendering plugin serving the capability matches` | A `plugins.providers` binding names a plugin that does not serve the capability |
| `E0101` | `no provider-rendering plugin version satisfies the recipe's provider version pin` | No provider plugin version satisfies a Recipe's provider pin |
| `E0102` | `wasm plugin reference must be the plugin coordinate identity (<pluginType>/<name>:<version>), not a registry-qualified or artifact path` | A plugin reference carries a registry host or an artifact path |
| `E0103` | `no catalog version satisfies the referenced version constraint` | No catalog version satisfies a version constraint |
| `E0104` | `wasm plugin reference must carry a pluginType scope (<pluginType>/<name>); an empty scope cannot bind to an OCI location` | A plugin or recipe reference carries no scope |
| `E0105` | `recipe reference must be provider-scoped (<provider>/<name>); an empty provider cannot bind to an OCI location` | A plugin or recipe reference carries no scope |
| `E0122` | `deprecation: build consumes a deprecated entity` | The build consumes an artifact its publisher has deprecated |
| `E0126` | `externalinputs: acquisition is disabled for unpinned inputs` | An unpinned external input is requested while acquisition is off |
| `E0127` | `externalinputs: fetched bytes mismatch the pinned digest` | Fetched bytes do not match a pinned digest |
| `E0128` | `externalinputs: URL scheme is not allowed` | An external input's URL uses a scheme that is not allowed |
| `E0129` | `externalinputs: store blob mismatches its pinned record` | A stored external input no longer matches its record |
| `E0146` | `circular reference expansion` | A library reference expands into itself |
| `E0149` | `attachment name is a near miss for a declared slot` | An attachment name is one edit from a declared slot |
| `E0150` | `attachment does not conform to its declared slot shape` | Attachment does not conform to its declared slot shape |
| `E0151` | `component declared in more than one boundary: declare each component in exactly one boundary` | A component is placed in more than one boundary |
| `E0152` | `duplicate Aggregate/Manifest identity (metadata.name) in the Release directory` | The Release directory declares one Aggregate or Manifest twice |
| `E0153` | `feature merge conflict: reconcile the Aggregate and Release declarations for the feature` | Manifest merge strategy |
| `E0154` | `guard catalog-entity view inconsistency` | A guard needs a catalog entity the build resolved and cannot see |
| `E0155` | `duplicate delivery key across inject sources` | Duplicate delivery key across inject sources |
| `E0156` | `invalid inject key: the from-key must name a declared provides key of the target component type` | Inject `from` key is not in the target's `provides` |
| `E0157` | `invalid instance name: names must match ^[a-zA-Z0-9_-]+$ (letters, digits, hyphen, underscore; no dots)` | Instance name fails the naming pattern |
| `E0158` | `invalid parameter reference: check the {{ .parameters.* }} expression names a declared parameter and parses as a Go template` | A `{{ .parameters.* }}` reference cannot be interpolated |
| `E0160` | `manifest annotation bindings collide on same Feature path+pillar` | Two Manifest annotation bindings compete for one routing slot |
| `E0161` | `manifest annotation binding uses reserved prefix` | A Manifest annotation binding claims the reserved `aggrega.ai/` prefix |
| `E0162` | `missing required feature: attach a Feature of the required type to the component` | Required feature not attached |
| `E0163` | `required uses socket not populated` | Required `uses:` socket not populated |
| `E0164` | `parameter contract violated` | Parameter type mismatch / contract violation |
| `E0165` | `required parameter not supplied` | Parameter type mismatch / contract violation |
| `E0166` | `parameters $import: load failed` | External parameters file cannot be loaded |
| `E0167` | `Recipe publishes a provides key its Component does not declare` | A Recipe publishes a `provides` key its Component does not declare |
| `E0168` | `authored pillar does not conform to its declared schema` | Authored values or infra do not conform to the declared schema |
| `E0169` | `self-inject on component without spec.inject allowlist` | Self-inject on a component without an allowlist; Self-inject mechanism not in the component's allowlist |
| `E0170` | `aggregate/manifest reference unresolvable` | A Release's `aggregate:` or `manifest:` reference resolves to nothing |
| `E0171` | `unknown uses socket: name a socket the entity declares in its usesSchema — only a component's own uses block may name one the catalog did not declare` | `uses:` socket not declared in the target's `usesSchema` |
| `E0172` | `release reached resolve un-normalized (non-empty root components alongside a synthesized default boundary)` | A Release reached resolution without passing through the load path |
| `E0173` | `declared parameter is read by no reference in the Aggregate` | A declared parameter is read by nothing |
| `E0174` | `uses socket name is a near miss for a declared socket` | A `uses:` socket name is one edit from a declared socket |
| `E0175` | `YAML load failed: check the file exists, is readable, and contains well-formed YAML` | A file cannot be read, or its text is not well-formed YAML |
| `E0201` | `assertion name declared twice across the extends chain` | An assertion name is declared twice along an `extends:` chain |
| `E0202` | `cyclic extends chain` | Cyclic extends chain; Cyclic extends on Components or Features |
| `E0203` | `featurerecipe eval-provider constraint: render input-kind fields are forbidden when provider is eval` | A FeatureRecipe on the `eval` provider declares a render input kind |
| `E0204` | `FeatureRecipe: valuesMapping requires source` | A FeatureRecipe's `valuesMapping` requires `source` |
| `E0205` | `inheritance merge failed` | An `extends:` chain cannot be assembled |
| `E0206` | `recipe eval-provider constraint: input-kind fields are forbidden when provider is eval` | `eval`-provider constraint |
| `E0207` | `recipe output-component-labels constraint: key is also declared in outputLabels` | A promoted component label is also declared literally |
| `E0208` | `recipe output-labels constraint: key uses a reserved namespace` | An output-label key uses a reserved namespace |
| `E0209` | `Recipe: valuesMapping requires source` | `valuesMapping` requires `source` |
| `E0210` | `Recipe: at least one input kind required` | At least one input kind must be present |
| `E0211` | `filename collision across input kinds: two input-kind blocks produced a file under one output name` | Emission-time filename collision across input kinds |
| `E0212` | `workload attachment slot is not referenceable` | A Workload references a slot whose fill publishes no locator |
| `E0213` | `workload featuresSchema cross-check failed` | A Workload attachment names a slot the entity does not declare, or a delivery the slot forbids |
| `E0214` | `workload validation failed` | A Workload does not satisfy the Workload schema |
| `E0215` | `document envelope validation failed` | YAML anchor aliased inside its own content; Divergent Release (extends + aggregate pointer) |
| `E0216` | `validator/jsonschema: x-aggrega extension evaluation failed` | An `x-aggrega-when:` or `x-aggrega-validate:` predicate cannot be evaluated |
| `E0218` | `validator/jsonschema: schema resolution failed` | A declared schema cannot be resolved |
| `E0219` | `merger: cyclic extends chain` | The schema-merge walk's own chain safeguards |
| `E0220` | `merger: extends chain exceeds maximum depth` | The schema-merge walk's own chain safeguards |
| `E0221` | `merger: invalid merge input` | The schema-merge walk's own chain safeguards |
| `E0229` | `position out of range` | An editor position falls outside the document |
| `E0246` | `the digest recorded as trusted for this plugin does not match the digest its cached manifest reports` | A trusted plugin's recorded digest disagrees with the cached artifact |
| `E0249` | `cloudformation-provider: an export name a cross-boundary link derives is already declared by another Outputs entry in the same stack` | An authored export name is one the build derives for a cross-stack reference |
| `E0251` | `recipe source is an empty string, which names neither sourceless mode nor sourced mode` | Recipe `source:` is an empty string |
| `E0253` | `annotation binding does not resolve against its target Feature` | Annotation binding does not resolve against its target Feature |
| `E0254` | `annotation subkey does not conform to the target Feature's schema at the routed pillar` | A bound annotation value does not conform to the target Feature's schema |
| `E0255` | `annotation routes through a pillar its authoring side may not use` | An annotation routes through a pillar its authoring side may not use |
| `E0256` | `annotation binding declares one path in both pillar lists` | An annotation binding declares one path in both pillar lists |
| `E0257` | `declared schema contract failed to compile, so nothing was validated against it: correct the contract where it is declared, or remove it if the configuration it covers needs no validation` | A declared schema contract does not compile |
<!-- END GENERATED: halt-condition-sentences -->

## The linter domain (not fatal)

The compiler is strictly unopinionated about *execution*. It never halts the build for patterns that are merely suspicious — unused values, orphaned secrets, disconnected targets. Those belong to the linter domain, where enterprises opt in to Wasm plugins that enforce their own conventions.

### Orphaned credentials

A Secret declared without an `inject:` delivery contract is not a compile error. The core compiler preserves the declaration in the IR graph and emits no warning. Enterprise `linter.wasm` plugins may detect and warn on this pattern; enterprise renderers may also choose to mount orphaned secrets implicitly under their own Black-Box conventions. Because both interpretations are valid, the core compiler takes neither side.
