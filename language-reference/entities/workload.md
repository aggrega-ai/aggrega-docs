# Workload

The architectural role of the Workload kind — why it exists, how it composes with the other two Recipe input kinds (sourced and artifacts), and the full schema surface — lives in [../../architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md). This page covers the Workload authoring surface: how a Recipe author writes Workload content, what the compiler evaluates when, how Workload fields interact with the Component's `secretsSchema`, and which pillars templates inside a Workload can read.

## Authoring location

Workload content is authored inline or from file, always inside a Recipe. A Recipe declares exactly one Workload per node via either:

```yaml
# Inline
spec:
  workload: |
    apiVersion: aggrega.ai/v1alpha1
    kind: Workload
    # ...
```

or

```yaml
# File-loaded (relative to the Recipe directory)
spec:
  workloadFrom: ./workload.yaml
```

Both forms produce the same post-parse Workload object; the choice is authoring ergonomics. The two fields are mutually exclusive — a Recipe declaring both fails at Recipe load time.

Workload YAML is not authored as a standalone catalog entity. There is no `catalog/workload/` directory; the Workload grammar exists only as embedded content inside a Recipe. The apiVersion and kind declarations inside the YAML (`apiVersion: aggrega.ai/v1alpha1`, `kind: Workload`) identify the embedded content for schema validation; they do not make the Workload independently addressable.

## Template evaluation

Workload content is Go-templated against the full pillar context before parsing. When a Recipe author writes `replicas: {{ .infra.replicas | default 1 }}`, the compiler evaluates that template during the Workload sub-pass of rendering, resolves `.infra.replicas` against the node's `infra` payload, and parses the resulting YAML as a Workload document. Template evaluation happens after the base Recipe's `valuesMapping` has resolved, so Workload authors can reference previously-computed state via `.locals` the Recipe declared.

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
replicas: {{ .infra.replicas | default 1 }}
```

### `containers` vs `initContainers`

`containers` is an ordered map keyed on container name. Container 0 (the first map key) matters for pod-spec ordering in Kubernetes output and for default-container semantics. `initContainers` is an ordered list of init-container entries, each carrying `name`, `image`, and the same variable/secret/volume-mount authoring shape as the main containers.

Author-order preservation is a load-bearing contract of the Workload model — the compiler emits `containers`, `volumes`, `services`, container `ports`, container `variables`, and container `secrets` in the order the Recipe author declared them, regardless of whether two compilations of the same input produce different Go map iteration orderings under the hood. Recipe authors can rely on the ordered shape: when the deployment-time semantic depends on the order (sidecar startup, `$(VAR)` chaining in environment variables, `volumeMounts` referencing previously-declared volumes), authoring order IS the runtime order.

Container field authoring follows these conventions:

- **`image`** is typically a template expression referencing `.values.image` (the Developer's selected image) with optional `.infra.*` overrides for environment-specific registry prefixing.
- **`variables`** is a plain string → string map for environment variables with literal values. Dynamic values (values that depend on injected strings) go in `variables` via template expressions, which evaluate against `.context.inject`.
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

**Provider-specific note (compose).** The compose provider derives `depends_on` automatically from IR uses-edges and emits the short-form list (`depends_on: [<target>]`). The long-form with `service_healthy` condition gating is reserved for a future intent; today's emit always has `service_started` semantics regardless of whether the target declares a healthcheck.

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

**Provider-specific note (compose).** Authoring a `health:` block on a compose-targeted Workload does not gate `depends_on` ordering on health: the compose provider's `depends_on` entries derived from `uses:` edges always use `service_started` semantics, regardless of whether the target Workload declares health probes. Long-form `service_healthy` gating is reserved for a future intent. See [providers/compose.md](../providers/compose.md) for the full inference rules.

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

- **Recipe-level `artifacts:` / `artifactsFrom:`** — for resources intrinsic to this Recipe (a specific ConfigMap the Recipe's Workload references, a one-off CRD registration the Recipe needs). See the Artifacts Mechanism section in [../../architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md).
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
replicas: {{ .infra.replicas | default 2 }}
containers:
  app:
    image: "{{ .values.image }}"
    ports:
      web: {{ .values.port | default 8080 }}
      metrics: {{ .values.metrics_port | default 9090 }}
    variables:
      LOG_LEVEL: "{{ .values.log_level | default "info" }}"
services:
  http:
    type: ClusterIP
    ports:
      web: {{ .values.port | default 8080 }}
  metrics:
    type: ClusterIP
    ports:
      metrics: {{ .values.metrics_port | default 9090 }}
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
replicas: {{ .infra.replicas | default 2 }}
containers:
  main:
    image: "{{ .values.app_image }}"
    ports:
      app: {{ .values.app_port | default 8080 }}
    variables:
      UPSTREAM_URL: "http://localhost:{{ .values.app_port | default 8080 }}"
  sidecar:
    image: "{{ .values.sidecar_image }}"
    ports:
      proxy: {{ .values.proxy_port | default 9000 }}
    variables:
      PROXY_TARGET: "http://localhost:{{ .values.app_port | default 8080 }}"
services:
  external:
    type: ClusterIP
    ports:
      proxy: {{ .values.proxy_port | default 9000 }}
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
- [../entities/recipe.md](../entities/recipe.md) — how `workload:` / `workloadFrom:` compose with the other two Recipe input kinds.
- [../entities/component.md](../entities/component.md) — `secretsSchema` authoring that Workload `secrets:` blocks reference.
- [../entities/featurerecipe.md](../entities/featurerecipe.md) — Feature-level auxiliary resources that sit alongside Workloads.
- [../vocabulary/data-pillars.md](../vocabulary/data-pillars.md) — pillar-access contract for template evaluation.
- [../templates/expansion-matrix.md](../templates/expansion-matrix.md) — where Workload evaluation fits in the template-evaluation matrix.
