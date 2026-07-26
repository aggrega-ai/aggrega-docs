# MySQL — one Aggregate, two targets

This lean example compiles a single **MySQL** database from Developer-authored
`Aggregate`s to two deployment targets:

- **Kubernetes** via the helm provider's Workload synthesis (a StatefulSet
  rendered directly on the official `mysql` image, no external chart), and
- **Docker Compose** for local development.

The same developer intent drives each target. Only the Recipe layer selected by
the Manifest changes per target.

## Files

| File | Role |
| --- | --- |
| `aggregate-helm-synth.yaml` | Developer intent for the Kubernetes base variant: one `db` component of type `core/datastore/mysql`, its values, and the required `root_password` credential only. |
| `aggregate-helm-synth-auth.yaml` | Developer intent for the Kubernetes full variant: both the `root_password` and `user_password` credential slots. |
| `manifest-helm-synth.yaml` | Maps the MySQL type to the synthesized helm Recipe (`helm/mysql`) and each credential to its FeatureRecipe (`env-secret`, `k8s-secret-from-parameter`). |
| `release-helm-synth.yaml` | Operator record for the Kubernetes base variant, with operational sizing (`engine_version`, `storage`). |
| `release-helm-synth-auth.yaml` | Operator record for the Kubernetes full variant. |
| `aggregate.yaml` | Developer intent for the local Compose target: the same `db` component with both credential slots delivered as inject-value credentials. |
| `manifest-compose.yaml` | Maps the MySQL type to the Compose Recipe (`mysql`) and the credential to `dotenv-secret`. |
| `release-compose.yaml` | Operator record for the local Compose target. |

## What it demonstrates

- **One authoring surface, many targets.** An Aggregate is the source of truth
  for *what* the stack is. Each Manifest says *how* to realize it.
- **Workload synthesis on Kubernetes (preferred).** The `helm/mysql` Recipe
  declares a capability-agnostic `Workload` with `form: stateful`; the helm engine
  synthesizes a **StatefulSet**, a **ClusterIP Service**, a **Headless Service**
  (the StatefulSet's stable network identity), and a **volumeClaimTemplate** for
  the data directory. The container's environment carries `MYSQL_DATABASE`,
  `MYSQL_USER`, `MYSQL_ROOT_PASSWORD`, and `MYSQL_PASSWORD`. Character set and
  collation are honored as `mysqld` server command-line arguments
  (`--character-set-server`, `--collation-server`), because the official `mysql`
  image takes them as server flags rather than environment variables.
- **Workload synthesis on Compose.** The Compose Recipe declares a
  capability-agnostic `Workload`; the compose engine synthesizes a
  `docker-compose.yaml` service with the MySQL image, its environment, a named
  data volume, and health checks.
- **Two-slot credential model.** Passwords live in the component's `secrets:`
  pillar, each a Feature labeled `feature.aggrega.ai/kind: secret`, kept apart
  from application `values`. The Component's `featuresSchema` declares a Black-Box
  `root_password` slot and a transparent `user_password` slot.

## Kubernetes credential delivery

`root_password` is a **Black-Box** slot (`inject: []`): the Recipe controls
delivery. The attached inject-value credential puts the value on the component's
inject pipe, and the Recipe reads it as
`.context.inject.env.MYSQL_ROOT_PASSWORD`, emitting a plain container env var. No
Kubernetes Secret is generated for it.

`user_password` is a **transparent** slot (`inject: [env, file]`). The full
variant attaches a referenceable credential, which materializes a Kubernetes
Secret and publishes its identity; the Recipe references the slot through
`containers.secrets`, which the synthesizer renders as an env `secretKeyRef`. The
generated Secret and the container's reference name the same resource because
both read `.secrets.user_password.provides.name`. Leaving `user_password`
unattached (the base variant) is also valid: the Recipe falls back to an inline
development default (`MYSQL_PASSWORD: apppass`) and no Secret is generated, so a
minimal deployment still renders and runs.

## Build

The workspace catalog supplies the standard-library entities, so no explicit
catalog flag is needed:

```sh
# Kubernetes — synthesized helm StatefulSet (base: root credential only)
aggrega build --release release-helm-synth.yaml

# Kubernetes — synthesized helm StatefulSet (full: both credential slots)
aggrega build --release release-helm-synth-auth.yaml

# Local development (Docker Compose)
aggrega build --release release-compose.yaml
```

Rendered artifacts land under `dist/`.

## Operator sizing

The Kubernetes releases fulfill the operator-sizing pillar per environment: the
container image tag comes from `infra.engine_version` (`mysql:8.4`), and the
volumeClaimTemplate's request and storage class come from `infra.storage`. The
developer's Aggregate never carries these fields.
