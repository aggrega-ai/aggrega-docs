---
example:
  level: authoring
  products: [core/datastore/mariadb]
  shows: [cloud-infrastructure, credentials]
---

# Terraform RDS (vendored module)

The same MariaDB intent as the `terraform-rds` example, rendered through the
**sourced** shape of the Terraform provider: instead of an inline HCL body, the
Recipe points at a local Terraform module and the compiler vendors it verbatim,
then supplies its input variables from the developer and operator pillars.

## What the compiler emits

Under `dist/infra/terraform/` the build produces the boundary's root
configuration, and under `dist/infra/terraform/modules/db/` the `db` component's
own files:

- `aggrega.modules.tf` at the boundary root — the root configuration, declaring
  `db` as a `module` block whose `source` is `./modules/db` and whose **arguments
  are the module's input variables**, in deterministic key order. Every terraform
  boundary gets one, and it is what puts a boundary's components in a single
  Terraform configuration;
- the module files copied **byte-for-byte** (`variables.tf`, `main.tf`,
  including any `${...}` interpolation the module author wrote);
- `aggrega.provenance.tf` beside those files — a `#`-comment file identifying the
  build.

The `db` block this example emits:

```hcl
module "db" {
  source = "./modules/db"

  allocated_storage       = 100
  backup_retention_period = 14
  db_name                 = "appdb"
  engine_version          = "11.4"
  instance_class          = "db.t3.small"
  multi_az                = true
  port                    = 3306
  skip_final_snapshot     = false
  storage_type            = "gp3"
  subnet_id               = "production-private-db-subnets"
}
```

Two of those arguments are worth following back to where they were authored.
`subnet_id` is the DB subnet group name the Release supplies under
`infra.overrides` — the group is operated outside this deployment, its name
differs per environment, and the module's own declaration carries no default, so
the Recipe asserts it and the build halts loudly when it is missing rather than
planning against the wrong network. `instance_class` comes from the same pillar
but carries a default in the Recipe, so a Release that states nothing gets
`db.t3.small`.

**Whatever a Recipe maps into these arguments the compiler pipes through
untouched and never resolves — a Terraform `${...}` pointer included.** What
changes with the position is where that pointer lands: a module argument is one
of the positions Terraform evaluates, so a pointer written there resolves against
the root configuration at plan time instead of reaching the module as a literal
string. It still has to name something that configuration declares.

Because the inputs are stated in the root, `modules/db/` on its own is not a
configuration you can plan as deployed — see
[the Terraform provider page](../../providers/terraform.md#where-a-components-inputs-are-supplied)
for what the engine does if you try.

## Files

- `aggregate.yaml` — developer intent: one `db` component of type
  `core/datastore/mariadb`.
- `release.yaml` — operator sizing for the `infra` boundary. Its entry for `db`
  binds the Component's required `root_password` slot with
  `core/generated-secret` (see below), and attaches `core/backup` to keep each
  of the instance's automated backups for 14 days — the
  `backup_retention_period` above; with no attachment the instance keeps them
  for 7.
- `manifest.yaml` — binds the MariaDB component type to the Terraform Recipe
  `terraform/mariadb-rds-module`, which sources its module locally, the
  credential Feature type to `terraform/generated-secret`, and the backup
  Feature type to `terraform/backup-native`, which renders nothing: the Recipe
  reads the attachment and supplies the module's backup inputs itself.
- `.aggrega-config.yaml` — names the hub registry the catalog entities resolve
  from.

## The credential slot on a managed target

`core/datastore/mariadb` declares `root_password` as a required slot: a build
halts while nothing binds it. RDS generates and rotates the master password
itself, and the vendored module this Recipe copies sets
`manage_master_user_password` to turn that on — so the slot is delegated to the
engine rather than filled with an authored value.

Whether the engine owns the credential follows from the Recipe the Manifest
picks, so the operator binds the slot, in the Release, on its entry for `db`.
It binds it with `core/generated-secret`, which configures nothing because
there is nothing to author, and whose FeatureRecipe
(`terraform/generated-secret`) is pure wiring that renders nothing. The vendored
module and the root configuration come out byte-for-byte what they would be with
no attachment at all. The Manifest's reference is provider-qualified because a
bare recipe name resolves only when exactly one provider carries it, and the
standard library ships a `generated-secret` FeatureRecipe under more than one —
so a bare name does not resolve at all, and the build halts loudly rather than
silently picking a provider for you.

## Build

```bash
aggrega build --release release.yaml --auto-pull
```

`--auto-pull` writes the lockfile a fresh clone lacks during the build.
