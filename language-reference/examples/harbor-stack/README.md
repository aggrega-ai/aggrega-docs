# Harbor stack — a container registry composed as a module

This example compiles a small, real stack — a **container registry** — to
synthesized Kubernetes manifests from one Developer-authored `Aggregate`.

The registry is not a single component. It is a **module**: a reusable
sub-aggregate that composes six single-workload components —

- a **core**, the API and token-service control plane;
- a **distribution registry**, the OCI blob store that physically holds image
  layers and manifests;
- a **portal**, the static web UI;
- a **job service**, the asynchronous worker tier;
- a **PostgreSQL backend**, which holds the core's relational state; and
- a **Redis-compatible cache**, shared by the core, the registry, and the job
  service.

The module wires its own internal edges among these components and exports the
core as its public endpoint `registry` and the portal as `ui`. The top-level
Aggregate imports the module by name and renders the composed stack; the
operator sizes the module's internal components in the Release.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: imports the container-registry module (`core/harbor`). |
| `manifest-helm-synth.yaml` | Maps each Harbor component type and the two datastore types to their synth helm Recipes. |
| `release-helm-synth.yaml` | Operator record for the Kubernetes target. Sizes the module's internal components by their module-scoped IDs; anything left to schema defaults renders self-contained. |

## What it demonstrates

- **Composition as a module.** A multi-workload capability — a registry that is
  really a control plane, a blob store, a UI, a worker tier, a database, and a
  cache — is packaged as a sub-aggregate composing six single-workload
  components, not as one monolithic component. The module is imported by name
  and reused wherever a registry is needed.
- **Internal edges inside the module.** The core declares uses of the backend,
  the cache, the registry, the job service, and the portal; the registry and
  the job service declare uses of the cache; and the job service declares a use
  of the core. Each target Recipe's `provides` host and port (and, for the
  backend, its user and database) are piped into the consumer and composed into
  connection strings and service URLs. The compiler routes the strings without
  interpreting them.
- **Per-connection configuration on an edge.** The core, the registry, and the
  job service share one cache, and each keeps its keys in a distinct Redis
  logical database. The index is a property of neither component but of the
  connection between them, so each of the three edges carries its own `values`
  block naming it.
- **File configuration delivered as mounted ConfigMaps.** The core, the
  registry, the portal, and the job service each read a configuration file from
  a ConfigMap the Recipe emits and mounts whole-directory — the core's beego
  config and keys at `/etc/core`, the registry's `config.yml` and htpasswd at
  `/etc/registry`, the portal's self-contained `nginx.conf` at `/etc/nginx`, and
  the job service's `config.yml` at `/etc/jobservice`.
- **A single token issuer.** The core holds the RSA signing key and issues and
  validates the tokens the registry trusts. The registry's own authentication
  is HTTP basic against a bundled htpasswd file, and the core basic-authenticates
  to it with the shared registry credential.
- **Public endpoints.** The module exports the core as `registry` and the portal
  as `ui`, the stable public names a consumer connects to — decoupled from the
  module's internal component names.
- **Operator sizing of internal components.** The Release addresses the module's
  internal components by their module-scoped IDs (`harbor.core`, `harbor.db`) to
  set compute, without the developer's Aggregate restating physical sizing.
- **Shared credentials.** The core, the registry, and the job service
  authenticate to each other and to the database, so they share one set of
  pinned development credentials. This example uses shared inline development
  defaults, so the stack runs self-contained with no external secret. A
  production deployment overrides them.
- **Reproducible images.** Every component pins an explicit image tag, so the
  rendered manifests reference stable images.

## Build

The workspace catalog supplies the standard-library entities, so no explicit
catalog flag is needed:

```sh
aggrega build --release release-helm-synth.yaml
```

Rendered artifacts land under `dist/`. The Kubernetes target renders plain
manifests offline — no chart pull is required.

## What the composed stack looks like

The core renders as a stateless Deployment plus a ClusterIP Service on the API
port. Its Pod carries the connection composed from its edges — the backend's
in-cluster Service name, user, and database, and the in-cluster names of the
registry, the job service, and the portal:

```yaml
env:
  - name: POSTGRESQL_HOST
    value: harbor.db-default
  [… omitted: the backend's port]
  - name: POSTGRESQL_USERNAME
    value: harbor
  - name: POSTGRESQL_DATABASE
    value: registry
  [… omitted: the backend's SSL mode, and the cache's host and port]
  - name: HARBOR_REGISTRY_HOST
    value: harbor.registry-default
  [… omitted: the registry's port, and the job service's and portal's hosts and ports]
  - name: _REDIS_URL_CORE
    value: redis://harbor.cache-default:6379/0
```

The distribution registry renders as a StatefulSet with a persistent blob
volume mounted at `/storage`, plus a ClusterIP Service and a headless Service.
The PostgreSQL backend renders as a StatefulSet with a persistent volume; the
portal and the job service render as stateless Deployments, the job service
with a scratch log volume.

## Per-connection configuration: three services, one cache

The core, the distribution registry, and the job service all connect to the
single Redis-compatible cache. Each keeps its keys in a distinct Redis logical
database, so the three share one cache without their keyspaces colliding.

The database index belongs to neither end on its own. The cache is one component
with one set of values, so a value declared there would be a single answer for
all three consumers. A value declared on each consumer would describe the
consumer rather than the connection, and would have nothing to say if a consumer
wired a second cache. What varies here is the connection — and a `uses` edge is
where a connection is configured.

That is the distinction between the two `values` blocks an author writes. A
component's `values` block configures the component: what it is, whatever it
connects to. An edge's `values` block configures one connection: what this
consumer asks of this target, on this edge alone. Because there is one block per
edge, three edges express three answers. The job service's edge carries two:

```yaml
    jobservice:
      type: core/devtool/harbor-jobservice
      uses:
        cache:
          redis:
            target: cache
            values:
              db_index: 2
              key_namespace: harbor_job_service_namespace
            inject:
              env:
                - { in: HARBOR_REDIS_HOST, from: host }
                - { in: HARBOR_REDIS_PORT, from: port }
```

The core and the registry each carry a `values` block on their own `cache` edge
too, naming `db_index: 0` and `db_index: 1`. Each consuming component declares
its `cache` socket with a per-edge contract for `db_index` — an integer from 0
to 15 — so every edge's value is checked against that contract when the stack is
compiled. An index outside the range halts the build, naming the edge that
carries it.

Each consumer's Recipe reads its own edge's value and composes it into the
configuration that consumer emits, so the three rendered artifacts name three
different databases:

`dist/app/helm/harbor.core-deployment.yaml`

```yaml
            - name: _REDIS_URL_CORE
              value: redis://harbor.cache-default:6379/0
```

`dist/app/helm/harbor-registry-config.yaml`

```yaml
    redis:
      addr: "harbor.cache-default:6379"
      db: 1
```

`dist/app/helm/harbor-jobservice-config.yaml`

```yaml
      redis_pool:
        redis_url: "redis://harbor.cache-default:6379/2"
        namespace: "harbor_job_service_namespace"
```

The host and port in each of these arrive from the cache's `provides` over the
same edge; the database index and the key namespace come from that edge's own
`values` block. The compiler composes neither string — each Recipe assembles the
form its own component expects, and the compiler routes the parts without
interpreting them.

**Per-connection configuration reaches only the consumer that authored it.** An
edge's `values` block lands in the render context of the component at the
consuming end, never the target's. The cache's own artifacts —
`harbor.cache-deployment.yaml` and `harbor.cache-default-service.yaml` — carry no
trace of any of it, and stay byte-for-byte identical whatever the three services
ask for: move all three indices and the cache's manifests do not change, while
each consumer's configuration follows its own edge. A shared target renders
identically regardless of its consumers, which is what makes it safe to share.

The per-edge contract a socket declares — `valueSchema` for the developer's
`values` and `infraSchema` for the operator's `infra` — is specified in
[entities/component.md](../../entities/component.md) "Per-edge connection
contracts".

## What this module does not include

This module is the working-registry core. Several Harbor subsystems are
deliberately out of scope: the registry controller and scheduled
garbage-collection, vulnerability scanning, and the metrics exporter. Garbage
collection is therefore a documented non-function here. The module also ships no
internal reverse proxy; a single external endpoint is assembled at the ingress
tier, which routes the browser path `/` to the portal and the registry and API
paths (`/v2/`, `/api/`, `/service/`, `/c/`) to the core.
