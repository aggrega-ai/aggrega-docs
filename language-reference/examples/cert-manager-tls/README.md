---
example:
  level: start
  products: [core/security/cert-manager]
  shows: [external-sources]
---

# cert-manager — Kubernetes TLS-certificate lifecycle controller

This example compiles a small, real stack — a **cert-manager** certificate
controller — from one Developer-authored `Aggregate` to Kubernetes. The
developer declares *what* cert-manager is; a single Ops Recipe maps that intent
to the official cert-manager Helm chart from the jetstack registry and renders
the Kubernetes objects.

cert-manager is a cluster-scoped Kubernetes add-on that automates the issuance
and renewal of X.509 certificates from issuing sources such as ACME (Let's
Encrypt), a private CA, or Vault. It extends the cluster with its own
`Certificate`, `Issuer`, and `ClusterIssuer` custom resources. Applications ask
for certificates by declaring those resources — not by wiring an upstream — so
the component takes no `uses` edge. For the same reason it has no standalone
local-container form, so this family ships a Helm Recipe only; there is no
Compose target. All the component publishes is where a Prometheus server finds
its metrics.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: a single `cert-manager` component (`core/security/cert-manager`) with CRD installation on. |
| `manifest.yaml` | Maps the component type to the cert-manager Helm Recipe (`cert-manager`). |
| `release.yaml` | Operator record for the Kubernetes target: the controller/webhook/CA-injector sizing. |

## What it demonstrates

- **One authoring surface, realized by an Ops Recipe.** The Aggregate is the
  source of truth for *what* cert-manager is. The Manifest says *how* to realize
  it by mapping the component type to a Recipe by name; the Release supplies the
  operational sizing. Developer intent and Ops mapping stay separate.
- **Three coordinated workloads from one component.** The Recipe renders all
  three halves of cert-manager: a `Deployment` for the controller that
  reconciles certificate requests, a `Deployment` for the webhook that validates
  and defaults the custom resources, and a `Deployment` for the CA injector that
  wires the webhook's CA bundle into the cluster.
- **Certificate API installation.** The developer's `install_crds` value flows
  into the chart, which installs cert-manager's `CustomResourceDefinition`s (the
  `Certificate`, `Issuer`, `ClusterIssuer`, and ACME `Order`/`Challenge`
  resources). Set it false when the CRDs are managed out of band.
- **Admission wiring.** The chart emits the `ValidatingWebhookConfiguration` and
  `MutatingWebhookConfiguration` the webhook serves, the webhook `Service`, and
  the full RBAC set — one `ClusterRole`/`ClusterRoleBinding` per controller
  responsibility plus the leader-election `Role`s — so the controller has the
  permissions it needs.
- **Reproducible images.** The chart ships resolvable release tags; the Recipe
  re-pins the controller, webhook, CA-injector, and ACME solver images to those
  tags so the rendered workloads reference pinned versions.

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

The build emits the full cert-manager stack — three `Deployment`s (the
controller, the webhook, and the CA injector), the six cert-manager
`CustomResourceDefinition`s when `install_crds` is on, a
`ValidatingWebhookConfiguration` and a `MutatingWebhookConfiguration`, the
webhook `Service`, the controller `ServiceAccount`s, and the RBAC set of
`ClusterRole`s, `ClusterRoleBinding`s, and leader-election `Role`s and
`RoleBinding`s. It also includes a post-install `Job` (the startup API check
that blocks until the certificate API is serving) and a metrics `Service` each
for the controller and the CA injector — **50** Kubernetes objects in all. The
controller, webhook, CA-injector, and ACME-solver images are pinned to their
release tags, so every workload references a pinned image tag.
