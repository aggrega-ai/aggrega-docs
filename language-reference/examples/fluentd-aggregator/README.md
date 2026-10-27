---
example:
  level: start
  products: [core/observability/fluentd]
  shows: [multi-target]
---

# Fluentd — a log aggregator, two targets

This example compiles a **Fluentd** log aggregator — the receiving end of a log
pipeline — from one Developer-authored `Aggregate` to two realizations:

- **Docker Compose** for local development, and
- the **synthesized helm Recipe** running the official upstream `fluent/fluentd`
  image directly on Kubernetes (no external chart).

The synthesized helm Recipe fetches nothing at build time; `helm/fluentd-chart`
renders the Fluent project's own chart as the same aggregator, for a build that
can reach a chart repository.

The same `aggregate.yaml` drives both. Only the Recipe layer selected by the
Manifest changes per realization.

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
| `manifest-compose.yaml` | Maps the Fluentd type to the Compose Recipe (`compose/fluentd`). |
| `manifest-helm-synth.yaml` | Maps the Fluentd type to the synthesized helm Recipe (`helm/fluentd`). |
| `release-compose.yaml` / `release-helm-synth.yaml` | Operator records for the two realizations. |
| `release-helm-synth-buffer.yaml` | The synthesized helm realization with durable buffering enabled (`infra.storage.size` set). |

Because both a Compose and a synthesized helm Recipe carry the name `fluentd`,
the Manifests reference them provider-scoped as `compose/fluentd` and
`helm/fluentd`.

## What it demonstrates

- **One authoring surface, many targets.** A single Aggregate is the source of
  truth for *what* the stack is. Each Manifest says *how* to realize it.
- **The receiving end of the String Pipe.** The aggregator exports its forward
  endpoint through `provides` — `host` (the aggregator's service) and `port`
  (24224) on the `forward` protocol. A forwarder that binds this component pipes
  those strings into its own forward output; the compiler routes them without
  interpreting them.
- **Workload synthesis (Kubernetes).** The synthesized helm Recipe declares a
  Workload — a Deployment plus a ClusterIP Service running the official
  `fluent/fluentd` image — that the helm provider translates into Kubernetes
  manifests with no external chart. The rendered resource set is exactly what
  the Workload declares.
- **Developer-controlled routing.** The developer's output match selects which
  received records are routed to the aggregator's output. It defaults to `**`,
  which routes every received record.
- **Ephemeral buffer by default, durable on request.** The aggregator buffers in
  memory, so the default render carries no persistent volume. Setting
  `infra.storage.size` (see `release-helm-synth-buffer.yaml`) backs the buffer
  with a durable volume mounted at `/fluentd/log`; the workload stays a
  single-replica Deployment.
- **Reproducible images.** `infra.engine_version` pins the Fluentd image tag, so
  the rendered workload references a fixed image and the synthesized Recipe
  renders no floating tag.

## Build

This workspace carries no `.aggrega-config.yaml`, so the standard-library
entities resolve from the hub registry, `hub.aggrega.ai`, and no catalog flag is
needed; `--auto-pull` writes the lockfile a fresh clone lacks during the build:

```sh
# Local development (Docker Compose)
aggrega build --release release-compose.yaml --auto-pull

# Kubernetes (synthesized helm Recipe, official image)
aggrega build --release release-helm-synth.yaml --auto-pull

# Kubernetes with a durable buffer volume
aggrega build --release release-helm-synth-buffer.yaml --auto-pull
```

Rendered artifacts land under `dist/`.

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

On Kubernetes, the synthesized helm Recipe writes the same `fluent.conf` at
start-up, and the ClusterIP Service exposes the forward port:

```yaml
spec:
  type: ClusterIP
  [… omitted: the selector matching the aggregator's Pods]
  ports:
    - name: forward
      port: 24224
      targetPort: forward
```

The Deployment references the pinned image and exposes the forward port on the
container:

```yaml
image: fluent/fluentd:v1.19.3-debian-2.1
[… omitted: the start-up command that writes the fluent.conf shown above]
ports:
  - name: forward
    containerPort: 24224
```

When `infra.storage.size` is set, the Recipe additionally renders a
PersistentVolumeClaim and mounts it at `/fluentd/log`, backing a file buffer so
buffered records survive restarts.

## Run it (Compose)

```sh
aggrega build --release release-compose.yaml --auto-pull
docker compose -f dist/app/compose/docker-compose.yaml up -d
```

The aggregator listens for forwarded records on `localhost:24224`. Send it a
test record with any Fluentd or Fluent Bit forwarder pointed at that port, and
the received records appear on the aggregator's standard output. Tear down with
`docker compose -f dist/app/compose/docker-compose.yaml down`.
