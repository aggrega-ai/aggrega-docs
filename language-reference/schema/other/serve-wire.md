# Aggrega Background Daemon Wire Protocol schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/serve-wire-v1alpha1.schema.json`

The message shapes exchanged with a background compiler daemon started by `aggrega serve`. A client opens a session over that daemon with the handshake, and the session is what scopes the settings and the workspace the conversation was opened over; the daemon is the process that answers a request, sends a notification and holds what it has read. The protocol is JSON-RPC 2.0 over standard input and output, each message framed by a Content-Length header; this document describes the message bodies and neither the framing nor the transport. A body is one of four things: a request the client sends, a notification the client sends, a notification the daemon sends, or the response the daemon returns for a request. Three properties of the surface decide how the shapes below are written. First, every request admits two fields beyond the ones its own method declares — `workspaceRoot`, naming the workspace the request acts on, and `workDoneToken`, the caller-minted value progress is reported under — so both appear on every request params object here, including the three methods whose subject is not a workspace and which accept `workspaceRoot` and ignore it. Second, the daemon refuses a request params object carrying a field the method does not accept, naming what it does accept, so every params object here is closed at its top level; a nested object inside a request is not closed, because the check reads only the outermost field names. Third, a result is composed by the daemon rather than supplied by a caller, so result objects are closed at every level whose shape is fixed, and open only where the value is opaque JSON the daemon carries through without reading. One consequence of the daemon's encoding is visible on the wire and is described rather than tidied away: a collection the daemon does not mark optional is emitted as `null` when it has no value to report and as an empty collection when the value it reports is empty, so both forms are admitted wherever that applies.

## One of the following shapes

- `Request`
- `ClientNotification`
- `DaemonNotification`
- `SuccessResponse`
- `ErrorResponse`

## Definitions

### `ProtocolVersion`

The JSON-RPC version every message carries. Only 2.0 is spoken.

**Type:** `const "2.0"`

### `RequestId`

The caller's identifier for a request, echoed on the response that answers it. A message carrying no identifier is a notification and is never answered.

**Type:** `string or number`

### `ProgressToken`

A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused.

**Type:** `string or number`

### `WorkspaceRootSubject`

The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused.

**Type:** `string`

### `WorkspaceRootAccepted`

The absolute path of a workspace. This method's subject is not a workspace — it answers from what the binary itself carries — so the field is accepted and not read. It is admitted because a client may send it uniformly on every request without having to know which methods consult it.

**Type:** `string`

### `RequestMethod`

Every method a request may name. The set is closed: a request naming anything else is answered with a method-not-found error.

**Type:** `string (enum)`

### `ClientNotificationMethod`

Every method a client notification may name. The set is closed, and neither notification is answered.

**Type:** `string (enum)`

### `DaemonNotificationMethod`

Every method a notification the daemon sends may name. The set is closed.

**Type:** `string (enum)`

### `Request`

A request the client sends and the daemon answers. The method names what is being asked; the params object carries that method's own fields plus the two every method admits. A request that omits params entirely is read as one whose fields are all absent.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `jsonrpc` | ProtocolVersion | yes | The JSON-RPC version every message carries. Only 2.0 is spoken. |
| `id` | RequestId | yes | The caller's identifier for a request, echoed on the response that answers it. A message carrying no identifier is a notification and is never answered. |
| `method` | RequestMethod | yes | Every method a request may name. The set is closed: a request naming anything else is answered with a method-not-found error. |
| `params` | object | no |  |

_Additional properties are not permitted._

### `ClientNotification`

A notification the client sends. It carries no identifier and is never answered.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `jsonrpc` | ProtocolVersion | yes | The JSON-RPC version every message carries. Only 2.0 is spoken. |
| `method` | ClientNotificationMethod | yes | Every method a client notification may name. The set is closed, and neither notification is answered. |
| `params` | object | no |  |

_Additional properties are not permitted._

### `DaemonNotification`

A notification the daemon sends. It carries no identifier and is never answered.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `jsonrpc` | ProtocolVersion | yes | The JSON-RPC version every message carries. Only 2.0 is spoken. |
| `method` | DaemonNotificationMethod | yes | Every method a notification the daemon sends may name. The set is closed. |
| `params` | object | yes |  |

_Additional properties are not permitted._

### `CancelRequestParams`

Asks the daemon to abandon a request already in flight, naming it by the identifier the request carried. A request already finished, or never sent, is silently nothing to cancel.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | RequestId | yes | The caller's identifier for a request, echoed on the response that answers it. A message carrying no identifier is a notification and is never answered. |

_Additional properties are not permitted._

### `ShutdownParams`

Asks the daemon to stop accepting work and finish what it has already taken. The notification carries no fields, and the notification itself is usually sent with no params object at all. A second one abandons the work still in flight instead of waiting for it.

_This object declares no fixed properties and permits none._

### `ProgressParams`

One report of work in progress, sent only for a request that minted a progress token in a session that declared it could receive them.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `token` | ProgressToken | yes | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `value` | ProgressBegin or ProgressReport or ProgressEnd | yes | The report itself. One opening report, then any number of lines, then one closing report. |

_Additional properties are not permitted._

### `ProgressBegin`

Opens a report, saying what has started in the terms the operation itself uses.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `kind` | const "begin" | yes | Marks this payload as the opening of a report. Constant: `"begin"` |
| `title` | string | yes | What has started. |

_Additional properties are not permitted._

### `ProgressReport`

One line of the operation's own account of itself. It carries no fraction: the operations that report here work through a set whose size is not known when the work starts, so a fraction would have to be invented.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `kind` | const "report" | yes | Marks this payload as one line of an open report. Constant: `"report"` |
| `message` | string | yes | One line of the operation's own output, with surrounding whitespace removed. |

_Additional properties are not permitted._

### `ProgressEnd`

Closes a report. It carries nothing beyond the kind, because the outcome travels on the response the caller is already waiting for.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `kind` | const "end" | yes | Marks this payload as the close of a report. Constant: `"end"` |

_Additional properties are not permitted._

### `PublishDiagnosticsParams`

The findings for one file, pushed by the daemon when a validation produced them for a document other than the one the request named.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `file` | string | yes | The file the findings are about. |
| `diagnostics` | array or null | yes | The findings, in the order they were produced. |

_Additional properties are not permitted._

### `SuccessResponse`

The answer to a request that succeeded, carrying the identifier of the request it answers. A response carries no method, so which result shape applies is fixed by the request the identifier belongs to rather than by anything in the response itself.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `jsonrpc` | ProtocolVersion | yes | The JSON-RPC version every message carries. Only 2.0 is spoken. |
| `id` | RequestId | yes | The caller's identifier for a request, echoed on the response that answers it. A message carrying no identifier is a notification and is never answered. |
| `result` | InitializeResult or ValidateResult or InvalidateResult or DiagnosticsResult or IrGraphResult or BuildResult or BuildPreviewResult or EntityDefinitionResult or ReleaseClosureResult or ResolveDependenciesResult or CacheStatusResult or CachePruneResult or CacheEvictResult or CacheClearResult or RegistryListResult or SearchResult or RegistryAddResult or RegistryRemoveResult or RegistryUpdateResult or LogoutResult or PublishEntityResult or PublishArtifactResult or SignArtifactsResult or DeprecateArtifactResult or ResolveResult or FindReferencesResult or FindImplementationsResult or HoverResult or CompletionResult or CatalogIndexResult or AttachCandidatesResult or ConnectionCandidatesResult or InsertionPointResult or AttachmentContainerResult or ReleaseCandidatesResult or ActiveReleaseResult or EditDocumentResult or EffectiveConfigurationResult or ConfigInitResult or ConfigCaptureResult or ImportResult or ScaffoldEntityResult or LintResult or PluginAddResult or PluginRemoveResult or PluginSyncResult or PluginGenCatalogResult or ExplainErrorResult or GetSchemaResult | yes | The answer, in the shape the method that was asked returns. |

_Additional properties are not permitted._

### `ErrorResponse`

The answer to a request that was refused or failed, carrying the identifier of the request it answers.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `jsonrpc` | ProtocolVersion | yes | The JSON-RPC version every message carries. Only 2.0 is spoken. |
| `id` | RequestId | yes | The caller's identifier for a request, echoed on the response that answers it. A message carrying no identifier is a notification and is never answered. |
| `error` | ErrorObject | yes | What went wrong: a code a client may branch on, a message written for a person to read, and — where the condition has one — the artifacts and source position the message refers to. |

_Additional properties are not permitted._

### `ErrorObject`

What went wrong: a code a client may branch on, a message written for a person to read, and — where the condition has one — the artifacts and source position the message refers to.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `code` | ErrorCode | yes | The condition the answer reports. The negative codes are the protocol's own reserved set; the four-digit codes are conditions this daemon raises, each naming a state a client can act on. The set is closed. |
| `message` | string | yes | What went wrong, in prose. It is the same wording the same condition carries on every other surface that reports it. |
| `data` | ErrorData | no | The artifacts and source position the message refers to, carried structurally so a client need not read them back out of the prose. Every field is optional and a condition populates only what it has in hand; no field stands in for another, so a client learns what it received from the field it read rather than from the code beside it. |

_Additional properties are not permitted._

### `ErrorCode`

The condition the answer reports. The negative codes are the protocol's own reserved set; the four-digit codes are conditions this daemon raises, each naming a state a client can act on. The set is closed.

