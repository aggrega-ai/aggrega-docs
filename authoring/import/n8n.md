# Import an n8n workflow

This walkthrough imports a workflow exported from n8n — an AI agent answering
chat messages with an OpenAI chat model and a memory — reviews what the import
drafts, and builds n8n carrying the workflow for Docker Compose. Every file and
every block of output below comes from a real run; the workflow and each stage
of the walkthrough are in the
[import-n8n](../../language-reference/examples/import-n8n/README.md)
example, where a check script runs the import again and compares what it writes, what it
prints and the blocks this page quotes with the files kept there.

## Scaffold the example

Write the example into a new folder named after it, and change into its
`source` folder, which holds what this page imports and is where the import runs:

```bash
aggrega scaffold --example import-n8n && cd import-n8n
cd source
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

The import weighs each node against the Components of the workspace's catalog,
and `--target` drafts a Manifest from its Recipes, so name a checkout of the
standard-library catalog ([where to get one](README.md#how-an-import-runs)), by its absolute
path:

```bash
export AGGREGA_CATALOG_DIRS=/path/to/aggrega-catalog
```

The import reads that catalog from folders on your machine, not from the
registry it fetches its importer from, so the scaffolded example needs the
checkout too: with none, `--target` is refused, since no Recipe binds to the
target.

## Run the import

<!-- quotes: import-command -->
```bash
aggrega import support-agent.json --target compose
```

On standard output it lists what it wrote:

<!-- quotes: draft/stdout.txt -->
```text
wrote components/imported-ai-model-n8n-n8n-nodes-langchain-lmchatopenai.yaml
wrote aggregate.yaml
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
warn: the drafted Manifest leaves the component type "imported/ai-model/n8n-n8n-nodes-langchain-lmchatopenai" unmapped: no Recipe in the workspace's catalog binds to the target "compose" and implements it, so a build of the drafts halts naming each instance of it until a mapping is added
info: the importer drafted no Release, so nothing references the drafted Manifest "manifest.yaml"; name it as a Release's spec.manifest to build against it
made no choice for When chat message received (@n8n/n8n-nodes-langchain.chatTrigger)
made no choice for AI Agent (@n8n/n8n-nodes-langchain.agent)
mapped OpenAI Chat Model (@n8n/n8n-nodes-langchain.lmChatOpenAi) to imported/ai-model/n8n-n8n-nodes-langchain-lmchatopenai as a draft, HIGH at 0.9143
made no choice for Simple Memory (@n8n/n8n-nodes-langchain.memoryBufferWindow)
```

- **The `mapped` line** says the OpenAI Chat Model node became a part of the
  workflow, a Component of its own wired to the platform's `model` socket. It
  matched the standard library's `core/ai-model/openai` in the high tier, at
  0.9143, and was drafted all the same, because by default an import suggests
  and you choose.
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
  variable of the platform, the delivered key included.
- **The fourth `warn` line and the `info` line** are about the Manifest and the
  Release: no Recipe realizes the Component the import has just drafted, and
  the n8n import drafts no Release, so you write it.

## What it wrote

The Aggregate and the Manifest are named `imported/support-agent`, after the
workflow's own name, `Support agent`, reduced to `support-agent` — a workflow
with no name is named after its file — under the namespace the importer's
`target_namespace` setting sets, `imported` unless you set another
([Settings](../../language-reference/plugins/core-importers.md#settings)).

`aggregate.yaml` — one instance of the standard library's n8n platform,
`core/ai-agent/n8n`, carrying the workflow as it was exported, most of it left
out here, and the drafted model wired to its `model` socket:

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
    # Left for the Release, since the source cannot supply it:
    #   - infra.image, the container image running n8n
    #   - the credential each connection under uses presents to the part it reaches, attached on that connection
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
    # resembles core/ai-model/openai (score 0.9143); reference it by setting type: core/ai-model/openai
    openai-chat-model:
      type: imported/ai-model/n8n-n8n-nodes-langchain-lmchatopenai
```

`workflow_id` is the identifier the export gives the workflow.

