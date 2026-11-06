---
example:
  level: start
  products: [core/datastore/postgres, core/storage/s3-object-store, core/storage/velero, core/storage/barman-cloud-plugin]
  shows: [features, multi-target, recipe-selection, connections, parameters, guardrails, cloud-infrastructure]
---

# A datastore backed up on every target: one core/backup attachment

A PostgreSQL database backed up on Kubernetes through Velero and through
CloudNativePG, and on AWS through Amazon RDS's own automated backups, on
Terraform and on CloudFormation, and through AWS Backup, from one `core/backup`
attachment the operator writes in each Release, with the refusal on a target
that has no backup product.

`core/backup` says that a datastore is backed up on a schedule and that each
backup is kept for a number of days. It says nothing about how: each target's
Manifest binds the FeatureRecipe that realizes it there, and each one writes the
backup in its own product's terms — a Velero schedule, a CloudNativePG scheduled
backup, the settings of an RDS instance, an AWS Backup plan. A target with no
product to realize it refuses the attachment by name, so the build halts rather
than deploying the datastore without the backup written for it.

This workspace builds one Aggregate through six Releases, each attaching the
same backup: every day at 02:30, each backup kept for 14 days. The page shows
what each target renders for it in the five that complete, and quotes what the
sixth, which is expected to halt, prints.

## What it builds

| instance | catalog Component | where it runs |
|---|---|---|
| `db` | `core/datastore/postgres` | every Release |
| `backups` | `core/storage/s3-object-store` | the two Kubernetes Releases: the bucket the backups go to |
| `velero` | `core/storage/velero` | the Velero Release |
| `barman-cloud` | `core/storage/barman-cloud-plugin` | the CloudNativePG Release |

The Aggregate declares the database and what a backup of it needs on
Kubernetes: a bucket, and the two backup controllers. A backup controller is
installed once per cluster rather than with the database, so it is a component
of its own; on AWS the backups stay in the managed service's own storage, and none of the
three is wanted there. One parameter, `backup_controller`, switches them, through
each component's `active:` toggle:

```yaml
# aggregate.yaml
spec:
  parameters:
    [… omitted: the comment above the parameter]
    backup_controller:
      type: string
      default: none
      [… omitted: the parameter's description]
  components:
    [… omitted: the comment above each component]
    db:
      type: core/datastore/postgres

    backups:
      type: core/storage/s3-object-store
      active: '{{ ne .parameters.backup_controller "none" }}'
      values:
        bucket: db-backups

    velero:
      type: core/storage/velero
      active: '{{ eq .parameters.backup_controller "velero" }}'

    barman-cloud:
      type: core/storage/barman-cloud-plugin
      active: '{{ eq .parameters.backup_controller "cloudnative-pg" }}'
```

A component whose toggle reads `false` is removed before anything is built, so
the AWS and Docker Compose Releases, which leave the parameter at `none`, build
the database alone.

## The attachment

The developer writes nothing for the backup: `db` carries no attachment in the
Aggregate. The operator attaches `core/backup` to it in each Release, under the
component's `features`, and says there when the backup runs and how long each
one is kept. On Kubernetes the attachment also names where the backups go,
through its `store` connection to the bucket:

```yaml
# release-helm-velero.yaml
  components:
    db:
      annotations:
        aggrega.ai/namespace: orders
      [… omitted: the comment above the attachment]
      features:
        backup:
          type: core/backup
          infra:
            schedule: "30 2 * * *"
            retention_days: 14
          uses:
            store:
              bucket:
                target: backups
```

The AWS Releases write the same attachment with no `store` connection, because
RDS and AWS Backup keep their backups in storage of their own, and the
realizations there refuse a connection to a bucket nothing would write to. The
AWS Backup Release adds `infra.role_arn`, the IAM role AWS Backup runs each
backup under.

## The six Releases

| Release | Manifest | `core/backup` realized by | the build |
|---|---|---|---|
| `release-helm-velero.yaml` | `manifest-helm-velero.yaml` | `helm/backup-velero` | completes |
| `release-helm-cloudnative-pg.yaml` | `manifest-helm-cloudnative-pg.yaml` | `helm/backup-cloudnative-pg` | completes |
| `release-terraform.yaml` | `manifest-terraform.yaml` | `terraform/backup-native` | completes |
| `release-cloudformation.yaml` | `manifest-cloudformation.yaml` | `cloudformation/backup-native` | completes |
| `release-terraform-aws-backup.yaml` | `manifest-terraform-aws-backup.yaml` | `terraform/backup-aws-backup` | completes |
| `release-compose.yaml` | `manifest-compose.yaml` | nothing | halts |

