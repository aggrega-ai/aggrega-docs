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
| `manifest-helm-synth.yaml` | Maps the server and backend types to their synth helm Recipes. |
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
- **A shared credential.** The server authenticates to its PostgreSQL backend,
  so the two share one password. This example uses a shared inline development
  default, so the stack runs self-contained with no external secret. The
  bootstrap admin account is likewise seeded from an inline development default.
- **Reproducible images.** Both the server and the backend pin explicit image
  tags, so the rendered manifests reference stable images.

## Build

The workspace catalog supplies the standard-library entities, so no explicit
catalog flag is needed:

```sh
aggrega build --release release-helm-synth.yaml
```

Rendered artifacts land under `dist/`. The Kubernetes target renders plain
manifests offline — no chart pull is required.

## What the composed stack looks like

The server renders as a stateless Deployment plus a ClusterIP Service on the
HTTP port. Its container carries the connection composed from the backend edge —
the backend's in-cluster Service name, user, and database — plus the
self-contained HTTP settings and the bootstrap admin account:

```yaml
env:
  - name: KC_DB
    value: postgres
  - name: KC_DB_URL_HOST
    value: server.backend-default
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
  - name: KC_BOOTSTRAP_ADMIN_USERNAME
    value: admin
  - name: KC_DB_PASSWORD
    value: apppass
  - name: KC_BOOTSTRAP_ADMIN_PASSWORD
    value: admin
```

The backend renders as a StatefulSet with a persistent volume mounted at
`/var/lib/postgresql/data`, plus a ClusterIP Service and a headless Service.
