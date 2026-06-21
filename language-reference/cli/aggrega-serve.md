# aggrega serve

`aggrega serve` runs Aggrega as a long-running **compiler-as-service daemon** for IDE integration. It speaks JSON-RPC 2.0 over stdin/stdout and holds catalog-resolver, parse-cache, and diagnostic state across requests, so editor operations get sub-second feedback instead of paying the full catalog-load cost on every keystroke.

## Synopsis

```
aggrega serve [--workspace-root <dir>]
```

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
- `aggrega/irGraph {release}` — the compiled IR graph for a Release, for editor introspection.
- `aggrega/invalidate {file, granularity?}` — a cache-invalidation signal from the editor's file watcher.

**Notifications:**

- `aggrega/shutdown` — begin a cooperative drain: in-flight requests finish, new requests are refused, then the daemon exits.
- `aggrega/publishDiagnostics` — a server-pushed diagnostic set (used for lockfile-drift warnings and at-startup state).

## Live validation

On each `aggrega/validate` the daemon validates the editor buffer against the document's schema and returns diagnostics pointed at the offending key — the same verdict a build would give, on unsaved content. Catalog entities, Aggregates, Manifests, and Releases are recognized by their `apiVersion` and `kind`. The two documents that carry no such header — the `.aggrega-config.yaml` workspace config and the active Release's lockfile — are recognized by filename instead, so a junk or misshapen key in either one also squiggles live. Files that are not Aggrega documents — Helm chart templates, Compose files, Kubernetes manifests, and other ecosystems' `.lock` files such as `Cargo.lock` or `flake.lock` — receive no diagnostics; the daemon never reports on foreign files.

## Cache model

Operations are cache-driven: call `aggrega/validate` for a file before `hover` / `completion` / `resolve` / `diagnostics` on it. The parse cache is checked against each file's on-disk modification time on every read, so external edits (an editor save, a `git checkout`) are picked up automatically — the editor's `aggrega/invalidate` is an optimization, not a correctness requirement.

## Workspace root and active Release

The daemon resolves its workspace the same way every `aggrega` command does. Discovery walks up from the working directory: a `.aggrega-config.yaml` carrying a `workspace:` block anchors the root, and failing that a heuristic marker does — an `.aggrega/` directory, then `aggregate*.yaml`, `release*.yaml`, or `manifest*.yaml`. A `.aggrega-config.yaml` *without* a `workspace:` block does not anchor; it still contributes its settings, but a bare settings file cannot turn every parent directory into a workspace root. `--workspace-root` overrides discovery. When no marker is found, the working directory is used — the daemon starts and operations simply resolve nothing, rather than refusing to run.

Configuration is a cascade. Every `.aggrega-config.yaml` from the workspace root down to the working directory contributes, with a nearer file overriding a farther one; beneath the tree, `$AGGREGA_CONFIG` (when set) supplies a base layer, and built-in defaults sit under that. The full precedence for the workspace root is: `--workspace-root`, then the nearest `workspace:`-marked config, then a heuristic marker, then the working directory.

Operations that need a Release pick the active one through a four-step cascade: the `build.authoring_release` config field, then a single-Release-in-the-workspace heuristic, then an `.aggrega/active-release` marker file, then an Aggregate-only fallback.

## Lockfile awareness

When an active Release has a lockfile, the daemon checks it for drift at startup and on each `aggrega/irGraph`, surfacing drift as a non-blocking warning. `aggrega/irGraph` requires a lockfile to be present.

## Error codes

Responses use the standard JSON-RPC error codes plus an application-level range in the 1xxx band: file-not-validated, release-not-resolved, lockfile-absent, entity-not-resolvable, and shutting-down. An editor client can branch on the code without parsing the message.

## Flags

- `--workspace-root <dir>` — set the workspace root explicitly instead of discovering it from the working directory.

## See also

- [./aggrega-build.md](./aggrega-build.md) — the daemon runs the same compiler pipeline the build command does; the build command remains the authoritative, lockfile-verified surface.
- [./aggrega-version.md](./aggrega-version.md) — the version command an editor extension uses to check daemon compatibility.
- [./aggrega-pull.md](./aggrega-pull.md) — the lockfile the daemon's drift surface reads.
