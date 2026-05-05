# Language Reference

The "what" and "how to use" of Aggrega. Syntax, CLI invocation, error catalog, worked examples.

Read the chapters below in order for first-time understanding. Reference subdirectories are listed under their chapter — jump directly when looking up a specific entity, keyword, provider, CLI command, or error.

Before reading the chapter sequence, consult [Status of the Language](10-status.md) for the current state of readiness — which language surfaces are available today, which are accepted but not yet acted on by the compiler, and which are planned for future iterations.

## Reading order

1. [Getting Started](01-getting-started.md)
2. [Naming Conventions](02-naming-conventions.md)
3. [Entity Reference Overview](03-entities.md)
   - Entities reference: [aggregate](entities/aggregate.md), [component](entities/component.md), [feature](entities/feature.md), [recipe](entities/recipe.md), [featurerecipe](entities/featurerecipe.md), [provider](entities/provider.md), [manifest](entities/manifest.md), [release](entities/release.md), [workload](entities/workload.md)
4. [Vocabulary Overview](04-vocabulary.md)
   - Vocabulary reference: [topology-triad (provides, inject, uses)](vocabulary/topology-triad.md), [data-pillars (values, infra, parameters, locals)](vocabulary/data-pillars.md), [inheritance-and-interface (extends, implements)](vocabulary/inheritance-and-interface.md), [modifier-system (appliesTo, selectors)](vocabulary/modifier-system.md)
5. [Templates Overview](05-templates.md)
   - Templates reference: [expansion-matrix](templates/expansion-matrix.md), [template-context-contract](templates/template-context-contract.md), [sprig-functions](templates/sprig-functions.md)
6. [Providers Overview](06-providers.md)
   - Providers reference: [architecture](providers/architecture.md), [well-known-annotations](providers/well-known-annotations.md), [reference-matrix](providers/reference-matrix.md), [helm](providers/helm.md), [helm-chart](providers/helm-chart.md), [compose](providers/compose.md), [terraform](providers/terraform.md), [cloudformation](providers/cloudformation.md)
7. [CLI Overview](07-cli.md)
   - CLI reference: [aggrega-build](cli/aggrega-build.md), [aggrega-inspect](cli/aggrega-inspect.md), [aggrega-pull](cli/aggrega-pull.md), [aggrega-lint](cli/aggrega-lint.md), [global-flags](cli/global-flags.md)
8. [Errors Overview](08-errors.md)
   - Errors reference: [fatal-halts](errors/fatal-halts.md), [warnings](errors/warnings.md)
9. [Examples Overview](09-examples.md)
   - Examples reference: [01-getting-started](examples/01-getting-started.md), [02-data-model](examples/02-data-model.md), [03-features-and-policies](examples/03-features-and-policies.md), [04-secrets](examples/04-secrets.md), [05-credential-features](examples/05-credential-features.md), [06-composition](examples/06-composition.md), [07-input-kinds](examples/07-input-kinds.md), [08-advanced-patterns](examples/08-advanced-patterns.md), [09-cross-boundary-routing](examples/09-cross-boundary-routing.md)
