---
example:
  level: start
  products: [core/observability/fluent-bit, core/observability/fluentd]
  shows: [multi-target, connections]
---

# Fluent Bit to Fluentd — a two-tier log pipeline, two targets

This example compiles a real log pipeline — a **Fluent Bit** forwarder shipping
records to a **Fluentd** aggregator over the forward protocol — from one
Developer-authored `Aggregate` to two realizations:

- **Docker Compose** for local development, and
- the **synthesized helm Recipes** running the official upstream
  `fluent/fluent-bit` and `fluent/fluentd` images directly on Kubernetes (no
  external charts).

The synthesized helm Recipes fetch nothing at build time; `helm/fluent-bit-chart`
and `helm/fluentd-chart` render the Fluent project's own charts instead, for a
build that can reach a chart repository.

The same `aggregate.yaml` drives both. Only the Recipe layer selected by the
Manifest changes per realization.

## The pipeline

Two components form a forwarder-to-aggregator pipeline:

- `forwarder` (`core/observability/fluent-bit`) collects log records and ships
  them on a `forward` output. It is typed as a stateless server.
- `aggregator` (`core/observability/fluentd`) listens on the `forward` input
  protocol, receives the records, and routes them to its output. It is typed as
  a stateful server; the synthesized helm Recipe buffers in memory by default,
  so it renders as a single-replica Deployment.

The forwarder declares a `forward_target` use of the aggregator. The
aggregator's `provides.host` and `provides.port` — the host and port of its
forward endpoint (the conventional Fluentd forward port, `24224`) — are piped
into the forwarder and rendered into the `Host` and `Port` of its `forward`
output. So the forwarder ships to the aggregator's forward endpoint, wired
ahead of time from a single edge.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: an `aggregator` sink (`core/observability/fluentd`) and a `forwarder` (`core/observability/fluent-bit`) that declares a `forward_target` use of the aggregator. |
| `manifest-compose.yaml` | Maps the Fluent Bit type to the Compose Recipe (`compose/fluent-bit`) and the Fluentd type to the Compose Recipe (`compose/fluentd`). |
| `manifest-helm-synth.yaml` | Maps the Fluent Bit type to the synthesized helm Recipe (`helm/fluent-bit`) and the Fluentd type to the synthesized helm Recipe (`helm/fluentd`). |
| `release-compose.yaml` / `release-helm-synth.yaml` | Operator records for the two realizations. |

Because both a Compose and a synthesized helm Recipe carry the names
`fluent-bit` and `fluentd`, the Manifests reference them provider-scoped
(`compose/…` and `helm/…`).

## What it demonstrates

- **One authoring surface, many targets.** A single Aggregate is the source of
  truth for *what* the pipeline is. Each Manifest says *how* to realize it.
- **Forward wiring through the String Pipe.** The forwarder declares a
  `forward_target` use of the aggregator; the aggregator Recipe's
  `provides.host` and `provides.port` are piped into the forwarder and rendered
  into the `Host` and `Port` of a `forward` output. The compiler routes the
  strings without interpreting them — so the Compose build wires a compose
  service name and the Kubernetes build wires a Service name, from the same
  edge.
- **A stateful sink on a stateless forwarder's socket.** The forwarder's
  `forward_target` socket selects a `server` or a `stateful-server`. Fluentd is
  typed as a stateful server, and it binds the socket cleanly — the socket
  selects on the operational server role, not on whether the sink holds state.
  What the sink speaks is checked apart from that: the forward output speaks the
  Fluentd forward protocol, so the build halts unless the sink publishes
  `protocol: forward`, as Fluentd does.
- **Workload synthesis (Kubernetes).** Each synthesized helm Recipe declares a
  Workload — a Deployment plus a ClusterIP Service running the official image —
  that the helm provider translates into Kubernetes manifests with no external
  chart. The rendered resource set is exactly what the Workloads declare.
- **Reproducible images.** `infra.engine_version` pins each image tag, so the
  rendered workloads reference fixed images and the synthesized Recipes render
  no floating tag.

## Build

This workspace carries no `.aggrega-config.yaml`, so the standard-library
entities resolve from the hub registry, `hub.aggrega.ai`, and no catalog flag is
needed; `--auto-pull` writes the lockfile a fresh clone lacks during the build:

```sh
# Local development (Docker Compose)
aggrega build --release release-compose.yaml --auto-pull

# Kubernetes (synthesized helm Recipes, official images)
aggrega build --release release-helm-synth.yaml --auto-pull
```

Rendered artifacts land under `dist/`.

## What the injected forward target looks like

On Compose, the forwarder writes a `fluent-bit.conf` whose `forward` output
targets the aggregator's compose service name and forward port:

```ini
[OUTPUT]
    Name   forward
    Match  *
    Host   aggregator
    Port   24224
```

On Kubernetes, the same output targets the aggregator's in-cluster Service name:

```ini
[OUTPUT]
    Name   forward
    Match  *
    Host   aggregator-default
    Port   24224
```

Both resolve from the same Aggregate edge — the aggregator host and port travel
through the `forward_target` use, and each target renders them in its own idiom.
The `24224` port is the aggregator's forward endpoint, exported through its
`provides` and piped into the forwarder ahead of time.

## Run it (Compose)

```sh
aggrega build --release release-compose.yaml --auto-pull
docker compose -f dist/app/compose/docker-compose.yaml up -d
```

The forwarder's monitoring endpoint is published on the host's loopback address
only, at <http://localhost:2020> — its `/api/v1/metrics` endpoint reports the
records processed and forwarded. The endpoint checks no caller, so it is not
published on the host's other interfaces unless the Release sets
`infra.publish_on_all_interfaces: true` on the forwarder. Tear down with
`docker compose -f dist/app/compose/docker-compose.yaml down`.
