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

## See also

- [`aggrega-pull`](aggrega-pull.md) — resolve a Release's dependencies into the lockfile and the cache.
- [`aggrega-config`](aggrega-config.md) — where `artifact_cache_dir` and the other cache settings are written.
