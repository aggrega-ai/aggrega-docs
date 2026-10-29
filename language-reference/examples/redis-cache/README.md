---
example:
  level: start
  products: [core/datastore/redis]
  shows: [multi-target, credentials]
---

# Redis — one Aggregate, two targets, optional authentication

This lean example compiles a single **Redis** in-memory cache (Redis wire
protocol) from one Developer-authored `Aggregate` to two realizations:

- **Docker Compose** for local development, and
- the **synthesized helm Recipe** running the official upstream `redis` image
  directly on Kubernetes (no external chart).

The synthesized helm Recipe is the Kubernetes path: it depends only on
an official image tag rather than a third-party chart, and its rendered resource
set is exactly what the workload declares.

The same `aggregate.yaml` drives both. Only the Recipe layer selected by
the Manifest changes per realization. A second Aggregate, `aggregate-auth.yaml`,
shows the same cache with an optional password credential attached for the
Compose path; `aggregate-helm-synth-auth.yaml` attaches a
referenceable credential for the synthesized helm path.

The catalog's Redis Recipes this example maps, `compose/redis` and `helm/redis`,
declare the AGPL-3.0 licence. The `valkey-cache` example deploys Valkey, which
speaks the same wire protocol; its `helm/valkey` Recipe declares BSD-3-Clause.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: one `cache` component of type `core/datastore/redis`, no credential — the cache runs without authentication. |
| `aggregate-auth.yaml` | The same cache with a password credential attached to the component's optional `password` slot (Compose path). |
| `aggregate-helm-synth-auth.yaml` | The same cache with a referenceable credential attached for the synthesized helm path — the value is materialized as a Kubernetes Secret the Deployment references. |
| `manifest-compose.yaml` | Maps the Redis type to the Compose Recipe (`compose/redis`) and the credential to `dotenv-secret`. |
| `manifest-helm-synth.yaml` | Maps the Redis type to the synthesized helm Recipe (`helm/redis`) and the credential to `k8s-secret-from-parameter`. |
| `release-compose.yaml` / `release-helm-synth.yaml` | Operator records for the two realizations, no authentication. |
| `release-compose-auth.yaml` / `release-helm-synth-auth.yaml` | Operator records that enable authentication. |

## What it demonstrates

- **One authoring surface, many targets.** A single Aggregate is the source of
  truth for *what* the stack is. Each Manifest says *how* to realize it.
- **A cache-role datastore.** Redis is used here as an in-memory cache and
  stores nothing durably, so the component is typed as a plain `server` rather
  than a `stateful-server`. On Kubernetes the synthesized Recipe renders a
  **Deployment**, not a StatefulSet, and requests no persistent volume; on
  Compose the service declares no data volume.
- **Workload synthesis (Kubernetes).** The synthesized helm Recipe declares a
  Workload — a Deployment plus a ClusterIP Service running the official
  `redis` image — that the helm provider translates into Kubernetes manifests
  with no external chart. The rendered resource set is exactly what the Workload
  declares. Because both a Compose and a synthesized helm Recipe carry the name
  `redis`, the Manifests reference them provider-scoped as `compose/redis` and
  `helm/redis`.
- **Optional authentication via a credential slot.** The component declares one
  optional `password` slot in its `featuresSchema`. When no credential is
  attached (the base Aggregate), the Recipe renders the cache with
  authentication disabled — byte-identically to a Recipe with no slot. When a
  credential is attached, both targets start Redis with `--requirepass`, so the
  server requires the password: on Compose (`aggregate-auth.yaml`) the value is
  passed to the server as that argument; on the synthesized Kubernetes path
  (`aggregate-helm-synth-auth.yaml`) it is materialized as a Secret the
  Deployment references.

## Build

This workspace carries no `.aggrega-config.yaml`, so the standard-library
entities resolve from the hub registry, `hub.aggrega.ai`, and no catalog flag is
needed; `--auto-pull` writes the lockfile a fresh clone lacks during the build:

```sh
# Local development (Docker Compose), no authentication
aggrega build --release release-compose.yaml --auto-pull

# Kubernetes (synthesized helm Recipe, official image), no authentication
aggrega build --release release-helm-synth.yaml --auto-pull

# The same realizations with authentication enabled
aggrega build --release release-compose-auth.yaml --auto-pull
aggrega build --release release-helm-synth-auth.yaml --auto-pull
```

Rendered artifacts land under `dist/`.

## Credential delivery note

On the Compose path the credential is an inject-value secret
(`aggregate-auth.yaml`): its value is delivered on the component's environment
pipe under the variable its `values.key` names, `REDIS_PASSWORD`, and the Recipe
hands it to the server as `--requirepass`. The official `redis` image reads no
password variable, so the value is passed as an argument and shows in the
service's command. An attachment whose value reaches the Recipe under no variable
it reads halts the build, naming the slot, rather than leaving the cache open.

The synthesized helm path uses a referenceable credential
(`aggregate-helm-synth-auth.yaml`): the value is materialized as a Kubernetes
Secret, the Deployment references it through an env `secretKeyRef`, and Redis is
started with `--requirepass` reading that environment variable. The plaintext
password therefore never appears in the Deployment manifest — only in the
Secret. This is what actually enables authentication on the official `redis`
image, which does not read a password from the environment on its own.

The `origin` value in the authenticated Aggregates is a development placeholder;
supply a real value through your credential source for any real deployment.
