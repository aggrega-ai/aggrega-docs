# Validation surface

Aggrega validates authored content across four distinct schema layers. Each layer covers a different scope, runs at a different point in the compilation pipeline, and produces errors with a different shape. Authors who hit a validation error benefit from knowing which layer rejected the input — the same field can be governed by more than one layer, and the layer that fired determines what to fix and where.

This page documents the four layers, their pipeline placement, the error-shape convention each layer follows, and how layers interact when more than one applies to the same field.

## The four layers

### Layer 1 — JSON Schema envelope

**Scope.** The structural shape of every catalog YAML: `apiVersion`, `kind`, `metadata.{name, version, description, maintainers, license, ...}`, the top-level `spec:` block, and the per-entity required fields the schema declares. Each entity kind (Aggregate, Component, Feature, Recipe, FeatureRecipe, Manifest, Plugin, Release, SchemaLibrary, MappingLibrary, WorkloadLibrary, ArtifactsLibrary) has its own JSON Schema at [`aggrega-schemas/json/`](../../../aggrega-schemas/json/).

**Validation runs.** At resolution (resolver / load), per file. The compiler unmarshals each YAML into the corresponding Go struct; YAML keys outside the struct's declared fields surface as parse errors before any further validation runs.

**Error shape.** Schema-mismatch failures surface as YAML unmarshal errors carrying the offending field path and the constraint violated:

```text
unmarshal Recipe "<path>": json: unknown field "<field>"
```

Required-field omissions and type mismatches surface in the same shape; the specific text varies by underlying YAML library.

### Layer 2 — Pillar schemas (`schema:` / `featuresSchema` / `usesSchema`)

**Scope.** The data pillars an entity carries — `values`, `infra`, `parameters`, plus the `features:` attachment block whose slots `featuresSchema` declares and the `uses:` block governed by `usesSchema`. Domain 2 entities (Component, Feature) embed JSON Schema 2020-12 declarations in their YAML envelope (`spec.schema` inline — compact or full form — or `spec.schemaRef` pointing at a shared SchemaLibrary entry); Domain 3 entities (Recipe, FeatureRecipe) consume the resolved schemas during their own validation pass.

**Validation runs.** At resolution, after the JSON Schema envelope passes. The compiler composes the entity's authored `schema:` with auto-generated bases derived from `usesSchema` and `featuresSchema` declarations; the composed schema validates the developer-supplied `values:` / `infra:` / `features:` / `uses:` blocks on every component instance in the Aggregate.

**Error shape.** Constraint violations surface as messages naming the entity, the path inside the pillar, and the rule that rejected the value — for example a developer setting a port to `80` against a schema rule requiring `>=1024`.

A redeclared `usesSchema` or `featuresSchema` entry produces no composition failure. Those two surfaces overlay by name: a child's entry replaces the base's outright, schema and selector together, so there is no conflict between a base and a child entry to report.

### Layer 3 — Provider synthesized-mode capability

**Scope.** Governed by the bound provider's synthesized-mode capability gate:

- Synthesized-mode (`workload:`) support is gated on the bound provider's **capability**, not on `workloadSchema` presence: a `workload:` Recipe bound to a provider that cannot synthesize is rejected here. The standard-library catalog declares `workloadSchema` on synthesis-capable providers by convention — on the provider-rendering Plugin's `spec.provider.workloadSchema` — as the documented translation contract. That `workloadSchema` body is itself compiled to JSON Schema 2020-12 when the Plugin loads, a structural acceptance gate that rejects a malformed schema at load rather than at render.

**Validation runs.** At base rendering, after the Recipe's own valuesMapping has resolved. Layer 3 gates synthesized-mode dispatch on provider capability.

**Error shape.** A capability decline is attributed to the catalog-authoring domain, so its report opens with a bracketed head carrying that category and a pointer to the node. The message opens with the fixed sentence stating the condition, then names the node, the provider, and the kinds that provider does support:

```text
[CATALOG_ERROR] <node-id>: provider does not support the node's input kind (node "<node-id>"). provider "<provider-name>" does not support synthesised recipes (this provider supports: <kinds>); declare one of the supported input kinds, or target a provider that supports synthesised
```

