---
example:
  level: start
  products: [core/datastore/valkey]
  shows: [multi-target, credentials]
---

# Valkey — one Aggregate, two targets, optional authentication

This lean example compiles a single **Valkey** in-memory cache (Redis wire
protocol) from one Developer-authored `Aggregate` to two realizations:

- **Docker Compose** for local development, and
- the **synthesized helm Recipe** running the official upstream `valkey/valkey`
  image directly on Kubernetes (no external chart).

The synthesized helm Recipe is the Kubernetes path: it depends only on an
official image tag rather than a third-party chart, and its rendered resource
set is exactly what the workload declares.

The same `aggregate.yaml` drives both. Only the Recipe layer selected by the
Manifest changes per realization. Two further Aggregates show the same cache
with an optional password credential attached: `aggregate-auth.yaml` for the
Compose path (an inject-value credential the server is started with), and
`aggregate-helm-synth-auth.yaml` for the synthesized helm path (a referenceable
credential materialized as a Kubernetes Secret).

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: one `cache` component of type `core/datastore/valkey`, no credential — the cache runs without authentication. |
| `aggregate-auth.yaml` | The same cache with a password credential attached to the component's optional `password` slot (Compose path). |
| `aggregate-helm-synth-auth.yaml` | The same cache with a referenceable credential attached for the synthesized helm path — the value is materialized as a Kubernetes Secret the Deployment references. |
| `manifest-compose.yaml` | Maps the Valkey type to the Compose Recipe (`compose/valkey`) and the credential to `dotenv-secret`. |
| `manifest-helm-synth.yaml` | Maps the Valkey type to the synthesized helm Recipe (`helm/valkey`) and the credential to `k8s-secret-from-parameter`. |
| `release-compose.yaml` / `release-helm-synth.yaml` | Operator records for the two realizations, no authentication. |
| `release-compose-auth.yaml` / `release-helm-synth-auth.yaml` | Operator records that enable authentication. |

## What it demonstrates

- **One authoring surface, many targets.** A single Aggregate is the source of
  truth for *what* the stack is. Each Manifest says *how* to realize it.
- **A cache-role datastore.** Valkey is used here as an in-memory cache and
  stores nothing durably, so the component is typed as a plain `server` rather
  than a `stateful-server`. On Kubernetes the synthesized helm Recipe renders a
  **Deployment**, not a StatefulSet, and requests no persistent volume; on
  Compose the service declares no data volume.
- **Workload synthesis (Kubernetes).** The synthesized helm Recipe declares a
  Workload — a Deployment plus a ClusterIP Service running the official
  `valkey/valkey` image — that the helm provider translates into Kubernetes
  manifests with no external chart. The rendered resource set is exactly what
  the Workload declares. Because both a Compose and a synthesized helm Recipe
  carry the name `valkey`, the Manifests reference them provider-scoped as
  `compose/valkey` and `helm/valkey`.
- **Optional authentication via a credential slot.** The component declares one
  optional `password` slot in its `featuresSchema`. When no credential is
  attached (the base Aggregate), the Recipe renders the cache with
  authentication disabled — byte-identically to a Recipe with no slot. When a
  credential is attached, both targets start Valkey with `--requirepass`, so the
  server requires the password: on Compose the value reaches the server through
  the image's `VALKEY_EXTRA_FLAGS` variable; on Kubernetes the synthesized helm
  path materializes it as a Secret the Deployment references.

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
pipe under the variable its `values.key` names, `VALKEY_PASSWORD`, and the
Recipe hands it to the server as `--requirepass` through the image's
`VALKEY_EXTRA_FLAGS` variable, so it appears in the service's environment but
not on its command line. The image's start-up script expands that variable
unquoted, so a password holding a space stops the server at start, and one
holding `*`, `?` or `[` is matched against file names in the server's data
directory, so write the password without either. A
password attachment whose value reaches the Recipe under no variable it reads
halts the build, naming the slot, rather than rendering an unprotected cache.

The synthesized helm path uses a referenceable credential
(`aggregate-helm-synth-auth.yaml`): the value is materialized as a Kubernetes
Secret, the Deployment references it through an env `secretKeyRef`, and Valkey is
started with `--requirepass` reading that environment variable. The plaintext
password therefore never appears in the Deployment manifest — only in the
Secret. This is what actually enables authentication on the official
`valkey/valkey` image, which does not read a password from the environment on
its own.

The `origin` value in the authenticated Aggregates is a development placeholder;
supply a real value through your credential source for any real deployment.
