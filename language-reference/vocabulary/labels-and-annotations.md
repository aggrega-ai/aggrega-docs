# Labels and annotations

Aggrega entities carry two structurally similar metadata mechanisms — `metadata.labels` and `metadata.annotations` — plus annotation-bearing fields scattered across boundary-cascading and feature-attachment surfaces. Six distinct surfaces author or carry annotation/label content, each with different cascade rules, different consumers, and different prefix conventions. This page documents the surfaces in one place, defines the three semantic buckets the runtime template context exposes, names the prefix discipline authors should follow, and documents the five Feature-attachment surfaces side-by-side so they are visible alongside the broader labels/annotations vocabulary.

## The six annotation- and label-bearing surfaces

Authors encounter labels and annotations on six distinct surfaces. Each carries a different scope, a different cascade rule, and a different consumer.

| # | Surface | Scope | Cascade rule | Primary consumer |
| --- | --- | --- | --- | --- |
| 1 | Catalog entity `metadata.labels` | Per-entity identity (Component, Feature, Aggregate, Provider) | Does not cascade to instances; carried on the catalog entity itself | Catalog discovery, Studio filtering, `policy-validator.wasm` (when shipped) |
| 2 | Component `metadata.labels` (intrinsic) | Per-Component-instance properties (`component.aggrega.ai/type` etc.) | Cascades into IR per-node `.context.labels` after `mutator.wasm` mutations | Selector matching (`usesSchema` `@selector()`), Recipe template logic |
| 3 | Component `metadata.annotations` | Per-Component-instance traits authored by the Architect | Cascades into IR per-node `.context.annotations.catalog` bucket | `policy-validator.wasm` (intrinsic-trait policies), Recipe template logic |
| 4 | Aggregate / Subsystem `annotations:` | Aggregate-side cognitive metadata | Cascades into IR per-node `.context.annotations.aggregate` bucket | Recipe `valuesMapping:` for cognitive routing |
| 5 | Release boundary `annotations:` | Ops-side physical metadata, including `aggrega.ai/*` well-known annotations | Cascades into IR per-node `.context.annotations.release` bucket | Provider engines (helm reads `aggrega.ai/namespace`; compose derives network name from same key); FeatureRecipe `injectMapping:` for cross-boundary routing |
| 6 | Manifest `features.annotations` bindings | Annotation-key → Feature-type binding for annotation-driven Feature attachment | Reserved for the annotation-driven expansion pass (`accepted but inert` per [Status of the Language → Compilation pipeline phases](../10-status.md#compilation-pipeline-phases)) | (planned) annotation-driven expansion |

Surfaces 4 and 5 share a YAML shape (an `annotations:` map at the cascading boundary) but cascade into distinct IR buckets — the bucket distinction is the load-bearing rule the runtime exposes. Surface 6 is structurally separate: it lives on the Manifest entity rather than on Aggregate / Release content, and its consumption is gated by the annotation-driven expansion pass.

## The three-bucket `.context.annotations.*` semantic

When the renderer evaluates a Recipe template, the per-node `.context.annotations` field carries three named buckets. Each bucket is a flat `string → string` map keyed by annotation name; the bucket determines who authored the annotation and what its intent is.

- **`.context.annotations.release`** — Release boundary annotations (Surface 5). Used to govern physical realities; renderers route these into `infra:` fields where appropriate. The `aggrega.ai/*` well-known annotations live in this bucket.
- **`.context.annotations.catalog`** — Component-metadata annotations (Surface 3). Immutable intrinsic traits authored by the Architect; primarily consumed by Wasm policy plugins.
- **`.context.annotations.aggregate`** — Aggregate subsystem annotations (Surface 4). Cognitive metadata; renderers route these into `values:` payloads where appropriate.

### Three-bucket separation is a Social Contract

The compiler does not enforce the bucket boundaries. The three buckets share a flat `string → string` shape; a Recipe's template can read all three, and nothing prevents a Release boundary annotation from being interpreted as a cognitive metadata field or a catalog annotation from being routed into `infra:`. The separation is **authoring discipline**, not an engine guarantee.

The discipline target — what the buckets are *intended* to express:

- **release** = "where this component runs, governed by Ops"
- **catalog** = "what this component is, authored by the Architect"
- **aggregate** = "what this component does, authored by the Developer"

When authors honour the separation, downstream tooling can read the right bucket for the right concern. When authors violate it (e.g., putting cognitive metadata in `release` annotations because the Release file is convenient), the runtime still works but the bucket's intent is muddled.

### `linter.wasm` opportunity — cross-bucket reads

A future `linter.wasm` plugin (out-of-band advisory; see [`wasm/plugin-contract.md`](../wasm/plugin-contract.md) for the placement criterion) can flag cross-bucket reads where a Recipe's template pulls from a bucket whose intent doesn't match the field being routed. The criterion:

- Reading `.context.annotations.release` to populate a `values:` field — flag (cognitive metadata should come from the `aggregate` bucket).
- Reading `.context.annotations.aggregate` to populate an `infra:` field — flag (physical metadata should come from the `release` bucket).
- Reading `.context.annotations.catalog` to populate either `values:` or `infra:` — typically advisory only (catalog annotations are intrinsic traits; routing them into pillars is unusual but not always wrong).

The criterion is forward-looking — `linter.wasm` is `planned` per the Wasm plugin contract page; no in-engine enforcement today. The discipline is upheld by reviewers and authors who follow the bucket-intent convention.

## Prefix discipline

Annotation and label keys follow a uniform `<namespace>/<name>` shape. Three reserved prefix families govern who may author keys under each prefix:

| Prefix | Owner | Purpose | Examples |
| --- | --- | --- | --- |
| `aggrega.ai/` | Aggrega platform only | Platform-native annotations consumed directly by engine code | `aggrega.ai/namespace`, `aggrega.ai/region`, `aggrega.ai/environment` |
| `feature.aggrega.ai/` | Official standard library | Feature-annotation shortcuts bound in Manifest `features.annotations` | `feature.aggrega.ai/tls-pinning`, `feature.aggrega.ai/data-masking` |
| `component.aggrega.ai/` | Official standard library | Component-intrinsic trait labels (the `component.aggrega.ai/type` selector key lives here) | `component.aggrega.ai/type` |
| `aggregate.aggrega.ai/` | Official standard library | Aggregate module-level identity labels | `aggregate.aggrega.ai/tier`, `aggregate.aggrega.ai/compliance` |
| `<any-other-domain>/` | Enterprise / community | Custom annotations and labels | `acme.com/billing-tier`, `corp/cost-center` |

Authors writing custom annotations use a domain they control (typically reverse-DNS style). Authoring under `aggrega.ai/` directly (without a sub-prefix) is reserved for the platform; the Manifest's `features.annotations` bindings cannot bind keys directly under `aggrega.ai/` either — see [`entities/manifest.md`](../entities/manifest.md) "`aggrega.ai/` Prefix Reservation".

## Provenance labels emitted on rendered manifests

Beyond the inbound annotations the engines consume, Aggrega also **emits** provenance labels onto rendered Kubernetes manifests. The label set lets downstream tooling (cost dashboards, observability stacks, GitOps controllers) attribute runtime resources back to the catalog content that produced them.

The current emit set, per the helm and helm-chart provider engines:

| Label | Source | Always emitted? |
| --- | --- | --- |
| `app.kubernetes.io/name` | Node ID | Yes |
| `aggrega.ai/component-id` | Node ID | Yes |
| `aggrega.ai/boundary-path` | Boundary path | When set |
| `aggrega.ai/compiler-version` | Provenance struct | When set |
| `aggrega.ai/aggregate-name` | Aggregate `metadata.name` | When set |
| `aggrega.ai/environment` | Release `metadata.environment` | When Release sets it (per D-10, environment is being made optional) |
| `aggrega.ai/sync-wave` | Per-node sync-wave | When set |

The label set is canonical for helm and helm-chart provider output. The compose provider does not emit this set today — see [`providers/well-known-annotations.md`](../providers/well-known-annotations.md) "Provenance labels emitted by providers" for the per-provider asymmetry and roadmap framing.

## Feature attachment — five surfaces

Features attach to Components through five distinct authoring surfaces, each with different scope, intended user, and ordering precedence within the 5-Tier Onion Model. The full attachment ordering and the Onion Model itself are documented at [`architecture/10-compilation-pipeline.md`](../../architecture/10-compilation-pipeline.md); the table below enumerates the five surfaces side-by-side.

| Tier | Surface | Authored by | Scope | Cascade rule |
| --- | --- | --- | --- | --- |
| 1 | Aggregate component `features:` block | Developer | Per-component-instance (granular) | None — author-direct |
| 2 | Aggregate subsystem `features:` block | Developer | Subsystem scope (cross-cutting within Aggregate) | Cascades to every component in the subsystem |
| 3 | Release boundary `components.<id>.features` | Ops | Per-component-instance (granular, Ops side) | None — author-direct |
| 4 | Release boundary `features:` block | Ops | Boundary scope (cross-cutting within boundary) | Cascades to every component in the boundary |
| 5 | Manifest `features.annotations` expansion | Platform Operator | Annotation-driven (synthetic attachment) | Cascades wherever the matched annotation appears (when the expansion pass ships; `accepted but inert` today) |

The five surfaces accumulate; an attachment present at any tier contributes to the Component's resolved feature set. When the same Feature instance name appears at multiple tiers, the resolved attachment merges per pillar (Aggregate side contributes `values`; Release side contributes `infra`); type mismatches halt the build with a feature-merge-conflict error.

The five surfaces are deliberate per the architecture's separation of concerns — Developer (tiers 1-2), Ops (tiers 3-4), Platform Operator (tier 5) — rather than redundant. Authors choose the tier that matches who owns the attachment and at what scope; the Onion Model orders evaluation so that broader tiers establish baseline and narrower tiers refine.

## Per-entity expansion of `metadata.labels` and `metadata.annotations`

The current pre-expansion state has `metadata.labels` on Component / Feature / Aggregate / Provider; `metadata.annotations` on Component / Feature only. Manifest, Release, Recipe, FeatureRecipe currently lack one or both. Expanding both fields uniformly to all eight entities (with use-case documentation per entity) is the documented design target; the schema change is small per entity and the per-entity examples land at this PR per the WP3d scope.

The expansion is gradual — schema additions are additive and per-entity, so authors can ignore the additions until a use case applies. Each entity's intended use cases for the new fields:

- **Recipe / FeatureRecipe `metadata.labels`** — implementation-side classification (which Wasm runtime stack a Recipe targets, which experimental flag gates the Recipe's behaviour).
- **Recipe / FeatureRecipe `metadata.annotations`** — implementation-side authoring intent (declared deprecation timeline, expected migration target Recipe).
- **Manifest `metadata.labels` / `annotations`** — workspace identity (which Git branch / environment / per-team workspace the Manifest belongs to).
- **Release `metadata.labels`** — environment-attribution complementing `metadata.environment` (per the roadmap (see Status of the Language), environment is moving to optional; labels can carry the same intent without the schema-level requirement).
- **Release `metadata.annotations`** — Release-shape provenance (issue tracker references, release-decision authoring trail).

The current asymmetry (3 entities have labels; 2 have annotations; 5 lack one or both) is an artifact of incremental schema growth; the expansion target makes the labels/annotations vocabulary uniform across every catalog kind. The expansion does not retrofit existing content — authors who add labels or annotations to a previously-bare entity see them carried through the IR's per-node metadata struct or the catalog provenance struct as appropriate.

## Cascade summary

The cascade rules across the six surfaces, as evaluated by the compiler:

1. **Catalog entity labels (Surface 1)** stay on the catalog entity. They do not flow to instances; consumers read them by inspecting catalog content directly.
2. **Component `metadata.labels` (Surface 2)** flow into the per-node `.context.labels` after Step 2's optional `mutator.wasm` pass.
3. **Component `metadata.annotations` (Surface 3)** flow into the per-node `.context.annotations.catalog` bucket.
4. **Aggregate / Subsystem `annotations:` (Surface 4)** cascade through the subsystem hierarchy, accumulating from outer subsystems inward, into the per-node `.context.annotations.aggregate` bucket.
5. **Release boundary `annotations:` (Surface 5)** cascade through the boundary hierarchy from outer boundaries inward, into the per-node `.context.annotations.release` bucket.
6. **Manifest `features.annotations` (Surface 6)** does not cascade to per-node IR data directly; the annotation-driven expansion pass (when shipped) consumes the bindings to synthesise per-node Feature attachments.

For the canonical cascading-annotation design, see [`architecture/06-data-taxonomy-and-composition.md`](../../architecture/06-data-taxonomy-and-composition.md) §2 (Flow 5).

## Cross-references

- [`templates/template-context-contract.md`](../templates/template-context-contract.md) — runtime view of `.context.labels` and the three `.context.annotations.*` buckets.
- [`providers/well-known-annotations.md`](../providers/well-known-annotations.md) — per-provider boundary annotation matrix and provenance label emission asymmetry.
- [`entities/manifest.md`](../entities/manifest.md) — Manifest's `features.annotations` binding surface (Surface 6).
- [`vocabulary/publishing-surface.md`](publishing-surface.md) — uniform metadata vocabulary that complements labels/annotations on the publishing side.
- [`wasm/plugin-contract.md`](../wasm/plugin-contract.md) — `linter.wasm` placement criterion for advisory checks on cross-bucket reads.
- [`architecture/06-data-taxonomy-and-composition.md`](../../architecture/06-data-taxonomy-and-composition.md) — canonical cascading-annotation design.
- [`architecture/10-compilation-pipeline.md`](../../architecture/10-compilation-pipeline.md) — 5-Tier Onion Model that orders Feature attachment.
