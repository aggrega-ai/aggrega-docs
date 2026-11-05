---
example:
  level: start
  products: [core/observability/grafana, core/observability/prometheus]
  shows: [multi-target, connections]
---

# Prometheus — one server, two scrape targets

This example compiles a small, real stack — a **Prometheus** metrics server
scraping **two Grafana dashboards servers** — from one Developer-authored
`Aggregate` to two targets:

- **Docker Compose** for local development, and
- **Kubernetes** via Workload synthesis on the official `prom/prometheus` image.

The same `aggregate.yaml` drives both. Only the Recipe layer selected by the
Manifest changes per target.

Grafana serves its own metrics in the Prometheus text format at `/metrics` on
its web port, and it does so by default, so each Grafana is a real scrape
target. Both are the same Component type wired twice, so everything that
differs between the two scrape jobs comes from what is authored on each
connection and from where each Grafana says it serves its metrics.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: two Grafanas, `team-dashboards` and `ops-dashboards` (both `core/observability/grafana`), and a `metrics` server (`core/observability/prometheus`) that declares a `scrape_target` use of each. |
| `manifest-compose.yaml` | Maps the Prometheus type to the Compose Recipe (`compose/prometheus`) and the Grafana type to the Grafana Compose Recipe (`compose/grafana`). |
| `manifest-helm-synth.yaml` | Maps the Prometheus type to the synthesized helm Recipe (`helm/prometheus`) and the Grafana type to the synthesized Grafana helm Recipe (`helm/grafana`). Neither fetches a chart. |
| `release-compose.yaml` / `release-helm-synth.yaml` | Operator records for the two targets. |

## Wiring two targets on one socket

`scrape_target` is one socket carrying two connections, and each connection
becomes one scrape job:

```yaml
    metrics:
      type: core/observability/prometheus
      uses:
        scrape_target:
          team-dashboards:
            target: team-dashboards
          ops-dashboards:
            target: ops-dashboards
            values:
              job_name: ops-grafana
              scrape_interval: 30s
```

The `team-dashboards` connection authors no `values`, so its job takes what the
socket declares. The `ops-dashboards` connection sets two keys, and each key it
sets shapes that job alone — the `team-dashboards` job is untouched by them.

## The target says where it serves metrics

A connection says how often Prometheus scrapes and under which job name; it
never says where. That is the target's own fact, and the target publishes it:
each Grafana Recipe publishes `metrics_endpoint`, the full address of its
metrics — scheme, host, port and path, such as
`http://team-dashboards:3000/metrics` on Compose. Prometheus builds the scrape
job from that address: its scheme, its path, and its host and port as the
job's target.

So a target that serves no metrics publishes no address, and wiring one to
`scrape_target` halts the build, naming it, rather than compiling a job that
would scrape nothing. A product whose metrics are off until a value turns them
on — many in the catalog take `metrics_enabled` — publishes its address while
they are on. On Kubernetes a target may instead publish what Prometheus
discovers its metrics by, a Service or a pod selector, when no single address
reaches all of them; the Compose realization has no cluster to discover from
and halts on such a target.

The socket admits servers, stateful servers and workers alike, so a database,
a log store or an operator is wired the same way; whether it can be scraped is
decided by what it publishes.

## What it demonstrates

- **One authoring surface, many targets.** A single Aggregate is the source of
  truth for *what* the stack is. Each Manifest says *how* to realize it.
- **One socket, many connections.** Prometheus scrapes as many targets as the
  Aggregate wires into `scrape_target`. The Recipe emits one scrape job per
  connection, so the number of jobs follows the topology rather than the Recipe.
- **Per-connection configuration.** `job_name` and `scrape_interval` are
  declared on the socket's `valueSchema`, which makes them properties of a
  *connection* rather than of the server. One Prometheus scraping several
  targets cannot express several cadences in a single Component-wide value.
- **Declared defaults fill the keys a connection omits.** `scrape_interval`
  carries a default on the socket's `valueSchema`. A connection that omits it —
  `team-dashboards` here — receives it, and a connection that sets it —
  `ops-dashboards` — overrides only what it set.
- **Scrape wiring through the String Pipe.** Each Grafana Recipe's
  `metrics_endpoint` is piped into Prometheus and rendered into that Grafana's
  job: its scheme, its path and its `targets` entry. The compiler routes the
  string without interpreting it: each Recipe decides what address its own
  target publishes, and the compiler pipes it through unchanged.
- **Provider-idiomatic configuration.** On both targets the server writes a
  minimal `prometheus.yml` at start-up whose scrape jobs address the wired
  Grafanas, then execs Prometheus against it. On Compose this runs as a
  service; on Kubernetes the same container renders into a StatefulSet.
- **Persistent state.** Prometheus stores its samples on a data volume so they
  survive restarts — a named Compose volume locally, and a per-replica
  PersistentVolumeClaim sized from `infra.storage` on Kubernetes. Each Grafana
  keeps its users and dashboards on a volume of its own.
