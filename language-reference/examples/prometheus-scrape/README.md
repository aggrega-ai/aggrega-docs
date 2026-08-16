# Prometheus — one server, two scrape targets

This example compiles a small, real stack — a **Prometheus** metrics server
scraping **two web backends** — from one Developer-authored `Aggregate` to two
deployment targets:

- **Docker Compose** for local development, and
- **Kubernetes** via Workload synthesis on the official `prom/prometheus` image.

The same `aggregate.yaml` drives both. Only the Recipe layer selected by the
Manifest changes per target.

Both backends are the same Component type wired twice, so everything that
differs between the two scrape jobs comes from what is authored on each
connection — not from the backends being different.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: two backends, `web` and `api` (both `core/devtool/adminer`), and a `metrics` server (`core/observability/prometheus`) that declares a `scrape_target` use of each. |
| `manifest-compose.yaml` | Maps the Prometheus type to the Compose Recipe (`compose/prometheus`) and the backend type to the Compose Adminer Recipe. |
| `manifest-helm-synth.yaml` | Maps the Prometheus type to the synthesized helm Recipe (`helm/prometheus`) and the backend type to the offline Adminer helm Recipe. |
| `release-compose.yaml` / `release-helm-synth.yaml` | Operator records for the two targets. |

## Wiring two targets on one socket

`scrape_target` is one socket carrying two connections, and each connection
becomes one scrape job:

```yaml
    metrics:
      type: core/observability/prometheus
      uses:
        scrape_target:
          web:
            target: web
          api:
            target: api
            values:
              job_name: api-backend
              scrape_interval: 30s
              metrics_path: /api/metrics
```

The `web` connection authors no `values`, so its job takes what the socket
declares. The `api` connection sets all three keys, and each key it sets shapes
that job alone — the `web` job is untouched by them.

## What it demonstrates

- **One authoring surface, many targets.** A single Aggregate is the source of
  truth for *what* the stack is. Each Manifest says *how* to realize it.
- **One socket, many connections.** Prometheus scrapes as many backends as the
  Aggregate wires into `scrape_target`. The Recipe emits one scrape job per
  connection, so the number of jobs follows the topology rather than the Recipe.
- **Per-connection configuration.** `job_name`, `scrape_interval` and
  `metrics_path` are declared on the socket's `valueSchema`, which makes them
  properties of a *connection* rather than of the server. One Prometheus
  scraping several backends cannot express several cadences in a single
  Component-wide value.
- **Declared defaults fill the keys a connection omits.** `scrape_interval` and
  `metrics_path` carry defaults on the socket's `valueSchema`. A connection that
  omits them — `web` here — receives them, and a connection that sets them —
  `api` — overrides only what it set.
- **Scrape wiring through the String Pipe.** Each backend Recipe's
  `provides.host` and `provides.port` are piped into Prometheus and rendered
  into the `targets` list of that backend's job. The compiler routes those
  strings without interpreting them: each Recipe decides what pointer its own
  target publishes, and the compiler pipes it through unchanged.
- **Provider-idiomatic configuration.** On both targets the server writes a
  minimal `prometheus.yml` at start-up whose scrape jobs address the wired
  backends, then execs Prometheus against it. On Compose this runs as a service;
  on Kubernetes the same container renders into a StatefulSet.
- **Persistent time-series database.** Prometheus stores its samples on a data
  volume so they survive restarts — a named Compose volume locally, and a
  per-replica PersistentVolumeClaim sized from `infra.storage` on Kubernetes.
- **Reproducible images.** Both Recipes pin the Prometheus image tag from
  `infra.engine_version`, so the rendered workload references a fixed image.
- **Lean single-purpose shape.** On Kubernetes the Prometheus component renders
  as its StatefulSet, its ClusterIP and Headless Services, and its data volume
  claim — nothing else. Each backend renders as its own Deployment and Service.

## Build

The workspace catalog supplies the standard-library entities, so no explicit
catalog flag is needed:

```sh
# Local development (Docker Compose)
aggrega build --release release-compose.yaml --auto-pull

# Kubernetes (Workload synthesis on prom/prometheus)
aggrega build --release release-helm-synth.yaml --auto-pull
```

Rendered artifacts land under `dist/`. `--auto-pull` resolves each Release's
dependencies into its lockfile during the build; `aggrega pull --release
release-compose.yaml` once up front does the same and lets later builds run
without the flag. The synthesized target needs no external chart fetch — the
Recipe renders the official image directly into a StatefulSet, Services, and a
data volume.

## What the compiled scrape configuration looks like

On Compose, the server writes a `prometheus.yml` holding one job per wired
backend, each addressing that backend's compose service name and port:

```yaml
scrape_configs:
  - job_name: api-backend
    scrape_interval: 30s
    metrics_path: /api/metrics
    static_configs:
      - targets:
          - api:8081
  - job_name: web
    scrape_interval: 15s
    metrics_path: /metrics
    static_configs:
      - targets:
          - web:8080
```

On Kubernetes, the same two jobs are written by the synthesized StatefulSet's
start-up command:

```yaml
scrape_configs:
  - job_name: api-backend
    scrape_interval: 30s
    metrics_path: /api/metrics
    static_configs:
      - targets:
          - api:8081
  - job_name: web
    scrape_interval: 15s
    metrics_path: /metrics
    static_configs:
      - targets:
          - web:8080
```

Both targets compile the same two jobs from the same two Aggregate edges: each
backend's host and port travel through its own `scrape_target` connection, and
the compiler pipes those strings into the job without interpreting them. What
differs between the targets is the workload the configuration is written into —
a Compose service on one, a StatefulSet on the other.

Read the `web` job against the `api` job to see where every value comes from.
The `api` job carries `api-backend`, `30s` and `/api/metrics` because its
connection authors all three. The `web` job carries `web` as its `job_name`
because the Aggregate declares none and the Recipe falls back to the connection
alias — the name this Aggregate gave the connection — and it carries `15s` and
`/metrics` because those are the defaults the Component's `scrape_target` socket
declares for the keys that connection omitted. Setting any of the three on a
connection overrides that key for that job and leaves both the other keys and
the other job alone.

All of this happens on the consuming side. Per-connection configuration surfaces
only in the render context of the node that authored the connection, never in
the target's, so wiring or tuning a connection into a backend never perturbs
what that backend itself renders — its Deployment and its Service are the same
bytes either way.

## Run it (Compose)

```sh
aggrega build --release release-compose.yaml --auto-pull
docker compose -f dist/app/compose/docker-compose.yaml up -d
```

The Release gives each backend its own port — `web` on 8080 and `api` on 8081 —
so both run side by side locally, and each port travels through that backend's
connection into its own scrape job's target.

Open <http://localhost:9090> — the Prometheus expression browser. Under
**Status → Targets** the two jobs are listed under the names the compiled
configuration gives them, `web` and `api-backend`. Tear down with
`docker compose -f dist/app/compose/docker-compose.yaml down`.
