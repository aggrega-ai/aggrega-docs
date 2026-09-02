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
<!-- END GENERATED: advisory-short-codes -->

## Schema-pillar-overlap lint

**Fires when** a Component or Feature declares the same property name in both the `values:` and `infra:` pillars of its `spec.schema:` block at the same nesting depth. Schema authors who put the same field name in both pillars usually mean to put it in one or the other; the lint flags the duplication so the author can resolve which pillar owns the field.

**Pipeline placement.** The lint runs in the validation pass after schema unification, before topology construction. It walks the resolved schema (after compact-form expansion and `$ref:` resolution against SchemaLibrary entries) and reports each overlapping property as a separate warning.

**Emit shape:**

<!-- unregistered-output: lint text, which is reported without halting and which no halting condition registers -->

```text
LINT: Component "core/web-server" at ./catalog/component/core/web-server.yaml declares property "storage_size" in both values: and infra: pillars (path: spec.schema)
```

For nested properties, the warning includes the dotted path:

<!-- unregistered-output: lint text, which is reported without halting and which no halting condition registers -->

```text
LINT: Feature "core/db-pool" at ./catalog/feature/core/db-pool.yaml declares property "connection.timeout" in both values: and infra: pillars (path: spec.schema.connection)
```

**Soft-skip discipline.** The walker terminates without warning when a schema branch carries one of the JSON Schema 2020-12 escape hatches that prevent statically-derivable property sets: `$ref` (cross-document or in-document references), `patternProperties` (key-shape-based property declarations), and the composition operators `oneOf` / `anyOf` / `allOf` (disjunctions and conjunctions whose branches may declare divergent property sets). Walking these branches would either require evaluating the referenced or composed schema at lint time (a class of work the lint does not perform) or produce false positives when one branch's `values:` property name happens to collide with another branch's `infra:` property name. The lint emits no warning for the affected nesting depth; deeper levels of the same schema are still walked and lintable.

**Authoring note.** The compiler does not reject pillar-name overlaps — the lint is advisory. A Component with `storage_size` in both pillars compiles; the developer-side `values.storage_size` and the operator-side `infra.storage_size` are validated independently by their pillar schemas, and the Recipe's `valuesMapping:` template chooses which pillar's value flows into the rendered output. The lint exists because the authoring pattern is almost always a mistake; conscious cross-pillar duplication is rare enough that authors who genuinely want it can ignore the warning. For the broader cross-pillar mechanics — including the rare cases where deliberate cross-pillar piping is justified — see [vocabulary/data-pillars.md](../vocabulary/data-pillars.md) "Cross-pillar mechanics".

## Binding-map-overlap lint

**Fires when** a Manifest annotation binding declares the same dotted path in both its `maps.infra` and `maps.values` lists. The path would route through both pillars; the compiler's deterministic tie-break sends it through `infra:`, which makes the `values:` side unreachable from the Aggregate. The lint surfaces this so the author can either narrow the binding to a single pillar or accept the infra-side-only routing consciously.

**Pipeline placement.** The lint runs at workspace load, after Manifest resolution but before any annotation expansion fires. It walks the bindings under `mappings.features.annotations` in the order they were authored, intersects each binding's `maps.infra` and `maps.values` lists, and reports one finding per overlapping path. Within one binding, overlapping paths are reported in sorted order, so repeated runs over identical input report an identical sequence.

**Emit shape:**

```text
  lint: annotation binding declares one path in both pillar lists (Manifest, at .spec.mappings.features.annotations.compliance.aggrega.ai/data-class, annotation binding "compliance.aggrega.ai/data-class" on Feature "core/data-masking" declares path "classifier_endpoint" in both maps.infra and maps.values; the routing tie-break sends this subkey through the infra pillar, which makes it unreachable from the Aggregate side — declare two bindings under two annotation keys if both pillars are meant to route it)
```

**Editor visibility.** The finding also reaches editor diagnostics through the language server, at warning severity, positioned on the annotation-binding block it names. An author who never reads terminal output still sees it.

