# Import a LangGraph application

This walkthrough imports the configuration of a LangGraph application — one
graph answering customers' questions about their orders — reviews what the
import drafts, and builds the application for Docker Compose. Every file and every
block of output below comes from a real run; the configuration and each stage
of the walkthrough are in the
[import-langgraph](../../language-reference/examples/import-langgraph/README.md)
example, where a check script runs the import again and compares what it writes, what it
prints and the blocks this page quotes with the files kept there.

## The project

A LangGraph application keeps its graphs in code and declares them in
`langgraph.json`, the configuration `langgraph build` reads to build the
application's image. This one, written for this walkthrough, declares one
graph, `support`, by the import path of the graph in the application's code
and a description:

<!-- quotes: source/langgraph.json -->
```json
{
  "$schema": "https://langgra.ph/schema.json",
  "dependencies": ["."],
  "python_version": "3.12",
  "graphs": {
    "support": {
      "path": "./src/support_agent/graph.py:graph",
      "description": "Answers a customer's question about their order, and hands it to a person when it cannot."
    }
  }
}
```

The import reads `langgraph.json` and never the application's code, so the
example holds only the configuration. Beside it, an `.aggrega-config.yaml`
makes the folder a workspace:

<!-- quotes: source/.aggrega-config.yaml -->
```yaml
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.

# The workspace key marks this directory as the workspace root, so an import run
# here writes its drafts beside langgraph.json.
workspace: {}
# The registry the importer is fetched from the first time an import needs it.
default_registry: hub.aggrega.ai
```

