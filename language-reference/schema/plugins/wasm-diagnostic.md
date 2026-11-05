# Aggrega Wasm-plugin shared diagnostic schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/wasm-diagnostic-v1alpha1.schema.json`

The single diagnostic shape every Wasm socket shares. A plugin reports one entry per issue it raises; the host surfaces it. The shape is a superset: every socket populates the subset it uses and omits the rest, so a diagnostic from any socket is one uniform structure. severity is one of three values every socket shares — halt, warn, or info — so a diagnostic carries the same meaning whichever socket raised it.

**Top-level type:** `object`

## Definitions

### `Diagnostic`

One issue a diagnostic emitter raised: a severity, a human-readable message, an optional location, and optional emitter-specific fields. An emitter is a Wasm plugin socket or the compiler itself — both report on this one shape, so a reader interprets an entry the same way whichever raised it. Each populates the subset it uses and omits the rest: a parser sets a location span, an import sets code and source_ref, a publishing linter sets rule_id and classification, a governance verdict sets the build-outcome severity and message and may add any of code, rule_id, classification, source_ref, location and suggest, and a render advisory sets code, source_ref and a structured location.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `severity` | string (enum) | yes | The diagnostic's severity, drawn from one closed set every socket shares. halt stops the build and names what to fix. warn surfaces alongside a build that still completes. info records the observation and leaves the build outcome unchanged. Every emitter reports from this one set, so a reader interprets a severity the same way whichever raised it. Allowed values: `"halt"`, `"warn"`, `"info"` |
| `message` | string | yes | The human-readable diagnostic text. |
| `code` | string | no | An optional stable, machine-matchable code for the diagnostic, independent of the human-readable message. Absent when the emitter assigns no code. A code may come from a plugin socket or from the compiler's own advisories, which set one on every entry they raise. |
| `rule_id` | string | no | The identifier of the rule that produced the diagnostic, when the emitter is rule-based (a publishing linter). Absent otherwise. |
| `classification` | string (enum) | no | A semantic-version-impact classification the diagnostic carries, when the emitting rule assigns one (a schema-evolution rule). Absent for diagnostics that carry no classification. Allowed values: `"PATCH"`, `"MINOR"`, `"MAJOR"` |
| `source_ref` | string | no | An opaque reference to the source element the diagnostic concerns (for example the identifier of a source node an import could not resolve). Absent when the diagnostic references no specific source element. |
| `location` | Location | no | Where the diagnostic points, when the emitter can locate the issue. A parser fills the byte span; a renderer fills the structured position within a source document. Absent when the diagnostic has no location. |
| `suggest` | string | no | An optional remediation hint the emitter offers alongside the diagnostic. Absent when no hint is offered. |

_Additional properties are not permitted._

### `Location`

Where a diagnostic points. It carries one unified locator that serves both a byte-precise position in raw source text (a parser fills the span) and a structured position within a source document (a renderer fills key_path, uri, line, and kind), and names the instance of the build the diagnostic concerns where there is one (instance). Every field is optional; a socket populates the representation it can produce and omits the rest.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `span` | Span | no | The span of raw source bytes the diagnostic locates, when the emitter parses source and can pin the issue to a byte range (a parser). Absent otherwise. |
| `key_path` | string | no | A dotted path to the offending element within a structured source document, when the emitter locates the issue structurally (a renderer). Absent otherwise. |
| `uri` | string | no | An identifier for the source artifact the diagnostic concerns, when the emitter knows it (a renderer). Absent otherwise. It never names an instance of the build; instance carries that. |
| `line` | integer | no | A line number within the structured source document, distinct from the raw-byte line and column carried by span. Present when the emitter knows a document line (a renderer). Absent otherwise. |
| `kind` | string | no | An open string naming the source surface the location refers to, when the emitter distinguishes surfaces (a renderer). Absent otherwise. |
| `instance` | string | no | The instance of the build the diagnostic concerns, by the identity the build gives it: a component by the name the Aggregate declares it under, a component a module contributes by its path dotted through the module, a component the build derives by the identity the build composes for it, and a module by its own path. Present when the diagnostic is about one instance; absent otherwise. |

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
