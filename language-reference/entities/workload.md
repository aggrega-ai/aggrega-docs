# Workload

The architectural role of the Workload kind — why it exists, how it composes with the other two Recipe input kinds (sourced and artifacts), and the full schema surface — lives in [../../architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md). This page covers the Workload authoring surface: how a Recipe author writes Workload content, what the compiler evaluates when, how Workload fields interact with the Component's `secretsSchema`, and which pillars templates inside a Workload can read.

## Authoring location

Workload content is authored inline or from file, always inside a Recipe. A Recipe declares exactly one `workload:` per node:

```yaml
# Inline (block scalar)
spec:
  workload: |
    apiVersion: aggrega.ai/v1alpha1
    kind: Workload
    # ...
```

or

```yaml
# File-loaded via $import: (path relative to the Recipe directory)
spec:
  workload:
    $import: ./workload.yaml
```

Both forms produce the same post-parse Workload object; the choice is authoring ergonomics. Per the unified file-import vocabulary, `$import:` accepts a single source — see [../vocabulary/cross-document-ref.md](../vocabulary/cross-document-ref.md) for the broader `$ref:` / `$import:` distinction.

Workload YAML is not authored as a standalone catalog entity. There is no `catalog/workload/` directory; the Workload grammar exists only as embedded content inside a Recipe. The apiVersion and kind declarations inside the YAML (`apiVersion: aggrega.ai/v1alpha1`, `kind: Workload`) identify the embedded content for schema validation; they do not make the Workload independently addressable.

## Template evaluation

Workload content is Go-templated against the full pillar context before parsing. When a Recipe author writes a template like the following...

```yaml
replicas: {{ optional .infra `replicas` 1 }}
```

...the compiler evaluates that template during the Workload sub-pass of rendering, resolves `.infra.replicas` against the node's `infra` payload, and parses the resulting YAML as a Workload document. Template evaluation happens after the base Recipe's `valuesMapping` has resolved, so Workload authors can reference previously-computed state via `.locals` the Recipe declared.

Pillar access inside Workload templates:

- `.values` — developer-authored cognitive payload declared in the Aggregate.
- `.infra` — Ops-authored physical sizing declared in the Release.
- `.parameters` — already interpolated by Step 1; visible via `.values` / `.infra` wherever the Developer or Ops referenced `.parameters.<name>` in their authoring.
- `.locals` — Recipe-private state evaluated during the Phase B preamble; available at every Workload template-evaluation site.
- `.context.instance_id` — the node's flattened instance ID used for resource-name prefixing.
- `.context.inject` — the post-interception injection pipe, already rewritten by any FeatureRecipe `injectMapping` during Phase A.
- `.context.uses` — the enriched topology edges outbound from this node, each carrying the target's resolved `provides`, `labels`, and cascading annotations.
- `.secrets` — the credential slots declared in the Component's `secretsSchema` (see below).

See [../vocabulary/data-pillars.md](../vocabulary/data-pillars.md) for the full pillar-access contract and [../templates/expansion-matrix.md](../templates/expansion-matrix.md) for where Workload evaluation sits in the template-evaluation sequence.

## Field-semantics essentials

The full Workload schema is in [../../architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md) under "The Workload Kind." The authoring conventions below cover the field-level decisions a Recipe author makes.

### `replicas`

A single integer for the workload's replica count. Defaults to 1 when omitted. Use a template expression to drive replicas from Ops-declared sizing:

```yaml
replicas: {{ optional .infra `replicas` 1 }}
```

### `containers` vs `initContainers`

`containers` is an ordered map keyed on container name. Container 0 (the first map key) matters for pod-spec ordering in Kubernetes output and for default-container semantics. `initContainers` is an ordered list of init-container entries, each carrying `name`, `image`, and the same variable/secret/volume-mount authoring shape as the main containers.

