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
| `result` | InitializeResult or ValidateResult or InvalidateResult or DiagnosticsResult or IrGraphResult or BuildResult or BuildPreviewResult or EntityDefinitionResult or ReleaseClosureResult or ResolveDependenciesResult or PinResult or CacheStatusResult or CachePruneResult or CacheEvictResult or CacheClearResult or RegistryListResult or SearchResult or RegistryAddResult or RegistryRemoveResult or RegistryUpdateResult or LogoutResult or PublishEntityResult or PublishArtifactResult or SignArtifactsResult or DeprecateArtifactResult or ResolveResult or FindReferencesResult or FindImplementationsResult or HoverResult or CompletionResult or CatalogIndexResult or AttachCandidatesResult or ConnectionCandidatesResult or InsertionPointResult or AttachmentContainerResult or ConnectionAtPositionResult or ReleaseCandidatesResult or ActiveReleaseResult or EditDocumentResult or EffectiveConfigurationResult or ConfigInitResult or ConfigCaptureResult or ImportResult or ScaffoldEntityResult or LintResult or PluginAddResult or PluginRemoveResult or PluginSyncResult or PluginGenCatalogResult or ExplainErrorResult or GetSchemaResult | yes | The answer, in the shape the method that was asked returns. |

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
| `unreachable` | boolean | no | Whether the refusal is a registry the request named that could not be reached: its name did not resolve, a connection to it was refused or could not be opened, or a secure connection to it could not be established. It is read from the failure itself rather than from the message, and it is set only where the failure shows the registry was never reached. A refused index refresh naming one registry carries it; a registry that answered, whatever it answered, leaves it absent. |
| `code` | string | no | The descriptive name of the condition the refusal names, stable across releases: the same value a diagnostic reporting that condition carries in its own code. It is what a client branches on, rather than on the message or on the numeric code beside it, which names the state of the request and stays what it is for every condition. Present exactly when the refusal names a registered condition, and absent when it names none. |
| `shortCode` | string | no | The condition's short code, the letter E and four digits: the form a reader quotes and looks up, and the one that opens the message of a refusal naming a condition. Present exactly when code is. |

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
| `unredacted` | boolean | no | Whether to answer with the values an author declared sensitive in the clear. Absent or false, each of them is withheld from the graph and a marker naming why stands in its place, as the command line's graph output withholds them; true answers with the graph as the Release compiles to it, those values included. |

_Additional properties are not permitted._

### `BuildParams`

Compiles a Release and writes the rendered artifacts into the workspace.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `release` | string | no | The Release to build, as a path relative to the workspace root. An absolute path is refused. |
| `outputParent` | string | no | The directory the output directory is created inside, as a path relative to the workspace root. The artifacts land in the output directory beneath it, laid out as they are beneath the workspace root when nothing is named — so this names the output directory's parent and never the output directory itself. Absent, or empty, writes the output directory beneath the workspace root, as `aggrega build` does wherever it is run from. An absolute path, or one that climbs out of the workspace, is refused. |
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
| `name` | string | no | The entity to resolve, by name — or a registry reference, `oci://<host>/<repository>:<tag>` or `@<digest>` in place of `:<tag>`, to read the entity published at that coordinate. |
| `release` | string | no | The Release to resolve the name in the terms of, as a path relative to the workspace root. The name is then resolved through the catalog directories the workspace configuration gives that Release, so a name several variants in one workspace declare, one per Release, resolves to the variant that Release builds with, and a name it does not resolve is refused with an account naming that Release's entry under `workspace.releases`. Absent, the name is resolved over the workspace's own catalog directories. A registry reference takes no Release and is refused with one, as is a value that names no Release file. |

_Additional properties are not permitted._

### `CatalogIndexParams`

Answers with the entities the workspace holds: every entity its documents declare, and the Features its catalog directories declare.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `release` | string | no | The Release to list the entities in the terms of, as a path relative to the workspace root. The Features are then the ones the catalog directories the workspace configuration gives that Release declare, and a document under a catalog directory only other Releases read is left out, so a workspace keeping variants of one entity side by side, one per Release, is listed with the variant that Release builds with. Absent, the listing is the workspace's own. A value that names no Release file is refused. |

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
| `verify` | boolean | no | Whether to compare the recorded lockfile against the resolution this request would perform without it, honouring the pins that request would honour, instead of writing it. A verify writes no lockfile, plugin trust record or `entity.lock`; the content cache is read and filled as that resolution would read and fill it. Drift, and a missing lockfile, fail the request. It cannot be combined with `upgrade`, `targets` or `pinSources`, whichever value `pinSources` carries: a request sending one of them beside it is refused as invalid params before anything is resolved. |
| `pinSources` | boolean | no | Whether to run the pin step `aggrega/pin` runs over the Recipes and FeatureRecipes the Release builds from the workspace's catalog directories, writing the `entity.lock` beside each, rather than refusing the request over one whose lock does not record a pin an input needs. Absent follows the workspace's `pin_sources_at_pull`; either value overrides that setting for this request. |

_Additional properties are not permitted._

### `PinParams`

