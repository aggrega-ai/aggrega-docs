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
| `aggrega skills list` | List the skills this binary ships and the assistants it can install them for |

**`aggrega skills install` description**

```
Write the Aggrega skill into the skill folder of each assistant named with
--agent, so the assistant knows how to install and use Aggrega.

By default the skill goes into the assistant's project skill folder at the root
of your workspace — the one found from the directory you run the command in, or
named with --workspace-root; a directory no workspace marks is its own root —
which is where a project's own skills are committed. With --global it goes
into the assistant's per-user skill folder in your home directory instead,
where the assistant reads it in every project.

Every folder and file a project installation writes is held to the workspace:
a skill folder reached through a link leading out of it is refused, and
nothing is written.

--agent may be given more than once. Where several of the named assistants read
the same folder, the skill is written there once.

With --global and no --agent, the skill is installed for the assistants found
on this machine: each one whose configuration folder is in your home directory
or whose command is on your PATH, as the table below names them. The command
prints each assistant it found and what found it. At a terminal it then asks
before writing: press Enter to install for those, or type the identifiers of
other assistants to add them. Where standard input is not a terminal it
installs for the assistants found without asking. Where it finds none and is
given none, it writes nothing and says so. A project installation is for the
assistants a project's people use rather than those on one machine, so it
always names them with --agent.

The skill is written as a folder named aggrega holding SKILL.md, and every file
written carries a comment line saying where it comes from. Running the command
again replaces a copy carrying that line, which is how a newer aggrega brings
the skill up to its own version. A file at the target that does not carry it
was not written by this command, so the command refuses, names the file and
writes nothing; move it aside or remove it, then run the command again. Every
target is checked before anything is written, so a refusal leaves every folder
as it was.

The assistants it installs for, the folders each one reads, and what finds each
on this machine — its configuration folder in your home directory, or its
command on your PATH:

  --agent          assistant        project folder    per-user folder                   found by
  amp              Amp              .agents/skills    ~/.config/amp/skills              ~/.config/amp, amp
  antigravity      Antigravity      .agents/skills    ~/.gemini/config/skills           ~/.gemini/antigravity, antigravity
  antigravity-cli  Antigravity CLI  .agents/skills    ~/.gemini/antigravity-cli/skills  ~/.gemini/antigravity-cli
  claude-code      Claude Code      .claude/skills    ~/.claude/skills                  ~/.claude, claude
  cline            Cline            .cline/skills     ~/.cline/skills                   ~/.cline, cline
  codex            Codex            .agents/skills    ~/.agents/skills                  ~/.codex, codex
  cursor           Cursor           .cursor/skills    ~/.cursor/skills                  ~/.cursor, cursor
  gemini-cli       Gemini CLI       .gemini/skills    ~/.gemini/skills                  gemini
  github-copilot   GitHub Copilot   .github/skills    ~/.copilot/skills                 ~/.copilot, copilot
  goose            Goose            .agents/skills    ~/.agents/skills                  ~/.config/goose, goose
  opencode         OpenCode         .opencode/skills  ~/.config/opencode/skills         ~/.config/opencode, opencode
  windsurf         Windsurf         .devin/skills     ~/.codeium/windsurf/skills        ~/.codeium/windsurf, windsurf
  zed              Zed              .agents/skills    ~/.agents/skills                  ~/.config/zed, zed

An assistant that is not listed is refused by name. It can still use Aggrega
through its MCP server: connect it to "aggrega mcp" as
https://aggrega.ai/docs/install/ describes.
```

