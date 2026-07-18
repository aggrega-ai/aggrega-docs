# Wasm plugin contract

Aggrega's compilation pipeline includes designated socket points where WebAssembly (Wasm) plugins extend the engine's behaviour: a Step 2 Mutation Gate, a Step 4 Validation Gate, a Step 5 Phase C plugin pipeline for FeatureRecipe execution, an out-of-band linting socket, and a provider-rendering socket. This page documents the public Wasm plugin contract: which sockets exist, what each socket consumes and produces, where each socket sits in the compilation pipeline, and the sandbox every plugin executes inside.

This page covers the *sockets* — the pipeline points and their input/output shapes. For the *plugin* — the `Plugin` entity, the per-export capability claims, the runtime limits, and the publish→pull→build lifecycle — see the [Wasm plugin developer guide](plugin-developer-guide.md).

Aggrega embeds a Wasm host runtime — Extism on top of the Wazero engine — that loads and executes plugins behind an AOT-purity firewall: the host grants a guest zero ambient capability — no network, no filesystem, no environment, discarded stdio, an observable wall clock frozen to a build-invariant instant — so a plugin cannot break the compiler's ahead-of-time guarantees. The full capability surface — the import-module rule at load, the instantiation-time denials, and the curated host functions — is [the sandbox contract](#the-sandbox-contract) below. Plugin authors target the host through the three-language PDK (Go, Rust, TypeScript). The first socket dispatched through the host in a shipping command is the **linter socket** — the standard publishing-linter, executed by [`aggrega lint`](../cli/aggrega-lint.md). `aggrega build` dispatches two in-band build sockets when a workspace configures them: the Step 2 mutator and the Step 4 policy. Both are no-ops when no plugin is attached, so a build with no socket configuration is unchanged. The Step 5 Phase C FeatureRecipe pipeline is **accepted but inert** — its Go type definitions compile, but `aggrega build` does not yet dispatch it through the host. See [Status of the Language → Compilation pipeline phases](../10-status.md#compilation-pipeline-phases).

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

**Inputs arrive only through the payload and the curated host functions.** A plugin receives everything it renders or evaluates in the JSON payload its socket carries — graph and node projections, values, and render context. For a sourced provider render, the payload carries a **source listing** rather than the source bytes: a sorted set of `{path, is_dir}` entries under the node's source root, with no provider-layout interpretation by the host. The guest applies its own layout logic — select the single compose file, descend to a chart root, require a `Chart.yaml`, vendor a module recursively — and reads back exactly the slice it selects through a host callback. Beyond the payload, the host binds a curated, least-privilege set of host functions, and grants a plugin exactly the ones its binary imports:

- `aggrega_log` — a log line on the host's log destination.
- `aggrega_emit_warning` — a structured warning the host surfaces after the call.
- `aggrega_fetch_external_input` — the external-input fetch channel (below).
- `aggrega_pack_source` — the source-selection callback: the guest names a `{file | dir | tree, path}` selection under the source root and the host reads and packs exactly that under a sandbox that resolves paths under the root and rejects `..`.
- `aggrega_read_source_file` — a single-file content read under the same sandbox, for content-dependent source selection.

The host derives the set a plugin imports from its `.wasm` binary, validates it against the curated allowlist, cross-checks it against the host functions the guest's `describe()` declares, and stamps it on the published entity's `spec.runtime.hostFunctions`, so every plugin's host surface is visible in the catalog and cannot drift from the binary.

**Determinism is the plugin author's responsibility.** The host consumes a guest's output bytes verbatim and runs no serializer over them, so the contract every plugin must uphold is: identical input produces identical output bytes. The sandbox removes the ambient sources of nondeterminism — wall time, environment, filesystem state — but deliberately does not mask the rest: a guest that encodes entropy or elapsed monotonic time into its output produces visibly differing bytes across runs rather than a stably-hidden defect.

