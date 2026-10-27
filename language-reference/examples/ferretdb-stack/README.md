---
example:
  level: start
  products: [core/datastore/documentdb, core/datastore/ferretdb]
  shows: [modules]
---

# FerretDB stack — a document database composed as a module

This example compiles a small, real stack — a **document database** exposing
the MongoDB wire protocol — to synthesized Kubernetes manifests from one
Developer-authored `Aggregate`.

The document database is not a single component. It is a **module**: a reusable
sub-aggregate that composes two single-workload components —

- a **proxy** that speaks the MongoDB wire protocol and holds no local state, and
- a **backend**, PostgreSQL 17 with the DocumentDB extension, which persists the
  data on a volume.

The module wires its own internal edge from the proxy to the backend and exports
the proxy as its public endpoint `mongo`. The top-level Aggregate imports the
module by name and renders the composed stack; the operator sizes the module's
internal components in the Release.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: imports the document-database module (`core/ferretdb`). |
| `manifest-helm-synth.yaml` | Maps the proxy and backend types to their synth helm Recipes. |
| `release-helm-synth.yaml` | Operator record for the Kubernetes target. Sizes the module's internal components by their module-scoped IDs; anything left to schema defaults renders self-contained. |

## What it demonstrates

- **Composition as a module.** A multi-workload capability — a document database
  that is really a proxy plus a storage backend — is packaged as a sub-aggregate
  composing two single-workload components, not as one monolithic component. The
  module is imported by name and reused wherever a document database is needed.
- **An internal edge inside the module.** The proxy declares a use of the backend;
  the backend Recipe's `provides` host, port, user, and database are piped into
  the proxy and composed into its PostgreSQL connection. The compiler routes the
  strings without interpreting them.
- **A public endpoint.** The module exports its proxy as `mongo`, the stable
  public name a document-database consumer wires to — decoupled from the module's
  internal component names.
- **Operator sizing of internal components.** The Release addresses the module's
  internal components by their module-scoped IDs (`database.backend`,
  `database.proxy`) to set compute, without the developer's Aggregate
  restating physical sizing.
- **A shared credential.** The proxy delegates authentication to its PostgreSQL
  backend, so the two share one password. This example uses a shared inline
  development default, so the stack runs self-contained with no external secret.
- **A password-free connection string.** The proxy's PostgreSQL connection URL is
  rendered without the password embedded; the password is supplied separately on
  the standard libpq `PGPASSWORD` environment variable, which the driver merges
  into the connection. This keeps the credential out of the connection string in
  the rendered manifest.
- **Reproducible images.** Both the proxy and the backend pin explicit image tags,
  so the rendered manifests reference stable images.

## Build

This workspace carries no `.aggrega-config.yaml`, so the standard-library
entities resolve from the hub registry, `hub.aggrega.ai`, and no catalog flag is
needed; `--auto-pull` writes the lockfile a fresh clone lacks during the build:

```sh
aggrega build --release release-helm-synth.yaml --auto-pull
```

Rendered artifacts land under `dist/`. The Kubernetes target renders plain
manifests offline — no chart pull is required.

## What the composed stack looks like

The proxy renders as a stateless Deployment plus a ClusterIP Service on the wire
port. Its container environment carries the connection composed from the backend
edge — the backend's in-cluster Service name, user, and database, with no
password in the URL — and keeps FerretDB's debug listener on the pod's loopback
address, where no other pod reaches it:

```yaml
env:
  - name: FERRETDB_LISTEN_ADDR
    value: :27017
  - name: FERRETDB_DEBUG_ADDR
    value: 127.0.0.1:8088
  - name: FERRETDB_POSTGRESQL_URL
    value: postgres://postgres@database-zdbackend-default:5432/postgres
  - name: PGPASSWORD
    value: apppass
```

Neither probe needs that listener. The readiness probe runs `ferretdb ping`
inside the container, which pings the wire port and so also proves the backend
connection; the liveness probe checks only that the wire port accepts
connections, so a backend outage takes the proxy out of its Service without
restarting it:

```yaml
livenessProbe:
  tcpSocket:
    port: 27017
readinessProbe:
  exec:
    command:
      - /ferretdb
      - ping
```

The backend renders as a StatefulSet with a persistent volume mounted at
`/var/lib/postgresql/data`, plus a ClusterIP Service and a headless Service.
