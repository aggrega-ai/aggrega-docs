# Prometheus — scraping a wired backend, two targets

This example compiles a small, real stack — a **Prometheus** metrics server
scraping a **web backend** — from one Developer-authored `Aggregate` to two
deployment targets:

- **Docker Compose** for local development, and
- **Kubernetes** via Workload synthesis on the official `prom/prometheus` image.

The same `aggregate.yaml` drives both. Only the Recipe layer selected by the
Manifest changes per target.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: a `web` backend (`core/devtool/adminer`) and a `metrics` server (`core/observability/prometheus`) that declares a `scrape_target` use of the backend. |
| `manifest-compose.yaml` | Maps the Prometheus type to the Compose Recipe (`compose/prometheus`) and the backend to the Compose Adminer Recipe. |
| `manifest-helm-synth.yaml` | Maps the Prometheus type to the synthesized helm Recipe (`helm/prometheus`) and the backend to the offline Adminer helm Recipe. |
| `release-compose.yaml` / `release-helm-synth.yaml` | Operator records for the two targets. |

## What it demonstrates

- **One authoring surface, many targets.** A single Aggregate is the source of
  truth for *what* the stack is. Each Manifest says *how* to realize it.
- **Scrape wiring through the String Pipe.** Prometheus declares a
  `scrape_target` use of the backend; the backend Recipe's `provides.host` and
  `provides.port` are piped into Prometheus and rendered into the `targets` list
  of a scrape job. The compiler routes the strings without interpreting them —
  so the Compose build wires a compose service name and the Kubernetes build
  wires a Service name, from the same edge.
- **Provider-idiomatic configuration.** On both targets the server writes a
  minimal `prometheus.yml` at start-up whose scrape job targets the injected
  backend, then execs Prometheus against it. On Compose this runs as a service;
  on Kubernetes the same container renders into a StatefulSet.
- **Persistent time-series database.** Prometheus stores its samples on a data
  volume so they survive restarts — a named Compose volume locally, and a
  per-replica PersistentVolumeClaim sized from `infra.storage` on Kubernetes.
- **Reproducible images.** Both Recipes pin the Prometheus image tag from
  `infra.engine_version`, so the rendered workload references a fixed image.
- **Lean single-purpose shape.** The Kubernetes render is the Prometheus
  StatefulSet, its ClusterIP and Headless Services, and its data volume claim —
  nothing else.

## Build

The workspace catalog supplies the standard-library entities, so no explicit
catalog flag is needed:

```sh
# Local development (Docker Compose)
aggrega build --release release-compose.yaml

# Kubernetes (Workload synthesis on prom/prometheus)
aggrega build --release release-helm-synth.yaml
```

Rendered artifacts land under `dist/`. The synthesized target needs no external
chart fetch — the Recipe renders the official image directly into a StatefulSet,
Services, and a data volume.

## What the injected scrape target looks like

On Compose, the server writes a `prometheus.yml` whose scrape job targets the
backend's compose service name and port:

```yaml
scrape_configs:
  - job_name: web
    scrape_interval: 15s
    metrics_path: /metrics
    static_configs:
      - targets:
          - web:8080
```

On Kubernetes, the same job is written by the synthesized StatefulSet's
start-up command:

```yaml
scrape_configs:
  - job_name: web
    scrape_interval: 15s
    metrics_path: /metrics
    static_configs:
      - targets:
          - web:8080
```

Both resolve from the same Aggregate edge — the backend host and port travel
through the `scrape_target` use, and each target renders them in its own idiom.

The `job_name` is the edge's alias — `web` here, the name this Aggregate gave
the connection — because the Aggregate declares no `job_name` for this target.
The `scrape_interval` and `metrics_path` values are the defaults the Component's
`scrape_target` socket declares, filled into the edge for the keys the Aggregate
omitted. Setting any of the three on the edge overrides that key and leaves the
others alone.

## Run it (Compose)

```sh
aggrega build --release release-compose.yaml
docker compose -f dist/app/compose/docker-compose.yaml up -d
```

Open <http://localhost:9090> — the Prometheus expression browser. Under
**Status → Targets** the `scrape-target` job lists the backend endpoint. Tear
down with `docker compose -f dist/app/compose/docker-compose.yaml down`.
