# Deploy a service the catalog does not have

When the catalog holds no Component for a cloud service, the vendor's own
description of that service's resource type can stand in for one.
`aggrega import` reads the description — the schema a cloud vendor publishes for
a resource type — and drafts two files from it: a Component that declares the
type's settings in the pillars Aggrega reads, and a Recipe that realizes the
Component for a provider by writing exactly one resource of that type. You review
the drafts, add the lines that use them to an Aggregate and a Release, and
build.

Three formats are read, each by a [core importer](../../language-reference/plugins/core-importers.md#the-resource-schema-importers)
that serves it:

| Format | The schema you export | Recipe's provider |
| --- | --- | --- |
| `cloudformation-schema` | a CloudFormation resource type, from `aws cloudformation describe-type` or the provider schema file | `cloudformation` |
| `terraform-schema` | a Terraform or OpenTofu provider's schema, from `terraform providers schema -json` | `terraform` |
| `arm-schema` | an Azure resource provider's Bicep type file, `types.json` | `arm` |

This page works the Azure case end to end, then shows the CloudFormation and
Terraform cases, and a variant that drafts a Recipe alone for a Component the
catalog already holds. The commands and the output on the Azure parts below are
from a run of a build of the compiler release that carries these importers and
the `arm` provider.

Nothing is fetched on your behalf. You export the schema with the vendor's own
tool, so the import reads a file you hold and reaches no cloud account.

## Export the schema

Each vendor's tool writes the schema to a file. Run the one for your cloud, in a
workspace:

```bash
# CloudFormation: any registered type, third-party and private ones included.
aws cloudformation describe-type --type RESOURCE --type-name AWS::SQS::Queue > sqs-queue.json

# Terraform or OpenTofu: in a directory whose configuration requires the provider.
terraform init && terraform providers schema -json > schema.json

# Azure: no export is needed. Bicep's type files are published in the
# Azure/bicep-types-az repository, one for each resource provider and API
# version, at generated/<namespace>/<provider>/<apiVersion>/types.json.
```

The Azure case below uses the file for
`Microsoft.ManagedIdentity` at API version `2024-11-30`, kept in a folder named
`msi` under the name Bicep gives it, `types.json`.

### The Azure schema file and its licence

`types.json` of `Microsoft.ManagedIdentity` at `2024-11-30` is a file of the
[Azure/bicep-types-az](https://github.com/Azure/bicep-types-az) repository,
copyright Microsoft Corporation, distributed under the MIT License. The
descriptions the drafts below quote are Microsoft's, and the licence's notice
applies to them:

```text
MIT License

Copyright (c) Microsoft Corporation.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE
```

The workspace is a folder holding an `.aggrega-config.yaml` with a `workspace`
key, and the `msi` folder with the file:

```text
.aggrega-config.yaml
msi/types.json
```

## List the types to draft

A schema file can hold more than one resource type, and the import drafts only
the ones you name. List what the file holds:

```bash
jq -r '.[] | select(."$type" == "ResourceType") | .name' msi/types.json
```

```text
Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30
Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2024-11-30
Microsoft.ManagedIdentity/identities@2024-11-30
```

Then name the one you want under the `resource_types` setting of the importer's
entry in `.aggrega-config.yaml`. Every workspace already serves the importer, so
the entry is needed only to pass `resource_types`. Its `uri` names the importer
and the compiler's version, which `aggrega version` prints; an importer is
handed its settings through such an entry, as
[Which importer turns a source into drafts](../../language-reference/cli/configuration.md#which-importer-turns-a-source-into-drafts)
describes:

```yaml
workspace: {}
default_registry: hub.aggrega.ai
plugins:
  importer:
    - uri: importer/arm-schema:<compiler version>
      with:
        settings:
          resource_types:
            - Microsoft.ManagedIdentity/userAssignedIdentities
```

Names are matched exactly for CloudFormation (`AWS::SQS::Queue`) and Terraform
(`aws_sqs_queue`), and without regard to case for Azure, where a name may carry
an API version after an `@`. A file that holds exactly one type needs no list.
An import of a file holding several types and no list stops and names them:

```text
halt: the sources hold 3 resource types and the resource_types setting names none: write the types to draft in it, one of Microsoft.ManagedIdentity/userAssignedIdentities, Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials, Microsoft.ManagedIdentity/identities
```

A listed type the file does not hold stops the import too, naming the nearest
names it does hold. A halt drafts nothing, so no file is written.

## Run the import

Name the folder, or the file:

```bash
aggrega import msi
```

On standard output it lists what it wrote:

```text
wrote catalog/component/imported/security/microsoft-managedidentity-userassignedidentities/0.1.0/component.yaml
wrote catalog/recipe/arm/microsoft-managedidentity-userassignedidentities/0.1.0/recipe.yaml
wrote .aggrega-import.json
```

On standard error, with `<workspace>` standing for the folder you ran it in:

```text
read as the arm-schema format, with drafted paths relative to <workspace>
mapped Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30 (Microsoft.ManagedIdentity/userAssignedIdentities) to imported/security/microsoft-managedidentity-userassignedidentities as a draft, NONE at 0.05
```

`aggrega import` recognises a Bicep type file named `types.json`, as
`Azure/bicep-types-az` names them, and `--format arm-schema` names the format
for a file named otherwise. `--format` is also the way to import a large export,
such as a provider's whole Terraform schema, without the import recognising it
first.

The `mapped` line says the resource type became a draft of its own, with no
catalog Component close to it. The drafts are written under `catalog/`, a folder
the workspace reads as a catalog, so they resolve at the next validate and
build with nothing to configure. The record `.aggrega-import.json` lists them,
so `aggrega import --sync` can bring them up to date with a changed schema
without writing over an edit of yours.

## What the drafts say

The Component, `component.yaml`, sorts each property of the resource type into
one pillar, and a comment beside each key names the rule that placed it:

- A **read-back** property, one the cloud sets and you cannot, is not an input.
  A scalar becomes a `provides` key a consumer can read.
- A **secret** is drafted as a reference to where its value comes from, never as
  a value, as [Secrets](#secrets) below describes.
- **Placement**, where the resource lives, such as Azure's `location`, goes to
  `infra`, the pillar an operator supplies for each environment.
- **Identity**, the resource's own name, goes to `values`, the pillar the
  developer writes.
- **Any other required** property goes to `infra`.
- **Every other writable** property goes under `infra.overrides`, an open map
  that keeps the vendor's own spelling of each name.

For this resource type the Component reads:

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Component
metadata:
  name: imported/security/microsoft-managedidentity-userassignedidentities
  version: 0.1.0
  description: "Draft Component of the resource type Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30, imported from a source in the arm-schema format."
  labels:
    component.aggrega.ai/type: resource
    component.aggrega.ai/category: security
    component.aggrega.ai/hosting: managed
spec:
  schema:
    values:
      type: object
      properties:
        # identity: the resource's own name or identifier
        # [vendor schema text] The resource name
        name:
          type: string
          description: "[vendor schema text] The resource name"
          required: true
      additionalProperties: false
    infra:
      type: object
      properties:
        # placement: where the resource is deployed
        # [vendor schema text] The geo-location where the resource lives
        location:
          type: string
          description: "[vendor schema text] The geo-location where the resource lives"
          required: true
        # override: every writable property no other rule places, each under the vendor's own name
        overrides:
          type: object
          description: "Writable settings of Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30, each under the vendor's own name, which the Recipe passes to the resource as written; its header lists the names it reads."
          additionalProperties: true
      additionalProperties: false
    provides:
      type: object
      properties:
        # read back: published under provides
        # [vendor schema text] The resource id
        id:
          type: string
          description: "[vendor schema text] The resource id"
        # … client_id, principal_id and tenant_id, each read back the same way
      additionalProperties: false
```

Every text the draft takes from the vendor's schema opens with
`[vendor schema text]`, so you can find them and rewrite them in your own words
before the Component leaves your workspace. Text the import composes carries no
marker.

The Recipe, `recipe.yaml`, realizes the Component on the `arm` provider. Its
header comment lists every key it reads, with its rule and its type, and what
it does not read:

```yaml
spec:
  # This Recipe realizes imported/security/microsoft-managedidentity-userassignedidentities with one resource of the type Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30. It reads the keys below, each with its type, its rule and the first sentence of the vendor's description; any other key under infra.overrides halts the build naming it.
  # infra.location: string, required; placement: where the resource is deployed
  # values.name: string, required; identity: the resource's own name or identifier
  # infra.overrides.tags: object; override: writable, set under infra.overrides in the vendor's spelling
  # infra.overrides.isolationScope: string; override: writable, set under infra.overrides in the vendor's spelling
  capability: arm
  implements: imported/security/microsoft-managedidentity-userassignedidentities:0.1.0
  locals:
    symbol: "{{ capitalizedWords .context.instance_id }}"
  provides:
    id: "[resourceId('Microsoft.ManagedIdentity/userAssignedIdentities'{{ range splitList \"/\" (toString (index .values \"name\")) }}, '{{ replace \"'\" \"''\" . }}'{{ end }})]"
    client_id: "[reference('{{ .locals.symbol }}').clientId]"
    # … principal_id and tenant_id the same way
  assertions:
    overrides_this_recipe_reads: |
      # halts naming any key under infra.overrides the header does not list
  artifacts:
    template.yaml: |
      # … the resource, written under the symbolic name locals.symbol holds
```

The Recipe writes one resource, the one the type names, and nothing else: no
resource group, no network, no identity you did not declare. Each `provides`
value is a whole expression Azure evaluates when the template deploys, passed
to a consumer as the string it is. A key of `infra.overrides` the header does
not list halts the build naming it, so a misspelt setting is caught before
anything deploys.

Review both files before you build. Moving a setting between pillars is an
edit of the Component and the Recipe's reading of it, and the files are yours:
nothing the build depends on is held anywhere else.

## Use the drafts in an Aggregate and a Release

The import drafts no Aggregate, no Manifest and no Release, so the lines that
use the drafted Component are yours. In an Aggregate, `aggregate.yaml`, one
component of the drafted type, carrying the identity the `values` pillar holds:

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Aggregate
metadata:
  name: identities
  version: 1.0.0
spec:
  components:
    deploy-identity:
      type: imported/security/microsoft-managedidentity-userassignedidentities:0.1.0
      values:
        name: deploy-identity
```

In a Manifest, `manifest.yaml`, one line saying which Recipe realizes the type:

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Manifest
metadata:
  name: identities
  version: 1.0.0
spec:
  mappings:
    components:
      type:
        imported/security/microsoft-managedidentity-userassignedidentities:0.1.0: arm/microsoft-managedidentity-userassignedidentities:0.1.0
```

In a Release, `release.yaml`, the boundary the component lands in and the
`infra` pillar the Recipe requires, the placement:

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Release
metadata:
  name: identities
  version: 1.0.0
  environment: production
spec:
  aggregate: ./aggregate.yaml
  manifest: ./manifest.yaml
  boundaries:
    azure:
      directory: azure
      components:
        deploy-identity:
          infra:
            location: westeurope
```

## Validate and build

```bash
aggrega validate --release release.yaml
```

```text
release dependency validation passed: release.yaml (schema-pillar + dependency pillars)
```

Pull what the Release depends on, then build:

```bash
aggrega pull --release release.yaml
aggrega build --release release.yaml
```

```text
Pull complete: release.lock (entities=…, source_artifacts=…, external_inputs=…)
[… omitted: the build's elapsed time]
Build completed: 1 file written to <workspace>/dist
```

The build writes `dist/azure/arm/arm-template.json`, the one template of the
`azure` boundary, with one resource, under the symbolic name its instance gives
it. Beside the resource's own members, the build records which Aggregate,
Release and Recipe produced it under `metadata`:

```json
{
  "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",
  "contentVersion": "1.0.0.0",
  "languageVersion": "2.0",
  "resources": {
    "DeployIdentity": {
      "apiVersion": "2024-11-30",
      "location": "westeurope",
      "metadata": {
        "aggrega.ai/provenance": {
          "aggrega.ai/aggregate-name": "identities",
          "aggrega.ai/boundary-path": "azure",
          "aggrega.ai/compiler-version": "<compiler version>",
          "aggrega.ai/component-id": "deploy-identity",
          "aggrega.ai/environment": "production",
          "aggrega.ai/provider": "arm",
          "aggrega.ai/provider-version": "<compiler version>",
          "aggrega.ai/recipe-uri": "microsoft-managedidentity-userassignedidentities:0.1.0"
        }
      },
      "name": "deploy-identity",
      "type": "Microsoft.ManagedIdentity/userAssignedIdentities"
    }
  }
}
```

The template is what you hand to Azure; [the arm provider](../../language-reference/providers/arm.md)
describes the commands that deploy it at resource-group scope. A resource type
writable only at the subscription or the management-group scope is drafted as
a fragment for that scope, and its Recipe's header names the boundary
annotation the Release sets, as
[Deploying at subscription scope](../../language-reference/providers/arm.md#deploying-at-subscription-scope)
and
[Deploying at management-group scope](../../language-reference/providers/arm.md#deploying-at-management-group-scope)
describe. A type writable only at the tenant scope, or only as an extension of
another resource, is refused by name.

## Secrets

A secret property's value is never written into a draft, and no default is
drafted for it. How it reaches the resource follows the provider:

- **Azure**: a top-level `securestring` parameter of the template, named after
  the instance and the property, which you supply when you deploy.
- **CloudFormation**: a template `Parameters` entry marked `NoEcho`, named the
  same way. A secret the vendor marks optional is a required parameter.
- **Terraform**: a Feature slot on the Component, and a module variable marked
  `sensitive: true`; the value comes through the secret the Release attaches to
  the slot.

A CloudFormation property is read as a secret when its name holds a credential
word — password, secret, token, credential, private key, API key or
passphrase — and does not end in `Arn`, `Id`, `Name` or `Ref`. That reading is a
convention of the draft, and the Recipe's header marks each property it read as
a secret, so you confirm them in review.

## The same import on CloudFormation and Terraform

The steps are the same; only the export and the shape of the Recipe differ.
The two cases below are drafted from synthetic schemas, whose vendor text is
left out of what follows.

### CloudFormation

```bash
aws cloudformation describe-type --type RESOURCE --type-name AWS::Example::Ledger > ledger.json
aggrega import ledger.json
```

The import writes a Component and a Recipe, and one warning for each vendor
constraint it cannot carry:

```text
wrote catalog/component/imported/component/aws-example-ledger/0.1.0/component.yaml
wrote catalog/recipe/cloudformation/aws-example-ledger/0.1.0/recipe.yaml
wrote .aggrega-import.json
```

```text
read as the cloudformation-schema format, with drafted paths relative to <workspace>
warn: the property "LedgerName" does not carry the vendor schema's pattern "…": the catalog reads a pattern as an RE2 regular expression, which refuses it: …
warn: the property "Rules[].Children[]" does not carry the vendor schema's shape below it: the vendor schema's definitions refer back to themselves there, so it is drafted as an open object
mapped AWS::Example::Ledger (AWS::Example::Ledger) to imported/component/aws-example-ledger as a draft, NONE at 0.0167
```

The Recipe's `template.yaml` declares the resource under a logical id the
instance gives it, with the secret as a `NoEcho` parameter and each `provides`
key written as `!Ref` or `!GetAtt`, repeated under `provides` so the
`cloudformation` provider projects it into the stack's Outputs:

```yaml
  artifacts:
    template.yaml: |
      Parameters:
        {{ .locals.logical_id }}MasterPassword:
          Type: String
          NoEcho: true
      Resources:
        {{ .locals.logical_id }}:
          Type: AWS::Example::Ledger
          Properties:
            # … one line for each key the header lists
            MasterPassword: !Ref {{ .locals.logical_id }}MasterPassword
      provides:
        arn: !GetAtt {{ .locals.logical_id }}.Arn
```

### Terraform

```bash
terraform init && terraform providers schema -json > schema.json
aggrega import schema.json
```

```text
wrote catalog/component/imported/component/aws-example-ledger/0.1.0/component.yaml
wrote catalog/recipe/terraform/aws-example-ledger/0.1.0/recipe.yaml
wrote catalog/recipe/terraform/aws-example-ledger/0.1.0/module/main.tf.json
wrote .aggrega-import.json
```

A Terraform export names the providers a configuration requires and no version
of them, so the import warns:

```text
warn: no version of the provider hashicorp/aws is known, so the module drafted for aws_example_ledger requires it without a version constraint: set terraform.required_providers.aws.version in the module/main.tf.json beside the Recipe, then run aggrega pin on the Recipe
```

A Terraform draft is a Recipe with a module beside it. `module/main.tf.json`
declares one variable for each input, the one resource, `this`, with each
argument read from its variable, and the provider the export names. The
Recipe's `spec.source` points at the module, and its `valuesMapping` fills each
variable from the Component's pillars, writing an optional input only where
the Release sets it. Pin the module before the first pull, so the lock records
its digest:

```bash
aggrega pin catalog/recipe/terraform/aws-example-ledger/0.1.0/recipe.yaml
```

```text
Pinned Recipe "aws-example-ledger": wrote <workspace>/catalog/recipe/terraform/aws-example-ledger/0.1.0/entity.lock (remote source pins: 0, imported file pins: 0, local source file pins: 1). Commit it beside the entity
```

An unpinned Recipe halts a pull, naming `aggrega pin`. Pin again after each
edit of the module.

The Aggregate, Manifest and Release lines are those of the Azure case, with the
drafted names and the provider's own `infra`: a Terraform Release names the
provider's placement keys, such as `region`, where the Component declares them.

## A Component the catalog already has

When the catalog holds a Component for the service, and only the Recipe is
missing for your provider, name that Component in the setting. The import then
drafts the Recipe alone, written against the Component's pillars. Each
entry of `resource_types` is a type name, or an object with the type and the
Component:

```yaml
plugins:
  importer:
    # The entry passes resource_types; the importer is served without it.
    - uri: importer/arm-schema:<compiler version>
      with:
        settings:
          resource_types:
            - type: Microsoft.ManagedIdentity/userAssignedIdentities
              component: acme/security/identity
```

The Recipe takes the name `identity-microsoft-managedidentity-userassignedidentities`,
after the Component, so it never takes the name of a Recipe the catalog already
holds. A Component of the catalog that declares a `values` key named like a
property of the type reads that property from `values`; a property the vendor
requires and the Component has no key for is read from `infra.overrides`, with
an assertion that halts the build until the Release sets it. Each key the
Component provides that matches a read-back attribute by name is written. For
every other, the draft writes a template that fails naming the key, so a build
halts until you map it, and the import warns:

```text
warn: the Component acme/security/identity provides principal_id, and no attribute Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30 reads back carries its name, so the drafted Recipe's provides.principal_id halts the build until it is mapped: map it to an attribute Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30 reads back, one of id, properties.clientId, properties.principalId, properties.tenantId
```

Azure nests this attribute under `properties`, so the line to write is the
one the full draft of the type carries:

```yaml
  provides:
    principal_id: "[reference('{{ .locals.symbol }}').principalId]"
```

With that line written, the Release names the Component in its Aggregate and
the Recipe in its Manifest as above, sets the placement under
`infra.overrides.location`, and validates and builds to the same template.

A name the catalog holds no Component of is drafted as a new Component under
that name, and the import warns, so a name that mistypes a Component is not
mistaken for a new one.

## Where to go next

- [Core importers](../../language-reference/plugins/core-importers.md#the-resource-schema-importers)
  describes what each importer reads, how it chooses between several types and
  between several providers, the split in full, what each target drafts and
  the diagnostics the three report.
- [The arm provider](../../language-reference/providers/arm.md) describes the
  template an Azure draft is merged into and the scopes it deploys at.
- [aggrega import](../../language-reference/cli/aggrega-import.md) is the
  command's full reference.