The `[CATALOG_ERROR]` head signals the catalog entity is at fault, not the developer's Aggregate. On a terminal the head also carries the condition's short code — `E0265` for this one, which [the table of every condition](../errors/sentinels.md#every-condition-by-short-code) resolves — and the message moves to its own indented line; the one-line form above is what reaches a log. The opening sentence is fixed per condition, so it is the part to match on when you are working from text; everything after it varies with the node at fault.

A related guardrail protects provider dispatch itself: when more than one provider-rendering Plugin serves the same target, the workspace resolves the ambiguity via a provider binding in `.aggrega-config.yaml`, chosen at `aggrega pull` and recorded in the lockfile. With no binding and exactly one candidate Plugin, that candidate is used; with no binding and more than one candidate, the build halts loudly, naming the candidate plugins. Ambiguity is resolved per workspace at the point of use, not by a catalog-wide uniqueness rule.

> **Honest-pending — per-provider Workload-content validation.** The provider-Plugin's `spec.provider.workloadSchema` does not validate Workload bodies today; it is a documented contract and a synthesis-support marker, and Workload bodies are validated against the platform-owned embedded Workload schema. When the Wasm-based Workload synthesizer ships (see the roadmap), `workloadSchema` becomes the per-provider content contract the synthesizer validates the Workload body against — a second Layer-3 sub-surface — including per-provider constraints such as a `min: 1024` non-privileged-port rule. The constraint-overlap examples below describe that end-state.

### Layer 4 — Annotation-binding value validation

**Scope.** Annotation values authored on Release boundaries / boundary components or Aggregate subsystems / component instances, when a Manifest binding under `mappings.features.annotations.<key>` declares routing through `maps.infra` and/or `maps.values` dotted-path lists. Each declared path navigates the target Feature's `spec.schema.<pillar>` to a leaf property; the annotation value's contribution at that leaf is validated against the Feature schema's declared type. Validation flows through the Feature's own JSON Schema 2020-12 declaration — bindings declare routing only, not validation fragments.

**Validation runs.** The annotation-expansion sub-phase of resolution, after Manifest binding-target validation (the catalog-load check confirming each declared path exists in the referenced Feature schema) and alongside Layer 2 schema validation on explicit attachments. For each effective per-component annotation: parse the value into the Scalar / Structured / Nil sum type; route per-subkey through the binding's pillar-grouped `maps` declaration with side-vs-pillar enforcement (Aggregate-side fires `maps.values`; Release-side fires `maps.infra`); validate the per-leaf runtime value against the Feature schema's declared type at the routed pillar. Multiple subkey errors collect-and-emit-all before halting.

**Error shape.** Schema-validation errors at this layer follow the Layer 2 shape — entity, path (annotation key plus subkey route), constraint detail. Side-vs-pillar partition violations and ambiguous-routing failures are attributed to the operator's own documents, so their reports open with an `[OPS_ERROR]` head, and they name the annotation key, the routed pillar, the authoring side, and the source location.

## One error-formatting convention across layers

The four layers share one observable convention: **every Aggrega-attributable validation failure carries a path-plus-rationale shape** that names the offending field and the constraint that rejected it.

- Layer 1 (envelope) and Layer 2 (pillar schemas) errors come through unprefixed at resolution — they fire before any Aggrega-prefixed sentinel discipline applies, so the YAML library's or schema validator's native error wraps with a positional prefix (`unmarshal <kind> "<path>": ...`, `<field-path>: <schema rule violated>`).
- Layer 3 (Provider source / Workload) errors are catalog-entity-attributable by definition — the Recipe + Provider pair authored the schema that rejected the developer's input. These are attributed to the catalog-authoring domain, and the attribution reaches you in the diagnostic's bracketed head rather than as a word typed into the message: a halting report opens `[CATALOG_ERROR E0nnn]`, where the category names the domain and the short code names the condition. Match on the short code, which is fixed once issued.
- Layer 4 (annotation-binding value validation) errors follow the Layer 2 shape — the validating Feature schema lives in the referenced Feature's `spec.schema`, and runtime values flow through the Manifest binding's `maps` routing into that schema for per-leaf type checking.

For the full inventory of Aggrega-prefixed sentinels and the surfaces that produce them, see [`errors/error-translation.md`](../errors/error-translation.md). For the per-error catalog (the `[CATALOG_ERROR]` Recipe shape rules, condition by condition), see [`errors/fatal-halts.md`](../errors/fatal-halts.md).

## Layer interaction when fields overlap

The same authored field can be governed by more than one layer. The most common overlap is a Workload's `containers.<name>.ports.<port>: <number>` field. **This walkthrough describes the end-state of per-provider `workloadSchema` content validation, which is honest-pending** (see the Layer 3 note above and the roadmap's Wasm-based Workload synthesizers item): today the Workload body is validated against the platform-owned embedded Workload schema, not the per-provider `workloadSchema`.

