# aggrega serve

`aggrega serve` runs Aggrega as a long-running **compiler-as-service daemon** for IDE integration. It speaks JSON-RPC 2.0 over stdin/stdout and holds catalog-resolver, parse-cache, and diagnostic state across requests, so editor operations get sub-second feedback instead of paying the full catalog-load cost on every keystroke.

The daemon is normally spawned as a subprocess by an editor extension, not run by hand. A VS Code extension is the reference client; other editors can integrate by speaking the same protocol.

## The protocol

The wire protocol is JSON-RPC 2.0 with Content-Length framing, under the `aggrega/` method namespace. It is intentionally **not** the Language Server Protocol — Aggrega has domain operations (an IR-graph query, a cache-invalidation signal) that LSP has no analogue for. An editor extension translates between the editor's LSP requests and these `aggrega/*` methods; LSP-shaped position, range, and location values are reused where they fit.

**Requests:**

- `aggrega/initialize` — handshake. Negotiates the position encoding (the server prefers UTF-8, then UTF-16, then UTF-32, and defaults to UTF-16) and reports the resolved workspace root and the marker that resolved it.
- `aggrega/validate {file, content}` — validate a file's content; returns diagnostics.
- `aggrega/diagnostics {file}` — return the cached diagnostics for a file.
- `aggrega/hover {uri, position}` — hover content for the entity at a position.
- `aggrega/completion {uri, position}` — completion candidates at a position.
- `aggrega/resolve {uri, position}` — resolve the entity referenced at a position (go-to-definition).
- `aggrega/findReferences {uri, position}` / `aggrega/findImplementations {uri, position}`.
- `aggrega/irGraph {release}` — the compiled IR graph for a Release, for editor introspection. `release` is a path relative to the workspace root, naming a Release inside it — the same value `aggrega build --release` takes when run from the root. Any other form is refused with the standard invalid-params error naming what to send instead: an absolute path, a path that resolves outside the workspace root, and an empty value are all rejected rather than resolved, so a request never reports on a file the workspace does not hold. Note that `aggrega/releaseCandidates` answers with absolute paths, so a client feeding one surface from the other converts between the two. The graph is returned verbatim, values an author declared sensitive included: it is a machine-readable projection, so it reproduces its input rather than withholding part of it. See [`aggrega-inspect`](aggrega-inspect.md) "Machine-readable output".
- `aggrega/catalogIndex` — the workspace's entity index: the `kind`, `name`, `apiVersion`, `description`, `labels` and source file of every Aggrega document under the workspace root. Takes no parameters: the set is a property of the workspace root the daemon resolved. A document counts as an entity here when it declares both a `kind:` and a `metadata.name`, so foreign YAML that happens to sit in the tree — a chart's values file, a CI configuration — is skipped rather than listed. This is the surface a client joins against when it needs an entity's descriptive fields, so the addressing responses below can stay minimal instead of carrying a second copy that could disagree.
- `aggrega/attachCandidates {node}` — which Features may attach to the named entity: the ones whose declared applicability the entity's labels satisfy. `node` is an entity's `metadata.name`. The response repeats that name, carries `nodeLabels` — the label pairs the match was evaluated against — and lists each candidate as the `kind`, `name` and source file that address it. Carrying the labels back is what makes the answer auditable from itself: a client can explain why a Feature was offered without forming its own idea of the entity's labels, which is how a client's answer and the compiler's come apart.
- `aggrega/connectionCandidates {node, socket?}` — what the named entity may connect to. `node` is an entity's `metadata.name`, the same coordinate `aggrega/attachCandidates` takes. See [What a connection-candidate response tells you](#what-a-connection-candidate-response-tells-you) below, because the two halves of the answer are not equally complete and the response says which is which.
- `aggrega/releaseCandidates` — the workspace's Release documents, as absolute paths. Takes no parameters: the set is a property of the workspace root the daemon resolved. Membership is decided by document kind — the file's `kind:` is `Release` — and not by filename, so a Release named without a conventional prefix is offered and a file merely named like one is not. This is what an editor's "which Release?" picker should list, because it is the same set the active-Release cascade below chooses from.
- `aggrega/activeRelease` — which Release the daemon resolved for this workspace, as an absolute path in a `release` field. Takes no parameters. The field is always present, and an empty value means the workspace has no active Release — a successful answer, not the release-not-resolved error, so a client that refreshes this on every daemon restart is not made to treat an ordinary workspace as a failure. Ask for it rather than working the answer out from one of the cascade's inputs: an input the cascade did not end up using names a different Release than the one in force.
- `aggrega/invalidate {file, granularity?}` — a cache-invalidation signal from the editor's file watcher.

