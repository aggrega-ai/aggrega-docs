---
example:
  level: advanced
  products: [core/datastore/postgres]
  shows: [multi-target, cloud-infrastructure, connections, external-sources]
---

# A managed database and the service reading it, on Terraform and CloudFormation

One Aggregate holds a PostgreSQL database and the server that reads it. The same
Aggregate is built three ways against AWS: as one Terraform root configuration,
with the database provisioned by the published RDS module of the
terraform-aws-modules project and the server run as an Amazon ECS service on
Fargate; as one CloudFormation stack holding both; and as two CloudFormation
stacks, the database in one and the server in the other.

On each target the server receives the database's address in the form that
target resolves itself: a module output reference in the root configuration,
an `Fn::GetAtt` inside one stack, an `Fn::ImportValue` across two. The
compiler evaluates none of them. The address does not exist until the instance
is created, so the build pipes a reference through and the target resolves it
when it deploys.

Output blocks on this page are copied from a real run, per
[Reading the output on these pages](../reading-the-output.md).

## Files

- `aggregate.yaml` — developer intent: a `db` component of type
  `core/datastore/postgres` with a logical database `orders` owned by the role
  `orders_admin`, and an `api` component of type `core/compute/server` that
  uses it. No key or value in it is about AWS.
- `manifest-terraform.yaml` — binds the database to the Recipe
  `terraform/postgres-rds-terraform-aws-modules`, the server to
  `terraform/server-ecs`, and the `core/backup` Feature to
  `terraform/backup-native`.
- `manifest-cloudformation.yaml` — binds the database to
  `cloudformation/postgres-rds`, the server to `cloudformation/server-ecs`, and
  the `core/backup` Feature to `cloudformation/backup-native`.
- `release-terraform.yaml` — both components in one boundary, built through the
  Terraform Manifest.
- `release-one-stack.yaml` — both components in one boundary, built through the
  CloudFormation Manifest, so both assemble into a single stack.
- `release-two-stacks.yaml` — the same intent split across two boundaries, so
  the server's reference to the database crosses a stack edge.
- `.aggrega-config.yaml` — names the hub registry the standard-library catalog
  resolves from.

The entities this example uses all live in that catalog. Nothing is copied in
beside the release files.

## What the server asks for

The server declares one edge, on a socket it names `database`, and asks for
four of the entries the database publishes, under the environment variable
names its own configuration reads:

```yaml
    api:
      type: core/compute/server
      uses:
        database:
          db:
            target: db
            inject:
              env:
                - in: DB_HOST
                  from: host
                - in: DB_PORT
                  from: port
                - in: DB_USER
                  from: user
                - in: DB_NAME
                  from: database
```

`core/compute/server` declares no socket of its own, so `database` is an
ad-hoc one: the edge carries no selector and no inject allowlist, and each
`from:` key must still be one the database publishes — see
[adhoc-uses-socket](../adhoc-uses-socket/) for that contract. The Aggregate
never names an address, a port number, or a cloud provider, and it is the same
file for all three builds below.

## What the operator supplies

Each Release names, under `infra.overrides`, things the operator already runs
and the Recipes read: the RDS DB subnet group and the database's security
groups, and the ECS cluster, the subnets and security groups the tasks attach
to, and the execution role ECS pulls the image and writes logs with. The
server's image is `infra.image`. Both server Recipes require the image, the
cluster, the subnets, the security groups and the execution role, and the
Terraform database Recipe requires the subnet group: a build missing one halts,
naming the key, rather than choosing a network or a role for you.

**Every one of those values is a placeholder** — `123456789012` is the account
number AWS documentation uses in examples, and `example-cluster`,
`example-private-db-subnets`, the `subnet-…` and `sg-…` IDs, the role and
`registry.example.com/orders-api:1.0.0` stand for resources in your own account.
The build accepts them because it never looks them up; replace them before you
plan or deploy.

