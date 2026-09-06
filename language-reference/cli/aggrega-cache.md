# aggrega cache

Inspect and maintain the on-disk caches

<!-- BEGIN GENERATED: cli-cache -->
**Synopsis**

```
aggrega cache
```

**Subcommands**

| Command | Description |
| --- | --- |
| `aggrega cache clear` | Wipe every cache, including compiled modules |
| `aggrega cache evict` | Trim the compiled-module cache to a size cap, oldest first |
| `aggrega cache prune` | Remove artifact-cache entries no lockfile references |
| `aggrega cache status` | List cache contents and a total summary |

**`aggrega cache clear` flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--yes` | `false` | skip the confirmation prompt (for non-interactive/CI use) |

**`aggrega cache evict` flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--max-size` | — | size cap for the compiled-module cache (e.g. 5GiB, 512MiB, or a byte count); required |
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
