# Labels and annotations

Aggrega entities carry two structurally similar metadata mechanisms — `metadata.labels` and `metadata.annotations` — plus annotation-bearing fields scattered across boundary-cascading and feature-attachment surfaces. Six distinct surfaces author or carry annotation/label content, each with different cascade rules, different consumers, and different prefix conventions. This page documents the surfaces in one place, defines the three semantic buckets the runtime template context exposes, names the prefix discipline authors should follow, and documents the five Feature-attachment surfaces side-by-side so they are visible alongside the broader labels/annotations vocabulary.

## The six annotation- and label-bearing surfaces

Authors encounter labels and annotations on six distinct surfaces. Each carries a different scope, a different cascade rule, and a different consumer.

| # | Surface | Scope | Cascade rule | Primary consumer |
| --- | --- | --- | --- | --- |
| 1 | Catalog entity `metadata.labels` | Per-entity identity (Component, Feature, Aggregate) | Does not cascade to instances; carried on the catalog entity itself | Catalog discovery, Studio filtering, governance verdict roles (when shipped) |
| 2 | Component `metadata.labels` (intrinsic) | Per-Component-instance properties (`component.aggrega.ai/type` etc.) | Cascades into IR per-node `.context.labels` after `label-transform` mutations | Selector matching (`usesSchema` `selector:` declarations, carried as `x-aggrega-selector:` in the synthesized JSON Schema), Recipe template logic |
| 3 | Component `metadata.annotations` | Per-Component-instance traits authored by the Architect | Cascades into IR per-node `.context.annotations.catalog` bucket | governance verdict roles (intrinsic-trait policies), Recipe template logic |
| 4 | Aggregate / Subsystem `annotations:` | Aggregate-side cognitive metadata | Cascades into IR per-node `.context.annotations.aggregate` bucket | Recipe `valuesMapping:` for cognitive routing |
| 5 | Release boundary `annotations:` | Ops-side physical metadata, including `aggrega.ai/*` well-known annotations | Cascades into IR per-node `.context.annotations.release` bucket | Providers (helm reads `aggrega.ai/namespace`; compose derives network name from same key); FeatureRecipe `injectMapping:` for cross-boundary routing |
| 6 | Manifest `features.annotations` bindings | Annotation-key → Feature-type binding with pillar-grouped subkey routing (`maps.infra` / `maps.values`) for annotation-driven Feature attachment | The annotation-expansion sub-phase of resolution walks Release boundaries (outer-to-inner) and Aggregate subsystems (outer-to-inner); per-component override and whole-value / per-subkey null opt-out apply; side-vs-pillar enforcement gates which pillar fires per authoring side | Annotation-driven Feature expansion (synthetic Feature attachments tagged `Origin: "annotation"`) |

Surfaces 4 and 5 share a YAML shape (an `annotations:` map at the cascading boundary) but cascade into distinct IR buckets — the bucket distinction is the load-bearing rule the runtime exposes. Surface 6 is structurally separate: it lives on the Manifest entity rather than on Aggregate / Release content, and its consumption is gated by the annotation-driven expansion pass.

## The three-bucket `.context.annotations.*` semantic

When the renderer evaluates a Recipe template, the per-node `.context.annotations` field carries three named buckets. Each bucket is a flat `string → string` map keyed by annotation name; the bucket determines who authored the annotation and what its intent is.

- **`.context.annotations.release`** — Release boundary annotations (Surface 5). Used to govern physical realities; renderers route these into `infra:` fields where appropriate. The `aggrega.ai/*` well-known annotations live in this bucket.
- **`.context.annotations.catalog`** — Component-metadata annotations (Surface 3). Immutable intrinsic traits authored by the Architect; primarily consumed by Wasm policy plugins.
- **`.context.annotations.aggregate`** — Aggregate subsystem annotations (Surface 4). Cognitive metadata; renderers route these into `values:` payloads where appropriate.

### Three-bucket separation is a Social Contract

The compiler does not enforce the bucket boundaries. The three buckets share a flat `string → string` shape; a Recipe's template can read all three, and nothing prevents a Release boundary annotation from being interpreted as a cognitive metadata field or a catalog annotation from being routed into `infra:`. The separation is **authoring discipline**, not a compiler guarantee.

The discipline target — what the buckets are *intended* to express:

