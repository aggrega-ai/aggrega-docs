# aggrega pull

`aggrega pull` resolves all of a Release's dependencies and writes a **lockfile** that pins every dependency to an exact version and content digest. A subsequent `aggrega build` uses what the lockfile pins, verifies it, and halts naming anything it needs that is not pinned there — so builds are reproducible and offline-capable.

**Everything a build consumes is pinned at this one moment.** The catalog entities, the source artifacts a Recipe points a provider at, and the remote documents a provider asks for while it renders are resolved by the same command and recorded in the same lockfile write. `aggrega pull` is the step that touches the network; build does not. That is the whole of the rule, and the rest of this page is what follows from it.

## What it does

`aggrega pull` resolves three kinds of dependency in one pass:

- **Catalog entities** — the Components, Features, Recipes, FeatureRecipes, schema and mapping libraries, and Wasm plugins the Release references, resolved transitively (through `extends:`, `implements:`, `aggregate:`, Feature attachments, and library `$import:` / `$ref:` sites) and fetched from the registry when not already local.
- **Source artifacts** — the remote `source:` that an individual Recipe or FeatureRecipe points a provider at: a Helm chart (OCI or classic HTTPS) or a Compose fragment over HTTPS. Each is fetched, cached, and pinned.
- **External inputs** — the remote documents a provider asks the host for while it renders, such as a `$ref` in a chart's `values.schema.json` that points at a URL. Each is fetched, stored under its content digest, and pinned.

