# Runnable Examples

Complete, forkable workspaces you can compile with the `aggrega` CLI. Each is a
self-contained directory — a Developer-authored `Aggregate`, one or more
`Release`/`Manifest` pairs, and a local `catalog/` of Recipes — that builds
offline with no external setup:

```bash
aggrega build --release <release>.yaml --catalog <catalog-dir>
```

These complement the numbered walkthrough chapters in
[Examples Overview](../09-examples.md): the chapters teach one pattern at a time
inline; the workspaces here are whole stacks you can build, read, and adapt.

The set is organised as a **progressive-complexity path** — from the smallest
authoring surface to the advanced compiler frontier. Read it top-to-bottom as a
learning path, or jump to the tier that matches what you're doing.

## Catalog-only

The smallest surface: an Aggregate + Release that reference existing catalog
entities, authoring no Components, Features, or Recipes of their own — the
developer surface and the String Pipe with zero platform authoring.

*Planned — a catalog-only example ships alongside the standard-library catalog
it references.*

## Authoring

Authoring your own catalog: the four-domain split in practice — Components,
Features, Recipes, Manifests, and the provider matrix.

- **[mariadb-adminer](mariadb-adminer/)** — a single application stack (a MariaDB
  database with an Adminer web UI) compiled from one Aggregate to four targets:
  Docker Compose, self-contained Kubernetes, the upstream Bitnami Helm chart, and
  a composed umbrella Helm chart. Shows the String Pipe, Workload synthesis vs.
  sourced charts, the credential subsystem, materialized schema defaults, and
  remote chart sourcing.
- **[per-instance-recipe-override](per-instance-recipe-override/)** — the
  Manifest `name` mapping tier, which overrides the Recipe for a single component
  *instance* while every other instance of the same type keeps the bulk
  `type`-tier Recipe.

## Advanced

The compiler frontier: boundary-scope FeatureRecipes, parameter hoisting,
annotation-driven Feature expansion, and cross-boundary networking across
providers.

- **[advanced-platform](advanced-platform/)** — a multi-boundary Kubernetes
  platform. Boundary-scope FeatureRecipes (a shared-config ConfigMap rendered
  once per boundary), parameter hoisting (a value and a chart-source identity
  fulfilled per environment), `.values`-in-source, the credential subsystem, and
  cross-boundary references resolving through Service DNS.
- **[cross-boundary-networking](cross-boundary-networking/)** — one developer
  intent (an Adminer UI reaching a database across a boundary seam) deployed
  **two ways**: the Docker Compose variant uses the standard-library
  `core/compose-bridge` FeatureRecipe to generate a gateway across the network
  seam; the Kubernetes (Helm) variant places each boundary in its own namespace
  via the `aggrega.ai/namespace` annotation and crosses by native cross-namespace
  DNS — no bridge. Teaches that the compose-bridge is what Kubernetes namespaces +
  DNS give you natively.
- **[annotation-driven-monitoring](annotation-driven-monitoring/)** —
  annotation-driven Feature expansion: one monitoring annotation on a boundary,
  refined by per-subtree overrides, expands (via the Manifest's
  `features.annotations` binding) into a `core/scrape-target` attachment on every
  contained component — each rendering a Prometheus ServiceMonitor with its
  cascade-resolved profile, with no per-component `features:` blocks. Shows
  structured-annotation per-subkey deep merge.

*Planned — Wasm policy/mutator plugins, `pipeline:` execution, and the
`terraform` / `eval` providers join this tier as those capabilities ship.*
