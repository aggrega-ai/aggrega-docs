# Import a Flowise chatflow

This walkthrough imports a chatflow exported from Flowise — a conversation
chain with a chat model and a memory — reviews what the import drafts, and
builds Flowise carrying the chatflow for Docker Compose. Every file and every
block of output below comes from a real run; the chatflow and each stage of the
walkthrough are in the
[import-flowise](../../language-reference/examples/import-flowise/README.md)
example, where a check script runs the import again and compares what it writes, what it
prints and the blocks this page quotes with the files kept there.

## The chatflow

`support-chat.json`, written for this walkthrough in the shape Flowise's editor
exports a chatflow, holds three nodes and the two edges between them: a
ChatOpenAI node selecting `gpt-4o-mini`,
a Buffer Memory node, and a Conversation Chain node that takes both and answers
with a short system message. The ChatOpenAI node selects no stored credential
and leaves its Base Path empty, so the OpenAI client Flowise runs it on reads
its address and its key from Flowise's environment.

Beside the chatflow, an `.aggrega-config.yaml` makes the folder a workspace:

<!-- quotes: source/.aggrega-config.yaml -->
```yaml
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.

# The workspace key marks this directory as the workspace root, so an import run
# here writes its drafts beside support-chat.json.
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

## Run the import

<!-- quotes: import-command -->
```bash
aggrega import support-chat.json --target compose
```

On standard output it lists what it wrote:

<!-- quotes: draft/stdout.txt -->
```text
wrote components/imported-ai-model-chatopenai.yaml
wrote aggregate.yaml
wrote manifest.yaml
wrote .aggrega-import.json
```

On standard error, with `<workspace>` standing for the folder you ran it in:

<!-- quotes: draft/import.txt -->
```text
[… omitted: a warning that the importer runs unverified, printed where its module is read from beside its Plugin entity in a catalog folder rather than fetched]
read as the flowise format, with drafted paths relative to <workspace>
warn: node chatOpenAI_0 reaches chatopenai-0 through the model connection chatopenai-0 of core/ai-agent/flowise: its Base Path is empty, so the OpenAI client Flowise runs it on reads the address the platform delivers for this connection, OPENAI_BASE_URL, and, since it selects no credential, the key delivered as OPENAI_API_KEY
warn: the drafted Manifest leaves the component type "imported/ai-model/chatopenai" unmapped: no Recipe in the workspace's catalog binds to the target "compose" and implements it, so a build of the drafts halts naming each instance of it until a mapping is added
info: the importer drafted no Release, so nothing references the drafted Manifest "manifest.yaml"; name it as a Release's spec.manifest to build against it
mapped chatOpenAI_0 (chatOpenAI) to imported/ai-model/chatopenai as a draft, HIGH at 0.9
made no choice for bufferMemory_0 (bufferMemory)
made no choice for conversationChain_0 (conversationChain)
```

- **The `mapped` line** says the ChatOpenAI node became a part of the flow, a
  Component of its own wired to the platform's `model` socket. It matched the
  standard library's `core/ai-model/openai` in the high tier, at 0.9, and was
  drafted all the same, because by default an import suggests and you choose.
- **The first `warn` line** says how the chatflow reaches that part: the node
  reads the address and the key the platform delivers for the model connection,
  so the key you attach to the connection is the one the chatflow uses.
- **The `made no choice` lines** say that the memory and the chain stay inside
  the chatflow: no socket of the platform takes them.
- **The second `warn` line and the `info` line** are about the Manifest and the
  Release: no Recipe realizes the Component the import has just drafted, and
  the Flowise import drafts no Release, so you write it.

## What it wrote

`aggregate.yaml` — one instance of the standard library's Flowise platform,
`core/ai-agent/flowise`, carrying the chatflow as it was exported, most of it
left out here, and the drafted model wired to its `model` socket:

<!-- quotes: draft/aggregate.yaml -->
```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: imported/flow
  version: 0.1.0
  description: Draft Aggregate imported from a source in the flowise format.
