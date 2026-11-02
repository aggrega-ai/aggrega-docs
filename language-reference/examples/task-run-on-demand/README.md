---
example:
  level: start
  products: []
  shows: [features, multi-target, parameters, guardrails, cloud-infrastructure]
---

# A task run on demand: one Aggregate, four targets

A task carrying `core/manual-trigger`, deployed without starting on Kubernetes,
Docker Compose, Terraform and CloudFormation, beside a task carrying nothing, with
the command that starts a run on each target.

Some work runs to completion only when someone asks for it: a one-off data fix,
a backup on request. `core/manual-trigger` is the Feature for that. Attached to a
`core/compute/task` with no schedule, it deploys the task without starting it,
and each run is one someone starts by hand, with the target's own command.

This workspace builds one Aggregate for four targets — Kubernetes through Helm,
Docker Compose, Terraform and CloudFormation — and shows, on each, what the
attachment changes in the rendered output and the command that starts a run.
The second task carries no attachment, so the difference is visible in the same
build. Two more Releases are expected to halt, and the page quotes what each
prints.

## What it builds

| instance | catalog Component | attachment | what starts a run |
|---|---|---|---|
| `data-fix` | `core/compute/task` | `core/manual-trigger` | someone, by hand, on every target |
| `report` | `core/compute/task` | none | its schedule, or, on Docker Compose, the stack starting |

The attachment sits in the Aggregate, beside the task it changes: running on
demand is part of what `data-fix` is, so the developer writes it, and the
Feature takes no values and no `infra`. The Release writes nothing for it.

`report`'s schedule is a parameter, `report_schedule`, which the Aggregate
declares with an empty default and reads into the task's `schedule` value:

```yaml
# aggregate.yaml
spec:
  parameters:
    report_schedule:
      type: string
      default: ""
      [… omitted: the parameter's description]

  components:
    [… omitted: data-fix with its attachment, and the comment above each task]
    report:
      type: core/compute/task
      values:
        schedule: "{{ .parameters.report_schedule }}"
```

It is a parameter because the four targets disagree about a task with no
attachment. Kubernetes runs it on a schedule as a CronJob, or once at deploy
without one. Docker Compose has no scheduler, so it runs the task once each time
the stack starts and refuses a schedule. On AWS nothing runs an Amazon ECS task
when Terraform or CloudFormation applies, so a task there needs a schedule or the
attachment, and is refused with neither. So the Kubernetes, Terraform and
CloudFormation Releases fulfil `report_schedule`, and the Docker Compose Release
leaves it empty.

`data-fix` builds the same way on all four, with no schedule and no parameter.

## The six Releases

| Release | Manifest | `report_schedule` | the build |
|---|---|---|---|
| `release-helm.yaml` | `manifest-helm.yaml` | `30 2 * * 1-5` | completes |
| `release-compose.yaml` | `manifest-compose.yaml` | empty | completes |
| `release-terraform.yaml` | `manifest-terraform.yaml` | `30 2 * * 1-5` | completes |
| `release-cloudformation.yaml` | `manifest-cloudformation.yaml` | `30 2 * * 1-5` | completes |
| `release-compose-scheduled.yaml` | `manifest-compose.yaml` | `30 2 * * 1-5` | halts |
| `release-terraform-unscheduled.yaml` | `manifest-terraform.yaml` | empty | halts |

Each Manifest maps `core/compute/task` to its target's Recipe and binds
`core/manual-trigger` to its target's FeatureRecipe: `helm/task` and
`helm/manual-trigger`, `compose/task` and `compose/manual-trigger`,
`terraform/task-ecs` and `terraform/manual-trigger`, and
`cloudformation/task-ecs` and `cloudformation/manual-trigger`. A Manifest that
binds no FeatureRecipe for the attachment halts the build, naming it.

