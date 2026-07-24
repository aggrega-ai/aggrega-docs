# Aggrega Wasm Parser Socket schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/wasm-parse-v1alpha1.schema.json`

The JSON wire shapes a parser plugin socket consumes (ParseInput) and emits (ParseOutput). A parser is a stateless, side-effect-free transformer that turns a foreign text representation into a canonical structured JSON tree, so any consumer in any language can read the tree without carrying its own language parser. A parser declares the formats it handles as parse:<format> capabilities in its descriptor; the host hands it the bytes to parse and the format name, and it returns the tree plus optional diagnostics and source spans. The parser attaches no meaning to the tree beyond its syntax — the compiler pipes the tree through opaquely.

## One of the following shapes

- `ParseInput`
- `ParseOutput`

## Definitions

### `ParseInput`

The payload a parser guest receives: the format name that selects how to read the bytes, the source bytes to parse, and an optional opaque options document the consumer supplies for parser-specific behavior.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `format` | string | yes | The name of the source format to parse, matching one of the parser's advertised parse:<format> capabilities (for example hcl, toml, yaml, or json). The parser reads the bytes as this format. |
| `bytes` | string | yes | The source bytes to parse, base64-encoded on the wire. The parser decodes the base64 to recover the original bytes and reads them as the named format. |
| `options` | any | no | An opaque options document the consumer supplies for parser-specific behavior. The host pipes it through without interpreting it; the parser reads whatever shape it documents. Absent when the consumer supplies no options. |

_Additional properties are not permitted._

### `ParseOutput`

The payload a parser guest returns: the canonical structured tree of the parsed source, plus any diagnostics the parse raised and any source spans locating tree nodes back to the original bytes.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `tree` | any | yes | The canonical structured view of the parsed source, as a JSON document. The top level may be an object, an array, or a scalar, matching the parsed document's own shape (a JSON file, for example, may parse to any of these). The host pipes the tree through opaquely, carrying it verbatim without interpreting its content. |
| `diagnostics` | Diagnostic[] | no | Diagnostics the parse raised — for example a syntax error or a warning. Absent when the parse produced none. |
| `spans` | NodeSpan[] | no | Source spans locating tree nodes back to their position in the original bytes, so a consumer can map a finding on a tree node to a source location. Absent when the parser reports no spans. |
| `error` | string | no | A failure message set when the guest ran but could not complete the operation; absent on success. It is distinct from any diagnostics the output carries: diagnostics report issues found during a run that still produced a result, while error reports that the operation itself did not complete. The host surfaces a present error as a failed plugin invocation. |

_Additional properties are not permitted._

### `NodeSpan`

A source span for one tree node: an RFC 6901 JSON Pointer addressing the node within the tree, paired with the span locating it in the original bytes.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `pointer` | string | yes | An RFC 6901 JSON Pointer into the tree, addressing the node this span locates. |
| `span` | SourceSpan | yes | The span locating the addressed node in the original bytes. |

_Additional properties are not permitted._

### `SourceSpan`

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

### `ParseSourceResponse`

The parse-source host function's reply: on success the canonical structured tree the resolved parser produced, on failure an error message. Exactly one of the two fields is populated. Failure is delivered in-band rather than by trapping, so a consumer guest carries a no-parser or a parse failure into its own diagnostics as a deterministic failure. This is the envelope a consumer socket receives when it asks the host to run a producer through the host; the request payload is a ParseInput.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `tree` | any | no | The canonical structured tree the resolved parser produced on success, as a JSON document carried verbatim; absent on failure. |
| `error` | string | no | The failure message on failure, naming the format and the reason; absent on success. |
| `error_code` | string | no | The machine-matchable failure identity on failure, from the closed host-function error-code catalog, set beside the human error message; absent on success. A guest branches on this code without parsing the message, tolerating an absent code (older host) or an unrecognized one (newer host) by falling back to the message. |

_Additional properties are not permitted._
