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
