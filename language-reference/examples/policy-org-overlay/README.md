---
example:
  level: advanced
  products: [core/datastore/mariadb, core/devtool/adminer]
  shows: [policy, guardrails]
---

# Organization-wide policy: a team's rule, an organization's and a pipeline's

A team's policy, its organization's and its pipeline's run together on one
build, each attached in a configuration file of its own. The team attaches its
rule in its workspace; the organization adds one on every build, and the
pipeline adds one more, without either of them editing the team's file. A build
reads all the files that apply to it and runs every attachment they carry.

The rules report at all three verdict severities: `info` and `warn` let the build
complete, and `halt` stops it. One of them, the organization's, is attached twice
and reported at a different severity each time, through a `translation` block.

## What it builds

| instance | catalog Component | what it is here |
|---|---|---|
| `db` | `core/datastore/mariadb` | the shop's database |
| `web` | `core/devtool/adminer` | a database administration UI, wired to `db` |

Both are compiled to Docker Compose, into `dist/compose/docker-compose.yaml`. One
Aggregate, one Manifest and one Release, `release.yaml`; none of them names a
policy.

## The three files

| who | file | how a build reads it | where the attachment is written |
|---|---|---|---|
| the team | `.aggrega-config.yaml` | it marks this directory as the workspace, so every build here reads it | `plugins.governance` |
| the organization | `org/config.yaml` | as the global configuration file, named for one build with `--config org/config.yaml` | `plugins.governance_append` |
| the pipeline | `pipeline/.aggrega-config-append-ci.yaml` | once copied into this directory, as the pipeline's overlay | `plugins.governance_append` |

All three attachments are the Rego engine, `governance/rego:0.8.6`, at the
`ir-verdict` role, which judges the build graph before anything is rendered. `0.8.6` is the version of its Plugin entity in the
standard-library catalog. The engine itself is compiled into the CLI —
`aggrega plugin list` lists `governance/rego` among the embedded built-ins — so
no build here fetches a plugin.

