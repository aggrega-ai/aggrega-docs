# Status of the Language

This page is the canonical reference for which Aggrega surfaces are usable today, which are documented but not yet acted on by the compiler, and which are planned for a future iteration. It complements the per-domain chapters by surfacing readiness state across the language in one place.

Two reader populations consult this page. **First-time authors** check the page before authoring against an unfamiliar surface, to confirm the surface produces rendered output today. **Reference-seekers** check the page when a surface they are using behaves unexpectedly — for example, when YAML validates but no output is produced, the page is the first place to look up the surface's status. Returning readers also consult the page to identify surfaces that have transitioned between status labels since last reading. Per-domain chapters and entity references describe how the surface is meant to work; this page describes whether it works yet.

## Status taxonomy

Every language surface on this page carries one of four status labels:

- **available.** The schema accepts the surface; the compiler consumes it; behaviour matches the documented contract. Authors using an `available` surface receive the documented contract.

- **accepted but inert.** The schema accepts the surface — authoring against it passes validation — but the compiler does not yet act on it. Authoring an `accepted but inert` surface produces a syntactically valid build with no rendered effect for the surface; the compiler may emit a warning naming the inert surface (the recommended pattern), or some current surfaces silently skip without warning. Per-section entries below name the specific behaviour.

- **accepted but blocked.** The schema accepts the surface — authoring against it passes validation — but the compiler halts the build rather than rendering it. Authoring against an `accepted but blocked` surface fails at render with an explicit error naming what to write instead. A block can be permanent, where what was authored is an ambiguity the compiler will not resolve on your behalf because choosing one reading for you could ship something you did not ask for; or it can stand only until the behaviour behind the surface ships. What the label promises is the same either way: the schema takes it, the build refuses it, and the error tells you how to fix it.

- **planned.** The surface is documented as designed but neither the schema nor the compiler accepts it yet. Authoring against a `planned` surface fails at schema validation. The page surfaces planned items so authors can plan around their absence rather than discover the gap at build time.

Status labels are evaluated against the current compiler. Surfaces under active development may transition between labels; the per-section entries describe the transition plan where one is known.

## Recipe input kinds

A Recipe composes its output from three input kinds — sourced, synthesized, and artifacts — described in [`16-recipe-input-composition.md`](../architecture/16-recipe-input-composition.md). Per-input-kind status:

- **`source:` + `valuesMapping:` (sourced) — available.** The compiler resolves the `source:` URI, evaluates the `valuesMapping` template (inline, file `$import:`, or library `$import:`), and hands the result to the target provider for rendering. Consumed by the helm, helm-chart, and compose providers.

- **`workload:` (synthesized) — available.** The Recipe declares `workload:` either inline (block scalar carrying the Workload YAML) or via `$import:` (file path). The compiler parses the templated Workload, validates it against the embedded Workload schema, and dispatches to the target provider's workload synthesizer. Consumed by the helm and compose providers. The helm-chart provider explicitly redirects authors to the helm provider for synthesized K8s manifests. A Recipe declaring `workload:` against a provider that does not implement workload synthesis halts at render with a `CATALOG_ERROR`.

