---
example:
  level: advanced
  products: [core/datastore/documentdb, core/datastore/ferretdb, core/observability/thanos-query, core/observability/thanos-store, core/storage/s3-object-store]
  shows: [modules, boundaries]
---

# Module boundary routing — placing whole sub-modules into boundaries

This example compiles two capabilities — a **Thanos metrics read tier** over
object storage and a **document database** speaking the MongoDB wire protocol —
from one Developer-authored `Aggregate`, and places each into a boundary of its
own from the Release.

Both capabilities are **modules**: reusable sub-aggregates that each compose
several single-workload components and wire their own internal edges. The
Aggregate names the two modules and nothing about where they run. The Release
places each whole module with one `aggregates:` entry per boundary — the operator
decides where a capability runs without tracking, or restating, what is inside
it.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: imports the metrics module (`core/thanos`) and the document-database module (`core/ferretdb`). |
| `manifest.yaml` | Maps every component type the two modules contribute to its synth helm Recipe, the credential Feature the metrics module attaches to the realization that emits a Secret from each of the module's two key parameters, and the scrape Feature to its FeatureRecipe. |
| `release.yaml` | Operator record: routes each module into its own boundary, sizes one component of one module, and attaches the scrape Feature to it. |

## What it demonstrates

- **Routing a whole module into a boundary.** A boundary's `aggregates:` entry is
  keyed by the module's name in the Aggregate. It places every component the
  module contains, so the emitted artifacts for all three metrics components land
  under the `observability` boundary and both document-database components under
  `data`.
- **Naming no components at all is the primary shape.** The `data` boundary
  routes the document-database module with a bare `documents: {}`. Every
  component in it is placed and takes its own schema defaults; the Release needs
  the module's name and nothing else about it.
- **Configuring a routed component by its local name.** A routing entry may also
  configure individual components of the module it routes, addressed by the
  **local** name each carries inside that module — `query`, not `metrics.query`,
  because inside the module that is the only name it has. Naming one component
  says nothing about the others: here `query` is sized and given a scrape target
  while the object store and the store gateway are routed in on their defaults.
- **A routed component is a component of that boundary.** It inherits the
  boundary's annotation cascade like any other, which is what gives every
  resource of a routed module the boundary's `aggrega.ai/namespace` value —
  including the components the routing entry never mentions.
- **Routing is placement, not a different kind of membership.** A component
  routed in with nothing said about it renders the same as the same component
  named directly in that boundary with an empty body. The two spellings are two
  ways to say where a component belongs, not two behaviours.

## Build

This workspace carries no `.aggrega-config.yaml`, so the standard-library
entities resolve from the hub registry, `hub.aggrega.ai`, and no catalog flag is
needed; `--auto-pull` writes the lockfile a fresh clone lacks during the build:

```sh
aggrega build --release release.yaml --auto-pull
```

Rendered artifacts land under `dist/`. The Kubernetes target renders plain
manifests offline — no chart pull is required.

## What the placed stacks look like

Each boundary's `directory` is the artifact root for everything placed in it, so
the two modules' components separate on disk by the boundary that routed them:

```
dist/observability/helm/   metrics-zdobjstore, metrics-zdstore, metrics-zdquery
dist/data/helm/            documents-zdproxy, documents-zdbackend
```

The filenames carry each component's identity with the module separator written
out, because a dot is not a character every resource name can hold — `metrics.store`
in the Aggregate is `metrics-zdstore` in the cluster. Composing a module is the
only thing that puts a separator in an identity, so a component you name directly
is spelled the same in both places.

Every resource carries the routing boundary's namespace and records which
boundary placed it. The store gateway is never named in the routing entry and
still inherits both:

```yaml
metadata:
  name: metrics-zdstore
  namespace: observability
  [… omitted: the labels every rendered document carries]
  annotations:
    aggrega.ai/boundary-path: observability
    [… omitted: the annotation naming the Recipe that rendered it]
```

The same holds for the four Secrets the metrics module's credential Feature
emits for the object store's key pair and the one the store gateway presents to
it: each lands under `observability` with that namespace, beside the workload
that reads it.

The scrape Feature attached to the routed `query` component renders its own
artifact under that same boundary, carrying the operator's scrape settings:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: metrics-zdquery-scrape
  [… omitted: the namespace, labels and annotations every rendered document carries]
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: metrics-zdquery
  endpoints:
    - port: http
      interval: 30s
      path: /metrics
```
