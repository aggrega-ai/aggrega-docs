# Contour gateway — a Kubernetes-native ingress controller

This example compiles a small, real stack — a **Contour** ingress gateway — from
one Developer-authored `Aggregate` to Kubernetes, backed by the **Bitnami
Contour Helm chart**.

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
| `manifest-bitnami.yaml` | Maps the gateway type to the Bitnami chart-wrap Recipe (`contour-bitnami`). |
| `release-bitnami.yaml` | Operator record for the Kubernetes target: the Envoy service port and control-plane/data-plane sizing. |

## What it demonstrates

- **One authoring surface.** A single Aggregate is the source of truth for
  *what* the gateway is; the Manifest says *how* to realize it.
- **Control plane and data plane from one component.** The chart-wrap Recipe
  renders both halves of the ingress controller: a `Deployment` for the Contour
  control plane and a `DaemonSet` for the Envoy data plane, wired together by the
  chart.
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
- **Reproducible images.** The chart ships resolvable release tags; the
  chart-wrap Recipe re-pins the Contour and Envoy images to those tags so the
  rendered workloads reference immutable versions.

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

The build emits the full ingress-controller stack:

- a `Deployment` running the Contour control plane,
- a `DaemonSet` running the Envoy data plane,
- the Contour `CustomResourceDefinition`s,
- an `IngressClass` named `contour`,
- a `LoadBalancer` `Service` fronting Envoy on HTTP port 80 and HTTPS port 443,

alongside the supporting `ConfigMap`, certificate-generation `Job`,
`NetworkPolicy`, RBAC, and `ServiceAccount`. The Contour and Envoy images are
pinned to their release tags, so every workload references an immutable image.
