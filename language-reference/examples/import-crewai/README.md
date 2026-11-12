---
example:
  level: start
  tier: importers
  position: 9
  products: [core/ai-agent/crewai, core/ai-model/openai]
  shows: [import, connections, credentials]
---

# Import a CrewAI project — a crew of two agents

The agent and task declarations of a CrewAI project in the classic layout —
two agents on one OpenAI model, one task each — drafted into Aggrega files by
`aggrega import`, reviewed, and built for Docker Compose.

[Import a CrewAI project](../../../authoring/import/crewai.md) walks it step
by step: the command, the files it writes, what the review changes and why,
and the build. This folder holds each stage of that walkthrough:

| folder | what it holds |
|---|---|
| `source/` | the project's declarations, `src/support_brief/config/agents.yaml` and `tasks.yaml`, and the `.aggrega-config.yaml` that makes the folder a workspace |
| `draft/` | the files `aggrega import src/support_brief --target compose` wrote, unchanged, and what it printed: `stdout.txt` on standard output, `import.txt` on standard error |
| `reviewed/` | the same files after review: a workspace that builds |

The declarations are written for this example. The crew's program is not part
of it: the import never reads one, and the Release names the image it runs in.

In a checkout of the documentation repository, `check.sh` runs the import
again, compares what it writes and prints with `draft/`, compares the blocks
the walkthrough quotes with these files, and builds `reviewed/`. It needs the standard-library catalog
([where to get one](../../../authoring/import/README.md#how-an-import-runs))
checked out beside this repository, or its directory named in
`AGGREGA_CATALOG_DIRS`.

## Scaffold the example

Write the example into a new folder named after it, and change into it:

```sh
aggrega scaffold --example import-crewai && cd import-crewai
```

## Build

The import drafts the Aggrega files beside the project, in `source/`. It
weighs the project against the standard-library catalog, read from the
checkout `AGGREGA_CATALOG_DIRS` names
([where to get one](../../../authoring/import/README.md#how-an-import-runs)),
so set that first:

```sh
cd source
# with AGGREGA_CATALOG_DIRS naming a checkout of the standard-library catalog
aggrega import src/support_brief --target compose
```

What the review changes, and the build of the reviewed files, are in the
walkthrough linked above.
