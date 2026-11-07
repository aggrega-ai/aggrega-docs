---
example:
  level: advanced
  products: [core/datastore/mariadb, core/datastore/redis, core/devtool/adminer]
  shows: [policy, guardrails]
---

# Policies that shape labels: a support tier per environment, and a verdict that reads it

Governance plugins label every component this workspace deploys with its owner,
the support tier its environment earns, its backup schedule and a short tag, so
that no developer types any of them. The labels are derived during the build, by
four governance attachments:

- three at the `label-transform` role, which shape the labels on the build's
  nodes: a Rego policy that reads the Release's environment, and the two tagging
  plugins compiled into the CLI, `label-injector` and `selector-tagger`;
- one at the `ir-verdict` role, a Rego policy over the build graph that halts a
  production build in which a node was left without a support tier.

Two Releases of one Aggregate differ in their environment, `staging` and
`production`, and their nodes end with different labels. A third build, which
`check.sh` makes from a copy of this workspace whose policy covers one category
fewer, halts and names the node it left out.

## What it builds

| instance | catalog Component | what it is here |
|---|---|---|
| `db` | `core/datastore/mariadb` | the shop's database |
| `cache` | `core/datastore/redis` | its session cache |
| `web` | `core/devtool/adminer` | a database administration UI, wired to `db` |

All three are compiled to Docker Compose, into `dist/compose/docker-compose.yaml`.
The Aggregate and both Releases name no label of their own: every label below is
written by an attachment.

## The four attachments

They are attached in this workspace's `.aggrega-config.yaml`, under
`plugins.governance`, so every build run here applies them:

| | plugin | role | what it writes |
|---|---|---|---|
| 1 | `governance/rego:0.8.6`, with `policies/support-tier.rego` | `label-transform` | `ops.example.com/environment` on every node; `ops.example.com/support-tier` on every node whose category its settings list |
| 2 | `governance/label-injector:0.8.6` | `label-transform` | `ops.example.com/owner` on every node; `backup.example.com/schedule` on every node in the `datastore` category |
| 3 | `governance/selector-tagger:0.8.6` | `label-transform` | `tag`, from the map in `policies/tags.yaml` |
| 4 | `governance/rego:0.8.6`, with `policies/production-support.rego` | `ir-verdict` | nothing: it halts the build, or lets it complete |

`0.8.6` is the version of the three Plugin entities in the standard-library
catalog; the plugins themselves are compiled into the CLI, and a build serves
them from there. `aggrega build --release release-production.yaml --auto-pull
--detail` lists both, for each of the three:

```text
[… omitted: the line counting what the pull resolved, and the rows for the Components, the Recipes, the Feature and the FeatureRecipes, each found in the local catalog]
  in-binary  Plugin         governance/label-injector         ← governance/label-injector:0.8.6
  local      Plugin         governance/label-injector:0.8.6   ← .aggrega-config.yaml.plugins.governance
  in-binary  Plugin         governance/rego                   ← governance/rego:0.8.6
  local      Plugin         governance/rego:0.8.6             ← .aggrega-config.yaml.plugins.governance
  in-binary  Plugin         governance/selector-tagger        ← governance/selector-tagger:0.8.6
  local      Plugin         governance/selector-tagger:0.8.6  ← .aggrega-config.yaml.plugins.governance
[… omitted: the rows for this workspace's Aggregate and Manifest, the pull's summary, a lint notice about core/secret-value, and the build's summary]
```

The attachments at one role run in the order they are listed, and each one reads
the labels the ones before it wrote: the label injector receives the two labels
the Rego policy wrote, and the selector tagger receives those and the label
injector's. The verdict runs after all three, over the graph they leave.

## What a label-transform policy reads

A policy at `label-transform` reads the nodes at **`input.graph.nodes`**, keyed by
node id, each with:

- `component` — the Component the node instantiates, such as
  `core/datastore/mariadb`;
- `resolved_version` — the version that Component resolved to;
- `labels` — the labels the node carries when the policy runs: the Component's
  own, and those any earlier transform wrote;
- `values` — the values the node's instance declares in the Aggregate, absent
  where it declares none. Here only `db` declares one, `database: appdb`.

It reads the Release at **`input.compilation_context`**: `release_name` and
`environment`. That is what lets one policy decide differently per environment.