spec:
  components:
    # Left for the Release, since the source cannot supply it:
    #   - infra.image, the container image running Flowise
    #   - infra.owner_email, the email address of the platform's owner account, required while values.flow_definition is set
    #   - the owner_password slot, that account's password, required while values.flow_definition is set
    #   - the credential each connection under uses presents to the part it reaches, attached on that connection
    flowise:
      type: core/ai-agent/flowise
      # For the compose target only, uncomment the lines below, which declare owner_password on flowise: the compose Recipe reads every secret the Release alone attaches under the key value, so the owner's password and a connection's credential would both arrive under it and halt the build; the Release still attaches owner_password, naming this type or none.
      # features:
      #   owner_password:
      #     type: core/secret-value
      #     values:
      #       key: OWNER_PASSWORD
      values:
        # chatflow_id is derived from the exported flow, which gives no identifier of its own.
        chatflow_id: '40d9f5c5-5187-54c1-a9f5-a8dac92f88bb'
        flow_definition: |
          {
            "nodes": [
          [… omitted: the chatflow's nodes, as exported, up to the Conversation Chain's inputs]
                  "inputs": {
                    "model": "{{"{{"}}chatOpenAI_0.data.instance}}",
                    "memory": "{{"{{"}}bufferMemory_0.data.instance}}",
          [… omitted: the rest of the chatflow, as exported]
          }
      uses:
        model:
          chatopenai-0:
            target: chatopenai-0
    # resembles core/ai-model/openai (score 0.9000); reference it by setting type: core/ai-model/openai
    chatopenai-0:
      type: imported/ai-model/chatopenai
```

Three things in it are worth reading before the review:

- **The comments above the platform** name what the chatflow cannot supply:
  the image, the owner account the chatflow is seeded under, its password, and
  the credential the model connection presents.
- **The commented-out `features` lines** are for a build for Docker Compose,
  which this walkthrough is. The review uncomments them, and the next section
  shows what happens when they stay commented.
- **`chatflow_id`** is derived from the chatflow, since an export from Flowise's
  editor carries no identifier of its own, so one chatflow always yields one
  identifier. A Flowise chatflow writes `{{<node id>.data.instance}}` for every
  connection between two nodes, and an Aggregate's text is read as a template,
  so the draft writes each `{{` as `{{"{{"}}`, which the build turns back into
  the two braces.

`manifest.yaml` — the platform's one Compose Recipe:

<!-- quotes: draft/manifest.yaml -->
```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Manifest
metadata:
  name: imported/flow
  version: 0.1.0
spec:
  mappings:
    components:
      type:
        core/ai-agent/flowise: compose/flowise
```

`components/imported-ai-model-chatopenai.yaml` — the drafted model: a value
field for each of the node's inputs but the one another node connects into,
and a credential slot for its Connect Credential:

<!-- quotes: draft/components/imported-ai-model-chatopenai.yaml -->
```yaml
# resembles core/ai-model/openai (score 0.9000); reference it by setting type: core/ai-model/openai
apiVersion: aggrega.ai/v1alpha1
kind: Component
metadata:
  name: imported/ai-model/chatopenai
  version: 0.1.0
  labels:
    component.aggrega.ai/type: resource
    component.aggrega.ai/category: ai-model
spec:
  featuresSchema:
    credential:
      required: true
      inject: []
      description: Credential slot inferred from the source node; the recipe controls delivery.
  schema:
    values:
      type: object
      properties:
        baseOptions: { type: string }
        basepath: { type: string }
        modelName: { type: string }
        temperature: { type: string }
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
  resolve: no entity in the catalog matches this URI: entity "imported/ai-model/chatopenai" (referenced from aggregate.spec.components.chatopenai-0.type)
  note: local entities are read from `catalog/` at the workspace root and from every directory .aggrega-config.yaml lists under `workspace.catalog_dirs`. The workspace root itself holds 3 documents declaring an entity kind, and the root is read only while it is listed there. Put the entity under `catalog/`, or list the directory holding it under `workspace.catalog_dirs`.
```

The drafted Component sits in `components/`, which the workspace's catalog
does not read, and no Recipe realizes it. The comment above it says what to do
instead, and the review changes:

- **Reference the standard library's model.** `chatopenai-0` becomes
  `core/ai-model/openai`, naming the model the node selects, `gpt-4o-mini`, and
  `components/` is deleted. The Release places the model beside the platform,
  `chatopenai-0: {}`; without that entry, validation refuses the model as
  placed in no boundary.
- **Name the owner account.** Flowise loads no chatflow from a file at start,
  so the build seeds it through Flowise's own API under an owner account the
  Release names: `infra.owner_email`, and a password attached to
  `owner_password`, read from `${FLOWISE_OWNER_PASSWORD}`, which Docker Compose
  fills from your shell. Without an email, validation stops with an assertion
  of the platform that says so: "the Flowise platform "flowise" is given
  values.flow_definition to seed but no infra.owner_email".
- **Present the OpenAI key on the model connection.** The Release attaches it
  to the connection as a `core/secret-value` reading `${OPENAI_API_KEY}`.
- **Uncomment the `owner_password` lines.** With both secrets attached by the
  Release alone and the lines left commented, the build halts as the comment
  warns:

  ```text
  [OPS_ERROR E0318] release.yaml at .spec.components.flowise.uses.model.chatopenai-0.features.credential
    duplicate delivery key across two attachments: an attachment's FeatureRecipe writes a delivery key another attachment already delivered ("value", mechanism "env", attachment "chatopenai-0.credential", delivered first by attachment "owner_password"). Give one of the two attachments a key of its own, or attach one fewer: the key this attachment delivers under is chosen by its FeatureRecipe, which can read the attachment's own values and infra, and the other's is chosen the same way or by its own inject block where it delivered through one. A Release sets an attachment's infra and never its values, so where a key is chosen by a value, attach that attachment in the Aggregate with the value, and keep giving the rest from the Release.
  ```

  Uncommented, the Aggregate declares the password under a key of its own,
  `OWNER_PASSWORD`, and the Release still attaches it.
- **Map the Manifest.** The model maps to its Compose Recipe, and the two
  secrets to the realization that writes their variable reference into the
  Compose file as written.

The reviewed `aggregate.yaml`, the chatflow left out here as above:

<!-- quotes: reviewed/aggregate.yaml -->
```yaml
# The draft aggregate.yaml after review. Each change is marked "Reviewed:".
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: imported/flow
  version: 0.1.0
  description: Draft Aggregate imported from a source in the flowise format.
spec:
  components:
    # Left for the Release, since the source cannot supply it:
    #   - infra.image, the container image running Flowise
    #   - infra.owner_email, the email address of the platform's owner account, required while values.flow_definition is set
    #   - the owner_password slot, that account's password, required while values.flow_definition is set
    #   - the credential each connection under uses presents to the part it reaches, attached on that connection
    flowise:
      type: core/ai-agent/flowise
      # Reviewed: the lines the draft showed commented out for the compose
      # target, uncommented: the owner's password arrives under a key of its
      # own, OWNER_PASSWORD, apart from the model connection's key.
      features:
        owner_password:
          type: core/secret-value
          values:
            key: OWNER_PASSWORD
      values:
        # chatflow_id is derived from the exported flow, which gives no identifier of its own.
        chatflow_id: '40d9f5c5-5187-54c1-a9f5-a8dac92f88bb'
        flow_definition: |
          {
          [… omitted: the chatflow, as exported]
          }
      uses:
        model:
          chatopenai-0:
            target: chatopenai-0
    # Reviewed: the standard library's OpenAI model, as the hint suggested, in
    # place of the drafted Component, naming the model the chatflow's
    # ChatOpenAI node selects.
    chatopenai-0:
      type: core/ai-model/openai
      values:
        model: gpt-4o-mini
```

The Release:

<!-- quotes: reviewed/release.yaml -->
```yaml
# The Release the review wrote: the Flowise import drafts none.
apiVersion: aggrega.ai/v1alpha1
kind: Release
metadata:
  name: imported/flow
  environment: development
  version: 0.1.0
spec:
  aggregate: imported/flow
  manifest: imported/flow
  components:
    flowise:
      infra:
        # The image running Flowise.
        image: flowiseai/flowise:3.1.3
        # The owner account the chatflow is seeded under.
        owner_email: owner@example.com
      # That account's password, read from your shell when the stack starts, so
      # no file carries it.
      features:
        owner_password:
          type: core/secret-value
          infra:
            origin: "${FLOWISE_OWNER_PASSWORD}"
      # The OpenAI key the platform presents to the model, read from your shell
      # the same way.
      uses:
        model:
          chatopenai-0:
            features:
              credential:
                type: core/secret-value
                infra:
                  origin: "${OPENAI_API_KEY}"
    chatopenai-0: {}
```

The image is Flowise 3.1.3, the version the standard library's Compose Recipe
for Flowise is written against.

The reviewed `manifest.yaml`:

<!-- quotes: reviewed/manifest.yaml -->
```yaml
# The draft manifest.yaml after review. Each change is marked "Reviewed:".
apiVersion: aggrega.ai/v1alpha1
kind: Manifest
metadata:
  name: imported/flow
  version: 0.1.0
spec:
  mappings:
    components:
      type:
        core/ai-agent/flowise: compose/flowise
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
  warning: node "flowise" (provider "compose"): artifact "flowise-flow/flowise-flow.yaml": skipped provenance label injection — the fragment declares no compose service. Compose carries build provenance as service labels, so a fragment contributing only top-level networks, volumes or configs carries none; the services this component emits elsewhere carry the full set.
Pull complete: release.lock (entities=8, source_artifacts=0, external_inputs=0)
  notice: LINT: Feature "core/secret-value" at core/secret-value:1.0.0 declares property "origin" in both values: and infra: pillars (path: origin)
[… omitted: a total build time, which differs per run]
Build completed: 1 files written to <workspace>/dist
```

The `warning` line is about the part of the Compose file that carries the
chatflow, a top-level `configs` entry, which has no service to put the build's
labels on. The `notice` line is advisory: the secret Feature accepts its
`origin` from the Aggregate's `values` or the Release's `infra`, and the notice
reports that one leaf is declared in both. Neither changes the verdict.

`dist/compose/docker-compose.yaml` holds two services. Flowise itself:

```yaml
  flowise:
    image: flowiseai/flowise:3.1.3
    environment:
      DATABASE_PATH: /home/node/.flowise
      SECRETKEY_PATH: /home/node/.flowise
      OPENAI_BASE_URL: https://api.openai.com/v1
      OPENAI_API_KEY: ${OPENAI_API_KEY}
    [… omitted: the labels the build writes on every service, naming the Aggregate, the component, the environment and the compiler's version]
    volumes:
      - type: volume
        source: flowise--data
        target: /home/node
    networks:
      - compose
    [… omitted: the service's health check]
```

and the service that seeds the chatflow once Flowise reports healthy, then
exits:

```yaml
  flowise-flow-seed:
    image: flowiseai/flowise:3.1.3
    entrypoint:
      - node
      - /seed/seed.js
    environment:
      FLOWISE_URL: http://127.0.0.1:3000
      OWNER_EMAIL: owner@example.com
      OWNER_PASSWORD: ${FLOWISE_OWNER_PASSWORD}
      CHATFLOW_ID: 40d9f5c5-5187-54c1-a9f5-a8dac92f88bb
      CHATFLOW_NAME: 40d9f5c5-5187-54c1-a9f5-a8dac92f88bb
    [… omitted: the labels the build writes on every service]
    network_mode: service:flowise
    depends_on:
      flowise:
        condition: service_healthy
    restart: "no"
    configs:
      - source: flowise-flow
        target: /seed/flow.json
      - source: flowise-flow-seed
        target: /seed/seed.js
```

It registers the owner account on a fresh Flowise, or signs in as it, and
writes the chatflow at `chatflow_id`. The key and the password are variable
references, filled from your shell when the stack starts. Flowise publishes no
port on your machine: the rendered file gives it none.

## Run it

Set the key and the owner's password in your shell, start the stack, and
follow the seed's log until it ends:

```bash
export OPENAI_API_KEY='your OpenAI key'
export FLOWISE_OWNER_PASSWORD='a password of your own'
docker compose -p support-chat -f dist/compose/docker-compose.yaml up -d
docker compose -p support-chat -f dist/compose/docker-compose.yaml logs -f flowise-flow-seed
```

`-p` names the project, as the run step of
[How an import runs](README.md#how-an-import-runs) explains. `up -d` returns
once Flowise reports healthy and the seed has started; the seed's log ends when
it exits:

```text
flowise-flow-seed-1  | registered the owner account owner@example.com
flowise-flow-seed-1  | imported chatflow 40d9f5c5-5187-54c1-a9f5-a8dac92f88bb as "40d9f5c5-5187-54c1-a9f5-a8dac92f88bb"
```

Leave `--wait` off: it counts the seed's exit as a failure, and `up -d --wait`
exits 1 with `container support-chat-flowise-flow-seed-1 exited (0)` on a
stack that is running as it should.

Flowise publishes no port, so send the question from inside its own
container, which carries `curl`, to the chatflow's prediction endpoint:

```bash
docker compose -p support-chat -f dist/compose/docker-compose.yaml exec flowise \
  curl -sS -X POST http://localhost:3000/api/v1/prediction/40d9f5c5-5187-54c1-a9f5-a8dac92f88bb \
  -H 'Content-Type: application/json' -d '{"question": "In one short sentence: what is Docker Compose?"}'
```

```text
{"text":"Docker Compose is a tool for defining and running multiple Docker containers in a single file.","question":"In one short sentence: what is Docker Compose?",[… omitted: the identifiers Flowise generates for the chat, the message and the session, and two more fields]}
```

This answer came from a small local model in place of OpenAI, set up as the
run step of [How an import runs](README.md#how-an-import-runs) describes.

Stop the stack with the command below. `-v` also removes Flowise's data
volume, and with it the owner account and the chatflow the seed wrote:

```bash
docker compose -p support-chat -f dist/compose/docker-compose.yaml down -v
```
