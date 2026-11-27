# Import a CloudFormation or SAM template

This walkthrough imports a small AWS CloudFormation template — an RDS PostgreSQL
instance that reads two exports of another stack, and an Amazon SES configuration
set — and builds the result as one CloudFormation stack template. The template
declares the AWS Serverless Application Model transform, so it is also a SAM
template, and the import reads it the same way. The import drafts the Aggregate,
the Release and the Manifest: the instance becomes a reference to the standard
library's PostgreSQL Component, the configuration set, which no Component stands
for, is drafted from the template, and the values the template states in a form a
Release can take are carried over. A few it does not are left for you, and the
page shows which and where. Every file and every block of output below comes from
a real run; the template and each stage of the walkthrough are in the
[import-cloudformation](../../language-reference/examples/import-cloudformation/README.md)
example, where a check script runs the import again, compares what it writes,
what it prints and the blocks this page quotes with the files kept there, and
validates and builds the drafted Release.

## Draft the example

You can run this import with the commands on this page, or
[have your AI assistant run it for you](#with-an-ai-assistant).

Write the example into a new folder named after it:

```bash
aggrega draft --example import-cloudformation
```

It then prints the commands to run next. The first changes into the new folder;
the one after it, below, changes into its `source` folder, which holds what this
page imports and is where the import runs:

```bash
cd import-cloudformation
```

## The template

`template.yaml` is a CloudFormation template written in YAML, with the short
intrinsic forms. It declares the SAM transform, a PostgreSQL instance on RDS that
takes its subnet group and its security group from exports of another stack, and
a configuration set for Amazon SES:

<!-- quotes: source/orders/template.yaml -->
```yaml
AWSTemplateFormatVersion: "2010-09-09"
Transform: AWS::Serverless-2016-10-31
Description: The database and the mail configuration of an order service.
Resources:
  OrdersDb:
    Type: AWS::RDS::DBInstance
    DeletionPolicy: Snapshot
    Properties:
      Engine: postgres
      EngineVersion: "16.3"
      DBInstanceClass: db.t4g.micro
      AllocatedStorage: "20"
      DBName: orders
      MasterUsername: orders_app
      ManageMasterUserPassword: true
      DBSubnetGroupName: !ImportValue shared-db-subnets
      VPCSecurityGroups:
        - !ImportValue shared-db-security-group
  Mailer:
    Type: AWS::SES::ConfigurationSet
    Properties:
      Name: orders-mail
```

The template sits in the folder `orders`, and an `.aggrega-config.yaml` beside
that folder makes the directory a workspace, so the import writes its drafts
there:

<!-- quotes: source/.aggrega-config.yaml -->
```yaml
# The workspace key marks this directory as the workspace root, so an import run
# here writes its drafts beside the orders folder.
workspace: {}
# The registry the importer is fetched from the first time an import needs it.
default_registry: hub.aggrega.ai
```

The import recognises a template by its `AWSTemplateFormatVersion` line, or by a
`Transform` beside its `Resources`, which is how a SAM template that states no
version line is recognised, and reads it as YAML with the short intrinsic forms,
`!Ref`, `!GetAtt`, `!ImportValue` and the rest, or as JSON.
It weighs each resource against the Components of the workspace's catalog, which
it reads as [How an import runs](README.md#how-an-import-runs) describes, and it
reads no AWS account: a value the template computes while it deploys, such as an
`Fn::ImportValue`, is carried as the intrinsic that computes it, never looked up.

Change into `source`:

```bash
cd source
```

## Run the import

Name the folder holding the template:

<!-- quotes: import-command -->
```bash
aggrega import orders
```

No `--target` is named. The importer declares `cloudformation` as its default
target, since the standard library's Recipes for AWS CloudFormation bind to it,
and the import drafts a Manifest for it; an import that names a target, with
`--target`, drafts for that one instead, and the Manifest maps each Component to
the Recipe of that target. The record the import writes beside its drafts keeps
the target, and `--sync` reuses it.

On standard output it lists what it wrote:

<!-- quotes: draft/stdout.txt -->
```text
wrote aggregate.yaml
wrote release.yaml
wrote manifest.yaml
wrote catalog/component/imported/component/aws-ses-configurationset/0.1.0/component.yaml
wrote catalog/recipe/cloudformation/aws-ses-configurationset/0.1.0/recipe.yaml
wrote .aggrega-import.json
```

On standard error, with `<workspace>` standing for the folder you ran it in:

<!-- quotes: draft/import.txt -->
```text
[… omitted: a warning that the importer runs unverified, printed where its module is read from beside its Plugin entity in a catalog folder rather than fetched]
read as the cloudformation format, with drafted paths relative to <workspace>
info: the drafts are for the target "cloudformation", the importer's declared default; an import naming a target drafts for that one
[… omitted: the info line saying the configuration set is drafted from the source]
mapped Mailer (AWS::SES::ConfigurationSet) to imported/component/aws-ses-configurationset as a draft, NONE at 0.1
mapped OrdersDb (AWS::RDS::DBInstance) to core/datastore/postgres as a reference, HIGH at 0.9
Pull complete: <workspace>/release.lock (entities=6, source_artifacts=0, external_inputs=0)
```

- **The `info` lines** state what the importer decided without a question. The
  first says the drafts are for `cloudformation`. The second says the
  configuration set is drafted from the template, as a Component and a Recipe of
  its own, and says that the import can instead draft one from the vendor's
  description of the type, with `--format cloudformation-schema`, as
  [Deploy a service the catalog does not have](resource-schemas.md) describes.
- **The `mapped` lines** say what each resource became. `OrdersDb` is an instance
  of the standard library's `core/datastore/postgres`, matched in the high tier
  and referenced. `Mailer` matches no Component, so it is a draft, with no match.
- **The pull** is the import fetching what the drafted Release depends on, as
  [`aggrega pull`](../../language-reference/cli/aggrega-pull.md) does, into
  `release.lock`. The Recipes the Manifest names write their resources themselves
  and source nothing, so `source_artifacts` is `0` and the pull reaches outside
  the catalog for nothing.

## What it writes

The Aggregate, the Release and the Manifest are named `imported/orders`, after
the folder the import read — a template imported as a file is named after the
file, `template` — under the namespace the importer's `target_namespace` setting
sets, `imported` unless you set another
([Settings](../../language-reference/plugins/core-importers.md#settings)).

`aggregate.yaml` — one entry per resource, named after its logical ID:

<!-- quotes: draft/aggregate.yaml -->
```yaml
# Sources read: template.yaml.
# The template declares the transform AWS::Serverless-2016-10-31.
apiVersion: aggrega.ai/v1beta1
kind: Aggregate
metadata:
  name: imported/orders
  version: 0.1.0
  description: Draft Aggregate imported from a source in the cloudformation format.
spec:
  components:
    # The resource Mailer.
    mailer:
      type: imported/component/aws-ses-configurationset
      values:
        name: "orders-mail"
    # The resource OrdersDb.
    orders-db:
      type: core/datastore/postgres
      values:
        database: "orders"
        user: "orders_app"
```

A logical ID becomes the instance's name in lower case with hyphens, `OrdersDb`
to `orders-db`, and the built stack names the resource from the instance's name
again, in capitalized words, so the two agree here. The values the Component takes
from the template are `values`: the database `orders` and its user
`orders_app`. The configuration set is a Component of a type the import drafted,
`imported/component/aws-ses-configurationset`, with the `name` the template gives
it.

`release.yaml` — the environment, each resource's settings:

<!-- quotes: draft/release.yaml -->
```yaml
apiVersion: aggrega.ai/v1beta1
kind: Release
metadata:
  name: imported/orders
  # environment is a drafted default, since no source names the environment this Release deploys to; change it to name the one it deploys to.
  environment: development
  version: 0.1.0
  description: Draft Release imported from a source in the cloudformation format.
spec:
  aggregate: imported/orders
  manifest: imported/orders
  components:
    mailer: {}
    # Properties the source writes and the draft does not place: Properties.ManageMasterUserPassword.
    orders-db:
      infra:
        engine_version: "16.3"
        storage:
          size: "20Gi"
        overrides:
          DeletionPolicy: "Snapshot"
          DBInstanceClass: "db.t4g.micro"
          DBSubnetGroupName: "!ImportValue shared-db-subnets"
          VPCSecurityGroups: ["!ImportValue shared-db-security-group"]
```

The environment, `development`, is a default the import writes because no
template names one. The instance's engine version and storage come across as the
Component's own settings, `engine_version` and `storage.size`. What the Component
has no setting for goes under `infra.overrides` with the template's own property
name: the instance class, the deletion policy, and the two exports, which the
Release carries as the short-form text `!ImportValue …`. The Recipe writes each
as the intrinsic it names, so the stack template holds
`{"Fn::ImportValue": "shared-db-subnets"}`, as [Read the stack
template](#read-the-stack-template) shows. The comment above the instance lists
the one property the draft does not place, `ManageMasterUserPassword`: the
PostgreSQL Recipe writes it itself, as `true`, which is what the template states.

`manifest.yaml` — the Recipe each component is realized with on `cloudformation`:

<!-- quotes: draft/manifest.yaml -->
```yaml
apiVersion: aggrega.ai/v1beta1
kind: Manifest
metadata:
  name: imported/orders
  version: 0.1.0
spec:
  mappings:
    components:
      type: {}
      name:
        mailer: cloudformation/aws-ses-configurationset
        orders-db: cloudformation/postgres-rds
```

The configuration set has no Component of the standard library, so the import
drafts one with a Recipe under the workspace's `catalog` folder: the Component
`imported/component/aws-ses-configurationset` declares the `name` the template
gives the resource and an `overrides` object for every other property the
template writes, under the vendor's own names, and the Recipe
`aws-ses-configurationset` writes one `AWS::SES::ConfigurationSet` resource. The
drafts are plain files for you to read and edit:

<!-- quotes: draft/catalog/component/imported/component/aws-ses-configurationset/0.1.0/component.yaml -->
```yaml
apiVersion: aggrega.ai/v1beta1
kind: Component
metadata:
  name: imported/component/aws-ses-configurationset
  version: 0.1.0
  description: "Draft Component of the resource type AWS::SES::ConfigurationSet, imported from a source in the cloudformation format."
  labels:
    component.aggrega.ai/type: resource
    component.aggrega.ai/hosting: managed
spec:
  schema:
    values:
      type: object
      properties:
        # identity: the resource's own name or identifier
        # The source writing the resource gives no description of Properties.Name.
        name:
          type: string
          required: true
      additionalProperties: false
[… omitted: the infra and provides schemas]
```

`release.lock` records the catalog entities the Release resolved to, by digest;
`.aggrega-import.json` is the record of what the import wrote, which a later
`aggrega import --sync` reads.

## Validate

```bash
aggrega validate --release release.yaml
```

The drafted Release validates as it stands:

```text
release dependency validation passed: release.yaml (schema-pillar + dependency pillars)
```

A refusal names what to change and where, in the document you change.

## Build

```bash
aggrega build --release release.yaml --auto-pull
```

The Release no longer matches a `release.lock` written before an edit, so a build
after one needs `--auto-pull`, which resolves it again; without it the build
stops and names `aggrega pull`. With `<workspace>` standing for the folder you ran
it in:

```text
[… omitted: the pull's line reporting the lockfile it wrote]
[… omitted: a total build time, which differs per run]
Build completed: 1 file written to <workspace>/dist
```

## Read the stack template

The build writes one file, `dist/cloudformation/cloudformation-stack.json`: the
assembled stack, as JSON with long-form intrinsics, with one entry under
`Resources` for each resource a component writes, named by the component's
instance id in capitalized words:

```text
Mailer     the SES configuration set, the resource the draft Recipe writes
OrdersDb   the RDS instance
```

The instance's entry carries the settings the Release holds, the exports as
`Fn::ImportValue`, and the Recipe's own for the rest:

```json
    "OrdersDb": {
      "DeletionPolicy": "Snapshot",
      "Metadata": {
        "aggrega.ai/provenance": {
          "aggrega.ai/aggregate-name": "imported/orders",
          "aggrega.ai/boundary-path": "default",
[… omitted: a compiler-version entry, which moves with the build]
          "aggrega.ai/component-id": "orders-db",
          "aggrega.ai/environment": "development",
          "aggrega.ai/provider": "cloudformation",
[… omitted: a provider-version entry, which moves with the build]
          "aggrega.ai/recipe-uri": "postgres-rds:1.0.0"
        }
      },
      "Properties": {
        "AllocatedStorage": 20,
        "BackupRetentionPeriod": 7,
        "DBInstanceClass": "db.t4g.micro",
        "DBName": "orders",
        "DBSubnetGroupName": {
          "Fn::ImportValue": "shared-db-subnets"
        },
        "Engine": "postgres",
        "EngineVersion": "16.3",
        "ManageMasterUserPassword": true,
        "MasterUsername": "orders_app",
        "MultiAZ": false,
        "Port": 5432,
        "StorageType": "gp3",
        "VPCSecurityGroups": [
          {
            "Fn::ImportValue": "shared-db-security-group"
          }
        ]
      },
      "Type": "AWS::RDS::DBInstance"
    }
```

The backup retention, the storage type, the port and the single-zone setting are
the Recipe's defaults, which the template did not write. The stack also carries
an `Outputs` section holding what the instance publishes to the components that
read it, its address among them.

The built template is a new stack, not the source stack with a changed template.
CloudFormation identifies a resource across updates by its logical ID, so
deploying the built template as an update of the stack the source deployed would
replace each resource whose logical ID the build writes differently. Here
`OrdersDb` and `Mailer` keep the IDs the source wrote, which is a property of this
template's names, not a promise: where an instance's name folded into words differs
from the ID the source used, the draft says so in a comment above the instance.
Deploy the built template as a stack of its own, or preview an update as a change
set first.

## Deploy it

The build writes no parameters file and runs nothing against AWS: the commands are
yours. Check the template, preview what the stack would create, then deploy it:

```bash
aws cloudformation validate-template --template-body file://dist/cloudformation/cloudformation-stack.json
aws cloudformation deploy --stack-name <name> --template-file dist/cloudformation/cloudformation-stack.json --no-execute-changeset
aws cloudformation deploy --stack-name <name> --template-file dist/cloudformation/cloudformation-stack.json
```

The [CloudFormation provider](../../language-reference/providers/cloudformation.md)
page sets out what the assembled stack holds and how its names are built. Before
the template deploys, the two exports the instance reads, `shared-db-subnets` and
`shared-db-security-group`, must exist in the account and Region the stack goes
to.

## With an AI assistant

An AI assistant [set up with Aggrega's tools](../../ai-assistants/set-up.md)
can do the same: paste this prompt into it.

<!-- copyable -->

> Use the Aggrega tools only, and create no folder yourself. If the Workspace folder holds no `import-cloudformation` folder yet, call the `draft` tool once with `example` set to `import-cloudformation` and no `dir`: it writes the example into a new `import-cloudformation` folder. Then call the `import` tool with `workspace_root` set to `import-cloudformation/source` and `source` set to `orders`: it writes its drafts into `import-cloudformation/source` and pulls what they need. Then call the `build` tool with `workspace_root` set to `import-cloudformation/source`, `release` set to `release.yaml`, `auto_pull` set to true and `write` set to true. Tell me which files the build wrote; they are under `import-cloudformation/source/dist/`.

To review your own draft, ask the assistant to validate it first and tell you
what it stops at.

## Open it in VS Code

With the
[Aggrega extension for Visual Studio Code](../editor/install.md#installing-the-extension)
installed, open the folder `import-cloudformation/source` in VS Code, where the
import wrote its drafts. The folder holds one Release, the drafted `release.yaml`,
so the editor selects it for you, and it checks the drafts against that Release as
you edit them, marking what it finds in the file and in the Problems panel.
**Aggrega: Show topology graph**, in the Command Palette, draws the Release's
components and the connections between them. **Aggrega: Build**,
**Aggrega: Preview build** and **Aggrega: Pull** act on the same Release, and each
is also a button on the **Commands** panel of the **Aggrega** view in the activity
bar; Build writes its files into the folder's `dist/`.
[Use Aggrega in Visual Studio Code](../editor/README.md) covers the rest.

## When the template changes

Keep `.aggrega-import.json` beside the drafts, and after the template changes
run:

```bash
aggrega import orders --sync
```

It reads the target the record keeps, `cloudformation`, and changes only what the
import wrote. After the instance's `AllocatedStorage` changes from `"20"` to
`"50"` in `template.yaml`, the import says:

```text
changed spec.components.orders-db.infra.storage.size in release.yaml
```

and writes `release.yaml` with that one line changed, `size: "50Gi"`; the values
you wrote beside it stay as they are. A part the source left alone stays as it is
on disk, edited or not; where the source changed a part you edited, it stops,
names the part, and writes nothing, for you to reconcile by hand.
[aggrega import](../../language-reference/cli/aggrega-import.md) describes the
rules and every flag in full.

## Nested stacks

A template can deploy another through an `AWS::CloudFormation::Stack` resource
whose `TemplateURL` names a file beside it as a relative path. The import reads
the child templates inside the imported directory: it starts from one template,
the root, reads each template the root names, and drafts the resources of all of
them as one Aggregate.

The directory you import is therefore the common ancestor of the parent and of
every child its `TemplateURL`s name. A template the parent reaches by
`../shared/database.yaml` lies beside the parent's folder, so the import is given
the folder holding both. Every template beneath the directory is handed to the
importer, and the root is the one no other template names. Two templates no other names have no one root, and the
import stops and names both, and the setting that picks one:

```text
halt: the sources app/main.yaml, reports/main.yaml are each linked by no other source, and the root setting names none of them: set root to the path of the one to start from
```

The `root` setting names the one to start from, in the importer's entry of the
workspace configuration, through a `plugins.importer` attachment. The `uri` names
the importer by its identity and the version of the compiler you run, as
`aggrega plugin add importer` writes it
([Which importer turns a source into drafts](../../language-reference/cli/configuration.md#which-importer-turns-a-source-into-drafts)):

```yaml
plugins:
  importer:
    - uri: importer/cloudformation:<version>
      with:
        settings:
          root: app/main.yaml
```

With `root` set to the parent, the import reads `app/main.yaml` and the children
its `TemplateURL`s name, and leaves the other candidate out. It names each part it
read and each it did not, in the header of the Aggregate:

```text
# Sources read: app/main.yaml, shared/database.yaml.
# Not read: reports/main.yaml.
# The nested stack Database of app/main.yaml is read as the resources of its template shared/database.yaml, each drafted with Database before its logical ID.
```

A child's resources are drafted with the parent's resource name before their
logical IDs, so the child's `OrdersDb` becomes the instance `database-orders-db`.

A child outside the imported directory, or at a URL such as an S3 address, is not
read: the import never opens a file outside the directory it was given and never
fetches one. It warns, naming the resource and the reason, and drafts the stack
resource as written, carrying each output of that template the template reads as
the text CloudFormation evaluates when the stack deploys:

```text
warn: Network (AWS::CloudFormation::Stack) of app/main.yaml deploys a template linked by a path leaving the imported directory, which the import does not read: no resource of that template is drafted, Network is drafted as written, and each output of it the template reads is carried as text CloudFormation evaluates when the stack deploys; to draft its resources, place the template inside the imported directory and write its TemplateURL as a relative path to it
warn: Audit (AWS::CloudFormation::Stack) of app/main.yaml deploys a template linked by a URL, which the import does not read: no resource of that template is drafted, Audit is drafted as written, and each output of it the template reads is carried as text CloudFormation evaluates when the stack deploys; to draft its resources, place the template inside the imported directory and write its TemplateURL as a relative path to it
```

Place the child inside the imported directory and the next import reads it.

## A SAM project

A SAM project keeps its template at `template.yaml`. After `sam build`, the
project also holds `.aws-sam/build/template.yaml`, the template SAM rewrote for
the code it built. Importing the project folder reads both, and since neither
names the other the import stops and names both:

```text
halt: the sources .aws-sam/build/template.yaml, template.yaml are each linked by no other source, and the root setting names none of them: set root to the path of the one to start from
```

Import `template.yaml` itself:

```bash
aggrega import sam-app/template.yaml
```

or set `root` to `template.yaml`, as [Nested stacks](#nested-stacks) shows, and
import the folder. Either way the import reads the template you wrote, not the
one the build produced.

## When a name is taken

A resource the draft makes a Component of takes the name the import chooses for
it, from its type: `imported/component/aws-ses-configurationset` for the
configuration set. Where a Component of that name already exists in a catalog
folder of the workspace or in the hub, and this import did not draft it, the
import does not write over it and does not guess. It holds the resource back,
neither drafting nor referencing it, and warns. Importing the example a second
time into another folder of the same workspace, with `--output-dir second`, after
the first import wrote the Component into the workspace's `catalog` folder, says:

```text
warn: Mailer (AWS::SES::ConfigurationSet) is held back: the catalog holds the Component imported/component/aws-ses-configurationset a draft of it takes, which this import did not draft, so the resource is neither drafted nor referenced; imported/component/aws-ses-configurationset carries no component.aggrega.ai/category label, and the importer kit references the Component a mapping names only where that label matches the mapping's category: label it in the catalog; to reference it, write in the importer's settings the entry {"mapping_overrides":{"cloudformation":{"AWS::SES::ConfigurationSet":{"component":"imported/component/aws-ses-configurationset","traits":{"component.aggrega.ai/hosting":"managed","component.aggrega.ai/type":"resource"},"vendor":"configurationset"}}}}, then fill the instance's infra in the Release
made no choice for Mailer (AWS::SES::ConfigurationSet)
```

The `mapping_overrides` setting of the importer's entry, keyed by the format,
`cloudformation`, and then by the resource type, maps the type to the Component
that exists, and the entry the warning prints is the one to write
([Settings](../../language-reference/plugins/core-importers.md#settings)). This
Component carries no category label, so the warning asks for one: give the
Component a `component.aggrega.ai/category` label in the catalog, and write the
same value as the entry's `category`. With both, the next import references the
Component:

```text
mapped Mailer (AWS::SES::ConfigurationSet) to imported/component/aws-ses-configurationset as a reference, HIGH at 0.9
```

The entry for `mailer` in the Release is empty. The Component declares a required
`name` and the draft writes none, so the import ends reporting it as missing, with
the drafts written. Write it in the Aggregate, as the Component declares it.

## What the draft leaves to you

The import drafts what the template states and what your catalog determines, and
says where it stopped. For a template it leaves these:

- **The substrate the template creates to serve others.** A log group, for
  example, is the operator's: a template that creates one, `AppLogs` of the type
  `AWS::Logs::LogGroup`, gets this warning, and a comment in the Aggregate:

  ```text
  warn: the source creates substrate the draft leaves to the operator and drafts nothing for: AppLogs (AWS::Logs::LogGroup), of which the format says a log group is the operator's: the compute Recipes read one by name under infra.overrides, as awslogs-group and LogGroup, which the Release leaves for its answers file, the comment above the key naming the resource; provide each where the Release deploys, and fill the pointers the Release leaves for them
  ```

  The draft creates no log group, and the stack the build writes holds none:
  where the Release deploys, the resource exists already, or you deploy it with
  the template you imported.
- **Values the draft does not place.** Each Release entry's comment lists the
  properties the draft does not place, so the template's setting is stated, not
  dropped silently. Where a Component has a place for one, you write it.
- **Exports of another stack.** The instance's subnet group and security group
  come from exports of a stack the template does not hold. The draft carries them
  as the intrinsic that reads them, and the stack that exports them has to exist
  where this one deploys.
