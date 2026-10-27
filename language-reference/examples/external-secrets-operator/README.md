---
example:
  level: start
  products: [core/security/external-secrets]
  shows: [external-sources]
---

# external-secrets — Kubernetes secrets-synchronization operator

This example compiles a small, real stack — the **external-secrets** operator —
from one Developer-authored `Aggregate` to Kubernetes, backed by the **official
external-secrets Helm chart**.

external-secrets synchronizes secret material from external secret-management
systems — HashiCorp Vault, AWS Secrets Manager, Google Secret Manager, Azure Key
Vault, and others — into native Kubernetes Secrets, keeping them in sync as the
source changes. It is a cluster-scoped controller that extends the cluster API
with its own custom resources rather than a server applications route to, so it
takes no `uses` edge, and all it publishes is where a Prometheus server finds
its metrics: applications obtain their secrets by declaring `ExternalSecret` and
`SecretStore` resources, and the operator materializes the corresponding
Kubernetes `Secret`s.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: a single `external-secrets` component (`core/security/external-secrets`) installing the custom resource definitions with the release. |
| `manifest.yaml` | Maps the component type to the official sourced Recipe (`external-secrets`). |
| `release.yaml` | Operator record for the Kubernetes target: the operator's compute sizing. |

## What it demonstrates

- **One authoring surface.** A single Aggregate is the source of truth for
  *what* the operator is; the Manifest says *how* to realize it.
- **A developer value flows to the render.** The developer's `install_crds`
  value is written into the chart's `installCRDs` value, bringing the
  external-secrets custom resource definitions into the cluster with the
  release.
- **A cluster-extending controller, no topology edge.** external-secrets adds
  its own custom resources to the cluster API; consumers request secrets by
  declaring those resources, so the component wires no `uses` edge and exports
  nothing but where its metrics are.
- **A single coherent operator.** The chart renders the controller, the webhook,
  and the certificate controller as one operator; the bundled provider subchart
  is off, so no foreign datastore, cache, or broker is pulled in. The rendered
  output is byte-identical across runs of the same input.
- **A reproducible image.** The Recipe pins all three container images to a
  resolvable release tag (`ghcr.io/external-secrets/external-secrets:v2.7.0`),
  so the rendered workloads reference a pinned version.

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

The build emits the external-secrets operator as a set of Kubernetes objects:

- 24 `CustomResourceDefinition`s for the external-secrets API (`ExternalSecret`,
  `SecretStore`, `ClusterSecretStore`, and the related push and generator
  resources),
- three `Deployment`s — the controller, the webhook, and the certificate
  controller,
- the RBAC that binds them: `ClusterRole`s, `ClusterRoleBinding`s, a `Role`, and
  a `RoleBinding`,
- three `ServiceAccount`s, one per workload,
- a `Service` for the webhook,
- two `ValidatingWebhookConfiguration`s,
- a placeholder `Secret` the certificate controller populates with the webhook's
  serving certificate at runtime.

All three container images are pinned to their release tag, so the workloads
reference pinned images.
