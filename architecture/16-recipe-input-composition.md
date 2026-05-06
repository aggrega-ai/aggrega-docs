# Recipe Input Composition — Three Input Kinds, Workload, Artifacts

A Recipe produces manifest files for its target provider. This chapter covers how Recipes compose their output from three orthogonal input kinds — sourced, synthesized, and artifacts — how each input kind is structured, and which provider produces which output today. The conceptual role of the Recipe entity (the Ops-authored translation template that maps Developer Intent to a physical execution engine) lives in [04-eight-entity-taxonomy.md](04-eight-entity-taxonomy.md); the Recipe authoring surface at keyword level lives in [../language-reference/entities/recipe.md](../language-reference/entities/recipe.md).

## Rationale

Each provider's native rendering tool — Helm, Docker Compose, Terraform, CloudFormation — already knows how to render provider-native manifests. A Recipe's job is to declare WHAT those manifests should say: which container images, which ports, which environment variables, which volumes, which services, which resource limits.

An early approach extracts a fixed key set (e.g., `image`, `environment`, `ports`, `replicas`) from a Recipe's `valuesMapping` output and constructs a Kubernetes Deployment + Service from scratch. That approach is structurally unable to express:

- `resources` (CPU/memory requests/limits)
- Liveness, readiness, or startup probes
- `volumeMounts` / `volumes`
- `nodeSelector` / `affinity` / `tolerations`
- `serviceAccount` / `securityContext`
- Multi-container pods, sidecars
- ConfigMap / Secret / PVC / CRD resources
- Non-ClusterIP Services (LoadBalancer, NodePort, Headless)

The abstraction layer needs to describe a full workload shape, not a fixed key set. The three input kinds described below are that abstraction: a Recipe composes its output additively from an externally-loaded chart or module (`source:`), an abstract Workload specification the Engine synthesizes into provider-native manifests (`workload:` / `workloadFrom:`), and templated provider-native manifests the Recipe emits directly (`artifacts:` / `artifactsFrom:`).

## The Three Input Kinds

### Composition by Addition

There are three ways to produce provider-native manifest files from a Recipe, and they compose by addition rather than by mutual exclusion:

1. **`source:`** — an externally-loaded artifact (Helm chart, Terraform module, compose file) that the provider's native engine renders, with `valuesMapping:` supplying the overlay values.
2. **`workload:` or `workloadFrom:`** — an abstract Workload specification (platform-owned kind) that the Engine synthesizes into provider-native manifests.
3. **`artifacts:` or `artifactsFrom:`** — inline or file-loaded provider-native manifests, Go-templated against the full pillar context.

All three produce files that the Engine emits to the boundary's output directory. All three may coexist in a single Recipe, subject to the validation rules below. Merge semantics are top-level-only: each input kind produces complete files; files are concatenated; collision on output filename is a fatal error.

### Descriptive Mode Names

The three "modes" are descriptive vocabulary for documentation and diagnostics. Recipe authors do not declare a mode; they write the keywords they need. A Recipe is characterized by its dominant input:

| Dominant keyword(s) | Descriptive mode name |
| --- | --- |
| `source:` + `valuesMapping:` (no `workload:`, no artifacts) | **sourced** |
| `workload:` / `workloadFrom:` (no `source:`, no artifacts) | **synthesized** |
| `artifacts:` / `artifactsFrom:` (no `source:`, no `workload:`) | **artifacts** (informally: "inline") |
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
  provider: helm | compose | terraform | cloudformation | helm-chart | ...
  implements: core/...:1.0.0

  locals: { ... }
  provides: { ... }

  # ─── Sourced input (optional, paired) ───
  source: ...
  valuesMapping: |
    # Go template → YAML/JSON overlay values

  # ─── Synthesized input (optional, one of the two) ───
  workload: |
    # Go template → YAML → parsed Workload
  # OR:
  workloadFrom: ./workload.yaml

  # ─── Artifacts input (optional, both may coexist) ───
  artifacts:
    "filename.yaml": |
      # Go template → manifest YAML
  artifactsFrom:
    - ./artifacts/another.yaml
    - ./artifacts/crd.yaml
