# Entities by Role

Every entity kind has a role that typically authors it. This page is the complete map — reach for it when you know your concern but not yet which file it belongs in. The role assignment is guidance, not compiler enforcement (see [Personas](personas.md)); it names who *usually* owns a kind in a well-factored setup.

## The map at a glance

| Role | Entity kinds | Concern |
| --- | --- | --- |
| **Developer** | [Aggregate](../language-reference/entities/aggregate.md) | Application intent: what the app is and needs |
| **Platform architect** | [Component](../language-reference/entities/component.md), [Feature](../language-reference/entities/feature.md) | The reusable, versioned catalog contract |
| **Platform operations** | [Recipe](../language-reference/entities/recipe.md), [FeatureRecipe](../language-reference/entities/featurerecipe.md), provider-rendering [Plugin](../language-reference/entities/plugin.md) | Provider-specific translation to rendered infrastructure |
| **Platform operator** | [Manifest](../language-reference/entities/manifest.md), [Release](../language-reference/entities/release.md) | Routing and deployment wiring |
| **Cross-cutting support** | [SchemaLibrary](../language-reference/entities/schemalibrary.md), [MappingLibrary](../language-reference/entities/mappinglibrary.md), [Plugin](../language-reference/entities/plugin.md), [Workload](../language-reference/entities/workload.md) | Shared shapes, extension code, and the platform-owned compiler kind |

## Developer

**[Aggregate](../language-reference/entities/aggregate.md)** — the developer's single authoring surface and the single source of truth for application topology. It declares the components the application is built from, the `values` each one takes, the `parameters` exposed for per-environment variation, and the `uses` edges wiring components together. It stays deliberately blind to physical infrastructure: nothing in the Aggregate names a cloud, a cluster, or a provider. That capability-agnosticism is what lets one Aggregate deploy anywhere.

## Platform architect

**[Component](../language-reference/entities/component.md)** — a reusable, versioned contract for one kind of building block. It declares, via a JSON Schema, the `values` a developer may supply; the `provides` outputs it pipes to consumers; and the `uses`/`usesSchema` sockets it exposes for wiring. Components carry the semantic labels that drive policy and rendering. The architect keeps the Component's contract stable so developers can depend on it.

**[Feature](../language-reference/entities/feature.md)** — an attachable capability a developer or operator can add to a component: a metrics exporter, a data-masking proxy, a credential binding. A Feature declares what it needs and what it is incompatible with; the actual infrastructure it generates lives in its FeatureRecipe.

## Platform operations

**[Recipe](../language-reference/entities/recipe.md)** — the provider-specific realization of a Component. It maps the Component's declared values onto a concrete provider's output — a Helm release, a Compose service, a Terraform module — through templates, and pipes `provides` values to consumers. A Recipe never changes the developer-facing values a Component declares; it only decides *how* they are rendered.

**[FeatureRecipe](../language-reference/entities/featurerecipe.md)** — the provider-specific realization of a Feature, applied at binding time. It generates the resources a Feature attachment implies for a given provider.

**Provider-rendering [Plugin](../language-reference/entities/plugin.md)** — a *provider* is the Wasm guest that turns a Recipe's input into provider-native manifests. It is delivered as a Plugin with `pluginType: provider` that declares the provider name(s) it renders and its provider-socket contract. Operations (or a plugin author) supply providers so Recipes have a provider to render against. See the [Providers Overview](../language-reference/06-providers.md) for the shipped providers and their contracts.

## Platform operator

**[Manifest](../language-reference/entities/manifest.md)** — the routing layer. It instructs the compiler which Recipe realizes each Component for a given target, so the same Aggregate can be pointed at different implementations across environments — a cloud Recipe for production, a Compose Recipe for local testing — with no change to the developer's file.

**[Release](../language-reference/entities/release.md)** — the single compilation input and the deployment record. It points at the Aggregate and Manifest, fulfills the `parameters` the developer exposed, attaches Features, and wires deployment-time edges within the sockets the architect declared. A Release fulfills exposed variation points; it cannot introduce new application `values` or new compute — those come only from the Aggregate.

## Cross-cutting support kinds

These kinds serve authors across roles rather than belonging to one.

**[SchemaLibrary](../language-reference/entities/schemalibrary.md)** — a shared library of schema shapes that recur across many Components and Features. When the same structure (say, a pod-resources block) appears in many entities, an architect factors it into a SchemaLibrary entry so it is defined and updated once.

**[MappingLibrary](../language-reference/entities/mappinglibrary.md)** — a shared library of reusable mapping logic that Recipes and FeatureRecipes draw on, so common translation patterns are single-sourced rather than copied.

**[Plugin](../language-reference/entities/plugin.md)** — the extension kind. Beyond provider rendering, Plugins package the WebAssembly code that supplies domain-specific intelligence — policy validation, mutation, linting, and other sockets. Plugin authoring is a platform-team concern that supports every other role.

**[Workload](../language-reference/entities/workload.md)** — a platform-owned compiler kind, not a file a developer or operator hand-writes as a top-level entity. It is consumed inside a Recipe's `workload:` block, where the compiler translates a normalized workload shape into each provider's native form. Recipe authors interact with it through that block; the [Workload reference](../language-reference/entities/workload.md) documents the shape.

## Next

- [Getting Started](getting-started.md) — the authoring loop, end to end.
- [Personas](personas.md) — the roles behind this map.
