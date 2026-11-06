---
example:
  level: advanced
  products: [core/datastore/postgres]
  shows: [policy, multi-target, guardrails, cloud-infrastructure]
---

# A policy over the rendered output: one house rule, four targets, two engines

One house rule, attached at the `render-verdict` role, judges the files a build
writes for four targets and refuses a violation planted on each. The rule has
two clauses:

> Every container image names a fixed version — a tag other than `latest`, or a
> digest. Every database instance stores its data encrypted.

This workspace builds one Aggregate for four targets — Kubernetes through Helm,
Docker Compose, Terraform and CloudFormation. The `render-verdict` role judges
the files a build writes, after every target has rendered them, and the rule
reads each target's own output shape: the images in
Kubernetes objects and in a Compose file, the RDS instance in a Terraform file
and in a CloudFormation template. Each target has a Release that passes and a
Release with a violation planted in it, which the rule refuses.

The rule is written twice, once for each policy engine compiled into the CLI —
Rego and CEL — and the two copies agree on every build here. A script beside the
Releases builds all sixteen combinations and checks each outcome.

<!-- The home page at aggrega.ai draws this diagram too, from its own content: a label changed here is changed there. -->
<figure class="diagram not-content">
<div class="diagram-canvas">
<div class="diagram-flow">
<div class="diagram-flow-part">
<div class="diagram-node diagram-node-compiler">
<div class="diagram-node-label"><code>aggrega build</code></div>
</div>
</div>
<div class="diagram-arrow" aria-hidden="true"></div>
<div class="diagram-flow-part">
<div class="diagram-node diagram-node-file">

your policy

plugged into the compiler

</div>
</div>
<div class="diagram-arrow" aria-hidden="true"></div>
<div class="diagram-flow-part" style="--diagram-weight: 1.6">
<div class="diagram-group">
<div class="diagram-outcome">
<div class="diagram-outcome-word">

pass

</div>
<div class="diagram-node diagram-node-output-file">

files written

ready to review and deploy

</div>
</div>
<div class="diagram-outcome">
<div class="diagram-outcome-word">

fail

</div>
<div class="diagram-node diagram-node-stop">

build stopped

<div><samp class="diagram-node-printed">policy plugin "rego" rejected the build: terraform/modules/db/main.tf: the RDS instance db stores its data unencrypted</samp></div>
</div>
</div>
</div>
</div>
</div>
</div>
<figcaption class="diagram-caption">

A policy can stop a build and say what to fix. It never changes your files to make them pass.

</figcaption>
</figure>

## What it builds

| instance | catalog Component | what it is here |
|---|---|---|
| `db` | `core/datastore/postgres` | the orders database |
| `report` | `core/compute/task` | a report job that reads `db`, started by hand: it carries `core/manual-trigger`, so no run starts when the Release deploys |

`report` reads the database's address, port and name through its `database`
connection, as `DB_HOST`, `DB_PORT` and `DB_NAME`. The Aggregate is the same file
for every build; each Release names the Manifest that chooses the target:

| Manifest | `db` | `report` |
|---|---|---|
| `manifest-helm.yaml` | `helm/postgres`, a StatefulSet | `helm/task`, a CronJob held suspended |
| `manifest-compose.yaml` | `compose/postgres`, a service | `compose/task`, a service behind a profile |
| `manifest-terraform.yaml` | `terraform/postgres-rds`, an RDS instance | `terraform/task-ecs`, an Amazon ECS task definition |
| `manifest-cloudformation.yaml` | `cloudformation/postgres-rds`, an RDS instance | `cloudformation/task-ecs`, an Amazon ECS task definition |

Every Recipe here renders from the catalog alone: the Kubernetes database is
synthesized rather than fetched as a chart, the Terraform database body is
written by its Recipe, and the Terraform task's module is kept beside its Recipe.
So every build runs offline.

## The eight Releases

