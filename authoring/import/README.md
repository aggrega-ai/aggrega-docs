# Import

`aggrega import` reads a project written in another format — a flow exported
from Langflow, an MCP client's configuration, a Compose file, and the other
formats listed below — and writes draft Aggrega files from it: an Aggregate, and
for most formats a Release, for you to review, edit and build. It deploys
nothing and reaches no cluster or cloud account. The drafts are plain files in
your workspace, and what happens to them next is up to you.

<figure class="diagram not-content">
<div class="diagram-canvas">
<div class="diagram-flow">
<div class="diagram-flow-part" style="--diagram-weight: 1.4">
<ul class="diagram-chips">
<li class="diagram-chip diagram-chip-source">LangGraph</li>
<li class="diagram-chip diagram-chip-source">CrewAI</li>
<li class="diagram-chip diagram-chip-source">n8n</li>
<li class="diagram-chip diagram-chip-source">Dify</li>
<li class="diagram-chip diagram-chip-source">Langflow</li>
<li class="diagram-chip diagram-chip-source">Flowise</li>
<li class="diagram-chip diagram-chip-source">Google ADK</li>
<li class="diagram-chip diagram-chip-source">Microsoft Agent Framework</li>
<li class="diagram-chip diagram-chip-source">MCP client configurations</li>
<li class="diagram-chip diagram-chip-source">Compose</li>
</ul>
</div>
<div class="diagram-arrow" aria-hidden="true"></div>
<div class="diagram-flow-part" style="--diagram-weight: 0.8">
<div class="diagram-node diagram-node-compiler">
<div class="diagram-node-label"><code>aggrega import</code></div>
</div>
</div>
<div class="diagram-arrow" aria-hidden="true"></div>
<div class="diagram-flow-part">
<div class="diagram-node diagram-node-output-file">

draft Aggrega files

for you to review and edit

</div>
</div>
</div>
</div>
<figcaption class="diagram-caption">

Your existing project in, draft Aggrega files out. Nothing is deployed; you review the drafts first.

</figcaption>
</figure>

## What it gives you

- **Your project reaches Aggrega without being rewritten by hand.** The drafted
  Aggregate is the same kind of file you would write yourself, so once it is
  reviewed it builds for every target your catalog has Recipes for, and every
  governance policy your workspace attaches judges its build like any other.
- **The drafts are yours.** They are plain YAML in your workspace, with nothing
  left behind that the build depends on. Edit them, rename them, commit them.
- **The binary tells you what is left.** `aggrega validate` and `aggrega build`
  refuse a draft that is not finished, and each refusal names what is missing
  and the document and key it belongs at — an environment, a socket left
  unwired, a component type no Recipe realizes yet.
- **The draft can follow its source.** `aggrega import --sync` brings an earlier
  import's drafts up to date with a changed source, changing only what the
  import wrote. Where the source changed a part you edited, it stops and names
  the part rather than writing over your edit.

## What it does not do

An import drafts what the source states, and leaves the rest to you. Each
draft says, in comments where the missing piece belongs, what the source could
not supply.

- **It does not decide what your source cannot state.** The environment a
  Release deploys to, the image a platform runs, an administrator's password,
  and which of several Recipes realizes a component are left for you, each
  named in a comment in the draft or in a warning the import prints.
- **It does not read code.** A flow's or a project's own program is not read: a
  CrewAI crew's program, a LangGraph application's graph code, a Langflow
  component's source beyond carrying it inside the flow.
- **It does not judge what a value means.** Each node or service is weighed
  against the Components of your workspace's catalog — their names, their
  categories, their labels and the names of the values they declare. A match is
  a suggestion with a score, written as a comment in the draft; by default the
  import references no catalog Component a node merely resembles, and you
  choose.
