# Import a LangGraph application

This walkthrough imports the configuration of a LangGraph application — one
graph answering customers' questions about their orders — and builds the
application for Docker Compose. The import drafts every file the build reads:
the graph, the PostgreSQL database its checkpointer keeps state in, the model
it calls, the passwords and the key as variable references, and the
realizations of each. It asks once for the two values no configuration holds:
the model the graph's code calls, and the image the application runs in. Every
file and every block of output below comes from a real run; the configuration
and each stage of the walkthrough are in the
[import-langgraph](../../language-reference/examples/import-langgraph/README.md)
example, where a check script runs the import again, compares what it writes,
what it prints and the blocks this page quotes with the files kept there, and
validates and builds what the import wrote.

## Scaffold the example

You can run this import with the commands on this page, or
[have your AI assistant run it for you](#with-an-ai-assistant).

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

The import references the catalog's LangGraph agent, PostgreSQL and OpenAI
model Components, and `--target` drafts a Manifest from its Recipes. The
workspace names no catalog folder, so the import reads the standard-library
catalog from the registry it fetches its importer from: a signed snapshot of
the published catalog, fetched, verified and kept in the workspace's content
cache by the first import, and named by its digest in the record the import
writes beside its drafts. A workspace that names its own catalog folders — in
`AGGREGA_CATALOG_DIRS`, or under `workspace.catalog_dirs` — imports against
those instead.

### What the import asks for

A LangGraph configuration names no model, since the graph's code chooses it,
and no image, since you build that image from your project. So the import asks
for both: the name of the model the graph calls, for the OpenAI model it
drafts, and the image the application runs in. At a terminal it asks, and
writes the answers into the drafts and into the answers file,
`import-answers.yaml`, inside the directory it imports — here the project's
root, `.` — so the next import reads them from there and asks nothing. With no
terminal — in continuous integration, or through a pipe — it asks nothing: it
writes the file with the keys empty, and stops:

```text
2 values the drafts leave empty are still owed, listed in the answers file <workspace>/import-answers.yaml: write each beside its key there, then run the import again
```

The example holds the file already, answered: the graph calls OpenAI's
`gpt-4o-mini`, and `ghcr.io/example/support-agent:1.0.0` stands for the image
you build:

<!-- quotes: source/import-answers.yaml -->
```yaml
# Values the import could not draft from the source, keyed by the drafted file and the key path inside
# it. Write each one beside its key; an import of the same source, and a sync, read them from here and
# ask nothing. A secret is never written here: its key asks where the secret comes from — a variable
# name, ${NAME}, or the name of a Kubernetes Secret.
aggregate.yaml:
  # Left for the author, since the configuration names no model: values.model, the name of the model
  # core/ai-model/openai serves.
  spec.components.model.values.model: "gpt-4o-mini"
release.yaml:
  # Container image running the LangGraph application code. The Docker Compose Recipe runs the catalog's
  # quickstart agent when it is unset.
  spec.components.support.infra.image: "ghcr.io/example/support-agent:1.0.0"
  # The origin of the secret value, written by the operator in the Release. Read exactly as
  # values.origin is. Write it here or in values.origin, never in both. A secret: name where it comes
  # from, never the value.
  spec.components.support.uses.checkpointer_db.postgres.features.credential.infra.origin: "support-db-password"
  # The origin of the secret value, written by the operator in the Release. Read exactly as
  # values.origin is. Write it here or in values.origin, never in both. A secret: name where it comes
  # from, never the value.
  spec.components.support.uses.model.model.features.credential.infra.origin: "openai-api-key"
  # The origin of the secret value, written by the operator in the Release. Read exactly as
  # values.origin is. Write it here or in values.origin, never in both. A secret: name where it comes
  # from, never the value.
  spec.components.postgres.features.password.infra.origin: "support-db-password"
```

The three `origin` answers are for a build for Kubernetes, with
`--target helm`: there the database's password and the OpenAI key are read
from Kubernetes Secrets, and each answer is a Secret's name — the database's
password from `support-db-password`, on both ends, and the key from
`openai-api-key` — never the password or the key. A build for Docker Compose
reads them from your shell instead, so this import does not use those answers.
[The import answers file](../../language-reference/import-answers.md)
describes the file, the questions and the rules for a secret's answer.

[`aggrega import`](../../language-reference/cli/aggrega-import.md) lists
every flag the command takes, `--answers`, which names an answers file kept
elsewhere, among them.

Change into `source`:

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
info: the answers file <workspace>/import-answers.yaml also answers spec.components.postgres.features.password.infra.origin in release.yaml, spec.components.support.uses.checkpointer_db.postgres.features.credential.infra.origin in release.yaml, spec.components.support.uses.model.model.features.credential.infra.origin in release.yaml, which these drafts do not leave empty; those answers are kept there and not applied
mapped support (graph) to core/ai-agent/langgraph as a reference, NONE
mapped checkpointer (checkpointer) to core/datastore/postgres as a reference, NONE
mapped model (model) to core/ai-model/openai as a reference, NONE
Pull complete: <workspace>/release.lock (entities=10, source_artifacts=0, external_inputs=0)
```

- **The `info` line** names the answers the Docker Compose drafts do not use,
  kept in the answers file for a build for Kubernetes.
- **The `mapped` lines** say that the graph is an instance of the standard
  library's LangGraph agent, `core/ai-agent/langgraph`; that its checkpointer,
  where LangGraph keeps each graph's state, is an instance of
  `core/datastore/postgres`, since the configuration names no checkpointer
  and LangGraph then keeps state in PostgreSQL; and that the model every graph
  calls is an instance of `core/ai-model/openai`. Their tier reads `NONE`: the
  LangGraph import references these Components by what the configuration
  declares rather than by weighing each against the catalog. A configuration
  whose `checkpointer.backend` is `mongo` is drafted with
  `core/datastore/ferretdb`, which speaks MongoDB's protocol, over
  `core/datastore/documentdb`, the two wired as the catalog's FerretDB
  Aggregate wires them, with one password for both.
- **The `Pull complete` line** is the import fetching what the drafted Release
  depends on, as [`aggrega pull`](../../language-reference/cli/aggrega-pull.md)
  does, into `release.lock`, so the drafts validate and build at once. Under
  `--offline` the import pulls nothing and names the `aggrega pull` to run.

## What it writes

The Aggregate, the Release and the Manifest are named `imported/support`, after
the one graph `langgraph.json` serves, `support`, since a configuration carries
no name of its own — one serving several graphs is named after its file, or
after its directory where, as here, the import is given its directory — under
the namespace the importer's `target_namespace` setting sets, `imported` unless
you set another
([Settings](../../language-reference/plugins/core-importers.md#settings)).

`aggregate.yaml` — the graph, the database it keeps state in and the model it
calls, each connection declaring the credential it presents, opening with
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
    support:
      type: core/ai-agent/langgraph
      values:
        graph_entrypoint: "./src/support_agent/graph.py:graph"
        description: "Answers a question from a customer about their order, and hands it to a person when it cannot."
      uses:
        checkpointer_db:
          postgres:
            target: postgres
            # For the compose target, the lines below declare credential on postgres: a secret the Release alone attaches arrives under the key value, so each is declared with a key of its own and no two arrive under one; the Release attaches its origin, naming this type or none.
            features:
              credential:
                type: core/secret-value
                values:
                  key: POSTGRES_PASSWORD
        model:
          model:
            target: model
            # For the compose target, the lines below declare credential on model: a secret the Release alone attaches arrives under the key value, so each is declared with a key of its own and no two arrive under one; the Release attaches its origin, naming this type or none.
            features:
              credential:
                type: core/secret-value
                values:
                  key: OPENAI_API_KEY
    # The database the configuration's checkpointer keeps each graph's state in, PostgreSQL.
    postgres:
      type: core/datastore/postgres
      features:
        # For the compose target, the lines below declare password on postgres: a secret the Release alone attaches arrives under the key value, so each is declared with a key of its own and no two arrive under one; the Release attaches its origin, naming this type or none.
        password:
          type: core/secret-value
          values:
            key: POSTGRES_PASSWORD
    # The model every graph calls, which the configuration does not name.
    model:
      type: core/ai-model/openai
      values:
        # Left for the author, since the configuration names no model: values.model, the name of the model core/ai-model/openai serves.
        model: "gpt-4o-mini"
```

`graph_entrypoint` is the graph's import path as the configuration writes it.
Its `checkpointer_db` connection is wired to the database and its `model`
connection to the model, whose name is the answer the import read from
`import-answers.yaml`. `recursion_limit` is not written, so the Component's
default, 25, stands. The database gets a password, so the PostgreSQL Recipe
writes none of its own, and the graph presents the same password on its
connection to the database.

`release.yaml` — the environment, the image, and where the key and the
passwords come from, with comments above the graph saying what its image is and
what it is handed:

<!-- quotes: draft/release.yaml -->
```yaml
apiVersion: aggrega.ai/v1beta1
kind: Release
metadata:
  name: imported/support
  # environment is a drafted default, since no source names the environment this Release deploys to; change it to name the one it deploys to.
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
    support:
      infra:
        # Left for the Release, since the source cannot supply it: infra.image, the container image running the application
        image: "ghcr.io/example/support-agent:1.0.0"
      uses:
        checkpointer_db:
          postgres:
            features:
              credential:
                type: core/secret-value
                infra:
                  # Attached by reference, never as a value: the credential support presents to postgres on its checkpointer_db connection, the password of postgres (the configuration names no variable for it), read from the variable POSTGRES_PASSWORD, which a target substituting variable references, as Docker Compose does when the stack starts, reads from the environment, so no file carries the value.
                  origin: "${POSTGRES_PASSWORD}"
        model:
          model:
            features:
              credential:
                type: core/secret-value
                infra:
                  # Attached by reference, never as a value: the credential support presents to model on its model connection (the source names no variable for it, so it is read from the one OpenAI's client libraries read the API key from), read from the variable OPENAI_API_KEY, which a target substituting variable references, as Docker Compose does when the stack starts, reads from the environment, so no file carries the value.
                  origin: "${OPENAI_API_KEY}"
    postgres:
      features:
        password:
          type: core/secret-value
          infra:
            # Attached by reference, never as a value: the password of postgres (the configuration names no variable for it), read from the variable POSTGRES_PASSWORD, which a target substituting variable references, as Docker Compose does when the stack starts, reads from the environment, so no file carries the value.
            origin: "${POSTGRES_PASSWORD}"
    model: {}
```

The environment, `development`, is a default the import writes because no
configuration names one; change it where the Release deploys elsewhere. The
image is the answer the import read from `import-answers.yaml`. The key and
the password are variable references, `${OPENAI_API_KEY}` and
`${POSTGRES_PASSWORD}`, never values.

`manifest.yaml` — the Compose Recipe of each type, and the realization that
writes each variable reference into the Compose file as written:

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
        core/ai-model/openai: compose/openai
    features:
      type:
        core/secret-value: compose/dotenv-secret
```

`release.lock` records the catalog entities the Release resolved to, by
digest, and `.aggrega-import.json` is the record of what the import wrote,
which a later `aggrega import --sync` reads.

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

and the build, with `<workspace>` standing for the folder you ran it in:

```text
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

## With an AI assistant

An AI assistant [set up with Aggrega's tools](../../ai-assistants/set-up.md)
can do the same: paste this prompt into it.

<!-- copyable -->

> Write the Aggrega documentation's runnable example `import-langgraph` into a new folder with the `scaffold` tool. Its `source` folder is a workspace: name it as the workspace root on each call that follows. Import that folder itself, `.`, with the `import` tool, for the target `compose`; the import reads the answers it needs from `import-answers.yaml` beside `langgraph.json`. Then validate the Release the import drafted, `release.yaml`, with the `validate` tool, build it with the `build` tool, writing the files into `dist/`, and tell me which files the build wrote.

## Open it in VS Code

With the
[Aggrega extension for Visual Studio Code](https://github.com/aggrega-ai/aggrega-vscode-extension)
installed, open the folder `import-langgraph/source` in VS Code, where the
import wrote its drafts. The folder holds one Release, the drafted
`release.yaml`, so the editor selects it for you, and it checks the drafts
against that Release as you edit them, marking what it finds in the file and in
the Problems panel. **Aggrega: Show topology graph**, in the Command Palette,
draws the Release's components and the connections between them.
**Aggrega: Build**, **Aggrega: Preview build** and **Aggrega: Pull** act on the
same Release, and each is also a button on the **Commands** panel of the
**Aggrega** view in the activity bar; Build writes its files into the folder's
`dist/`. [Use Aggrega in Visual Studio Code](../editor/README.md) covers the rest.

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
finds the database accepting connections. Build your image at the project's
root, write its name in place of `ghcr.io/example/support-agent:1.0.0` in
`import-answers.yaml`, and import again with `--sync`, which writes the new
answer into the drafts and pulls again; then build:

```bash
docker build -t order-support:local .
aggrega import . --sync
aggrega build --release release.yaml
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
graph's service runs.

## Test it

The request below reaches the program this walkthrough's image runs: the
graph behind a small HTTP server on port 8000, answering
`POST /threads/<thread>/runs`. Your own program decides its own address, route
and reply. The services publish no port and the image carries no HTTP client,
so the request comes from a container started on the stack's network,
`order-support_compose`:

```bash
docker run --rm --network order-support_compose curlimages/curl:8.11.1 -sS -X POST \
  http://support:8000/threads/order-1234/runs -H 'Content-Type: application/json' \
  -d '{"message": "Where is my order 1234? It has not arrived yet."}'
```

```text
{
  "thread": "order-1234",
  "error": "the run failed: OpenAIAuthenticationError: Error code: 401 - Incorrect API key provided: sk-place************-key. [… omitted: where to find an API key]"
}
```

The run set `OPENAI_API_KEY` to a placeholder, so the reply is OpenAI's
refusal of it, passed on by the program. The graph's request reached the OpenAI
API with the key the build delivered, from a program that had opened its
checkpointer in the database with the credentials the build delivered.

Stop the stack with:

```bash
docker compose -p order-support -f dist/compose/docker-compose.yaml down -v
```

`-v` removes the volume the database keeps its data in, and the conversations
with it.

On Kubernetes, import with `--target helm` and push the image to a registry
your cluster pulls from, naming it in `import-answers.yaml`. Then create the
Secrets `openai-api-key` and `support-db-password` and apply the build, as the
run step of [How an import runs](README.md#how-an-import-runs) describes. The
graph's Deployment has no Service. Its pod restarts until the database accepts
connections, because the program opens its checkpointer as it starts. Forward a
local port to it; the command runs until you stop it:

```bash
kubectl port-forward deploy/support 8000:8000
```

```text
Forwarding from 127.0.0.1:8000 -> 8000
Forwarding from [::1]:8000 -> 8000
```

From another terminal, send the same request to the forwarded port:

```bash
curl -sS -X POST http://127.0.0.1:8000/threads/order-1234/runs -H 'Content-Type: application/json' \
  -d '{"message": "Where is my order 1234? It has not arrived yet."}'
```

```text
{
  "thread": "order-1234",
  "error": "the run failed: OpenAIAuthenticationError: Error code: 401 - Incorrect API key provided: sk-place************-key. [… omitted: where to find an API key]"
}
```
