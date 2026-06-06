# aggrega pull

`aggrega pull` resolves a Release's full dependency closure and writes a **lockfile** that pins every dependency to an exact version and content digest. A subsequent `aggrega build` reads the lockfile and verifies against it, so builds are reproducible and offline-capable. `aggrega pull` is the one step that touches the network; build does not.

## Synopsis

```
aggrega pull --release <path> [--regenerate] [--include-prerelease] [--dry-run] [--detail]
aggrega pull --release <path> --verify
```

## What it does

`aggrega pull` resolves two kinds of dependency in one pass:

- **Catalog entities** — the Components, Features, Recipes, FeatureRecipes, Providers, schema and mapping libraries, and Wasm plugins the Release references, resolved transitively (through `extends:`, `implements:`, `aggregate:`, Feature attachments, and library `$import:` / `$ref:` sites) and fetched from the registry when not already local.
- **Source artifacts** — the remote `source:` that an individual Recipe or FeatureRecipe points a render engine at: a Helm chart (OCI or classic HTTPS), a Compose fragment over HTTPS, or a Terraform module from Git. Each is fetched, cached, and pinned.

It writes the result to `<release-stem>.lock` next to the Release.

## The lockfile

The lockfile pins each dependency to its URI, resolved version, and content digest. It has sections for catalog entities, schema and mapping libraries (each carrying back-pointers to the Components and Features that consume it), Wasm plugins, and source artifacts. The file is written in a canonical, deterministic form.

Commit `<release-stem>.lock` alongside the Release, the way you commit any pinned-dependency manifest. A lockfile diff shows reviewers exactly which dependency versions and digests changed; a library digest change names the consumers it affects.

## The cache

Pulled content is stored under `.aggrega/cache`, split into an `entities/` subtree for catalog entities and a `source-artifacts/` subtree for source artifacts. The cache is content-addressed, so identical version pins share storage across Releases. Each source-artifact slot holds the authoritative archive, a regenerated extraction, and a small metadata file; the extraction is regenerated on every read, so build output depends on the archive and the lockfile, not on the state of the extracted files.

## Integration with `aggrega build`

- **Verification.** `aggrega build` verifies every resolved dependency against the lockfile and halts on drift between the lockfile and the current catalog or registry state. Run `aggrega pull --regenerate` to adopt the new state.
- **Auto-pull.** If the lockfile is missing and `auto_pull` is true (the default), `aggrega build` runs the pull first automatically. If `auto_pull` is false, the build halts and asks you to pull.
- **Offline.** Under `workspace.offline: true`, `aggrega build` uses only the cache; a missing lockfile or a missing cache entry halts with an air-gap diagnostic.

## Flags

- `--release <path>` — the Release to resolve (required).
- `--regenerate` — discard the existing lockfile and rebuild it from current registry state. This is the remediation named in drift diagnostics.
- `--include-prerelease` — include pre-release versions during selection (reserved; no effect today).
- `--dry-run` — compute and report the closure without writing the lockfile.
- `--verify` — read-only: check the existing lockfile against the current state and report drift without writing anything.
- `--detail` — print, per resolved entity, what this pull run did: fetched fresh from a registry, reused a cache slot, found in a local catalog, or external. This is a transient pull-event diagnostic written to stdout, never to the lockfile — the resolution tier depends on the pulling machine's local state and so is deliberately not persisted (it would break the lockfile's byte-identity across machines). It reports what *this pull* did, which is unrecoverable afterward (a freshly-pulled entity is cached by the next run); for the post-pull resolution *state* of a closure, use `aggrega inspect`.

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

## See also

- [./aggrega-build.md](./aggrega-build.md) — verifies the lockfile and auto-pulls when configured.
- [./aggrega-push.md](./aggrega-push.md) — publishes catalog entities to a registry.
- [./aggrega-lint.md](./aggrega-lint.md) — the publish gate that precedes `aggrega push`.
- [../../architecture/13-catalog-and-registry.md](../../architecture/13-catalog-and-registry.md) — the catalog, lockfile, and cache model in full.
