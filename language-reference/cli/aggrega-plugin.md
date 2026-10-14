# aggrega plugin

Inspect the Wasm plugins the CLI can resolve

<!-- BEGIN GENERATED: cli-plugin -->
**Synopsis**

```
aggrega plugin
```

**Description**

```
Work with the WebAssembly plugins this CLI can resolve.

All of Aggrega's provider-specific and policy-specific behaviour lives in Wasm
plugins rather than in the binary, so this is where you see which ones are
reachable, add or remove a workspace binding, and check a guest before you
publish it.

Plugins reach the CLI two ways. Some are compiled into the binary and resolve
with no filesystem, cache or network access. The rest are workspace bindings in
.aggrega-config.yaml, resolved through the plugin cascade. "aggrega plugin list"
shows both groups together.

The subcommands below cover the whole life of a binding: list what is reachable,
add and remove bindings, run a local guest export directly, sync the
machine-owned records in a Plugin entity with its .wasm, and generate Plugin
catalog entities from a guest's own metadata.
```

**Subcommands**

| Command | Description |
| --- | --- |
| `aggrega plugin add` | Search the registry and add a plugin of the named type |
| `aggrega plugin gen-catalog` | Generate Plugin catalog entities from guest describe() plus an authored overlay |
| `aggrega plugin list` | List the plugins the CLI can resolve with their describe() metadata |
| `aggrega plugin remove` | Remove a configured plugin of the named type |
| `aggrega plugin run-local` | Load a local .wasm guest and call one of its exports |
| `aggrega plugin sync` | Sync a plugin's machine-owned records (host functions, CLI commands) in its entity file with its .wasm |

**`aggrega plugin add` description**

```
Search the configured registry for a plugin of the named type, resolve the
query to one plugin, and add it to your configuration.

Arguments:
  <type>   The plugin socket to add for. One of: provider, governance,
           linter, importer, or cli. The governance type requires --role.
  <query>  A case-insensitive substring matched against the plugin names of the
           chosen type. It must resolve to exactly one plugin — an exact
           plugin-name match wins when several share the substring; otherwise the
           command lists the candidates so you can narrow it.

What add writes depends on the type:

  - A socket type (governance, linter, importer) pins the latest published
    version and adds the bare plugin identity (<type>/<name>:<version>) to the
    plugins.<type> list. A governance entry also records its --role, one of
    annotation-transform, label-transform, ir-verdict, or render-verdict.
    An importer the plugins.importer list already names keeps its one entry,
    moved to the pinned version with its place and what it carries under with.
  - The provider type writes the plugin's oci:// identity as a plugins.providers
    entry; --capability names the capability the binding serves, preserving
    existing settings.
  - The cli type fetches the plugin from the registry, verifies it, and caches
    its bytes, then pins it into the plugins.cli list as a top-level aggrega
    command — no separate pull step. Its resolved reference and the content
    digest of the verified bytes are recorded so the command runs those exact
    bytes, resolving from the local cache on later runs with no further network
    access. A cli plugin defaults to the global config, so its command is
    available in every workspace; --workspace pins it to this project instead.
    Its declared capabilities are confirmed before installing, and
    --accept-capabilities or --yes skips that prompt for non-interactive use.

A provider or socket attachment is configuration you go on editing, so --dry-run
does everything the plain command does except write: it hands back the
configuration the write would have produced, creating and modifying nothing. The
answer names the file that content is for — which matters here, because a
--global attachment targets the config shared across every workspace. A caller
that keeps its own document model puts the content there, where it is visible
before it is saved and can be amended or undone. The registry is still searched
and the version still resolved, since the returned document carries the identity
a write would have pinned.

Under --dry-run standard output carries that content and nothing else, so it stays
parseable; a version substitution is announced on standard error instead. The cli
type does not accept --dry-run: what it records is the content digest of the bytes
it verified, which is a record the machine maintains rather than content you
edit.
```

