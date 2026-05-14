# Status of the Language

This page is the canonical reference for which Aggrega surfaces are usable today, which are documented but not yet acted on by the compiler, and which are planned for a future iteration. It complements the per-domain chapters by surfacing readiness state across the language in one place.

Two reader populations consult this page. **First-time authors** check the page before authoring against an unfamiliar surface, to confirm the surface produces rendered output today. **Reference-seekers** check the page when a surface they are using behaves unexpectedly — for example, when YAML validates but no output is produced, the page is the first place to look up the surface's status. Returning readers also consult the page to identify surfaces that have transitioned between status labels since last reading. Per-domain chapters and entity references describe how the surface is meant to work; this page describes whether it works yet.

## Status taxonomy

Every language surface on this page carries one of four status labels:

- **available.** The schema accepts the surface; the compiler consumes it; behaviour matches the documented contract. Authors using an `available` surface receive the documented contract.

- **accepted but inert.** The schema accepts the surface — authoring against it passes validation — but the compiler does not yet act on it. Authoring an `accepted but inert` surface produces a syntactically valid build with no rendered effect for the surface; the compiler may emit a warning naming the inert surface (the recommended pattern), or some current surfaces silently skip without warning. Per-section entries below name the specific behaviour.

- **accepted but blocked.** The schema accepts the surface — authoring against it passes validation — but the compiler halts the build with an explicit error naming the pending implementation work. Authoring against an `accepted but blocked` surface fails at render with a `CATALOG_ERROR` pointing to the work item that will deliver the implementation.

- **planned.** The surface is documented as designed but neither the schema nor the compiler accepts it yet. Authoring against a `planned` surface fails at schema validation. The page surfaces planned items so authors can plan around their absence rather than discover the gap at build time.

Status labels are evaluated against the current compiler. Surfaces under active development may transition between labels; the per-section entries describe the transition plan where one is known.

## Recipe input kinds

A Recipe composes its output from three input kinds — sourced, synthesized, and artifacts — described in [`16-recipe-input-composition.md`](../architecture/16-recipe-input-composition.md). Per-input-kind status:

- **`source:` + `valuesMapping:` (sourced) — available.** The compiler resolves the `source:` URI, evaluates the `valuesMapping` template (inline, file `$import:`, or library `$import:` per the three authoring modes), and hands the result to the target provider for rendering. Consumed by the helm, helm-chart, and compose providers today; terraform and cloudformation are planned at the provider level (see the Provider engines section below).

- **`workload:` (synthesized) — available.** The Recipe declares `workload:` either inline (block scalar carrying the Workload YAML) or via `$import:` (file path). The compiler parses the templated Workload, validates it against the embedded Workload schema, and dispatches to the target provider's workload synthesizer. Consumed by the helm and compose providers today. The helm-chart provider explicitly redirects authors to the helm provider for synthesised K8s manifests; terraform and cloudformation are planned at the provider level. A Recipe declaring `workload:` against a provider whose engine does not implement workload synthesis halts at render with a `CATALOG_ERROR`.

- **`artifacts:` (artifacts) — available.** The field is a map of named entries; each entry is authored inline or loaded via per-entry `$import:`. Entries are evaluated at Phase B.3 against the full TemplateContext (including `.workload` and `.source`), get provenance labels merged into `metadata.labels` for documents that carry metadata, and emit as separate files alongside the Recipe's source-rendered or workload-synthesized output. Provider dispatch — flat providers (helm, terraform, cloudformation) emit standalone files under the boundary output directory; the compose provider routes its emissions through the Release-end merger; the helm-chart provider injects entries at `boundaries/<bp>/charts/<nodeID>/templates/<basename>` using `[[ ]]` Aggrega delimiters so Helm's `{{ }}` syntax in the same file survives into the downstream render. helm-chart with inline-content `artifacts:` entries is rejected at Recipe load with a CATALOG_ERROR. Filename collisions across input-kind origins (source-rendered, workload-synthesized, or artifact-emitted output) are caught at render time by the cross-origin collision detector and produce a CATALOG_ERROR naming every contributor.

See [`entities/recipe.md`](entities/recipe.md) for the Recipe authoring surface and the input-kind composition rules; [`errors/fatal-halts.md`](errors/fatal-halts.md) for the seven Recipe shape rules; and the Provider engines section below for the per-provider matrix.

