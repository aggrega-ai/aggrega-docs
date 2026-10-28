# Publishing surface

Every Aggrega catalog YAML carries a uniform set of metadata fields that describe the entity for catalog distribution: who maintains it, what license it ships under, where its source lives, what keywords surface it for discovery. Together these fields constitute the **publishing surface** — the metadata vocabulary catalog publishers and tooling consumers rely on, distinct from the content-side `metadata.labels` / `metadata.annotations` mechanism documented at [`labels-and-annotations.md`](labels-and-annotations.md).

This page documents the publishing surface fields, the description-field inventory across the corpus (envelope vs instance vs field-level descriptions), the maintainer field's intended use and verified consumer, and the per-entity required-fields asymmetries (which fields each entity requires today and where the asymmetries are deliberate).

## The publishing surface fields

The following fields appear on every Domain 2 (Component, Feature) and Domain 3 (Recipe, FeatureRecipe, Plugin) entity, plus on Aggregate as a reusable module. They appear on Manifest and Release as well, with reduced semantics (workspace-attribution rather than catalog-publication).

| Field | Type | Purpose | Consumer |
| --- | --- | --- | --- |
| `description` | string | Human-readable summary of the entity | Editor hover cards (`aggrega serve`); the `describe` tool an assistant calls (`aggrega mcp`); a searchable annotation on the published artifact (`aggrega push`); `aggrega inspect` |
| `maintainers` | array of objects | Who owns the entity (name, email, url) | Per-node `catalog_metadata` in the IR, on Component nodes |
| `license` | string | Legal compliance (typically SPDX identifier) | Per-node `catalog_metadata` in the IR, on Component nodes |
| `repository` | string (URL) | Git repository where source lives | Per-node `catalog_metadata` in the IR, on Component nodes — nothing else reads it |
| `home` | string (URL) | Documentation / wiki URL | Per-node `catalog_metadata` in the IR, on Component nodes — nothing else reads it |
| `keywords` | array of strings | Discovery tags | Per-node `catalog_metadata` in the IR, on Component nodes — no search index consumes them |

All six fields are optional on every entity that carries them. A catalog author who omits the entire suite produces a valid YAML — the publishing surface is for entities intended for catalog distribution; internal-use entities can omit it without consequence.

The Consumer column is exhaustive for what ships today, and two of its consequences are worth stating plainly, because they change what is worth authoring:

- **`description` is the only field with more than one reader.** `aggrega serve` renders it into the hover card for Aggregate, Component, Feature, Recipe, FeatureRecipe, Manifest and the four library kinds (`SchemaLibrary`, `MappingLibrary`, `WorkloadLibrary`, `ArtifactLibrary`) — not for Plugin or Release. The `describe` tool `aggrega mcp` exposes returns it for an entity of any kind. `aggrega push` stamps it onto the published artifact as a searchable annotation. `aggrega inspect` prints it beneath the entity's header for every kind, and prints no other publishing-surface field.
- **`repository`, `home` and `keywords` are validated and carried, and nothing reads them beyond the IR.** No listing surface, catalog site or search index consumes them. Authoring them records provenance that travels with the entity and is readable from IR output and from a governance policy; it does not make the entity findable anywhere.

**Deprecation is not a publishing-surface field.** An entity is deprecated by recording a marker against it in the registry *after* publication — a signed marker carrying a severity (`warning`, `error` or `retracted`), a reason and a replacement, verified at pull time. Every surface that reads the lockfile then reports it; `build.halt_on_deprecated_severity` decides only whether it also stops a build. The marker is never authored on the entity's own YAML, and the reason is structural: a published artifact is immutable, so a flag frozen into it at publish time could never express a decision taken later. The deprecation notice `aggrega inspect` prints for a catalog entity comes from the marker, for every kind it resolves by name.

### IR consumption — per-node `catalog_metadata`

The compiler carries the publishing surface fields from each Component into that node's `catalog_metadata` block, visible in the IR graph a run hands back (`aggrega inspect <release> --ir-graph`). The block holds `maintainers`, `license`, `repository`, `home` and `keywords` — the five fields the IR carries; `description` is not among them. Tooling built against the IR graph contract reads the metadata from there rather than re-reading the catalog YAML.