Records, in the `entity.lock` beside a Recipe or FeatureRecipe, the content pin for every input the entity reads from outside its own document. No Release is named: an input whose identity the entity writes out in full names one artifact for every Release that uses the entity, so nothing a Release supplies is needed to pin it. It reaches the hosts the entity's sources name and it writes beside the entity; the entity document itself is never written.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `entity` | string | no | The entity document to pin, as a path relative to the workspace root. |
| `dryRun` | boolean | no | Whether to answer with the lock the step would write rather than writing it. The inputs are still resolved, so the content cache still fills. |

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
| `pinSources` | boolean | no | Whether to run the pin step `aggrega/pin` runs on the entity before it is bundled, so the `entity.lock` the step writes beside it is part of what is published. The step runs ahead of every refusal that judges the entity, and under `dryRun` it reports the lock it would write and writes nothing. Absent follows the workspace's `pin_sources_at_push`; either value overrides that setting for this request. |

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
| `release` | string | no | The Release to answer in the terms of, as a path relative to the workspace root. The definition is then the document the reference resolves to through the catalog directories the workspace configuration gives that Release, in that order, so a name several variants in one workspace declare, one per Release, goes to that Release's variant; where those directories declare no such entity, the workspace's documents are searched, leaving out any under one of the workspace's catalog directories the Release does not read. Absent, the workspace's documents are searched first and the workspace's own catalog directories only where no document declares the name. A value that names no Release file is refused. |

_Additional properties are not permitted._

### `FindReferencesParams`

Answers where the thing under the cursor is referred to.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `uri` | string | no | The document the cursor is in. |
| `position` | Position | no | A place in a document: a line and a character offset within it, both counted from zero. The offset is measured in the units of the encoding the session settled on when it was opened, which is UTF-16 unless the client asked for another. |
| `release` | string | no | The Release to answer in the terms of, as a path relative to the workspace root. A reference made in a document under one of the workspace's catalog directories that the Release does not read is then not reported, so variants a workspace keeps side by side, one per Release, are never reported as one another's references. Absent, every workspace document is searched. A value that names no Release file is refused. |

_Additional properties are not permitted._

### `FindImplementationsParams`

Answers which documents implement the thing under the cursor.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `uri` | string | no | The document the cursor is in. |
| `position` | Position | no | A place in a document: a line and a character offset within it, both counted from zero. The offset is measured in the units of the encoding the session settled on when it was opened, which is UTF-16 unless the client asked for another. |
| `release` | string | no | The Release to answer in the terms of, as a path relative to the workspace root. A document under one of the workspace's catalog directories that the Release does not read is then not reported, so a variant another Release builds with is never listed among this Release's. Absent, every workspace document is searched. A value that names no Release file is refused. |

_Additional properties are not permitted._

### `HoverParams`

Answers with what to show about the thing under the cursor.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `uri` | string | no | The document the cursor is in. |
| `position` | Position | no | A place in a document: a line and a character offset within it, both counted from zero. The offset is measured in the units of the encoding the session settled on when it was opened, which is UTF-16 unless the client asked for another. |
| `release` | string | no | The Release to answer in the terms of, as a path relative to the workspace root. The entity shown is then the one the reference resolves to through the catalog directories the workspace configuration gives that Release, in that order; where those directories declare no such entity, the workspace's documents are searched, leaving out any under one of the workspace's catalog directories the Release does not read. Absent, the workspace's documents are searched first and the workspace's own catalog directories only where no document declares the name. A value that names no Release file is refused. |

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
| `release` | string | no | The Release to answer in the terms of, as a path relative to the workspace root. The names offered are then those the workspace's documents declare, less the documents under one of the workspace's catalog directories that the Release does not read, together with the Components and Features the catalog directories the workspace configuration gives that Release declare. Absent, they are the workspace's documents and the Components and Features its own catalog directories declare. A value that names no Release file is refused. |

_Additional properties are not permitted._

### `CompletionContext`

What caused the request, where the client tracks it.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `triggerKind` | integer | no | Why completion was asked for. |
| `triggerCharacter` | string | no | The character that caused it, where a character did. |

_Additional properties are permitted._

### `AttachCandidatesParams`

Answers which Features may be attached to an entity, judged against that entity's labels, and, for one connection a graph node's component draws, which may fill each slot the connection's socket declares.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `node` | string | no | The entity to judge candidates against, by name, read from what the workspace documents declare. |
| `graphNode` | string | no | The graph node to judge candidates against, whose labels are the finalised set the build itself evaluates applicability with. An answer computed over this says what the build will do. |
| `release` | string | no | The Release whose graph the node belongs to, as a path relative to the workspace root. The candidates are then drawn in that Release's terms: the Features the catalog directories the workspace configuration gives that Release declare, and the workspace's documents less any under one of the workspace's catalog directories the Release does not read, so a Feature kept for another Release is never offered for a node of this one's graph. |
| `labels` | map of string | no | Labels to judge against directly, in place of reading them from an entity or a graph node. |
| `connection` | ConnectionCoordinate | no | One connection drawn by the component of the node graphNode names, to answer for as well as for that node: the answer then also carries slots, each slot the connection's socket declares with the Features that may fill it, or noSlotReason where no slot may be filled. It is sent only with graphNode and release, because a connection exists only on a compiled graph; sent with node or labels it is refused. The candidates beside it keep their meaning, the Features that may attach to the node itself. Its document is accepted and does not change this answer: the slots are the socket's and the candidates the Features', the same whichever document an attachment is written in. |

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