**Matching it programmatically.** The finding carries `ErrAnnotationBindingPillarOverlap` from `pkg/resolver`, so a consumer recognises the class with `errors.Is` rather than by matching the message text. Like every advisory sentinel it never reaches a build's verdict — see [sentinels.md](./sentinels.md) for the accessor and the condition's codes.

**Deterministic tie-break.** The runtime resolves the collision by routing the path through the `infra:` pillar exclusively. The choice is consistent across builds; the author can rely on it. The `values:` side is dropped from the binding's effective routing — Aggregate-side annotations attempting to reach the path receive no routing target and the build halts on the Aggregate side at expansion time, under the halt described at [fatal-halts.md](./fatal-halts.md) "An annotation routes through a pillar its authoring side may not use". The lint is the early warning surface; that halt is the enforcement surface.

**Authoring note.** Like the schema-pillar-overlap lint, this lint is advisory — the binding compiles and the runtime tie-break produces deterministic output. The lint fires because the authoring pattern is almost always unintended; a binding author who genuinely wanted both pillars to route the same path would author two separate bindings with different annotation keys.

## Attachment-slot near-miss lint

**Fires when** a component instance attaches a Feature under a name that is not one of its Component type's declared `featuresSchema` slots, but is within one edit of one — a single inserted, deleted, or substituted character, or two adjacent characters swapped. That is the shape a slot-name typo takes, and the lint names both spellings so the author can see the pair.

**Why it exists.** Declaring a slot does not close the attachment surface: an attachment under a name no slot declares is legal, because that openness is what lets one catalog entity serve both a slot-filled attachment and a credential shared at a broader scope. The cost is that a misspelled slot name is silently a *free attachment* rather than a fill of the slot the author meant — the build succeeds and the slot simply stays empty. The lint is the disclosed mitigation for exactly that case.

**Pipeline placement.** The lint runs at resolution, in the same pass as the catalog-aware semantic guards, over the resolved Aggregate. It walks every component instance's attachment names against the declared slot names of that instance's Component type, and emits one warning per near-miss pair.

**Emit shape:**

```text
  lint: Aggregate nearmiss at .spec.components.db.features.app_user_passwrod: attachment name is a near miss for a declared slot ("app_user_passwrod", on component type "core/datastore/postgres", near the declared slot "app_user_password")
```

The first quoted value is the name the attachment was written under, which is what the warning's opening sentence is about. The two that follow are introduced by the words that say what they are: the Component type the attachment sits on, and the declared slot it sits within one edit of.

**Editor visibility.** The warning also reaches editor diagnostics through the language server, at warning severity, positioned on the offending attachment key. An author who never reads terminal output still sees the pair.

**Threshold and its trade-off.** The lint pairs names only at one edit's distance, and only when both names are at least four characters long. Below that length nearly every short name sits within one edit of every other, so pairing them would produce noise rather than signal; above one edit the pairs stop resembling typos. A transposition counts as one edit rather than two, because a swapped pair of characters is the commonest slip and a stricter count would miss it.

**Authoring note.** The lint is advisory and never changes the build's verdict — the compiler does not police what an author names an attachment. An author who deliberately attaches a Feature under a name that resembles a slot (a second, differently-configured credential named alongside the slot it complements) can ignore the warning; the attachment behaves exactly as authored.

## Uses-socket near-miss lint

**Fires when** a component's own `uses:` block names a socket that is not one of its Component type's declared `usesSchema` sockets, but is within one edit of one — a single inserted, deleted, or substituted character, or two adjacent characters swapped. That is the shape a socket-name typo takes, and the lint names both spellings so the author can see the pair.

**Why it exists.** Declaring a socket does not close the `uses:` surface on a developer's own component: a socket name no `usesSchema` entry declares is legal, because catalog silence about a socket means the connection was not anticipated rather than forbidden, and the developer owns the application's topology. The cost is that a misspelled socket name becomes an *ad-hoc connection* of its own rather than wiring the socket the author meant — the build succeeds, the intended socket simply stays unwired, and the ad-hoc edge carries no selector and no per-edge contract. The lint is the disclosed mitigation for exactly that case. For what an ad-hoc socket gives up and what it keeps, see [entities/component.md](../entities/component.md) "Topology Sockets: `usesSchema`".

