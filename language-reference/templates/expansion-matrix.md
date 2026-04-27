# Template Expansion Matrix

## Part 12: Template Expansion Reference — The Complete Matrix

The Aggrega DSL supports Go `text/template` expansion (with the Sprig library pre-registered) in multiple locations across the YAML entities. Each location has a specific set of available references, governed by when the data becomes concrete during the 5-step compilation pipeline. This part is the definitive reference for what can be referenced where.

### 1. The Pipeline Timing Tree (When Data Becomes Concrete)

Understanding what references are available requires understanding when each piece of data is resolved:

```text
Step 1: Resolver & Syntax Validator
  ├── .parameters             → Interpolated into all Aggregate/Release YAML strings, then PURGED from memory
  ├── .values                 → CUE-validated, concrete
  ├── .infra                  → Release-merged into target components/features, concrete
  └── Catalog entities        → Resolved (extends merged, CUE unified, usesSchema extracted)

Step 2: Topology Builder
  ├── .context.instance_id    → Flattened node ID (e.g., "data-layer.main-db")
  └── .context.labels         → From Catalog + mutator.wasm mutations

Step 3: Graph Finalization
  ├── .context.annotations.release    → Cascaded from boundary hierarchy
  ├── .context.annotations.catalog    → From Component metadata.annotations
  ├── .context.annotations.aggregate  → Cascaded from subsystem hierarchy
  └── feature_values_mapping          → 5-Tier Onion Model normalized

Step 5 Pass 1: Provides Evaluation
  └── .provides (all nodes)           → Self-contained templates evaluated (any order)

Step 5 Pass 2a: Self-Inject Resolution
  └── component.inject                → value: literals expanded, from: own provides resolved

Step 5 Pass 2b: Uses-Inject Resolution
  └── uses[].inject                   → from: target provides resolved

Step 5 Phase A: injectMapping Interception
  └── .context.inject                 → Fully populated pipe, intercepted by FeatureRecipe injectMappings

Step 5 Phase B: Base Rendering
  └── Full TemplateContext            → Everything available

Step 5 Phase C: Post-Render Mutation
  └── Full TemplateContext + .steps   → Inter-step pipeline outputs available
```

### 2. The Template Expansion Matrix

Every location in the DSL where Go template expressions are evaluated, and exactly what references are available:

