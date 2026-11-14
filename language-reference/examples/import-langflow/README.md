---
example:
  level: start
  tier: importers
  position: 5
  products: [core/ai-agent/langflow, core/ai-model/openai]
  shows: [import, connections, credentials]
---

# Import a Langflow flow — the Basic Prompting starter project

Langflow's Basic Prompting starter project, exported as JSON, imported by
`aggrega import` into an Aggregate, a Release and a Manifest that build for
Docker Compose as written.

[Import a Langflow flow](../../../authoring/import/langflow.md) walks it step
by step: the command, the files it writes, the build and a run of what it
builds. This folder holds each stage of that walkthrough:

| folder | what it holds |
|---|---|
| `source/` | the exported flow, `basic-prompting.json`; the `.aggrega-config.yaml` that makes the folder a workspace; and `import-answers.yaml`, the answers to what no flow can hold, which an import for Kubernetes asks for |
| `draft/` | the files `aggrega import basic-prompting.json --target compose` wrote, unchanged, and what it printed: `stdout.txt` on standard output, `import.txt` on standard error |

`source/basic-prompting.json` is the starter project Langflow 1.6.0 ships,
carried unchanged from the Langflow repository
(<https://github.com/langflow-ai/langflow>, at commit
`504c02fc47e76087b82b0e7cbe4186e9cdd916d4`, the file
`src/lfx/tests/data/starter_projects_1_6_0/Basic Prompting.json`), under the
licence reproduced beside it in `LICENSE.langflow`. The drafts carry the same
flow, its edges' handles written as Langflow's editor writes them.

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
aggrega scaffold --example import-langflow
```

It then prints the commands to run next. The first changes into the new folder:

```sh
cd import-langflow
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
aggrega import basic-prompting.json --target compose
aggrega validate --release release.yaml
aggrega build --release release.yaml
```

Running what the build writes is in the walkthrough linked above.
