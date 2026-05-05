# Wasm plugin contract

Aggrega's compilation pipeline includes designated socket points where WebAssembly (Wasm) plugins extend the engine's behaviour: a Step 2 Mutation Gate, a Step 4 Validation Gate, a Step 5 Phase C plugin pipeline for FeatureRecipe execution, and other planned sockets for provider rendering and out-of-band linting. This page documents the public Wasm plugin contract: which sockets exist, what each socket consumes and produces, and where each socket sits in the compilation pipeline.

The contract is the authoring surface that future plugin authors target. The runtime that invokes plugins is **`accepted but inert`** today — see [Status of the Language → Compilation pipeline phases](../10-status.md#compilation-pipeline-phases) — so the documented shapes describe the design contract rather than a hot dispatch path. The two existing typed sockets (mutator, policy-validator) carry stable Go type definitions that compile and assemble payloads on every build; no guest is invoked.

## Pipeline placement of Wasm sockets

The compilation pipeline reserves the following socket points. The shape labels follow the four-label taxonomy from the Status page.

| Socket | Pipeline placement | Status today |
| --- | --- | --- |
| `mutator.wasm` | Step 2 (Topology Builder) | `accepted but inert` — types defined; no runtime invocation |
| `policy-validator.wasm` | Step 4 (Static Analyzer) | `accepted but inert` — types defined; payload assembled every build, never read |
| FeatureRecipe `pipeline:` plugins | Step 5 Phase C (Post-Render Mutation) | `accepted but inert` per Status page Phase C classification |
| Provider rendering plugins (e.g., `helm-renderer.wasm`) | Step 5 (Phase B engines) | `planned` — declared design target; native Go engines ship today |
| `linter.wasm` (out-of-band) | Outside the build (CI gate / IDE) | `planned` — no contract types defined in code today |
| Annotation-binding expansion | Step 1, alongside Layer-2 validation | `accepted but inert` per Status page |

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

Each patch addresses a specific node's labels via JSON Pointer; the host applies the patches in array order and re-ingests the mutated label set into the IR graph. The mutator's role is enterprise auto-tagging — adding compliance / observability / cost-attribution labels declared by enterprise policy without modifying catalog content.

**Type definitions.** [`internal/compiler/topology/wasm_types.go`](../../../aggrega-cli/internal/compiler/topology/wasm_types.go) carries `MutatorInput`, `MutatorOutput`, `CompilationContext`, `MutatorGraph`, `MutatorNode`. [`internal/compiler/topology/doc.go`](../../../aggrega-cli/internal/compiler/topology/doc.go) explicitly documents the `accepted but inert` state: "contract definitions only — the Wasm plugin that consumes them has no production caller yet."

### `policy-validator.wasm` — PolicyResult array output

**Pipeline placement.** Step 4 (Static Analyzer), before Step 5 Phase B rendering. The analyzer assembles the input payload on every build via [`internal/compiler/analyzer/analyzer.go`](../../../aggrega-cli/internal/compiler/analyzer/analyzer.go) `assemblePolicyInput()`; today the result is computed but never consumed by Step 5.

**Input shape (host → guest).** A `PolicyValidatorInput` document carrying:

- `graph` — a `PolicyGraph` projection with per-node `Component`, `ResolvedVersion`, `Labels`, `Features`, plus per-edge data including `OriginFeature` markers (which feature attachment, if any, synthesised the edge).

The graph carries enough surface to evaluate compliance / topological / feature-attachment policies without exposing the full IR.

**Output shape (guest → host).** A `PolicyValidatorOutput` document carrying:

- `results` — an array of `PolicyResult` entries, each with `Pass` (boolean) and `Message` (string).

The host collects all rule results, halts the build with all failed-rule messages if any `Pass` is false, and continues to Step 5 only if every result passed. Policy plugins evaluate per-rule; one rejection halts the build.

**Type definitions.** [`internal/compiler/analyzer/wasm_types.go`](../../../aggrega-cli/internal/compiler/analyzer/wasm_types.go) carries `PolicyValidatorInput`, `PolicyGraph`, `PolicyNode`, `PolicyEdge`, `PolicyValidatorOutput`, `PolicyResult`. [`internal/compiler/analyzer/doc.go`](../../../aggrega-cli/internal/compiler/analyzer/doc.go) explicitly documents the `accepted but inert` state: "PolicyInput is computed on every build but is not consumed by Step 5 today; the policy-validator Wasm runtime that would read them is not yet wired into the pipeline."

## Output shape contract — design targets

The architecture also names additional shapes that current code does not type yet. These are documented here so plugin authors targeting a future shipping milestone know what's coming; the documentation does not imply current code support.

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

**Status today:** `planned`. Native Go engines ship today (`helm`, `helm-chart`, `compose`); the Wasm-renderer transition is a future milestone.

### `linter.wasm` (out-of-band)

The `linter.wasm` socket is a planned out-of-band gate intended to run as part of CI / IDE integration rather than at compile time. The contract surface is not declared in current code — no types, no host-side dispatch — but the design intent is documented at [`architecture/13-catalog-and-registry.md`](../../architecture/13-catalog-and-registry.md). The output shape is expected to be a list of advisory results (warnings, info-level diagnostics) rather than build-halting rule failures.

**Status today:** `planned`. No contract types defined in code; the socket is a design target with no implementation.

## Placement criterion: `linter.wasm` vs `policy-validator.wasm`

Two of the documented sockets share a similar surface — both consume a graph projection and emit per-rule results — but differ in pipeline placement and gating semantics. When both sockets ship, the criterion for deciding which socket carries a given check:

- **`policy-validator.wasm` (in-band, Step 4, mandatory).** Reserved for **build-halting policies**: a failed rule stops the compilation pipeline before Step 5 rendering runs. Use cases are policies whose violation makes the rendered output unsafe to apply: compliance gates (PCI / SOC2 boundary placement), topology invariants (zero-trust ingress, cross-boundary auth), credential-flow shape (no plaintext secrets in IR), etc. Failure produces `CATALOG_ERROR:`-shaped messages; the build does not produce artifacts.
- **`linter.wasm` (out-of-band, CI / IDE, advisory).** Reserved for **best-practice and discoverability checks**: rules whose violation is suspicious but not unsafe — orphaned secrets, unused parameters, deprecated label vocabulary, tag completeness for cost attribution, naming-convention drift. Failure produces advisory output; the build still produces artifacts.

The placement criterion phrased as a single rule: **if the check should halt the build, it belongs in `policy-validator.wasm`; if the check should warn an author or a reviewer without blocking the pipeline, it belongs in `linter.wasm`**.

The criterion matters only when both sockets ship. Today only `policy-validator.wasm` is typed (and inert); `linter.wasm` is design target only. Authors targeting a future shipping milestone use the criterion to choose the socket; authors writing custom enterprise policies today have only the `policy-validator.wasm` typed surface, and the runtime that would execute either socket is not yet wired.

## What the audit framing names that does not exist in code

Three items from the audit-other-findings framing for finding 3.14 do not have current code anchors:

- **Six output shapes.** Current code defines two (JSONPatch via mutator, PolicyResult array via policy-validator). The architecture chapters and worked examples describe additional shapes (Strategic Merge Patch, Resource Generation, Step output, Provider rendering output) but those don't carry Go type definitions in the compiler today.
- **`linter.wasm` socket.** No types, no host-side dispatch, no test fixtures. The placement criterion above is forward-looking design guidance; today's authoring surface has only `policy-validator.wasm`.
- **Six Wasm-socket roles enumeration.** The current typed surface is two sockets; the broader six-role design (mutator, policy-validator, linter, helm-renderer, policy-formatter, fetcher/injector) is documented across architecture chapters but not centralized in a Go type registry.

The pipeline placement table at the top of this page reflects today's state plus the planned placements; readers interested in the full architectural design target should consult [`architecture/09-ai-features.md`](../../architecture/09-ai-features.md) and [`architecture/13-catalog-and-registry.md`](../../architecture/13-catalog-and-registry.md).

## Cross-references

- [`10-status.md#compilation-pipeline-phases`](../10-status.md#compilation-pipeline-phases) — Status page Phase C classification (Wasm plugin pipeline runtime readiness).
- [`architecture/09-ai-features.md`](../../architecture/09-ai-features.md) — Two-Part Plugin Principle for credential FeatureRecipes (Fetcher + Injector pattern).
- [`architecture/13-catalog-and-registry.md`](../../architecture/13-catalog-and-registry.md) — Wasm Engine target and provider-as-namespace OCI taxonomy.
- [`entities/featurerecipe.md`](../entities/featurerecipe.md) — FeatureRecipe `pipeline:` authoring surface.
- [`templates/expansion-matrix.md`](../templates/expansion-matrix.md) — Phase C `pipeline:` `with:` block template-evaluation rules and `.steps` access semantics.
- [`examples/04-secrets.md`](../examples/04-secrets.md) — worked credential FeatureRecipe with Fetcher + Injector pipeline shape.
- [`errors/error-translation.md`](../errors/error-translation.md) — error-translation discipline that future plugin guests participate in.
