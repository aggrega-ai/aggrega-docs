# Aggrega Wasm Describe Socket schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/wasm-describe-v1beta1.schema.json`

The wire shape every Wasm plugin returns from its describe() export (PluginDescriptor). describe() is the plugin's self-declaration, read once by the host when it loads the plugin: the ABI version the guest binds against, the plugin type, the exports it offers with each export's capability declaration, a plugin-level capability self-report, an optional provider render-behavior contract, an optional importer recognition contract, optional CLI commands, an optional settings schema, and optional authorship metadata. One shape covers every plugin type — provider, linter, feature-recipe-pipeline step, governance, CLI, parser, and importer. The host reads describe() before dispatching any other export and refuses a descriptor it cannot admit rather than mis-invoking the plugin at dispatch.

## One of the following shapes

- `PluginDescriptor`

## Definitions

### `PluginDescriptor`

A plugin's complete self-declaration, returned from describe() and read once at load. It carries the ABI-compatibility handshake, the plugin type, the offered exports, and the optional per-type surfaces (a provider's render-behavior contract, an importer's recognition contract, a CLI plugin's commands, a settings schema, authorship metadata).

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `abi_version` | const "v1alpha1" | yes | The plugin ABI the guest binds against. The host accepts exactly this version; a guest built against any other ABI is refused at load rather than mis-invoked at dispatch. Constant: `"v1alpha1"` |
| `plugin_type` | string (enum) | yes | The plugin's kind. It selects the minimum-export rule the host validates and, together with the export name, the default input-delivery pattern. A governance plugin serves the build-pipeline transform and verdict roles; the role it is attached at — not its kind — fixes what it may emit. Allowed values: `"provider"`, `"linter"`, `"pipeline-step"`, `"governance"`, `"cli"`, `"parser"`, `"importer"` |
| `capabilities` | string[] | no | What the plugin serves. The list is flat on the wire and the adjacent required plugin_type fixes which of four senses each entry carries: for a provider, the capability names (such as helm or compose) whose output shape it renders; for a feature-recipe-pipeline step, the provider capabilities its step is compatible with; for a parser, the source formats it turns into a canonical structured tree, each written as parse:<format>; for an importer, the foreign source formats it turns into draft authoring files, each written as import:<format>. A linter, governance or CLI plugin is not resolved by capability and leaves it empty. Entries are in declared order and are an explicit, tested-compatibility claim. An absent or empty list declares no capability claim. The published catalog entity carries the same values under the per-type block its plugin type gives meaning to, so the entity's reader never has to decide which sense applies. |
| `exports` | PluginExport[] | yes | The exports the plugin offers, in declared order. The host validates that the per-type minimum export is present and binds the per-export host surface before invoking each export. |
| `contract` | ProviderContract | no | The provider's render-behavior self-report — the input kinds it renders, how it assembles a dispatch group's per-node output, and the artifact-template delimiter pair it applies. It describes the provider as a whole rather than any one export. Absent for a plugin that declares no render-behavior contract. |
| `importer` | ImporterContract | no | An importer's self-report of how a source of the formats it advertises is recognised when an import names no format. Only a plugin whose plugin_type is importer may declare it; any other plugin declaring it is refused at load. Absent for an importer that declares no way to recognise its formats, whose formats are then reached only by naming them. |
| `description` | string | no | The plugin's own one-line human-readable description of what it does, distinct from a per-export description and from the entity's metadata description. It is informational; the host neither validates nor acts on it. |
| `commands` | PluginCLICommand[] | no | The top-level aggrega command verbs a CLI plugin contributes, each with its own short-help line. One CLI plugin may contribute several commands; the host registers one command per entry and routes the resolved command name to the guest at invocation. A non-CLI plugin leaves it empty. |
| `settings_schema` | object | no | An optional JSON Schema document a plugin declares to type the operator-supplied settings its attachment carries. When present, the host compiles it at load and validates the attachment's settings against it at dispatch before invoking the plugin; settings that do not conform halt the build. When absent, the plugin declares no shape and settings pass through verbatim. The schema is the plugin's own free-form declaration; the host runs generic JSON Schema validation against it and does not interpret the settings' meaning. |
| `metadata` | PluginDescriptorMeta | no | Optional authorship and build-provenance information. It carries no behavioral contract — the host neither validates nor acts on it. |