- **`artifacts:` (artifacts) — available.** The field is a map of named entries; each entry is authored inline or loaded via per-entry `$import:`. Entries are evaluated after workload synthesis and source resolution, so the full TemplateContext — including `.workload` and `.source` — is available to them; they get provenance merged into `metadata.labels` and `metadata.annotations` for documents that carry metadata (the charset-unsafe keys — recipe-uri, boundary-path, sync-wave — as annotations, the same split the helm providers apply), and emit as separate files alongside the Recipe's source-rendered or workload-synthesized output. Provider dispatch — the flat helm provider emits standalone files under a directory named for the component that declared them, inside the boundary output directory, because the key names the file and says nothing about which component wrote it; the compose provider routes its emissions through the Release-end merger; the helm-chart provider evaluates every entry with `[[ ]]` Aggrega delimiters so Helm's `{{ }}` syntax in the same file survives into the downstream render, then places each entry by its authored form — an `$import:`-loaded entry at `boundaries/<bp>/charts/<nodeID>/templates/<authored-key>` (a bundle's files nested beneath that key), alongside the sourced chart's own templates, and an inline-content entry at `boundaries/<bp>/charts/<nodeID>/<authored-key>`, the chart root, where the chart's own templates read it through `.Files.Get` / `.Files.Glob`. Filename collisions across input-kind origins (source-rendered, workload-synthesized, or artifact-emitted output) are caught at render time by the cross-origin collision detector and produce a CATALOG_ERROR naming every contributor.

See [`entities/recipe.md`](entities/recipe.md) for the Recipe authoring surface and the input-kind composition rules; [`errors/fatal-halts.md`](errors/fatal-halts.md) for the Recipe shape rules; and the Providers section below for the per-provider matrix.

## Mapping languages

Recipes (and FeatureRecipes) bind to a single mapping field for translating Aggrega context into the values dictionary the underlying provider consumes. The `valuesMapping:` field supports three authoring modes dispatched by content shape:

- **`valuesMapping:` — Modes 1-3 available.** Mode 1: inline Go template (block scalar). Mode 2: file `$import:` (a map containing only `$import:` with a local file path). Mode 3: library `$import:` (a map containing only `$import:` with a bare-name identity reference to a [MappingLibrary](entities/mappinglibrary.md) entry, `<Library>#/mappings/<entry>`, optionally with a `:<version>` floor). The compiler dispatches on content shape — block scalar to Mode 1, `$import:` with a file path to Mode 2, `$import:` with a bare-name library reference to Mode 3. All three evaluate the resolved Go template against the Recipe's TemplateContext during values mapping (the Sprig helper library is pre-registered); Mode 3 resolves the entry against the local catalog plus any lockfile-pinned libraries, and a host-bearing reference is rejected. See [`entities/recipe.md`](entities/recipe.md) "The `valuesMapping` field — three authoring modes" for the dispatch mechanism and worked examples.

See [`entities/recipe.md`](entities/recipe.md) for the Recipe authoring surface and the mapping-language design, and [`entities/mappinglibrary.md`](entities/mappinglibrary.md) for the library entity that backs Mode 3.

## Inject syntax

The `inject:` block accepts two equivalent syntaxes — a compact map form and a verbose array form. Both produce identical runtime behaviour; the compiler normalizes both to a `map[string]string` shape during parsing.

- **Compact form (`KEY: "string"`) — available.** A flat map keyed by local identifier (env var name, file path, arg flag); the value's semantics depend on placement (literal in `component.inject`, provides-key reference in `uses[].inject` and in an attachment's own `inject`).

- **Verbose form (`[{in: ..., from: ..., value: ...}]`) — available.** An array of objects with explicit `in:`, `from:` (provides-key reference), and `value:` (literal string) keys. Disambiguates the placement-dependent semantics of the compact form.

The verbose form is documented as the long-term authoring surface; the compact form is planned for removal in a future iteration so the language presents a single, unambiguous `inject:` syntax. Authors targeting forward compatibility can author against the verbose form today.

See [`vocabulary/topology-triad.md`](vocabulary/topology-triad.md) for the full Injection Contract specification, including the dual-state context semantics, key-collision rules, and worked examples.

## Template engine

Aggrega's Go template engine evaluates Recipe and FeatureRecipe templates against the TemplateContext at the per-site phase the [Template Expansion Matrix](templates/expansion-matrix.md) documents. The Sprig helper library is pre-registered. Evaluation, parsing, and Sprig integration are available today.

**Missing-key behaviour — tolerated on value templates; strict `missingkey=error` for path templates.** Value templates evaluate with Go's `missingkey=zero` option, so a template referencing an unbound key (e.g., `.values.unset_field`) does not raise an error and the read renders nothing. Catalog idioms like `{{ .values.optional_field | default "fallback" }}` continue to work under this policy, because an unset value counts as empty for `default`. Path templates (`directory:` / `subDirectory:` on Release boundaries) evaluate with `missingkey=error` against a closed allowlist — silent path failures produce broken filesystem layouts that operators only discover post-build, and the strictness catches the error earlier.

