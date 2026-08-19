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
- `aggrega/invalidate {file, granularity?}` — a cache-invalidation signal from the editor's file watcher.

**Notifications:**

- `aggrega/shutdown` — begin a cooperative drain: in-flight requests finish, new requests are refused, then the daemon exits.
- `aggrega/publishDiagnostics` — a server-pushed diagnostic set (used for lockfile-drift warnings and at-startup state). Each entry carries a `source` naming which of the daemon's two layers raised it: `aggrega` for a finding about the authored documents, and `aggrega-build` for an advisory a render raised — the same findings `aggrega build` prints. The field is always present on every entry, so a client can group the two rather than showing one undifferentiated list, and never has to tell an absent source apart from the other layer.

## Live validation

On each `aggrega/validate` the daemon validates the editor buffer against the document's schema and returns diagnostics pointed at the offending key — the same verdict a build would give, on unsaved content. Catalog entities, Aggregates, Manifests, and Releases are recognized by their `apiVersion` and `kind`. The two documents that carry no such header — the `.aggrega-config.yaml` workspace config and the active Release's lockfile — are recognized by filename instead, so a junk or misshapen key in either one also squiggles live. Files that are not Aggrega documents — Helm chart templates, Compose files, Kubernetes manifests, and other ecosystems' `.lock` files such as `Cargo.lock` or `flake.lock` — receive no diagnostics; the daemon never reports on foreign files.

### What a diagnostic entry carries

Each entry positions itself with `line` and `column`, both 1-based in the position encoding negotiated at the handshake, and adds `end_line` and `end_column` when it spans a whole token. `message` is the text a client shows the user, `severity` classifies it, and `source` names which of the daemon's two layers raised it, as described above.

`code` names the condition the entry reports, so a client can branch on it without matching the message text. It is the string the condition is registered under, written as the declaring package and then the rule in kebab-case — the same value a Go consumer reads with `CodeOf`, whose form and matchable surface are described in [the error-sentinels reference](../errors/sentinels.md). So an editor extension that highlights, groups, or suppresses one class of finding keys on the code, and keeps working when the wording of a message changes.

Note which object carries which: this is a **string** on a diagnostic entry naming the condition, distinct from the **numeric** `code` on a JSON-RPC error envelope described under [Error codes](#error-codes) below. A response carries one or the other, never both in one place.

The key is **omitted** where the failure names no such condition: a buffer no YAML parser will read reports the parser's own text and no code, because no condition of Aggrega's own stands behind it. So treat `code` as optional, the same way `end_line` and `end_column` are, and branch on it only when it is present. A code is what a condition reports and never what selects one: no request takes a code, and writing one back into your own code gives you a string rather than a way to match.

## Cache model

Operations are cache-driven: call `aggrega/validate` for a file before `hover` / `completion` / `resolve` / `diagnostics` on it. The parse cache is checked against each file's on-disk modification time on every read, so external edits (an editor save, a `git checkout`) are picked up automatically — the editor's `aggrega/invalidate` is an optimization, not a correctness requirement.

## Workspace root and active Release

The daemon resolves its workspace the same way every `aggrega` command does. Discovery walks up from the working directory: a `.aggrega-config.yaml` carrying a `workspace:` block anchors the root, and failing that a heuristic marker does — an `.aggrega/` directory, then `aggregate*.yaml`, `release*.yaml`, or `manifest*.yaml`. A `.aggrega-config.yaml` *without* a `workspace:` block does not anchor; it still contributes its settings, but a bare settings file cannot turn every parent directory into a workspace root. `--workspace-root` overrides discovery. When no marker is found, the working directory is used — the daemon starts and operations simply resolve nothing, rather than refusing to run.

Configuration is a cascade. Every `.aggrega-config.yaml` from the workspace root down to the working directory contributes, with a nearer file overriding a farther one; beneath the tree, `$AGGREGA_CONFIG` (when set) supplies a base layer, and built-in defaults sit under that. The full precedence for the workspace root is: `--workspace-root`, then the nearest `workspace:`-marked config, then a heuristic marker, then the working directory.

Operations that need a Release pick the active one through a four-step cascade: the `build.authoring_release` config field, then a single-Release-in-the-workspace heuristic, then an `.aggrega/active-release` marker file, then an Aggregate-only fallback.

The operations that search the whole workspace rather than one buffer — `completion`, `hover`, `resolve`, `findReferences` and `findImplementations` — enumerate the YAML under the workspace root, and that enumeration **honours `.gitignore`**. Every `.gitignore` from the workspace root down to the file's own directory contributes, with the nearest one winning, so a YAML file your repository ignores is not offered as a completion candidate and is not reported as a definition or a reference. Vendored trees and generated output therefore stay out of cross-file results without any separate exclusion setting to maintain — and a document you expect to be found but have ignored will not appear, which is the one case worth checking when a reference seems to be missing.

## Lockfile awareness

When an active Release has a lockfile, the daemon checks it for drift at startup and on each `aggrega/irGraph`, surfacing drift as a non-blocking warning. `aggrega/irGraph` requires a lockfile to be present.

## Error codes

Responses use the standard JSON-RPC error codes plus an application-level range in the 1xxx band: file-not-validated, release-not-resolved, lockfile-absent, entity-not-resolvable, and shutting-down. An editor client can branch on the code without parsing the message. The two bands mean different things to a client: a 1xxx code names a state of the workspace the user can act on — validate the file, generate the lockfile, choose a Release — while a standard code such as invalid-params names a malformed request, which the client corrects rather than the user.

An error may carry a `data` object, and every key in it names one thing and only that thing. `file` is the source document that the accompanying `line` and `column` locate — the document being validated, or the Release whose load failed. `lockfile` is a lockfile. `release` is the Release the error is about, spelled the way the request named it, so a client can compose `aggrega pull --release <release>` without parsing it back out of the message. Every key is optional and present only when the daemon has that value in hand; none stands in for another, so what a key points at never depends on the code beside it.

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
