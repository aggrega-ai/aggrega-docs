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

The Release supplied a value whose type or shape does not match what the Aggregate declared for that parameter. The parameter-contract validator catches type mismatches, enum violations, range violations, pattern violations, strings that are not valid instances of their declared `format`, `validate:` predicate failures, and missing required parameters before any template interpolation runs. The names a `format` may take, and what each checks, are listed under [Named formats](../vocabulary/compact-form-authoring.md#named-formats).

Emitted message — the sentence that states the condition, then the entity at fault, the field path, and the constraint detail:
> parameter contract violated (Aggregate, at `.spec.parameters.<parameter>`, parameter `"<parameter>"` expected type `<declared type>`; got `<received type>`)

For a parameter declared `required: true` with no `default:` and no Release-supplied value, the report carries a different condition and a different short code:
> required parameter not supplied (Aggregate, at `.spec.parameters.<parameter>`, parameter `"<parameter>"` is required but not supplied by Release)

**Only the detail after the field path changes with the constraint that was not met.** The sentence and the parenthesised frame around it are the same every time, which makes the sentence the part to match on and the detail the part to read. The details a build prints, one per constraint kind:
> parameter `"<parameter>"` value `<value>` not in enum [`<members>`]
> parameter `"<parameter>"` value `"<value>"` does not match pattern `"<pattern>"`
> parameter `"<parameter>"` value `"<value>"` is not a valid `<format>`: `<reason>`
> parameter `"<parameter>"` value `<value>` above max `<max>`
> parameter `"<parameter>"` failed validate predicate
> parameter `"<parameter>"` validate predicate error: `<detail>`

A format failure's `<reason>` says what is wrong with the value in that format's own terms. A value inside a nested contract is named by its path, so a `format` an `items:` contract declares is checked on every element and the report names the one that failed: the second element of a `hosts` parameter is reported at `.spec.parameters.hosts.1`, its detail naming `"hosts.1"`.

A parameter declaring a `validateMessage:` replaces that whole detail with its own text, so the report reads `parameter contract violated (Aggregate, at .spec.parameters.<parameter>, <the validateMessage you wrote>)` — the frame is unchanged and your sentence sits where the constraint detail would.

The same condition covers a contract that cannot constrain anything as written. A `pattern:` that is not a valid regular expression is refused when the Aggregate's parameter contract is read, before any Release value is checked, so it halts the build whether or not a Release supplies the parameter. The report points at the key — `.spec.parameters.<parameter>.pattern`, or the path through a nested contract such as `.spec.parameters.<parameter>.items.pattern` — and its detail names the declaration, the pattern and the reason:
> parameter `"<parameter>"` pattern `"<pattern>"` does not compile: `<reason>`

A `format:` naming a format outside the supported set cannot constrain anything either, and it is refused at the same point, before any Release value is checked, so it too halts the build whether or not a Release supplies the parameter. Inside a nested contract — under `items:`, `properties:` or `valuesType:` — it is this condition that refuses it: the report points at the key, such as `.spec.parameters.<parameter>.items.format`, and its detail names the declaration, the format as written and every supported name:
> parameter `"<parameter>.items"`: format `"<format>"` is not supported; the supported formats are email, uri, hostname, ipv4, ipv6, uuid, date-time, date

On a parameter's own declaration the same name is refused one step earlier, by the Aggregate's schema, whose `format` admits only the supported names. That refusal is the document failing its kind's schema — a different condition, with its own short code, `E0215` — and `aggrega pull` and `aggrega validate --release` list it after reporting the Release's `aggregate:` reference as unresolvable (`E0170`), since the Aggregate carrying the name did not load:
> document envelope validation failed (Aggregate, at `<path>`); `<line>`:`<column>`: spec.parameters.`<parameter>`.format: enum: `<format>` does not equal any of: [email uri hostname ipv4 ipv6 uuid date-time date]. correct the document to match its kind's schema

The predicate-error detail covers both ways a `validate:` predicate can fail to produce a verdict: a function the surface does not register, and a reference to something other than `.value`. Each is reported against the predicate rather than against the value, and each names what it could not resolve.

A `validate:` predicate reads the value under validation as `.value`, and that is the only name it defines. A predicate naming anything else is refused before it runs, so a mistyped reference is reported as the naming mistake it is instead of resolving to nothing and surfacing as a value that failed validation.

**How to fix:** change the Release value to match the parameter's declared `type` / `enum` / `min` / `max` / `pattern` / `format` constraints, supply a missing required parameter, correct a `pattern:` that does not compile, replace a `format:` naming an unsupported format with one of the [named formats](../vocabulary/compact-form-authoring.md#named-formats) or remove it, correct a `validate:` predicate that names something other than `.value` or renders something other than `true` or `false`, or widen the Aggregate's declaration to accept the shape you actually need.

### Recipe shape rules

A Recipe composes its output from three input kinds — sourced, synthesized, and artifacts — described in [../../architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md). The shape of a valid Recipe is constrained by the composition rules below. They differ in when they are checked — when the Recipe is loaded, when a node renders, or when output is emitted — so read each entry for the point at which its own condition is checked. The rules apply to Recipes that target a non-`eval` provider; the `eval` provider has its own constraint (below).

Each rule is named by what it constrains. There is no numbering, and none is reserved: a name says which part of the Recipe to open, and it keeps saying it however the list below grows or is reordered. Where you need to record a condition durably — in a CI gate, an issue, a runbook — use its **code**, the identifier [sentinels.md](./sentinels.md) lists for the condition and the one that stays fixed as the packages around it evolve.

A Recipe-shape halt is composed the same way. It opens with the sentence that states the rule, then names what this particular Recipe supplied, then the detail specific to it:

> `<the rule's sentence>` (Recipe `<name>:<version>`, rule `<rule-name>`, at `<position>`). `<rule-specific detail>`

The leading sentence is fixed per rule — the same text every time that rule halts, whichever stage detected it — so it is the part of the output to match against, and it is the text [sentinels.md](./sentinels.md) lists for the rule's condition. Everything after it varies with the Recipe at fault: the parenthesised values say which document, which rule by name, and where, and the closing sentence is the advice for that occurrence. The position is the file the Recipe was loaded from where the rule is about the document as a whole, and a dotted path to the key you wrote — `.spec.outputComponentLabels.hosting` — where the rule is about one thing inside it; a key carrying dots of its own cannot be spelled as one more segment without reading equally as two, so the path stops at the block that holds it and the advice quotes the key instead.

The build prints the whole line under a `CATALOG_ERROR` tag, which signals that the failure is attributable to the catalog entity (the Recipe, or the provider it binds to), not to the Aggregate or the Release. The file the Recipe was loaded from is printed beside the tag, so a rule positioned at a key still tells you which file to open.

#### `valuesMapping` requires `source`

<!-- covers: pkg/validator.ErrRecipeValuesMappingRequiresSource -->

A Recipe declares `valuesMapping` but not `source`. Without a source to overlay, there is nothing to receive the mapped values. This rule is checked when the Recipe is loaded.

Emitted message:
> Recipe: valuesMapping requires source (Recipe `<name>:<version>`, rule values-mapping, at `<path>`). declare a source: pointer alongside valuesMapping (or remove the valuesMapping if no overlay is intended)

**How to fix:** add a `source:` pointer (a chart, module, or compose-file reference) alongside the `valuesMapping`, or remove the `valuesMapping` and adopt a different input kind (`workload:` for synthesized output, `artifacts:` for direct manifest emission).

#### `workload:` requires a provider that can synthesize

<!-- covers: internal/compiler/renderer.ErrUnsupportedInputKind -->

A Recipe declares `workload:` (synthesized mode) for a provider that does not implement Workload synthesis. Synthesized-mode support is a property of the provider — the standard-library catalog declares `workloadSchema` on synthesis-capable providers by convention, but the check keys on provider capability, not on that field's presence.

**Two surfaces report it, and only one of them decides the build.** The halt is raised at render time, after the node's provider is bound and once the input kinds its Recipe declares have been read, so that report names the **node**. [`aggrega validate`](../cli/aggrega-validate.md) reports the same finding earlier, before any node is bound, reading the Recipe on its own — so that report names the **Recipe and its version** instead. The two do not read the same set of Recipes: the early report is raised for any Recipe that declares `workload:` at all, while the halt is raised for **every** input kind the node declares that its provider cannot honour. So a Recipe pairing a `workload:` with a `source:` still halts, and it halts for the workload — declaring an input kind the provider can render does not carry an unsupported one past the gate.

The one bound on that: `artifacts:` is checked against standalone-artifacts support only when it is the node's sole declared kind. Alongside a `source:` or a `workload:` its files ride through as composed output, which that capability does not govern.

Emitted message at render time. The category the failure is attributed to reaches you in the diagnostic's bracketed head rather than inside the message. The message opens with the fixed sentence stating the condition, then names the node, the provider, the declared kind that was refused, and the kinds that provider does support. Where a node declares two kinds its provider cannot honour, the first in source → workload → artifacts order is the one reported, so the finding stays about a single line of your Recipe:

> provider does not support the node's input kind (node `"<node-id>"`). provider `"<provider-name>"` does not support `<mode>` recipes (this provider supports: `<kinds>`); declare one of the supported input kinds, or target a provider that supports `<mode>`

The head carries the category and this condition's short code, `E0265`, which is the identifier to record when you need this halt named durably — in a continuous-integration gate, an issue, or a runbook. A number is handed out once and then fixed, so it stays the same however the wording around it improves; [the table of every condition](./sentinels.md#every-condition-by-short-code) resolves it, and the opening sentence above is what to match on when you are working from text rather than from an identifier.

`aggrega validate` reports the same clause under the Recipe that carries the block, prefixed with the surface that read it:

> input-kind: Recipe `"<name>:<version>"`: provider `"<provider-name>"` does not support synthesized recipes (this provider supports: `<kinds>`); declare one of the supported input kinds, or target a provider that supports synthesized

**How to fix:** either bind the Recipe to a provider that synthesizes (most commonly `helm` or `compose`), or migrate the Recipe to a different input kind (`artifacts:` for direct manifest emission, or `source:` + `valuesMapping:` if a chart/module exists).

> **Honest-pending — per-provider Workload-content validation.** Today the provider's `workloadSchema` is documentation-only and does not validate the Workload body; bodies are validated against the platform-owned embedded Workload schema. When the Wasm-based Workload synthesizer ships, `workloadSchema` becomes the per-provider contract the synthesizer validates the Workload body against (a distinct, content-level halt). See the roadmap's Wasm-based Workload synthesizers item.

#### The provider does not support omits

<!-- covers: internal/compiler/renderer.ErrUnsupportedOmits -->

A Recipe or a FeatureRecipe declares `omits:` and the provider rendering it does not declare that it leaves rendered documents out. Leaving a document out of what a source renders is something only the provider can do — only the provider knows which documents the source renders and what each is called — so a provider that does not do it would render every document the entries name and report success. The build refuses before anything renders instead, so the key never quietly does nothing.

Whether a provider leaves documents out is read from the provider's own declaration of what it supports, not from a list of providers the compiler keeps. Every entry counts, whatever its `when:` renders, because whether the provider can honour the key does not depend on which entries a build keeps. The `helm`, `compose` and `cloudformation` providers honour the key. `helm-chart` and `terraform` hand their source on to be rendered when it is deployed, so no rendered document exists at build time to leave out, and both are refused.

The refusal is decided once every component's Recipe and every attachment's FeatureRecipe is bound and each provider has described itself — before the first component renders and before any entry is evaluated, so a build refused here renders nothing. It is asked of every document that renders a source: a component's Recipe; the FeatureRecipe an attachment binds on a component, once for each component carrying the attachment; and a FeatureRecipe that generates once for a boundary, once, at the boundary that declares it. Every document at fault is reported in one build; where more than one is, the findings are grouped under `documents declaring omits whose provider does not honour them`. A document bound to a provider the build cannot resolve is not reported here: that build halts where the provider is selected, naming the binding.

Emitted message, positioned at the component's own key under `components:` for a Recipe's entries (a component written inside a subsystem is positioned under that subsystem's key first), at the attachment's key in the `features:` block that wrote it for a FeatureRecipe's on a component, and at `.spec.boundaries.<boundary>.features.<attachment>` in the Release for a FeatureRecipe that generates once for its boundary. The category reaches you in the bracketed head; the message names the provider first, then the component the document renders for:

> provider does not support omits (`"<provider-name>"`, node `"<node-id>"`). this provider's contract does not declare that it leaves rendered documents out; remove the omits key, or render the source through a provider whose contract declares it

A FeatureRecipe's finding names the attachment after the component — `node "<node-id>", attachment "<attachment>"` — and one that generates once for its boundary names the boundary and the attachment in place of a component: `boundary "<boundary>", attachment "<attachment>"`.

The head carries this condition's short code, `E0335`.

**How to fix:** remove the `omits:` key, or render the source through a provider that honours it. Where a `helm-chart` or `terraform` Recipe sources a local chart or module, a line in the `.aggregaignore` beside the Recipe leaves a file of that source out instead, from the next time the Recipe is pinned — see [`aggrega pin`](../cli/aggrega-pin.md).

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

**How to fix:** rename the colliding file in whichever input kind you control. If the collision involves a Workload-translated filename and an `artifacts:` entry, the Workload-translated names follow the provider's translation conventions (e.g., `<release-name>-deployment.yaml` for helm, where the release name is `{{ .context.rendered_name }}`) — adjust the `artifacts:` filename to a name the provider does not synthesize.

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
> recipe output-labels constraint: key uses a reserved namespace (Recipe `<name>:<version>`, rule output-labels, at `.spec.outputLabels`). key `"<key>"` in outputLabels uses a reserved namespace (`"aggrega.ai/"` and `"app.kubernetes.io/"` are reserved for platform provenance)

A key written in the promoted block reports under that block's rule name and names it in the advice:
> recipe output-labels constraint: key uses a reserved namespace (Recipe `<name>:<version>`, rule output-component-labels, at `.spec.outputComponentLabels`). key `"<key>"` in outputComponentLabels uses a reserved namespace (`"aggrega.ai/"` and `"app.kubernetes.io/"` are reserved for platform provenance)

The literal block's keys are checked in sorted order and the promoted block's in the order you wrote them, so a Recipe breaking the rule in several places always reports the same one first.

**How to fix:** move the key into a namespace you own — your own domain, or a sub-prefixed one such as `component.aggrega.ai/…` — or drop it if the value you wanted is one the build already stamps. The provenance keys a rendered resource carries are listed in [../providers/well-known-annotations.md](../providers/well-known-annotations.md); reading one back needs no Recipe declaration.

#### A promoted component label is also declared literally

<!-- covers: pkg/validator.ErrRecipeOutputComponentLabelCollision -->

A Recipe names one key in both `outputComponentLabels:` and `outputLabels:`. The two blocks stamp onto the same label surface from different sources — the first promotes the value the component carries, the second writes the value the Recipe author typed — so a key named in both would arrive with two candidate values and nothing to say which wins. This rule is checked when the Recipe is loaded, after the reserved-namespace rule above, so a Recipe breaking both reports the reserved namespace first: that fault's fix does not depend on what the other block contains.

Emitted message:
> recipe output-component-labels constraint: key is also declared in outputLabels (Recipe `<name>:<version>`, rule output-component-labels, at `.spec.outputComponentLabels.<key>`). key `"<key>"` is promoted through outputComponentLabels and also declared literally in outputLabels; keep whichever source the label should come from and drop the other

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

### A file cannot be read, or its bytes do not parse

<!-- covers: pkg/resolver.ErrYAMLLoad -->

A file a build had to read yielded nothing the surface that named it could use. Either it could not be read from disk, or its bytes were parsed and did not parse cleanly. Nothing downstream runs on it, because there is no content to check against a schema, no components to place, and no template to render.

The condition names no format, and that is deliberate. Most of the files it covers are read as YAML; a Recipe's workload, values-mapping and artifact bodies are read as Go template source and are never parsed at all. A sentence promising YAML would lead a diagnostic about a template file with a claim about that file's format. Which of the two failures happened, and for what kind of file, is what the clause after the sentence says.

The documents a build starts from — the Aggregate, the Release, and the Manifest — are the commonest subjects, and the halt is raised at every point one of the three is read. The diagnostic names which document was being read and the path it was read from. The path is what tells a missing file from a malformed one: a read failure quotes the operating system's own reason, and a parse failure quotes the YAML parser's, which carries the line the parser gave up on.

Emitted message, where the file could not be read:
> file load failed: the file could not be read, or its bytes did not parse (Aggregate, at `<path>`, failed to read file: `<underlying reason>`)

and where its text did not parse:
> file load failed: the file could not be read, or its bytes did not parse (Aggregate, at `<path>`, failed to unmarshal YAML: `<underlying reason>`)

`Release` and `Manifest` appear in place of `Aggregate` when one of those is the document being read. The same condition also covers the parameter contract read out of an Aggregate's declared `parameters:` block, which is read from the Aggregate's own text before anything is interpolated into it.

**A Release's `parameters: { $import: … }` naming a file the build cannot get hold of reports here too**, and on both counts: the path names no file the build can read, or the file is read and its bytes do not parse. The Release is the subject, and the clause names the key that pointed at the file:

> file load failed: the file could not be read, or its bytes did not parse (Release, at `.spec.parameters.$import: <path>`, failed to read file: `<underlying reason>`)
> file load failed: the file could not be read, or its bytes did not parse (Release, at `.spec.parameters.$import: <path>`, failed to unmarshal YAML: `<underlying reason>`)

A relative path is resolved from the directory holding the Release that writes it — the Release a command names, or a link of its `extends:` chain — wherever the command is run from, so the command line and the editor read the same file; an absolute path names its own place. Confirm the checkout the build runs against holds the file there: a parameters file that is present on your machine and excluded from version control is absent during a continuous-integration run, which is the common way this one is met. A path that leads out of the workspace — or, for a Release named outside the workspace, out of that Release's own directory — is not read at all, and reports under "A reference to another file leads out of the directory it must stay inside" below.

**A schema `$import:` that names a file the build cannot get hold of reports here too**, because the fault is the same one: the directive is well-formed and the file it names did not yield a document. A catalog entity is the subject then rather than one of the three, so the clause names the schema surface it was resolving for — `spec.schema`, a pillar of it such as `spec.schema.values`, or a `usesSchema` socket's `valueSchema` — and the source pointer is the line the directive was authored on:

> file load failed: the file could not be read, or its bytes did not parse. `<surface>`: read imported schema `<value>`: `<the operating system's reason>`

with `resolve imported schema path` in place of `read` for the rarer failure to establish the entity's own directory at all, and `parse imported schema` where the file was read and its text is not well-formed YAML. A fault in the directive you wrote — a sibling key beside it, a value that is not a path, or imported content that parsed and is not a map — is a different condition and reports under "A schema `$import:` cannot be applied" below.

**A Recipe's or FeatureRecipe's `valuesMapping:`, `workload:` or `artifacts.<name>:` import reports here too**, for the same reason and with the same remedy: the directive is well-formed and the file it names did not yield content. Those three bodies are Go template source rather than documents, so only the read can fail — nothing parses them at this point. The entity and the key that named the path travel in the clause, and the source pointer is the imported file's own path:

> file load failed: the file could not be read, or its bytes did not parse (Recipe `<name>` valuesMapping file import, `<the operating system's reason>`). if you meant a library entry rather than a file, the reference needs its fragment — an $import: carrying none is read as a file path, and an unquoted value ends where a space before # starts a comment, so quote the whole reference
> file load failed: the file could not be read, or its bytes did not parse (Recipe `<name>` workload file import, `<the operating system's reason>`). if you meant a library entry rather than a file, the reference needs its fragment — an $import: carrying none is read as a file path, and an unquoted value ends where a space before # starts a comment, so quote the whole reference
> file load failed: the file could not be read, or its bytes did not parse (Recipe `<name>` artifact `<key>` file import, `<the operating system's reason>`). if you meant a library entry rather than a file, the reference needs its fragment — an $import: carrying none is read as a file path, and an unquoted value ends where a space before # starts a comment, so quote the whole reference

The fragment is what tells a library reference from a path: `<Library>#/mappings/<entry>` resolves against the libraries, and the same text with the fragment gone is an ordinary relative path. It is easy to lose without noticing, because a plain YAML value ends where a space before `#` opens a comment — so `$import: LibBeta:1.0.0 #/workloads/Web` reaches the build as `LibBeta:1.0.0`, and the build then looks for a file of that name beside the Recipe. Quote the whole reference to keep the fragment.

The same three keys on a FeatureRecipe report the same condition and read the same way. An artifacts import is read twice over a Release's life — once when `aggrega pull` freezes its content pin, and again when the entry is rendered — so the same missing file reports this condition at whichever of the two you reach first. A shape fault in the directive itself, such as a sibling key beside `$import:` or a host-bearing `oci://` reference, is a different condition and reports under its own entry.

**How to fix:** read the path in the message rather than the document's name — the two differ whenever a reference resolved somewhere unexpected. For a read failure, confirm the file exists at that path, that the path is spelled as the referring document writes it, and that the build has permission to read it; a file present locally and absent from a build agent's checkout is the common case. For a parse failure, open the file at the line the parser named — an unquoted value containing a colon, a tab used for indentation, and a list item indented under the wrong key are the three that account for most of them.

### A `{{ .parameters.* }}` reference cannot be interpolated

<!-- covers: pkg/resolver.ErrInvalidParameterRef -->

The Aggregate's text is evaluated as a template before it is read as a document, so that a `{{ .parameters.<key> }}` reference is replaced by the value the Release supplied for it. This halt fires when that evaluation cannot be completed: the text does not parse as a template, or it parses and fails while running.

Interpolation happens **before** the Aggregate is parsed as YAML, which is why a fault here is reported against the Aggregate as a whole rather than at a key inside it — at that point the document has no keys yet. It is also why the reference may be left unquoted: the substitution happens in the raw bytes, and YAML's own quoting rule then decides the value's type, so a bare reference yields the value's natural type and a quoted one yields a string.

A reference naming a key the Release did not supply is **not** this halt. An absent key resolves to an empty value here and is caught, with its type and its contract, by the parameter checks described under "Parameter type mismatch / contract violation" above. What this halt reports is text the template engine could not process at all — an unclosed `{{`, a mis-spelled function name, a pipeline whose stages do not fit together. Reading a parameter through `index` — `{{ index .parameters "db_size" }}` — when the Release supplied no such parameter is a failure while running, and this halt carries it, naming the key: `index` halts on a map key the map does not hold on every template surface, as "A template indexes a map with a key the map does not hold" below describes.

Text that does not parse at all is refused with the Aggregate's own path named, because that file is in hand before anything reads it. A module the composition imports is evaluated the same way one level in, where its text is read from the catalog rather than handed to the build. The halt is this same condition and carries this code either way; for a module it also names the import it was following and the file the module's text was read from, and the message it carries names the kind alone — so the position that message gives is a position in the module's own text, not in the Aggregate you started from.

Emitted messages, for a template that does not parse, for the same fault in a module the composition imports, and for a template that fails while running:
> invalid parameter reference: check the {{ .parameters.* }} expression names a declared parameter and parses as a Go template (Aggregate `<path>`, "template parse error: `<underlying reason>`")
> invalid parameter reference: check the {{ .parameters.* }} expression names a declared parameter and parses as a Go template (Aggregate, template parse error: `<underlying reason>`)
> invalid parameter reference: check the {{ .parameters.* }} expression names a declared parameter and parses as a Go template (Aggregate, template execution error: `<underlying reason>`)

**How to fix:** open the Aggregate and read the underlying reason, which names the position in the text and the construct that failed. Confirm every `{{` has its `}}`, that a function you called is one the surface offers — parameter interpolation offers Sprig's functions and nothing else, so the `optional` helper is **not** available here — and that a pipeline's stages accept what the stage before them produces. Where the reason names a key `index` did not find, read a parameter that may be unset with a dot (`{{ .parameters.db_size }}`) or through Sprig's `get` or `hasKey`. Where it names something you never meant as a template — `undefined variable "$json"` from an n8n expression, or a function named after a Flowise node — the text carries double braces of its own, a comment's included: write each `{{` in it as `{{"{{"}}`, as [Text that carries its own double braces](../templates/parameters-context.md#text-that-carries-its-own-double-braces) describes.

### The Release directory declares one Aggregate or Manifest twice

<!-- covers: pkg/resolver.ErrDuplicateTriadIdentity -->

A Release whose `aggregate:` or `manifest:` reference is a bare identity is resolved by scanning the Release's own directory first, and that scan found two Aggregates — or two Manifests — carrying the same `metadata.name`. A bare-identity reference names an entity by that name, so a name claimed twice is one the directory cannot answer for.

**The scan refuses the directory as a whole, not only the name a reference asked for.** It reads every Aggregate and every Manifest sitting beside the Release, so a colliding pair that neither reference names stops the build as well: the directory is ambiguous whether or not this Release was the one about to read that entity. A reference written as a path (`./aggregate.yaml`, `../shared/manifest.yaml`) addresses a file rather than an entity and is resolved without the scan, so a Release whose `aggregate:` and `manifest:` are both paths never runs it.

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

**A boundary places components three ways, and all three count.** Naming one directly under `components:`, by the id it carries once composition is complete, places it. Naming one inside a routing entry's own `components:`, by the local name it carries inside that sub-module, places it too. And routing a whole sub-module in under `aggregates:` places every component that module contains. So this halt also covers one sub-module routed into two boundaries, a module routed into one boundary with a module nested inside it routed into another, and a component named at one boundary while the module containing it is routed into a different one.

Routing a module into a boundary and also naming one of its components under that **same** boundary is not a conflict — both placements agree on where the component belongs — and builds. One id written twice under one boundary is a conflict even there: an entry in the boundary's `components:` and an entry for that same component inside the boundary's routing entry are two entries carrying configuration for one component, with nothing to choose between them.

**Every offending placement is reported.** A Release that places several components twice halts with one of these per offending entry in a single build, each at the key of the entry it objects to — so several of them together are one build naming everything it found, rather than one fault written out more than once.

The placement a message reports as already in effect is not always the one written first in the file. A boundary's own `components:` entries are read before the components its routing entries name and before the sub-modules it routes, and a boundary is read before the boundaries nested inside it; boundaries written side by side are read in the order they appear. Where more than one earlier placement conflicts, the first one read is the one named. Both sites are named whichever way round they fall, and neither is ranked above the other.

Emitted message. The sentence states the rule; what follows names the entry at fault, the boundary each of the two placements sits in, the block each of them was written in, and the file that holds them both. Where an entry under one boundary's `components:` meets an earlier entry under another boundary's:
> component declared in more than one boundary: declare each component in exactly one boundary (Release `<name>`, at `<field-path>`, `"<component>"`, named in the components block of boundary `"<boundary-b>"`, while it is already named in the components block of boundary `"<boundary-a>"`, that earlier entry naming `"<component>"`, both declared in `"<path>"`)

The two clauses naming the boundaries are worded for the block each entry was written in. The entry at fault takes one of:

- `named in the components block of boundary "<boundary>"` — the boundary's own `components:` map;
- `named inside a routing entry in boundary "<boundary>"` — the `components:` map of a routing entry under that boundary's `aggregates:`;
- `routed as a sub-module into boundary "<boundary>"` — the routing entry itself.

The earlier placement, continuing the same sentence, takes one of:

- `while it is already named in the components block of boundary "<boundary>"`;
- `while it is already named inside a routing entry in boundary "<boundary>"`;
- `while it is already placed by a sub-module routed into boundary "<boundary>"`.

The two clauses are chosen independently, so any pairing of them can appear, and `that earlier entry naming` carries whatever that earlier placement addressed: the component's id, or the sub-module's prefix where a routed sub-module is what placed it.

Where the entry at fault is a routing entry itself, what it addresses is a sub-module rather than a single component, and the message says so rather than presenting a module prefix as a component name — here meeting an earlier sub-module routed into another boundary:
> component declared in more than one boundary: declare each component in exactly one boundary (Release `<name>`, at `<field-path>`, sub-module `"<module>"`, routed as a sub-module into boundary `"<boundary-b>"`, while it is already placed by a sub-module routed into boundary `"<boundary-a>"`, that earlier entry naming `"<module>"`, both declared in `"<path>"`)

**How to fix:** delete whichever of the two placements you did not mean. The message names both, so the choice is yours rather than the compiler's. Where a direct declaration and a routed module disagree, decide whether the component belongs with its module or on its own: routing the module places it alongside everything else the module contains, and naming it directly separates it from them. Where two routing entries claim one module, drop the routing you did not intend — routing a module into a boundary places every component it contains there, so two such entries claim the same set of components.

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

**How to fix:** open the schema at the position the message names and read the reported reason. Confirm the keyword's value is a string, that the template parses, and that every path it walks is one the value under validation actually has — a predicate reads the value as `.value`, and reaching for anything else is the commonest mistake. Where the reason names a key `index` did not find, test for the key with `hasKey` or read it with `get` instead: `index` halts on a map key the map does not hold, as "A template indexes a map with a key the map does not hold" below describes. Make sure the template ends by producing `true` or `false`: a comparison does, while a template that merely renders the value does not.

### A Workload does not satisfy the Workload schema

<!-- covers: pkg/validator.ErrWorkloadValidation -->

A Recipe's or FeatureRecipe's `workload:` block was read and checked against the Workload schema, and one or more fields do not satisfy it — a misspelled key, a value of the wrong type, a required field left out, a value outside a declared range or enumeration.

The report is **grouped**: one halt carries every field at fault, so a Workload with four mistakes tells you about all four in one build rather than one per build. The header names the Workload, the Recipe that declares it, and the file; each finding beneath it names the field path inside the Workload, what the schema required there, and the fix where one can be stated.

Emitted message:
> workload validation failed (Workload in Recipe `<name>:<version>`, at `<path>`, schema stage):
>   `.containers.<name>.<field>`: `<what the schema required>` — `<the fix, where one can be stated>`
>   `.initContainers[<i>].<field>`: `<what the schema required>` — `<the fix, where one can be stated>`

A failure with no per-field detail — the block could not be read at all, rather than read and found wanting — carries the whole reason as its single finding instead.

**Where the `workload:` template reads a value declared sensitive, no finding quotes a value.** Which field of the rendered document came from that value cannot be told, so every finding whose text could carry a value states the schema's constraint with `<redacted>` in the value's place, closed by a notice naming the reason, and carries no fix derived from the value:
>   `.containers.main.imagePullPolicy`: `against /$defs/container: enum: <redacted> does not satisfy enum ["Always","Never","IfNotPresent"] (the value is withheld because the template that rendered this document reads a value declared sensitive)`

A finding that quotes no value — a missing key, a key the Workload does not admit — reads as it does for any other template. See [`vocabulary/compact-form-authoring.md`](../vocabulary/compact-form-authoring.md#what-a-refusal-says-about-a-declared-value) "What a refusal says about a declared value".

The build reports the halt under a `CATALOG_ERROR` tag, because a `workload:` block is written by the Recipe's author rather than by the Aggregate or the Release.

**How to fix:** open the Recipe at the field paths listed and correct each one. The paths are given from the Workload's own root, so `.containers.main.health.ready` is the `ready` block under the `main` container's `health` key. A named container is addressed by its key and an init container by its position, which is why the two read differently. What each field accepts is in the Workload authoring reference.

**A field the schema wants as text, refused because the value is a number or a boolean, almost always means an unquoted template expression.** A `workload:` block is rendered before it is checked, so an expression written without quotes expands into bare text and YAML then reads that text as whatever it looks like. A whole-core sizing quantity, a version made only of digits, a port, and the words `yes`, `no`, `on` and `off` all read as something other than text. The finding says which type YAML read, and the remedy is to quote the expression in the Recipe — `cpu: "{{ .infra.compute.cpu }}"` rather than `cpu: {{ .infra.compute.cpu }}` — so the value stays text whatever the operator supplies. Note that the operator's own value is not at fault here and quoting it in the Release changes nothing: the quotes have to be in the Recipe, around the expression.

### A Workload attachment names a slot the entity does not declare, or a delivery the slot forbids

<!-- covers: pkg/validator.ErrWorkloadFeaturesSchema -->

A container's `attachments:` entry inside a `workload:` block refers to an attachment slot, and the reference does not line up with the slots the Component or Feature declares in its `featuresSchema` — or, for an entry naming a connection with `connection:`, with the slots that connection's socket declares. An `envFrom` entry naming a connection is held to the same connection rules. The finding says which of these shapes you have.

- **The slot is not declared.** The entry's `from:` names a slot the entity's `featuresSchema` does not carry — a misspelling, or a slot that was renamed on one side only.
- **The slot is blackbox.** The slot declares an empty `inject:` allowlist, which reserves delivery to the Recipe's own plumbing. Such a slot is filled and consumed internally, so a Workload cannot reach for it.
- **The delivery is outside the slot's allowlist.** The entry's `as:` names a mechanism the slot's `inject:` list does not permit.
- **The connection is not one the component draws.** The entry's `connection:` names an alias no connection of the component is written under.
- **The connection's socket does not declare the slot.** The entry's `from:` (or, on `envFrom`, `secret:`) names a slot the socket that connection is wired through does not declare.
- **The slot is written by its composed name.** The entry's `from:` (or `secret:`) is the name a connection's attachment takes on the component — the alias, a dot and the slot — written without `connection:`. A connection's slot is reached only by naming the connection.

Every offending entry across every container is reported together, so one build names them all. Findings are grouped under one header naming the Workload, its Recipe, and the file.

Emitted message:
> workload featuresSchema cross-check failed (Workload in Recipe `<name>:<version>`, at `<path>`, featuresSchema stage):
>   `.containers.<name>.attachments.<KEY>.from`: references slot `"<slot>"` which is not declared in the Component's featuresSchema — either declare the slot in the Component (or Feature) featuresSchema, or rename the reference to an existing slot
>   `.containers.<name>.attachments.<KEY>.from`: slot `"<slot>"` is blackbox (no `inject:` allowlist) and cannot be referenced from a Workload attachments entry — blackbox slots are delivered by Recipe-internal plumbing; remove the Workload-side reference, or widen the slot's inject allowlist if Workload-side delivery is intended
>   `.containers.<name>.attachments.<KEY>.as`: delivery mechanism `"<as>"` is not permitted by slot `"<slot>"` (inject allowlist: `[<mechanisms>]`) — use one of the allowlisted delivery mechanisms (`[<mechanisms>]`), or widen the slot's inject allowlist in the Component/Feature featuresSchema
>   `.containers.<name>.attachments.<KEY>.connection`: names connection `"<alias>"` for slot `"<slot>"`, but the component draws no connection under that alias — name a connection the component draws (`<aliases>`), or remove connection to read a slot the Component declares for its own attachments
>   `.containers.<name>.attachments.<KEY>.from`: names slot `"<slot>"` of connection `"<alias>"`, which socket `"<socket>"` does not declare — name a slot socket `"<socket>"` declares (`<slots>`), or declare the slot in that socket's featuresSchema
>   `.containers.<name>.attachments.<KEY>.from`: names `"<alias>.<slot>"`, the name the compiler composes for slot `"<slot>"` of connection `"<alias>"`; a slot a connection's socket declares is named by naming the connection — write connection: `<alias>` beside from: `<slot>`

On an `envFrom` entry the same findings sit at `.containers.<name>.envFrom[<i>].connection` and `.containers.<name>.envFrom[<i>].secret`.

**How to fix:** each finding names both sides, so the choice is which side to change. For an undeclared slot, correct the `from:` spelling or declare the slot in the entity's `featuresSchema` — the field path's `.from` suffix points at the reference. For a blackbox slot, remove the Workload-side reference and let the Recipe deliver the material, unless Workload-side delivery is genuinely wanted, in which case give the slot an `inject:` allowlist. For a refused mechanism, switch `as:` to one the allowlist names, or add yours to it. For a connection the component does not draw, correct the alias to one the finding lists, or draw the connection in the Aggregate or the Release. For a slot the socket does not declare, name one of the slots the finding lists, or declare the slot in the socket's `featuresSchema` on the Component. For a composed name, write the connection and the slot separately, as the finding shows.

### A Workload references a slot whose fill publishes no locator

<!-- covers: pkg/validator.ErrSlotNotReferenceable -->

A container's `attachments:` entry names a slot by reference, and the attachment filling that slot does not publish the `provides` keys such a reference reads. Referring to a slot by name means asking for the resource it stands for to be addressed in the rendered output — by the name of the resource, and by the field inside it. A fill that publishes neither has no locator to point at, so the reference cannot be turned into anything.

**Which keys are required depends on the entry**, and the finding says which it wanted. An entry that names its own `key:` supplies the field itself, so only the resource's `name` must be published — which is what lets it reference a multi-key resource. An entry that names no `key:` reads the slot's single published field, so both `name` and `key` must be there.

The check reads only whether the keys are present; it never inspects their values. Every offending entry is reported together, under one header.

Emitted message:
> workload attachment slot is not referenceable (Workload in Recipe `<name>:<version>`, at `<path>`, slotReferenceability stage):
>   `.containers.<name>.attachments.<KEY>.from`: slot `"<slot>"` is not referenceable: its resolved provides does not expose `"<key>"` (a workload attachment reference reads the provides keys name and key) — reference a slot filled by an attachment whose schema.provides declares the keys this reference reads, or deliver it through the slot's inject pipe rather than a workload reference

**How to fix:** two directions, and which is right depends on what you meant. Where the reference is correct, the attachment filling the slot is the thing to change: attach a Feature whose `schema.provides` declares `name` — and `key`, where the entry names none of its own — so there is a locator to point at. Where the material was never meant to be addressed by name in the output, drop the reference and deliver it through the slot's `inject:` pipe instead, which carries the value rather than a pointer to where it lives.

### A container gives one environment variable two values

<!-- covers: pkg/validator.ErrDuplicateContainerEnvironmentVariable -->

One container of a `workload:` block names the same environment variable twice: once as a key of its `variables`, and once as the key of an `attachments` entry delivered `as: env`. A main container and an init container are each checked, in the Workload a component's Recipe renders and in the Workload a FeatureRecipe renders alike — one attached to a component and one declared at a boundary — and the check reads the Workload as its template rendered it.

**Why it halts rather than picking one.** A container's environment is written from those two collections in a fixed order — the helm and compose providers write every attachment-read entry first and the plain `variables` after them. A name written both ways would therefore reach the process with whichever value that order lets win, which is a consequence of where the two kinds land rather than anything you wrote, so the build refuses the pair instead of rendering it. The check runs once, whichever provider renders the Workload, after the Workload's other checks and before the `artifacts:` entries are evaluated or any provider is handed the Workload, so a refused pair is never rendered. An `attachments` entry delivered `as: file` is mounted as a file rather than set in the environment, so it never forms a pair.

The check compares names only; it never reads a value, so no finding quotes one. Two kinds of environment entry are outside what it compares: an `envFrom` entry sets the keys of the ConfigMap or Secret it names, which are not known when the build runs, and an entry a pipeline step writes into a rendered document is not part of the Workload the check reads.

Each pair is a finding of its own, positioned at the `workload:` key of the Recipe or FeatureRecipe that declares the Workload, and naming the variable and the container — a main container by its key, an init container by its place in the `initContainers` list. Findings arrive with the main containers first, in the order they are authored, then the init containers by position, and within one container in the order its `attachments` entries are authored.

Emitted message, for a pair on a main container of a Recipe's Workload. The category and this condition's short code, `E0345`, reach you in the bracketed head, and the position reads `<path> at .spec.workload`:

> a container declares one environment variable twice (`"<NAME>"`, container `"<container>"`). Rename one of the two, or write them under complementary template conditions so that only one of them renders

A pair on an init container names its place in the list instead — `init container "initContainers[<i>]"` — and a FeatureRecipe's finding names the attachment that binds it after the container, `attachment "<attachment>"`, because a component may carry several attachments whose FeatureRecipes are separate documents.

Where one Workload carries several pairs, the findings are grouped under a line naming the document: `containers of the Workload this Recipe renders name one environment variable twice`, or, for a FeatureRecipe, `containers of the Workload rendered by the FeatureRecipe that attachment "<attachment>" binds name one environment variable twice`.

The build reports the halt under a `CATALOG_ERROR` tag, because a `workload:` block is written by the author of the Recipe or FeatureRecipe rather than by the Aggregate or the Release.

**How to fix:** decide which of the two the container should receive. Where both are wanted, rename one of them, so the process sees two variables. Where they are alternatives — a plain fallback for when no credential is attached, say — guard them under complementary conditions so exactly one renders: write the variable under `{{ if not (hasKey (default dict .features) "<slot>") }}` and the `attachments` entry under `{{ if hasKey (default dict .features) "<slot>" }}`, or under the two branches of one `{{ if }}`/`{{ else }}`. A pair guarded that way never reaches the check, because only one of the two is in the rendered Workload.

### A Release's `parameters:` block is written in neither of its two shapes

<!-- covers: pkg/types.ErrParametersShape -->

A Release fulfils the parameters an Aggregate declared in one of two ways, and the block is read by its shape. Either it is a mapping of parameter names to values written in place, or it is a mapping of exactly one key, `$import:`, whose value is the path of a YAML file holding those values. A block that is neither is refused as it is read, before anything checks the values against the Aggregate's declarations.

Three shapes are refused. A `parameters:` value that is not a mapping at all — a scalar, or a list. A mapping carrying `$import:` alongside other keys, which asks for the imported values and the written ones at once and gives no rule for combining them. And an `$import:` whose value is not a plain string, which names no file.

Emitted message, where the value is not a mapping. The number after `kind` is the document shape the reader found where a mapping was required:
> parameters: shape must be an inline object or {$import: <local-path>}: got kind `<shape>` at line `<line>`

and where `$import:` shares the mapping with something else, or names something that is not a path:
> parameters: shape must be an inline object or {$import: <local-path>}: $import: must be the only key (got `<n>` keys) at line `<line>`
> parameters: shape must be an inline object or {$import: <local-path>}: $import value must be a string scalar at line `<line>`

**How to fix:** open the Release at the line the message names. Write the values in place under `parameters:`, or replace the whole block with a single `$import:` entry whose value is a quoted path. Where you wanted written values *and* an imported file of shared defaults, move the written ones into a Release that `extends:` the one holding the import — layering several sources of parameters is what an `extends:` chain is for, and this one key is read from a single source by design.

### An inline-or-import field is written in neither shape

<!-- covers: pkg/types.ErrArtifactEntryShape, pkg/types.ErrValuesMappingShape, pkg/types.ErrWorkloadTemplateShape -->

Three fields a Recipe or FeatureRecipe writes — an `artifacts.<name>:` entry, a `valuesMapping:`, and a `workload:` — accept the same two shapes. Either the body is written in place, as a string scalar (a `|` block is the usual spelling for anything multi-line), or the value is a mapping of exactly one key, `$import:`, naming where the body lives instead. What an `$import:` may name differs by field: an artifacts entry imports a local path or a bundle out of an ArtifactLibrary, while `valuesMapping:` and `workload:` import a local path or an entry out of a library by identity.

One reader checks all three, so the refusals are the same three whichever field is at fault: a mapping carrying more than one key, a mapping whose single key is not `$import`, and an `$import:` whose value is not a plain string. A value that is neither a scalar nor a mapping — a list, most often — is refused on its shape alone.

Emitted messages. Each opens with the sentence for the field at fault, then says what the reader found and where:
> artifacts entry: shape must be a string scalar or {$import: <local-path>}: got `<n>` keys at line `<line>`
> valuesmapping: shape must be a string scalar or {$import: <path-or-library-identity>}: got key `"<key>"` at line `<line>`
> workload: shape must be a string scalar or {$import: <path-or-library-identity>}: $import value must be a string scalar at line `<line>`

Any of the three fields can report any of those endings; a value that is neither shape ends with `got kind <shape> at line <line>`, where the number is the document shape the reader found.

**How to fix:** open the entity at the line the message names. Write the body in place as a block scalar, or replace the whole value with a single `$import:` entry. A mapping carrying `$import:` and anything else is not one of the two shapes — move the extra keys inside the imported file, or write the body in place. A misspelled `$import` — a missing `$`, most often — reads as an ordinary key and is reported as the single key that is not `$import`.

### A reference to a library entry carries whitespace

<!-- covers: pkg/types.ErrLibraryReferenceWhitespace -->

A reference that names an entry inside a library is written as one unbroken token: the library, an optional `:<version>` floor, then `#` and the entry's path — `BaseWorkloads:1.0.0#/workloads/StatelessService`. No part of it admits whitespace. Library names and entry names are both constrained to identifier spellings by the library schemas, and a version is a version, so a space, a tab or a line break anywhere in a reference belongs to none of the three.

The refusal covers every surface that addresses a library entry by identity: a `valuesMapping:`, a `workload:` and an `artifacts.<name>:` entry written as `$import:`, and a schema `$ref:`. A local path written as `$import:` carries no `#` and is not a reference to a library entry, so a path with a space in it is untouched.

What makes this worth refusing rather than tidying up is that the leading part of such a value is usually a reference in its own right. Trimming at the whitespace would resolve *that* reference and quietly discard the rest of what the author wrote — and the two halves of a build do not have to discard the same amount, so one could record a dependency the other never saw. Refusing keeps the value meaning one thing.

The refusal is reported at the line of the document the reference was read from:
> library reference: a reference to a library entry carries no whitespace or line break: $import target `"<reference>"` at line `<line>`

A reference reaches a build from one further place: the body of a library entry a build has already resolved, where a field-root `$import:` on the first line points at another library's entry. That reference was never read from a document the build opened, so it is reported without a line:
> library reference: a reference to a library entry carries no whitespace or line break: `"<reference>"`

**How to fix:** open the entity at the line the message names and close up the reference so it is one token. A line break before the `#` is the usual cause — a reference wrapped across two lines to fit a column reads as one value to YAML and as a broken reference here, so write it on one line however long it runs. A trailing space before the closing quote is the other: it lands inside the version floor, where it names a version no published artifact carries. For the second form, the reference is inside the library named just before it in the message; correct it where that library declares the entry.

### A library entry's body is not the shape that library holds

<!-- covers: pkg/types.ErrMappingEntryNotScalar, pkg/types.ErrWorkloadEntryNotScalar, pkg/types.ErrArtifactLibraryEntryShape -->

A library publishes named bodies for other entities to import, and each library kind holds one shape. A MappingLibrary entry and a WorkloadLibrary entry each hold **one** template body, so the entry's value is a scalar — a `|` block, in practice. An ArtifactLibrary entry holds a **bundle**: the files that belong together under one name, so the entry is a mapping of output filename to that file's body, and each body under it is a scalar.

Bodies are captured exactly as written and are not parsed when the library loads. The template inside one is parsed where it is imported, which is why what is checked here is only the shape — a body that is not a template at all loads without complaint and fails at the point something renders it.

Emitted messages, where the number after `kind` is the document shape the reader found:
> mappinglibrary: entry body must be a string scalar: got kind `<shape>` at line `<line>`
> workloadlibrary: entry body must be a string scalar: got kind `<shape>` at line `<line>`
> artifactlibrary: entry must be a mapping of filename to a string body: got kind `<shape>` at line `<line>`

and, for a bundle whose entry is a mapping but one of whose files is not a scalar, naming the file:
> artifactlibrary: entry must be a mapping of filename to a string body: file `"<filename>"` body must be a string scalar (got kind `<shape>` at line `<line>`)

The build reports these under a `CATALOG_ERROR` tag naming the file it was reading, with the sentence above beneath it.

**How to fix:** write the body as a block scalar under its key. A body whose first line looks like a YAML key — which a template producing YAML usually does — is read as a nested mapping unless the block scalar is there, and that is the common cause. For an ArtifactLibrary, write one key per output filename with each body as its own block scalar; a bundle written as a single body is the other common shape mistake.

### A `$instantiate:` reference cannot be resolved

<!-- covers: pkg/types.ErrTemplateNotFound, pkg/types.ErrTemplateParamMissing, pkg/types.ErrTemplateParamTypeMismatch -->

A SchemaLibrary may declare reusable shapes under `spec.templates`, each with its own `$params`, and a schema entry then instantiates one by naming it under `$instantiate:` and supplying its parameters under `$args:`. Substitution is literal: a `$<name>` scalar in the template's body is replaced by the argument's value. There is no expression evaluation, no conditional and no loop, and a substituted value is inserted as it stands rather than being scanned for further markers.

Three faults refuse the instantiation. The name under `$instantiate:` is not one the library declares. A parameter the template declares without a `default:` has no entry under `$args:`. Or an argument's value is not the type its parameter declares — and an `$args:` key naming no declared parameter is reported the same way, rather than being ignored, so a misspelled argument name is a refusal instead of a silently-defaulted parameter.

Emitted messages:
> schemalibrary: template not found: `"<template-name>"` not declared in spec.templates
> schemalibrary: template parameter missing: `"<parameter-name>"` (template `"<template-name>"`)
> schemalibrary: template parameter type mismatch: `<what the type check found>`
> schemalibrary: template parameter type mismatch: argument `"<argument-name>"` is not declared in template `"<template-name>"`'s $params

**How to fix:** for a template that is not found, correct the name to one the library declares under `spec.templates` — and check you are importing the library you meant. For a missing parameter, add it to `$args:`, or give the parameter a `default:` in the template so callers may leave it out. For a type mismatch, change the argument to the declared type or widen the parameter's `type:`; where the message names an argument that is not declared, correct its spelling or remove it.

### A schema uses a JSON Schema keyword the library does not admit

<!-- covers: pkg/types.ErrForbiddenKeyword -->

`$dynamicAnchor` and `$dynamicRef` are not admitted in SchemaLibrary content. They defer which schema a reference resolves to until the value is being validated, which makes a library entry's meaning depend on where it was imported from rather than on what it says — and the compiler resolves a library's shapes ahead of any validation, so there is nothing for a deferred reference to resolve against.

The refusal is applied at three points, which together close both ways the keyword could arrive. A schema entry is scanned as the library loads. A template's body is scanned as the library loads, so a template carrying the keyword literally fails at that point rather than at whichever build first instantiates it. And the substituted body is scanned again after an instantiation, so supplying the keyword as an argument value does not get past the first two.

Emitted message:
> schemalibrary: forbidden JSON Schema keyword: `"$dynamicRef"` at line `<line>`

**How to fix:** replace the deferred reference with a `$ref` naming a `$defs` entry directly. Where the shape genuinely varies per use, express the variation as a template with `$params` and instantiate it per use — that is the substitution this surface offers, and it resolves before anything validates against the result.

### A document nests deeper than the reader will descend

<!-- covers: pkg/types.ErrOrderedMapDecodeDepthExceeded -->

Every authored mapping is read into a structure that preserves the order its keys were written in, because that order reaches the rendered output and is part of what makes a build byte-identical across runs. That reader descends a bounded number of levels — a hundred — and refuses to go deeper, so input that would otherwise exhaust the reader's own stack is reported as the refusal it is.

Emitted message:
> OrderedMap: decode depth exceeded (depth=`<depth>`)

**How to fix:** real authored documents nest a handful of levels, so a document reaching a hundred is generated, machine-translated, or accidentally self-referential. Look for a value that expanded into itself — a YAML anchor referencing content it sits inside is refused by its own halt above, but a generator emitting the same shape repeatedly is not. Where the depth is genuine, lift the deep branch into an entity of its own and reference it by name.

### A provider declares a well-known annotation at a scope it does not render

<!-- covers: pkg/types.ErrWellKnownAnnotationScope -->

A Plugin serving a provider says two things about itself that have to agree. Under `spec.provider.wellKnownAnnotations` it lists the annotations it acts on, each with the scopes it reads them at. Under `contract.inputKinds` it says which input kinds it renders at all. A key declared at a scope whose input kind the same entity does not claim is those two statements contradicting each other in one file, so the entity is refused as it loads.

The check is a comparison of the entity against itself, which is why it needs no plugin binary and fires wherever the entity is read — including a catalog walk on a machine that has never fetched the artifact.

Two entries are deliberately not compared. A boundary-scoped entry names no input kind, because it is resolved once for a whole boundary rather than on any one node's render path. An entry declaring no scope at all makes no per-path claim: it says only that the plugin reads the key somewhere.

What the refusal does **not** establish is that a declaration left standing is true. Nothing can prove that the plugin serving a provider reads a key it says it reads; what a comparison of two authored fields can do is refuse the pair that cannot both be true. A key declared at a scope the provider does render, whose plugin reads nothing there, passes here.

Emitted message:
> provider `"<plugin-name>"` declares well-known annotation `"<key>"` at scope `"<scope>"`, but its contract.inputKinds.`<field>` is not claimed; declare the key only at a scope the provider renders, or claim the input kind: wellKnownAnnotations: a key is declared at a scope the provider's contract does not render

**How to fix:** the message names both halves. Either drop that scope from the annotation's `scope:` list, leaving the scopes the provider does render, or claim the input kind under `contract.inputKinds` if the provider does in fact render it.

### A compact-form schema uses a keyword the compact form does not know

<!-- covers: pkg/compactform.ErrUnknownKeyword -->

A schema written in the compact form carries a key that is neither a compact-form keyword, nor one of the JSON Schema keywords the form passes through, nor one of the three markers the form reserves — `$jsonschema:`, `$mode:` and `$ref:`. Unknown keys are refused as the schema is read rather than dropped, because a mistyped constraint that is ignored becomes no constraint at all, and a schema that looks enforced and enforces nothing is worse than one that fails.

The refusal is met wherever a schema is compiled. A SchemaLibrary's entries are compiled as the catalog loads; a Component's `spec.schema`, its per-socket `valueSchema` and `infraSchema`, and the schemas a Feature and a provider Plugin declare are compiled when the catalog is read — where the same fault arrives inside "A declared schema contract cannot be read as a schema" below, carrying the sentence quoted here as its detail.

The compact-form compiler's own sentence names the position inside the schema, the source line, and the key it did not recognise:
> compactform at `<path-inside-the-schema>`:`<line>` (keyword `"<key>"`): unknown keyword

A key written beside a cross-document `$ref:` reports under the same condition, with a sentence of its own, because only three siblings may accompany such a reference:
> compactform at `<path-inside-the-schema>`:`<line>` (keyword `"<key>"`): cross-document $ref sibling not allowed (allowed: properties, required, description)

and where that sibling asked to reopen the merged shape, the sentence carries the way to do it instead:
> compactform at `<path-inside-the-schema>`:`<line>` (keyword `"additionalProperties"`): cross-document $ref sibling not allowed (allowed: properties, required, description); use $jsonschema: to embed an open-object schema if the merged shape must accept arbitrary properties

The condition it is recorded under is `compactform: unknown keyword`, which is what its short code resolves to.

**How to fix:** correct the key at the position the sentence names, against the keyword vocabulary in [`compact-form-authoring.md`](../vocabulary/compact-form-authoring.md) — a misspelling is the commonest cause. Where the shape genuinely needs a JSON Schema keyword the compact form does not carry, write that fragment under `$jsonschema:`, which embeds JSON Schema verbatim. Beside a cross-document reference, keep only `properties:`, `required:` and `description:`; anything else belongs in the library entry the reference points at.

### A compact-form schema declares a field literally named `type`

<!-- covers: pkg/compactform.ErrAmbiguousDispatch -->

The compact form decides what a mapping means from the shape of its content: a `type:` key marks a constraint leaf, structural JSON Schema keywords mark a fragment to pass through, and a mapping of plain names marks an object whose children are schemas. A schema declaring a field *named* `type` is the one shape those readings cannot tell apart — it looks like a constraint leaf and is meant as an object with one field — so the form asks the author to say which, with a `$mode:` key set to `compact` or `jsonschema`.

This condition is what a `$mode:` written with any other value reports. The marker exists to settle the ambiguity, so a value that settles nothing is refused rather than guessed at.

The compact-form compiler's own sentence:
> compactform at `<path-inside-the-schema>`:`<line>` (keyword `"$mode"`): value must be `compact` or `jsonschema`

The condition it is recorded under is `compactform: ambiguous dispatch — $mode required`, which is what its short code resolves to.

**How to fix:** set `$mode: compact` where the mapping is a compact-form object whose fields happen to include one called `type`, or `$mode: jsonschema` where the mapping is a JSON Schema fragment to be taken as written. Where neither reading was intended, renaming the field clears the ambiguity without a marker at all.

### A `$jsonschema:` escape carries content that is not a schema

<!-- covers: pkg/compactform.ErrEscapeContentInvalid -->

The `$jsonschema:` key embeds a JSON Schema fragment verbatim, for shapes the compact form does not express. What it embeds is taken as written and is never translated, so it has to *be* a schema: a block scalar that parses as YAML, or a nested mapping. Content that is neither is refused here rather than passed on to be validated against, where the failure would be reported against the schema's consumer instead of against the schema.

Four shapes report under this condition, and the sentence says which one you have. The escape body does not parse as YAML. The escape's value is neither a block scalar nor a mapping. A `properties:` key holds something that is not a mapping of names to schemas. And, at the outermost level, the document handed to the compiler is empty or carries a node the reader has no rule for.

The compact-form compiler's own sentences:
> compactform at `<path-inside-the-schema>`:`<line>` (keyword `"$jsonschema"`): escape content does not parse as YAML: `<what the parse reported>`
> compactform at `<path-inside-the-schema>`:`<line>` (keyword `"$jsonschema"`): expected block-scalar string or nested mapping
> compactform at `<path-inside-the-schema>`:`<line>` (keyword `"properties"`): expected a mapping of property names to schemas
> compactform: unsupported YAML node kind

The condition it is recorded under is `compactform: $jsonschema content invalid`, which is what its short code resolves to.

**How to fix:** write the escape body as a block scalar under `$jsonschema:` — a body whose first line reads as a YAML key is otherwise absorbed into the surrounding mapping, which is the common cause — and check that what it holds is valid JSON Schema on its own. Where the fragment was small enough to express in the compact form, dropping the escape is the simpler answer.

### A compact-form constraint does not apply to the type it was written on

<!-- covers: pkg/compactform.ErrConstraintTypeMismatch -->

Compact-form constraints are dispatched by the field's declared type: `min:` and `max:` become a numeric bound on a number, a length bound on a string, and a count bound on an array. So a constraint has to sit on a field whose type accepts it, and the type has to be a single value for the dispatch to have an answer at all.

Four shapes report under this condition. A constraint written where `type:` is absent or names a union, so nothing decides which bound was meant. A constraint written on a type that takes no bound of that kind — an object, or a boolean. A `type:` whose value is neither a scalar name nor a sequence of names. And a `valuesType:` given something other than a scalar name.

The compact-form compiler's own sentences:
> compactform at `<path-inside-the-schema>`:`<line>` (keyword `"<constraint>"`): constraint applies to a single declared type (integer/number/string/array); `type:` is unresolved (union or absent) — narrow `type:` to a single value or remove this constraint
> compactform at `<path-inside-the-schema>`:`<line>` (keyword `"<constraint>"`): constraint applies to integer/number/string/array; declared type is `<the type as written>`
> compactform at `<path-inside-the-schema>`:`<line>` (keyword `"type"`): expected a scalar type name or a sequence of type names (JSON Schema 2020-12 array-of-types); got unsupported node kind
> compactform at `<path-inside-the-schema>`:`<line>` (keyword `"valuesType"`): expected a scalar type name

The condition it is recorded under is `compactform: constraint not valid for declared type`, which is what its short code resolves to.

**How to fix:** the sentence names both halves — the constraint and the type it met. Narrow `type:` to a single name where it holds a union, add it where it is missing, or drop the constraint where the field genuinely takes any of several types. A bound that has to vary with the type is expressed as a set of alternatives under `$jsonschema:`, where each branch carries its own type and its own bound.

### A `$ref:` is not written in a form the compiler can resolve

<!-- covers: pkg/compactform.ErrReferenceUnresolvable, pkg/compactform.ErrUnresolvedSchemaLibraryRef -->

A schema references another shape with `$ref:`, either inside the same document or across documents into a SchemaLibrary entry. Two conditions cover the two ways a reference fails, and the sentence tells you which you have: the reference is not *written* in a form the compiler reads, or it is well-formed and names a target that is not there.

**The reference is not readable.** The value is empty, or its cross-document form is not `<Library>#/schemas/<Entry>`, or it separates the version with `@` — which is reported with the corrected spelling rather than as a generic complaint, because it is the mistake this form attracts most:
> compactform at `<path-inside-the-schema>`:`<line>` (keyword `"$ref"`): expected a non-empty reference URL
> compactform at `<consumer-document>` (keyword `"$ref"`): cross-document $ref shape must be `<LibraryName>#/schemas/<EntryName>`: `<the value as written>`
> compactform at `<consumer-document>` (keyword `"$ref"`): cross-document $ref version separator is ':', not '@' — use `<the corrected value>`: `<the value as written>`

The condition those are recorded under is `compactform: $ref unresolvable`.

**The target is not there.** The reference reads correctly and the library or the entry inside it is absent — or no library catalog was supplied to resolve against at all:
> compactform at `<consumer-document>` (keyword `"$ref"`): SchemaLibrary `<library>` not found in catalog (referenced from `<consumer-document>`): `<the value as written>`
> compactform at `<consumer-document>` (keyword `"$ref"`): entry `<entry>` not found in SchemaLibrary `<library>`: `<the value as written>`
> compactform at `<path-inside-the-schema>`:`<line>` (keyword `"$ref"`): cross-document $ref but no SchemaLibrary catalog supplied: `<the value as written>`

The condition those are recorded under is `compactform: cross-document $ref target not found`.

Keeping the two apart is what makes the report actionable: the first is a value to rewrite in the document you are looking at, and the second is a question about what the build can see. A reference that expands into itself is a third thing again, and reports as "A library reference expands into itself" above.

**How to fix:** for an unreadable reference, rewrite the value — `<Library>#/schemas/<Entry>` for a cross-document reference, `#/$defs/<name>` for one inside the same document — and use `:` before a version floor rather than `@`. For an absent target, confirm the entry's name against the library that publishes it, and confirm the library is reachable from the Release's dependency closure: a library nothing declares a dependency on is not loaded, so a correct reference into it still resolves to nothing.

### A `$ref:` addresses a library by registry location

<!-- covers: pkg/compactform.ErrHostInLibraryRef -->

A cross-document `$ref:` names its library by identity — the library's bare name, then `#` and the path of the entry — and never by the registry it happens to be published to. Which registry a name resolves through is workspace configuration and which version is used is the lockfile's answer, so a reference carrying a host would fix in the schema two things the build is meant to decide, and would move the schema between workspaces as a broken reference.

Where the host-bearing value still parses into a library and an entry, the sentence carries the identity-form spelling to use instead:
> compactform at `<consumer-document>` (keyword `"$ref"`): cross-document $ref carries a registry host; reference the library by identity (use `<Library>#/schemas/<Entry>`): `<the value as written>`

and where it does not, the sentence ends after the value:
> compactform at `<consumer-document>` (keyword `"$ref"`): cross-document $ref carries a registry host; reference the library by identity: `<the value as written>`

The condition it is recorded under is `compactform: cross-document $ref carries a registry host; reference the library by identity`, which is what its short code resolves to.

**How to fix:** drop the host and everything before the library name, leaving `<Library>#/schemas/<Entry>`. Where a version floor is wanted, write it after the library name as `:<version>`. The same rule governs the `$import:` fields on a Recipe and a FeatureRecipe, which report separately under "A library `$import:` addresses its library by registry location" below.

### A schema `$import:` cannot be applied

<!-- covers: pkg/catalog.ErrUnusableSchemaImport -->

A Component's or Feature's `spec.schema` — its whole block or one pillar of it — and a `usesSchema` socket's `valueSchema:` or `infraSchema:` may each be written as `$import:` naming a file beside the entity. The import is applied when the entity is loaded, so every later reader sees the imported contract rather than the pointer. This condition is what happens when something you wrote is at fault: the directive itself, or the shape of what the file it names turned out to hold.

Those faults are one condition because each leaves the same surface unusable and gives you the same thing to do — correct the directive, or the file it names. The diagnostic opens with the fixed sentence and then says which fault, so the sentence is the part to match on and the clause after it is what to act on:

> a schema `$import:` could not be applied. `<surface>`: `<the clause for this occurrence>`

The clause names the surface it read — `spec.schema`, a pillar of it such as `spec.schema.values`, or a socket's `valueSchema` — followed by the specific fault. The faults, and what each means:

- **`$import:` must be the only key when a schema is imported from a file.** The directive shares its mapping with authored schema content. `$import:` replaces a whole value, so a sibling key has nothing to combine with.
- **`$import:` value must be a path to a file.** The value is empty, or is not a single string.
- **`$import:` takes a file path beside this entity, not a registry location `<value>`.** The value addresses a registry. Which registry a name resolves through is workspace configuration, so a schema surface never carries one; the message names the reference form to use instead.
- **`$import:` takes a file path beside this entity; reference the SchemaLibrary entry `<value>` with `$ref:` instead.** The value addresses a library entry. A library entry is referenced, not imported — `$ref:` is the keyword that resolves one.
- **imported schema `<value>` must be a YAML map of schema content; it is not.** The file was found, read and parsed, and what it parsed to is a scalar or a sequence, so there is no schema content to substitute.

The head carries the category and this condition's short code, `E0266`, which is the identifier to record when you need this halt named durably — in a continuous-integration gate, an issue, or a runbook. A number is handed out once and then fixed, so it stays the same however the wording around it improves; [the table of every condition](./sentinels.md#every-condition-by-short-code) resolves it.

**A directive that is well-formed and names a file the build cannot get hold of reports elsewhere, under a different code.** A path that does not resolve, a file that is not there or cannot be read, and bytes that do not parse as YAML are not faults in what you wrote — there is no imported document to judge — so they report as the load they are, under "A file cannot be read, or its bytes do not parse" above, which documents the clause each of them carries. Match on that condition, and record its code, when what you are catching is a missing or unreadable import file.

A path is resolved against the directory holding the entity file, the same base every other import-bearing field uses. An import whose content itself declares an `$import:` is followed, and a chain that returns to a file already in flight reports as "A library reference expands into itself" above rather than here.

**How to fix:** make `$import:` the only key in its mapping, and give it a relative path to a YAML file beside the entity whose top level is a map of schema content. To consume a shape a SchemaLibrary publishes, use `$ref: <Library>#/schemas/<Entry>` instead — a library entry is referenced rather than imported.

### A schema block names a key that is not a data pillar

<!-- covers: pkg/validator.ErrUnknownSchemaPillar -->

A Component's or Feature's `spec.schema` block carries the entity's data pillars, and three keys are the whole of what it admits: `values`, the shape the developer fills per instance; `infra`, the physical sizing the operator supplies; and `provides`, the keys the entity exposes to whatever consumes it. This condition is what happens when the block carries some other key at its top level.

The set is closed rather than open, for the same reason each pillar's own content is validated closed: a block that enumerates a legal surface makes anything outside that surface an error. A key nothing recognises would carry a contract nothing ever compiles, validates against, or hands to a consumer — so what you wrote beneath it would look declared and be inert. That is harder to notice than a contract you never wrote at all, which is why the block is refused rather than the stray key ignored.

The diagnostic opens with the fixed sentence, then names the entity, the rule, the site the key was written at, and what to write instead:

> a schema block declares a key that names no data pillar (`<Kind>` `<name>`, rule schema-pillars, at `.spec.schema.<key>`). rename `"<key>"` to one of the pillar keys, or remove it and the contract beneath it; allowed: values, infra, provides. See vocabulary/data-pillars.md for the canonical pillar set.

The head carries the category and this condition's short code, `E0267`, which is the identifier to record when you need this halt named durably — in a continuous-integration gate, an issue, or a runbook. A number is handed out once and then fixed, so it stays the same however the wording around it improves; [the table of every condition](./sentinels.md#every-condition-by-short-code) resolves it.

**Two things written at that position are not keys of this set, and neither reports here.** A `$import:` naming a file beside the entity is replaced by that file's content before the block is read, so what this condition inspects is the imported document's own top level — a stray key *inside* the imported file reports here, and the directive itself never does. And a Component that declares `extends` writes the bare string `inherited` in place of the block, which is a scalar carrying no keys at all.

**How to fix:** the sentence names the key it met and the three it admits, so the commonest cause — a misspelling, or a singular where the pillar name is plural — is visible from the diagnostic alone. Where the content beneath the stray key belongs to a pillar, move it under `values:`, `infra:` or `provides:` as its ownership dictates; [`data-pillars.md`](../vocabulary/data-pillars.md) says which pillar owns what. Where it was meant as schema content in its own right, it belongs one level deeper, inside a pillar, rather than beside them. A shape published by a SchemaLibrary is reached with `$ref: <Library>#/schemas/<Entry>` written inside a pillar, not at the block.

### A plugin asks the host to parse a source while a parse is already running for it

<!-- covers: internal/wasm.ErrProducerConsumptionReentry -->

A plugin may ask the host to parse a source and hand back the result, so that a plugin needing a document in some format does not have to carry a reader for it. The host runs the plugin that produces the parse and returns what it produced. This condition is what happens when the plugin reached that way asks for a parse of its own: the request would re-enter the same mechanism it is already running inside, and the host refuses instead of descending. One level of this is what the mechanism offers, and the refusal is what holds it to one.

**The denial reaches the plugin, not the build.** The host does not stop there and unwind; it answers the call with a failure envelope carrying the sentence below and a code naming the refusal, and the plugin that asked receives it as the answer to its request. What the build then does depends on what that plugin does with the answer — a plugin that treats it as fatal ends the build, one that reports and carries on does not. The refusal itself is the same either way.

It is neither plugin's fault in particular: the guard covers whatever pair of plugins the request routed through rather than one named pairing, so the same refusal is met wherever the mechanism is re-entered.

Emitted message, as the plugin receives it:
> aggrega_parse_source: producer-consumption re-entry denied: a producer reached through the host may not issue a further producer-consumption call

**How to fix:** nothing in your own files causes this and no authoring change clears it — it is a property of the plugins the build is configured with. The plugin that asks for a parse from inside a parse is the one to correct, so report the condition to whoever publishes it, quoting the message. Where that plugin is yours, have it read the source it was handed directly rather than asking the host to parse another one while it is itself serving a parse.

### The workspace configuration file does not satisfy its schema

<!-- covers: pkg/workspaceconfig.ErrConfigInvalid -->

A workspace is described by an `.aggrega-config.yaml` at its root: which registry it publishes to and pulls from, where the artifact cache lives, which plugins are attached at which sockets, and what each registry's signing stance is. That file is read and checked against its schema before any entity file is opened, because everything that follows is read out of it.

**A missing file is not a failure.** A workspace with no configuration file gets the documented defaults, so this halt never names a file that is absent. It names the file that carried the value — or, for a setting an environment variable overrides and the schema never sees, the variable.

The check runs before the document is turned into typed settings. That ordering is what lets the message name the field path the schema objected to, rather than reporting a type mismatch from somewhere further along with no field to point at.

These shapes report here beyond a plain schema objection, each because the schema alone can only say something too generic to act on: a `workspace:` key written with nothing under it, a key whose home is the top level written underneath `workspace:` instead, a `cache:` block written under a name the file does not use, a registry host not written the way a registry host is written, and two settings whose values the schema admits but the workspace cannot use — an `artifact_cache_dir` that is absolute or that names the workspace root itself, and a `signing.kinds` entry naming something that is not a publishable artifact kind.

A registry host — the `host` of a `registries` entry, or the host `default_registry` begins with where it does not name one of those entries by its `name:`, in which case it stands for that entry's host — is written as the host itself: lowercase, containing a dot, or `localhost`, or a single name followed by a port, or an IP address (an IPv6 one in brackets), each with an optional `:port`, and no scheme or credentials. A `registries` entry's host carries no path; `default_registry` may follow its host with `/` and a repository path — lowercase segments joined by `/`, with no tag, digest or trailing `/`. A value that names a host in another spelling is refused naming the spelling to write — for `default_registry`, the whole location, path included — so that the trust policy kept under that host applies to it; that includes port 443 on a host reached over HTTPS, since it is that host's default port. A path that is not a repository path is refused naming the host it follows, and an entry's `name:` followed by a path is refused naming the two spellings written instead, the name alone or the entry's host followed by the path, since a name stands for its entry's host and not for a location under it. A value that names no host at all — a single name with no port that no entry carries, text with spaces or braces in it — is refused as not a host, and for `default_registry` the refusal says an entry's name would do as well. `AGGREGA_DEFAULT_REGISTRY` is held to the same reading and refused the same way, naming the variable.

**Emitted messages.** A schema objection names the file, the field path, and what the schema said:
> workspaceconfig: `<path>`: `<field-path>`: `<the schema's own objection>`: file failed schema validation

The fix-it forms open with the file and say a sentence about the specific shape in place of the field path and the schema's objection. An `artifact_cache_dir` naming the workspace root:
> `<path>`: artifact_cache_dir `"<value>"` names the workspace root itself; a catalog directory at the workspace root would then be stepped over as cache, leaving nothing to load — give the cache its own subdirectory (for example `.aggrega/cache`): file failed schema validation

an unusable `signing.kinds` entry, which also names the wildcard that covers every kind:
> `<path>`: signing.kinds entry `"<kind>"` is not a signable artifact kind; use a catalog entity or plugin kind, or `"all"` for every kind: file failed schema validation

a registry host written in another spelling, here `HUB.AGGREGA.AI`:
> `<path>`: default_registry `"HUB.AGGREGA.AI"` is not written as the registry host it names; write `"hub.aggrega.ai"` — lowercase, with no scheme, path, credentials or default port — which is the spelling that host's trust policy is kept under: file failed schema validation

a default registry whose host is written in another spelling ahead of its repository path, here `GHCR.io/acme`, which names the whole location to write:
> `<path>`: default_registry `"GHCR.io/acme"` is not written as the registry location it names; write `"ghcr.io/acme"` — the registry host lowercase, with no scheme, credentials or default port, followed by the repository path — which keeps that host's trust policy applying to it: file failed schema validation

an entry's name followed by a path, here `local/acme` where the entry named `local` is for `127.0.0.1:5000`:
> `<path>`: default_registry `"local/acme"` is the name of the registries entry `"local"` followed by a path, and an entry's name stands for that entry's host alone; write `"local"` to use the entry, or its host followed by the path, `"127.0.0.1:5000/acme"`: file failed schema validation

a value that names no host, whose sentence lists the forms a host takes:
> `<path>`: registries[`<n>`].host `"<value>"` is not a registry host; write a lowercase host name containing a dot (registry.example.com), localhost, a single name followed by a port (registry:5000), or an IP address, an IPv6 one in brackets — each with an optional :port and nothing else: file failed schema validation

and an empty `workspace:` marker:
> workspaceconfig: `<path>`: `workspace` must be a mapping; write `workspace: {}` to mark a workspace root with no catalog directories: file failed schema validation

Two more name a key written in the wrong place — `default_registry`, `offline`, `auto_pull` and `artifact_cache_dir` all sit at the top level rather than under `workspace:`, and the parse cache's block is `parse_cache:`. Each says which key it means and where that key belongs.

**How to fix:** open the file the message names and go to the field path it quotes. Where the message carries a fix-it sentence, it names the correct spelling or placement directly and no further reading is needed. Where it carries a schema objection instead, the field path is the key at fault and the objection says what the schema wanted there — the entity pages do not govern this file, so read the objection rather than looking for an entity contract. An `artifact_cache_dir` is written relative to the workspace root and needs a subdirectory of its own, so that a catalog directory at the workspace root is not mistaken for cache and skipped.

### A plugin binding sets a key the socket it attaches to does not read

<!-- covers: pkg/workspaceconfig.ErrCapabilityOnCrossCuttingSocket -->
<!-- covers: pkg/workspaceconfig.ErrInertFieldOnProviderSocket -->

Sockets in the workspace configuration attach plugins in two different ways, and a key that belongs to one way means nothing on the other. Rather than accept the key and quietly ignore it, the configuration is refused, so an operator learns the setting is inert instead of wondering later why it had no effect.

The two mismatches are mirror images of each other.

- **A cross-cutting socket bound by capability.** The governance, linter and importer sockets attach a plugin directly by `uri:`. A governance or linter plugin serves no capability, so a `capability:` binding there would be looked up against nothing and match nothing — an attachment that can never resolve. An importer does advertise the formats it handles, but which format is wanted is the import's to say rather than the attachment's: an importer attachment names its importer by `uri:`, and that is what chooses it among the importers advertising the format an import asks for.
- **A provider socket setting a key with no referent.** A provider binding names a capability and the plugin that serves it, and the plugin drives a fixed set of exports rather than one selectable entry, so `function:` names nothing on it. `with:` is refused for a different reason: render configuration for a provider is written in the Recipe, so putting it on the workspace binding places it on the wrong side of the developer-and-operator split.

**Emitted messages.** A capability on a cross-cutting socket:
> workspaceconfig: the `<socket>` socket is bound by capability `"<capability>"`, but the cross-cutting sockets attach by uri: their plugin serves no capability, so a capability lookup matches nothing; attach it with `uri:` instead: a cross-cutting socket is bound by capability but attaches by uri

an inert `function:` on a provider binding:
> workspaceconfig: the provider socket binding for capability `"<capability>"` sets `function:`, but a provider drives a fixed set of phase-keyed exports rather than one selectable entry, so `function:` names nothing there; remove it: a provider socket binding sets a field with no referent on that socket

and an inert `with:`, which reports in the same shape and names where the configuration belongs instead:
> workspaceconfig: the provider socket binding for capability `"<capability>"` sets `with:`, but provider render configuration belongs in the Recipe, not the workspace provider binding; remove it: a provider socket binding sets a field with no referent on that socket

**How to fix:** the fix is in `.aggrega-config.yaml` and each message names the exact edit. On a governance, linter or importer attachment, replace the `capability:` with the `uri:` of the plugin you meant to attach. On a provider binding, remove the named key — and where it was `with:`, move that configuration into the Recipe that renders through the provider, which is the surface that reads it.

### A capability is bound to more than one provider plugin

<!-- covers: pkg/workspaceconfig.ErrDuplicateProviderTarget -->

A capability names one way of turning a workload into artifacts, and exactly one plugin serves it in a resolved workspace. Two bindings for one capability leave no answer to which of them renders, and a workspace configuration is assembled from several layers — a shared file, a workspace file, and the append companions each may contribute — so the second binding is often contributed by a layer whose author could not see the first.

The refusal is what makes that visible. Letting one binding win silently would make rendered output depend on which layer happened to be read last.

Emitted message, naming the capability and the rule:
> workspaceconfig: capability `"<capability>"` is bound to more than one provider plugin; keep exactly one plugins.providers entry per capability: capability is bound to more than one provider plugin

**How to fix:** keep one `plugins.providers` entry for the capability the message names and remove the other. Where the two come from different configuration layers, the layer you control is the one to edit — removing your own entry adopts the one the shared layer contributes, and keeping yours means the shared layer's entry has to go instead. Two plugins that genuinely both serve the workspace serve two different capabilities, so if both are wanted, give each its own capability rather than binding one twice.

### An importer is attached by more than one `plugins.importer` entry

<!-- covers: pkg/workspaceconfig.ErrDuplicateImporterAttachment -->

A `plugins.importer` entry attaches the importer its `uri` names: where that importer advertises the format an import asks for, the entry decides which version of it runs and hands it the entry's `with.sources` and `with.settings`. One entry does that for one importer, so a second entry naming the same importer — the same identity, at the same version or at another — would be read by nothing, and its `with` would reach no importer without a word said. The configuration is refused when it loads instead, whichever command reads it.

A workspace configuration is assembled from several files — the global file, each `.aggrega-config.yaml` from the project root down to the directory a command runs in, the `importer_append` companion each may carry, and a pipeline's `.aggrega-config-append-ci.yaml` — so the second entry is often written in a different file from the first. The message names the importer and both entries, the earlier first, each by the key and position it is written under, the file it was written in, and its `uri` as written there.

Only the importer list is judged: the governance and linter lists accept one plugin attached more than once, each attachment carrying its own `with`. An entry whose `uri` is a filesystem path names no importer, so it is not compared.

Emitted message:
> importer `"<identity>"` is attached by `<key>[<position>]` in `<file>` (uri `"<uri>"`) and again by `<key>[<position>]` in `<file>` (uri `"<uri>"`); keep exactly one plugins.importer entry per importer, its uri naming the version you want: importer is attached by more than one plugins.importer entry

**How to fix:** keep one entry for the importer the message names — the one whose `uri` names the version you want, carrying the `with` you want that importer handed — and remove the other. Where the two are in different files, the file you control is the one to edit: removing your entry adopts the other file's, and keeping yours means the other file's entry has to go instead.

### A provider binding names a capability containing a colon

<!-- covers: pkg/workspaceconfig.ErrColonInProviderBindingCapability -->

A Recipe's `capability:` is read as the capability name up to its last colon and a version pin after it — `helm:1.0.0` asks for the capability `helm` at version `1.0.0`. A `plugins.providers` entry is looked up under that name, so the capability a binding names never carries a colon, and an entry whose capability does is one no Recipe can ever reach. Rather than let it sit in the configuration unread, the configuration is refused when it loads, whichever command read it.

Only the provider list is judged. The importer list shares the entry shape, but its plugins are attached by `uri:` and name their formats `import:<format>`, where the colon is part of the name. A binding's `uri:` may still end in `:<version>`; it is not the part this rule reads.

Emitted message, naming the capability:
> the provider socket binding for capability `"<capability>"`: a Recipe's capability reference is read as the capability up to its last colon and a version pin after it, so the capability a binding names carries no colon; bind the capability name alone and let each Recipe pin the version it needs: a provider socket binding names a capability containing a colon, which no Recipe can select

**How to fix:** write the capability name alone in the entry — `capability: helm` — and pin versions where they belong: a Recipe pins the provider version it needs in its own `capability:`, and a binding that should select a particular version of its plugin writes it on the plugin identity, `uri: provider/helm:1.0.0`.

### A governance attachment declares no role, or one that is not a known role

<!-- covers: pkg/workspaceconfig.ErrGovernanceRoleInvalid -->

A governance attachment carries a role, and the role — not the plugin's own declared kind — is what fixes where the attachment runs and what it may do: whether it accepts or rejects a build, and whether it reads the graph or the rendered artifacts. Attachments are dispatched by reading that role, so an attachment carrying none, or one nobody recognises, would attach to nothing and be passed over in silence.

That silence is what the refusal prevents. A governance plugin that is configured and never consulted produces exactly the output of a build that was never governed, and nothing in the result says which one you are holding.

**Emitted messages**, both naming the attachment and listing the roles that exist. A missing role:
> workspaceconfig: governance attachment `"<uri>"` declares no role; set `role:` to one of `<the known roles>`: a governance attachment declares no role or an unknown role

and an unrecognised one:
> workspaceconfig: governance attachment `"<uri>"` declares unknown role `"<role>"`; use one of `<the known roles>`: a governance attachment declares no role or an unknown role

**How to fix:** set `role:` on the attachment under `plugins.governance` to one of the roles the message lists. Which one is a decision about what you want the plugin to do rather than about the plugin: a role that accepts or rejects reads the build and returns a verdict, and a role that transforms is an explicit instruction to let the plugin change what it is given. The message lists the full set, so the spelling to use is in the message itself.

### A registry alias matches more than one host

<!-- covers: pkg/workspaceconfig.ErrAmbiguousRegistryAlias -->

A registry may be given a short alias in the workspace configuration so that commands and references can name it without spelling out its host. An alias selects exactly one host. This condition is what a token matching the alias of two registry entries reports: there is no answer to which host was meant, and choosing one would silently send artifacts to, or fetch them from, a registry the author did not name.

Emitted message, naming the alias, how many entries claimed it, and which hosts they are:
> registry alias `"<alias>"` matches `<count>` hosts (`<hosts>`); address the registry by host or remove the duplicate alias: registry alias matches more than one host

**How to fix:** open `.aggrega-config.yaml` and give the alias to one of the hosts the message lists, or address the registry by its host and drop the alias from the reference. The message names every host holding the alias, so which entries to look at is in the message. Where the entries come from different configuration layers, edit the layer you own.

### The lockfile does not satisfy its schema

<!-- covers: pkg/lockfile.ErrLockfileInvalid -->

A release's lockfile records what the build resolved to: for every entity, library and plugin it reaches, the version selected and the digest of the bytes at that version. It is read and checked against its schema before it is turned into typed pins, so a document that does not fit is refused with the field path it failed at rather than silently producing pins with holes in them.

**The lockfile is machine-written.** It is produced by the pull that resolves a release, and it is committed so the same build resolves the same way later. So a schema failure is nearly always a hand edit or a merge that left the document half-resolved, rather than something authored deliberately.

**A missing lockfile is a different condition and reports differently** — the lockfile is required, so its absence is reported where the build looks for it, with the instruction to run the pull that creates it.

Emitted message, naming the file, the field path and the schema's own objection:
> lockfile: `<path>`: `<field-path>`: `<the schema's own objection>`: lockfile: file failed schema validation

A document that is entirely empty reports separately, since there is no field to name:
> lockfile: `<path>`: document is empty

**How to fix:** do not repair the lockfile by hand. Re-run the pull for the release, which rewrites the document from the resolution it performs, and commit the result — re-resolving is what produces a document whose pins agree with what the release actually reaches. Where the failure followed a merge, resolving the conflict by re-pulling rather than by editing is what avoids a document that parses and pins the wrong versions. The field path in the message is worth reading first: it tells you whether the damage is in one entry or in the document's overall shape.

## When resolving the catalog

After loading, the compiler walks the Manifest's two tiers (type map, then name map) to pick the Recipe for every Component, and it walks any `extends` chains on Manifests, Components, or Features. A Release's own `extends` chain is followed by the same walk, one step earlier: it is followed as the Release is resolved, before either the Manifest or the Aggregate it names is looked for, so the conditions below report against the Release rather than against a sibling pointer the chain was going to supply.

### Cyclic extends chain

<!-- covers: pkg/validator.ErrCyclicExtension -->

A chain of `extends` pointers loops back on itself. Every kind that declares `extends` — Component, Feature, Manifest and Release — is walked by one chain walk, so a loop is reported in the same words wherever it is found.

Emitted message. The sentence naming the condition opens it, then the entity the resolution started from and the rule that refused it, and then the edge that **closes** the loop — the entity carrying the offending `extends:` and the reference it declares:
> cyclic extends chain (`<kind>` `<name>`, rule extends). `<entity>` extends `<reference>`, which is already in the chain; remove the extends on `<entity>`, or point it at an entity outside the chain

The entity named first and the entity named in the edge are usually **different**, and that is the point: a loop is reported against every entity on it, while the `extends:` line to edit is the one the edge names. Follow the edge, not the heading.

For a Manifest, `<kind>` reads `Manifest`, each entity is named by its `metadata.name`, and `<reference>` is the `extends:` value exactly as written — a relative path such as `./base.yaml`, or the bare `metadata.name` of a Manifest beside the Release. Which of the two forms you wrote does not change what is reported: a Manifest link is the **file** it resolves to, so two Manifest files that happen to declare one `metadata.name` are two links and a chain through both is not a loop.

A Release reads the same way, and the file-identity point matters more there because the shape it protects is ordinary: `<kind>` reads `Release`, `<reference>` is the relative path the `extends:` names, and a Release link is the file it resolves to. Two Release files naming the deployed system rather than the environment — both `metadata.name: shared-release`, one extending the other — are two links, and a chain through both is not a loop.

**A loop is reported as a loop however long it is.** The chain walk applies its depth bound only to a chain that ends, so a cycle spanning more entities than the bound allows still reports here rather than as an over-deep chain — the remedy for a loop is never to shorten it.

**How to fix:** open the entity the edge names, and either remove its `extends:` or point it at an entity that is not already on the chain. Where several tiers were meant to share content, collapsing the duplicated content into a single base entity removes the loop and the duplication together.

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

<!-- covers: pkg/resolver.ErrMalformedRecipeReference -->

A Manifest mapping value names a Recipe or FeatureRecipe in a shape the reference grammar cannot express. A recipe reference accepts a bare name, a name with a version, a capability-qualified name, or a capability-qualified name with a version — at most one `/`. A value carrying more than that (a component-type-style path such as `core/helm/eso-aws-fetcher:1.0.0`) can never name a catalog entity, whatever the catalog holds.

The shape is judged as the Manifest is composed, before anything is looked up — the verdict comes from counting separators in a string, so it needs no catalog at all. Judging it there is what makes the diagnostic honest: the recipe the value *meant* is frequently present and correctly named, and being told it is missing sends you looking for the wrong thing. Every command that resolves a Release's dependencies reports it the same way, so it does not depend on which one you happen to run.

Emitted message:
> malformed recipe reference in a Manifest mapping value: `spec.mappings.components.type.<key>` maps to `<value>`, which carries `<n>` slash-separated segments; a recipe reference accepts `"name"`, `"name:version"`, `"capability/name"` or `"capability/name:version"`; correct the mapping value in the Manifest

The `features` section produces the same message against its own coordinate, and a feature recipe reference is named as such.

**How to fix:** shorten the mapping value to a shape the grammar accepts. A recipe is identified by its own `metadata.name` — optionally prefixed with its `spec.capability` and suffixed with its version — never by the component-type path it implements. The mapping's *key* is the component type; the mapping's *value* is the recipe.

**Not to be confused with** a well-shaped value naming a recipe the catalog does not hold: that is a genuinely absent entity and still reports as one, naming the URI and the mapping entry that referenced it.

### Several Recipes implement one Component type

Two or more Recipes declare the same Component type under `spec.implements:` — two exact-version Recipes for one type, or an unversioned Recipe alongside a pinned one.

**This raises no halt of its own, and it is not an ambiguity the build has to resolve.** Recipe selection is mapping-only: nothing reads `spec.implements:` and chooses among the candidates, so however many Recipes implement a type, the one that renders an instance is the one the Manifest maps it to. `spec.implements:` is read as a consistency anchor — confirming the Recipe an author mapped is one that declares the type they mapped it under — and as the source of the pin candidates a halt suggests. It never selects.

What you meet instead is the halt for an instance the Manifest maps to nothing, and that halt lists every Recipe implementing the type so you can pin one — see "No Recipe is mapped for a component or feature instance" below. It reports the same way whether one Recipe implements the type or five, which is why there is no separate ambiguity condition to look up.

**How to fix:** add the mapping. A type-keyed entry routes every instance of the type; a name-keyed entry routes one named instance and is read first, so it is also how you give one instance a different Recipe from its siblings.

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

The same holds for an attachment a connection carries. When the Aggregate's connection entry and the Release's entry for the same connection both write an attachment under one slot and name different Features, the build halts at the Release's entry — where the second type was written — once the composition is flattened, naming both types, the slot, the connection, the socket and the component:
> feature merge conflict: reconcile the Aggregate and Release declarations for the feature (Release `<release-name>`, at `.spec.boundaries.<boundary>.components.<component>.uses.<socket>.<alias>`, the Aggregate names `"<aggregate-declared-type>"`, the Release names `"<release-declared-type>"`, for the slot `"<slot>"`, on the connection `"<alias>"`, through socket `"<socket>"`, of component `"<component>"`). Drop the type from the Release's entry so it sizes the attachment the Aggregate declares, or name the same Feature in both documents.

**How to fix:** reconcile the two declarations. Aggregate-side and Release-side declarations of the same feature instance combine by pillar — Aggregate contributes `values`, Release contributes `infra`. If both sides specify the same non-pillar field (such as `type:`), the values must match; correct one side to match the other, or drop the redundant declaration.

### Annotation binding does not resolve against its target Feature

<!-- covers: pkg/resolver.ErrAnnotationBindingTargetUnresolved -->

A Manifest annotation binding's `feature:` field names a Feature that the catalog does not load, or the binding's `maps.infra` / `maps.values` lists declare dotted paths that the named Feature's `spec.schema` does not actually carry. Either condition halts workspace load — the binding would synthesize Feature attachments routing values into paths the runtime cannot resolve.

One condition covers the three ways a binding's route fails to resolve, and the diagnostic names which of them was met:

- **Feature not found.** The `feature:` value references a Feature URI absent from the loaded catalog.
- **Feature schema does not resolve.** The named Feature loads, but its `spec.schema:` does not resolve to a JSON Schema 2020-12 representation — the content is malformed, or it names a cross-document reference that cannot be followed. This variant carries the resolution failure's own diagnostic behind it, so the reason the schema did not resolve is readable from the same halt.
- **Binding path not in target schema.** The binding's `maps.infra` or `maps.values` entry names a dotted path the Feature's `spec.schema.<pillar>.<path>` does not declare.

Emitted message (Feature-not-found variant):

> annotation binding does not resolve against its target Feature (Manifest, at `.spec.mappings.features.annotations.<key>`, `"<key>"`, routes to Feature `"<feature-uri>"`, which this build's catalog does not hold; correct or publish the Feature named under `"feature"`)

Emitted message (schema-does-not-resolve variant):

> annotation binding does not resolve against its target Feature (Manifest, annotation binding routes to Feature `"<feature-uri>"`, whose declared schema does not resolve: `<resolution failure>`)

This variant names the Feature and the resolution failure, and carries neither the binding key nor a source position — the fault is in the Feature's own `spec.schema:`, which the binding only names. Find the offending binding by searching `mappings.features.annotations` for the Feature URI the message quotes.

Emitted message (path-not-found variant):

> annotation binding does not resolve against its target Feature (Manifest, at `.spec.mappings.features.annotations.<key>`, `"<key>"`, routes to Feature `"<feature-uri>"`, at pillar `"<pillar>"`, and path `"<path>"`, which that Feature does not declare a property for under `"schema"`)

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

A component instance's — or an attached Feature's — resolved `values:` or `infra:` does not conform to the declared catalog schema. The build validates each pillar against its declared schema before rendering, so a typo'd key, a wrong-typed value, an out-of-range number, or a missing required field is caught at its source rather than producing a broken manifest at deploy time.

The check covers the standard schema constraints: a value of the wrong type (a string where the schema declares an integer), a value outside a declared range or `enum`, a value failing a declared `pattern`, a string that is not a valid instance of its declared `format` — one of the [named formats](../vocabulary/compact-form-authoring.md#named-formats) — and a **required** field that was not supplied. A format failure names the keyword and carries the value, the format and what is wrong with it — as `aggrega pull` and `aggrega validate --release` print it for a `uri` field given `::::`, `"format", "value \"::::\" is not a valid uri: a URI begins with a scheme followed by a colon, such as https:"`. It is **default-aware**: a field the schema gives a `default:` is considered supplied even when it is omitted, so a required-with-default field never trips the "missing" check.

The **values** pillar is the developer's authoring surface. It is validated **closed** — a property the schema does not declare is rejected as a likely typo. A values schema that composes within its own document (a local `#/$defs` `$ref` or `allOf`) is resolved and validated against that definitional context.

The **infra** pillar is the operator's sizing surface, and it is checked only when the Component declares a `schema.infra` pillar — that declaration is the contract the component opts into. It is validated **closed** against that declaration and against nothing else, exactly as the values pillar is validated against `schema.values`: a key the Component does not declare is rejected as a typo, and a key it does declare has its type and range enforced. A component that wants a provider-layered key such as `replicas` validated declares that key in its own `schema.infra`; a provider's accepted vocabulary is reached through its Recipe's `valuesMapping` rather than layered onto the authored infra surface.

The check measures the sizing of every component the Release **placed**, and an entry that writes no `infra:` block at all is measured too: an absent block is an empty one, so a `required:` key carrying no `default:` is reported as missing — which is the case such a key exists to catch. Both ways of placing a component count. Naming it under a boundary's `components` places it, and so does routing the sub-module that contributes it under `aggregates`; a routing entry places components without saying anything about any one of them, so a component placed that way starts from an empty sizing block and a defaultless `required:` key on its type is reported as missing. A component the Release places by neither route is not measured against this contract at all. It has a different fault, and the build reports that one instead: a component placed in no boundary, with the two ways to place it named.

The contract binds a component wherever it was authored: a component a sub-module contributes is measured exactly as one the deployment's own Aggregate declares. How deeply a component is nested does not change which of its type's constraints apply.

**Feature attachments** are validated the same way, against the attached Feature's declared `schema.values` / `schema.infra`. Attachments share one surface, so a credential Feature — one labeled `feature.aggrega.ai/kind: secret` — is measured against its own declared schema exactly as any other attachment is. The value checked is the **effective merged result** after attachment values cascade across scopes (component, subsystem, boundary, and component-specific) — so a value introduced legally at one scope but overridden to an illegal value at a more specific scope is caught on the merged result, not the fragment. An attachment whose type declares no schema is not validated; attachment infra is validated against the attachment's own `schema.infra` (an attachment is an overlay and carries no provider union).

**An attachment's finding is reported in the document that wrote the failing pillar**, under that document's name, and filed under its author. Its `values` are reported at the Aggregate block that wrote them — the component's own `features:` entry, `.spec.components.<component>.features.<attachment>.values.<field>`, ahead of a subsystem's block that reaches the component — as a developer fault. Its `infra` is reported at the Release block that wrote it — the Release's entry for the component, under the boundary that names it, ahead of the boundary's own `features:` block — as an operator fault. A pillar the document owning it did not write is reported where the attachment itself was written, which is where its `type` is named. So an attachment only the Release makes, which carries no `values`, reports a field its Feature's `values` require at the Release's entry and as an operator fault, at a path the Release holds — the component's entry, or the boundary's `features:` block for an attachment the boundary makes for every component under it:

```text
[OPS_ERROR E0168] .spec.boundaries.main.components.app.features.check.values.schema
  authored pillar does not conform to its declared schema (Release probe, at .spec.boundaries.main.components.app.features.check.values.schema, values pillar does not conform to the Feature schema: missing required property: schema (required))
```

The same attachment written on the component in the Aggregate reports `[DEVELOPER_ERROR E0168]` at `.spec.components.app.features.check.values.schema`, under the Aggregate's name. An editor shows each on the document that wrote it, on the deepest key of that path the document holds.

**An attachment a connection carries** is measured the same way, and reported at the connection entry of the document that wrote the failing pillar rather than at the component's own `features:` block, which does not hold it. Its `values` are reported at the Aggregate's connection entry, `.spec.components.<component>.uses.<socket>.<alias>.features.<slot>.values.<field>` — in the sub-module's own document, for a component a sub-module contributes — and its `infra` at the Release's entry for that connection, under the boundary that names the component where the Release names boundaries. An attachment only the Release makes is reported at the Release's entry for both pillars: such an attachment carries no `values`, so a Feature whose `values` require a field reports it missing there, at the entry the operator wrote.

**Per-edge connection config** is validated the same way against the socket's per-edge contract: an edge's developer-authored `values` against the socket's `valueSchema`, and an edge's operator-authored `infra` (from a Release) against the socket's `infraSchema`. A socket that declares no per-edge schema for a pillar accepts no validated config for it (omission = no contract, nothing to check). The diagnostic names the edge by consumer, socket, and alias. On a component the Release's own Aggregate declares, the operator's `infra` is measured for every entry the Release writes for one of its connections — an entry carrying no `infra` included, which is how a defaultless `required:` key is reported missing — and reported at that entry in the Release, under the boundary that names the component where the Release names boundaries, which is where the operator edits it; the developer's `values` are reported at the connection entry in the Aggregate.

**A leaf declared `sensitive: true` has its constraint failure withheld.** The failure text quotes the offending value, and a build diagnostic is read by anyone watching the build, so on a declared-sensitive leaf — or anywhere inside a declared-sensitive object — the `<constraint failure>` below reads `<redacted>` instead. The entity, the field path, the pillar and the contract name are all still named, so the diagnostic still tells you which leaf failed; only the text that would reproduce the value is dropped. Sensitivity is read per pillar, so a leaf named the same way in `values` and `infra` is withheld only in the pillar that declares it.

Emitted message:
> authored pillar does not conform to its declared schema (Aggregate `<name>`, at `.spec.components.<component>.values.<field>`, values pillar does not conform to the Component schema: `<constraint failure>`)
> authored pillar does not conform to its declared schema (Aggregate `<name>`, at `.spec.components.<component>.infra.<field>`, infra pillar does not conform to the declared infra schema: `<constraint failure>`)
> authored pillar does not conform to its declared schema (Aggregate `<name>`, at `.spec.components.<component>.features.<attachment>.values.<field>`, values pillar does not conform to the Feature schema: `<constraint failure>`)
> authored pillar does not conform to its declared schema (Release `<release-name>`, at `.spec.boundaries.<boundary>.components.<component>.features.<attachment>.infra.<field>`, infra pillar does not conform to the Feature schema: `<constraint failure>`)
> authored pillar does not conform to its declared schema (Release `<release-name>`, at `.spec.boundaries.<boundary>.features.<attachment>.values.<field>`, values pillar does not conform to the Feature schema: `<constraint failure>`)
> authored pillar does not conform to its declared schema (Aggregate `<name>`, at `.spec.components.<component>.uses.<socket>.<alias>.values.<field>`, values pillar does not conform to the socket valueSchema: `<constraint failure>`)
> authored pillar does not conform to its declared schema (Aggregate `<name>`, at `.spec.components.<component>.uses.<socket>.<alias>.features.<slot>.values.<field>`, values pillar does not conform to the Feature schema: `<constraint failure>`)
> authored pillar does not conform to its declared schema (Release `<release-name>`, at `.spec.components.<component>.uses.<socket>.<alias>.features.<slot>.values.<field>`, values pillar does not conform to the Feature schema: `<constraint failure>`)
> authored pillar does not conform to its declared schema (Release `<release-name>`, at `.spec.boundaries.<boundary>.components.<component>.uses.<socket>.<alias>.infra.<field>`, "infra.`<field>`", "`<keyword>`", "`<constraint failure>`")

**How to fix:** correct the offending value to satisfy the declared schema, or — if the value is legitimate — widen the declaring schema (the Component's `schema.values`/`schema.infra`, or the attached Feature's) to declare it. Inspect a Component's declared schema with `aggrega inspect <component-type>` to see the exact types, ranges, defaults, and required fields each pillar expects.

### A declared schema contract cannot be read as a schema

<!-- covers: pkg/resolver.ErrSchemaContractCompileFailure -->

A Component or Feature declares a schema contract that yields nothing to validate against, so the configuration it covers is measured against nothing. Three contracts can carry the fault, each authored in its own field: the entity's own `spec.schema`, and the two per-edge contracts a dependency socket declares — `valueSchema` for the developer's side of a connection and `infraSchema` for the operator's. A SchemaLibrary entry, which those contracts can reference, can carry the third of the faults below too; how that case is reported is set out further down.

**Three faults reach this halt, and two of them are easy to miss because the contract looks fine.** A contract may fail to compile to JSON Schema 2020-12 at all — a mistyped keyword is the commonest cause. Or it may compile cleanly and still build no validator: the body is readable as compact form and is not a schema anything can validate against, such as a bare scalar where a property's schema belongs (`items: nonsense`). Or it may be well-formed in every other respect and name a format outside the supported set — `format: password`, or a misspelling such as `format: emial` — which is refused rather than read as a constraint that checks nothing, whether or not any value reaches the field; the names a `format` may take are listed under [Named formats](../vocabulary/compact-form-authoring.md#named-formats). All three are one condition, because the remedy is the same and passing any of them over has the same consequence.

**Declaring no contract and declaring one that cannot be read are different situations, and the build treats them differently.** A field that declares nothing is skipped: per-pillar and per-edge conformance is opt-in, so a socket that constrains neither pillar is ordinary authoring and draws no diagnostic. A field that declares something unreadable is refused. Passing it over would leave every payload it covers unvalidated while the build reported success — a check that has stopped running with nothing to say that it stopped. So the refusal is what keeps the two apart: silence means there was nothing to check, and a halt means there was something and it could not be read.

The refusal names the entity that **declared** the contract rather than the document that wrote the configuration, because that is where the correction goes. An Aggregate author handed a component type whose contract cannot be read has nothing to change in their own file. It arrives as the catalog is read, where the declaring entity, the pillar, the authored field and the source line are all known — so the same fault reports identically whether you reach it from a build, from `aggrega validate`, or from the build tool `aggrega mcp` exposes.

A SchemaLibrary entry naming a format outside the supported set reaches this halt as its library is read, and the refusal names the library and the entry and points at the entry in the library file. `aggrega validate` over the whole catalog reads every library, so it reports the entry whether or not any schema references it, while a Release whose dependency resolution never reaches the library does not read it. A Release whose schemas do reach the entry through a `$ref:` is refused as well, but the refusal does not name the format: `aggrega pull` reports the library as not found in the catalog (`E0114`), and `aggrega validate --release` reports the reference's target as not found (`E0121`). Run `aggrega validate` over the catalog to see the entry and the name at fault.

The message carries the failure as the tool that met it reported it: for a compile failure, the key inside the contract, the source line and the offending keyword; for a body that builds no validator, the position the validator rejected; for a format name outside the supported set, the field, the keyword `format`, the name as written and every supported name. A cross-document `$ref:` whose SchemaLibrary entry is not in the loaded closure reaches the same halt.

**A well-formed constraint beside an unreadable one is not enforced.** A contract is read as one document, so a single unreadable fragment disables every constraint declared alongside it. That is why the halt is worth more than the constraints it costs: the alternative is a contract that looks enforced, reads as enforced, and enforces nothing.

Emitted message:
> declared schema contract could not be compiled into a usable schema, so nothing was validated against it: correct the contract where it is declared, or remove it if the configuration it covers needs no validation (Component `<type>`, at `.spec.schema`, `<failure>`)
> declared schema contract could not be compiled into a usable schema, so nothing was validated against it: correct the contract where it is declared, or remove it if the configuration it covers needs no validation (Component `<type>`, at `.spec.usesSchema.<socket>.valueSchema`, `<failure>`)
> declared schema contract could not be compiled into a usable schema, so nothing was validated against it: correct the contract where it is declared, or remove it if the configuration it covers needs no validation (Component `<type>`, at `.spec.usesSchema.<socket>.infraSchema`, `<failure>`)

Refused as the catalog is read, the message names the entity with its version and the field declaring the contract, then the pillar that contract constrains, then the failure — here a format name outside the supported set in a Component's `values` pillar:
> declared schema contract could not be compiled into a usable schema, so nothing was validated against it: correct the contract where it is declared, or remove it if the configuration it covers needs no validation. Component `"<type>:<version>"`: spec.schema.values declares a schema no validator can be built from, so the values it constrains would go unmeasured: validator/jsonschema: schema resolution failed (at values.`<field>`, keyword `"format"`, format `"<format>"` is not supported; the supported formats are email, uri, hostname, ipv4, ipv6, uuid, date-time, date)

A Feature is named `Feature "<name>:<version>"`, a socket's contract by its own field, such as `spec.usesSchema.<socket>.infraSchema`, and the pillar by the one the contract constrains — `values`, `infra` or `provides`. A SchemaLibrary entry is named by its library and its entry:
> declared schema contract could not be compiled into a usable schema, so nothing was validated against it: correct the contract where it is declared, or remove it if the configuration it covers needs no validation. SchemaLibrary `"<library>"`: schema `"<entry>"` names a format no validator can check, so the values it constrains would go unmeasured: validator/jsonschema: schema resolution failed (at `<field>`, keyword `"format"`, format `"<format>"` is not supported; the supported formats are email, uri, hostname, ipv4, ipv6, uuid, date-time, date)

**How to fix:** open the field the diagnostic names and correct the fragment at the reported key and line — most often a mistyped keyword, checked against the keyword vocabulary in [`vocabulary/compact-form-authoring.md`](../vocabulary/compact-form-authoring.md), or a value written where a nested schema belongs. Where the failure names a format that is not supported, write one of the [named formats](../vocabulary/compact-form-authoring.md#named-formats) or remove the `format:`; a field carrying secret material declares [`sensitive: true`](../vocabulary/compact-form-authoring.md#declaring-a-leaf-sensitive--sensitive) instead, since `password` is not a format. For a SchemaLibrary entry, the correction goes in the library file the diagnostic names. Where the failure names a cross-document reference, confirm the SchemaLibrary entry exists and that the library is reachable from the Release's dependency closure. If the configuration that field covers genuinely needs no validation, remove the field rather than leaving a contract nothing can read.

### Recipe `source:` is an empty string

<!-- covers: internal/compiler/renderer.ErrEmptySource -->

A Recipe declares `source: ""` — an empty string. A Recipe's `source:` selects between two authoring modes: **sourceless** mode, where there is no external artifact and the output is produced entirely from the Recipe's other input kinds, and **sourced** mode, where `source:` names an external chart, module, or file to render from. Omitting the field selects the first, a non-empty value selects the second, and an empty string selects neither — so it is an ambiguity rather than a value with a meaning.

The build halts instead of choosing one of the two readings for you. The refusal reads the value exactly as you wrote it, ahead of evaluating any template inside it, so it names the ambiguity itself rather than reporting whatever the empty value would have gone on to do. The commonest way to write an empty `source:` is to delete a URI and leave the key behind: sourced mode was intended, and admitting the empty string as sourceless would ship a deployment without the artifact and never say which of the two readings it took.

**On the build command you always meet something else first.** Pinning a Release's sources cannot tell what kind of artifact an empty reference names, so `aggrega pull` reports that reference as ambiguous and writes no lockfile entry for it — and a build reads a lockfile rather than writing one, so it refuses the missing or no-longer-matching lockfile before any rendering happens. Either way the build command hands you one of those two refusals and not this halt. The halt itself is what you meet from [`aggrega validate`](../cli/aggrega-validate.md) over the Recipe file, which renders that Recipe in isolation, and from the build tool [`aggrega mcp`](../cli/aggrega-mcp.md) exposes, which renders a Release carrying no lockfile at all. The fix is the same at every one of them.

Emitted message, positioned at the Recipe the empty `source:` was written in and at the key inside it — `.spec.source` — rather than at a component that binds the Recipe, because the entry is shared by every component that does. It is decided before anything renders, for every component in the build, so each component whose Recipe leaves the entry empty is reported in one build; where more than one is, the findings are grouped under `Recipe source entries that name neither authoring mode`:
> recipe source is an empty string, which names neither sourceless mode nor sourced mode. omit the source field for sourceless mode, or name a non-empty path or URI for sourced mode

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

The rule is the same for every indexed kind: Component, Feature, Recipe, FeatureRecipe, Plugin, SchemaLibrary, MappingLibrary, WorkloadLibrary, ArtifactLibrary and Aggregate. The halt is positioned at the second file, and names the kind and the identity that collided.

Emitted message:
> duplicate entity identity within a single catalog directory (Component identity `"<identity>"`)

with the kind's own word in place of `Component` — `recipe identity`, `feature recipe identity`, `Plugin identity`, `SchemaLibrary identity` and so on.

**How to fix:** rename one of the two entities, or move it into a directory of its own. For a Recipe or FeatureRecipe the identity includes the provider scope and the version, so two files that differ only in version do not collide — a genuine collision there means the same version was published twice. Copying an entity file to start a new one and forgetting to change `metadata.name` is the usual cause.

### A file the operation reads leads through a link out of the directory it must stay inside

<!-- covers: pkg/readscope.ErrReadLeadsOutOfWorkspace -->

Two places are read as a whole rather than one file at a time: a catalog directory, every document beneath which a lookup by name may answer from, and the directory holding a Release, whose Aggregates and Manifests a Release that names them by identity is resolved against. A symbolic link among those files can lead anywhere on the machine, so each such directory has a directory its reads must stay inside, and a link leading out of it is not read. [The workspace boundary](../cli/workspace-boundary.md) states the rule this applies, and the other paths it holds.

Which directory that is depends on where the directory being read sits:

- **The workspace**, for a catalog directory or a Release's directory inside it. This holds for the workspace's conventional `catalog` directory whenever nobody named it — when it is read only because it is there: it is then the workspace's own, so a `catalog` that is itself a link leading out of the workspace is not read.
- **A directory you named that lies outside the workspace**, for what lies beneath it: a catalog directory you pass with `--catalog`, or the workspace configuration lists under `catalog_dirs` — for the workspace or for one Release — and the directory of a Release you name, or one the configuration names, that lies outside the workspace. The directory itself is used as you named it — one that is a link is read where it points — and what is read beneath it stays inside it. That includes the conventional `catalog` directory once you name it: listed under `catalog_dirs`, or passed with `--catalog`, a `catalog` that is a link leading out of the workspace is read where it points, like any other directory you name. Naming the place it points to instead, in any spelling, or a directory above that place, names it too: the directory you named already reads what lies there, so it is read once, through that directory. Naming a directory in the configuration is how a workspace reads entities kept outside it.

What is judged is every entry the read would take something from: a link to a file named like a YAML document, and a link to a directory, which may hold documents of its own. A link that leads somewhere inside the directory the read must stay inside is read where the walk meets it. A link to a file no catalog read takes anything from — a notes file, a chart archive — is not judged here, and a link that leads nowhere has nothing behind it to read.

**A lookup a compile depends on stops on such a link rather than passing over it.** The entity behind the link might be the one a reference names, and passing over it silently would let another entity of the same name, from a later catalog directory, resolve in its place. So `aggrega build`, `aggrega pull`, `aggrega validate`, `aggrega inspect` wherever it reads the catalog, a lint of one Release, and the editor's and an assistant's requests that build, preview, graph, validate or describe a Release all stop before anything is resolved, naming the link. A lint of the whole catalog stops the same way: its verdict answers for every document the catalog directories hold, so it does not report a clean catalog while one of them could not be read. The Release's directory is held to the same rule wherever a Release names its Aggregate or its Manifest by identity, or a Manifest names the Manifest it extends that way, and the scan stops on a link among the documents beside the Release even where the link is not the one a reference names, for the reason a duplicate there stops it: the directory cannot answer for a name while one of its documents cannot be read. The Release the operation was named — or a Manifest you inspect on its own — is not one of those documents: it was read where it was named, so a Release that is itself a link leading out is read where it points, and what it names is looked for beside the link, in the directory you named it in ([A Release or a Manifest named through a link](../cli/workspace-boundary.md#a-release-or-a-manifest-named-through-a-link)).

**A listing passes over such a link instead, and lists nothing behind it.** The editor's entity index, its completions and the candidates it offers do not list an entity a link leading out stands for, and the entity index names such a link inside the workspace among the links it did not read.

**The workspace's configuration files are held to the workspace the same way.** Every `.aggrega-config.yaml` from the workspace root down to the directory a command runs in, and the `.aggrega-config-append-ci.yaml` a pipeline keeps beside any of them, is the workspace's own content. One that is a link leading out of the workspace — or that is reached through a directory link leading out — is not read, and since every command, the editor's language server and an assistant's tools read the configuration before anything else, each stops there, naming the link, rather than running on a configuration made from whatever remained. The language server, and an assistant's server speaking over its own streams, still start over such a workspace: the listings of its Releases and its entities answer, read with nothing configured, and name the file among the links they did not read, while every other request the configuration decides is refused with this condition, naming the link. The remedy this message names is the configuration's own: the global configuration file is the one configuration read from wherever it is kept, named with `--config` or `AGGREGA_CONFIG`.

**A Release's lockfile is held the same way, where it is read as where it is written.** The lockfile beside a Release is read for the pins a build, a pull, a validation, a lint, an inspection, `aggrega cache prune` and the editor's and an assistant's requests resolve against, and it is held to the directory its write is held to: the workspace, or the Release's own directory for a Release named outside it. One that is a link leading out is not read, and each of those stops naming the link rather than resolving against pins kept elsewhere on the machine, or without them. The remedy this message names is the lockfile's own: it has one place, beside the Release, where a pull writes it.

**A file read beside an entity is held the same way.** Two operations read a file that sits beside an entity's own document rather than one a reference names. Pinning an entity, or publishing one, reads every other YAML document in the entity's directory to tell whether another entity shares it. Loading a Plugin entity authored in a catalog directory reads the built `.wasm` laid down beside it. Each is held to the directory the entity's own document was read under — the workspace, a catalog directory you named outside it, or, for an entity you pin or publish by naming its document outside the workspace, that document's own directory — and one that is a link leading out of it is not read. `aggrega pin`, `aggrega push` with or without `--dry-run`, a pull that pins, and the editor's and an assistant's pin and publication stop naming the link, because a document left unread could be the entity in the way. A build or a pull that loads the plugin stops naming the link too, rather than running bytes kept elsewhere on the machine or looking for the plugin somewhere else instead. The remedy this message names is a file beside an entity's own: keep the file itself there.

**The workspace's artifact cache is held the same way, where it is read as where it is written.** Everything read from the cache under `artifact_cache_dir` — a cached entity, plugin or library and the manifest beside it, a source archive and its metadata, a pinned external input, a signature bundle, a registry's local search index — and every workspace entry `aggrega cache status`, `aggrega cache prune` and `aggrega cache clear` list, is held to the directory a write into the cache is held to: the cache directory itself, the default `.aggrega/cache` as much as one the configuration names climbing out of the workspace root. Anything in it that is a link leading out of the cache directory — elsewhere inside the workspace as much as anywhere else — is not read, and neither is anything behind a cache directory written inside the workspace root that is itself a link leading out of the workspace: a build, a pull, a validation, a search, the three cache commands, and the editor's and an assistant's requests that read the cache stop naming the link — content the cache keeps under a recorded digest included, since a digest says what the bytes are, not where they may be read from. A cache directory written inside the workspace root that is a link to elsewhere inside the workspace is read where it leads. The deprecation notice `aggrega inspect` prints, which decides nothing, is left out. A prune or a clear meets one of the cache's own directories that is a link leading out of the cache directory, or a cache directory that is itself a link leading out of the workspace, as the removal it would be, under "A path the operation writes leads through a link out of the directory it must stay inside", before it lists anything. The remedy this message names is the cache's own: with the link removed a pull fills the cache again, and a cache kept somewhere else is named with `artifact_cache_dir`, relative to the workspace root, rather than reached through a link.

**A repository a source fetches is held to its own checkout.** When a pull — `aggrega pull`, or a build or an editor's or an assistant's request that resolves a Release's dependencies — fetches a `git-repository` source, it checks the repository out and archives the directory the source names, and the checkout is a directory of its own: every link the repository carries, `module_subdir` itself included, is held to it. A link to a file or a directory inside the repository is archived as what it points to, under the link's name. A link leading out of the repository — which could point at any file on the machine running the pull — is not read: the pull stops naming the link and where it leads, and nothing is cached. The checkout is a temporary directory removed once the pull stops, so the message names the link by its place in the repository — `chart/secret.txt`, as the command line's first line and in the sentence — and the directory it must stay inside as the repository and the revision the source names: `which must stay inside the repository <url> at <ref> (commit <commit>)`, or `at commit <commit>` where the source names no `ref` or names the commit itself. Where the link leads is named as the place on your machine it is. The remedy this message names is the repository's own: the link is committed there, so it is changed there — made to point inside the repository, or replaced by the file itself — and the source then names a revision that carries the change. A directory link that leads back into a directory the archive is already reading through it stops the pull too, because the tree it stands for has no end; that refusal is a plain error rather than this condition.

**The overlays a catalog generation reads are held the same way.** `aggrega plugin gen-catalog --from-embedded` reads every overlay beneath the overlay directory it is given — typed with `--overlay`, picked in the editor, or named by an assistant — and holds each to the directory that overlay directory is read under: the workspace, for an overlay directory inside it, and the overlay directory itself for one named outside the workspace. The overlay directory is used as you named it — one that is a link is read where it points. An overlay beneath it that is a link leading out of the directory it is held to is not read, and neither is a directory link leading out of it, which may hold overlays of its own: the generation stops naming the link, with nothing written, rather than generating without the overlay. An overlay that is a link leading elsewhere inside the directory it is held to is read where it points; a directory link leading inside it is not entered. The remedy this message names is an overlay's own: keep the overlay itself beneath the overlay directory, or name a directory holding every overlay as the overlay directory.

**A directory you import is held to itself.** `aggrega import` given a directory, the assistant's import tool and the session's `aggrega/import` method hand the importer the files of the directory its file patterns select, each under its place in the directory, so the directory is the one those reads stay inside wherever it lies — inside the workspace as much as outside it. What is judged is every entry the import would take something from: a link to a file one of the relevant patterns selects — the patterns of the importer serving the format named, or, where the format is recognised, those of every importer the import chooses among, the compiler's [core importers](../plugins/core-importers.md) included — and a link to a directory, which is never entered. One that leads out of the directory, to elsewhere in the workspace or anywhere else, is not read: the import stops naming the link before any file of the directory is opened, with nothing written. A selected link to a file elsewhere inside the directory is read where it points, under the link's own name, and a link to a file no pattern selects is neither judged nor read. The directory itself is used as you named it — one that is a link is read where it points. Reached over a listener, the assistant's tool names the link by its place in the workspace and says nothing of where it leads. The remedy this message names is an imported directory's own: keep the file itself in the directory rather than a link to it, or import the directory the link leads to.

Emitted message. The condition's own sentence opens it, then the path the read reached, the directory it must stay inside, the link it meets on the way and the place that link leads to, then the remedy:
> a file this operation reads leads through a link out of the directory it must stay inside (reading `<workspace>/catalog-local/component/app/1.0.0/component.yaml`, which must stay inside `<workspace>`, the link `<workspace>/catalog-local/component/app/1.0.0/component.yaml` leads to `<elsewhere>/component.yaml`). nothing was read through that link. Remove the link, or make it lead to a place inside `<workspace>`. To read what is kept outside, list the directory holding it as a catalog directory in the workspace configuration, rather than reaching it through a link beneath one: a listed directory is read where it leads, even when it is itself a link

The diagnostic carries no category: what is at fault is the layout on disk rather than any document you wrote.

**How to fix:** replace the link with a copy of what it leads to, or remove it; or, where the entity is meant to stay outside the workspace, list the directory holding it under `catalog_dirs` in the workspace configuration, or pass it with `--catalog`, so the directory is read as a catalog directory of its own. List the directory the link leads to, not the one it sits in: a link met beneath a directory is judged the same however that directory came to be read, so listing it changes nothing. Where the link is the workspace's conventional `catalog` directory itself, listing `catalog` — or the directory it points to — under `catalog_dirs`, or passing either with `--catalog`, is enough, since a directory you name is read where it points. Where the link is a Release's lockfile, remove it and pull the Release again, which writes a fresh lockfile beside it. A Manifest has no catalog tier, so a Manifest the Release reads is kept beside the Release itself. Where the link is a configuration file, replace it with a copy kept in the workspace; a configuration you mean to share between workspaces is read by naming it as the global configuration file, with `--config` or `AGGREGA_CONFIG`, beneath each workspace's own files. Where the link sits beside an entity being pinned or published, replace it with the file itself, or move a document that is an entity into a directory of its own; where it is the `.wasm` beside a Plugin entity, lay the built `.wasm` itself there. Where the link is the artifact cache directory or something in it, remove it — a pull fills the cache again — or, to keep the cache somewhere else, set `artifact_cache_dir` to that directory, written relative to the workspace root (`../shared-cache`). Where the link is committed in a repository a `git-repository` source fetches, change it in that repository — point it inside the repository, or commit the file itself — and name the revision that carries the change. Where the link is an overlay beneath the overlay directory of a catalog generation, replace it with the overlay itself, or name a directory holding every overlay as the overlay directory. Where the link sits in a directory you import, keep the file itself in the directory rather than a link to it, or import the directory the link leads to.

### A reference to another file leads out of the directory it must stay inside

<!-- covers: pkg/readscope.ErrReferenceLeadsOutOfWorkspace -->

A Release and a Manifest can name another file by a path: a Release's `aggregate:` and `manifest:` written as `./…` or `../…`, its `extends:`, a Manifest's `extends:` written as a path, and a Release's `parameters: { $import: … }`. A document in the workspace reaches only files inside the workspace that way. A Release that lies outside the workspace — one you name on the command line, or one the workspace configuration names — and a Manifest you name on its own on the command line outside the workspace reach only files inside their own directory: that directory is a root of its own, as a directory you name outside the workspace is, and every Release its `extends:` chain leads to is held to the same directory. A path that climbs out of that directory as it is written, and a path that stays inside as written but meets a symbolic link on the way that leads out, are both refused, and nothing is read from the file they name. A path that leads to a file not there yet beneath the directory is not refused here; it reports as a file that could not be read. [The workspace boundary](../cli/workspace-boundary.md#a-reference-a-document-writes) states why a reference is held as well as the path you name.

Where a path is resolved from is the same rule the language reference teaches for each key: a Release's `aggregate:` and `manifest:`, and a Manifest's `extends:`, beside the Release a command or a request names — or, for a Manifest you name on its own, beside that Manifest; a Release's `extends:` and a parameters `$import:`, beside the Release that writes it, so each link of an `extends:` chain names its parent beside itself. The diagnostic names the directory it was resolved from.

A name rather than a path is not judged here — `aggregate: payments`, `extends: base-manifest`. It is looked up among the documents beside the Release and, for an Aggregate, in the catalog directories, which are held by the rule in "A file the operation reads leads through a link out of the directory it must stay inside" above.

Every surface that resolves what a Release names stops on it, before the file is read: `aggrega pull`, `aggrega build`, `aggrega validate`, `aggrega inspect` of a Release or of a Manifest, a lint of one Release, and the editor's and an assistant's requests that build, preview, graph, validate or describe a Release. In the editor the diagnostic is placed on the key in the Release that led to the file.

Emitted message. The condition's own sentence opens it, then the reference as it is written, the document it is written in for an `extends:` and a parameters `$import:`, the directory it is resolved from, the place it leads to, the directory it must stay inside, and the link where one carries it out; then the remedy. For a document in the workspace:
> a reference a document makes to another file leads out of the directory it must stay inside (`.spec.aggregate: ../shared/app.yaml`, resolved from `<workspace>`, which leads to `<elsewhere>/shared/app.yaml`, outside the workspace `<workspace>`). nothing was read from that file. A document in the workspace reaches only files inside `<workspace>`: move the file there — or, where a link carries the reference out, make the link lead there — or open the workspace at a directory holding both documents. An Aggregate kept outside that directory is reached by its name rather than a path, from a catalog directory the workspace configuration lists

and for a Release or a Manifest named outside the workspace, whose own directory is the one it must stay inside:
> a reference a document makes to another file leads out of the directory it must stay inside (`.spec.aggregate: ../aggregates/app.yaml`, resolved from `<directory>`, which leads to `<parent>/aggregates/app.yaml`, outside `<directory>`, the directory of a document named outside the workspace `<workspace>`). nothing was read from that file. A Release or a Manifest named outside the workspace — on the command line, or by the workspace configuration — reaches only files inside its own directory `<directory>`: move the file there — or, where a link carries the reference out, make the link lead there — or name the document from a workspace holding both documents. An Aggregate kept outside that directory is reached by its name rather than a path, from a catalog directory the workspace configuration lists

with `written in <document>` after the reference for an `extends:` or a parameters `$import:`, and `the link <link> leads to <place>` at the end where a link carries the path out. An `aggregate:` or `manifest:` reference names no document: a Release that extends another may have inherited it from a Release further up the chain, and it is resolved beside the Release the command names either way.

The diagnostic's category is `[OPS_ERROR]`: the reference is written in a Release or a Manifest.

**How to fix:** for an Aggregate kept outside the workspace, write its `metadata.name` rather than a path, and list the directory holding it under `catalog_dirs` in the workspace configuration, or pass it with `--catalog` — a catalog directory is how a workspace reaches entities kept outside it. A Manifest, a Release an `extends:` names and a parameters file are read beside the Release and never looked up by name, so keep them inside the workspace, or open the workspace at a directory that holds both the Release and the file. For a Release or a Manifest you named from outside the workspace, keep what it names in its own directory, or build it in the workspace that holds both it and what it names. Where a link carries the path out, replace the link with a copy of what it leads to, or make it lead inside the directory.

### No catalog version satisfies a version constraint

<!-- covers: pkg/catalog.ErrUnsatisfiableEntityVersion -->

A reference names an entity the catalog holds and pins a version the catalog does not: an exact version that is absent, or a caret range nothing available matches. It is distinct from a plain miss, where the name itself is unknown — here the entity exists and only the version is unsatisfiable, which is why the message says so rather than reporting the entity as missing and sending you looking for a typo in the name.

Every kind reaches this through one selection, so an unsatisfiable pin behaves the same wherever it is written: a version typo on a Manifest's Recipe mapping is refused exactly as the same typo on a component type is.

The condition is recoverable, which is what lets the editor show it as a diagnostic while you keep typing rather than abandoning the document. On the command line it is joined into a halt.

Emitted message, for a pin on an `extends:` pointer:
> no catalog version satisfies the referenced version constraint (Component `<name>`, at `.extends`, no catalog version satisfies extends parent `"<reference>"`)

with `Feature` in place of `Component` where a Feature's chain carries the pin.

**How to fix:** change the pin to a version the catalog holds, or add that version to the catalog. `aggrega inspect` lists the versions an entity is available at. A caret range that matches nothing usually means the available versions are all below the floor it names — widen the range, or publish the version the reference is waiting for.

A pin that is none of the forms a pin takes is a different condition, described under "A version pin is none of the forms a pin takes" below.

### A version pin is none of the forms a pin takes

<!-- covers: pkg/types.ErrMalformedVersionPin -->

A reference names another entity and may pin the version it wants after a colon, in one of two forms: an **exact** pin, which is a semantic version such as `1.0.0` — the form every entity's `metadata.version` takes — or a **caret** pin, `^` followed by a version such as `^1.0.0`, which selects the highest version compatible with it. A pin that is neither — a caret whose text does not read as a version range, like `^garbage`, or an exact pin that is not a semantic version, like `1.x`, `1.0` or `v1.0.0` — names no version at all, so no catalog could hold what it asks for.

Such a pin is reported as malformed rather than as an entity or a version the catalog does not hold, so the diagnostic sends you to the text you typed instead of looking for something that does not exist. It is the same condition wherever the pin is written: a component or feature `type`, a Component's or Feature's `extends:`, a Manifest mapping key or value, a Release's `spec.aggregate`, a Recipe's or FeatureRecipe's `implements:`, the version a Recipe's `capability:` pins when the plugin serving it is selected, and a pipeline step's `plugin:`.

It is reported where a reference that failed to resolve is reported, so a malformed pin never changes which references resolve — it changes what the failure says. A pin that is well formed but that no available version satisfies keeps the condition that surface reports for it: "No catalog version satisfies a version constraint" above, or the not-found condition of the surface it is written on.

Only the text after the **last** colon is a pin, and only when it carries no `/`. A reference to a registry host with a port, such as `localhost:5000/core/api-server`, therefore carries no pin — the text after the port's colon continues the reference — and it is never reported as a malformed one.

Emitted message, for a caret pin on a component type:
> reference carries a malformed version pin (reference `"<reference>"`, pin `"<pin>"`, the text after ^ is not a version range, referenced from `<authored location>`). write the reference as <name>, as <name>:<version> with a semantic version such as 1.0.0, or as <name>:^<version> for the highest version compatible with it

An exact pin reads `an exact pin must be a semantic version` in place of the caret clause. The value after it says where the reference was written, in the words of the surface reporting it — `referenced from` and the authored location, `in the Release's spec.aggregate`, or `in the recipe's spec.implements`. Where a Manifest mapping is judged against its Recipe's `implements:`, the mapping entry and which side of it carries the pin — `in the mapping key` or `in the recipe's spec.implements` — come ahead of the reference instead, and a Component's or Feature's `extends:` names the extending entity and the field ahead of it.

**How to fix:** rewrite the pin in one of the two forms, or remove it to select the highest version available. A wildcard such as `1.x` is written as a caret pin, `^1.0.0`; a version with a leading `v` or fewer than three numbers is written in full, `1.0.0`.

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

**It is judged whether or not a Recipe asks for the capability.** A binding is otherwise read only when a Recipe's `capability:` names it, so a binding whose capability is misspelt would be consulted by nothing and reported by nothing. Every build and every `aggrega validate --release` therefore checks each binding that names a plugin: a pull resolves such a binding whether or not a Recipe uses it, so the build holds the plugin and knows what it serves, and a capability that plugin does not serve is certainly wrong. The check reads the bindings in the workspace configuration, not the lockfile, and it changes nothing about which plugin renders a Recipe — that stays the lockfile's. A binding naming a plugin the build does not hold — a registry plugin no pull has fetched yet — is not judged until a pull has fetched it. A binding that names no plugin is judged differently, as an advisory: see "A provider binding names a capability no plugin the build reads serves" under "Conditions that do not halt a build" below.

Emitted message, which adds what the named plugin does serve, and a spelling one edit away when the binding's capability is one:
> plugins.providers entry names a plugin no provider-rendering plugin serving the capability matches: capability `"<capability>"` is bound to plugin `"<plugin-identity>"`, but no provider-rendering plugin serving `"<capability>"` matches that identity; `"<plugin-identity>"` serves `"<served capability>"`, and `"<capability>"` is one edit from `"<served capability>"`

Where the plugin the binding names is not in the catalog the build reads, the message ends after "matches that identity", because there is nothing to say about what it serves.

**How to fix:** check the binding's spelling against the plugin's own coordinate first — a binding naming the capability where it should name the plugin is the common slip. Where the message names a capability one edit from the one you wrote, the binding's `capability:` is the typo. Then confirm the plugin is in the catalog the build reads and that it lists this capability under `spec.provider.capabilities`; a plugin that once served the capability and no longer declares it produces exactly this message. Removing the binding is the right fix where only one plugin serves the capability, since the binding then has nothing to disambiguate.

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

The format space is open and belongs entirely to the plugins. Neither socket holds a list of formats the compiler knows: a plugin declares the formats it handles as capabilities, and a new format ships as a new plugin with no change to the compiler. So this halt reports the advertised set as it stands rather than a fixed enumeration, and every miss is loud: the request either has an advertiser or it cannot be honoured. Nothing stands in for a missing plugin, with the one exception an import makes for a parser, described below.

Emitted messages:
> no parser plugin advertises the requested format: no parser plugin advertises `"parse:<format>"`
> no importer plugin advertises the requested format: no importer plugin advertises `"import:<format>"`

A single parser plugin advertising the format but carrying a version shape that cannot be resolved is treated as no advertiser rather than as a silent pass, and says so:
> no parser plugin advertises the requested format: no parser plugin version resolves for `"parse:<format>"`

**An import falls back to the parsers the compiler carries.** An importer reads its source through the parser for the syntax it names, and an import naming no format parses the source in the syntax each applicable signature names. For each syntax the import uses the parser the workspace's catalog serves, and, where the catalog serves none, the parser the compiler itself carries for it — the JSON parser the compiler's [core importers](../plugins/core-importers.md) read through among them, so an import through one of them needs no parser in the catalog. Where the catalog does serve a parser for a syntax, the compiler's own plays no part, and two of different names in the catalog are refused as [A parse or import format is advertised by more than one plugin](#a-parse-or-import-format-is-advertised-by-more-than-one-plugin) describes. So for an import this halt names a syntax for which neither the catalog nor the compiler serves a parser. A build makes no such fallback: it selects a parser from its catalog's Plugin entities alone.

**How to fix:** confirm the format is spelled as the plugin advertises it — the capability is the socket's prefix and the format name, so a plugin advertising `parse:hcl` serves the format `hcl` and nothing else. Then confirm the plugin is present in the catalog the build reads. Where no plugin for the format exists, that plugin is the missing piece; the compiler cannot read a format nothing advertises.

### A parse or import format is advertised by more than one plugin

<!-- covers: pkg/catalog.ErrAmbiguousParserPlugin, pkg/catalog.ErrAmbiguousImporterPlugin -->

Two or more distinct plugins advertise the same format, and the request cannot be routed without guessing which one to use.

**A catalog holding both is legal and loads without complaint.** Two publishers may each ship a parser or an importer for one format, and federating their catalogs is a supported thing to do. The ambiguity is a point-of-use condition: it halts when the contested format is actually requested, so a competing pair sitting outside a build's reach never blocks it.

Every candidate is named, sorted, so the message is the same on every run.

Emitted messages:
> format is advertised by more than one parser plugin: format `"<format>"` is advertised by parser plugins `[<plugin-names>]`
> format is advertised by more than one importer plugin: format `"<format>"` is advertised by importer plugins `[<plugin-names>]`

For an importer the halt is raised in one more shape: the workspace's `plugins.importer` entries attach more than one of the importers advertising the format, and the importers it names are then the attached ones.

The importers an import chooses among are the ones in the workspace's catalog and the compiler's [core importers](../plugins/core-importers.md), which advertise their formats in every workspace. So a catalog holding its own importer of another name for a format a core importer serves — `import:langflow` or `import:flowise` — meets this halt on an import that attaches neither, and the message names the core importer beside the catalog's. An importer the catalog holds under a core importer's own name is not a second advertiser: within one name the highest version is chosen, and one at the core importer's own version runs in its place.

**How to fix:** for an importer, keep both in the catalog — or keep yours beside the core importer — and attach the one you want — a `plugins.importer` entry whose `uri` names it by its identity and version, `uri: importer/<name>:<version>`, as `aggrega plugin add importer` writes it. The attached importer is chosen among those advertising the format, as a `plugins.providers` entry chooses among the plugins serving a capability on the **provider** socket, described under "A capability is served by more than one provider plugin" below. Where the importers named are ones your entries attach, keep the entry for the one you want and remove the other. The parse socket has no such selection, so for a parser the remedy is to narrow the catalog the build reads so only the plugin you want is in it — pointing `--catalog` at the directory holding your choice is the direct way.

### A `plugins.importer` entry pins a version of its importer the catalog does not hold

<!-- covers: pkg/catalog.ErrImporterVersionUnsatisfiable -->

A `plugins.importer` entry attaches an importer by its identity and a version — an exact one, `uri: importer/<name>:1.2.0`, or a range, `uri: importer/<name>:^1.2.0` — and that importer advertises the format the import asks for, but no version of it the import chooses among satisfies the pin — the versions the workspace's catalog holds, and for a [core importer](../plugins/core-importers.md) the compiler's own version as well: the exact version is not there, or none of its versions falls in the range. The version is an explicit choice, so the import is refused before any importer runs, rather than running another version of the importer in its place.

This is distinct from no importer advertising the format, described above: here the importer is one the import chooses among and advertises the format, and only the version the entry names is missing. A pin that is none of the forms a version pin takes, such as `:latest`, is reported as malformed instead, as "A version pin is none of the forms a pin takes" describes.

Emitted message, naming the format's capability and the version the entry pins:
> no importer plugin version satisfies the plugins.importer entry's version pin: capability `"import:<format>"` pins `"<version>"` but no serving plugin version satisfies it

**How to fix:** change the version in the entry's `uri` to one the catalog holds — for a core importer, the compiler's own version is one too — or widen the range, or add the version the entry names to the catalog. A caret range matches versions at or above its floor within the same major, so `^2.0.0` is not satisfied by a `1.x` importer however recent.

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
> resolve cached plugin `"<plugin-identity>"`: the digest recorded as trusted for it is `<recorded-digest>`, but the plugin manifest in the content cache reports `<cached-digest>`; review what changed and re-record the trusted digest, or restore the recorded artifact: the digest recorded as trusted for this plugin does not match the digest its cached manifest reports

**How to fix:** find out what changed before you re-record anything — this is a plugin that can reject your builds, and the recorded digest is the statement that someone looked at it. Where the change is expected, because you upgraded the plugin deliberately, review the new artifact and re-record the trusted digest for it. Where it is not expected, restore the artifact the record names; the disagreement is telling you the identity moved without anyone deciding it should.

### An `extends:` chain cannot be assembled

<!-- covers: pkg/validator.ErrInheritanceMerge -->

A Component's, Feature's, Manifest's or Release's `extends:` chain names a parent that cannot be resolved, so the chain cannot be turned into a single resolved entity.

It is distinct from a cycle, which has its own condition and its own remedy — see "Cyclic extends chain" above; from a chain past the depth bound, which has its own condition below; and from an unsatisfiable version pin, where the parent exists and only the version does not.

Emitted message, naming the entity carrying the unresolvable `extends:` and the reference it declares:
> inheritance merge failed (Component `<name>`, at `.spec.extends`, `<entity>` extends `<reference>`, which no catalog entity provides). Verify the extends reference names an entity present in the catalog

`Feature` appears in place of `Component` where a Feature's chain is the one that failed. As with a loop, the entity named first is the one the resolution started from and the entity named in the edge is the one whose `extends:` line to open; along a multi-tier chain those differ.

**A Manifest's `extends:` is answered against a different place, so it is answered with different advice.** A Manifest is operator configuration authored beside the Release rather than catalog content, and its `extends:` names a relative-path file or the `metadata.name` of a Manifest in the Release's own directory — never a catalog entity. Its message therefore closes with what the reference failed to resolve to and where to look instead:
> inheritance merge failed (Manifest `<name>`, at `.spec.extends`, `<entity>` extends `<reference>`, which could not be resolved: `<what looking produced>`). Verify the extends reference is a relative path or the name of a Manifest in the Release's directory

That trailing detail is the failure the lookup itself reported — the file that could not be read, or the scan that indexed no Manifest under that name — so it usually says which of the two forms was tried and why it came back empty.

**A Release's `extends:` is answered against a directory, and it accepts one form.** A Release names its parent as a relative path — `./base-release.yaml`, or `../shared/base-release.yaml`. The directory it is answered against is the one holding the Release that writes the reference, and **every link along a chain is answered against its own directory** — so a mid-chain Release kept in a sub-directory names its parent beside itself, wherever the Release a command names sits. A bare token is not a path and does not name a Release the compiler will look for, so it is reported here rather than searched for somewhere it cannot be found:
> inheritance merge failed (Release `<name>`, at `.spec.extends`, `<entity>` extends `<reference>`, which could not be resolved: `<what looking produced>`). Verify the extends reference is a relative path to a Release file, such as ./base-release.yaml, resolved from the directory holding this Release

**How to fix:** for a Component or Feature, confirm the `extends:` value names an entity the catalog holds, spelled as that entity's own `metadata.name` — case included. For a Manifest, confirm the file is where the relative path points, or that a Manifest with that `metadata.name` sits in the Release's directory and parses. For a Release, confirm the value begins `./` or `../` and that the file it points at is there and parses as a Release.

### An `extends:` chain runs past the depth bound

<!-- covers: pkg/validator.ErrExtendsChainTooDeep -->

A Component's, Feature's, Manifest's or Release's `extends:` chain ends cleanly but runs through more entities than the bound of ten allows.

It carries a condition of its own rather than sharing the one above, because the two remedies have nothing in common: an absent parent is a reference to correct, and an over-deep chain is a shape to flatten. The bound is a guard against an authoring accident rather than a structural limit — architects typically extend a baseline by one or two tiers, and a chain ten deep is usually a base tree that grew rather than a deliberate design.

**Only a chain that ENDS reaches it.** A chain that loops back on itself is reported as a loop whatever its length, so this condition never stands in for a cycle and its advice — shorten the chain — is never given for one.

Emitted message, naming the bound and the length the chain reached:
> extends chain exceeds maximum depth (Component `<name>`, rule extends). the bound is 10 and this chain reaches `<length>`; shorten the chain, or extend a base that sits closer to its root

`Feature`, `Manifest` or `Release` appears in place of `Component` where one of those chains is the one that failed. The bound is the same ten for every kind that declares `extends`, and it counts the entities on the chain rather than the links between them: a chain of exactly ten entities builds, and the eleventh entity is what this reports. So an entity that extends a base which extends a base — three entities, two links — has reached three.

**How to fix:** collapse the middle of the chain. A chain that deep usually means each tier adds a little, and folding several tiers into one base entity is both the fix and the clearer shape. Where the tiers are genuinely distinct, an entity further down the chain can extend a base nearer the root directly instead of inheriting through every tier between. A Manifest chain that deep is usually a per-environment overlay stack — fold the tiers nobody varies into the base it overlays.

### An assertion name is declared twice along an `extends:` chain

<!-- covers: pkg/validator.ErrAssertionNameCollision -->

An entity and something it extends both declare an assertion under the same name, and the two declare **different** rules. An extending entity's assertions add to its base's; they never replace one. So a name declared twice with two different rules would silently retire the base's invariant, which is the opposite of what extending an entity is for.

Declaring the same name with the *identical* rule is not a collision and builds. That is what keeps the check idempotent along a chain: without it, a three-deep chain would collide with its own middle tier every time.

Order is part of the contract rather than incidental. Assertions evaluate in the merged order and the first failing one halts, so a base's invariant is checked before a descendant's, and along a chain the set accumulates from the root down.

Emitted message:
> assertion name declared twice across the extends chain (Component `<name>`:`<version>`, rule assertions, at `.spec.assertions.<key>`). assertion `"<key>"` is already declared by the base Component `"<base>"`, carrying a different rule; rename the extending entity's assertion; an extending entity's assertions add to the base's and never replace one

**How to fix:** rename the extending entity's assertion, which the message names along with the base that already declares it. Where you meant to *replace* the base's rule, that is not something extending supports — narrow the base's assertion so it holds for every entity extending it, or move the rule down onto the entities that actually need it. Where the two rules are meant to be the same, make them textually identical and the collision goes away.

### An external input's URL uses a scheme that is not allowed

<!-- covers: pkg/externalinputs.ErrSchemeNotAllowed -->

A URL an entity points at uses a scheme outside the allowed set. Three are allowed: `https`; `http`, but only to a loopback host, so cleartext can only ever reach the local machine; and `oci`, for content pulled from a registry.

Emitted messages, for a non-loopback `http` URL and for any other scheme:
> externalinputs: `"<url>"`: plain http is allowed for loopback hosts only (allowed schemes: https, http to a loopback host, oci): externalinputs: URL scheme is not allowed
> externalinputs: `"<url>"`: scheme `"<scheme>"` is not allowed (allowed schemes: https, http to a loopback host, oci): externalinputs: URL scheme is not allowed

**How to fix:** switch the URL to `https`, or to `oci` where the content is published in a registry. A plain `http` URL to a remote host is refused rather than downgraded, so pointing it at the secure scheme is the fix; a local development server keeps working over `http` because a loopback host is allowed.

### A render requests an external input the lockfile does not pin

<!-- covers: pkg/externalinputs.ErrAcquisitionDisabled -->

Something a build needs is fetched from a URL the lockfile does not pin. A build renders the closure its lockfile records and fetches nothing, so there is no setting that would let this run acquire the URL instead: the frozen closure is what makes a build reproducible, and quietly widening the input set is the one thing it must not do.

Reaching this halt is therefore informative rather than a configuration mistake. The pins were complete when the Release was resolved, so an unpinned URL now means something changed since then — a value that steers which references a render asks for, a chart that started pointing somewhere new, or a lockfile resolved against a different Release.

Emitted message:
> `"<url>"` is not pinned in the lockfile; run `aggrega pull --release <release>` to pin every external input this Release's render consumes, then build again: externalinputs: acquisition is disabled for unpinned inputs

**How to fix:** pin the input. `aggrega pull --release <path>` renders the Release to find out which external inputs it consumes, fetches each one, and records its digest in the lockfile beside the dependency pins — after which every later build serves it from the pinned record and needs no network at all. Where the URL is new because something you authored started pointing at it, resolving the Release again is the step that was skipped; where it is unexpected, the reference that introduced it is worth finding before you pin it.

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

Wherever the condition is met, it reports in the same words, so the text names the type and the fault rather than the check that raised it.

It also names no document and no key inside one, which is deliberate and is the one place this halt reads differently from every other. Every other halt positions itself on the file and the field you would edit to clear it; there is no such file here, so a position would send you to a key that is not at fault. The type the two views disagree on is reported instead, because that is what makes the divergence reproducible for whoever investigates it.

Emitted message:
> the compiler's own views of the catalog disagree (internal error: this build resolved a component type that the catalog it reads then held no entry for. This is a fault in the compiler rather than in an authored document, so there is nothing to correct in the Aggregate, the Release or the catalog. Please report it, naming the command that produced this build and the type the views disagree on: `"<type>"`)

**How to fix:** nothing in your own files — this reports an inconsistency inside the compiler rather than a fault in what you wrote, and it is worth reporting as a defect with the type the message names. The component's type is almost certainly fine; if you need to get past it while the defect is investigated, writing the type as a relative path to a local entity file takes that component off the catalog-resolution path.

### A reference names no entity the catalog holds

<!-- covers: pkg/closure.ErrUnresolvableURI -->

Before a build renders anything, the whole set of entities a Release depends on is walked and each one pinned, so the lockfile records exactly what the build will read. A reference the catalog cannot answer stops that walk: nothing can be pinned for it, and carrying on would write a lockfile short an entry the build needs later, with nothing saying so.

The refusal names the reference and where it was collected, because one entity is reached from many places and the place that names it is where the correction goes. A library reference is reported on its own, without a collection path — a library is reached from the entities that `$ref` or `$import` it, and the failing name is the whole of the fault.

Emitted message, for a catalog entity — the trailing part lists the places that reference it:
> resolve: no entity in the catalog matches this URI: entity `"<reference>"` (referenced from `<referring paths>`)

for a library:
> resolve: no entity in the catalog matches this URI: library `"<reference>"`

and for a plugin bound to a provider socket, which is named by the workspace configuration key that carried it rather than by a catalog document:
> resolve: no entity in the catalog matches this URI: entity `"<reference>"` (referenced from .aggrega-config.yaml.plugins.providers)

**How to fix:** read the reference exactly as the message quotes it. A name that does not exist, a version that was never published, and a bare name whose registry the workspace is not pointed at all arrive here identically, so check the three in that order: correct the spelling; confirm the version exists; confirm the registry holding it is configured and reachable. Where the entity is one you author locally, confirm the file is inside the catalog the build walks.

### A library reference is not written in the identity form

<!-- covers: pkg/closure.ErrInvalidLibraryRef -->

A cross-library `$ref:` or `$import:` names the library by identity and then the entry inside it: the library's bare name, optionally a `:` and a version floor, then `#` and the path of the entry on the surface the field reads. There is no registry host in that form. Which registry a name resolves through is workspace configuration, and which version a build uses is the lockfile's answer, so a reference carrying either would fix in the document something the build is supposed to decide.

Refused here: a value carrying a registry host; an in-document anchor written where a cross-library reference was expected; an empty library name; and `@` written as the version separator, which is reported with the corrected spelling rather than as a generic shape complaint, because it is the mistake this form attracts most.

Emitted message:
> resolve: invalid library reference URI: `"<the value as written>"`

and where `@` was used as the separator, quoting what the value should read instead:
> resolve: invalid library reference URI: version separator is ':', not '@' — use `"<the corrected value>"`

**How to fix:** rewrite the value as `<Library>#<entry-path>`, adding `:<version>` after the library name only where you need a floor on which version may be selected. Drop any registry host. Where the reference was meant to point inside the same document, an in-document anchor is a different thing from a library reference, and the field you wrote it on expects the library form.

### Two consumers of one library require incompatible versions

<!-- covers: pkg/closure.ErrMVSConflict -->

Several entities may reference one library, each naming a version floor or none at all, and the version the build selects is the highest floor any of them named. That is what lets a consumer asking for less still receive a version that satisfies it, and it is why adding a consumer with a higher floor moves everyone up rather than splitting the build across two copies.

The rule holds only while the floors agree on the leading version number. Two consumers naming different majors are asking for two libraries that happen to share a name, and no single selection satisfies both — so rather than pick one and let the other consumer read a shape it was not written against, the build stops and names the disagreement. A consumer naming no floor takes part in nothing here: the selection is decided by the consumers that pinned.

Emitted message. The consumers are compared in sorted order: the first to name a floor sets the major, and the message lists each consumer compared, up to and including the first whose floor names a different major, against the version it required — so the same documents always name the same consumers:
> resolve: minimal version selection conflict — incompatible library version requirements: library `"<library>"` has consumers requiring incompatible majors: `<consumer>` wants `<version>`; `<consumer>` wants `<version>`

**How to fix:** raise the lower consumer's floor to the same major, which is the ordinary answer once the newer shape is what everyone wants. Where both majors are genuinely needed at once, they are two libraries: publish the older shape under a name of its own and point the consumer that needs it there, so each reference names the thing it was written against.

### The chain of module imports is deeper than the pin walk descends

<!-- covers: pkg/closure.ErrSubAggregateDepth -->

Pinning walks every module an Aggregate imports, then every module those import, so the whole set reaches the lockfile rather than only the first level. A module already recorded is not walked a second time, which is what ends an ordinary loop — an Aggregate importing a module that imports it back terminates without complaint, having recorded each once.

A depth bound of ten backstops the chain that repeat-detection cannot see: one presenting a fresh identity at every level, as a module re-published under a new version at each step does. The bound is the same one the graph builder applies, so a composition that pins is a composition that also builds.

Emitted message:
> resolve: sub-aggregate inclusion depth exceeded: `"<module>"` at depth `<depth>`

**How to fix:** shorten the chain. A chain this deep usually mirrors how an organisation is arranged rather than how the deployment is, so look for levels that contribute no components of their own and collapse them into their parent. Where each level exists only to re-publish the level beneath it under a new version, the versions are the chain: import the module you actually want directly, at the version you want.

This is the pinning walk's bound. The graph builder applies its own, reported under "Sub-aggregate nesting depth exceeded" below, and the two are separate reports of the same limit met at two points — the first while the lockfile is being filled, the second while the graph is being built.

### The catalog view a build was given cannot load the bodies pinning needs

<!-- covers: pkg/closure.ErrNoAggregateLoader, pkg/closure.ErrNoRecipeLoader -->

Two of the axes pinning walks need more than a version answer from the catalog: they need the documents themselves. The modules an Aggregate imports have to be read to find what *they* import in turn. The Recipes, FeatureRecipes and Plugins a build binds have to be read to find the artifacts and libraries *they* name. A catalog view that can resolve a version but cannot hand back those bodies leaves both axes with nothing to read.

Both are refused up front rather than skipped, and the reason is what a skip would produce: a lockfile short a whole class of entries, written without complaint, that a later build reconstructs faithfully and finds incomplete. Neither message carries values of its own, because neither is about a document you wrote — each states which axis cannot be computed:
> resolve: catalog lookup cannot load resolved sub-aggregate bodies
> resolve: catalog lookup cannot load resolved recipe and plugin bodies

**How to fix:** nothing in your files produces either, and there is no authoring change that clears one — the fault is in how the build was wired rather than in what it was asked to build. Report it with the command you ran and the workspace configuration it ran against.

### An annotation-transform plugin names a component it was not given

<!-- covers: internal/compiler/pipeline.ErrAnnotationInjectionRejected -->

An operator may attach a governance plugin in a role that adds annotations, and that attachment is a declaration: the operator asked for the transformation, so what the plugin adds is explicit rather than injected behind anyone's back. The role is confined to match. The plugin is handed the component coordinates your documents declare, and may add string-valued annotations onto those. The shape it returns admits nothing else — no other field, no other kind of value — so the one confinement left to check after its output is applied is whether every injection named a coordinate it was given.

An injection naming a boundary-and-component pair outside that set stops the build. A plugin reaching a component your documents never exposed would be configuring infrastructure nobody declared, and the annotations it adds are expanded into Feature attachments exactly as authored ones are, so the effect would be resources appearing from a component the operator did not put in front of it.

Each accepted injection also carries a companion annotation, `aggrega.ai/injected-by`, naming the plugin that made it. The host writes that annotation; a plugin cannot supply one, so what it says about where an injected annotation came from is not the plugin's to shape.

Emitted message:
> annotation-transform plugin output was rejected: an injection targets a component coordinate the host did not supply: injection targets boundary `"<boundary>"` component `"<component>"` (annotation `"<key>"`)

**How to fix:** the fault is the plugin's rather than your documents' — correct it so it injects only onto the coordinates it is handed, each of which arrives in its input. Where the component in the message is one you expected the plugin to see, check that the Release declares it inside a boundary: only declared component coordinates are handed over. Removing the attachment from `plugins.governance` is the immediate way to unblock a build while the plugin is corrected.

### A plugin reference is not a Plugin entity

<!-- covers: pkg/pluginpath.ErrPluginEntityNotFound -->

A plugin is referenced by its Plugin entity, always scoped by the plugin's own socket type: `<pluginType>/<name>`, optionally with a version, as in `parser/yaml` or `parser/yaml:1.0.0`. The scope is mandatory rather than one form among several — an unscoped `name:version` is refused, because two sockets may hold a plugin of the same name and the scope is what makes the entity resolvable. The binary the entity points at is reached through the entity, never named directly, so the entity is what carries the capability claim, the runtime limits and the recorded command set the load checks the binary against. A reference that names no Plugin entity therefore has nothing to check the binary against, and the build stops rather than load bytes on an unchecked reference.

Two shapes report here, and they are checked at different moments. A reference whose **form** cannot be an entity — a filesystem path, or an artifact reference such as an `oci://` URL, a bare `.wasm`, or an `@sha256:` digest — is refused up front on the surfaces that take only entity references. A reference that names no entity anything holds is refused after the lookup, and what the message says depends on how it is written: a Plugin entity URI — `<pluginType>/<name>`, optionally versioned — is reported as an entity that no catalog directory holds, the binary does not carry and no pull has fetched, and any other reference is told to take that form. Both shapes report the same condition, so a build's response to either is the same.

**A pull refuses the second shape before a build meets it.** Every Plugin a Recipe's or FeatureRecipe's `pipeline` names is resolved with the rest of the Release's dependencies — from a catalog directory, the copy inside the compiler binary, the content cache, or a registry — and one that none of them holds stops `aggrega pull` before it writes the lockfile, with this condition and the same message, naming the Recipe or FeatureRecipe whose pipeline names it.

**Not every surface refuses a non-entity form.** The pipeline-plugin surface takes entity references only; the surfaces an operator attaches a plugin to directly accept any form and pass a non-entity reference on to be resolved as an artifact. So the same reference can be accepted at one attachment point and refused at another, and that difference is the surface's, not the reference's.

Emitted messages. A filesystem path:
> plugin reference is not a Plugin entity: `"<reference>"` is a filesystem path, but a pipeline plugin must be a plugin-type-scoped Plugin entity URI (`<pluginType>/<name>`, optionally versioned, as in `parser/yaml` or `parser/yaml:1.0.0`)

an artifact reference:
> plugin reference is not a Plugin entity: `"<reference>"` is an artifact reference (an `oci://` scheme, a bare `.wasm`, or an `@sha256:` digest), but a pipeline plugin must be a plugin-type-scoped Plugin entity URI (`<pluginType>/<name>`, optionally versioned, as in `parser/yaml` or `parser/yaml:1.0.0`)

a Plugin entity URI that nothing holds:
> plugin reference is not a Plugin entity: `"<reference>"` is a Plugin entity URI, but no catalog directory holds the entity it names, the binary does not carry it, and no pull has fetched it into the content cache; place the Plugin entity in a catalog directory, or publish it to a registry and run `aggrega pull`

and any other reference naming no entity — one without a plugin-type scope, with more than one `/` before its version, or carrying a registry host:
> plugin reference is not a Plugin entity: `"<reference>"` must be a plugin-type-scoped Plugin entity URI (`<pluginType>/<name>`, optionally versioned, as in `parser/yaml` or `parser/yaml:1.0.0`); a bare `.wasm` reference or an artifact reference names no Plugin entity

**How to fix:** write the reference as the Plugin entity's socket-type-scoped identity, optionally with its version — `<pluginType>/<name>` or `<pluginType>/<name>:<version>`. Where you were pointing at a file or an artifact directly, publish or author a Plugin entity for it and reference that instead — the entity is where the claims the load checks live, so there is no equivalent form that skips it. Where the message says the reference is a Plugin entity URI, its form is right and the entity is what is missing: place the Plugin entity in a catalog directory the workspace lists, with its built `.wasm` beside it, or publish the plugin to a registry the workspace reads and run `aggrega pull`, which fetches it into the content cache — and check that the version you name is one that exists.

### A cached signature bundle does not match the digest recorded for it

<!-- covers: pkg/oci.ErrSignatureBundleDigestMismatch -->

An artifact whose signature was verified when it was fetched carries that fact forward on its lockfile entry — or, for a plugin attached at a verdict role, on its entry in `plugins-trust.yaml` — as a recorded digest of the signature material, cached alongside the artifact. Before anything renders, the build re-reads that cached material for every entry it reads that records one — a catalog entity of any kind, a library, a plugin — and re-hashes it, and the hash has to be the recorded one. A plugin the lockfile pins, and a plugin attached at a verdict role, has its material checked again when its bytes are loaded, which is what reaches the commands that load a plugin outside a build — `aggrega lint --release` and `aggrega validate --release` among them. A bundle that is missing, unreadable, or hashes to something else means the reviewed material is not what is on disk now, and the run stops rather than use an artifact whose signature evidence has changed underneath the record.

**The re-check is a hash comparison and nothing more.** It re-verifies no signature, contacts no network and consults no trust material, so it holds in a build with no network access at all — which is what lets a verified-once artifact stay verified across later offline builds.

**The next pull repairs it.** A pull holds every entry the content cache served to the same check, and where the check refuses an entry it asks the artifact's registry about the signature again — whatever the signing requirement says, through the same verification an artifact it fetches gets — records what that verifies on the entry, and caches the bundle it names, rewriting a cached copy that no longer matches its digest. A plugin attached at a verdict role is verified again on every pull whatever its entry records, and its bundle is cached the same way. So the message for an entry the content cache served names that pull. An entry read from a catalog directory, from the copy inside the compiler binary or from beside the Release is never asked about at a registry, so a pull leaves a signature recorded on it as it is, and its message names no pull.

Emitted messages, naming the artifact, the cached file and — for an entry the content cache served — the pull that repairs it, the file it records the signature in and the Release it pulls. From the build's check, unreadable or absent:
> artifact `"<reference>"`: cached signature bundle `<path>` is unreadable: cached signature bundle does not match its recorded digest. remediation: run `aggrega pull --release <release>` to verify the artifact's signature at its registry again, record it in `<file>` and cache the bundle it names

and drifted:
> artifact `"<reference>"`: cached signature bundle `<path>` has digest `<actual>`, recorded digest is `<recorded>`: cached signature bundle does not match its recorded digest. remediation: run `aggrega pull --release <release>` to verify the artifact's signature at its registry again, record it in `<file>` and cache the bundle it names

and, where a plugin's bytes are loaded from the content cache, naming where they came from as well:
> plugin `"<reference>"` resolved from `<source>`: cached signature bundle `<path>` is unreadable: cached signature bundle does not match its recorded digest. remediation: run `aggrega pull --release <release>` to verify the artifact's signature at its registry again, record it in `<file>` and cache the bundle it names

> plugin `"<reference>"` resolved from `<source>`: cached signature bundle `<path>` has digest `<actual>`, recorded digest is `<recorded>`: cached signature bundle does not match its recorded digest. remediation: run `aggrega pull --release <release>` to verify the artifact's signature at its registry again, record it in `<file>` and cache the bundle it names

`<file>` is the Release's lockfile, or `plugins-trust.yaml` in the Release's directory. For an entry no pull asks about, the message ends before `remediation:`.

**A pull that has no registry to ask stops instead.** A catalog entity or a library is named without a registry and is bound to one through the workspace's `default_registry`. Where the workspace names none — it did when the signature was recorded, and no longer does — no registry is configured to ask about the entry again, so the pull stops with this condition rather than write a lockfile the next build refuses, and leaves the lockfile as it was. Its message carries, after the step the pull was taking:
> verify: `"<reference>"` records a signature a build does not accept, and no registry is configured to ask about it again: cached signature bundle `<path>` is unreadable: cached signature bundle does not match its recorded digest

**How to fix:** nothing in your entity files causes this — the cache is the build's, not yours. Run `aggrega pull --release <release>`, the command the message names: it verifies the artifact's signature again and writes the signature and its bundle together, which repairs a bundle removed or altered since the pull that cached it. Under the offline posture that pull stops — with the offline refusal, because repairing means asking the registry, or, for a plugin attached at a verdict role, before that, naming the plugin's `.wasm` as one it could not resolve, because a pull resolves that `.wasm` from the plugin's registry; allowing the network for that one run repairs it. Where the pull stops saying no registry is configured to ask about the entry, set `default_registry` to the registry the artifact was pulled from, and pull again. Where the workspace skips signature verification for the artifact, the pull records no signature on the entry instead, which the build admits under that same setting. Where the signature the registry serves does not verify, the pull stops with that verification's own refusal: the recorded signature and the material the publisher serves genuinely disagree, and that is a question for whoever publishes the artifact. For an entry whose message names no pull — one read from a catalog directory, from the copy inside the compiler binary or from beside the Release — remove the `signature` from its entry: such an entry is never held to a signing requirement, so the build then goes ahead.

### A recorded signature was made for a different artifact

<!-- covers: pkg/oci.ErrSignatureForAnotherArtifact -->

A signature says which artifact it was made for. When a pull verifies an artifact's signature it records the fact on the artifact's lockfile entry — or, for a plugin attached at a verdict role, on its entry in `plugins-trust.yaml` — and caches the signature it verified. Before anything renders, the build reads, from the cached signature of every entry the content cache served, which artifact it was made for, and that has to be the artifact the build itself read for the entry: the one whose manifest is held beside its bytes in the content cache, never anything the entry records. A signature made for a different artifact stops the build. It is what a `signature` copied from one entry onto another looks like: the cached signature it names is intact — it still matches the digest recorded for it — and it was made for the other entry's artifact.

**It does not depend on a signing requirement.** A recorded signature is held to what it claims whether or not one is required, as the check that the cached signature matches its recorded digest is.

**A plugin is held the same way wherever it is loaded.** A plugin the lockfile pins, and a plugin attached at a verdict role, has its recorded signature held to the artifact its bytes were read as when those bytes are loaded from the content cache, which reaches the commands that load a plugin outside a build — `aggrega lint --release` and `aggrega validate --release` among them, and the same operations reached through `aggrega serve` and `aggrega mcp`.

**What the check reads, and what it cannot tell.** It reads the cached signature and the manifest beside the artifact, and compares hashes: it verifies no signature, contacts no network and consults no trust material, so it holds in a build with no network access at all. It reads which artifact a signature was made for in both forms a pull accepts — a signature made over the artifact itself, which is what the toolchain's own signers make, and a signed statement that names the artifact — so a signature copied from one entry onto another is refused in either form. It is the same reading a pull applies to every signature it accepts: a pull refuses a signature that verifies but that the reading does not find made for the artifact, or cannot read the artifact from at all, so no signature a pull records is one the check cannot read. An entry read from a catalog directory, from the copy inside the compiler binary or from beside the Release comes with no manifest, so its recorded signature is held only to its recorded digest; so is a signature placed in the cache by hand in a form that is neither of those two. And because no signature is verified, a signature written into the cache by hand, made out for the entry's own artifact, is not told apart from one a pull verified.

**The next pull repairs it.** A pull holds every entry the content cache served to the same check, and where the check refuses an entry it asks the artifact's registry about the signature again — whatever the signing requirement says — and records what that verifies on the entry in place of the copied signature. A plugin attached at a verdict role is verified again on every pull whatever its entry records. Only an entry the content cache served is held to which artifact its signature was made for, so every refusal of this condition by a build or a plugin load names that pull.

Emitted messages, naming the entry, the file that records the signature, the cached signature, the manifest the build read for the entry, and the pull that repairs it. From the build's check:
> artifact `"<reference>"`: signing: the recorded signature was made for a different artifact (`<file>` records it, cached signature bundle `<path>`, the artifact read has manifest `<manifest-digest>`). remediation: run `aggrega pull --release <release>` to verify the artifact's signature at its registry again, record it in `<file>` and cache the bundle it names

and, where a plugin's bytes are loaded, naming where they came from as well:
> plugin `"<reference>"` resolved from `<source>`: signing: the recorded signature was made for a different artifact (`<file>` records it, cached signature bundle `<path>`, the artifact read has manifest `<manifest-digest>`). remediation: run `aggrega pull --release <release>` to verify the artifact's signature at its registry again, record it in `<file>` and cache the bundle it names

`<file>` is the Release's lockfile, or `plugins-trust.yaml` in the Release's directory.

**A pull that has no registry to ask stops instead**, as it does for a cached signature bundle that no longer matches its digest: where a catalog entity or a library carries a copied signature and the workspace no longer names a `default_registry` to bind it to, the pull stops with this condition and leaves the lockfile as it was. Its message carries, after the step the pull was taking:
> verify: `"<reference>"` records a signature a build does not accept, and no registry is configured to ask about it again: signing: the recorded signature was made for a different artifact (cached signature bundle `<path>`, the artifact read has manifest `<manifest-digest>`)

**How to fix:** nothing in your entity files causes this — the signature the entry records belongs to another artifact. Run `aggrega pull --release <release>`, the command the message names: it verifies the entry's own signature at its registry and records it in place of the copied one, for a lockfile entry and for a plugin attached at a verdict role alike. Restoring the entry's own recorded signature from version control, where the file is committed, works too. Under the offline posture the pull stops — with the offline refusal, because repairing means asking the registry, or, for a plugin attached at a verdict role, before that, naming the plugin's `.wasm` as one it could not resolve, because a pull resolves that `.wasm` from the plugin's registry; allowing the network for that one run repairs it. Where the pull stops saying no registry is configured to ask about the entry, set `default_registry` to the registry the artifact was pulled from, and pull again. Where the workspace skips signature verification for the artifact, the pull records no signature on the entry instead, which the build admits under that same setting.

### No verified signature is recorded for an artifact that requires one

<!-- covers: pkg/lockfile.ErrSignatureNotRecorded -->

A pull that fetches an artifact from a registry verifies its signature against that registry's trust policy and records the verified fact on the artifact's lockfile entry. A build reaches no registry, so it reads the recorded fact rather than verifying again — and before anything renders, it holds every entry it reads to the requirement the pull applied when it fetched the artifact. An entry the content cache served, for an artifact a signature is required for, that records no verified signature stops the build: nothing the build holds says the artifact it is about to render from was ever verified.

**The requirement is the pull's, setting for setting.** A signature is required where the workspace-wide signing policy covers the artifact's kind, or where the registry's own entry in `.aggrega-config.yaml` — or, for `hub.aggrega.ai` with no entry of its own, the official hub's built-in policy — requires one; an artifact whose kind could not be determined counts as required under an active policy. What lets a pull admit an artifact with no signature lets the build admit its entry too: `skip_signature_verification` at the top level, the same switch on the registry's own entry except for a kind the workspace-wide policy requires, and a registry marked `advisory`.

**Where an entry came from is read from the build, never from the lockfile.** Every entry the content cache served is held, whatever else the entry records, so removing an entry's manifest digest along with its signature does not exempt it. An entry read from a catalog directory, from the copy inside the compiler binary, or from beside the Release is never held, because no registry signature exists for bytes that did not come from one. Entries of every section are checked alike — catalog entities, libraries and plugin artifacts — and every entry the check refuses is named in the same run.

**A plugin attached at a verdict role is held by the same check, through `plugins-trust.yaml`.** A `plugins.governance` attachment in an `ir-verdict` or `render-verdict` role, and every `plugins.linter` attachment, shapes no rendered byte, so it has no lockfile entry; the record beside the lockfile carries its verified signature instead. Each such plugin the build reads from the content cache is held to the same requirement, through the same settings: an entry in that record recording no signature stops the build, and so does no entry for the plugin at all — deleting the record does not exempt it. A plugin served from a catalog directory or from the copy inside the compiler binary is not held. The requirement holds such a plugin wherever it is loaded for a Release, not only in a build: `aggrega lint --release` and `aggrega validate --release`, and the same operations reached through `aggrega serve` and `aggrega mcp`, fail on this condition when they load it.

Emitted messages, naming the entry, the file that records no signature for it, the settings that require its signature and the command that records it in that file. For a lockfile entry, naming the lockfile:
> signing: no verified signature is recorded for an artifact that requires one (`"<reference>"`, `<lockfile-path>` records no signature for it, required by `<the settings that require it>`). remediation: run `aggrega pull --release <release>` to verify the artifact's signature at its registry and record it in `<lockfile-path>`

and for a plugin attached at a verdict role, naming its record:
> signing: no verified signature is recorded for an artifact that requires one (`"<plugin>"`, `<record-path>` records no signature for it, required by `<the settings that require it>`). remediation: run `aggrega pull --release <release>` to verify the plugin's signature at its registry and record it in `<record-path>`

Both files are named by their path beside the Release the command was given: `<lockfile-path>` is the Release's lockfile, and `<record-path>` is `plugins-trust.yaml` in the Release's directory.

The settings are named in the configuration file's own words: `` `signing.required` at the top level of the workspace configuration``, `` `signing.required` on the `registries` entry for "<host>"``, or `the official hub's built-in signature requirement for "hub.aggrega.ai"`, joined where more than one applies.

**How to fix:** run the pull the message names. For an entry the content cache serves that records no signature where one is required, the pull asks the artifact's registry for its signature, by the manifest digest the entry records, exactly as it does for an artifact it fetches, and records the verified signature on the entry — so the next build reads it. A plugin attached at a verdict role is asked about on every pull in any case, and the pull records what it verified on the plugin's entry in `plugins-trust.yaml`, creating the entry where there is none. A registry that attaches no signature, or a signature the trust configuration does not accept, halts that pull instead, naming the artifact, and that is a question for whoever publishes it. Under the offline posture the pull cannot ask: over a lockfile entry it refuses naming how to allow the network for one run, and over a plugin attached at a verdict role it stops before asking, naming the plugin's `.wasm` as one it could not resolve, because a pull resolves that `.wasm` from the plugin's registry. Restoring the entry's recorded signature from version control clears it without the network, where the cache still holds the signature material that record names. Where the artifact is not meant to be signed, the requirement is the thing to change, and the message names which setting it is — but relaxing it means that registry's artifacts are no longer checked at a pull either, so prefer narrowing the workspace-wide policy's kinds over switching a requirement off.

### A recorded signature is not the one a pull would record

<!-- covers: internal/pullops.ErrRecordedSignatureOutOfDate -->

`aggrega pull --verify` reports whether running `aggrega pull` now would change the files a pull commits, and the signature a pull verified for an artifact is part of what it writes: the `signature` on a lockfile entry, and on an entry of `plugins-trust.yaml` for a plugin attached at a verdict role. This condition is what a verify reports for each recorded signature a plain pull would write differently — one it would record where none is recorded, one it would replace, or one it would clear. The verify writes neither file, and names every such entry, in either file, in the same run.

**Two lockfile entries are reported without asking a registry**, because a pull rewrites them whatever the registry answers, so they are reported under the offline posture too: an entry the content cache served that records no signature where the trust configuration requires one — the pull records the artifact's signature, or stops where it cannot establish one — and an entry whose recorded signature was made for another artifact, which the pull replaces with the artifact's own.

**Every other entry a pull would look up again is asked about**, because only the registry's answer says whether the pull would change it: an entry whose bytes the verify fetched because the content cache did not hold them, and an entry whose cached signature bundle was removed, is unreadable or was altered. The verify asks the registry as the pull would, reports the entry where the answer records, replaces or clears its signature, and caches the bundle it verified as a pull caches it. Under the offline posture such an entry is not asked about and not reported: the verify prints a line naming it and saying its signature was not checked.

**For the plugin trust record,** every pull verifies the signature of each plugin attached at a verdict role at its registry, and so does a verify: an entry whose signature that verification would record, replace or clear is reported, and so is a plugin the record holds no entry for where a build refuses it for recording no signature, because a pull writes an entry carrying its signature and the build refuses the plugin until then. Any other plugin the record does not hold yet is a first sighting and is not reported. Under the offline posture a verify asks no registry about these plugins: it reads each from the content cache, as a build reads it, and holds its identity and its host functions as a connected verify does. It reports without asking a plugin a build refuses for recording no signature — its entry records none, or the record holds no entry for it — and one a build refuses because the signature its entry records was made for another artifact, because a pull rewrites that entry whatever the registry answers; it prints a line naming every other entry and saying its signature was not checked.

**Deprecation markers are not compared.** A marker attached to an artifact after the pull is the registry's state and moves without anything in the workspace changing, so a verify failing on one would fail a check over files nobody touched — the reason a recorded marker advises a build rather than stopping it.

Emitted messages, one per entry, naming the entry, the file and what it records, what a pull would record instead, and the pull that brings the file up to date. Where the registry's answer, or the record's own verification, gives the signature a pull would record:
> signing: a recorded signature is not the one a pull would record (`"<reference>"`, `<file>` records `<signature>`, a pull would record `<signature>`). remediation: run `aggrega pull --release <release>` to bring `<file>` up to date

for an entry recording no signature where one is required — a lockfile entry, or, under the offline posture, an entry of the plugin trust record:
> signing: a recorded signature is not the one a pull would record (`"<reference>"`, `<file>` records no signature, a pull would ask its registry for the signature a requirement asks for and record it). remediation: run `aggrega pull --release <release>` to bring `<file>` up to date

for an entry whose recorded signature was made for another artifact — a lockfile entry, or, under the offline posture, an entry of the plugin trust record:
> signing: a recorded signature is not the one a pull would record (`"<reference>"`, `<file>` records `<signature>`, made for another artifact, a pull would ask its registry for this artifact's own signature and record it). remediation: run `aggrega pull --release <release>` to bring `<file>` up to date

and for a plugin the record holds no entry for, where a build refuses it for recording no signature — the second form under the offline posture, where the verify asks no registry:
> signing: a recorded signature is not the one a pull would record (`"<plugin>"`, `<record-path>` records no entry for it and a signature is required for it, a pull would record `<signature>`). remediation: run `aggrega pull --release <release>` to bring `<record-path>` up to date

> signing: a recorded signature is not the one a pull would record (`"<plugin>"`, `<record-path>` records no entry for it and a signature is required for it, a pull would ask its registry for the signature a requirement asks for and record it). remediation: run `aggrega pull --release <release>` to bring `<record-path>` up to date

`<signature>` states a signature by its mode, its signer and the digest of its bundle — `a keyed signature by keyed:sha256:<fingerprint> with bundle digest sha256:<digest>`, with `issued by <issuer>` after the signer for a keyless one — or is `no signature`. `<file>` is the Release's lockfile, `<lockfile-path>`, or `plugins-trust.yaml` in the Release's directory, `<record-path>`.

**How to fix:** run the pull the message names. It writes into the file named the signature the message says it would, and caches its bundle, so the next verify passes. Where the message says a pull would ask the registry, the pull records what the registry verifies — and stops instead, naming the artifact, where the registry attaches a signature the trust configuration does not accept, or none where one is required, which is a question for whoever publishes it. Under the offline posture that pull stops: over a lockfile entry with the offline refusal, because it has to ask the registry, and over a plugin attached at a verdict role before that, naming the plugin's `.wasm` as one it could not resolve, because a pull resolves that `.wasm` from the plugin's registry. Allowing the network for that one run brings the file up to date. Where the message says a pull would record no signature, the registry no longer attaches one and nothing requires it: the pull clears the entry's signature, which a build admits under the same settings — if you did not expect the registry to stop signing the artifact, that too is a question for its publisher.

### A plugin's `.wasm` is not on this machine

<!-- covers: pkg/pluginpath.ErrPluginArtifactNotFound -->

A plugin's `.wasm` is read from one of four places, in this order: the plugins built into the compiler binary, a file beside the plugin's `Plugin` entity in a catalog directory, an explicit filesystem path the reference names, and the workspace content cache that `aggrega pull` fills. Resolving a plugin only reads what is already on the machine and fetches nothing, so this condition reports that none of the four holds the bytes — not that a download failed. **One plugin is the exception: a [core importer](../plugins/core-importers.md) an import needs.** Its module is read from the binary or the content cache alone, never from beside a catalog entity, and where neither holds it the import fetches it once from the workspace's default registry; the condition then reports that the fetch was not possible as well — the workspace is offline, its registry could not be reached or does not hold the module, or the workspace names no default registry. A module that was fetched and does not verify is refused under its own condition instead, a digest mismatch or a signature refusal, and nothing is kept.

The file beside the entity is named from the entity's plugin type and name, and the pull's refusal below gives the name: for `pipeline-step/patch` it is `pipeline-step--patch.wasm`, in the directory the entity's document sits in.

**A `Plugin` entity authored in one of your catalog directories is refused when the pull resolves it.** A pull never fetches such an entity's `.wasm`: it looks in the four places above, exactly where a build looks. A pipeline step, a provider or a plugin attached at a verdict role is not pinned at all, and a build reads its entity from the catalog directory every time. A plugin attached at a transform role is pinned, because its bytes shape the rendered output: the pull records its entity and the content digest of the `.wasm` it found there, and a build refuses a `.wasm` that no longer matches. So a pull that finds the artifact in none of the four places stops there, before it writes the lockfile or any `entity.lock`, rather than leaving a build to fail later, at the step that loads the plugin. A `.wasm` the binary carries, or one already in the content cache, satisfies the pull exactly as it satisfies the build, so an entity for a plugin that ships inside the compiler needs no file beside it.

Emitted messages. The pull's refusal, pointing at the directory it expected the file in, with the resolution it asked about beneath it:
> plugin artifact not found on this machine (Plugin entity `"<reference>"` is authored in a catalog directory, expected `<file>` in `<directory>`). Place the built .wasm beside the entity under that name, or publish the plugin and reference the published Plugin entity instead of the one in the catalog directory

a plugin a build or an import loads with no source holding its bytes — and a plugin attached at a verdict role that `aggrega pull --verify` under the offline posture reads from the content cache as a build does:
> plugin `"<reference>"` not resolvable through any tier (embed, colocated, local, cache): plugin artifact not found on this machine

and the same for a reference written as a registry location:
> plugin `"<reference>"` not resolvable: an OCI plugin URI requires a prior `aggrega pull --release <release>` (so its bytes are cached) or an explicit local path; plugin resolution does not fetch from a registry: plugin artifact not found on this machine

a core importer an import could neither read nor fetch, naming the importer, its version and why — here the workspace being offline — and then what puts its module on the machine:
> core importer `"<importer>"` at version `<version>` is not on this machine, and the workspace is offline, so its registry `<host>` is not asked for it; run the import once with the network available, which fetches it from the workspace's default registry, verifies it and keeps it in the content cache for every later import, or place its module, named `<file>`, beside a Plugin entity of `<importer>` at `<version>` in a catalog folder: plugin artifact not found on this machine

The other reasons read `its registry <host> could not be reached (<cause>)`, `its registry <host> holds no <location>:<version>` and `the workspace names no default registry to fetch it from`; the last two name only the second remedy, because a run with the network available would not change them.

**How to fix:** where the entity is one you author, build the plugin and place its `.wasm` beside the entity under the name the message gives — or publish the plugin with `aggrega push` and reference the published entity in place of the catalog copy, since neither a pull nor a build fetches the `.wasm` of an entity in your catalog. Where the plugin is one you consume from a registry, run `aggrega pull` for the release, which caches it. Where you expected the compiler to carry the plugin itself, check that the binary you run does: `aggrega plugin list` names the plugins built in. Where it is a core importer, run the import once where the workspace may reach its default registry — that run fetches, verifies and caches it, and every later import is offline — or, where that registry does not hold it, place its module beside a Plugin entity of that importer at that version in a catalog folder, under the name the message gives; that entity then runs in the core importer's place.

### A plugin recorded as a trusted gate is no longer attached

<!-- covers: pkg/pluginstrust.ErrVerdictAttachmentNotConfigured -->

A plugin that returns an accept-or-reject verdict over a build is recorded once it has been resolved, so the workspace holds a record of which gates were reviewed. This condition is what a recorded gate that nothing attaches any more reports. The reason it stops the build rather than passing quietly is that its output would otherwise be indistinguishable from output the gate approved: a build with the gate silently absent and a build the gate let through produce the same files, and nobody reviewing the result could tell which they were holding.

It is a different question from a plugin whose bytes have drifted. That one refuses to run a plugin that is not the reviewed one — a question of identity. This one refuses to build with a reviewed gate missing altogether — a question of presence. The remedies differ accordingly: restore the artifact, against restore the attachment.

**What it establishes, and what it does not.** Holding the configuration to the record establishes that every recorded gate is still attached and that each one's artifact is the recorded one. It establishes nothing about whether an attached gate returns a verdict at all: an attachment whose entry function names a declared export that returns no verdict runs, reports nothing, and lets the build through, and no comparison against the record notices — the plugin that ran is exactly the recorded one and it simply ran nothing. Two neighbouring cases do stop the build, and they are named so this bound is not read as wider than it is: an entry function naming an export the plugin does not declare is refused when the plugin loads, and an output carrying a key the verdict shape does not declare is refused rather than read as an empty verdict list.

Emitted message, naming the record, the dropped gates and both remedies:
> a plugin recorded as trusted for an accept-or-reject verdict is no longer attached at any verdict role: `<record-path>` records `<plugin>` as trusted, but no verdict attachment in the workspace configuration names it; a gate that was reviewed and is now absent leaves output indistinguishable from output that gate approved. Attach the plugin again under `plugins.governance` at an `ir-verdict` or `render-verdict` role, or under `plugins.linter`; or, if it was meant to go, run `aggrega pull --upgrade --release <release> <plugin>` to drop it from the record — an ordinary `aggrega pull` leaves the record as it is, so only an explicit upgrade removes an entry

Where more than one gate was dropped, they are named together on one upgrade command rather than one command each: a targeted upgrade takes several targets and leaves every pin it did not name alone, so naming them together is both shorter and narrower than the full refresh the alternative would need.

**How to fix:** the message offers two remedies because only you know which applies. If the gate was removed by mistake, attach the plugin again under `plugins.governance` at a verdict role, or under `plugins.linter`. If it was meant to go, say so explicitly with the targeted upgrade the message spells out, which is what drops its entry. Do not edit or delete the record to clear this — it is a committed record of what was reviewed, and an ordinary pull deliberately leaves it alone, because adopting a removal silently is exactly what this refusal exists to prevent.

### A gate recorded as trusted resolves to a different identity

<!-- covers: internal/pullops.ErrVerdictPluginIdentityChanged -->

A plugin that returns an accept-or-reject verdict over a build is recorded once it has been resolved, together with the version and the artifact digest it resolved to. This condition is what a later resolution reports when it reaches a different version or different bytes for a gate the record already holds, and the run never asked for that identity to be taken up.

One condition covers both a moved version and moved bytes, because the record is addressed by the plugin's identity and carries the version and the digest as fields of one entry: comparing a resolution against it is a single comparison with a single outcome. A re-publish that changed no bytes and a re-push at the same version are the same event as far as a reviewer is concerned — the identity is no longer the one that was reviewed.

It is a different question from a recorded gate that nothing attaches any more, which is a question of presence rather than of identity. It is also different from a plugin whose cached bytes disagree with the recorded digest: that one refuses to *run* a plugin that is not the reviewed one, and its remedy is to restore or re-record the artifact, while this one refuses to *adopt* a new identity without being asked, and its remedy is to name the plugin in an upgrade. Two remedies, two conditions.

**Asking for the new identity is what a pull already offers, and there are two ways to ask.** A full refresh re-resolves everything, and a targeted upgrade re-resolves the plugins it names; either is read as the new identity having been asked for, and the record is brought up to date. Any other pull holds the recorded identity and stops, which is the point of recording it — a record that took up whatever resolved next would follow the resolution instead of governing it. A first sighting is not a disagreement: an identity the record does not hold yet is simply filled in.

**The comparison also runs on a pull that only verifies**, which writes neither the record nor the lockfile. A verify that skipped the record while checking the lockfile beside it would report an agreement it never looked for.

Emitted message, naming the plugin, both identities, and both remedies:
> plugin `"<plugin-identity>"`: `<record-path>` records version `<recorded-version>` with digest `<recorded-digest>` as trusted for it, but this resolution reports version `<resolved-version>` with digest `<resolved-digest>`; review what changed and adopt it with `aggrega pull --upgrade --release <release> <plugin>`, or restore the recorded identity: the plugin identity recorded as trusted no longer matches what this resolution reports

**How to fix:** decide which of the two identities is the one you mean, because only you can. If the move is one you intend — the gate was republished and you have reviewed what changed — adopt it with the targeted upgrade the message spells out, which re-resolves that plugin and rewrites its entry. If you did not expect it, the recorded identity is the one that was reviewed: restore the version or the artifact the record names, and investigate why the reference now resolves elsewhere. Do not edit the record to clear this — it is a committed statement of what was reviewed, and an ordinary pull leaves it alone deliberately, because taking up a changed gate silently is exactly what this refusal exists to prevent.

### A Plugin entity's claims disagree with the plugin's own self-report

<!-- covers: internal/wasm.ErrWasmContractMismatch -->

A Plugin entity states what the plugin it points at offers: which exports it has, what each of them operates on and at what scope, and — for a plugin serving a provider — how it behaves when rendering. The plugin reports the same things about itself when it is loaded. This condition is what a disagreement between the two reports.

The comparison is per export, keyed by name, and it runs in one direction: **everything the entity claims must match, and the plugin may offer more.** An entity that describes part of the plugin's surface is not required to enumerate the rest, so an export the plugin declares and the entity omits is not a disagreement. What is a disagreement is a claimed export the plugin does not declare, or a claimed export whose operates or scope differs from what the plugin reports. The free-form selector is not compared.

Where the entity also authors a render-behaviour block, its fields are compared one by one — the input kinds, the assembly mode, the artifact-template delimiter pair, the assembly-name annotation, the reusable-instance claim, the cross-boundary-linking claim, the omit-entries claim and the nesting directory — and the first to disagree is the one named. An entity that authors no such block skips that comparison entirely.

**The same check runs at publish**, so a mismatch normally surfaces before the entity is published rather than when a build loads it.

Emitted messages. A claimed export the plugin does not have:
> entity `"<entity>"` claims export `"<export>"`, which the plugin's describe() does not declare: wasm: entity contract claim does not match plugin describe()

a field on a claimed export:
> entity `"<entity>"` export `"<export>"` declares operates `"<claimed>"` but the plugin's describe() reports `"<reported>"`: wasm: entity contract claim does not match plugin describe()

and a render-behaviour field, which reports in the same shape naming the field that disagreed:
> entity `"<entity>"` declares boundary_assembly `"<claimed>"` but the plugin's describe() reports `"<reported>"`: wasm: entity contract claim does not match plugin describe()

**How to fix:** this is the Plugin entity's claim to correct, not your Aggregate or Release. Bring the claim into line with what the plugin reports — the message names both values, so which way it has to move is visible in the message itself. Where the entity is one you publish, re-generating it from the binary is the reliable way to make the two agree; where you consume a published entity, select a version whose claim matches the binary it points at, and report the disagreement to whoever published it.

### A Plugin entity's recorded command set does not match the plugin

<!-- covers: internal/wasm.ErrWasmCommandsMirrorMismatch -->

A plugin that contributes terminal commands has those commands recorded in its Plugin entity. That record is machine-written rather than authored: it is read out of the plugin and written down, so it reflects the binary exactly. This condition is what a record that has stopped reflecting it reports — a difference in a command's name, in its short help text, or in the order the commands are declared in.

**The comparison is full equality, and that is deliberate.** The capability and export claims elsewhere on the entity are curated: an author may legitimately describe part of the surface and leave the rest out, so those are checked as a subset. The command record is not curated, so anything short of exact agreement means the record has drifted from what the plugin actually offers, and a command list that is close but not right is what would mis-route an invocation.

**A plugin loaded without an entity is not checked here.** The record lives on the entity, so bytes loaded directly carry none and the comparison has nothing to run against.

Emitted message, naming both sets and how to re-record them:
> wasm: plugin `"<plugin>"`: recorded command mirror `<recorded set>` does not match the plugin describe() commands `<reported set>`; re-run `aggrega plugin sync` and commit the result: wasm: recorded command mirror does not match plugin describe()

The same comparison at publish reports the sets without the re-record instruction:
> plugin `"<plugin>"`: recorded command mirror `<recorded set>` does not match the plugin describe() commands `<reported set>`: wasm: recorded command mirror does not match plugin describe()

**How to fix:** re-record the set from the binary and commit the result — the message names the command that does it. Do not hand-edit the record to match: it is machine-owned, and a hand-edit that happens to agree today is re-derived and overwritten the next time it is recorded. Where you consume a published entity rather than publishing it, the entity was published with a record its own binary does not support, and that is a question for its publisher.

### A Plugin entity's recorded version does not match the plugin

<!-- covers: internal/wasm.ErrWasmPluginVersionMismatch -->

A plugin reports the version its build recorded in it, and its Plugin entity records a version too; the two have to be the same string. The build recipes Aggrega's plugins are built with take that version from the tag that releases the plugin — the compiler's own tag for a plugin that ships with the compiler, a tag of the plugin's own for one that ships outside it — so a build of the commit the tag names reports the release version, and a build of any other commit reports a development version such as `1.0.0-3-g1a2b3c4`. This condition is what a pair that has come apart reports, and it is checked before any bytes are published so a divergent pair does not reach a catalog.

The comparison is an exact string match. A plugin built without a recorded build version reports an empty one, and that empty value is then what the entity's version has to equal — the check does not treat "no version reported" as "any version accepted", because the point of it is that a published entity's version always says what its binary actually reports.

Emitted message:
> plugin `"<plugin>"`: recorded metadata.version `"<recorded>"` does not match the plugin describe() version `"<reported>"`: wasm: entity metadata.version does not match plugin describe()

At publish the refusal also names the entity file, the `.wasm`, and the repair:
> Plugin `<plugin>`: metadata.version in `<entity-path>` does not match the .wasm describe() version at `<path>` — set metadata.version to the release you are publishing and build the plugin from a clean checkout of the commit that release's tag names, so it reports that version itself; for a new release, commit the entity with the source it releases and tag that commit first: plugin `"<plugin>"`: recorded metadata.version `"<recorded>"` does not match the plugin describe() version `"<reported>"`: wasm: entity metadata.version does not match plugin describe()

**How to fix:** make the entity's `metadata.version` the release you are publishing, and build the plugin from a clean checkout of the commit that release's tag names, so it reports that version itself. For a new release, commit the entity with the source it releases and tag that commit first — the tag has to name a commit that already carries the entity. Do not copy the version the plugin reports into the entity: a build of any other commit reports a development version, and copying it would publish that build under a version no release tag names. Where the plugin reports no version at all, it was built without its version recorded; build it with its version recorded.

### A plugin was built from a working tree with uncommitted changes

<!-- covers: internal/wasm.ErrPluginBuiltFromUncommittedChanges -->

A plugin's build records its version from the commit it was built from, and a build made from a working tree with uncommitted changes carries the `-dirty` mark at the end of that version — `1.0.0-dirty` at a tag, `1.0.0-3-g1a2b3c4-dirty` past one. Such a version is a valid semantic version, but it names a commit that does not hold the bytes that were built, so nobody can rebuild what would be published from the version it would be published under. Publishing a Plugin refuses a plugin whose own version carries the mark, before any bytes are published and before the registry is contacted; a dry run refuses it too.

Only the mark is refused. A development version built from a commit, such as `1.0.0-3-g1a2b3c4`, names a commit that does hold what was built, and publishes; so does a prerelease such as `1.0.0-rc.1`. Validating a plugin against its entity outside a publication does not raise this, since a build under development is routinely made from an edited tree.

The check reads the version the plugin reports about its own build, and it runs ahead of the comparison with the entity's `metadata.version` — so a plugin built with uncommitted changes under an entity recording the clean version is reported here, rather than as [a recorded version that does not match the plugin](#a-plugin-entitys-recorded-version-does-not-match-the-plugin).

Emitted message, naming the plugin, the version it reports, and the remedy:
> Plugin `<plugin>`: the .wasm at `<path>` was built from a working tree with uncommitted changes — set metadata.version in `<entity-path>` to the release you are publishing and build the plugin from a clean checkout of the commit that release's tag names, so it reports that version itself; for a new release, commit the entity with the source it releases and tag that commit first: plugin was built from a working tree with uncommitted changes, so no commit reproduces the version it reports (plugin `"<plugin>"`, describe() version `"<version>"`, which ends with `"-dirty"`)

**How to fix:** build the plugin from a clean checkout of the commit the release's tag names, so it reports the release version the entity records. To release the change itself, set the entity's `metadata.version` to the new release, commit the entity with the change, tag that commit, and build there. Committing the change and rebuilding alone does not clear the way to a release: the rebuilt plugin reports a development version, and copying that into the entity would publish the build under a version no release tag names.

### A Plugin entity's recorded host functions do not match the binary

<!-- covers: internal/wasm.ErrWasmHostFunctionsStampMismatch -->

A plugin declares which of the host's own calls it uses, and that set is recorded on its Plugin entity when the plugin is published — read out of the binary itself rather than authored. When the plugin is fetched, the set is derived again from the bytes whose content has just been verified, and compared to the record. A difference in either direction stops the fetch.

**This sits on top of the content pin rather than repeating it**, and it catches two things the pin alone does not: a binary published by something other than the ordinary publish path, which carries no record or one that does not describe its own bytes; and a fault in the recording step itself. The pin establishes that the bytes are the bytes that were pinned; this establishes that what was written down about them is true of them.

An entity carrying no record is compared against an empty set, which matches a plugin that uses none of the host's calls — the same benign agreement either way round, so an entity without a record is not refused for lacking one.

Emitted message, naming the plugin, both sets, and the artifact the bytes came from:
> plugin `"<plugin>"`: stamped spec.runtime.hostFunctions `<recorded set>` does not match `<derived set>` derived from the verified .wasm `<artifact>`: wasm: stamped host-function record does not match .wasm imports

The same comparison run while a plugin is being validated reports the two sets without the artifact:
> plugin `"<plugin>"`: recorded host-function record `<recorded set>` does not match the .wasm imports `<derived set>`: wasm: stamped host-function record does not match .wasm imports

**How to fix:** nothing in your entity files causes this and no authoring change clears it. Re-publish the plugin through the ordinary publish path, which derives the record from the binary and writes the two together. Where you consume a published plugin, the entity and the binary it points at were published out of step, so report the mismatch to whoever publishes it, quoting both sets from the message — and do not hand-edit the record to agree, since it is derived rather than authored and the next derivation discards the edit.

### The lockfile no longer matches what the release resolves to

<!-- covers: pkg/lockfile.ErrLockfileDrift -->

A release's lockfile pins every entity, library and plugin the release reaches, each with the version selected and a digest, and it records the release files themselves — the release and each release it extends — by the digest of their content. An entity's digest covers what a publication of it carries: its document and every file it names beside it, each by its path and its bytes. A library's and a plugin's cover their bytes. Resolving the release again produces the same set, and the two are compared. This condition is what a disagreement reports.

**Every disagreement is collected before any of them is reported**, across everything the lockfile pins, so one run tells you the whole picture rather than one entry at a time.

These shapes of disagreement are reported, and they are worth telling apart because the remedies differ:

- **A reference the lockfile does not pin.** The release now reaches something the lockfile has no entry for — a dependency added since the pull that wrote it. The entry names where the release asks for it, so a Recipe or FeatureRecipe the Manifest binds is reported with the mapping entry that binds it, and one the `name` tier binds names the instance or attachment it was chosen for.
- **A pinned reference whose pair moved.** The lockfile pins one version-and-digest pair and the resolution produced another. That is vendored content whose bytes changed, or something in the workspace that changed: an entity's or a library's document edited, a file an entity names — a chart under its source, a file it imports, the `entity.lock` beside it — edited, added or removed, or the `.wasm` beside a plugin's entity replaced. The entry names the entity rather than the file; a plain `aggrega pull --release <release>` names a file that moved under a Recipe's or FeatureRecipe's lock, as [An entity reads an input the lock beside it records no pin for](#an-entity-reads-an-input-the-lock-beside-it-records-no-pin-for) describes. A registry serving other bytes under a pinned version is not reported here: the pull that fetches them refuses them, as [Fetched or cached bytes do not match the digest committed for them](#fetched-or-cached-bytes-do-not-match-the-digest-committed-for-them) describes.
- **A pinned reference the release no longer reaches.** The lockfile still pins something nothing in the release depends on any more.
- **A release file edited since the pull.** The release, or a release it extends, no longer holds the bytes the lockfile recorded for it. Everything the release asks for — which source version to fetch, which components to place where — is resolved from what the file holds, so the recorded pins may no longer describe what it now asks for. It is reported here, before anything renders, rather than as whatever the render would have failed on: an edited source version would otherwise surface later as a fetch that finds no pin. A lockfile that records no release file at all reports the release as not recorded, and a release file the release no longer extends is reported as no longer read.
- **A source reference that moved at its remote.** A source written at a git `ref:` is recorded at the commit the ref resolved to. Each pull that is not an upgrade asks the remote where the ref points now, and so does `aggrega pull --verify` where the network can be reached; a ref that resolves to a different commit is reported here rather than adopted. Only those two report it: a build reads the recorded commit and does not ask.

The comparison is on content, so identical content reached by a different route does not drift: what has to differ for this to fire is the bytes. For a release file that includes a comment or a whitespace change, exactly as it does for the Aggregate and the Manifest the release names. For an entity it is the content of what it carries, so the same entity read from a catalog directory and fetched from a registry does not drift, and neither does a checkout whose files differ only in permission bits, the execute bit included, nor a publication whose archive was compressed differently.

Emitted message. The condition's own sentence opens it, and every collected disagreement follows, each naming its axis:
> lockfile: out of date; it no longer matches what its Release resolves to: entity `"<uri>"` not in lockfile (referenced from `<site>`)
> `<axis>` `"<uri>"` changed: lockfile=(`<version>`,`<digest>`) current=(`<version>`,`<digest>`)
> `<axis>` `"<uri>"` no longer used by the release
> release document `"<file>"` was edited after the lockfile was written: its content no longer matches the recorded digest (lockfile=`<digest>` current=`<digest>`), so the pins may no longer describe what it asks for; re-resolving the Release records the files it reads as they now stand

`<site>` is where the release asks for the reference, written as the path to the entry that names it — `manifest.spec.mappings.components.name.db-primary`, say — with up to three such places listed in sorted order and `...` after them where there are more. A reference whose resolution records no such place is reported without the parenthesis.

A pull reporting a moved source reference names the artifact as its author wrote it, with `chart=` and `module_subdir=` where the source names them:
> source-artifact kind=`<kind>` url=`<url>`: reference `"<ref>"` moved — the lockfile pins `<commit>`, and it now resolves to `<commit>`; adopt where it now points with `aggrega pull --upgrade --release <release>`

A build prints the remedy after the entries:
> run `aggrega pull --release <release>` to re-resolve the Release and rewrite its lockfile

**How to fix:** re-resolve the release and commit the rewritten lockfile. For everything a build reports, a plain `aggrega pull --release <release>` — the command the build prints — is the whole fix: it resolves the release as it now stands, rewrites the pins that moved and holds every other one, so nothing floats that you did not touch. Where what moved is a file under a Recipe's or FeatureRecipe's local source, that pull first halts naming `aggrega pin` for the entity, because recording the new pin beside it is the author's step; run it, or pass `--pin-sources` to the pull, and the pull clears the drift. The one entry a plain pull does not clear is a source reference that moved at its remote, because clearing it means adopting the commit the reference names now: `aggrega pull --upgrade --release <release>` does that, and the entry says so — where the Recipe's `entity.lock` records that source, the upgrade halts the same way until the new commit is pinned beside it. Read the entries before you do, because the third shape is the one worth pausing on: a reference the release no longer reaches is usually a dependency you removed on purpose, but where you did not remove it, something else changed that made it unreachable. A pair that moved on a reference you did not touch means the content at that version is not the content that was reviewed, which is a question for whoever supplies it rather than something to adopt without looking.

A pull runs this same comparison against the lockfile it is about to write and does not write one the comparison refuses, so a lockfile a pull has just written passes it for a build given the same inputs. **Where this condition comes back straight after a pull that completed, the two runs were given different inputs**: a catalog directory passed to one and not the other, or a workspace configuration edited between them. Run the pull and the build over the same ones.

### An artifact is not at the source the build was told to find it

<!-- covers: pkg/oci.ErrFetchNotFound -->

A catalog reference names an artifact and a version. This condition reports that nothing answers to that pair — either at the registry the reference resolves to, or in the local artifact cache the build reads from.

**A build reads the cache; it does not reach out on its own.** Acquisition is a separate step: the pull that resolves a release fetches what the release needs and writes it into the cache, and the build then reads what is there. So this condition reaches a build as a cache miss, and reaches a pull as a registry that has no such artifact. Where a build is configured to fill its lockfile as it starts, the acquisition it runs is that same pull.

Emitted messages. A registry with no such tag, and a fetch that resolved a manifest whose content blob is absent:
> oci: `"<reference>:<version>"`: oci: artifact not found at remote source

> oci: content for `"<reference>:<version>"`: oci: artifact not found at remote source

a cache read that found no entry, which is the shape a build meets:
> oci: cache miss for `<reference>@<version>`: oci: artifact not found at remote source

and the same for a cached artifact whose manifest is missing beside it:
> oci: manifest cache miss for `<reference>@<version>`: oci: artifact not found at remote source

**How to fix:** check the reference and the version first — a version that no longer exists and a name with a typo in it produce the same answer, and the message quotes both so they can be compared against the catalog. Where the reference is right, the artifact has not been acquired: run the pull for the release, which fetches what the release reaches and populates the cache. Where the workspace is offline, that pull has to run from somewhere with network access; an offline build reads only what is already cached, and this is what it says when the cache does not hold it.

### The registry will not serve an artifact without credentials it accepts

<!-- covers: pkg/oci.ErrFetchUnauthorized -->

The registry answered, and it declined: either no credentials were presented, or the ones presented were not accepted. It is distinct from a registry that could not be reached at all — here the conversation happened and the answer was no.

Four moments report it, all while artifacts are being acquired or published: resolving a reference, pulling its content, listing what versions a repository holds, and checking a credential at the moment it is stored.

Emitted messages, each naming what was being asked for and quoting what the registry said:
> oci: resolve `"<reference>:<version>"`: `<what the registry replied>`: oci: authentication required or failed

listing the versions of a repository, which names the status instead:
> oci: tags/list `"<repository>"`: status `<code>`: oci: authentication required or failed

and checking a credential as it is stored:
> oci: verify credential for `"<host>"`: `<what the registry replied>`: oci: authentication required or failed

Where the failure is surfaced by a step that supplies remediation, the line ends with the login to run against the host it derived:
> remediation: docker login `<host>` (or helm registry login `<host>` for Helm-specific OCI) before re-running aggrega pull --release `<release>`

**How to fix:** this is the operator's rather than the entity author's — nothing in an Aggregate, Component or Recipe causes it. Log in to the host the message names and run the acquisition again. Where you are already logged in, the credential in the store is not one that host accepts for that repository: log in again to refresh it, and check that the account has read access to the repository the reference resolves to, since a private repository answers exactly this way to an account that cannot see it. Where the reference resolves to a host you did not expect, the registry alias or the default registry in `.aggrega-config.yaml` is pointing somewhere else.

### The registry could not be reached

<!-- covers: pkg/oci.ErrFetchNetworkUnreachable -->

The conversation with the registry never happened: name resolution, the connection, or the secure handshake failed. It is the counterpart of a registry that answered and declined — nothing was established here either way, so the artifact's state at the far end is unknown rather than known to be missing.

It is also what a transport failure with no more specific cause reports while a Recipe's source is being acquired, so it is the general "the far end could not be reached" answer on that path rather than a claim about which layer failed.

Emitted message, naming the source being acquired and quoting the underlying transport failure, with the remediation the condition carries:
> sourceresolver: kind=`<kind>` url=`<url>` version=`<version>`: oci: network unreachable (cause: `<the transport failure>`); remediation: check network connectivity to `<host>`; corporate proxies typically need HTTPS_PROXY exported

**How to fix:** the fix is the operator's and it is outside your catalog. Check that the host in the message is reachable from where the command is running. Where the environment reaches the network through a proxy, the proxy has to be exported to the environment, which the remediation names — a proxy configured only for a browser or a package manager will not be picked up. Where the host is reachable by hand but not from here, the difference is usually credentials at a proxy or an interception certificate the handshake did not accept. Once the artifacts are cached, later builds read the cache and do not need the network at all.

### Fetched or cached bytes do not match the digest committed for them

<!-- covers: pkg/oci.ErrFetchIntegrity -->
<!-- covers: pkg/oci.ErrCachedManifestIntegrity -->

Every artifact carries a manifest that commits to the digest of its content, and the lockfile independently pins the digest of that manifest. Both commitments are checked by re-hashing the bytes in hand and comparing. This is what a comparison that fails reports, and it fires the same way on bytes just fetched and on bytes read back out of the cache.

**Two conditions, and which one fires says which layer disagreed.** One names content that does not match the digest its own manifest commits to. The other names a cached manifest that does not match the digest the lockfile pinned for it — the check that keeps a tampered manifest from becoming the authority a later content check trusts. The pin is what makes that second check meaningful: it comes from the lockfile rather than from re-deriving the manifest out of the cached bytes, so the two are genuinely independent.

**An entity is then held to its own row, over what the bytes carry.** Once a cached entity's bytes agree with their manifest, they are compared with the digest the lockfile records for the entity, which covers the files its publication carries — each by its path and its bytes — rather than the compressed bytes. So the same files published with a different compression still agree, while different files under the same version do not, and a disagreement reports under the content condition. A pull honouring a pin makes the same comparison over what a registry serves under the pinned version.

**None of these checks needs the network.** Each is a hash comparison over bytes already in hand, which is what lets a fully offline build still establish that what it is reading is what was pinned.

**Emitted messages.** Content against its manifest:
> oci: content digest `<computed>` != manifest layer `<committed>`: oci: content digest mismatch

a plugin entity, which a manifest commits to in a different position:
> oci: config digest `<computed>` != manifest config `<committed>`: oci: content digest mismatch

a cached manifest against the pinned digest:
> oci: cached manifest digest `<computed>` != pinned `<pinned>`: oci: cached manifest digest mismatch

a cached entity against its row, and a registry serving other content under a pinned version:
> catalog: cached `<uri>` content digest `<computed>` does not match lockfile pin `<pinned>`: oci: content digest mismatch

> oci: content digest mismatch: pinned entity `"<uri>"`: registry now serves digest `<computed>` for the pinned version, not the pinned digest `<pinned>`; run `aggrega pull --upgrade --release <release>` to update the pin

Both are framed by whatever was being read. A pinned entity that no source holds at its pin, the manifest's condition where the cache entry's manifest disagreed and the content's otherwise:
> pinned entity `<uri>`: no source holds the pinned bytes `<pinned>` (`<what each source it read held>`); with a registry reachable, `aggrega pull --release <release>` fetches the pinned version again: `<the message above>`

An archive entry naming a path that escapes the archive reports under the content condition too, since a bundle that tries it is not the bundle that was committed to:
> path traversal entry `"<name>"`: oci: content digest mismatch

Both carry the same remediation where the surfacing step supplies one:
> remediation: run aggrega pull --upgrade --release `<release>` to refresh the lockfile and cache

**How to fix:** nothing in your entity files causes this and no authoring change clears it. Refresh the cache and the lockfile together with `aggrega pull --upgrade --release <release>`, which re-fetches from the source and rewrites both. Where that clears it, the cached copy had been altered or truncated since it was written. Where the mismatch survives a refresh, the bytes the publisher serves genuinely differ from what was pinned — a re-published version, which is a question for whoever publishes it, and one worth asking before adopting the new digest rather than after.

### A manifest carries no layer of the expected kind, or more than one

<!-- covers: pkg/oci.ErrNoContentLayer -->
<!-- covers: pkg/oci.ErrAmbiguousContentLayer -->

An artifact's manifest lists its layers, and the one carrying the content is selected by its media type rather than by its position. That is what lets an artifact bundle more than one layer — a chart with a detached provenance layer beside it, say — and still have the content picked out reliably.

Two shapes leave nothing to select. No layer of the expected type means the manifest describes something other than what the reference was read as. More than one means the choice has no answer, and picking the first would sometimes be right and sometimes silently wrong.

**Emitted messages**, each naming the media type that was expected. None:
> oci: manifest has no layer of media type `"<media-type>"`: oci: manifest has no layer of the expected content media type

and more than one, which also names how many:
> oci: manifest has `<count>` layers of media type `"<media-type>"`; expected exactly one: oci: manifest has multiple layers of the expected content media type

**How to fix:** the fix is the publisher's rather than yours — the manifest is not something a catalog author writes. Check first that the reference points where you meant: a reference that resolves to a different artifact kind produces the first shape, because the manifest is a real manifest for something else. Where the reference is right, the artifact was published with a manifest that does not describe it as the kind it is claimed to be, so quote the media type from the message to whoever publishes it. Publishing through the ordinary publish path produces a manifest with exactly one content layer, so an artifact in either shape was assembled some other way.

### A published bundle holds no entity, or holds two

<!-- covers: pkg/oci.ErrBundleNoEntityDocument -->
<!-- covers: pkg/oci.ErrBundleAmbiguousEntityDocument -->

An entity that declares files beside its document — a Recipe's local chart or its lock, a Component's imported schema — publishes as a `.tar.gz` bundling the entity together with those files. Reading one back means finding the entity again among them — and the file it was authored in may be called anything, so what identifies it is the entity preamble it carries rather than its name. The document at the top of the bundle whose `kind:` is a publishable entity kind is the entity; a compose fragment, a chart template or a Kubernetes manifest beside it is not, and neither is an entity document further down inside a `source/` tree, which is content the entity ships rather than the entity itself.

Two shapes leave nothing to select, and both are properties of how the artifact was published.

**No entity document at the top of the bundle.** The bundle was packed without the entity at its top — its document left out, or placed in a subdirectory rather than beside the files it carries. The message lists what the top of the bundle does carry, which is usually enough to see which happened.

**Two entity documents at the top of the bundle.** The bundle was packed from a whole directory in which two entities were authored — which `aggrega push` never does, since each entity carries only the files it declares, but which another client can. Packed that way, each of their published coordinates carries the *same* bytes — so answering with either one would hand back the other entity under the name that was asked for, with nothing downstream able to notice. There is no safe choice to make, so none is made.

**Emitted messages**, listing what was found. None, where the bundle carries other files:
> bundle root carries no entity document among `<file>, <file>`: oci: published bundle carries no entity document

none, where it carries nothing at all:
> bundle root carries no files at all: oci: published bundle carries no entity document

and more than one, which names both the count and the colliding documents:
> bundle root carries `<count>` entity documents (`<file>, <file>`): oci: published bundle carries more than one entity document

**How to fix:** both are the publisher's to clear rather than yours, and the fix is in the version directory the entity was published from. Give each entity a version directory of its own, so that directory holds one entity and the files that belong to it — the layout every published entity already follows, where the directory is named for the entity's `metadata.version` and sits under the entity's own name. Then publish again at a new version: published bytes are frozen, so re-publishing over the existing version is refused rather than corrected. If you are consuming rather than publishing, quote the message to whoever publishes the artifact; the file names in it identify the directory to split.

### A published artifact cannot be read as an entity

<!-- covers: pkg/oci.ErrBundleUnreadable -->
<!-- covers: pkg/oci.ErrPublishedArtifactNotAnEntity -->

Reading an entity from the coordinate it is published at starts from the bytes the registry serves there — `aggrega inspect oci://…` reads them for you to look at, and a dependency pull reads an archive's the same way to find the version it pins. Two shapes of those bytes hold no entity to read.

**An archive that does not unpack.** An entity published with the files it declares publishes as a `.tar.gz`, and the bytes begin as one, but the compression stream or the archive inside it is not well formed — most often because it was cut short. The bytes still match the digest the artifact's own manifest records for them, so they are exactly what was published: the damage happened before or during publication rather than on the way to you.

**A document that is not an entity.** The coordinate carries a single document, and it does not parse, declares no `kind:`, or declares a kind that is never published, such as a Release or a Manifest. The reference then names something published beside the catalog rather than an entity — a data artifact published with `aggrega push-artifact`, for example.

**Emitted messages.** An archive whose compression stream is not well formed, with the error that stopped it:
> oci: unbundle gzip: `<archive error>`: oci: published bundle cannot be unpacked

one that stops partway through a file:
> read `<file>` from the published bundle: `<archive error>`: oci: published bundle cannot be unpacked

a document declaring a kind that is never published:
> the published document declares kind `<kind>`, which a registry does not publish: oci: published artifact is not an entity document

and bytes that are not a document at all:
> the published bytes do not parse as a document (`<parse error>`): oci: published artifact is not an entity document

**How to fix:** an archive that does not unpack is the publisher's to replace. Published bytes are frozen, so the remedy is to publish the entity again at a new version; if you are consuming it, quote the message to whoever publishes it. A document that is not an entity almost always means the reference is not the one you meant: check that it names the coordinate an entity is published at, which is the reference `aggrega push` prints when it publishes one.

### The registry could not answer what is attached to an artifact

<!-- covers: pkg/oci.ErrReferrerDiscoveryUnavailable -->

Signatures and other attachments hang off an artifact rather than sitting inside it, and finding them is a question put to the registry. This condition says the question went **unanswered** — the registry does not serve that lookup, the artifact the attachments hang off could not be located, or the request itself failed.

**That is not the same as an answer of "nothing is attached", and conflating the two is exactly what this exists to prevent.** An artifact that genuinely carries no signature resolves normally and yields an empty list. This says the list was never obtained, so nothing at all is known about what is attached.

**Whether it halts depends on whether a signature is required**, and both directions are deliberate:

- **A signature is required.** The build stops. A required check that could not run has not passed, and admitting the artifact would rest on a question nobody managed to put.
- **No signature is required.** The build carries on and says so out loud, rather than silently. The lookup produced nothing to verify either way, so refusing would reject an artifact on the strength of an unanswered question — but silence would read as a clean unsigned pull, which it is not.

**Emitted messages.** A registry that does not serve the lookup:
> oci: target does not support referrer discovery: `<target kind>`: oci: referrer discovery could not be completed

the artifact itself not locatable:
> oci: resolve subject `"<reference>"`: `<the underlying failure>`: oci: referrer discovery could not be completed

and the lookup failing:
> oci: list referrers of `"<reference>"`: `<the underlying failure>`: oci: referrer discovery could not be completed

Where no signature is required, the same text appears as a notice instead:
> signature verification could not run for `<uri>` (the registry could not answer the signature lookup and no signature is required; continuing): `<the message above>`

**How to fix:** the fix is the operator's and it lies with the registry rather than with your catalog. Where the registry does not serve attachment lookups at all, it cannot carry signatures, so either mirror the artifact to one that can or stop requiring signatures from that host in `.aggrega-config.yaml` — and note which of those you are choosing, because the second one means signatures from that host are no longer being checked. Where the lookup failed for a registry that does serve it, this is a transport or permission problem on the attachment endpoint specifically, and re-running once the registry is reachable is the whole remedy.

### An artifact that must be signed carries no signature

<!-- covers: pkg/signing.ErrNoSignatureFound -->

A signature is required for an artifact when either the workspace's own signing policy covers its kind or the registry it came from is configured to require one. This condition reports that the registry answered the attachment lookup, nothing was attached, and a signature was required.

**The two requirements are one stance read at two scopes.** The workspace-wide policy forces a signature on an in-scope kind even from a host whose own entry requires none, so a host that requires nothing does not exempt an artifact the workspace-wide policy covers.

**Where no signature is required, this is not a failure at all.** The artifact verifies if a signature is present and passes quietly if none is, which is what makes a host with no configured stance usable without ceremony.

An artifact whose kind could not be determined while a workspace-wide policy is active is treated as requiring a signature rather than as exempt, so an unclassifiable artifact cannot slip past a policy that is switched on.

Emitted message, framed by the reference it was checking:
> verifying the signature of `<uri>`: signing: no signature found for an artifact that requires one

**How to fix:** the fix is the operator's or the publisher's, not the entity author's. Where you expected the artifact to be signed, it was published without a signature — quote the reference to whoever publishes it, since only they can attach one. Where the artifact is not meant to be signed, the requirement is the thing to change: it comes either from the registry's entry in `.aggrega-config.yaml` or from the workspace-wide signing policy, and the message's reference tells you which host to look at. Turning a requirement off means artifacts from that host are no longer checked, so prefer narrowing the policy's scope to a kind over switching it off outright.

### A signature does not verify

<!-- covers: pkg/signing.ErrSignatureVerificationFailed -->

A signature was found and checked, and the check failed. It is the general negative outcome of that check, covering a certificate chain that does not root in the trust material, a signature with no transparency-log record where one is required, a signature over a different artifact than the one in hand, a bundle that has been altered, and a bundle checked against a pinned key that does not verify against it.

**It is deliberately distinct from a signature whose signer is not trusted.** That one is structurally sound and made by the wrong signer; this one did not check out at all. Keeping them apart is what lets you tell "the artifact is not what was signed" from "the artifact was signed by somebody you have not accepted".

**Which artifact a signature was made for is checked twice.** Once the signature's cryptographic check holds, the toolchain reads from the signature itself which artifact it was made for — the same reading every later build holds the recorded signature to, which is what lets a build refuse a signature copied from one artifact onto another without verifying anything — and refuses the signature where that reading does not name the artifact in hand, or where the signature is in a form the reading cannot tell the artifact from. Both forms a pull accepts are read: a signature made over the artifact itself, and a signed statement that names it. The reading follows the cryptographic check's own rules, so over a signature that check accepts the two agree; a refusal of this kind means they did not, and is worth reporting with the reference and the message rather than configuring around.

Where a registry's entry marks verification as advisory, the same text is reported as a notice and the run continues.

**Emitted messages.** From the check itself, quoting what the verifier reported:
> signing: signing: signature bundle does not verify: `<what the verifier reported>`

and, where the cryptographic check holds and the reading of which artifact the signature was made for does not agree:
> signing: signing: signature bundle does not verify: its cryptographic check holds, but it does not name `<manifest-digest>` as the artifact it was made for

> signing: signing: signature bundle does not verify: its cryptographic check holds, but it is in a form from which the artifact it was made for cannot be read

each framed by the reference being verified:
> verifying the signature of `<uri>`: `<the message above>`

and, where the registry's entry makes verification advisory, as a notice instead of a halt:
> signature verification failed for `<uri>` (advisory; continuing): `<the message above>`

**How to fix:** nothing in your entity files causes this and no authoring change clears it. Treat it as a statement about the artifact rather than about your configuration: the bytes in hand are not the bytes that were signed, or the signature is not one the configured trust material can check. Re-acquire the artifact first, since a truncated or altered cached copy fails exactly this way and a fresh fetch clears it. Where it survives a fresh fetch, quote the reference and the verifier's own words to whoever publishes the artifact. Do not reach for the advisory setting to get past it — that setting keeps the check running and stops it halting, which is a deliberate choice to accept unverified artifacts from that host rather than a way to fix one.

### A signature verifies but its signer is not one the registry trusts

<!-- covers: pkg/signing.ErrUntrustedIdentity -->

The signature checked out — the certificate chain roots in the trust material and the transparency record is there — and the identity in that certificate matches none of the identities configured as acceptable for the registry. The artifact was signed by a real signer that has not been accepted.

**Both halves of an identity are compared**, the subject and the issuer that vouched for it, and either can be the one that did not match. The message names both where they can be read off the certificate, because a signer presenting an expected subject under an issuer nobody accepted looks identical to a wrong subject unless both are shown.

Emitted messages. With both halves readable:
> signing: signing: signature identity is not trusted for this registry: `<what the verifier reported>`; signer presented issuer `"<issuer>"` with identity `"<subject>"`, but no trusted identity permits that issuer

and where they cannot be read, falling back to the verifier's own report:
> signing: signing: signature identity is not trusted for this registry: `<what the verifier reported>`

**How to fix:** this is the operator's decision, and it is a real one rather than a formality. Compare the issuer and identity in the message against the trusted identities configured for that registry in `.aggrega-config.yaml`. Where the signer is one you mean to accept, add it — an entry names an identity, or a pattern matching one, together with the issuer, and both have to be right. Where it is not, the artifact was signed by somebody you have not accepted, and adding the identity to make the build pass is the one response to avoid. Registries that advertise their own trust policy can have it pinned when the registry is added, which is the way to get the intended identities in without transcribing them.

### A keyless trust policy names no acceptable signer

<!-- covers: pkg/signing.ErrNoTrustedIdentities -->

Keyless verification decides whether to accept an artifact by matching the identity in its signing certificate against a set of identities configured as acceptable. An empty set is refused rather than treated as a policy at all: matching against nothing would either accept every signer or reject every one, and neither is what an operator who configured verification meant.

Emitted message, which is the condition's own sentence:
> signing: keyless verification requires at least one trusted identity

**How to fix:** configure at least one trusted identity for the registry in `.aggrega-config.yaml`. An entry names the identity — as an exact subject or a pattern matching one — together with the issuer that vouches for it, and both are required. Where the registry advertises its own trust policy, pinning that policy when the registry is added fills the set from what the registry publishes. Where you do not intend to verify signatures from this registry at all, that is a different setting from an empty identity set, and setting it explicitly is what says so.

### The pinned trust root cannot be read

<!-- covers: pkg/signing.ErrTrustRootLoad -->

A trust root pinned in the workspace is what lets a keyless check verify without network access wherever it runs: a file whose contents are the material every signature is checked against. This condition reports that the file at the configured path could not be turned into usable trust material — it is absent, it is not readable, or its contents are not a trust root.

**It halts rather than falling back.** A pinned root is a deliberate choice to check signatures against material you control, so quietly fetching one instead would replace that choice with a different one and produce a verification result nobody asked for.

Emitted message, naming the path and quoting what the read reported:
> signing: cannot load pinned trust root: `<path>`: `<what the read reported>`

**How to fix:** this is the operator's. Check that the path configured for the trust root exists and is readable by whoever runs the command — a path relative to a different working directory, and a file present but unreadable, both report here. Where the file exists and is readable, its contents are not a trust root, so replace it with a current bundle from the source you obtained it from rather than editing it. Where a pinned root was not intended, the configuration is what to change: unset the pin and the verification uses the material it would otherwise be given.

### A pinned verification key is not the key profile the verifier accepts

<!-- covers: pkg/signing.ErrUnsupportedKey -->

Signing and verifying against a held key use one key profile, and a key of any other kind is refused rather than attempted. It is a statement about the key's type, not about whether it verifies anything.

**The two moments it reports at are different jobs.** One is loading a key to sign with, which happens where an artifact is published; the other is checking a signature against a key pinned for a registry, which happens where an artifact is verified. The refusal is the same in both.

**Emitted messages**, each naming the type of key that was actually supplied. A pinned verification key:
> signing: signing: unsupported held-key type: pinned key is `<the type supplied>`, want ECDSA P-256

and a key loaded to sign with:
> signing: signing: unsupported held-key type: held key is `<the type supplied>`, want ECDSA P-256

**How to fix:** supply a key of the profile the message names. Where you are verifying, the key is the one pinned for the registry in `.aggrega-config.yaml` and it has to be the public half of the key the publisher signs with — a mismatch here usually means the wrong file was pinned, since a key that is the right type but the wrong key reports as a signature that does not verify instead. Where you are signing, generate a key of the named profile, or use the keyless path, which needs no held key at all.

### The workspace is offline and the step needs the network

<!-- covers: pkg/egress.ErrOfflineEgress -->

A workspace can be marked offline, and that setting is a refusal rather than a preference: every step that would reach the network is refused where it is constructed, before anything is dialled. Refusing early is what makes the failure say "this workspace is offline" instead of surfacing later as a timeout with no explanation.

**One decision, read in one place.** A step that needs to know in advance whether the network could be reached asks the same question the fetch itself asks, so a check and the operation it guards cannot come to different conclusions.

It reaches several kinds of work, all of them the same refusal: acquiring an artifact from a registry, acquiring a Recipe's source over the network, fetching an external input, obtaining an identity to sign with, and fetching trust material. A build reading a populated cache reaches none of them, which is the point of the setting.

**Where the whole command is a network round trip, the refusal comes first rather than last.** `push`, `push-artifact` and `registry update` exist to reach a registry, so they say so before reading your entity or walking your repositories, and they name which of the three places set the posture — the flag you typed, the environment variable, or the file and the key inside it. A `--dry-run` is the exception, and it is an exception because of what it does rather than what it is called: it reports what it would publish and calls nothing, so it is the form of a publish that is offline-safe and it keeps working.

Emitted message, which carries its own remediation and is the condition's own sentence:
> egress: network access refused because the workspace is offline; remediation: pass `--offline=false` to allow the network for this one run, or clear the top-level `offline` key in the configuration file (or AGGREGA_OFFLINE) to allow it from now on; where the work is a build that needs content the machine does not have, run `aggrega pull --release <release>` from a connected environment first to populate the cache

Framed by whatever needed the network — acquiring a Recipe's source, for one:
> sourceresolver: kind=`<kind>` url=`<url>` version=`<version>`: `<the message above>`

Adding the official hub in an offline workspace is not refused: the hub is added on its built-in baseline, and the notice says the hub was not asked for its trust policy because the workspace is offline.

**How to fix:** the message names three ways and which one applies is yours to decide. Where the posture is set and you want past it for this one command, pass `--offline=false`; that is what the flag is for, and it is the only answer available to somebody who did not write the configuration file themselves. Where the workspace is meant to be offline, the missing content is what to fix: run the pull from somewhere with network access so the cache holds everything the release reaches, then the offline build needs nothing further. Where it is not meant to be offline at all, clear the setting at its source — the top-level `offline` key in `.aggrega-config.yaml`, or the environment variable the message names, and the variable is the one that catches people out because it is not in any file. Note that an offline workspace cannot sign with the keyless path at all, since issuing a certificate and recording it are network operations with no offline form.

## When building the topology

Once every Component has a resolved Recipe, the compiler stitches Components together into the IR graph by reading each Component's `uses:` block and cross-referencing targets and feature attachments.

### Dangling `uses` target

<!-- covers: internal/compiler/topology.ErrDanglingUsesTarget -->

A `uses:` edge names a target component that does not exist in the resolved topology. The halt is origin-agnostic — a developer-authored Aggregate edge and a Release-wired edge are caught alike. A dangling target is a fatal halt, not a silent drop: an edge to a non-existent target would otherwise vanish and leave the consumer's injected values silently empty at deploy time. It is the structural sibling of the uses-socket allowlist — the socket must be declared *and* the target must resolve to an existing component before an edge is type-checked.

Emitted message. The refusal comes first, then the target that answers to nothing and the socket the connection was wired into — then what to do about it:
> uses edge target does not exist (`"<target>"`, wired into socket `"<socket>"`). Point the target at a component the Aggregate declares, or declare a component under that name.

The finding is positioned at the authored entry it is about, in the document that entry was written in, so a connection a component's own `uses:` block drew, one an attachment projected, and one a Release wired each report at their own block. Every offending connection is reported as its own finding, so one build names them all rather than stopping at the first.

**How to fix:** declare the missing target component, or correct the target name in the `uses:` entry to match an existing component.

### Two connections of one component under one alias

<!-- covers: internal/compiler/topology.ErrDuplicateConnectionAlias -->

A component reads each of its connections by its alias — the key the connection was written under, or, for a connection written as a list entry, its target's own name. A Recipe template reads a component's connections keyed by alias alone, and an assertion reads them keyed by socket and then by alias, so two connections of one component under one alias would share one slot in at least one of those views: the later would take it, and the other would be absent from what the template or the assertion sees. So one alias names one connection of a component — whatever socket each is wired into, whatever drew it (the component's own `uses:` block, an attachment's `uses:` block at any scope, or a Release per-edge entry), and whatever its target. A pair halts the build once the graph is final, before any assertion runs and before anything renders.

The pair arises from authoring that is legal on each surface alone: a component's own entry and an attachment's on one socket and alias; a list naming one target twice (`models: [llama, llama]`); one alias written on two sockets (`models: { local: … }` beside `databases: { local: … }`); two attachments wiring one alias; or a Release entry drawing a connection on a socket the Aggregate left unbound, under an alias the Aggregate already used on another socket. Two neighbouring shapes never reach this halt: one key written twice in one block of keyed entries makes the document fail to load, and a Release entry at a socket and alias another block already drew configures that connection — or, naming a different target, halts as a retarget — rather than drawing a second one.

Emitted message. The refusal comes first, then the alias and the component, then this connection's socket, its target and where its entry was written, then the same for the connection already holding the alias — then what to do about it:
> connection alias is already used by another connection of the same component (`"<alias>"`, on component `"<component>"`, this connection wired into socket `"<socket>"`, with target `"<target>"`, written in `"<file>"`, at `"<key path>"`, the connection already holding the alias wired into socket `"<socket>"`, with target `"<target>"`, written in `"<file>"`, at `"<key path>"`). Give one of the two connections an alias of its own: a component reads each connection by its alias, whatever socket it is wired into. A list entry takes its target's name as its alias, so a target listed twice is listed once, or written as two keyed entries under two aliases.

Where both connections were written at one key path — a list naming one target twice — each is also named by its place in that list, `list entry "2"` beside `list entry "1"`, which is the only thing telling the two entries apart.

The finding is positioned at the later connection's own entry — the one drawn second, which is the one that would otherwise have taken the alias's slot — in the document that entry was written in. So a Release entry, or an attachment the Release writes, is filed as an operations fault, and an entry in the Aggregate as a developer fault. Every offending connection is reported as its own finding, so one build names them all.

Some shapes are named less exactly. An attachment name declared at more than one scope — on a component and on the subsystem holding it, say — draws a connection from each declaring block, and the build records both under the attachment's name alone. Both connections are then named at one of the declaring blocks — the component's own attachment block, wherever the name is declared there — and neither carries a list position. Inside an imported Aggregate the build records no place for a connection drawn by an attachment one of that Aggregate's own subsystems declares: the finding names such a connection by its socket and target only, and when it is the later of the two the finding is positioned at no entry. Where that attachment's name is also declared on the component, the two connections are named at the component's attachment block as two entries of one list. In every one of these shapes the pair is still refused.

**How to fix:** give one of the two connections an alias of its own. For a list naming one target twice, list the target once, or write the two connections as keyed entries under two aliases. For one alias on two sockets, rename one of the two keys. An attachment wiring a socket under an alias the component already uses takes a different key in its own `uses:` block.

### `uses:` socket not declared in the target's `usesSchema`

<!-- covers: pkg/resolver.ErrUnknownUsesSocket -->

A `uses:` block names a socket that the entity owning the surface does not declare in its `usesSchema`, on one of the two surfaces where only a declared socket may be named: a **Feature attachment's** `uses:`, where the socket must be declared on the attached Feature, and a **Release's** per-edge `uses:`, where it must be declared on the consuming Component. A Release may wire or configure edges only within sockets the Component's `usesSchema` already declares.

A **component's own** `uses:` block is deliberately not one of those surfaces, so this halt does not fire for it. A developer owns the application's topology and may name a socket the catalog did not declare; catalog silence about a socket means the connection was not anticipated, not that it is forbidden. Such a socket is legal and its edge is built — what it gives up is the selector and the per-edge contract a declared socket carries. A misspelled socket name there is therefore not a halt but an ad-hoc connection of its own, and is reported as a warning naming both spellings — see [warnings.md](warnings.md) "Uses-socket near-miss lint".

Emitted message:
> unknown uses socket: name a socket the entity declares in its usesSchema — only a component's own uses block may name one the catalog did not declare (socket `<socket-name>` not defined in component type `<component-type>` usesSchema (valid: `[<declared-sockets>]`))

The attachment arm names the feature type in place of the component type; an attached Feature that declares no `usesSchema` at all reports instead that `uses:` declarations are not allowed for it.

**How to fix:** on an attachment, correct the socket name to one the attached Feature declares, or declare that socket in the Feature's `usesSchema`. On a Release per-edge entry, correct the socket name to one the consuming Component declares — a Release cannot introduce a socket the Component does not declare, and moving the declaration into the catalog entity is the supported path. If the catalog entity declares no `usesSchema` at all, it accepts no `uses:` declarations on that surface — remove the block.

### A connection carries an attachment under a name its socket declares no slot for

<!-- covers: pkg/resolver.ErrConnectionAttachmentSlotUndeclared -->

A connection entry's `features:` block names an attachment that no slot of the connection's socket declares. The attachments a connection carries are a closed set: the socket the connection is wired through declares, in a `featuresSchema` on the consuming Component's `usesSchema` entry, every slot a connection on it may fill, and an attachment under any other name is refused when the build loads. A socket that declares no `featuresSchema` admits no attachment on its connections, and neither does a socket the Aggregate names without the Component declaring it — such a socket declares no slots.

The rule holds on both documents that write a connection's attachments: the Aggregate's connection entry under a component's `uses:`, and the Release's per-edge `uses:` entry. For a component a sub-aggregate contributes, the developer's names are checked once the sub-aggregate's own document has been read, and the finding names that document's file and the component's entry in it. The Release's names are checked once the composition is flattened, for every component the Release writes against, and the finding names the Release's own entry — inside the boundary it sits in, or under the routing entry that reaches a sub-aggregate's component. A Release entry on a socket the Component does not declare is reported by the undeclared-socket halt above, which lists the sockets that do exist, rather than by this one.

Emitted message. The refusal comes first, then the document and the entry, the attachment's name, the connection, the socket, the component and the slots the socket declares — then what to do about it:
> a connection carries an attachment under a name its socket declares no slot for (Aggregate `<aggregate-name>`, at `.spec.components.<component>.uses.<socket>.<alias>`, `"<attachment>"`, on the connection `"<alias>"`, through socket `"<socket>"`, of component `"<component>"`, the socket declaring the slots `"<slots>"`). Write the attachment under one of the slots the socket declares, or declare this slot in the socket's featuresSchema on the Component.

Where the name is within one edit of a slot the socket declares — a transposed, dropped, doubled or wrong character, the shape a typo takes — that slot is named straight after it, so the likely intended spelling is in the same sentence:
> a connection carries an attachment under a name its socket declares no slot for (Release `<release-name>`, at `.spec.boundaries.<boundary>.components.<component>.uses.<socket>.<alias>`, `"credentail"`, near the declared slot `"credential"`, on the connection `"<alias>"`, …)

No separate advisory is raised for such a name. On a component's own `features:` block a name one edit from a declared slot is legal and draws only the advisory under "An attachment name is one edit from a declared slot" below; on a connection the name is refused, and the refusal carries the pairing itself.

Where the socket declares no slots, the list is absent and the advice reads "The socket declares no slots, so no connection wired through it carries an attachment: remove the attachment, or declare the slot in the socket's featuresSchema on the Component." Where the Component does not declare the socket at all, it reads "The component's type does not declare this socket, so the socket declares no slots and no connection wired through it carries an attachment: remove the attachment, or declare the socket and its slot in the Component's usesSchema."

Every offending attachment is reported as its own finding, so one build names them all.

**How to fix:** write the attachment under a slot the socket declares; or, if the connection needs a slot the socket does not have, declare it in the socket's `featuresSchema` on the Component. On a socket the Component does not declare, declare the socket and its slot in the Component's `usesSchema`, or remove the attachment.

### Release retargets a developer-declared edge

<!-- covers: internal/compiler/topology.ErrReleaseEdgeRetarget -->

A Release per-edge `uses:` entry names a target that differs from the target the developer already wired for the same socket and alias. A Release may *configure* an edge the developer declared (set per-edge `infra`, naming the same target or omitting it) and may *wire* an edge into a declared-but-unbound socket, but it may not *retarget* an edge the developer declared — the developer owns the architecture they authored.

Both targets are compared **as they were written**, not as they resolve. A `target:` may name a sub-aggregate's published alias rather than a component id, and that alias resolves to the component the module publishes it for — so a Release entry repeating the very alias the developer wrote is a configuration and is accepted, exactly as repeating a plain component id is.

The edge keeps the target the developer gave it whether or not this halt fires, and the Release entry's `infra:` is not applied to it. A refused retarget is never half-applied.

Emitted message. The refusal comes first, then the target the developer declared, the target the Release named, and the socket — then what to do about it:
> release edge retargets a developer-declared edge (declared target `"<declared-target>"`, target the Release names `"<release-target>"`, wired into socket `"<socket>"`). Drop the target from the Release entry to configure the connection as it was declared, or change the target where the connection is declared.

The finding is positioned at the authored entry the connection was declared in, in the document that declared it. Each offending entry is reported as its own finding, so one build names them all rather than one per run.

**How to fix:** drop the differing `target` from the Release `uses:` entry to configure the existing edge (per-edge `infra` only), or, if the connection genuinely belongs to a different socket, wire it through a socket the developer left unbound. To change the target itself, change it in the Aggregate, where the topology is authored.

### Release per-edge configuration has no edge to apply to

<!-- covers: internal/compiler/topology.ErrUnboundReleaseEdgeConfig -->

A Release per-edge `uses:` entry sets `infra:`, attachments under `features:`, or both, but no edge exists at the consumer, socket and alias it names, once every edge in the build has been drawn.

The two things a Release entry can do are *wire* an edge and *configure* one, and which it does is decided by whether it names a `target:`. An entry with a target creates the edge it configures. An entry without one configures an edge that must already exist — declared by the developer in the Aggregate, or contributed by an attached Feature. So an entry that names no target and matches no existing edge applies to nothing: the `infra:` block and the attachments below it never reach any output. The build stops rather than accepting authoring that does nothing, because a successful build otherwise reads as confirmation that the infrastructure was applied and the connection carries what the entry put on it.

The alias is part of what an entry names, so an entry configuring an alias the developer never declared reaches no edge even when the socket is bound under a different alias. So does an entry naming a component the Aggregate does not declare.

Two neighbouring conditions are reported by their own halts rather than this one, because each has more to tell you. A socket the consuming Component's `usesSchema` does not declare is reported as an undeclared socket, which can list the sockets that do exist. A `target:` naming no component is reported as a dangling target. A component switched off by an `active:` toggle takes its edges with it by design, so an entry left behind on one is accepted rather than halted.

**Every offending entry is reported.** A Release with several entries that reach no edge halts with one of these per entry in a single build, in the order the document declares them, rather than reporting the first and leaving the rest to the next build.

Emitted message, where the entry names a component that exists. It carries the path to the entry itself, so the line to edit is named rather than the component holding it:
> release per-edge configuration has no edge to apply to (Release `<release-name>`, at `.spec.boundaries.<boundary>.components.<consumer>.uses.<socket>.<alias>`, `"<consumer>"`, on socket `"<socket>"`, under alias `"<alias>"`). Give the entry a target to wire the edge, or remove it: an entry with no target configures an edge that must already exist.

A Release that names its components at the top level rather than under boundaries carries the shape its author wrote — `.spec.components.<consumer>.uses.<socket>.<alias>` — and a component named inside an `aggregates:` routing entry is named through that entry, under the local name it carries there.

Where the entry names a component the Aggregate does not declare, the halt comes from earlier in the build and reads, naming what the entry sets — `infra`, `features`, or `infra and features`:
> release per-edge configuration has no edge to apply to: release edge `<consumer>`/`<socket>`/`<alias>` sets `<infra|features|infra and features>` on `<consumer>`, which is not a component in the topology

**How to fix:** add a `target:` to the entry, which wires the edge and applies the configuration to it; correct the alias to the one the Aggregate declared for that connection, so the entry configures the existing edge; correct the component name to one the Aggregate declares; or remove the entry if the configuration is no longer wanted.

### A Release attachment takes the name of a connection's attachment

<!-- covers: internal/compiler/topology.ErrConnectionAttachmentWrittenOffItsConnection -->

A Release writes an attachment under the name an attachment on one of a component's connections takes: the connection's alias, a dot, and the slot the attachment fills — `gpt.credential` for the attachment filling the `credential` slot on the connection `gpt`. A connection's attachment is written on its connection entry — the Aggregate's connection under the component's `uses:`, or the Release's per-edge `uses:` entry for the same connection — and becomes an attachment of the consuming component under that composed name. The Release writes attachments at two other scopes whose keys may carry a dot, so the composed name can be written there too:

- **A component entry's own `features:` block**, which attaches to that component.
- **A boundary's own `features:` block**, which attaches to every component placed in that boundary or in a boundary nested inside it — including the components of a sub-aggregate the boundary routes in without naming them. A key there halts when it equals the composed name on any component it reaches, whether or not it names a `type:`.

The build stops rather than folding either into the connection's attachment, because neither document would then show the whole of what the build does with it. A socket's slot is filled per connection, by the connection's own entry, and never by an attachment cascading onto it from a wider scope. A dotted key that no connection attachment of the components it reaches takes is an ordinary attachment name, and is not refused.

The check covers an attachment either document put on the connection, and a component a sub-aggregate contributes as well as one the Aggregate declares.

Emitted message, for a key on a component entry. The refusal comes first, then the Release and the component entry, the key the Release wrote, the component, the connection, the socket and the slot — then the connection entry to write it on:
> a Release attachment takes the name of an attachment one of a component's connections carries (Release `<release-name>`, at `.spec.components.<component>`, `"<alias>.<slot>"`, of component `"<component>"`, on the connection `"<alias>"`, through socket `"<socket>"`, in the slot `"<slot>"`). Write it on the connection entry, under `uses.<socket>.<alias>.features.<slot>`, and remove `"<alias>.<slot>"` from this entry's features: an attachment a connection carries is written on that connection and nowhere else.

Emitted message, for a key on a boundary. It names the boundary's attachment block and the component whose connection carries the attachment:
> a Release attachment takes the name of an attachment one of a component's connections carries (Release `<release-name>`, at `.spec.boundaries.<boundary>.features`, `"<alias>.<slot>"`, of component `"<component>"`, on the connection `"<alias>"`, through socket `"<socket>"`, in the slot `"<slot>"`). Write it on component `"<component>"`'s connection entry, under `uses.<socket>.<alias>.features.<slot>`, and remove `"<alias>.<slot>"` from this boundary's features: an attachment a connection carries is written on that connection and nowhere else.

A key on a boundary reaching several components whose connections carry the composed name is reported once for each of them, because each connection is a separate edit.

The finding is positioned at the block the key was written in — the component entry, or the boundary's `features:` — because the key itself carries a dot and a position cannot address such a key; the key is named in the message instead. In a Release that names boundaries a component entry reads `.spec.boundaries.<boundary>.components.<component>`, a component named inside an `aggregates:` routing entry is named through that entry, under the local name it carries there, and a nested boundary's block reads `.spec.boundaries.<outer>.boundaries.<inner>.features`.

**How to fix:** move the attachment onto the Release's entry for that connection — `uses.<socket>.<alias>.features.<slot>` under the component — writing only `infra:` there to size an attachment the Aggregate declares, or `type:` and `infra:` for one only the Release makes; then remove the dotted key from the component's or the boundary's `features:`. A boundary-wide key meant for several components' connections is written once on each of those connections.

### A Release connection attachment names no Feature type

<!-- covers: internal/compiler/topology.ErrReleaseConnectionAttachmentUntyped -->

A Release per-edge `uses:` entry puts an attachment on a connection, under a slot the Aggregate declares no attachment for on that connection, and names no `type:`. An attachment a Release writes on a connection is one of two things. It sizes an attachment the Aggregate already declares on the same connection, and names no type because the Aggregate's declaration names it; or it is an attachment only the Release makes, and then the Release entry is the only place its Feature type can come from. Without one, nothing can choose a FeatureRecipe for the attachment.

The check covers a component a sub-aggregate contributes as well as one the Aggregate declares. A component an `active:` toggle switched off takes its connections with it, so an entry left behind on one is not checked.

Emitted message. The refusal comes first, then the Release and the connection entry, the slot, the connection, the socket and the component — then what to do about it:
> a Release connection attachment names no Feature type, and the type is required for an attachment only the Release makes (Release `<release-name>`, at `.spec.components.<component>.uses.<socket>.<alias>`, `"<slot>"`, on the connection `"<alias>"`, through socket `"<socket>"`, of component `"<component>"`). Name the Feature this attachment attaches under its type, or declare the attachment on the Aggregate's connection entry and size it here.

Every offending attachment is reported as its own finding, so one build names them all.

**How to fix:** add a `type:` naming the Feature the attachment attaches; or, where the attachment is the developer's to declare, declare it on the Aggregate's connection entry with its `values:` and keep only `infra:` on the Release entry.

### Component identity cannot be stamped on what it emits

<!-- covers: internal/compiler/analyzer.ErrUnusableComponentIdentity -->

A component's identity is not only a key in your Aggregate — it is a **name inside the cluster**. Every resource a component emits is stamped with it, under `aggrega.ai/component-id` and `app.kubernetes.io/name`, and the workload synthesizers name what they emit after it. So the identity has to be a name the target will accept, and it has to be one that means what it says.

A name you wrote reaches its output exactly as you wrote it, which is what makes the name in your Aggregate the name you can look for in your cluster. That is worth having, and it is why an identity the target would refuse is reported here rather than quietly repaired into something you never wrote.

One character is the exception, and it is one you cannot write: the dot that joins a module's name to the name of a component inside it. It is reserved out of every name you author precisely so that join is unambiguous, and it is written out of the identity before it is stamped — `data-layer.main-db` is stamped as `data-layer-zdmain-db`. That costs no name anybody typed, and it is what lets a component an imported Aggregate contributes be stamped at all: a dot is not a character a Service name accepts, and inside a cluster address it separates a service from its namespace, so a dotted name handed to a consumer as a host would resolve to a different service rather than failing.

Two shapes are refused.

**An identity the stamping alphabet cannot carry.** The identity is written into the label value every emitted resource carries, and that alphabet admits letters, digits, `-`, `_` and `.`, and requires the value to begin and end with a letter or a digit. The authored-name rules are close to this but not the same — they allow a name to begin or end with `-` or `_` — so `_api` and `api-` are both names you can write and neither can be stamped.

**How long a name may be is not asked here.** That belongs to the target a component is deployed to, and different targets answer differently: this condition covers the shapes no target could carry. A name refused for its length is reported by [the target's own refusal](#the-target-will-not-accept-a-name-derived-from-an-authored-identity) instead, which carries that target's reason and the length it would accept.

**An identity that opens as a composed one does.** Resources a Feature emits cannot be stamped with a component name you wrote, so Aggrega composes an identity for them out of the parts you did write, behind a fixed opening that says where the Feature was attached. Where the Feature is attached to a **single component**, the identity is composed from that component and the key the Feature is attached under, and it opens with `cfr--`. Where it is attached to a whole **boundary**, no one component's name applies at all, so the identity is composed from the path of the boundary and the name the Feature is attached under, and it opens with `bfr--`. The opening is what tells a reader which of the two a resource came from, rather than from a component. **So `bfr--` and `cfr--` are both reserved at the start of a component identity.** A component named `bfr--api` or `cfr--api` would be stamped identically to a composed one, and nothing in the emitted output could tell the two apart. Only the full opening is reserved: a component named `bfr`, `cfr`, `bfr-api` or `bfrontend` is an ordinary name and builds.

The check reads the identity a component actually carries, which for a component contributed by an imported Aggregate is the qualified one — the module's name, a dot, and the component's own. So two names that are each acceptable on their own can still join into an identity that is not: a module named `bfr--x` and a component named `y` inside it join into `bfr--x.y`, which opens as a composed identity does. The halt names the joined identity while pointing at the key you wrote.

Emitted message, for an identity the target would refuse:
> component identity cannot be the name its emitted resources are stamped with: rename the component (Aggregate, at `<field-path>`, `"<identity>"`, which must `"<rule>"`)

and for one opening as a composed identity does, where `<opening>` is whichever of the reserved openings the name matched:
> component identity cannot be the name its emitted resources are stamped with: rename the component (Aggregate, at `<field-path>`, `"<identity>"`, which must not open with the reserved `"<opening>"`)

**How to fix:** rename the component, on every surface that names it — the Aggregate that declares it, and the Release that places and configures it. Give it a name that begins and ends with a letter or a digit and opens with neither `bfr--` nor `cfr--`. Renaming a component changes the name its resources carry in the cluster, so on an already-deployed application treat it as you would any other resource rename.

### The target will not accept a name derived from an authored identity

<!-- covers: internal/compiler/renderer.ErrComponentIdentityTargetRefuses -->

Every target derives its own names from a component's identity: a chart installer derives a release name, a container orchestrator derives service names. This halt is that target saying it cannot use one of them.

**Aggrega holds no target's naming rules.** It does not know how long a name may be, which characters a target admits, or what a target's grammar requires at the start of a name — and it deliberately does not, because those differ by target, by the kind of resource a name lands on, and sometimes by one service inside one provider. So before a name is settled the compiler asks the provider that will render the component, and this halt reports the provider's answer. That is why the message carries the target's own word for what refused (`release name`, `Service name`) and the target's own reason, rather than a rule written into the compiler.

**Why the name is refused rather than shortened.** A name you wrote is the deployed name of your workload: shortening it would rename every resource in every existing output, and it would do so on your behalf without your having asked. The person who can choose a different name is the person who wrote this one, so the halt points at the `spec.components` key you wrote and leaves the name alone. Names Aggrega itself composes — the identity of a Feature attached to a whole boundary, for instance — are shortened instead, because they are assembled from parts written across several documents and no single author can see the length they reach.

**Two answers a target can give, and they lead different places.** Where a shorter name would be accepted, the halt states the length that would work, so a new name is chosen once rather than twice. Where no length would help — a character the target's grammar refuses in the position it landed in — no length is stated, because shortening cannot reach it. The most common case of the second kind: a target whose names are lowercase-only escapes each character it does not admit, and every escape begins with a hyphen, so a name whose *first* character is escaped produces a name beginning with a hyphen. A target requiring a lowercase letter or a digit there refuses it however short the rest is. A target may also hold the start of a name to the stricter rule of the resources named after it: the helm target refuses a name beginning with a digit, reported as a `Service name`, because Helm accepts such a release name while the cluster refuses a Kubernetes Service named after it.

A third form appears only for a composed name: a target may state a length shorter than the shortest identity the compiler can compose from the parts it was given, since a composed identity reserves room for a discriminator. The halt says so and names the remedy — shorten the authored parts — rather than reporting the provider as faulty.

Emitted message, for an authored identity:
> the target will not accept a name derived from this component's authored identity: rename the component (component `"<identity>"`, written at `<field-path>`, which the target cannot use as a `<name-kind>`, `<the target's reason>`). choose a name of at most `<n>` characters that the target accepts

**How to fix:** rename the component to one the target accepts, on every surface that names it — the Aggregate that declares it, and the Release that places and configures it. Where the message states a length, stay within it. Where it does not, read the target's reason: it is usually a character the target does not admit, and most often an uppercase letter at the start of the name — or, under the helm target, a digit there. Prefer lowercase letters and digits with hyphens between words; [the naming chapter](../02-naming-conventions.md) explains what a name costs under each kind of target. Renaming a component changes the name its resources carry, so on an already-deployed application treat it as you would any other resource rename.

Where the identity is one the compiler composed rather than one you wrote, the same halt reports the composed value and asks you to shorten the parts it was built from — the name you attached a Feature under, and the boundary path you attached it to.

### A provider never accepted a name the compiler composed

<!-- covers: internal/compiler/renderer.ErrNameBoundNotConverging -->

This one reports a defect in a **plugin**, not in anything you wrote.

Settling a composed name is an exchange: the compiler proposes an identity, the provider either accepts it or says how short it would have to be, the compiler composes a shorter one, and the provider is asked again. A second refusal is normal and expected — shortening to a length can land a character where that target's grammar will not have it, and the provider saying so is how a compiler that knows no target's grammar and a provider that does reach agreement.

What is not normal is a provider that never accepts anything: one that states a length, is handed a name of that length, and refuses it again. The exchange is bounded, and on reaching the bound the build stops and names the provider rather than using a name the provider never agreed to. A name settled by giving up would be stamped on real resources with nothing in the output recording that no agreement was reached, and the consequence would surface at apply time rather than in the build that produced it.

Emitted message:
> provider guest never accepted a component identity the compiler composed for it (provider guest `"<provider>"`, refused `<n>` proposals, the last of them `"<identity>"`). report the defect to whoever maintains that provider plugin

**How to fix:** report it to whoever maintains the named provider plugin, quoting the last proposal from the message. There is no authoring change that works around it: the compiler already offered every length the provider asked for. If the provider is one you maintain, the check to make is that a name cut to a bound it states is a name it then accepts.

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
> cyclic extends chain (Component `<name>`, at `.spec.extends`, `<entity>` extends `<reference>`, which is already in the chain). Remove the extends on `<entity>`, or point it at an entity outside the chain

**How to fix:** open the entity the edge names — which along a chain of three or more is not the entity named at the head of the message — and remove or repoint its `extends:`.

### A component the composition holds is placed in no boundary

<!-- covers: internal/compiler/topology.ErrUnplacedComponent -->

A Release places a component in a boundary two ways, and either one counts. It names the component under a boundary's `components`, addressed by the id the component carries once the whole composition is flattened. Or it routes the module that contributes the component into a boundary under `aggregates`, which places every component that module contains at once.

A component reaching neither is rendered outside every boundary the Release declared. Its output directory, its sync wave, its annotations and its per-component `infra` then come from nowhere — and the build would otherwise succeed, emit the artifacts, and say nothing about the operator's configuration never having been applied to it. Two components separated by that line also render into different outputs and lose the ordering they have when placed together.

Two shapes deliberately do not meet it. A Release that declares top-level `components` rather than named boundaries places everything it names: normalising such a Release gives it a boundary of its own holding exactly those components. And a component whose whole module the Release placed nowhere is reported once against the module instead, under the entry below — one fault, one remedy, one key to edit — rather than once per component whose own declaration is correct.

Emitted message. The value at the end is the id the component carries once the composition is flattened, which for a component a module contributed is that module's name, a dot, and the component's own:
> component placed in no boundary: name it under a boundary's `components`, or place the sub-module that contributes it under `aggregates` (Release `<name>`, at `<authored key>`, `"<component-id>"`)

**How to fix:** name the component under a boundary's `components`, using exactly the id the message quotes — for a component a module contributed that is the prefixed id, not the name written inside the module's own file. Or, where the whole module belongs in one boundary, route it there under `aggregates` and let every component it holds be placed at once.

### A sub-module's components are placed in no boundary

<!-- covers: internal/compiler/topology.ErrUnplacedSubModule -->

The module-scale form of the rule above: a module the composition brought in has contributed components, and no boundary holds any of them. It is reported once for the module rather than once per component, because one module placed nowhere is one authoring fault with one remedy at one key — and reporting it per component would name components whose own declarations are perfectly correct.

The rule reads placement rather than spelling, so a module whose components are each named individually under a boundary's `components` is placed and passes: refusing it for want of a routing entry would reject an authoring form the language admits. A module placed only in part also passes — which of its components carry their own entries is the component rule's question, and any it left out are reported there, each at its own key.

A module that contributed no components does not meet it: there is nothing to place. Neither does one a false `active:` toggle removed, which was never composed at all.

Emitted message, positioned at the `aggregates` entry that declared the module, under the local name the importing document wrote:
> sub-module placed in no boundary: route it into a boundary under `aggregates`, or name its components there under `components` (Release `<name>`, at `<authored key>`, `"<module-path>"`)

**How to fix:** add an `aggregates` entry for the module under the boundary it belongs in, which places every component it contributes. Or, where its components belong in different boundaries, name each of them under the boundary it belongs to, using the prefixed ids they carry once flattened.

### A boundary names a component the composition does not hold

<!-- covers: internal/compiler/topology.ErrUnresolvedBoundaryComponent -->

The over-naming counterpart of the two rules above, and a separate question rather than a branch of either: those ask of a component whether anything placed it, this asks of an entry the Release wrote whether anything answers to it. Neither implies the other. A Release can name a component that does not exist while every component that does exist is properly placed, and it can leave a real component unplaced while every entry it wrote resolves.

The entry that names nothing configures nothing: its `directory`, `subDirectory`, `syncWave`, annotations and per-component `infra` are written for a component that is not there, so nothing renders under them and the build would otherwise succeed with the operator's configuration silently inert.

A boundary names a component two ways and both are checked. Under `components`, an entry addresses the component by the id it carries once the composition is flattened — so a component a module contributes is written with that module's prefix ahead of its own name. Inside an `aggregates` routing entry, an entry addresses the component by the local name it carries inside that module, which resolves to the same id. The message quotes the id the entry *addressed*, which on the routed axis is not the name the file spells: the file carries the local half and the module supplies the rest.

A subsystem contributes nothing to a component's id, so a component declared inside a subsystem is addressed by its bare name. An entry written as though the subsystem were part of the id addresses nothing and meets this.

A component switched off by a false `active:` toggle does not meet it. Switching a component off is an authoring act, and the Release that configures it is not expected to be rewritten in the same edit — refusing the entry would make the toggle unusable for as long as any Release named the component.

Emitted message:
> boundary names a component the composition does not hold: correct the name, or remove the entry (Release `<name>`, at `<authored key>`, `"<addressed id>"`)

**How to fix:** compare the id the message quotes against the components the composition actually holds. A missing module prefix and a subsystem name written into the id are the two common causes; drop the subsystem, add the module prefix, or correct the spelling. Where the entry is left over from a component that has since been removed or renamed, delete it.

### A `uses` edge targets a component an `active:` toggle removed

<!-- covers: internal/compiler/topology.ErrUsesPrunedComponent -->

The sibling of the dangling-target halt above, reported separately so the author is told *why* the target is missing. The target is not absent because it was never declared — it is declared, and it was deliberately removed from this build because its `active:` toggle resolved to false, taking its edges with it. A component that survived still depends on it, and letting the edge vanish would leave that consumer's injected values silently empty at deploy time.

Emitted message. The refusal comes first, then the target the toggle removed and the socket the connection was wired into — then what to do about it:
> uses edge target was pruned because its active toggle resolved to false (`"<target>"`, wired into socket `"<socket>"`). Keep the target's `active` toggle true, or drop the dependency on it.

The finding is positioned at the authored entry it is about, on the same paths the dangling-target halt above names, and every offending connection is reported rather than only the first.

**How to fix:** decide which of the two belongs in this environment. Switch the target back on — where its toggle reads a parameter, that means supplying the parameter for this Release. Or gate the consumer behind the same toggle, so the two leave together and no edge is left pointing at nothing. Or, where the consumer genuinely no longer needs it, remove the edge from the consumer's `uses:` block.

### An `active:` toggle does not resolve to true or false

<!-- covers: internal/compiler/topology.ErrInvalidActive -->

An `active:` toggle reaches the graph builder already resolved to a literal — a boolean written directly, or a parameter reference the Release's values were substituted into before the document was read. It is then read strictly: a literal that is not a boolean stops the build rather than defaulting to anything. The rule is the same for a component's toggle and for a module's.

**An empty literal is the case worth naming**, because it is what an unfulfilled parameter produces. A toggle reading `{{ .parameters.<key> }}` resolves to nothing while that parameter has no value, and reading nothing as "present" would deploy the very entity the author gated behind the parameter. Only a toggle nobody wrote defaults to present, and that is read from the toggle's absence rather than from its value — which is why writing `active:` with nothing after it is not the same as leaving the key out.

Emitted message:
> active toggle did not resolve to a boolean (node `"<node>"`, active resolved to `"<value>"`)

and, where it resolved to nothing at all, with the advice that names the usual cause:
> active toggle did not resolve to a boolean (node `"<node>"`, active resolved to `""`). a toggle reading a parameter resolves to nothing until that parameter is fulfilled

**How to fix:** write `true` or `false`. Where the toggle reads a parameter, supply that parameter in the Release, or give it a `default:` where it is declared in the Aggregate so every environment has an answer. To make an entity unconditionally present, remove the `active:` key rather than leaving it empty.

### A module a composition imports cannot be loaded, or imports itself

<!-- covers: internal/compiler/topology.ErrSubAggregateLoad -->

An Aggregate composes other Aggregates by naming them under `aggregates:`, and each is loaded and walked in turn so its components join the graph. Two things stop that walk here.

The module cannot be loaded at all — the reference resolves to nothing the catalog can hand back, or the document behind it cannot be read. The reason the loader gave is carried beneath the halt rather than folded into it, so what failed is reported in the loader's own words.

Or the module names a type already on the chain being walked. Expanding that would reproduce the chain that contains it, without end. It is reported at the point the reference closes the loop, naming both the type and where in the composition it sits.

Emitted message, for a circular reference:
> sub-aggregate load failed (circular sub-aggregate reference `"<module-type>"`, at `"<path in the composition>"`)

and for a load failure, where the halt reads as the sentence alone, positioned at the module's path, with the loader's own reason beneath it:
> sub-aggregate load failed

**How to fix:** for a load failure, read the reason beneath the halt — a name or a version the catalog cannot answer is the common case, and the correction goes in the `aggregates:` entry that names it. For a circular reference, break the loop: the path in the message is where the chain closes, and one of the modules along it has to stop importing the one that imports it. Where two modules genuinely need each other's components, the shared part belongs in a third module both import.

### Two instances flatten to one identifier

<!-- covers: internal/compiler/topology.ErrSubAggregateNameCollision -->

Composing an Aggregate flattens every component into a single set, and a component a module contributed carries that module's name, a dot, and its own name. The set refuses to hold two entries under one identifier: the second would replace the first, and one of the two components would disappear from the output with nothing said about it.

This halt is the one raised as a module's components are merged in, and the authoring surface does not offer the names that would produce it. Every component a module contributes carries that module's name ahead of its own; an instance name is written from letters, digits, `-` and `_`, so it cannot carry the dot the two are joined with, and two identifiers built from different module names cannot meet. Two modules imported under one name are one duplicate key, and the document is refused as it loads. So this backstops a composition assembled by something other than the ordinary authoring path, and meeting one is worth reporting rather than working around.

Two components of one Aggregate reaching one identifier is a **different halt**, and it is one twelve lines of ordinary YAML produce — see [Two subsystems declare a component under one name](#two-subsystems-declare-a-component-under-one-name) below.

Emitted message:
> flattened node ID collision: rename one of the colliding instances so their flattened IDs differ (id `"<identifier>"`, path `"<path in the composition>"`, collides with existing entry from `"<the other contributor>"`)

**How to fix:** rename one of the two instances the message names, in the document that declares it and in every Release entry that addresses it.

### Two subsystems declare a component under one name

<!-- covers: internal/compiler/topology.ErrSubsystemComponentIdentityCollision -->

Subsystems group the components of an Aggregate for the reader and for what cascades to them; they do not qualify the name a component answers to. A component declared under `subsystems.frontend` is addressed as `api`, not as `frontend.api`, and one a module contributed carries that module's name rather than the subsystem's. So two subsystems of one Aggregate may each declare a component called `api`, and the two then answer to the same identifier.

The document is well formed — the two are separate keys in separate blocks, which is exactly why nothing earlier refuses it — but only one component can carry an identifier. The build halts rather than keeping whichever was read last and rendering as though a single component had been declared.

The same name twice inside **one** subsystem is a different fault: those are two entries under one key, and the document is refused as it is read.

Emitted message:
> components in different subsystems take the same identity: rename one of them, since a subsystem contributes nothing to a component's identity (`"<identifier>"`, declared under subsystems `"<first>, <second>"`)

**How to fix:** rename one of the two components, in the document that declares it and in every Release entry that addresses it. Where the two are genuinely the same component wanted in two places, declare it once and depend on it from the other subsystem. Renaming the subsystem does not help: the subsystem is not part of the name.

### A re-published component alias points back at itself

<!-- covers: internal/compiler/topology.ErrReexportCycle -->

A module publishes part of itself by exporting components under aliases, and an Aggregate that imports it may re-publish one of those aliases under a name of its own. Resolving such an alias follows the chain of re-publications to the component it ultimately names, so that an edge pointing at the public name reaches a real component.

A chain that revisits an alias before reaching a component never lands. The walk stops rather than following it forever, and names the chain it walked so the link that closes the loop is visible.

Nothing you can write produces such a chain. The import tree is acyclic, and each link names something nested more deeply than the link before it, so a chain assembled from imports descends and ends. This therefore backstops an alias table assembled by something other than the ordinary authoring path rather than a shape an Aggregate can declare.

Emitted message:
> re-exported component alias forms a cycle (alias chain `<first> -> <second> -> <first>`)

**How to fix:** nothing in your files produces it, and there is no authoring change that clears it. Report it with the command you ran and the alias chain the message names, which is the detail that says where the loop closed.

### An application reached graph building without being normalised

<!-- covers: internal/compiler/topology.ErrUnnormalizedAggregate -->

An application written with components at its top level and one written with named subsystems become the same shape as they are read: the top-level components are folded into a subsystem the compiler supplies, and the top level is cleared. That fold is what lets everything downstream ask one question of one shape.

An application arriving at graph building with **both** populated was not produced by that reading. The two shapes are mutually exclusive where they are authored — a document declaring both is refused as it loads — and the fold is what makes them one shape afterwards, so nothing an author can write reaches this. It backstops an application assembled by something other than the ordinary load path, and meeting one is worth reporting rather than working around.

Its message opens:
> aggregate reached topology un-normalized (non-empty root components alongside a synthesized default subsystem)

and continues with the construction path the compiler expects, which is a note for whoever is debugging the build rather than an authoring instruction.

**How to fix:** nothing in your files produces it, and there is no authoring change that clears it. Report it with the command you ran.

### A label-transform plugin's patch reaches outside node labels

<!-- covers: internal/compiler/topology.ErrMutatorPatchRejected -->

A governance plugin attached in a label-transform role is handed a labels-only view of the graph — one entry per node, each carrying that node's labels and nothing else — and returns patches against it. The host applies them and then checks that what came back is still that same view: the same nodes, each carrying only labels, each label value a string.

Anything else is refused and the build stops. Adding or removing a node, or changing a node field other than its labels, is precisely the silent appearance of infrastructure nobody declared — so rather than absorb a change the role does not cover, the build says which confinement rule the patch broke. Labels are the whole of the role's surface, and an operator who attached the plugin declared that much and no more.

Emitted messages. The patch was rejected before it was applied:
> mutator patch rejected: patch `<n>` does not decode as a JSON Patch document: `<what the reader could not do>`
> mutator patch rejected: patch `<n>` does not apply to the node-label surface: `<what the patch engine refused>`

or the result of applying it was not the view the host handed over:
> mutator patch rejected: mutated node set changed size (a mutator may not add or remove nodes)
> mutator patch rejected: mutated node set introduced node `"<node>"` (a mutator may not add nodes)
> mutator patch rejected: node `"<node>"` gained a field outside `"labels"` (a mutator may only touch labels)
> mutator patch rejected: node `"<node>"` lost its `"labels"` field
> mutator patch rejected: node `"<node>"` carries a non-string label value after patching: `<what the reader found>`

**How to fix:** the fault is the plugin's rather than your documents'. Correct it so every operation it returns addresses an entry under some node's `labels`, and sets only string values — a numeric or boolean label value is the common one, since the surface accepts strings alone. Removing the attachment from `plugins.governance` is the immediate way to unblock a build while the plugin is corrected.

### Intentional omission: the topology is not required to be acyclic

Unlike tools that enforce a Directed Acyclic Graph on infrastructure dependencies, Aggrega allows cycles in the topology. Agent-to-agent architectures, callback patterns, and mutual-authentication pairs all produce cyclic edges, and the compiler accepts them. Ordering at deploy time is the renderer's concern (through per-boundary `syncWave` or equivalent), not the IR graph's.

## When checking inject contracts

The compiler walks every `inject:` block — both self-inject (a Component injecting into itself) and uses-inject (cross-Component wiring) — and validates the delivery contract against the target Component's `provides:` schema, the Feature's label partition, and the set of declared delivery keys. A `from:` key on a block the Aggregate's own component wrote is checked as soon as the catalog resolves, so it fails against the line you wrote; a `from:` key on a connection an attached Feature contributes is checked once every surface that can draw a connection has contributed, which is the earliest point at which such a connection exists to check.

### Inject `from` key is not in the target's `provides`

<!-- covers: pkg/resolver.ErrInvalidInjectKey -->

An `inject:` entry references a `from:` key that the target Component's `provides:` schema does not declare.

**The check applies wherever the connection was written.** A `uses:` connection reaches the built topology from more than one authoring surface — a Component's own `uses:` block, and the `uses:` block of a Feature attached to it, whether that attachment is written on the component, on a subsystem, on a Release boundary, or on a Release boundary's component entry — and the same misspelled key is refused on every one of them. The diagnostic points at the block whose author wrote it: an attachment's own `uses:` entry, at the site the attachment itself was declared, rather than at the consuming component's `uses:` block, which for a contributed connection holds nothing at all.

Where the reference resolves depends on where it lives. A Component-level self-inject `from:` resolves against that same Component's own `provides:`. A `from:` on a `uses:` connection resolves against the `provides:` of the component that connection points at — and where two surfaces write one socket and one alias, each connection resolves against the target it itself names, in the same build that refuses the pair for sharing an alias. A Component that declares no `provides:` rejects every `from:` reference aimed at it.

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
> missing required feature: attach a Feature of the required type to the component (`<required-type>`, required by component type `<component-type>`, under the requirement label `<label>`)

The three values are the Feature type the mandate demands — which the sentence above already names, so it stands bare — then the component type that declares the mandate and the label the mandate carries, each captioned so a reader can tell two entity references apart. A component demanding two different types reports two messages that differ, and two components declaring the mandate from different types are told which type made each demand. The report is positioned at the component's own key under `components:`, and a component written inside a subsystem is positioned under that subsystem's key first.

The name an attachment is written under does not matter here: the mandate asks whether an attachment of the named type is present at all. Binding a slot satisfies it, and so does an attachment under any other name.

**How to fix:** attach a Feature of the required type to the component in the Aggregate or the Release, or at a broader scope the component inherits from. If the Component should no longer require it, remove the mandate annotation from its catalog declaration.

### Malformed attachment requirement

<!-- covers: internal/compiler/analyzer.ErrMalformedAttachmentRequirement -->

A presence mandate's declaration cannot be evaluated. An annotation value is an opaque string, so nothing validates its shape before the compiler reads it: a value that is not a Feature type URI, or a key that names the mandate family without a label after the prefix, is reported as a broken declaration rather than as an unsatisfied requirement — a typo must never read as a satisfied requirement.

Emitted messages:
> malformed attachment requirement (`<key>`, declared by component type `<component-type>`, which cannot be evaluated because the value must be a Feature type URI of the form `<publisher>/<name>` in lower-case kebab segments, as in `core/prometheus-exporter`). Correct that annotation on the component type's catalog entity.
>
> malformed attachment requirement (`<key>`, declared by component type `<component-type>`, which cannot be evaluated because the key needs a label naming the requirement, as in `features.aggrega.ai/requiredType.database`). Correct that annotation on the component type's catalog entity.

The message leads with the annotation key — the declaration the halt is about — and names the component type whose declaration is broken after it, so it names the entity to correct even though the report is positioned at the component instance that uses that type: the instance is where you see it, and the catalog entity is where the remedy is.

This halt is raised as soon as the composition is assembled, which is earlier than every check that reads the finished graph. A build carrying a broken mandate therefore reports it on its own: the checks that would run later are not reached, because they reason about what the declaration says and the declaration cannot be read. Correct it and rebuild to see the rest.

**How to fix:** correct the Component catalog entity. The remediation is in the catalog, not in the Aggregate — which is why this halt is distinct from "Required feature not attached", where your own documents are what need changing.

### Required attachment slot not bound

<!-- covers: internal/compiler/analyzer.ErrRequiredSlotUnfilled -->

A catalog entity declares an attachment slot with `required: true` in its `featuresSchema`, and nothing binds that slot's name on an instance of the entity. The check runs against the attachments the instance ends up with after every scope has folded — the Aggregate's component-level and subsystem-level `features:` blocks, the Release's boundary-level and component-level blocks, and attachments produced by annotation-driven expansion — so a credential attached once at a scope the instance inherits from binds the slot exactly as a fill authored on the instance does.

Emitted message:
> required attachment slot unfilled (`<slot>`, declared required by component type `<component-type>`). Attach a Feature at that name, in the Aggregate or in the Release, on the component or at a scope above it.

The two values are the slot's own name and the component type that declares it, so one instance leaving two slots unbound reports two messages that differ. The report is positioned at the slot's key under the component's `features:` block in the Aggregate; because that key is exactly what is missing, an editor places it on the nearest key that does exist — the `features:` block where the component writes one, and the component itself where it does not. Nothing wrote the missing attachment, so no document's author is singled out by it: the report stays at the component and is filed as a developer fault, and the remedy names both documents, because either one may fill the slot — the Aggregate on the component or a subsystem holding it, the Release on its entry for the component or on a boundary holding it.

**A slot a socket declares** — in the `featuresSchema` of a `usesSchema` entry — is required of each connection wired through the socket rather than of the component: every connection fills it for itself, on its own entry in the Aggregate or in the Release, and no scope above reaches it. So a socket with two connections, one of which fills the slot, reports the other alone, naming it:
> required attachment slot unfilled (`"<slot>"`, declared required by socket `"<socket>"`, of component type `"<component-type>"`, left unfilled by the connection `"<alias>"`). Attach a Feature under that slot in this connection's features, on its entry in the Aggregate or in the Release.

That report is positioned at the connection's entry in the document that drew the connection — the Aggregate's `uses:` entry, or the Release's per-edge entry for a connection the Release wired. A connection an attached Feature draws is wired into a socket the Feature declares, not one of the component's, so the component's socket slots are not its to fill.

**How to fix:** attach a Feature under the slot's name, in the Aggregate or in the Release — on the component, or at a broader scope every consumer of the slot shares; for a socket's slot, on the connection the report names. An attachment under a different name does not bind the slot: a slot is a named binding point, so the name is the binding. If the slot should no longer be required, update the catalog entity's `featuresSchema` — the component's own, or the socket's — to drop the `required` declaration.

### Two Features declared to conflict reach one component

<!-- covers: internal/compiler/analyzer.ErrConflictingFeaturesReachOneComponent -->

A Feature's `interoperability.conflictsWith` names the Features it cannot be attached alongside, and one component ends up carrying the Feature and one it names. The check runs against the attachments the component ends up with after every scope has folded — the Aggregate's component-level and subsystem-level `features:` blocks, the Release's boundary-level blocks (every boundary the component sits inside, nested ones included) and component-level entries, and attachments produced by annotation-driven expansion. So a pair halts when both are written on the component, when one is on a boundary or subsystem holding it, or when one sits on an outer boundary and the other on a boundary nested inside it. Two Features attached to sibling boundaries that share no component never meet, and a boundary holding no component reaches nothing, so neither halts.

One declaration is enough: the halt fires when either Feature's list names the other. Names are compared with any version removed, on both sides, so an entry matches every version of the Feature it names. The compiler compares the names the Feature's author declared against the Features the component carries and reads nothing more into either.

Emitted message:
> a Feature reaches a component alongside a Feature it declares a conflict with (`"<feature>"`, attached in the Release on boundary `"<boundary-path>"`, conflicts with `"<other-feature>"`, attached in the Aggregate on component `"<component>"`, on component `"<component>"`). Attach only one of the two where they meet: remove one attachment, or move it to a scope that does not hold this component.

The first value is the Feature whose list names the other — the one the sentence above names — and every place it was attached follows it; then the Feature it conflicts with, and every place that one was attached; and last the component where they meet. Each place is spelled in the words of the document you would open to change it: `attached in the Aggregate on component`, `attached in the Aggregate on subsystem`, `attached in the Release on boundary` (a nested boundary's path joins its levels with `/`), `attached in the Release on the entry for component` followed by `in boundary`, or `attached by annotation-driven expansion of` the annotation, followed by `declared at` where it was written. An attachment written on a connection is spelled as that connection's entry, since that entry rather than the component's own block is where it is edited: `attached in the Aggregate on the connection` followed by `through socket` and `of component`, or `attached in the Release on the connection` followed by `through socket`, `of the entry for component` and `in boundary`. A Feature attached at two places lists both. The report is positioned at the component's own key under `components:`, and a pair meeting on several components reports once for each of them, in the order the Aggregate declares the components.

**How to fix:** attach only one of the two where they meet — remove one of the attachments, or move one to a scope that does not hold this component, such as a sibling boundary. Where the attachment came from annotation-driven expansion, the annotation is what to change, not the block it expanded onto. If the two Features may in fact be combined, the declaration is what is wrong: remove the other Feature from the `conflictsWith` list on the declaring Feature's catalog entity.

### Attachment does not conform to its declared slot shape

<!-- covers: pkg/resolver.ErrAttachmentSlotShape -->

An attachment binds a declared slot but does not match the shape that slot declares. The common case is delivery: a slot's `inject` allowlist names the mechanisms a fill may deliver its material through, and an empty allowlist is blackbox — the Recipe delivers the material internally and a fill may dictate no delivery at all. An attachment under a name no slot declares is a free attachment and carries no slot constraint.

Emitted message:
> attachment does not conform to its declared slot shape (Aggregate `<name>`, at `.spec.components.<component>.features.<attachment>.<key>`, attachment does not conform to the declared slot shape: this key is not part of the slot's declaration — remove it, or declare it on the slot in the entity's featuresSchema)

An attachment declared at a broader scope — subsystem-wide, cascading onto every component beneath it — is held to the same shape, and it is checked against the slot on each component it reaches. The same attachment can therefore be in shape for one component and out of shape for another, so this form names the component and the slot it failed against, and locates the attachment at the scope where it was declared rather than at a key inside its delivery block:

> attachment does not conform to its declared slot shape (Aggregate `<name>`, at `.spec.subsystems.<scope>.features["<attachment>"]`, this attachment is declared at a scope that reaches component `<component>`, whose attachment slot `<slot>` does not accept the delivery it carries: move the attachment down to the components that may receive it)

An attachment a connection carries never reaches this halt. Its shape is closed where it is written: on the Aggregate's connection entry it takes `type`, `description` and `values`, and on the Release's `type`, `description` and `infra`, so it can dictate no delivery at all — an `inject:` written there is refused when the document loads, naming the key — and the Workload entry that delivers it is held to the socket slot's `inject` allowlist instead. No scope reaches a socket's slot either, so the scope-wide form above has no counterpart on a connection.

**How to fix:** the two forms call for different edits, and the field path tells you which one you have. Where it names a key inside an attachment on a component, that key is the fault: remove it, or declare it on the slot in the entity's `featuresSchema` — adding the delivery mechanism to the slot's `inject` allowlist where the material is genuinely meant to reach the workload. Where it names an attachment at a scope, the attachment is well formed and its placement is the fault: move it down onto the components whose slot accepts the delivery, leaving outside its reach the components that reserve delivery to their Recipe.

### Duplicate delivery key across inject sources

<!-- covers: pkg/resolver.ErrInjectKeyCollision, internal/compiler/renderer.ErrSelfInjectKeyCollision -->

The same delivery key (for example, the same env var name) is claimed twice among the developer-authored inject sources for one component — at the Component level and under a `uses[]` entry, by two `uses[]` entries on the same component, or under two delivery mechanisms of the Component's own `inject:` block. Delivery cannot come from two places at once, so a key claimed twice is a contradiction rather than a question of which one wins.

The build reads this in four places, because they see different sets of authored sources and dependency connections and ask different questions of them, and each reports in its own form.

The first reads the connections you wrote in the Aggregate, and reports as your files are resolved. It names the delivery mechanism, the key, and then the socket and alias of the first connection in author order that also claims it:

> duplicate delivery key across inject sources (Aggregate `<name>`, at `.spec.components.<component>.inject.<mechanism>.<key>`, `"<mechanism>"`, `"<key>"`, `"<socket>"`, `"<alias>"`)

The second reads that same authored block and asks a different question of it: whether the component claims one key under two of its own delivery mechanisms, with no connection involved at all. It reports once per mechanism claiming the key, positioned at that mechanism's own entry, and names the mechanism the report is about, the key, and then every other mechanism claiming it, in author order:

> duplicate delivery key across inject sources (Aggregate `<name>`, at `.spec.components.<component>.inject.<mechanism>.<key>`, `"<mechanism>"`, `"<key>"`, `"<other-mechanism>"`)

Neither mechanism is the offender and both reports are yours to change: rename the key under one of them, or drop one of the two deliveries. Which mechanisms a component may use at all is a separate question, answered by its `spec.inject` allowlist — see "Self-inject mechanism not in the component's allowlist" below.

The third reads the connections the finished topology carries, which includes any a Feature attachment contributed on your behalf. It runs before anything renders, and it names the delivery key you wrote alongside the dependency socket that also delivers it:

> duplicate delivery key across self-inject and uses-inject (`"<key>"`, socket `"<socket>"`)

One authored key delivered through two dependency sockets reports once per socket, so a single build tells you about all of them rather than about whichever was reached first.

The fourth reads the same finished topology and asks a different question of it: whether two of a component's own dependency connections deliver one key between them, with the component itself claiming nothing. It reports once at each connection, positioned at that connection's own delivery entry, and names the entry's path followed by every socket delivering the key:

> duplicate delivery key across inject sources (`"inject.<mechanism>.<key>"`, `"<socket>"`, `"<socket>"`)

A socket named twice is what tells you the two connections sit on one socket under different aliases — there the position is the only thing separating them, so read the field path of each of the two reports rather than the socket names.

Neither connection is the offender and both are yours to change: rename one of the keys, or drop one of the two deliveries.

**Where the key is a path, the field path names the mechanism's block instead.** What a delivery key spells is the mechanism's own business, and a `file` mechanism delivers into a mount path — so such a key contains dots while a field path divides its own steps with them. A field path stops at the last step it can name without ambiguity rather than spelling one that would read as a walk through keys your document does not contain, so for a key like `/etc/app/config.yaml` it reads `.spec.components.<component>.inject.<mechanism>` and stops there. The message names the key either way, which is what keeps the report equally actionable — but where in the message to read it differs across the four forms above, so read the field path for the block and then take the key from whichever of the four you have: where the detail leads with the delivery mechanism, the key is the quoted value straight after it; where the detail leads with the key on its own, it is the first quoted value; and where the detail leads with the delivery entry's own path, the key is that path's last step.

**How to fix:** rename one of the conflicting keys, or drop the duplicate declaration. Note that a FeatureRecipe's `injectMapping` rewriting a key the component's own `inject:` block or one of its connections' `inject:` blocks delivered is intentional interception and is not flagged here or anywhere else.

A key claimed by a Feature attached to the component meets the same shared space from the third of its three authoring surfaces, and reports under "An attachment delivers a key another inject source already claimed" below; a key two attached Features deliver, where the later of the two delivers it through its FeatureRecipe's `injectMapping`, reports under "Two attached Features deliver one key, the later through its FeatureRecipe's injectMapping"; and a key a boundary Feature's environment override writes over another Feature's delivery reports under "A Feature attached to a boundary overrides a key another attached Feature delivered".

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

Emitted message. The refusal comes first, then the mechanisms the edge dictated, the socket, and the entity whose declaration was read — then what to do about it:
> uses-edge inject dictates a delivery mechanism the socket does not permit (`"<mechanism>"`, on socket `"<socket>"`, declared on the component type `"<component-type>"`). The socket declares no delivery allowlist, so it permits no dictation at all — the entity that declared it delivers the dependency's values itself. Remove the inject block from this connection and read the values from the connection's provides in the consuming Recipe, or declare the mechanisms the socket permits in its usesSchema entry.

The finding is positioned at the authored entry it is about, in the document that entry was written in: `.spec.components.<consumer>.uses.<socket>.<alias>` for an edge a component's own `uses:` block drew, and `.spec.components.<consumer>.features.<attachment>.uses.<socket>.<alias>` for one an attachment drew — rooted at the block that declared the attachment, which may be a subsystem's or a boundary's rather than the component's own. Where the socket was declared on the attached Feature, the message names the feature type in place of the component type. Each offending edge is reported as its own finding, so one build names them all.

**How to fix:** remove the `inject:` block from the edge and read the dependency's values from `.context.uses.<alias>.provides.<name>` in the consuming Recipe instead; or, if the connection is meant to be transparent, declare the delivery mechanisms the socket permits in its `usesSchema` entry's `inject:` allowlist.

A socket the declaring entity never declared at all is a different case and is not refused here: an ad-hoc socket carries no allowlist, so there is nothing for the edge to be outside of.

### `uses` edge dictates a delivery mechanism outside the socket's allowlist

<!-- covers: internal/compiler/ir.ErrUsesInjectForbidden -->

An `inject:` block on a `uses:` edge names a delivery mechanism the socket's `inject:` allowlist does not list. The allowlist is the declaring entity's statement of which delivery forms its entrypoint can actually read the dependency's values from, so a mechanism outside it would deliver values nothing consumes.

Every mechanism the block names is checked, and each one outside the allowlist is reported, so one build names them all rather than one per run.

Emitted message. The refusal comes first, then the refused mechanism, the socket, what that socket does permit, and the entity whose declaration was read:
> uses-edge inject dictates a delivery mechanism the socket does not permit (`"<mechanism>"`, on socket `"<socket>"`, which permits `"<mechanism-1>, <mechanism-2>"`, declared on the component type `"<component-type>"`). Dictate one of the mechanisms the socket permits, or widen that socket's inject allowlist in the declaring entity's usesSchema entry.

The finding is positioned at the authored entry it is about, on the same paths the refusal above names. Where the socket was declared on the attached Feature, the message names the feature type in place of the component type.

**How to fix:** switch to one of the allowlisted mechanisms, or, if the entity should support the mechanism you need, widen that socket's `inject:` allowlist in its catalog `usesSchema` entry.

### An `inject:` entry carries both a literal and a source key

<!-- covers: internal/compiler/ir.ErrInjectEntryAmbiguous -->

An `inject:` entry delivers one of two things: a literal, written under `value:`, or a key read from the component the connection points at, written under `from:`. An entry carrying both says two things at once and offers no rule for choosing between them, so it is refused rather than having one of the two quietly win.

The authoring schema admits exactly one of the pair, so a document read the ordinary way is refused before the graph is built at all. This is the check standing behind that one, over the structures the graph is assembled from, so a set of components that reached the builder by some other route is still refused rather than silently having one field picked.

Every offending entry in the build is reported at once, each named by where it sits: the block it is in, the delivery mechanism under it, and the entry's position in that mechanism's list. Entries reached through a connection are named through the socket and alias that connection was written under.

Emitted message, with the offending positions separated by semicolons:
> inject entry carries both `value:` and `from:`; schema requires exactly one: .spec.components["`<component>`"].inject.env[`<n>`]; .spec.components["`<component>`"].uses["`<socket>`"]["`<alias>`"].inject.file[`<n>`]

**How to fix:** open each position the message names and delete whichever of the two the entry does not need. Keep `from:` where the value should come from the component the connection points at — it names a key that component's `provides:` declares. Keep `value:` where the value is a literal this side supplies.

### The Feature filling an attachment slot does not satisfy the slot's selector

<!-- covers: internal/compiler/analyzer.ErrSlotSelectorUnsatisfied -->

A Component declares named binding points for the Features it expects, and a slot may declare a `selector:` constraining the labels of whatever fills it. An attachment binds a slot by carrying the slot's name; when one does, the labels of the Feature it names are matched against that constraint, and a fill that does not satisfy it stops the build. A slot declaring no constraint accepts any fill.

Whether a slot may be left unbound at all is a different question with a different remedy, reported by its own halt above: this one presupposes a fill and asks whether the fill is admissible, so an unbound slot is not its business.

Two outcomes report under this one condition, and the message tells them apart by what its last value says. A fill that did not satisfy the constraint names the Feature whose labels went unmatched. A constraint that could not be read at all names the reason instead — an expression the label matcher could not evaluate — which is a fault in the slot's own declaration rather than in what was attached to it.

Emitted message, where the fill's labels did not satisfy the constraint:
> attachment slot selector unsatisfied (`"<selector>"`, declared on slot `"<slot>"`, not satisfied by the labels of the Feature filling it, `"<feature-type>"`). Add the labels the slot's selector requires to the Feature's labels, or fill the slot with a Feature that already carries them.

and where the constraint itself could not be evaluated:
> attachment slot selector unsatisfied (`"<selector>"`, declared on slot `"<slot>"`, which could not be evaluated: `"<why it could not be evaluated>"`). Correct the selector on the slot's declaration in the component's catalog entity.

It is positioned at the fill's key in the document that wrote the fill, and filed under that document's author: the component's `features:` block in the Aggregate is a developer fault, and a fill only the Release makes — on its entry for the component, or on a boundary holding it — is an operator fault, reported at the Release's own path:

```text
[OPS_ERROR E0008] release.yaml at .spec.boundaries.main.components.app.features.identity
  attachment slot selector unsatisfied ("feature.aggrega.ai/kind!=secret", declared on slot "identity", not satisfied by the labels of the Feature filling it, "core/secret-value"). Add the labels the slot's selector requires to the Feature's labels, or fill the slot with a Feature that already carries them.
```

The same fill written on the component in the Aggregate reports `[DEVELOPER_ERROR E0008] aggregate.yaml at .spec.components.app.features.identity`.

**A slot a socket declares** — in the `featuresSchema` of a `usesSchema` entry — holds each connection's fill to its `selector:` the same way. The attachment a connection carries in the slot is matched against the constraint, and a fill it does not admit stops the build, naming the socket and the connection as well as the slot:
> attachment slot selector unsatisfied (`"<selector>"`, declared on slot `"<slot>"`, of socket `"<socket>"`, filled on the connection `"<alias>"`, not satisfied by the labels of the Feature filling it, `"<feature-type>"`). Add the labels the slot's selector requires to the Feature's labels, or fill the slot with a Feature that already carries them.

It is positioned at the attachment's key under that connection's `features:`, in the document that wrote the fill: the Aggregate's connection entry, or the Release's per-edge entry for a fill only the Release makes.

**How to fix:** for a fill that did not satisfy the constraint, attach a Feature whose labels do — the selector in the message says which labels are being asked for — or widen the slot's `selector:` in the Component that declares it. Where the message says the constraint could not be evaluated, the selector expression is the fault: correct it in the Component's slot declaration, or in the socket's.

### An attachment written under another name fits a slot its component leaves empty

<!-- covers: pkg/resolver.ErrMisnamedSlotFill -->

A Component's own attachment surface is open: an attachment under a name no slot declares is a free attachment, and legal. One shape on that surface halts, because it is the shape a fill meant for a slot takes when it is written under the wrong name. The build stops when all of these hold for one attachment:

- it is written on the component itself — on the component's own `features:` block in the Aggregate, or on the Release's entry for that one component;
- its name is not a slot the component's type declares;
- its Feature's labels satisfy the `selector:` of a slot the type declares;
- nothing binds that slot on the component once every scope has folded.

Left alone, such an attachment is a free attachment while the slot it was meant for stays empty — and an optional slot left empty builds green and delivers nothing. The rule holds for every Feature, not only for credentials.

Everything else on the surface stays free. An attachment whose Feature fits no declared slot builds; so does an extra attachment beside a slot something already binds, as long as no other slot it fits is left empty. An attachment the component inherits from a subsystem or a Release boundary is never judged, so the shared shape — one credential attached once at a scope several components sit in, with no component filling the slot — builds as it always has. A slot declaring no `selector:` says nothing about which Feature it is for, so no attachment is held to it this way. An attachment a connection carries is not judged here either: a socket's slots are a closed set, and any other name on a connection halts under "A connection carries an attachment under a name its socket declares no slot for".

Emitted message. The condition's sentence comes first, then the name the attachment was written under, the component, the Feature it attaches and the empty slot it fits — then what to do about it:
> attachment written under a name no slot declares fits a slot its component leaves empty (`"<attachment>"`, on component `"<component>"`, attaching the Feature `"<feature-type>"`, which fits the empty slot `"<slot>"`). Attach it as `"<slot>"` to fill the slot.

Where the Feature fits more than one empty slot, the message names each, in the order the component's type declares them, and leaves the choice to you:
> attachment written under a name no slot declares fits a slot its component leaves empty (`"<attachment>"`, on component `"<component>"`, attaching the Feature `"<feature-type>"`, which fits the empty slot `"<slot>"`, and the empty slot `"<another-slot>"`). Attach it under the name of the slot it is meant to fill.

It is positioned at the attachment's key in the document that wrote it, and filed under that document's author. An attachment on the component's own `features:` block in the Aggregate is reported at `.spec.components.<component>.features.<attachment>` as a developer fault; one only the Release wrote, on its entry for the component, is reported there — under the boundary that names the component, `.spec.boundaries.<boundary>.components.<component>.features.<attachment>` — as an operator fault:

```text
[OPS_ERROR E0328] release.yaml at .spec.boundaries.main.components.app.features.metrics
  attachment written under a name no slot declares fits a slot its component leaves empty ("metrics", on component "app", attaching the Feature "core/prometheus-exporter", which fits the empty slot "identity"). Attach it as "identity" to fill the slot.
```

The empty slot itself is a separate finding where it is required, reported at the component in the Aggregate under "Required attachment slot not bound".

**How this differs from the near-miss advisory.** The advisory under "An attachment name is one edit from a declared slot" is about how a name is spelled: a name one edit from a slot whose `selector:` the attachment's Feature does not satisfy, which builds and reports a warning. This halt is about what the Feature fits, whatever the name: the name may be anything, and the slot it fits must be left empty. Where a name is one edit from a slot and its Feature does fit that slot, no advisory is raised, and if the slot is left empty this halt is the one finding reported.

**How to fix:** attach it under the slot's name, so it fills the slot — the message names the slot, or every candidate when there are several. If it really is a separate attachment, fill the slot as well, since an extra attachment is free once every slot it fits is bound; or, where it is meant to reach several components, attach it at the subsystem or Release boundary they sit in. If the Feature should never fill that slot, narrow the slot's `selector:` in the Component that declares it.

### An attachment delivers a key another inject source already claimed

<!-- covers: internal/compiler/renderer.ErrAttachmentInjectKeyCollision -->

Three authoring surfaces deliver into one component's injection pipe through an `inject:` block: the component's own `inject:` block, the `inject:` blocks on the entries of its dependency block, and the block on each Feature attached to it. They share one keyed space per delivery mechanism, so a key two of them claim is ambiguous about which value arrives, and the build stops rather than let one surface silently displace another. An attached Feature can also deliver a second way, through its FeatureRecipe's `injectMapping`; that route meets the same space after every block has delivered, and it reports under "Two attached Features deliver one key, the later through its FeatureRecipe's injectMapping" below. A Feature attached to a Release boundary can deliver a third way, through an environment override its FeatureRecipe's rendering plugin computes, which meets the space last and reports under "A Feature attached to a boundary overrides a key another attached Feature delivered".

This condition is the attachment block's side of that space. It is reported when an attachment's own `inject:` block claims a key some earlier delivery already holds — the entry above under "Duplicate delivery key across inject sources" is the same rule read from the developer-authored side, and between them every block's claim is covered.

**Order is what decides who collided.** The first claim under a key is the one that holds it, and later claims are the ones reported — so an attachment whose key is taken is told so, while an attachment that claimed first is not told about a later one that displaced nothing. A claim that delivered nothing at all leaves the key free and takes part in none of this.

The finding is positioned at the attachment's own entry inside the component's block, which is the position to edit; the message names the key and the mechanism whose keyed space it is in. Each colliding key is reported on its own, so an attachment duplicating two keys tells you about both.

Emitted message:
> duplicate delivery key across attachment-inject and another inject source (`"<key>"`, mechanism `"<mechanism>"`)

**How to fix:** neither side is the offender and both are yours to change. Rename the key on whichever side you control — most often the component's own `inject:` entry, since the Feature's mapping is written in a catalog document — or drop one of the two deliveries. Where the attachment is genuinely meant to supply the value, remove the developer-authored claim rather than the attachment's. Note that a Feature's FeatureRecipe `injectMapping` writing a key is a different route and is not reported here: rewriting a key the component's own `inject:` block or one of its connections delivered is interception and is not reported at all, and writing a key another attached Feature delivered reports under the entry below.

### Two attached Features deliver one key, the later through its FeatureRecipe's injectMapping

<!-- covers: internal/compiler/renderer.ErrAttachmentInjectMappingKeyCollision -->

An attached Feature delivers into its component's injection pipe by two routes — a Feature attached to a Release boundary has a third, described in the entry after this one: the `inject:` block written on the attachment, and its FeatureRecipe's `injectMapping`, whose output names the delivery key — often from a value the attachment carries, such as a credential's chosen environment variable. When two attached Features arrive at one key under one delivery mechanism, and the later of the two arrives there through its mapping, the build stops. Left to run, the component would read whichever value happened to be written last, so one credential could be presented in place of another with nothing in the output saying so.

It covers every attached Feature, wherever it was attached: the component's own `features:` block, a subsystem, a Release boundary or component entry, an annotation's expansion, and a connection's `features:` entry. The earlier of the two deliveries may be the other Feature's mapping or its own `inject:` block — the build reports both pairings under this one condition.

**Order is what decides who collided.** Every `inject:` block delivers before any mapping renders, and the mappings render in one fixed order — the order inject mapping walks a component's attached Features, described in [the compilation pipeline](../../architecture/10-compilation-pipeline.md) — so the first delivery under a key is the one that holds it, and the later Feature is the one reported. Presence alone decides: values are not compared, so two Features delivering the same value under one key are still reported. A key a mapping's output does not carry at all is no delivery; a key it carries with an empty value is one, because the empty value replaces whatever stood there. One key under two different delivery mechanisms is two keys, not a collision.

**What is not reported.** A FeatureRecipe's `injectMapping` rewriting a key the component's own `inject:` block or one of its connections' `inject:` blocks delivered is interception — a routing Feature qualifying a host, a guard redirecting an upstream — and the mapping's value replaces that one entry. A Feature's mapping rewriting a key its own `inject:` block delivered is that Feature transforming its own delivery, and is not reported either.

The finding is positioned at the later Feature's own entry — inside the component's `features:` block, or, for a Feature a connection carries, at its entry under that connection in the document that wrote it, such as `.spec.components.<component>.uses.<socket>.<alias>.features.<slot>` in the Aggregate. The message names the key, the delivery mechanism, and both Features by the names they carry on the component; a Feature a connection carries is named by the connection's alias and the slot it fills, joined by a dot. Each colliding key is reported on its own.

Emitted message:
> duplicate delivery key across two attachments: an attachment's FeatureRecipe injectMapping writes a key another attachment already delivered (`"<key>"`, mechanism `"<mechanism>"`, attachment `"<attachment>"`, delivered first by attachment `"<other-attachment>"`)

**How to fix:** give one of the two Features a key of its own — for a credential Feature, that is usually the key its values name — or remove one of the two attachments. Where both are meant to supply one variable, decide which one the component should read and attach only that one.

### A Feature attached to a boundary overrides a key another attached Feature delivered

<!-- covers: internal/compiler/renderer.ErrBoundaryEnvOverrideKeyCollision -->

A Feature attached to a Release boundary, whose FeatureRecipe declares `executionScope: boundary`, renders once for the boundary — and its rendering plugin may also compute an environment override for components the boundary holds. The compose bridge, `core/compose-bridge`, is the one that ships: for each connection crossing a network seam inside the boundary, it rewrites the host variable the consumer's connection delivers so the consumer reaches its target through the gateway the bridge renders. The override is applied to the component's environment after every attached Feature's `injectMapping` has rendered. When it names a key a different attached Feature already delivered — through that Feature's `inject:` block, its FeatureRecipe's `injectMapping`, or another boundary Feature's override — the build stops, because applying it would silently replace that Feature's delivery.

**What is not reported.** An override of a key the component's own `inject:` block or one of its connections' `inject:` blocks delivered is interception, and the override's value replaces that one entry; that is exactly what the compose bridge does to the consumers it bridges. An override of a key the same Feature delivered through its own `injectMapping` is that Feature transforming its own delivery, and is not reported either.

**Order is what decides who collided.** Every `inject:` block delivers first, then every `injectMapping`, and the overrides last, in the order the Release declares its boundaries and the Features on each — so the first delivery under a key is the one that holds it, and the later Feature is the one reported. Presence alone decides: values are not compared. An override names environment variables only, so a key another Feature delivered under a different mechanism is a different key.

The finding is positioned at the boundary Feature's own entry in the Release, `.spec.boundaries.<boundary>.features.<attachment>` (with `.boundaries.<name>` repeated for each nested boundary), which is the one place it is written. The message names the key, the delivery mechanism, the boundary Feature, the component the override was computed for, and the Feature that delivered first by the name it carries on that component — a Feature a connection carries is named by the connection's alias and the slot it fills, joined by a dot. Each colliding key is reported on its own.

Emitted message:
> duplicate delivery key across two attachments: the environment override a boundary-scope attachment computes for a component writes a key another attachment already delivered (`"<key>"`, mechanism `"env"`, attachment `"<boundary-attachment>"`, on component `"<component>"`, delivered first by attachment `"<other-attachment>"`)

**How to fix:** give the other Feature a key of its own — for a credential Feature, that is usually the key its values name — or remove one of the two attachments. For the compose bridge, the keys it rewrites are the variables a consumer's connection fills from the target's host field, so a credential delivered under one of those names is the collision: deliver it under a different name.

### A component declares an inject mechanism the attached Feature maps nothing to

<!-- covers: internal/compiler/renderer.ErrUnmappedCustomMechanism -->

A Component's `spec.inject` allowlist may name delivery mechanisms beyond the standard ones — a mechanism the component's own plumbing understands, which anything delivering into it has to produce a value for. When a Feature is attached to such a component, the FeatureRecipe's `injectMapping` is what says which mechanism each value it produces is delivered under. A mechanism the component declared and the mapping produces no key for is a delivery that would silently never happen, so the build stops instead.

**A mapping that says nothing about mechanisms is not a mapping that says none.** A FeatureRecipe whose mapping renders as a flat dictionary of deliveries makes no claim about mechanisms at all — that is the ordinary spelling for a Feature producing environment-variable deliveries — and neither does an attachment binding a FeatureRecipe with no mapping to evaluate. Neither is reported here; this condition is only about a mapping that names mechanisms and omits one the component declared.

Each unmapped mechanism is its own finding, so a component declaring two that an attachment maps neither of tells you about both. The finding is positioned at the attachment's entry in your own file, and names the FeatureRecipe as well — because that is the document the mapping is written in, and it is somewhere else entirely.

Emitted message:
> custom inject mechanism has no matching key in injectMapping output; add the mechanism's key to the Recipe injectMapping (`"<mechanism>"`, recipe `"<featurerecipe>"`)

**How to fix:** the message names both halves. Add the mechanism's key to the FeatureRecipe's `injectMapping` so the Feature produces a value for it, or drop the mechanism from the Component's `spec.inject` allowlist where nothing is expected to deliver under it. Where the FeatureRecipe belongs to someone else's catalog, attaching a Feature whose mapping covers the mechanism is the third answer.

## When rendering output

After every contract is validated, the compiler evaluates Go templates on Component values, FeatureRecipe `injectMapping` blocks, and Recipe and FeatureRecipe sources, then hands the result to the renderer.

### `provides:` template references a non-self-contained root

<!-- covers: internal/compiler/renderer.ErrProvidesSelfContainment -->

A Recipe's `provides:` template references a root outside the self-contained set. The `provides` block is evaluated at provides evaluation, before the inject pipe is hydrated and before cross-node edges are walked, so it may reference only data belonging to its own node: `.context.instance_id`, `.context.rendered_name` where the node's provider reports one, `.values`, `.infra`, the node's resolved `.locals`, and static strings. The check is a positive allowlist, so any other root halts — `.context.inject` and `.context.uses` (cross-node), `.context.annotations.*`, `.context.labels`, `.context.metadata`, and `.metadata.*` (placement- or deployment-coupled data the provides surface does not expose), and `.attachment_name` (a base Recipe's provides pass resolves no attachment). Referencing one of these halts loudly rather than silently rendering an empty value.

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

The check reads the path a reference **resolves** to rather than its keystrokes, so an alias for the block is followed: a key reached through the dot a `with .locals` body rebinds, or through a variable bound to `.locals`, is checked on exactly the terms the direct spelling gets and halts the same way. Two spellings escape the check. One is a key reached through a call whose result the template text cannot name — `{{ index .locals "nope" }}` — because what such a call yields is decided when the template runs rather than by what is written. The other is a key read off a parenthesised block — `{{ (.locals).nope }}` or `{{ ($.locals).nope }}` — where the key hangs off the value the parentheses yield rather than off the block itself. An absent key read off a parenthesised block does not halt, and it renders the literal text `<no value>` rather than nothing at all. An absent key reached through `index` halts, but as "A template indexes a map with a key the map does not hold" below rather than as this check: `index` halts on any map key the map does not hold. `index` therefore remains the way to reach a key whose name is itself computed, and a computed name the block does not declare is still reported by its key.

### Template references a root the render context does not define

<!-- covers: internal/compiler/renderer.ErrTemplateUnknownRoot -->

A template references a top-level root — the first path segment after the leading dot — that its render context does not define: a misspelling such as `{{ .valeus.port }}`, or a root that does not exist on the surface being authored. The check is a positive allowlist over root *names*, and the admitted set is derived from the render context's own shape rather than kept as a separate list beside it, so the set the build refuses and the set the context actually delivers cannot drift apart. The diagnostic names the offending reference and lists the roots that context does define.

The halt fires identically whether the reference is bare or wrapped in a `default`, `if`, `with`, or `range` fallback, and the wrapped spelling is the one that matters most: a wrapper can supply a fallback for an absent *key* under a defined root, but never for an absent *root*, so without this halt the wrapped form would resolve quietly to an empty value and let the build finish successfully. An absent key under a defined root is untouched and still follows the `missingkey=zero` policy for value templates described in "Missing template key" below, so optional-key idioms such as `{{ .values.optional_field | default "fallback" }}` keep working exactly as before.

**The same halt covers a mistyped key one level down, under a pillar whose shape is declared.** Some pillars have a fixed set of keys the compiler defines: `.context`, `.metadata`, `.inject`, `.workload` and `.boundary` on the Recipe and FeatureRecipe render context, and `.manifest` on a path template. A reference to a key one of those pillars does not define — `{{ .context.nmae }}`, `{{ .metadata.typo }}`, `{{ .workload.containres }}`, `{{ .boundary.nmae }}` — halts exactly as a wrong root does, and the diagnostic lists the keys that pillar defines. Other pillars are **open**, because what they hold is keyed data rather than a set the compiler declares — among them `.values`, `.infra`, `.locals`, `.provides`, `.features` and `.steps` on the render context, and `.parameters` and `.parent_boundary` on a path template. An open pillar accepts any key. An absent key under an open pillar is not this halt — it follows the surface's missing-key policy described in "Missing template key" below, so `{{ .values.optional_field | default "fallback" }}` and every other optional-key idiom keep working unchanged.

Which pillars are declared and which are open is a property of the surface, not something a template can influence: the compiler reads it from the shape of the render context it is about to deliver. That is what lets the typo halt and the optional key render on the same template.

**A surface may also narrow a key its pillar otherwise defines, and such a report is not a misspelling.** Where a key carries an answer that is meaningless — or belongs to a different node — on one particular surface, that surface refuses the reference rather than resolving it to the wrong thing, and the diagnostic lists the keys it does define. Two cases to know, both `{{ .context.rendered_name }}`. On a **Feature attachment's own** templates, the key carries the host component's name as the host's own provider reports it, so it is refused on an attachment of a host whose provider reports no name — a host placing an artifact set alone, or one rendering through a provider that derives no such name — and admitted on every other host. `{{ .context.instance_id }}` is admitted on that surface and names the host component the attachment is resolving for, which is what the host's own resources are named after on such a host. In a Recipe's **`locals:`** entries, the key is refused whatever the node's provider reports: a local shares its context with the Recipe's `source:` template, and whether the node supplies source is one of the things the name depends on, so the name is not offered there. The diagnostic lists `.context.instance_id` as the one key `.context` defines there; read the rendered name in a `provides:` entry or an inline template instead. See [`../templates/rendered-resource-names.md`](../templates/rendered-resource-names.md) for what each of the two keys names and where each is readable.

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

### A template reads a rendered name the node's provider does not report

<!-- covers: internal/compiler/renderer.ErrRenderedNameUnavailable -->

A template reads `{{ .context.rendered_name }}` — the name the bound provider gives the output it renders for the node, from source the author supplied or from a workload it synthesizes — on a node whose provider reports no such name. The reference is well-formed and the key is one the render context defines; what is absent is an answer for this node.

The refusal exists because the alternative is worse than a halt. The name reaches a template as a plain string, so a node with none would render the reference away and emit an address one segment short — `.svc.cluster.local` where a hostname was meant — at exit zero, with nothing in the build to read. That artifact deploys, and what it names does not exist. Refusing before anything is evaluated reports the fault against the template the author wrote instead.

Whether a node's provider reports such a name is settled by the Recipe binding, ahead of every evaluation, so nothing here is guessed.

**Two reports, and which one you get depends on the node rather than on where you wrote the reference.** A node that supplies no source of its own, under a provider reporting no name for it, has its resources named after its identity, so there is a correct value and the report names it. A node that does supply source, under a provider that derives no name for it, has no substitute — and offering the identity there would send you to a value naming none of that node's resources, so the report says so instead.

Emitted message, where the node supplies no source of its own:
> template reads the name the target gives the resources it renders for the node, and this node's provider reports no such name; a conforming template reads a value the node's own provider supplies (`".context.rendered_name"`, provider `"<provider>"`). read `{{ .context.instance_id }}` instead: this node supplies no source of its own, so its resources are named after the node's identity

And where it does supply source, under a provider deriving no such name:
> template reads the name the target gives the resources it renders for the node, and this node's provider reports no such name; a conforming template reads a value the node's own provider supplies (`".context.rendered_name"`, provider `"<provider>"`). write a value that does not depend on a name this target derives: it reports none for the output it renders from supplied source, so there is nothing of that kind to read here

Where the reference sits in a template other than a `provides:` entry, the report additionally names the field it was written in — `field "valuesMapping"`, `field "artifacts[probe.tf.json]"` — because an `artifacts:` entry's key is an output filename and carries the character the position separates its own segments with, so the position stops at the block that holds the entry.

**Which templates it covers:** every template a Recipe writes inline — its `provides:` entries, its `valuesMapping:`, its `workload:` body, each `artifacts:` entry, and each pipeline step's `with:` and `when:`. One template surface is outside it: a `valuesMapping:`, `workload:` or `artifacts:` entry supplied through `$import:` — whether the import names a local file or a library entry — carries no text in the Recipe until the render resolves it, so a reference inside such a body renders as an empty value rather than halting.

**How to fix:** read the key the report names. Where your node's output is something built for it under a provider that reports no name — a synthesized workload, a placed artifact set — `{{ .context.instance_id }}` is the name those resources actually carry, and it is the right value rather than a fallback. Where your node supplies a chart or module of its own and the report offers no substitute, the name you were reaching for is not one that provider derives: publish something that does not depend on it, or name the resource in the source you supplied and read that name back from a value you set. [`../templates/rendered-resource-names.md`](../templates/rendered-resource-names.md) sets out which providers report a name and, for each of the others, why none exists to report.

### A template reads its callers' render facts without declaring it

<!-- covers: internal/compiler/renderer.ErrCallerRenderFactsNotDeclared -->

A template in a FeatureRecipe attached to a component reads `render_facts` beneath `.context.used_by` — what the components connecting to the attachment's host reported about their own renders — and the FeatureRecipe does not set `readsCallerRenderFacts: true`.

The key is what decides when the attachment renders. Without it, the attachment renders right after the component it is attached to, and a connecting component that comes later in the build's order has not rendered at that point, so what it emitted cannot be there to read. Refusing the template before anything renders reports the missing declaration against the field you wrote, instead of a build whose template reads what some of its callers emitted and not the others.

Emitted message:
> template reads its callers' render facts, but the FeatureRecipe does not set readsCallerRenderFacts (`<reference>`, written in `<field>`)

The reference is quoted relative to the connection it was read off — `.render_facts`, or `.render_facts.<name>` — because a template reads the callers one connection at a time, inside `{{ range .context.used_by }}` or off one connection it picks. The field names the block the template was written in: `valuesMapping`, `workload` or `artifacts[<output-name>]`. A pipeline step's `with:` or `when:` reading the same facts is reported by the next entry instead, whatever the FeatureRecipe sets, because setting the key would not let a step read them. Where several fields read the facts, each gets a report of its own beneath a line naming what they share:

> attachment templates reading their callers' render facts without declaring it

**How to fix:** set `readsCallerRenderFacts: true` in the FeatureRecipe's `spec`. That renders its attachments after every component has rendered and changes nothing else about what they render — see [the FeatureRecipe entity page](../entities/featurerecipe.md#rendering-after-the-callers--specreadscallerrenderfacts). The key is the contract, and this halt only helps you find a template that visibly needs it: the check reads the template as written, so a reference built while the template runs, or one written in content imported from a file or a library, does not halt — set the key on such a FeatureRecipe all the same. A template reading a field named `render_facts` off some other list next to `.context.used_by` halts as well, and so does one reading its host's own facts as `.render_facts` inside `{{ with .context }}` next to it — write the host's own as `.context.render_facts` in full, which is never taken for the callers'; setting the key clears either at no cost but the later render.

A FeatureRecipe that renders once for a boundary (`executionScope: boundary`) is not checked here: its templates have no `.context` to read, and a reference to one is refused as a field outside its scope's allowlist instead.

### A pipeline step reads its callers' render facts

<!-- covers: internal/compiler/renderer.ErrPipelineStepReadsCallerRenderFacts -->

A pipeline step's `with:` or `when:`, in a FeatureRecipe attached to a component, reads `render_facts` beneath `.context.used_by` — what the components connecting to the attachment's host reported about their own renders.

A pipeline step never sees those connections. A step may rewrite the host component's own documents, and a component's own output stays the same whoever connects to it, so a step's templates are evaluated without `.context.used_by` — for every FeatureRecipe, whether or not it sets `readsCallerRenderFacts: true`. That key decides when the attachment renders, never what a step sees. A step reading its callers' facts would therefore read nothing, and the build halts before anything renders rather than render that read as an empty value.

Emitted message:
> pipeline step reads its callers' render facts, but a pipeline step does not read the components connecting to its host; it reads only the host's own render facts (`<reference>`, written in `<field>`)

The reference is quoted relative to the connection it was read off — `.render_facts`, or `.render_facts.<name>` — as in the entry above, and the field names the step by its id: `pipeline[<step>].with` or `pipeline[<step>].when`. Where several steps read the facts, each gets a report of its own beneath a line naming what they share:

> pipeline steps reading their callers' render facts

**How to fix:** in a step, read the host's own render facts at `.context.render_facts`, written in full — they come from the host's own render, so reading them makes nothing depend on who connects to it. Read the callers' facts in the templates that produce the attachment's own resources instead — its `valuesMapping:`, `workload:` or `artifacts:` — with `readsCallerRenderFacts: true` set, as [the FeatureRecipe entity page](../entities/featurerecipe.md#rendering-after-the-callers--specreadscallerrenderfacts) describes. Setting the key alone does not clear this halt. The check reads the template as written, with the limits the entry above describes: a reference built while the template runs, or one written in content imported from a file or a library, does not halt, and a step reading a field named `render_facts` off some other list next to `.context.used_by`, or its host's own facts as `.render_facts` inside `{{ with .context }}` next to it, halts as well.

A FeatureRecipe that renders once for a boundary (`executionScope: boundary`) is not checked here, for the reason the entry above gives.

### A template reads its targets' render facts without declaring it

<!-- covers: internal/compiler/renderer.ErrTargetRenderFactsNotDeclared -->

A template in a FeatureRecipe attached to a component reads `render_facts` beneath `.context.uses` — what the components the attachment's host is wired to reported about their own renders — and the FeatureRecipe does not set `readsTargetRenderFacts: true`.

The key decides two things. It makes the attachment render once every component has rendered: without it, the attachment renders right after the component it is attached to, and a target that comes later in the build's order has not rendered at that point. And it is what puts each target's facts on the connections the attachment reads: without it, no entry of `.context.uses` carries `.render_facts` at all. Refusing the template before anything renders reports the missing declaration against the field you wrote, instead of a build whose template reads nothing where it expected a target's facts.

Emitted message:
> template reads the render facts of a component its host is wired to, but the FeatureRecipe does not set readsTargetRenderFacts (`<reference>`, written in `<field>`)

The reference is the one the template wrote: beneath one connection's alias in full — `.context.uses.<alias>.render_facts`, or `.context.uses.<alias>.render_facts.<name>` — or, where the template reads the connections one at a time, inside `{{ range .context.uses }}`, `{{ with .context.uses.<alias> }}` or off one connection it picks, relative to that connection: `.render_facts`, or `.render_facts.<name>`. The field names the block the template was written in: `valuesMapping`, `workload` or `artifacts[<output-name>]`. A pipeline step's `with:` or `when:` reading the same facts is reported by the next entry instead, whatever the FeatureRecipe sets. Where several fields read the facts, each gets a report of its own beneath a line naming what they share:

> attachment templates reading the render facts of the components their host is wired to, without declaring it

**How to fix:** set `readsTargetRenderFacts: true` in the FeatureRecipe's `spec` — `readsCallerRenderFacts: true` does not clear this halt, since it puts facts on the components connecting to the host rather than on the ones it is wired to. That renders its attachments after every component has rendered and puts each target's facts on its connection, and changes nothing else about what they render — see [the FeatureRecipe entity page](../entities/featurerecipe.md#rendering-after-the-targets--specreadstargetrenderfacts). The key is the contract, and this halt only helps you find a template that visibly needs it: the check reads the template as written, so a reference built while the template runs, or one written in content imported from a file or a library, does not halt — set the key on such a FeatureRecipe all the same. A template that reads `.context.uses` at all and also reads a field named `render_facts` off some other value — a caller's facts inside `{{ range .context.used_by }}` among them — halts as well; set the key, and `readsCallerRenderFacts` too where the template reads its callers' facts.

A FeatureRecipe that renders once for a boundary (`executionScope: boundary`) is not checked here, for the reason the callers' entry above gives.

### A pipeline step reads its targets' render facts

<!-- covers: internal/compiler/renderer.ErrPipelineStepReadsTargetRenderFacts -->

A pipeline step's `with:` or `when:`, in a FeatureRecipe attached to a component, reads `render_facts` beneath `.context.uses` — what the components the attachment's host is wired to reported about their own renders.

A step reads the connections its host makes, as the host's own Recipe reads them, and never their targets' render facts — for every FeatureRecipe, whether or not it sets `readsTargetRenderFacts: true`. A step may rewrite the host component's own documents, and the host's own render reads what its targets publish, never what they emitted, so a step's templates are evaluated without those facts. A step reading them would therefore read nothing, and the build halts before anything renders rather than render that read as an empty value.

Emitted message:
> pipeline step reads the render facts of a component its host is wired to, but a pipeline step reads only the host's own render facts (`<reference>`, written in `<field>`)

The reference is quoted as in the entry above, and the field names the step by its id: `pipeline[<step>].with` or `pipeline[<step>].when`. Where several steps read the facts, each gets a report of its own beneath a line naming what they share:

> pipeline steps reading the render facts of the components their host is wired to

**How to fix:** in a step, read the host's own render facts at `.context.render_facts`, written in full. Read the targets' facts in the templates that produce the attachment's own resources instead — its `valuesMapping:`, `workload:` or `artifacts:` — with `readsTargetRenderFacts: true` set, as [the FeatureRecipe entity page](../entities/featurerecipe.md#rendering-after-the-targets--specreadstargetrenderfacts) describes. Setting the key alone does not clear this halt. The check reads the template as written, with the limits the entry above describes.

A FeatureRecipe that renders once for a boundary (`executionScope: boundary`) is not checked here, for the reason the callers' entry above gives.

### Cross-node type safety violation via `selector:`

<!-- covers: internal/compiler/analyzer.ErrSelectorViolation -->

One halt covers the two label expressions a catalog author writes to constrain what may be wired or attached, because both fail the same way: a label set that does not satisfy an expression a catalog entity declared.

**A `uses:` edge whose target fails its socket's `selector:`.** A `usesSchema` socket declares a `selector:` field that excludes the target Component attached at the other end of the edge. The selector is the catalog author's way of saying "this socket only accepts targets whose labels match this expression"; an edge that satisfies the socket-name lookup but fails the selector expression is a type-safety violation. The synthesized JSON Schema carries the selector as the `x-aggrega-selector:` extension keyword consumed by the native Go selector engine.

Emitted message:
> selector violation ("<selector-expression>", declared on socket "<socket-name>", not satisfied by the labels of "<target-id>"). Add the labels the selector requires to the target's component type, or wire the socket to a component that already carries them.

**An attachment whose component fails the Feature's `appliesTo:`.** A Feature declares which components it may attach to, on `appliesTo:` and on `appliesToAnyOf:`. The single expression's requirements hold together and the alternatives hold alternatively, any one of them being enough; both surfaces must hold, and a surface the Feature omits is satisfied by anything. An attachment whose component carries labels the Feature's declaration does not admit is the same class of violation as the edge case above.

Emitted message:
> selector violation ("<appliesTo-expression>", declared by Feature "<feature-type>", not satisfied by the labels of "<component-id>"). Add the labels the Feature's appliesTo requires to this component's type, or attach a Feature whose applicability the component already satisfies.

Either expression may also be written in a form the label grammar cannot read at all. That is reported as the same halt whose last value is the reason it could not be read rather than the label set it went unsatisfied by — which is what tells an expression that could not be evaluated apart from one that was evaluated and came out false:

> selector violation ("<appliesTo-expression>", declared by Feature "<feature-type>", which could not be evaluated: "<why-it-could-not-be-read>"). Correct the appliesTo selector on the Feature's catalog entity.

The halt carries the authoring key it is about — the `uses:` socket entry, or the `features:` entry naming the attachment — alongside the file that declares it, so the position it reports is the entry you edit rather than the head of the document. A Component authored inside a subsystem is positioned at the subsystem it was authored under, level by level. An attachment is positioned at the `features:` entry that wrote it, in the document that wrote it, and filed under that document's author: the component's own block or a subsystem's block in the Aggregate, a developer fault; and, for an attachment only the Release makes, its entry for the component or the `features:` block of a boundary holding the component, an operator fault. Where both documents write the attachment, it is positioned where its `type` is named, which the Aggregate always does. An attachment written on a connection is positioned at its key under that connection's `features:`, in the document that wrote it — the Aggregate's connection entry, or the Release's per-edge entry for an attachment only the Release makes. A Feature the Release alone attaches to a component its declaration does not admit reads:

```text
[OPS_ERROR E0007] release.yaml at .spec.boundaries.main.components.app.features.metrics
  selector violation ("component.aggrega.ai/type=server", declared by Feature "core/prometheus-exporter", not satisfied by the labels of "app"). Add the labels the Feature's appliesTo requires to this component's type, or attach a Feature whose applicability the component already satisfies.
```

and the same attachment written on the component in the Aggregate reads `[DEVELOPER_ERROR E0007] aggregate.yaml at .spec.components.app.features.metrics`. An attachment annotation-driven expansion produced was written by no `features:` entry, so it is positioned at the component's own `features:` key in the document that declares the component, as a developer fault.

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

**Emitted messages.** One finding is reported per colliding path — once, however many boundaries fed the assembly it happened in — so a build whose contributors met on two paths tells you about both and neither collision is reported twice:
> assembled output collision: two contributors write the same output path (output path `"<output-path>"`, written by `"<contributor-1> and <contributor-2>"`, assembled within `"<boundary-1> and <boundary-2>"`)

Each contributor is named for what it is, which is what says where its name is written: `component <name>` for a component instance, `feature <name>` for a feature attached to a boundary, and `the <provider> assembly` for the assembly's own merged output. The contributors are listed in name order, so the sentence is the same on every build of the same input.

The boundaries the assembly was fed by are named too, and they are listed rather than singled out. Boundaries whose `directory:` declarations evaluate alike assemble as one, and nothing about a collision says which of them the contributors that met were declared in — so the finding gives you every boundary whose declaration could separate them and asserts about none of them that it is the one at fault. The finding is reported against the Release document as a whole for the same reason: naming one boundary inside it would send you to a document that may have contributed nothing to the path.

Where more than one path collides, the findings arrive together under a report stating what they have in common:
> assembled output paths written by more than one contributor

**How to fix:** rename the emitted file in whichever Recipe you control — an `artifacts:` key, or the filename a Workload translation derives — so the two no longer meet. Where the two contributors genuinely belong to separate outputs, give their boundaries distinct `directory:` paths so each assembles on its own.

### The same name is derived more than once inside the output

<!-- covers: internal/compiler/renderer.ErrDerivedKeyCollision -->

One assembly ends up with the same name used twice for something *inside* the files it emits, somewhere there is room for only one of it. It happens two ways: two contributors derive the same name, or a single contributor's own output carries that name twice. This is distinct from the two collisions above: where two contributors are involved, the components are named differently and their files land on different paths, so nothing about the assembly's shape is wrong — it is a name in the content, such as the identifier a target uses to address one resource, or the name under which one output is published for another to reference.

**Which names are compared follows from what the provider does with an assembly's output.** Where the provider merges that output into a single document — one stack template, one compose file — the names inside that one document are compared against each other, and a contributor whose output is written as separate files of its own stands outside it. Its names meet nobody else's, so nothing halts between them, and nothing you could rename would change that. Where the provider writes each contributor's output as files of its own instead — a chart render, a set of manifests — every contributor to the assembly is compared against every other, because a name in such output is unique across whatever reads those files as a set rather than within any one file.

A FeatureRecipe's own resources travel the way its host component's do, because an attachment contributes to the assembly its host belongs to. So where the provider merges, an attachment's names are compared against its host component's and against every other attachment's, exactly as two components' names are: all of them end up inside the one document, and one of two equal names displaces the other there. Where the provider does not merge, the attachment's resources are written under a directory naming the component it is attached to, and its names are still compared against every contributor to the assembly — which is where a resource identity that has to be unique across a cluster is caught. The comparison is therefore the same on both, and what differs is only where the name that would be displaced ends up standing.

One half of the halt is unaffected by all of this: a single contributor's own output carrying a name twice. That is a name used twice inside output that one contributor wrote, so it halts wherever that output was written, and the two things to separate are always inside it.

Most such names are a provider's own, derived from the component instance and the resource, so two components can arrive at one name whenever the parts they are derived from agree — and one component can arrive at one name twice the same way, when two of its own resources are built from parts that agree. Because the name lives in the file's own bytes, the assembly cannot see it: the provider reports the names it derived, and the build compares them.

One kind of name is the build's own rather than a provider's, and it is reported the same way: the identity every resource a FeatureRecipe emits is labelled with, which reaches your output as the `aggrega.ai/component-id` label. It is reported under the kind of name `component-id`, so you can find the same string in your own emitted output. Where a FeatureRecipe synthesizes its resources, that identity is also what they are named after; where it renders a chart or a fragment its author supplied, the names inside that render stay the host component's and only the labels carry the identity.

For a feature attached to a **component** it is composed from the component the feature is attached to and the key you wrote under `features:`, behind a fixed opening. The host component is part of the value because one feature name attached to several components emits a separate set of resources on each, and each set needs an identity of its own.

For a feature attached to a **boundary** it is composed from the feature's name and each segment of the boundary's path, behind an opening of its own. Both sites compose rather than substitute: a character the label alphabet refuses is written out rather than replaced, and the parts are joined by a run no written part can contain, so two attachments you can tell apart always reach two identities. The one residue is length: a composed identity too long for a label value is shortened around a digest of the whole of it, and two shortened identities can in principle meet. This halt reports such a meeting between two contributors whose names are compared, and two attachments on one component are two such contributors wherever their host's provider assembles them together. See [`../providers/well-known-annotations.md`](../providers/well-known-annotations.md) for how each is built.

A Kubernetes render reports a kind of its own: the name each resource its own rendering produces carries in its `metadata.name`. Such a name has to be unique within its `kind` — and, for a kind the cluster keeps in namespaces, within its namespace — rather than across the whole output, so the kind of name says which of those it is scoped to. It opens with `resource-names` and then carries the resource's `kind` and the namespace the resource lands in, which is the one the resource names for itself or, where it names none, the one the boundary is annotated with. So `resource-names:Service--default` is the names of the Services landing in `default`. A kind the Kubernetes API keeps outside every namespace — a `ClusterRole`, a `StorageClass`, a `CustomResourceDefinition` — and a custom kind a `CustomResourceDefinition` in the same render declares with the scope `Cluster`, carries its `kind` alone, whatever namespace its document writes: `resource-names:ClusterRole` is the names of every ClusterRole the output carries. Anything outside the letters and digits is written out rather than replaced and the two parts are joined by a run no written part can contain, so two different pairs never reach one kind of name, and a kind on its own never reaches the kind of name of a kind and a namespace. A `Service` and a `Deployment` may share a name, and two namespaces hold one name of a namespaced kind independently, so neither of those halts. The name itself is reported exactly as your chart wrote it, which makes it the string to search your templates for.

So two contributors to one output that each write one cluster-wide object under one name halt even where the Release places them in two namespaces, because applying both writes that one object twice; and one chart writing such an object under two different namespaces, which the render emits as two files, halts as a single contributor carrying the name twice. A kind nothing in the render classifies — a custom kind whose `CustomResourceDefinition` the render does not emit, or a document naming no `apiVersion` — is compared within its namespace, as a namespaced kind is, because nothing in the render says the cluster keeps it outside one; two contributors writing one such object in two namespaces therefore do not meet.

Names are compared among the contributors to one output, and never between two outputs. Two boundaries are two outputs when each has a directory of its own — one it names, or the one each boundary naming no `directory:` is given — and nothing in a build says whether two outputs are applied to one cluster or to two: one operator's `CustomResourceDefinition` shipped to each of two clusters is the same name in two outputs, and correct. So two boundaries each writing one cluster-wide object under one name build even where both are applied to one cluster; where they are, emit the object from one of them only.

The arrangement that reaches this halt most often is two Features attached to one component, each delivering a chart its author supplied. Both charts render against the same release name — the host component's, so that attaching a chart does not rename resources its author already declared and deployed — and naming a resource after the release name is among the commonest things a chart does. Nothing about the output's shape is wrong: the two resources simply carry one name. Where the component's provider writes discrete documents, each attachment writes under a directory of its own and applying both leaves whichever was applied last; where it folds its group into one document, both attachments contribute to that document and one of the two names displaces the other inside it. Rename the resource in the chart you control, or give it a name carrying something that tells the two attachments apart — and it is the attachment that has to reach the template, because both charts render against the host's release name, so renaming the attachment on its own moves nothing. Pass `.attachment_name` into the chart through the FeatureRecipe's `valuesMapping:`, and set it on whichever of the chart's own values its resource names are built from.

A second arrangement reaches the same halt with one Feature rather than two: a chart whose template writes a resource name as a literal, attached to two components. Each host renders it under a release name of its own, so the literal is the only reason the two copies carry one name — name the resource after `.Release.Name` and the host is back in it, which is what a chart building its resource names from its release identity already does.

A third arrangement is the same shape one authoring surface further in: a FeatureRecipe delivering its resources through `artifacts:` rather than through a chart, attached under one name to two components, whose body writes a resource name as a literal. Each attachment's output lands under a directory naming its host, so the emitted paths differ and nothing about the output's shape is wrong — but both bodies carry the same name, and applying both leaves whichever was applied last. A name in an artifacts body is compared exactly as a name a chart rendered is: the two describe the same resource in the same cluster, so where the name came from makes no difference to what happens when both are applied. That reading rests on the two names being read together, which is what happens where a provider writes each contributor's output as files a target reads as one set. Where the provider merges an assembly's output into a single document instead, each attachment's files stand outside that document and a name inside one of them is scoped to it, so two such attachments never meet and the build proceeds.

Not every name is reported, so a build that does not halt has not established that every name its output will eventually carry was compared. A resource left for the cluster to name — one declaring `generateName` instead of `name` — carries no name yet, so there is none to report. And a name written into some other field for a controller to read later is not a resource name, so nothing compares it. Both bounds are properties of reading the emitted document, so both apply to an artifacts body exactly as they apply to a rendered chart template.

An `artifacts:` body is a template, so a name in it that has to be distinct per host is composed rather than written as a literal. `.context.rendered_name` is the name the host component's own provider gives it — under `helm`, its release name, spelled in the characters a Kubernetes name allows — and `.attachment_name` is the key you attached it under, so `{{ .context.rendered_name }}-{{ .attachment_name }}` gives a resource a name of its own on every host and under every attachment. On a host whose provider reports no such name, compose it from `.context.instance_id`, the host's identity, instead. One authored body reaches each host it is attached to carrying whatever names are in it, and a literal is the same on all of them — so give a name that has to be unique in the cluster that shape.

Nothing about a name's meaning is interpreted — two reported names are either the same text or they are not — which is why the same report covers every kind of name, whoever derived it.

A name can appear in more than one report for one component, because each part of a component is reported as it is rendered. That is one resource named in each report it belongs to, not a name used twice, and it does not halt. What halts is a single report carrying one name twice, because that report describes output where the name is genuinely used twice.

That reading turns on what counts as one contributor, and for the `component-id` kind the answer is the attachment rather than the component or the boundary it sits on. An attachment is identified by both coordinates you wrote for it — the component it is attached to together with the key under `features:`, or the boundary path together with the name at that boundary — so two attachments on **one** component are two contributors, exactly as two on different components are, and one feature name written at **two** boundaries is two contributors even though the name is the same at each. Being two contributors is what makes their identities comparable in each of those arrangements; whether two of them are compared at all follows the same rule as every other name here, so where the provider merges, an attachment whose output is written as separate files of its own stands outside the merged document and is compared only against itself. Two attachments reaching one identity therefore halt wherever their output can reach each other's, and each finding names both of its coordinates so you can tell which two things to separate. Because both coordinates are part of the composed value, two attachments you can tell apart reach two identities at any length that fits — so the arrangement that reaches this halt is the one where a value too long for its target was shortened and two shortened values met. Where two shortened identities meet and their output cannot reach each other's — two attachments on one component, under a provider that merges, each written as separate files of its own — nothing compares them, and the two sets of resources carry one `aggrega.ai/component-id` between them.

One arrangement is worth stating outright because it looks like it should halt and does not: attaching a feature under the **same name** on two components is entirely supported, and needs no renaming. The component is part of the composed value, so `metrics` on `api` and `metrics` on `web` reach two identities and each component's resources get an identity of their own — which matters because a cascade that mints one attachment name across many components by design leaves an author no other name to write. Every way a FeatureRecipe delivers resources puts its identity on what it emits, including one that only vendors a source and renders it as it stands, so every one of them is compared; a feature whose FeatureRecipe emits nothing at all has nothing to compare.

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

**How to fix:** where two contributors are named, rename one of them in the Aggregate, so the names derived from it no longer agree with the other's. Where the kind of name is `component-id`, each finding already names the thing to rename: `carrying attachment "…"` is the key under that component's `features:` block, and a `feature "…"` `attached at boundary "…"` is the name under that boundary's `features:` block. Where the two findings differ only in the boundary they name, the two attachments carry one name at two boundaries — rename one of them, or give the two boundaries distinct `directory:` paths so their output no longer merges. Where the two names are ones the build composed, they can only have met after being shortened to fit the target, so shorten the parts they are composed from yourself rather than leaving the build to. Where both names are derived from something you set explicitly — a value the Recipe feeds the provider, or an annotation the provider reads — change that instead on whichever of the two you control. Where the two contributors genuinely belong to separate outputs, give their boundaries distinct `directory:` paths so each assembles on its own and the two names never meet. Where a single contributor is named as having derived the name more than once, the two colliding things are both inside that one component: find the two resources its Recipe produces whose names agree, and change what one of them is named after — the key it is declared under, or a value it is built from — so the provider derives a distinct name for each. Where the kind of name is a cluster-scoped kind on its own, such as `resource-names:ClusterRole`, the documents named describe one object in the cluster whichever namespaces they were placed in: emit it from one contributor only — through a value its chart offers, such as a switch for installing its definitions — or, where the two are meant to be two objects, give one of them a name of its own in the chart or body you control; a single contributor named for it twice writes it under two namespaces, and one of the two documents is the one to drop.

### An authored export name is one the build derives for a cross-stack reference

<!-- covers: internal/wasm.ErrPluginOutputNameCollision -->

A cloudformation Recipe's `Outputs:` block is authored CloudFormation, and an entry in it may carry its own `Export:` with a `Name:`; that name reaches the assembled stack exactly as written. Separately, when a `uses` edge crosses from one boundary to another, the provider publishes the consumed value as a stack `Output` with an `Export` under a name it derives from the release, boundary, component, and provided key. This halt fires where the two meet: the name you wrote is the name the derivation produced for the same build, so the stack would declare one export name twice from two places, and an export name has to be unique.

Only the coincidence halts. Declaring an export name on an `Outputs` entry is supported, and one matching no derived name publishes alongside the derived ones without comment.

The halt gives the derived export name together with the four parts it was built from, so you can see which cross-boundary reference produced it, and it names the stack output your declaration sits under — marked as a name the provider assembles rather than one a Recipe wrote, because the provider builds that name by encoding the component and the entry into the letters and digits a logical ID admits, so it is not the string either of them was written as. **The export name is the part to search for.** Your entry spells it exactly as the halt does, which is what makes the two a collision, so it is the one string that appears both in the message and in your own files.

The comparison is scoped to one stack: the export names that stack declares, against the names derived for the cross-boundary references publishing into it. Two stacks are not compared against each other, and an export name written as a CloudFormation intrinsic resolves at deploy time, so there is no name to compare. What a name meets among the exports already deployed into an account and region is a property of the deployment, which a build does not observe.

Emitted message. The condition names the kind of failure and the provider's own sentence says what happened; the surrounding report also names the `uses` edge being wired:
> two things a plugin produced occupy one name in its output
> cloudformation-provider: an export name a cross-boundary link derives is already declared by another Outputs entry in the same stack: the link derives the export name `<export-name>` for provides key `<provides-key>` of component `<component>` in boundary `<boundary>` of Release `<release>`, and another Outputs entry of the same stack already declares that same export name — that declaration sits under the stack output `<stack-output>`, a name this provider assembles rather than one a Recipe wrote; each shadowing Outputs entry spells its export name exactly as the halt does, so searching your Recipes for that name reaches the entry — rename the export name the entry declares, or remove that entry's Export block and let the link publish the export

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

- **Parameter interpolation in an Aggregate** — the `{{ .parameters.<key> }}` references the Aggregate's own text carries — is the earliest of these surfaces: it runs over the raw document before the catalog resolves, so its policy applies to text no other surface has seen yet. A reference to a parameter the Release never filled **renders as nothing**, and a `default` pipe or an `if` guard over such a read behaves exactly as it would over the unfilled parameter. A reference the template **iterates** keeps iterating as nothing, which is what ranging over an optional list wants. A reference whose **parent** is absent — `.parameters.db.host` where no `db` parameter was filled — still halts, because there is nothing to descend into and supplying a parent would trade the halt for a silently wrong artifact. **One bound is worth stating as a bound rather than as a policy:** a reference anchored at a **root** the surface does not define is left alone rather than rendered as nothing, so it survives into the interpolated document as the template engine's own placeholder text, `<no value>`. Nothing on this surface halts on it, so anchor every parameter reference at `.parameters`, and read a stray `<no value>` as a misspelled root.
- **Path templates** (Release boundary `directory:` / `subDirectory:`) evaluate with `missingkey=error`. A reference to a variable the surface does not give them halts at parse time — see "Path-template references a variable outside the allowlist" above — and so does a mistyped key under `.manifest`, whose keys are declared. An allowed-but-undefined-at-eval-time reference, such as a `.parameters` key the Release does not supply, produces an explicit error rather than silently rendering an empty string into a directory path.
- **`assertions`** (on a Component, Feature, Recipe, or FeatureRecipe) evaluate with `missingkey=error`. A reference to an undefined key halts with a no-such-key diagnostic naming the entity, the instance, and the assertion. The strictness is what makes an assertion trustworthy: a predicate whose reference rendered as an empty value would compare against nothing and pass, so a single typo would silently retire the rule the assertion was written to enforce. Because the bare reference halts before any fallback can run, a plain `default` does not supply an optional-field fallback on this surface — gate the reference with `hasKey`, or use the `optional` helper, which performs the presence check directly. Reading the key through `index` does not supply one either: `index` halts on a map key the map does not hold, naming the key.
- **Value templates** (Recipe `valuesMapping`, `locals:` and `provides:` entries, `artifacts:` bodies, Workload bodies, FeatureRecipe `injectMapping` and `pipeline.with`, and component-level self-inject `value:` templates) evaluate with `missingkey=zero`, so a reference to an undefined key does not halt the build — the read renders nothing, and nothing is what reaches the artifact. What *does* still halt on this surface is a reference that descends **through** a container the author never supplied — `.values.tls.ca` where no `tls` was authored — because there is nothing to descend into. Only the final key of a reference whose containers are all present renders as nothing. Guarding works as expected: `{{ .values.optional_field | default "fallback" }}` does supply the fallback, because an unset value counts as empty for `default` and falsy for `if`. Authors who need the absent-vs-zero discriminator — telling "key absent" from "key present and empty" — use the `optional` helper documented at [`templates/sprig-functions.md`](../templates/sprig-functions.md), and read a given key one way per template: a key the same template also reads as `.values.<key>` counts as present, so `optional` reports its empty value rather than the fallback. What this policy does not cover is a read through `index`: indexing a map with a key it does not hold halts naming the key here as on every surface — see "A template indexes a map with a key the map does not hold" below.
- **A `source:` coordinate** — the templated fields of a structured `source:` block on a Recipe or FeatureRecipe (`version`, `ref`, `chart`, `module_subdir`) — evaluates with `missingkey=error`. A reference to a key nothing supplies halts naming the source field, rather than resolving to nothing: an empty version or ref would pin a different artifact from the one the author named, and the pin is what every later build reproduces. This surface is also where the available function set differs, and where a `locals:` reference the block's own author order refuses halts before anything is evaluated — see below.
- **Typed parameter contracts** catch missing-required-parameter and contract-violation cases at the parameter-contract layer, before interpolation runs — see "Parameter type mismatch / contract violation" above.

The **helper set is the same across value templates, path templates and assertions**: Sprig's functions plus Aggrega's own (`optional` and `capitalizedWords`), with `fail` added on the assertion surface because an assertion is the only surface whose purpose is to halt the build rather than produce text. Between those three what differs is the missing-key policy — `optional` is available in a path template too, where it reads a key out of `.parameters` without the strict policy firing first. Resolving a `source:` coordinate differs in the function set itself, and has its own subsection below. Parameter interpolation in an Aggregate offers Sprig's functions alone, so neither Aggrega helper is available there. One function reads the same way on every one of these surfaces, the coordinate and the interpolation included: `index`, which halts naming the key when the map it reads does not hold it.

The message a path-template miss prints is quoted under the entry that documents that condition, "Path-template references a variable outside the allowlist" above, so it is written once rather than restated here.

**How to fix:** for path-template misses, correct the field name to one in the allowlist documented at [`path-template-variables.md`](../path-template-variables.md). For an assertion miss, correct the reference — most reports are a misspelled key — or, where the field is genuinely optional, gate it with `hasKey` or use the `optional` helper; wrapping the bare reference in a `default` will not clear the halt, because the reference resolves before the fallback runs, and reading it through `index` will not either, because `index` halts on a key the map does not hold. For value-template misses where empty rendering is undesired, use the `optional` helper or supply the missing key as a typed `parameters.*` declaration on the Aggregate with a Release value, as an upstream Component's `provides:` entry wired through `uses[].inject`, or as a `locals:` entry on the same entity.

#### Resolving a `source:` coordinate registers a narrower function set

<!-- covers: pkg/closure.ErrSourceTemplateAtLockTime, pkg/closure.ErrSourceTemplateParse, pkg/closure.ErrSourceTemplateProvidesRef -->

A structured `source:` block is resolved so the artifact it names can be pinned, and that resolution registers **Aggrega's own helpers and nothing else** — `optional` and `capitalizedWords` are available, and `index` halts on a map key the map does not hold exactly as it does when the Recipe renders; Sprig's functions are not. Of the surfaces a Recipe or FeatureRecipe authors templates on, this is the one whose function set differs, so an expression that renders correctly elsewhere in the same Recipe can be refused here. Calling a Sprig function in a `source:` field, or in a `locals:` entry on the same entity, halts at parse time; the message names the entity, the entry, and the function it could not resolve:

> resolve: parse template at `<name>:<version>`.spec.locals.`<key>`: resolve: source-template evaluation failure at lock time (also resolve: source-template parse error) (cause: template: `<name>:<version>`.spec.locals.`<key>`:1: function `"<function>"` not defined)

**The reach is the whole `locals:` block, not only the entries the coordinate reads.** Every `locals:` entry on an entity with a structured `source:` is resolved as part of resolving that coordinate, so a Sprig call in any entry halts even where the `source:` fields are entirely literal and read no local at all. The entry the halt names is the offending one, so the report still points at the line to change.

**Two shapes sit outside this surface**, and knowing which one a Recipe is in explains why the same expression is accepted in one Recipe and refused in another:

- **A `source:` written as a plain string** — a URI or a local path rather than a mapping — is taken verbatim, so it has no fields to evaluate and the `locals:` block is not resolved here at all.
- **An entity declaring no `source:`** resolves no coordinate, so its `locals:` block is resolved only for that entity's own rendering, where the full function set applies.

**The reference-order contract is the same here, and that is the more consequential half.** Resolving a coordinate reads the whole `locals:` block, and it refuses the same references a render refuses: an entry reading a sibling the block declares below it, and any template reading a key the block does not declare. Both report the conditions documented above under "`locals:` entry references a sibling defined later in the same block" and "`locals:` key does not exist" — the same condition, with the same remedy, whichever resolution reached it first. So a block whose entries are in the wrong order is refused when the artifact is pinned, before any build renders it.

**What this surface does pass over is an entry a coordinate genuinely cannot resolve**: one reading data that exists only while an artifact is rendered, `.context.instance_id` being the case it is there for. Such an entry is skipped and the coordinate resolves from its own fields, so a Recipe carrying one is still pinned. Where the coordinate itself needed that entry, the resolution halts naming the `source:` field rather than the `locals:` entry — the missing-key report described for this surface above — because what cannot be produced at that point is the coordinate.

**Neither a `source:` field nor a `locals:` entry on the same entity may read `.provides`.** A `locals:` block feeds a `provides:` block and never the reverse, so a template on this surface reading `.provides` is refused as the reverse reference it is rather than resolving to nothing. The refusal is not a lock-time absence that a later phase would satisfy — no ordering makes the reference valid — so it is reported the same way wherever the coordinate is resolved. The message names the field, says what is wrong with the reference, and gives the surface the expression may read instead:

> source-version template at `<name>:<version>`.spec.source.`<field>` references `.provides`, which is an invalid reverse reference (locals feed provides, never the reverse) — refactor to read only `.values` and `.infra` (and `.locals` over the same): resolve: source-template evaluation failure at lock time (also resolve: source-template references .provides (invalid reverse reference))

**Where the halt surfaces:** while the lockfile is being filled or refreshed — `aggrega pull`, or a build that fills it (`--auto-pull`, `--upgrade`, or the workspace `auto_pull` setting). A missing key on a `source:` field, as against an unavailable function, reports the same condition at execution rather than parse time, naming the field and the key it could not read.

**How to fix:** `optional` is registered on this surface *and* on every value template, path template and assertion, which makes it the portable choice — `{{ optional .values "chart_version" "25.0.8" }}` in place of `{{ default "25.0.8" .values.chart_version }}`. Read the semantic difference before substituting: `optional` fires on the key being **absent**, while `default` fires on the value being **empty**, so a key authored as an empty string or a zero keeps its authored value under `optional` and is replaced under `default`. Where the expression genuinely needs a Sprig function — reshaping a string rather than supplying a fallback — write it on the surface that consumes it (`valuesMapping`, a Workload body, an `artifacts:` entry) rather than in `locals:`, so that a `source:`-bearing entity's `locals:` block holds only expressions this surface can evaluate.

### A template indexes a map with a key the map does not hold

<!-- covers: internal/gotmpl.ErrIndexOfAbsentMapKey -->

A template reads a map through `index` — `{{ index .values "replicas" }}`, or `{{ index .context.inject.env $apiKeyVar }}` with a key name the template computed — and the map does not hold the key it is asked for. `index` halts there and names the key, on every surface that evaluates a template: value templates, `locals:` and `provides:` entries, path templates, assertions, a structured `source:` coordinate, parameter interpolation in an Aggregate and its parameters' `validate:` predicates, and the `x-aggrega-when:` and `x-aggrega-validate:` predicates of a schema.

**This is a property of `index` alone, and no surface's missing-key policy changes it.** A dot read of an unset key under an open pillar still renders nothing on a value template, as "Missing template key — asymmetric policy" above describes, and a template testing whether the author supplied such a key keeps working. What halts is asking `index` for a key the map does not hold. `index` is how a template reaches a key whose name it computes — a credential read under the variable name the consuming Recipe chose, say — and without the halt that read would put the template engine's placeholder text `<no value>` into the artifact while the build succeeded: a server started with that text as its key. Every other answer `index` gives is the template engine's own: a position in a list or a string, an out-of-range position, a key the map holds — including one whose value is null, which prints `<no value>`.

Emitted message, as the last line of the report — the frames above it name the node and the field the template sits in, and on a Recipe or FeatureRecipe value template the head carries this condition's code:
> template: `<template>`:`<line>`:`<column>`: executing `"<template>"` at `<index <map> <key>>`: error calling index: template indexes a map with a key the map does not hold (key `"<key>"`). read a key that may be absent through a function that tests for it first, such as optional, get or hasKey

On a surface that reports a template failure under a condition of its own — a `provides:` entry ("A `provides:` template could not be evaluated"), parameter interpolation ("A `{{ .parameters.* }}` reference cannot be interpolated"), a schema predicate ("An `x-aggrega-when:` or `x-aggrega-validate:` predicate cannot be evaluated"), a `source:` coordinate ("Resolving a `source:` coordinate registers a narrower function set") — the head carries that condition's code and the line above is the reason it carries, the key included.

**How to fix:** decide whether the key may legitimately be absent.

- **It may.** Read it through a function that tests for it first: `{{ optional .values "replicas" 1 }}` returns the fallback when the key is absent and the value, whatever it is, when it is present; Sprig's `get` returns an empty string for an absent key; `hasKey` tests without reading. `optional` is registered on every surface except parameter interpolation and the predicates of a parameter or a schema, which offer Sprig's `get` and `hasKey`; a `source:` coordinate registers `optional` and not Sprig.
- **It must not.** Supply it. The key the message names is the one the template asked for, so the usual causes are a key published under another name — a credential whose `key` is not the variable name the Recipe reads — a misspelled key in the template or in the authored values, and a connection that would deliver the key and is not wired.

### A governance plugin rejected the build

<!-- covers: internal/compiler/analyzer.ErrPolicyViolation -->

An operator may attach a governance plugin in a verdict role, over the graph the compiler built or over the artifacts it rendered. Such a plugin reads and returns a verdict. The host has no path that would apply a change coming back from it, so a verdict role can reject a build and cannot rewrite one into compliance — the rejection is the whole of what it can do, and what to change is left to whoever reads it.

Only a halt verdict stops the build. Warn and info verdicts are reported and the build carries on. Every halt verdict a plugin returned is reported, in the order the plugin emitted them, so one run tells you about all of them.

The message a build prints is the plugin's own, surfaced exactly as it was returned and framed only by the plugin that returned it — so how specific it is, and how actionable, is the plugin's to decide rather than the compiler's. Whatever optional detail the verdict carried follows in brackets, each part named: a code, a rule identifier, a classification, a source reference, a location, a suggestion. The condition it is recorded under is `policy violation`, which is what a short code in the diagnostic's head resolves to.

The refusal is attributed to the governance attachment rather than to one of your documents, so it carries no file position: there is no key that produced it, and the answer is either to satisfy the policy or to reconsider the attachment.

Emitted message:
> policy plugin `"<plugin>"` rejected the build: `<the plugin's own message>` [code=`<code>`; rule_id=`<rule>`; classification=`<class>`; source_ref=`<reference>`; location=`<where>`; suggest=`<suggestion>`]

The bracketed part is present only where the verdict carried detail, and each part inside it only where the plugin set it.

**How to fix:** read the plugin's message and the suggestion where it supplied one. Where the finding is correct, change what it objects to. Where the policy should not apply to this deployment, that is a question about the attachment: governance attachments are configured under `plugins.governance` in the workspace configuration, and which plugin runs in which role is an operator's decision rather than something a document can override.

### A governance attachment's settings do not match the plugin's declared schema

<!-- covers: internal/compiler/pipeline.ErrPolicySettingsInvalid -->

A governance plugin may declare a schema for the settings its attachment passes it. The settings written under the attachment's `with.settings` are checked against that schema **before** the plugin is dispatched, so a misconfigured attachment is reported as the configuration fault it is rather than reaching the plugin as ill-shaped input and coming back as whatever the plugin makes of it.

That ordering is the point of the check. It also makes this cleanly distinct from a rejection: the plugin has not run, no verdict was reached, and nothing about the build was judged. A plugin declaring no settings schema accepts any settings, so an attachment against one of those never meets this.

**The check covers the two verdict roles, and stating that bound matters because the surface does not.** An attachment authored at `ir-verdict` or `render-verdict` has its settings checked against the schema before it is dispatched. An attachment at `label-transform` or `annotation-transform` is handed its settings unchecked, so a plugin serving one of those roles receives whatever was written and answers for it itself — `with.settings` is the same authored key on every role, and only these two read it against a schema first.

Emitted message — the role the attachment was authored at and the plugin it names, then the fixed sentence, then what the schema check found:
> ir-verdict: plugin `"<the attachment's uri>"`: with.settings does not satisfy the plugin's declared settings schema: `<what the schema check found>`: policy attachment settings do not satisfy the plugin's declared settings schema

The leading clause reads `render-verdict` for an attachment authored at that role. What the schema check found is the schema validator's own report and runs to more than one line.

**How to fix:** correct the settings under that attachment's `with.settings` in `plugins.governance`. The detail in the middle of the message names the key at fault and what the schema expected there; the plugin's own reference documents the settings it declares.

### A pipeline step failed

<!-- covers: internal/compiler/featurerecipe_pipeline.ErrPipelineStepFailed -->

A FeatureRecipe may declare a pipeline: a sequence of steps, each dispatching a plugin export over the documents the node has emitted, so that a Feature can shape output the component's own Recipe produced. This is the condition a step reports under when it fails for any reason other than a patch addressing something the document set does not hold, which has a report of its own below.

What failed is named after the step's id and its index, and the clause that follows says which part gave way: rendering the step's `with` input, the call itself, output the host could not read, an error the plugin returned, an error-severity diagnostic the plugin emitted, a patch the patch engine rejected, or a patch naming a scope the walk does not have.

**A failed step is rolled back whole.** The documents are restored to what they were before the step ran, and the step's own outputs are dropped with them, so a later step's `when` or `with` cannot read a partial result. A step declared `optional: true` then reports as a warning and the walk carries on; a step that is not optional stops the build. What `optional:` does **not** tolerate is a violated declared contract — see the entry below.

Emitted messages:
> pipeline step failed: step `"<id>"` (index `<n>`) `with`: `<what the render could not do>`
> pipeline step failed: step `"<id>"` (index `<n>`) invoke: `<what the call could not do>`
> pipeline step failed: step `"<id>"` (index `<n>`) error diagnostic: `<the plugin's message>`
> pipeline step failed: scope `"<scope>"` key `"<key>"`: `<what the patch engine refused>`
> pipeline step failed: unknown patch scope `"<scope>"`

**How to fix:** read the step id, then the clause after the index — it says which half of the step to look at. A `with` failure is a template in the step's own `with:` block, and is yours to fix. An error diagnostic is the plugin's own words about your input. A refused patch and an unknown scope are the plugin's output against what the node emitted, and are the plugin author's. Where a step is genuinely allowed to fail — an optional enrichment rather than a required transformation — declare it `optional: true`, remembering that this tolerates a failure and not a broken contract.

### A pipeline step's typed input or output does not satisfy its declared contract

<!-- covers: internal/compiler/featurerecipe_pipeline.ErrPipelineContractViolation -->

A plugin export may declare a schema for the input it takes and for the outputs it returns. Both are checked: the rendered `with` value before the call, and the returned outputs after it. A diagnostic whose severity the shared contract does not declare is refused on the same footing.

**This halts even for a step declared `optional: true`**, and the distinction is the whole of why the condition is separate from a step failure. Optional tolerates a step that could not do its job — a call that failed, a plugin that objected. It does not tolerate output the host cannot route, or input that was never the shape the export said it takes: a declared contract is a commitment, and a build that quietly skipped a step whose contract was broken would be reporting success over a Feature that did nothing.

Emitted messages:
> pipeline step `"<id>"` `with` input does not satisfy the declared input contract: `<what the schema check found>`: pipeline step typed-I/O contract violation
> pipeline step `"<id>"` returned outputs that do not satisfy the declared output contract: `<what the schema check found>`: pipeline step typed-I/O contract violation

and for a diagnostic severity the contract does not declare, which arrives inside the step-failure frame:
> pipeline step failed: step `"<id>"` (index `<n>`): `<the severity the host could not route>`: pipeline step typed-I/O contract violation

**Where the step's `with` template reads a value declared sensitive, an input violation names no value.** What the schema check found is replaced by each failing position and the keyword that refused it, closed by a notice naming the reason — `at '/origin': pattern (the value is withheld because the template that rendered this input reads a value declared sensitive)` — so the field to correct is still named. See [`vocabulary/compact-form-authoring.md`](../vocabulary/compact-form-authoring.md#what-a-refusal-says-about-a-declared-value) "What a refusal says about a declared value".

**How to fix:** for an input violation, correct the step's `with:` block against the schema its export declares — the detail names the field and what was expected. An output violation and an undeclared severity are the plugin's to fix; the step's declaration is not what is wrong, so marking it optional will not clear either.

### A pipeline patch addresses a document the set does not hold, or one with no tree to address

<!-- covers: internal/compiler/featurerecipe_pipeline.ErrPipelineTargetAbsent, internal/compiler/featurerecipe_pipeline.ErrPipelineTargetOpaque -->

A pipeline step addresses a document by a scope and a key, and two shapes of address are refused.

**The set does not hold it.** The step patched a scope-and-key pair that is not among the documents it was handed. Nothing would be edited, so rather than apply a patch to nothing and report success, the walk stops:
> pipeline patch targets a document not present in the set: scope `"<scope>"` key `"<key>"`

**It carries no tree to address.** Some units have no structure a patch can point into — a binary body, free text, a region the provider cannot safely walk. Such a unit is still handed to the step, tagged with its media type and its bytes, so it can be selected and emitted whole; what it cannot be is patched, because there is nothing for a path to resolve against. A patch against one stops rather than being silently skipped:
> pipeline patch targets an opaque (non-structured) unit: scope `"<scope>"` key `"<key>"`

What counts as structured is the provider's own reading of the unit rather than a fixed test, so the same content can be addressable under one provider and opaque under another.

Both are the walk's own refusals, and a build reports them against the node whose pipeline made the patch, so the message above arrives beneath a halt naming that node. That halt is the build-stopping form of the same two addressing faults, documented under "A pipeline step addresses documents the node does not have" below — which also covers the third address a step can reach nothing with, a request for the documents of a host component at a site that stands against none.

**How to fix:** both are the plugin author's rather than yours. A step receives the document set it is being run over and can read which keys are in it, so an absent target is a step addressing a document this node did not emit — patch a document that is there, or emit the one you meant first and patch it in a later step. For an opaque unit, replace the patch with an emit of the whole unit: an opaque body is replaced rather than edited.

### A patch's `test` operation did not match the document

<!-- covers: internal/compiler/jsonpatch.ErrTestFailed -->

A patch may carry a `test` operation, which asserts what is at a path before the operations after it are applied. The engine refuses the whole patch when the assertion does not hold, which is what makes a conditional patch conditional rather than optimistic: a plugin that tests before it edits is saying it will not touch a document it does not recognise.

Two shapes report under it. There is nothing at the path at all, which the message says. Or there is a value and it is not the one asserted, which is reported as the bare refusal — neither the asserted value nor the one found is quoted.

Emitted messages:
> jsonpatch: test operation failed: no value at path
> jsonpatch: test operation failed

Where a pipeline step's output carried the patch, the refusal arrives beneath that step's failure, naming the step. Where a label-transform plugin's patch carried it, it arrives beneath the label-patch refusal.

**How to fix:** the fault is the plugin's rather than your documents'. A test that expected a value the document does not have usually means the plugin is running against a shape it was not written for — a different provider's output, or a document a step earlier in the same pipeline already changed. Where the patch is yours to correct, either relax the test to what the document actually carries, or make the step's `when` gate skip the case rather than testing for it inside the patch.

### A `workload:` form and the fields beside it do not agree

<!-- covers: internal/compiler/rendercore.ErrPersistentTemplateRequiresStatefulForm, internal/compiler/rendercore.ErrReferenceFormRequiresEndpoint, internal/compiler/rendercore.ErrEndpointRequiresReferenceForm, internal/compiler/rendercore.ErrScheduledFormRequiresSchedule, internal/compiler/rendercore.ErrScheduleRequiresScheduledForm -->

A `workload:` declares a `form:` — the shape of the thing being run, stated in terms every target understands rather than in any one target's vocabulary. Some fields only make sense on one form, and a form declared without the field it needs has nothing coherent to render. Both directions are checked, before any target translates the workload, so the disagreement is reported once against what you wrote rather than once per target in whatever words each target has for it.

Five pairings are enforced, and each reports its own sentence naming both halves and what to write:

> workload declares a persistentTemplate volume but is not form: stateful; declare form: stateful
> workload is form: reference but declares no endpoint; set endpoint to the external host or URL the reference points at
> workload declares an endpoint but is not form: reference; declare form: reference or remove the endpoint
> workload is form: scheduled but declares no schedule; set schedule to a 5-field cron expression or an @-macro (e.g. @daily)
> workload declares a schedule but is not form: scheduled; declare form: scheduled or remove the schedule

Each is positioned at the component instance whose workload was being read, and reported as a translation fault, because the disagreement is between two fields of one authored block.

The conditions they are recorded under, which is what their short codes resolve to, are `persistentTemplate volume requires form: stateful`, `form: reference requires an endpoint`, `endpoint requires form: reference`, `form: scheduled requires a schedule` and `schedule requires form: scheduled`.

**One pairing runs one way only.** A `form: stateful` workload with no per-replica claim template is ordinary and draws nothing — the rule is that a claim template needs the stable per-replica identity only that form gives, not that the form needs a claim template. The other two pairings run both ways, because an endpoint and a schedule each have exactly one form they mean anything on.

**An omitted `form:` reads as `stateless`**, so a workload that declares an endpoint and no form at all meets the endpoint pairing rather than passing unchecked.

**How to fix:** each sentence names the two fields and gives both answers. Add the field the form needs, or change the form to the one the field belongs on, or remove the field where it was left behind by an edit — deleting a `schedule:` value and leaving the key is the shape this attracts most.

### A workload `schedule:` is not an expression the check accepts

<!-- covers: internal/compiler/rendercore.ErrInvalidCronSchedule -->

A `form: scheduled` workload carries a `schedule:` saying when it runs, and the value is checked for structure before any target reads it. Two spellings are accepted: one of the five macros `@hourly`, `@daily`, `@weekly`, `@monthly` and `@yearly`, or a five-field crontab expression whose fields use only digits and the characters `*`, `,`, `-` and `/`.

**What the check does and does not read.** It counts the fields and looks at the characters in them. It does not evaluate ranges, step arithmetic or day-of-week naming, so a five-field expression whose numbers are out of range passes here and is the target's to reject. A six-field expression carrying a leading seconds field is refused: five fields is what this surface accepts, and a target that wants seconds takes them another way.

Emitted message:
> workload schedule is not a valid cron expression; use a 5-field crontab expression (e.g. "0 0 * * *") or one of @hourly, @daily, @weekly, @monthly, @yearly

The condition it is recorded under is `schedule is not a valid cron expression`, which is what its short code resolves to.

**How to fix:** count the fields first — a schedule with four or six of them is the commonest cause, and a stray space inside one field splits it into two. Replace a named day or month with its number, and reach for a macro where one says what you meant.

### A library `$import:` is not written in the bare-name form

<!-- covers: internal/compiler/renderer.ErrArtifactImportShape, internal/compiler/renderer.ErrMappingImportShape, internal/compiler/renderer.ErrWorkloadImportShape -->

Three fields on a Recipe and a FeatureRecipe may take their body from a library instead of writing it in place: an `artifacts.<name>:` entry, a `valuesMapping:`, and a `workload:`. Each writes `$import:` with the library's bare name, then `#`, then the path of the entry on the surface that field reads — `#/artifacts/`, `#/mappings/` and `#/workloads/` respectively. A value that is not in that shape names nothing the build can resolve, and is refused as the field is resolved.

The three fields are deliberate mirrors of one another, so the fault reads the same on all three and only the surface changes:
> artifacts $import: is not a bare-name artifact-library reference (<Library>#/artifacts/<entry>): `"<the value as written>"`
> valuesMapping $import: is not a bare-name mapping-library reference (<Library>#/mappings/<entry>): `"<the value as written>"`
> workload $import: is not a bare-name workload-library reference (<Library>#/workloads/<entry>): `"<the value as written>"`

**A version written with `@` is reported with the spelling to use instead**, rather than falling through to a complaint that the library was not found, because it is the mistake this form attracts most:
> artifacts $import: is not a bare-name artifact-library reference (<Library>#/artifacts/<entry>): version separator is ':', not '@' — use `"<the corrected value>"`

**One further shape reports here, and it is not a spelling mistake.** An ArtifactLibrary bundle's own file body may not itself be an `$import:` of another bundle: one file slot cannot expand into many files, so a nested import is refused rather than resolved into something the author did not write. Compose the bundles at the point they are consumed instead.

An `artifacts:` entry a component's own Recipe writes is decided before anything renders, so the report is positioned at the `artifacts:` block in that Recipe and names the reference, the bundle, the file whose body carries the nested import, and the entry the import was written at. Every file of the bundle in that shape is reported in one build; where more than one is, the findings are grouped under `artifacts entries whose library import the compiler cannot resolve`:
> artifacts $import: is not a bare-name artifact-library reference (<Library>#/artifacts/<entry>) (`"<the value as written>"`, bundle `"<bundle>"`, bundle file `"<filename>"`, artifacts entry `"<key>"`). a bundle file body cannot import another bundle — compose the two at the artifacts entry that consumes them

An `artifacts:` entry a FeatureRecipe writes reports the same condition as the bundle is resolved, naming the first file in that shape:
> artifacts $import: is not a bare-name artifact-library reference (<Library>#/artifacts/<entry>): bundle `"<bundle>"` file `"<filename>"` body is a field-root $import: (nested library import inside a bundle file is not supported; compose at the consumption site)

**A `valuesMapping:` a component's own Recipe writes is decided before anything renders**, so the report is positioned at the `valuesMapping:` key in that Recipe and carries the spelling to use:
> valuesMapping $import: is not a bare-name mapping-library reference (<Library>#/mappings/<entry>) (`"<the value as written>"`). name the library and the entry either side of the fragment — write <Library>#/mappings/<entry>

A `valuesMapping:` a FeatureRecipe writes reports as the reference is resolved, in the form the list above carries.

**A `workload:` a component's own Recipe writes is decided before anything renders**, so the report is positioned at the `workload:` key in that Recipe and carries the spelling to use:
> workload $import: is not a bare-name workload-library reference (<Library>#/workloads/<entry>) (`"<the value as written>"`). name the library and the entry either side of the fragment — write <Library>#/workloads/<entry>

A `workload:` a FeatureRecipe writes reports as the reference is resolved, in the form the list above carries.

**How to fix:** rewrite the value as `<Library>#<entry-path>`, adding `:<version>` after the library name only where you need a floor on which version may be selected. Check the fragment matches the field — an entry path of `#/mappings/…` on a `workload:` names a surface that field does not read, and reports here rather than as a missing entry. The same identity form governs a schema's `$ref:`, whose refusals are documented under "A `$ref:` is not written in a form the compiler can resolve" above.

### A library `$import:` names a library or an entry the catalog does not hold

<!-- covers: internal/compiler/renderer.ErrArtifactLibraryNotFound, internal/compiler/renderer.ErrArtifactLibraryEntryNotFound, internal/compiler/renderer.ErrMappingLibraryNotFound, internal/compiler/renderer.ErrMappingEntryNotFound, internal/compiler/renderer.ErrWorkloadLibraryNotFound, internal/compiler/renderer.ErrWorkloadEntryNotFound -->

An `$import:` is written correctly and what it points at is not there. Six conditions cover the two halves of a reference across the three library kinds, and which one you get says which half to look at: the library itself is absent from what the build can see, or the library is there and does not publish the entry.

The set a reference resolves against is the workspace's own catalog plus the libraries the lockfile pinned and brought in as the build loaded. So a library nothing in the Release's dependency closure declares a dependency on is not in that set, however correct the reference into it reads.

**The library is not there:**
> artifact-library import references an ArtifactLibrary not present in the catalog: ArtifactLibrary `"<library>"` (bundle `"<entry>"`)
> mapping-library import references a MappingLibrary not present in the catalog: MappingLibrary `"<library>"` (entry `"<entry>"`)
> workload-library import references a WorkloadLibrary not present in the catalog: WorkloadLibrary `"<library>"` (entry `"<entry>"`)

**The entry is not there:**
> artifact-library import references a bundle not present in the ArtifactLibrary: bundle `"<entry>"` in ArtifactLibrary `"<library>"`
> mapping-library import references an entry not present in the MappingLibrary: entry `"<entry>"` in MappingLibrary `"<library>"`
> workload-library import references an entry not present in the WorkloadLibrary: entry `"<entry>"` in WorkloadLibrary `"<library>"`

**An `artifacts:` entry a component's own Recipe writes reports a missing bundle in a form of its own.** That entry is decided before anything renders, so the report is positioned at the `artifacts:` block in that Recipe and names the entry the import was written at alongside both halves of the reference:
> artifact-library import references a bundle not present in the ArtifactLibrary (`"<entry>"`, ArtifactLibrary `"<library>"`, artifacts entry `"<key>"`)

**A `valuesMapping:` a component's own Recipe writes reports a missing entry in a form of its own**, for the same reason: it too is decided before anything renders, so the report is positioned at the `valuesMapping:` key in that Recipe and names both halves of the reference:
> mapping-library import references an entry not present in the MappingLibrary (`"<entry>"`, MappingLibrary `"<library>"`)

**A `workload:` a component's own Recipe writes reports a missing entry in a form of its own**, for the same reason: it too is decided before anything renders, so the report is positioned at the `workload:` key in that Recipe and names both halves of the reference:
> workload-library import references an entry not present in the WorkloadLibrary (`"<entry>"`, WorkloadLibrary `"<library>"`)

An `artifacts:` entry a FeatureRecipe writes, a `valuesMapping:` or a `workload:` a FeatureRecipe writes, and every reference to a library the build cannot see, report as the reference is resolved, in the forms the two lists above carry.

Each names both the library and the entry whichever half failed, so one report is enough to tell a missing library from a missing entry without opening anything.

**How to fix:** for a missing entry, check the name against what the library publishes — an entry name is a key in that library's own map, and is case-sensitive. For a missing library, the reference is usually right and the closure is what is short: declare the dependency on that library so it is loaded, and refresh the lockfile so it is pinned. A library reachable in one workspace and not another is the same fault seen from the other side.

### A library `$import:` addresses its library by registry location

<!-- covers: internal/compiler/renderer.ErrHostInLibraryImport -->

A library `$import:` names its library by identity, never by the registry it happens to be published to. Which registry a name resolves through is workspace configuration and which version is used is the lockfile's answer, so a reference carrying a host fixes in a catalog document two things the build is meant to decide — and the document then stops working in any workspace configured differently.

**Where such a reference can still reach this halt is narrower than it looks.** A Recipe's and a FeatureRecipe's own `$import:` fields are refused earlier, by their schema, which admits no registry prefix at any of the three positions. What remains is the reference no schema describes: one read out of a library entry's own body, which the entity consuming it did not write and cannot see until the body is resolved.

Emitted message, from the `valuesMapping:` and `workload:` surfaces, where the resolver reports the value alone:
> library $import: carries a registry host; reference the library by bare-name identity: `"<the value as written>"`

An `artifacts:` entry does not reach this halt, and the reason is worth knowing if you are looking for it there. Its own reference is refused with the rest of the document, like every other position; and unlike the other two surfaces, a bundle file whose body is itself an import is rejected rather than followed — so there is no body a host-bearing reference could arrive from.

**How to fix:** drop the host and everything before the library name, leaving `<Library>#<entry-path>`. Where the offending value is inside a library you consume rather than one you publish, the correction belongs to that library's author; until it lands, importing a different entry or writing the body in place clears the build.

### Two artifact outputs of one Recipe carry the same filename

<!-- covers: internal/compiler/renderer.ErrArtifactOutputCollision -->

A Recipe's `artifacts:` block names one output per key, and a bundle imported at a key contributes its files beneath it. Two outputs arriving at one filename would mean one overwriting the other, so the build stops instead of choosing which survives.

**This is a residue guard, and saying so is part of what it is.** An output is named by the key it was authored under, mapping keys are unique inside one document, and the authoring surface bounds a key to a single filename — so two authored entries cannot collide, and a key cannot spell the nested name another key's bundle produces either. What the guard still covers is content that reached the projection without passing an authored document's own duplicate-key refusal: state assembled while the build runs rather than read from a file. A collision reported here therefore points at how the build was assembled rather than at a line you can see.

It is raised per Recipe over that Recipe's own outputs, which is what separates it from two *different* contributors landing on one path in an assembly — that is "Two contributors write the same output path" above, with a different remedy.

Emitted message:
> artifacts output filename collision: two artifact outputs carry the same filename (Recipe `"<recipe>"`, artifact output `"<filename>"` emitted more than once)

**How to fix:** open the Recipe the message names and check its `artifacts:` keys against the files any bundle it imports contributes. Where the keys are genuinely distinct and the collision still stands, nothing in the document is at fault and the report is worth raising with whoever maintains the build.

### An ArtifactLibrary bundle file leaves the key it was imported at

<!-- covers: internal/compiler/renderer.ErrArtifactLibraryFileEscapesKey -->

An `artifacts:` entry importing a bundle expands into one output per file in that bundle, each nested under the key the import was written at. So the key names a directory and every file the bundle contributes belongs beneath it. A file name that climbs out of that directory, names an absolute location, or names nothing at all does not, and the build stops rather than place the file somewhere the consuming Recipe never chose.

**What it prevents is a silent re-layout rather than a write outside the output directory.** Where the files are written is guarded again, so a name climbing far enough is refused there in any case. The name that survives that guard is the one climbing exactly one level: it lands back inside the output directory, at a position nobody chose. That is worse than a refused write, because every collision guard on this path reads a name as it was composed rather than as it resolves — so two such files can resolve onto one output with nothing reporting a collision, and which one survives is decided by nothing anybody wrote.

**A nested layout inside the key is untouched.** A bundle is free to carry its own subdirectories, and nesting them under the consumption key is what the key is for.

The consuming Recipe and the published bundle are usually written by different authors, so the message names both halves together with the remedy.

An `artifacts:` entry a component's own Recipe writes is decided before anything renders, so the report is positioned at the `artifacts:` block in that Recipe and names the file first, then the library it came from and the entry it is consumed at. Every file of the bundle whose name leaves the key is reported in one build; where more than one is, the findings are grouped under `artifacts entries whose library import the compiler cannot resolve`:
> artifact-library bundle file name leaves the artifacts key its output is nested under (`"<filename>"`, ArtifactLibrary `"<library>"`, artifacts entry `"<key>"`). rename the file inside the ArtifactLibrary bundle so its name stays under the artifacts key it is consumed at

An `artifacts:` entry a FeatureRecipe writes reports the same condition as the bundle is resolved, naming the recipe it was written in and the first such file:
> artifact-library bundle file name leaves the artifacts key its output is nested under (Recipe `"<recipe>"`, artifact `"<key>"`, bundle file `"<filename>"`). rename the file inside the ArtifactLibrary bundle so its name stays under the artifacts key it is consumed at

**How to fix:** rename the file inside the ArtifactLibrary so its name stays under the key. Where the library is not yours, importing a different bundle or writing the entry in place clears the build while the correction is made upstream. A file meant to land somewhere else entirely is a second `artifacts:` entry at the key it belongs under, not a name that walks there.

### An imported artifact no longer matches the digest recorded beside its Recipe

<!-- covers: internal/compiler/renderer.ErrArtifactContentMismatch -->

An `artifacts:` entry that imports a local file has its content pinned when the Recipe is pinned — by `aggrega pin`, or by a pull or a push asked to run the same step: the digest of the file's bytes is recorded in the `entity.lock` beside the Recipe. Every build re-reads the file, digests it again, and refuses the disagreement — so a file edited after it was pinned never renders as though it had been checked. `aggrega pull --verify` makes the same comparison and reports a disagreement with the same message.

**What is compared is the entry's content, not what rendering it produced.** An artifact body is a template, and evaluating it substitutes values that differ per component instance, so a digest over the output would disagree for every instance whose values differ. The recorded content is the same text for every instance that binds the Recipe, which is what makes one recorded digest the right thing to compare against.

**A Recipe nobody has pinned has no pin beside it, and a build does not compare it.** Absence of a pin is not a mismatch to a build; it means there is nothing to compare. A pull over such a Recipe stops instead, as [An entity reads an input the lock beside it records no pin for](#an-entity-reads-an-input-the-lock-beside-it-records-no-pin-for) describes. A lockfile written before the file was edited reports first, because the entity's row covers the imported file too, as [A local source no longer matches the pins recorded beside its Recipe](#a-local-source-no-longer-matches-the-pins-recorded-beside-its-recipe) sets out, where the same section says when this comparison is the one a build meets.

Three surfaces carry the same check over different documents — a component's own Recipe, a Feature attached to a component, and a Feature attached to a boundary — so the FeatureRecipe's content is measured against the digest recorded beside the FeatureRecipe rather than beside the host component's Recipe. On the two attachment surfaces the message names the attachment as well, which is what says which document to open.

Emitted messages:
> imported artifact content does not match the digest recorded for it in entity.lock (`"<artifact>"`, imported file `"<path>"`, its content digests to `"<digest>"`, the recorded pin is `"<digest>"`). If the file was changed on purpose, run `aggrega pin` on the entity that imports it to record its new digest; otherwise restore the file
> imported artifact content does not match the digest recorded for it in entity.lock (`"<artifact>"`, imported file `"<path>"`, its content digests to `"<digest>"`, the recorded pin is `"<digest>"`, attachment `"<attachment>"`). If the file was changed on purpose, run `aggrega pin` on the entity that imports it to record its new digest; otherwise restore the file

**How to fix:** two answers, and which is right depends on whether the edit was meant. Where it was, run `aggrega pin` on the Recipe so the pin is taken again from the file's current bytes, and commit the `entity.lock` it rewrites. Where it was not, restore the file — the recorded digest is the record of the bytes that were pinned, and a build that rendered the changed file would be shipping content nothing verified.

### A local source no longer matches the pins recorded beside its Recipe

<!-- covers: pkg/recipepin.ErrLocalSourceContentMismatch -->

A Recipe or FeatureRecipe whose `source:` names a directory or a file beside it has that source pinned when the entity is pinned — by `aggrega pin`, or by a pull or a push asked to run the same step. The `entity.lock` beside the entity records one digest per file the source contributes to what a publication of the entity carries, keyed by the file's path. Once the lock records them, every build compares the source as it stands with those pins before the provider reads it, and refuses a disagreement — so a chart or a module edited after it was pinned never renders as though it had been checked. `aggrega pull --verify` makes the same comparison and reports a disagreement with the same message. A build names the component instance whose source it was resolving, and the Recipe document beneath it.

**The source is compared as one set of files.** A file whose content moved, a file added to the source and a file removed from it each change what the entity renders from, so each is reported, with the digest the file has now and the digest recorded for it. A file beside the entity that the source does not contribute — a note or a README next to the Recipe — is not compared. A source written as a template, such as `./charts/{{ .values.flavour }}`, contributes every file in the entity's directory, because which directory it names is decided by each Release; for that shape an edit to any file in the directory is reported.

**A Recipe whose lock records no pin for its source has nothing for a build to compare.** A build does not refuse it; a pull or a push that does not pin does, as [An entity reads an input the lock beside it records no pin for](#an-entity-reads-an-input-the-lock-beside-it-records-no-pin-for) describes. Pins a lock still records for a local source the Recipe no longer declares pin nothing it reads, so they are compared with nothing. A Recipe a pull resolved from a registry is covered instead by the digest the lockfile records for what its publication carries.

**A lockfile written before the change reports first.** The lockfile records the entity by what it carries, and the source's files are part of that, so a build or `aggrega pull --verify` holding a lockfile written before a file moved halts before this comparison runs, with [The lockfile no longer matches what the release resolves to](#the-lockfile-no-longer-matches-what-the-release-resolves-to) naming the entity and both digests. A plain `aggrega pull` names the file that moved, with [An entity reads an input the lock beside it records no pin for](#an-entity-reads-an-input-the-lock-beside-it-records-no-pin-for). The same holds for an imported file. **Where the lockfile has no entry of the entity's own, this comparison is what a build and a verifying pull meet:** a Recipe or FeatureRecipe the Manifest names by a reference that is also the name of a Component or Feature the Release reaches is recorded under that reference as the Component or Feature, so nothing in the lockfile moves when the Recipe's files do.

Emitted messages:
> the files of the entity's local source do not match the pins recorded for them in entity.lock (file `<path>` digests to `<digest>` and its recorded pin is `<digest>`). If the source was changed on purpose, run `aggrega pin` on the entity to record its files again; otherwise restore the files
> the files of the entity's local source do not match the pins recorded for them in entity.lock (file `<path>` digests to `<digest>` and no pin is recorded for it). If the source was changed on purpose, run `aggrega pin` on the entity to record its files again; otherwise restore the files
> the files of the entity's local source do not match the pins recorded for them in entity.lock (file `<path>` is no longer in the source and its recorded pin is `<digest>`). If the source was changed on purpose, run `aggrega pin` on the entity to record its files again; otherwise restore the files

**How to fix:** as for an imported file, two answers, and which is right depends on whether the change was meant. Where it was, run `aggrega pin` on the Recipe so its source's files are pinned again, and commit the `entity.lock` it rewrites. Where it was not, restore the files the message names.

### A symbolic link sits among the files an entity carries

<!-- covers: internal/sourcewalk.ErrSymbolicLinkInEntityFiles -->

Every file a publication of an entity carries is read from the entity's own directory, and a symbolic link there is refused rather than followed. Following it would publish the bytes it points to under the link's own name — from wherever it points, outside the entity's directory included — into an artifact that is then digested and, where signing applies, signed. Skipping it instead would publish an artifact whose content silently differs from your directory. So every shape of link is refused the same way: a link to a file, a link to a directory, a link pointing nowhere, a link pointing at itself, and two links pointing at each other.

The refusal is made wherever the entity's files are read: by `aggrega pin`, by a publication before it packs anything (a dry run included), by a pull and a verifying pull holding the `entity.lock` to the entity's files, by a build comparing a local source with its pins, and by a render reading a local source directory before a provider is handed any of it. The message names the link by its path beside the entity document, and the diagnostic is positioned at the link itself.

**A link your ignore rules leave out is not a file the entity carries**, so it is passed over like any other file those rules leave out, and never followed. Those rules are the ones recorded in the `entity.lock` when the entity was pinned, so a line you add to `.aggregaignore` takes effect when you pin the entity again.

Emitted message:
> a symbolic link sits among the files an entity carries (`<path>`). remediation: replace the link with a copy of what it points to, placed inside the entity's own directory. A link met inside a source directory can instead be left out with a line in the .aggregaignore beside the entity, which takes effect when the entity is pinned again. A link is refused rather than followed because the bytes it points to would travel under the link's name, from wherever it points

**How to fix:** where the entity needs what the link points to, replace the link with a copy of it inside the entity's directory, and pin the entity again. Where the link is there for your own convenience and the entity does not read it, add its path to the `.aggregaignore` beside the entity document and pin again. [Which files ship with an entity](../cli/aggrega-pin.md#which-files-ship-with-an-entity) describes the rules that decide what an entity carries.

### An entity reads an input the lock beside it records no pin for

<!-- covers: pkg/recipepin.ErrEntityNotPinned -->

A Recipe or FeatureRecipe can depend on bytes outside its own document: a remote `source:` whose coordinates are written out in full, a file an `artifacts` entry imports with `$import`, and the files of a `source:` that names a directory or a file beside it. The pin for each is recorded in the `entity.lock` beside the entity, and recording it is the entity author's step, `aggrega pin`. So a pull does not record those pins on its own: over an entity in one of your catalog directories that the Release builds, it compares what the step would record with what the lock holds, and stops when the lock is missing a pin — or holds one the input no longer matches — rather than writing into the author's directory unasked. A build that fills its own lockfile is a pull and stops the same way.

**A push stops on the same comparison, over the one entity it is about to publish.** Before the bundle is built, and before any registry is contacted, it compares what the step would record for the entity with the lock beside it, and refuses in the same way — a dry run included — unless the push was asked to run the step itself. What the message suggests at the end differs between the two, because each command has its own ways to have the pins recorded; what it reports does not.

**A local source is held to its pins as one set of files.** Where the lock records none of them, each file the source contributes is reported here as missing. Where it records them, a file added since the pin is reported as missing and a file changed or removed as a pin the input no longer matches, and a build reports the same change as [A local source no longer matches the pins recorded beside its Recipe](#a-local-source-no-longer-matches-the-pins-recorded-beside-its-recipe). Pins a lock still records for a local source the Recipe no longer declares — its `source:` removed, or now naming a remote artifact — pin nothing the Recipe reads, so they stop neither a pull, a push, a verifying pull nor a build; the next `aggrega pin` drops them.

**The message names every input it is missing, by class.** Each is a `remote source`, named by its url and the version it resolved to, an `imported file`, named by the `artifacts` key that consumes it, or a `local source file`, named by its path beside the entity — so you know whether it is a source or a file that needs pinning. Every such entity in the Release is reported in one run.

**An entity resolved from a registry is never held to this by a pull, because its publication already was.** It lives in the content cache rather than in a directory you author, so a pull neither reads nor writes a lock beside it, and its sources are held to the Release's lockfile. An entity published with `aggrega push` was refused at publication unless its lock recorded every pin the step would record for it then, and that lock travels inside the published bundle.

Emitted messages, from a pull and from a push:
> an input the entity reads has no pin recorded for it in the entity.lock beside it (Recipe `"<name>"`, remote source `<url>@<version>`: no pin recorded, imported file `<key>`: the recorded pin no longer matches it). remediation: run `aggrega pin <entity-path>` and commit the entity.lock it writes beside the entity; to have every pull in this workspace record the pins itself instead, set `pin_sources_at_pull: true` in the workspace configuration
> an input the entity reads has no pin recorded for it in the entity.lock beside it (Recipe `"<name>"`, remote source `<url>@<version>`: no pin recorded). remediation: run `aggrega pin <entity-path>` and commit the entity.lock it writes beside the entity; to have this publication record the pins itself instead, re-run it with `--pin-sources`; to have every publication in this workspace record them, set `pin_sources_at_push: true` in the workspace configuration

The publication's middle clause names what the surface you published from accepts: `--pin-sources` at a terminal, the `pinSources` field on the daemon, and the `pin_sources` argument to the assistant tool.

**How to fix:** where the entity is yours, run `aggrega pin` on it and commit the `entity.lock` it writes, then pull or push again — or push with `--pin-sources`, which runs the step before the bundle is built. Where it is someone else's — a catalog you consume from a directory of its own — its publisher has not pinned it yet; set `pin_sources_at_pull: true` in your workspace configuration so every pull records the pins itself, or pass `--pin-sources` to one pull. [`aggrega pin`](../cli/aggrega-pin.md) describes the step in full.

### A `provides:` template could not be evaluated

<!-- covers: internal/compiler/renderer.ErrProvidesEvaluation -->

A `provides:` entry is a template producing the value another component reads through a dependency connection. This condition is what an entry that could not be evaluated reports: a template that does not parse, a function it calls that this surface does not register, a reference that descends through something the render context did not supply, or an `index` read of a key the map does not hold.

It is distinct from the two refusals that run *before* evaluation on the same block — a reference to a root outside the self-contained set, and a reference the block's own author order refuses — both documented above. Those name the expression to change; this one carries whatever the evaluation itself reported, which is why the entry is named beside it.

Emitted message, naming the component instance, the entry inside the block, and what the evaluation reported:
> provides template evaluation failed (node `"<instance>"`, provides[`"<key>"`], `<what the evaluation reported>`)

**How to fix:** open the Recipe's `provides:` block at the key the message names and read the reported reason — it usually names a parse position or a function. Missing-key handling on this surface renders an absent final key as nothing rather than failing, so a failure here is a structural fault: a template that does not parse, a reference descending through a container that was never supplied, or an `index` read of a key the map does not hold, which the reported reason names. Where the value is genuinely optional, read it through the `optional` helper rather than descending into something that may not be there.

### A realizer does not publish a `provides` key its contract declares

<!-- covers: internal/compiler/renderer.ErrProvidesContractUnfulfilled -->

A Component and a Feature each declare, under `schema.provides`, the keys anything binding them will publish — the output contract a consumer writes its connections against. The Recipe bound to a Component and the FeatureRecipe bound to a Feature have to produce every key that contract names. One that does not is refused, because the missing key would otherwise deliver nothing at all: the consumer's reference would arrive as an unset variable, an empty argument, or a file that is not there, with nothing said about why.

**The contract is key presence, and nothing more.** Every declared key has to appear; extra keys are allowed. The values themselves are never inspected — they are opaque pointers piped as strings, so the types a contract declares stay a statement to the consumer rather than a check the build makes.

**Every shortfall is reported.** A Recipe short of three keys raises three findings, each positioned at its own entry in that Recipe's `provides:` block, so all three are corrected from one build. The message names the missing key, the type whose contract declares it, and the instance the Recipe was bound to — the last of which is what tells two findings apart when one Recipe serves several instances of one type.

Emitted message:
> realizer does not publish a provides key its abstract entity's schema.provides contract declares (`"<key>"`, declared by component type `"<type>"`, bound to component instance `"<instance>"`)

The Feature-and-FeatureRecipe pairing reports the same condition through the attachment's own resolution, naming the pair and the key:
> realizer does not publish a provides key its abstract entity's schema.provides contract declares (`<attachment context>`, `<the FeatureRecipe>` does not publish provides key `"<key>"` declared by `<the Feature>`'s schema.provides contract)

There it reports the first missing key in sorted order and stops, so that pairing names one key per build while the Component pairing names all of them. Keys are walked in sorted order either way, which is what makes both the same across runs.

**How to fix:** add the missing key to the realizer's `provides:` block, or remove it from the abstract entity's `schema.provides` where nothing is expected to publish it. A key whose template renders to nothing is still published, with the empty string as its value, so an entry that is present and empty fulfils the contract and does not report here. Where an empty value must stop the build, refuse it in an assertion: a Recipe's assertions read its resolved `provides:` values.

### An assertion stopped the build

<!-- covers: internal/compiler/renderer.ErrAssertionFailed -->

A Component, Feature, Recipe or FeatureRecipe may carry `assertions:` — named templates whose purpose is to refuse an input rather than to produce text. An assertion is the one template surface that registers `fail`, and calling it is what stops the build; the argument is the message its author wrote for whoever meets it.

Assertions are evaluated at two points, so a rule reads the state it is about: those on a Component or Feature run once the catalog has resolved and before anything renders, and those on a Recipe or FeatureRecipe run once the binding is settled and before that binding renders.

**A reference to a key nothing supplies also reports here.** The surface evaluates with strict missing-key handling, precisely so a predicate whose reference rendered as empty cannot compare against nothing and quietly pass — a single typo would otherwise retire the rule the assertion was written to enforce. This is why a plain `default` does not supply a fallback on this surface: the bare reference stops the evaluation before the fallback can run. Gate the reference with `hasKey`, or use the `optional` helper; reading it through `index` halts too, naming the key, as "A template indexes a map with a key the map does not hold" describes.

Emitted message, naming the entity kind and type, the instance, and the assertion, then carrying the message the assertion itself wrote:
> `<entity-kind>` `"<type>"` instance `"<instance>"` assertion `"<name>"`: assertion `"<kind>/<type>/<instance>/<name>"`: assertion failed: `<the message the assertion wrote>`

and where the evaluation failed rather than the predicate:
> `<entity-kind>` `"<type>"` instance `"<instance>"` assertion `"<name>"`: assertion `"<kind>/<type>/<instance>/<name>"` parse: `<what the parse reported>`

**A value declared sensitive does not appear in the message.** Where the assertion reads such a value and its message quotes it, the message reads `<redacted>` in the value's place. Where what the assertion did depended on what the value holds, the message after the failing expression is replaced by `failure text withheld: this template reads a value declared sensitive, and the failure depends on what that value holds`; the halt and its code are unchanged. What counts as declared, and which refusals sit outside this, is at [`vocabulary/compact-form-authoring.md`](../vocabulary/compact-form-authoring.md#what-a-refusal-says-about-a-declared-value) "What a refusal says about a declared value".

**Checked on its own, an entity reports a failed assertion as a warning.** `aggrega validate` given a Recipe's file, the editor's check of that file through `aggrega serve`, and the `validate` tool of `aggrega mcp` given an `entity` build the Recipe around placeholders and schema defaults rather than the values a Release sets, so they cannot tell an assertion waiting on a Release from one that is broken. There, an assertion that calls `fail` — the Recipe's own, or one the Component it implements declares — is reported as a warning carrying the message above, closed by the sentence `A Release must satisfy this assertion before a build of it can pass.`, and the check passes. A reference to a key nothing supplies and an assertion that does not parse are not failed assertions: each is a fault in the assertion's own text, and that check judges it as it judges any other fault. A build always has a Release, and halts on the assertion as described here; see [a failed assertion is a warning](../cli/aggrega-validate.md#a-failed-assertion-is-a-warning).

**How to fix:** the message after the last colon is the assertion author's, and it is the one that says what to change — an assertion is written so that meeting it tells you the answer. Where the report is a missing key rather than the author's sentence, the assertion itself is at fault: correct the reference, or guard it as described above. Where the rule should not apply to this deployment, that is a question about the entity carrying the assertion rather than about your own file.

### A pipeline step addresses documents the node does not have

<!-- covers: internal/compiler/renderer.ErrPipelineTargetNotEmitted, internal/compiler/renderer.ErrPipelineHostScopeUnavailable, internal/compiler/rendercore.ErrPipelinePatchTargetNotStructured -->

A pipeline step addresses a document by a scope and a key. Three conditions cover the ways an address reaches nothing, and each stops the build rather than let a step report success over an edit that never happened.

**The node did not emit it.** A patch names a scope-and-key pair that is not among the documents this node produced:
> node `"<instance>"`: pipeline PATCH targets a document the node did not emit

**There is no host to address.** A step reached for the documents of a host component at a site that stands against none — a component's own pipeline, whose only scope is its own output, or a Feature attached to a boundary rather than to one component. The host scope is empty wherever such a pipeline runs, so an address into it resolves against nothing:
> node `"<instance>"`: pipeline /host operation from a step with no host component

**The document carries no tree to address.** Some units have no structure a path can point into — a binary body, free text, a region the target cannot safely walk. Such a unit is still handed to the step so it can be selected and emitted whole; what it cannot be is patched:
> node `"<instance>"`: pipeline PATCH target is not parseable structured YAML/JSON
> pipeline PATCH target is not parseable structured YAML/JSON (node `"<instance>"`, document `"<key>"`)

Each arrives with the walk's own account of the address beneath it, and each is positioned at the component instance whose pipeline made it.

**Two of the three are also reported ahead of any walk.** Whether a site has host documents at all follows from where the pipeline was written, so a step declaring it operates on host documents at a site that has none is named once the build knows what every plugin declares, without waiting for a node to render — and a Feature attached to a boundary is named alongside the step:
> pipeline /host operation from a step with no host component
> pipeline /host operation from a step with no host component (`"<attachment>"`)

The two readings are a division of one condition rather than the same finding twice: what a declaration can settle is settled from the declaration, and what only the run can see stays with the run — a step declaring its own scope may still return an operation against another.

These three are the build-stopping form of the addressing refusals the pipeline walk itself reports, documented under "A pipeline patch addresses a document the set does not hold, or one with no tree to address" above.

**How to fix:** all three are the step author's rather than yours. For an absent target, patch a document the node does emit, or emit the one you meant in an earlier step and patch it in a later one — a step can read which keys it was handed. For a missing host, move the step to a site that stands against a host component, address the site's own documents instead, or drop it. For a unit with no tree, replace the patch with an emit of the whole unit: an opaque body is replaced rather than edited.

### A pipeline patch addresses output that has not been assembled yet

<!-- covers: internal/compiler/renderer.ErrPipelinePatchPreAssembly -->

Some providers fold a dispatch group's per-node output into one document — a merged compose file, an umbrella chart. Until that merge happens there are no discrete documents, only fragments, so a patch addressing one has nothing to point into. A pipeline against such a component is therefore deferred whole and replayed once the merge has produced the documents, which is the ordinary path and needs nothing from the author.

This condition is what reaches the build when a patch arrives at a fragment anyway. The case it names is an attached Feature's own output. Where the component's provider folds its group, the whole of the attachment's pipeline is held back until the merge has produced the documents — and what that replay is handed is the *component's* documents alone. A step against the Feature's own output is offered only while the component renders, which is before any merge has happened, so it has nothing to address. That holds however the Feature's own output travels: whether it joins the merge or is written as documents of its own, its own scope is never the scope the replay carries.

**Emitting is never affected.** An emit adds a document rather than editing one, and runs per node for every provider, so it is outside this entirely.

The condition is reported ahead of any walk, from what the plugins and providers declare, and again as a floor while a node renders. Emitted messages:
> pipeline PATCH targets an assembler provider's pre-assembly fragments (`"<attachment>"`)
> pipeline PATCH targets an assembler provider's pre-assembly fragments (node `"<instance>"`, `<scope>`-scope document `"<key>"` is rendered by an assembler provider). the post-assembly phase re-runs this PATCH once the documents are discrete

**How to fix:** address the component's documents instead of the Feature's own, which is the form that is replayed after the merge; or put the component on a provider that does not fold its dispatch group; or drop the step. Which of the three is right depends on what the step was written to change, and the message names the scope it addressed so you can tell. Changing the FeatureRecipe's own `capability:` is not among them: it does not change which scope the replay after the merge is handed, and that is what this condition is about.

### A pipeline step's plugin does not claim the provider rendering what it addresses

<!-- covers: internal/compiler/renderer.ErrPluginProviderIncompatible -->

A plugin used by a pipeline step may declare the providers it has been tested against. That list is an explicit claim rather than an implicit "anything similar": running a plugin against a provider it does not name risks a patch written for another output shape, so the build stops instead of trying it.

**Which provider a step is matched against is the one rendering the documents that step addresses** — the component's own provider for a step against the component's documents, and the Feature's own provider for a step against the Feature's. At a Feature attached to a component both arise, and they are two different values from two different documents.

**An empty or absent claim list matches nothing**, so every step using such a plugin reports here. A plugin the build could not *ask* is a different case and does not: an unobtainable self-report is the absence of a claim rather than an empty one, and such a step stops with the resolution, load or self-report failure itself, which is the thing to repair.

It is reported once the build knows what every plugin declares about itself, ahead of the run that would invoke the step, and once per authored step rather than once per build — so an author sees every offending step of a pipeline from one build. Provider names are matched exactly.

Emitted messages, the first from a component's own pipeline and the second from a Feature's, which names the attachment as well:
> pipeline plugin is not compatible with the rendering provider (`"<provider>"`)
> pipeline plugin is not compatible with the rendering provider (`"<attachment>"`, `"<provider>"`)

**How to fix:** the finding is positioned at the authored step, and the provider it names is what the declaration has to be reconciled against. Where the plugin is yours, add the provider to the compatibility it declares once you have tested against it. Where it is not, select a plugin version that claims the provider, render that scope through a provider the plugin does claim, or drop the step.

### A provider refused a node's input

<!-- covers: internal/compiler/renderer.ErrProviderNodeInputInvalid -->

A provider may check the input it is handed for a component before rendering it, and report what it finds. Findings at halt severity stop the build; findings at warning and information severity are surfaced alongside the build's output and change nothing about the bytes emitted.

This is the provider's own reading of your input rather than the compiler's, so what it objects to and how specifically it says so are the provider's to decide. The compiler names the component and the provider, and carries the provider's messages as they were returned; where a provider reported several, they arrive together separated by semicolons, so one build tells you about all of them.

The same routing is used whether the input belongs to a component's own Recipe or to an attached Feature, so a provider's check reads identically on both.

Emitted message:
> provider rejected node input: node `"<instance>"`, provider `"<provider>"`: `<the provider's messages>`

**How to fix:** read the provider's messages — they name what in the resolved input it could not accept. The input is assembled from the Recipe's values and the component's own configuration, so the correction is usually in one of those; the provider's own reference page says what it requires. Where the provider is objecting to something you cannot change from a document, that is a question for whoever authored the Recipe or the plugin.

### A provider rendered the same input twice and produced different output

<!-- covers: internal/compiler/renderer.ErrRenderNondeterministic -->

Given identical input, a build produces identical output — that is the contract review tools and deployment tooling read a build's result against. An opt-in build mode checks it directly: each component is rendered twice from the same input and the emitted bytes are compared. A provider whose two renders disagree carries state across the two, or is otherwise not a function of its input, and the build stops.

**The ordinary build renders each component once**, so this condition is only ever met in the checking mode. Nothing about a normal build changes for it being available.

What is compared is the provider's raw emitted output — the same bytes the rendered artifacts are carved from — so a difference anywhere in what it produced is caught rather than only a difference that survives into a final file.

Emitted message:
> rendering node `"<instance>"`: node `"<instance>"` (provider `"<provider>"`): two renders of identical input produced different output: provider render is not deterministic

**How to fix:** first find what differs between two builds of the component the message names — build it twice and compare the outputs. Where the difference is a value a chart you source generates afresh on every render — a random password, a generated key, a timestamp in a Secret or a ConfigMap — the fault is in that chart's output rather than in the provider, and you can clear it yourself in one of two ways. Supply the value, through whatever setting the chart offers for it, from the Recipe's `valuesMapping:`, so the chart stops generating it. Or, where the generated document is one the Release must not ship — a Secret the operator supplies separately, say — leave it out of the build with an `omits:` entry on the Recipe; see [Recipe → The `omits:` field](../entities/recipe.md#the-omits-field--leaving-rendered-documents-out-of-a-source). Otherwise the fault is the provider's rather than your documents', and nothing you can write clears it. Report it to whoever publishes the plugin serving that provider, naming the component the message identifies — the usual causes are a timestamp, a random value, or an ordering that follows a map's iteration rather than the order the author wrote. Until it is fixed, the ordinary build mode is unaffected, and pinning the plugin to a version that passed is the practical answer.

### An omits entry left out nothing the source rendered

<!-- covers: internal/compiler/renderer.ErrOmitMatchedNothing -->

Every entry of a Recipe's or a FeatureRecipe's `omits:` list that applies to a build — its `when:` absent, empty or true — must leave at least one thing the source rendered out of the output: a document a chart renders, a service, a volume or a config a compose file declares, or a resource a CloudFormation template declares. The provider rendering the source matches each entry against what it rendered and reports how many units each left out; an entry that left none out stops the build.

An entry that matches nothing is a statement about the source that is no longer true. The usual cause is a source upgrade that renamed or removed what the entry names — and a renamed document or service is then in the output under its new name, which is exactly what the entry was written to keep out — and the other is a mistake in the entry itself. Passing over it would ship what the entry was meant to leave out, so the build stops and names the entry.

The message names the node, the provider, the document declaring the entry and the entry's position in that document's `omits:` list, counting from `0`, and the kind, name and namespace the entry resolved to, the namespace only where the entry names one. For a FeatureRecipe attached to a component the node is that component; for one attached to a boundary, the line above the message names the attachment and its boundary. Where several entries matched nothing, the first in the order you wrote them is the one named, so the same entry is named on every run. A field whose template read a value declared sensitive is shown as `<redacted>` rather than as what it resolved to. An entry its `when:` dropped is never handed to the provider and never checked.

Emitted message. The category reaches you in the bracketed head:

> an omits entry left out nothing the source rendered (node `"<node-id>"`, provider `"<provider>"`, `"<document>"` omits[`<position>`], kind `"<kind>"`, name `"<name>"`, namespace `"<namespace>"`). correct the entry so it names something the source renders, or remove it; a source upgrade that renamed or removed it is the usual cause

The head carries this condition's short code, `E0334`.

**How to fix:** compare the entry with what the source renders now — build with the entry removed and read what the component renders — then correct the entry's kind, name or namespace, or remove the entry where what it named is gone. For a chart, an entry names a document by the document's own `kind`, `metadata.name` and, where the entry names a namespace, the namespace the document is in; for a compose file, it names a `service`, a `volume` or a `config` by its key; for a CloudFormation template, it names a resource by its `Type` and its logical ID, in any of the source's templates. See [Recipe → The `omits:` field](../entities/recipe.md#the-omits-field--leaving-rendered-documents-out-of-a-source).

### A provider's omitted counts do not match the omits entries it was handed

<!-- covers: internal/compiler/renderer.ErrOmitReportMismatch -->

A provider that declares it leaves rendered units out reports, for every `omits:` entry it was handed, how many units that entry matched — one count per entry, in the order the entries were handed over. A report that is missing, holds too few or too many counts, or holds a count below zero leaves no way to tell whether an entry left anything out at all, so the build stops. Nothing you wrote causes this: it reports a provider whose returned output does not keep the contract it declares.

Emitted message. The message names the node and the provider, then how many entries were handed over and what came back — either how many counts, or the count below zero and the entry it was given for:

> a provider's omitted counts do not match the omits entries it was handed (node `"<node-id>"`, provider `"<provider>"`, handed `<n>` omits entries, returned `<m>` omitted counts)

The head carries this condition's short code, `E0336`.

**How to fix:** report it to whoever publishes the plugin serving that provider, naming the component the message identifies. What a provider owes is set out in the plugin contract under [Leaving rendered units out](../plugins/plugin-contract.md#leaving-rendered-units-out).

### Assembled output still carries a cross-boundary placeholder

<!-- covers: internal/compiler/renderer.ErrOrphanCrossBoundaryLinkSentinel -->

Where a dependency connection crosses between two assembled outputs, the value it carries cannot be known while the consuming side is rendered — it is published by the other side and resolved once both have been assembled. So the build writes a placeholder into the consuming component's input, and the provider replaces it with its own form of cross-reference once the assembly exists.

This condition is what a placeholder that survived that replacement reports. Surviving means the resolution never reached it: the value landed somewhere the provider could not address — spliced into a larger string rather than standing as a whole value, most often — or a crossing was stamped with nothing on the other side to resolve it. A placeholder is never valid output, so the build stops rather than ship a file containing one.

The message names the provider that wrote the file and the path the file stands at: a path is unique only within one assembly, so the two together are what identify one file. Every offending file is reported rather than the first, and each is reported once however many boundaries fed the assembly it stands in. It is reported against the Release document as a whole rather than against a boundary inside it — the fault is in the translation rather than in anything you wrote, so no boundary declaration is the thing to change.

Emitted message:
> assembled output retains an unresolved cross-boundary link placeholder (`"<provider>"`, `"<output-path>"`)

**How to fix:** the commonest cause is a value the consuming side interpolated into a longer string. A cross-reference has to stand as the whole of the value it is injected as, so change the Recipe's mapping to deliver it whole and compose around it in the target's own vocabulary instead. Where the value stands whole and the placeholder still survives, the fault is on the provider's side of the resolution and belongs to whoever publishes that plugin.

### A provider named a directory for a contributor that is not one directory

<!-- covers: internal/compiler/renderer.ErrNestSegmentNotOneDirectory -->

A provider that places each contributor under its own position inside one enclosing output declares the directory those positions sit under, and the build composes each component's identity into it. The value has to name exactly one directory: a value carrying a path separator, or naming the current or the parent directory, would place a component's files somewhere other than beneath its own position — either outside the assembly altogether or silently rearranged inside it.

The build stops rather than compose such a path. The message names the provider that declared the value and the value itself, so it is clear which provider to change and what it declared.

**A provider that declares no such directory is unaffected.** Each contributor then sits directly at the deployment directory under its own name, so declining to name an enclosing directory is a legitimate answer rather than an omission.

Emitted message:
> provider named a directory for each contributor's own sub-directory that is not a single directory name: provider `"<provider>"` declared nest_segment `"<value>"`; the value must name one directory, carrying no path separator and naming neither the current nor the parent directory

**How to fix:** nothing in any catalog document produces this value, so there is nothing in your own files to correct — it comes from the plugin serving the provider. Report it to whoever publishes that plugin, quoting the value the message names. Where the plugin is yours, declare a single directory name, or declare none and let each contributor sit at the deployment directory.

### A boundary-scope Feature is attached only to a component

<!-- covers: internal/compiler/renderer.ErrBoundaryScopeAttachmentNotDeclaredAtABoundary -->

A FeatureRecipe may declare that it generates once for a boundary rather than once for each component — one shared resource for everything the boundary holds, instead of one per component. The boundary is therefore where such an attachment has to be written: an attachment of that name written only against a component names no scope for the recipe to generate for, so nothing decides which boundary it would run at, which values it would read, or where its output would be written.

**Writing it on a component as well is ordinary and is not reported.** An attachment declared at a boundary reaches every component that boundary holds, including those in scopes nested inside it, so carrying it is the normal shape. What is checked is whether the component's own scope or one enclosing it declares the name — the search walks outward from where the component sits and stops at the first scope that does. A component restating at itself an attachment its enclosing scope already declares renders exactly as the scope-only form, and is admitted for the same reason.

**A component placed in no scope has nothing to walk**, so a boundary-scope attachment on it is reported here — which is the honest reading, since there is no scope such a recipe could generate for.

Emitted message, naming the attachment and the scope the component sits in:
> attachment binds a FeatureRecipe with executionScope: boundary and no boundary holding the component declares it (`"<attachment>"`, on a component in boundary `"<boundary>"`)

and for a component in no scope, which contributes no such value:
> attachment binds a FeatureRecipe with executionScope: boundary and no boundary holding the component declares it (`"<attachment>"`)

**How to fix:** declare the attachment under `features:` on the boundary it should generate for — the scope the component sits in, or one enclosing it — rather than only on the component. Where per-component generation was what you meant, attach a Feature whose FeatureRecipe does not declare the boundary scope instead.

### The sandbox refused a plugin

<!-- covers: internal/wasm.ErrWasmManifestRejected -->

Every plugin reports what it is and what it needs before it is allowed to do any work, and the sandbox reads that report against what it is prepared to grant. This condition covers the whole class of report the sandbox will not accept, and the sentence says which part of it was refused: a version of the plugin interface the host does not speak, a kind of plugin the host has no vocabulary for, a plugin asking for outbound network access or filesystem access, a plugin naming a host call outside the set the host offers or importing from a namespace outside the set it admits, a missing or malformed export, a field carrying a value outside the set it is closed to, or a self-report that is not readable at all.

The refusal happens before the plugin runs, and a refused plugin is shut down before the failure travels, so nothing it asked for is granted even briefly.

**Some of what a plugin cannot have is not checked here because it is never granted.** The host gives a guest a frozen clock, no filesystem, no environment, and nowhere for its own output to go, so a guest that tries to reach any of them fails at the attempt rather than being refused up front. What this condition covers is the report the plugin makes about itself, checked before it starts.

**Emitted messages.** The condition's sentence closes each one, and what precedes it names the plugin and the part of its report that was refused. An interface version the host does not speak:
> plugin `"<plugin>"` declares abi_version `"<declared>"`; host speaks `"<supported>"`: wasm: plugin rejected by the sandbox

a kind of plugin the host has no vocabulary for:
> plugin `"<plugin>"` declares unknown plugin_type `"<declared>"`: wasm: plugin rejected by the sandbox

a self-report that cannot be read:
> wasm: plugin `"<plugin>"` describe() output is not valid JSON: `<what the read reported>`: wasm: plugin rejected by the sandbox

a plugin missing the export its kind requires, named from the same registry the kind itself is read from:
> `<kind>` plugin `"<plugin>"` declares no `"<export>"` export: wasm: plugin rejected by the sandbox

a field closed to a fixed set, carrying something else — the same shape covers the assembly mode, and the per-export operates and scope fields:
> plugin `"<plugin>"` export `"<export>"` declares unknown scope `"<declared>"` (want `"own"`, `"host"`, or empty): wasm: plugin rejected by the sandbox

a paired capability declared without both its exports, or the exports without the claim:
> plugin `"<plugin>"` declares the cross-boundary linking capability but does not export both `"link_publish"` and `"link_resolve"`: wasm: plugin rejected by the sandbox

a capability name a Recipe could never select — a provider serving a name containing a colon, or a pipeline step compatible with one — because a Recipe's `capability:` is read as the name up to its last colon and a version pin after it. A parser's `parse:<format>` and an importer's `import:<format>` are not refused: the colon is part of those names, and they are looked up by format rather than through a Recipe. The same refusal stops such a plugin's entity from being generated for publication:
> plugin `"<plugin>"` (plugin_type `"provider"`) serves the capability `"<name>"`, which contains a colon; a Recipe's capability reference is read as the capability up to its last colon and a version pin after it, so no Recipe can name `"<name>"`: report the capability name without a colon: wasm: plugin rejected by the sandbox

and the host calls a plugin claims against the ones its binary actually uses, which is checked in both directions so a plugin can neither advertise a surface it does not use nor hide one it does:
> plugin `"<plugin>"` declares host function `"<name>"` in describe() that its wasm does not import: wasm: plugin rejected by the sandbox
> plugin `"<plugin>"` imports host function `"<name>"` that its describe() does not declare: wasm: plugin rejected by the sandbox

**How to fix:** nothing in your entity files causes this and no authoring change clears it — the report being refused is the plugin's own. Where you consume a published plugin, report the message to whoever publishes it and select a version the host accepts in the meantime. Where the plugin is yours, the message names the field and both values, so the correction is the one the sentence points at: speak the interface version the host speaks, declare a kind it knows, keep every field inside the set it is closed to, declare the export your kind requires, and declare exactly the host calls your binary uses — no more, and no fewer.

### A plugin is not the kind of plugin the socket expects

<!-- covers: internal/wasm.ErrWasmPluginTypeMismatch -->

Each attachment point states what kind of plugin it dispatches to, and every plugin reports its own kind. This condition is what a disagreement between the two reports: a plugin serving a provider attached where a linter is expected, a parser attached where an importer is expected, a plugin that is not a terminal command run as one. The check happens as the plugin loads, so a plugin of the wrong kind never reaches the work it would have been asked to do.

The reason it stops rather than trying anyway is that the kinds do not share an interface. A plugin of another kind would be called through exports it does not have, and what came back would be read against a shape it never produced.

**Reading a plugin's self-report without asserting a kind is not affected.** A surface that only wants to know what a plugin says about itself — listing what is configured, generating an entity for one — states no expectation, and this check is skipped there.

Emitted message, naming the plugin and both kinds, with the expected kind given in words as well as in its declared value:
> wasm: plugin `"<plugin>"`: expected a `<kind in words>` plugin (plugin type `"<expected>"`) but its describe() reports plugin type `"<reported>"`: wasm: declared plugin type does not match plugin describe()

**How to fix:** attach a plugin of the kind the attachment point takes — the message names the kind expected. Where the plugin is the one you meant, the attachment is in the wrong place: move it to the surface its kind belongs to. Where you author the plugin and it should be the expected kind, it is reporting the wrong one about itself, and that is a correction in the plugin rather than in the configuration attaching it.

### A plugin failed while it was running

<!-- covers: internal/wasm.ErrWasmGuestPanic -->
<!-- covers: internal/wasm.ErrWasmPluginExited -->
<!-- covers: internal/wasm.ErrWasmGuestError -->

A plugin that was asked to do something did not come back with a result. Three conditions cover this, and what separates them is only how the failure travelled — a plugin that crashed, a plugin that stopped its own execution, and a plugin that ran to the end and reported that it could not do what was asked. They are one taxonomy deliberately, so that a build treats every way a plugin can fail alike.

**A plugin that crashed.** Most faults inside a plugin — an unreachable instruction, a division by zero, a read outside its memory — are turned into ordinary failures on the way out and never reach this condition. It is the net behind that path, for a crash that escapes it.

**A plugin that stopped its own execution.** A plugin asking to exit is doing something the plugin model does not have a use for: a plugin returns its result through the call it was made with, not by exiting. Its own execution stops; the build process is untouched.

**A plugin that reported a failure.** The result envelope a plugin returns has a place for it to say it could not complete, and a message that says so is carried through as a failure rather than read as a result.

**Emitted messages**, each naming the plugin or the export and carrying whatever the failure supplied. A crash carries the recovered value:
> wasm: guest plugin `"<plugin>"` panicked in `<export>`: `<the recovered value>`: wasm: guest plugin panicked during call

a self-stopped plugin carries the code it stopped with:
> wasm: plugin `"<plugin>"` call to `<export>` invoked proc_exit(`<code>`): wasm: plugin invoked proc_exit

and a reported failure carries the plugin's own message:
> call `"<export>"`: wasm: guest plugin reported an error: `<the plugin's message>`

**How to fix:** nothing in your entity files causes any of the three, and no authoring change clears them — each is a fault inside the plugin. Report the message to whoever publishes it, naming the export it identifies, and pin the plugin to a version that worked while it is corrected. Where the plugin is yours: return a failure on the result envelope rather than crashing or exiting, so the build gets a message it can show; and where the reported failure is the plugin's own considered answer, its message is what a reader will see, so it is worth saying what about the input it could not accept.

### A plugin returned something that is not the shape the socket reads

<!-- covers: internal/wasm.ErrWasmOutputShape -->

Every attachment point reads the result it gets back against the shape it expects, and refuses anything else — a field the shape does not declare, a field whose value is not the type declared for it, or bytes that are not a well-formed result at all.

**It refuses rather than reading what it can, and the reason is that reading what it can would be silent.** Which export an attachment calls can be chosen per attachment, so an attachment can name an export whose result is a different shape entirely. Skipping the parts that do not fit yields an empty result — and an empty result is itself a legitimate answer: no verdict returned, no finding raised. The two would then be indistinguishable, and a build would carry on exactly as though the plugin had approved it.

Emitted message, naming the export the result came back from and carrying the reason the read failed — together they identify the export the attachment should have named:
> call `"<export>"`: wasm: guest plugin returned an output that is not the shape the socket reads: `<what could not be read>`

**How to fix:** check the entry function the attachment names against the exports the plugin declares — an attachment pointed at the wrong export is the common cause, and the reason in the message names the field that does not belong. Where the export is the right one, the plugin is returning a shape the attachment point does not read, which is a correction in the plugin; report it to whoever publishes it, quoting both the export and the reason.

### A plugin returned a diagnostic at a severity that is not declared

<!-- covers: internal/wasm.ErrWasmDiagnosticSeverity -->

A plugin may return observations alongside its result, and each carries a severity from a closed set: one that stops the build and names what to fix, one that is shown beside a build that still completes, and one that records the observation and changes nothing. A severity outside that set is one the host has no route for, and the build stops.

**It refuses rather than choosing a route, and both alternatives are worse.** Passing over an observation it cannot route would treat it as nothing to do — which, where the plugin is deciding whether to accept the build, reads as approval: an objection the plugin raised would let the build through without ever being shown. Treating it as the stopping severity would reject a build on a value nobody chose. Both are silent, so the host says the value is wrong and the plugin is corrected instead.

The check runs once, where the result is read, rather than at each place an observation is later shown — which is also the only point at which the plugin's identity is still to hand, since an observation folded into a report no longer knows which plugin raised it.

Emitted message, naming the plugin, the export, which observation was at fault, its value, and the values that are declared:
> plugin `"<plugin>"` call `"<export>"`: wasm: guest plugin returned a diagnostic whose severity the contract does not declare: diagnostic `<index>` has severity `"<value>"`; the declared severities are `"halt"`, `"warn"` and `"info"`

**How to fix:** nothing in your entity files causes this — the value came from the plugin. Report it to whoever publishes the plugin, quoting the value the message names. Where the plugin is yours, emit one of the three declared severities; the message names them, and the index tells you which observation to look at.

### A provider returned two output files under one path

<!-- covers: internal/compiler/renderer.ErrProviderRenderDuplicatePath -->

A provider returns its output as a list of files, each naming the path it is written at. The host collects them keyed by path and writes each file's bytes verbatim, running no serializer of its own. Two files naming the same path leave that collection with two values for one key.

**It refuses rather than choosing one, because neither choice can be told from the other afterwards.** Keeping the last discards a file the provider said to write; keeping the first discards a later one. Either way the output on disk is well-formed and short by one file, with nothing recording that a file was dropped — and the path that survived is the path that would have survived anyway, so nothing about the result says a collision happened. Which of the two was meant is a question only the provider can answer.

It is raised wherever a provider returns files: rendering one node, and assembling a dispatch group's output into one artifact. The condition and the fix are the same on both, so both report it.

Emitted message, naming the path returned twice and the node or dispatch path it was returned for:
> provider guest returned two output files under one path; a conforming guest returns each output path at most once (path `"<path>"`, node `"<node>"`)

**How to fix:** nothing in your entity files causes this — the paths came from the provider. Report it to whoever publishes it, quoting the path the message names. Where the provider is yours, return each output path at most once: build the path list against a set so a second file at one path is caught where it is produced, and give the second file a distinct path if both are wanted.

### A provider reported a render fact whose value is not a list

<!-- covers: internal/compiler/renderer.ErrProviderRenderFactNotList -->

A provider may report facts about the output it rendered beside its files — a name and a value each, in that provider's own documented vocabulary — and the Features attached to a component read them from their templates. Every fact's value is a list, even when it holds one entry: one name can be reported by more than one render of a component, its own provider calls and the renders of the Features attached to it, and the lists are joined into one under that name for the templates that read it. A provider cannot know when it renders whether its report will be the only one under a name, so a value that is an object, a string, a number, a boolean or `null` is refused where the provider hands it over, for every render, whether or not any template reads the fact.

Emitted message, naming the fact, the node it was reported for, the provider that reported it, and what the value was:
> provider guest reported a render fact whose value is not a list; a conforming guest reports every render fact's value as a JSON array, even with one entry (fact `"<fact>"`, node `"<node>"`, provider `"<provider>"`, its value is `<kind>`)

**How to fix:** nothing in your entity files causes this — the value came from the provider. Report it to whoever publishes it, quoting the fact the message names. Where the provider is yours, report that fact's value as a JSON array — a single object becomes a list holding that object — and document it as a list in the facts your provider reports; see [Reporting facts about what a guest emitted](../plugins/plugin-contract.md#reporting-facts-about-what-a-guest-emitted).

### A provider's link wiring names an output file that was never emitted

<!-- covers: internal/compiler/renderer.ErrLinkPatchFileNotEmitted -->

When a connection crosses between two dispatch groups, the provider on each side is asked to wire it: the consumed end publishes an identity, the consuming end resolves against it, and each may return structural wiring to apply to its own group's output. Each piece of wiring names the output file it applies to. A later pass carves that file, applies the operations, and reassembles it byte-faithfully.

**A name that matches no emitted file leaves that pass nothing to carve, and it refuses rather than passing the wiring over.** The operations it carries are what resolves the connection, so dropping them leaves assembled output referencing an endpoint that nothing wired — which fails at deploy time, far from the provider that caused it, and looks like a mistake in the connection rather than in the wiring.

The files a piece of wiring may name are the files that group's own render returned. They are handed to the provider on the same call, so the provider never has to guess a name: it selects one from the set it was given.

Emitted message, naming the file the wiring asked for and the endpoint it was returned for:
> link patch names an output file the dispatch group did not emit; a conforming link patch names a file the group's own render returned (file `"<file>"`, node `"<node>"`)

**How to fix:** nothing in your entity files causes this — the name came from the provider. Report it to whoever publishes it, quoting the file the message names. Where the provider is yours, name the file from the assembled files the call hands you rather than from a name built independently — a path composed by hand goes stale the moment the render that produces it changes, and this is what that looks like.

### A pipeline step's file emission carries no file

<!-- covers: internal/compiler/renderer.ErrPipelineEmitFileAbsent -->

A pipeline step may emit a new document alongside the ones it patches. Each emission declares its kind, and an emission of the file kind carries the file it writes: the path, and the content.

**Here the kind is right and the file is absent**, so the step declared an intention its reply does not carry out. That is the difference between this and the undefined-kind halt below: the host knows exactly what to do with an `emit_file` emission and has nothing to do it to.

**It refuses rather than emitting nothing, because an emission that quietly contributed no file would be invisible.** A step that emits a document is often the whole reason it is in the pipeline, and its output is a file that was not there before — so a build that skipped it would produce output missing a document, with the step reporting that it ran.

Emitted message, naming the node and which of the step's emissions was at fault:
> emit_file side effect carries no file; a conforming emit_file side effect carries a file with its path and content (node `"<node>"`, side effect `<index>`)

**How to fix:** nothing in your entity files causes this — the reply came from the plugin. Report it to whoever publishes it, quoting the index the message names. Where the plugin is yours, populate the file member on every `emit_file` emission, with both its path and its content; the index says which emission of that step's reply to look at.

### A pipeline step declares an emission kind the contract does not define

<!-- covers: internal/compiler/renderer.ErrPipelineSideEffectKindUndefined -->

Each emission a pipeline step returns declares its kind, and the contract defines two: one writes a file, one contributes a custom-resource document. The kind is an open string on the wire, which is what lets a later kind be added without breaking existing plugins.

**That openness is exactly why an undefined kind refuses rather than being passed over.** A value the host does not define cannot be told apart, by its shape alone, from one a later version will define — so a host that skipped it would silently drop whatever the step meant by it, on every build, while the step reported success. Refusing keeps the extension point open without making it a hole: a kind this build does not define is reported as undefined, quoting the value the step sent, rather than accepted and ignored.

Emitted message, naming the node, which emission was at fault, and the kind it declared:
> side effect declares a kind the plugin contract does not define; a conforming side effect declares emit_file or emit_crd (node `"<node>"`, side effect `<index>`, kind `"<value>"`)

**How to fix:** nothing in your entity files causes this — the value came from the plugin. Report it to whoever publishes it, quoting the kind the message names. Where the plugin is yours, declare one of the kinds the message lists; a misspelling of a defined kind is the common cause, and the value quoted back is what you sent.

### A provider's reassembly is handed a unit its own carve never produced

<!-- covers: internal/compiler/rendercore.ErrPipelinePatchUnitNotCarved -->

A provider whose output shape cannot be addressed directly may carve it for itself: it splits an output file into addressable units, each under a token, and hands them back. A pipeline step then addresses a unit by that token, and reassembly splices the edited units back into the file byte-faithfully. The two halves are one contract — the tokens a file is carved under are the tokens its reassembly resolves.

**When reassembly is handed a token the carve of that same file did not produce, there is no byte range for the edited content to go back into.** It refuses rather than dropping the unit, because a dropped unit yields a file that is well-formed and missing an edit a step was asked to make: nothing failed, nothing is malformed, and the edit is simply absent.

The two halves can only disagree where they are split — a codec that carves for itself and borrows the standard structural reassembly for the rest. Carving under one set of tokens and reassembling against another then produces exactly this. A codec that owns both halves cannot reach it: its own reassembly answers for its own tokens.

Emitted message, naming the token that resolved to nothing and the file it was named against:
> reassemble names a patched unit token the carve did not produce; a conforming codec carves and reassembles a file under the same tokens (token `"<token>"`, file `"<file>"`)

**How to fix:** nothing in your entity files causes this. Where the provider is yours, make the tokens one half produces the tokens the other resolves: derive them once and carry them, rather than deriving them independently on each side, and where the carve rewrites a file before splitting it, reassemble against the same rewritten form. Where the provider is not yours, report it to whoever publishes it, quoting the token the message names.

### A workload declares a form compose cannot express

<!-- covers: internal/wasm.ErrPluginCannotExpressInput -->

The compose provider renders long-running services. A workload declaring that it runs one copy per machine, that it runs on a schedule, or that it runs once and finishes has no clean single-machine equivalent, so the render stops rather than emit a plain service — which would start it, keep it running, and misrepresent what was asked for.

Emitted message. The condition names the kind of failure — a provider with no expression for something the build declares — and the provider's own sentence names the form it was given:
> a plugin has no expression for a construct this build declares
> compose: workload form `"<form>"` has no compose mapping; compose supports stateless and stateful only: compose cannot express this workload form

**How to fix:** where the target genuinely is a single-machine compose environment, express the work as a long-running service — the stateless and stateful forms are the two it renders. Where the form is what you meant, render that boundary through a provider whose target has an equivalent: a per-machine copy, a scheduled run and a run-to-completion job all have direct expressions elsewhere, and the choice of provider is the boundary's rather than the workload's.

### A container declares a field compose has no primitive for

<!-- covers: internal/wasm.ErrPluginCannotExpressInput -->

Two container fields have no compose equivalent, and both stop the render rather than be dropped.

**Hooks that run when a container starts or is about to stop.** compose has nothing that runs them, and a hook that is quietly not run is a correctness surprise that surfaces at run time rather than at build time.

**Bulk environment drawn from a named object.** compose can read variables from a file, but a reference to an object is not a file — reinterpreting one as the other would change what the container is given without saying so.

Both are checked for ordinary containers and for containers that run before the main one, so the same field halts wherever it is declared and the message names which container it came from.

**Emitted messages.** Both report the same condition — a provider with no expression for something the build declares — and the provider's own sentence is what says which field:
> a plugin has no expression for a construct this build declares
> compose: node `"<node>"` declares container lifecycle hooks; compose has no lifecycle-hook primitive: compose has no lifecycle-hook primitive; container declares lifecycle hooks

> a plugin has no expression for a construct this build declares
> compose: node `"<node>"` declares container envFrom; compose has no env-from-object primitive: compose has no env-from-object primitive; container declares envFrom

**How to fix:** for a compose target, remove the field and do its work another way — start-up work belongs in a container that runs before the main one, and shutdown work in the container's own signal handling; bulk environment can be written out as explicit variables, or supplied from a file the compose target can read. Where the field is what you meant, render that boundary through a provider whose target has the primitive.

### An omits entry names a kind or a namespace a compose file does not have

<!-- covers: internal/wasm.ErrPluginCannotExpressInput -->

An `omits:` entry on a Recipe or a FeatureRecipe that sources a compose file leaves out one top-level unit of that file, and a compose file has exactly three kinds an entry can name — a `service`, a `volume` and a `config`, each keyed under `services:`, `volumes:` or `configs:` — and no namespaces. An entry naming any other kind, a chart document's `Secret` or a compose `network` among them, or carrying a `namespace`, names nothing the file could leave out, so the render stops rather than treat the entry as one that matched nothing. Kinds are compared exactly, so `Service` is refused where `service` is meant. Every entry is checked before anything is left out, and the first one at fault, in the order the entries were written, is the one named.

**Emitted messages.** Both report the condition for a construct a provider has no expression for, and the provider's own sentence names the entry and the kinds it accepts. A field whose template read a value declared sensitive is shown as `<redacted>`:
> a plugin has no expression for a construct this build declares
> compose: an omits entry (name `"<name>"`) names kind `"<kind>"`: compose leaves out a service, a volume or a config, each named by its key under services:, volumes: or configs:, and no other kind

> a plugin has no expression for a construct this build declares
> compose: an omits entry (kind `"<kind>"`, name `"<name>"`) names namespace `"<namespace>"`, and a compose file has no namespaces: compose leaves out a service, a volume or a config, each named by its key under services:, volumes: or configs:, and no other kind; remove the namespace from the entry

**How to fix:** name the unit as the compose file does — `kind: service`, `volume` or `config`, and `name:` its key under that section — and drop the `namespace:`. See [compose → Sourced mode](../providers/compose.md#sourced-mode).

### An omits entry names a namespace a CloudFormation template does not have

<!-- covers: internal/wasm.ErrPluginCannotExpressInput -->

An `omits:` entry on a Recipe or a FeatureRecipe that sources a CloudFormation template leaves out one resource, named by its `Type` as the entry's `kind` and its logical ID as the entry's `name`. A template has no namespaces, so an entry carrying a `namespace` names nothing a template could leave out, and the render stops rather than treat the entry as one that matched nothing. Every entry is checked before anything is left out, and the first one carrying a namespace, in the order the entries were written, is the one named.

**Emitted message.** It reports the condition for a construct a provider has no expression for, and the provider's own sentence names the entry and what this provider leaves out. A field whose template read a value declared sensitive is shown as `<redacted>`:
> a plugin has no expression for a construct this build declares
> cloudformation-provider: an omits entry (kind `"<kind>"`, name `"<name>"`) names namespace `"<namespace>"`, and a CloudFormation template has no namespaces: cloudformation leaves out a resource, named by its Type as the entry's kind and its logical ID under Resources as the entry's name; remove the namespace from the entry

**How to fix:** drop the `namespace:` from the entry, which names the resource by its `Type` and logical ID alone. See [cloudformation → Leaving resources out of a sourced template](../providers/cloudformation.md#leaving-resources-out-of-a-sourced-template).

### A published port declares a transport compose cannot spell

<!-- covers: internal/wasm.ErrPluginValueNotRepresentable -->

A published compose port carries its transport as a suffix on the entry, and that suffix has two spellings. A port declaring any other transport has no compose spelling at all.

**It stops rather than drop the suffix**, because a published port that quietly falls back to the default transport comes up carrying traffic its clients cannot reach — which is exactly the failure declaring a transport exists to prevent, reintroduced at the moment of translation.

**A port declaring no transport is unaffected.** It publishes with no suffix, exactly as a port that never carried a transport would.

Emitted message. The condition names the kind of failure — a value with no representation in what the provider emits — and the provider's own sentence follows it:
> a plugin has no representation for a value it was given
> compose publishes a port's transport as a tcp or udp suffix; this port declares a transport compose cannot express

**How to fix:** for a compose target, declare the port's transport as one of the two compose can spell, or leave it undeclared and let the entry publish without a suffix. Where the transport is what you meant, render that boundary through a provider whose target can express it.

### A resources quantity cannot be converted to a compose value

<!-- covers: internal/wasm.ErrPluginValueNotRepresentable -->

A container's processor and memory quantities are written in the notation Kubernetes uses for resources, and compose carries them in units of its own, so each is read as a quantity and converted from its value. Two things stop that, and the message says which it met: a value that is not a quantity at all, and a quantity compose has no exact form for — a negative amount, a memory amount that is not a whole number of bytes, a processor amount finer than nine decimal places of a core, or an amount past the largest compose can hold. It stops rather than round the value or emit an approximation, because a limit that is quietly not the limit that was asked for is the kind of difference nobody looks for until something is stopped for exceeding it.

**Emitted messages.** Each opens with the condition — a value with no representation in what the provider emits — then names the resource, whether the value is a request or a limit, its path in the Workload and the value. A value that is not a quantity is followed by what made it not one and the form a quantity takes:
> a plugin has no representation for a value it was given
> compose: the `<cpu|memory>` `<request|limit>` at `<path>`: `"<value>"` is not a quantity: `<reason>`; a quantity is a number such as 2, 0.5 or 1.5, with an optional sign and at most one of an integer exponent (1e3, 5E-2) or a unit suffix (n, u, m, k, M, G, T, P, E, Ki, Mi, Gi, Ti, Pi, Ei): resources quantity cannot be converted to a compose deploy.resources value

A quantity compose cannot represent is followed by the range compose holds for that resource:
> a plugin has no representation for a value it was given
> compose: the memory `<request|limit>` at `<path>` is `"<value>"`, a quantity compose cannot represent exactly; a compose memory value is a whole number of bytes from 0 to 9223372036854775807: resources quantity cannot be converted to a compose deploy.resources value

> a plugin has no representation for a value it was given
> compose: the cpu `<request|limit>` at `<path>` is `"<value>"`, a quantity compose cannot represent exactly; a compose cpus value is a core count from 0 to 9223372036.854775807 with at most nine decimal places: resources quantity cannot be converted to a compose deploy.resources value

**How to fix:** where the value is not a quantity, write it in the form set out in [Workload → Resource quantities](../entities/workload.md#resource-quantities); a bare suffix such as `m` is what a template leaves when the value it interpolates is empty, so the input to fix is the one the template read. Where it is a quantity compose cannot represent, write an amount inside the range the message states — memory as a whole number of bytes in whichever unit (`1536Mi` rather than `1.5001Gi`), and processor time to at most nine decimal places of a core.

### A resource quantity the helm provider emits is not a quantity

<!-- covers: internal/wasm.ErrPluginValueNotRepresentable -->

The helm provider copies every resource quantity into the manifests it emits verbatim — each container's and init container's `resources.requests` and `resources.limits` values, extended resources included, and each volume's `ephemeral.sizeLimit`, `persistent.size` and `persistentTemplate.size` — and checks each one against the quantity form first, on the Workload as the Recipe's templates evaluated it. A value outside the form halts the build here, where it would otherwise build cleanly and be refused by the cluster when the chart is installed.

**Emitted message.** It opens with the condition, then names the node, the field's path in the Workload, the value and what made it not a quantity, and states the form a quantity takes:
> a plugin has no representation for a value it was given
> helm: node `"<node>"`: `<path>`: `"<value>"` is not a quantity: `<reason>`; a quantity is a number such as 2, 0.5 or 1.5, with an optional sign and at most one of an integer exponent (1e3, 5E-2) or a unit suffix (n, u, m, k, M, G, T, P, E, Ki, Mi, Gi, Ti, Pi, Ei)

**How to fix:** write the value in the form set out in [Workload → Resource quantities](../entities/workload.md#resource-quantities). Where the field is templated, the value to fix is the one the template read: a bare suffix such as `m` or `Mi` is what a template leaves when the value it interpolates is empty, and a Release parameter reaches the field exactly as it was written.

### A service type the helm provider cannot render

<!-- covers: internal/wasm.ErrPluginValueNotRepresentable -->

The helm provider renders each Workload `services` entry as a Kubernetes Service whose type is the entry's `type`. A `Loopback` entry asks for its ports to be reachable from the host's own loopback address and from nowhere else, and a Kubernetes Service has no type that does that: which node addresses a `NodePort` Service listens on is a setting of the whole cluster, not of one Service. So the build stops on the first `Loopback` entry, in the order the services are declared, before any resource is written.

**It stops rather than render the entry as another type**, because each of the types a Service does have changes what the port reaches: a `ClusterIP` Service drops the published reach the entry asks for, and a `NodePort` one publishes the port on every node address the cluster allows — the wider exposure the entry exists to avoid.

**Emitted message.** It opens with the condition, then names the node, the service's path in the Workload and the type:
> a plugin has no representation for a value it was given
> helm: node `"<node>"`: services.`<service>`: type "Loopback" publishes the service's ports on the host's loopback address only, and a Kubernetes Service has no type that does; declare ClusterIP to keep the ports inside the cluster, or NodePort or LoadBalancer to publish them outside it

**How to fix:** for a helm target, declare the type that says how far the port should reach in the cluster — `ClusterIP` to keep it inside, `NodePort` or `LoadBalancer` to publish it. A `Loopback` entry is for a compose target, which publishes the port on `127.0.0.1`; see [Workload → `services`](../entities/workload.md#services).

### A Kubernetes version the helm provider cannot render a chart for

<!-- covers: internal/wasm.ErrPluginValueNotRepresentable -->

The helm provider renders a chart from source for the Kubernetes version the `aggrega.ai/kubernetes-version` annotation names on a component or on its boundary, and reads the value the way `helm template --kube-version` reads its flag. A value that flag would refuse — `"one.two"`, `"latest"`, a single number such as `"1"`, a number written with a leading zero such as `"01.20"` — has no version for the chart to read as `.Capabilities.KubeVersion`, so the build stops before the chart is rendered.

**It stops rather than render the chart for the default version**, because a chart reads the version to choose an API version, a field or a whole mechanism, and a chart rendered for a version other than the one you named emits the shape for that other version — one the cluster it deploys to may not run.

**An empty value is not refused.** It is treated as unset, and the chart renders for the default: the version the stock `helm template` of the same helm release renders for.

**Emitted message.** It opens with the condition, then names the node and the boundary it is placed in, the annotation, the value and what made it not a version, and states the form to write:
> a plugin has no representation for a value it was given
> helm: node `"<node>"` in boundary `"<boundary>"`: annotation aggrega.ai/kubernetes-version: `"<value>"` is not a Kubernetes version a chart can be rendered for: `<reason>`; write the version of the cluster the chart deploys to, such as "1.31" or "v1.31.2", on the component or on its boundary

The message names both the node and its boundary because the provider reads a component's annotations and its boundary's together, a component's own value winning, so the value may have been written on either.

**How to fix:** write the version of the cluster the chart deploys to — a major and a minor version such as `"1.31"`, or a full one such as `"v1.31.2"` — on the component or on its boundary, or remove the annotation to render for the default. See [helm → The Kubernetes version a chart is rendered for](../providers/helm.md#the-kubernetes-version-a-chart-is-rendered-for).

### A health probe cannot be turned into a compose healthcheck

<!-- covers: internal/wasm.ErrPluginRequiredInputUnresolved -->

A declared health probe becomes a compose healthcheck, and two things can stop that.

**A probe that checks a path over HTTP, on a container that publishes no port.** The check is built as a request to a port on the container, so with no port declared there is no address to build it against.

**A probe that declares no way of checking at all** — neither a path, nor a port to connect to, nor a command to run. There is nothing to turn into a check. This one is a guard behind the schema rather than a shape you are likely to write: a probe is checked for having one of the three before it reaches here.

**Emitted messages.** Both report the same condition — something the provider requires that it could not resolve to exactly one value — and the provider's own sentence says which:
> a plugin could not resolve something it requires to exactly one value
> probe http: requires at least one container port; container declares none

> a plugin could not resolve something it requires to exactly one value
> probe declares no shape (http/tcp/exec)

**How to fix:** declare the port the check should be made against on the same container as the probe — a probe over HTTP reads the first container port, so the port has to exist for the check to be built. Where the container genuinely publishes nothing, check it another way: a probe that runs a command needs no port. For a probe with no way of checking declared, give it one of the three.

### A configmap volume has no file behind it

<!-- covers: internal/wasm.ErrPluginRequiredInputUnresolved -->

A volume that mounts configuration is delivered through compose's own mechanism for it, referenced by name, and the entry holding the content comes from a file the Recipe emits. This condition is what a reference with no matching entry reports: the file is not there, so the mount would exist with nothing behind it and the container would come up reading an empty path.

**The check runs over the whole assembled output rather than per component**, and that is deliberate: the reference and the entry holding the content arrive by different routes and may come from different components of the same group, so the assembled output is the first point at which both are present. A per-component check would refuse a reference whose content another component in the same group supplies.

Every unresolved reference is reported rather than the first, in a stable order, so one build names all of them.

Emitted message. The condition leads, then each service, the reference it made, and where it mounts:
> a plugin could not resolve something it requires to exactly one value
> compose AssembleBoundary: service `"<service>"` references config `"<name>"` mounted at `"<path>"`; declare each one as a top-level configs: entry from the Recipe's artifacts: input: configmap volume requires a file emitted via the Recipe's artifacts: input; none found

**How to fix:** emit the file from the Recipe's `artifacts:` input under the name the volume references — the two are matched by that name, so a mismatch between what the volume asks for and what the Recipe emits is the common cause. Where the content was meant to come from somewhere else, the volume is the wrong mechanism for it: a value that belongs in the environment goes there instead.

### What an omits entry left out is still named by the compose file

<!-- covers: internal/wasm.ErrPluginRequiredInputUnresolved -->

An `omits:` entry leaves a service, a volume or a config out of a sourced compose file, and compose refuses a file that names one it does not declare. So once the entries' units are removed, every reference the rest of the file still makes to one of them stops the render: a service named by `depends_on`, `links`, `volumes_from`, `extends`, a `build.additional_contexts` value or a `service:` network, IPC, PID or UTS mode; a volume named as the source of a `volumes:` entry; a config named by a `configs:` entry — read in each service, each service's `pre_start` hooks and each job. The full list, and the values that only look like references, are in [compose → Sourced mode](../providers/compose.md#sourced-mode).

**The check reads the declaring Recipe's or FeatureRecipe's own file**, so it stops the render even where another contributor to the same assembled file declares a unit of the left-out one's name. Every reference is reported rather than the first — services in key order, then jobs, each service's hooks after it — so one build names all of them.

Emitted message. The condition leads, then each referring entry, the unit it names and the field the reference is in:
> a plugin could not resolve something it requires to exactly one value
> compose: what an omits entry left out is still named by the file: service `"<service>"` names `<kind>` `"<name>"` at `<field>`; compose refuses a file naming a service, a volume or a config it does not declare: leave out what names it as well, change the reference through valuesMapping, or remove the entry

A unit whose entry's name was built from a value declared sensitive is shown as `<redacted>`.

**How to fix:** decide which of the two you meant. Where the referring service still needs the unit, keep it: remove the entry. Where it does not, change the reference through the Recipe's `valuesMapping:` — a list there replaces the base file's list, so `depends_on: []` clears one — or leave the referring service out with an entry of its own.

### What an omits entry left out is still named by a CloudFormation template

<!-- covers: internal/wasm.ErrPluginRequiredInputUnresolved -->

An `omits:` entry leaves a resource out of a sourced CloudFormation template, and CloudFormation refuses a template that names a resource it does not declare. So once the entries' resources are removed, every reference the remaining templates still make to one of them stops the render: a `Ref`, an `Fn::GetAtt` in its list form or its dotted-string form, a resource's `DependsOn`, or a variable of an `Fn::Sub` — read anywhere in each resource's body and each output. The full list, and the values that only look like references, are in [cloudformation → Leaving resources out of a sourced template](../providers/cloudformation.md#leaving-resources-out-of-a-sourced-template).

**The check reads the declaring Recipe's or FeatureRecipe's own templates, together**: a reference to a logical ID another of those templates still declares is not stopped, while one to a left-out resource stops the render even where another component declares a resource of that logical ID. Every reference is reported rather than the first — template by template in the order the source carries them, each template's resources and then its outputs in key order — so one build names all of them.

Emitted message. The condition leads, then each reference: the template it is in, the resource it names, how it names it, and where it sits as a path from the template's root:
> a plugin could not resolve something it requires to exactly one value
> cloudformation-provider: what an omits entry left out is still named by the source's templates: template `"<template>"` names resource `"<logical-id>"` (type `"<type>"`) by `<Ref|Fn::GetAtt|DependsOn|Fn::Sub>` at `<path>`; CloudFormation refuses a template naming a resource it does not declare: leave out what names it as well, or remove the entry

Where an entry's fields were built from a value declared sensitive, its resource's logical ID and type are shown as `<redacted>`, and so is any step of the path that spells that logical ID.

**How to fix:** decide which of the two you meant. Where the referring resource still needs the left-out one, keep it: remove the entry. Where it does not, leave the referring resource out as well, with an entry of its own — a sourced template takes no values, so the reference itself cannot be changed. An output naming the resource cannot be left out, so a resource an output names stays.

### Two entries reach one stack output name

<!-- covers: internal/wasm.ErrPluginOutputNameCollision -->

A stack output name admits only letters and digits, so one is built from what you wrote by encoding the characters that alphabet does not admit rather than by dropping them. Two entries you wrote apart therefore stay apart, and this halt is what reports the case where two of them nonetheless reach one name. The render stops rather than emit one output where two entries were written, which would silently drop one of them.

Every name behind which two or more entries met is reported, and every entry behind each name is named, in a stable order — so one build shows you the whole collision rather than one side of it.

Emitted message, opening with the condition and continuing with the provider's own detail:
> two things a plugin produced occupy one name in its output
> cloudformation-provider: two entries an author wrote reach one stack Output name: `<the entries that met>` reach the Output name `"<name>"`; an Output name is built by encoding the component and the entry into the letters and digits a logical id admits, rather than by dropping what it does not, so two entries an author wrote apart stay apart — renaming either end clears the build

**How to fix:** rename one of the entries, or one of the components, so the two no longer reach one name — the message names both sides. The name carries the punctuation and the letter case you wrote, encoded rather than dropped, so a difference of either survives into it and two entries written differently are named apart.

### A CloudFormation fragment writes one key twice

<!-- covers: internal/wasm.ErrPluginOutputNameCollision -->

A mapping holds one value per key, so a fragment that writes the same key twice would keep whichever body came last and discard the other. Where the mapping is the block holding resources or outputs, the discarded body is a resource or an output that was written down and would not be in the result. The render stops instead.

Both places the key was written are reported, because a key written twice is usually two edits meant to be two different keys — and the author needs both to tell which one to change.

Emitted message, opening with the condition and continuing with the provider's own detail:
> two things a plugin produced occupy one name in its output
> cloudformation-provider: one mapping key is written more than once: the key `"<key>"` is written at line `<first>` and again at line `<second>`; a mapping holds one value per key, so one of the two bodies would be dropped — remove one, or rename one so each key is written once

**How to fix:** open the fragment at the two lines the message names. Where the two bodies were meant to be one thing, remove the one that is now redundant; where they were meant to be two, rename one so each has a key of its own. The fragment is a template, so check the rendered text rather than only the source where a key is composed rather than written literally.

### A cross-boundary reference has no consuming stack to be written into

<!-- covers: internal/wasm.ErrPluginRequiredInputUnresolved -->

Where a dependency connection crosses between two separately assembled outputs, the consuming side is rendered with a placeholder and the reference is written in once both sides exist. This condition is what happens when the consuming side's assembled output holds no stack template at all: there is no document to write the reference into, so the placeholder cannot be replaced.

Emitted message. The condition names the kind of failure, and the provider's own sentence says which input:
> a plugin could not resolve something it requires to exactly one value
> cloudformation-provider: cross-boundary link resolve received no consumer stack template

**How to fix:** nothing you write inside the consuming component produces this — it is the shape of what its boundary assembled. Check that the consuming side is rendered by the CloudFormation provider at all: a connection crossing into a boundary that assembles something else has no stack for the reference to land in, and the connection belongs between two boundaries the same provider assembles. Where both sides should be CloudFormation, the consuming boundary produced no stack template, which is a question for whoever authored the Recipes contributing to it.

### A cross-boundary reference was spliced into a longer string

<!-- covers: internal/wasm.ErrPluginValueNotRepresentable -->

A CloudFormation cross-reference is an object rather than text, so it can only replace a value whole. This condition is what a placeholder that survived only inside a larger string reports — a value composed around it, rather than delivered as the whole of what was injected. There is nothing to swap the object for, so the render stops rather than emit a reference in a shape the target cannot read.

Emitted message. The condition leads, then the value and the connection it arrived on:
> a plugin has no representation for a value it was given
> cloudformation-provider: cross-boundary link value is interpolated into a larger string; only a whole-scalar injection can carry a cross-stack reference: output key `"<key>"` on socket `"<socket>"`

**How to fix:** deliver the value whole rather than composing around it. Where the consuming side needs the value inside a longer string — a connection string, a URL — build that composition in the target's own vocabulary from the reference, rather than in the Recipe's template before the reference exists. The mapping that injects the value is where the splice happens, so that is the line to change.

### Two rendered resources land at one output file

<!-- covers: internal/wasm.ErrPluginOutputNameCollision -->

Each rendered resource is written to a file whose name comes from what the resource is and what it is called. Two resources that share those carry the same file name, so one would occupy the other's slot and the render stops rather than emit one file where two resources were rendered.

**Two resources that render identically are not a collision.** Where the content matches byte for byte, keeping one loses nothing and the render carries on — so a template included twice with the same result is not reported.

Emitted message. The condition leads, then both templates that produced them and the file they met at:
> two things a plugin produced occupy one name in its output
> helm: node `"<node>"`: rendered resources `"<one template>"` and `"<the other>"` both derive output `"<file>"` with differing content: two rendered resources derive the same output filename with differing content

**How to fix:** give the two resources distinct identities — the name is what usually differs, and the file name follows from it. The message names both templates, so open them and check what each is producing: two templates rendering the same resource under one name is often one of them being an older copy. Where both are wanted, they are two resources and each needs its own name.

### A synthesized StatefulSet has no single service to govern it

<!-- covers: internal/wasm.ErrPluginRequiredInputUnresolved -->

A workload that declares per-instance storage is rendered as a StatefulSet, and a StatefulSet names one service that governs it — the one giving each instance its stable address. That service is the one declared without a cluster address of its own. Two shapes stop the render: none declared, so there is nothing to name; and more than one, so which of them governs has no answer. Either would produce a StatefulSet the target rejects, so the render stops instead of emitting one.

**Emitted messages.** Both report the same condition — something the provider requires that it could not resolve to exactly one value — and the provider's own sentence says which of the two shapes was met. Each is printed beneath a frame naming the node:
> a plugin could not resolve something it requires to exactly one value
> synthesized StatefulSet requires a headless governing Service (declare a service with type: Headless); none found: synthesized StatefulSet has no headless governing Service

> a plugin could not resolve something it requires to exactly one value
> synthesized StatefulSet declares more than one headless Service; the governing Service is ambiguous (declare exactly one type: Headless service): synthesized StatefulSet has more than one headless Service

**How to fix:** declare exactly one service of the headless type on the workload. Where none is declared, add it — a workload with per-instance storage needs one, and it is what gives each instance an address that stays with it. Where more than one is declared, keep the one that should govern and give the others an ordinary type, or remove them; a second headless service is usually one that did not need to be headless.

### A plugin reported a failure it did not classify

<!-- covers: internal/wasm.ErrPluginFailureUnclassified -->

A plugin that stops a build reports two things: a sentence of its own saying what happened, and which kind of failure that sentence names. The kinds are a small set the compiler declares — a construct with no expression, an input that could not be resolved to one value, two produced things wanting one name, a value with no representation — and this condition is the one a plugin chooses when its failure fits none of them.

It is a fallback rather than a destination. A plugin reaching for it where one of the other kinds fits is telling you less than it knows, and the wording says plainly that the plugin declined to classify rather than that something merely went wrong — so an over-used fallback is legible rather than indistinguishable from a correct report.

Emitted message. The condition leads and the plugin's own sentence follows it:
> a plugin reported a failure that none of the declared kinds names
> `<the plugin's own sentence>`

**How to fix:** read the plugin's own sentence, which is where everything specific to your build is. The condition itself tells you only that the plugin had no kind for it. Where the plugin is yours, choose the kind the failure actually is; where it is not, the sentence is what to quote to whoever publishes it.

### A plugin named a condition the socket does not declare

<!-- covers: internal/wasm.ErrWasmGuestConditionUndeclared -->

A plugin reports a condition this compiler declares rather than inventing a number of its own, so the identifier that reaches you is always one `aggrega explain` answers for. This halt is what a report naming anything else produces: a number nothing is registered under, a number that was retired, a short code spelled differently from the registration it resolves to, or a pair of identifiers naming two different conditions.

**It stops rather than quietly standing the report down.** Dropping the identifiers and letting the generic plugin-failure condition stand would produce a build that looks exactly like one from a plugin that named no condition at all, so whoever has to fix it would never learn there was anything to fix. Reporting the offered number instead would hand you an identifier that resolves to nothing.

**Your build still gets what stopped it.** The halt quotes the offending number, says why it resolves to no condition, names the generic conditions a plugin reaches for when it has no better identity, and carries the plugin's own sentence through unchanged.

Emitted message:
> wasm: guest plugin named a condition the socket does not declare: the guest named `"<offered>"`, and `<why it resolves to no condition>`; a plugin names a condition this compiler declares, and reaches for one of `<the generic conditions and their codes>` when it has none better: `<the plugin's own sentence>`

**How to fix:** nothing in your entity files causes this — it is the plugin's report that is wrong, and the failure it was reporting is real. Act on the plugin's own sentence, which is the last part of the message. Where the plugin is yours, report a condition this compiler declares — one of the generic kinds the message lists, where the failure fits none of the more specific conditions; where the plugin is not yours, quote the offending number to whoever publishes it.

### A Recipe's `source:` names a kind nothing knows how to acquire

<!-- covers: pkg/sourceresolver.ErrUnknownKind -->

A Recipe's `source:` says what kind of thing it points at — a chart, a module, a compose project — and each kind is acquired by the part that knows how to acquire that kind. This condition reports a kind with nothing registered to serve it, so there is nothing to route the request to.

It is a dispatch failure and not a transport one: nothing was attempted, because there was nothing to attempt it with. That is what separates it from an acquisition that ran and failed.

Emitted message, naming the kind that was asked for:
> sourceresolver: kind=`<kind>`: sourceresolver: no adapter registered for source kind

**How to fix:** correct the kind on the Recipe's `source:` to one the toolchain serves — a misspelling and a kind that genuinely has no adapter produce the same message, and the spelling is quoted in it, so the first thing to check is the Recipe against the source kinds the language reference lists. Where the kind is spelled as you intended, that kind is not one this build can acquire, and no authoring change to the Recipe will make it so; point the `source:` at a form that is served instead.

### A source artifact is cached without a workspace root to anchor it

<!-- covers: pkg/sourceresolver/cacheslot.ErrEmptyWorkspaceRoot -->

An acquired source artifact is stored in a slot underneath the workspace's artifact cache, and the path to that slot is built from the workspace root outward. This condition reports the root arriving empty, which would leave the slot path relative — resolving against whatever directory the process happens to be in when the bytes are written, and putting the cache somewhere nobody chose.

It is refused rather than resolved, because a slot written to the wrong place is worse than no slot: later reads look in the right one, find nothing, and re-acquire, so what you would see is a cache that never seems to hold anything, and nothing else pointing at why.

Emitted message. The condition's own sentence opens it, and what identifies the artifact follows:
> cacheslot: empty workspaceRoot (kind=`<kind>` url=`<url>` chart=`<chart>` version=`<version>`)

**How to fix:** nothing in your entity files causes this and no authoring change clears it — the workspace root is supplied by whatever is driving the build, not written in a catalog. Run the build from inside the workspace, so the root is discovered rather than passed as nothing. Where you drive the compiler from software of your own, pass the workspace root explicitly; a caller that genuinely wants the cache relative to the current directory passes a single dot, which is accepted and says so deliberately.

### A value would place a cached file outside the cache

<!-- covers: pkg/oci.ErrCacheLocationOutsideCache -->

A cached entity and a cached source artifact each live in a slot the cache names for it, and that slot is composed from values: the entity's reference and the version it resolved to, or a source's kind, `url`, `chart`, `module_subdir`, version and digest. Each value names one position in the layout. This condition reports a value that would move what is written for it somewhere other than the position it names — beside another slot, or out of the cache altogether — and refuses it before anything is written or read there.

Most of those values arrive from somewhere the cache does not control: a body a registry served, a record read back from disk, a coordinate a Recipe or FeatureRecipe author wrote. A version that is a path rather than a version, a `url` path or a `module_subdir` that climbs above its place, and a reference that resolves to a dot directory are each refused here. A value that names one directory — and a `url` path or `module_subdir` that stays at or below its place — is untouched.

**A `module_subdir` that climbs is refused before anything is fetched.** For a `git-repository` source the same value also names the directory of the repository the pull archives, and one climbing above the repository would have the pull read the files beside its checkout. So the pull judges `module_subdir` before it fetches the repository, and refuses a value that climbs with this condition, quoting it under its key: nothing is fetched, and nothing beside the checkout is read. A backslash in it is read as a separator, as a Windows path reads one, so `..\shared` is refused on every machine rather than read from beside the checkout on one; a separator leading or trailing the value is dropped, so `/charts/app` names `charts/app`.

Emitted message. The condition's own sentence opens it, then the value as it was written under the key it was written as, and the remedy:
> a value a cache location is built from would place cached files outside the place it names in the cache (version `"../../../etc"` for entity `"demo/app/web"`). a version, a name, a kind or a host names one directory of the cache, so it carries no `/` or `\` and is neither `.` nor `..`; a URL path or a module subdirectory may name directories beneath its place but may not climb above it. Correct the value where it was written, or, where a registry served it, ask its publisher to publish a version that carries a well-formed one

**How to fix:** where the value is one you wrote — a Recipe's or FeatureRecipe's `source.version`, `url` or `module_subdir` — correct it to name one directory, or a path that stays inside its place; the message quotes the value and the key it was read from. Where a registry served it, the published entity carries a version or a coordinate that is not one, which no change of yours can fix: the message names what was fetched, and the remedy is with whoever publishes it.

### A path the operation writes leads through a link out of the directory it must stay inside

<!-- covers: pkg/writescope.ErrWriteLeadsOutOfWorkspace -->

Several operations write or remove files of their own, at places they work out for themselves rather than places you named: a build's output directory and every file it writes there, and the `.trace` directory a traced build replaces; a Release's lockfile, and the plugin trust record beside it, which a pull writes; the `entity.lock` beside an entity, which `aggrega pin` writes, and a pull that pins sources writes beside each entity it pins; the workspace's `.aggrega-config.yaml`, when a command writes the workspace's configuration; the artifact cache and each subtree of it, which a pull fills and `aggrega cache clear` and `aggrega cache prune` empty; the signature bundles a pull keeps in that cache for each artifact whose signature it verified; the drafts `aggrega import` writes; the Plugin entities `aggrega plugin gen-catalog` writes beneath its output directory; and the `.aggrega/active-release` marker the editor's language server writes when a default Release is recorded, and the `.aggrega` directory holding it. The same holds whichever surface started the operation — the command line, the editor's language server, or an assistant's tools. [The workspace boundary](../cli/workspace-boundary.md) states the rule this applies, and the paths that reach outside the workspace on purpose.

Each of those places has a directory it must stay inside, and which one depends on the directory the operation composes it beneath:

- **The workspace**, for everything composed inside it. This is the usual case, and it holds for a directory you named that lies inside the workspace too. A build's `dist` and `.trace` are always composed here, beneath the workspace root, whichever folder the build is run from, and so are the drafts of an import that names no output directory.
- **A directory you named that lies outside the workspace**, for everything composed beneath it: the output directory you pass to `aggrega plugin gen-catalog` or `aggrega import`; the directory of a Release you name, or one the workspace configuration names, that lies outside the workspace, for the lockfile and trust record beside it; and the directory of an entity you name to `aggrega pin`, or a catalog directory you name with `--catalog` or the configuration lists under `catalog_dirs`, for the `entity.lock` beside each entity there. The directory itself is used as you named it — one that is a link is written through, to where it points — and what is written beneath it stays inside it.
- **The artifact cache directory itself**, for everything written into the cache beneath it and everything `aggrega cache clear` and `aggrega cache prune` remove there — the default `.aggrega/cache` as much as an `artifact_cache_dir` the configuration writes climbing out of the workspace root (`../shared-cache`). One of the cache's own directories, or a file in it, that is a link leading out of the cache directory is refused even where it leads elsewhere inside the workspace, so nothing written into the cache, and nothing a clear or a prune removes, lands on a file outside it. Where the cache directory itself lies is judged first: one written inside the workspace root is followed wherever it leads inside the workspace and refused, held to the workspace, where it leads out of it; one written climbing out of the workspace root is used as you named it, written through to where it points if it is a link.

Each of those places is checked before anything is written or removed there. The deepest part of the path that exists, with every symbolic link on the way followed, has to be the directory it must stay inside or lie beneath it. A link anywhere on the way that leads outside that directory — a `dist` linked to a directory elsewhere, a lockfile linked to a file in another project, a `.aggrega/cache` linked to a directory shared with other work, a directory beneath a gen-catalog output directory linked somewhere else — would make the write or the removal land outside, so the operation stops instead, and that path is left exactly as it was. It matters most for a build: clearing and rewriting an output directory that is a link would otherwise delete and rewrite a directory somewhere else on the machine.

A link that leads nowhere is treated as what it is — not something that exists — so the directory holding it is what is checked. Where such a link stands at the very end of a path the operation is about to create, the file would be created where the link points, so the place it points to is checked as well. A link that points somewhere inside the directory the path must stay inside is followed as usual.

Emitted message. The condition's own sentence opens it, then the path the operation was about to write or remove — `writing` or `removing` says which — the directory it must stay inside, the link it meets on the way and the place that link leads to, then the remedy. A build whose `dist` is a link leading out of the workspace is stopped at the first thing it would touch, the clearing of the previous output:
> a path this operation writes or deletes leads through a link out of the directory it must stay inside (removing `<workspace>/dist/boundaries`, which must stay inside `<workspace>`, the link `<workspace>/dist` leads to `<elsewhere>/dist-target`). nothing was written to or removed from that path. Remove the link, or make it lead to a place inside `<workspace>`, and run the operation again

The diagnostic carries no category: what is at fault is the layout on disk rather than any document you wrote.

**How to fix:** remove the link the message names and run the operation again, so it creates a real directory or file in that place; or make the link lead somewhere inside the directory the message names, where it is followed. Nothing in your entity files causes this and no authoring change clears it.

### A name the operation writes holds a part Windows cannot hold

<!-- covers: pkg/pathscope.ErrNameWindowsCannotHold -->

On Windows, some names do not reach a file as they are written. A name Windows reserves for a device — `CON`, `PRN`, `AUX`, `NUL`, `CONIN$`, `CONOUT$`, `COM0` to `COM9` and `LPT0` to `LPT9`, and the `COM` and `LPT` names spelled with a superscript one, two or three — names the device rather than a file, in any letter case and whatever extension follows it, so `nul`, `Aux.yaml` and `com1.txt` are all devices. And a part of a path ending in a full stop or a space is one Windows may trim rather than keep as written. Writing such a name would put its bytes somewhere other than the file it names.

So where an operation is about to write a name it did not choose itself beneath a directory on a Windows machine, a name holding such a part is refused before anything is written: an entry of the archive a source artifact or a catalog entity carries, when the cache lays the archive out to be read; a file a build renders into its output directory; a draft an importer returns to `aggrega import`, under a dry run as under a write; and the document `aggrega edit-document` writes back, whichever surface asked for the edit. Every part of the name is judged, with a backslash read as a separator, as Windows reads it — so `aux/x.yaml` is refused for its directory `aux`, `report.` for its final full stop, and `.. \evil.yaml` for its first part, two dots and a space. A set refused for one name writes none of the others: an archive is not laid out, a build's output is not cleared or written, and no draft reaches disk.

On Linux and macOS the same names are written as they are named, and this condition never fires. A name that climbs out of the directory it is written beneath is a different fault, refused on every platform with that operation's own message before this one is asked.

Emitted message. The condition's own sentence opens it, then the name, the part Windows cannot hold and the directory the name was to be written beneath, then the remedy:
> a name this operation writes holds a path segment Windows cannot hold as written (the name `"aux/x.yaml"`, its segment `"aux"`, beneath `<directory>`). It was not written. Windows reserves device names such as CON, PRN, AUX, NUL, COM1 and LPT1, in any letter case and whatever extension follows, and does not hold a segment ending in a full stop or a space as written; rename that segment where the name is produced

The diagnostic carries no category: the name comes from whatever produced it — an archive's publisher, a Recipe or a library, an importer, the path an edit names — rather than from one document the compiler files the fault against.

**How to fix:** rename the part the message names where the name comes from. For an archive entry, that is the published source artifact or entity, which only its publisher can change. For a rendered file, it is the output name a Recipe or an ArtifactLibrary gives it; for a draft, the importer that named it; for an edit, the path of the document. Nothing about the Windows machine makes the name usable as written.

## Conditions that do not halt a build

Every condition above stops a build. Some conditions carry a short code and a message of their own without ever stopping one, and they are catalogued here so that a code you have in hand always resolves to something, whichever page you arrived from.

They fall into four kinds, and the difference is worth knowing before you go looking for a fix.

- **An advisory.** The build reports it and carries on, and the rendered output is the same whether or not you act on it. Each is taught in full on [warnings.md](./warnings.md) — what makes it fire, where in the compilation it is read, what it prints, and what to do about it — and the entries below say which section, rather than repeating it here.
- **A condition the editor absorbs.** It is answered by the editor integration itself and reaches neither a build's output nor a diagnostic.
- **A safeguard behind an earlier refusal.** The rule it protects is enforced ahead of it by a condition that does halt, so a build meets the earlier one first.
- **A refusal on a command that is not a build.** It is a hard stop with a real remedy — it ends the command that met it, and nothing is published, written or changed — but no stage of compilation reaches it, so no build reports it. Publishing an artifact, adding a registry, editing a document, turning a foreign source description into draft authoring files, and checking a catalog against the publishing conventions are where these are met, and each entry says which command it belongs to and who holds the fix.

### An annotation binding declares one path in both pillar lists

<!-- covers: pkg/resolver.ErrAnnotationBindingPillarOverlap -->

An advisory. A Manifest annotation binding names the same dotted path in both its `maps.infra` and its `maps.values` list. Declaring the overlap is legal and the compiler does not police it: the routing tie-break deterministically sends the path through `infra`, which leaves the `values` side of that path unreachable from the Aggregate.

Its message opens:
> annotation binding declares one path in both pillar lists

It is what warns you before a build meets the halt described under "An annotation routes through a pillar its authoring side may not use" above — the advisory is the early surface, that halt is the enforcement one. The lint is taught under "Binding-map-overlap lint" in [warnings.md](./warnings.md).

### An attachment name is one edit from a declared slot

<!-- covers: pkg/resolver.ErrAttachmentSlotNearMiss -->

An advisory. A component attaches a Feature under a name that is not one of its type's declared slots but sits within a single edit of one — the shape a slot-name typo takes. An attachment under a name no slot declares is legal, so nothing halts; what the advisory names is the consequence, which is that the attachment is a free attachment rather than a fill of the slot you meant, and the slot stays empty. On a connection the same typo is not legal and halts instead, naming the near slot; see "A connection carries an attachment under a name its socket declares no slot for". Where the attachment's Feature satisfies the near slot's `selector:`, the advisory is not raised: that pairing is judged by the halt under "An attachment written under another name fits a slot its component leaves empty", which reports it when the slot is left empty.

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

### A provider binding names a capability no plugin the build reads serves

<!-- covers: pkg/catalog.ErrProviderBindingCapabilityUnserved -->

An advisory. A `plugins.providers` entry names a capability and no plugin, and none of the provider plugins the build reads — in the catalog directories, inside the compiler, or among those the lockfile records — serves that capability. That is the shape a misspelt capability takes, and such an entry is read by nothing: a binding is consulted only when a Recipe asks for its capability, and one naming no plugin selects nothing the capability's resolution would not select without it.

It advises rather than halting because the build cannot be sure. Bindings are written once for the whole workspace while a build is of one Release, so the plugin serving the capability may be one only another Release reads. The entry that names a plugin is judged differently, and halts where it is certainly wrong — see "A `plugins.providers` binding names a plugin that does not serve the capability" above.

Its message opens:
> plugins.providers entry names a capability no provider-rendering plugin the build reads serves

and continues with the capability, and a served capability one edit away where there is one. Taught under "Provider-binding unserved-capability warning" in [warnings.md](./warnings.md).

### An editor position falls outside the document

<!-- covers: pkg/yamlpos.ErrPositionOutOfRange -->

A condition the editor absorbs. Editor features that depend on where your cursor is — go-to-definition, hover, completion — locate the cursor inside the document's parsed structure first. This condition is what that step reports when the position addresses a line the document does not have, which happens transiently while an edit is in flight and the position the editor sent was measured against text the document has already moved past.

Its message reads:
> position out of range

**It reaches no build and no diagnostic.** Every feature that can meet it answers with no result rather than surfacing an error, which is the behaviour the editor protocol asks for: a request that cannot be answered returns nothing, and the editor asks again after the next keystroke.

There is nothing to fix in your files, and nothing appears in a build. A feature that stays unresponsive rather than recovering on the next edit is worth reporting as a defect.

### The schema-merge step's own input guard

<!-- covers: pkg/validator/merger.ErrMergeInvalid -->

A guard a build does not reach. When a Component or Feature extends another and both declare schemas, those schemas are combined into one. The library that does the combining refuses an input it cannot merge structurally:

> merger: invalid merge input

**It belongs to the combining step, which a build does reach** whenever an extending entity and its base both declare schemas. What it guards against is being handed an empty chain, or a chain entry whose schema is missing — and the caller can hand it neither: it assembles the chain only from schemas it has already found present, and combines only when that chain came out non-empty.

The guard stays because it is an exported library's refusal of malformed input. Removing it would remove no halt a build can reach; it would turn a clear refusal into a crash for a caller outside the compiler that passed such an input, which is strictly worse.

**The chain itself is not this step's concern.** A chain that loops and a chain that runs past the depth bound are refused by the single `extends:` walk before any schema is combined — see "Cyclic extends chain" and "An `extends:` chain runs past the depth bound" above.

It is catalogued because it is declared and carries a code of its own, so a code in hand resolves. Nothing you can author produces one, and meeting one would mean the arrangement described above no longer holds — worth reporting as a defect rather than working around.

### An explicit value displaced one an annotation supplied

<!-- covers: internal/compiler/analyzer.ErrOverriddenAnnotation -->

An advisory. Annotation-driven expansion turns an annotation a deployment carries into a Feature attachment with configuration of its own. Where the same attachment also carries configuration written explicitly — on the component, on a scope above it, or in the deployment — the explicit value wins at each key the two both cover. That is the intended rule and the emitted output is not wrong, so the build finishes. What the advisory names is the consequence: the annotation's contribution to that key is no longer visible anywhere in the output, and the author who wrote the annotation may not know it was suppressed.

It reports **every** displacement rather than only the ones that changed something. The merge overwrites the suppressed value, so there is no comparison left to make and nothing that could say whether the two agreed — the record that a displacement happened is the whole of the evidence. It is read once the whole attachment cascade and the expansion have been folded together, which is the earliest point at which that record exists.

Its message opens:
> annotation contribution overridden by an explicit value

and continues with the annotation that was displaced, then the coordinates of the key that displaced it, then where the displaced annotation was written. The position ahead of it is the document the finding sits in and the key inside it:
> `<file>` at `<authored key>`: annotation contribution overridden by an explicit value (`"<annotation-key>"`, component `"<component>"`, attachment `"<attachment>"`, pillar `"<pillar>"`, key `"<the key at issue>"`, annotation declared at `"<where the annotation was written>"`)

Two of those values are easy to misread. The **component** is named only where the displacing entry has one: an entry written for a whole scope has no component of its own, and naming one it never had would send a reader to a key nobody wrote. And **annotation declared at** names where the *displaced* annotation was written, which is the scope it was inherited from wherever it was not written on the component that displaced it — so it is not the component key repeated under another caption.

**What to do about it:** nothing, where the explicit value is what you meant. The advisory exists so that the precedence is a choice rather than a surprise. Where it is not what you meant, there are two ways out and they differ in scope. Delete the explicit entry, and the annotation's value flows through to that key. Or remove the annotation from the component or scope that carries it, and no contribution is made at all — which also affects every other key that annotation supplies. Where both sides are wanted but for different keys, narrow whichever one is reaching further than intended so the two no longer overlap.

### A connection crosses between two different providers' assembled outputs

<!-- covers: internal/compiler/renderer.ErrCrossProviderLinkUnsupported -->

Where a dependency connection's two ends assemble into different outputs, a provider that advertises cross-boundary linking wires it natively — publishing a reference on the producing side and resolving it on the consuming one. That wiring is written in one provider's own vocabulary, and a provider cannot resolve a reference another one published. So a connection whose two ends render through *different* providers is wired by neither.

**This advises and does not stop the build.** The connection still carries its value: the injection contract pipes the producing side's scalar across to the consuming side exactly as it does anywhere else, so what stands is a working connection wired the ordinary way rather than a broken one. What the finding tells you is that the native wiring you may have expected did not happen — and the output is unchanged whether you act on it or not.

**One provider advertising linking is enough to report.** Both ends need not claim it: one claim means the native wiring was expected and is impossible, and the author who attached that provider is the one who wanted it. Requiring both claims would say nothing in the ordinary mixed deployment, where one provider links and the other does not, which is the case this is for.

**Where the ends were placed does not enter it.** An assembled output is identified by its path and its provider together, so two ends whose providers differ are always in different outputs whatever their placement. What is read is the two providers and their two claims.

It is reported once per such connection, positioned at the document and the key the connection was written in.

Emitted message, leading with the far end and then naming the socket and each end's provider:
> cross-boundary link between endpoints rendered by different providers is not supported (`"<target-component>"`, socket `"<socket>"`, consumer provider `"<provider>"`, target provider `"<provider>"`)

**How to fix:** where the scalar value the connection already carries is enough, nothing needs doing — this is a notice rather than a fault. Where the native wiring is wanted, the two ends have to render through one provider: move one end into a boundary that routes through the other's provider, or serve both capabilities with one. Where neither is possible, the value-carrying form is what the deployment has, and the connection works.

### A command-line plugin runner was built without a way to find plugins

<!-- covers: internal/cliplugin.ErrNoResolver -->

A plugin that contributes a terminal command is run by a component that first has to turn the plugin's reference into bytes. This condition reports that component having been built without the part that does the turning, so there is no route from the reference to anything to run.

**It concerns a terminal command rather than a build**, so no stage of compilation reaches it: it is raised where an installed command is dispatched, and the answer it produces is that command's failure to start rather than a halt in any build.

**No path in the shipped command-line tool can raise it.** Every place the tool builds that component supplies the lookup, so the guard fires only where something else builds it and leaves the lookup out.

Emitted message, which is the condition's own sentence:
> cliplugin: no plugin resolver configured

**How to fix:** nothing in your entity files causes this, and nothing you can write in a catalog or a workspace clears it. Where you are running the published command-line tool, this is not a condition you can reach — an installed command that will not start is reporting something else, and the message it printed is the one to read. Where you embed the plugin runner in software of your own, supply the lookup that resolves a plugin reference to its bytes when you construct it.

### A registry alias is already bound to another host

<!-- covers: pkg/workspaceconfig.ErrDuplicateRegistryAlias -->

A refusal on adding a registry to the workspace, not on a build. An alias is a short name that selects one registry entry, so it is unique across entries. Registering an alias already held by a different host is refused rather than allowed to shadow the existing binding, which would silently change where every reference using that alias points.

Re-adding the **same** host under its existing alias is not a conflict — that updates the entry in place, which is what re-running the command to change a host's other settings does.

Emitted message, naming the alias and the host that already holds it:
> workspaceconfig: registry alias `"<alias>"` is already used by host `"<host>"`; choose a different alias or address that host directly: registry alias is already used by another host

**How to fix:** the fix is the operator's, at the command line. Give the new registry a different alias, or leave it unaliased and refer to it by host. Where you meant to move the alias to the new host, remove it from the entry the message names in `.aggrega-config.yaml` first — the refusal exists so that moving an alias is something you do on purpose rather than a side effect of adding a registry.

### A registry serves a trust document that cannot be read as one

<!-- covers: pkg/registrytrust.ErrMalformedTrust -->

A refusal on adding a registry, not on a build. A registry may publish the signing identities it expects artifacts to be signed by, so that adding the registry can pin them rather than making an operator transcribe them. This condition reports a registry that answered with a document that is not usable as a trust policy.

**It is a hard refusal precisely because the endpoint answered.** A registry publishing nothing is an ordinary, expected outcome that is tolerated; one publishing something unreadable is a misconfiguration, and pinning nothing from it would leave the registry silently unpinned while looking like it had been.

Three shapes report here: content that does not decode at all, including a document carrying a field the format does not define; an identity entry naming neither an exact identity nor a pattern; and an identity entry with no issuer. The last two are refused because such an entry can never match a signature, so it would weaken the pin while appearing to strengthen it.

**Emitted messages.** Content that does not decode:
> registrytrust: advertised trust config is malformed: `<what the decoder reported>`

an identity entry with nothing to match on:
> registrytrust: advertised trust config is malformed: `<list>`[`<index>`]: an identity entry must set identity or identity_regexp

and one with no issuer:
> registrytrust: advertised trust config is malformed: `<list>`[`<index>`]: an identity entry must set issuer

Each is framed by the command that met it:
> aggrega registry add: `<the message above>`

**How to fix:** the fix belongs to whoever operates the registry, not to you — quote the message to them, since it names the exact entry and what is missing from it. To proceed meanwhile, add the registry without pinning its advertised policy and supply the identities or the key yourself; the command takes them directly, which is also what you do for a registry that publishes no policy at all.

### A registry publishes no trust document

<!-- covers: pkg/registrytrust.ErrNoTrustAdvertised -->

An ordinary, expected outcome rather than a fault, and it stops nothing. A registry may publish the signing identities it expects, and most do not. Asked for one, such a registry answers that it has none, and adding the registry carries on — the outcome is reported as a notice and identities are pinned by hand instead.

It is deliberately distinct from a registry that could not be reached. This one answered; the answer was that it publishes no policy. Keeping the two apart is what lets a deliberate absence be tolerated while a reachability problem is still visible as one.

Reported as a notice, which names the registry, what it answered, and what to do instead:
> Notice: `<host>` publishes no trust policy (HTTP 404); pin its trust by hand with --identity or --key

The condition it is recorded under is `registrytrust: registry advertises no trust config`.

The official hub is the exception: it carries a built-in baseline, so where it publishes no document that baseline is pinned instead, and the notice says what the hub answered and that the baseline is used in its place rather than asking you to pin identities.

**How to fix:** nothing is broken. If you want signatures from this registry checked, supply the identity or the key when adding it, exactly as the notice says — that is the normal path for a registry that publishes no policy. If you do not, the registry is added without a signing stance and artifacts from it are verified only when they carry a signature.

### A registry is added offline with no trust policy to pin

<!-- covers: pkg/registrytrust.ErrOfflineRegistrationWithoutTrustPolicy -->

A refusal on adding a registry, not on a build. Adding a registry is the one moment its trust is pinned: the signing identities it advertises are fetched once and every later pull verifies against that pinned copy. When the workspace is offline that fetch cannot be made, so the registry is never asked. Rather than write an entry that trusts nothing — and that every later pull would hold the registry to — adding a registry other than the official hub is refused unless you supply the policy yourself.

**Three cases are not refused.** Supplying identities or a key registers exactly those and makes no fetch at all, so it works the same offline as online. The official hub is added on its built-in baseline, which it carries whether or not the fetch is made. And asking for no fetch — `--fetch-trust=false` — registers the entry from the flags, exactly as it does online.

It is met wherever a registry is added: `aggrega registry add`, `aggrega config init --registry <host>`, the `aggrega/registryAdd` and `aggrega/configInit` requests of [`aggrega serve`](../cli/aggrega-serve.md), whose error message carries the short code ahead of the sentence, and the registration tools of [`aggrega mcp`](../cli/aggrega-mcp.md), which run those commands. Seeding a configuration takes no identities or key, so offline it can seed only the hub; add any other registry with `aggrega registry add` instead.

Emitted message, which is the condition's own sentence:
> a registry other than the official hub is not registered offline without a trust policy supplied by hand, because the policy it advertises cannot be fetched; register it once while online, or pin its trust by hand with `aggrega registry add <host> --identity <identity>=<issuer>` or `--key <public-key-file>`

framed by the command that met it and the registry it names:
> aggrega registry add: `<host>`: `<the message above>`

**How to fix:** register the registry once while the workspace is online — pass `--offline=false` for that one run, or clear the `offline` setting — so its advertised policy is fetched and pinned; nothing needs repeating afterwards, since later pulls verify against the pinned copy. Where you cannot go online, supply the policy by hand: one or more `--identity <identity>=<issuer>` entries for a keyless registry, or `--key` pointing at its public-key file for a keyed one, which is what you would have pinned from its advertisement.

### A tag is already published with different content

<!-- covers: pkg/oci.ErrImmutableTagConflict -->

A refusal on publishing, not on a build. Published bytes are frozen: before anything is uploaded, the target version is looked up and the digest it points at is compared with the digest the content in hand would produce. A version already pointing at different content is refused.

**Re-publishing byte-identical content is not a conflict.** The digests match, nothing is uploaded, and the command reports that the version is already published — so re-running a publish that partly succeeded is safe, and it completes the publication: the publication date the version still lacks, and its signature where the push signs, are attached, and a version lacking neither gets nothing, as [Completing a publication an earlier push left partial](../cli/aggrega-push.md#completing-a-publication-an-earlier-push-left-partial) describes.

**There is no flag that overrides this.** Changed content is published under a new version, which is what leaves consumers a version to move to deliberately rather than a version that changed underneath them.

**Emitted messages**, naming the version, the digest it holds and the digest that was offered. Publishing a catalog entity, which also names the check that verifies the version bump:
> aggrega push: `<reference>`:`<version>` is already published as `<existing digest>`; refusing to overwrite with `<proposed digest>` — publish a new version (aggrega lint --pre-publish verifies the bump): oci: tag already published with different content

and publishing a data artifact:
> aggrega push-artifact: `<reference>`:`<version>` is already published as `<existing digest>`; refusing to overwrite with `<proposed digest>` — publish a new version: oci: tag already published with different content

**How to fix:** raise the version and publish again. For a catalog entity that means `metadata.version` and the per-version directory the entity sits in, which move together. Before you do, check that the change is one you meant: the two digests differing on a version you believe you have not touched means the content on disk is not the content that was published, and finding out why is worth more than publishing over it. The pre-publish check named in the message compares a version against the one before it and is the way to confirm the bump is right.

### An entity shares its directory with another entity

<!-- covers: internal/entitypin.ErrEntitySharesItsDirectory -->

A refusal on pinning and on publishing, not on a build. Every entity kind has a directory of its own except the three a workspace root holds side by side: an Aggregate, a Release and a Manifest. A published entity is one artifact at one coordinate for each version, and the directory it is authored in mirrors that — the pin step writes the one `entity.lock` a directory has room for, and a publication packages the entity from its directory. So an entity of any other kind with another entity beside it is refused at both of those moments: by `aggrega pin`, by a pull or a push asked to pin on the author's behalf, and by `aggrega push` whether or not it pins. It is refused before anything is fetched, and nothing is written.

**A directory holding several entities still loads, lints, validates and builds.** The layout is judged only when something is produced from the directory, which is also the moment the message can name the entity in the way. A pull that does not pin writes nothing beside the entity and is not refused.

**What counts as an entity beside it** is any other YAML document directly in the same directory whose `kind:` is an entity kind. A chart's own files, a compose fragment, a Kubernetes manifest or a README are not entities, and a subdirectory — a local chart, a `source/` tree — is not beside the entity, whatever it holds. Only the kind and the name of each neighbour are read, so nothing a neighbour declares can change the answer.

**The directory's name is not judged.** An entity alone in its directory pins and publishes at the version it declares wherever that directory sits; the `<name>/<version>/` layout the standard-library catalog uses is a convention rather than a check.

Emitted message, naming the entity, every entity beside it, and the files to move:
> the entity shares its directory with another entity, and an entity of its kind has a directory of its own (Recipe `"<name>"`, beside it: Recipe `"<name>"` in `<file>`). remediation: give each entity a directory of its own — move `<file>` into a directory of its own, together with any file only that entity reads; only the Aggregate, Manifest and Release kinds may share a directory with other entities

**How to fix:** move each entity the message names into a directory of its own, taking with it the files only it reads — a local chart, an imported file, and the `entity.lock` if it records that entity's pins — and run `aggrega pin` on each one that reads a remote source or imports a file, so each lock records its own entity. Laying each out as `<kind>/<provider-or-publisher>/…/<name>/<version>/` keeps it where the standard-library catalog keeps every entity. A catalog directory is found by walking it, so a build over the catalog renders the same output after the move.

### A path names content outside the entity's own directory

<!-- covers: internal/sourceref.ErrContentOutsideEntityDirectory -->

An entity's content lives in the entity's own directory, because every file a publication of the entity carries is taken from there. A path that leaves it points at a file that would not travel with the entity, so the file is not there for anyone who receives the entity, and a pin recorded over it vouches for bytes they cannot obtain.

So every path an entity writes for content it carries is read against the directory holding the entity's file and must stay inside it. That covers a Recipe's and a FeatureRecipe's `source:` — a bare path, or the `url:` of the structured form — the file each `valuesMapping:`, `workload:` and `artifacts:` entry imports with `$import:`, and every schema a Component or a Feature imports, whole, per pillar, or for a `usesSchema` socket's `valueSchema` and `infraSchema`. Three shapes leave the directory: a path that climbs above it, an absolute path, which names a place on the machine it was written on, and a path written inside the directory that a symbolic link on the way carries out of it — a directory along the path, as well as the file at its end, that is a link leading outside the entity's directory. A path that climbs and comes back inside — `./charts/../values.tmpl` — is an ordinary path inside the directory, and so is one through a link that leads elsewhere inside it. A climb that re-enters the directory by its own name — `../1.0.0/values.tmpl` written in a directory called `1.0.0` — is refused, because the directory's name is not part of what travels: a published entity is read from a directory the consumer's cache names, where that name finds nothing. A path through a link leading out is refused because a publication would otherwise carry the bytes the link points at, from wherever it points, under a name inside the entity.

**It is refused wherever the entity is read.** A whole-catalog `aggrega validate`, `aggrega validate` on the entity's own file, `aggrega pull` and `aggrega build` refuse it as the entity's file is read, and so do `aggrega pin` of a Recipe or a FeatureRecipe and `aggrega push` of any of the four kinds, before anything is fetched, written or published. A `source:` written as a template names nothing until the build evaluates it, so a template producing a path outside the directory is refused by the build, at the moment the value exists.

**A Release is different, and so is an entity reference.** A Release points at other entities — its Aggregate, its Manifest, the Release it extends — and is never published, so nothing it reads travels anywhere: those paths, and the file a Release's `parameters:` imports, are read as written. An Aggregate's `type: ./local` reference names another entity rather than content the Aggregate carries, and is resolved on its own terms too.

Emitted message, naming the path as written:
> a path names content outside the entity's own directory (`"<path>"`). remediation: move the file into the directory holding the entity, or a directory beneath it, and name it with a path relative to that directory. An entity's content lives in the entity's own directory because every file a publication of it carries is taken from there; a path that leaves it points at a file that would not travel with the entity

and, for a path a link carries out of the directory, naming the link and where it leads:
> a path names content outside the entity's own directory (`"./frag/fragment.yaml"`, the link `<entity-directory>/frag` leads to `<elsewhere>/frag`). remediation: replace the link with a copy of what it leads to, placed inside the directory holding the entity. An entity's content lives in the entity's own directory because every file a publication of it carries is taken from there; a link leading out of it would carry the bytes it points at under a name inside the entity

The field it was read from is named on the line above the message: `resolve Recipe source …`, `resolve Recipe artifact "<key>" $import target …`, `spec.schema.values: imported schema …`, or, for a templated source, `node "<name>" source`.

**How to fix:** move the file into the entity's directory, or a directory beneath it, and write its path relative to that directory. Where a link carries the path out, replace the link with a copy of what it leads to inside the entity's directory. A chart several Recipes share is copied into each Recipe's directory, since each is published on its own; a schema several Components share belongs in a SchemaLibrary, which each Component then references by identity, and a mapping, workload or artifact body several Recipes share belongs in the matching library kind.

### An entity kind has no artifact media type

<!-- covers: pkg/oci.ErrUnknownEntityKind -->

A refusal on publishing, not on a build. Each publishable entity kind has a media type for each of the two shapes its artifact takes — its document alone, or an archive of the document and the files it declares — and packaging an entity looks that up by kind. This condition reports a kind with no entry.

**No build reaches it.** The one other place the same lookup runs treats a missing entry as "this is not a library" and carries on, so the condition is never surfaced there.

Emitted message, which is the condition's own sentence:
> oci: unknown entity kind for mediatype dispatch

**How to fix:** check the `kind:` field of the file you are publishing against the entity kinds the language reference lists — a misspelled or unsupported kind reports here, and correcting the field is the whole remedy. Where the kind is one the language reference documents as publishable, that is a gap in the toolchain rather than in your entity, and it is worth reporting with the kind quoted.

### A published archive carries an entry Windows cannot use

<!-- covers: internal/publishops.ErrWindowsUnusableEntry -->

An advisory raised when an entity is published; it never stops anything, and a build does not raise it. An entity that carries files beside its document publishes as an archive, and each name the archive holds — the entity document's own file name, then each file it carries — is judged by the rule the halt "A name the operation writes holds a part Windows cannot hold" above applies on Windows: a part Windows reserves for a device, in any letter case and whatever extension follows, or a part ending in a full stop or a space. So `aux/x.yaml` draws it for its directory `aux`, `report.` for its final full stop, and a document called `con.yaml` that imports a schema file for its own name. An entity that carries nothing publishes as its document alone, laid out under a name the product chooses, and a Plugin publishes no archive, so neither draws it.

**It is raised on every platform, and it refuses nothing.** A workspace on Windows refuses to lay out such an entry, under that halt, so it cannot use the version; the advisory is how the publisher learns this before someone on Windows does. The publication, or its dry run, goes ahead or stops exactly as it would without it.

**Every surface that publishes an entity raises it, each in its own shape.** `aggrega push`, and its `--dry-run`, prints one line per entry on standard error, each opening with `warning: `. The assistant's `publish-entity` tool answers with the entries as `windows_unusable_entries`, and the answer's text names them too. `aggrega serve` answers `aggrega/publishEntity` with them as `windowsUnusableEntries`, and passes the warning lines themselves to a request that asked to be reported on. Each answer leaves the field out where there is no such entry.

Its message opens:
> an entry this publication carries cannot be used on Windows

and continues with the entry and the first of its parts Windows cannot hold, then the remedy. Taught under "A published archive carries an entry Windows cannot use" in [warnings.md](./warnings.md).

**How to fix:** rename the part the message names, on disk and wherever the entity's declarations name the file, and publish again. Where the version is not meant to be used on Windows, nothing needs changing.

### Two catalog identities publish to one repository location

<!-- covers: pkg/oci.ErrOCILocationCollision -->

A refusal on checking a whole catalog, not on a build. Where an entity is published to is derived from its identity and lowercased, so two identities differing only in letter case land at the same place. Publishing both would leave one entity's bytes overwritten by the other's, and nothing in either entity would say so.

The check runs over the whole catalog at once, because a collision is a property of a pair rather than of either entity on its own — neither is wrong by itself, and reading either in isolation shows nothing.

Emitted message. The condition's own sentence opens it, and every colliding group follows, each naming the shared location and the identities that reach it:
> oci: distinct catalog identities map to the same OCI repository location:
>   - `<location>` <- `<identity>`, `<identity>`

**How to fix:** rename one of the entities the message names, in its `metadata.name` and in the directory that mirrors it. Which one to rename is yours to choose; the case-only pairs are the common shape, and picking one spelling and using it consistently is what stops the pair recurring. Renaming is a real change to an entity's identity, so anything referring to the old name has to move with it — that is a reason to settle the collision before either name is published rather than after.

### Keyless signing was asked for without the services it needs

<!-- covers: pkg/signing.ErrKeylessLive -->

A refusal on signing while publishing, not on a build. Keyless signing has no offline form: it obtains an identity, has a short-lived certificate issued for it, records the signature where it can be checked later, and then discards the key. Every one of those is an exchange with a running service. This condition reports that the identity the flow starts from was not available, so the flow is refused rather than started and abandoned partway.

Two shapes report it: nothing configured to supply an identity at all, and something configured that yielded nothing.

**An offline workspace reports differently**, under the refusal that covers every network step, because the refusal happens before an identity is ever asked for.

**Emitted messages.** No source of identity:
> signing: keyless signing requires a live identity provider, Fulcio, and Rekor: an identity token source is required

and a source that produced nothing:
> signing: keyless signing requires a live identity provider, Fulcio, and Rekor: an identity token is required

**How to fix:** the fix is the operator's, in how the publish is run. In an automated pipeline the identity comes from the pipeline's own credentials, so this usually means the job was not granted the permission that issues them. Run interactively and the identity comes from signing in, which the command will prompt for. Where you do not want a live identity at all, sign with a held key instead — that path needs none of these services, and it is what to use from an environment that cannot reach them.

### An unsigned publish targets a registry or a policy that requires a signature

<!-- covers: pkg/signing.ErrUnsignedPushRefused -->
<!-- covers: pkg/signing.ErrSigningPolicyRequiresSignature -->

A refusal on publishing, not on a build. Where a signature is required, unsigned content is not published. The check runs before any bytes are uploaded, so nothing partial reaches the registry.

**Two conditions, because a requirement has two sources and the remedies differ.** One is the destination registry's own stance, which applies to everything published there. The other is the workspace's signing policy, which covers a set of artifact kinds wherever they are published. When both hold, the registry's is reported, because naming the destination is the more useful of the two.

**There is no flag that publishes unsigned content here.** Turning signing off explicitly does not relax the refusal — it only changes the default for artifacts where signing is optional.

The signature is produced before the upload rather than after, so a signing failure also lands here and nothing is published.

**Emitted messages.** The registry's own requirement:
> aggrega push: registry `"<host>"` requires signatures; re-run signing the artifact (there is no flag to push unsigned content here): signing: registry requires signatures; refusing to push unsigned content

the workspace policy's, which names the kind that brought the artifact into scope:
> aggrega push: the signing policy requires a signature for kind `"<kind>"`; re-run signing the artifact (there is no flag to push unsigned content here): signing: signing policy requires a signature for this artifact kind; refusing to push unsigned content

and a signature that could not be produced, which reports under the registry's condition and quotes the underlying failure:
> aggrega push: sign `<reference>`:`<version>`: `<the underlying failure>`: signing: registry requires signatures; refusing to push unsigned content

One shape of signing failure is named specifically, because a generic rejection sends people to re-obtain a credential that cannot help:
> aggrega push: sign `<reference>`:`<version>`: the identity token carries no verified email or subject claim — the OIDC flow/client did not return an email-scoped identity (re-exporting or re-acquiring the token will not help); configure the identity provider/client/scope to return one: `<the underlying failure>`: signing: registry requires signatures; refusing to push unsigned content

**How to fix:** the fix is the operator's. Sign the artifact and publish again — either with a held key or with the keyless path, whichever the workspace is set up for. Where you did not expect a signature to be required, the message says which source required it: a registry's own stance is in that registry's entry in `.aggrega-config.yaml`, and the kind-scoped requirement is in the workspace-wide signing policy. Relaxing either is a decision about what you are willing to publish unsigned, so narrowing the policy's scope is usually better than switching it off.

### References signed together need different signing credentials

<!-- covers: pkg/signing.ErrMixedSigningCredentials -->

A refusal on signing, not on a build. `aggrega sign` given several references, and `aggrega deprecate --from` given a batch file, sign everything they are given with one credential: a single held key, or a single keyless identity. Which credential a reference needs is decided by the configuration for its registry — a `signing.key_path` that applies to that registry selects the key it names, and where none applies the reference is signed keyless. When the references named together would need different credentials — a key for one registry and none for another, or two different keys — nothing is signed, and the message names the registries on each side.

The check runs before an identity is asked for and before any registry is read, so nothing is signed or attached and nobody is prompted for a run that is not going ahead. A signature cannot be recalled from anyone who has fetched it, which is why the run is refused rather than signed with whichever credential one of the references needs.

**A key passed with `--key` decides for every reference.** It applies to every reference named, whatever the configuration says for each registry, so such a run is never refused here.

It is met wherever a batch is signed: `aggrega sign`, `aggrega deprecate --from`, the `aggrega/signArtifacts` and `aggrega/deprecateArtifact` requests of [`aggrega serve`](../cli/aggrega-serve.md), whose error message carries the short code ahead of the sentence, and the `sign-artifacts` and `deprecate-artifact` tools of [`aggrega mcp`](../cli/aggrega-mcp.md). A tool call reaching a server over a listener never spends a key the configuration names, so there every reference is signed with the identity the call sends and the call is not refused here.

Emitted message. The condition's own sentence opens it, each credential follows with the registries it would sign for, and the remedy comes last:
> aggrega sign: signing: the references named together need different signing credentials, so nothing was signed (`<registry>` signs with the held key signing.key_path names, `<registry>` signs keyless: no signing.key_path applies). remediation: sign them in separate runs, one per credential: the references on `<registry>`, then the references on `<registry>`; each run signs as it would on its own

and, where a registry in the batch requires signatures, naming it at the end of the remedy:
> aggrega sign: signing: the references named together need different signing credentials, so nothing was signed (`<registry>` signs with the held key signing.key_path names, `<registry>` signs keyless: no signing.key_path applies). remediation: sign them in separate runs, one per credential: the references on `<registry>`, then the references on `<registry>`; each run signs as it would on its own, and `<registry>` requires signatures, so this refusal holds back signing that would otherwise have gone ahead rather than signing that cannot be done

A second registry with a key of its own is named as signing "with a different held key". The path of a key is never printed: the message names the setting, which is what you can change.

**How to fix:** split the references by the credential their registries need and run once per credential — one `aggrega sign` naming the references on the registries signed with a key, another naming the rest; for `aggrega deprecate --from`, one batch file per credential. Each run then signs as it would have on its own. To sign every reference with one key in a single run instead, pass that key with `--key`.

### A detached signature does not verify against the key supplied

<!-- covers: pkg/signing.ErrSignatureInvalid -->

The negative outcome of checking a bare signature over a payload against a public key, entirely offline: the payload differs from what was signed, the signature has been altered, or the key is not the one that produced it.

**Nothing in the shipped toolchain reaches it.** The check it belongs to has no caller outside its own tests, so no command a user runs — build, pull or publish — reports it. It is catalogued here so that the code resolves to something, not because a build can print it. The verification a pull actually performs is over a full signature bundle and reports separately.

Emitted message, quoting what the verifier reported:
> signing: signing: signature does not verify: `<what the verifier reported>`

**How to fix:** nothing in your entity files causes this, and nothing you can write in a catalog or a workspace clears it. Where you are running the published command-line tool, this is not a condition you can reach, and a signature problem you are actually looking at is being reported by one of the bundle-verification conditions above instead. Where you use the signing package directly from software of your own, the payload, the signature and the key have to be the three that belong together — a payload re-serialised between signing and verifying is the usual cause, since the bytes then differ even though the content reads the same.

### A resolved artifact is not a documentation bundle

<!-- covers: pkg/docscache.ErrNotDocsBundle -->

A reference that resolves to an artifact of some other kind — a catalog entity, a plugin — is rejected rather than cached as documentation, so a mis-pointed reference fails where it is pointed rather than later as a bundle that cannot be read.

**Where it arises.** The documentation bundle is acquired into the cache every project on the machine shares, from the workspace's configured registry under the reserved `docs` namespace: by the assistant-facing server once, when it starts and before it answers anything, and by `aggrega explain` and an editor's explanation of a code the first time either needs it — in each case only where the machine holds no copy the workspace's signature check admits. This is the check every acquisition runs on what came back.

**It never stops a session.** The acquisition reports its outcome on the server's log stream and the connection proceeds either way; what a rejected artifact costs is the documentation resources, which then answer not-found for that session.

Emitted message, naming the reference and both media types:
> docscache: `<reference>`@`<version>` has media type `"<what was found>"`, want `"<what a documentation bundle is>"`: docscache: artifact is not a documentation bundle

**How to fix:** nothing in your entity files causes this, and no authoring change clears it. The reference the acquisition used is pointing at something that is not a documentation bundle — check the workspace's configured registry, since the bundle reference is derived from it, and a reference that is well-formed and points at another artifact resolves successfully and fails only here.

### A page is absent from a documentation bundle

<!-- covers: pkg/docscache.ErrPageNotFound -->

A condition the documentation resource surface absorbs. A documentation bundle was cached and its contents verified, and the page asked for is not in it. It is distinct from having no bundle at all: the bundle is present and sound, and the entry is missing from it.

**It reaches no build and no diagnostic.** Its one consumer is the surface that serves documentation pages to an editor or an assistant, and that surface turns it into an ordinary not-found answer for the resource that was requested. So the condition is answered where it arises and never becomes a message anyone reads.

**Which of the two not-found answers you get is worth knowing apart**, even though the surface renders them the same. This one means the bundle is cached and sound and the page is not in it. The other — no bundle the workspace may read, because none is cached or the only copy is one the workspace's signature check refuses — means the acquisition did not complete, and the server's log stream says why.

Emitted message, naming the page and the bundle it was looked for in:
> page `"<page>"` in `<reference>`@`<version>`: docscache: page not found in documentation bundle

**How to fix:** nothing is broken in your files. A page that is missing from the bundle is missing because the bundle predates it or the path asked for is not the path it is published under — the bundle is acquired at the version the server reports as its own, so a page added after that version is not in it. Where the page has never existed, the request named a path the documentation does not use, and the published documentation is where to find the one it does.

### An edit would produce a document its schema refuses

<!-- covers: internal/editops.ErrEditRefusedInvalidResult -->

A refusal on a document edit, not on a build. One structured edit — adding a component, attaching a Feature, wiring an edge, or setting a value — is composed and spliced into the document, and the result is then checked against the schema for the kind of document it is. Where that check objects, the edit is refused and nothing is written. It belongs to [aggrega edit-document](../cli/aggrega-edit-document.md), and to the same capability reached by an editor over [aggrega serve](../cli/aggrega-serve.md) or by an assistant, which are thin entry points onto one implementation.

**The kind is read off the document, never supplied by the caller.** A caller naming the kind could name the wrong one, and the result would then be checked against a schema the document is not written to — which would admit exactly the edit this check exists to refuse.

**The file is left byte-for-byte as it was**, and the write is atomic, so a refused edit is indistinguishable from one never attempted, and a corrected request can be retried against the document you started with.

**Its subject is a request that was well-formed.** The request named an edit this capability applies, and the document it would have produced is one the authoring schema would have refused had you typed it by hand — which is why no authoring rule is restated for it: asking a Release to carry a developer value is refused by the same schema either way. A request that never addressed an edit — a node path that reaches nothing in the document, a value written as a mapping where a scalar is called for, an entry already there carrying something else — is refused on its own terms, and each surface reports that in its own channel.

**A document that was already invalid reports it too.** The check runs even where the edit changed nothing, so an edit against a document the product would refuse to read says so rather than reporting success.

Emitted message, carrying the schema's own objection after the sentence — the document kind and the file, then the position, the key at fault and what the schema said there:
> the edit was refused because the resulting document would not be valid, and nothing was written: document envelope validation failed (`<kind>`, at `<path>`); `<line>`:`<column>`: `<field-path>`: … `<the schema's own objection>`

**How to fix:** open the document at the position the message quotes and read the objection, which says what the schema wanted at that key. The change to make is usually to the request rather than to the document — ask for an entry the schema admits in that place, and the same request applies cleanly. Where the key is one that document's kind may not carry at all, it belongs on the authoring surface that may, and the entity page for the kind names the fields it declares. What is *semantically* admissible is not decided at this point — whether a dependency socket is one the producer declares, say — so this refusal is always about the shape of the document, never about what may be consumed across a connection.

### A Release chain's links disagree about the routing shape

<!-- covers: pkg/resolver.ErrReleaseChainComposesBothRoutingKeys -->

A Release routes its Aggregate's components one of two ways: named boundaries under `boundaries:`, or top-level components under `components:`. The two are mutually exclusive, and a single document declaring both is refused as it is read. This condition is the same rule across an `extends:` chain: a base that declares named boundaries and a child that declares top-level components are each well-formed on their own, and it is only folding them together that brings the two choices into one resolved Release.

**Neither document is wrong by itself**, which is why the message names both of them and both keys. A diagnostic naming only the Release the build was pointed at would send you to the file with nothing wrong in it.

**A chain whose links agree is untouched.** Every link declaring named boundaries composes normally, and so does every link declaring top-level components. It is the mix that stops.

Emitted message, naming the two files and the key each declares:
> release extends chain composes both named boundaries and top-level components: declare one routing shape across the chain, never both

**How to fix:** choose the routing shape the chain should use and write it the whole way down. Where the base declares named boundaries, a child that wants to configure components addresses them inside the boundary that holds them rather than at the Release root — which is also what lets it change one component's sizing without restating the topology. Where the base declares top-level components, a child that needs named boundaries is describing a different routing shape than its base, and is better authored as its own Release than as a child of that one.

### An annotation key uses a prefix the platform reserves

<!-- covers: internal/lintops.ErrAnnotationPrefix -->

A refusal on checking an entity against the publishing conventions, not on a build. The `aggrega.ai/` prefix, and `feature.aggrega.ai/` outside a Feature, are platform-owned: a key written under one carries meaning the platform assigns, so an entity of your own that writes there is claiming a namespace it does not hold.

**It advises while you author and refuses at the publish gate**, and both readings name this one condition. What was found is the same either way; only the consequence differs. That split is how most of the publishing-conventions rules catalogued here behave, so it is stated once and taken as read in the entries below that do not say otherwise — the two that compare against an already-published version say so in their own entries, because those cannot run over local content at all.

Its message opens:
> an annotation key on the entity uses a prefix the platform reserves

**How to fix:** move the key under a prefix your own organisation owns. Where a workspace has a reason to write under the reserved prefix anyway, the rule is one of the opt-outs described under "The discipline rules" in [aggrega-lint.md](../cli/aggrega-lint.md).

### An entity's name does not follow the shape its kind expects

<!-- covers: internal/lintops.ErrNameShape -->

A refusal on checking an entity against the publishing conventions, not on a build. Each entity kind carries a name-shape convention — segment counts for the cloud-native kinds, PascalCase for the library kinds — and the name this entity declares does not match the one its kind expects.

Its message opens:
> the entity's name does not follow the documented name shape for its kind

**How to fix:** rename the entity to the shape its kind expects; the conventions per kind are listed under "The discipline rules" in [aggrega-lint.md](../cli/aggrega-lint.md), along with the opt-out for a catalog that deliberately names entities its own way.

### A schema uses a dynamic reference that cannot be resolved ahead of time

<!-- covers: internal/lintops.ErrDynamicRefs -->

A refusal on checking an entity against the publishing conventions, not on a build. A schema the entity carries uses a dynamic reference construct, whose target is chosen while a document is being validated rather than fixed when the schema is written. References are expanded ahead of time here, so there is no validation in progress for such a construct to resolve against.

Its message opens:
> a schema in the entity uses a dynamic reference construct that cross-document reference resolution cannot follow

**How to fix:** replace the dynamic construct with a plain reference naming the target directly. Where the schema genuinely needs the construct and will not be referenced across documents, the rule carries an opt-out described under "The discipline rules" in [aggrega-lint.md](../cli/aggrega-lint.md).

### A schema declares an identifier the platform owns

<!-- covers: internal/lintops.ErrIDOverrides -->

A refusal on checking an entity against the publishing conventions, not on a build. A schema the entity carries declares an identifier of its own, where the canonical identifier is derived from the entity's identity. The declared one displaces the derived one, so a reference written against the canonical identifier stops resolving.

Its message opens:
> a schema in the entity declares an identifier of its own, where the platform owns that schema's identity

**How to fix:** remove the declared identifier and let it be derived. The opt-out, for a schema deliberately published under an identifier of its own, is described under "The discipline rules" in [aggrega-lint.md](../cli/aggrega-lint.md).

### A Component's category label and its directory name different categories

<!-- covers: internal/lintops.ErrCategoryMatchesDirectory -->

A refusal on checking an entity against the publishing conventions, not on a build. A Component carries a category label, and it is filed under a category directory; the convention is that the two name the same category, so that the directory a reader browses and the label a selector matches cannot disagree.

Its message opens:
> the entity's category label does not match the category directory the entity is filed under

**How to fix:** change whichever of the two is wrong so they agree — either move the file under the directory its label names, or correct the label to the category the directory names. The closed set of categories, and the opt-out, are under "The discipline rules" in [aggrega-lint.md](../cli/aggrega-lint.md).

### A schema extension is written directly into schema content

<!-- covers: internal/lintops.ErrXAggregaDiscouragement -->

A refusal on checking an entity against the publishing conventions, not on a build. A Component or Feature writes an Aggrega schema extension directly into its schema content, where the entity carries a first-class surface for declaring the same thing. The directly-authored form works, and the convention prefers the declared surface because that is the one the entity pages teach and the one tooling reads.

**This is the one rule in the group that a build also reports**, as an advisory that does not stop the build. Checking the entity against the publishing conventions at the publish gate raises the same finding to a refusal.

Its message opens:
> the entity writes an Aggrega schema extension directly into schema content instead of declaring it under `usesSchema` or `featuresSchema`

**How to fix:** move the extension onto the entity's own socket or attachment surface, which is where the entity pages for [component.md](../entities/component.md) and [feature.md](../entities/feature.md) declare it. The opt-out is under "The discipline rules" in [aggrega-lint.md](../cli/aggrega-lint.md).

### A Plugin pins neither runtime cap, so the platform's own apply

<!-- covers: internal/lintops.ErrPluginDefaultLimits -->

An advisory raised when an entity is checked against the publishing conventions, while you author and at the publish gate alike; it never stops anything, and a build does not raise it. A Plugin declares the memory ceiling and the time limit the host applies when it loads and runs the plugin. One declaring neither runs under the platform's defaults, which is a supported outcome rather than a mistake — so what this reports is that the defaults are in effect and that pinning them explicitly is available.

Its message opens:
> the Plugin entity declares no runtime resource cap of its own, so the platform defaults apply

**How to fix:** pin the caps the plugin actually needs, or leave the defaults in place deliberately. It carries no opt-out setting, and the reason is that it reports a fact about the entity rather than a judgement about it: there is nothing to relax. The fields are described on [plugin.md](../entities/plugin.md).

### An attachment slot admits only secret material without saying it handles it

<!-- covers: internal/lintops.ErrSecretSlotDeclaresSensitive -->

An advisory raised when an entity is checked against the publishing conventions, while you author and at the publish gate alike; it never stops anything, and a build does not raise it. An attachment slot can pin, through its selector, that only a secret-bearing Feature may fill it, and it can separately record that whatever fills it handles secret material. The selector states which fills are admissible; the record states the handling. A slot that pins the first and omits the second leaves the handling to be inferred from the selector rather than read off the slot. Every slot an entity declares is checked: one of its own attachment block, and, on a Component, one a dependency socket declares for each connection wired through it — the finding about a socket's slot names the socket beside the slot.

Its message opens:
> an attachment slot admits only secret material and does not declare that it handles it

**How to fix:** declare the handling on the slot beside the selector that pins it. It carries no opt-out setting, for the reason the Plugin-caps rule carries none: it reports a fact about the entity and leaves the decision with you.

### A Recipe publishes a `provides` key its Component does not declare, checked at publication

<!-- covers: internal/lintops.ErrProvidesDeclaredByComponent -->

An advisory raised when an entity is checked against the publishing conventions, while you author and at the publish gate alike; it never stops anything, and a build does not raise it. A Recipe publishes a key under `provides:`, and the Component the Recipe implements does not declare that key in the `provides` pillar of its schema. A consumer wiring across a connection reads the Component's declared contract rather than whatever the Recipe emits, so the key is produced and then refused where something tries to consume it.

🔴 **Two conditions describe this, and they are not the same one.** The advisory a build reports is documented above under "A Recipe publishes a `provides` key its Component does not declare"; this one is raised when the entity is checked against the publishing conventions, and it carries its own code. The finding is the same fact met on two surfaces — read the code in the diagnostic to tell which you are holding.

Its message opens:
> the Recipe publishes a provides key the Component it implements does not declare, so a consumer wiring that key is refused

**How to fix:** declare the key on the Component, so the contract a consumer reads includes what the Recipe emits — or stop publishing it from the Recipe where nothing is meant to consume it. The opt-out is under "The discipline rules" in [aggrega-lint.md](../cli/aggrega-lint.md).

### A Component's metrics annotation and its provides key disagree

<!-- covers: internal/lintops.ErrMetricsCredentialAnnotationMatchesProvides -->

An advisory raised when an entity is checked against the publishing conventions, while you author and at the publish gate alike; it never stops anything, and a build does not raise it. A Component can state how its product's metrics authenticate, in its annotation `observability.aggrega.ai/metrics-credential` — `none`, `target-key` or `separate-token` — and it can declare the provides key `metrics_credential_required`, which each of its Recipes publishes to say whether one instance's metrics need a credential. The two are one fact about the product seen from two sides, so a Component stating that its metrics take no credential declares no such key, and one stating that they take a credential declares it. This condition reports a Component where the two disagree, naming the Component, the annotation's value and the key that is extra or missing.

Its message opens:
> a Component's annotation stating how its metrics authenticate disagrees with whether it declares the provides key saying an instance's metrics need a credential

**How to fix:** correct whichever of the two is wrong — declare `metrics_credential_required` in the `provides` pillar, and publish it from each Recipe, where the metrics take a credential; remove it where they take none; or change the annotation to the value that describes the product. It carries no opt-out setting, for the reason the Plugin-caps rule carries none; which values it reads, and which Components it leaves unread, are under "The discipline rules" in [aggrega-lint.md](../cli/aggrega-lint.md).

### A connection and the target it reaches do not name one key

<!-- covers: internal/lintops.ErrConnectionCredentialMatchesTargetKey -->

An advisory raised when a Release is checked against the publishing conventions; it never stops anything, and a build does not raise it. A server that checks a key holds the key it verifies in a slot of its own, and a caller presents a key on the connection it reaches that server through. Neither end sees the other's, so the two are one key only because their authors write the same locator at both ends. This condition reports a connection whose target declares the slot for the key it requires of its callers, where they are not: the connection carries a credential and the target's key slot is unfilled, the target's key slot is filled and the connection carries no credential, or both are filled and the two write their locators differently.

**Unlike the rules above it, this one reads a whole Release rather than one entity**, so it is met only when a Release is checked and never at the publish gate, which checks one entity on its own; wherever it is reported it is advice. The finding names the component, the connection, the target and the two slots, and never quotes either locator. A scrape — a connection on the `scrape_target` socket — is judged by what its target states about its metrics: not at all where the target's `observability.aggrega.ai/metrics-credential` annotation says `none`, never against the target's key where it says `separate-token`, and like any other connection otherwise; a connection on any other socket is judged whatever the target states.

Its message opens:
> a connection and the target it reaches do not name one key: they write different locators for it, or only one of them names one

**How to fix:** have both ends read one parameter — the connection's `credential` and the target's `api_key` — so the key the caller presents and the key the server verifies cannot be written apart; or, where a connection is meant to present no key, take the credential off it. Which slots are read, what is compared and the opt-out are under "The discipline rules" in [aggrega-lint.md](../cli/aggrega-lint.md).

### The change being published breaks what the evolution rubric allows

<!-- covers: internal/lintops.ErrSchemaEvolution -->

A refusal on the check that precedes publication, not on a build. The version being published is compared against the version already published before it, and the difference between them is classified against a documented rubric. This condition reports that the difference is one the rubric objects to.

**It needs a published predecessor to compare against**, so it is the one rule in this group that cannot run over local content alone: with no registry consulted there is nothing to compare, and the check is skipped rather than passed.

Its message opens:
> the version being published changes the published predecessor in a way the documented evolution rubric objects to

**How to fix:** read the classification in the diagnostic, which names what about the change the rubric objected to, and either make the change compatible or publish it under a version that admits it. The rubric is set out under "The version-bump rubric" in [aggrega-lint.md](../cli/aggrega-lint.md).

### The version offered is a smaller bump than the change requires

<!-- covers: internal/lintops.ErrPublishBumpBelowClassification -->

A refusal on the check that precedes publication, not on a build. The change being published is classified against the evolution rubric, and the version offered for it is a smaller step than that classification calls for — a removal or a narrowing offered as a patch, say. Over-bumping is always accepted; it is under-bumping that stops here.

**Unlike the rules above it, this one is decided here rather than by the conventions plugin.** Which bump was offered is known only at the moment of publication, and no compilation is running then, so the comparison between the classification and the offered version is made at that point.

Its message opens:
> the version bump being published is smaller than the evolution check's classification of the change requires

**How to fix:** publish under the version the classification calls for; the diagnostic names which that is. Where you believe the change is smaller than it was classified as, the rubric under "The version-bump rubric" in [aggrega-lint.md](../cli/aggrega-lint.md) says what puts a change in each class. The first publication of an entity has no predecessor, so the comparison is skipped and reported as not performed rather than passed.

### An import stopped partway through translating a source

<!-- covers: internal/importops.ErrImportHalted -->

A refusal on turning a foreign source description into draft authoring files, not on a build. The importer reported a diagnostic serious enough to stop the translation, so what it produced is partial: some of the source became draft authoring files and some of it did not.

**The partial result is deliberate rather than wreckage.** It names the outcome and not the cause — what could not be translated is reported in the diagnostics beside it, one per construct the importer could not carry across, in the importer's own words. This condition is what lets a caller tell "the import stopped and produced part of an answer" apart from "the import failed outright", which are different situations with different next steps.

Its message opens:
> the importer reported a diagnostic that stops the import, so the source was not fully turned into draft authoring files

**How to fix:** read the diagnostics reported beside it — each names a construct in the source the importer could not translate. The fix is in the source you handed in, or in finishing the draft by hand: an import produces a starting point to edit, so a construct that did not survive translation is one to author directly on the Aggrega side. [aggrega-import.md](../cli/aggrega-import.md) describes what the command produces and where it writes.

### More than one importer recognises the source

<!-- covers: internal/importops.ErrAmbiguousImportFormat -->

A refusal on turning a foreign source description into draft authoring files, not on a build. The import named no format, so the format was recognised from the signatures the importers declare — those in the workspace's catalog and the compiler's [core importers](../plugins/core-importers.md) alike, each of which names the syntax a source is read in, the file names it applies to, and the paths its parsed tree must or must not carry — and signatures of importers serving more than one format matched the source. The import does not choose between them: which format a source is in is the importers' statement, not the compiler's, and choosing would be a guess that hands the source to an importer it may not be for.

**This is not the same as one format advertised by more than one importer**, described under "A parse or import format is advertised by more than one plugin" above. There the format is settled and the importers serving it compete, so a `plugins.importer` entry chooses among them; here the formats themselves differ, so no attachment settles it and naming the format does. An importer recognising a source recognises it as every format it advertises, so an importer advertising more than one format, one of whose signatures matches, is refused here as well.

Its message opens:
> more than one importer recognises the source

The rest of the message names the source and every format it was recognised as, in the order of the importers' identities and versions, then the remedy:
> more than one importer recognises the source (source `"<source>"`, recognised as `"<format>"`, `"<format>"`). Pass --format to name the one to read it as (for example --format `<format>` or --format `<format>`)

**How to fix:** name the format — `--format` on `aggrega import`, or `format` on the assistant's import tool and the session's `aggrega/import` method. Where one of the importers should never recognise such a source, the change is to that importer's signatures, which its author declares in its describe() self-report and its Plugin entity records when it is generated; or, where it is one the workspace's catalog holds, leave it out of the catalog the workspace reads — a core importer is always among those tried, so a source one of them recognises alongside another importer is settled by naming the format. [aggrega-import.md](../cli/aggrega-import.md) describes how a format is recognised.

### No importer recognises the source

<!-- covers: internal/importops.ErrUnrecognisedImportFormat -->

A refusal on turning a foreign source description into draft authoring files, not on a build. The import named no format, so the format was recognised from the signatures the importers declare — those in the workspace's catalog and the compiler's [core importers](../plugins/core-importers.md) alike — and the signatures of no format matched the source. The import does not guess: handing the source to an importer that never declared it reads that shape would draft from a source it may not be for.

**This is the counterpart of "More than one importer recognises the source" above.** There several formats claim the source; here none does. In both, naming the format settles it, and nothing is written until it is named.

Its message opens:
> no importer recognises the source

The rest of the message names the source, then the remedy and every format the catalog's importers advertise, in the order they were read:
> no importer recognises the source (source `"<source>"`). Pass --format to name it explicitly (for example --format `<format>` or --format `<format>`)

Where no importer advertises a format at all, the remedy says so in place of the examples.

**How to fix:** name the format — `--format` on `aggrega import`, or `format` on the assistant's import tool and the session's `aggrega/import` method, each of which words the refusal around the field it takes and opens it with this condition's short code; the session's answer also carries both of the condition's codes in its data. Where the source should have been recognised, the change is to the signatures of the importer serving its format, which its author declares in its describe() self-report and its Plugin entity records when it is generated. [aggrega-import.md](../cli/aggrega-import.md) describes how a format is recognised.

### An importer that declares no file patterns is handed a directory

<!-- covers: internal/importops.ErrImporterDeclaresNoFilePatterns -->

A refusal on turning a foreign source description into draft authoring files, not on a build. The source named is a directory, and a directory is handed to its importer as exactly the files the importer's declared file patterns select — so which files of a directory an importer reads is the importer's own statement. The importer serving the source's format declares no file patterns: it reads one file, and says nothing about which files of a directory are its.

**Nothing is opened.** The import stops once the importer is resolved and before any file of the directory is read, rather than handing the importer every file the directory holds.

Its message opens:
> the importer serving the source's format declares no file patterns, so it reads one file and cannot read a directory

The rest of the message names the format, the importer and the directory as you named it, then the remedy:
> the importer serving the source's format declares no file patterns, so it reads one file and cannot read a directory (format `"<format>"`, importer `"importer/<name>"`, directory `"<directory>"`). Import one of the directory's files on its own instead; the importer reads a directory once it declares the file patterns its files are named by

**How to fix:** import one file of the format on its own. For an importer to read directories of its format, its author declares the patterns its files are named by — the `files` of a recognition signature in its describe() self-report, which its Plugin entity records when it is generated. [aggrega-import.md](../cli/aggrega-import.md) describes what an import of a directory reads.

### No file in the directory matches the importer's file patterns

<!-- covers: internal/importops.ErrImportDirectoryMatchedNothing -->

A refusal on turning a foreign source description into draft authoring files, not on a build. The source named is a directory, the format is settled, and the importer serving it declares file patterns — but no file the directory holds, at any depth, matches one of them. Handing the importer no source at all would have it fail on an empty one, in words about content rather than about which files were read, so the import stops here with nothing read.

Where the format was recognised rather than named, the importer whose signature recognised the directory matched one of its files, so this is met only where the importer that runs is not that one — another importer of the same format a `plugins.importer` entry selects, or another version of it.

Its message opens:
> no file in the directory matches the file patterns the importer serving the source's format declares

The rest of the message names the format, the importer, the directory as you named it and every pattern the importer declares, then the remedy:
> no file in the directory matches the file patterns the importer serving the source's format declares (format `"<format>"`, importer `"importer/<name>"`, directory `"<directory>"`, file patterns `"<pattern>"`, `"<pattern>"`). Name a directory holding a file one of those patterns matches, or the format of an importer whose patterns match the files this directory holds

**How to fix:** import the directory that holds the files of the format — a pattern is matched against the end of a file's path inside the directory, so a file at any depth counts — or name the format the directory's files are in. [aggrega-import.md](../cli/aggrega-import.md) describes what an import of a directory reads.

### A file read from the directory and a file named in the importer's `with.sources` have the same name

<!-- covers: internal/importops.ErrImportSourceNameCollision -->

A refusal on turning a foreign source description into draft authoring files, not on a build. The source named is a directory, and its files reach the importer as named sources, each under its path inside the directory. The `plugins.importer` entry attaching the importer names files of its own under `with.sources`, which reach it as named sources too, each under its base name — and one name is carried by both. A name is how an importer tells one source from another, so handing it both would leave one of them shadowing the other with nothing to say which; the import stops instead, with nothing handed over.

Its message opens:
> a file read from the directory and a file named in the importer's `with.sources` have the same name

The rest of the message names the name and the `with.sources` file, then the remedy:
> a file read from the directory and a file named in the importer's `with.sources` have the same name (name `"<name>"`, the with.sources file `"<path>"`). Each source reaches the importer under one name, so rename one of the two files, or leave the file out of the importer's with.sources

**How to fix:** rename one of the two files, or take the file out of the entry's `with.sources` where the directory already carries it. A `with.sources` file keeps its base name, so a file of the same name at the top of the directory is the one it meets; a file in a directory beneath carries that directory in its name. [Which importer turns a source into drafts](../cli/configuration.md#which-importer-turns-a-source-into-drafts) describes an entry's `with.sources`.

### An import's target names a capability no Recipe in the catalog binds to

<!-- covers: internal/importops.ErrImportTargetUnbound -->

A refusal on turning a foreign source description into draft authoring files, not on a build. The import was given a target — `--target` on `aggrega import`, or `target` on the assistant's import tool and the session's `aggrega/import` method — so that it drafts a Manifest mapping each drafted component type to a Recipe of that provider. The target is a provider capability, matched against the `spec.capability` each Recipe in the workspace's catalog binds to, and no Recipe there binds to the one given. A Manifest drafted for it would map nothing at all, and every component type would then read as missing from the catalog when what is wrong is the option itself — most often a misspelling.

**Nothing runs and nothing is written.** The import stops once the catalog is loaded, before the source's format is recognised and before the importer runs, so no draft is produced and no file is written, under a dry run too.

Its message opens:
> no Recipe in the workspace's catalog binds to the capability the import's target names

The rest of the message names the target exactly as given and the capabilities the catalog's Recipes do bind to, each once and in sorted order, then the remedy:
> no Recipe in the workspace's catalog binds to the capability the import's target names (target `"<target>"`, the catalog's Recipes bind to `"<capability>"`, `"<capability>"`). Name one of those capabilities as the target, or leave the target out and no Manifest is drafted; nothing was drafted or written

Where the catalog holds no Recipe at all, the message says so in place of the list, and the remedy is to add a Recipe of the provider to the catalog.

**How to fix:** name one of the capabilities the message lists — `compose` or `helm`, say, as a Recipe's `spec.capability` writes it — or leave the target out, which drafts no Manifest. Where the provider you meant is one the catalog holds no Recipe for yet, add its Recipes to a catalog folder the workspace reads first. [aggrega-import.md](../cli/aggrega-import.md) describes what an import given a target drafts.

### A child Release inherits a boundary directory that resolves where its parent writes

<!-- covers: pkg/resolver.ErrInheritedBoundaryDirectoryIsLiteral -->

An advisory. A Release extends another and inherits a boundary's output directory from it, and that directory carries no template variable — so it resolves to the same path for both, and building the child writes where building the parent writes.

**Inheriting the directory is the supported shape rather than a mistake.** A directory is a template, so a parent writes it once and a child that fulfils a parameter resolves it somewhere else with nothing duplicated; that is the whole reason a child need not restate its parent's boundary topology. What is narrow and real is the residual case this names: with no variable in it, there is nothing left to resolve differently.

**It cannot halt, and that is a property of the rule rather than caution about it.** Writing to the same resolved path is something an author may legitimately mean — a child that swaps only the rendering Recipes to compare their output, or that changes only sizing — so a rule halting on the inference would refuse legal input on a guess.

Its message opens:
> inherited boundary directory carries no template variable, so it resolves to the path the extended Release writes to

**How to fix:** where the two were meant to write to different places, put a parameter reference in the directory and let each Release fulfil it. Where writing to one path is what you meant, nothing needs changing — the advisory has told you what it will do, and the build produces its output either way.

## Finding a halt from the short code the build printed

A halting diagnostic's bracketed head names the category the failure is attributable to and, where the failure names one of the conditions catalogued here, that condition's **short code** — the letter `E` and four digits, as in `[CATALOG_ERROR E0209]`. A number is handed out once and then fixed, so a short code you paste into a report or a search still names the condition it named when you recorded it. The other two identifiers a condition carries, and which of the three to reach for when, are taught in [sentinels.md](./sentinels.md).

The condition's own message line opens with a **fixed sentence** stating the condition. Everything after that sentence varies with the occurrence — the document at fault, the authored key, the offending value, and the advice for that occurrence — and the entries above quote the whole shape for the condition each one documents. The fixed sentence is the part that is the same every time, which is what makes it the part to match on.

The table below pairs the two, scoped to this page: for every condition catalogued here, the short code a build prints and the sentence its message line opens with, against the entry above that explains the authoring fix. Entry headings are quoted exactly, so searching this page for one lands on its entry. [The table of every condition](./sentinels.md#every-condition-by-short-code) resolves a short code over every condition the compiler declares, including those no entry here covers.

Where one entry appears against two short codes, it covers two distinct conditions and each registers its own sentence; read the sentences rather than the shared heading to tell which one a build reported.

`aggrega explain <code>` does this lookup for you at the terminal, taking either of the condition's codes and printing the condition together with the entry below that documents it. It is described in [aggrega explain](../cli/aggrega-explain.md).

<!-- BEGIN GENERATED: halt-condition-sentences -->
| Short code | Opens with | Documented under |
| --- | --- | --- |
| `E0001` | `cliplugin: no plugin resolver configured` | A command-line plugin runner was built without a way to find plugins |
| `E0003` | `malformed attachment requirement` | Malformed attachment requirement |
| `E0004` | `annotation contribution overridden by an explicit value` | An explicit value displaced one an annotation supplied |
| `E0005` | `policy violation` | A governance plugin rejected the build |
| `E0006` | `required attachment slot unfilled` | Required attachment slot not bound |
| `E0007` | `selector violation` | Cross-node type safety violation via `selector:` |
| `E0008` | `attachment slot selector unsatisfied` | The Feature filling an attachment slot does not satisfy the slot's selector |
| `E0009` | `pipeline step typed-I/O contract violation` | A pipeline step's typed input or output does not satisfy its declared contract |
| `E0010` | `pipeline step failed` | A pipeline step failed |
| `E0011` | `pipeline patch targets a document not present in the set` | A pipeline patch addresses a document the set does not hold, or one with no tree to address |
| `E0012` | `pipeline patch targets an opaque (non-structured) unit` | A pipeline patch addresses a document the set does not hold, or one with no tree to address |
| `E0013` | `feature type mismatch between Aggregate and Release` | Feature type mismatch between Aggregate and Release |
| `E0014` | ``inject entry carries both `value:` and `from:`; schema requires exactly one`` | An `inject:` entry carries both a literal and a source key |
| `E0015` | `uses-edge inject dictates a delivery mechanism the socket does not permit` | `uses` edge dictates delivery on a socket that allowlists none; `uses` edge dictates a delivery mechanism outside the socket's allowlist |
| `E0016` | `jsonpatch: test operation failed` | A patch's `test` operation did not match the document |
| `E0017` | `annotation-transform plugin output was rejected: an injection targets a component coordinate the host did not supply` | An annotation-transform plugin names a component it was not given |
| `E0018` | `policy attachment settings do not satisfy the plugin's declared settings schema` | A governance attachment's settings do not match the plugin's declared schema |
| `E0019` | `endpoint requires form: reference` | A `workload:` form and the fields beside it do not agree |
| `E0020` | `schedule is not a valid cron expression` | A workload `schedule:` is not an expression the check accepts |
| `E0021` | `persistentTemplate volume requires form: stateful` | A `workload:` form and the fields beside it do not agree |
| `E0022` | `pipeline PATCH target is not parseable structured YAML/JSON` | A pipeline step addresses documents the node does not have |
| `E0023` | `form: reference requires an endpoint` | A `workload:` form and the fields beside it do not agree |
| `E0024` | `schedule requires form: scheduled` | A `workload:` form and the fields beside it do not agree |
| `E0025` | `form: scheduled requires a schedule` | A `workload:` form and the fields beside it do not agree |
| `E0026` | `imported artifact content does not match the digest recorded for it in entity.lock` | An imported artifact no longer matches the digest recorded beside its Recipe |
| `E0027` | `artifacts $import: is not a bare-name artifact-library reference (<Library>#/artifacts/<entry>)` | A library `$import:` is not written in the bare-name form |
| `E0028` | `artifacts output filename collision: two artifact outputs carry the same filename` | Two artifact outputs of one Recipe carry the same filename |
| `E0029` | `artifact template references a pillar the Recipe does not declare` | An `artifacts:` template reads a pillar the Recipe does not declare |
| `E0030` | `artifact-library import references a bundle not present in the ArtifactLibrary` | A library `$import:` names a library or an entry the catalog does not hold |
| `E0031` | `artifact-library import references an ArtifactLibrary not present in the catalog` | A library `$import:` names a library or an entry the catalog does not hold |
| `E0032` | `assembled output collision: two contributors write the same output path` | Two contributors write the same output path |
| `E0033` | `assertion failed` | An assertion stopped the build |
| `E0034` | `duplicate delivery key across attachment-inject and another inject source` | An attachment delivers a key another inject source already claimed |
| `E0035` | `provider expected to assemble its dispatch group provides no boundary assembler` | The plugin serving a provider cannot assemble what that provider combines |
| `E0036` | `merged-path assembly has conflicting assembly-name annotation values` | Chart-name mismatch on a merged helm-chart umbrella |
| `E0037` | `cross-boundary link between endpoints rendered by different providers is not supported` | A connection crosses between two different providers' assembled outputs |
| `E0038` | `derived name collision: one name is derived more than once in one key space` | The same name is derived more than once inside the output |
| `E0039` | `FeatureRecipe template references a per-component-only field with executionScope: boundary` | FeatureRecipe template references a field outside its scope's allowlist |
| `E0040` | `library $import: carries a registry host; reference the library by bare-name identity` | A library `$import:` addresses its library by registry location |
| `E0041` | `multiple contributors share an instance ID at the same dispatch path` | Instance-ID collision across boundaries assembling to the same path |
| `E0042` | `locals entry references a sibling defined later in the same block` | `locals:` entry references a sibling defined later in the same block |
| `E0043` | `template references a key the locals block does not declare` | `locals:` key does not exist |
| `E0044` | `mapping-library import references an entry not present in the MappingLibrary` | A library `$import:` names a library or an entry the catalog does not hold |
| `E0045` | `valuesMapping $import: is not a bare-name mapping-library reference (<Library>#/mappings/<entry>)` | A library `$import:` is not written in the bare-name form |
| `E0046` | `mapping-library import references a MappingLibrary not present in the catalog` | A library `$import:` names a library or an entry the catalog does not hold |
| `E0047` | `assembled output retains an unresolved cross-boundary link placeholder` | Assembled output still carries a cross-boundary placeholder |
| `E0048` | `dispatch path produced multiple provider outputs` | Path collision: two contributors emit at incompatible paths |
| `E0049` | `path template references a field not in the documented allowlist` | Path-template references a variable outside the allowlist |
| `E0050` | `pipeline /host operation from a step with no host component` | A pipeline step addresses documents the node does not have |
| `E0051` | `pipeline PATCH targets an assembler provider's pre-assembly fragments` | A pipeline patch addresses output that has not been assembled yet |
| `E0052` | `pipeline PATCH targets a document the node did not emit` | A pipeline step addresses documents the node does not have |
| `E0053` | `pipeline plugin is not compatible with the rendering provider` | A pipeline step's plugin does not claim the provider rendering what it addresses |
| `E0054` | `provider rejected node input` | A provider refused a node's input |
| `E0055` | `realizer does not publish a provides key its abstract entity's schema.provides contract declares` | A realizer does not publish a `provides` key its contract declares |
| `E0056` | `provides template evaluation failed` | A `provides:` template could not be evaluated |
| `E0057` | `provides block references a root outside the self-contained set` | `provides:` template references a non-self-contained root |
| `E0058` | `provider render is not deterministic` | A provider rendered the same input twice and produced different output |
| `E0059` | `duplicate delivery key across self-inject and uses-inject` | Duplicate delivery key across inject sources |
| `E0060` | `template references a root the render context does not define` | Template references a root the render context does not define; Self-inject value template references cross-node data |
| `E0061` | `unknown provider` | Unknown provider |
| `E0062` | `custom inject mechanism has no matching key in injectMapping output; add the mechanism's key to the Recipe injectMapping` | A component declares an inject mechanism the attached Feature maps nothing to |
| `E0063` | `workload-library import references an entry not present in the WorkloadLibrary` | A library `$import:` names a library or an entry the catalog does not hold |
| `E0064` | `workload $import: is not a bare-name workload-library reference (<Library>#/workloads/<entry>)` | A library `$import:` is not written in the bare-name form |
| `E0065` | `workload-library import references a WorkloadLibrary not present in the catalog` | A library `$import:` names a library or an entry the catalog does not hold |
| `E0066` | `uses edge target does not exist` | Dangling `uses` target |
| `E0067` | `active toggle did not resolve to a boolean` | An `active:` toggle does not resolve to true or false |
| `E0068` | `max sub-aggregate nesting depth exceeded` | Sub-aggregate nesting depth exceeded |
| `E0069` | `mutator patch rejected` | A label-transform plugin's patch reaches outside node labels |
| `E0070` | `re-exported component alias forms a cycle` | A re-published component alias points back at itself |
| `E0071` | `release edge retargets a developer-declared edge` | Release retargets a developer-declared edge |
| `E0072` | `sub-aggregate load failed` | A module a composition imports cannot be loaded, or imports itself |
| `E0073` | `flattened node ID collision: rename one of the colliding instances so their flattened IDs differ` | Two instances flatten to one identifier |
| `E0074` | `release per-edge configuration has no edge to apply to` | Release per-edge configuration has no edge to apply to |
| `E0075` | `aggregate reached topology un-normalized (non-empty root components alongside a synthesized default subsystem)` | An application reached graph building without being normalised |
| `E0076` | `` sub-module placed in no boundary: route it into a boundary under `aggregates`, or name its components there under `components` `` | A sub-module's components are placed in no boundary |
| `E0077` | `uses edge target was pruned because its active toggle resolved to false` | A `uses` edge targets a component an `active:` toggle removed |
| `E0078` | `producer-consumption re-entry denied: a producer reached through the host may not issue a further producer-consumption call` | A plugin asks the host to parse a source while a parse is already running for it |
| `E0079` | `wasm: recorded command mirror does not match plugin describe()` | A Plugin entity's recorded command set does not match the plugin |
| `E0080` | `wasm: entity contract claim does not match plugin describe()` | A Plugin entity's claims disagree with the plugin's own self-report |
| `E0081` | `wasm: guest plugin returned a diagnostic whose severity the contract does not declare` | A plugin returned a diagnostic at a severity that is not declared |
| `E0082` | `wasm: guest plugin reported an error` | A plugin failed while it was running |
| `E0083` | `wasm: guest plugin panicked during call` | A plugin failed while it was running |
| `E0084` | `wasm: stamped host-function record does not match .wasm imports` | A Plugin entity's recorded host functions do not match the binary |
| `E0085` | `wasm: plugin rejected by the sandbox` | The sandbox refused a plugin |
| `E0086` | `wasm: plugin invoked proc_exit` | A plugin failed while it was running |
| `E0087` | `wasm: declared plugin type does not match plugin describe()` | A plugin is not the kind of plugin the socket expects |
| `E0088` | `wasm: entity metadata.version does not match plugin describe()` | A Plugin entity's recorded version does not match the plugin |
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
| `E0106` | `resolve: invalid library reference URI` | A library reference is not written in the identity form |
| `E0107` | `resolve: minimal version selection conflict — incompatible library version requirements` | Two consumers of one library require incompatible versions |
| `E0108` | `resolve: catalog lookup cannot load resolved sub-aggregate bodies` | The catalog view a build was given cannot load the bodies pinning needs |
| `E0109` | `resolve: catalog lookup cannot load resolved recipe and plugin bodies` | The catalog view a build was given cannot load the bodies pinning needs |
| `E0110` | `resolve: source-template evaluation failure at lock time` | Resolving a `source:` coordinate registers a narrower function set |
| `E0111` | `resolve: source-template parse error` | Resolving a `source:` coordinate registers a narrower function set |
| `E0112` | `resolve: source-template references .provides (invalid reverse reference)` | Resolving a `source:` coordinate registers a narrower function set |
| `E0113` | `resolve: sub-aggregate inclusion depth exceeded` | The chain of module imports is deeper than the pin walk descends |
| `E0114` | `resolve: no entity in the catalog matches this URI` | A reference names no entity the catalog holds |
| `E0115` | `compactform: ambiguous dispatch — $mode required` | A compact-form schema declares a field literally named `type` |
| `E0116` | `compactform: constraint not valid for declared type` | A compact-form constraint does not apply to the type it was written on |
| `E0117` | `compactform: $jsonschema content invalid` | A `$jsonschema:` escape carries content that is not a schema |
| `E0118` | `compactform: cross-document $ref carries a registry host; reference the library by identity` | A `$ref:` addresses a library by registry location |
| `E0119` | `compactform: $ref unresolvable` | A `$ref:` is not written in a form the compiler can resolve |
| `E0120` | `compactform: unknown keyword` | A compact-form schema uses a keyword the compact form does not know |
| `E0121` | `compactform: cross-document $ref target not found` | A `$ref:` is not written in a form the compiler can resolve |
| `E0122` | `deprecation: build consumes a deprecated entity` | The build consumes an artifact its publisher has deprecated |
| `E0123` | `docscache: artifact is not a documentation bundle` | A resolved artifact is not a documentation bundle |
| `E0124` | `docscache: page not found in documentation bundle` | A page is absent from a documentation bundle |
| `E0125` | ``egress: network access refused because the workspace is offline; remediation: pass `--offline=false` to allow the network for this one run, or clear the top-level `offline` key in the configuration file (or AGGREGA_OFFLINE) to allow it from now on; where the work is a build that needs content the machine does not have, run `aggrega pull --release <release>` from a connected environment first to populate the cache`` | The workspace is offline and the step needs the network |
| `E0126` | `externalinputs: acquisition is disabled for unpinned inputs` | A render requests an external input the lockfile does not pin |
| `E0127` | `externalinputs: fetched bytes mismatch the pinned digest` | Fetched bytes do not match a pinned digest |
| `E0128` | `externalinputs: URL scheme is not allowed` | An external input's URL uses a scheme that is not allowed |
| `E0129` | `externalinputs: store blob mismatches its pinned record` | A stored external input no longer matches its record |
| `E0130` | `lockfile: out of date; it no longer matches what its Release resolves to` | The lockfile no longer matches what the release resolves to |
| `E0131` | `lockfile: file failed schema validation` | The lockfile does not satisfy its schema |
| `E0132` | `oci: manifest has multiple layers of the expected content media type` | A manifest carries no layer of the expected kind, or more than one |
| `E0133` | `oci: cached manifest digest mismatch` | Fetched or cached bytes do not match the digest committed for them |
| `E0135` | `oci: content digest mismatch` | Fetched or cached bytes do not match the digest committed for them |
| `E0136` | `oci: network unreachable` | The registry could not be reached |
| `E0137` | `oci: artifact not found at remote source` | An artifact is not at the source the build was told to find it |
| `E0138` | `oci: authentication required or failed` | The registry will not serve an artifact without credentials it accepts |
| `E0139` | `oci: tag already published with different content` | A tag is already published with different content |
| `E0140` | `oci: manifest has no layer of the expected content media type` | A manifest carries no layer of the expected kind, or more than one |
| `E0141` | `oci: distinct catalog identities map to the same OCI repository location` | Two catalog identities publish to one repository location |
| `E0142` | `oci: referrer discovery could not be completed` | The registry could not answer what is attached to an artifact |
| `E0143` | `oci: unknown entity kind for mediatype dispatch` | An entity kind has no artifact media type |
| `E0144` | `cached signature bundle does not match its recorded digest` | A cached signature bundle does not match the digest recorded for it |
| `E0145` | `plugin reference is not a Plugin entity` | A plugin reference is not a Plugin entity |
| `E0146` | `circular reference expansion` | A library reference expands into itself |
| `E0147` | `registrytrust: advertised trust config is malformed` | A registry serves a trust document that cannot be read as one |
| `E0148` | `registrytrust: registry advertises no trust config` | A registry publishes no trust document |
| `E0149` | `attachment name is a near miss for a declared slot` | An attachment name is one edit from a declared slot |
| `E0150` | `attachment does not conform to its declared slot shape` | Attachment does not conform to its declared slot shape |
| `E0151` | `component declared in more than one boundary: declare each component in exactly one boundary` | A component is placed in more than one boundary |
| `E0152` | `duplicate Aggregate/Manifest identity (metadata.name) in the Release directory` | The Release directory declares one Aggregate or Manifest twice |
| `E0153` | `feature merge conflict: reconcile the Aggregate and Release declarations for the feature` | Manifest merge strategy |
| `E0154` | `the compiler's own views of the catalog disagree` | A guard needs a catalog entity the build resolved and cannot see |
| `E0155` | `duplicate delivery key across inject sources` | Duplicate delivery key across inject sources |
| `E0156` | `invalid inject key: the from-key must name a declared provides key of the target component type` | Inject `from` key is not in the target's `provides` |
| `E0158` | `invalid parameter reference: check the {{ .parameters.* }} expression names a declared parameter and parses as a Go template` | A `{{ .parameters.* }}` reference cannot be interpolated |
| `E0160` | `manifest annotation bindings collide on same Feature path+pillar` | Two Manifest annotation bindings compete for one routing slot |
| `E0161` | `manifest annotation binding uses reserved prefix` | A Manifest annotation binding claims the reserved `aggrega.ai/` prefix |
| `E0162` | `missing required feature: attach a Feature of the required type to the component` | Required feature not attached |
| `E0163` | `required uses socket not populated` | Required `uses:` socket not populated |
| `E0164` | `parameter contract violated` | Parameter type mismatch / contract violation |
| `E0165` | `required parameter not supplied` | Parameter type mismatch / contract violation |
| `E0167` | `Recipe publishes a provides key its Component does not declare` | A Recipe publishes a `provides` key its Component does not declare |
| `E0168` | `authored pillar does not conform to its declared schema` | Authored values or infra do not conform to the declared schema |
| `E0169` | `self-inject on component without spec.inject allowlist` | Self-inject on a component without an allowlist; Self-inject mechanism not in the component's allowlist |
| `E0170` | `aggregate/manifest reference unresolvable` | A Release's `aggregate:` or `manifest:` reference resolves to nothing |
| `E0171` | `unknown uses socket: name a socket the entity declares in its usesSchema — only a component's own uses block may name one the catalog did not declare` | `uses:` socket not declared in the target's `usesSchema` |
| `E0172` | `release reached resolve un-normalized (non-empty root components alongside a synthesized default boundary)` | A Release reached resolution without passing through the load path |
| `E0173` | `declared parameter is read by no reference in the Aggregate` | A declared parameter is read by nothing |
| `E0174` | `uses socket name is a near miss for a declared socket` | A `uses:` socket name is one edit from a declared socket |
| `E0175` | `file load failed: the file could not be read, or its bytes did not parse` | A file cannot be read, or its bytes do not parse |
| `E0176` | `signing: keyless signing requires a live identity provider, Fulcio, and Rekor` | Keyless signing was asked for without the services it needs |
| `E0177` | `signing: no signature found for an artifact that requires one` | An artifact that must be signed carries no signature |
| `E0178` | `signing: keyless verification requires at least one trusted identity` | A keyless trust policy names no acceptable signer |
| `E0179` | `signing: signature does not verify` | A detached signature does not verify against the key supplied |
| `E0180` | `signing: signature bundle does not verify` | A signature does not verify |
| `E0181` | `signing: signing policy requires a signature for this artifact kind; refusing to push unsigned content` | An unsigned publish targets a registry or a policy that requires a signature |
| `E0182` | `signing: cannot load pinned trust root` | The pinned trust root cannot be read |
| `E0183` | `signing: registry requires signatures; refusing to push unsigned content` | An unsigned publish targets a registry or a policy that requires a signature |
| `E0184` | `signing: unsupported held-key type` | A pinned verification key is not the key profile the verifier accepts |
| `E0185` | `signing: signature identity is not trusted for this registry` | A signature verifies but its signer is not one the registry trusts |
| `E0186` | `sourceresolver: no adapter registered for source kind` | A Recipe's `source:` names a kind nothing knows how to acquire |
| `E0187` | `cacheslot: empty workspaceRoot` | A source artifact is cached without a workspace root to anchor it |
| `E0188` | `artifacts entry: shape must be a string scalar or {$import: <local-path>}` | An inline-or-import field is written in neither shape |
| `E0189` | `artifactlibrary: entry must be a mapping of filename to a string body` | A library entry's body is not the shape that library holds |
| `E0190` | `schemalibrary: forbidden JSON Schema keyword` | A schema uses a JSON Schema keyword the library does not admit |
| `E0191` | `mappinglibrary: entry body must be a string scalar` | A library entry's body is not the shape that library holds |
| `E0192` | `OrderedMap: decode depth exceeded` | A document nests deeper than the reader will descend |
| `E0193` | `parameters: shape must be an inline object or {$import: <local-path>}` | A Release's `parameters:` block is written in neither of its two shapes |
| `E0194` | `schemalibrary: template not found` | A `$instantiate:` reference cannot be resolved |
| `E0195` | `schemalibrary: template parameter missing` | A `$instantiate:` reference cannot be resolved |
| `E0196` | `schemalibrary: template parameter type mismatch` | A `$instantiate:` reference cannot be resolved |
| `E0197` | `valuesmapping: shape must be a string scalar or {$import: <path-or-library-identity>}` | An inline-or-import field is written in neither shape |
| `E0198` | `wellKnownAnnotations: a key is declared at a scope the provider's contract does not render` | A provider declares a well-known annotation at a scope it does not render |
| `E0199` | `workloadlibrary: entry body must be a string scalar` | A library entry's body is not the shape that library holds |
| `E0200` | `workload: shape must be a string scalar or {$import: <path-or-library-identity>}` | An inline-or-import field is written in neither shape |
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
| `E0220` | `extends chain exceeds maximum depth` | An `extends:` chain runs past the depth bound |
| `E0221` | `merger: invalid merge input` | The schema-merge step's own input guard |
| `E0222` | `registry alias matches more than one host` | A registry alias matches more than one host |
| `E0223` | `a cross-cutting socket is bound by capability but attaches by uri` | A plugin binding sets a key the socket it attaches to does not read |
| `E0224` | `file failed schema validation` | The workspace configuration file does not satisfy its schema |
| `E0225` | `capability is bound to more than one provider plugin` | A capability is bound to more than one provider plugin |
| `E0226` | `registry alias is already used by another host` | A registry alias is already bound to another host |
| `E0227` | `a governance attachment declares no role or an unknown role` | A governance attachment declares no role, or one that is not a known role |
| `E0228` | `a provider socket binding sets a field with no referent on that socket` | A plugin binding sets a key the socket it attaches to does not read |
| `E0229` | `position out of range` | An editor position falls outside the document |
| `E0246` | `the digest recorded as trusted for this plugin does not match the digest its cached manifest reports` | A trusted plugin's recorded digest disagrees with the cached artifact |
| `E0247` | `a plugin recorded as trusted for an accept-or-reject verdict is no longer attached at any verdict role` | A plugin recorded as a trusted gate is no longer attached |
| `E0248` | `wasm: guest plugin returned an output that is not the shape the socket reads` | A plugin returned something that is not the shape the socket reads |
| `E0250` | `provider named a directory for each contributor's own sub-directory that is not a single directory name` | A provider named a directory for a contributor that is not one directory |
| `E0251` | `recipe source is an empty string, which names neither sourceless mode nor sourced mode` | Recipe `source:` is an empty string |
| `E0252` | `artifact-library bundle file name leaves the artifacts key its output is nested under` | An ArtifactLibrary bundle file leaves the key it was imported at |
| `E0253` | `annotation binding does not resolve against its target Feature` | Annotation binding does not resolve against its target Feature |
| `E0254` | `annotation subkey does not conform to the target Feature's schema at the routed pillar` | A bound annotation value does not conform to the target Feature's schema |
| `E0255` | `annotation routes through a pillar its authoring side may not use` | An annotation routes through a pillar its authoring side may not use |
| `E0256` | `annotation binding declares one path in both pillar lists` | An annotation binding declares one path in both pillar lists |
| `E0257` | `declared schema contract could not be compiled into a usable schema, so nothing was validated against it: correct the contract where it is declared, or remove it if the configuration it covers needs no validation` | A declared schema contract cannot be read as a schema |
| `E0259` | `attachment binds a FeatureRecipe with executionScope: boundary and no boundary holding the component declares it` | A boundary-scope Feature is attached only to a component |
| `E0260` | `` component placed in no boundary: name it under a boundary's `components`, or place the sub-module that contributes it under `aggregates` `` | A component the composition holds is placed in no boundary |
| `E0261` | `boundary names a component the composition does not hold: correct the name, or remove the entry` | A boundary names a component the composition does not hold |
| `E0262` | `component identity cannot be the name its emitted resources are stamped with: rename the component` | Component identity cannot be stamped on what it emits |
| `E0263` | `the target will not accept a name derived from this component's authored identity: rename the component` | The target will not accept a name derived from an authored identity |
| `E0264` | `provider guest never accepted a component identity the compiler composed for it` | A provider never accepted a name the compiler composed |
| `E0265` | `provider does not support the node's input kind` | `workload:` requires a provider that can synthesize |
| `E0266` | ``a schema `$import:` could not be applied`` | A schema `$import:` cannot be applied |
| `E0267` | `a schema block declares a key that names no data pillar` | A schema block names a key that is not a data pillar |
| `E0268` | `reassemble names a patched unit token the carve did not produce; a conforming codec carves and reassembles a file under the same tokens` | A provider's reassembly is handed a unit its own carve never produced |
| `E0269` | `provider guest returned two output files under one path; a conforming guest returns each output path at most once` | A provider returned two output files under one path |
| `E0270` | `link patch names an output file the dispatch group did not emit; a conforming link patch names a file the group's own render returned` | A provider's link wiring names an output file that was never emitted |
| `E0271` | `emit_file side effect carries no file; a conforming emit_file side effect carries a file with its path and content` | A pipeline step's file emission carries no file |
| `E0272` | `side effect declares a kind the plugin contract does not define; a conforming side effect declares emit_file or emit_crd` | A pipeline step declares an emission kind the contract does not define |
| `E0273` | `template reads the name the target gives the resources it renders for the node, and this node's provider reports no such name; a conforming template reads a value the node's own provider supplies` | A template reads a rendered name the node's provider does not report |
| `E0274` | `the plugin identity recorded as trusted no longer matches what this resolution reports` | A gate recorded as trusted resolves to a different identity |
| `E0275` | `the edit was refused because the resulting document would not be valid, and nothing was written` | An edit would produce a document its schema refuses |
| `E0276` | `the version being published changes the published predecessor in a way the documented evolution rubric objects to` | The change being published breaks what the evolution rubric allows |
| `E0277` | `an annotation key on the entity uses a prefix the platform reserves` | An annotation key uses a prefix the platform reserves |
| `E0278` | `the entity's name does not follow the documented name shape for its kind` | An entity's name does not follow the shape its kind expects |
| `E0279` | `a schema in the entity uses a dynamic reference construct that cross-document reference resolution cannot follow` | A schema uses a dynamic reference that cannot be resolved ahead of time |
| `E0280` | `a schema in the entity declares an identifier of its own, where the platform owns that schema's identity` | A schema declares an identifier the platform owns |
| `E0281` | `the entity's category label does not match the category directory the entity is filed under` | A Component's category label and its directory name different categories |
| `E0282` | `the entity writes an Aggrega schema extension directly into schema content instead of declaring it under usesSchema or featuresSchema` | A schema extension is written directly into schema content |
| `E0283` | `the Plugin entity declares no runtime resource cap of its own, so the platform defaults apply` | A Plugin pins neither runtime cap, so the platform's own apply |
| `E0284` | `an attachment slot admits only secret material and does not declare that it handles it` | An attachment slot admits only secret material without saying it handles it |
| `E0285` | `the Recipe publishes a provides key the Component it implements does not declare, so a consumer wiring that key is refused` | A Recipe publishes a `provides` key its Component does not declare, checked at publication |
| `E0286` | `the version bump being published is smaller than the evolution check's classification of the change requires` | The version offered is a smaller bump than the change requires |
| `E0287` | `the importer reported a diagnostic that stops the import, so the source was not fully turned into draft authoring files` | An import stopped partway through translating a source |
| `E0288` | `a plugin has no expression for a construct this build declares` | A workload declares a form compose cannot express; A container declares a field compose has no primitive for; An omits entry names a kind or a namespace a compose file does not have; An omits entry names a namespace a CloudFormation template does not have |
| `E0289` | `a plugin could not resolve something it requires to exactly one value` | A health probe cannot be turned into a compose healthcheck; A configmap volume has no file behind it; What an omits entry left out is still named by the compose file; What an omits entry left out is still named by a CloudFormation template; A cross-boundary reference has no consuming stack to be written into; A synthesized StatefulSet has no single service to govern it |
| `E0290` | `two things a plugin produced occupy one name in its output` | An authored export name is one the build derives for a cross-stack reference; Two entries reach one stack output name; A CloudFormation fragment writes one key twice; Two rendered resources land at one output file |
| `E0291` | `a plugin has no representation for a value it was given` | A published port declares a transport compose cannot spell; A resources quantity cannot be converted to a compose value; A resource quantity the helm provider emits is not a quantity; A service type the helm provider cannot render; A Kubernetes version the helm provider cannot render a chart for; A cross-boundary reference was spliced into a longer string |
| `E0292` | `a plugin reported a failure that none of the declared kinds names` | A plugin reported a failure it did not classify |
| `E0293` | `wasm: guest plugin named a condition the socket does not declare` | A plugin named a condition the socket does not declare |
| `E0294` | `components in different subsystems take the same identity: rename one of them, since a subsystem contributes nothing to a component's identity` | Two subsystems declare a component under one name |
| `E0295` | `library reference: a reference to a library entry carries no whitespace or line break` | A reference to a library entry carries whitespace |
| `E0296` | `release extends chain composes both named boundaries and top-level components: declare one routing shape across the chain, never both` | A Release chain's links disagree about the routing shape |
| `E0297` | `inherited boundary directory carries no template variable, so it resolves to the path the extended Release writes to` | A child Release inherits a boundary directory that resolves where its parent writes |
| `E0298` | `oci: published bundle carries no entity document` | A published bundle holds no entity, or holds two |
| `E0299` | `oci: published bundle carries more than one entity document` | A published bundle holds no entity, or holds two |
| `E0300` | `oci: published bundle cannot be unpacked` | A published artifact cannot be read as an entity |
| `E0301` | `oci: published artifact is not an entity document` | A published artifact cannot be read as an entity |
| `E0302` | `an input the entity reads has no pin recorded for it in the entity.lock beside it` | An entity reads an input the lock beside it records no pin for |
| `E0303` | `the entity shares its directory with another entity, and an entity of its kind has a directory of its own` | An entity shares its directory with another entity |
| `E0304` | `a path names content outside the entity's own directory` | A path names content outside the entity's own directory |
| `E0305` | `the files of the entity's local source do not match the pins recorded for them in entity.lock` | A local source no longer matches the pins recorded beside its Recipe |
| `E0306` | `plugin artifact not found on this machine` | A plugin's `.wasm` is not on this machine |
| `E0307` | `a value a cache location is built from would place cached files outside the place it names in the cache` | A value would place a cached file outside the cache |
| `E0308` | `a Feature reaches a component alongside a Feature it declares a conflict with` | Two Features declared to conflict reach one component |
| `E0309` | `a symbolic link sits among the files an entity carries` | A symbolic link sits among the files an entity carries |
| `E0310` | `` a registry other than the official hub is not registered offline without a trust policy supplied by hand, because the policy it advertises cannot be fetched; register it once while online, or pin its trust by hand with `aggrega registry add <host> --identity <identity>=<issuer>` or `--key <public-key-file>` `` | A registry is added offline with no trust policy to pin |
| `E0311` | `reference carries a malformed version pin` | A version pin is none of the forms a pin takes |
| `E0312` | `a provider socket binding names a capability containing a colon, which no Recipe can select` | A provider binding names a capability containing a colon |
| `E0313` | `plugins.providers entry names a capability no provider-rendering plugin the build reads serves` | A provider binding names a capability no plugin the build reads serves |
| `E0314` | `plugin was built from a working tree with uncommitted changes, so no commit reproduces the version it reports` | A plugin was built from a working tree with uncommitted changes |
| `E0315` | `a connection carries an attachment under a name its socket declares no slot for` | A connection carries an attachment under a name its socket declares no slot for |
| `E0316` | `a Release attachment takes the name of an attachment one of a component's connections carries` | A Release attachment takes the name of a connection's attachment |
| `E0317` | `a Release connection attachment names no Feature type, and the type is required for an attachment only the Release makes` | A Release connection attachment names no Feature type |
| `E0318` | `duplicate delivery key across two attachments: an attachment's FeatureRecipe injectMapping writes a key another attachment already delivered` | Two attached Features deliver one key, the later through its FeatureRecipe's injectMapping |
| `E0319` | `connection alias is already used by another connection of the same component` | Two connections of one component under one alias |
| `E0320` | `a path this operation writes or deletes leads through a link out of the directory it must stay inside` | A path the operation writes leads through a link out of the directory it must stay inside |
| `E0321` | `a file this operation reads leads through a link out of the directory it must stay inside` | A file the operation reads leads through a link out of the directory it must stay inside |
| `E0322` | `duplicate delivery key across two attachments: the environment override a boundary-scope attachment computes for a component writes a key another attachment already delivered` | A Feature attached to a boundary overrides a key another attached Feature delivered |
| `E0323` | `template reads its callers' render facts, but the FeatureRecipe does not set readsCallerRenderFacts` | A template reads its callers' render facts without declaring it |
| `E0324` | `a reference a document makes to another file leads out of the directory it must stay inside` | A reference to another file leads out of the directory it must stay inside |
| `E0325` | `provider guest reported a render fact whose value is not a list; a conforming guest reports every render fact's value as a JSON array, even with one entry` | A provider reported a render fact whose value is not a list |
| `E0326` | `pipeline step reads its callers' render facts, but a pipeline step does not read the components connecting to its host; it reads only the host's own render facts` | A pipeline step reads its callers' render facts |
| `E0327` | `template indexes a map with a key the map does not hold` | A template indexes a map with a key the map does not hold |
| `E0328` | `attachment written under a name no slot declares fits a slot its component leaves empty` | An attachment written under another name fits a slot its component leaves empty |
| `E0329` | `a connection and the target it reaches do not name one key: they write different locators for it, or only one of them names one` | A connection and the target it reaches do not name one key |
| `E0330` | `signing: the references named together need different signing credentials, so nothing was signed` | References signed together need different signing credentials |
| `E0331` | `signing: no verified signature is recorded for an artifact that requires one` | No verified signature is recorded for an artifact that requires one |
| `E0332` | `signing: the recorded signature was made for a different artifact` | A recorded signature was made for a different artifact |
| `E0333` | `signing: a recorded signature is not the one a pull would record` | A recorded signature is not the one a pull would record |
| `E0334` | `an omits entry left out nothing the source rendered` | An omits entry left out nothing the source rendered |
| `E0335` | `provider does not support omits` | The provider does not support omits |
| `E0336` | `a provider's omitted counts do not match the omits entries it was handed` | A provider's omitted counts do not match the omits entries it was handed |
| `E0337` | `no importer plugin version satisfies the plugins.importer entry's version pin` | A `plugins.importer` entry pins a version of its importer the catalog does not hold |
| `E0338` | `importer is attached by more than one plugins.importer entry` | An importer is attached by more than one `plugins.importer` entry |
| `E0339` | `more than one importer recognises the source` | More than one importer recognises the source |
| `E0340` | `a name this operation writes holds a path segment Windows cannot hold as written` | A name the operation writes holds a part Windows cannot hold |
| `E0341` | `the importer serving the source's format declares no file patterns, so it reads one file and cannot read a directory` | An importer that declares no file patterns is handed a directory |
| `E0342` | `no file in the directory matches the file patterns the importer serving the source's format declares` | No file in the directory matches the importer's file patterns |
| `E0343` | ``a file read from the directory and a file named in the importer's `with.sources` have the same name`` | A file read from the directory and a file named in the importer's `with.sources` have the same name |
| `E0344` | `an entry this publication carries cannot be used on Windows` | A published archive carries an entry Windows cannot use |
| `E0345` | `a container declares one environment variable twice` | A container gives one environment variable two values |
| `E0346` | `a Component's annotation stating how its metrics authenticate disagrees with whether it declares the provides key saying an instance's metrics need a credential` | A Component's metrics annotation and its provides key disagree |
| `E0347` | `template reads the render facts of a component its host is wired to, but the FeatureRecipe does not set readsTargetRenderFacts` | A template reads its targets' render facts without declaring it |
| `E0348` | `pipeline step reads the render facts of a component its host is wired to, but a pipeline step reads only the host's own render facts` | A pipeline step reads its targets' render facts |
| `E0349` | `no Recipe in the workspace's catalog binds to the capability the import's target names` | An import's target names a capability no Recipe in the catalog binds to |
| `E0350` | `no importer recognises the source` | No importer recognises the source |
<!-- END GENERATED: halt-condition-sentences -->

## The linter domain (not fatal)

The compiler is strictly unopinionated about *execution*. It never halts the build for patterns that are merely suspicious — unused values, orphaned secrets, disconnected targets. Those belong to the linter domain, where enterprises opt in to Wasm plugins that enforce their own conventions.

### Orphaned credentials

A Secret declared without an `inject:` delivery contract is not a compile error. The core compiler preserves the declaration in the IR graph and emits no warning. Enterprise `linter.wasm` plugins may detect and warn on this pattern; enterprise renderers may also choose to mount orphaned secrets implicitly under their own Black-Box conventions. Because both interpretations are valid, the core compiler takes neither side.
