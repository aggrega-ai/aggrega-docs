# Template Expansion Matrix

## Template Expansion Reference — The Complete Matrix

The Aggrega DSL supports Go `text/template` expansion (with the Sprig library pre-registered) in multiple locations across the YAML entities. Each location has a specific set of available references, governed by when the data becomes concrete as compilation proceeds. This part is the definitive reference for what can be referenced where.

### 1. The Pipeline Timing Tree (When Data Becomes Concrete)

Understanding what references are available requires understanding when each piece of data is resolved. The stages below are listed in the order they run, and each is named for what it does — that name is how the rest of this page refers to it:

```text
Resolution — resolver and syntax validator
  ├── .parameters             → Interpolated into all Aggregate/Release YAML strings, then PURGED from memory
  ├── .values                 → schema-validated against the Component's pillar schema, concrete
  ├── .infra                  → Release-merged into target components/features, concrete
  └── Catalog entities        → Resolved (extends merged, pillar schemas composed, usesSchema extracted)

Topology construction
  ├── .context.instance_id    → Flattened node ID (e.g., "data-layer.main-db")
  └── .context.labels         → From Catalog + label-transform mutations

Graph finalization
  ├── .context.annotations.release    → Cascaded from boundary hierarchy
  ├── .context.annotations.catalog    → From Component metadata.annotations
  ├── .context.annotations.aggregate  → Cascaded from subsystem hierarchy
  └── feature_values_mapping          → 5-Tier Onion Model normalized

Rendering begins. Provides evaluation — locals preamble, then provides
  ├── .locals (per node)              → Block resolved in author order; an entry reads earlier siblings
  └── .provides (all nodes)           → Self-contained templates evaluated (any order), reading .locals

Inject hydration — self-inject resolution
  └── component.inject                → value: literals expanded, from: own provides resolved

Inject hydration — uses-inject resolution
  └── uses[].inject                   → from: target provides resolved

Inject mapping — injectMapping interception
  └── .context.inject                 → Fully populated pipe, intercepted by FeatureRecipe injectMappings

Base rendering
  └── Full TemplateContext            → Everything available

The plugin pipeline — post-render mutation
  └── Full TemplateContext + .steps   → Inter-step pipeline outputs available
```

### 2. The Template Expansion Matrix

Every location in the DSL where Go template expressions are evaluated, and exactly what references are available:

