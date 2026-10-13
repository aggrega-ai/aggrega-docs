# Aggrega Wasm Importer Socket schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/wasm-import-v1alpha1.schema.json`

The wire shapes an importer plugin socket consumes (ImportInput) and emits (ImportOutput). An importer turns a foreign infrastructure description into Aggrega entities: it reads the source bytes for a named format, maps each source node to a catalog entity, and returns the entities it emitted, the mapping decisions it made, any diagnostics it raised, and any scaffold files it produced. An importer declares the formats it handles as import:<format> capabilities in its descriptor. The importer maps meaning from the source to entities; the compiler pipes the emitted entities through opaquely.

## One of the following shapes

- `ImportInput`
- `ImportOutput`

## Definitions

### `ImportInput`

The payload an importer guest receives: the source format that selects how to read the bytes, the primary source bytes, any named sources for a multi-file import, an optional opaque options document the consumer supplies for importer-specific behavior, and a view of the Components the workspace's catalog holds.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `format` | string | yes | The name of the source format to import, matching one of the importer's advertised import:<format> capabilities. The importer reads the sources as this format. |
| `bytes` | string | yes | The primary source bytes to import, which the importer reads as the named format: the whole file where the import's source is one file, and empty where it is a directory, whose files arrive as named sources instead. Each kit carries them in its own field type — raw where that type is a byte type, base64-encoded where it is a string the importer decodes to recover them — and the generated encoder converts between the field and the form the wire carries bytes in. |
| `sources` | ImportSource[] | no | Named sources, each carrying its own bytes, in one list sorted by name. Where the import's source is a directory, there is one per file of it that the importer's declared file patterns select, named by its slash-separated path inside the directory. The files the attachment configuring the importer declares under with.sources are carried here too, each under its base name, and the host refuses an import in which a file read from the directory and one of these carry the same name. Absent where neither supplies any. |
| `settings` | any | no | An opaque import-options document the consumer supplies for importer-specific behavior. The host pipes it through without interpreting it; the importer reads whatever shape it documents. Absent when the consumer supplies no options. |
| `catalog` | CatalogProjection | no | A view of the Components the workspace's own catalog holds — the catalog the importer itself was selected from — so the importer can weigh them as candidates when it maps a source node to a catalog entity. The host builds it from that local catalog alone, and it carries names, versions, labels and declared structure only: never a value, a default or a secret. Its order is fixed, so one catalog yields one byte sequence. Absent when the catalog holds no Component. |

_Additional properties are not permitted._

### `CatalogProjection`

The workspace's catalog as an importer sees it: one entry per Component the catalog holds, each carrying the metadata an importer weighs when it scores a candidate.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `components` | CatalogComponent[] | yes | One entry per Component name the catalog holds, sorted by name. Where the catalog holds several versions of one Component, its entry describes the version a reference naming the Component without a version resolves to. |

_Additional properties are not permitted._

### `CatalogComponent`

One Component of the workspace's catalog: its name and version, its labels, the key names its values and provides declare, and the sockets it declares for its dependencies. A Component that extends another carries what it inherits as well as what it declares itself.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | The Component's name, as its metadata.name declares it — the name an Aggregate references it by. |
| `version` | string | yes | The Component's version, as its metadata.version declares it. |
| `labels` | map of string | no | The Component's labels, as a string-to-string map. Absent when it carries none. |
| `values` | string[] | no | The top-level key names the Component's values declares, sorted. A list of names only: it never carries a value or a default. Absent when its values declares no key. |
| `provides` | string[] | no | The top-level key names the Component's provides declares, sorted. A list of names only: it never carries a value. Absent when its provides declares no key. |
| `sockets` | CatalogSocket[] | no | The sockets the Component declares for its dependencies, in declaration order: for a Component that extends another, the sockets it inherits come first, in the order the extended Component declares them, followed by those it adds. Absent when it declares none. |

_Additional properties are not permitted._

### `CatalogSocket`

One socket a catalog Component declares for its dependencies: the socket's name and the label selector a dependency wired through it must satisfy.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | The socket's name, as the Component's usesSchema declares it. |
| `selector` | string | yes | The socket's label selector, verbatim, in the Kubernetes-style grammar the Component writes it in: the labels a dependency wired through this socket must carry. |

_Additional properties are not permitted._

### `ImportSource`

One named source within a multi-file or directory import: a name locating the source and its own bytes.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | The name of this source within the import, such as a relative file path. |
| `bytes` | string | yes | This source's bytes. Each kit carries them in its own field type — raw where that type is a byte type, base64-encoded where it is a string the importer decodes to recover them — and the generated encoder converts between the field and the form the wire carries bytes in. |

_Additional properties are not permitted._

### `ImportOutput`

