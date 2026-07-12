# MinIO — one Aggregate, two targets, optional root credential

This example compiles a single **MinIO** S3-compatible object-storage server
from one Developer-authored `Aggregate` to two deployment targets:

- **Docker Compose** for local development, and
- the **Bitnami MinIO Helm chart** for Kubernetes.

The same `aggregate.yaml` drives both. Only the Recipe layer selected by the
Manifest changes per target. A second Aggregate, `aggregate-auth.yaml`, shows
the same server with a root-password credential attached.

The packaged MinIO server is **AGPL-3.0**.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: one `store` component of type `core/storage/minio`, no credential — the root account uses the Recipe's deterministic development password. |
| `aggregate-auth.yaml` | The same server with a root-password credential attached to the component's optional `root_password` slot. |
| `manifest-compose.yaml` | Maps the MinIO type to the Compose Recipe (`minio`) and the credential to `dotenv-secret`. |
| `manifest-bitnami.yaml` | Maps the MinIO type to the Bitnami chart-wrap Recipe (`minio-bitnami`) and the credential to `env-secret`. |
| `release-compose.yaml` / `release-bitnami.yaml` | Operator records for the two targets, no attached credential. |
| `release-compose-auth.yaml` / `release-bitnami-auth.yaml` | Operator records that deploy `aggregate-auth.yaml`, supplying the root password. |

## What it demonstrates

- **One authoring surface, many targets.** A single Aggregate is the source of
  truth for *what* the stack is. Each Manifest says *how* to realize it.
- **A self-hosted object store, not a managed bucket.** MinIO runs and owns the
  storage process, so the component is a `server` backed by a data volume — not
  a managed-cloud storage resource. On Kubernetes the chart renders a
  **Deployment** with a PersistentVolumeClaim; on Compose the service mounts a
  named volume at `/data` and starts the server with `minio server /data`.
- **Chart wrapping (Kubernetes).** The Bitnami target sources the upstream MinIO
  chart by OCI reference and maps the component's `infra` onto the chart's own
  value structure — `image`, `auth`, `containerPorts`, `resources`, `service`,
  and `persistence`. The chart publishes a resolvable image tag for this
  appVersion, so the Recipe pins that tag for a reproducible render.
- **A single standalone server.** The chart-wrap Recipe pins `mode: standalone`
  and disables the separate MinIO Console application, so the chart renders
  exactly one workload of each kind — a complete, unambiguous render rather than
  the two-application shape the chart emits with the Console enabled.
- **A deterministic root password.** The MinIO root account is always present.
  Left to itself, the chart generates a fresh random root password on every
  render, which is non-deterministic. This component instead wires the password
  through an optional `root_password` credential slot: when no credential is
  attached (the base Aggregate) the Recipe sets a deterministic development
  password, so the render is byte-identical across runs; when a credential is
  attached (`aggregate-auth.yaml`) the injected value becomes the root password
  — feeding the chart's `auth.rootPassword` on Kubernetes (the chart provisions
  its own Secret from it) and the `MINIO_ROOT_PASSWORD` environment variable on
  Compose.

## Not modelled here

MinIO is deployed as a single standalone object store. Distributed,
erasure-coded topologies for high availability, and provisioning buckets or
policies at start-up, are natural next refinements and are not modelled by this
component today.

## Build

The workspace catalog supplies the standard-library entities, so no explicit
catalog flag is needed:

```sh
# Local development (Docker Compose), development root password
aggrega build --release release-compose.yaml

# Kubernetes (Bitnami MinIO Helm chart), development root password
aggrega pull  --release release-bitnami.yaml
aggrega build --release release-bitnami.yaml

# The same targets with an operator-supplied root credential
aggrega build --release release-compose-auth.yaml
aggrega pull  --release release-bitnami-auth.yaml
aggrega build --release release-bitnami-auth.yaml
```

Rendered artifacts land under `dist/`. The Kubernetes build resolves the
upstream chart by OCI reference on first run and pins it in a lockfile.

## Credential delivery note

On both targets the credential is an inject-value secret: its value is delivered
on the component's environment pipe. On Compose it becomes the
`MINIO_ROOT_PASSWORD` service environment variable directly. On Kubernetes the
chart-wrap Recipe feeds the value into the chart's `auth.rootPassword`, and the
chart provisions the Kubernetes Secret and mounts it into the workload — so the
authenticated stack renders complete, with no out-of-band Secret to supply. The
`origin` value in `aggregate-auth.yaml` is a development placeholder; supply a
real value through your credential source for any real deployment.

## Run it (Compose)

```sh
aggrega build --release release-compose.yaml
docker compose -f dist/app/compose/docker-compose.yaml up -d
```

Open <http://localhost:9000> — the MinIO S3 API endpoint — and authenticate as
`admin` with the development password using any S3 client. Tear down with
`docker compose -f dist/app/compose/docker-compose.yaml down`.
