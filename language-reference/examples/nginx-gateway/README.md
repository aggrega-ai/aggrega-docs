# NGINX gateway — reverse-proxy routing to an upstream, two targets

This example compiles a small, real stack — an **NGINX** reverse-proxy gateway
fronting a **web backend** — from one Developer-authored `Aggregate` to two
deployment targets:

- **Docker Compose** for local development, and
- the **Bitnami NGINX Helm chart** for Kubernetes.

The same `aggregate.yaml` drives both. Only the Recipe layer selected by the
Manifest changes per target.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: a `web` backend (`core/devtool/adminer`) and a `proxy` gateway (`core/gateway/nginx`) that declares an `upstream` use of the backend. |
| `manifest-compose.yaml` | Maps the gateway type to the Compose Recipe (`nginx`) and the backend to the Compose Adminer Recipe. |
| `manifest-bitnami.yaml` | Maps the gateway type to the Bitnami chart-wrap Recipe (`nginx-bitnami`) and the backend to the offline Adminer Recipe. |
| `release-compose.yaml` / `release-bitnami.yaml` | Operator records for the two targets. |

## What it demonstrates

- **One authoring surface, many targets.** A single Aggregate is the source of
  truth for *what* the stack is. Each Manifest says *how* to realize it.
- **Upstream routing through the String Pipe.** The gateway declares an
  `upstream` use of the backend; the backend Recipe's `provides.host` and
  `provides.port` are piped into the gateway and rendered into its `proxy_pass`
  target. The compiler routes the strings without interpreting them — so the
  Compose build wires a compose service name and the Kubernetes build wires a
  Service name, from the same edge.
- **Provider-idiomatic configuration.** On Compose the gateway writes a minimal
  NGINX server block at start-up whose `proxy_pass` forwards to the injected
  upstream. On Kubernetes the chart-wrap Recipe feeds the same server block into
  the chart's `serverBlock` value, which the chart renders into a ConfigMap and
  mounts into the workload.
- **Reproducible images.** The Bitnami chart floats its image tag at `latest`;
  the chart-wrap Recipe pins the NGINX image by digest so the rendered
  Deployment references an immutable image.
- **Plain HTTP by default.** TLS is disabled for a plain reverse proxy; a
  certificate can be supplied through `infra.overrides` to enable chart TLS.

## Build

The workspace catalog supplies the standard-library entities, so no explicit
catalog flag is needed:

```sh
# Local development (Docker Compose)
aggrega build --release release-compose.yaml

# Kubernetes (Bitnami NGINX Helm chart)
aggrega pull  --release release-bitnami.yaml
aggrega build --release release-bitnami.yaml
```

Rendered artifacts land under `dist/`. The Kubernetes build resolves the
upstream chart by OCI reference on `aggrega pull` and pins it in a lockfile.

## What the injected upstream looks like

On Compose, the gateway service runs NGINX with a server block pointing at the
backend's compose service name and port:

```conf
server { listen 8080; location / { proxy_pass http://web:8080; } }
```

On Kubernetes, the same routing arrives in the chart's server-block ConfigMap:

```conf
server {
  listen 0.0.0.0:8080;
  location / {
    proxy_pass http://web:8080;
  }
}
```

Both resolve from the same Aggregate edge — the backend host and port travel
through the `upstream` use, and each target renders them in its own idiom.

## Run it (Compose)

```sh
aggrega build --release release-compose.yaml
docker compose -f dist/app/compose/docker-compose.yaml up -d
```

Open <http://localhost:8080> — NGINX forwards the request to the backend.
Tear down with
`docker compose -f dist/app/compose/docker-compose.yaml down`.
