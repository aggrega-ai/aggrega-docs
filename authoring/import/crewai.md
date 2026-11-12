# Import a CrewAI project

This walkthrough imports the agent and task declarations of a CrewAI project —
a crew of two agents answering a customer's question about support plans —
reviews what the import drafts, and builds the crew for Docker Compose. Every file
and every block of output below comes from a real run; the declarations and
each stage of the walkthrough are in the
[import-crewai](../../language-reference/examples/import-crewai/README.md)
example, where a check script runs the import again and compares what it writes, what it
prints and the blocks this page quotes with the files kept there.

## Scaffold the example

Write the example into a new folder named after it:

```bash
aggrega scaffold --example import-crewai
```

It then prints the commands to run next. The first two change into the new folder
and into its `source` folder, which holds what this page imports and is where
the import runs:

```bash
cd import-crewai
cd source
```

## The project

A CrewAI project keeps its crew's behaviour in a program and declares its
agents and its tasks in configuration files. This one, written for this
walkthrough, is in CrewAI's classic layout, and the import reads its two
declaration files, under
`src/support_brief/config/`. The program — a classic project's `crew.py`, the
tools it defines — is never read, so the example holds only the declarations.

`agents.yaml` declares the two agents, both on OpenAI's `gpt-4o-mini`:

<!-- quotes: source/src/support_brief/config/agents.yaml -->
```yaml
researcher:
  role: >
    Support plan researcher
  goal: >
    Find what each support plan of the company covers, and what it costs
  backstory: >
    You keep the company's support plans at your fingertips and answer from
    them alone.
  llm: openai/gpt-4o-mini
  verbose: true

writer:
  role: >
    Support reply writer
  goal: >
    Turn the researcher's findings into a short, friendly reply to the customer
  backstory: >
    You write replies customers can act on, in plain words.
  llm: openai/gpt-4o-mini
```

`tasks.yaml` assigns one task to each:

<!-- quotes: source/src/support_brief/config/tasks.yaml -->
```yaml
research_task:
  description: >
    Find the support plans that answer the customer's question: {question}
  expected_output: >
    The plans that apply, each with what it covers and what it costs
  agent: researcher

reply_task:
  description: >
    Write a reply to the customer's question from the researcher's findings
  expected_output: >
    A reply of at most five sentences
  agent: writer
```

At the project's root, an `.aggrega-config.yaml` makes the folder a workspace:

<!-- quotes: source/.aggrega-config.yaml -->
```yaml
# The workspace key marks this directory as the workspace root, so an import run
# here writes its drafts beside src/.
workspace: {}
# The registry the importer is fetched from the first time an import needs it.
default_registry: hub.aggrega.ai
```