**Which surface it covers.** The component's own `uses:` block only — the one surface where an undeclared socket name is accepted. A Feature attachment's `uses:` may only name a socket the attached Feature declares, and a Release's per-edge `uses:` may only name a socket the consuming Component declares; a wrong name on either of those already halts the build, so there is nothing for a warning to add.

**Pipeline placement.** The lint runs at resolution, in the same pass as the catalog-aware semantic guards, over the resolved Aggregate. It walks every component instance's own socket names against the declared socket names of that instance's Component type, and emits one warning per near-miss pair. A component that arrives from a sub-aggregate is not covered: its inner components are folded into the graph after this pass runs.

**Emit shape:**

```text
  lint: Aggregate aggregate at .spec.components.web: uses socket name is a near miss for a declared socket ("databses", on component type "core/devtool/adminer", near the declared socket "databases")
```

The first quoted value is the socket name the author wrote, which is what the warning's opening sentence is about. The two that follow are introduced by the words that say what they are: the Component type the socket was named on, and the declared socket it sits within one edit of. The consequence the warning does not spell out is the one described above: the misspelled name is an ad-hoc connection, so it carries no selector and no per-edge contract, and the socket the author meant stays unwired.

**Editor visibility.** The warning also reaches editor diagnostics through the language server, at warning severity, positioned on the component whose `uses:` block holds the offending name. An author who never reads terminal output still sees the pair.

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

<!-- unregistered-output: lint text, which is reported without halting and which no halting condition registers -->

```text
  lint: Aggregate model-api-key-sharing-shared at .spec.subsystems.model.components["gateway"].type: Recipe "openai-compatible" publishes provides key "provider", which Component "core/ai-model/openai-compatible" does not declare in its schema.provides contract — a consumer across a uses edge reads the declared contract, so this key is not delivered and a template reading it renders empty; declare the key on the Component if consumers are meant to read it, or move it to the Recipe's locals if it is the Recipe's own working state
```

The finding belongs to the instance that carries it, so ten instances of one Component type publishing the same undeclared key raise ten lines rather than one, each positioned at its own instance. Every line is attributed to the Recipe that published the key, because that is the document you edit to resolve it. The walk is deterministic, so the same input produces the same advisory sequence on every run.

**Editor visibility.** The advisory also reaches editor diagnostics through the language server, at warning severity, positioned on the component instance whose `type:` binds the Recipe. An author who never reads terminal output still sees it.

**Authoring note.** The lint is advisory and never changes the build's verdict — a Recipe publishing more than its Component declares still builds. The fix is one of two, and which one is right is the author's call: declare the key on the Component when consumers are meant to read it, or leave it undeclared when it is the Recipe's own working state, in which case `locals:` is where such state belongs. The opposite case is not advisory: a Component declaring a key its Recipe does not publish leaves the contract unfulfilled and halts the build.

## Ghost Infrastructure Tracker warnings

**Fires when** a key an author declared reaches a node and the bound Recipe's `valuesMapping:` template never references it. The unread keys become silent infrastructure: configuration the developer or the operator asked for that the Recipe never wires into the rendered output. The tracker surfaces them so the discrepancy between what was authored and what the output carries is visible instead of silent.

**Which authored keys are compared.** Three groups, per node:

- `.values` — the node's own developer-side pillar.
- `.infra` — the node's own operator-side pillar.
- `.context.uses.<alias>.values` — the per-connection values carried on each `uses:` edge the node consumes through. This group is consumer-scoped for free: a node's `uses` map holds only the edges it is the source of, so an unread per-connection value is always attributed to the node that authored it and never to the edge's target.

