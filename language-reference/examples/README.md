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

- **[mariadb-adminer](mariadb-adminer/)** — a single application stack (a MariaDB
  database with an Adminer web UI) compiled from one Aggregate to four targets:
  Docker Compose, self-contained Kubernetes, the upstream Bitnami Helm chart, and
  a composed umbrella Helm chart. Shows the String Pipe, Workload synthesis vs.
  sourced charts, the credential subsystem, and remote chart sourcing.

- **[cross-boundary-networking](cross-boundary-networking/)** — one developer
  intent (an Adminer UI reaching a PostgreSQL database across a boundary seam)
  deployed **two ways**. The Docker Compose variant uses the standard-library
  `core/compose-bridge` FeatureRecipe to generate an `aggrega-gw` gateway that
  crosses the network seam; the Kubernetes (Helm) variant places each boundary in
  its own namespace via the same `aggrega.ai/namespace` annotation and the
  reference crosses by native cross-namespace DNS — no bridge. Teaches that the
  compose-bridge is what Kubernetes namespaces + DNS give you natively.

- **[advanced-platform](advanced-platform/)** — a multi-boundary Kubernetes
  platform showing cross-boundary references resolving **without** a gateway:
  the String Pipe routes a database's Service DNS name across boundaries, because
  Kubernetes needs no bridge where Compose does.

- **[per-instance-recipe-override](per-instance-recipe-override/)** — the
  Manifest `name` mapping tier, which overrides the Recipe for a single component
  *instance* while every other instance of the same type keeps the bulk
  `type`-tier Recipe.
