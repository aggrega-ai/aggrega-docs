# Core importers

The compiler's repository builds six importer plugins of its own, one for each source format, and
publishes them with every compiler release:

| Plugin | Serves | Reads |
| --- | --- | --- |
| `importer/langflow` | `import:langflow` | a flow exported from Langflow, as JSON |
| `importer/flowise` | `import:flowise` | a chatflow or an agentflow exported from Flowise, as JSON |
| `importer/n8n` | `import:n8n` | a workflow exported from n8n, as JSON |
| `importer/mcp` | `import:mcp` | an MCP client's configuration — `.mcp.json`, `claude_desktop_config.json`, `.vscode/mcp.json` or `.cursor/mcp.json` — or an MCP registry server description, `server.json`, as JSON |
| `importer/compose` | `import:compose` | a Compose application — `compose.yaml`, `docker-compose.yml` and their override files — as YAML |
| `importer/dify` | `import:dify` | an application exported from Dify in its DSL, as YAML |

Each is built from the compiler's own sources and stamped with the compiler's version, so the
importers released with the compiler at `X.Y.Z` report version `X.Y.Z`, and their Plugin entities
record it. Unlike the plugins listed on [Embedded plugins](embedded-plugins.md), none is compiled
into the binary. The binary carries each one's Plugin entity and the digest of the one module it
accepts for it, so each serves its format in every workspace, with no entry in its catalog.

