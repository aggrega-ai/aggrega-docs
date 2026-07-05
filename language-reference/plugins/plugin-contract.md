# Wasm plugin contract

Aggrega's compilation pipeline includes designated socket points where WebAssembly (Wasm) plugins extend the engine's behaviour: a Step 2 Mutation Gate, a Step 4 Validation Gate, a Step 5 Phase C plugin pipeline for FeatureRecipe execution, an out-of-band linting socket, and a provider-rendering socket. This page documents the public Wasm plugin contract: which sockets exist, what each socket consumes and produces, where each socket sits in the compilation pipeline, and the sandbox every plugin executes inside.

This page covers the *sockets* — the pipeline points and their input/output shapes. For the *plugin* — the `Plugin` entity, the per-export capability claims, the runtime limits, and the publish→pull→build lifecycle — see the [Wasm plugin developer guide](plugin-developer-guide.md).

Aggrega embeds a Wasm host runtime — Extism on top of the Wazero engine — that loads and executes plugins behind an AOT-purity firewall: the host grants a guest zero ambient capability — no network, no filesystem, no environment, discarded stdio, an observable wall clock frozen to a build-invariant instant — so a plugin cannot break the compiler's ahead-of-time guarantees. The full capability surface — the import-module rule at load, the instantiation-time denials, and the curated host functions — is [the sandbox contract](#the-sandbox-contract) below. Plugin authors target the host through the three-language PDK (Go, Rust, TypeScript). The first socket dispatched through the host in a shipping command is the **linter socket** — the standard publishing-linter, executed by [`aggrega lint`](../cli/aggrega-lint.md). `aggrega build` dispatches two in-band build sockets when a workspace configures them: the Step 2 mutator and the Step 4 policy-validator. Both are no-ops when no plugin is attached, so a build with no socket configuration is unchanged. The Step 5 Phase C FeatureRecipe pipeline is **accepted but inert** — its Go type definitions compile, but `aggrega build` does not yet dispatch it through the host. See [Status of the Language → Compilation pipeline phases](../10-status.md#compilation-pipeline-phases).

## The sandbox contract

Every socket dispatches its plugin through the same host sandbox. The sandbox has two independent layers — a structural check at load and capability denial at instantiation — and together they define what a plugin can reach, what it cannot, and what it is responsible for.

