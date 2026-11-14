---
example:
  level: advanced
  tier: advanced
  position: 1
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

## Scaffold the example

You can build this example with the commands below, or [have your AI assistant build it for you](#with-an-ai-assistant).

Write the example into a new folder named after it:

```sh
aggrega scaffold --example advanced-platform
```

It then prints the commands to run next. The first changes into the new folder:

```sh
cd advanced-platform
```

## Build

The pull resolves the lockfile, fetching the Bitnami chart the local Recipe
names, and the build reads it:

```sh
aggrega pull --release release.yaml
aggrega build --release release.yaml
```

## With an AI assistant

An AI assistant [set up with Aggrega's tools](../../../ai-assistants/set-up.md)
can do the same: paste this prompt into it.

<!-- copyable -->

> Write the Aggrega documentation's runnable example `advanced-platform` into a new folder with the `scaffold` tool. That folder is a workspace: name it as the workspace root on each call that follows. Build its Release `release.yaml` with the `build` tool, resolving its dependencies first and writing the files into `dist/`, then tell me which files the build wrote.
