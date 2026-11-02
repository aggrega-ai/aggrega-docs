---
example:
  level: advanced
  products: [core/datastore/mariadb]
  shows: [cloud-infrastructure, features, boundaries, guardrails]
---

# CloudFormation stack with attachments

A managed database and the application that reads it, authored once as developer
intent and assembled into AWS CloudFormation stack templates. **Two attachments
bring resources of their own** — an alarm on the database and a shared-settings
parameter on the boundary — so this example shows where an attachment's
resources land in the assembled stack and how they are named alongside the
component's.

The same developer intent is built three ways: as one stack, as two stacks with
a reference crossing between them, and — deliberately — as a build that halts.

Output blocks on this page are copied from a real run, per
[Reading the output on these pages](../reading-the-output.md).

## Files

- `aggregate.yaml` — developer intent: a `payments-db` database of type
  `core/datastore/mariadb` and a `reporting-app` of type
  `example/compute/db-reader` that declares it uses the database. Nothing about
  AWS lives here. The database's `features:` block carries `storage-headroom`,
  attaching `example/storage-alarm`.
- `release-one-stack.yaml` — both components in one boundary, so both assemble
  into a single stack. Attaches `core/shared-config` across the boundary.
- `release-two-stacks.yaml` — the same intent split across two boundaries, so
  the application's reference to the database crosses a stack edge.
- `release-negative-name-collision.yaml` with `aggregate-name-collision.yaml` —
  **expected to fail.** Attaches the alarm twice to one component.
- `manifest.yaml` — binds each component type and each attached Feature to the
  Recipe that implements it on this target.
- `.aggrega-config.yaml` — names the hub registry the catalog entities resolve
  from.

Every release binds the database's `root_password` slot on its entry for
`payments-db`, with `core/generated-secret`. RDS owns the administrator password on
this target, and the database Recipe the Manifest picks carries the directive
that says so; that makes the binding an operator decision, written in the
Release, and the Aggregate says nothing about it.

Every release also attaches `core/backup` to `payments-db`, with
`infra.retention_days: 14`, and the Manifest binds it to
`cloudformation/backup-native`. RDS keeps the instance's automated backups
for 7 days when nothing says otherwise; this attachment keeps each for 14. The
FeatureRecipe renders nothing: the backup is a setting of the instance, so the
database Recipe reads the attachment and writes `"BackupRetentionPeriod": 14`
into the instance's own `Properties`.

The entities this example uses all live in the published catalog. Nothing is
copied in beside the release files, so the example resolves against the catalog
as it stands rather than against a private snapshot of it.

## Build

This example ships three releases, so name the one you want. One release builds
per run. Each release's first build needs its lockfile, which the pull writes:

```bash
aggrega pull --release release-one-stack.yaml
aggrega build --release release-one-stack.yaml
```

The build prints, with `<workspace>` standing for this example's folder:

```
Total build time:               4.1s
Build completed: 1 files written to <workspace>/dist
```

The assembled stack lands at
`dist/one-stack/cloudformation/cloudformation-stack.json`. Every component and
every attachment rendering to that directory contributes to that one template —
the provider emits a single pure-JSON stack rather than a file per contributor.

## What lands, and who contributed it

The one-stack build assembles **four** resources from **four** different
contributors:

| Resource | Contributed by |
| --- | --- |
| `PaymentsDb` | the database component's own Recipe |
| `PaymentsDbStorageHeadroom` | the `storage-headroom` attachment on that component |
| `AppSharedConfig` | the `shared-settings` attachment on the boundary |
| `ReportingApp` | the application component's own Recipe |

The `backup` attachment on `payments-db` is not in the table because it
contributes no resource of its own: what it sets lands inside `PaymentsDb`.

Each resource carries a provenance block naming the contributor it came from, so
the two halves stay distinguishable inside a stack both contributed to:

```json
    "PaymentsDbStorageHeadroom": {
      "Metadata": {
        "aggrega.ai/provenance": {
          "aggrega.ai/aggregate-name": "aggregate",
          "aggrega.ai/boundary-path": "app",
          [… omitted: a compiler-version entry, which moves with the build]
          "aggrega.ai/component-id": "cfr--payments-db--storage-headroom",
          "aggrega.ai/environment": "production",
          "aggrega.ai/provider": "cloudformation",
          [… omitted: a provider-version entry, which moves with the build]
          "aggrega.ai/recipe-uri": "storage-alarm:1.0.0"
        }
      },
      [… omitted: the alarm's Properties, printed in full just below]
      "Type": "AWS::CloudWatch::Alarm"
    },
```

The two version entries are the only lines in this block that move between
builds, which is why they are left out; the third omission is just the alarm's
`Properties`, printed on its own below. Everything shown is what your own build
writes.

