# A policy keyed on the one leaf the author wrote

This example teaches one house rule and the fact that makes it expressible:

> A credential slot may be filled. It may not be filled by writing the material
> into the deployment's own source.

Two releases, one variable apart: the same managed database, the same required
credential slot, filled by two different Features — one the developer attaches
in the Aggregate, the other the operator attaches in the Release. An
operator-authored policy refuses one and permits the other. What makes the pair
worth running is that **both attachments handle secret material** — so the rule
cannot be written against the question "is this attachment sensitive?", and the
control policy below shows what happens when you try.

Everything comes from the standard-library catalog except the governance Plugin
entity this workspace declares for itself, and two policy files.

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
  origin: { type: string, required: true, sensitive: true }
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
	msg := sprintf("%v: the %v credential writes declared-sensitive material into the deployment at %v", [node_id, attachment_name, leaf])
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
    - uri: governance/rego:1.0.0
      role: ir-verdict
      with:
        sources:
          - policy.rego
```

A verdict role returns an accept-or-reject and nothing else. It can stop this
build; it cannot rewrite the Aggregate into compliance, because the path that
dispatches a verdict has no way to apply one as a change. A deployment that
wants the delegated form gets it by attaching the delegated Feature — never by a
policy quietly substituting one.

## Build both

```bash
./build-release.sh authored  -- --auto-pull    # expected to fail
./build-release.sh delegated -- --auto-pull
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
[POLICY_ERROR E0005]
  policy plugin "1.0.0" rejected the build: db: the root_password credential writes declared-sensitive material into the deployment at values.origin
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
`#`-comment block identifying the build and then carries the resource:

```hcl
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
```

`manage_master_user_password = true` is the delegated form arriving in the
output: the engine holds the credential, and the deployment names no material
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
[POLICY_ERROR E0005]
  policy plugin "1.0.0" rejected the build: db: the root_password credential handles sensitive material
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
unconditionally and reads no injected credential, so on this target the material
the authored Aggregate supplies has nowhere to land in the rendered artifact. The
policy refuses it where it actually is: in a file the deployment keeps under
version control. That is the governance concern, and it is a separate matter
from what any Recipe would have rendered.

Which is also why the two Features are peers rather than alternatives of equal
standing on every target. Bind the author-supplied Feature where you
genuinely hold the credential, and the engine-managed one where the
target owns it. This example's authored release is the mismatch a house rule can
catch mechanically.

## Where the plugin comes from

The Component, the two Features, the Recipe and the two FeatureRecipes this
workspace consumes come from the published standard-library catalog — the
checkout listed under `catalog_dirs`, or the hub registry for a standalone clone.

The governance plugin is addressed differently, and the difference is worth
stating plainly. `uri: governance/rego:1.0.0` is an identity: a
`<pluginType>/<name>` coordinate plus a version, and both halves are part of the
form. **The version here is this workspace's own declaration rather than a
coordinate published anywhere** — the workspace declares the Plugin entity it
attaches, at `catalog/plugin/governance/rego/1.0.0/plugin.yaml`, and the compiler
serves the artifact that identity names. A workspace declaring the entity it
attaches is an ordinary authoring pattern; what it means for this page is that
the URI *form* is what the example teaches, while the version inside it belongs
to this workspace. An attachment pointed at a published plugin names that
plugin's published version in the same position.

## Files

- `aggregate-authored.yaml` — the `root_password` slot bound by
  `core/secret-value` in the Aggregate, authoring the delivery key and the
  material.
- `aggregate-delegated.yaml` — the same database with no attachment: the
  developer binds nothing.
- `manifest.yaml` — binds the component type and both Feature types to their
  Terraform Recipes. Shared by both releases.
- `release-authored.yaml`, `release-delegated.yaml` — one per arm, each with its
  own boundary `directory:`. There is no flag for the output location, so two
  releases sharing one directory would have the second overwrite the first.
  `release-delegated.yaml` also binds the slot, on its entry for `db`, with
  `core/generated-secret`, authoring nothing. Which Feature fills the slot, and
  in which document, is the only difference between the two arms.
- `policy.rego` — the house rule, keyed on the per-leaf marking.
- `policy-attachment-wide.rego` — the control, keyed on the whole-attachment
  answer. Not attached by default.
- `catalog/plugin/governance/rego/1.0.0/plugin.yaml` — the Plugin entity this
  workspace declares for the policy engine it attaches.
- `.aggrega-config.yaml` — the catalog search stack and the governance
  attachment.

## Build

```bash
./build-release.sh authored  -- --auto-pull    # refused; exits 1
./build-release.sh delegated -- --auto-pull    # builds
```
