# The Aggrega skill

The Aggrega skill teaches an AI assistant to install and use Aggrega. It is a folder named `aggrega` holding a `SKILL.md` file in the open [Agent Skills](https://agentskills.io/specification) format, which many assistants read from a skill folder of their own and load when your request concerns Aggrega.

There are two ways to give it to an assistant. An assistant that installs plugins takes it as part of the Aggrega plugin, which also connects the assistant to the Aggrega MCP server, in one step: see [Install the plugin](#install-the-plugin). Any assistant that reads skills from a folder can have the skill written there by the `aggrega` binary: see [Install the skill alone](#install-the-skill-alone).

## Install the plugin

The repository [`aggrega-ai/aggrega-skills`](https://github.com/aggrega-ai/aggrega-skills) holds the skill and is also a plugin for the assistants below. Installing the plugin adds the Aggrega skill and connects the assistant to the Aggrega MCP server, which the assistant then starts itself as `aggrega mcp`, so neither `aggrega skills install` nor the steps on [Connect the MCP server](mcp-server.md) are needed for that assistant.

**The plugin does not install the `aggrega` binary.** Install it first, as [Install the binary](../install.md#install-the-binary) describes, so that the assistant finds `aggrega` on the `PATH` when it starts the server.

### Claude Code

```bash
claude plugin install aggrega --marketplace aggrega-ai/aggrega-skills
```

Inside Claude Code, the same is `/plugin install aggrega --marketplace aggrega-ai/aggrega-skills`.

### Codex

```bash
codex plugin marketplace add aggrega-ai/aggrega-skills
codex plugin add aggrega@aggrega
```

The first command adds the repository as a plugin marketplace named `aggrega`; the second installs the `aggrega` plugin from it.

### GitHub Copilot

In GitHub Copilot CLI:

```bash
copilot plugin marketplace add aggrega-ai/aggrega-skills
copilot plugin install aggrega@aggrega
```

Visual Studio Code with GitHub Copilot finds the plugins GitHub Copilot CLI installed and uses them too. To install the plugin from Visual Studio Code itself, run **Chat: Install Plugin from Source** from the Command Palette and give it the repository's address, `https://github.com/aggrega-ai/aggrega-skills`.

### Gemini CLI

```bash
gemini extensions install https://github.com/aggrega-ai/aggrega-skills
```

Gemini CLI installs the plugin as one of its extensions.

### Antigravity

```bash
agy plugin install https://github.com/aggrega-ai/aggrega-skills
```

### Cursor

Cursor loads a plugin from a folder beneath `~/.cursor/plugins/local/`. Put the repository there, then run **Developer: Reload Window** from the command palette:

```bash
git clone https://github.com/aggrega-ai/aggrega-skills ~/.cursor/plugins/local/aggrega
```

### Kiro

Kiro installs the plugin as a power. In the Powers panel, choose **Add Custom Power**, then **Import power from GitHub**, enter the repository's address, `https://github.com/aggrega-ai/aggrega-skills`, and choose **Install**. Kiro starts and stops the plugin's MCP server with the power.

### OpenClaw

```bash
openclaw plugins install aggrega --marketplace aggrega-ai/aggrega-skills
```

OpenClaw asks twice before it installs a plugin from a source it has not reviewed itself. It first stops and asks you to review the source and run the command again with `--force`; it then asks for your consent to what the plugin brings — here the skill and an MCP server — with `--accept-capabilities`. Once you have reviewed the repository, run:

```bash
openclaw plugins install aggrega --marketplace aggrega-ai/aggrega-skills --force --accept-capabilities
```

`--force` also replaces a plugin of the same name that is already installed, so check `openclaw plugins list` first when you have installed one called `aggrega` before.

### The folder the server works in

Aggrega's tools work in a workspace, and a call that names none is answered in the workspace the server finds from the folder it was started in. Some assistants start a plugin's server in the plugin's own folder rather than in your project — Codex does. The skill tells the assistant to check which workspace the server answers in, with the `config-show` tool, before it works in a project, and to name the project's folder as `workspace_root` on each call that takes it where the two differ — by its full path, because a relative `workspace_root` is read from the workspace the server already answers in.

## Install the skill alone

To install the skill without the plugin, use the `aggrega` binary, which writes the copy built into it. Install it for the assistants on your machine, in every project of yours:

```bash
aggrega skills install --global
```

Install it for one assistant in the project you are in, naming the assistant:

```bash
aggrega skills install --agent claude-code
```

List the assistants it can be installed for, with the folder each one reads:

```bash
aggrega skills list
```

The install command can add it too, as it installs the binary: [Add the assistant skill as you install](../install.md#add-the-assistant-skill-as-you-install) gives the option. Installed this way, the skill comes without the server connection: connect the assistant to the server as [Connect the MCP server](mcp-server.md) describes.

## What the skill tells your assistant

The skill tells the assistant how to install Aggrega, how to connect it to the `aggrega mcp` server, how to start a workspace, and how to run the authoring loop — draft, validate, build — that [Authoring Aggrega files](../authoring/getting-started.md) describes. It carries no copy of any schema or entity contract: it sends the assistant to the binary for every structural answer — the MCP tools where the server is connected, the `aggrega` command line otherwise — and to the published documentation for what things mean.

The skill and the MCP server do different jobs, and an assistant works best with both. The skill is instructions the assistant reads; the server, which the plugin or [Connect the MCP server](mcp-server.md) connects, is the tools it calls. An assistant that installs no plugin and is not in the `--agent` list skips the skill and still reaches the same tools and reference material through the server.

## Where it is installed

The plugin keeps the skill in the folder the assistant keeps its plugins in. `aggrega skills install` writes it elsewhere: without `--global`, into the assistant's project skill folder at the root of your workspace, where the project's skills are committed; with `--global`, into the assistant's per-user skill folder in your home directory, which the assistant reads in every project. With `--global` and no `--agent`, the command looks for the assistants on your machine, prints each one it found and what found it, and at a terminal asks before it writes. [`aggrega skills`](../language-reference/cli/aggrega-skills.md) gives the folders for every assistant, what finds each one, and what the command refuses to overwrite.

## Keeping the skill current

A skill that came with the plugin is updated with the plugin, through the assistant's own way of updating its plugins; a plugin cloned into Cursor's local folder is updated with `git pull` in that folder, followed by **Developer: Reload Window**. The plugin connects the server the `aggrega` binary on your `PATH` runs, so the tools and reference material follow the binary you have installed.

The skill is also built into the `aggrega` binary, so the copy `aggrega skills install` writes matches the version you have installed. After you upgrade Aggrega — the installer command updates the binary in place — run the same `aggrega skills install` command again to bring that copy up to the new version.
