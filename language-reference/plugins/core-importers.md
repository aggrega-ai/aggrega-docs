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
each node, deciding whether to reference one or draft a new one, writing the drafts and reading the
settings below — is that package's, and only reading the format is particular to each importer. How
the importer socket works, and what it is handed, is described under
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
  field as a value field. The field's name plays no part, and no field's value is read.
- A note pinned to the canvas, a node of type `noteNode`, is not imported, and an edge to a node that
  is not imported is dropped.

## What the Flowise importer reads

- The nodes and edges at the top level of the flow, `nodes` and `edges`.
- For each node, its type from the node's `data.name`; its credential slots from the entries of
  `data.inputParams` whose `type` is `credential`, by their `name`; and its value fields from the keys
  of `data.inputs`, less the ones `data.inputAnchors` names — where another node connects in, which
  the edge between them records — and less the credentials.
- No field's value is read, and a credential's name plays no part in its being one.
- A note pinned to the canvas, a node of type `stickyNote`, is not imported, and an edge to a node that
  is not imported is dropped.

## What they draft

Each node is weighed against the Components of the workspace's own catalog and nothing else, as the
[importer socket](plugin-contract.md#the-importer-socket--draft-authoring-output) describes, and each
importer carries a short table mapping common node types of its format — chat and embedding models,
retrieval, HTTP requests — to standard-library Components. A row of that table counts towards a match
only where the workspace's catalog holds the Component it names. The command reports one line for
each node it mapped, naming what it chose, the match tier and the best candidate's score.

By default an import writes:

- `aggregate.yaml` — a draft Aggregate named `<target_namespace>/flow`, composing the flow's nodes.
- one file under `components/` for each node it drafts — a draft Component named
  `<target_namespace>/<category>/<name>`, the name taken from the node's type, at version `0.1.0`, its
  value fields as string fields of a closed `values` object and its credential fields as required
  credential slots whose delivery a Recipe decides.

A node referenced to a catalog Component, rather than drafted, has no file of its own: the draft
Aggregate names the Component.

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
| `reuse_mode` | `hints-only` | `hints-only` drafts every node and references no catalog Component, recording a strong match as a hint. `auto-apply-above-threshold` references the best-matching catalog Component for a node whose match is in the high tier and scores at or above `reuse_threshold`, and drafts every other node. Any other value reads as `hints-only`. |
| `reuse_threshold` | `0.85` | The score at or above which `auto-apply-above-threshold` references a Component. Read in that mode only; `0` reads as the default. |
| `emit_hints` | `true` | Whether a drafted Component's file opens with a comment naming the catalog Component it resembles, for a high- or medium-tier match. `false` leaves the comment out. |
| `render_mode` | `human` | `human` writes the drafts described above. `llm` writes no drafts, and writes instead the whole decision record — every node, the candidates weighed and the choice made — as one document, `import-decisions.json`, for another tool to read. Any other value reads as `human`. |
| `mapping_overrides` | none | Mappings layered over the importer's own table, keyed by format and then by node type. Each entry names the `component` a node of that type maps to and, optionally, its `category`, the `traits` — labels and their values — a matching Component carries, and a `vendor` word its name carries. An entry for a node type the table already maps takes the table row's place. Only the entries under the format being imported are read. |

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

## Published with each compiler release

Each compiler release builds both importers from the tagged sources and generates their Plugin
entities from the importers themselves, so an entity's capability, recognition signatures, host
functions and description are what its importer reports. The release signs and publishes both,
`importer/langflow` and `importer/flowise` at the release's version, beside the other core plugins,
and records their entities with the other core plugins' entities for the standard catalog.
