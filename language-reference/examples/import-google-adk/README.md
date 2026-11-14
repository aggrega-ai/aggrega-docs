---
example:
  level: start
  tier: importers
  position: 7
  products: [core/ai-agent/google-adk, core/ai-model/gemini]
  shows: [import, connections, credentials]
---

# Import a Google ADK agent — one agent on Gemini

The Agent Config of an application built on Google's Agent Development Kit —
one agent on Gemini, with the Google Search tool ADK ships — drafted into
Aggrega files by `aggrega import`, with the application's image answered once
in an answers file, and built for Docker Compose.

[Import a Google ADK agent](../../../authoring/import/google-adk.md) walks it
step by step: the command, what it asks for, the files it writes and why each
line is there, the build, and the agent running. This folder holds each stage
of that walkthrough:

| folder or file | what it holds |
|---|---|
| `source/` | the agent's configuration, `support_agent/root_agent.yaml`, the `.aggrega-config.yaml` that makes the folder a workspace, and `support_agent/import-answers.yaml`, the values no configuration holds: the application's image, and the name of the Kubernetes Secret a build for Kubernetes reads the Gemini API key from |
| `draft/` | the files `aggrega import support_agent --target compose` wrote, unchanged, `release.lock` included, and what it printed: `stdout.txt` on standard output, `import.txt` on standard error |

The configuration is written for this example. The application's code and the
environment file ADK's scaffold writes are not part of it: the import never
reads either, and the Release names the image the application runs in.

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
aggrega scaffold --example import-google-adk
```

It then prints the commands to run next. The first changes into the new folder:

```sh
cd import-google-adk
```

## Build

The import drafts the Aggrega files beside the project, in `source/`. It weighs
the project against the standard-library catalog, which the workspace's default
registry publishes as a signed snapshot: the first import fetches it, verifies
it, keeps it in the workspace's content cache and names it by its digest in the
record it writes beside the drafts. A workspace that names its own catalog
folders — in `AGGREGA_CATALOG_DIRS`, or under `workspace.catalog_dirs` —
imports against those instead. The import reads the image from
`support_agent/import-answers.yaml`, then pulls what the drafted Release
depends on, so the build follows at once:

```sh
cd source
aggrega import support_agent --target compose
aggrega build --release release.yaml
```

The image the example names stands for one you build from your project;
building it and running the stack are in the walkthrough linked above.

## With an AI assistant

An AI assistant [set up with Aggrega's tools](../../../ai-assistants/set-up.md)
can do the same: paste this prompt into it.

<!-- copyable -->

> Use the Aggrega tools only, and create no folder yourself. If the Workspace folder holds no `import-google-adk` folder yet, call the `scaffold` tool once with `example` set to `import-google-adk` and no `dir`: it writes the example into a new `import-google-adk` folder, whose `source` folder holds what this example imports. Then call the `import` tool with `workspace_root` set to `import-google-adk/source`, `source` set to `support_agent` and `target` set to `compose`: it reads the answers it needs from `import-answers.yaml` inside the `support_agent` folder, writes its drafts into `import-google-adk/source` and pulls what they need. Then call the `validate` tool with `workspace_root` set to `import-google-adk/source` and `release` set to `release.yaml`, and the `build` tool with `workspace_root` set to `import-google-adk/source`, `release` set to `release.yaml` and `write` set to true. Tell me which files the build wrote; they are under `import-google-adk/source/dist/`.

## Test it

With the stack running as the walkthrough runs it, on the image its
`Dockerfile` builds, send the agent a message at the port the Release
publishes:

```sh
curl -sS -X POST http://127.0.0.1:8000/run -H 'Content-Type: application/json' \
  -d '{"app_name": "support_agent", "user_id": "u1", "session_id": "s1", "new_message": {"role": "user", "parts": [{"text": "Where is my order 1234? Answer in one short sentence."}]}}'
```

The run's Gemini key was a placeholder, so the request answered HTTP 500,
`Internal Server Error`, and the service's log names Gemini's refusal:

```text
google.genai.errors.ClientError: 400 INVALID_ARGUMENT. {'error': {'code': 400, 'message': 'API key not valid. Please pass a valid API key.', 'status': 'INVALID_ARGUMENT', [… omitted: the error's details]}}
```

Imported with `--target helm`, on the image pushed to a registry the cluster
reads, as
[the walkthrough](../../../authoring/import/google-adk.md#on-kubernetes)
shows, the agent answers the same message at the same address once a local
port is forwarded to its Service:

```sh
kubectl port-forward -n <namespace> svc/support-agent-default 8000:8000
```
