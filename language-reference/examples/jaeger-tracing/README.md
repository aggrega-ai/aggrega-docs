---
example:
  level: start
  products: [core/observability/jaeger]
  shows: []
---

# Jaeger — Kubernetes single-node tracing backend

This example compiles a small, real stack — a **Jaeger** distributed-tracing
backend in its single-node shape — from one Developer-authored `Aggregate` to
Kubernetes, synthesized directly from the **official Jaeger image** with no
upstream chart.

Jaeger is a trace backend: it receives spans over the OpenTelemetry protocol,
stores them in a local embedded key-value store, and answers trace-lookup and
search queries over its query UI. In the single-node shape the OTLP receiver,
the storage writer, and the query service all run inside one process backed by
a local on-disk store, so the whole server is one stateful workload. An
instrumented application pushes spans to Jaeger's OTLP receiver; an operator
reads them back from the UI.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: a single `tracing` component (`core/observability/jaeger`). |
| `manifest.yaml` | Maps the component type to the Jaeger synthesis Recipe (`jaeger`). |
| `release.yaml` | Operator record for the Kubernetes target: the server compute and trace-store volume size. |

## What it demonstrates

- **One authoring surface.** A single Aggregate is the source of truth for
  *what* Jaeger is; the Manifest says *how* to realize it.
- **A single-node trace backend.** The synthesis Recipe renders Jaeger as one
  `StatefulSet` with a data volume, one `ConfigMap` carrying the Jaeger v2
  config, and two `Service` objects — a `ClusterIP` exposing the receivers and
  the UI, and a headless governing Service for the StatefulSet.
- **Config delivered as a file.** Jaeger v2 is an OpenTelemetry Collector
  distribution configured by a YAML file. The Recipe emits that config as a
  `ConfigMap` and mounts it into the container at `/etc/jaeger`, and the
  container reads it with `--config /etc/jaeger/config.yaml`.
- **Persistent traces.** The embedded key-value store writes to the persistent
  volume at `/badger`, so trace data survives restarts.
- **An exported ingestion contract.** The component exports its OTLP gRPC
  receiver host and port through the `uses` topology, so a trace producer wires
  to it and pushes spans there.
- **Reproducible images.** The Recipe pins the Jaeger server image to a
  resolvable tag so the rendered workload references a pinned version.

## Build

This workspace carries no `.aggrega-config.yaml`, so the standard-library
entities resolve from the hub registry, `hub.aggrega.ai`, and no catalog flag is
needed:

```sh
aggrega pull  --release release.yaml
aggrega build --release release.yaml
```

Rendered artifacts land under `dist/`. The Kubernetes target renders plain
manifests offline — no chart pull is required.

## What renders

The build emits the Jaeger server as four Kubernetes objects:

- a `StatefulSet` — the single-node Jaeger process, with its embedded trace
  store on a persistent volume mounted at `/badger` and the config mounted at
  `/etc/jaeger`,
- a `ConfigMap` — the Jaeger v2 configuration (OTLP receivers, the batch
  processor, and the embedded key-value store writing to `/badger/key` and
  `/badger/data`),
- a `ClusterIP` `Service` — exposing the OTLP gRPC receiver on 4317, the OTLP
  HTTP receiver on 4318, and the query UI on 16686,
- a headless `Service` — the governing Service the StatefulSet requires for
  stable per-replica identity.

The Jaeger image is pinned to its release tag, so the workload references a
pinned image tag.