## Mapping languages

Recipes (and FeatureRecipes) bind to a single mapping field for translating Aggrega context into the values dictionary the underlying provider engine consumes. The `valuesMapping:` field supports three authoring modes dispatched by content shape:

- **`valuesMapping:` (three authoring modes) — available.** Mode 1: inline Go template (block scalar). Mode 2: file `$import:` (a map containing only `$import:` with a local file path). Mode 3: library `$import:` (a map containing only `$import:` with an `oci://` URL referencing a [MappingLibrary](entities/mappinglibrary.md) entry). The compiler dispatches on content shape — block scalar to Mode 1, `$import:` with a path to Mode 2, `$import:` with an `oci://` URL to Mode 3 — and evaluates the resolved Go template against the Recipe's TemplateContext at Phase B.1. The Sprig helper library is pre-registered. See [`entities/recipe.md`](entities/recipe.md) "The `valuesMapping` field — three authoring modes" for the dispatch mechanism and worked examples.

See [`entities/recipe.md`](entities/recipe.md) for the Recipe authoring surface and the mapping-language design, and [`entities/mappinglibrary.md`](entities/mappinglibrary.md) for the library entity that backs Mode 3.

## Inject syntax

The `inject:` block accepts two equivalent syntaxes — a compact map form and a verbose array form. Both produce identical runtime behaviour; the compiler normalizes both to a `map[string]string` shape during parsing.

- **Compact form (`KEY: "string"`) — available.** A flat map keyed by local identifier (env var name, file path, arg flag); the value's semantics depend on placement (literal in `component.inject`, provides-key reference in `uses[].inject` / `feature.inject` / `secret.inject`).

- **Verbose form (`[{in: ..., from: ..., value: ...}]`) — available.** An array of objects with explicit `in:`, `from:` (provides-key reference), and `value:` (literal string) keys. Disambiguates the placement-dependent semantics of the compact form.

The verbose form is documented as the long-term authoring surface; the compact form is planned for removal in a future iteration so the language presents a single, unambiguous `inject:` syntax. Authors targeting forward compatibility can author against the verbose form today.

See [`vocabulary/topology-triad.md`](vocabulary/topology-triad.md) for the full Injection Contract specification, including the dual-state context semantics, key-collision rules, and worked examples.

## Template engine

Aggrega's Go template engine evaluates Recipe and FeatureRecipe templates against the TemplateContext at the per-site phase the [Template Expansion Matrix](templates/expansion-matrix.md) documents. The Sprig helper library is pre-registered. Evaluation, parsing, and Sprig integration are available today.

**Missing-key behaviour — silent zero substitution today; `missingkey=error` for typed parameter references in a future iteration.** The engine evaluates with Go's `missingkey=zero` option, so a template referencing an unbound key (e.g., `.values.unset_field`) renders as the type's zero value (empty string for string fields, `0` for numeric fields, `false` for bool fields) without raising an error. Typed parameter contracts that land in a future iteration will introduce `missingkey=error` semantics for typed parameter references; non-typed references retain `missingkey=zero` behaviour.

See [`templates/expansion-matrix.md`](templates/expansion-matrix.md) for the per-template-site evaluation matrix and [`05-templates.md`](05-templates.md) for the templating overview.

## Compilation pipeline phases

The 5-step Aggrega compilation pipeline is documented in [`../architecture/10-compilation-pipeline.md`](../architecture/10-compilation-pipeline.md). Per-phase status:

- **Steps 1-5 (Resolver, Topology Builder, Graph Finalization, Static Analyzer, Rendering Engine) — available.**
- **Phase A (`injectMapping` Pre-Render Interception) and Phase B sub-passes (B.0 preamble through B.6 credential FeatureRecipe Resource Generation) — available.**
- **Phase C (`pipeline:` Wasm execution) — accepted but inert.** A Recipe declaring non-empty `pipeline:` steps validates the array shape at load time; the compiler emits a warning naming the unexecuted steps and continues without invoking the Wasm plugins. Authors targeting JSONPatch-style mutations (Envoy sidecar injection, secret VolumeMount, etc.) cannot achieve the behaviour today.

## Provider engines

The Aggrega standard library documents five rendering providers plus the eval virtual-component provider. Per-provider status:

