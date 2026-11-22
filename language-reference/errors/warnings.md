# Warnings and Linter Output

Non-fatal warnings the compiler emits during compilation. Warnings do not halt the build — they surface authoring smells, deterministic tie-breaks the compiler chose, and resources the developer's templates never consumed. Each finding reaches stderr behind a prefix naming its kind — `warning:`, `lint:`, or `notice:`, depending on which pass raised it — so CI pipelines can capture and re-surface them; rendered artifacts are produced regardless.

For fatal compilation halts (the diagnostics that stop a build), see [fatal-halts.md](./fatal-halts.md).

## Every advisory, by short code

Some of what the compiler reports without halting is a **condition** of its own: it carries a short code, the same four-digit identifier a halting diagnostic prints, and a fixed sentence its message opens with. The table below runs the lookup from one to the other, so a code you have in hand resolves to what the finding is about even when the line you are reading is a warning rather than a halt.

**What earns a place here is a declaration, not a description.** Every rule the compiler evaluates states what a violation does — stop the build, or report the finding and let the build finish — and the rows below are the second kind. So an advisory added to the compiler appears here without a row being written by hand, and one that becomes a halting condition leaves.

Two bounds on what the table covers, and both are worth knowing before you conclude a code is missing:

- **Not everything on this page is one of these.** Several of the findings taught below are raised by a pass of its own rather than by a declared rule, and some carry no condition at all — the lines they print are still exactly as described in their sections, but there is no code to resolve and so no row. The `unsupported-field` class code is the shape to expect there: it names a class of finding rather than a condition.
- **A row here does not promise a section below.** An advisory raised late in rendering is catalogued rather than taught, so a code may resolve to a sentence here and have its fuller treatment in [fatal-halts.md](./fatal-halts.md) under "Conditions that do not halt a build", which catalogues every condition that carries a code without stopping a build.

[sentinels.md](./sentinels.md) resolves any short code a build prints, advisory or halting, and is the place to start when you do not yet know which kind you are holding.

<!-- BEGIN GENERATED: advisory-short-codes -->
| Short code | Opens with |
| --- | --- |
| `E0004` | `annotation contribution overridden by an explicit value` |
| `E0037` | `cross-boundary link between endpoints rendered by different providers is not supported` |
| `E0149` | `attachment name is a near miss for a declared slot` |
| `E0167` | `Recipe publishes a provides key its Component does not declare` |
| `E0173` | `declared parameter is read by no reference in the Aggregate` |
| `E0174` | `uses socket name is a near miss for a declared socket` |
| `E0256` | `annotation binding declares one path in both pillar lists` |
| `E0297` | `inherited boundary directory carries no template variable, so it resolves to the path the extended Release writes to` |
<!-- END GENERATED: advisory-short-codes -->

## Schema-pillar-overlap lint

**Fires when** a Component or Feature declares the same property name in both the `values:` and `infra:` pillars of its `spec.schema:` block at the same nesting depth. Schema authors who put the same field name in both pillars usually mean to put it in one or the other; the lint flags the duplication so the author can resolve which pillar owns the field.

**Pipeline placement.** The lint runs in the validation pass after schema unification, before topology construction. It walks the schema after compact-form expansion, without following a `$ref:` (see the soft-skip discipline below), and reports each overlapping property as a separate warning.

**Emit shape:**

<!-- unregistered-output: lint text, which is reported without halting and which no halting condition registers -->

```text
  notice: LINT: Component "core/compute/web-server:1.0.0" at ./catalog/component/core/compute/web-server/1.0.0/component.yaml declares property "storage_size" in both values: and infra: pillars (path: storage_size)
```

For nested properties, the path is the dotted path to the property from the pillar's root:

<!-- unregistered-output: lint text, which is reported without halting and which no halting condition registers -->

```text
  notice: LINT: Feature "core/db-pool:1.0.0" at ./catalog/feature/core/db-pool/1.0.0/feature.yaml declares property "timeout" in both values: and infra: pillars (path: connection.timeout)
```

A whole-catalog load — `aggrega validate` with no argument — names each entity by its name and version and by the file it was read from, as above. A build, or a validation of one Release, reads only the entities that Release reaches and names each by its name and version — `at core/db-pool:1.0.0` — once per entity, however many references in the Release reach it: an Aggregate naming a Feature by its bare name and a Manifest mapping it by name and version reach one Feature, which is reported once.

**Editor visibility.** The finding reaches editor diagnostics through the language server, at warning severity, at the head of the file rather than on a key — it names a catalog entity rather than a position inside the document you are editing, so there is no authoring key for a marker to sit on. It is raised before the artifact-rendering stage, so it needs no dial: an editor session surfaces it whether or not `serve.build_on_inspect` is on.

**Soft-skip discipline.** The walker terminates without warning when a schema branch carries one of the JSON Schema 2020-12 escape hatches that prevent statically-derivable property sets: `$ref` (cross-document or in-document references), `patternProperties` (key-shape-based property declarations), `additionalProperties` set to `true` or to a schema (properties the branch admits without naming them), and the composition operators `oneOf` / `anyOf` / `allOf` (disjunctions and conjunctions whose branches may declare divergent property sets). Walking these branches would either require evaluating the referenced or composed schema at lint time (a class of work the lint does not perform) or produce false positives when one branch's `values:` property name happens to collide with another branch's `infra:` property name. The lint emits no warning for the affected nesting depth; deeper levels of the same schema are still walked and lintable.

**Authoring note.** The compiler does not reject pillar-name overlaps — the lint is advisory. A Component with `storage_size` in both pillars compiles; the developer-side `values.storage_size` and the operator-side `infra.storage_size` are validated independently by their pillar schemas, and the Recipe's `valuesMapping:` template chooses which pillar's value flows into the rendered output. The lint exists because the authoring pattern is almost always a mistake; conscious cross-pillar duplication is rare enough that authors who genuinely want it can ignore the warning. For the broader cross-pillar mechanics — including the rare cases where deliberate cross-pillar piping is justified — see [vocabulary/data-pillars.md](../vocabulary/data-pillars.md) "Cross-pillar mechanics".

## Binding-map-overlap lint

**Fires when** a Manifest annotation binding declares the same dotted path in both its `maps.infra` and `maps.values` lists. The path would route through both pillars; the compiler's deterministic tie-break sends it through `infra:`, which makes the `values:` side unreachable from the Aggregate. The lint surfaces this so the author can either narrow the binding to a single pillar or accept the infra-side-only routing consciously.

**Pipeline placement.** The lint runs after the Manifest is resolved and before any annotation expansion fires, so a build reports an overlapping binding whether or not an Aggregate annotation ever reaches that binding. It walks the bindings under `mappings.features.annotations` in the order they were authored, intersects each binding's `maps.infra` and `maps.values` lists, and reports one finding per overlapping path. Within one binding, the overlapping paths are reported in the order that binding's `maps.values` list declares them — the order you wrote them in — so repeated runs over identical input report an identical sequence.

**Emit shape:**

