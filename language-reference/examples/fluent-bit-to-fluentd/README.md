# Fluent Bit to Fluentd — a two-tier log pipeline, two targets

This example compiles a real log pipeline — a **Fluent Bit** forwarder shipping
records to a **Fluentd** aggregator over the forward protocol — from one
Developer-authored `Aggregate` to two deployment targets:

- **Docker Compose** for local development, and
- the **Bitnami** Fluent Bit and Fluentd Helm charts for Kubernetes.

The same `aggregate.yaml` drives both. Only the Recipe layer selected by the
Manifest changes per target.

## The pipeline

Two components form a forwarder-to-aggregator pipeline:

- `forwarder` (`core/observability/fluent-bit`) collects log records and ships
  them on a `forward` output. It renders as a stateless server.
- `aggregator` (`core/observability/fluentd`) listens on the `forward` input
  protocol, receives the records, and routes them to its output. It buffers
  records and renders as a stateful server.

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
| `manifest-compose.yaml` | Maps the Fluent Bit type to the Compose Recipe (`fluent-bit`) and the Fluentd type to the Compose Recipe (`fluentd`). |
| `manifest-bitnami.yaml` | Maps the Fluent Bit type to the Bitnami chart-wrap Recipe (`fluent-bit-bitnami`) and the Fluentd type to the Bitnami chart-wrap Recipe (`fluentd-bitnami`). |
| `release-compose.yaml` / `release-bitnami.yaml` | Operator records for the two targets. |

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
  `forward_target` socket accepts either a stateless or a stateful server as
  its sink. Fluentd is a stateful server (it renders a StatefulSet), and it
  binds the socket cleanly — the socket selects on the operational server role,
  not on whether the sink holds state.
- **Provider-idiomatic configuration.** On Compose the forwarder writes a
  minimal `fluent-bit.conf` at start-up whose `forward` output targets the
  injected aggregator. On Kubernetes the chart-wrap Recipe feeds the same
  output into the chart's `config.outputs` value, which the chart writes into
  the Fluent Bit configuration ConfigMap.
- **Reproducible images.** The chart-wrap Recipes pin their image tags so the
  rendered workloads reference fixed images.

## Build

The workspace catalog supplies the standard-library entities, so no explicit
catalog flag is needed:

```sh
# Local development (Docker Compose)
aggrega build --release release-compose.yaml

# Kubernetes (Bitnami Helm charts)
aggrega pull  --release release-bitnami.yaml
aggrega build --release release-bitnami.yaml
```

Rendered artifacts land under `dist/`. The Kubernetes build resolves the
upstream charts by OCI reference on `aggrega pull` and pins them in a lockfile.

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

On Kubernetes, the same output arrives in the forwarder's config ConfigMap:

```ini
[OUTPUT]
    Name  forward
    Match *
    Host  aggregator
    Port  24224
```

Both resolve from the same Aggregate edge — the aggregator host and port travel
through the `forward_target` use, and each target renders them in its own idiom.
The `24224` port is the aggregator's forward endpoint, exported through its
`provides` and piped into the forwarder ahead of time.

## Run it (Compose)

```sh
aggrega build --release release-compose.yaml
docker compose -f dist/app/compose/docker-compose.yaml up -d
```

The forwarder's monitoring endpoint is exposed on <http://localhost:2020> — its
`/api/v1/metrics` endpoint reports the records processed and forwarded. Tear
down with `docker compose -f dist/app/compose/docker-compose.yaml down`.
