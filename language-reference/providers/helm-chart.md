# Helm-Chart Provider

The helm-chart provider produces a packaged Helm umbrella chart per Release boundary. Where the [helm provider](helm.md) emits flat Kubernetes YAML for direct GitOps consumption, helm-chart emits a chart scaffold — an umbrella `Chart.yaml` + `values.yaml` plus one sub-chart per contributing node — that downstream tooling can install via `helm install` or vendor for further per-environment customisation.

This page is the helm-chart provider's authoring reference. For the helm vs helm-chart split, see the [Provider engines](../10-status.md#provider-engines) section of the Status page; for the cross-provider input-composition model, see [architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md).

## Supported input kinds

The helm-chart provider accepts a single input kind:

- **Sourced mode only.** A Recipe with `source: <chart-path>` points at an on-disk Helm chart directory. The chart is copied verbatim into the umbrella structure as a sub-chart; no rendering or templating is performed at the per-node level. Aggrega's role is composition (umbrella assembly across the boundary's nodes), not template evaluation.

A Recipe targeting helm-chart that declares `workload:` or `workloadFrom:` is rejected at render time with a diagnostic pointing the author at the helm provider:

> source is required (helm-chart provider supports sourced mode only; for synthesised K8s manifests use the helm provider with workload:)

The split is deliberate: workload synthesis (translating an abstract Workload into Kubernetes resources) is the helm provider's exclusive concern. helm-chart's role is umbrella + sub-chart composition for charts the author has already produced.

## `source:` keyset

The helm-chart engine accepts `source:` as a **bare filesystem path string only**. Structured source objects (e.g. `source: { repo: ..., chart: ..., version: ... }`) are reserved for a future registry-integration intent and are rejected today.

```yaml
spec:
  provider: helm-chart
  source: ./charts/api-server     # filesystem path to a chart directory
  valuesMapping: |
    image: "{{ .values.image }}"
    replicaCount: {{ .infra.replicas | default 2 }}
```

The chart at the source path **must contain a valid `Chart.yaml`** at its root; missing it surfaces a clear error before the copy runs. The chart's directory layout is preserved when copied — `templates/`, `values.yaml`, `Chart.yaml`, and any other files are present in the sub-chart directory after composition.

A nil or empty source is rejected; helm-chart has no sourceless or generative fallback.

## Boundary composition — the umbrella shape

The provider runs in two phases per Release boundary:

1. **Per-node copy.** For each node bound to a helm-chart Recipe, the engine copies the source chart's full directory tree into a sub-chart slot. Files land flat in the per-node output map; the orchestrator nests them under `charts/<instance_id>/` when assembling the boundary output.
2. **Boundary umbrella assembly.** Once all per-node copies complete, the boundary composer emits an umbrella `Chart.yaml` + `values.yaml` at the boundary root. The umbrella declares one dependency per contributing node and routes per-node values under instance-id-keyed sub-blocks.

The umbrella `Chart.yaml` has the shape:

```yaml
apiVersion: v2
name: <aggregate-name>-<boundary-name>      # sanitised; "." and "_" replaced by "-"
version: 0.1.0
description: Aggrega umbrella chart for boundary "<boundary-name>"
dependencies:
  - name: <user-chart-name>                 # from the source chart's Chart.yaml
    version: <user-chart-version>           # from the source chart's Chart.yaml
    alias: <instance_id>                    # sanitised
    repository: file://charts/<instance_id>
```

Each dependency entry's `name` is the chart name extracted from the source chart's own `Chart.yaml`; the `alias` is the node's instance_id (sanitised). The alias serves two roles:

- It scopes the sub-chart under a unique path (`charts/<instance_id>/`) so multiple instances of the same source chart can coexist without filesystem collision.
- It scopes the sub-chart's values under `values.yaml.<alias>.*`, matching Helm's umbrella-values convention so per-instance values propagate correctly when the umbrella is installed.

The umbrella `values.yaml` is keyed by alias:

```yaml
api-server:                          # sub-chart alias = sanitised instance_id
  image: "registry/api-server:v2"
  replicaCount: 3
billing-svc:
  image: "registry/billing:v1"
  replicaCount: 2
```

When a sub-chart's `valuesMapping:` evaluates against its TemplateContext, the resulting values map populates this alias-keyed sub-block automatically.

## Engine-specific quirks

- **Sub-chart `Chart.yaml` is required.** The copy operation enforces a present `Chart.yaml` at the source-path root. Missing it halts the build before the umbrella step runs.
- **Default sub-chart version.** When the source chart's `Chart.yaml` declares no version (an unusual but valid Helm chart shape), the umbrella assigns `0.1.0` as a fallback for the dependency entry.
- **Sanitised aliases and chart names.** Instance IDs and aggregate names with `.` or `_` characters have those replaced with `-` before they appear in chart-name or alias positions, matching Helm's name constraints. Authors who name aggregate or boundaries with `.`/`_` characters will see them transformed in the rendered umbrella.
- **`file://` repository pointer.** The umbrella's dependency entries use a `file://charts/<alias>` repository pointer; this is the local-filesystem convention for in-tree sub-charts and lets `helm dependency build` resolve the umbrella without external registry calls.
- **No template rendering at the helm-chart level.** The provider does not invoke the Helm SDK's render pipeline; it copies and composes. Authors who need pre-rendered flat manifests should use the helm provider's sourced mode instead.

## Worked example

A two-node boundary, each node bound to a helm-chart Recipe pointing at the same source chart:

```yaml
# Recipe — used by both `api-east` and `api-west` instances
apiVersion: aggrega.ai/v1alpha1
kind: Recipe
metadata:
  name: api-server-helmchart
  version: 1.0.0
spec:
  provider: helm-chart
  implements: core/api-server
  source: ./charts/api-server
  valuesMapping: |
    image: "{{ .values.image }}"
    replicaCount: {{ .infra.replicas | default 2 }}
```

After Release composition, the boundary output directory contains:

```text
boundaries/<boundary>/
├── Chart.yaml                       # umbrella; lists api-east and api-west as dependencies
├── values.yaml                      # alias-keyed: api-east + api-west values blocks
└── charts/
    ├── api-east/                    # full copy of ./charts/api-server
    │   ├── Chart.yaml
    │   ├── values.yaml
    │   └── templates/
    │       └── deployment.yaml
    └── api-west/                    # full copy of ./charts/api-server
        ├── Chart.yaml
        ├── values.yaml
        └── templates/
            └── deployment.yaml
```

A `helm install <release-name> boundaries/<boundary>` against this layout installs both instances as a single Helm release, with the umbrella's alias-keyed values driving each sub-chart's templates.

## Cross-references

- [`providers/helm.md`](helm.md) — sister provider that emits flat rendered Kubernetes YAML rather than a chart scaffold; carries workload synthesis.
- [`entities/recipe.md`](../entities/recipe.md) — Recipe authoring surface and the three input kinds.
- [`entities/release.md`](../entities/release.md) — Release boundary semantics and per-boundary output directories.
- [`architecture/16-recipe-input-composition.md`](../../architecture/16-recipe-input-composition.md) — cross-provider Provider Capability Matrix.
- [`10-status.md#provider-engines`](../10-status.md#provider-engines) — current readiness classification.
