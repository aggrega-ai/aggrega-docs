# Data pillars

The conceptual framing of the five DSL structural keywords — `parameters`, `values`, `uses`, `infra`, `inject` — lives in [architecture/06-data-taxonomy-and-composition.md](../../architecture/06-data-taxonomy-and-composition.md). This page covers the canonical data-pillar list, per-pillar authoring semantics, cross-pillar mechanics, and the default-value vocabulary that authors encounter across pillars. The complementary topology triad (`provides`, `inject`, `uses` — keywords that wire graph edges) is documented at [topology-triad.md](topology-triad.md); the metadata vocabulary distinct from the data pillars (labels, annotations, publishing-surface fields) lives at [labels-and-annotations.md](labels-and-annotations.md) and [publishing-surface.md](publishing-surface.md).

## Canonical pillar list

Aggrega entities carry seven named data pillars. Five participate in the IR data flow as live state through Step 5 rendering; two are transient or private and exist only at specific compilation stages.

| Pillar | Lives on | Lifecycle | Role |
| --- | --- | --- | --- |
| `values` | Aggregate component / feature / secret instances | Live through Step 5 | Developer-authored cognitive payload |
| `infra` | Release component / boundary / feature / secret instances | Live through Step 5 | Ops-authored physical sizing |
| `provides` | Recipe `provides:` block | Live through Step 5 (derived pillar — see below) | Recipe-computed public output strings the topology pipe consumes |
| `uses` | Aggregate component / feature instances | Live through Step 5 | Topological edges to other components / features |
| `secrets` | Component `secretsSchema` declarations + four authoring surfaces (Aggregate / Recipe / Workload / FeatureRecipe) — see "Secrets pillar" below | Live through Step 5 | Credential pillar with four parallel authoring surfaces |
| `parameters` | Aggregate + Release roots | Transient — purged after Step 1 interpolation | Per-environment string-valued slots |
| `locals` | Recipe `locals:` block | Recipe-private — visible only inside the Recipe's own templates | Computed string state Recipes derive at Phase B preamble |

`values` / `infra` / `provides` / `uses` / `secrets` are the **five live pillars** the runtime template context exposes through `.values`, `.infra`, `.provides`, `.context.uses`, and `.secrets` respectively. `parameters` and `locals` are off the live-pillar list — `parameters` because it does not survive Step 1; `locals` because it is Recipe-private and never crosses entity boundaries.

The list resolves D-03's pillar-walls-vs-signposts question with **signposts**: the template engine permits cross-pillar reads at every site unless explicitly forbidden by self-containment rules (Recipe `provides:` and Recipe `source:` block reading `.context.inject` / `.context.uses`; documented at [`templates/expansion-matrix.md`](../templates/expansion-matrix.md)). Pillar boundaries are authoring discipline, not language enforcement.

## Pillar boundaries and authoring discipline

Cross-pillar reads from a Recipe template are unrestricted at every site that allows the full TemplateContext. Authoring discipline expects authors to:

- Read `.values` for cognitive payload (developer-authored intent).
- Read `.infra` for physical sizing (Ops-authored sizing).
- Read `.context.uses[].provides.<key>` for cross-component pointer strings (the topology triad's data flow).
- Read `.context.inject` for the post-hydration delivery pipe (assembled from inject sources across `component.inject`, `uses[].inject`, and FeatureRecipe `injectMapping` interceptions).

The discipline is **signposts**, not walls. A Recipe template that reads `.infra.replicas` to drive a `values:` field works; the template engine does not gate the read. The architecture's framing is that pillar boundaries describe *authoring intent* — who owns the data — rather than *runtime restriction*. Conventions match the four-domain split: developer-authored values come from `.values`; Ops-authored sizing comes from `.infra`; cross-component coordinates come from the topology pipe.

When a deliberate cross-pillar bridge is needed — e.g., a Component's `cueSchema` exposes a developer-facing dial that flows into Ops-side `infra` per [vocabulary/inheritance-and-interface.md](inheritance-and-interface.md) "CUE Inheritance: Bridging Intent to Infrastructure" — the architecture treats the bridge as a deliberate exception. See "Cross-pillar mechanics" below.

## Values

The `values:` pillar carries developer-authored cognitive payload — the configuration the developer dictates per component instance. The Component's `cueSchema` declares the values shape; the developer's Aggregate populates concrete values per instance.

**Authored at:**

- Aggregate `components.<id>.values:` — per-component-instance cognitive payload.
- Aggregate `subsystems.<name>.<id>.values:` — same, inside subsystem-grouped components.
- Aggregate `features.<id>.values:` — Feature attachment values payload.
- Aggregate `secrets.<id>.values:` — credential Feature attachment values (vault-query parameters).

**Forbidden in:**

- Release entity (the Release schema bans a `values:` block at every nesting level — Parameter Hoisting is the supported per-environment-variation path; see Parameters below).

**Validated by:** Component `cueSchema`'s `values:` block (and Feature `cueSchema`'s `values:` block for Feature attachments), unified at Component / Feature load time per [vocabulary/validation-surface.md](validation-surface.md) Layer 2.

**Consumed by:** Recipe `valuesMapping:` templates via `.values`. The full TemplateContext exposes the resolved values dictionary at every Phase B template site.

## Infra

The `infra:` pillar carries Ops-authored physical sizing — replicas, resource requests, IOPS limits, region pinning, machine class. It expresses *where and how big*, complementing values' *what and how it behaves*.

### Four authoring surfaces

Authors encounter `infra:` at four distinct surfaces, each with different scope and different cascade behaviour:

| # | Surface | Scope | Merge precedence |
| --- | --- | --- | --- |
| 1 | Release boundary `infra:` | Per-boundary defaults | Lowest (overridden by surfaces 2-4) |
| 2 | Release boundary `components.<id>.infra:` | Per-component-instance under that boundary | Overrides boundary defaults for the named component |
| 3 | Release boundary `features.<id>.infra:` | Per-feature-attachment under that boundary | Same precedence as 2 — feature-attachment-scoped |
| 4 | Release boundary `components.<id>.features.<id>.infra:` (and equivalent for `secrets`) | Per-attachment-on-component | Highest specificity — overrides surfaces 1-3 for that exact attachment |

Surfaces 1 and 2 are the most-authored pair: an Ops engineer declares boundary-level defaults (e.g., `replicas: 3` for production) and overrides per-component where a specific instance needs different sizing. Surfaces 3 and 4 cover Feature-attachment sizing — Features carry their own infra payload that the FeatureRecipe consumes when synthesising sidecars or per-Feature resources.

### "Infra primarily localized" — the rule with exceptions

The architectural target for `infra:` is component-local: a component's sizing applies to that component instance and does not bleed across components. This is the mechanism that lets Ops increase database IOPS without affecting the API server's CPU request.

**The rule (current state):** `infra:` is **primarily localized** to the surface that authored it. Cascade exceptions exist by design:

- **Boundary annotation cascade.** Boundary `annotations:` cascade through nested boundaries to inner components (Surface 5 of the annotation matrix in [labels-and-annotations.md](labels-and-annotations.md)). Annotations consumed by Recipes as routing input become indirect `infra` reach — the boundary-level annotation flows through `.context.annotations.release` into the per-node Recipe's rendered output.
- **Release inheritance via `extends:`.** A Release that `extends:` a parent Release inherits the parent's `infra` declarations across surfaces 1-4 unless the child overrides per-key. The inheritance is deep-merge with child-wins-on-collision; it crosses the per-Release boundary deliberately.
- **CUE-driven cross-pillar piping.** A Component's `cueSchema` can expose a developer-facing `values` field that pipes into `infra` via CUE unification (see "Cross-pillar mechanics — CUE Inheritance bridge" below). Strictly speaking the value originates in `values` and flows into `infra`; the cascade is intra-instance but cross-pillar.

