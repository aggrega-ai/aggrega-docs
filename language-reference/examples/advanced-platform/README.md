---
example:
  level: advanced
  products: [core/datastore/mariadb, core/devtool/adminer]
  shows: [boundaries, parameters, features, credentials, catalog-authoring, external-sources]
---

# Advanced platform — a multi-boundary Kubernetes platform

A multi-boundary Kubernetes platform that combines several mechanisms in one build
from a single Developer-authored `Aggregate`: boundary-scope FeatureRecipes, parameter
hoisting, the credential subsystem, and cross-boundary references resolving
through Service DNS.

## What it demonstrates

- **Boundary-scope FeatureRecipe** — a shared-config ConfigMap rendered **once
  per boundary** (`executionScope: boundary`), not once per component.
- **Parameter hoisting** — a typed Aggregate `parameter` (the Adminer UI theme)
  the Release fulfils per environment, flowing into a standard developer value.
- **The credential subsystem** — a black-box secret slot and a transparent one
  (`core/secret-value`, `core/secret-provided`) delivering passwords into the
  database via the inject pipe.
- **Cross-boundary String Pipe** — the `app` boundary's Adminer reaches the
  `data` boundary's database by the host the database Recipe provides, routed
  across the boundary seam without the compiler interpreting the string.

## Consumes the standard library

This example consumes the standard catalog: `core/datastore/mariadb`,
`core/devtool/adminer`, `core/secret-value`, `core/secret-provided`, and
`core/shared-config` (with their helm FeatureRecipes `env-secret`,
`provided-secret`, and `shared-config`), the `adminer` recipe, and the `helm`
provider all ship in the standard library. The `mariadb-bitnami` Recipe is
carried locally by this example — an enterprise-authored sourced Recipe under its
own `catalog/` directory.

This example's own teaching scaffolding lives in the shared catalog under the
`example/` publisher, alongside the standard library:

- `example/db-binding` — a Feature (and its FeatureRecipe) that carries the
  `databases` use-edge wiring Adminer to the database, specific to this stack's
  binding lesson.

It builds against the catalog directory listed under `catalog_dirs` in
`.aggrega-config.yaml`, the example's own local `catalog/`, which carries the
`mariadb-bitnami` sourced Recipe. The Component, features, and remaining recipes
resolve from `hub.aggrega.ai`, the default registry the same file declares, so
neither command needs a `--catalog` flag. The pull fetches the
Bitnami chart the sourced Recipe names and pins it, with every entity, in
`release.lock`; the build reads that lockfile:

```bash
aggrega pull --release release.yaml
aggrega build --release release.yaml
```
