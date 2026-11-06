---
example:
  level: start
  products: [core/ai-agent/n8n, core/ai-model/openai]
  shows: [import, connections, credentials]
---

# Import an n8n workflow — an AI agent answering chat messages

An n8n workflow — a chat trigger, an AI Agent, an OpenAI Chat Model and a
Simple Memory — drafted into Aggrega files by `aggrega import`, reviewed, and
built for Docker Compose.

[Import an n8n workflow](../../../authoring/import/n8n.md) walks it step by
step: the command, the files it writes, what the review changes and why, and
the build. This folder holds each stage of that walkthrough:

| folder | what it holds |
|---|---|
| `source/` | the workflow, `support-agent.json`, and the `.aggrega-config.yaml` that makes the folder a workspace |
| `draft/` | the files `aggrega import support-agent.json --target compose` wrote, unchanged, and what it printed: `stdout.txt` on standard output, `import.txt` on standard error |
| `reviewed/` | the same files after review, and the Release the review wrote: a workspace that builds |

`source/support-agent.json` is written for this example, in the shape n8n
exports a workflow.

In a checkout of the documentation repository, `check.sh` runs the import
again, compares what it writes and prints with `draft/`, compares the blocks
the walkthrough quotes with these files, and builds `reviewed/`. It needs the standard-library catalog
([where to get one](../../../authoring/import/README.md#how-an-import-runs))
checked out beside this repository, or its directory named in
`AGGREGA_CATALOG_DIRS`.
