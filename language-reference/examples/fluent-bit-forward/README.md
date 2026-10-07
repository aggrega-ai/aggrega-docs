# Fluent Bit — forwarding to a wired sink, two targets

This example compiles a small, real stack — a **Fluent Bit** log forwarder
shipping records to a downstream **sink** — from one Developer-authored
`Aggregate` to two deployment realizations:

- **Docker Compose** for local development, and
- the **synthesized helm Recipe** running the official upstream
  `fluent/fluent-bit` image directly on Kubernetes (no external chart).

The synthesized helm Recipe is the preferred Kubernetes path: it depends only on
an official image tag rather than a third-party chart, and its rendered resource
set is exactly what the workload declares.

The same `aggregate.yaml` drives both. Only the Recipe layer selected by the
Manifest changes per realization.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: a `sink` backend (`core/devtool/adminer`) and a `logs` forwarder (`core/observability/fluent-bit`) that declares a `forward_target` use of the sink. |
| `manifest-compose.yaml` | Maps the Fluent Bit type to the Compose Recipe (`compose/fluent-bit`) and the sink to the Compose Adminer Recipe. |
| `manifest-helm-synth.yaml` | Maps the Fluent Bit type to the synthesized helm Recipe (`helm/fluent-bit`) and the sink to the Adminer helm Recipe. |
| `release-compose.yaml` / `release-helm-synth.yaml` | Operator records for the two realizations. |

Because both a Compose and a synthesized helm Recipe carry the name
`fluent-bit`, the Manifests reference them provider-scoped as `compose/fluent-bit`
and `helm/fluent-bit`.

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
- **Workload synthesis (Kubernetes).** The synthesized helm Recipe declares a
  Workload — a Deployment plus a ClusterIP Service running the official
  `fluent/fluent-bit` image — that the helm provider translates into Kubernetes
  manifests with no external chart. The forwarder writes a minimal
  `fluent-bit.conf` at start-up whose `forward` output targets the injected
  sink.
- **Provider-idiomatic configuration.** On both targets the forwarder writes the
  same minimal `fluent-bit.conf` at start-up; each target renders the injected
  sink host and port in its own idiom.
- **Stateless forwarder.** Fluent Bit holds no persistent state, so the render
  is a single Deployment, its Service — nothing else.
- **Reproducible images.** `infra.engine_version` pins the Fluent Bit image tag,
  so the rendered workload references a fixed image and the synthesized Recipe
  renders no floating tag.

## Build

The workspace catalog supplies the standard-library entities, so no explicit
catalog flag is needed:

```sh
# Local development (Docker Compose)
aggrega build --release release-compose.yaml

# Kubernetes (synthesized helm Recipe, official image)
aggrega build --release release-helm-synth.yaml
```

Rendered artifacts land under `dist/`.

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

On Kubernetes, the same output targets the sink's in-cluster Service name,
which the helm provider gives the Service of the sink's `default` service key:

```ini
[OUTPUT]
    Name   forward
    Match  *
    Host   sink-default
    Port   8080
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
