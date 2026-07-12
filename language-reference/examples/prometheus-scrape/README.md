# Prometheus — scraping a wired backend, two targets

This example compiles a small, real stack — a **Prometheus** metrics server
scraping a **web backend** — from one Developer-authored `Aggregate` to two
deployment targets:

- **Docker Compose** for local development, and
- the **Bitnami Prometheus Helm chart** for Kubernetes.

The same `aggregate.yaml` drives both. Only the Recipe layer selected by the
Manifest changes per target.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: a `web` backend (`core/devtool/adminer`) and a `metrics` server (`core/observability/prometheus`) that declares a `scrape_target` use of the backend. |
| `manifest-compose.yaml` | Maps the Prometheus type to the Compose Recipe (`prometheus`) and the backend to the Compose Adminer Recipe. |
| `manifest-bitnami.yaml` | Maps the Prometheus type to the Bitnami chart-wrap Recipe (`prometheus-bitnami`) and the backend to the offline Adminer Recipe. |
| `release-compose.yaml` / `release-bitnami.yaml` | Operator records for the two targets. |

## What it demonstrates

- **One authoring surface, many targets.** A single Aggregate is the source of
  truth for *what* the stack is. Each Manifest says *how* to realize it.
- **Scrape wiring through the String Pipe.** Prometheus declares a
  `scrape_target` use of the backend; the backend Recipe's `provides.host` and
  `provides.port` are piped into Prometheus and rendered into the `targets` list
  of a scrape job. The compiler routes the strings without interpreting them —
  so the Compose build wires a compose service name and the Kubernetes build
  wires a Service name, from the same edge.
- **Provider-idiomatic configuration.** On Compose the server writes a minimal
  `prometheus.yml` at start-up whose scrape job targets the injected backend. On
  Kubernetes the chart-wrap Recipe feeds the same scrape job into the chart's
  `server.extraScrapeConfigs` value, which the chart merges into the Prometheus
  configuration and renders into a ConfigMap.
- **Persistent time-series database.** Prometheus stores its samples on a data
  volume so they survive restarts — a named Compose volume locally, and a
  PersistentVolumeClaim sized from `infra.storage` on Kubernetes.
- **Reproducible images.** The chart-wrap Recipe pins the Prometheus image tag
  so the rendered workload references a fixed image.
- **Lean single-purpose shape.** Alertmanager is disabled on the chart target,
  so the Kubernetes render is the Prometheus server, its Service, config, RBAC,
  and data volume — nothing else.

## Build

The workspace catalog supplies the standard-library entities, so no explicit
catalog flag is needed:

```sh
# Local development (Docker Compose)
aggrega build --release release-compose.yaml

# Kubernetes (Bitnami Prometheus Helm chart)
aggrega pull  --release release-bitnami.yaml
aggrega build --release release-bitnami.yaml
```

Rendered artifacts land under `dist/`. The Kubernetes build resolves the
upstream chart by OCI reference on `aggrega pull` and pins it in a lockfile.

## What the injected scrape target looks like

On Compose, the server writes a `prometheus.yml` whose scrape job targets the
backend's compose service name and port:

```yaml
scrape_configs:
  - job_name: scrape-target
    metrics_path: /metrics
    static_configs:
      - targets:
          - web:8080
```

On Kubernetes, the same job arrives in the server's config ConfigMap:

```yaml
- job_name: scrape-target
  metrics_path: /metrics
  static_configs:
  - targets:
    - web:8080
```

Both resolve from the same Aggregate edge — the backend host and port travel
through the `scrape_target` use, and each target renders them in its own idiom.

## Run it (Compose)

```sh
aggrega build --release release-compose.yaml
docker compose -f dist/app/compose/docker-compose.yaml up -d
```

Open <http://localhost:9090> — the Prometheus expression browser. Under
**Status → Targets** the `scrape-target` job lists the backend endpoint. Tear
down with `docker compose -f dist/app/compose/docker-compose.yaml down`.
