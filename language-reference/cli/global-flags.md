# Global Flags

Flags available on every `aggrega` subcommand.

## `--workspace-root <path>`

Use `<path>` as the workspace root, skipping discovery entirely. When the flag is omitted, `aggrega` discovers the root by walking upward from the current directory; see [Configuration](configuration.md#the-other-ways-a-project-root-is-recognised) for what anchors a root and in what order.

`AGGREGA_WORKSPACE_ROOT` is the environment counterpart: when `--workspace-root` is not given, the variable supplies the root. The flag wins when set.

## Global config file

`--config <path>` names the global config file explicitly for one invocation. It wins over `$AGGREGA_CONFIG`, which in turn wins over the default location — and because both name a file deliberately, a path that does not exist is a loud error rather than a silent fallback. Unlike the `AGGREGA_*` setting variables, neither overrides a single setting; they select which file applies. Whichever file resolves, the project's own config files still layer on top of it. [Configuration](configuration.md#naming-the-global-file-explicitly) carries the resolution order and what belongs in that file.

`--config` and `$AGGREGA_CONFIG` select the write target as well as the read source: a command run with `--config <path>` reads its configuration from that file and applies its change to that same file, so what a command writes is what the next command in the same invocation shape reads back.

Config-mutating commands choose which file they write from the nature of the setting: machine-wide tool config (a registry) defaults to the global file, while build-participating config (a provider binding or a governance/linter/importer socket attachment) defaults to the committed project file. Pass `--global` or `--workspace` to override, and the command prints where it wrote.

To seed a global config on a fresh machine — registering a registry and its signature trust policy so signed artifacts pull and verify without hand-editing YAML — run [`aggrega config init`](aggrega-config.md). To see what applies right now, and with `--origin` which layer decided each setting, run [`aggrega config show`](aggrega-config.md).

## Configuration precedence

A flag wins over everything: over an environment variable, over the configuration files, and over the built-in default. [Configuration](configuration.md#what-overrides-what) carries the full ladder, and [environment-variables.md](environment-variables.md) the list of `AGGREGA_`-prefixed variables.

## See also

- [configuration.md](configuration.md) — which file a setting belongs in, and the full precedence model.
- [environment-variables.md](environment-variables.md) — the full `AGGREGA_*` variable reference.
- [aggrega-serve.md](aggrega-serve.md) — the daemon resolves its workspace through the same root-discovery path.

<!-- BEGIN GENERATED: global-flags -->
| Flag | Default | Description |
| --- | --- | --- |
| `--config` | — | path to the global config file, overriding $AGGREGA_CONFIG and the default location. Workspace-tree config files still layer on top |
| `--no-color` | `false` | Disable ANSI color in all output. Also honored via the NO_COLOR environment variable |
| `--plain` | `false` | Accessible mode: disable color and draw plain, static progress lines with no spinner animation or cursor repaint, even on a terminal. Intended for screen readers |
| `--workspace-root` | — | absolute path to use as the workspace root (skips discovery) |
<!-- END GENERATED: global-flags -->
