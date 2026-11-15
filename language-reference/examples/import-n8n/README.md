---
example:
  level: start
  tier: importers
  position: 3
  products: [core/ai-agent/n8n, core/ai-model/openai]
  shows: [import, connections, credentials]
---

# Import an n8n workflow — an AI agent answering chat messages

An n8n workflow — a chat trigger, an AI Agent, an OpenAI Chat Model and a
Simple Memory — imported by `aggrega import` into an Aggregate, a Release and a
Manifest that build for Docker Compose as written.

[Import an n8n workflow](../../../authoring/import/n8n.md) walks it step by
step: the command, the files it writes, the build and a run of what it builds.
This folder holds each stage of that walkthrough:

| folder | what it holds |
|---|---|
| `source/` | the workflow, `support-agent.json`; the `.aggrega-config.yaml` that makes the folder a workspace; and `import-answers.yaml`, the answer to what no workflow can hold, which an import for Kubernetes asks for |
| `draft/` | the files `aggrega import support-agent.json --target compose` wrote, unchanged, and what it printed: `stdout.txt` on standard output, `import.txt` on standard error |

`source/support-agent.json` is written for this example, in the shape n8n
exports a workflow.

In a checkout of the documentation repository, `check.sh` runs the import
again, compares what it writes and prints with `draft/`, compares the blocks
the walkthrough quotes with these files, and validates and builds what the
import wrote. It needs the standard-library catalog
([where to get one](../../../authoring/import/README.md#how-an-import-runs))
checked out beside this repository, or its directory named in
`AGGREGA_CATALOG_DIRS`.

## Draft the example

You can run this example's import with the commands below, or
[have your AI assistant run it for you](#with-an-ai-assistant).

Write the example into a new folder named after it:

```sh
aggrega draft --example import-n8n
```

It then prints the commands to run next. The first changes into the new folder:

```sh
cd import-n8n
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
aggrega import support-agent.json --target compose
aggrega validate --release release.yaml
aggrega build --release release.yaml
```

Running what the build writes is in the walkthrough linked above.

## With an AI assistant

An AI assistant [set up with Aggrega's tools](../../../ai-assistants/set-up.md)
can do the same: paste this prompt into it.

<!-- copyable -->

> Use the Aggrega tools only, and create no folder yourself. If the Workspace folder holds no `import-n8n` folder yet, call the `draft` tool once with `example` set to `import-n8n` and no `dir`: it writes the example into a new `import-n8n` folder, whose `source` folder holds what this example imports. Then call the `import` tool with `workspace_root` set to `import-n8n/source`, `source` set to `support-agent.json` and `target` set to `compose`: it reads the answers it needs from `import-answers.yaml` beside `support-agent.json`, writes its drafts into `import-n8n/source` and pulls what they need. Then call the `validate` tool with `workspace_root` set to `import-n8n/source` and `release` set to `release.yaml`, and the `build` tool with `workspace_root` set to `import-n8n/source`, `release` set to `release.yaml` and `write` set to true. Tell me which files the build wrote; they are under `import-n8n/source/dist/`.

## Test it

With the stack running as the walkthrough runs it — the credentials stored and
the workflow active — open <http://127.0.0.1:5678> for n8n's editor, and send
the chat trigger a message with the user and password it stores, read from
`CHAT_USER` and `CHAT_PASSWORD` on curl's standard input:

```sh
printf 'user = "%s:%s"\n' "$CHAT_USER" "$CHAT_PASSWORD" | curl --config - -sS -i -X POST \
  http://127.0.0.1:5678/webhook/a3c9e1f2-4b5d-4e6f-8a7b-9c0d1e2f3a04/chat -H 'Content-Type: application/json' \
  -d '{"action": "sendMessage", "sessionId": "s1", "chatInput": "In one short sentence: what does a support plan cover?"}'
```

```text
HTTP/1.1 500 Internal Server Error
[… omitted: the response's other headers]

{"message":"Error in workflow"}
```

The run stored a placeholder for the OpenAI key, so the workflow stopped at
its call to the model, and its execution in the editor reads OpenAI's
refusal: `Incorrect API key provided: sk-place*****************-key.`

Imported with `--target helm` and applied to Kubernetes, n8n takes the same
message at the same address once the credentials are stored and the workflow
activated on the running instance, as
[the walkthrough](../../../authoring/import/n8n.md#test-it) shows, and a local
port is forwarded to its Service; the run got the same answer there:

```sh
kubectl port-forward -n <namespace> svc/n8n-default 5678:5678
```
