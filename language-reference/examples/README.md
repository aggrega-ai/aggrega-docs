# Runnable Examples

Complete, forkable workspaces you can compile with the `aggrega` CLI. Each is a
self-contained directory — a Developer-authored `Aggregate` and one or more
`Release`/`Manifest` pairs — that builds offline with no external setup.

The examples come in two modes — the two ends of one curriculum:

- **Consumption** — the workspace *references* standard-library catalog entities
  and authors only its own teaching-specific content locally. It lists both its
  local `./catalog` and the standard catalog checkout under `catalog_dirs` in
  `.aggrega-config.yaml` (the search stack resolves local entities first), so it
  builds with no `--catalog` flag:
  ```bash
  aggrega build --release release.yaml
  ```
  A multi-target workspace that keeps a separate catalog per target passes the
  directories as a repeatable `--catalog` instead
  (`--catalog ./catalog-<target> --catalog <standard-catalog>`).
- **Authoring** — the workspace *builds* the catalog entities (Components,
  Features, Recipes) from scratch in local `catalog-*/` directories.
  `mariadb-adminer` is the worked authoring example; the entities it builds are
  the same kind the consumption examples consume.

Each workspace carries a `build-release.sh` helper that picks the right catalog
source and builds one release per run, echoing the equivalent direct `aggrega
build` command first. Run `./build-release.sh` in a single-release example, or
name the release for a multi-release one (`./build-release.sh helm`).

Lockfiles are generated rather than shipped, so a fresh clone has none and the
first build needs one. `aggrega build` is read-only by default: with no lockfile
it halts and names the two ways forward. Pass `--auto-pull` through the helper
for that first build — `./build-release.sh -- --auto-pull`, or
`./build-release.sh helm -- --auto-pull` when naming a release — to resolve the
lockfile during the build; running `aggrega pull --release <release>.yaml` once
beforehand does the same and lets every later build run with no flag.

These complement the numbered walkthrough chapters in
[Examples Overview](../09-examples.md): the chapters teach one pattern at a time
inline; the workspaces here are whole stacks you can build, read, and adapt.

Where a page prints what a build produced, that block is copied from a real run
so you can compare your own output against it — and any lines left out are
marked. [Reading the output on these pages](reading-the-output.md) states that
convention and the mark it uses.

The set is organised as a **progressive-complexity path** — from the smallest
authoring surface to the advanced compiler frontier. Read it top-to-bottom as a
learning path, or jump to the tier that matches what you're doing.

## Catalog-only

The smallest surface: an Aggregate + Release that reference existing catalog
entities, authoring no Components, Features, or Recipes of their own — the
developer surface and the String Pipe with zero platform authoring.

- **[catalog-only](catalog-only/)** — a MariaDB database with an Adminer web
  UI, assembled entirely from standard-library entities and compiled to
  Docker Compose. Three short YAML files teach the developer surface: catalog
  references by `type:`, schema defaults, the attachment pillar, the String Pipe
  through a `uses` socket, Release `infra:` fulfillment, and provider-qualified
  Recipe routing in the Manifest. Builds against the standard-library catalog
  it references; the same stack reappears in the Authoring tier below, built
  from scratch.
- **[adhoc-uses-socket](adhoc-uses-socket/)** — a console wired to its database
  through the socket its Component declares, and to a model endpoint through a
  socket no catalog entity declares. Both edges deliver into the same container
  environment through the same path, and the rendered output does not record
  which socket was declared. The control release shows the other half of the
  line: an `inject` key the target does not declare in its `provides` halts the
  build, ad-hoc socket or not.

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
- **[credential-shape-per-target](credential-shape-per-target/)** — one Aggregate
  deployed to two targets whose only difference is which FeatureRecipe the
  Manifest binds for `core/referenced-secret`: one renders a Kubernetes Secret
  carrying the material, the other an `ExternalSecret` naming an entry in a
  secret store. The two output trees differ in exactly that one resource per
  credential slot, and the consuming StatefulSet's `secretKeyRef` is
  byte-identical between them — the locator is published by the producing side
  rather than agreed between both, so the developer's side never changes.
- **[postgres-three-realizations](postgres-three-realizations/)** — one
  PostgreSQL Component with one `provides` contract, realized three ways: a
  StatefulSet the deployment runs itself, a managed RDS instance emitted as
  Terraform, and a server that already existed, referenced by a Recipe that
  provisions nothing. One Aggregate, three Manifests differing in a single line.
  The consuming application's rendered environment carries the same variables in
  the same order in all three — only the strings behind `DB_HOST` and `DB_PORT`
  move — and on the managed target those two are Terraform expressions the
  compiler pipes through without resolving, because what they name does not
  exist yet.
- **[extends-wrapper](extends-wrapper/)** — publishing a specialized variant of a
  standard-library Component with `extends`. The wrapper adds labels, annotations
  and one socket, authors no data pillars, and inherits its base's contract whole,
  so the base's Recipe already implements it: one catalog entity and one Manifest
  line, with no Recipe of its own and no change to the base.

## Advanced

The compiler frontier: boundary-scope FeatureRecipes, parameter hoisting,
annotation-driven Feature expansion, governance policy over the build graph, and
cross-boundary networking across providers.

- **[advanced-platform](advanced-platform/)** — a multi-boundary Kubernetes
  platform. Boundary-scope FeatureRecipes (a shared-config ConfigMap rendered
  once per boundary), parameter hoisting (a typed value fulfilled per
  environment), the credential subsystem, and cross-boundary references resolving
  through Service DNS. Consumes the standard catalog; keeps only `app/adminer` and
  the `app/db-binding` wiring local.
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
  `features.annotations` binding) into a `core/prometheus-exporter` attachment on
  every contained component — each rendering a Prometheus ServiceMonitor with its
  cascade-resolved profile, with no per-component `features:` blocks. Shows
  structured-annotation per-subkey deep merge.
- **[policy-authored-leaf-sensitivity](policy-authored-leaf-sensitivity/)** — an
  operator-authored Rego policy attached over the build graph, refusing one
  release and permitting its control. The same managed database and the same
  required credential slot, filled two ways: by the Feature whose material the
  deployment supplies, and by the Feature the target engine provisions for
  itself. The policy reads the per-authored-leaf sensitivity marking, so it names
  the one leaf the attachment authored that its Feature declares sensitive and
  leaves the delivery key beside it alone. Attaching the control policy — the
  same walk keyed on the whole-attachment answer — refuses both releases
  instead, which is what shows why the narrower fact exists.

*Planned — `pipeline:` execution and the `eval` provider join this tier as
those capabilities ship.*
