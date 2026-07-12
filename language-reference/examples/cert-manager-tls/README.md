# cert-manager — Kubernetes TLS-certificate lifecycle controller

This example compiles a small, real stack — a **cert-manager** certificate
controller — from one Developer-authored `Aggregate` to Kubernetes, backed by
the **Bitnami cert-manager Helm chart**.

cert-manager is a cluster-scoped Kubernetes add-on that automates the issuance
and renewal of X.509 certificates from issuing sources such as ACME (Let's
Encrypt), a private CA, or Vault. It extends the cluster with its own
`Certificate`, `Issuer`, and `ClusterIssuer` custom resources. Applications ask
for certificates by declaring those resources — not by wiring an upstream — so
the component takes no `uses` edge and exports nothing to consumers. For the
same reason it has no standalone local-container form, so this family ships a
Helm Recipe only; there is no Compose target.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: a single `cert-manager` component (`core/security/cert-manager`) with CRD installation on. |
| `manifest-bitnami.yaml` | Maps the component type to the Bitnami chart-wrap Recipe (`cert-manager-bitnami`). |
| `release-bitnami.yaml` | Operator record for the Kubernetes target: the controller/webhook/CA-injector sizing. |

## What it demonstrates

- **One authoring surface.** A single Aggregate is the source of truth for
  *what* cert-manager is; the Manifest says *how* to realize it.
- **Three coordinated workloads from one component.** The chart-wrap Recipe
  renders all three halves of cert-manager: a `Deployment` for the controller
  that reconciles certificate requests, a `Deployment` for the webhook that
  validates and defaults the custom resources, and a `Deployment` for the CA
  injector that wires the webhook's CA bundle into the cluster.
- **Certificate API installation.** The developer's `install_crds` value flows
  into the chart, which installs cert-manager's `CustomResourceDefinition`s
  (the `Certificate`, `Issuer`, `ClusterIssuer`, and ACME `Order`/`Challenge`
  resources). Set it false when the CRDs are managed out of band.
- **Admission wiring.** The chart emits the `ValidatingWebhookConfiguration` and
  `MutatingWebhookConfiguration` the webhook serves, the webhook `Service`, and
  the full RBAC set — one `ClusterRole`/`ClusterRoleBinding` per controller
  responsibility plus the leader-election `Role`s — so the controller has the
  permissions it needs.
- **Reproducible images.** The chart ships resolvable release tags; the
  chart-wrap Recipe re-pins the controller, webhook, CA-injector, and ACME
  solver images to those tags so the rendered workloads reference immutable
  versions.

## Build

The workspace catalog supplies the standard-library entities, so no explicit
catalog flag is needed:

```sh
aggrega pull  --release release-bitnami.yaml
aggrega build --release release-bitnami.yaml
```

Rendered artifacts land under `dist/`. The build resolves the upstream chart by
OCI reference on `aggrega pull` and pins it in a lockfile.

## What renders

The build emits the full cert-manager stack as 48 Kubernetes objects:

- three `Deployment`s — the controller, the webhook, and the CA injector,
- the six cert-manager `CustomResourceDefinition`s,
- a `ValidatingWebhookConfiguration` and a `MutatingWebhookConfiguration`,
- the webhook `Service` and the controller metrics `Service`,
- the RBAC set — eleven `ClusterRole`s, nine `ClusterRoleBinding`s, and the
  leader-election `Role`s and `RoleBinding`s,
- a `ServiceAccount`, a `NetworkPolicy`, and a `PodDisruptionBudget` for each
  workload.

The controller, webhook, CA-injector, and ACME-solver images are pinned to
their release tags, so every workload references an immutable image.