The Terraform Recipes read their keys in the catalog's terraform spelling
(`subnet_group`, `subnet_ids`, `vpc_security_groups`, `cluster`,
`execution_role_arn`); the CloudFormation Recipes read them under the resource
properties' own names (`DBSubnetGroupName`, `VPCSecurityGroups`, `Cluster`,
`Subnets`, `SecurityGroups`, `ExecutionRoleArn`), so the same operator values are
spelled differently on the two targets.

## Build

This example ships three releases, so name the one you want. One release builds
per run. In a fresh copy, pass `--auto-pull` the first time each release is
built, so its lockfile is filled during the build. The first Terraform build
fetches the RDS module from its git repository, at the commit the Recipe's own
pin records:

```bash
aggrega build --release release-terraform.yaml --auto-pull
```

It prints, with `<workspace>` standing for this example's folder:

```
Pull complete: release-terraform.lock (entities=11, source_artifacts=1, external_inputs=0)
Total build time:               9.4s
Build completed: 151 files written to <workspace>/dist
```

Once the lockfile exists, the plain command builds against it:

```bash
aggrega build --release release-terraform.yaml
```

```
Total build time:               5.7s
Build completed: 151 files written to <workspace>/dist
```

## One Terraform root configuration

The boundary's root configuration lands at
`dist/one-root/terraform/aggrega.modules.tf`, and each component's own files sit
in the directory its `module` block points at: the vendored RDS module under
`modules/db/`, and the server's ECS module, kept beside its Recipe in the
catalog, under `modules/api/`. The whole root configuration:

```hcl
# Root configuration for this boundary. Each component rendered here is one
# module block below, and the directory that block points at holds that
# component's own files. One configuration means one dependency graph, which is
# what lets a reference or a depends_on reach from one component to another.

module "api" {
  source = "./modules/api"

  assign_public_ip   = false
  cluster            = "example-cluster"
  cpu                = "256"
  desired_count      = 2
  environment        = {"DB_HOST":"${module.db.db_instance_address}","DB_NAME":"orders","DB_PORT":"5432","DB_USER":"orders_admin"}
  execution_role_arn = "arn:aws:iam::123456789012:role/example-ecs-task-execution"
  image              = "registry.example.com/orders-api:1.0.0"
  memory             = "512"
  name               = "api"
  port               = 8080
  security_groups    = ["sg-0fedcba9876543210"]
  subnet_ids         = ["subnet-0123456789abcdef0","subnet-0fedcba9876543210"]
}

module "db" {
  source = "./modules/db"

  allocated_storage           = 50
  backup_retention_period     = 14
  create_db_subnet_group      = false
  db_name                     = "orders"
  db_subnet_group_name        = "example-private-db-subnets"
  engine                      = "postgres"
  engine_version              = "16"
  family                      = "postgres16"
  identifier                  = "db"
  instance_class              = "db.t3.small"
  manage_master_user_password = true
  multi_az                    = true
  port                        = "5432"
  skip_final_snapshot         = false
  storage_type                = "gp3"
  username                    = "orders_admin"
  vpc_security_group_ids      = ["sg-0123456789abcdef0"]
}
```

The server's `environment` argument carries the four values the edge asked
for. `DB_HOST` is `${module.db.db_instance_address}`: the database Recipe
publishes a reference to the RDS module's own `db_instance_address` output
through the module call this same root declares as `module "db"`, so Terraform
evaluates it here, at plan and apply time, and the server's module receives the
instance's address as an ordinary input. The other three are plain text the
compiler knew ahead of time — the port the Release configures and the two names
the Aggregate wrote.

