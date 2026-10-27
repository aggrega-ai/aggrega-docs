---
example:
  level: start
  products: [core/devtool/adminer, core/gateway/nginx]
  shows: [multi-target, connections]
---

# NGINX gateway — reverse-proxy routing to an upstream, two targets

This example compiles a small, real stack — an **NGINX** reverse-proxy gateway
fronting a **web backend** — from one Developer-authored `Aggregate` to two
targets:

- **Docker Compose** for local development, and
- **synthesized Kubernetes manifests** for a cluster.

The same `aggregate.yaml` drives both. Only the Recipe layer selected by the
Manifest changes per target.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: a `web` backend (`core/devtool/adminer`) and a `proxy` gateway (`core/gateway/nginx`) that declares an `upstream` use of the backend. |
| `manifest-compose.yaml` | Maps the gateway type to the Compose Recipe (`compose/nginx`) and the backend to the Compose Adminer Recipe. |
| `manifest-helm-synth.yaml` | Maps the gateway type to the synth helm Recipe (`helm/nginx`) and the backend to the offline Adminer helm Recipe. |
| `release-compose.yaml` / `release-helm-synth.yaml` | Operator records for the two targets. |

## What it demonstrates

- **One authoring surface, many targets.** A single Aggregate is the source of
  truth for *what* the stack is. Each Manifest says *how* to realize it.
- **Upstream routing through the String Pipe.** The gateway declares an
  `upstream` use of the backend; the backend Recipe's `provides.host` and
  `provides.port` are piped into the gateway and rendered into its `proxy_pass`
  target. The compiler routes the strings without interpreting them — so the
  Compose build wires a compose service name and the Kubernetes build wires a
  Service name, from the same edge.
- **Provider-idiomatic configuration.** On both targets the gateway writes a
  minimal NGINX server block at container start whose `proxy_pass` forwards to
  the injected upstream, then starts nginx in the foreground. The Kubernetes
  target realizes this as a stateless Deployment plus a ClusterIP Service, with
  no external Helm chart.
- **Reproducible images.** The Kubernetes target runs the official upstream
  nginx image pinned to an explicit tag, so the rendered Deployment references
  a stable image.

## Build

This workspace carries no `.aggrega-config.yaml`, so the standard-library
entities resolve from the hub registry, `hub.aggrega.ai`, and no catalog flag is
needed; `--auto-pull` writes the lockfile a fresh clone lacks during the build:

```sh
# Local development (Docker Compose)
aggrega build --release release-compose.yaml --auto-pull

# Kubernetes (synthesized manifests)
aggrega build --release release-helm-synth.yaml --auto-pull
```

Rendered artifacts land under `dist/`. The Kubernetes target renders plain
manifests offline — no chart pull is required.

## What the injected upstream looks like

On Compose, the gateway service runs NGINX with a server block pointing at the
backend's compose service name and port:

```conf
server { listen 8000; location / { proxy_pass http://web:8080; } }
```

On Kubernetes, the same routing arrives in the container command that writes
the server config before starting nginx, pointing at the backend's Service —
the helm provider names it after the backend and its `default` service key:

```conf
server { listen 8080; location / { proxy_pass http://web-default:8080; } }
```

Both resolve from the same Aggregate edge — the backend host and port travel
through the `upstream` use, and each target renders them in its own idiom.

## Run it (Compose)

```sh
aggrega build --release release-compose.yaml --auto-pull
docker compose -f dist/app/compose/docker-compose.yaml up -d
```

Open <http://localhost:8000> — NGINX forwards the request to the backend.
Tear down with
`docker compose -f dist/app/compose/docker-compose.yaml down`.