Answers which document, and where in it, an attachment on a graph node, or on one connection its component draws, belongs.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `graphNode` | string | no | The graph node the attachment is for. |
| `release` | string | no | The Release whose graph the node belongs to, as a path relative to the workspace root. |
| `connection` | ConnectionCoordinate | no | One connection the graph node's component draws, when the attachment is for that connection rather than for the node: the answer then names the connection's own features container in the document its document field names, a field required here. In the Aggregate, that is the connection's entry in the document the node was authored in, refused for a connection the Release drew, which the Aggregate holds no entry for. In the Release, it is the per-edge entry under the Release's own entry for the node, whether or not the Release writes one for that connection yet, refused where the Release writes no entry for the node. A connection a Feature drew is refused in either document, because an attachment is written only on a connection a component or the Release draws. |

_Additional properties are not permitted._

### `ConnectionAtPositionParams`

Answers which connection's entry a position in an Aggregate or a Release falls inside: the graph node and the connection, in the terms the candidacy and container requests take them, or why no connection is written there. The entries are the ones an attachment is written in — the entry a component draws a connection with, under the connection's alias, in the document the component was authored in, and every per-edge entry the Release writes — each where the compiled graph records it, so whether a key is a connection is never read from what it is called.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `file` | string | no | The document the position is in: the Release, or a document the Release's graph records components as authored in — its Aggregate, or the document of a module that Aggregate imports. It is read from what the session holds for it first, and from disk otherwise. |
| `position` | Position | no | A place in a document: a line and a character offset within it, both counted from zero. The offset is measured in the units of the encoding the session settled on when it was opened, which is UTF-16 unless the client asked for another. |
| `release` | string | no | The Release whose compiled graph records the connections, as a path relative to the workspace root. It is required for a position in the Aggregate too, because a graph node and a connection exist only on a compiled graph. |

_Additional properties are not permitted._

### `ConnectionCoordinate`

One connection a graph node's component draws, addressed by the socket it is wired through and the alias it carries in that socket, and the document an attachment on it is written in. A connection carries attachments filling the slots its socket declares, and either the Aggregate or the Release may write them.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `socket` | string | yes | The dependency socket the connection is wired through. |
| `alias` | string | yes | The name the connection carries within its socket. |
| `document` | const "aggregate" or const "release" | no | The document an attachment on the connection is written in. The set is closed, and a value outside it is refused. |

_Additional properties are permitted._

### `SetActiveReleaseParams`

Records a Release as the workspace's default by writing a marker in the `.aggrega` directory: the choice `aggrega/activeRelease` reports reads that marker after the configuration's authoring Release. The marker is written inside the workspace and nowhere else: where the `.aggrega` directory or the marker is a link leading out of the workspace, whether or not the place it leads to exists yet, the write is refused naming the link and nothing is written. The answer is the one `aggrega/activeRelease` gives once the marker is written, so it names a different Release where the configuration's authoring Release outranks the marker.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workspaceRoot` | WorkspaceRootSubject | no | The absolute path of the workspace this request acts on. It is the request's subject: the daemon resolves it before the method runs, and a request that omits it or spells it as anything other than a string is refused. |
| `workDoneToken` | ProgressToken | no | A value the caller mints so it can match progress notifications to the call that asked for them. It is echoed back on every notification unchanged, so a caller may compare it to the value it sent. It is accepted on every request, and a request that sends one in a session which declared no progress capability is refused. |
| `release` | string | no | The Release to record, as a path relative to the workspace root. An absolute path, and one climbing out of the workspace, are refused; so is one leading out of it through a link, unless the workspace configuration names that Release. |

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

Seeds a configuration document. It writes the machine-wide file by default, since a registry and the identities trusted on it are machine-wide tooling. It reaches the named registry to read the trust policy it advertises; a registry advertising nothing is reported as such and the seeding proceeds, on the built-in baseline for the official hub and on no policy for any other registry.

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

