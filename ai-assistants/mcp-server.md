# Connect the MCP server

Aggrega's MCP server is the `aggrega mcp` command, and the `aggrega` binary is its only prerequisite: [Install the binary](../install.md#install-the-binary) installs it with one command. The server runs as a subprocess of your client over stdio, reads its schemas from the binary and its documentation pages from a copy it fetches once into your machine's cache, and needs no separate service, port, or account. Where someone else already runs a server for you, you need neither the binary nor any of this: see [A server reached over HTTPS](#a-server-reached-over-https).

## Clients that add it with one command

In Claude Code:

```bash
claude mcp add --transport stdio aggrega -- aggrega mcp
```

In Codex:

```bash
codex mcp add aggrega -- aggrega mcp
```

In Gemini CLI:

```bash
gemini mcp add aggrega aggrega mcp
```

## Every other client

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

Once the client restarts and connects, the Aggrega authoring prompts, resources, and tools become available. [What your assistant can do with Aggrega](what-it-can-do.md) describes them, [Authoring Aggrega files](../authoring/getting-started.md) shows what to do with them, and the [`aggrega mcp`](../language-reference/cli/aggrega-mcp.md) reference covers the command itself.

**Nothing in the entry selects a protocol revision.** Aggrega speaks both `2026-07-28` and `2025-06-18`, on standard input and output and over HTTPS alike, so a client of either connects and reaches the same prompts, resources, and tools. Which one a client asks for is settled on the wire rather than in your configuration.

**An assistant that can run commands can do all of this itself** — install the binary, add the Aggrega skill, and connect to the server — from one prompt you paste into it: see [Set up Aggrega with your AI assistant](set-up.md).

## Where each client keeps its server list

| Client | Where the list lives | What the entry is called |
|---|---|---|
| Claude Code | `claude mcp add`, or an `.mcp.json` file in the project | `mcpServers` |
| Claude Desktop | its extension settings for a local server; its connector settings for one reached over HTTPS | see [Claude Desktop](#claude-desktop) |
| Cursor | `.cursor/mcp.json` for one workspace, or a user-scoped `mcp.json` for every workspace | `mcpServers` |
| Gemini CLI | `gemini mcp add`, or `~/.gemini/settings.json` for every project and `.gemini/settings.json` for one | `mcpServers` |
| Codex CLI | `codex mcp add`, or `~/.codex/config.toml` for every project and `.codex/config.toml` for one trusted project | a `[mcp_servers.aggrega]` table — see [Codex CLI](#codex-cli) |
| Zed | Settings → AI → MCP Servers, which writes the entry into Zed's settings file | `context_servers` — see [Zed](#zed) |
| Visual Studio Code | `mcp.json` in your user profile, or `.vscode/mcp.json` for one workspace | `servers` — see [Visual Studio Code](#visual-studio-code) |
| GitHub Copilot CLI | `copilot mcp add`, or the `mcp-config.json` file it keeps in your home directory | `mcpServers` |
| Antigravity | the `mcp_config.json` file reachable from its settings | `mcpServers` |
| Windsurf | the `mcp_config.json` file reachable from its settings | `mcpServers` |
| Cline | its MCP settings, backed by a `cline_mcp_settings.json` file | `mcpServers` |

Every client in that table except the four with a section of their own below takes the entry exactly as written above, at the path in its row. A client not listed connects the same way if it reads a server list of one of these shapes.

## A note on `PATH`

Clients launched from a graphical environment do not always inherit the same `PATH` as your terminal. If a client reports that it cannot find the `aggrega` command, replace `"command": "aggrega"` with the absolute path to the binary (for example `"command": "/home/you/.local/bin/aggrega"`, the install location on Linux for a user named `you`). Everything else stays the same.

## Visual Studio Code

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

## Codex CLI

Codex keeps its servers in TOML rather than JSON — in `~/.codex/config.toml` for every project, or in `.codex/config.toml` for one project Codex trusts — each as a table named after the server:

```toml
[mcp_servers.aggrega]
command = "aggrega"
args = ["mcp"]
```

`codex mcp add aggrega -- aggrega mcp`, the command [above](#clients-that-add-it-with-one-command), writes the same table for you. The Codex IDE extension and the ChatGPT desktop app read the same file, so the one entry serves all three.

## Zed

Zed keeps its servers under `context_servers` in its settings file. Add the server from **Settings → AI → MCP Servers** — **Add Server**, then **Add Local Server** — which writes the entry into that file, or run `zed: open settings file` from the command palette and add the entry yourself:

```json
{
  "context_servers": {
    "aggrega": {
      "command": "aggrega",
      "args": ["mcp"]
    }
  }
}
```

Zed supports the protocol's tools and prompts, so its agent reaches Aggrega's tools and authoring prompts but not the resources the server also offers.

## Claude Desktop

Claude Desktop installs a local server from an extension package — the server together with a manifest describing it, bundled into one installable file and added from its extension settings — rather than from an entry in a configuration file. Each Aggrega release carries such a package, `aggrega-<version>.mcpb`, beside its prebuilt binaries.

Aggrega's package carries no program of its own. It launches an `aggrega` executable already installed on your machine, with the single `mcp` argument, and speaks the protocol over that process's standard input and output — the same server every entry above starts. Unless you choose another executable, it hands Claude Desktop the command name `aggrega`, as every entry above does, so the application looks `aggrega` up on the `PATH` it was started with; and it hands that server the workspace you choose. To add it:

1. Install the `aggrega` binary, as described in [Install the binary](../install.md#install-the-binary). The install command and the manual steps there both keep it in a folder of your own — on Windows `%LOCALAPPDATA%\Programs\aggrega` rather than a system folder such as `C:\Windows\System32` — so that you can replace it without administrator rights.
2. Install `aggrega-<version>.mcpb` from Claude Desktop's extension settings.
3. Set the package's settings; neither is required. **Path to the aggrega executable** is the program the package launches, and its default is the command name `aggrega`, which the application looks up on the `PATH` it was started with. A folder added to your `PATH` while the application runs — as the Windows installer and the install command on Windows add theirs — reaches it only once it has quit and started again, as in step 4, and an application started from a graphical environment may not see the same `PATH` as your terminal (see [A note on `PATH`](#a-note-on-path)). Leave the default when `aggrega` on that `PATH` is the executable you want. Set the field to the full path of an executable instead when the one you want is not on that `PATH`, or is a different `aggrega` from the first one found there — on macOS and Linux, for the install location, the `aggrega` in `.local/bin` in your home folder, such as `/Users/you/.local/bin/aggrega`; on Windows the full path ending in `aggrega.exe`, such as `C:\Users\you\AppData\Local\Programs\aggrega\aggrega.exe`. To go back to the default, set the field to `aggrega` rather than emptying it. Where no `aggrega` is installed at all, install it as step 1 describes. **Workspace folder** is the folder of the Aggrega workspace the assistant works in: the folder that holds your project's `.aggrega-config.yaml`. Set this one: it is empty until you choose a folder, and while it is empty the package hands the server an empty `AGGREGA_WORKSPACE_ROOT`, so the server answers every request the assistant makes in the workspace with a refusal saying the **Workspace folder** setting is empty and telling you to set it to the folder that holds your workspace's `.aggrega-config.yaml`, rather than working in the folder Claude Desktop started it in.
4. Quit Claude Desktop fully, then start it again. A server the application has already started keeps running, and renaming the executable does not stop it, so a changed setting takes effect only once the application has quit and started again. On Windows, Task Manager shows whether an `aggrega` process is still running.

**The workspace folder is where every request that names no workspace of its own is answered.** Claude Desktop starts the server in a folder of its own choosing rather than in your project, so the package passes the folder you chose to the server as the `AGGREGA_WORKSPACE_ROOT` variable in its environment, rather than as an argument on the command line the application composes. The server takes that folder as the workspace root itself, as `--workspace-root` is taken on every command: it does not look above it for an enclosing workspace, so choose the folder that holds `.aggrega-config.yaml` rather than one inside it. To work in another workspace, change the setting and restart the application as in step 4.

Because the package names no executable of any platform, the same file applies to every platform it declares: macOS, Windows and Linux.

**The server reports which `aggrega` the package launched.** Claude Desktop's extension settings list the package's own version — the version of the release it came from — and not the version of the executable it launches. The two are installed separately, so they can come from different releases. The package hands the server its own version as the `AGGREGA_BUNDLE_VERSION` variable in its environment, and the server reports both: the answer of `describe-capabilities` called with no arguments — the tool an assistant calls to learn what the server offers — opens with a line naming the executable's version and the package's, and carries the same line as `version_summary` in its structured part, so an assistant asked which version of Aggrega is running can read both there, whichever part of the answer the application hands it. Where the two come from different releases, that line says so, naming both, and the guidance the server hands the assistant when it connects opens with the same sentence. Nothing refuses on a difference, and the server answers every request as usual; it is reported so that you know which executable the package is running. To bring the two together, install the `aggrega-<version>.mcpb` of the release your executable comes from — `aggrega version` at a terminal prints that version — or set **Path to the aggrega executable** to the full path of an `aggrega` of the package's release, then restart the application as in step 4.

**Claude Desktop's own logs show what it launched.** On Windows they can sit under a package folder in the local application-data directory rather than under `%APPDATA%\Claude\logs`, even where Claude Desktop was installed from its own download: under `%LOCALAPPDATA%\Packages\`, in the folder whose name begins with `Claude_`, at `LocalCache\Local\Claude\logs`. The files there include `mcp.log` and `mcp-server-Aggrega.log`, the second carrying what the Aggrega server writes to its standard error. A line carrying `Using MCP server command:` names the command the application started, taken from the package's **Path to the aggrega executable** setting. When the setting names a path where nothing is, the log carries the Windows command interpreter's message that the path is not recognized as a command, then reports that the server could not start. When the workspace folder is not there — renamed, moved, or never created — the server starts all the same and answers every request the assistant makes in that workspace with its refusal, so the assistant receives the refusal as the answer to its request rather than the application reporting a failure to connect. It names `AGGREGA_WORKSPACE_ROOT` as the variable the package's **Workspace folder** setting sets, and quotes the folder exactly as the application passed it; `mcp-server-Aggrega.log` carries the same refusal. A **Workspace folder** left empty is answered the same way, with the refusal of step 3 naming the empty setting, which the log carries too. Correct the setting and restart the application as in step 4.

Claude Desktop's connector settings are the other route, for a server reached over HTTPS: see [A server reached over HTTPS](#a-server-reached-over-https).

## When a client will not take the whole tool surface

Aggrega announces its whole tool surface and leaves the client to decide how much of it to put in front of the model. Some clients cap how many tools they will register at once and drop the rest. Where that happens, `mcp.announce_tools` shortens what the server announces to the tools you name — see [Narrowing what the server announces](../language-reference/cli/aggrega-mcp.md#narrowing-what-the-server-announces).

## A server reached over HTTPS

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

The path is always `/mcp`; the host is whatever the operator published for that server. Ask them for it. Gemini CLI takes the address under `httpUrl` rather than `url`: it reads `url` as a server on the older event-stream transport, and `httpUrl` as one on the streamable HTTP transport, which is the one this server speaks.

**Your client obtains the token, not you.** Nothing about signing in is configured in the entry: the server answers an unauthenticated request by naming the document that says which authorization server issues its tokens, and a client that speaks the protocol's authorization flow reads that document, sends you to sign in, and attaches the token it receives to every later request. The scope names it may ask for are published in that same document. A client that does not implement the flow cannot reach a server of this kind, and nothing you add to the entry substitutes for it.

**A tool your sign-in's scopes do not reach is still in the tool list.** Calling it is refused, naming the scope that would admit it, and a client that implements the protocol's step-up answers that refusal by asking you to sign in again for that scope. A client that does not step up can still be given the write scopes: whoever runs the authorization server makes them default scopes for that client, so its first sign-in already carries them — at the cost that every sign-in through that client then carries write reach. [What a caller may reach](../language-reference/cli/aggrega-mcp.md#what-a-caller-may-reach) sets out what each scope admits, and how that setting behaves for a client that registers itself anew each time it connects.

What such a server requires, and what its operator configures, is in the [`aggrega mcp` reference](../language-reference/cli/aggrega-mcp.md#reaching-the-server-over-https).

## Verify the connection

After the client reconnects, confirm the integration is live: the client should list the Aggrega authoring prompts (one each for the developer, architect and operations roles, plus a per-entity template) and the authoring tools — `scaffold`, `validate`, `describe` and `get-schema` among them. Ask the assistant to scaffold a component, and it should return a skeleton carrying the fields a Component requires. If nothing appears, check that `aggrega version` runs from a terminal and that the client's `command` resolves to the binary — the [`PATH` note](#a-note-on-path) above covers the common cause.
