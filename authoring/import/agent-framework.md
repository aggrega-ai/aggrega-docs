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

The model's key is written as `=Env.OPENAI_API_KEY`: Agent Framework reads it
from the environment variable `OPENAI_API_KEY`, so the file holds no key. The
application's code, which loads the declarative agent, is never read by the
import, and is not part of the example. Beside the file, an
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

The import references the catalog's Agent Framework agent, OpenAI model and MCP
server Components, and `--target` drafts a Manifest from its Recipes, so name a
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
warn: the drafted Manifest leaves the component type "core/ai-tool/mcp" unmapped: the workspace's catalog holds more than one Recipe binding to the target "compose" that implements it ("compose/mcp-remote", "compose/mcp-stdio-bridge"), and the import does not choose between them, so a build of the drafts halts naming each instance of it until the one wanted is mapped
mapped SupportAgent (agent) to core/ai-agent/agent-framework as a reference, NONE
mapped gpt-4.1-mini (model) to core/ai-model/openai as a reference, NONE
mapped SupportAgent#microsoft_learn (tool) to core/ai-tool/mcp as a reference, NONE
```

- **The first `warn` line** names a value that can carry a key — an MCP
  server's address — and says it is carried as written. This address carries
  none.
- **The second `warn` line** is about the Manifest: the catalog has two ways to
  reach an MCP server under Docker Compose, and the import leaves the choice to
  you.
- **The `mapped` lines** say that the agent is an instance of the standard
  library's Agent Framework agent, `core/ai-agent/agent-framework`, its model an
  instance of `core/ai-model/openai`, and its MCP server an instance of
  `core/ai-tool/mcp`. Their tier reads `NONE`: the Agent Framework import
  references these Components by what the declarative agent names rather than
  by weighing each against the catalog.

## What it wrote

`aggregate.yaml` — the agent, wired to its model and to its MCP server, and
each of them:

<!-- quotes: draft/aggregate.yaml -->
```yaml
# Not read: the application's code, which loads each declarative agent and binds the functions of its function tools; the application runs in the image the Release names for each instance, and loads its declarative agents itself.
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: imported/flow
  version: 0.1.0
  description: Draft Aggregate imported from a source in the agent-framework format.
spec:
  components:
    # The declarative agent SupportAgent.
    # Read by the application from the declarative agent, and taken by no key of core/ai-agent/agent-framework: instructions, the options of its model requests (temperature).
    supportagent:
      type: core/ai-agent/agent-framework
      values:
        display_name: "Support Assistant"
        description: "Answers a customer's question about the product from its documentation."
      uses:
        model:
          gpt-4-1-mini:
            target: gpt-4-1-mini
        tools:
          microsoft-learn:
            target: microsoft-learn
    # The model gpt-4.1-mini, which SupportAgent names with the OpenAI provider.
    gpt-4-1-mini:
      type: core/ai-model/openai
      values:
        model: "gpt-4.1-mini"
    # The MCP server microsoft_learn, which SupportAgent reaches.
    # Applied by the application from the declarative agent, and taken by no key of core/ai-tool/mcp: its approval mode, never; the tools of the server it allows, microsoft_docs_search, microsoft_docs_fetch.
    microsoft-learn:
      type: core/ai-tool/mcp
      values:
        description: "Search Microsoft's documentation on Microsoft Learn."
```

The instructions, the options of the model's requests, the MCP server's
approval mode and the tools of it the agent may call stay in the declarative
agent, which the application reads; the comments name each.

`release.yaml` — an entry for the agent, with what the declarative agent does
not state named in a comment above it, an entry placing the model beside it,
and the MCP server's address:

<!-- quotes: draft/release.yaml -->
```yaml
apiVersion: aggrega.ai/v1alpha1
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
    # The declarative agent also states these values for its connections, which the application reads from it, written here for review:
    #   - model.connection.key, read from the environment variable OPENAI_API_KEY
    supportagent:
      infra: {}
    gpt-4-1-mini:
      infra: {}
    microsoft-learn:
      infra:
        endpoint: "https://learn.microsoft.com/api/mcp"
```

The model's key is named by the variable it is read from, never valued.

`manifest.yaml` — the one Compose Recipe the catalog offers for the agent and
for the model, and none for the MCP server:

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

With the environment set, the next refusals are the MCP server, whose Recipe the
Manifest does not choose, and the image the Release does not name:

```text
  [OPS_ERROR E0099] .spec.components.microsoft-learn
    no recipe resolved for component/feature instance: add an explicit Manifest mapping for its type (Manifest, at .spec.components.microsoft-learn, "microsoft-learn", of type "core/ai-tool/mcp", recipes implementing it "compose/mcp-remote:1.0.0, compose/mcp-stdio-bridge:1.0.0, helm/mcp-remote:1.0.0, helm/mcp-stdio-bridge:1.0.0, helm/mcp:1.0.0"). pin one of them in the Manifest
  [… omitted: the refusal naming the image, below]
release dependency validation failed: 2 diagnostic(s)
```

The review changes the Release, and adds two mappings to the Manifest:

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
- **Map the Manifest.** `core/ai-tool/mcp` maps to `compose/mcp-remote`: the
  server is one Microsoft runs, reached at its address, so nothing runs for it
  in the stack. The other, `compose/mcp-stdio-bridge`, runs a server published
  as a package that speaks only stdio. `core/secret-value` maps to
  `compose/dotenv-secret`, which writes the reference into the Compose file as
  written, so Docker Compose fills it from your shell when the stack starts and
  no file carries the key.

The Aggregate needs no change. The reviewed `release.yaml`:

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
  description: Draft Release imported from a source in the agent-framework format.
spec:
  aggregate: imported/flow
  manifest: imported/flow
  components:
    # Left for the Release, since the declarative agent does not state it:
    #   - infra.image, the container image running the application built on Agent Framework, holding its declarative agent
    #   - the credential supportagent presents to the model it reaches, attached under credential on its connection uses.model.gpt-4-1-mini
    # The declarative agent also states these values for its connections, which the application reads from it, written here for review:
    #   - model.connection.key, read from the environment variable OPENAI_API_KEY
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
    microsoft-learn:
      infra:
        endpoint: "https://learn.microsoft.com/api/mcp"
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
        core/ai-agent/agent-framework: compose/agent-framework
        core/ai-model/openai: compose/openai
        # Reviewed: an MCP server someone else runs, reached at its address.
        core/ai-tool/mcp: compose/mcp-remote
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

The agent's service in `dist/compose/docker-compose.yaml`:

```yaml
services:
  supportagent:
    image: ghcr.io/example/support-agent:1.0.0
    environment:
      OPENAI_BASE_URL: https://api.openai.com/v1
      OPENAI_MODEL: gpt-4.1-mini
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      AGGREGA_TOOL_MICROSOFT_LEARN_URL: https://learn.microsoft.com/api/mcp
    [… omitted: the labels the build writes on every service, naming the Aggregate, the component, the environment and the compiler's version]
    networks:
      - compose
```

The application receives the model's address, its name and its key in the
variables Agent Framework's OpenAI clients read, so the declarative agent's
`=Env.OPENAI_API_KEY` reads the key the Release attached. The MCP server's
address arrives as `AGGREGA_TOOL_MICROSOFT_LEARN_URL`, for an application that
hands its tool the address itself; the declarative agent's MCP tool reaches the
address its own `url` states. Neither the model nor the MCP server gets a
service: both are reached at their own addresses. The key is a variable
reference, filled from your shell when the stack starts.