**Notifications:**

- `aggrega/shutdown` — begin a cooperative drain: in-flight requests finish, new requests are refused, then the daemon exits.
- `aggrega/publishDiagnostics` — a server-pushed diagnostic set (used for lockfile-drift warnings and at-startup state). Each entry carries a `source` naming which of the daemon's two layers raised it: `aggrega` for a finding about the authored documents, and `aggrega-build` for an advisory a render raised — the same findings `aggrega build` prints. The field is always present on every entry, so a client can group the two rather than showing one undifferentiated list, and never has to tell an absent source apart from the other layer.

## Live validation

On each `aggrega/validate` the daemon validates the editor buffer against the document's schema and returns diagnostics pointed at the offending key — the same verdict a build would give, on unsaved content. Catalog entities, Aggregates, Manifests, and Releases are recognized by their `apiVersion` and `kind`. The two documents that carry no such header — the `.aggrega-config.yaml` workspace config and the active Release's lockfile — are recognized by filename instead, so a junk or misshapen key in either one also squiggles live. Files that are not Aggrega documents — Helm chart templates, Compose files, Kubernetes manifests, and other ecosystems' `.lock` files such as `Cargo.lock` or `flake.lock` — receive no diagnostics; the daemon never reports on foreign files.

### What a diagnostic entry carries

Each entry positions itself with `line` and `column`, both 1-based in the position encoding negotiated at the handshake, and adds `end_line` and `end_column` when it spans a whole token. `message` is the text a client shows the user, `severity` classifies it, and `source` names which of the daemon's two layers raised it, as described above.

`code` is a stable, machine-matchable code for what the entry reports, so a client can branch on it without matching the message text. **One key carries the code whoever assigned it**, and `source` tells you which kind you are holding, because the two layers name things from different vocabularies.

- On an `aggrega` entry — a finding about the authored documents — the code is the string the condition is registered under, written as the declaring package and then the rule in kebab-case. It is the same value a Go consumer reads with `CodeOf`, whose form and matchable surface are described in [the error-sentinels reference](../errors/sentinels.md).
- On an `aggrega-build` entry — an advisory a render raised — the code is the advisory's own class code, such as `unsupported-field`, assigned wherever that advisory was raised, whether that is a rendering plugin or the render itself. The code names what the finding is and not who found it, so a single class reaches you under one code however many places raise it. A class code names a class of advisory rather than a registered condition, so it has no row in the sentinel reference; [the warnings reference](../errors/warnings.md) describes the `unsupported-field` class and the flag that silences it.

Either way the key answers one question — what is this, in terms a machine can match — so an editor extension that highlights, groups, or suppresses one class of finding keys on the code, and keeps working when the wording of a message changes.

