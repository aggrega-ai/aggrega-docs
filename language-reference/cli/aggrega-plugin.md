# aggrega plugin

Inspect the Wasm plugins the CLI can resolve

<!-- BEGIN GENERATED: cli-plugin -->
**Synopsis**

```
aggrega plugin
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

**`aggrega plugin add` flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--accept-capabilities` | `false` | Accept a cli plugin's declared capabilities without the interactive prompt (cli type only) |
| `--capability` | — | Capability the provider binding serves (required for, and only valid with, the provider type) |
| `--global` | `false` | Write the attachment to the global config shared across every workspace. |
| `--role` | — | Governance attachment role: label-transform, ir-verdict, or render-verdict (required for, and only valid with, the governance type) |
| `--workspace` | `false` | Write the attachment to this project's workspace config. A provider or socket attachment defaults here; a cli plugin defaults to the global config. |
| `--yes` | `false` | Skip the cli capability-confirmation prompt for non-interactive use (cli type only) |

**`aggrega plugin gen-catalog` flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--from-embedded` | `false` | generate an entity for every guest embedded in this binary |
| `--output-dir` | — | directory the generated entities are written under (required) |
| `--overlay` | — | authored overlay directory (--from-embedded) or file (--plugin) (required) |
| `--plugin` | — | generate a single entity for the .wasm guest at this path |
| `--report` | `false` | Report the generated entities as content, naming the file each is for, and write nothing. Without it the entities are written under --output-dir. |

**`aggrega plugin list` flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--output`, `-o` | `table` | Output format: table\|json. |

**`aggrega plugin remove` flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--global` | `false` | Remove from the global config shared across every workspace. |
| `--workspace` | `false` | Remove from this project's workspace config. A provider or socket attachment defaults here; a cli command defaults to the global config. |

**`aggrega plugin run-local` flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--export` | — | the declared export to call |
| `--plugin` | — | filesystem path to the .wasm artifact |
| `--type` | — | the plugin type the guest's describe() self-report must match |
| `--with` | — | payload for the export: inline JSON, or @<path> to read from a file; defaults to {} when omitted |

**`aggrega plugin sync` flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--plugin` | — | Path to the plugin's .wasm artifact whose imports and describe() determine the recorded host functions and commands |
<!-- END GENERATED: cli-plugin -->

## Generating entities, and syncing records: two different kinds of act

Two of these subcommands produce a file, and what they produce is not the same kind of thing.

### `plugin gen-catalog` — generated entities are yours to edit

`aggrega plugin gen-catalog` produces Plugin catalog entities. An entity is a catalog document: you file it, review it, and go on editing it alongside the rest of your catalog. Because it is content you own, the command can hand it to you rather than put it on disk.

`--report` returns the generated entities as content and writes nothing — no file is created, no directory is made — and each document in the answer names the file it is for, so a caller knows where each one belongs. A caller that keeps its own document model, such as an editor, puts the content there, where you see it before it is saved and can amend or undo it. Without the flag the entities are written under `--output-dir`, because a caller at a terminal has nowhere better to put them.

The content reported and the bytes written are the same content: `--report` returns what the write would have produced, not a separately assembled preview.

Every entity is composed and validated before any of them is delivered, so a run either produces the whole set or produces nothing. An overlay that halts generation — one that is missing, or whose identity does not match the guest it is merged with — leaves no partly written output behind to clean up.

### `plugin sync` — machine-owned records are the compiler's

`aggrega plugin sync` brings a plugin's machine-owned records into step with its module: the host-function set derived from the module's import section, and the command mirror read from the plugin's own self-report. Both are ground truth in the binary rather than values anyone chooses.

It always writes, and offers no way to be handed the content instead. That holds even though it writes *into* an entity file you authored — the line is drawn on the content, not on the file. Records the compiler maintains about itself are not yours to edit, so there is nothing to review before they land; the surrounding document stays untouched byte-for-byte, and only those blocks change.
