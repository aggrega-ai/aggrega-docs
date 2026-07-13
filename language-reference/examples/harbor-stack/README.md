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
  - name: POSTGRESQL_USERNAME
    value: harbor
  - name: POSTGRESQL_DATABASE
    value: registry
  - name: HARBOR_REGISTRY_HOST
    value: harbor.registry-default
  - name: _REDIS_URL_CORE
    value: redis://harbor.cache-default:6379/0
```

The distribution registry renders as a StatefulSet with a persistent blob
volume mounted at `/storage`, plus a ClusterIP Service and a headless Service.
The PostgreSQL backend renders as a StatefulSet with a persistent volume; the
portal and the job service render as stateless Deployments, the job service
with a scratch log volume.

## What this module does not include

This module is the working-registry core. Several Harbor subsystems are
deliberately out of scope: the registry controller and scheduled
garbage-collection, vulnerability scanning, and the metrics exporter. Garbage
collection is therefore a documented non-function here. The module also ships no
internal reverse proxy; a single external endpoint is assembled at the ingress
tier, which routes the browser path `/` to the portal and the registry and API
paths (`/v2/`, `/api/`, `/service/`, `/c/`) to the core.
