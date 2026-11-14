---
example:
  level: start
  tier: importers
  position: 10
  products: [core/ai-agent/agent-framework, core/ai-model/openai]
  shows: [import, connections, credentials, recipe-selection]
---

# Import a Microsoft Agent Framework declarative agent — an agent and an MCP server

A declarative agent of Microsoft Agent Framework — one agent on an OpenAI
model, searching documentation through an MCP server — drafted into Aggrega
files by `aggrega import`, with the application's image answered once in an
answers file, and built for Docker Compose.

[Import a Microsoft Agent Framework declarative agent](../../../authoring/import/agent-framework.md)
walks it step by step: the command, what it asks for, the files it writes and
why each line is there, the build, and the agent running. This folder holds
each stage of that walkthrough:

| folder or file | what it holds |
|---|---|
| `source/` | the declarative agent, `support-agent.yaml`, the `.aggrega-config.yaml` that makes the folder a workspace, and `import-answers.yaml`, the values no declarative agent holds: the application's image, and the name of the Kubernetes Secret a build for Kubernetes reads the OpenAI key from |
| `draft/` | the files `aggrega import support-agent.yaml --target compose` wrote, unchanged, `release.lock` included, and what it printed: `stdout.txt` on standard output, `import.txt` on standard error |

The declarative agent is written for this example. The application's code,
which loads it, is not part of it: the import never reads it, and the Release
names the image the application runs in.

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
aggrega scaffold --example import-agent-framework
```

It then prints the commands to run next. The first changes into the new folder:

```sh
cd import-agent-framework
```

## Build

The import drafts the Aggrega files beside the declarative agent, in `source/`.
It weighs the project against the standard-library catalog, which the
workspace's default registry publishes as a signed snapshot: the first import
fetches it, verifies it, keeps it in the workspace's content cache and names it
by its digest in the record it writes beside the drafts. A workspace that names
its own catalog folders — in `AGGREGA_CATALOG_DIRS`, or under
`workspace.catalog_dirs` — imports against those instead. The import reads the
image from `import-answers.yaml`, then pulls what the drafted Release depends
on, so the build follows at once:

```sh
cd source
aggrega import support-agent.yaml --target compose
aggrega build --release release.yaml
```

The image the example names stands for one you build from your project;
building it and running the stack are in the walkthrough linked above.

## With an AI assistant

An AI assistant [set up with Aggrega's tools](../../../ai-assistants/set-up.md)
can do the same: paste this prompt into it.

<!-- copyable -->

> Use the Aggrega tools only, and create no folder yourself. If the Workspace folder holds no `import-agent-framework` folder yet, call the `scaffold` tool once with `example` set to `import-agent-framework` and no `dir`: it writes the example into a new `import-agent-framework` folder, whose `source` folder holds what this example imports. Then call the `import` tool with `workspace_root` set to `import-agent-framework/source`, `source` set to `support-agent.yaml` and `target` set to `compose`: it reads the answers it needs from `import-answers.yaml` beside `support-agent.yaml`, writes its drafts into `import-agent-framework/source` and pulls what they need. Then call the `validate` tool with `workspace_root` set to `import-agent-framework/source` and `release` set to `release.yaml`, and the `build` tool with `workspace_root` set to `import-agent-framework/source`, `release` set to `release.yaml` and `write` set to true. Tell me which files the build wrote; they are under `import-agent-framework/source/dist/`.

## Test it

With the stack running as the walkthrough runs it, one request reaches the
agent. The route below is the walkthrough's own program's, a small HTTP server
on port 8000; your own program decides its own. The service publishes no port,
so the request comes from a container on the stack's network:

```sh
docker run --rm --network docs-assistant_compose curlimages/curl:8.11.1 -sS -X POST \
  http://supportagent:8000/ask -H 'Content-Type: application/json' \
  -d '{"question": "In one short sentence: what is Azure Container Apps?"}'
```

```text
{"error": "the agent failed: ChatClientException: (\"<class 'agent_framework_openai._chat_client.OpenAIChatClient'> service failed to complete the prompt: Error code: 401 - Incorrect API key provided: sk-place************-key. [… omitted: where to find an API key, and the same error repeated as the exception it wraps]"}
```

The run's key was a placeholder, so the answer is OpenAI's refusal of it. On
Kubernetes, forward a local port to the Deployment, which has no Service, and
send the same request to it from another terminal:

```sh
kubectl port-forward deploy/supportagent 8000:8000
```

```sh
curl -sS -X POST http://127.0.0.1:8000/ask -H 'Content-Type: application/json' \
  -d '{"question": "In one short sentence: what is Azure Container Apps?"}'
```

The answer is the same.
