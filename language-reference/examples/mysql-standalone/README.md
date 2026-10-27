---
example:
  level: start
  products: [core/datastore/mysql]
  shows: [multi-target, credentials]
---

# MySQL — one Aggregate, two targets

This lean example compiles a single **MySQL** database from Developer-authored
`Aggregate`s to two targets:

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
| `release-compose.yaml` | Operator record for the local Compose target, including a provider-specific `infra.overrides` entry that pins the exact container image. |

## What it demonstrates

- **One authoring surface, many targets.** An Aggregate is the source of truth
  for *what* the stack is. Each Manifest says *how* to realize it.
- **Workload synthesis on Kubernetes (preferred).** The `helm/mysql` Recipe
  declares a capability-agnostic `Workload` with `form: stateful`; the helm provider
  synthesizes a **StatefulSet**, a **ClusterIP Service**, a **Headless Service**
  (the StatefulSet's stable network identity), and a **volumeClaimTemplate** for
  the data directory. The container's environment carries `MYSQL_DATABASE`,
  `MYSQL_USER`, `MYSQL_ROOT_PASSWORD`, and `MYSQL_PASSWORD`. Character set and
  collation are honored as `mysqld` server command-line arguments
  (`--character-set-server`, `--collation-server`), because the official `mysql`
  image takes them as server flags rather than environment variables.
- **Workload synthesis on Compose.** The Compose Recipe declares a
  capability-agnostic `Workload`; the compose provider synthesizes a
  `docker-compose.yaml` service with the MySQL image, its environment, a named
  data volume, and a health check.
- **An operator escape hatch.** The Compose release sets `infra.overrides.image`,
  the open pillar for provider-specific facts the Component's own schema does
  not name, and the rendered service runs that exact image reference. See
  [Provider-specific overrides](#provider-specific-overrides).
- **Two-slot credential model.** Passwords are attachments on the component's `features:`
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
`containers.attachments`, which the synthesizer renders as an env `secretKeyRef`. The
generated Secret and the container's reference name the same resource because
both read `.features.user_password.provides.name`. Leaving `user_password`
unattached (the base variant) is also valid: the Recipe falls back to an inline
development default (`MYSQL_PASSWORD: apppass`) and no Secret is generated, so a
minimal deployment still renders and runs.

## Build

This workspace carries no `.aggrega-config.yaml`, so the standard-library
entities resolve from the hub registry, `hub.aggrega.ai`, and no catalog flag is
needed; `--auto-pull` writes the lockfile a fresh clone lacks during the build:

```sh
# Kubernetes — synthesized helm StatefulSet (base: root credential only)
aggrega build --release release-helm-synth.yaml --auto-pull

# Kubernetes — synthesized helm StatefulSet (full: both credential slots)
aggrega build --release release-helm-synth-auth.yaml --auto-pull

# Local development (Docker Compose)
aggrega build --release release-compose.yaml --auto-pull
```

Rendered artifacts land under `dist/`.

## Operator sizing

The Kubernetes releases fulfill the operator-sizing pillar per environment: the
container image tag comes from `infra.engine_version` (`mysql:8.4`), and the
volumeClaimTemplate's request and storage class come from `infra.storage`. The
developer's Aggregate never carries these fields.

## Provider-specific overrides

Sizing pillars are named fields: the Component declares `engine_version` and
`storage`, so an operator setting either is filling in a field the Component
anticipated. `infra.overrides` is the pillar for what a Component cannot
anticipate — it is declared as an object accepting any nested structure, and
each Recipe documents which keys it reads.

`release-compose.yaml` uses it. The Compose Recipe reads one key, `image`, and
when it is set the container runs that exact reference instead of the one the
Recipe composes from `engine_version`:

```yaml
infra:
  engine_version: "8.4"
  overrides:
    image: "registry.internal.example/library/mysql:8.4"
```

The rendered service carries the override verbatim:

```yaml
services:
  db:
    image: registry.internal.example/library/mysql:8.4
    [… omitted: the service's environment, labels, volume, network and health check]
```

This is the path to a registry-mirrored or digest-pinned build of the same
server version — a deployment fact that belongs to the target environment, not
to the Component's contract. Because the key set is per-Recipe rather than
per-Component, the Recipe is where to look for which keys apply: the Compose
Recipe here reads `image`, and a Recipe that reads none says so.
