# Import a Google ADK agent

This walkthrough imports the Agent Config of an application built on Google's
Agent Development Kit (ADK) — one agent answering customers' questions about
their orders — reviews what the import drafts, and builds the application for
Docker Compose. Every file and every block of output below comes from a real
run; the configuration and each stage of the walkthrough are in the
[import-google-adk](../../language-reference/examples/import-google-adk/README.md)
example, where a check script runs the import again and compares what it writes, what it
prints and the blocks this page quotes with the files kept there.

## Scaffold the example

Write the example into a new folder named after it:

```bash
aggrega scaffold --example import-google-adk
```

It then prints the commands to run next. The first two change into the new folder
and into its `source` folder, which holds what this page imports and is where
the import runs:

```bash
cd import-google-adk
cd source
```

## The project

ADK can declare an application's agents in Agent Config files instead of code:
`adk create --type=config` writes `root_agent.yaml`, the configuration of the
root agent, and an environment file beside it. This one, written for this
walkthrough, declares one agent on Gemini's `gemini-2.5-flash`, with the
Google Search tool ADK ships:

<!-- quotes: source/support_agent/root_agent.yaml -->
```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/google/adk-python/refs/heads/main/src/google/adk/agents/config_schemas/AgentConfig.json
name: support_agent
model: gemini-2.5-flash
description: Answers a customer's question about their order.
instruction: |
  You answer customers' questions about their orders. When a customer asks
  where a parcel is, search the web for the tracking page of the company
  shipping it.
tools:
  - name: google_search
```

The import never reads the environment file, which commonly holds the key the
application sends to Gemini, so the example holds none. At the project's root,
an `.aggrega-config.yaml` makes the folder a workspace:

<!-- quotes: source/.aggrega-config.yaml -->
```yaml
# The workspace key marks this directory as the workspace root, so an import run
# here writes its drafts beside support_agent/.
workspace: {}
# The registry the importer is fetched from the first time an import needs it.
default_registry: hub.aggrega.ai
```

The import references the catalog's ADK agent and Gemini model Components, and
`--target` drafts a Manifest from its Recipes, so name a checkout of the
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

Name the agent's directory. The import reads its `root_agent.yaml`:

<!-- quotes: import-command -->
```bash
aggrega import support_agent --target compose
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
read as the google-adk format, with drafted paths relative to <workspace>
mapped support_agent (agent) to core/ai-agent/google-adk as a reference, NONE
mapped gemini-2.5-flash (model) to core/ai-model/gemini as a reference, NONE
made no choice for google_search (tool)
```

- **The `mapped` lines** say that the agent is an instance of the standard
  library's ADK agent, `core/ai-agent/google-adk`, and that the model it names
  is an instance of `core/ai-model/gemini`. Their tier reads `NONE`: the ADK
  import references these Components by what the configuration names rather
  than by weighing each against the catalog.
- **The `made no choice` line** says that the Google Search tool is drafted as
  nothing: it is a tool ADK ships, and it runs inside the application.

## What it wrote

