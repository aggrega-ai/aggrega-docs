# aggrega config

Inspect and manage the workspace configuration

<!-- BEGIN GENERATED: cli-config -->
**Synopsis**

```
aggrega config
```

**Description**

```
Inspect and manage the configuration Aggrega reads.

Most projects need two files.

One .aggrega-config.yaml at your project root, carrying a "workspace:" block —
that block is what marks the root — holds how this project builds: its catalog
directories, its provider bindings, which lint rules it relaxes. It is
committed, so a teammate who clones the project builds it the same way.

One global file at ~/.config/aggrega/config.yaml is shared across every
workspace on this machine. It holds what belongs to the machine rather than to
any one project: the registries you pull from and the signature trust policy
for each, how large the compiled-module store may grow, any command extension
you have installed. It loads automatically when it is there, and nothing
breaks when it is not.

Your project's file wins over the global one, an environment variable wins
over both, and a flag wins over everything.

Secrets are not configuration. A registry password or a signing identity token
is never a field in either file; it is supplied by environment variable or flag
at the moment it is needed.

Because the effective configuration is assembled rather than written anywhere,
"aggrega config show" is how you see what actually applies, and --origin is how
you find out which layer each setting came from. "aggrega config init" seeds a
working configuration, and "aggrega config capture" freezes the effective
build-critical settings into this workspace so a build does not depend on a
global file that is not committed.

Larger projects have more to work with. None of it is needed to start, and each
piece exists for the shape it solves:

  More than one file inside a project. Every .aggrega-config.yaml from the
  project root down to the directory you run in contributes, a nearer file
  overriding a farther one. Only a file carrying "workspace:" marks the root;
  one without it contributes settings without anchoring anything.

  Extending a list instead of replacing it. A nearer file's list replaces the
  farther one's. The companions catalog_dirs_append, governance_append,
  linter_append, importer_append and providers_append concatenate onto the
  resolved list at each layer instead of shadowing it.

  A file your pipeline owns. .aggrega-config-append-ci.yaml may sit beside the
  hand-authored file in any of those directories, so automation can overwrite
  it wholesale without touching what a person wrote. It is additive only: it
  removes nothing and overrides no scalar, and a scalar key written in it is
  ignored and named in a warning. It never marks a root.

  A relative path anchors to the file that declared it. A catalog directory, a
  local plugin path, or an entry under a plugin's with.sources resolves against
  the directory of the config file it was written in — not the project root,
  and not the directory you ran the command from. So the same "./catalog" names
  a different directory depending on which file carries it. Two settings sit
  outside this rule: artifact_cache_dir is interpreted relative to the project
  root wherever you run from, and AGGREGA_CATALOG_DIRS has no declaring file at
  all, so supply absolute paths in it.

  The other root markers. A "workspace:" block wins outright at whatever depth
  it sits. Failing one, the nearest .aggrega/ directory or aggregate*.yaml,
  release*.yaml or manifest*.yaml file anchors the root, in that order within a
  directory; failing everything, your working directory is used.
  --workspace-root skips discovery entirely.

  Naming the global file. --config <path> wins over $AGGREGA_CONFIG, which
  wins over the default location. Both name a file deliberately, so a path
  either gives that does not exist is a loud error rather than a silent
  fallback. Whichever file resolves is also the one a config-writing command
  writes when it writes globally.
```

**Subcommands**

| Command | Description |
| --- | --- |
| `aggrega config capture` | Freeze the effective build-critical configuration into this workspace |
| `aggrega config init` | Seed a working configuration with a registry and its trust policy |
| `aggrega config show` | Show the effective configuration and where each setting came from |

**`aggrega config capture` description**

```
Write the effective build-critical configuration into this project's workspace
config file, so the workspace builds identically without relying on the
machine's global configuration.

The build-critical subset is the configuration a build participates in: a set of
plugin socket attachments and the catalog directories. By default the captured
sockets are only those that determine the
rendered output — the provider bindings and the transform-role governance attachments — since only those must
travel with the project for byte-identical output. Pass --all-plugins to also
freeze the verdict-role governance, linter, and importer sockets, which otherwise stay free to
vary by environment. Each field is written at its effective value — the value
that resolves right now with the global configuration and the workspace tree
merged together — so a binding that today comes only from the global config is
materialized into the workspace and travels with the project.

Machine-wide tooling settings, such as a registry's trust policy, are not
captured: they stay in the global config by their nature. Capture always writes
this project's workspace config file. Running it again on an unchanged
configuration rewrites the same file byte-for-byte.
```

**`aggrega config capture` flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--all-plugins` | `false` | Capture all plugin sockets, including the verdict-role governance, linter, and importer gates. Without it, capture freezes only the sockets that determine the rendered output (the provider bindings and the transform-role governance attachments). |

**`aggrega config init` description**

```
Seed a working configuration by registering a registry and its signature trust
policy, so a fresh machine can pull and verify signed artifacts without editing
YAML by hand.