| Release | target | what the rule finds | the build |
|---|---|---|---|
| `release-helm.yaml` | Kubernetes | `report` runs `registry.example.com/orders-report:1.4.2` | completes |
| `release-helm-unpinned.yaml` | Kubernetes | `report` runs the same image at the tag `latest` | halts |
| `release-compose.yaml` | Docker Compose | `report` runs `registry.example.com/orders-report:1.4.2` | completes |
| `release-compose-unpinned.yaml` | Docker Compose | `report` runs the image with no tag | halts |
| `release-terraform.yaml` | Terraform | the instance is encrypted with the key the Release names | completes |
| `release-terraform-unencrypted.yaml` | Terraform | the Release names no key, so the instance is not encrypted | halts |
| `release-cloudformation.yaml` | CloudFormation | the Release turns `StorageEncrypted` on | completes |
| `release-cloudformation-unencrypted.yaml` | CloudFormation | the Release leaves it off | halts |

The image is the Release's: `core/compute/task` packages no software, so the
Release names the image a run executes under `infra.image`, tag included. On the
two AWS targets the database's encryption is the Release's too. The Terraform
Recipe reads `infra.overrides.kms_key_id` and, when it is set, renders
`storage_encrypted = true` beside the key; the CloudFormation Recipe reads
`infra.overrides.StorageEncrypted` and `KmsKeyId` under the resource properties'
own names. A Release that sets neither renders an instance with no encryption
attribute at all, which is what the planted Releases do.

The Kubernetes and Compose databases run the image `postgres:16`, a fixed tag, so
the rule judges them and lets them pass in every Release.

## Attaching the rule

`.aggrega-config.yaml` declares the catalog directories and no governance
attachment. The rule is attached by the file a build names with `--config`:
`governance-rego.yaml` for the Rego engine, `governance-cel.yaml` for the CEL
engine. The Rego one reads:

```yaml
plugins:
  governance:
    - uri: governance/rego:0.8.6
      role: render-verdict
      with:
        sources:
          - policies/house-rule.rego
```

`--config` names the global configuration file for that run, in place of the one
the machine would otherwise read, and this workspace's `.aggrega-config.yaml`
still layers on top of it. A `plugins.governance` list in the workspace file
would replace the one the named file carries, which is why the workspace file
declares none. `0.8.6` is the version of each engine's Plugin entity in the
standard-library catalog. Both engines are compiled into the CLI —
`aggrega plugin list` lists `governance/rego` and `governance/cel` among the
embedded built-ins — so no build here fetches a plugin.

## What a render-verdict policy reads

A policy at `render-verdict` reads the files the build writes at
**`input.artifacts`**, one entry per file, sorted by path. Each carries:

- `path` — the file's path under `dist/`, such as `terraform/modules/db/main.tf`;
- `content` — the file's text, as written;
- `format` — the format the target's provider declared for the file: `yaml` for
  the Compose file, `json` for the CloudFormation template, `hcl` for every
  Terraform file, the database's body its Recipe writes included. Where nothing
  declared one, it is the empty string, as it is for the Kubernetes files here;
- `documents` — the file's content parsed into structure, as a list of
  documents: one for each file here;
- `parse_error` — present only on a file that could not be parsed, in place of
  `documents`.

Beside the files, `input.sources` holds the attachment's own policy file, and
`input.settings` its settings — the empty object here, as this attachment
declares none.

`aggrega build --release <release> --dry-run --policy-input <dir>` writes the
payload each role receives into `<dir>` and writes nothing else. At
`render-verdict` that file is what the engine receives rather than what the
policy reads: each file in it carries its `path` and `content` and the `format`
its provider declared, and the engine parses the `documents` from the content
once it receives the payload. So the file lists the files a rule will be shown,
though not their documents. After a build of `release-terraform.yaml` has filled
its lockfile:

```bash
aggrega build --release release-terraform.yaml --config governance-rego.yaml --dry-run --policy-input payloads
jq -c '[.artifacts[].path]' payloads/render-verdict.json
# ["terraform/aggrega.modules.tf","terraform/modules/db/main.tf","terraform/modules/report/aggrega.provenance.tf","terraform/modules/report/main.tf","terraform/modules/report/variables.tf"]
```

