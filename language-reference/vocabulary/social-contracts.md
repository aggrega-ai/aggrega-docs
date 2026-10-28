# Social Contracts

Aggrega is, by design, an unopinionated compiler. Per the founding invariants documented at [architecture/05-invariants.md](../../architecture/05-invariants.md), the compiler parses YAML, traverses graphs, evaluates label intersections, and pipes strings between components — but it does not police what developers put in `values`, `parameters`, `infra`, `provides`, or `locals`; it does not enforce naming conventions, port conventions, or the semantic labels an Architect invents; it does not guess component purpose from names. Many disciplines that sound like compiler rules are actually **Social Contracts**: best practices upheld by authoring convention rather than by schema or runtime enforcement.

**Where that neutrality stops is worth saying plainly, because it is one line and it is easy to over-read.** A few keys are Aggrega's own — reserved, with the values it will take written into the published schema — and those the schema does check, the way it checks any other declared field. Declaring the value set of a key the platform itself defines is not the compiler reading meaning into what you wrote; it is the platform saying what its own key means. Everything you author under a key of your own stays exactly as unpoliced as this page describes.

This page is the canonical inventory of the language's Social Contracts. Authors who learn the contracts from this page can reason about why the compiler accepts a malformed-by-convention build (it does — the compiler does not interpret the convention) and where the responsibility lies for catching the violation (authoring discipline, reviewer attention, or a future Wasm-linter rule).

## Three classes of discipline

Aggrega's disciplines split into three classes by *how the discipline is enforced*. The classification matters because each class has a different failure mode when the discipline is violated.

### Enforced by the schema