By default it registers the official hub (hub.aggrega.ai) with signatures
required and the official trusted identities. The registry's advertised trust
policy is fetched once from its own origin and pinned locally — trust-on-first-
use; when the registry is unreachable or advertises nothing, the built-in
official baseline is written instead, so init still produces a usable config
offline. Pass --registry to seed a different registry (for an air-gapped or
private hub).

The entry is written to the global config shared across every workspace by
default; pass --workspace to write it to this project's workspace config
instead. If the target config file already exists, init refuses rather than
overwrite it — pass --force to write anyway (the registry entry is merged into
the existing file, other settings preserved).

A seeded configuration is a document you own and go on editing, so --dry-run does
everything init does except write: it hands the content back, creating and
modifying nothing. The answer names the file the content is for — which matters
here, because the target is the global config unless --workspace selects this
project's own. A caller that keeps its own document model puts the content there,
where it is visible before it is saved and can be amended or undone. The registry
is still contacted for its advertised trust policy, because the policy in that
content is the policy a write would have pinned.

Because a dry run does everything else init does, it refuses an existing config
file exactly as a write refuses it, and for the same reason. So its exit code
predicts the write's: if the dry run refuses, init would have refused. Pass
--force alongside it to see the merge an overwriting write would produce.

Under --dry-run standard output carries that content and nothing else, so it stays
parseable. A registry that advertises no trust policy still produces its notice,
on standard error: read that stream too, or a configuration seeded with no trust
policy arrives without the advice to pin identities by hand.
```

**`aggrega config init` flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--dry-run` | `false` | Do everything except write: hand back the seeded configuration as content, naming the file it is for, and create or modify nothing. Every other behaviour is the write's, so an existing config file is refused exactly as a write refuses it — pass --force alongside it for the merge an overwriting write would produce. |
| `--force` | `false` | Overwrite an existing config file. Without it, init refuses when the target file already exists. |
| `--global` | `false` | Write the entry to the global config shared across every workspace. This is the default. |
| `--registry` | `hub.aggrega.ai` | Registry host to seed with its trust policy. Defaults to the official hub. |
| `--workspace` | `false` | Write the entry to this project's workspace config instead of the global config. |

**`aggrega config show` description**

```
Show the configuration that applies right now.

By default it leads with the cascade of config files and environment overrides
that contributed, lowest precedence first, then prints the effective merged
configuration — the global config, the workspace-tree cascade, and any
environment override combined into what applies right now.

Pass --global or --workspace to print a single layer's own file bytes verbatim,
preserving its comments and formatting; when that layer's file does not exist it
says so rather than failing. The two are mutually exclusive.

Pass --origin to annotate each effective setting with the layer it came from —
a command-line flag, an environment variable, a config file, or the built-in
defaults, highest precedence first. A flag is named as the reader typed it, so
a setting a flag decided reports that flag as its source. A setting is
attributed to the highest-precedence layer that sets it, whatever value that
layer writes: a file restating the default is the file named, not the built-in
defaults. List and map settings are attributed as a whole. The signing
requirement is the one exception: any layer may turn it on and none can turn it
off, so it names the first layer that turns it on.
```