**The organization's file is a global configuration file.** A machine has one,
read on every build: from its default location, or the file the `AGGREGA_CONFIG`
environment variable names. `--config <path>` names one for a single run instead,
and the workspace's own files are still read on top of it. In an organization the
file would sit at the default location on every developer's machine and in every
pipeline; here it sits in `org/`, and the builds that should read it name it.
[Naming the global file explicitly](../../cli/configuration.md#naming-the-global-file-explicitly)
sets out the order the three ways are tried in.

**The pipeline's file is an overlay.** A build reads `.aggrega-config-append-ci.yaml`
in the directories it reads `.aggrega-config.yaml` from, beside it. It is kept
here in `pipeline/`, where a build run in this directory does not read it,
because it halts every build that does; the pipeline's step is to copy it in:

```bash
cp pipeline/.aggrega-config-append-ci.yaml .
```

## Each file adds, and the pipeline's overlay only adds

The organization and the pipeline both write their attachment under
`plugins.governance_append`, the append companion of the `plugins.governance`
list. Entries under a companion are concatenated onto the resolved list after
each file's own lists are read, so the team's `plugins.governance` and the
organization's entry both run, and neither file names the other. The
organization writes the companion, and not `plugins.governance` itself, because
a `plugins.governance` list in the workspace's file replaces the one in the
global file: an organization's rule written there is dropped by the team's list,
and the build prints nothing about it.
[Extending a list instead of replacing it](../../cli/configuration.md#extending-a-list-instead-of-replacing-it)
lists the companion for each list setting.

The pipeline's overlay can only add. What it writes for a list setting is added
to what the other files resolved; it removes nothing, and it does not override a
setting that holds a single value, such as `auto_pull`. This one carries
`auto_pull: true`, and a build reading it ignores the key and says so in a
warning. With `<workspace>` standing for the absolute path of the directory the
build ran in, the line reads:

```text
warning: <workspace>/.aggrega-config-append-ci.yaml: ignoring non-additive key "auto_pull" (the CI-owned overlay is additive-only and cannot override the base config)
```

## The rules, and the severity each is reported at

A Rego policy collects each decision under a **decision key**, and the key picks
the severity the decision is reported at. With no `translation` the keys are
`deny`, `warn` and `audit`, reported at `halt`, `warn` and `info`:

| severity | what the build does |
|---|---|
| `halt` | stops, exits `1` and writes no `dist/` |
| `warn` | completes, prints the message, and writes `dist/` |
| `info` | completes, prints the message, and writes `dist/` |

**The team's rule**, `policies/team.rego`, collects under `warn`, and its
attachment declares no `translation`, so it is reported at `warn`:

```rego
warn contains msg if {
    some id, node in input.graph.spec.nodes
    node.labels["component.aggrega.ai/category"] == "datastore"
    input.graph.spec.infra_mapping[id].ha.enabled == false
    msg := sprintf("%v runs with high availability off", [id])
}
```

**The organization's rule**, `org/policies/estate.rego`, refuses components in a
category its settings list, and records what each component runs:

```rego
deny contains msg if {
    some id, node in input.graph.spec.nodes
    category := node.labels["component.aggrega.ai/category"]
    category in data.refused_categories
    msg := sprintf("%v runs %v, in the %v category, which the organization does not ship", [id, node.component, category])
}

audit contains msg if {
    some id, node in input.graph.spec.nodes
    msg := sprintf("%v runs %v %v, upstream licensing %v", [id, node.component, node.resolved_version, node.labels["component.aggrega.ai/upstream-licensing"]])
}
```

`refused_categories` is a setting of each attachment, and a policy reads its
attachment's settings as its `data` document.

## Translation: one rule, two severities

A `translation` block in an attachment's settings declares which decision keys
are read and the severity each is reported at. It replaces the default mapping
rather than extending it: a key it does not name is not read.

The organization's file rolls its rule out as advice. Its attachment reports
`deny` at `warn`, and `audit` at `info`:

```yaml
settings:
  refused_categories: [devtool]
  translation:
    - key: deny
      severity: warn
    - key: audit
      severity: info
```

The pipeline attaches the same file and makes the same rule halt. Its translation
names `deny` alone, so its attachment does not report the `audit` records a
second time:

```yaml
settings:
  refused_categories: [devtool]
  translation:
    - key: deny
      severity: halt
```

So one rule, over the same `web`, is a warning on a developer's build and the
reason a pipeline's build stops.

## Building

**The standard-library catalog supplies the Components, the Recipes, the
Feature and its FeatureRecipe.** They resolve from `hub.aggrega.ai`, the default
registry `.aggrega-config.yaml` names. With a checkout of the catalog ([where to get one](../../../authoring/import/README.md#how-an-import-runs)) named with `--catalog`, nothing is fetched from a registry, so the builds run offline.
`--auto-pull` fills the lockfile during the build; the
lockfile and the rendered output are generated, not shipped.

With the team's file alone:

```bash
aggrega build --release release.yaml --auto-pull
```

the build prints the team's warning and completes. With the organization's file
as well:

```bash
aggrega build --release release.yaml --auto-pull --config org/config.yaml
```

it prints the organization's records at `info` and its rule at `warn`, beside
the team's warning, and still completes:

```text
  info: policy plugin "rego": db runs core/datastore/mariadb 1.0.0, upstream licensing osi-approved
  info: policy plugin "rego": web runs core/devtool/adminer 1.0.0, upstream licensing osi-approved
  policy plugin "rego" warning: db runs with high availability off
  policy plugin "rego" warning: web runs core/devtool/adminer, in the devtool category, which the organization does not ship
Pull complete: release.lock (entities=11, source_artifacts=0, external_inputs=0)
  notice: LINT: Feature "core/secret-value" at core/secret-value:1.0.0 declares property "origin" in both values: and infra: pillars (path: origin)
[… omitted: the build's time and the line naming the dist/ directory it wrote]
```

Each verdict names the plugin that reported it, `rego`, and not the file that
attached it, so the team's warning and the organization's read alike; a message
that says whose rule it is, as the organization's does, is the way to tell them
apart.

With the pipeline's overlay copied in, the same command halts:

```bash
cp pipeline/.aggrega-config-append-ci.yaml .
aggrega build --release release.yaml --auto-pull --config org/config.yaml
```

```text
[… omitted: the overlay's warning shown above]
[… omitted: the lines printed while the lockfile is resolved, which carry the verdicts below once more, the refusal among them]
  info: policy plugin "rego": db runs core/datastore/mariadb 1.0.0, upstream licensing osi-approved
  info: policy plugin "rego": web runs core/devtool/adminer 1.0.0, upstream licensing osi-approved
  policy plugin "rego" warning: db runs with high availability off
  policy plugin "rego" warning: web runs core/devtool/adminer, in the devtool category, which the organization does not ship
  notice: LINT: Feature "core/secret-value" at core/secret-value:1.0.0 declares property "origin" in both values: and infra: pillars (path: origin)
[POLICY_ERROR E0005]
  policy plugin "rego" rejected the build: web runs core/devtool/adminer, in the devtool category, which the organization does not ship
  caused by: policy violation
```

The build exits `1` and writes no `dist/`. The organization's rule is reported
twice, once by each attachment: at `warn` by the organization's and at `halt` by
the pipeline's. The `audit` records appear once, from the organization's
attachment alone. Remove `.aggrega-config-append-ci.yaml` from this directory to
build without it again.

## Checking every build

This self-check runs in a checkout of the documentation repository, which holds
the shared build helper it uses; a copy written by `aggrega scaffold --example`
does not carry that helper.

```bash
./check.sh
```

`check.sh` builds `release.yaml` five times, through the build-release helper,
each in a copy of this workspace: with the team's file alone, with the
organization's file named by `--config`, with the pipeline's overlay copied in,
with both, and with a copy of the organization's file that writes its
attachment under `plugins.governance` instead of the companion — where the
team's list replaces it, and only the team's verdict is printed. For each it
checks the exit status, whether `dist/` was written, and every verdict the build
printed — its severity and its message, with nothing missing and nothing else —
and, where the overlay is read, the warning naming `auto_pull`. It prints one line per build, then the verdicts each printed, and
exits 1 if any outcome differs, printing that build's output:

```text
LAYERS                                   EXIT  DIST   VERDICT
----------------------------------------------------------------------------------------------------
team                                     0     yes    OK
team + organization                      0     yes    OK
team + pipeline                          1     no     OK
all three                                1     no     OK
team + organization, plugins.governance  0     yes    OK

team:
  warn     db runs with high availability off

team + organization:
  info     db runs core/datastore/mariadb 1.0.0, upstream licensing osi-approved
  info     web runs core/devtool/adminer 1.0.0, upstream licensing osi-approved
  warn     db runs with high availability off
  warn     web runs core/devtool/adminer, in the devtool category, which the organization does not ship

team + pipeline:
  ignored  auto_pull
  warn     db runs with high availability off
  halt     web runs core/devtool/adminer, in the devtool category, which the organization does not ship

all three:
  ignored  auto_pull
  info     db runs core/datastore/mariadb 1.0.0, upstream licensing osi-approved
  info     web runs core/devtool/adminer 1.0.0, upstream licensing osi-approved
  warn     db runs with high availability off
  warn     web runs core/devtool/adminer, in the devtool category, which the organization does not ship
  halt     web runs core/devtool/adminer, in the devtool category, which the organization does not ship

team + organization, plugins.governance:
  warn     db runs with high availability off

check: every build ended as expected.
```

The copies are made in a temporary directory, with the catalog path in their
`.aggrega-config.yaml` made absolute so it still resolves from there; no file in
this directory is edited or written. It uses the binary `./build-release.sh`
resolves, so `AGGREGA_BIN` chooses it, and arguments after `--` reach every
build. Its exit status is the whole verdict.

## Where the compiler does not interpret

The compiler reads the three files, concatenates the attachments they carry,
hands each policy the build graph and its settings, and acts on the severity each
decision is reported at. It does not know what a devtool is, why an organization
would not ship one, or that high availability matters to a team: those meanings
are the policies' rules and settings. For the roles, the payloads and the
decision keys, see [the governance socket](../../plugins/policy-socket.md).

## Files

- `aggregate.yaml` — the database and the administration UI wired to it.
- `manifest.yaml` — binds each component type and the secret Feature to its
  Docker Compose Recipe.
- `release.yaml` — the one Release.
- `.aggrega-config.yaml` — the team's file: the default registry and the
  team's attachment.
- `policies/team.rego` — the team's rule.
- `org/config.yaml` — the organization's global configuration file and its
  attachment.
- `org/policies/estate.rego` — the organization's rule.
- `pipeline/.aggrega-config-append-ci.yaml` — the pipeline's overlay, read once
  copied into this directory.
- `build-release.sh` — builds the Release, echoing the equivalent `aggrega build`
  command.
- `check.sh` — makes the five builds and checks each outcome.
