---
example:
  level: authoring
  tier: start-here
  position: 5
  products: [core/datastore/postgres, core/compute/server]
  shows: [cloud-infrastructure, connections]
---

# Terraform Cloud Run and Cloud SQL

A PostgreSQL database and the server that reads it, authored once as developer
intent and built to a Terraform configuration for Google Cloud: the database is
a Cloud SQL instance, the server is a Cloud Run service. This is the Google
Cloud counterpart of [Terraform RDS](../terraform-rds/README.md), and of
[PostgreSQL and a Container Apps server on Azure Resource Manager](../arm-postgres-container-apps/README.md)
on Azure.

The build needs no Google Cloud account and makes no call to Google Cloud. It
writes the Terraform files; planning or applying them is a separate step, run
with your own credentials.

## Files

- `aggregate.yaml` — developer intent: a `db` database of type
  `core/datastore/postgres`, and an `api` server of type `core/compute/server`
  that uses it. The server's `inject` block names the environment variables its
  code reads (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_NAME`) and which of the
  database's published entries fills each. Nothing about Google Cloud lives
  here.
- `release.yaml` — operator values for the `infra` boundary: the database's
  engine version, disk size and high availability, the server's image, port and
  instance count, and, under `overrides`, the Google Cloud project, region, VPC
  network and service account both Recipes place the resources in. Every
  project-specific value is a placeholder (`example-project`,
  `example-network`); replace each with your own.
- `manifest.yaml` — binds the PostgreSQL component type to the Recipe
  `terraform/postgres-cloud-sql` and the server component type to the Recipe
  `terraform/server-cloud-run`.
- `.aggrega-config.yaml` — names the hub registry the catalog entities resolve
  from.

## Draft the example

You can build this example with the commands below, or [have your AI assistant build it for you](#with-an-ai-assistant).

Write the example into a new folder named after it:

```sh
aggrega draft --example terraform-cloud-run-cloud-sql
```

It then prints the commands to run next. The first changes into the new folder:

```sh
cd terraform-cloud-run-cloud-sql
```

## Build

```bash
aggrega build --release release.yaml --auto-pull
```

`--auto-pull` writes the lockfile a fresh clone lacks during the build. The
boundary's root configuration, `aggrega.modules.tf`, lands in
`dist/infra/terraform/` and declares one `module` block for each component,
`db` and `api`, each pointing at a folder under `modules/`.

The database's module, `modules/db/`, is the Cloud SQL project's PostgreSQL
module, vendored as published and called with the values the Release gives: the
engine version as `database_version`, the disk size, the project, region and
VPC network. The instance gets a private address only, and its automated
backups and point-in-time recovery are on. The module draws the password of the
`orders_admin` user at apply time, so no password is written into any file the
build produces.

The server's module, `modules/api/`, is one Cloud Run service. Its container
runs the Release's image on the Release's port, as the service account the
Release names. The service sends traffic to the network through Direct VPC
egress, and its ingress is internal. The four environment variables the
Aggregate asks for become container variables; `DB_HOST` holds a Terraform
reference to the instance's private address, which the root configuration
evaluates:

```hcl
module "api" {
  source = "./modules/api"

  config = {"cpu":"1","environment":{"DB_HOST":"${module.db.private_ip_address}", ...}, ...}
}
```

## What the Release leaves to you

Neither Recipe creates the surroundings it places resources in. The project, the
VPC network, the service account and the image already exist:

- The network has private services access to Cloud SQL: an allocated IP range
  and a private connection to `servicenetworking.googleapis.com`. Cloud SQL
  refuses to create an instance with a private address without it.
- The subnet of the network the service uses for Direct VPC egress is a `/26` or
  larger.
- The service account can read any secret the service mounts, and the identity
  applying the configuration may act as it.
- The service admits no request from the internet. Callers inside the network
  that hold the Cloud Run Invoker role reach it; the build grants that role to
  nobody.

## Plan and apply

Set your Google Cloud credentials in the environment, as Application Default
Credentials or `GOOGLE_CREDENTIALS`, then run Terraform in the folder holding
the root configuration:

```sh
cd dist/infra/terraform
terraform init
terraform plan
```

`terraform plan` reads and plans without changing anything. `terraform apply`
creates the Cloud SQL instance and the Cloud Run service in your project, and
both are billed by Google Cloud.

## With an AI assistant

An AI assistant [set up with Aggrega's tools](../../../ai-assistants/set-up.md)
can do the same: paste this prompt into it.

<!-- copyable -->

> Use the Aggrega tools only, and create no folder yourself. If the Workspace folder holds no `terraform-cloud-run-cloud-sql` folder yet, call the `draft` tool once with `example` set to `terraform-cloud-run-cloud-sql` and no `dir`: it writes the example into a new `terraform-cloud-run-cloud-sql` folder. Then call the `build` tool with `workspace_root` set to `terraform-cloud-run-cloud-sql`, `release` set to `release.yaml`, `auto_pull` set to true and `write` set to true. Tell me which files the build wrote; they are under `terraform-cloud-run-cloud-sql/dist/`.