The Manifest decides which product backs the database up. The two Kubernetes
Manifests run the database two ways — `helm/postgres`, a StatefulSet, for
Velero, and `helm/postgres-cloudnative-pg`, a CloudNativePG Cluster, for the
plugin — and bind the backup's realization for each. `manifest-terraform.yaml`
and `manifest-terraform-aws-backup.yaml` map the database to the same Recipe and
differ in the FeatureRecipe they bind to `core/backup`, and the Releases built
from them differ, beside the Manifest each names, in the role alone.

The Kubernetes Releases also attach the bucket's own key pair, and the
credentials file Velero signs its requests with, as `core/referenced-secret`
attachments naming Secrets the cluster already holds, so no key is written into
any rendered file. Every account-specific value in the AWS Releases is a
placeholder.

## Building it

The workspace reads the standard-library catalog from the hub registry
`.aggrega-config.yaml` names. Velero and the Barman Cloud plugin
are installed through their projects' own charts, so the two Kubernetes
Releases need those projects' chart repositories reachable from the build;
every other Release renders from the catalog alone.

```bash
aggrega build --release release-helm-velero.yaml --auto-pull  # one Release
```

In a checkout of the documentation repository, which holds the shared build
helper a copy written by `aggrega scaffold --example` does not carry,
`./check.sh` builds all six Releases and checks each outcome. It prints one line
per Release and exits 0 only when each ended as this page describes:

```text
RELEASE                              EXIT  EXPECTED  VERDICT
----------------------------------------------------------------------------------------------------
release-helm-velero.yaml             0     complete  OK: completed, the backup the README shows
release-helm-cloudnative-pg.yaml     0     complete  OK: completed, the backup the README shows
release-terraform.yaml               0     complete  OK: completed, the backup the README shows
release-cloudformation.yaml          0     complete  OK: completed, the backup the README shows
release-terraform-aws-backup.yaml    0     complete  OK: completed, the backup the README shows
release-compose.yaml                 1     halt      OK: halted with the expected refusal

check: every build ended as expected.
```

## Kubernetes, with Velero

`release-helm-velero.yaml` writes the database's StatefulSet and Services, the
bucket's, the objects Velero's own chart renders, and one file for the
attachment, holding a Velero storage location and a schedule:

```yaml
# dist/helm/db--backup--backup.yaml
apiVersion: velero.io/v1
kind: BackupStorageLocation
metadata:
  [… omitted: the labels and annotations the build writes on every resource]
  name: "orders-db-backup"
  namespace: velero
spec:
  provider: velero.io/aws
  objectStorage:
    bucket: "db-backups"
    prefix: "orders-db-backup"
  config:
    region: "us-east-1"
    s3Url: "http://backups-default.orders:8333"
    s3ForcePathStyle: "true"
---
apiVersion: velero.io/v1
kind: Schedule
metadata:
  [… omitted: the labels and annotations, as on the storage location]
  name: "orders-db-backup"
  namespace: velero
spec:
  schedule: "30 2 * * *"
  template:
    includedNamespaces:
      - "orders"
    orLabelSelectors:
      - matchLabels:
          "app": "db"
    storageLocation: "orders-db-backup"
    ttl: "336h0m0s"
    snapshotVolumes: false
    defaultVolumesToFsBackup: true
```

Both sit in the namespace `velero`, the only one Velero reads its schedules
from, and are named after the database's namespace, its name and the
attachment's, since every Release on the cluster writes into that one
namespace. The schedule selects the database's pods by the labels of the
StatefulSet the database renders, in the namespace it is placed in, and Velero's
node agent copies the files of their volumes into the bucket. The bucket's
address is the one the `backups` component publishes, with its Service name
qualified by the namespace it runs in, because Velero runs in another, and the
region is the bucket's too: SeaweedFS, which runs it here, reads none and
publishes `us-east-1`. The 14 days are Velero's time to live, in hours.

## Kubernetes, with CloudNativePG