**Component nodes only.** The block is populated by looking the node's component type up in the catalog as a Component, so a Feature's, Recipe's, FeatureRecipe's or Plugin's publishing surface never reaches the IR — those entities carry the fields, and the fields validate, but no IR node results from them.

`catalog_metadata` collapses out of the IR JSON entirely when every publishing-surface field on the source Component is empty or zero: the block is omitted rather than emitted with empty values. The same input therefore yields the same compact output, which keeps the IR diff stable across runs.

A governance policy can read the block. A plugin attached under `plugins.governance` in the `ir-verdict` role receives the whole IR graph, node for node, including each Component node's `catalog_metadata` — so a policy can accept or reject a build on a node's `license`, `repository`, `home`, `keywords` or `maintainers`. That reach is specific to the governance socket: a provider's rendering plugin receives a bounded per-node projection that does not include `catalog_metadata`, so rendering plugins cannot read these fields.

## The three description types

The `description` field appears uniformly on the envelope, but the corpus also carries description-style strings inside schema declarations (per-field descriptions) and inside pillar bodies (per-instance descriptions). Three distinct description types coexist; the table below disambiguates them.

| Type | Where it lives | Authored by | Purpose |
| --- | --- | --- | --- |
| Envelope description | `metadata.description` on every entity | Catalog publisher | Summary of the entity as a whole, shown on editor hover cards and stamped onto the published artifact |
| Instance description | `description` field next to a per-instance declaration (e.g., `featuresSchema.<slot>.description`, `usesSchema.<socket>.description`) | Schema author | Per-slot / per-socket / per-port description, for authors of consuming entities reading the declaration |
| Field description | JSON Schema 2020-12 `description:` annotation inside `schema:` / `featuresSchema:` / `usesSchema:` content (compact form or full JSON Schema YAML) | Schema author | Per-field documentation that travels with the schema |

The three types share the word "description" but live at structurally distinct levels. Envelope description applies to the entity as a whole; instance description applies to a declaration inside a schema slot; field description applies to a specific value inside a typed schema. Authors writing a Component:

- Set `metadata.description` once for the Component entity itself.
- Set `featuresSchema.admin_password.description` once per credential slot the Component declares.
- Set per-field `description:` annotations inside the `schema:` block — in compact form (`port: { type: integer, description: "..." }`) or in full JSON Schema YAML — to document each field for whoever reads the Component's schema.

The three types do not cascade and do not collide, and each reaches a different surface — or none:

- **Envelope description** — editor hover cards, the published artifact's searchable annotations, and `aggrega inspect`, per the Consumer column above.
- **Field description** — appears verbatim in the schema excerpt a Component's or a Feature's hover card renders. The excerpt covers `spec.schema` only and is truncated to its opening lines, so a description deeper in the block — or one inside `featuresSchema:` or `usesSchema:` — does not appear there.
- **Instance description** — declared and carried with the entity; no shipped surface renders it on its own. `aggrega inspect` lists a Component's sockets and feature slots without their descriptions.

## Maintainer field intent

The `maintainers` field carries an array of objects, each with `name`, `email`, and `url`. The intent and verified consumer:

**Intent (informational + IR provenance).** The field is informational for catalog publishing: the architectural intent is "who is responsible for this catalog entity" — an ownership signal that travels with the entity. No surface presents it as a contact list, and no built-in check compares it against anything.

**Verified consumer (per-node `catalog_metadata`).** The compiler carries each Component's `metadata.maintainers` into that node's `catalog_metadata.maintainers` in the IR, visible in the graph `aggrega inspect <release> --ir-graph` hands back when the source Component declared one. That is the field's only reader. A governance policy attached under `plugins.governance` in the `ir-verdict` role sees it there, so an ownership rule — every entity names at least one maintainer, a maintainer's domain matches an approved set — is expressible against the IR rather than against the catalog YAML. No such rule ships; the socket is where one goes.

The compiler does not enforce or validate maintainer content beyond JSON Schema's structural shape (name required; email and url optional, both string). Whether the listed maintainers actually own the entity, whether their email is reachable, whether a repository commit is signed by one of them — these are catalog-governance concerns, and no shipped check evaluates any of them. They belong to a governance policy an operator attaches, not to the compiler.