Each Release names the image each task runs under `infra.image`, as
`core/compute/task` packages no software. The AWS Releases also name, under
`infra.overrides`, the cluster, subnets, security groups and execution role each
task runs with, and, where `report` has a schedule, the role the schedule starts
each run under. Every account-specific value there is a placeholder.

## Building it

The workspace reads the standard-library catalog from the hub registry
`.aggrega-config.yaml` names. Every Recipe here renders from the
catalog alone, so every build runs offline once the lockfile is resolved.

```bash
aggrega build --release release-helm.yaml --auto-pull  # one Release
```

In a checkout of the documentation repository, which holds the shared build
helper a copy written by `aggrega scaffold --example` does not carry,
`./check.sh` builds all six Releases and checks each outcome. It prints one line
per Release and exits 0 only when each ended as this page describes:

```text
RELEASE                              EXIT  EXPECTED  VERDICT
----------------------------------------------------------------------------------------------------
release-helm.yaml                    0     complete  OK: completed, the files the README shows
release-compose.yaml                 0     complete  OK: completed, the files the README shows
release-terraform.yaml               0     complete  OK: completed, the files the README shows
release-cloudformation.yaml          0     complete  OK: completed, the files the README shows
release-compose-scheduled.yaml       1     halt      OK: halted with the expected refusal
release-terraform-unscheduled.yaml   1     halt      OK: halted with the expected refusal

check: every build ended as expected.
```

## Kubernetes

`release-helm.yaml` writes two files, one CronJob per task, and nothing else.
`data-fix` is a CronJob held suspended, on a schedule the developer never wrote:

```yaml
# dist/helm/data-fix-cronjob.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: data-fix
  [… omitted: the labels and annotations the build writes on every resource]
spec:
  schedule: 0 0 30 2 *
  suspend: true
  jobTemplate:
    spec:
      template:
        [… omitted: the pod template's metadata, the same labels again]
        spec:
          containers:
            - name: main
              image: registry.example.com/orders-data-fix:2.0.1
              [… omitted: the container's CPU and memory requests and limits]
          restartPolicy: Never
```

A CronJob needs a schedule, and `0 0 30 2 *` names 30 February, a date no year
holds: suspended, the CronJob starts no run, and resumed, it still has no time at
which to start one. Without the attachment a task with no schedule would be a
Job, which runs as soon as it is deployed.

`report` is a CronJob on the schedule the Release fulfilled, and is not
suspended:

```yaml
# dist/helm/report-cronjob.yaml
[… omitted: apiVersion, kind and metadata, as in data-fix-cronjob.yaml under report's name]
spec:
  schedule: 30 2 * * 1-5
  jobTemplate:
  [… omitted: the job template, as in data-fix-cronjob.yaml with report's image]
```

A run of `data-fix` is a Job created from its CronJob, under a name of your
choosing:

```bash
kubectl create job data-fix-run-1 --from=cronjob/data-fix
```

The same command, given `--from=cronjob/report`, starts an extra run of
`report` between its scheduled ones.

## Docker Compose

`release-compose.yaml` writes one Compose file. Each task is a service that
Compose does not start again when it exits; `data-fix` also carries the profile
`manual`, and `report` carries none:

```yaml
# dist/compose/docker-compose.yaml
services:
  data-fix:
    image: registry.example.com/orders-data-fix:2.0.1
    [… omitted: the labels the build writes on every service, and the service's network]
    restart: "no"
    [… omitted: the CPU and memory limits and reservations]
    profiles:
      - manual
  report:
    image: registry.example.com/orders-report:1.4.2
    [… omitted: the labels and the network, as on data-fix]
    restart: "no"
    [… omitted: the CPU and memory limits and reservations, as on data-fix]
[… omitted: the network the services join]
```

Compose starts a service that carries a profile only when that profile is
enabled or the service is named on the command line, so `docker compose up`
runs `report` once and leaves `data-fix` stopped. A run of `data-fix` is started
by naming its service, and `--rm` removes its container once the run ends:

```bash
docker compose -f dist/compose/docker-compose.yaml run --rm data-fix
```

