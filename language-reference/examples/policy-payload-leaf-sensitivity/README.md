---
example:
  level: advanced
  products: [core/datastore/mariadb]
  shows: [policy, guardrails, credentials, cloud-infrastructure]
---

# A policy keyed on the one leaf the author wrote

This example teaches one house rule and the fact that makes it expressible:

> A credential slot may be filled. It may not be filled by writing the material
> into the workspace's own source.

Two releases, one variable apart: the same managed database, the same required
credential slot, filled by two different Features — one the developer attaches
in the Aggregate, the other the operator attaches in the Release. An
operator-authored policy refuses one and permits the other. What makes the pair
worth running is that **both attachments handle secret material** — so the rule
cannot be written against the question "is this attachment sensitive?", and the
control policy below shows what happens when you try.

Everything except two policy files comes from the standard-library catalog, the
governance Plugin entity included.

## The slot, and the two Features that can fill it

`core/datastore/mariadb` declares one required credential slot:

```yaml
  featuresSchema:
    root_password:
      required: true
      sensitive: true
      inject: []
      description: Root database password. Recipe controls delivery (Black-Box).
```

`sensitive: true` there is a statement about the binding point rather than about
any particular fill: whatever binds this slot handles secret material. `inject:
[]` closes delivery — the Recipe decides where the credential goes, and the
developer does not dictate it.

Two standard-library Features bind that slot, and they model opposite credential
lifecycles:

| Feature | who owns the material | what an attachment authors |
|---|---|---|
| `core/secret-value` | an author supplies it | two `values` leaves — see below |
| `core/generated-secret` | the target engine provisions and rotates it | nothing; it declares no `values` |

`core/secret-value` declares its two leaves asymmetrically, and the asymmetry is
the whole hinge of this example:

```yaml
values:
  origin: { type: string, sensitive: true }
  key:    { type: string, required: true, default: "value" }
```

`origin` carries the material and is declared sensitive. `key` is a delivery
name and is deliberately left unmarked — a key names *where* material lives
rather than being the material, and every Recipe implementing this Feature
renders it in the clear.

`core/generated-secret` declares no `values` at all, so there is nothing for an
attachment to author. It is the engine-managed peer rather than a weaker version
of the same thing: it carries the same credential-family label, it binds the
same slot, and its Recipes render nothing, because the credential belongs to the
engine the component's own Recipe manages.

## The two releases

`aggregate-authored.yaml` binds the slot the author-supplied way: the developer
attaches the credential in the Aggregate, and the attachment authors **both**
leaves:

```yaml
      features:
        root_password:
          type: core/secret-value
          values:
            key: MARIADB_ROOT_PASSWORD
            origin: root-password-in-the-clear
```

The delegated arm binds it the engine-managed way, and that binding is the
operator's: whether the engine owns the credential follows from the Recipe the
Manifest picks, so `release-delegated.yaml` attaches `core/generated-secret` on
its entry for `db`, and `aggregate-delegated.yaml` is the authored Aggregate
without its `features:` block:

```yaml
      components:
        db:
          features:
            root_password:
              type: core/generated-secret
```

Both releases share `manifest.yaml`, which binds all three types for the
Terraform target, so the Manifest is not where the two differ:

```yaml
    components:
      type:
        core/datastore/mariadb:1.0.0: terraform/mariadb-rds:1.0.0
    features:
      type:
        core/secret-value:1.0.0: terraform/variable-secret:1.0.0
        core/generated-secret:1.0.0: terraform/generated-secret:1.0.0
```

## The policy

`policy.rego`, attached over the build graph:

```rego
package house.governance

import rego.v1

deny contains msg if {
	some node_id, attachments in input.graph.spec.feature_values_mapping
	some attachment_name, attachment in attachments
	some leaf in attachment.sensitive_payload_leaves
	msg := sprintf("%v: the %v credential carries declared-sensitive material in its payload at %v", [node_id, attachment_name, leaf])
}
```

`sensitive_payload_leaves` lists the leaves **this attachment's payload
carries** whose path the attached Feature declares sensitive, each as a
pillar-prefixed dotted path. The payload read is the one the attachment ends up
carrying, so a leaf standing at a value the Feature's schema declares as a
`default` is named alongside one an author wrote at it. Two consequences, and
the example turns on both:

- A leaf appears only where a declaration **covers** it — the declaration names
  that leaf, or names an object containing it, matched segment-wise over the
  dotted path. Nothing is read out of the path's own text and no value is
  inspected. So `key`, written beside `origin` in the same attachment, never
  appears: its Feature declares nothing about it.
