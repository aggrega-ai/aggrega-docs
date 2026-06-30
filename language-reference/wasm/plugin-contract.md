# Wasm plugin contract

Aggrega's compilation pipeline includes designated socket points where WebAssembly (Wasm) plugins extend the engine's behaviour: a Step 2 Mutation Gate, a Step 4 Validation Gate, a Step 5 Phase C plugin pipeline for FeatureRecipe execution, an out-of-band linting socket, and a planned provider-rendering socket. This page documents the public Wasm plugin contract: which sockets exist, what each socket consumes and produces, and where each socket sits in the compilation pipeline.

This page covers the *sockets* — the pipeline points and their input/output shapes. For the *plugin* — the `Plugin` entity, the per-export capability claims, the runtime limits, and the publish→pull→build lifecycle — see the [Wasm plugin developer guide](plugin-developer-guide.md).

Aggrega embeds a Wasm host runtime — Extism on top of the Wazero engine — that loads and executes plugins behind an AOT-purity firewall: the host denies runtime-access capabilities (network, filesystem, walltime, environment, stdio) so a plugin cannot break the compiler's ahead-of-time guarantees. A plugin's language runtime bootstraps against a deterministic, capability-denied WASI configuration — a fixed observable wall clock, zero entropy, discarded stdio, and no filesystem, argument, or environment access — so a guest observes nothing that varies across builds. Plugin authors target the host through the three-language PDK (Go, Rust, TypeScript). The first socket dispatched through the host in a shipping command is the **linter socket** — the standard publishing-linter, executed by [`aggrega lint`](../cli/aggrega-lint.md). The in-band build sockets (the Step 2 mutator, the Step 4 policy-validator, the Step 5 Phase C pipeline) are **accepted but inert**: their Go type definitions compile, and the policy-validator payload is assembled on every build, but `aggrega build` does not yet dispatch them through the host. See [Status of the Language → Compilation pipeline phases](../10-status.md#compilation-pipeline-phases).

## Pipeline placement of Wasm sockets

The compilation pipeline reserves the following socket points. The shape labels follow the four-label taxonomy from the Status page.

| Socket | Pipeline placement | Status today |
| --- | --- | --- |
| `mutator.wasm` | Step 2 (Topology Builder) | `accepted but inert` — types defined; no runtime invocation |
| `policy-validator.wasm` | Step 4 (Static Analyzer) | `accepted but inert` — types defined; payload assembled every build, never read |
| FeatureRecipe `pipeline:` plugins | Step 5 Phase C (Post-Render Mutation) | `accepted but inert` per Status page Phase C classification |
| Provider rendering plugins (e.g., `helm-renderer.wasm`) | Step 5 (Phase B engines) | `planned` — declared design target; native Go engines ship today |
| `linter.wasm` (publishing-linter) | Out-of-band (`aggrega lint`) | **available** — the publishing-linter ships and runs through the host via `aggrega lint` |

The annotation-driven Feature expansion sub-phase (Step 1) is a native Go pipeline pass, not a Wasm socket. It validates annotation values against the target Feature's `spec.schema` and injects synthetic Feature attachments at IR build time. See [`vocabulary/labels-and-annotations.md`](../vocabulary/labels-and-annotations.md) for the six annotation- and label-bearing surfaces and [`providers/well-known-annotations.md`](../providers/well-known-annotations.md) for the binding-shape and authoring teaching.

## Output shape contract — what exists today

Two sockets carry typed contract surfaces in the compiler today. Plugin authors implement guest-side code that produces the documented shapes; the host-side reader will consume them when the runtime is wired.

### `mutator.wasm` — JSONPatch output

**Pipeline placement.** Step 2 (Topology Builder), after IR graph construction but before the analyzer runs.

**Input shape (host → guest).** A `MutatorInput` document carrying:

- `compilation_context` — release identity (`release_name`, `environment`, `aggregate_name`).
- `graph` — a `MutatorGraph` projection of topology nodes with their compiler-assigned labels.

The graph is a labels-only projection (nodes carry their resolved label sets; the full IR graph stays inside the compiler).

**Output shape (guest → host).** A `MutatorOutput` document carrying:

- `patches` — an array of opaque JSONPatch documents (RFC 6902) that the host applies to the labels-only projection.

Each patch addresses a specific node's labels via [JSON Pointer (RFC 6901)](https://datatracker.ietf.org/doc/html/rfc6901); the host applies the patches in array order and re-ingests the mutated label set into the IR graph. The mutator's role is enterprise auto-tagging — adding compliance / observability / cost-attribution labels declared by enterprise policy without modifying catalog content. RFC 6901 is the path-grammar baseline for every document-path surface in Aggrega — the Wasm plugin contract here, plus `.locals` `*_path` exports, plus the `*Path` schema fields elsewhere in the corpus. See [`02-naming-conventions.md`](../02-naming-conventions.md) "Document-path naming-suffix discipline" for the canonical baseline declaration and the `*Path` / `*_path` suffix discipline that distinguishes the two authoring sides.

**Type definitions.** [`internal/compiler/topology/wasm_types.go`](../../../aggrega-cli/internal/compiler/topology/wasm_types.go) carries `MutatorInput`, `MutatorOutput`, `CompilationContext`, `MutatorGraph`, `MutatorNode`. [`internal/compiler/topology/doc.go`](../../../aggrega-cli/internal/compiler/topology/doc.go) explicitly documents the `accepted but inert` state: "contract definitions only — the Wasm plugin that consumes them has no production caller yet."

### `policy-validator.wasm` — PolicyResult array output

**Pipeline placement.** Step 4 (Static Analyzer), before Step 5 Phase B rendering. The analyzer assembles the input payload on every build via [`internal/compiler/analyzer/analyzer.go`](../../../aggrega-cli/internal/compiler/analyzer/analyzer.go) `assemblePolicyInput()`; today the result is computed but never consumed by Step 5.

**Input shape (host → guest).** A `PolicyValidatorInput` document carrying:

- `graph` — the full target-agnostic IR graph (the same shape the Topology Builder emits), with every node, edge, and attachment detail the compiler holds.
- `precalculated_paths` — the routing paths the analyzer enumerates alongside, so a policy can reason about reachability without re-walking the graph.

The graph is the versioned IR graph, single-sourced from the `ir-v1alpha1` schema; a policy plugin reasons over the complete topology and tracks the IR schema version like any other ABI it consumes. The IR shape is not secret — it is the same graph `aggrega inspect` emits — and secrets in it are pointers, never plaintext.

**Output shape (guest → host).** A `PolicyValidatorOutput` document carrying:

- `results` — an array of `PolicyResult` entries, each with `Pass` (boolean) and `Message` (string).

The host collects all rule results, halts the build with all failed-rule messages if any `Pass` is false, and continues to Step 5 only if every result passed. Policy plugins evaluate per-rule; one rejection halts the build.

**Type definitions.** [`internal/compiler/analyzer/wasm_types.go`](../../../aggrega-cli/internal/compiler/analyzer/wasm_types.go) carries `PolicyValidatorInput` (whose `Graph` field is the full IR graph), `PolicyValidatorOutput`, and `PolicyResult`. [`internal/compiler/analyzer/doc.go`](../../../aggrega-cli/internal/compiler/analyzer/doc.go) explicitly documents the `accepted but inert` state: PolicyInput is computed on every build but is not consumed by Step 5 today; the policy-validator Wasm runtime that would read it is not yet wired into the pipeline.

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

The architecture's Wasm Engine future implementation will replace native Go provider engines with Wasm rendering plugins. Each plugin's output is the same flat-YAML shape the native engine produces today; the contract is the same `Render` interface, but the implementation lives in a `.wasm` binary rather than Go code. Documented at [`architecture/13-catalog-and-registry.md`](../../architecture/13-catalog-and-registry.md) and tracked in roadmap.

**Status today:** `planned`. Native Go engines ship today (`helm`, `helm-chart`, `compose`); the Wasm-renderer transition is a planned future capability.

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