`manifest.yaml` — the platform's one Compose Recipe:

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
```

`components/imported-ai-model-n8n-n8n-nodes-langchain-lmchatopenai.yaml` — the
drafted model, a value field for each of the node's top-level parameters and a
credential slot for the credential type it selects:

<!-- quotes: draft/components/imported-ai-model-n8n-n8n-nodes-langchain-lmchatopenai.yaml -->
```yaml
# resembles core/ai-model/openai (score 0.9143); reference it by setting type: core/ai-model/openai
apiVersion: aggrega.ai/v1beta1
kind: Component
metadata:
  name: imported/ai-model/n8n-n8n-nodes-langchain-lmchatopenai
  version: 0.1.0
  labels:
    component.aggrega.ai/type: resource
    component.aggrega.ai/category: ai-model
spec:
  featuresSchema:
    openAiApi:
      required: true
      inject: []
      description: Credential slot inferred from the source node; the recipe controls delivery.
  schema:
    values:
      type: object
      properties:
        model: { type: string }
        options: { type: string }
      additionalProperties: false
```

`.aggrega-import.json` is the record of what the import wrote, which a later
`aggrega import --sync` reads.

## Review

The review starts by writing the Release the import did not, with an
environment and the image, and validating:

```bash
aggrega validate --release release.yaml
```

```text
[E0114]
  resolve: no entity in the catalog matches this URI: entity "imported/ai-model/n8n-n8n-nodes-langchain-lmchatopenai" (referenced from aggregate.spec.components.openai-chat-model.type)
  note: local entities are read from `catalog/` at the workspace root and from every directory .aggrega-config.yaml lists under `workspace.catalog_dirs`. The workspace root itself holds 3 documents declaring an entity kind, and the root is read only while it is listed there. Put the entity under `catalog/`, or list the directory holding it under `workspace.catalog_dirs`.
```

The drafted Component sits in `components/`, which the workspace's catalog
does not read, and no Recipe realizes it. The review changes:

- **Reference the standard library's model.** `openai-chat-model` becomes
  `core/ai-model/openai`, naming the model the node selects, `gpt-4o-mini`, and
  `components/` is deleted. The Release places the model beside the platform,
  `openai-chat-model: {}`.
- **Present the OpenAI key on the model connection.** The platform's `model`
  socket is required, and OpenAI's model is a hosted service, so validation
  refuses a connection to it that carries no credential:

  ```text
  [DEVELOPER_ERROR E0033]
    Component/Feature assertions
    caused by: Component "core/ai-agent/n8n" instance "n8n" assertion "managed_target_needs_a_credential": assertion "Component/core/ai-agent/n8n/n8n/managed_target_needs_a_credential": template: Component/core/ai-agent/n8n/n8n/managed_target_needs_a_credential:1:392: executing "Component/core/ai-agent/n8n/n8n/managed_target_needs_a_credential" at <fail (printf "the %s connection %s of %q reaches %q, whose component.aggrega.ai/hosting label is managed, with no credential: attach one under credential on that connection, or set unauthenticated: true in its values" $socket $alias $.metadata.instance_id $connection.target)>: error calling fail: assertion failed: the model connection openai-chat-model of "n8n" reaches "openai-chat-model", whose component.aggrega.ai/hosting label is managed, with no credential: attach one under credential on that connection, or set unauthenticated: true in its values
  ```

  The Release attaches the key to the connection as a `core/secret-value`
  reading `${OPENAI_API_KEY}`, which Docker Compose fills from your shell. It
  reaches n8n's environment as `OPENAI_API_KEY`, where the workflow does not
  read it while `allow_env_access_in_nodes` stays `false`, as the review
  leaves it.
- **Map the Manifest.** The model maps to its Compose Recipe, and the key to
  the realization that writes its variable reference into the Compose file as
  written.

The reviewed `aggregate.yaml`, the workflow left out here as above:

<!-- quotes: reviewed/aggregate.yaml -->
```yaml
# The draft aggregate.yaml after review. Each change is marked "Reviewed:".
apiVersion: aggrega.ai/v1beta1
kind: Aggregate
metadata:
  name: imported/support-agent
  version: 0.1.0
  description: Draft Aggregate imported from a source in the n8n format.
