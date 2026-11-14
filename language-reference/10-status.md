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

- **`source:` + `valuesMapping:` (sourced) — available.** The compiler resolves the `source:` URI, evaluates the `valuesMapping` template (inline, file `$import:`, or library `$import:`), and hands the result to the target provider for rendering. Consumed by the helm, helm-chart, compose, terraform, and cloudformation providers.

- **`workload:` (synthesized) — available.** The Recipe declares `workload:` either inline (block scalar carrying the Workload YAML) or via `$import:` (file path). The compiler parses the templated Workload, validates it against the embedded Workload schema, and dispatches to the target provider's workload synthesizer. Consumed by the helm and compose providers. The helm-chart provider explicitly redirects authors to the helm provider for synthesized K8s manifests. A Recipe declaring `workload:` against a provider that does not implement workload synthesis halts at render with a `CATALOG_ERROR`.

- **`artifacts:` (artifacts) — available.** The field is a map of named entries; each entry is authored inline or loaded via per-entry `$import:`. Entries are evaluated after the Workload is parsed and the source resolved, so the full template context — including `.workload` and `.source` — is available to them; they get provenance merged into `metadata.labels` and `metadata.annotations` for documents that carry metadata (the charset-unsafe keys — recipe-uri, boundary-path, sync-wave — as annotations, the same split the helm providers apply), and emit as separate files alongside the Recipe's source-rendered or workload-synthesized output. Provider dispatch — the flat helm provider emits standalone files under a directory named for the component that declared them, inside the boundary output directory, because the key names the file and says nothing about which component wrote it; the compose provider routes its emissions through the Release-end merger; the helm-chart provider evaluates every entry with `[[ ]]` Aggrega delimiters so Helm's `{{ }}` syntax in the same file survives into the downstream render, then places each entry by its authored form — an `$import:`-loaded entry at `boundaries/<bp>/charts/<nodeID>/templates/<authored-key>` (a bundle's files nested beneath that key), alongside the sourced chart's own templates, and an inline-content entry at `boundaries/<bp>/charts/<nodeID>/<authored-key>`, the chart root, where the chart's own templates read it through `.Files.Get` / `.Files.Glob`; the terraform provider writes each entry verbatim into the component's own directory under the boundary's `modules/` tree; the cloudformation provider merges each entry, a stack fragment, into the single stack assembled for that output directory. Filename collisions across input-kind origins (source-rendered, workload-synthesized, or artifact-emitted output) are caught at render time by the cross-origin collision detector and produce a CATALOG_ERROR naming every contributor.

See [`entities/recipe.md`](entities/recipe.md) for the Recipe authoring surface and the input-kind composition rules; [`errors/fatal-halts.md`](errors/fatal-halts.md) for the Recipe shape rules; and the Providers section below for the per-provider matrix.

## Mapping languages

Recipes (and FeatureRecipes) bind to a single mapping field for translating Aggrega context into the values dictionary the underlying provider consumes. The `valuesMapping:` field supports three authoring modes dispatched by content shape:

- **`valuesMapping:` — Modes 1-3 available.** Mode 1: inline Go template (block scalar). Mode 2: file `$import:` (a map containing only `$import:` with a local file path). Mode 3: library `$import:` (a map containing only `$import:` with a bare-name identity reference to a [MappingLibrary](entities/mappinglibrary.md) entry, `<Library>#/mappings/<entry>`, optionally with a `:<version>` floor). The compiler dispatches on content shape — block scalar to Mode 1, `$import:` with a file path to Mode 2, `$import:` with a bare-name library reference to Mode 3. All three evaluate the resolved Go template against the Recipe's template context during values mapping (the Sprig helper library is pre-registered); Mode 3 resolves the entry against the local catalog plus any lockfile-pinned libraries, and a host-bearing reference is rejected. See [`entities/recipe.md`](entities/recipe.md) "The `valuesMapping` field — three authoring modes" for the dispatch mechanism and worked examples.

See [`entities/recipe.md`](entities/recipe.md) for the Recipe authoring surface and the mapping-language design, and [`entities/mappinglibrary.md`](entities/mappinglibrary.md) for the library entity that backs Mode 3.

## Inject syntax

The `inject:` block has one syntax at every placement — a component's own `inject`, a `uses` connection's, and an attachment's.

- **A list of entries per mechanism (`[{in: ..., from: ...}]`, `[{in: ..., value: ...}]`) — available.** Each delivery mechanism is a list; each entry names its local identifier (env var name, file path, arg flag) with `in:` and carries exactly one of `from:` (provides-key reference) or `value:` (literal string). A mechanism written as a map rather than a list, or an entry carrying both keywords, halts the build at the Aggregate's document envelope, naming the path.

- **`value:` only in a component's own `inject`.** A literal belongs in the component's own `inject`, which delivers it. On a `uses` connection a `value:` halts the build, as [An `inject:` entry on a connection carries a literal](errors/fatal-halts.md#an-inject-entry-on-a-connection-carries-a-literal) describes, and in an attachment's own `inject` it halts the build too, as [An `inject:` entry on an attached Feature carries a literal](errors/fatal-halts.md#an-inject-entry-on-an-attached-feature-carries-a-literal) describes: both deliver only keys another entity publishes, named with `from:`.

See [`vocabulary/topology-triad.md`](vocabulary/topology-triad.md) for the full Injection Contract specification, including the dual-state context semantics, key-collision rules, and worked examples.

## Template engine

Aggrega's Go template engine evaluates Recipe and FeatureRecipe templates against the template context at the per-site phase the [Template Expansion Matrix](templates/expansion-matrix.md) documents. The Sprig helper library is pre-registered alongside Aggrega's own helpers on every surface the renderer evaluates, with one exception: resolving a structured `source:` coordinate registers Aggrega's helpers alone — `optional` and `capitalizedWords` are available there and Sprig's functions are not, so a Sprig call in a `source:` field, or in a `locals:` entry on an entity that carries a structured `source:`, halts at parse time. See [`errors/fatal-halts.md`](errors/fatal-halts.md), which gives that surface its own section. Evaluation, parsing, and Sprig integration are available today.

**Missing-key behaviour — tolerated on value templates; strict `missingkey=error` on path templates, on assertions, and on a `source:` coordinate.** Value templates evaluate with Go's `missingkey=zero` option, so a template referencing an unbound key (e.g., `.values.unset_field`) does not raise an error and the read renders nothing. Catalog idioms like `{{ .values.optional_field | default "fallback" }}` continue to work under this policy, because an unset value counts as empty for `default`. Path templates (`directory:` / `subDirectory:` on Release boundaries) evaluate with `missingkey=error` against a closed allowlist — silent path failures produce broken filesystem layouts that operators only discover post-build, and the strictness catches the error earlier. Two further surfaces take the same strict policy, for the same reason: an empty rendering there would produce a wrong verdict or a wrong pin rather than a field the author can read back. They are an `assertions:` entry on a Component, Feature, Recipe or FeatureRecipe, and the templated fields of a structured `source:` block on a Recipe or FeatureRecipe. [`errors/fatal-halts.md`](errors/fatal-halts.md) accounts for every surface's policy one by one and gives the presence-aware forms that work under the strict one.

**Presence-aware fallback via `optional`.** When a Recipe author needs to distinguish "key absent" from "key present with a zero / empty / false value" — the discriminator Sprig's `default` cannot make — the renderer exposes the `optional` helper: `{{ optional .infra "replicas" 1 }}` returns the authored `infra.replicas` (including an authored `0`) when present, and falls back to `1` only when the key is absent. See [`templates/sprig-functions.md`](templates/sprig-functions.md#optional--presence-aware-fallback) for the full semantics.

**Name folding via `capitalizedWords`.** Where a target accepts only letters and digits in the names it addresses resources by, `{{ capitalizedWords .context.instance_id }}` reads the id as words separated by anything outside that alphabet and capitalises each word's first letter, so `payments-db` gives `PaymentsDb`. The fold drops every separator, so two ids differing only in punctuation reach one name; a build that would emit two resources under one name halts and names both ids. See [`templates/sprig-functions.md`](templates/sprig-functions.md#capitalizedwords--fold-a-name-into-letters-and-digits) for the full semantics.

**Parameter-contract enforcement at the declaration layer.** Required parameters that the Release does not supply produce explicit errors at the parameter-contract layer, the first thing resolution checks, with file:line provenance naming the parameter and the contract. Type / constraint violations surface the same way. This is the substantive missing-key enforcement: typing is checked where the developer's intent lives (the Aggregate's `parameters:` declaration), not at downstream template-eval time. See [`entities/aggregate.md`](entities/aggregate.md) §"Typed parameter contracts".

**Single declaration grammar for Aggregate `parameters:`.** Each parameter slot is authored as a typed-contract object (`key: { type: <type>, default: <value>, ... }`). The bare-scalar shorthand (`key: <value>`) is rejected at the Aggregate's document envelope, with an error naming the parameter and saying an object was expected. The typed-contract vocabulary makes the `type:`, `required:`, and constraint semantics explicit at the declaration layer; Release fulfillment continues to use scalar values per the contract's declared type.

See [`templates/expansion-matrix.md`](templates/expansion-matrix.md) for the per-template-site evaluation matrix and [`05-templates.md`](05-templates.md) for the templating overview.

## Compilation pipeline phases

The Aggrega compilation pipeline is documented in [`../architecture/10-compilation-pipeline.md`](../architecture/10-compilation-pipeline.md). Per-phase status:

- **Resolution, topology construction, graph finalization, static analysis and rendering — available.**
- **Inject mapping (`injectMapping` pre-render interception) and every base-rendering sub-stage — locals publication, values mapping, workload synthesis, artifact evaluation, provider render, feature rendering, and credential FeatureRecipe resource generation — available.**
- **The plugin pipeline (`pipeline:` Wasm execution) — available.** A Recipe or FeatureRecipe declaring non-empty `pipeline:` steps has each step executed in declared order: the compiler dispatches the step's named Wasm plugin against the rendered output, applies the returned JSON Patch operations to the addressed documents, and emits the step's side effects. A step whose `when:` gate renders falsy is skipped as a pass-through, leaving the document set unchanged. Authors targeting JSONPatch-style mutations (Envoy sidecar injection, secret VolumeMount, etc.) achieve them through this surface.

## Providers

The Aggrega standard library ships five rendering providers — `helm`, `helm-chart`, `compose`, `terraform`, and `cloudformation`. Per-provider status:

- **`helm` — available.** Sourced mode (Helm chart rendering via the Helm SDK) and synthesized mode (Workload → a controller object chosen by the Workload's `form` — Deployment, StatefulSet, DaemonSet, Job, or CronJob — plus Services and PVCs) both ship.
- **`helm-chart` — available.** Sourced mode (umbrella-chart composition) ships. The synthesized input kind is not applicable to this provider; authors needing K8s manifest synthesis use the `helm` provider with `workload:`.
- **`compose` — available.** Sourced mode (compose fragment overlay) and synthesized mode (Workload → compose service + volumes + networks) both ship. Per-boundary `docker-compose.yaml` output assembles via the Release-level composer.
- **`terraform` — available.** Sourced mode and artifacts both ship; each boundary gets one root configuration, `aggrega.modules.tf`, declaring every component as a `module` block whose files sit in its own directory under `modules/`. The synthesized input kind is not applicable to this provider.
- **`cloudformation` — available.** Sourced mode and artifacts (stack fragments) both ship; every component rendering to one output directory assembles into one stack template, emitted as pure JSON. The synthesized input kind is not applicable to this provider.

Provider rendering is served by a Plugin with `pluginType: provider`; see [`entities/plugin.md`](entities/plugin.md) for the provider-rendering Plugin authoring surface and [`06-providers.md`](06-providers.md) for the per-provider reference pages.

## Annotation-driven expansion

Manifests carry a `features.annotations:` binding section that maps annotation keys to Feature types plus a pillar-grouped routing table (`maps.infra` / `maps.values`) naming which Feature schema properties each binding may populate. Documented in [`entities/manifest.md`](entities/manifest.md) and [`providers/well-known-annotations.md`](providers/well-known-annotations.md); pipeline placement at [`../architecture/10-compilation-pipeline.md`](../architecture/10-compilation-pipeline.md); catalog-load and inspect-time mechanics at [`../architecture/13-catalog-and-registry.md`](../architecture/13-catalog-and-registry.md) §"Annotation-driven Feature expansion".

- **Manifest `features.annotations` bindings — available.** The annotation-expansion sub-stage of resolution ships end-to-end. It walks Release boundaries (outer-to-inner) and Aggregate subsystems (outer-to-inner), computes the effective per-component annotation set via cascade + override with whole-value and per-subkey null opt-out, parses each annotation value as a scalar, a structured map, or an explicit `null`, routes per-subkey through the binding's `maps` declaration with side-vs-pillar enforcement (Aggregate-side fires `maps.values`; Release-side fires `maps.infra`), validates per-leaf types against the target Feature's `spec.schema`, and injects synthetic Feature attachments, which the IR graph marks with `origin: annotation`. Cross-side composition merges per-pillar per-field at IR build time with explicit-wins-per-field; `aggrega inspect` renders provenance brackets per leaf. Catalog-load binding-target validation, the schema-pillar-overlap lint, and the binding-map-overlap lint gate the path. The bare `aggrega.ai/` prefix is rejected at Manifest load when used as a binding key — that prefix is reserved for platform-native annotations; bindings use `feature.aggrega.ai/` or a custom domain.

## Version matching

Recipes and FeatureRecipes declare the Component or Feature interface they implement via the `implements:` keyword. `implements:` never selects a Recipe: the Manifest's mapping does, and an instance whose type no mapping covers halts with an error that lists the Recipes whose `implements:` can implement that type as candidates. What `implements:` drives is the check that each Manifest mapping entry's Recipe implements the mapped type, or a base that type `extends`. The mapped type is the entry's key and, for a `components.type` key, also the type of each component instance the key reaches at a version the key does not name — every instance it reaches, for a key written without a version — at the version the build compiles that instance as: the version the instance names, or, for an instance naming none, the highest version of that Component the catalog holds. Per-form status:

- **Exact (`core/api-server:1.0.0`) — available.** The mapped type must be that version.
- **Major-compatible range (`core/api-server:^1.0.0`) — available.** The caret form is a SemVer constraint (`>=1.0.0, <2.0.0` for the example); the mapped type's version must satisfy it.
- **Unversioned (`core/api-server`) — available.** Any version of the type satisfies it.

A mapping entry whose Recipe's `implements:` matches neither the mapped type nor any of its bases halts the build with an `OPS_ERROR` naming the entry, the Recipe, and its `implements:` value. A component instance a key reaches at another version, whose version the Recipe's `implements:` does not satisfy, halts the build with the same `OPS_ERROR`, naming the instance, its type — and, for an instance naming no version, the version it was compiled as — the key, the Recipe, and its `implements:` value. The caret form is the canonical authoring surface for major-compatible matching.

See [`vocabulary/inheritance-and-interface.md`](vocabulary/inheritance-and-interface.md) for the `implements:` design surface and [`entities/manifest.md`](entities/manifest.md) for the per-Manifest mapping tier shape.

## Metadata envelope

The catalog entity envelopes carry `metadata.labels`, `metadata.annotations`, and (on Release) `metadata.environment`. Per-surface status:

**`metadata.labels` and `metadata.annotations` availability — on seven kinds.** The entity envelopes carrying these fields are Component (labels required, with the required `component.aggrega.ai/type` key, annotations optional), Feature (both optional), the four library kinds SchemaLibrary, MappingLibrary, WorkloadLibrary and ArtifactLibrary (both optional), and Aggregate (labels only, optional). The remaining entities — Recipe, FeatureRecipe, Manifest, Release, Plugin — do not accept `metadata.labels` or `metadata.annotations` at the envelope level.

**`metadata.environment` on Release — required.** The Release schema lists `environment` as a required `metadata` field; the build stamps its value on rendered output as the `aggrega.ai/environment` label. See [`entities/release.md`](entities/release.md) for the Environment Metadata section's five practical use cases (OTel/FinOps cost attribution, OTel trace/log filtering, Kubernetes operator targeting, multi-region production differentiation, compliance scoping).

See [`02-naming-conventions.md`](02-naming-conventions.md) for the field-casing discipline that applies to `metadata` keys, and per-entity reference pages for the envelope shapes each entity accepts today.

## CLI commands

The Aggrega CLI registers the build pipeline plus introspection. Per-command status:

- **`aggrega build` — available.** Reads a Release file, resolves the Aggregate + Manifest, runs the compilation pipeline, writes rendered artifacts to the boundary output directories. When a lockfile is present it verifies dependencies against it; when one is absent it halts asking for a pull, or fills it first where `--auto-pull` or `auto_pull` asks.
- **`aggrega inspect` — available.** Inspects a catalog entity, an entity file, an entity published in a registry, or a Release, and reports its resolved shape. See [`cli/aggrega-inspect.md`](cli/aggrega-inspect.md).
- **`aggrega pull` — available.** Resolves all of a Release's dependencies and writes a per-Release lockfile pinning every catalog entity and source artifact to a version and content digest, and every external input the Release's render requests to a content digest; caches the fetched content under `.aggrega/cache`. `--verify` checks an existing lockfile against current state. See [`cli/aggrega-pull.md`](cli/aggrega-pull.md).
- **`aggrega push` — available.** Publishes a catalog entity to an OCI registry; `aggrega push --list-kinds` reports which kinds it accepts. See [`cli/aggrega-push.md`](cli/aggrega-push.md).
- **`aggrega lint` — available.** Runs the publishing-discipline rules at `warn` severity over the whole catalog, a Release's dependency closure, or one entity; on one entity, `--pre-publish` adds a version-bump check against the entity's currently-published version, and a mismatch halts. The rules ship as an opt-in Wasm plugin. See [`cli/aggrega-lint.md`](cli/aggrega-lint.md).
- **`aggrega serve` — available.** A long-running compiler-as-service daemon speaking JSON-RPC 2.0 over stdin/stdout, for editor and IDE integration. See [`cli/aggrega-serve.md`](cli/aggrega-serve.md) for the methods it serves.
- **`aggrega version` — available.** Prints the CLI version; `-o json` emits a machine-readable version object.
- **`aggrega validate` — available.** Checks correctness across the whole catalog, a Release, or a single entity, reporting diagnostics without rendering artifacts.
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
- **`aggrega mcp` — available.** Runs a Model Context Protocol server over stdio, or over HTTPS for a client on another machine, exposing the compiler's introspection to AI-assistant integrations.
- **`aggrega completion` — available.** Generates the shell autocompletion script for the CLI.
- **CLI-extension subcommands — available.** A Wasm plugin published as a `pluginType: cli` guest is resolved and registered as an `aggrega` subcommand, so an installed extension runs as `aggrega <extension>` alongside the built-in commands.
- **`aggrega import` — available.** Turns a foreign declarative agent-definition source (Langflow, Flowise, n8n) into draft Aggregate and Component authoring files, with a deterministic confidence-scored catalog-reuse decision recorded per node. The format-specific mapping is supplied by an importer plugin the workspace resolves for the source format — one its catalog holds, or one of the compiler's [Langflow, Flowise and n8n importers](plugins/core-importers.md), which are built and published with each compiler release. The binary carries their Plugin entities but not their modules, so they serve their formats in every workspace: the first import that needs one the machine does not hold fetches it from the workspace's default registry, verifies it and keeps it in the content cache for every later import. A source is parsed through the parser the workspace's catalog serves for its syntax, or, where the catalog serves none, through the one the compiler carries, so a workspace whose catalog holds no parser imports through either.
- **`aggrega scaffold` — available.** Drafts a starter document for any entity kind from that kind's schema — every field it requires, with a placeholder where a value is needed — and writes it to standard output; with `--example`, writes one of the documentation's runnable examples, read from the signed documentation bundle, into a new directory.
- **`aggrega explain` — available.** Explains the halting condition a short code (such as `E0007`) or a descriptive code names.
- **`aggrega edit-document` — available.** Applies one bounded structured edit to a document — adding a component, attaching a Feature, wiring a connection, or setting one value — preserving every byte it does not touch.
- **`aggrega pin` — available.** Records, in the `entity.lock` beside a Recipe or FeatureRecipe, the content pin for every input the entity reads from outside its own document.
- **`aggrega skills` — available.** Installs the Aggrega skill into an AI assistant.

See [`07-cli.md`](07-cli.md) for the CLI overview and the [Language Reference index](README.md) for every per-command reference page.

## Editors and other frontends

Every frontend shows what the `aggrega` binary compiled; none carries a compiler of its own. Per-surface status:

- **IR graph contract — available.** The IR graph schema, the contract every frontend reads the graph against, ships as part of the Aggrega schema distribution; see [the IR schema reference](schema/other/ir.md).
- **Reading the graph from a command — available.** `aggrega build` accepts `--ir-graph`, and so do `aggrega inspect` given a Release and `aggrega validate --release`; the flag writes the graph that run resolved to stdout as JSON in addition to whatever the command already produces. A daemon session reads the same graph at `aggrega/irGraph`, and the MCP server's `cli-inspect`, `cli-build` and `cli-validate` tools take it as their `ir_graph` argument.
- **Topology graph in Visual Studio Code — available.** The [Aggrega extension for Visual Studio Code](../authoring/editor/README.md) draws the selected Release's IR graph as an interactive graph and attaches Features from it, asking the `aggrega serve` daemon for both.
- **Headless CLI streaming mode — planned.** The headless mode emits the IR graph as newline-delimited JSON on stdout for a frontend to consume as the topology changes. What ships today is one document per invocation rather than a stream: no command emits a sequence of graphs on a single stdout as a topology changes.

See [`../architecture/15-editors-assistants-and-frontends.md`](../architecture/15-editors-assistants-and-frontends.md) for how the editor, the assistant and the daemon reach the compiler.

## Design directions

The status taxonomy above classifies per-surface state across the language; this section records the status of broader design directions documented in the architecture chapters.

Estate-wide compliance is not a planned direction: stating a governance rule once so that it binds every build in the workspace is **available** today through the governance socket. A plugin attached at the workspace configuration's `plugins.governance` key evaluates every build in that workspace — a verdict role rejecting a graph or a rendered artifact that violates the rule, a transform role supplying derived metadata a developer never types. See [`../architecture/11-governance-and-compliance.md`](../architecture/11-governance-and-compliance.md).

- **Interface Parity & Auto-Implementation — available.** A Recipe written against a base Component serves every Component that extends it, at any depth of the chain, without the Architect needing to author a duplicate Recipe. The extending Component writes `schema: inherited`, so it adds no root key to `values` / `infra` / `provides` that the base's Recipe could not consume; a Component declaring `extends` with a schema of its own is refused at its document envelope. The Manifest still maps the extending type with an entry of its own, and the mapping check accepts it when the mapped Recipe's `implements` names the type or any base it extends. Documented in [`../architecture/02-ecosystem-philosophy.md`](../architecture/02-ecosystem-philosophy.md).
- **Ghost Infrastructure Tracker — available.** A rendering-phase guardrail emits a warning when a key an author declared reaches a node and no template the bound Recipe declares reads it, so a value declared by the author and silently dropped by the template is named rather than lost. It is the rendering-phase half of the same shape-matching design. See [`errors/warnings.md`](errors/warnings.md#ghost-infrastructure-tracker-warnings).

The architecture chapters describe the design surfaces; this page tracks the implementation status.