## Terraform

`release-terraform.yaml` writes a root configuration with one module block per
task, and each task's module beside it. The two blocks differ in the schedule:

```hcl
# dist/terraform/aggrega.modules.tf
# Root configuration for this boundary. Each component rendered here is one
# module block below, and the directory that block points at holds that
# component's own files. One configuration means one dependency graph, which is
# what lets a reference or a depends_on reach from one component to another.

module "data-fix" {
  source = "./modules/data-fix"

  assign_public_ip   = false
  cluster            = "arn:aws:ecs:eu-west-1:123456789012:cluster/example-cluster"
  cpu                = "256"
  environment        = {}
  execution_role_arn = "arn:aws:iam::123456789012:role/example-ecs-task-execution"
  image              = "registry.example.com/orders-data-fix:2.0.1"
  memory             = "512"
  name               = "data-fix"
  security_groups    = ["sg-0fedcba9876543210"]
  subnet_ids         = ["subnet-0123456789abcdef0"]
}

module "report" {
  source = "./modules/report"

  assign_public_ip             = false
  cluster                      = "arn:aws:ecs:eu-west-1:123456789012:cluster/example-cluster"
  cpu                          = "256"
  environment                  = {}
  execution_role_arn           = "arn:aws:iam::123456789012:role/example-ecs-task-execution"
  image                        = "registry.example.com/orders-report:1.4.2"
  memory                       = "512"
  name                         = "report"
  schedule_expression          = "cron(30 2 ? * 2,3,4,5,6 *)"
  schedule_expression_timezone = "UTC"
  scheduler_role_arn           = "arn:aws:iam::123456789012:role/example-scheduler"
  security_groups              = ["sg-0fedcba9876543210"]
  subnet_ids                   = ["subnet-0123456789abcdef0"]
}
```

The module declares the EventBridge Scheduler schedule only while it is given an
expression, so `data-fix`'s task definition stands alone:

```hcl
# dist/terraform/modules/data-fix/main.tf
[… omitted: the provider requirement, the Region lookup, the task definition and the comments on each]
resource "aws_scheduler_schedule" "this" {
  count = var.schedule_expression == null ? 0 : 1
[… omitted: the rest of the schedule]
```

The Recipe writes `report`'s schedule in EventBridge Scheduler's own form:
`30 2 * * 1-5` becomes `cron(30 2 ? * 2,3,4,5,6 *)`, the days of the week
numbered from Sunday as 1, in UTC because the Release names no time zone.

## CloudFormation

`release-cloudformation.yaml` writes one stack template. It holds a task
definition for each task and a schedule for `report` alone:

```json
# dist/cloudformation/cloudformation-stack.json
{
  "AWSTemplateFormatVersion": "2010-09-09",
  "Resources": {
    "DataFixTaskDefinition": {
      [… omitted: the provenance metadata the build writes on every resource]
      "Properties": {
        "ContainerDefinitions": [
          {
            "Essential": true,
            "Image": "registry.example.com/orders-data-fix:2.0.1",
            "Name": "main"
          }
        ],
        "Cpu": "256",
        "ExecutionRoleArn": "arn:aws:iam::123456789012:role/example-ecs-task-execution",
        "Family": "data-fix",
        "Memory": "512",
        "NetworkMode": "awsvpc",
        "RequiresCompatibilities": [
          "FARGATE"
        ]
      },
      "Type": "AWS::ECS::TaskDefinition"
    },
    "ReportSchedule": {
      [… omitted: the provenance metadata]
      "Properties": {
        "FlexibleTimeWindow": {
          "Mode": "OFF"
        },
        "ScheduleExpression": "cron(30 2 ? * 2,3,4,5,6 *)",
        "ScheduleExpressionTimezone": "UTC",
        "Target": {
          "Arn": "arn:aws:ecs:eu-west-1:123456789012:cluster/example-cluster",
          "EcsParameters": {
            [… omitted: the launch type, the network configuration and the task count each run starts with]
            "TaskDefinitionArn": {
              "Ref": "ReportTaskDefinition"
            }
          },
          "RoleArn": "arn:aws:iam::123456789012:role/example-scheduler"
        }
      },
      "Type": "AWS::Scheduler::Schedule"
    },
    "ReportTaskDefinition": {
      [… omitted: the same shape as DataFixTaskDefinition, with report's image and family]
    }
  }
}
```

