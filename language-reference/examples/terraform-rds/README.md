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
- `release.yaml` — operator sizing: engine version, storage, HA, and backup for
  the `infra` boundary.
- `manifest.yaml` — binds the MariaDB component type to the Terraform Recipe
  `terraform/mariadb-rds`.
- `.aggrega-config.yaml` — points resolution at the sibling catalog; a
  standalone clone resolves from the hub registry instead.

## Build

```bash
./build-release.sh
```

The rendered `main.tf` lands under `dist/infra/terraform/`. It opens with a
`#`-comment provenance block identifying the build, followed by the resolved
`aws_db_instance` resource — storage, HA, and backup values substituted from
the Release, and RDS-managed credentials via `manage_master_user_password`.
