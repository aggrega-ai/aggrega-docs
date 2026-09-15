# Configuration

Where `aggrega` reads its settings from, and which file to put a setting in.

## The simple case

**Two files, and most projects need nothing else.**

**One file in your project**, named `.aggrega-config.yaml`, sitting at the project root. It holds
how *this* project builds: which directories hold vendored catalog content, which plugins render
which targets, which lint rules are relaxed, where the local cache goes. It is committed, so a
teammate who clones the project builds it the same way.

Its `workspace:` block is what marks the directory as the project root:

```yaml
# <project>/.aggrega-config.yaml
workspace:
  catalog_dirs:
    - ./catalog
auto_pull: true
```

The block carries only the root-defining catalog directories; every other setting sits at the top
level beside it. A project that vendors no catalog content still writes the block, empty —
`workspace: {}` — because the block's presence is the marker.

**One global file on your machine**, at `~/.config/aggrega/config.yaml`. Every workspace on that
machine resolves through it, and it holds settings that belong to the machine rather than to any one
project — the registries you pull from and the signature trust policy for each, how large the
compiled-module store may grow, and any command-extension plugin you have installed. Those are the
same wherever you are working, so declaring them once is the point. It loads automatically when it
is there, and nothing breaks when it is not.

```yaml
# ~/.config/aggrega/config.yaml
registries:
  - host: hub.aggrega.ai
    signing:
      required: true
```

`aggrega config init` writes that global file for you, registering a registry together with
the signature trust policy it advertises. `aggrega config show` prints what applies right now, and
`aggrega config show --origin` says which file — or which environment variable — decided each
setting.