```text
  lint: annotation binding declares one path in both pillar lists (Manifest, at .spec.mappings.features.annotations, "compliance.aggrega.ai/data-class", on Feature "core/pii-redaction", at path "classifier_endpoint", which the routing tie-break sends through the pillar "infra", declare a second binding under another annotation key to route it through "values")
  lint: annotation binding declares one path in both pillar lists (Manifest, at .spec.mappings.features.annotations.audit-scope, "audit-scope", on Feature "core/pii-redaction", at path "retention_endpoint", which the routing tie-break sends through the pillar "infra", declare a second binding under another annotation key to route it through "values")
```

Those two lines come from one build over one Manifest, and what differs between their locators is the shape of the annotation key. A locator addresses a document by dotted path, so it stops at the first segment that carries a period of its own: `audit-scope` carries none and the locator reaches the binding, while `compliance.aggrega.ai/data-class` does, and the locator names the `annotations` block holding it instead. That is why the offending key is also the first quoted value of every finding — it is the one part the locator cannot always carry.

**Editor visibility.** The finding also reaches editor diagnostics through the language server, at warning severity, positioned wherever its locator reaches — on the binding itself for a plain key, and on the enclosing `annotations` block for a key carrying a period. An author who never reads terminal output still sees it. It is raised before the artifact-rendering stage, so it needs no dial: an editor session surfaces it whether or not `serve.build_on_inspect` is on.

**Matching it programmatically.** The finding carries `ErrAnnotationBindingPillarOverlap` from `pkg/resolver`, so a consumer recognises the class with `errors.Is` rather than by matching the message text. Like every advisory sentinel it never reaches a build's verdict — see [sentinels.md](./sentinels.md) for the accessor and the condition's codes.

**Deterministic tie-break.** The runtime resolves the collision by routing the path through the `infra:` pillar exclusively. The choice is consistent across builds; the author can rely on it. The `values:` side is dropped from the binding's effective routing — Aggregate-side annotations attempting to reach the path receive no routing target and the build halts on the Aggregate side at expansion time, under the halt described at [fatal-halts.md](./fatal-halts.md) "An annotation routes through a pillar its authoring side may not use". The lint is the early warning surface; that halt is the enforcement surface.

**Authoring note.** Like the schema-pillar-overlap lint, this lint is advisory — the binding compiles and the runtime tie-break produces deterministic output. The lint fires because the authoring pattern is almost always unintended; a binding author who genuinely wanted both pillars to route the same path would author two separate bindings with different annotation keys.

## Attachment-slot near-miss lint

**Fires when** a component instance attaches a Feature under a name that is not one of its Component type's declared `featuresSchema` slots, but is within one edit of one — a single inserted, deleted, or substituted character, or two adjacent characters swapped — whose `selector` the attached Feature does not satisfy. That is the shape a slot-name typo takes, and the lint names both spellings so the author can see the pair.

**Why it exists.** Declaring a slot does not close the attachment surface: an attachment under a name no slot declares is legal, because that openness is what lets one catalog entity serve both a slot-filled attachment and a credential shared at a broader scope. The cost is that a misspelled slot name is silently a *free attachment* rather than a fill of the slot the author meant — the build succeeds and the slot simply stays empty. The lint is the disclosed mitigation for exactly that case.

**Pipeline placement.** The lint runs at resolution, in the same pass as the catalog-aware semantic guards, over the resolved Aggregate. It walks every component instance's attachment names against the declared slot names of that instance's Component type, and emits one warning per near-miss pair.

**Emit shape:**

```text
  lint: attachment name is a near miss for a declared slot (Aggregate nearmiss, at .spec.components.db.features.app_user_passwrod, "app_user_passwrod", on component type "core/datastore/postgres", near the declared slot "app_user_password")
```

The first quoted value is the name the attachment was written under, which is what the warning's opening sentence is about. The two that follow are introduced by the words that say what they are: the Component type the attachment sits on, and the declared slot it sits within one edit of.

**Editor visibility.** The warning also reaches editor diagnostics through the language server, at warning severity, positioned on the offending attachment key. An author who never reads terminal output still sees the pair. It is raised before the artifact-rendering stage, so it needs no dial: an editor session surfaces it whether or not `serve.build_on_inspect` is on.

**Threshold and its trade-off.** The lint pairs names only at one edit's distance, and only when both names are at least four characters long. Below that length nearly every short name sits within one edit of every other, so pairing them would produce noise rather than signal; above one edit the pairs stop resembling typos. A transposition counts as one edit rather than two, because a swapped pair of characters is the commonest slip and a stricter count would miss it.

**Authoring note.** The lint is advisory and never changes the build's verdict — the compiler does not police what an author names an attachment. An author who deliberately attaches a Feature under a name that resembles a slot can ignore the warning; the attachment behaves exactly as authored.

**Not where the Feature fits the slot.** A name one edit from a slot whose `selector` the attached Feature satisfies draws no warning. That pairing is not a mistyped free attachment but a fill written under another name, and whether it matters turns on whether the slot ends up empty, which is known only once every scope has folded. Where the slot is left empty the build halts and names the attachment and the slot — see "An attachment written under another name fits a slot its component leaves empty" in [fatal-halts.md](fatal-halts.md) — so the halt is the one finding reported, never a warning beside it. Where something else binds the slot, the attachment is an ordinary extra one and nothing is reported. A slot declaring no `selector` is fitted by no Feature, so a name near such a slot always draws the warning.

**Not on a connection.** The lint reads a component's own `features:` block, which is open. The attachments a connection carries are keyed by the slots its socket declares and nothing else, so a name one edit from one of those slots is not legal there: the build halts instead, and the halt names the slot the name sits near in the same sentence. No warning is raised beside it. See "A connection carries an attachment under a name its socket declares no slot for" in [fatal-halts.md](fatal-halts.md).

## Uses-socket near-miss lint

**Fires when** a component's own `uses:` block names a socket that is not one of its Component type's declared `usesSchema` sockets, but is within one edit of one — a single inserted, deleted, or substituted character, or two adjacent characters swapped. That is the shape a socket-name typo takes, and the lint names both spellings so the author can see the pair.

**Why it exists.** Declaring a socket does not close the `uses:` surface on a developer's own component: a socket name no `usesSchema` entry declares is legal, because catalog silence about a socket means the connection was not anticipated rather than forbidden, and the developer owns the Aggregate's topology. The cost is that a misspelled socket name becomes an *ad-hoc connection* of its own rather than wiring the socket the author meant — the build succeeds, the intended socket simply stays unwired, and the ad-hoc edge carries no selector and no per-edge contract. The lint is the disclosed mitigation for exactly that case. For what an ad-hoc socket gives up and what it keeps, see [entities/component.md](../entities/component.md) "Topology Sockets: `usesSchema`".

**Which surface it covers.** The component's own `uses:` block only — the one surface where an undeclared socket name is accepted. A Feature attachment's `uses:` may only name a socket the attached Feature declares, and a Release's per-edge `uses:` may only name a socket the consuming Component declares; a wrong name on either of those already halts the build, so there is nothing for a warning to add.

**Pipeline placement.** The lint runs at resolution, in the same pass as the catalog-aware semantic guards, over the resolved Aggregate. It walks every component instance's own socket names against the declared socket names of that instance's Component type, and emits one warning per near-miss pair. A component that arrives from a sub-aggregate is not covered: its inner components are folded into the graph after this pass runs.