A path a rule reads inside `documents` is checked in a build, where the engine
has parsed them. No file these Recipes write fails to parse, so no file here carries
`parse_error`. Each clause of this rule reads `documents`, so a file that did not
parse would pass it unexamined; a rule that must not let that happen adds a
clause that refuses a file carrying `parse_error`.

## How each clause reads its target's shape

Each clause names the shape it reads, and a file of another shape does not
carry what the clause names: in Rego the path is undefined and the clause does
not hold. So one rule runs over every target's output and each clause finds
only its own.

**Compose** writes one file whose document keys each service by name under
`services`:

```rego
deny contains msg if {
    some artifact in input.artifacts
    some doc in artifact.documents
    some name, service in doc.services
    unpinned(service.image)
    msg := sprintf("%v: service %v runs %v, an image with no tag or the tag latest", [artifact.path, name, service.image])
}
```

**Kubernetes** objects carry their containers in a pod template, which a CronJob
holds one level deeper than the other workloads, under `spec.jobTemplate.spec`:

```rego
pod_template(doc) := doc.spec.jobTemplate.spec.template if doc.kind == "CronJob"

pod_template(doc) := doc.spec.template if doc.kind != "CronJob"
```

**Terraform** in native HCL nests a block under its type and then under each of
its labels, and the last label holds a list of blocks, because blocks sharing a
type and labels collect into one list. So an instance's attributes sit one index
below its name, and the clause walks the list:

```rego
deny contains msg if {
    some artifact in input.artifacts
    native_hcl(artifact)
    some doc in artifact.documents
    some name, blocks in doc.resource.aws_db_instance
    some block in blocks
    not block.storage_encrypted == true
    msg := sprintf("%v: the RDS instance %v stores its data unencrypted", [artifact.path, name])
}
```

The list matters more here than for a rule that looks for a value, because this
clause refuses on an absence. Written for a single block — `some name, block in
doc.resource.aws_db_instance` — `block` is the list, `block.storage_encrypted`
is undefined on it, and `not` holds for anything undefined: the clause refuses
`release-terraform.yaml` too, whose instance is encrypted, with the same message
as the planted Release.