The historical phrasing "strictly localized" overstates the localization — it implies a wall the engine doesn't enforce. **"Primarily localized"** is the accurate framing: localization is the design intent; cascades exist as deliberate exceptions documented at the relevant surface.

## Provides

The `provides:` pillar is **derived** — a Recipe declares it, but unlike `values` / `infra`, the developer does not author it directly. Recipes compute the public output strings the topology pipe will consume.

A Recipe's `provides:` block is a map of `<key>: <template>` pairs. Each template evaluates against the Recipe's own pillars (`.values`, `.infra`, `.locals`, `.metadata`, `.context.instance_id`) at Step 5 Pass 1. The resulting strings are exposed via `.provides` and consumed by callers' `uses[].inject` blocks via `from: "<key>"` references.

**Self-containment invariant.** Recipe `provides:` templates must not reference `.context.inject` or `.context.uses`. Pass 1 evaluates provides templates in any order — they close over the node's own data only, so the order does not matter. Cross-node references would couple Pass 1 evaluation to topological iteration order, which the design deliberately avoids. See [`templates/expansion-matrix.md`](../templates/expansion-matrix.md) row 6 for the rule and its rationale.

**Why `provides:` is a pillar.** The output strings are the canonical public surface of every Recipe; downstream consumers (caller `uses[].inject`, FeatureRecipe `injectMapping` blocks reading the target's resolved provides via `.context.uses`) treat the dictionary as a typed contract. Naming `provides:` as a pillar acknowledges its first-class status alongside `values` / `infra` / `uses` / `secrets`. Treating it as "just a Recipe internal" understates its role as the topology pipe's primary data source.

## Uses

The `uses:` pillar is the topological-edge declaration. A component instance's `uses:` block names the edges the component participates in — the sockets it consumes targets through. The full grammar is documented at [topology-triad.md](topology-triad.md); this section names `uses:` as a pillar for completeness.

`uses:` lives on Aggregate component instances + feature attachments; the runtime template context exposes the JOIN projection over outbound edges as `.context.uses`. The projection carries each edge's resolved target metadata (target's `provides`, labels, annotations) so callers' Recipes can read cross-component pointer strings at Phase B template evaluation.

## Secrets pillar

The `secrets:` keyword appears at four distinct authoring surfaces in the corpus. The audit's design question (finding 6.9) was whether the four surfaces form one logical pillar or four distinct concepts. The resolution: **one logical pillar with four authoring surfaces**.

The four surfaces:

| Surface | Where authored | Role |
| --- | --- | --- |
| Component `secretsSchema:` | Component catalog entity | Declares the credential slots the Component needs; gates the inject allowlist (env / file / blackbox per slot) |
| Aggregate `components.<id>.secrets.<slot>:` | Aggregate component instance | Requests a credential Feature for the slot; supplies vault-query `values:` and (for White-Box slots) `inject:` mapping |
| Workload `containers.<name>.secrets.<KEY>.from`/`as:` | Recipe's Workload body | References Component-declared slots and dictates per-container delivery |
| FeatureRecipe `pipeline:` (Two-Part Plugin Principle) | Credential FeatureRecipe | Implements runtime resolution — Fetcher generates vault-fetch CRD; Injector mounts into target container |

The four surfaces are **the same pillar** in the sense that:

- Every credential flows through all four surfaces in the canonical pattern (Component declares → Aggregate requests → Workload references → FeatureRecipe resolves).
- The slot name is the load-bearing identifier across all four surfaces; surface 1 declares it, surfaces 2-4 reference it.
- The credential pillar's data flow is single-direction (declare → request → reference → resolve) rather than cross-cutting.

For the six-touchpoint authoring checklist, see [examples/04-secrets.md](../examples/04-secrets.md) "The secret-delivery checklist".

## Locals

The `locals:` pillar is Recipe-private state. A Recipe declares `locals:` at Phase B preamble; the resulting strings are visible only inside the Recipe's own subsequent templates (`provides:`, `valuesMapping:`, `workload:`, `artifacts:`).

