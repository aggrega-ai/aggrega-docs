# aggrega skills

Install the Aggrega skill into an AI assistant

<!-- BEGIN GENERATED: cli-skills -->
**Synopsis**

```
aggrega skills
```

**Description**

```
Install the skill that teaches an AI assistant to install and use Aggrega.

A skill is a folder holding a SKILL.md file in the open Agent Skills format,
which many assistants read from a skill folder of their own. The Aggrega skill
tells an assistant how to install Aggrega, how to connect it to the aggrega MCP
server, how to start a workspace, and how to run the authoring loop — scaffold,
validate, build. It carries no copy of any schema: it sends the assistant to
this binary for every structural question and to the published documentation
for every conceptual one.

The skill is built into this binary, so the copy it installs matches the
version you have.
```

**Subcommands**

| Command | Description |
| --- | --- |
| `aggrega skills install` | Write the Aggrega skill into an AI assistant's skill folder |

**`aggrega skills install` description**

```
Write the Aggrega skill into the skill folder of each assistant named with
--agent, so the assistant knows how to install and use Aggrega.

By default the skill goes into the assistant's project skill folder inside the
directory you run the command in, which is where a project's own skills are
committed. With --global it goes into the assistant's per-user skill folder
in your home directory instead, where the assistant reads it in every project.

--agent may be given more than once. Where several of the named assistants read
the same folder, the skill is written there once.

The skill is written as a folder named aggrega holding SKILL.md, and every file
written carries a comment line saying where it comes from. Running the command
again replaces a copy carrying that line, which is how a newer aggrega brings
the skill up to its own version. A file at the target that does not carry it
was not written by this command, so the command refuses, names the file and
writes nothing; move it aside or remove it, then run the command again. Every
target is checked before anything is written, so a refusal leaves every folder
as it was.

The assistants it installs for, and the folders each one reads:

  --agent         assistant       project folder    per-user folder
  amp             Amp             .agents/skills    ~/.config/amp/skills
  claude-code     Claude Code     .claude/skills    ~/.claude/skills
  cline           Cline           .cline/skills     ~/.cline/skills
  codex           Codex           .agents/skills    ~/.agents/skills
  cursor          Cursor          .cursor/skills    ~/.cursor/skills
  gemini-cli      Gemini CLI      .gemini/skills    ~/.gemini/skills
  github-copilot  GitHub Copilot  .github/skills    ~/.copilot/skills
  goose           Goose           .agents/skills    ~/.agents/skills
  opencode        OpenCode        .opencode/skills  ~/.config/opencode/skills
  windsurf        Windsurf        .devin/skills     ~/.codeium/windsurf/skills
  zed             Zed             .agents/skills    ~/.agents/skills

An assistant that is not listed is refused by name. It can still use Aggrega
through its MCP server: connect it to "aggrega mcp" as
https://aggrega.ai/docs/authoring/setup/ describes.
```

**`aggrega skills install` flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--agent` | `[]` | Assistant to install the skill for, by identifier (for example claude-code, codex, cursor or gemini-cli). Repeatable; the help lists every identifier and the folder each one writes. |
| `--global` | `false` | Install into each assistant's per-user skill folder in your home directory, which it reads in every project, instead of the project skill folder in the directory you run the command in. |
<!-- END GENERATED: cli-skills -->

## What it does

`aggrega skills install` writes the Aggrega skill into the skill folder of each AI assistant you name with `--agent`. A skill is a folder holding a `SKILL.md` file in the open [Agent Skills](https://agentskills.io/specification) format: a short frontmatter block naming the skill and saying when to use it, followed by instructions. An assistant that reads skills loads it when your request matches, so it knows how to install Aggrega, how to connect to [`aggrega mcp`](aggrega-mcp.md), how to start a workspace, and how to run the authoring loop described in [Getting Started with Authoring](../../authoring/getting-started.md).

The skill carries no copy of any schema or entity contract. It tells the assistant to ask the binary for every structural answer — the MCP tools where the server is connected, the `aggrega` command line otherwise — and to read the [published documentation](https://aggrega.ai/docs/) for what things mean. The skill is built into the binary, so the copy it writes matches the version you have installed.

```bash
aggrega skills install --agent claude-code
```

```
Installed the aggrega skill for Claude Code at /home/you/project/.claude/skills/aggrega
```

## Where the skill lands

Without `--global`, the skill goes into the assistant's project skill folder inside the directory you run the command in — run it from your project's root, where the assistant looks for the project's skills and where you commit them. With `--global`, it goes into the assistant's per-user skill folder in your home directory, which the assistant reads in every project. The table in the description above gives both folders for every assistant; each is the folder that assistant's own documentation names, and `~` stands for your home directory.

Several assistants read the shared `.agents/skills` folder. Naming more than one of them writes the skill there once and names them all in the one line that reports it:

```bash
aggrega skills install --agent codex --agent zed --global
```

```
Installed the aggrega skill for Codex and Zed at /home/you/.agents/skills/aggrega
```

## Installing again, and what it refuses

Every file the command writes carries one comment line, just after the frontmatter, saying that it comes from the skill built into the aggrega binary and that installing again replaces it. That line is how the command tells its own copy from yours:

- **A copy carrying the line is replaced.** Running the command again after upgrading Aggrega brings the skill up to the new version, and the line it prints says `Replaced` rather than `Installed`.
- **A file without the line is refused.** A `SKILL.md` already at the target that the command did not write is yours, so the command names its path, writes nothing anywhere, and exits non-zero. Move the file aside or remove it, then run the command again. To keep changes of your own, keep them in a skill with another name.

Every target is checked before anything is written, so a refusal for one assistant leaves every other assistant's folder as it was too. Files in the skill's folder that the skill does not write are left alone.

## Assistants it does not know

`--agent` takes only the identifiers in the table above, each one the identifier the open skills command-line tool uses for the same assistant. Any other identifier is refused by name, with the list of the ones it knows. An assistant that is not listed can still use Aggrega: connect it to the MCP server as [Setup](../../authoring/setup.md#connect-an-mcp-client) describes, and it reaches the same tools and reference material the skill points to.

## Examples

Install the skill for Claude Code in this project:

```bash
aggrega skills install --agent claude-code
```

Install it for Gemini CLI and Cursor in every project of yours:

```bash
aggrega skills install --agent gemini-cli --agent cursor --global
```

Bring an installed copy up to the binary you have just upgraded to:

```bash
aggrega skills install --agent claude-code
```
