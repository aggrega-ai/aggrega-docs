# Import a Google ADK agent

This walkthrough imports the Agent Config of an application built on Google's
Agent Development Kit (ADK) — one agent answering customers' questions about
their orders — reviews what the import drafts, and builds the application for
Docker Compose. Every file and every block of output below comes from a real
run; the configuration and each stage of the walkthrough are in the
[import-google-adk](../../language-reference/examples/import-google-adk/README.md)
example, where a check script runs the import again and compares what it writes, what it
prints and the blocks this page quotes with the files kept there.

## The project

ADK can declare an application's agents in Agent Config files instead of code:
`adk create --type=config` writes `root_agent.yaml`, the configuration of the
root agent, and an environment file beside it. This one, written for this
walkthrough, declares one agent on Gemini's `gemini-2.5-flash`, with the
Google Search tool ADK ships:

<!-- quotes: source/support_agent/root_agent.yaml -->
```yaml
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.

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
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.

# The workspace key marks this directory as the workspace root, so an import run
# here writes its drafts beside support_agent/.
workspace: {}
# The registry the importer is fetched from the first time an import needs it.
default_registry: hub.aggrega.ai
```

The import references the catalog's ADK agent and Gemini model Components, and
`--target` drafts a Manifest from its Recipes, so name a checkout of the
standard-library catalog, by its absolute path:

```bash
export AGGREGA_CATALOG_DIRS=/path/to/aggrega-catalog
```

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

`aggregate.yaml` — the agent, wired to the model, and the model, opening with
comments that say what was read and what was not:

<!-- quotes: draft/aggregate.yaml -->
```yaml
# Google ADK agent configurations read:
#   - root_agent.yaml
# Not read: the application's code, which defines the tools, callbacks and agents a configuration names by their code, nor the environment file ADK's scaffold writes beside root_agent.yaml; the application runs in the image the Release names for each instance, and loads its configurations itself.
# ADK states that its Agent Config is experimental and currently supports only Gemini models.
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: imported/flow
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

`release.yaml` — an entry for the agent, with what no configuration states
named in a comment above it:

<!-- quotes: draft/release.yaml -->
```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Release
metadata:
  name: imported/flow
  # environment: left for the operator, since no source names the environment this Release deploys to.
  version: 0.1.0
  description: Draft Release imported from a source in the google-adk format.
spec:
  aggregate: imported/flow
  manifest: imported/flow
  components:
    # Left for the Release, since no configuration states it:
    #   - infra.image, the container image running the application built on ADK, holding its configurations
    #   - the credential support-agent presents to the model it reaches, attached under credential on its connection uses.model.gemini-2-5-flash
    support-agent:
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

With the environment set, the next refusal is the model, which the drafted
Release does not place:

```text
  [OPS_ERROR E0260] .spec.components.gemini-2-5-flash
    component placed in no boundary: name it under a boundary's `components`, or place the sub-module that contributes it under `aggregates` (Release imported/flow, at .spec.components.gemini-2-5-flash, "gemini-2-5-flash")
release dependency validation failed: 1 diagnostic(s)
```

The review changes the Release, and adds one mapping to the Manifest:

- **Set the environment**, `development`.
- **Place the model** beside the agent: `gemini-2-5-flash: {}`.
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
apiVersion: aggrega.ai/v1alpha1
kind: Release
metadata:
  name: imported/flow
  # Reviewed: the environment this Release deploys to.
  environment: development
  version: 0.1.0
  description: Draft Release imported from a source in the google-adk format.
spec:
  aggregate: imported/flow
  manifest: imported/flow
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
    # Reviewed: the model the agent reaches, placed with it.
    gemini-2-5-flash: {}
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
Pull complete: release.lock (entities=7, source_artifacts=0, external_inputs=0)
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
