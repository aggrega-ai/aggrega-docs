---
example:
  level: start
  products: [core/observability/loki]
  shows: [external-sources]
---

# Loki — Kubernetes log-aggregation server

This example compiles a small, real stack — a **Grafana Loki** log-aggregation
server — from one Developer-authored `Aggregate` to Kubernetes, backed by the
**official Grafana Loki Helm chart** in its single-binary shape.

Loki is a log backend: it receives log streams over its HTTP push API, indexes
them by label rather than by full-text content, stores them in a chunk object
store, and answers log-query and range requests over the same HTTP API. In the
single-binary shape every Loki subsystem — distributor, ingester, querier,
compactor — runs inside one process backed by a local chunk store, so the whole
server is one stateful workload. A log shipper pushes streams to Loki; a
dashboards server reads them back over the query API.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: a single `logging` component (`core/observability/loki`) keeping logs for seven days. |
| `manifest.yaml` | Maps the component type to the Loki sourced Recipe (`loki`). |
| `release.yaml` | Operator record for the Kubernetes target: the server compute and chunk-store volume size. |

## What it demonstrates

- **One authoring surface.** A single Aggregate is the source of truth for
  *what* Loki is; the Manifest says *how* to realize it.
- **A single-binary log backend.** The sourced Recipe renders Loki as one
  `StatefulSet` with a data volume, its config in `ConfigMap`s, `Service`s
  exposing the HTTP push-and-query endpoint, and a `ServiceAccount` — a single
  self-contained workload, with the distributed scaling paths and bundled
  auxiliary services held off.
- **Developer-set retention.** The developer's `retention_period` flows into the
  in-process compactor, which deletes stored log streams once they age past it.
- **An exported ingestion contract.** The component exports its in-cluster
  service host and port through the `uses` topology, so a log shipper wires to
  it and pushes streams there.
- **Reproducible images.** The Recipe pins the Loki server image and the
  config-reload sidecar image to resolvable tags so the rendered workload
  references pinned versions.

## Build

This workspace carries no `.aggrega-config.yaml`, so the standard-library
entities resolve from the hub registry, `hub.aggrega.ai`, and no catalog flag is
needed:

```sh
aggrega pull  --release release.yaml
aggrega build --release release.yaml
```

Rendered artifacts land under `dist/`. The build resolves the upstream chart by
OCI reference on `aggrega pull` and pins it in a lockfile.

## What renders

The build emits the Loki server as a single self-contained set of Kubernetes
objects:

- a `StatefulSet` — the single-binary Loki process, with its chunk store on a
  persistent volume,
- `ConfigMap`s — the Loki configuration and runtime config,
- `Service`s — exposing the HTTP push-and-query endpoint on port 3100,
- a `ServiceAccount` for the workload, with its access bindings.

No distributed read/write/backend workloads, object-store subchart, cache, or
operator render — the render is a single Loki workload. The Loki server and
config-reload sidecar images are pinned to their release tags, so the workload
references pinned images.
