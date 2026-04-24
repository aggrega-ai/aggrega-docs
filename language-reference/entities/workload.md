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

Three intent forms (`http:`, `tcp:`, `exec:`) are mutually exclusive within a single probe declaration. Port resolution for `http:` without an explicit port uses the first named port in `containers.<name>.ports` alphabetically by author order; if no ports are declared on the container, the compiler reports a validation error.

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

## Auxiliary resources belong outside the Workload

The Workload describes the workload shape only — containers, volumes, services, replicas, scheduling, security context, service account. It has no `additionalResources` field and no inline ConfigMap / Secret / CRD declarations.

Recipe authors emit auxiliary resources through two channels outside the Workload:

- **Recipe-level `artifacts:` / `artifactsFrom:`** — for resources intrinsic to this Recipe (a specific ConfigMap the Recipe's Workload references, a one-off CRD registration the Recipe needs). See the Artifacts Mechanism section in [../../architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md).
- **Features with Resource Generation** — for cross-cutting concerns attached via Release selectors (a ServiceMonitor Feature attached to every component with metrics exposed, a NetworkPolicy Feature attached to every production workload). See [../entities/featurerecipe.md](../entities/featurerecipe.md) for the FeatureRecipe authoring surface.

The Workload stays focused on the workload shape; cross-cutting and Recipe-intrinsic auxiliary manifests have their own authoring homes.

## Cross-references

- [../../architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md) — architectural role of the Workload kind and the full schema surface.
- [../entities/recipe.md](../entities/recipe.md) — how `workload:` / `workloadFrom:` compose with the other two Recipe input kinds.
- [../entities/component.md](../entities/component.md) — `secretsSchema` authoring that Workload `secrets:` blocks reference.
- [../entities/featurerecipe.md](../entities/featurerecipe.md) — Feature-level auxiliary resources that sit alongside Workloads.
- [../vocabulary/data-pillars.md](../vocabulary/data-pillars.md) — pillar-access contract for template evaluation.
- [../templates/expansion-matrix.md](../templates/expansion-matrix.md) — where Workload evaluation fits in the template-evaluation matrix.
