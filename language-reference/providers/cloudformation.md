# CloudFormation Provider

The `cloudformation` provider will translate Aggrega Recipes into CloudFormation templates and sub-stack definitions. It is a planned addition to the provider standard library that is not yet available.

## Current state

The `cloudformation` provider does not ship today. A Recipe declaring `provider: cloudformation` parses and schema-validates — the provider name is reserved — but no rendering engine is wired to produce CloudFormation output. Attempting to build a Release that targets a CloudFormation Recipe halts with a "provider not registered" diagnostic. None of the three Recipe input kinds (`source:` + `valuesMapping:`, `workload:`, `artifacts:`) produce output for this provider today.

## Designed scope

When the CloudFormation provider ships, its capability surface is intended to cover all three input kinds that the public composition model defines at [../../architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md):

- **Sourced.** A `source:` URI identifies a CloudFormation template (local path, S3 URI, or git ref). `valuesMapping:` produces a Go-template-rendered value set the provider surfaces as template parameters. The rendered template becomes the emitted artifact.
- **Synthesized.** A Recipe's `workload:` field (inline or `$import:`-loaded) describes a platform-owned Workload; the provider synthesizes AWS compute resources (ECS, Fargate, App Runner, and similar) from that Workload. The target-resource-selection question — which compute surface the synthesizer emits against — is resolved by the provider's own design when it ships.
- **Artifacts.** `artifacts:` entries (inline or per-entry `$import:`-loaded) produce Go-template-rendered CloudFormation resource snippets or sub-stack definitions that the provider emits alongside any template output.

## Provider capability declaration

A Provider entity backs the `cloudformation` name, but no `cloudformation` rendering engine is registered with the compiler yet, so a Recipe targeting `cloudformation` is rejected at render time as an unknown provider (regardless of input kind). When the engine ships, whether it supports the synthesized input kind (`workload:`) will be a property of that engine; the catalog will declare `workloadSchema` on the Provider by convention if synthesis is supported, as the documented translation contract (see [../entities/recipe.md](../entities/recipe.md)).

## Output layout

Rendered output is emitted to the boundary directory configured by the Manifest. The file layout will track the conventions already established by the Helm and Compose providers (one boundary directory per targeted boundary, collision detection across input kinds, provenance labels injected into every emitted artifact).

## See also

- [./architecture.md](./architecture.md) — provider system overview and dispatch model.
- [./reference-matrix.md](./reference-matrix.md) — capability matrix across providers.
- [./helm.md](./helm.md), [./helm-chart.md](./helm-chart.md), [./compose.md](./compose.md) — providers that currently ship, for pattern reference.
- [../entities/recipe.md](../entities/recipe.md) — input-kind authoring surface.
- [../../architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md) — the three-input-kinds composition model.
