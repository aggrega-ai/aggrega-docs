# Error translation discipline

Aggrega's compilation pipeline emits errors from many surfaces — schema validators, the resolver, the IR builder, the per-provider engines, the Go template engine, and the underlying YAML / Helm / docker-compose libraries the engines wrap. Some errors come through with an Aggrega-attributable prefix that signals which catalog entity is at fault; others come through verbatim from the underlying library. This page documents which surfaces produce which kind so authors can interpret error output correctly and so reviewers know where the error-translation discipline is uniform and where it relies on context wrapping.

For the full per-error catalog (every fatal halt the compiler emits, with how-to-fix guidance), see [`fatal-halts.md`](fatal-halts.md). For the four schema-validation layers and how their error shapes interact, see [`vocabulary/validation-surface.md`](../vocabulary/validation-surface.md).

## Aggrega-prefixed sentinels — what ships today

Two sentinel prefixes are currently emitted by the compiler:

### `CATALOG_ERROR:`

Attributes the failure to the catalog entity — the Recipe, FeatureRecipe, Provider, Component, Feature, Manifest, or the bound chain among them. The author's fix is in the catalog content, not in the developer's Aggregate or Release.

**Emit surfaces:**

- [`pkg/validator/recipe_validate_errors.go`](../../../aggrega-cli/pkg/validator/recipe_validate_errors.go) — Recipe shape rules (rules 1–7) and Recipe / Provider binding errors at load time.
- [`pkg/validator/workload_validate_errors.go`](../../../aggrega-cli/pkg/validator/workload_validate_errors.go) — Workload schema unification and `secretsSchema` cross-check failures.
- [`internal/compiler/renderer/synthesis.go`](../../../aggrega-cli/internal/compiler/renderer/synthesis.go) — provider capability mismatches (a Recipe declaring `workload:` against a provider that doesn't implement `WorkloadSynthesizer`).
- [`internal/compiler/renderer/phase_b_subpasses.go`](../../../aggrega-cli/internal/compiler/renderer/phase_b_subpasses.go) — Phase B placeholders for catalog content not yet implemented (e.g., `artifacts:` evaluation).

The validator package builds structured `RecipeValidationError` / `WorkloadValidationError` wrappers that format multi-line messages with rule IDs, suggestions, and the catalog file path. The shape is uniform across rules — see [`fatal-halts.md` Recipe shape rules](fatal-halts.md#recipe-shape-rules) for the canonical examples.

### `TRANSLATION_ERROR:`

Attributes the failure to the per-provider synthesis pass — the helm or compose engine attempting to translate a Workload, valuesMapping output, or sourced overlay into provider-native artifacts. The fix is typically in the Workload's `services` / `containers` / `volumes` shape, the Recipe's `valuesMapping` template output, or the source-mode overlay structure.

**Emit surfaces:**

- [`internal/compiler/renderer/helm/workload_synth.go`](../../../aggrega-cli/internal/compiler/renderer/helm/workload_synth.go) — helm probe port resolution; service-to-container port name mismatches; container-name collisions.
- [`internal/compiler/renderer/compose/errors.go`](../../../aggrega-cli/internal/compiler/renderer/compose/errors.go) — compose probe port resolution; probe shape validation; configmap volume artifact emission gaps.
- [`internal/compiler/renderer/compose/release_compose.go`](../../../aggrega-cli/internal/compiler/renderer/compose/release_compose.go) — compose Release-level merge: service-name collisions across boundaries.

The shape is per-engine but uniform within each engine — see [`fatal-halts.md`](fatal-halts.md) for the canonical examples grouped by engine.

## Surfaces that do **not** carry an Aggrega prefix today

A subset of errors come through wrapped only by a per-engine context prefix (e.g., `helm: node "<id>": ...`, `compose: node "<id>": ...`) without a sentinel like `CATALOG_ERROR:` or `TRANSLATION_ERROR:`. These are typically library-native errors the engine catches and re-raises with positional context but no further classification:

- **Helm SDK errors** during chart loading (`loader.Load()`), values coalescing (`chartutil.CoalesceValues()`), and template rendering (`engine.Render()`). These come through as `"helm: node %q: %w"` wrappers around the SDK's native error. Examples: malformed `Chart.yaml`, missing chart dependencies, Helm template syntax errors inside the chart's `templates/` directory.
- **docker-compose YAML parser errors** during sourced-mode merge — base file load, overlay parse, deep-merge marshal. These come through as `"compose: node %q: %w"` wrappers.
- **File I/O errors** — chart directory not found, source path unreadable, Workload file at `workloadFrom:` path missing or unreadable. Wrapped with the engine's positional prefix without a sentinel.
- **Phase B sub-pass progression errors** that surface mid-pipeline — wrapped as `"Phase B.X node %q: %w"` to localize which phase rejected the input. The wrapping carries no `<NAME>_ERROR:` sentinel today.

The discipline today: Aggrega-prefixed sentinels signal failures the catalog or developer authoring controls; un-prefixed library errors signal failures the underlying tool reports without translation. Authors who hit an un-prefixed error read the per-engine context prefix and the wrapped library error to identify the offending field.

## No central sentinel catalog

Aggrega does not maintain an `internal/sentinels.go` central registry of error-prefix constants today. Sentinels are declared per emit-site:

- `errors.New()` constants in per-package `errors.go` files (helm/, compose/).
- Inline `fmt.Sprintf()` / `fmt.Errorf()` calls in validators and orchestrator sub-passes.
- Wrapper types (`RecipeValidationError`, `WorkloadValidationError`) that format the final prefixed message in their `Error()` method.

The decentralized shape lets each surface format its message with the level of detail the surface needs (rule IDs and suggestions for Recipe-shape errors; field paths and unification details for CUE errors; per-resource collision tuples for Release-merge errors). The cost is that adding a new sentinel category requires authoring discipline rather than registering against a central enum.

## Future direction — `PROVIDER_ERROR:` wrapping

Per the audit framing, an open question is whether to wrap raw provider-engine errors (Helm SDK, docker-compose parser, file I/O) with a third sentinel — `PROVIDER_ERROR:` — that signals "the failure originates in the provider engine or its underlying library, not in the catalog and not in Aggrega's own translation pass." Today these errors come through with only the per-engine context prefix; a `PROVIDER_ERROR:` wrapper would let authors distinguish "Helm rejected the chart" from "Aggrega rejected the Recipe." This wrapping is **`planned`** per the four-label taxonomy at [`10-status.md`](../10-status.md) — accepted as a documentation-discipline question; not implemented in code today.

When the wrapping ships, the discipline target is to:

- Wrap every raw provider-library error with `PROVIDER_ERROR:` at the engine boundary (helm SDK, docker-compose parser, future terraform / cloudformation / eval engines).
- Preserve the existing per-engine context prefix (`helm:`, `compose:`) inside the wrapper so the sentinel and the engine-locator are both visible.
- Leave `CATALOG_ERROR:` and `TRANSLATION_ERROR:` unchanged — the wrapping adds a third class, not a replacement.

## Reading an error end-to-end

When the compiler emits an error, the prefix and wrapping convention together identify which surface is at fault:

| Prefix shape | Surface | Authoring fix |
| --- | --- | --- |
| `CATALOG_ERROR: Recipe <path> ... violates rule N` | Catalog (Recipe shape, Provider binding) | Edit the Recipe / FeatureRecipe / Provider entity. |
| `CATALOG_ERROR: Recipe <path> ... declares <field> but ...` | Catalog (input-kind not yet implemented) | Either remove the input kind or wait for the implementation; see [`fatal-halts.md`](fatal-halts.md). |
| `TRANSLATION_ERROR: service <name> port ...` | Provider engine (synthesis-time) | Edit the Workload's `services` / `containers` / `ports` to satisfy the engine's translation requirements. |
| `helm: node <id>: <wrapped Helm SDK error>` | Helm SDK (chart load / render) | Fix the chart at `Chart.yaml` / `values.yaml` / `templates/` per the Helm error message. |
| `compose: node <id>: <wrapped YAML error>` | docker-compose YAML parser | Fix the base compose file or the valuesMapping output's compose-overlay shape. |
| `Phase B.X node <id>: <wrapped sub-pass error>` | Aggrega orchestrator (mid-pipeline) | Read the wrapped error to identify the failing sub-pass; the wrapped message names the input. |
| Pre-Step-5 unmarshal / CUE error (no sentinel) | Schema-validation layer 1 or 2 | Edit the catalog YAML's structural shape (Layer 1) or pillar content (Layer 2); see [`vocabulary/validation-surface.md`](../vocabulary/validation-surface.md). |

## Cross-references

- [`fatal-halts.md`](fatal-halts.md) — per-error catalog of every fatal halt with intended message and how-to-fix.
- [`warnings.md`](warnings.md) — non-fatal advisories the compiler emits.
- [`vocabulary/validation-surface.md`](../vocabulary/validation-surface.md) — the four schema-validation layers and how their error shapes interact.
- [`10-status.md`](../10-status.md) — readiness classification for `PROVIDER_ERROR:` wrapping and other planned sentinel work.