- An attachment whose payload carries nothing at a declared leaf contributes
  nothing to the list. The delegated release's attachment carries the
  whole-attachment answer and no per-leaf list at all, because the key is
  omitted from the wire when it would be empty.

The attachment sits in `.aggrega-config.yaml` at the `ir-verdict` role, which is
the role that receives the build graph:

```yaml
plugins:
  governance:
    - uri: governance/rego:0.8.6
      role: ir-verdict
      with:
        sources:
          - policy.rego
```

A verdict role returns an accept-or-reject and nothing else. It can stop this
build; it cannot rewrite the Aggregate into compliance, because the path that
dispatches a verdict has no way to apply one as a change. A Release that
wants the delegated form gets it by attaching the delegated Feature — never by a
policy quietly substituting one.

## Build both

```bash
aggrega build --release release-negative-authored.yaml --auto-pull    # expected to fail
aggrega build --release release-delegated.yaml --auto-pull
```

`--auto-pull` fills the lockfile during the build; `aggrega pull --release
release-<arm>.yaml` once beforehand does the same thing and lets later builds run
with no flag. The rendered output and the lockfiles are generated, not shipped:
this example commits its inputs and regenerates everything else.

## What comes back

The authored release is refused, and the build exits `1`. `E0005` is the
diagnostic a policy refusal carries — see
[the diagnostic reference](../../errors/sentinels.md):

```text
[… omitted: the pull's lines — the same refusal among them — and a lint notice about core/secret-value]
[POLICY_ERROR E0005]
  policy plugin "rego" rejected the build: db: the root_password credential carries declared-sensitive material in its payload at values.origin
  caused by: policy violation
```

Read the leaf path. The attachment's payload carries two values; the refusal
names `values.origin` and does not mention `values.key`. That single sentence is
the per-leaf marking doing its work — one attachment, two payload leaves, one
declaration, one refusal.

The refusal also arrives before anything is rendered. No `dist/infra-authored/`
directory is created at all, so there is no partial artifact tree to clean up
and nothing on disk that a later step could mistake for output.

The delegated release builds, exits `0`, and writes two files.
`dist/infra-delegated/terraform/aggrega.modules.tf`, the boundary's root
configuration:

```hcl
# Root configuration for this boundary. Each component rendered here is one
# module block below, and the directory that block points at holds that
# component's own files. One configuration means one dependency graph, which is
# what lets a reference or a depends_on reach from one component to another.

module "db" {
  source = "./modules/db"
}
```

and `dist/infra-delegated/terraform/modules/db/main.tf`, which opens with a
`#`-comment block identifying the build and then carries the AWS provider
constraint, the resource and the address output the Recipe publishes:

```hcl
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.69"
    }
  }
}

resource "aws_db_instance" "db" {
  identifier     = "db"
  engine         = "mariadb"
  engine_version = "11.4"
  port           = 3306

  ## ── Compute ──────────────────────────────────────────────
  instance_class = "db.t3.small"

  ## ── Storage ──────────────────────────────────────────────
  allocated_storage = 100
  storage_type      = "gp3"

  ## ── Database ─────────────────────────────────────────────
  db_name  = "appdb"
  username = "admin"

  ## Black-Box: RDS manages the password via Secrets Manager.
  manage_master_user_password = true

  ## ── HA ───────────────────────────────────────────────────
  multi_az = false

  ## ── Backup ───────────────────────────────────────────────
  backup_retention_period = 7

  ## ── Provider-specific overrides ──────────────────────────
}

output "address" {
  value = aws_db_instance.db.address
}
```

`manage_master_user_password = true` is the delegated form arriving in the
output: the engine holds the credential, and the Release names no material
anywhere. The permitted release rendered a real artifact rather than passing by
rendering nothing.

## The control: asking the whole-attachment question instead

Swap the attached source in `.aggrega-config.yaml`:

```yaml
        sources:
          - policy-attachment-wide.rego
```

`policy-attachment-wide.rego` is the same walk keyed on `attachment.sensitive`
— one boolean for the whole attachment — instead of on the per-leaf list:

```rego
deny contains msg if {
	some node_id, attachments in input.graph.spec.feature_values_mapping
	some attachment_name, attachment in attachments
	attachment.sensitive
	msg := sprintf("%v: the %v credential handles sensitive material", [node_id, attachment_name])
}
```

Rebuild both releases — and put `policy.rego` back afterwards, since the rest of
this page assumes it. **Both are now refused**, with the same sentence:

```text
[… omitted: the pull's lines — the same refusal among them — and a lint notice about core/secret-value]
[POLICY_ERROR E0005]
  policy plugin "rego" rejected the build: db: the root_password credential handles sensitive material
  caused by: policy violation
```

