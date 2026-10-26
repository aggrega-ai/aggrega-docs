# Entity Reference Overview

Aggrega's authoring vocabulary comprises `Aggregate`, `Component`, `Feature`, `Recipe`, `FeatureRecipe`, `Plugin`, `Manifest`, `Release`, `SchemaLibrary`, `MappingLibrary`, `WorkloadLibrary`, and `ArtifactLibrary` — plus the platform-owned `Workload` kind embedded inside a Recipe's synthesized input. Every entity is a YAML document conforming to a JSON Schema; every field, keyword, and cross-entity reference this Reference describes is part of that authoring contract.

This chapter set covers the authoring surface: which fields each entity accepts, what each field means to the author, how fields interact across entities (a Recipe's `implements:` naming the Component it implements, a Release's `manifest:` pointer to a Manifest, a Workload's `containers.<name>.attachments` referencing slots declared in the Component's `featuresSchema`). The conceptual role of each entity — why the taxonomy has the shape it does, which domain owns which entity, how the Four Domains separate authoring concerns — lives in [../architecture/04-entity-taxonomy.md](../architecture/04-entity-taxonomy.md). The Workload kind's architectural role as one of the three Recipe input kinds lives in [../architecture/16-recipe-input-composition.md](../architecture/16-recipe-input-composition.md).

## How this reference is organised

Two surfaces document the authoring vocabulary, and they answer different questions.

**Every kind listed above has a generated schema reference.** Those pages are generated from the schemas the compiler itself publishes, and [schema/README.md](schema/README.md) indexes the complete set — entity kinds, plugin wire shapes, and workspace files alike. Reach for the schema reference to answer "what may this document contain": every field, its type, whether it is required, and the constraints the envelope enforces.

**The pages below are the authoring guides.** They are written by hand to teach what the schema cannot: what a kind is for, how its fields interact with other kinds, which authoring shape suits which situation, and the conventions the standard-library catalog follows. Reach for an authoring guide to answer "how do I write one, and why is it shaped this way".

## Per-entity reference

- [Aggregate](entities/aggregate.md) — the developer's declarative intent artifact. Declares components, their topology via `uses`, parameter contracts for per-environment variation, and Feature attachments.
- [Component](entities/component.md) — Platform-Architect-authored catalog entity defining a reusable component kind. Declares its `values` and `infra` schemas (each a JSON Schema 2020-12 declaration in compact or full form), its `provides` output contract, its `usesSchema` inbound-edge contract, and credential slots via `featuresSchema`.
- [Feature](entities/feature.md) — Platform-Architect-authored catalog entity for a cross-cutting concern (monitoring sidecar, data masking, routing policy). Declares its `values` and `infra` schemas (each a JSON Schema 2020-12 declaration), `appliesTo` attachment selectors, and interoperability constraints.
- [Recipe](entities/recipe.md) — Ops-authored translation from a Component to a specific provider. Composes three input kinds (`source:` + `valuesMapping:`, `workload:`, `artifacts:` — each accepting inline content or `$import:` per the unified file-import vocabulary) plus a `provides` block that forms the caller-injection contract.
- [FeatureRecipe](entities/featurerecipe.md) — Ops-authored translation from a Feature to a specific provider. Uses the same three input-kinds contract as Recipe plus an `injectMapping` that intercepts the inject pipe for caller-side variable rewriting.
- [Plugin](entities/plugin.md) — content-addressed WebAssembly plugin. Declares the one socket type it implements — `provider`, `linter`, `pipeline-step`, `governance`, `cli`, `parser` or `importer` — its ABI version, and the capabilities that socket type serves. A provider-rendering Plugin (`pluginType: provider`) declares the provider name(s) it serves in `spec.provider.capabilities` and carries its provider-socket metadata — `workloadSchema` and `wellKnownAnnotations` — in that same `spec.provider` block.
- [Manifest](entities/manifest.md) — per-project mapping table. Binds abstract Component and Feature types to concrete Recipe and FeatureRecipe URIs, under `components` and `features`, with a lookup order of `name` > versioned `type` > unversioned `type`.
- [Release](entities/release.md) — per-environment deployment router. Binds an Aggregate to a Manifest, maps components into physical boundaries, supplies per-environment parameter values, and attaches Ops-managed Features.

### Library entities

The four library kinds are Tier 3 — opt-in reuse entities. A catalog declares one when the same content recurs across its entities, and ships without them otherwise. Each holds one content type, and the fragment in a reference (`#/schemas/`, `#/mappings/`, `#/workloads/`, `#/artifacts/`) says which library a reference addresses.

- [SchemaLibrary](entities/schemalibrary.md) — reusable JSON Schema 2020-12 definitions plus optional parameterized helpers, referenced from a Component's or Feature's schemas by `$ref: <Library>#/schemas/<name>`.
- [MappingLibrary](entities/mappinglibrary.md) — reusable Go template fragments, imported into a Recipe's or FeatureRecipe's `valuesMapping:` by `$import: <Library>#/mappings/<name>`.
- [WorkloadLibrary](entities/workloadlibrary.md) — reusable Workload content, imported into a Recipe's or FeatureRecipe's `workload:` by `$import: <Library>#/workloads/<name>`.
- [ArtifactLibrary](entities/artifactlibrary.md) — reusable bundles of auxiliary output files, imported into a Recipe's or FeatureRecipe's `artifacts:` by `$import: <Library>#/artifacts/<name>`. A bundle is the unit of reuse: one import expands into one output per file in the bundle.

### Platform-owned kinds

- [Workload](entities/workload.md) — platform-owned compiler kind (not a user-authored catalog entity). Embedded inside a Recipe's `workload:` field (inline or via `$import:`); describes the deployment shape the provider synthesizes into provider-native manifests.
