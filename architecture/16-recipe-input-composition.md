# Recipe Input Composition — Three Input Kinds, Workload, Artifacts

A Recipe produces manifest files for its target provider. This chapter covers how Recipes compose their output from three orthogonal input kinds — sourced, synthesized, and artifacts — how each input kind is structured, and which provider produces which output today. The conceptual role of the Recipe entity (the Ops-authored translation template that maps Developer Intent to a physical execution engine) lives in [04-entity-taxonomy.md](04-entity-taxonomy.md); the Recipe authoring surface at keyword level lives in [../language-reference/entities/recipe.md](../language-reference/entities/recipe.md).

## Rationale

Each provider's native rendering tool — Helm, Docker Compose — already knows how to render provider-native manifests. A Recipe's job is to declare WHAT those manifests should say: which container images, which ports, which environment variables, which volumes, which services, which resource limits.

An early approach extracts a fixed key set (e.g., `image`, `environment`, `ports`, `replicas`) from a Recipe's `valuesMapping` output and constructs a Kubernetes Deployment + Service from scratch. That approach is structurally unable to express:

- `resources` (CPU/memory requests/limits)
- Liveness, readiness, or startup probes
- `volumeMounts` / `volumes`
- `nodeSelector` / `affinity` / `tolerations`
- `serviceAccount` / `securityContext`
- Multi-container pods, sidecars
- ConfigMap / Secret / PVC / CRD resources
- Non-ClusterIP Services (LoadBalancer, NodePort, Headless)

The abstraction layer needs to describe a full workload shape, not a fixed key set. The three input kinds described below are that abstraction: a Recipe composes its output additively from an externally-loaded chart or module (`source:`), an abstract Workload specification the Engine synthesizes into provider-native manifests (`workload:`), and templated provider-native manifests the Recipe emits directly (`artifacts:`).

## The Three Input Kinds

### Composition by Addition

There are three ways to produce provider-native manifest files from a Recipe, and they compose by addition rather than by mutual exclusion:

1. **`source:`** — an externally-loaded artifact (Helm chart, compose file) that the provider's native engine renders, with `valuesMapping:` supplying the overlay values.
2. **`workload:`** — an abstract Workload specification (platform-owned kind) that the Engine synthesizes into provider-native manifests. The field accepts an inline YAML block scalar or a `$import:` to a single local file or library entry; the dispatch is content-shape driven.
3. **`artifacts:`** — a map of inline or `$import:`-loaded provider-native manifests, Go-templated against the full pillar context. Each entry may be authored inline (the entry's value is a block scalar) or via `$import:` to a single file or library content.

All three produce files that the Engine emits to the boundary's output directory. All three may coexist in a single Recipe, subject to the validation rules below. Merge semantics are top-level-only: each input kind produces complete files; files are concatenated; collision on output filename is a fatal error.

### Descriptive Mode Names

The three "modes" are descriptive vocabulary for documentation and diagnostics. Recipe authors do not declare a mode; they write the keywords they need. A Recipe is characterized by its dominant input:

| Dominant keyword(s) | Descriptive mode name |
| --- | --- |
| `source:` + `valuesMapping:` (no `workload:`, no artifacts) | **sourced** |
| `workload:` (no `source:`, no artifacts) | **synthesized** |
| `artifacts:` (no `source:`, no `workload:`) | **artifacts** (informally: "inline") |
| Any combination of two or more | described explicitly (e.g., "sourced with artifacts", "synthesized with artifacts") |

There is no keyword named `mode:` and no enum. The mode is an emergent property of which inputs are present.

### Recipe Shape at a Glance

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Recipe
metadata:
  name: ...
  version: 1.0.0
spec:
  capability: helm | compose | helm-chart | ...
  implements: core/...:1.0.0

  locals: { ... }
  provides: { ... }

  # ─── Sourced input (optional, paired) ───
  source: ...
  valuesMapping: |
    # Go template → YAML/JSON overlay values
  # OR:
  valuesMapping:
    $import: ./mappings/api-server.tmpl        # local file path
  # OR:
  valuesMapping:
    $import: <Lib>#/mappings/<entry>   # MappingLibrary entry

  # ─── Synthesized input (optional) ───
  workload: |
    # Go template → YAML → parsed Workload
  # OR (single-source $import for whole-content load from a file or library):
  workload:
    $import: ./workload.yaml

  # ─── Artifacts input (optional, multiple entries permitted) ───
  artifacts:
    "filename.yaml": |
      # Inline Go template → manifest YAML
    "other.yaml":
      $import: ./artifacts/other.yaml         # per-entry $import: for file or library content
```

*Every field above is accepted by the Recipe schema, and the compiler consumes all three input kinds today — sourced rendering, Workload synthesis, and artifacts emission all ship. What differs is per-provider support — which provider renders which input kind — captured in the Provider Capability Matrix at the end of this chapter.*

### Load-Time Validation Rules

The Recipe schema and load validation enforce these composition rules:

1. **`valuesMapping:` requires `source:`.** Without a source engine to overlay, there is nothing to receive the mapped values. A Recipe with `valuesMapping:` and no `source:` is a load-time error. (A `source:` without `valuesMapping:` is permitted — the chart or module renders with its own defaults.)
2. **`workload:` accepts one source — inline or `$import:`, not both.** A Recipe specifies the Workload as either an inline block scalar or a `$import:` to a single file. The `$import:` form is single-source per the unified file-import vocabulary; multi-source merge is not supported at `workload:`. Load-time error on a malformed dispatch.
3. **`workload:` requires a synthesis-capable provider.** Synthesis support is a property of the provider's rendering engine, not of any declared field. A `workload:` Recipe bound to a provider whose engine cannot synthesize is rejected when the node renders — through the provider-capability gate (see the Provider Capability Matrix) — with a clear diagnostic. The standard-library catalog declares `workloadSchema` on synthesis-capable providers by convention, as the documented translation contract, but the gate keys on engine capability rather than on that field's presence.
4. **At least one input kind must be present.** A Recipe with none of `source:`+`valuesMapping:`, `workload:`, or `artifacts:` produces no output and is a load-time error.
5. **Inline and `$import:` artifact entries may coexist.** A Recipe may declare some `artifacts:` entries inline and others via per-entry `$import:` directives. Filename collision across the two forms is a load-time error.
6. **Cross-input-kind filename collisions are render-time errors.** If two of a Recipe's input kinds — source-rendered output, workload-synthesized output, or artifact-emitted output — produce a file with the same name, the Engine emits a fatal error identifying every contributor. This check runs after Workload translation, so it's render-time rather than load-time.

## The Workload Kind

### Ownership and Location

`Workload` is a platform-owned kind at `apiVersion: aggrega.ai/v1alpha1`. Its JSON Schema 2020-12 declaration is embedded in the compiler binary at build time; catalog authors do not edit the Workload schema, nor do they author standalone `Workload` YAML files as catalog entities. The Workload grammar is consumed inside a Recipe's `workload:` field (inline or via `$import:` to a single file) and nowhere else.

Workload is a platform kind and a compiler concept, not a separate entity in the [Entity Taxonomy](04-entity-taxonomy.md). The Recipe is the authoring entity; the Workload is the shape the Recipe's synthesized input takes.

### One Workload per Recipe

A Recipe declares exactly one `workload:`. The Workload represents the single deployment unit associated with the Component this Recipe implements. A FeatureRecipe likewise declares at most one `workload:` of its own — a Feature-owned deployment unit synthesized through the same Workload kind — see [FeatureRecipe](../language-reference/entities/featurerecipe.md). Use cases requiring additional side-workloads are expressed via:

- `artifacts:` — additional manifests alongside the workload, in the same Recipe (inline or via per-entry `$import:`).
- Features with Resource Generation — cross-cutting side-workloads (e.g., a backup sidecar attached to databases) declared as separate catalog entities, where the FeatureRecipe synthesizes its own `workload:` (or renders via `source:` / `artifacts:`). See [14-extensibility.md](14-extensibility.md) for FeatureRecipe Resource Generation.

This preserves the one-deployment-unit-per-author model: a Recipe synthesizes the Component's workload; a FeatureRecipe synthesizes its own.

### The Full Surface

The complete Workload schema:

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Workload

form: stateless        # controller shape: stateless (default) | stateful | daemon | scheduled | task

replicas: 1            # default 1

initContainers:        # ordered list; runs before main containers
  - name: init
    image: ...
    command: []
    args: []
    variables: {}
    attachments: {}
    volumeMounts: []
    resources: { ... }
    securityContext: { ... }

containers:            # ordered map (YAML author order preserved)
  <name>:
    image: "..."
    command: []
    args: []
    variables:         # string → string environment variables
      KEY: "value"
    attachments:       # env/file name → { from: slot_name, as: env|file, path?: /path }
      ENV_NAME:
        from: slot_name
        as: env | file
        path: /path/here       # required when as: file
    ports:             # named port → port number
      web: 8080
      admin: 9090
    resources:
      requests:
        cpu: "100m"
        memory: "128Mi"
      limits:
        cpu: "500m"
        memory: "512Mi"
    health:
      ready:
        http: "/healthz"             # OR tcp: 8080 OR exec: ["cmd", "arg"]
        timeoutSeconds: 5
        initialDelaySeconds: 0
        periodSeconds: 10
      live:
        # same shape
      startup:
        # same shape
    volumeMounts:
      - name: <volume-name>
        path: /mount/path
        readonly: false
    restartPolicy: Always | OnFailure | Never
    lifecycle:
      postStart:
        exec: ["cmd"]             # OR httpGet: {...}
      preStop:
        exec: ["cmd"]
    securityContext:
      runAsUser: 1000
      runAsGroup: 1000
      runAsNonRoot: true
      readOnlyRootFilesystem: false
      allowPrivilegeEscalation: false
      capabilities:
        add: []
        drop: []

volumes:               # ordered map
  <name>:
    # exactly one of:
    ephemeral:
      sizeLimit: "1Gi"
    configmap:
      source: cm-name
      items: []                 # optional key selection
    secret:
      source: secret-name
      items: []
    persistent:
      size: "10Gi"
      class: "gp3"
    persistentTemplate:
      size: "10Gi"
      class: "gp3"

services:              # ordered map
  <name>:
    type: ClusterIP | NodePort | LoadBalancer | Headless
    ports:             # port name → port number
      web: 8080

scheduling:
  nodeSelector: {}
  affinity: { ... }
  tolerations: []
  topologySpreadConstraints: []

podSecurityContext:
  runAsUser: 1000
  runAsGroup: 1000
  fsGroup: 2000
  supplementalGroups: []

serviceAccount: "my-sa"  # just the name; actual RBAC via Features
```

*The Workload JSON Schema 2020-12 declaration is authoritative and ships embedded in the compiler binary. Recipe-side `workload:` consumption (inline or `$import:`) and the helm and compose synthesizers ship today; see the Provider Capability Matrix for per-provider support.*

The Workload entity authoring page at [../language-reference/entities/workload.md](../language-reference/entities/workload.md) covers field-level authoring details.

### Secrets Integration with `featuresSchema`

The Workload's `containers.<name>.attachments` block *references* slots declared by the Component's `featuresSchema`; it does not declare new slots. See [../language-reference/entities/component.md](../language-reference/entities/component.md) for the `featuresSchema` authoring surface.

The validation contract:

- Every `attachments.<KEY>.from` value must match a slot name declared in the Component's `featuresSchema`.
- The `as:` delivery mechanism (`env` or `file`) must be allowlisted in that slot's `inject:` array.
- Slots marked `inject: []` (blackbox) in the Component's `featuresSchema` cannot appear in Workload `attachments:` blocks — those slots are delivered by the Recipe's internal plumbing (e.g., via Helm `existingSecret`), not via Workload exposure.

Example:

```yaml
# In the Component
spec:
  featuresSchema:
    db_password:
      required: true
      inject: [env, file]      # transparent: Workload may dictate delivery
    root_password:
      required: true
      inject: []               # blackbox: Recipe handles internally

# In the Recipe
workload: |
  containers:
    main:
      attachments:
        DB_PASSWORD:                 # OK — db_password slot allows env inject
          from: db_password
          as: env
        # ROOT_PASSWORD: ...         # rejected — root_password is blackbox
```

### Health Probes: Intent, Not Mechanism

Kubernetes probes and Docker Compose healthchecks have different shapes. A single abstract intent shape translates cleanly to both:

```yaml
health:
  ready:
    http: /healthz           # intent: HTTP GET probe
    timeoutSeconds: 5
  live:
    tcp: 8080                # intent: TCP socket check
    timeoutSeconds: 5
  startup:
    exec: ["check-ready.sh"] # intent: command exec
    timeoutSeconds: 30
    periodSeconds: 10
```

Providers translate each intent to their native shape:

| Intent | Helm (K8s) | Compose |
| --- | --- | --- |
| `http: /path` | `httpGet.path: /path, httpGet.port: <first port or "http">` | `CMD-SHELL "curl -f http://localhost:<port>/path"` |
| `tcp: <port>` | `tcpSocket.port: <port>` | `CMD-SHELL "nc -z localhost <port>"` |
| `exec: [cmd]` | `exec.command: [cmd]` | `CMD [cmd]` |

Port resolution for `http:` without explicit port: uses the first named port in `containers.<name>.ports` by author order. If no ports are declared, the Recipe fails validation.

Compose degrades HTTP/TCP probes to healthcheck shell commands; this is noted as a warning comment in the generated `docker-compose.yaml`.

### Volume Types

Five volume types; no compound:

| Type | Semantics | K8s (helm) | Compose |
| --- | --- | --- | --- |
| `ephemeral` | Tmpfs / emptyDir; dies with pod | `emptyDir: { sizeLimit }` | `tmpfs: { size }` (in-memory; warning if semantics differ) |
| `configmap` | Read-only config files | ConfigMap volume reference | service-level `configs:` reference to a top-level config the Recipe's `artifacts:` declares |
| `secret` | Read-only secret files | Secret volume reference | env_file or bind-mounted secret file |
| `persistent` | Single PVC; survives pod restarts | PVC resource + `volume.persistentVolumeClaim` | named volume |
| `persistentTemplate` | Per-replica PVC; companion of `form: stateful` | `StatefulSet.volumeClaimTemplates` | named volume (degraded; warning emitted) |

Compose cannot express per-replica templates. When `persistentTemplate` is translated to compose, it degrades to a single named volume shared by every replica, and a warning reports the degradation. A `persistentTemplate` volume requires `form: stateful`; declaring it on any other form halts the build.

### Multi-Service Exposures

Each service is an independent exposure. A common pattern: an HTTP service on port 8080 (ClusterIP internal) + a metrics service on port 9090 (ClusterIP) + an admin endpoint on port 9901 (LoadBalancer):

```yaml
services:
  http:
    type: ClusterIP
    ports:
      web: 8080
  metrics:
    type: ClusterIP
    ports:
      prom: 9090
  admin:
    type: LoadBalancer
    ports:
      admin: 9901
```

Each becomes a separate Kubernetes Service object when rendered under the helm provider. In compose, services that aren't `ClusterIP` result in port publishing on the compose service.

Service names in K8s output are prefixed with the component's `instance_id` for uniqueness. Port names must match container port names declared in `containers.<name>.ports`.

### Provider-Side Translation Contract: `workloadSchema`

A provider-rendering Plugin (`pluginType: provider`) declares a `spec.provider.workloadSchema` — a JSON Schema 2020-12 declaration documenting how Workload fields translate to that provider's native output. This is the self-documenting translation contract. See [../language-reference/entities/plugin.md](../language-reference/entities/plugin.md) for the Plugin authoring surface, including the `spec.provider` block.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Plugin
metadata:
  name: helm-renderer
  version: 1.0.0
  pluginType: provider
spec:
  plugin: "oci://hub.aggrega.ai/plugin/provider/helm-renderer"
  abiVersion: v1alpha1
  targets:
    - helm
  provider:
    workloadSchema: |   # how Workload translates to K8s manifests
      // Each Workload produces: 1 controller object chosen by workload.form
      //   (stateless -> Deployment, stateful -> StatefulSet, daemon -> DaemonSet, task -> Job)
      // + 1..N Services (one per workload.services entry)
      // + 1..N PVCs (one per workload.volumes.*.persistent entry)
      // + 1..N ConfigMap volume refs (from workload.volumes.*.configmap.source)
      // ...
```

The `workloadSchema` field communicates translation intent to catalog authors and IDE tooling. It is the documented translation contract, declared by convention on providers whose engine synthesizes — but synthesis support is determined by the provider's rendering engine, not by this field's presence. A Recipe targeting a provider whose engine cannot synthesize with `workload:` is rejected when the node renders — through the provider-capability gate — with a clear error, whether or not the provider declares `workloadSchema`.

*The Plugin schema declares `spec.provider.workloadSchema` today — its body is compiled to JSON Schema 2020-12 when the Plugin loads — and Recipe-side `workload:` consumption ships. Synthesis support is enforced at render time by the provider-capability gate, keyed on the bound engine's capability; `workloadSchema` is the documented contract the standard-library catalog keeps in sync with that capability, not itself the gate input. `aggrega lint` additionally surfaces a `workload:` Recipe bound to a non-synthesizing provider early, before a build.*

### Auxiliary Resources Live Outside the Workload

The Workload spec has no `additionalResources` field, no `extras`, no inline ConfigMap/Secret/CRD declarations. The Workload models the workload shape only: containers, volumes, services, replicas, scheduling, security context, service account — everything that describes how the single deployment unit runs.

Auxiliary resources have two legitimate homes outside the Workload:

1. **Features + FeatureRecipes** — the mechanism for cross-cutting concerns. A ServiceMonitor attached to "any server with metrics exposed" is `core/prometheus-exporter` as a Feature. An HTTPRoute is `core/public-ingress` as a Feature. A NetworkPolicy enforced on all production workloads is a Feature attached via Release-level selectors. Features compose orthogonally and can be reused across Recipes. See [14-extensibility.md](14-extensibility.md) for FeatureRecipe Resource Generation.
2. **Recipe-level `artifacts:`** — for resources that belong to this specific Recipe's implementation and aren't worth creating a Feature for. A one-off CRD registration the Recipe needs. A Recipe-specific PodDisruptionBudget that applies only when this Recipe is used. A ConfigMap the Recipe's Workload references. Each entry is inline or `$import:`-loaded; see the Artifacts Mechanism section below.

The line between Feature and artifact is a social convention. If an auxiliary resource is cross-cutting (applies to many Recipes, or is attached conditionally via selectors), it's a Feature. If it's intrinsic to this one Recipe (the Recipe can't do its job without emitting that resource), it's an artifact. Authors choose based on reuse and attachment semantics; the compiler does not police the choice.

Features and Recipe artifacts together cover every auxiliary-resource case currently known.

## The Artifacts Mechanism

### Inline and File-Loaded Artifacts

The artifacts input kind emits templated provider-native manifest files directly to the boundary output, alongside any source-rendered or workload-synthesized output. Authors declare it via two surfaces:

```yaml
spec:
  artifacts:
    "servicemonitor.yaml": |
      apiVersion: monitoring.coreos.com/v1
      kind: ServiceMonitor
      metadata:
        name: {{ .context.instance_id }}-monitor
      spec:
        endpoints:
          - port: {{ .workload.services.metrics.ports.prom }}

    "networkpolicy.yaml":
      $import: ./artifacts/networkpolicy.yaml
    "crd-registration.yaml":
      $import: ./artifacts/crd-registration.yaml
```

The `$import:` paths are relative to the Recipe directory. A typical convention places them in an `./artifacts/` subdirectory, though the compiler does not enforce this. Each entry's map key is the output filename emitted to the boundary's output directory.

Each entry (inline or `$import:`-loaded) is Go-templated against the full TemplateContext before being emitted to the output directory.

### Inline Keys Are Output Filenames

The map key in `artifacts:` becomes the output filename verbatim:

```yaml
artifacts:
  "configmap-config.yaml": |
    ...
  "pdb.yaml": |
    ...
```

Produces `dist/boundaries/.../configmap-config.yaml` and `dist/boundaries/.../pdb.yaml`.

For `$import:`-loaded artifact entries, the output filename remains the map key (NOT the imported file's basename — the author chooses the output filename explicitly):

```yaml
artifacts:
  "monitor.yaml":
    $import: ./artifacts/monitor.yaml
  "netpol.yaml":
    $import: ./artifacts/subdir/some-other-name.yaml
```

Produces `.../monitor.yaml` and `.../netpol.yaml`. Filename collisions across `artifacts:` entries are load-time errors regardless of whether each entry is inline or `$import:`-loaded.

### Template Context for Artifacts

Artifact templates have access to the full pillar context:

- `.values`, `.infra`, `.context.*`, `.locals`, `.provides`, `.features`, `.metadata` — the standard Aggrega pillars described in [06-data-taxonomy-and-composition.md](06-data-taxonomy-and-composition.md).
- `.workload` — the parsed Workload spec for this Recipe (if present). Allows artifacts to reference Workload values without duplication, e.g., a ServiceMonitor referencing `.workload.services.metrics.ports.prom`.
- `.source` — the resolved `source:` field content (if present).

Artifacts evaluate after the Workload is parsed, so `.workload` is available when present. For Recipes without `workload:`, `.workload` is nil; a template attempting to dereference it fails with a clear error. For Recipes without `source:`, `.source` is nil with the same failure mode.

*The `.workload` and `.source` top-level TemplateContext fields are declared in the schema today. Full runtime population of these fields alongside artifact evaluation lands with the artifacts render path; templates that dereference `.workload.*` or `.source.*` today may not receive populated values across every provider path.*

### The Self-Containment Invariant

Artifacts must be self-contained. They can only reference the Recipe's declared inputs: the pillar context, the Recipe's own Workload (when present), and the Recipe's own `source:` value. They cannot reference:

- Other Recipes' outputs in the same boundary.
- Ambient Kubernetes resources that the Recipe did not declare.
- Secrets, ConfigMaps, or other resources assumed to exist externally (unless referenced via a declared pillar).

A ConfigMap artifact that's referenced by the Workload's `volumes.*.configmap.source` must be emitted by THIS Recipe (via `artifacts:` producing that ConfigMap) or by a Feature attached to this node. Cross-Recipe dependencies within a boundary are not supported.

This invariant preserves Recipe reusability: a Recipe can be dropped into any Aggregate + Release combination that satisfies its pillar contract, with no hidden dependencies.

### Provenance Labels

Post-translation, the Engine injects `aggrega.ai/*` provenance into the metadata of every emitted file — whether it was source-rendered, workload-synthesized, or emitted from an artifact template. The set splits by whether a value satisfies the Kubernetes label-value charset: label-safe keys are **labels** (queryable); charset-unsafe keys — `recipe-uri` (carries a `:`), `boundary-path` (a nested path carries `/`), and `sync-wave` (a negative wave's leading `-`) — are **annotations**, whose values are unconstrained. All files carrying the same Recipe's output share the same provenance:

```yaml
metadata:
  labels:
    aggrega.ai/component-id: api
    # ... plus the standard OTel / recommended label set
  annotations:
    aggrega.ai/recipe-uri: api-server-helm:1.0.0
    aggrega.ai/boundary-path: production
```

This split is uniform across all three input kinds. (The Compose provider has no annotation concept and its label values are unconstrained, so it emits the whole set as service labels.) See [11-governance-and-compliance.md](11-governance-and-compliance.md) for compile-time provenance stamping.

### Per-Provider Artifact Semantics

*The per-provider semantics below describe how each provider integrates artifacts into its native output. The artifacts render path ships today.*

**helm provider:** artifacts are Kubernetes YAML documents written directly to the output directory, alongside manifests rendered from the chart and manifests synthesized from the Workload.

**compose provider:** artifacts are compose fragments. Top-level keys (`services:`, `networks:`, `volumes:`, `configs:`) are merged into the per-boundary combined `docker-compose.yaml` during the boundary composition step.

**helm-chart provider (special case):** artifacts are not written to the output directory as standalone files — Helm owns the rendering pipeline. Instead, the helm-chart provider treats each `artifacts:` entry as a pre-Helm template file: the entry is Go-templated with Aggrega's pillar context FIRST, then injected into the chart's `templates/` directory BEFORE Helm rendering. This gives the helm-chart provider an extension mechanism equivalent to what `artifacts:` provides for the plain helm provider, while respecting Helm's chart model. In the helm-chart case, each `artifacts:` entry must use `$import:` to a file path — inline block scalars are rejected at Recipe load because Helm requires template files to be physical files in the chart structure.

Inline-block-scalar `artifacts:` entries for helm-chart are rejected at Recipe load with a clear error pointing the author at the `$import:` form instead. The injected file lands at `boundaries/<bp>/charts/<nodeID>/templates/<map-key>` so it sits alongside the sourced chart's templates and Helm picks it up during the downstream render pass.

**helm-chart delimiter convention.** Aggrega's pre-template pass on helm-chart `$import:`-loaded artifact entries uses `[[ ]]` delimiters rather than the default `{{ }}` so Helm's own `{{ ... }}` syntax inside the file survives untouched into Helm's render pass. Authors write Aggrega-side substitutions as `[[ .context.instance_id ]]`, `[[ .values.name ]]`, etc.; Helm-side substitutions stay as `{{ .Values.x }}`, `{{ .Release.Name }}`, `{{- include "common.labels" . }}`, etc. Authors mixing the two delimiter pairs in one file is the supported authoring shape.

**Provenance and helm-chart artifacts.** Provenance is merged into `metadata.labels` and `metadata.annotations` (per the charset-split above) for files that round-trip through YAML with their Helm tokens preserved — files using only `[[ ]]` Aggrega context or with Helm `{{ }}` only at quoted scalar positions. Files with structural Helm template actions (`{{- include ... }}`, `{{- if ... }}`, `{{- range ... }}`, `{{- with ... }}` at positions where they emit YAML structure rather than scalar leaves), or files with unquoted `{{ ... }}` at value positions, do not survive Aggrega's YAML round-trip; the build emits a "skipped provenance label injection" warning naming the artifact and passes the file through unchanged. **This warning is expected for any helm-chart `$import:`-loaded artifact file using structural Helm template actions or unquoted Helm value substitutions** — it is the common case in production Helm authoring, not the edge case. Authors who need provenance labels on such files inject them via the chart's `_helpers.tpl` `aggrega.commonLabels` template or equivalent Helm-side mechanism, not via Aggrega's pre-template injection.

**Chart-root filename collisions.** `artifacts:` map keys that collide with a chart-root filename (`Chart.yaml`, `values.yaml`, `.helmignore`, etc.) are not detected by Aggrega's filename-collision check — the artifact lands at `templates/<map-key>` while the chart-root file lands at the chart root, and the path-prefixing makes them distinct in Aggrega's view. Authors avoid these map keys; the consequence of using them is that Helm sees both files (one at the chart root, one inside `templates/`) and may render the templates-side copy unexpectedly.

### What Artifacts Is Not

Three structural distinctions:

**Not cross-provider within a single Recipe.** A Recipe declares exactly one `target:` at its top level. Everything the Recipe produces — source-rendered output, workload-synthesized output, and artifact emissions — is in that provider's native format. A helm Recipe's artifacts contain Kubernetes YAML. A compose Recipe's artifacts contain compose fragments. A Recipe targets one provider; every output is in that provider's native format.

Multi-provider composition happens at the Release level. Boundaries hold mixed-provider components; each provider's contributors at a boundary's evaluated path are dispatched and assembled per-(path, provider) independently. A Release with components targeting helm, helm-chart, and compose respectively can place all three in one boundary; the dispatch grouping partitions them per provider, each provider's contributors land in their own assembled output under the boundary's path, and the operator authors the cross-provider coordination via the boundary structure they choose. Cross-provider coordination is the Release author's responsibility.

**Not Recipes-in-Recipes.** Artifacts do not load or compose other Recipes. They are inline manifests (or file paths to inline manifests), templated with this Recipe's pillars, emitted to this Recipe's output. Recipe reuse happens through three mechanisms: `extends:` (inheritance of metadata and schemas, not of output files); the Manifest's flat-URI mapping (the same Component can resolve to different Recipes across catalogs — see [../language-reference/entities/manifest.md](../language-reference/entities/manifest.md)); and Features + FeatureRecipes (cross-cutting concerns attached orthogonally).

**Not a cross-Recipe glue layer.** Artifacts cannot reference names, resources, or state that the Recipe did not itself declare. A ConfigMap artifact referenced by the Recipe's Workload must be emitted by this Recipe. An artifact that expects an externally-provisioned Secret must get that Secret's name via the `.features` pillar — from the resolved `provides` of the attachment that emits it — not assume it exists. This is the self-containment invariant (above) stated from the artifact-authoring perspective: each Recipe emits files in one format, applied by one tool, into one boundary's output directory.

## Provider Capability Matrix

Each provider engine declares which input kinds it renders; a central input-kind gate accepts the supported combinations and rejects the rest with a uniform diagnostic when the node renders. Capability is a property of the engine, not the Recipe — a provider engine renders a subset of the three kinds. The `artifacts:` column distinguishes artifacts riding *alongside* a sourced/synthesized primary from a *standalone* artifacts-only Recipe (no `source:`, no `workload:`).

<!-- BEGIN GENERATED: provider-capability-matrix -->
| Provider | `source:` + `valuesMapping:` | `workload:` | `artifacts:` (alongside) | artifacts-only (standalone) |
| --- | --- | --- | --- | --- |
| helm | ✅ | ✅ | ✅ | ✅ |
| compose | ✅ | ✅ | ✅ | ❌ |
| helm-chart | ✅ | ❌ | ✅ templated with `[[` `]]` delimiters | ❌ |
| terraform | ✅ | ❌ | ✅ | ✅ |
| cloudformation | ✅ | ❌ | ✅ | ✅ |

*This grid covers the provider engines distributed with the compiler. A provider supplied as a plugin declares the input kinds it accepts in the same way, and the compiler reads that declaration by the same route — it is not listed here, because a published page cannot enumerate providers it has never seen.*
<!-- END GENERATED: provider-capability-matrix -->

*Cells marked `✅` ship; `❌` is a provider-capability decline surfaced by the gate. The per-node compose fragments are merged per boundary today; a further Release-level cross-boundary merge is a future refinement.*