| # | Location | Entity | Evaluated In | Available References |
| :--- | :--- | :--- | :--- | :--- |
| 1 | `{{ .parameters.X }}` in Aggregate YAML strings | Aggregate | Resolution (interpolation) | `.parameters` only. All other data is not yet resolved. |
| 2 | `{{ .parameters.X }}` in Release YAML strings | Release | Resolution (interpolation) | `.parameters` (inline `parameters:` map and `$import:`-loaded values combined into the merged parameter map). |
| 3 | `directory` / `subDirectory` templates | Release boundary | Rendering (path evaluation) | `.capability`, `.boundary_name`, `.parameters.X`, `.manifest.recipe_name`, `.parent_boundary.*`, and `.component_id` (`subDirectory:` only — a `directory:` template refuses it). |
| 4 | Component `inject` `value:` strings | Aggregate component | Self-inject resolution | `.values`, `.infra`, `.context.instance_id`, `.context.labels`, `.context.annotations.*` (all 3 buckets), `.metadata.*`. **FORBIDDEN:** `.context.inject` (circular — pipe being built), `.context.uses` (use `uses[].inject` for cross-component wiring instead). |
| 5 | Recipe `source` field strings (top-level string OR string-valued sub-fields of a structured `source:` map) | Recipe | Source resolution | `.context.instance_id`, `.values`, `.infra`, `.locals` (the node's whole resolved block), static strings. **FORBIDDEN:** `.context.inject`, `.context.uses`, `.provides` (self-containment invariant — the source surface shares its context with Recipe `locals`, so the two admit and refuse the same references; source resolution must complete before the topology pipe is hydrated and before any chart, module, or artifact body is loaded). |
| 6 | Recipe `provides` templates | Recipe | Provides evaluation | `.context.instance_id`, `.values`, `.infra`, `.locals` (the node's whole resolved block — the locals resolve in this stage's preamble, ahead of provides), static strings. **FORBIDDEN:** every other root — `.context.inject`, `.context.uses` (cross-node), `.context.annotations.*`, `.context.labels`, `.context.metadata`, `.metadata.*` (placement/deployment-coupled), and `.attachment_name` (no attachment is being resolved during a base Recipe's provides evaluation). The check is a positive allowlist: referencing any root the provides context does not expose halts (self-containment invariant — enables parallel evaluation with zero topological sort). A `.locals.<key>` naming a key the locals block does not declare halts too, since the pillar is an open keyed map the root check alone cannot police. |
| 7 | Recipe `valuesMapping` (inline, file `$import:`, or library `$import:`) | Recipe | Base rendering | **Full TemplateContext:** `.values`, `.infra`, `.context.*` (instance_id, labels, annotations, inject, uses), `.locals`, `.provides`, `.features`, `.metadata`. |
| 8 | FeatureRecipe `injectMapping` | FeatureRecipe | Inject mapping | **Full TemplateContext:** `.values`, `.infra`, `.context.*` (including `.context.inject` — the pipe being intercepted — and `.context.uses`). |
| 9 | FeatureRecipe `valuesMapping` | FeatureRecipe | Base rendering | **Full TemplateContext** + `.attachment_name`, `.inject` (for credential FeatureRecipes implementing Features labeled `feature.aggrega.ai/kind: secret`). |
| 10 | Pipeline `with:` blocks | Recipe / FeatureRecipe | The plugin pipeline | **Full TemplateContext** + `.steps` (inter-step outputs from preceding pipeline steps). |
| 11 | Recipe `workload:` body (every templated field inside, whether inline or `$import:`-loaded) | Recipe | Base rendering | **Full TemplateContext.** Every field inside the Workload body — `replicas`, `containers.<name>.image`, `containers.<name>.variables.<KEY>`, `containers.<name>.ports.<port>`, `services.<name>.ports.<port>`, `volumes.<name>.*`, `health.*` — is part of the same template evaluation that consumes the entire Workload string. The Workload content is a single Go template evaluated once against the full TemplateContext; field-level templates inside resolve in the same evaluation rather than in a separate one. |

**Self-containment note.** Recipe `source` strings (#5) share the `provides` self-containment invariant (#6): both surfaces reject `.context.inject` and `.context.uses` references. Source resolution runs before the inject hydration that populates `.context.inject`, and before anything downstream consumes the resolved source — so the rule and its rationale carry across both surfaces. Where the two differ is the provides pillar: `source` shares its context with Recipe `locals` and so refuses `.provides`, while `provides` is itself the surface being resolved. Both read `.locals`.

**Workload-body templating note (#11).** The Workload body is one templated string that the renderer evaluates as a whole, then parses the result as a Workload document. Field-level templates inside (a `replicas: {{ .infra.replicas | default 1 }}` here, a `LOG_LEVEL: "{{ .values.log_level }}"` inside `containers.app.variables` there) are not separate template-evaluation sites — they all participate in the single base-rendering evaluation that produces the Workload. Authors do not need a separate availability rule for Workload-internal fields; the rule for Workload as a whole (#11) covers every field-level template inside.

**Discriminator-aware fallback inside the Workload body.** The `replicas: {{ .infra.replicas | default 1 }}` example above conflates "author didn't set `replicas`" with "author set `replicas` to `0`" — `default` fires on both. When a Release legitimately authors `infra.replicas: 0` to express scale-to-zero (a common Knative / KEDA pattern), the `| default 1` form silently overrides the intent. The discriminator-aware shape is `replicas: {{ optional .infra "replicas" 1 }}` — `optional` checks key presence and returns the authored value (including authored zero) when the key is set, falling back to `1` only when the key is absent. See [`sprig-functions.md`](sprig-functions.md#optional--presence-aware-fallback) for the full semantics and the when-to-prefer guidance.

### 3. Forbidden References & Rationale

| Location | Forbidden Reference | Rationale |
| :--- | :--- | :--- |
| Component `inject` `value:` (#4) | `.context.inject` | The inject pipe is being constructed at that point — a self-inject `value:` template cannot read from the pipe it contributes to. |
| Component `inject` `value:` (#4) | `.context.uses` | Cross-component wiring lives in `uses[].inject`. A component's self-inject `value:` templates stay closed over the component's own data. |
| Recipe `provides` (#6) | `.context.inject` | Provides templates are evaluated in any order and close over the node's own data (`.values`, `.infra`, `.context.instance_id`) only. The inject pipe is not populated until inject hydration, which runs after every node's provides are evaluated. |
| Recipe `provides` (#6) | `.attachment_name` | A base Recipe's provides pass resolves no attachment, so the name would render empty. The root is refused rather than delivered blank. |
| Recipe `source` (#5) | `.provides` | The source surface shares its context with Recipe `locals`, and neither carries a provides pillar. A node's locals resolve ahead of its provides so that `provides:` can read `.locals`; the source template reads the same locals rather than reaching back for provides. |
| Recipe `locals` (#6 preamble) | `.provides` | Locals resolve before provides, so the node's own provides do not exist yet when a local is evaluated. A local that needs a value the provides also publish computes it from `.values` / `.infra` directly — and the `provides` entry then reads the local. |
| Recipe `provides` (#6) | `.context.uses` | `.context.uses` refers to other nodes' provides, and provides evaluation runs them in arbitrary order. Provides templates stay self-contained so that evaluation remains order-free. |
| Recipe `source` (#5) | `.context.inject` | Source resolution runs before the inject hydration that populates `.context.inject`. The pipe is not yet populated when the source URI is evaluated. |
| Recipe `source` (#5) | `.context.uses` | Source resolution must complete before anything downstream loads the Recipe's chart, module, or artifact body. Allowing cross-node references would couple source resolution to topology iteration order, which it deliberately avoids. |
| Parameters (everywhere) | Anywhere after interpolation | Parameters are purged from memory once resolution has interpolated them. They exist only as raw YAML template strings (`{{ .parameters.X }}`); after interpolation they are gone. |

### 4. The Self-Inject Resolution Path

Self-inject resolution is the first half of inject hydration, and it runs after every node's provides have been evaluated. When a component declares a component-level `inject:` block, the compiler evaluates it there:

1. **Literal `value:` strings:** If the value contains Go template expressions, the compiler evaluates them with the context from row #4 of the matrix (`.values`, `.infra`, `.context.instance_id`, etc.). Plain strings pass through unchanged.
2. **`from:` references:** The compiler looks up the key in the node's own `provides` dictionary, already resolved by then. If the key doesn't exist, the compiler halts the build with an invalid-inject-key error.
3. **Compact form:** Treated as literal `value:` (compact form in `component.inject` context is always a literal).
4. **Collision check:** Before merging into the `.context.inject` pipe, the compiler verifies no key collides with the uses-inject keys that the second half of inject hydration resolves. Collisions halt the build with a duplicate-delivery-key error.

The resulting strings are merged into `.context.inject.env`, `.context.inject.file`, `.context.inject.arg` (and any custom mechanisms), alongside those uses-inject resolutions. By the time inject mapping (`injectMapping`) runs, the pipe contains all developer-authored inject values from both sources.
