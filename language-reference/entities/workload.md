# Workload

The architectural role of the Workload kind — why it exists, how it composes with the other two Recipe input kinds (sourced and artifacts), and the full schema surface — lives in [../../architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md). This page covers the Workload authoring surface: how a Recipe author writes Workload content, what the compiler evaluates when, how Workload fields interact with the Component's `featuresSchema`, and which pillars templates inside a Workload can read.

## Authoring location

Workload content is authored inline or from file, inside a Recipe or a FeatureRecipe (see [FeatureRecipe](featurerecipe.md)). A Recipe declares exactly one `workload:` per node; a FeatureRecipe likewise declares at most one of its own:

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
- `.parameters` — already interpolated at resolution; visible via `.values` / `.infra` wherever the Developer or Ops referenced `.parameters.<name>` in their authoring.
- `.locals` — Recipe-private state resolved in the locals preamble and published at source resolution; available at every Workload template-evaluation site.
- `.context.instance_id` — the node's flattened instance ID used for resource-name prefixing.
- `.context.inject` — the post-interception injection pipe, already rewritten by any FeatureRecipe `injectMapping` during inject mapping.
- `.context.uses` — the enriched topology edges outbound from this node, each carrying the target's resolved `provides`, `labels`, and cascading annotations.
- `.features` — the node's attachments, each carrying its `type`, `values`, `infra`, and resolved `provides`. An attachment named for a slot the Component declares in `featuresSchema` fills that slot (see below).

See [../vocabulary/data-pillars.md](../vocabulary/data-pillars.md) for the full pillar-access contract and [../templates/expansion-matrix.md](../templates/expansion-matrix.md) for where Workload evaluation sits in the template-evaluation sequence.

## Field-semantics essentials

The full Workload schema is in [../../architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md) under "The Workload Kind." The authoring conventions below cover the field-level decisions a Recipe author makes.

### `form`

`form` declares the workload's abstract controller shape — the kind of runtime lifecycle it has, independent of any target platform. It is a single string, one of `stateless`, `stateful`, `daemon`, `scheduled`, `task`, and defaults to `stateless` when omitted:

- `stateless` — interchangeable, horizontally-scaled replicas with no per-replica identity (the common long-running service).
- `stateful` — replicas with stable per-replica identity and per-replica storage. A `persistentTemplate` volume is a companion of this form.
- `daemon` — one instance per eligible host.
- `scheduled` — recurring, time-triggered runs.
- `task` — a single run to completion.

The form carries no platform-native resource kinds itself. Each target provider maps the form to its own native shape:

| `form` | Kubernetes (helm) | Compose | CloudFormation | Terraform |
| --- | --- | --- | --- | --- |
| `stateless` | Deployment | service (no persistent volume) | ECS Service | `aws_ecs_service` |
| `stateful` | StatefulSet | service + named volume | ECS Service + EBS/RDS | `aws_ecs_service` + volume |
| `daemon` | DaemonSet | (n/a → loud unsupported) | ECS daemon scheduling | ECS daemon scheduling |
| `scheduled` | CronJob | (n/a) | EventBridge Scheduler | `aws_cloudwatch_event_rule` |
| `task` | Job | one-shot container | ECS RunTask / Lambda | ECS task / Lambda invoke |