**`aggrega plugin add` flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--accept-capabilities` | `false` | Accept a cli plugin's declared capabilities without the interactive prompt (cli type only) |
| `--capability` | — | Capability the provider binding serves (required for, and only valid with, the provider type) |
| `--dry-run` | `false` | Do everything except write: hand back the resulting configuration as content, naming the file it is for, and create or modify nothing. Without it the attachment is written to the resolved config file. Not accepted with the cli type. |
| `--global` | `false` | Write the attachment to the global config shared across every workspace. |
| `--role` | — | Governance attachment role: annotation-transform, label-transform, ir-verdict, or render-verdict (required for, and only valid with, the governance type) |
| `--workspace` | `false` | Write the attachment to this project's workspace config. A provider or socket attachment defaults here; a cli plugin defaults to the global config. |
| `--yes` | `false` | Skip the cli capability-confirmation prompt for non-interactive use (cli type only) |

**`aggrega plugin gen-catalog` description**

```
Generate one Plugin entity per selected Wasm guest.

Each entity's contract fields — pluginType, abiVersion, capabilities, exports,
and contract — are derived from the guest's describe() self-report, so the
entity can never promise a capability the binary does not provide. The entity's
identity (metadata.name), runtime limits, and provider block come from an authored
per-plugin overlay; the entity version is the guest's describe() self-report
version. The plugin-level description, when the guest reports one, is emitted as
metadata.description and omitted cleanly when it does not.

Two selection modes:

  --from-embedded   generate an entity for every guest embedded in this binary.
                    The overlay path is a directory; each overlay is matched to
                    a guest by its metadata.name identity.
  --plugin <f.wasm> generate a single entity for one non-embedded guest. The
                    overlay path is a single overlay file.

The output is written under <output-dir>/<pluginType>/<name>/<version>/plugin.yaml
and carries a generated-output banner. The leading pluginType segment keeps two
same-named plugins in different sockets apart, since a bare plugin name is unique
only within its own socket. Regenerating over unchanged inputs yields
byte-identical files.

A generated entity is a catalog document you own and go on editing, so --dry-run
does everything gen-catalog does except write: it hands the content back, creating
and modifying nothing, and the answer names the file each document is for. A
caller that keeps its own document model — an editor, for instance — puts the
content there, where it is visible before it is saved and can be amended or
undone. Every other behaviour is the write's — the same guests are read and the
same overlays matched — so a selection gen-catalog would refuse is refused under
--dry-run too. Without the flag the entities are written, because a caller at a
terminal has nowhere better to put them.
```

**`aggrega plugin gen-catalog` flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--dry-run` | `false` | Do everything except write: hand back the generated entities as content, naming the file each is for, and create or modify nothing. Every other behaviour is the write's, so a selection the write would refuse is refused here too. Without it the entities are written under --output-dir. |
| `--from-embedded` | `false` | generate an entity for every guest embedded in this binary |
| `--output-dir` | — | directory the generated entities are written under (required) |
| `--overlay` | — | authored overlay directory (--from-embedded) or file (--plugin) (required) |
| `--plugin` | — | generate a single entity for the .wasm guest at this path |

**`aggrega plugin list` description**

```
List every Wasm plugin the CLI can see and, for each, its self-reported
describe() metadata.

Two groups are printed. Embedded built-ins are the provider and linter guests
compiled into the binary; they resolve with no filesystem, cache, or network
access. Configured plugins are the workspace bindings — the provider and linter
bindings and the CLI-extension commands — resolved through the plugin cascade.
Each plugin's type appears in the TYPE column, so a CLI-extension command
(type cli) is legible alongside the socket plugins; a CLI plugin also carries a
status of its own — ready, unresolved, describe-failed, or digest-drift when
its bytes changed since it was pinned at install.

The default output is a scannable table with one row per plugin, showing its
type, name, served capabilities, and version. The output is read-only and
deterministic. A plugin that fails to resolve or describe is listed with its
failure status rather than halting the whole listing.

With -o json, the output is a structured object carrying the full per-plugin
detail — type, name, version, commit, capabilities, input kinds, boundary
assembly, exports, origin, readiness, and any resolve or describe error —
grouped as embedded and configured. It is suitable for programmatic
consumption and documentation generation.
```

**`aggrega plugin list` flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--output`, `-o` | `table` | Output format: table\|json. |

**`aggrega plugin remove` description**

```
Remove a configured plugin of the named type from a config file so it no longer
participates.