- **Reproducible images.** Every Recipe here pins its image tag from
  `infra.engine_version`, so the rendered workloads reference fixed images.
- **Lean single-purpose shape.** On Kubernetes the Prometheus component renders
  as its StatefulSet, its ClusterIP and Headless Services, and its data volume
  claim — nothing else. Each Grafana renders as its own Deployment, Service and
  data volume claim.

## Build

This workspace carries no `.aggrega-config.yaml`, so the standard-library
entities resolve from the hub registry, `hub.aggrega.ai`, and no catalog flag is
needed:

```sh
# Local development (Docker Compose)
aggrega build --release release-compose.yaml --auto-pull

# Kubernetes (Workload synthesis on prom/prometheus)
aggrega build --release release-helm-synth.yaml --auto-pull
```

Rendered artifacts land under `dist/`. `--auto-pull` resolves each Release's
dependencies into its lockfile during the build; `aggrega pull --release
release-compose.yaml` once up front does the same and lets later builds run
without the flag. The synthesized target needs no external chart fetch — both
Recipes render the official images directly into Kubernetes resources.

## What the compiled scrape configuration looks like

On Compose, the server writes a `prometheus.yml` holding one job per wired
Grafana, each addressing the `metrics_endpoint` that Grafana publishes — its
compose service name and port:

```yaml
scrape_configs:
  - job_name: ops-grafana
    scrape_interval: 30s
    scheme: http
    metrics_path: "/metrics"
    static_configs:
      - targets:
          - "ops-dashboards:3001"
  - job_name: team-dashboards
    scrape_interval: 15s
    scheme: http
    metrics_path: "/metrics"
    static_configs:
      - targets:
          - "team-dashboards:3000"
```

On Kubernetes, the same two jobs are written by the synthesized StatefulSet's
start-up command, each addressing that Grafana's Service, which the helm
provider names after the component and its `default` service key:

```yaml
scrape_configs:
  - job_name: ops-grafana
    scrape_interval: 30s
    scheme: http
    metrics_path: "/metrics"
    static_configs:
      - targets:
          - "ops-dashboards-default:3001"
  - job_name: team-dashboards
    scrape_interval: 15s
    scheme: http
    metrics_path: "/metrics"
    static_configs:
      - targets:
          - "team-dashboards-default:3000"
```

Both targets compile the same two jobs from the same two Aggregate edges: each
Grafana's `metrics_endpoint` travels through its own `scrape_target`
connection, and the compiler pipes that string into the job without
interpreting it. What differs between the targets is the address each Grafana
publishes — a compose service name on one, a Service name on the other — and
the workload the configuration is written into — a Compose service on one, a
StatefulSet on the other. Here both Grafanas sit in the same scope as
Prometheus; on Kubernetes, a Grafana the Release places in another namespace
is addressed by its Service name qualified with that namespace.

Read the `team-dashboards` job against the `ops-grafana` job to see where every
value comes from. The `ops-grafana` job carries `ops-grafana` and `30s` because
its connection authors both. The `team-dashboards` job carries
`team-dashboards` as its `job_name` because the Aggregate declares none and the
Recipe falls back to the connection alias — the name this Aggregate gave the
connection — and it carries `15s` because that is the default the Component's
`scrape_target` socket declares for the key that connection omitted. The
scheme, the `metrics_path` and the target of both jobs come from the address
each Grafana publishes, which is where Grafana serves its metrics, so neither
connection says anything about them. Setting a key on a connection overrides it
for that job and leaves the other job alone.

All of this happens on the consuming side. Per-connection configuration surfaces
only in the render context of the node that authored the connection, never in
the target's, so wiring or tuning a connection into a Grafana never perturbs
what that Grafana itself renders — its Deployment and its Service are the same
bytes either way.

Grafana answers its metrics to any caller, so neither connection carries a
credential. For a target whose metrics take one, the connection carries it in
its `credential` slot, and Prometheus presents it as a bearer token read from a
file; a target that publishes `metrics_credential_required` true halts the
build while its connection carries none.

## Run it (Compose)

```sh
aggrega build --release release-compose.yaml --auto-pull
docker compose -f dist/app/compose/docker-compose.yaml up -d
```

The Release gives each Grafana its own port — `team-dashboards` on 3000 and
`ops-dashboards` on 3001 — so both run side by side locally. Each Grafana
listens on the port its Release gives it, and each port travels in the address
that Grafana publishes into its own scrape job's target.

Open <http://127.0.0.1:9090> — the Prometheus expression browser, which the
Compose Recipe publishes on the host's loopback address only. Under
**Status → Targets** the two jobs are listed under the names the compiled
configuration gives them, `ops-grafana` and `team-dashboards`, each addressing
its Grafana's `/metrics`. A query for `grafana_build_info`, the gauge every
Grafana sets to 1 and labels with its version, returns one series per job. Tear
down with `docker compose -f dist/app/compose/docker-compose.yaml down`.
