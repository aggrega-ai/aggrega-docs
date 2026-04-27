# Compose Provider

The compose provider renders Aggrega Recipes into a Docker Compose file. A Release that targets one or more compose boundaries produces a single `docker-compose.yaml` at the Release output root, aggregating every contributing node's services, volumes, and networks.

## Supported input kinds

The compose provider accepts two of the three Recipe input kinds:

- **Sourced mode.** A Recipe with `source:` pointing at an existing compose file plus `valuesMapping:` producing an overlay document. The base compose file is loaded, the overlay is evaluated, and the two are deep-merged per docker-compose's native overlay semantics.
- **Workload mode.** A Recipe with `workload:` (or `workloadFrom:`) declares a `Workload` document. The provider synthesises one or more compose services from the Workload spec.

A bare `valuesMapping:`-only Recipe with no `source:` and no `workload:` is unsupported by the compose provider. The compiler halts at render time with a message explaining that compose Recipes must declare either `workload:` or `source:`.

## Workload feature mapping

When a Recipe declares `workload:`, the provider translates the platform-owned Workload shape into compose primitives. The mapping is intentionally narrow — Compose's surface is shape-poorer than Kubernetes, and several Workload features degrade to the closest compose equivalent with documented loss.

### Container fields

| Workload field | Compose field |
| --- | --- |
| `image` | `image` |
| `command` | `command` (list form) |
| `args` | appended after `command` (compose has no separate `args`) |
| `variables` | `environment` (map form) |
| `secrets[as: env]` | `environment` (placeholder; see "Secrets" below) |
| `secrets[as: file]` | `volumes` long-form bind-mount, read-only |
| `volumeMounts` | `volumes` long-form, type per the referenced Volume variant |
| `ports` | implicit (compose containers expose ports the image listens on) |
| `restartPolicy: Always` | `restart: unless-stopped` |
| `restartPolicy: OnFailure` | `restart: on-failure` |
| `restartPolicy: Never` | `restart: no` |

### Probes

A Workload's three probe slots (`live`, `ready`, `startup`) collapse to compose's single `healthcheck` per service, with priority `live > ready > startup` (the most-canonical-liveness signal wins).

| Workload probe shape | Compose `healthcheck.test` |
| --- | --- |
| `http: /path` | `["CMD-SHELL", "curl -f http://localhost:<port>/path \|\| exit 1"]` |
| `tcp: <port>` | `["CMD-SHELL", "nc -z localhost <port>"]` |
| `exec: [cmd, ...]` | `["CMD", cmd, ...]` |

The HTTP form requires the container to declare at least one named port; the synthesizer picks the alphabetically-first port name and uses its number to build the `curl` URL. Containers with no ports declared cannot use HTTP probes — the compiler halts with a `TRANSLATION_ERROR` naming the offending probe.

Probe timeout fields map to compose-style duration strings:

| Workload field | Compose `healthcheck` field |
| --- | --- |
| `periodSeconds` | `interval: <n>s` |
| `timeoutSeconds` | `timeout: <n>s` |
| `failureThreshold` | `retries: <n>` |
| `initialDelaySeconds` | `start_period: <n>s` |

### Volumes

Compose has no Kubernetes-equivalent for ConfigMap, Secret, or per-replica volume templates. Each Workload volume variant degrades to the closest compose primitive:

| Workload volume variant | Compose translation | Loss notes |
| --- | --- | --- |
| `ephemeral` | service-level `tmpfs:` list entry | `sizeLimit` is not preserved (compose tmpfs short-form lacks size) |
| `configmap` | `volumes` long-form bind-mount, read-only | The bind source is the configmap name; the file MUST be emitted by the artifacts pass and reachable on the compose host |
| `secret as: file` | `volumes` long-form bind-mount, read-only | Same caveat as configmap: the secret file must be reachable on the host |
| `secret as: env` | `environment` entry with empty value | Placeholder. Compose has no native env-from-secret primitive; the `compose-bridge` Feature is the future home for secret-resolution at compose runtime |
| `persistent` | named volume + top-level `volumes: { <name>: {} }` declaration | Storage class and size are not preserved (compose has no equivalent shape) |
| `persistentTemplate` | named volume + top-level declaration (same as `persistent`) | Compose has no per-replica volume templating primitive; the per-replica behaviour is silently lost |

### Service exposure

A Workload `services` entry's `type` field decides whether compose publishes ports:

| Workload service type | Compose behaviour |
| --- | --- |
| `ClusterIP` | No `ports:` publishing — the service is reachable only on the compose network |
| `NodePort` | `ports: [<host>:<container>]` publishing |
| `LoadBalancer` | `ports: [<host>:<container>]` publishing (compose has no managed-loadbalancer equivalent; the host-port publish is the closest analogue) |
| `Headless` | No `ports:` publishing |

When multiple services on a single Workload publish overlapping ports, the most-publishing entry wins per port (any `NodePort` or `LoadBalancer` reference triggers publishing).

## Multi-container Workloads

A Workload with multiple containers becomes one main service plus one sidecar service per non-main container. The main container is the one named `main` (when present) or the first container in declaration order. Sidecars share the main service's network namespace via `network_mode: "service:<main>"` — the closest compose primitive to a Kubernetes pod's shared-network model.

Pod-level Workload fields (`scheduling`, `podSecurityContext`, `serviceAccount`) apply only to the main service. Compose's surface is single-host and has no equivalent for `nodeSelector`, `affinity`, `tolerations`, or `topologySpreadConstraints`; those Workload fields are silently dropped on the compose path. Container-level `securityContext` translates partially (`readOnlyRootFilesystem` → `read_only`; `capabilities.add`/`drop` → `cap_add`/`cap_drop`; `runAsUser`/`runAsGroup` → `user`).

