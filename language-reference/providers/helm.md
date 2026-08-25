# Helm Provider

The helm provider produces flat rendered Kubernetes YAML for GitOps consumers (ArgoCD, Flux). The provider assembles per-`(path, provider)`: every helm-targeted node's rendered YAML is routed to the assembler keyed on the boundary's evaluated `directory:` joined with the per-component `subDirectory:`, and that assembler emits one YAML file per Kubernetes resource. Downstream tooling diffs and applies the files directly without a Helm install step.

Each emitted Kubernetes resource carries the boundary's `syncWave: <integer>` value as the `argocd.argoproj.io/sync-wave: "<N>"` annotation; Helm hooks additionally carry `helm.sh/hook-weight: "<N>"`. ArgoCD, Flux, and Helm read these annotations natively and order resource application accordingly.

This page is the helm provider's authoring reference. For the cross-provider input-composition model, see [architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md). For current shipping-state classifications, see [Status of the Language → Providers](../10-status.md#providers).

## Supported input kinds

The helm provider accepts all three of the Recipe input kinds in different roles:

- **Sourced mode.** A Recipe with `source: <chart-path>` points at an on-disk Helm chart directory. The Helm Go SDK loads the chart, the base-rendering values dictionary is coalesced with the chart's defaults, and the chart's templates render to flat Kubernetes YAML.
- **Workload (synthesised) mode.** A Recipe with `workload:` (inline or `$import:`-loaded) declares a Workload document. The provider synthesises one or more Kubernetes resources per node — a Deployment (or StatefulSet) plus per-service Services and per-persistent-volume PVCs — directly from the Workload spec.
- **Sourceless (generative) mode.** A Recipe with neither `source:` nor `workload:` falls back to the provider's built-in flat generator. The values dictionary feeds a Deployment plus an optional Service shaped from a small fixed key vocabulary (see [Sourceless mode](#sourceless-mode-keyset) below).

A Recipe may declare exactly one of `source:` or `workload:`; combining them is a base-rendering validation error.

## `source:` keyset

The helm provider accepts `source:` as a **bare filesystem path string only**. The path is interpreted relative to the compile invocation's working directory.

```yaml
spec:
  capability: helm
  source: ./charts/api-server     # filesystem path to a chart directory
  valuesMapping: |
    image: "{{ .values.image }}"
    replicas: {{ optional .infra `replicas` 2 }}
```

Structured source objects resolve through the source-resolver. The built-in form is `source: { kind, url, version, chart? }`: `url:` carries the chart location — `oci://…` for an OCI chart, an `https://….tgz` for a direct chart archive, or an `https://` repo root paired with `chart:` — and the kind comes from the URL scheme or an explicit `kind:`. `aggrega pull` fetches and pins the chart in the lockfile; the build extracts it from the cache. The former `structured source not supported` rejection is retired; vendoring a chart locally remains supported but is no longer required. The schema accepts an open structured object, so a provider Wasm plugin can later validate provider-declared source keys (e.g. a `registry` + `chart` pair) — `planned`.

The chart at the source path must contain a valid `Chart.yaml`. Sourced renders that fail to load the chart surface the underlying Helm SDK error verbatim. An empty `source: ""` is not a helm matter: it names neither sourceless nor sourced mode, so the refusal it earns is the same whichever provider the Recipe targets, and it comes before any chart is loaded and before this provider is dispatched. Which command reports that refusal — and which reports something else first — is set out in [`entities/recipe.md`](../entities/recipe.md) "Source field scheme inventory" and [`errors/fatal-halts.md`](../errors/fatal-halts.md) "Recipe `source:` is an empty string".

## Sourced mode

A Recipe with `source: <chart-path>` and `valuesMapping:` runs the following pipeline at base rendering:

1. The chart at `<chart-path>` is loaded via the Helm Go SDK.
2. The `valuesMapping` template evaluates against the Recipe's TemplateContext. Its YAML output is treated as a **values overlay** for the chart.
3. The overlay is coalesced with the chart's `values.yaml` defaults; overlay keys win on collision (Helm's standard `helm install --values` semantics).
4. The Helm SDK renders the chart's templates against the merged values.
5. Aggrega injects its provenance metadata into the rendered manifests via post-render YAML rewriting, ensuring sourced output carries the same labelling as workload-mode output. Charset-safe values become labels (`app.kubernetes.io/name`, `aggrega.ai/component-id`, and — when set — `aggrega.ai/aggregate-name`, `aggrega.ai/compiler-version`, `aggrega.ai/environment`); values a Kubernetes label cannot represent become annotations (`aggrega.ai/recipe-uri`, `aggrega.ai/boundary-path`, `aggrega.ai/sync-wave`).
6. Output files land flat in the Recipe's output directory, named `<nodeID>-<basename>.yaml` (the chart's directory layout is flattened — there is no `templates/` subdirectory in the rendered output).

The namespace the chart renders against is read from the `aggrega.ai/namespace` annotation cascading from the boundary and reaches the chart as its release namespace; when no boundary declares one, the chart renders against `default`. Whether a rendered resource then carries `metadata.namespace` is the chart's own decision: a chart whose template writes the field emits it, and a chart that omits the field emits a resource with no namespace, placed by whatever the applying tool selects.

## Workload (synthesised) mode

A Recipe with `workload:` (inline or `$import:`-loaded) synthesises Kubernetes resources from the Workload's abstract intent. The Workload schema is documented at [entities/workload.md](../entities/workload.md); this section covers what the helm provider emits.

For each node:

- One **controller object** chosen by the Workload's `form`: `stateless` (and the default) emits a **Deployment**, `stateful` a **StatefulSet**, `daemon` a **DaemonSet**, `task` a **Job**, `scheduled` a **CronJob** whose `spec.schedule` is the Workload's `schedule` field (a 5-field cron expression or an `@` macro); a `scheduled` workload with no schedule, or a malformed one, halts loudly. The Deployment and StatefulSet carry the replica count; DaemonSet, Job, and CronJob carry none. A `stateful` Workload requires exactly one `type: Headless` Service declared in the Workload to govern the StatefulSet; the provider wires the StatefulSet's `serviceName` to that Service's rendered name, and the build halts if no headless Service is declared (or if more than one is). A `persistentTemplate` volume is a companion of `form: stateful` — declaring one on any other form halts with a message naming the fix.
- One **Service** per declared `services:` entry on the Workload, exposing the named ports the service spec lists.
- One **PersistentVolumeClaim** per `persistentTemplate` volume, sized and shaped from the volume's spec.

Each emitted resource carries the full Aggrega provenance labels and annotations plus a selector pair (`app: <nodeID>`) wired between the Deployment/StatefulSet and its Services. Container names in the rendered Deployment are the Workload's container keys with `.` and `_` characters replaced by `-` (Kubernetes name-sanitisation).

Output file naming follows the same `<nodeID>-<kind>.yaml` convention as sourced mode: `<nodeID>-deployment.yaml`, `<nodeID>-service-<svcName>.yaml`, `<nodeID>-pvc-<volName>.yaml`.

## Sourceless mode keyset

A Recipe with neither `source:` nor `workload:` invokes the provider's flat generator. The generator reads a small fixed vocabulary of keys from the base-rendering values dictionary:

| Key | Type | Default | Effect |
| --- | --- | --- | --- |
| `image` | string | `aggrega/placeholder:latest` | Container image reference. |
| `replicas` | int | `1` | Deployment replica count. |
| `environment` | map | (empty) | Environment variables; iterated in author order if backed by an OrderedMap, alphabetically otherwise. |
| `ports` | list of strings | (empty) | Port mappings in `host:container` form (or bare `port` for matching values). One ContainerPort per entry; each also produces a ServicePort named `port-<index>`. |

If the values dict contains `ports`, the generator emits both a Deployment and a Service; with no ports declared, only a Deployment is emitted. Output filenames are `<nodeID>-deployment.yaml` and `<nodeID>-service.yaml`.

Sourceless mode is the lowest-ceremony path for components whose only physical realities are an image, a replica count, and a port. Any non-trivial Kubernetes shape (volumes, init containers, probes, secrets) requires either workload mode or sourced mode.

## Provider-specific quirks

- **Provenance injection.** The sourced and sourceless paths converge on the same label-and-annotation set; sourced renders inject them via post-render YAML rewriting (after the Helm SDK has already rendered), so chart authors do not need to thread Aggrega labels through their own templates.
- **Deterministic value coercion.** When the base-rendering values dict contains a hash-randomised Go map (rather than an OrderedMap), the sourceless extractor sorts keys alphabetically before emission — the deterministic choice when no author order is available upstream. OrderedMap-backed values preserve author order through the entire pipeline.
- **Ordered env emission.** Kubernetes environment variables are an ordered list (later entries can `$(VAR)`-reference earlier ones); the provider emits them in author order from the OrderedMap-backed `environment` map. Authoring environment-variable order matters for correctness.
- **Namespace cascade — the two modes reach the resource differently.** Both read `aggrega.ai/namespace` from the boundary annotation cascade, and neither invents a namespace when no boundary declares one. In synthesised mode the provider writes `metadata.namespace` directly, and omits the field entirely when the cascade yields no value. In sourced mode the provider supplies the value as the chart's release namespace — `default` when the cascade yields none — and the chart's own template decides whether to project it. A sourced resource therefore carries the namespace only where its chart writes the field, which is why a chart shipping in the standard-library catalog reads the cascade value directly through its `valuesMapping`: doing so lets it omit the field when no boundary declares a namespace, matching synthesised output, which the release namespace alone cannot express because it is never empty.

## Worked examples

**Sourced mode — Recipe pointing at a vendored chart:**

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Recipe
metadata:
  name: api-server-helm
  version: 1.0.0
spec:
  capability: helm
  implements: core/api-server
  source: ./vendor/charts/api-server
  valuesMapping: |
    image: "{{ .values.image }}"
    replicaCount: {{ optional .infra `replicas` 2 }}
    service:
      type: ClusterIP
      port: {{ .values.port }}
    env:
      LOG_LEVEL: "{{ optional .values `log_level` "info" }}"
```

**Workload mode — Recipe declaring an inline Workload:**

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Recipe
metadata:
  name: api-server-workload
  version: 1.0.0
spec:
  capability: helm
  implements: core/api-server
  workload: |
    apiVersion: aggrega.ai/v1alpha1
    kind: Workload
    replicas: {{ optional .infra `replicas` 2 }}
    containers:
      api:
        image: "{{ .values.image }}"
        ports:
          web: {{ .values.port }}
    services:
      svc:
        type: ClusterIP
        ports:
          web: {{ .values.port }}
```

## Cross-references

- [`entities/recipe.md`](../entities/recipe.md) — Recipe authoring surface and the three input kinds.
- [`entities/workload.md`](../entities/workload.md) — Workload schema for synthesised mode.
- [`providers/helm-chart.md`](helm-chart.md) — sister provider that emits a Helm chart scaffold rather than flat manifests.
- [`providers/well-known-annotations.md`](well-known-annotations.md) — well-known annotations the helm provider honours (`aggrega.ai/namespace`, etc.).
- [`architecture/16-recipe-input-composition.md`](../../architecture/16-recipe-input-composition.md) — cross-provider Provider Capability Matrix.
- [`10-status.md#providers`](../10-status.md#providers) — current readiness classification.
