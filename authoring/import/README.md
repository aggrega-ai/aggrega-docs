# Import

`aggrega import` reads a project written in another format — a flow exported
from Langflow, an MCP client's configuration, a Compose file, and the other
formats listed below — and writes Aggrega files from it: an Aggregate, a
Release, and, for the target `--target` names, a Manifest. Together they are a
workspace that validates and builds as written, once the few values no source
can hold are answered: the import asks for each of them once and keeps the
answers in an answers file. It deploys nothing and
reaches no cluster or cloud account. The drafts are plain files in your
workspace, and what happens to them next is up to you.

<!-- The home page at aggrega.ai draws this diagram too, from its own content: a label changed here is changed there. -->
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
  Aggregate, Release and Manifest are the same kind of files you would write
  yourself. They build for the target the import names as they are written,
  and every governance policy your workspace attaches judges that build like
  any other.
- **What the source states is carried over.** A node or service the catalog
  holds a strong match for references that catalog Component, with the values
  the source gives it, such as the model a flow names. A platform the source
  runs on is drafted with the image the catalog's Recipes for it run. A secret
  is drafted as a reference to where it comes from, never as its value.
- **You are asked only for what no source can hold**, once. The answers are
  kept in an answers file beside the source, so the next import of the same
  source asks nothing.
- **The drafts are yours.** They are plain YAML in your workspace, with nothing
  left behind that the build depends on. Edit them, rename them, commit them.
- **The draft can follow its source.** `aggrega import --sync` brings an earlier
  import's drafts up to date with a changed source, changing only what the
  import wrote. Where the source changed a part you edited, it stops and names
  the part rather than writing over your edit.

## What it does not do

An import drafts what the source states and what your catalog determines, and
asks for the rest. Each draft says, in a comment beside the value, where a
value it drafted came from.