`release-helm-cloudnative-pg.yaml` writes the database as a CloudNativePG
Cluster, the bucket, the objects the plugin's chart renders, and the
attachment's file, holding the plugin's object store and a scheduled backup,
beside the Cluster in its own namespace:

```yaml
# dist/helm/db--backup--backup.yaml
apiVersion: barmancloud.cnpg.io/v1
kind: ObjectStore
metadata:
  [… omitted: the labels and annotations the build writes on every resource]
  name: "db-backup"
  namespace: "orders"
spec:
  configuration:
    destinationPath: "s3://db-backups/orders/db-backup"
    endpointURL: "http://backups-default.orders:8333"
    s3Credentials:
      accessKeyId:
        name: "db-backup"
        key: "ACCESS_KEY_ID"
      secretAccessKey:
        name: "db-backup"
        key: "ACCESS_SECRET_KEY"
  retentionPolicy: "14d"
  instanceSidecarConfiguration:
    env:
      - name: "AWS_DEFAULT_REGION"
        value: "us-east-1"
---
apiVersion: postgresql.cnpg.io/v1
kind: ScheduledBackup
metadata:
  [… omitted: the labels and annotations, as on the object store]
  name: "db-backup"
  namespace: "orders"
spec:
  schedule: "0 30 2 * * *"
  cluster:
    name: "db"
  method: "plugin"
  pluginConfiguration:
    name: "barman-cloud.cloudnative-pg.io"
```

A CloudNativePG schedule has six fields, the first for seconds, so the
attachment's `30 2 * * *` is written with `0` before it. The plugin signs its
requests with the key pair in the Secret the object store names, `db-backup`
here, after the object store itself, since the attachment sets no
`infra.credentials_secret`.

The database's own Recipe reads the attachment too, and names the plugin as the
Cluster's write-ahead-log archiver:

```yaml
# dist/helm/db/cluster.yaml
[… omitted: apiVersion, kind and metadata]
spec:
  [… omitted: the instance count, the image, the storage and the resources]
  plugins:
    - name: "barman-cloud.cloudnative-pg.io"
      isWALArchiver: true
      parameters:
        barmanObjectName: "db-backup"
  [… omitted: the bootstrap settings]
```

So the log is archived into the bucket continuously, between the daily base
backups, and a restore can reach any moment of the 14 days: CloudNativePG's
point-in-time recovery, which this realization keeps on.

## Terraform

`release-terraform.yaml` writes the database's module and nothing else. The
attachment's realization, `terraform/backup-native`, renders no file: the
backup is a setting of the RDS instance, so the database's Recipe reads the
attachment and writes it where the instance is written:

```hcl
# dist/terraform/modules/db/main.tf
[… omitted: the provenance comment, the provider requirement, and the instance's engine, compute, storage, database and HA arguments]
  ## ── Backup ───────────────────────────────────────────────
  backup_retention_period = 14
  backup_window           = "02:30-03:00"
[… omitted: the subnet group and security groups, and the address output]
```

RDS takes one daily start time rather than a cron expression, so `30 2 * * *`
becomes a backup window opening at 02:30 UTC and lasting 30 minutes, the
shortest RDS takes.

## CloudFormation

`release-cloudformation.yaml` writes one stack template holding the instance,
with the same two settings under their CloudFormation property names:

```json
# dist/cloudformation/cloudformation-stack.json
[… omitted: the template's format version, the outputs carrying what the database publishes, and the opening of its resources]
    "Db": {
      [… omitted: the deletion policy and the provenance metadata]
      "Properties": {
        "AllocatedStorage": 10,
        "BackupRetentionPeriod": 14,
        "DBInstanceClass": "db.t3.small",
        [… omitted: the database name, the subnet group, the engine and the credentials settings]
        "MultiAZ": false,
        "Port": 5432,
        "PreferredBackupWindow": "02:30-03:00",
        [… omitted: the storage type and the security groups]
      },
      "Type": "AWS::RDS::DBInstance"
    }
[… omitted: the closing of the resources and of the template]
```

## AWS Backup

`release-terraform-aws-backup.yaml` is built from a Manifest binding
`terraform/backup-aws-backup` instead. This realization writes a module of the
attachment's own beside the database's, holding a backup vault, a plan and a
selection naming the instance:

```hcl
# dist/terraform/modules/db--backup/backup.tf
[… omitted: the provenance comment, the provider requirement, and the partition, Region and account lookups]
resource "aws_backup_vault" "backup" {
  name = "db-backup"
}

resource "aws_backup_plan" "backup" {
  name = "db-backup"

  rule {
    rule_name         = "db-backup"
    target_vault_name = aws_backup_vault.backup.name
    schedule          = "cron(30 2 * * ? *)"
    start_window      = 60

    lifecycle {
      delete_after = 14
    }
  }
}

resource "aws_backup_selection" "backup" {
  name         = "db-backup"
  plan_id      = aws_backup_plan.backup.id
  iam_role_arn = "arn:aws:iam::123456789012:role/example-backup"

  resources = [
    "arn:${data.aws_partition.current.partition}:rds:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:db:db",
  ]
}
```

The schedule is written in AWS's own cron form, read in UTC, and a backup that
has not started within an hour of its time is not started. The instance's ARN is
a Terraform expression composed from what the AWS provider is configured for
when it plans, and the instance's name; the role is the one the Release names,
passed through as written.

The instance keeps its own automated backups beside AWS Backup's, as it does
with no attachment: for 7 days, in a window RDS chooses, since the attachment's
schedule is AWS Backup's rather than the instance's:

```hcl
# dist/terraform/modules/db/main.tf
[… omitted: the provenance comment, the provider requirement, and the instance's engine, compute, storage, database and HA arguments]
  ## ── Backup ───────────────────────────────────────────────
  backup_retention_period = 7
[… omitted: the subnet group and security groups, and the address output]
```

`infra.keep_automated_backups: false` on the attachment turns those off and
leaves AWS Backup's as the instance's only backups.

## What the build does not do

The build writes files and stops. It runs no backup and reaches no cluster, no
bucket and no AWS API. It resolves no ARN, account or Region: on AWS each is an
expression or a value the Release wrote, which Terraform, CloudFormation or AWS
reads when the files are applied. It checks nothing in the cluster either:

- Velero's schedule runs only where Velero is deployed, and the plugin's
  backups only where the plugin, the CloudNativePG operator (1.26 or later) and
  cert-manager run. This workspace deploys Velero and the plugin; the operator
  and cert-manager are assumed to be there already.
- The Secrets the Kubernetes Releases name are the cluster's to hold, in the
  namespace each is read from: `backup-store-access-key-id` and
  `backup-store-secret-access-key` beside the bucket, `velero-cloud-credentials`
  in `velero`, holding an AWS shared credentials file, and `db-backup` beside the
  database, holding the key pair under `ACCESS_KEY_ID` and `ACCESS_SECRET_KEY`.
  The build renders none of them.

## The Release that halts

`release-compose.yaml` attaches the same backup to the database on Docker
Compose. No FeatureRecipe realizes `core/backup` there, so `manifest-compose.yaml`
binds none, and `aggrega build --release release-compose.yaml --auto-pull` halts
naming the attachment rather than deploying a database with no backup:

```text
[… omitted: what resolving the lockfile prints, the same halt among it]
[OPS_ERROR E0099]
  recipe resolution
  caused by (1):
    no recipe resolved for component/feature instance: add an explicit Manifest mapping for its type: feature "backup" (type "core/backup"); no feature recipe in the catalog implements core/backup:1.0.0 for capability "compose", the capability its component's Recipe binds to; feature recipes implementing it for other capabilities: [cloudformation/backup-aws-backup:1.0.0 cloudformation/backup-native:1.0.0 helm/backup-cloudnative-pg:1.0.0 helm/backup-k8up:1.0.0 helm/backup-kasten:1.0.0 helm/backup-kubestash:1.0.0 helm/backup-mariadb-operator:1.0.0 helm/backup-velero:1.0.0 terraform/backup-aws-backup:1.0.0 terraform/backup-native:1.0.0]; pin one of those in the Manifest, and it renders as its own output beside the component's, or write one for "compose", then map the type to it
```

The standard-library catalog holds no FeatureRecipe for `core/backup` on this
target. Each one the message lists binds to another target, so pinned here it
renders as its own output beside the Compose file, for a target this Release does
not deploy to. The ways forward are to remove the attachment from the Release,
deploying the database there with no backup, or to deploy it through a Manifest
for a target that has a backup product, as the other five Releases do.
