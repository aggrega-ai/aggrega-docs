# Import a Langflow flow

This walkthrough imports a flow exported from Langflow — Basic Prompting, the
starter project Langflow 1.6.0 ships — reviews what the import drafts, and
builds Langflow carrying the flow for Docker Compose. Every file and every block
of output below comes from a real run; the flow and each stage of the
walkthrough are in the
[import-langflow](../../language-reference/examples/import-langflow/README.md)
example, where a check script runs the import again and compares what it writes, what it
prints and the blocks this page quotes with the files kept there.

## The flow

Basic Prompting chains four nodes: a Chat Input, a Prompt, a Language Model
that calls OpenAI's `gpt-4.1`, and a Chat Output. Exported from Langflow's
editor, it is one JSON file, `basic-prompting.json`, of about 54 KB, which
carries the source code of each component as well as the flow. Its
Language Model node reads its key from the global variable `OPENAI_API_KEY`,
which Langflow reads from its environment where no variable of that name is
stored.

Beside the flow, an `.aggrega-config.yaml` makes the folder a workspace:

<!-- quotes: source/.aggrega-config.yaml -->
```yaml
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.

# The workspace key marks this directory as the workspace root, so an import run
# here writes its drafts beside basic-prompting.json.
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
aggrega import basic-prompting.json --target compose
```

On standard output it lists what it wrote:

<!-- quotes: draft/stdout.txt -->
```text
wrote components/imported-ai-model-languagemodelcomponent.yaml
wrote aggregate.yaml
wrote manifest.yaml
wrote .aggrega-import.json
```

On standard error, with `<workspace>` standing for the folder you ran it in:

<!-- quotes: draft/import.txt -->
```text
[… omitted: a warning that the importer runs unverified, printed where its module is read from beside its Plugin entity in a catalog folder rather than fetched]
read as the langflow format, with drafted paths relative to <workspace>
warn: node LanguageModelComponent-kBOja reaches languagemodelcomponent-kboja through the model connection languagemodelcomponent-kboja of core/ai-agent/langflow: its field api_key names the variable OPENAI_API_KEY, which the platform delivers for this connection and Langflow reads as a global variable; no field of it gives its API's address, so the OpenAI client it runs takes OPENAI_BASE_URL, the address the platform delivers for this connection, from the environment
warn: the drafted Manifest leaves the component type "imported/ai-model/languagemodelcomponent" unmapped: no Recipe in the workspace's catalog binds to the target "compose" and implements it, so a build of the drafts halts naming each instance of it until a mapping is added
info: the importer drafted no Release, so nothing references the drafted Manifest "manifest.yaml"; name it as a Release's spec.manifest to build against it
made no choice for ChatInput-SzjnT (ChatInput)
made no choice for Prompt-tOH5D (Prompt)
made no choice for ChatOutput-8ZWWB (ChatOutput)
mapped LanguageModelComponent-kBOja (LanguageModelComponent) to imported/ai-model/languagemodelcomponent as a draft, HIGH at 0.9
```

- **The `mapped` line** says what the Language Model node became: a model, a
  Component of its own, wired to the platform's `model` socket. By default the
  draft runs the whole flow on the platform that runs Langflow, and gives a
  Component of its own only to a node a socket of that platform takes — a
  model, a tool, a vector store — where the node is recognised as one. The
  node matched the standard library's OpenAI model in the high tier, at 0.9,
  and was drafted as a new Component, `imported/ai-model/languagemodelcomponent`,
  rather than a reference to it, because by default an import suggests and you choose.
- **The first `warn` line** says how the flow reaches that model. The node
  reads its key from the variable `OPENAI_API_KEY`, and its address from
  `OPENAI_BASE_URL`, and the platform delivers both for the model connection, so
  the flow needs no edit.
- **The second `warn` line** is about the Manifest: no Recipe in the catalog
  realizes the model Component the import has just drafted.
- **The `info` line** is about the Release: the Langflow import drafts none, so
  you write it.
- **The `made no choice` lines** name the nodes no socket of the platform takes:
  they stay inside the flow, which Langflow runs as exported.

## What it wrote