- **release** = "where this component runs, governed by Ops"
- **catalog** = "what this component is, authored by the Architect"
- **aggregate** = "what this component does, authored by the Developer"

When authors honour the separation, downstream tooling can read the right bucket for the right concern. When authors violate it (e.g., putting cognitive metadata in `release` annotations because the Release file is convenient), the runtime still works but the bucket's intent is muddled.

### `linter.wasm` opportunity — cross-bucket reads

A future `linter.wasm` plugin (out-of-band advisory; see [`plugins/plugin-contract.md`](../plugins/plugin-contract.md) for the placement criterion) can flag cross-bucket reads where a Recipe's template pulls from a bucket whose intent doesn't match the field being routed. The criterion:

- Reading `.context.annotations.release` to populate a `values:` field — flag (cognitive metadata should come from the `aggregate` bucket).
- Reading `.context.annotations.aggregate` to populate an `infra:` field — flag (physical metadata should come from the `release` bucket).
- Reading `.context.annotations.catalog` to populate either `values:` or `infra:` — typically advisory only (catalog annotations are intrinsic traits; routing them into pillars is unusual but not always wrong).

The criterion is forward-looking — `linter.wasm` is `planned` per the Wasm plugin contract page; no in-compiler enforcement today. The discipline is upheld by reviewers and authors who follow the bucket-intent convention.

## Prefix discipline

Annotation and label keys follow a uniform `<namespace>/<name>` shape. Three reserved prefix families govern who may author keys under each prefix:

| Prefix | Owner | Purpose | Examples |
| --- | --- | --- | --- |
| `aggrega.ai/` | Aggrega platform only | Platform-native annotations consumed directly by the provider | `aggrega.ai/namespace`, `aggrega.ai/region`, `aggrega.ai/environment` |
| `feature.aggrega.ai/` | Official standard library | Feature-annotation shortcuts bound in Manifest `features.annotations` | `feature.aggrega.ai/tls-pinning`, `feature.aggrega.ai/data-masking` |
| `component.aggrega.ai/` | Official standard library | Component-intrinsic trait labels (the `component.aggrega.ai/type` selector key lives here) | `component.aggrega.ai/type` |
| `aggregate.aggrega.ai/` | Official standard library | Aggregate module-level identity labels | `aggregate.aggrega.ai/tier`, `aggregate.aggrega.ai/compliance` |
| `<any-other-domain>/` | Enterprise / community | Custom annotations and labels | `acme.com/billing-tier`, `corp/cost-center` |

Authors writing custom annotations use a domain they control (typically reverse-DNS style). Authoring under `aggrega.ai/` directly (without a sub-prefix) is reserved for the platform; the Manifest's `features.annotations` bindings cannot bind keys directly under `aggrega.ai/` either — see [`entities/manifest.md`](../entities/manifest.md) "`aggrega.ai/` Prefix Reservation".

## Provenance labels emitted on rendered output

Beyond the inbound annotations the providers consume, Aggrega also **emits** provenance labels onto every rendered Kubernetes manifest and every emitted compose service. The label set lets downstream tooling (cost dashboards, observability stacks, GitOps controllers) attribute runtime resources back to the catalog content that produced them.

The shipping label set, emitted uniformly by the helm, helm-chart, and compose providers:

| Label | Source | Always emitted? |
| --- | --- | --- |
| `app.kubernetes.io/name` | Node ID (or, for a resource a FeatureRecipe emits, the identifier derived for that attachment — see below) | Yes on Kubernetes manifests; not emitted on compose services (the standard label is K8s-specific) |
| `aggrega.ai/component-id` | Node ID (or, for a resource a FeatureRecipe emits, the identifier derived for that attachment — see below) | Yes |
| `aggrega.ai/recipe-uri` | `<recipe-name>:<recipe-version>` of the producing Recipe (or producing FeatureRecipe for FR-emitted resources) | When the producing entity has both name and version set |
| `aggrega.ai/boundary-path` | Boundary path the component was routed into | When the boundary path is non-empty |
| `aggrega.ai/aggregate-name` | Aggregate `metadata.name` | When set |
| `aggrega.ai/compiler-version` | Compiler version stamped at build time | When set |
| `aggrega.ai/environment` | Release `metadata.environment` | When the Release sets it |
| `aggrega.ai/sync-wave` | Per-boundary `syncWave` integer driving GitOps deployment ordering | When non-zero |

