# aggrega serve

`aggrega serve` runs Aggrega as a long-running **compiler-as-service daemon** for IDE integration. It speaks JSON-RPC 2.0 over stdin/stdout and holds catalog-resolver, parse-cache, and diagnostic state across requests, so editor operations get sub-second feedback instead of paying the full catalog-load cost on every keystroke.

The daemon is normally spawned as a subprocess by an editor extension, not run by hand. A VS Code extension is the reference client; other editors can integrate by speaking the same protocol.

## The protocol

The wire protocol is JSON-RPC 2.0 with Content-Length framing, under the `aggrega/` method namespace. It is intentionally **not** the Language Server Protocol — Aggrega has domain operations (an IR-graph query, a cache-invalidation signal) that LSP has no analogue for. An editor extension translates between the editor's LSP requests and these `aggrega/*` methods; LSP-shaped position, range, and location values are reused where they fit.

**Requests:**

- `aggrega/initialize` — handshake. Negotiates the position encoding (the server prefers UTF-8, then UTF-16, then UTF-32, and defaults to UTF-16) and reports the resolved workspace root and the marker that resolved it.
- `aggrega/validate {file, content, release?}` — validate a file's content; returns diagnostics. `release` is a path relative to the workspace root naming the Release to validate against — the same value `aggrega/irGraph` takes, and the same value `aggrega build --release` takes when run from the root. It is optional, and it selects how far the answer reaches: name a Release and the checks that need one run against it; omit it and the answer covers what the document can be held to on its own, and carries `checked` to say so. A value that is present but malformed is refused either way — an absolute path, or one resolving outside the workspace root, is rejected rather than resolved. See [Live validation](#live-validation).
- `aggrega/diagnostics {file}` — return the cached diagnostics for a file.
- `aggrega/hover {uri, position}` — hover content for the entity at a position.
- `aggrega/completion {uri, position}` — completion candidates at a position.
- `aggrega/resolve {uri, position}` — resolve the entity referenced at a position (go-to-definition).
- `aggrega/findReferences {uri, position}` / `aggrega/findImplementations {uri, position}`.
- `aggrega/irGraph {release}` — the compiled IR graph for a Release, for editor introspection. `release` is a path relative to the workspace root, naming a Release inside it — the same value `aggrega build --release` takes when run from the root. Any other form is refused with the standard invalid-params error naming what to send instead: an absolute path, a path that resolves outside the workspace root, and an empty value are all rejected rather than resolved, so a request never reports on a file the workspace does not hold. Note that `aggrega/releaseCandidates` answers with absolute paths, so a client feeding one surface from the other converts between the two. The graph is returned verbatim, values an author declared sensitive included: it is a machine-readable projection, so it reproduces its input rather than withholding part of it. See [`aggrega-inspect`](aggrega-inspect.md) "Machine-readable output".
- `aggrega/catalogIndex` — the entity index: the `kind`, `name`, `apiVersion`, `description`, `labels`, source file and `origin` of every entity the daemon can see. Takes no parameters: the set is a property of the workspace root and the catalog directories the daemon resolved. It spans both places an entity comes from — the Aggrega documents under the workspace root, and the Features the configured catalog directories carry — because this is the surface a client joins against when it needs an entity's descriptive fields, and an index that knew only one of the two would leave part of every candidate list unresolvable. A workspace document counts as an entity when it declares both a `kind:` and a `metadata.name`, so foreign YAML that happens to sit in the tree — a chart's values file, a CI configuration — is skipped rather than listed. See [How an entity is addressed](#how-an-entity-is-addressed) for what `origin` and an empty `file` mean.
- `aggrega/attachCandidates {node}` or `{graphNode, release}` — which Features may attach to a node: the ones whose declared applicability the node's labels satisfy. Send exactly one coordinate. `node` names a workspace document by its `metadata.name`; `graphNode` names a node on the compiled graph of `release`, by the id that graph keys it under. The response repeats the coordinate it answered for, carries `nodeLabels` — the label pairs the match was evaluated against — `labelSource` saying which kind of label set those are, and each candidate as the `kind`, `name`, source file and `origin` that address it. Carrying the labels back is what makes the answer auditable from itself: a client can explain why a Feature was offered without forming its own idea of the node's labels, which is how a client's answer and the compiler's come apart. See [What an attach-candidate response tells you](#what-an-attach-candidate-response-tells-you).
- `aggrega/connectionCandidates {node, socket?}` — what the named entity may connect to. `node` is an entity's `metadata.name`, the same coordinate `aggrega/attachCandidates` takes under that name. See [What a connection-candidate response tells you](#what-a-connection-candidate-response-tells-you) below, because the two halves of the answer are not equally complete and the response says which is which.
- `aggrega/releaseCandidates` — the workspace's Release documents, as absolute paths. Takes no parameters: the set is a property of the workspace root the daemon resolved. Membership is decided by document kind — the file's `kind:` is `Release` — and not by filename, so a Release named without a conventional prefix is offered and a file merely named like one is not. This is what an editor's "which Release?" picker should list, because it is the same set the active-Release cascade below chooses from.
- `aggrega/activeRelease` — which Release this workspace points at, as an absolute path in a `release` field, for a client deciding what to select by default. Takes no parameters. The field is always present, and an empty value means the workspace points at none — a successful answer rather than an error, so a client that refreshes this on every daemon restart is not made to treat an ordinary workspace as a failure. When the value is empty the answer also carries `reason`, a one-line summary of what the cascade looked for, and `trace`, the per-step account of it; both are omitted when a Release resolved. Ask for it rather than working the answer out from one of the cascade's inputs: an input the cascade did not end up using names a different Release than the one it chose. The answer is computed when you ask, so asking again after writing a marker, editing the configuration or adding a Release file reports the new answer rather than the workspace as it stood when the daemon started.
- `aggrega/effectiveConfiguration` — the configuration in force for this session, and the layer each setting came from. Takes no parameters: the answer is a property of the workspace the daemon resolved when it started. `layers` lists the config files and environment overrides that contributed, lowest precedence first; `settings` carries each attributed setting as its dotted name, its effective value, and the `source` that determined it. A `source` is spelled exactly as the matching entry in `layers`, so the two join directly. See [What the effective-configuration response covers](#what-the-effective-configuration-response-covers), because the attributed set is narrower than the configuration schema and a client that reads it as complete will be wrong.
- `aggrega/invalidate {file, granularity?}` — a cache-invalidation signal from the editor's file watcher.

**Notifications:**

- `aggrega/shutdown` — begin a cooperative drain: in-flight requests finish, new requests are refused, then the daemon exits.
- `aggrega/publishDiagnostics` — a server-pushed diagnostic set (used for lockfile-drift warnings and at-startup state). Each entry carries a `source` naming which of the daemon's two layers raised it: `aggrega` for a finding about the authored documents, and `aggrega-build` for an advisory a render raised — the same findings `aggrega build` prints. The field is always present on every entry, so a client can group the two rather than showing one undifferentiated list, and never has to tell an absent source apart from the other layer.

## Live validation

On each `aggrega/validate` the daemon validates the editor buffer against the document's schema and returns diagnostics pointed at the offending key — the same verdict a build would give, on unsaved content. Catalog entities, Aggregates, Manifests, and Releases are recognized by their `apiVersion` and `kind`. The two documents that carry no such header — the `.aggrega-config.yaml` workspace config and the lockfile of the Release the request named — are recognized by filename instead, so a junk or misshapen key in either one also squiggles live. Files that are not Aggrega documents — Helm chart templates, Compose files, Kubernetes manifests, and other ecosystems' `.lock` files such as `Cargo.lock` or `flake.lock` — receive no diagnostics; the daemon never reports on foreign files.

**Each request names the Release it is about, and the daemon keeps none of its own.** The semantic checks resolve that Release's dependency closure and read that Release's lockfile for its pins, so two requests naming two Releases are answered about the Release each one named. Nothing carries over between them: there is no selected Release to change, and changing which Release you validate against is a different value on the next request rather than anything the daemon has to be told to forget.

**Naming a Release is optional, and the answer says which of the two you asked for.** Name one and you get everything above. Name none and you get the checks a document answers for by itself — whether it parses, and whether its own shape is admissible — with no Release resolved, no closure walked and no lockfile read; the reply then carries `checked: "document"`. Name a Release and that key is absent, because that answer is the method's full verdict and has nothing to qualify.

Read the key rather than inferring from the diagnostics, because the two answers can look identical. A well-formed document validated without a Release replies with an empty diagnostic list, which is exactly what a clean full verdict replies with, so `checked` is the only thing separating "nothing is wrong" from "nothing that needs a Release was looked at". One consequence follows from the same rule: a lockfile is recognized by its correlation to the Release the request named, so a request naming none recognizes no lockfile and reports nothing on one.

**A workspace that holds no Release is answered rather than refused, and that is what keeps the rest of the daemon usable there.** Validation is what seeds the parse cache every other file operation reads, so a catalog-only repository, a single-Aggregate scaffold or a scratch directory still gets hover, completion, go-to-definition, references, implementations and cached diagnostics. Refusing instead would take all of them with it, in exactly the workspaces where a client has no Release to name.

### What a diagnostic entry carries

Each entry positions itself with `line` and `column`, both 1-based in the position encoding negotiated at the handshake, and adds `end_line` and `end_column` when it spans a whole token. `message` is the text a client shows the user, `severity` classifies it, and `source` names which of the daemon's two layers raised it, as described above.

`code` is a stable, machine-matchable code for what the entry reports, so a client can branch on it without matching the message text. **One key carries the code whoever assigned it**, and `source` tells you which kind you are holding, because the two layers name things from different vocabularies.

- On an `aggrega` entry — a finding about the authored documents — the code is the string the condition is registered under, written as the declaring package and then the rule in kebab-case. It is the same value a Go consumer reads with `CodeOf`, whose form and matchable surface are described in [the error-sentinels reference](../errors/sentinels.md).
- On an `aggrega-build` entry — an advisory a render raised — the code is the advisory's own class code, such as `unsupported-field`, assigned wherever that advisory was raised, whether that is a rendering plugin or the render itself. The code names what the finding is and not who found it, so a single class reaches you under one code however many places raise it. A class code names a class of advisory rather than a registered condition, so it has no row in the sentinel reference; [the warnings reference](../errors/warnings.md) describes the `unsupported-field` class and the flag that silences it.

Either way the key answers one question — what is this, in terms a machine can match — so an editor extension that highlights, groups, or suppresses one class of finding keys on the code, and keeps working when the wording of a message changes.

Note which object carries which: this is a **string** on a diagnostic entry, distinct from the **numeric** `code` on a JSON-RPC error envelope described under [Error codes](#error-codes) below. A response carries one or the other, never both in one place.

The key is **omitted** where nothing that produced the entry assigned a code, and both kinds have that case. A buffer no YAML parser will read reports the parser's own text and no code, because no condition of Aggrega's own stands behind it; a stage that reports a failure without naming a condition likewise has none to report; and an advisory whose raiser assigned no code arrives without one. So treat `code` as optional, the same way `end_line` and `end_column` are, and branch on it only when it is present. A code is what a diagnostic reports and never what selects one: no request takes a code, and writing one back into your own code gives you a string rather than a way to match.

## How an entity is addressed

Every entity a response names carries the same identity: `kind`, `name`, `file` and `origin`. Join on it against `aggrega/catalogIndex` for anything you want to display, so the describing fields live in one place and two responses cannot disagree about the same entity.

`origin` says where the daemon read the entity from, and it is what makes `file` readable.

- `workspace` — an Aggrega document under the workspace root. `file` is its path relative to that root, which is a path your client can open.
- `catalog` — an entity resolved from the configured catalog directories. `file` is empty, and the `name` is the whole address. It is empty because the only path such an entity has is an absolute path on the machine the daemon runs on: it would mean nothing on your side of the connection, and publishing it would disclose that machine's layout for no gain. `name` is the coordinate an Aggregate, a Recipe and the catalog lookup all use anyway.

Read the two together rather than testing `file` alone. An empty `file` on its own could not tell you whether the entity has no workspace path or whether one was simply not reported; `origin` answers that directly.

Where a Feature is reachable both ways — the workspace root is itself one of the configured catalog directories, which is a common layout — it is reported once, as the workspace document, because that is the copy whose file you can open.

## What an attach-candidate response tells you

`aggrega/attachCandidates` answers for a node, and there are two kinds of node. Send exactly one coordinate; sending both, or neither, is refused rather than ranked.

**`{node}` addresses a workspace document** by its `metadata.name` and needs nothing else. The match is evaluated against the labels that document declares at `metadata.labels`, and the response reports `labelSource: "declared"`.

**`{graphNode, release}` addresses a node on a compiled graph.** `graphNode` is the id the graph keys the node under — the same id you read from `aggrega/irGraph`, including the qualified form a node contributed by a sub-aggregate carries. `release` is a path relative to the workspace root, naming the Release whose graph to build, the same value `aggrega/irGraph` takes. The match is evaluated against the node's finalised labels, and the response reports `labelSource: "resolved"`.

**The two coordinates are separate because the two identifier spaces overlap.** A graph node id and a document's `metadata.name` can be the same string while naming different things, so one parameter carrying both would be ambiguous, and a daemon that guessed which space you meant would sometimes answer confidently for the wrong subject. Saying which question you are asking is what removes the ambiguity.

**`labelSource` tells you how far the answer reaches, and the two values are not interchangeable.** `declared` is a match over what a document says about itself, which is what a read over source can see. `resolved` is a match over the labels the node actually ends up with, which is what a build evaluates applicability against — so a `resolved` answer is a statement about what a build would decide, and a `declared` answer is not a promise about a node whose labels are contributed by a composition or a Release.

**Candidates come from the workspace and from the catalog.** A workspace that keeps its Features in a catalog rather than in its own tree has no local Feature at all, and its candidates are entirely `origin: "catalog"`. A Feature that declares no applicability at all is a candidate for every node — an absent declaration states no requirement — while one whose declaration cannot be read is a candidate for none, because treating an unreadable selector as satisfied would let a typo widen what you offer.

**A coordinate that does not resolve is an error, not an empty list.** Those two answers mean different things: an empty `candidates` array says this node has nothing that may attach to it, and reporting a mistyped name that way would present a typo as a settled answer. The refusal names the space it searched, so you know whether to look for a workspace document or a graph node.

**The graph-node coordinate needs a lockfile; the workspace coordinate does not.** Building a graph means resolving what the Release reaches, so that path refuses with the lockfile-absent error when none has been generated, naming the command to run — the same precondition `aggrega/irGraph` carries, for the same reason. Addressing a workspace document builds no graph and answers on a workspace nobody has prepared yet.

**It reports and never creates.** The method mutates nothing, writes nothing, and creates no attachment. Composing and applying any edit is the editor's, which is where the buffer and the undo history are.

**What it resolves depends on the coordinate, and the two are not the same.** `{node}` resolves nothing and reaches no registry or network — the candidates come from the workspace and from the catalog directories, both already on disk. `{graphNode, release}` builds the Release's graph, so it resolves that Release's dependency closure the same way `aggrega/irGraph` does: from the local catalog directories and the content-addressed cache first, and from the configured registry for an entity neither of those carries. Both answer offline for a workspace whose entities are all local; only the graph-node coordinate can go looking further.

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

For the entity identities in `targets` — `kind`, `name`, `file` and `origin` — join against `aggrega/catalogIndex` as described in [How an entity is addressed](#how-an-entity-is-addressed). The describing fields are reported there and deliberately not repeated here, so the two responses cannot disagree about the same entity. Targets are workspace Components, so each carries `origin: "workspace"`.

## What the effective-configuration response covers

`aggrega/effectiveConfiguration` answers two questions: what configuration applies in this session, and which layer decided each setting. It is the same answer [`aggrega config show --origin`](aggrega-config.md) prints, computed once and reported on both surfaces, so the two cannot disagree about where a setting came from.

**A `source` is one of three shapes.** A config file's absolute path; an environment variable behind an `env:` prefix, such as `env:AGGREGA_SIGNING_REQUIRED`; or `(built-in defaults)` for a setting no layer changed. The first two appear verbatim in `layers`. The defaults do not, because the defaults are not a layer that contributed — they are what applies where no layer spoke.

**The attributed set is narrower than the configuration schema. Do not read this response as covering every setting.** The settings it reports are a fixed list, and the schema declares more than that list names. A setting can be real, documented, and carry a default while appearing nowhere in `settings` — the compiled-module cache size is one such setting today. So a client looks a setting up by name and handles its absence; it must not infer that a setting missing from the response is unset, nor present the response to a user as the whole of their configuration.

**Two further bounds, each of which makes an answer coarser than it looks.**

- **A list or map setting is attributed as a whole**, to the layer that last changed it. Per-entry attribution is not tracked, so a list assembled from two layers reports only the later one, and an entry contributed by an earlier layer is not distinguishable from one the later layer wrote.
- **The signing requirement is attributed to the *first* layer that turned it on**, not the last that mentioned it. That setting composes so that any layer switching it on wins and no later layer can switch it off, so the first layer to turn it on is the one that made the effective value what it is.

**Every reported value is the session's own resolution, read when the daemon started.** Editing a config file does not change a value here; restarting the daemon does. That is deliberate — the values are the configuration the daemon is itself acting on, which is what makes them comparable with the workspace root and configuration layer the handshake reported. A client showing configuration alongside a file the user is editing should say which of the two it is showing.

**The layer attribution is worked out when you ask, against the files as they stand.** So a config file edited during a session can move a `source` while the value beside it stays as the daemon resolved it. The two halves answer different questions — what is in force, and which layer decided it — and only the first is frozen at startup. Restart the daemon to bring them back into step.

**It reports and never writes.** The method changes no configuration, creates no file, and resolves nothing from a registry or the network.

**Single-layer file contents are not served here.** The command line can print one layer's own bytes verbatim, comments and formatting preserved; this method reports the resolution rather than the bytes. A client wanting a layer's text has the path in `layers` and can open it.

## Cache model

Operations are cache-driven: call `aggrega/validate` for a file before `hover` / `completion` / `resolve` / `diagnostics` on it. That seeding call does not need a Release — a validation naming none still parses the buffer and populates the cache — so these operations work in a workspace that has no Release to name. The parse cache is checked against each file's on-disk modification time on every read, so external edits (an editor save, a `git checkout`) are picked up automatically — the editor's `aggrega/invalidate` is an optimization, not a correctness requirement.

## Workspace root and active Release

The daemon resolves its workspace the same way every `aggrega` command does. Discovery walks up from the working directory: a `.aggrega-config.yaml` carrying a `workspace:` block anchors the root, and failing that a heuristic marker does — an `.aggrega/` directory, then `aggregate*.yaml`, `release*.yaml`, or `manifest*.yaml`. A `.aggrega-config.yaml` *without* a `workspace:` block does not anchor; it still contributes its settings, but a bare settings file cannot turn every parent directory into a workspace root. `--workspace-root` overrides discovery. When no marker is found, the working directory is used — the daemon starts and operations simply resolve nothing, rather than refusing to run.

Configuration is a cascade. Every `.aggrega-config.yaml` from the workspace root down to the working directory contributes, with a nearer file overriding a farther one; beneath the tree, `$AGGREGA_CONFIG` (when set) supplies a base layer, and built-in defaults sit under that. The full precedence for the workspace root is: `--workspace-root`, then the nearest `workspace:`-marked config, then a heuristic marker, then the working directory.

**Operations that act on a Release take one as a parameter; the daemon selects none of its own.** A workspace still declares which Release it points at, and a four-step cascade reads that declaration: the `build.authoring_release` config field, then an `.aggrega/active-release` marker file, then a single-Release-in-the-workspace heuristic, then an Aggregate-only fallback. A marker you write therefore takes precedence over the heuristic, and a marker naming a Release that cannot be loaded falls through to the heuristic rather than to the fallback.

`aggrega/activeRelease` reports what that cascade chooses, and it is a suggestion for a client rather than a setting the daemon acts on. Ask the daemon rather than reading the cascade's inputs yourself: the config field and the marker file are two of four inputs, so whichever one you read names the workspace's choice only when it happens to be the input that won. A marker naming a Release that cannot be loaded is the clearest case — the cascade chooses a different Release entirely, and a reader of the marker would report the one that failed.

The cascade runs when you ask and not before, which has two consequences worth relying on. The handshake stays fast whatever the size of the tree, because it does not wait for the workspace walk. And the answer tracks the workspace: write a marker, edit the config, add or remove a Release file, then ask again, and you get the new answer from the same daemon. **Changing which Release you work on never requires restarting the daemon** — a client sends a different `release` on its next request.

The operations that search the whole workspace rather than one buffer — `completion`, `hover`, `resolve`, `findReferences` and `findImplementations` — enumerate the YAML under the workspace root, and that enumeration **honours `.gitignore`**. Every `.gitignore` from the workspace root down to the file's own directory contributes, with the nearest one winning, so a YAML file your repository ignores is not offered as a completion candidate and is not reported as a definition or a reference. Vendored trees and generated output therefore stay out of cross-file results without any separate exclusion setting to maintain — and a document you expect to be found but have ignored will not appear, which is the one case worth checking when a reference seems to be missing.

## Lockfile awareness

The daemon checks a lockfile for drift on each `aggrega/irGraph`, against the Release that request named, surfacing drift as a non-blocking warning. `aggrega/irGraph` requires a lockfile to be present. There is no separate check at startup: a request says which Release it is about, so the verdict is computed for that Release when it is asked for rather than once for one Release chosen in advance.

**`aggrega/irGraph` is the one operation that refuses rather than warns, and it is the only one.** Everywhere else — including `aggrega/validate` — a plugin the workspace has no recorded digest for is run anyway, with [a warning](../errors/warnings.md) saying nothing checked its bytes. A graph is different in kind: it is a picture a reader then reasons about, and one built from unverified bytes would be drawn exactly like one that was checked, with the warning sitting somewhere the reader is not looking. So the handler stops before it resolves anything and answers `lockfile-absent`, naming the lockfile it looked for and the Release, so a client can offer `aggrega pull --release <release>` directly.

**`aggrega/validate`, when a request names a Release, reads that Release's lockfile for its pins and its deprecation notices only.** It does not hold the plugins it runs to the recorded digests, and it does not rebuild the transform-plugin attachment set from the lockfile — it validates against the workspace configuration as it stands in front of you, which is what an editor has to do while you are editing that configuration. `aggrega validate` and `aggrega build` do both, and remain the authoritative surfaces for a verdict about a committed workspace.

## Error codes

Responses use the standard JSON-RPC error codes plus an application-level range in the 1xxx band: file-not-validated, lockfile-absent, entity-not-resolvable, and shutting-down. An editor client can branch on the code without parsing the message. The two bands mean different things to a client: a 1xxx code names a state of the workspace the user can act on — validate the file, generate the lockfile — while a standard code such as invalid-params names a malformed request, which the client corrects rather than the user. A `release` value that is present but malformed — absolute, or resolving outside the workspace root — falls in the second band: the workspace is not in a state the user has to repair, the request is. Omitting `release` is in neither band, because it is not an error at all; it selects the narrower of the two answers described under [Live validation](#live-validation).

An error may carry a `data` object, and every key in it names one thing and only that thing. `file` is the source document that the accompanying `line` and `column` locate — the document being validated, or the Release whose load failed. `lockfile` is a lockfile. `release` is the Release the error is about, spelled the way the request named it, so a client can compose `aggrega pull --release <release>` without parsing it back out of the message. Every key is optional and present only when the daemon has that value in hand; none stands in for another, so what a key points at never depends on the code beside it.

The account of how the workspace's Release cascade ran travels on the `aggrega/activeRelease` answer, in its `trace` field, rather than on an error: a workspace that points at no Release is an ordinary state rather than a failed request. **It is diagnostic prose written for a person to read, not a structure to parse.** Show it as it stands — write it to a log, or into a panel the user can open — and do not match patterns against it, lift values out of it, or branch on the labels it uses: its wording, its layout and those labels track the cascade itself and change whenever the cascade does. A client that passes the text through keeps working across such a change; one that has learned its shape breaks on it.

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
| `--build-on-inspect` | `false` | Run the artifact-rendering stage while inspecting an IR graph, so the advisories aggrega build raises while rendering also appear as editor problems. It adds none of the checks a build halts on, so the editor still draws a graph where a build would refuse. Nothing is written to disk: no rendered artifacts, no output directory, no lockfile. Off by default, matching aggrega inspect, which raises no such advisory either. When set, overrides the serve.build_on_inspect config key. |
<!-- END GENERATED: cli-serve -->