`aggregate.yaml` — one instance of the standard library's Langflow platform,
`core/ai-agent/langflow`, carrying the flow as it was exported, more than a
thousand lines of it left out here, and the model it reaches:

<!-- quotes: draft/aggregate.yaml -->
```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: imported/flow
  version: 0.1.0
  description: Draft Aggregate imported from a source in the langflow format.
spec:
  components:
    # Left for the Release, since the source cannot supply it:
    #   - infra.image, the container image running Langflow
    #   - the admin_password slot, the administrator's password, while values.require_authentication stays true
    #   - the credential each connection under uses presents to the part it reaches, attached on that connection
    langflow:
      type: core/ai-agent/langflow
      # For the compose target only, uncomment the lines below, which declare admin_password on langflow: the compose Recipe reads every secret the Release alone attaches under the key value, so the administrator's password and a connection's credential would both arrive under it and halt the build; the Release still attaches admin_password, naming this type or none.
      # features:
      #   admin_password:
      #     type: core/secret-value
      #     values:
      #       key: LANGFLOW_SUPERUSER_PASSWORD
      values:
        flow_id: '0dbee653-41ae-4e51-af2e-55757fb24be3'
        flow_definition: |-
          {
            "data": {
              "edges": [
          [… omitted: the rest of the flow, as exported]
          }
      uses:
        model:
          languagemodelcomponent-kboja:
            target: languagemodelcomponent-kboja
    # resembles core/ai-model/openai (score 0.9000); reference it by setting type: core/ai-model/openai
    languagemodelcomponent-kboja:
      type: imported/ai-model/languagemodelcomponent
```

`flow_id` is the identifier the export gives the flow. The comments above and
inside the instance name what the flow cannot supply, and the comment above the
model says which Component of the catalog it resembles.

`components/imported-ai-model-languagemodelcomponent.yaml` is the drafted
model: a Component no Recipe realizes, declaring the node's fields as the values
it takes and its key as a credential slot, `api_key`.

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
        core/ai-agent/langflow: compose/langflow
```

`.aggrega-import.json` is the record of what the import wrote, which a later
`aggrega import --sync` reads.

## Review

The review starts by writing the Release the import did not: an environment,
the image the comment asks for, and an entry for each of the two instances.

```yaml
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
    langflow:
      infra:
        image: langflowai/langflow:1.6.0
    languagemodelcomponent-kboja: {}
```

Validated with that Release, the drafted model Component is the first refusal:

```bash
aggrega validate --release release.yaml
```

```text
[E0114]
  resolve: no entity in the catalog matches this URI: entity "imported/ai-model/languagemodelcomponent" (referenced from aggregate.spec.components.languagemodelcomponent-kboja.type)
  note: local entities are read from `catalog/` at the workspace root and from every directory .aggrega-config.yaml lists under `workspace.catalog_dirs`. The workspace root itself holds 3 documents declaring an entity kind, and the root is read only while it is listed there. Put the entity under `catalog/`, or list the directory holding it under `workspace.catalog_dirs`.
```

The drafted Component sits in `components/`, which the workspace's catalog does
not read, and no Recipe realizes it. The comment above the model says what to do
instead, and the review changes:

- **Reference the Component the hint names.** The model becomes
  `core/ai-model/openai`, naming the model the flow names, `gpt-4.1`, and
  `components/` is deleted. The connection the draft wired from the platform's
  `model` socket stays as it is.
- **Present the OpenAI key on that connection.** The Release attaches it to the
  connection as a `core/secret-value` reading `${OPENAI_API_KEY}`, which Docker
  Compose fills from your shell, so no file carries the key.
- **Attach the administrator's password.** Signing in to Langflow's editor is
  required by default, and the build halts while no password is attached,
  saying so: "the Langflow editor needs an administrator password to sign in
  with and none is attached". The draft's comment inside the instance says how
  on Compose: the review uncomments the lines declaring the password with a key
  of its own, `LANGFLOW_SUPERUSER_PASSWORD`, and the Release attaches it,
  reading `${LANGFLOW_ADMIN_PASSWORD}`.
- **Map the Manifest.** The model maps to its Compose Recipe, and the two
  secrets to the realization that writes their variable reference into the
  Compose file as written.

The reviewed `aggregate.yaml`, the flow left out here as above:

<!-- quotes: reviewed/aggregate.yaml -->
```yaml
# The draft aggregate.yaml after review. Each change is marked "Reviewed:".
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: imported/flow
  version: 0.1.0
  description: Draft Aggregate imported from a source in the langflow format.
