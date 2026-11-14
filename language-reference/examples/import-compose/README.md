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
and a Redis cache, drafted into Aggrega files by `aggrega import` — the
connections, the database's settings, the password as a variable reference and
each image's tag carried over — and built for Docker Compose.

[Import a Compose project](../../../authoring/import/compose.md) walks it step
by step: the command, the files it writes and why each line is there, the
build, and the stack running. This folder holds each stage of that walkthrough:

| folder or file | what it holds |
|---|---|
| `source/` | the Compose project, `compose.yaml`, the `.aggrega-config.yaml` that makes the folder a workspace, and `import-answers.yaml`, the one value a build for Kubernetes needs that no Compose file holds |
| `draft/` | the files `aggrega import compose.yaml --target compose` wrote, unchanged, `release.lock` included, and what it printed: `stdout.txt` on standard output, `import.txt` on standard error |

In a checkout of the documentation repository, `check.sh` runs the import
again, compares what it writes and prints with `draft/`, compares the blocks
the walkthrough quotes with these files, and validates and builds what the
import wrote. It needs the standard-library catalog
([where to get one](../../../authoring/import/README.md#how-an-import-runs))
checked out beside this repository, or its directory named in
`AGGREGA_CATALOG_DIRS`.

## Scaffold the example

You can run this example's import with the commands below, or
[have your AI assistant run it for you](#with-an-ai-assistant).

Write the example into a new folder named after it:

```sh
aggrega scaffold --example import-compose
```

It then prints the commands to run next. The first changes into the new folder:

```sh
cd import-compose
```

## Build

The import drafts the Aggrega files beside the project, in `source/`. It weighs
the project against the standard-library catalog, which the workspace's default
registry publishes as a signed snapshot: the first import fetches it, verifies
it, keeps it in the workspace's content cache and names it by its digest in the
record it writes beside the drafts. A workspace that names its own catalog
folders — in `AGGREGA_CATALOG_DIRS`, or under `workspace.catalog_dirs` —
imports against those instead. The import then pulls what the drafted Release
depends on, so the build follows at once:

```sh
cd source
aggrega import compose.yaml --target compose
aggrega build --release release.yaml
```

The build writes `dist/compose/docker-compose.yaml`; running it is in the
walkthrough linked above.

## With an AI assistant

An AI assistant [set up with Aggrega's tools](../../../ai-assistants/set-up.md)
can do the same: paste this prompt into it.

<!-- copyable -->

> Write the Aggrega documentation's runnable example `import-compose` into a new folder with the `scaffold` tool. Its `source` folder is a workspace: name it as the workspace root on each call that follows. Import `compose.yaml` there with the `import` tool, for the target `compose`; the import reads the answers it needs from `import-answers.yaml` beside it. Then validate the Release the import drafted, `release.yaml`, with the `validate` tool, build it with the `build` tool, writing the files into `dist/`, and tell me which files the build wrote.

## Test it

With the stack running as the walkthrough runs it, with an image answering
HTTP on port 8080 named for the API, ask the API at the port the Release
publishes:

```sh
curl -sS http://127.0.0.1:8080/notes
```

The walkthrough's stand-in answers with a description of the request it
received:

```text
{
  "path": "/notes",
  "headers": {
    "host": "127.0.0.1:8080",
    [… omitted: the user agent and the media types the client sent]
  },
  "method": "GET",
  [… omitted: the rest of the request as the stand-in received it, the client's address and the container's host name]
}
```
