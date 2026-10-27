---
example:
  level: start
  products: [core/datastore/memcached]
  shows: [multi-target, credentials, guardrails]
---

# Memcached — one Aggregate, two targets, and a password that is refused

This lean example compiles a single **Memcached** in-memory cache from one
Developer-authored `Aggregate` to two realizations:

- **Docker Compose** for local development, and
- the **synthesized helm Recipe** running the official upstream `memcached`
  image directly on Kubernetes (no external chart).

The synthesized helm Recipe is the preferred Kubernetes path: it depends only on
an official image tag rather than a third-party chart, and its rendered resource
set is exactly what the workload declares.

The same `aggregate.yaml` drives both. Only the Recipe layer selected by the
Manifest changes per realization. Two further Aggregates attach a password to the
cache, and their Releases are **negative examples**: the build halts, because no
realization can enforce a Memcached password.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: one `cache` component of type `core/datastore/memcached`, no credential — the cache runs without authentication. |
| `aggregate-auth.yaml` | The same cache with an inject-value password credential attached to the component's optional `password` slot (Compose path). Its build halts. |
| `aggregate-helm-synth-auth.yaml` | The same cache with a referenceable password credential attached for the synthesized helm path. Its build halts. |
| `manifest-compose.yaml` | Maps the Memcached type to the Compose Recipe (`compose/memcached`) and the credential to `dotenv-secret`. |
| `manifest-helm-synth.yaml` | Maps the Memcached type to the synthesized helm Recipe (`helm/memcached`) and the credential to `k8s-secret-from-parameter`. |
| `release-compose.yaml` / `release-helm-synth.yaml` | Operator records for the two realizations. |
| `release-negative-compose-auth.yaml` / `release-negative-helm-synth-auth.yaml` | Operator records over the two password Aggregates. Each build is expected to fail. |

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
  `compose/memcached` and `helm/memcached`.
- **A protection a realization cannot give is refused, not dropped.** The
  component declares an optional `password` slot. The `memcached` image enforces
  no password: its two authentication modes are SASL, spoken over the binary
  protocol only, and an ASCII authentication file, and the catalog's Memcached
  clients use neither. A Recipe that accepted the attachment would render a
  cache that answers every client while the Aggregate says it is protected, so
  each Recipe halts the build instead, naming the slot.

## Build

This workspace carries no `.aggrega-config.yaml`, so the standard-library
entities resolve from the hub registry, `hub.aggrega.ai`, and no catalog flag is
needed; `--auto-pull` writes the lockfile a fresh clone lacks during the build:

```sh
# Local development (Docker Compose)
aggrega build --release release-compose.yaml --auto-pull

# Kubernetes (synthesized helm Recipe, official image)
aggrega build --release release-helm-synth.yaml --auto-pull
```

Rendered artifacts land under `dist/`.

## The control: a password the cache cannot enforce

The two negative Releases build the password Aggregates, and each build is
**expected to fail**:

```sh
aggrega build --release release-negative-compose-auth.yaml --auto-pull
aggrega build --release release-negative-helm-synth-auth.yaml --auto-pull
```

Each halts in the Memcached Recipe, before anything is written, and the halt
ends with the Recipe's own message:

```text
a password is attached to the password slot of "cache", but the memcached
image this Recipe runs cannot enforce a password: it authenticates only through
SASL over the binary protocol or an ASCII authentication file, which the
catalog's Memcached clients do not use, so the cache would accept every client
anyway; remove the attachment, and restrict who can reach the cache through its
network
```

The refusal is keyed on the attachment itself, not on how the credential is
delivered, so every Feature that can fill the slot halts the same way. The
managed realizations behave alike: Amazon ElastiCache offers no Memcached
authentication, and its Recipes halt on the attachment too. A Memcached cache
is therefore protected by who can reach it — the network it is placed on — and
the base `aggregate.yaml` is the form to build.