**Which references are collected.** The bound Recipe's **inline** `valuesMapping:` template, and nothing else. Two bounds follow, and both are limits on what can honestly be claimed rather than choices:

- A `valuesMapping:` the Recipe imports from a file or from a SchemaLibrary-style library reference is not in hand at this point, so its references cannot be collected. The node's keys are skipped entirely rather than reported.
- A `valuesMapping:` that fails to parse yields no reference set at all. Reporting every key as unread would bury the parse diagnostic the evaluation raises over the same template, so nothing is reported instead.

**A socket's `valueSchema` is never flagged.** `usesSchema.<socket>.valueSchema` declares the *contract* a per-connection value must satisfy. It is a schema, not an authored instance, and it is not among the inputs compared — so it can never be reported. What a socket's declared default *produces* is an instance like any other, read or unread on its own merits.

**A reference naming a whole pillar counts every key beneath it as read.** `{{ .infra.port }}` marks `port` read and leaves the pillar's other keys eligible for a warning. ``{{ optional .infra `port` 8080 }}`` hands the whole `.infra` map to a function, so the collected reference names the pillar rather than a key beneath it, every key in that pillar counts as read, and the pillar raises nothing. The same holds for `range`-ing a pillar and for reaching one `uses` entry through `index`. A Recipe author who wants per-key coverage writes per-key references.

**Pipeline placement.** The tracker runs at base rendering, alongside template evaluation. The Recipe's `valuesMapping:` template is parsed and walked to collect the dot-qualified field paths it references (`.values.port`, `.infra.replicas`, `.context.uses.<alias>.values.retry_budget`); each group's resolved key set is compared against that reference set, and the difference is the unread set.

**Emit shape.** One line per unread key, naming the node, the group's path, the key, and the Recipe whose `valuesMapping:` does not reference it:

<!-- unregistered-output: warning text, which is reported without halting and which no halting condition registers -->

```text
  warning: node "data.main-db": unused .values key "database_name" (not referenced by valuesMapping of recipe "helm-postgres-sourced-with-artifacts")
  warning: node "data.main-db": unused .infra key "storage_class" (not referenced by valuesMapping of recipe "helm-postgres-sourced-with-artifacts")
  warning: node "frontend": unused .context.uses.my-api.values key "retry_budget" (not referenced by valuesMapping of recipe "helm-web-ui-sourced-with-artifacts")
```

The order is fixed: the node's `.values`, then its `.infra`, then each `uses` alias in the order the edges were emitted, keys sorted within each group. The same input therefore produces the same warning sequence on every run.

**Why a warning and not a fatal halt.** Developers may legitimately consume different `.values` subsets in conditional template logic — a Recipe whose template branches on `.values.mode` reads `mode` but conditionally reads `.values.replication_password` only when `mode == "replication"`. The static walk cannot tell whether an unreferenced key is a don't-care or a bug. The tracker's purpose is to make the discrepancy visible rather than to police it; silent omission is the failure mode the tracker prevents.

**Recipe-author response.** When a Recipe author sees a Ghost Infrastructure warning for a key they expected the Recipe to consume, the fix is to wire the key into the template. When the unread key is a deliberate omission (a feature the chart does not support, an authoring affordance the Recipe deliberately ignores), the author can document the omission in the Recipe's header comment so future readers know the discrepancy is intentional.

## Unread declared-parameter warnings

**Fires when** an Aggregate declares an entry under `spec.parameters:` and no `{{ .parameters.<key> }}` reference in that Aggregate's own text reads it.

A declared parameter is the authoring surface for varying one value per deployment: the Release fulfils the declaration, and a reference carries the fulfilled value into the component values it belongs to. A declaration nothing reads leaves that variation with nowhere to land — whatever a Release supplies for it, the rendered output is the same. It is the parameter-scoped form of the same smell an authored values key nothing consumes carries.

**A default is not an exemption.** A default no reference reads reaches the output no more than a Release-supplied value does, so a defaulted declaration is reported exactly as a bare one is.

