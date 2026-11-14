# Editors, assistants and other frontends

Aggrega is used from more than one place: a terminal, the Visual Studio Code extension, an AI assistant connected through the Model Context Protocol (MCP), and any program that drives the `aggrega` binary. None of these frontends carries a compiler of its own. Each one runs the `aggrega` binary, or reaches one already running, and asks it, so parsing YAML, resolving the catalog and building the graph happen in one place, and what a frontend shows is what that binary compiled. A frontend reimplements none of it, so there is no second copy to drift from the first.

This chapter describes the contract those frontends share, and what each one asks the binary for.

## The IR graph is the public contract

Compiling a Release, with the Aggregate and the Manifest it names, produces an Intermediate Representation (IR) graph: every node, with the component it instantiates, the version that component resolved to, the boundary and subsystem it sits in and the file that declared it; every connection between nodes; the Features attached to each; and the values mapped onto them, with where each came from. It is the snapshot of what the compiler is about to render into artifacts.

The graph's shape is published as a JSON Schema, `https://aggrega.ai/schemas/ir-v1beta1.schema.json`, and the [IR schema reference](../language-reference/schema/other/ir.md) describes every field. A frontend reads the graph against that schema, not against the compiler's internals, so the schema is the one place the shape evolves, and a frontend written in any language tracks it the same way.

Values an author declared sensitive are withheld from the graph wherever it is handed out. A frontend that needs them in the clear asks for them explicitly, and whatever the answer then reaches carries them in the clear.

## Three ways to ask for the graph

The same graph is available on every surface, and each answer is one complete graph document:

- **From the command line.** `aggrega build`, `aggrega inspect` given a Release, and `aggrega validate --release` each accept `--ir-graph`, which writes the graph that run computed to standard output as JSON, in addition to everything the command already produces. `--unredacted` beside it prints the sensitive values. See [`aggrega inspect`](../language-reference/cli/aggrega-inspect.md#machine-readable-output).
- **From the daemon.** An `aggrega/irGraph` request to `aggrega serve`, naming the Release by its path relative to the workspace root, answers with the same document under `graph`; `unredacted: true` asks for the sensitive values. See [`aggrega serve`](../language-reference/cli/aggrega-serve.md).
- **From an AI assistant.** The MCP server's `cli-inspect`, `cli-build` and `cli-validate` tools take the command's flag as their `ir_graph` argument. See [`aggrega mcp`](../language-reference/cli/aggrega-mcp.md).

Each answer describes the Release as it stood when the question was asked. A frontend that follows edits asks again: the Visual Studio Code extension redraws its graph each time a document is saved.

## The Visual Studio Code extension

The [Aggrega extension for Visual Studio Code](../authoring/editor/README.md) starts `aggrega serve` and keeps it running for the workspace. Every answer it shows comes from the `aggrega` binary: most from that daemon — diagnostics as you edit, hover, completion, go to definition, find references, build and preview build among them — and the rest from running the binary's own commands.

Its topology graph is the IR graph. The extension sends `aggrega/irGraph` for the selected Release and draws the answer: boundaries and subsystems as nested containers, components as nodes, connections as edges, and, on a selected node or connection, the Features attached to it. The compiler sends topology and never coordinates; the layout is computed in the editor. Attaching a Feature from the graph goes back through the daemon too: the compiler names the document and the place inside it where the attachment belongs, and the extension writes it there. See [the topology graph](../authoring/editor/topology-graph.md) for what the view shows and does.

## The MCP server

`aggrega mcp` runs the binary as a Model Context Protocol server, so an AI assistant discovers Aggrega's operations and calls them rather than reading command output. Over standard input and output it speaks newline-delimited JSON-RPC 2.0, which is how a client that starts it as a subprocess reaches it; over HTTP it serves one endpoint, `/mcp`, for callers on other machines. Its tools are the compiler's operations — reading schemas, describing the workspace, validating, building, drafting and editing documents — and each call is answered by the same binary the command line runs.

[Connect the MCP server](../ai-assistants/mcp-server.md) covers connecting each client, and [What your assistant can do with Aggrega](../ai-assistants/what-it-can-do.md) covers what the tools offer.

## The `aggrega serve` daemon

`aggrega serve` runs the compiler as a long-running process for editors. It holds the parsed documents, the resolved catalog and the diagnostics across requests, so an editor asks many small questions without paying for a full catalog load each time.

The protocol is JSON-RPC 2.0 over standard input and output, each message preceded by a `Content-Length` header, with methods under the `aggrega/` namespace. It is not the Language Server Protocol, because it carries operations that protocol has no place for, such as the IR graph request; an editor extension translates between its editor's requests and these methods, and reuses the protocol's position, range and location shapes where they fit. A session opens with `aggrega/initialize`, which reports the workspace and the version of the binary answering; the daemon pushes diagnostics with `aggrega/publishDiagnostics`; and the `aggrega/shutdown` notification ends it cleanly.

Every message body is published as a schema, `https://aggrega.ai/schemas/serve-wire-v1beta1.schema.json`, described in the [wire-shape reference](../language-reference/schema/other/serve-wire.md); the Visual Studio Code extension takes its message types from it. Another editor integrates by speaking the same protocol. The [`aggrega serve` reference](../language-reference/cli/aggrega-serve.md) describes each method, what it reads and writes, and the errors it raises.
