# Global Flags

Flags available on every `aggrega` subcommand.

## `--workspace-root <path>`

Use `<path>` as the workspace root, skipping discovery. When omitted, `aggrega` discovers the root by walking upward from the current directory: a `.aggrega-config.yaml` carrying a `workspace:` block anchors the root, otherwise a heuristic marker (`.aggrega/`, `aggregate*.yaml`, `release*.yaml`, `manifest*.yaml`) does; if nothing anchors, the current directory is used.

`AGGREGA_WORKSPACE_ROOT` is the environment counterpart: when `--workspace-root` is not given, the variable supplies the root. The flag wins when set.

## `AGGREGA_CONFIG`

Points at an explicit global `.aggrega-config.yaml` to load beneath the workspace cascade. Unlike the `AGGREGA_*` setting variables, it selects which config file applies rather than overriding a single setting.

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
| `--no-color` | `false` | Disable ANSI color in all output. Also honored via the NO_COLOR environment variable |
| `--plain` | `false` | Accessible mode: disable color and draw plain, static progress lines with no spinner animation or cursor repaint, even on a terminal. Intended for screen readers |
| `--workspace-root` | — | absolute path to use as the workspace root (skips discovery) |
<!-- END GENERATED: global-flags -->
