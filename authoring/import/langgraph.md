# Import a LangGraph application

This walkthrough imports the configuration of a LangGraph application — one
graph answering customers' questions about their orders — reviews what the
import drafts, and builds the application for Docker Compose. Every file and every
block of output below comes from a real run; the configuration and each stage
of the walkthrough are in the
[import-langgraph](../../language-reference/examples/import-langgraph/README.md)
example, where a check script runs the import again and compares what it writes, what it
prints and the blocks this page quotes with the files kept there.

## Scaffold the example

Write the example into a new folder named after it:

```bash
aggrega scaffold --example import-langgraph
```

It then prints the commands to run next. The first changes into the new folder;
the one after it, below, changes into its `source` folder, which holds what this
page imports and is where the import runs:

```bash
cd import-langgraph
```

## The project

A LangGraph application keeps its graphs in code and declares them in
`langgraph.json`, the configuration file of LangGraph's command-line tool.
This one, written for this walkthrough, declares one
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
      "description": "Answers a question from a customer about their order, and hands it to a person when it cannot."
    }
  }
}
```

The import reads `langgraph.json` and never the application's code, so the
example holds only the configuration. Beside it, an `.aggrega-config.yaml`
makes the folder a workspace:

<!-- quotes: source/.aggrega-config.yaml -->
```yaml
# The workspace key marks this directory as the workspace root, so an import run
# here writes its drafts beside langgraph.json.
workspace: {}
# The registry the importer is fetched from the first time an import needs it.
default_registry: hub.aggrega.ai
```

The import references the catalog's LangGraph agent and PostgreSQL Components,
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

The Aggregate, the Release and the Manifest are named `imported/support`, after
the one graph `langgraph.json` serves, `support`, since a configuration carries
no name of its own — one serving several graphs is named after its file, or
after its directory where, as here, the import is given its directory — under
the namespace the importer's `target_namespace` setting sets, `imported` unless
you set another
([Settings](../../language-reference/plugins/core-importers.md#settings)).

`aggregate.yaml` — the graph and the database it keeps state in, opening with
comments that say what was read and what was not:

<!-- quotes: draft/aggregate.yaml -->
```yaml
# LangGraph configurations read:
#   - langgraph.json
# Not read: the application's code, which defines each graph; it runs in the image the Release names for each graph.
# Not carried, since they configure the server image langgraph build builds, and the image the Release names is the application's own: dependencies, python_version.
apiVersion: aggrega.ai/v1beta1
kind: Aggregate
metadata:
  name: imported/support
  version: 0.1.0
  description: Draft Aggregate imported from a source in the langgraph format.
spec:
  components:
    # The model connection is left for the author, since the configuration names no model; the build halts naming the socket until one is wired.
    support:
      type: core/ai-agent/langgraph
      values:
        graph_entrypoint: "./src/support_agent/graph.py:graph"
        description: "Answers a question from a customer about their order, and hands it to a person when it cannot."
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

`release.yaml` — an entry for the graph, with comments above it saying what
its image is and what it is handed, and what no configuration states, and an
entry placing the database beside it:

<!-- quotes: draft/release.yaml -->
```yaml
apiVersion: aggrega.ai/v1beta1
kind: Release
metadata:
  name: imported/support
  # environment: left for the operator, since no source names the environment this Release deploys to.
  version: 0.1.0
  description: Draft Release imported from a source in the langgraph format.
spec:
  aggregate: imported/support
  manifest: imported/support
  components:
    # Each graph's image is the application's own, not the server image langgraph build builds: its code, with LangGraph installed.
    # It is handed, for its code to read, the graph to run as LANGGRAPH_GRAPH_ENTRYPOINT, the model's name as OPENAI_MODEL, the checkpointer store's host and port as LANGGRAPH_CHECKPOINTER_HOST and LANGGRAPH_CHECKPOINTER_PORT, its user and database, where the store publishes them, as LANGGRAPH_CHECKPOINTER_USER and LANGGRAPH_CHECKPOINTER_DATABASE, and a password attached on the checkpointer_db connection as LANGGRAPH_CHECKPOINTER_PASSWORD.
    # It is also handed the model's address as OPENAI_BASE_URL and a key attached on the model connection as OPENAI_API_KEY, which the OpenAI client library reads, and recursion_limit as LANGGRAPH_DEFAULT_RECURSION_LIMIT, which LangGraph reads.
    # An inject: block on the graph's own instance, through an entry reading graph_entrypoint alone, replaces LANGGRAPH_GRAPH_ENTRYPOINT with the name it writes; one on the model connection replaces OPENAI_MODEL, and one on the checkpointer_db connection the store's host, port, user and database, with the names it writes.
    # Left for the Release, since no configuration states it:
    #   - infra.image, the container image running the application
    support:
      infra: {}
    postgres:
      infra: {}
```

