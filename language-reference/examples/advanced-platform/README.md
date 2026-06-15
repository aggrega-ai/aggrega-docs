# Advanced platform — a multi-boundary Kubernetes platform

A multi-boundary Kubernetes platform that exercises the compiler frontier from a
single Developer-authored `Aggregate`: boundary-scope FeatureRecipes, parameter
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
`core/secret-value`, `core/secret-provided`, and `core/shared-config` (with their
helm FeatureRecipes `env-secret-helm`, `provided-secret-helm`, and
`shared-config-helm`), the `mariadb-bitnami` recipe, and the `helm` provider all
ship in the standard library.

Only this example's own teaching scaffolding is local, under `./catalog`:

- `app/adminer` — a demo database-UI component (with its helm recipe), app-scoped
  to this example rather than a general-purpose catalog entity;
- `app/db-binding` — a Feature (and its FeatureRecipe) that carries the
  `databases` use-edge wiring Adminer to the database, specific to this stack's
  binding lesson.

It builds offline against both its local `./catalog` and the standard catalog
checkout, listed under `catalog_dirs` in `.aggrega-config.yaml` — so the build
command needs no `--catalog` flag:

```bash
aggrega build --release release.yaml
```