**`aggrega skills install` flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--agent` | `[]` | Assistant to install the skill for, by identifier (for example claude-code, codex, cursor or gemini-cli). Repeatable; the help lists every identifier and the folder each one writes. Required without --global; with --global and none given, the skill is installed for the assistants found on this machine. |
| `--global` | `false` | Install into each assistant's per-user skill folder in your home directory, which it reads in every project, instead of the project skill folder at the root of your workspace. |

**`aggrega skills list` description**

```
List the skills built into this binary, and the assistants "aggrega skills
install" can write them for, with the project folder and the per-user folder
each assistant reads skills from. It writes nothing.
```
<!-- END GENERATED: cli-skills -->

## What it does

`aggrega skills install` writes the Aggrega skill into the skill folder of each AI assistant you name with `--agent`, or, with `--global` and no `--agent`, of each one it finds on this machine. A skill is a folder holding a `SKILL.md` file in the open [Agent Skills](https://agentskills.io/specification) format: a short frontmatter block naming the skill and saying when to use it, followed by instructions. An assistant that reads skills loads it when your request matches, so it knows how to install Aggrega, how to connect to [`aggrega mcp`](aggrega-mcp.md), how to start a workspace, and how to run the authoring loop described in [Authoring Aggrega files](../../authoring/getting-started.md).

The skill carries no copy of any schema or entity contract. It tells the assistant to ask the binary for every structural answer — the MCP tools where the server is connected, the `aggrega` command line otherwise — and to read the [published documentation](https://aggrega.ai/docs/) for what things mean. The skill is built into the binary, so the copy it writes matches the version you have installed.

```bash
aggrega skills install --agent claude-code
```

```
Installed the aggrega skill for Claude Code at /home/you/project/.claude/skills/aggrega
```

## Where the skill lands

Without `--global`, the skill goes into the assistant's project skill folder at the root of your workspace, where the assistant looks for the project's skills and where you commit them. The workspace is the one every command finds — the one `--workspace-root` names, or the one found from the directory you run the command in, so running it from a sub-folder still installs at the root — and a directory no workspace marks is its own root. With `--global`, it goes into the assistant's per-user skill folder in your home directory, which the assistant reads in every project. The table in the description above gives both folders for every assistant; each is the folder that assistant's own documentation names, and `~` stands for your home directory.

Several assistants read the shared `.agents/skills` folder. Naming more than one of them writes the skill there once and names them all in the one line that reports it:

```bash
aggrega skills install --agent codex --agent zed --global
```

```
Installed the aggrega skill for Codex and Zed at /home/you/.agents/skills/aggrega
```

## The assistants on this machine

With `--global` and no `--agent`, the command installs the skill for the assistants it finds on this machine. An assistant counts as found when its own configuration folder is in your home directory, or its command is on your `PATH`; the `found by` column of the table in the description above names both for every assistant. A folder or command is used only where it belongs to that assistant alone, so finding it never stands for another one: the shared `.agents/skills` folder finds nobody, and `.gemini`, where Gemini CLI and Antigravity both keep files, finds neither — Gemini CLI is found by its `gemini` command, and each Antigravity product by its own folder beneath `.gemini`. An assistant whose configuration lives elsewhere on your system is found by its command, or named with `--agent`.

The command prints each assistant it found and what found it, then installs:

```bash
aggrega skills install --global
```

```
Found Claude Code (claude-code), from the folder /home/you/.claude
Found Codex (codex), from the command /usr/local/bin/codex
Installed the aggrega skill for Claude Code at /home/you/.claude/skills/aggrega
Installed the aggrega skill for Codex at /home/you/.agents/skills/aggrega
```

**At a terminal it asks first.** After the lines naming what it found, it asks you to confirm: press Enter to install for those, or type the identifiers of other assistants, separated by spaces or commas, to add them. Where it found none, it asks for the identifiers instead, and an empty answer writes nothing. **Where standard input is not a terminal** — a script, an assistant running the command for you, or the assistant's own tool for it — it asks nothing and installs for the assistants it found. Where it finds none and is given none, it writes nothing, says so, and exits non-zero.

Naming any `--agent` skips the search: the command installs for the assistants you named and no others. A project installation, without `--global`, always names them: it is for the assistants the project's people use, which this machine does not tell.

## Installing again, and what it refuses

Every file the command writes carries one comment line, just after the frontmatter, saying that it comes from the skill built into the aggrega binary and that installing again replaces it. That line is how the command tells its own copy from yours:

- **A copy carrying the line is replaced.** Running the command again after upgrading Aggrega brings the skill up to the new version, and the line it prints says `Replaced` rather than `Installed`.
- **A file without the line is refused.** A `SKILL.md` already at the target that the command did not write is yours, so the command names its path, writes nothing anywhere, and exits non-zero. Move the file aside or remove it, then run the command again. To keep changes of your own, keep them in a skill with another name.
- **A folder reached through a link leading out of the workspace is refused.** Without `--global`, every folder and file the command would write is held to the workspace: where an assistant's skill folder, or a folder on the way to it, is a link leading out of the workspace, the command names the link and where it leads, writes nothing anywhere, and exits non-zero — the condition described in [A path the operation writes leads through a link out of the directory it must stay inside](../errors/fatal-halts.md#a-path-the-operation-writes-leads-through-a-link-out-of-the-directory-it-must-stay-inside). A link that stays inside the workspace is written through.

Every target is checked before anything is written, so a refusal for one assistant leaves every other assistant's folder as it was too. Files in the skill's folder that the skill does not write are left alone.

## Assistants it does not know

`--agent` takes only the identifiers in the table above, each one the identifier the open skills command-line tool uses for the same assistant. Any other identifier is refused by name, with the list of the ones it knows. An assistant that is not listed can still use Aggrega: connect it to the MCP server as [Connect the MCP server](../../ai-assistants/mcp-server.md) describes, and it reaches the same tools and reference material the skill points to.

## Examples

Install the skill for Claude Code in this project:

```bash
aggrega skills install --agent claude-code
```

Install it for Gemini CLI and Cursor in every project of yours:

```bash
aggrega skills install --agent gemini-cli --agent cursor --global
```

Install it in every project of yours for the assistants on this machine:

```bash
aggrega skills install --global
```

Bring an installed copy up to the binary you have just upgraded to:

```bash
aggrega skills install --agent claude-code
```

## Listing what it knows

`aggrega skills list` prints the skills built into this binary with their descriptions, then every assistant `aggrega skills install` knows, with its project folder and its per-user folder. It writes nothing.

```bash
aggrega skills list
```
