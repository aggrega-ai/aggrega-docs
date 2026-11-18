# Runnable Examples

To start, [Getting started](../../getting-started.md) installs Aggrega and walks two of these examples step by step.

Complete, forkable workspaces you can compile with the `aggrega` CLI. Each is a
self-contained directory — a Developer-authored `Aggregate` and one or more
`Release`/`Manifest` pairs — that builds with no setup beyond what its page names.
To find one by the product it deploys or by what it shows, use
[Examples by product and capability](by-product-and-capability.md), which lists
every example here.

The examples come in two modes — the two ends of one curriculum:

- **Consumption** — the workspace *references* standard-library catalog entities
  and authors only its own teaching-specific content locally. It builds with no
  `--catalog` flag:
  ```bash
  aggrega build --release release.yaml
  ```
  Where those referenced entities are read from depends on the workspace. A
  `catalog/` directory at the workspace root is read whether or not anything names
  it, so a workspace that authors teaching content of its own can simply keep it
  there. A workspace that carries an `.aggrega-config.yaml` also reads every
  directory listed under `catalog_dirs`, each one a directory it keeps entities
  in. The listed directories are searched first and `catalog/` last, and the
  stack is first-win, so an entity in an earlier-searched directory shadows one
  of the same identity in a later one. What no local directory declares — the
  standard-library entities — resolves from the registry the configuration
  names as `default_registry`, `hub.aggrega.ai`. A workspace that authors
  nothing locally needs no local entry, and one that carries neither a
  `catalog/` directory nor an `.aggrega-config.yaml` resolves entirely through
  the configured registry. Writing `catalog_dirs` as an empty list says the
  workspace has no local catalog at all. Every path in `catalog_dirs` names a
  directory inside the workspace, so a copy of the whole workspace taken
  somewhere else builds as it is.

  A multi-target workspace that keeps a separate catalog per target names each
  target's directories under `workspace.releases`, keyed by its Release file, so
  every Release builds against its own catalog.
- **Authoring** — the workspace *builds* the catalog entities (Components,
  Features, Recipes) from scratch in local `catalog-*/` directories.
  `mariadb-adminer` is the worked authoring example; the entities it builds are
  the same kind the consumption examples consume.

Build one release per run with `aggrega build --release <release file>`; each
example's page gives its own commands. The workspace supplies its catalog as
described above; pass `--catalog` yourself for a catalog directory the workspace
does not name, as the pages that need it show.

Lockfiles are generated rather than shipped, so a fresh clone has none and the
first build needs one. `aggrega build` is read-only by default: with no lockfile
it halts and names the two ways forward. Pass `--auto-pull` for that first
build — `aggrega build --release release.yaml --auto-pull` — to resolve the
lockfile during the build; running `aggrega pull --release <release file>` once
beforehand does the same and lets every later build run with no flag.

In a checkout of the documentation repository, most workspaces also carry a
`build-release.sh` helper that the repository's own checks build through. It
runs `aggrega build` for one release, echoing the command first, and reports which
`aggrega` binary it used and where that binary came from; set `AGGREGA_BIN` to
choose the binary. A copy written by `aggrega draft --example` carries the
helper without the shared script it calls, so build such a copy with
`aggrega build` directly.

