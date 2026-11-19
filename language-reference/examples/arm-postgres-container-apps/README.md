---
example:
  level: advanced
  tier: advanced
  position: 15
  products: [core/datastore/postgres, core/compute/server]
  shows: [cloud-infrastructure, credentials, connections, guardrails]
---

# PostgreSQL and a Container Apps server on Azure Resource Manager

A managed PostgreSQL database and the server that reads it, authored once as
developer intent and assembled into **one Azure Resource Manager template**. The
database is an Azure Database for PostgreSQL flexible server, the server is an
Azure Container Apps app, and the database's administrator password is a Key
Vault secret that already exists, so no password is written anywhere in the
template.

The same developer intent is built as one template, as two templates deployed
one after the other and linked by the server's read of the database's host, and —
deliberately — as a build that halts because two components would claim one name
inside the template.

Output blocks on this page are copied from a real run, per
[Reading the output on these pages](../reading-the-output.md).

## Files

- `aggregate.yaml` — developer intent: a `payments-db` database of type
  `core/datastore/postgres` and an `orders-api` server of type
  `core/compute/server` that declares it uses the database. Nothing about Azure
  lives here.
- `release-one-deployment.yaml` — both components in one boundary, so both
  assemble into a single template. It names the Key Vault secret that holds the
  password, the network the database is placed in, the Container Apps
  environment the server runs in and the server's image.
- `release-two-deployments.yaml` — the same two components in two boundaries, so
  they assemble into two templates, one per output directory. The server's
  template reads the database's host from the database's deployment.
- `release-negative-name-collision.yaml` with `aggregate-name-collision.yaml` —
  **expected to fail.** Two components whose instance ids become one symbolic
  name.
- `manifest.yaml` — binds each component type and the credential Feature to the
  Recipe that implements it on this target.
- `.aggrega-config.yaml` — names the hub registry the catalog entities resolve
  from.

Every subscription-specific value in the Release is a placeholder: the
subscription id is the zero GUID, and the resource group, virtual network, DNS
zone, vault, environment and image names stand for resources the operator
already runs. Replace them with your own before deploying.

## Draft the example

