# Fluentd — a log aggregator, two targets

This example compiles a **Fluentd** log aggregator — the receiving end of a log
pipeline — from one Developer-authored `Aggregate` to two deployment targets:

- **Docker Compose** for local development, and
- the **Bitnami Fluentd Helm chart** (aggregator mode) for Kubernetes.

The same `aggregate.yaml` drives both. Only the Recipe layer selected by the
Manifest changes per target.

## The aggregator role

A log pipeline has two ends. A **forwarder** (such as Fluent Bit) collects log
records and ships them downstream. An **aggregator** is the sink at the other
end: it listens on the `forward` input protocol, receives the records upstream
forwarders send it, and routes them to its output. Fluentd here plays the
aggregator role.

Because the aggregator receives rather than forwards, it declares no downstream
`uses` socket. Instead it exports the host and port of its forward endpoint
through `provides`, so a forwarder can bind it on a forward socket and ship
records to it. The forward endpoint listens on port **24224** — the
conventional Fluentd forward port.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: an `aggregator` component (`core/observability/fluentd`) listening on the forward input. |
| `manifest-compose.yaml` | Maps the Fluentd type to the Compose Recipe (`fluentd`). |
| `manifest-bitnami.yaml` | Maps the Fluentd type to the Bitnami chart-wrap Recipe (`fluentd-bitnami`, aggregator mode). |
| `release-compose.yaml` / `release-bitnami.yaml` | Operator records for the two targets. |

## What it demonstrates

- **One authoring surface, many targets.** A single Aggregate is the source of
  truth for *what* the stack is. Each Manifest says *how* to realize it.
- **The receiving end of the String Pipe.** The aggregator exports its forward
  endpoint through `provides` — `host` (the aggregator's service) and `port`
  (24224) on the `forward` protocol. A forwarder that binds this component pipes
  those strings into its own forward output; the compiler routes them without
  interpreting them.
- **Aggregator mode on Kubernetes.** The chart-wrap Recipe disables the
  forwarder daemonset, so the chart renders only the aggregator: a StatefulSet,
  its primary and headless Services, its configuration ConfigMap, a
  NetworkPolicy, a PodDisruptionBudget, and a ServiceAccount — nothing else.
- **Developer-controlled routing.** The developer's output match selects which
  received records are routed to the aggregator's output. It defaults to `**`,
  which routes every received record.
- **Ephemeral buffer by default.** The aggregator buffers in memory, so the
  render carries no persistent volume. Set `infra.storage.size` to back the
  buffer with a durable volume.
- **Reproducible images.** Both Recipes pin the Fluentd image so the rendered
  workload references a fixed image.

## Build

The workspace catalog supplies the standard-library entities, so no explicit
catalog flag is needed:

```sh
# Local development (Docker Compose)
aggrega build --release release-compose.yaml

# Kubernetes (Bitnami Fluentd Helm chart)
aggrega pull  --release release-bitnami.yaml
aggrega build --release release-bitnami.yaml
```

Rendered artifacts land under `dist/`. The Kubernetes build resolves the
upstream chart by OCI reference on `aggrega pull` and pins it in a lockfile.

## What the forward endpoint looks like

On Compose, the aggregator writes a `fluent.conf` with a `forward` input source
bound to the forward port, and routes matched records to standard output:

```text
<source>
    @type forward
    bind 0.0.0.0
    port 24224
</source>
<match **>
    @type stdout
</match>
```

On Kubernetes, the same forward input arrives in the aggregator's configuration
ConfigMap, and the primary Service exposes the forward port:

```yaml
ports:
  - name: http
    port: 9880
    targetPort: http
  - name: tcp
    port: 24224
    targetPort: tcp
```

The StatefulSet references the pinned image and exposes the forward port on the
container:

```yaml
image: docker.io/bitnami/fluentd:1.19.0-debian-12-r1
ports:
  - name: tcp
    containerPort: 24224
```

## Run it (Compose)

```sh
aggrega build --release release-compose.yaml
docker compose -f dist/app/compose/docker-compose.yaml up -d
```

The aggregator listens for forwarded records on `localhost:24224`. Send it a
test record with any Fluentd or Fluent Bit forwarder pointed at that port, and
the received records appear on the aggregator's standard output. Tear down with
`docker compose -f dist/app/compose/docker-compose.yaml down`.
