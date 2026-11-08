---
example:
  level: start
  products: [core/ai-agent/agent-framework, core/ai-model/openai]
  shows: [import, connections, credentials, recipe-selection]
---

# Import a Microsoft Agent Framework declarative agent — an agent and an MCP server

A declarative agent of Microsoft Agent Framework — one agent on an OpenAI
model, searching documentation through an MCP server — drafted into Aggrega
files by `aggrega import`, reviewed, and built for Docker Compose.

[Import a Microsoft Agent Framework declarative agent](../../../authoring/import/agent-framework.md)
walks it step by step: the command, the files it writes, what the review
changes and why, and the build. This folder holds each stage of that
walkthrough:

| folder | what it holds |
|---|---|
| `source/` | the declarative agent, `support-agent.yaml`, and the `.aggrega-config.yaml` that makes the folder a workspace |
| `draft/` | the files `aggrega import support-agent.yaml --target compose` wrote, unchanged, and what it printed: `stdout.txt` on standard output, `import.txt` on standard error |
| `reviewed/` | the same files after review: a workspace that builds |

The declarative agent is written for this example. The application's code,
which loads it, is not part of it: the import never reads it, and the Release
names the image the application runs in.

In a checkout of the documentation repository, `check.sh` runs the import
again, compares what it writes and prints with `draft/`, compares the blocks
the walkthrough quotes with these files, and builds `reviewed/`. It needs the standard-library catalog
([where to get one](../../../authoring/import/README.md#how-an-import-runs))
checked out beside this repository, or its directory named in
`AGGREGA_CATALOG_DIRS`.