**Authored at:** Recipe `spec.locals:` block — a map of `<key>: <template>` pairs evaluated at Phase B preamble against `.values` / `.infra` / `.context.*` / `.metadata`.

**Visibility:** Recipe-private. `.locals` does not appear on caller `.context.uses[].locals` (no such field exists); other entities cannot read this Recipe's locals.

**Use cases:**

- Computing Recipe-internal pointer strings (e.g., `secret_target_admin_password: "{{ .context.instance_id }}-redis-auth"`) that the Recipe's `valuesMapping:` consumes plus a credential FeatureRecipe reads via `.context.uses[].locals` (when the credential FeatureRecipe is wired to read its target's locals — typically through the catalog-published-pointer Black-Box pattern).
- DRY-ing repeated computed values inside one Recipe (a hostname computed once, referenced from multiple `valuesMapping:` fields).
- Intermediate values for complex template logic that would be unreadable inline.

### `provides:` and `locals:` — public face vs private face

The two Recipe-side pillars carry a deliberate visibility split that authors should hold in mind:

- **`provides:` is the public face.** Every key is the canonical topology pipe surface — downstream callers' `uses[].inject` blocks consume them via `from: "<key>"` references. The `provides:` dictionary is a typed contract that callers depend on; renaming or removing a key is a breaking change to every Recipe whose `uses[].inject` declarations reference it.
- **`locals:` is the private face.** Every key is Recipe-internal state visible only inside the Recipe's own subsequent templates. No caller can read a Recipe's locals; the names in `locals:` are not part of any published interface and renaming them is a Recipe-internal refactor with no downstream effect.

The split is deliberate per the architectural separation of Recipe internals (private) from Recipe interface (public). Authors treating `provides:` and `locals:` as one namespace lose the visibility distinction and risk exposing internal state through the topology pipe — every key declared in `provides:` becomes part of the Recipe's contract surface, whether or not the author intended it. The discipline target: declare a key in `locals:` first; promote to `provides:` only when a downstream caller actually needs it.

A future per-key visibility annotation (`@visible: public/private` or similar) could let one declaration carry both kinds of state with explicit per-key marking. The current separation by pillar is the simpler shape and the one that ships today; per-key annotations remain an authoring discussion rather than planned shipping work.

## Parameters

Both the `Aggregate` and `Release` schemas carry a `parameters` dictionary at their root. Developers declare the keys the Aggregate expects; Ops fills the values from environment-specific Release files. This decoupling is the mechanism for GitOps promotion: a single immutable `Aggregate.yaml` moves through Dev, Staging, and Production environments, with each environment's Release supplying its own parameter values.

```yaml
# aggregate.yaml
spec:
  parameters:
    corp_db_name: ""
    env_workers: ""
    region: ""
    enable_debug: ""
  components:
    my-backend:
      type: core/python-worker:1.0.0
      values:
        workers: "{{ .parameters.env_workers }}"
        region: "{{ .parameters.region }}"
```

```yaml
# release-prod.yaml
spec:
  aggregate: my-app
  manifest: prod-manifest
  parameters:
    corp_db_name: "enterprise_data"
    env_workers: "10"
    region: "eu-west-1"
    enable_debug: "false"
  parametersFrom:
    - "./prod-values.yaml"    # Deep-merged into the parameters map
```

**Parameter lifecycle.** The compiler interpolates parameters into the Aggregate's YAML strings during Step 1 (before CUE validation runs), then purges them from the in-memory context. Parameters do not persist as a live pillar through the compilation pipeline; they exist only as raw YAML template strings (`{{ .parameters.X }}`) at authoring time and as resolved string values during Step 1 interpolation.

### The parameter-hoisting checklist

Every cross-environment value flows through four authoring touchpoints in sequence. The mental model authors carry: for any value that varies between Dev / Staging / Production, expect to touch the Aggregate (declare), the values template (reference), the Release (fulfill), and the Recipe template (consume).

