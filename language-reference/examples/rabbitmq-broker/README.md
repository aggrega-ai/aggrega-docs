# RabbitMQ — one Aggregate, two targets, optional authentication

This example compiles a single **RabbitMQ** message broker (AMQP) from one
Developer-authored `Aggregate` to two deployment targets:

- **Docker Compose** for local development, and
- the **Bitnami RabbitMQ Helm chart** for Kubernetes.

The same `aggregate.yaml` drives both. Only the Recipe layer selected by the
Manifest changes per target. A second Aggregate, `aggregate-auth.yaml`, shows
the same broker with a password credential attached.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: one `broker` component of type `core/messaging/rabbitmq`, no credential — the Recipe supplies a deterministic inline development password. |
| `aggregate-auth.yaml` | The same broker with a password credential attached to the component's optional `password` slot. |
| `manifest-compose.yaml` | Maps the RabbitMQ type to the Compose Recipe (`rabbitmq`) and the credential to `dotenv-secret`. |
| `manifest-bitnami.yaml` | Maps the RabbitMQ type to the Bitnami chart-wrap Recipe (`rabbitmq-bitnami`) and the credential to `env-secret`. |
| `release-compose.yaml` / `release-bitnami.yaml` | Operator records for the two targets, inline development password. |
| `release-compose-auth.yaml` / `release-bitnami-auth.yaml` | Operator records that deploy `aggregate-auth.yaml`, supplying the password through the credential slot. |

## What it demonstrates

- **One authoring surface, many targets.** A single Aggregate is the source of
  truth for *what* the stack is. Each Manifest says *how* to realize it.
- **A durable broker.** RabbitMQ persists queues and messages, so the component
  is typed as a `stateful-server`. On Kubernetes the chart renders a
  **StatefulSet** with a persistent volume; the Compose service exposes the
  broker for local development.
- **Chart wrapping (Kubernetes).** The Bitnami target sources the upstream
  RabbitMQ chart by OCI reference and maps the component's `infra` onto the
  chart's own value structure — `auth`, `containerPorts`, `service.ports`,
  `persistence`, and `resources`.
- **Deterministic credentials.** RabbitMQ always authenticates. When no
  credential is attached, each Recipe supplies a fixed inline development
  password (and the chart-wrap Recipe pins the Erlang cookie) so the render is
  byte-identical across runs rather than relying on the chart's random
  password generation. When a credential is attached (`aggregate-auth.yaml`),
  the injected value sets the broker password on both targets.

## Build

The workspace catalog supplies the standard-library entities, so no explicit
catalog flag is needed:

```sh
# Local development (Docker Compose), inline development password
aggrega build --release release-compose.yaml

# Kubernetes (Bitnami RabbitMQ Helm chart), inline development password
aggrega build --release release-bitnami.yaml

# The same targets with a password credential attached
aggrega build --release release-compose-auth.yaml
aggrega build --release release-bitnami-auth.yaml
```

Rendered artifacts land under `dist/`. The Kubernetes build resolves the
upstream chart by OCI reference on first run and pins it in a lockfile.

## Credential delivery note

On both targets the credential is an inject-value secret: its value is delivered
on the component's environment pipe. On Compose it becomes the
`RABBITMQ_DEFAULT_PASS` service environment variable. On Kubernetes the
chart-wrap Recipe feeds the value into the chart's `auth.password`, and the
chart provisions the Kubernetes Secret and mounts it into the workload — so the
authenticated stack renders complete, with no out-of-band Secret to supply. The
`origin` value in `aggregate-auth.yaml` is a development placeholder; supply a
real value through your credential source for any real deployment. The inline
development password used when no credential is attached is likewise for local
use only.