A policy at `ir-verdict` reads the whole build graph instead, and its nodes sit
one level deeper, at **`input.graph.spec.nodes`**. A rule moved from one role to
the other is edited, not copied: with the wrong path it reads nothing and never
fires. The `ir-verdict` payload carries no `compilation_context`, so a verdict
cannot read the environment from the Release. That is why the first policy here
also writes `ops.example.com/environment` on every node: the verdict reads the
environment from that label.

To see the payloads rather than read about them, build once so the lockfile
exists, then:

```bash
aggrega build --release release-production.yaml --dry-run --policy-input payloads
```

writes the payload each attachment receives into `payloads/`, one file per
attachment where several at one role receive different payloads —
`label-transform.1.rego.json`, `label-transform.2.label-injector.json`,
`label-transform.3.selector-tagger.json` — beside one file for each other role,
and writes nothing else.

## The Rego policy

`policies/support-tier.rego` collects its decisions under `labels`, one per
label, naming the node, the label key and the value:

```rego
env := input.compilation_context.environment

labels contains {"node": id, "key": "ops.example.com/environment", "value": env} if {
    some id, _ in input.graph.nodes
}

labels contains {"node": id, "key": "ops.example.com/support-tier", "value": data.support_tiers[env]} if {
    some id, node in input.graph.nodes
    node.labels["component.aggrega.ai/category"] in data.supported_categories
}
```

Its settings are the policy's `data` document, and they hold the estate's
vocabulary:

```yaml
settings:
  # The categories whose components get a support tier.
  supported_categories: [datastore, devtool]
  # The tier each environment gives them.
  support_tiers:
    production: on-call
    staging: office-hours
```

## What each built-in writes

**`label-injector`** applies a list of rules. A node whose labels include every
pair under a rule's `match` receives every pair under its `set`, added, or
replacing the value of a label the node already carries. A `match` with no pairs
matches every node. It reads the rules from its `rules` setting, as here, or,
when the settings carry none, from the first file under `sources` that does. Its
two rules here give every node `ops.example.com/owner: shop-team`, and `db` and
`cache`, the two nodes in the `datastore` category, `backup.example.com/schedule:
nightly`. `web` is in the `devtool` category and gets no backup schedule.

**`selector-tagger`** writes one label, always under the key `tag`. Its value
comes from a map of Component names to tags, read from the files under
`sources`. A node whose Component the map does not list takes the `default`
setting, and with no `default` it is left without a `tag`. `policies/tags.yaml` maps the database and
the cache:

```yaml
core/datastore/mariadb: orders
core/datastore/redis: sessions
```

and the attachment's `default` is `untagged`, so `web` is tagged `untagged`.

Both decide from a node's labels and its Component alone. Neither reads the
environment, so they write the same labels in both Releases.

Both serve `label-transform` only. Attached at `ir-verdict`, either is refused
before it runs; `selector-tagger` attached there halts the build with:

```text
[E0085]
  ir-verdict: plugin "governance/selector-tagger:0.8.6": call "verdict_ir": wasm: plugin "selector-tagger" does not declare export "verdict_ir" in describe(): wasm: plugin rejected by the sandbox
```

## Building

```bash
aggrega build --release release-staging.yaml --auto-pull
aggrega build --release release-production.yaml --auto-pull
```