spec:
  components:
    # Left for the Release, since the source cannot supply it:
    #   - infra.image, the container image running n8n
    #   - the credential each connection under uses presents to the part it reaches, attached on that connection
    n8n:
      type: core/ai-agent/n8n
      values:
        workflow_id: 'sQ4vT8nKp2LmX7bR'
        flow_definition: |
          {
          [… omitted: the workflow, as exported]
          }
      uses:
        model:
          openai-chat-model:
            target: openai-chat-model
    # Reviewed: the standard library's OpenAI model, as the hint suggested, in
    # place of the drafted Component, naming the model the workflow's OpenAI
    # Chat Model node selects.
    openai-chat-model:
      type: core/ai-model/openai
      values:
        model: gpt-4o-mini
```

The Release:

<!-- quotes: reviewed/release.yaml -->
```yaml
# The Release the review wrote: the n8n import drafts none.
apiVersion: aggrega.ai/v1beta1
kind: Release
metadata:
  name: imported/support-agent
  environment: development
  version: 0.1.0
spec:
  aggregate: imported/support-agent
  manifest: imported/support-agent
  components:
    n8n:
      infra:
        # The image running n8n.
        image: n8nio/n8n:1.110.1
      # The OpenAI key, presented on the model connection and read from your
      # shell when the stack starts, so no file carries it.
      uses:
        model:
          openai-chat-model:
            features:
              credential:
                type: core/secret-value
                infra:
                  origin: "${OPENAI_API_KEY}"
    openai-chat-model: {}
```

The reviewed `manifest.yaml`:

<!-- quotes: reviewed/manifest.yaml -->
```yaml
# The draft manifest.yaml after review. Each change is marked "Reviewed:".
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
        # Reviewed: the Compose Recipe of the model the review referenced.
        core/ai-model/openai: compose/openai
    # Reviewed: the realization that writes a secret's variable reference into
    # the Compose file as written.
    features:
      type:
        core/secret-value: compose/dotenv-secret
```

## Validate and build

```bash
aggrega validate --release release.yaml
aggrega build --release release.yaml --auto-pull
```

The validation prints:

```text
  notice: LINT: Feature "core/secret-value" at core/secret-value:1.0.0 declares property "origin" in both values: and infra: pillars (path: origin)
release dependency validation passed: release.yaml (schema-pillar + dependency pillars)
```

and the build, with `<workspace>` standing for the folder holding the reviewed
files:

```text
  warning: node "n8n" (provider "compose"): artifact "n8n-flow.compose-fragment.yaml": skipped provenance label injection — the fragment declares no compose service. Compose carries build provenance as service labels, so a fragment contributing only top-level networks, volumes or configs carries none; the services this component emits elsewhere carry the full set.
Pull complete: release.lock (entities=8, source_artifacts=0, external_inputs=0)
  notice: LINT: Feature "core/secret-value" at core/secret-value:1.0.0 declares property "origin" in both values: and infra: pillars (path: origin)
[… omitted: a total build time, which differs per run]
Build completed: 1 files written to <workspace>/dist
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
reads its user and password, and the run below stores both. n8n publishes no
port on your machine: the rendered file gives it none.

## Run it

n8n reads both credentials the workflow selects from its own store, by their
identifiers: the OpenAI key under `Rb7nW2xQ9kT4mZ1c`, and the chat's user and
password under `Vx3mQ8rLb2Nk7Tz5`. The rendered file publishes no port, so
store them with n8n's own command line rather than its editor. Write them into
`credentials.json`, with your own values:

```json
[
  {"id": "Rb7nW2xQ9kT4mZ1c", "name": "OpenAI account", "type": "openAiApi", "data": {"apiKey": "your OpenAI key"}},
  {"id": "Vx3mQ8rLb2Nk7Tz5", "name": "Chat basic auth", "type": "httpBasicAuth", "data": {"user": "a user of your own", "password": "a password of your own"}}
]
```

Set the key in your shell, as the reviewed Release reads it, and start the
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