The type is one of provider, governance, linter, importer, or cli — the same
set 'plugin add' accepts. The query identifies the entry to remove: the plugin's
short name (matched against 'add's short name so remove is symmetric with add),
its full pinned reference, or, for the provider type, the capability the binding
serves. A query that matches nothing halts and leaves the config untouched, so a
typo never silently removes the wrong plugin.

A provider or socket attachment defaults to this project's workspace config; a cli
command defaults to the global config shared across every workspace. --global and
--workspace force the file the removal targets, overriding the default.
```

**`aggrega plugin remove` flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--global` | `false` | Remove from the global config shared across every workspace. |
| `--workspace` | `false` | Remove from this project's workspace config. A provider or socket attachment defaults here; a cli command defaults to the global config. |

**`aggrega plugin run-local` description**

```
Load a .wasm guest from a filesystem path, call one of its declared
exports with an optional payload, and write the guest's response bytes to
stdout.

The guest is addressed directly by --plugin path; it is not resolved through
the workspace plugin cascade. The export named by --export must be one the
guest advertises in its describe() self-report, or the call is rejected before
the guest runs.

The command has two forms. The artifact form takes no positional argument and
loads the guest bare. The entity form takes a Plugin entity file as its one
positional argument: the entity is schema-validated, and its declared
metadata.pluginType and export contract are cross-checked against the guest's
describe() before the guest runs. In both forms the guest bytes come from
--plugin; the entity carries no artifact path.

The payload is supplied with --with, and it is always written as JSON. A value
beginning with @ reads the payload bytes from a file (--with @input.json); any
other value is taken as a literal inline JSON payload (--with '{"k":1}'). When
--with is omitted, the export receives the minimal empty JSON object {}. The
resolved payload is validated as JSON before the guest runs, so malformed input
is reported up front.

An export a socket calls with a payload reads it in a binary encoding rather
than as JSON; a CLI plugin's cli_run export is the exception, and reads JSON.
Which encoding an export reads is fixed by the socket that export serves, so no
flag selects it: the resolved payload is converted into the encoding the named
export reads before the guest is called. The conversion reads the payload's
shape from the export's name, so it covers each export a socket calls by
default; an entry function an attachment or a pipeline step names under a name
of its own receives the payload as written. The authored payload stays JSON
either way.

In the artifact form, --type optionally names a plugin type the guest's
describe() self-report must agree with, or the load is rejected before the
guest runs; when omitted, no type expectation is imposed. In the entity form
--type is rejected, because the entity's metadata.pluginType supplies the type.

The guest's clean exit code becomes this command's exit status, so a failure
inside the plugin is distinguishable from a failure of aggrega itself.
```

**`aggrega plugin run-local` flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--export` | — | the declared export to call |
| `--plugin` | — | filesystem path to the .wasm artifact |
| `--type` | — | the plugin type the guest's describe() self-report must match |
| `--with` | — | payload for the export: inline JSON, or @<path> to read from a file; defaults to {} when omitted |

**`aggrega plugin sync` description**

```
Sync a plugin's machine-owned records in a Plugin entity file with its .wasm.

Two records are not authored by hand: the set of host functions a plugin may
call, derived from the plugin's .wasm import section, and the top-level commands a
CLI plugin contributes, read from the plugin's describe() self-report. Both are
ground truth in the binary. This command reads the .wasm, derives the
host-function set in canonical form and the command mirror in describe()-declared
order, and aligns the entity's spec.runtime.hostFunctions and spec.commands with
them — creating the runtime block when the file has none. Only those blocks
change; every comment, blank line, and other field is preserved byte-for-byte. A
plugin that imports no host functions or contributes no commands records an
explicit empty list, so each field is always present and reviewable.

The write is idempotent: re-running when the records already match the .wasm
leaves the file untouched. Commit the result; publish (aggrega push) then only
verifies the committed records against the .wasm and refuses to publish a file
whose records are out of sync with its binary.
```

**`aggrega plugin sync` flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--plugin` | — | Path to the plugin's .wasm artifact whose imports and describe() determine the recorded host functions and commands |
<!-- END GENERATED: cli-plugin -->

## What an importer entry does

`aggrega plugin add importer` writes the plugin's identity and the latest version published for it — `importer/<name>:<version>` — into the `plugins.importer` list. That entry attaches the importer it names: an import asking for a format the importer advertises runs that importer, at that version, even where other importers in your catalog advertise the format too, and only that importer is handed what the entry carries under `with`. [Which importer turns a source into drafts](configuration.md#which-importer-turns-a-source-into-drafts) describes the entry in full.

