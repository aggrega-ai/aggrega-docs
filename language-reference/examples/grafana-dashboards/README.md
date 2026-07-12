# Grafana — one Aggregate, two targets, optional admin credential

This example compiles a single **Grafana** dashboards and visualization server
from one Developer-authored `Aggregate` to two deployment targets:

- **Docker Compose** for local development, and
- the **Bitnami Grafana Helm chart** for Kubernetes.

The same `aggregate.yaml` drives both. Only the Recipe layer selected by the
Manifest changes per target. A second Aggregate, `aggregate-auth.yaml`, shows
the same server with an admin-password credential attached.

The packaged Grafana server is **AGPL-3.0**.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: one `dashboards` component of type `core/observability/grafana`, no credential — the admin account uses the Recipe's deterministic development password. |
| `aggregate-auth.yaml` | The same server with an admin-password credential attached to the component's optional `admin_password` slot. |
| `manifest-compose.yaml` | Maps the Grafana type to the Compose Recipe (`grafana`) and the credential to `dotenv-secret`. |
| `manifest-bitnami.yaml` | Maps the Grafana type to the Bitnami chart-wrap Recipe (`grafana-bitnami`) and the credential to `env-secret`. |
| `release-compose.yaml` / `release-bitnami.yaml` | Operator records for the two targets, no attached credential. |
| `release-compose-auth.yaml` / `release-bitnami-auth.yaml` | Operator records that deploy `aggregate-auth.yaml`, supplying the admin password. |

## What it demonstrates

- **One authoring surface, many targets.** A single Aggregate is the source of
  truth for *what* the stack is. Each Manifest says *how* to realize it.
- **A stateful server rendered as a Deployment.** Grafana keeps its state —
  users, saved dashboards, preferences — on disk, so the component declares a
  data volume sized from `infra.storage`. On Kubernetes the chart renders a
  **Deployment** with a PersistentVolumeClaim; on Compose the service mounts a
  named volume at `/var/lib/grafana`.
- **Chart wrapping (Kubernetes).** The Bitnami target sources the upstream
  Grafana chart by OCI reference and maps the component's `infra` onto the
  chart's own value structure — `image`, `admin`, `grafana.containerPorts`,
  `grafana.resources`, `service.ports`, and `persistence`. The chart publishes a
  resolvable image tag for this appVersion, so the Recipe pins that tag for a
  reproducible render.
- **A deterministic admin password.** The Grafana admin account is always
  present. Left to itself, the chart generates a fresh random admin password on
  every render, which is non-deterministic. This component instead wires the
  password through an optional `admin_password` credential slot: when no
  credential is attached (the base Aggregate) the Recipe sets a deterministic
  development password, so the render is byte-identical across runs; when a
  credential is attached (`aggregate-auth.yaml`) the injected value becomes the
  admin password — feeding the chart's `admin.password` on Kubernetes (the chart
  provisions its own Secret from it) and the `GF_SECURITY_ADMIN_PASSWORD`
  environment variable on Compose.

## Not modelled here

Grafana is deployed standalone. Wiring a metrics or logs source — for example a
Prometheus server — into Grafana as a provisioned datasource through a `uses`
socket is a natural next refinement, and is not modelled by this component
today.

## Build

The workspace catalog supplies the standard-library entities, so no explicit
catalog flag is needed:

```sh
# Local development (Docker Compose), development admin password
aggrega build --release release-compose.yaml

# Kubernetes (Bitnami Grafana Helm chart), development admin password
aggrega pull  --release release-bitnami.yaml
aggrega build --release release-bitnami.yaml

# The same targets with an operator-supplied admin credential
aggrega build --release release-compose-auth.yaml
aggrega pull  --release release-bitnami-auth.yaml
aggrega build --release release-bitnami-auth.yaml
```

Rendered artifacts land under `dist/`. The Kubernetes build resolves the
upstream chart by OCI reference on first run and pins it in a lockfile.

## Credential delivery note

On both targets the credential is an inject-value secret: its value is delivered
on the component's environment pipe. On Compose it becomes the
`GF_SECURITY_ADMIN_PASSWORD` service environment variable directly. On
Kubernetes the chart-wrap Recipe feeds the value into the chart's
`admin.password`, and the chart provisions the Kubernetes Secret and mounts it
into the workload — so the authenticated stack renders complete, with no
out-of-band Secret to supply. The `origin` value in `aggregate-auth.yaml` is a
development placeholder; supply a real value through your credential source for
any real deployment.

## Run it (Compose)

```sh
aggrega build --release release-compose.yaml
docker compose -f dist/app/compose/docker-compose.yaml up -d
```

Open <http://localhost:3000> — the Grafana web UI — and sign in as `admin` with
the development password. Tear down with
`docker compose -f dist/app/compose/docker-compose.yaml down`.
