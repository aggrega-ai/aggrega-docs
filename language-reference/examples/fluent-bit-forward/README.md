# Fluent Bit — forwarding to a wired sink, two targets

This example compiles a small, real stack — a **Fluent Bit** log forwarder
shipping records to a downstream **sink** — from one Developer-authored
`Aggregate` to two deployment targets:

- **Docker Compose** for local development, and
- the **Bitnami Fluent Bit Helm chart** for Kubernetes.

The same `aggregate.yaml` drives both. Only the Recipe layer selected by the
Manifest changes per target.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: a `sink` backend (`core/devtool/adminer`) and a `logs` forwarder (`core/observability/fluent-bit`) that declares a `forward_target` use of the sink. |
| `manifest-compose.yaml` | Maps the Fluent Bit type to the Compose Recipe (`fluent-bit`) and the sink to the Compose Adminer Recipe. |
| `manifest-bitnami.yaml` | Maps the Fluent Bit type to the Bitnami chart-wrap Recipe (`fluent-bit-bitnami`) and the sink to the offline Adminer Recipe. |
| `release-compose.yaml` / `release-bitnami.yaml` | Operator records for the two targets. |

The `sink` component stands in for the downstream aggregator — a Fluentd or
Fluent Bit instance listening on the forward protocol in a production topology.
The compiler routes its host and port as opaque strings, so any component that
exports a host and a port can occupy that socket; this example uses a small,
already-cataloged backend to keep the stack to two pieces.

## What it demonstrates

- **One authoring surface, many targets.** A single Aggregate is the source of
  truth for *what* the stack is. Each Manifest says *how* to realize it.
- **Forward wiring through the String Pipe.** Fluent Bit declares a
  `forward_target` use of the sink; the sink Recipe's `provides.host` and
  `provides.port` are piped into Fluent Bit and rendered into the `Host` and
  `Port` of a `forward` output. The compiler routes the strings without
  interpreting them — so the Compose build wires a compose service name and the
  Kubernetes build wires a Service name, from the same edge.
- **Provider-idiomatic configuration.** On Compose the forwarder writes a
  minimal `fluent-bit.conf` at start-up whose `forward` output targets the
  injected sink. On Kubernetes the chart-wrap Recipe feeds the same output into
  the chart's `config.outputs` value, which the chart writes into the Fluent Bit
  configuration ConfigMap.
- **Stateless forwarder.** Fluent Bit holds no persistent state, so the render
  is a single Deployment (daemonset mode disabled), its Service, and the
  configuration ConfigMap — nothing else.
- **Reproducible images.** The chart-wrap Recipe pins the Fluent Bit image tag
  so the rendered workload references a fixed image.

## Build

The workspace catalog supplies the standard-library entities, so no explicit
catalog flag is needed:

```sh
# Local development (Docker Compose)
aggrega build --release release-compose.yaml

# Kubernetes (Bitnami Fluent Bit Helm chart)
aggrega pull  --release release-bitnami.yaml
aggrega build --release release-bitnami.yaml
```

Rendered artifacts land under `dist/`. The Kubernetes build resolves the
upstream chart by OCI reference on `aggrega pull` and pins it in a lockfile.

## What the injected forward target looks like

On Compose, the forwarder writes a `fluent-bit.conf` whose `forward` output
targets the sink's compose service name and port:

```ini
[OUTPUT]
    Name   forward
    Match  *
    Host   sink
    Port   8080
```

On Kubernetes, the same output arrives in the forwarder's config ConfigMap:

```ini
[OUTPUT]
    Name  forward
    Match *
    Host  sink
    Port  8080
```

Both resolve from the same Aggregate edge — the sink host and port travel
through the `forward_target` use, and each target renders them in its own idiom.

## Run it (Compose)

```sh
aggrega build --release release-compose.yaml
docker compose -f dist/app/compose/docker-compose.yaml up -d
```

Fluent Bit's monitoring endpoint is exposed on <http://localhost:2020> — its
`/api/v1/metrics` endpoint reports the records processed and forwarded. Tear
down with `docker compose -f dist/app/compose/docker-compose.yaml down`.
