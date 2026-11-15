# Set up Aggrega with your AI assistant

An AI assistant that can run commands on your machine — a coding agent in your terminal or your editor — can set Aggrega up for you: install the `aggrega` binary, add the Aggrega skill to itself, and connect itself to the Aggrega MCP server. An assistant that installs plugins does the last two in one step, by installing the Aggrega plugin; any other adds the skill and connects the server one after the other. Paste the prompt below into it, and it works through those steps; the prompt tells it to check with you before it installs anything.

When it is done, the assistant has two ways to work with Aggrega. The **skill** is a folder holding a `SKILL.md` file that the assistant loads when your request concerns Aggrega: it tells the assistant how the authoring loop runs and to take every answer about a schema or a file from the binary rather than from memory. The **MCP server**, `aggrega mcp`, gives it Aggrega's tools — scaffold, validate, build and the rest — and the reference material they work from. [The Aggrega skill](skill.md) describes the skill and the plugin, [Connect the MCP server](mcp-server.md) the server, and [What your assistant can do with Aggrega](what-it-can-do.md) what it reaches through it.

Once it is set up, [Getting started](../getting-started.md), each walkthrough under [Import](../authoring/import/README.md) and the page of each [runnable example](../language-reference/examples/by-product-and-capability.md#in-teaching-order) that builds with Aggrega give the task they teach as a prompt to paste into it, beside the commands.

## The prompt

<!-- copyable -->

> Set up Aggrega for me, one step at a time, and tell me what you ran at each step.
>
> 1. Run `aggrega version`. If the command is not found, ask me before you install Aggrega, then install it for my user with the official installer: on Linux or macOS `curl -fsSL https://aggrega.ai/install.sh | sh`, on Windows in PowerShell `irm https://aggrega.ai/install.ps1 | iex`. Run `aggrega version` again. If the installer printed a line to add to my `PATH`, show it to me.
> 2. If `https://aggrega.ai/docs/ai-assistants/skill/` gives a way to install the Aggrega plugin in you, ask me before you install it, then install it that way, or tell me what to do where it is a step I take in your interface. The plugin adds the Aggrega skill and connects you to the Aggrega MCP server. Otherwise, run `aggrega skills install --help` and find your own identifier in the list it prints. Ask me whether I want the skill in this project or in every project, then run `aggrega skills install --agent <your identifier>`, adding `--global` for every project. If you are not in the list, skip installing the skill and say so.
> 3. If you installed the plugin, you are connected to the Aggrega MCP server already. Otherwise, connect yourself to the Aggrega MCP server, which is the command `aggrega mcp`, the way you add an MCP server, as `https://aggrega.ai/docs/ai-assistants/mcp-server/` describes for you. If you need a restart or a reload to load the plugin or the server, tell me what to do.
> 4. Once you are connected, call the `describe-capabilities` tool with no arguments and summarize what it lists.

The prompt is the same in every language the documentation is published in: only its sentences are translated, and every command, flag, address and tool name in it stays exactly as written, so an assistant reads the same instructions whichever language you copy it from.

The installer downloads the latest release, checks it against the release's published SHA-256 digests and installs it for your user only, without administrator rights; [Install the binary](../install.md#install-the-binary) describes what it does and how to install by hand instead.

## What changes from one assistant to another

Three parts of the prompt depend on the assistant: the way it installs the Aggrega plugin, if it installs plugins; otherwise, the identifier it passes to `--agent` when it installs the skill, and the way it adds the server. The assistant works them out from the prompt, but where you know them you can write them into it.

| Assistant | Installing the plugin | Installing the skill without the plugin |
|---|---|---|
| Claude Code | `claude plugin install aggrega --marketplace aggrega-ai/aggrega-skills` | `aggrega skills install --agent claude-code` |
| Codex | `codex plugin marketplace add aggrega-ai/aggrega-skills`, then `codex plugin add aggrega@aggrega` | `aggrega skills install --agent codex` |
| GitHub Copilot CLI | `copilot plugin marketplace add aggrega-ai/aggrega-skills`, then `copilot plugin install aggrega@aggrega` | `aggrega skills install --agent github-copilot` |
| Gemini CLI | `gemini extensions install https://github.com/aggrega-ai/aggrega-skills` | `aggrega skills install --agent gemini-cli` |
| Antigravity | `agy plugin install https://github.com/aggrega-ai/aggrega-skills` | `aggrega skills install --agent antigravity`, or `--agent antigravity-cli` for the Antigravity CLI |
| Cursor | `git clone https://github.com/aggrega-ai/aggrega-skills ~/.cursor/plugins/local/aggrega`, then **Developer: Reload Window** | `aggrega skills install --agent cursor` |

Visual Studio Code with GitHub Copilot, Kiro and OpenClaw install the plugin too; [Install the plugin](skill.md#install-the-plugin) gives the way for every assistant, and what OpenClaw asks before it installs. The identifiers `--agent` accepts, and the folder each one writes, are listed in [`aggrega skills`](../language-reference/cli/aggrega-skills.md) and printed by `aggrega skills install --help`. The way each assistant adds the server — a command of its own, or an entry in its settings or a server-list file — is on [Connect the MCP server](mcp-server.md), client by client.

## When part of the prompt does not apply

- **An assistant that installs the plugin** skips connecting the server: the plugin connected it. The plugin does not install the binary, so step 1 still applies. Where the assistant starts the plugin's server outside your project — Codex starts it in the plugin's own folder — the skill tells it to name your project's folder to the server, as [The folder the server works in](skill.md#the-folder-the-server-works-in) describes.
- **An assistant that installs no plugin and is not in the `--agent` list** skips installing the skill. It still reaches Aggrega's tools through the MCP server once it is connected, and the server hands it guidance of its own when it connects.
- **An assistant that cannot run commands** — a chat application with no access to your terminal — cannot follow the prompt. Install the binary as [Install](../install.md) describes, and connect the application yourself as [Connect the MCP server](mcp-server.md) describes. For Claude Desktop, see [Claude Desktop](#claude-desktop) below.
- **A server someone else runs for you**, reached over HTTPS, needs neither the binary nor the plugin nor the skill. Give the assistant's client the address instead, as [A server reached over HTTPS](mcp-server.md#a-server-reached-over-https) describes.

## Claude Desktop

Claude Desktop connects to Aggrega through the extension package each release carries, and that package launches the `aggrega` installed on your computer. Set both up on your computer yourself:

1. Install `aggrega` in PowerShell on Windows with `irm https://aggrega.ai/install.ps1 | iex`, or in a terminal on macOS or Linux with `curl -fsSL https://aggrega.ai/install.sh | sh`. [Install the binary](../install.md#install-the-binary) describes what the installer does.
2. Install the extension package, set its **Workspace folder**, and restart Claude Desktop, as [Claude Desktop](mcp-server.md#claude-desktop) on Connect the MCP server describes.

A Claude Desktop session can run its commands in a cloud container rather than on your computer, so the prompt above, pasted into it, works on the container. There, `aggrega` installs and runs from the session's shell once the container's network policy allows `aggrega.ai` — an organization owner allows it in the organization's network access settings. The Aggrega MCP server is not connected there: Claude Desktop adds a local server only from its extension settings, and the extension launches the `aggrega` on your computer, not the one in the container.

`aggrega skills install` has no Claude Desktop entry, so a Claude Desktop session skips installing the skill. It reaches Aggrega's tools through the MCP server once the extension is installed, and the server hands it guidance of its own when it connects.