`manifest.yaml` — the one Compose Recipe the catalog offers for each type:

<!-- quotes: draft/manifest.yaml -->
```yaml
apiVersion: aggrega.ai/v1beta1
kind: Manifest
metadata:
  name: imported/support
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

The review adds the model, and the credential the graph presents to the
database, to the Aggregate, and changes the Release and the Manifest:

- **Add the model and wire it.** The graph's code calls OpenAI's
  `gpt-4o-mini` here, so the Aggregate gains an instance of
  `core/ai-model/openai` serving it, and the graph's `model` connection to it.
- **Set the environment**, `development`.
- **Place the model the review added** beside the graph: `gpt-4o-mini`.
- **Name the image the graph runs.** As the comment above the graph says, it
  is the application's own image, not the server image `langgraph build`
  builds: its code, with LangGraph installed, which you build from the
  project. `ghcr.io/example/support-agent:1.0.0` here.
- **Present the OpenAI key on the graph's model connection**: a
  `core/secret-value` whose `origin` is the Compose variable reference
  `${OPENAI_API_KEY}`.
- **Give the database its password** the same way, from `${POSTGRES_PASSWORD}`.
  Without it, the PostgreSQL Recipe writes a default password into the rendered
  Compose file.
- **Present the same password on the graph's checkpointer connection**, so
  the graph's code can open the database. The Aggregate attaches it, a
  `core/secret-value` naming the key its value arrives under,
  `checkpointer_password`, and the Release gives its origin,
  `${POSTGRES_PASSWORD}` again. A secret the Release alone attaches arrives
  under the key `value`, so two of them on one component collide, and the
  build refuses the second, saying to attach one of them in the Aggregate with
  the value that chooses its key — the shape written here.
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
# Not read: the application's code, which defines each graph; it runs in the image the Release names for each graph.
# Not carried, since they configure the server image langgraph build builds, and the image the Release names is the application's own: dependencies, python_version.
apiVersion: aggrega.ai/v1beta1
kind: Aggregate
metadata:
  name: imported/support
  version: 0.1.0
  description: Draft Aggregate imported from a source in the langgraph format.
spec:
  components:
    support:
      type: core/ai-agent/langgraph
      values:
        graph_entrypoint: "./src/support_agent/graph.py:graph"
        description: "Answers a question from a customer about their order, and hands it to a person when it cannot."
      uses:
        checkpointer_db:
          postgres:
            target: postgres
            # Reviewed: the password the graph presents to the database, under
            # a key of its own; the Release gives its origin.
            features:
              credential:
                type: core/secret-value
                values:
                  key: checkpointer_password
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
apiVersion: aggrega.ai/v1beta1
kind: Release
metadata:
  name: imported/support
  # Reviewed: the environment this Release deploys to.
  environment: development
  version: 0.1.0
  description: Draft Release imported from a source in the langgraph format.
spec:
  aggregate: imported/support
  manifest: imported/support
  components:
    # Each graph's image is the application's own, not the server image langgraph build builds: its code, with LangGraph installed.
    # It is handed, for its code to read, the graph to run as LANGGRAPH_GRAPH_ENTRYPOINT, the model's name as OPENAI_MODEL, the checkpointer store's host and port as LANGGRAPH_CHECKPOINTER_HOST and LANGGRAPH_CHECKPOINTER_PORT, its user and database, where the store publishes them, as LANGGRAPH_CHECKPOINTER_USER and LANGGRAPH_CHECKPOINTER_DATABASE, and a password attached on the checkpointer_db connection as LANGGRAPH_CHECKPOINTER_PASSWORD.
    # It is also handed the model's address as OPENAI_BASE_URL and a key attached on the model connection as OPENAI_API_KEY, which the OpenAI client library reads, and recursion_limit as LANGGRAPH_DEFAULT_RECURSION_LIMIT, which LangGraph reads.
    # An inject: block on the graph's own instance, through an entry reading graph_entrypoint alone, replaces LANGGRAPH_GRAPH_ENTRYPOINT with the name it writes; one on the model connection replaces OPENAI_MODEL, and one on the checkpointer_db connection the store's host, port, user and database, with the names it writes.
    # Left for the Release, since no configuration states it:
    #   - infra.image, the container image running the application
    support:
      # Reviewed: the image running the application's code, which you build
      # from the project.
      infra:
        image: ghcr.io/example/support-agent:1.0.0
      # Reviewed: the OpenAI key the graph presents to the model, and the
      # origin of the password the Aggregate has it present to the database,
      # each read from your shell when the stack starts, so no file carries
      # either.
      uses:
        model:
          gpt-4o-mini:
            features:
              credential:
                type: core/secret-value
                infra:
                  origin: "${OPENAI_API_KEY}"
        checkpointer_db:
          postgres:
            features:
              credential:
                type: core/secret-value
                infra:
                  origin: "${POSTGRES_PASSWORD}"
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
apiVersion: aggrega.ai/v1beta1
kind: Manifest
metadata:
  name: imported/support
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
Pull complete: release.lock (entities=10, source_artifacts=0, external_inputs=0)
  notice: LINT: Feature "core/secret-value" at core/secret-value:1.0.0 declares property "origin" in both values: and infra: pillars (path: origin)
[… omitted: a total build time, which differs per run]
Build completed: 1 file written to <workspace>/dist
```

