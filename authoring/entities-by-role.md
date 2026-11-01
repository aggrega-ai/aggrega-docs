# Entities by Role

Every entity kind has a role that typically authors it. This page is the complete map — reach for it when you know your concern but not yet which file it belongs in. The role assignment is guidance, not compiler enforcement (see [Personas](personas.md)); it names who *usually* owns a kind in a well-factored setup.

## The map at a glance

| Role | Entity kinds | Concern |
| --- | --- | --- |
| **Developer** | [Aggregate](../language-reference/entities/aggregate.md) | Application intent: what the app is and needs |
| **Platform architect** | [Component](../language-reference/entities/component.md), [Feature](../language-reference/entities/feature.md) | The reusable, versioned catalog contract |
| **Platform operations** | [Recipe](../language-reference/entities/recipe.md), [FeatureRecipe](../language-reference/entities/featurerecipe.md), provider-rendering [Plugin](../language-reference/entities/plugin.md) | Provider-specific translation to rendered infrastructure |
| **Platform operator** | [Manifest](../language-reference/entities/manifest.md), [Release](../language-reference/entities/release.md) | Routing and deployment wiring |
| **Cross-cutting support** | [SchemaLibrary](../language-reference/entities/schemalibrary.md), [MappingLibrary](../language-reference/entities/mappinglibrary.md), [WorkloadLibrary](../language-reference/entities/workloadlibrary.md), [ArtifactLibrary](../language-reference/entities/artifactlibrary.md), [Plugin](../language-reference/entities/plugin.md), [Workload](../language-reference/entities/workload.md) | Shared shapes, extension code, and the platform-owned compiler kind |

## Developer

**[Aggregate](../language-reference/entities/aggregate.md)** — the developer's single authoring surface and the single source of truth for application topology. It declares the components the application is built from, the `values` each one takes, the Features whose behaviour is application intent (with their `values`), the `parameters` exposed for per-environment variation, and the `uses` edges wiring components together. It stays deliberately agnostic to physical infrastructure: nothing in the Aggregate names a cloud, a cluster, or a provider. That capability-agnosticism is what lets one Aggregate deploy anywhere.

## Platform architect

**[Component](../language-reference/entities/component.md)** — a reusable, versioned contract for one kind of building block. It declares, via a JSON Schema, the `values` a developer may supply; the `provides` outputs it pipes to consumers; and the `usesSchema` sockets it exposes for wiring. Components carry the semantic labels that drive policy and rendering. The architect keeps the Component's contract stable so developers can depend on it.

**[Feature](../language-reference/entities/feature.md)** — an attachable capability a developer or operator can add to a component: a metrics exporter, masking of sensitive text on an AI gateway, a credential binding. A Feature declares what it needs and what it is incompatible with; how it is realized — the resources it generates, or the settings it writes into what its component already renders — lives in its FeatureRecipe.

## Platform operations

**[Recipe](../language-reference/entities/recipe.md)** — the provider-specific realization of a Component. It maps the Component's declared values onto a concrete provider's output — a Helm release, a Compose service, a Terraform module — through templates, and pipes `provides` values to consumers. A Recipe never changes the developer-facing values a Component declares; it only decides *how* they are rendered.

**[FeatureRecipe](../language-reference/entities/featurerecipe.md)** — the provider-specific realization of a Feature, applied at binding time. It generates the resources a Feature attachment implies for a given provider, or writes the settings it implies into what the attached component already renders.

**Provider-rendering [Plugin](../language-reference/entities/plugin.md)** — a *provider* is the Wasm guest that turns a Recipe's input into provider-native manifests. It is delivered as a Plugin with `pluginType: provider` that declares the provider name(s) it renders and its provider-socket contract. Operations (or a plugin author) supply providers so Recipes have a provider to render against. See the [Providers Overview](../language-reference/06-providers.md) for the shipped providers and their contracts.

### Reading a credential safely in a Recipe