Two of the three are read out of the documents you authored. The third is not: external inputs are found by rendering the Release, which is why this command renders one. Running the command needs none of that — [How the resolution finds external inputs](#how-the-resolution-finds-external-inputs) carries it in full, along with what the render costs, what happens when it cannot complete, and how a build that fills its own lockfile relates to it.

It writes the result to `<release-stem>.lock` next to the Release. A workspace that attaches a plugin returning an accept-or-reject verdict also gets a second file in that directory — the [plugin trust record](#the-plugin-trust-record).

## The lockfile

The lockfile pins each dependency to its URI, resolved version, and content digest. It has sections for catalog entities, schema and mapping libraries (each carrying back-pointers to the Components and Features that consume it), Wasm plugins, source artifacts, and external inputs (each keyed by URL and carrying the plugins that asked for it). The file is written in a canonical, deterministic form.

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

**What that honoring governs is what a registry or the cache serves.** An entity a local catalog directory supplies is resolved from that directory, at the version its file declares, and the entry the lockfile records for it is not consulted on the way. The lockfile still records such an entity, so you will see it there — but editing that entry by hand does not hold the entity at the version you wrote, and the next reconcile rewrites the entry to match the file. To change which version of a locally-supplied entity a Release resolves, edit the catalog file rather than the lockfile.

**To update pinned versions, run `aggrega pull --upgrade --release <release>`** — it discards the existing pins and re-resolves all dependencies to the latest satisfying versions. Updating is the explicit act; the default never floats a pinned dependency. This mirrors the convention of `npm ci` / `cargo` / `go build` (the default realizes the lock; updating is opt-in), and it is what makes `aggrega build`'s automatic pull safe — build resolves exactly what the lockfile pins, never silently moving a version.

That bare form drops every recorded pin, so it asks for confirmation before doing anything. Answer it in advance with `--yes` for non-interactive use; with standard input not a terminal and no `--yes`, it refuses rather than waiting for an answer nobody can give. Naming targets (`aggrega pull --upgrade --release <release> <uri>`) holds every pin it did not name, so that form asks nothing. `aggrega build --upgrade` runs the bare form and is gated on the same terms.

If a pinned version's bytes in the registry no longer match the digest the lockfile recorded (an immutability violation upstream), `pull` halts with an integrity error rather than silently adopting the changed bytes — run `--upgrade` to deliberately re-pin.

## The cache

Pulled content is stored under `.aggrega/cache`, split into an `entities/` subtree for catalog entities, a `source-artifacts/` subtree for source artifacts, and an `inputs/` subtree for the external inputs a render consumes, each blob there named by its own content digest. The cache is content-addressed, so identical version pins share storage across Releases. Each source-artifact slot holds the authoritative archive, a regenerated extraction, and a small metadata file; the extraction is regenerated on every read, so build output depends on the archive and the lockfile, not on the state of the extracted files.

The cache is anchored to the workspace rather than to the directory you ran the command from, so one workspace has one cache and a pull run from a subdirectory fills the same store a build run from the root reads.

## Building where the network cannot be reached

Because this command is the only step that reaches out, one connected run is enough to make every later build local. That run writes the lockfile and fills the workspace cache with the bytes those pins name, and a build then needs nothing beyond them.

Three things travel to the disconnected machine:

- **The Release and its lockfile.** Commit `<release-stem>.lock` beside the Release; it is what tells the build which version and digest every dependency resolved to.
- **`plugins-trust.yaml`, where the workspace attaches a verdict-returning plugin.** A build compares the verdict attachments its configuration names against that record before any of them runs, so carrying the record is what holds the disconnected build to the identities that were reviewed. Commit it beside the lockfile, as [The plugin trust record](#the-plugin-trust-record) describes.
- **The cache directory.** The entities, the source artifacts and the pinned inputs all live under it, and anything a local `catalog_dirs` directory does not supply is read from there.

Build on the disconnected machine as usual. Setting the offline posture there is worth doing even though a build over a filled lockfile reads its closure from the cache: it turns a would-be network reach into an immediate refusal naming the posture, rather than a connection attempt that has to time out first. Anything the cache does not hold, and any external input the lockfile does not pin, halts the build naming what is missing and the resolution that would pin it — nothing is fetched quietly to fill the gap.

**An airgapped machine and an offline workspace are different claims, and the difference is worth keeping.** A machine behind an air gap may hold a local copy of a registry, or a `catalog_dirs` catalog carrying everything it needs, in which case an ordinary pull on that machine is satisfiable without reaching out at all. The offline posture describes what a command may reach for, not what the machine holds; [Offline](#offline) sets out what it refuses and what it leaves alone.

## Offline

Under the offline posture — the top-level `offline` key in a configuration file, `AGGREGA_OFFLINE` in the environment, or [`--offline`](global-flags.md#--offline) on the command line — `aggrega pull` refuses network access. The refusal happens before any connection is attempted rather than as a timeout partway through a fetch, so an offline pull reaches no registry and no remote source. Where a committed file or an exported variable set the posture and you want past it for one command, `--offline=false` allows the network for that run alone.

**`--upgrade` is refused outright under the posture, and it is the one option here that is.** A full refresh floats every dependency to the highest version a registry currently offers, so it needs to ask a registry what it currently serves. An ordinary pull does not: it honours the pins it already records, resolves only what has none, and is therefore satisfiable from what the machine holds. The refusal says which of the three places set the posture and how to allow the network for one run.

Resolution then draws only on what the machine already holds: the `catalog_dirs` search stack and the cache under `.aggrega/cache`. Against a catalog and cache that satisfy every reference, an offline pull completes normally and writes an ordinary lockfile. The lockfile records each dependency's URI, resolved version and digest, and never which of those places served the bytes — so an offline pull and an online pull that resolve the same versions write the same lockfile.

**A dependency an offline pull cannot satisfy locally halts it.** The entry is never skipped:

- A catalog entity that resolves nowhere halts the pull, naming the reference and where it was referenced from, so both the missing dependency and the thing that asked for it are named.
- A remote `source:` halts the pull, naming the source and telling you either to allow network access or to populate the cache from a connected environment.

**An external input is the one that does not halt, and it says so instead.** The render that finds them cannot fetch what is not already stored, so an offline pull over a Release with an unpinned external input completes, writes every dependency pin it resolved, and reports three things: that the render did not finish, what it did pin, and that a build of this Release will halt naming the URL. The dependency pins it wrote are correct — nothing about them depended on the render — so they are kept rather than thrown away for a reader to reproduce.

That is deliberate rather than a gap, and there is no switch for it. A pull that discarded correct work would cost you the part that succeeded; a pull that stayed quiet would hand you a lockfile that looks complete and is not. Saying so is the only outcome that leaves you able to act: run the pull again from a connected environment, or from one whose cache already holds the content, and the same command pins it.

So an offline pull is a refusal to touch the network rather than a reduced result for everything a document names, and for external inputs it is a completed resolution that tells you what it could not reach. A lockfile that exists is one whose dependency resolution completed; whether its external inputs are complete is what the pull's own output tells you, and what a build then holds it to.

## Integration with `aggrega build`

- **Verification.** `aggrega build` verifies every resolved dependency against the lockfile and halts on drift between the lockfile and the current catalog or registry state. Run `aggrega pull --upgrade --release <release>` to adopt the new state.
- **Auto-pull.** If the lockfile is missing and `auto_pull` is true (the default), `aggrega build` runs the pull first automatically. If `auto_pull` is false, the build halts and asks you to pull.
- **Offline.** Under the offline posture, `aggrega build` uses only what the machine already holds, and refuses network access before any connection is attempted. A reference whose content the cache does not hold halts the build rather than failing partway through a fetch, and a build with no lockfile at all halts naming the posture and the pull that would fill it. `--auto-pull` is not itself refused, since an incremental fill over references already cached or present in a local catalog needs nothing from a registry; `--upgrade` is, for the reason [Offline](#offline) gives.
- **Catalog search.** Pull honors `catalog_dirs` from `.aggrega-config.yaml` even when no `--catalog` is given, and resolves the same first-win search stack `aggrega build` does, so the dependencies it pins match what build searches.

## How the resolution finds external inputs

Nothing in this section changes the rule above — there is still one moment at which anything is pinned, and it is this command. What it describes is how the command reaches the third of the three kinds, which matters when you are wiring the resolution into a pipeline, reading a run that degraded, or reasoning about why this command renders at all.

**A catalog entity and a source artifact are each named in a document; an external input is not.** Resolving the first two is a matter of reading what you authored. An external input is named by a *provider*, part-way through a render, and which URLs it names follows from the values being rendered — a values entry that is absent leaves a whole subtree of a chart's schema uncompiled and every remote reference in that subtree unrequested. No read of the Release can enumerate the set.

So the command does two things in one pass: it resolves and pins the closure the documents name, then renders that closure to see which remote documents the providers ask for. The rendered artifacts are dropped and the pins are kept. Both are internal to the one command, and neither is a second moment at which something might be pinned — there is one lockfile write, and it carries every pin.

**Two consequences are worth knowing before wiring the resolution into an automated pipeline as a cheap step.** It costs more than a resolution that only reads documents, because it renders. And it can fail for a reason a document-only resolution could not: a provider that cannot render this Release. When that happens the dependency pins are still written, because nothing about them depended on the render, and the diagnostic names the stage that stopped, what was pinned, and that a build will halt naming the unpinned URL. The run is not lost, and [Offline](#offline) shows the same outcome reached a different way.

**There is no switch to skip the render.** One would preserve as an option exactly the surprise a single moment removes: a Release that resolves cleanly while an input its render needs is left unpinned, found only at build time.

**`--auto-pull` folds this same resolution into a build, and the build renders once.** The fill's render is the one that finds and pins the external inputs, and the build presents that render rather than performing a second one, so a one-command build costs the same render an ordinary build over a filled lockfile costs. [`aggrega build`](aggrega-build.md#filling-the-lockfile-as-part-of-the-build) sets out which of a build's render flags reach it.

**The set follows from the Release's parameters, which is how component pins already behave.** Editing a Release's parameters between the resolution and the build can change which URLs the render asks for and leave the build requesting one that is not pinned — the same event as editing a Release and rebuilding without resolving again, and it halts the same way, with the remedy naming this command.

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

The workspace settings pull reads can be overridden through the environment, above the committed config and below any flag: `AGGREGA_OFFLINE` (see [Offline](#offline), and [`--offline`](global-flags.md#--offline) for the flag above it), `AGGREGA_CATALOG_DIRS` (OS-path-list separated; supply absolute paths), `AGGREGA_ARTIFACT_CACHE_DIR`, `AGGREGA_DEFAULT_REGISTRY`, and `AGGREGA_SKIP_SIGNATURE_VERIFICATION` (loud — every pull logs a warning when verification is globally disabled). See [environment-variables.md](environment-variables.md) for the full list and the precedence model.

## See also

- [./aggrega-build.md](./aggrega-build.md) — verifies the lockfile and auto-pulls when configured.
- [./aggrega-serve.md](./aggrega-serve.md) — the daemon carries this same resolution at
  `aggrega/resolveDependencies`, and inside `aggrega/build` for a request whose `autoPull` field asks
  for it, so an editor can run it without leaving the session; either way it runs only when a request
  names it, and writes the same lockfile this command does.
- [./aggrega-push.md](./aggrega-push.md) — publishes catalog entities to a registry.
- [./aggrega-lint.md](./aggrega-lint.md) — the publish gate that precedes `aggrega push`.
- [../../architecture/13-catalog-and-registry.md](../../architecture/13-catalog-and-registry.md) — the catalog, lockfile, and cache model in full.

<!-- BEGIN GENERATED: cli-pull -->
**Synopsis**

```
aggrega pull [<uri>...] [flags]
```

**Description**

```
Resolve the Release's catalog and source dependencies into the cache and write the per-Release lockfile.

By default, pull reconciles the lockfile against the current dependency resolution while honoring
the pins it already records. That pin discipline governs what a registry or the content cache
serves: such an entity is fetched at its pinned version and verified against its pinned digest,
and if the registry no longer serves the pinned bytes, pull halts rather than silently re-pinning.
An entity a local catalog directory supplies is resolved from that directory instead, at the
version its file declares, and its recorded pin is not consulted — so editing a pin by hand does
not hold a locally-supplied entity at that version, and the reconcile rewrites the entry to match
the file. A reference with no pin — newly added, or removed from the lockfile by hand — is
resolved fresh and added. Entities no longer among the resolved dependencies are pruned.
Re-running pull on an unchanged dependency set is a no-op.

Use --upgrade with no positional arguments to discard the existing lockfile and re-resolve
every entity from current registry state, floating each dependency to the highest available
version. That form drops every recorded pin, so it asks for confirmation first; --yes answers in
advance, and on a non-interactive stdin it refuses rather than waiting for an answer nobody can
give. Pass one or more entity URIs after --upgrade to upgrade only those: each named pin
is dropped and re-resolved fresh while every other pin — and the recorded external inputs —
is held unchanged. A named target may also be a plugin that returns an accept-or-reject verdict;
such a plugin carries no lockfile pin, and its identity is recorded beside the lockfile instead.
Naming one the workspace still attaches adopts the identity it resolves to. Naming one the
workspace no longer attaches drops its recorded identity — the one way to clear an entry that
outlived the attachment it was recorded for. A bare --upgrade does both for every plugin at once.
A URI given without --upgrade is a usage error.
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
| `--upgrade` | `false` | Re-resolve dependencies from current registry state, floating each to the highest available version. Bare (no positional URIs) discards the lockfile and re-resolves every entity, and asks for confirmation first because it drops every recorded pin; with one or more entity URIs, re-resolves only those, holding all other pins and the recorded external inputs unchanged, and asks nothing (mutually exclusive with --verify) |
| `--verify` | `false` | Verify the existing lockfile against the current dependency resolution without writing; exits non-zero on drift or missing lockfile. Also reports the compiler and core-plugin versions the lockfile records — reported for audit and never compared against this binary, so a toolchain difference is never drift (mutually exclusive with --upgrade) |
| `--yes` | `false` | Answer the bare --upgrade confirmation in advance, for non-interactive use. It reaches that one prompt and nothing else: every other form of pull asks nothing, so passing it changes no behaviour there |
<!-- END GENERATED: cli-pull -->
