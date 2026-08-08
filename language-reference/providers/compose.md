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
| `attachments[as: env]` | `environment` entry with an empty value, and a warning naming the entry (see [What the compose provider does not deliver](#what-the-compose-provider-does-not-deliver)) |
| `attachments[as: file]` | `volumes` long-form bind-mount, read-only |
| `volumeMounts` | the compose primitive the referenced Volume variant maps to — a `volumes` long-form entry, a service-level `tmpfs:` entry, or a service-level `configs:` reference (see [Volumes](#volumes)) |
| `ports` | implicit (compose containers expose ports the image listens on) |
| `restartPolicy: Always` | `restart: unless-stopped` |
| `restartPolicy: OnFailure` | `restart: on-failure` |
| `restartPolicy: Never` | `restart: no` |

### Container resources

A container's `resources` reach compose's `deploy.resources` block, which docker compose honours in non-swarm mode. Kubernetes `requests` express a guaranteed minimum, so they become compose `reservations`; `limits` express a hard cap, so they stay `limits`.

| Workload field | Compose field | Translation |
| --- | --- | --- |
| `resources.requests.cpu` | `deploy.resources.reservations.cpus` | Fractional cores. A millicpu quantity is divided by 1000 (`500m` → `0.5`, `1500m` → `1.5`); a plain core count (`2`, `0.5`) passes through unchanged |
| `resources.limits.cpu` | `deploy.resources.limits.cpus` | Same conversion |
| `resources.requests.memory` | `deploy.resources.reservations.memory` | An exact byte count. An integer mantissa with a binary (`Ki`/`Mi`/`Gi`/`Ti`/`Pi`/`Ei`) or decimal (`k`/`M`/`G`/`T`/`P`/`E`) suffix, or a plain byte integer, converts exactly — `8Gi` becomes `8589934592` |
| `resources.limits.memory` | `deploy.resources.limits.memory` | Same conversion |
| an extended resource key — `nvidia.com/gpu`, `amd.com/gpu`, any `<domain>/<name>` | — | No single-host compose analog. The key is dropped and the build raises an `unsupported-field` warning naming it, one per distinct key however many of `requests` and `limits` carried it |

A quantity compose cannot convert exactly — a fractional memory mantissa, an unknown suffix, a cpu shape that is neither millicpu nor a plain core count — halts the build with a `TRANSLATION_ERROR` naming the quantity, rather than rounding it or emitting a value that means something else.

**A GPU request is the common case of the dropped-key row.** A Workload asking for `nvidia.com/gpu` renders a service carrying no GPU reservation of any kind, and the build names the key it dropped. Pair that with the `runtimeClassName` row in [Pod-level fields](#pod-level-fields): a Workload authored to run on GPU reaches compose as a plain CPU service, and says so twice — once for the resource and once for the runtime.

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

Compose has a config primitive of its own, which is what a `configmap` volume translates to. It has no Kubernetes-equivalent for Secret or per-replica volume templates, so those variants degrade to the closest compose primitive:

| Workload volume variant | Compose translation | Loss notes |
| --- | --- | --- |
| `ephemeral` | service-level `tmpfs:` list entry | `sizeLimit` is not preserved (compose tmpfs short-form lacks size) |
| `configmap` | service-level `configs:` reference naming the configmap, mounted at the volume mount's path | 🔴 **The mount path is the path of a single file, not of a directory.** Compose writes the config's content to exactly the target path, where a Kubernetes target mounting a ConfigMap at a path produces a *directory* holding one file per key. So the same authored `path:` denotes a file here and a directory there: point a `configmap` volume's mount at the filename the container should read (`/seed/config.json`), not at the directory that would contain it, and a Recipe authored for both targets carries a different path per target. Nothing in the build can catch a path written for the other target's shape — the path is an opaque string the compiler pipes through, and the emitted output is valid either way. The reference is by **name**, exactly as a Kubernetes target references a ConfigMap resource — nothing reads the config's content. The matching top-level `configs:` entry comes from the Recipe's `artifacts:` input, whose compose fragment declares it with inline `content:`; a reference with no such entry halts the build (see [Artifacts-emitted compose fragments](#artifacts-emitted-compose-fragments)). A `configs:` reference carries the config name and the mount path and nothing else, so the mount's `readOnly` has no separate expression |
| `secret as: file` | `volumes` long-form bind-mount, read-only | A secret volume deliberately does **not** follow the `configmap` translation: an inline `configs:` entry would write the secret's value into the emitted compose file in plaintext, and the compiler never resolves a secret into plaintext — a secret stays a pointer through every stage of the build. The bind source is the secret's `source` name, resolved as a path the operator makes reachable on the compose host independently of the build |
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

### Pod-level fields

Pod-level Workload fields apply to the main service only — sidecars share the main service's network namespace and pod-level identity, and an [init service](#init-containers) follows the same rule.

Several map onto a compose service field:

| Workload field | Compose field |
| --- | --- |
| `podSecurityContext.runAsUser` / `runAsGroup` | `user` — a container-level `securityContext.runAsUser` wins over it |
| `terminationGracePeriodSeconds` | `stop_grace_period: <n>s` |
| `dnsConfig.nameservers` / `dnsConfig.searches` | `dns` / `dns_search` |
| `hostAliases` | one `extra_hosts` entry per hostname, in author order |

The rest have no single-host equivalent. **None is dropped in silence:** each authored one raises an `unsupported-field` warning naming the field, so an author learns which setting the target could not honour rather than discovering it from the running stack.

| Workload field | Why compose cannot honour it |
| --- | --- |
| `scheduling` | Placement — `nodeSelector`, `affinity`, `tolerations`, `topologySpreadConstraints` — presumes a scheduler choosing among nodes. Compose runs on one host |
| `replicas` | Compose's own replica count lives under `deploy:` and is a swarm-mode feature |
| `runtimeClassName` | Selecting an alternative container runtime — a GPU-enabled one, for example — has no compose expression |
| `priorityClassName` | Preemption ordering presumes a scheduler |
| `serviceAccount` | Workload identity is a cluster concept |
| `imagePullSecrets` | Registry credentials on a compose host are the host's own login state, not a field of the file |
| `dnsPolicy`, `dnsConfig.options` | Compose exposes `dns` and `dns_search` and nothing finer |

Container-level `securityContext` translates partially: `readOnlyRootFilesystem` → `read_only`, `capabilities.add` / `drop` → `cap_add` / `cap_drop`, `runAsUser` / `runAsGroup` → `user`. `runAsNonRoot` has no compose expression and raises the same `unsupported-field` warning.

Every warning in this section is advisory and out-of-band: the build succeeds, and the emitted file is byte-for-byte what it would be without it. `--no-unsupported-field-warnings` silences the class.

## Init containers

A Workload's `initContainers` entries become services of their own, using compose's run-to-completion idiom. Each entry adds one service named `<component>-<container-name>`, on the same naming shape sidecars use; an entry that omits `name` takes the positional `init-<index>` name the [Workload reference](../entities/workload.md) documents.

The ordering the authoring contract promises — the init containers run to completion in the order they are written, and every other container starts only after all of them have finished — is expressed with `depends_on`'s long form:

- Each init service after the first waits on its predecessor with `condition: service_completed_successfully`.
- The main service, and every sidecar service, waits on the **last** init service with the same condition. Waiting on the last one is sufficient because the init services form a chain.
- Each init service carries `restart: "no"`. An init service runs once; a service that came back up would never reach the completed state its dependents are waiting on, so a `restartPolicy` authored on an init container does not change this.

```yaml
services:
  platform:
    image: platform:1.0
    depends_on:
      platform-verify-seed:
        condition: service_completed_successfully
  platform-import-seed:
    image: platform:1.0
    restart: "no"
  platform-verify-seed:
    image: platform:1.0
    depends_on:
      platform-import-seed:
        condition: service_completed_successfully
    restart: "no"
```

An init container is translated exactly as any other container: its `image` (including the registry rewrite an `aggrega.ai/image-registry` annotation applies), `command`, `args`, `variables`, `attachments`, `volumeMounts`, and `securityContext` all reach the init service. That is what makes the configuration an init container carries — most often a file it mounts and writes into a volume the main container also mounts — survive onto the compose target rather than being lost with the container. A shape compose cannot express fails the same way for an init container as for an ordinary one: a declared `lifecycle` or `envFrom` halts with a `TRANSLATION_ERROR` naming the init container it came from.

Two differences from the main service follow from an init service being a non-main service:

- **Pod-level Workload fields are not applied**, the same rule sidecars follow.
- **An init service joins its boundary's network directly** rather than sharing the main service's network namespace the way a sidecar does. It has to: the main service waits on the init service, and sharing a namespace is itself a dependency on the main service, which would close the wait into a cycle compose refuses to start. An init container therefore reaches other services on the boundary network by service name, but it does not share the main service's `localhost`.

Init services and sidecar services share one name namespace, so an `initContainers` entry and a `containers` entry may not carry the same name. When they do, the compiler halts with a `TRANSLATION_ERROR` naming the node, the container name, and the service name both wanted, rather than letting one service quietly replace the other.

Emitting the completion condition raises no minimum Compose version. `condition` and its values belong to the base Compose Specification — unlike the `restart` and `required` fields alongside them in the same long-form block, which the specification ties to particular Compose releases. The highest version the compose provider asks for remains the **≥ 2.23.1** that inline `configs.content` needs. That floor reaches any compose output carrying a config with inline `content:`, which is how the file behind a `configmap` volume and the config behind a bridged cross-network edge both arrive — not one authoring path.

## Per-boundary networking

Each compose-contributing boundary contributes one Docker network. The network name is derived from the `aggrega.ai/namespace` annotation on the alphabetically-first node in the boundary; when no node carries that annotation, the network name falls back to the sanitised boundary path (lowercased, with non-`[a-z0-9._-]` characters replaced by `_`). Every service in a boundary joins its boundary's network; sidecars inherit the network through their `network_mode` reference to the main service.

When two boundaries collapse into one assembly path (shared `directory:`), the merged `docker-compose.yaml` declares one top-level `networks:` entry per contributing boundary. Services from different boundaries within the same compose file can communicate by their service names within compose's default DNS resolution, subject to compose's own cross-network reachability rules. Cross-network L4 routing within a single compose file is what the `compose-bridge` Feature enables: attached at the common-ancestor boundary, it derives a gateway from the boundary's cross-network `uses` edges — generating an `aggrega-gw` service whose nginx `stream` config proxies each bridged edge (one `server` block per edge, on the target's port with a `portBase` collision fallback) and rewriting each consumer's host env var to `aggrega-gw:<port>`. The compiler generates that config and delivers it as a **mounted compose config** — a top-level `configs:` entry with inline `content:`, referenced from the gateway and mounted at `/etc/nginx/nginx.conf`; it is not an operator-mounted concern. The `stream` config carries a `resolver` directive and proxies through a per-edge variable (`set $uN <host>; proxy_pass $uN`) so each upstream resolves at connection time rather than once at startup — a bare `proxy_pass` to a not-yet-running target would otherwise fail the gateway at boot. (The `$` in those variables is escaped to `$$` inside `configs.content` so Docker Compose's own `$`-interpolation leaves a literal `$` for nginx.) Inline `configs.content` requires Docker Compose **≥ 2.23.1**. See the [compose-bridge proof case](../entities/featurerecipe.md#compose-bridge-proof-case).

## `depends_on` inference

The compose provider derives `depends_on` automatically from the IR's `uses` edges. For each edge whose source and target both contribute services to the merged compose file, the provider adds `depends_on: [<target>]` to the source service.

Edge-derived entries are emitted **ungated**: they have `service_started` semantics regardless of whether the target declares a healthcheck. Gating them on the target's health — which would let the compose runtime block startup until the target's healthcheck reports healthy — is expressible but is not what a `uses` edge currently means.

Edge-derived entries are emitted in alphabetical target order for output stability. Edges whose source or target are served by a different provider (helm or helm-chart) are skipped — `depends_on` only applies within the compose-served subset of the Release.

A service's `depends_on` emits in one of compose's two forms, never a mix, because compose requires a condition on every entry of the long form:

- **Short-form list** (`depends_on: [<service-name>]`) when no entry on that service carries a condition. That is every service whose only dependencies come from `uses` edges.
- **Long-form mapping** when any entry carries one — which happens when the service also waits on an [init container](#init-containers). There, the edge-derived entries emit the explicit `condition: service_started`, which the Compose Specification defines as the short form's equivalent, so their meaning is unchanged.

Within a service the two sources keep their own order and do not interleave: the init-chain wait, whose order is the order the author wrote the list in, is emitted first, and the alphabetically-ordered edge-derived entries follow.

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

Each compose assembly path produces one `docker-compose.yaml`. Boundaries that evaluate to distinct paths produce distinct compose files; boundaries that share an evaluated path produce one merged compose file containing every contributor at that path. The path is the boundary's `directory:` joined with the per-component `subDirectory:` (which defaults to `{{ .capability }}` so compose contributors land under a `compose/` subfolder by default).

Service-name collisions within a single assembly path raise `INSTANCE_ID_COLLISION`. When two different nodes contribute services with the same instance ID at the same `(path, provider)` tuple, the compiler halts and the diagnostic names every contributing `(boundary, node)` tuple in alphabetical order. The author resolves the collision by renaming one of the contributors (typically by adjusting the node's identifier so the synthesizer produces a different service name), or by routing the contributors to distinct paths via different `directory:` declarations.

Top-level volumes union within an assembly path — name collisions silently merge because the current named-volume shape has no body content to conflict on. Top-level networks are one-per-contributing-boundary, named per the derivation rules above; two contributing boundaries with the same `aggrega.ai/namespace` annotation merge to a single network shared by both.

### Artifacts-emitted compose fragments

When a Recipe's `artifacts:` block evaluates to compose YAML — a fragment carrying its own `services:`, `volumes:`, `configs:`, or `networks:` blocks (each entry inline or per-entry `$import:`-loaded) — the merge into the per-`(path, provider)` assembly follows shape-specific rules:

- **`services:` from artifacts merge into the assembled compose file alongside per-component services.** A service name contributed by two different components at the same assembly path halts, and the diagnostic names every contributor. A collision *within a single component* — between that component's own artifact fragment and the services synthesised for it — is not detected, and the later contribution replaces the earlier one, so keep an artifact-authored service name distinct from the `<component>` and `<component>-<container-name>` names the synthesiser produces.
- **`volumes:` from artifacts merge into the top-level `volumes:` block.** Name collisions silently merge, matching the same rule as per-component volumes.
- **`configs:` from artifacts merge into the top-level `configs:` block.** This is how the file behind a `configmap` volume reaches the assembly: the volume becomes a service-level `configs:` reference naming the configmap, and the artifact fragment declares an entry of that name with inline `content:`. Once the assembly path's fragments are unioned, every service-level reference must resolve to a declared entry, or the build halts with `TRANSLATION_ERROR` naming each unresolved reference — the service, the config name, and the mount path. The check runs over the completed union rather than per component, so one component may reference a config another component at the same assembly path declares.
- **`networks:` from artifacts are NOT merged into the assembled compose file.** The compose provider derives networks from boundary annotations (one network per contributing boundary, named per the derivation rules above); artifact-supplied network declarations are silently dropped at the assembler boundary. Authors who need cross-network routing within a single compose file should use the `compose-bridge` Feature rather than authoring custom network entries via artifacts.

The asymmetry is structural: `services:`, `volumes:` and `configs:` carry per-Recipe content the assembler accumulates into the assembled file; `networks:` is per-boundary infrastructure the assembler derives from boundary state. Artifacts can extend the former; only boundary annotations can shape the latter.

## What the compose provider does not deliver

- **Cross-network L4 routing within one compose file.** A service in network A reaching a service in network B by anything other than docker-compose's default DNS requires the `compose-bridge` Feature.
- **Cross-compose-file routing.** Boundaries that evaluate to distinct assembly paths produce distinct `docker-compose.yaml` files; the compose runtime treats them as independent projects. Cross-file communication is the operator's concern (publishing host ports, sharing external networks, or coalescing the boundaries onto one path via a shared `directory:`).
- **Sourcing an environment variable from an attachment.** Compose has no primitive for it, so a Workload `attachments` entry with `as: env` emits the variable name with an empty value rather than a runtime-resolved reference. The placeholder is deliberate — a variable that is present but empty is visible to whoever debugs the container, where an absent one leaves nothing to look at — and the build says so rather than leaving it to be discovered: each such entry raises an `unsupported-field` warning naming the entry at its authored coordinate (`containers.<name>.attachments.<KEY>`, or `initContainers[<i>].attachments.<KEY>`), so the author knows which variable arrives empty and which container it belongs to. The warning is advisory: the build succeeds, and the rendered file is byte-for-byte what it would be without it. `--no-unsupported-field-warnings` silences the class. An `attachments` entry with `as: file` is unaffected — compose bind-mounts it, and no warning is raised. The `compose-bridge` Feature is the future home for compose-side secret resolution.
- **Swarm-mode `deploy:` content.** Replicas, placement constraints, and update strategy under `deploy:` are swarm-mode features, and the compose provider targets single-host compose only, so it emits none of them. It does emit `deploy.resources` — the reservations and limits a container's `resources` map to, which docker compose honours in non-swarm mode (see [Container resources](#container-resources)).
- **Health-condition-gated `depends_on`.** A dependency derived from a `uses` edge is emitted ungated, with `service_started` semantics; it is not gated on the target's healthcheck reporting healthy. The long form itself is emitted — an [init container](#init-containers) wait uses it — so this is about what a `uses` edge means, not about a shape the provider cannot produce.

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

The compose provider produces one `docker-compose.yaml` at the boundary's evaluated path (default `dist/production/compose/docker-compose.yaml` because `subDirectory:` defaults to `{{ .capability }}`) containing:

- `services.api` (the main api service, network `prod`, ports `8080:8080`, healthcheck via `curl`, `depends_on: [db]`)
- `services.db` (the main db service, network `prod`)
- `networks.prod` (the boundary's docker network)

## Related references

- [Workload entity](../entities/workload.md) — the platform-owned Workload kind that the compose provider translates.
- [Provider architecture](architecture.md) — how providers fit into the compilation pipeline.
- [Well-known annotations](well-known-annotations.md) — the `aggrega.ai/*` annotations the compose provider consumes.
- [Provider capability matrix](reference-matrix.md) — per-provider feature support across the current surface.
