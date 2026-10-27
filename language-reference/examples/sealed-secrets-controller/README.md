---
example:
  level: start
  products: [core/security/sealed-secrets]
  shows: [external-sources]
---

# sealed-secrets — Kubernetes SealedSecret decryption controller

This example compiles a small, real stack — the **sealed-secrets** controller —
from one Developer-authored `Aggregate` to Kubernetes, backed by the **official
sealed-secrets Helm chart** served from an HTTPS chart repository.

sealed-secrets lets encrypted secret material be committed to source control
safely: a public key encrypts a secret into a `SealedSecret` custom resource,
and a cluster-scoped controller holding the matching private key decrypts it
back into a native Kubernetes `Secret`. The controller extends the cluster API
with its own `SealedSecret` custom resource rather than being a server
applications route to, so it takes no `uses` edge and exports nothing to
consumers: applications obtain their secrets by declaring `SealedSecret`
resources, and the controller unseals the corresponding Kubernetes `Secret`s.
The controller generates its sealing keypair in the cluster at runtime, so no
key material is produced at render time.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: a single `sealed-secrets` component (`core/security/sealed-secrets`). |
| `manifest.yaml` | Maps the component type to the official sourced Recipe (`sealed-secrets`). |
| `release.yaml` | Operator record for the Kubernetes target: the operator's compute sizing. |

## What it demonstrates

- **One authoring surface.** A single Aggregate is the source of truth for
  *what* the controller is; the Manifest says *how* to realize it.
- **A chart served over HTTPS.** The Recipe sources the chart from an HTTPS chart
  repository rather than an OCI registry; the build resolves and pins it on
  `aggrega pull`.
- **A CRD that ships in the chart's CRD directory.** The `SealedSecret`
  CustomResourceDefinition lives in the chart's Helm-native CRD directory, not in
  the templates; it renders into the output with the release unconditionally.
- **A cluster-extending controller, no topology edge.** sealed-secrets adds its
  own custom resource to the cluster API; consumers request secrets by declaring
  `SealedSecret` resources, so the component wires no `uses` edge and exports
  nothing.
- **A single coherent controller.** The chart renders one controller with its
  RBAC and Services, no foreign datastore, cache, or broker. The rendered output
  is byte-identical across runs of the same input.
- **A reproducible image.** The Recipe pins the controller image to a resolvable
  release tag (`docker.io/bitnami/sealed-secrets-controller:0.38.4`), so the
  rendered workload references a pinned version.

## Build

This workspace carries no `.aggrega-config.yaml`, so the standard-library
entities resolve from the hub registry, `hub.aggrega.ai`, and no catalog flag is
needed:

```sh
aggrega pull  --release release.yaml
aggrega build --release release.yaml
```

Rendered artifacts land under `dist/`. The build resolves the upstream chart from
the HTTPS chart repository on `aggrega pull` and pins it in a lockfile.

## What renders

The build emits the sealed-secrets controller as a set of Kubernetes objects:

- one `CustomResourceDefinition` for the sealed-secrets API (`SealedSecret`),
- one `Deployment` — the controller,
- the RBAC that binds it: a `ClusterRole`, a `ClusterRoleBinding`, two `Role`s,
  and two `RoleBinding`s,
- one `ServiceAccount`,
- two `Service`s — the controller service and its metrics service.

The controller image is pinned to its release tag, so the workload references a
pinned image tag.