**Presence-aware fallback via `optional`.** When a Recipe author needs to distinguish "key absent" from "key present with a zero / empty / false value" — the discriminator Sprig's `default` cannot make — the renderer exposes the `optional` helper: `{{ optional .infra "replicas" 1 }}` returns the authored `infra.replicas` (including an authored `0`) when present, and falls back to `1` only when the key is absent. See [`templates/sprig-functions.md`](templates/sprig-functions.md#optional--presence-aware-fallback) for the full semantics.

**Parameter-contract enforcement at the declaration layer.** Required parameters that the Release does not supply produce explicit errors at the parameter-contract layer, the first thing resolution checks, with file:line provenance naming the parameter and the contract. Type / constraint violations surface the same way. This is the substantive missing-key enforcement: typing is checked where the developer's intent lives (the Aggregate's `parameters:` declaration), not at downstream template-eval time. See [`entities/aggregate.md`](entities/aggregate.md) §"Typed parameter contracts".

**Single declaration grammar for Aggregate `parameters:`.** Each parameter slot is authored as a typed-contract object (`key: { type: <type>, default: <value>, ... }`). The bare-scalar shorthand (`key: <value>`) is rejected at parse time with a directed error pointing the author at the typed-contract syntax. The typed-contract vocabulary makes the `type:`, `required:`, and constraint semantics explicit at the declaration layer; Release fulfillment continues to use scalar values per the contract's declared type.

See [`templates/expansion-matrix.md`](templates/expansion-matrix.md) for the per-template-site evaluation matrix and [`05-templates.md`](05-templates.md) for the templating overview.

## Compilation pipeline phases

The 5-step Aggrega compilation pipeline is documented in [`../architecture/10-compilation-pipeline.md`](../architecture/10-compilation-pipeline.md). Per-phase status:

- **Resolution, topology construction, graph finalization, static analysis and rendering — available.**
- **Inject mapping (`injectMapping` pre-render interception) and every base-rendering sub-stage — locals publication, values mapping, workload synthesis, artifact evaluation, provider render, feature rendering, and credential FeatureRecipe resource generation — available.**
- **The plugin pipeline (`pipeline:` Wasm execution) — available.** A Recipe or FeatureRecipe declaring non-empty `pipeline:` steps has each step executed in declared order: the compiler dispatches the step's named Wasm plugin against the rendered output, applies the returned JSON Patch operations to the addressed documents, and emits the step's side effects. A step whose `when:` gate renders falsy is skipped as a pass-through, leaving the document set unchanged. Authors targeting JSONPatch-style mutations (Envoy sidecar injection, secret VolumeMount, etc.) achieve them through this surface.

## Providers

The Aggrega standard library ships three rendering providers — `helm`, `helm-chart`, and `compose` — plus the eval virtual-component provider. Per-provider status:

