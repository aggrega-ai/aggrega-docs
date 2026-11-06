---
example:
  level: start
  products: [core/ai-agent/google-adk, core/ai-model/gemini]
  shows: [import, connections, credentials]
---

# Import a Google ADK agent — one agent on Gemini

The Agent Config of an application built on Google's Agent Development Kit —
one agent on Gemini, with the Google Search tool ADK ships — drafted into
Aggrega files by `aggrega import`, reviewed, and built for Docker Compose.

[Import a Google ADK agent](../../../authoring/import/google-adk.md) walks it
step by step: the command, the files it writes, what the review changes and
why, and the build. This folder holds each stage of that walkthrough:

| folder | what it holds |
|---|---|
| `source/` | the agent's configuration, `support_agent/root_agent.yaml`, and the `.aggrega-config.yaml` that makes the folder a workspace |
| `draft/` | the files `aggrega import support_agent --target compose` wrote, unchanged, and what it printed: `stdout.txt` on standard output, `import.txt` on standard error |
| `reviewed/` | the same files after review: a workspace that builds |

The configuration is written for this example. The application's code and the
environment file ADK's scaffold writes are not part of it: the import never
reads either, and the Release names the image the application runs in.

In a checkout of the documentation repository, `check.sh` runs the import
again, compares what it writes and prints with `draft/`, compares the blocks
the walkthrough quotes with these files, and builds `reviewed/`. It needs the standard-library catalog
([where to get one](../../../authoring/import/README.md#how-an-import-runs))
checked out beside this repository, or its directory named in
`AGGREGA_CATALOG_DIRS`.