This works because the server's Recipe is a `source:` Recipe: its mapping
becomes the arguments of the server's `module` block, which is the one position
Terraform evaluates in a scope where the neighbour's module is declared — see
[Consuming another component's published value](../../providers/terraform.md#consuming-another-components-published-value)
and [A worked pair](../../providers/terraform.md#a-worked-pair) for the
mechanics, and for what goes wrong when a consumer writes the reference
anywhere else. For the same reason, plan this directory — the one holding
`aggrega.modules.tf` — rather than either module directory on its own.

On a scratch copy of that directory, `tofu init -backend=false` loads the root
and the vendored modules from disk and fetches only providers:

```text
Initializing modules...
- api in modules/api
- db in modules/db
- db.db_instance in modules/db/modules/db_instance
- db.db_instance_role_association in modules/db/modules/db_instance_role_association
- db.db_option_group in modules/db/modules/db_option_group
- db.db_parameter_group in modules/db/modules/db_parameter_group
- db.db_subnet_group in modules/db/modules/db_subnet_group
[… omitted: provider installation, whose versions move with the registry, and OpenTofu's closing advice]
```

and `tofu validate` then prints:

```text
Success! The configuration is valid.
```

## One CloudFormation stack

```bash
aggrega build --release release-one-stack.yaml --auto-pull
```

```
Pull complete: release-one-stack.lock (entities=11, source_artifacts=0, external_inputs=0)
Total build time:               6.2s
Build completed: 1 files written to <workspace>/dist
```

The assembled stack lands at
`dist/one-stack/cloudformation/cloudformation-stack.json`, holding three
resources: `Db`, the RDS instance; `Api`, the ECS service; and
`ApiTaskDefinition`, the task definition it runs. The container's environment in
`ApiTaskDefinition`:

```json
            "Environment": [
              {
                "Name": "DB_HOST",
                "Value": {
                  "Fn::GetAtt": [
                    "Db",
                    "Endpoint.Address"
                  ]
                }
              },
              {
                "Name": "DB_NAME",
                "Value": "orders"
              },
              {
                "Name": "DB_PORT",
                "Value": "5432"
              },
              {
                "Name": "DB_USER",
                "Value": "orders_admin"
              }
            ],
```

`DB_HOST` is an `Fn::GetAtt` on the instance's `Endpoint.Address`, against the
logical ID `Db` that the database Recipe derives from the component name `db`.
CloudFormation resolves it when it creates the stack, and because the server's
task definition reads an attribute of `Db`, it creates the instance first. See
[Intra-stack references](../../providers/cloudformation.md#intra-stack-references).

## Two CloudFormation stacks

```bash
aggrega build --release release-two-stacks.yaml --auto-pull
```

```
Pull complete: release-two-stacks.lock (entities=11, source_artifacts=0, external_inputs=0)
Total build time:               6.2s
Build completed: 2 files written to <workspace>/dist
```

Nothing in `aggregate.yaml` changes. The Release places the database in the
`data` boundary and the server in the `app` boundary, so each assembles into a
stack of its own, and the server's edge to the database crosses from one stack
to the other. The database's
stack, `dist/two-stacks-data/cloudformation/cloudformation-stack.json`,
publishes each entry the edge consumes as an output with an `Export`. Its
`Outputs`:

```json
  "Outputs": {
    "dbXXdatabase": {
      "Value": "orders",
      "Export": {
        "Name": "aggrega--orders-two-stacks--two-stacks-data-zscloudformation--db--database"
      }
    },
    "dbXXhost": {
      "Value": {
        "Fn::GetAtt": [
          "Db",
          "Endpoint.Address"
        ]
      },
      "Export": {
        "Name": "aggrega--orders-two-stacks--two-stacks-data-zscloudformation--db--host"
      }
    },
    "dbXXport": {
      "Value": "5432",
      "Export": {
        "Name": "aggrega--orders-two-stacks--two-stacks-data-zscloudformation--db--port"
      }
    },
    "dbXXprotocol": {
      "Value": "postgres"
    },
    "dbXXuser": {
      "Value": "orders_admin",
      "Export": {
        "Name": "aggrega--orders-two-stacks--two-stacks-data-zscloudformation--db--user"
      }
    }
  },
```

`protocol` is published too, and carries no `Export` because no edge reads it.
The server's stack, `dist/two-stacks-app/cloudformation/cloudformation-stack.json`,
reads each of the four back by the same name:

```json
            "Environment": [
              {
                "Name": "DB_HOST",
                "Value": {"Fn::ImportValue":"aggrega--orders-two-stacks--two-stacks-data-zscloudformation--db--host"}
              },
              {
                "Name": "DB_NAME",
                "Value": {"Fn::ImportValue":"aggrega--orders-two-stacks--two-stacks-data-zscloudformation--db--database"}
              },
              {
                "Name": "DB_PORT",
                "Value": {"Fn::ImportValue":"aggrega--orders-two-stacks--two-stacks-data-zscloudformation--db--port"}
              },
              {
                "Name": "DB_USER",
                "Value": {"Fn::ImportValue":"aggrega--orders-two-stacks--two-stacks-data-zscloudformation--db--user"}
              }
            ],
```

Each export name joins the Release name, the producer boundary's output
directory, the component and the entry, so it is fixed at build time and the
consumer can name it before either stack exists. Neither Release here declares
an account or a region, so the read is a same-account `Fn::ImportValue`. How
the name is built, and when the consumer reads across accounts instead, is set
out in [Cross-stack wiring](../../providers/cloudformation.md#cross-stack-wiring).
An import resolves only against an export that already exists, so the
database's stack is created before the server's; ordering the two stacks is
the operator's, outside the build.

## The password is RDS's own

The Aggregate names the database's user and nothing about its password, and no
Release attaches a credential to the database. On both targets the Recipe the
Manifest selects hands the password to RDS: `manage_master_user_password = true`
on the module block above, and `ManageMasterUserPassword` on the instance in
each stack. The database's `Properties` in the one-stack template:

```json
      "Properties": {
        "AllocatedStorage": 50,
        "BackupRetentionPeriod": 14,
        "DBInstanceClass": "db.t3.small",
        "DBName": "orders",
        "DBSubnetGroupName": "example-private-db-subnets",
        "Engine": "postgres",
        "EngineVersion": "16",
        "ManageMasterUserPassword": true,
        "MasterUsername": "orders_admin",
        "MultiAZ": true,
        "Port": 5432,
        "StorageType": "gp3",
        "VPCSecurityGroups": [
          "sg-0123456789abcdef0"
        ]
      },
```

RDS generates the administrator password when it creates the instance and keeps it in
AWS Secrets Manager. No build input carries a password, so none of the three
builds writes one into any file. The server receives the user's name and not
its password; reading the password from Secrets Manager is left to the code
the server's image runs.

## The backup is an attachment

RDS backs the instance up itself and keeps each automated backup for 7 days
when nothing says otherwise. Each Release keeps them for 14 by attaching
`core/backup` to the database, on its entry for `db`:

```yaml
        db:
          features:
            backup:
              type: core/backup
              infra:
                retention_days: 14
```

Each Manifest binds the Feature to the FeatureRecipe for its target,
`terraform/backup-native` or `cloudformation/backup-native`, and neither
renders anything: the backup is a setting of the instance, so the database
Recipe reads the attachment and writes the retention where the instance is
written — `backup_retention_period = 14` on the module block, and
`"BackupRetentionPeriod": 14` in the instance's `Properties` above. That is
why the one-stack template holds exactly three resources.

## Building is not deploying

Each build writes files under `dist/` and stops. It never runs Terraform,
OpenTofu or CloudFormation, never authenticates against AWS, and looks up none
of the identifiers the Releases name. Planning and applying the root
configuration, and creating the stacks, are steps you take on the output, with
your own credentials, after replacing the placeholders.

## Identical input, identical output

Building twice from unchanged inputs produces byte-identical output, for each of
the three releases. The compiler resolves no live data, so a rebuild has nothing
to discover that could move the bytes. That is the property a diff-based review
relies on.

`dist/`, `.aggrega/` and the `*.lock` files are generated and are not committed;
they regenerate from the files that are.
