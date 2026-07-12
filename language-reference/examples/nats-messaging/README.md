# NATS — one Aggregate, two targets, optional authentication

This example compiles a single **NATS** messaging server (pub-sub,
request-reply, queueing) from one Developer-authored `Aggregate` to two
deployment targets:

- **Docker Compose** for local development, and
- the **Bitnami NATS Helm chart** for Kubernetes.

The same `aggregate.yaml` drives both. Only the Recipe layer selected by the
Manifest changes per target. A second Aggregate, `aggregate-auth.yaml`, shows
the same server with a password credential attached.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: one `bus` component of type `core/messaging/nats`, no credential — the server runs without authentication. |
| `aggregate-auth.yaml` | The same server with a password credential attached to the component's optional `password` slot. |
| `manifest-compose.yaml` | Maps the NATS type to the Compose Recipe (`nats`) and the credential to `dotenv-secret`. |
| `manifest-bitnami.yaml` | Maps the NATS type to the Bitnami chart-wrap Recipe (`nats-bitnami`) and the credential to `env-secret`. |
| `release-compose.yaml` / `release-bitnami.yaml` | Operator records for the two targets, no authentication. |
| `release-compose-auth.yaml` / `release-bitnami-auth.yaml` | Operator records that deploy `aggregate-auth.yaml`, supplying the password through the credential slot. |

## What it demonstrates

- **One authoring surface, many targets.** A single Aggregate is the source of
  truth for *what* the stack is. Each Manifest says *how* to realize it.
- **A stateless messaging server.** In this lean shape NATS routes subjects in
  memory with JetStream file storage disabled, so the component is typed as a
  `server`. On Kubernetes the chart renders a single-replica **Deployment**
  with no persistent volume; the Compose service exposes the server for local
  development.
- **Chart wrapping (Kubernetes).** The Bitnami target sources the upstream NATS
  chart by OCI reference and maps the component's `infra` onto the chart's own
  value structure — `resourceType`, `replicaCount`, `containerPorts`,
  `service.ports`, `resources`, and `auth`.
- **Optional authentication, deterministic either way.** NATS authentication is
  off by default. When no credential is attached, neither target enables
  authentication and the render is byte-identical across runs — leaving auth
  off also avoids the chart's random-password generation. When a credential is
  attached (`aggregate-auth.yaml`), the injected value enables user/password
  authentication on both targets.

## Build

The workspace catalog supplies the standard-library entities, so no explicit
catalog flag is needed:

```sh
# Local development (Docker Compose), no authentication
aggrega build --release release-compose.yaml

# Kubernetes (Bitnami NATS Helm chart), no authentication
aggrega build --release release-bitnami.yaml

# The same targets with a password credential attached
aggrega build --release release-compose-auth.yaml
aggrega build --release release-bitnami-auth.yaml
```

Rendered artifacts land under `dist/`. The Kubernetes build resolves the
upstream chart by OCI reference on first run and pins it in a lockfile.

## Credential delivery note

On both targets the credential is an inject-value secret: its value is delivered
on the component's environment pipe. On Compose it starts the server with
user/password authentication flags. On Kubernetes the chart-wrap Recipe feeds
the value into the chart's `auth` credentials, and the chart provisions the
server configuration Secret and mounts it into the workload — so the
authenticated stack renders complete, with no out-of-band Secret to supply. The
`origin` value in `aggregate-auth.yaml` is a development placeholder; supply a
real value through your credential source for any real deployment.