spec:
  components:
    # Left for the Release, since the source cannot supply it:
    #   - infra.image, the container image running Langflow
    #   - the admin_password slot, the administrator's password, while values.require_authentication stays true
    #   - the credential each connection under uses presents to the part it reaches, attached on that connection
    langflow:
      type: core/ai-agent/langflow
      # Reviewed: the lines the draft left commented for the compose target,
      # declaring the administrator's password under the variable Langflow
      # reads it from. The Release attaches it.
      features:
        admin_password:
          type: core/secret-value
          values:
            key: LANGFLOW_SUPERUSER_PASSWORD
      values:
        flow_id: '0dbee653-41ae-4e51-af2e-55757fb24be3'
        flow_definition: |-
          {
          [… omitted: the flow, as exported]
          }
      uses:
        model:
          languagemodelcomponent-kboja:
            target: languagemodelcomponent-kboja
    # Reviewed: the standard library's OpenAI model, as the hint suggested,
    # with the model the flow names, gpt-4.1.
    languagemodelcomponent-kboja:
      type: core/ai-model/openai
      values:
        model: gpt-4.1
```

The Release:

<!-- quotes: reviewed/release.yaml -->
```yaml
# The Release the review wrote: the Langflow import drafts none.
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
    langflow:
      infra:
        # The image running Langflow, at the version the flow was exported from.
        image: langflowai/langflow:1.6.0
      # The administrator's password, read from your shell when the stack
      # starts, so no file carries it.
      features:
        admin_password:
          infra:
            origin: "${LANGFLOW_ADMIN_PASSWORD}"
      # The OpenAI key the platform presents to the model, read the same way.
      uses:
        model:
          languagemodelcomponent-kboja:
            features:
              credential:
                type: core/secret-value
                infra:
                  origin: "${OPENAI_API_KEY}"
    languagemodelcomponent-kboja: {}
```

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
        core/ai-agent/langflow: compose/langflow
        # Reviewed: the Compose Recipe of the model type the review chose.
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
  warning: node "langflow" (provider "compose"): artifact "langflow-flow/langflow-flow.yaml": skipped provenance label injection — the fragment declares no compose service. Compose carries build provenance as service labels, so a fragment contributing only top-level networks, volumes or configs carries none; the services this component emits elsewhere carry the full set.
Pull complete: release.lock (entities=8, source_artifacts=0, external_inputs=0)
  notice: LINT: Feature "core/secret-value" at core/secret-value:1.0.0 declares property "origin" in both values: and infra: pillars (path: origin)
[… omitted: a total build time, which differs per run]
Build completed: 1 files written to <workspace>/dist
```

The `warning` line is about the part of the Compose file that carries the flow,
a top-level `configs` entry, which has no service to put the build's labels on.
The `notice` line is advisory: the password Feature accepts its `origin` from
the Aggregate's `values` or the Release's `infra`, and the notice reports that
one leaf is declared in both. Neither changes the verdict.

`dist/compose/docker-compose.yaml` holds Langflow and a service that runs once
before it:

```yaml
services:
  langflow:
    image: langflowai/langflow:1.6.0
    environment:
      LANGFLOW_CONFIG_DIR: /app/langflow
      LANGFLOW_SAVE_DB_IN_CONFIG_DIR: "true"
      LANGFLOW_AUTO_LOGIN: "false"
      LANGFLOW_SUPERUSER: admin
      LANGFLOW_SUPERUSER_PASSWORD: ${LANGFLOW_ADMIN_PASSWORD}
      OPENAI_BASE_URL: https://api.openai.com/v1
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      LANGFLOW_LOAD_FLOWS_PATH: /app/flows
    [… omitted: the labels the build writes on every service, naming the Aggregate, the component, the environment and the compiler's version]
    volumes:
      - type: volume
        source: langflow--data
        target: /app/langflow
    networks:
      - compose
    depends_on:
      langflow--data-owner:
        condition: service_completed_successfully
    [… omitted: the service's health check]
    configs:
      - source: langflow-flow
        target: /app/flows/flow.json
  langflow--data-owner:
    image: langflowai/langflow:1.6.0
    entrypoint:
      - chown
      - "1000:0"
      - /app/langflow
    [… omitted: the labels the build writes on every service]
    volumes:
      - type: volume
        source: langflow--data
        target: /app/langflow
    networks:
      - compose
    restart: "no"
    user: "0"
```

