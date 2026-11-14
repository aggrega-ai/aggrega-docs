---
example:
  level: start
  tier: importers
  position: 4
  products: [core/ai-agent/flowise, core/ai-model/openai]
  shows: [import, connections, credentials]
---

# Import a Flowise chatflow — a conversation chain with a chat model

A Flowise chatflow — a ChatOpenAI node, a Buffer Memory and a Conversation
Chain — imported by `aggrega import` into an Aggregate, a Release and a
Manifest that build for Docker Compose as written.

[Import a Flowise chatflow](../../../authoring/import/flowise.md) walks it step
by step: the command, the files it writes, the build and a run of what it
builds. This folder holds each stage of that walkthrough:

| folder | what it holds |
|---|---|
| `source/` | the chatflow, `support-chat.json`; the `.aggrega-config.yaml` that makes the folder a workspace; and `import-answers.yaml`, the answers to what no chatflow can hold: the owner account's email, and the names of the Kubernetes Secrets an import for Kubernetes asks for |
| `draft/` | the files `aggrega import support-chat.json --target compose` wrote, unchanged, and what it printed: `stdout.txt` on standard output, `import.txt` on standard error |

`source/support-chat.json` is written for this example, in the shape Flowise's
editor exports a chatflow.

In a checkout of the documentation repository, `check.sh` runs the import
again, compares what it writes and prints with `draft/`, compares the blocks
the walkthrough quotes with these files, and validates and builds what the
import wrote. It needs the standard-library catalog
([where to get one](../../../authoring/import/README.md#how-an-import-runs))
checked out beside this repository, or its directory named in
`AGGREGA_CATALOG_DIRS`.

## Scaffold the example

Write the example into a new folder named after it:

```sh
aggrega scaffold --example import-flowise
```

It then prints the commands to run next. The first changes into the new folder:

```sh
cd import-flowise
```

## Build

The import drafts the Aggrega files beside the project, in `source/`, takes the
owner account's email from `import-answers.yaml`, and pulls what the build
needs. It weighs the project against the standard-library catalog, which the
workspace's default registry publishes as a signed snapshot: the first import
fetches it, verifies it, keeps it in the workspace's content cache and names it
by its digest in the record it writes beside the drafts. A workspace that names
its own catalog folders — in `AGGREGA_CATALOG_DIRS`, or under
`workspace.catalog_dirs` — imports against those instead:

```sh
cd source
aggrega import support-chat.json --target compose
aggrega validate --release release.yaml
aggrega build --release release.yaml
```

Running what the build writes is in the walkthrough linked above.

## With an AI assistant

An AI assistant [set up with Aggrega's tools](../../../ai-assistants/set-up.md)
can do the same: paste this prompt into it.

<!-- copyable -->

> Write the Aggrega documentation's runnable example `import-flowise` into a new folder with the `scaffold` tool. Its `source` folder is a workspace: name it as the workspace root on each call that follows. Import `support-chat.json` there with the `import` tool, for the target `compose`; the import reads the answers it needs from `import-answers.yaml` beside it. Then validate the Release the import drafted, `release.yaml`, with the `validate` tool, build it with the `build` tool, writing the files into `dist/`, and tell me which files the build wrote.

## Test it

With Flowise running and the chatflow seeded as the walkthrough runs them,
open <http://127.0.0.1:3000> and sign in as the owner, and ask the chatflow a
question through its prediction endpoint:

```sh
curl -sS -X POST http://127.0.0.1:3000/api/v1/prediction/40d9f5c5-5187-54c1-a9f5-a8dac92f88bb \
  -H 'Content-Type: application/json' -d '{"question": "In one short sentence: what is Docker Compose?"}'
```

```text
{"statusCode":500,"success":false,"message":"401 Unauthorized – check your API key and ensure it has access to the requested model.","stack":{}}
```

The run's OpenAI key was a placeholder, so the answer is OpenAI's refusal of
it: the chatflow ran as far as its call to the model. The run published
Flowise on 3002, since 3000 was taken on its machine, as the walkthrough says.
