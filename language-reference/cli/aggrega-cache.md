# aggrega cache

Inspect and maintain the on-disk caches

<!-- BEGIN GENERATED: cli-cache -->
**Synopsis**

```
aggrega cache
```

**Description**

```
Inspect and maintain the caches the compiler populates.

status  lists cache contents, one element per line, then a summary line.
prune   reclaims artifact-cache entries no workspace lockfile references.
evict   trims the compiled-module cache to a size cap, oldest first.
clear   wipes every cache, including the compiled-module store.
```

**Subcommands**

| Command | Description |
| --- | --- |
| `aggrega cache clear` | Wipe every cache, including compiled modules |
| `aggrega cache evict` | Trim the compiled-module cache to a size cap, oldest first |
| `aggrega cache prune` | Remove artifact-cache entries no lockfile references |
| `aggrega cache status` | List cache contents and a total summary |

**`aggrega cache clear` description**

```
Wipe every cache: the workspace artifact cache (entities, source artifacts,
external inputs) and the caches every project on the machine shares (compiled
modules, plugin descriptors and documentation bundles). This is the total-wipe
verb; unlike prune it reclaims the compiled-module cache and the documentation
bundles as well. Cleared caches repopulate on the next build, and the
documentation bundle on the next read of the documentation.

Because the wipe is irreversible, clear asks for confirmation before removing
anything. Pass --yes to skip the prompt for non-interactive use; without --yes
on a non-interactive stdin it refuses rather than blocking on a prompt no one
can answer.
```

**`aggrega cache clear` flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--yes` | `false` | skip the confirmation prompt (for non-interactive/CI use) |

**`aggrega cache evict` description**

```
Trim the compiled-module cache to a size cap by removing the
least-recently-compiled modules first, until the cache total is at or below
--max-size. The compiled-module cache is machine-global: every provider guest is
compiled once and reused across every project on the machine, so over time it can
dominate on-disk cache use.

Unlike prune (which reclaims artifact-cache entries no lockfile references) and
clear (which wipes every cache), evict is size-bounded and touches only the
compiled-module cache. Evicted modules recompile on demand on the next build, so
eviction loses no irrecoverable state.

--max-size is required and accepts a binary-unit size in the same vocabulary the
status summary prints — for example 5GiB, "4.5 GiB", or 512MiB — or a bare
integer byte count. The unit suffix is case-insensitive and an optional space
may separate the number from the unit.

This verb is the on-demand trim, at a cap you give it once. The cache is also
held to a standing cap without being asked: every invocation that loads a plugin
applies the `compiled_module_cache.max_bytes` setting (53687091200 bytes, 50 GiB,
by default) before it compiles anything, using this same removal order. Use this
verb to reclaim space now or below the standing cap; change the setting to move
the standing cap itself. When the cache already fits the cap, evict reports a
no-op and removes nothing.
```

**`aggrega cache evict` flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--max-size` | — | size cap for the compiled-module cache (e.g. 5GiB, 512MiB, or a byte count); required |

**`aggrega cache prune` description**

```
Remove cache entries whose content digest no workspace lockfile references,
retaining every referenced entry. The reference set is the union of the
digests pinned across every lockfile (*.lock) in the workspace.

Prune acts on the caches whose entries carry a content digest — the workspace
artifact cache (entities, source artifacts, external inputs) and the
plugin-describe cache — and on the compiled-module cache by reference: a compiled
plugin module is reclaimed when no lockfile still references the plugin it
belongs to, and the shared runtime module every plugin depends on is reclaimed
once the last plugin referring to it is pruned. A compiled module that cannot be
traced back to a plugin is retained rather than removed on a guess; that
remainder is reclaimed by "aggrega cache evict" or "aggrega cache clear".

Prune needs a pulled workspace: it fails when no lockfile is present.
```

**`aggrega cache status` description**

