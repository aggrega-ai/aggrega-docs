# Global Flags

Flags available on every `aggrega` subcommand.

## `--workspace-root <path>`

Use `<path>` as the workspace root, skipping discovery. When omitted, `aggrega` discovers the root by walking upward from the current directory: a `.aggrega-config.yaml` carrying a `workspace:` block anchors the root, otherwise a heuristic marker (`.aggrega/`, `aggregate*.yaml`, `release*.yaml`, `manifest*.yaml`) does; if nothing anchors, the current directory is used.

`AGGREGA_WORKSPACE_ROOT` is the environment counterpart: when `--workspace-root` is not given, the variable supplies the root. The flag wins when set.

## Global config file

A global config file loads beneath the workspace cascade — the home for machine-wide "declare once, use in every workspace" settings such as registries. It loads automatically from the XDG default location, `$XDG_CONFIG_HOME/aggrega/config.yaml` (falling back to `~/.config/aggrega/config.yaml`), when present.

`AGGREGA_CONFIG` overrides that path: set it to point at an explicit global `.aggrega-config.yaml` instead of the XDG default. Unlike the `AGGREGA_*` setting variables, it selects which config file applies rather than overriding a single setting; a path it names that does not exist is a loud error.

The `--config <path>` global flag is the per-invocation form of the same override, and it wins over both: `--config` beats `$AGGREGA_CONFIG`, which beats the XDG default location. Whichever file the global layer resolves to, the workspace-tree cascade still layers on top of it.

Config-mutating commands choose where they write from the nature of the setting: machine-wide tool config (a registry) defaults to the global file, while build-participating config (a provider binding or a mutator/policy/linter/importer socket attachment) defaults to the committed workspace file. Pass `--global` or `--workspace` to override, and the command prints where it wrote.

Whichever file the global layer resolves to is the file those commands write when they write globally. `--config` and `$AGGREGA_CONFIG` therefore select the write target as well as the read source: a command run with `--config <path>` reads its configuration from that file and applies its change to that same file, so what a command writes is what the next command in the same invocation shape reads back.

To seed a global config on a fresh machine — registering a registry and its signature trust policy so signed artifacts pull and verify without hand-editing YAML — run [`aggrega config init`](aggrega-config.md). To see the configuration that applies right now — the ordered cascade of files and environment overrides that contributed, the effective merged result, and, with `--origin`, the layer each setting came from — run [`aggrega config show`](aggrega-config.md).

## Configuration precedence

Every configurable setting resolves through one layered ladder:

```
CLI flag  >  environment variable  >  .aggrega-config.yaml  >  built-in default
```

A flag wins over everything; an environment variable overrides the committed config; the config cascade overrides the built-in default. See [environment-variables.md](environment-variables.md) for the full list of `AGGREGA_`-prefixed variables and the model.

## See also

- [environment-variables.md](environment-variables.md) — the full `AGGREGA_*` variable reference and precedence model.
- [aggrega-serve.md](aggrega-serve.md) — the daemon resolves its workspace through the same root-discovery path.

<!-- BEGIN GENERATED: global-flags -->
| Flag | Default | Description |
| --- | --- | --- |
| `--config` | — | path to the global config file, overriding $AGGREGA_CONFIG and the default location. Workspace-tree config files still layer on top |
| `--no-color` | `false` | Disable ANSI color in all output. Also honored via the NO_COLOR environment variable |
| `--plain` | `false` | Accessible mode: disable color and draw plain, static progress lines with no spinner animation or cursor repaint, even on a terminal. Intended for screen readers |
| `--workspace-root` | — | absolute path to use as the workspace root (skips discovery) |
<!-- END GENERATED: global-flags -->
