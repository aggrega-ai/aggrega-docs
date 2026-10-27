---
example:
  level: start
  products: [core/observability/grafana]
  shows: [multi-target, credentials]
---

# Grafana — one Aggregate, two targets, optional admin credential

This example compiles a single **Grafana** dashboards and visualization server
from one Developer-authored `Aggregate` to two realizations:

- **Docker Compose** for local development, and
- the **synthesized helm Recipe** running the official upstream `grafana/grafana`
  image directly on Kubernetes (no external chart).

The synthesized helm Recipe is the Kubernetes path: it depends only on an
official image tag rather than a third-party chart, and its rendered resource
set is exactly what the workload declares.

The same `aggregate.yaml` drives both. Only the Recipe layer selected by the
Manifest changes per realization. Two further Aggregates show the same server
with an optional admin-password credential attached: `aggregate-auth.yaml` for
the Compose path (an inject-value credential surfaced as an environment
variable), and `aggregate-helm-synth-auth.yaml` for the synthesized helm path (a
referenceable credential materialized as a Kubernetes Secret).

The packaged Grafana server is **AGPL-3.0**.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: one `dashboards` component of type `core/observability/grafana`, no credential — the admin account uses the Recipe's deterministic development password. |
| `aggregate-auth.yaml` | The same server with an admin-password credential attached to the component's optional `admin_password` slot (Compose path). |
| `aggregate-helm-synth-auth.yaml` | The same server with a referenceable credential attached for the synthesized helm path — the value is materialized as a Kubernetes Secret the Deployment references. |
| `manifest-compose.yaml` | Maps the Grafana type to the Compose Recipe (`compose/grafana`) and the credential to `dotenv-secret`. |
| `manifest-helm-synth.yaml` | Maps the Grafana type to the synthesized helm Recipe (`helm/grafana`) and the credential to `k8s-secret-from-parameter`. |
| `release-compose.yaml` / `release-helm-synth.yaml` | Operator records for the two realizations, no attached credential. |
| `release-compose-auth.yaml` / `release-helm-synth-auth.yaml` | Operator records that enable authentication. |

## What it demonstrates

- **One authoring surface, many targets.** A single Aggregate is the source of
  truth for *what* the stack is. Each Manifest says *how* to realize it.
- **A server backed by a persistent volume.** Grafana keeps its state — users,
  saved dashboards, preferences — on disk, so the component declares a data
  volume sized from `infra.storage`. On Kubernetes the synthesized helm Recipe
  renders a **Deployment** with a PersistentVolumeClaim mounted at
  `/var/lib/grafana`; on Compose the service mounts a named volume at the same
  path.
- **Workload synthesis (Kubernetes).** The synthesized helm Recipe declares a
  Workload — a Deployment plus a ClusterIP Service running the official
  `grafana/grafana` image — that the helm provider translates into Kubernetes
  manifests with no external chart. The rendered resource set is exactly what
  the Workload declares. Because both a Compose and a synthesized helm Recipe
  carry the name `grafana`, the Manifests reference them provider-scoped as
  `compose/grafana` and `helm/grafana`.
- **A deterministic admin password.** The Grafana admin account is always
  present. This component wires the password through an optional
  `admin_password` credential slot: when no credential is attached (the base
  Aggregate) the Recipe sets a deterministic development password, so the render
  is byte-identical across runs; when a credential is attached, the injected
  value becomes the admin password. On Compose it surfaces as the
  `GF_SECURITY_ADMIN_PASSWORD` environment variable; on Kubernetes the
  synthesized helm path materializes it as a Secret the Deployment references
  through an env `secretKeyRef`, so the plaintext never appears in the Deployment
  manifest.

## Not modelled here

Grafana is deployed standalone. Wiring a metrics or logs source — for example a
Prometheus server — into Grafana as a provisioned datasource is not modelled:
the component declares no `uses` socket.

## Build

This workspace carries no `.aggrega-config.yaml`, so the standard-library
entities resolve from the hub registry, `hub.aggrega.ai`, and no catalog flag is
needed; `--auto-pull` writes the lockfile a fresh clone lacks during the build:

```sh
# Local development (Docker Compose), development admin password
aggrega build --release release-compose.yaml --auto-pull

# Kubernetes (synthesized helm Recipe, official image), development admin password
aggrega build --release release-helm-synth.yaml --auto-pull

# The same realizations with authentication enabled
aggrega build --release release-compose-auth.yaml --auto-pull
aggrega build --release release-helm-synth-auth.yaml --auto-pull
```

Rendered artifacts land under `dist/`.

## Credential delivery note

On the Compose path the credential is an inject-value secret
(`aggregate-auth.yaml`): its value is delivered on the component's environment
pipe and becomes the `GF_SECURITY_ADMIN_PASSWORD` service environment variable.

The synthesized helm path uses a referenceable credential
(`aggregate-helm-synth-auth.yaml`): the value is materialized as a Kubernetes
Secret, and the Deployment references it through an env `secretKeyRef` bound to
`GF_SECURITY_ADMIN_PASSWORD`. The plaintext password therefore never appears in
the Deployment manifest — only in the Secret.

The `origin` value in the authenticated Aggregates is a development placeholder;
supply a real value through your credential source for any real deployment.

## Run it (Compose)

```sh
aggrega build --release release-compose.yaml --auto-pull
docker compose -f dist/app/compose/docker-compose.yaml up -d
```

Open <http://localhost:3000> — the Grafana web UI — and sign in as `admin` with
the development password. Tear down with
`docker compose -f dist/app/compose/docker-compose.yaml down`.