**`aggrega config show` flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--global` | `false` | Print the global config file's own bytes verbatim, preserving its comments and formatting. |
| `--origin` | `false` | Annotate each effective setting with the layer it came from (a command-line flag, an environment variable, a config file, or the built-in defaults). |
| `--workspace` | `false` | Print this project's workspace config file's own bytes verbatim, preserving its comments and formatting. |
<!-- END GENERATED: cli-config -->

## What it does

The `config` subcommands seed, inspect, and freeze the configuration that governs a build. For which file a setting belongs in and how the layers combine, see [Configuration](configuration.md) — it starts with the two files most projects need and keeps the rest behind that.

### `config init` — seed a working configuration

`aggrega config init` seeds a config on a fresh machine by registering a registry and its signature trust policy, so signed artifacts pull and verify without hand-editing YAML. By default it registers the official hub (`hub.aggrega.ai`) with signatures required and its official trusted identities. The registry's advertised trust policy is fetched once from its own origin and pinned locally (trust-on-first-use); when the registry is unreachable or advertises nothing, the built-in official baseline is written instead, so `init` still produces a usable config offline.

- `--registry <host>` seeds a different registry — an air-gapped or private hub — instead of the official one.
- If the target file already exists, `init` refuses rather than overwrite it; `--force` writes anyway, merging the registry entry into the existing file and preserving other settings.
- `--dry-run` does everything `init` does except write. It hands the seeded configuration back as content, creating and modifying nothing, and the answer names the file the content is for — which matters here, because the target is the global config unless `--workspace` selects this project's own. A caller that keeps its own document model, such as an editor, puts the content there, where it is visible before it is saved and can be amended or undone.
- Because a dry run does everything else `init` does, its exit code predicts the write's. It refuses an existing config file exactly as a write refuses it, and for the same reason, so you can use it to ask whether `init` would succeed before committing to the change. To see the document an overwriting write would produce, pass `--force` alongside it: `--force --dry-run` reports the merge and still writes nothing.
- The registry is still contacted for its advertised trust policy, because the policy in the reported content is the policy a write would have pinned. A dry run makes the same single unauthenticated request to that registry's own origin that a write makes.
- Under `--dry-run`, standard output carries that content and nothing else, so it stays parseable. The one thing the content cannot express is an absence: when a registry advertises no trust policy, the notice saying so — and telling you to pin identities with `--identity` or `--key` — goes to standard error. A configuration document with no trusted identities looks the same whether a policy was pinned and happened to be empty or none was advertised at all, so read both streams; a program that discards standard error is told nothing about it. When the registry does advertise a policy, the pinned policy is in the reported content itself and no separate notice is produced.

A seeded configuration is a document you own and go on editing, which is why it can be handed back rather than written. Freezing the effective configuration, below, produces a record of what the configuration resolved to — state the compiler keeps about itself rather than content anyone composes — so it always writes and offers no `--dry-run`.

### `config show` — inspect what applies right now

`aggrega config show` reports the configuration that applies right now. In its default view it leads with the cascade of config files and environment overrides that contributed, lowest precedence first, then prints the effective merged configuration — the global config, the workspace-tree cascade, and any environment overlay combined into a single result. This loaded-file cascade is where you confirm which files and environment overrides shaped the current configuration.

Two focused views narrow the output:

- `--global` or `--workspace` prints a single layer's own file bytes verbatim, comments and formatting preserved; when that layer's file does not exist it says so rather than failing. The two are mutually exclusive.
- `--origin` annotates each effective setting with the layer it came from — a command-line flag, an environment variable, a config file, or the built-in defaults, highest precedence first. A flag is named as you typed it, so a setting `--offline` decided on this run reports `--offline` as its source; an environment variable is named behind an `env:` prefix and a config file by its absolute path.

Under `--origin`, a setting is attributed to the highest-precedence layer that sets it, whatever value that layer writes. So a project file that writes `default_registry: hub.aggrega.ai` is named for that setting even though the built-in default is the same registry, and a project file restating a value the global file already sets is named rather than the global file: in both cases it is the file holding the value in place, and the one whose removal changes the answer the day the default or the file beneath it moves. A setting no layer sets reports the built-in defaults.

- **What counts as setting it.** A config file sets a setting when it carries that setting's key, and a list setting also when it carries the list's `_append` companion. An environment variable sets its setting when it is exported with a non-empty value, and a flag when you type it — `--offline=false` sets the posture as surely as `--offline` does.
- **A configuration file your pipeline owns** is named only for the keys it is read for, which are its list additions and the signing policy. A key it ignores, and warns about, is never reported as where a value came from.
- **List and map settings are attributed as a whole**, to the highest-precedence layer that sets them; which layer contributed which entry of a list is not reported.
- **The signing requirement is the one exception.** Any layer may turn it on and none can turn it off, so it names the first layer that turns it on. A layer writing `required: false` turns nothing on, so where no layer turns it on the setting reports the built-in defaults.

### `config capture` — freeze build-critical settings

`aggrega config capture` writes the effective build-critical configuration into this project's workspace config file, so the workspace builds identically without relying on the machine's global configuration. Machine-wide tooling settings such as a registry's trust policy are not captured; they stay in the global config by their nature. Running it again on an unchanged configuration rewrites the same file byte-for-byte.

The captured subset is a set of plugin socket attachments and the catalog directories:

- By default capture freezes only the sockets that determine the rendered output — the provider bindings and the transform-role governance attachments — since only those must travel with the project for byte-identical builds. The catalog directories are always captured.
- `--all-plugins` widens the captured sockets to include the verdict-role governance, linter, and importer sockets as well. Without it those three stay free to vary by environment.

Capture always writes, and offers no way to be handed the content instead. What it produces is a record of what the configuration resolved to, not a document anyone composes, so there is nothing for an author to review and amend — reporting it would invite editing a snapshot of a resolution.

## See also

- [configuration.md](configuration.md) — which file a setting belongs in, the precedence ladder, and the mechanisms a larger project reaches for.
- [global-flags.md](global-flags.md) — the `--config` and `--workspace-root` flags.
- [environment-variables.md](environment-variables.md) — the `AGGREGA_*` variables that override configuration at runtime.
- [aggrega-registry.md](aggrega-registry.md) — manage registries and their trust policy directly.
- [aggrega-cache.md](aggrega-cache.md) — what the directory `artifact_cache_dir` names actually holds, and why an entity sitting there that no lockfile pins is not found by a build.