The import references the catalog's LangGraph agent and PostgreSQL Components,
and `--target` drafts a Manifest from its Recipes, so name a checkout of the
standard-library catalog ([where to get one](README.md#how-an-import-runs)), by its absolute
path:

```bash
export AGGREGA_CATALOG_DIRS=/path/to/aggrega-catalog
```

## Run the import

Name the application's directory. The import reads its `langgraph.json` and no
other file of it:

<!-- quotes: import-command -->
```bash
aggrega import . --target compose
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
read as the langgraph format, with drafted paths relative to <workspace>
mapped support (graph) to core/ai-agent/langgraph as a reference, NONE
mapped checkpointer (checkpointer) to core/datastore/postgres as a reference, NONE
```

- **The `mapped` lines** say that the graph is an instance of the standard
  library's LangGraph agent, `core/ai-agent/langgraph`, and that its
  checkpointer, where LangGraph keeps each graph's state, is an instance of
  `core/datastore/postgres`. The configuration names no checkpointer, and
  LangGraph then keeps state in PostgreSQL. Their tier reads `NONE`: the
  LangGraph import references these Components by what the configuration
  declares rather than by weighing each against the catalog.

## What it wrote

`aggregate.yaml` — the graph and the database it keeps state in, opening with
comments that say what was read and what was not:

<!-- quotes: draft/aggregate.yaml -->
```yaml
# LangGraph configurations read:
#   - langgraph.json
# Not read: the application's code, which defines each graph; langgraph build builds it into the image the Release names for each graph.
# Not carried, since langgraph build reads them to build the image: dependencies, python_version.
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: imported/flow
  version: 0.1.0
  description: Draft Aggregate imported from a source in the langgraph format.
spec:
  components:
    # The model connection is left for the author, since the configuration names no model; the build halts naming the socket until one is wired.
    support:
      type: core/ai-agent/langgraph
      values:
        graph_entrypoint: "./src/support_agent/graph.py:graph"
        description: "Answers a customer's question about their order, and hands it to a person when it cannot."
      uses:
        checkpointer_db:
          postgres:
            target: postgres
    # The PostgreSQL database the configuration's checkpointer keeps each graph's state in.
    postgres:
      type: core/datastore/postgres
```

`graph_entrypoint` is the graph's import path as the configuration writes it,
and its `checkpointer_db` connection is wired to the database. `recursion_limit`
is not written, so the Component's default, 25, stands. The model is left to
you: a LangGraph configuration names none, since the graph's code chooses it.

`release.yaml` — an entry for the graph, with what no configuration states
named in a comment above it, and an entry placing the database beside it:

<!-- quotes: draft/release.yaml -->
```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Release
metadata:
  name: imported/flow
  # environment: left for the operator, since no source names the environment this Release deploys to.
  version: 0.1.0
  description: Draft Release imported from a source in the langgraph format.
spec:
  aggregate: imported/flow
  manifest: imported/flow
  components:
    # Left for the Release, since no configuration states it:
    #   - infra.image, the container image running the application, which langgraph build builds from its configuration
    support:
      infra: {}
    postgres:
      infra: {}
```

`manifest.yaml` — the one Compose Recipe the catalog offers for each type:

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
        core/ai-agent/langgraph: compose/langgraph
        core/datastore/postgres: compose/postgres
```

`.aggrega-import.json` is the record of what the import wrote, which a later
`aggrega import --sync` reads.

## Review

Validate the draft as it stands:

```bash
aggrega validate --release release.yaml
```

```text
[OPS_ERROR E0215] release.yaml
  document envelope validation failed (Release, at release.yaml); 3:1: metadata.environment: missing required property: environment. correct the document to match its kind's schema
```

With the environment set, the next refusal is the model the comment above the
graph asked for:

```text
  [CATALOG_ERROR E0163] .spec.components.support.uses.model
    required uses socket not populated (Component, at .spec.components.support.uses.model, "model", declared required by component type "core/ai-agent/langgraph")
release dependency validation failed: 1 diagnostic(s)
```

The review adds the model to the Aggregate, and changes the Release and the
Manifest:

- **Add the model and wire it.** The graph's code calls OpenAI's
  `gpt-4o-mini` here, so the Aggregate gains an instance of
  `core/ai-model/openai` serving it, and the graph's `model` connection to it.
- **Set the environment**, `development`.
- **Place the model the review added** beside the graph: `gpt-4o-mini`.
- **Name the image** `langgraph build` built from the application,
  `ghcr.io/example/support-agent:1.0.0` here.
- **Present the OpenAI key on the graph's model connection**: a
  `core/secret-value` whose `origin` is the Compose variable reference
  `${OPENAI_API_KEY}`.
- **Give the database its password** the same way, from `${POSTGRES_PASSWORD}`.
  Without it, the PostgreSQL Recipe writes a default password into the rendered
  Compose file.
- **Map the Manifest.** `core/ai-model/openai`, the model the review added, maps
  to `compose/openai`, and `core/secret-value` to `compose/dotenv-secret`,
  which writes each reference into the Compose file as written, so Docker
  Compose fills it from your shell when the stack starts and neither the key
  nor the password is written into a file.

The reviewed `aggregate.yaml`:

<!-- quotes: reviewed/aggregate.yaml -->
```yaml
# The draft aggregate.yaml after review. Each change is marked "Reviewed:".
# LangGraph configurations read:
#   - langgraph.json
# Not read: the application's code, which defines each graph; langgraph build builds it into the image the Release names for each graph.
# Not carried, since langgraph build reads them to build the image: dependencies, python_version.
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: imported/flow
  version: 0.1.0
  description: Draft Aggregate imported from a source in the langgraph format.
spec:
  components:
    support:
      type: core/ai-agent/langgraph
      values:
        graph_entrypoint: "./src/support_agent/graph.py:graph"
        description: "Answers a customer's question about their order, and hands it to a person when it cannot."
      uses:
        checkpointer_db:
          postgres:
            target: postgres
        # Reviewed: the model the graph calls, which the configuration does not
        # name.
        model:
          gpt-4o-mini:
            target: gpt-4o-mini
    # The PostgreSQL database the configuration's checkpointer keeps each graph's state in.
    postgres:
      type: core/datastore/postgres
    # Reviewed: the model, OpenAI's gpt-4o-mini.
    gpt-4o-mini:
      type: core/ai-model/openai
      values:
        model: gpt-4o-mini
```

The reviewed `release.yaml`:

<!-- quotes: reviewed/release.yaml -->
```yaml
# The draft release.yaml after review. Each change is marked "Reviewed:".
apiVersion: aggrega.ai/v1alpha1
kind: Release
metadata:
  name: imported/flow
  # Reviewed: the environment this Release deploys to.
  environment: development
  version: 0.1.0
  description: Draft Release imported from a source in the langgraph format.
spec:
  aggregate: imported/flow
  manifest: imported/flow
  components:
    # Left for the Release, since no configuration states it:
    #   - infra.image, the container image running the application, which langgraph build builds from its configuration
    support:
      # Reviewed: the image langgraph build built from the application.
      infra:
        image: ghcr.io/example/support-agent:1.0.0
      # Reviewed: the OpenAI key the graph presents to the model, read from
      # your shell when the stack starts, so no file carries it.
      uses:
        model:
          gpt-4o-mini:
            features:
              credential:
                type: core/secret-value
                infra:
                  origin: "${OPENAI_API_KEY}"
    postgres:
      infra: {}
      # Reviewed: the database's password, read from your shell the same way.
      features:
        password:
          type: core/secret-value
          infra:
            origin: "${POSTGRES_PASSWORD}"
    # Reviewed: the model the review added, placed with the graph.
    gpt-4o-mini: {}
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
        core/ai-agent/langgraph: compose/langgraph
        core/datastore/postgres: compose/postgres
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
Pull complete: release.lock (entities=9, source_artifacts=0, external_inputs=0)
  notice: LINT: Feature "core/secret-value" at core/secret-value:1.0.0 declares property "origin" in both values: and infra: pillars (path: origin)
[… omitted: a total build time, which differs per run]
Build completed: 1 files written to <workspace>/dist
```

The `notice` line is advisory: the secret Feature accepts its `origin` from the
Aggregate's `values` or the Release's `infra`, and the notice reports that one
leaf is declared in both. It changes no verdict.

The build writes `dist/compose/docker-compose.yaml`, with a service for the
graph and one for the database. The graph's service:

```yaml
  support:
    image: ghcr.io/example/support-agent:1.0.0
    environment:
      LANGGRAPH_DEFAULT_RECURSION_LIMIT: "25"
      OPENAI_BASE_URL: https://api.openai.com/v1
      OPENAI_MODEL: gpt-4o-mini
      LANGGRAPH_CHECKPOINTER_HOST: postgres
      LANGGRAPH_CHECKPOINTER_PORT: "5432"
      LANGGRAPH_GRAPH_ENTRYPOINT: ./src/support_agent/graph.py:graph
      OPENAI_API_KEY: ${OPENAI_API_KEY}
    [… omitted: the labels the build writes on every service, naming the Aggregate, the component, the environment and the compiler's version]
    networks:
      - compose
    depends_on:
      - postgres
```

The graph receives the model's address, its name and its key, the database's
host and port, and its own graph entrypoint. The model's name, the database's
host and port and the graph entrypoint arrive under the names the LangGraph
Component delivers by default, which an `inject:` block on the connection, or
on the component itself for its own values, replaces with the names your code
reads. The model's address and its key stay whatever the blocks name, and so
does `LANGGRAPH_DEFAULT_RECURSION_LIMIT`, which LangGraph reads by itself as
the step limit of a run whose configuration sets none. The database's own
service takes its password the way the graph takes its key:

```yaml
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: appuser
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: appdb
```

The key and the password are variable references, filled from your shell when
the stack starts. The model gets no service of its own: the graph reaches the
OpenAI API at its own address.
