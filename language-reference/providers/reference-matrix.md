# Provider Reference Index

Aggrega's standard-library providers each accept a different subset of the three Recipe input kinds (sourced, synthesized, artifacts). The canonical capability matrix lives in [../../architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md) under "Provider Capability Matrix." Read that section for the authoritative grid.

This page is a signpost. It states what each standard-library provider produces and routes you to the page that covers it; which input kinds a provider accepts is answered by the authoritative grid linked above.

## The standard-library providers

- **`helm`** — produces flat Kubernetes manifests. See [helm.md](helm.md).
- **`helm-chart`** — packages a boundary's components into a single umbrella Helm chart. See [helm-chart.md](helm-chart.md).
- **`compose`** — produces Docker Compose services, merged into one compose file per boundary. See [compose.md](compose.md).
- **`terraform`** — produces Terraform configuration. It emits configuration and never runs Terraform. See [terraform.md](terraform.md).
- **`cloudformation`** — produces CloudFormation stack templates, one per boundary. It emits configuration and never runs CloudFormation. See [cloudformation.md](cloudformation.md).

## Where to look for what

| If you want to know… | Look at |
| --- | --- |
| Which provider supports which input kind | [../../architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md) Provider Capability Matrix section |
| How a provider's plugin socket receives input and returns output | [architecture.md](architecture.md) |
| Per-provider authoring shape (chart structure, compose top-level keys, Terraform bodies, CloudFormation fragments) | The matching per-provider page ([helm.md](helm.md), [helm-chart.md](helm-chart.md), [compose.md](compose.md), [terraform.md](terraform.md), [cloudformation.md](cloudformation.md)) |
| Which boundary annotations each provider consumes and their defaults | [well-known-annotations.md](well-known-annotations.md) |
| The Workload kind's authoring surface | [../entities/workload.md](../entities/workload.md) |
| The three-input-kinds composition model conceptually | [../../architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md) |
