# Core importers

The compiler's repository builds importer plugins of its own, one for each source format, and
publishes them with every compiler release:

| Plugin | Serves | Reads |
| --- | --- | --- |
| `importer/langflow` | `import:langflow` | a flow exported from Langflow, as JSON |
| `importer/flowise` | `import:flowise` | a chatflow or an agentflow exported from Flowise, as JSON |
| `importer/n8n` | `import:n8n` | a workflow exported from n8n, as JSON |
| `importer/mcp` | `import:mcp` | an MCP client's configuration — `.mcp.json`, `claude_desktop_config.json`, `.vscode/mcp.json` or `.cursor/mcp.json` — or an MCP registry server description, `server.json`, as JSON |
| `importer/compose` | `import:compose` | a Compose application — `compose.yaml`, `docker-compose.yml` and their override files — as YAML |
| `importer/dify` | `import:dify` | an application exported from Dify in its DSL, as YAML |
| `importer/crewai` | `import:crewai` | the agents and tasks a CrewAI project declares — `config/agents.yaml` and `config/tasks.yaml`, as YAML, or `crew.jsonc` and `agents/<name>.jsonc`, or their strict-JSON spellings `crew.json` and `agents/<name>.json`, as JSON with comments |
| `importer/langgraph` | `import:langgraph` | a LangGraph application's configuration, `langgraph.json`, as JSON, and, of an environment file the configuration names, the variables' names alone, where the import is handed that file under `with.sources` |
| `importer/google-adk` | `import:google-adk` | the agents declared in the Agent Config files of an application built on Google ADK — `root_agent.yaml` and the configurations its sub-agents name — as YAML |
| `importer/agent-framework` | `import:agent-framework` | a Microsoft Agent Framework declarative agent, a document of kind `Prompt` under any name, as YAML |
| `importer/cloudformation-schema` | `import:cloudformation-schema` | a CloudFormation resource type — a provider schema file, or the output of `aws cloudformation describe-type` — as JSON, drafting a Component and a Recipe for the `cloudformation` provider |
| `importer/terraform-schema` | `import:terraform-schema` | a Terraform or OpenTofu provider schema, the output of `terraform providers schema -json`, as JSON, drafting a Component and a Recipe for the `terraform` provider |
| `importer/arm-schema` | `import:arm-schema` | an Azure resource provider's Bicep type file, `types.json`, as JSON, drafting a Component and a Recipe for the `arm` provider |

Each is built from the compiler's own sources and stamped with the compiler's version, so the
importers released with the compiler at `X.Y.Z` report version `X.Y.Z`, and their Plugin entities
record it. Unlike the plugins listed on [Embedded plugins](embedded-plugins.md), none is compiled
into the binary. The binary carries each one's Plugin entity and the digest of the one module it
accepts for it, so each serves its format in every workspace, with no entry in its catalog.