**The external-input fetch channel.** `aggrega_fetch_external_input` is the one sanctioned channel for remote content, and it is host-mediated, not guest network access: the guest names a URL, and the host serves bytes under the external-input pin discipline. A URL pinned in the Release's lockfile is served from the local content-addressed store and verified against its recorded digest; an unpinned URL is fetched and pinned when acquisition is enabled, and refused with a diagnostic naming the URL and the remedy when the external-input set is frozen. The [developer guide](plugin-developer-guide.md) carries the authoring how-to and the acquisition workflow.

## Pipeline placement of Wasm sockets

The compilation pipeline reserves the following socket points. The shape labels follow the four-label taxonomy from the Status page.

| Socket | Pipeline placement | Status today |
| --- | --- | --- |
| `mutator.wasm` | Step 2 (Topology Builder) | **available** — dispatched when a workspace configures a mutator plugin; auto-tags node labels via JSON Patch |
| `policy.wasm` | Step 4 (Static Analyzer, `ir` stage) or post-render (`render` stage) | **available** — dispatched when a workspace configures a policy plugin; a `deny` verdict halts the build |
| FeatureRecipe `pipeline:` plugins | Step 5 Phase C (Post-Render Mutation) | `accepted but inert` per Status page Phase C classification |
| Provider rendering plugins (helm, helm-chart, compose, terraform) | Step 5 (Phase B engines) | **available** — every provider renders through its Wasm guest; rendering is Wasm-only, with no native Go engine fallback |
| `linter.wasm` (publishing-linter) | Out-of-band (`aggrega lint`) | **available** — the publishing-linter ships and runs through the host via `aggrega lint` |

The annotation-driven Feature expansion sub-phase (Step 1) is a native Go pipeline pass, not a Wasm socket. It validates annotation values against the target Feature's `spec.schema` and injects synthetic Feature attachments at IR build time. See [`vocabulary/labels-and-annotations.md`](../vocabulary/labels-and-annotations.md) for the six annotation- and label-bearing surfaces and [`providers/well-known-annotations.md`](../providers/well-known-annotations.md) for the binding-shape and authoring teaching.

## Output shape contract — what exists today

Two sockets carry typed contract surfaces the compiler dispatches today. Plugin authors implement guest-side code that produces the documented shapes; the host reads them at build time, once per configured plugin, when a workspace attaches a plugin to the socket.

### `mutator.wasm` — JSONPatch output

**Pipeline placement.** Step 2 (Topology Builder), after IR graph construction but before the analyzer runs.

**Input shape (host → guest).** A `MutatorInput` document carrying:

- `compilation_context` — release identity (`release_name`, `environment`).
- `graph` — a `MutatorGraph` projection of topology nodes with their compiler-assigned labels.
- `settings` — the free-form settings object the attachment declared under `with.settings`, handed to the guest verbatim.
- `sources` — the definition files the attachment declared under `with.sources`, each carrying its base-name path and content, so a mutator can be driven by a checked-in rules or mapping file rather than inline settings.

The graph is a labels-only projection (nodes carry their resolved label sets; the full IR graph stays inside the compiler). `settings` and `sources` are the same engine-agnostic `with` channel the policy socket reads; the host passes them through and never interprets their content. Because a mutator's output shapes the build, the attachment's settings and source content are pinned in the release lockfile at pull and reconstructed from it at build, so the mutator input is invariant to a post-pull change to either until the next pull.

**Output shape (guest → host).** A `MutatorOutput` document carrying:

- `patches` — an array of opaque JSONPatch documents (RFC 6902) that the host applies to the labels-only projection.

Each patch addresses a specific node's labels via [JSON Pointer (RFC 6901)](https://datatracker.ietf.org/doc/html/rfc6901); the host applies the patches in array order and re-ingests the mutated label set into the IR graph. The mutator's role is enterprise auto-tagging — adding compliance / observability / cost-attribution labels declared by enterprise policy without modifying catalog content. The label surface is the mutator's only sanctioned target: a patch that touches a node field other than its labels, adds or removes a node, or sets a non-string label value halts the build rather than being silently absorbed. RFC 6901 is the path-grammar baseline for every document-path surface in Aggrega — the Wasm plugin contract here, plus `.locals` `*_path` exports, plus the `*Path` schema fields elsewhere in the corpus. See [`02-naming-conventions.md`](../02-naming-conventions.md) "Document-path naming-suffix discipline" for the canonical baseline declaration and the `*Path` / `*_path` suffix discipline that distinguishes the two authoring sides.