```
List the contents of every cache, one element per line, followed by a
summary line of the form "N elements, <human size>". The listing is
deterministic: identical cache state produces byte-identical output.
```
<!-- END GENERATED: cli-cache -->

## What the cache is, and what it is not

The artifact cache under `artifact_cache_dir` (`.aggrega/cache` by default) holds what a fetch put there: catalog entities and source artifacts, each stored under the coordinate and version it was fetched at and vouched for by a digest the lockfile records. It is not a catalog directory, and a catalog scan steps over it — so content sitting in the cache is read as a dependency, through the pin that vouches for it, and never as an entity you authored.

**The consequence you are most likely to meet.** If the cache holds an entity that no lockfile pins, that entity is invisible to a build, and a build that needs it halts saying it was not found. The halt names the entity, so the missing pin is identifiable from the message.

Where the entity is a SchemaLibrary a `$ref:` reaches, every command that reports the reference as unresolved follows the report with a `remediation:` line naming each library the cache holds that no lockfile entry pins and no catalog directory supplies, and the action that works for that command:

- `aggrega build` and `aggrega validate --release <release>` read the Release's lockfile, so the line names `aggrega pull --release <release>` to resolve the library and record its entry.
- `aggrega validate` with no argument, and `aggrega validate <entity-path>` with or without `--release`, read libraries from catalog directories only and read no lockfile, so no recorded entry changes their verdict. The line says so, and names `aggrega pull --release <release>` followed by `aggrega validate --release <release>`, which checks the Release against what its lockfile pins.
- `aggrega pull`, and `aggrega build --auto-pull`, under the offline posture can neither fetch the library nor record an entry for it, so the line says to run `aggrega pull --release <release>` where it can reach a registry. Connected, a pull that finds the library in no catalog directory and no registry it reads has no entry to record.

Every one of those lines also offers the other way out: author the library under a catalog directory.

**What to run.** `aggrega pull --release <release>` resolves the entity and records its digest, after which the same build finds it. Where the entity is yours rather than a dependency, author it under a directory listed in `workspace.catalog_dirs` instead — a scan reads that. `aggrega cache prune` clears out the entries no lockfile references, which is the tidying half of the same rule.

For the cache layout, the `artifact_cache_dir` contract, and why a resolution artifact is deliberately not readable as authored content, see [architecture/13-catalog-and-registry.md](../../architecture/13-catalog-and-registry.md).

## Which caches belong to this project, and which to the machine

Not every cache these commands act on is scoped to the project you are standing in, and the difference decides how far a reclamation reaches.

**Yours alone.** The artifact cache under `artifact_cache_dir` — the entities, source artifacts and pinned external inputs this project has resolved. Reclaiming from it affects this project and nothing else.

**Shared by every Aggrega project on this machine.** The compiled-module store, the plugin-describe store and the documentation-bundle store. A provider guest is compiled once and reused by every project, which is what makes the second build of anything fast, so removing an entry means the next build of *any* project on the machine recompiles it. The documentation bundle — the published pages [`aggrega explain`](aggrega-explain.md), an editor's explanations and an assistant's documentation resources are read from — is kept once per registry and version, because its contents depend on nothing else: whichever of them fetches it first fetches it for every project, and each project is still served it only once its own signature check admits the copy. Nothing is lost permanently — a removed module is rebuilt on demand, and a removed bundle is fetched again by the next explanation, or by an assistant server when it next starts — but the cost lands on whoever builds next, which may not be you.

The machine-wide stores are kept where each platform keeps a user's caches: on Windows under `aggrega\cache` inside the directory the `LOCALAPPDATA` environment variable names, under `~/Library/Caches/aggrega` on macOS, and under an `aggrega` directory inside the one `XDG_CACHE_HOME` names — `~/.cache/aggrega` when `XDG_CACHE_HOME` is unset — on Linux and the other Unix systems. `aggrega config init` prints the directory on the machine it runs on. Where none of those variables is set, compiled plugins are kept only for the run, and no documentation bundle is kept at all: an explanation then says why its walk-through is missing, and an assistant's documentation resources answer not-found.