**Emit shape:**

```text
  lint: uses socket name is a near miss for a declared socket (Aggregate aggregate, at .spec.components.web, "databses", on component type "core/devtool/adminer", near the declared socket "databases")
```

The first quoted value is the socket name the author wrote, which is what the warning's opening sentence is about. The two that follow are introduced by the words that say what they are: the Component type the socket was named on, and the declared socket it sits within one edit of. The consequence the warning does not spell out is the one described above: the misspelled name is an ad-hoc connection, so it carries no selector and no per-edge contract, and the socket the author meant stays unwired.

**Editor visibility.** The warning also reaches editor diagnostics through the language server, at warning severity, positioned on the component whose `uses:` block holds the offending name. An author who never reads terminal output still sees the pair. It is raised before the artifact-rendering stage, so it needs no dial: an editor session surfaces it whether or not `serve.build_on_inspect` is on.

**Threshold and its trade-off.** The lint pairs names only at one edit's distance, and only when both names are at least four characters long — the same bound the attachment-slot near-miss lint uses, for the same reason. Below that length nearly every short name sits within one edit of every other, so pairing them would produce noise rather than signal; above one edit the pairs stop resembling typos. A transposition counts as one edit rather than two, because a swapped pair of characters is the commonest slip and a stricter count would miss it.

**Authoring note.** The lint is advisory and never changes the build's verdict — the compiler does not police what an author names a socket. An author who deliberately draws an ad-hoc connection under a name that resembles a declared socket (a `cache` connection alongside a declared `caches` socket, meant for something else) can ignore the warning; the edge behaves exactly as authored. There is no flag to suppress it, and none is needed: it carries no verdict weight.

## Undeclared-provides-key lint

**Fires when** the Recipe bound to a component instance publishes a key under its `provides:` that the instance's Component type does not declare in its `spec.schema.provides:` contract.

**Why it exists.** Publishing more than the Component declares is legal and stays legal: the `provides` contract is subset-required and superset-permitted, so a Recipe that covers its Component's contract and emits extra keys besides is a Recipe that fulfils it. What the lint names is a consequence that is otherwise invisible from either side. A consumer reading across a `uses:` edge sees the target's **declared** contract rather than whatever the target's Recipe happens to emit — that is what keeps Recipes interchangeable, since two Recipes realizing one Component then present the same surface to a consumer, and swapping them cannot silently withdraw a key a consumer had come to depend on. So an undeclared key is not delivered across the edge, and a consuming template that reads it renders an empty value rather than failing.

The finding is stated at its cause — on the Recipe that published the key — because that is where it can be named. At the consumer the key is a template reference the compiler cannot attribute to a particular target, and a diagnostic that guessed would be worse than none. So the two are deliberately not co-located: the empty value appears at the consumer, the explanation here, and both appear in the same build output.

**Which pairing is compared.** The bound Recipe's authored `provides:` keys against the Component type's declared `spec.schema.provides:` keys. That declared set is the same one a `from:` key inside an `inject:` block is checked against, so the two agree on what a Component declares. The comparison is exact rather than a resemblance test, so unlike the two near-miss lints above it has no threshold and pairs no names.

The Recipe compared is the one the instance is actually bound to, matched by the same instance name and catalog type the rendering binds by, so a per-instance Recipe override in the Manifest is honoured rather than averaged away. A component instance whose type resolves to no catalog Component is skipped: no declaration was read, which is not the same as a declaration of nothing.

**Pipeline placement.** The lint runs at resolution, in the same pass as the catalog-aware semantic guards, over the resolved Aggregate — before rendering, so it surfaces from `aggrega validate --release` as well as from `aggrega build`. Components declared at the Aggregate's root and components nested in subsystems are both covered. A component that arrives from a sub-aggregate is not covered: its inner components are folded into the graph after this pass runs, so such a component's undeclared key is still withheld from consumers but no advisory names it.

**Emit shape.** One line per component instance and key, naming the Recipe that published the key and the Component that does not declare it:

```text
  lint: Recipe publishes a provides key its Component does not declare (Recipe broker-with-region, at .spec.provides.region, "region", on component type "core/ai-model/openai-compatible", bound to component instance "gateway")
```

The finding belongs to the instance that carries it, so ten instances of one Component type publishing the same undeclared key raise ten lines rather than one, each naming its own instance. Every line is attributed to the Recipe that published the key, because that is the document you edit to resolve it. The walk is deterministic, so the same input produces the same advisory sequence on every run.

**Editor visibility.** The advisory also reaches editor diagnostics through the language server, at warning severity, positioned on the component instance whose `type:` binds the Recipe. An author who never reads terminal output still sees it. It is raised before the artifact-rendering stage, so it needs no dial: an editor session surfaces it whether or not `serve.build_on_inspect` is on.

**Authoring note.** The lint is advisory and never changes the build's verdict — a Recipe publishing more than its Component declares still builds. The fix is one of two, and which one is right is the author's call: declare the key on the Component when consumers are meant to read it, or leave it undeclared when it is the Recipe's own working state, in which case `locals:` is where such state belongs. The opposite case is not advisory: a Component declaring a key its Recipe does not publish leaves the contract unfulfilled and halts the build.

## Ghost Infrastructure Tracker warnings

**Fires when** a key an author declared reaches a node and no template the bound Recipe declares ever references it. The unread keys become silent infrastructure: configuration the developer or the operator asked for that the Recipe never wires into the rendered output. The tracker surfaces them so the discrepancy between what was authored and what the output carries is visible instead of silent.

**Which authored keys are compared.** Three groups, per node:

- `.values` — the node's own developer-side pillar.
- `.infra` — the node's own operator-side pillar.
- `.context.uses.<alias>.values` — the per-connection values carried on each `uses:` edge the node consumes through. This group is consumer-scoped for free: a node's `uses` map holds only the edges it is the source of, so an unread per-connection value is always attributed to the node that authored it and never to the edge's target.

**Which references are collected.** Every template the bound Recipe declares. The warning says a key is read by *nothing*, which is a claim about the whole Recipe, so anything narrower than the whole Recipe would make it false rather than approximate — a key a `source:` coordinate consumes would be reported unread by the very run that fetched the version it named. The blocks read are:

- `valuesMapping:`, the values overlay handed to the provider.
- `source:` — the whole field where it is authored as a single string, and every string-valued field of it where it is authored as an object. A source coordinate is a template evaluated per consuming instance, so a version, a chart name, a git reference or a module subdirectory chosen from `.values` or `.infra` reads those keys.
- `locals:` and `provides:`, each entry.
- `assertions:`, each entry.
- `workload:`, the synthesized Workload body.
- `artifacts:`, each entry's content.
- `pipeline:`, each step's `with:` input and its `when:` gate.

Three bounds follow, and all three are limits on what can honestly be claimed rather than choices. Each of them silences the reading rather than widening it, which is the direction that costs least: an unreported key costs a reader one advisory they can still find by reading the Recipe, where a wrongly reported one tells them a working setting was ignored.