**Which references are collected.** The Aggregate's own text, and nothing else. Three consequences follow:

- A parameter reached only by a Component schema's `validate:` predicate is not visible here. Such a predicate names the parameter through the resolved parameter map rather than through a dotted reference in the Aggregate, so the declaration is reported as unread even though the predicate reads it.
- Text that does not parse as a template yields no reference set. Reporting every declaration as unread would bury the diagnostic the interpolation raises over the same text, so nothing is reported instead.
- A reference naming the whole `parameters` map — iterating it, or reaching one entry through index — counts every declaration as read, because the collected reference then names the map rather than a key beneath it and no per-key claim can be made.

**Pipeline placement.** The reading runs at resolution, over the Aggregate's raw text and its declared parameter contract — before rendering. So it surfaces from `aggrega validate` as well as from `aggrega build`.

**Emit shape.** One line per unread declaration, naming the Aggregate and the declaration's locator:

```text
  lint: Aggregate fullstack-app at .spec.parameters.unread_probe: declared parameter is read by no reference in the Aggregate ("unread_probe")
```

Findings arrive in the order the Aggregate declares its parameters, so the same Aggregate produces the same sequence on every run. Each carries the declaration's locator, which names the offending key — that is what lets the advisory also reach editor diagnostics positioned on the declaration rather than at the head of the file. The message names the key as well, which is why it appears twice on a terminal line that prints the locator too: an editor shows the message at the position it placed and never the locator text, so a message that left the key out would read identically for every unread declaration.

**Why a warning and not a fatal halt.** A parameter may be declared ahead of the reference that will read it, and a static walk cannot tell that from a mistake — the same reason the authored-key reading only ever advises. The compiler does not police which knobs an author exposes.

## Per-entity partial-coverage warnings

The standard library defines metadata.labels and metadata.annotations as authoring surfaces on every entity kind. Today the compiler renders these annotations through to provider output uniformly only on Components and Features; per-entity rendering coverage on Aggregate, Release, Manifest, Recipe, FeatureRecipe, Plugin, SchemaLibrary, and MappingLibrary is partial — see [Status of the Language](../10-status.md) for the per-entity matrix.

When an entity-level `metadata.labels` or `metadata.annotations` declaration on an entity whose rendering coverage is partial reaches the renderer, the compiler emits a one-line warning naming the entity, the unrendered surface, and a link to the status page so the author knows the declaration was accepted by the schema but not consumed by today's rendering. The warning is informational; rendered output is produced regardless. The warning's emit shape and the per-entity coverage table track the rendering work as it lands.

## Unsupported-field warnings

One class covers everything you authored that the target cannot honour. It has two members — a Workload field the target cannot express, and an `aggrega.ai/` annotation the target does not act on — and they share one class code and one suppression flag, because an author who wants to silence "the things this target ignores" wants them silenced together rather than one switch at a time.

### A Workload field the target cannot express

Targets differ in fidelity. A Workload field that one target expresses natively may have no equivalent on another — Docker Compose has no notion of a scheduling constraint, a service account, or a priority class, for instance. When a Workload declares such a field and the target cannot express it, the field is **omitted with a warning**, one warning per authored field. It is neither dropped silently nor treated as a fatal error.

The distinction from a fatal halt is the granularity. An unsupported *form* halts the build loudly — the target cannot produce that shape of workload at all. A supported form that carries an *unexpressible field* renders, minus that field, and says so.

On the compose target the class currently covers `scheduling`, `serviceAccount`, `replicas`, `runtimeClassName`, `priorityClassName`, `imagePullSecrets`, `dnsPolicy`, `dnsConfig.options`, container `runAsNonRoot`, and extended-resource keys such as `nvidia.com/gpu`. The cases below emit a partial variant of the same class, where the field is reduced rather than removed:

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
- **A target that declares no support claim at all raises nothing.** The warning compares what you authored against what the provider said it reads; a provider that has said nothing gives it nothing to compare against, and inferring a refusal from silence would report a claim the provider's author never made.

