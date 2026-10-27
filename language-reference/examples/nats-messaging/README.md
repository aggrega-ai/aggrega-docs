---
example:
  level: start
  products: [core/messaging/nats]
  shows: [multi-target, credentials]
---

# NATS — one Aggregate, two targets, optional authentication

This example compiles a single **NATS** messaging server (pub-sub,
request-reply, queueing) from one Developer-authored `Aggregate` to two
realizations:

- **Docker Compose** for local development, and
- the **synthesized helm Recipe** running the official upstream `nats` image
  directly on Kubernetes (no external chart).

The synthesized helm Recipe is the preferred Kubernetes path: it depends only on
an official image tag rather than a third-party chart, and its rendered resource
set is exactly what the workload declares.

The same `aggregate.yaml` drives both. Only the Recipe layer selected by the
Manifest changes per realization. A second Aggregate, `aggregate-auth.yaml`,
shows the same server with an inject-value password credential attached for the
Compose path; `aggregate-helm-synth-auth.yaml` attaches a referenceable
credential for the synthesized helm path.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: one `bus` component of type `core/messaging/nats`, no credential — the server runs without authentication. |
| `aggregate-auth.yaml` | The same server with an inject-value password credential attached to the component's optional `password` slot (Compose path). |
| `aggregate-helm-synth-auth.yaml` | The same server with a referenceable credential attached for the synthesized helm path — the value is materialized as a Kubernetes Secret the Deployment references. |
| `manifest-compose.yaml` | Maps the NATS type to the Compose Recipe (`compose/nats`) and the credential to `dotenv-secret`. |
| `manifest-helm-synth.yaml` | Maps the NATS type to the synthesized helm Recipe (`helm/nats`) and the credential to `k8s-secret-from-parameter`. |
| `release-compose.yaml` / `release-helm-synth.yaml` | Operator records for the two realizations, no authentication. |
| `release-compose-auth.yaml` / `release-helm-synth-auth.yaml` | Operator records that enable authentication. |

## What it demonstrates

- **One authoring surface, many targets.** A single Aggregate is the source of
  truth for *what* the stack is. Each Manifest says *how* to realize it.
- **A stateless messaging server.** In this lean shape NATS routes subjects in
  memory with JetStream file storage disabled, so the component is typed as a
  `server`. On Kubernetes the synthesized Recipe renders a single-replica
  **Deployment** with no persistent volume; the Compose service exposes the
  server for local development.
- **Workload synthesis (Kubernetes).** The synthesized helm Recipe declares a
  Workload — a Deployment plus a ClusterIP Service running the official `nats`
  image — that the helm provider translates into Kubernetes manifests with no
  external chart. The rendered resource set is exactly what the Workload
  declares. Because both a Compose and a synthesized helm Recipe carry the name
  `nats`, the Manifests reference them provider-scoped as `compose/nats` and
  `helm/nats`.
- **Optional authentication, deterministic either way.** NATS authentication is
  off by default. When no credential is attached, neither realization enables
  authentication and the render is byte-identical across runs. When a credential
  is attached, the injected value enables user/password authentication on both
  realizations.

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
pipe and the server is started with user/password authentication flags.

The synthesized helm path uses a referenceable credential
(`aggregate-helm-synth-auth.yaml`): the value is materialized as a Kubernetes
Secret, the Deployment references it through an env `secretKeyRef`, and the
server is started with `--user`/`--pass` flags reading that environment
variable. The plaintext password therefore never appears in the Deployment
manifest — only in the Secret.

The `origin` value in the authenticated Aggregates is a development placeholder;
supply a real value through your credential source for any real deployment.
