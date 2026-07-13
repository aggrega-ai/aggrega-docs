# Tempo — Kubernetes distributed-tracing server

This example compiles a small, real stack — a **Grafana Tempo** distributed-tracing
server — from one Developer-authored `Aggregate` to Kubernetes, backed by the
**official Grafana Tempo Helm chart** in its single-binary shape.

Tempo is a trace backend: it receives spans over the OpenTelemetry protocol (and
other tracing wire formats), stores them in a trace object store, and answers
trace-lookup and search queries over its HTTP API. In the single-binary shape
every Tempo subsystem — distributor, ingester, querier, compactor — runs inside
one process backed by a local trace store, so the whole server is one stateful
workload. An instrumented application pushes spans to Tempo's OTLP receiver; a
dashboards server reads them back over the query API.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: a single `tracing` component (`core/observability/tempo`) keeping traces for seven days. |
| `manifest.yaml` | Maps the component type to the Tempo chart-wrap Recipe (`tempo`). |
| `release.yaml` | Operator record for the Kubernetes target: the server compute and trace-store volume size. |

## What it demonstrates

- **One authoring surface.** A single Aggregate is the source of truth for
  *what* Tempo is; the Manifest says *how* to realize it.
- **A single-binary trace backend.** The chart-wrap Recipe renders Tempo as one
  `StatefulSet` with a data volume, one `ConfigMap` carrying the Tempo config,
  one `Service` exposing the trace receivers and the HTTP query API, and a
  `ServiceAccount` — a single self-contained workload.
- **Developer-set retention.** The developer's `retention_period` flows into the
  in-process compactor, which deletes stored trace blocks once they age past it.
- **An exported ingestion contract.** The component exports its OTLP gRPC
  receiver host and port through the `uses` topology, so a trace producer wires
  to it and pushes spans there.
- **Reproducible images.** The Recipe pins the Tempo server image to a
  resolvable tag so the rendered workload references an immutable version.

## Build

The workspace catalog supplies the standard-library entities, so no explicit
catalog flag is needed:

```sh
aggrega pull  --release release.yaml
aggrega build --release release.yaml
```

Rendered artifacts land under `dist/`. The build resolves the upstream chart by
OCI reference on `aggrega pull` and pins it in a lockfile.

## What renders

The build emits the Tempo server as four Kubernetes objects:

- a `StatefulSet` — the single-binary Tempo process, with its trace store on a
  persistent volume,
- a `ConfigMap` — the Tempo configuration,
- a `Service` — exposing the trace receivers (OTLP gRPC on 4317, OTLP HTTP on
  4318, and the other supported tracing wire formats) alongside the HTTP query
  API on 3200,
- a `ServiceAccount` for the workload.

The Tempo image is pinned to its release tag, so the workload references an
immutable image.
