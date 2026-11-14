---
example:
  level: start
  tier: importers
  position: 5
  products: [core/ai-agent/langflow, core/ai-model/openai]
  shows: [import, connections, credentials]
---

# Import a Langflow flow — the Basic Prompting starter project

Langflow's Basic Prompting starter project, exported as JSON, imported by
`aggrega import` into an Aggregate, a Release and a Manifest that build for
Docker Compose as written.

[Import a Langflow flow](../../../authoring/import/langflow.md) walks it step
by step: the command, the files it writes, the build and a run of what it
builds. This folder holds each stage of that walkthrough:

| folder | what it holds |
|---|---|
| `source/` | the exported flow, `basic-prompting.json`; the `.aggrega-config.yaml` that makes the folder a workspace; and `import-answers.yaml`, the answers to what no flow can hold, which an import for Kubernetes asks for |
| `draft/` | the files `aggrega import basic-prompting.json --target compose` wrote, unchanged, and what it printed: `stdout.txt` on standard output, `import.txt` on standard error |

`source/basic-prompting.json` is the starter project Langflow 1.6.0 ships,
carried unchanged from the Langflow repository
(<https://github.com/langflow-ai/langflow>, at commit
`504c02fc47e76087b82b0e7cbe4186e9cdd916d4`, the file
`src/lfx/tests/data/starter_projects_1_6_0/Basic Prompting.json`), under the
licence reproduced beside it in `LICENSE.langflow`. The drafts carry the same
flow, its edges' handles written as Langflow's editor writes them.

In a checkout of the documentation repository, `check.sh` runs the import
again, compares what it writes and prints with `draft/`, compares the blocks
the walkthrough quotes with these files, and validates and builds what the
import wrote. It needs the standard-library catalog
([where to get one](../../../authoring/import/README.md#how-an-import-runs))
checked out beside this repository, or its directory named in
`AGGREGA_CATALOG_DIRS`.

## Scaffold the example

You can run this example's import with the commands below, or
[have your AI assistant run it for you](#with-an-ai-assistant).

Write the example into a new folder named after it:

```sh
aggrega scaffold --example import-langflow
```

It then prints the commands to run next. The first changes into the new folder:

```sh
cd import-langflow
```

## Build

The import drafts the Aggrega files beside the project, in `source/`, and pulls
what the build needs. It weighs the project against the standard-library
catalog, which the workspace's default registry publishes as a signed snapshot:
the first import fetches it, verifies it, keeps it in the workspace's content
cache and names it by its digest in the record it writes beside the drafts. A
workspace that names its own catalog folders — in `AGGREGA_CATALOG_DIRS`, or
under `workspace.catalog_dirs` — imports against those instead:

```sh
cd source
aggrega import basic-prompting.json --target compose
aggrega validate --release release.yaml
aggrega build --release release.yaml
```

Running what the build writes is in the walkthrough linked above.

## With an AI assistant

An AI assistant [set up with Aggrega's tools](../../../ai-assistants/set-up.md)
can do the same: paste this prompt into it.

<!-- copyable -->

> Use the Aggrega tools only, and create no folder yourself. If the Workspace folder holds no `import-langflow` folder yet, call the `scaffold` tool once with `example` set to `import-langflow` and no `dir`: it writes the example into a new `import-langflow` folder, whose `source` folder holds what this example imports. Then call the `import` tool with `workspace_root` set to `import-langflow/source`, `source` set to `basic-prompting.json` and `target` set to `compose`: it reads the answers it needs from `import-answers.yaml` beside `basic-prompting.json`, writes its drafts into `import-langflow/source` and pulls what they need. Then call the `validate` tool with `workspace_root` set to `import-langflow/source` and `release` set to `release.yaml`, and the `build` tool with `workspace_root` set to `import-langflow/source`, `release` set to `release.yaml` and `write` set to true. Tell me which files the build wrote; they are under `import-langflow/source/dist/`.

## Test it

With the stack running as the walkthrough runs it, open
<http://127.0.0.1:7860> and sign in as `admin`: Basic Prompting is in the
editor. The API runs the flow for an API key, which
[the walkthrough](../../../authoring/import/langflow.md#test-it) creates after
signing in; with it:

```sh
curl -sS -X POST 'http://127.0.0.1:7860/api/v1/run/0dbee653-41ae-4e51-af2e-55757fb24be3?stream=false' \
  -H 'x-api-key: <api_key>' -H 'Content-Type: application/json' \
  -d '{"input_value": "In one short sentence: what is Docker Compose?", "input_type": "chat", "output_type": "chat"}'
```

```text
{"detail":"{\"message\":\"Error running graph: Error building Component Language Model: \\n\\nError code: 401 - {'error': {'message': 'Incorrect API key provided: sk-place*****************-key. You can find your API key at https://platform.openai.com/account/api-keys.', 'type': 'invalid_request_error', 'code': 'invalid_api_key', 'param': None}, 'status': 401}\",[… omitted: three empty fields, and a suggestion to update three of the flow's components]}"}
```

The run's OpenAI key was a placeholder, so the answer is OpenAI's refusal of
it: the flow ran as far as its call to the model.

Imported with `--target helm` and applied to Kubernetes, Langflow answers the
same requests at the same address once a local port is forwarded to its
Service:

```sh
kubectl port-forward -n <namespace> svc/langflow-default 7860:7860
```
