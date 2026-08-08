# Helm-Chart Provider

The helm-chart provider produces a packaged Helm umbrella chart per assembly path. Where the [helm provider](helm.md) emits flat Kubernetes YAML for direct GitOps consumption, helm-chart emits a chart scaffold — an umbrella `Chart.yaml` + `values.yaml` plus one sub-chart per contributing node — that downstream tooling can install via `helm install` or vendor for further per-environment customisation. The provider assembles per-`(path, provider)`: every node bound to a helm-chart Recipe contributes to the umbrella at the boundary's evaluated `directory:` joined with the per-component `subDirectory:`. Two boundaries that evaluate to the same path collapse into one merged umbrella chart that lists every contributor as a sub-chart dependency.

Each rendered Kubernetes resource emitted from sub-chart templates carries the boundary's `syncWave: <integer>` value as the `argocd.argoproj.io/sync-wave: "<N>"` annotation; Helm hooks additionally carry `helm.sh/hook-weight: "<N>"`. ArgoCD, Flux, and Helm read these annotations natively.

This page is the helm-chart provider's authoring reference. For the helm vs helm-chart split, see the [Provider engines](../10-status.md#provider-engines) section of the Status page; for the cross-provider input-composition model, see [architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md).

## Supported input kinds

The helm-chart provider accepts two input kinds:

- **Sourced mode.** A Recipe with `source: <chart-path>` points at an on-disk Helm chart directory. The chart is copied verbatim into the umbrella structure as a sub-chart; no rendering or templating is performed at the per-node level. Aggrega's role is composition (umbrella assembly across the boundary's nodes), not template evaluation.
- **`$import:`-loaded `artifacts:` mode.** A Recipe with `artifacts:` entries authored as `$import:` per-entry declares additional template files that the helm-chart provider injects into the sub-chart's `templates/` directory after the source-chart copy. Each file is pre-templated against Aggrega's TemplateContext using `[[ ]]` delimiters (see "`artifacts:` injection rule" below) so any `{{ }}` Helm templating in the same file survives into the downstream `helm install` render.

A Recipe targeting helm-chart that declares `workload:` is rejected at render time with a diagnostic pointing the author at the helm provider:

> source is required (helm-chart provider supports sourced mode only; for synthesised K8s manifests use the helm provider with workload:)

The split is deliberate: workload synthesis (translating an abstract Workload into Kubernetes resources) is the helm provider's exclusive concern. helm-chart's role is umbrella + sub-chart composition for charts the author has already produced.

A Recipe targeting helm-chart may also declare **inline-content `artifacts:` entries** (entries whose value is a block scalar carrying the file body inline in the Recipe rather than an `$import:`-loaded reference). An inline-content entry is placed verbatim at the sub-chart root under its authored key — no `templates/` prefix, no provenance splice, no Go-template evaluation. A chart's own templates read such a loose file through Helm's `.Files.Get` / `.Files.Glob` (the canonical ConfigMap-from-files pattern), so a chart-root file is a legitimate, first-class shape rather than an error.

The two artifact forms serve different roles:

- An **`$import:`-loaded entry** is a template file: it is pre-templated with `[[ ]]` delimiters (see "`artifacts:` injection rule" below) and injected into the sub-chart's `templates/` directory, where its own `{{ }}` Helm directives then evaluate at downstream `helm install` time.
- An **inline-content entry** is a loose data file: it lands byte-for-byte at the chart root for `.Files`-based consumption, so any `{{ }}` in its body is preserved untouched.

## `artifacts:` injection rule

When a helm-chart Recipe declares `artifacts:` entries via per-entry `$import:`, each `$import:` value is a path to a template file resolved **relative to the Recipe's own directory** (the directory containing the Recipe YAML on disk). The provider:

1. Reads each file's content.
2. Pre-templates the content with Aggrega delimiters `[[ ]]` against the Recipe's TemplateContext (the same context the Recipe's `valuesMapping:` evaluates against). `{{ }}` inside the file content is left untouched — those become Helm template directives at `helm install` time.
3. Writes each file to `boundaries/<boundary-path>/charts/<instance-id>/templates/<basename>` of the umbrella output. The basename is the file's name only — directory structure within the source path is flattened.

The `[[ ]]` / `{{ }}` dual-delimiter discipline is the load-bearing detail. A typical `$import:`-loaded artifact file might mix Aggrega-time interpolation (e.g., `[[ .values.image ]]`) with Helm-time interpolation (e.g., `{{ .Release.Namespace }}`). Each delimiter pair fires at its own phase: Aggrega resolves `[[ ]]` at compile time before the file lands; Helm resolves `{{ }}` at install time after the umbrella ships.

