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

### Where local entities are read from

A project that keeps catalog content of its own — a Component, a Feature, a Recipe, one of the
library kinds — has two ways to say where that content lives, and the first needs no configuration
at all.

**A `catalog` directory at the project root is read whether or not anything names it.** Put an
entity under `<project>/catalog/` and every command that loads a catalog reads it, including in a
project whose `workspace:` block is empty. A catalog directory is read recursively, so how you
arrange subdirectories inside one is yours.

**Directories listed under `workspace.catalog_dirs` are read as well, and they are read first.**
The list is an ordered search stack: the first directory to declare an identity owns it, and the
same identity in a later directory is shadowed. `catalog` is read after everything listed — unless
a listed directory already contains it, in which case it is read as part of that directory — so
listing a directory adds to what you had rather than replacing it. A repeatable `--catalog <dir>`
on the command line is read ahead of both, and a relative path given there resolves against the
directory you ran the command from, since no configuration file declared it. A project that keeps a
catalog variant per Release can give each Release a list of its own instead — see
[Giving a Release its own catalog directories](#giving-a-release-its-own-catalog-directories).

**Writing the list as empty says this project has no local catalog at all**, and it is the one
spelling that stops `catalog` being read too:

```yaml
# <project>/.aggrega-config.yaml
workspace:
  catalog_dirs: []
```

Leaving the key out is a different statement: an omitted list is the ordinary case, and `catalog`
is still read.

A build, a pull, a validation or an `aggrega inspect` that finds no entity under a name you used
says where this project reads local entities from and what to change so the one you named is read.
It says nothing of the kind where you wrote the empty list — reading no local catalog is what you
declared there, and a suggestion to change it would be arguing with you. Nor does it say it where
the document declaring that name was read and refused: that document already sits where the
catalog reads, so the report names what the document violates instead, the line and the
constraint, and moving it would fix nothing. A failure that found the entity and could not accept
it — a registry now serving other bytes under a version your lockfile pins, a file the entity
carries that cannot be read — is not a missing entity either, and it reports its own remedy alone.

### Whether a pull or a push pins an entity

A Recipe or FeatureRecipe carries the pins for the inputs it reads — a remote `source:` written out
in full, a file an `artifacts` entry imports, the files of a `source:` beside it — in the `entity.lock` beside it, and recording them is
the entity author's step, [`aggrega pin`](aggrega-pin.md). By default neither `pull` nor `push`
runs that step: a pull halts on an entity its lock does not pin, and a push refuses to publish it.
Two keys, one per command, make running it that command's default:

```yaml
# <project>/.aggrega-config.yaml
workspace: {}
pin_sources_at_pull: true
pin_sources_at_push: true
```

**Each key governs its own command and nothing else**, and each command's `--pin-sources` overrides
its own key in both directions — `--pin-sources=false` turns the step off for one run in a project
configured to pin. A build that fills its own lockfile is a pull and follows
`pin_sources_at_pull`. They belong in the project file rather than the global one: whether a
project's pulls record pins is that project's policy, and a teammate who clones it should get the
same answer. `pin_sources_at_pull` is also how a project consuming someone else's unpinned catalog
records those pins once rather than halting on every pull.

### Which plugin renders a capability

A Recipe names the capability it renders through — `capability: helm` — and a plugin serving that
capability renders it. Where exactly one plugin serves a capability nothing needs configuring. Where
more than one does, a `plugins.providers` entry says which, by the plugin's identity:

```yaml
# <project>/.aggrega-config.yaml
workspace: {}
plugins:
  providers:
    - capability: helm
      uri: provider/helm
```

A pull resolves the entry and records the plugin it chose in the Release's lockfile, and a build
renders through what the lockfile records, so an edit here takes effect at the next pull.

**The entries are written once for the whole project, while a build is of one Release**, so an entry
for a capability this Release never asks for is legal — another Release in the project reads it —
and is reported as nothing. What each build and each `aggrega validate --release` does check is
every entry, whether or not a Recipe asks for its capability, by what the entry names:

- **An entry naming a plugin whose plugin does not serve its capability stops the build and fails
  validation.** A pull resolves every entry that names a plugin, and refuses one it cannot resolve,
  so once an entry has been through a pull the build holds its plugin and knows what it serves; an
  entry naming a plugin the build does not yet hold is judged once a pull has fetched it. The
  message names the entry, the plugin,
  what that plugin does serve, and a spelling one edit away when there is one — the shape a typo
  such as `hlem` for `helm` takes.
- **An entry naming only a capability that no plugin the build reads serves is a warning**, and
  the build carries on. The plugin serving it may be one only another Release reads, which this
  build cannot see, and an entry naming no plugin selects nothing the capability's resolution would
  not select without it.

**A capability here never contains a colon**, and one that does is refused when the file loads. A
Recipe's `capability:` is read as the capability up to its last colon and a version pin after it, so
an entry keyed `helm:1.0.0` could never be looked up. Pin the version on the plugin instead —
`uri: provider/helm:1.0.0` — or in the Recipe.

### Starting from nothing

A freshly installed `aggrega` has neither file, and that is a working state rather than a broken
one: every setting falls back to its built-in default and commands run. What is missing is a
registry to pull catalog content from, together with the trust policy that says which signatures to
accept — which is exactly what `aggrega config init` writes.

You do not have to know that in advance. A command that reads its configuration and finds no file
anywhere says so once, on standard error, and names `aggrega config init` as the way to create one.
It is advice rather than a failure: standard output is untouched, nothing is asked of you, and the
exit status is whatever the command would have reported anyway. It is written only when standard
error is a terminal, so it reaches you at the keyboard and never accumulates in a pipeline's log.
Once either file exists — your project's or the global one — it stops appearing.

To seed the global file with the official hub and the trust policy that hub advertises:

```bash
aggrega config init
```

Pass `--registry <host>` to seed a different one, `--workspace` to write the entry into this
project's file instead of the global one, and `--dry-run` to see the content it would write without
creating anything. [aggrega-config.md](aggrega-config.md) covers the command in full.

### How a registry host is written

Each `registries[].host` names a registry host. So does `default_registry` — optionally followed by a
repository path — unless it names one of those entries instead (see below). A host is written as the
host itself, in the one spelling the registry's trust policy is kept under:

- a lowercase host name containing a dot, such as `registry.example.com`;
- `localhost`, or a single name followed by a port, such as `registry:5000`;
- an IPv4 address such as `127.0.0.1`, or an IPv6 address in brackets such as `[::1]`;

each with an optional `:port`, and nothing else — no scheme, no path, no credentials, no whitespace
and no capital letters. A single name with no port is not a registry host, because that is the shape
of the first segment of a catalog entity's name — the `core` in `core/web-api` — and the two must
never be read as each other.

```yaml
# <project>/.aggrega-config.yaml
workspace: {}
default_registry: registry.example.com
registries:
  - host: registry.example.com
    signing:
      required: true
```

**The spelling is part of the policy.** A `registries` entry applies to the host its `host:` names,
and the official hub's built-in signature requirement applies to `hub.aggrega.ai`, so a host written
any other way would reach the right registry and miss the policy written for it. It is refused when
the configuration loads instead, and the refusal names the spelling to write: `HUB.AGGREGA.AI` and
`https://registry.example.com` are refused naming `hub.aggrega.ai` and `registry.example.com`, and
so is `registry.example.com/charts` as a `registries[].host`, which carries no path. Port 443 is the
default port of a host reached over HTTPS, so `hub.aggrega.ai:443` is refused the same way, naming
`hub.aggrega.ai`. `localhost` and the other loopback addresses are reached over plain HTTP instead,
where 443 is an ordinary port, so `localhost:443` is accepted as written. An empty
`default_registry` names no default registry.

**`default_registry` may carry a repository path.** Many registries keep every repository under an
owner or a project — `ghcr.io/<owner>`, `<host>/<project>` on Harbor — and a default registry on one
of them is written as the host followed by that path:

```yaml
# <project>/.aggrega-config.yaml
workspace: {}
default_registry: ghcr.io/acme
registries:
  - host: ghcr.io
    signing:
      required: true
```

The path is where things are published and fetched. Through this default, `aggrega push` publishes
`core/api-server` version `1.0.0` at `ghcr.io/acme/component/core/api-server:1.0.0`, and a pull
resolving `core/api-server` fetches it from the same place, so a signature attached when it was
published is found there too. The path is a repository path in the OCI distribution grammar: one or
more segments of lowercase letters and digits joined by `/`, which may be separated inside a segment
by `.`, `_`, `__` or dashes, with no tag, digest or trailing `/`.

**The path is never part of how the registry is trusted.** The `registries` entry whose policy
applies, the credential `aggrega login` stores, the signing requirement and the trusted identities are
all found by the host alone, so the entry for `ghcr.io` above governs `ghcr.io/acme` and every other
path on that host, and no spelling of a path can reach past it; an entry's `host:` itself carries no
path. A host written in another spelling before a path is refused naming the location to write —
`GHCR.io/acme` and `https://ghcr.io/acme` name `ghcr.io/acme` — and what follows the host when it is
not a repository path is refused naming the host it follows.

**`default_registry` may name an entry instead.** Written as the `name:` of an entry under
`registries`, it stands for that entry's `host:`. Publishing, pulling, signature verification and
every per-registry trust setting then use that host, and no content is fetched from a host spelled
like the name:

```yaml
# <project>/.aggrega-config.yaml
workspace: {}
default_registry: local
registries:
  - name: local
    host: 127.0.0.1:5000
```

A name is matched before a host spelling, as the `--registry` flag matches one, so a value that is
an entry's `name:` stands for that entry even where it is also spelled like a host. A name two
entries carry is refused as ambiguous, naming both hosts. The entry may sit in either file — a
project's `default_registry` can name an entry the global file declares — because the name is read
once, against the entries in force after every file and the environment have been read. A value
that is neither an entry's name nor a registry host — alone or followed by a repository path — is
refused, and the refusal says either one fixes it. A name followed by a path, such as `local/acme`,
is refused too: a name stands for its entry's host and not for a location under it, so the refusal
names the two spellings to write instead — `local`, or the entry's host followed by the path,
`127.0.0.1:5000/acme`. Removing an entry with `aggrega registry remove` leaves `default_registry` as it
is written, so a default that named the removed entry names nothing afterwards and is refused until
it is rewritten.

**Every layer is held to the same spelling.** A value is refused in the same words whether it comes
from a configuration file, from `AGGREGA_DEFAULT_REGISTRY`, or from the `--registry` flag that names
the destination of one `aggrega push` or `aggrega push-artifact`. That flag names a host, and the
publication it directs lands at that host with no repository path: a path belongs to
`default_registry`. `aggrega registry add` and
`aggrega config init --registry` hold the host they are given to it too; they also accept a
reference in its place, and key the entry under the host the reference names. A refusal from a file
names the file and the key; one from the environment names the variable. The schema states the host
shape as a pattern on `registries[].host` and states none on `default_registry`, whose value may be
any entry's name — so an editor reading the schema alone does not flag a mistyped default, and the
configuration load is what refuses it.

**A host is judged by its spelling alone, and so is a path.** Whether the name resolves, whether a
registry answers there, or whether the path exists on it, is not checked when the configuration
loads.

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
shadowing it, so a subproject adds a linter to whatever the root already declared:

```yaml
# <project>/services/api/.aggrega-config.yaml
plugins:
  linter_append:
    - uri: ./lint/api-rules.wasm
```

Where one file sets both the base list and its companion, that file's value is the base list
followed by the appended entries.

The `workspace:` block is the exception to where a companion can be written. A file carrying that
block marks its own directory as the project root, so a subproject's file that wrote
`workspace.catalog_dirs_append` would start a project of its own rather than add to the enclosing
one. The catalog-directory companion composes between your global file and the project's root file.

The `plugins.cli` list composes across files on its own and has no companion: a command extension
declared in the global file registers its command in every project, one declared in a project
registers only there, and both register together. Each entry pins one plugin: the `uri` it resolves
and the `digest` of the bytes `aggrega plugin add cli` verified, written `sha256:` followed by 64
lowercase hexadecimal digits. A digest in any other spelling could never equal the digest the
resolved bytes hash to, so it is refused when the file loads, naming the file and the entry.

### Giving a Release its own catalog directories

A project can keep several catalog variants side by side — one per target, each holding the Recipes
that render the same Components for a different provider — and build each Release against one of
them. Name each Release under `workspace.releases` and give it its own `catalog_dirs`:

```yaml
# <project>/.aggrega-config.yaml
workspace:
  releases:
    release-compose.yaml:
      catalog_dirs:
        - ./catalog-compose
    release-helm.yaml:
      catalog_dirs:
        - ./catalog-helm
```

Each key is a Release file, written relative to the configuration file that names it. The two keys
under it mean what they mean on the `workspace:` block, scoped to that one Release:

- `catalog_dirs` **replaces** the workspace's list for that Release. The search order, the `catalog`
  directory read after it, and what an empty list says are the same as for the workspace's own list.
- `catalog_dirs_append` is read after the Release's list. An entry that writes only
  `catalog_dirs_append` keeps the workspace's list and adds to it.

A Release the map does not name reads `workspace.catalog_dirs` exactly as before. A Release the map
does name reads its own directories however it is built — `aggrega build` or `aggrega pull` at a
terminal, the editor through `aggrega serve`, an assistant through `aggrega mcp` — so none of them
needs a flag to find its catalog. A `--catalog <dir>` on the command line is still searched ahead of
the Release's directories, for that one invocation. And a lookup that finds no entity under a name
you used names that Release's entry as the place to list the directory holding it.

An entry naming a file that does not exist is refused when the configuration loads, naming the entry
and the file. Renaming a Release therefore stops every command until the entry is renamed with it,
rather than letting the Release build against the workspace's list with nothing to say so.

What concerns no single Release still reads the workspace's list: a lint or a validation of the whole
catalog, a lookup of an entity by name, an Aggregate inspected on its own, and an editor's listing of
the workspace's entities. `AGGREGA_CATALOG_DIRS` sets the workspace's list and reaches no entry here,
and a configuration file your pipeline owns does not read the map at all.

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

It applies to `workspace.catalog_dirs`, to the Release files keyed under `workspace.releases` and
the directories each entry lists, and to the local filesystem paths on a `plugins.governance`,
`plugins.linter` or `plugins.importer` attachment — a `uri` naming a `.wasm` file on disk, and each
entry under that attachment's `with.sources`. It applies to the entries under their append
companions too, and each of those anchors to its own declaring file rather than to the file the
merge happens to end at. And it applies to `mcp.tls.cert_file` and `mcp.tls.key_file`, so a
certificate written beside the file that names it is found from wherever the server is launched.

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

These settings deliberately do not follow this rule, because they have no declaring file to anchor
to or because every reader of them resolves them elsewhere:

- `artifact_cache_dir` is interpreted relative to the **project root**, wherever the command runs
  from, so the cache is one directory rather than one per invocation location. An absolute value is
  refused when the configuration loads.
- `AGGREGA_CATALOG_DIRS` comes from the environment and has no declaring file at all, so supply
  absolute paths in it.
- `mcp.listen` is taken exactly as written, and that includes the filesystem path in its
  `unix:<path>` form. The same address also arrives from `aggrega mcp --listen`, which has no
  declaring file, so anchoring the configured spelling alone would make one string name two
  different places depending on where it came from. Give the socket an absolute path.

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
subprocess and talks to it over standard input and output, which is the default, and the only
settings that shape reads are `mcp.transport`, left at that default, and `mcp.announce_tools`. The
rest of the `mcp` block is for the other shape, which `mcp.transport: http` chooses: one
long-running process on a host, reached over HTTP by callers who are not at its keyboard.

```yaml
# <project>/.aggrega-config.yaml
mcp:
  transport: http
  listen: 127.0.0.1:7777
  authorization:
    issuer: https://login.example.com
    resource: https://mcp.example.com/mcp
  allowed_origins:
    - https://studio.example.com
  limits:
    max_concurrent_requests: 32
  deny_reach:
    - registry
  announce_tools:
    - list-entities
    - get-schema
    - validate
    - build
  health:
    listen: 127.0.0.1:7778
```

**`mcp.transport` is what chooses the transport.** `http` starts a listener; `stdio`, the default,
speaks over standard input and output, which is what a subprocess client expects. Any other value is
refused when this file loads. `aggrega mcp --transport <stdio|http>` does the same for one
invocation and wins over the key, the way every flag wins over every file.

**`mcp.listen` names where that listener binds, and chooses nothing.** Give it a `host:port`
address or a `unix:<path>` socket; `aggrega mcp --listen <address>` wins over it for one invocation.
With `http` chosen and no address from either, the launch is refused before anything binds. With
`stdio` chosen, a typed `--listen` is refused, and an address only this key names is left unused —
the server says so in one line on its error stream, naming this file and `mcp.transport: http`. So a
server other people reach sets both keys, as above, and a client launched from a directory that file
covers still reaches the server over its own streams. A `unix:` path is taken as written rather than anchored —
see [Where a relative path points](#where-a-relative-path-points).

**`mcp.tls.cert_file` and `mcp.tls.key_file` put TLS in the process.** Set both and the listener
serves HTTPS itself. Leave both out and it serves plaintext, which is accepted only on loopback or
on a Unix socket — the shape you use when a proxy in front holds the certificate and forwards to
the process. A plaintext listener on any other address is refused before anything binds, naming
these two keys, and so is one of the two set without the other. Both are filesystem paths and
follow the rule above: a relative one resolves against the directory of the file that declared it,
so a certificate committed beside that file is found wherever the server is launched from. Write
them absolute where the certificate is managed outside the project.

**`mcp.authorization.issuer` and `mcp.authorization.resource` say who issues the tokens callers
present, and what this server is called as the resource they are issued for.** Both are required
whenever the `http` transport is chosen, and a listener is refused before anything binds without them, because
every request to the endpoint is answered with a bearer-token challenge and a challenge that names
nowhere to go is one a client cannot act on. Write whole addresses, scheme and host included: the
issuer exactly as that authorization server states its own identifier, and the resource as the
address your callers actually reach — the host a proxy in front presents, where there is one, rather
than the address this process binds. Both are published, with no credential asked for, in the OAuth
protected-resource metadata document the listener serves, which is where a client looks to find out
where to obtain a token. Neither holds anything secret: a token arrives on the request that
presents it and is never written in a configuration file. The issuer is an `https` address unless
the authorization server runs on this machine — `localhost`, `127.0.0.1` or `::1` — and a listener
naming a plain `http` issuer on any other host is refused before anything binds, whichever way it
reads its keys and its callers: every client is sent to the issuer to obtain its token, so over plain
`http` its authorization code and its token would cross the network unprotected, and where the keys
are read from there too, whoever sits on that path could substitute them.

**`mcp.authorization.jwks_file` names a file holding the keys tokens are verified against**, instead
of reading them from the authorization server. Leave it out and the server reads that server's
metadata at its well-known address and follows the `jwks_uri` published there, which is what a
workspace with network access does. That key address is held to the same rule as the issuer, and so
is any address either read is redirected to: one that is plain `http` on another host is never
asked, and a token needing those keys is answered `503` until the authorization server publishes its
metadata and keys over `https`. Set it and the authorization server is never contacted — which
is what a workspace declaring `offline: true` needs, and such a workspace is refused before its
listener binds unless this names a file. It is a path and follows the rule above: a relative one
resolves against the directory of the file that declared it, so a key set committed beside that file
is found wherever the server is launched from. The file holds public verification keys, which are
what an authorization server publishes — nothing that signs, and nothing secret.

**`mcp.allowed_origins` is consulted only when a request carries an `Origin` header**, which in
practice means a browser sent it. List the origins you serve there; a request naming one that is
not listed is refused, and a request carrying no such header is served regardless. A client that
is not a browser sends no such header and needs no entry. An entry is compared to the header
exactly, so write it the way a browser sends it: a lowercase scheme, `://`, a lowercase host, and
`:` with the port only where the port is not the scheme's default — `https://studio.example.com`,
or `http://localhost:3000` for a page served on your own machine — with no path and no trailing
`/`. An entry in any other shape could never match, and is refused when this file loads, naming the
entry.

**`mcp.limits` bounds what one caller can ask for** — how large a single request body may be, how
many requests run at once, and how many one caller may send in a minute. All three are always in
force; none has a value that lifts it. The third, `requests_per_minute`, is counted against each
caller separately, so one caller sending hard costs another nothing.

**`mcp.authorization.trusted_proxy` reads the caller from a proxy in front instead of checking a
token here.** Set `principal_header` to the header that proxy uses to say who the caller is, and
optionally `scopes_header` to one carrying that caller's scopes. Both are HTTP header names, such as
`X-Forwarded-User` — letters, digits, hyphens and the few other characters a header name may carry,
with no space or colon — and a name in any other shape is refused when this file loads, naming the
key, because no request could carry it. In that mode no token is read at all, and a request without
the principal header is refused. Because the header is then the whole credential, it is trustworthy
only where nothing else can set it: the process is refused before it binds unless `mcp.listen` is
loopback or a Unix socket. Leave the block out and this server checks tokens itself, which is the
default; a block whose `principal_header` is empty is refused rather than read as that default.

**`mcp.deny_reach` withdraws a kind of reach from this deployment.** Every operation the server
performs declares how far its own effects travel — `none` for one that reads or renders and leaves
nothing behind, `workspace` for one that writes inside the workspace this process serves, `registry`
for one that publishes, signs or withdraws, and `machine` for one that changes what every workspace on
the host shares. Naming a kind here withdraws every tool that reaches it: the tool is absent from
every caller's tool list whatever that caller's token carries, and a call to it is refused naming this
setting. That makes it the deployment's bound rather than the caller's, and no credential lifts it — a
server meant to serve reads and nothing else lists the three writing kinds here and then cannot
publish even for a caller whose token carries every scope. Leave it out, which is the default, and
this deployment carries whatever its callers' scopes admit. A value that is not one of the four is
refused when this file loads, rather than passed over. Nothing of the `machine` kind is offered over
HTTP whatever this says, so naming it is accepted and changes nothing;
[aggrega-mcp.md](aggrega-mcp.md#what-a-caller-may-reach) sets out the kinds and the scopes that admit
them.

**`mcp.announce_tools` narrows what the server announces, and it is a different bound from the key
above.** Name the tools this server announces, spelled as the tool list reports them, and exactly
those are announced: one left out is absent from every caller's tool list and refused if it is called
by name anyway, naming this setting. Leave the key out — the default — and every tool the server
carries is announced; write an empty list and none is, so those two spellings are different
statements and no default is filled in for you. What separates it from `deny_reach` is what each one
takes away. `deny_reach` takes away a capability: the operations of a withdrawn kind are not carried
here at all and no credential brings one back. `announce_tools` takes away only an announcement — the
tools it leaves out are capabilities the server still has — and what it answers is a client that caps
how many tools it will register, sometimes across every server it is connected to at once. Where both
are set the withdrawal wins, so a tool of a withdrawn kind stays absent however this key names it. A
name no tool answers to stops the server before it serves anything, listing the tools it does have,
rather than leaving you with a surface narrower than the one you asked for. Unlike the other keys
here, which configure the listener the `http` transport starts, it is read whichever transport the server
speaks, because the client a narrowing exists for is usually the one that launched the process over
its own standard input and output;
[aggrega-mcp.md](aggrega-mcp.md#narrowing-what-the-server-announces) sets out the rest.

**`mcp.health.listen` puts the liveness and readiness checks on an address of their own.** Give it an
address in either of `mcp.listen`'s two forms and a second listener answers `GET /healthz` there —
`200` from the moment the process is running — and `GET /readyz` — `503` until the workspace has
resolved and the endpoint has bound, `200` from then on, which is what lets a balancer hold traffic
back until the process can actually answer a call. Leave it out and neither check is answered
anywhere. They are never answered on the address `mcp.listen` names, which gives them the `404` it
gives every path it does not serve: a probe there would be an unauthenticated reading of a listener
that refuses everything else. Unlike `mcp.listen` this address is not confined and no address is
refused for it — point it at loopback or a Unix socket, which is what a supervisor beside this
process reaches, and note that whatever can reach the address you pick can read those two answers.

[schema/other/aggrega-config.md](../schema/other/aggrega-config.md) states each of these keys
alongside its default, where it has one.

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
