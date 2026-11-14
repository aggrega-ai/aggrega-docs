---
example:
  level: start
  tier: importers
  position: 8
  products: [core/ai-agent/langgraph, core/datastore/postgres, core/ai-model/openai]
  shows: [import, connections, credentials]
---

# Import a LangGraph application — one graph and its checkpointer

The `langgraph.json` of a LangGraph application — one graph, keeping its state
in PostgreSQL — drafted into Aggrega files by `aggrega import`, with the model
the graph calls and the application's image answered once in an answers file,
and built for Docker Compose.

[Import a LangGraph application](../../../authoring/import/langgraph.md) walks
it step by step: the command, what it asks for, the files it writes and why
each line is there, the build, and the graph running. This folder holds each
stage of that walkthrough:

| folder or file | what it holds |
|---|---|
| `source/` | the application's `langgraph.json`, the `.aggrega-config.yaml` that makes the folder a workspace, and `import-answers.yaml`, the values no configuration holds: the model, the application's image, and the names of the Kubernetes Secrets a build for Kubernetes reads the key and the database's password from |
| `draft/` | the files `aggrega import . --target compose` wrote, unchanged, `release.lock` included, and what it printed: `stdout.txt` on standard output, `import.txt` on standard error |

The configuration is written for this example. The application's code is not
part of it: the import never reads it, and the Release names the image it runs
in.

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
aggrega scaffold --example import-langgraph
```

It then prints the commands to run next. The first changes into the new folder:

```sh
cd import-langgraph
```

## Build

The import drafts the Aggrega files beside the project, in `source/`. It weighs
the project against the standard-library catalog, which the workspace's default
registry publishes as a signed snapshot: the first import fetches it, verifies
it, keeps it in the workspace's content cache and names it by its digest in the
record it writes beside the drafts. A workspace that names its own catalog
folders — in `AGGREGA_CATALOG_DIRS`, or under `workspace.catalog_dirs` —
imports against those instead. The import reads the model and the image from
`import-answers.yaml`, then pulls what the drafted Release depends on, so the
build follows at once:

```sh
cd source
aggrega import . --target compose
aggrega build --release release.yaml
```

The image the example names stands for one you build from your project;
building it and running the stack are in the walkthrough linked above.

## With an AI assistant

An AI assistant [set up with Aggrega's tools](../../../ai-assistants/set-up.md)
can do the same: paste this prompt into it.

<!-- copyable -->

> Write the Aggrega documentation's runnable example `import-langgraph` into a new folder with the `scaffold` tool. Its `source` folder is a workspace: name it as the workspace root on each call that follows. Import that folder itself, `.`, with the `import` tool, for the target `compose`; the import reads the answers it needs from `import-answers.yaml` beside `langgraph.json`. Then validate the Release the import drafted, `release.yaml`, with the `validate` tool, build it with the `build` tool, writing the files into `dist/`, and tell me which files the build wrote.

## Test it

With the stack running as the walkthrough runs it, one request reaches the
graph. The route below is the walkthrough's own program's, a small HTTP server
on port 8000; your own program decides its own. The services publish no port,
so the request comes from a container on the stack's network:

```sh
docker run --rm --network order-support_compose curlimages/curl:8.11.1 -sS -X POST \
  http://support:8000/threads/order-1234/runs -H 'Content-Type: application/json' \
  -d '{"message": "Where is my order 1234? It has not arrived yet."}'
```

```text
{
  "thread": "order-1234",
  "error": "the run failed: OpenAIAuthenticationError: Error code: 401 - Incorrect API key provided: sk-place************-key. [… omitted: where to find an API key]"
}
```

The run's key was a placeholder, so the answer is OpenAI's refusal of it. On
Kubernetes, forward a local port to the Deployment, which has no Service, and
send the same request to it from another terminal:

```sh
kubectl port-forward deploy/support 8000:8000
```

```sh
curl -sS -X POST http://127.0.0.1:8000/threads/order-1234/runs -H 'Content-Type: application/json' \
  -d '{"message": "Where is my order 1234? It has not arrived yet."}'
```

The answer is the same.