Filename collisions across the source-chart's templates and the `$import:`-loaded artifact injections raise `CATALOG_ERROR` — the diagnostic names both the chart-supplied template and the conflicting `$import:` source. Authors resolve the collision by renaming one of the conflicting files.

## `source:` keyset

The helm-chart engine accepts `source:` as a **bare filesystem path string only**. Structured source objects (e.g. `source: { repo: ..., chart: ..., version: ... }`) are reserved for future registry integration and are rejected today.

```yaml
spec:
  capability: helm-chart
  source: ./charts/api-server     # filesystem path to a chart directory
  valuesMapping: |
    image: "{{ .values.image }}"
    replicaCount: {{ optional .infra `replicas` 2 }}
```

The chart at the source path **must contain a valid `Chart.yaml`** at its root; missing it surfaces a clear error before the copy runs. The chart's directory layout is preserved when copied — `templates/`, `values.yaml`, `Chart.yaml`, and any other files are present in the sub-chart directory after composition.

A nil or empty source is rejected; helm-chart has no sourceless or generative fallback.

## Path-keyed composition — the umbrella shape

The provider runs in two phases per assembly path:

1. **Per-node copy.** For each node bound to a helm-chart Recipe, the engine copies the source chart's full directory tree into a sub-chart slot. Files land flat in the per-node output map; the orchestrator nests them under `charts/<instance_id>/` when assembling the umbrella.
2. **Per-`(path, provider)` umbrella assembly.** Once all per-node copies for the path complete, the assembler emits an umbrella `Chart.yaml` + `values.yaml` at the assembly path's root. The umbrella declares one dependency per contributing node and routes per-node values under instance-id-keyed sub-blocks. When the assembly path receives contributors from more than one boundary (boundaries with shared `directory:`), every contributor lands as a dependency in the same umbrella.

The umbrella `Chart.yaml` has the shape:

```yaml
apiVersion: v2
name: <effective-chart-name>                # see "Chart-name resolution" below
version: 0.1.0
description: Aggrega umbrella chart at <assembly-path>
dependencies:
  - name: <user-chart-name>                 # from the source chart's Chart.yaml
    version: <user-chart-version>           # from the source chart's Chart.yaml
    alias: <instance_id>                    # sanitised
    repository: file://charts/<instance_id>
```

### Chart-name resolution

The umbrella's chart `name` is resolved through the boundary annotation cascade. Each contributing boundary's effective `aggrega.ai/chart-name` annotation (the cascade-resolved value, walking up the boundary tree) determines the umbrella name. When the assembly path receives contributors from more than one boundary, every contributor's effective `aggrega.ai/chart-name` MUST resolve to the same value; mismatches raise `CHART_NAME_MISMATCH` and halt the build with a diagnostic naming the conflicting values and the contributing boundaries.

The cascade resolves the DRY tension naturally: declare `aggrega.ai/chart-name` once on the parent boundary and child boundaries inherit it through the cascade; sibling boundaries with no common parent must declare matching values explicitly. Boundaries with no `aggrega.ai/chart-name` declared anywhere in their cascade fall back to a sanitised concatenation of the aggregate name and the contributing boundary name (with `.` and `_` replaced by `-`), matching the legacy single-boundary shape.

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
  capability: helm-chart
  implements: core/api-server
  source: ./charts/api-server
  valuesMapping: |
    image: "{{ .values.image }}"
    replicaCount: {{ optional .infra `replicas` 2 }}
```

After composition, the boundary's evaluated assembly path (default `dist/<boundary-directory>/<capability>/` because `subDirectory:` defaults to `{{ .capability }}`) contains:

```text
dist/<boundary-directory>/helm-chart/
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

A `helm install <release-name> dist/<boundary-directory>/helm-chart` against this layout installs both instances as a single Helm release, with the umbrella's alias-keyed values driving each sub-chart's templates.

## Cross-references

- [`providers/helm.md`](helm.md) — sister provider that emits flat rendered Kubernetes YAML rather than a chart scaffold; carries workload synthesis.
- [`entities/recipe.md`](../entities/recipe.md) — Recipe authoring surface and the three input kinds.
- [`entities/release.md`](../entities/release.md) — Release boundary semantics and per-boundary output directories.
- [`architecture/16-recipe-input-composition.md`](../../architecture/16-recipe-input-composition.md) — cross-provider Provider Capability Matrix.
- [`10-status.md#provider-engines`](../10-status.md#provider-engines) — current readiness classification.