**The import-module rule (load time).** The loader walks the plugin binary's import section and admits function imports only under three module namespaces: `wasi_snapshot_preview1` (the WASI preview-1 runtime a guest language runtime links against), `extism:host/env` (the Extism runtime ABI — the PDK's own memory and IO intrinsics), and `extism:host/user` (Aggrega's curated host functions). A guest may import **any function name** under an allowed module; an import under any other module names a surface the host does not provide, and the plugin is rejected at load with a diagnostic naming the module and the import. The rule deliberately does not censor individual WASI function names: a statically-linked language runtime imports filesystem and socket functions its live code paths never call — pulled in transitively by dependencies — and naming an import grants nothing. Capability denial at instantiation, not import censorship, is what guarantees no I/O.

**Zero ambient capability (instantiation).** The host instantiates the guest with real WASI behaviour and zero ambient authority:

- no filesystem — no preopened directories, so a filesystem call fails at the call boundary;
- no network sockets;
- an empty environment;
- discarded stdio — nothing the guest writes to stdout or stderr reaches the host's streams;
- a frozen observable wall clock, pinned to a build-invariant instant, so a guest reading the time cannot leak build time into its output;
- a real, advancing monotonic clock — a guest language runtime needs one to bootstrap, and monotonic time measures elapsed duration, not a wall-clock instant;
- real host entropy — pinned entropy would stabilise a language runtime's internal hash seed and mask guest nondeterminism instead of letting it surface as differing output;
- a single synthetic program name as argv.

An I/O call a guest actually makes — opening a file, dialing a socket — fails at the call boundary. This is WASI's own capability-based security model: the sandbox denies the capability rather than policing the code.

**Inputs arrive only through the payload and the curated host functions.** A plugin receives everything it renders or evaluates in the JSON payload its socket carries — graph and node projections, values, render context, and, for a sourced provider render, the source files themselves, read by the host at compile time and handed over as a source projection. Beyond the payload, the host binds exactly three curated host functions: `aggrega_log` (a log line on the host's log destination), `aggrega_emit_warning` (a structured warning the host surfaces after the call), and `aggrega_fetch_external_input` (the external-input fetch channel below). The host derives the set a plugin imports from its `.wasm` binary, validates it against the curated allowlist, and stamps it on the published entity's `spec.runtime.hostFunctions`, so every plugin's host surface is visible in the catalog.

**Determinism is the plugin author's responsibility.** The host consumes a guest's output bytes verbatim and runs no serializer over them, so the contract every plugin must uphold is: identical input produces identical output bytes. The sandbox removes the ambient sources of nondeterminism — wall time, environment, filesystem state — but deliberately does not mask the rest: a guest that encodes entropy or elapsed monotonic time into its output produces visibly differing bytes across runs rather than a stably-hidden defect.

**The external-input fetch channel.** `aggrega_fetch_external_input` is the one sanctioned channel for remote content, and it is host-mediated, not guest network access: the guest names a URL, and the host serves bytes under the external-input pin discipline. A URL pinned in the Release's lockfile is served from the local content-addressed store and verified against its recorded digest; an unpinned URL is fetched and pinned when acquisition is enabled, and refused with a diagnostic naming the URL and the remedy when the external-input set is frozen. The [developer guide](plugin-developer-guide.md) carries the authoring how-to and the acquisition workflow.

## Pipeline placement of Wasm sockets

The compilation pipeline reserves the following socket points. The shape labels follow the four-label taxonomy from the Status page.

| Socket | Pipeline placement | Status today |
| --- | --- | --- |
| `mutator.wasm` | Step 2 (Topology Builder) | **available** — dispatched when a workspace configures a mutator plugin; auto-tags node labels via JSON Patch |
| `policy-validator.wasm` | Step 4 (Static Analyzer) | **available** — dispatched when a workspace configures a policy plugin; a failed rule halts the build |
| FeatureRecipe `pipeline:` plugins | Step 5 Phase C (Post-Render Mutation) | `accepted but inert` per Status page Phase C classification |
| Provider rendering plugins (e.g., `helm-renderer.wasm`, `compose-renderer.wasm`) | Step 5 (Phase B engines) | **available for helm and compose** — those providers render through their Wasm engines when the catalog binds them; the other providers' engines are native Go |
| `linter.wasm` (publishing-linter) | Out-of-band (`aggrega lint`) | **available** — the publishing-linter ships and runs through the host via `aggrega lint` |

The annotation-driven Feature expansion sub-phase (Step 1) is a native Go pipeline pass, not a Wasm socket. It validates annotation values against the target Feature's `spec.schema` and injects synthetic Feature attachments at IR build time. See [`vocabulary/labels-and-annotations.md`](../vocabulary/labels-and-annotations.md) for the six annotation- and label-bearing surfaces and [`providers/well-known-annotations.md`](../providers/well-known-annotations.md) for the binding-shape and authoring teaching.

## Output shape contract — what exists today

Two sockets carry typed contract surfaces the compiler dispatches today. Plugin authors implement guest-side code that produces the documented shapes; the host reads them at build time, once per configured plugin, when a workspace attaches a plugin to the socket.

### `mutator.wasm` — JSONPatch output

**Pipeline placement.** Step 2 (Topology Builder), after IR graph construction but before the analyzer runs.

**Input shape (host → guest).** A `MutatorInput` document carrying:

- `compilation_context` — release identity (`release_name`, `environment`).
- `graph` — a `MutatorGraph` projection of topology nodes with their compiler-assigned labels.

The graph is a labels-only projection (nodes carry their resolved label sets; the full IR graph stays inside the compiler).

**Output shape (guest → host).** A `MutatorOutput` document carrying:

- `patches` — an array of opaque JSONPatch documents (RFC 6902) that the host applies to the labels-only projection.

Each patch addresses a specific node's labels via [JSON Pointer (RFC 6901)](https://datatracker.ietf.org/doc/html/rfc6901); the host applies the patches in array order and re-ingests the mutated label set into the IR graph. The mutator's role is enterprise auto-tagging — adding compliance / observability / cost-attribution labels declared by enterprise policy without modifying catalog content. The label surface is the mutator's only sanctioned target: a patch that touches a node field other than its labels, adds or removes a node, or sets a non-string label value halts the build rather than being silently absorbed. RFC 6901 is the path-grammar baseline for every document-path surface in Aggrega — the Wasm plugin contract here, plus `.locals` `*_path` exports, plus the `*Path` schema fields elsewhere in the corpus. See [`02-naming-conventions.md`](../02-naming-conventions.md) "Document-path naming-suffix discipline" for the canonical baseline declaration and the `*Path` / `*_path` suffix discipline that distinguishes the two authoring sides.

**Type definitions.** [`internal/compiler/topology/wasm_types_gen.go`](../../../aggrega-cli/internal/compiler/topology/wasm_types_gen.go) carries `MutatorInput`, `MutatorOutput`, `CompilationContext`, `MutatorGraph`, `MutatorNode`; [`internal/compiler/topology/mutator.go`](../../../aggrega-cli/internal/compiler/topology/mutator.go) carries the host-side assembler and patch application.

### `policy-validator.wasm` — PolicyResult array output

**Pipeline placement.** Step 4 (Static Analyzer), before Step 5 Phase B rendering. The analyzer assembles the input payload on every build via [`internal/compiler/analyzer/analyzer.go`](../../../aggrega-cli/internal/compiler/analyzer/analyzer.go) `assemblePolicyInput()`; when a workspace configures a policy plugin, the pipeline marshals that payload to the plugin and reads its verdicts back.

**Input shape (host → guest).** A `PolicyValidatorInput` document carrying:

- `graph` — the full target-agnostic IR graph (the same shape the Topology Builder emits), with every node, edge, and attachment detail the compiler holds.
- `precalculated_paths` — the routing paths the analyzer enumerates alongside, so a policy can reason about reachability without re-walking the graph.

The graph is the versioned IR graph, single-sourced from the `ir-v1alpha1` schema; a policy plugin reasons over the complete topology and tracks the IR schema version like any other ABI it consumes. The IR shape is not secret — it is the same graph `aggrega inspect` emits — and secrets in it are pointers, never plaintext.

**Output shape (guest → host).** A `PolicyValidatorOutput` document carrying:

- `results` — an array of `PolicyResult` entries, each with `Pass` (boolean) and `Message` (string).

The host collects all rule results, halts the build with all failed-rule messages if any `Pass` is false, and continues to Step 5 only if every result passed. Policy plugins evaluate per-rule; one rejection halts the build.

**Type definitions.** [`internal/compiler/analyzer/wasm_types.go`](../../../aggrega-cli/internal/compiler/analyzer/wasm_types.go) carries `PolicyValidatorInput` (whose `Graph` field is the full IR graph), `PolicyValidatorOutput`, and `PolicyResult`. The pipeline marshals the assembled `PolicyValidatorInput` to a configured policy plugin at Step 4 and appends each failed verdict to the analyzer's error set, so a rejection halts the build through the same gate a selector or `appliesTo` violation uses.

## Output shape contract — design targets

The architecture also names additional shapes that current code does not type yet. These are documented here so plugin authors building ahead of their availability know what's coming; the documentation does not imply current code support.

### Strategic Merge Patch (Phase C plugin pipeline)

FeatureRecipe `pipeline:` plugins running at Step 5 Phase C are designed to emit Strategic Merge Patches against the rendered AST. The host-side merger applies the patch to the relevant resource's spec — typically appending a sidecar container, mounting a secret volume, or rewriting an env var. The full handshake (JSON-in / JSONPatch-or-StrategicMergePatch-out) is documented at [`architecture/09-ai-features.md`](../../architecture/09-ai-features.md) and demonstrated at [`examples/04-secrets.md`](../examples/04-secrets.md).

**Status today:** `accepted but inert`. The schema accepts FeatureRecipe `pipeline:` arrays; the Phase C runtime that would execute them is not yet wired.

### Resource Generation (Phase C credential plugins)

Credential FeatureRecipe pipelines (Two-Part Plugin Principle: Fetcher + Injector) are designed to emit full Kubernetes resources alongside the patch — an `ExternalSecret` or `VaultSecret` CRD that the cluster fetches at runtime. The Fetcher's output is a complete resource; the Injector's output is a patch that mounts the resulting Kubernetes Secret. Documented at [`architecture/09-ai-features.md`](../../architecture/09-ai-features.md) and [`examples/04-secrets.md`](../examples/04-secrets.md).

**Status today:** `accepted but inert`.

### Step output (`pipeline:` step `outputs` map)

Phase C plugin steps are designed to publish named outputs that subsequent steps consume via `{{ .steps.<id>.outputs.<key> }}`. The output shape is provider-defined per plugin; the host-side rule is that step outputs are scoped to the same Recipe's pipeline and visible only to subsequent steps in declaration order. Documented at [`templates/expansion-matrix.md`](../templates/expansion-matrix.md) row 11.

**Status today:** `accepted but inert`.

### Provider rendering output (`helm-renderer.wasm` and friends)

A provider engine can be a Wasm rendering plugin instead of a native Go engine. Each plugin's output is the same flat-YAML shape the native engine produces; the contract is the same `Render` interface, but the implementation lives in a `.wasm` binary rather than Go code. A catalog binds a provider to its Wasm engine through a provider-rendering Plugin (`pluginType: provider`) that lists the provider name in its `compatibleProviders` and advertises a `render_node` export (and, for a provider that merges its per-node output into one artifact per boundary, an `assemble_boundary` export); the compiler then renders that provider's nodes through the Wasm engine, and a provider with no such Plugin renders through its native Go engine. Documented at [`architecture/13-catalog-and-registry.md`](../../architecture/13-catalog-and-registry.md) and tracked in roadmap.

**Status today:** the helm and compose providers ship Wasm rendering engines (`helm-renderer.wasm`, `compose-renderer.wasm`) that render byte-for-byte identically to their native Go engines: helm renders sourced charts and synthesized workloads; compose renders sourced compose files, synthesized workloads, and the merged per-boundary `docker-compose.yaml`. A catalog that includes either provider-rendering Plugin renders through its Wasm engine. The `helm-chart` provider renders through a native Go engine; its Wasm engine is planned.

### `linter.wasm` (publishing-linter)

The `linter.wasm` socket ships as the standard **publishing-linter**, an out-of-band gate that runs through `aggrega lint` rather than at compile time. It consumes a catalog entity (and, in `--pre-publish` mode, the entity's currently-published version) and returns a list of findings, each with a severity and a message; in `--pre-publish` mode it also returns a version-bump classification. The host dispatches it through the embedded Wasm runtime, behind the same AOT-purity firewall as every other socket. The full rule set, severities, and per-rule opt-outs are documented at [`cli/aggrega-lint.md`](../cli/aggrega-lint.md).

The linter is opt-in catalog discipline: the compiler does not run it during `aggrega build` (with the single exception of the `x-aggrega-*` discouragement advisory, which surfaces at warning severity during build and at error severity under `aggrega lint --pre-publish`). Because the rules live in a plugin, an enterprise can point `aggrega lint` at a different linter plugin to enforce its own discipline.

**Status today:** **available**. The publishing-linter ships and runs through the host via `aggrega lint`.

## Placement criterion: `linter.wasm` vs `policy-validator.wasm`

Two of the documented sockets share a similar surface — both consume a graph projection and emit per-rule results — but differ in pipeline placement and gating semantics. When both sockets ship, the criterion for deciding which socket carries a given check:

- **`policy-validator.wasm` (in-band, Step 4, mandatory).** Reserved for **build-halting policies**: a failed rule stops the compilation pipeline before Step 5 rendering runs. Use cases are policies whose violation makes the rendered output unsafe to apply: compliance gates (PCI / SOC2 boundary placement), topology invariants (zero-trust ingress, cross-boundary auth), credential-flow shape (no plaintext secrets in IR), etc. Failure produces `CATALOG_ERROR:`-shaped messages; the build does not produce artifacts.
- **`linter.wasm` (out-of-band, CI / IDE, advisory).** Reserved for **best-practice and discoverability checks**: rules whose violation is suspicious but not unsafe — orphaned secrets, unused parameters, deprecated label vocabulary, tag completeness for cost attribution, naming-convention drift. Failure produces advisory output; the build still produces artifacts.

The placement criterion phrased as a single rule: **if the check should halt the build, it belongs in `policy-validator.wasm`; if the check should warn an author or a reviewer without blocking the pipeline, it belongs in `linter.wasm`**.

The criterion matters once both sockets are usable. The `linter.wasm` socket ships today (the publishing-linter, run via `aggrega lint`); the `policy-validator.wasm` socket is typed but inert — its payload is assembled on every build, but `aggrega build` does not yet dispatch it. Authors with build-halting policies are targeting the policy-validator socket's eventual in-band activation; authors with advisory or publish-time checks can run them through the linter socket today.

## Design surfaces without current code anchors

Two design surfaces named elsewhere in the corpus do not have current code anchors today:

- **Additional output shapes.** Current code types three (JSONPatch via the mutator, a PolicyResult array via the policy-validator, and the linter's findings plus version-bump classification). The architecture chapters and worked examples describe further shapes (Strategic Merge Patch, Resource Generation, Step output, Provider rendering output) that do not carry Go type definitions in the compiler today.
- **Six Wasm-socket roles enumeration.** The current typed surface is three sockets (mutator, policy-validator, linter); the broader six-role design (adding helm-renderer, policy-formatter, fetcher/injector) is documented across architecture chapters but not centralized in a Go type registry.

The `linter.wasm` socket, previously listed here as design-only, now ships as the publishing-linter — a typed contract with host dispatch via `aggrega lint`.

The pipeline placement table at the top of this page reflects today's state plus the planned placements; readers interested in the full architectural design target should consult [`architecture/09-ai-features.md`](../../architecture/09-ai-features.md) and [`architecture/13-catalog-and-registry.md`](../../architecture/13-catalog-and-registry.md).

## Cross-references

- [`10-status.md#compilation-pipeline-phases`](../10-status.md#compilation-pipeline-phases) — Status page Phase C classification (Wasm plugin pipeline runtime readiness).
- [`architecture/09-ai-features.md`](../../architecture/09-ai-features.md) — Two-Part Plugin Principle for credential FeatureRecipes (Fetcher + Injector pattern).
- [`architecture/13-catalog-and-registry.md`](../../architecture/13-catalog-and-registry.md) — Wasm Engine target and provider-as-namespace OCI taxonomy.
- [`entities/featurerecipe.md`](../entities/featurerecipe.md) — FeatureRecipe `pipeline:` authoring surface.
- [`templates/expansion-matrix.md`](../templates/expansion-matrix.md) — Phase C `pipeline:` `with:` block template-evaluation rules and `.steps` access semantics.
- [`examples/04-secrets.md`](../examples/04-secrets.md) — worked credential FeatureRecipe with Fetcher + Injector pipeline shape.
- [`errors/error-translation.md`](../errors/error-translation.md) — error-translation discipline that future plugin guests participate in.