**Type:** `const -32700 or const -32600 or const -32601 or const -32602 or const -32603 or const 1001 or const 1003 or const 1004 or const 1005 or const 1006`

### `ErrorData`

The artifacts and source position the message refers to, carried structurally so a client need not read them back out of the prose. Every field is optional and a condition populates only what it has in hand; no field stands in for another, so a client learns what it received from the field it read rather than from the code beside it.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `file` | string | no | The source document the position fields locate — the document being checked, or the Release whose load failed. |
| `line` | integer | no | The line the condition refers to, counted from one. |
| `column` | integer | no | The column the condition refers to, counted from one. |
| `end_line` | integer | no | The line one past the end of the token the condition refers to. Absent where the token has no recoverable end, in which case a client renders the position as a point. |
| `end_column` | integer | no | The column one past the end of the token the condition refers to. |
| `release` | string | no | The Release the condition refers to, spelled the way the request named it, so a client can compose the remedy without reassembling it. |
| `lockfile` | string | no | The lockfile a lockfile-scoped condition is about: the path that was looked for and not found, or could not be read. |

_Additional properties are not permitted._

### `Diagnostic`

One finding about one document: where it is, how serious it is, what it says, and the quotable code that names the condition it reports.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `line` | integer | yes | The line the finding is about, counted from one. |
| `column` | integer | yes | The column the finding is about, counted from one. |
| `severity` | string | yes | How serious the finding is. |
| `message` | string | yes | What the finding says, in prose. |
| `code` | string | no | The condition's descriptive name, stable across releases and quotable in a suppression. |
| `shortCode` | string | no | The condition's short code, the form that opens a halting diagnostic. |
| `codeDescription` | CodeDescription | no | Where the condition the finding names is explained. |
| `classification` | string | no | How the finding was reached, where the condition distinguishes that. |
| `suggest` | string | no | The spelling the finding proposes, where the condition can name one — a near-miss on an identifier, for instance. |
| `keyPath` | string | no | The path through the document to the key the finding is about. |
| `source` | string | yes | What produced the finding. |
| `end_line` | integer | no | The line one past the end of the token the finding is about, so a client can render the whole token rather than a single character. Absent for a token spanning several lines. |
| `end_column` | integer | no | The column one past the end of the token the finding is about. |

_Additional properties are not permitted._

### `CodeDescription`

Where the condition the finding names is explained.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `href` | string | yes | The published address at which the condition is explained. |

_Additional properties are not permitted._

### `Position`

A place in a document: a line and a character offset within it, both counted from zero. The offset is measured in the units of the encoding the session settled on when it was opened, which is UTF-16 unless the client asked for another.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `line` | integer | yes | The line, counted from zero. |
| `character` | integer | yes | The offset within the line, counted from zero, in the units of the encoding the session settled on. |

_Additional properties are not permitted._

### `Range`

A span between two places in a document.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `start` | Position | yes | A place in a document: a line and a character offset within it, both counted from zero. The offset is measured in the units of the encoding the session settled on when it was opened, which is UTF-16 unless the client asked for another. |
| `end` | Position | yes | A place in a document: a line and a character offset within it, both counted from zero. The offset is measured in the units of the encoding the session settled on when it was opened, which is UTF-16 unless the client asked for another. |

_Additional properties are not permitted._

### `Location`

A span in a named document.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `uri` | string | yes | The document the span is in, addressed as a URI. |
| `range` | Range | yes | A span between two places in a document. |

_Additional properties are not permitted._

### `WorkspaceAndProgressParams`

The params object of a method that declares no fields of its own. It still admits the two fields every request admits: the workspace it acts on, and a progress token.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |

_Additional properties are not permitted._

### `InitializeParams`

Opens a session over a workspace and states what the client can handle. This is the one method on which `workspaceRoot` is a declaration rather than a subject: absent, empty and a path are three different things, and a session opened with no path is one the client has not yet pointed at a workspace.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `capabilities` | ClientCapabilities | no | What the client can handle. Unstated is taken as unsupported. Unknown members are ignored rather than refused, so a client may state a capability this daemon does not yet read. |
| `workspaceRoot` | string | no | The absolute path of the workspace to open. Absent leaves the session with no workspace; an empty string is a path the client supplied and is not the same as sending none. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |

_Additional properties are not permitted._

### `ClientCapabilities`

What the client can handle. Unstated is taken as unsupported. Unknown members are ignored rather than refused, so a client may state a capability this daemon does not yet read.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `general` | object | no | Capabilities that are not tied to one kind of answer. |
| `window` | object | no | Capabilities about what the client can show while work is under way. |

_Additional properties are permitted._

#### `ClientCapabilities.general`

Capabilities that are not tied to one kind of answer.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `positionEncodings` | string[] | no | The position encodings the client can read, best first. |

_Additional properties are permitted._

#### `ClientCapabilities.window`

