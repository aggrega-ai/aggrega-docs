# Publishing surface

Every Aggrega catalog YAML carries a uniform set of metadata fields that describe the entity for catalog distribution: who maintains it, what license it ships under, where its source lives, what keywords surface it for discovery, whether it is deprecated. Together these fields constitute the **publishing surface** — the metadata vocabulary catalog publishers and tooling consumers rely on, distinct from the content-side `metadata.labels` / `metadata.annotations` mechanism documented at [`labels-and-annotations.md`](labels-and-annotations.md).

This page documents the publishing surface fields, the description-field inventory across the corpus (envelope vs instance vs field-level descriptions), the maintainer field's intended use and verified consumer, and the per-entity required-fields asymmetries (which fields each entity requires today and where the asymmetries are deliberate).

## The publishing surface fields

The following fields appear on every Domain 2 (Component, Feature) and Domain 3 (Recipe, FeatureRecipe, Plugin) entity, plus on Aggregate as a reusable module. They appear on Manifest and Release as well, with reduced semantics (workspace-attribution rather than catalog-publication).

| Field | Type | Purpose | Consumer |
| --- | --- | --- | --- |
| `description` | string | Human-readable summary of the entity | Editor hover cards (`aggrega serve`); the `describe` tool an assistant calls (`aggrega mcp`); a searchable annotation on the published artifact (`aggrega push`); `aggrega inspect`, for the library kinds only |
| `maintainers` | array of objects | Who owns the entity (name, email, url) | Per-node `catalog_metadata` in the IR, on Component nodes |
| `license` | string | Legal compliance (typically SPDX identifier) | Per-node `catalog_metadata` in the IR, on Component nodes |
| `repository` | string (URL) | Git repository where source lives | Per-node `catalog_metadata` in the IR, on Component nodes — nothing else reads it |
| `home` | string (URL) | Documentation / wiki URL | Per-node `catalog_metadata` in the IR, on Component nodes — nothing else reads it |
| `keywords` | array of strings | Discovery tags | Per-node `catalog_metadata` in the IR, on Component nodes — no search index consumes them |
| `deprecated` | boolean | End-of-life flag | The build's deprecation check — advisory by default, halting when `build.halt_on_deprecated` is set; per-node `catalog_metadata` in the IR, on Component nodes |

All seven fields are optional on every entity that carries them. A catalog author who omits the entire suite produces a valid YAML — the publishing surface is for entities intended for catalog distribution; internal-use entities can omit it without consequence.

The Consumer column is exhaustive for what ships today, and two of its consequences are worth stating plainly, because they change what is worth authoring:

- **`description` is the only field with more than one reader.** `aggrega serve` renders it into the hover card for Aggregate, Component, Feature, Recipe, FeatureRecipe, Manifest and the four library kinds (`SchemaLibrary`, `MappingLibrary`, `WorkloadLibrary`, `ArtifactsLibrary`) — not for Plugin or Release. The `describe` tool `aggrega mcp` exposes returns it for a Component or a Feature. `aggrega push` stamps it onto the published artifact as a searchable annotation. `aggrega inspect` prints it for the four library kinds only; for Component, Feature, Recipe, FeatureRecipe and Plugin, `inspect` prints no publishing-surface field at all.
- **`repository`, `home` and `keywords` are validated and carried, and nothing reads them beyond the IR.** No listing surface, catalog site or search index consumes them. Authoring them records provenance that travels with the entity and is readable from IR output and from a governance policy; it does not make the entity findable anywhere.

One clarification on `deprecated`, because two deprecation signals exist and only one of them is a publishing-surface field. `metadata.deprecated` is the author's own boolean on the entity's YAML, gated by `build.halt_on_deprecated`. Separately, a registry can record a deprecation *retroactively* after publication — a marker carrying a severity (`warning`, `error` or `retracted`), a reason and a replacement, verified at pull time and gated by `build.halt_on_deprecated_severity`. The marker is not authored on the entity and is not part of the publishing surface; the deprecation notice `aggrega inspect` prints for a Component comes from it, not from `metadata.deprecated`.

### IR consumption — per-node `catalog_metadata`

The compiler carries the publishing surface fields from each Component into that node's `catalog_metadata` block, visible in IR JSON output (`aggrega ir --blueprint`). The block holds `maintainers`, `license`, `repository`, `home`, `keywords` and `deprecated` — the six fields the IR carries; `description` is not among them. Tooling built against the IR graph contract reads the metadata from there rather than re-reading the catalog YAML.

