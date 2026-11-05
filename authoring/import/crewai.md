# Import a CrewAI project

This walkthrough imports the agent and task declarations of a CrewAI project —
a crew of two agents answering a customer's question about support plans —
reviews what the import drafts, and builds the crew for Kubernetes. Every file
and every block of output below comes from a real run; the declarations and
each stage of the walkthrough are in the
[import-crewai](../../language-reference/examples/import-crewai/README.md)
example, where a check script runs the import again and compares what it writes, what it
prints and the blocks this page quotes with the files kept there.

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
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.

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
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.

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
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.

# The workspace key marks this directory as the workspace root, so an import run
# here writes its drafts beside src/.
workspace: {}
# The registry the importer is fetched from the first time an import needs it.
default_registry: hub.aggrega.ai
```

The import references the catalog's agent and model Components, and `--target`
drafts a Manifest from its Recipes, so name a checkout of the standard-library
catalog, by its absolute path:

```bash
export AGGREGA_CATALOG_DIRS=/path/to/aggrega-catalog
```

## Run the import

Name the crew's directory. The import reads the declarations in it and nothing
else:

<!-- quotes: import-command -->
```bash
aggrega import src/support_brief --target helm
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
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: imported/flow
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
named in a comment above it:

<!-- quotes: draft/release.yaml -->
```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Release
metadata:
  name: imported/flow
  # environment: left for the operator, since no source names the environment this Release deploys to.
  version: 0.1.0
  description: Draft Release imported from a source in the crewai format.
spec:
  aggregate: imported/flow
  manifest: imported/flow
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
```

`manifest.yaml` — the one Helm Recipe the catalog offers for each type:

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
        core/ai-agent/crewai: helm/crewai
        core/ai-model/openai: helm/openai
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
  [OPS_ERROR E0260] .spec.components.gpt-4o-mini
    component placed in no boundary: name it under a boundary's `components`, or place the sub-module that contributes it under `aggregates` (Release imported/flow, at .spec.components.gpt-4o-mini, "gpt-4o-mini")
release dependency validation failed: 1 diagnostic(s)
```

The review changes the Release, and adds one mapping to the Manifest:

- **Set the environment**, `development`.
- **Place the model** beside the agents: `gpt-4o-mini: {}`.
- **Name the image each agent runs.** The crew's program runs in an image you
  build from the project; both agents run the same one here,
  `ghcr.io/example/support-brief:1.0.0`.
- **Present the OpenAI key on each agent's model connection**, as the comments
  ask. The model is a hosted service, so the agent's Component refuses a
  connection to it that carries no credential, naming the connection: "the
  model connection gpt-4o-mini of "researcher" reaches "gpt-4o-mini", whose
  component.aggrega.ai/hosting label is managed, with no credential". Each
  connection attaches a `core/referenced-secret` naming the Kubernetes Secret
  that holds the key, `openai-api-key`, under the data key `value`.
- **Map the Manifest.** `core/referenced-secret` maps to
  `helm/k8s-existing-secret`, which reads the key from that Secret, so the key
  is written into no rendered file.

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
  description: Draft Release imported from a source in the crewai format.
spec:
  aggregate: imported/flow
  manifest: imported/flow
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
      # the Secret openai-api-key, under the data key value, so no file
      # carries it.
      uses:
        model:
          gpt-4o-mini:
            features:
              credential:
                type: core/referenced-secret
                infra:
                  origin: openai-api-key
    # Left for the Release, since no declaration states it:
    #   - infra.image, the container image running the crew's program
    #   - the credential writer presents to the model it reaches, attached under credential on its connection uses.model.gpt-4o-mini
    writer:
      # Reviewed: the image running the crew's program, which you build from
      # the project.
      infra:
        image: ghcr.io/example/support-brief:1.0.0
      # Reviewed: the OpenAI key this agent presents to the model, read from
      # the Secret openai-api-key, under the data key value, so no file
      # carries it.
      uses:
        model:
          gpt-4o-mini:
            features:
              credential:
                type: core/referenced-secret
                infra:
                  origin: openai-api-key
    # Reviewed: the model both agents reach, placed with them.
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
        core/ai-agent/crewai: helm/crewai
        core/ai-model/openai: helm/openai
    # Reviewed: the key is read from a Secret already in the namespace, so it
    # is written into no rendered file.
    features:
      type:
        core/referenced-secret: helm/k8s-existing-secret
```

## Validate and build

```bash
aggrega validate --release release.yaml
aggrega build --release release.yaml --auto-pull
```

The validation prints:

```text
  notice: LINT: Feature "core/referenced-secret" at core/referenced-secret:1.0.0 declares property "origin" in both values: and infra: pillars (path: origin)
release dependency validation passed: release.yaml (schema-pillar + dependency pillars)
```

and the build, with `<workspace>` standing for the folder holding the reviewed
files:

```text
Pull complete: release.lock (entities=7, source_artifacts=0, external_inputs=0)
  notice: LINT: Feature "core/referenced-secret" at core/referenced-secret:1.0.0 declares property "origin" in both values: and infra: pillars (path: origin)
[… omitted: a total build time, which differs per run]
Build completed: 3 files written to <workspace>/dist
```

The `notice` line is advisory: the secret Feature accepts its `origin` from the
Aggregate's `values` or the Release's `infra`, and the notice reports that one
leaf is declared in both. It changes no verdict.

The build writes a Deployment for each agent under `dist/helm/`, and a Service
for the model. The researcher's container, in `researcher-deployment.yaml`:

```yaml
      containers:
        - name: main
          image: ghcr.io/example/support-brief:1.0.0
          env:
            - name: OPENAI_API_KEY
              valueFrom:
                secretKeyRef:
                  name: openai-api-key
                  key: value
            - name: OPENAI_BASE_URL
              value: https://api.openai.com/v1
            - name: MODEL
              value: gpt-4o-mini
```

The agent receives the model's address and its name as `OPENAI_BASE_URL` and
`MODEL`, the variables CrewAI reads them from, and the key by reference to the
Secret. `gpt-4o-mini-service.yaml` gives the model an in-cluster name for
`api.openai.com`. Before applying the manifests, create the Secret
`openai-api-key`, holding the key under `value`, in the namespace you deploy
to, and push the image the Release names.