| # | Location | Entity | Evaluated In | Available References |
| :--- | :--- | :--- | :--- | :--- |
| 1 | `{{ .parameters.X }}` in Aggregate YAML strings | Aggregate | Step 1 (interpolation) | `.parameters` only. All other data is not yet resolved. |
| 2 | `{{ .parameters.X }}` in Release YAML strings | Release | Step 1 (interpolation) | `.parameters` (including `parametersFrom` deep-merged values). |
| 3 | `directory` / `subDirectory` templates | Release boundary | Step 5 (path evaluation) | `.provider`, `.boundary_name`, `.component_id`, `.parameters.X`, `.boundary_type`, `.manifest.recipe_name`. |
| 4 | Component `inject` `value:` strings | Aggregate component | Step 5 Pass 2a | `.values`, `.infra`, `.context.instance_id`, `.context.labels`, `.context.annotations.*` (all 3 buckets), `.metadata.*`. **FORBIDDEN:** `.context.inject` (circular — pipe being built), `.context.uses` (use `uses[].inject` for cross-component wiring instead). |
| 5 | Recipe `source` field strings (top-level string OR string-valued sub-fields of a structured `source:` map) | Recipe | Step 5 Phase B.0 | `.context.instance_id`, `.values`, `.infra`, `.provides` (the same node's Pass 1 output), static strings. **FORBIDDEN:** `.context.inject`, `.context.uses` (self-containment invariant — same rule as Recipe `provides`; source resolution must complete before the topology pipe is hydrated and before any chart, module, or artifact body is loaded). |
| 6 | Recipe `provides` templates | Recipe | Step 5 Pass 1 | `.context.instance_id`, `.locals`, `.values`, `.infra`, `.metadata.*`, static strings. **FORBIDDEN:** `.context.inject`, `.context.uses` (self-containment invariant — enables parallel evaluation with zero topological sort). |
| 7 | Recipe `valuesMapping` / `valuesMappingFile` | Recipe | Step 5 Phase B | **Full TemplateContext:** `.values`, `.infra`, `.context.*` (instance_id, labels, annotations, inject, uses), `.locals`, `.provides`, `.features`, `.secrets`, `.metadata`. |
| 8 | Recipe `valuesMappingJsonnet` | Recipe | Step 5 Phase B | Same as #7, injected via `std.extVar()`. |
| 9 | FeatureRecipe `injectMapping` | FeatureRecipe | Step 5 Phase A | **Full TemplateContext:** `.values`, `.infra`, `.context.*` (including `.context.inject` — the pipe being intercepted — and `.context.uses`). |
| 10 | FeatureRecipe `valuesMapping` | FeatureRecipe | Step 5 Phase B | **Full TemplateContext** + `.secret_name`, `.inject` (for credential FeatureRecipes implementing Features labeled `feature.aggrega.ai/kind: secret`). |
| 11 | Pipeline `with:` blocks | Recipe / FeatureRecipe | Step 5 Phase C | **Full TemplateContext** + `.steps` (inter-step outputs from preceding pipeline steps). |

**Self-containment note.** Recipe `source` strings (#5) share the `provides` self-containment invariant (#6): both surfaces reject `.context.inject` and `.context.uses` references. Source resolution runs in Phase B.0 — before the Pass-2 inject hydration that populates `.context.inject` and before downstream sub-passes consume the resolved source — so the rule and its rationale carry across both surfaces.

### 3. Forbidden References & Rationale

| Location | Forbidden Reference | Rationale |
| :--- | :--- | :--- |
| Component `inject` `value:` (#4) | `.context.inject` | The inject pipe is being constructed during this pass — a self-inject `value:` template cannot read from the pipe it contributes to. |
| Component `inject` `value:` (#4) | `.context.uses` | Cross-component wiring lives in `uses[].inject`. A component's self-inject `value:` templates stay closed over the component's own data. |
| Recipe `provides` (#6) | `.context.inject` | Provides templates are evaluated in any order during Pass 1 and close over the node's own data (`.values`, `.infra`, `.locals`) only. The inject pipe is not populated until Pass 2. |
| Recipe `provides` (#6) | `.context.uses` | `.context.uses` refers to other nodes' provides, which Pass 1 evaluates in arbitrary order. Provides templates stay self-contained so Pass 1 remains order-free. |
| Recipe `source` (#5) | `.context.inject` | Source resolution runs in Phase B.0, before the Pass-2 sub-passes that hydrate `.context.inject`. The pipe is not yet populated when the source URI is evaluated. |
| Recipe `source` (#5) | `.context.uses` | Source resolution must complete before downstream sub-passes load the Recipe's chart, module, or artifact body. Allowing cross-node references would couple source resolution to topology iteration order, which Phase B.0 deliberately avoids. |
| Parameters (everywhere) | After Step 1 | Parameters are purged from memory after Step 1 interpolation. They exist only as raw YAML template strings (`{{ .parameters.X }}`); after interpolation they are gone. |

### 4. The Self-Inject Resolution Path (Step 5 Pass 2a)

When a component declares a component-level `inject:` block, the compiler evaluates it during a dedicated sub-phase of Pass 2:

1. **Literal `value:` strings:** If the value contains Go template expressions, the compiler evaluates them with the context from row #4 of the matrix (`.values`, `.infra`, `.context.instance_id`, etc.). Plain strings pass through unchanged.
2. **`from:` references:** The compiler looks up the key in the node's own `provides` dictionary (already resolved in Pass 1). If the key doesn't exist, the compiler halts the build with an invalid-inject-key error.
3. **Compact form:** Treated as literal `value:` (compact form in `component.inject` context is always a literal).
4. **Collision check:** Before merging into the `.context.inject` pipe, the compiler verifies no key collides with uses-inject keys (resolved in Pass 2b). Collisions halt the build with a duplicate-delivery-key error.

The resulting strings are merged into `.context.inject.env`, `.context.inject.file`, `.context.inject.arg` (and any custom mechanisms), alongside the uses-inject resolutions from Pass 2b. By the time Phase A (`injectMapping`) runs, the pipe contains all developer-authored inject values from both sources.