**Why a warning and not a halt.** A boundary that legitimately spans components on heterogeneous targets will always have some node that cannot act on a given key — that is the normal shape of a mixed deployment, not a mistake — so refusing the build would reject correct deployments. The value passes through untouched, exactly as before; what changed is that you are told.

### The class code and the out-of-band guarantee

Each warning carries the stable, machine-matchable class code `unsupported-field`, so tooling can match the class rather than parse the message text. Every member of the class — the omitted-outright field, the reduced-form field, and the unacted-on annotation — carries that one code, which is what lets a single filter suppress the whole class. The warnings travel out-of-band from the rendered artifacts, which means **rendered bytes are byte-identical whether or not the warnings surface** — suppressing them cannot change your output.

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

**The class code.** The advisory carries the stable, machine-matchable class code `sensitive-by-value`, so tooling matches the class rather than parsing the message text. The code travels on the structured diagnostic the language server publishes as well as on the terminal line, so an editor client receives the same class an author reads.

**It is a class of its own, and `--no-unsupported-field-warnings` does not cover it.** That flag silences the unsupported-field class above; this advisory still surfaces alongside it. There is no flag that silences this one.

**The build succeeds and the rendered bytes are unchanged.** The advisory travels out-of-band from the rendered artifacts, as the unsupported-field class does, so what reaches your output is the same whether the line surfaces or not.

## A plugin ran with no recorded digest to check it against

**Fires when** the compiler is about to run a plugin, a recorded digest is meant to govern that plugin's bytes, and the workspace records none for it. The plugin runs; the warning is how you learn that nothing compared the bytes it ran against the bytes anyone reviewed.

`aggrega pull` writes the digest of every plugin it resolves into the Release's lockfile, and every later resolution compares the bytes it finds against that digest. A workspace that has not been pulled yet, or one whose lockfile predates a plugin the configuration has since attached, has no digest for that plugin — so the comparison has nothing to compare, and without this line it would pass silently.

<!-- unregistered-output: warning text, which is reported without halting and which no halting condition registers -->

```text
warning: plugin "governance/label-injector:1.0.0" resolved from cache with no recorded digest to check it against, so it runs unverified; run `aggrega pull --release <release>` to record it
```

The line names the source the bytes came from — the same word `aggrega pull` and `aggrega plugin list` use for it — and ends in what to run, because the fix is always the same: pull the Release, which records the digest and makes every later run of that plugin a checked one.

**It is raised once per plugin, however many times that plugin runs.** A render resolves its provider once per node, and the long-running editor service resolves an attachment on every request; repeating the line each time would bury it. One line per plugin reference is enough, because the condition is a property of the workspace rather than of any one node.

**Two resolutions raise nothing, and neither is an oversight:**

- **A plugin the compiler carries inside itself.** `aggrega pull` records what it fetched, and there is nothing to fetch for bytes that ship in the binary — so no digest is ever recorded for one, and there would be nothing you could run to change that. The binary is those bytes' identity. The compiler's own plugins and their versions are listed by `aggrega plugin list` and stamped into the lockfile's `toolchain` section.
- **A resolution where no digest was ever meant to apply.** `aggrega validate --plugin ./some.wasm` points at a file you named on the command line, and `aggrega lint` inspects the very artifact it is checking; in both, the plugin is the subject rather than a tool being trusted, so there is no record it could be held to.

**Why a warning and not a halt.** Reading a document is worth doing on a workspace nobody has prepared yet — refusing to validate or lint until someone runs `aggrega pull` would make the reporting commands unusable at exactly the moment they are most useful. `aggrega build` is the exception in the other direction: it does not reach this warning, because it will not produce artifacts without a lockfile at all.

**The one command that refuses instead.** When an editor asks the compiler service for a Release's graph, the service stops and asks for a lockfile rather than drawing a graph with a warning beside it. A drawn graph is what a reader then reasons about, and one built from unverified bytes would look exactly like one that was checked. See [`aggrega serve`](../cli/aggrega-serve.md).