- A Recipe with no inline `valuesMapping:` is not read at all. Its keys are skipped rather than reported, whatever its other templates do.
- A block the Recipe imports from a file or from a library reference is not in hand at this point, so its references cannot be collected. The node's keys are skipped entirely rather than reported — that holds for an imported `valuesMapping:`, an imported `workload:` and an imported `artifacts:` entry alike.
- A template that fails to parse yields no reference set at all. Reporting every key as unread would bury the parse diagnostic the evaluation raises over the same template, so nothing is reported instead. An `artifacts:` entry is read with the standard `{{ }}` delimiters, which is not the pair every provider declares for that field; read with the wrong pair such a body yields references its author never wrote, or does not parse, and both outcomes only ever silence a warning.

**A socket's `valueSchema` is never flagged.** `usesSchema.<socket>.valueSchema` declares the *contract* a per-connection value must satisfy. It is a schema, not an authored instance, and it is not among the inputs compared — so it can never be reported. What a socket's declared default *produces* is an instance like any other, read or unread on its own merits.

**A reference naming a whole pillar counts every key beneath it as read.** `{{ .infra.port }}` marks `port` read and leaves the pillar's other keys eligible for a warning. ``{{ optional .infra `port` 8080 }}`` hands the whole `.infra` map to a function, so the collected reference names the pillar rather than a key beneath it, every key in that pillar counts as read, and the pillar raises nothing. The same holds for `range`-ing a pillar and for reaching one `uses` entry through `index`. A Recipe author who wants per-key coverage writes per-key references.

That reaches every block above, which is worth knowing before a quiet pillar reads as a missed warning: a Recipe whose `source:` version is written as ``{{ optional .infra `source_version` "1.2.3" }}`` has handed the whole `.infra` map to a function, so that Recipe reports nothing about any `.infra` key on any node it renders. The `.values` pillar is unaffected — the two are counted separately.

**Pipeline placement.** The tracker runs at base rendering, alongside template evaluation. Each of the Recipe's templates is parsed and walked to collect the dot-qualified field paths it references (`.values.port`, `.infra.replicas`, `.context.uses.<alias>.values.retry_budget`); each group's resolved key set is compared against the union of those references, and the difference is the unread set. What is walked is the Recipe **as authored**: a `source:` coordinate is read as its template text, not as the value that template produced for this instance.

**Emit shape.** One line per unread key, naming the node, the group's path, the key, and the Recipe no template of which reads it:

<!-- unregistered-output: warning text, which is reported without halting and which no halting condition registers -->

```text
  warning: node "data.main-db": .values key "database_name" is read by no template in recipe "helm-postgres-sourced-with-artifacts" — correct the spelling, or remove the key
  warning: node "data.main-db": .infra key "storage_class" is read by no template in recipe "helm-postgres-sourced-with-artifacts" — correct the spelling, or remove the key
  warning: node "frontend": .context.uses.my-api.values key "retry_budget" is read by no template in recipe "helm-web-ui-sourced-with-artifacts" — correct the spelling, or remove the key
```

The line names no field of the Recipe, and that is deliberate: whoever authored the key is the developer, the operator, or the author of the `uses:` edge it rides on, and none of them edits the Recipe. Naming the block the reference was looked for in would hand that reader a coordinate in a document they do not open. The two remedies the line offers are the two they can act on — a misspelled key is the common cause, and a key that was never going to be read is worth deleting.

The order is fixed: the node's `.values`, then its `.infra`, then each `uses` alias in the order the edges were emitted, keys sorted within each group. The same input therefore produces the same warning sequence on every run.

**Editor visibility.** The warning reaches editor diagnostics only where the language server runs the artifact-rendering stage while inspecting an IR graph — `aggrega serve --build-on-inspect`, or the `serve.build_on_inspect` config key it overrides, which is off by default. That dial adds the advisories a build raises while rendering, and none of the checks a build halts on. The entry names a node rather than an authoring key, so it is drawn on the Aggregate's `kind:` key.

**Why a warning and not a fatal halt.** Developers may legitimately consume different `.values` subsets in conditional template logic — a Recipe whose template branches on `.values.mode` reads `mode` but conditionally reads `.values.replication_password` only when `mode == "replication"`. The static walk cannot tell whether an unreferenced key is a don't-care or a bug. The tracker's purpose is to make the discrepancy visible rather than to police it; silent omission is the failure mode the tracker prevents.

**Recipe-author response.** When a Recipe author sees a Ghost Infrastructure warning for a key they expected the Recipe to consume, the fix is to wire the key into the template. When the unread key is a deliberate omission (a feature the chart does not support, an authoring affordance the Recipe deliberately ignores), the author can document the omission in the Recipe's header comment so future readers know the discrepancy is intentional.

## Unread declared-parameter warnings

**Fires when** an Aggregate declares an entry under `spec.parameters:` and no `{{ .parameters.<key> }}` reference in that Aggregate's own text reads it.

A declared parameter is the authoring surface for varying one value per Release: the Release fulfils the declaration, and a reference carries the fulfilled value into the component values it belongs to. A declaration nothing reads leaves that variation with nowhere to land — whatever a Release supplies for it, the rendered output is the same. It is the parameter-scoped form of the same smell an authored values key nothing consumes carries.

**A default is not an exemption.** A default no reference reads reaches the output no more than a Release-supplied value does, so a defaulted declaration is reported exactly as a bare one is.

**Which references are collected.** The Aggregate's own text, and nothing else. Three consequences follow:

- A parameter reached only by a Component schema's `validate:` predicate is not visible here. Such a predicate names the parameter through the resolved parameter map rather than through a dotted reference in the Aggregate, so the declaration is reported as unread even though the predicate reads it.
- Text that does not parse as a template yields no reference set. Reporting every declaration as unread would bury the diagnostic the interpolation raises over the same text, so nothing is reported instead.
- A reference naming the whole `parameters` map — iterating it, or reaching one entry through index — counts every declaration as read, because the collected reference then names the map rather than a key beneath it and no per-key claim can be made.

**Pipeline placement.** The reading runs at resolution, over the Aggregate's raw text and its declared parameter contract — before rendering. So it surfaces from `aggrega validate` as well as from `aggrega build`.

**Emit shape.** One line per unread declaration, naming the Aggregate and the declaration's locator:

```text
  lint: declared parameter is read by no reference in the Aggregate (Aggregate fullstack-app, at .spec.parameters.unread_probe, "unread_probe")
```

Findings arrive in the order the Aggregate declares its parameters, so the same Aggregate produces the same sequence on every run. Each carries the declaration's locator, which names the offending key. The message names the key as well, which is why it appears twice on a terminal line that prints the locator too: an editor shows the message at the position it placed and never the locator text, so a message that left the key out would read identically for every unread declaration.

**Editor visibility.** The advisory also reaches editor diagnostics through the language server, at warning severity, positioned on the declaration its locator names rather than on the Aggregate as a whole. It is raised before the artifact-rendering stage, so it needs no dial: an editor session surfaces it whether or not `serve.build_on_inspect` is on.

**Why a warning and not a fatal halt.** A parameter may be declared ahead of the reference that will read it, and a static walk cannot tell that from a mistake — the same reason the authored-key reading only ever advises. The compiler does not police which knobs an author exposes.

## Provider-binding unserved-capability warning

**Fires when** an entry under `plugins.providers` in the workspace configuration names a `capability` and no `uri`, and none of the provider plugins the build reads serves that capability. The plugins a build reads are the ones in its catalog directories, the providers inside the compiler, and the plugins its lockfile records.

