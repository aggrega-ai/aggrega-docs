---
example:
  level: start
  tier: importers
  position: 2
  products: [core/ai-tool/mcp]
  shows: [import, recipe-selection, credentials]
---

# Import an MCP client configuration — three servers a coding assistant uses

A Claude Code `.mcp.json` listing three Model Context Protocol servers — two
started from a command line and one someone else runs — drafted into Aggrega
files by `aggrega import`, each server mapped to the realization of how it
runs, and built for Kubernetes.

[Import an MCP client configuration](../../../authoring/import/mcp.md) walks
it step by step: the command, the files it writes and why each line is there,
the build, and the servers running. This folder holds each stage of that
walkthrough:

| folder or file | what it holds |
|---|---|
| `source/` | the client configuration, `.mcp.json`, the `.aggrega-config.yaml` that makes the folder a workspace, and `import-answers.yaml`, the name of the Kubernetes Secret the GitHub server's token is read from |
| `draft/` | the files `aggrega import .mcp.json --target helm` wrote, unchanged, `release.lock` included, and what it printed: `stdout.txt` on standard output, `import.txt` on standard error |

In a checkout of the documentation repository, `check.sh` runs the import
again, compares what it writes and prints with `draft/`, compares the blocks
the walkthrough quotes with these files, and validates and builds what the
import wrote. It needs the standard-library catalog
([where to get one](../../../authoring/import/README.md#how-an-import-runs))
checked out beside this repository, or its directory named in
`AGGREGA_CATALOG_DIRS`.

## Draft the example

You can run this example's import with the commands below, or
[have your AI assistant run it for you](#with-an-ai-assistant).

Write the example into a new folder named after it:

```sh
aggrega draft --example import-mcp
```

It then prints the commands to run next. The first changes into the new folder:

```sh
cd import-mcp
```

## Build

The import drafts the Aggrega files beside the project, in `source/`. It weighs
the project against the standard-library catalog, which the workspace's default
registry publishes as a signed snapshot: the first import fetches it, verifies
it, keeps it in the workspace's content cache and names it by its digest in the
record it writes beside the drafts. A workspace that names its own catalog
folders — in `AGGREGA_CATALOG_DIRS`, or under `workspace.catalog_dirs` —
imports against those instead. The import reads the Secret's name from
`import-answers.yaml`, then pulls what the drafted Release depends on, so the
build follows at once:

```sh
cd source
aggrega import .mcp.json --target helm
aggrega build --release release.yaml
```

The build writes the Kubernetes manifests under `dist/helm/`; creating the
Secret and applying them is in the walkthrough linked above.

## With an AI assistant

An AI assistant [set up with Aggrega's tools](../../../ai-assistants/set-up.md)
can do the same: paste this prompt into it.

<!-- copyable -->

> Use the Aggrega tools only, and create no folder yourself. If the Workspace folder holds no `import-mcp` folder yet, call the `draft` tool once with `example` set to `import-mcp` and no `dir`: it writes the example into a new `import-mcp` folder, whose `source` folder holds what this example imports. Then call the `import` tool with `workspace_root` set to `import-mcp/source`, `source` set to `.mcp.json` and `target` set to `helm`: it reads the answers it needs from `import-answers.yaml` beside `.mcp.json`, writes its drafts into `import-mcp/source` and pulls what they need. Then call the `validate` tool with `workspace_root` set to `import-mcp/source` and `release` set to `release.yaml`, and the `build` tool with `workspace_root` set to `import-mcp/source`, `release` set to `release.yaml` and `write` set to true. Tell me which files the build wrote; they are under `import-mcp/source/dist/`.

## Test it

With the build applied, forward a local port to the fetch server's Service and
leave the command running:

```sh
kubectl port-forward svc/fetch-default 8080:8080
```

From another terminal, ask the server to open a session with MCP's
`initialize` request:

```sh
curl -sS http://127.0.0.1:8080/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "test-it", "version": "1.0.0"}}}'
```

```text
: keepalive

: keepalive

event: message
data: {"jsonrpc":"2.0","id":1,"result":{"capabilities":{"prompts":{"listChanged":false},"resources":{"listChanged":false,"subscribe":false},"tools":{"listChanged":false}},"protocolVersion":"2025-06-18","serverInfo":{"name":"mcp-fetch","version":"2026.11.11"}}}
```

[The walkthrough](../../../authoring/import/mcp.md#test-it) makes the same call
on Docker Compose and to the GitHub server.