| Step | Surface | Action |
| --- | --- | --- |
| 1 | Aggregate `spec.parameters.<name>` | **Declare** the parameter as part of the Aggregate's typed authoring contract. Today the value is a string-valued slot; the typed-parameters extension under development will add `type` / `description` / `default` / `enum` / range constraints per slot. |
| 2 | Component `values:` template inside the same Aggregate | **Reference** the parameter via `{{ .parameters.<name> }}` from inside the `values:` block of any component (or feature, or sub-aggregate) that consumes it. The reference is a Go template expression — the compiler evaluates it during Step 1 interpolation. |
| 3 | Release `spec.parameters.<name>` (or `parametersFrom:` external file) | **Fulfill** the parameter with the environment-specific value at the Release surface. Per-environment Release files supply different values for the same parameter key without modifying the Aggregate. |
| 4 | Recipe `valuesMapping:` template | **Consume** the resolved value via `{{ .values.<key> }}` — the Recipe sees the post-interpolation `values:` dictionary and never sees `.parameters` directly. The `parameters` pillar is purged after Step 1; only the resolved values dictionary flows through to Step 5 rendering. |

The four touchpoints are sequential and load-bearing: skipping the Aggregate declaration leaves the Release with no slot to fulfill; skipping the values reference leaves the Recipe with no value to consume; skipping the Release fulfilment leaves the parameter empty. The compiler validates the chain across Step 1 (interpolation) and downstream CUE validation of the resulting `values:` dictionary; mismatches surface as either an unfilled-template error or a CUE constraint violation against the typed values schema.

The pattern is the canonical mechanism for GitOps promotion: a single immutable Aggregate moves through environments with each environment's Release supplying its own parameter values. Every per-environment value an author wants to vary belongs in the parameter chain rather than embedded directly in the Aggregate.

*Typed parameter contracts — declaring `type`, `description`, `default`, `enum`, and `min`/`max` constraints per parameter key to validate values before interpolation — are under active development. Today `parameters` are simple string-valued keys; type validation errors surface during CUE validation of the component `values` they flow into, rather than at the parameter-contract level. The typed form will enable earlier diagnostics when it ships.*

## Per-pillar `extends:` merge semantics

When a catalog entity declares `extends:` and the compiler walks the inheritance chain, each pillar's content merges per pillar-specific rules. The semantics differ across pillars; the table below is the canonical per-pillar reference.

