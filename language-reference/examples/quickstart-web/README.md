---
example:
  level: start
  products: [core/datastore/postgres, core/datastore/redis]
  shows: [connections, credentials, features, cloud-infrastructure, external-sources]
---

# A web app with PostgreSQL, built up one step at a time

A small web application that keeps notes in PostgreSQL, grown in four steps:
it starts with its database on your machine, gains a Redis cache, moves to AWS
with the database on Amazon RDS, and finally gets its backups. Each step is a
complete workspace of its own, in the directories `1/` to `4/`, and each one
builds as it stands.

Every `aggregate.yaml` opens with a one-line comment naming its step, and so
does a `release.yaml` or a `manifest.yaml` where that step changes it.
Comparing a file with the previous step's shows exactly what the step adds:

```sh
diff 1/aggregate.yaml 2/aggregate.yaml
```

The application is `hub.aggrega.ai/tools/quickstart-web:1.0.0`, under the
Apache-2.0 licence. It reads its configuration from its environment alone:
`PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` and `PGDATABASE` for PostgreSQL, and
`REDIS_HOST` and `REDIS_PORT` for a cache, which it uses only while
`REDIS_HOST` is set. It listens on port 8080, and every answer about a note
says where the note was read from, in its `source` field, so the cache is
visible from outside.

Output blocks on this page are copied from a real run, per
[Reading the output on these pages](../reading-the-output.md).

## What you need

- The `aggrega` CLI, for every step.
- Docker with Compose, for `1/` and `2/`, which run on your machine.
- Nothing more for `3/` and `4/`: they build Terraform files and stop. The
  first build of each fetches the RDS and ElastiCache modules from their git
  repositories. Planning and applying those files is a separate act, done with
  your own AWS account and credentials once the placeholders are replaced.

## Build

The commands below start the first step, from this example's directory. The
password is yours to choose: Docker Compose reads it from your shell when the
stack starts, so no file holds it.

```sh
cd 1
aggrega build --release release.yaml --auto-pull
export QUICKSTART_DB_PASSWORD=choose-a-password
docker compose -p quickstart-web -f dist/compose/docker-compose.yaml up -d --wait
```

The build writes one file, `dist/compose/docker-compose.yaml`, and
`docker compose` starts it under the project name `quickstart-web` and returns
once both services are up. Each section below takes one step further.

## A web app and its PostgreSQL — `1/`

The Aggregate declares two components: `web`, of type `core/compute/server`,
and `db`, of type `core/datastore/postgres`. The application asks for the
database on an edge, under the names it reads:

```yaml
      uses:
        database:
          db:
            target: db
            inject:
              env:
                - in: PGHOST
                  from: host
                - in: PGPORT
                  from: port
                - in: PGUSER
                  from: user
                - in: PGDATABASE
                  from: database
```

The password reaches both ends through a `core/secret-value` attachment on
each, whose origin is the Compose variable reference
`${QUICKSTART_DB_PASSWORD}`. The Release names the image, pinned by the digest
of its multi-platform index, and the port. The `web` service in
`dist/compose/docker-compose.yaml`:

```yaml
  web:
    image: hub.aggrega.ai/tools/quickstart-web:1.0.0@sha256:cf87f67716c9c6fea961aceba636ca349e47af3900817f38090106647794e8d7
    environment:
      PGDATABASE: appdb
      PGHOST: db
      PGPASSWORD: ${QUICKSTART_DB_PASSWORD}
      PGPORT: "5432"
      PGUSER: appuser
    ports:
      - 127.0.0.1:8080:8080
    [… omitted: the aggrega.ai/ labels every service carries]
    networks:
      - compose
    depends_on:
      - db
    deploy:
      resources:
        limits:
          cpus: "0.1"
          memory: "134217728"
        reservations:
          cpus: "0.1"
          memory: "134217728"
```

`PGHOST` is `db`, the database's service name on the Compose network, and the
port is published on your machine's loopback address alone. Ask the
application what it is connected to, then store a note and read it back:

```sh
curl -s http://localhost:8080/
curl -s -X POST --data 'hello from the quickstart' http://localhost:8080/notes
curl -s http://localhost:8080/notes/1
```

```json
{
  "cache": "not wired",
  "database": "postgresql at db:5432/appdb",
  "service": "quickstart-web"
}
{
  "id": 1,
  "text": "hello from the quickstart",
  "created_at": "2026-11-01T17:22:34.261989Z",
  "source": "postgresql"
}
{
  "id": 1,
  "text": "hello from the quickstart",
  "created_at": "2026-11-01T17:22:34.261989Z",
  "source": "postgresql"
}
```

## Add a cache — `2/`

The Aggregate adds a `cache` component of type `core/datastore/redis`, and one
more edge on the application:

```yaml
        cache:
          cache:
            target: cache
            inject:
              env:
                - in: REDIS_HOST
                  from: host
                - in: REDIS_PORT
                  from: port
```

The Manifest maps the new type to `compose/redis`, and the Release places the
new component. Build and start it under the same project name, with the same
password still exported:

```sh
cd ../2
aggrega build --release release.yaml --auto-pull
docker compose -p quickstart-web -f dist/compose/docker-compose.yaml up -d --wait
```

Docker Compose leaves the database running, recreates the application with its
two new variables, and starts the cache. The database was created with the
password you exported at `1/` and keeps it, so keep the same value for this
step. The note stored at `1/` is still there; read it twice:

```sh
curl -s http://localhost:8080/
curl -s http://localhost:8080/notes/1
curl -s http://localhost:8080/notes/1
```

```json
{
  "cache": "cache:6379",
  "database": "postgresql at db:5432/appdb",
  "service": "quickstart-web"
}
{
  "id": 1,
  "text": "hello from the quickstart",
  "created_at": "2026-11-01T17:22:34.261989Z",
  "source": "postgresql"
}
{
  "id": 1,
  "text": "hello from the quickstart",
  "created_at": "2026-11-01T17:22:34.261989Z",
  "source": "cache"
}
```

The first read comes from PostgreSQL and fills the cache; the second comes from
the cache, which keeps a note for five minutes. When you are done with the
stack, remove it, with the database's data:

```sh
docker compose -p quickstart-web -f dist/compose/docker-compose.yaml down -v
```

## Same database, managed on AWS — `3/`

The same three components, on AWS, through Terraform. The Manifest maps the
server to `terraform/server-ecs`, an Amazon ECS service on Fargate; PostgreSQL
to `terraform/postgres-rds-terraform-aws-modules`, which vendors the
terraform-aws-modules project's published RDS module; and Redis to
`terraform/redis-elasticache`, which vendors its ElastiCache module. The edges
in the Aggregate do not change.

What the Aggregate drops is the two password attachments: RDS generates the
database's password itself, so no build input carries one. On AWS, RDS keeps
the password in AWS Secrets Manager, and the quickstart application, which
reads its password only from `PGPASSWORD`, cannot sign in until you supply it.

The Release names, under `infra.overrides`, what you already run in your
account: the ECS cluster, the subnets and security groups the tasks attach to,
the execution role ECS pulls the image and writes logs with, and the RDS and
ElastiCache subnet groups. It also sets the cache's `engine_version` to `7.1`,
because ElastiCache runs Redis OSS up to 7.1. **Every one of those values is a
placeholder**: `123456789012` is the account number AWS documentation uses in
examples, and the `subnet-…` and `sg-…` IDs, the subnet groups, the cluster and
the role stand for resources in your own account. The build accepts them
because it never looks them up; replace them before you plan.

```sh
cd ../3
aggrega build --release release.yaml --auto-pull
```

The root configuration, `dist/terraform/aggrega.modules.tf`:

```hcl
# Root configuration for this boundary. Each component rendered here is one
# module block below, and the directory that block points at holds that
# component's own files. One configuration means one dependency graph, which is
# what lets a reference or a depends_on reach from one component to another.

module "cache" {
  source = "./modules/cache"

  create_security_group      = false
  create_subnet_group        = false
  engine                     = "redis"
  engine_version             = "7.1"
  node_type                  = "cache.t3.small"
  port                       = 6379
  replication_group_id       = "cache"
  security_group_ids         = ["sg-0123456789abcdef1"]
  subnet_group_name          = "example-private-cache-subnets"
  transit_encryption_enabled = false
}

module "db" {
  source = "./modules/db"

  allocated_storage           = 10
  backup_retention_period     = 7
  create_db_subnet_group      = false
  db_name                     = "appdb"
  db_subnet_group_name        = "example-private-db-subnets"
  engine                      = "postgres"
  engine_version              = "16"
  family                      = "postgres16"
  identifier                  = "db"
  instance_class              = "db.t3.small"
  manage_master_user_password = true
  multi_az                    = false
  port                        = "5432"
  skip_final_snapshot         = false
  storage_type                = "gp3"
  username                    = "appuser"
  vpc_security_group_ids      = ["sg-0123456789abcdef0"]
}

module "web" {
  source = "./modules/web"

  assign_public_ip   = false
  cluster            = "example-cluster"
  cpu                = "256"
  desired_count      = 1
  environment        = {"PGDATABASE":"appdb","PGHOST":"${module.db.db_instance_address}","PGPORT":"5432","PGUSER":"appuser","REDIS_HOST":"${module.cache.replication_group_primary_endpoint_address}","REDIS_PORT":"6379"}
  execution_role_arn = "arn:aws:iam::123456789012:role/example-ecs-task-execution"
  image              = "hub.aggrega.ai/tools/quickstart-web:1.0.0@sha256:cf87f67716c9c6fea961aceba636ca349e47af3900817f38090106647794e8d7"
  memory             = "512"
  name               = "web"
  port               = 8080
  security_groups    = ["sg-0fedcba9876543210"]
  subnet_ids         = ["subnet-0123456789abcdef0","subnet-0fedcba9876543210"]
}
```

The application receives the same names as on Compose. `PGHOST` and
`REDIS_HOST` are now references to the RDS and ElastiCache modules' own
outputs, which Terraform resolves when it applies the configuration, because
neither address exists before the instance and the cache are created; the
compiler pipes both through without reading them. On a copy of `dist/terraform`,
`tofu init -backend=false` loads the root and the vendored modules and fetches
only providers, and `tofu validate` then prints:

```text
Success! The configuration is valid.
```

## Add backups — `4/`

RDS keeps the instance's automated backups for 7 days, in a window it chooses,
when nothing says otherwise — `backup_retention_period = 7` above. The Release
attaches `core/backup` to the database:

```yaml
    db:
      features:
        backup:
          type: core/backup
          infra:
            retention_days: 14
            schedule: "30 2 * * *"
```

and the Manifest binds the Feature to `terraform/backup-native`, which renders
nothing of its own: the backup is a setting of the instance, so the database
Recipe reads the attachment and writes it on the instance's module block. RDS
takes one automated backup a day, so the schedule opens a 30-minute window at
that time, in UTC. The Aggregate does not change.

```sh
cd ../4
aggrega build --release release.yaml --auto-pull
```

The root configuration differs from the one at `3/` in the `db` module block
alone, and `tofu validate` on it prints `Success! The configuration is valid.`
as well:

```diff
-  backup_retention_period     = 7
+  backup_retention_period     = 14
+  backup_window               = "02:30-03:00"
```

## Building is not deploying

`3/` and `4/` write files under `dist/` and stop. The build never runs
Terraform or OpenTofu, never authenticates against AWS, and looks up none of
the identifiers the Releases name. Planning and applying are steps you take on
the output, with your own credentials, after replacing the placeholders.

## Checking every step

In a checkout of the documentation repository, which holds the shared build
helper a copy written by `aggrega scaffold --example` does not carry,
`./check.sh` in this directory builds the four steps and checks that each
writes what this page shows: the two Compose files with their services and
variables, and the two Terraform root configurations with their module blocks,
their references and their backup settings. It prints one line per step and
exits non-zero if any step differs. `dist/`, `.aggrega/` and the `*.lock` files
are generated and are not committed; they regenerate from the files that are.