**Why it exists.** A binding is read only when a Recipe's `capability:` asks for its capability, and an entry that names no plugin selects nothing the capability's resolution would not select without it. So an entry whose capability is misspelt — `hlem` for `helm` — is consulted by nothing and changes nothing, and without this warning nothing would say so.

**Why a warning and not a fatal halt.** Bindings are written once for the whole workspace, while a build is of one Release. The plugin serving the capability may be one that only another Release in the workspace reads, and this build cannot see it, so a halt here would refuse a legal workspace on a guess. An entry that also names a plugin is a different case: a pull resolves every such entry whether or not a Recipe uses it, so the build holds the plugin and knows what it serves, and a capability that plugin does not serve halts — see [fatal-halts.md](./fatal-halts.md) "A `plugins.providers` binding names a plugin that does not serve the capability". An entry for a capability some plugin the build reads does serve is reported as nothing, whether or not a Recipe in this Release uses it.

**Pipeline placement.** Every build and every validation of a Release reads each entry in the composed workspace configuration — the layers and their `providers_append` companions together — before the Release's graph is analysed, so the warning surfaces from `aggrega validate --release` as well as from `aggrega build`, and from `aggrega pull`, which renders the Release once, over the lockfile it is about to write, to discover the external inputs a build of it fetches. The judgement changes nothing about which plugin renders a Recipe; that is read from the lockfile.

**Emit shape.** One line per entry, in the order the composed list carries them, naming the capability and a served capability one edit away where there is one:

```text
  warning: plugins.providers entry names a capability no provider-rendering plugin the build reads serves: capability "hlem", which is one edit from "helm"; the entry names no plugin, so it selects nothing a Recipe would not resolve without it, and none of the plugins this build reads — in the catalog directories, inside the compiler, or among those the lockfile records — serves the capability: correct its spelling, or keep it where the plugin serving it is one only another Release reads
```

**Threshold.** A spelling is offered only at one edit's distance and only when both names are at least four characters long, the same bound the near-miss lints above use and for the same reason.

**Editor visibility.** The warning reaches editor diagnostics through the language server at warning severity. The entry sits in the configuration file rather than in the document being edited, so it is placed at the head of that document rather than on a key.

## Per-entity metadata coverage

Which entity envelopes carry `metadata.labels` and `metadata.annotations` varies by kind. Component, Feature and the library kinds carry both; Aggregate carries labels only; Recipe, FeatureRecipe, Manifest, Release and Plugin do not accept either key at the envelope level. [Status of the Language](../10-status.md) holds the per-entity position and is the surface to consult.

**Editor visibility.** No advisory covers this, on any setting: there is nothing to report, because an entity either carries these keys or does not accept them, and a key a kind does not accept is a question its schema answers when the document loads rather than something the rendering stage reports afterwards. An author checks the status page rather than waiting for a warning.

## Unsupported-field warnings

One class covers everything you authored that the target cannot honour. It has two members — a Workload field the target cannot express, and an `aggrega.ai/` annotation the target does not act on — and they share one class code and one suppression flag, because an author who wants to silence "the things this target ignores" wants them silenced together rather than one switch at a time.

### A Workload field the target cannot express

Targets differ in fidelity. A Workload field that one target expresses natively may have no equivalent on another — Docker Compose has no notion of a scheduling constraint, a service account, or a priority class, for instance. When a Workload declares such a field and the target cannot express it, the field is **omitted with a warning**, one warning per authored field. It is neither dropped silently nor treated as a fatal error.

The distinction from a fatal halt is the granularity. An unsupported *form* halts the build loudly — the target cannot produce that shape of workload at all. A supported form that carries an *unexpressible field* renders, minus that field, and says so.

On the compose target the class currently covers `scheduling`, `serviceAccount`, `replicas`, `runtimeClassName`, `priorityClassName`, `imagePullSecrets`, `dnsPolicy`, `dnsConfig.options`, container `runAsNonRoot`, and every extended-resource key but `nvidia.com/gpu` — `amd.com/gpu`, for example — since that one is reserved as NVIDIA GPUs. The cases below emit a partial variant of the same class, where the field is reduced rather than removed:

- `persistentTemplate` — per-replica volume templating is unavailable, so the volume collapses to a single shared persistent volume rather than disappearing.
- A container `attachments` entry with `as: env` — compose cannot source an environment variable from an attachment, so the variable is emitted with an empty value. The warning names the entry at its authored coordinate (`containers.<name>.attachments.<KEY>`, or `initContainers[<i>].attachments.<KEY>` for a positional init entry), so it is clear which variable arrives empty and which container it belongs to. An entry with `as: file` is bind-mounted normally and raises nothing.
- A `volumes` entry that no container mounts — the warning names the volume at its authored coordinate (`volumes.<name>`). What reaches the output depends on the variant: a `persistent` or `persistentTemplate` volume is still declared as a named volume, which is then created and left unused, while a `configmap`, `secret`, or `ephemeral` volume reaches the output only through a container's mount point, so with nothing mounting it the declaration produces no output at all. Either way the volume you authored is not doing anything: mount it from a container, or remove it. Every container of the workload counts as a mounter, init containers included, so a volume mounted only by an init container raises nothing.
- A `health` block declaring more than one probe slot — a compose service carries a single `healthcheck`, so the priority order `live > ready > startup` keeps one slot and every other declared slot reaches no part of the output. The warning names the block at its authored coordinate (`containers.<name>.health`, or `initContainers[<i>].health` for a positional init entry) and names both the slot that was translated and the slots that were dropped, so it is clear which probe is live in the output and which authored intent is inert. A block declaring a single slot translates without loss and raises nothing.
- `hostNetwork` on a workload that also declares `initContainers` — the workload's own service runs on the node's network, but each init container becomes its own service that joins the boundary network in its own right, because sharing the main service's namespace would make the main service's wait on it circular. That is narrower than the pod shape being modelled, where every container shares one namespace, so the difference is named rather than left to be found at run time. A workload declaring `hostNetwork` with no init containers translates without loss and raises nothing.

### An annotation the target does not act on

The `aggrega.ai/` annotations are platform directives a provider reads and applies to what it renders — a namespace, a registry prefix, a service account. Which of them a provider reads is that provider's own declaration, made per input kind, because a provider that owns every field of a deployment unit it synthesizes itself often has nowhere to put the same value when it renders a vendored artifact. [Well-Known Annotations](../providers/well-known-annotations.md) is the matrix.

A node's own Recipe and each feature attached to that node render separately, each through the target its own `capability:` names and at the input kinds its own `source:`, `workload:` and `artifacts:` declare. When such an annotation reaches one of those renders and the resolved target's declaration covers the key on none of the input kinds *that* render declares, the target applies nothing for that key, and the build **says so with a warning** naming the key, the target and every input kind that render declares:

<!-- unregistered-output: warning text, which is reported without halting and which no halting condition registers -->

```text
warning: node "frontend" (provider "helm-chart"): target "helm-chart" does not support annotation aggrega.ai/namespace on sourced input and ignored it
```

These consequences follow from how annotations reach a render, and each of them is deliberate:

