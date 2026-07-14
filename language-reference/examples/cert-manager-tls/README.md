# cert-manager — Kubernetes TLS-certificate lifecycle controller

This example compiles a small, real stack — a **cert-manager** certificate
controller — from one Developer-authored `Aggregate` to Kubernetes. The same
Aggregate is realized **two ways** by two interchangeable provider Recipes: the
official cert-manager Helm chart from the jetstack registry, and a Bitnami
chart-wrap. The developer's intent never changes; only the Ops mapping does.

cert-manager is a cluster-scoped Kubernetes add-on that automates the issuance
and renewal of X.509 certificates from issuing sources such as ACME (Let's
Encrypt), a private CA, or Vault. It extends the cluster with its own
`Certificate`, `Issuer`, and `ClusterIssuer` custom resources. Applications ask
for certificates by declaring those resources — not by wiring an upstream — so
the component takes no `uses` edge and exports nothing to consumers. For the
same reason it has no standalone local-container form, so this family ships
Helm Recipes only; there is no Compose target.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: a single `cert-manager` component (`core/security/cert-manager`) with CRD installation on. Shared by both realizations. |
| `manifest.yaml` | Maps the component type to the official cert-manager Helm Recipe (`cert-manager`). |
| `release.yaml` | Operator record for the Kubernetes target using the official chart: the controller/webhook/CA-injector sizing. |
| `manifest-bitnami.yaml` | Maps the component type to the Bitnami chart-wrap Recipe (`cert-manager-bitnami`). |
| `release-bitnami.yaml` | Operator record for the Kubernetes target using the Bitnami chart: the controller/webhook/CA-injector sizing. |

## What it demonstrates

- **One authoring surface, many realizations.** A single Aggregate is the
  source of truth for *what* cert-manager is. Two Manifests, each paired with
  its own Release, say *how* to realize it — one through the official chart, one
  through the Bitnami chart — without touching developer intent.
- **Recipe selection is an Ops decision.** The Manifest maps the component type
  to a Recipe by name; swapping the Manifest swaps the chart. The developer
  authors the component once; the operator chooses the provider chart per
  deployment.
- **Three coordinated workloads from one component.** Each chart-wrap Recipe
  renders all three halves of cert-manager: a `Deployment` for the controller
  that reconciles certificate requests, a `Deployment` for the webhook that
  validates and defaults the custom resources, and a `Deployment` for the CA
  injector that wires the webhook's CA bundle into the cluster.
- **Certificate API installation.** The developer's `install_crds` value flows
  into whichever chart is selected, which installs cert-manager's
  `CustomResourceDefinition`s (the `Certificate`, `Issuer`, `ClusterIssuer`, and
  ACME `Order`/`Challenge` resources). Set it false when the CRDs are managed out
  of band.
- **Admission wiring.** Each chart emits the `ValidatingWebhookConfiguration`
  and `MutatingWebhookConfiguration` the webhook serves, the webhook `Service`,
  and the full RBAC set — one `ClusterRole`/`ClusterRoleBinding` per controller
  responsibility plus the leader-election `Role`s — so the controller has the
  permissions it needs.
- **Reproducible images.** Each chart ships resolvable release tags; the
  chart-wrap Recipe re-pins the controller, webhook, CA-injector, and ACME
  solver images to those tags so the rendered workloads reference immutable
  versions.

## Build

The workspace catalog supplies the standard-library entities, so no explicit
catalog flag is needed. Pick the realization by its Release:

```sh
# Official cert-manager chart (jetstack)
aggrega pull  --release release.yaml
aggrega build --release release.yaml

# Bitnami chart-wrap
aggrega pull  --release release-bitnami.yaml
aggrega build --release release-bitnami.yaml
```

Rendered artifacts land under `dist/`. The build resolves the upstream chart by
OCI reference on `aggrega pull` and pins it in a lockfile.

## What renders

Both realizations emit the full cert-manager stack — three `Deployment`s (the
controller, the webhook, and the CA injector), the six cert-manager
`CustomResourceDefinition`s, a `ValidatingWebhookConfiguration` and a
`MutatingWebhookConfiguration`, the webhook `Service`, the controller
`ServiceAccount`s, and the RBAC set of `ClusterRole`s, `ClusterRoleBinding`s,
and leader-election `Role`s and `RoleBinding`s. The controller, webhook,
CA-injector, and ACME-solver images are pinned to their release tags, so every
workload references an immutable image.

The two charts differ in the auxiliary objects they include:

- The **official chart** (`release.yaml`) emits **50** Kubernetes objects,
  including a post-install `Job` (the startup API check that blocks until the
  certificate API is serving) and a metrics `Service` for the controller.
- The **Bitnami chart** (`release-bitnami.yaml`) emits **48** Kubernetes
  objects, adding a `NetworkPolicy` and a `PodDisruptionBudget` per workload.

Both install the same six `CustomResourceDefinition`s when `install_crds` is on.
