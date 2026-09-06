# aggrega acquire

Pin the external inputs a Release's render consumes

## See also

- [./aggrega-pull.md](./aggrega-pull.md) — resolves the catalog and source dependencies this
  command's render runs against, and writes the lockfile the pins are recorded in.
- [./aggrega-serve.md](./aggrega-serve.md) — the daemon carries this same operation at
  `aggrega/acquireExternalInputs`, so an editor can run it without leaving the session; it runs only
  when a request names it, and records the same pins this command does.

<!-- BEGIN GENERATED: cli-acquire -->
**Synopsis**

```
aggrega acquire [flags]
```

**Flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--catalog` | `[]` | Catalog directory; repeatable. Each --catalog is prepended to the workspace catalog_dirs search stack (first match wins). Defaults to the current directory. |
| `--release` | — | Path to Release YAML file (required) |
<!-- END GENERATED: cli-acquire -->