The `notice` line is advisory: the secret Feature accepts its `origin` from the
Aggregate's `values` or the Release's `infra`, and the notice reports that one
leaf is declared in both. It changes no verdict.

The build writes `dist/compose/docker-compose.yaml`, with a service for the
graph, one for the database, and one that waits for the database. The graph's
service:

```yaml
  support:
    image: ghcr.io/example/support-agent:1.0.0
    environment:
      LANGGRAPH_DEFAULT_RECURSION_LIMIT: "25"
      OPENAI_BASE_URL: https://api.openai.com/v1
      OPENAI_MODEL: gpt-4o-mini
      LANGGRAPH_CHECKPOINTER_HOST: postgres
      LANGGRAPH_CHECKPOINTER_PORT: "5432"
      LANGGRAPH_CHECKPOINTER_USER: appuser
      LANGGRAPH_CHECKPOINTER_DATABASE: appdb
      LANGGRAPH_GRAPH_ENTRYPOINT: ./src/support_agent/graph.py:graph
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      LANGGRAPH_CHECKPOINTER_PASSWORD: ${POSTGRES_PASSWORD}
    [… omitted: the labels the build writes on every service, naming the Aggregate, the component, the environment and the compiler's version]
    networks:
      - compose
    depends_on:
      support--wait-for-store:
        condition: service_completed_successfully
      postgres:
        condition: service_started
```

The graph receives the model's address, its name and its key, the database's
host, port, user, database name and password, and its own graph entrypoint.
The user and the database name are the PostgreSQL Component's defaults,
`appuser` and `appdb`, which the database's service below is created with; the
graph is handed them because the PostgreSQL Recipe publishes both, and a store
publishing neither, as Valkey does, is handed neither. The model's name, the
database's host, port, user and database name and the graph entrypoint arrive
under the names the LangGraph Component delivers by default, which an
`inject:` block on the connection, or on the component itself for its own
values, replaces with the names your code reads. The model's address, its key
and the database's password stay whatever the blocks name, and so does
`LANGGRAPH_DEFAULT_RECURSION_LIMIT`, which LangGraph reads by itself as the
step limit of a run whose configuration sets none. The database's own service
takes the same password:

```yaml
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: appuser
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: appdb
    [… omitted: the labels the build writes on every service, the network, and a health check running PostgreSQL's pg_isready]
```

The graph's service starts only once the third service has completed. It runs
once, in the catalog's quickstart agent image rather than in the graph's own,
and waits until the database's address accepts a TCP connection, trying every
2 s for up to 300 s; given no connection by then it exits naming the address,
and the graph is not started. It is handed the database's host and port and
nothing else:

```yaml
  support--wait-for-store:
    image: hub.aggrega.ai/tools/quickstart-agent:1.0.1@sha256:a5f8dcfbb670d86a0cae0aadd2844bec93221a651238f8be3863873e261ee168
    [… omitted: the command and the entrypoint, a bash loop that opens a connection to the address]
    environment:
      STORE_HOST: postgres
      STORE_PORT: "5432"
    [… omitted: the labels the build writes on every service, and the network]
    restart: "no"
```

The key and the password are variable references, filled from your shell when
the stack starts. The model gets no service of its own: the graph reaches the
OpenAI API at its own address. The services publish no port on your machine:
the rendered file gives the graph none, and the database's own port is
reached on the stack's network.

## Run it

You build the image from the project, with a Dockerfile of your own: the
graph's code, with LangGraph installed. Docker Compose runs the image's own
command as the graph's service, since the Recipe sets none, so that command
must keep running, and must serve requests if you want to reach the graph. It
finds the graph, the model and the database through the variables above. Your
program decides the address, the route and the reply.

The run below used such an image: the graph at the path `langgraph.json`
names, `src/support_agent/graph.py`, one node answering through the model
`OPENAI_MODEL` names, and, as the image's command, a small HTTP server of the
program's own on port 8000. The image keeps the project's layout at its
working directory, so the path `LANGGRAPH_GRAPH_ENTRYPOINT` names, relative to
it, finds the graph. The server loads that graph, keeps each conversation's
state in the database through LangGraph's PostgreSQL checkpointer, opened with
the database's host, port, user, database name and password, each read from
the `LANGGRAPH_CHECKPOINTER_` variable it arrives under, so the program writes
none of them itself, and runs the graph once for each
`POST /threads/<thread>/runs`. The graph's service starts once the database
accepts connections, so a server that opens the checkpointer as it starts
finds the database accepting connections. Build
your image at the project's root, put its name in place of
`ghcr.io/example/support-agent:1.0.0` in `release.yaml`, and build again:

```bash
docker build -t order-support:local .
aggrega build --release release.yaml --auto-pull
```

Then set the key and the database's password in your shell and start the
stack:

```bash
export OPENAI_API_KEY='your OpenAI key'
export POSTGRES_PASSWORD='a password of your own'
docker compose -p order-support -f dist/compose/docker-compose.yaml up -d --wait
```

`-p` names the project, as the run step of
[How an import runs](README.md#how-an-import-runs) explains. `--wait` returns
once the database reports healthy, the wait for it has completed and the
graph's service runs. The services
publish no port, so the run sent its request from a container on the stack's
network, `order-support_compose`, to its own program's route:

```bash
docker run --rm --network order-support_compose curlimages/curl:8.11.1 -sS -X POST \
  http://support:8000/threads/order-1234/runs -H 'Content-Type: application/json' \
  -d '{"message": "Where is my order 1234? It has not arrived yet."}'
```

```text
{
  "thread": "order-1234",
  "messages_in_thread": 2,
  "answer": "[… omitted: the graph's reply, written by the small local model]",
  "model": "gpt-4o-mini",
  "usage": {
    "input_tokens": 45,
    "output_tokens": 17,
    "total_tokens": 62,
    "input_token_details": {},
    "output_token_details": {}
  }
}
```

The route, the request and the shape of the reply are that program's own:
the graph made one request to the model, and the checkpointer kept the
thread, `order-1234`, in the database. This answer came from a small local
model in place of OpenAI, set up as the run step of
[How an import runs](README.md#how-an-import-runs) describes.

Stop the stack with:

```bash
docker compose -p order-support -f dist/compose/docker-compose.yaml down -v
```

`-v` removes the volume the database keeps its data in, and the conversations
with it.
