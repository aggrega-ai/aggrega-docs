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

Every MCP-capable client launches the server the same way — it runs the `aggrega` command with a single `mcp` argument and speaks the protocol over the process's stdin and stdout. The configuration differs only in *where* each client keeps its server list. In every case the entry has the same shape:

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

### A note on `PATH`

Desktop clients launched from a graphical environment do not always inherit the same `PATH` as your terminal. If a client reports that it cannot find the `aggrega` command, replace `"command": "aggrega"` with the absolute path to the binary (for example `"command": "/usr/local/bin/aggrega"`). Everything else stays the same.

### Claude Desktop

Claude Desktop reads its server list from `claude_desktop_config.json` (reachable from the app's developer settings). Add the `aggrega` entry under `mcpServers`:

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

Restart Claude Desktop; the Aggrega prompts appear in the prompt picker and the tools become available to the assistant.

### Cursor

Cursor reads MCP servers from an `mcp.json` file — a project-scoped `.cursor/mcp.json` for one workspace, or a user-scoped file for every workspace. Use the same shape:

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

### Windsurf

Windsurf keeps its MCP configuration in an `mcp_config.json` file reachable from its settings. Add the `aggrega` server under `mcpServers`:

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

### Cline

Cline manages its servers through its MCP settings, backed by a `cline_mcp_settings.json` file. Add the same entry:

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

What the deployment requires, and what its operator configures, is in the [`aggrega mcp` reference](../language-reference/cli/aggrega-mcp.md#reaching-the-server-over-https).

## Verify the connection

After the client reconnects, confirm the integration is live: the client should list the Aggrega authoring prompts (one per role, plus a per-entity template) and the authoring tools — `scaffold`, `validate`, `describe` and `get-schema` among them. Ask the assistant to scaffold a component, and it should return a schema-correct skeleton. If nothing appears, check that `aggrega version` runs from a terminal and that the client's `command` resolves to the binary — the `PATH` note above covers the common cause.
