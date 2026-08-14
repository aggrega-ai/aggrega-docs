# Social Contracts

Aggrega is, by design, a mathematically unopinionated compiler. Per the founding invariants documented at [architecture/05-invariants.md](../../architecture/05-invariants.md), the compiler parses YAML, traverses graphs, evaluates label intersections, and pipes strings between components — but it does not police what developers put in `values`, `parameters`, `infra`, `provides`, or `locals`; it does not enforce naming conventions, port conventions, or semantic type labels; it does not guess component purpose from names. Many disciplines that sound like compiler rules are actually **Social Contracts**: best practices upheld by authoring convention rather than by schema or runtime enforcement.

This page is the canonical inventory of the language's Social Contracts. Authors who learn the contracts from this page can reason about why the compiler accepts a malformed-by-convention build (it does — the compiler is blind to the convention) and where the responsibility lies for catching the violation (authoring discipline, reviewer attention, or a future Wasm-linter rule).

## Three classes of discipline

Aggrega's disciplines split into three classes by *how the discipline is enforced*. The classification matters because each class has a different failure mode when the discipline is violated.

### Class A — schema-enforced

The discipline is enforced by JSON Schema 2020-12 validation at load time (the entity envelope's JSON Schema, plus the pillar-level `schema:` declarations on Component and Feature entities). A violation produces a fatal halt before the build progresses; the compiler refuses to proceed. Authors who try to violate a Class A discipline see an explicit validation error pointing at the field and the constraint.

Examples: entity envelope required fields (`apiVersion` / `kind` / `metadata.name` / `metadata.version`); SemVer regex on `metadata.version`; Release schema's mechanical ban on `values:` blocks (per Invariant 5); `extends`-plus-`aggregate` rejection on Release (the Single Source of Truth invariant); Recipe shape rules 1–7 enforcing the input-kind composition contract.

Class A disciplines are the strongest guarantees the language carries. The compiler refuses to render anything that violates them.

### Class B — Wasm-enforced

The discipline is enforced by a Wasm plugin running at one of the documented socket points (the governance `label-transform` role at topology construction; the governance `ir-verdict` role at static analysis; out-of-band `linter.wasm`). A violation produces either a build-halting policy failure (in-band sockets) or an advisory warning (out-of-band sockets), depending on the socket's gating semantics.

Class B disciplines today are mostly **future-shipping** — the Wasm runtime ships and invokes plugins at the documented socket points (see [Status of the Language → Compilation pipeline phases](../10-status.md#compilation-pipeline-phases)), but a discipline reaches Class B only once the specific plugin that enforces it exists, and most of those plugins are not yet authored. When such a plugin ships, the discipline it enforces transitions from Class C (convention-enforced) to Class B (Wasm-enforced). Examples currently chartered for future Class B status: hermeticity enforcement (the Sprig FuncMap exposes deterministic-output-breaking helpers per the determinism caveat at [`templates/sprig-functions.md`](../templates/sprig-functions.md), and a future `linter.wasm` plugin could flag their use); cloud-resource naming pattern matching (a future `linter.wasm` plugin could flag Recipes whose `valuesMapping:` outputs reference cloud-resource-name fields without `release_name` / `instance_id` interpolation per [`entities/recipe.md`](../entities/recipe.md) "Cloud-resource naming discipline").

For the Wasm plugin contract surface and the placement criterion (the linter socket vs the governance verdict roles), see [`plugins/plugin-contract.md`](../plugins/plugin-contract.md).

### Class C — convention-enforced

The discipline is upheld by authoring discipline plus reviewer attention only. The compiler does not enforce; no schema rejects the violation; no Wasm plugin flags it. Authors learn the discipline from documentation, follow it because the architectural shape depends on it, and rely on PR review to catch lapses. A violation produces no compile-time signal — the build succeeds, the rendered output works as far as the compiler knows, and the discipline-violation surfaces only when downstream tooling or runtime behaviour depends on the convention.

Class C disciplines are the load-bearing list authors must learn from documentation. The compiler is blind to them; getting them wrong does not break the build, but it breaks the architectural shape Aggrega depends on. The bulk of this page documents the Class C inventory.

## The Class C inventory

The following Social Contracts are convention-enforced today. Each entry names the discipline, the surface where the convention is documented, and the failure mode if violated.

### 1. The 7-Type Cloud-Native Ontology

The `component.aggrega.ai/type` label maps to one of seven universal cloud primitives: `server`, `worker`, `task`, `function`, `stateful-server`, `resource`, `messaging`. The Architect authoring a Component picks one value from this closed set; downstream policy plugins, autonomous Wasm rendering plugins, and Studio filtering all rely on the closed-set vocabulary.

The compiler is mathematically blind to these strings. `pkg/selector` evaluates whatever label values appear; an Architect who writes `component.aggrega.ai/type: my-cool-thing` produces a Component the compiler accepts and renders without complaint. Downstream tools that filter by ontology type miss the Component entirely; policy plugins that route by type assign no policy; Studio surfaces no category. The convention is the interoperability anchor, not a runtime invariant.

**Documented at:** [`architecture/02-ecosystem-philosophy.md`](../../architecture/02-ecosystem-philosophy.md) (The 7-Type Cloud-Native Ontology) + [`labels-and-annotations.md`](labels-and-annotations.md) (prefix discipline).

**Failure mode:** Component is invisible to tools that filter by ontology type; policy and routing decisions silently skip the misnamed Component. The build succeeds.

### 2. Three-bucket `.context.annotations.*` separation

Cascaded annotations land in three named buckets — `.context.annotations.release`, `.context.annotations.catalog`, `.context.annotations.aggregate` — each carrying a different intent. The discipline target: `release` is "where this component runs, governed by Ops"; `catalog` is "what this component is, authored by the Architect"; `aggregate` is "what this component does, authored by the Developer".

The compiler does not enforce the bucket boundaries. The three buckets share a flat `string → string` shape; a Recipe's template can read all three, and nothing prevents a Release boundary annotation from being interpreted as cognitive metadata or a catalog annotation from being routed into `infra:`. The separation is upheld by authors writing annotations into the right bucket and by reviewers catching cross-bucket leaks.

**Documented at:** [`labels-and-annotations.md`](labels-and-annotations.md) (Three-bucket separation is a Social Contract).

**Failure mode:** Routing logic that depends on the bucket-intent distinction (e.g., a Recipe routing `.context.annotations.release.aggrega.ai/region` into a Terraform `region` field) silently consumes whatever annotation appears in the bucket regardless of authoring intent. The build succeeds; the rendered output may carry semantically-wrong values.

### 3. Reserved-prefix discipline

Annotation and label keys follow a `<namespace>/<name>` shape. Five reserved prefixes carry specific authoring rules: `aggrega.ai/` (platform-only), `feature.aggrega.ai/` (official Feature shortcuts), `component.aggrega.ai/` (Component-intrinsic traits), `aggregate.aggrega.ai/` (Aggregate module identity), and `<any-other-domain>/` (enterprise / community).

The compiler does not reject custom prefixes that conflict with the reserved set. An enterprise that declares `aggrega.ai/internal-billing-tag: "..."` outside the platform's vocabulary produces an annotation the compiler accepts and cascades through the bucket system; downstream platform updates that introduce a real `aggrega.ai/internal-billing-tag` collide silently.

**Documented at:** [`labels-and-annotations.md`](labels-and-annotations.md) (Prefix discipline) + [`providers/well-known-annotations.md`](../providers/well-known-annotations.md).

**Failure mode:** Custom annotations under reserved prefixes collide with future platform annotations under the same name; the platform's expected behaviour silently overwrites or coexists with the enterprise's authored value depending on order.

A future Wasm-linter plugin (`linter.wasm`) could enforce reserved-prefix discipline at publish time; the discipline transitions from Class C to Class B when the plugin ships. Today the discipline is convention-enforced.

### 4. Recipe `provides:` self-containment

Recipe `provides:` templates close over the node's own data only — `.values`, `.infra`, `.context.instance_id`, the node's resolved `.locals`, plus static strings. References to `.context.inject` and `.context.uses` are forbidden because provides evaluation runs those templates in any order; reading cross-node data would couple it to topological iteration order, which the design deliberately avoids. `.locals` is on the surface rather than off it: the node's locals resolve in the preamble of the same stage, ahead of its provides, and they are node-local, so reading them costs nothing in ordering. Naming a key the locals block does not declare halts.

This is a hybrid — provides evaluation checks each template against a positive allowlist of the roots its context defines before the template executes, so a `.context.inject` / `.context.uses` read halts with an explicit error rather than rendering empty; the convention is also documented at [`templates/expansion-matrix.md`](../templates/expansion-matrix.md) row 6. The discipline is enforced where the compiler can detect the violation; the broader pattern (provides-is-public; locals-is-private) is convention-anchored.

**Documented at:** [`templates/expansion-matrix.md`](../templates/expansion-matrix.md) row 6 + [`vocabulary/data-pillars.md`](data-pillars.md) "`provides:` and `locals:` — public face vs private face".

**Failure mode:** the compiler detects and halts the build at template evaluation time when the forbidden references appear directly in `provides:`. The broader public-vs-private discipline (don't expose internal state through `provides:` keys) is convention-only — authors who treat `provides:` as a Recipe-internal namespace produce contracts that callers depend on; refactoring becomes a breaking change.

### 5. Determinism — non-hermetic helpers in render-path templates

Aggrega's Deterministic Output Invariant (Invariant 8 at [architecture/05-invariants.md](../../architecture/05-invariants.md)) requires byte-identical output for byte-identical input. Sprig's full FuncMap exposes helpers that read ambient state (wall-clock readers `now` / `date`; random generators `randAlpha` / `uuidv4`; environment readers `env` / `expandenv`; network resolvers `getHostByName`). Authors who invoke these helpers from a template that contributes to rendered output break the determinism contract.

The compiler does not detect or block use of non-hermetic helpers. The Sprig FuncMap exposes them per [`templates/sprig-functions.md`](../templates/sprig-functions.md) "Determinism caveat"; the discipline is upheld by authors avoiding the helpers in render-path templates and reviewers catching their use at PR review.

**Documented at:** [`templates/sprig-functions.md`](../templates/sprig-functions.md) "Determinism caveat".

**Failure mode:** Build output differs across runs of the same input. The mismatch surfaces at GitOps diff time, when downstream tooling (ArgoCD, Flux) sees an unexpected drift between the committed manifest and the cluster state, or at audit time when two compilations of the same input produce different artifacts.

A future Wasm-linter rule could statically analyse template surfaces for non-hermetic helper invocations and reject the build with a Loud Guardrail; the discipline transitions from Class C to Class B when the rule ships.

### 6. Pillar boundaries (signposts not walls)

Pillar boundaries are authoring discipline, not language enforcement. The template engine permits cross-pillar reads at every site unless explicitly forbidden by self-containment rules (e.g., Recipe `provides:` and `source:` reading `.context.inject` / `.context.uses`). Authors should:

- Read `.values` for cognitive payload (developer-authored intent).
- Read `.infra` for physical sizing (Ops-authored sizing).
- Read `.context.uses[].provides.<key>` for cross-component pointer strings.
- Read `.context.inject` for the post-hydration delivery pipe.

The template engine does not gate the read. A Recipe template that reads `.infra.replicas` to drive a `values:` field works; nothing prevents the cross-pillar route. The discipline target is signposts — the boundaries describe authoring intent (who owns the data) rather than runtime restriction.

**Documented at:** [`vocabulary/data-pillars.md`](data-pillars.md) "Pillar boundaries and authoring discipline".

**Failure mode:** Cross-pillar leakage — the developer's cognitive payload contains physical-sizing details, or the Ops-authored sizing contains cognitive metadata. The build succeeds; the four-domain authoring split blurs over time as authors shortcut the pillars; downstream maintenance becomes harder as the pillar-vs-data-flow correspondence weakens.

### 7. Workload `containers.<name>.variables` dual-source semantic

The `variables:` map blends two distinct data sources via Go template expressions: developer-pillar literals (entries reading `.values` / `.infra` / `.locals`) and cross-component-pipe data (entries reading `.context.inject.env.<KEY>`). Authors choose one source per entry based on whether the value is component-local or cross-component-derived.

The compiler does not distinguish the two sources; both flow into the same Kubernetes `env:` list on the rendered Deployment. The dual-source semantic is at authoring time only — the discipline is naming intent (this entry is component-local; that entry is cross-component-derived) so that future maintainers can read which entries depend on which inject-hydration outputs.

**Documented at:** [`entities/workload.md`](../entities/workload.md) `variables:` field-conventions.

**Failure mode:** Authors who don't distinguish the two sources lose the "which entries are coupled to which target's `provides:`" trace. Refactoring a target's `provides:` keys silently breaks every caller `variables:` entry that read through the inject pipe.

### 8. Cloud-resource naming discipline

Recipes that emit cloud-resource names (S3 bucket names, RDS database identifiers, IAM role names, CloudFormation stack names — any field whose value occupies a global namespace at the cloud provider) must concatenate `{{ .metadata.release_name }}` and/or `{{ .context.instance_id }}` into the rendered name to avoid collisions when the same Recipe runs across multiple Releases or component instances.

The compiler does not inspect `valuesMapping:` outputs for cloud-resource-name fields without these interpolations. The discipline is upheld by Recipe authors (who know which fields name globally-unique resources for the target provider) and reviewers (who catch unnamed-resource patterns at PR review).

**Documented at:** [`entities/recipe.md`](../entities/recipe.md) "Cloud-resource naming discipline".

**Failure mode:** Two Releases of the same Aggregate (`prod-billing` and `staging-billing`) both attempt to deploy a resource with the same global name; the second deployment fails at runtime with a cloud-side rejection. The Aggrega build succeeds; the deployment failure surfaces only when the second Release is applied.

A future Wasm-linter rule could flag cloud-resource-name fields without the required interpolations; the discipline transitions from Class C to Class B when the rule ships.

### 9. Component granularity — one coherent service per Component

A Component models one coherent service — a single exposed service, or the workload(s) of one service together with its internal-only helper workloads. When a chart bundles services that another component could meaningfully `use` on their own — especially foreign infrastructure such as a database, cache, or message broker that Aggrega already models as its own Component — the standard library composes per-service Components into a sub-aggregate Module (`spec.aggregates` + `exportedComponents`) rather than wrapping the whole product as one opaque Component. The discipline: multi-workload is fine within a Component; independent usability is the line that splits one Component into a stack.

The compiler is blind to this granularity. It renders whatever passes schema validation — it does not inspect how many services a Component's Recipe bundles, nor whether one of them is independently usable. An author who wraps a five-service product as a single Component produces a Component the compiler accepts and renders without complaint; the convention is upheld by authoring discipline and reviewer attention.

**Documented at:** [`../../architecture/06-data-taxonomy-and-composition.md`](../../architecture/06-data-taxonomy-and-composition.md) (One coherent service per Component — the single-workload boundary).

**Failure mode:** A monolithic multi-service wrap builds successfully, but the bundled services are invisible to the topology, the selector, and policy — they cannot be scaled, replaced, or depended-upon independently. Refactoring the monolith into per-service Components later is a breaking change to every consumer that referenced the single wrapped node.

## Why Class C exists

Each Class C contract's classification is a deliberate choice. The architecture could have schema-enforced or Wasm-enforced any of them; instead the choice was made to leave them as authoring discipline. The reasoning per contract type:

**Extensibility.** The 7-Type Cloud-Native Ontology (contract 1) and the reserved-prefix discipline (contract 3) describe the standard library's vocabulary, not the universe of valid vocabulary. Enterprise catalogs author their own ontology types and prefix conventions to extend the standard library; if the schema rejected `component.aggrega.ai/type` values outside the closed set, enterprises could not extend. Schema-enforcement would convert "the standard library's discipline" into "the language's only allowed shape" — that's the wall the architecture deliberately avoids.

**AOT purity.** The cloud-resource naming discipline (contract 8) and the determinism discipline (contract 5) require introspecting template content to determine whether a field is a cloud-resource name or a non-hermetic helper invocation. AOT purity (Invariant 2) keeps the compiler ignorant of runtime state; static template introspection is feasible (the Wasm-linter plan demonstrates this) but doing it inside the core compiler couples compiler-internal logic to per-domain authoring concerns. The architecture moves these checks out of the compiler and into Wasm plugins per Invariant 6 (the Wasm ABI Boundary).

**Authoring-flexibility.** The pillar-boundaries discipline (contract 6) and the dual-source `variables` semantic (contract 7) describe authoring patterns rather than runtime constraints. The same template syntax can express a discipline-honouring pattern or a discipline-violating one; making the discipline a runtime check would require the compiler to interpret authoring intent it can't access. The architecture treats the convention as documentation that authors learn from rather than as a runtime invariant. Component granularity (contract 9) sits here too: enterprises may wrap a product at whatever granularity their catalog favours, and the compiler — dumb and unopinionated per Invariant 1 — has no way to know whether a bundled workload is independently usable, so the one-coherent-service boundary stays authoring discipline rather than a schema wall.

**Hybrid enforcement.** The Recipe `provides:` self-containment (contract 4) is partly compiler-enforced — the render path detects `.context.inject` / `.context.uses` reads in `provides:` templates and halts. The broader public-vs-private discipline (don't expose internal state) is convention-anchored because the compiler can't determine which strings should remain Recipe-internal without authoring intent.

The classification distinction matters because each class signals where the responsibility for catching violations lives. Class A: the compiler. Class B: a Wasm plugin (when shipped). Class C: authors and reviewers. Authors who internalise the classes understand which mistakes the compiler will catch and which will silently pass through to downstream tooling or runtime.

## Future Class B promotions

Three Class C contracts have chartered Wasm-linter rules planned today:

- **Determinism enforcement** (contract 5) — a future `linter.wasm` rule statically analyses template surfaces for non-hermetic helper invocations.
- **Cloud-resource naming** (contract 8) — a future `linter.wasm` rule flags `valuesMapping:` outputs referencing cloud-resource-name fields without `release_name` / `instance_id` interpolation.
- **Reserved-prefix discipline** (contract 3) — a future `linter.wasm` rule (or publishing-discipline plugin) flags annotation / label keys under reserved prefixes that collide with the standard library's vocabulary.

Each is `planned` per the four-label taxonomy at [`10-status.md`](../10-status.md). When each ships, the entry above's classification updates from Class C to Class B; the documentation alignment lands in lockstep with the plugin shipping.

The remaining Class C contracts (1, 2, 4, 6, 7, 9) are likely to remain Class C. The 7-Type Cloud-Native Ontology and the bucket separation are extensibility-driven (enterprise catalogs override) — schema enforcement would conflict with that flexibility. The pillar-boundaries discipline and the dual-source `variables` semantic are authoring-intent driven — the compiler cannot determine intent from template syntax alone. Recipe `provides:` self-containment is already partially enforced; the broader public-vs-private discipline is unlikely to gain runtime enforcement. Component granularity is authoring-intent driven as well — whether a bundled workload is independently usable is a modelling judgment the compiler cannot read from Recipe content.

## Cross-references

- [`architecture/05-invariants.md`](../../architecture/05-invariants.md) — the eight founding invariants that ground Aggrega's "the compiler is dumb" framing; each Class C contract sits in tension with one or more of these.
- [`architecture/02-ecosystem-philosophy.md`](../../architecture/02-ecosystem-philosophy.md) — The 7-Type Cloud-Native Ontology's full design rationale.
- [`vocabulary/labels-and-annotations.md`](labels-and-annotations.md) — three-bucket separation as Social Contract; reserved-prefix discipline.
- [`vocabulary/data-pillars.md`](data-pillars.md) — pillar boundaries as signposts; `provides:` and `locals:` public-vs-private framing.
- [`templates/sprig-functions.md`](../templates/sprig-functions.md) — Determinism caveat naming the non-hermetic helpers.
- [`entities/recipe.md`](../entities/recipe.md) — Cloud-resource naming discipline + worked examples.
- [`entities/workload.md`](../entities/workload.md) — Workload `variables:` dual-source semantic.
- [`templates/expansion-matrix.md`](../templates/expansion-matrix.md) — Recipe `provides:` self-containment as compiler-enforced rule.
- [`plugins/plugin-contract.md`](../plugins/plugin-contract.md) — `linter.wasm` placement criterion + the future Class B promotion path.
- [`10-status.md`](../10-status.md) — readiness state for chartered Wasm-linter rules.
