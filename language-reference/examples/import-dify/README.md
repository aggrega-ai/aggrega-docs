---
example:
  level: start
  tier: importers
  position: 6
  products: [core/ai-agent/dify, core/ai-agent/dify-worker, core/ai-agent/dify-worker-beat, core/ai-agent/dify-web, core/ai-agent/dify-sandbox, core/ai-agent/dify-plugin-daemon, core/ai-agent/dify-ssrf-proxy, core/datastore/postgres, core/datastore/redis, core/datastore/weaviate]
  shows: [import, modules, boundaries, recipe-selection, credentials]
---

# Import a Dify application — a chat assistant in the Dify installation

A Dify chat application, exported in Dify's DSL, imported by `aggrega import`
into an Aggregate, a Release and a Manifest that build the standard library's
Dify installation, carrying it, for Kubernetes as written.

[Import a Dify application](../../../authoring/import/dify.md) walks it step
by step: the command, the files it writes, the build and a run of what it
builds. This folder holds each stage of that walkthrough:

| folder | what it holds |
|---|---|
| `source/` | the application, `support-assistant.yml`; the `.aggrega-config.yaml` that makes the folder a workspace; and `import-answers.yaml`, the answers to what no application can hold: the names of the Kubernetes Secrets holding the installation's application secret and the owner's password, and the owner account's email |
| `draft/` | the files `aggrega import support-assistant.yml --target helm` wrote, unchanged, and what it printed: `stdout.txt` on standard output, `import.txt` on standard error |

`source/support-assistant.yml` is written for this example, in the shape Dify
exports an application at DSL version `0.7.0`.

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
aggrega scaffold --example import-dify
```

It then prints the commands to run next. The first changes into the new folder:

```sh
cd import-dify
```

## Build

The import drafts the Aggrega files beside the project, in `source/`, takes
what no application can hold from `import-answers.yaml`, and pulls what the
build needs. It weighs the project against the standard-library catalog, which
the workspace's default registry publishes as a signed snapshot: the first
import fetches it, verifies it, keeps it in the workspace's content cache and
names it by its digest in the record it writes beside the drafts. A workspace
that names its own catalog folders — in `AGGREGA_CATALOG_DIRS`, or under
`workspace.catalog_dirs` — imports against those instead:

```sh
cd source
aggrega import support-assistant.yml --target helm
aggrega validate --release release.yaml
aggrega build --release release.yaml
```

Creating the Secrets the build's manifests read, and running them, are in the
walkthrough linked above.

## With an AI assistant

An AI assistant [set up with Aggrega's tools](../../../ai-assistants/set-up.md)
can do the same: paste this prompt into it.

<!-- copyable -->

> Write the Aggrega documentation's runnable example `import-dify` into a new folder with the `scaffold` tool. Its `source` folder is a workspace: name it as the workspace root on each call that follows. Import `support-assistant.yml` there with the `import` tool, for the target `helm`; the import reads the answers it needs from `import-answers.yaml` beside it. Then validate the Release the import drafted, `release.yaml`, with the `validate` tool, build it with the `build` tool, writing the files into `dist/`, and tell me which files the build wrote.

## Test it

Imported with `--target compose` and started as the walkthrough's
[On Docker Compose](../../../authoring/import/dify.md#on-docker-compose) shows,
the installation answers on this machine: the API at `http://127.0.0.1:5001`
and the console at <http://127.0.0.1:3001/signin>. The application answers a
message sent with its own key, which
[the walkthrough](../../../authoring/import/dify.md#test-it) creates after
signing in and setting the OpenAI provider's key:

```sh
curl -sS http://127.0.0.1:5001/v1/chat-messages \
  -H 'Authorization: Bearer <app key>' -H 'Content-Type: application/json' \
  -d '{"inputs": {}, "query": "In one short sentence: what does a support plan cover?", "response_mode": "blocking", "user": "test-it"}'
```

The run's provider key was a placeholder, which Dify refused with OpenAI's
`Incorrect API key provided` when it was set, so the message got:

```text
{"code":"provider_not_initialize","message":"Model gpt-4o-mini credentials is not initialized.","status":400}
```
