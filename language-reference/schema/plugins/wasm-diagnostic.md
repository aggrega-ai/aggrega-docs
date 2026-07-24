# Aggrega Wasm-plugin shared diagnostic schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/wasm-diagnostic-v1alpha1.schema.json`

The single diagnostic shape every Wasm socket shares. A plugin reports one entry per issue it raises; the host surfaces it. The shape is a superset: every socket populates the subset it uses and omits the rest, so a diagnostic from any socket is one uniform structure. severity is an open string so each socket keeps its own vocabulary (a parser reports its own severities, an import reports error/warning/info, a publishing linter reports error/warning, a policy reports the build-outcome verdict deny/warn/audit); the host reads the severity value without the schema constraining it to one vocabulary.

**Top-level type:** `object`

## Definitions

### `Diagnostic`

One issue a Wasm plugin raised: a severity, a human-readable message, an optional location, and optional socket-specific fields. Every socket that emits diagnostics emits this shape; each populates the subset it uses (a parser sets a location span, an import sets code and source_ref, a publishing linter sets rule_id and classification, a policy sets only severity and message, a renderer sets a structured location and suggest) and omits the rest.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `severity` | string | yes | The diagnostic's severity, as an open string so each socket keeps its own vocabulary. A parser reports its own severities; an import reports error, warning, or info; a publishing linter reports error or warning; a policy reports the build-outcome verdict deny, warn, or audit. The host reads the value without the schema constraining it to one vocabulary. |
| `message` | string | yes | The human-readable diagnostic text. |
| `code` | string | no | An optional stable, machine-matchable code for the diagnostic, independent of the human-readable message. Absent when the emitting socket assigns no code. |
| `rule_id` | string | no | The identifier of the rule that produced the diagnostic, when the emitting socket is rule-based (a publishing linter). Absent otherwise. |
| `classification` | string (enum) | no | A semantic-version-impact classification the diagnostic carries, when the emitting rule assigns one (a schema-evolution rule). Absent for diagnostics that carry no classification. Allowed values: `"PATCH"`, `"MINOR"`, `"MAJOR"` |
| `source_ref` | string | no | An opaque reference to the source element the diagnostic concerns (for example the identifier of a source node an import could not resolve). Absent when the diagnostic references no specific source element. |
| `location` | Location | no | Where the diagnostic points, when the emitting socket can locate the issue. A parser fills the byte span; a renderer fills the structured position within a source document. Absent when the diagnostic has no location. |
| `suggest` | string | no | An optional remediation hint the emitting socket offers alongside the diagnostic. Absent when no hint is offered. |

_Additional properties are not permitted._

### `Location`

Where a diagnostic points. It carries one unified locator that serves both a byte-precise position in raw source text (a parser fills the span) and a structured position within a source document (a renderer fills key_path, uri, line, and kind). Every field is optional; a socket populates the representation it can produce and omits the rest.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `span` | Span | no | The span of raw source bytes the diagnostic locates, when the emitting socket parses source and can pin the issue to a byte range (a parser). Absent otherwise. |
| `key_path` | string | no | A dotted path to the offending element within a structured source document, when the emitting socket locates the issue structurally (a renderer). Absent otherwise. |
| `uri` | string | no | An identifier for the source artifact the diagnostic concerns, when the emitting socket knows it (a renderer). Absent otherwise. |
| `line` | integer | no | A line number within the structured source document, distinct from the raw-byte line and column carried by span. Present when the emitting socket knows a document line (a renderer). Absent otherwise. |
| `kind` | string | no | An open string naming the source surface the location refers to, when the emitting socket distinguishes surfaces (a renderer). Absent otherwise. |

_Additional properties are not permitted._

### `Span`

A span of the original source bytes: the byte offsets are the primary, exact location, and the line and column numbers accompany them for human-readable diagnostics.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `start_offset` | integer | yes | The byte offset of the span's first byte in the original source, zero-based. |
| `end_offset` | integer | yes | The byte offset one past the span's last byte in the original source, so end_offset minus start_offset is the span's length in bytes. |
| `start_line` | integer | yes | The line number of the span's start, one-based, for human-readable diagnostics. |
| `start_column` | integer | yes | The column number of the span's start, one-based, for human-readable diagnostics. |
| `end_line` | integer | yes | The line number of the span's end, one-based, for human-readable diagnostics. |
| `end_column` | integer | yes | The column number of the span's end, one-based, for human-readable diagnostics. |

_Additional properties are not permitted._
