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
  cloud target lives here. Its `features:` block binds the Component's required
  `root_password` slot with `core/generated-secret` — the credential Feature
  that says the engine owns the credential (see below).
- `release.yaml` — operator sizing: engine version, storage, HA, and backup for
  the `infra` boundary.
- `manifest.yaml` — binds the MariaDB component type to the Terraform Recipe
  `terraform/mariadb-rds`, and the credential Feature type to
  `terraform/generated-secret`.
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

## The credential slot on a managed target

`core/datastore/mariadb` declares `root_password` as a slot every deployment
binds. A self-hosted MariaDB needs a password bound at authoring time; a managed
RDS instance does not — RDS generates and rotates the master password itself,
and `manage_master_user_password` in this Recipe is what turns that on.

The Aggregate therefore binds the slot with `core/generated-secret`, the
credential Feature whose material the engine owns. It carries no `values`
because there is nothing to author, and the FeatureRecipe the Manifest selects
(`terraform/generated-secret`) is pure wiring that renders nothing. So the
rendered `main.tf` is byte-for-byte what it would be with no attachment at all:
the slot is bound, and no artifact is emitted for it.

Note that the Manifest's FeatureRecipe reference is provider-qualified
(`terraform/generated-secret:1.0.0`). A bare recipe name resolves only when
exactly one provider carries it, and the standard library ships a
`generated-secret` FeatureRecipe under more than one — so a bare
`generated-secret:1.0.0` does not resolve at all, and the build halts loudly
rather than silently picking a provider for you.
