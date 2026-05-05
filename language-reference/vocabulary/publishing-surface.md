# Publishing surface

Every Aggrega catalog YAML carries a uniform set of metadata fields that describe the entity for catalog distribution: who maintains it, what license it ships under, where its source lives, what keywords surface it for discovery, whether it is deprecated. Together these fields constitute the **publishing surface** — the metadata vocabulary catalog publishers and tooling consumers rely on, distinct from the content-side `metadata.labels` / `metadata.annotations` mechanism documented at [`labels-and-annotations.md`](labels-and-annotations.md).

This page documents the publishing surface fields, the description-field inventory across the corpus (envelope vs instance vs field-level descriptions), the maintainer field's intended use and verified consumer, and the per-entity required-fields asymmetries (which fields each entity requires today and where the asymmetries are deliberate).

## The publishing surface fields

The following fields appear on every Domain 2 (Component, Feature) and Domain 3 (Recipe, FeatureRecipe, Provider) entity, plus on Aggregate as a reusable module. They appear on Manifest and Release as well, with reduced semantics (workspace-attribution rather than catalog-publication).

| Field | Type | Purpose | Consumer |
| --- | --- | --- | --- |
| `description` | string | Human-readable summary of the entity | Hub UI listings, IDE tooltips, `aggrega inspect` output |
| `maintainers` | array of objects | Who owns the entity (name, email, url) | Catalog provenance, IR per-node `CatalogMetadata` struct |
| `license` | string | Legal compliance (typically SPDX identifier) | Hub UI, compliance tooling, IR `CatalogMetadata` |
| `repository` | string (URL) | Git repository where source lives | Hub UI, `aggrega inspect`, IR `CatalogMetadata` |
| `home` | string (URL) | Documentation / wiki URL | Hub UI listings, IR `CatalogMetadata` |
| `keywords` | array of strings | Search / discovery tags | Hub UI search index, IR `CatalogMetadata` |
| `deprecated` | boolean | End-of-life flag | Hub UI, build-time warning (planned), IR `CatalogMetadata` |

All seven fields are optional on every entity that carries them. A catalog author who omits the entire suite produces a valid YAML — the publishing surface is for entities intended for catalog distribution; internal-use entities can omit it without consequence.

### IR consumption — `CatalogMetadata` struct

