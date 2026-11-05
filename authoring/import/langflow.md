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
standard-library catalog, by its absolute path:

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
wrote aggregate.yaml
wrote manifest.yaml
wrote .aggrega-import.json
```

On standard error, with `<workspace>` standing for the folder you ran it in:

<!-- quotes: draft/import.txt -->
```text
[… omitted: a warning that the importer runs unverified, printed where its module is read from beside its Plugin entity in a catalog folder rather than fetched]
read as the langflow format, with drafted paths relative to <workspace>
warn: the value of api_key of node LanguageModelComponent-kBOja is carried as written in the flow the draft carries: its format marks the field as a credential, and setting empty_credentials to marked or all writes it empty
info: the importer drafted no Release, so nothing references the drafted Manifest "manifest.yaml"; name it as a Release's spec.manifest to build against it
made no choice for ChatInput-SzjnT (ChatInput)
made no choice for Prompt-tOH5D (Prompt)
made no choice for ChatOutput-8ZWWB (ChatOutput)
made no choice for LanguageModelComponent-kBOja (LanguageModelComponent)
```

- **The `warn` line** names the Language Model node's `api_key`, a field
  Langflow marks as a password. Here it holds the name of the variable the key
  is read from, `OPENAI_API_KEY`, not a key; a flow exported with a key typed
  into that field would carry the key into the draft, and this line is where
  you would learn it.
- **The `info` line** is about the Release: the Langflow import drafts none, so
  you write it.
- **The `made no choice` lines** say that no node became a Component of its own.
  By default the draft runs the whole flow on the platform that runs Langflow,
  and gives a Component of its own only to a node a socket of that platform
  takes — a model, a tool, a vector store — where the node is recognised as one.
  This flow's Language Model node was not, so it stays inside the flow, and the
  draft wires no model to the platform.

## What it wrote

`aggregate.yaml` — one instance of the standard library's Langflow platform,
`core/ai-agent/langflow`, carrying the flow as it was exported, more than a
thousand lines of it left out here:

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
    langflow:
      type: core/ai-agent/langflow
      values:
        flow_id: '0dbee653-41ae-4e51-af2e-55757fb24be3'
        flow_definition: |-
          {
            "data": {
              "edges": [
          [… omitted: the rest of the flow, as exported]
          }
```

`flow_id` is the identifier the export gives the flow. The comment above the
instance names what the flow cannot supply.

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
and the image the comment asks for.

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
```

Validated with that Release, the drafted Aggregate is refused for the model it
does not wire:

```bash
aggrega validate --release release.yaml
```

```text
  [CATALOG_ERROR E0163] .spec.components.langflow.uses.model
    required uses socket not populated (Component, at .spec.components.langflow.uses.model, "model", declared required by component type "core/ai-agent/langflow")
release dependency validation failed: 1 diagnostic(s)
```

The review changes:

- **Wire the model.** The Aggregate gains a `model` instance of
  `core/ai-model/openai`, naming the model the flow names, `gpt-4.1`, and a
  connection from the platform's `model` socket to it. The platform delivers
  that connection to Langflow as `OPENAI_BASE_URL` and `OPENAI_API_KEY`, and the
  Language Model node already reads its key from `OPENAI_API_KEY`, so the flow
  needs no edit.
- **Present the OpenAI key on that connection.** The Release attaches it to the
  connection as a `core/secret-value` reading `${OPENAI_API_KEY}`, which Docker
  Compose fills from your shell, so no file carries the key.
- **Attach the administrator's password.** Signing in to Langflow's editor is
  required by default, and the build halts while no password is attached,
  saying so: "the Langflow editor needs an administrator password to sign in
  with and none is attached". On Compose, the platform's Recipe reads every
  secret the Release alone attaches under one key, so a password attached there
  beside the connection's key would arrive under the same name and halt the
  build. The
  review declares the password in the Aggregate instead, with a key of its own,
  `LANGFLOW_SUPERUSER_PASSWORD`, read from `${LANGFLOW_ADMIN_PASSWORD}`.
- **Map the Manifest.** The model maps to its Compose Recipe, and the two
  secrets to the realization that writes their variable reference into the
  Compose file as written.

The reviewed `aggregate.yaml` is the draft with three additions, the flow left
out here as above:

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
    langflow:
      type: core/ai-agent/langflow
      # Reviewed: the administrator's password, under the variable Langflow
      # reads it from. Docker Compose fills it from your shell when the stack
      # starts, so no file carries the password.
      features:
        admin_password:
          type: core/secret-value
          values:
            key: LANGFLOW_SUPERUSER_PASSWORD
            origin: "${LANGFLOW_ADMIN_PASSWORD}"
      values:
        flow_id: '0dbee653-41ae-4e51-af2e-55757fb24be3'
        flow_definition: |-
          {
          [… omitted: the flow, as exported]
          }
      # Reviewed: the model the flow's Language Model node calls, wired to the
      # platform's model socket, which delivers its address and key to Langflow
      # as OPENAI_BASE_URL and OPENAI_API_KEY.
      uses:
        model:
          model:
            target: model
    # Reviewed: the model the flow names, gpt-4.1, on OpenAI.
    model:
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
      # The OpenAI key the platform presents to the model, read from your shell
      # when the stack starts, so no file carries it.
      uses:
        model:
          model:
            features:
              credential:
                type: core/secret-value
                infra:
                  origin: "${OPENAI_API_KEY}"
    model: {}
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
        # Reviewed: the Compose Recipe of the model the review added.
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
Pull complete: release.lock (entities=7, source_artifacts=0, external_inputs=0)
  notice: LINT: Feature "core/secret-value" at core/secret-value:1.0.0 declares property "origin" in both values: and infra: pillars (path: origin)
[… omitted: a total build time, which differs per run]
Build completed: 1 files written to <workspace>/dist
```

The `warning` line is about the part of the Compose file that carries the flow,
a top-level `configs` entry, which has no service to put the build's labels on.
The `notice` line is advisory: the password Feature accepts its `origin` from
the Aggregate's `values` or the Release's `infra`, and the notice reports that
one leaf is declared in both. Neither changes the verdict.

The Langflow service in `dist/compose/docker-compose.yaml`:

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
    [… omitted: the service's health check]
    configs:
      - source: langflow-flow
        target: /app/flows/flow.json
```

The flow reaches Langflow as `/app/flows/flow.json`, from a `configs` entry
holding the flow as exported, and Langflow loads it from `LANGFLOW_LOAD_FLOWS_PATH`
at each start. The key and the password are variable references, filled from
your shell when the stack starts. The service publishes no port on your
machine: the rendered file gives it none.
