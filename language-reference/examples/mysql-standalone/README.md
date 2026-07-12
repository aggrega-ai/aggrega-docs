# MySQL — one Aggregate, two targets

This lean example compiles a single **MySQL** database from one
Developer-authored `Aggregate` to two deployment targets:

- **Docker Compose** for local development, and
- the **Bitnami MySQL Helm chart** for Kubernetes.

The same `aggregate.yaml` drives both. Only the Recipe layer selected by the
Manifest changes per target.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: one `db` component of type `core/datastore/mysql`, its values, and two credential slots. |
| `manifest-compose.yaml` | Maps the MySQL type to the Compose Recipe (`mysql`) and the credential to `dotenv-secret`. |
| `manifest-bitnami.yaml` | Maps the MySQL type to the Bitnami chart-wrap Recipe (`mysql-bitnami`) and the credential to `env-secret`. |
| `release-compose.yaml` | Operator record for the local Compose target. |
| `release-bitnami.yaml` | Operator record for the Kubernetes target, with operational sizing (`compute`, `storage`). |

## What it demonstrates

- **One authoring surface, many targets.** A single Aggregate is the source of
  truth for *what* the stack is. Each Manifest says *how* to realize it.
- **Workload synthesis (Compose).** The Compose Recipe declares a
  provider-agnostic `Workload`; the compose engine synthesizes a
  `docker-compose.yaml` service with the MySQL image, its environment
  (`MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD`), a
  named data volume, and health checks.
- **Chart wrapping (Kubernetes).** The Bitnami target sources the upstream MySQL
  chart by OCI reference and maps the component's `values` and `infra` onto the
  chart's own value structure — `auth.database`/`auth.username`,
  `primary.persistence.size`, and `primary.resources`.
- **Credential slots.** Passwords live in the component's `secrets:` pillar,
  each a Feature labeled `feature.aggrega.ai/kind: secret`, kept apart from
  application `values`. The Component's `secretsSchema` declares a black-box
  `root_password` slot and a transparent `user_password` slot.

## Build

The workspace catalog supplies the standard-library entities, so no explicit
catalog flag is needed:

```sh
# Local development (Docker Compose)
aggrega build --release release-compose.yaml

# Kubernetes (Bitnami MySQL Helm chart)
aggrega build --release release-bitnami.yaml
```

Rendered artifacts land under `dist/`. The Kubernetes build resolves the
upstream chart by OCI reference on first run and pins it in a lockfile.

## Credential delivery note

On the Compose target the credential value is injected straight into the
service environment, so the rendered stack runs as-is.

On the Kubernetes target the Bitnami chart reads passwords from a referenced
Kubernetes Secret (`auth.existingSecret`). The chart expects a single Secret
carrying the chart's own data keys (`mysql-root-password` and, when an
application user is set, `mysql-password`). Supplying that Secret is a
deployment-time concern: point the credential slot at a referenceable-secret
FeatureRecipe whose generated resource matches the chart's expected Secret name
and keys, or provision the Secret out of band. This lean example renders the
chart values wiring; the runnable local stack is the Compose target.
