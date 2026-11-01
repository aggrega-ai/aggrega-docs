# The Aggrega skill

The Aggrega skill teaches an AI assistant to install and use Aggrega. It is a folder named `aggrega` holding a `SKILL.md` file in the open [Agent Skills](https://agentskills.io/specification) format, which many assistants read from a skill folder of their own and load when your request concerns Aggrega.

Install it for the assistants on your machine, in every project of yours:

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

The install command can add it too, as it installs the binary: [Add the assistant skill as you install](setup.md#add-the-assistant-skill-as-you-install) gives the option.

## What the skill tells your assistant

The skill tells the assistant how to install Aggrega, how to connect it to the `aggrega mcp` server, how to start a workspace, and how to run the authoring loop — scaffold, validate, build — that [Authoring Aggrega files](getting-started.md) describes. It carries no copy of any schema or entity contract: it sends the assistant to the binary for every structural answer — the MCP tools where the server is connected, the `aggrega` command line otherwise — and to the published documentation for what things mean.

The skill and the MCP server do different jobs, and an assistant works best with both. The skill is instructions the assistant reads; the server, which [Connect the MCP server](mcp-server.md) connects, is the tools it calls. An assistant that is not in the `--agent` list skips the skill and still reaches the same tools and reference material through the server.

## Where it is installed

Without `--global`, the skill goes into the assistant's project skill folder at the root of your workspace, where the project's skills are committed. With `--global`, it goes into the assistant's per-user skill folder in your home directory, which the assistant reads in every project. With `--global` and no `--agent`, the command looks for the assistants on your machine, prints each one it found and what found it, and at a terminal asks before it writes. [`aggrega skills`](../language-reference/cli/aggrega-skills.md) gives the folders for every assistant, what finds each one, and what the command refuses to overwrite.

## Keeping the skill current

The skill is built into the `aggrega` binary, so the copy `aggrega skills install` writes matches the version you have installed. After you upgrade Aggrega — the installer command updates the binary in place — run the same `aggrega skills install` command again to bring the skill up to the new version.
