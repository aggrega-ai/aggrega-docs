---
example:
  level: start
  products: [core/security/openbao]
  shows: [external-sources]
---

# OpenBao — Kubernetes secrets-management server

This example compiles a small, real stack — a single **OpenBao** secrets
server — from one Developer-authored `Aggregate` to Kubernetes, backed by the
**official OpenBao Helm chart**.

OpenBao stores, generates, and controls access to tokens, passwords,
certificates, and other secrets behind an authenticated HTTP API, and encrypts
its state at rest on a durable data volume. It runs here as a single standalone
server that keeps its state in the built-in file storage backend, so it renders
as a stateful running server backed by a persistent volume rather than a
managed-cloud resource. The server is initialized and unsealed at runtime inside
the cluster — its root token and unseal keys are produced by the running server
after it starts — so no credential is declared in the Aggregate and no secret is
materialized at build time.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: a single `secrets` component (`core/security/openbao`) with the built-in web UI on. |
| `manifest.yaml` | Maps the component type to the official sourced Recipe (`openbao`). |
| `release.yaml` | Operator record for the Kubernetes target: the server's compute sizing and data-volume size. |

## What it demonstrates

- **One authoring surface.** A single Aggregate is the source of truth for
  *what* the secrets server is; the Manifest says *how* to realize it.
- **A developer value flows to the render.** The developer's `ui_enabled`
  value is written into the server configuration the chart mounts, gating the
  built-in web UI.
- **A stateful server on a persistent volume.** The sourced Recipe
  configures standalone mode with the file storage backend, so the server keeps
  its encrypted state on a `PersistentVolumeClaim` mounted at `/openbao/data`,
  sized by the operator's `storage.size`.
- **No render-time credential.** OpenBao initializes and unseals itself at
  runtime, so the build wires no credential and emits no `Secret`. The rendered
  output is byte-identical across runs of the same input.
- **A reproducible image.** The Recipe pins the server image to a resolvable
  release tag (`quay.io/openbao/openbao:2.5.5`), so the rendered workload
  references a pinned version.

## Build

This workspace carries no `.aggrega-config.yaml`, so the standard-library
entities resolve from the hub registry, `hub.aggrega.ai`, and no catalog flag is
needed:

```sh
aggrega pull  --release release.yaml
aggrega build --release release.yaml
```

Rendered artifacts land under `dist/`. The build resolves the upstream chart by
OCI reference on `aggrega pull` and pins it in a lockfile.

## What renders

The build emits the lean single-workload OpenBao stack as seven Kubernetes
objects:

- a `StatefulSet` for the OpenBao server,
- a `ConfigMap` carrying the server configuration (the file storage backend and
  the API listener),
- two `Service`s — the main API service and the internal headless service the
  StatefulSet uses for stable pod networking,
- a `ServiceAccount` for the server pod,
- a `ClusterRoleBinding` granting the server the token-review permission it uses
  to authenticate Kubernetes service accounts,
- a `helm.sh/hook: test` `Pod` that probes server readiness.

There are no `CustomResourceDefinition`s — OpenBao is a self-contained server,
not a controller that extends the cluster API. The server image is pinned to its
release tag, so the workload references a pinned image tag.
