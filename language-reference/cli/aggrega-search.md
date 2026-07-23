# aggrega search

Search the local index of configured registries

<!-- BEGIN GENERATED: cli-search -->
**Synopsis**

```
aggrega search [query] [flags]
```

**Flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--capability` | `[]` | Plugin capability to match. Repeatable; a record declaring any one is kept. |
| `--kind` | `[]` | Entity kind to match (component\|feature\|recipe\|featurerecipe\|workload\|plugin). Repeatable; a record matching any one is kept. Case-insensitive. |
| `--limit` | `0` | Cap the number of results (0 means no cap). |
| `--output`, `-o` | `table` | Output format: table\|json\|names. |
| `--plugin-type` | — | Plugin socket type to match (for example provider, governance, linter). |
| `--registry` | — | Search only this registry, addressed by host or friendly alias. Default searches every configured registry. |
| `--selector`, `-l` | — | Label selector over the entity's catalog labels. Category is a label: -l component.aggrega.ai/category=compute. |
<!-- END GENERATED: cli-search -->
