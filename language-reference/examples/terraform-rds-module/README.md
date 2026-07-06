# Terraform RDS (vendored module + overlay)

The same MariaDB intent as the `terraform-rds` example, rendered through the
**sourced** shape of the Terraform provider: instead of an inline HCL body, the
Recipe points at a local Terraform module and the compiler vendors it verbatim,
then generates a variables overlay from the developer and operator pillars.

## What the compiler emits

Under `dist/infra/terraform/` the build produces:

- the module files copied **byte-for-byte** (`variables.tf`, `main.tf`,
  including any `${...}` interpolation the module author wrote);
- `aggrega.auto.tfvars.json` — the overlay Terraform loads automatically,
  carrying the resolved input variables in deterministic key order. The
  `subnet_id` value is a Terraform `${...}` pointer supplied by the Recipe and
  piped through untouched;
- `aggrega.provenance.tf` — a `#`-comment file identifying the build (the JSON
  overlay cannot carry a comment, so provenance rides in its own file).

## Files

- `aggregate.yaml` — developer intent: one `db` component of type
  `core/datastore/mariadb`.
- `release.yaml` — operator sizing for the `infra` boundary.
- `manifest.yaml` — binds the MariaDB component type to the Terraform Recipe
  `terraform/mariadb-rds-module`, which sources its module locally.
- `.aggrega-config.yaml` — points resolution at the sibling catalog; a
  standalone clone resolves from the hub registry instead.

## Build

```bash
./build-release.sh
```
