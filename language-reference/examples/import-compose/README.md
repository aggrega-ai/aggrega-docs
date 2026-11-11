---
example:
  level: start
  tier: importers
  position: 1
  products: [core/datastore/postgres, core/datastore/redis]
  shows: [import, connections, credentials]
---

# Import a Compose project — a notes API with PostgreSQL and Redis

A Compose file running an API, the PostgreSQL database it keeps its notes in
and a Redis cache, drafted into Aggrega files by `aggrega import`, reviewed,
and built for Docker Compose.

[Import a Compose project](../../../authoring/import/compose.md) walks it step
by step: the command, the files it writes, what the review changes and why,
and the build. This folder holds each stage of that walkthrough:

| folder | what it holds |
|---|---|
| `source/` | the Compose project, `compose.yaml`, and the `.aggrega-config.yaml` that makes the folder a workspace |
| `draft/` | the files `aggrega import compose.yaml --target compose` wrote, unchanged, and what it printed: `stdout.txt` on standard output, `import.txt` on standard error |
| `reviewed/` | the same files after review: a workspace that builds |

In a checkout of the documentation repository, `check.sh` runs the import
again, compares what it writes and prints with `draft/`, compares the blocks
the walkthrough quotes with these files, and builds `reviewed/`. It needs the standard-library catalog
([where to get one](../../../authoring/import/README.md#how-an-import-runs))
checked out beside this repository, or its directory named in
`AGGREGA_CATALOG_DIRS`.

## Scaffold the example

Write the example into a new folder named after it, and change into it:

```sh
aggrega scaffold --example import-compose && cd import-compose
```

## Build

The import drafts the Aggrega files beside the project, in `source/`:

```sh
cd source
aggrega import compose.yaml --target compose
```

What the review changes, and the build of the reviewed files, are in the
walkthrough linked above.
