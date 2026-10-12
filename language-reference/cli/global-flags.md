# Global Flags

Flags available on every `aggrega` subcommand.

## `--workspace-root <path>`

Use `<path>` as the workspace root, skipping discovery entirely. When the flag is omitted, `aggrega` discovers the root by walking upward from the current directory — or, where that walk finds nothing and the command names its Release or document by an absolute path, by walking upward from that file's folder instead; see [Configuration](configuration.md#the-other-ways-a-project-root-is-recognised) for what anchors a root, in what order, and which commands name such a file.

`AGGREGA_WORKSPACE_ROOT` is the environment counterpart: when `--workspace-root` is not given, the variable supplies the root. The flag wins when set.

The root is the root wherever it is given, the servers included: a request to [`aggrega mcp`](aggrega-mcp.md) that names no workspace of its own is answered in it, with nothing above it searched. A root that is not an existing folder — a path naming nothing, or naming a file — is refused by every command that reads its workspace, before the command does anything else; `aggrega serve` and an `aggrega mcp` listener refuse to start over one, and `aggrega mcp` over standard input and output starts all the same and answers every call that acts in that workspace with the refusal. The refusal names whichever of the two supplied it, `--workspace-root` or `AGGREGA_WORKSPACE_ROOT`, with the value exactly as it was given. A command that reads no workspace, such as `aggrega version`, does not read the root either and is not refused for it.

Where neither is given and discovery anchors nothing, the folder the command runs in is the root, and a command that reads its workspace says so in one line on standard error, naming that folder and this flag; see [Configuration](configuration.md#the-other-ways-a-project-root-is-recognised), which also says why nothing is written into an artifact cache in such a folder.

## Global config file

`--config <path>` names the global config file explicitly for one invocation. It wins over the `AGGREGA_CONFIG` environment variable, which in turn wins over the default location — and because both name a file deliberately, a path that does not exist is a loud error rather than a silent fallback. Unlike the `AGGREGA_*` setting variables, neither overrides a single setting; they select which file applies. Whichever file resolves, the project's own config files still layer on top of it. [Configuration](configuration.md#naming-the-global-file-explicitly) carries the resolution order and what belongs in that file.

`--config` and the `AGGREGA_CONFIG` environment variable select the write target as well as the read source: a command run with `--config <path>` reads its configuration from that file and applies its change to that same file, so what a command writes is what the next command in the same invocation shape reads back.

Config-mutating commands choose which file they write from the nature of the setting: machine-wide tool config (a registry) defaults to the global file, while build-participating config (a provider binding or a governance/linter/importer socket attachment) defaults to the committed project file. Pass `--global` or `--workspace` to override, and the command prints where it wrote.

To seed a global config on a fresh machine — registering a registry and its signature trust policy so signed artifacts pull and verify without hand-editing YAML — run [`aggrega config init`](aggrega-config.md). To see what applies right now, and with `--origin` which layer decided each setting, run [`aggrega config show`](aggrega-config.md).

## `--offline`

Refuse every network reach for this one run.

Offline is a workspace posture rather than a mode of one command, and it is reachable from three places: this flag, `AGGREGA_OFFLINE`, and the top-level `offline` key in a configuration file. They mean the same thing and they sit in the usual order — the flag wins over the variable, which wins over the file.

**The off direction is as much the flag's job as the on direction.** `--offline=false` allows the network for one command where a committed configuration file or an exported variable has turned the posture on. That matters when the file is not yours to edit: a project whose `.aggrega-config.yaml` carries `offline: true` refuses a publication for everyone who clones it, and passing `--offline=false` is the one answer that needs no commit and no exported variable.

### What refuses, and what does not

The line is what the work needs rather than which command was typed.

**Refused, because it cannot be true without reaching a registry:**

- `--upgrade`, wherever it appears. It re-resolves every dependency and floats each to the highest version a registry currently offers, and "highest available" is a claim about what a registry serves right now. Running it against a warm cache would pin whatever happened to be cached while reporting that it had floated to the newest, which is worse than a halt.
- The commands whose own work is a network round trip: [`aggrega push`](aggrega-push.md), [`aggrega push-artifact`](aggrega-push-artifact.md), and [`aggrega registry update`](aggrega-registry.md). These say so before reading your entity or walking your repositories, and the refusal names which of the three places set the posture, so somebody who typed no flag knows where to look.

**Not refused, because the machine may already be able to satisfy it:**

- An ordinary [`aggrega pull`](aggrega-pull.md), and `aggrega build --auto-pull`. Both honour the pins already recorded and resolve only what has none, so a workspace whose references are all cached or present in a `catalog_dirs` catalog completes without reaching out at all. Where such a run genuinely does need to fetch something, it is refused at that point and told which reference it could not satisfy.
- `aggrega build` against a filled lockfile, which reads its whole closure from the cache. The one reach it has is a repair: where the store's copy of a pinned external input has gone missing, that input is refetched by the digest the lockfile already records. Under the posture there is no transport for even that, so the missing copy halts the build instead, naming the posture.
- A `--dry-run` publication. Its whole behaviour is to report what it would publish and call nothing, which makes it the offline-safe form of publishing rather than a contradiction of the posture.

An airgapped machine holding a local copy of its catalog and artifacts is the case this split exists to keep working: such a workspace is offline, and almost everything it does is still satisfiable.

## Configuration precedence

A flag wins over everything: over an environment variable, over the configuration files, and over the built-in default. [Configuration](configuration.md#what-overrides-what) carries the full ladder, and [environment-variables.md](environment-variables.md) the list of `AGGREGA_`-prefixed variables.

`aggrega config show --origin` reports which of those layers decided each setting, and a flag you typed is reported as the flag — so when a refusal names a layer you did not expect, that command is where you confirm it.

## See also

- [configuration.md](configuration.md) — which file a setting belongs in, and the full precedence model.
- [environment-variables.md](environment-variables.md) — the full `AGGREGA_*` variable reference.
- [aggrega-serve.md](aggrega-serve.md) — the daemon resolves its workspace through the same root-discovery path.

<!-- BEGIN GENERATED: global-flags -->
| Flag | Default | Description |
| --- | --- | --- |
| `--config` | — | path to the global config file, overriding the AGGREGA_CONFIG environment variable and the default location. Workspace-tree config files still layer on top |
| `--no-color` | `false` | Disable ANSI color in all output. Also honored via the NO_COLOR environment variable |
| `--offline` | `false` | Refuse every network reach for this one run: the offline posture, turned on without editing configuration. Pass --offline=false to turn it off for one run where the configuration file or AGGREGA_OFFLINE already turns it on. What refuses is what cannot be true without a registry: --upgrade, whose whole job is to float each dependency to the highest version a registry currently offers, and the commands whose own work is a network round trip — push, push-artifact, and registry update. What still runs is whatever the machine can already satisfy: a build against a filled lockfile, --auto-pull over references already cached or present in a local catalog, and a dry run, which reports what it would publish and calls nothing |
| `--plain` | `false` | Accessible mode: disable color and draw plain, static progress lines with no spinner animation or cursor repaint, even on a terminal. Intended for screen readers |
| `--workspace-root` | — | absolute path to use as the workspace root (skips discovery) |
<!-- END GENERATED: global-flags -->
