# Core importers

The compiler's repository builds three importer plugins of its own, one for each source format, and
publishes them with every compiler release:

| Plugin | Serves | Reads |
| --- | --- | --- |
| `importer/langflow` | `import:langflow` | a flow exported from Langflow, as JSON |
| `importer/flowise` | `import:flowise` | a chatflow or an agentflow exported from Flowise, as JSON |
| `importer/n8n` | `import:n8n` | a workflow exported from n8n, as JSON |

Each is built from the compiler's own sources and stamped with the compiler's version, so the
importers released with the compiler at `X.Y.Z` report version `X.Y.Z`, and their Plugin entities
record it. Unlike the plugins listed on [Embedded plugins](embedded-plugins.md), none is compiled
into the binary. The binary carries each one's Plugin entity and the digest of the one module it
accepts for it, so each serves its format in every workspace, with no entry in its catalog.

All three are built on the Go kit's importer package, `github.com/aggrega-ai/aggrega-pdk-go/pkg/importer`.
Everything an importer does whatever its format — scoring the workspace catalog's Components against
each node, deciding whether to reference one or draft a new one, laying the draft out, carrying the
credential values it holds or writing them empty as a setting asks, writing the drafts and reading
the settings below — is that package's,
and only reading the format, and knowing the platform its flows run on, is particular to each
importer. How the importer socket works, and what it is handed, is described under
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
- Where your catalog holds an importer of another name for `langflow`, `flowise` or `n8n`, two importers
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

No source matches two of them. Each reads its source through the parser that serves `parse:json`: the
one your workspace's catalog serves, where it serves one, and otherwise the JSON parser the compiler
itself carries (see [Embedded plugins](embedded-plugins.md)). So an import through any of them needs
no parser in your catalog, and nothing is fetched for one. A JSON parser your catalog does serve is the
one used, and the compiler's plays no part. None of them declares file patterns, so each reads one
file and an import of a directory through any of them is refused. For the same reason their
signatures apply to every file imported on its own: an import naming no format reads such a file as
JSON to try them, whatever importer it is meant for, through that same parser.

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
| `target_namespace` | `imported` | The namespace drafted entities are named under: `<target_namespace>/<category>/<name>` for a Component, `<target_namespace>/flow` for the Aggregate. |
| `reuse_mode` | `hints-only` | `hints-only` drafts every node the draft gives a Component of its own and references no catalog Component, recording a strong match as a hint. `auto-apply-above-threshold` references the best-matching catalog Component for such a node whose match is in the high tier and scores at or above `reuse_threshold`, and drafts every other. Any other value reads as `hints-only`. |
| `reuse_threshold` | `0.85` | The score at or above which `auto-apply-above-threshold` references a Component. Read in that mode only; `0` reads as the default. |
| `emit_hints` | `true` | Whether a drafted Component's file opens with a comment naming the catalog Component it resembles, for a high- or medium-tier match. The draft Aggregate carries the same comment above that node's entry, and above a referenced entry one naming the next-best candidate it could be swapped for, or saying that none scored above zero. `false` leaves the comments out. |
| `render_mode` | `human` | `human` writes the drafts described above. `llm` writes no drafts, and writes instead the whole decision record — every node, the candidates weighed and the choice made — as one document, `import-decisions.json`, for another tool to read. Any other value reads as `human`. |
| `mapping_overrides` | none | Mappings layered over the importer's own table, keyed by format and then by node type. Each entry names the `component` a node of that type maps to and, optionally, its `category`, the `traits` — labels and their values — a matching Component carries, and a `vendor` word its name carries. An entry for a node type the table already maps takes the table row's place. Only the entries under the format being imported are read. |
| `layout` | `platform` | `platform` drafts the platform that runs the flow, carrying the flow, with each part of it a Component of its own wired to the platform, as [The platform carrying the flow](#the-platform-carrying-the-flow) describes. `nodes` drafts every node as a Component of its own, as [Node by node](#node-by-node) describes. Any other value drafts as `platform`, and the import warns with `unknown-layout`. |
| `empty_credentials` | `none` | Which credential values the flow the platform carries has written empty, as [Credential values the flow holds](#credential-values-the-flow-holds) lists them. `none` writes none empty: each is carried as written and named in a `credential-carried` warning. `marked` writes empty what a format marks as a credential and every member of an MCP server's configuration. `all` writes empty the inputs a format marks as no credential that can carry one as well — request headers, query parameters, a request written as a command line, an input named for a key. What the draft writes so that a node reaches its connection is written whatever this says. Any other value halts the import, which drafts nothing, with `unknown-empty-credentials`. A draft made node by node reads no value, and so does not read this setting. |
| `attach_egress_allowlist` | `false` | `true` attaches the standard library's `core/egress-allowlist` Feature to each platform instance the draft writes, as `egress-allowlist`, setting none of its `infra`, as [What the draft leaves for the Release](#what-the-draft-leaves-for-the-release) describes. `false` attaches nothing. A draft that writes no platform, under `layout: nodes`, attaches nothing whatever this says, and with it `true` the import warns with `feature-not-attached`. Any value that is not a boolean reads as `false`. |

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
| `parse-failed` | `halt` | The source does not parse. |
| `no-nodes` | `warn` | The source carries no node the importer recognises. |
| `unknown-layout` | `warn` | `layout` is neither `platform` nor `nodes`; the flow is drafted as `platform`. |
| `unknown-empty-credentials` | `halt` | `empty_credentials` holds a value other than `none`, `marked` or `all`, named with the setting; the import drafts nothing. |
| `platform-not-in-catalog` | `warn` | The workspace's catalog holds no Component of the platform's name, so no part is wired to it. |
| `part-not-placed` | `warn` | A part of the flow is wired to no socket of the platform, with why; it stays in the flow. |
| `socket-selector-unreadable` | `warn` | The selector a socket of the platform declares does not read, so no part is wired to it; once for each socket. |
| `credential-carried` | `warn` | A credential value is carried as written in the flow the draft carries, named by its node and its field, never by its value, with the `empty_credentials` value that writes it empty. |
| `credential-emptied` | `warn` | A credential value is written empty in the flow the draft carries, where `empty_credentials` asks for it, named by its node and its field. |
| `carriage-returns-rewritten` | `warn` | The flow's carriage returns are written as line feeds, with how many. |
| `definition-not-carried` | `warn` | The flow is not carried in `values.flow_definition`, with why. |
| `part-reads-connection` | `warn` | How the flow reaches a wired part through its connection, or how a connection reaches a node the draft wires to no socket as it is written. |
| `part-address-in-flow` | `warn` | The flow reaches a wired part other than through its connection, with how. |
| `model-not-named` | `warn` | `values.model` of a referenced part is left for the author, with why. |
| `feature-attached` | `info` | `attach_egress_allowlist` attached `core/egress-allowlist` to a drafted platform, with what of it the Release sets; once for each platform instance. |
| `feature-not-attached` | `warn` | `attach_egress_allowlist` is `true` and the draft writes no platform, so nothing is attached. |

## Published with each compiler release

Each compiler release builds the three importers from the tagged sources and generates their Plugin
entities from the importers themselves, so an entity's capability, recognition signatures, host
functions and description are what its importer reports. The release signs and publishes all three,
`importer/langflow`, `importer/flowise` and `importer/n8n` at the release's version, beside the other
core plugins, and records their entities with the other core plugins' entities for the standard
catalog.
