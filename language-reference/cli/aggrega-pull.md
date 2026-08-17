# aggrega pull

`aggrega pull` resolves all of a Release's dependencies and writes a **lockfile** that pins every dependency to an exact version and content digest. A subsequent `aggrega build` reads the lockfile and verifies against it, so builds are reproducible and offline-capable. `aggrega pull` is the one step that touches the network; build does not.

## What it does

`aggrega pull` resolves two kinds of dependency in one pass:

- **Catalog entities** — the Components, Features, Recipes, FeatureRecipes, schema and mapping libraries, and Wasm plugins the Release references, resolved transitively (through `extends:`, `implements:`, `aggregate:`, Feature attachments, and library `$import:` / `$ref:` sites) and fetched from the registry when not already local.
- **Source artifacts** — the remote `source:` that an individual Recipe or FeatureRecipe points a provider at: a Helm chart (OCI or classic HTTPS) or a Compose fragment over HTTPS. Each is fetched, cached, and pinned.

It writes the result to `<release-stem>.lock` next to the Release.

## The lockfile

The lockfile pins each dependency to its URI, resolved version, and content digest. It has sections for catalog entities, schema and mapping libraries (each carrying back-pointers to the Components and Features that consume it), Wasm plugins, and source artifacts. The file is written in a canonical, deterministic form.

Commit `<release-stem>.lock` alongside the Release, the way you commit any pinned-dependency manifest. A lockfile diff shows reviewers exactly which dependency versions and digests changed; a library digest change names the consumers it affects.

What a given pull *did* — whether each entity was fetched fresh from a registry (`fetched-fresh`), reused a cache slot (`cache-reuse`), found in a local catalog (`local`), served from the copy inside the compiler binary (`in-binary`), or was external (`external`) — is a transient pull-event diagnostic printed to stdout by `--detail`, and it is never written to the lockfile. Which source served an entity depends on the pulling machine's local state, so persisting it would break the lockfile's byte-identity across machines. It reports what *this pull* did, which is unrecoverable afterward (a freshly-pulled entity is cached by the next run); for the post-pull resolution *state* of a Release's dependencies, use `aggrega inspect`.

## Honoring vs. updating

By default `aggrega pull` **honors** an existing lockfile: a dependency already pinned resolves to its exact pinned version (verified against its pinned digest), only references that are not yet pinned are resolved and added, and pins for references the Release no longer reaches are pruned. So a re-pull of an unchanged Release is a no-op — it reproduces the same lockfile byte-for-byte (including `generated_at`). Adding a new dependency, or pulling after a hand-edit removed a pin, resolves just that gap and leaves every other pin untouched.

**To update pinned versions, run `aggrega pull --upgrade --release <release>`** — it discards the existing pins and re-resolves all dependencies to the latest satisfying versions. Updating is the explicit act; the default never floats a pinned dependency. This mirrors the convention of `npm ci` / `cargo` / `go build` (the default realizes the lock; updating is opt-in), and it is what makes `aggrega build`'s automatic pull safe — build resolves exactly what the lockfile pins, never silently moving a version.

If a pinned version's bytes in the registry no longer match the digest the lockfile recorded (an immutability violation upstream), `pull` halts with an integrity error rather than silently adopting the changed bytes — run `--upgrade` to deliberately re-pin.

## The cache

Pulled content is stored under `.aggrega/cache`, split into an `entities/` subtree for catalog entities and a `source-artifacts/` subtree for source artifacts. The cache is content-addressed, so identical version pins share storage across Releases. Each source-artifact slot holds the authoritative archive, a regenerated extraction, and a small metadata file; the extraction is regenerated on every read, so build output depends on the archive and the lockfile, not on the state of the extracted files.

## Offline

Under `offline: true` — or `AGGREGA_OFFLINE` in the environment — `aggrega pull` refuses network access. The refusal happens before any connection is attempted rather than as a timeout partway through a fetch, so an offline pull reaches no registry and no remote source.

Resolution then draws only on what the machine already holds: the `catalog_dirs` search stack and the cache under `.aggrega/cache`. Against a catalog and cache that satisfy every reference, an offline pull completes normally and writes an ordinary lockfile. The lockfile records each dependency's URI, resolved version and digest, and never which of those places served the bytes — so an offline pull and an online pull that resolve the same versions write the same lockfile.

**A reference an offline pull cannot satisfy locally halts it.** The entry is never skipped:

- A catalog entity that resolves nowhere halts the pull, naming the reference and where it was referenced from, so both the missing dependency and the thing that asked for it are named.
- A remote `source:` halts the pull, naming the source and telling you either to allow network access or to populate the cache from a connected environment.

Offline is therefore a refusal to touch the network, not a reduced result: a pull resolves everything and writes a complete lockfile, or it stops. Nothing is pinned partially, so a lockfile that exists is one whose resolution completed — you never have to establish separately that the machine which produced it could reach every dependency it needed.

## Integration with `aggrega build`

