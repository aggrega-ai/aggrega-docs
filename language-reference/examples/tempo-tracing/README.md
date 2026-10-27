---
example:
  level: start
  products: [core/observability/tempo]
  shows: []
---

# Tempo — Kubernetes distributed-tracing server

This example compiles a small, real stack — a **Grafana Tempo** distributed-tracing
server — from one Developer-authored `Aggregate` to Kubernetes via Workload
synthesis on the official `grafana/tempo` image, in its single-binary shape.

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
| `manifest.yaml` | Maps the component type to the synthesized Tempo Recipe (`tempo`). |
| `release.yaml` | Operator record for the Kubernetes target: the server compute and trace-store volume size. |

## What it demonstrates

- **One authoring surface.** A single Aggregate is the source of truth for
  *what* Tempo is; the Manifest says *how* to realize it.
- **A single-binary trace backend.** The synthesized Recipe renders Tempo as one
  `StatefulSet` with a per-replica data volume, one `ConfigMap` carrying the
  Tempo config, and a `ClusterIP` and `Headless` `Service` exposing the trace
  receivers and the HTTP query API — a single self-contained workload.
- **Developer-set retention.** The developer's `retention_period` flows into the
  in-process compactor, which deletes stored trace blocks once they age past it.
- **An exported ingestion contract.** The component exports its OTLP gRPC
  receiver host and port through the `uses` topology, so a trace producer wires
  to it and pushes spans there.
- **Reproducible images.** The Recipe pins the Tempo server image tag from
  `infra.engine_version` so the rendered workload references a pinned version.

## Build

This workspace carries no `.aggrega-config.yaml`, so the standard-library
entities resolve from the hub registry, `hub.aggrega.ai`, and no catalog flag is
needed; `--auto-pull` writes the lockfile a fresh clone lacks during the build:

```sh
aggrega build --release release.yaml --auto-pull
```

Rendered artifacts land under `dist/`. The synthesized target needs no external
chart fetch — the Recipe renders the official image directly into a StatefulSet,
Services, and a data volume.

## What renders

The build emits the Tempo server as four Kubernetes objects:

- a `StatefulSet` — the single-binary Tempo process, with its trace store on a
  per-replica persistent volume,
- a `ConfigMap` — the Tempo configuration,
- a `ClusterIP Service` — exposing the OTLP gRPC receiver on 4317, the OTLP HTTP
  receiver on 4318, and the HTTP query API on 3200,
- a `Headless Service` — the StatefulSet's stable network identity, exposing the
  same ports.

The Tempo image tag is pinned from `infra.engine_version`, so the workload
references a pinned image tag.
