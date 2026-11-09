# Import a Microsoft Agent Framework declarative agent

This walkthrough imports a declarative agent of Microsoft Agent Framework — an
assistant answering questions from documentation it searches through an MCP
server — reviews what the import drafts, and builds the application for Docker
Compose. Every file and every block of output below comes from a real run; the
declarative agent and each stage of the walkthrough are in the
[import-agent-framework](../../language-reference/examples/import-agent-framework/README.md)
example, where a check script runs the import again and compares what it writes, what it
prints and the blocks this page quotes with the files kept there.

## The project

An application built on Agent Framework can load an agent from a declarative
agent: a YAML document of kind `Prompt` naming the agent's model, its
instructions and its tools. This one, written for this walkthrough, names
OpenAI's `gpt-4.1-mini` and the MCP server Microsoft Learn publishes:

<!-- quotes: source/support-agent.yaml -->
```yaml
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.

kind: Prompt
name: SupportAgent
displayName: Support Assistant
description: Answers a customer's question about the product from its documentation.
instructions: You answer customers' questions about the product, from its documentation only.
model:
  id: gpt-4.1-mini
  provider: OpenAI
  apiType: Responses
  options:
    temperature: 0.2
  connection:
    kind: key
    key: =Env.OPENAI_API_KEY
tools:
  - kind: mcp
    name: microsoft_learn
    description: Search Microsoft's documentation on Microsoft Learn.
    url: https://learn.microsoft.com/api/mcp
    approvalMode:
      kind: never
    allowedTools:
      - microsoft_docs_search
      - microsoft_docs_fetch
```

The model's key is written as `=Env.OPENAI_API_KEY`, so the file holds no key.
Agent Framework reads that expression from the environment variable
`OPENAI_API_KEY` only where the application loads the declarative agent with
`AgentFactory(safe_mode=False)`, Agent Framework's own security setting, and a
.NET runtime is present; otherwise the key is the expression's text as
written. The application's code, which loads the declarative agent, is never
read by the import, and is not part of the example. Beside the file, an
`.aggrega-config.yaml` makes the folder a workspace:

<!-- quotes: source/.aggrega-config.yaml -->
```yaml
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.

# The workspace key marks this directory as the workspace root, so an import run
# here writes its drafts beside support-agent.yaml.
workspace: {}
# The registry the importer is fetched from the first time an import needs it.
default_registry: hub.aggrega.ai
```