| Pillar | Merge behaviour on `extends:` chain |
| --- | --- |
| `values` (CUE schema) | Schemas unify via CUE's `&` operator. Monotonic — child can narrow parent constraints; cannot relax. |
| `infra` (CUE schema fragment) | Same as `values` — CUE unification, monotonic. |
| `provides` (Recipe template map) | Top-level shallow replacement: child key fully replaces parent key for the same name; sibling keys preserved from parent. Templates are not unified; the child's template fully owns its slot. |
| `uses` (`usesSchema`) | CUE unification per socket — child socket schema unified with parent's; monotonic. Child cannot widen parent's selector. |
| `secrets` (`secretsSchema` per-slot CUE) | Per-slot CUE unification with monotonic narrowing. Child can add new slots; cannot relax parent slot constraints. |
| `locals` (Recipe template map) | Top-level shallow replacement — same as `provides`. |
| `parameters` (Aggregate root map) | Aggregate `extends:` is not currently supported (Aggregate doesn't carry an `extends:` field); the question is moot today. Release `extends:` produces deep-merge with child-wins. |

The general pattern: **CUE-validated pillars use CUE unification (monotonic narrowing)**; **template-authored pillars use shallow per-key replacement**. CUE unification protects schema contracts (a child cannot relax a parent's compliance rule); template replacement gives the child full ownership of any template slot it declares.

For the inheritance mechanism itself, see [inheritance-and-interface.md](inheritance-and-interface.md) "Inheritance via `extends`".

## Cross-pillar mechanics

D-03's signposts framing permits cross-pillar reads everywhere except the documented self-containment surfaces. Three patterns formalise common cross-pillar mechanics; one anti-pattern is documented honestly so authors recognise the trade-off.

### CUE Inheritance bridge — deliberate exception

A Component's `cueSchema` can pipe a developer-facing `values:` field into the Ops-side `infra:` block via CUE unification:

```cue
values: { required_iops: int }
infra: { iops_limit: values.required_iops }
```

The bridge is a **deliberate exception** to the values-vs-infra authoring split. The developer dictates the dial through a typed `values` field; CUE pipes the resulting integer into `infra` so the Ops Recipe receives the physical sizing without the developer authoring infrastructure code. The pattern is documented at [inheritance-and-interface.md](inheritance-and-interface.md) "CUE Inheritance: Bridging Intent to Infrastructure" with worked examples.

When the schema-language migration replaces CUE with JSON Schema 2020-12 + custom merger, the bridge pattern continues with the equivalent JSON-Schema-bridge mechanic; the architectural intent (declared cross-pillar piping) carries forward.

### Cross-pillar `inject` accumulator

The `.context.inject` pipe is the merge point of three pillar-spanning sources:

1. **Component-level self-inject** (`component.inject`) — sources strings from the component's own `values` and own `provides`.
2. **Uses-inject** (`uses[].inject`) — sources strings from the target's `provides`.
3. **FeatureRecipe `injectMapping:` interceptions** — sources strings from any of the above plus the FeatureRecipe's own `infra:` payload.

By the time Phase B runs, `.context.inject.<mechanism>.<key>` has accumulated entries from all three sources. The accumulator is cross-pillar by construction — entries originating in `values`, `provides`, and `infra` all flow into the same `.context.inject` map. Recipes consuming `.context.inject` see post-merge state without needing to know which pillar contributed which entry.

For the inject grammar and collision rules, see [topology-triad.md](topology-triad.md).

### Cross-pillar constraint duplication

A field that lives in two pillars with different validation layers can carry duplicate constraints. The canonical example: a port number declared in a Component's `usesSchema` (CUE-validated, range `>=1, <=65535`) and the same port number consumed in a Workload's `services.<name>.ports.<port>` field (validated by the Provider's `workloadSchema`, which may add a `>=1024` rule for non-privileged ports).

When CUE allows port 80 but `workloadSchema` rejects ports below 1024, the runtime fires the `workloadSchema` rejection at Step 5 Phase B — the Layer 3 validation per [validation-surface.md](validation-surface.md). The CUE constraint passed; the second layer caught the violation.

The duplication is deliberate: each layer covers a different concern. CUE governs the cognitive contract (the developer's `usesSchema` declaration). The Provider's `workloadSchema` governs the rendered-output contract (what the helm engine will accept). When both apply to the same field, the strictest wins; authors who hit the second layer's rejection see a `CATALOG_ERROR:` attributed to the Recipe-Provider pairing.

### Feature attachment / Component pillar isolation

A Feature attachment does **not** write into the parent Component's pillars. Each attached Feature carries its own pillar payload (its own `values:` block, its own `infra:` block, its own `secrets:` block when applicable). The FeatureRecipe synthesising the Feature's resources reads its own pillar payload independently of the Component's; the rendered output for the Feature lives alongside the Component's rendered output but does not merge into the Component's primary resources.

Two consequences for authors:

- A `values:` setting on a Feature attachment does not appear in the Component's `valuesMapping:` template's `.values`. The Component sees only its own values.
- A Feature's `infra:` payload does not flow into the Component's `infra:`. Each attached Feature has its own physical sizing scoped to the Feature's resources.

The isolation is explicit per the architecture's separation of concerns: Features are independent contributors layered onto Components via the 5-Tier Onion Model. For the attachment surfaces and ordering, see [labels-and-annotations.md](labels-and-annotations.md) "D-12 Feature attachment — five surfaces".

## Pillar validation tiers

The pillars carry validation across three tiers. Each tier covers a different concern; the same field can be validated by more than one tier (see "Cross-pillar constraint duplication" above).

| Tier | What it validates | Where it runs |
| --- | --- | --- |
| 1 — JSON Schema envelope | Structural shape (which keys are present, types match the field declarations) | Step 1, per file load |
| 2 — CUE schema (`cueSchema` / `secretsSchema` / `usesSchema`) | Per-pillar typed content with monotonic narrowing on `extends:` chains | Step 1, after envelope passes |
| 3 — Provider `workloadSchema` / `baseSchema` | Recipe output and Workload content gated by the bound Provider's schema | Step 5 Phase B, after valuesMapping resolves |

Tier 2 is post-migration replaced by JSON Schema 2020-12 + custom merger per the schema-language migration; the per-pillar validation discipline carries forward unchanged.

For the four-layer error-shape table and per-layer error prefixes, see [validation-surface.md](validation-surface.md).

## Default-value mechanisms

Default values appear across the corpus through several distinct mechanisms. Authors encounter the word "default" in five+ contexts; the table below is the canonical reference for which mechanism produces a value when the author leaves a field empty.

| # | Mechanism | Where authored | Trigger |
| --- | --- | --- | --- |
| 1 | CUE schema default (`*"value"`) | Component / Feature `cueSchema` | Field validates with the default when the developer omits the key |
| 2 | JSON Schema `default:` | (post-migration) Component / Feature schema | Same as 1 — the post-migration replacement |
| 3 | Go template `\| default <expr>` | Recipe `valuesMapping:`, Workload body, FeatureRecipe templates | Inline pipeline — the value falls back to `<expr>` when the upstream field is empty / absent |
| 4 | Sprig `default` function (`{{ default <expr> .field }}`) | Same as 3 | Function form of the same fallback semantic |
| 5 | Recipe `locals:` fallback | Recipe `locals:` template | A locals entry computes a default-bearing string the rest of the Recipe consumes |
| 6 | Provider `baseSchema` defaults | Provider entity `cueSchema` | Provider engine populates missing values per its own schema defaults |
| 7 | Per-engine generative defaults | Provider engine code (e.g., helm sourceless mode) | Engine-internal defaults for unauthored fields (e.g., `replicas: 1`, `image: aggrega/placeholder:latest`) |

**Recommended placement guidance.** When a default value is genuinely part of the type contract (e.g., "this port is 5432 by default unless the developer overrides it"), the **CUE / JSON Schema default** (mechanism 1 / 2) is canonical — IDE autocomplete surfaces the default; validation tooling honours it; the contract carries with the Component / Feature catalog entity. When the default is a Recipe-internal shortcut (e.g., "if no replica count is declared, use 1"), the **Go template `| default`** (mechanism 3) is appropriate — the default lives in the Recipe's authoring intent, not the Component contract.

Mechanism 7 (engine generative defaults) is the lowest-priority surface. Authors should not rely on engine defaults silently — the helm sourceless mode's `aggrega/placeholder:latest` image default exists as a guardrail against missing-image-key crashes, not as a production value.

## Cross-references

- [`inheritance-and-interface.md`](inheritance-and-interface.md) — `extends:` mechanism, `implements:` Interface Binding, CUE Inheritance bridge.
- [`topology-triad.md`](topology-triad.md) — `provides`, `inject`, `uses` topological mechanics.
- [`labels-and-annotations.md`](labels-and-annotations.md) — content-side metadata vocabulary distinct from data pillars (the five-pillar canonical list above does not include labels / annotations / publishing fields — those are metadata vocabulary).
- [`publishing-surface.md`](publishing-surface.md) — publishing-side metadata vocabulary distinct from data pillars.
- [`validation-surface.md`](validation-surface.md) — four schema-validation layers including the three pillar-validation tiers above.
- [`templates/expansion-matrix.md`](../templates/expansion-matrix.md) — per-template-site availability for cross-pillar reads + self-containment rules at Recipe `provides:` and `source:`.
- [`examples/04-secrets.md`](../examples/04-secrets.md) — credential pillar's six-touchpoint authoring checklist.
- [`architecture/06-data-taxonomy-and-composition.md`](../../architecture/06-data-taxonomy-and-composition.md) — canonical conceptual framing for the five DSL structural keywords.