**The standard-library catalog supplies every Component, Recipe and Feature
here and the three Plugin entities.** They resolve from `hub.aggrega.ai`, the
default registry `.aggrega-config.yaml` names. With a checkout of the catalog ([where to get one](../../../authoring/import/README.md#how-an-import-runs)) named with `--catalog`, nothing is fetched from a registry, so the builds run
offline. `--auto-pull` fills each Release's lockfile during the
build; lockfiles and the rendered output are generated, not shipped.

## The labels each node ends with

`--ir-graph` prints the build graph on standard output, ahead of the build's
summary, and the graph carries each node's labels as the transforms left them.
After `aggrega build --release release-production.yaml --auto-pull --ir-graph`,
`web` reads:

```json
"web": {
  "labels": {
    "component.aggrega.ai/type": "server",
    "component.aggrega.ai/category": "devtool",
    "component.aggrega.ai/upstream-licensing": "osi-approved",
    "ops.example.com/environment": "production",
    "ops.example.com/support-tier": "on-call",
    "ops.example.com/owner": "shop-team",
    "tag": "untagged"
  },
  [… omitted: the node's Component, its version, where it is placed, its catalog metadata, the file it was declared in, and its connection to db]
}
```

The first three labels are the Component's own; the last four were written by
the three transforms. `check.sh` reads the graph of each build and lists the
labels the attachments wrote:

```text
labels the attachments wrote, release-staging.yaml:
  db     ops.example.com/environment: staging
         ops.example.com/support-tier: office-hours
         ops.example.com/owner: shop-team
         backup.example.com/schedule: nightly
         tag: orders
  cache  ops.example.com/environment: staging
         ops.example.com/support-tier: office-hours
         ops.example.com/owner: shop-team
         backup.example.com/schedule: nightly
         tag: sessions
  web    ops.example.com/environment: staging
         ops.example.com/support-tier: office-hours
         ops.example.com/owner: shop-team
         tag: untagged

labels the attachments wrote, release-production.yaml:
  db     ops.example.com/environment: production
         ops.example.com/support-tier: on-call
         ops.example.com/owner: shop-team
         backup.example.com/schedule: nightly
         tag: orders
  cache  ops.example.com/environment: production
         ops.example.com/support-tier: on-call
         ops.example.com/owner: shop-team
         backup.example.com/schedule: nightly
         tag: sessions
  web    ops.example.com/environment: production
         ops.example.com/support-tier: on-call
         ops.example.com/owner: shop-team
         tag: untagged
```

Only the Rego policy's two labels change between the Releases.

Once a build has filled the lockfile, `aggrega inspect release-production.yaml
--ir-graph` prints the same graph without building, ahead of its readable view
of the Release, because the transforms read their files from the lockfile.
Without the lockfile, the graph it prints carries none of the labels those files
decide: no `ops.example.com/environment` or `ops.example.com/support-tier`, and
`tag: untagged` on every node.

## A transform changes labels and nothing else

A decision at `label-transform` names one node, one label key and its value, or
asks for one label to be dropped. There is no decision that adds a node, changes
a node's Component or version, or touches its values, so a transform cannot
express any of those. A decision naming a node the build does not have is not
ignored: the build halts with `E0069` and names the node and the label it could
not set.

The two builds of `release-production.yaml`, with these attachments and with
none, show it. Their build graphs differ in the labels listed above and in
nothing else. Their rendered output does not differ at all: the Compose
Recipes here render none of these labels, so `dist/compose/docker-compose.yaml`
is the same file, byte for byte, with the attachments and without them, and
`check.sh` compares the two trees on every run. The labels live in the build
graph, where the verdict reads them.

## The verdict, and the build it halts

`policies/production-support.rego` is attached at `ir-verdict`, after the
transforms, and reads the labels they wrote:

```rego
deny contains msg if {
    some id, node in input.graph.spec.nodes
    node.labels["ops.example.com/environment"] == "production"
    not node.labels["ops.example.com/support-tier"]
    msg := sprintf("%v is built for production and carries no ops.example.com/support-tier label", [id])
}
```

Both Releases build: in staging the verdict asks for nothing, and in production
every node carries a tier. Narrow the policy's coverage, and the verdict catches
the node it leaves out. With `supported_categories` written `[datastore]` in
`.aggrega-config.yaml`, `web` gets no support tier, and
`aggrega build --release release-production.yaml --auto-pull` halts:

```text
[… omitted: the pull's lines, which carry the refusal below once more, and a lint notice about core/secret-value]
[POLICY_ERROR E0005]
  policy plugin "rego" rejected the build: web is built for production and carries no ops.example.com/support-tier label
  caused by: policy violation
```

The build exits `1` and writes no `dist/`. `release-staging.yaml` still builds
with the narrowed policy: its nodes are labelled `staging`, and the verdict asks
nothing of them. `check.sh` makes this build in a copy of the workspace, so
nothing here has to be edited to see it.

A verdict accepts or refuses and does nothing else: it cannot add the missing
label to make the build pass. Which label a production node must carry is the
estate's rule, written in its policy; the compiler carries the labels to the
graph as strings and reads no meaning into them.

## What the lockfile records

The lockfile records the two kinds of attachment differently. After a production
build, `release-production.lock` carries each transform attachment under
`mutators:` — its plugin, its role, its settings, and the content and digest of
each of its files — and pins each transform plugin under `plugins:`:

```yaml
plugins:
    - uri: governance/label-injector
      [… omitted: the artifact digest, which depends on the aggrega binary that built it, recorded twice]
      referenced_from:
        - governance/label-injector:0.8.6
    - uri: governance/rego
      [… omitted: the artifact digest, recorded twice]
      referenced_from:
        - governance/rego:0.8.6
    - uri: governance/selector-tagger
      [… omitted: the artifact digest, recorded twice]
      referenced_from:
        - governance/selector-tagger:0.8.6
```

The verdict attachment appears only under `verdict_inputs:`, by the sha256 of
its file:

```yaml
verdict_inputs:
    - plugin: governance/rego:0.8.6
      role: ir-verdict
      sources:
        - digest: sha256:09f774d5d03ed288d21c157bcf7066ac903a341c8177e2701975ad32d9be5278
          path: production-support.rego
```

A verdict attachment is not pinned. With the verdict attached alone — the three
transforms removed from `.aggrega-config.yaml` — the lockfile carries
`mutators: []` and `plugins: []`, and the verdict's file under
`verdict_inputs:`. A transform changes the build the rest of the pipeline works
from, so the lockfile holds the plugin that made the change; a verdict decides
only whether the build completes.

## Checking every build

This self-check runs in a checkout of the documentation repository, which holds
the shared build helper it uses; a copy written by `aggrega scaffold --example`
does not carry that helper.

```bash
./check.sh
```

`check.sh` makes four builds through the build-release helper and checks each
outcome against the one this page describes:

- `release-production.yaml` in a copy of this workspace with no governance
  attachment, as the reference;
- `release-staging.yaml` and `release-production.yaml` here, each of which must
  complete with the labels listed above on each node, the production tree byte
  for byte the reference's;
- `release-production.yaml` in a copy whose policy covers the `datastore`
  category only, which must halt with `E0005` and the sentence above, and no
  other refusal beside it.

It prints one line per build, then the labels, and exits 1 if any outcome
differs, printing that build's output:

```text
RELEASE                  GOVERNANCE   EXIT  EXPECTED  VERDICT
----------------------------------------------------------------------------------------------------
release-production.yaml  none         0     reference OK
release-staging.yaml     as attached  0     pass      OK: the expected labels
release-production.yaml  as attached  0     pass      OK: the expected labels; byte-identical to the build with none
release-production.yaml  narrowed     1     halt      OK: E0005, the expected sentence
[… omitted: the two label listings shown above]
check: every build ended as expected.
```

The two copies are made in a temporary directory, with the catalog path in their
`.aggrega-config.yaml` made absolute so it still resolves from there. No file in
this directory is edited; the two builds made here fill its lockfiles, as any
build does. It uses the binary `./build-release.sh` resolves, so `AGGREGA_BIN`
chooses it, and arguments after `--` reach every build. It refuses to start while
a `dist/` sits in this directory, because it compares the trees the builds write,
and it leaves none behind. Its exit status is the whole verdict.

## Where the compiler does not interpret

The compiler hands each transform the nodes and the Release's environment,
applies the labels it decides, and hands the result to the verdict. It does not
know what a support tier is, that `on-call` outranks `office-hours`, or that a
`devtool` needs one: those meanings are the policies' settings and rules. For the
roles, the payloads and how a policy names a label, see
[the governance socket](../../plugins/policy-socket.md), and for where policy
sits in the product, [Governance and Compliance](../../../architecture/11-governance-and-compliance.md).

## Files

- `aggregate.yaml` — the database, the cache and the administration UI wired to
  the database; no labels.
- `manifest.yaml` — binds each component type and the secret Feature to its
  Docker Compose Recipe. Shared by both Releases.
- `release-staging.yaml`, `release-production.yaml` — the two environments.
- `.aggrega-config.yaml` — the default registry and the four governance
  attachments.
- `policies/support-tier.rego` — the label-transform policy.
- `policies/production-support.rego` — the verdict.
- `policies/tags.yaml` — the selector tagger's component-to-tag map.
- `build-release.sh` — builds one Release, echoing the equivalent `aggrega build`
  command.
- `check.sh` — makes the four builds and checks each outcome.