All six are built on the Go kit's importer package, `github.com/aggrega-ai/aggrega-pdk-go/pkg/importer`.
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
[The Dify importer](#the-dify-importer) describes. How the importer socket works, and
what it is handed, is described under
[The importer socket](plugin-contract.md#the-importer-socket--draft-authoring-output).

## How an import obtains one

[`aggrega import`](../cli/aggrega-import.md), the editor session's `aggrega/import` method and the
assistant's `import` tool obtain a core importer the same way. Where the machine already holds its
module — in the workspace's content cache — the import reads it from there and reaches no network.
Where it does not, the first import that needs it fetches it from the workspace's default registry,
at the compiler's version, and:

- holds it to the digest the binary carries, so only the module the compiler's release published
  runs;
- verifies it as a pull verifies a plugin it fetches — its signature under that registry's trust
  policy, and the host functions it uses against the ones its Plugin entity records;
- keeps it in the workspace's content cache, which is the only thing written for it: no lockfile, and
  no record of trusted plugins, because an import pins nothing.

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
  beside it. Where the registry does not hold the module, or the workspace names no default registry,
  this is the one remedy the message gives.

## Which one runs beside your own importers

The core importers are candidates beside the importers your workspace's catalog holds, under the
rules every importer is selected by, which
[Which importer turns a source into drafts](../cli/configuration.md#which-importer-turns-a-source-into-drafts)
sets out:

- Within one name, the highest version runs, or the version a `plugins.importer` entry names.
- Where your catalog holds an importer of another name for `langflow`, `flowise`, `n8n`, `mcp`, `compose` or `dify`, two importers
  advertise the format, and an import that attaches neither is refused naming both, under
  [A parse or import format is advertised by more than one plugin](../errors/fatal-halts.md#a-parse-or-import-format-is-advertised-by-more-than-one-plugin).
  A `plugins.importer` entry naming the one you want settles it.
- An importer your catalog holds at the same name and version as a core importer is the one that
  runs, read from beside its entity.

## How a source is recognised

An import that does not name its format with `--format` is recognised by the signatures each importer
declares:

- **Langflow** — a source that parses as JSON and carries an array at `data.nodes`.
- **Flowise** — a source that parses as JSON, carries arrays at `nodes` and `edges`, and carries
  nothing at `data.nodes`.
- **n8n** — a source that parses as JSON, carries an array at `nodes` and an object at
  `connections`, and carries nothing at `edges` or at `data.nodes`.
- **MCP** — a source that parses as JSON and is named `.mcp.json`, `claude_desktop_config.json` or
  `.cursor/mcp.json` and carries an object at `mcpServers`, or is named `.vscode/mcp.json` and carries
  an object at `servers`; or a source of any name whose `$schema` is a text opening with
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

No source matches two of them. The four JSON importers read their source through the parser that
serves `parse:json`, and the Compose and Dify importers through the one that serves `parse:yaml`: the one your
workspace's catalog serves, where it serves one, and otherwise the parser the compiler itself carries
for that syntax (see [Embedded plugins](embedded-plugins.md)). So an import through any of them needs
no parser in your catalog, and nothing is fetched for one. A parser your catalog does serve is the one
used, and the compiler's plays no part. The Langflow, Flowise, n8n and Dify importers declare no file
pattern, so each reads one file and an import of a directory through any of them is refused; the MCP
importer declares the four client file names, so a directory is read through the client
configurations it holds; and the Compose importer declares the eight Compose file names, so a
directory is read through the Compose files it holds. A signature naming no file — the Langflow,
Flowise and n8n importers' and the MCP importer's for a registry server description, and the Dify
importer's — applies to every file imported on its own: an import naming no format reads such a file
as JSON, and as YAML, to try them, whatever importer it is meant for, through those same parsers —
the compiler carries both, so nothing is fetched for either. A file holding a comment or a trailing comma does
not parse as JSON, so no signature recognises it.

A source its parser refuses — for the four JSON importers, one that is not JSON, the MCP importer's
once its comments and trailing commas are written as spaces, and for the Compose and Dify importers one that
is not YAML — stops the import under
`parse-failed`, whose message carries the parser's own reason. Naming the format does not change that:
the importer asks for the source's tree, and the parser's refusal is the answer it gets.

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
`core/ai-tool/mcp` — to standard-library Components. The n8n importer's table maps n8n's chat and
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

- `aggregate.yaml` — a draft Aggregate named `<target_namespace>/flow`. It holds one instance of the
  platform that runs the flow — `core/ai-agent/langflow`, under the key `langflow`, for a Langflow
  flow, `core/ai-agent/flowise`, under the key `flowise`, for a Flowise one, and `core/ai-agent/n8n`,
  under the key `n8n`, for an n8n workflow — referencing the catalog Component of that name. The
  instance carries the flow in `values.flow_definition` and names it in its identifier value, `flow_id`
  on Langflow, `chatflow_id` on Flowise and `workflow_id` on n8n. Each part of the flow is an entry of
  its own beside it, wired to the platform under the instance's `uses`.
- one file under `components/` for each part it drafts rather than references, written as
  [the node-by-node layout](#node-by-node) writes a drafted node.

Every node that is not a part stays inside the flow the platform carries and becomes no Component.
Its decision records the candidates it was weighed against and chooses nothing, and its rationale
reads `kept in the flow <platform> carries, with no Component of its own:`, followed by why — that no
mapping row names its type and its closest candidate scored only so much, say. The flow keeps the
edges between nodes; the draft writes none of its own.

Flowise's Multiple Documents QnA chatflow, imported with `reuse_mode: auto-apply-above-threshold`
over a catalog holding the standard library's Flowise platform and its model and retrieval-tool
Components, is drafted as this Aggregate, most of the flow left out here and marked `...`:

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: imported/flow
  version: 0.1.0
  description: Draft Aggregate imported from a source in the flowise format.
spec:
  components:
    # Left for the Release, since the source cannot supply it:
    #   - infra.image, the container image running Flowise
    #   - infra.owner_email, the email address of the platform's owner account, required while values.flow_definition is set
    #   - the owner_password slot, that account's password, required while values.flow_definition is set
    #   - the credential each connection under uses presents to the part it reaches, attached on that connection
    flowise:
      type: core/ai-agent/flowise
      # For the compose target only, uncomment the lines below, which declare owner_password on flowise: the compose Recipe reads every secret the Release alone attaches under the key value, so the owner's password and a connection's credential would both arrive under it and halt the build; the Release still attaches owner_password, naming this type or none.
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
    # swap to core/ai-model/openai-embedding (score 0.3250) by setting type: core/ai-model/openai-embedding
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

Three rules narrow that:

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
  `OpenAI`: one running on another provider, selecting none, naming its provider through a global
  variable, or taking its model from another node is written with none of them, so the draft never
  points another provider at the connection's key. Where no field of such a node gives its API's
  address — a `LanguageModelComponent` node holds none for OpenAI, and an `EmbeddingModel` node's
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
parts, and the carriage returns written as line feeds below, the flow is carried as it was exported,
so a flow with none of these to change is carried byte for byte.

A connection in the draft carries no credential: the Release attaches the one each connection
presents, as the comment above the platform says.

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

A comment above the platform's instance names what the flow cannot supply, which the Release
supplies:

- the platform's own inputs: on Langflow, `infra.image`, and the `admin_password` slot while
  `values.require_authentication` stays `true`; on Flowise, `infra.image`, `infra.owner_email` and the
  `owner_password` slot, the last two required while `values.flow_definition` is set; on n8n,
  `infra.image`;
- the address of each MCP server wired to the platform, `infra.endpoint` of its part;
- where the platform draws a connection, the credential each connection presents to the part it
  reaches, attached on that connection.

The draft is written alike for every target. On the compose target, the platform's Recipe reads every
secret the Release alone attaches under one key, `value`, so the administrator's or the owner's
password and a connection's credential would both arrive under it and halt the build. Where the
platform draws a connection, a comment inside its instance shows the lines declaring that password
with a key of its own, each commented out where it belongs — `owner_password` with the key
`OWNER_PASSWORD` on Flowise, as in the example above, and `admin_password` with the key
`LANGFLOW_SUPERUSER_PASSWORD` on Langflow. Uncomment them to build for compose; the Release still
attaches the slot, naming the same type or none. The n8n platform takes no secret of its own, so its
draft shows no such lines; its compose Recipe reads the credentials the Release attaches on its
connections under the same one key, so a Release attaching a credential on two of its connections
halts the compose build naming both, and an Aggregate naming `values.key` on one of them avoids it.

With the [`attach_egress_allowlist` setting](#settings) `true`, the platform's instance also declares
the standard library's `core/egress-allowlist` Feature under `features`, as `egress-allowlist`, so the
platform connects only to the components its connections reach, its own pods and the cluster's DNS
— the outbound counterpart of a [`uses` edge as a declared call](../entities/aggregate.md#a-uses-edge-is-a-call-the-aggregate-declares).
The draft declares the attachment's type and nothing else, since an Aggregate's attachment carries no
`infra`, and the comment above the instance names what the Release sets on it, under
`features.egress-allowlist.infra` of the platform's entry: `control_plane_present: true`, the
operator's affirmation that the cluster's network plugin enforces network policy, without which the
build halts; and `admitted_destinations`, an address range for each connection whose target the
cluster does not run, such as a hosted model, without which the build halts naming that connection.
The comment also names `aggrega.ai/namespace` for the boundary holding the platform, since the policy
is placed in its workloads' namespace and the build halts where they are emitted into none. Each wired
part's decision says the attachment admits its connection, and the import reports the attachment as
`feature-attached`. Compose has no network policy, so a compose build of such a draft halts naming the
attachment; where the platform draws a connection, the compose lines above are shown inside the
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

- `aggregate.yaml` — a draft Aggregate named `<target_namespace>/flow`, composing the flow's nodes:
  an entry for each, and each edge of the flow a `uses` connection of the node it feeds, named after
  the node feeding it.
- one file under `components/` for each node it drafts — a draft Component named
  `<target_namespace>/<category>/<name>`, the name taken from the node's type, at version `0.1.0`, its
  value fields as string fields of a closed `values` object and its credential fields as required
  credential slots whose delivery a Recipe decides.

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
value, are not read. The servers keep the order the source writes them in.

A directory is read through the client configurations it holds — every file named as one of the four,
at any depth — in the order of their paths, and every server of every file is drafted into one
Aggregate.

### What a server becomes

`aggregate.yaml` is a draft Aggregate named `<target_namespace>/flow` holding one instance of
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
  and its fragment, which are not written, since the Component takes the address without any part
  that carries a key, and a comment says which were left out;
- for an OCI package, `infra.image`;
- for a server's environment, the `server_env` slot, attached as `core/referenced-secret-set` with one
  entry under `infra.entries` per variable, keyed by the variable's name.

What the source does not state is left out and named in a comment above the entry: a command whose
launcher neither bridge image carries leaves `infra.stdio_runtime`; an argument a registry description
leaves for its user is written as an empty item; a variable whose value the source does not write is
written with its key and no value. The build then halts naming each — an empty item and an entry with
no value fail the schema of the field holding them, and the realization reading an unset
`infra.stdio_runtime`, `infra.stdio_command` or `infra.endpoint` stops naming it.

The Release's `metadata.environment` and `spec.manifest` are left unset, each named in a comment where
it belongs: no source names the environment a Release deploys to, and the import drafts no Manifest.
The Manifest names the target and the realization each server runs under — `helm/mcp-stdio-bridge` or
`compose/mcp-stdio-bridge` for a command line, `helm/mcp-remote` or `compose/mcp-remote` for an
address, `helm/mcp` for an image — and the realization of `core/referenced-secret-set`. The Release
schema requires both, so a build stops naming them until they are set.

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
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: imported/flow
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
apiVersion: aggrega.ai/v1alpha1
kind: Release
metadata:
  name: imported/flow
  # environment: left for the operator, since no source names the environment this Release deploys to.
  version: 0.1.0
  description: Draft Release imported from a source in the mcp format.
spec:
  aggregate: imported/flow
  # manifest: left for the operator, since the import drafts no Manifest, which names the target the servers are built for.
  components:
    # The source sends this server the header Authorization. Its value is not written: a remote server's credential is held by each consumer, on its connection to the tool.
    api-server:
      infra:
        endpoint: "https://api.example.com/mcp"
    # Left for the Release, since the draft does not write it:
    #   - the value of server_env.GITHUB_PERSONAL_ACCESS_TOKEN, which the source reads from ${GITHUB_TOKEN}
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
            entries:
              - key: "GITHUB_PERSONAL_ACCESS_TOKEN"
```

### Credential values a server holds

Each value of a server's configuration the Release writes — each item of its command line, its address
and each environment value — can carry a key, and no client marks one as a credential, so the import
locates each as a member of an MCP server's configuration; a registry input marked `isSecret` is
located as a value its format marks as a credential. By default each is carried as written into the
Release and named in a `credential-carried` warning by its server and its place —
`infra.stdio_command.<position>`, `infra.endpoint` or `server_env.<variable>` — never by its value. With
the [`empty_credentials` setting](#settings) at `marked` or `all`, each is written empty and reported
with `credential-emptied`: an item of the command line as an empty item, an address and an environment
value left out, so the build halts naming each. A client's `infra.stdio_runtime` is read off the
command as the Release writes it, so a command written empty leaves it out too.

A value that is one variable reference and nothing else — `${NAME}`, `${env:NAME}`, `${input:id}`,
`${workspaceFolder}` — holds no value of its own: it is written as the text it is whatever the setting
says, the bridge passing it to the server unexpanded, and it is named in no warning. An environment
variable whose value is one is written with its key and no value, its reference named in the comment
above the entry, for the Release to supply. A reference carrying a default, `${NAME:-value}`, or text
beside a reference holds a value, and is located like any other.

A header's value is written nowhere, whatever the setting says: a remote server's credential is held by
each consumer, on its connection to the tool, and the import drafts no consumer. The comment above the
entry names each header. The image an OCI package names is written as it is, and is not a value the
setting reaches.

### A configuration holding comments

Visual Studio Code reads `.vscode/mcp.json` as JSON with comments. Before the MCP importer has a source
parsed as JSON, it writes each `//` and `/* */` comment and each trailing comma as spaces, keeping every
line break and every character inside a string, so a commented configuration is imported. Recognition
reads a file as JSON before any importer runs, so a file holding a comment or a trailing comma is
recognised by no signature: import it naming `--format mcp`. A comment opened with `/*` and never
closed is left as written, and the parser refuses the file.

### The settings it reads

The MCP importer reads `target_namespace` and `empty_credentials`, as [Settings](#settings) describes
them, and no other setting.

## The Compose importer

`importer/compose` reads the services and the models a Compose file declares. It drafts each
service as an instance of the catalog Component its image matches, or of the standard library's
generic server, `core/compute/server`, running its image; each model as a model Component of its own;
and a Release beside them carrying what each service states for its operation.

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
  and a new one following; `expose` is appended; `depends_on` and a service's `models` are joined. Of
  a model, `model` and `context_size` are replaced and `runtime_flags` appended. Compose's `!reset` and
  `!override` tags are not honoured: a value carrying one is merged as the YAML parser reads it.
- **A service.** Its `image`, and whether it builds one under `build`; its `ports`, `expose`,
  `volumes` and `environment` — a mapping, or a list of `NAME=value` items, a name with no value
  taking its value from the environment Compose runs in; `depends_on`, a list or a mapping; and its
  `models`, a list or a mapping. Every other member — `command`, `healthcheck`, `secrets`, `env_file`
  and the rest — is written nowhere, and named in a comment above the service's entry in the Release.
- **A model.** Each entry of the top-level `models`: its `model`, the OCI identifier of the model, its
  `context_size` and its `runtime_flags`. Any other member is named in a comment above its instance.
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
that repository for. The table is generated from the standard catalog's Compose Recipes when the
importer is built and compiled into it, so no Recipe is read when an import runs; the importer's
Plugin entity names, in its description, the hub revision the table was generated from. Of each
Recipe, the table reads the Component the Recipe implements and the image of its container named
`main`, where that image writes its repository in its own text, or is a locals entry that does. A
Recipe running the image the Release names whole, or one its template composes otherwise, adds no
row, and neither does an image a Recipe runs beside its main container. Two Recipes naming one
repository for different Components stop the table being generated, so a row never names one of
two.

A row is read as a flow importer's table row is: the Component, the category its name places it in,
and the last segment of its name as its vendor. The [`mapping_overrides` setting](#settings) layers
over the table under the `compose` format, keyed by repository, and an entry for a repository the
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
catalog's Components, referenced where `reuse_mode` is `auto-apply-above-threshold` and its best
candidate is a high-tier match at or above `reuse_threshold`, and drafted as a Component of its own
otherwise, the drafted Component's file opening with a comment naming the Component it resembles. A
row of the generated table carries no traits, so a service it maps scores `0.75` against the
Component it names, a medium-tier match, where nothing else of the service matches; an entry carrying
the traits the Component's labels hold scores in the high tier. Services drafting one Component share
its one file. A service whose image no row maps, whose image names no repository the importer reads,
or that builds its image, is an instance of `core/compute/server`, whatever your catalog holds. Each
service's decision is reported as each node's is.

### What a service becomes

`aggregate.yaml` is a draft Aggregate named `<target_namespace>/flow` holding one instance per
service, of the Component its decision chose, keyed as the MCP importer keys a server, a comment above
it naming the service and the file it came from where the key is not the service's name or the import
read several directories. Each service a service's `depends_on` names is a connection,
`uses: <key>: link: {target: <key>}`. An environment value naming another service — a word of the
value, split at every character a host name is not written with, equal to that service's name — that
`depends_on` does not name draws no connection: the service's decision records it as a hint, naming
the variable and the service, never the value. Each model is drafted as
`<target_namespace>/ai-model/<key>`, a Component of the `ai-model` category whose values declare
`model`, `context_size` and `runtime_flags`; its instance writes each the source states, and each
service naming the model is connected to it.

Beside it, `release.yaml` is a draft Release of the same name, whose `spec.aggregate` names the
Aggregate. For an instance of `core/compute/server` it writes `infra.image`, the image as written, and
`infra.port`, the port the container listens on in the first entry of `ports`, or of `expose` where
`ports` holds none. A comment above each service's entry writes what the source states that no key of
the draft carries — the image of a service matched to another Component, its `ports`, `expose`,
`volumes` and `environment` — for you to carry where the Component takes it, and names what the draft
leaves for the Release: the image of a service naming none, as one that builds its own does, and a
port that is not one number.
A port the Component does not take, such as one below `core/compute/server`'s floor of 1024, is
written as the source states it, and the build halts naming it. The Release's `metadata.environment`
and `spec.manifest` are left unset, each named in a comment, as the MCP importer's are. The Manifest
names the Recipe realizing each Component on the target you build for; `core/compute/server` is
realized on Kubernetes by `helm/server`.

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

is drafted, with no setting, as:

```yaml
# aggregate.yaml
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: imported/flow
  version: 0.1.0
  description: Draft Aggregate imported from a source in the compose format.
spec:
  components:
    db:
      type: imported/datastore/postgres
    api:
      type: core/compute/server
      uses:
        db:
          link:
            target: db
```

```yaml
# release.yaml
apiVersion: aggrega.ai/v1alpha1
kind: Release
metadata:
  name: imported/flow
  # environment: left for the operator, since no source names the environment this Release deploys to.
  version: 0.1.0
  description: Draft Release imported from a source in the compose format.
spec:
  aggregate: imported/flow
  # manifest: left for the operator, since the import drafts no Manifest, which names the target the services are built for.
  components:
    # The source states, for the Release to carry where imported/datastore/postgres takes it:
    #   image: "postgres:16"
    #   environment:
    #     POSTGRES_DB: "shop"
    db:
      infra: {}
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

and `components/imported-datastore-postgres.yaml`, opening with
`# resembles core/datastore/postgres (score 0.7500); consider referencing it`.

### Credential values a service holds

Compose marks no environment value as a credential, and the importer reads no variable's name for
what it means, so every environment value that holds something is located as an input its format
marks as no credential that can carry one. By default each is carried as written into the comment
above its service's entry in the Release and named in a `credential-carried` warning by its service
and its variable — `environment.<variable>` — never by its value. With the
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

`aggregate.yaml` is a draft Aggregate named `<target_namespace>/flow` composing one entry of
`core/dify`, keyed `dify`, whose `app_definition` parameter carries the application as written — as
[How the flow is written into the draft](#how-the-flow-is-written-into-the-draft) describes for a flow,
so Dify's own `{{#…#}}` references reach the installation as exported. The installation wires every
connection of its API server itself — its database, its cache, its vector store, its sandbox, its
plugin runtime and its egress proxy — so the draft drafts no Component and wires nothing: every node
stays in the application, and its decision says so. No other draft is written.

An import sees the Components of the workspace's catalog and none of its Aggregates, so it does not
check that the catalog holds `core/dify`, and a comment above the entry says so. Where the catalog
holds no `core/ai-agent/dify`, the API server `core/dify` runs, the import warns with
`platform-not-in-catalog` and drafts the entry all the same.

The application is imported under the installation's owner account, which the Release names: the
comment above the entry leaves for it `infra.owner_email` on the installation's `api` component and the
`owner_password` slot on that component, both set in the Release's routing entry for the installation,
without which the build halts.

The authored workflow application this importer's tests import is drafted, with no setting, as:

```yaml
# aggregate.yaml
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: imported/flow
  version: 0.1.0
  description: Draft Aggregate imported from a source in the dify format.
spec:
  aggregates:
    # An import sees the Components of the workspace's catalog and none of its Aggregates, so it does not check that the catalog holds core/dify.
    # Left for the Release, since the source cannot supply it:
    #   - infra.owner_email on the api component of core/dify, the email of the installation's owner account the application is imported under, set under components.api in the Release's routing entry for this entry
    #   - the owner_password slot on that api component, the owner account's password, attached in the same routing entry with type core/referenced-secret
    dify:
      type: core/dify
      parameters:
        app_definition: |
          app:
            description: Answers a support question from a knowledge base and files it.
            ...
```

and a Release building it names the owner in the routing entry placing the installation:

```yaml
spec:
  aggregate: imported/flow
  boundaries:
    platform:
      aggregates:
        dify:
          components:
            api:
              infra:
                owner_email: owner@example.com
              features:
                owner_password:
                  type: core/referenced-secret
                  infra:
                    origin: <the password, or an existing Secret's name>
```

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
reported with `credential-emptied`. A value is written empty in the application's own text: the
scalar after its key is replaced by `''`, and nothing else is changed. The application is carried only
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
          reuse_mode: auto-apply-above-threshold
```

| Setting | Default | What it does |
| --- | --- | --- |
| `target_namespace` | `imported` | The namespace drafted entities are named under: `<target_namespace>/<category>/<name>` for a Component, `<target_namespace>/flow` for the Aggregate and for the Release the MCP and Compose importers draft. |
| `reuse_mode` | `hints-only` | `hints-only` drafts every node the draft gives a Component of its own and references no catalog Component, recording a strong match as a hint. `auto-apply-above-threshold` references the best-matching catalog Component for such a node whose match is in the high tier and scores at or above `reuse_threshold`, and drafts every other. Any other value reads as `hints-only`. |
| `reuse_threshold` | `0.85` | The score at or above which `auto-apply-above-threshold` references a Component. Read in that mode only; `0` reads as the default. |
| `emit_hints` | `true` | Whether a drafted Component's file opens with a comment naming the catalog Component it resembles, for a high- or medium-tier match. The draft Aggregate carries the same comment above that node's entry, and above a referenced entry one naming the next-best candidate it could be swapped for, or saying that none scored above zero. `false` leaves the comments out. |
| `render_mode` | `human` | `human` writes the drafts described above. `llm` writes no drafts, and writes instead the whole decision record — every node, the candidates weighed and the choice made — as one document, `import-decisions.json`, for another tool to read. Any other value reads as `human`. |
| `mapping_overrides` | none | Mappings layered over the importer's own table, keyed by format and then by node type — for the Compose importer, by image repository. Each entry names the `component` a node of that type maps to and, optionally, its `category`, the `traits` — labels and their values — a matching Component carries, and a `vendor` word its name carries. An entry for a node type the table already maps takes the table row's place. Only the entries under the format being imported are read. |
| `layout` | `platform` | `platform` drafts the platform that runs the flow, carrying the flow, with each part of it a Component of its own wired to the platform, as [The platform carrying the flow](#the-platform-carrying-the-flow) describes. `nodes` drafts every node as a Component of its own, as [Node by node](#node-by-node) describes. For the Dify importer, `platform` drafts the Dify installation carrying the application, as [What an application becomes](#what-an-application-becomes) describes. Any other value drafts as `platform`, and the import warns with `unknown-layout`. |
| `empty_credentials` | `none` | Which credential values the flow the platform carries has written empty, as [Credential values the flow holds](#credential-values-the-flow-holds) lists them, which the Release the MCP importer drafts has written empty, as [Credential values a server holds](#credential-values-a-server-holds) lists them, which the Release the Compose importer drafts has written empty, as [Credential values a service holds](#credential-values-a-service-holds) lists them, and which the application the Dify importer carries has written empty, as [Credential values an application holds](#credential-values-an-application-holds) lists them. `none` writes none empty: each is carried as written and named in a `credential-carried` warning. `marked` writes empty what a format marks as a credential and every member of an MCP server's configuration. `all` writes empty the inputs a format marks as no credential that can carry one as well — request headers, query parameters, a request written as a command line, an input named for a key. What the draft writes so that a node reaches its connection is written whatever this says. Any other value halts the import, which drafts nothing, with `unknown-empty-credentials`. A draft made node by node reads no value, and so does not read this setting. |
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
| `no-nodes` | `warn` | The source carries no node the importer recognises — for the MCP importer, no server, and for the Compose importer, no service and no model. |
| `unknown-layout` | `warn` | `layout` is neither `platform` nor `nodes`; the flow is drafted as `platform`. |
| `unknown-empty-credentials` | `halt` | `empty_credentials` holds a value other than `none`, `marked` or `all`, named with the setting; the import drafts nothing. |
| `platform-not-in-catalog` | `warn` | The workspace's catalog holds no Component of the platform's name, so no part is wired to it; for the Dify importer, no `core/ai-agent/dify`, and `core/dify` is composed all the same. |
| `part-not-placed` | `warn` | A part of the flow is wired to no socket of the platform, with why; it stays in the flow. |
| `socket-selector-unreadable` | `warn` | The selector a socket of the platform declares does not read, so no part is wired to it; once for each socket. |
| `credential-carried` | `warn` | A credential value is carried as written in the flow the draft carries, or in the Release the MCP or Compose importer drafts, named by its node — or its server or service — and its field, never by its value, with the `empty_credentials` value that writes it empty. |
| `credential-emptied` | `warn` | A credential value is written empty in the flow the draft carries, or in the Release the MCP or Compose importer drafts, where `empty_credentials` asks for it, named by its node — or its server or service — and its field. |
| `carriage-returns-rewritten` | `warn` | The flow's carriage returns are written as line feeds, with how many. |
| `definition-not-carried` | `warn` | The flow is not carried in `values.flow_definition`, or the Dify importer's application in `parameters.app_definition`, with why. |
| `part-reads-connection` | `warn` | How the flow reaches a wired part through its connection, or how a connection reaches a node the draft wires to no socket as it is written. |
| `part-address-in-flow` | `warn` | The flow reaches a wired part other than through its connection, with how. |
| `model-not-named` | `warn` | `values.model` of a referenced part is left for the author, with why. |
| `feature-attached` | `info` | `attach_egress_allowlist` attached `core/egress-allowlist` to a drafted platform, with what of it the Release sets; once for each platform instance. |
| `feature-not-attached` | `warn` | `attach_egress_allowlist` is `true` and the draft writes no platform, or composes the Dify installation, whose entry takes no Feature, so nothing is attached. |
| `part-configured-in-platform` | `warn` | A node of a Dify application names what Dify configures for itself — a model and its provider, a tool, a knowledge base, an agent strategy, a plugin — so the draft wires no part for it. |
| `dsl-version-newer` | `warn` | A Dify application is written in a version of the DSL newer than the one the Dify version `core/ai-agent/dify` runs by default writes. |

## Published with each compiler release

Each compiler release builds the six importers from the tagged sources and generates their Plugin
entities from the importers themselves, so an entity's capability, recognition signatures, host
functions and description are what its importer reports. The release signs and publishes all six,
`importer/langflow`, `importer/flowise`, `importer/n8n`, `importer/mcp`, `importer/compose` and `importer/dify` at the release's version, beside the other
core plugins, and records their entities with the other core plugins' entities for the standard
catalog.
