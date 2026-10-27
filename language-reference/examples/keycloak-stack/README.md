---
example:
  level: start
  products: [core/datastore/postgres, core/security/keycloak]
  shows: [modules]
---

# Keycloak stack — a database-backed identity server composed as a module

This example compiles a small, real stack — a **database-backed identity
server** — to synthesized Kubernetes manifests from one Developer-authored
`Aggregate`.

The identity server is not a single component. It is a **module**: a reusable
sub-aggregate that composes two single-workload components —

- a **server** that serves the account console and token endpoints on its HTTP
  port and holds no local state, and
- a **backend**, PostgreSQL, which holds the server's realms, clients, and users
  and persists them on a volume.

The module wires its own internal edge from the server to the backend and
exports the server as its public endpoint `http`. The top-level Aggregate
imports the module by name and renders the composed stack; the operator sizes
the module's internal components in the Release.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: imports the identity-server module (`core/keycloak`). |
| `manifest-helm-synth.yaml` | Maps the server and backend types to their synth helm Recipes, and the credential Feature the module attaches to the realization that emits a Secret from the module's credential parameters. |
| `release-helm-synth.yaml` | Operator record for the Kubernetes target. Sizes the module's internal components by their module-scoped IDs; anything left to schema defaults renders self-contained. |

## What it demonstrates

- **Composition as a module.** A multi-workload capability — an identity server
  that is really a server plus a configuration database — is packaged as a
  sub-aggregate composing two single-workload components, not as one monolithic
  component. The module is imported by name and reused wherever an identity
  server is needed.
- **An internal edge inside the module.** The server declares a use of the
  backend; the backend Recipe's `provides` host, port, user, and database are
  piped into the server and composed into its database connection. The compiler
  routes the strings without interpreting them.
- **A public endpoint.** The module exports its server as `http`, the stable
  public name a consumer connects to — decoupled from the module's internal
  component names.
- **Operator sizing of internal components.** The Release addresses the module's
  internal components by their module-scoped IDs (`server.backend`,
  `server.server`) to set compute, without the developer's Aggregate restating
  physical sizing.
- **Self-migrating schema.** The server provisions and migrates its own schema
  on startup against the backend, so it starts against a ready schema with no
  separate migration step.
- **A shared credential, taken by reference.** The server authenticates to its
  PostgreSQL backend, so the two share one password. The module takes it as a
  parameter, `db_password`, and attaches the `core/referenced-secret`
  credential Feature with it twice: to the backend's own credential slot, and
  as the `credential` of the server's connection to the backend, the
  connection the server presents it on. Each workload reads the password from
  a Secret rather than carrying it inline; the bootstrap admin account's
  password is a second parameter, `admin_password`.
  Because the module attaches that Feature, the Manifest maps it. This example
  leaves both parameters at the module's development defaults and maps the
  Feature to `k8s-secret-from-parameter`, which emits a Secret carrying each
  value, so the stack runs self-contained. For a Release carrying real
  traffic, the Aggregate declares parameters of its own and passes them down
  through `aggregates.server.parameters`, the Release fulfills them, and the
  Manifest maps the Feature to `k8s-existing-secret`, which reads each
  parameter as the name of a Secret that already exists in the namespace.
- **Reproducible images.** Both the server and the backend pin explicit image
  tags, so the rendered manifests reference stable images.

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

The server renders as a stateless Deployment plus a ClusterIP Service on the
HTTP port. Its container carries the connection composed from the backend edge —
the backend's in-cluster Service name, user, and database — plus the
self-contained HTTP settings, the health endpoints switched on and served on the
management port, and the bootstrap admin account, with both passwords read from
Secrets:

```yaml
env:
  - name: KC_DB_PASSWORD
    valueFrom:
      secretKeyRef:
        name: server-zdserver-db.credential
        key: db-password
  - name: KC_BOOTSTRAP_ADMIN_PASSWORD
    valueFrom:
      secretKeyRef:
        name: server-zdserver-admin-password
        key: admin-password
  - name: KC_DB
    value: postgres
  - name: KC_DB_URL_HOST
    value: server-zdbackend-default
  - name: KC_DB_URL_PORT
    value: "5432"
  - name: KC_DB_URL_DATABASE
    value: keycloak
  - name: KC_DB_USERNAME
    value: keycloak
  - name: KC_HTTP_ENABLED
    value: "true"
  - name: KC_HOSTNAME_STRICT
    value: "false"
  - name: KC_HEALTH_ENABLED
    value: "true"
  - name: KC_HTTP_MANAGEMENT_PORT
    value: "9000"
  - name: KC_BOOTSTRAP_ADMIN_USERNAME
    value: admin
```

The container declares the management port, 9000, beside the HTTP port, and the
Deployment probes the server there: a startup probe on `/health/started` holds
the others back while the server boots, a readiness probe on `/health/ready`
keeps traffic away until it answers, and a liveness probe on `/health/live`
restarts it if it stops. The Service still forwards only the HTTP port.

The backend renders as a StatefulSet with a persistent volume mounted at
`/var/lib/postgresql/data`, plus a ClusterIP Service and a headless Service. Its
`POSTGRES_PASSWORD` reads the same database password from a Secret of its own,
`server-zdbackend-password`. The three Secrets are emitted beside the workloads,
one per credential the module attaches, each carrying the module's development
default.