The import references the catalog's Agent Framework agent and OpenAI model
Components, and `--target` drafts a Manifest from its Recipes, so name a
checkout of the standard-library catalog ([where to get one](README.md#how-an-import-runs)), by its absolute
path:

```bash
export AGGREGA_CATALOG_DIRS=/path/to/aggrega-catalog
```

## Run the import

Name the declarative agent's file. The import reads each declarative agent as a
file of its own and never a directory:

<!-- quotes: import-command -->
```bash
aggrega import support-agent.yaml --target compose
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
read as the agent-framework format, with drafted paths relative to <workspace>
warn: the value of tools.microsoft_learn.url of node SupportAgent is carried as written in the Release the draft writes: the field belongs to an MCP server's configuration, which can carry a key, and setting empty_credentials to marked or all writes it empty
mapped SupportAgent (agent) to core/ai-agent/agent-framework as a reference, NONE
mapped gpt-4.1-mini (model) to core/ai-model/openai as a reference, NONE
made no choice for SupportAgent#microsoft_learn (tool)
```

- **The `warn` line** names a value that can carry a key — an MCP server's
  address — and says it is carried as written. This address carries none.
- **The `mapped` lines** say that the agent is an instance of the standard
  library's Agent Framework agent, `core/ai-agent/agent-framework`, and its
  model an instance of `core/ai-model/openai`. Their tier reads `NONE`: the
  Agent Framework import references these Components by what the declarative
  agent names rather than by weighing each against the catalog.
- **The `made no choice` line** is the MCP server, which the import drafts as
  no Component, for the reason the comments in `aggregate.yaml` give.

## What it wrote

`aggregate.yaml` — the agent, wired to its model, and the model:

<!-- quotes: draft/aggregate.yaml -->
```yaml
# Not read: the application's code, which loads each declarative agent and binds the functions of its function tools; the application runs in the image the Release names for each instance, and loads its declarative agents itself.
apiVersion: aggrega.ai/v1beta1
kind: Aggregate
metadata:
  name: imported/flow
  version: 0.1.0
  description: Draft Aggregate imported from a source in the agent-framework format.
spec:
  components:
    # The declarative agent SupportAgent.
    # Read by the application from the declarative agent, and taken by no key of core/ai-agent/agent-framework: instructions, the options of its model requests (temperature).
    # The MCP server microsoft_learn, drafted as no Component and no connection, since Agent Framework sends it to the model's provider as a hosted tool, and the provider, not the application, reaches it at its url, which must therefore be reachable from the provider; its url is written above supportagent's entry in the Release.
    # Stated by the declarative agent for microsoft_learn: its description, "Search Microsoft's documentation on Microsoft Learn."; its approval mode, never; the tools of the server it allows, microsoft_docs_search, microsoft_docs_fetch.
    supportagent:
      type: core/ai-agent/agent-framework
      values:
        display_name: "Support Assistant"
        description: "Answers a customer's question about the product from its documentation."
      uses:
        model:
          gpt-4-1-mini:
            target: gpt-4-1-mini
    # The model gpt-4.1-mini, which SupportAgent names with the OpenAI provider.
    gpt-4-1-mini:
      type: core/ai-model/openai
      values:
        model: "gpt-4.1-mini"
```

The MCP server is no Component and no connection of the agent: Agent Framework
sends it to the model's provider as a hosted tool, and the provider, not the
application, reaches it at its `url`, which must therefore be reachable from
the provider. The instructions, the options of the model's requests, and the
server's description, approval mode and allowed tools stay in the declarative
agent, which the application reads; the comments name each.

`release.yaml` — an entry for the agent, with a comment above it naming what
the declarative agent does not state and the values it states for its model
and its MCP server, and an entry placing the model beside it:

<!-- quotes: draft/release.yaml -->
```yaml
apiVersion: aggrega.ai/v1beta1
kind: Release
metadata:
  name: imported/flow
  # environment: left for the operator, since no source names the environment this Release deploys to.
  version: 0.1.0
  description: Draft Release imported from a source in the agent-framework format.
spec:
  aggregate: imported/flow
  manifest: imported/flow
  components:
    # Left for the Release, since the declarative agent does not state it:
    #   - infra.image, the container image running the application built on Agent Framework, holding its declarative agent
    #   - the credential supportagent presents to the model it reaches, attached under credential on its connection uses.model.gpt-4-1-mini
    # The declarative agent also states these values for its model and its MCP servers, written here for review:
    #   - model.connection.key, written as =Env.OPENAI_API_KEY, which Agent Framework reads from the environment variable OPENAI_API_KEY only where the application loads the declarative agent with AgentFactory(safe_mode=False), Agent Framework's own security setting, and a .NET runtime is present; otherwise the value is the expression's text as written
    #   - tools.microsoft_learn.url: "https://learn.microsoft.com/api/mcp"
    supportagent:
      infra: {}
    gpt-4-1-mini:
      infra: {}
```

The model's key is named by the expression it is written as, never valued.
The MCP server's address is written as the declarative agent states it, for
review, and set nowhere else: Agent Framework hands it to the provider in its
request to the model.

`manifest.yaml` — the one Compose Recipe the catalog offers for the agent and
for the model:

<!-- quotes: draft/manifest.yaml -->
```yaml
apiVersion: aggrega.ai/v1beta1
kind: Manifest
metadata:
  name: imported/flow
  version: 0.1.0
spec:
  mappings:
    components:
      type:
        core/ai-agent/agent-framework: compose/agent-framework
        core/ai-model/openai: compose/openai
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

With the environment set, the next refusal is the image the Release does not
name:

```text
  [DEVELOPER_ERROR E0033]
    Component/Feature assertions
    caused by: Component "core/ai-agent/agent-framework" instance "supportagent" assertion "image_supplied": assertion "Component/core/ai-agent/agent-framework/supportagent/image_supplied": template: Component/core/ai-agent/agent-framework/supportagent/image_supplied:1:85: executing "Component/core/ai-agent/agent-framework/supportagent/image_supplied" at <fail (printf "%q runs an application built on Microsoft Agent Framework from an image the Release supplies, and the catalog holds no default for it: set infra.image on it in the Release to the container image running that application" $.metadata.instance_id)>: error calling fail: assertion failed: "supportagent" runs an application built on Microsoft Agent Framework from an image the Release supplies, and the catalog holds no default for it: set infra.image on it in the Release to the container image running that application
release dependency validation failed: 1 diagnostic(s)
```

The review changes the Release, and adds one mapping to the Manifest:

- **Set the environment**, `development`.
- **Name the image** running the application, which you build from the project
  with the declarative agent inside, `ghcr.io/example/support-agent:1.0.0` here.
  The catalog holds no default image for an application built on Agent
  Framework, so the agent's Component refuses a Release that names none, and
  says where to set it.
- **Present the OpenAI key on the model connection**, as the comment asks.
  OpenAI's API is a hosted service, so the agent's Component refuses a
  connection to it that carries no credential: "the model connection
  gpt-4-1-mini of "supportagent" reaches "gpt-4-1-mini", whose
  component.aggrega.ai/hosting label is managed, with no credential". The
  connection attaches a `core/secret-value` whose `origin` is the Compose
  variable reference `${OPENAI_API_KEY}`.
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
  name: imported/flow
  # Reviewed: the environment this Release deploys to.
  environment: development
  version: 0.1.0
  description: Draft Release imported from a source in the agent-framework format.
spec:
  aggregate: imported/flow
  manifest: imported/flow
  components:
    # Left for the Release, since the declarative agent does not state it:
    #   - infra.image, the container image running the application built on Agent Framework, holding its declarative agent
    #   - the credential supportagent presents to the model it reaches, attached under credential on its connection uses.model.gpt-4-1-mini
    # The declarative agent also states these values for its model and its MCP servers, written here for review:
    #   - model.connection.key, written as =Env.OPENAI_API_KEY, which Agent Framework reads from the environment variable OPENAI_API_KEY only where the application loads the declarative agent with AgentFactory(safe_mode=False), Agent Framework's own security setting, and a .NET runtime is present; otherwise the value is the expression's text as written
    #   - tools.microsoft_learn.url: "https://learn.microsoft.com/api/mcp"
    supportagent:
      # Reviewed: the image running the application, which you build from the
      # project, support-agent.yaml included.
      infra:
        image: ghcr.io/example/support-agent:1.0.0
      # Reviewed: the OpenAI key the application presents to the model, read
      # from your shell when the stack starts, so no file carries it.
      uses:
        model:
          gpt-4-1-mini:
            features:
              credential:
                type: core/secret-value
                infra:
                  origin: "${OPENAI_API_KEY}"
    gpt-4-1-mini:
      infra: {}
```

The reviewed `manifest.yaml`:

<!-- quotes: reviewed/manifest.yaml -->
```yaml
# The draft manifest.yaml after review. Each change is marked "Reviewed:".
apiVersion: aggrega.ai/v1beta1
kind: Manifest
metadata:
  name: imported/flow
  version: 0.1.0
spec:
  mappings:
    components:
      type:
        core/ai-agent/agent-framework: compose/agent-framework
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
  supportagent:
    image: ghcr.io/example/support-agent:1.0.0
    environment:
      OPENAI_BASE_URL: https://api.openai.com/v1
      OPENAI_MODEL: gpt-4.1-mini
      OPENAI_API_KEY: ${OPENAI_API_KEY}
    [… omitted: the labels the build writes on every service, naming the Aggregate, the component, the environment and the compiler's version]
    networks:
      - compose
```

The application receives the model's address, its name and its key in the
variables Agent Framework's OpenAI clients read, so the declarative agent's
`=Env.OPENAI_API_KEY` reads the key the Release attached where the application
loads it as [The project](#the-project) describes. No variable carries the MCP
server's address, which the provider reaches. The model gets no service of its
own: the agent reaches the OpenAI API at its own address. The key is a variable
reference, filled from your shell when the stack starts. The service publishes
no port on your machine: the rendered file gives it none.

## Run it

You build the image from the project, with a Dockerfile of your own: the
application's code, with Agent Framework installed and the declarative agent
inside. Docker Compose runs the image's own command as the agent's service,
since the Recipe sets none, so that command must keep running, and must serve
requests if you want to reach the agent. Your program decides the address, the
route and the reply.

The run below used such an image: Python with Agent Framework's
`agent-framework-core`, `agent-framework-openai` and
`agent-framework-declarative` packages, a .NET runtime — the image set
`DOTNET_ROOT` to its directory and `DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1` —
`support-agent.yaml`, and, as the image's command, a small HTTP server of the
program's own on port 8000. The server loads the declarative agent with
`AgentFactory(safe_mode=False)`, so its `=Env.OPENAI_API_KEY` reads the key the
build delivers, and runs the agent once for each `POST /ask`. Build your image
at the project's root, put its name in place of
`ghcr.io/example/support-agent:1.0.0` in `release.yaml`, and build again:

```bash
docker build -t docs-assistant:local .
aggrega build --release release.yaml --auto-pull
```

Then set the key in your shell and start the stack:

```bash
export OPENAI_API_KEY='your OpenAI key'
docker compose -p docs-assistant -f dist/compose/docker-compose.yaml up -d --wait
```

`-p` names the project, as the run step of
[How an import runs](README.md#how-an-import-runs) explains. The service
publishes no port, so the run sent its request from a container on the stack's
network, `docs-assistant_compose`, to its own program's route:

```bash
docker run --rm --network docs-assistant_compose curlimages/curl:8.11.1 -sS -X POST \
  http://supportagent:8000/ask -H 'Content-Type: application/json' \
  -d '{"question": "In one short sentence: what is Azure Container Apps?"}'
```

```text
{"answer": "[… omitted: the agent's reply, written by the small local model]", "usage": {"input_token_count": 137, "output_token_count": 30, "total_token_count": 167}}
```

The route, the request and the shape of the reply are that program's own.
Agent Framework sent the question to the model's Responses API in one request,
carrying the MCP server as a hosted tool for the provider to call. This answer
came from a small local model in place of OpenAI, set up as the run step of
[How an import runs](README.md#how-an-import-runs) describes, whose server
replied without calling the tool, so the answer draws on nothing from
Microsoft Learn.

Stop the stack with:

```bash
docker compose -p docs-assistant -f dist/compose/docker-compose.yaml down
```