For resources a FeatureRecipe emits, the `aggrega.ai/component-id` value is built from the attachment rather than from the host component's name, and how it is built depends on where the Feature is attached. Either way the result is a valid Kubernetes label string, and either way the value is also the naming basis for the resources that FeatureRecipe generates — on a Kubernetes target it is the prefix of the rendered output files and the Helm release name those resources render against — so it is an identity inside the cluster and not only a label.

Either way the value is **composed** from the parts you wrote, joined by `--`, behind a fixed opening that says which of the two it is. Two openings are in use, and a component identity you write may open with neither — which is what keeps a name you wrote and a name Aggrega composed from ever being mistaken for one another.

Where the Feature is attached to a **component**, the parts are a fixed `cfr` opening, the identity of the component the Feature is attached to, and the key it is attached under. A Feature attached to component `api` under `mon` reaches `cfr--api--mon`. The host component is part of the value because one Feature name attached to several components emits a separate set of resources on each, and each set needs an identity of its own: attaching `mon` to both `api` and `worker` reaches `cfr--api--mon` and `cfr--worker--mon` rather than one value for both. An attachment named exactly after the component hosting it reaches a value distinct from that component's own for the same reason — `mon` attached to `mon` reaches `cfr--mon--mon`.

Where the Feature is attached to a **boundary** — the `compose-bridge` gateway service is the canonical example — the parts are a fixed `bfr` opening, then each segment of the boundary's path outermost first, then the name the Feature is attached under. A Feature named `gateway` on a boundary at `bridge` reaches `bfr--bridge--gateway`; the same Feature on a boundary at `prod/eu` reaches `bfr--prod--eu--gateway`.

A character a label value cannot carry is written out rather than replaced, so a hyphen you wrote stays a hyphen and anything else becomes a short escape: a Feature named `my zone` contributes `my-zx000020zone`. Two attachments you can tell apart therefore reach two values — whatever you named them, and however deep the boundary sits — because `--` is a run no written part can contain, so moving the division between the parts changes the value instead of colliding with it.

How long a composed value may be is the **target's** answer rather than a number Aggrega holds: the target the resources are rendered for is asked, and the value is shortened until that target accepts it. A Kubernetes label value carries at most 63 characters, and a Helm release name derived from the same identity is bounded tighter still, so the same attachment can settle shorter under one target than under another. A value that fits is emitted exactly as composed, which is the ordinary case and the case for every attachment in the standard-library catalog. One that does not is shortened: each part keeps its beginning, and a ten-character digest of the whole identity is appended behind a marker no name you can write produces — so a shortened value is recognisable as one and can never be read as a value that fitted. A deeply nested `gateway` attachment can therefore render as `bfr--region-region-region-region-r--gateway-gate---ze24e3a2ba5e`. Two shortened values are very unlikely to meet, and a build halts rather than letting two of them share a name if they do.

See [`errors/fatal-halts.md`](../errors/fatal-halts.md) “The same name is derived more than once inside the output” for which pairs halt and how to separate them.

The `aggrega.ai/recipe-uri` for an FR-emitted resource resolves to the FeatureRecipe's own `name:version`, not the consuming Recipe's identity — so downstream tooling reading `recipe-uri` to identify the producing entity gets the correct provenance for both component-emitted and FR-emitted output.

For per-provider emission specifics (where on the rendered output the labels land, and how each provider serialises them), see [`providers/well-known-annotations.md`](../providers/well-known-annotations.md) "Provenance labels emitted by providers".

## Recipe-declared output labels

Alongside the compiler-owned provenance set, a Recipe author can declare their own labels to stamp onto the Recipe's rendered output, via `Recipe.spec.outputLabels:`. These ride the same emission rail as the provenance labels — they are merged into the same label set and land wherever provenance lands — but they are author-owned rather than compiler-owned. The intended use is a *realization trait*: a property of how a specific Recipe realizes a component (for example `hosting: managed` versus `hosting: self-hosted` for a managed-service Recipe versus a self-hosted-chart Recipe of the same component type), surfaced on the output so cost, policy, and inventory tooling can query it.

