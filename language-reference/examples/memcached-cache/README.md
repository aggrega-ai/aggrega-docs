# Memcached — one Aggregate, two targets, optional authentication

This lean example compiles a single **Memcached** in-memory cache from one
Developer-authored `Aggregate` to two deployment targets:

- **Docker Compose** for local development, and
- the **Bitnami Memcached Helm chart** for Kubernetes.

The same `aggregate.yaml` drives both. Only the Recipe layer selected by the
Manifest changes per target. A second Aggregate, `aggregate-auth.yaml`, shows
the same cache with an optional password credential attached.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: one `cache` component of type `core/datastore/memcached`, no credential — the cache runs without authentication. |
| `aggregate-auth.yaml` | The same cache with a password credential attached to the component's optional `password` slot. |
| `manifest-compose.yaml` | Maps the Memcached type to the Compose Recipe (`memcached`) and the credential to `dotenv-secret`. |
| `manifest-bitnami.yaml` | Maps the Memcached type to the Bitnami chart-wrap Recipe (`memcached-bitnami`) and the credential to `env-secret`. |
| `release-compose.yaml` / `release-bitnami.yaml` | Operator records for the two targets, no authentication. |
| `release-compose-auth.yaml` / `release-bitnami-auth.yaml` | Operator records that deploy `aggregate-auth.yaml`, enabling authentication. |

## What it demonstrates

- **One authoring surface, many targets.** A single Aggregate is the source of
  truth for *what* the stack is. Each Manifest says *how* to realize it.
- **A stateless datastore.** Memcached holds entries in memory and stores
  nothing durably, so the component is typed as a plain `server` rather than a
  `stateful-server`. On Kubernetes the chart renders a **Deployment**, not a
  StatefulSet, and requests no persistent volume; on Compose the service
  declares no data volume.
- **Chart wrapping (Kubernetes).** The Bitnami target sources the upstream
  Memcached chart by OCI reference and maps the component's `values` and `infra`
  onto the chart's own value structure — `architecture: standalone`,
  `containerPorts.memcached`, `service.ports.memcached`, and `resources`.
- **Optional authentication via a credential slot.** The component declares one
  optional `password` slot in its `secretsSchema`. When no credential is
  attached (the base Aggregate), the Recipe renders the cache with
  authentication disabled — byte-identically to a Recipe with no slot. When a
  credential is attached (`aggregate-auth.yaml`), the injected value enables the
  chart's SASL authentication on Kubernetes (the chart provisions its own Secret
  from the supplied password) and surfaces as `MEMCACHED_USERNAME` /
  `MEMCACHED_PASSWORD` environment variables on Compose.

## Build

The workspace catalog supplies the standard-library entities, so no explicit
catalog flag is needed:

```sh
# Local development (Docker Compose), no authentication
aggrega build --release release-compose.yaml

# Kubernetes (Bitnami Memcached Helm chart), no authentication
aggrega build --release release-bitnami.yaml

# The same targets with authentication enabled
aggrega build --release release-compose-auth.yaml
aggrega build --release release-bitnami-auth.yaml
```

Rendered artifacts land under `dist/`. The Kubernetes build resolves the
upstream chart by OCI reference on first run and pins it in a lockfile.

## Credential delivery note

On both targets the credential is an inject-value secret: its value is delivered
on the component's environment pipe. On Compose it becomes a service environment
variable directly. On Kubernetes the chart-wrap Recipe feeds the value into the
chart's `auth.password`, and the chart provisions the Kubernetes Secret and
mounts it into the workload — so the authenticated stack renders complete, with
no out-of-band Secret to supply. Authentication also requires a writable root
filesystem, which the Recipe enables automatically only when a credential is
attached. The `origin` values in `aggregate-auth.yaml` are development
placeholders; supply real values through your credential source for any real
deployment.