The discipline is enforced by JSON Schema 2020-12 validation at load time (the entity envelope's JSON Schema, plus the pillar-level `schema:` declarations on Component and Feature entities). A violation produces a fatal halt before the build progresses; the compiler refuses to proceed. Authors who try to violate a schema-enforced discipline see an explicit validation error pointing at the field and the constraint.

Examples: entity envelope required fields (`apiVersion` / `kind` / `metadata.name` / `metadata.version`); SemVer regex on `metadata.version`; the closed value set on the reserved `component.aggrega.ai/type` label; Release schema's mechanical ban on `values:` blocks (per Invariant 5); `extends`-plus-`aggregate` rejection on Release (the Single Source of Truth invariant); the Recipe shape rules enforcing the input-kind composition contract.

Schema-enforced disciplines are the strongest guarantees the language carries. The compiler refuses to render anything that violates them.

### Enforced by a policy plugin

The discipline is enforced by a Wasm plugin running at one of the documented socket points (the governance `label-transform` role at topology construction; the governance `ir-verdict` role at static analysis; the out-of-band linter socket). A violation produces either a build-halting policy failure (in-band sockets) or an advisory warning (out-of-band sockets), depending on the socket's gating semantics.

A discipline is enforced this way only where a plugin that checks it runs: the Wasm runtime invokes plugins at the documented socket points, and a discipline no plugin checks stays a convention. The publishing linter, which [`aggrega lint`](../cli/aggrega-lint.md) runs, checks part of one convention on this page — see [Conventions a linter rule checks](#conventions-a-linter-rule-checks). No rule of the publishing linter checks hermeticity (the Sprig FuncMap exposes deterministic-output-breaking helpers per the determinism caveat at [`templates/sprig-functions.md`](../templates/sprig-functions.md)) or cloud-resource naming (Recipes whose `valuesMapping:` outputs reference cloud-resource-name fields without `release_name` / `instance_id` interpolation, per [`entities/recipe.md`](../entities/recipe.md) "Cloud-resource naming discipline"); a linter plugin of your own can check either.

For the Wasm plugin contract surface and the placement criterion (the linter socket vs the governance verdict roles), see [`plugins/plugin-contract.md`](../plugins/plugin-contract.md).

### Upheld by convention

The discipline is upheld by authoring discipline plus reviewer attention only. The compiler does not enforce; no schema rejects the violation; no Wasm plugin flags it. Authors learn the discipline from documentation, follow it because the architectural shape depends on it, and rely on PR review to catch lapses. A violation produces no compile-time signal — the build succeeds, the rendered output works as far as the compiler knows, and the discipline-violation surfaces only when downstream tooling or runtime behaviour depends on the convention.

Disciplines upheld by convention are the load-bearing list authors must learn from documentation. The compiler does not interpret them; getting them wrong does not break the build, but it breaks the architectural shape Aggrega depends on. The bulk of this page documents them.

## The conventions

The following Social Contracts are upheld by convention. Each entry names the discipline, the surface where the convention is documented, and the failure mode if violated. Each keeps its number wherever it sits: contract 3, reserved-prefix discipline, is checked by a linter rule for annotation keys and is described under [Conventions a linter rule checks](#conventions-a-linter-rule-checks).

### 1. Choosing the operational type that fits the component

The reserved `component.aggrega.ai/type` label names what kind of thing a component is, drawn from a closed set of universal cloud primitives: `server`, `worker`, `task`, `function`, `stateful-server`, `resource`. **Membership of that set is enforced by the schema, not upheld by convention.** Aggrega defines this key and the values it accepts, the Component schema enumerates them, and a document carrying anything else is refused when it loads — `E0215`, the `entity-envelope-invalid` condition, names the label and lists the values it will take. That refusal is what this entry does *not* cover.

What stays convention is **which** of the values fits the component in front of you. Nothing checks that a relational database is labelled `stateful-server` rather than `server`, or that a queue consumer is `worker` rather than `task`; the selector evaluates whatever value it finds without reading meaning into it. The Architect authoring a Component picks the value that describes how infrastructure must treat it, and downstream selectors, policy plugins and Wasm rendering plugins all rely on that choice being honest.

**Classifying on an axis of your own.** The closed set governs this one reserved key and nothing else. A catalog that needs a classification Aggrega does not define — a tier, a data zone, a service class, or a finer split of the operational primitives — adds **its own label key** beside the reserved one. The Component schema accepts any further label key with a string value, and the same selector machinery reads it, so `acme.aggrega.ai/storage-tier: oltp` sits alongside `component.aggrega.ai/type: stateful-server` and a Feature's `appliesTo` or a socket's `selector` can target either. Extension happens on a key of your own, never on a value inside Aggrega's.

**Documented at:** [`architecture/02-ecosystem-philosophy.md`](../../architecture/02-ecosystem-philosophy.md) (the operational ontology) + [`labels-and-annotations.md`](labels-and-annotations.md) (prefix discipline) + [`errors/sentinels.md`](../errors/sentinels.md) (`E0215`).

**Failure mode:** A value from the set that does not fit the component misleads everything that reads the label. A datastore labelled `server` is refused by a Feature or a socket selecting `stateful-server` — a halt naming the selector, not the mislabel — and a policy plugin or a rendering plugin reading the label treats it as stateless compute. Where only such readers see it, the build succeeds; the mistake surfaces only once the rendered artifacts reach the cluster.

### 2. Three-bucket `.context.annotations.*` separation

Cascaded annotations land in three named buckets — `.context.annotations.release`, `.context.annotations.catalog`, `.context.annotations.aggregate` — each carrying a different intent. The discipline target: `release` is "where this component runs, governed by Ops"; `catalog` is "what this component is, authored by the Architect"; `aggregate` is "what this component does, authored by the Developer".

The compiler does not enforce the bucket boundaries. The three buckets share a flat `string → string` shape; a Recipe's template can read all three, and nothing prevents a Release boundary annotation from being interpreted as cognitive metadata or a catalog annotation from being routed into `infra:`. The separation is upheld by authors writing annotations into the right bucket and by reviewers catching cross-bucket leaks.

**Documented at:** [`labels-and-annotations.md`](labels-and-annotations.md) (Three-bucket separation is a Social Contract).

**Failure mode:** Routing logic that depends on the bucket-intent distinction (e.g., a Recipe routing `.context.annotations.release.aggrega.ai/region` into a Terraform `region` field) silently consumes whatever annotation appears in the bucket regardless of authoring intent. The build succeeds; the rendered output may carry semantically-wrong values.

### 4. Recipe `provides:` self-containment

Recipe `provides:` templates close over the node's own data only — `.values`, `.infra`, `.context.instance_id`, `.context.rendered_name` where the node's provider reports one, the node's resolved `.locals`, plus static strings. References to `.context.inject` and `.context.uses` are forbidden because provides evaluation runs those templates in any order; reading cross-node data would couple it to topological iteration order, which the design deliberately avoids. `.locals` is on the surface rather than off it: the node's locals resolve in the preamble of the same stage, ahead of its provides, and they are node-local, so reading them costs nothing in ordering. Naming a key the locals block does not declare halts.

This is a rule with two halves, each naming where it is checked. The compiler checks the first: provides evaluation checks each template against a positive allowlist of the roots its context defines before the template executes, so a `.context.inject` / `.context.uses` read halts with an explicit error rather than rendering empty; the rule is also documented at [`templates/expansion-matrix.md`](../templates/expansion-matrix.md) row 6. Convention upholds the second: the broader pattern (provides-is-public; locals-is-private) is convention-anchored.

**Documented at:** [`templates/expansion-matrix.md`](../templates/expansion-matrix.md) row 6 + [`vocabulary/data-pillars.md`](data-pillars.md) "`provides:` and `locals:` — public face vs private face".

**Failure mode:** the compiler detects and halts the build at template evaluation time when the forbidden references appear directly in `provides:`. The broader public-vs-private discipline (don't expose internal state through `provides:` keys) is convention-only — authors who treat `provides:` as a Recipe-internal namespace produce contracts that callers depend on; refactoring becomes a breaking change.

### 5. Determinism — non-hermetic helpers in render-path templates

Aggrega's Deterministic Output Invariant (Invariant 8 at [architecture/05-invariants.md](../../architecture/05-invariants.md)) requires byte-identical output for byte-identical input. Sprig's full FuncMap exposes helpers that read ambient state (wall-clock readers `now` / `date`; random generators `randAlpha` / `uuidv4`; environment readers `env` / `expandenv`; network resolvers `getHostByName`). Authors who invoke these helpers from a template that contributes to rendered output break the determinism contract.

The compiler does not detect or block use of non-hermetic helpers. The Sprig FuncMap exposes them per [`templates/sprig-functions.md`](../templates/sprig-functions.md) "Determinism caveat"; the discipline is upheld by authors avoiding the helpers in render-path templates and reviewers catching their use at PR review.

**Documented at:** [`templates/sprig-functions.md`](../templates/sprig-functions.md) "Determinism caveat".

**Failure mode:** Build output differs across runs of the same input. The mismatch surfaces at GitOps diff time, when downstream tooling (ArgoCD, Flux) sees an unexpected drift between the committed manifest and the cluster state, or at audit time when two compilations of the same input produce different artifacts.

No rule of the publishing linter checks templates for non-hermetic helper invocations. The helper's name is written in the template, so a linter plugin of your own can find it (see [Conventions a linter rule checks](#conventions-a-linter-rule-checks)).

### 6. Pillar boundaries (signposts not walls)

Pillar boundaries are authoring discipline, not language enforcement. The template engine permits cross-pillar reads at every site unless explicitly forbidden by self-containment rules (e.g., Recipe `provides:` and `source:` reading `.context.inject` / `.context.uses`). Authors should:

- Read `.values` for cognitive payload (developer-authored intent).
- Read `.infra` for physical sizing (Ops-authored sizing).
- Read `.context.uses.<alias>.provides.<key>` for cross-component pointer strings.
- Read `.context.inject` for the post-hydration delivery pipe.

The template engine does not gate the read. A Recipe template that reads `.infra.replicas` to drive a `values:` field works; nothing prevents the cross-pillar route. The discipline target is signposts — the boundaries describe authoring intent (who owns the data) rather than runtime restriction.

**Documented at:** [`vocabulary/data-pillars.md`](data-pillars.md) "Pillar boundaries and authoring discipline".

**Failure mode:** Cross-pillar leakage — the developer's cognitive payload contains physical-sizing details, or the Ops-authored sizing contains cognitive metadata. The build succeeds; the four-domain authoring split blurs over time as authors shortcut the pillars; downstream maintenance becomes harder as the pillar-vs-data-flow correspondence weakens.

### 7. Workload `containers.<name>.variables` dual-source semantic

The `variables:` map blends two distinct data sources via Go template expressions: developer-pillar literals (entries reading `.values` / `.infra` / `.locals`) and cross-component-pipe data (entries reading `.context.inject.env.<KEY>`). Authors choose one source per entry based on whether the value is component-local or cross-component-derived.

The compiler does not distinguish the two sources; both flow into the same Kubernetes `env:` list on the rendered Deployment. The dual-source semantic is at authoring time only — the discipline is naming intent (this entry is component-local; that entry is cross-component-derived) so that future maintainers can read which entries depend on which inject-hydration outputs.

**Documented at:** [`entities/workload.md`](../entities/workload.md) "Field-semantics essentials" (`variables`).

**Failure mode:** Authors who don't distinguish the two sources lose the "which entries are coupled to which target's `provides:`" trace. Refactoring a target's `provides:` keys silently breaks every caller `variables:` entry that read through the inject pipe.

### 8. Cloud-resource naming discipline

Recipes that emit cloud-resource names (S3 bucket names, RDS database identifiers, IAM role names, CloudFormation stack names — any field whose value occupies a global namespace at the cloud provider) must concatenate `{{ .metadata.release_name }}` and/or `{{ .context.instance_id }}` into the rendered name to avoid collisions when the same Recipe runs across multiple Releases or component instances.

The compiler does not inspect `valuesMapping:` outputs for cloud-resource-name fields without these interpolations. The discipline is upheld by Recipe authors (who know which fields name globally-unique resources for the target provider) and reviewers (who catch unnamed-resource patterns at PR review).

**Documented at:** [`entities/recipe.md`](../entities/recipe.md) "Cloud-resource naming discipline".

**Failure mode:** Two Releases of the same Aggregate (`prod-billing` and `staging-billing`) both attempt to deploy a resource with the same global name; the second deployment fails at runtime with a cloud-side rejection. The Aggrega build succeeds; the deployment failure surfaces only when the second Release is applied.

No rule of the publishing linter checks cloud-resource-name fields for the required interpolations; a linter plugin of your own can (see [Conventions a linter rule checks](#conventions-a-linter-rule-checks)).

### 9. Component granularity — one coherent service per Component

A Component models one coherent service — a single exposed service, or the workload(s) of one service together with its internal-only helper workloads. When a chart bundles services that another component could meaningfully `use` on their own — especially foreign infrastructure such as a database, cache, or message broker that Aggrega already models as its own Component — the standard library composes per-service Components into a sub-aggregate Module (`spec.aggregates` + `exportedComponents`) rather than wrapping the whole product as one opaque Component. The discipline: multi-workload is fine within a Component; independent usability is the line that splits one Component into a stack.

The compiler is agnostic to this granularity. It renders whatever passes schema validation — it does not inspect how many services a Component's Recipe bundles, nor whether one of them is independently usable. An author who wraps a five-service product as a single Component produces a Component the compiler accepts and renders without complaint; the convention is upheld by authoring discipline and reviewer attention.

**Documented at:** [`../../architecture/06-data-taxonomy-and-composition.md`](../../architecture/06-data-taxonomy-and-composition.md) (One coherent service per Component — the single-workload boundary).

**Failure mode:** A monolithic multi-service wrap builds successfully, but the bundled services are invisible to the topology, the selector, and policy — they cannot be scaled, replaced, or depended-upon independently. Refactoring the monolith into per-service Components later is a breaking change to every consumer that referenced the single wrapped node.

## Why conventions exist

Each convention's classification is a deliberate choice. The architecture could have schema-enforced or Wasm-enforced any of them; instead the choice was made to leave them as authoring discipline. The reasoning per contract type:

**Extensibility.** The reserved-prefix discipline (contract 3) describes the standard library's vocabulary, not the universe of valid vocabulary. Enterprise catalogs author their own prefixes and label keys to extend the standard library; schema-enforcing the prefix convention would convert "the standard library's discipline" into "the language's only allowed shape" — that's the wall the architecture deliberately avoids. The operational type axis (contract 1) keeps the same extensibility on a different surface: the reserved key Aggrega defines carries a closed, schema-enforced set, and a catalog extends by adding a label key of its own beside it rather than a value inside Aggrega's. What the schema checks is the value set of one key it owns; what stays open is every other key, which is where a catalog's own vocabulary lives.

**AOT purity.** The cloud-resource naming discipline (contract 8) and the determinism discipline (contract 5) require introspecting template content to determine whether a field is a cloud-resource name or a non-hermetic helper invocation. AOT purity (Invariant 2) keeps the compiler from depending on runtime state; static template introspection is feasible (a linter plugin reads the entity's templates as written) but doing it inside the core compiler couples compiler-internal logic to per-domain authoring concerns. The architecture moves these checks out of the compiler and into Wasm plugins per Invariant 6 (the Wasm ABI Boundary).

**Authoring-flexibility.** The pillar-boundaries discipline (contract 6) and the dual-source `variables` semantic (contract 7) describe authoring patterns rather than runtime constraints. The same template syntax can express a discipline-honouring pattern or a discipline-violating one; making the discipline a runtime check would require the compiler to interpret authoring intent it can't access. The architecture treats the convention as documentation that authors learn from rather than as a runtime invariant. Component granularity (contract 9) sits here too: enterprises may wrap a product at whatever granularity their catalog favours, and the compiler — content-neutral and unopinionated per Invariant 1 — has no way to know whether a bundled workload is independently usable, so the one-coherent-service boundary stays authoring discipline rather than a schema wall. The operational type *choice* (contract 1) is the same shape: the schema settles which values exist, but which one describes a given component is a modelling judgment about how infrastructure must treat it, and nothing in a Recipe or a `values` block tells the compiler whether the judgment was right.

**Enforcement in two halves.** The Recipe `provides:` self-containment (contract 4) is partly compiler-enforced — the render path detects `.context.inject` / `.context.uses` reads in `provides:` templates and halts. The broader public-vs-private discipline (don't expose internal state) is convention-anchored because the compiler can't determine which strings should remain Recipe-internal without authoring intent.

The three routes matter because each signals where the responsibility for catching violations lives. Enforced by the schema: the compiler. Enforced by a policy plugin: the plugin that checks it, where one runs. Upheld by convention: authors and reviewers. Authors who internalise the routes understand which mistakes the compiler will catch and which will silently pass through to downstream tooling or runtime.

## Conventions a linter rule checks

The publishing linter, run by [`aggrega lint`](../cli/aggrega-lint.md), checks one convention on this page in part: the annotation keys of contract 3, below. Its finding is advisory, and the part of the convention it does not reach is upheld by convention, as the entries above are.

No rule of the publishing linter checks any other convention on this page. Two of them can be checked by a linter rule, because the violation is written in the entity: determinism (contract 5) — a template calling a non-hermetic helper — and cloud-resource naming (contract 8) — a `valuesMapping:` output naming a cloud resource without `release_name` / `instance_id` interpolation. So can label keys under the reserved prefixes (contract 3). A workspace may attach linter plugins of its own under `plugins.linter`, beside the publishing linter, to check any of them; [The discipline rules](../cli/aggrega-lint.md#the-discipline-rules) lists the rules the publishing linter carries.

The other conventions (1, 2, 4, 6, 7, 9) turn on what the author meant, which no rule reads from what was written. The bucket separation is extensibility-driven (enterprise catalogs override) — schema enforcement would conflict with that flexibility. What is left of the operational type axis after the schema settles the value set — picking the primitive that fits the component — is authoring-intent driven: the compiler cannot tell a well-chosen operational type from a badly-chosen one, because both are values it accepts. The pillar-boundaries discipline and the dual-source `variables` semantic are authoring-intent driven — the compiler cannot determine intent from template syntax alone. Recipe `provides:` self-containment is partially enforced; the broader public-vs-private discipline turns on which keys the author meant to keep internal, which nothing in the Recipe states. Component granularity is authoring-intent driven as well — whether a bundled workload is independently usable is a modelling judgment the compiler cannot read from Recipe content.

### 3. Reserved-prefix discipline

Annotation and label keys follow a `<namespace>/<name>` shape. Five reserved prefixes carry specific authoring rules: `aggrega.ai/` (platform-only), `feature.aggrega.ai/` (official Feature shortcuts), `component.aggrega.ai/` (Component-intrinsic traits), `aggregate.aggrega.ai/` (Aggregate module identity), and `<any-other-domain>/` (enterprise / community).

The compiler does not reject an annotation authored under a reserved prefix on a catalog entity or a Release; only a Manifest annotation binding or a Recipe output label claiming a key under `aggrega.ai/` halts the build. An enterprise that declares `aggrega.ai/internal-billing-tag: "..."` outside the platform's vocabulary produces an annotation the compiler accepts and cascades through the bucket system; downstream platform updates that introduce a real `aggrega.ai/internal-billing-tag` collide silently.

**Documented at:** [`labels-and-annotations.md`](labels-and-annotations.md) (Prefix discipline) + [`providers/well-known-annotations.md`](../providers/well-known-annotations.md).

**Failure mode:** Custom annotations under reserved prefixes collide with future platform annotations under the same name; the platform's expected behaviour silently overwrites or coexists with the enterprise's authored value depending on order.

The publishing linter, run by [`aggrega lint`](../cli/aggrega-lint.md), flags a catalog entity's annotation key under `aggrega.ai/` that is not one of the platform's well-known annotations, and one under `feature.aggrega.ai/` on an entity other than a Feature, as an advisory finding (`E0277`). Label keys, the other reserved prefixes, and annotations outside an entity's `metadata.annotations` — those a Release writes, for instance — are not checked, so for them the discipline stays a convention.

## Cross-references

- [`architecture/05-invariants.md`](../../architecture/05-invariants.md) — the eight founding invariants that ground Aggrega's "the compiler is content-neutral" framing; each convention sits in tension with one or more of these.
- [`architecture/02-ecosystem-philosophy.md`](../../architecture/02-ecosystem-philosophy.md) — the operational ontology's full design rationale.
- [`vocabulary/labels-and-annotations.md`](labels-and-annotations.md) — three-bucket separation as Social Contract; reserved-prefix discipline.
- [`vocabulary/data-pillars.md`](data-pillars.md) — pillar boundaries as signposts; `provides:` and `locals:` public-vs-private framing.
- [`templates/sprig-functions.md`](../templates/sprig-functions.md) — Determinism caveat naming the non-hermetic helpers.
- [`entities/recipe.md`](../entities/recipe.md) — Cloud-resource naming discipline + worked examples.
- [`entities/workload.md`](../entities/workload.md) — Workload `variables:` dual-source semantic.
- [`templates/expansion-matrix.md`](../templates/expansion-matrix.md) — Recipe `provides:` self-containment as compiler-enforced rule.
- [`plugins/plugin-contract.md`](../plugins/plugin-contract.md) — the linter socket's placement criterion.
- [`cli/aggrega-lint.md`](../cli/aggrega-lint.md) — the publishing linter's rules, and attaching linters of your own.
