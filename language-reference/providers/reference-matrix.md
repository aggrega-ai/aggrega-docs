# Provider Reference Index

Aggrega's standard-library providers each accept a different subset of the three Recipe input kinds (sourced, synthesized, artifacts). The canonical capability matrix lives in [../../architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md) under "Provider Capability Matrix." Read that section for the authoritative grid, and the per-provider prose beneath it for which *combinations* of input kinds each provider accepts — a grid states each kind on its own and cannot say that two of them may be declared together.

This page is a signpost. It states what each standard-library provider produces and routes you to the page that covers it; which input kinds a provider accepts, and in which combinations, is answered by the sections linked above.

## The standard-library providers

- **`helm`** — produces flat Kubernetes manifests. See [helm.md](helm.md).
- **`helm-chart`** — packages a boundary's components into a single umbrella Helm chart. See [helm-chart.md](helm-chart.md).
- **`compose`** — produces Docker Compose services, merged into one compose file per boundary. See [compose.md](compose.md).
- **`terraform`** — produces Terraform configuration. It emits configuration and never runs Terraform. See [terraform.md](terraform.md).
- **`cloudformation`** — produces CloudFormation stack templates, one per boundary. It emits configuration and never runs CloudFormation. See [cloudformation.md](cloudformation.md).

## What a boundary's `syncWave` does on each provider

A Release boundary's `syncWave:` value orders deployment on every standard-library provider, and what it orders — and in what terms — differs by provider:

| Provider | What the wave does |
| --- | --- |
| `helm`, `helm-chart` | Orders the deployment. Every rendered resource carries `argocd.argoproj.io/sync-wave`, and a chart-templated hook resource additionally carries `helm.sh/hook-weight`. |
| `compose` | Orders the services **within** the compose file the boundary renders into, through `depends_on` between them, and additionally records the value on each emitted service as the `aggrega.ai/sync-wave` label. Ordering across two compose files is not expressible — see [compose.md](compose.md#deployment-wave-ordering). |
| `terraform` | Orders the `module` blocks of the root configuration the boundary assembles into, through `depends_on` between them. It is the order Terraform performs its actions in rather than readiness — a configuration has no notion of a resource being serviceable — and no teardown order is promised. Ordering across two root configurations is not expressible, and the value is also recorded with the node's build provenance — see [terraform.md](terraform.md#deployment-ordering). |
| `cloudformation` | Orders provisioning of the stack the boundary assembles into, through `DependsOn` between resources. It is creation order, and in reverse deletion order, rather than readiness — a stack template has no notion of a resource being serviceable. Ordering across two stacks is not expressible — see [cloudformation.md](cloudformation.md#deployment-ordering). |

Authoring a per-boundary `syncWave:` is covered on the [Release entity page](../entities/release.md); the exact labels and annotations each provider emits are in [well-known-annotations.md](well-known-annotations.md).

## Where to look for what

| If you want to know… | Look at |
| --- | --- |
| Which provider supports which input kind | [../../architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md) Provider Capability Matrix section |
| Which *combinations* of input kinds a provider accepts, and what a refusal prints | [../../architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md#what-each-provider-accepts-in-full) "What each provider accepts, in full" |
| How a provider's plugin socket receives input and returns output | [architecture.md](architecture.md) |
| Per-provider authoring shape (chart structure, compose top-level keys, Terraform bodies, CloudFormation fragments) | The matching per-provider page ([helm.md](helm.md), [helm-chart.md](helm-chart.md), [compose.md](compose.md), [terraform.md](terraform.md), [cloudformation.md](cloudformation.md)) |
| Which boundary annotations each provider consumes and their defaults | [well-known-annotations.md](well-known-annotations.md) |
| What a boundary's `syncWave` does on each provider | The table above |
| Whether a provider reports the name it gives output rendered from supplied source, and what to read where it does not | [../templates/rendered-resource-names.md](../templates/rendered-resource-names.md) |
| The Workload kind's authoring surface | [../entities/workload.md](../entities/workload.md) |
| The three-input-kinds composition model conceptually | [../../architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md) |
