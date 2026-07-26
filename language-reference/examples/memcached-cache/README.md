# Memcached — one Aggregate, two targets, optional authentication

This lean example compiles a single **Memcached** in-memory cache from one
Developer-authored `Aggregate` to two deployment realizations:

- **Docker Compose** for local development, and
- the **synthesized helm Recipe** running the official upstream `memcached`
  image directly on Kubernetes (no external chart).

The synthesized helm Recipe is the preferred Kubernetes path: it depends only on
an official image tag rather than a third-party chart, and its rendered resource
set is exactly what the workload declares.

The same `aggregate.yaml` drives both. Only the Recipe layer selected by the
Manifest changes per realization. A second Aggregate, `aggregate-auth.yaml`,
shows the same cache with an inject-value credential attached for the Compose
path; `aggregate-helm-synth-auth.yaml` attaches a referenceable credential for
the synthesized helm path.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: one `cache` component of type `core/datastore/memcached`, no credential — the cache runs without authentication. |
| `aggregate-auth.yaml` | The same cache with an inject-value password credential attached to the component's optional `password` slot (Compose path). |
| `aggregate-helm-synth-auth.yaml` | The same cache with a referenceable credential attached for the synthesized helm path — the value is materialized as a Kubernetes Secret the Deployment references. |
| `manifest-compose.yaml` | Maps the Memcached type to the Compose Recipe (`memcached`) and the credential to `dotenv-secret`. |
| `manifest-helm-synth.yaml` | Maps the Memcached type to the synthesized helm Recipe (`helm/memcached`) and the credential to `k8s-secret-from-parameter`. |
| `release-compose.yaml` / `release-helm-synth.yaml` | Operator records for the two realizations, no authentication. |
| `release-compose-auth.yaml` / `release-helm-synth-auth.yaml` | Operator records that enable authentication. |

## What it demonstrates

- **One authoring surface, many targets.** A single Aggregate is the source of
  truth for *what* the stack is. Each Manifest says *how* to realize it.
- **A stateless datastore.** Memcached holds entries in memory and stores
  nothing durably, so the component is typed as a plain `server` rather than a
  `stateful-server`. On Kubernetes the Recipe renders a **Deployment**, not a
  StatefulSet, and requests no persistent volume; on Compose the service
  declares no data volume.
- **Workload synthesis (Kubernetes).** The synthesized helm Recipe declares a
  Workload — a Deployment plus a ClusterIP Service running the official
  `memcached` image — that the helm provider translates into Kubernetes
  manifests with no external chart. The rendered resource set is exactly what
  the Workload declares. Because both a Compose and a synthesized helm Recipe
  carry the name `memcached`, the Manifests reference them provider-scoped as
  `memcached` (compose) and `helm/memcached`.
- **Optional authentication via a credential slot.** The component declares one
  optional `password` slot in its `featuresSchema`. When no credential is
  attached (the base Aggregate), the Recipe renders the cache with
  authentication disabled — byte-identically to a Recipe with no slot. When a
  credential is attached, the Recipe emits `MEMCACHED_USERNAME` and
  `MEMCACHED_PASSWORD` environment variables. SASL authentication requires a
  Memcached image built with SASL support; the plain official image ignores
  these variables and runs without authentication.

## Build

The workspace catalog supplies the standard-library entities, so no explicit
catalog flag is needed:

```sh
# Local development (Docker Compose), no authentication
aggrega build --release release-compose.yaml

# Kubernetes (synthesized helm Recipe, official image), no authentication
aggrega build --release release-helm-synth.yaml

# The same realizations with authentication enabled
aggrega build --release release-compose-auth.yaml
aggrega build --release release-helm-synth-auth.yaml
```

Rendered artifacts land under `dist/`.

## Credential delivery note

On the Compose path the credential is an inject-value secret
(`aggregate-auth.yaml`): its value is delivered on the component's environment
pipe and becomes the `MEMCACHED_USERNAME` / `MEMCACHED_PASSWORD` service
environment variables directly.

The synthesized helm path uses a referenceable credential
(`aggregate-helm-synth-auth.yaml`): the value is materialized as a Kubernetes
Secret, the Deployment references the password through an env `secretKeyRef`,
and `MEMCACHED_USERNAME` is emitted from the developer value. The plaintext
password therefore never appears in the Deployment manifest — only in the
Secret. On both paths these variables enable SASL authentication only for a
Memcached image built with SASL support; the plain official image ignores them
and runs without authentication.

The `origin` values in the authenticated Aggregates are development
placeholders; supply real values through your credential source for any real
deployment.
