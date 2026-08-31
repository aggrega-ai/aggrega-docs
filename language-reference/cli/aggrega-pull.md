# aggrega pull

`aggrega pull` resolves all of a Release's dependencies and writes a **lockfile** that pins every dependency to an exact version and content digest. A subsequent `aggrega build` reads the lockfile and verifies against it, so builds are reproducible and offline-capable. `aggrega pull` is the one step that touches the network; build does not.

## What it does

`aggrega pull` resolves two kinds of dependency in one pass:

- **Catalog entities** — the Components, Features, Recipes, FeatureRecipes, schema and mapping libraries, and Wasm plugins the Release references, resolved transitively (through `extends:`, `implements:`, `aggregate:`, Feature attachments, and library `$import:` / `$ref:` sites) and fetched from the registry when not already local.
- **Source artifacts** — the remote `source:` that an individual Recipe or FeatureRecipe points a provider at: a Helm chart (OCI or classic HTTPS) or a Compose fragment over HTTPS. Each is fetched, cached, and pinned.

It writes the result to `<release-stem>.lock` next to the Release. A workspace that attaches a plugin returning an accept-or-reject verdict also gets a second file in that directory — the [plugin trust record](#the-plugin-trust-record).

## The lockfile

The lockfile pins each dependency to its URI, resolved version, and content digest. It has sections for catalog entities, schema and mapping libraries (each carrying back-pointers to the Components and Features that consume it), Wasm plugins, and source artifacts. The file is written in a canonical, deterministic form.

Commit `<release-stem>.lock` alongside the Release, the way you commit any pinned-dependency manifest. A lockfile diff shows reviewers exactly which dependency versions and digests changed; a library digest change names the consumers it affects.

What a given pull *did* — whether each entity was fetched fresh from a registry (`fetched-fresh`), reused a cache slot (`cache-reuse`), found in a local catalog (`local`), served from the copy inside the compiler binary (`in-binary`), or was external (`external`) — is a transient pull-event diagnostic printed to stdout by `--detail`, and it is never written to the lockfile. Which source served an entity depends on the pulling machine's local state, so persisting it would break the lockfile's byte-identity across machines. It reports what *this pull* did, which is unrecoverable afterward (a freshly-pulled entity is cached by the next run); for the post-pull resolution *state* of a Release's dependencies, use `aggrega inspect`.

## The plugin trust record

Some plugins the workspace attaches never shape the rendered output. A `plugins.governance` attachment in an `ir-verdict` or `render-verdict` role, and every `plugins.linter` attachment, return an accept-or-reject verdict and nothing else — no bytes of theirs reach an artifact. So they are not part of what a build reproduces byte-for-byte, and the lockfile, which pins exactly that, is the wrong place for them.

Their identities go in a second committed file instead: `plugins-trust.yaml`, beside the lockfile. It carries one entry per such plugin, recording the plugin's identity coordinate, the version selected for it, and the content digest of the resolved artifact — plus, when the publisher has deprecated that artifact since publishing it, the marker pull found and verified. The [plugin trust record schema](../schema/other/plugins-trust.md) describes the file field by field.

Commit `plugins-trust.yaml` alongside the lockfile, for the reason you commit the lockfile: a record kept outside version control is one nobody can review and nothing can compare against. Committed, it is one shared statement of which plugin each of those attachments resolved to, and a diff over it names the identity that changed.

**The file appears only when there is something to record.** A workspace that attaches no verdict-returning plugin resolves no such identity, so pull writes no file and says nothing about one — an absence, not a missing file. When pull does create it, it names the file it created and tells you to commit it. A later pull adds an identity the record does not yet hold and leaves every identity already recorded exactly as it is.

**A deprecation is added to an entry the record already holds, and that is not the same as rewriting it.** If a publisher deprecates a plugin you already trust, the next `aggrega pull` records the marker on that plugin's existing entry — the coordinate, the version and the digest are untouched, because the artifact has not moved and nothing new is being adopted. So a plain pull can add a `deprecation` block, and only an explicit upgrade ever changes an identity. A marker is recorded only against the artifact the entry already names, and nothing removes one: it goes when the entry itself goes.

**A resolved identity that disagrees with the recorded one halts the pull.** A recorded entry names both a version and a digest, so either moving is the same event: the plugin that would run is not the plugin the record was reviewed for. The diagnostic names the plugin, what the record holds, and what this resolution reported, on both axes at once — and pull stops without touching the record, so the reviewed identity is still there to compare against. It halts on the version alone (a re-publish whose bytes did not change) exactly as it halts on the digest alone (a re-push at the same version).

`aggrega pull --verify` makes the same comparison. It writes nothing, so it adopts nothing; it reports whether the two committed files still describe what resolves today, and the record is one of those files.

**To adopt a new identity, ask for it by name:** `aggrega pull --upgrade --release <release> <plugin>`, naming the plugin as your `.aggrega-config.yaml` attachment names it, without any version suffix. That re-resolves that one plugin and rewrites its entry, leaving every other pinned dependency and every other recorded identity untouched — and it works even though the plugin has no lockfile pin, because a named target may also name one of those attachments. A bare `aggrega pull --upgrade`, which re-resolves every dependency, re-resolves and rewrites every recorded identity too. So does `aggrega build --upgrade`, which runs a bare full-refresh pull and has no way to name a single target.

**To remove an identity, ask for that by name too.** Detaching a plugin from `.aggrega-config.yaml` does not clear its entry, and that is deliberate: a plain `aggrega pull` never removes one. Run `aggrega pull --upgrade --release <release> <plugin>`, naming the plugin as the record names it — its identity coordinate, which is the string the halt below prints — and the entry is dropped, leaving every other pinned dependency and every other recorded identity untouched. A bare `aggrega pull --upgrade` drops every entry no verdict attachment names any more, in the same pass that re-resolves everything else.

Dropping the last entry leaves the file in place and empty rather than deleting it. An empty record holds nothing, so it pins nothing and halts nothing — the same as no record at all — and keeping the file means the removal shows up in its diff as a removal.

**A record that does not satisfy its schema halts every command that reads it** — a build, a release-scoped lint, and a pull, including a pull that has nothing of its own to record. An emptied record and a damaged one are deliberately different: emptying is how the last entry is removed, and an emptied record stays silent, while a file whose contents no longer parse is a fault rather than an empty record — reading it as empty would make truncating the file a way to switch the comparison off. Restore it from version control to get the reviewed identities back.

**A plugin served from the copy inside the compiler binary is not recorded.** Pull records what it *acquired* — fetched from a registry, or read from the cache — and nothing is acquired from the binary: those bytes are identified by the compiler version that carries them, so there is no resolution of their own to record. Attaching a plugin the binary already carries therefore produces no entry for it. That is the record staying about acquired artifacts, not a resolution that failed.

**A build, a release-scoped lint and a release-scoped validation hold the workspace configuration to the record.** Before any of those attachments runs, `aggrega build`, `aggrega lint --release` and `aggrega validate --release` — and the same operations reached through `aggrega serve` and `aggrega mcp` — compare the verdict attachments the configuration names against the entries the record holds. A plugin whose resolved artifact digest is not the recorded one is refused rather than run. A record entry that no configured verdict attachment accounts for halts the run: a gate that was reviewed and is now absent leaves output indistinguishable from output that gate approved, which is exactly what someone reading the output cannot see. The halt names the plugin and offers the two remedies that differ by what you meant — attach the plugin again if the removal was a mistake, or run the explicit upgrade above if it was intended — and it prints that upgrade ready to run. The reverse direction — an attachment the record does not yet hold — is the first sighting described above, and halts nothing. The whole-catalog and single-entity lint scopes consult no record.

**A validation is held to the record because it runs the same checks a build runs.** `aggrega validate --release` reaches every check `aggrega build` reaches short of writing the artifacts, gate plugins included — that is what makes "this validates" mean the same as "this builds" — so the identity of the plugin it runs is compared against the record exactly as a build's is. `aggrega validate`'s other scopes are not held to it: validating the whole catalog, a single entity, or a plugin binary does not read the workspace's plugin attachments at all, so no verdict plugin runs in them and there is nothing for a record to hold.

**Holding a configuration to the record establishes presence and identity, and nothing beyond them.** It establishes that every gate the record names is still attached, and that each one runs from the artifact recorded for it. It does not establish that a gate which ran returned a verdict at all, and one case of that is caught nowhere: an attachment whose `function` names an export the plugin *does* declare, which is not the verdict export its socket reads, and whose output carries no top-level field outside the shape that socket expects — the empty object being the simplest — runs, returns nothing to reject on, and lets the build through. Its output is indistinguishable from an approving gate's, and no comparison against the record can notice it, because nothing about the record is wrong: the plugin that ran is exactly the one recorded, and it simply ran nothing. Two neighbouring cases do halt, so the bound is not wider than it reads — a `function` naming an export the plugin does not declare is refused when the plugin is loaded, and an output carrying a top-level field the socket's shape does not declare is refused rather than read as a verdict list that happens to be empty. So a recorded identity is not on its own sufficient for a gate to have judged anything.

**The recorded digest governs the plugins the workspace resolves from the cache `aggrega pull` populates, and nothing it resolves another way.** That is the resolution a verdict attachment normally takes — nothing pins it in the lockfile, so its bytes come from the cache, and that read is where the resolved digest is compared against the recorded one. A verdict plugin the workspace resolves some other way never reaches that read, and is governed by whatever governs the way it did resolve rather than by the record: bytes served from the copy inside the compiler binary are identified by the compiler version carrying them, a `.wasm` sitting beside its catalog entity is a file in your own catalog directory, an explicit filesystem path is the path you named, and a plugin carrying a lockfile pin is governed by that pin. The other half of holding a configuration to the record is not bounded that way: every entry the record holds must still be accounted for by a configured attachment, however that plugin resolves. So the record establishes that the gates it names are still attached whatever serves them, and it establishes the artifact identity of the ones served from the cache.

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
| `--include-prerelease` | `false` | Not yet implemented: accepted and ignored, so a script that passes it keeps working when it starts having an effect |
| `--progress` | `false` | Force the pull-progress surface on even when stderr is not a terminal, printing plain static phase lines. The default is auto: the interactive phase checklist is shown only when stderr is a terminal |
| `--quiet` | `false` | Silence the pull-progress surface on stderr. Does not affect stdout. Takes precedence over --progress |
| `--release` | — | Path to Release YAML file (required) |
| `--upgrade` | `false` | Re-resolve dependencies from current registry state, floating each to the highest available version. Bare (no positional URIs) discards the lockfile and re-resolves every entity; with one or more entity URIs, re-resolves only those, holding all other pins and the recorded external inputs unchanged |
| `--verify` | `false` | Verify the existing lockfile against the current dependency resolution without writing; exits non-zero on drift or missing lockfile. Also reports the compiler and core-plugin versions the lockfile records — reported for audit and never compared against this binary, so a toolchain difference is never drift |
<!-- END GENERATED: cli-pull -->