**Component nodes only.** The block is populated by looking the node's component type up in the catalog as a Component, so a Feature's, Recipe's, FeatureRecipe's or Plugin's publishing surface never reaches the IR — those entities carry the fields, and the fields validate, but no IR node results from them.

`catalog_metadata` collapses out of the IR JSON entirely when every publishing-surface field on the source Component is empty or zero: the block is omitted rather than emitted with empty values. The same input therefore yields the same compact output, which keeps the IR diff stable across runs.

A governance policy can read the block. A plugin attached under `plugins.governance` in the `ir-verdict` role receives the whole IR graph, node for node, including each Component node's `catalog_metadata` — so a policy can accept or reject a build on a node's `license`, `repository`, `home`, `keywords`, `deprecated` or `maintainers`. That reach is specific to the governance socket: a provider's rendering plugin receives a bounded per-node projection that does not include `catalog_metadata`, so rendering plugins cannot read these fields.

## The three description types

The `description` field appears uniformly on the envelope, but the corpus also carries description-style strings inside schema declarations (per-field descriptions) and inside pillar bodies (per-instance descriptions). Three distinct description types coexist; the table below disambiguates them.

| Type | Where it lives | Authored by | Purpose |
| --- | --- | --- | --- |
| Envelope description | `metadata.description` on every entity | Catalog publisher | One-line summary shown on editor hover cards and stamped onto the published artifact |
| Instance description | `description` field next to a per-instance declaration (e.g., `featuresSchema.<slot>.description`, `usesSchema.<socket>.description`) | Schema author | Per-slot / per-socket / per-port description, for authors of consuming entities reading the declaration |
| Field description | JSON Schema 2020-12 `description:` annotation inside `schema:` / `featuresSchema:` / `usesSchema:` content (compact form or full JSON Schema YAML) | Schema author | Per-field documentation that travels with the schema |

The three types share the word "description" but live at structurally distinct levels. Envelope description applies to the entity as a whole; instance description applies to a declaration inside a schema slot; field description applies to a specific value inside a typed schema. Authors writing a Component:

- Set `metadata.description` once for the Component entity itself.
- Set `featuresSchema.admin_password.description` once per credential slot the Component declares.
- Set per-field `description:` annotations inside the `schema:` block — in compact form (`port: { type: integer, description: "..." }`) or in full JSON Schema YAML — to document each field for whoever reads the Component's schema.

The three types do not cascade and do not collide, and each reaches a different surface — or none:

- **Envelope description** — editor hover cards, the published artifact's searchable annotations, and `aggrega inspect` for the library kinds, per the Consumer column above.
- **Field description** — appears verbatim in the schema excerpt a Component's or a Feature's hover card renders. The excerpt covers `spec.schema` only and is truncated to its opening lines, so a description deeper in the block — or one inside `featuresSchema:` or `usesSchema:` — does not appear there.
- **Instance description** — declared and carried with the entity; no shipped surface renders it on its own. `aggrega inspect` lists a Component's sockets and feature slots without their descriptions.

## Maintainer field intent

The `maintainers` field carries an array of objects, each with `name`, `email`, and `url`. The intent and verified consumer:

**Intent (informational + IR provenance).** The field is informational for catalog publishing: the architectural intent is "who is responsible for this catalog entity" — an ownership signal that travels with the entity. No surface presents it as a contact list, and no built-in check compares it against anything.

**Verified consumer (per-node `catalog_metadata`).** The compiler carries each Component's `metadata.maintainers` into that node's `catalog_metadata.maintainers` in the IR, visible in `aggrega ir --blueprint` output when the source Component declared one. That is the field's only reader. A governance policy attached under `plugins.governance` in the `ir-verdict` role sees it there, so an ownership rule — every entity names at least one maintainer, a maintainer's domain matches an approved set — is expressible against the IR rather than against the catalog YAML. No such rule ships; the socket is where one goes.

The compiler does not enforce or validate maintainer content beyond JSON Schema's structural shape (name required; email and url optional, both string). Whether the listed maintainers actually own the entity, whether their email is reachable, whether a repository commit is signed by one of them — these are catalog-governance concerns, and no shipped check evaluates any of them. They belong to a governance policy an operator attaches, not to the compiler.

## Required-fields asymmetries

The ten Aggrega entity kinds carry slightly different required-field sets in their JSON Schemas. Most asymmetries are deliberate and reflect the entity's role; one asymmetry (Release `metadata.environment`) is in transition and will be relaxed in a future release.

The current required-fields state per entity (excluding `apiVersion` / `kind` / `metadata.name` / `metadata.version`, which every entity requires uniformly):

