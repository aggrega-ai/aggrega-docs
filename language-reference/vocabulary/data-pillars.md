# Data pillars

The conceptual framing of the five DSL structural keywords — `parameters`, `values`, `uses`, `infra`, `inject` — lives in [architecture/06-data-taxonomy-and-composition.md](../../architecture/06-data-taxonomy-and-composition.md). This page covers the canonical data-pillar list, per-pillar authoring semantics, cross-pillar mechanics, and the default-value vocabulary that authors encounter across pillars. The complementary topology triad (`provides`, `inject`, `uses` — keywords that wire graph edges) is documented at [topology-triad.md](topology-triad.md); the metadata vocabulary distinct from the data pillars (labels, annotations, publishing-surface fields) lives at [labels-and-annotations.md](labels-and-annotations.md) and [publishing-surface.md](publishing-surface.md).

## Canonical pillar list

Aggrega entities carry seven named data pillars. Five participate in the IR data flow as live state through rendering; two are transient or private and exist only at specific compilation stages.

| Pillar | Lives on | Lifecycle | Role |
| --- | --- | --- | --- |
| `values` | Aggregate component / attachment instances | Live through rendering | Developer-authored cognitive payload |
| `infra` | Release component / boundary / attachment instances | Live through rendering | Operator-authored physical sizing |
| `provides` | Recipe `provides:` block | Live through rendering (derived pillar — see below) | Recipe-computed public output strings the topology pipe consumes |
| `uses` | Aggregate component / feature instances | Live through rendering | Topological edges to other components / features |
| `features` | Aggregate + Release component instances; slots declared in a catalog entity's `featuresSchema` — see "Features pillar" below | Live through rendering | Attachment pillar — one shape for every attachment family |
| `parameters` | Aggregate + Release roots | Readable through end-of-pipeline, until every render phase completes; accessible to path templates during rendering via the asymmetric grant; value-template TemplateContexts consume the post-interpolation literals rather than `.parameters` directly | Per-environment slots fulfilled by the Release |
| `locals` | Recipe `locals:` block | Recipe-private — visible only inside the Recipe's own templates | Computed string state Recipes derive in the locals preamble |

`values` / `infra` / `provides` / `uses` / `features` are the **five live pillars** the runtime template context exposes through `.values`, `.infra`, `.provides`, `.context.uses`, and `.features` respectively. `parameters` and `locals` are off the live-pillar list — `parameters` because it does not survive resolution; `locals` because it is Recipe-private and never crosses entity boundaries.

The pillar-walls-vs-signposts question resolves with **signposts**: the template engine permits cross-pillar reads at every site unless explicitly forbidden by self-containment rules (Recipe `provides:` and Recipe `source:` block reading `.context.inject` / `.context.uses`; documented at [`templates/expansion-matrix.md`](../templates/expansion-matrix.md)). Pillar boundaries are authoring discipline, not language enforcement.

## Pillar boundaries and authoring discipline

Cross-pillar reads from a Recipe template are unrestricted at every site that allows the full TemplateContext. Authoring discipline expects authors to:

- Read `.values` for cognitive payload (Developer-authored intent).
- Read `.infra` for physical sizing (Operator-authored sizing).
- Read `.context.uses[].provides.<key>` for cross-component pointer strings (the topology triad's data flow).
- Read `.context.inject` for the post-hydration delivery pipe (assembled from inject sources across `component.inject`, `uses[].inject`, and FeatureRecipe `injectMapping` interceptions).

The discipline is **signposts**, not walls. A Recipe template that reads `.infra.replicas` to drive a `values:` field works; the template engine does not gate the read. The architecture's framing is that pillar boundaries describe *authoring intent* — who owns the data — rather than *runtime restriction*. Conventions match the four-domain split: Developer-authored values come from `.values`; Operator-authored sizing comes from `.infra`; cross-component coordinates come from the topology pipe.

When a deliberate cross-pillar bridge is needed — e.g., a Component's `schema:` exposes a developer-facing dial that the Recipe's `valuesMapping:` template pipes into Ops-side `infra:`-shaped output per [vocabulary/inheritance-and-interface.md](inheritance-and-interface.md) — the architecture treats the bridge as a signposted exception. See "Cross-pillar mechanics" below.

## Values

The `values:` pillar carries Developer-authored cognitive payload — the application-shape parameters the Developer dictates per component instance. The Component's `schema:` declares the values shape; the Developer's Aggregate populates concrete values per instance. This is the Developer's domain.

**Authored at:**

- Aggregate `components.<id>.values:` — per-component-instance cognitive payload.
- Aggregate `subsystems.<name>.<id>.values:` — same, inside subsystem-grouped components.
- Aggregate `features.<id>.values:` — attachment values payload, whatever family the attached Feature belongs to (a credential attachment's vault-query parameters are authored here like any other).

**Forbidden in:**

- Release entity (the Release schema bans a `values:` block at every nesting level — Parameter Hoisting is the supported per-environment-variation path; see Parameters below).

**Validated by:** Component `schema`'s `values:` block (and Feature `schema`'s `values:` block for Feature attachments), resolved to JSON Schema 2020-12 at Component / Feature load time per [vocabulary/validation-surface.md](validation-surface.md) Layer 2.

**Consumed by:** Recipe `valuesMapping:` templates via `.values`. The full TemplateContext exposes the resolved values dictionary at every base-rendering template site.

## Infra

The `infra:` pillar carries Operator-authored physical sizing — replicas, resource requests, IOPS limits, region pinning, machine class. It expresses *where and how big*, complementing values' *what and how it behaves*. This is the Operator's domain.

### Four authoring surfaces

Authors encounter `infra:` at four distinct surfaces, each with different scope and different cascade behaviour:

| # | Surface | Scope | Merge precedence |
| --- | --- | --- | --- |
| 1 | Release boundary `infra:` | Per-boundary defaults | Lowest (overridden by surfaces 2-4) |
| 2 | Release boundary `components.<id>.infra:` | Per-component-instance under that boundary | Overrides boundary defaults for the named component |
| 3 | Release boundary `features.<id>.infra:` | Per-feature-attachment under that boundary | Same precedence as 2 — feature-attachment-scoped |
| 4 | Release boundary `components.<id>.features.<id>.infra:` | Per-attachment-on-component | Highest specificity — overrides surfaces 1-3 for that exact attachment |

Surfaces 1 and 2 are the most-authored pair: an Operator declares boundary-level defaults (e.g., `replicas: 3` for production) and overrides per-component where a specific instance needs different sizing. Surfaces 3 and 4 cover Feature-attachment sizing — Features carry their own infra payload that the FeatureRecipe consumes when synthesizing sidecars or per-Feature resources.

### "Infra primarily localized" — the rule with exceptions

The architectural target for `infra:` is component-local: a component's sizing applies to that component instance and does not bleed across components. This is the mechanism that lets Ops increase database IOPS without affecting the API server's CPU request.

**The rule (current state):** `infra:` is **primarily localized** to the surface that authored it. Cascade exceptions exist by design:

- **Boundary annotation cascade.** Boundary `annotations:` cascade through nested boundaries to inner components (Surface 5 of the annotation matrix in [labels-and-annotations.md](labels-and-annotations.md)). Annotations consumed by Recipes as routing input become indirect `infra` reach — the boundary-level annotation flows through `.context.annotations.release` into the per-node Recipe's rendered output.
- **Release inheritance via `extends:`.** A Release that `extends:` a parent Release inherits the parent's `infra` declarations at every surface that carries them, unless the child overrides per-key. The child's value wins key by key, down to the first indivisible value — a scalar, a list, a template — which replaces whole, and a key the child writes as `null` is removed rather than set to nothing. The inheritance crosses the per-Release boundary deliberately; for the whole fold rule and what else travels with it, see [`entities/release.md`](../entities/release.md#composite-release-and-extends-inheritance).
- **Schema-bridge cross-pillar piping.** A Component's `schema:` can expose a developer-facing `values:` dial that the Recipe's `valuesMapping:` template pipes into the provider's `infra:`-shaped output (see "Cross-pillar mechanics — Schema-bridge cross-pillar piping" below). Strictly speaking the value originates in `values:` and flows into the rendered output; the cascade is intra-instance but cross-pillar.

The phrase "strictly localized" overstates the localization — it implies a wall the engine doesn't enforce. **"Primarily localized"** is the accurate framing: localization is the design intent; cascades exist as deliberate exceptions documented at the relevant surface.

**Side-vs-pillar partition for annotation-driven Feature expansion.** The Aggregate-as-Authoring-Surface invariant carries through to the annotation-driven Feature expansion path: Aggregate-side annotations (subsystem and component-instance scope) may only fire `maps.values` subkeys; Release-side annotations (boundary and component-instance scope) may only fire `maps.infra` subkeys. A Manifest binding can declare paths in both pillars; each side fires only its compatible subset, and cross-side composition merges the contributions per-field at IR build time. The partition preserves the values-developer / infra-operator authoring separation at the annotation surface — the same separation `values:` and `infra:` enforce on the explicit-attachment surfaces. See [`providers/well-known-annotations.md`](../providers/well-known-annotations.md) §"Side-vs-pillar partition per subkey" for the per-subkey teaching and the cross-side composition pattern.

## Provides

The `provides:` pillar is **derived** — a Recipe declares it, but unlike `values` / `infra`, the developer does not author it directly. Recipes compute the public output strings the topology pipe will consume.

A Recipe's `provides:` block is a map of `<key>: <template>` pairs. Each template evaluates against the Recipe's own self-contained surface (`.values`, `.infra`, `.context.instance_id`, `.context.rendered_name` where the node's provider reports one, and the node's resolved `.locals`) during provides evaluation. The resulting strings are exposed via `.provides` and consumed by callers' `uses[].inject` blocks via `from: "<key>"` references. `.locals` is available because the node's locals resolve in that stage's preamble, ahead of its provides (see [Locals](#locals) below); naming a key the locals block does not declare halts.

**Self-containment invariant.** Recipe `provides:` templates must not reference `.context.inject` or `.context.uses`. Provides evaluation runs those templates in any order — they close over the node's own data only, so the order does not matter. Cross-node references would couple that evaluation to topological iteration order, which the design deliberately avoids. See [`templates/expansion-matrix.md`](../templates/expansion-matrix.md) row 6 for the rule and its rationale.

**Why `provides:` is a pillar.** The output strings are the canonical public surface of every Recipe; downstream consumers (caller `uses[].inject`, FeatureRecipe `injectMapping` blocks reading the target's resolved provides via `.context.uses`) treat the dictionary as a typed contract. Naming `provides:` as a pillar acknowledges its first-class status alongside `values` / `infra` / `uses` / `features`. Treating it as "just a Recipe internal" understates its role as the topology pipe's primary data source.

## Uses

The `uses:` pillar is the topological-edge declaration. A component instance's `uses:` block names the edges the component participates in — the sockets it consumes targets through. The full grammar is documented at [topology-triad.md](topology-triad.md); this section names `uses:` as a pillar for completeness.

`uses:` lives on Aggregate component instances + feature attachments; the runtime template context exposes the JOIN projection over outbound edges as `.context.uses`. The projection carries each edge's resolved target metadata (target's `provides`, labels, annotations) so callers' Recipes can read cross-component pointer strings at base-rendering template evaluation, and the attachments written on that connection, at `.context.uses.<alias>.features.<slot>`.

## Features pillar

`features:` is the attachment pillar: one keyword, one shape, every attachment. An operational Feature, a credential Feature and an identity Feature are all declared here under the instance name the author chooses. The runtime template context exposes the node's attachments as `.features.<name>`, each carrying `type`, `values`, `infra` and the attachment's resolved `provides`. An attachment written on one of the component's connections is exposed in that same shape under the connection instead, at `.context.uses.<alias>.features.<slot>`, and never under `.features` — so a Recipe ranging `.features` meets only the component's own attachments (see [the template context contract](../templates/template-context-contract.md#a-connections-attachments--contextusesaliasfeatures)).

An attachment whose instance name matches a slot the entity declares in `featuresSchema` **fills** that slot; any other instance name is a **free** attachment. Filling a slot is what connects the four surfaces a slot-based credential travels:

| Surface | Where authored | Role |
| --- | --- | --- |
| Component / Feature `featuresSchema:` | catalog entity | Declares the slots the entity expects; per slot, gates the delivery allowlist (env / file / blackbox) and optionally a label selector the fill must satisfy |
| Aggregate `components.<id>.features.<slot>:` | Aggregate component instance | Fills the slot with an attachment; supplies the attachment's own `values:` and, for a transparent slot, its `inject:` mapping |
| Workload `containers.<name>.attachments.<KEY>.from`/`as:` | Recipe's Workload body | References a declared slot — or, beside `connection: <alias>`, a slot that connection's socket declares — and dictates per-container delivery of what filled it |
| FeatureRecipe (`source` / `workload` / `artifacts` / `valuesMapping`, `injectMapping`, `pipeline:`) | the bound FeatureRecipe | Produces the attachment's output — an emitted resource, a delivery rewrite, or both |

The slot name is the load-bearing identifier across all four: surface 1 declares it, surfaces 2–4 reference it, and the data flow is single-direction (declare → fill → reference → produce).

For the authoring checklist, see [examples/04-secrets.md](../examples/04-secrets.md) "The secret-delivery checklist".

## Locals

The `locals:` pillar is Recipe-private state. The whole block resolves in the locals preamble, ahead of that node's `provides:`; the resulting strings are visible to every one of the Recipe's own later templates — `provides:`, `source:`, `valuesMapping:`, `workload:`, `artifacts:`, `assertions:`, `pipeline[].with`. A `provides:` template naming a key the block does not declare halts.

**Authored at:** Recipe `spec.locals:` block — a map of `<key>: <template>` pairs evaluated against a self-contained node-local surface: `.context.instance_id`, `.values`, `.infra`, and the entries of the same block already resolved. Nothing else is on it: `.provides`, `.metadata`, and the rest of `.context.*` are not, and a reference to one halts.

**Order is load-bearing.** Entries resolve in written order and an entry may read a sibling **defined above it**, receiving its resolved value. Chaining runs downward only — where one entry reads another, moving the definition below its reader is refused, and the compiler never reorders the block to make the reference resolve. A reference to a later entry halts naming the ordering fault; a reference to an undeclared key halts naming the key. On a Recipe whose `source:` is a structured block, both faults are refused while the artifact it names is pinned as well, so `aggrega pull` reports them before any build renders output. The check reads the path a reference **resolves to** rather than the keystrokes, so it reaches the direct form, a `with .locals` block, and a variable bound to `.locals` alike. Two spellings it does not cover: a key reached through a function, such as `index .locals`, and a key read off a parenthesised block, `(.locals).<key>` or `($.locals).<key>`. An absent key reached either way does not halt, and it renders the literal text `<no value>` rather than nothing at all — except through `index` itself, which halts naming the key on every template surface when the map it reads does not hold it.

**Visibility:** Recipe-private. There is no `.context.uses[].locals` field — a caller cannot read its target's locals through the edge. What a caller may read is the target's `provides:`.

**Use cases:**

- Computing Recipe-internal pointer strings (e.g., `secret_target_admin_password: "redis-auth"`, the suffix of a Secret's name) that the Recipe's `valuesMapping:` and `provides:` both consume, and that a credential FeatureRecipe attached to the same component reads as `.locals.secret_target_admin_password` — an attachment's templates see the host Recipe's resolved locals merged with the attachment's own. On the `helm` target each of them writes the full name as `{{ .context.rendered_name }}-{{ .locals.secret_target_admin_password }}`: the rendered name is the component's name spelled in the characters a Kubernetes name allows, and a local cannot read it, so the local carries the suffix and every reader joins the two.
- DRY-ing repeated computed values inside one Recipe (a hostname computed once, referenced from multiple `valuesMapping:` fields).
- Intermediate values for complex template logic that would be unreadable inline.

### `provides:` and `locals:` — public face vs private face

The two Recipe-side pillars carry a deliberate visibility split that authors should hold in mind:

- **`provides:` is the public face.** Every key is the canonical topology pipe surface — downstream callers' `uses[].inject` blocks consume them via `from: "<key>"` references. The `provides:` dictionary is a typed contract that callers depend on; renaming or removing a key is a breaking change to every Recipe whose `uses[].inject` declarations reference it.
- **`locals:` is the private face.** Every key is Recipe-internal state visible only inside the Recipe's own subsequent templates. No caller can read a Recipe's locals; the names in `locals:` are not part of any published interface and renaming them is a Recipe-internal refactor with no downstream effect.

The two are also ordered: `locals:` resolves first, so `provides:` may read `.locals` but `locals:` may not read `.provides`. Publishing a local's value through `provides:` therefore means adding a `provides` entry that **reads** the local — the expression stays in one place.

The split is deliberate per the architectural separation of Recipe internals (private) from Recipe interface (public). Authors treating `provides:` and `locals:` as one namespace lose the visibility distinction and risk exposing internal state through the topology pipe — every key declared in `provides:` becomes part of the Recipe's contract surface, whether or not the author intended it. The discipline target: declare a key in `locals:` first; promote to `provides:` only when a downstream caller actually needs it.

A future per-key visibility annotation (`@visible: public/private` or similar) could let one declaration carry both kinds of state with explicit per-key marking. The current separation by pillar is the simpler shape and the one that ships today; per-key annotations remain an authoring discussion rather than planned shipping work.

## Parameters

Both the `Aggregate` and `Release` schemas carry a `parameters` dictionary at their root. Developers declare the keys the Aggregate expects; Ops fills the values from environment-specific Release files. This decoupling is the mechanism for GitOps promotion: a single immutable `Aggregate.yaml` moves through Dev, Staging, and Production environments, with each environment's Release supplying its own parameter values.

```yaml
# aggregate.yaml
spec:
  parameters:
    corp_db_name:
      type: string
      required: true
    env_workers:
      type: integer
      required: true
    region:
      type: string
      required: true
    enable_debug:
      type: boolean
      required: true
  components:
    my-backend:
      type: core/python-worker:1.0.0
      values:
        workers: {{ .parameters.env_workers }}
        region: "{{ .parameters.region }}"
```

```yaml
# release-prod.yaml — inline parameter values
spec:
  aggregate: my-app
  manifest: prod-manifest
  parameters:
    corp_db_name: "enterprise_data"
    env_workers: 10
    region: "eu-west-1"
    enable_debug: false
```

For CI/CD flows that keep the parameter values in a separate file (e.g., a per-environment `.yaml` checked in alongside the Release), the Release uses the `$import:` form: `parameters: { $import: ./prod-values.yaml }`. The file's content replaces the inline map at the Release surface. The path is resolved from the directory holding the Release, wherever a command is run from, and must lead to a file inside the workspace — or, for a Release named outside the workspace, inside the directory holding it. Multi-file layering (combining a base file with an environment-specific overlay) is expressed by Release `extends:` chains — the parent Release supplies base parameters; the child Release extends and overrides per-key.

**Parameter lifecycle.** The compiler resolves parameters across three phases. (1) Parameter contract validation — the typed `parameters:` contract validates each Release-supplied value against its declared `type` / `enum` / `min` / `max` / `pattern` constraints. (2) Default fill — slots with `default:` defined and no Release value receive their default. (3) Interpolation — the compiler walks the Aggregate's YAML strings and replaces every `{{ .parameters.<slot> }}` reference inside value-template surfaces with the resolved value. The merged map then stays readable through rendering — path-template eval, inject mapping, the base-rendering sub-stages, feature-rendering dispatch, per-(path, provider) assembly — so that path templates (Release boundary `directory:` / `subDirectory:`) can read `.parameters.<slot>` directly at orchestrator time against the closed allowlist documented at [`../path-template-variables.md`](../path-template-variables.md). Value-template surfaces (Recipe `valuesMapping`, FeatureRecipe `injectMapping` / `provides` / `pipeline.with`, Workload bodies) do NOT receive `.parameters` in their TemplateContext — they consume the resolved values written into the surrounding `values:` strings by phase 3 interpolation.

### The parameter-hoisting checklist

Every cross-environment value flows through four authoring touchpoints in sequence. The mental model authors carry: for any value that varies between Dev / Staging / Production, expect to touch the Aggregate (declare), the values template (reference), the Release (fulfill), and the Recipe template (consume).

| Step | Surface | Action |
| --- | --- | --- |
| 1 | Aggregate `spec.parameters.<name>` | **Declare** the parameter as part of the Aggregate's typed authoring contract. Each parameter slot carries a declared `type` (`string`, `integer`, `number`, `boolean`, `array`, `object`), an optional `description`, an optional `default`, optional value-space constraints (`enum`, `min`, `max`, `pattern`, `minLength`, `maxLength`), and optional nested structure for object-typed slots. The contract validates each Release-supplied value before interpolation. |
| 2 | Component `values:` template inside the same Aggregate | **Reference** the parameter via `{{ .parameters.<name> }}` from inside the `values:` block of any component (or feature, or sub-aggregate) that consumes it. The reference is a Go template expression — the compiler evaluates it during resolution's interpolation phase. |
| 3 | Release `spec.parameters.<name>` (inline or `parameters: { $import: ./path.yaml }`) | **Fulfill** the parameter with the environment-specific value at the Release surface. Per-environment Release files supply different values for the same parameter key without modifying the Aggregate. |
| 4 | Recipe `valuesMapping:` template | **Consume** the resolved value via `{{ .values.<key> }}` — the Recipe is a value-template surface; its TemplateContext does not carry `.parameters` directly. Per-environment variation reaches the Recipe through the post-interpolation `values:` dictionary that the interpolation phase above writes. (Path templates on Release boundaries are the carve-out: they read `.parameters.<slot>` directly at render-orchestration time per the asymmetric grant.) |

The four touchpoints are sequential and load-bearing: skipping the Aggregate declaration leaves the Release with no slot to fulfill; skipping the values reference leaves the Recipe with no value to consume; skipping the Release fulfilment leaves the parameter empty. The compiler validates the chain during resolution (parameter contract validation against the typed `parameters:` declaration, then interpolation into the surrounding `values:` strings, then JSON Schema validation of the resulting `values:` dictionary against the Component or Feature `schema:`); mismatches surface as either a parameter-contract violation (caught against the typed `parameters:` declaration), an unfilled-template error (caught at interpolation), or a JSON Schema constraint violation against the `values:` schema (caught at schema validation).

The pattern is the canonical mechanism for GitOps promotion: a single immutable Aggregate moves through environments with each environment's Release supplying its own parameter values. Every per-environment value an author wants to vary belongs in the parameter chain rather than embedded directly in the Aggregate.

## Per-pillar `extends:` merge semantics

When a catalog entity declares `extends:` and the compiler walks the inheritance chain, each pillar's content merges per pillar-specific rules. The semantics differ across pillars; the table below is the canonical per-pillar reference.

| Pillar | Merge behaviour on `extends:` chain |
| --- | --- |
| `values` (JSON Schema 2020-12) | On a Feature chain, schemas compose via JSON Schema 2020-12 composition. An extending Component authors no pillar content and receives its base's block exactly as the base authored it, at every depth of a chain. |
| `infra` (JSON Schema 2020-12 fragment) | Same as `values` — composed on a Feature chain, inherited whole by an extending Component. |
| `provides` (Recipe template map) | Top-level shallow replacement: child key fully replaces parent key for the same name; sibling keys preserved from parent. Templates are not composed; the child's template fully owns its slot. |
| `uses` (`usesSchema`) | Per-socket whole-entry overlay by socket name. A child adds sockets its base does not declare, and a socket it redeclares under an existing name replaces that entry outright — its value and infra schemas and its `selector` together. Socket entries are not composed, and nothing compares a redeclared `selector` against the base's. |
| `features` (`featuresSchema` per-slot schema) | Per-slot whole-entry overlay by slot name, on the same terms as `usesSchema`. A child adds slots freely; a slot it redeclares replaces the base's entry outright rather than composing with it. |
| `locals` (Recipe template map) | Top-level shallow replacement — same as `provides`. |
| `parameters` (Aggregate root map) | Aggregate `extends:` is not currently supported (Aggregate doesn't carry an `extends:` field); the question is moot today. On a Release `extends:` chain a map-valued parameter deep-merges with child-key wins, a scalar-valued one is child-replaced, and a key the child writes as `null` is removed. |

The general pattern turns on the kind and on the surface. **A Feature's schema-validated pillars compose** under JSON Schema 2020-12. **An extending Component's pillars are inherited whole** — it authors none, so its contract is its base's exactly, and a base's constraint therefore cannot be relaxed, by construction. **The fixed-shape surfaces — `usesSchema` and `featuresSchema` — overlay by name** on both kinds: a child adds entries, and an entry it redeclares replaces the base's outright. **Template-authored pillars use shallow per-key replacement**, giving the child full ownership of any template slot it declares.

An extending Component tightens a constraint through `assertions:` rather than through a pillar — a predicate it adds, evaluated alongside the ones it inherits. See [inheritance-and-interface.md](inheritance-and-interface.md) for that mechanism.

For the inheritance mechanism itself, see [inheritance-and-interface.md](inheritance-and-interface.md) "Inheritance via `extends`", which covers the catalog kinds. A Release is not a catalog entity and folds by its own rule; that rule is in [`entities/release.md`](../entities/release.md#composite-release-and-extends-inheritance) "Composite Release and `extends:` inheritance".

## Cross-pillar mechanics

The signposts framing permits cross-pillar reads everywhere except the documented self-containment surfaces. Three patterns formalise common cross-pillar mechanics; one anti-pattern is documented honestly so authors recognise the trade-off.

### Schema-bridge cross-pillar piping — signposted, not walled

The pillar boundaries are authoring discipline: the architecture signposts what goes where (`values:` for developer cognitive intent, `infra:` for Ops physical sizing, `provides:` for Recipe-emitted strings, and so on) and the catalog reviewer enforces the convention. The template engine itself permits cross-pillar reads unless the documented self-containment rules forbid them (Recipe `provides:` does not see `.context.inject`; FeatureRecipe boundary-scope `provides:` does not see per-consumer fields). The pillar walls are signposts, not enforcement.

A canonical signposted exception: a Component's `schema:` can declare a developer-facing `values:` dial that the Recipe's `valuesMapping:` template pipes into the rendered `infra:`-shaped output. The developer dictates intent through a typed `values:` field; the Recipe template pipes the resulting value into the provider's infrastructure layer without the developer authoring infrastructure code. A worked example:

```yaml
# Component schema declares a developer-facing dial in values
spec:
  schema:
    values:
      required_iops: { type: integer, min: 100 }
```

```yaml
# Recipe valuesMapping pipes the developer's intent into the provider's infra-side knob
valuesMapping:
  iops_limit: "{{ .values.required_iops }}"
```

The bridge is documented at [inheritance-and-interface.md](inheritance-and-interface.md) with worked examples. The architectural intent (a declared cross-pillar dial that the Recipe pipes through) carries one direction — developer-side `values:` flowing into Ops-side rendered output — and lands in the Recipe's mapping templates, not in the Component schema itself. The pillar boundary stays signposted: the developer sees `values:`, the Recipe sees both `values:` and `infra:`, the rendered output combines them.

### Cross-pillar `inject` accumulator

The `.context.inject` pipe is the merge point of three pillar-spanning sources:

1. **Component-level self-inject** (`component.inject`) — sources strings from the component's own `values` and own `provides`.
2. **Uses-inject** (`uses[].inject`) — sources strings from the target's `provides`.
3. **FeatureRecipe `injectMapping:` interceptions** — sources strings from any of the above plus the FeatureRecipe's own `infra:` payload.

By the time base rendering runs, `.context.inject.<mechanism>.<key>` has accumulated entries from all three sources. The accumulator is cross-pillar by construction — entries originating in `values`, `provides`, and `infra` all flow into the same `.context.inject` map. Recipes consuming `.context.inject` see post-merge state without needing to know which pillar contributed which entry.

For the inject grammar and collision rules, see [topology-triad.md](topology-triad.md).

### Cross-pillar constraint duplication

A field that lives in two pillars with different validation layers can carry duplicate constraints. The canonical example: a port number declared in a Component's `usesSchema` (JSON-Schema-validated, range `min: 1, max: 65535`) and the same port number consumed in a Workload's `services.<name>.ports.<port>` field, for which the provider-rendering plugin's `spec.provider.workloadSchema` may add a `min: 1024` rule for non-privileged ports. **This per-provider `workloadSchema` content validation is honest-pending** (see [validation-surface.md](validation-surface.md) Layer 3 and the roadmap's Wasm-based Workload synthesizers item): today `workloadSchema` is documentation-only and Workload bodies are validated against the platform-owned embedded Workload schema, so the second-layer rejection described here is the designed end-state, not current behavior.

When the `usesSchema` allows port 80 but `workloadSchema` declares ports below 1024 invalid, the runtime will fire the `workloadSchema` rejection during base rendering — the Layer 3 validation per [validation-surface.md](validation-surface.md). The first layer's constraint passed; the second layer caught the violation.

The duplication is deliberate: each layer covers a different concern. The Component's `usesSchema` governs the cognitive contract (the developer's `uses:` declaration). The provider-rendering plugin's `spec.provider.workloadSchema` governs the rendered-output contract (what the provider accepts). When both apply to the same field, the strictest wins; authors who hit the second layer's rejection see a halt whose bracketed head carries the `CATALOG_ERROR` category, attributed to the Recipe and the provider that rendered it.

### Feature attachment / Component pillar isolation

A Feature attachment does **not** write into the parent Component's pillars. Each attached Feature carries its own pillar payload (its own `values:` block and its own `infra:` block). The FeatureRecipe synthesizing the Feature's resources reads its own pillar payload independently of the Component's. The isolation is of the *inputs*: what an attachment reads is its own, whatever becomes of what it writes. Where the target's provider writes discrete documents, the attachment's rendered output sits alongside the Component's under a directory of its own; where the provider folds a boundary's contributors into one document, the attachment contributes to that document as the Component does, and each resource still carries the attachment's own identity so what came from where stays readable.

Two consequences for authors:

- A `values:` setting on a Feature attachment does not appear in the Component's `valuesMapping:` template's `.values`. The Component sees only its own values.
- A Feature's `infra:` payload does not flow into the Component's `infra:`. Each attached Feature has its own physical sizing scoped to the Feature's resources.

The isolation is explicit per the architecture's separation of concerns: Features are independent contributors layered onto Components via the 5-Tier Onion Model. For the attachment surfaces and ordering, see [labels-and-annotations.md](labels-and-annotations.md) "Feature attachment — five surfaces".

### Anti-pattern: same property name in both pillars

A Component or Feature whose `spec.schema.values:` and `spec.schema.infra:` declare the same property name — at the root, at any nesting depth, or both — is a frequent authoring smell. The two pillars are separate namespaces by design (the compiler accepts the overlap), so the schema validates and the rendered output is well-formed. The smell is cognitive: readers and template authors hit "which pillar holds the `foo` I'm reading?" friction every time they scan the schema or write a template against it.

```yaml
# Smell — both pillars declare `mode`. A reader of the schema or a
# template against the Feature has to disambiguate every reference.
spec:
  schema:
    values:
      mode: { type: string }
    infra:
      mode: { type: string }
```

Authors with intentional overlap have a real reason to keep both — e.g., a `mode` that means "application operational mode" under values (`"debug"` / `"production"`) and "deployment topology mode" under infra (`"standalone"` / `"clustered"`) carry distinct semantics and the names happen to coincide. Authors with accidental overlap (the more common case) rename one entry.

A second intentional shape is one datum either author may supply. The standard library's credential Features that carry a caller's locator — `core/referenced-secret`, `core/referenced-secret-set`, `core/secret-value` and `core/secret-provided` — declare it in both pillars under one name and one shape, so the developer writes it in `values` or the operator in `infra`, and each Feature's own assertion refuses an attachment that writes it in both or in neither. The advisory below names those four on every load that reaches them; for them it reports the contract, not a slip.

Catalog load emits a `LINT: <kind> <name> at <path> declares property <name> in both values: and infra: pillars (path: <dotted-path>)` advisory for every same-name property whose overlap resolves to a terminal leaf on at least one side. Same-name properties that exist as shared organizing namespaces (both pillars carry an object named `ingress` with disjoint sub-properties) do not warn; only the leaf overlap is reported. The warning is advisory — the build proceeds.

## Pillar validation tiers

The pillars carry validation across three tiers. Each tier covers a different concern; the same field can be validated by more than one tier (see "Cross-pillar constraint duplication" above).

| Tier | What it validates | Where it runs |
| --- | --- | --- |
| 1 — JSON Schema envelope | Structural shape (which keys are present, types match the field declarations) | Resolution, per file load |
| 2 — Per-pillar schema (`schema` / `featuresSchema` / `usesSchema`) | Per-pillar typed content validated as JSON Schema 2020-12 | Resolution, after envelope passes |
| 3 — provider-capability gate | Workload content gated by the bound provider's synthesized-mode capability, documented by the provider-rendering plugin's `spec.provider.workloadSchema` | Base rendering, after valuesMapping resolves |

For the four-layer error-shape table and per-layer error prefixes, see [validation-surface.md](validation-surface.md).

## Default-value mechanisms

Default values appear across the corpus through several distinct mechanisms. Authors encounter the word "default" in five+ contexts; the table below is the canonical reference for which mechanism produces a value when the author leaves a field empty.

| # | Mechanism | Where authored | Trigger |
| --- | --- | --- | --- |
| 1 | JSON Schema `default:` (compact form `{ default: <value> }`) | Component / Feature `schema:`, Aggregate `parameters:` | Field validates with the default when the developer omits the key. For Aggregate parameters, the parameter-merge fills the declared default before contract validation runs (see [`templates/parameters-context.md`](../templates/parameters-context.md)). |
| 2 | Go template ``optional .X `Y` <fallback>`` | Recipe `valuesMapping:`, Workload body, FeatureRecipe templates, the assertion evaluator | Presence-aware fallback — returns `<fallback>` only when the key is absent from the map; an authored zero / empty / false at the key returns that authored value. The canonical Aggrega-side absent-field-fallback shape. See [`templates/sprig-functions.md`](../templates/sprig-functions.md#optional--presence-aware-fallback). |
| 3 | Go template `\| default <expr>` | Recipe `valuesMapping:`, Workload body, FeatureRecipe templates | Inline pipeline that fires on "empty" (Sprig's emptiness check — zero, empty string, false, nil). Conflates absent-from-map with present-but-zero/empty/false. Appropriate for per-call-site override semantics (the binding's fallback differs from the field's schema-level default) where the conflation is acceptable. Not appropriate for absent-field-fallback where authored zero / empty / false is a legitimate intent — use `optional` (mechanism 2) for that case. |
| 4 | Sprig `default` function (`{{ default <expr> .field }}`) | Same as 3 | Function form of mechanism 3 with the same emptiness conflation. |
| 5 | Recipe `locals:` fallback | Recipe `locals:` template | A locals entry computes a default-bearing string the rest of the Recipe consumes |

**Recommended placement guidance.** When a default value is genuinely part of the type contract (e.g., "this port is 5432 by default unless the developer overrides it"), the **JSON Schema `default:`** (mechanism 1) is canonical — IDE autocomplete surfaces the default; validation tooling honours it; the contract carries with the Component / Feature catalog entity OR with the Aggregate parameter declaration. When a Recipe template needs a fallback for an optional map key, the **`optional`** helper (mechanism 2) is the canonical absent-field-fallback shape — it distinguishes authored zero / empty / false from absence. The Go template **`| default`** (mechanism 3) is reserved for the per-call-site override case where the conflation between absent and falsy values is acceptable; reach for it only when the override semantic is the explicit intent.

## Cross-references

- [`inheritance-and-interface.md`](inheritance-and-interface.md) — `extends:` mechanism, `implements:` Interface Binding, schema-bridge cross-pillar piping.
- [`topology-triad.md`](topology-triad.md) — `provides`, `inject`, `uses` topological mechanics.
- [`labels-and-annotations.md`](labels-and-annotations.md) — content-side metadata vocabulary distinct from data pillars (the five-pillar canonical list above does not include labels / annotations / publishing fields — those are metadata vocabulary).
- [`publishing-surface.md`](publishing-surface.md) — publishing-side metadata vocabulary distinct from data pillars.
- [`validation-surface.md`](validation-surface.md) — four schema-validation layers including the three pillar-validation tiers above.
- [`templates/expansion-matrix.md`](../templates/expansion-matrix.md) — per-template-site availability for cross-pillar reads + self-containment rules at Recipe `provides:` and `source:`.
- [`examples/04-secrets.md`](../examples/04-secrets.md) — credential pillar's six-touchpoint authoring checklist.
- [`architecture/06-data-taxonomy-and-composition.md`](../../architecture/06-data-taxonomy-and-composition.md) — canonical conceptual framing for the five DSL structural keywords.
