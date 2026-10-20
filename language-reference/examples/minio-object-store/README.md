# MinIO — one component, two targets, a required root credential

This example compiles a single **MinIO** S3-compatible object-storage server
to two realizations:

- **Docker Compose** for local development, and
- the **synthesized helm Recipe** running the official upstream `minio/minio`
  image directly on Kubernetes (no external chart).

The synthesized helm Recipe is the Kubernetes path: it depends only on an
official image tag rather than a third-party chart, and its rendered resource
set is exactly what the workload declares.

The MinIO root password is a required credential with no default, so a build
must fill the component's `root_password` slot. `aggregate.yaml` fills nothing
and shows the build halting on that; the two other Aggregates fill the slot in
the form each target delivers it: `aggregate-auth.yaml` for the Compose path (an
inject-value credential surfaced as an environment variable), and
`aggregate-helm-synth-auth.yaml` for the synthesized helm path (a referenceable
credential materialized as a Kubernetes Secret).

The packaged MinIO server is **AGPL-3.0**.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: one `store` component of type `core/storage/minio`, no credential — a build of it halts, naming the empty `root_password` slot. |
| `aggregate-auth.yaml` | The same server with a root-password credential attached to the component's required `root_password` slot (Compose path). |
| `aggregate-helm-synth-auth.yaml` | The same server with a referenceable credential attached for the synthesized helm path — the value is materialized as a Kubernetes Secret the Deployment references. |
| `manifest-compose.yaml` | Maps the MinIO type to the Compose Recipe (`compose/minio`) and the credential to `dotenv-secret`. |
| `manifest-helm-synth.yaml` | Maps the MinIO type to the synthesized helm Recipe (`helm/minio`) and the credential to `k8s-secret-from-parameter`. |
| `release-compose.yaml` / `release-helm-synth.yaml` | Operator records for the two realizations of `aggregate.yaml`, which attaches no credential, so each build halts. |
| `release-compose-auth.yaml` / `release-helm-synth-auth.yaml` | Operator records for the two Aggregates that fill the slot. |

## What it demonstrates

- **One component, many targets.** The same `core/storage/minio` component is
  realized on both targets; each Manifest says *how* to realize it.
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
- **A required root password with no default.** The MinIO root account is always
  present, and its password opens the whole server, the metrics token included,
  so no value every reader of the catalog holds stands in for it. The component
  declares the `root_password` slot required: a build with nothing in it halts
  before anything renders, naming the slot, and the attached credential becomes
  the root password. On Compose it surfaces as the `MINIO_ROOT_PASSWORD`
  environment variable; on Kubernetes the synthesized helm path materializes it
  as a Secret the Deployment references through an env `secretKeyRef`, so the
  plaintext never appears in the Deployment manifest.

## Not modelled here

MinIO is deployed as a single standalone object store. Distributed,
erasure-coded topologies for high availability, and provisioning buckets or
policies at start-up, are natural next refinements and are not modelled by this
component today.

## Build

The workspace catalog supplies the standard-library entities, so no explicit
catalog flag is needed:

```sh
# Local development (Docker Compose)
aggrega build --release release-compose-auth.yaml

# Kubernetes (synthesized helm Recipe, official image)
aggrega build --release release-helm-synth-auth.yaml
```

Rendered artifacts land under `dist/`.

Building `aggregate.yaml`, which fills no credential, halts on either target
before anything renders:

```sh
aggrega build --release release-compose.yaml
```

```text
[DEVELOPER_ERROR E0006] aggregate.yaml at .spec.components.store.features.root_password
  required attachment slot unfilled ("root_password", declared required by component type "core/storage/minio"). Attach a Feature at that name, in the Aggregate or in the Release, on the component or at a scope above it.
```

`release-helm-synth.yaml` halts the same way. The fix is the step the two other
Aggregates take: attach a credential under `features.root_password` on the
`store` component.

## Credential delivery note

On the Compose path the credential is an inject-value secret
(`aggregate-auth.yaml`): its value is delivered on the component's environment
pipe and becomes the `MINIO_ROOT_PASSWORD` service environment variable.

The synthesized helm path uses a referenceable credential
(`aggregate-helm-synth-auth.yaml`): the value is materialized as a Kubernetes
Secret, and the Deployment references it through an env `secretKeyRef` bound to
`MINIO_ROOT_PASSWORD`. The plaintext password therefore never appears in the
Deployment manifest — only in the Secret.

The `origin` value in the two filled Aggregates is a development placeholder;
supply a real value through your credential source for any real deployment.

## Run it (Compose)

```sh
aggrega build --release release-compose-auth.yaml
docker compose -f dist/app/compose/docker-compose.yaml up -d
```

Open <http://localhost:9000> — the MinIO S3 API endpoint — and authenticate as
`admin` with the password `aggregate-auth.yaml` sets as its credential's
`origin`, using any S3 client. Tear down with
`docker compose -f dist/app/compose/docker-compose.yaml down`.