An importer is attached by one entry, so adding one the `plugins.importer` list of the file being written already names — at any version, or by a range — adds no second entry. The command moves that entry to the version it resolved instead: the entry keeps its place in the list and everything it carries under `with`. Adding an importer at the version its entry already names leaves the entry as it is.

## A CLI plugin's commands and their flags

Each time `aggrega` starts, it adds one command for every command a configured `cli` plugin contributes, reading the commands and their flags from the plugin's `describe()` self-report — from the describe cache when it holds the plugin's pinned digest, and otherwise by describing the plugin. Each declared flag is declared on its command so `aggrega help <command>` lists it the way it lists a built-in command's flags; the plugin still receives its arguments unparsed and reads its own flags.

The pinned digest sits beside the plugin's reference in the configuration's `plugins.cli` list, written `sha256:` followed by 64 lowercase hexadecimal digits — the spelling `aggrega plugin add cli` records. A digest spelled any other way, such as bare hexadecimal with no `sha256:` prefix, is refused when the configuration file loads, naming the file and the entry; until it is corrected no configured plugin's command is added, and a warning on standard error carries the refusal.

Before it adds any of a plugin's commands, `aggrega` checks every flag each of them declares. A plugin whose declarations fail is skipped: none of its commands is added, one warning on standard error names the plugin, the command, the flag and what is wrong with it, and every other command — built-in or from another plugin — runs as usual:

```
warning: CLI plugin "oci://hub.aggrega.ai/plugin/cli/greet:1.2.0" was not added as a command: its command "greet" declares the flag "--verbose" with the shorthand "vv"; a shorthand is a single ASCII letter or digit
```

A flag declaration passes when:

- the flag has a name, and no other flag of the same command has it;
- its shorthand, if it has one, is a single ASCII letter or digit that no other flag of the same command uses;
- neither its name nor its shorthand reuses a flag every `aggrega` command already has — `--help`, `-h`, and the global flags;
- its type, if it declares one, is `string`, `bool` or `int` — a flag with no type is a string flag;
- its default, if it declares one, is a value of its type.

The skip is repeated, with its warning, on every invocation until the configuration pins a version of the plugin whose declarations pass. The fields a flag declaration carries are described under `spec.commands` on the [`Plugin` entity page](../entities/plugin.md).

## Generating entities, and syncing records: two different kinds of act

Two of these subcommands produce a file, and what they produce is not the same kind of thing.

### `plugin gen-catalog` — generated entities are yours to edit

`aggrega plugin gen-catalog` produces Plugin catalog entities. An entity is a catalog document: you file it, review it, and go on editing it alongside the rest of your catalog. Because it is content you own, the command can hand it to you rather than put it on disk.

`--dry-run` does everything `gen-catalog` does except write. It returns the generated entities as content — no file is created, no directory is made — and each document in the answer names the file it is for, so a caller knows where each one belongs. A caller that keeps its own document model, such as an editor, puts the content there, where you see it before it is saved and can amend or undo it. Without the flag the entities are written under `--output-dir`, because a caller at a terminal has nowhere better to put them.

The content returned and the bytes written are the same content: `--dry-run` returns what the write would have produced, not a separately assembled preview. Every other behaviour is the write's too — the same guests are read, the same overlays matched, and `--output-dir` is required either way, because each returned document still names the file it is *for* and that path is composed from it.

Every entity is composed and validated before any of them is delivered, so a run either produces the whole set or produces nothing. An overlay that halts generation — one that is missing, or whose identity does not match the guest it is merged with — leaves no partly written output behind to clean up.

### `plugin sync` — machine-owned records are the compiler's

`aggrega plugin sync` brings a plugin's machine-owned records into step with its module: the host-function set derived from the module's import section, and the command mirror read from the plugin's own self-report. Both are ground truth in the binary rather than values anyone chooses.

It always writes, and offers no `--dry-run`. That holds even though it writes *into* an entity file you authored — the line is drawn on the content, not on the file. Records the compiler maintains about itself are not yours to edit, so there is nothing to review before they land; the surrounding document stays untouched byte-for-byte, and only those blocks change.