_Additional properties are not permitted._

### `PluginExport`

One export a plugin offers, as declared in describe(). The host dispatches to the export by its name and binds the least-privilege host surface the export's declared host functions require.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | The export's ABI name — for example render_node, assemble_boundary, lint_rules, or step. The host dispatches to the export by this name. |
| `input_pattern` | string (enum) | no | How the host delivers the export's input: b delivers the full payload inline so the guest renders from the payload alone; a delivers a small payload the guest enriches via host functions. An export that omits this field takes its plugin-type and name default. Allowed values: `"a"`, `"b"` |
| `host_functions` | string[] | no | The host function names this export imports. Every name must be in the host-function allowlist. The declaration is authoritative and is cross-checked at load against the functions the guest actually imports from its module, so it cannot drift from the functions the guest really calls. |
| `description` | string | no | Optional human-readable text describing the export. It is documentation for catalog readers; the host neither validates nor acts on it. |
| `stability` | string (enum) | no | The export's stability level. An omitted value carries no stability claim. Allowed values: `"stable"`, `"experimental"`, `"deprecated"` |
| `operates` | string (enum) | no | The pipeline operation this export performs: patch modifies an existing rendered document, emit adds a new document. The value is shape-checked at load; the runtime reads it when dispatching the step. Allowed values: `"patch"`, `"emit"` |
| `scope` | string (enum) | no | The document root this export operates on: own is the node's own rendered documents, host is the documents of the component a component-scope feature recipe is attached to. The value is shape-checked at load; the runtime resolves the scope's documents when dispatching. Allowed values: `"own"`, `"host"` |
| `selector` | string | no | A free-form, human-readable description of what the export acts on. It is documentation for catalog readers; the host neither validates its content nor acts on it. |
| `input` | object | no | An optional JSON Schema document a step export declares to type the step-local input a pipeline entry supplies through its with block. When present, it describes the shape a step's with input satisfies; when absent, the export declares no input contract. The schema is the export's own free-form declaration of the input surface a pipeline author targets for this export. |
| `output` | object | no | An optional JSON Schema document a step export declares to type the outputs it returns for one step — the shape of the addressable outputs a step contributes for a later step or a template to read. When present, it describes the shape of those returned outputs; when absent, the export declares no output contract. The schema is the export's own free-form declaration of the output surface this export produces. |

_Additional properties are not permitted._

### `PluginCLICommand`

One top-level aggrega command verb a CLI plugin contributes, as declared in describe(). The host registers one command per entry and routes the resolved command name back to the guest at invocation, so a single guest may back several commands and select its behavior on the name.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | The command verb the host registers — the aggrega token an operator invokes and the discriminator the host hands the guest so it can route on which command was called. Every declared command must name it. |
| `description` | string | no | The command's one-line short-help text, shown in the command listing and help output. It is optional documentation; the host neither validates nor acts on it. |
| `flags` | PluginCommandFlag[] | no | The command's flags, in declared order. Each entry contributes one flag the host registers on the command so aggrega help <command> renders it like a core command's flag. A command with no flags leaves it empty. |

_Additional properties are not permitted._

### `PluginCommandFlag`

