# Provider Reference Index

Aggrega's standard-library providers each accept a different subset of the three Recipe input kinds (sourced, synthesized, artifacts). The canonical capability matrix lives in [../../architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md) under "Provider Capability Matrix." Read that section for the authoritative grid.

This page is a signpost. It states what each standard-library provider produces and routes you to the page that covers it; which input kinds a provider accepts is answered by the authoritative grid linked above.

## The standard-library providers

- **`helm`** — produces flat Kubernetes manifests. See [helm.md](helm.md).
- **`helm-chart`** — packages a boundary's components into a single umbrella Helm chart. See [helm-chart.md](helm-chart.md).
- **`compose`** — produces Docker Compose services, merged into one compose file per boundary. See [compose.md](compose.md).
- **`terraform`** — produces Terraform configuration. It emits configuration and never runs Terraform. See [terraform.md](terraform.md).
- **`cloudformation`** — produces CloudFormation stack templates, one per boundary. It emits configuration and never runs CloudFormation. See [cloudformation.md](cloudformation.md).

## What a boundary's `syncWave` does on each provider

A Release boundary's `syncWave:` value orders deployment on the Kubernetes-facing providers only. Elsewhere it orders nothing, and what becomes of the value differs by provider:

| Provider | What the wave does |
| --- | --- |
| `helm`, `helm-chart` | Orders the deployment. Every rendered resource carries `argocd.argoproj.io/sync-wave`, and a chart-templated hook resource additionally carries `helm.sh/hook-weight`. |
| `compose` | Orders nothing. The value is recorded on each emitted service as the `aggrega.ai/sync-wave` label. |
| `terraform` | Orders nothing. The value is recorded with the node's build provenance. |
| `cloudformation` | Orders nothing, and the value reaches no part of the emitted stack template. |

Authoring a per-boundary `syncWave:` is covered on the [Release entity page](../entities/release.md); the exact labels and annotations each engine emits are in [well-known-annotations.md](well-known-annotations.md).

## Where to look for what

| If you want to know… | Look at |
| --- | --- |
| Which provider supports which input kind | [../../architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md) Provider Capability Matrix section |
| How a provider's plugin socket receives input and returns output | [architecture.md](architecture.md) |
| Per-provider authoring shape (chart structure, compose top-level keys, Terraform bodies, CloudFormation fragments) | The matching per-provider page ([helm.md](helm.md), [helm-chart.md](helm-chart.md), [compose.md](compose.md), [terraform.md](terraform.md), [cloudformation.md](cloudformation.md)) |
| Which boundary annotations each provider consumes and their defaults | [well-known-annotations.md](well-known-annotations.md) |
| What a boundary's `syncWave` does on each provider | The table above |
| The Workload kind's authoring surface | [../entities/workload.md](../entities/workload.md) |
| The three-input-kinds composition model conceptually | [../../architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md) |