Where an example here names a checkout of the standard-library catalog,
[Import](../../authoring/import/README.md#how-an-import-runs) says where to get
one.

These complement the concept pages described in
[Examples Overview](../09-examples.md): a concept page explains one idea and links
the workspace that shows it; the workspaces here are whole stacks you can build,
read, and adapt.

Where a page prints what a build produced, that block is copied from a real run
so you can compare your own output against it — and any lines left out are
marked. [Reading the output on these pages](reading-the-output.md) states that
convention and the mark it uses.

Not every directory here is one workspace. The quickstart examples hold one
workspace per step, and the import examples one per stage of an import, as the
next paragraph describes. One directory holds no workspace at all:
[policy-in-ci](policy-in-ci/) holds two rule scripts that read a build's output
directory and refuse it when it breaks a rule, with the pipeline step for each.
They run over the outputs of the workspaces here, and over yours.

Each `import-*` example — listed under the `import` capability in
[Examples by product and capability](by-product-and-capability.md) — keeps a
project written in another format as `aggrega import` meets it, in two folders:
`source/`, the project, the `.aggrega-config.yaml` that makes it a workspace and
the [answers file](../import-answers.md) the import reads the values no source
can hold from; and `draft/`, the files the import wrote, unchanged, a workspace
that builds as written, with what it printed on standard output (`stdout.txt`)
and standard error (`import.txt`). Its walkthrough under
[Import](../../authoring/import/README.md) teaches each stage. Its `check.sh` runs
the shared `scripts/check-import-example.sh` of this repository, which imports again,
compares what it writes and prints with `draft/` and the walkthrough's quoted blocks
with the example's files, then validates and builds the drafted Release.

## The teaching order

Every example here has one place in a single teaching order, given by the `tier`
and `position` in its header: tier by tier, in the order
[the tier list](#the-header-on-each-example) gives, and simplest first within each
tier. [In teaching order](by-product-and-capability.md#in-teaching-order) lists
every example that way, and the Examples section of the sidebar follows the same
order. Read the tiers top to bottom, or jump to the one that matches what you are
doing; to find an example by what it deploys or what it shows instead, the same
page lists them by product and by capability.

*A build can also run plugins over what it renders — see [When to reach for a pipeline step](../plugins/when-to-use-a-pipeline-step.md).*

## The header on each example

Each example's README opens with a short header, written as YAML front matter,
saying what the example is: its level, its place in the teaching order, the
products it deploys and what it shows.
[Examples by product and capability](by-product-and-capability.md) is
generated from these headers.

```yaml
---
example:
  level: start
  tier: catalog-only
  position: 1
  products: [core/datastore/mariadb, core/devtool/adminer]
  shows: [connections, credentials]
---
```

`level` is one of these levels:

<!-- example-header: level -->
- `start` — the Catalog-only level: assembled from catalog entities, with
  nothing authored but the Aggregate, the Manifest and the Release.
- `authoring` — the Authoring level: authors a Component, a Feature or a Recipe,
  or shows how one is shaped.
- `advanced` — the Advanced level: boundaries, governance policy,
  annotation-driven Features and assembled cloud stacks.

`tier` is the part of the teaching order the example belongs to, one of these,
taught in this order:

<!-- example-header: tier -->
- `start-here` — Start here: the two examples Getting started grows one step at
  a time, then the two starters for the cloud.
- `catalog-only` — Catalog only: assembled from catalog entities, with nothing
  authored but the Aggregate, the Manifest and the Release.
- `authoring` — Authoring: writes a Component, a Feature or a Recipe of its own,
  or shows how one is shaped.
- `advanced` — Advanced: boundaries, governance policy, annotation-driven
  Features and assembled cloud stacks, several combined in one build.
- `importers` — Importers: a project written in another format, drafted into
  Aggrega files by `aggrega import`, then reviewed and built.

`position` is the example's place within its tier, a positive whole number no
other example of that tier takes; a tier lists its examples from the lowest
position up, simplest first.

`products` lists each catalog Component the example deploys, by the name its
catalog entry carries. A generic compute component (`core/compute/server`, say)
and an entity the example declares for itself are not listed, so an example can
list none.

`shows` lists what the example demonstrates, each entry taken from this list:

<!-- example-header: shows -->
- `multi-target` — one Aggregate built for two or more targets, or realized two
  or more ways.
- `recipe-selection` — the Manifest choosing which Recipe realizes a component,
  or which FeatureRecipe realizes an attachment: per type, per instance or per
  target.
- `modules` — a catalog Aggregate imported as a module.
- `connections` — components wired through `uses` sockets, with values piped
  across each edge.
- `credentials` — credential attachments and how each target delivers them.
- `parameters` — values hoisted to parameters that a Release fulfils.
- `features` — Features attached for something other than a credential, such as
  routing, monitoring, a budget, a cache or masking.
- `boundaries` — components or modules placed in boundaries, and what crosses
  between them.
- `policy` — governance policy that accepts or refuses a build, during the build
  or over its output.
- `guardrails` — a Release that is meant to halt, and the message it halts with.
- `catalog-authoring` — a Component, Feature or Recipe written for the example,
  kept beside it or published to the catalog.
- `cloud-infrastructure` — Terraform, CloudFormation or ARM output for managed
  cloud services.
- `external-sources` — a Recipe that fetches what it renders: an upstream chart,
  a git repository or a module.
- `import` — a project written in another format, drafted into Aggrega files by
  `aggrega import`, then reviewed and built.

An example lists at least one product or one capability, so the index can place
it. Its README also carries a `## Draft the example` section, holding
`aggrega draft --example <name>` in its first command block and `cd <name>`
in its second, directly followed by a `## Build` section whose first command
block is what `aggrega draft --example` prints to run next after that `cd`.
`scripts/gen-examples-index.sh --check`, run
from the root of this repository, checks every header against these lists,
refuses an example missing either section, and one with neither an executable
`check.sh` nor a `build-release.sh`, and confirms the index is current; run it
without `--check` to write the index again.