The Aggregate, the Release and the Manifest are named `imported/support-agent`,
after the root agent's `name`, `support_agent`, reduced to `support-agent`,
under the namespace the importer's `target_namespace` setting sets, `imported`
unless you set another
([Settings](../../language-reference/plugins/core-importers.md#settings)).

`aggregate.yaml` — the agent, wired to the model, and the model, opening with
comments that say what was read and what was not:

<!-- quotes: draft/aggregate.yaml -->
```yaml
# Google ADK agent configurations read:
#   - root_agent.yaml
# Not read: the application's code, which defines the tools, callbacks and agents a configuration names by their code, nor the environment file ADK's scaffold writes beside root_agent.yaml; the application runs in the image the Release names for each instance, and loads its configurations itself.
# ADK states that its Agent Config is experimental. An agent's model is a Gemini model by default; ADK serves some other providers' models by name through classes of its own, such as claude-sonnet-4-5 and gpt-4o, and others through a LiteLLM model string.
apiVersion: aggrega.ai/v1beta1
kind: Aggregate
metadata:
  name: imported/support-agent
  version: 0.1.0
  description: Draft Aggregate imported from a source in the google-adk format.
spec:
  components:
    # The agent tree of root_agent.yaml, served from its root agent support_agent.
    # Tools ADK ships, which run inside the application, drafted as no Component: google_search.
    support-agent:
      type: core/ai-agent/google-adk
      values:
        description: "Answers a customer's question about their order."
      uses:
        model:
          gemini-2-5-flash:
            target: gemini-2-5-flash
    # The model gemini-2.5-flash.
    gemini-2-5-flash:
      type: core/ai-model/gemini
      values:
        model: "gemini-2.5-flash"
```

ADK serves an application from its root agent, so the draft holds one instance
per agent tree, named after its root agent. The agent's `instruction` is not
carried: the application reads it from its own configuration, which the image
holds.

ADK serves `gemini-2.5-flash` through its Gemini class, which sends its
requests to the Gemini API, so the draft wires the model to the agent's `model`
socket, which admits the Gemini API alone. A model ADK serves any other way — a
name such as `gpt-4o` that ADK serves through a class of its own, or a LiteLLM
model string such as `openai/gpt-4o` — is wired to nothing: a comment
above the instance names it,
and the connection is left for you, as
[What an agent tree becomes](../../language-reference/plugins/core-importers.md#what-an-agent-tree-becomes)
describes.

`release.yaml` — an entry for the agent, with what no configuration states
named in a comment above it, and an entry placing the model beside it:

<!-- quotes: draft/release.yaml -->
```yaml
apiVersion: aggrega.ai/v1beta1
kind: Release
metadata:
  name: imported/support-agent
  # environment: left for the operator, since no source names the environment this Release deploys to.
  version: 0.1.0
  description: Draft Release imported from a source in the google-adk format.
spec:
  aggregate: imported/support-agent
  manifest: imported/support-agent
  components:
    # Left for the Release, since no configuration states it:
    #   - infra.image, the container image running the application built on ADK, holding its configurations
    #   - the credential support-agent presents to the model it reaches, attached under credential on its connection uses.model.gemini-2-5-flash
    support-agent:
      infra: {}
    gemini-2-5-flash:
      infra: {}
```

`manifest.yaml` — the one Compose Recipe the catalog offers for each type:

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
        core/ai-agent/google-adk: compose/google-adk
        core/ai-model/gemini: compose/gemini
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

With the environment set, the next refusal is the image, which no configuration
states:

```text
  [DEVELOPER_ERROR E0033]
    Component/Feature assertions
    caused by: Component "core/ai-agent/google-adk" instance "support-agent" assertion "image_supplied": assertion "Component/core/ai-agent/google-adk/support-agent/image_supplied": template: Component/core/ai-agent/google-adk/support-agent/image_supplied:1:85: executing "Component/core/ai-agent/google-adk/support-agent/image_supplied" at <fail (printf "%q runs an application built on Google's Agent Development Kit from an image the Release supplies, and the catalog holds no default for it: set infra.image on it in the Release to the container image running that application" $.metadata.instance_id)>: error calling fail: assertion failed: "support-agent" runs an application built on Google's Agent Development Kit from an image the Release supplies, and the catalog holds no default for it: set infra.image on it in the Release to the container image running that application
release dependency validation failed: 1 diagnostic(s)
```

The review changes the Release, and adds one mapping to the Manifest:

- **Set the environment**, `development`.
- **Name the image** running the application, which you build from the project
  with its configuration inside, `ghcr.io/example/support-agent:1.0.0` here. The
  catalog holds no default image for an application built on ADK, so the
  agent's Component refuses a Release that names none, and says where to set
  it.
- **Present the Gemini API key on the model connection**, as the comment asks.
  Gemini is a hosted service, so the agent's Component refuses a connection to
  it that carries no credential: "the model connection gemini-2-5-flash of
  "support-agent" reaches "gemini-2-5-flash", whose
  component.aggrega.ai/hosting label is managed, with no credential". The
  connection attaches a `core/secret-value` whose `origin` is the Compose
  variable reference `${GOOGLE_API_KEY}`.
- **Map the Manifest.** `core/secret-value` maps to `compose/dotenv-secret`,
  which writes the reference into the Compose file as written, so Docker
  Compose fills it from your shell when the stack starts and no file carries
  the key.

The Aggregate needs no change. The reviewed `release.yaml`:

<!-- quotes: reviewed/release.yaml -->
```yaml
# The draft release.yaml after review. Each change is marked "Reviewed:".
apiVersion: aggrega.ai/v1beta1
kind: Release
metadata:
  name: imported/support-agent
  # Reviewed: the environment this Release deploys to.
  environment: development
  version: 0.1.0
  description: Draft Release imported from a source in the google-adk format.
spec:
  aggregate: imported/support-agent
  manifest: imported/support-agent
  components:
    # Left for the Release, since no configuration states it:
    #   - infra.image, the container image running the application built on ADK, holding its configurations
    #   - the credential support-agent presents to the model it reaches, attached under credential on its connection uses.model.gemini-2-5-flash
    support-agent:
      # Reviewed: the image running the application, which you build from the
      # project, root_agent.yaml included.
      infra:
        image: ghcr.io/example/support-agent:1.0.0
      # Reviewed: the Gemini API key the application presents to the model,
      # read from your shell when the stack starts, so no file carries it.
      uses:
        model:
          gemini-2-5-flash:
            features:
              credential:
                type: core/secret-value
                infra:
                  origin: "${GOOGLE_API_KEY}"
    gemini-2-5-flash:
      infra: {}
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
        core/ai-agent/google-adk: compose/google-adk
        core/ai-model/gemini: compose/gemini
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
Pull complete: release.lock (entities=8, source_artifacts=0, external_inputs=0)
  notice: LINT: Feature "core/secret-value" at core/secret-value:1.0.0 declares property "origin" in both values: and infra: pillars (path: origin)
[… omitted: a total build time, which differs per run]
Build completed: 1 files written to <workspace>/dist
```

The `notice` line is advisory: the secret Feature accepts its `origin` from the
Aggregate's `values` or the Release's `infra`, and the notice reports that one
leaf is declared in both. It changes no verdict.

The agent's service in `dist/compose/docker-compose.yaml`:

```yaml
services:
  support-agent:
    image: ghcr.io/example/support-agent:1.0.0
    environment:
      PORT: "8000"
      GOOGLE_API_KEY: ${GOOGLE_API_KEY}
    [… omitted: the labels the build writes on every service, naming the Aggregate, the component, the environment and the compiler's version]
    networks:
      - compose
```

The application receives the port its server listens on as `PORT`, and the key
as `GOOGLE_API_KEY`, which ADK's Gemini client sends to the Gemini API. The
model gets no service of its own: the client sends its requests to the Gemini
API's own address, and reads no other from its environment. The key is a
variable reference, filled from your shell when the stack starts. The service
publishes no port on your machine: the rendered file gives it none.

## Run it

Docker Compose runs your image as the rendered service above, `PORT`
included. The image must listen at that port on every interface, not on
127.0.0.1, the default address of ADK's API server. ADK's own API server,
`adk api_server`, serves the configuration directory as it is, so the image
needs no code of yours. A `Dockerfile` at the project's root, beside
`support_agent/`:

```dockerfile
FROM python:3.12-slim
RUN pip install --no-cache-dir google-adk==2.13.0
COPY support_agent/ /app/agents/support_agent/
CMD ["sh", "-c", "exec adk api_server --host 0.0.0.0 --port \"$PORT\" /app/agents"]
```

`adk api_server` serves the agent directories in the folder it names, and the
command passes `PORT` to it. Build the
image, put its name in place of `ghcr.io/example/support-agent:1.0.0` as the
agent's `infra.image` in `release.yaml`, and build again:

```bash
docker build -t support-agent:local .
aggrega build --release release.yaml --auto-pull
```

Then set the key in your shell and start the stack:

```bash
export GOOGLE_API_KEY='your Gemini API key'
docker compose -p support-agent -f dist/compose/docker-compose.yaml up -d --wait
```

`-p` names the project, as the run step of
[How an import runs](README.md#how-an-import-runs) explains. The service
publishes no port, so send requests from a container on the stack's network,
`support-agent_compose`. `--wait` returns once the container runs, since the
build gives the service no health check, and the server answers a moment
later, so repeat a request it refuses. Then it lists the application:

```bash
docker run --rm --network support-agent_compose curlimages/curl:8.11.1 -sS \
  http://support-agent:8000/list-apps
```

```text
["support_agent"]
```

and opens a session for a user:

```bash
docker run --rm --network support-agent_compose curlimages/curl:8.11.1 -sS -X POST \
  http://support-agent:8000/apps/support_agent/users/u1/sessions/s1 \
  -H 'Content-Type: application/json' -d '{}'
```

```text
{"id":"s1","appName":"support_agent","userId":"u1","state":{},"events":[],"lastUpdateTime":[… omitted: the time the session was created]}
```

A message to the agent goes to `/run`, in that session:

```bash
docker run --rm --network support-agent_compose curlimages/curl:8.11.1 -sS -X POST \
  http://support-agent:8000/run -H 'Content-Type: application/json' \
  -d '{"app_name": "support_agent", "user_id": "u1", "session_id": "s1", "new_message": {"role": "user", "parts": [{"text": "Where is my order 1234? Answer in one short sentence."}]}}'
```

The reply, Gemini's, comes back as a list of the events the turn added to the
session. A model call Gemini refuses, with a wrong key say, returns HTTP 500,
and the reason is in the service's log:
`docker compose -p support-agent -f dist/compose/docker-compose.yaml logs support-agent`.

Stop the stack with:

```bash
docker compose -p support-agent -f dist/compose/docker-compose.yaml down
```