Author-order preservation is a load-bearing contract of the Workload model — the compiler emits `containers`, `volumes`, `services`, container `ports`, container `variables`, and container `secrets` in the order the Recipe author declared them, regardless of whether two compilations of the same input produce different Go map iteration orderings under the hood. Recipe authors can rely on the ordered shape: when the deployment-time semantic depends on the order (sidecar startup, `$(VAR)` chaining in environment variables, `volumeMounts` referencing previously-declared volumes), authoring order IS the runtime order.

Container field authoring follows these conventions:

- **`image`** is typically a template expression referencing `.values.image` (the Developer's selected image) with optional `.infra.*` overrides for environment-specific registry prefixing.
- **`variables`** is a plain string → string map for environment variables. The map blends two distinct data sources via Go template expressions: **developer-pillar literals** (entries whose template expressions read `.values` / `.infra` / `.locals` — payload originating in the Component's pillars) and **cross-component-pipe data** (entries whose template expressions read `.context.inject.env.<KEY>` — payload originating in another component's `provides:` and routed through the topology pipe). The two sources flow into the same `variables` map; authors choose one per entry based on whether the value is component-local or cross-component-derived. Common patterns: `LOG_LEVEL: "{{ .values.log_level }}"` is developer-pillar (component-local); `DB_HOST: "{{ .context.inject.env.DB_HOST }}"` is cross-component-pipe (the value originates in a target component's `provides.host` routed through the caller's `uses[].inject.env.DB_HOST` declaration). Both forms compile to a single Kubernetes `env:` list on the rendered Deployment; the dual-source semantic is at authoring time only.
- **`secrets`** references slots declared in the Component's `secretsSchema` (see the integration section below).
- **`ports`** is a named-port map (`web: 8080`, `admin: 9901`); port names match container-scoped port names and are referenced by `services.<service>.ports.<portname>`.
- **`volumeMounts`** references volumes declared elsewhere in the Workload's `volumes:` section by name.
- **`health`** uses the intent shape (`http: /path`, `tcp: <port>`, `exec: [cmd, ...]`) — see the Health Probes section below.

### `volumes`

Each volume is exactly one type: `ephemeral`, `configmap`, `secret`, `persistent`, or `persistentTemplate`. The types are mutually exclusive inside a single volume declaration; each type carries its own required fields:

```yaml
volumes:
  app-config:
    configmap:
      source: "{{ .locals.app_cm }}"
  data:
    persistent:
      size: "10Gi"
      class: "gp3"
  cache:
    ephemeral:
      sizeLimit: "1Gi"
```

`persistentTemplate` produces a per-replica PVC for StatefulSet-shaped translation; in compose translation it degrades to a single shared named volume with a warning in the generated file.

**Per-provider translation.** Each provider engine translates the five volume variants into its native shape:

| Variant | Helm / helm-chart (K8s) | Compose | Loss notes |
| --- | --- | --- | --- |
| `ephemeral` | `emptyDir: { sizeLimit }` | `tmpfs: { size }` (in-memory) | Compose tmpfs is RAM-backed; helm's emptyDir is disk-backed on the node by default — semantic divergence in the underlying storage medium. The compose engine emits a warning comment when the semantics differ. |
| `configmap` | ConfigMap volume reference (consumes a ConfigMap resource emitted by the Recipe's `artifacts:` or by a Feature) | Bind mount from a generated config file at the boundary's output directory | Compose has no direct ConfigMap equivalent; the engine generates a config file locally and bind-mounts it, which works for static config but loses K8s ConfigMap's update-on-rollout semantics. |
| `secret` | Secret volume reference (consumes a Secret resource emitted by a credential FeatureRecipe) | `env_file:` for env-shaped secrets, or a bind-mounted secret file for path-shaped secrets | Compose lacks first-class Kubernetes Secret semantics; secrets are local files outside any vault-fetch CRD lifecycle. |
| `persistent` | PVC resource + `volume.persistentVolumeClaim` | Named volume | Compose named volumes are a flat host-side abstraction; helm's PVC supports storage class, access mode, and capacity declaration that compose ignores. |
| `persistentTemplate` | `StatefulSet.volumeClaimTemplates` (per-replica PVC, automatic StatefulSet promotion) | Named volume (degraded — single shared volume across replicas with a warning emitted) | Compose cannot express per-replica templates. When `persistentTemplate` is translated to compose, a single named volume is emitted with a warning comment. Workloads relying on per-replica volume isolation should not target compose-only boundaries. |

The `persistentTemplate` translation triggers automatic StatefulSet promotion on the helm engine — when any container declares a `persistentTemplate` volume, helm emits a StatefulSet rather than a Deployment; the per-pod identity that StatefulSet provides is required for the per-replica volume lifecycle. Authors who want StatefulSet semantics without `persistentTemplate` cannot opt in; the helm engine's promotion rule is volume-driven only.

### `services`

An ordered map of service exposures. Each service declares its type (`ClusterIP`, `NodePort`, `LoadBalancer`, `Headless`) and a named-port map. Port names must match container port names declared elsewhere in the Workload:

```yaml
services:
  http:
    type: ClusterIP
    ports:
      web: 8080       # must exist in containers.<name>.ports
```

Multiple services on a single Workload are common for exposing internal and external traffic separately (internal `ClusterIP` for in-cluster consumers, `LoadBalancer` for external traffic, `ClusterIP` for Prometheus scraping).

**Synthesised-name convention.** When the helm provider synthesises a Workload's services, each Service's `metadata.name` is derived deterministically from the node's instance ID and the service's authoring key: `<instance_id>-<service-key>`. A Workload declaring `services.http` on node `api-server` produces a Service named `api-server-http`; the same Workload on node `billing` produces `billing-http`. The output filename mirrors the same convention: `<instance_id>-<service-key>-service.yaml`.

The convention has two practical consequences. First, **cross-node collisions are impossible by construction** — the instance-ID prefix differentiates services across every node in the boundary, so two Workloads each declaring `services.http` produce distinct K8s Service resources with non-overlapping names. Second, **within-Workload duplicate keys are prevented by schema** — the `services:` map is an OrderedMap, so the YAML parser deduplicates duplicate keys at parse time (the second declaration silently overwrites the first); authors should not rely on declaration order to disambiguate same-named services on the same Workload.

The collision risk that does remain is at the **K8s name-length boundary**: Kubernetes Service names cap at 63 characters, and the synthesised `<instance_id>-<service-key>` form can exceed that limit when both segments are long. The Aggrega compiler does not enforce the limit; the Service applies cleanly at render time but Kubernetes rejects the apply. Authors with deeply nested instance IDs (e.g., `data-layer.regional.eu-west.primary`) plus long service keys should keep the combined length under 63 characters.

**Provider-specific note (compose).** The compose provider derives `depends_on` automatically from IR uses-edges and emits the short-form list (`depends_on: [<target>]`). The long-form with `service_healthy` condition gating is planned for a future iteration; today's emit always has `service_started` semantics regardless of whether the target declares a healthcheck.

## Health probes — intent shape

The Workload declares probes in an abstract intent shape. Each provider translates the intent into its native probe shape at synthesis time.

```yaml
health:
  ready:
    http: /healthz            # intent: HTTP GET probe
    timeoutSeconds: 5
  live:
    tcp: 8080                 # intent: TCP socket check
    timeoutSeconds: 5
  startup:
    exec: ["check-ready.sh"]  # intent: command exec
    timeoutSeconds: 30
    periodSeconds: 10
```

Three intent forms (`http:`, `tcp:`, `exec:`) are mutually exclusive within a single probe declaration. Port resolution for `http:` without an explicit port uses the first named port in `containers.<name>.ports` by author order; if no ports are declared on the container, the compiler reports a validation error.

**Per-provider translation.** Each provider engine translates the abstract probe intent into its native shape at synthesis time:

| Intent | Helm (K8s) | Compose | Loss notes |
| --- | --- | --- | --- |
| `http: /path` | `httpGet.path: /path, httpGet.port: <first port or "http">` | `CMD-SHELL "curl -f http://localhost:<port>/path"` | Compose lacks a native HTTP probe shape; the CMD-SHELL wrapper depends on `curl` being present in the container image. |
| `tcp: <port>` | `tcpSocket.port: <port>` | `CMD-SHELL "nc -z localhost <port>"` | Compose lacks a native TCP probe shape; the CMD-SHELL wrapper depends on `nc` being present in the container image. |
| `exec: [cmd, ...]` | `exec.command: [cmd, ...]` | `CMD [cmd, ...]` | One-to-one mapping; both providers carry the command list verbatim. |

Compose's `CMD-SHELL` wrappers approximate HTTP and TCP probes through shell-evaluable predicates; the approximation loses the timeout / interval / retries semantics that K8s probes carry directly on the probe spec. Compose-targeted boundaries that need precise probe gating either use the native `exec:` shape (which translates without loss) or supplement the compose `healthcheck:` config with explicit retry parameters in the Recipe's compose-side overlay.

The compose engine emits a warning comment in the generated `docker-compose.yaml` whenever a probe is degraded from native HTTP/TCP to a CMD-SHELL wrapper.

**Provider-specific note (compose).** Authoring a `health:` block on a compose-targeted Workload does not gate `depends_on` ordering on health: the compose provider's `depends_on` entries derived from `uses:` edges always use `service_started` semantics, regardless of whether the target Workload declares health probes. Long-form `service_healthy` gating is planned for a future iteration. See [providers/compose.md](../providers/compose.md) for the full inference rules.

## K8s-shape pass-through fields — `scheduling`, `serviceAccount`, `podSecurityContext`

The Workload schema accepts three optional top-level fields that exist primarily to thread Kubernetes-native primitives through the helm provider while preserving Aggrega's structural shape. The compose provider translates the subset that has a Compose analogue and ignores the rest with an emitted warning. Aggrega validates the outer shape but does not police the inner content (per "Validation surface" above) — the K8s-native inner values pass through verbatim to the helm-rendered pod spec.

### `scheduling`

`scheduling` groups four K8s-native scheduling primitives — `nodeSelector`, `affinity`, `tolerations`, `topologySpreadConstraints` — into one block keyed by purpose. Each sub-field is shaped exactly as the corresponding Kubernetes pod-spec field:

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Workload
scheduling:
  nodeSelector:
    disktype: ssd
    region: us-east-1
  tolerations:
    - key: dedicated
      operator: Equal
      value: gpu-workloads
      effect: NoSchedule
  affinity:
    podAntiAffinity:
      preferredDuringSchedulingIgnoredDuringExecution:
        - weight: 100
          podAffinityTerm:
            labelSelector:
              matchLabels: { app: "{{ .context.instance_id }}" }
            topologyKey: kubernetes.io/hostname
  topologySpreadConstraints:
    - maxSkew: 1
      topologyKey: topology.kubernetes.io/zone
      whenUnsatisfiable: ScheduleAnyway
containers:
  app: { image: "..." }
```

**Provider translation.** The helm provider passes each sub-field verbatim into the rendered pod spec. The compose provider has no equivalent for `affinity`, `tolerations`, or `topologySpreadConstraints`; it emits a warning naming the dropped field. `nodeSelector` translates to a Compose `deploy.placement.constraints` block when the target compose version supports it; older targets drop the field with a warning.

### `serviceAccount`

`serviceAccount` is a plain string carrying the name of the ServiceAccount the workload runs under:

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Workload
serviceAccount: "{{ .context.instance_id }}-runner"
containers:
  app: { image: "..." }
```

The field references an existing ServiceAccount; it does not create one. The accompanying RBAC resources (the ServiceAccount object itself, plus Role / RoleBinding / ClusterRole / ClusterRoleBinding) should ship through one of two channels:

- **Recipe `artifacts:`** — when the RBAC is intrinsic to this Recipe (the Recipe knows it needs a specific Role for a specific job).
- **Features with Resource Generation** — when the RBAC is cross-cutting (a Workload-Identity FeatureRecipe attaching IAM-bound ServiceAccounts to every component with a particular label).

Setting `serviceAccount:` without arranging for the named ServiceAccount to exist results in a runtime K8s error at apply time, not a build-time error — the workload schema validation does not cross-check ServiceAccount existence (no compile-time access to the cluster state per the AOT-purity invariant).

The compose provider ignores `serviceAccount:` with a warning; Compose has no equivalent identity-binding concept.

### `podSecurityContext`

`podSecurityContext` carries pod-level security primitives — UID, GID, fsGroup, supplementalGroups — that apply to every container in the pod:

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Workload
podSecurityContext:
  runAsUser: 1000
  runAsGroup: 3000
  fsGroup: 2000
  supplementalGroups: [4000, 5000]
containers:
  app: { image: "..." }
```

**Field semantics.** All four fields are integers (numeric UIDs/GIDs, not strings); `runAsUser` and `runAsGroup` set the container processes' effective UID/GID; `fsGroup` sets the group ownership for volumes mounted into the pod; `supplementalGroups` adds additional GIDs to each container's process group.

**Provider translation.** The helm provider passes the block verbatim into the rendered pod spec. The compose provider has no equivalent for `fsGroup` or `supplementalGroups`; `runAsUser`/`runAsGroup` translate to the Compose `user: "1000:3000"` form. Per-container `securityContext:` (a separate K8s pod-spec field on individual containers) is not part of the Workload schema today; that lives on the helm provider's per-container overlay path and is an authoring concern at the chart level, not at the Workload-grammar level.

## Secrets integration with the Component's `secretsSchema`

The Workload's `containers.<name>.secrets` block references credential slots declared in the Component's `secretsSchema`; it does not declare new slots. See [../entities/component.md](../entities/component.md) for the `secretsSchema` authoring surface.

Three validation rules govern the integration:

- Every `secrets.<KEY>.from` value must match a slot name declared in the Component's `secretsSchema`. An unknown slot name is a load-time error.
- The `as:` delivery mechanism (`env` or `file`) must appear in the slot's `inject:` allowlist declared by the Component. A Workload declaring `as: file` against a slot whose `secretsSchema` entry specifies `inject: [env]` is a load-time error.
- Slots marked `inject: []` (blackbox delivery) in the Component's `secretsSchema` cannot appear in Workload `secrets:` blocks at all. Those slots are delivered by the Recipe's internal plumbing (a Helm chart's `existingSecret` parameter, for example), not by Workload exposure.

Example:

```yaml
# In the Component catalog entity
spec:
  secretsSchema:
    db_password:
      required: true
      inject: [env, file]      # transparent: Workload may dictate delivery
    root_password:
      required: true
      inject: []               # blackbox: Recipe handles internally

# In the Recipe's Workload
workload: |
  containers:
    main:
      secrets:
        DB_PASSWORD:              # OK — db_password slot allows env inject
          from: db_password
          as: env
        # ROOT_PASSWORD: ...      # rejected at load time: blackbox slot
```

## Validation surface

Every Workload is validated at Recipe load time before any rendering runs. Validation has two stages:

- **Schema validation.** The Workload value is unified against the embedded `aggrega.ai/v1alpha1` Workload schema. Errors carry the field path and the constraint violated (for example, `.containers.main.health.ready: more than one probe shape declared`). Schema validation enforces every type, enum, range, and disjunction declared in the schema — including the closed-set service `type` (one of `ClusterIP`, `NodePort`, `LoadBalancer`, `Headless`), the integer port range (1..65535), the probe-shape disjunction (exactly one of `http`, `tcp`, `exec`), and the volume-variant disjunction (exactly one of `ephemeral`, `configmap`, `secret`, `persistent`, `persistentTemplate`).
- **Cross-reference validation.** Workload secret references are checked against the Component's `secretsSchema` (rules in the next section). This is a cross-entity check that schema-only validation cannot perform.

Both stages produce the same `CATALOG_ERROR`-prefixed message shape; failures stop the build before any rendering output is produced. Recipe authors get pointed feedback identifying the exact field that failed and the constraint that rejected it.

The K8s-shaped pass-through fields (`scheduling.affinity`, `scheduling.tolerations`, `scheduling.topologySpreadConstraints`, the `items` lists inside ConfigMap and Secret volumes, lifecycle `httpGet` hooks) are validated structurally only — Aggrega's schema constrains their presence and outer shape, but the inner shape of these K8s-API-defined values is the provider engine's responsibility (the helm provider hands them to the K8s pod spec verbatim; the compose provider rejects or degrades them as appropriate). A Workload using a misshapen `affinity` value passes Aggrega validation and surfaces the error during provider synthesis instead.

## Auxiliary resources belong outside the Workload

The Workload describes the workload shape only — containers, volumes, services, replicas, scheduling, security context, service account. It has no `additionalResources` field and no inline ConfigMap / Secret / CRD declarations.

Recipe authors emit auxiliary resources through two channels outside the Workload:

- **Recipe-level `artifacts:`** — for resources intrinsic to this Recipe (a specific ConfigMap the Recipe's Workload references, a one-off CRD registration the Recipe needs). The field is a map of named entries; each entry is authored inline or loaded via per-entry `$import:`. See the Artifacts Mechanism section in [../../architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md) for the three authoring modes.
- **Features with Resource Generation** — for cross-cutting concerns attached via Release selectors (a ServiceMonitor Feature attached to every component with metrics exposed, a NetworkPolicy Feature attached to every production workload). See [../entities/featurerecipe.md](../entities/featurerecipe.md) for the FeatureRecipe authoring surface.

The Workload stays focused on the workload shape; cross-cutting and Recipe-intrinsic auxiliary manifests have their own authoring homes.

## Common Workload patterns

The Workload schema is broad — it covers single-container HTTP servers, multi-container sidecar patterns, init-container chains, batch jobs, and stateful services with persistent volumes. Three patterns recur frequently enough that authoring boilerplate from scratch per Recipe is wasteful. The blocks below are copy-paste templates Recipe authors can adapt to specific components.

A future iteration is expected to ship these patterns as catalog-shipped Workload-fragments authors `implements:` from rather than copy-paste; see the "Workload Pattern Library" entry under Standard Library Expansion in the project ROADMAP. Until those fragments ship, the templates here are the canonical starting points.

### Pattern 1 — Server with metrics exposure

A typical web application that serves application traffic on one port and exposes Prometheus-scraped metrics on a separate port. Two services in the Workload — one for the application, one for metrics — keeps Service-mesh policy and load-balancer configuration cleanly separable.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Workload
replicas: {{ optional .infra `replicas` 2 }}
containers:
  app:
    image: "{{ .values.image }}"
    ports:
      web: {{ optional .values `port` 8080 }}
      metrics: {{ optional .values `metrics_port` 9090 }}
    variables:
      LOG_LEVEL: "{{ optional .values `log_level` "info" }}"
services:
  http:
    type: ClusterIP
    ports:
      web: {{ optional .values `port` 8080 }}
  metrics:
    type: ClusterIP
    ports:
      metrics: {{ optional .values `metrics_port` 9090 }}
health:
  ready:
    http: /healthz
    timeoutSeconds: 5
  live:
    http: /healthz
    timeoutSeconds: 5
```

The metrics service is typically annotated for Prometheus discovery via a Feature attachment at the Release surface (e.g., `feature.aggrega.ai/prometheus-scrape: "true"`); the Workload itself stays clean of provider-specific scrape annotations.

### Pattern 2 — Batch job

A workload that runs to completion rather than serving traffic indefinitely. The pattern omits `services:` entirely — batch jobs do not expose ports — and uses `replicas: 1` since K8s Jobs (which the helm provider may emit when it detects this shape) handle parallelism via the Job spec rather than Deployment replicas. Authors who need K8s `Job` semantics rather than `Deployment` semantics rely on the provider engine's promotion rule (today: helm emits Deployment unconditionally for Workloads; Job emission is a future provider extension).

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Workload
replicas: 1
containers:
  worker:
    image: "{{ .values.image }}"
    command: ["{{ .values.entrypoint }}"]
    args:
      - "--config"
      - "/etc/config/job.yaml"
    variables:
      JOB_ID: "{{ .context.instance_id }}-{{ .metadata.release_name }}"
    volumeMounts:
      config:
        path: /etc/config
volumes:
  config:
    configmap:
      name: "{{ .context.instance_id }}-config"
```

The config volume references a ConfigMap the Recipe is expected to emit alongside the Workload via `artifacts:` (see "Auxiliary resources belong outside the Workload" above) — the Workload itself only declares the consumption side.

### Pattern 3 — Sidecar pair

A two-container pod where the main container handles application logic and the sidecar handles a cross-cutting concern (TLS termination, log shipping, service-mesh proxy, AI guardrail). Author order in `containers:` is load-bearing — the helm provider emits containers in declared order; the first key (here, `main`) is the default-container target for `kubectl logs` and similar tooling.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Workload
replicas: {{ optional .infra `replicas` 2 }}
containers:
  main:
    image: "{{ .values.app_image }}"
    ports:
      app: {{ optional .values `app_port` 8080 }}
    variables:
      UPSTREAM_URL: "http://localhost:{{ optional .values `app_port` 8080 }}"
  sidecar:
    image: "{{ .values.sidecar_image }}"
    ports:
      proxy: {{ optional .values `proxy_port` 9000 }}
    variables:
      PROXY_TARGET: "http://localhost:{{ optional .values `app_port` 8080 }}"
services:
  external:
    type: ClusterIP
    ports:
      proxy: {{ optional .values `proxy_port` 9000 }}
```

The Service exposes the sidecar's port (not the main container's), routing external traffic through the sidecar to the main container via `localhost`. The two containers share the pod's network namespace, so `localhost:<port>` reaches the peer container directly. For sidecars that need credential injection (the canonical AI-guardrail pattern), the credential typically lives on the sidecar's `secrets:` block rather than the main container's — keeping the credential scoped to the sidecar's process boundary.

### Pattern selection

The three patterns map to distinct shipping-shape concerns:

- **Server with metrics** — long-running services that the cluster keeps alive; multiple Service exposures for traffic separation.
- **Batch job** — bounded execution; no Service exposure; relies on Recipe-emitted ConfigMap or external state for input.
- **Sidecar pair** — multi-container pod with shared network namespace; the sidecar's Service exposes the cross-cutting concern.

A fourth pattern — **stateful server with persistent volume** — uses the Workload's `volumes.<name>.persistentTemplate` field to declare per-replica persistent storage; the helm provider's StatefulSet promotion rule (see [providers/helm.md](../providers/helm.md)) emits StatefulSet rather than Deployment when this volume variant is present. The pattern is identical in shape to "server with metrics" with an additional `persistentTemplate` volume; authors needing it adapt Pattern 1 with the volume declaration.

## Cross-references

- [../../architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md) — architectural role of the Workload kind and the full schema surface.
- [../entities/recipe.md](../entities/recipe.md) — how `workload:` composes with the other two Recipe input kinds.
- [../entities/component.md](../entities/component.md) — `secretsSchema` authoring that Workload `secrets:` blocks reference.
- [../entities/featurerecipe.md](../entities/featurerecipe.md) — Feature-level auxiliary resources that sit alongside Workloads.
- [../vocabulary/data-pillars.md](../vocabulary/data-pillars.md) — pillar-access contract for template evaluation.
- [../templates/expansion-matrix.md](../templates/expansion-matrix.md) — where Workload evaluation fits in the template-evaluation matrix.
