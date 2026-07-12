# MinIO — one Aggregate, two targets, optional root credential

This example compiles a single **MinIO** S3-compatible object-storage server
from one Developer-authored `Aggregate` to two deployment realizations:

- **Docker Compose** for local development, and
- the **synthesized helm Recipe** running the official upstream `minio/minio`
  image directly on Kubernetes (no external chart).

The synthesized helm Recipe is the Kubernetes path: it depends only on an
official image tag rather than a third-party chart, and its rendered resource
set is exactly what the workload declares.

The same `aggregate.yaml` drives both. Only the Recipe layer selected by the
Manifest changes per realization. Two further Aggregates show the same server
with an optional root-password credential attached: `aggregate-auth.yaml` for
the Compose path (an inject-value credential surfaced as an environment
variable), and `aggregate-helm-synth-auth.yaml` for the synthesized helm path (a
referenceable credential materialized as a Kubernetes Secret).

The packaged MinIO server is **AGPL-3.0**.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: one `store` component of type `core/storage/minio`, no credential — the root account uses the Recipe's deterministic development password. |
| `aggregate-auth.yaml` | The same server with a root-password credential attached to the component's optional `root_password` slot (Compose path). |
| `aggregate-helm-synth-auth.yaml` | The same server with a referenceable credential attached for the synthesized helm path — the value is materialized as a Kubernetes Secret the Deployment references. |
| `manifest-compose.yaml` | Maps the MinIO type to the Compose Recipe (`compose/minio`) and the credential to `dotenv-secret`. |
| `manifest-helm-synth.yaml` | Maps the MinIO type to the synthesized helm Recipe (`helm/minio`) and the credential to `k8s-secret-from-parameter`. |
| `release-compose.yaml` / `release-helm-synth.yaml` | Operator records for the two realizations, no attached credential. |
| `release-compose-auth.yaml` / `release-helm-synth-auth.yaml` | Operator records that enable authentication. |

## What it demonstrates

- **One authoring surface, many targets.** A single Aggregate is the source of
  truth for *what* the stack is. Each Manifest says *how* to realize it.
- **A self-hosted object store, not a managed bucket.** MinIO runs and owns the
  storage process, so the component is a `server` backed by a data volume — not
  a managed-cloud storage resource. On Kubernetes the synthesized helm Recipe
  renders a **Deployment** with a PersistentVolumeClaim mounted at `/data`; on
  Compose the service mounts a named volume at the same path and starts the
  server with `minio server /data`.
- **Workload synthesis (Kubernetes).** The synthesized helm Recipe declares a
  Workload — a Deployment plus a ClusterIP Service running the official
  `minio/minio` image, started with `minio server /data --address :9000` — that
  the helm provider translates into Kubernetes manifests with no external chart.
  The rendered resource set is exactly what the Workload declares. Because both a
  Compose and a synthesized helm Recipe carry the name `minio`, the Manifests
  reference them provider-scoped as `compose/minio` and `helm/minio`.
- **A deterministic root password.** The MinIO root account is always present.
  This component wires the password through an optional `root_password`
  credential slot: when no credential is attached (the base Aggregate) the Recipe
  sets a deterministic development password, so the render is byte-identical
  across runs; when a credential is attached, the injected value becomes the root
  password. On Compose it surfaces as the `MINIO_ROOT_PASSWORD` environment
  variable; on Kubernetes the synthesized helm path materializes it as a Secret
  the Deployment references through an env `secretKeyRef`, so the plaintext never
  appears in the Deployment manifest.

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

# Kubernetes (synthesized helm Recipe, official image), development root password
aggrega build --release release-helm-synth.yaml

# The same realizations with authentication enabled
aggrega build --release release-compose-auth.yaml
aggrega build --release release-helm-synth-auth.yaml
```

Rendered artifacts land under `dist/`.

## Credential delivery note

On the Compose path the credential is an inject-value secret
(`aggregate-auth.yaml`): its value is delivered on the component's environment
pipe and becomes the `MINIO_ROOT_PASSWORD` service environment variable.

The synthesized helm path uses a referenceable credential
(`aggregate-helm-synth-auth.yaml`): the value is materialized as a Kubernetes
Secret, and the Deployment references it through an env `secretKeyRef` bound to
`MINIO_ROOT_PASSWORD`. The plaintext password therefore never appears in the
Deployment manifest — only in the Secret.

The `origin` value in the authenticated Aggregates is a development placeholder;
supply a real value through your credential source for any real deployment.

## Run it (Compose)

```sh
aggrega build --release release-compose.yaml
docker compose -f dist/app/compose/docker-compose.yaml up -d
```

Open <http://localhost:9000> — the MinIO S3 API endpoint — and authenticate as
`admin` with the development password using any S3 client. Tear down with
`docker compose -f dist/app/compose/docker-compose.yaml down`.