- **It does not guess what your source cannot state.** No source names the
  environment a Release deploys to, so the drafted Release names
  `development`, with a comment saying it is a default to change. A value the
  catalog requires and no source holds — an owner account's email, the image
  of an application built from your own code, the name of a Kubernetes Secret —
  is drafted empty and asked for, as
  [How an import runs](#how-an-import-runs) below describes.
- **It does not read code.** A flow's or a project's own program is not read: a
  CrewAI crew's program, a LangGraph application's graph code, a Langflow
  component's source beyond carrying it inside the flow.
- **It does not judge what a value means.** Each node or service is weighed
  against the Components of your workspace's catalog — their names, their
  categories, their labels and the names of the values they declare. A match
  in the high tier is referenced in the draft; a weaker one is written as a
  comment naming the Component and its score, for you to choose.
- **It does not change the version a platform runs to follow the source.** A
  platform's image is drafted at the version the catalog's Recipes for it are
  known to run, and where the source names another version, a comment beside
  the image names it.
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
2. **The catalog it weighs against.** The import scores your source against
   the Components of the workspace's catalog, and nothing else. Where the
   workspace names no catalog folder of its own, that is the standard-library
   catalog, read from the workspace's default registry: every publish of the
   catalog publishes a signed snapshot of the whole of it, and the first import
   fetches that snapshot, verifies its signature, keeps it in the workspace's
   content cache and names it by its digest in the record it writes beside the
   drafts, so a later import of the same drafts reads the same catalog without
   asking the registry again. Against it, a PostgreSQL service is matched to
   `core/datastore/postgres`, and `--target` drafts a Manifest from the
   catalog's Recipes. With no catalog, the import has nothing to match, and
   `--target` is refused, since no Recipe binds to the target.

   A workspace that names its own catalog folders imports against those
   instead, and fetches no snapshot: the directories `workspace.catalog_dirs`
   lists, a `catalog` folder at the workspace root, or the directories
   `AGGREGA_CATALOG_DIRS` names. The standard-library catalog's own files are
   the `aggrega-catalog` folder of the `aggrega-hub` repository,
   <https://github.com/aggrega-ai/aggrega-hub>, for a workspace that wants them
   as a folder. `--upgrade` fetches the newest snapshot the registry publishes
   and imports against it from then on; under `--offline`, an import that would
   have to fetch a snapshot stops and names what to run.

3. **Run the import.** Name the file or the directory:

   ```bash
   aggrega import compose.yaml --target compose
   ```

   The format is recognised from the file's name and contents; `--format` names
   it where it is not. `--target` names a provider capability, such as
   `compose` or `helm`, and drafts a Manifest mapping each component type and
   feature type the drafts need to the Recipe of that capability your catalog
   offers for it: the one there is, or, among several, the one named after the
   type. The drafted Release names that Manifest, and what the drafts carry
   follows the target: on `compose` a secret is a variable reference Docker
   Compose fills from your shell, on `helm` the name of a Kubernetes Secret.
   On standard error the import names the format it read, each warning, and
   one line for each node it mapped; on standard output it lists the files it
   wrote.
4. **Answer what no source holds.** A value the catalog requires that no source
   can hold — an owner account's email, the image of an application built from
   your own code, the name of a Kubernetes Secret — is answered once. The
   import reads the answers from `import-answers.yaml` beside the source, or
   from the file `--answers` names; at a terminal it asks for each value still
   missing, one question at a time, and writes your answers into that file. A
   secret is answered with where it comes from — a variable or a Secret's
   name — never with its value. Where nothing can be asked — in continuous
   integration, through a pipe, from the assistant or the editor — the import
   writes the answers file with each missing value's key and an empty answer,
   lists them, and exits with status 1; fill them in and run the import again.
   One answers file serves every target: an answer the drafts for one target do
   not need is kept in the file and left unused.
   [The import answers file](../../language-reference/import-answers.md)
   describes the file in full.
5. **The import pulls what the build needs.** Once nothing is missing, the
   import pulls the drafted Release's dependencies, as `aggrega pull` does, and
   writes `release.lock` beside it. Under `--offline` it pulls nothing and names
   the `aggrega pull` command to run.
6. **Validate and build.** In the folder holding the drafts:

   ```bash
   aggrega validate --release release.yaml
   aggrega build --release release.yaml
   ```

   When both pass, the build has written the target's files under `dist/`. A
   refusal names what to change and where, in the document you change.
7. **Run what the build wrote.** A build for Docker Compose writes
   `dist/compose/docker-compose.yaml`, and the file names no Compose project,
   so name one with `-p`:

   ```bash
   docker compose -p <name> -f dist/compose/docker-compose.yaml up -d
   ```

   Without `-p`, Docker Compose names the project after the folder holding the
   file, `compose`, so two workspaces started that way share one project. The
   services sit on one network, which Docker Compose names after the project,
   `<name>_compose`. A service the build publishes no port for is reached from
   inside it, with
   `docker compose -p <name> -f dist/compose/docker-compose.yaml exec <service> …`,
   or from a container you
   start on that network with `docker run --network <name>_compose …`. A
   walkthrough's "Run it" and "Test it" sections show the commands for its own
   build.

   A run answers without an OpenAI key once its `core/ai-model/openai` model
   points at a small model served by Ollama in the same project, with three
   changes to the drafted files, a build with `--auto-pull`, which pulls what
   the added component needs, and one command once the stack runs:

   - in the Aggregate, one more component, wired to nothing: `local-model`, of
     type `core/ai-model/ollama`, with `model: qwen2.5:0.5b` in its `values`;
   - in the Manifest, its Compose Recipe: `core/ai-model/ollama: compose/ollama`;
   - in the Release, `local-model: {}`, and the OpenAI model's `endpoint`, under
     its `infra`, set to that server's OpenAI-compatible address,
     `http://local-model:11434/v1`;
   - once the stack runs, the pulled model copied under the model name the
     build's OpenAI model names, `<model>`, such as `gpt-4o-mini` or `gpt-4.1`:
     `docker compose -p <name> -f dist/compose/docker-compose.yaml exec local-model ollama cp qwen2.5:0.5b <model>`.

   `OPENAI_API_KEY` may then hold any non-empty value of your own: the local
   server checks none. An n8n workflow reads the model's address and key from
   the credential its model node selects, not from the address `endpoint`
   delivers, so give that credential the server's address too, as a `url`
   beside `apiKey` in its `data`. The Ollama server
   `core/ai-model/ollama` runs by default serves OpenAI's Responses API as well
   as Chat Completions, so an Agent Framework declarative agent that names
   `apiType: Responses` reaches it as written.

   A build for Kubernetes, the `helm` target, writes plain manifests rather
   than a chart, as the [helm provider](../../language-reference/providers/helm.md)
   describes: under `dist/helm/`, or, for the components a Release places in a
   boundary, under `dist/boundaries/<boundary>/helm/`, some of them in a folder
   of their own beneath. Files that name no namespace, as the MCP and Dify
   builds' do, go to the one your `kubectl` context names, or to `default`
   where it names none; create the Secrets they read there first, then apply
   the folder:

   ```bash
   kubectl apply -R -f dist/helm/
   ```

   `-R` reaches the files in those folders. A `ClusterIP` Service, the kind the
   MCP and Dify builds give the servers they run, is reachable from inside the
   cluster only: reach one from your machine by forwarding a local port to it,
   with
   `kubectl port-forward svc/<service> <local port>:<port>`, which runs until
   you stop it.

Beside its drafts, the import writes `.aggrega-import.json`, the record of what
it wrote. Keep it for as long as you mean to run `aggrega import --sync`, which
reads it to tell your edits from its own. Keep the answers file too: it holds no
secret, so it can live in version control beside the source, and every later
import of that source reads it.

## With an AI assistant

An AI assistant [set up with Aggrega's tools](../../ai-assistants/set-up.md)
can do the same: paste this prompt into it.

<!-- copyable -->

> Import my project into Aggrega with the `import` tool: the source is `compose.yaml` in this folder, and the target is `compose`. If the import says values are still owed, tell me each one and what it is, and wait while I write my answers beside their keys in the answers file it names; then import again. Then validate the Release the import drafted with the `validate` tool, build it with the `build` tool, writing the files into `dist/`, and tell me which files the build wrote.

## Where the importers come from

Each format is read by an importer plugin. The compiler's core importers, one
for each format in the table below, are published with every compiler release and serve their formats in every
workspace, with no entry in your catalog. The first import that needs one
fetches it from the workspace's default registry, at the compiler's own
version, verifies it and keeps it in the workspace's content cache, so every
later import reads it from there, with no network for it. Where the module
cannot be fetched at all — the workspace is offline, say — the import stops and
names the two ways to put it on the machine.
[Core importers](../../language-reference/plugins/core-importers.md) describes
each importer in full, and the settings an importer is given through a
`plugins.importer` entry.

## The formats

| Format | What it reads | Walkthrough |
|---|---|---|
| Compose | a Compose file and its override file, or a directory holding them | [Import a Compose project](compose.md) |
| MCP client configurations | `.mcp.json`, `claude_desktop_config.json`, `.vscode/mcp.json`, `.cursor/mcp.json`, or an MCP registry `server.json` | [Import an MCP client configuration](mcp.md) |
| Langflow | a flow exported from Langflow, as JSON | [Import a Langflow flow](langflow.md) |
| Flowise | a chatflow or an agentflow exported from Flowise, as JSON | [Import a Flowise chatflow](flowise.md) |
| n8n | a workflow exported from n8n, as JSON | [Import an n8n workflow](n8n.md) |
| Dify | an application exported from Dify in its DSL, as YAML | [Import a Dify application](dify.md) |
| CrewAI | a CrewAI project's agent and task declarations | [Import a CrewAI project](crewai.md) |
| LangGraph | a LangGraph application's `langgraph.json` | [Import a LangGraph application](langgraph.md) |
| Google ADK | the Agent Config files of an application built on Google ADK, from `root_agent.yaml` | [Import a Google ADK agent](google-adk.md) |
| Microsoft Agent Framework | a declarative agent, a YAML document of kind `Prompt` | [Import a Microsoft Agent Framework declarative agent](agent-framework.md) |

[aggrega import](../../language-reference/cli/aggrega-import.md) is the
command's full reference: every flag, how a source is recognised, what
`--sync` changes and what it refuses.
[The import answers file](../../language-reference/import-answers.md) describes
the answers file: where it lives, what it holds, and how a secret is answered.