**Type definitions.** [`internal/compiler/topology/wasm_types_gen.go`](../../../aggrega-cli/internal/compiler/topology/wasm_types_gen.go) carries `MutatorInput`, `MutatorOutput`, `CompilationContext`, `MutatorGraph`, `MutatorNode`; [`internal/compiler/topology/mutator.go`](../../../aggrega-cli/internal/compiler/topology/mutator.go) carries the host-side assembler and patch application.

### `policy.wasm` — verdict array output

A policy guest inspects a build and returns a list of verdicts; the host acts on
each verdict's severity and never interprets the policy itself. The full
treatment — stages, severities, the operator-supplied input channel, wrapping a
foreign policy engine, the reference guests, and how an operator attaches a
policy — is on the [policy socket page](policy-socket.md). This section records
the pipeline placement and the typed wire shapes.

**Pipeline placement.** A policy plugin declares exactly one stage in its `describe()` self-report:

- `ir` — evaluated at Step 4 (Static Analyzer), before Step 5 Phase B rendering. The analyzer assembles the payload on every build via [`internal/compiler/analyzer/analyzer.go`](../../../aggrega-cli/internal/compiler/analyzer/analyzer.go) `assemblePolicyInput()`.
- `render` — evaluated after render, over the emitted artifacts.

When a workspace configures a policy plugin, the pipeline marshals the stage's payload to the plugin and reads its verdicts back.

**Input shape (host → guest).** The stage selects the payload:

- The `ir`-stage `PolicyInput` carries `graph` — the full capability-agnostic IR graph (the same shape the Topology Builder emits), with every node, edge, and attachment detail the compiler holds — and `precalculated_paths`, the routing paths the analyzer enumerates alongside, so a policy can reason about reachability without re-walking the graph. The graph is the versioned IR graph, single-sourced from the `ir-v1alpha1` schema; the IR shape is not secret (it is the same graph `aggrega inspect` emits) and secrets in it are pointers, never plaintext.
- The `render`-stage `RenderPolicyInput` carries `artifacts` — the rendered output files as a `{path, content}` list sorted by path, so the wire is byte-identical across runs of identical input.

Both stages additionally carry the attachment's `sources` (policy-definition files the host reads at build time and hands the guest verbatim, paths as base names, content opaque) and `settings` (a free-form object handed through untouched). Both are absent when the attachment declares none.

**Output shape (guest → host).** A `PolicyOutput` document carrying:

- `results` — an array of `PolicyResult` entries, each with a `severity` (`deny`, `warn`, or `audit`) and a `message` string.

Only fired verdicts appear; an allowing evaluation returns an empty array. The host walks the verdicts and maps each severity to an action: `deny` halts the build (surfacing every `deny` message), `warn` flags the verdict and lets the build proceed, `audit` records it without affecting the outcome. A `deny` halts through the same gate a selector or `appliesTo` violation uses.

**Type definitions.** [`internal/compiler/analyzer/wasm_types.go`](../../../aggrega-cli/internal/compiler/analyzer/wasm_types.go) carries `PolicyInput` (IR stage) and `RenderPolicyInput` (render stage), the shared `PolicySource`, `PolicyOutput`, `PolicyResult`, and the `deny` / `warn` / `audit` severity constants.

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

### Provider rendering — the guest-driven socket

A provider is a Wasm guest. Rendering is Wasm-only: a Recipe's `target:` name resolves to the provider-rendering Plugin (`pluginType: provider`) that lists the name in its `targets` and advertises a `render_node` export, and that plugin's guest renders the node. There is no native Go engine to fall back to; a provider name that resolves to no serving Plugin halts the build at routing time. Adding a standard provider is shipping a `.wasm` guest and a catalog `Plugin` entity — the host carries no per-provider code.

The host is a generic router. It reads the guest's `describe()` self-report — including a **capabilities block** — and dispatches the guest's exports without understanding any provider format. The capabilities block drives dispatch as data:

- `input_kinds` (`sourced`, `synthesized`, `artifacts_standalone`) — which Recipe input kinds the guest renders; the host gates a node's input kind against this set.
- `boundary_assembly` (`none` | `merge` | `nest`) — how the guest combines a dispatch group's output: `merge` classifies per-node output as fragments the assembler merges into one artifact, `nest` nests per-node files under an assembled wrapper, `none` writes each node's output directly.
- `artifact_delimiters` (optional) — the Go-template delimiter pair the guest applies to artifact bodies.
- `reusable_instance` (optional) — whether one loaded instance may serve every crossing of the build (see [Determinism and instance reuse](#determinism-and-instance-reuse) below).

The socket is a fixed export set — one mandatory, the rest optional and advertised in `describe()`:

- `render_node` (mandatory) — render one IR node into provider-native files.
- `assemble_boundary` (optional) — merge a dispatch group's per-node output into one artifact per path (present when `boundary_assembly` is `merge` or `nest`).
- `validate_node_input` (optional) — structural pre-render validation of a node's input; an error-severity diagnostic halts the build, a warning surfaces to the build result.
- `carve` / `reassemble` (optional, paired) — the guest's own byte-faithful patch codec for post-render pipeline steps, used only when both are advertised.
- `boundary_env_overrides` (optional) — the guest computes per-consumer boundary environment overrides the host then applies.

Recipe `artifacts:` fold into `render_node` through an artifacts projection on the input: the host does the `$import` read, the Go-template evaluation, and the provenance key/value computation, and hands the guest each entry already read and evaluated; the guest owns placement and emission in the format only it knows. Documented at [`architecture/13-catalog-and-registry.md`](../../architecture/13-catalog-and-registry.md).

**Status today:** **available** for all four providers. The helm guest renders sourced charts (resolving the chart root), synthesized workloads, and standalone artifacts as flat Kubernetes manifests. The helm-chart guest assembles an umbrella chart, nesting each node's sourced chart as a sub-chart, and carries a byte-faithful patch codec and bracket (`[[ ]]`) artifact delimiters. The compose guest renders sourced compose files and synthesized workloads and merges a dispatch group into one `docker-compose.yaml`, and bridges cross-network consumers through a gateway. The terraform guest emits Terraform configuration verbatim (HCL or JSON) or vendors a sourced module with a `.tfvars.json` overlay, and validates a sourced module's HCL structurally before render. Each renders offline and deterministically.

#### Determinism and instance reuse

The host consumes a guest's output bytes verbatim, so a guest must produce identical output from identical input. By default a guest is loaded fresh per node — zero state carried across nodes by construction. A guest that self-declares `reusable_instance` is instead loaded once per build and its single instance serves every crossing, which recovers the dominant per-node instantiation cost. Because reuse is safe only for a stateless guest, `aggrega build --verify-determinism` renders each node twice through the same instance and halts the build if any node's two renders differ; the default build renders once and trusts the declaration. The Wasm compilation cache is disk-backed and process-wide, so a guest compiles once and warm builds skip recompilation.

### `linter.wasm` (publishing-linter)

The `linter.wasm` socket ships as the standard **publishing-linter**, an out-of-band gate that runs through `aggrega lint` rather than at compile time. It consumes a catalog entity (and, in `--pre-publish` mode, the entity's currently-published version) and returns a list of findings, each with a severity and a message; in `--pre-publish` mode it also returns a version-bump classification. The host dispatches it through the embedded Wasm runtime, behind the same AOT-purity firewall as every other socket. The full rule set, severities, and per-rule opt-outs are documented at [`cli/aggrega-lint.md`](../cli/aggrega-lint.md).

The linter is opt-in catalog discipline: the compiler does not run it during `aggrega build` (with the single exception of the `x-aggrega-*` discouragement advisory, which surfaces at warning severity during build and at error severity under `aggrega lint --pre-publish`). Because the rules live in a plugin, an enterprise can point `aggrega lint` at a different linter plugin to enforce its own discipline.

**Status today:** **available**. The publishing-linter ships and runs through the host via `aggrega lint`.

## Placement criterion: `linter.wasm` vs `policy.wasm`

Two of the documented sockets share a similar surface — both emit per-rule results — but differ in pipeline placement and gating semantics. The criterion for deciding which socket carries a given check:

- **`policy.wasm` (in-band, build-halting).** Reserved for **build-halting policies**: a `deny` verdict stops the compilation pipeline and the build produces no artifacts. Use cases are policies whose violation makes the output unsafe to apply: compliance gates (PCI / SOC2 boundary placement), topology invariants (zero-trust ingress, cross-boundary auth), credential-flow shape (no plaintext secrets in IR), etc. A policy reasons over the IR graph (`ir` stage, before render) or the rendered artifacts (`render` stage, after render).
- **`linter.wasm` (out-of-band, CI / IDE, advisory).** Reserved for **best-practice and discoverability checks**: rules whose violation is suspicious but not unsafe — orphaned secrets, unused parameters, deprecated label vocabulary, tag completeness for cost attribution, naming-convention drift. Failure produces advisory output; the build still produces artifacts.

The placement criterion phrased as a single rule: **if the check should halt the build, it belongs in `policy.wasm`; if the check should warn an author or a reviewer without blocking the pipeline, it belongs in `linter.wasm`**.

Both sockets are usable today. The `linter.wasm` socket runs the publishing-linter via `aggrega lint`; the `policy.wasm` socket is dispatched in-band during `aggrega build` when a workspace attaches a policy plugin. Note that the policy socket carries its own severities — a policy may itself emit `warn` and `audit` verdicts that advise without halting — so the halt-versus-advise line above is the placement guidance for whole checks, not a claim that a policy can only halt. See the [policy socket page](policy-socket.md) for the severity model.

## Design surfaces without current code anchors

Two design surfaces named elsewhere in the corpus do not have current code anchors today:

- **Additional output shapes.** Current code types the mutator's JSONPatch output, the policy socket's PolicyResult array, the linter's findings plus version-bump classification, and the provider render socket's node output and artifacts. The architecture chapters and worked examples describe further FeatureRecipe-pipeline shapes (Strategic Merge Patch, Resource Generation, Step output) that do not carry Go type definitions in the compiler today.
- **Six Wasm-socket roles enumeration.** The current typed surface is three sockets (mutator, policy, linter); the broader six-role design (adding helm-renderer, policy-formatter, fetcher/injector) is documented across architecture chapters but not centralized in a Go type registry.

The `linter.wasm` socket, by contrast, is fully anchored in current code: it is the publishing-linter, a typed contract with host dispatch via `aggrega lint`.

The pipeline placement table at the top of this page reflects today's state plus the planned placements; readers interested in the full architectural design target should consult [`architecture/09-ai-features.md`](../../architecture/09-ai-features.md) and [`architecture/13-catalog-and-registry.md`](../../architecture/13-catalog-and-registry.md).

## Cross-references

- [`policy-socket.md`](policy-socket.md) — the comprehensive policy-socket treatment: stages, verdict severities, the operator input channel, wrapping a foreign policy engine, and the reference guests.
- [`10-status.md#compilation-pipeline-phases`](../10-status.md#compilation-pipeline-phases) — Status page Phase C classification (Wasm plugin pipeline runtime readiness).
- [`architecture/09-ai-features.md`](../../architecture/09-ai-features.md) — Two-Part Plugin Principle for credential FeatureRecipes (Fetcher + Injector pattern).
- [`architecture/13-catalog-and-registry.md`](../../architecture/13-catalog-and-registry.md) — Wasm Engine target and provider-as-namespace OCI taxonomy.
- [`entities/featurerecipe.md`](../entities/featurerecipe.md) — FeatureRecipe `pipeline:` authoring surface.
- [`templates/expansion-matrix.md`](../templates/expansion-matrix.md) — Phase C `pipeline:` `with:` block template-evaluation rules and `.steps` access semantics.
- [`examples/04-secrets.md`](../examples/04-secrets.md) — worked credential FeatureRecipe with Fetcher + Injector pipeline shape.
- [`errors/error-translation.md`](../errors/error-translation.md) — error-translation discipline that future plugin guests participate in.
