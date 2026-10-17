# Core importers

The compiler's repository builds two importer plugins of its own, one for each source format, and
publishes them with every compiler release:

| Plugin | Serves | Reads |
| --- | --- | --- |
| `importer/langflow` | `import:langflow` | a flow exported from Langflow, as JSON |
| `importer/flowise` | `import:flowise` | a chatflow or an agentflow exported from Flowise, as JSON |

Each is built from the compiler's own sources and stamped with the compiler's version, so the
importers released with the compiler at `X.Y.Z` report version `X.Y.Z`, and their Plugin entities
record it. Unlike the plugins listed on [Embedded plugins](embedded-plugins.md), neither is compiled
into the binary. The binary carries each one's Plugin entity and the digest of the one module it
accepts for it, so both serve their formats in every workspace, with no entry in its catalog.

Both are built on the Go kit's importer package, `github.com/aggrega-ai/aggrega-pdk-go/pkg/importer`.
Everything an importer does whatever its format — scoring the workspace catalog's Components against
each node, deciding whether to reference one or draft a new one, laying the draft out, keeping
credential values out of it, writing the drafts and reading the settings below — is that package's,
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
- Where your catalog holds an importer of another name for `langflow` or `flowise`, two importers
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

No source matches both. Each reads its source through the parser that serves `parse:json`: the one
your workspace's catalog serves, where it serves one, and otherwise the JSON parser the compiler
itself carries (see [Embedded plugins](embedded-plugins.md)). So an import through either needs no
parser in your catalog, and nothing is fetched for one. A JSON parser your catalog does serve is the
one used, and the compiler's plays no part. Neither importer declares file patterns, so each reads
one file and an import of a directory through either is refused. For the same reason their
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
  of each field marked `password: true`, which it writes empty; an MCP Tools node's `mcp_server`
  field — the MCP server it names, and that server's configuration; the field a node names its model
  in, and the model provider it runs on; and the fields through which a node reaches a part's address
  and key, which it rewrites.
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
  configuration in a node's `mcpServerConfig` input; a node's `modelName` input; and an OpenAI node's
  Base Path, its `basepath` input. [What they draft](#what-they-draft) says what becomes of each.

## What they draft

Each node is weighed against the Components of the workspace's own catalog and nothing else, as the
[importer socket](plugin-contract.md#the-importer-socket--draft-authoring-output) describes, and each
importer carries a short table mapping common node types of its format — chat and embedding models,
retrieval, HTTP requests and, on Langflow, the MCP Tools node `MCPTools`, which maps to
`core/ai-tool/mcp` — to standard-library Components. A row of that table counts towards a match only
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
  flow, and `core/ai-agent/flowise`, under the key `flowise`, for a Flowise one — referencing the
  catalog Component of that name. The instance carries the flow in `values.flow_definition` and names
  it in its identifier value, `flow_id` on Langflow and `chatflow_id` on Flowise. Each part of the
  flow is an entry of its own beside it, wired to the platform under the instance's `uses`.
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
  description: Draft aggregate imported from a flowise source.
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

The flow's identifier is the one the export gives it — a Langflow flow's top-level `id`, and a Flowise
chatflow's top-level `id` where it is a UUID — where that is one to 128 letters, digits, `.`, `-`, `_`
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

- **A socket drawing a single connection is held by one part.** On both platforms the `model` socket
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

The flow the platform carries reaches each wired part through its connection, and the draft writes
into the flow what makes it do so — the name of a variable, or an address emptied, and never a value:

- **A Langflow MCP Tools node.** The platform writes the address its connection delivers into the
  node's server configuration and, where the connection carries a credential, the name of the variable
  holding it under the header the tool publishes. The draft writes the address the export held there
  empty, so the flow holds no copy of it, and leaves the server's address — `infra.endpoint` of the
  part — for the Release.
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

  A field the export writes without both of those members is not written anew — a credential field
  among them is still written empty, as below. Where that field is the one carrying the part's
  address — and, for a `LanguageModelComponent` or `EmbeddingModel` node, gives one — where such a node
  does not run on `OpenAI`, or where the node is of any other type, the import reports the part as
  reached at the address the flow or its component's defaults give.
- **A Flowise OpenAI node.** The OpenAI client Flowise runs a `chatOpenAI` or `openAIEmbeddings` node
  on reads `OPENAI_BASE_URL` and `OPENAI_API_KEY` from the environment where the node's Base Path is
  empty and it selects no credential, so the draft writes a Base Path the export holds empty, and the
  node's selected credential is written empty with every other. A model node of any other type is
  reported as reached at the address the chatflow or its own defaults give.
- **A Flowise tool or vector store.** A chatflow reads the address the platform delivers for one —
  `AGGREGA_TOOL_<ALIAS>_URL` or `AGGREGA_VECTOR_STORE_<ALIAS>_URL` — only through a Runtime variable
  of that name, which nothing creates at startup. The draft writes nothing for it, and the import
  reports the step that makes the chatflow read it: create the Runtime variable on Flowise's
  Variables page, and read it in the node as `$vars.<name>`.

Where the flow is carried, each wired part is reported with which of these holds:
`part-reads-connection` where the flow reaches the part through its connection, and
`part-address-in-flow` where it reaches the part other than through its connection — at an address
the flow holds, or one its component's defaults give. The part's decision says the same.

### No credential value reaches a draft

Before the flow is carried, every value in a place the format keeps a credential is written empty:

- **Langflow** — the value of each template field marked `password: true`, a field holding the name
  of a global variable included, unless the draft writes that field with the name of the variable
  the platform delivers, as above.
- **Flowise** — the credential a node keeps at `data.credential`, which its credential parameter
  selects; the value of each input its `inputParams` declare of type `password`; and
  `FLOWISE_CREDENTIAL_ID` among a node's inputs, and `credential` or `FLOWISE_CREDENTIAL_ID` inside a
  configuration object at any depth of them, as an agentflow keeps a model's or a tool's.
- **An MCP server's configuration** — a Langflow MCP Tools node's `mcp_server` configuration, and a
  Flowise node's `mcpServerConfig`, written as JSON text or as an object: each header value, whether
  the headers are an object or a list of key and value items; each environment value; the command;
  and every argument. Neither format marks a command or an argument as a credential, and either can
  carry a key, so both are written empty, their members kept. The server's address is written empty
  too: on Flowise always, and on Langflow where the node is wired to a tools connection, whose address
  the platform writes there. A Flowise configuration written as text that does not read as a JSON
  object is written empty whole, since nothing inside it can be located.

The import reports each value it writes empty with `credential-emptied`, naming its node and its
field and never its value. A value already empty, or `null`, is left as it is and not reported. Apart
from those values, what the draft writes so that the flow reaches its parts, and the carriage returns
written as line feeds below, the flow is carried as it was exported, so a flow with none of these to
change is carried byte for byte.

A connection in the draft carries no credential: the Release attaches the one each connection
presents, as the comment above the platform says.

### What the draft leaves for the Release

A comment above the platform's instance names what the flow cannot supply, which the Release
supplies:

- the platform's own inputs: on Langflow, `infra.image`, and the `admin_password` slot while
  `values.require_authentication` stays `true`; on Flowise, `infra.image`, `infra.owner_email` and the
  `owner_password` slot, the last two required while `values.flow_definition` is set;
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
attaches the slot, naming the same type or none.

### The model a part serves

A part the draft references whose Component declares a value named `model` — as each model Component
of the standard library does, and requires — is written with the name of the model its node selects,
as `values.model`:

- **Langflow** — an `OpenAIModel` or `AnthropicModel` node's `model_name`; an `OpenAIEmbeddings` node's
  `model`; and a `LanguageModelComponent` or `EmbeddingModel` node's `model_name` override where it is
  set, and otherwise the model its `model` field selects.
- **Flowise** — a `chatOpenAI`, `chatAnthropic` or `openAIEmbeddings` node's `modelName`.

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
the Aggregate: write it empty, as the draft does.

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
| `platform-not-in-catalog` | `warn` | The workspace's catalog holds no Component of the platform's name, so no part is wired to it. |
| `part-not-placed` | `warn` | A part of the flow is wired to no socket of the platform, with why; it stays in the flow. |
| `socket-selector-unreadable` | `warn` | The selector a socket of the platform declares does not read, so no part is wired to it; once for each socket. |
| `credential-emptied` | `warn` | A credential value is written empty in the flow the draft carries, named by its node and its field. |
| `carriage-returns-rewritten` | `warn` | The flow's carriage returns are written as line feeds, with how many. |
| `definition-not-carried` | `warn` | The flow is not carried in `values.flow_definition`, with why. |
| `part-reads-connection` | `warn` | How the flow reaches a wired part through its connection. |
| `part-address-in-flow` | `warn` | The flow reaches a wired part other than through its connection, with how. |
| `model-not-named` | `warn` | `values.model` of a referenced part is left for the author, with why. |

## Published with each compiler release

Each compiler release builds both importers from the tagged sources and generates their Plugin
entities from the importers themselves, so an entity's capability, recognition signatures, host
functions and description are what its importer reports. The release signs and publishes both,
`importer/langflow` and `importer/flowise` at the release's version, beside the other core plugins,
and records their entities with the other core plugins' entities for the standard catalog.