The alarm is the attachment's resource, not the database's. Detaching
`storage-headroom` from the Aggregate removes exactly that resource and the one
output it publishes, and leaves `PaymentsDb` byte-for-byte as it was.

### An attachment's resource name carries the scope that carries the attachment

A Feature is authored once and attached many times, so the name a FeatureRecipe
derives has to be distinct per attachment. This one composes the host component
and the attachment name: host `payments-db`, carried under `storage-headroom`,
gives `PaymentsDbStorageHeadroom`.

Composing the host alone would be enough to keep the alarm clear of the resource
it watches, and **not** enough to keep the same Feature attached twice to one
component from colliding with itself — which is what the failing release below
is about.

The alarm's own properties address the host by the host's derived name:

```json
      "Properties": {
        "AlarmDescription": "Free storage below 21474836480 bytes on payments-db",
        "ComparisonOperator": "LessThanThreshold",
        "Dimensions": [
          {
            "Name": "DBInstanceIdentifier",
            "Value": {
              "Ref": "PaymentsDb"
            }
          }
        ],
        "EvaluationPeriods": 2,
        "MetricName": "FreeStorageSpace",
        "Namespace": "AWS/RDS",
        "Period": 300,
        "Statistic": "Minimum",
        "Threshold": 21474836480,
        "TreatMissingData": "breaching"
      },
```

`Ref` on the database resource resolves to that instance's identifier when the
stack deploys. Both halves derive `PaymentsDb` from the same component name,
which is what makes them agree — nothing here is looked up.

### Who decides what, on one attachment

The attachment splits its inputs the way a component does. **How much headroom the
application needs is developer intent**, authored on the attachment in
`aggregate.yaml` — it is a property of the application. **Where the alarm notifies,
and how long a dip must persist before it fires, are operator sizing**, supplied
from the Release:

```yaml
        payments-db:
          features:
            storage-headroom:
              infra:
                evaluation_periods: 3
                notify_target: "arn:aws:sns:eu-west-1:123456789012:payments-oncall"
```

A Release supplies `infra` for an attachment the Aggregate declared, and never
`values`. The two-stack release sets both; the one-stack release sets neither, and
the difference is readable in the output. Set:

```json
      "Properties": {
        "AlarmActions": [
          "arn:aws:sns:eu-west-1:123456789012:payments-oncall"
        ],
```

Unset, the field is **absent** rather than empty — the alarm is emitted with no
notification action at all, and `EvaluationPeriods` falls to the `2` the Recipe
carries rather than to anything the Feature declared. A Release that supplies
neither still gets a working alarm, and supplying one adds exactly one field.

### An attachment's outputs are named by its host, not by itself

The two halves of the stack are named on different rules, and this is the half
that surprises people.

**A resource logical ID comes from the attachment's own Recipe** — the name above.
**An output is named for the publishing component and the entry together, and for
an attachment the publishing component is the host.** The alarm publishes one
entry, `alarm-id`, and it surfaces as:

```json
    "paymentsXzhdbXXalarmXzhid": {
      "Value": {
        "Ref": "PaymentsDbStorageHeadroom"
      }
    },
```