- **It does not move credentials out of your source for you.** A value that can
  carry a key — an environment value, a header, an MCP server's command line —
  is carried into the draft as written by default, and the import names each
  one in a `credential-carried` warning, never by its value. The importer's
  `empty_credentials` setting writes them empty instead
  ([Settings](../../language-reference/plugins/core-importers.md#settings)).
  Read the warnings before you share a draft.
- **It does not deploy or run anything.** It reads the source and your catalog,
  and writes files. Building the drafts, and running what the build writes, are
  separate steps you take.

## How an import runs

1. **Start from a workspace.** An import writes its drafts beneath the root of
   the workspace it runs in — the folder holding an `.aggrega-config.yaml` with a
   `workspace` key — or beneath the directory `--output-dir` names. It never
   writes over an Aggregate already there.
2. **Give it a catalog to weigh against.** The import scores your source against
   the Components of the workspace's own catalog — the directories
   `catalog_dirs` lists, a `catalog` folder at the workspace root, or the
   directories `AGGREGA_CATALOG_DIRS` names — and nothing else. With a checkout
   of the standard-library catalog among them, a PostgreSQL service is
   suggested as `core/datastore/postgres`, and `--target` can draft a Manifest
   from the catalog's Recipes. With no catalog, the import has nothing to
   suggest, and `--target` is refused, since no Recipe binds to the target.
3. **Run the import.** Name the file or the directory:

   ```bash
   aggrega import compose.yaml --target compose
   ```

   The format is recognised from the file's name and contents; `--format` names
   it where it is not. `--target` names a provider capability, such as
   `compose` or `helm`, and drafts a Manifest mapping each component type to
   the Recipe of that capability your catalog offers for it, where it offers
   exactly one. On standard error the import names the format it read, each
   warning, and one line for each node it mapped; on standard output it lists
   the files it wrote.
4. **Review the drafts.** Read the comments the import wrote and the warnings it
   printed. The walkthroughs below show what a review typically changes.
5. **Validate and build.** In the folder holding the drafts:

   ```bash
   aggrega validate --release release.yaml
   aggrega build --release release.yaml --auto-pull
   ```

   Each refusal names what to add and where. When both pass, the build has
   written the target's files under `dist/`.

Beside its drafts, the import writes `.aggrega-import.json`, the record of what
it wrote. Keep it for as long as you mean to run `aggrega import --sync`, which
reads it to tell your edits from its own.

## Where the importers come from

Each format is read by an importer plugin. The compiler's core importers, one
for each format in the table below, are published with every compiler release and serve their formats in every
workspace, with no entry in your catalog. The first import that needs one
fetches it from the workspace's default registry, at the compiler's own
version, verifies it and keeps it in the workspace's content cache, so every
later import reads it from there and reaches no network. Where the registry
asks for credentials, the import stops and names `aggrega login`. Where the
module cannot be fetched at all — the workspace is offline, say — the import
stops and names the two ways to put it on the machine.
[Core importers](../../language-reference/plugins/core-importers.md) describes
each importer in full, and the settings an importer is given through a
`plugins.importer` entry.

## The formats

| Format | What it reads | Walkthrough or reference |
|---|---|---|
| Compose | a Compose file and its override file, or a directory holding them | [Import a Compose project](compose.md) |
| MCP client configurations | `.mcp.json`, `claude_desktop_config.json`, `.vscode/mcp.json`, `.cursor/mcp.json`, or an MCP registry `server.json` | [Import an MCP client configuration](mcp.md) |
| Langflow | a flow exported from Langflow, as JSON | [Import a Langflow flow](langflow.md) |
| Flowise | a chatflow or an agentflow exported from Flowise, as JSON | [Import a Flowise chatflow](flowise.md) |
| n8n | a workflow exported from n8n, as JSON | [Import an n8n workflow](n8n.md) |
| Dify | an application exported from Dify in its DSL, as YAML | [Import a Dify application](dify.md) |
| CrewAI | a CrewAI project's agent and task declarations | [Import a CrewAI project](crewai.md) |
| LangGraph | a LangGraph application's `langgraph.json` | [The LangGraph importer](../../language-reference/plugins/core-importers.md#the-langgraph-importer) |
| Google ADK | the Agent Config files of an application built on Google ADK, from `root_agent.yaml` | [The Google ADK importer](../../language-reference/plugins/core-importers.md#the-google-adk-importer) |
| Microsoft Agent Framework | a declarative agent, a YAML document of kind `Prompt` | [The Agent Framework importer](../../language-reference/plugins/core-importers.md#the-agent-framework-importer) |

[aggrega import](../../language-reference/cli/aggrega-import.md) is the
command's full reference: every flag, how a source is recognised, what
`--sync` changes and what it refuses.
