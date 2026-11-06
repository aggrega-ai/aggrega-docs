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
choose the binary. A copy written by `aggrega scaffold --example` carries the
helper without the shared script it calls, so build such a copy with
`aggrega build` directly.

Where an example here names a checkout of the standard-library catalog,
[Import](../../authoring/import/README.md#how-an-import-runs) says where to get
one.

These complement the numbered walkthrough chapters in
[Examples Overview](../09-examples.md): the chapters teach one pattern at a time
inline; the workspaces here are whole stacks you can build, read, and adapt.

Where a page prints what a build produced, that block is copied from a real run
so you can compare your own output against it — and any lines left out are
marked. [Reading the output on these pages](reading-the-output.md) states that
convention and the mark it uses.

Not every directory here is one workspace. The quickstart examples hold one
workspace per step, and the import examples one per stage of an import, as the
next paragraph describes. One directory holds no workspace at all:
[policy-in-ci](policy-in-ci/) holds two rule scripts that read a build's output
directory and refuse it when it breaks a rule, with the pipeline step for each.
They run over the outputs of the workspaces below, and over yours.

Each `import-*` example — listed under the `import` capability in
[Examples by product and capability](by-product-and-capability.md) — keeps a
project written in another format as `aggrega import` meets it, in three folders:
`source/`, the project and the `.aggrega-config.yaml` that makes it a workspace;
`draft/`, the files the import wrote, unchanged, with what it printed on standard
output (`stdout.txt`) and standard error (`import.txt`); and `reviewed/`, the same
files after review, a workspace that builds. Its walkthrough under
[Import](../../authoring/import/README.md) teaches each stage. Its `check.sh` runs
the shared `scripts/check-import-example.sh` of this repository, which runs the
import again and compares what it writes and prints with `draft/`, compares the
blocks the walkthrough quotes with the example's files, and builds `reviewed/`.

What follows is a **curated list of examples in increasing complexity** —
from the smallest authoring surface to builds combining several mechanisms — and
not a complete list of what is here: the `examples/` directory holding this
page carries more workspaces than the list names. An example joins the list
only when it teaches something the ones already on it do not, so this stays a
path to work through rather than an inventory to scan. Read it top-to-bottom,
or jump to the tier that matches what you're doing.

## Catalog-only

The smallest surface: an Aggregate, a Manifest and a Release that reference
existing catalog entities, authoring no Components, Features, or Recipes of
their own — the developer surface and the String Pipe with zero platform
authoring.

- **[catalog-only](catalog-only/)** — a MariaDB database with an Adminer web
  UI, assembled entirely from standard-library entities and compiled to
  Docker Compose. Three short YAML files teach the developer surface: catalog
  references by `type:`, schema defaults, the attachment pillar, the String Pipe
  through a `uses` socket, Release `infra:` fulfillment, and provider-qualified
  Recipe routing in the Manifest. Builds against the standard-library catalog
  it references; the same stack reappears in the Authoring tier below, built
  from scratch.
- **[quickstart-web](quickstart-web/)** — a web application with PostgreSQL,
  grown one step at a time, each step a workspace of its own: the application
  and its database on Docker Compose, then a Redis cache, then the same
  components on AWS through Terraform — an ECS service, an RDS instance and an
  ElastiCache cache — and finally the database's backups, from one `core/backup`
  attachment in the Release. The two Compose steps run on your machine with
  `docker compose up`, the password read from your shell rather than from any
  file. A script beside it builds every step and checks each outcome.
- **[quickstart-ai](quickstart-ai/)** — a LangGraph agent grown one step at a
  time, each step a workspace of its own: the agent on a local Ollama model with
  its conversations kept in Valkey, then a LiteLLM gateway adding a hosted
  OpenAI model with the local one as its fallback, then guardrails on the
  gateway — personal data masked in its logs by Presidio and prompt injection
  refused by pattern — and finally the same components built for Kubernetes,
  the OpenAI key read from a Secret there. The three Compose steps run on your
  machine with `docker compose up` and need no API key. A script beside it
  builds every step and checks each outcome.
- **[adhoc-uses-socket](adhoc-uses-socket/)** — a console wired to its database
  through the socket its Component declares, and to a model endpoint through a
  socket no catalog entity declares. Both edges deliver into the same container
  environment through the same path, and the rendered output does not record
  which socket was declared. The control release shows the other half of the
  line: an `inject` key the target does not declare in its `provides` halts the
  build, ad-hoc socket or not.
- **[ai-agent-and-model-router](ai-agent-and-model-router/)** — an agent
  application reaching two upstream provider models through one in-cluster
  router, compiled to Kubernetes. The router's alias map reaches the rendered
  configuration, so the routing table is readable in the artifact rather than
  implied by it, and two entries publishing the same alias are what give the
  router a choice to make, which a `core/target-selection` attachment makes by
  latency. Six attachments over four Feature kinds, each visible in the output:
  that choice, written into the router's configuration; an Ingress and a
  ServiceMonitor the component's own Recipe knows nothing about; and three
  credentials — the key the router requires of callers, the key it presents
  upstream on their behalf, and the key the agent presents to it, the first and
  last read from one hoisted parameter so they cannot drift apart. Also shows
  where the compiler does not interpret: the address and the alias the agent receives are
  read off what the router publishes, and the compiler pipes both without
  reading them.
- **[connection-credentials](connection-credentials/)** — a semantic-memory
  store reaching two models and presenting a different key to each, compiled to
  Kubernetes: a hosted model whose key is fetched from a cluster secret store,
  and an embedding server that checks a key of its own. Each key sits on the
  connection it is presented on, so the server's key and the key its caller
  presents are two attachments, kept one key by reading one parameter. The
  README shows the server's rendered output unchanged by what its callers carry,
  a Release wiring a connection and naming its key in `infra`, one connection's
  key bound by name in the Manifest to a realization of its own, and the
  conventions check of a Release advising where the two ends read different
  parameters.
- **[ai-gateway-log-masking](ai-gateway-log-masking/)** — an AI gateway that
  keeps personal data out of its logs through a value of its own, compiled to
  Kubernetes. The masking applies only to the copy of each call the gateway hands
  to its logs: the model receives the request as the caller sent it, and the
  caller receives the reply as the model wrote it — the difference from data
  masking, which hides the text from the model itself. The README shows the
  build refusing when both are set on one gateway.
- **[ai-gateway-prompt-injection-shield](ai-gateway-prompt-injection-shield/)** —
  an AI gateway that sends every request through a guard, which asks a trained
  classifier whether the request tries to override the model's instructions and
  refuses it if so, compiled to Kubernetes as the gateway, the guard and the
  classifier's service. The catalog names an image for neither the guard nor the
  classifier, so the Release supplies both. The README spends as long on what the
  shield does not do as on what it does.
- **[ai-gateway-semantic-cache](ai-gateway-semantic-cache/)** — an AI gateway
  that answers a question from the reply it gave an earlier, similarly worded
  one, keeping the replies in a Redis wired to it, compiled to Kubernetes. The
  store's address reaches the gateway through its environment, read off the
  edge, and the cache's configuration names only the variables. The README is
  mostly about who is served from one stored reply: one end user under the
  default scope, every holder of the key under the other — and why the end user
  a request names is not proof of who sent it.
- **[apisix-token-budget](apisix-token-budget/)** — Apache APISIX in front of two
  OpenAI models, wired to its `models` socket, with a token budget on everything
  the gateway serves, compiled to Kubernetes through the project's own chart. The
  gateway reads its routes from a file rendered with it, so it takes no etcd and
  no Admin API key. The README shows the budget written into the routes file and
  what a semantic cache needs before it builds: callers the gateway tells apart
  by the key each presents, and a store.
- **[envoy-ai-gateway-token-budget](envoy-ai-gateway-token-budget/)** — Envoy
  Gateway in front of OpenAI's managed model through Envoy AI Gateway, with a
  token budget per calendar month on everything it serves and an agent reaching
  the model through the gateway, compiled to Kubernetes with the AI gateway's
  controller and the cert-manager its webhook certificate needs. The budget is
  Envoy Gateway's own rate limit on the model route, counted in a Redis wired to
  the gateway. The README shows the token cost and the traffic policy as
  rendered, the calendar-month setting the budget turns on for the whole
  install, and the build refusing a budget in US dollars.
- **[model-server-caller-allowlist](model-server-caller-allowlist/)** — a model
  server that only the gateway in front of it may call, compiled to Kubernetes.
  The Aggregate declares only the gateway's connection to the model server; the
  operator attaches `core/caller-allowlist` to the model server in the Release,
  and the network policy it writes admits the components whose `uses` edges
  point there, the model server's own pods and one monitoring agent the Release
  names, each matched by its namespace and its pods together. The README shows
  what can and cannot reach the model server, why the policy keeps matching
  pods across an upgrade, and the halts that stop a policy which could not
  admit exactly what was declared.
- **[task-run-on-demand](task-run-on-demand/)** — two tasks that run to
  completion, built for Kubernetes, Docker Compose, Terraform and
  CloudFormation: one carrying `core/manual-trigger`, deployed without starting
  on every target, and one carrying nothing, started by its schedule or by the
  stack starting. The README shows what the attachment changes in each target's
  output — a suspended CronJob, a service behind a Compose profile, an Amazon ECS
  task definition with no schedule — and the target's own command that starts a
  run. The second task's schedule is a parameter, because the targets disagree
  about a task with neither: two Releases halt where a target cannot realize
  what they ask.
- **[datastore-backup](datastore-backup/)** — a PostgreSQL database backed up
  on every target from one `core/backup` attachment the operator writes in the
  Release, with nothing written for it in the Aggregate. Each Manifest binds the
  product that realizes it: Velero and CloudNativePG's Barman Cloud plugin on
  Kubernetes, writing to a bucket the attachment connects to; Amazon RDS's own
  automated backups on Terraform and CloudFormation; and AWS Backup, chosen on
  the same target by one Manifest line. The README shows each target's backup
  as rendered, the backup controllers switched on per Release by a parameter,
  and the halt on Docker Compose, which has no backup product.

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
  StatefulSet run in the cluster itself, a managed RDS instance emitted as
  Terraform, and a server that already existed, referenced by a Recipe that
  provisions nothing. One Aggregate, three Manifests differing in a single line.
  The consuming application's rendered environment carries the same variables in
  the same order in all three — only the string behind `DB_HOST` moves — and on
  the managed target it is a Terraform expression the compiler pipes through
  without resolving, because what it names does not exist yet.
- **[mcp-address-from-secret](mcp-address-from-secret/)** — an agent reaching a
  Model Context Protocol server someone else runs, which reads its key from its
  own address rather than from a request header, compiled to Kubernetes and to
  Docker Compose. The tool holds the address without the part that carries the
  key, and the agent's connection to the tool holds the whole address as a
  secret: a `secretKeyRef` to a Secret the namespace already holds on
  Kubernetes, a Compose variable reference on Docker Compose, so no rendered
  file carries the key. The agent is declared in the workspace's own catalog,
  with the slot on its tool socket and a Recipe per target reading it. The
  README shows the limits: two secrets the Release alone attaches to one agent
  collide on Docker Compose, and the host is written twice with nothing checking
  that the two agree. Needs the standard-library catalog checked out beside it.
- **[chart-from-git-repository](chart-from-git-repository/)** — a Helm chart that
  lives in a git repository rather than a chart registry, sourced by a Recipe
  whose source names three coordinates: the repository, the reference to read it
  at, and the directory inside it that is the chart. Because only a commit names
  content that cannot be repointed, the lockfile records the authored reference
  *and* the commit it resolved to — so a tag stays readable in the Recipe while
  the build stays reproducible, and a reference that later points somewhere else
  halts rather than being adopted. A second release is expected to fail: it names
  a reference the repository does not carry.
- **[extends-wrapper](extends-wrapper/)** — publishing a specialized variant of a
  standard-library Component with `extends`. The wrapper adds labels, annotations
  and one socket, authors no data pillars, and inherits its base's contract whole,
  so the base's Recipe already implements it: one catalog entity and one Manifest
  line, with no Recipe of its own and no change to the base.

## Advanced

Several mechanisms combined in one build: boundary-scope FeatureRecipes, parameter hoisting,
annotation-driven Feature expansion, governance policy over the build graph, and
cross-boundary networking across providers.

- **[advanced-platform](advanced-platform/)** — a multi-boundary Kubernetes
  platform. Boundary-scope FeatureRecipes (a shared-config ConfigMap rendered
  once per boundary), parameter hoisting (a typed value fulfilled per
  environment), the credential subsystem, and cross-boundary references resolving
  through Service DNS. Consumes the standard catalog; keeps only its sourced
  `mariadb-bitnami` Recipe local.
- **[cloudformation-rds-stack](cloudformation-rds-stack/)** — a managed database
  and the application that reads it, assembled into AWS CloudFormation stack
  templates, with **two attachments that bring resources of their own**: a
  component-scope alarm on the database and a boundary-wide shared-settings
  parameter. Shows where an attachment's resources land in an assembled stack and
  how the two halves are named on different rules — a resource logical ID comes
  from the attachment's own Recipe, while an output is named for the host
  component. The same intent builds as one stack and as two, so the application's
  reference to the database is a reference inside one template in the first case
  and an export read back by name in the second. A third release halts: it
  attaches the alarm twice to one component, and the build names both colliding
  ends and which of the stack's two name spaces they reached.
- **[aws-rds-and-ecs-service](aws-rds-and-ecs-service/)** — one Aggregate, a
  PostgreSQL database and the server that reads it, built three ways against
  AWS: one Terraform root configuration, with the database provisioned by the
  terraform-aws-modules project's published RDS module and the server run as an
  Amazon ECS service on Fargate; one CloudFormation stack; and two. The server
  receives the database's address in each target's own form — a module output
  reference, an `Fn::GetAtt`, an `Fn::ImportValue` of an export — and the
  Aggregate is the same file for all three. RDS keeps the administrator password in
  AWS Secrets Manager, so no build writes one. Needs the standard-library
  catalog checked out beside it.
- **[cross-boundary-networking](cross-boundary-networking/)** — one developer
  intent (an Adminer UI reaching a database across a boundary seam) deployed
  **two ways**: the Docker Compose variant uses the standard-library
  `core/compose-bridge` Feature to generate a gateway across the network
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
- **[policy-payload-leaf-sensitivity](policy-payload-leaf-sensitivity/)** — an
  operator-authored Rego policy attached over the build graph, refusing one
  release and permitting its control. The same managed database and the same
  required credential slot, filled two ways: by the Feature whose material an
  author supplies, and by the Feature the target engine provisions for
  itself. The policy reads the per-leaf sensitivity marking, so it names the one
  leaf the attachment's payload carries that its Feature declares sensitive and
  leaves the delivery key beside it alone. Attaching the control policy — the
  same walk keyed on the whole-attachment answer — refuses both releases
  instead, which is what shows why the narrower fact exists.
- **[policy-data-class-route](policy-data-class-route/)** — a policy over the
  build graph that halts a build when data of one class reaches a component of
  another along a route with no declassifying Feature on it. A claims assistant
  holding restricted data reaches OpenAI's managed API through one of two AI
  gateways, one with data masking attached; three Releases differ only in that
  routing, and the two that keep the masking off the assistant's route are
  refused before anything is rendered, the refusal naming both ends of the
  route. The classes and their ranking are the policy's settings, and the
  compiler reads no meaning into them. The rule is written once each for the
  Rego and CEL engines in the CLI and for OPA, a deliberate near-duplicate, and a
  script beside it builds all nine combinations and checks every outcome. Needs
  the standard-library catalog checked out beside it.
- **[policy-label-transform](policy-label-transform/)** — governance plugins
  that shape labels rather than judge them. A Rego policy writes a support tier
  that depends on the Release's environment, the two tagging plugins compiled
  into the CLI add an owner, a backup schedule and a tag, and a policy over the
  build graph halts a production build that leaves a node without a support
  tier. Two Releases differ in their environment, and their nodes end with
  different labels; the rendered output is the same with and without the
  attachments. Shows what a label-shaping policy reads, what each built-in
  writes, and why the lockfile pins a transform and not a verdict. A script
  beside it checks every outcome. Needs the standard-library catalog checked out
  beside it.
- **[policy-org-overlay](policy-org-overlay/)** — policy from three owners added
  up on one build: a team's attachment in the workspace's own file, an
  organization's added from a global configuration file through
  `plugins.governance_append`, and a pipeline's added through
  `.aggrega-config-append-ci.yaml`, an overlay that only adds and names in a
  warning the single-value key it ignores. The rules report at `info` and `warn`, which
  let the build complete, and at `halt`, which stops it, and one rule attached
  twice is a warning in one attachment and a halt in the other, through a
  `translation` block. A script beside it builds every combination of the three
  files and checks each outcome. Needs the standard-library catalog checked out
  beside it.
- **[policy-render-verdict](policy-render-verdict/)** — a policy over the files a
  build writes rather than its graph. One Aggregate, a PostgreSQL database and a
  report job that reads it, is built for Kubernetes, Docker Compose, Terraform
  and CloudFormation, and one house rule attached at `render-verdict` reads each
  target's own output: a container image with no tag or the tag `latest` in the
  Kubernetes objects and the Compose file, an unencrypted RDS instance in the
  Terraform file and the CloudFormation template. Each target has a Release that
  passes and one with a violation planted, which halts. Shows what the role's
  payload carries, why a Terraform resource is read through a list, and why the
  rule's Rego and CEL copies are written differently. A script beside it builds
  every combination on both engines and checks each outcome, a pass byte for
  byte against the build with no policy. Needs the standard-library catalog
  checked out beside it.
- **[policy-annotation-transform](policy-annotation-transform/)** — a policy
  that attaches Features the developer did not write, by adding annotations. A
  policy at `annotation-transform`, written for the Rego and the CEL engine,
  injects two annotations the Manifest binds into each component that does not
  already carry them: an object of three subkeys under a monitoring key, and a
  string under a role key. Each expands into a Feature attachment, a
  ServiceMonitor and an IAM-role ServiceAccount. A control Release writing the
  same annotations by hand renders the same files byte for byte. Shows what the
  role's payload carries, where an injection is recorded, why the lockfile pins
  the attachment, and the refusal naming the plugin when a string is injected
  where the binding routes three subkeys. A script beside it checks every
  outcome. Needs the standard-library catalog checked out beside it.
- **[ai-gateway-own-webhook-certificate](ai-gateway-own-webhook-certificate/)** —
  a Recipe's `omits:` field leaving out a document a fetched chart renders. The
  Envoy AI Gateway controller is built in both of its webhook-certificate modes
  through the standard-library Recipe; with a certificate the operator supplies,
  the project's chart also renders a Secret holding a key and a certificate
  generated afresh on every render, and the Recipe's entry leaves it out, so the
  build stays byte-identical from one run to the next. Two guardrail Releases
  show the halts around the field: a build checking determinism halting on the
  same chart without the entry, and an entry that matches nothing halting and
  naming itself. A script beside it builds all four Releases and checks every
  outcome. Needs the standard-library catalog checked out beside it.

*A build can also run plugins over what it renders — see [When to reach for a pipeline step](../plugins/when-to-use-a-pipeline-step.md).*

## The header on each example

Each example's README opens with a short header, written as YAML front matter,
saying what the example is: its level, the products it deploys and what it
shows. [Examples by product and capability](by-product-and-capability.md) is
generated from these headers.

```yaml
---
example:
  level: start
  products: [core/datastore/mariadb, core/devtool/adminer]
  shows: [connections, credentials]
---
```

`level` is one of the three levels this page is arranged by:

<!-- example-header: level -->
- `start` — the Catalog-only level: assembled from catalog entities, with
  nothing authored but the Aggregate, the Manifest and the Release.
- `authoring` — the Authoring level: authors a Component, a Feature or a Recipe,
  or shows how one is shaped.
- `advanced` — the Advanced level: boundaries, governance policy,
  annotation-driven Features and assembled cloud stacks.

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
- `cloud-infrastructure` — Terraform or CloudFormation output for managed cloud
  services.
- `external-sources` — a Recipe that fetches what it renders: an upstream chart,
  a git repository or a module.
- `import` — a project written in another format, drafted into Aggrega files by
  `aggrega import`, then reviewed and built.

An example lists at least one product or one capability, so the index can place
it. `scripts/gen-examples-index.sh --check`, run from the root of this
repository, checks every header against these lists, refuses an example with
neither an executable `check.sh` nor a `build-release.sh`, and confirms the
index is current; run it without `--check` to write the index again.
