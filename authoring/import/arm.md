# Import an Azure Resource Manager template

This walkthrough imports a small Azure Resource Manager template — an Event Hubs
namespace deployed through the Azure Verified Modules module, an App Service site
running a container, a static web app and the virtual network the site is meant
to join — and builds the result as one Azure Resource Manager template. The
import drafts the Aggregate, the Release and the Manifest: the namespace and the
site become references to the standard library's Components, the static web app,
which no Component stands for, is drafted from the template, and the values the
template states in a form a Release can take are carried over. A few values it
does not are left for you, and the page shows which and where. Every file and
every block of output below comes from a real run; the template and each stage of
the walkthrough are in the
[import-arm](../../language-reference/examples/import-arm/README.md) example,
where a check script runs the import again, compares what it writes, what it
prints and the blocks this page quotes with the files kept there, confirms the
draft stops where this page says, and builds the reviewed Release.

## Draft the example

You can run this import with the commands on this page, or
[have your AI assistant run it for you](#with-an-ai-assistant).

Write the example into a new folder named after it:

```bash
aggrega draft --example import-arm
```

It then prints the commands to run next. The first changes into the new folder;
the one after it, below, changes into its `source` folder, which holds what this
page imports and is where the import runs:

```bash
cd import-arm
```

## The template

`main.json` is the compiled form of a template: the JSON a Bicep build writes,
which Azure Resource Manager deploys. Its parameter is the region, and it begins
with a virtual network holding the subnet the site joins:

<!-- quotes: source/notes/main.json -->
```json
{
  "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "location": {
      "type": "string",
      "defaultValue": "westeurope"
    }
  },
  "resources": [
    {
      "type": "Microsoft.Network/virtualNetworks",
      "apiVersion": "2023-11-01",
      "name": "vnet-notes",
      "location": "[parameters('location')]",
      "properties": {
        "addressSpace": {
          "addressPrefixes": [
            "10.20.0.0/16"
          ]
        },
        "subnets": [
          {
            "name": "snet-app",
            "properties": {
              "addressPrefix": "10.20.1.0/24",
              "delegations": [
                {
                  "name": "web",
                  "properties": {
                    "serviceName": "Microsoft.Web/serverFarms"
                  }
                }
              ]
            }
          }
        ]
      }
    },
[… omitted: the rest of the template]
```

The namespace is deployed through the Azure Verified Modules module
`avm/res/event-hub/namespace` at 0.15.3: a `Microsoft.Resources/deployments`
resource whose `template` member holds the module's own compiled template, more
than 3,700 lines of it, and whose `parameters` are what the template sets for the
module:

<!-- quotes: source/notes/main.json -->
```json
    {
      "type": "Microsoft.Resources/deployments",
      "apiVersion": "2022-09-01",
      "name": "ehModule",
      "properties": {
        "mode": "Incremental",
        "expressionEvaluationOptions": {
          "scope": "inner"
        },
        "parameters": {
          "name": {
            "value": "evh-notes"
          },
          "location": {
            "value": "[parameters('location')]"
          },
          "skuName": {
            "value": "Standard"
          },
          "skuCapacity": {
            "value": 2
          },
          "publicNetworkAccess": {
            "value": "Enabled"
          },
          "enableTelemetry": {
            "value": true
          }
        },
        "template": {
          "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",
[… omitted: the module's compiled template, and the rest of the resource]
```

The module's compiled template is the one the Microsoft Container Registry
serves for that version, MIT licensed, and the
[example's README](../../language-reference/examples/import-arm/README.md#license)
carries the notice. The import reads it to recognise the module: its telemetry
prefix and version name the Azure Verified Modules module and the resource type
it deploys.

The site is a plain resource. It runs on an App Service plan that already
exists, joins the template's subnet, runs the container named in
`linuxFxVersion`, reads the module's `name` output and sets one more variable:

<!-- quotes: source/notes/main.json -->
```json
    {
      "type": "Microsoft.Web/sites",
      "apiVersion": "2023-12-01",
      "name": "notes-api",
      "location": "[parameters('location')]",
      "kind": "app,linux,container",
      "dependsOn": [
        "[resourceId('Microsoft.Resources/deployments', 'ehModule')]",
        "[resourceId('Microsoft.Network/virtualNetworks', 'vnet-notes')]"
      ],
      "properties": {
        "serverFarmId": "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/notes-platform/providers/Microsoft.Web/serverfarms/plan-notes",
        "virtualNetworkSubnetId": "[resourceId('Microsoft.Network/virtualNetworks/subnets', 'vnet-notes', 'snet-app')]",
        "siteConfig": {
          "linuxFxVersion": "DOCKER|ghcr.io/example/notes-api:2.3.0",
          "appSettings": [
            {
              "name": "EVENTHUB_NAMESPACE",
              "value": "[reference('ehModule').outputs.name.value]"
            },
            {
              "name": "EVENTHUB_NAME",
              "value": "notes"
            }
          ]
        }
      }
    },
```

The static web app is a plain resource too. Beside the template, a parameters
file supplies the one parameter:

<!-- quotes: source/notes/main.parameters.json -->
```json
{
  "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "location": { "value": "northeurope" }
  }
}
```

The two files sit in the folder `notes`, and an `.aggrega-config.yaml` beside
that folder makes the directory a workspace, so the import writes its drafts
there:

<!-- quotes: source/.aggrega-config.yaml -->
```yaml
# The workspace key marks this directory as the workspace root, so an import run
# here writes its drafts beside the notes folder.
workspace: {}
# The registry the importer is fetched from the first time an import needs it.
default_registry: hub.aggrega.ai
```

The import reads a template and its parameters file as JSON with comments,
recognising a template by its `$schema` and its `resources`, and a parameters
file by its `$schema` and its `parameters`. It weighs each resource against the
Components of the workspace's catalog, which it reads as
[How an import runs](README.md#how-an-import-runs) describes, and it reads no
cloud account: a value the template computes while it deploys is carried as the
expression that computes it, never looked up.

Change into `source`:

```bash
cd source
```

## Run the import

Name the folder holding the template. The importer recognises the template and
its parameters file by their contents:

<!-- quotes: import-command -->
```bash
aggrega import notes
```

No `--target` is named. The importer declares `arm` as its default target, since
the standard library's Recipes for Azure Resource Manager bind to it, and the
import drafts a Manifest for it; an import that names a target, with `--target`,
drafts for that one instead. The record the import writes beside its drafts
keeps the target, and `--sync` reuses it.

On standard output it lists what it wrote:

<!-- quotes: draft/stdout.txt -->
```text
wrote aggregate.yaml
wrote release.yaml
wrote manifest.yaml
wrote catalog/component/imported/compute/microsoft-web-staticsites/0.1.0/component.yaml
wrote catalog/recipe/arm/microsoft-web-staticsites/0.1.0/recipe.yaml
wrote .aggrega-import.json
```

On standard error, with `<workspace>` standing for the folder you ran it in:

<!-- quotes: draft/import.txt -->
```text
[… omitted: a warning that the importer runs unverified, printed where its module is read from beside its Plugin entity in a catalog folder rather than fetched]
read as the arm format, with drafted paths relative to <workspace>
info: the drafts are for the target "arm", the importer's declared default; an import naming a target drafts for that one
info: ehmodule deploys the Azure Verified Modules resource module avm/res/event-hub/namespace, of telemetry prefix 46d3xbcp.res.962075c, version 0.15.3, named "Event Hub Namespaces" in its metadata: it is one node of the resource type Microsoft.EventHub/namespaces, the parameters it sets read as the module's, and the module's telemetry is not carried, as whether a Recipe sends telemetry is the Recipe's to set
warn: notes-api sets the variable EVENTHUB_NAMESPACE at properties.siteConfig.appSettings.0.value from ehmodule's outputs.name.value, and the drafted Aggregate does not wire it: ehmodule publishes no provides key for it; the instance notes-api is connected to ehmodule for the dependency alone, a comment above the connection saying why; write the value where the instance is configured
info: the resource notes-site of the type Microsoft.Web/staticSites@2023-01-01 is drafted from the source as the Component imported/compute/microsoft-web-staticsites and the Recipe microsoft-web-staticsites on arm, carrying the properties the source writes; the decision's swap hint names the import drafting it from the vendor's schema
warn: the source creates substrate the draft leaves to the operator and drafts nothing for: vnet-notes (Microsoft.Network/virtualNetworks), of which the format says the network a component runs in is the operator's: a component of the catalog takes it by its resource ID under infra.overrides, reading the parameter location at location; provide each where the Release deploys, and fill the pointers the Release leaves for them
warn: notes-api sets the variable EVENTHUB_NAME in the environment of the instance notes-api, and the draft delivers an instance's environment from its connections alone, so the variable is not carried: the instance's Release entry names it, for the author to set where the instance is configured
mapped ehmodule (Microsoft.EventHub/namespaces) to core/messaging/azure-event-hubs as a reference, HIGH at 0.8656
mapped notes-site (Microsoft.Web/staticSites) to imported/compute/microsoft-web-staticsites as a draft, NONE at 0.05
made no choice for vnet-notes (Microsoft.Network/virtualNetworks)
mapped notes-api (Microsoft.Web/sites) to core/compute/server as a reference, HIGH at 0.9
made no choice for resourceId('Microsoft.Network/virtualNetworks/subnets', 'vnet-notes', 'snet-app') ()
[… omitted: what the pull could not render yet, a stop of the App Service Recipe's assertion that the Release names the subnet, which the sections below explain]
  external inputs: dependency pins were written and are complete; 0 external input(s) pinned, and any this Release also needs are still unpinned
  external inputs: a build of this Release halts naming the unpinned URL; fixing what stopped the render and resolving again pins it
Pull complete: <workspace>/release.lock (entities=8, source_artifacts=0, external_inputs=0)
External inputs were not fully discovered: dependency pins are complete, external-input pins may not be (see the diagnostics above)
```

- **The `info` lines** state what the importer decided without a question. The
  first says the drafts are for `arm`. The second recognises the module: the
  resource `ehmodule` is the Azure Verified Modules module of the Event Hubs
  namespace, and the parameters the template sets for it read as the module's
  own, so the draft treats it as one namespace and not as a nested template to
  read. The third says the static web app is drafted from the template.
- **The `warn` lines** name what the draft does not carry. The first is the
  variable the site reads from the module's `name` output: the draft wires a
  connection only for what a Component publishes, and the namespace publishes no
  key for its name, so the connection exists for the dependency alone. The
  second names the virtual network the template creates, which the draft leaves
  to you, as [What the draft leaves to you](#what-the-draft-leaves-to-you)
  explains. The third names the variable the site sets that no connection of the
  draft delivers.
- **The `mapped` lines** say what each resource became. `ehmodule` is an instance
  of the standard library's `core/messaging/azure-event-hubs`, and `notes-api` an
  instance of the generic server, `core/compute/server`, each matched in the high
  tier and referenced. `notes-site` matches no Component, so it is a draft, with
  no match. The `made no choice` lines name what the draft decides nothing for:
  the virtual network, and the subnet pointer the Release leaves empty.
- **The pull** is the import fetching what the drafted Release depends on, as
  [`aggrega pull`](../../language-reference/cli/aggrega-pull.md) does, into
  `release.lock`. The Recipes the Manifest names for the namespace and the site
  write their resources themselves and source nothing, so `source_artifacts` is
  `0` and the pull reaches outside the catalog for nothing. The import then tries
  to render the Release to find the inputs the build would fetch, and the App
  Service Recipe stops it: the draft names no subnet yet. The import still ends,
  with the lockfile written, and says that the external inputs were not fully
  discovered; the stop is the one validation reports next.

## What it writes

The Aggregate, the Release and the Manifest are named `imported/notes`, after
the folder the import read — a template imported as a file is named after the
file, `main` — under the namespace the importer's `target_namespace` setting
sets, `imported` unless you set another
([Settings](../../language-reference/plugins/core-importers.md#settings)).

`aggregate.yaml` — one entry per resource, and the connection the site draws:

<!-- quotes: draft/aggregate.yaml -->
```yaml
# Sources read: main.json, main.parameters.json.
# Substrate the source creates, left to the operator: vnet-notes (Microsoft.Network/virtualNetworks).
apiVersion: aggrega.ai/v1beta1
kind: Aggregate
metadata:
  name: imported/notes
  version: 0.1.0
  description: Draft Aggregate imported from a source in the arm format.
spec:
  components:
    ehmodule:
      type: core/messaging/azure-event-hubs
    notes-site:
      type: imported/compute/microsoft-web-staticsites
      values:
        name: "notes-site"
    notes-api:
      type: core/compute/server
      uses:
        # Not wired: notes-api sets the variable EVENTHUB_NAMESPACE at properties.siteConfig.appSettings.0.value from ehmodule's outputs.name.value; ehmodule publishes no provides key for it.
        ehmodule:
          ehmodule:
            target: ehmodule
```

The static web app is a component of a type the import drafted,
`imported/compute/microsoft-web-staticsites`. The site's connection to the
namespace carries no `inject` block, since the draft delivers a variable from a
connection only when the Component publishes the value, and the comment above it
says which variable it does not wire and why.

`release.yaml` — the environment, each resource's settings:

<!-- quotes: draft/release.yaml -->
```yaml
apiVersion: aggrega.ai/v1beta1
kind: Release
metadata:
  name: imported/notes
  # environment is a drafted default, since no source names the environment this Release deploys to; change it to name the one it deploys to.
  environment: development
  version: 0.1.0
  description: Draft Release imported from a source in the arm format.
spec:
  aggregate: imported/notes
  manifest: imported/notes
  components:
    # Module parameters the source sets and the draft does not translate: location, name, publicNetworkAccess, skuCapacity, skuName.
    ehmodule: {}
    notes-site:
      infra:
        # From the template parameter location, the value the parameters file supplies.
        location: "northeurope"
        overrides:
          appLocation: "/"
          outputLocation: "dist"
          name: "Free"
          tier: "Free"
    # Properties the source writes and the draft does not place: kind, properties.siteConfig.linuxFxVersion.
    # Environment variables the source sets and no connection delivers: EVENTHUB_NAME = notes.
    notes-api:
      infra:
        overrides:
          service_plan_id: "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/notes-platform/providers/Microsoft.Web/serverfarms/plan-notes"
          # From the template parameter location, the value the parameters file supplies.
          location: "northeurope"
          # Left for the Release, since the source cannot supply it: infra.overrides.virtual_network_subnet_id, the pointer to the resource "resourceId('Microsoft.Network/virtualNetworks/subnets', 'vnet-notes', 'snet-app')", which the draft leaves to the operator and the source names as "[resourceId('Microsoft.Network/virtualNetworks/subnets', 'vnet-notes', 'snet-app')]"; the catalog Recipe takes the resource's literal identifier: write it
          virtual_network_subnet_id: ""
```

The environment, `development`, is a default the import writes because no
template names one. The template's `location` parameter reaches the static web
app's and the site's entries as the value the parameters file supplies,
`northeurope`. The site's `service_plan_id` is carried as the literal identifier
the template writes. The namespace's entry is empty, and the comment above it
lists the module parameters the draft does not translate.

One key is empty, and its comment says why: `virtual_network_subnet_id` is a
pointer to a resource, which the standard library's Recipes for Azure Resource
Manager take as the literal `/subscriptions/…` identifier of the resource. The
template writes the site's subnet as a `resourceId` expression naming a resource
of the template itself, and an expression is not an identifier the Recipe can
take, so the draft leaves the key empty and names the expression in a comment. A
drafted resource, by contrast, keeps every expression of the template whole.

The container image is not in the entry. The template writes it inside
`linuxFxVersion`, a property the draft places nowhere, and the comment above the
entry lists `kind` and `linuxFxVersion` among the properties it does not place.

`manifest.yaml` — the Recipe each component is realized with on `arm`:

<!-- quotes: draft/manifest.yaml -->
```yaml
apiVersion: aggrega.ai/v1beta1
kind: Manifest
metadata:
  name: imported/notes
  version: 0.1.0
spec:
  mappings:
    components:
      type: {}
      name:
        ehmodule: arm/azure-event-hubs
        notes-site: arm/microsoft-web-staticsites
        notes-api: arm/server-app-service
```

The static web app has no Component of the standard library, so the import
drafts one with a Recipe under the workspace's `catalog` folder: the Component
`imported/compute/microsoft-web-staticsites` declares the `name` the template
gives the site, a `location` and an `overrides` object for every property the
template writes, under the vendor's own names, and the Recipe
`microsoft-web-staticsites` writes one `Microsoft.Web/staticSites` resource of
that type and API version. The drafts are plain files for you to read and edit:

<!-- quotes: draft/catalog/component/imported/compute/microsoft-web-staticsites/0.1.0/component.yaml -->
```yaml
apiVersion: aggrega.ai/v1beta1
kind: Component
metadata:
  name: imported/compute/microsoft-web-staticsites
  version: 0.1.0
  description: "Draft Component of the resource type Microsoft.Web/staticSites@2023-01-01, imported from a source in the arm format."
  labels:
    component.aggrega.ai/type: resource
    component.aggrega.ai/category: compute
    component.aggrega.ai/hosting: managed
spec:
  schema:
    values:
      type: object
      properties:
        # identity: the resource's own name or identifier
        # The source writing the resource gives no description of name.
        name:
          type: string
          required: true
      additionalProperties: false
    infra:
      type: object
      properties:
        # placement: where the resource is deployed
        # The source writing the resource gives no description of location.
        location:
          type: string
          required: true
        # override: every writable property no other rule places, each under the vendor's own name
        overrides:
          type: object
          description: "Writable settings of Microsoft.Web/staticSites@2023-01-01, each under the vendor's own name, which the Recipe passes to the resource as written; its header lists the names it reads."
          additionalProperties: true
      additionalProperties: false
[… omitted: the values the Component publishes, id and name]
```

`release.lock` records the catalog entities the Release resolved to, by digest;
`.aggrega-import.json` is the record of what the import wrote, which a later
`aggrega import --sync` reads.

## Validate

```bash
aggrega validate --release release.yaml
```

The validation stops. The draft names no subnet for the site, and the App Service
Recipe joins a site to a subnet of your own network only by its identifier:

```text
  [CATALOG_ERROR E0033]
    Recipe/FeatureRecipe assertions
[… omitted: the line beginning "caused by: Recipe "server-app-service" instance "notes-api" assertion "placement_supplied"", which ends with the Recipe's message: … infra.overrides.virtual_network_subnet_id is "", and this Recipe takes the subnet the app joins by virtual network integration as the subnet's resource ID: set it to /subscriptions/<subscription>/resourceGroups/<group>/providers/Microsoft.Network/virtualNetworks/<network>/subnets/<subnet>, a subnet delegated to Microsoft.Web/serverFarms, or remove it]
release dependency validation failed: 1 diagnostic(s)
```

A refusal names what to change and where, in the document you change. Here it is
the `notes-api` entry of `release.yaml`, and after the subnet the build names a
second value: the container image. The template writes it in `linuxFxVersion`,
which the draft does not place, and the generic server's Recipe for App Service
holds no image of its own, so the build stops with a message saying the Release
sets no `infra.image`. The image is yours to supply in the Release.

The namespace's comment lists `skuName`, `skuCapacity` and `location`, which the
module takes from the template and the draft does not place either. Without
them the Recipe's own defaults stand; `infra.overrides.sku_name`,
`infra.overrides.sku_capacity` and `infra.overrides.location` carry the
template's. The example's `reviewed` folder holds the `release.yaml` with all of
them written:

<!-- quotes: reviewed/release.yaml -->
```yaml
    # Module parameters the source sets and the draft does not translate: location, name, publicNetworkAccess, skuCapacity, skuName.
    ehmodule:
      infra:
        overrides:
          # Where the template sets skuName and skuCapacity, which the draft places nowhere: the namespace's tier and its throughput units.
          sku_name: "Standard"
          sku_capacity: 2
          # Where the template sets location, which the draft places nowhere on a module: the namespace's region.
          location: "northeurope"
```

and the site's entry, with the image and the subnet:

<!-- quotes: reviewed/release.yaml -->
```yaml
    # Properties the source writes and the draft does not place: kind, properties.siteConfig.linuxFxVersion.
    # Environment variables the source sets and no connection delivers: EVENTHUB_NAME = notes.
    notes-api:
      infra:
        # The template writes the container image in properties.siteConfig.linuxFxVersion, which the draft places nowhere: the image the site runs.
        image: "ghcr.io/example/notes-api:2.3.0"
        overrides:
          service_plan_id: "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/notes-platform/providers/Microsoft.Web/serverfarms/plan-notes"
          # From the template parameter location, the value the parameters file supplies.
          location: "northeurope"
          # The subnet the template's virtual network holds, as the literal ID the Recipe takes, in the resource group the network is deployed to.
          virtual_network_subnet_id: "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/notes-network/providers/Microsoft.Network/virtualNetworks/vnet-notes/subnets/snet-app"
```

The check script of the example builds this Release, and confirms that the draft
stops with the message above.

## Build

Change into a folder holding the reviewed Release, or edit `release.yaml` in
`source` in the same way, and build:

```bash
aggrega validate --release release.yaml
aggrega build --release release.yaml --auto-pull
```

The Release no longer matches the `release.lock` the import wrote, so the build
needs `--auto-pull`, which resolves it again; without it the build stops and
names `aggrega pull`. The validation prints:

```text
release dependency validation passed: release.yaml (schema-pillar + dependency pillars)
```

and the build, with `<workspace>` standing for the folder you ran it in:

```text
[… omitted: the pull's line reporting the lockfile it wrote]
[… omitted: a total build time, which differs per run]
Build completed: 1 file written to <workspace>/dist
```

## Read arm-template.json

The build writes one file, `dist/arm/arm-template.json`: the assembled template,
in language version 2.0, with one entry under `resources` for each resource a
component writes, named by the component's instance id folded into words:

```text
Ehmodule                the Event Hubs namespace, in a nested template
NotesApi                the App Service site
NotesApiFtpPublishing   the site's FTP publishing policy, which the Recipe turns off
NotesApiScmPublishing   the site's SCM publishing policy, which the Recipe turns off
NotesSite               the static web app, the resource the draft Recipe writes
```

The namespace's entry holds the namespace the Recipe writes, with the settings
the Release carries — the tier, the throughput units and the region — and the
Recipe's own for the rest:

```json
    "Ehmodule": {
      "apiVersion": "2025-04-01",
      "metadata": {
        "aggrega.ai/provenance": {
          "aggrega.ai/aggregate-name": "imported/notes",
          "aggrega.ai/boundary-path": "default",
[… omitted: a compiler-version entry, which moves with the build]
          "aggrega.ai/component-id": "ehmodule",
          "aggrega.ai/environment": "development",
          "aggrega.ai/provider": "arm",
[… omitted: a provider-version entry, which moves with the build]
          "aggrega.ai/recipe-uri": "azure-event-hubs:1.0.0"
        }
      },
      "name": "[format('Ehmodule-{0}', uniqueString(deployment().name))]",
      "properties": {
        "expressionEvaluationOptions": {
          "scope": "inner"
        },
        "mode": "Incremental",
        "template": {
          "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",
          "contentVersion": "1.0.0.0",
          "outputs": {
            "serviceBusEndpoint": {
              "type": "string",
              "value": "[reference(resourceId('Microsoft.EventHub/namespaces', 'ehmodule'), '2026-01-01').serviceBusEndpoint]"
            }
          },
          "resources": [
            {
              "apiVersion": "2026-01-01",
              "location": "northeurope",
              "name": "ehmodule",
              "properties": {
                "disableLocalAuth": true,
                "isAutoInflateEnabled": false,
                "minimumTlsVersion": "1.2",
                "publicNetworkAccess": "Enabled"
              },
              "sku": {
                "capacity": 2,
                "name": "Standard",
                "tier": "Standard"
              },
              "type": "Microsoft.EventHub/namespaces"
            }
          ]
        }
      },
      "type": "Microsoft.Resources/deployments"
    },
```

The site's entry carries the plan, the subnet, the image as the container the
site runs, and the port the generic server declares:

```json
    "NotesApi": {
      "apiVersion": "2025-03-01",
      "kind": "app,linux,container",
      "location": "northeurope",
      "metadata": {
        "aggrega.ai/provenance": {
          "aggrega.ai/aggregate-name": "imported/notes",
          "aggrega.ai/boundary-path": "default",
[… omitted: a compiler-version entry, which moves with the build]
          "aggrega.ai/component-id": "notes-api",
          "aggrega.ai/environment": "development",
          "aggrega.ai/provider": "arm",
[… omitted: a provider-version entry, which moves with the build]
          "aggrega.ai/recipe-uri": "server-app-service:1.0.0"
        }
      },
      "name": "notes-api",
      "properties": {
        "clientAffinityEnabled": false,
        "httpsOnly": true,
        "publicNetworkAccess": "Disabled",
        "serverFarmId": "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/notes-platform/providers/Microsoft.Web/serverfarms/plan-notes",
        "siteConfig": {
          "alwaysOn": true,
          "appSettings": [
            {
              "name": "WEBSITES_PORT",
              "value": "8080"
            }
          ],
          "ftpsState": "Disabled",
          "linuxFxVersion": "DOCKER|ghcr.io/example/notes-api:2.3.0",
          "minTlsVersion": "1.2",
          "vnetRouteAllEnabled": true
        },
        "virtualNetworkSubnetId": "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/notes-network/providers/Microsoft.Network/virtualNetworks/vnet-notes/subnets/snet-app"
      },
      "type": "Microsoft.Web/sites"
    },
```

The site receives `WEBSITES_PORT` and nothing the template set: `EVENTHUB_NAMESPACE`
and `EVENTHUB_NAME` are variables the draft did not deliver, which the `warn`
lines and the comments name. The namespace's name is `ehmodule`, the component's
name, where the template named it `evh-notes`: the module's `name` is the
Recipe's to set, and the comment above the entry lists it among the parameters
the draft does not translate.

## Deploy it

The template is a resource-group template. The build writes no parameters file and
runs nothing against Azure: the commands are yours. Preview what the template would
change, then deploy it:

```bash
az deployment group what-if --resource-group <group> --template-file dist/arm/arm-template.json
az deployment group create --resource-group <group> --name <name> --template-file dist/arm/arm-template.json
```

The [ARM provider](../../language-reference/providers/arm.md#deploying-at-resource-group-scope)
page sets out these commands, the stack that never deletes what it stops
managing, and what each flag decides. Before the template deploys, the
resources the Release names but the template does not deploy must exist: the
App Service plan and the subnet the site joins, which is delegated to
`Microsoft.Web/serverFarms`.

## With an AI assistant

An AI assistant [set up with Aggrega's tools](../../ai-assistants/set-up.md)
can do the same: paste this prompt into it.

<!-- copyable -->

> Use the Aggrega tools only, and create no folder yourself. If the Workspace folder holds no `import-arm` folder yet, call the `draft` tool once with `example` set to `import-arm` and no `dir`: it writes the example into a new `import-arm` folder. Then call the `import` tool with `workspace_root` set to `import-arm/source` and `source` set to `notes`: it writes its drafts into `import-arm/source` and pulls what they need. Then call the `build` tool with `workspace_root` set to `import-arm/reviewed`, `release` set to `release.yaml`, `auto_pull` set to true and `write` set to true. Tell me which files the build wrote; they are under `import-arm/reviewed/dist/`.

The `reviewed` folder holds the draft with the values written, as
[Validate](#validate) lists them; to review your own draft, ask the assistant to
validate `import-arm/source` first and tell you what it stops at.

## Open it in VS Code

With the
[Aggrega extension for Visual Studio Code](../editor/install.md#installing-the-extension)
installed, open the folder `import-arm/source` in VS Code, where the import wrote
its drafts. The folder holds one Release, the drafted `release.yaml`, so the
editor selects it for you, and it checks the drafts against that Release as you
edit them, marking what it finds in the file and in the Problems panel.
**Aggrega: Show topology graph**, in the Command Palette,
draws the Release's components and the connections between them. **Aggrega: Build**,
**Aggrega: Preview build** and **Aggrega: Pull** act on the same Release, and each
is also a button on the **Commands** panel of the **Aggrega** view in the activity
bar; Build writes its files into the folder's `dist/`.
[Use Aggrega in Visual Studio Code](../editor/README.md) covers the rest.

## When the template changes

Keep `.aggrega-import.json` beside the drafts, and after the template changes
run:

```bash
aggrega import notes --sync
```

It reads the target the record keeps, `arm`, and changes only what the import
wrote. After the static web app's `outputLocation` changes from `dist` to `build`
in `main.json`, the import says:

```text
changed spec.components.notes-site.infra.overrides.outputLocation in release.yaml
```

and writes `release.yaml` with that one line changed; the values you wrote
beside it stay as they are. A part the source left alone stays as it is on disk,
edited or not; where the source changed a part you edited, it stops, names the
part, and writes nothing, for you to reconcile by hand.
[aggrega import](../../language-reference/cli/aggrega-import.md) describes the
rules and every flag in full.

## Templates that link templates beside them

A template can deploy another through a `Microsoft.Resources/deployments` resource
whose `templateLink.relativePath` names a file beside it. The import reads the
linked templates inside the imported directory: it starts from one template, the
root, reads each template the root links, and drafts the resources of all of them
as one Aggregate.

A directory holding several templates names its root by what links to what: the
root is the one template no other links. A directory holding two templates with
no link between them has no one root, and the import stops and names both:

```text
halt: the sources network.json, site.json are each linked by no other source, and the root setting names none of them: set root to the path of the one to start from
```

The `root` setting names the one to start from, in the importer's entry of the
workspace configuration. The `uri` names the importer by its identity and the
version of the compiler you run, as `aggrega plugin add importer` writes it
([Which importer turns a source into drafts](../../language-reference/cli/configuration.md#which-importer-turns-a-source-into-drafts)):

```yaml
plugins:
  importer:
    - uri: importer/arm:<version>
      with:
        settings:
          root: site.json
```

With `root` set, the import reads `site.json` and the templates it links, and
leaves `network.json` out.

A link that leaves the imported directory — `../shared/dns.json` — is not read:
the import never opens a file outside the directory it was given. It warns, naming
the resource and the path, and drafts the resource as a resource of its own,
carrying each output of that template the template reads as the expression that
evaluates it when the template deploys:

```text
warn: dns is a Microsoft.Resources/deployments resource of main.json whose template is linked by a relative path leaving the imported directory, which the import does not read: no resource of that template is drafted, and each of its outputs the template reads is carried as text evaluated when the template deploys; to draft its resources, place the linked template inside the imported directory and link it by templateLink.relativePath
```

Place the linked template inside the imported directory and the next import reads
it.

## When a name is taken

A resource the draft makes a Component of takes the name the import chooses for
it, from its type: `imported/compute/microsoft-web-staticsites` for the static web
app. Where a Component of that name already exists in a catalog folder of the
workspace or in the hub, and this import did not draft it, the import does not
write over it and does not guess. It holds the resource back, neither drafting nor
referencing it, and warns. Importing the example a second time
into another folder of the same workspace, with `--output-dir second`, after the
first import wrote the Component into the workspace's `catalog` folder, says:

```text
warn: notes-site (Microsoft.Web/staticSites) is held back: the catalog holds the Component imported/compute/microsoft-web-staticsites a draft of it takes, which this import did not draft, so the resource is neither drafted nor referenced; to reference it, write in the importer's settings the entry {"mapping_overrides":{"arm":{"Microsoft.Web/staticSites":{"component":"imported/compute/microsoft-web-staticsites","category":"compute","traits":{"component.aggrega.ai/hosting":"managed","component.aggrega.ai/type":"resource"},"vendor":"staticsites"}}}}, then fill the instance's infra in the Release
```

The `mapping_overrides` setting of the importer's entry, keyed by the format,
`arm`, and then by the resource type, maps the type to the Component that
exists, and the entry the warning prints is the one to write
([Settings](../../language-reference/plugins/core-importers.md#settings)).
With it, the next import references the Component: `notes-site` is mapped as a
reference, and its entry in the Release holds no keys but a comment naming the
properties the template writes:

```yaml
    notes-site: {}
```

The Component declares a required `name` and `location` and the draft writes
neither, so the import ends reporting each as missing, with the drafts written.
Write them, and the properties the comment lists, in the Release, as the
Component declares them.

## What the draft leaves to you

The import drafts what the template states and what your catalog determines, and
says where it stopped. For a template it leaves these:

- **The substrate the template creates to serve others.** The virtual network
  `vnet-notes` and its subnet exist in the template for the site. The draft
  creates no network: a Component of the catalog takes the network it runs in by
  its resource ID, under `infra.overrides`, and the network is yours. The `warn`
  line names each such resource, and the pointers that referred to it are the
  empty keys of the Release. Where the Release deploys, the network and the subnet
  exist already, or you deploy them with the template you imported.
- **Values the draft does not place.** Each Release entry's comment lists the
  module parameters and the resource properties the draft does not place, among
  them here the namespace's tier, throughput units, region and name, and the
  site's `kind` and `linuxFxVersion`, so the template's setting is stated, not
  dropped silently. Where a Component has a place for one, you write it, as the
  [Validate](#validate) section does.
- **Environment variables no connection delivers.** The site's `EVENTHUB_NAMESPACE`
  and `EVENTHUB_NAME` are named in the comments of the Aggregate and of the Release
  and in a `warn` line each. Where the site is configured in the Release, you set
  them.
- **The container image.** The draft carries an image only where the template
  states it in a property the draft places. This template writes it in
  `linuxFxVersion`, so the draft carries none, and the build stops naming
  `infra.image`: the image is yours to supply in the Release.

A module the standard library maps nothing for is kept whole. Where a template
deploys an Azure Verified Modules module of a resource type no row of the importer
maps, the import drafts a Component and a Recipe that source the module as
`oci://mcr.microsoft.com/bicep/<path>` with telemetry off, and a module parameter
fed by a secret is left out and warned. A resource of a type no row maps is drafted
from the template as the static web app is; the drafts' swap hint names
`aggrega import --format arm-schema`, which drafts the same Component from the
vendor's schema instead, as [Deploy a service the catalog does not have](resource-schemas.md)
describes.

## A string written across lines

JSON does not admit a raw line break inside a string, and the importer reads
the template as JSON. A template holding one — a script written across lines in
a `scriptContent` value — is not recognised, since reading it fails:

```text
[E0350]
  no importer recognises the source (source "main.json"). Pass --format to name it explicitly (for example --format agent-framework, --format arm-schema, --format arm, --format cloudformation-schema, --format compose, --format crewai, --format dify, --format flowise, --format google-adk, --format langflow, --format langgraph, --format mcp, --format n8n or --format terraform-schema)
```

and with `--format arm`, the import halts naming the place:

```text
halt: could not parse source "main.json" as arm: json parse: invalid character '\n' in string literal at line 14, column 35
```

Write each string on one line, with `\n` where the text breaks, and the import
reads it.
