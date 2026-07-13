# Kong stack — a database-backed API gateway composed as a module

This example compiles a small, real stack — a **database-backed API gateway** —
to synthesized Kubernetes manifests from one Developer-authored `Aggregate`.

The gateway is not a single component. It is a **module**: a reusable
sub-aggregate that composes two single-workload components —

- a **gateway** that terminates client traffic on its proxy port and holds no
  local state, and
- a **backend**, PostgreSQL, which holds the gateway's configuration and
  persists it on a volume.

The module wires its own internal edge from the gateway to the backend and
exports the gateway as its public endpoint `proxy`. The top-level Aggregate
imports the module by name and renders the composed stack; the operator sizes
the module's internal components in the Release.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: imports the API-gateway module (`core/kong`). |
| `manifest-helm-synth.yaml` | Maps the gateway and backend types to their synth helm Recipes. |
| `release-helm-synth.yaml` | Operator record for the Kubernetes target. Sizes the module's internal components by their module-scoped IDs; anything left to schema defaults renders self-contained. |

## What it demonstrates

- **Composition as a module.** A multi-workload capability — an API gateway that
  is really a proxy plus a configuration database — is packaged as a
  sub-aggregate composing two single-workload components, not as one monolithic
  component. The module is imported by name and reused wherever a gateway is
  needed.
- **An internal edge inside the module.** The gateway declares a use of the
  backend; the backend Recipe's `provides` host, port, user, and database are
  piped into the gateway and composed into its PostgreSQL connection. The
  compiler routes the strings without interpreting them.
- **A public endpoint.** The module exports its gateway as `proxy`, the stable
  public name a consumer connects to — decoupled from the module's internal
  component names.
- **Operator sizing of internal components.** The Release addresses the module's
  internal components by their module-scoped IDs (`gateway.backend`,
  `gateway.gateway`) to set compute, without the developer's Aggregate restating
  physical sizing.
- **A migrations step that runs before serving.** The gateway provisions its
  database schema through an init container that runs to completion before the
  main gateway container starts, so the gateway serves against a ready schema.
  The bootstrap is idempotent, so a re-run against an already-provisioned
  database is a no-op.
- **A shared credential.** The gateway authenticates to its PostgreSQL backend,
  so the two share one password. This example uses a shared inline development
  default, so the stack runs self-contained with no external secret.
- **Reproducible images.** Both the gateway and the backend pin explicit image
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

The gateway renders as a stateless Deployment plus a ClusterIP Service on the
proxy port. Its Pod carries a migrations init container that runs before the
main container; both carry the connection composed from the backend edge — the
backend's in-cluster Service name, user, and database:

```yaml
env:
  - name: KONG_DATABASE
    value: postgres
  - name: KONG_PG_HOST
    value: gateway.backend-default
  - name: KONG_PG_PORT
    value: "5432"
  - name: KONG_PG_USER
    value: kong
  - name: KONG_PG_DATABASE
    value: kong
  - name: KONG_PG_PASSWORD
    value: apppass
```

The backend renders as a StatefulSet with a persistent volume mounted at
`/var/lib/postgresql/data`, plus a ClusterIP Service and a headless Service.