The compiler reads the publishing surface fields from each Component into a per-node `CatalogMetadata` struct that flows through the IR. The struct is populated at [`internal/compiler/ir/annotations.go:73-97`](../../../aggrega-cli/internal/compiler/ir/annotations.go#L73) (`buildCatalogMetadata` function) and surfaces in IR JSON output (`aggrega ir --blueprint`). Downstream tooling that reads the IR — Studio panels, lint rules, audit reports — consumes the metadata from this struct rather than re-reading the catalog YAML.

The struct uses an `omitempty` JSON tag plus a conditional-return pattern: when every publishing-surface field is empty / zero, `buildCatalogMetadata` returns nil and the `CatalogMetadata` field collapses out of the IR JSON entirely. The same input therefore yields the same compact output, which keeps the IR diff stable across runs.

## The three description types

The `description` field appears uniformly on the envelope, but the corpus also carries description-style strings inside CUE schemas (per-field descriptions) and inside pillar bodies (per-instance descriptions). Three distinct description types coexist; the table below disambiguates them.

| Type | Where it lives | Authored by | Purpose |
| --- | --- | --- | --- |
| Envelope description | `metadata.description` on every entity | Catalog publisher | One-line summary visible in catalog listings and IDE tooltips |
| Instance description | `description` field next to a per-instance declaration (e.g., `secretsSchema.<slot>.description`, `usesSchema.<socket>.description`) | Schema author | Per-slot / per-socket / per-port description visible to authors of consuming entities |
| Field description | CUE / JSON Schema `description:` annotation inside `cueSchema` / `secretsSchema` / `usesSchema` content | Schema author (CUE / JSON Schema syntax) | Per-field documentation surfaced by IDE autocomplete and validation tools |

The three types share the word "description" but live at structurally distinct levels. Envelope description applies to the entity as a whole; instance description applies to a declaration inside a schema slot; field description applies to a specific value inside a typed schema. Authors writing a Component:

- Set `metadata.description` once for the Component entity itself.
- Set `secretsSchema.admin_password.description` once per credential slot the Component declares.
- Set `cueSchema:` CUE-syntax `// ...` comments or `*"default" | string` documentation per field inside the embedded CUE.

The three types do not cascade and do not collide. Tooling that reads one type does not read the others — Hub UI surfaces envelope descriptions in listings; IDE autocomplete surfaces field descriptions inline; `aggrega inspect` surfaces instance descriptions when listing a Component's slots.

## Maintainer field intent

The `maintainers` field carries an array of objects, each with `name`, `email`, and `url`. The intent and verified consumer:

**Intent (informational + IR provenance).** The field is informational for catalog publishing — Hub UI lists maintainers so consumers know who to contact; CI / governance tooling reads the field to enforce repository ownership policies. The architectural intent is "who is responsible for this catalog entity"; ownership signal that travels with the entity.

**Verified consumer (IR `CatalogMetadata` struct).** The compiler reads each Component's `metadata.maintainers` into the per-node `CatalogMetadata.Maintainers` field per [`internal/compiler/ir/annotations.go:88-89`](../../../aggrega-cli/internal/compiler/ir/annotations.go#L88). The IR JSON output carries the maintainer list per node when the source Component declared one; downstream tooling that reads the IR (Studio, lint plugins, audit reports) consumes the field from there rather than re-reading the catalog YAML.

The compiler does not enforce or validate maintainer content beyond JSON Schema's structural shape (name required; email and url optional, both string). Whether the listed maintainers actually own the entity, whether their email is reachable, whether a repository commit is signed by one of them — these are catalog-governance concerns enforced by `linter.wasm` (out-of-band advisory) or by enterprise publishing-discipline plugins, not by the compiler.

## Required-fields asymmetries

The eight Aggrega entity kinds carry slightly different required-field sets in their JSON Schemas. Most asymmetries are deliberate and reflect the entity's role; one asymmetry (Release `metadata.environment`) is in transition per a ratified design decision.

The current required-fields state per entity (excluding `apiVersion` / `kind` / `metadata.name` / `metadata.version`, which every entity requires uniformly):

| Entity | Additional required fields | Rationale |
| --- | --- | --- |
| Component | `spec.cueSchema` (or `spec.cueSchemaRef`); `metadata.labels.component.aggrega.ai/type` | The label requirement is **load-bearing for selector matching**: `usesSchema` `@selector()` expressions filter target Components by this label; absent, the selector cannot match anything and the build halts at edge-typing time |
| Feature | `spec.cueSchema` (or `spec.cueSchemaRef`) | No reserved-label requirement; Features identify by name + namespace |
| Recipe | `spec.provider`, `spec.implements` | Provider gates engine dispatch; implements gates Component-binding |
| FeatureRecipe | `spec.provider`, `spec.implements` | Same as Recipe |
| Provider | `spec.baseSchema` (provider's own values-validation contract) | Used to validate the values dict the renderer passes to the engine |
| Aggregate | `spec.components` (or `spec.aggregates` for module-shape Aggregates) | An Aggregate without component-shape declarations is a no-op |
| Manifest | `spec.mappings` | The mapping tiers are the Manifest's only purpose |
| Release | `spec.aggregate`, `spec.manifest`; *`metadata.environment` (current — moving to optional)* | The first two anchor the build to a specific Aggregate + Manifest; environment is in transition |

### `Component` label requirement is load-bearing

The `component.aggrega.ai/type` label is the only label Aggrega requires on any entity today. The requirement exists because the standard library's `usesSchema` mechanism filters target candidates via selector expressions like `@selector("component.aggrega.ai/type=database")` — the selector consults the target's labels to determine whether the type matches the socket's accepted types. A Component that omits the label cannot be selected by any socket whose schema declares this filter, which means the Component is unreachable as a `uses:` target.

The requirement is therefore not a publishing-surface concern (the label is not for catalog discovery) but a runtime-correctness concern (without it, the Component fails as a topology participant). Authors should not omit the label even when authoring internal-use Components that do not target catalog distribution.

### Release `metadata.environment` requirement is in transition

The Release schema currently requires `metadata.environment` as a string. This requirement is expected to become optional and free-form in a future release, documented as informational label-source metadata; today the field is still schema-required.

When the relaxation ships:

- The schema drops the `required` constraint on `metadata.environment`.
- The renderer already handles empty values; a Release that omits the field produces no `aggrega.ai/environment` label on rendered K8s manifests, while every other provenance label emits normally.
- Authors who want explicit environment attribution still set the field; authors who don't need it omit it.

For the environment-field relaxation framing and use cases, see [`10-status.md`](../10-status.md) Roadmap notes section.

### Other asymmetries are not in transition

The remaining asymmetries (Recipe vs Component required fields, Provider's `baseSchema` requirement, Aggregate's `components`-or-`aggregates` requirement, Manifest's `mappings` requirement) reflect each entity's role and are not slated for change. Authors who want a uniform required-fields contract across all eight entities will not find it; the asymmetries are deliberate per the role-driven design.

## Cross-references

- [`labels-and-annotations.md`](labels-and-annotations.md) — content-side metadata mechanism complementing the publishing surface.
- [`entities/component.md`](../entities/component.md) — Component's `metadata.labels.component.aggrega.ai/type` requirement and `cueSchema` / `usesSchema` / `secretsSchema` declarations.
- [`entities/release.md`](../entities/release.md) — Release's `metadata.environment` field and its current required state.
- [`10-status.md`](../10-status.md) — the environment-field relaxation roadmap.
- [`architecture/02-ecosystem-philosophy.md`](../../architecture/02-ecosystem-philosophy.md) — Strict API Partitioning and the Enterprise Metadata Suite design framing.
