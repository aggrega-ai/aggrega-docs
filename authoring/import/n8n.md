# Import an n8n workflow

This walkthrough imports a workflow exported from n8n — an AI agent answering
chat messages with an OpenAI chat model and a memory — into an Aggregate, a
Release and a Manifest that build n8n carrying the workflow for Docker Compose
as they are written, then builds them and runs the result. Every file and
every block of output below comes from a real run; the workflow and each stage
of the walkthrough are in the
[import-n8n](../../language-reference/examples/import-n8n/README.md)
example, where a check script runs the import again, compares what it writes,
what it prints and the blocks this page quotes with the files kept there, and
validates and builds what the import wrote.

## Scaffold the example

Write the example into a new folder named after it:

```bash
aggrega scaffold --example import-n8n
```

It then prints the commands to run next. The first changes into the new folder;
the one after it, below, changes into its `source` folder, which holds what this
page imports and is where the import runs:

```bash
cd import-n8n
```

## The workflow

`support-agent.json`, written for this walkthrough in the shape n8n exports a
workflow, holds four nodes: a chat trigger, an AI Agent with a short system message, an OpenAI Chat Model node
selecting `gpt-4o-mini`, and a Simple Memory node, joined by the connections
n8n lists by the name of the node each leaves. The chat trigger is public, so a
chat message sent to its URL starts the workflow, and it asks the sender for a
user and password, which it checks against a basic-authentication credential
n8n stores:

<!-- quotes: source/support-agent.json -->
```json
      "parameters": {
        "public": true,
        "authentication": "basicAuth",
        "options": {}
      },
      [… omitted: the node's identifier, name, type, version, position and webhook identifier]
      "credentials": {
        "httpBasicAuth": {
          "id": "Vx3mQ8rLb2Nk7Tz5",
          "name": "Chat basic auth"
        }
      }
```

The model node selects its credential the same way, by reference — the export
carries each credential's identifier and name, never the user, the password or
the key:

<!-- quotes: source/support-agent.json -->
```json
      "parameters": {
        "model": {
          "__rl": true,
          "value": "gpt-4o-mini",
          "mode": "list",
          "cachedResultName": "gpt-4o-mini"
        },
        "options": {}
      },
      "id": "6f1d2c3a-7b4e-4a8f-9c21-0d3e5f6a7b03",
      "name": "OpenAI Chat Model",
      "type": "@n8n/n8n-nodes-langchain.lmChatOpenAi",
      "typeVersion": 1.2,
      "position": [120, 220],
      "credentials": {
        "openAiApi": {
          "id": "Rb7nW2xQ9kT4mZ1c",
          "name": "OpenAI account"
        }
      }
```

Beside the workflow, an `.aggrega-config.yaml` makes the folder a workspace:

<!-- quotes: source/.aggrega-config.yaml -->
```yaml
# The workspace key marks this directory as the workspace root, so an import run
# here writes its drafts beside support-agent.json.
workspace: {}
# The registry the importer is fetched from the first time an import needs it.
default_registry: hub.aggrega.ai
```