That is not the rule misfiring — it is the rule being asked a coarser question
and answering it correctly. `sensitive` reads what the *entities* declare: it is
true here because the slot declares that whatever binds it handles secret
material, and the slot says that whoever fills it. The delegated attachment
authors nothing and is still sensitive, so a rule keyed on that answer cannot
separate the two releases at all. The delegated release is a build the per-leaf
rule permits and the whole-attachment rule has no way to permit.

The third sensitivity fact, `sensitive_inject`, does not help either: it names
delivery keys whose referenced `provides` key is declared sensitive. Here the
slot is delivery-closed and the author-supplied Feature publishes no
`provides` pillar, so on this workspace it names nothing. Of the three facts,
only the per-leaf list answers "where does *this attachment's payload* carry data",
which is what the house rule is about.

For all three facts side by side, with the payload shapes and the cases where
each one is the right question, see
[the attachment facts a governance policy reads](../../plugins/governance-attachment-facts.md).
For the socket itself — the roles, the verdict severities, the operator input
channel — see [the policy socket](../../plugins/policy-socket.md), and for where
policy sits in the product,
[Governance and Compliance](../../../architecture/11-governance-and-compliance.md).

## What this target makes visible about the authored form

The managed-database Recipe sets the engine's own managed-password directive
unconditionally and reads no injected credential, so on this target it halts the
build on the authored attachment itself, naming the slot, rather than accept
material with nowhere to land. The policy refuses it first, where it actually is:
in a file the workspace keeps under version control. That is the governance
concern, and it is a separate matter from what any Recipe would have rendered.

Which is also why the two Features are peers rather than alternatives of equal
standing on every target. Bind the author-supplied Feature where you
genuinely hold the credential, and the engine-managed one where the
target owns it. This example's authored release is the mismatch a house rule can
catch mechanically.

## Where the plugin comes from

Every entity this workspace consumes comes from the published standard-library
catalog: the Component, the two Features, the Recipe, the two FeatureRecipes and
the governance Plugin entity — read from the hub registry `.aggrega-config.yaml`
names, or from a checkout of the catalog ([where to get one](../../../authoring/import/README.md#how-an-import-runs)) named with `--catalog`.

`uri: governance/rego:0.8.6` names that Plugin entity. It is an identity: a
`<pluginType>/<name>` coordinate plus a version, and both halves are part of the
form. **The version is the one the plugin is published at** — the catalog
carries the entity under `plugin/governance/rego/0.8.6/`, and the hub publishes
it as `oci://hub.aggrega.ai/plugin/governance/rego:0.8.6`. The version takes part
in resolution: an attachment naming a version that no catalog directory, no
registry and not the `aggrega` binary itself carries stops the build. The binary
carries the engine's entity at its own release's version only.

Built with `--catalog` naming a checkout of the catalog, the example needs
nothing else: every entity resolves from that checkout with no network, and the
engine that runs is the one compiled into the `aggrega` binary. Without it the
entities are read from `hub.aggrega.ai`.

A build reading the hub also needs a compiler of the release that published the
plugin version the attachment names — for `governance/rego:0.8.6`, the `0.8.6`
release of `aggrega`. The Rego engine is compiled into the CLI binary, and its
version is the compiler release that ships it. A compiler of any other release,
or one built from source between releases, carries a different build of the
engine: a build reading the hub with it halts with `E0135` (`oci: content digest
mismatch`), because the module that compiler carries does not match the digest
the hub publishes for `governance/rego:0.8.6`. That halt is the plugin's digest
check working, not a fault in the example.

## Files

- `aggregate-authored.yaml` — the `root_password` slot bound by
  `core/secret-value` in the Aggregate, authoring the delivery key and the
  material.
- `aggregate-delegated.yaml` — the same database with no attachment: the
  developer binds nothing.
- `manifest.yaml` — binds the component type and both Feature types to their
  Terraform Recipes. Shared by both releases.
- `release-negative-authored.yaml`, `release-delegated.yaml` — one per arm, each
  with its own boundary `directory:`. There is no flag for the output location,
  so two releases sharing one directory would have the second overwrite the first.
  `release-delegated.yaml` also binds the slot, on its entry for `db`, with
  `core/generated-secret`, authoring nothing. Which Feature fills the slot, and
  in which document, is the only difference between the two arms.
- `policy.rego` — the house rule, keyed on the per-leaf marking.
- `policy-attachment-wide.rego` — the control, keyed on the whole-attachment
  answer. Not attached by default.
- `.aggrega-config.yaml` — the default registry and the governance
  attachment.

## Build

```bash
aggrega build --release release-negative-authored.yaml --auto-pull    # refused; exits 1
aggrega build --release release-delegated.yaml --auto-pull            # builds
```