- **One authored line can produce several warnings.** A boundary annotation cascades to every component under it, and those components may render through different targets and different input kinds. Each warning is a true statement about one render, so you get one per render that cannot act on the key — which is also what tells you *which* parts of your output are affected.
- **A feature attached to a node is judged on its own FeatureRecipe, not on the node's Recipe.** An attachment that generates resources of its own renders them through the target its FeatureRecipe names, at the input kinds that FeatureRecipe declares — so an annotation the node's own target applies may reach nothing in the attachment's files, and the reverse holds too. You are told about each independently, because they are different files. The same holds for a feature attached to a boundary rather than to a named component. An attachment whose FeatureRecipe declares none of `source:`, `workload:` and `artifacts:` renders no files of its own — it contributes by injecting values, by the `uses` edge its Feature carries, or by a pipeline over documents something else emitted — so there is no output of its own for an annotation to be missing from, and nothing is warned about for it.
- **A render declaring more than one input kind is judged on all of them.** Its declared kinds compose by addition and their outputs are added together, so a target reading the key on any one of them applies it and the value appears in the rendered output. Nothing is warned about in that case, because there is nothing to report. A warning appears only when every declared kind misses the key, and it names them all — `on sourced or synthesized input`.
- **Only the bare `aggrega.ai/` keys are checked.** A sub-prefixed key — `compliance.aggrega.ai/data-class`, or your own `acme.aggrega.ai/team` — is your vocabulary, which the compiler carries through without interpreting. Nothing warns about one, ever.
- **A target that declares no support claim at all raises nothing.** The warning compares what you authored against what the provider said it reads; a provider that has said nothing gives it nothing to compare against, and inferring a refusal from silence would report a claim the provider's author never made. A provider that reads none of the keys says so with `readsNoWellKnownAnnotations: true`, as `terraform` does, and every bare key reaching one of its renders is then warned about.

**Why a warning and not a halt.** A boundary that legitimately spans components on heterogeneous targets will always have some node that cannot act on a given key — that is the normal shape of a Release spanning several targets, not a mistake — so refusing the build would reject correct Releases. The value passes through untouched, and the warning tells you so.

### The class code and the out-of-band guarantee

Each warning carries the stable, machine-matchable class code `unsupported-field`, so tooling can match the class rather than parse the message text. Every member of the class — the omitted-outright field, the reduced-form field, and the unacted-on annotation — carries that one code, which is what lets a single filter suppress the whole class. The warnings travel out-of-band from the rendered artifacts, which means **rendered bytes are byte-identical whether or not the warnings surface** — suppressing them cannot change your output.

**Editor visibility.** Every member of the class reaches editor diagnostics only where the language server runs the artifact-rendering stage while inspecting an IR graph — `aggrega serve --build-on-inspect`, or the `serve.build_on_inspect` config key it overrides, which is off by default. That dial adds the advisories a build raises while rendering, and none of the checks a build halts on. The class code above travels on the published diagnostic as it does on the terminal line, so an editor client matches the same class an author reads. Each entry names a node and a target rather than an authoring key, so it is drawn on the Aggregate's `kind:` key.

### Suppressing the class

Both commands that render accept `--no-unsupported-field-warnings`, which silences this class alone while every other render warning still surfaces:

```bash
aggrega build --release release.yaml --no-unsupported-field-warnings
aggrega validate ./catalog/recipe/compose/mariadb/1.0.0/recipe.yaml --no-unsupported-field-warnings
```

The flag is display-only and does not change the rendered output. `aggrega lint` has no equivalent flag because it runs no render pass — it checks publishing conventions only, so no render warning can arise there.

Reach for the flag when you have accepted the reduced fidelity deliberately — a compose target used for local development, where the production Workload's scheduling and service-account fields are expected to be inert. Leave it off otherwise: the warning is how you learn that a field you authored is not reaching the target.

## A declared-sensitive value travels as a literal

**Fires when** an attachment fills a slot by delivering a datum its schema declares sensitive into a delivery key as a **literal value**, rather than as a reference the target resolves when it deploys.

**Emit shape.** One line per delivery key, naming the attachment instance, the delivery mechanism the key lands in, and the key itself, attributed to the node and the target that rendered it:

<!-- unregistered-output: warning text, which is reported without halting and which no halting condition registers -->

```text
  warning: node "db" (provider "compose"): attachment "user_password" delivers a value declared sensitive to env delivery key "MARIADB_PASSWORD" as a literal; where the target supports it, fill the slot with an attachment that delivers a reference instead
```

**The class code.** The advisory carries the stable, machine-matchable class code `sensitive-by-value`, so tooling matches the class rather than parsing the message text. The code travels on the terminal line and on the structured diagnostic the language server publishes, so an author and an editor client read the same class — under the editor-visibility condition below, which governs whether the language server publishes this advisory at all.

**Editor visibility.** The advisory reaches editor diagnostics only where the language server runs the artifact-rendering stage while inspecting an IR graph — `aggrega serve --build-on-inspect`, or the `serve.build_on_inspect` config key it overrides, which is off by default. That dial adds the advisories a build raises while rendering, and none of the checks a build halts on. The entry names a node and a target rather than an authoring key, so it is drawn on the Aggregate's `kind:` key.

**It is a class of its own, and `--no-unsupported-field-warnings` does not cover it.** That flag silences the unsupported-field class above; this advisory still surfaces alongside it. There is no flag that silences this one.

**The build succeeds and the rendered bytes are unchanged.** The advisory travels out-of-band from the rendered artifacts, as the unsupported-field class does, so what reaches your output is the same whether the line surfaces or not.

## A declared-sensitive value reaches the target through a values mapping

**Fires when** a render from a `source:` hands its target the output of a `valuesMapping:` while the entity whose values that mapping reads declares a `values` leaf sensitive: a Recipe's mapping over a leaf its Component declares, or the FeatureRecipe's mapping of a Feature attached to a component over a leaf that Feature declares. A mapping is one template whose output keys are its own invention, so no declaration names any of them, and the target receives no per-key sensitivity marking for the leaf. It is the one render shape where a declaration reaches no rendered key while the author still holds a lever over it.

**Emit shape.** One line per declared leaf, naming the leaf at its authored coordinate and the Recipe or FeatureRecipe whose mapping gates the join, attributed to the node and the target that rendered it. The line for an attached Feature leads with the name it is attached under, because one component can carry several attachments of one Feature and their lines would otherwise be identical — the second line below is a Feature attached to the component `api` as `token`:

<!-- unregistered-output: warning text, which is reported without halting and which no halting condition registers -->

```text
  warning: node "api" (provider "terraform"): "values.token" is declared sensitive, but recipe "terraform/api" maps its values through a valuesMapping whose output keys no declaration names, so the target receives no per-key sensitivity marking for it; the mapping's whole output is marked as carrying a value declared sensitive instead wherever the mapping reads such a value and its output changes, or its evaluation fails, when every value declared sensitive or computed from one is replaced by either of two stand-in texts; a recipe declaring no valuesMapping renders the declared leaf paths as its own keys, and the per-key marking travels with them
  warning: node "api" (provider "terraform"): attachment "token": "values.token" is declared sensitive, but FeatureRecipe "terraform/api-token" maps its values through a valuesMapping whose output keys no declaration names, so the target receives no per-key sensitivity marking for it; the mapping's whole output is marked as carrying a value declared sensitive instead wherever the mapping reads such a value and its output changes, or its evaluation fails, when every value declared sensitive or computed from one is replaced by either of two stand-in texts; a FeatureRecipe declaring no valuesMapping renders the declared leaf paths as its own keys, and the per-key marking travels with them
```