Note which object carries which: this is a **string** on a diagnostic entry, distinct from the **numeric** `code` on a JSON-RPC error envelope described under [Error codes](#error-codes) below. A response carries one or the other, never both in one place.

The key is **omitted** where nothing that produced the entry assigned a code, and both kinds have that case. A buffer no YAML parser will read reports the parser's own text and no code, because no condition of Aggrega's own stands behind it; a stage that reports a failure without naming a condition likewise has none to report; and an advisory whose raiser assigned no code arrives without one. So treat `code` as optional, the same way `end_line` and `end_column` are, and branch on it only when it is present. A code is what a diagnostic reports and never what selects one: no request takes a code, and writing one back into your own code gives you a string rather than a way to match.

## What a connection-candidate response tells you

`aggrega/connectionCandidates` answers two questions at once, and only one of them has a complete answer. Reading the response as a single filtered list gets the other one wrong.

Each reported socket carries `targets` — the workspace-local Components whose declared labels satisfy the label constraint that socket declares over what may satisfy it — plus the `selector` those targets were computed from, the `required` flag the socket declares, and `declaration`. `targets` is always an array, empty rather than absent, so a socket nothing satisfies is still reported as a socket the entity declares.

**The target half is complete.** The set is decided by evaluating the socket's declared constraint against a candidate's declared labels, the same evaluation a build performs, so what you offer is what the same constraint admits during a build. A socket declaring no constraint leaves its targets unconstrained and reports every Component — that is the constraint language's meaning for an empty selector, not an error.

**The socket half is open, and `declaration` plus `adHocSocketsAccepted` are how you tell.** A Component's author owns their application's topology and may wire a socket the component's catalog entity never declared, so the sockets an entity declares are a helpful starting set and **not** the set of legal socket names. Present them as suggestions, not as the only choices — a picker that only offered declared sockets would tell the author their freedom is narrower than it is.

- `declaration` is `declared` when the addressed entity lists the socket in its `usesSchema`, and `ad-hoc` when it does not. These are the same two values an edge carries in the IR graph, so one vocabulary answers "where did this socket come from" wherever you meet the question.
- `adHocSocketsAccepted` reports whether the addressed entity's surface accepts a socket its own declaration does not list. It is **not** always true: a Component's own dependency surface accepts one, and a Feature's attachment surface does not, because an attachment participates in the topology the attached Feature declares rather than authoring its own. An ad-hoc socket on a surface that does not accept one is reported with no targets, because no connection through it would build.

Naming a `socket` in the request scopes the answer to that one socket, and it is the only way to ask about a socket the entity does not declare — an undeclared socket appears in no declaration to enumerate. Omit it to get every socket the entity declares, in the order they are authored.

**What it reports is a match over declared labels.** A build evaluates a socket's constraint against the finalised labels of the node at the far end of the edge, and a composition or a Release may contribute labels no single document declares. So a positive answer is not a promise about a node whose labels are contributed from above — the same bound `aggrega/attachCandidates` carries.

**It reports and never creates.** The method resolves nothing, reaches no registry or network, and writes nothing: it creates no edge and proposes no text. Composing and applying the edit is the editor's, which is where the buffer and the undo history are.

For the entity identities in `targets` — `kind`, `name` and `file` — join against `aggrega/catalogIndex` on the same triple for anything you want to display. The describing fields are reported there and deliberately not repeated here, so the two responses cannot disagree about the same entity.

## Cache model

Operations are cache-driven: call `aggrega/validate` for a file before `hover` / `completion` / `resolve` / `diagnostics` on it. The parse cache is checked against each file's on-disk modification time on every read, so external edits (an editor save, a `git checkout`) are picked up automatically — the editor's `aggrega/invalidate` is an optimization, not a correctness requirement.

## Workspace root and active Release

The daemon resolves its workspace the same way every `aggrega` command does. Discovery walks up from the working directory: a `.aggrega-config.yaml` carrying a `workspace:` block anchors the root, and failing that a heuristic marker does — an `.aggrega/` directory, then `aggregate*.yaml`, `release*.yaml`, or `manifest*.yaml`. A `.aggrega-config.yaml` *without* a `workspace:` block does not anchor; it still contributes its settings, but a bare settings file cannot turn every parent directory into a workspace root. `--workspace-root` overrides discovery. When no marker is found, the working directory is used — the daemon starts and operations simply resolve nothing, rather than refusing to run.

Configuration is a cascade. Every `.aggrega-config.yaml` from the workspace root down to the working directory contributes, with a nearer file overriding a farther one; beneath the tree, `$AGGREGA_CONFIG` (when set) supplies a base layer, and built-in defaults sit under that. The full precedence for the workspace root is: `--workspace-root`, then the nearest `workspace:`-marked config, then a heuristic marker, then the working directory.

Operations that need a Release pick the active one through a four-step cascade: the `build.authoring_release` config field, then an `.aggrega/active-release` marker file, then a single-Release-in-the-workspace heuristic, then an Aggregate-only fallback. A marker you write therefore takes precedence over the heuristic, and a marker naming a Release that cannot be loaded falls through to the heuristic rather than to the fallback.

`aggrega/activeRelease` reports which Release that cascade selected. Ask the daemon rather than reading the cascade's inputs yourself: the config field and the marker file are two of four inputs, so whichever one you read names the active Release only when it happens to be the input that won. A marker naming a Release that cannot be loaded is the clearest case — the daemon resolves a different Release entirely, and a reader of the marker would report the one that failed. The cascade runs when the first request needing a Release arrives rather than at startup, so this query is answered against a resolved workspace whenever it is asked; the handshake stays fast because it does not wait for the workspace walk the cascade performs.

The operations that search the whole workspace rather than one buffer — `completion`, `hover`, `resolve`, `findReferences` and `findImplementations` — enumerate the YAML under the workspace root, and that enumeration **honours `.gitignore`**. Every `.gitignore` from the workspace root down to the file's own directory contributes, with the nearest one winning, so a YAML file your repository ignores is not offered as a completion candidate and is not reported as a definition or a reference. Vendored trees and generated output therefore stay out of cross-file results without any separate exclusion setting to maintain — and a document you expect to be found but have ignored will not appear, which is the one case worth checking when a reference seems to be missing.

## Lockfile awareness

When an active Release has a lockfile, the daemon checks it for drift at startup and on each `aggrega/irGraph`, surfacing drift as a non-blocking warning. `aggrega/irGraph` requires a lockfile to be present.

**`aggrega/irGraph` is the one operation that refuses rather than warns, and it is the only one.** Everywhere else — including `aggrega/validate` — a plugin the workspace has no recorded digest for is run anyway, with [a warning](../errors/warnings.md) saying nothing checked its bytes. A graph is different in kind: it is a picture a reader then reasons about, and one built from unverified bytes would be drawn exactly like one that was checked, with the warning sitting somewhere the reader is not looking. So the handler stops before it resolves anything and answers `lockfile-absent`, naming the lockfile it looked for and the Release, so a client can offer `aggrega pull --release <release>` directly.

**`aggrega/validate` reads the lockfile for its pins and its deprecation notices only.** It does not hold the plugins it runs to the recorded digests, and it does not rebuild the transform-plugin attachment set from the lockfile — it validates against the workspace configuration as it stands in front of you, which is what an editor has to do while you are editing that configuration. `aggrega validate` and `aggrega build` do both, and remain the authoritative surfaces for a verdict about a committed workspace.

## Error codes

Responses use the standard JSON-RPC error codes plus an application-level range in the 1xxx band: file-not-validated, release-not-resolved, lockfile-absent, entity-not-resolvable, and shutting-down. An editor client can branch on the code without parsing the message. The two bands mean different things to a client: a 1xxx code names a state of the workspace the user can act on — validate the file, generate the lockfile, choose a Release — while a standard code such as invalid-params names a malformed request, which the client corrects rather than the user.

An error may carry a `data` object, and every key in it names one thing and only that thing. `file` is the source document that the accompanying `line` and `column` locate — the document being validated, or the Release whose load failed. `lockfile` is a lockfile. `release` is the Release the error is about, spelled the way the request named it, so a client can compose `aggrega pull --release <release>` without parsing it back out of the message. `cascade_attempt` is the daemon's account of how the active-Release cascade ran when it ended with no Release in force: a few lines, one to a step, each naming what that step looked for and what it found, so the reason nothing was resolved can be read directly rather than inferred from the one-line message. It arrives on a release-not-resolved response, which is the state that account describes. **It is diagnostic prose written for a person to read, not a structure to parse.** Show it as it stands — write it to a log, or into a panel the user can open — and do not match patterns against it, lift values out of it, or branch on the labels it uses: its wording, its layout and those labels track the cascade itself and change whenever the cascade does. A client that passes the text through keeps working across such a change; one that has learned its shape breaks on it. Every key is optional and present only when the daemon has that value in hand; none stands in for another, so what a key points at never depends on the code beside it.

## See also

- [./aggrega-build.md](./aggrega-build.md) — the daemon runs the same compiler pipeline the build command does; the build command remains the authoritative, lockfile-verified surface.
- [./aggrega-version.md](./aggrega-version.md) — the version command an editor extension uses to check daemon compatibility.
- [./aggrega-pull.md](./aggrega-pull.md) — the lockfile the daemon's drift surface reads.

<!-- BEGIN GENERATED: cli-serve -->
**Synopsis**

```
aggrega serve [flags]
```

**Flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--build-on-inspect` | `false` | Run the build's analysis while inspecting an IR graph, so the findings aggrega build reports also appear as editor problems. Nothing is written to disk: no rendered artifacts, no output directory, no lockfile. Off by default, matching aggrega inspect, which raises no such advisory either. When set, overrides the serve.build_on_inspect config key. |
<!-- END GENERATED: cli-serve -->