The two halves are readable once you know the rule: a logical ID admits letters
and digits alone, so the provider spells out what that alphabet refuses instead
of dropping it — `Xzh` is the hyphen you wrote, and `XX` is where the component
name ends and the entry name begins. `payments-db` publishing `alarm-id`, and
nothing else, reaches that name. [Names in the assembled
stack](../../providers/cloudformation.md#how-an-output-name-is-built) sets the
scheme out in full.

That is the same output name it would have reached had the database itself
published `alarm-id`. So an entry name the host also publishes would meet the
attachment's at one output name — which is why entry names that read as the
attachment's own keep them clear of the host's.

### A boundary-wide attachment renders once for the boundary

`core/shared-config` is attached in the Release, on the boundary rather than on a
component, and it renders **once** for that boundary — not once per component in
it. The one-stack build holds two components and exactly one `AppSharedConfig`:

```json
    "AppSharedConfig": {
      [… omitted: the provenance Metadata, whose shape is shown above]
      "Properties": {
        "Description": "Settings shared by every component in the app boundary",
        "Name": "/app/shared-config",
        "Type": "String",
        "Value": "tier=production"
      },
      "Type": "AWS::SSM::Parameter"
    },
```

Build the two-stack release and the point is sharper: each boundary gets its own,
carrying that boundary's own resolved settings. The `Properties` of the one in
each of the two templates that build writes:

```json
      "Properties": {
        "Description": "Settings shared by every component in the data boundary",
        "Name": "/data/shared-config",
        "Type": "String",
        "Value": "tier=production-data"
      },
```

```json
      "Properties": {
        "Description": "Settings shared by every component in the app boundary",
        "Name": "/app/shared-config",
        "Type": "String",
        "Value": "tier=production-app"
      },
```

It is attached in the Release because what it carries is the operator's own
arrangement rather than anything the Aggregate declares. A boundary attachment
sets `infra:` and never `values:` — the Aggregate remains where developer values
are authored.

## Splitting the same intent across two stacks

```bash
aggrega pull --release release-two-stacks.yaml
aggrega build --release release-two-stacks.yaml
```

Nothing in `aggregate.yaml` changes. The application still declares that it uses
the database; the operator decides in the Release that the two are provisioned
separately, and the reference between them crosses a stack edge as a result.

In the one-stack build the application receives the endpoint as a reference
inside the single template:

```json
      "Properties": {
        "Name": "/reporting/db-host",
        "Tier": "Standard",
        "Type": "String",
        "Value": {
          "Fn::GetAtt": [
            "PaymentsDb",
            "Endpoint.Address"
          ]
        }
      },
```

In the two-stack build the producer stack publishes that value as an export:

```json
    "paymentsXzhdbXXhost": {
      "Value": {
        "Fn::GetAtt": [
          "PaymentsDb",
          "Endpoint.Address"
        ]
      },
      "Export": {
        "Name": "aggrega--cloudformation-two-stacks--two-stacks-data-zscloudformation--payments-db--host"
      }
    },
```

and the consumer stack reads it back by that same name:

```json
      "Properties": {
        "Name": "/reporting/db-host",
        "Tier": "Standard",
        "Type": "String",
        "Value": {"Fn::ImportValue":"aggrega--cloudformation-two-stacks--two-stacks-data-zscloudformation--payments-db--host"}
      },
```

Only `host` carries an `Export`, because that is the entry an edge actually
consumes; the database's other published entries surface as plain outputs. The
component-scope alarm follows its host into the producer stack, and each boundary
keeps its own boundary-wide attachment.

Neither intrinsic is evaluated at build time. The endpoint does not exist until
the stack deploys, so the compiler pipes the reference through and CloudFormation
resolves it — which is why the application never names an address.

For how the export name is built, and when the consumer reads through
`Fn::ImportValue` rather than a direct cross-account read, see
[Cross-stack wiring](../../providers/cloudformation.md#cross-stack-wiring).

## The build that halts

```bash
aggrega pull --release release-negative-name-collision.yaml
aggrega build --release release-negative-name-collision.yaml
```

`aggregate-name-collision.yaml` attaches the alarm **twice** to one component,
under two attachment names. Each attachment's *resource* name composes its own
attachment name, so the two alarms are two distinct resources and do not collide
there. Their **outputs** do: each publishes `alarm-id`, an output is named for the
host component and the entry, and the host is the same component for both.

```
[… omitted: the pull's lines, which report the same collision while writing the lockfile]
[TRANSLATION_ERROR E0038]
  dispatch groups whose contributors derive one name more than once in one key space
  caused by (2):
    [TRANSLATION_ERROR] release-negative-name-collision.yaml
      derived name collision: one name is derived more than once in one key space ("paymentsXzhdbXXalarmXzhid", key space "output-logical-ids", derived by component "payments-db", carrying attachment "storage-headroom", provider "cloudformation", dispatch path "name-collision/cloudformation")
  ---
    [TRANSLATION_ERROR] release-negative-name-collision.yaml
      derived name collision: one name is derived more than once in one key space ("paymentsXzhdbXXalarmXzhid", key space "output-logical-ids", derived by component "payments-db", carrying attachment "storage-headroom-strict", provider "cloudformation", dispatch path "name-collision/cloudformation")
```

Four things to read out of that, and each one is deliberate.

- **Both ends are named.** Each entry gives the component *and* the attachment
  name it was carrying, so both are searchable in the files you wrote. Nothing
  about a collision makes one contributor's name the intended one, so both are
  reported rather than the first.
- **The key space is named.** `output-logical-ids` tells you which of the stack's
  two name spaces was reached, and — because the resource name space is absent
  from this halt — that the resource names were fine.
- **Nothing is emitted.** The build stops rather than writing a stack in which one
  of the two alarms silently has no output.
- **Naming the resources apart does not fix this one.** The output name is built
  from the host component and the entry, so it is the *entry* that has to differ —
  either one attachment instead of two, or a Feature whose published entry names
  read as that attachment's own.

## Identical input, identical output

Building twice from unchanged inputs produces byte-identical templates. The
compiler resolves no live data — it never calls AWS, never looks up an account
identifier, and never runs CloudFormation — so a rebuild has nothing to discover
that could move the bytes. That is the property a diff-based review relies on.

`dist/` and the `*.lock` files are generated and are not committed; they
regenerate from the files that are.