Nothing in the stack refers to `DataFixTaskDefinition`, so nothing starts it.

## Starting a run on Amazon ECS

On both AWS targets a run of `data-fix` is started with the Amazon ECS RunTask
operation, given the task definition's family as rendered and the cluster and
network configuration the Release names under `infra.overrides`:

```bash
aws ecs run-task \
  --cluster arn:aws:ecs:eu-west-1:123456789012:cluster/example-cluster \
  --task-definition data-fix \
  --launch-type FARGATE \
  --network-configuration 'awsvpcConfiguration={subnets=[subnet-0123456789abcdef0],securityGroups=[sg-0fedcba9876543210],assignPublicIp=DISABLED}'
```

Named by its family alone, the task definition resolves to its latest active
revision.

## What the build does not do

The build writes files and stops. It starts no run, on any target: it reaches no
cluster, starts no Compose stack and calls no AWS API, and the attachment changes
only what the files say. It writes no script either: every command on this page
is the target's own, run by whoever operates it, and none is in `dist/`. The
attachment's realizations add no file of their own on any target; the change
each makes is in the task's own output, shown above.

## The two Releases that halt

`release-compose-scheduled.yaml` fulfils `report_schedule` on Docker Compose,
and attaches `core/manual-trigger` to `report` as well. On Kubernetes and AWS a
task with a schedule runs on it whether the attachment is there or not; on
Docker Compose, with no scheduler, a task with a schedule has no realization,
attached or not. `aggrega build --release release-compose-scheduled.yaml
--auto-pull` halts:

```text
[… omitted: what resolving the lockfile prints, the same halt among it]
[CATALOG_ERROR E0033]
  Recipe/FeatureRecipe assertions
  caused by: Recipe "task" instance "report" assertion "schedule_refused": [… omitted: the template position and the assertion's own source]: error calling fail: assertion failed: the component "report" is scheduled "30 2 * * 1-5", and Docker Compose has no scheduler: nothing in a compose file starts a service at a time, so the run would happen at none of the times written. Map core/compute/task to helm/task in the Manifest, which runs it on its schedule as a Kubernetes CronJob; or remove the schedule from the component in the Aggregate to run it once at each docker compose up, or attach core/manual-trigger to it there to start each run with docker compose run --rm
```

`release-terraform-unscheduled.yaml` leaves `report_schedule` empty on
Terraform, so `report` has neither a schedule nor the attachment, and nothing on
AWS would ever start it. This is the case `core/manual-trigger` exists for, and
`aggrega build --release release-terraform-unscheduled.yaml --auto-pull` halts
naming it:

```text
[… omitted: what resolving the lockfile prints, the same halt among it]
[CATALOG_ERROR E0033]
  Recipe/FeatureRecipe assertions
  caused by: Recipe "task-ecs" instance "report" assertion "schedule_translates": [… omitted: the template position and the assertion's own source]: error calling fail: assertion failed: the component "report" has no schedule and carries no core/manual-trigger attachment, so it runs once, and nothing on AWS starts a run that happens once: neither Terraform nor CloudFormation runs an Amazon ECS task when it applies, so the run would never happen. Give the component a schedule in the Aggregate; attach core/manual-trigger to it there to deploy its task definition alone, for the operator to start each run with aws ecs run-task; or map core/compute/task to helm/task in the Manifest, which runs it once on Kubernetes
```

Here the schedule reaches the task through a parameter the Release fulfils, so
giving the component a schedule means fulfilling `report_schedule`, as
`release-terraform.yaml` does.
