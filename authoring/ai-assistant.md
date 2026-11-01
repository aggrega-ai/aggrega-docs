# Set up Aggrega with your AI assistant

An AI assistant that can run commands on your machine — a coding agent in your terminal or your editor — can set Aggrega up for you: install the `aggrega` binary, add the Aggrega skill to itself, and connect itself to the Aggrega MCP server. Paste the prompt below into it, and it works through those steps; the prompt tells it to check with you before it installs anything.

When it is done, the assistant has two ways to work with Aggrega. The **skill** is a folder holding a `SKILL.md` file that the assistant loads when your request concerns Aggrega: it tells the assistant how the authoring loop runs and to take every answer about a schema or a file from the binary rather than from memory. The **MCP server**, `aggrega mcp`, gives it Aggrega's tools — scaffold, validate, build and the rest — and the reference material they work from. [The Aggrega skill](skill.md) describes the skill, [Connect the MCP server](mcp-server.md) the server, and [What your assistant can do with Aggrega](what-your-assistant-can-do.md) what it reaches through it.

## The prompt

<!-- copyable -->

> Set up Aggrega for me, one step at a time, and tell me what you ran at each step.
>
> 1. Run `aggrega version`. If the command is not found, ask me before you install Aggrega, then install it for my user with the official installer: on Linux or macOS `curl -fsSL https://aggrega.ai/install.sh | sh`, on Windows in PowerShell `irm https://aggrega.ai/install.ps1 | iex`. Run `aggrega version` again. If the installer printed a line to add to my `PATH`, show it to me.
> 2. Run `aggrega skills install --help` and find your own identifier in the list it prints. Ask me whether I want the skill in this project or in every project, then run `aggrega skills install --agent <your identifier>`, adding `--global` for every project. If you are not in the list, skip installing the skill and say so.
> 3. Connect yourself to the Aggrega MCP server, which is the command `aggrega mcp`, the way you add an MCP server, as `https://aggrega.ai/docs/authoring/mcp-server/` describes for you. If you need a restart or a reload to load it, tell me what to do.
> 4. Once you are connected, call the `describe-capabilities` tool with no arguments and summarize what it lists.

The prompt is the same in every language the documentation is published in: only its sentences are translated, and every command, flag, address and tool name in it stays exactly as written, so an assistant reads the same instructions whichever language you copy it from.

The installer downloads the latest release, checks it against the release's published SHA-256 digests and installs it for your user only, without administrator rights; [Install the binary](setup.md#install-the-binary) describes what it does and how to install by hand instead.

## What changes from one assistant to another

Two parts of the prompt depend on the assistant: the identifier it passes to `--agent` when it installs the skill, and the way it adds the server. The assistant works both out from the prompt, but where you know them you can write them into it. The identifier is the assistant's own, such as `claude-code`, `codex`, `gemini-cli` or `cursor` in `aggrega skills install --agent cursor`; the identifiers `--agent` accepts, and the folder each one writes, are listed in [`aggrega skills`](../language-reference/cli/aggrega-skills.md) and printed by `aggrega skills install --help`. The way each assistant adds the server — a command of its own, or an entry in its settings or a server-list file — is on [Connect the MCP server](mcp-server.md), client by client.

## When part of the prompt does not apply

- **An assistant that is not in the `--agent` list** skips installing the skill. It still reaches Aggrega's tools through the MCP server once it is connected, and the server hands it guidance of its own when it connects.
- **An assistant that cannot run commands** — a chat application with no access to your terminal — cannot follow the prompt. Install the binary as [Setup](setup.md) describes, and connect the application yourself as [Connect the MCP server](mcp-server.md) describes; Claude Desktop, for example, adds Aggrega from an extension package each release carries.
- **A server someone else runs for you**, reached over HTTPS, needs neither the binary nor the skill. Give the assistant's client the address instead, as [A server reached over HTTPS](mcp-server.md#a-server-reached-over-https) describes.