Checks catalog publishing conventions over one entity, over everything a Release's closure reaches, or over everything under the configured catalog directories. Nothing is written under any mode. Naming neither an entity nor a Release checks the whole catalog: in a workspace whose configuration gives no Release catalog directories of its own, once over the workspace's directories; in a workspace that names Releases under workspace.releases, once for each Release over the directories that Release reads, never over all of them together.

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
| `source` | string | no | Where the run that produced this entry took the entity from, in the same word `aggrega pull --detail` prints for it: `fetched-fresh` (fetched from a registry during that run), `cache-reuse` (a copy already in the cache, reused without fetching), `local` (found on the local filesystem, such as a catalog directory), `in-binary` (the copy inside the compiler binary), or `external` (the Release's own Aggregate or Manifest, read from the file or entry the Release names rather than resolved as one of its dependencies; an Aggregate the run fetched from a registry is `fetched-fresh` instead). Present on the entries of a dependency resolution's report, where it describes what that run did on this machine, and absent from a listing of a Release's resolved dependencies, which describes what the Release depends on. The lockfile records no source. Omitted for an entity whose source the run did not record. |

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
| `lockfile` | string | yes | The lockfile the resolution wrote, or the one a verify compared against. |
| `verified` | boolean | no | Whether the request was a verify, which compared the recorded lockfile and wrote no lockfile, plugin trust record or `entity.lock`. |
| `entities` | array or null | yes | The entities the resolution pinned, or a verify compared. |
| `libraries` | array or null | yes | The libraries the resolution pinned, or a verify compared. |
| `plugins` | array or null | yes | The plugins the resolution pinned, or a verify compared. |
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

One thing a reclamation removed — or, in a list of what it left in place, one thing it would have removed.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `class` | string | yes | Which cache it belongs to. |
| `label` | string | yes | What it is. |
| `reach` | string | yes | Whether that cache belongs to this workspace or is shared across the machine. |
| `size` | integer | yes | How many bytes it occupies, or occupied before it was removed. |
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
| `heldOpenFiles` | integer | yes | How many files the clearing left in this cache because another process had them open. Only Windows refuses to remove an open file, so everywhere else this is zero. A later clearing removes them once that process has finished with them. |
| `heldOpenBytes` | integer | yes | How many bytes those files occupy. They are not counted in size, which is what the clearing reclaimed. |
| `heldOpenBytesText` | string | yes | The same figure written the way a person reads one. |

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

### `SlotCandidacy`

One slot a connection's socket declares, as the consuming Component declares it on the socket, and the Features that may fill it on that connection.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `slot` | string | yes | The slot's name, which is the key an attachment filling it is written under in the connection's features. |
| `selector` | string | yes | The label selector a Feature filling the slot must satisfy with its own labels. Empty where the slot declares none, which admits any Feature. |
| `required` | boolean | yes | Whether every connection wired through the socket must fill the slot for the build to proceed. |
| `inject` | string[] | yes | The delivery mechanisms the slot permits for what fills it, in the order the Component declares them. Empty where it declares none. |
| `sensitive` | boolean | yes | Whether the slot declares that what fills it handles secret material. It marks the attachment filling it and refuses nothing. |
| `description` | string | yes | What the Component says the slot is for. Empty where it says nothing. |
| `candidates` | SourcedEntityRef[] | yes | Each Feature that may fill the slot on this connection: one whose declared applicability the graph node's labels satisfy, which every attachment the node carries is held to, and whose own labels satisfy the slot's selector. A Feature whose applicability or whose labels cannot be read against the selector is not offered, because a build refuses rather than admits it. |

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

One kind an author writes a document of, pairing the token a request names with the kind the document itself declares, and saying which operations accept a document of that kind.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `kind` | string | yes | The lowercase-hyphenated token a request names. |
| `documentKind` | string | yes | The kind the document's own header declares. |
| `acceptedBy` | EntityKindAcceptance | yes | Which operations accept a document of this kind named on its own — by its path, or by its name for inspection — with nothing else sent beside it. A member is true when that operation does not refuse a document for being of this kind; a document it accepts may still be refused for what the document says. |

_Additional properties are not permitted._

### `EntityKindAcceptance`

For one kind an author writes, whether each operation accepts a document of that kind named on its own. Every member is present on every entry, so false is a statement rather than an omission.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `singleEntityValidation` | boolean | yes | Whether the single-entity scope of `aggrega validate` — the command given one document's path — checks a document of this kind. A kind it refuses is checked by the whole-catalog scope or by the Release scope instead. |
| `publication` | boolean | yes | Whether `aggrega/publishEntity` naming the document alone publishes a document of this kind. A kind whose publication also binds an executable named beside the document — a Plugin — is false, because a request naming the document alone is refused for it; a Manifest and a Release are false because neither kind is published. |
| `inspectionByName` | boolean | yes | Whether `aggrega/entityDefinition` resolves a name to an entity of this kind, the name sent as it is written where one entity references another. |

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

What reading a registry's advertised trust policy did. The outcomes are kept apart because they mean different things: the advertised policy was taken, the registry advertised nothing — which is not a failure — the built-in baseline was pinned in its place, or no read was attempted. Where nothing was advertised, whether the registry could be reached at all is stated beside it.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `pinned` | boolean | yes | Whether the advertised policy was taken. |
| `notAdvertised` | boolean | no | Whether the registry was asked and advertised no policy, in which case the operation proceeds on what the request stated. A registry the offline posture kept from being asked is never reported this way. A registry that could not be reached is reported this way too, since no policy came back from it, and carries unreachable beside it; read unreachable to tell the two apart. |
| `unreachable` | boolean | no | Whether the registry could not be reached when its advertised policy was asked for: its name did not resolve, a connection to it was refused or could not be opened, or a secure connection to it could not be established. It is read from the failure itself rather than from reason, it stands beside notAdvertised, and it is set only where the failure shows the registry was never reached; a registry that answered — with no policy, or with a failure — leaves it absent. |
| `baseline` | boolean | no | Whether the built-in baseline was pinned because no advertised policy was taken, which only the official hub carries. It stands beside notAdvertised where the hub was asked and advertised nothing, and alone where the offline posture kept the hub from being asked. |
| `skipped` | boolean | no | Whether no read was attempted, because a stated policy overrode it or the request asked for none. |
| `identities` | integer | no | How many signing identities the advertised policy carried. |
| `reason` | string | no | Why the advertised policy was not taken: what the registry's endpoint did, or the offline refusal that kept it from being asked. |

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
| `unreachable` | boolean | no | Whether this registry could not be reached: its name did not resolve, a connection to it was refused or could not be opened, or a secure connection to it could not be established. It is read from the failure itself rather than from error, it is set only beside error, and only where the failure shows the registry was never reached; a registry that answered, whatever it answered, leaves it absent. |

_Additional properties are not permitted._

### `PublishedVersion`

One version the index holds for a reference: the manifest digest its tag resolved to when the index was built; where the trust policy the index was built under verified the version's own signature, the signer it verified as; and, where anything records it, when the version was published, with the source that says so. The signer is absent for a version with no signature, for one none of whose signatures verified, and where that policy pins neither a public key nor a trusted identity or switches signature verification off. None of those is a basis for naming a signer, and its absence says nothing more. The publication date is absent where the publication stated none and no keyless signature that policy verified records one.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `version` | string | yes | The version, as its tag names it. |
| `manifestDigest` | string | yes | The digest of the manifest the version's tag resolved to when the index was built, which addresses the version by the bytes it names rather than by its tag. |
| `signer` | VerifiedSignature | no | A signature that verified against a registry's trust policy: how it verified, the signer it verified as, and the digest of the signature bundle that verified. |
| `publishedAt` | string | no | When the version was published, as an RFC 3339 timestamp in UTC to the second. Where it came from is `publishedAtSource`, and the two are present together or not at all. |
| `publishedAtSource` | const "transparency-log" or const "publisher" | no | Where `publishedAt` came from, so a time a transparency log attests is never mistaken for one the publisher states. The set is closed. |

_Additional properties are not permitted._

### `VerifiedSignature`

A signature that verified against a registry's trust policy: how it verified, the signer it verified as, and the digest of the signature bundle that verified.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `bundleDigest` | string | yes | The digest of the signature bundle that verified, as `sha256:` followed by 64 lowercase hex characters. |
| `identity` | string | no | The signer the signature verified as: for a keyless signature, the identity the signing certificate was issued for, which is its subject alternative name; for a keyed signature, `keyed:sha256:` followed by the lowercase hex SHA-256 of the pinned public key's PEM text. |
| `issuer` | string | no | The OIDC issuer recorded in the signing certificate, for a keyless signature. It is absent for a keyed signature. |
| `mode` | const "keyless" or const "keyed" | yes | How the signature verified. The set is closed. |

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
| `published` | PublishedVersion[] | no | Every version the index holds for this reference, in the same order as `versions`, each with the manifest digest its tag resolved to when the index was built, where the trust policy the index was built under verified that version's own signature its verified signer, and where anything records it its publication date and that date's source. A version recorded with no signer carries no signature that policy verified, and nothing more is said about it. Only manifests, signature attachments and publication-date attachments are read from the registry to record this; no entity's content is fetched. |
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

### `ImportDecision`

How a conversion mapped one source node: the catalog Components the importer weighed, the one it chose, why, and how to swap the choice.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `sourceNode` | DecisionSourceNode | yes | The source node a mapping decision is about. |
| `candidates` | ImportCandidate[] | no | The catalog Components the importer weighed for the node, each with its score. Absent where it weighed none. |
| `chosen` | DecisionChoice | no | What the importer chose for a source node. Absent from a decision where it made no choice. |
| `rationale` | string | no | Why the importer made the choice, in its own words. Absent where it wrote none. |
| `swapHint` | string | no | How to swap the choice for an alternative, in the importer's own words. Absent where it wrote none. |

_Additional properties are not permitted._

### `DecisionSourceNode`

The source node a mapping decision is about.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | yes | The node's identifier in the source. |
| `type` | string | yes | The node's type, as the source names it. |
| `paramsSummary` | string | yes | A summary of the node's parameters, for showing beside the decision. |

_Additional properties are not permitted._

### `ImportCandidate`

One catalog Component the importer weighed for a source node.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `componentName` | string | yes | The Component's name. |
| `score` | number | yes | How well the Component matches the node, as the importer scored it. |
| `tier` | string | yes | The match tier the score falls in. |
| `signals` | CandidateSignals | yes | What each of the importer's signals contributed to a candidate's score. |

_Additional properties are not permitted._

### `CandidateSignals`

What each of the importer's signals contributed to a candidate's score.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `table` | number | yes | The contribution of the mapping-table signal. |
| `category` | number | yes | The contribution of the category signal. |
| `domainLabels` | number | yes | The contribution of the domain-labels signal. |
| `shape` | number | yes | The contribution of the shape signal. |
| `name` | number | yes | The contribution of the name signal. |

_Additional properties are not permitted._

### `DecisionChoice`

What the importer chose for a source node. Absent from a decision where it made no choice.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `target` | string | yes | The name of the Component chosen: an existing catalog Component, or the one drafted for the node. |
| `mode` | string | yes | How the choice is written: as a reference to an existing Component, or as a newly drafted one. |
| `tier` | string | yes | The match tier of the choice. |

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
| `version` | string | yes | The version of the binary answering this session: the same value `aggrega version` reports for that binary. It describes the running process, so once the file the daemon was started from has been replaced, this still names the version that is running while asking the file names the version that replaced it. |

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
| `graph` | any | yes | The graph document. The values an author declared sensitive are withheld from it unless the request asked for them with unredacted; everything else is carried through as the compiler emitted it. Its own shape is the graph's published contract and is not restated here. |

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

What an entity name resolves to, and the document defining it. An answer read from a registry reference carries `published`, and an answer the catalog resolved by name never does.

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
| `published` | PublishedArtifact | no | What a registry reference read: the coordinate, how it held the entity, and the manifest it was read through. Every field is present wherever this is. |

_Additional properties are not permitted._

### `PublishedArtifact`

What a registry reference read: the coordinate, how it held the entity, and the manifest it was read through. Every field is present wherever this is.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `reference` | string | yes | The registry reference that was read. |
| `archive` | boolean | yes | Whether the coordinate's bytes were an archive the entity document was unpacked from. False where the coordinate held the entity document itself. |
| `mediaType` | string | yes | The artifact type the manifest declares. |
| `manifestDigest` | string | yes | The digest of the manifest the entity was read through — the value to name after `@` to read the same bytes again exactly. |

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
| `lockfile` | string | yes | The lockfile the resolution wrote, or the one a verify compared against. |
| `verified` | boolean | no | Whether the request was a verify, which compared the recorded lockfile and wrote no lockfile, plugin trust record or `entity.lock`. |
| `entities` | array or null | yes | The entities the resolution pinned, or a verify compared. |
| `libraries` | array or null | yes | The libraries the resolution pinned, or a verify compared. |
| `plugins` | array or null | yes | The plugins the resolution pinned, or a verify compared. |
| `sourceArtifacts` | integer | yes | How many source artifacts were acquired. |
| `trustedPlugins` | integer | yes | How many of the pinned plugins carried a verified signature. |
| `toolchain` | ToolchainReport | no | The compiler that resolved, and the plugins it carries. |
| `externalInputs` | integer | yes | How many external inputs the render consumes were acquired. |
| `incompleteExternalInputs` | string | no | Which external inputs could not be acquired, where some could not be. |
| `notices` | string[] | no | Anything the resolution wants the caller to know. |

_Additional properties are not permitted._

### `PinResult`

What the pin step did to the lock beside an entity, or would do on a dry run. It is the answer to `aggrega/pin`, and a publication that ran the step carries it as its `pin`.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `entity` | string | yes | The entity document the step read, as a path relative to the workspace root. |
| `kind` | string | yes | The entity's kind, as its document declares it. |
| `name` | string | yes | The entity's name, as its document declares it. |
| `pinnable` | boolean | yes | Whether an entity of this kind reads anything a lock records a pin for, which a Recipe and a FeatureRecipe do. Where it is false nothing beside the entity was touched, `changed` is false, and `lock`, `removed`, `pins` and `content` are absent. |
| `lock` | string | no | The lock the step wrote, or would write, as a path relative to the workspace root. |
| `changed` | boolean | yes | Whether the lock moved, or would move on a dry run. False where the lock already recorded every pin the entity needs and was left byte-identical. |
| `removed` | boolean | no | Whether the move is a removal: the entity reads nothing a lock records a pin for, so no lock is left beside it. |
| `dryRun` | boolean | no | Whether this reports what the step would do rather than what it did. |
| `pins` | PinClassCount[] | no | How many pins of each class the lock holds after the step, or would hold after a dry run. Every class the lock can hold is listed, a class with no pin included. |
| `content` | string | no | The lock a dry run would write. Absent where the lock would be left as it is or removed, and on every answer that is not a dry run. |

_Additional properties are not permitted._

### `PinClassCount`

How many pins of one class a lock holds.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `class` | string | yes | The class of pin, in the words a refusal naming a missing one uses — `remote source` or `imported file`, for instance. |
| `pins` | integer | yes | How many pins of that class the lock holds. |

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
| `heldOpen` | array or null | yes | What the prune would have removed but left in place because another process had it open. Only Windows refuses to remove an open file, so everywhere else this is empty. These entries are counted as neither removed nor kept, none of their bytes count as reclaimed, and a later prune reclaims them; an entry that is a directory may already have lost the files in it that were not open. |
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
| `heldOpen` | array or null | yes | What the reclaiming would have removed but left in place because another process had it open; it went on to the next-oldest entry instead. Only Windows refuses to remove an open file, so everywhere else this is empty. These entries still count toward the bytes that remain, and a later reclaiming can remove them. |
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
| `trust` | TrustFetchOutcome | yes | What reading a registry's advertised trust policy did. The outcomes are kept apart because they mean different things: the advertised policy was taken, the registry advertised nothing — which is not a failure — the built-in baseline was pinned in its place, or no read was attempted. Where nothing was advertised, whether the registry could be reached at all is stated beside it. |

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
| `reachedRegistries` | boolean | yes | Always true on this answer: refreshing the indexes goes out to the registries themselves, where listing them and searching answer from configuration and from a local index. Whether a given registry was in fact reached is stated on its own entry in hosts, by unreachable. |

_Additional properties are not permitted._

### `LogoutResult`

Which stored credential was removed, and how far the store reaches.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `registry` | string | yes | The registry whose credential was removed. |
| `scope` | CredentialStoreScope | yes | How far a credential change reaches. The store is shared by every project on the machine and by every other tool addressing the same registries, so the answer reports that rather than leaving a session-scoped reading to be inferred. |

_Additional properties are not permitted._

### `PublishEntityResult`

What publishing an entity landed, and where. A publication that ran the pin step first also carries what that step did, as `pin`, which is absent where the step did not run.

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
| `digest` | string | yes | The digest of what was published. On a dry run, the digest a publication of the same content would land, computed from the content alone: the one `aggrega push --dry-run` prints. |
| `signed` | boolean | yes | Whether this publication attached a signature: the one it made before publishing, or, on a version already published, one the version lacked. |
| `alreadyPublished` | boolean | yes | Whether the same bytes were already there, so no content was uploaded. Only what that publication still lacked was attached beside it: its publication date and, where this publication signs, its signature; signed says whether a signature was. |
| `dryRun` | boolean | yes | Whether this reports what publishing would have landed rather than what it did. |
| `reach` | PublicationReach | yes | How far a publication reached. These answers reach beyond this machine entirely — what they land is what every consumer of that registry resolves — so each names the host it addressed and whether the call landed anything. |
| `pin` | PinResult | no | What the pin step did to the lock beside an entity, or would do on a dry run. It is the answer to `aggrega/pin`, and a publication that ran the step carries it as its `pin`. |
| `wholeDirectorySource` | string | no | The entity's local source as authored, present when it is written as a template. Such a source names its directory only once a Release fills the template in, so the publication carries every file in the entity's directory rather than only the files the entity names. Absent where it carries only those files. |

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
| `alreadyPublished` | boolean | yes | Whether the same bytes were already there, so no content was uploaded. A publication date was attached beside it only where the artifact lacked one. |
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

Every entity the workspace index holds, and the links leading out of the workspace, to directories and to files, that were not read for it.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `entities` | array or null | yes | Each entity. |
| `unreadLinkedDirs` | string[] | yes | Each link under the workspace root that leads to a directory outside it, named relative to the root where the link itself sits, in the order the workspace is searched. No directory outside the root is searched, so no document behind one of these links is among entities as the workspace's own, and a client listing entities can say why. Not named: a link to a directory inside the root, which is searched, or left out, where it actually sits; a link wherever a directory would be left out, whether by where it sits, by its name or by a .gitignore; a link that cannot be resolved, because it leads nowhere or round a loop; and, in an answer given in a Release's terms, a link under a catalog directory only other Releases read. Empty when the workspace holds none. |
| `unreadLinkedFiles` | string[] | yes | Each link under the workspace root that is named like a YAML file, its own name ending in .yaml or .yml, and leads to a file outside the root, named relative to the root where the link itself sits, in the order the workspace is searched. Such a file is not read for the index, whatever it declares, so the entity it declares is not among entities as the workspace's own, and a client listing entities can say why; the configured catalog directories are how entities outside the workspace are read. Not named: a link to a file that the workspace configuration names as a Release, as build.authoring_release or as a key of workspace.releases, and that declares one, which is read and listed in entities at the link's own place; a link to a file inside the root, which is read at the link's own place; a link a .gitignore leaves out, or one inside a directory the search leaves out; a link that leads to no file, whether to a directory, which unreadLinkedDirs names where it leads out of the root, or nowhere, or round a loop; and, in an answer given in a Release's terms, a link under a catalog directory only other Releases read. A workspace configuration file that is a link leading out of the workspace, its own .aggrega-config.yaml or the CI-owned overlay beside it, is named whether or not the search met it, after the links the search named: the workspace's configuration is then not read at all, this answer is the workspace's own index read with nothing configured, so no catalog directory is read for it, and every request the configuration decides, an index in a Release's terms included, is refused for that workspace with the read hold's condition. Empty when the workspace holds none. |

_Additional properties are not permitted._

### `AttachCandidatesResult`

Which Features may be attached to the entity, and the labels they were judged against; and, for a connection the request named, the slots its socket declares with the Features that may fill each.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `node` | string | yes | The entity the candidates were judged for. |
| `nodeLabels` | object or null | yes | The labels the judgement was made against. |
| `labelSource` | string | yes | Which label set was used, which is not cosmetic: a document's declared labels are what a reading of the source can see, while a graph node's are the finalised set the build itself judges against. An answer computed over the second is a statement about what the build will do. |
| `candidates` | array or null | yes | Each Feature that may be attached. |
| `slots` | SlotCandidacy[] | no | Present only when the request named a connection: each slot the connection's socket declares, in the order the Component declares them, with the Features that may fill it. Empty when no slot may be filled on the connection, and noSlotReason then says why — which a client reads rather than taking an empty list for slots no Feature matched. |
| `noSlotReason` | const "feature-created-connection" or const "ad-hoc-socket" or const "no-slot-declared" | no | Present only when the request named a connection and no slot may be filled on it: why nothing may attach there. Absent wherever the socket declares a slot. The set is closed. |

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

Which document, and where in it, an attachment on the graph node, or on the connection the request named, belongs.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `node` | string | yes | The graph node the attachment is for. |
| `file` | string | yes | The document the attachment belongs in. |
| `container` | array or null | yes | The path through that document to where it belongs. |

_Additional properties are not permitted._

### `ConnectionAtPositionResult`

The connection whose entry the position falls inside, or why none is reported. Exactly one half is present: graphNode and connection together, or noConnectionReason alone. A position anywhere inside an entry — on its alias, its target or its attachments — is inside that entry, the innermost one where entries nest; a position on a socket's own key, above the entries written under it, is inside none.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `graphNode` | string | no | The id of the node whose component draws the connection, as the compiled graph keys it — the value the candidacy and container requests take as graphNode. |
| `connection` | ConnectionCoordinate | no | The connection, by its socket and its alias, with document naming the document the position was read in — the value the candidacy and container requests take as connection. |
| `noConnectionReason` | const "no-connection-entry" or const "feature-created-connection" or const "unknown-connection" | no | Present only where no connection is reported: why. The set is closed. |

_Additional properties are not permitted._

### `ReleaseCandidatesResult`

The Releases the workspace holds, and the links leading out of it, to directories and to files, that were not read for them.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `releases` | array or null | yes | Each Release document. |
| `lockfiles` | map of string | yes | The lockfile of each Release listed, keyed by the Release exactly as it is listed. Each is the file a pull writes for that Release and a build reads, so a client reads where it lives rather than working it out. Empty when the workspace holds no Release. |
| `unreadLinkedDirs` | string[] | yes | Each link under the workspace root that leads to a directory outside it, named relative to the root where the link itself sits, in the order the workspace is searched. No directory outside the root is searched, so a Release reached only through one of these links is not in releases, and a client offering Releases can say why. Not named: a link to a directory inside the root, which is searched, or left out, where it actually sits; a link wherever a directory would be left out, whether by where it sits or by its name; and a link that cannot be resolved, because it leads nowhere or round a loop. Empty when the workspace holds none. |
| `unreadLinkedFiles` | string[] | yes | Each link under the workspace root that is named like a YAML file, its own name ending in .yaml or .yml, and leads to a file outside the root, named relative to the root where the link itself sits, in the order the workspace is searched. Such a file is not read, so a Release reached only through one of these links is not in releases, and a client offering Releases can say why. Whether a file is a Release is not known without reading it, so each such link is named whatever the file holds. Not named: a link to a file the workspace configuration names as a Release, as build.authoring_release or as a key of workspace.releases, which is read and listed in releases at the link's own place; a link to a file inside the root, which is read; a link inside a directory the search leaves out; and a link that leads to no file, whether to a directory, which unreadLinkedDirs names where it leads out of the root, or nowhere, or round a loop. A workspace configuration file that is a link leading out of the workspace, its own .aggrega-config.yaml or the CI-owned overlay beside it, is named whether or not the search met it, after the links the search named: the workspace's configuration is then not read at all, this answer is read with nothing configured, so no Release the configuration names through a link is listed, and every request the configuration decides is refused for that workspace with the read hold's condition. Empty when the workspace holds none. |

_Additional properties are not permitted._

### `ActiveReleaseResult`

Which Release a client should act on by default. A workspace pointing at no Release is an ordinary state rather than a failure, so it is reported here with an account of how the choice was attempted rather than raised as an error.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `release` | string | yes | The Release that was settled on, or empty where none was. |
| `lockfile` | string | no | The lockfile of the Release that was settled on: the file a pull writes for it and a build reads. Absent where no Release was settled on. |
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
| `trust` | TrustFetchOutcome | yes | What reading a registry's advertised trust policy did. The outcomes are kept apart because they mean different things: the advertised policy was taken, the registry advertised nothing — which is not a failure — the built-in baseline was pinned in its place, or no read was attempted. Where nothing was advertised, whether the registry could be reached at all is stated beside it. |
| `written` | boolean | yes | Whether the document was written, as against handed back for the caller to place. |
| `existed` | boolean | no | Present and true when the document was already there, so the registry entry was merged into it rather than a new document created. Only a request sending force proceeds over an existing document, so it is absent from every answer to one that did not. |
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
| `decisions` | ImportDecision[] | yes | How the importer mapped each source node, in the importer's order and exactly as it reported it: what tells you where the conversion guessed. Carried under both deliveries and whether or not the conversion stopped, and an empty list for an importer that reports none. |
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

What the convention check found, counted by severity and listed per document. A whole-catalog check that ran once for each Release also carries passes; the counts and files then cover every pass together.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `entity` | string | no | The one entity that was checked, where the request named one. |
| `release` | string | no | The Release whose closure was checked, where the request named one. |
| `checked` | integer | yes | How many documents were checked. Where the check ran once for each Release, the sum over the passes: a document two passes read is counted in each. |
| `findings` | integer | yes | How many findings there are in total. |
| `errors` | integer | yes | How many of them are errors. |
| `warnings` | integer | yes | How many of them are warnings. |
| `infos` | integer | yes | How many of them are informational. |
| `files` | array or null | yes | The findings, per document. |
| `halted` | boolean | yes | Whether the check stopped rather than finishing with findings. |
| `passes` | array or null | no | The whole-catalog check one pass at a time, present only where it ran once for each Release because the workspace names Releases under workspace.releases. Each pass says which Releases its findings were found for. Absent for a workspace that names none, which is checked once over its own directories, and for a check of one entity or of a Release's closure. |

_Additional properties are not permitted._

### `LintPass`

One pass of a whole-catalog convention check in a workspace that gives its Releases catalog directories of their own: the Releases it was run for, the directories it read, and what it found there.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `releases` | array or null | yes | The Releases the pass was run for, each as a path relative to the workspace root. Releases that read the same catalog directories share one pass. |
| `catalogDirs` | array or null | yes | The catalog directories the pass read, in the order they are searched, each relative to the workspace root where it lies inside it. Empty where its Releases read no catalog directory, so the pass checked nothing and failed none of the others. |
| `checked` | integer | yes | How many documents the pass checked. |
| `findings` | integer | yes | How many findings the pass found. |
| `errors` | integer | yes | How many of them are errors. |
| `warnings` | integer | yes | How many of them are warnings. |
| `infos` | integer | yes | How many of them are informational. |
| `files` | array or null | yes | The pass's findings, per document. |

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
