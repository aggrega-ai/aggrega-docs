---
example:
  level: start
  products: [core/messaging/rabbitmq]
  shows: [multi-target, credentials]
---

# RabbitMQ — one Aggregate, two targets, optional authentication

This example compiles a single **RabbitMQ** message broker (AMQP) from one
Developer-authored `Aggregate` to two targets:

- **Docker Compose** for local development, and
- **Kubernetes**, via the synthesized helm Recipe that runs the official
  upstream `rabbitmq` image directly (a StatefulSet with a persistent volume,
  no external chart).

The same `aggregate.yaml` drives both. Only the Recipe layer selected by the
Manifest changes per target. A second Aggregate, `aggregate-helm-synth-auth.yaml`,
shows the same broker on Kubernetes with a referenceable password credential
attached.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: one `broker` component of type `core/messaging/rabbitmq`, no credential — the Recipe supplies a deterministic inline development password. |
| `aggregate-auth.yaml` | The same broker with an inject-value password credential attached to the component's optional `password` slot (used by the Compose target). |
| `aggregate-helm-synth-auth.yaml` | The same broker with a referenceable password credential attached, materialized as a Kubernetes Secret and referenced by the StatefulSet (used by the Kubernetes target). |
| `manifest-compose.yaml` | Maps the RabbitMQ type to the Compose Recipe (`compose/rabbitmq`) and the credential to `dotenv-secret`. |
| `manifest-helm-synth.yaml` | Maps the RabbitMQ type to the synthesized helm Recipe (`helm/rabbitmq`) and the credential to `k8s-secret-from-parameter`. |
| `release-compose.yaml` / `release-helm-synth.yaml` | Operator records for the two targets, inline development password. |
| `release-compose-auth.yaml` / `release-helm-synth-auth.yaml` | Operator records that supply the password through the credential slot. |

The Recipe references in the Manifests are provider-scoped (`compose/rabbitmq`,
`helm/rabbitmq`) because a Recipe of the same name exists for each provider.

## What it demonstrates

- **One authoring surface, many targets.** A single Aggregate is the source of
  truth for *what* the stack is. Each Manifest says *how* to realize it.
- **A durable broker.** RabbitMQ persists queues and messages, so the component
  is typed as a `stateful-server`. On Kubernetes the synthesized Recipe renders
  a **StatefulSet** with a per-replica persistent volume mounted at the RabbitMQ
  data directory and a Headless Service for stable network identity; the Compose
  service exposes the broker for local development.
- **Chart-free synthesis (Kubernetes).** The Kubernetes target runs the official
  `rabbitmq` image directly. The compiler synthesizes the StatefulSet, the
  ClusterIP Service, and the Headless Service from the component's `infra`
  sizing — no external chart to source or track. The image tag is pinned through
  `infra.engine_version`, so the render carries no floating tag.
- **Both broker ports.** The image is management-enabled, so the broker exposes
  the AMQP port (5672) and the management dashboard (15672) on the container and
  on the ClusterIP Service.
- **Deterministic credentials.** RabbitMQ always authenticates. When no
  credential is attached, each Recipe supplies a fixed inline development
  password so the render is byte-identical across runs. When a credential is
  attached, the injected value sets the broker password: on Compose it becomes
  the `RABBITMQ_DEFAULT_PASS` service environment variable; on Kubernetes it is
  materialized as a Secret and referenced by an env `secretKeyRef`, so the
  plaintext never lands in the rendered manifest.

## Build

This workspace carries no `.aggrega-config.yaml`, so the standard-library
entities resolve from the hub registry, `hub.aggrega.ai`, and no catalog flag is
needed; `--auto-pull` writes the lockfile a fresh clone lacks during the build:

```sh
# Local development (Docker Compose), inline development password
aggrega build --release release-compose.yaml --auto-pull

# Kubernetes (synthesized helm Recipe, official rabbitmq image), inline password
aggrega build --release release-helm-synth.yaml --auto-pull

# The same targets with a password credential attached
aggrega build --release release-compose-auth.yaml --auto-pull
aggrega build --release release-helm-synth-auth.yaml --auto-pull
```

Rendered artifacts land under `dist/`.

## Credential delivery note

On Compose the credential is an inject-value secret: its value is delivered on
the component's environment pipe and becomes the `RABBITMQ_DEFAULT_PASS` service
environment variable. On Kubernetes the credential is referenceable: it is
materialized as a Kubernetes Secret, and the StatefulSet references it via an
env `secretKeyRef`, so the plaintext password never appears in the workload
manifest. The `origin` value in the auth Aggregates is a development
placeholder; supply a real value through your credential source for any real
deployment. The inline development password used when no credential is attached
is likewise for local use only.
