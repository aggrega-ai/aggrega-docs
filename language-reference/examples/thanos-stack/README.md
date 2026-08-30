# Thanos stack — a metrics read tier over object storage, composed as a module

This example compiles a small, real stack — the **read/query tier of a Thanos
metrics system** — to synthesized Kubernetes manifests from one
Developer-authored `Aggregate`.

The read tier is not a single component. It is a **module**: a reusable
sub-aggregate that composes three single-workload components —

- a **MinIO object store** that holds historical metric blocks on a volume and
  serves them over an S3-compatible API,
- a **Store Gateway** that reads those blocks from the object store and serves
  them to queriers over its StoreAPI, holding only an ephemeral local cache, and
- a **Query** front end that answers PromQL and fans requests out over the Store
  Gateway's StoreAPI, holding no state of its own.

The module wires its own internal edges — the Store Gateway to the object store,
and Query to the Store Gateway — and exports Query as its public endpoint
`query`. The top-level Aggregate imports the module by name and renders the
composed stack; the operator sizes the module's internal components in the
Release.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: imports the Thanos read-tier module (`core/thanos`). |
| `manifest-helm-synth.yaml` | Maps the object store, Store Gateway, and Query types to their synth helm Recipes. |
| `release-helm-synth.yaml` | Operator record for the Kubernetes target. Sizes the module's internal components by their module-scoped IDs; anything left to schema defaults renders self-contained. |

## Runtime prerequisites

This module is the **read/query tier only**. Two things must be provided at
runtime, outside the rendered manifests, before the stack serves useful data:

- **A pre-created bucket.** The Store Gateway reads from the `thanos` bucket in
  the object store, but MinIO does not auto-create it. Create it once against the
  running MinIO endpoint, e.g. with the MinIO client:

  ```sh
  mc alias set local http://<minio-host>:9000 admin dev-minio-root-change-me
  mc mb local/thanos
  ```

- **A writer that produces metric blocks.** The read tier serves blocks; it does
  not create them. A writer — a Thanos Receive tier or a Prometheus instance with
  the Thanos sidecar — must ship metric blocks into the same bucket. Until a
  writer has uploaded blocks, the Store Gateway serves an empty result set.

## Build

The workspace catalog supplies the standard-library entities, so no explicit
catalog flag is needed:

```sh
aggrega build --release release-helm-synth.yaml
```

Rendered artifacts land under `dist/`. The Kubernetes target renders plain
manifests offline — no chart pull is required.

## What the composed stack looks like

The Store Gateway renders as a stateless Deployment plus a ClusterIP Service
exposing its StoreAPI gRPC port and HTTP port. Its container is started with
`thanos store` and a single inline `--objstore.config` flag whose value is the S3
stanza composed from the object-store edge — the object store's in-cluster
Service name and port. That configuration selects the AWS SDK credential chain,
so it carries no secret; the credentials arrive as environment variables:

```yaml
args:
  - store
  - --grpc-address
  - 0.0.0.0:10901
  - --http-address
  - 0.0.0.0:10902
  - --data-dir
  - /var/thanos/store
  - |-
    --objstore.config=type: S3
    config:
      bucket: thanos
      endpoint: metrics.objstore-default:9000
      insecure: true
      aws_sdk_auth: true
[… omitted: the container ports for the two addresses named in the args]
env:
  - name: AWS_ACCESS_KEY_ID
    value: admin
  - name: AWS_SECRET_ACCESS_KEY
    value: dev-minio-root-change-me
```

Query renders as a stateless Deployment plus a ClusterIP Service on its HTTP
port. Its container is started with `thanos query` and dials the Store Gateway's
StoreAPI on the endpoint composed from the store edge:

```yaml
args:
  - query
  - --http-address
  - 0.0.0.0:10902
  - --grpc-address
  - 0.0.0.0:10901
  - --endpoint
  - metrics.store-default:10901
```

The object store renders as a Deployment with a persistent volume mounted at
`/data`, plus a ClusterIP Service on the S3 API port.

## What it demonstrates

- **Composition as a module.** A multi-workload capability — a metrics read tier
  that is really an object store plus a Store Gateway plus a query front end — is
  packaged as a sub-aggregate composing three single-workload components, not as
  one monolithic component. The module is imported by name and reused wherever a
  Thanos read tier is needed.
- **Reuse of a shipped backend.** The object store is the standard-library
  `core/storage/minio` component, reused as-is; the read tier adds no storage
  logic of its own.
- **Internal edges inside the module.** The Store Gateway declares a use of the
  object store and Query declares a use of the Store Gateway; each target's
  `provides` host and port are piped into the consumer and composed into an
  endpoint. The compiler routes the strings without interpreting them.
- **A public endpoint.** The module exports Query as `query`, the stable public
  name a consumer connects to — decoupled from the module's internal component
  names.
- **Secret-free configuration.** The object-store configuration selects the AWS
  SDK credential chain, so the rendered configuration carries no secret; the
  credentials flow only as environment variables. This example uses a shared
  inline development default matching the object store's own default, so the
  stack runs self-contained with no external secret.
- **Reproducible images.** Every component pins an explicit image tag, so the
  rendered manifests reference stable images.