One flag a CLI plugin declares on a command, as reported in describe(). The host registers it on the command so aggrega help <command> lists it alongside a core command's flags.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | The flag's long name — the --name token an operator passes on the command line. Every declared flag must name it. At least 1 character long. |
| `shorthand` | string | no | The flag's optional single-character short alias — the -x form an operator may pass instead of the long name. Absent means the flag has no short alias. |
| `description` | string | no | The flag's one-line help text, shown in the command's help output. It is optional documentation; the host neither validates nor acts on it. |
| `type` | string | no | The flag's value type — for example string, bool, or int. Absent carries no type claim. |
| `default` | string | no | The flag's default value when the operator does not pass it, expressed as a string. Absent means the flag declares no default. |

_Additional properties are not permitted._

### `PluginDescriptorMeta`

Optional authorship and build-provenance metadata a plugin declares in describe(). It is informational; the host does not validate or act on it. The version and commit fields are build-provenance stamped into the guest at build time; an unstamped build omits them.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `author` | string | no | The plugin's author. |
| `repository` | string | no | The plugin's source repository. |
| `license` | string | no | The plugin's license identifier. |
| `version` | string | no | The build-provenance version stamped into the guest at build time. Omitted by an unstamped build. |
| `commit` | string | no | The build-provenance short commit the guest was built from. Omitted by an unstamped build. |

_Additional properties are not permitted._

### `ProviderContract`

A provider's self-declaration of the compile-time render behaviors it performs across the nodes it renders — the input kinds it accepts, whether and how it assembles a dispatch group's per-node output into a single artifact, the Go-template delimiter pair it applies to imported artifact files, whether it accepts the files a Recipe contributes to its boundary's shared output, and the files its ecosystem never ships beside a source. It describes the provider as a whole, not any one export. The load gate cross-checks it against the entity's authored claim.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `input_kinds` | InputKinds | yes | Which of the three Recipe input kinds the plugin renders: a sourced file set, a synthesized workload, and a standalone artifacts-only node. |
| `boundary_assembly` | string (enum) | yes | How the plugin combines a dispatch group's per-node render output: none writes each node's output directly at the dispatch path, merge folds the per-node fragments into one document, and nest places each node's output under its own position in an umbrella structure. An empty value carries no assembly claim. Allowed values: `"none"`, `"merge"`, `"nest"`, `""` |
| `artifact_delimiters` | ArtifactDelimiters | no | The Go-template delimiter pair the plugin applies to imported artifact files. Absent means the default open/close pair; a plugin whose target syntax collides with that pair reports an alternate pair here. |
| `assembly_name_annotation` | AssemblyNameAnnotation | no | A boundary annotation whose resolved value names the artifact the plugin assembles from a dispatch group. Absent means the plugin names its assembly from the dispatch path alone. |
| `reusable_instance` | boolean | no | Whether one loaded plugin instance may serve every render, assemble, and validate crossing of the build rather than a fresh instance per crossing. A plugin declares it true only when it holds no state across crossings. Absent (false) is the safe default: the host loads a fresh instance per crossing. |
| `cross_boundary_linking` | boolean | no | Whether the plugin wires cross-boundary uses edges — edges whose consuming and consumed ends assemble into different dispatch groups — by producing provider-native cross-reference wiring through its link_publish and link_resolve exports. A plugin declares it true only when it exports both. Absent (false) is the safe default: the plugin wires no cross-boundary edges. |
| `omits` | boolean | no | Whether the plugin honours the omit entries a render_node input carries: it leaves every rendered unit an entry matches out of everything it returns, and reports one count per entry it was handed in the output's omitted. A plugin declares it true only when it does both. Absent (false) is the safe default: the plugin makes no claim to leave anything out. |
| `boundary_artifacts` | boolean | no | Whether the plugin's target accepts the files a Recipe contributes to the shared output of the boundary it renders in. The host evaluates those files and writes each one once, in the directory holding the dispatch group's assembled output, beside what the plugin's assembly writes; the plugin is handed none of them and reads none of them, so the claim is a statement that its target treats a file placed there as part of the boundary's output. Absent (false) is the safe default: a Recipe declaring such files for this plugin is refused before anything renders. |
| `nest_segment` | string | no | The directory the plugin's target places each contributor's own sub-directory under, for a plugin that nests a dispatch group's per-node output. The host joins this segment, the contributor's authoring-level name, and each file's own path. Read only when boundary_assembly is nest. Absent, the host places each contributor's sub-directory directly at the dispatch position, with no enclosing directory. The value names one directory and never a path: a value carrying a path separator, or naming the current or the parent directory, is refused, because the host composes the contributor's name into it and a path fragment would place a contributor's files somewhere other than beneath the dispatch position. |
| `source_ignore` | SourceIgnore | no | The files this plugin's ecosystem never ships beside a source it renders, declared as ignore rules. The host reads the declaration when an author pins a Recipe or FeatureRecipe whose capability this plugin serves for them: it composes these rules with the author's own ignore file, records the composed rules in the entity lock beside the entity, and from then on every publication of the entity, every comparison of its local source and every render of it applies the recorded rules rather than asking a plugin again. So a Recipe published for a capability carries the files its publisher's rules kept, and a plugin renders it when it speaks the same ABI version, its contract matches its entity's claim, and it needs no file outside that set. A plugin that needs a file the set left out must fail its build loudly and name the file; the host's part is to refuse a pack or a read of a file the set does not hold, naming it. Absent declares no ignore rules, and a source the plugin renders then keeps every file the author's own rules keep. |