The flow reaches Langflow as `/app/flows/flow.json`, from a `configs` entry
holding the flow as exported, and Langflow loads it from `LANGFLOW_LOAD_FLOWS_PATH`
at each start. The key and the password are variable references, filled from
your shell when the stack starts. The service publishes no port on your
machine: the rendered file gives it none.

`langflow--data-owner` runs Langflow's image as root, gives the data volume to
user 1000, group 0, the identity Langflow's image runs as, and exits. Langflow
starts once it has completed: Docker creates the volume owned by root, and
Langflow could not write its data there otherwise.

## Run it

Set the key and the administrator's password in your shell, then start the
stack:

```bash
export OPENAI_API_KEY='your OpenAI key'
export LANGFLOW_ADMIN_PASSWORD='a password of your own'
docker compose -p basic-prompting -f dist/compose/docker-compose.yaml up -d --wait
```

`-p` names the project, as the run step of
[How an import runs](README.md#how-an-import-runs) explains. `--wait` returns
once `langflow--data-owner` has completed and Langflow reports healthy.

Langflow publishes no port, so the requests run inside its own container, which
carries `curl`. Sign in as the administrator:

```bash
docker compose -p basic-prompting -f dist/compose/docker-compose.yaml exec langflow \
  curl -sS -X POST http://localhost:7860/api/v1/login \
  -d username=admin --data-urlencode "password=$LANGFLOW_ADMIN_PASSWORD"
```

```text
{"access_token":"[… omitted: the access token]","refresh_token":"[… omitted: the refresh token]","token_type":"bearer"}
```

create an API key with the access token:

```bash
docker compose -p basic-prompting -f dist/compose/docker-compose.yaml exec langflow \
  curl -sS -X POST http://localhost:7860/api/v1/api_key/ \
  -H 'Authorization: Bearer <access_token>' -H 'Content-Type: application/json' -d '{"name": "run-it"}'
```

```text
{"name":"run-it",[… omitted: when it was last used, how often, whether it is active, and its identifier],"api_key":"[… omitted: the key]",[… omitted: the owner's identifier]}
```

and run the flow with the key:

```bash
docker compose -p basic-prompting -f dist/compose/docker-compose.yaml exec langflow \
  curl -sS -X POST 'http://localhost:7860/api/v1/run/0dbee653-41ae-4e51-af2e-55757fb24be3?stream=false' \
  -H 'x-api-key: <api_key>' -H 'Content-Type: application/json' \
  -d '{"input_value": "In one short sentence: what is Docker Compose?", "input_type": "chat", "output_type": "chat"}'
```

```text
{"session_id":"0dbee653-41ae-4e51-af2e-55757fb24be3","outputs":[{"inputs":{"input_value":"In one short sentence: what is Docker Compose?"},"outputs":[{"results":{"message":{"text_key":"text","data":{"timestamp":[… omitted: when the message was sent],"sender":"Machine","sender_name":"AI","session_id":"0dbee653-41ae-4e51-af2e-55757fb24be3","text":"Docker Compose is a tool for managing multiple Docker containers in a single file, allowing developers to define and run applications independently.",[… omitted: the rest of the message and the run's metadata]
```

The answer is at `outputs[0].outputs[0].results.message.text`. It came from a
small local model in place of OpenAI, set up as the run step of
[How an import runs](README.md#how-an-import-runs) describes, with the model
copied under the name the flow asks for, `gpt-4.1`.

Stop the stack with the command below. `-v` also removes Langflow's data volume,
and with it the administrator's account, the API key and the flow's run history:

```bash
docker compose -p basic-prompting -f dist/compose/docker-compose.yaml down -v
```