| Entity | Additional required fields | Rationale |
| --- | --- | --- |
| Component | `spec.schema`; `metadata.labels.component.aggrega.ai/type` | The label requirement is **load-bearing for selector matching**: `usesSchema` `x-aggrega-selector:` annotations filter target Components by this label; absent, the selector cannot match anything and the build halts at edge-typing time |
| Feature | `spec.schema` | No reserved-label requirement; Features identify by name + publisher |
| Recipe | `spec.capability`, `spec.implements` | Capability gates engine dispatch; implements gates Component-binding |
| FeatureRecipe | `spec.capability`, `spec.implements` | Same as Recipe |
| Plugin | `metadata.pluginType`, `spec.plugin`, `spec.abiVersion` | The socket type the plugin implements (part of the addressing block, supplying the `<pluginType>` segment of the derived `plugin/<pluginType>/<name>` coordinate), the content-addressed artifact reference, and the ABI version it targets; a provider-rendering plugin (`pluginType: provider`) additionally carries its translation contract under `spec.provider` |
| Aggregate | `spec.components` (or `spec.aggregates` for module-shape Aggregates) | An Aggregate without component-shape declarations is a no-op |
| Manifest | `spec.mappings` | The mapping tiers are the Manifest's only purpose |
| Release | `spec.aggregate`, `spec.manifest`; *`metadata.environment` (current — moving to optional)* | The first two anchor the build to a specific Aggregate + Manifest; environment is in transition |

### `Component` label requirement is load-bearing

The `component.aggrega.ai/type` label is the only label Aggrega requires on any entity today. The requirement exists because the standard library's `usesSchema` mechanism filters target candidates via `x-aggrega-selector:` annotations carrying selector strings like `"component.aggrega.ai/type=database"` — the selector consults the target's labels to determine whether the type matches the socket's accepted types. A Component that omits the label cannot be selected by any socket whose schema declares this filter, which means the Component is unreachable as a `uses:` target.

The requirement is therefore not a publishing-surface concern (the label is not for catalog discovery) but a runtime-correctness concern (without it, the Component fails as a topology participant). Authors should not omit the label even when authoring internal-use Components that do not target catalog distribution.

### Release `metadata.environment` requirement is in transition

The Release schema currently requires `metadata.environment` as a string. This requirement is expected to become optional and free-form in a future release, documented as informational label-source metadata; today the field is still schema-required.

When the relaxation ships:

- The schema drops the `required` constraint on `metadata.environment`.
- The renderer already handles empty values; a Release that omits the field produces no `aggrega.ai/environment` label on rendered K8s manifests, while every other provenance label emits normally.
- Authors who want explicit environment attribution still set the field; authors who don't need it omit it.

For the environment-field relaxation framing and use cases, see [`10-status.md`](../10-status.md) Roadmap notes section.

### Other asymmetries are not in transition

The remaining asymmetries (Recipe vs Component required fields, Aggregate's `components`-or-`aggregates` requirement, Manifest's `mappings` requirement) reflect each entity's role and are not slated for change. Authors who want a uniform required-fields contract across every entity kind will not find it; the asymmetries are deliberate per the role-driven design.

## Cross-references

- [`labels-and-annotations.md`](labels-and-annotations.md) — content-side metadata mechanism complementing the publishing surface.
- [`entities/component.md`](../entities/component.md) — Component's `metadata.labels.component.aggrega.ai/type` requirement and `schema` / `usesSchema` / `featuresSchema` declarations.
- [`entities/release.md`](../entities/release.md) — Release's `metadata.environment` field and its current required state.
- [`10-status.md`](../10-status.md) — the environment-field relaxation roadmap.
- [`architecture/02-ecosystem-philosophy.md`](../../architecture/02-ecosystem-philosophy.md) — Strict API Partitioning and the Enterprise Metadata Suite design framing.
- [`architecture/13-catalog-and-registry.md`](../../architecture/13-catalog-and-registry.md) §"Lockfile pinning and artifact immutability" + §"Catalog entity name-shape enforcement" — what the immutability rule refuses at publish time, and where per-entity-kind name shapes are checked: the publishing-discipline plugin reports them advisorily when an author runs `aggrega lint`, and neither building nor publishing checks them.
- [`architecture/11-governance-and-compliance.md`](../../architecture/11-governance-and-compliance.md) §"Inheritance and publishing discipline" — which governance rules belong to the publishing-discipline plugin, and which an extending Component's inheritance settles by construction instead.
