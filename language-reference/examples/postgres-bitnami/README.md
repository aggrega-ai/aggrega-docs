# PostgreSQL on the Bitnami Helm chart — optional authentication

This example realizes a single **PostgreSQL** database on Kubernetes through the
**Bitnami PostgreSQL Helm chart**. One Developer-authored `Aggregate` describes
the database; the Manifest maps it to the chart-wrap Recipe. A second Aggregate,
`aggregate-auth.yaml`, shows the same database with an explicit password
credential attached.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: one `db` component of type `core/datastore/postgres`, no credential — the Recipe uses an inline development-default password. |
| `aggregate-auth.yaml` | The same database with a password credential attached to the component's optional `password` slot. |
| `manifest-bitnami.yaml` | Maps the PostgreSQL type to the Bitnami chart-wrap Recipe (`postgres-bitnami`) and the credential to `env-secret`. |
| `release-bitnami.yaml` | Operator record for the Kubernetes target, no authentication, with operational sizing (`compute`, `storage`). |
| `release-bitnami-auth.yaml` | Operator record that deploys `aggregate-auth.yaml`, wiring the injected password into the chart. |

## What it demonstrates

- **One authoring surface.** A single Aggregate is the source of truth for
  *what* the database is. The Manifest says *how* to realize it — here, the
  Bitnami chart.
- **A stateful datastore.** PostgreSQL stores data durably, so the component is
  typed as a `stateful-server`. The chart renders a **StatefulSet** and requests
  a **persistent volume** (a `PersistentVolumeClaim` template), unlike a
  stateless cache which renders a Deployment with no volume.
- **Chart wrapping.** The Bitnami target sources the upstream PostgreSQL chart by
  OCI reference and maps the component's `values` and `infra` onto the chart's
  own value structure — `auth.database`/`auth.username`, `containerPorts.postgresql`,
  `primary.persistence.size`, `primary.resources`, and (when high availability is
  enabled) the chart's `replication` architecture with `readReplicas`.
- **Optional authentication via a credential slot.** The component declares one
  optional `password` slot in its `secretsSchema`. When no credential is attached
  (the base Aggregate), the Recipe supplies an inline development-default
  password so the render stays deterministic. When a credential is attached
  (`aggregate-auth.yaml`), the injected value sets the chart's superuser password
  (`auth.postgresPassword`) and the application user's password (`auth.password`),
  so the deployment uses the supplied password. The chart provisions its own
  Secret from the effective value in either case.

## Build

The workspace catalog supplies the standard-library entities, so no explicit
catalog flag is needed:

```sh
# Kubernetes (Bitnami PostgreSQL Helm chart), no authentication
aggrega build --release release-bitnami.yaml

# The same target with an explicit password credential
aggrega build --release release-bitnami-auth.yaml
```

Rendered artifacts land under `dist/`. The build resolves the upstream chart by
OCI reference on first run and pins it in a lockfile.

## Credential delivery note

The credential is an inject-value secret: its value is delivered on the
component's environment pipe. The chart-wrap Recipe feeds the value into the
chart's `auth.postgresPassword` and `auth.password`, and the chart provisions the
Kubernetes Secret and mounts it into the workload — so the authenticated stack
renders complete, with no out-of-band Secret to supply. The `origin` value in
`aggregate-auth.yaml` is a development placeholder; supply a real value through
your credential source for any real deployment.
