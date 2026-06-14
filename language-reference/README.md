# Language Reference

The "what" and "how to use" of Aggrega. Syntax, CLI invocation, error catalog, worked examples.

Read the chapters below in order for first-time understanding. Reference subdirectories are listed under their chapter — jump directly when looking up a specific entity, keyword, provider, CLI command, or error.

Before reading the chapter sequence, consult [Status of the Language](10-status.md) for the current state of readiness — which language surfaces are available today, which are accepted but not yet acted on by the compiler, and which are planned for future iterations.

## Entity tier model

Aggrega has ten entity kinds organised into three tiers reflecting adoption progression. **Tiering is a documentation and onboarding mechanism, not a runtime constraint**: every entity kind is a first-class language citizen; the compiler treats them uniformly; the open-source Aggrega supports all tiers without licensing or feature gating. The tier markers signal "advanced; skip if not needed" for navigation, not capability.

| Tier | Entity kinds | When to adopt |
| --- | --- | --- |
| **Tier 1 — the minimum viable surface** | Aggregate, Component, Recipe, Manifest, Release | Day 1 — solo founders and small teams ship working software with only Tier 1. The mental model: "I have an app; I want to deploy it; here's how." |
| **Tier 2 — role separation** | Feature, FeatureRecipe, Provider | Day 30 — small teams where roles split (developer + Ops + sometimes Security). Tier 2 enters via Provider plugins (Ops choose Helm vs Terraform vs Compose), Features (Security manages credentials separately from app config), and FeatureRecipes (binding-time customisation per provider). |
| **Tier 3 — cross-Component reuse** | SchemaLibrary, MappingLibrary | Day 365 — mature catalogs where common shapes recur across many entities. The threshold is informal: when a shape (e.g., `PodResources`) appears in 5+ Components and coordinating updates is friction, a SchemaLibrary entry justifies itself. |

Each progression is opt-in. A solo founder is never forced to look at Tier 3; an enterprise catalog has full access to Tier 3 as needed. Tier 1 is *complete* for the solo-founder use case — a developer can ship working applications using only Tier 1 entities. This is a strong design property: Tier 1 is not a "subset that compiles"; it is a "subset that ships software."

The five-entity Tier 1 surface carries an entry cost — Aggregate + Component + Recipe + Manifest + Release is more ceremony than "drop a YAML file, get a deployment." The cost is the price of the four-domain authoring separation (Developer Intent / Platform Catalog / Platform Ops / Routing) that makes Aggrega different from raw Helm or raw Terraform. A future scaffolding tool (`aggrega quick`) will generate a one-file workspace bundling all five entities for tutorial and "trying-it-on-a-Saturday" use cases; the underlying language is unchanged. Until that tool ships, the Tier 1 tutorials walk through the five-entity setup explicitly.

Within Tier 3, the `$templates:` / `$instantiate:` mechanic (parametric helpers in SchemaLibrary) is documented as an even-more-advanced sub-feature. Most Tier 3 adopters do not reach for `$templates:` initially; the threshold is "when your library has 6+ schemas sharing parameterised structure."

## Reading order

1. [Getting Started](01-getting-started.md)
2. [Naming Conventions](02-naming-conventions.md)
3. [Entity Reference Overview](03-entities.md)
   - **Tier 1**: [aggregate](entities/aggregate.md), [component](entities/component.md), [recipe](entities/recipe.md), [manifest](entities/manifest.md), [release](entities/release.md)
   - **Tier 2**: [feature](entities/feature.md), [featurerecipe](entities/featurerecipe.md), [provider](entities/provider.md)
   - **Tier 3**: [schemalibrary](entities/schemalibrary.md), [mappinglibrary](entities/mappinglibrary.md)
   - Cross-cutting: [workload](entities/workload.md) (platform-owned compiler kind consumed inside Recipe `workload:`)
4. [Vocabulary Overview](04-vocabulary.md)
   - Vocabulary reference: [topology-triad (provides, inject, uses)](vocabulary/topology-triad.md), [data-pillars (values, infra, parameters, locals)](vocabulary/data-pillars.md), [inheritance-and-interface (extends, implements)](vocabulary/inheritance-and-interface.md), [modifier-system (appliesTo, selectors)](vocabulary/modifier-system.md), [compact-form-authoring](vocabulary/compact-form-authoring.md), [cross-document-ref](vocabulary/cross-document-ref.md), [labels-and-annotations](vocabulary/labels-and-annotations.md), [publishing-surface](vocabulary/publishing-surface.md), [social-contracts](vocabulary/social-contracts.md), [validation-surface](vocabulary/validation-surface.md), [output-composition](vocabulary/output-composition.md), [uri-grammar](vocabulary/uri-grammar.md), [version-resolution](version-resolution.md)
5. [Templates Overview](05-templates.md)
   - Templates reference: [expansion-matrix](templates/expansion-matrix.md), [template-context-contract](templates/template-context-contract.md), [sprig-functions](templates/sprig-functions.md), [parameters-context](templates/parameters-context.md), [assertions-block](templates/assertions-block.md)
6. [Providers Overview](06-providers.md)
   - Providers reference: [architecture](providers/architecture.md), [well-known-annotations](providers/well-known-annotations.md), [reference-matrix](providers/reference-matrix.md), [helm](providers/helm.md), [helm-chart](providers/helm-chart.md), [compose](providers/compose.md), [terraform](providers/terraform.md), [cloudformation](providers/cloudformation.md)
7. [CLI Overview](07-cli.md)
   - CLI reference: [aggrega-build](cli/aggrega-build.md), [aggrega-inspect](cli/aggrega-inspect.md), [aggrega-pull](cli/aggrega-pull.md), [aggrega-lint](cli/aggrega-lint.md), [global-flags](cli/global-flags.md)
8. [Errors Overview](08-errors.md)
   - Errors reference: [fatal-halts](errors/fatal-halts.md), [warnings](errors/warnings.md)
9. [Examples Overview](09-examples.md)
   - Examples reference: [01-getting-started](examples/01-getting-started.md), [02-data-model](examples/02-data-model.md), [03-features-and-policies](examples/03-features-and-policies.md), [04-secrets](examples/04-secrets.md), [05-credential-features](examples/05-credential-features.md), [06-composition](examples/06-composition.md), [07-input-kinds](examples/07-input-kinds.md), [08-advanced-patterns](examples/08-advanced-patterns.md), [09-cross-boundary-routing](examples/09-cross-boundary-routing.md)
