---
example:
  level: start
  products: [core/ai-agent/langflow, core/ai-model/openai]
  shows: [import, connections, credentials]
---

# Import a Langflow flow — the Basic Prompting starter project

Langflow's Basic Prompting starter project, exported as JSON, drafted into
Aggrega files by `aggrega import`, reviewed, and built for Docker Compose.

[Import a Langflow flow](../../../authoring/import/langflow.md) walks it step
by step: the command, the files it writes, what the review changes and why,
and the build. This folder holds each stage of that walkthrough:

| folder | what it holds |
|---|---|
| `source/` | the exported flow, `basic-prompting.json`, and the `.aggrega-config.yaml` that makes the folder a workspace |
| `draft/` | the files `aggrega import basic-prompting.json --target compose` wrote, unchanged, and what it printed: `stdout.txt` on standard output, `import.txt` on standard error |
| `reviewed/` | the same files after review, and the Release the review wrote: a workspace that builds |

`source/basic-prompting.json` is the starter project Langflow 1.6.0 ships,
carried unchanged from the Langflow repository
(<https://github.com/langflow-ai/langflow>, at commit
`504c02fc47e76087b82b0e7cbe4186e9cdd916d4`, the file
`src/lfx/tests/data/starter_projects_1_6_0/Basic Prompting.json`), under the
licence reproduced beside it in `LICENSE.langflow`. The drafts carry the same
flow.

In a checkout of the documentation repository, `check.sh` runs the import
again, compares what it writes and prints with `draft/`, compares the blocks
the walkthrough quotes with these files, and builds `reviewed/`. It needs the standard-library catalog
([where to get one](../../../authoring/import/README.md#how-an-import-runs))
checked out beside this repository, or its directory named in
`AGGREGA_CATALOG_DIRS`.