## Required-fields asymmetries

Aggrega's entity kinds carry slightly different required-field sets in their JSON Schemas. Most asymmetries are deliberate and reflect the entity's role.

The required fields per entity (excluding `apiVersion` / `kind` / `metadata.name` / `metadata.version`, which every entity requires uniformly):

| Entity | Additional required fields | Rationale |
| --- | --- | --- |
| Component | `metadata.labels.component.aggrega.ai/type` | The label requirement is **load-bearing for selector matching**: `usesSchema` `x-aggrega-selector:` annotations filter target Components by this label; absent, the Component is refused when it loads |
| Feature | — | No reserved-label requirement; Features identify by name + publisher |
| Recipe | `spec.capability`, `spec.implements` | Capability gates provider dispatch; implements gates Component-binding |
| FeatureRecipe | `spec.capability`, `spec.implements` | Same as Recipe |
| Plugin | `metadata.pluginType`, `spec.abiVersion` | The socket type the plugin implements (part of the addressing block, supplying the `<pluginType>` segment of the derived `plugin/<pluginType>/<name>` coordinate) and the ABI version it targets; the `.wasm` location is derived from that identity rather than authored; a provider-rendering plugin (`pluginType: provider`) additionally carries its translation contract under `spec.provider` |
| Aggregate | — | An Aggregate declaring none of `components`, `subsystems` or `aggregates` loads and builds, and renders nothing |
| Manifest | `spec.mappings` | The mapping tiers are the Manifest's only purpose |
| Release | `spec.aggregate`, `spec.manifest` (a Release declaring `extends` writes no `aggregate` and may omit `manifest`); `metadata.environment` | The first two anchor the build to a specific Aggregate + Manifest; the environment is stamped on rendered output as the `aggrega.ai/environment` label |

### `Component` label requirement is load-bearing

The `component.aggrega.ai/type` label is the only label Aggrega requires on any entity. The requirement exists because the standard library's `usesSchema` mechanism filters target candidates via `x-aggrega-selector:` annotations carrying selector strings like `"component.aggrega.ai/type=database"` — the selector consults the target's labels to determine whether the type matches the socket's accepted types. The Component schema enforces it: a Component that omits the label is refused when it loads (`E0215`), naming the missing key.

The requirement is therefore not a publishing-surface concern (the label is not for catalog discovery) but a topology concern: every Component carries it, internal-use Components that do not target catalog distribution included.

### Release `metadata.environment` is required

The Release schema requires `metadata.environment`, a string the build stamps on rendered output as the `aggrega.ai/environment` label.

### Other asymmetries

The remaining asymmetries (Recipe vs Component required fields, Manifest's `mappings` requirement) reflect each entity's role. Authors who want a uniform required-fields contract across every entity kind will not find it; the asymmetries are deliberate per the role-driven design.

## Cross-references

- [`labels-and-annotations.md`](labels-and-annotations.md) — content-side metadata mechanism complementing the publishing surface.
- [`entities/component.md`](../entities/component.md) — Component's `metadata.labels.component.aggrega.ai/type` requirement and `schema` / `usesSchema` / `featuresSchema` declarations.
- [`entities/release.md`](../entities/release.md) — Release's `metadata.environment` field and its requirement.
- [`10-status.md`](../10-status.md) — the status of the metadata envelope.
- [`architecture/02-ecosystem-philosophy.md`](../../architecture/02-ecosystem-philosophy.md) — Strict API Partitioning and the Enterprise Metadata Suite design framing.
- [`architecture/13-catalog-and-registry.md`](../../architecture/13-catalog-and-registry.md) §"Lockfile pinning and artifact immutability" + §"Catalog entity name-shape enforcement" — what the immutability rule refuses at publish time, and where per-entity-kind name shapes are checked: the publishing-discipline plugin reports them advisorily when an author runs `aggrega lint`, and neither building nor publishing checks them.
- [`architecture/11-governance-and-compliance.md`](../../architecture/11-governance-and-compliance.md) §"Inheritance and publishing discipline" — which governance rules belong to the publishing-discipline plugin, and which an extending Component's inheritance settles by construction instead.