- **`helm` — available.** Sourced mode (Helm chart rendering via the Helm SDK) and synthesised mode (Workload → Deployment/StatefulSet + Services + PVCs) both ship.
- **`helm-chart` — available.** Sourced mode (umbrella-chart composition) ships. The synthesised input kind is not applicable to this provider; authors needing K8s manifest synthesis use the `helm` provider with `workload:`.
- **`compose` — available.** Sourced mode (compose fragment overlay) and synthesised mode (Workload → compose service + volumes + networks) both ship. Per-boundary `docker-compose.yaml` output assembles via the Release-level composer.
- **`terraform` — planned.** The provider name is documented as designed; no engine is registered with the production dispatch. A Recipe declaring `provider: terraform` halts at render with an `unknown provider` error.
- **`cloudformation` — planned.** Same shape as `terraform`: documented design, no registered engine.
- **`eval` — planned.** The eval virtual-component provider (Wasm-formatter + `.locals` export contract) is documented in [`../architecture/06-data-taxonomy-and-composition.md`](../architecture/06-data-taxonomy-and-composition.md) §10. No engine is registered with the production dispatch; a Recipe declaring `provider: eval` halts at render with an `unknown provider` error.

See [`entities/provider.md`](entities/provider.md) for the Provider entity authoring surface and [`providers/`](providers/) for per-provider reference pages.

## Annotation-driven expansion

Manifests carry a `features.annotations:` binding section that maps annotation keys to Feature types and `infra:` schemas. Documented in [`entities/manifest.md`](entities/manifest.md).

- **Manifest `features.annotations` bindings — accepted but inert.** The Manifest schema accepts the binding shape and Manifest validation passes when the bindings are well-formed. The compiler pass that translates matching boundary or subsystem annotations into per-component synthetic Feature attachments is not yet wired into the build pipeline. A Manifest declaring annotation bindings produces no synthetic Feature attachments today; the compiler does not emit a warning naming the inert bindings, so authors observing missing Feature behaviour should consult this status page rather than infer the bindings from the absence of error.

## Version matching

Recipes and FeatureRecipes bind to a Component or Feature interface via the `implements:` keyword. The catalog indexes Recipes by their `spec.implements` declaration; at Recipe selection the lookup walks three forms in precedence order. Per-form status:

- **Exact (`core/api-server:1.0.0`) — available.** Literal-string match against the indexed key. Highest resolution precedence.
- **Major-compatible range (`core/api-server:^1.0.0`) — available.** The catalog parses the caret form as a SemVer constraint (`>=1.0.0, <2.0.0` for the example) and matches the caller's URI against entries whose constraints the caller's version satisfies. When multiple caret entries match the same caller, the one with the highest baseline version wins as the more-specific match.
- **Unversioned (`core/api-server`) — available.** Bare-base match when no versioned or caret form matches the caller's URI. Lowest resolution precedence.

The three-form precedence iteration ships in the catalog package; missing `implements:` declarations across all three forms surface as unmapped-Recipe errors at Recipe selection. Future iteration may add comparison range forms (`>=1.0.0`, `<2.0.0`) for finer-grained version constraints; the caret form is the canonical authoring surface today for major-compatible matching.

See [`vocabulary/inheritance-and-interface.md`](vocabulary/inheritance-and-interface.md) for the `implements:` design surface and [`entities/manifest.md`](entities/manifest.md) for the per-Manifest mapping tier shape.

## Metadata envelope

The catalog entity envelopes carry `metadata.labels`, `metadata.annotations`, and (on Release) `metadata.environment`. Per-surface status:

**`metadata.labels` and `metadata.annotations` availability — partial coverage today; uniform availability planned.** Three of the eight entity envelopes carry these fields today: Component (labels required with the required `component.aggrega.ai/type` key, annotations optional), Feature (both optional), Aggregate (labels-only, optional). The remaining five entities — Recipe, FeatureRecipe, Manifest, Provider, Release — do not accept `metadata.labels` or `metadata.annotations` at the envelope level today. A future iteration expands optional `metadata.labels` and `metadata.annotations` uniformly across all entities, preserving Component's required-label-key constraint as a per-entity exception.