**What the lever is.** Without a mapping, the values a source render receives are keyed by the declared leaf paths themselves, so the declaration joins its rendered key exactly and the marking travels with it — on the Terraform target that is the generated override file described at [Declared-sensitive module inputs](../providers/terraform.md#declared-sensitive-module-inputs). With a mapping, the marking that does arrive covers the mapping's output as a whole, and only where what the mapping produces depends on the declared value — its template reads one, and evaluating it again with the value replaced by each of two different stand-in texts fails or changes its output; a mapping that reads a declared value only to test it, such as its length, where both texts give the test the same answer, is not marked — though a presence test is marked where the value is set to an empty text, false or 0, since both stand-in texts read as true: it governs the text a plugin composes when it refuses or warns, and changes no rendered byte.

**Three shapes stay silent, and deliberately.** An artifacts-only render and a workload-only render hand their target no values map at all, so a `values` leaf has no rendered key to mark there however it is authored. A Feature attached to a boundary draws none either, whatever its FeatureRecipe maps: a boundary carries no `values:` block, so such an attachment renders against an empty `values` pillar, none of its Feature's `values` leaves can carry a datum there, and removing the mapping would mark nothing. Each is a permanent property of the shape rather than something an author can change, so a warning about it would fire on every build and name nothing to do; the ceiling is taught at [Declaring a leaf sensitive](../vocabulary/compact-form-authoring.md#declaring-a-leaf-sensitive--sensitive) instead. A render from a `source:` with no `valuesMapping:` is silent too, because there the marking arrives.

**The class code.** The advisory carries the stable, machine-matchable class code `sensitivity-not-conveyed`, so tooling matches the class rather than parsing the message text: the assistant's `build` tool lists each finding under `advisories` with it. It names a class of finding rather than a registered condition, so it has no row in the table at the top of this page.

**Editor visibility.** The advisory reaches editor diagnostics, at warning severity and carrying the same line a terminal build prints, whenever the language server renders the Release — a build or a build preview it is asked for, or an IR-graph inspection with `aggrega serve --build-on-inspect`, or the `serve.build_on_inspect` config key it overrides, which is off by default. The entry names a node and a target rather than an authoring key, so it is drawn on the Aggregate's `kind:` key.

**It is a class of its own, and `--no-unsupported-field-warnings` does not cover it.** That flag silences a target's fidelity notices, a different judgement made for different reasons; this advisory still surfaces alongside it. There is no flag that silences this one.

**The build succeeds and the rendered bytes are unchanged.** The advisory reports an absence — no rendered key carries the marking — and a mapping is an ordinary, supported shape, so there is nothing to halt over and nothing in your output moves whether the line surfaces or not.

## A Terraform module call the engine fetches when it initialises

**Fires when** a Terraform module the build vendors, or a Recipe's authored Terraform body, declares a `module` block whose `source` Terraform downloads when the configuration is initialised rather than reading it from the files the build placed: a registry address, a git, Mercurial or HTTP archive URL, an S3 or GCS bucket, or an absolute path — or a local path that climbs out of the vendored module, which names files the build did not vendor. The lock fixes the vendored module's commit and archive digest, and Terraform's own dependency lock file records providers only, so the module such a call names is fetched at whatever version the engine then selects and nothing this build records covers it.

**What it reads.** The configuration files the engine loads when the module is called — those directly in the module's own directory and in each directory a local `source` reaches from there — and nothing in a directory nothing calls, so a call written in a module's `examples/` or `tests/` directory is not reported. It reads what a `source` says and never the module that source names. A file under a Recipe's `spec.boundary.artifacts` is evaluated and written by the compiler itself and handed to no provider, so a `module` block written in one is not read and draws no warning. [Structural input validation](../providers/terraform.md#a-module-call-the-engine-fetches-when-it-initialises) on the provider page states the rule in full.

**Emit shape.** One line per call, naming the node and the provider, then the block, the file and line it sits at, and the source as written; a source that climbs out of the module says so instead of naming a download:

<!-- unregistered-output: warning text, which is reported without halting and which no halting condition registers -->

```text
  warning: node "app" (provider "terraform"): module "vpc" (main.tf, line 2) has the source "terraform-aws-modules/vpc/aws", which Terraform downloads when the configuration is initialised, at whatever version it then selects, so no commit or digest this build records covers that module
  warning: node "app" (provider "terraform"): module "shared" (main.tf, line 2) has the local source "../shared", which resolves outside the module this build placed, so Terraform reads whatever sits at that path when the configuration is initialised rather than files this build vendored
```

The calls arrive in the order the engine reaches them — the module's own directory first, then each directory in the order a local source first reaches it, and within a file in the order its blocks are written — so the same input produces the same sequence on every run. Every run that renders raises them: `aggrega build`; `aggrega pull`, which renders the Release once to discover what a build of it fetches; and `aggrega validate` over a Recipe whose module the workspace holds, which renders that Recipe on its own.

**The class code.** Each warning carries the stable, machine-matchable class code `module-fetched-at-init`, so tooling matches the class rather than parsing the message text. The code travels on the structured diagnostic: the assistant's `build` tool lists each finding under `advisories` with it, and the language server publishes it on each entry. It names a class of finding rather than a registered condition, so it has no row in the table at the top of this page.

**Editor visibility.** The warning reaches editor diagnostics on the `aggrega-build` layer, at warning severity, whenever the language server renders the Release — a build or a build preview it is asked for, or an IR-graph inspection with `aggrega serve --build-on-inspect`, or the `serve.build_on_inspect` config key it overrides, which is off by default. The entry names a node rather than an authoring key, so it is drawn on the Aggregate's `kind:` key.

**It is a class of its own, and no flag silences it.** `--no-unsupported-field-warnings` silences the unsupported-field class and does not cover this one.

**The build succeeds and the rendered bytes are unchanged.** The warning travels out-of-band from the rendered artifacts, so the vendored module, the authored body and the root configuration are byte-identical whether or not it surfaces.

**Why a warning and not a halt.** A module that calls another module is legitimate input: Terraform fetches the called module and the configuration works. What the author gives up is the build's pin over that module, which is a fact to report rather than a fault to refuse, and whether the fetch is acceptable is the author's call.

## A plugin ran with no recorded digest to check it against

**Fires when** the compiler is about to run a plugin, a recorded digest is meant to govern that plugin's bytes, and the workspace records none for it. The plugin runs; the warning is how you learn that nothing compared the bytes it ran against the bytes anyone reviewed.

`aggrega pull` writes the digest of every plugin it acquires into the Release's lockfile, and every later resolution compares the bytes it finds against that digest. A workspace that has not been pulled yet, or one whose lockfile predates a plugin the configuration has since attached, has no digest for that plugin — so the comparison has nothing to compare, and without this line it would pass silently.

A pipeline step, a provider, or a plugin attached at a verdict role whose `Plugin` entity is authored in one of your catalog directories has no digest either, and a pull does not give it one: the pull never pins such an entity, and a build reads its `.wasm` afresh every time — from beside the entity, in the ordinary case — rather than against anything a pull recorded. A plugin attached at a transform role and authored there is the exception: its bytes shape the rendered output, so a pull records the digest of the `.wasm` it finds for it, and once it has, a build checks that plugin against the digest and this line is not raised for it.

<!-- unregistered-output: warning text, which is reported without halting and which no halting condition registers -->

```text
  warning: plugin "governance/label-injector:1.0.0" resolved from cache with no recorded digest to check it against, so it runs unverified; run `aggrega pull --release <release>` to record it
```

<!-- unregistered-output: warning text, which is reported without halting and which no halting condition registers -->

```text
  warning: plugin "pipeline-step/patch" resolved from local with no recorded digest to check it against, so it runs unverified; it is read from beside its Plugin entity in a catalog directory on every build, and a pull records its digest only for a plugin attached at a transform role; otherwise publish the plugin and reference the published entity to have its digest recorded
```

That is the line a build, a pull or a validation shows among its other warnings. A command that resolves a plugin outside such a run — installing, listing or running the workspace's own command-line plugins, or `aggrega lint` resolving the plugins it lints with — prints the same sentence on a line of its own, unindented.

The line names the source the bytes came from — the same word `aggrega pull` and `aggrega plugin list` use for it — and ends in what holds for that source. For bytes from the content cache the fix is to pull the Release, which records the digest and makes every later run of that plugin a checked one. For bytes read from beside a `Plugin` entity in a catalog directory, a pull records the digest only for a plugin attached at a transform role, and the line says so: for any other plugin authored there, no pull changes it, and the way to bring it under a recorded digest is to publish it and reference the published entity.

**It is shown once per plugin for each command, however many times the command resolves that plugin.** A render resolves its provider once per node, and a build that fills its own lockfile can render the Release more than once; repeating the line each time would bury it. The editor service shows it on its own error stream once for as long as it runs, while every request it answers reports it to the editor afresh — so whichever answer the editor draws from tells you about the plugins that run used unverified.

**Editor visibility.** The warning reaches editor diagnostics with the run's other advisories, at warning severity: a validation of a Release publishes it on the Release's Aggregate, and a build or build preview the editor asks for publishes it on the `aggrega-build` layer. It names a plugin rather than a key you wrote, so it is placed at the head of the file. Because each run reports what it resolved, the entry stays for as long as a run resolves the plugin unverified and clears with the first run that does not. It changes no verdict and fails no resolution, so what a session answers is the same whether or not it is shown.

**Two resolutions raise nothing, and neither is an oversight:**

- **A plugin the compiler carries inside itself.** `aggrega pull` records what it fetched, and there is nothing to fetch for bytes that ship in the binary — so no digest is ever recorded for one, and there would be nothing you could run to change that. The binary is those bytes' identity. The compiler's own plugins and their versions are listed by `aggrega plugin list` and stamped into the lockfile's `toolchain` section.
- **A resolution where no digest was ever meant to apply.** `aggrega validate --plugin ./some.wasm` points at a file you named on the command line, and `aggrega lint` inspects the very artifact it is checking; in both, the plugin is the subject rather than a tool being trusted, so there is no record it could be held to.

**Why a warning and not a halt.** Reading a document is worth doing on a workspace nobody has prepared yet — refusing to validate or lint until someone runs `aggrega pull` would make the reporting commands unusable at exactly the moment they are most useful. `aggrega build` will not produce artifacts without a lockfile at all, so the build meets this warning only for a plugin its lockfile records no digest for — the ordinary case being one read from beside its entity in a catalog directory.

**Where a missing lockfile refuses instead.** When an editor asks the compiler service for a Release's graph and the workspace has no lockfile at all, the service stops and asks for one rather than drawing a graph. A lockfile that exists and simply records no digest for a plugin is the case above instead: the plugin runs, and this warning is how you learn it. A drawn graph is what a reader then reasons about, and one built from unverified bytes would look exactly like one that was checked. See [`aggrega serve`](../cli/aggrega-serve.md).

## A published archive carries an entry Windows cannot use

**Fires when** [`aggrega push`](../cli/aggrega-push.md) — or its `--dry-run` — publishes an archive one of whose entries holds a part Windows cannot hold as written: a name Windows reserves for a device, such as `CON`, `PRN`, `AUX`, `NUL`, `COM1` or `LPT1`, in any letter case and whatever extension follows, or a part ending in a full stop or a space. `aux/x.yaml` holds one in its directory; `report.` and `COM1.yaml` hold one in their file name. On Windows, `aggrega` refuses to unpack such an entry, so a Windows workspace cannot use the version at all. The warning fires on every platform, because a publication is for whoever pulls it, and it is how its author learns this before someone on Windows does.

**What it reads.** The names the archive will hold: the entity document's own file name, then each file the entity names beside it — the files [Bundling](../cli/aggrega-push.md#bundling) lists. So a document called `con.yaml` that imports a schema file draws the warning for its own name. An entity that names nothing publishes as its document alone, which a consumer lays out under a name the product chooses rather than the one you authored, so it is never warned about, whatever its file is called. A Plugin publishes no archive and is never warned about either.

**Emit shape.** One line per entry, on standard error, in the order the names are composed — the document first, then the files it carries in lexical order — ahead of the dry run's or the publication's own account on standard output:

```text
warning: an entry this publication carries cannot be used on Windows (the entry "aux/x.yaml", its segment "aux"). Windows reserves device names such as CON, PRN, AUX, NUL, COM1 and LPT1, in any letter case and whatever extension follows, and does not hold a segment ending in a full stop or a space as written, so a workspace on Windows refuses to unpack the entry. This warning does not stop the publication; rename that segment to publish a version Windows can use
```

The first quoted value is the entry as the archive names it. The second is the first of its segments — the parts its slashes separate — that Windows cannot hold, which is the part to rename. The line opens with the condition's fixed sentence. It is raised by the publication rather than by a rule a build evaluates, so it has no row in the table at the top of this page; [the table of every condition](./sentinels.md#every-condition-by-short-code) lists it under `E0344`.

**It refuses nothing.** The push, or its dry run, goes ahead or is refused exactly as it would be without the warning, and exits as it would have.

**Where else it reaches.** The assistant's `publish-entity` tool answers with the same entries as `windows_unusable_entries`, and `aggrega serve` answers `aggrega/publishEntity` with them as `windowsUnusableEntries`; each is absent where there is none. See [aggrega mcp](../cli/aggrega-mcp.md) and [aggrega serve](../cli/aggrega-serve.md). The service also passes the warning line itself to a request that asked to be reported on, among the rest of the publication's account.

**Editor visibility.** None as a diagnostic: publishing is not a build, so nothing here reaches a problems list. An editor publishing through the service reads `windowsUnusableEntries` on the answer.

**Why a warning and not a halt.** Such a name is legal, and Linux and macOS use the file as it is named, so refusing the publication would refuse a working entity on a guess about who will pull it. Whether to rename is the author's call.