```

*The authoring shape above is frozen at the Recipe schema layer. Every field is accepted by the schema today. Compiler consumption of `workload:` / `workloadFrom:` / `artifacts:` / `artifactsFrom:` lands incrementally as the per-provider synthesizers and the corresponding Recipe consumption paths ship; see the Provider Capability Matrix at the end of this chapter for what each provider produces today.*

### Load-Time Validation Rules

The Recipe schema enforces seven composition rules at load time:

1. **`valuesMapping:` requires `source:`.** Without a source engine to overlay, there is nothing to receive the mapped values. A Recipe with `valuesMapping:` and no `source:` is a load-time error.
2. **`source:` requires `valuesMapping:`.** An externally-loaded chart or module needs values; a source with no values overlay is underspecified. Load-time error.
3. **`workload:` and `workloadFrom:` are mutually exclusive.** A Recipe specifies the Workload either inline or from a file, never both. Load-time error.
4. **`workload:` / `workloadFrom:` requires the Provider to declare `workloadSchema`.** Providers that do not support synthesis reject Recipes that use `workload:`. Load-time error.
5. **At least one input kind must be present.** A Recipe with none of `source:`+`valuesMapping:`, `workload:`/`workloadFrom:`, or `artifacts:`/`artifactsFrom:` produces no output and is an error.
6. **Inline and file-loaded variants may coexist for artifacts.** A Recipe may use `artifacts:` (inline map) and `artifactsFrom:` (list of files) simultaneously. Filename collision across the two is a load-time error.
7. **Cross-input-kind filename collisions are render-time errors.** If `source:` output, a `workload:` translation, or any artifact produces a file whose name already exists from another input kind, the Engine emits a fatal error identifying every contributor. This check runs after Workload translation, so it's render-time rather than load-time.

## The Workload Kind

### Ownership and Location

`Workload` is a platform-owned kind at `apiVersion: aggrega.ai/v1alpha1`. Its CUE schema is embedded in the compiler binary at build time; catalog authors do not edit the Workload schema, nor do they author standalone `Workload` YAML files as catalog entities. The Workload grammar is consumed inside a Recipe's `workload:` field (or referenced via `workloadFrom:`) and nowhere else.

Workload is a platform kind and a compiler concept, not a ninth entity in the [Eight-Entity Taxonomy](04-eight-entity-taxonomy.md). The Recipe is the authoring entity; the Workload is the shape the Recipe's synthesized input takes.

### One Workload per Recipe

A Recipe declares exactly one `workload:`. The Workload represents the single deployment unit associated with the Component this Recipe implements. Use cases requiring additional side-workloads are expressed via:

- `artifacts:` / `artifactsFrom:` — additional manifests alongside the workload, in the same Recipe.
- Features with Resource Generation — cross-cutting side-workloads (e.g., a backup sidecar attached to databases) declared as separate catalog entities. See [14-extensibility.md](14-extensibility.md) for FeatureRecipe Resource Generation.

This preserves the 1:1 Component → Recipe → Workload model.

### The Full Surface

The complete Workload schema:

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Workload

metadata:
  labels: {}           # merged with aggrega.ai/* provenance labels at emission
  annotations: {}

replicas: 1            # default 1

initContainers:        # ordered list; runs before main containers
  - name: init
    image: ...
    command: []
    args: []
    variables: {}
    secrets: {}
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
    secrets:           # env/file name → { from: slot_name, as: env|file, path?: /path }
      ENV_NAME:
        from: secret_slot_name
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

*The Workload CUE schema is authoritative and ships embedded in the compiler binary today. Recipe-side `workload:` / `workloadFrom:` consumption and per-provider synthesizers land incrementally; see the Provider Capability Matrix for current provider support.*

The Workload entity authoring page at [../language-reference/entities/workload.md](../language-reference/entities/workload.md) covers field-level authoring details.

### Secrets Integration with `secretsSchema`

The Workload's `containers.<name>.secrets` block *references* slots declared by the Component's `secretsSchema`; it does not declare new slots. See [../language-reference/entities/component.md](../language-reference/entities/component.md) for the `secretsSchema` authoring surface.

The validation contract:

- Every `secrets.<KEY>.from` value must match a slot name declared in the Component's `secretsSchema`.
- The `as:` delivery mechanism (`env` or `file`) must be allowlisted in that slot's `inject:` array.
- Slots marked `inject: []` (blackbox) in the Component's `secretsSchema` cannot appear in Workload `secrets:` blocks — those slots are delivered by the Recipe's internal plumbing (e.g., via Helm `existingSecret`), not via Workload exposure.

Example:

```yaml
# In the Component
spec:
  secretsSchema:
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
      secrets:
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
| `configmap` | Read-only config files | ConfigMap volume reference | bind mount from generated config file |
| `secret` | Read-only secret files | Secret volume reference | env_file or bind-mounted secret file |
| `persistent` | Single PVC; survives pod restarts | PVC resource + `volume.persistentVolumeClaim` | named volume |
| `persistentTemplate` | Per-replica PVC for StatefulSet | `StatefulSet.volumeClaimTemplates` | named volume (degraded; warning emitted) |

