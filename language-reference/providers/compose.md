# Compose Provider

The compose provider renders Aggrega Recipes into a Docker Compose file. The provider assembles per-`(path, provider)`: every boundary's compose contributors are routed to the assembler keyed on the boundary's evaluated `directory:` joined with the per-component `subDirectory:`, and that assembler emits one `docker-compose.yaml` containing every contributor at that path. Two sibling boundaries that evaluate to the same path collapse into a single merged compose file — the canonical example is a parent boundary plus two child boundaries with `directory: "{{ .parent_boundary.directory }}"` (the [compose-bridge proof case](../entities/featurerecipe.md#compose-bridge-proof-case)).

## Supported input kinds

The compose provider accepts two of the three Recipe input kinds:

- **Sourced mode.** A Recipe with `source:` pointing at an existing compose file plus `valuesMapping:` producing an overlay document. The base compose file is loaded, the overlay is evaluated, and the two are deep-merged per docker-compose's native overlay semantics.
- **Workload mode.** A Recipe with `workload:` (inline or `$import:`-loaded) declares a `Workload` document. The provider synthesises one or more compose services from the Workload spec.

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
| `persistentTemplate` | named volume + top-level declaration (same as `persistent`) | Companion of `form: stateful`; compose has no per-replica volume templating primitive, so the per-replica behaviour is lost |

### Controller form

The Workload's `form` selects an abstract controller shape (see [entities/workload.md](../entities/workload.md)). Compose renders `stateless` and `stateful` (and the empty default, treated as `stateless`) as long-running services; the `stateful` form adds the named volume for a `persistentTemplate` companion. The `daemon`, `scheduled`, and `task` forms have no clean single-host compose mapping, so a Workload declaring one of them targeting a compose boundary halts with a `TRANSLATION_ERROR` naming the form and the supported set — compose does not degrade an unsupported form into a plain service that misrepresents the intent.

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

Each compose-contributing boundary contributes one Docker network. The network name is derived from the `aggrega.ai/namespace` annotation on the alphabetically-first node in the boundary; when no node carries that annotation, the network name falls back to the sanitised boundary path (lowercased, with non-`[a-z0-9._-]` characters replaced by `_`). Every service in a boundary joins its boundary's network; sidecars inherit the network through their `network_mode` reference to the main service.

When two boundaries collapse into one assembly path (shared `directory:`), the merged `docker-compose.yaml` declares one top-level `networks:` entry per contributing boundary. Services from different boundaries within the same compose file can communicate by their service names within compose's default DNS resolution, subject to compose's own cross-network reachability rules. Cross-network L4 routing within a single compose file is what the `compose-bridge` Feature enables: attached at the common-ancestor boundary, it derives a gateway from the boundary's cross-network `uses` edges — generating an `aggrega-gw` service whose nginx `stream` config proxies each bridged edge (one `server` block per edge, on the target's port with a `portBase` collision fallback) and rewriting each consumer's host env var to `aggrega-gw:<port>`. The compiler generates that config and delivers it as a **mounted compose config** — a top-level `configs:` entry with inline `content:`, referenced from the gateway and mounted at `/etc/nginx/nginx.conf`; it is not an operator-mounted concern. The `stream` config carries a `resolver` directive and proxies through a per-edge variable (`set $uN <host>; proxy_pass $uN`) so each upstream resolves at connection time rather than once at startup — a bare `proxy_pass` to a not-yet-running target would otherwise fail the gateway at boot. (The `$` in those variables is escaped to `$$` inside `configs.content` so Docker Compose's own `$`-interpolation leaves a literal `$` for nginx.) Inline `configs.content` requires Docker Compose **≥ 2.23.1**. See the [compose-bridge proof case](../entities/featurerecipe.md#compose-bridge-proof-case).

## `depends_on` inference

The compose provider derives `depends_on` automatically from the IR's `uses` edges. For each edge whose source and target both contribute services to the merged compose file, the provider adds `depends_on: [<target>]` to the source service.

The current emit shape is the **short-form list**: `depends_on: [<service-name>]`. The long-form with `service_healthy` condition gating (which would let the compose runtime block startup until the target's healthcheck reports healthy) is planned for a future iteration — today's emit always has `service_started` semantics regardless of whether the target declares a healthcheck.

`depends_on` entries are emitted in alphabetical target order for output stability. Edges whose source or target are served by a different provider (helm or helm-chart) are skipped — `depends_on` only applies within the compose-served subset of the Release.

## Sourced mode

The compose engine accepts `source:` as a **bare filesystem path string only**. The path is interpreted relative to the compile invocation's working directory and must point at a docker-compose YAML file that the provider can read and parse.

```yaml
spec:
  capability: compose
  source: ./docker-compose.base.yaml     # filesystem path to the base compose file
  valuesMapping: |
    services:
      api:
        image: "{{ .values.image }}"
```

Structured source objects (e.g. `source: { repo: ..., chart: ..., version: ... }`) are reserved for a future registry-integration intent and are rejected today. A Recipe targeting a remote compose fragment must vendor it locally and point `source:` at the vendored copy.

A Recipe with `source: <path-to-compose-file>` and `valuesMapping:` runs the following pipeline:

1. The base compose file at `<path>` is read and parsed as YAML.
2. The `valuesMapping` template evaluates against the Recipe's TemplateContext. Its output is treated as a compose overlay document — a partial compose file that augments or overrides fields in the base.
3. Base and overlay are deep-merged using docker-compose's native overlay semantics.

The deep-merge rules:

- **Scalars: overlay wins.** When both base and overlay set the same scalar field, the overlay's value replaces the base's value.
- **Maps: merge recursively.** When both base and overlay set the same map field, the merge recurses into the map. Keys present in both follow the same rules; keys present in only one are preserved as-is.
- **Lists: replace.** When both base and overlay set the same list field, the overlay's list replaces the base's list entirely (no element-wise merging or appending). This matches `docker compose -f base.yaml -f overlay.yaml config` behaviour.

The merged document then flows into the Release-level merge alongside any synthesised-mode contributions, with the same per-boundary networking and `depends_on` inference.

## Per-`(path, provider)` output

Each compose assembly path produces one `docker-compose.yaml`. Boundaries that evaluate to distinct paths produce distinct compose files; boundaries that share an evaluated path produce one merged compose file containing every contributor at that path. The path is the boundary's `directory:` joined with the per-component `subDirectory:` (which defaults to `{{ .provider }}` so compose contributors land under a `compose/` subfolder by default).

Service-name collisions within a single assembly path raise `INSTANCE_ID_COLLISION`. When two different nodes contribute services with the same instance ID at the same `(path, provider)` tuple, the compiler halts and the diagnostic names every contributing `(boundary, node)` tuple in alphabetical order. The author resolves the collision by renaming one of the contributors (typically by adjusting the node's identifier so the synthesizer produces a different service name), or by routing the contributors to distinct paths via different `directory:` declarations.

Top-level volumes union within an assembly path — name collisions silently merge because the current named-volume shape has no body content to conflict on. Top-level networks are one-per-contributing-boundary, named per the derivation rules above; two contributing boundaries with the same `aggrega.ai/namespace` annotation merge to a single network shared by both.

### Artifacts-emitted compose fragments

When a Recipe's `artifacts:` block evaluates to compose YAML — a fragment carrying its own `services:`, `volumes:`, or `networks:` blocks (each entry inline or per-entry `$import:`-loaded) — the merge into the per-`(path, provider)` assembly follows shape-specific rules:

- **`services:` from artifacts merge into the assembled compose file alongside per-component services.** Service-name collisions across the artifact fragments and the per-component contributions raise `INSTANCE_ID_COLLISION`; the diagnostic names every contributor.
- **`volumes:` from artifacts merge into the top-level `volumes:` block.** Name collisions silently merge, matching the same rule as per-component volumes.
- **`networks:` from artifacts are NOT merged into the assembled compose file.** The compose provider derives networks from boundary annotations (one network per contributing boundary, named per the derivation rules above); artifact-supplied network declarations are silently dropped at the assembler boundary. Authors who need cross-network routing within a single compose file should use the `compose-bridge` Feature rather than authoring custom network entries via artifacts.

The asymmetry is structural: `services:` and `volumes:` carry per-Recipe content the assembler accumulates into the assembled file; `networks:` is per-boundary infrastructure the assembler derives from boundary state. Artifacts can extend the former; only boundary annotations can shape the latter.

## What the compose provider does not deliver

- **Cross-network L4 routing within one compose file.** A service in network A reaching a service in network B by anything other than docker-compose's default DNS requires the `compose-bridge` Feature.
- **Cross-compose-file routing.** Boundaries that evaluate to distinct assembly paths produce distinct `docker-compose.yaml` files; the compose runtime treats them as independent projects. Cross-file communication is the operator's concern (publishing host ports, sharing external networks, or coalescing the boundaries onto one path via a shared `directory:`).
- **Native env-from-secret resolution.** Workload `secrets[as: env]` entries emit environment placeholders rather than runtime-resolved secret references. The `compose-bridge` Feature is the future home for compose-side secret resolution.
- **Compose `deploy:` block.** Replicas, placement constraints, and update strategy under `deploy:` are swarm-mode features; the compose provider targets single-host compose only and does not emit `deploy:` content.
- **Health-condition-gated `depends_on`.** The long-form `{ <target>: { condition: service_healthy } }` shape is planned for a future iteration; today's emit always uses the short-form list with `service_started` semantics.

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
  capability: compose
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

The compose provider produces one `docker-compose.yaml` at the boundary's evaluated path (default `dist/production/compose/docker-compose.yaml` because `subDirectory:` defaults to `{{ .provider }}`) containing:

- `services.api` (the main api service, network `prod`, ports `8080:8080`, healthcheck via `curl`, `depends_on: [db]`)
- `services.db` (the main db service, network `prod`)
- `networks.prod` (the boundary's docker network)

## Related references

- [Workload entity](../entities/workload.md) — the platform-owned Workload kind that the compose provider translates.
- [Provider architecture](architecture.md) — how providers fit into the compilation pipeline.
- [Well-known annotations](well-known-annotations.md) — the `aggrega.ai/*` annotations the compose provider consumes.
- [Provider capability matrix](reference-matrix.md) — per-provider feature support across the current surface.