The import references the catalog's agent and model Components, and `--target`
drafts a Manifest from its Recipes, so name a checkout of the standard-library
catalog ([where to get one](README.md#how-an-import-runs)), by its absolute
path:

```bash
export AGGREGA_CATALOG_DIRS=/path/to/aggrega-catalog
```

The import reads that catalog from folders on your machine, not from the
registry it fetches its importer from, so the scaffolded example needs the
checkout too: with none, `--target` is refused, since no Recipe binds to the
target.

## Run the import

Name the crew's directory. The import reads the declarations in it and nothing
else:

<!-- quotes: import-command -->
```bash
aggrega import src/support_brief --target compose
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
read as the crewai format, with drafted paths relative to <workspace>
mapped researcher (agent) to core/ai-agent/crewai as a reference, NONE
mapped openai/gpt-4o-mini (llm) to core/ai-model/openai as a reference, NONE
mapped writer (agent) to core/ai-agent/crewai as a reference, NONE
made no choice for research_task (task)
made no choice for reply_task (task)
```

- **The `mapped` lines** say that each agent is an instance of the standard
  library's CrewAI agent, `core/ai-agent/crewai`, and that the model both name,
  `openai/gpt-4o-mini`, is an instance of `core/ai-model/openai`. Their tier
  reads `NONE`: the CrewAI import references these Components by what the
  declarations name, an agent and a model provider, rather than by weighing
  each against the catalog.
- **The `made no choice` lines** say that the tasks are drafted as nothing: a
  task is logic the crew's program runs.

## What it wrote

The Aggregate, the Release and the Manifest are named `imported/support-brief`:
a project's `config/agents.yaml` and `config/tasks.yaml` name no crew — its name
lives in the program, which the import does not read — so a directory import of
them is named after the directory, `support_brief`, written as a name segment,
under the namespace the importer's `target_namespace` setting sets, `imported`
unless you set another
([Settings](../../language-reference/plugins/core-importers.md#settings)).

`aggregate.yaml` — one instance per agent, each wired to the model it names,
and the model, opening with comments that say what was read and what was not:

<!-- quotes: draft/aggregate.yaml -->
```yaml
# CrewAI declarations read:
#   - config/agents.yaml
#   - config/tasks.yaml
# Not read: the crew's program, which runs its agents and its tasks and defines its tools; it runs in the image the Release names for each agent.
# Tasks the crew's program runs, drafted as no Component:
#   - research_task, assigned to researcher
#   - reply_task, assigned to writer
apiVersion: aggrega.ai/v1beta1
kind: Aggregate
metadata:
  name: imported/support-brief
  version: 0.1.0
  description: Draft Aggregate imported from a source in the crewai format.
spec:
  components:
    researcher:
      type: core/ai-agent/crewai
      values:
        role: "Support plan researcher\u000A"
        goal: "Find what each support plan of the company covers, and what it costs\u000A"
        backstory: "You keep the company's support plans at your fingertips and answer from them alone.\u000A"
        allow_delegation: false
        log_level: DEBUG
      uses:
        model:
          gpt-4o-mini:
            target: gpt-4o-mini
    writer:
      type: core/ai-agent/crewai
      values:
        role: "Support reply writer\u000A"
        goal: "Turn the researcher's findings into a short, friendly reply to the customer\u000A"
        backstory: "You write replies customers can act on, in plain words.\u000A"
        allow_delegation: false
        log_level: INFO
      uses:
        model:
          gpt-4o-mini:
            target: gpt-4o-mini
    # The model openai/gpt-4o-mini.
    gpt-4o-mini:
      type: core/ai-model/openai
      values:
        model: "gpt-4o-mini"
```

`role`, `goal` and `backstory` are carried as declared, the line break each
folded block ends with included. `log_level` is `DEBUG` for the researcher,
declared `verbose`, and `INFO` for the writer, which is not. An agent that
declares no `allow_delegation` is drafted with `false`.

`release.yaml` — an entry for each agent, with what no declaration states
named in a comment above it, and an entry placing the model beside them:

<!-- quotes: draft/release.yaml -->
```yaml
apiVersion: aggrega.ai/v1beta1
kind: Release
metadata:
  name: imported/support-brief
  # environment: left for the operator, since no source names the environment this Release deploys to.
  version: 0.1.0
  description: Draft Release imported from a source in the crewai format.
spec:
  aggregate: imported/support-brief
  manifest: imported/support-brief
  components:
    # Left for the Release, since no declaration states it:
    #   - infra.image, the container image running the crew's program
    #   - the credential researcher presents to the model it reaches, attached under credential on its connection uses.model.gpt-4o-mini
    researcher:
      infra: {}
    # Left for the Release, since no declaration states it:
    #   - infra.image, the container image running the crew's program
    #   - the credential writer presents to the model it reaches, attached under credential on its connection uses.model.gpt-4o-mini
    writer:
      infra: {}
    gpt-4o-mini:
      infra: {}
```

`manifest.yaml` — the one Compose Recipe the catalog offers for each type:

<!-- quotes: draft/manifest.yaml -->
```yaml
apiVersion: aggrega.ai/v1beta1
kind: Manifest
metadata:
  name: imported/support-brief
  version: 0.1.0
spec:
  mappings:
    components:
      type:
        core/ai-agent/crewai: compose/crewai
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

With the environment set, the next refusal is the key each agent presents to
the model, which no declaration states:

```text
  [DEVELOPER_ERROR E0033]
    Component/Feature assertions
    caused by: Component "core/ai-agent/crewai" instance "researcher" assertion "managed_target_needs_a_credential": assertion "Component/core/ai-agent/crewai/researcher/managed_target_needs_a_credential": template: Component/core/ai-agent/crewai/researcher/managed_target_needs_a_credential:1:369: executing "Component/core/ai-agent/crewai/researcher/managed_target_needs_a_credential" at <fail (printf "the %s connection %s of %q reaches %q, whose component.aggrega.ai/hosting label is managed, with no credential: attach one under credential on that connection, or set unauthenticated: true in its values" $socket $alias $.metadata.instance_id $connection.target)>: error calling fail: assertion failed: the model connection gpt-4o-mini of "researcher" reaches "gpt-4o-mini", whose component.aggrega.ai/hosting label is managed, with no credential: attach one under credential on that connection, or set unauthenticated: true in its values
release dependency validation failed: 1 diagnostic(s)
```

The review changes the Release, and adds one mapping to the Manifest:

- **Set the environment**, `development`.
- **Name the image each agent runs.** The crew's program runs in an image you
  build from the project; both agents run the same one here,
  `ghcr.io/example/support-brief:1.0.0`.
- **Present the OpenAI key on each agent's model connection**, as the comments
  ask. The model is a hosted service, so the agent's Component refuses a
  connection to it that carries no credential, naming the connection. Each
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
  name: imported/support-brief
  # Reviewed: the environment this Release deploys to.
  environment: development
  version: 0.1.0
  description: Draft Release imported from a source in the crewai format.
spec:
  aggregate: imported/support-brief
  manifest: imported/support-brief
  components:
    # Left for the Release, since no declaration states it:
    #   - infra.image, the container image running the crew's program
    #   - the credential researcher presents to the model it reaches, attached under credential on its connection uses.model.gpt-4o-mini
    researcher:
      # Reviewed: the image running the crew's program, which you build from
      # the project.
      infra:
        image: ghcr.io/example/support-brief:1.0.0
      # Reviewed: the OpenAI key this agent presents to the model, read from
      # your shell when the stack starts, so no file carries it.
      uses:
        model:
          gpt-4o-mini:
            features:
              credential:
                type: core/secret-value
                infra:
                  origin: "${OPENAI_API_KEY}"
    # Left for the Release, since no declaration states it:
    #   - infra.image, the container image running the crew's program
    #   - the credential writer presents to the model it reaches, attached under credential on its connection uses.model.gpt-4o-mini
    writer:
      # Reviewed: the image running the crew's program, which you build from
      # the project.
      infra:
        image: ghcr.io/example/support-brief:1.0.0
      # Reviewed: the OpenAI key this agent presents to the model, read from
      # your shell when the stack starts, so no file carries it.
      uses:
        model:
          gpt-4o-mini:
            features:
              credential:
                type: core/secret-value
                infra:
                  origin: "${OPENAI_API_KEY}"
    gpt-4o-mini:
      infra: {}
```

The reviewed `manifest.yaml`:

<!-- quotes: reviewed/manifest.yaml -->
```yaml
# The draft manifest.yaml after review. Each change is marked "Reviewed:".
apiVersion: aggrega.ai/v1beta1
kind: Manifest
metadata:
  name: imported/support-brief
  version: 0.1.0
spec:
  mappings:
    components:
      type:
        core/ai-agent/crewai: compose/crewai
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

The researcher's service in `dist/compose/docker-compose.yaml`; the writer's
differs only in its name and in the values its own variables carry:

```yaml
services:
  researcher:
    image: ghcr.io/example/support-brief:1.0.0
    environment:
      OPENAI_BASE_URL: https://api.openai.com/v1
      MODEL: gpt-4o-mini
      CREWAI_ALLOW_DELEGATION: "false"
      CREWAI_BACKSTORY: |
        You keep the company's support plans at your fingertips and answer from them alone.
      CREWAI_GOAL: |
        Find what each support plan of the company covers, and what it costs
      CREWAI_LOG_LEVEL: DEBUG
      CREWAI_ROLE: |
        Support plan researcher
      OPENAI_API_KEY: ${OPENAI_API_KEY}
    [… omitted: the labels the build writes on every service, naming the Aggregate, the component, the environment and the compiler's version]
    networks:
      - compose
```

The agent receives the model's address and its name as `OPENAI_BASE_URL` and
`MODEL`, the variables CrewAI reads them from, and the key as `OPENAI_API_KEY`.
Its role, goal, backstory, delegation switch and log level arrive under the
names the CrewAI Component gives them by default, for the crew's program to
read; an `inject:` block on the component itself delivers any of them under the
name the program reads instead. Each value the import drafted keeps the line
break its declaration ended with, so the file writes it as a block.
The model gets no service of its own: the agents reach the OpenAI API at its
own address. The key is a variable reference, filled from your shell when the
stack starts. The services publish no port on your machine: the rendered file
gives them none.

## Run it

You build the image from the project, with a Dockerfile of your own. Docker
Compose runs the image's own command as each agent's service, since the Recipe
sets none, so that command must keep running, and must serve requests if you
want to reach the crew. Your program decides the address, the route and the
reply.

The run below used such an image: the crew's program in CrewAI's classic
layout — a `crew.py` building the crew from the two declaration files, as the
import read them — and, as the image's command, a small HTTP server of the
program's own on port 8000, which runs the crew once for each `POST /kickoff`.
Build your image at the project's root, put its name in place of
`ghcr.io/example/support-brief:1.0.0` for both agents in `release.yaml`, and
build again:

```bash
docker build -t support-brief:local .
aggrega build --release release.yaml --auto-pull
```

Then set the key in your shell and start the stack:

```bash
export OPENAI_API_KEY='your OpenAI key'
docker compose -p support-brief -f dist/compose/docker-compose.yaml up -d --wait
```

`-p` names the project, as the run step of
[How an import runs](README.md#how-an-import-runs) explains. The services
publish no port, so the run sent its request from a container on the stack's
network, `support-brief_compose`, to its own program's route:

```bash
docker run --rm --network support-brief_compose curlimages/curl:8.11.1 -sS -X POST \
  http://researcher:8000/kickoff -H 'Content-Type: application/json' \
  -d '{"question": "Which support plan covers a weekend outage, and what does it cost?"}'
```

```text
{
  "answer": "[… omitted: the crew's reply, written by the small local model]",
  "token_usage": {
    [… omitted: the token counts]
    "successful_requests": 2
  }
}
```

The route, the request and the shape of the reply are that program's own.
Both agents run the same image, so the request could go to either; the crew
ran its two tasks, one request to the model each. This answer came from a
small local model in place of OpenAI, set up as the run step of
[How an import runs](README.md#how-an-import-runs) describes.

Stop the stack with:

```bash
docker compose -p support-brief -f dist/compose/docker-compose.yaml down
```