**`metadata.environment` on Release — required today; informational and optional in a future iteration.** The Release schema currently lists `environment` as a required `metadata` field. A future iteration relaxes the requirement; the field becomes informational and optional, with `aggrega.ai/environment` provenance label emission preserved when the field is supplied. See [`entities/release.md`](entities/release.md) for the Environment Metadata section's five practical use cases (OTel/FinOps cost attribution, OTel trace/log filtering, Kubernetes operator targeting, multi-region production differentiation, compliance scoping).

See [`02-naming-conventions.md`](02-naming-conventions.md) for the field-casing discipline that applies to `metadata` keys, and per-entity reference pages for the envelope shapes each entity accepts today.

## CLI commands

The Aggrega CLI (`aggrega-cli/cmd/aggrega/`) registers the build pipeline plus introspection. Per-command status:

- **`aggrega build` — available.** Reads a Release file, resolves the Aggregate + Manifest, runs the 5-step pipeline, writes rendered artifacts to the boundary output directories.
- **`aggrega inspect` — available.** Inspects a catalog entity and reports its resolved shape. Subcommand surface remains in active development; the full reference page is pending.
- **`aggrega pull` — planned.** Resolves and caches catalog artifacts from remote OCI registries into a local catalog directory. Documented as designed; no command is registered today.
- **`aggrega lint` — planned.** Validates a catalog, an Aggregate, a Release, or a Manifest against authoring rules without producing rendered output. Documented as designed; no command is registered today.
- **`aggrega create` and `aggrega import` — planned.** Recipe scaffolders documented in some vocabulary references; no commands are registered today.

See [`07-cli.md`](07-cli.md) for the CLI overview and [`cli/`](cli/) for per-command reference pages.

## Aggrega Studio

Aggrega Studio is the design-time surface for visualizing and authoring Aggregate topologies. Per-surface status:

- **IR graph contract — available.** The IR graph schema (the canonical inter-process contract any Studio implementation builds against) ships as part of the Aggrega schema distribution. Consumers can author Studio implementations against this schema today.
- **React Flow canvas — planned.** The Studio's interactive topology canvas (visualizing the IR graph; supporting Aggregate authoring) is documented as designed in [`../architecture/15-aggrega-studio.md`](../architecture/15-aggrega-studio.md). No frontend implementation ships in the open-source repository today.
- **Headless CLI streaming mode — planned.** The headless mode (CLI emits the IR graph as newline-delimited JSON to stdout for frontend consumption) is documented in chapter 15. No CLI command emits the streaming form today; the IR graph is materialised in memory by the build pipeline and is not exposed via stdout.

See [`../architecture/15-aggrega-studio.md`](../architecture/15-aggrega-studio.md) for the Studio's design surface and roadmap.

## Roadmap notes

The Aggrega architecture documents several planned extensions whose schema and compiler behaviour are designed but not yet shipping. The status taxonomy above classifies per-surface state across the language; this section enumerates broader design directions documented in the architecture chapters.

- **Strict Implementation Completeness.** A planned extension blocks Recipe-Component interface mismatches at the resolution phase. When a child Component extends a parent baseline without introducing new `usesSchema` sockets or new root keys to `values` / `infra` / `provides`, the parent's Recipe seamlessly implements the child without the Architect needing to author a duplicate Recipe. When the child expands the interface with new keys the parent's template cannot consume, the build halts before render. Documented in [`../architecture/02-ecosystem-philosophy.md`](../architecture/02-ecosystem-philosophy.md).
- **Tracker Struct pattern.** A planned rendering-phase guardrail emits warnings when a rendering template does not read a provided variable, preventing the "Ghost Infrastructure" anti-pattern of values declared by the author and silently dropped by the template. Complements Strict Implementation Completeness as the runtime-guardrail half of the same shape-matching design.
- **Global Schema Overlays.** A planned Aspect-Oriented mechanism allowing Platform Ops to transversally inject JSON Schema 2020-12 fragments across the workspace, silently upgrading open-source catalog components with corporate rules before compilation begins. Documented in [`../architecture/11-governance-and-compliance.md`](../architecture/11-governance-and-compliance.md).

Each extension's status is `planned`. The architecture chapters describe the design surfaces; this page tracks the implementation status. Concrete shipping timelines and intermediate milestones live in project roadmap material outside the language reference.
