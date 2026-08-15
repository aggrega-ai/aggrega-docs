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
