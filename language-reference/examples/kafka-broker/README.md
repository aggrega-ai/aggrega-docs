---
example:
  level: start
  products: [core/messaging/kafka]
  shows: []
---

# Kafka — Kubernetes single-node event-streaming broker

This example compiles a small, real stack — an **Apache Kafka** event-streaming
broker in its single-node KRaft shape — from one Developer-authored `Aggregate`
to Kubernetes, synthesized directly from the **official Apache Kafka image**
with no upstream chart.

Kafka is an event-streaming broker: producers append records to topics and
consumers read them back in order. In the single-node KRaft shape the broker and
the controller roles run inside one process — no ZooKeeper and no second bundled
service — so the whole server is one stateful workload. The commit log persists
to a local data volume. A producer or consumer connects to the client bootstrap
endpoint and exchanges records there.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: a single `broker` component (`core/messaging/kafka`). |
| `manifest.yaml` | Maps the component type to the Kafka synthesis Recipe (`kafka`). |
| `release.yaml` | Operator record for the Kubernetes target: the server compute and commit-log volume size. |

## What it demonstrates

- **One authoring surface.** A single Aggregate is the source of truth for
  *what* Kafka is; the Manifest says *how* to realize it.
- **A single-node KRaft broker.** The synthesis Recipe renders Kafka as one
  `StatefulSet` with a data volume and two `Service` objects — a `ClusterIP`
  exposing the client bootstrap port, and a headless governing Service for the
  StatefulSet.
- **KRaft, no ZooKeeper.** The node runs both the broker and controller roles in
  one process, configured entirely through environment variables.
- **A pinned cluster identity.** The cluster identity is a fixed developer value
  passed verbatim to the image, which reads it as-is with no random generation,
  so the rendered manifest is byte-identical across builds.
- **A stable advertised address.** The broker advertises the in-cluster Service
  name, so clients reconnect through the stable address rather than the pod's
  own hostname.
- **Persistent log.** The commit log writes to the persistent volume at
  `/var/lib/kafka/data`, so record data survives restarts.
- **An exported bootstrap contract.** The component exports its bootstrap host
  and client port through the `uses` topology, so a producer or consumer wires
  to it and connects there.
- **Reproducible images.** The Recipe pins the Kafka server image to a
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

The build emits the Kafka server as three Kubernetes objects:

- a `StatefulSet` — the single-node Kafka process, with its commit log on a
  persistent volume mounted at `/var/lib/kafka/data` and the full KRaft
  configuration supplied through environment variables,
- a `ClusterIP` `Service` — exposing the client bootstrap port on 9092,
- a headless `Service` — the governing Service the StatefulSet requires for
  stable per-replica identity.

The Kafka image is pinned to its release tag, so the workload references a
pinned image tag.