_Additional properties are not permitted._

### `SourceIgnore`

The ignore rules a plugin's ecosystem applies to a source directory, in gitignore syntax: a pattern holding no slash, or only a trailing one, matches a name at any depth, a pattern holding any other slash is read from the root of the directory it is scoped to, a trailing slash matches only a directory, and a leading ! brings back what an earlier rule excluded. Rules apply in order and a later match overrides an earlier one. A directory a rule excludes is not entered, so nothing under it comes back unless the directory itself is brought back first.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `patterns` | string[] | no | The ecosystem's own ignore patterns, each scoped to the root of the local source directory being walked, in the order they apply. Absent or empty declares none. |
| `files` | string[] | no | The names of the ignore files the ecosystem honours inside a source — .helmignore for a chart, for instance. Wherever the walk of a source finds a file of one of these names, its lines are read as further patterns in the same syntax, each scoped to the directory holding the file, and they apply after the patterns above; a blank line and a line opening with # are skipped. A file of such a name is itself carried unless a rule excludes it. Absent or empty names none. |

_Additional properties are not permitted._

### `InputKinds`

Which Recipe input kinds a plugin renders. Each field is an independent claim; a plugin may report any combination.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `sourced` | boolean | yes | Whether the plugin renders a sourced file set (a chart, a module, a compose file). |
| `synthesized` | boolean | yes | Whether the plugin renders a synthesized workload. |
| `artifacts_standalone` | boolean | yes | Whether the plugin renders a standalone artifacts-only node — one carrying imported artifact documents and no source or workload. |

_Additional properties are not permitted._

### `ArtifactDelimiters`

The Go-template delimiter pair a plugin applies to imported artifact files, reported when it differs from the default pair.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `left` | string | yes | The opening delimiter. |
| `right` | string | yes | The closing delimiter. |

_Additional properties are not permitted._

### `AssemblyNameAnnotation`

The boundary annotation whose resolved value names a plugin's assembled artifact, reported when the plugin folds a dispatch group's contributing boundaries into one named assembly.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `annotation` | string | yes | The boundary annotation key the plugin reads the assembled artifact's name from. |
| `require_unique` | boolean | no | Whether every boundary contributing to one dispatch group must agree on the annotation's resolved value. When true, a group whose contributing boundaries resolve the annotation to different values halts the build; when false, the plugin accepts the first resolved value. |

_Additional properties are not permitted._

### `ImporterContract`