`aggrega cache status` states this per class rather than leaving it to be inferred from the name: each class is reported as covering the workspace or the machine, and the same reach is reported for each element `prune`, `evict` and `clear` remove. `evict` acts only on the shared compiled-module store; `prune` never removes a documentation bundle, since no lockfile references one, and reports the store as not prune-eligible; `clear` acts on everything, which is why it asks before it starts.

**A workspace root that cannot be used.** Where the workspace root the command is given is a file or a path that does not exist, `status`, `evict` and `clear` act on the machine-wide stores alone, exit as they otherwise would, and say so on standard error, in the words every other command refuses that root with:

> note: --workspace-root names the workspace root `"<root>"`, which is not a directory: `<root>`; only the machine-wide caches are acted on

A path that does not exist reads `which cannot be used:` and the reason in place of `which is not a directory:`. `prune` stops instead, since it needs the workspace's lockfiles.

**This applies wherever the operation is invoked from, not only at a terminal.** The same operations are reachable from an editor session and from an assistant's tool call, and their answers carry the same reach for the same reason. Where an assistant may invoke them on your behalf, see [`aggrega mcp`](aggrega-mcp.md).

## A link in the artifact cache

The artifact cache directory is the one place everything in the cache is read from, written to and removed from — the default `.aggrega/cache` and a directory `artifact_cache_dir` names climbing out of the workspace root (`../shared-cache`) alike. Anything in it that is a symbolic link leading out of that directory — one of the cache's own directories, such as `.aggrega/cache/inputs`, or a file inside one — is neither read, written nor removed through, even where the link leads to another directory of the same workspace. What a write may reach beneath the cache directory is exactly what a removal may reach.

- **A pull, a build and every other operation that writes the cache** stop with [`E0320`](../errors/fatal-halts.md#a-path-the-operation-writes-leads-through-a-link-out-of-the-directory-it-must-stay-inside), naming the link and where it leads, and write nothing.
- **`status`, `prune` and `clear`** list nothing through such a link. Where one of the cache's own directories is the link, `status` stops with [`E0321`](../errors/fatal-halts.md#a-file-the-operation-reads-leads-through-a-link-out-of-the-directory-it-must-stay-inside), and a `prune` or a `clear` stops with `E0320` before it lists or removes anything — so nothing the link points to is removed, and the link stays where it is. Where a file inside one is the link, all three stop with `E0321`.
- **A build, a pull and every other operation that reads the cache** stop with `E0321` rather than reading bytes kept elsewhere, even where those bytes would match the digest the lockfile records.
- **A link that stays inside the cache directory is followed.** Where one of the cache's own directories is a link to another directory inside the cache directory, that directory is the cache's: `status` lists what lies there, `prune` removes from there, and `clear` empties it, keeps the link, and reports the bytes it removed there.

**The cache directory itself.** An `artifact_cache_dir` written inside the workspace root — the default included — may itself be a link to another directory of the workspace, and the cache is then kept where the link leads. One leading out of the workspace is refused: whichever operation meets it stops with `E0321` or `E0320`, naming the link, before anything is read or written through it. A directory written climbing out of the workspace root is honoured where it leads, even when it is itself a link.

Remove the link and pull again to fill the cache in place. To keep the cache somewhere else, set `artifact_cache_dir` to that directory, written relative to the workspace root, rather than linking to it: a directory named there is read and written where it leads. The machine-wide stores are not held to any workspace; one you keep elsewhere through a link is listed, pruned and cleared where the link leads, and `clear` keeps the link. [The workspace boundary](workspace-boundary.md) states the rule whole.

## See also

- [`aggrega-pull`](aggrega-pull.md) — resolve a Release's dependencies into the lockfile and the cache.
- [`aggrega-config`](aggrega-config.md) — where `artifact_cache_dir` and the other cache settings are written.
