# Provider Capability Matrix

Aggrega's standard-library providers each accept a different subset of the three Recipe input kinds (sourced, synthesized, artifacts). The canonical capability matrix — covering both what ships in the current compiler binary and the designed target shape — lives in [../../architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md) under "Provider Capability Matrix." Read that section for the authoritative grid.

This page summarises the provider-side nuances that matter for Recipe authors choosing between providers, and points into each per-provider reference page for detail.

## At-a-glance highlights

- **`helm`** supports all three input kinds at the designed-target level. Sourced (Helm chart via the Helm SDK) ships today; synthesized (Workload → Deployment/StatefulSet + Services + PVCs) and artifacts (standalone Kubernetes YAML files) land as the render paths ship. See [helm.md](helm.md).
- **`helm-chart`** packages multiple components into a single umbrella Helm chart per boundary. Sourced mode (umbrella-chart composition) ships today; the synthesized input kind is not applicable to this provider by architecture (umbrella orchestrates sub-charts; the Workload kind is a leaf concept belonging inside each sub-chart, which is the `helm` provider's domain). Artifacts in this provider take a special shape — `$import:`-loaded `artifacts:` entries are pre-Helm-templated and injected into the chart's `templates/` directory before Helm rendering; inline-content entries are rejected. See [helm-chart.md](helm-chart.md).
- **`compose`** supports all three input kinds at the designed-target level. Sourced (compose fragment overlay), synthesized (Workload → compose service + volumes + networks), and artifacts (compose fragments merged into the combined `docker-compose.yaml`) land as the compose provider's render paths wire into the build. See [compose.md](compose.md).
- **`terraform`** supports sourced and artifacts at the designed-target level; Workload synthesis is not yet implemented (the target-resource selection question — ECS, Fargate, Cloud Run — is resolved in a future iteration). See [terraform.md](terraform.md).
- **`cloudformation`** supports sourced and artifacts at the designed-target level; Workload synthesis is not yet implemented for the same target-selection reason as terraform. See [cloudformation.md](cloudformation.md).

## Where to look for what

| If you want to know… | Look at |
| --- | --- |
| Which provider supports which input kind today, and which are forward-looking | [../../architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md) Provider Capability Matrix section (both tables) |
| How a provider's plugin socket receives input and returns output | [architecture.md](architecture.md) |
| Per-provider authoring shape (chart structure, compose top-level keys, `.tf.json` layout, CFN template shape) | The matching per-provider page ([helm.md](helm.md), [helm-chart.md](helm-chart.md), [compose.md](compose.md), [terraform.md](terraform.md), [cloudformation.md](cloudformation.md)) |
| Which boundary annotations each provider consumes and their defaults | [well-known-annotations.md](well-known-annotations.md) |
| The Workload kind's authoring surface | [../entities/workload.md](../entities/workload.md) |
| The three-input-kinds composition model conceptually | [../../architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md) |