What an importer declares about its formats beyond advertising them: the signatures a source of those formats is recognised by. When an import names no format, the host reads the signatures recorded by every importer the import selects among — the importers in the workspace's catalog and the compiler's core importers, whose Plugin entities the binary carries — matches each against the source without knowing what any format is, and reads the source as the format of the one importer whose signature matches. A source no signature matches is refused asking for the format, and a source signatures of more than one format match is refused naming them. The Plugin entity records the same list, and the host refuses an importer whose describe() report differs from the record.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `detect` | DetectSignature[] | no | The signatures that recognise a source of this importer's formats, in declared order; a source is recognised when any one of them matches it. A source recognised by an importer is recognised as every format the importer advertises, so an importer advertising more than one format has every match refused as ambiguous, and an importer whose sources must be recognised advertises one format. Absent or empty declares no signature, and the importer's formats are reached only by naming them. |

_Additional properties are not permitted._

### `DetectSignature`

One way a source is recognised: the syntax the source is read in, the file names the signature applies to, and the predicates the parsed tree must satisfy. It matches a file whose name matches one of its file patterns — or, where it declares none, a source that is one file, whatever it is called — whose bytes parse in its syntax, and whose parsed tree satisfies every one of its predicates. It matches a directory where it matches one of the directory's files its patterns select, so a signature declaring no pattern matches no directory.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `syntax` | string | yes | The syntactic format the source is parsed as — json or yaml, for example — which is the format a parser plugin advertises as parse:<syntax>. The host parses the source through the parser the workspace's catalog serves for that syntax, or, for a syntax the catalog serves none for, through the one the compiler carries, at most once whatever number of signatures name the syntax, and a source that does not parse in it matches no signature naming it. A syntax neither serves a parser for stops the recognition with that parser's absence named, rather than being passed over. At least 1 character long. |
| `files` | string[] | no | The file-name patterns the signature applies to, matched against the end of the source's name with its separators read as forward slashes: a pattern of one segment is matched against the file's own name, and a pattern of several slash-separated segments against that many trailing segments of its path, so .vscode/mcp.json matches a file named mcp.json in a directory named .vscode. Within a segment, * matches any run of characters, ? matches one character, and [...] matches one character of a class. The signature applies when any pattern matches. A pattern that is not well formed is refused at load. Absent or empty applies the signature to a source that is one file, whatever it is called, and to no file of a directory. The patterns of an importer's signatures are also what decide which files of a directory an import hands it. |
| `match` | PathMatch[] | no | The predicates the parsed tree must satisfy, all of them, in declared order. Absent or empty asks nothing of the tree beyond parsing in the syntax. |

_Additional properties are not permitted._

### `PathMatch`

One predicate over the parsed tree: the value a path reaches, the kind of value it must be, and optionally a string it must equal or begin with.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `path` | string | yes | Where in the tree the predicate looks, written as keys joined by dots from the top of the tree: data.nodes names the nodes member of the top-level data object. A segment written as a whole number, 0 or greater, selects that position of an array counting from zero, so nodes.0.type names the type of the first node; every other segment selects a member of an object. A key that itself contains a dot cannot be named. At least 1 character long. |
| `is` | string (enum) | yes | What the path must reach: present holds when it reaches a value of any kind, null included; absent holds when it reaches nothing; object, array, string, number and boolean each hold when it reaches a value of that kind. Allowed values: `"present"`, `"absent"`, `"object"`, `"array"`, `"string"`, `"number"`, `"boolean"` |
| `equals` | string | no | A string the value the path reaches must equal exactly. A value that is not a string never equals it. At most one of equals and prefix is declared on one predicate, and a predicate declaring both is refused at load. At least 1 character long. |
| `prefix` | string | no | A string the value the path reaches must begin with. A value that is not a string never begins with it. At most one of equals and prefix is declared on one predicate, and a predicate declaring both is refused at load. At least 1 character long. |

_Additional properties are not permitted._