A credential reaches a Recipe on the inject pipe, `.context.inject.env`, as whatever text its author chose, so it may hold characters a template cannot write into YAML as they stand. Inside a double-quoted scalar a double quote ends the value early and a backslash starts an escape: the build halts, or the backslash is silently lost. Escape both where the value is written:

```yaml
variables:
  {{- $env := optional (default dict .context.inject) "env" dict }}
  DB_PASSWORD: "{{ optional $env "DB_PASSWORD" "" | replace "\\" "\\\\" | replace "\"" "\\\"" }}"
```

`optional` reads the key from the pipe's map with an empty fallback, so a password nothing delivered renders as empty text. The two `replace` calls escape the backslash first and then the quote, in that order so the quote's own escape is not escaped again, and leave every other character as it was. A value read through `index`, which halts when the key is absent, takes the same two `replace` calls as it stands.

One character this form does not carry is a line break. YAML folds a line break inside a double-quoted scalar into a space, so a credential holding one is delivered with a space where the break was. A FeatureRecipe writing a credential into its `injectMapping` writes it through `toJson` instead, which carries a quote, a backslash and a line break alike, as the [FeatureRecipe reference](../language-reference/entities/featurerecipe.md) shows.

That FeatureRecipe writes the credential under the mechanism the Recipe reads it from — `env:` for `.context.inject.env`, `file:`, `arg:`, or a mechanism of the component's own under its own name. `.context.inject.all` is built from those mechanisms and never from a mapping's output, so a mapping writing under `all:` would deliver nothing; the build halts on it instead, naming the attachment, the key and the FeatureRecipe.

## Platform operator

**[Manifest](../language-reference/entities/manifest.md)** — the routing layer. It instructs the compiler which Recipe realizes each Component for a given target, so the same Aggregate can be pointed at different implementations across environments — a cloud Recipe for production, a Compose Recipe for local testing — with no change to the developer's file.

**[Release](../language-reference/entities/release.md)** — the single compilation input, recording what one environment builds. It points at the Aggregate and Manifest, fulfills the `parameters` the developer exposed, attaches the Features whose inputs are operational, sizes with `infra` the ones the developer attached, and wires edges of its own within the sockets the architect declared. A Release fulfills exposed variation points; it cannot introduce new application `values` or new compute — those come only from the Aggregate.

## Cross-cutting support kinds

These kinds serve authors across roles rather than belonging to one.

**[SchemaLibrary](../language-reference/entities/schemalibrary.md)** — a shared library of schema shapes that recur across many Components and Features. When the same structure (say, a pod-resources block) appears in many entities, an architect factors it into a SchemaLibrary entry so it is defined and updated once.

**[MappingLibrary](../language-reference/entities/mappinglibrary.md)** — a shared library of reusable mapping logic that Recipes and FeatureRecipes draw on, so common translation patterns are single-sourced rather than copied.

**[WorkloadLibrary](../language-reference/entities/workloadlibrary.md)** — a shared library of reusable Workload content, so a deployment shape that recurs across many Recipes is declared once and imported into each `workload:` block.

**[ArtifactLibrary](../language-reference/entities/artifactlibrary.md)** — a shared library of reusable artifact bundles: named sets of auxiliary output files that belong together, such as a CRD with its RBAC. A Recipe or FeatureRecipe imports a bundle at one `artifacts:` entry and emits every file in it.

**[Plugin](../language-reference/entities/plugin.md)** — the extension kind. Beyond provider rendering, Plugins package the WebAssembly code that supplies domain-specific intelligence — policy validation, mutation, linting, and other sockets. Plugin authoring is a platform-team concern that supports every other role.

**[Workload](../language-reference/entities/workload.md)** — a platform-owned compiler kind, not a file a developer or operator hand-writes as a top-level entity. It is consumed inside a Recipe's `workload:` block, where the provider the Recipe renders with translates the normalized workload shape into its native form. Recipe authors interact with it through that block; the [Workload reference](../language-reference/entities/workload.md) documents the shape.

## Next

- [Authoring Aggrega files](getting-started.md) — the authoring loop, end to end.
- [Personas](personas.md) — the roles behind this map.