The `aggrega.ai/` and `app.kubernetes.io/` namespaces are reserved for the provenance set; an `outputLabels` key under either prefix is rejected at load. A validated `outputLabels` map is therefore always disjoint from the provenance keys, so the two never collide on the merged output. Per-provider surfacing (helm object and pod-template on synthesis; object on source-render and artifacts; compose service labels; terraform per-resource tags on `.tf.json` artifact bodies) matches the provenance placement, and is documented in full on the [Recipe entity page](../entities/recipe.md) under "The `outputLabels:` field".

## Feature attachment — five surfaces

Features attach to Components through five distinct authoring surfaces, each with different scope, intended user, and ordering precedence within the 5-Tier Onion Model. The full attachment ordering and the Onion Model itself are documented at [`architecture/10-compilation-pipeline.md`](../../architecture/10-compilation-pipeline.md); the table below enumerates the five surfaces side-by-side.

| Tier | Surface | Authored by | Scope | Cascade rule |
| --- | --- | --- | --- | --- |
| 1 | Aggregate component `features:` block | Developer | Per-component-instance (granular) | None — author-direct |
| 2 | Aggregate subsystem `features:` block | Developer | Subsystem scope (cross-cutting within Aggregate) | Cascades to every component in the subsystem |
| 3 | Release boundary `components.<id>.features` | Ops | Per-component-instance (granular, Ops side) | None — author-direct |
| 4 | Release boundary `features:` block | Ops | Boundary scope (cross-cutting within boundary) | Cascades to every component in the boundary |
| 5 | Manifest `features.annotations` expansion | Platform Operator | Annotation-driven (synthetic attachment) | Cascades through the boundary tree (Release-side) or subsystem tree (Aggregate-side); per-component override and per-subkey null opt-out apply |

The five surfaces accumulate; an attachment present at any surface contributes to the Component's resolved feature set. When the same Feature instance name appears on more than one surface, the contributions merge into one attachment rather than replacing one another, and a type mismatch between them halts the build with a feature-merge-conflict error.

The five surfaces are deliberate per the architecture's separation of concerns — Developer (tiers 1-2), Ops (tiers 3-4), Platform Operator (tier 5) — rather than redundant. Authors choose the surface that matches who owns the attachment and at what scope.

### Attachment precedence

When two contributions supply the same field of the same attachment, four rules decide which one the rendered output carries. They are applied **in this order**, and the order is what makes the outcome predictable:

1. **Origin.** An explicitly authored contribution beats an annotation-driven one, whichever scope either was declared at. Writing a field down in a `features:` block is how an author overrides what an annotation would have contributed, and an annotation never silently displaces something written by hand. The compiler records the suppressed annotation alongside the winning value and reports it as an advisory, so the override is visible rather than mysterious.
2. **Pillar ownership.** Each domain fills its own pillar: the Aggregate surfaces contribute `values`, the Release surfaces contribute `infra`. Because the two sides never write the same pillar, a developer contribution and an operator contribution cannot contest the same field — there is no developer-versus-operator precedence question to answer.
3. **Composition authority.** A declaration in the Aggregate you are deploying outranks a declaration inside an Aggregate it composes, even when the composed Aggregate declared at the narrower scope. Composition stays authoritative: a module cannot defeat the Aggregate that consumes it merely by choosing a narrower scope.
4. **Specificity.** Within one authoring level and one pillar, the narrower scope refines the broader one, **field by field**. A component-scoped attachment overrides a subsystem-wide or boundary-wide attachment of the same instance name — but only for the fields it actually mentions. Fields the narrower scope leaves out keep the broader scope's values, so a shared attachment can supply the common configuration while a single component adjusts one field of it. Two contributions at the same scope resolve by author order, with the later one winning, which is what lets an inner subsystem refine an outer one and a deeper boundary refine a shallower one.

Precedence governs field values. It does not reorder **evaluation**: the sequence in which the compiler folds the surfaces, and in which it executes each attachment's pre-render `injectMapping`, is the fixed five-tier sequence documented in [`architecture/10-compilation-pipeline.md`](../../architecture/10-compilation-pipeline.md). An attachment's authored `inject` block follows that evaluation sequence rather than the scope ranking above, so one attachment never carries two competing orderings.

## Per-entity expansion of `metadata.labels` and `metadata.annotations`