and `import-answers.yaml` holds the answers to what no workflow can hold. An
import for Docker Compose needs none: it attaches the OpenAI key by a variable
reference Docker Compose fills from your shell. An import for Kubernetes
attaches it by the name of a Kubernetes Secret, which only you can name, so the
file names that Secret (see [On Kubernetes](#on-kubernetes)):

<!-- quotes: source/import-answers.yaml -->
```yaml
# Values the import could not draft from the source, keyed by the drafted file and the key path inside
# it. Write each one beside its key; an import of the same source, and a sync, read them from here and
# ask nothing. A secret is never written here: its key asks where the secret comes from — a variable
# name, ${NAME}, or the name of a Kubernetes Secret.
release.yaml:
  # The origin of the secret value, written by the operator in the Release. Read exactly as
  # values.origin is. Write it here or in values.origin, never in both. A secret: name where it comes
  # from, never the value.
  spec.components.n8n.uses.model.openai-chat-model.features.credential.infra.origin: "openai-api-key"
```

[The import answers file](../../language-reference/import-answers.md)
describes the file in full.

The import weighs each node against the Components of the workspace's catalog,
and `--target` drafts a Manifest from its Recipes. The workspace names no
catalog folder, so the import reads the standard-library catalog from the
registry it fetches its importer from: a signed snapshot of the published
catalog, fetched, verified and kept in the workspace's content cache by the
first import, and named by its digest in the record the import writes beside its
drafts. A workspace that names its own catalog folders — in
`AGGREGA_CATALOG_DIRS`, or under `workspace.catalog_dirs` — imports against
those instead. Change into `source`:

```bash
cd source
```

## Run the import

<!-- quotes: import-command -->
```bash
aggrega import support-agent.json --target compose
```

On standard output it lists what it wrote:

<!-- quotes: draft/stdout.txt -->
```text
wrote aggregate.yaml
wrote release.yaml
wrote manifest.yaml
wrote .aggrega-import.json
```

On standard error, with `<workspace>` standing for the folder you ran it in:

<!-- quotes: draft/import.txt -->
```text
[… omitted: a warning that the importer runs unverified, printed where its module is read from beside its Plugin entity in a catalog folder rather than fetched]
read as the n8n format, with drafted paths relative to <workspace>
warn: the value of credentials.httpBasicAuth.id of node When chat message received is carried as written in the flow the draft carries: its format marks the field as a credential, and setting empty_credentials to marked or all writes it empty
warn: the value of credentials.openAiApi.id of node OpenAI Chat Model is carried as written in the flow the draft carries: its format marks the field as a credential, and setting empty_credentials to marked or all writes it empty
warn: node OpenAI Chat Model reaches openai-chat-model, wired to the model socket of core/ai-agent/n8n as openai-chat-model, other than through that connection: an n8n @n8n/n8n-nodes-langchain.lmChatOpenAi node reaches the part at the address the stored credential it selects, or its own parameters, give; the platform delivers this connection as OPENAI_BASE_URL and OPENAI_API_KEY, but an n8n workflow reads a variable of the platform's environment only through an expression reading $env, which the platform refuses while values.allow_env_access_in_nodes is false, the value the draft leaves it at; setting it true lets every workflow, and every user who can edit one, read every variable of the platform's environment, the delivered credentials included
made no choice for When chat message received (@n8n/n8n-nodes-langchain.chatTrigger)
made no choice for AI Agent (@n8n/n8n-nodes-langchain.agent)
mapped OpenAI Chat Model (@n8n/n8n-nodes-langchain.lmChatOpenAi) to core/ai-model/openai as a reference, HIGH at 0.9143
made no choice for Simple Memory (@n8n/n8n-nodes-langchain.memoryBufferWindow)
  warning: node "n8n" (provider "compose"): artifact "n8n-flow.compose-fragment.yaml": skipped provenance label injection — the fragment declares no compose service. Compose carries build provenance as service labels, so a fragment contributing only top-level networks, volumes or configs carries none; the services this component emits elsewhere carry the full set.
Pull complete: <workspace>/release.lock (entities=8, source_artifacts=0, external_inputs=0)
```

- **The `mapped` line** says the OpenAI Chat Model node became the standard
  library's OpenAI model, `core/ai-model/openai`, referenced rather than
  drafted, since it matched in the high tier, at 0.9143: a component of its
  own, wired to the platform's `model` socket.
- **The `made no choice` lines** say that the trigger, the agent and the memory
  stay inside the workflow, which n8n runs itself.
- **The first two `warn` lines** name the identifiers of the stored credentials
  the trigger and the model node select, which n8n marks as credentials. They
  are references, not secrets, and they are carried as written.
- **The third `warn` line** is the one to read closely: the model node reaches
  OpenAI with the stored credential it selects, not through the connection the
  draft wires. The platform delivers the connection to n8n's environment, and
  n8n refuses a workflow's reads of its environment while the Aggregate leaves
  `values.allow_env_access_in_nodes` at `false`, as the draft does. Setting it
  `true` lets every workflow, and everyone who can edit one, read every
  variable of the platform, the delivered key included. So the key the workflow
  uses is the one n8n stores, as [Run it](#run-it) shows.
- **The last two lines** are the pull. Nothing was left to answer, so the import
  pulled the drafted Release's dependencies, as `aggrega pull` does, and wrote
  `release.lock`; the build below needs nothing more. The `warning` line is one
  the build prints too, and [Validate and build](#validate-and-build) explains
  it.

The answers file names a Secret this import does not ask for: it leaves nothing
empty for it, so it applies no answer and leaves the file as it is.

## What it writes

The Aggregate, the Release and the Manifest are named
`imported/support-agent`, after the workflow's own name, `Support agent`,
reduced to `support-agent` — a workflow with no name is named after its file —
under the namespace the importer's `target_namespace` setting sets, `imported`
unless you set another
([Settings](../../language-reference/plugins/core-importers.md#settings)).

`aggregate.yaml` — one instance of the standard library's n8n platform,
`core/ai-agent/n8n`, carrying the workflow as it was exported, most of it left
out here, and the model wired to its `model` socket:

<!-- quotes: draft/aggregate.yaml -->
```yaml
apiVersion: aggrega.ai/v1beta1
kind: Aggregate
metadata:
  name: imported/support-agent
  version: 0.1.0
  description: Draft Aggregate imported from a source in the n8n format.
spec:
  components:
    n8n:
      type: core/ai-agent/n8n
      values:
        workflow_id: 'sQ4vT8nKp2LmX7bR'
        flow_definition: |
          {
            "id": "sQ4vT8nKp2LmX7bR",
            "name": "Support agent",
          [… omitted: the rest of the workflow, as exported]
          }
      uses:
        model:
          openai-chat-model:
            target: openai-chat-model
            # For the compose target, the lines below declare credential on openai-chat-model: a secret the Release alone attaches arrives under the key value, so each is declared with a key of its own and no two arrive under one; the Release attaches its origin, naming this type or none.
            features:
              credential:
                type: core/secret-value
                values:
                  key: OPENAI_API_KEY
    # swap to core/ai-model/azure-openai (score 0.4125) by setting type: core/ai-model/azure-openai
    openai-chat-model:
      type: core/ai-model/openai
      values:
        model: |-
          gpt-4o-mini
```

`workflow_id` is the identifier the export gives the workflow. The model is
`core/ai-model/openai`, with the model the node selects, `gpt-4o-mini`; the
comment above it names another Component of the catalog the node resembles,
with its score. The OpenAI key the platform presents to the model is declared
on the connection with the variable it arrives under in n8n's environment,
`OPENAI_API_KEY`; the Release says where it comes from.

`release.yaml` — the Release, which deploys the Aggregate with the Manifest:

<!-- quotes: draft/release.yaml -->
```yaml
apiVersion: aggrega.ai/v1beta1
kind: Release
metadata:
  name: imported/support-agent
  # environment is a drafted default, since no source names the environment this Release deploys to; change it to name the one it deploys to.
  environment: development
  version: 0.1.0
  description: Draft Release imported from a source in the n8n format.
spec:
  aggregate: imported/support-agent
  manifest: imported/support-agent
  components:
    n8n:
      infra:
        # The image running core/ai-agent/n8n, at the version this importer drafts, which the catalog's Recipes for it are known to run; the import does not raise or lower it to follow the source.
        image: "n8nio/n8n:1.110.1"
        # Published on this machine's loopback address, 127.0.0.1: reachable from this machine only, by any process running on it. Delete this line to keep the service internal.
        published_port: 5678
      uses:
        model:
          openai-chat-model:
            features:
              credential:
                type: core/secret-value
                infra:
                  # Attached by reference, never as a value: the credential n8n presents to openai-chat-model on its model connection, read from the variable OPENAI_API_KEY, which a target substituting variable references, as Docker Compose does when the stack starts, reads from the environment, so no file carries the value.
                  origin: "${OPENAI_API_KEY}"
    openai-chat-model: {}
```

- **`environment`** is `development`, a default the comment above it says to
  change to the environment the Release deploys to.
- **The image** is n8n 1.110.1, the version the catalog's Recipes for n8n run.
- **`published_port`** is 5678, the port n8n serves on, so the editor answers
  at `http://127.0.0.1:5678` on your machine. As its comment says, any process
  on this machine can reach it there and nothing else can; delete the line to
  keep n8n on the stack's network alone. A `published_port` other than 5678
  needs `infra.external_base_url: http://127.0.0.1:<published_port>` beside it,
  or n8n reports its editor and webhook addresses on `localhost:5678`.
- **The key** is a variable reference, `${OPENAI_API_KEY}`, which Docker
  Compose fills from your shell when the stack starts. The standard library's
  OpenAI model is a hosted service, and a connection to it must carry a
  credential, so the Release attaches one even though the workflow reads its
  key from n8n's store.

`manifest.yaml` — the Compose Recipes of the platform and the model, and the
realization that writes the key's variable reference into the Compose file as
written:

<!-- quotes: draft/manifest.yaml -->
```yaml
apiVersion: aggrega.ai/v1beta1
kind: Manifest
metadata:
  name: imported/support-agent
  version: 0.1.0
spec:
  mappings:
    components:
      type:
        core/ai-agent/n8n: compose/n8n
        core/ai-model/openai: compose/openai
    features:
      type:
        core/secret-value: compose/dotenv-secret
```

`.aggrega-import.json` is the record of what the import wrote, which a later
`aggrega import --sync` reads, and `release.lock` pins every catalog entity the
Release resolves to, by version and digest.

## Validate and build

```bash
aggrega validate --release release.yaml
aggrega build --release release.yaml
```

The validation prints:

```text
  notice: LINT: Feature "core/secret-value" at core/secret-value:1.0.0 declares property "origin" in both values: and infra: pillars (path: origin)
release dependency validation passed: release.yaml (schema-pillar + dependency pillars)
```

and the build, with `<workspace>` standing for the folder holding the drafts:

```text
  warning: node "n8n" (provider "compose"): artifact "n8n-flow.compose-fragment.yaml": skipped provenance label injection — the fragment declares no compose service. Compose carries build provenance as service labels, so a fragment contributing only top-level networks, volumes or configs carries none; the services this component emits elsewhere carry the full set.
  notice: LINT: Feature "core/secret-value" at core/secret-value:1.0.0 declares property "origin" in both values: and infra: pillars (path: origin)
[… omitted: a total build time, which differs per run]
Build completed: 1 file written to <workspace>/dist
```

The `warning` line is about the part of the Compose file that carries the
workflow, a top-level `configs` entry, which has no service to put the build's
labels on. The `notice` line is advisory: the secret Feature accepts its
`origin` from the Aggregate's `values` or the Release's `infra`, and the notice
reports that one leaf is declared in both. Neither changes the verdict.

`dist/compose/docker-compose.yaml` holds n8n and a service that imports the
workflow before n8n starts:

```yaml
services:
  n8n:
    image: n8nio/n8n:1.110.1
    environment:
      OPENAI_BASE_URL: https://api.openai.com/v1
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      N8N_BLOCK_ENV_ACCESS_IN_NODE: "true"
    ports:
      - 127.0.0.1:5678:5678
    [… omitted: the labels the build writes on every service, naming the Aggregate, the component, the environment and the compiler's version]
    volumes:
      - type: volume
        source: n8n--data
        target: /home/node/.n8n
    networks:
      - compose
    depends_on:
      n8n--import-flow:
        condition: service_completed_successfully
    [… omitted: the service's health check]
  n8n--import-flow:
    image: n8nio/n8n:1.110.1
    command:
      - import:workflow
      - --input=/flows/workflow.json
    entrypoint:
      - n8n
    [… omitted: the labels the build writes on every service]
    volumes:
      - type: volume
        source: n8n--data
        target: /home/node/.n8n
    networks:
      - compose
    restart: "no"
    configs:
      - source: n8n-flow
        target: /flows/workflow.json
```

The workflow reaches n8n through `n8n import:workflow`, run on the same data
volume each time the stack starts, before n8n itself. `N8N_BLOCK_ENV_ACCESS_IN_NODE`
is `"true"`, n8n's block on a workflow reading its environment, since the
Aggregate leaves `allow_env_access_in_nodes` at `false`. So the OpenAI Chat
Model node reads its key from n8n's own credential store, as the chat trigger
reads its user and password, and the run below stores both. n8n's Compose
Recipe publishes a port on your machine only where the Release sets
`published_port` in n8n's `infra`, and then on the loopback address,
127.0.0.1, alone; without it, the service is reached on the stack's network
only.

## Run it

n8n reads both credentials the workflow selects from its own store, by their
identifiers: the OpenAI key under `Rb7nW2xQ9kT4mZ1c`, and the chat's user and
password under `Vx3mQ8rLb2Nk7Tz5`. With no `published_port` in the Release,
store them with n8n's own command line rather than its editor. Write them into
`credentials.json`, with your own values:

```json
[
  {"id": "Rb7nW2xQ9kT4mZ1c", "name": "OpenAI account", "type": "openAiApi", "data": {"apiKey": "your OpenAI key"}},
  {"id": "Vx3mQ8rLb2Nk7Tz5", "name": "Chat basic auth", "type": "httpBasicAuth", "data": {"user": "a user of your own", "password": "a password of your own"}}
]
```

Set the key in your shell, as the drafted Release reads it, and start the
stack:

```bash
export OPENAI_API_KEY='your OpenAI key'
docker compose -p support-agent -f dist/compose/docker-compose.yaml up -d --wait
```

`-p` names the project, as the run step of
[How an import runs](README.md#how-an-import-runs) explains. `--wait` returns
once n8n reports healthy, after the service importing the workflow has run and
exited. Copy the credentials into n8n's container, import them, and remove the
copy:

```bash
docker compose -p support-agent -f dist/compose/docker-compose.yaml exec -T n8n sh -c 'umask 077; cat > /tmp/credentials.json' < credentials.json
docker compose -p support-agent -f dist/compose/docker-compose.yaml exec n8n n8n import:credentials --input=/tmp/credentials.json
docker compose -p support-agent -f dist/compose/docker-compose.yaml exec n8n rm /tmp/credentials.json
```

```text
[… omitted: n8n's notices about its settings file's permissions, error tracking and deprecated settings]
Successfully imported 2 credentials.
```

n8n holds both credentials now, so delete `credentials.json`:

```bash
rm credentials.json
```

Then activate the workflow, and restart n8n so the activation takes:

```bash
docker compose -p support-agent -f dist/compose/docker-compose.yaml exec n8n n8n update:workflow --id=sQ4vT8nKp2LmX7bR --active=true
docker compose -p support-agent -f dist/compose/docker-compose.yaml restart n8n
```

Once `docker compose -p support-agent -f dist/compose/docker-compose.yaml ps n8n`
shows n8n `(healthy)` again,
`docker compose -p support-agent -f dist/compose/docker-compose.yaml logs n8n`
reads `Activated workflow "Support agent" (ID: sQ4vT8nKp2LmX7bR)`. Send a chat
message from a container on the stack's network, `support-agent_compose`.
Without the user and password, the trigger refuses it:

```bash
docker run --rm --network support-agent_compose curlimages/curl:8.11.1 -sS -i -X POST \
  http://n8n:5678/webhook/a3c9e1f2-4b5d-4e6f-8a7b-9c0d1e2f3a04/chat -H 'Content-Type: application/json' \
  -d '{"action": "sendMessage", "sessionId": "s1", "chatInput": "In one short sentence: what does a support plan cover?"}'
```

```text
HTTP/1.1 401 Unauthorized
www-authenticate: Basic realm="Webhook"
[… omitted: the date, connection, keep-alive and transfer-encoding headers]

Authorization is required!
```

A wrong password gets `HTTP/1.1 403 Forbidden` and `Authorization data is wrong!`.
With the user and password in `CHAT_USER` and `CHAT_PASSWORD`, curl reads them
from its standard input, so they appear on no command line:

```bash
printf 'user = "%s:%s"\n' "$CHAT_USER" "$CHAT_PASSWORD" | docker run --rm -i --network support-agent_compose \
  curlimages/curl:8.11.1 --config - -sS -i -X POST \
  http://n8n:5678/webhook/a3c9e1f2-4b5d-4e6f-8a7b-9c0d1e2f3a04/chat -H 'Content-Type: application/json' \
  -d '{"action": "sendMessage", "sessionId": "s1", "chatInput": "In one short sentence: what does a support plan cover?"}'
```

```text
HTTP/1.1 200 OK
[… omitted: the response's other headers]

{"output":"It covers both onboarding and ongoing help from technical experts."}
```

This answer came from a small local model in place of OpenAI, set up as the
run step of [How an import runs](README.md#how-an-import-runs) describes, the
OpenAI credential's `url` included.

Stop the stack with the command below. `-v` also removes n8n's data volume, and
with it the stored credentials and the activation:

```bash
docker compose -p support-agent -f dist/compose/docker-compose.yaml down -v
```

## On Kubernetes

The same workflow imports for Kubernetes with the `helm` target:

```bash
aggrega import support-agent.json --target helm
```

The drafts differ where the target does. The Manifest maps the platform to
`helm/n8n`, the model to `helm/openai`, and the key to
`helm/k8s-existing-secret`, which reads it from a Secret already in the
namespace. The Release attaches the key as `core/referenced-secret`, naming
that Secret, `openai-api-key`, from the answers file.

The build writes plain Kubernetes manifests under `dist/helm/`. Create the
Secret in the namespace you apply to, holding the key under the data key
`value`, then apply the folder as the run step of
[How an import runs](README.md#how-an-import-runs) explains. The workflow still
reads its credentials from n8n's own store, as [Run it](#run-it) describes.
