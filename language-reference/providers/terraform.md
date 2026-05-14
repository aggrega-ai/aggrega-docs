# Terraform Provider

The `terraform` provider will translate Aggrega Recipes into Terraform modules and `.tf.json` manifests. It is a planned addition to the provider standard library that is not yet available.

## Current state

The `terraform` provider does not ship today. A Recipe declaring `provider: terraform` parses and schema-validates — the provider name is reserved — but no rendering engine is wired to produce Terraform output. Attempting to build a Release that targets a Terraform Recipe halts with a "provider not registered" diagnostic. None of the three Recipe input kinds (`source:` + `valuesMapping:`, `workload:`, `artifacts:`) produce output for this provider today.

## Designed scope

When the Terraform provider ships, its capability surface is intended to cover all three input kinds that the public composition model defines at [../../architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md):

- **Sourced.** A `source:` URI identifies a Terraform module (local path, registry ref, or git ref). `valuesMapping:` produces a Go-template-rendered value set the provider surfaces as module input variables. Module output becomes the rendered artifacts.
- **Synthesized.** A Recipe's `workload:` field (inline or `$import:`-loaded) describes a platform-owned Workload; the provider synthesizes target-cloud compute resources (ECS, Fargate, Cloud Run, Container Apps, App Service, and similar) from that Workload. The target-resource-selection question — which compute surface the synthesizer emits against — is resolved by the provider's own design when it ships.
- **Artifacts.** `artifacts:` entries (inline or per-entry `$import:`-loaded) produce Go-template-rendered `.tf.json` files that the provider emits alongside any module output.

## Provider capability declaration

A Provider entity backs the `terraform` name. When the provider ships, the Provider entity will declare a `workloadSchema` if (and only if) the synthesized input kind is supported. Recipes targeting `terraform` with `workload:` require that declaration — a Recipe that uses synthesized input against a Provider without `workloadSchema` fails at Recipe load (see [../entities/recipe.md](../entities/recipe.md)).

## Output layout

Rendered output is emitted to the boundary directory configured by the Manifest. The file layout will track the conventions already established by the Helm and Compose providers (one boundary directory per targeted boundary, collision detection across input kinds, provenance labels injected into every emitted artifact).

## See also

- [./architecture.md](./architecture.md) — provider system overview and dispatch model.
- [./reference-matrix.md](./reference-matrix.md) — capability matrix across providers.
- [./helm.md](./helm.md), [./helm-chart.md](./helm-chart.md), [./compose.md](./compose.md) — providers that currently ship, for pattern reference.
- [../entities/recipe.md](../entities/recipe.md) — input-kind authoring surface.
- [../../architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md) — the three-input-kinds composition model.