- **`helm` — available.** Sourced mode (Helm chart rendering via the Helm SDK) and synthesized mode (Workload → a controller object chosen by the Workload's `form` — Deployment, StatefulSet, DaemonSet, or Job — plus Services and PVCs) both ship.
- **`helm-chart` — available.** Sourced mode (umbrella-chart composition) ships. The synthesized input kind is not applicable to this provider; authors needing K8s manifest synthesis use the `helm` provider with `workload:`.
- **`compose` — available.** Sourced mode (compose fragment overlay) and synthesized mode (Workload → compose service + volumes + networks) both ship. Per-boundary `docker-compose.yaml` output assembles via the Release-level composer.
- **`eval` — planned.** The eval virtual-component provider (Wasm-formatter + `.locals` export contract) is documented in [`../architecture/06-data-taxonomy-and-composition.md`](../architecture/06-data-taxonomy-and-composition.md) §10. No provider is registered with the production dispatch; a Recipe declaring `capability: eval` halts at render with an `unknown provider` error.

Provider rendering is served by a Plugin with `pluginType: provider`; see [`entities/plugin.md`](entities/plugin.md) for the provider-rendering Plugin authoring surface and [`providers/`](providers/) for per-provider reference pages.

## Annotation-driven expansion

Manifests carry a `features.annotations:` binding section that maps annotation keys to Feature types plus a pillar-grouped routing table (`maps.infra` / `maps.values`) naming which Feature schema properties each binding may populate. Documented in [`entities/manifest.md`](entities/manifest.md) and [`providers/well-known-annotations.md`](providers/well-known-annotations.md); pipeline placement at [`../architecture/10-compilation-pipeline.md`](../architecture/10-compilation-pipeline.md); catalog-load and inspect-time mechanics at [`../architecture/13-catalog-and-registry.md`](../architecture/13-catalog-and-registry.md) §"Annotation-driven Feature expansion".

- **Manifest `features.annotations` bindings — available.** The annotation-expansion sub-stage of resolution ships end-to-end. It walks Release boundaries (outer-to-inner) and Aggregate subsystems (outer-to-inner), computes the effective per-component annotation set via cascade + override with whole-value and per-subkey null opt-out, parses each annotation value into the Scalar / Structured / Nil sum type, routes per-subkey through the binding's `maps` declaration with side-vs-pillar enforcement (Aggregate-side fires `maps.values`; Release-side fires `maps.infra`), validates per-leaf types against the target Feature's `spec.schema`, and injects synthetic Feature attachments tagged with `Origin: "annotation"` IR provenance. Cross-side composition merges per-pillar per-field at IR build time with explicit-wins-per-field; `aggrega inspect` renders provenance brackets per leaf. Catalog-load binding-target validation, the schema-pillar-overlap lint, and the binding-map-overlap lint gate the path. The bare `aggrega.ai/` prefix is rejected at Manifest load when used as a binding key — that prefix is reserved for platform-native annotations; bindings use `feature.aggrega.ai/` or a custom domain.

## Version matching

Recipes and FeatureRecipes bind to a Component or Feature interface via the `implements:` keyword. The catalog indexes Recipes by their `spec.implements` declaration; at Recipe selection the lookup walks three forms in precedence order. Per-form status:

- **Exact (`core/api-server:1.0.0`) — available.** Literal-string match against the indexed key. Highest resolution precedence.
- **Major-compatible range (`core/api-server:^1.0.0`) — available.** The catalog parses the caret form as a SemVer constraint (`>=1.0.0, <2.0.0` for the example) and matches the caller's URI against entries whose constraints the caller's version satisfies. When multiple caret entries match the same caller, the one with the highest baseline version wins as the more-specific match.
- **Unversioned (`core/api-server`) — available.** Bare-base match when no versioned or caret form matches the caller's URI. Lowest resolution precedence.

The three-form precedence iteration ships in the catalog package; missing `implements:` declarations across all three forms surface as unmapped-Recipe errors at Recipe selection. Future iteration may add comparison range forms (`>=1.0.0`, `<2.0.0`) for finer-grained version constraints; the caret form is the canonical authoring surface today for major-compatible matching.

See [`vocabulary/inheritance-and-interface.md`](vocabulary/inheritance-and-interface.md) for the `implements:` design surface and [`entities/manifest.md`](entities/manifest.md) for the per-Manifest mapping tier shape.

## Metadata envelope

The catalog entity envelopes carry `metadata.labels`, `metadata.annotations`, and (on Release) `metadata.environment`. Per-surface status:

**`metadata.labels` and `metadata.annotations` availability — partial coverage today; uniform availability planned.** The entity envelopes carrying these fields today are Component (labels required, with the required `component.aggrega.ai/type` key, annotations optional), Feature (both optional), the four library kinds SchemaLibrary, MappingLibrary, WorkloadLibrary and ArtifactsLibrary (both optional), and Aggregate (labels only, optional). The remaining entities — Recipe, FeatureRecipe, Manifest, Release, Plugin — do not accept `metadata.labels` or `metadata.annotations` at the envelope level today. A future iteration expands optional `metadata.labels` and `metadata.annotations` uniformly across all entities, preserving Component's required-label-key constraint as a per-entity exception.

**`metadata.environment` on Release — required today; informational and optional in a future iteration.** The Release schema currently lists `environment` as a required `metadata` field. A future iteration relaxes the requirement; the field becomes informational and optional, with `aggrega.ai/environment` provenance label emission preserved when the field is supplied. See [`entities/release.md`](entities/release.md) for the Environment Metadata section's five practical use cases (OTel/FinOps cost attribution, OTel trace/log filtering, Kubernetes operator targeting, multi-region production differentiation, compliance scoping).

See [`02-naming-conventions.md`](02-naming-conventions.md) for the field-casing discipline that applies to `metadata` keys, and per-entity reference pages for the envelope shapes each entity accepts today.

## CLI commands

The Aggrega CLI (`aggrega-cli/cmd/aggrega/`) registers the build pipeline plus introspection. Per-command status:

- **`aggrega build` — available.** Reads a Release file, resolves the Aggregate + Manifest, runs the 5-step pipeline, writes rendered artifacts to the boundary output directories. When a lockfile is present it verifies dependencies against it; when one is absent it auto-pulls (unless configured otherwise).
- **`aggrega inspect` — available.** Inspects a catalog entity and reports its resolved shape. Subcommand surface remains in active development; the full reference page is pending.
- **`aggrega pull` — available.** Resolves all of a Release's dependencies and writes a per-Release lockfile pinning every catalog entity and source artifact to a version and content digest; caches the fetched content under `.aggrega/cache`. `--verify` checks an existing lockfile against current state. See [`cli/aggrega-pull.md`](cli/aggrega-pull.md).
- **`aggrega push` — available.** Publishes a catalog entity to an OCI registry; `aggrega push --list-kinds` reports which kinds it accepts. See [`cli/aggrega-push.md`](cli/aggrega-push.md).
- **`aggrega lint` — available.** Runs the publishing-discipline rules over a catalog entity at `warn` severity; `--pre-publish` runs them at `halt` severity and adds a version-bump check against the entity's currently-published version. The rules ship as an opt-in Wasm plugin. See [`cli/aggrega-lint.md`](cli/aggrega-lint.md).
- **`aggrega serve` — available.** A long-running compiler-as-service daemon speaking JSON-RPC 2.0 over stdin/stdout, for IDE integration (diagnostics, hover, completion, go-to-definition, IR-graph). See [`cli/aggrega-serve.md`](cli/aggrega-serve.md).
- **`aggrega version` — available.** Prints the CLI version; `-o json` emits a machine-readable version object.
- **`aggrega validate` — available.** Checks correctness across the whole catalog, a Release, or a single entity, reporting diagnostics without rendering artifacts.
- **`aggrega acquire` — available.** Runs a Release's build pipeline in acquisition mode with rendered output discarded: every external input the render requests is fetched, pinned into the content-addressed input store, and recorded in the lockfile, so a later build serves those inputs offline.
- **`aggrega search` — available.** Searches the local index of configured registries for published entities; the index is built and refreshed by `aggrega registry update`.
- **`aggrega registry` — available.** Manages registries and their signature trust policy; `registry add` records a registry, and `registry update` builds the local index that `aggrega search` queries.
- **`aggrega push-artifact` — available.** Publishes a standalone data artifact (such as a documentation bundle) to an OCI registry, alongside the entity-publishing `push`.
- **`aggrega sign` — available.** Signs one or more already-published artifacts and attaches their signatures.
- **`aggrega deprecate` — available.** Attaches a signed deprecation marker to an already-published artifact.
- **`aggrega login` and `aggrega logout` — available.** Authenticate to an OCI registry and store the credential, or remove a stored credential.
- **`aggrega auth` — available.** Manages the local signing identity used to sign artifacts.
- **`aggrega config` — available.** Inspects and manages the workspace configuration; subcommands show the effective merged configuration and where each setting came from, seed a working configuration with a registry and its signature trust policy, and freeze the effective build-critical configuration into the workspace so it builds identically without relying on the machine's global configuration.
- **`aggrega get-schema` — available.** Prints the JSON Schema for an entity or contract kind.
- **`aggrega plugin` — available.** Inspects the Wasm plugins the CLI can resolve; subcommands list them, add and remove configured plugins, sync a plugin's machine-owned records, and generate a catalog view of them.
- **`aggrega cache` — available.** Inspects and maintains the on-disk caches; subcommands report status, prune, evict, and clear.
- **`aggrega mcp` — available.** Runs a Model Context Protocol server over stdio, exposing the compiler's introspection to AI-assistant integrations.
- **`aggrega completion` — available.** Generates the shell autocompletion script for the CLI.
- **CLI-extension subcommands — available.** A Wasm plugin published as a `pluginType: cli` guest is resolved and registered as an `aggrega` subcommand, so an installed extension runs as `aggrega <extension>` alongside the built-in commands.
- **`aggrega import` — available.** Turns a foreign declarative agent-definition source (Langflow, Flowise) into draft Aggregate and Component authoring files, with a deterministic confidence-scored catalog-reuse decision recorded per node. The format-specific mapping is supplied by an importer plugin the workspace resolves for the source format; a catalog-published starter importer is still forthcoming, so running the command end to end needs an importer plugin that advertises the source format.
- **`aggrega create` — planned.** A Recipe scaffolder documented in some vocabulary references; not registered today.

See [`07-cli.md`](07-cli.md) for the CLI overview and [`cli/`](cli/) for per-command reference pages.

## Aggrega Studio

Aggrega Studio is the design-time surface for visualizing and authoring Aggregate topologies. Per-surface status:

- **IR graph contract — available.** The IR graph schema (the canonical inter-process contract any Studio implementation builds against) ships as part of the Aggrega schema distribution. Consumers can author Studio implementations against this schema today.
- **React Flow canvas — planned.** The Studio's interactive topology canvas (visualizing the IR graph; supporting Aggregate authoring) is documented as designed in [`../architecture/15-aggrega-studio.md`](../architecture/15-aggrega-studio.md). No frontend implementation ships in the open-source repository today.
- **Headless CLI streaming mode — planned.** The headless mode (CLI emits the IR graph as newline-delimited JSON to stdout for frontend consumption) is documented in chapter 15. No CLI command emits the streaming form today; the IR graph is materialised in memory by the build pipeline and is not exposed via stdout.

See [`../architecture/15-aggrega-studio.md`](../architecture/15-aggrega-studio.md) for the Studio's design surface and roadmap.

## Roadmap notes

The Aggrega architecture documents several planned extensions whose schema and compiler behaviour are designed but not yet shipping. The status taxonomy above classifies per-surface state across the language; this section enumerates broader design directions documented in the architecture chapters.

Estate-wide compliance is not among them: stating a governance rule once so that it binds every build in the workspace is **available** today through the governance socket. A plugin attached at the workspace configuration's `plugins.governance` key evaluates every build in that workspace — a verdict role rejecting a graph or a rendered artifact that violates the rule, a transform role supplying derived metadata a developer never types. See [`../architecture/11-governance-and-compliance.md`](../architecture/11-governance-and-compliance.md).

- **Strict Implementation Completeness.** A planned extension blocks Recipe-Component interface mismatches at the resolution phase. When a child Component extends a parent baseline without introducing new `usesSchema` sockets or new root keys to `values` / `infra` / `provides`, the parent's Recipe seamlessly implements the child without the Architect needing to author a duplicate Recipe. When the child expands the interface with new keys the parent's template cannot consume, the build halts before render. Documented in [`../architecture/02-ecosystem-philosophy.md`](../architecture/02-ecosystem-philosophy.md).
- **Tracker Struct pattern.** A planned rendering-phase guardrail emits warnings when a rendering template does not read a provided variable, preventing the "Ghost Infrastructure" anti-pattern of values declared by the author and silently dropped by the template. Complements Strict Implementation Completeness as the runtime-guardrail half of the same shape-matching design.

Each extension's status is `planned`. The architecture chapters describe the design surfaces; this page tracks the implementation status. Concrete shipping timelines and intermediate milestones live in project roadmap material outside the language reference.
