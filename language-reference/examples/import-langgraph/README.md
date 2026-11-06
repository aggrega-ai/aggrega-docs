---
example:
  level: start
  products: [core/ai-agent/langgraph, core/datastore/postgres, core/ai-model/openai]
  shows: [import, connections, credentials]
---

# Import a LangGraph application — one graph and its checkpointer

The `langgraph.json` of a LangGraph application — one graph, keeping its state
in PostgreSQL — drafted into Aggrega files by `aggrega import`, reviewed, and
built for Docker Compose.

[Import a LangGraph application](../../../authoring/import/langgraph.md) walks
it step by step: the command, the files it writes, what the review changes and
why, and the build. This folder holds each stage of that walkthrough:

| folder | what it holds |
|---|---|
| `source/` | the application's `langgraph.json`, and the `.aggrega-config.yaml` that makes the folder a workspace |
| `draft/` | the files `aggrega import . --target compose` wrote, unchanged, and what it printed: `stdout.txt` on standard output, `import.txt` on standard error |
| `reviewed/` | the same files after review: a workspace that builds |

The configuration is written for this example. The application's code is not
part of it: the import never reads it, and the Release names the image it runs
in.

In a checkout of the documentation repository, `check.sh` runs the import
again, compares what it writes and prints with `draft/`, compares the blocks
the walkthrough quotes with these files, and builds `reviewed/`. It needs the standard-library catalog
([where to get one](../../../authoring/import/README.md#how-an-import-runs))
checked out beside this repository, or its directory named in
`AGGREGA_CATALOG_DIRS`.
