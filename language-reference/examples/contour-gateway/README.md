---
example:
  level: start
  products: [core/gateway/contour]
  shows: [external-sources]
---

# Contour gateway — a Kubernetes-native ingress controller

This example compiles a small, real stack — a **Contour** ingress gateway — from
one Developer-authored `Aggregate` to Kubernetes. The developer declares *what*
the gateway is; a single Ops Recipe maps that intent to the official
**project-contour** Helm chart (served from the project's HTTPS chart
repository) and renders the Kubernetes objects.

Contour is a Kubernetes-native ingress controller. Its control plane watches the
cluster's `Ingress` and `HTTPProxy` resources and programs an **Envoy** data
plane, which terminates client HTTP and HTTPS traffic and load-balances it to
the backing services those resources name. Its routing input is the cluster's
own Ingress objects — not a wired upstream — so the gateway takes no `uses`
edge. Applications reach it by declaring Ingress resources against its ingress
class. For the same reason it has no standalone local-container form, so this
family ships a Helm Recipe only; there is no Compose target.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: a single `gateway` component (`core/gateway/contour`) that names the ingress class it reconciles. |
| `manifest.yaml` | Maps the gateway type to the project-contour Helm Recipe (`contour`). |
| `release.yaml` | Operator record for the Kubernetes target: the Envoy service port and control-plane/data-plane sizing. |

## What it demonstrates

- **One authoring surface, realized by an Ops Recipe.** The Aggregate is the
  source of truth for *what* the gateway is. The Manifest says *how* to realize
  it by mapping the gateway type to a Recipe by name; the Release supplies the
  operational sizing. Developer intent and Ops mapping stay separate.
- **Control plane and data plane from one component.** The Recipe renders both
  halves of the ingress controller: a `Deployment` for the Contour control plane
  and a `DaemonSet` for the Envoy data plane, wired together by the chart.
- **Ingress-class ownership.** The developer's `ingress_class_name` value flows
  into the chart, which creates an `IngressClass` of that name. Applications
  route to the gateway by referencing that class in their Ingress resources.
- **CRD management.** Contour installs and manages its own
  `CustomResourceDefinition`s (its `HTTPProxy` family). The Recipe leaves CRD
  management on by default; disable it through `infra.overrides.manage_crds`
  when the CRDs are pre-installed.
- **Data-plane entry point.** The Envoy `Service` is exposed as a
  `LoadBalancer` by default; the operator sets the HTTP service port through
  `infra.port` and can change the service type through
  `infra.overrides.service_type`.
- **Reproducible images.** The Recipe re-pins the Contour and Envoy images to
  explicit release tags so the rendered workloads reference pinned versions.

## Build

This workspace carries no `.aggrega-config.yaml`, so the standard-library
entities resolve from the hub registry, `hub.aggrega.ai`, and no catalog flag is
needed:

```sh
aggrega pull  --release release.yaml
aggrega build --release release.yaml
```

Rendered artifacts land under `dist/`. The build resolves the upstream chart on
`aggrega pull` and pins it in a lockfile.

## What renders

The build emits the full ingress-controller stack:

- a `Deployment` running the Contour control plane,
- a `DaemonSet` running the Envoy data plane,
- the Contour `CustomResourceDefinition`s,
- an `IngressClass` named `contour`,
- a `LoadBalancer` `Service` fronting Envoy on HTTP port 80 and HTTPS port 443,

alongside the supporting `ConfigMap`, certificate-generation `Job`, the
control plane's `Service`, `NetworkPolicy`, RBAC, and `ServiceAccount`. The
Contour and Envoy images are pinned to their release tags, so every workload
references a pinned image tag.