You can build this example with the commands below, or [have your AI assistant build it for you](#with-an-ai-assistant).

Write the example into a new folder named after it:

```sh
aggrega draft --example arm-postgres-container-apps
```

It then prints the commands to run next. The first changes into the new folder:

```sh
cd arm-postgres-container-apps
```

## Build

This example has a release for each build, so name the one you want. One release builds
per run. Each release's first build needs its lockfile, which the pull writes:

```bash
aggrega pull --release release-one-deployment.yaml
aggrega build --release release-one-deployment.yaml
```

The build prints, with `<workspace>` standing for this example's folder:

```
[… omitted: the pull's line, which reports the lockfile it wrote, and a lint notice about the credential Feature's origin]
Total build time:               4.9s
Build completed: 1 file written to <workspace>/dist
```

The assembled template lands at `dist/one-deployment/arm/arm-template.json`.
Every component rendering to that directory contributes to that one document;
the provider writes a single template rather than a file per component.

## With an AI assistant

An AI assistant [set up with Aggrega's tools](../../../ai-assistants/set-up.md)
can do the same: paste this prompt into it.

<!-- copyable -->

> Use the Aggrega tools only, and create no folder yourself. If the Workspace folder holds no `arm-postgres-container-apps` folder yet, call the `draft` tool once with `example` set to `arm-postgres-container-apps` and no `dir`: it writes the example into a new `arm-postgres-container-apps` folder. Then call the `build` tool with `workspace_root` set to `arm-postgres-container-apps`, `release` set to `release-one-deployment.yaml`, `auto_pull` set to true and `write` set to true. Tell me which files the build wrote; they are under `arm-postgres-container-apps/dist/`.

## One template, two nested deployments

Both components assemble into one template, and each becomes one **nested
deployment**: an Azure Resource Manager resource of type
`Microsoft.Resources/deployments` that carries a vendored module's own template
and the parameters the Release's settings map to. The template's `resources`
section holds these entries:

| Symbolic name | Contributed by |
| --- | --- |
| `PaymentsDb` | the database component's Recipe, `arm/postgres-flexible-server` |
| `OrdersApi` | the server component's Recipe, `arm/server-container-apps` |

Each Recipe wraps a module from Microsoft's Azure Verified Modules programme,
pinned to a git tag whose commit and archive digest the Recipe's `entity.lock`
records, so every build vendors exactly the same bytes. The head of the server's entry,
with the module's template omitted:

```json
    "OrdersApi": {
      "apiVersion": "2025-04-01",
      "metadata": {
        "aggrega.ai/provenance": {
          "aggrega.ai/aggregate-name": "aggregate",
          "aggrega.ai/boundary-path": "azure",
          [… omitted: a compiler-version entry, which moves with the build]
          "aggrega.ai/component-id": "orders-api",
          "aggrega.ai/environment": "production",
          "aggrega.ai/provider": "arm",
          [… omitted: a provider-version entry, which moves with the build]
          "aggrega.ai/recipe-uri": "server-container-apps:1.0.0"
        }
      },
      "name": "[format('OrdersApi-{0}', uniqueString(deployment().name))]",
      [… omitted: the nested deployment's mode and parameters, and the module's template]
    },
```

The symbolic name is the component's instance id folded into words:
`orders-api` becomes `OrdersApi`, and `payments-db` becomes `PaymentsDb`. The
nested deployment's own name adds `uniqueString(deployment().name)`, so
deploying the template twice under two deployment names creates two separate
sets of nested deployments instead of one overwriting the other.

Each Recipe turns telemetry off. The module deploys a telemetry resource by
default, reporting to Microsoft, and the Recipe binds `enableTelemetry` to
`false` on each nested deployment, so the template carries none:

```json
          "enableTelemetry": {
            "value": false
          },
```

### The server reads the database by expression

The Aggregate says the server wants the database's `host` as `DB_HOST`. The
address of a flexible server does not exist until Azure creates it, so the
build pipes an expression through and Azure Resource Manager evaluates it while
the template deploys:

```json
                "env": [
                  {
                    "name": "DB_HOST",
                    "value": "[reference('PaymentsDb').outputs.fqdn.value]"
                  },
                  {
                    "name": "DB_NAME",
                    "value": "orders"
                  },
                  {
                    "name": "DB_PORT",
                    "value": "5432"
                  },
                  {
                    "name": "DB_USER",
                    "value": "orders_admin"
                  }
                ],
```

`host` is an expression over the `PaymentsDb` nested deployment's `fqdn`
output; `database`, `port` and `user` are plain strings. The compiler never
looks up an address, so `aggregate.yaml` carries nothing Azure-specific, and
the reference to `PaymentsDb` is also what makes Azure Resource Manager deploy
the database before the server.

## The password is a Key Vault reference

The flexible server needs an administrator password, and neither the service
nor its module draws one. The Release attaches a `core/referenced-secret`
Feature to the database's `password` slot and gives it the secret's resource ID:

```yaml
          features:
            password:
              type: core/referenced-secret
              infra:
                origin: /subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/orders-security/providers/Microsoft.KeyVault/vaults/orders-vault/secrets/orders-db-password
```

The Manifest binds that Feature to `arm/key-vault-secret`, which renders no
resource: it publishes the ID as written, and the database Recipe splits it
into the vault's ID and the secret's name. The nested deployment receives a
Key Vault reference in place of a password:

```json
          "administratorLoginPassword": {
            "reference": {
              "keyVault": {
                "id": "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/orders-security/providers/Microsoft.KeyVault/vaults/orders-vault"
              },
              "secretName": "orders-db-password"
            }
          },
```

**No secret text is ever in the template.** The reference is resolved by Azure
Resource Manager as the template deploys, under the identity that deploys it, so
that identity needs permission to read the secret and the vault must allow
template deployment to read from it. The secret itself is created outside this
Release; the Release names it and never carries its value.

The attachment is in the Release because where a password lives is the
operator's decision. The Aggregate says nothing about it, and a Release never
writes `values:`.

## Deploying the template

The template is a resource-group template. The provider writes no parameters
file and runs nothing against Azure: the commands are the operator's. Preview
what the template would change, then deploy it:

```bash
az deployment group what-if --resource-group <group> --template-file dist/one-deployment/arm/arm-template.json
az deployment group create --resource-group <group> --name <name> --template-file dist/one-deployment/arm/arm-template.json
```

Or deploy it as a deployment stack that never deletes what it stops managing:

```bash
az stack group create --name <stack> --resource-group <group> \
  --template-file dist/one-deployment/arm/arm-template.json \
  --action-on-unmanage detachAll --deny-settings-mode none
```

`--action-on-unmanage detachAll` leaves a resource alone when a later template
stops declaring it, and `--deny-settings-mode none` puts no deny assignment on
what the stack manages. The [ARM provider](../../providers/arm.md#deploying-at-resource-group-scope)
page sets out the deploy commands and what each flag decides.

## Two templates, deployed one after the other

`release-two-deployments.yaml` builds the same Aggregate with the database and
the server in two boundaries. Each boundary writes its own template, and the
server's template reads the database's host from the database's deployment:

```bash
aggrega pull --release release-two-deployments.yaml
aggrega build --release release-two-deployments.yaml
```

The build writes two files, one per output directory:

```
[… omitted: the pull's line, which reports the lockfile it wrote, and a lint notice about the credential Feature's origin]
Total build time:               3.0s
Build completed: 2 files written to <workspace>/dist
```

`dist/two-deployments-database/arm/arm-template.json` is the database's template,
and `dist/two-deployments-server/arm/arm-template.json` is the server's. The
Aggregate is the one the single template builds from; only the Release differs.

### The database's template publishes what the server reads

The server reads some of the database's entries, so the database's template gains
a string output for each, named for the component and the entry. The host is the
expression of the single template, passed through `string()` so every value
crosses as text:

```json
    "payments_zhdb__host": {
      "type": "string",
      "value": "[string(reference('PaymentsDb').outputs.fqdn.value)]"
    },
```

The template also records the name it is deployed under, in its `metadata`:

```json
  "metadata": {
    "aggrega.ai/deployment-name": "aggrega--orders--two-deployments-database-zsarm"
  }
```

### The server's template reads that deployment

The server cannot reference a resource that another template declares, so it
reads the database's deployment by its resource ID and takes the output from it:

```json
                    "value": "[reference(format('/subscriptions/{0}/resourceGroups/{1}/providers/Microsoft.Resources/deployments/{2}', subscription().subscriptionId, resourceGroup().name, 'aggrega--orders--two-deployments-database-zsarm'), '2025-04-01').outputs.payments_zhdb__host.value]"
```

The ID is built from the server's own subscription and resource group, which
assumes the database is deployed to the same resource group. When the database's
boundary declares `aggrega.ai/azure-subscription` or
`aggrega.ai/azure-resource-group` in its `annotations`, it names where its template
is deployed, and the read then names those values as strings.

### Deploy the database first, under the recorded name

The deployment's name is part of what the server reads, so the database's template
is deployed before the server's, under exactly the name it records. Nothing reads
the server's deployment, so its name is yours to choose:

```bash
az deployment group create --resource-group <group> -n aggrega--orders--two-deployments-database-zsarm --template-file dist/two-deployments-database/arm/arm-template.json
az deployment group create --resource-group <group> -n <name> --template-file dist/two-deployments-server/arm/arm-template.json
```

The database's name is the one in its template's
`metadata["aggrega.ai/deployment-name"]`. It derives from the Release's name and
the boundary's output directory, so changing the database boundary's `directory:`
in the Release renames its deployment, and the server's template, built again,
reads the new name. Build both templates from one Release and deploy the database
as recorded.

## The build that halts

```bash
aggrega pull --release release-negative-name-collision.yaml
aggrega build --release release-negative-name-collision.yaml
```

`aggregate-name-collision.yaml` declares two databases, `payments-db` and
`payments--db`. They are two distinct instance ids, and both are valid server
names, but the provider folds an instance id into words to name its nested
deployment, and both fold to `PaymentsDb`. A symbolic name addresses one
resource in a template, so the build stops:

```
[… omitted: the pull's lines, which report the same collision while writing the lockfile]
[TRANSLATION_ERROR E0038]
  dispatch groups whose contributors derive one name more than once in one key space
  caused by (2):
    [TRANSLATION_ERROR] release-negative-name-collision.yaml
      derived name collision: one name is derived more than once in one key space ("PaymentsDb", key space "symbolic-names", derived by component "payments--db", provider "arm", dispatch path "name-collision/arm")
  ---
    [TRANSLATION_ERROR] release-negative-name-collision.yaml
      derived name collision: one name is derived more than once in one key space ("PaymentsDb", key space "symbolic-names", derived by component "payments-db", provider "arm", dispatch path "name-collision/arm")
```

What to read out of that:

- **Both ends are named.** Each entry gives the component, so both are
  searchable in the files you wrote. Both are reported because both derive the
  same symbol.
- **The shared symbol and its key space are named.** `PaymentsDb` is the
  symbol both reached, and `symbolic-names` is the name space of the template's
  resources.
- **Nothing is emitted.** The build stops rather than writing a template in
  which one nested deployment silently replaces the other. Renaming either
  component in the Aggregate clears it.

## Identical input, identical output

Building twice from unchanged inputs produces byte-identical templates. The
compiler resolves no live data: it never calls Azure and never runs Azure
Resource Manager, so a rebuild has nothing to discover that could move the
bytes. That is the property a diff-based review relies on.

`dist/` is committed beside the Releases that build it — `dist/one-deployment/`,
`dist/two-deployments-database/` and `dist/two-deployments-server/` — so a change
to the Recipes shows up as a diff of the templates. The two version
entries in each provenance block move with the compiler that builds, as the
excerpts above note. The `*.lock` files are generated and are not committed;
they regenerate from the files that are.
