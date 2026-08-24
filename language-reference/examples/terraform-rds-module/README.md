# Terraform RDS (vendored module + overlay)

The same MariaDB intent as the `terraform-rds` example, rendered through the
**sourced** shape of the Terraform provider: instead of an inline HCL body, the
Recipe points at a local Terraform module and the compiler vendors it verbatim,
then generates a variables overlay from the developer and operator pillars.

## What the compiler emits

Under `dist/infra/terraform/` the build produces the boundary's root
configuration, and under `dist/infra/terraform/modules/db/` the `db` component's
own files:

- `aggrega.modules.tf` at the boundary root — the root configuration, declaring
  `db` as a `module` block whose `source` is `./modules/db`. Every terraform
  boundary gets one, and it is what puts a boundary's components in a single
  Terraform configuration;
- the module files copied **byte-for-byte** (`variables.tf`, `main.tf`,
  including any `${...}` interpolation the module author wrote);
- `aggrega.auto.tfvars.json` — the resolved input variables in deterministic key
  order. The `subnet_id` value is the DB subnet group name the Release supplies
  under `infra.overrides`, which is what the module's own declaration asks of its
  caller. Whatever a Recipe maps here the compiler pipes through untouched and
  never resolves — a Terraform `${...}` pointer included;
- `aggrega.provenance.tf` — a `#`-comment file identifying the build (the JSON
  overlay cannot carry a comment, so provenance rides in its own file).

## Files

- `aggregate.yaml` — developer intent: one `db` component of type
  `core/datastore/mariadb`. Its `features:` block binds the Component's required
  `root_password` slot with `core/generated-secret` (see below).
- `release.yaml` — operator sizing for the `infra` boundary.
- `manifest.yaml` — binds the MariaDB component type to the Terraform Recipe
  `terraform/mariadb-rds-module`, which sources its module locally, and the
  credential Feature type to `terraform/generated-secret`.
- `.aggrega-config.yaml` — points resolution at the sibling catalog; a
  standalone clone resolves from the hub registry instead.

## The credential slot on a managed target

`core/datastore/mariadb` declares `root_password` as a slot every deployment
binds. RDS generates and rotates the master password itself, and the vendored
module this Recipe copies sets `manage_master_user_password` to turn that on —
so the slot is delegated to the engine rather than filled with an authored
value.

The Aggregate binds it with `core/generated-secret`, which carries no `values`
because there is nothing to author, and whose FeatureRecipe
(`terraform/generated-secret`) is pure wiring that renders nothing. The vendored
module and the generated overlay come out byte-for-byte what they would be with
no attachment at all. The Manifest's reference is provider-qualified because a
bare recipe name resolves only when exactly one provider carries it, and the
standard library ships a `generated-secret` FeatureRecipe under more than one —
so a bare name does not resolve at all, and the build halts loudly rather than
silently picking a provider for you.

## Build

```bash
./build-release.sh
```
