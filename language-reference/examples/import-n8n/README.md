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

## Scaffold the example

Write the example into a new folder named after it:

```sh
aggrega scaffold --example import-n8n
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