A `.tf.json` file reads as its Recipe wrote it, with the name holding the block
itself, so a rule written for one form does not read the other. That is why the
clause reads `format` first: `native_hcl` takes a file whose format is `hcl`, or
whose format is empty and whose name ends in `.tf` — a file no provider declared
a format for is parsed by its name, so the rule tells it by its name too, rather
than passing over it. Every Terraform file built here is declared `hcl`, so no
file here is told by its name. These Recipes write no `.tf.json` file, so the
rule reads no other form. [What each role's payload exposes](../../plugins/policy-socket.md#what-each-roles-payload-exposes)
sets out both forms.

**CloudFormation** writes one template whose resources are keyed by logical ID
under `Resources`, each with its `Type` and `Properties`:

```rego
deny contains msg if {
    some artifact in input.artifacts
    some doc in artifact.documents
    some id, resource in doc.Resources
    resource.Type == "AWS::RDS::DBInstance"
    not resource.Properties.StorageEncrypted == true
    msg := sprintf("%v: the RDS instance %v stores its data unencrypted", [artifact.path, id])
}
```

An instance with no `StorageEncrypted` property, or with it set to anything but
`true`, is refused: `not … == true` holds for both.

## Why the CEL rule is written differently

`policies/house-rule.cel` states the same two clauses and reaches the same
verdict on every build here. It is written differently in three places, each
for a reason of the engine's.

**It tests every key before reading it.** Reading a key a value does not carry
is an evaluation fault in CEL rather than an undefined path, and a fault stops
the build. Each target's files lack keys another's carry — a Kubernetes object
has no `services`, a Compose file no `kind` — so every clause tests the keys it
reads with `has()` first:

```cel
// Docker Compose: a service whose image names no fixed version.
input.artifacts
  .filter(a, has(a.documents) && a.documents.exists(d,
    has(d.services) && d.services.exists(s,
      has(d.services[s].image)
      [… omitted: the image test, and the rest of the clause]
```

Without the `has(d.services)` test, `aggrega build --release release-helm.yaml
--config governance-cel.yaml --auto-pull` stops, whatever images the Kubernetes objects
run, exits `1` and writes no `dist/`, and the line that reports the fault names
the policy file and the key:

```text
render-verdict: plugin "governance/cel:0.8.6": call "verdict_render": wasm: plugin "cel" call to verdict_render: policy source "house-rule.cel" could not be evaluated: No such key: services
```

**It reports one offender per file.** A decision key collects messages, and a
CEL expression has no way to join the lists it builds per file into one list. So
each CEL clause reports one offender in each file: the first container of a pod
template, or, among the services, instances and resources a file keys by name,
the one whose name sorts first. A comprehension walks a map in no fixed order,
so choosing by name is what keeps the message the same from one build to the
next. The Rego rule reports every offender. With two unpinned services in one
Compose file, the Rego engine halts with two messages and the CEL engine with
one, for the service whose name sorts first; with one, as in every Release
here, the two halt with the same message.

**It repeats itself.** CEL offers no way to name a sub-expression, so a test
used twice is written twice, and the image test is spelled out in each clause
rather than called as Rego's `unpinned` is.

The two files are a deliberate near-duplicate, each written on its own from the
rule above rather than generated one from the other, so that a build on which
the engines disagree shows the disagreement.

## A verdict never changes the output

A policy at `render-verdict` accepts the build or refuses it. It is handed the
files the build wrote and returns verdicts; nothing it returns is applied to
them. So a control builds the same files, byte for byte, with the rule attached
and without it, and `check.sh` compares the two trees on every run. A refused
build writes no `dist/` at all. To fix a refusal, the Release changes — a pinned
tag, an encryption key — and the next build is judged again.

## Building

```bash
aggrega build --release release-terraform.yaml --config governance-rego.yaml --auto-pull
aggrega build --release release-terraform-unencrypted.yaml --config governance-rego.yaml --auto-pull   # halts; exits 1
```

Swap `governance-rego.yaml` for `governance-cel.yaml` to run the same rule on the
CEL engine, and `terraform` in the Release's file name for `helm`, `compose` or
`cloudformation`, with their planted Releases `release-helm-unpinned.yaml`,
`release-compose-unpinned.yaml` and `release-cloudformation-unencrypted.yaml`.

**The standard-library catalog supplies every Component, Recipe, Feature and
FeatureRecipe here and carries both engines' Plugin entities.** They resolve
from `hub.aggrega.ai`, the default registry `.aggrega-config.yaml` names. With a
checkout of the catalog ([where to get one](../../../authoring/import/README.md#how-an-import-runs)) named with `--catalog`, nothing is fetched from a
registry, so the builds run offline. `--auto-pull` fills each Release's
lockfile during the build; lockfiles and the rendered output are generated, not
shipped.

The Terraform control completes. The planted Release halts:

```text
[… omitted: the lines printed while the lockfile is resolved, which carry the refusal below once more and say the render that discovers external inputs could not finish]
[POLICY_ERROR E0005]
  policy plugin "rego" rejected the build: terraform/modules/db/main.tf: the RDS instance db stores its data unencrypted
  caused by: policy violation
```

Each message names the file the rule judged, as its path under `dist/`, and the
offender in it. The other planted Releases halt the same way:

```text
policy plugin "rego" rejected the build: helm/report-cronjob.yaml: container main runs registry.example.com/orders-report:latest, an image with no tag or the tag latest
policy plugin "cel" rejected the build: compose/docker-compose.yaml: service report runs registry.example.com/orders-report, an image with no tag or the tag latest
policy plugin "cel" rejected the build: cloudformation/cloudformation-stack.json: the RDS instance Db stores its data unencrypted
```

Each line is the one after `[POLICY_ERROR E0005]` in its build's output, shown
from the left margin. The first comes from the Rego engine and the other two
from the CEL engine, each naming the engine that reported it; the other engine
prints the same message under its own name.

## Checking every build

This self-check runs in a checkout of the documentation repository, which holds
the shared build helper it uses; a copy written by `aggrega scaffold --example`
does not carry that helper.

```bash
./check.sh
```

`check.sh` builds each control once with no policy attached, as the reference,
and then all eight Releases under each engine, through the build-release helper.
A control must complete and write the same files, byte for byte, as its
reference; a planted Release must halt with `E0005` and the message expected for
it, and no other refusal beside it, and write no `dist/`. Both engines are held
to the same message. It prints one line per build and exits 1 if any outcome
differs, printing that build's output:

```text
ENGINE RELEASE                                  EXIT  EXPECTED  VERDICT
--------------------------------------------------------------------------------------------------------------
none   release-helm.yaml                        0     reference OK
none   release-compose.yaml                     0     reference OK
none   release-terraform.yaml                   0     reference OK
none   release-cloudformation.yaml              0     reference OK
rego   release-helm.yaml                        0     pass      OK: completed, byte-identical to the build with no policy
rego   release-helm-unpinned.yaml               1     halt      OK: E0005, the expected sentence
rego   release-compose.yaml                     0     pass      OK: completed, byte-identical to the build with no policy
rego   release-compose-unpinned.yaml            1     halt      OK: E0005, the expected sentence
rego   release-terraform.yaml                   0     pass      OK: completed, byte-identical to the build with no policy
rego   release-terraform-unencrypted.yaml       1     halt      OK: E0005, the expected sentence
rego   release-cloudformation.yaml              0     pass      OK: completed, byte-identical to the build with no policy
rego   release-cloudformation-unencrypted.yaml  1     halt      OK: E0005, the expected sentence
cel    release-helm.yaml                        0     pass      OK: completed, byte-identical to the build with no policy
cel    release-helm-unpinned.yaml               1     halt      OK: E0005, the expected sentence
cel    release-compose.yaml                     0     pass      OK: completed, byte-identical to the build with no policy
cel    release-compose-unpinned.yaml            1     halt      OK: E0005, the expected sentence
cel    release-terraform.yaml                   0     pass      OK: completed, byte-identical to the build with no policy
cel    release-terraform-unencrypted.yaml       1     halt      OK: E0005, the expected sentence
cel    release-cloudformation.yaml              0     pass      OK: completed, byte-identical to the build with no policy
cel    release-cloudformation-unencrypted.yaml  1     halt      OK: E0005, the expected sentence

check: every build ended as expected.
```

It uses the binary `./build-release.sh` resolves, so `AGGREGA_BIN` chooses it,
and arguments after `--` reach every build. It refuses to start while a `dist/`
sits in this directory, because it moves each build's tree away to compare it,
and it leaves none behind; the builds fill this directory's lockfiles, as any
build does. Its exit status is the whole verdict.

## Where the compiler does not interpret

The compiler renders each target's files, hands them to the attached engine as
text with the format their provider declared, and acts on the severity each
verdict carries. It does not know what an image tag is, that `latest` moves, or
that an RDS instance should be encrypted: those meanings are the rule's. For the
roles, the payloads and the decision keys, see
[the governance socket](../../plugins/policy-socket.md).

## Files

- `aggregate.yaml` — the database and the report job wired to it.
- `manifest-helm.yaml`, `manifest-compose.yaml`, `manifest-terraform.yaml`,
  `manifest-cloudformation.yaml` — bind each component type and the manual
  trigger Feature to their Recipes on one target.
- `release-<target>.yaml`, `release-<target>-unpinned.yaml`,
  `release-<target>-unencrypted.yaml` — a control and a planted violation per
  target.
- `.aggrega-config.yaml` — the default registry; no governance attachment.
- `governance-rego.yaml`, `governance-cel.yaml` — the rule attached at
  `render-verdict` through each engine, each named with `--config`.
- `policies/house-rule.rego`, `policies/house-rule.cel` — the rule, once per
  engine.
- `build-release.sh` — builds one Release, echoing the equivalent `aggrega build`
  command.
- `check.sh` — makes the twenty builds and checks each outcome.
