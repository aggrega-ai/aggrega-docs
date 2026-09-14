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
external inputs) and the two global caches (compiled modules and plugin
descriptors). This is the total-wipe verb; unlike prune it reclaims the
compiled-module cache as well. Cleared caches repopulate on the next build.

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

The artifact cache under `artifact_cache_dir` (`.aggrega/cache` by default) holds what a fetch put there: catalog entities and source artifacts, addressed by content and vouched for by a digest the lockfile records. It is not a catalog directory, and a catalog scan steps over it — so content sitting in the cache is read as a dependency, through the pin that vouches for it, and never as an entity you authored.

**The consequence you are most likely to meet.** If the cache holds an entity that no lockfile pins, that entity is invisible to a build, and a build that needs it halts saying it was not found. The halt names the entity, so the missing pin is identifiable from the message.

**What to run.** `aggrega pull --release <release>` resolves the entity and records its digest, after which the same build finds it. Where the entity is yours rather than a dependency, author it under a directory listed in `workspace.catalog_dirs` instead — a scan reads that. `aggrega cache prune` clears out the entries no lockfile references, which is the tidying half of the same rule.

For the cache layout, the `artifact_cache_dir` contract, and why a resolution artifact is deliberately not readable as authored content, see [architecture/13-catalog-and-registry.md](../../architecture/13-catalog-and-registry.md).

## Which caches belong to this project, and which to the machine

Not every cache these commands act on is scoped to the project you are standing in, and the difference decides how far a reclamation reaches.

**Yours alone.** The artifact cache under `artifact_cache_dir` — the entities, source artifacts, pinned external inputs and documentation bundles this project has resolved. Reclaiming from it affects this project and nothing else.

**Shared by every Aggrega project on this machine.** The compiled-module store and the plugin-describe store. A provider guest is compiled once and reused by every project, which is what makes the second build of anything fast, so removing an entry means the next build of *any* project on the machine recompiles it. Nothing is lost permanently — a removed module is rebuilt on demand — but the cost lands on whoever builds next, which may not be you.

`aggrega cache status` states this per class rather than leaving it to be inferred from the name: each class is reported as covering the workspace or the machine, and the same reach is reported for each element `prune`, `evict` and `clear` remove. `evict` acts only on the shared compiled-module store; `clear` acts on everything, which is why it asks before it starts.

**This applies wherever the operation is invoked from, not only at a terminal.** The same operations are reachable from an editor session and from an assistant's tool call, and their answers carry the same reach for the same reason. Where an assistant may invoke them on your behalf, see [`aggrega mcp`](aggrega-mcp.md).

## See also

- [`aggrega-pull`](aggrega-pull.md) — resolve a Release's dependencies into the lockfile and the cache.
- [`aggrega-config`](aggrega-config.md) — where `artifact_cache_dir` and the other cache settings are written.
