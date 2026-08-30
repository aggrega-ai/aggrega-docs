# aggrega config

Inspect and manage the workspace configuration

<!-- BEGIN GENERATED: cli-config -->
**Synopsis**

```
aggrega config
```

**Subcommands**

| Command | Description |
| --- | --- |
| `aggrega config capture` | Freeze the effective build-critical configuration into this workspace |
| `aggrega config init` | Seed a working configuration with a registry and its trust policy |
| `aggrega config show` | Show the effective configuration and where each setting came from |

**`aggrega config capture` flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--all-plugins` | `false` | Capture all plugin sockets, including the verdict-role governance, linter, and importer gates. Without it, capture freezes only the sockets that determine the rendered output (the provider bindings and the transform-role governance attachments). |

**`aggrega config init` flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--force` | `false` | Overwrite an existing config file. Without it, init refuses when the target file already exists. |
| `--global` | `false` | Write the entry to the global config shared across every workspace. This is the default. |
| `--registry` | `hub.aggrega.ai` | Registry host to seed with its trust policy. Defaults to the official hub. |
| `--workspace` | `false` | Write the entry to this project's workspace config instead of the global config. |

**`aggrega config show` flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--global` | `false` | Print the global config file's own bytes verbatim, preserving its comments and formatting. |
| `--origin` | `false` | Annotate each effective setting with the layer it came from (a config file, an environment variable, or the built-in defaults). |
| `--workspace` | `false` | Print this project's workspace config file's own bytes verbatim, preserving its comments and formatting. |
<!-- END GENERATED: cli-config -->

## What it does

The `config` subcommands seed, inspect, and freeze the configuration that governs a build. Configuration resolves through a layered cascade — a machine-wide global file beneath the workspace-tree config files, with environment variables and flags overriding on top. See [global-flags.md](global-flags.md#global-config-file) for the global config file and the full precedence model.

### `config init` — seed a working configuration

`aggrega config init` seeds a config on a fresh machine by registering a registry and its signature trust policy, so signed artifacts pull and verify without hand-editing YAML. By default it registers the official hub (`hub.aggrega.ai`) with signatures required and its official trusted identities. The registry's advertised trust policy is fetched once from its own origin and pinned locally (trust-on-first-use); when the registry is unreachable or advertises nothing, the built-in official baseline is written instead, so `init` still produces a usable config offline.

- `--registry <host>` seeds a different registry — an air-gapped or private hub — instead of the official one.
- If the target file already exists, `init` refuses rather than overwrite it; `--force` writes anyway, merging the registry entry into the existing file and preserving other settings.

### `config show` — inspect what applies right now

`aggrega config show` reports the configuration that applies right now. In its default view it leads with the cascade of config files and environment overrides that contributed, lowest precedence first, then prints the effective merged configuration — the global config, the workspace-tree cascade, and any environment overlay combined into a single result. This loaded-file cascade is where you confirm which files and environment overrides shaped the current configuration.

Two focused views narrow the output:

- `--global` or `--workspace` prints a single layer's own file bytes verbatim, comments and formatting preserved; when that layer's file does not exist it says so rather than failing. The two are mutually exclusive.
- `--origin` annotates each effective setting with the layer it came from — a config file, an environment variable, or the built-in defaults. Scalar settings are attributed per value; list and map settings are attributed as a whole to the layer that last changed them.

### `config capture` — freeze build-critical settings

`aggrega config capture` writes the effective build-critical configuration into this project's workspace config file, so the workspace builds identically without relying on the machine's global configuration. Machine-wide tooling settings such as a registry's trust policy are not captured; they stay in the global config by their nature. Running it again on an unchanged configuration rewrites the same file byte-for-byte.

The captured subset is a set of plugin socket attachments and the catalog directories:

- By default capture freezes only the sockets that determine the rendered output — the provider bindings and the transform-role governance attachments — since only those must travel with the project for byte-identical builds. The catalog directories are always captured.
- `--all-plugins` widens the captured sockets to include the verdict-role governance, linter, and importer sockets as well. Without it those three stay free to vary by environment.

## See also

- [global-flags.md](global-flags.md) — the global config file, the `--config` flag, and the precedence ladder.
- [environment-variables.md](environment-variables.md) — the `AGGREGA_*` variables that override configuration at runtime.
- [aggrega-registry.md](aggrega-registry.md) — manage registries and their trust policy directly.
- [aggrega-cache.md](aggrega-cache.md) — what the directory `artifact_cache_dir` names actually holds, and why an entity sitting there that no lockfile pins is not found by a build.