- Layer 1 (envelope) accepts it as part of the Workload schema's structural shape.
- Layer 2 (pillar schemas) does not constrain it directly — Workload content is a Recipe-internal structure, not a Component pillar.
- Layer 3 (`workloadSchema`) will validate the integer range (e.g., `>=1, <=65535`) and any provider-specific constraints declared on the bound provider-Plugin's `spec.provider.workloadSchema`, once per-provider `workloadSchema` validation ships.

When a developer authors `port: 80` and the provider-Plugin's `spec.provider.workloadSchema` declares `port: >=1024`, the Layer 3 pass will reject the value. The same field shape would have passed Layer 1 and Layer 2 (which never applied); the layer that fires tells the author where to look for the rule.

A second overlap pattern: cross-pillar constraints declared at the pillar layer that duplicate constraints in `workloadSchema`. When the pillar schema allows port 80 (no constraint) but `workloadSchema` declares ports below 1024 invalid, the Layer 3 pass will surface the violation at base rendering; the developer sees the failure attributed to the Recipe + Provider pairing, not to the Component's `schema:`. The constraint-layering convention is documented at [`vocabulary/data-pillars.md`](data-pillars.md) (Cross-pillar constraint behavior section).

## Pipeline placement summary

| Layer | Scope | Runs at | Error prefix |
| --- | --- | --- | --- |
| 1 — JSON Schema envelope | Structural shape (apiVersion, kind, metadata, top-level spec) | Resolution (load) | unprefixed YAML / unmarshal error |
| 2 — Pillar schemas (`schema:` / `featuresSchema` / `usesSchema`) | Per-pillar data validation (values, infra, secrets, uses) | Resolution (after envelope) | unprefixed schema-validation error |
| 3 — Provider-capability gate (per-provider `workloadSchema` content validation honest-pending) | Synthesized-mode support (provider capability) | Base rendering | `[CATALOG_ERROR]` |
| 4 — Annotation-binding value validation | Annotation-value contributions routed into the target Feature's `spec.schema` via the Manifest binding's `maps` paths | The annotation-expansion sub-phase of resolution, alongside Layer 2 | schema-validation error; side-vs-pillar / ambiguous-routing surfaces open `[OPS_ERROR]` |

## Cross-references

- [`errors/error-translation.md`](../errors/error-translation.md) — Aggrega-prefixed sentinel inventory and the surfaces that produce them.
- [`errors/fatal-halts.md`](../errors/fatal-halts.md) — per-error catalog of every fatal halt the compiler emits.
- [`vocabulary/data-pillars.md`](data-pillars.md) — the four data pillars (`values`, `infra`, `parameters`, `locals`) plus `features:` and `uses:` that Layer 2 validates.
- [`entities/component.md`](../entities/component.md) — Component authoring surface for `schema:` / `featuresSchema` / `usesSchema`.
- [`entities/plugin.md`](../entities/plugin.md) — provider-rendering Plugin authoring surface for `spec.provider.workloadSchema`.
- [`entities/manifest.md`](../entities/manifest.md) — Manifest's `features.annotations` binding surface (Layer 4).
- [`providers/well-known-annotations.md`](../providers/well-known-annotations.md) — annotation-value parsing, structured-value subkey routing, per-subkey null opt-out, and cross-side composition that Layer 4 validates.
