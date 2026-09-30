# Setup

To author with an AI assistant you need two things: the `aggrega` binary installed, and your MCP-capable client pointed at `aggrega mcp`. The binary is the only prerequisite — the MCP server runs as a subprocess of your client over stdio, reads its reference material offline, and needs no separate service, port, or account. Where someone else already runs a server for you, you need neither the binary nor any of this: see [A server reached over HTTPS](#a-server-reached-over-https).

## Install the binary

Aggrega ships as a single self-contained executable. Install it by whichever route fits your platform, then put it on your `PATH`.

- **Prebuilt binary.** Download the executable for your operating system and architecture, mark it executable, and move it onto your `PATH` (for example a directory like `/usr/local/bin` on macOS or Linux, or a directory listed in `PATH` on Windows).
- **From source.** With a Go toolchain installed, build the `aggrega` command from the source tree and place the resulting binary on your `PATH`.

Confirm the install:

```bash
aggrega version
```

A version string means the binary is found and runnable. That is everything the MCP integration needs.

## Connect an MCP client

Most MCP-capable clients launch the server the same way — they run the `aggrega` command with a single `mcp` argument and speak the protocol over the process's standard input and output. What differs between them is *where* each keeps its server list and what it calls the entries in it. The common shape:

```json
{
  "mcpServers": {
    "aggrega": {
      "command": "aggrega",
      "args": ["mcp"]
    }
  }
}
```

Once the client restarts and connects, the Aggrega authoring prompts, resources, and tools become available. See [Getting Started](getting-started.md) for what to do with them and the [`aggrega mcp`](../language-reference/cli/aggrega-mcp.md) reference for the command itself.

**Nothing in the entry selects a protocol revision.** Aggrega speaks both `2026-07-28` and `2025-06-18`, on standard input and output and over HTTPS alike, so a client of either connects and reaches the same prompts, resources, and tools. Which one a client asks for is settled on the wire rather than in your configuration.

### Where each client keeps its server list

| Client | Where the list lives | What the entry is called |
|---|---|---|
| Claude Code | `claude mcp add`, or an `.mcp.json` file in the project | `mcpServers` |
| Claude Desktop | its extension settings for a local server; its connector settings for one reached over HTTPS | see [Claude Desktop](#claude-desktop) |
| Cursor | `.cursor/mcp.json` for one workspace, or a user-scoped `mcp.json` for every workspace | `mcpServers` |
| Visual Studio Code | `mcp.json` in your user profile, or `.vscode/mcp.json` for one workspace | `servers` — see [Visual Studio Code](#visual-studio-code) |
| GitHub Copilot CLI | `copilot mcp add`, or the `mcp-config.json` file it keeps in your home directory | `mcpServers` |
| Antigravity | the `mcp_config.json` file reachable from its settings | `mcpServers` |
| Windsurf | the `mcp_config.json` file reachable from its settings | `mcpServers` |
| Cline | its MCP settings, backed by a `cline_mcp_settings.json` file | `mcpServers` |

Every client in that table except the two with a section of their own below takes the entry exactly as written above, at the path in its row. A client not listed connects the same way if it reads a server list of either shape.

### A note on `PATH`

Clients launched from a graphical environment do not always inherit the same `PATH` as your terminal. If a client reports that it cannot find the `aggrega` command, replace `"command": "aggrega"` with the absolute path to the binary (for example `"command": "/usr/local/bin/aggrega"`). Everything else stays the same.

### Visual Studio Code

Visual Studio Code keeps its servers under `servers` rather than `mcpServers`, and each entry names the transport it uses:

```json
{
  "servers": {
    "aggrega": {
      "type": "stdio",
      "command": "aggrega",
      "args": ["mcp"]
    }
  }
}
```

### Claude Desktop

Claude Desktop installs a local server from an extension package — the server together with a manifest describing it, bundled into one installable file and added from its extension settings — rather than from an entry in a configuration file. Aggrega does not currently distribute such a package.

Its connector settings accept a server reached over HTTPS, and that is the route to Claude Desktop today: see [A server reached over HTTPS](#a-server-reached-over-https).

### When a client will not take the whole tool surface

Aggrega announces its whole tool surface and leaves the client to decide how much of it to put in front of the model. Some clients cap how many tools they will register at once and drop the rest. Where that happens, `mcp.announce_tools` shortens what the server announces to the tools you name — see [Narrowing what the server announces](../language-reference/cli/aggrega-mcp.md#narrowing-what-the-server-announces).

### A server reached over HTTPS

Every entry above launches the server itself. A server someone else runs — one long-lived process on a host, serving one workspace — is reached over the network instead, and its entry names an address rather than a command:

```json
{
  "mcpServers": {
    "aggrega": {
      "url": "https://aggrega.example.com/mcp"
    }
  }
}
```

The path is always `/mcp`; the host is whatever the operator published for that deployment. Ask them for it.

**Your client obtains the token, not you.** Nothing about signing in is configured in the entry: the server answers an unauthenticated request by naming the document that says which authorization server issues its tokens, and a client that speaks the protocol's authorization flow reads that document, sends you to sign in, and attaches the token it receives to every later request. The scope names it may ask for are published in that same document. A client that does not implement the flow cannot reach a server of this kind, and nothing you add to the entry substitutes for it.

**A tool your sign-in's scopes do not reach is still in the tool list.** Calling it is refused, naming the scope that would admit it, and a client that implements the protocol's step-up answers that refusal by asking you to sign in again for that scope. A client that does not step up can still be given the write scopes: whoever runs the authorization server makes them default scopes for that client, so its first sign-in already carries them — at the cost that every sign-in through that client then carries write reach. [What a caller may reach](../language-reference/cli/aggrega-mcp.md#what-a-caller-may-reach) sets out what each scope admits, and how that setting behaves for a client that registers itself anew each time it connects.

What the deployment requires, and what its operator configures, is in the [`aggrega mcp` reference](../language-reference/cli/aggrega-mcp.md#reaching-the-server-over-https).

## Verify the connection

After the client reconnects, confirm the integration is live: the client should list the Aggrega authoring prompts (one per role, plus a per-entity template) and the authoring tools — `scaffold`, `validate`, `describe` and `get-schema` among them. Ask the assistant to scaffold a component, and it should return a skeleton carrying the fields a Component requires. If nothing appears, check that `aggrega version` runs from a terminal and that the client's `command` resolves to the binary — the `PATH` note above covers the common cause.
