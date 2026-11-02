---
example:
  level: authoring
  products: []
  shows: [catalog-authoring]
---

# Workload library import — a shared Workload body via `$import`

A single stateless web service whose Recipe synthesizes its Kubernetes Workload
from a **shared library entry** instead of an inline body. This is the third
authoring mode of `spec.workload` on a Recipe:

- **Mode 1 (inline):** a Go-template Workload written directly in the Recipe.
- **Mode 2 (file import):** `$import: ./relative/path.yaml` — a local file.
- **Mode 3 (library import):** `$import: <Library>#/workloads/<Entry>` — a
  `WorkloadLibrary` entry referenced by bare-name identity.

The `web-service` Recipe here uses Mode 3:

```yaml
spec:
  capability: helm
  implements: example/compute/web-service
  workload:
    $import: BaseWorkloads#/workloads/StatelessService
```

Write the reference as one unbroken token: no space and no line break anywhere in
it, from the library name through the fragment. A reference carrying whitespace is
refused rather than trimmed, and the build halts — see
[`errors/fatal-halts.md`](../../errors/fatal-halts.md) "A reference to a library
entry carries whitespace".

`BaseWorkloads` is a `WorkloadLibrary` published in the hub catalog
(`workloadlibrary/base-workloads`). Its `StatelessService` entry is a Go template
evaluated in this Recipe's render context, so `.values.image` (from the
Component/Aggregate) and `.infra.*` (replicas, port, compute — from the Release)
flow into it exactly as they would an inline body. Factoring the Workload into a
library changes nothing about what deploys: the rendered output is **byte-identical**
to the equivalent inline Workload.

The library's version is supplied by the per-Release lockfile — no registry host
appears in the reference. On `aggrega pull`, `BaseWorkloads` is pinned in the
lockfile's `workload_libraries` section; on `aggrega build`, the pinned library is
resolved and its entry rendered.

## Building

```bash
aggrega pull --release release.yaml   # pins BaseWorkloads in release.lock
aggrega build --release release.yaml
```

The catalog resolves from the hub registry named in `.aggrega-config.yaml`
(which supplies `BaseWorkloads` and the helm provider) plus this example's local
`catalog/` (the `web-service` Component and Recipe). Manifests land under
`dist/app/helm/` — the boundary's `directory:` followed by the provider
capability.

## Verifying the byte-identity claim

Replace the Recipe's `workload: { $import: … }` with a `workload: |` block
holding the `StatelessService` body verbatim, rebuild, and diff the two `dist/`
trees. They match exactly: the library reference resolves to the same template
text, evaluated in the same render context, so the import is a factoring of the
authoring surface with no effect on the rendered bytes.