Compose cannot express per-replica templates. When `persistentTemplate` is translated to compose, a single named volume is emitted with a warning comment.

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

Each Provider entity declares a `workloadSchema` — a CUE schema documenting how Workload fields translate to that provider's native output. This is the self-documenting translation contract. See [../language-reference/entities/provider.md](../language-reference/entities/provider.md) for the Provider authoring surface.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Provider
metadata:
  name: helm
spec:
  plugin: ./plugins/helm-renderer.wasm
  baseSchema: |       # existing: for chart values validation
    # ...
  workloadSchema: |   # how Workload translates to K8s manifests
    // Each Workload produces: 1 Deployment (or StatefulSet if persistentTemplate used)
    // + 1..N Services (one per workload.services entry)
    // + 1..N PVCs (one per workload.volumes.*.persistent entry)
    // + 1..N ConfigMap volume refs (from workload.volumes.*.configmap.source)
    // ...
```

The `workloadSchema` field is documentation-first: it communicates translation intent to catalog authors and IDE tooling. A Provider that omits `workloadSchema` does not support Workload synthesis; Recipes targeting such a provider that use `workload:` or `workloadFrom:` are rejected at Recipe load time with a clear error.

*The Provider schema declares `workloadSchema` today. Provider-side validation of the contract (Recipe load-time rejection when the target Provider omits `workloadSchema`) lands alongside Recipe consumption of `workload:` / `workloadFrom:`.*

### Auxiliary Resources Live Outside the Workload

The Workload spec has no `additionalResources` field, no `extras`, no inline ConfigMap/Secret/CRD declarations. The Workload models the workload shape only: containers, volumes, services, replicas, scheduling, security context, service account — everything that describes how the single deployment unit runs.

Auxiliary resources have two legitimate homes outside the Workload:

1. **Features + FeatureRecipes** — the mechanism for cross-cutting concerns. A ServiceMonitor attached to "any server with metrics exposed" is `core/prometheus-exporter` as a Feature. An HTTPRoute is `core/public-ingress` as a Feature. A NetworkPolicy enforced on all production workloads is a Feature attached via Release-level selectors. Features compose orthogonally and can be reused across Recipes. See [14-extensibility.md](14-extensibility.md) for FeatureRecipe Resource Generation.
2. **Recipe-level `artifacts:` / `artifactsFrom:`** — for resources that belong to this specific Recipe's implementation and aren't worth creating a Feature for. A one-off CRD registration the Recipe needs. A Recipe-specific PodDisruptionBudget that applies only when this Recipe is used. A ConfigMap the Recipe's Workload references. See the Artifacts Mechanism section below.

The line between Feature and artifact is a social convention. If an auxiliary resource is cross-cutting (applies to many Recipes, or is attached conditionally via selectors), it's a Feature. If it's intrinsic to this one Recipe (the Recipe can't do its job without emitting that resource), it's an artifact. Authors choose based on reuse and attachment semantics; the compiler does not police the choice.

Features and Recipe artifacts together cover every auxiliary-resource case currently known.

## The Artifacts Mechanism

### Inline and File-Loaded Artifacts

Artifacts are templated provider-native manifests the Recipe emits directly alongside any `source:` output or Workload synthesis. They come in two flavors:

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

  artifactsFrom:
    - ./artifacts/networkpolicy.yaml
    - ./artifacts/crd-registration.yaml
```

The `artifactsFrom:` paths are relative to the Recipe directory. A typical convention places them in an `./artifacts/` subdirectory, though the compiler does not enforce this.

Each file (or inline entry) is Go-templated against the full TemplateContext before being emitted to the output directory.

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

For `artifactsFrom:`, the output filename is the basename of the input path:

```yaml
artifactsFrom:
  - ./artifacts/monitor.yaml
  - ./artifacts/subdir/netpol.yaml
```

Produces `.../monitor.yaml` and `.../netpol.yaml`. Basename collisions across `artifactsFrom:` entries are load-time errors. Collisions between inline `artifacts:` keys and `artifactsFrom:` basenames are load-time errors.

### Template Context for Artifacts

