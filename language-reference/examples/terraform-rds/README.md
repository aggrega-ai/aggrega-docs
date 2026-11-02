---
example:
  level: authoring
  products: [core/datastore/mariadb]
  shows: [cloud-infrastructure, credentials]
---

# Terraform RDS (inline HCL artifact)

A single MariaDB database authored once as developer intent and rendered to a
Terraform HCL file that provisions a managed AWS RDS instance.

This example demonstrates the **artifact** shape of the Terraform provider: the
Recipe carries an inline `main.tf` body under `artifacts:`, and the compiler
emits that body verbatim after resolving its template expressions. The provider
never runs `terraform`; it produces the HCL a downstream `terraform apply` runs.

## Files

- `aggregate.yaml` — developer intent: one `db` component of type
  `core/datastore/mariadb`, with a logical database name. Nothing about the
  cloud target lives here.
- `release.yaml` — operator sizing: engine version, storage and HA for the
  `infra` boundary. Its entry for `db` binds the Component's required
  `root_password` slot with `core/generated-secret` — the credential Feature
  that says the engine owns the credential (see below) — and attaches
  `core/backup`, which sets how long the instance keeps its backups.
- `manifest.yaml` — binds the MariaDB component type to the Terraform Recipe
  `terraform/mariadb-rds`, the credential Feature type to
  `terraform/generated-secret`, and the backup Feature type to
  `terraform/backup-native`.
- `.aggrega-config.yaml` — names the hub registry the catalog entities resolve
  from.

## Build

```bash
aggrega build --release release.yaml --auto-pull
```

`--auto-pull` writes the lockfile a fresh clone lacks during the build. The rendered `main.tf` lands under `dist/infra/terraform/modules/db/`, with the
boundary's root configuration, `aggrega.modules.tf`, at `dist/infra/terraform/`
declaring `db` as a `module` block pointing at it. The body opens with a
`#`-comment provenance block identifying the build, followed by a
`required_providers` block constraining the AWS provider version, the resolved
`aws_db_instance` resource — storage and HA values substituted from the
Release, the backup retention the `core/backup` attachment sets, and
RDS-managed credentials via `manage_master_user_password` — and
an `address` output carrying the instance's hostname, which the Recipe publishes
as `host` in the form `${module.db.address}`.

**That `module` block carries no arguments, and the reason is the shape of this
example.** The Recipe authored the body, so it substituted the Release's values
straight into the resource; the module declares no `variable` blocks and there is
nothing left for the compiler to pass in:

```hcl
module "db" {
  source = "./modules/db"
}
```

A Recipe that vendors a module instead — the
[`terraform-rds-module`](../terraform-rds-module/) example — leaves those inputs
undeclared in the body, so the compiler supplies them as this block's arguments.

## The credential slot on a managed target

`core/datastore/mariadb` declares `root_password` as a required slot: a build
halts while nothing binds it. A self-hosted MariaDB needs a password bound at
authoring time; a managed RDS instance does not — RDS generates and rotates the
master password itself, and `manage_master_user_password` in this Recipe is
what turns that on.

The operator therefore binds the slot in the Release, on its entry for `db`,
with `core/generated-secret`, the credential Feature whose material the engine
owns. Whether the engine owns the credential follows from the Recipe the
Manifest picks, so the binding is the operator's, and the Aggregate says
nothing about it:

```yaml
      components:
        db:
          features:
            root_password:
              type: core/generated-secret
```

The attachment configures nothing because there is nothing to author, and the
FeatureRecipe the Manifest selects (`terraform/generated-secret`) is pure wiring
that renders nothing. So the rendered `main.tf` is byte-for-byte what it would
be with no attachment at all: the slot is bound, and no artifact is emitted for
it.

Note that the Manifest's FeatureRecipe reference is provider-qualified
(`terraform/generated-secret:1.0.0`). A bare recipe name resolves only when
exactly one provider carries it, and the standard library ships a
`generated-secret` FeatureRecipe under more than one — so a bare
`generated-secret:1.0.0` does not resolve at all, and the build halts loudly
rather than silently picking a provider for you.

## Backup on a managed target

RDS backs the instance up itself, keeping each automated backup for 7 days
when nothing says otherwise. The operator changes that by attaching
`core/backup` in the Release, beside the credential:

```yaml
            backup:
              type: core/backup
              infra:
                retention_days: 14
```

The Manifest binds the Feature to `terraform/backup-native`, which renders
nothing of its own: the backup is a setting of the instance, so the Recipe
reads the attachment and writes it into the resource it already renders. The
backup section of `aws_db_instance` in `main.tf`:

```hcl
  ## ── Backup ───────────────────────────────────────────────
  backup_retention_period = 14
```

An `infra.schedule` such as `30 2 * * *` would also set the instance's
`backup_window` to `02:30-03:00`, read in UTC; left out, as here, RDS chooses
the window. A value RDS cannot keep — a retention above 35 days, a schedule
other than one time of every day — halts the build naming the attachment.