- **Verification.** `aggrega build` verifies every resolved dependency against the lockfile and halts on drift between the lockfile and the current catalog or registry state. Run `aggrega pull --upgrade --release <release>` to adopt the new state.
- **Auto-pull.** If the lockfile is missing and `auto_pull` is true (the default), `aggrega build` runs the pull first automatically. If `auto_pull` is false, the build halts and asks you to pull.
- **Offline.** Under `offline: true`, `aggrega build` uses only the cache; a missing lockfile or a missing cache entry halts with an air-gap diagnostic.
- **Catalog search.** Pull honors `catalog_dirs` from `.aggrega-config.yaml` even when no `--catalog` is given, and resolves the same first-win search stack `aggrega build` does, so the dependencies it pins match what build searches.

## Determinism and integrity

A Recipe's `source:` may template its version against the Release's resolved `values` and `infra` (and over `locals` defined on the same); these resolve at pull time and the result is pinned. A mutable Git tag or branch is pinned to the concrete commit it points at, with the original ref preserved for readability. At build time the cached archive's digest is re-verified against the lockfile, so a tampered cache is caught.

The lockfile pins content fetched from registries and remote sources. Local files — sources beginning with `./` or `../`, and workspace catalog directories — are not pinned; their integrity between builds is the responsibility of the source-control system. See [byte-identical output](../../architecture/05-invariants.md) for the scope of the determinism guarantee.

## Authentication

Aggrega does not implement its own authentication for remote registries. Authentication uses the standard tooling configs in priority order:

- `~/.docker/config.json` (Docker login)
- `$XDG_RUNTIME_DIR/containers/auth.json` (Podman / Skopeo)
- `~/.config/helm/registry/config.json` (Helm OCI)

Credential-helper delegation via `credsStore` and `credHelpers` is honored across all three locations, so OS-keychain integration via delegated helper binaries works without further configuration. For a private OCI catalog or chart repository, run `docker login <registry>` (or `helm registry login <registry>` for Helm-specific OCI) before `aggrega pull`. The credentials persist in the standard config file; Aggrega reads them automatically.

Other source kinds use their native authentication conventions:

- Helm classic HTTPS chart repositories (non-OCI) read `~/.config/helm/repositories.yaml` per Helm's own convention.
- Git module sources use the standard Git transport credentials — SSH agent, `~/.netrc`, gitconfig credential helpers.
- Plain HTTPS fragment sources transport with no authentication today; richer per-host token configuration is a future iteration.

The goal across kinds is to let each kind's native tooling continue to own its authentication story. Aggrega does not interpose its own credential store or auth layer.

## Environment variables

The workspace settings pull reads can be overridden through the environment, above the committed config and below any flag: `AGGREGA_OFFLINE` (see [Offline](#offline)), `AGGREGA_CATALOG_DIRS` (OS-path-list separated; supply absolute paths), `AGGREGA_ARTIFACT_CACHE_DIR`, `AGGREGA_DEFAULT_REGISTRY`, and `AGGREGA_SKIP_SIGNATURE_VERIFICATION` (loud — every pull logs a warning when verification is globally disabled). See [environment-variables.md](environment-variables.md) for the full list and the precedence model.

## See also

- [./aggrega-build.md](./aggrega-build.md) — verifies the lockfile and auto-pulls when configured.
- [./aggrega-push.md](./aggrega-push.md) — publishes catalog entities to a registry.
- [./aggrega-lint.md](./aggrega-lint.md) — the publish gate that precedes `aggrega push`.
- [../../architecture/13-catalog-and-registry.md](../../architecture/13-catalog-and-registry.md) — the catalog, lockfile, and cache model in full.

<!-- BEGIN GENERATED: cli-pull -->
**Synopsis**

```
aggrega pull [<uri>...] [flags]
```

**Flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--catalog` | `[]` | Catalog directory; repeatable. Each --catalog is prepended to the workspace catalog_dirs search stack (first match wins). Defaults to the current directory. |
| `--detail` | `false` | Print, per resolved entity, what this pull did — fetched fresh from a registry, reused a cache slot, found in a local catalog, served from inside the compiler binary, or external. Stdout only; not written to the lockfile |
| `--include-prerelease` | `false` | Reserved for future version-selection logic; currently a no-op |
| `--progress` | `false` | Force the pull-progress surface on even when stderr is not a terminal, printing plain static phase lines. The default is auto: the interactive phase checklist is shown only when stderr is a terminal |
| `--quiet` | `false` | Silence the pull-progress surface on stderr. Does not affect stdout. Takes precedence over --progress |
| `--release` | — | Path to Release YAML file (required) |
| `--upgrade` | `false` | Re-resolve dependencies from current registry state, floating each to the highest available version. Bare (no positional URIs) discards the lockfile and re-resolves every entity; with one or more entity URIs, re-resolves only those, holding all other pins and the recorded external inputs unchanged |
| `--verify` | `false` | Verify the existing lockfile against the current dependency resolution without writing; exits non-zero on drift or missing lockfile. Also reports the compiler and core-plugin versions the lockfile records — reported for audit and never compared against this binary, so a toolchain difference is never drift |
<!-- END GENERATED: cli-pull -->