Artifact templates have access to the full pillar context:

- `.values`, `.infra`, `.context.*`, `.locals`, `.provides`, `.features`, `.secrets`, `.metadata` — the standard Aggrega pillars described in [06-data-taxonomy-and-composition.md](06-data-taxonomy-and-composition.md).
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

Post-translation, the Engine injects `aggrega.ai/*` provenance labels into the metadata of every emitted file — whether it came from `source:`, `workload:`, or `artifacts:`. All files carrying the same Recipe's output share the same provenance:

```yaml
metadata:
  labels:
    aggrega.ai/component-id: api
    aggrega.ai/recipe-uri: api-server-helm:1.0.0
    aggrega.ai/boundary-path: production
    # ... plus the standard OTel label set
```

Label injection is uniform across all three input kinds. See [11-governance-and-compliance.md](11-governance-and-compliance.md) for compile-time provenance stamping.

### Per-Provider Artifact Semantics

*The per-provider semantics below describe how each provider's artifact render path will integrate artifacts into the provider's native output when the artifacts render path ships. These descriptions are the designed target behavior; the artifacts render path is not yet wired into the compiler binary.*

**helm provider:** artifacts are Kubernetes YAML documents written directly to the output directory, alongside manifests rendered from the chart and manifests synthesized from the Workload.

**compose provider:** artifacts are compose fragments. Top-level keys (`services:`, `networks:`, `volumes:`, `configs:`) are merged into the per-boundary combined `docker-compose.yaml` during the boundary composition step.

**terraform provider:** artifacts are `.tf.json` files written alongside any module output.

**cloudformation provider:** artifacts are CFN resource snippets or sub-stack definitions written alongside template output.

**helm-chart provider (special case):** artifacts are not written to the output directory as standalone files — Helm owns the rendering pipeline. Instead, `artifactsFrom:` files are treated as pre-Helm template files: they are Go-templated with Aggrega's pillar context FIRST, then injected into the chart's `templates/` directory BEFORE Helm rendering. This gives the helm-chart provider an extension mechanism equivalent to what `artifacts:` provides for the plain helm provider, while respecting Helm's chart model. In the helm-chart case, inline `artifacts:` is not supported — only `artifactsFrom:` with file paths, because Helm requires template files to be physical files in the chart structure.

Inline `artifacts:` for helm-chart is rejected at Recipe load with a clear error pointing the author at `artifactsFrom:` instead. The injected file lands at `boundaries/<bp>/charts/<nodeID>/templates/<basename>` so it sits alongside the sourced chart's templates and Helm picks it up during the downstream render pass.

**helm-chart delimiter convention.** Aggrega's pre-template pass on helm-chart `artifactsFrom:` files uses `[[ ]]` delimiters rather than the default `{{ }}` so Helm's own `{{ ... }}` syntax inside the file survives untouched into Helm's render pass. Authors write Aggrega-side substitutions as `[[ .context.instance_id ]]`, `[[ .values.name ]]`, etc.; Helm-side substitutions stay as `{{ .Values.x }}`, `{{ .Release.Name }}`, `{{- include "common.labels" . }}`, etc. Authors mixing the two delimiter pairs in one file is the supported authoring shape.

**Provenance labels and helm-chart artifacts.** Provenance labels are merged into `metadata.labels` for files that parse as YAML before Helm rendering — files using only `[[ ]]` Aggrega context or with Helm `{{ }}` only at quoted scalar positions. Files with structural Helm template actions (`{{- include ... }}`, `{{- if ... }}`, `{{- range ... }}`, `{{- with ... }}` at positions where they emit YAML structure rather than scalar leaves), or files with unquoted `{{ ... }}` at value positions, do not survive Aggrega's YAML round-trip; the build emits a "skipped provenance label injection" warning naming the artifact and passes the file through unchanged. **This warning is expected for any helm-chart artifactsFrom file using structural Helm template actions or unquoted Helm value substitutions** — it is the common case in production Helm authoring, not the edge case. Authors who need provenance labels on such files inject them via the chart's `_helpers.tpl` `aggrega.commonLabels` template or equivalent Helm-side mechanism, not via Aggrega's pre-template injection.

**Chart-root basename collisions.** `artifactsFrom:` entries whose basename collides with a chart-root file (`Chart.yaml`, `values.yaml`, `.helmignore`, etc.) are not detected by Aggrega's filename-collision check — the artifact lands at `templates/<basename>` while the chart-root file lands at the chart root, and the path-prefixing makes them distinct in Aggrega's view. Authors avoid these basenames; the consequence of using them is that Helm sees both files (one at the chart root, one inside `templates/`) and may render the templates-side copy unexpectedly.

