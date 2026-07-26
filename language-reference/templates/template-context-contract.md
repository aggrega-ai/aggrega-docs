# Template Context Contract

This page documents the runtime view the compiler injects into Recipe and FeatureRecipe Go templates: the `TemplateContext` shape, the per-field availability across the compilation pipeline, and the canonical contract advanced authors need when writing templates that consume cross-component state. Per-template-site availability (which fields are present at which evaluation site) lives at [expansion-matrix.md](expansion-matrix.md); this page documents the field shapes and their semantics.

## Overview

The compiler assembles a `TemplateContext` per node during Step 5 and injects it into every Go template the renderer evaluates for that node. The context is in-memory only — it never persists to disk and never crosses the Wasm ABI as a single payload. Each template site receives a view of the same context object; some fields are populated late (`.workload` arrives at Phase B.2; `.source` at Phase B.0; `.steps` is populated by `pipeline:` execution as each step completes, see [Status of the Language → Compilation pipeline phases](../10-status.md#compilation-pipeline-phases)).

The schema for the runtime shape is `template-context-v1alpha1.schema.json` (shipped with the Aggrega schema distribution).

## Top-level fields

The top-level fields live at the root of the template context — accessed as `.field` from inside a template.

- **`.values` (map).** Developer-authored cognitive payload from the Aggregate. Per-component values flow through to the rendered Recipe at this field. Validated by the Catalog's `schema:` (the Component's or Feature's JSON Schema 2020-12 declaration) at Step 1. When a field's authored zero / empty / false is semantically distinct from the field being absent, use `optional` (see [`sprig-functions.md`](sprig-functions.md#optional--presence-aware-fallback)) rather than `default`.
- **`.infra` (map).** Ops-authored physical sizing from the Release. Validated by the Catalog's `schema:` (the Component's or Feature's JSON Schema 2020-12 declaration) at Step 1. The same `optional`-vs-`default` guidance as for `.values` applies — prefer `optional` when an authored zero or false is a legitimate intent (scale-to-zero, no-retries, feature-flag-off).
- **`.locals` (string-valued map).** Recipe-private state — names declared in the Recipe's `locals:` block, populated at the Phase B preamble. Accessible only within the Recipe's own templates; never exposed to callers.
- **`.provides` (string-valued map).** The Recipe's public output strings — the contract callers' `inject:` blocks resolve `from:` references against. Populated at Pass 1.
- **`.features` (map of attachments).** Iterates the Features attached to this Component (Aggregate-level + subsystem-level + Release-level + Manifest-annotation-driven, per the 5-Tier Onion Model), keyed by the instance name the author gave the attachment. Every entry carries the same four fields — see [the attachment shape](#the-attachment-shape) below.
- **`.metadata` (struct).** Release identity for deterministic naming: `release_name`, `release_version`, `environment`, `aggregate_name`. Populated for every render; values originate in the Release's `metadata:` block.
- **`.source`.** The resolved `Recipe.Spec.Source` after Phase B.0 template evaluation. `nil` for sourceless Recipes; `nil` before Phase B.0 runs.
- **`.workload`.** The parsed Workload object after Phase B.2 (yaml-unmarshal + `ValidateWorkload` + `ValidateWorkloadSecrets` succeed). `nil` for non-synthesized Recipes; `nil` before Phase B.2 runs.
- **`.steps` (map of step outputs).** Populated by `pipeline:` execution as Wasm plugins run, exposing a completed step's returned outputs to subsequent steps via `.steps.<id>.outputs`. A step reads a preceding step's outputs from its own `with` template; a step's `outputs` become visible only to steps declared after it. Empty when the node declares no pipeline, and before the node's first step completes.

## The attachment shape

`.features.<name>` and `.features.<slot>` are the same shape — one attachment, read one way. Four fields:

- **`.type` (string).** The attached Feature's catalog URI.
- **`.values` (map).** The attachment's own developer-intent pillar, authored on the attachment declaration in the Aggregate. Distinct from the host component's top-level `.values`.
- **`.infra` (map).** The attachment's own operational-sizing pillar, authored on the attachment declaration in the Release. Distinct from the host component's top-level `.infra`.
- **`.provides` (string-valued map).** The resolved public contract of the FeatureRecipe bound to this attachment — the emitted resource's name, its data key, a cloud identity, and any additional keys the FeatureRecipe publishes. Read as `.features.<name>.provides.<key>`, mirroring `.context.uses.<alias>.provides`: the consumer reads what the producer published instead of re-deriving it. Empty when the bound FeatureRecipe publishes nothing.

`.provides` is what makes an attachment consumable rather than merely present. A Feature that declares a `schema.provides` contract has that contract enforced against the FeatureRecipe realizing it — the FeatureRecipe must publish every declared key — and the consumer reads the result here. So an identity Feature that emits a ServiceAccount and publishes its name lets the consuming Recipe bind to it:

```yaml
workload: |
  serviceAccount: "{{ .features.identity.provides.name }}"
```

The emitted name is stated once, by the producer, and consumed — never restated on the consuming side where the two could disagree. The [`workload-identity-binding`](../examples/workload-identity-binding/) example renders this end-to-end.

## The `.context` block

`.context` is the compiler-assembled execution context for a single node — the identity, topology, and delivery-pipe data the renderer threads through every template site. Five fields:

- **`.context.instance_id` (string).** The node's flattened instance ID (e.g., `data-layer.main-db` for a node imported from a sub-aggregate). Used for resource-name prefixing.
- **`.context.labels` (string-valued map).** Catalog-authored labels plus any `label-transform` Step-2 additions.
- **`.context.annotations` (three buckets, see below).** Cascaded annotations grouped by origin.
- **`.context.inject` (InjectPipe, see below).** The pre-hydrated, intercepted delivery pipe — the standard surface Recipe templates read for cross-component values.
- **`.context.uses` (map of EnrichedEdge, see below).** The JOIN projection over outbound topological edges.

### `.context.annotations` — three buckets

Annotations cascade into three buckets keyed by origin:

- **`.context.annotations.release`** — Release boundary annotations (Domain 4). Used to govern physical realities; renderers route these into `infra:` fields where appropriate. The `aggrega.ai/*` well-known annotations live in this bucket.
- **`.context.annotations.catalog`** — Component-metadata annotations from Domain 2. Immutable intrinsic traits authored by the Architect; primarily consumed by Wasm policy plugins.
- **`.context.annotations.aggregate`** — Aggregate subsystem annotations from Domain 1. Cognitive metadata; renderers route these into `values:` payloads where appropriate.

Each bucket is a flat string-to-string map. Per the architecture's separation rules, the buckets are intended for distinct uses; the engine does not enforce the separation, so authoring discipline keeps the buckets aligned with their intended semantics. See [chapter 6 §2 Flow 5](../../architecture/06-data-taxonomy-and-composition.md) for the cascading-annotation design.

### `.context.inject` — the InjectPipe shape

The InjectPipe is the compiler's pre-resolved delivery pipe. By the time a Recipe template runs at Phase B, every inject source (developer-authored self-inject literals, self-inject `from:` references resolved against own `provides`, cross-component `uses[].inject` references resolved against target `provides`, FeatureRecipe `injectMapping` interceptions) has been resolved into a final string value and merged into this map.

Fields:

- **`.context.inject.env`** — string-valued map of environment-variable-name → resolved value.
- **`.context.inject.file`** — string-valued map of file-path → resolved value.
- **`.context.inject.arg`** — string-valued map of arg-flag → resolved value.
- **`.context.inject.all`** — string-valued map combining `env`/`file`/`arg`/custom mechanisms into one flat dictionary; useful for whole-pipe serialization (`{{ toJson .context.inject.all }}`).
- **Custom mechanisms** (e.g., `ssm_param`) — populated under their own field name when the Component's `inject:` allowlist declares them.

The InjectPipe is the post-interception state — FeatureRecipe `injectMapping` blocks have already deep-merged their overrides over this pipe at Phase A by the time Recipe templates read it.

### `.context.uses` — JOIN projection (EnrichedEdge)

`.context.uses` is the compiler's enriched view of every outbound topological edge from the current node. Each map entry is keyed by the local socket alias (e.g., `databases.primary` becomes `.context.uses.primary` when the Aggregate authored `uses: { databases: { primary: { target: ... } } }`) and carries a JOIN projection of the target's resolved state plus the caller-side delivery contract:

- **`.target` (string)** — target node's instance ID.
- **`.socket` (string)** — caller-side socket name (the `usesSchema` key).
- **`.provides` (string-valued map)** — target's resolved `provides:` keys (the public output strings the target Recipe exported at Pass 1).
- **`.inject` (map of mechanism → map of key → value)** — caller-side inject directives for this edge (the `inject:` block on the `uses[].inject` declaration). Mechanism keys are `env`/`file`/`arg`/custom; per-mechanism map entries are local-key → target-provides-key references.
- **`.labels` (string-valued map)** — target's Catalog labels (immutable per Architect authoring).
- **`.annotations` (three buckets)** — target's `release`/`catalog`/`aggregate` annotation buckets.
- **`.component` (string)** — target's Component type URI.
- **`.resolved_version` (string)** — target's Component version after Manifest resolution.
- **`.boundary_path` (string)** — target's Release boundary path (set when the target lives in a different boundary than the caller).
- **`.origin_feature` (string)** — set when the edge was synthesised by a Feature attachment (e.g., a sidecar Feature contributing a `uses` edge to a credential Feature).
- **`.values` (map)** — resolved per-edge developer configuration for this connection, authored on the Aggregate's `uses` entry. Present only when the edge carries per-edge values.
- **`.infra` (map)** — resolved per-edge operator configuration for this connection, authored on the Release's `uses` entry. Present only when the edge carries per-edge infra.

Both per-edge config maps are consumer-scoped: they land in the consuming node's render context only, never the target's.

A provided value is read at `.provides.<name>` — the provided names nest under `.provides` rather than sitting directly on the edge, so `.context.uses.<alias>.<name>` addresses no field and yields nothing.

Recipe templates consume this projection to look up target-side state without walking the IR graph. FeatureRecipe `injectMapping` templates use it to reach into target annotations for cross-boundary routing decisions (the K8s DNS resolver pattern documented in [entities/featurerecipe.md](../entities/featurerecipe.md) is the canonical worked example).

## Three inject-related surfaces

The template context carries three inject-shaped fields with distinct semantics. Recipe and FeatureRecipe authors should know which surface to read.

| Surface | Type | Populated when | Use |
| --- | --- | --- | --- |
| `.context.inject` | InjectPipe (always present) | Every render | The standard pre-hydrated delivery pipe — read this in `valuesMapping:`/`workload:`/`artifacts:` templates and in any non-credential-FeatureRecipe template site. |
| `.inject` (top-level) | `*InjectPipe` (nullable) | Credential FeatureRecipe rendering only | The credential-FeatureRecipe-specific inject view — contains the credential's own delivery directives. `nil` outside credential FeatureRecipe sites. |
| `.inject_raw` (top-level) | opaque, nullable | Set when the developer authored an `inject:` block on the parent component | The unmutated Developer intent before any Phase A interception. Use for "did the developer originally request this delivery key?" logic checks; immune to FeatureRecipe `injectMapping` rewriting. `nil` if the developer omitted the `inject:` block. |

Authors needing the resolved post-interception delivery should read `.context.inject`. Authors needing the immutable original intent (e.g., to detect interception or to emit fallback behaviour when the developer omitted an inject block) should read `.inject_raw`.

## Attachment FeatureRecipe surface

When the renderer evaluates an attachment's Resource Generation pass at Phase B.6, an additional top-level field is set:

- **`.attachment_name` (string)** — the attachment's instance name: the slot it fills in the owning entity's `featuresSchema`, or the free name the author gave it. A FeatureRecipe's `provides:` and `valuesMapping:` read it to derive a deterministic resource identifier (`{{ .context.instance_id }}-{{ .attachment_name }}`) and to name the attachment being processed.

`.attachment_name` is set only during an attachment's Resource Generation; it is empty/unset at every other template site.

## Per-site availability

Field availability varies by template site. Recipe `provides:` templates run at Pass 1 with self-contained context (no `.context.inject`/`.context.uses`); Recipe `valuesMapping:` runs at Phase B with full TemplateContext; FeatureRecipe `injectMapping:` runs at Phase A with full TemplateContext including the inject pipe being intercepted. The complete site-by-site availability table is at [expansion-matrix.md](expansion-matrix.md); this page documents the field shapes that the matrix's "available references" column points at.

## Cross-references

- [`05-templates.md`](../05-templates.md) — templating overview.
- [`expansion-matrix.md`](expansion-matrix.md) — per-template-site evaluation matrix.
- [`sprig-functions.md`](sprig-functions.md) — Sprig helpers wired into the template engine.
- [`../entities/recipe.md`](../entities/recipe.md) — Recipe authoring surface.
- [`../entities/featurerecipe.md`](../entities/featurerecipe.md) — FeatureRecipe authoring surface (including the K8s DNS resolver worked example for `.context.uses` traversal).
- [`../vocabulary/topology-triad.md`](../vocabulary/topology-triad.md) — Injection Contract specification (covers the dual-state context, key-collision rules, worked examples).
- [`../10-status.md#compilation-pipeline-phases`](../10-status.md#compilation-pipeline-phases) — current readiness of Phase A/B/C surfaces.