The payload an importer guest returns: the entities the import produced, the mapping decisions behind them, any diagnostics the import raised, and any scaffold files it produced. Every field is optional, so an import that resolved nothing may return diagnostics alone.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `entities` | EmittedEntity[] | no | The entities the import produced, each either a reference to an existing catalog entity or a drafted entity body. Absent when the import emitted no entities. |
| `decisions` | ImportDecision[] | no | The mapping decisions the import made, one per source node it resolved, recording the candidates it weighed and the choice it made. Absent when the import recorded no decisions. |
| `diagnostics` | Diagnostic[] | no | Diagnostics the import raised — for example an unresolved source node or an ambiguous mapping. Absent when the import produced none. |
| `files` | ScaffoldFile[] | no | Scaffold files the import produced alongside the entities, such as a starter aggregate or a readme. Absent when the import produced no files. |
| `error` | string | no | A failure message set when the guest ran but could not complete the operation; absent on success. It is distinct from any diagnostics the output carries: diagnostics report issues found during a run that still produced a result, while error reports that the operation itself did not complete. The host surfaces a present error as a failed plugin invocation. |

_Additional properties are not permitted._

### `EmittedEntity`

One entity the import produced: its kind, its name, and how it is emitted — a reference to an existing catalog entity or a newly drafted entity body.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `kind` | string | yes | The kind of entity emitted. In v1 this is Component or Aggregate; additional kinds may appear as the emission surface grows, so a reader tolerates an unrecognized kind. |
| `name` | string | yes | The name of the emitted entity. |
| `mode` | string (enum) | yes | How the entity is emitted: reference points at an existing catalog entity by name, and draft carries a newly drafted entity body. Allowed values: `"reference"`, `"draft"` |
| `body` | string | no | The raw YAML body of a drafted entity. Empty for a pure reference, which names an existing entity rather than drafting one. |
| `labels` | map of string | no | Labels to attach to the emitted entity, as a string-to-string map. Empty in v1; reserved for a future label-driven emission axis. |
| `annotations` | map of string | no | Annotations to attach to the emitted entity, as a string-to-string map. Empty in v1; reserved for a future annotation-driven emission axis. |
| `sourceRef` | string | no | A reference to the source node this entity was emitted from, so a reader can trace the entity back to its origin in the imported source. |
| `decisionRef` | string | no | A reference to the mapping decision that produced this entity, linking it to the candidates weighed and the choice made. |

_Additional properties are not permitted._

### `ImportDecision`

One mapping decision: the source node the importer resolved, the candidate catalog entities it weighed, the candidate it chose, and the reasoning behind the choice.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `sourceNode` | DecisionSourceNode | yes | The source node this decision resolved: the node the importer read from the source and mapped to a catalog entity. |
| `candidates` | ImportCandidate[] | no | The candidate catalog entities the importer weighed for this source node, each with its score and the per-signal breakdown behind that score. Absent when the importer weighed no candidates. |
| `chosen` | DecisionChoice | no | The candidate the importer chose for this source node, and how it emitted it. Absent when the importer made no choice. |
| `rationale` | string | no | A human-readable explanation of why the importer made this choice. |
| `swapHint` | string | no | A hint describing how to swap the chosen mapping for an alternative, so a reader can revise the decision. |

_Additional properties are not permitted._

### `DecisionSourceNode`

The source node a mapping decision resolved: an identifier, the type the source names it, and a human-readable summary of its parameters.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | yes | The identifier of the source node within the imported source. |
| `type` | string | yes | The type of the source node as the source names it. |
| `paramsSummary` | string | yes | A human-readable summary of the source node's parameters, for display alongside the decision. |

_Additional properties are not permitted._

### `ImportCandidate`

One candidate catalog entity the importer weighed for a source node: the candidate component, its overall score, the match tier the score falls into, and the per-signal breakdown behind the score.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `componentName` | string | yes | The name of the candidate catalog component. |
| `score` | number | yes | The candidate's overall match score, aggregated from the per-signal breakdown. |
| `tier` | string | yes | The match tier the candidate falls into, a coarse band over the score. |
| `signals` | CandidateSignals | yes | The per-signal breakdown behind the candidate's score. |

_Additional properties are not permitted._

### `CandidateSignals`

The per-signal breakdown behind a candidate's score: one contribution per matching signal. A fixed-field object, so the set of signals is stable and the wire is deterministic.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `table` | number | yes | The score contribution from the mapping-table signal. |
| `category` | number | yes | The score contribution from the category signal. |
| `domainLabels` | number | yes | The score contribution from the domain-labels signal. |
| `shape` | number | yes | The score contribution from the shape signal. |
| `name` | number | yes | The score contribution from the name signal. |

_Additional properties are not permitted._

### `DecisionChoice`

The candidate a mapping decision chose: the target catalog entity, how it is emitted, and the match tier of the choice.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `target` | string | yes | The name of the chosen target catalog entity. |
| `mode` | string | yes | How the chosen target is emitted, mirroring an emitted entity's mode: a reference to an existing entity or a newly drafted body. |
| `tier` | string | yes | The match tier of the chosen target. |

_Additional properties are not permitted._

### `ScaffoldFile`

One scaffold file the import produced: a path relative to the import output root and the file's content.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `path` | string | yes | The path of the scaffold file, relative to the import output root. |
| `content` | string | yes | The scaffold file's content. |

_Additional properties are not permitted._