They are built on the Go kit's importer package, `github.com/aggrega-ai/aggrega-pdk/go/pkg/importer`.
For the Langflow, Flowise and n8n importers, everything an importer does whatever its format — scoring
the workspace catalog's Components against each node, deciding whether to reference one or draft a
new one, laying the draft out, carrying the credential values it holds or writing them empty as a
setting asks, writing the drafts and reading the settings below — is that package's,
and only reading the format, and knowing the platform its flows run on, is particular to each
importer. The MCP importer drafts an instance of one Component per server, so it scores nothing; it
shares the package's reading of the settings it reads, its decision over credential values and the
conventions its drafts are named and described by, as [The MCP importer](#the-mcp-importer)
describes. The Compose importer decides each service it matches as the flow importers decide a node,
through the same package, renders its drafts as they do, and shares the rest as the MCP importer
does, as [The Compose importer](#the-compose-importer) describes. The Dify importer drafts the Dify
installation the standard library assembles, carrying the application, through the same package's
platform draft in the form it takes for a platform that is a whole installation, as
[The Dify importer](#the-dify-importer) describes. The CrewAI importer drafts an instance of the
standard library's CrewAI agent per agent a project declares, wired to the model it names, and shares
the rest as the MCP importer does, as [The CrewAI importer](#the-crewai-importer) describes. The LangGraph
importer drafts an instance of the standard library's LangGraph agent per graph an application's
configuration declares, wired to the datastore its checkpointer keeps state in, and shares the rest as
the MCP importer does, as [The LangGraph importer](#the-langgraph-importer) describes. The Google ADK
importer drafts an instance of the standard library's ADK agent per agent tree an application's
configurations declare, wired to the model the tree names where ADK sends its requests to the Gemini
API, and shares the rest as the MCP importer does, as [The Google ADK importer](#the-google-adk-importer) describes. The Agent Framework
importer drafts an instance of the standard library's Agent Framework agent per declarative agent,
wired to the OpenAI model it names — each MCP server it names written in comments, since the model's
provider reaches it as a hosted tool — and shares the rest as the MCP importer does, as
[The Agent Framework importer](#the-agent-framework-importer) describes. The three
resource-schema importers read a vendor's description of a resource type rather than a project, and
draft a Component and a Recipe for it through the same package, as
[The resource-schema importers](#the-resource-schema-importers) describes. How the
importer socket works, and
what it is handed, is described under
[The importer socket](plugin-contract.md#the-importer-socket--draft-authoring-output).

This page is the reference for what each importer reads and drafts. To import a project of your own
and build the result, start at [Import](../../authoring/import/README.md), which walks a project from
its source to a build, one format at a time.

## How an import obtains one

[`aggrega import`](../cli/aggrega-import.md), the editor session's `aggrega/import` method and the
assistant's `import` tool obtain a core importer the same way. Where the machine already holds its
module — in the workspace's content cache — the import reads it from there, with no network for it.
Where it does not, the first import that needs it fetches it from the workspace's default registry,
at the compiler's version, and:

- holds it to the digest the binary carries, so only the module the compiler's release published
  runs;
- verifies it as a pull verifies a plugin it fetches — its signature under that registry's trust
  policy, and the host functions it uses against the ones its Plugin entity records;
- keeps it in the workspace's content cache, which is the only thing written for it: no lockfile, and
  no record of trusted plugins, because an import pins no importer.

Every later import reads it from the content cache. A module that does not verify is refused, and
nothing is kept. In a folder no workspace marks there is no content cache to keep it in, so the fetch
is refused there, naming the folder and how to name a workspace or make the folder one. The module
is never read from beside a Plugin entity of the same name at another version in a catalog folder:
that module belongs to the other entity.

Where the module cannot be fetched, the import stops under
[A plugin's `.wasm` is not on this machine](../errors/fatal-halts.md#a-plugins-wasm-is-not-on-this-machine),
naming the importer and its version, and says what puts its module on the machine:

- **Run the import once with the network available**, where the workspace is offline or its registry
  could not be reached. That run fetches it and every later run is offline.
- **Place its module beside a Plugin entity of that importer at that version in a catalog folder**,
  under the name the message gives — `importer--langflow.wasm` for the Langflow importer. A catalog
  entity at the same name and version as a core importer runs in its place, with its module read from
  beside it; an entity there with no module beside it does not, and the core importer is obtained as
  above. Where the registry does not hold the module, or the workspace names no default registry,
  this is the one remedy the message gives.

## Which one runs beside your own importers

The core importers are candidates beside the importers your workspace's catalog holds, under the
rules every importer is selected by, which
[Which importer turns a source into drafts](../cli/configuration.md#which-importer-turns-a-source-into-drafts)
sets out:

- Within one name, the highest version runs, or the version a `plugins.importer` entry names.
- Where your catalog holds an importer of another name for `langflow`, `flowise`, `n8n`, `mcp`, `compose`, `dify`, `crewai`, `langgraph`, `google-adk`, `agent-framework`, `cloudformation-schema`, `terraform-schema` or `arm-schema`, two importers
  advertise the format, and an import that attaches neither is refused naming both, under
  [A parse or import format is advertised by more than one plugin](../errors/fatal-halts.md#a-parse-or-import-format-is-advertised-by-more-than-one-plugin).
  A `plugins.importer` entry naming the one you want settles it.
- An importer your catalog holds at the same name and version as a core importer, with its module
  beside its entity, is the one that runs, read from there.
- A Plugin entity of a core importer's name with no module beside it in its catalog folder — a
  checkout of a catalog that records the importers a release published, say — is one no import
  could run, since its module is read from nowhere else, so it is not a candidate to run, though
  the signatures it records still take part in recognising a source. At the compiler's own version
  the core importer runs in its place. At any other version, older or newer, it is passed over, and
  the choice is made among the importers that can run — unless a `plugins.importer` entry names
  exactly that version, or no importer of that name that can run advertises the format asked for,
  as when the entity records a format the compiler's own importer does not. Then it stays a
  candidate under the rules above, and an import that chooses it stops naming the folder its module
  goes in.

Whichever of your catalog's own importers is chosen, its module is read from beside its own entity,
at its own version: a module laid beside an entity of the same name at another version belongs to
that entity.

## How a source is recognised

An import that does not name its format with `--format` is recognised by the signatures each importer
declares:

- **Langflow** — a source that parses as JSON and carries an array at `data.nodes`.
- **Flowise** — a source that parses as JSON, carries arrays at `nodes` and `edges`, and carries
  nothing at `data.nodes`.
- **n8n** — a source that parses as JSON, carries an array at `nodes` and an object at
  `connections`, and carries nothing at `edges` or at `data.nodes`.
- **MCP** — a source that parses as JSON, is named `.mcp.json`, `claude_desktop_config.json` or
  `.cursor/mcp.json` and carries an object at `mcpServers`; a source that parses as JSON with comments,
  as Visual Studio Code reads it, is named `.vscode/mcp.json` and carries an object at `servers`; or a
  source of any name that parses as JSON and whose `$schema` is a text opening with
  `https://static.modelcontextprotocol.io/schemas/`, a registry server description. A name is matched
  against the end of the path the import is handed, so `project/.vscode/mcp.json` is recognised, while
  `mcp.json` handed from inside `.vscode`, or a client's file under any other name, is imported by
  naming `--format mcp`.
- **Compose** — a source that parses as YAML, is named as Compose reads a Compose file or its override
  file by default — `compose.yaml`, `compose.yml`, `docker-compose.yml`, `docker-compose.yaml`,
  `compose.override.yml`, `compose.override.yaml`, `docker-compose.override.yml` or
  `docker-compose.override.yaml` — and carries an object at `services`. A Compose file under any other
  name is imported by naming `--format compose`.
- **Dify** — a source of any name that parses as YAML, carries the text `app` at `kind`, and carries
  something at `app.mode` and at `version`, as every application Dify exports does.
- **CrewAI** — a source named `config/agents.yaml` or `config/tasks.yaml` that parses as YAML, a
  source named `crew.jsonc` or `crew.json` that parses as JSON with comments and carries a list at
  `agents`, or a source named `agents/<name>.jsonc` or `agents/<name>.json` that parses as JSON with
  comments and carries something at `role`. A classic project keys its agents and its tasks by names of its author's choosing, so its
  two files are told by their names alone.
- **LangGraph** — a source named `langgraph.json` that parses as JSON and carries an object at `graphs`;
  or a source of any name that parses as JSON, carries an object at `graphs` and whose `$schema` is the
  text `https://langgra.ph/schema.json`, the schema LangGraph publishes for its configuration. A
  configuration under another name naming no schema is imported by naming `--format langgraph`. No
  importer's signature names an environment file, so recognising a directory opens none.
- **Google ADK** — a source named `root_agent.yaml` that parses as YAML and carries something at `name`
  and at `instruction`, as an LlmAgent's configuration does, or a text at `agent_class` and something at
  `name`, as any other agent's does. A configuration under another name is imported by naming
  `--format google-adk`. No signature names a sub-agent's configuration, which may be called anything,
  so recognising a directory opens no YAML file but `root_agent.yaml`.
- **Agent Framework** — a source of any name that parses as YAML, carries the text `Prompt` at `kind`
  and an object at `model`, as a declarative agent naming its model does; Agent Framework loads a
  declarative agent from whatever file its application names, so the signature names no file. A
  declarative agent naming no model, or writing its kind in another letter case or as `Agent`, is
  imported by naming `--format agent-framework`.

- **CloudFormation resource types** — a source of any `.json` name that parses as JSON and carries a text
  at `typeName` and an object at `properties`, a provider schema; or a text at `TypeName` and a text at
  `Schema`, the output of `aws cloudformation describe-type`.
- **Terraform provider schemas** — a source of any `.json` name that parses as JSON and carries a text
  at `format_version` and an object at `provider_schemas`.
- **Azure Bicep types** — a source named `types.json` that parses as JSON and carries a text at `0.$type`,
  the first entry of a Bicep type file.

A source matching two of them is refused naming both formats, and is imported by naming the one with
`--format`. The Langflow, Flowise, n8n, LangGraph and resource-schema importers read their source
through the parser that serves `parse:json`, the MCP importer a configuration listing its servers under
`servers` through the one that serves `parse:jsonc` and every other source through the one that serves
`parse:json`, the Compose, Dify, Google ADK and Agent Framework importers through the one that serves `parse:yaml`, and the
CrewAI importer a classic project's files through the one that serves `parse:yaml` and the others
through the one that serves `parse:jsonc`: the one your
workspace's catalog serves, where it serves one, and otherwise the parser the compiler itself carries
for that syntax (see [Embedded plugins](embedded-plugins.md)). So an import through any of them needs
no parser in your catalog, and nothing is fetched for one. A parser your catalog does serve is the one
used, and the compiler's plays no part. The Langflow, Flowise, n8n, Dify and Agent Framework importers
declare no file pattern, so each reads one file and an import of a directory through any of them is
refused; the MCP
importer declares the four client file names, so a directory is read through the client
configurations it holds; the Compose importer declares the eight Compose file names, so a
directory is read through the Compose files it holds; the CrewAI importer declares the six
names of a project's declarations, so a project's directory is read through its declarations and
nothing else; the LangGraph importer declares `langgraph.json`, so an application's directory is
read through its configuration alone, and neither its code nor an environment file is ever read; and
the Google ADK importer declares `root_agent.yaml`, so an application's directory is read through its
root configuration alone — the configurations its sub-agents name reaching the importer only under
its attachment's `with.sources` — and neither its code nor its environment file is ever read; and the
resource-schema importers declare `*.json`, and `types.json` for Azure, so a directory is read through
every file of that pattern it holds, at any depth, and no other. A
signature naming no file — the Langflow,
Flowise and n8n importers', the MCP importer's for a registry server description, the LangGraph
importer's for a configuration naming its schema, the Dify importer's and the Agent Framework importer's — applies to every file imported on its own: an import naming no format reads such a file
as JSON, and as YAML, to try them, whatever importer it is meant for, through those same parsers —
the compiler carries both, so nothing is fetched for either. A file holding a comment or a trailing comma does
not parse as JSON, so no signature reading JSON recognises it; the CrewAI importer's signatures for
`crew.jsonc`, `agents/<name>.jsonc` and their `.json` spellings, and the MCP importer's for
`.vscode/mcp.json`, read JSON with comments, through the parser the compiler carries for that syntax
where your catalog serves none.

A source its parser refuses — for the Langflow, Flowise, n8n, LangGraph and resource-schema importers one that is not
JSON, for the MCP importer one that is not JSON with comments or, unless it lists its servers under
`servers`, not JSON, for the Compose, Dify and Agent Framework importers one that
is not YAML, for the CrewAI importer a declaration that is not YAML or not JSON with comments, and for
the Google ADK importer a configuration that is not YAML —
stops the import under
`parse-failed`, whose message carries the parser's own reason. Naming the format does not change that:
the importer asks for the source's tree, and the parser's refusal is the answer it gets.

## How a draft is named

Every importer but the resource-schema importers, which draft no Aggregate and name a Component and a
Recipe as [What is drafted](#what-is-drafted) describes, names the Aggregate it drafts, and the Release
beside it where it drafts one, `<target_namespace>/<name>`. The first part is the [`target_namespace` setting](#settings), `imported`
unless you set another. `<name>` is the first of these that is not empty:

- the name the source gives itself, in the field its format declares it in:

  | Importer | The name it reads |
  | --- | --- |
  | `importer/langflow` | the flow's `name` |
  | `importer/flowise` | none: an export carries no name of its own |
  | `importer/n8n` | the workflow's `name` |
  | `importer/mcp` | a registry server description's `name`; a client's configuration carries none |
  | `importer/compose` | the project's top-level `name`, an override file's in place of the one it overrides, as Compose merges them |
  | `importer/dify` | the application's `name`, under `app` |
  | `importer/crewai` | the crew's `name` in `crew.jsonc` or `crew.json`; `config/agents.yaml` and `config/tasks.yaml` carry none, since a classic project names its crew in its program |
  | `importer/langgraph` | the id of the graph the configuration declares, since a configuration carries no name of its own |
  | `importer/google-adk` | the root agent's `name` |
  | `importer/agent-framework` | the agent's `name`; its `displayName` is not read |

- the name of the directory the import was handed, whole — `my.project` keeps its full stop, written
  `my-project` — as Compose names a project after the directory holding it; `aggrega import .` names
  the directory it runs in;
- the name of the file the import was handed on its own, without its extension;
- `flow`.

A draft made from several sources — several Compose projects, configurations, agent trees or
servers, or a configuration declaring several graphs — takes their name only where every one of them
names itself and all of them are written alike; otherwise it takes the next. A name is written in
lowercase, each run of characters other than the ASCII letters and digits as one hyphen, the hyphens
at either end dropped: `Basic Prompting` is written `basic-prompting`, and `SupportAgent`
`supportagent`. The same source is named the same way on every import. A Manifest an import drafts
for a target takes the Release's name, or the Aggregate's where no Release is drafted, as
[What a target adds](#what-a-target-adds) describes.

## What the Langflow importer reads

- The nodes and edges under the flow's top-level `data` object, `data.nodes` and `data.edges`.
- For each node, its type from the node's `data.type`, and its fields from the entries of
  `data.node.template` whose value is an object carrying a `type`. The template's other entries are
  not fields.
- A field whose object carries `password: true` is drafted as a credential slot, and every other
  field as a value field. The field's name plays no part, and drafting a node as a Component reads
  no field's value.
- A note pinned to the canvas, a node of type `noteNode`, is not imported, and an edge to a node that
  is not imported is dropped.
- Drafting the platform that carries the flow also reads, off the flow: its top-level `id`; the value
  of each field marked `password: true`; an MCP Tools node's `mcp_server` field — the MCP server it
  names, and that server's configuration — or the fields it keeps its server in instead; each input
  Langflow marks as no credential that can carry one, as
  [Credential values the flow holds](#credential-values-the-flow-holds) lists them; the field a
  node names its model in, and the model provider it runs on; and the fields through which a node
  reaches a part's address and key, which it rewrites.
  [What they draft](#what-they-draft) says what becomes of each.

## What the Flowise importer reads

- The nodes and edges at the top level of the flow, `nodes` and `edges`.
- For each node, its type from the node's `data.name`; its credential slots from the entries of
  `data.inputParams` whose `type` is `credential`, by their `name`; and its value fields from the keys
  of `data.inputs`, less the ones `data.inputAnchors` names — where another node connects in, which
  the edge between them records — and less the credentials.
- Drafting a node as a Component reads no field's value, and a credential's name plays no part in
  its being one.
- A note pinned to the canvas, a node of type `stickyNote`, is not imported, and an edge to a node that
  is not imported is dropped.
- Drafting the platform that carries the chatflow also reads, off it: its top-level `id`, where it is
  a UUID; the credential a node keeps at `data.credential`; the value of each input its `inputParams`
  declare of type `password`; `FLOWISE_CREDENTIAL_ID` among a node's inputs, and `credential` or
  `FLOWISE_CREDENTIAL_ID` inside a configuration object at any depth of them; the server
  configuration in a node's `mcpServerConfig` input; each input Flowise marks as no credential that
  can carry one, as [Credential values the flow holds](#credential-values-the-flow-holds) lists
  them, and the member an agentflow's configuration names the model or the tool it selects in; a
  node's `modelName` input; and an OpenAI node's Base Path, its `basepath` input.
  [What they draft](#what-they-draft) says what becomes of each.

## What the n8n importer reads

- The workflow's `nodes` and its `connections`, at the top level of the export.
- For each node, its `name`, which identifies it — n8n's connections name the nodes they join by
  name, and a workflow's node names are unique — and its `type`, written whole, with its package:
  `@n8n/n8n-nodes-langchain.lmChatOpenAi`, say, or `n8n-nodes-base.httpRequest`. A node with no name
  is identified by its `id`.
- Each connection the workflow lists is one edge, from the node it leaves to the node it enters,
  whatever its type: a `main` connection carries data from one node to the next, and an AI connection
  — `ai_languageModel`, `ai_tool`, `ai_vectorStore`, `ai_embedding`, `ai_memory` and the others —
  hands the node it enters the model, tool, store or memory the node it leaves stands for. Either way
  the node a connection enters consumes the node it leaves.
- Each credential type a node's `credentials` names, and each top-level parameter n8n marks as a
  password, is drafted as a credential slot; each other top-level parameter of the node is a value
  field. Drafting
  a node as a Component reads no field's value.
- A note pinned to the canvas, a node of type `n8n-nodes-base.stickyNote`, is not imported, and a
  connection to a node that is not imported is dropped.
- Drafting the platform that carries the workflow also reads, off it: its top-level `id`; each
  credential a node selects; each parameter n8n marks as a password; the address an MCP client node
  calls; the headers and query parameters a node sends with a request the workflow composes, as
  [Credential values the flow holds](#credential-values-the-flow-holds) lists them; and the
  parameter a model node names its model in. [What they draft](#what-they-draft) says what becomes of
  each.

## What they draft

Each node is weighed against the Components of the workspace's own catalog and nothing else, as the
[importer socket](plugin-contract.md#the-importer-socket--draft-authoring-output) describes, and each
importer carries a short table mapping common node types of its format — chat and embedding models,
retrieval, HTTP requests and, on Langflow, the MCP Tools node `MCPTools`, which maps to
`core/ai-tool/mcp` — to standard-library Components. Langflow's table also maps its Language Model
component, `LanguageModelComponent`, the chat model its starter flows call, to `core/ai-model/openai`,
the model the Langflow platform's model connection serves: the node runs on the model provider its
`provider` field names, OpenAI by default, and a node naming another provider is never wired to that
connection, as [Which nodes become parts](#which-nodes-become-parts-and-where-each-is-wired)
describes. The n8n importer's table maps n8n's chat and
embedding models, its MCP client tool to `core/ai-tool/mcp`, its HTTP request tools, its SerpApi tool,
its Qdrant, PGVector, Chroma, Milvus and Weaviate vector stores, and its Postgres and Redis chat
memories. A node n8n runs within the workflow itself — an agent, a chain, a trigger, a memory the
workflow keeps in its own process, a code tool — is the workflow's own, and no row maps it. A row of that table counts towards a match only
where the workspace's catalog holds the Component it names. The command reports one line for each
node it mapped, naming what it chose, the match tier and the best candidate's score, and a line
reading `made no choice for <node id> (<node type>)` for a node it gives no Component of its own. A
node referenced to a catalog Component, rather than drafted, has no file of its own: the draft
Aggregate names the Component.

How the draft is laid out is the [`layout` setting](#settings)'s. `platform`, the default, drafts the
platform that runs the flow, carrying the flow as it was exported, and gives a Component of its own
only to each part of the flow a socket of the platform takes — on the standard library's platforms, a
model, an MCP server or another tool reached over HTTP, and a vector store. `nodes` drafts every node
as a Component of its own.

### The platform carrying the flow

By default an import writes:

- `aggregate.yaml` — a draft Aggregate named after the flow, as
  [How a draft is named](#how-a-draft-is-named) describes. It holds one instance of the
  platform that runs the flow — `core/ai-agent/langflow`, under the key `langflow`, for a Langflow
  flow, `core/ai-agent/flowise`, under the key `flowise`, for a Flowise one, and `core/ai-agent/n8n`,
  under the key `n8n`, for an n8n workflow — referencing the catalog Component of that name. The
  instance carries the flow in `values.flow_definition` and names it in its identifier value, `flow_id`
  on Langflow, `chatflow_id` on Flowise and `workflow_id` on n8n. Each part of the flow is an entry of
  its own beside it, wired to the platform under the instance's `uses`.
- `release.yaml` — a draft Release of the same name, naming that Aggregate, with an entry for the
  platform and one for each part, carrying the platform's image and attaching every secret the
  draft needs by reference, as [What the draft leaves for the Release](#what-the-draft-leaves-for-the-release)
  describes.
- one file under `components/` for each part it drafts rather than references, written as
  [the node-by-node layout](#node-by-node) writes a drafted node.

Given a target, the import drafts `manifest.yaml` beside them, as [What a target adds](#what-a-target-adds)
describes.

Every node that is not a part stays inside the flow the platform carries and becomes no Component.
Its decision records the candidates it was weighed against and chooses nothing, and its rationale
reads `kept in the flow <platform> carries, with no Component of its own:`, followed by why — that no
mapping row names its type and its closest candidate scored only so much, say. The flow keeps the
edges between nodes; the draft writes none of its own.

Flowise's Multiple Documents QnA chatflow, exported as `Multiple Documents QnA.json` and imported with
no setting and no target over a catalog holding the standard library's Flowise platform and its model
and retrieval-tool Components, is drafted as this Aggregate, most of the flow left out here and marked
`...`:

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Aggregate
metadata:
  name: imported/multiple-documents-qna
  version: 0.1.0
  description: Draft Aggregate imported from a source in the flowise format.
spec:
  components:
    flowise:
      type: core/ai-agent/flowise
      # For the compose target only, uncomment the lines below, which declare owner_password on flowise: a secret the Release alone attaches arrives under the key value, so each is declared with a key of its own and no two arrive under one; the Release attaches its origin, naming this type or none.
      # features:
      #   owner_password:
      #     type: core/secret-value
      #     values:
      #       key: OWNER_PASSWORD
      values:
        # chatflow_id is derived from the exported flow, which gives no identifier of its own.
        chatflow_id: '96da3b80-86d0-5f23-b4e7-2573ea1f76ad'
        flow_definition: |
          {
              "description": "Tool agent that can retrieve answers from multiple sources using relevant Retriever Tools",
              ...
                              "embeddings": "{{"{{"}}openAIEmbeddings_0.data.instance}}",
              ...
          }
      uses:
        model:
          chatopenai-0:
            target: chatopenai-0
            # For the compose target only, uncomment the lines below, which declare credential on chatopenai-0: a secret the Release alone attaches arrives under the key value, so each is declared with a key of its own and no two arrive under one; the Release attaches its origin, naming this type or none.
            # features:
            #   credential:
            #     type: core/secret-value
            #     values:
            #       key: OPENAI_API_KEY
    # swap to core/ai-model/azure-openai (score 0.4000) by setting type: core/ai-model/azure-openai
    chatopenai-0:
      type: core/ai-model/openai
      values:
        model: |-
          gpt-3.5-turbo
```

Its chat model is the one part wired; its two embedding models stay in the flow, since the model
socket draws a single connection, and its retriever tools stay in the flow, since no socket of the
platform takes them. The import reports each.

The flow's identifier is the one the export gives it — a Langflow flow's top-level `id`, a Flowise
chatflow's top-level `id` where it is a UUID, and an n8n workflow's top-level `id` — where that is one
to 128 letters, digits, `.`, `-`, `_`
or `:`, opening with a letter or a digit. Where the export gives none, or one holding any other
character, the draft writes a name-based UUID derived from the format's name and the flow as it is
carried, so one flow always yields one identifier, and a comment above the value says it was derived.
A chatflow exported from Flowise's editor carries no `id`, so it is given a derived one.

Where the workspace's catalog holds no Component of the platform's name, the draft names the platform
all the same and wires no part to it: each node that would have been a part stays in the flow,
reported, and the import warns that the catalog holds no such Component.

### Which nodes become parts, and where each is wired

A node is a part of the flow where a row of the importer's mapping table, or a `mapping_overrides`
entry, maps its type, or where its best candidate is at least a medium-tier match. A Langflow MCP
Tools node is a part whatever its scores: it names the MCP server it calls, and that server is the
part. A part becomes a Component of its own, referenced or drafted exactly as `reuse_mode` decides,
and is wired to the first socket of the platform — in the order the platform's catalog entry declares
its sockets — whose label selector the part's Component satisfies: the labels of the Component it
references, or, for a part it drafts, those of its best candidate where that candidate is at least a
medium-tier match. A part whose Component satisfies no socket's selector, or which has no Component
to read labels off, stays in the flow, and the import reports it.

These rules narrow that:

- **A Langflow model naming another provider takes no model connection.** A `LanguageModelComponent`
  or `EmbeddingModel` node runs on the model provider its `provider` field names, or, where that is
  empty, the provider of the model its `model` field selects. The platform delivers its model
  connection for an OpenAI-compatible client, so a node naming any provider other than `OpenAI` —
  whatever a mapping row or override maps it to — is never wired to the `model` socket: it is wired to
  the next socket its Component satisfies, or stays in the flow, its decision choosing nothing and no
  Component drafted for it, and the import reports it naming the provider it runs on. A node selecting
  no provider, naming it through a global variable, or taking its model from another node is wired as
  any other part.
- **A socket drawing a single connection is held by one part.** On every platform the `model` socket
  draws one connection, which the platform's Recipes deliver as one `OPENAI_BASE_URL` and one
  `OPENAI_API_KEY`. Where several parts are placed in it, the first whose Component carries
  `model.aggrega.ai/capability: generative` holds it — the first part, where none does — and every
  other stays in the flow, reported with the part holding the connection and with how the flow
  reaches it as its node is written.
- **Langflow reaches a `tools` connection only through an MCP Tools node naming it.** The platform
  writes a tools connection's address into the server configuration of the MCP Tools node whose
  `mcp_server` field names the connection, so a node whose template carries no `mcp_server` field —
  whatever its type, and whatever a mapping row or override maps it to — is never wired to the
  `tools` socket: it is wired to the next socket its Component satisfies, or stays in the flow,
  reported. An MCP Tools node naming no server is wired to no socket and reported. So is one whose
  server configuration starts a server of its own — it carries a `command`, or sets the `Stdio`
  mode — and its report says what to remove, since the platform's build halts on a node naming a
  server no tools connection answers.
- **An MCP server is wired by the name the flow gives it.** The nodes of one flow naming one server
  reach one part, drafted once, through one connection. The connection's alias is the server's name
  where a connection's alias can take it — letters, digits, hyphens and underscores — and no other
  connection of that socket delivers under the same variable name, its alias upper-cased with every
  other character written as an underscore. Otherwise the connection takes an alias derived from the
  part's key, the node's server is renamed to that alias in the flow the draft carries, and the
  part's decision says so.

A wired part's decision says which socket of the platform it is wired to and through which
connection, and names each socket it was passed over for and why.

### How the carried flow reaches each part

Where the format lets it, the flow the platform carries reaches each wired part through its
connection, and the draft writes into the flow what makes it do so — the name of a variable, an
address emptied, or what the node would send in place of what the connection supplies, emptied, and
never a value. This is wiring, not the removal of a credential value: the draft writes it whatever
the [`empty_credentials` setting](#settings) says, since a value kept there would override what the
connection delivers.

- **A Langflow MCP Tools node.** The platform writes the address its connection delivers into the
  node's server configuration and, where the connection carries a credential, the name of the variable
  holding it under the header the tool publishes. The draft writes the address the export held there
  empty, so the flow holds no copy of it, and leaves the server's address — `infra.endpoint` of the
  part — for the Release. Langflow sends the node's own `headers` field over the headers of its server
  configuration, so the draft writes that field's whole value empty with its kind kept — an object as
  `{}`, a list as `[]`, text as an empty string — since a header kept with its value emptied would
  still be sent, while an empty object or list overrides nothing.
- **A Langflow model or vector-store node.** The platform delivers a model connection as
  `OPENAI_BASE_URL` and `OPENAI_API_KEY`, and a vector-store connection as variables named for its
  alias, which Langflow reads through a field naming a global variable: a field whose object carries
  `load_from_db: true` holds the variable's name as its value, and Langflow reads the global variable
  of that name, or the environment variable of that name where none is stored. The draft writes each
  of these fields with the variable's name and `load_from_db: true`:

  - an `OpenAIModel` node's `openai_api_base`, as `OPENAI_BASE_URL`, and its `api_key`, as
    `OPENAI_API_KEY`;
  - an `OpenAIEmbeddings` node's `openai_api_base`, as `OPENAI_BASE_URL`, and its `openai_api_key`, as
    `OPENAI_API_KEY`;
  - a `LanguageModelComponent` node's `api_key`, as `OPENAI_API_KEY`;
  - an `EmbeddingModel` node's `api_base`, as `OPENAI_BASE_URL`, and its `api_key`, as
    `OPENAI_API_KEY`;
  - a `pgvector` node's `pg_server_url`, as `AGGREGA_VECTOR_STORE_<ALIAS>_CONNECTION_STRING`, where
    `<ALIAS>` is the connection's alias upper-cased with every character other than a letter or a
    digit written as an underscore.

  A `LanguageModelComponent` or `EmbeddingModel` node runs on one of several model providers — the one
  its `provider` field names, or, where that is empty, the provider of the model its `model` field
  selects — and hands its key to that provider. The platform delivers the model connection for an
  OpenAI-compatible client, so such a node is written with the variables only where it runs on
  `OpenAI`. One running on another provider is never wired, as above; one selecting none, naming its
  provider through a global variable, or taking its model from another node is written with none of
  them, so the draft never points another provider at the connection's key. Where no field of such a
  node gives its API's address — a `LanguageModelComponent` node holds none for OpenAI, and an `EmbeddingModel` node's
  `api_base` may be missing, or empty where it cannot name a variable — the OpenAI client it runs
  takes `OPENAI_BASE_URL` from the environment, so the node reaches the address the platform delivers
  all the same.

  An `OpenAIEmbeddings` node's client sends its `default_headers` over the ones it builds from the
  key, and merges its `default_query` over the query of the address it calls, so on such a node the
  draft wires, the whole value of each is written empty with its kind kept, as an MCP Tools node's
  `headers` are.

  A field the export writes without both of those members is not written anew — a credential field
  among them is carried as written, or written empty where the setting asks for it, as below. Where
  that field is the one carrying the part's
  address — and, for a `LanguageModelComponent` or `EmbeddingModel` node, gives one — where such a node
  does not run on `OpenAI`, or where the node is of any other type, the import reports the part as
  reached at the address the flow or its component's defaults give.
- **A Flowise OpenAI node.** The OpenAI client Flowise runs a `chatOpenAI` or `openAIEmbeddings` node
  on reads `OPENAI_BASE_URL` and `OPENAI_API_KEY` from the environment where the node's Base Path is
  empty and it selects no credential, so the draft writes a Base Path the export holds empty, and the
  credential the node selects, at `data.credential`, empty too. That client sends the node's default
  headers, its `baseOptions`, over the header it builds from the key, so the draft writes their whole
  value empty with its kind kept. A model node of any other type is reported as reached at the
  address the chatflow or its own defaults give.
- **A Flowise tool or vector store.** A chatflow reads the address the platform delivers for one —
  `AGGREGA_TOOL_<ALIAS>_URL` or `AGGREGA_VECTOR_STORE_<ALIAS>_URL` — only through a Runtime variable
  of that name, which nothing creates at startup. The draft writes nothing for it, and the import
  reports the step that makes the chatflow read it: create the Runtime variable on Flowise's
  Variables page, and read it in the node as `$vars.<name>`.
- **Any n8n node.** The platform delivers a model connection as `OPENAI_BASE_URL` and
  `OPENAI_API_KEY`, and a tools or vector-store connection as `AGGREGA_TOOL_<ALIAS>_URL` or
  `AGGREGA_VECTOR_STORE_<ALIAS>_URL`, while an n8n node reaches a model, a store or a service at the
  address the stored credential it selects gives, or the address its own parameters hold, and a
  workflow reads an environment variable only through an expression reading `$env`, which the platform refuses unless the Aggregate sets
  `values.allow_env_access_in_nodes` to `true`. The draft leaves that value at its default, `false`,
  since setting it lets every workflow, and every user who can edit one, read every variable of the
  platform's environment, the delivered credentials included. So the draft writes nothing into the
  workflow for a connection, and every wired part is reported as reached other than through it. An MCP
  client node reaches its server at the address the workflow holds — as the export wrote it, or none
  where the `empty_credentials` setting writes it empty, as below — and the server's own address —
  `infra.endpoint` of the part — is left for the Release.

Where the flow is carried, each wired part is reported with which of these holds:
`part-reads-connection` where the flow reaches the part through its connection, and
`part-address-in-flow` where it reaches the part other than through its connection — at an address
the flow holds, or one its component's defaults give. The part's decision says the same.

A node the draft wires to no socket can still be reached by a connection it does wire, as the node is
written: an OpenAI client with no address and no key of its own reads the `OPENAI_BASE_URL` and
`OPENAI_API_KEY` the platform delivers for the model connection from its environment. Where one does,
the draft writes the node as it would a wired one, so nothing it holds is sent in place of what the
connection supplies, and reports it with `part-reads-connection`:

- a Langflow `OpenAIEmbeddings` node whose address field names the variable `OPENAI_BASE_URL` the
  platform delivers, read as a global variable, while a part is wired to the model socket: its
  `default_headers` and `default_query`;
- a Flowise `chatOpenAI` or `openAIEmbeddings` node whose Base Path is empty and which selects no
  credential, and such a model's configuration an agentflow node keeps among its inputs, while a part
  is wired to the model socket: its `baseOptions`.

On any other node these values are not wiring: they are carried as written, or written empty where
the setting asks for it, as the next section says.

### Credential values the flow holds

Before the flow is carried, the import locates every value in it that can carry a credential, in the
places listed below, each of one of three kinds: what a format marks as a credential; a member of an
MCP server's configuration, wherever a format keeps one; and an input a format marks as no credential
that can carry one all the same — request headers, query parameters, a whole request written as a
command line, an input holding a credential under a credential's name.

By default the import writes none of them empty: the flow is carried as it was exported, and each
located value that holds something — not an empty string and not `null` — is named in a
`credential-carried` warning, by its node and its field — a header or a query parameter by its name —
never by its value or any part of it, with the value of the `empty_credentials` setting that writes it
empty. The setting turns removal on: `marked` writes empty what a format marks as a credential and
every member of an MCP server's configuration; `all` writes empty the inputs marked as none as well.
Each value it writes empty is reported with `credential-emptied`, by its node and its field, never by
its value; a value already empty, or `null`, is left as it is and not reported. A value the setting
does not take halts the import, which drafts nothing, rather than reading as `none`.

A located value that is one variable reference and nothing else holds no value of its own: the bare
name of a variable, `${NAME}` — a predefined variable such as `${workspaceFolder}` or `${userHome}`
included — or one of the forms the MCP clients define, `${env:NAME}` and `${input:id}`. Whatever the
setting says it is carried as written and named in no warning, whichever format the flow is in, as the
MCP importer writes one. So is a member that is one reference inside a value a format keeps as text,
such as a Flowise `mcpServerConfig` written as JSON text, or headers and query parameters held as a
JSON object in text on Flowise and n8n: written empty, the text keeps that member as written.

A reference carrying text after an operator holds that text, which can be a key, whether or not a colon
comes before the operator: a default, `${NAME:-value}` or `${NAME-value}`; an alternative,
`${NAME:+value}` or `${NAME+value}`; a message, `${NAME:?message}` or `${NAME?message}`; an
assignment, `${NAME:=value}` or `${NAME=value}`. It is located like any other value — carried and
named in a `credential-carried` warning by default, written empty where the setting asks for its
kind — and so is any other text inside `${…}`, such as `${config:name}`, and text beside a reference,
such as `--key=${NAME}`.

What the draft writes so that a node reaches its connection — an address written empty, a variable's
name, a selected credential or default headers written empty, as
[How the carried flow reaches each part](#how-the-carried-flow-reaches-each-part) describes — is wiring:
it is written whatever the setting says, reported with how the node reaches its connection, and never
reported as a credential value. What lies outside every place below is the author's to review, as the
end of this section says.

**What a format marks as a credential** — written empty under `marked` and `all`:

- **Langflow** — the value of each template field marked `password: true`, a field holding the name
  of a global variable included, unless the draft writes that field with the name of the variable
  the platform delivers, as above.
- **Flowise** — the credential a node keeps at `data.credential`, which its credential parameter
  selects; the value of each input its `inputParams` declare of type `password`; and
  `FLOWISE_CREDENTIAL_ID` among a node's inputs, and `credential` or `FLOWISE_CREDENTIAL_ID` inside a
  configuration object at any depth of them, as an agentflow keeps a model's or a tool's.
- **n8n** — the `id` of each stored credential a node selects, at `credentials.<type>.id`. An n8n
  export keeps a credential as a reference, never its value, and the reference's `name` is not
  located: n8n, importing the workflow on another instance, resolves a credential whose `id` it does
  not hold by its type and name. A credential an older export selects by its name alone names a
  credential and holds none, and is not located. And the value of each parameter n8n marks as a
  password in its base nodes' definitions — the Crypto node's `secret`, say, or the `password` of the
  nodes that create a user — wherever among the node's parameters it sits, a node used as an agent's
  tool read as the node it is.

**An MCP server's configuration** — written empty under `marked` and `all`:

- A Langflow MCP Tools node's `mcp_server` configuration, and a Flowise node's `mcpServerConfig`,
  written as JSON text or as an object: each header value, whether the headers are an object, rows of
  a key and a value or objects merged whole, an item of any other kind located whole; each
  environment value; the server's address; the command; and every argument. Neither format marks an
  address, a command or an argument as a credential, and each can carry a key — an address in its user
  part, its path or its query — so all three are located too, on both formats. Written empty, the
  command and each argument keep their members, so a configuration that starts a server of its own
  still reads as one. Where a Langflow MCP Tools node is wired to a tools connection, its address is
  wiring, as above, and never reported as a credential value. A Flowise configuration written as text
  that does not read as a JSON object is located whole, since nothing inside it can be located.
- A Langflow MCP Tools node that carries no `mcp_server` field keeps its server in fields of its own
  instead — the address in `sse_url`, the headers in `headers_input`, the environment in `env`, and the
  whole command line, its arguments included, in `command` — and Langflow marks none of them as a
  credential either, so each header value, each entry of `env`, the address and the command line are
  located, their fields and entries kept when written empty. Where `env` is a list, each entry is
  reported by its position, since a variable's name and its value share one text. Such a node names no
  MCP server, so it is never wired to a tools connection.
- A Langflow MCP Tools node's own `headers` field, which Langflow sends the server over the headers of
  its configuration, on a node the draft does not wire: its whole value, written empty with its kind
  kept, as on a wired node, and reported once, as `headers`.
- Langflow's MCP Tools (SSE) and MCP Tools (stdio) components, which Langflow marks deprecated, keep
  their server in one field each — an `MCPSse` node its address in `url`, an `MCPStdio` node its whole
  command line, its arguments included, in `command` — located whole. Neither names an MCP server, so
  neither is wired to a tools connection.
- An n8n MCP client node — the MCP Client Tool an agent calls, the MCP Client node, or a client of a
  server n8n's registry lists — keeps the server's address in its `endpointUrl` parameter, or
  `sseEndpoint` on its first version, and its headers only as credentials it selects; the address is
  located whole, wired or not.

**An input a format marks as no credential** — written empty under `all` alone:

- **Request headers** — on Langflow, the `headers` of an `APIRequest`, `URLComponent`,
  `CloudflareWorkersAIEmbeddings` or `ConfluentKafkaProducer` node and the `api_headers` of a
  `DoclingRemote` node; on Flowise, the `headers` of an `httpAgentflow`, `getApiChain`,
  `postApiChain`, `openApiChain`, `apiLoader`, `openAPIToolkit` or `searXNG` node, the
  `requestsGetHeaders`, `requestsPostHeaders`, `requestsPutHeaders` and `requestsDeleteHeaders` of
  the Requests tools, and the `baseOptions` — the default headers a model's client sends — of an
  `azureChatOpenAI`, `azureOpenAIEmbeddings`, `chatCerebras`, `chatOpenAICustom`,
  `openAIEmbeddingsCustom`, `chatOpenRouter`, `chatSambanova` or `openAI` node; on n8n, the
  `headerParameters`, `jsonHeaders`, `headerParametersUi` and `headerParametersJson` of an
  `n8n-nodes-base.httpRequest` node — its current version keeps the first two, its earlier versions
  the other two — and of the same node used as an agent's tool, the `parametersHeaders` and
  `jsonHeaders` of an `@n8n/n8n-nodes-langchain.toolHttpRequest` node, and the `headerParametersUi` of
  an `n8n-nodes-base.graphql` node. A header's name carries no secret, so each header's value is
  located and its name kept, whatever shape the headers take: an object of names to values, rows of a
  key and a value — on n8n, rows of a `name` and a `value` — or objects Langflow merges into the
  headers whole. Each header is reported by its name. An item of a list that is no header row is
  located whole and reported by its position. Headers written as text are located whole, except on
  Flowise and n8n where the text holds headers as a JSON object: there, written empty, the text is
  rewritten in place, each value empty, and reported once with the names of the headers it holds. n8n
  text opening with `=` is an expression n8n evaluates when the workflow runs, and is located whole.
  Written empty, every value is, those of headers that hold no secret such as `User-Agent` included,
  so an imported request is sent with them empty until its author restores them.
- **Query parameters** — on Langflow, the `query_params` of an `APIRequest` or `GoogleSerperAPI` node
  and the `search_params` of a `SerpAPI`, `Serp`, `SearchAPI` or `SearchComponent` node; on Flowise,
  the `queryParams` of an `httpAgentflow` node and the `customParameters` of a `searchApi` loader; on
  n8n, the `queryParameters`, `jsonQuery`, `queryParametersUi` and `queryParametersJson` of an
  `n8n-nodes-base.httpRequest` node, used as a tool or not, the `parametersQuery` and `jsonQuery` of
  an `@n8n/n8n-nodes-langchain.toolHttpRequest` node, and the `queryParameters` and
  `queryParametersJson` an `n8n-nodes-base.facebookGraphApi` node keeps among its `options`. Each is
  sent as the query of a request, and a query parameter can carry a key — some search APIs take
  theirs as `api_key` in the query — so each is located as headers are: each value, its name kept,
  whatever shape the parameters take, and each reported by its name; parameters written as text are
  located whole, except on Flowise and n8n where the text holds them as a JSON object, which, written
  empty, is rewritten in place and reported once with the names it holds. Written empty, every value
  is, those of parameters that hold no secret included, so an imported request is sent with them
  empty — or, from a Flowise HTTP node, which sends no parameter whose value is empty, without
  them — until its author restores them.
- **Default headers and a default query on an OpenAI node no connection reaches** — a Langflow
  `OpenAIEmbeddings` node's `default_headers` and `default_query`, and a Flowise `chatOpenAI` or
  `openAIEmbeddings` node's `baseOptions`, wherever the node sits, an agentflow's configuration of
  the model it selects included, where the draft neither wires the node nor finds a connection
  reaching it as it is written; where one does, they are wiring, as above. Each is located whole and,
  written empty, keeps its kind — an object as `{}`, a list as `[]`, text as an empty string — and is
  reported once.
- **A whole request written as a command line** — a Langflow `APIRequest` node's `curl_input` and a
  `Webhook` node's `curl`, located whole, the Webhook's default included. Neither is read when the
  flow runs: the first only fills the node's fields in the editor, the second shows an example.
- **An input holding a credential under a credential's name** — a Langflow `OlivyaComponent` node's
  `api_key`, every Composio component's `verification_token`, and a `mem0_chat_memory` node's
  `mem0_config`, whose whole value keeps its kind when written empty; and a Flowise
  `startAgentflow` node's `webhookSecret` and `callbackSecret` and a `teradataMCP` node's
  `bearerToken`. Each is located whole. An input whose name only resembles a credential — the name of
  a key stored elsewhere, a user name, or an option the component declares as no secret — is not
  located.

Apart from the values the setting writes empty, what the draft writes so that the flow reaches its
parts, a Langflow edge's handles, written as Langflow's editor writes them, and the carriage returns
written as line feeds below, the flow is carried as exported: with none of these, byte for byte.

A connection in the draft carries no credential value: the drafted Release attaches the one each
connection presents by reference, as
[What the draft leaves for the Release](#what-the-draft-leaves-for-the-release) describes.

Every value the setting leaves as written reaches the draft, and the author reviews it, guided by the
`credential-carried` warnings. No rule about a field reaches the rest of a flow either, so the author
reviews it too before sharing a draft: a component's own code, which the flow carries and in which a
custom component can hold a key; inputs the editor adds to a node beyond those its component
declares; the body a request is sent with, such as an `APIRequest` or `httpAgentflow` node's, which
can carry a token; the arguments a node hands its model's client or a loader as one object of its
own, such as a Langflow `EmbeddingModel` node's `model_kwargs` or a Flowise `replicate` node's
`additionalInputs`, which can carry a key under any name; an address other than an MCP server's,
which can carry a key in its user part or its query; an n8n Code node's code, and the headers or the
query of a node that sends a request the importer does not list above; and free text such as a
prompt or a message.

### What the draft leaves for the Release

The drafted Release carries, on the platform's entry and on each part's, what the flow cannot
supply:

- **The platform's image**, as `infra.image`: the importer's own choice of image, at the version the
  catalog's Recipes for the platform are known to run — `langflowai/langflow:1.6.0`,
  `flowiseai/flowise:3.1.3` and `n8nio/n8n:1.110.1` — under a comment saying so. The import never
  raises or lowers it to follow the source; where the export states a version of the platform that
  differs, as a Langflow flow's `last_tested_version` does, the comment names it.
- **The port the platform is published on**, as `infra.published_port`, with `--target compose`
  alone: 7860 for Langflow, 3000 for Flowise and 5678 for n8n, the ports each serves on, which its
  Compose Recipe publishes on the host's loopback address, 127.0.0.1. The comment above it says the
  port is reachable from this machine only, by any process running on it, and that deleting the line
  keeps the service internal. A second flow of one import takes the next port no earlier one takes.
  With any other target, or none, it is not written.
- **The platform's own secret and each model connection's credential**, attached by reference and
  never as a value: on Langflow, the `admin_password` slot, read while `values.require_authentication`
  stays `true`; on Flowise, the `owner_password` slot, required while `values.flow_definition` is set;
  and, where a part is wired to the platform's `model` socket, the `credential` on that connection.
  The n8n platform takes no secret of its own. How each is attached depends on the target, as
  [Secrets, for each target](#secrets-for-each-target) describes.
- **Each value no source holds**, written as an empty string under a comment saying what it is: on
  Flowise, `infra.owner_email`, the owner account's email, required while `values.flow_definition` is
  set; and the address of each MCP server wired to the platform, `infra.endpoint` of its part. Each is
  a value the import owes, answered as [The import answers file](../import-answers.md) describes.

The credential a connection to a tool or a vector store presents is not drafted: such a connection's
credential halts the build where the tool publishes no header to send it in, so a comment above the
platform's entry names it, for you to attach where the tool takes one.

#### Secrets, for each target

On `--target helm`, each secret is a `core/referenced-secret` whose `origin` is the name of a
Kubernetes Secret already in the namespace, holding the value under the data key `value`. The name is
no source's to give, so it is written empty under a comment saying what it holds, and the import owes
it; the drafted Manifest maps `core/referenced-secret` to `helm/k8s-existing-secret`.

On every other target, and with none, each secret is a `core/secret-value` whose `origin` is a
reference to a variable — `${LANGFLOW_ADMIN_PASSWORD}`, `${FLOWISE_OWNER_PASSWORD}`, and
`${OPENAI_API_KEY}` for a model connection's credential — which a target substituting variable
references, as Docker Compose does when the stack starts, reads from the environment, so no file
carries the value and nothing is owed for it. The Flowise chatflow above, imported with no target,
is drafted with this Release:

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Release
metadata:
  name: imported/multiple-documents-qna
  # environment is a drafted default, since no source names the environment this Release deploys to; change it to name the one it deploys to.
  environment: development
  version: 0.1.0
  description: Draft Release imported from a source in the flowise format.
spec:
  aggregate: imported/multiple-documents-qna
  # manifest: left empty, since the import was given no target; an import given a target drafts the Manifest and names it here.
  manifest: ""
  components:
    flowise:
      infra:
        # The image running core/ai-agent/flowise, at the version this importer drafts, which the catalog's Recipes for it are known to run; the import does not raise or lower it to follow the source.
        image: "flowiseai/flowise:3.1.3"
        # Left for the Release, since the source cannot supply it: infra.owner_email, the email address of the platform's owner account, required while values.flow_definition is set
        owner_email: ""
      features:
        owner_password:
          type: core/secret-value
          infra:
            # Attached by reference, never as a value: the owner account's password, required while values.flow_definition is set, read from the variable FLOWISE_OWNER_PASSWORD, which a target substituting variable references, as Docker Compose does when the stack starts, reads from the environment, so no file carries the value.
            origin: "${FLOWISE_OWNER_PASSWORD}"
      uses:
        model:
          chatopenai-0:
            features:
              credential:
                type: core/secret-value
                infra:
                  # Attached by reference, never as a value: the credential flowise presents to chatopenai-0 on its model connection, read from the variable OPENAI_API_KEY, which a target substituting variable references, as Docker Compose does when the stack starts, reads from the environment, so no file carries the value.
                  origin: "${OPENAI_API_KEY}"
    chatopenai-0: {}
```

With no target it owes two values, `spec.manifest` and `infra.owner_email`; with `--target compose`,
the owner's email alone; with `--target helm`, the owner's email and the names of the two Kubernetes
Secrets.

On the compose target, a secret the Release alone attaches arrives under one key, `value`, so the
owner's or the administrator's password and a connection's credential would both arrive under it.
The Aggregate therefore declares each with a key of its own where the platform draws a connection:
`owner_password` with the key `OWNER_PASSWORD` on Flowise, `admin_password` with the key
`LANGFLOW_SUPERUSER_PASSWORD` on Langflow, and the model connection's `credential` with the key
`OPENAI_API_KEY` on all three platforms, each under a comment saying why. With `--target compose`
these lines are written live; with no target they are written commented out, as in the example
above, for you to uncomment if you build for compose; with any other target they are not written.
The Release attaches each slot's origin, naming the same type or none.

With the [`attach_egress_allowlist` setting](#settings) `true`, the platform's instance also declares
the standard library's `core/egress-allowlist` Feature under `features`, as `egress-allowlist`, so the
platform connects only to the components its connections reach, its own pods and the cluster's DNS
— the outbound counterpart of a [`uses` edge as a declared call](../entities/aggregate.md#a-uses-edge-is-a-call-the-aggregate-declares).
The Aggregate declares the attachment's type and nothing else, since an Aggregate's attachment
carries no `infra`, and the drafted Release writes none of it: the comment above the platform's entry
names, under `features.egress-allowlist.infra`, `control_plane_present`, which the operator sets `true`
to affirm that the cluster's network plugin enforces network policy, without which the build halts;
`admitted_destinations`, a list holding an entry naming the target and an address range for each
connection whose target the cluster does not run, such as a hosted model, without which the build
halts naming that connection; and `aggrega.ai/namespace` for the boundary holding the platform, since
the policy is placed in its workloads' namespace and the build halts where they are emitted into none.
Neither key is written empty, so neither is among the values the import owes. Each wired part's
decision says the attachment admits its connection, and the import reports the attachment as
`feature-attached`. Compose has no network policy, so a compose build of such a draft halts naming the
attachment; where the platform draws a connection, the compose lines above are written inside the
instance's `features` block, with no second `features` key.

### The model a part serves

A part the draft references whose Component declares a value named `model` — as each model Component
of the standard library does, and requires — is written with the name of the model its node selects,
as `values.model`:

- **Langflow** — an `OpenAIModel` or `AnthropicModel` node's `model_name`; an `OpenAIEmbeddings` node's
  `model`; and a `LanguageModelComponent` or `EmbeddingModel` node's `model_name` override where it is
  set, and otherwise the model its `model` field selects.
- **Flowise** — a `chatOpenAI`, `chatAnthropic` or `openAIEmbeddings` node's `modelName`.
- **n8n** — the `model` parameter of a chat, completion or embeddings node the importer's table maps,
  or its `modelName` on the Google Gemini and Vertex nodes, written as a name or as the value of the
  selector n8n's newer nodes keep it in. n8n leaves a parameter set to its default out of an export,
  so a node that keeps the default model names none in the export.

A Release cannot write a value. So where the node names no model the draft can write — it selects
none, names it through a global variable or an expression read only when the flow runs, takes it from
another node connected to it, or is of a type whose model field the importer does not read — a
comment inside the part leaves `values.model` for the author, and the import reports it with
`model-not-named`. A part the draft drafts is written with no value.

### How the flow is written into the draft

The flow is written as a YAML literal block whose chomping keeps its trailing line breaks, so
`values.flow_definition` reads back as the flow's own text. An Aggregate's text is read as a
template, so each `{{` the flow holds — a Flowise chatflow writes `{{<node id>.data.instance}}` for
every connection between two nodes — is written as `{{"{{"}}`, which interpolation turns back into the
two braces, as
[Text that carries its own double braces](../templates/parameters-context.md#text-that-carries-its-own-double-braces)
describes. A model's name is written the same way.

A literal block cannot carry every character as it is written:

- **A carriage return** — of a CR LF pair, or standing alone — is written as one line feed. A JSON
  document holds one only between its tokens, where any whitespace reads alike, so the platform reads
  the same flow. The import reports how many with `carriage-returns-rewritten`.
- **Any other character a literal block cannot carry** keeps the flow from being carried: a
  line-break character — U+0085, U+2028 or U+2029; a control character other than the tab and the line
  feed — U+0000 to U+001F, U+007F, and U+0080 to U+009F; the noncharacters U+FFFE and U+FFFF; and a
  byte that is not part of a UTF-8 sequence. `values.flow_definition` is then left unset, with a
  comment saying so, the rest is drafted, and the import reports `definition-not-carried` for each
  kind of character, with how many the flow holds and the line and column of the first.

The flow is not carried either where a value the draft writes empty or anew is not in the export's
bytes where its parsed tree holds it, and the import reports `definition-not-carried` naming that
value's place. The flow's identifier is then its own where the draft can carry it, and otherwise one
derived from the identifiers of the flow's nodes.

### Node by node

With `layout: nodes`, an import drafts every node of the flow as a Component of its own, and writes:

- `aggregate.yaml` — a draft Aggregate named after the flow, as
  [How a draft is named](#how-a-draft-is-named) describes, composing the flow's nodes:
  an entry for each, and each edge of the flow a `uses` connection of the node it feeds, its socket
  and its alias both named after the key of the node feeding it, so a node fed by several gives each
  connection an alias of its own.
- one file under `components/` for each node it drafts — a draft Component named
  `<target_namespace>/<category>/<name>`, the name taken from the node's type, at version `0.1.0`, its
  value fields as string fields of a closed `values` object and its credential fields as required
  credential slots whose delivery a Recipe decides.
- `release.yaml` — a draft Release of the same name, naming that Aggregate, with an entry for each
  node.

The flow itself is not carried, and no field's value is read.

## Carrying the exported flow itself

The default draft carries the flow: the platform's instance takes the export as
`values.flow_definition`, written as [How the flow is written into the draft](#how-the-flow-is-written-into-the-draft)
describes. An author writing a flow into an Aggregate by hand — into a draft laid out node by node, or
into an Aggregate of their own — writes it the same way. A Component that runs a flow as authored
takes the export as a value — `flow_definition` on the standard library's `core/ai-agent/langflow`
and `core/ai-agent/flowise` — and an Aggregate's text is read as a template, so the double braces the
export holds would be read as template actions: a Flowise chatflow writes `{{<node id>.data.instance}}`
for every connection between two nodes, a Flowise prompt names a variable as `{{question}}`, and a
Langflow export carries the source code of its components, where the braces can appear as well.
Write each `{{` in the export as `{{"{{"}}`, inside a block scalar, and interpolation restores the
export's text before the Component's Recipes read it;
[Text that carries its own double braces](../templates/parameters-context.md#text-that-carries-its-own-double-braces)
describes why. A credential value the export holds belongs in a secret the Release attaches, not in
the Aggregate: write it empty, as the draft does where the `empty_credentials` setting asks it to.

```yaml
# Aggregate fragment — a Flowise chatflow carried as exported
spec:
  components:
    chat:
      type: core/ai-agent/flowise
      values:
        chatflow_id: 3f2b8c1e-7a4d-4e9b-8c2f-1a6d5e9b0c47
        flow_definition: |
          {
            "nodes": [
              {
                "id": "llmChain_0",
                "data": {
                  "name": "llmChain",
                  "inputs": {
                    "model": "{{"{{"}}chatOpenAI_0.data.instance}}",
                    "prompt": "{{"{{"}}promptTemplate_0.data.instance}}"
                  }
                }
              }
            ],
            "edges": []
          }
```

## The MCP importer

`importer/mcp` reads the MCP servers an MCP client's configuration lists, or the one server an MCP
registry server description describes, and drafts each server as an instance of the standard
library's MCP tool, `core/ai-tool/mcp`. Every server is one, so the importer weighs no candidate and
reports no mapping decision.

### What it reads

- **A client's configuration.** Claude Code's `.mcp.json`, Claude Desktop's
  `claude_desktop_config.json` and Cursor's `.cursor/mcp.json` list their servers by name under
  `mcpServers`; Visual Studio Code's `.vscode/mcp.json` lists them under `servers`, and a file listing
  servers under both is read under `mcpServers` first. A server whose `type` is `stdio`, or that names
  no `type` and carries a `command`, is started from a command line — its `command` and its `args` —
  with its `env` as its environment. A server whose `type` is `http`, `streamable-http` or `sse`, or
  that names no `type` and no `command` and carries a `url`, is reached at its `url` and sent its
  `headers`.
- **A registry server description.** The `server.json` the MCP registry publishes: its `name`, and
  its first package, or, where it lists none, its first remote. An npm or a PyPI package is started
  from the command line its launcher — its `runtimeHint`, or `npx` for npm and `uvx` for PyPI — its
  `runtimeArguments`, the package with its version, written `<identifier>@<version>` for npm and
  `<identifier>==<version>` for PyPI, and its `packageArguments` make, with its
  `environmentVariables` as its environment. A positional argument is its `value`, or its `default`;
  a named argument is written `<name>=<value>` where it has either, and as its `name` where it has
  neither. An OCI package runs from the image its `identifier` names. A remote is reached at its
  `url`, sent its `headers`. Every other package and remote the description lists is named in a
  comment, since one instance runs one of them.

Every other member of a server — `cwd`, `envFile`, Cursor's `auth`, or a member its kind does not
read, such as the `url` of a server started from a command line — is written nowhere, and named in a
comment above the server's entry in the Release, since no infrastructure key of `core/ai-tool/mcp`
takes it. A configuration's `inputs`, which describe what Visual Studio Code prompts for and hold no
value, are not read. The servers, their environment and their headers keep the order the source
writes them in, except in a configuration read as JSON with comments, which keeps the order its parsed
tree writes them in: name order (see [A configuration holding comments](#a-configuration-holding-comments)).

A directory is read through the client configurations it holds — every file named as one of the four,
at any depth — in the order of their paths, and every server of every file is drafted into one
Aggregate.

### What a server becomes

`aggregate.yaml` is a draft Aggregate named after the source, as
[How a draft is named](#how-a-draft-is-named) describes, holding one instance of
`core/ai-tool/mcp` per server. An instance is keyed by its server's name, lowercased, with every run
of characters other than letters and digits written as one hyphen, and a numeric suffix where an
earlier server took the key. Where the key is not the server's name as written, or the import read
several files, a comment above the instance names the server and the file it came from. No agent is
drafted to use them.

Beside it, `release.yaml` is a draft Release of the same name, whose `spec.aggregate` names the
Aggregate, carrying for each instance the operational inputs the source states:

- for a server started from a command line, `infra.stdio_command`, its command and then each
  argument, one item each; and `infra.stdio_runtime`, the launcher's ecosystem, `npm` where the
  command is `npx`, `npm` or `node`, `pypi` where it is `uvx`, `uv`, `python` or `python3`, and, for a
  registry package, its registry, `npm` or `pypi`;
- for a server reached at an address, `infra.endpoint`: the address without its user part, its query
  and its fragment, since the Component takes the address without any part that carries a key; each
  part it leaves out is written in the comment above the entry, beside the address, as
  [Credential values a server holds](#credential-values-a-server-holds) describes;
- for an OCI package, `infra.image`;
- for no server, on any target, `infra.published_port`: the draft never publishes a server on the host;
- for a server's environment, the `server_env` slot, attached by reference for the import's target.
  On `--target helm` it is a `core/referenced-secret` naming a Kubernetes Secret already in the
  namespace that holds one data key per variable, each named as the variable it holds; the Secret's
  name is written empty, under a comment naming the data keys, and the import owes it. On every other
  target, and with none, it is a `core/referenced-secret-set` with one entry under `infra.entries` per
  variable, keyed by the variable's name, its value as the source writes it, so a variable reference
  such as `${GITHUB_TOKEN}` stays one, which a target substituting variable references reads from the
  environment.

What the source does not state is written empty, under a comment saying what it is: a command whose
launcher neither bridge image carries leaves `infra.stdio_runtime` empty, and the import owes it; an
argument a registry description leaves for its user is written as an empty item, and a variable whose
value the source does not write as an entry with an empty value, each named in the comment above the
entry.

Like every drafted Release, it writes `metadata.environment` as `development`, under a comment saying
it is a drafted default to change, and, with no target, `spec.manifest` as an empty string the import
owes. Given a target, the importer drafts the Manifest itself, since the catalog realizes
`core/ai-tool/mcp` through several Recipes and only the importer knows how each server runs: it maps
each server by its key, under `mappings.components.name`, to the target's realization of how the
server runs — `mcp-stdio-bridge` for a command line, `mcp-remote` for an address, `mcp` for an image,
such as `helm/mcp-stdio-bridge` or `compose/mcp-remote` — and the secret type the environment is
attached as to its realization, `helm/k8s-existing-secret` on helm and `compose/dotenv-secret-set` on
compose. The import completes that Manifest and names it in the Release, as
[What a target adds](#what-a-target-adds) describes.

A Claude Code `.mcp.json` listing a server reached over HTTP and one started with `npx`:

```json
{
  "mcpServers": {
    "api-server": {
      "type": "http",
      "url": "https://api.example.com/mcp",
      "headers": { "Authorization": "Bearer ${API_KEY}" }
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}" }
    }
  }
}
```

is drafted as:

```yaml
# aggregate.yaml
apiVersion: aggrega.ai/v1beta1
kind: Aggregate
metadata:
  name: imported/mcp
  version: 0.1.0
  description: Draft Aggregate imported from a source in the mcp format.
spec:
  components:
    api-server:
      type: core/ai-tool/mcp
    github:
      type: core/ai-tool/mcp
```

```yaml
# release.yaml
apiVersion: aggrega.ai/v1beta1
kind: Release
metadata:
  name: imported/mcp
  # environment is a drafted default, since no source names the environment this Release deploys to; change it to name the one it deploys to.
  environment: development
  version: 0.1.0
  description: Draft Release imported from a source in the mcp format.
spec:
  aggregate: imported/mcp
  # manifest: left empty, since the import was given no target; an import given a target drafts the Manifest and names it here.
  manifest: ""
  components:
    # The headers the source sends this server, which no infrastructure key of core/ai-tool/mcp takes, since a remote server's credential is held by each consumer, on its connection to the tool:
    #   - Authorization: "Bearer ${API_KEY}"
    api-server:
      infra:
        endpoint: "https://api.example.com/mcp"
    github:
      infra:
        stdio_command:
          - "npx"
          - "-y"
          - "@modelcontextprotocol/server-github"
        stdio_runtime: npm
      features:
        server_env:
          type: core/referenced-secret-set
          infra:
            # Attached by reference wherever the source names a variable: the environment github is started with, one entry per variable, each written as the source writes it, so a variable reference stays one, which a target substituting variable references, as Docker Compose does when the stack starts, reads from the environment, and an empty value is one still owed.
            entries:
              - key: "GITHUB_PERSONAL_ACCESS_TOKEN"
                value: "${GITHUB_TOKEN}"
```

Imported with `--target helm`, the same configuration's Release attaches the environment as the Secret
it names, and the Manifest the importer drafts maps each server by its key:

```yaml
# release.yaml, the github entry's environment
      features:
        server_env:
          type: core/referenced-secret
          infra:
            # Left for the Release, since the source cannot supply it: the name of a Kubernetes Secret already in the namespace holding the environment github is started with, one data key per variable, each named as the variable it holds: GITHUB_PERSONAL_ACCESS_TOKEN.
            origin: ""
```

```yaml
# manifest.yaml
apiVersion: aggrega.ai/v1beta1
kind: Manifest
metadata:
  name: imported/mcp
  version: 0.1.0
spec:
  mappings:
    components:
      type: {}
      name:
        api-server: helm/mcp-remote
        github: helm/mcp-stdio-bridge
    features:
      type:
        core/referenced-secret: helm/k8s-existing-secret
```

### Credential values a server holds

Each value of a server's configuration the Release writes — each header's value, each item of its
command line, its address, each part of the address `infra.endpoint` leaves out and each environment
value — can carry a key, and no client marks one as a credential, so the import locates each as a
member of an MCP server's configuration; a registry input marked `isSecret` is located as a value its
format marks as a credential. A registry input — an environment variable or a remote's header — is
read as its `value`, or its `default` where it writes none. By default each is carried as written into
the Release and named in a `credential-carried` warning by its server and its place —
`headers.<header>`, `infra.stdio_command.<position>`, `infra.endpoint` or `server_env.<variable>`, and
a part of the address by the `url` it is written in and the part's name, as in "url of node
remote-search is carried with its query as written" — never by its value. With the
[`empty_credentials` setting](#settings) at `marked` or `all`, each is written empty and reported with
`credential-emptied`: an item of the command line as an empty item and an environment value as an
empty value, each named in the comment above the entry; an address as an empty `infra.endpoint`, which
the import owes; and a header's value or a part of the address left out of the comment, which names
the header or the part alone. A client's `infra.stdio_runtime` is read off the command as the Release
writes it, so a command written empty leaves it empty too, and the import owes it. On `--target helm`
the Release writes no environment value at all: the Secret the `server_env` slot names holds them.

A value that is one variable reference and nothing else — the bare name `${NAME}`, a predefined
variable such as `${workspaceFolder}` among them, `${env:NAME}` or `${input:id}` — holds no value of
its own: it is written as the text it is whatever the setting says, and it is named in no warning, as
a reference is
[in a flow](#credential-values-the-flow-holds). An environment variable whose value is one is written
as the entry's value, a reference staying one, and a header or a part of the address whose value is
one is listed with the reference it reads from. A reference carrying text after an operator — a default, an alternative, a message or an
assignment, such as `${NAME:-value}` or `${NAME-value}`, with or without a colon — holds that text, and
so does text beside a reference; each is located like any other value.

No infrastructure key of `core/ai-tool/mcp` takes a header's value: a remote server's credential is
held by each consumer, on its connection to the tool, and the import drafts no consumer. So the
comment above the server's entry lists each header the source sends it, beside its value as written —
a double-quoted string reading back as exactly the source's text — for you to move onto the connection
of the consumer presenting it. A header whose value the source does not write, such as a registry
header input with neither a value nor a default, is listed as having none. The image an OCI package
names is written as it is, and is not a value the setting reaches.

`infra.endpoint` takes the address without any part that carries a key, so the parts of the address
the source writes that it leaves out — the user part before the `@`, the query after the `?` and the
fragment after the `#`, everything after the first `#` being the fragment — are listed in the same
comment, each beside its name and as written, without the `@`, `?` or `#` setting it off. A consumer
reading its key from the address supplies the whole address on its own connection to the tool. A
server reached at `https://user:pw@api.example.com/mcp?key=k`, with no setting, is drafted as:

```yaml
    # The address's user part and query are not written in infra.endpoint, which holds the address without any part that carries a key; a consumer reading its key from the address supplies the whole address on its own connection to the tool:
    #   - user part: "user:pw"
    #   - query: "key=k"
    api:
      infra:
        endpoint: "https://api.example.com/mcp"
```

and with `empty_credentials` at `marked`, `infra.endpoint` is left for the Release and the comment
lists `user part` and `query` each with its value left out.

### A configuration holding comments

Visual Studio Code reads `.vscode/mcp.json` as JSON with comments, and so does the MCP importer: its
signature for that file reads it through the parser that serves `parse:jsonc`, so a configuration
holding `//` and `/* */` comments and trailing commas is recognised with no format named, and the
importer reads every source listing its servers under `servers` through that parser. Such a
configuration is drafted exactly as the same configuration without its comments and trailing commas.
The parser writes the members of an object in name order, so the servers of such a configuration,
their environment and their headers are drafted in name order, whether or not it holds a comment; a
command line keeps its order. The other clients and the registry read their files as JSON, and so
does the importer: a `.mcp.json`, `claude_desktop_config.json`, `.cursor/mcp.json` or `server.json`
holding a comment is recognised by no signature, and imported naming `--format mcp` it stops under
`parse-failed` with the parser's reason. A comment opened with `/*` and never closed is left as
written, and the parser refuses the file.

### The settings it reads

The MCP importer reads `target_namespace` and `empty_credentials`, as [Settings](#settings) describes
them, and no other setting.

## The Compose importer

`importer/compose` reads the services and the models a Compose file declares. It drafts each
service as an instance of the catalog Component its image matches, or of the standard library's
generic server, `core/compute/server`, running its image; each model as an instance of the standard
library's Docker Model Runner runtime, `core/ai-model/docker-model-runner`, where your catalog holds
it, and as a model Component of its own where it does not; and a Release beside them carrying what
each service states for its operation.

### What it reads

- **The files.** A file imported on its own is read alone. A directory is read as Compose reads one:
  in each directory holding Compose files, in the order of the directories' paths, the first present
  of `compose.yaml`, `compose.yml`, `docker-compose.yml` and `docker-compose.yaml` is the Compose file,
  and the first present of `compose.override.yml`, `compose.override.yaml`,
  `docker-compose.override.yml` and `docker-compose.override.yaml` is merged over it. Any other of
  those files is not read. A directory holding override files and no Compose file has its first
  override file read alone. A comment opening the drafted Aggregate names the files read, in the order
  they are merged, and the files not read. Every service and model of every directory is drafted into
  one Aggregate.
- **The merge.** An override file is merged as Compose merges one: `image` is replaced; `ports` are
  merged by their address, published port, container port and protocol, `volumes` by their path in
  the container, and `environment` by variable name, a later entry taking the place of an earlier one
  and a new one following; `expose` is appended; `depends_on` and a service's `models` are joined, an
  entry's `endpoint_var` and `model_var` each taking the place of the one an earlier file states. Of
  a model, `model` and `context_size` are replaced and `runtime_flags` appended. Compose's `!reset` and
  `!override` tags are not honoured: a value carrying one is merged as the YAML parser reads it.
- **A service.** Its `image`, and whether it builds one under `build`; its `ports`, `expose`,
  `volumes` and `environment` — a mapping, or a list of `NAME=value` items, a name with no value
  taking its value from the environment Compose runs in; `depends_on`, a list or a mapping; and its
  `models`, a list of model names or a mapping whose entries may name, under `endpoint_var` and
  `model_var`, the variables the model's address and identifier reach the service under. Every other
  member — `command`, `healthcheck`, `secrets`, `env_file` and the rest — is written nowhere, and
  named in a comment above the service's entry in the Release.
- **A model.** Each entry of the top-level `models`: its `model`, the OCI identifier of the model, its
  `context_size` and its `runtime_flags`, carried as written into an instance of
  `core/ai-model/docker-model-runner` where your catalog holds it, and of a model Component drafted
  for it where it does not; the model's decision says which, and why. Any other member is named in a
  comment above its instance.
- **The rest.** The other top-level members — `name`, `networks`, `volumes`, `secrets`, `configs` —
  are not read, and the comment opening the Aggregate names them.

Services, models and a service's environment keep the order the file writes them in. The parser's
tree writes the members of a mapping in sorted order, so that order is read from the file's text,
where they are written as a block mapping; a mapping written in flow style keeps the sorted order.

### Which Component a service is

The importer matches a service by the repository its image names: the reference without its tag and
its digest, a Docker Hub reference written in its short form — `postgres` for
`docker.io/library/postgres:16`. It matches the repository through its image table, a table from image
repository to the catalog Component that a Compose Recipe of the standard catalog runs an image of
that repository for. The table is generated from the standard catalog's Compose Recipes and
Components when the importer is built and compiled into it, so no Recipe is read when an import
runs and the table holds the standard catalog's labels, whatever your catalog holds; the importer's
Plugin entity names, in its description, the hub revision the table was generated from. Of each
Recipe, the table reads the Component the Recipe implements and the image of its container named
`main`, where that image writes its repository in its own text, or is a locals entry that does. A
Recipe running the image the Release names whole, or one its template composes otherwise, adds no
row, and neither does an image a Recipe runs beside its main container. Two Recipes naming one
repository for different Components stop the table being generated, so a row never names one of two.
Of the Component a row names, the table reads its labels as an import is handed them — at the version
a reference naming the Component without a version resolves to, with those it inherits through
`extends` — and writes every label but `component.aggrega.ai/category` into the row as its traits. A
Recipe implementing a Component the standard catalog does not hold stops the table being generated
too.

A row is read as a flow importer's table row is: the Component, the category its name places it in,
its traits, and the last segment of its name as its vendor. The
[`mapping_overrides` setting](#settings) layers over the table under the `compose` format, keyed by
repository, and an entry for a repository the
table maps takes the row's place. So an image the standard catalog's Recipes do not name — your own,
or one a Component of the catalog runs under another repository — is mapped by an entry:

```yaml
with:
  settings:
    mapping_overrides:
      compose:
        bitnami/redis:
          component: core/datastore/redis
          category: datastore
          traits:
            datastore.aggrega.ai/engine: kv
          vendor: redis
```

A service whose image a row maps is decided as the flow importers decide a node: scored against your
catalog's Components, referenced where `reuse_mode` is `auto-apply-above-threshold`, the default, and
its best candidate is a high-tier match at or above `reuse_threshold`, and drafted as a Component of
its own otherwise, the drafted Component's file opening with a comment naming the Component it resembles. A
row carries the labels of the Component it names, so where your catalog holds that Component with the
labels the standard catalog gives it, a service the row maps is a high-tier match for it, scoring
`0.90`, and `auto-apply-above-threshold` references it at the default `reuse_threshold`. A Component
whose labels your catalog has changed scores less, in proportion to the share of the row's traits it
no longer carries, and is referenced only while it stays in the high tier; the category is weighed
once, in its own signal, not again as a trait. Services drafting one Component share its one file. A
service whose image no row maps, whose image names no repository the importer reads,
or that builds its image, is an instance of `core/compute/server`, whatever your catalog holds. Each
service's decision is reported as each node's is.

### What a service becomes

`aggregate.yaml` is a draft Aggregate named after the project, as
[How a draft is named](#how-a-draft-is-named) describes, holding one instance per
service, of the Component its decision chose, keyed as the MCP importer keys a server, a comment above
it naming the service and the file it came from where the key is not the service's name or the import
read several directories. Each service a service's `depends_on` names is a connection,
`uses: <key>: <key>: {target: <key>}`, written under a socket and an alias both named for the target's
key. A component reads each of its connections by its alias, whatever socket it is wired into, so
each connection of a service has an alias of its own. A variable of a service's environment can draw
a connection too, delivering the variable from what the service it reaches publishes, as
[What a service's environment and image become](#what-a-services-environment-and-image-become)
describes. Each model is an instance of
`core/ai-model/docker-model-runner` where the workspace's catalog holds it, whatever `reuse_mode`
says, and no Component is drafted for it: the instance writes `model` and `runtime_flags` as the
source states them, and the source's `context_size` as `context_window`, the value the runtime
declares for a model's context length, which its Compose Recipe writes back as Compose's
`context_size`. Where the catalog holds no `core/ai-model/docker-model-runner`, the model is drafted
as `<target_namespace>/ai-model/<key>`, a Component of the `ai-model` category whose values declare
`model`, `context_size` and `runtime_flags`, and its instance writes each the source states. Every
model has a decision saying which — `mapped llm (model) to core/ai-model/docker-model-runner as a
reference, NONE`, or a draft whose decision records that the workspace's catalog holds no
`core/ai-model/docker-model-runner` — and each service naming the model is connected to it either
way, as to a service it depends on. A service naming the model in the long form, with
`endpoint_var` or `model_var`, names the variables its address and identifier reach the service under.
No key of the draft holds a variable's name — the connection is written on a socket named after the
model, which declares no value, and an importer is handed no Component's infrastructure keys — so a
comment above the connection names each, as the entry writes it, and the service's decision records
the same sentence:

```yaml
    search:
      type: core/compute/server
      uses:
        # The service search reads the address of the model embedder as AI_MODEL_URL and its identifier as AI_MODEL_NAME, the names its models entry gives them; no key of the draft holds either name.
        embedder:
          embedder:
            target: embedder
```

A service naming the model in the short form, or with neither variable, is connected to it with no
comment.

Beside it, `release.yaml` is a draft Release of the same name, whose `spec.aggregate` names the
Aggregate. For an instance of `core/compute/server` it writes `infra.image`, the image as written, and
`infra.port`, the port the container listens on in the first entry of `ports`, or of `expose` where
`ports` holds none. With `--target compose` it also writes `infra.published_port`, the host port that
same `ports` entry publishes, as the source states it, under the comment saying it is reachable from
this machine only, by any process running on it, and that deleting the line keeps the service
internal; a host port below 1024, which `published_port` does not take, is not written, and a comment
above the entry names it. A comment above each service's entry writes what the source states that no key of
the draft carries — the image of a service matched to another Component whose tag the draft does not
translate, its `ports`, `expose`, `volumes`, and each variable of its `environment` the draft does not
translate — for you to carry where the Component takes it. What the draft leaves for the Release —
the image of a service naming none, as one that builds its own does, and a port that is not one
number — is written empty under a comment saying why. A build places only the instances a Release
names, so each model's
instance has an empty entry, `<key>: {}`, after the services': an instance of
`core/ai-model/docker-model-runner`, which takes no input on Compose that lacks a default, and a
model drafted as a Component of its own alike, so the drafted model is already placed and builds once
you write the Recipe realizing it. A port the Component does not take, such as one below
`core/compute/server`'s floor of 1024, is
written as the source states it, and the build halts naming it. The Release writes
`metadata.environment` and, with no target, an empty `spec.manifest` as the MCP importer's does;
given a target, the import drafts the Manifest, as [What a target adds](#what-a-target-adds)
describes, mapping each Component to the Recipe realizing it on that target — `core/compute/server` to
`compose/server` or `helm/server`, and `core/ai-model/docker-model-runner` to
`compose/docker-model-runner` or `helm/docker-model-runner`.

A `compose.yaml` running PostgreSQL and an API of its own that depends on it:

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: shop
  api:
    image: ghcr.io/example/shop-api:1.4.2
    depends_on:
      - db
    ports:
      - "8080:8080"
    environment:
      CACHE_URL: redis://cache:6379/0
```

is drafted, with no setting, over a catalog holding the standard library's `core/datastore/postgres`,
imported on its own and named after the file since the project carries no `name`, as:

```yaml
# aggregate.yaml
apiVersion: aggrega.ai/v1beta1
kind: Aggregate
metadata:
  name: imported/compose
  version: 0.1.0
  description: Draft Aggregate imported from a source in the compose format.
spec:
  components:
    db:
      type: core/datastore/postgres
      # The values of core/datastore/postgres the source sets as POSTGRES_DB, the variables its Compose Recipes set from them.
      values:
        database: "shop"
    api:
      type: core/compute/server
      uses:
        db:
          db:
            target: db
```

```yaml
# release.yaml
apiVersion: aggrega.ai/v1beta1
kind: Release
metadata:
  name: imported/compose
  # environment is a drafted default, since no source names the environment this Release deploys to; change it to name the one it deploys to.
  environment: development
  version: 0.1.0
  description: Draft Release imported from a source in the compose format.
spec:
  aggregate: imported/compose
  # manifest: left empty, since the import was given no target; an import given a target drafts the Manifest and names it here.
  manifest: ""
  components:
    db:
      infra:
        # The tag of the image the source runs, postgres:16, the engine_version of core/datastore/postgres its Compose Recipes run.
        engine_version: "16"
    # The source also states, for the Release to carry where core/compute/server takes it:
    #   ports:
    #     - "8080:8080"
    #   environment:
    #     CACHE_URL: "redis://cache:6379/0"
    api:
      infra:
        image: "ghcr.io/example/shop-api:1.4.2"
        port: 8080
```

The import reports `mapped db (postgres) to core/datastore/postgres as a reference, HIGH at 0.9`. The
project holds no `cache` service, so `CACHE_URL` draws no connection and stays in the comment. With
`reuse_mode: hints-only`, `db` is instead `type: imported/datastore/postgres`, drafted in
`components/imported-datastore-postgres.yaml`, which opens with
`# resembles core/datastore/postgres (score 0.9000); reference it by setting type: core/datastore/postgres`;
its image and its environment are then written in the comment above its entry, since a drafted
Component declares none of the values the catalog's Recipes read. Given `--target compose`, the
Manifest maps `core/datastore/postgres` to `compose/postgres` and `core/compute/server` to
`compose/server`; given `--target helm`, to `helm/postgres` and `helm/server`.

#### What a service's environment and image become

Where a service is an instance of the catalog Component its image's row names, and the workspace's
catalog holds that Component, the importer reads its image and its environment as the standard
catalog's Compose Recipes for that Component read them, from what the image table records of each
Recipe, and translates them into the drafts:

- **The image's tag** is the infrastructure key the Recipe builds the image reference from, such as
  `engine_version` — `16` for `postgres:16` — written in the Release under a comment naming the
  source's image.
- **A variable the Recipe sets from one of the Component's values** — `POSTGRES_DB`, `POSTGRES_USER`
  — whose value holds text, is that value of the instance, `database` or `user`, where the catalog's
  Component declares it, written in the Aggregate under a comment naming the variables.
- **A variable the Recipe reads a password from**, such as `POSTGRES_PASSWORD`, whose value is one
  variable reference, is a secret attached on that slot, read from the variable the reference names
  and declared with the key the Recipe reads it under.

And, for every service, each variable of its environment not read so:

- **A value that is the name of another service of the project**, where that service's row names the
  `provides` key publishing its host name, draws a connection to that service, whose `inject` block
  delivers the variable from that key — `CACHE_HOST: cache` is `CACHE_HOST` from the cache's `host`.
- **A value equal to a value another service sets for its Component** that the Component publishes —
  `DATABASE_USER: notes` beside a PostgreSQL service setting `POSTGRES_USER: notes` — draws a
  connection delivering the variable from that `provides` key. Where several services or keys hold the
  value, the one whose key, or whose own variable, ends as the variable's name ends is read, and,
  failing that, the one the service's other variables have not already been read from; otherwise the
  variable is not read.
- **A value that is one variable reference naming a variable another service's secret is read
  from** — `DATABASE_PASSWORD: ${POSTGRES_PASSWORD}` — is, on an instance of `core/compute/server`, a
  secret of its own, attached under the variable's name in lower case and read from the same variable,
  where the target writes the secret as a value the server takes. `helm/server` refuses a
  `core/referenced-secret`, so on `--target helm` such a variable stays in the comment.

Every other variable is left in the comment above the service's entry, as the source writes it. The
[Compose import walkthrough](../../authoring/import/compose.md) shows a project whose API reaches its
database and its cache this way, built and run as drafted.

### Credential values a service holds

Compose marks no environment value as a credential, and the importer reads no variable's name for
what it means, so every environment value that holds something is located as an input its format
marks as no credential that can carry one. By default each is carried as written into the drafts —
into the value it is translated into, or the comment above its service's entry in the Release — and
named in a `credential-carried` warning by its service and its variable — `environment.<variable>` —
never by its value. With the
[`empty_credentials` setting](#settings) at `all`, each is written empty and reported with
`credential-emptied`: the comment names its variable with no value. At `marked` none is written empty,
since Compose marks none. A value that is one variable reference Compose interpolates and nothing
else — `${NAME}` or `$NAME` — holds no value of its own: it is written as the text it is, and named in
no warning. A reference carrying a default or a message, such as `${NAME:-value}`, holds that text,
and is located like any other value. A value Compose reads from elsewhere — an `env_file`, a secret's
file — is not read.

### The settings it reads

The Compose importer reads `target_namespace`, `reuse_mode`, `reuse_threshold`, `emit_hints`,
`render_mode`, `mapping_overrides` and `empty_credentials`, as [Settings](#settings) describes them,
and no other setting. The hint `emit_hints` governs is written in the drafted Component's file alone;
the drafted Aggregate carries none.

## The Dify importer

`importer/dify` reads an application exported from Dify in its DSL, the YAML document Dify writes for
an application, and drafts an Aggregate composing the standard library's Dify installation,
`core/dify`, with the application carried in the installation's `app_definition` parameter. The
installation imports it at deploy, through the step its API server's Recipe renders for it.

### What it reads

- **The application.** `kind`, which is `app`; `version`, the version of the DSL the application is
  written in; and `app`, with its `mode`.
- **A workflow or a chatflow** — `mode` `workflow` or `advanced-chat` — keeps its graph under
  `workflow`: each node of `workflow.graph.nodes` that names its type under `data.type` is a node of
  the application, in the order the graph lists them, and `workflow.environment_variables` holds the
  variables it reads.
- **A chat, agent chat or completion application** keeps its configuration under `model_config`: its
  `model`, each knowledge base under `dataset_configs.datasets.datasets` and each tool under
  `agent_mode.tools` is a node of the application, named by its place there, such as
  `model_config.model`. An application of the `agent` mode is one node, `agent`.
- **The plugins it needs.** Each entry of `dependencies` is a node too, named `dependencies.<n>`, of
  the type the entry names, such as `marketplace`.

Nothing else decides what is drafted: the whole application is carried.

### What an application becomes

`aggregate.yaml` is a draft Aggregate named after the application, as
[How a draft is named](#how-a-draft-is-named) describes, composing one entry of
`core/dify`, keyed `dify`, whose `app_definition` parameter carries the application as written — as
[How the flow is written into the draft](#how-the-flow-is-written-into-the-draft) describes for a flow,
so Dify's own `{{#…#}}` references reach the installation as exported. The installation wires every
connection of its API server itself — its database, its cache, its vector store, its sandbox, its
plugin runtime and its egress proxy — so the draft drafts no Component and wires nothing: every node
stays in the application, and its decision says so. Beside it, `release.yaml` is a draft Release of
the same name, which places the installation in a boundary, `platform`, and carries what the
application cannot supply.

An import sees the Components of the workspace's catalog and none of its Aggregates, so it does not
check that the catalog holds `core/dify`, and a comment above the entry says so. Where the catalog
holds no `core/ai-agent/dify`, the API server `core/dify` runs, the import warns with
`platform-not-in-catalog` and drafts the entry all the same.

The installation's application secret, the key Dify signs its session cookies with and encrypts the
model-provider credentials it stores under, is the `secret_key` parameter of `core/dify`, which has no
default. So the draft declares a `secret_key` parameter of its own — a string, required, at least one
character long and with no default — and passes it down to every `core/dify` entry it writes, for the
Release to fulfill under its `parameters`; a build whose Release leaves it unset halts naming it.

The application is imported under the installation's owner account, which the Release names in its
routing entry for the installation: `infra.owner_email` on the installation's `api` component, and the
`owner_password` slot on that component, attached as a `core/referenced-secret`, without which the
build halts. The owner's email is no source's to give, so it is written empty under a comment saying
what it is, and the import owes it.

On every target, the same routing entry sets `infra.marketplace_enabled` to `true` on the
installation's `api`, `worker` and `scheduler` components, each under a comment saying why: the
installation reaches nothing of Dify's vendor unless the Release allows it, each of the three reads its
own setting, and Dify installs the plugin serving an application's model, such as OpenAI's, from its
plugin marketplace.

The application secret and the owner's password are secrets, drafted by reference for the import's
target:

- On `--target helm`, each names a Kubernetes Secret already in the namespace: `secret_key` the
  Secret's name, which `core/dify` reads under the data key `secret-key`, and `owner_password` a Secret
  holding the password under the data key `value`. Neither name is any source's to give, so each is
  written empty under a comment saying what it is, and the import owes both; the drafted Manifest maps
  `core/referenced-secret` to `helm/k8s-existing-secret`.
- On every other target, and with none, each is a reference to a variable — `secret_key` as
  `"${DIFY_SECRET_KEY}"` and the owner's password as `"${DIFY_OWNER_PASSWORD}"`, the names the standard
  catalog's Dify Recipes for Compose read — which Docker Compose reads from the environment when the
  stack starts, so nothing is owed for either; on `--target compose` the drafted Manifest maps
  `core/referenced-secret` to `compose/dotenv-referenced-secret`.

Given a target, the Manifest maps the type of each component the installation composes as well as
the draft's own, as [What a target adds](#what-a-target-adds) describes.

The authored workflow application this importer's tests import, named `Support Answers`, is drafted,
with no setting, as:

```yaml
# aggregate.yaml
apiVersion: aggrega.ai/v1beta1
kind: Aggregate
metadata:
  name: imported/support-answers
  version: 0.1.0
  description: Draft Aggregate imported from a source in the dify format.
spec:
  parameters:
    secret_key:
      type: string
      required: true
      minLength: 1
      description: "Passed down to core/dify's secret_key parameter, which has no default; that parameter's description in core/dify says what the value is."
  aggregates:
    # An import sees the Components of the workspace's catalog and none of its Aggregates, so it does not check that the catalog holds core/dify.
    dify:
      type: core/dify
      parameters:
        secret_key: "{{ .parameters.secret_key }}"
        app_definition: |
          app:
            description: Answers a support question from a knowledge base and files it.
            ...
```

Imported with `--target helm`, its drafted Release fulfills `secret_key`, and names the owner and
switches the plugin marketplace on in the routing entry placing the installation, each value it owes
written empty:

```yaml
# release.yaml
apiVersion: aggrega.ai/v1beta1
kind: Release
metadata:
  name: imported/support-answers
  # environment is a drafted default, since no source names the environment this Release deploys to; change it to name the one it deploys to.
  environment: development
  version: 0.1.0
  description: Draft Release imported from a source in the dify format.
spec:
  aggregate: imported/support-answers
  manifest: imported/support-answers
  parameters:
    # Left for the Release, since the source cannot supply it: secret_key, which the drafted Aggregate declares and passes down to core/dify; that parameter's description there says what the value is
    secret_key: ""
  boundaries:
    platform:
      aggregates:
        dify:
          components:
            api:
              infra:
                # Lets the installation reach Dify's plugin marketplace, which the plugin serving the application's model, such as OpenAI's, is installed from.
                marketplace_enabled: true
                # Left for the Release, since the source cannot supply it: components.api.infra.owner_email, the email of the installation's owner account the application is imported under, on the api component of core/dify
                owner_email: ""
              features:
                owner_password:
                  type: core/referenced-secret
                  infra:
                    # Left for the Release, since the source cannot supply it: the name of a Kubernetes Secret already in the namespace holding, under the data key value, the owner account's password.
                    origin: ""
            worker:
              infra:
                # Lets the installation reach Dify's plugin marketplace, which the plugin serving the application's model, such as OpenAI's, is installed from.
                marketplace_enabled: true
            scheduler:
              infra:
                # Lets the installation reach Dify's plugin marketplace, which the plugin serving the application's model, such as OpenAI's, is installed from.
                marketplace_enabled: true
```

The import owes the three empty values. Imported with `--target compose`, the same Release writes
`secret_key: "${DIFY_SECRET_KEY}"` and `origin: "${DIFY_OWNER_PASSWORD}"`, and owes the owner's email
alone; it also writes `infra.published_port` on the `api` component, 5001, and on the front end, the
`console` component, 3001, each under the comment saying it is reachable from this machine only, by
any process running on it, and that deleting the line keeps the service internal, and, beneath the
`api` component's port, `infra.console_url` with the address the console is published at,
`"http://127.0.0.1:3001"`, which the Dify server takes as the console's address. The [Dify import walkthrough](../../authoring/import/dify.md) builds an application for both
targets and runs it on Kubernetes.

### What Dify configures for itself

Dify configures the providers of the models and the tools an application calls inside itself, and
`core/ai-agent/dify` declares no socket for a model, so the draft wires none. Each node naming one is
reported with `part-configured-in-platform`, and in its decision, by what it names:

- an `llm`, `question-classifier` or `parameter-extractor` node, and a chat application's
  `model_config.model`: the model, by its name and its provider;
- a `tool` node, and a chat application's tool: the tool, by its name and its provider;
- an `agent` node: the agent strategy and the plugin providing it;
- a `knowledge-retrieval` node, and a chat application's knowledge base: the knowledge bases it
  retrieves from, and the model it routes a query with or reranks with, where it names one. An
  application names a knowledge base by an identifier of the installation it was exported from, and
  carries none of its documents and no store, so each is created inside Dify, in the vector store the
  installation wires to its API server;
- a dependency: the plugin, by the identifier Dify installs it under, and where Dify installs it from.

Every other node is kept in the application with nothing reported.

### Credential values an application holds

The importer locates, in the order the application writes them:

- the value of each environment variable whose `value_type` is `secret`, which Dify marks as a
  credential. Dify's export writes it empty unless the export includes secrets;
- an HTTP request node's `authorization.config.api_key`, which Dify marks as a credential and exports
  as written;
- the stored credential a `tool` node, or a tool of an `agent` node, selects under `credential_id`,
  which Dify marks as a credential and writes only where the export includes secrets;
- an HTTP request node's `headers` and `params`, which Dify marks as no credential and which can carry
  one, each whole.

By default each holding a value is carried as written in the application and named in a
`credential-carried` warning by its node — `workflow` for an environment variable — and its field,
never by its value. With the [`empty_credentials` setting](#settings) at `marked`, each value Dify
marks as a credential is written empty, and at `all` the headers and the query parameters too, each
reported with `credential-emptied`. A value that is one variable reference and nothing else holds
none, and is carried as written whatever the setting says and named in no warning, as
[in a flow](#credential-values-the-flow-holds). A value is written empty in the application's own
text: the scalar after its key is replaced by `''`, and nothing else is changed. The application is carried only
where the parser serving `parse:yaml` reads the result back as the exported application with exactly
those values emptied; otherwise it is not carried, `app_definition` is left unset with a comment, and
`definition-not-carried` says why — as for an application in which a YAML alias reads a secret's
value, which writing that value empty would change too. A value the setting leaves as written is never
rewritten, so it never stops the application being carried.

### The DSL version

Where an application is written in a version of the DSL newer than `0.7.0`, the version Dify `1.17.0`
— the version `core/ai-agent/dify` runs by default — writes, the import warns with
`dsl-version-newer`. Dify holds the import of such an application for confirmation, which the step
importing it at deploy gives, so check the application against the Dify version the Release runs.

### The settings it reads

The Dify importer reads `target_namespace`, `empty_credentials`, `layout`, `attach_egress_allowlist`
and `render_mode`, as [Settings](#settings) describes them, and `reuse_mode`, `reuse_threshold`,
`emit_hints` and `mapping_overrides`, which change nothing the default layout drafts: every node stays
in the application. `attach_egress_allowlist` attaches nothing, since an entry of a composed
Aggregate takes parameters and no Feature, and with it `true` the import warns with
`feature-not-attached`. `layout: nodes` drafts each node as a Component of its own, as
[Node by node](#node-by-node) describes, and carries no application.

## The CrewAI importer

`importer/crewai` reads the agents and the tasks a CrewAI project declares in its configuration files,
and drafts an Aggregate holding one instance of the standard library's CrewAI agent,
`core/ai-agent/crewai`, per agent, each wired to the model its configuration names, and a Release
beside it.

### What it reads

CrewAI keeps a crew's behaviour in a program and declares its agents and its tasks in configuration
files, in one of two layouts, and the importer reads either:

- **A classic project** — `config/agents.yaml`, each agent keyed by its name, and
  `config/tasks.yaml`, each task keyed by its name, both read as YAML. The agents are read in the order
  `agents.yaml` writes them.
- **A project in the JSON-first layout** — `crew.jsonc`, which lists the crew's agents by name under
  `agents` and its tasks under `tasks`, and `agents/<name>.jsonc`, one file per agent, all read as JSON
  with comments, so their comments and trailing commas are read as CrewAI reads them. The agents are
  read in the order `crew.jsonc` lists them, followed by any other agent's file in name order; an agent
  the crew lists whose file the import was not handed is named in a comment and drafted as nothing.
  The same layout spelled in strict JSON — `crew.json` and `agents/<name>.json` — is read the same
  way. Where a crew or an agent is written in both spellings, the `.jsonc` file is the one read, as
  CrewAI reads it, and the `.json` file is named in a comment as not read.

Of an agent it reads its `role`, `goal` and `backstory`; `allow_delegation` and `verbose`, at the top
of its declaration or under `settings`, where `settings` wins, as CrewAI reads them; its `llm`; and the
names of its `tools`. Of a task it reads its name and the agent it is assigned to. Every other member is
named in a comment and carried nowhere.

A directory is handed to the importer as the files its signatures name and no other, so the crew's
program — a classic project's `crew.py`, a flow's `main.py`, a tool a project defines in Python — is
never read. A file imported on its own is read as the declaration its shape is. A project's
directory may hold several crews, each read from its own directory.

### What a project becomes

`aggregate.yaml` is a draft Aggregate named after the crew, as
[How a draft is named](#how-a-draft-is-named) describes, opening with comments naming
the declarations read, that the crew's program is not read, and each crew's tasks with the agent each
is assigned to. It holds, per agent and keyed by its name, an instance of `core/ai-agent/crewai` with:

- `role`, `goal` and `backstory` as declared;
- `allow_delegation` as declared, and `false` where the agent declares none;
- `log_level` `DEBUG` for an agent declared `verbose`, which narrates each step of its reasoning, and
  `INFO` for one that is not, which reports progress and problems only. A `verbose` or an
  `allow_delegation` that is neither `true` nor `false` is left to the Component's default and named
  in a comment;
- its `model` connection, wired to the instance of the model its `llm` names.

An `llm` written `<provider>/<model>`, or as an object naming the model under `model`, `model_name`
or `deployment_name`, names a provider and a model. The model is an instance of the catalog's
Component for that provider — `core/ai-model/<provider>`, an underscore in the provider's name read
as a hyphen, and `azure` read as `azure-openai` — keyed by the model's name, with the model as its
`values.model`; agents naming one provider and model share one instance. Where the workspace's catalog
holds no Component of that name, one is drafted, `<target_namespace>/ai-model/<provider>`, declaring
the `model` value, and its decision says so; the `model.aggrega.ai/api` label the agent's `model`
socket selects a Component by, and a Recipe publishing its endpoint and its model, are left for you,
as a comment opening it says. An `llm` naming no provider — a bare model name, which CrewAI resolves
a provider for when the program runs, or the name of an `llm` the program defines — a reference into
the program, and an agent declaring no `llm`, which CrewAI then reads from the environment its program
runs in, are wired to nothing, and a comment above the agent says why; the build halts naming the
`model` socket until one is wired.

A task is logic the crew's program runs, and a tool is code the program defines or loads: neither
becomes a Component. Each is reported in a decision that chooses nothing, and a tool whose name — with
a trailing `Tool`, its hyphens and underscores dropped — is the name of a tool Component the catalog
holds carries that Component as a hint: `search_tool` and `SearchTool` both hint at
`core/ai-tool/search`. `core/ai-agent/crewai` declares no socket for a tool, so nothing is wired for
one.

`release.yaml`, beside it, is a draft Release of the same name naming that Aggregate. It writes each
agent's `infra.image` — the image running the crew's program, which no declaration names — empty,
under a comment saying what it is, and the import owes it. With `--target compose` each agent's entry
also writes `infra.published_port`, 8000, the port the Component's `infra.port` names for the
program by default, which its Compose Recipe publishes on the host's loopback address, 127.0.0.1,
under the comment saying it is reachable from this machine only, by any process running on it, and
that deleting the line keeps the service internal; a second agent takes the next free port, so the
classic project's two agents are published on 8000 and 8001. It attaches the credential each agent
presents to its model under `credential` on its `model` connection, by reference and never as a
value: no declaration names a variable for it, so it is read from the variable the provider's client
libraries read their API key from — `OPENAI_API_KEY` for OpenAI — as a `${…}` reference on every
target but helm, and on helm as the name of a Kubernetes Secret, written empty for the import to owe;
on compose, the agent's `model` connection declares it with that key. Each model has an entry too,
holding no infrastructure, so the Release places it with the agents. Of a model declared as an `llm`
object, each other member is written as a value of the model's instance where the catalog's
Component declares a value of that name, and otherwise in a comment above the model's entry in the
Release, for you to carry where the Component takes it. Like every drafted Release, it writes
`metadata.environment` as `development` and, with no target, an empty `spec.manifest` the import owes;
given a target, the import drafts the Manifest, as [What a target adds](#what-a-target-adds)
describes.

The classic project this importer's tests import, whose two agents both name `openai/gpt-4o`, is
drafted, with no setting, as below; imported as its project directory, `market_brief` — the directory
`crewai create crew market_brief` lays such a project out in — whose declarations name no crew, it is
named after that directory:

```yaml
# aggregate.yaml
# CrewAI declarations read:
#   - src/market_brief/config/agents.yaml
#   - src/market_brief/config/tasks.yaml
# Not read: the crew's program, which runs its agents and its tasks and defines its tools; it runs in the image the Release names for each agent.
# Tasks the crew's program runs, drafted as no Component:
#   - research_task, assigned to researcher
#   - brief_task, assigned to brief_writer
apiVersion: aggrega.ai/v1beta1
kind: Aggregate
metadata:
  name: imported/market-brief
  version: 0.1.0
  description: Draft Aggregate imported from a source in the crewai format.
spec:
  components:
    # Tools the crew's program defines or loads for this agent, drafted as no Component: search_tool.
    researcher:
      type: core/ai-agent/crewai
      values:
        role: "{topic} Market Researcher\u000A"
        goal: "Gather the facts about {topic} a buyer needs before a first meeting\u000A"
        backstory: "You have briefed sales teams for years. ..."
        allow_delegation: false
        log_level: DEBUG
      uses:
        model:
          gpt-4o:
            target: gpt-4o
            # For the compose target only, uncomment the lines below, which declare credential on gpt-4o: a secret the Release alone attaches arrives under the key value, so each is declared with a key of its own and no two arrive under one; the Release attaches its origin, naming this type or none.
            # features:
            #   credential:
            #     type: core/secret-value
            #     values:
            #       key: OPENAI_API_KEY
    # The agent brief_writer.
    # Not carried, since core/ai-agent/crewai takes no value for it: max_iter.
    brief-writer:
      type: core/ai-agent/crewai
      ...
    # The model openai/gpt-4o.
    gpt-4o:
      type: core/ai-model/openai
      values:
        model: "gpt-4o"
```

and its Release, drafted with no target, as below, the second agent's entry left out here and marked
`...`; the import owes `spec.manifest` and each agent's image:

```yaml
# release.yaml
spec:
  aggregate: imported/market-brief
  # manifest: left empty, since the import was given no target; an import given a target drafts the Manifest and names it here.
  manifest: ""
  components:
    researcher:
      infra:
        # Left for the Release, since the source cannot supply it: infra.image, the container image running the crew's program
        image: ""
      uses:
        model:
          gpt-4o:
            features:
              credential:
                type: core/secret-value
                infra:
                  # Attached by reference, never as a value: the credential researcher presents to gpt-4o on its model connection (the source names no variable for it, so it is read from the one OpenAI's client libraries read the API key from), read from the variable OPENAI_API_KEY, which a target substituting variable references, as Docker Compose does when the stack starts, reads from the environment, so no file carries the value.
                  origin: "${OPENAI_API_KEY}"
    brief-writer:
      ...
    gpt-4o: {}
```

Each agent is then rendered running the image you answer, given the model's endpoint and the model's name as
`OPENAI_BASE_URL` and `MODEL`, the variables CrewAI reads them from.

### Credential values a declaration holds

An `llm` written as an object can carry a key — under `api_key`, in an address, in headers. Each of
its members other than the one naming the model that is not a number or a boolean is a value that can
carry one, which CrewAI marks as no credential. By default each holding a value is carried as written
— as a value of the model's instance where its Component declares one, and otherwise into the comment
above its model's entry in the Release — and named in a `credential-carried` warning
by its agent and its member, such as `llm.api_key`, never by its value. With the
[`empty_credentials` setting](#settings) at `all`, each is written with no value and reported with
`credential-emptied`; at `marked` each is carried, since CrewAI marks none. A member's name is not read
for what it means. Every other member a declaration holds that the draft does not carry — a tool's
configuration, a crew's `inputs` — is named, never valued.

### The settings it reads

The CrewAI importer reads `target_namespace`, `empty_credentials` and `render_mode`, as
[Settings](#settings) describes them, and no other setting.

## The LangGraph importer

`importer/langgraph` reads the graphs a LangGraph application's configuration, `langgraph.json`,
declares, and drafts an Aggregate holding one instance of the standard library's LangGraph
agent, `core/ai-agent/langgraph`, per graph, each wired to the datastore its checkpointer keeps state
in and to a model, and a Release beside it carrying the environment the configuration states. It reads that
configuration, and never the graphs' code.

### What it reads

A LangGraph application keeps its graphs in code and declares them in `langgraph.json`: under
`graphs`, each graph's id maps to the import path of the graph in the application's code —
`./src/agent/graph.py:graph`, or `module:attr` — or to an object naming that path under `path` and
describing the graph under `description`. The importer reads, in the order the configuration writes
them:

- `graphs` — each graph's id, its import path and its description;
- `checkpointer` — its `backend`: `default`, which is PostgreSQL and what LangGraph reads where none is
  named; `mongo`, a database speaking MongoDB's protocol; or `custom`, a checkpointer the application's
  code defines at `path`;
- `store` — the memory store, which names no backend: LangGraph keeps it in the PostgreSQL database its
  server uses;
- `env` — the environment the application runs with: an object of variable names to values, or the path
  of an environment file of `KEY=VALUE` lines.

The members that configure the server image `langgraph build` builds — `dependencies`, `source`,
`python_version`, `node_version`, `base_image`, `image_distro`, `dockerfile_lines`, `pip_config_file`,
`pip_installer`, `keep_pkg_tools`, `api_version` — are named in a comment and carried nowhere, since
the image the Release names is the application's own; so is every other member, the server's own
configuration such as `auth`, `http` and `webhooks` among them, and so are the store's `index` and
`ttl` and the checkpointer's `ttl` and `serde`.

A directory is handed to the importer as `langgraph.json` and no other file, so neither the
application's code nor an environment file is ever read from it. An environment file reaches the
importer only where the importer's `with.sources` hands it, and is never parsed: of the one the
configuration's `env` names — matched by the last segment of the path it names — only the variables'
names are read, and an environment file no configuration names is named in a comment as not read.
Where the import is not handed the file the configuration names, the Aggregate names it as not handed
and says to name it under the importer's `with.sources`, and its variables are left for the Release:

```yaml
plugins:
  importer:
    - uri: importer/langgraph:<version>
      with:
        sources:
          - ./local.env
```

A configuration imported on its own is read whatever its name. A directory may hold several
applications, each read from its own directory.

### What an application becomes

`aggregate.yaml` is a draft Aggregate named after the graph, as
[How a draft is named](#how-a-draft-is-named) describes, opening with comments naming the
configurations read, the environment files read for their names alone, that the application's code is
not read, and what the draft does not carry. It holds, per graph and keyed by its id, an instance of
`core/ai-agent/langgraph` with:

- `graph_entrypoint`, the graph's import path, as the configuration writes it;
- `description`, the graph's description, where the configuration gives one;
- its `checkpointer_db` connection, wired to the application's datastore;
- its `model` connection, wired to the application's model.

`recursion_limit` is not written, so the Component's default, 25, stands. The configuration names no
model, so the draft holds one instance of `core/ai-model/openai`, keyed `model`, which every graph
calls: the model the agent's OpenAI client is handed. Its `values.model` is written empty, under a
comment saying the configuration names none, and the import owes it.

The checkpointer's backend is the datastore every graph of the application is wired to: `default`, or a
checkpointer naming no backend, is an instance of `core/datastore/postgres`, keyed `postgres`. `mongo`
is FerretDB, which speaks MongoDB's protocol, over PostgreSQL with the DocumentDB extension: an
instance of `core/datastore/ferretdb`, keyed `ferretdb`, which every graph is wired to, and one of
`core/datastore/documentdb`, keyed `documentdb`, which FerretDB's `backend` connection reaches, its
`inject` block delivering what DocumentDB publishes under the names FerretDB reads; one password,
read from the variable `FERRETDB_PASSWORD`, is attached on DocumentDB, on FerretDB's connection to it
and on each graph's connection to FerretDB. Where the workspace's catalog holds no Component of the
PostgreSQL datastore's name, one is drafted, `<target_namespace>/datastore/postgres`, declaring the
`host` and the `port` the agent's `checkpointer_db` connection reads, and its decision says so; a
Recipe running the datastore and publishing them is left for you, as a comment opening it says. Where
it holds no FerretDB or no DocumentDB Component, the `mongo` checkpointer is wired to no datastore. A
`custom` checkpointer, or a backend the importer maps to no datastore, wires nothing, and a comment
above each graph and the checkpointer's decision say why; the build halts naming the
`checkpointer_db` socket until one is wired. The store is reported in a decision that chooses nothing.

The datastore's password is a secret the draft attaches by reference, on the datastore's own
`password` slot and on each graph's `checkpointer_db` connection, and so is the credential each graph
presents to the model on its `model` connection: read from `POSTGRES_PASSWORD` (or
`FERRETDB_PASSWORD`) and `OPENAI_API_KEY`, since the configuration names no variable for either, as a
`${…}` reference on every target but helm, and on helm as the name of a Kubernetes Secret, written
empty for the import to owe. On compose, the Aggregate declares each with the key its Recipe reads,
as [Secrets, for each target](#secrets-for-each-target) describes for a platform.

`release.yaml`, beside it, is a draft Release of the same name naming that Aggregate. Comments above
the first graph's entry say what each graph's image is — the application's own, its code with
LangGraph installed, not the server image `langgraph build` builds — the variables it is handed and
which `inject:` block replaces which of their names. Each graph's entry writes its `infra.image`, the
image running the application, empty under a comment saying what it is, and the import owes it; the
Docker Compose Recipe runs the catalog's own [quickstart agent](../examples/quickstart-ai/README.md),
which reads the default variables, while it is unset. With `--target compose` each graph's entry also
writes `infra.published_port`, 8000, the port the Component's `infra.port` names for the application
by default, which its Compose Recipe publishes on the host's loopback address, 127.0.0.1, under the
comment saying it is reachable from this machine only, by any process running on it, and that
deleting the line keeps the service internal; a second graph takes the next free port. The datastore
and the model have entries too, so the Release places them with the graphs. A comment above the application's first graph states the
environment its configuration declares, as
[The environment a configuration states](#the-environment-a-configuration-states) describes. Like
every drafted Release, it writes `metadata.environment` as `development` and, with no target, an empty
`spec.manifest` the import owes; given a target, the import drafts the Manifest, as
[What a target adds](#what-a-target-adds) describes.

The Python application this importer's tests import, declaring two graphs, a checkpointer naming no
backend, a store and an `env` written as an object, is drafted, with no setting, as below; imported as
its directory, `support_desk` — named, as here, after the package its graphs are defined in — with two
graphs whose ids differ, it is named after that directory:

```yaml
# aggregate.yaml
# LangGraph configurations read:
#   - langgraph.json
# Not read: the application's code, which defines each graph; it runs in the image the Release names for each graph.
# Not carried, since they configure the server image langgraph build builds, and the image the Release names is the application's own: dependencies, python_version.
# Not carried, since core/ai-agent/langgraph takes no value for them: http.
# The store configures the memory store, which LangGraph keeps in the PostgreSQL database its server uses; not carried, since core/ai-agent/langgraph takes no value for it: index, ttl.
# Not carried, since core/ai-agent/langgraph takes no value for them: checkpointer.ttl.
apiVersion: aggrega.ai/v1beta1
kind: Aggregate
metadata:
  name: imported/support-desk
  version: 0.1.0
  description: Draft Aggregate imported from a source in the langgraph format.
spec:
  components:
    triage:
      type: core/ai-agent/langgraph
      values:
        graph_entrypoint: "./src/support_desk/triage.py:make_graph"
        description: "Routes an incoming ticket to the {team} that owns it."
      uses:
        checkpointer_db:
          postgres:
            target: postgres
            # For the compose target only, uncomment the lines below, which declare credential on postgres: a secret the Release alone attaches arrives under the key value, so each is declared with a key of its own and no two arrive under one; the Release attaches its origin, naming this type or none.
            # features:
            #   credential:
            #     type: core/secret-value
            #     values:
            #       key: POSTGRES_PASSWORD
        model:
          model:
            target: model
            # For the compose target only, uncomment the lines below, ...
    support:
      type: core/ai-agent/langgraph
      ...
    # The database the configuration's checkpointer keeps each graph's state in, PostgreSQL.
    postgres:
      type: core/datastore/postgres
      # For the compose target only, uncomment the lines below, ...
    # The model every graph calls, which the configuration does not name.
    model:
      type: core/ai-model/openai
      values:
        # Left for the author, since the configuration names no model: values.model, the name of the model core/ai-model/openai serves.
        model: ""
```

```yaml
# release.yaml
spec:
  aggregate: imported/support-desk
  # manifest: left empty, since the import was given no target; an import given a target drafts the Manifest and names it here.
  manifest: ""
  components:
    # Each graph's image is the application's own, not the server image langgraph build builds: its code, with LangGraph installed.
    # It is handed, for its code to read, the graph to run as LANGGRAPH_GRAPH_ENTRYPOINT, the model's name as OPENAI_MODEL, the checkpointer store's host and port as LANGGRAPH_CHECKPOINTER_HOST and LANGGRAPH_CHECKPOINTER_PORT, its user and database, where the store publishes them, as LANGGRAPH_CHECKPOINTER_USER and LANGGRAPH_CHECKPOINTER_DATABASE, and a password attached on the checkpointer_db connection as LANGGRAPH_CHECKPOINTER_PASSWORD.
    # It is also handed the model's address as OPENAI_BASE_URL and a key attached on the model connection as OPENAI_API_KEY, which the OpenAI client library reads, and recursion_limit as LANGGRAPH_DEFAULT_RECURSION_LIMIT, which LangGraph reads.
    # An inject: block on the graph's own instance, through an entry reading graph_entrypoint alone, replaces LANGGRAPH_GRAPH_ENTRYPOINT with the name it writes; one on the model connection replaces OPENAI_MODEL, and one on the checkpointer_db connection the store's host, port, user and database, with the names it writes.
    # The environment langgraph.json states for its application, for the Release to carry where core/ai-agent/langgraph takes it for each of its graphs:
    #   SUPPORT_QUEUE: "..."
    #   OPENAI_API_KEY: "..."
    #   MAX_TICKETS: "25"
    triage:
      infra:
        # Left for the Release, since the source cannot supply it: infra.image, the container image running the application
        image: ""
      uses:
        checkpointer_db:
          postgres:
            features:
              credential:
                type: core/secret-value
                infra:
                  # Attached by reference, never as a value: the credential triage presents to postgres on its checkpointer_db connection, the password of postgres (the configuration names no variable for it), read from the variable POSTGRES_PASSWORD, which a target substituting variable references, as Docker Compose does when the stack starts, reads from the environment, so no file carries the value.
                  origin: "${POSTGRES_PASSWORD}"
        model:
          model:
            features:
              credential:
                type: core/secret-value
                infra:
                  # Attached by reference, never as a value: the credential triage presents to model on its model connection (the source names no variable for it, so it is read from the one OpenAI's client libraries read the API key from), read from the variable OPENAI_API_KEY, which a target substituting variable references, as Docker Compose does when the stack starts, reads from the environment, so no file carries the value.
                  origin: "${OPENAI_API_KEY}"
    ...
    postgres:
      features:
        password:
          type: core/secret-value
          infra:
            # Attached by reference, never as a value: the password of postgres (the configuration names no variable for it), read from the variable POSTGRES_PASSWORD, which a target substituting variable references, as Docker Compose does when the stack starts, reads from the environment, so no file carries the value.
            origin: "${POSTGRES_PASSWORD}"
    model: {}
```

The import owes four values: `spec.manifest`, each graph's image and the model's name. Once they are
answered, each graph is rendered running the image you answer, given its datastore's address as
`LANGGRAPH_CHECKPOINTER_HOST` and `LANGGRAPH_CHECKPOINTER_PORT`, the user and the database the datastore
publishes as `LANGGRAPH_CHECKPOINTER_USER` and `LANGGRAPH_CHECKPOINTER_DATABASE` — PostgreSQL publishes
both, and a datastore publishing neither has neither variable rendered — the model's endpoint and name as
`OPENAI_BASE_URL` and `OPENAI_MODEL`, the key its model credential delivers as `OPENAI_API_KEY`,
its import path as `LANGGRAPH_GRAPH_ENTRYPOINT` and its step limit as
`LANGGRAPH_DEFAULT_RECURSION_LIMIT`. The credential attached on its `checkpointer_db` connection gives
it the datastore's password as `LANGGRAPH_CHECKPOINTER_PASSWORD` too.

### The environment a configuration states

Every variable the configuration's `env` names is an input for the Release to supply, and none is
drafted as a credential slot: LangGraph marks no variable as a secret, and a variable's name is not read
for what it means. `core/ai-agent/langgraph` takes no value for the environment, so the Release states
it in a comment above the application's first graph.

- **An `env` written as an object** is part of the configuration, so its values are carried as written
  into that comment, in the order the configuration writes them. Each value that holds something can
  carry a credential, which LangGraph marks as none: by default each is carried as written and named in
  a `credential-carried` warning by its configuration and its variable, such as `env.OPENAI_API_KEY`,
  never by its value. With the [`empty_credentials` setting](#settings) at `all`, each is written with
  no value and reported with `credential-emptied`; at `marked` each is carried, since LangGraph marks
  none.
- **An `env` naming a file** names a file the configuration only points at, which commonly holds local
  secrets. It is read only where the importer's `with.sources` hands it. The comment names each
  variable the file names, left for the Release to supply, and no value of the file is read: none
  reaches a draft, a decision or a diagnostic, whatever the setting says. A value quoted across
  several lines is one value, so a line inside it is never taken for a variable, and a line naming no
  variable is named by its number. Where the import was not handed the file — always so for a
  directory, which never hands one — the Aggregate names it as not handed, with how to hand it, and its
  variables are left for the Release.

### The settings it reads

The LangGraph importer reads `target_namespace`, `empty_credentials` and `render_mode`, as
[Settings](#settings) describes them, and no other setting.

## The Google ADK importer

`importer/google-adk` reads the agents an application built on Google's Agent Development Kit (ADK)
declares in its Agent Config files — `root_agent.yaml` and the configurations its sub-agents name — and
drafts an Aggregate holding one instance of the standard library's ADK agent,
`core/ai-agent/google-adk`, per agent tree, wired to the model the tree names where ADK sends its
requests to the Gemini API, and a Release beside it. It reads those configurations, and never the
application's code.

ADK states that its Agent Config feature is experimental. An agent's model is a Gemini model by
default; ADK serves some other providers' models by name through classes of its own, such as
`claude-sonnet-4-5` and `gpt-4o`, and others through a LiteLLM model string. The agent's `model` socket
admits the Gemini API alone, so the importer wires a model ADK sends to the Gemini API and leaves any
other for you, as [What an agent tree becomes](#what-an-agent-tree-becomes) describes.

### What it reads

ADK's `adk create --type=config` writes `root_agent.yaml`, the configuration of an application's root
agent, and an environment file beside it. A configuration declares one agent:

- `name`, `description` and `agent_class` — the class ADK builds the agent as, `LlmAgent` where it names
  none;
- `model` — the model the agent asks for — or `model_code`, a reference to code building its model;
- `tools` — each tool by `name`, with the `args` its configuration hands it;
- `generate_content_config` — the options of the agent's model requests, among them `http_options`;
- `sub_agents` — each a `config_path`, another configuration's path from the directory of the
  configuration naming it, or `code`, an agent the application's code builds.

A directory is handed to the importer as its `root_agent.yaml` files and no other file, and a
configuration imported on its own is read as a root, whatever its name. Each root's tree is read root
first, each agent's sub-agents in the order it lists them. The configuration a `sub_agents` entry names
by `config_path` is read only where the importer's `with.sources` hands it, matched by the last segment
of the path; one the import was not handed is named in the Aggregate and in its decision as not handed,
with how to hand it, and its agent is not read:

```yaml
plugins:
  importer:
    - uri: importer/google-adk:<version>
      with:
        sources:
          - ./my_agent/code_tutor_agent.yaml
          - ./my_agent/math_tutor_agent.yaml
```

A `config_path` that is absolute, or leads out of the directory of the configuration naming it, is not
read, as ADK refuses it too. A file `with.sources` hands that no configuration names is named in a
comment as not read, and nothing of it is read; a file it hands is read only as a configuration a root's
tree names, so an import holding no `root_agent.yaml` and no file imported on its own reads no tree and
reports each file under `no-nodes`. The application's code — the tools, callbacks, schemas and agents a
configuration names by their code — and the environment file are never handed, and the importer reads
neither: the application loads its configurations itself, from the image the Release names. A
directory may hold several applications, each read from its own `root_agent.yaml`.

The other members of a configuration — an agent's `instruction` among them — are read by the
application from its own configuration, so the draft carries none of them.

### What an agent tree becomes

ADK serves an application from its root agent, every agent its configurations name built inside it, and
`core/ai-agent/google-adk` runs one such application. So `aggregate.yaml`, a draft Aggregate named
after the root agent, as [How a draft is named](#how-a-draft-is-named) describes, holds, per agent tree and keyed by its root agent's name, an instance of
`core/ai-agent/google-adk` with:

- `description`, the root agent's description, where its configuration gives one;
- its `model` connection, wired to the model the tree names where ADK sends its requests to the Gemini
  API.

Comments above it name the tree's other agents, which become no instance of their own; each sub-agent
that is not read, and why — built by the application's code, a configuration the import was not handed,
or one ADK refuses; the tools the tree's agents name, those ADK ships and those the application's code
defines; the agents whose class — `LoopAgent`, `ParallelAgent` or `SequentialAgent` — ADK deprecates in
favour of Workflow; and, where the tree's model is wired, the models other agents of the tree ask for,
each with the family ADK serves it through. Each is reported in a decision that chooses nothing.

The first agent of the tree, the root first, naming a model or the code building one decides the
instance's model. A model it names whose requests ADK sends to the Gemini API — a model name ADK
serves through its Gemini class, such as `gemini-2.5-flash`, other than a Vertex AI resource name, or
one it serves through its Gemma class — is an instance of `core/ai-model/gemini`, serving that model
and keyed by it, and trees naming one model share one instance. Where the workspace's catalog holds no
`core/ai-model/gemini`, one is drafted, `<target_namespace>/ai-model/gemini`, carrying the
`model.aggrega.ai/api: gemini` label the agent's `model` socket selects, and its decision says so; a
Recipe publishing its endpoint and its model is left for you, as a comment opening it says. A model
ADK serves any other way — a LiteLLM model string such as `openai/gpt-4o`, a Vertex AI resource name,
or a name such as `claude-sonnet-4-5` or `gpt-4o`, which ADK serves through Anthropic or OpenAI — is
wired to nothing: the agent's `model` socket takes a Gemini model, and the agent reads no model name
from its environment, so you wire a Gemini model there and name that model in the agent's
configuration. The comment above the instance and the root agent's decision name the model and the
family ADK serves it through. A model the application's code builds, or a tree naming none — ADK then
uses its default model — is wired to nothing too, and a comment above the instance says why. Wherever
the model is wired to nothing, the build halts naming the `model` socket until one is wired. Of the
models other agents of a tree ask for, one whose requests ADK sends to the Gemini API needs no
connection of its own: ADK's Gemini client sends it with the key the instance's connection delivers.
Whether the application reaches Gemini through the Gemini API or through Vertex AI is chosen by its
environment, which the import does not read; the agent's `model` socket admits the Gemini API alone.

The importer's tests also import a lone root agent naming `openai/gpt-4o`, whose instance is drafted
as:

```yaml
spec:
  components:
    # The agent tree of root_agent.yaml, served from its root agent routed_agent.
    # The model connection is left for the author, since the model openai/gpt-4o, which routed_agent names, is one ADK serves through LiteLLM, not through the Gemini API, while core/ai-agent/google-adk takes a Gemini model on its model socket and reads no model name from its environment, so the author wires a Gemini model there and names that model in routed_agent's configuration; the build halts naming the socket until one is wired.
    routed-agent:
      type: core/ai-agent/google-adk
      values:
        description: "Answers questions with a model another provider serves."
```

`release.yaml`, beside it, is a draft Release of the same name naming that Aggregate. Each instance's
entry writes its `infra.image` — the image running the application built on ADK, which holds its
configurations — empty, under a comment saying what it is, and the import owes it. With
`--target compose` the entry also writes `infra.published_port`, 8000, the port the application
listens on, which its Compose Recipe publishes on the host's loopback address, 127.0.0.1, under the
comment saying it is reachable from this machine only, by any process running on it, and that deleting
the line keeps the service internal; a second tree takes the next free port. Where its model is
wired, the entry attaches the credential the instance presents to that model under `credential` on
its `model` connection, by reference and never as a value: no configuration names a variable for it,
so it is read from `GOOGLE_API_KEY`, the variable Google's Gemini API client libraries read their key
from, as a `${…}` reference on every target but helm, and on helm as the name of a Kubernetes Secret,
written empty for the import to owe; on compose, the `model` connection declares it with that key. A
wired model has an entry too, holding no infrastructure, so the Release places it with the instance.
The values the tree's configurations hand their tools and their model requests are written in a
comment above the entry, as
[Credential values a configuration holds](#credential-values-a-configuration-holds) describes. Like
every drafted Release, it writes `metadata.environment` as `development` and, with no target, an empty
`spec.manifest` the import owes; given a target, the import drafts the Manifest, as
[What a target adds](#what-a-target-adds) describes.

The application this importer's tests import, a root agent naming two sub-agents' configurations and
one built by code, imported as its directory with the two configurations named under `with.sources`,
is drafted, with no setting, under its root agent's name, `tutor_root`, as:

```yaml
# aggregate.yaml
# Google ADK agent configurations read:
#   - root_agent.yaml
#   - code_tutor_agent.yaml
#   - math_tutor_agent.yaml
# Not read: the application's code, which defines the tools, callbacks and agents a configuration names by their code, nor the environment file ADK's scaffold writes beside root_agent.yaml; the application runs in the image the Release names for each instance, and loads its configurations itself.
# ADK states that its Agent Config is experimental. An agent's model is a Gemini model by default; ADK serves some other providers' models by name through classes of its own, such as claude-sonnet-4-5 and gpt-4o, and others through a LiteLLM model string.
apiVersion: aggrega.ai/v1beta1
kind: Aggregate
metadata:
  name: imported/tutor-root
  version: 0.1.0
  description: Draft Aggregate imported from a source in the google-adk format.
spec:
  components:
    # The agent tree of root_agent.yaml, served from its root agent tutor_root.
    # Sub-agents ADK builds inside this application, drafted as no instance of their own: code_tutor_agent, math_tutor_agent.
    # Not read: a sub-agent of tutor_root, which is built by the application's code at tutor_agents.review_agent, which the import does not read.
    # Tools ADK ships, which run inside the application, drafted as no Component: google_search.
    # Tools the application's code defines, drafted as no Component: tutor_tools.make_snippet_runner.
    # Models other agents of the tree ask for, ...: gemini-pro-latest (math_tutor_agent, served through Gemini).
    tutor-root:
      type: core/ai-agent/google-adk
      values:
        description: "Learning assistant that tutors {{`{{`}} students }} in code and math."
      uses:
        model:
          gemini-flash-latest:
            target: gemini-flash-latest
            # For the compose target only, uncomment the lines below, which declare credential on gemini-flash-latest: a secret the Release alone attaches arrives under the key value, so each is declared with a key of its own and no two arrive under one; the Release attaches its origin, naming this type or none.
            # features:
            #   credential:
            #     type: core/secret-value
            #     values:
            #       key: GOOGLE_API_KEY
    # The model gemini-flash-latest.
    gemini-flash-latest:
      type: core/ai-model/gemini
      values:
        model: "gemini-flash-latest"
```

A text the draft copies from a configuration into the Aggregate, in a value or in a comment, writes each
`{{` as ``{{`{{`}}``, an action whose result is the two braces, so the description, and a name holding
two braces in a comment, read back as written once the Aggregate is evaluated.

```yaml
# release.yaml
spec:
  aggregate: imported/tutor-root
  # manifest: left empty, since the import was given no target; an import given a target drafts the Manifest and names it here.
  manifest: ""
  components:
    # The configurations also hand these values to their tools and their model requests, which the application reads from its own configurations, written here for review:
    #   code_tutor_agent tools.tutor_tools.make_snippet_runner.args.api_key: "..."
    #   code_tutor_agent tools.tutor_tools.make_snippet_runner.args.sandbox: "python3.12"
    #   code_tutor_agent tools.tutor_tools.make_snippet_runner.args.timeout_seconds: 20
    #   math_tutor_agent generate_content_config.http_options.headers: "..."
    #   math_tutor_agent generate_content_config.http_options.timeout: 30000
    tutor-root:
      infra:
        # Left for the Release, since the source cannot supply it: infra.image, the container image running the application built on ADK, holding its configurations
        image: ""
      uses:
        model:
          gemini-flash-latest:
            features:
              credential:
                type: core/secret-value
                infra:
                  # Attached by reference, never as a value: the credential tutor-root presents to gemini-flash-latest on its model connection (the source names no variable for it, so it is read from the one Google's Gemini API's client libraries read the API key from), read from the variable GOOGLE_API_KEY, which a target substituting variable references, as Docker Compose does when the stack starts, reads from the environment, so no file carries the value.
                  origin: "${GOOGLE_API_KEY}"
    gemini-flash-latest: {}
```

Once the image is answered, the instance is rendered running it and given the credential as `GOOGLE_API_KEY`, which
ADK's Gemini client sends to the Gemini API, and the model as a Service reaching the Gemini API's
address.

### Credential values a configuration holds

A configuration can hand a key to a tool, in its `args`, or to its model requests, in the
`http_options` of its `generate_content_config` — their headers, their address, the arguments of their
client. Each member of a tool's `args` and of those HTTP options is written in the comment above the
instance's entry in the Release, as its configuration writes it, and each that is a text, an object or
a list can carry a credential, which ADK marks as none: by default each is carried as written and named
in a `credential-carried` warning by its agent and its field, such as
`tools.tutor_tools.make_snippet_runner.args.api_key`, never by its value. With the
[`empty_credentials` setting](#settings) at `all`, each is written with no value and reported with
`credential-emptied`; at `marked` each is carried, since ADK marks none. A number or a boolean carries
no key, and is written as the configuration writes it. ADK expands no variable reference in a
configuration, so every value is read as written; the environment file, which commonly holds the key
ADK's Gemini client reads, is never read, whatever the setting says.

### The settings it reads

The Google ADK importer reads `target_namespace`, `empty_credentials` and `render_mode`, as
[Settings](#settings) describes them, and no other setting.

## The Agent Framework importer

`importer/agent-framework` reads a Microsoft Agent Framework declarative agent — the YAML document of
kind `Prompt` an application built on Agent Framework loads an agent from — and drafts an Aggregate
holding one instance of the standard library's Agent Framework agent, `core/ai-agent/agent-framework`,
wired to the OpenAI model it names, and a Release beside it. It reads
declarative agents, and never the application's code. Agent Framework publishes its declarative-agent
packages as prereleases.

### What it reads

A declarative agent declares:

- `name`, `displayName` and `description`, its `instructions` and the schemas of its input and its
  output;
- `model` — the model's `id`, the `provider` serving it, the API its client sends requests to
  (`apiType`), the `options` of its requests, and its `connection`: a `key` connection presenting a key,
  written under `key` or `apiKey`, to an `endpoint`; a `remote` connection reaching an `endpoint`; a
  `reference` connection naming one the application resolves; or an `anonymous` one presenting nothing;
- `tools` — each of a `kind`: a `function` whose code the application binds, a `web_search`,
  `file_search` or `code_interpreter` tool the model's provider runs, or an `mcp` server reached at its
  `url`, with the `approvalMode` its calls take, the `allowedTools` of the server the agent may call and
  a `connection` of its own.

A member written as `=Env.NAME` is read by Agent Framework from the environment variable `NAME` only
where the application loads the declarative agent with `AgentFactory(safe_mode=False)`, Agent Framework's
own security setting, and a .NET runtime is present, and is otherwise taken as the expression's text as
written; any other member opening with `=` is an expression the application computes. The importer reads neither:
it names a reference by its variable, and an expression as one.

A file imported on its own is read as one declarative agent, whatever it is called, and each file the
importer's `with.sources` hands is read as another, so one import drafts several:

```yaml
plugins:
  importer:
    - uri: importer/agent-framework:<version>
      with:
        sources:
          - ./agents/triage.yaml
          - ./agents/writer.yaml
```

A directory is never handed to the importer: its signature names no file, so an import of a directory
naming no format does not recognise it, and one naming `--format agent-framework` is refused under
[An importer that declares no file patterns is handed a directory](../errors/fatal-halts.md#an-importer-that-declares-no-file-patterns-is-handed-a-directory)
before any file of it is opened. Import each declarative agent as a file of its own instead. A source
Agent Framework builds no prompt agent from — one whose `kind` is neither `Prompt`, in any letter case,
nor `Agent` — is reported under `no-nodes`. The application's code — the program loading each
declarative agent and the functions it binds to its tools — is never among the sources: the
application loads its declarative agents itself, from the image the Release names.

### What a declarative agent becomes

`aggregate.yaml`, a draft Aggregate named after the agent, as
[How a draft is named](#how-a-draft-is-named) describes, holds, per declarative agent and
keyed by its name, an instance of `core/ai-agent/agent-framework` with:

- `display_name` and `description`, the agent's `displayName` and `description`, where it states
  them;
- its `model` connection, wired to the model it names, where that model is wired.

Its instructions, the schemas of its input and its output, its template, its metadata and the options
of its model requests are read by the application from the declarative agent, and are named in a
comment above the instance. A function tool, a tool the model's provider runs and a tool of any other
kind are named in a comment too, and reported in a decision that chooses nothing.

A model whose `provider` is `OpenAI` and which names an `id` is an instance of `core/ai-model/openai`,
serving that id and keyed by it: the agent's `model` socket admits a model serving the OpenAI API, and
the runtime delivers that model's address, name and key in the variables Agent Framework's OpenAI
clients read. Agents naming one model at one address share one instance. Where the workspace's catalog
holds no `core/ai-model/openai`, one is drafted, `<target_namespace>/ai-model/openai`, carrying the
`model.aggrega.ai/api: openai` label the agent's `model` socket selects, and its decision says so; a
Recipe publishing its endpoint and its model is left for you, as a comment opening it says. An `id`
written as a reference leaves the model's `values.model` for you, a comment above the model naming the
variable; the build halts naming it until it is set. An `anonymous` connection is written as the
connection's `unauthenticated: true`. A model of any other provider — `AzureOpenAI`, `Anthropic` — one
naming its provider as a reference or none, in which case Agent Framework uses the default provider the
application sets, and one naming no `id` is wired to nothing, and a comment above the instance says
why; the build halts naming the `model` socket until one is wired.

A tool of kind `mcp` is drafted as no Component and no connection: Agent Framework sends the server to
the model's provider as a hosted tool, and the provider, not the application, reaches it at its `url`,
which must therefore be reachable from the provider, so nothing the draft deploys reaches it. A comment
above the agent's instance names the server, says so, and names the description, the `approvalMode` and
the `allowedTools` the declarative agent states for it; its `url` is written, whole, in the comment above
the agent's entry in the Release, and its decision chooses nothing.

`release.yaml`, beside it, is a draft Release of the same name naming that Aggregate. The agent's entry
writes its `infra.image` — the image running the application built on Agent Framework, which holds
its declarative agent — empty, under a comment saying what it is, and the import owes it. With
`--target compose` the entry also writes `infra.published_port`, 8000, the port the Component's
`infra.port` names for the application by default, which its Compose Recipe publishes on the host's
loopback address, 127.0.0.1, under the comment saying it is reachable from this machine only, by any
process running on it, and that deleting the line keeps the service internal. Where its
model is wired, the entry attaches the credential the agent presents to that model under `credential`
on its `model` connection, by reference and never as a value: read from the variable the declarative
agent names for its key, written `=Env.NAME`, and otherwise from `OPENAI_API_KEY`, the variable
OpenAI's client libraries read their key from; as a `${…}` reference on every target but helm, and on
helm as the name of a Kubernetes Secret, written empty for the import to owe; on compose, the `model`
connection declares it with that key. The values the declarative agent states for its model and its
MCP servers — the keys, and each server's `url` — are written in a comment above the agent's entry, as
[Credential values a declarative agent holds](#credential-values-a-declarative-agent-holds) describes.
Each wired model has an entry, so the Release places it with the agent. The endpoint its connection
states is written as the model's `infra.endpoint`, and one written as a reference is named beside its
entry, the Component's own address used until it is set; a connection stating no endpoint leaves the
entry holding no infrastructure, the Component's own address standing. Like every drafted Release, it
writes `metadata.environment` as `development` and, with no target, an empty `spec.manifest` the
import owes; given a target, the import drafts the Manifest, as [What a target adds](#what-a-target-adds)
describes.

The declarative agent this importer's tests import, of the OpenAI provider with a key connection, an MCP
server presenting a key of its own, a function tool and a web search, imported as a file of its own,
is drafted, with no setting, under its `name`, `LearnAgent`, as:

```yaml
# aggregate.yaml
# Not read: the application's code, which loads each declarative agent and binds the functions of its function tools; the application runs in the image the Release names for each instance, and loads its declarative agents itself.
apiVersion: aggrega.ai/v1beta1
kind: Aggregate
metadata:
  name: imported/learnagent
  version: 0.1.0
  description: Draft Aggregate imported from a source in the agent-framework format.
spec:
  components:
    # The declarative agent LearnAgent.
    # Read by the application from the declarative agent, and taken by no key of core/ai-agent/agent-framework: instructions, outputSchema, the options of its model requests (temperature, topP).
    # Function tools, whose code the application binds, drafted as no Component: GetRelease.
    # Tools the model's provider runs, drafted as no Component: search.
    # The MCP server microsoft_learn, drafted as no Component and no connection, since Agent Framework sends it to the model's provider as a hosted tool, and the provider, not the application, reaches it at its url, which must therefore be reachable from the provider; its url is written above learnagent's entry in the Release.
    # Stated by the declarative agent for microsoft_learn: its description, "Get information from Microsoft Learn."; its approval mode, never; the tools of the server it allows, microsoft_docs_search, microsoft_docs_fetch.
    learnagent:
      type: core/ai-agent/agent-framework
      values:
        display_name: "Learn Assistant"
        description: "Answers questions about {{`{{`}} product }} from the Microsoft Learn content."
      uses:
        model:
          gpt-4-1-mini:
            target: gpt-4-1-mini
            # For the compose target only, uncomment the lines below, which declare credential on gpt-4-1-mini: a secret the Release alone attaches arrives under the key value, so each is declared with a key of its own and no two arrive under one; the Release attaches its origin, naming this type or none.
            # features:
            #   credential:
            #     type: core/secret-value
            #     values:
            #       key: OPENAI_API_KEY
    # The model gpt-4.1-mini, which LearnAgent names with the OpenAI provider.
    gpt-4-1-mini:
      type: core/ai-model/openai
      values:
        model: "gpt-4.1-mini"
```

A text the draft copies from a declarative agent into the Aggregate, in a value or in a comment, writes
each `{{` as ``{{`{{`}}``, so it reads back as written once the Aggregate is evaluated.

```yaml
# release.yaml
spec:
  aggregate: imported/learnagent
  # manifest: left empty, since the import was given no target; an import given a target drafts the Manifest and names it here.
  manifest: ""
  components:
    # The declarative agent also states these values for its model and its MCP servers, written here for review:
    #   - model.connection.key: "..."
    #   - tools.microsoft_learn.url: "https://learn.microsoft.com/api/mcp?session=..."
    #   - tools.microsoft_learn.connection.key: "..."
    learnagent:
      infra:
        # Left for the Release, since the source cannot supply it: infra.image, the container image running the application built on Agent Framework, holding its declarative agent
        image: ""
      uses:
        model:
          gpt-4-1-mini:
            features:
              credential:
                type: core/secret-value
                infra:
                  # Attached by reference, never as a value: the credential learnagent presents to gpt-4-1-mini on its model connection (the source names no variable for it, so it is read from the one OpenAI's client libraries read the API key from), read from the variable OPENAI_API_KEY, which a target substituting variable references, as Docker Compose does when the stack starts, reads from the environment, so no file carries the value.
                  origin: "${OPENAI_API_KEY}"
    gpt-4-1-mini:
      infra:
        endpoint: "https://llm-gateway.example.com/v1"
```

Once the image is answered, the agent is rendered running it and given the model's endpoint as `OPENAI_BASE_URL`, its
id as `OPENAI_MODEL` and its credential as `OPENAI_API_KEY`, and the model is rendered as a Service
reaching its host. No variable carries the MCP server's address: the model's provider, not the
application, reaches it.

### Credential values a declarative agent holds

The key a `key` connection presents — written under `key` or `apiKey`, on the model or on an MCP server
— is the one member Agent Framework marks as a credential: it is the one value its loader redacts from
what it logs. Each key a declarative agent writes as a literal is written in the comment above the
agent's entry in the Release, as the declarative agent writes it, and by default carried as written and
named in a `credential-carried` warning by its agent and its field, such as `model.connection.key`,
never by its value. An MCP server's `url`, written whole in the same comment and named by its field —
`tools.microsoft_learn.url of node LearnAgent is carried as written` — is a member of an MCP server's
configuration, and a wired model's endpoint is an input Agent Framework marks as no credential. With the
[`empty_credentials` setting](#settings) at `marked`, the keys and the MCP servers' `url`s are written
with no value — the comment naming each by its field alone — and reported with `credential-emptied`,
and the model's endpoint is carried; at `all`, the model's `infra.endpoint` is left out too, named in
the comment above its entry as left for the Release, and the Component's default address is used until
it is set. A value written as `=Env.NAME` holds none, so it is named by its variable,
together with the condition under which Agent Framework reads it from the environment —
`model.connection.key, written as =Env.OPENAI_API_KEY, which Agent Framework reads …` — whatever the
setting says, and reported under neither code; a value written as any other expression is named as one
and never written.

### The settings it reads

The Agent Framework importer reads `target_namespace`, `empty_credentials` and `render_mode`, as
[Settings](#settings) describes them, and no other setting.

## The resource-schema importers

The `importer/cloudformation-schema`, `importer/terraform-schema` and `importer/arm-schema` importers
read a vendor's description of a resource type rather than a project, and draft what the catalog needs
to deploy that type: a Component and a Recipe, written under `catalog/` in the standard library's layout,
so the workspace's `catalog` folder holds them at the next validate and build. They draft no Aggregate,
no Release and no Manifest, and `--target` composes nothing for them: the format implies the provider,
which is the Recipe's `capability` — `cloudformation`, `terraform` or `arm`. One named resource type
drafts one resource, and nothing else is written into the Recipe. [Deploy a service the catalog does not
have](../../authoring/import/resource-schemas.md) works the three from a schema to a build.

The importers share one reading of a type — its name, description, a tree of properties and each
property's flags — and differ in how each format is read and how each provider's Recipe is written.

### What they read

| Plugin | Recognised by | Directory |
| --- | --- | --- |
| `importer/cloudformation-schema` | a `*.json` file holding a string at `typeName` and an object at `properties`, a provider schema; or a string at `TypeName` and a string at `Schema`, the output of `aws cloudformation describe-type`, whose `Schema` the importer reads as a second source | every `*.json` it holds |
| `importer/arm-schema` | a file named `types.json` whose first entry holds a string at `$type`: a Bicep type file, one for each resource provider namespace at one API version, from the Azure/bicep-types-az repository | every `types.json` it holds |
| `importer/terraform-schema` | a `*.json` file holding a string at `format_version` and an object at `provider_schemas`, the output of `terraform providers schema -json` or `tofu providers schema -json` | every `*.json` it holds, though one export suffices |

Each reads its source through the parser that serves `parse:json`. Several schema files of one format
go in one directory imported once, so that one entry of the record covers them. A `describe-type` output
whose `Type` is other than `RESOURCE`, or whose `ProvisioningType` is `NON_PROVISIONABLE`, is refused by
name under `resource-type-refused`, as is a source that parses but is not the format's schema shape,
under `resource-schema-unreadable`, naming the member it lacks. An export is a file the author holds:
nothing is fetched, and no cloud account is reached.

### Which types are drafted

The `resource_types` [setting](#settings) lists them. Each entry is a type's name, or an object with the
`type` and a `component` that names the Component the type is drafted as.

- A name is matched exactly for CloudFormation (`AWS::SQS::Queue`) and Terraform (`aws_sqs_queue`), and
  without regard to case for Azure (`Microsoft.Storage/storageAccounts`, optionally followed by
  `@<apiVersion>`), as Azure Resource Manager reads types. The draft keeps the file's spelling.
- With no list, and sources holding one type, that type is drafted. With no list and several, the import
  stops under `resource-type-not-named`, listing the types of an Azure file and, for Terraform, saying how many
  there are and where to write the list.
- A listed type the sources do not hold stops the import under `resource-type-not-found`, naming it
  and the nearest names it does hold. The list is the import's whole: a type of another file is drafted
  by importing that file with this one. An Azure type named with an API version the file does not hold
  stops it under the same code, naming the one it holds.
- A Terraform type that more than one provider of the export carries is drafted from the non-beta provider
  where exactly two carry it and one is the other's `-beta` sibling — `hashicorp/google` and
  `hashicorp/google-beta`, the same registry host and namespace and the type name plus `-beta` — and
  `beta-provider-passed-over` names the one passed over. Any other case stops under
  `resource-type-ambiguous`, naming the providers and the remedy: export again from a configuration that
  requires only one of them.
- A `resource_types` value that is not a list of names and objects with a `type` and a `component` stops
  the import under `resource-types-unreadable`, so a wrong value never reads as no list.

A halt drafts nothing: no file is written, and no record is left.

### How each property is placed

A property of the type is placed by the first of these rules that holds, and a comment beside each
drafted key names the rule:

1. **Read back only** — a CloudFormation `readOnlyProperties` entry, an Azure `ReadOnly` flag, a Terraform
   attribute that is computed and not optional: never an input. A scalar at the top of the type becomes a
   key under `provides` — in CloudFormation a nested one too, as a `GetAtt` path. A property that is not a
   scalar is not provided, and a sensitive one is withheld from `provides`, which is piped to a consumer
   as a plain string.
2. **Secret** — an Azure `sensitive` property, a writable Terraform `sensitive` attribute, or a
   CloudFormation string property whose name holds a credential word — Password, Secret, Token,
   Credential, PrivateKey, ApiKey or Passphrase — and does not end in `Arn`, `Id`, `Name` or `Ref`. The
   CloudFormation reading is a convention of the draft, so review it. A secret is drafted as
   [Secrets](#secrets-in-the-drafts) describes.
3. **Placement**, to a typed key of `infra` — Azure's root `location`; Terraform's `region` on `aws`,
   `location` and `resource_group_name` on `azurerm`, and `project`, `region`, `zone` and `location` on
   `google`. A CloudFormation type has none, since a stack's resources live in the Region it is deployed to.
   A placement key is required where the vendor requires it.
4. **Identity**, to `values` — the resource's own name and identifier only: for CloudFormation the
   `primaryIdentifier` properties, `Name` and `<Leaf>Name`; for Azure `name`; for Terraform `name`,
   `identifier` and the attribute named after the type's last word, such as `bucket` for `aws_s3_bucket`. Any
   other create-only property is not identity: it falls to the next rules, with a comment saying it is
   replaced on change, so an operator can still set a subnet group or a key per environment.
5. **Any other required property**, to a typed, required key of `infra`.
6. **Every other writable property**, under `infra.overrides`, an open map that keeps the vendor's own
   spelling at every depth. The Recipe's `overrides_this_recipe_reads` assertion admits exactly those names
   and halts naming any other key; a deprecated property is admitted and marked so.

Keys of `values` and `infra` are written in snake_case at every depth, and the Recipe maps each back to
the vendor's spelling. A constraint is carried as the Component's own: `enum`, `pattern` where Go's regular
expressions compile it, minimum and maximum, length bounds, `format` where it is one of the names the
compiler checks, and a union as the open union of its branches' types. A vendor constraint not carried is
reported under `constraint-dropped` naming the property, the constraint and why; so is a shape cut where a
definition refers back to itself, or nests deeper than six levels, which is drafted as an open object. A
Terraform map, tuple or object whose element shapes are not carried is reported the same way. A vendor
default is not carried, and a description is carried as its first paragraph.

A Terraform resource's legacy top-level `id` attribute is read back and provided, never an input. A Terraform variable whose name the module reserves — `source`, `version`,
`providers`, `count`, `for_each`, `lifecycle`, `depends_on`, `locals` and `provider` — is written
`<name>_value`.

### What is drafted

The Component is labelled `component.aggrega.ai/type: resource`, `component.aggrega.ai/hosting: managed`
and a `component.aggrega.ai/category`, and declares `spec.schema.values`, `spec.schema.infra`, which holds
`overrides` always, and `spec.schema.provides`. A Component for a secret on Terraform declares a
`featuresSchema` slot, `selector: "feature.aggrega.ai/kind=secret"`, `sensitive: true`. A Component is
named `<target_namespace>/<category>/<name>`: the `target_namespace` [setting](#settings) is `imported`
unless you set another; `<name>` is the type's name written in lowercase with each run of other characters
than ASCII letters and digits as one hyphen, such as `aws-sqs-queue` for `AWS::SQS::Queue` and
`microsoft-dbforpostgresql-flexibleservers` for `Microsoft.DBforPostgreSQL/flexibleServers`; `<category>` is
chosen by the importer from the vendor's service or provider namespace among the catalog's categories,
and is `component` where it chooses none. An entry's `component` names the Component instead. The Recipe is
named after the Component's last segment, and implements the Component at `0.1.0`.

Where the name a draft would take is already held by a Component of the workspace's folders or the
published catalog with other `values` keys, the import stops under `component-exists`, naming the
Component, the differing keys and `component` as the remedy. A Component held with the same keys is the
same draft refreshed, and the import goes on. A plain import writes over no Component or Recipe file already in place, and stops naming
`--sync`, which brings the files the record lists up to date with the source.

A text taken from a vendor's schema — a description, a line of the Recipe's header quoting one —
opens with `[vendor schema text]`, so the drafts can be searched for it; text the import writes itself
carries no marker.

| Provider | Artifact | The resource | `provides` |
| --- | --- | --- | --- |
| `cloudformation` | `template.yaml` | `Resources.<logical id>`, the instance's name in capitalized words, with its `Type` and its `Properties` | `!Ref` for the primary identifier and `!GetAtt <logical id>.<Attribute>`, repeated under the fragment's `provides` block that the provider projects into the stack's Outputs |
| `terraform` | `spec.source: ./module` and `module/main.tf.json` beside the Recipe; `spec.valuesMapping` fills the module's variables | `resource.<type>.this`, each argument read from a variable, each block type a `dynamic` block over its variable, and `terraform.required_providers` from the export's provider address; an `azurerm` module adds `provider-azurerm.tf` with `features {}` | `${module.<instance>.<attribute>}`, one `output` of the module for each attribute read back |
| `arm` | `template.yaml`, a fragment keyed by the symbolic name `locals.symbol` holds, with `type`, `apiVersion` — the file's — `name`, the root keys the type has and `properties` | the resource under that symbolic name | an ARM expression, `[reference('<symbolic name>').<path>]` or the resource's id, evaluated when the template deploys |

The Azure fragment takes the form [the `arm` provider](../providers/arm.md) merges into the template of
the instance's boundary. A type writable only at the subscription or the management-group scope is drafted
for that scope, and the Recipe's header names the boundary annotation the Release sets, as
[Deploying at subscription scope](../providers/arm.md#deploying-at-subscription-scope) and
[Deploying at management-group scope](../providers/arm.md#deploying-at-management-group-scope) describe. A
type writable only at the tenant scope, or only as an extension of another resource, is refused under
`resource-type-refused`. The root `systemData` Azure keeps on a
resource is read back and not provided. A Terraform export carries no provider version, so the module
requires the provider with no constraint and the import warns under `provider-version-unconstrained`,
naming where to add one. A Terraform provider's source is written in its short form for
`registry.terraform.io` and `registry.opentofu.org`, and in full for another registry host.

A drafted Terraform Recipe reads a source beside it, so a pull admits it only once an `entity.lock`
records the module's digest: run [`aggrega pin`](../cli/aggrega-pin.md) on the Recipe's `recipe.yaml`,
or pull with `--pin-sources`. A pull without it halts naming `aggrega pin`. The import writes no
`entity.lock`, and re-drafting the module changes its digest, so pin again after each re-draft.

### Secrets in the drafts

A secret value is never written into a draft. On `arm`, a top-level `securestring` parameter of the
fragment, named after the symbolic name and the property and supplied when the template deploys. On
`cloudformation`, a `Parameters` entry with `Type: String` and `NoEcho: true`, named the same way and read
with `!Ref`; an optional secret is a required parameter. On `terraform`, the Component's slot and a
module variable carrying its own `sensitive: true`, filled from the value the attachment to the slot
delivers; no `aggrega_override.tf.json` is written for such a Recipe.

### Drafting a Recipe alone

Where an entry's `component` names a Component the import's catalog holds — the workspace's folders
first, then the published catalog — only the Recipe is drafted, named
`<last segment of the Component's name>-<name>` so it never takes a curated Recipe's name, and
implementing the Component at the version the catalog holds.

- Each of the Component's `values` keys equal, after snake_casing, to a property of the type is written
  from `.values`.
- A property the vendor requires that no such key matches is read from `infra.overrides.<VendorName>`,
  with an assertion that halts the build until the Release sets it.
- A `values` key of the Component that matches nothing is listed in the Recipe's header comment.
- A key of the Component's `provides` that names a read-back attribute is written from it. Every other
  is written as a template that fails, naming the key and the attributes read back, so a build halts
  until you map it, and the import warns under `provides-unmapped`.
- The draft sees no `infra` key of the Component. Where the Component declares no `infra.overrides`, the
  Release cannot set the overrides the Recipe reads, and the assertion naming them says so.

A `component` that neither the workspace's folders nor the published catalog holds is drafted as a new
Component under that name, with `component-drafted-new`, since a registry the workspace pulls from may
publish a Component of that name, which the draft then shadows in this workspace.

### Limits

Each importer runs in a limit of memory and of time its Plugin entity declares. A large export, such as a provider's whole Terraform schema, is read within them: the JSON parser at
16384 pages of memory, `importer/terraform-schema` at 8192 pages and 150000 milliseconds, and the other two
importers at 4096 pages and 60000 milliseconds. Only the selected types' parts of a source are decoded, so
naming the types with `resource_types` keeps a large export inside them, and `--format` names the format, so
the import does not recognise it first.

### The settings they read

They read `resource_types`, `target_namespace` and `render_mode`, as [Settings](#settings)
describes them, and no other setting. Under `render_mode: llm` the decision record, which holds the
catalog Component each type resembles as `swapHint`, is written alone as `import-decisions.json`, and no
draft is.

## What a target adds

An import given a target — `--target` on `aggrega import`, or `target` on the assistant's import tool
and the session's `aggrega/import` method, naming a provider capability such as `compose` or `helm` —
is handed that target, so the importer drafts for it: each secret in the form that target reads, and
the lines only that target needs, written live, while lines only another target needs are left out.
On `compose` those lines include `infra.published_port` wherever the importer publishes a service on
the host's loopback address, as each importer's section says; a port the importer chooses never takes
a number another port of the Release takes.
The import then drafts the Manifest beside whatever the importer drafted, whichever importer ran:
`manifest.yaml`, beside the drafted Release and named and versioned as it is — or, where the importer
drafted no Release, beside the drafted Aggregate and named and versioned as that is.

For each component type and each feature type the drafts need — on the drafted Aggregate's
components, their connections and its subsystems, on the catalog Aggregates it composes, such as
`core/dify`, and on the drafted Release's attachments — the Manifest maps the type to the Recipe, or
for a feature type the feature recipe, of that capability the workspace's catalog offers for it: the
one there is, several versions of one counting as one; or, where there are several of different names,
the one named after the type itself, such as `helm/postgres` for `core/datastore/postgres`. A type
with none, or with several of which none is so named, is left unmapped, a warning names it and why,
and a build of the drafts stops naming each instance or attachment of it until you map it.

Where only the importer knows which of several Recipes applies, it drafts the Manifest itself — the
MCP importer maps each server by its key to the realization of how the server runs, and an importer
attaching a secret by name maps `core/referenced-secret` to `helm/k8s-existing-secret` — and the
import completes it: each mapping the importer wrote that the catalog offers for that type and
capability is kept, any other is dropped with a warning, and the types it leaves are mapped as above.

The drafted Release's `spec.manifest`, written empty with no target, is set to the Manifest's name, the
comment above it is dropped, and nothing else in the Release changes.
[aggrega import](../cli/aggrega-import.md) describes it in full.

## Settings

An importer is handed the settings of the `plugins.importer` entry that attaches it, under
`with.settings`, as [Which importer turns a source into drafts](../cli/configuration.md#which-importer-turns-a-source-into-drafts)
describes. With no entry, or no settings, every setting takes its default.

```yaml
plugins:
  importer:
    - uri: importer/langflow:<version>
      with:
        settings:
          target_namespace: payments
          reuse_mode: hints-only
```

| Setting | Default | What it does |
| --- | --- | --- |
| `target_namespace` | `imported` | The namespace drafted entities are named under: `<target_namespace>/<category>/<name>` for a Component, and `<target_namespace>/<name>` for the Aggregate and the Release, `<name>` the source's own name, else its directory's name, or its file's name without the extension, else `flow`, written in lowercase with each run of other characters than ASCII letters and digits as one hyphen, as [How a draft is named](#how-a-draft-is-named) describes. |
| `reuse_mode` | `auto-apply-above-threshold` | `auto-apply-above-threshold` references the best-matching catalog Component for a node the draft gives a Component of its own whose match is in the high tier and scores at or above `reuse_threshold`, and drafts every other. `hints-only` drafts every such node and references no catalog Component, recording a strong match as a hint. Any other value reads as `hints-only`. |
| `reuse_threshold` | `0.85` | The score at or above which `auto-apply-above-threshold` references a Component. Read in that mode only; `0` reads as the default. |
| `emit_hints` | `true` | Whether a drafted Component's file opens with a comment naming the catalog Component it resembles, for a high- or medium-tier match. The draft Aggregate carries the same comment above that node's entry, and above a referenced entry one naming the next-best candidate it could be swapped for, or saying that none scored above zero. `false` leaves the comments out. |
| `render_mode` | `human` | `human` writes the drafts described above. `llm` writes no drafts, and writes instead the whole decision record — every node, the candidates weighed and the choice made — as one document, `import-decisions.json`, for another tool to read. Any other value reads as `human`. |
| `mapping_overrides` | none | Mappings layered over the importer's own table, keyed by format and then by node type — for the Compose importer, by image repository. Each entry names the `component` a node of that type maps to and, optionally, its `category`, the `traits` — labels and their values — a matching Component carries, and a `vendor` word its name carries. An entry for a node type the table already maps takes the table row's place. Only the entries under the format being imported are read. |
| `layout` | `platform` | `platform` drafts the platform that runs the flow, carrying the flow, with each part of it a Component of its own wired to the platform, as [The platform carrying the flow](#the-platform-carrying-the-flow) describes. `nodes` drafts every node as a Component of its own, as [Node by node](#node-by-node) describes. For the Dify importer, `platform` drafts the Dify installation carrying the application, as [What an application becomes](#what-an-application-becomes) describes. Any other value drafts as `platform`, and the import warns with `unknown-layout`. |
| `empty_credentials` | `none` | Which credential values the flow the platform carries has written empty, as [Credential values the flow holds](#credential-values-the-flow-holds) lists them, which the Release the MCP importer drafts has written empty, as [Credential values a server holds](#credential-values-a-server-holds) lists them, which the Release the Compose importer drafts has written empty, as [Credential values a service holds](#credential-values-a-service-holds) lists them, which the application the Dify importer carries has written empty, as [Credential values an application holds](#credential-values-an-application-holds) lists them, which the Release the CrewAI importer drafts has written empty, as [Credential values a declaration holds](#credential-values-a-declaration-holds) lists them, which the Release the LangGraph importer drafts has written empty, as [The environment a configuration states](#the-environment-a-configuration-states) lists them, which the Release the Google ADK importer drafts has written empty, as [Credential values a configuration holds](#credential-values-a-configuration-holds) lists them, and which the Release the Agent Framework importer drafts has written empty, as [Credential values a declarative agent holds](#credential-values-a-declarative-agent-holds) lists them. `none` writes none empty: each is carried as written and named in a `credential-carried` warning. `marked` writes empty what a format marks as a credential and every member of an MCP server's configuration. `all` writes empty the inputs a format marks as no credential that can carry one as well — request headers, query parameters, a request written as a command line, an input named for a key. What the draft writes so that a node reaches its connection is written whatever this says. Any other value halts the import, which drafts nothing, with `unknown-empty-credentials`. A draft made node by node reads no value, and so does not read this setting. |
| `resource_types` | none | The resource types a resource-schema importer drafts: a list whose entries are a type's name, or an object with the `type` and a `component` that names the Component the type is drafted as, as [Which types are drafted](#which-types-are-drafted) describes. With no list, the one type the sources hold is drafted. Any other value halts the import, which drafts nothing, with `resource-types-unreadable`. Read by the resource-schema importers alone. |
| `attach_egress_allowlist` | `false` | `true` attaches the standard library's `core/egress-allowlist` Feature to each platform instance the draft writes, as `egress-allowlist`, setting none of its `infra`, as [What the draft leaves for the Release](#what-the-draft-leaves-for-the-release) describes. `false` attaches nothing. A draft that writes no platform, under `layout: nodes`, and the Dify importer's draft, whose entry for the Dify installation takes no Feature, attach nothing whatever this says, and with it `true` the import warns with `feature-not-attached`. Any value that is not a boolean reads as `false`. |

A setting an importer does not know is ignored.

```yaml
with:
  settings:
    mapping_overrides:
      langflow:
        AzureOpenAIModel:
          component: acme/ai-model/azure-openai
          category: ai-model
          vendor: azure
```

## What an import reports

Each core importer reports what it could not do, and what it did on the author's behalf, as
diagnostics. The command prints each on standard error as `<severity>: <message>`, before the line for
each node; the editor session's `aggrega/import` method and the assistant's `import` tool return each
with its `code` as well.

| Code | Severity | Reported when |
| --- | --- | --- |
| `parse-failed` | `halt` | The source does not parse: its parser refuses it, and the message carries the parser's reason. |
| `no-nodes` | `warn` | The source carries no node the importer recognises — for the MCP importer, no server, for the Compose importer, no service and no model, for the CrewAI importer, a crew declaring no agent, for the LangGraph importer, a configuration declaring no graph, for the Google ADK importer, a root configuration declaring no agent, or each file `with.sources` hands an import holding no root configuration, and for the Agent Framework importer, a source declaring no prompt agent. |
| `unknown-layout` | `warn` | `layout` is neither `platform` nor `nodes`; the flow is drafted as `platform`. |
| `unknown-empty-credentials` | `halt` | `empty_credentials` holds a value other than `none`, `marked` or `all`, named with the setting; the import drafts nothing. |
| `platform-not-in-catalog` | `warn` | The workspace's catalog holds no Component of the platform's name, so no part is wired to it; for the Dify importer, no `core/ai-agent/dify`, and `core/dify` is composed all the same. |
| `part-not-placed` | `warn` | A part of the flow is wired to no socket of the platform, with why; it stays in the flow. |
| `socket-selector-unreadable` | `warn` | The selector a socket of the platform declares does not read, so no part is wired to it; once for each socket. |
| `credential-carried` | `warn` | A credential value is carried as written in the flow the draft carries, or in the Release the MCP, Compose, CrewAI, LangGraph, Google ADK or Agent Framework importer drafts, named by its node — or its server, service, agent or configuration — and its field, never by its value, with the `empty_credentials` value that writes it empty. |
| `credential-emptied` | `warn` | A credential value is written empty in the flow the draft carries, or in the Release the MCP, Compose, CrewAI, LangGraph, Google ADK or Agent Framework importer drafts, where `empty_credentials` asks for it, named by its node — or its server, service, agent or configuration — and its field. |
| `carriage-returns-rewritten` | `warn` | The flow's carriage returns are written as line feeds, with how many. |
| `definition-respelled` | `warn` | Values of the flow are written in the spelling the platform's own tools read them in, the same values, with which and why: a Langflow flow's edge handles, written as Langflow's editor writes them. A value the draft writes so that the flow reaches a part, or one that can carry a credential, is never respelled — it stays the wiring's, or `empty_credentials`'s — and the warning counts each value not respelled. |
| `definition-not-carried` | `warn` | The flow is not carried in `values.flow_definition`, or the Dify importer's application in `parameters.app_definition`, with why. |
| `part-reads-connection` | `warn` | How the flow reaches a wired part through its connection, or how a connection reaches a node the draft wires to no socket as it is written. |
| `part-address-in-flow` | `warn` | The flow reaches a wired part other than through its connection, with how. |
| `model-not-named` | `warn` | `values.model` of a referenced part is left for the author, with why. |
| `feature-attached` | `info` | `attach_egress_allowlist` attached `core/egress-allowlist` to a drafted platform, with what of it the Release sets; once for each platform instance. |
| `feature-not-attached` | `warn` | `attach_egress_allowlist` is `true` and the draft writes no platform, or composes the Dify installation, whose entry takes no Feature, so nothing is attached. |
| `part-configured-in-platform` | `warn` | A node of a Dify application names what Dify configures for itself — a model and its provider, a tool, a knowledge base, an agent strategy, a plugin — so the draft wires no part for it. |
| `dsl-version-newer` | `warn` | A Dify application is written in a version of the DSL newer than the one the Dify version `core/ai-agent/dify` runs by default writes. |
| `resource-type-not-named` | `halt` | A resource-schema importer's sources hold several types and `resource_types` names none; the types are listed, or, for Terraform, counted. |
| `resource-type-not-found` | `halt` | A type `resource_types` lists is not in the sources, or an Azure type named with an API version the file does not hold; the nearest names, or the version held, are named. |
| `resource-type-ambiguous` | `halt` | More than one provider of a Terraform export carries the type, other than one provider and its `-beta` sibling; the providers and the remedy are named. |
| `beta-provider-passed-over` | `info` | Exactly a Terraform provider and its `-beta` sibling carry the type, and the non-beta provider's is drafted. |
| `resource-types-unreadable` | `halt` | `resource_types` is not a list of names and objects with a `type` and a `component`. |
| `resource-schema-unreadable` | `halt` | A source parses but is not the format's schema shape; the missing member is named. |
| `resource-type-refused` | `halt` | The provider cannot realize the type: a CloudFormation `describe-type` output whose `Type` is not `RESOURCE` or whose `ProvisioningType` is `NON_PROVISIONABLE`, or an Azure type writable only at the tenant scope or only as an extension of another resource. |
| `component-exists` | `halt` | The Component name a draft would take is held, in the workspace's folders or the published catalog, with other `values` keys; the keys and `component` as the remedy are named. |
| `constraint-dropped` | `warn` | A vendor constraint is not carried, or a shape is cut where a definition refers back to itself or nests too deep; the property, the constraint and why are named. |
| `provider-version-unconstrained` | `warn` | A Terraform export carries no provider version, so the drafted module requires the provider with no constraint. |
| `provides-unmapped` | `warn` | Drafting a Recipe alone: a key the named Component provides matches no attribute the type reads back, so the Recipe's `provides` halts the build for it until it is mapped. |
| `component-drafted-new` | `warn` | An entry's `component` names a Component neither the workspace's folders nor the published catalog holds, so it is drafted new under that name. |

An import given a target reports, after the importer's diagnostics, what drafting the Manifest found:
a `warn` naming each component or feature type the Manifest leaves unmapped and why, and an `info`
where the drafted Release already names a Manifest or no drafted Release references it. Those are the
import's own rather than an importer's, and carry no code; [What a target adds](#what-a-target-adds)
describes them. Every import then reports, as its own too, a `warn` for each value the drafts still
owe, naming the drafted file, the key path and its description, and, under `--offline`, where it
drafted a Release and owes nothing, an `info` naming the `aggrega pull` to run next, as
[The import answers file](../import-answers.md) describes.

## Published with each compiler release

Each compiler release builds the importers from the tagged sources and generates their Plugin
entities from the importers themselves, so an entity's capability, recognition signatures, host
functions and description are what its importer reports. The release signs and publishes them,
`importer/langflow`, `importer/flowise`, `importer/n8n`, `importer/mcp`, `importer/compose`, `importer/dify`, `importer/crewai`, `importer/langgraph`, `importer/google-adk`, `importer/agent-framework`, `importer/cloudformation-schema`, `importer/terraform-schema` and `importer/arm-schema` at the release's version, beside the other
core plugins, and records their entities with the other core plugins' entities for the standard
catalog.