Capabilities about what the client can show while work is under way.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workDoneProgress` | boolean | no | Whether the client can receive progress notifications. A request that mints a progress token in a session which did not declare this is refused. |

_Additional properties are permitted._

### `ValidateParams`

Checks the workspace, or one document in it, and answers with the findings.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `file` | string | no | The document to check. Absent checks what the workspace holds. |
| `content` | string | no | The document's text as the client currently holds it, for checking a buffer that has not been saved. Absent reads the bytes on disk. |
| `release` | string | no | The Release to check against, as a path relative to the workspace root. |

_Additional properties are not permitted._

### `InvalidateParams`

Tells the daemon that a document it holds a reading of has changed, so the next answer about it is computed from the new bytes.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `file` | string | no | The document that changed. |
| `granularity` | string | no | How much of what the daemon holds to drop. |

_Additional properties are not permitted._

### `DiagnosticsParams`

Answers with the findings the daemon already holds for a document, without checking it again.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `file` | string | no | The document to report on. The daemon must already hold a reading of it. |

_Additional properties are not permitted._

### `IrGraphParams`

Answers with the resolved graph a Release compiles to, without rendering it.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `release` | string | no | The Release to resolve, as a path relative to the workspace root. An absolute path is refused. |

_Additional properties are not permitted._

### `BuildParams`

Compiles a Release and writes the rendered artifacts into the workspace.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `release` | string | no | The Release to build, as a path relative to the workspace root. An absolute path is refused. |
| `outputParent` | string | no | The directory the output directory is created inside, as a path relative to the workspace root. The artifacts land in the output directory beneath it, the same way they do beneath the directory a build is run in — so this names the output directory's parent and never the output directory itself. Absent, or empty, writes where a build run at the workspace root writes. An absolute path, or one that climbs out of the workspace, is refused. |
| `autoPull` | boolean | no | Whether to resolve the Release's dependencies first. Asking for it reaches the configured registries and writes the lockfile; unasked, the build reaches no registry. |

_Additional properties are not permitted._

### `BuildPreviewParams`

Compiles a Release and reports what writing the artifacts would have produced, writing nothing. It declines the dependency-resolution field the writing build takes, because a request that writes nothing cannot fill a lockfile.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `release` | string | no | The Release to compile, as a path relative to the workspace root. |
| `autoPull` | boolean | no | Accepted on the wire and refused by the method: this request writes nothing, so it cannot fill a lockfile and remain what it says it is. |

_Additional properties are not permitted._

### `EntityDefinitionParams`

Answers with what one entity name resolves to and where the document defining it lives.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `name` | string | no | The entity to resolve, by name. |

_Additional properties are not permitted._

### `ReleaseClosureParams`

Answers with everything a Release depends on, as resolution reached it.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `release` | string | no | The Release to inspect, as a path relative to the workspace root. |

_Additional properties are not permitted._

### `ResolveDependenciesParams`

Resolves a Release's dependencies, pinning them in the lockfile and acquiring the external inputs its render consumes. It reaches the configured registries and it writes.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `release` | string | no | The Release to resolve, as a path relative to the workspace root. |
| `upgrade` | boolean | no | Whether to re-resolve within the declared ranges rather than honouring what the lockfile already pins. |
| `targets` | string[] | no | The references to re-resolve, leaving the rest pinned as they are. Empty resolves everything. |
| `verify` | boolean | no | Whether to check each acquired artifact against the digest the lockfile pins. |

_Additional properties are not permitted._

### `CacheEvictParams`

Reclaims cached content until what remains fits under a size the request names.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `maxSize` | string | no | The size to reclaim down to, written the way a person writes one — for instance 500MB. |

_Additional properties are not permitted._

### `SearchParams`

Searches what the configured registries' local indexes offer. It reads the index already on disk and contacts no registry.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `query` | string | no | The text to match against a record's name and description. |
| `kinds` | string[] | no | The entity kinds to keep. Empty keeps every kind. |
| `selector` | string | no | A label selector the kept records must satisfy. |
| `capabilities` | string[] | no | The capabilities a kept plugin record must declare. |
| `pluginType` | string | no | The plugin type to keep. |
| `registry` | string | no | The one registry host to search. Absent searches every configured host. |
| `limit` | integer | no | The most records to answer with. |
| `includeRetracted` | boolean | no | Whether to keep versions a published marker has deprecated. |

_Additional properties are not permitted._

### `RegistryAddParams`

Registers a registry and the trust policy resolution applies to what it serves. It writes the machine-wide configuration file unless the request asks otherwise, so every workspace on the machine resolves through the entry.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `host` | string | no | The registry host to register. |
| `name` | string | no | A friendly alias that resolves to the host. |
| `identities` | string[] | no | The signing identities trusted for what this registry serves. |
| `keyPath` | string | no | The path of a public key to trust, for a registry signed with one rather than with a keyless identity. |
| `trustedRoot` | string | no | The path of the trust anchor to verify signatures against. |
| `requireSignatures` | boolean | no | Whether an artifact from this registry must carry a verified signature. Absent states nothing and leaves the resolved default in place. |
| `advisory` | boolean | no | Whether a failed verification is reported rather than halting. |
| `fetchTrust` | boolean | no | Whether to read the trust policy the registry advertises and pin it. Absent states nothing and leaves the resolved default in place. |
| `global` | boolean | no | Write the machine-wide configuration file, which is this method's own default. |
| `workspace` | boolean | no | Write this workspace's own configuration file instead of the machine-wide one. |

_Additional properties are not permitted._

### `RegistryRemoveParams`

Removes a registered registry. It writes the machine-wide configuration file unless the request asks otherwise.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `registry` | string | no | The registry to remove, by host or by alias. |
| `global` | boolean | no | Write the machine-wide configuration file, which is this method's own default. |
| `workspace` | boolean | no | Write this workspace's own configuration file instead of the machine-wide one. |

_Additional properties are not permitted._

### `RegistryUpdateParams`

Refreshes the local index a search reads, reaching the registry to do it. What it writes is the index under this workspace's own configured cache directory. A registry needing a credential no ambient source carries is refused with the credential named, rather than prompted for.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `registry` | string | no | The one registry to refresh. Absent refreshes every configured host. |
| `upgrade` | boolean | no | Whether to rebuild the index rather than adding to what it already holds. |

_Additional properties are not permitted._

### `LogoutParams`

Removes a stored registry credential. The store is shared by every project on the machine, and the answer says so.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `registry` | string | no | The registry whose stored credential to remove. |

_Additional properties are not permitted._

### `PublishEntityParams`

Publishes an entity to a registry. What it lands is what every consumer of that registry resolves, and a published version cannot be recalled from anyone who already fetched it. Nothing is prompted for: identity resolves from what the request supplied or what the environment already carries.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `entity` | string | no | The entity document to publish, as a path relative to the workspace root. |
| `registry` | string | no | The registry to publish to. Absent uses the configured default. |
| `dryRun` | boolean | no | Whether to report what publishing would land without landing it. |
| `sign` | boolean | no | Whether to sign what is published. Absent states nothing and leaves the resolved default in place. |
| `plugin` | string | no | The plugin module to publish alongside a Plugin entity. |
| `fulcioUrl` | string | no | The certificate authority to obtain a signing certificate from. |
| `rekorUrl` | string | no | The transparency log to record the signature in. |
| `timestampUrl` | string | no | The timestamp authority to countersign with. |
| `identityToken` | string | no | The identity token to sign with, supplied by the caller rather than obtained at a terminal. |

_Additional properties are not permitted._

### `PublishArtifactParams`

Publishes an arbitrary file to a registry under a name and tag the request gives it.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `file` | string | no | The file to publish, as a path relative to the workspace root. |
| `name` | string | no | The repository name to publish under. |
| `tag` | string | no | The tag to publish under. |
| `mediaType` | string | no | The media type to record for the published bytes. |
| `registry` | string | no | The registry to publish to. Absent uses the configured default. |
| `dryRun` | boolean | no | Whether to report what publishing would land without landing it. |

_Additional properties are not permitted._

### `SignArtifactsParams`

Signs what is already published. A signature cannot be recalled from anyone who already fetched it.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `references` | string[] | no | The published references to sign. |
| `fulcioUrl` | string | no | The certificate authority to obtain a signing certificate from. |
| `rekorUrl` | string | no | The transparency log to record the signature in. |
| `timestampUrl` | string | no | The timestamp authority to countersign with. |
| `identityToken` | string | no | The identity token to sign with, supplied by the caller rather than obtained at a terminal. |

_Additional properties are not permitted._

### `DeprecateArtifactParams`

Marks a published version as deprecated, so resolution can report or decline it. The marker is itself published and signed.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `reference` | string | no | The published reference to mark. |
| `severity` | string | no | How strongly the marker speaks — whether resolution reports the version or declines it. |
| `reason` | string | no | Why the version is deprecated. |
| `replacement` | string | no | The reference to use instead. |
| `message` | string | no | What a consumer meeting the marker is told. |
| `from` | string | no | The earliest version the marker covers, for marking a span rather than one version. |
| `fulcioUrl` | string | no | The certificate authority to obtain a signing certificate from. |
| `rekorUrl` | string | no | The transparency log to record the signature in. |
| `timestampUrl` | string | no | The timestamp authority to countersign with. |
| `identityToken` | string | no | The identity token to sign with, supplied by the caller rather than obtained at a terminal. |

_Additional properties are not permitted._

### `ResolveParams`

Answers where the thing under the cursor is defined.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `uri` | string | no | The document the cursor is in. |
| `position` | Position | no | A place in a document: a line and a character offset within it, both counted from zero. The offset is measured in the units of the encoding the session settled on when it was opened, which is UTF-16 unless the client asked for another. |

_Additional properties are not permitted._

### `FindReferencesParams`

Answers where the thing under the cursor is referred to.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `uri` | string | no | The document the cursor is in. |
| `position` | Position | no | A place in a document: a line and a character offset within it, both counted from zero. The offset is measured in the units of the encoding the session settled on when it was opened, which is UTF-16 unless the client asked for another. |

_Additional properties are not permitted._

### `FindImplementationsParams`

Answers which documents implement the thing under the cursor.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `uri` | string | no | The document the cursor is in. |
| `position` | Position | no | A place in a document: a line and a character offset within it, both counted from zero. The offset is measured in the units of the encoding the session settled on when it was opened, which is UTF-16 unless the client asked for another. |

_Additional properties are not permitted._

### `HoverParams`

Answers with what to show about the thing under the cursor.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `uri` | string | no | The document the cursor is in. |
| `position` | Position | no | A place in a document: a line and a character offset within it, both counted from zero. The offset is measured in the units of the encoding the session settled on when it was opened, which is UTF-16 unless the client asked for another. |

_Additional properties are not permitted._

### `CompletionParams`

Answers with what may be written at the cursor.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `uri` | string | no | The document the cursor is in. |
| `position` | Position | no | A place in a document: a line and a character offset within it, both counted from zero. The offset is measured in the units of the encoding the session settled on when it was opened, which is UTF-16 unless the client asked for another. |
| `context` | CompletionContext | no | What caused the request, where the client tracks it. |

_Additional properties are not permitted._

### `CompletionContext`

What caused the request, where the client tracks it.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `triggerKind` | integer | no | Why completion was asked for. |
| `triggerCharacter` | string | no | The character that caused it, where a character did. |

_Additional properties are permitted._

### `AttachCandidatesParams`

Answers which Features may be attached to an entity, judged against that entity's labels.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `node` | string | no | The entity to judge candidates against, by name, read from what the workspace documents declare. |
| `graphNode` | string | no | The graph node to judge candidates against, whose labels are the finalised set the build itself evaluates applicability with. An answer computed over this says what the build will do. |
| `release` | string | no | The Release whose graph the node belongs to, as a path relative to the workspace root. |
| `labels` | map of string | no | Labels to judge against directly, in place of reading them from an entity or a graph node. |

_Additional properties are not permitted._

### `ConnectionCandidatesParams`

Answers which entities a socket on an entity may be wired to.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `node` | string | no | The entity whose sockets are being asked about. |
| `socket` | string | no | The one socket to answer for. Absent answers for every socket the entity declares. |

_Additional properties are not permitted._

### `InsertionPointParams`

Answers where in a document a new entry under a named container belongs, leaving composing and applying the entry to the caller that owns the buffer.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `file` | string | no | The document to answer about. |
| `container` | string[] | no | The path through the document to the container the entry belongs under. |

_Additional properties are not permitted._

### `AttachmentContainerParams`

Answers which document, and where in it, an attachment on a graph node belongs.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `graphNode` | string | no | The graph node the attachment is for. |
| `release` | string | no | The Release whose graph the node belongs to, as a path relative to the workspace root. |

_Additional properties are not permitted._

### `EditDocumentParams`

Applies one bounded edit to a document the workspace carries: one entry added under one container, or one scalar set. The composed document is checked against its kind's schema and reaches disk only if that passes, so this cannot write what the authoring schema refuses. A refused edit leaves the file byte-for-byte as it was.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `file` | string | no | The document to edit. |
| `edit` | string | no | Which edit to apply. |
| `node` | string[] | no | The path through the document to the entry being edited. |
| `socket` | string | no | The socket the edit is about, for an edit that wires one. |
| `name` | string | no | The name the edit writes. |
| `value` | any | no | The value the edit writes, in whatever shape the edit takes. |
| `dryRun` | boolean | no | Whether to answer with the composed document rather than writing it. |

_Additional properties are not permitted._

### `ConfigInitParams`

Seeds a configuration document. It writes the machine-wide file by default, since a registry and the identities trusted on it are machine-wide tooling. It reaches the named registry to read the trust policy it advertises; a registry advertising nothing is reported as such and the seeding proceeds on the built-in baseline.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `registry` | string | no | The registry to seed the configuration for. |
| `force` | boolean | no | Whether to overwrite a configuration document that already exists. |
| `global` | boolean | no | Write the machine-wide configuration file, which is this method's own default. |
| `workspace` | boolean | no | Write this workspace's own configuration file instead of the machine-wide one. |
| `dryRun` | boolean | no | Whether to answer with the document's content rather than writing it, for a client that keeps its own document model. |

_Additional properties are not permitted._

### `ConfigCaptureParams`

Freezes the resolved configuration into this workspace's own document, so the workspace is self-contained. It always writes that workspace's file and reaches nothing outside it.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `allPlugins` | boolean | no | Whether to freeze every attached plugin rather than only the ones the workspace itself configured. |

_Additional properties are not permitted._

### `ImportParams`

Converts a foreign source description into draft authoring documents. A source it could not fully convert is an answer rather than a failure: the drafts it did produce are written and the findings say what it could not convert.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `source` | string | no | The source description to convert. |
| `outputDir` | string | no | The directory under the workspace to write the drafts into. Absent writes where the same conversion in this workspace would. |
| `format` | string | no | The source format. Absent lets the conversion determine it. |
| `dryRun` | boolean | no | Whether to answer with the drafts' content rather than writing them. |

_Additional properties are not permitted._

### `ScaffoldEntityParams`

Drafts a starter document for an entity kind. The skeleton is derived from the schema set the binary carries, so nothing is read from a workspace and nothing is written — the answer is text, and where it goes is the client's.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootAccepted | no | The absolute path of a workspace. This method's subject is not a workspace — it answers from what the binary itself carries — so the field is accepted and not read. It is admitted because a client may send it uniformly on every request without having to know which methods consult it. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `kind` | string | no | The entity kind to draft, named as a lowercase-hyphenated schema token such as component, aggregate, release or recipe. |
| `name` | string | no | The name to write into the drafted document. |

_Additional properties are not permitted._

### `LintParams`

Checks catalog publishing conventions over one entity, over everything a Release's closure reaches, or over everything under the configured catalog directories. Nothing is written under any mode.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `entity` | string | no | The one entity document to check. |
| `release` | string | no | The Release whose closure to check, as a path relative to the workspace root. |
| `prePublish` | boolean | no | Whether to compare each entity against its previously published version, which reaches the configured registries. |

_Additional properties are not permitted._

### `PluginAddParams`

Attaches a plugin to a socket the workspace configures. It reaches a registry to resolve the query to one plugin and to pin a version. The one decision a terminal would obtain — accepting a command-extension plugin's declared capabilities — arrives as a field here, so the client asks whoever is driving it and this surface never waits on a prompt.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `type` | string | no | The socket the plugin attaches to. |
| `query` | string | no | What to resolve to one plugin. |
| `capability` | string | no | The capability the attachment is for, where the socket carries several. |
| `role` | string | no | The role the attachment runs in, which fixes what it may emit. |
| `global` | boolean | no | Write the machine-wide configuration file. |
| `workspace` | boolean | no | Write this workspace's own configuration file. |
| `acceptCapabilities` | boolean | no | Whether the caller accepts the capabilities a command-extension plugin declares. |
| `dryRun` | boolean | no | Whether to answer with the configuration document's content rather than writing it. |

_Additional properties are not permitted._

### `PluginRemoveParams`

Detaches a plugin from a socket the workspace configures.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `type` | string | no | The socket the plugin is attached to. |
| `query` | string | no | Which attachment to remove. |
| `global` | boolean | no | Write the machine-wide configuration file. |
| `workspace` | boolean | no | Write this workspace's own configuration file. |

_Additional properties are not permitted._

### `PluginSyncParams`

Aligns a Plugin entity's machine-owned records with the module it points at. It rewrites those records and carries every other byte of the document through unchanged.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `entity` | string | no | The Plugin entity document to align. |
| `plugin` | string | no | The plugin module to read the records from. |

_Additional properties are not permitted._

### `PluginGenCatalogParams`

Generates Plugin catalog documents from a plugin's own declared metadata plus an authored overlay. Regenerating over unchanged inputs produces byte-identical documents.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `fromEmbedded` | boolean | no | Whether to read the metadata from the plugins the binary already carries. |
| `plugin` | string | no | The plugin module to read the metadata from. |
| `outputDir` | string | no | The directory under the workspace to write the documents into. |
| `overlay` | string | no | The authored document whose content is merged over the generated metadata. |
| `dryRun` | boolean | no | Whether to answer with the documents' content rather than writing them. |

_Additional properties are not permitted._

### `ExplainErrorParams`

Expands a code a finding carried into what the compiler declares about that condition and the published entries that teach the authoring fix. It acquires the published documentation when the workspace has no copy; one it cannot acquire still answers what the binary declares, and says why the prose is missing.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `code` | string | no | The condition to expand, named by either the code a finding carried or its short code. |

_Additional properties are not permitted._

### `GetSchemaParams`

Answers with a kind's schema, or — when no kind is named — with which kinds can be named. It answers for the running binary rather than for whichever copy is installed elsewhere, so it needs no workspace and reads none.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootAccepted | no | The absolute path of a workspace. This method's subject is not a workspace — it answers from what the binary itself carries — so the field is accepted and not read. It is admitted because a client may send it uniformly on every request without having to know which methods consult it. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `kind` | string | no | The kind whose schema to answer with. Absent answers with the kinds that can be named instead. |

_Additional properties are not permitted._

### `ServerCapabilities`

What the daemon will do in this session, settled against what the client said it can handle.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `positionEncoding` | string | yes | The encoding every position in this session is expressed in. |
| `workDoneProgress` | boolean | no | Whether the daemon will send progress notifications in this session. Present only where the client declared it can receive them. |

_Additional properties are not permitted._

### `ClosureEntity`

One entity a Release depends on, at the version resolution settled.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `uri` | string | yes | The reference the entity resolves from. |
| `version` | string | yes | The version that was settled on. |
| `kind` | string | no | The entity kind. |

_Additional properties are not permitted._

### `ToolchainCorePlugin`

One plugin the compiler itself carries, and the version of it that was used.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `plugin` | string | yes | The plugin's reference. |
| `version` | string | yes | The version that was used. |

_Additional properties are not permitted._

### `ToolchainReport`

The compiler that resolved, and the plugins it carries.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `compilerVersion` | string | yes | The compiler version that resolved. |
| `corePlugins` | ToolchainCorePlugin[] | no | The plugins the compiler carries, with the version of each that was used. |

_Additional properties are not permitted._

### `DependencyResolutionReport`

What a dependency resolution pinned and acquired.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `lockfile` | string | yes | The lockfile that was written. |
| `verified` | boolean | no | Whether each acquired artifact was checked against the digest the lockfile pins. |
| `entities` | array or null | yes | The entities that were pinned. |
| `libraries` | array or null | yes | The libraries that were pinned. |
| `plugins` | array or null | yes | The plugins that were pinned. |
| `sourceArtifacts` | integer | yes | How many source artifacts were acquired. |
| `trustedPlugins` | integer | yes | How many of the pinned plugins carried a verified signature. |
| `toolchain` | ToolchainReport | no | The compiler that resolved, and the plugins it carries. |
| `externalInputs` | integer | yes | How many external inputs the render consumes were acquired. |
| `incompleteExternalInputs` | string | no | Which external inputs could not be acquired, where some could not be. |

_Additional properties are not permitted._

### `BuildNotice`

One thing the build wants the caller to know, which is neither a finding about a document nor a failure.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `class` | string | yes | What kind of notice this is. |
| `text` | string | yes | What the notice says. |

_Additional properties are not permitted._

### `CacheScope`

How far a cache answer reaches. Two of the cache classes are shared by every project on the machine, so every cache answer names which ones it touched — a session opened over one workspace would otherwise be read as reporting only about that workspace.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `machineWideClasses` | array or null | yes | The cache classes this answer touched that are shared across every project on the machine. |
| `workspaceRoot` | string | yes | The workspace the request named. |

_Additional properties are not permitted._

### `CacheElement`

One thing a cache holds.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `label` | string | yes | What the entry is of. |
| `size` | integer | yes | How many bytes it occupies. |
| `sizeText` | string | yes | The same size written the way a person reads one. |
| `digest` | string | no | The content digest the entry is keyed under, where it has one. |
| `note` | string | no | Anything else worth saying about the entry. |

_Additional properties are not permitted._

### `CacheClass`

One cache the daemon reports on.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | Which cache this is. |
| `reach` | string | yes | Whether the cache belongs to this workspace or is shared across the machine. |
| `prunable` | boolean | yes | Whether reclaiming this cache is something the daemon will do. |
| `elements` | array or null | yes | What the cache holds. |

_Additional properties are not permitted._

### `CacheProvenance`

Which identities a cached artifact was acquired under, and how widely it is shared.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `identities` | array or null | yes | The identities the artifact is attributed to. |
| `sharedBy` | integer | no | How many holders share the artifact. |

_Additional properties are not permitted._

### `CacheRemoval`

One thing a reclamation removed.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `class` | string | yes | Which cache it was removed from. |
| `label` | string | yes | What was removed. |
| `reach` | string | yes | Whether the cache it came from belongs to this workspace or is shared across the machine. |
| `size` | integer | yes | How many bytes it occupied. |
| `sizeText` | string | yes | The same size written the way a person reads one. |

_Additional properties are not permitted._

### `CacheShortfall`

What a reclamation left behind, and what would reclaim it, so a caller reading a smaller figure than it expected learns why rather than inferring it.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `class` | string | yes | Which cache holds what was left. |
| `count` | integer | yes | How many entries were left. |
| `size` | integer | yes | How many bytes they occupy. |
| `sizeText` | string | yes | The same size written the way a person reads one. |
| `reach` | string | yes | Whether that cache belongs to this workspace or is shared across the machine. |
| `reclaimedBy` | array or null | yes | What would reclaim them. |

_Additional properties are not permitted._

### `CacheCleared`

One cache a clearing emptied.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `class` | string | yes | Which cache was emptied. |
| `reach` | string | yes | Whether it belongs to this workspace or is shared across the machine. |
| `size` | integer | yes | How many bytes were reclaimed from it. |
| `sizeText` | string | yes | The same size written the way a person reads one. |

_Additional properties are not permitted._

### `ConfigWriteScope`

Which configuration document was written and how far it reaches. A request names one workspace, so an answer that said nothing would be read as being about that workspace — and for a machine-wide write that reading is wrong.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `configFile` | string | yes | The document that was written. |
| `machineWide` | boolean | yes | Whether that document is the one every workspace on the machine resolves through. |
| `workspaceRoot` | string | yes | The workspace the request named. |

_Additional properties are not permitted._

### `PluginWriteScope`

Which configuration document a plugin change was written into and how far it reaches. The command-extension socket's own default is the machine-wide document, so every answer says which one it wrote.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `configFile` | string | yes | The document that was written. |
| `machineWide` | boolean | yes | Whether that document is the one every workspace on the machine resolves through. |
| `workspaceRoot` | string | yes | The workspace the request named. |

_Additional properties are not permitted._

### `CredentialStoreScope`

How far a credential change reaches. The store is shared by every project on the machine and by every other tool addressing the same registries, so the answer reports that rather than leaving a session-scoped reading to be inferred.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `machineWide` | boolean | yes | Whether the store the change touched is shared across the machine. |
| `workspaceRoot` | string | yes | The workspace the request named. |

_Additional properties are not permitted._

### `PublicationReach`

How far a publication reached. These answers reach beyond this machine entirely — what they land is what every consumer of that registry resolves — so each names the host it addressed and whether the call landed anything.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `registry` | string | yes | The registry host that was addressed. |
| `beyondThisMachine` | boolean | yes | Whether anything was landed where others can resolve it. |

_Additional properties are not permitted._

### `WorkspaceEntityRef`

One entity, by kind and name, with the document that declares it.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `kind` | string | yes | The entity kind. |
| `name` | string | yes | The entity name. |
| `file` | string | yes | The document declaring it, as a path relative to the workspace root. |

_Additional properties are not permitted._

### `SourcedEntityRef`

One entity, with where it was read from. A workspace document reports its workspace-relative path; an entity resolved from the configured catalog directories reports an empty path, because the only path it has would mean nothing to a client. The origin says which of the two it is, rather than leaving an empty path to be read as a field nobody filled in.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `kind` | string | yes | The entity kind. |
| `name` | string | yes | The entity name. |
| `file` | string | yes | The document declaring it, as a path relative to the workspace root, or empty where it came from the configured catalog directories. |
| `origin` | string | yes | Where the entity was read from. |

_Additional properties are not permitted._

### `SocketCandidacy`

One socket on an entity, and what may be wired into it.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `socket` | string | yes | The socket's name. |
| `declaration` | string | yes | Where the socket is declared. |
| `selector` | string | yes | The label selector a target must satisfy. |
| `required` | boolean | yes | Whether the socket must be wired for the build to proceed. |
| `targets` | array or null | yes | The entities that may be wired into it. |

_Additional properties are not permitted._

### `CatalogEntity`

One entity the workspace index holds.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `kind` | string | yes | The entity kind. |
| `name` | string | yes | The entity name. |
| `apiVersion` | string | yes | The schema version the document declares. |
| `description` | string | yes | What the document says the entity is for. |
| `labels` | object or null | yes | The labels the document declares. |
| `file` | string | yes | The document declaring it, as a path relative to the workspace root. |
| `origin` | string | yes | Where the entity was read from. |

_Additional properties are not permitted._

### `CompletionItem`

One thing that may be written at the cursor.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `label` | string | yes | The text to write. |
| `kind` | integer | no | What sort of thing it is, so a client can choose an icon for it. |
| `detail` | string | no | A short qualifier shown beside the label. |
| `documentation` | string | no | What the thing is, at length. |
| `sortText` | string | no | The value to order by, where it differs from the label. |

_Additional properties are not permitted._

### `MarkupContent`

Text to show, and how it is marked up.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `kind` | string | yes | How the text is marked up. |
| `value` | string | yes | The text. |

_Additional properties are not permitted._

### `EntityKindDescriptor`

One kind an author writes a document of, pairing the token a request names with the kind the document itself declares.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `kind` | string | yes | The lowercase-hyphenated token a request names. |
| `documentKind` | string | yes | The kind the document's own header declares. |

_Additional properties are not permitted._

### `RegistryTrust`

The trust policy resolution applies to what a registry serves.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `signaturesRequired` | boolean | yes | Whether an artifact from this registry must carry a verified signature. |
| `verificationSkipped` | boolean | no | Whether verification is being skipped. |
| `advisory` | boolean | no | Whether a failed verification is reported rather than halting. |
| `anchor` | string | no | The trust anchor signatures are verified against. |
| `keylessIdentities` | integer | no | How many signing identities are trusted for this registry. |

_Additional properties are not permitted._

### `Registry`

One configured registry. No field here carries credential material, its length, its shape, or any rendering of it — presence is the whole of what is reported, which is what makes the value safe to paste into an issue.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `host` | string | yes | The registry host, which is its identity. |
| `name` | string | no | The friendly alias that resolves to the host, where one is configured. |
| `default` | boolean | yes | Whether this is the registry an operation with no registry named addresses. |
| `authState` | string | yes | Whether a credential for this host is present in the machine-wide store. It is reported even when empty, so a caller can tell 'no credential is present' from 'the listing did not look'. |
| `trust` | RegistryTrust | yes | The trust policy resolution applies to what a registry serves. |

_Additional properties are not permitted._

### `TrustFetchOutcome`

What reading a registry's advertised trust policy did. The three outcomes are kept apart because they mean different things: the policy was taken, the registry advertised nothing — which is not a failure — or no read was attempted.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `pinned` | boolean | yes | Whether the advertised policy was taken. |
| `notAdvertised` | boolean | no | Whether the registry advertised no policy, in which case the operation proceeds on what the request stated. |
| `skipped` | boolean | no | Whether no read was attempted, because a stated policy overrode it or the request asked for none. |
| `identities` | integer | no | How many signing identities the advertised policy carried. |
| `reason` | string | no | What the registry's endpoint did, where the policy was not taken. |

_Additional properties are not permitted._

### `SkippedRepo`

One repository the index walk passed over, and why.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `repo` | string | yes | The repository that was passed over. |
| `reason` | string | yes | Why it was passed over. |

_Additional properties are not permitted._

### `DeprecationNote`

One deprecation marker the index walk met, and what it did with it. A marker that was honoured and one that was present and declined are reported on the same footing, so recording many does not pass in silence while declining one announces itself.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `repo` | string | yes | The repository the marker is on. |
| `version` | string | yes | The version the marker covers. |
| `recorded` | boolean | yes | Whether the marker's own signature verified, and the index therefore carries it. |
| `severity` | string | no | How strongly the marker speaks. |
| `reason` | string | no | Why the version is deprecated. |

_Additional properties are not permitted._

### `HostUpdate`

What an index refresh did for one registry.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `host` | string | yes | The registry host that was refreshed. |
| `indexed` | integer | yes | How many records were written. |
| `deprecationsExamined` | boolean | yes | Whether the walk looked for deprecation markers at all. It is separate from the count because 'this registry published none' and 'this run had no basis to judge one' are different facts. |
| `deprecationsRecorded` | integer | yes | How many markers were honoured. |
| `skipped` | array or null | yes | The repositories the walk passed over. |
| `deprecations` | array or null | yes | The markers the walk met. |
| `error` | string | no | What failed for this host, so a walk over several reports which of them failed without the caller correlating anything. |

_Additional properties are not permitted._

### `RegistrySearchRecord`

One record a search matched, as the local index holds it, plus which of its versions a published marker has deprecated.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `uri` | string | yes | The reference the record resolves from. |
| `name` | string | yes | The entity name. |
| `version` | string | yes | The version the record is keyed at. |
| `versions` | string[] | no | Every version the index holds for this reference. |
| `kind` | string | no | The entity kind. |
| `description` | string | no | What the entity is for. |
| `category` | string | no | The category the entity is published under. |
| `labels` | map of string | no | The labels the entity declares. |
| `pluginType` | string | no | The socket a plugin record attaches to. |
| `capabilities` | string[] | no | The capabilities a plugin record declares. |
| `manifestDigest` | string | no | The digest of the published manifest. |
| `listingDigest` | string | no | The digest of the listing the record was read from. |
| `deprecations` | object[] | no | The deprecation markers the index carries for this reference, each with the version it covers and the verified marker itself. |
| `retracted` | string[] | no | The versions a published marker has deprecated. |

_Additional properties are not permitted._

### `RegistrySearchIndex`

One searched host's freshness.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `host` | string | yes | The host whose index was searched. |
| `lastUpdated` | string | no | When the index was last refreshed. It is absent rather than zero when the snapshot carries no time, so a caller can tell 'not recorded' from the epoch. |

_Additional properties are not permitted._

### `EffectiveConfigurationSetting`

One resolved setting, and which document it came from.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `field` | string | yes | The setting. |
| `value` | string | yes | The value that was resolved. |
| `source` | string | yes | Where the value came from. |

_Additional properties are not permitted._

### `ImportedFile`

One draft document a conversion produced.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `path` | string | yes | Where the draft belongs, as a path relative to the workspace root. |
| `content` | string | yes | The draft's text. |

_Additional properties are not permitted._

### `ImportDiagnostic`

One thing a conversion could not convert. These are the conversion's most useful output, so they are reported in full rather than reduced to a verdict.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `severity` | string | yes | How serious it is. |
| `message` | string | yes | What could not be converted. |
| `code` | string | no | The condition's quotable name, where it has one. |

_Additional properties are not permitted._

### `LintFileFindings`

What a convention check found in one document.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `file` | string | yes | The document. |
| `diagnostics` | array or null | yes | The findings in it. |

_Additional properties are not permitted._

### `PluginRetractionExclusion`

One version that was available and not chosen.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `version` | string | yes | The version that was passed over. |
| `reason` | string | no | Why it was passed over. |

_Additional properties are not permitted._

### `PluginRetractionProvenance`

Where the knowledge of what is deprecated came from.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `source` | string | yes | What was consulted. |
| `lastUpdated` | string | no | When that was last refreshed. |

_Additional properties are not permitted._

### `PluginRetraction`

How a deprecation marker shaped which plugin version was pinned.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `reference` | string | yes | The reference the versions belong to. |
| `selected` | string | no | The version that was pinned. |
| `excluded` | PluginRetractionExclusion[] | no | The versions that were available and passed over. |
| `unscreened` | string | no | What could not be screened against a marker, and why. |
| `provenance` | PluginRetractionProvenance | no | Where the knowledge of what is deprecated came from. |

_Additional properties are not permitted._

### `PluginGeneratedDocument`

One catalog document a generation produced.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `path` | string | yes | Where the document belongs, as a path relative to the workspace root. |
| `content` | string | yes | The document's text. |

_Additional properties are not permitted._

### `PluginCommandFlag`

One flag a plugin declares on a command it contributes.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | The flag's long name. |
| `shorthand` | string | no | The flag's single-character alias, where it has one. |
| `description` | string | no | The flag's one-line help text. |
| `type` | string | no | The flag's value type. |
| `default` | string | no | The value used when the flag is not passed. |

_Additional properties are not permitted._

### `PluginCLICommand`

One top-level command verb a plugin contributes.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | The command verb. |
| `description` | string | no | The command's one-line help text. |
| `flags` | PluginCommandFlag[] | no | The command's flags, in declared order. |

_Additional properties are not permitted._

### `ConfigCapturedAttachment`

One attachment a freeze wrote into this workspace's own configuration.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `uri` | string | no | The reference the attachment resolves from. |
| `capability` | string | no | The capability the attachment is for. |
| `function` | string | no | The export the attachment is dispatched to. |
| `role` | string | no | The role the attachment runs in, which fixes what it may emit. |

_Additional properties are not permitted._

### `ConfigCapturedSocket`

One socket a freeze wrote, with the attachments it froze onto it.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `socket` | string | yes | The socket. |
| `field` | string | yes | The configuration field the socket is written under. |
| `attachments` | array or null | yes | The attachments that were frozen onto it. |

_Additional properties are not permitted._

### `ExplainErrorEntry`

One published passage teaching the authoring fix for a condition.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `heading` | string | yes | The passage's heading. |
| `body` | string | yes | The passage. |

_Additional properties are not permitted._

### `SignedArtifact`

One published artifact a signing covered.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `reference` | string | yes | The reference that was signed. |
| `digest` | string | yes | The digest of what was signed. |

_Additional properties are not permitted._

### `DeprecationMarked`

One published version a deprecation marked.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `reference` | string | yes | The reference that was marked. |
| `severity` | string | yes | How strongly the marker speaks. |
| `issuedOn` | string | yes | When the marker was issued. |
| `digest` | string | yes | The digest of the marker that was published. |

_Additional properties are not permitted._

### `InitializeResult`

What the session settled on for this client, and which configuration layer it resolved from.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `capabilities` | ServerCapabilities | yes | What the daemon will do in this session, settled against what the client said it can handle. |
| `workspaceRoot` | string | yes | The workspace the session opened over. |
| `configSource` | string | yes | Which configuration layer the session resolved its settings from. |
| `workspaceMarker` | string | no | The file that identified the workspace root, where one did. |

_Additional properties are not permitted._

### `ValidateResult`

What checking found, and how much was checked.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `diagnostics` | array or null | yes | The findings. It is null rather than an empty list when the check found nothing. |
| `checked` | string | no | How much was checked — one document, or what the workspace holds. |

_Additional properties are not permitted._

### `InvalidateResult`

Whether the daemon was holding anything about the document to drop.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `invalidated` | boolean | yes | Whether anything was dropped. |

_Additional properties are not permitted._

### `DiagnosticsResult`

The findings the daemon already holds for the document.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `diagnostics` | array or null | yes | The findings. It is null rather than an empty list when there are none. |

_Additional properties are not permitted._

### `IrGraphResult`

The resolved graph a Release compiles to.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `graph` | any | yes | The graph document, carried through as the compiler emitted it. Its own shape is the graph's published contract and is not restated here. |

_Additional properties are not permitted._

### `BuildResult`

What a build wrote.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `outputDirectory` | string | yes | The directory the artifacts were written into. |
| `files` | array or null | yes | The artifacts that were written, as paths relative to the output directory. |
| `notices` | BuildNotice[] | no | Anything the build wants the caller to know that is neither a finding nor a failure. |
| `dependencyResolution` | DependencyResolutionReport | no | What a dependency resolution pinned and acquired. |

_Additional properties are not permitted._

### `BuildPreviewResult`

What a build would have written. Nothing was written, so there is no output directory to name.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `files` | array or null | yes | The artifacts writing would have produced. |
| `notices` | BuildNotice[] | no | Anything the compile wants the caller to know that is neither a finding nor a failure. |

_Additional properties are not permitted._

### `EntityDefinitionResult`

What an entity name resolves to, and the document defining it.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `kind` | string | yes | The entity kind. |
| `name` | string | yes | The entity name. |
| `version` | string | yes | The version that was resolved. |
| `description` | string | no | What the document says the entity is for. |
| `publishScope` | string | no | How widely the entity is published. |
| `file` | string | yes | The document defining it. |
| `authoredLength` | integer | yes | How many bytes the authored document holds, so a client can tell an authored document from a resolved rendering of one. |
| `definition` | string | yes | The definition's text. |

_Additional properties are not permitted._

### `ReleaseClosureResult`

Everything a Release depends on, as resolution reached it. It reports the closure rather than the graph derived from it: a different document about the same Release.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `release` | string | yes | The Release that was inspected. |
| `aggregate` | string | yes | The Aggregate it deploys. |
| `manifest` | string | yes | The Manifest it resolves through. |
| `environment` | string | yes | The environment it names. |
| `entities` | array or null | yes | The entities the closure reaches. |
| `libraries` | array or null | yes | The libraries the closure reaches. |
| `plugins` | array or null | yes | The plugins the closure reaches. |
| `mappingDiagnostics` | array or null | yes | What resolving the Manifest's mappings had to say. |
| `deprecations` | array or null | yes | The deprecation markers the closure met. |

_Additional properties are not permitted._

### `ResolveDependenciesResult`

What a dependency resolution pinned and acquired, plus anything it wants the caller to know. The report's own fields are carried directly on this answer rather than nested under a member of it.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `lockfile` | string | yes | The lockfile that was written. |
| `verified` | boolean | no | Whether each acquired artifact was checked against the digest the lockfile pins. |
| `entities` | array or null | yes | The entities that were pinned. |
| `libraries` | array or null | yes | The libraries that were pinned. |
| `plugins` | array or null | yes | The plugins that were pinned. |
| `sourceArtifacts` | integer | yes | How many source artifacts were acquired. |
| `trustedPlugins` | integer | yes | How many of the pinned plugins carried a verified signature. |
| `toolchain` | ToolchainReport | no | The compiler that resolved, and the plugins it carries. |
| `externalInputs` | integer | yes | How many external inputs the render consumes were acquired. |
| `incompleteExternalInputs` | string | no | Which external inputs could not be acquired, where some could not be. |
| `notices` | string[] | no | Anything the resolution wants the caller to know. |

_Additional properties are not permitted._

### `CacheStatusResult`

What the caches serving this workspace hold.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `classes` | array or null | yes | Each cache and what it holds. |
| `provenance` | array or null | yes | Which identities the cached artifacts were acquired under. |
| `totalCount` | integer | yes | How many entries the caches hold in total. |
| `totalSize` | integer | yes | How many bytes they occupy in total. |
| `totalSizeText` | string | yes | The same total written the way a person reads one. |
| `scope` | CacheScope | yes | How far a cache answer reaches. Two of the cache classes are shared by every project on the machine, so every cache answer names which ones it touched — a session opened over one workspace would otherwise be read as reporting only about that workspace. |

_Additional properties are not permitted._

### `CachePruneResult`

What a reclamation removed, what it kept, and what it could not reclaim.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `removed` | array or null | yes | What was removed. |
| `retainedCount` | integer | yes | How many entries were kept. |
| `reclaimedBytes` | integer | yes | How many bytes were reclaimed. |
| `reclaimedBytesText` | string | yes | The same figure written the way a person reads one. |
| `unattributedCount` | integer | yes | How many entries no holder claims. |
| `unattributedSize` | integer | yes | How many bytes those occupy. |
| `unattributedSizeText` | string | yes | The same figure written the way a person reads one. |
| `notPruneEligible` | array or null | yes | What was left behind, and what would reclaim it. |
| `scope` | CacheScope | yes | How far a cache answer reaches. Two of the cache classes are shared by every project on the machine, so every cache answer names which ones it touched — a session opened over one workspace would otherwise be read as reporting only about that workspace. |

_Additional properties are not permitted._

### `CacheEvictResult`

What reclaiming down to a size removed, and what remains.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `withinCapBefore` | boolean | yes | Whether what was held already fitted under the size, so nothing needed removing. |
| `removed` | array or null | yes | What was removed. |
| `totalBefore` | integer | yes | How many bytes were held before. |
| `totalBeforeText` | string | yes | The same figure written the way a person reads one. |
| `reclaimedBytes` | integer | yes | How many bytes were reclaimed. |
| `reclaimedBytesText` | string | yes | The same figure written the way a person reads one. |
| `remainingBytes` | integer | yes | How many bytes remain. |
| `remainingBytesText` | string | yes | The same figure written the way a person reads one. |
| `capBytes` | integer | yes | The size that was reclaimed down to, in bytes. |
| `capBytesText` | string | yes | The same size written the way a person reads one. |
| `scope` | CacheScope | yes | How far a cache answer reaches. Two of the cache classes are shared by every project on the machine, so every cache answer names which ones it touched — a session opened over one workspace would otherwise be read as reporting only about that workspace. |

_Additional properties are not permitted._

### `CacheClearResult`

What emptying the caches reclaimed.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `cleared` | array or null | yes | Each cache that was emptied. |
| `reclaimedBytes` | integer | yes | How many bytes were reclaimed. |
| `reclaimedBytesText` | string | yes | The same figure written the way a person reads one. |
| `scope` | CacheScope | yes | How far a cache answer reaches. Two of the cache classes are shared by every project on the machine, so every cache answer names which ones it touched — a session opened over one workspace would otherwise be read as reporting only about that workspace. |

_Additional properties are not permitted._

### `RegistryListResult`

The registries this workspace resolves through.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `registries` | array or null | yes | Each configured registry. |
| `credentialStateIsMachineWide` | boolean | yes | Whether the credential presence reported for each registry is a machine-wide fact rather than a workspace one. It is reported so a session-scoped answer is not read as denying the wider reach. |

_Additional properties are not permitted._

### `SearchResult`

What the local registry indexes offered for the search.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `records` | array or null | yes | The records that matched. |
| `indexes` | array or null | yes | Each searched host and when its index was last refreshed. |
| `missingIndexHosts` | array or null | yes | The configured hosts with no local index to search, so a short answer is explained rather than left to be inferred. |
| `stale` | boolean | yes | Whether any searched index is old enough to be worth refreshing. |
| `registriesConfigured` | boolean | yes | Whether any registry is configured at all, which distinguishes 'nothing matched' from 'nothing was searched'. |

_Additional properties are not permitted._

### `RegistryAddResult`

What registering a registry wrote, where, and what it read from the registry itself.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `host` | string | yes | The host the entry is keyed under, which is not always the spelling the request used. |
| `scope` | ConfigWriteScope | yes | Which configuration document was written and how far it reaches. A request names one workspace, so an answer that said nothing would be read as being about that workspace — and for a machine-wide write that reading is wrong. |
| `trust` | TrustFetchOutcome | yes | What reading a registry's advertised trust policy did. The three outcomes are kept apart because they mean different things: the policy was taken, the registry advertised nothing — which is not a failure — or no read was attempted. |

_Additional properties are not permitted._

### `RegistryRemoveResult`

What removing a registry wrote, and where.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `host` | string | yes | The host whose entry was removed. |
| `scope` | ConfigWriteScope | yes | Which configuration document was written and how far it reaches. A request names one workspace, so an answer that said nothing would be read as being about that workspace — and for a machine-wide write that reading is wrong. |

_Additional properties are not permitted._

### `RegistryUpdateResult`

What refreshing the local indexes did, per host.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `hosts` | array or null | yes | What the refresh did for each host. |
| `failed` | array or null | yes | The hosts the refresh could not complete. |
| `indexRoot` | string | yes | The directory the indexes were written under. |
| `registriesConfigured` | boolean | yes | Whether any registry is configured at all. |
| `reachedRegistries` | boolean | yes | Whether any registry was actually contacted, which distinguishes 'nothing changed' from 'nothing was tried'. |

_Additional properties are not permitted._

### `LogoutResult`

Which stored credential was removed, and how far the store reaches.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `registry` | string | yes | The registry whose credential was removed. |
| `scope` | CredentialStoreScope | yes | How far a credential change reaches. The store is shared by every project on the machine and by every other tool addressing the same registries, so the answer reports that rather than leaving a session-scoped reading to be inferred. |

_Additional properties are not permitted._

### `PublishEntityResult`

What publishing an entity landed, and where.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `reference` | string | yes | The reference the entity was published under. |
| `tag` | string | yes | The tag it was published under. |
| `kind` | string | yes | The entity kind that was published. |
| `mediaType` | string | yes | The media type recorded for the published bytes. |
| `size` | integer | yes | How many bytes were published. |
| `sizeText` | string | yes | The same size written the way a person reads one. |
| `pluginSize` | integer | no | How many bytes the plugin module published alongside a Plugin entity occupies. |
| `pluginSizeText` | string | no | The same size written the way a person reads one. |
| `digest` | string | yes | The digest of what was published. |
| `signed` | boolean | yes | Whether what was published carries a signature. |
| `alreadyPublished` | boolean | yes | Whether the same bytes were already there, so nothing new was landed. |
| `dryRun` | boolean | yes | Whether this reports what publishing would have landed rather than what it did. |
| `reach` | PublicationReach | yes | How far a publication reached. These answers reach beyond this machine entirely — what they land is what every consumer of that registry resolves — so each names the host it addressed and whether the call landed anything. |

_Additional properties are not permitted._

### `PublishArtifactResult`

What publishing a file landed, and where.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `reference` | string | yes | The reference the file was published under. |
| `tag` | string | yes | The tag it was published under. |
| `mediaType` | string | yes | The media type recorded for the published bytes. |
| `size` | integer | yes | How many bytes were published. |
| `sizeText` | string | yes | The same size written the way a person reads one. |
| `digest` | string | yes | The digest of what was published. |
| `alreadyPublished` | boolean | yes | Whether the same bytes were already there, so nothing new was landed. |
| `dryRun` | boolean | yes | Whether this reports what publishing would have landed rather than what it did. |
| `reach` | PublicationReach | yes | How far a publication reached. These answers reach beyond this machine entirely — what they land is what every consumer of that registry resolves — so each names the host it addressed and whether the call landed anything. |

_Additional properties are not permitted._

### `SignArtifactsResult`

What was signed, and where the signatures landed.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `signed` | array or null | yes | Each reference that was signed. |
| `reach` | PublicationReach | yes | How far a publication reached. These answers reach beyond this machine entirely — what they land is what every consumer of that registry resolves — so each names the host it addressed and whether the call landed anything. |

_Additional properties are not permitted._

### `DeprecateArtifactResult`

What was marked deprecated, and where the markers landed.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `marked` | array or null | yes | Each version that was marked. |
| `reach` | PublicationReach | yes | How far a publication reached. These answers reach beyond this machine entirely — what they land is what every consumer of that registry resolves — so each names the host it addressed and whether the call landed anything. |

_Additional properties are not permitted._

### `ResolveResult`

Where the thing under the cursor is defined.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `location` | null or Location | yes | Where it is defined. It is null where nothing under the cursor resolves to a definition. |

_Additional properties are not permitted._

### `FindReferencesResult`

Where the thing under the cursor is referred to.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `locations` | array or null | yes | Each place it is referred to. |

_Additional properties are not permitted._

### `FindImplementationsResult`

Which documents implement the thing under the cursor.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `locations` | array or null | yes | Each place it is implemented. |

_Additional properties are not permitted._

### `HoverResult`

What to show about the thing under the cursor.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `contents` | null or MarkupContent | yes | What to show. It is null where there is nothing to say about what is under the cursor. |

_Additional properties are not permitted._

### `CompletionResult`

What may be written at the cursor.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `items` | array or null | yes | Each thing that may be written. |

_Additional properties are not permitted._

### `CatalogIndexResult`

Every entity the workspace index holds.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `entities` | array or null | yes | Each entity. |

_Additional properties are not permitted._

### `AttachCandidatesResult`

Which Features may be attached to the entity, and the labels they were judged against.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `node` | string | yes | The entity the candidates were judged for. |
| `nodeLabels` | object or null | yes | The labels the judgement was made against. |
| `labelSource` | string | yes | Which label set was used, which is not cosmetic: a document's declared labels are what a reading of the source can see, while a graph node's are the finalised set the build itself judges against. An answer computed over the second is a statement about what the build will do. |
| `candidates` | array or null | yes | Each Feature that may be attached. |

_Additional properties are not permitted._

### `ConnectionCandidatesResult`

Which entities each socket on the entity may be wired to.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `node` | string | yes | The entity whose sockets these are. |
| `adHocSocketsAccepted` | boolean | yes | Whether a socket the entity's own definition does not pre-declare may still be authored. |
| `sockets` | array or null | yes | Each socket and what may be wired into it. |

_Additional properties are not permitted._

### `InsertionPointResult`

Where in the document a new entry under the named container belongs, and what a client needs in order to write it there: the point itself, whether a line break has to open the text, the container keys that are still missing, and the indentation each line takes.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `file` | string | yes | The document. |
| `container` | array or null | yes | The path through the document to the container. |
| `positionEncoding` | string | yes | The encoding the positions in this answer are expressed in. |
| `position` | Position | yes | A place in a document: a line and a character offset within it, both counted from zero. The offset is measured in the units of the encoding the session settled on when it was opened, which is UTF-16 unless the client asked for another. |
| `precededByLineBreak` | boolean | yes | Whether the text written at the position has to begin with a line break, because the position sits at the end of a line the document already carries. It is false only where the document carries nothing for the entry to follow. |
| `missingContainerKeys` | array or null | yes | The container path's segments the document does not carry yet, outermost first. Each has to be written as a key of its own, indented one step further than the one before it, before the entry can go inside the innermost one. It is null where the whole path is already there. |
| `entryIndent` | integer | yes | The column the entry's own first line starts at, counted in spaces from the start of the line. |
| `indentStep` | integer | yes | How much further each nesting level is indented. |
| `indentStepMeasured` | boolean | yes | Whether the step was measured from this document's own nesting. Where it is false the document exhibits no nesting to measure and the step is a fallback, so a client that would rather impose its own knows it is free to. |
| `entryShape` | const "mapping" or const "sequence" or const "unknown" | yes | The shape the container carries its entries in, which is what decides how the entry's own text is composed. It is read off the container the document already carries and is never inferred from what the container is called. The set is closed. |

_Additional properties are not permitted._

### `AttachmentContainerResult`

Which document, and where in it, an attachment on the graph node belongs.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `node` | string | yes | The graph node the attachment is for. |
| `file` | string | yes | The document the attachment belongs in. |
| `container` | array or null | yes | The path through that document to where it belongs. |

_Additional properties are not permitted._

### `ReleaseCandidatesResult`

The Releases the workspace holds.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `releases` | array or null | yes | Each Release document. |

_Additional properties are not permitted._

### `ActiveReleaseResult`

Which Release a client should act on by default. A workspace pointing at no Release is an ordinary state rather than a failure, so it is reported here with an account of how the choice was attempted rather than raised as an error.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `release` | string | yes | The Release that was settled on, or empty where none was. |
| `reason` | string | no | Why no Release was settled on. |
| `trace` | string | no | Each step of the choice and what it found, so a caller can see which one would have settled it. |

_Additional properties are not permitted._

### `EditDocumentResult`

What the edit wrote, and where. After a write the daemon's reading of the document is dropped, so the next answer about it is computed from the bytes the edit produced.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `file` | string | yes | The document that was edited. |
| `edit` | string | yes | Which edit was applied. |
| `container` | array or null | yes | The path through the document to where the edit landed. |
| `createdContainers` | array or null | yes | The containers the edit had to create on the way. |
| `written` | array or null | yes | The documents that were written. |
| `content` | string | yes | The composed document, for a request that asked to be shown the result rather than have it written. |

_Additional properties are not permitted._

### `EffectiveConfigurationResult`

The configuration the workspace resolved, and which document each setting came from.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `layers` | array or null | yes | The configuration documents that were merged, in the order they were merged. |
| `settings` | array or null | yes | Each resolved setting and where it came from. |

_Additional properties are not permitted._

### `ConfigInitResult`

What seeding a configuration wrote, where, and what it read from the registry.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `host` | string | yes | The registry the configuration was seeded for. |
| `scope` | ConfigWriteScope | yes | Which configuration document was written and how far it reaches. A request names one workspace, so an answer that said nothing would be read as being about that workspace — and for a machine-wide write that reading is wrong. |
| `trust` | TrustFetchOutcome | yes | What reading a registry's advertised trust policy did. The three outcomes are kept apart because they mean different things: the policy was taken, the registry advertised nothing — which is not a failure — or no read was attempted. |
| `written` | boolean | yes | Whether the document was written, as against handed back for the caller to place. |
| `content` | string | no | The document's text, for a request that asked to be shown it rather than have it written. |

_Additional properties are not permitted._

### `ConfigCaptureResult`

What freezing the resolved configuration wrote into this workspace's own document.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `configFile` | string | yes | The document that was written. It is always this workspace's own, since the whole purpose is to make one workspace self-contained. |
| `workspaceRoot` | string | yes | The workspace the request named. |
| `captured` | boolean | yes | Whether anything was frozen. |
| `sockets` | array or null | yes | Each socket that was frozen, with its attachments. |
| `catalogDirs` | array or null | yes | The catalog directories that were frozen. |

_Additional properties are not permitted._

### `ImportResult`

What converting a foreign source produced, and what it could not convert.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `format` | string | yes | The source format that was converted. |
| `outputDir` | string | yes | The directory the drafts were written into. |
| `written` | array or null | yes | The drafts that were written. |
| `files` | array or null | yes | The drafts and their text, for a request that asked to be shown them rather than have them written. |
| `diagnostics` | array or null | yes | What could not be converted. |
| `halted` | boolean | yes | Whether the conversion stopped rather than finishing with findings. |

_Additional properties are not permitted._

### `ScaffoldEntityResult`

The drafted starter document.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `kind` | string | yes | The entity kind that was drafted. |
| `skeleton` | string | yes | The drafted document's text. |

_Additional properties are not permitted._

### `LintResult`

What the convention check found, counted by severity and listed per document.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `entity` | string | no | The one entity that was checked, where the request named one. |
| `release` | string | no | The Release whose closure was checked, where the request named one. |
| `checked` | integer | yes | How many documents were checked. |
| `findings` | integer | yes | How many findings there are in total. |
| `errors` | integer | yes | How many of them are errors. |
| `warnings` | integer | yes | How many of them are warnings. |
| `infos` | integer | yes | How many of them are informational. |
| `files` | array or null | yes | The findings, per document. |
| `halted` | boolean | yes | Whether the check stopped rather than finishing with findings. |

_Additional properties are not permitted._

### `PluginAddResult`

What attaching a plugin wrote, where, and which version it pinned.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `type` | string | yes | The socket the plugin was attached to. |
| `identity` | string | no | The identity the attachment resolved to. |
| `uri` | string | no | The reference the attachment resolves from. |
| `capability` | string | no | The capability the attachment is for. |
| `reference` | string | no | The pinned reference, version included. |
| `scope` | PluginWriteScope | yes | Which configuration document a plugin change was written into and how far it reaches. The command-extension socket's own default is the machine-wide document, so every answer says which one it wrote. |
| `written` | boolean | yes | Whether the configuration document was written, as against handed back for the caller to place. |
| `content` | string | no | The configuration document's text, for a request that asked to be shown it rather than have it written. |
| `retraction` | PluginRetraction | no | How a deprecation marker shaped which plugin version was pinned. |

_Additional properties are not permitted._

### `PluginRemoveResult`

What detaching a plugin wrote, and where.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `type` | string | yes | The socket the plugin was attached to. |
| `query` | string | yes | Which attachment was removed. |
| `scope` | PluginWriteScope | yes | Which configuration document a plugin change was written into and how far it reaches. The command-extension socket's own default is the machine-wide document, so every answer says which one it wrote. |

_Additional properties are not permitted._

### `PluginSyncResult`

What aligning a Plugin entity's machine-owned records with its module changed.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `entity` | string | yes | The Plugin entity document that was aligned. |
| `hostFunctions` | array or null | yes | The host functions the module declares it needs. |
| `commands` | array or null | yes | The commands the module contributes. |
| `changed` | boolean | yes | Whether anything in the document actually moved. |

_Additional properties are not permitted._

### `PluginGenCatalogResult`

The catalog documents a generation produced.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `documents` | PluginGeneratedDocument[] | no | Each generated document and its text. |
| `notices` | string | no | Anything the generation wants the caller to know. |
| `dryRun` | boolean | yes | Whether the documents were handed back rather than written. |

_Additional properties are not permitted._

### `ExplainErrorResult`

What the compiler declares about a condition, and the published passages teaching the authoring fix.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `shortCode` | string | yes | The condition's short code. |
| `code` | string | yes | The condition's descriptive name. |
| `message` | string | yes | What the condition says when it is raised. |
| `entries` | ExplainErrorEntry[] | no | The published passages teaching the fix. |
| `reference` | string | yes | The published address at which the condition is explained. |
| `note` | string | no | Why the published passages are missing, where they could not be acquired. What the binary itself declares is still answered. |

_Additional properties are not permitted._

### `GetSchemaResult`

A kind's schema, or — where the request named none — which kinds can be named. The two widths ride on one answer rather than on two methods, because 'what may I name' and 'which of those does an author write documents of' are the same question at two widths, and two answers would have to be kept in agreement.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `kind` | string | no | The kind the schema is for. |
| `schema` | any | no | The schema itself, carried through as the binary holds it. |
| `kinds` | string[] | no | Every token this binary answers to. |
| `entityKinds` | EntityKindDescriptor[] | no | The narrower set an author writes a document of, each pairing the token a request names with the kind the document's own header declares. |

_Additional properties are not permitted._
