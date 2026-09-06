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
- `aggrega/resolveDependencies {release, upgrade?, targets?, verify?}` — resolve the Release's catalog and source dependencies into the cache and write its lockfile. `release` is a path relative to the workspace root, the same value `aggrega/irGraph` takes and refused in the same shapes. `upgrade` discards the recorded pins and re-resolves, floating each dependency to the highest available version; `targets` narrows that to the entity references it names, holding every other pin. `verify` checks the recorded resolution against what resolves today and writes nothing at all, answering `verified: true` and the `toolchain` the lockfile records. The answer names the `lockfile` it wrote and every reference it pinned, in `entities`, `libraries` and `plugins`, alongside `sourceArtifacts`, `trustedPlugins`, and any `notices` the resolution raised. There is no catalog-directory parameter: the search stack is the one the workspace configures. This request reaches registries and writes — see [Reaching a registry, and writing](#reaching-a-registry-and-writing).
- `aggrega/acquireExternalInputs {release}` — pin the external inputs the Release's render consumes into the content-addressed store and record them in its lockfile. `release` carries the same contract as above. The answer names the `lockfile` and the inputs this call newly pinned, each as its `url`, `sha256` and `size`; an empty list is the ordinary answer for a Release whose inputs are already recorded. The rendered artifacts are discarded, so the workspace's output directory is untouched. This request reaches registries and writes — see [Reaching a registry, and writing](#reaching-a-registry-and-writing).
- `aggrega/cacheStatus` — what the on-disk caches hold: one entry per cached element with its size and, where it has one, its content digest, grouped by class. Takes no parameters. Each class carries a `reach` — `workspace` for the artifact cache under this workspace's own cache directory, `machine` for the compiled-module and plugin-describe stores every project on the machine shares — and `scope` names the machine-wide classes directly. It writes nothing. See [Reaching a registry, and writing](#reaching-a-registry-and-writing) for why the reach is on an answer that changes nothing.
- `aggrega/cachePrune`, `aggrega/cacheEvict {maxSize}`, `aggrega/cacheClear` — reclaim cached content. A prune removes what no workspace lockfile references; an eviction trims the compiled-module store to `maxSize`, a byte quantity spelled as the command line spells it (`5GiB`, `512MiB`, or a byte count); a clear wipes every cache this session addresses. Each answer names what it removed, with each removal carrying the `reach` of the class it came from, and each carries `scope`. **These reach beyond the workspace** — see [Reaching a registry, and writing](#reaching-a-registry-and-writing).
- `aggrega/registryList` — the registries this workspace is configured to reach: each entry's host, optional alias, whether it is the default, its trust posture as discrete fields, and whether a credential for that host is present. Takes no parameters. It contacts no registry. The credential state reports **presence only** — never the credential, never its shape, and never whether the registry would accept it, which would take a network round trip a listing does not make — and it is read from the machine-wide credential store, which `credentialStateIsMachineWide` says outright.
- `aggrega/search {query?, kinds?, selector?, capabilities?, pluginType?, registry?, limit?, includeRetracted?}` — search the local index of the configured registries. Every field narrows and every one is optional, so an empty params object asks for everything the index holds. It contacts no network: the index is the offline snapshot written under this workspace's own cache directory. The reported version is the one a resolution would take — a version whose retraction carries a signature this workspace trusts is excluded and named in `retracted` — and the answer carries its own provenance: `indexes` gives each searched registry's snapshot age, `stale` marks one worth refreshing, and `missingIndexHosts` names configured registries with no local index, whose contents are therefore absent from the answer.
- `aggrega/registryAdd {host, name?, identities?, keyPath?, trustedRoot?, requireSignatures?, advisory?, fetchTrust?, global?, workspace?}` — register a registry and its signature trust policy. `host` is required; everything else shapes the policy or the write target. `fetchTrust` defaults to **true** when the key is absent, matching the command line, and takes the registry's own advertised policy on first contact; `trust` in the answer says which of three things happened — the policy was pinned, the registry advertised none, or no fetch was attempted. **This writes the machine-wide configuration by default** — see [Reaching a registry, and writing](#reaching-a-registry-and-writing).
- `aggrega/registryRemove {registry, global?, workspace?}` — drop a registry's entry, addressed by host or friendly alias. A token matching nothing is refused rather than answered as a success over an unchanged configuration. **This writes the machine-wide configuration by default** — see [Reaching a registry, and writing](#reaching-a-registry-and-writing).
- `aggrega/registryUpdate {registry?, upgrade?}` — refresh the local searchable index `aggrega/search` reads. An absent `registry` refreshes every configured one; naming one refreshes only that registry. `upgrade` ignores the cached revalidation and re-reads every repository, which picks up a change a conditional refresh skips — a deprecation marker added to a version whose digest did not move. The answer carries each host's record count, the repositories it could not read, the deprecation markers it met, and `indexRoot`, the directory under this workspace's own cache the indexes were written to. **This reaches every registry it refreshes** — see [Reaching a registry, and writing](#reaching-a-registry-and-writing).
- `aggrega/publishEntity {entity, registry?, dryRun?, sign?, plugin?, identityToken?, fulcioUrl?, rekorUrl?, timestampUrl?}` — bundle a catalog entity and publish it to a registry. `entity` is a path relative to the workspace root naming the document to publish, refused in the same three shapes `release` is — absent, absolute, or resolving outside the root. A Plugin entity also needs `plugin`, the same kind of path, naming the executable published inside the entity's own manifest. `registry` is the destination and defaults to the workspace's configured one. `dryRun` computes the bundle and contacts nothing. Omitting `sign` follows the destination registry's own policy, which is what the command line does when its flag is absent, while sending it is the caller's choice — and neither relaxes the refusal, because a registry or workspace policy that requires a signature refuses an unsigned publication whatever the field says. The answer carries `reference`, `tag`, `kind`, `mediaType`, the `size` pair, the published `digest`, `signed`, `alreadyPublished`, `dryRun` and `reach`. **This writes to a registry and reaches past this machine** — see [Reaching a registry, and writing](#reaching-a-registry-and-writing).
- `aggrega/publishArtifact {file, name, tag, mediaType?, registry?, dryRun?}` — publish a standalone data artifact, such as a documentation bundle. `file` is a path relative to the workspace root, carrying the same contract, and its bytes are published verbatim: no entity envelope is parsed and no kind is dispatched on. `name` and `tag` name what it is published as, and both are required. `mediaType` defaults to the documentation-bundle type. The answer carries `reference`, `tag`, `mediaType`, the `size` pair, the published `digest`, `alreadyPublished`, `dryRun` and `reach`. It signs nothing — a published artifact is signed afterwards by reference with `aggrega/signArtifacts`, which needs only the reference this answer reports. **This writes to a registry and reaches past this machine** — see [Reaching a registry, and writing](#reaching-a-registry-and-writing).
- `aggrega/signArtifacts {references, identityToken?, fulcioUrl?, rekorUrl?, timestampUrl?}` — sign already-published artifacts and attach each signature. `references` carries one or more registry addresses rather than paths, so they take no workspace-relative contract; an empty list, or an empty entry in it, is refused. One identity serves the whole batch and is resolved before any reference is signed, so a batch with no credential available at all refuses at the start rather than partway through. Signing a reference nothing published is refused rather than attached to nothing. The answer carries `signed`, each entry naming a `reference` and the published `digest` its signature commits to, alongside `reach`; a batch in which any reference failed is answered as a failure naming each one rather than as a result with a short list. **This writes to a registry and reaches past this machine** — see [Reaching a registry, and writing](#reaching-a-registry-and-writing).
- `aggrega/deprecateArtifact {reference, severity, reason, replacement?, message?}` or `{from}` — attach a signed deprecation marker to an already-published artifact. Send either a single `reference` with its `severity` and `reason`, or `from` naming a batch file relative to the workspace root — sending both is refused. The content fields are required rather than prompted for: nobody is watching this stream, so a request missing one is refused naming what to send. The same keyless inputs the two signing requests take apply here, because the marker is signed by its own digest. The answer carries `marked`, each entry naming the `reference` withdrawn, its `severity`, the `issuedOn` stamp and the marker's own manifest `digest` — the marker is attached as an untagged referrer of the artifact it withdraws, so nothing else addresses it — alongside `reach`. **This writes to a registry and reaches past this machine** — see [Reaching a registry, and writing](#reaching-a-registry-and-writing).
- `aggrega/catalogIndex` — the entity index: the `kind`, `name`, `apiVersion`, `description`, `labels`, source file and `origin` of every entity the daemon can see. Takes no parameters: the set is a property of the workspace root and the catalog directories the daemon resolved. It spans both places an entity comes from — the Aggrega documents under the workspace root, and the Features the configured catalog directories carry — because this is the surface a client joins against when it needs an entity's descriptive fields, and an index that knew only one of the two would leave part of every candidate list unresolvable. A workspace document counts as an entity when it declares both a `kind:` and a `metadata.name`, so foreign YAML that happens to sit in the tree — a chart's values file, a CI configuration — is skipped rather than listed. See [How an entity is addressed](#how-an-entity-is-addressed) for what `origin` and an empty `file` mean.
- `aggrega/entityDefinition {name}` — what the named entity resolves to: its `kind`, its own `name` and `version`, and its `definition` as a YAML document with inheritance already applied. `name` is an entity's identity, written the way one entity references another, and it may carry a version suffix. This is the only request here that starts from a name rather than from a cursor, so it is what to ask when you already know which entity you mean. A name that resolves to nothing is refused rather than answered with an empty document; see [Telling the two by-name refusals apart](#telling-the-two-by-name-refusals-apart).
- `aggrega/releaseClosure {release}` — a Release's dependency closure: which entities it reaches and at which resolved versions, in `entities`, `libraries` and `plugins`, alongside the `aggregate` and `manifest` identities its two pointers resolved to. `release` is a path relative to the workspace root naming a Release inside it, the same value `aggrega/irGraph` takes and refused in the same shapes, and it requires a lockfile for the same reason. Nothing is rendered. See [A closure is not the graph](#a-closure-is-not-the-graph), because a client already receiving the graph does not have this.
- `aggrega/attachCandidates {node}`, `{graphNode, release}` or `{labels}` — which Features may attach to a node: the ones whose declared applicability the node's labels satisfy. Send exactly one coordinate. `node` names a workspace document by its `metadata.name`; `graphNode` names a node on the compiled graph of `release`, by the id that graph keys it under; `labels` carries a label set outright and names nothing, for a client that already holds one. The response repeats the coordinate it answered for — empty when there was none to repeat — carries `nodeLabels`, the label pairs the match was evaluated against, `labelSource` saying which kind of label set those are, and each candidate as the `kind`, `name`, source file and `origin` that address it. Carrying the labels back is what makes the answer auditable from itself: a client can explain why a Feature was offered without forming its own idea of the node's labels, which is how a client's answer and the compiler's come apart. See [What an attach-candidate response tells you](#what-an-attach-candidate-response-tells-you).
- `aggrega/connectionCandidates {node, socket?}` — what the named entity may connect to. `node` is an entity's `metadata.name`, the same coordinate `aggrega/attachCandidates` takes under that name. See [What a connection-candidate response tells you](#what-a-connection-candidate-response-tells-you) below, because the two halves of the answer are not equally complete and the response says which is which.
- `aggrega/insertionPoint {file, container}` — where in an authored document a new entry under a named container belongs, expressed so a client applies it without parsing the document itself. `file` names a document the workspace carries, relative to the workspace root or absolute; `container` is the structural path from the document root to the container the entry goes inside, each element a mapping key or a sequence position written in decimal. **You supply that path** — the daemon reads the document's own structure and never works out where something belongs from what it is called. See [What an insertion-point response tells you](#what-an-insertion-point-response-tells-you), because the position on its own is not enough to apply the edit.
- `aggrega/attachmentContainer {graphNode, release}` — which document a Feature attachment for a node belongs in, and which container inside it. `graphNode` names a node on the compiled graph of `release`, by the id that graph keys it under, and both are required: a node id is a key of one Release's graph and means nothing without it. The answer carries `node`, `file` and `container` — a list of segments in exactly the shape `aggrega/insertionPoint` takes, so the pair composes with nothing to work out in between. See [What an attachment-container response tells you](#what-an-attachment-container-response-tells-you), because `file` is part of the answer rather than something you already know.
- `aggrega/releaseCandidates` — the workspace's Release documents, as absolute paths. Takes no parameters: the set is a property of the workspace root the daemon resolved. Membership is decided by document kind — the file's `kind:` is `Release` — and not by filename, so a Release named without a conventional prefix is offered and a file merely named like one is not. This is what an editor's "which Release?" picker should list, because it is the same set the active-Release cascade below chooses from.
- `aggrega/activeRelease` — which Release this workspace points at, as an absolute path in a `release` field, for a client deciding what to select by default. Takes no parameters. The field is always present, and an empty value means the workspace points at none — a successful answer rather than an error, so a client that refreshes this on every daemon restart is not made to treat an ordinary workspace as a failure. When the value is empty the answer also carries `reason`, a one-line summary of what the cascade looked for, and `trace`, the per-step account of it; both are omitted when a Release resolved. Ask for it rather than working the answer out from one of the cascade's inputs: an input the cascade did not end up using names a different Release than the one it chose. The answer is computed when you ask, so asking again after writing a marker, editing the configuration or adding a Release file reports the new answer rather than the workspace as it stood when the daemon started.
- `aggrega/effectiveConfiguration` — the configuration in force for this session, and the layer each setting came from. Takes no parameters: the answer is a property of the workspace the daemon resolved when it started. `layers` lists the config files and environment overrides that contributed, lowest precedence first; `settings` carries each attributed setting as its dotted name, its effective value, and the `source` that determined it. A `source` is spelled exactly as the matching entry in `layers`, so the two join directly. See [What the effective-configuration response covers](#what-the-effective-configuration-response-covers), because the attributed set is narrower than the configuration schema and a client that reads it as complete will be wrong.
- `aggrega/getSchema {kind?}` — the JSON Schema for an entity or contract kind, read from the copy compiled into the running binary. `kind` is the lowercase-hyphenated schema token — `component`, `aggregate`, `release`, `recipe`, `ir`, `wasm-provider`, and so on — and it is optional, because it selects which of two questions you are asking. Name a kind and the response carries `kind` and `schema`, the schema as a JSON document rather than as a string holding one. Name none and the response carries `kinds` instead: every token this binary can be asked for, in the same order [`aggrega get-schema --list`](aggrega-get-schema.md) prints them, which is how a client learns the vocabulary before it asks for a schema. The two answers are never combined, so which question was answered is readable from the response. A token no schema answers to is refused with the whole valid set in the message, so a typo is corrected without a second call. It takes nothing from the workspace, contacts no registry and writes nothing, so it answers in a workspace holding nothing at all — which is what makes it usable for wiring an editor's schema association against the binary the editor is actually driving, rather than against whichever copy of the schemas is installed elsewhere.
- `aggrega/scaffoldEntity {kind, name?}` — a starter document for an entity kind: exactly the fields that kind's schema requires, with the fixed `apiVersion` and `kind` filled in and a placeholder everywhere a value is needed. `kind` is required and is the lowercase-hyphenated schema token — `component`, `aggregate`, `release`, `recipe`, `manifest`, `feature`, and so on; `aggrega/getSchema` with no `kind` reports the whole set, and a token no schema answers to is refused with that set in the message so a typo is corrected without a second call. `name` is optional and seeds `metadata.name` for kinds whose schema requires one. The response carries `kind` and `skeleton`. See [What a scaffold response gives you](#what-a-scaffold-response-gives-you), because the answer is a document to write and not a document that was written. The skeleton is derived from the same schema `aggrega/getSchema` reports, so the two answer from one source.
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

Every entity a response names is addressed the same way: `kind`, `name` and `file`. Join on those three against `aggrega/catalogIndex` for anything you want to display, so the describing fields live in one place and two responses cannot disagree about the same entity.

Where a response can name entities from more than one place, each identity carries `origin` beside those three keys. `aggrega/catalogIndex` and `aggrega/attachCandidates` both do, because their entities come from the workspace documents and from the configured catalog directories. A response drawing on one place only reports the three keys and no `origin`, since a key with one possible value tells you nothing — every entity such a response names is a workspace document, and its `file` is a workspace-relative path you can open. So read `origin` where it is present rather than requiring it everywhere; the three keys are what you join on either way.

`origin` says where the daemon read the entity from, and it is what makes `file` readable.

- `workspace` — an Aggrega document under the workspace root. `file` is its path relative to that root, which is a path your client can open.
- `catalog` — an entity resolved from the configured catalog directories. `file` is empty, and the `name` is the whole address. It is empty because the only path such an entity has is an absolute path on the machine the daemon runs on: it would mean nothing on your side of the connection, and publishing it would disclose that machine's layout for no gain. `name` is the coordinate an Aggregate, a Recipe and the catalog lookup all use anyway.

Read the two together rather than testing `file` alone. An empty `file` on its own could not tell you whether the entity has no workspace path or whether one was simply not reported; `origin` answers that directly.

Where a Feature is reachable both ways — the workspace root is itself one of the configured catalog directories, which is a common layout — it is reported once, as the workspace document, because that is the copy whose file you can open.

## What an attach-candidate response tells you

`aggrega/attachCandidates` answers a single question — which Features does this label set admit — and offers three ways to say which label set you mean. Send exactly one coordinate; sending two, or none, is refused rather than ranked.

**`{node}` addresses a workspace document** by its `metadata.name` and needs nothing else. The match is evaluated against the labels that document declares at `metadata.labels`, and the response reports `labelSource: "declared"`.

**`{graphNode, release}` addresses a node on a compiled graph.** `graphNode` is the id the graph keys the node under — the same id you read from `aggrega/irGraph`, including the qualified form a node contributed by a sub-aggregate carries. `release` is a path relative to the workspace root, naming the Release whose graph to build, the same value `aggrega/irGraph` takes. The match is evaluated against the node's finalised labels, and the response reports `labelSource: "resolved"`.

**`{labels}` carries the label set itself and addresses nothing.** It is the shape underneath the other two: the match is a function of a label set and the Features on offer, so a client that already holds a label set has nothing to name and nothing to wait for. Send a JSON object of label pairs; the response reports `labelSource: "supplied"` and an empty `node`, because this request addressed none. An empty object is a coordinate — it asks about a node carrying no labels — while omitting the key entirely, or sending `null`, addresses nothing and is refused.

**The two name coordinates are separate because their identifier spaces overlap.** A graph node id and a document's `metadata.name` can be the same string while naming different things, so one parameter carrying both would be ambiguous, and a daemon that guessed which space you meant would sometimes answer confidently for the wrong subject. Saying which question you are asking is what removes the ambiguity.

**`labelSource` tells you how far the answer reaches, and the three values are not interchangeable.** `declared` is a match over what one document says about itself, which is what a read over source can see. `resolved` is a match over the labels the node actually ends up with, which is what a build evaluates applicability against — so a `resolved` answer is a statement about what a build would decide, and a `declared` answer is not. `supplied` says the daemon read no labels at all and matched what you sent; how strong that answer is depends entirely on where your label set came from.

**Which is why a client holding a graph should send `{labels}` rather than a name.** A node's finalised labels are the labels of the component **type** it resolves to, not of a document that happens to share its id, and a `label-transform` attachment may then add to, change or remove them — so the labels deciding a node's applicability need not be the labels any one document declares. A client drawing a graph already has that set from `aggrega/irGraph`; passing it back reaches the same answer the `{graphNode, release}` coordinate gives, without rebuilding the graph to get it. Pass back a set the daemon itself reported — a node's from `aggrega/irGraph`, an entity's from `aggrega/catalogIndex` — and your idea of a node's labels cannot drift from the daemon's, because the set never left its own answer. Assemble one yourself and you are asking a hypothetical, which is answered honestly and is not a statement about any node the workspace holds.

**Candidates come from the workspace and from the catalog.** A workspace that keeps its Features in a catalog rather than in its own tree has no local Feature at all, and its candidates are entirely `origin: "catalog"`. A Feature that declares no applicability at all is a candidate for every node — an absent declaration states no requirement — while one whose declaration cannot be read is a candidate for none, because treating an unreadable selector as satisfied would let a typo widen what you offer.

**A name that does not resolve is an error, not an empty list.** Those two answers mean different things: an empty `candidates` array says this node has nothing that may attach to it, and reporting a mistyped name that way would present a typo as a settled answer. The refusal names the space it searched, so you know whether to look for a workspace document or a graph node. `{labels}` has no such hazard — there is no name to have typed wrongly — so a label set nothing admits comes back as a successful response carrying an empty array, and a request the daemon cannot read is still refused before any matching runs.

**The graph-node coordinate needs a lockfile; the other two do not.** Building a graph means resolving what the Release reaches, so that path refuses with the lockfile-absent error when none has been generated, naming the command to run — the same precondition `aggrega/irGraph` carries, for the same reason. Addressing a workspace document builds no graph, and supplying a label set builds nothing at all, so both answer on a workspace nobody has prepared yet.

**It reports and never creates.** The method mutates nothing, writes nothing, and creates no attachment. Composing and applying any edit is the editor's, which is where the buffer and the undo history are.

**What it resolves depends on the coordinate, and the three are not the same.** `{node}` resolves nothing and reaches no registry or network — the candidates come from the workspace and from the catalog directories, both already on disk. `{labels}` resolves less still: it looks nothing up, because there is nothing to look up. `{graphNode, release}` builds the Release's graph, so it resolves that Release's dependency closure the same way `aggrega/irGraph` does: from the local catalog directories and the content-addressed cache first, and from the configured registry for an entity neither of those carries. All three answer offline for a workspace whose entities are all local; only the graph-node coordinate can go looking further.

## What a connection-candidate response tells you

`aggrega/connectionCandidates` answers two questions at once, and only one of them has a complete answer. Reading the response as a single filtered list gets the other one wrong.

Each reported socket carries `targets` — the workspace-local Components whose declared labels satisfy the label constraint that socket declares over what may satisfy it — plus the `selector` those targets were computed from, the `required` flag the socket declares, and `declaration`. `targets` is always an array, empty rather than absent, so a socket nothing satisfies is still reported as a socket the entity declares.

**The target half is complete.** The set is decided by evaluating the socket's declared constraint against a candidate's declared labels, the same evaluation a build performs, so what you offer is what the same constraint admits during a build. A socket declaring no constraint leaves its targets unconstrained and reports every Component — that is the constraint language's meaning for an empty selector, not an error.

**The socket half is open, and `declaration` plus `adHocSocketsAccepted` are how you tell.** A Component's author owns their application's topology and may wire a socket the component's catalog entity never declared, so the sockets an entity declares are a helpful starting set and **not** the set of legal socket names. Present them as suggestions, not as the only choices — a picker that only offered declared sockets would tell the author their freedom is narrower than it is.

- `declaration` is `declared` when the addressed entity lists the socket in its `usesSchema`, and `ad-hoc` when it does not. These are the same two values an edge carries in the IR graph, so one vocabulary answers "where did this socket come from" wherever you meet the question.
- `adHocSocketsAccepted` reports whether the addressed entity's surface accepts a socket its own declaration does not list. It is **not** always true: a Component's own dependency surface accepts one, and a Feature's attachment surface does not, because an attachment participates in the topology the attached Feature declares rather than authoring its own. An ad-hoc socket on a surface that does not accept one is reported with no targets, because no connection through it would build.

Naming a `socket` in the request scopes the answer to that one socket, and it is the only way to ask about a socket the entity does not declare — an undeclared socket appears in no declaration to enumerate. Omit it to get every socket the entity declares, in the order they are authored.

**What it reports is a match over declared labels.** A build evaluates a socket's constraint against the finalised labels of the node at the far end of the edge, and those are the labels of the component **type** that node resolves to, after any `label-transform` attachment has had its say — not necessarily the labels of the document you named. So a positive answer here is not a promise about what a build will decide — the same bound `aggrega/attachCandidates` carries under its `declared` label source.

**It reports and never creates.** The method resolves nothing, reaches no registry or network, and writes nothing: it creates no edge and proposes no text. Composing and applying the edit is the editor's, which is where the buffer and the undo history are.

For the entity identities in `targets` — `kind`, `name` and `file` — join against `aggrega/catalogIndex` as described in [How an entity is addressed](#how-an-entity-is-addressed). The describing fields are reported there and deliberately not repeated here, so the two responses cannot disagree about the same entity. Targets are workspace Components, so every one has a `file` you can open and none carries an `origin`: this response draws on a single place, and the join is on the three keys.

## What an attachment-container response tells you

`aggrega/attachmentContainer` sits between the candidate requests above and the insertion point below. Those say *what* may attach to a node; this says *which container* an attachment for it belongs in, and in which document; the next says *where in that document's bytes* the text goes.

**Ask for the container rather than composing it.** A node's id and the subsystem path enclosing it are both written with dots between their parts, and a dot is a legal character in a name an author types — so from outside the document there is no way to tell a structural dot from one inside a name. A client that assembled the path itself would produce something that reads correctly and addresses a key nobody wrote, and the edit that followed would create that key rather than being refused. The compiler composed both paths, so the compiler is what takes them apart.

**A node id carries no trace of its enclosing subsystem at all.** A component authored inside `subsystems.billing.subsystems.payments` is keyed on the graph as `ledger`, exactly as a top-level component would be, so there is nothing in the id for a client to work from however carefully it splits.

**The answer is three fields.**

- `node` repeats the node the answer is about, so a client with several requests outstanding pairs each answer with its question without keeping an order of its own.
- `file` is the document the node was authored in, workspace-relative. It is part of the answer rather than something you already know: a node an imported module contributed was authored in that module's own document under the name the module gave it, so both the file and the last segment of the container differ from anything the request named.
- `container` is the structural path from that document's root, as a list of segments — `["spec", "subsystems", "billing", "subsystems", "payments", "components", "ledger", "features"]`. Each level of an enclosing subsystem sits under the `subsystems` key again, which is how the document spells it. A component the author wrote at the top level names `["spec", "components", "checkout", "features"]` instead, because the scope such a component is compiled into is not one any file contains.

**It is a list of segments and never a joined string**, and that is the point of the shape. A joined path would have to be split again by whoever received it, which is the ambiguity above reintroduced one call later. Pass the list to `aggrega/insertionPoint` as its `container` unchanged.

**It reads structure and never meaning.** The answer is derived from the document the node was authored in, the scope it sits in, and the name the author typed. Nothing is read out of what a component is called, what type it carries or what any label says.

**It reports and never writes.** The method mutates nothing and writes nothing to any document. It creates no attachment, composes no text and applies no edit; it does not rule on *what* may attach, which is `aggrega/attachCandidates`.

**A request naming a node the graph does not carry is refused rather than answered.** Node ids are the graph's own keys — read them from the graph `aggrega/irGraph` returns — and a node an imported module contributed carries a qualified id. A node the graph records no document for is refused too: where an attachment belongs is a fact about a document, so a node with no document has no answer rather than an empty one.

**It requires a lockfile**, for the same reason `aggrega/irGraph` does: naming the container means building the Release's graph, and a graph built from bytes nothing vouches for would be reported exactly like one that was checked.

## What an insertion-point response tells you

`aggrega/insertionPoint` is the counterpart to the two candidate requests above. Those say *what* may attach or connect; this says *where* the text for it belongs in one particular document. It answers and stops there.

**You name the container; the daemon locates it.** `container` is a structural path from the document root — `["spec", "components", "web", "features"]` — and it is your statement of where an entry of this kind belongs in a document of this kind. The daemon does not derive that path from what an entity is called, what type it carries, or what it appears to mean. It reads the bytes the author wrote and reports which segments of the path this document already has, the columns its entries sit at, and the last line its innermost block reaches. So knowing *which key* stays with the caller, and knowing *where that key's entries go in this file* comes from here.

For a Feature attachment on a node of a compiled graph, the caller does not have to know that key by itself: ask [`aggrega/attachmentContainer`](#what-an-attachment-container-response-tells-you) for the document and the container, and pass both here unchanged.

**The answer is a zero-width position plus what you have to write around it.** `file` is the document, workspace-relative. `container` repeats the path you asked about, so a client with several requests outstanding pairs each answer with its question without keeping an order of its own. `position` inserts rather than replaces: nothing already in the document is overwritten or shifted.

- `precededByLineBreak` — begin the text you write with a line break. The position sits at the *end* of the line the new entry follows, which is in range whether or not the file ends in a newline and disturbs no byte already written. It is false only for a document carrying nothing to sit after, where you write from the start of the file.
- `missingContainerKeys` — the segments of the container path this document does not carry yet, outermost first. Each has to be written as a key of its own before the entry can go inside the innermost one. It is empty where the whole path is already there.
- `entryIndent` — the column the entry's own first line starts at, counted in spaces from the start of the line.
- `indentStep` — how much further each nesting level is indented.
- `indentStepMeasured` — whether that step was measured from this document's own nesting. Where it is false the document exhibits no nesting to measure and the step is a fallback, so a client that would rather impose its own knows it is free to.
- `entryShape` — `mapping` or `sequence`, read off what the container already holds, and `unknown` where the container is not there yet or holds nothing. `unknown` is not a failure: the document has not said what shape its entries take, so that choice is yours.

**Applying it.** Write a line break where `precededByLineBreak` is set. Then one line per `missingContainerKeys` entry, outermost first, each being the key followed by a colon — the first indented at `entryIndent` minus `indentStep` times the number of missing keys, and each next one `indentStep` further. Then the entry itself, indented at `entryIndent`. Where `missingContainerKeys` is empty the entry is the only line you write.

Read `missingContainerKeys` even when you expect the container to be there. A position applied without the keys that have to precede it produces a document that no longer parses, which is the one failure this answer must not read as absent.

**`position` counts from zero, unlike a diagnostic's.** Both `line` and `character` are 0-based, matching the LSP-shaped position values this protocol reuses, while the `line` and `column` on a diagnostic entry are 1-based as described under [What a diagnostic entry carries](#what-a-diagnostic-entry-carries). A client feeding one surface from the other converts between them.

**`positionEncoding` names the units `character` is measured in**, and it is the encoding negotiated at the handshake. It is reported on the answer rather than left implicit because a position whose units the caller has to guess is a position it cannot apply: offsets measured one way and applied into a buffer measured another corrupt the document at the first character outside ASCII.

**A request that does not address a place an entry can go is refused rather than answered.** Each of these is a state of the request rather than of the workspace, so it comes back with the standard invalid-params code and a retry changes nothing until `file` or `container` changes.

- The document was not named, is not inside the workspace, could not be read, or is not well-formed YAML — a document with no structure has no position to report.
- The container path names nothing: it carries no segments, or one of its segments is empty.
- The path runs through a value the document carries as a scalar. Nothing can be appended inside a scalar, and replacing it would be a rewrite rather than an insertion.
- The path reaches a collection the author wrote in flow style. Appending an entry to one rewrites bytes the author already wrote rather than adding a line, which is an edit and not a position.
- The path addresses a block sequence with something that is not one of its indices. A sequence's entries are addressed by position, so a name reaches nothing in one and no entry can be created to carry that name.

**It reads the buffer the editor is holding, not only the file on disk.** The session's parse cache is consulted first, so a position is reported against unsaved content where there is some, and against the file itself where the cache carries nothing for it.

**It reports and never writes.** The method mutates nothing, resolves nothing, reaches no registry or network, and writes nothing to any document. It does not compose the text of an entry and it does not apply one. Composing and applying the edit is the editor's, which is where the buffer and the undo history are.

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

## What a scaffold response gives you

`aggrega/scaffoldEntity` hands back text. `skeleton` is YAML for the kind you named: every field that kind's schema requires, in the order the schema declares them. A field the schema pins to a single fixed value arrives filled in — `apiVersion` and `kind` are the ones you will notice — `metadata.name` carries the `name` you sent, and every other required value arrives as a placeholder typed to what the schema declares there: an empty string, a zero, a false, an empty list, an empty mapping. `kind` repeats the token the document was derived for, so a client with several requests outstanding attributes an answer from the answer itself rather than keeping a correlation of its own.

**It writes nothing, and that is the part to design around.** The method creates no file, chooses no path and touches no directory. What you receive is a document to write, not a document that was written — so an editor puts the text into a new unsaved buffer the author can read, edit or discard, and the moment a new file reaches disk stays where the buffer and the undo history are. No other request takes this document and puts it somewhere on your behalf; deciding where a new document lives is the editor's.

**It resolves nothing, and it needs nothing of the workspace.** The document is derived from the schemas the binary carries, so the method reaches no registry and no network, consults no catalog and reads no file. It answers the same way in every workspace, including an empty directory with no Aggrega document in it yet — which is exactly the workspace an author starting their first document is sitting in, and where most other methods here would first want a document or a lockfile.

**The same request gives the same bytes wherever it is asked.** The document is produced by one computation shared with the other surfaces that offer this capability, so an editor and an assistant asked for the same kind and the same name show the author the same starting text.

**The skeleton is a correct shape, not a finished document.** It carries the required fields and nothing else: an optional field you want is one you add, and a placeholder left as it arrived is a value that will not pass validation. Fill the placeholders in, then run `aggrega/validate` on the buffer.

## Which question each entity request answers

Four requests here will tell you about an entity, and they are not interchangeable. Picking between them is a question of what you are holding when you ask.

**You are holding a cursor.** `aggrega/hover` and `aggrega/resolve` take a file and a position and work out which entity is meant from what is written there. They cover the reference shapes a document actually contains — an `extends` value, a component or feature type, a Recipe's `implements`, a Manifest's recipe references, a Release's two path pointers, a `uses` target, and an entity's own `metadata.name`. Reach for these when the user's cursor is the coordinate: the user is reading a document and wants to know what a reference points at.

**You are holding a name.** `aggrega/entityDefinition` takes the identity outright. Nothing has to be open, no position is involved, and the entity does not have to be mentioned anywhere the client can find. Reach for it when the user typed a name, picked one out of a list, or followed something your own client already knows the identity of — a hover requires you to first find somewhere the name is written, which is work you do not have to do.

**You are holding nothing yet.** `aggrega/catalogIndex` enumerates what the workspace holds, with the descriptive fields for each entity. Reach for it to populate a picker, then feed a chosen name to `aggrega/entityDefinition`.

**You are holding a Release.** `aggrega/releaseClosure` answers about a deployment rather than about one entity, and it is the section below.

The definition a by-name request returns is the entity **as resolved**, not as any one file declares it. A Component or Feature that extends a base comes back carrying that base's contract, which appears nowhere in the document that declares its name — so the answer is about what the entity is, and reading the file yourself would not give you the same thing.

It arrives as a YAML document rather than as structure inside the response, and that is deliberate: a schema pillar has several authoring shapes — content written out, a reference to a shared document, or the marker saying the content comes from a base — and the document reproduces whichever one resolution arrived at, in the author's own key order. Parse it as a document if you need its fields; show it as it stands if you are putting it in a panel.

### Telling the two by-name refusals apart

A name that resolves to nothing is refused rather than answered with an empty document, because an empty answer would report a typo as an entity with nothing to say about itself. There are two ways a name resolves to nothing, they call for different things from the reader, and **you tell them apart by what the error's `data` carries, not by reading the message**:

- **No `file` in `data`.** Nothing in the workspace declares that name and no catalog tier resolves it. This is almost always the request to correct — a typo, or a name from a catalog this workspace does not have on its search path.
- **A `file` in `data`.** A workspace document does declare that name, and the catalog still resolved nothing for it. The entity is written down and something refused it, which is a state of the workspace a person repairs. The message names the document and, when the catalog skipped files while loading, says which — because a file the load refused is the usual cause.

Both carry the entity-not-resolvable code, so branch on the presence of `file` rather than on the code.

## A closure is not the graph

`aggrega/irGraph` and `aggrega/releaseClosure` are derived from the same resolution of the same Release and answer different questions. A client already receiving the graph can reasonably assume it has this one too, and it does not.

**The graph says what the deployment looks like** — its nodes, the boundaries they sit in, what is wired to what, and the values and attachments each node carries. It is the picture.

**The closure says what was pulled in to build it, and at which versions.** Every entity the Release reaches, whether or not it became a node; the shared documents those entities draw on; and the plugins that shape the output. It is the bill of materials.

Neither is recoverable from the other. An entity can be reached without ever appearing as a node — the Recipe a Manifest maps a component type to is reached by every build and is a node in none of them — and a node does not carry the version its type resolved to. So a reader asking "why did this version move?", "what would changing this shared document affect?", or "what does this deployment actually depend on?" is asking for the closure, and a reader asking "what does this deployment look like?" is asking for the graph.

**What the closure request does not do.** It renders nothing and it publishes nothing. In particular it raises no drift warning and no render advisory: those belong to the request that asked for them, and publishing replaces a whole diagnostic layer, so a listing that published would erase what the graph request had already put in front of the user. Ask for the graph when you want the drift verdict.

**It requires a lockfile, like the graph does.** The versions the listing reports are the ones this Release resolved to, and a workspace nobody has prepared has not resolved them yet. A listing produced without one would report what the catalog happens to hold today, which is a different question from what this deployment depends on. The refusal names the lockfile and the Release, so a client can offer `aggrega pull --release <release>` directly.

**`kind` on a closure entry is present only where it is known.** A reference is collected from a position in a document, and some positions say what kind they point at while others do not. The field is reported where the reference site recorded one and omitted where it did not, rather than guessed from the shape of the name. It is reported as the word an author writes at the head of a document, which is the same word every surface reporting a closure uses for the same entry.

**The same word asks for the same document elsewhere.** `aggrega inspect <release> --closure` answers this question at the command line, and the release mode of the `describe` tool answers it over the assistant tool protocol. All three run one resolution over the Release, so they cannot come to disagree about what a deployment depends on. See [`aggrega inspect`](aggrega-inspect.md) "The dependency closure".

## Cache model

Operations are cache-driven: call `aggrega/validate` for a file before `hover` / `completion` / `resolve` / `diagnostics` on it. That seeding call does not need a Release — a validation naming none still parses the buffer and populates the cache — so these operations work in a workspace that has no Release to name. The parse cache is checked against each file's on-disk modification time on every read, so external edits (an editor save, a `git checkout`) are picked up automatically — the editor's `aggrega/invalidate` is an optimization, not a correctness requirement.

## Sizes in an answer

**An answer that reports a byte quantity reports it twice: as the number, and as the same quantity
written out.** The written field is the numeric field's name with `Text` appended — `size` and
`sizeText`, `totalSize` and `totalSizeText`, `reclaimedBytes` and `reclaimedBytesText`, and so on
through every answer that carries a size.

Display the written form and compute with the number. The point of sending both is that a client
never has to spell a size itself: the daemon writes it with the same formatter the command line uses,
so `aggrega cache status` and `aggrega/cacheStatus` show a given cache identically, down to the
rounding. A client that composed its own text would drift from that the first time it disagreed about
a boundary.

The written form uses binary units — `512 B`, `1.0 KiB`, `5.0 MiB`, `3.0 GiB` — which is the same
vocabulary `aggrega/cacheEvict` accepts in `maxSize`, so a size read out of one answer can be sent
back in the next request without being rewritten. Above bytes the text carries one decimal place, so
it names the quantity as a reader wants to see it rather than to the byte; when you need the exact
count, that is what the numeric field is for.

Where the number is optional the text is optional with it, and the two are never half-present: the
plugin size on a publish answer carries `pluginSize` and `pluginSizeText` together or carries
neither.

## Workspace root and active Release

The daemon resolves its workspace the same way every `aggrega` command does. Discovery walks up from the working directory: a `.aggrega-config.yaml` carrying a `workspace:` block anchors the root, and failing that a heuristic marker does — an `.aggrega/` directory, then `aggregate*.yaml`, `release*.yaml`, or `manifest*.yaml`. A `.aggrega-config.yaml` *without* a `workspace:` block does not anchor; it still contributes its settings, but a bare settings file cannot turn every parent directory into a workspace root. `--workspace-root` overrides discovery. When no marker is found, the working directory is used — the daemon starts and operations simply resolve nothing, rather than refusing to run.

Configuration is a cascade. Every `.aggrega-config.yaml` from the workspace root down to the working directory contributes, with a nearer file overriding a farther one; beneath the tree, `$AGGREGA_CONFIG` (when set) supplies a base layer, and built-in defaults sit under that. The full precedence for the workspace root is: `--workspace-root`, then the nearest `workspace:`-marked config, then a heuristic marker, then the working directory.

**Operations that act on a Release take one as a parameter; the daemon selects none of its own.** A workspace still declares which Release it points at, and a four-step cascade reads that declaration: the `build.authoring_release` config field, then an `.aggrega/active-release` marker file, then a single-Release-in-the-workspace heuristic, then an Aggregate-only fallback. A marker you write therefore takes precedence over the heuristic, and a marker naming a Release that cannot be loaded falls through to the heuristic rather than to the fallback.

`aggrega/activeRelease` reports what that cascade chooses, and it is a suggestion for a client rather than a setting the daemon acts on. Ask the daemon rather than reading the cascade's inputs yourself: the config field and the marker file are two of four inputs, so whichever one you read names the workspace's choice only when it happens to be the input that won. A marker naming a Release that cannot be loaded is the clearest case — the cascade chooses a different Release entirely, and a reader of the marker would report the one that failed.

The cascade runs when you ask and not before, which has two consequences worth relying on. The handshake stays fast whatever the size of the tree, because it does not wait for the workspace walk. And the answer tracks the workspace: write a marker, edit the config, add or remove a Release file, then ask again, and you get the new answer from the same daemon. **Changing which Release you work on never requires restarting the daemon** — a client sends a different `release` on its next request.

The operations that search the whole workspace rather than one buffer — `completion`, `hover`, `resolve`, `findReferences` and `findImplementations` — enumerate the YAML under the workspace root, and that enumeration **honours `.gitignore`**. Every `.gitignore` from the workspace root down to the file's own directory contributes, with the nearest one winning, so a YAML file your repository ignores is not offered as a completion candidate and is not reported as a definition or a reference. Vendored trees and generated output therefore stay out of cross-file results without any separate exclusion setting to maintain — and a document you expect to be found but have ignored will not appear, which is the one case worth checking when a reference seems to be missing.

## Reaching a registry, and writing

Most requests here answer from the workspace and from what is already cached, and write nothing. A
named few do more, and they divide along two independent axes: what a request **reaches**, and how
far what it **changes** carries.

**Seven requests go out to a registry, and they divide into the ones that read and the ones that
publish.** `aggrega/resolveDependencies` and `aggrega/acquireExternalInputs` fetch what a Release
needs; `aggrega/registryUpdate` walks every configured registry to rebuild the local search index.
`aggrega/publishEntity`, `aggrega/publishArtifact`, `aggrega/signArtifacts` and
`aggrega/deprecateArtifact` write to one — bytes, a signature, or a withdrawal marker. Nothing else
here contacts a network: a listing reports what the configuration pins, a search reads an offline
snapshot, and a publication asked for with `dryRun` computes what it would send and contacts nobody.

**The rule is about when an operation runs, not about which surface runs it.** An operation that
fetches or writes runs because a request named it, and never as a side effect of validating a
document, inspecting a graph or listing a workspace's entities. So an editor that validates on every
keystroke reaches no network and rewrites no lockfile, while a "resolve dependencies" action the user
clicks does exactly what `aggrega pull` does — the same resolution, behind both surfaces, writing a
byte-identical lockfile and filling the same content-addressed store.

**Nothing is prompted for.** Nobody is watching this stream, so identity is resolved from a supplied
or ambient credential source and never by asking. Where the terminal command would have put a question
to a person — a registry that needs credentials, a capability more than one provider plugin serves,
the text a withdrawal is to carry — the request fails with a message naming what to supply rather than
blocking on an answer that will never arrive. A refusal leaves the workspace exactly as it was: no
lockfile is written and no partial record is left behind, and a publication that could not resolve a
credential refuses before any bytes reach the registry.

### Some changes reach past this workspace, and the answer says which

A session is opened over one workspace, so an answer with nothing to say about its own reach reads as
being about that workspace. For several of these requests that reading would be wrong, so each one
carries its scope and a client should show it before acting on the result.

**Publishing, signing and withdrawing reach past the machine entirely, which is the widest reach
anything here has.** The other writes below change what this machine resolves; these change what
*everyone* resolving from that registry does. Published bytes are what every consumer of that
registry gets, and re-publishing different content over a tag is refused rather than offered, so no
request here takes a publication back — the answer is to publish a new version. A signature and a
withdrawal marker are attached as siblings of the artifact rather than replacing it, so the bytes
themselves are untouched; but anyone who fetches the artifact afterwards fetches them too, and
**neither can be recalled from anyone who already has it**. A withdrawal is the sharpest of the three
to read wrongly: the version stays fetchable, while a retraction a workspace trusts takes it out of
what a resolution there will choose.

**Signing uses credentials, and where they come from is worth knowing before you wire a client.**
Keyless signing resolves an identity token, in order, from `identityToken` on the request, then
`AGGREGA_IDENTITY_TOKEN` in the daemon's environment, then the ambient GitHub Actions OIDC endpoint
where one is reachable, then `SIGSTORE_ID_TOKEN`. When none of those yields a token the operation
refuses and names what to send; it never opens a browser, because there is nobody to look at it.
Keyed signing is the offline alternative, and **a request names no key path**: a session locates what
it reads inside the workspace it opened, and a private key is never kept inside a workspace, so the
key comes from the `signing:` block of the workspace's own configuration instead. See
[`aggrega sign`](aggrega-sign.md) for the two signing modes and what each contacts.

Every one of the four answers carries `reach`, holding `registry` — the host the call addressed — and
`beyondThisMachine`, which is derived from what the call actually did rather than from what it asked
for: true exactly when bytes, a signature or a marker landed somewhere other people resolve from, and
false for a dry run. Show it before acting on the result.

**Registering or removing a registry writes the configuration shared across every workspace on the
machine, by default.** A registry and the identities you trust on it are usually the same wherever
you work, so that is where the entry goes unless the request sends `workspace: true`. The consequence
is worth stating plainly: `aggrega/registryAdd` and `aggrega/registryRemove` change what every
project on that machine resolves through, including projects nobody in this session has named. Both
answers carry `scope`, with the `configFile` that was written and `machineWide` saying whether it is
the shared one. Removal is the sharper of the two, because re-adding is not the same act — the trust
policy that was pinned is gone, and a later registration pins whatever the registry advertises then.

**Reclaiming cache content reaches past the workspace too.** The compiled-module and plugin-describe
stores are shared by every project on the machine, so `aggrega/cachePrune`, `aggrega/cacheEvict` and
`aggrega/cacheClear` can remove content another project depends on. Each removal carries the `reach`
of the class it came from, and each answer carries `scope.machineWideClasses`. `aggrega/cacheStatus`
carries the same reach on every class even though it changes nothing, because a client deciding
whether to reclaim needs it **before** it acts.

**Refreshing the search index is the other way round.** `aggrega/registryUpdate` reaches every
configured registry, and what it writes lands under this workspace's own configured cache directory —
so it changes nothing another project resolves through. `indexRoot` in the answer names that
directory.

**A partial refresh answers rather than failing.** A request naming one registry that could not be
reached is an error, because there is no answer to give. A request refreshing every configured
registry when only some were reachable **succeeds**: the reachable ones were indexed and written,
`failed` names the rest, and each host carries its own error. Read `failed` rather than the presence
of an error — the command line reports that same walk as a non-zero exit because a shell has no other
channel, and this surface has one.

## Lockfile awareness

The daemon checks a lockfile for drift on each `aggrega/irGraph`, against the Release that request named, surfacing drift as a non-blocking warning. `aggrega/irGraph` requires a lockfile to be present. There is no separate check at startup: a request says which Release it is about, so the verdict is computed for that Release when it is asked for rather than once for one Release chosen in advance.

**`aggrega/irGraph` is the one operation that refuses rather than warns, and it is the only one.** Everywhere else — including `aggrega/validate` — a plugin the workspace has no recorded digest for is run anyway, with [a warning](../errors/warnings.md) saying nothing checked its bytes. A graph is different in kind: it is a picture a reader then reasons about, and one built from unverified bytes would be drawn exactly like one that was checked, with the warning sitting somewhere the reader is not looking. So the handler stops before it resolves anything and answers `lockfile-absent`, naming the lockfile it looked for and the Release, so a client can offer `aggrega pull --release <release>` directly — or send `aggrega/resolveDependencies` for that Release and write the lockfile without leaving the session.

**`aggrega/validate`, when a request names a Release, reads that Release's lockfile for its pins and its deprecation notices only.** It does not hold the plugins it runs to the recorded digests, and it does not rebuild the transform-plugin attachment set from the lockfile — it validates against the workspace configuration as it stands in front of you, which is what an editor has to do while you are editing that configuration. `aggrega validate` and `aggrega build` do both, and remain the authoritative surfaces for a verdict about a committed workspace.

## Error codes

Responses use the standard JSON-RPC error codes plus an application-level range in the 1xxx band: file-not-validated, lockfile-absent, entity-not-resolvable, and shutting-down. An editor client can branch on the code without parsing the message. The two bands mean different things to a client: a 1xxx code names a state of the workspace the user can act on — validate the file, generate the lockfile — while a standard code such as invalid-params names a malformed request, which the client corrects rather than the user. A `release` value that is present but malformed — absolute, or resolving outside the workspace root — falls in the second band: the workspace is not in a state the user has to repair, the request is. Omitting `release` is in neither band, because it is not an error at all; it selects the narrower of the two answers described under [Live validation](#live-validation).

An error may carry a `data` object, and every key in it names one thing and only that thing. `file` is the source document the failure is about — the document being validated, the Release whose load failed, or the workspace document that declares a name nothing resolved — and it is what any accompanying `line` and `column` locate a position within. Those two are themselves optional: a failure about a whole document carries `file` alone. `lockfile` is a lockfile. `release` is the Release the error is about, spelled the way the request named it, so a client can compose `aggrega pull --release <release>` without parsing it back out of the message. Every key is optional and present only when the daemon has that value in hand; none stands in for another, so what a key points at never depends on the code beside it.

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