When a target provider has no clean mapping for a form, the build halts loudly rather than degrade the workload into a shape that misrepresents the intent — choosing a form a target boundary cannot express is a build-time error, not a silent downgrade. The compose provider halts on `daemon`, `scheduled`, and `task`. The helm provider emits a CronJob for `scheduled` (see [`schedule`](#schedule) below) and halts only when its schedule is absent or malformed.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Workload
form: stateful
containers:
  db: { image: "postgres:16" }
volumes:
  data:
    persistentTemplate:
      size: "20Gi"
services:
  headless:
    type: Headless
    ports:
      db: 5432
```

### `schedule`

`schedule` is the cron schedule for a `form: scheduled` workload — the companion field that gives the recurring form its recurrence. It is a single string in one canonical format:

- a standard 5-field crontab expression — minute, hour, day-of-month, month, day-of-week (for example `0 0 * * *` for daily at midnight, `*/15 * * * *` for every fifteen minutes), or
- one of the macros `@hourly`, `@daily`, `@weekly`, `@monthly`, `@yearly`.

`schedule` is **required** when `form: scheduled` and only meaningful then. A `form: scheduled` workload with no schedule, a schedule that is neither a 5-field expression nor a recognised macro (a 6-field seconds-prefixed expression, an unrecognised `@`-token, or a field with illegal characters), or a `schedule` set on any other form is a build-time halt naming the fix. The helm provider pipes the value verbatim into the emitted CronJob's `spec.schedule`.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Workload
form: scheduled
schedule: "0 2 * * *"        # daily at 02:00
containers:
  report:
    image: "reporter:1.0"
    command: ["/report"]
```

### `replicas`

A single integer for the workload's replica count. Defaults to 1 when omitted. Use a template expression to drive replicas from Ops-declared sizing:

```yaml
replicas: {{ optional .infra `replicas` 1 }}
```

### `containers` vs `initContainers`

`containers` is an ordered map keyed on container name. Container 0 (the first map key) matters for pod-spec ordering in Kubernetes output and for default-container semantics. `initContainers` is an ordered list of init-container entries, each carrying `name`, `image`, and the same variable/secret/volume-mount authoring shape as the main containers.

`name` is optional on an `initContainers` entry. An entry that omits it is named `init-<index>`, where the index is the entry's position in the list, counting from `0`. Because the name identifies the container in rendered output and in any diagnostic that names it, an entry worth referring to is worth naming explicitly.

Author-order preservation is a load-bearing contract of the Workload model — the compiler emits `containers`, `volumes`, `services`, container `ports`, container `variables`, and container `attachments` in the order the Recipe author declared them, regardless of whether two compilations of the same input produce different Go map iteration orderings under the hood. Recipe authors can rely on the ordered shape: when the deployment-time semantic depends on the order (sidecar startup, `$(VAR)` chaining in environment variables, `volumeMounts` referencing previously-declared volumes), authoring order IS the runtime order.

Container field authoring follows these conventions:

- **`image`** is typically a template expression referencing `.values.image` (the Developer's selected image) with optional `.infra.*` overrides for environment-specific registry prefixing.
- **`variables`** is a plain string → string map for environment variables. The map blends two distinct data sources via Go template expressions: **developer-pillar literals** (entries whose template expressions read `.values` / `.infra` / `.locals` — payload originating in the Component's pillars) and **cross-component-pipe data** (entries whose template expressions read `.context.inject.env.<KEY>` — payload originating in another component's `provides:` and routed through the topology pipe). The two sources flow into the same `variables` map; authors choose one per entry based on whether the value is component-local or cross-component-derived. Common patterns: `LOG_LEVEL: "{{ .values.log_level }}"` is developer-pillar (component-local); `DB_HOST: "{{ .context.inject.env.DB_HOST }}"` is cross-component-pipe (the value originates in a target component's `provides.host` routed through the caller's `uses[].inject.env.DB_HOST` declaration). Both forms compile to a single Kubernetes `env:` list on the rendered Deployment; the dual-source semantic is at authoring time only.
- **`attachments`** references slots declared in the Component's `featuresSchema` (see the integration section below).
- **`ports`** is a named-port map (`web: 8080`, `admin: 9901`); port names match container-scoped port names and are referenced by `services.<service>.ports.<portname>`. A port that carries a transport other than the target's default is authored in the expanded form instead — see [Port transport protocols](#port-transport-protocols) below.
- **`volumeMounts`** references volumes declared elsewhere in the Workload's `volumes:` section by name.
- **`resources`** declares the container's `requests` and `limits` — the `cpu` and `memory` quantities, and optionally extended-resource keys for GPUs and other devices (see [GPU and device workloads](#gpu-and-device-workloads) below).
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

`persistentTemplate` produces a per-replica PVC for StatefulSet-shaped translation; in compose translation it degrades to a single shared named volume, with a warning reported alongside the build. The generated file itself carries no note of the degradation — it is byte-for-byte what it would be without the warning.

**Per-provider translation.** Each provider translates the five volume variants into its native shape:

| Variant | Helm / helm-chart (K8s) | Compose | Loss notes |
| --- | --- | --- | --- |
| `ephemeral` | `emptyDir: { sizeLimit }` | service-level `tmpfs:` entry naming the mount path (in-memory) | Compose tmpfs is RAM-backed; helm's emptyDir is disk-backed on the node by default — semantic divergence in the underlying storage medium. `sizeLimit` reaches no part of the compose output: the emitted entry is the mount path alone. An authored `sizeLimit` raises an `unsupported-field` warning naming it, reported alongside the build rather than written into the generated file. |
| `configmap` | ConfigMap volume reference (consumes a ConfigMap resource emitted by the Recipe's `artifacts:` or by a Feature) | Service-level `configs:` reference naming the configmap, mounted at the volume mount's path; the matching top-level `configs:` entry comes from the Recipe's `artifacts:` | Both targets reference the configmap **by name** and neither reads its content, so the authoring shape is symmetric. What compose loses is K8s ConfigMap's update-on-rollout semantics: a compose config is fixed at the content the build emitted. A reference no top-level entry resolves halts the build rather than emitting a mount that would be dangling at run time. |
| `secret` | Secret volume reference (consumes a Secret resource emitted by a credential FeatureRecipe) | `env_file:` for env-shaped secrets, or a bind-mounted secret file for path-shaped secrets | Compose lacks first-class Kubernetes Secret semantics. A path-shaped secret deliberately does **not** take the `configmap` variant's `configs:` route: an inline config entry would write the secret's value into the emitted compose file in plaintext, and the compiler never resolves a secret into plaintext. The bind source is a path the operator makes reachable on the compose host, outside any vault-fetch CRD lifecycle. |
| `persistent` | PVC resource + `volume.persistentVolumeClaim` | Named volume | Compose named volumes are a flat host-side abstraction; helm's PVC supports storage class, access mode, and capacity declaration that compose ignores. |
| `persistentTemplate` | `StatefulSet.volumeClaimTemplates` (per-replica PVC; companion of `form: stateful`) | Named volume (degraded — single shared volume across replicas, with a warning reported) | Compose cannot express per-replica templates. When `persistentTemplate` is translated to compose, a single named volume is emitted and the reduced fidelity is reported as a warning alongside the build rather than written into the generated file. Workloads relying on per-replica volume isolation should not target compose-only boundaries. |

The controller shape is chosen by the workload's `form`, not by its volumes. A StatefulSet is emitted when `form: stateful`; a `persistentTemplate` volume is a **companion** of that form — it declares per-replica storage on a workload that already has the per-replica identity a StatefulSet provides. Declaring a `persistentTemplate` volume on any other form (or on the default `stateless`) is a build-time error naming the fix: `declare form: stateful`. The reverse is allowed — a `form: stateful` workload need not declare a `persistentTemplate` volume. Authors who want StatefulSet semantics set `form: stateful` directly.

A `form: stateful` workload on the helm provider requires a headless governing Service: declare **exactly one** service with `type: Headless` in the same Workload. The provider wires the StatefulSet's `serviceName` to that headless Service (it provides the stable per-pod network identities a StatefulSet needs). The build halts if no headless service is declared — a StatefulSet has no governing Service to name — or if more than one is, leaving the governing Service ambiguous. A StatefulSet workload may still declare additional non-headless services (for example a `ClusterIP` service for client access) beside the one headless governing service.

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

**Synthesized-name convention.** When the helm provider synthesizes a Workload's services, each Service's `metadata.name` is derived deterministically from the node's instance ID and the service's authoring key: `<instance_id>-<service-key>`. A Workload declaring `services.http` on node `api-server` produces a Service named `api-server-http`; the same Workload on node `billing` produces `billing-http`. The output filename mirrors the same convention: `<instance_id>-<service-key>-service.yaml`.

The convention has two practical consequences. First, **cross-node collisions are impossible by construction** — the instance-ID prefix differentiates services across every node in the boundary, so two Workloads each declaring `services.http` produce distinct K8s Service resources with non-overlapping names. Second, **within-Workload duplicate keys are prevented by schema** — the `services:` map is an OrderedMap, so the YAML parser deduplicates duplicate keys at parse time (the second declaration silently overwrites the first); authors should not rely on declaration order to disambiguate same-named services on the same Workload.

The collision risk that does remain is at the **K8s name-length boundary**: Kubernetes Service names cap at 63 characters, and the synthesized `<instance_id>-<service-key>` form can exceed that limit when both segments are long. The Aggrega compiler does not enforce the limit; the Service applies cleanly at render time but Kubernetes rejects the apply. Authors with deeply nested instance IDs (e.g., `data-layer.regional.eu-west.primary`) plus long service keys should keep the combined length under 63 characters.

**Provider-specific note (compose).** The compose provider derives `depends_on` automatically from IR uses-edges. Those entries are emitted ungated — they carry `service_started` semantics regardless of whether the target declares a healthcheck — so a service whose dependencies all come from `uses` edges emits the short-form list (`depends_on: [<target>]`). Gating an edge-derived entry on the target's health is not implemented. The long form is emitted where an entry does carry a condition, which is how a wait on an init container is expressed; see [providers/compose.md](../providers/compose.md#init-containers).

## Port transport protocols

A container port is authored in either of two equivalent forms. The bare number is the short form and declares no transport, so the target applies its own default — TCP on every target that has one:

```yaml
containers:
  main:
    image: "{{ .values.image }}"
    ports:
      web: 8080
```

The expanded form carries the number and the transport together, and is what a port needs when it carries anything other than that default:

```yaml
containers:
  main:
    image: "{{ .values.image }}"
    ports:
      web: 8080                 # short form — no transport declared
      dns:
        port: 53
        protocol: UDP           # TCP | UDP | SCTP
      sigtran:
        port: 2905
        protocol: SCTP
```

The two forms may be mixed freely inside one `ports` map, and a port with no transport to declare stays in the short form.

**The transport is declared once, on the container port.** A `services.<service>.ports` entry names a container port and takes that port's transport with it, so a service exposure cannot disagree with the port the container opened. There is no `protocol` key on a service port, and authoring one is rejected.

**Why the field exists.** Deployment targets treat an unspecified transport as the streaming one. A component that needs a datagram port — realtime media, telephony, name resolution, private networking, a game server — could otherwise declare only the number, and the stack would deploy with every gate passing while no client connected, because the traffic is datagram and the port that got opened is not. Declaring the transport is what makes that expressible.

**The compiler does not interpret the value.** It reads no transport out of a port's *name* and does not check the declared transport against what the process behind the port actually speaks: the value is data you declare and the target's engine emits. A port named `dns` carrying no `protocol` key is a TCP port, and a port named `web` declaring `protocol: UDP` is a UDP port.

**Per-target behaviour.**

| Target | A port with no transport declared | A declared transport |
| --- | --- | --- |
| helm | `containerPort` and the Service port carry no `protocol` key | emitted verbatim as `protocol:` on the container port and on every Service port naming it |
| compose | published as `<host>:<container>`, unchanged | published as `<host>:<container>/tcp` or `/udp`; `SCTP` has no compose spelling and **halts the build** rather than publishing a port that would carry a different transport |

A container port that no service publishes reaches no part of a compose file at all — that is compose's standing behaviour for container ports — so a transport declared on such a port has nothing to be spelled onto and does not halt.

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

Three intent forms (`http:`, `tcp:`, `exec:`) are mutually exclusive within a single probe declaration. Port resolution for `http:` without an explicit port takes the alphabetically-first port **name** the container declares under `containers.<name>.ports` — the same rule on both targets, so a probe reads the same port whichever one renders it. A container that declares no named port cannot carry an HTTP probe: the build halts with a translation error naming the offending probe.

**Per-provider translation.** Each provider translates the abstract probe intent into its native shape at synthesis time:

| Intent | Helm (K8s) | Compose | Loss notes |
| --- | --- | --- | --- |
| `http: /path` | `httpGet.path: /path, httpGet.port: <alphabetically-first port name>` | `CMD-SHELL "curl -f http://localhost:<port>/path"` | Compose lacks a native HTTP probe shape; the CMD-SHELL wrapper depends on `curl` being present in the container image. |
| `tcp: <port>` | `tcpSocket.port: <port>` | `CMD-SHELL "nc -z localhost <port>"` | Compose lacks a native TCP probe shape; the CMD-SHELL wrapper depends on `nc` being present in the container image. |
| `exec: [cmd, ...]` | `exec.command: [cmd, ...]` | `CMD [cmd, ...]` | One-to-one mapping; both providers carry the command list verbatim. |

Compose's `CMD-SHELL` wrappers approximate HTTP and TCP probes through shell-evaluable predicates. What compose lacks is the native probe shape, not the timing fields: an authored `periodSeconds`, `timeoutSeconds`, `failureThreshold` and `initialDelaySeconds` are carried across onto the healthcheck as `interval`, `timeout`, `retries` and `start_period` — [providers/compose.md](../providers/compose.md) "Probes" carries the field-by-field mapping. The native `exec:` shape needs no wrapper at all and translates one-to-one on both targets.

A wrapped probe is translated **silently**: nothing in the emitted `docker-compose.yaml` marks it, and no diagnostic reports the wrapping. What the build does report on this path is a probe slot that reaches no output at all — a compose service carries one healthcheck, so where a Workload declares more than one of `ready:`, `live:` and `startup:` only the preferred slot is translated (`live` over `ready` over `startup`) and an `unsupported-field` warning names the slot translated and the slots dropped.

**Provider-specific note (compose).** Authoring a `health:` block on a compose-targeted Workload does not gate `depends_on` ordering on health: the compose provider's `depends_on` entries derived from `uses:` edges always use `service_started` semantics, regardless of whether the target Workload declares health probes. Gating those entries on the target's health is not implemented — the long form that would carry such a condition is itself emitted, for init-container waits, so what is missing is the choice to gate an edge on health rather than the shape to express it. See [providers/compose.md](../providers/compose.md) for the full inference rules.

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

## GPU and device workloads

A workload that needs specialised hardware — a GPU, or another vendor-provided device — expresses two independent concerns: the pod-level runtime the device-enabled node exposes (`runtimeClassName`), and the per-container quantity of the device the workload claims (an extended-resource key under a container's `resources`). A typical GPU workload declares both together, but each stands on its own and either may appear without the other.

Both fields describe compute — the pod and the container that runs on the device — so they belong on a workload that runs containers. A workload that carries only an external endpoint and declares no containers of its own has no pod or container to attach them to: setting `runtimeClassName` on such an endpoint-only workload halts the build, naming `runtimeClassName` and the Recipe whose Workload declared it, and with no containers there is nowhere to place a device resource request.

### `runtimeClassName`

`runtimeClassName` is a single string naming the RuntimeClass the pod runs under — the container runtime a device-enabled node exposes, for example a GPU runtime named `nvidia`. It is a pod-level selector: it applies to every container in the workload. The compiler pipes the name through verbatim as a deterministic pointer; the cluster resolves it to a RuntimeClass its administrator has configured, at schedule time. Aggrega does not check that a matching RuntimeClass exists — it has no compile-time access to cluster state — so a name with no configured RuntimeClass surfaces as a scheduling error at apply time, not a build-time error.

### Extended-resource keys

A container's `resources.requests` and `resources.limits` carry the ordinary `cpu` and `memory` quantities and, alongside them, **extended-resource keys**: vendor- or domain-scoped device quantities keyed by a fully-qualified `<domain>/<name>` name such as `nvidia.com/gpu` or `amd.com/gpu`. The domain segment carries at least one dot, and that dot is what distinguishes an extended key (`nvidia.com/gpu`) from the bare `cpu` and `memory` quantities. Each value is a string quantity (`"1"`, `"2"`) the compiler pipes through verbatim; the cluster's device plugin resolves and allocates the device at schedule time.

### Worked example — a GPU inference workload

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Workload
runtimeClassName: nvidia
containers:
  inference:
    image: "{{ .values.image }}"
    resources:
      requests:
        cpu: "2"
        memory: "8Gi"
        nvidia.com/gpu: "1"
      limits:
        nvidia.com/gpu: "1"
```

The workload selects the `nvidia` runtime for its pod and claims one GPU for the `inference` container. The GPU quantity appears in both `requests` and `limits`: a device is not oversubscribable, so its request and limit are set to the same value.

**Provider translation.** These are Kubernetes-native concepts. The helm provider emits `runtimeClassName` on the rendered pod spec and each extended-resource key verbatim under the container's `resources.requests` / `resources.limits`, so they reach the cluster through the Kubernetes output. A single host has no runtime-class or extended-device concept: the compose provider carries neither field, and a workload declaring `runtimeClassName` or an extended-resource key renders on a compose target without it.

## Running on the node's network

By default a workload runs in a network namespace of its own: its containers see only their own
interfaces, and traffic reaches them through the target's address translation. `hostNetwork: true`
asks for the other arrangement — the workload runs in the **node's own network namespace**, so it
sees the node's interfaces and the ports its containers open are reachable on the node's own
addresses, with no translation in between.

That is what a whole class of software needs. Realtime media, telephony, virtual private networking
and similar traffic carry the peer's address inside the payload, so an address rewritten in transit
arrives describing somewhere the peer cannot reach; running on the node's addresses is what keeps
the two consistent.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Workload
hostNetwork: true
containers:
  media:
    image: "{{ .values.image }}"
    ports:
      rtp:
        port: 7881
        protocol: UDP
```

### What it declares, and what it does not

`hostNetwork` chooses a **network namespace**, and that is the whole of it.

- **It declares no ports.** The ports a workload opens are still declared under
  `containers.<name>.ports`, exactly as they are without it, and they still mean the same thing.
  Declaring `hostNetwork` neither adds a port nor removes the need to declare one.
- **It declares no *number* of ports.** An application that wants many contiguous ports — a media
  server sizing a range to a machine's processor count, say — configures that range in its own
  configuration body, from values its operator supplies, the same way it configures anything else it
  reads at start-up. That is an application setting rather than a workload one, and the workload
  contract is not where it lives.
- **Nothing is inferred.** The compiler reads no meaning from the value and derives it from nothing
  else: not from a port's name, not from a component's type or labels, not from how many ports are
  declared. A workload runs on the node's network when, and only when, it says so.

Because it describes compute, `hostNetwork` belongs on a workload that runs containers. A workload
carrying only an external endpoint declares no containers, so it has no network namespace to choose:
declaring `hostNetwork` on an endpoint-only workload halts the build, naming `hostNetwork` and the
Recipe whose Workload declared it.

### Provider translation

The helm provider emits `hostNetwork: true` on the rendered pod spec, which is how Kubernetes
expresses the same choice. The declaration reaches the pod spec and nothing else — the emitted
Services are identical with and without it.

The compose provider emits `network_mode: host` on the workload's own service. One consequence
follows from how compose models networks: a service in that mode is not attached to the boundary
network, because compose treats attaching to a network and adopting the host's namespace as
alternatives rather than additions. Its peers therefore reach it on the host's own addresses instead
of by service name — which is what host networking means on any target — and every other service on
the boundary is unaffected.

Two shapes compose with it on that target. A sidecar container follows the main service onto the
host's network without declaring anything, because it takes the main service's namespace by naming
it. An [init container](#containers-vs-initcontainers) does not: it becomes a service that the main service waits
on, so it joins the boundary network in its own right rather than adopting a namespace that would
make that wait circular. A workload declaring both `hostNetwork` and `initContainers` therefore runs
its own service on the node's network while its init services stay on the boundary network — a
narrower arrangement than the single shared namespace the pod shape gives, and one the compose
provider names in an `unsupported-field` warning rather than leaving to be discovered at run time.

A workload that does not declare `hostNetwork` renders identically on every target to one authored
before the field existed: the key is absent from the output entirely rather than emitted as `false`.

## Attachment integration with the Component's `featuresSchema`

The Workload's `containers.<name>.attachments` block references credential slots declared in the Component's `featuresSchema`; it does not declare new slots. See [../entities/component.md](../entities/component.md) for the `featuresSchema` authoring surface. `from` names the slot; it is not the generated Secret's name.

A `containers.<name>.attachments` entry renders to a reference to a Secret resource — a Kubernetes `secretKeyRef` (for `as: env`) or a secret-backed volume (for `as: file`) — both of which point at the Secret **by name**. The synthesizer resolves that name and data key from the slot's exposed provides: the entry's rendered `secretKeyRef.name` is the slot's `.features.<slot>.provides.name` and the data key is `.features.<slot>.provides.key`. The Recipe author writes only `from: <slot>` and `as: env`; the synthesizer reads the resolved provides — it does not re-derive the name. This is the same `.features.<slot>.provides.<key>` read a source Recipe uses for an `existingSecret`: a single credential slot feeds both a source-Recipe consumer and a synthesized-Workload consumer identically (source/workload symmetry).

Four validation rules govern the integration:

- Every `attachments.<KEY>.from` value must match a slot name declared in the Component's `featuresSchema`. An unknown slot name is a load-time error.
- The `as:` delivery mechanism (`env` or `file`) must appear in the slot's `inject:` allowlist declared by the Component. A Workload declaring `as: file` against a slot whose `featuresSchema` entry specifies `inject: [env]` is a load-time error.
- Slots marked `inject: []` (blackbox delivery) in the Component's `featuresSchema` cannot appear in Workload `attachments:` blocks at all. Those slots are delivered by the Recipe's internal plumbing (a Helm chart's `existingSecret` parameter, for example), not by Workload exposure.
- The referenced slot must be **referenceable** — its fill must materialize a Secret resource and publish a `provides` locator (`name`, `key`). A slot filled by an inject-delivered credential (one that writes a value into the inject pipe and produces no Secret resource) has nothing to point at; referencing it from a Workload `attachments:` entry is a load-time error. An inject-delivered credential reaches the container through the slot's inject pipe (a `variables` entry reading `.context.inject.env.<KEY>`), not through an `attachments:` entry.

**Provider note.** Helm renders the `secretKeyRef`/secret-volume reference described above. The compose provider has no native env-from-secret primitive; an `as: env` attachment entry on a compose-targeted Workload is a placeholder pending the compose secret-delivery path, while the referenceability rule (capability-agnostic) still applies.

Example:

```yaml
# In the Component catalog entity
spec:
  featuresSchema:
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
      attachments:
        DB_PASSWORD:              # OK — db_password slot allows env inject
          from: db_password
          as: env
        # ROOT_PASSWORD: ...      # rejected at load time: blackbox slot
```

## Validation surface

Every Workload is validated at Recipe load time before any rendering runs. Validation has two stages:

- **Schema validation.** The Workload value is unified against the embedded `aggrega.ai/v1alpha1` Workload schema. Errors carry the field path and the constraint violated (for example, `.containers.main.health.ready: more than one probe shape declared`). Schema validation enforces every type, enum, range, and disjunction declared in the schema — including the closed-set controller `form` (one of `stateless`, `stateful`, `daemon`, `scheduled`, `task`), the closed-set service `type` (one of `ClusterIP`, `NodePort`, `LoadBalancer`, `Headless`), the integer port range (1..65535), the probe-shape disjunction (exactly one of `http`, `tcp`, `exec`), and the volume-variant disjunction (exactly one of `ephemeral`, `configmap`, `secret`, `persistent`, `persistentTemplate`).
- **Cross-reference validation.** Workload attachment references are checked against the Component's `featuresSchema` (slot membership, `as:` delivery allowlist, blackbox exclusion) and against each referenced slot's resolved provides (referenceability — the fill must publish `name`/`key`). These are cross-entity checks that schema-only validation cannot perform.

Both stages produce the same `CATALOG_ERROR`-prefixed message shape; failures stop the build before any rendering output is produced. Recipe authors get pointed feedback identifying the exact field that failed and the constraint that rejected it.

The K8s-shaped pass-through fields (`scheduling.affinity`, `scheduling.tolerations`, `scheduling.topologySpreadConstraints`, the `items` lists inside ConfigMap and Secret volumes, lifecycle `httpGet` hooks) are validated structurally only — Aggrega's schema constrains their presence and outer shape, but the inner shape of these K8s-API-defined values is the provider's responsibility (the helm provider hands them to the K8s pod spec verbatim; the compose provider rejects or degrades them as appropriate). A Workload using a misshapen `affinity` value passes Aggrega validation and surfaces the error during provider synthesis instead.

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

A workload that runs to completion rather than serving traffic indefinitely. The pattern sets `form: task`, omits `services:` entirely — batch jobs do not expose ports — and relies on the target provider's task shape (a Kubernetes Job on the helm provider, a one-shot container on compose). The helm provider pins a Job-valid pod `restartPolicy` (`Never` unless the container declares `OnFailure`), since a Job pod cannot use the `Always` default.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Workload
form: task
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

The Service exposes the sidecar's port (not the main container's), routing external traffic through the sidecar to the main container via `localhost`. The two containers share the pod's network namespace, so `localhost:<port>` reaches the peer container directly. For sidecars that need credential injection (the canonical AI-guardrail pattern), the credential typically lives on the sidecar's `attachments:` block rather than the main container's — keeping the credential scoped to the sidecar's process boundary.

### Pattern selection

The three patterns map to distinct shipping-shape concerns:

- **Server with metrics** — long-running services that the cluster keeps alive; multiple Service exposures for traffic separation.
- **Batch job** — bounded execution; no Service exposure; relies on Recipe-emitted ConfigMap or external state for input.
- **Sidecar pair** — multi-container pod with shared network namespace; the sidecar's Service exposes the cross-cutting concern.

A fourth pattern — **stateful server with persistent volume** — sets `form: stateful` and declares per-replica storage via `volumes.<name>.persistentTemplate`; the helm provider emits a StatefulSet for the stateful form (see [providers/helm.md](../providers/helm.md)). The pattern is identical in shape to "server with metrics" with `form: stateful`, an additional `persistentTemplate` volume, **and** exactly one `type: Headless` service to govern the StatefulSet (the build halts without it); authors needing it adapt Pattern 1 with all three declarations.

## Cross-references

- [../../architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md) — architectural role of the Workload kind and the full schema surface.
- [../entities/recipe.md](../entities/recipe.md) — how `workload:` composes with the other two Recipe input kinds.
- [../entities/component.md](../entities/component.md) — `featuresSchema` authoring that Workload `attachments:` blocks reference.
- [../entities/featurerecipe.md](../entities/featurerecipe.md) — Feature-level auxiliary resources that sit alongside Workloads.
- [../vocabulary/data-pillars.md](../vocabulary/data-pillars.md) — pillar-access contract for template evaluation.
- [../templates/expansion-matrix.md](../templates/expansion-matrix.md) — where Workload evaluation fits in the template-evaluation matrix.