The current pre-expansion state has `metadata.labels` on Component / Feature / Aggregate and on all four library kinds (SchemaLibrary / MappingLibrary / WorkloadLibrary / ArtifactsLibrary); `metadata.annotations` on the same set except Aggregate, which is labels-only. Manifest, Release, Recipe, FeatureRecipe, Plugin currently lack both. Expanding both fields uniformly across every entity kind (with use-case documentation per entity) is the documented design target; the schema change is small per entity and the per-entity examples are introduced as the design lands.

The expansion is gradual — schema additions are additive and per-entity, so authors can ignore the additions until a use case applies. Each entity's intended use cases for the new fields:

- **Recipe / FeatureRecipe `metadata.labels`** — implementation-side classification (which Wasm runtime stack a Recipe targets, which experimental flag gates the Recipe's behaviour).
- **Recipe / FeatureRecipe `metadata.annotations`** — implementation-side authoring intent (declared deprecation timeline, expected migration target Recipe).
- **Manifest `metadata.labels` / `annotations`** — workspace identity (which Git branch / environment / per-team workspace the Manifest belongs to).
- **Release `metadata.labels`** — environment-attribution complementing `metadata.environment` (per the roadmap (see Status of the Language), environment is moving to optional; labels can carry the same intent without the schema-level requirement).
- **Release `metadata.annotations`** — Release-shape provenance (issue tracker references, release-decision authoring trail).

Labels and annotations are not yet uniform across catalog kinds — `metadata.annotations` sits on a subset of the kinds carrying `metadata.labels`, and some kinds carry neither. The expansion target makes the labels/annotations vocabulary uniform across every catalog kind. The expansion does not retrofit existing content — adding labels or annotations to an entity that has none carries them through the IR's per-node metadata struct or the catalog provenance struct as appropriate.

## Cascade summary

The cascade rules across the six surfaces, as evaluated by the compiler:

1. **Catalog entity labels (Surface 1)** stay on the catalog entity. They do not flow to instances; consumers read them by inspecting catalog content directly.
2. **Component `metadata.labels` (Surface 2)** flow into the per-node `.context.labels` after the optional `label-transform` pass at topology construction.
3. **Component `metadata.annotations` (Surface 3)** flow into the per-node `.context.annotations.catalog` bucket.
4. **Aggregate / Subsystem `annotations:` (Surface 4)** cascade through the subsystem hierarchy, accumulating from outer subsystems inward, into the per-node `.context.annotations.aggregate` bucket.
5. **Release boundary `annotations:` (Surface 5)** cascade through the boundary hierarchy from outer boundaries inward, into the per-node `.context.annotations.release` bucket.
6. **Manifest `features.annotations` (Surface 6)** does not cascade to per-node IR data directly; the annotation-driven expansion sub-phase of resolution consumes the bindings to synthesise per-node Feature attachments tagged with `Origin: "annotation"` provenance. The synthetic attachments are structurally indistinguishable from explicit ones downstream of resolution except via provenance inspection — see [`providers/well-known-annotations.md`](../providers/well-known-annotations.md) for the full expansion teaching and [`architecture/13-catalog-and-registry.md`](../../architecture/13-catalog-and-registry.md) §"Annotation-driven Feature expansion" for the catalog-load and inspect-time mechanics.

For the canonical cascading-annotation design, see [`architecture/06-data-taxonomy-and-composition.md`](../../architecture/06-data-taxonomy-and-composition.md) §2 (Flow 5).

## Cross-references

- [`templates/template-context-contract.md`](../templates/template-context-contract.md) — runtime view of `.context.labels` and the three `.context.annotations.*` buckets.
- [`providers/well-known-annotations.md`](../providers/well-known-annotations.md) — per-provider boundary annotation matrix and provenance label emission asymmetry.
- [`entities/manifest.md`](../entities/manifest.md) — Manifest's `features.annotations` binding surface (Surface 6).
- [`vocabulary/publishing-surface.md`](publishing-surface.md) — uniform metadata vocabulary that complements labels/annotations on the publishing side.
- [`plugins/plugin-contract.md`](../plugins/plugin-contract.md) — `linter.wasm` placement criterion for advisory checks on cross-bucket reads.
- [`architecture/06-data-taxonomy-and-composition.md`](../../architecture/06-data-taxonomy-and-composition.md) — canonical cascading-annotation design.
- [`architecture/10-compilation-pipeline.md`](../../architecture/10-compilation-pipeline.md) — 5-Tier Onion Model that orders Feature attachment.