**Secrets are not configuration.** A registry password and a signing identity token are never
fields in either file; they are supplied by environment variable or flag at the moment they are
needed. See [environment-variables.md](environment-variables.md#secrets).

### What overrides what

```
CLI flag  >  environment variable  >  configuration file  >  built-in default
```

A flag is the most explicit signal there is and wins outright. An environment variable overrides
the committed file, which is what lets a pipeline change a setting without editing a tracked file.
A variable that is unset — or set to an empty string — falls through to the layer below rather than
blanking a configured value. Between the two files, your project's file wins over the global one.

**A flag wins by having been typed, not by the value it carries**, and for a true-or-false setting
that is the difference between a usable top layer and none. `--offline` turns the posture on for one
run; `--offline=false` turns it off for one run where a committed file or an exported variable has
turned it on. A layer that read the value alone could not tell "off" from "not mentioned", so every
command would look as though it had asked for the flag's default and there would be no way to
countermand a configured setting at all.

That is the whole model for a single project on a single machine. Everything below exists for
projects that outgrow it.

## Beyond the two files

These mechanisms are built for larger shapes — a monorepo of related projects, a pipeline that
contributes settings of its own, a shared catalog that several projects extend. Reach for one when
you have the problem it solves.

### More than one configuration file inside a project

Every `.aggrega-config.yaml` from the project root down to the directory the command runs in
contributes, and a nearer file overrides a farther one. So a subproject can carry its own file that
adjusts what the root declared, without repeating it.

Only a file carrying a `workspace:` block marks a root. A file without one still contributes its
settings — it simply does not turn its directory into a project root, which is what keeps a
subproject's settings file from redefining where the project begins.

Passing `--workspace-root` changes this as well as skipping discovery: the named root's own
configuration file is the only one collected, so files in directories below it do not contribute.
That keeps a pinned root's configuration the same wherever the command is run from.

### Extending a list instead of replacing it

A list-valued setting behaves like every other setting: the nearer file's value replaces the
farther one's. When you want to *add* to what an outer file declared rather than restate it, use
the append companion beside it:

| list setting | its append companion |
| --- | --- |
| `workspace.catalog_dirs` | `catalog_dirs_append` |
| `plugins.governance` | `governance_append` |
| `plugins.linter` | `linter_append` |
| `plugins.importer` | `importer_append` |
| `plugins.providers` | `providers_append` |

Entries under a companion are concatenated onto the resolved list at each layer instead of
shadowing it, so a subproject adds a catalog directory to whatever the root already declared:

```yaml
# <project>/services/api/.aggrega-config.yaml
workspace:
  catalog_dirs_append:
    - ./catalog
```

Where one file sets both the base list and its companion, that file's value is the base list
followed by the appended entries.

The `plugins.cli` list composes across files on its own and has no companion: a command extension
declared in the global file registers its command in every project, one declared in a project
registers only there, and both register together.

### A configuration file your pipeline owns

A file named `.aggrega-config-append-ci.yaml` may sit beside the hand-authored file in any
directory the walk visits. It is a separate file so an automated pipeline can own and overwrite it
wholesale without ever touching what a person wrote.

It is additive only. Its entries for the five list settings above are concatenated onto the
resolved lists; it cannot remove anything or override a scalar. A scalar or map key written in it
has no additive meaning, so it is ignored and named in a warning rather than quietly applied. It
never marks a project root either, so dropping one into a directory adds attachments without
moving where the project begins.

### Where a relative path points

**A relative filesystem path is resolved against the directory of the file that declared it — not
against the project root, and not against the directory you ran the command from.** This is the
rule worth reading twice, because a path that looks project-relative resolves elsewhere and the
build still succeeds, against content you did not intend.

It applies to `workspace.catalog_dirs`, and to the local filesystem paths on a `plugins.governance`,
`plugins.linter` or `plugins.importer` attachment — a `uri` naming a `.wasm` file on disk, and each
entry under that attachment's `with.sources`. It applies to the entries under their append
companions too, and each of those anchors to its own declaring file rather than to the file the
merge happens to end at.

So given this layout:

```
myproject/
├── .aggrega-config.yaml
└── services/
    ├── .aggrega-config.yaml
    └── catalog/
```

and `./catalog` written in the **root** file, the path names `myproject/catalog`. Written in
`services/.aggrega-config.yaml`, the identical text names `myproject/services/catalog`. An absolute
path is left exactly as written, and so is a registry reference such as
`oci://hub.aggrega.ai/plugins/helm:1.0.0`.

Two settings deliberately do not follow this rule, because they have no declaring file to anchor
to or because every reader of them resolves them elsewhere:

- `artifact_cache_dir` is interpreted relative to the **project root**, wherever the command runs
  from, so the cache is one directory rather than one per invocation location. An absolute value is
  refused when the configuration loads.
- `AGGREGA_CATALOG_DIRS` comes from the environment and has no declaring file at all, so supply
  absolute paths in it.

### One setting whose store is shared

Almost every setting governs something that belongs to the project you are working in — which
directories it resolves catalog content through, which plugins render its targets, how strictly its
content is judged, how large the daemon's in-memory caches may grow. A value in a project's file
governs that project's own thing, and there is nothing to watch for.

`compiled_module_cache.max_bytes` is the one exception, because what it caps is not per-project.
Compiled plugin code is kept in a single directory that every project on your machine reuses, so a
given plugin is compiled once rather than once per project. The cap itself resolves like any other
setting — write it in a project's file and that value wins for that project — but the store still
has only one size, and the size in force is the one from the most recent build. Two projects that
cap it differently both take effect in turn, and the lower cap discards compiled code the other
project paid for.

So put it in the global file when you want one answer for everything you build, and keep it above
what a single build compiles. `aggrega cache status` reports what the store currently holds, and
`aggrega config show --origin` tells you which file the cap you are running under actually came
from.

### Settings for a server other people reach

`aggrega mcp` speaks the Model Context Protocol. On your own machine a client launches it as a
subprocess and talks to it over standard input and output, and no configuration is involved at
all. The `mcp` block is for the other shape: one long-running process on a host, reached over
HTTP by callers who are not at its keyboard.

```yaml
# <project>/.aggrega-config.yaml
mcp:
  listen: 127.0.0.1:7777
  allowed_origins:
    - https://studio.example.com
  limits:
    max_concurrent_requests: 32
```

**`mcp.listen` is what chooses the transport.** Give it a `host:port` address or a
`unix:<path>` socket and the command starts a listener; leave it out and the command speaks over
standard input and output, which is what a subprocess client expects. `aggrega mcp --listen
<address>` does the same for one invocation and wins over the key, the way every flag wins over
every file.

**`mcp.tls.cert_file` and `mcp.tls.key_file` put TLS in the process.** Set both and the listener
serves HTTPS itself. Leave both out and it serves plaintext, which is accepted only on loopback or
on a Unix socket — the shape you use when a proxy in front holds the certificate and forwards to
the process. A plaintext listener on any other address is refused before anything binds, naming
these two keys. Write both as absolute paths.

**`mcp.allowed_origins` is consulted only when a request carries an `Origin` header**, which in
practice means a browser sent it. List the origins you serve there; a request naming one that is
not listed is refused, and a request carrying no such header is served regardless. A client that
is not a browser sends no such header and needs no entry.

**`mcp.limits` bounds what one caller can ask for** — how large a single request body may be, and
how many requests run at once. Both are always in force; neither has a value that lifts it.

Each of these keys has a default, and
[schema/other/aggrega-config.md](../schema/other/aggrega-config.md) states it beside the key.

### The other ways a project root is recognised

`--workspace-root <path>`, or its `AGGREGA_WORKSPACE_ROOT` counterpart, names the root outright and
skips discovery. Otherwise discovery walks upward from the working directory, and the kinds of
anchor rank against each other rather than by nearness:

- **A `.aggrega-config.yaml` carrying a `workspace:` block wins outright**, at whatever depth it
  sits. The walk keeps climbing to look for one even after it has passed a marker of the kind
  below, so an explicitly marked root above always beats an incidental marker below it.
- **Failing that, the nearest of these markers anchors the root**, and within one directory they
  rank in this order: an `.aggrega/` directory, then an `aggregate*.yaml`, then a `release*.yaml`,
  then a `manifest*.yaml`.
- **Failing everything, the working directory is used** — commands run and simply resolve nothing,
  rather than refusing to start.

Marking the root with a `workspace:` block is the explicit choice and the one to prefer; the file
and directory markers let a project that has not declared one still be built.

### Naming the global file explicitly

The global layer resolves in this order:

1. `--config <path>`, the per-invocation form.
2. `$AGGREGA_CONFIG`.
3. `$XDG_CONFIG_HOME/aggrega/config.yaml`, falling back to `~/.config/aggrega/config.yaml`.

The first two name an explicit file, so a path that does not exist is a loud error rather than a
silent fallback — you asked for a particular file. The default location is loaded when the file is
there and passes over quietly when it is not. Whichever file resolves, your project's files still
layer on top of it.

That choice also selects where a configuration-writing command writes. A command run with
`--config <path>` reads its configuration from that file and applies its change to that same file,
so what one command writes is what the next one reads back.

Which of the two files a command writes to by default comes from the nature of the setting:
machine-wide tooling such as a registry goes to the global file, while build-participating
settings such as a provider binding or a socket attachment go to the project's committed file, so
they travel with the project. Pass `--global` or `--workspace` to override, and the command prints
the file it wrote.

## See also

- [aggrega-config.md](aggrega-config.md) — the `aggrega config` commands that seed, inspect, and
  freeze configuration.
- [environment-variables.md](environment-variables.md) — every `AGGREGA_`-prefixed variable, and
  where secrets are supplied.
- [global-flags.md](global-flags.md) — `--config`, `--workspace-root`, and the other flags every
  subcommand accepts.
- [schema/other/aggrega-config.md](../schema/other/aggrega-config.md) — every configuration key,
  its type, and its default.
- [aggrega-cache.md](aggrega-cache.md) — what `artifact_cache_dir` actually holds.
- [aggrega-mcp.md](aggrega-mcp.md) — the server the `mcp` block configures.