## Per-boundary networking

Each compose-targeted boundary in a Release contributes one Docker network. The network name is derived from the `aggrega.ai/namespace` annotation on the alphabetically-first node in the boundary; when no node carries that annotation, the network name falls back to the sanitised boundary path (lowercased, with non-`[a-z0-9._-]` characters replaced by `_`). Every service in a boundary joins its boundary's network; sidecars inherit the network through their `network_mode` reference to the main service.

The merged `docker-compose.yaml` declares one top-level `networks:` entry per boundary. Services from different boundaries can communicate by their service names within compose's default DNS resolution, subject to compose's own cross-network reachability rules.

## `depends_on` inference

The compose provider derives `depends_on` automatically from the IR's `uses` edges. For each edge whose source and target both contribute services to the merged compose file, the provider adds `depends_on: [<target>]` to the source service.

The current emit shape is the **short-form list**: `depends_on: [<service-name>]`. The long-form with `service_healthy` condition gating (which would let the compose runtime block startup until the target's healthcheck reports healthy) is reserved for a future intent — today's emit always has `service_started` semantics regardless of whether the target declares a healthcheck.

`depends_on` entries are emitted in alphabetical target order for output stability. Edges whose source or target are served by a different provider (helm, helm-chart, terraform, cloudformation) are skipped — `depends_on` only applies within the compose-served subset of the Release.

## Sourced mode

A Recipe with `source: <path-to-compose-file>` and `valuesMapping:` runs the following pipeline:

1. The base compose file at `<path>` is read and parsed as YAML.
2. The `valuesMapping` template evaluates against the Recipe's TemplateContext. Its output is treated as a compose overlay document — a partial compose file that augments or overrides fields in the base.
3. Base and overlay are deep-merged using docker-compose's native overlay semantics.

The deep-merge rules:

- **Scalars: overlay wins.** When both base and overlay set the same scalar field, the overlay's value replaces the base's value.
- **Maps: merge recursively.** When both base and overlay set the same map field, the merge recurses into the map. Keys present in both follow the same rules; keys present in only one are preserved as-is.
- **Lists: replace.** When both base and overlay set the same list field, the overlay's list replaces the base's list entirely (no element-wise merging or appending). This matches `docker compose -f base.yaml -f overlay.yaml config` behaviour.

The merged document then flows into the Release-level merge alongside any synthesised-mode contributions, with the same per-boundary networking and `depends_on` inference.

## Release-level output

A Release with multiple compose-targeted boundaries produces **one** `docker-compose.yaml` at the Release output root. The provider collects every boundary's contributing nodes, merges their services, volumes, and networks into a single document, and emits it under `dist/`.

Service-name collisions across boundaries are a `TRANSLATION_ERROR`. When two different nodes (in any combination of boundaries) contribute services with the same name, the compiler halts and the diagnostic names every contributing `(boundary, node)` tuple in alphabetical order. The author resolves the collision by renaming one of the contributors (typically by adjusting the node's identifier so the synthesizer produces a different service name) before the build proceeds.

Top-level volumes union across the Release — name collisions silently merge because the current named-volume shape has no body content to conflict on. Top-level networks are one-per-boundary, named per the derivation rules above; collisions across boundaries (two boundaries with the same `aggrega.ai/namespace`) merge to a single network shared by both.

## What the compose provider does not deliver

- **Cross-boundary L4 routing.** A service in boundary A reaching a service in boundary B by anything other than docker-compose's default DNS requires the `compose-bridge` Feature, which is part of a future intent.
- **Native env-from-secret resolution.** Workload `secrets[as: env]` entries emit environment placeholders rather than runtime-resolved secret references. The `compose-bridge` Feature is the future home for compose-side secret resolution.
- **Compose `deploy:` block.** Replicas, placement constraints, and update strategy under `deploy:` are swarm-mode features; the compose provider targets single-host compose only and does not emit `deploy:` content.
- **Health-condition-gated `depends_on`.** The long-form `{ <target>: { condition: service_healthy } }` shape is reserved for a future intent; today's emit always uses the short-form list with `service_started` semantics.
- **Workload synthesis for terraform / cloudformation.** Workload-mode is supported by helm and compose only; terraform and cloudformation Recipes use sourced mode exclusively.

## Authoring example

A two-service compose deployment with a depends_on edge derived from `uses`:

```yaml
# release.yaml fragment
spec:
  boundaries:
    production:
      annotations:
        aggrega.ai/namespace: prod
      components:
        api: {}
        db: {}
```

```yaml
# api Recipe
apiVersion: aggrega.ai/v1alpha1
kind: Recipe
metadata:
  name: api
  version: 1.0.0
spec:
  provider: compose
  workload: |
    apiVersion: aggrega.ai/v1alpha1
    kind: Workload
    spec:
      containers:
        main:
          image: api:1.0
          ports:
            http: 8080
          health:
            live:
              http: /healthz
      services:
        public:
          type: NodePort
          ports:
            http: 8080
```

```yaml
# Aggregate fragment — api uses db
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
spec:
  components:
    api:
      uses:
        - target: db
    db: {}
```

The compose provider produces a single `docker-compose.yaml` at the Release output root containing:

- `services.api` (the main api service, network `prod`, ports `8080:8080`, healthcheck via `curl`, `depends_on: [db]`)
- `services.db` (the main db service, network `prod`)
- `networks.prod` (the boundary's docker network)

## Related references

- [Workload entity](../entities/workload.md) — the platform-owned Workload kind that the compose provider translates.
- [Provider architecture](architecture.md) — how providers fit into the compilation pipeline.
- [Well-known annotations](well-known-annotations.md) — the `aggrega.ai/*` annotations the compose provider consumes.
- [Provider capability matrix](reference-matrix.md) — per-provider feature support across the current surface.
