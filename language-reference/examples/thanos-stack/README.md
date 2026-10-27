---
example:
  level: start
  products: [core/observability/thanos-query, core/observability/thanos-store, core/storage/s3-object-store]
  shows: [modules]
---

# Thanos stack — a metrics read tier over object storage, composed as a module

This example compiles a small, real stack — the **read/query tier of a Thanos
metrics system** — to synthesized Kubernetes manifests from one
Developer-authored `Aggregate`.

The read tier is not a single component. It is a **module**: a reusable
sub-aggregate that composes three single-workload components —

- an **S3-compatible object store** that holds historical metric blocks on a
  volume and serves them over the S3 API,
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
| `manifest-helm-synth.yaml` | Maps the object store, Store Gateway, and Query types to their synth helm Recipes, and the credential Feature the module attaches to the realization that emits a Secret from each of the module's two key parameters. |
| `release-helm-synth.yaml` | Operator record for the Kubernetes target. Sizes the module's internal components by their module-scoped IDs; anything left to schema defaults renders self-contained. |

## Runtime prerequisite

This module is the **read/query tier only**. The object store creates the
`thanos` bucket the Store Gateway reads from before it serves, so the one thing
to provide at runtime, outside the rendered manifests, is **a writer that
produces metric blocks**. The read tier serves blocks; it does not create them.
A writer — a Thanos Receive tier or a Prometheus instance with the Thanos
sidecar — must ship metric blocks into the same bucket. Until a writer has
uploaded blocks, the Store Gateway serves an empty result set.

## Build

This workspace carries no `.aggrega-config.yaml`, so the standard-library
entities resolve from the hub registry, `hub.aggrega.ai`, and no catalog flag is
needed; `--auto-pull` writes the lockfile a fresh clone lacks during the build:

```sh
aggrega build --release release-helm-synth.yaml --auto-pull
```

Rendered artifacts land under `dist/`. The Kubernetes target renders plain
manifests offline — no chart pull is required.

## What the composed stack looks like

The Store Gateway renders as a stateless Deployment plus a ClusterIP Service
exposing its StoreAPI gRPC port and HTTP port. Its container is started with
`thanos store` and a single inline `--objstore.config` flag whose value is the S3
stanza built from the endpoint the object store publishes — its in-cluster
Service name and port, with `insecure: true` because that endpoint is served
over plain HTTP. That configuration selects the AWS SDK credential chain,
so it carries no secret; both halves of the access key arrive as environment
variables read from Secrets:

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
      endpoint: metrics-zdobjstore-default:8333
      insecure: true
      aws_sdk_auth: true
[… omitted: the container ports for the two addresses named in the args]
env:
  - name: AWS_ACCESS_KEY_ID
    valueFrom:
      secretKeyRef:
        name: metrics-zdstore-s3.credential-id
        key: s3-access-key
  - name: AWS_SECRET_ACCESS_KEY
    valueFrom:
      secretKeyRef:
        name: metrics-zdstore-s3.credential
        key: s3-secret-key
[… omitted: the container's resources and its liveness and readiness probes]
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
  - metrics-zdstore-default:10901
```

The object store renders as a SeaweedFS StatefulSet of one replica with a volume
claim mounted at `/data`, a ClusterIP Service on the S3 port, 8333, and the
headless Service the StatefulSet names. An init container creates the `thanos`
bucket before the server serves. The server's account is the same key pair,
read from two Secrets of its own, `metrics-zdobjstore-access-key-id` and
`metrics-zdobjstore-secret-access-key`. The four Secrets are emitted beside the
workloads, two for the object store's key slots and two for the key pair the
Store Gateway's `s3` connection carries, each carrying the module's development
default.

## What it demonstrates

- **Composition as a module.** A multi-workload capability — a metrics read tier
  that is really an object store plus a Store Gateway plus a query front end — is
  packaged as a sub-aggregate composing three single-workload components, not as
  one monolithic component. The module is imported by name and reused wherever a
  Thanos read tier is needed.
- **Reuse of a shipped backend.** The object store is the standard-library
  `core/storage/s3-object-store` component, reused as-is; the read tier adds no
  storage logic of its own. The Manifest selects its SeaweedFS realization, so
  the store runs in the cluster beside the read tier.
- **Internal edges inside the module.** The Store Gateway declares a use of the
  object store and Query declares a use of the Store Gateway; the object store's
  published `endpoint` and the Store Gateway's published host and port are
  piped into the consumer on each edge, and each consumer's Recipe builds its
  address from them. The compiler routes the strings without interpreting them.
- **A public endpoint.** The module exports Query as `query`, the stable public
  name a consumer connects to — decoupled from the module's internal component
  names.
- **Secret-free configuration.** The object-store configuration selects the AWS
  SDK credential chain, so the rendered configuration carries no secret; the
  credentials flow only as environment variables.
- **A shared key pair, taken by reference.** The Store Gateway authenticates to
  the object store with the store's own account, so the two share one key pair.
  The module takes each half as a parameter, `s3_access_key` and
  `s3_secret_key`, and attaches the `core/referenced-secret` credential Feature
  with each twice: to the object store's `access_key_id` and
  `secret_access_key` slots, and as the `credential_id` and `credential` of the
  Store Gateway's connection to the object store, the connection the gateway
  presents them on. Each workload reads both from Secrets rather than carrying
  them inline. Because the module attaches that Feature, the Manifest maps it.
  This example leaves the parameters at the module's development defaults and
  maps the Feature to `k8s-secret-from-parameter`, which emits a Secret carrying
  each value, so the stack runs self-contained. For a Release carrying real
  traffic, the Aggregate declares parameters of its own and passes them down
  through `aggregates.metrics.parameters`, the Release fulfills them, and the
  Manifest maps the Feature to `k8s-existing-secret`, which reads each
  parameter as the name of a Secret that already exists in the namespace.
- **Reproducible images.** Every component pins an explicit image tag, so the
  rendered manifests reference stable images.