### What Artifacts Is Not

Three structural distinctions:

**Not cross-provider.** A Recipe declares exactly one `provider:` at its top level. Everything the Recipe produces — `source:` output, `workload:` synthesis, and artifacts — is in that provider's native format. A helm Recipe's artifacts contain Kubernetes YAML. A compose Recipe's artifacts contain compose fragments. A terraform Recipe's artifacts contain `.tf.json`. A Recipe targets one provider; every output is in that provider's native format. Multi-provider composition happens at the Release level: a Release with three boundaries can target helm for boundary A, compose for boundary B, terraform for boundary C, and each boundary's Recipes are single-provider. Cross-provider coordination is the Release author's responsibility.

**Not Recipes-in-Recipes.** Artifacts do not load or compose other Recipes. They are inline manifests (or file paths to inline manifests), templated with this Recipe's pillars, emitted to this Recipe's output. Recipe reuse happens through three mechanisms: `extends:` (inheritance of metadata and CUE schemas, not of output files); the Manifest's per-provider dispatch (the same Component can resolve to different Recipes for different providers — see [../language-reference/entities/manifest.md](../language-reference/entities/manifest.md)); and Features + FeatureRecipes (cross-cutting concerns attached orthogonally).

**Not a cross-Recipe glue layer.** Artifacts cannot reference names, resources, or state that the Recipe did not itself declare. A ConfigMap artifact referenced by the Recipe's Workload must be emitted by this Recipe. An artifact that expects an externally-provisioned Secret must get that Secret's name via the `.secrets` pillar, not assume it exists. This is the self-containment invariant (above) stated from the artifact-authoring perspective: each Recipe emits files in one format, applied by one tool, into one boundary's output directory.

## Provider Capability Matrix

### Shipping Today

| Provider | `source:` + `valuesMapping:` | `workload:` / `workloadFrom:` | `artifacts:` / `artifactsFrom:` |
| --- | --- | --- | --- |
| helm | ✅ Helm chart rendering via the Helm SDK | Not yet shipped — authoring contract frozen | ✅ standalone YAML files emitted under the boundary output directory |
| helm-chart | ✅ Umbrella-chart composition | Not applicable | ✅ file-loaded only; injected at `templates/<basename>` with `[[ ]]` Aggrega delimiters; inline rejected at Recipe load |
| compose | Not yet shipped — authoring contract frozen | Not yet shipped — authoring contract frozen | Not yet shipped — authoring contract frozen |
| terraform | Not yet shipped — authoring contract frozen | Not yet shipped — synthesis is a future iteration | Not yet shipped — authoring contract frozen |
| cloudformation | Not yet shipped — authoring contract frozen | Not yet shipped — synthesis is a future iteration | Not yet shipped — authoring contract frozen |

*This table reflects what the current compiler binary consumes. Cells marked `✅` ship today. Cells marked "Not yet shipped" have their authoring shape accepted by the Recipe schema; compiler consumption lands incrementally per provider and per input kind. Cells marked "Not applicable" describe combinations the architecture does not support.*

### Designed Target Shape

*The following matrix describes the designed target shape when per-provider synthesis and the artifacts render path land. Every cell represents intended behavior of the shipping compiler; timing anchors appear where known.*

| Provider | `source:` + `valuesMapping:` | `workload:` / `workloadFrom:` | `artifacts:` / `artifactsFrom:` |
| --- | --- | --- | --- |
| helm | ✅ Helm chart | ✅ synthesizes Deployment/StatefulSet + Services + PVCs + ConfigMap/Secret volume refs | ✅ Kubernetes YAML files |
| helm-chart | ✅ umbrella chart | ❌ not applicable | ✅ file-loaded only; injected as pre-Helm templates |
| compose | ✅ `docker-compose.yaml` base | ✅ synthesizes compose service + volumes + networks | ✅ compose fragments merged into the combined file |
| terraform | ✅ Terraform module | ✅ planned (target-resource selection — ECS, Fargate, Cloud Run, etc. — resolved in a future design iteration) | ✅ `.tf.json` files |
| cloudformation | ✅ CFN template | ✅ planned (target-resource selection — ECS, Fargate, App Runner, etc. — resolved in a future design iteration) | ✅ CFN resource snippets |
