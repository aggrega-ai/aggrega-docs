# aggrega import

Turn a foreign source description into draft Aggrega authoring files

This page is the command's reference. What an import is for, and walkthroughs that take a project from
its source to a build, are in [Import](../../authoring/import/README.md). The answers file the values no
source can hold are read from, and the questions asked at a terminal, are described in
[The import answers file](../import-answers.md).

<!-- BEGIN GENERATED: cli-import -->
**Synopsis**

```
aggrega import <file or directory> [flags]
```

**Description**

```
Turn a foreign source description into draft Aggrega authoring files.

The importer reads the source, drafts Aggrega entities from it, and writes the
drafted files beneath the root of the workspace the run resolved, from whichever
folder the command is run in (creating parent directories as needed). The
translation is done by the importer plugin that advertises the source format;
import selects it, runs it, and writes what it produces. An importer in the
workspace's catalog has its .wasm read from the places a build reads a plugin
from — beside its Plugin entity in a catalog folder among them.

The compiler's core importers serve their formats in every workspace, with no
catalog entry. The first import that needs one this machine does not hold
fetches it from the workspace's default registry, holds it to the module the
compiler's release publishes, verifies its signature under that registry's
trust policy and the host functions it uses, and keeps it in the workspace's
content cache, so every later import reads it from there and reaches no
network for it. Nothing else is written for it: no lockfile, and no record of trusted
plugins. A module that does not verify is refused, and nothing is kept. Where
the module cannot be fetched — the workspace is offline, its registry cannot be
reached, or the registry does not hold it — import stops, naming the importer
and its version and what puts its module on the machine: running the import
once with the network available, where that would fetch it, or placing the
module beside a Plugin entity of that importer at that version in a catalog
folder.

The catalog an import reads is the workspace's catalog folders. Where the
workspace names none — AGGREGA_CATALOG_DIRS is unset, its configuration lists
no catalog_dirs, and it holds no catalog folder at its root — import reads the
catalog its default registry publishes as one signed snapshot, at
catalog/snapshot. A snapshot is fetched once: its signature is verified under
that registry's trust policy, and it is kept in the workspace's content cache
and read there as a catalog folder, held to its digest, with no registry asked
for it again. Which snapshot an import reads: with --upgrade, the newest;
otherwise the one the record beside the drafts names, fetched by its digest
when this machine does not hold it; otherwise the one the workspace last
fetched as the newest; otherwise the newest. The record an import writes names
the snapshot it read by its digest. Under --offline an import that would have
to fetch one stops, naming what to run. A registry that publishes no
snapshot leaves the import with no catalog, and a warning says so. A workspace
that names a catalog folder imports against it, and nothing is fetched.

The source is a file or a directory. A file is handed to the importer whole. A
directory is read into named sources: exactly the files the importer's declared
file patterns match, at any depth, each named by its path inside the directory
written with forward slashes, in sorted order, and no other file of the
directory is opened. A directory holding the folder aggrega build writes to —
dist/ beneath the workspace root — is read without it: nothing in that folder
is recognized or handed to the importer, so a directory you have built is
read as the project it holds, and a directory that is that folder, or lies
inside it, is read as named. A link inside the directory is never followed out
of it: the directory is held to itself wherever it lies, inside the workspace or
outside it, so a link leading out of it — to a directory, or to a file the
importer's patterns match (any importer's, when the format is recognized) — is
refused before anything is read. A link to a directory is never entered, and a
link to a file no pattern matches is passed over unread. An importer that
declares no file patterns reads one file and refuses a directory, and a
directory holding no file its patterns match is refused too. The files the
importer's attachment names under with: sources reach it beside the directory's
files, under their own base names, and a name the two share is refused rather
than one hiding the other.

A plugins.importer attachment attaches the importer its uri names by identity
and version — importer/<name>:<version>, as plugin add importer writes it. An
attached importer that advertises the source format is the one that runs, at
the version its uri names, whatever other importers advertise the format too.
Where more than one importer advertises the format and no single one of them is
attached, import stops and names the importers it could not choose between. The
core importers are among them: a workspace whose catalog holds an importer of
another name for a format a core importer serves attaches the one it wants.
Within one name the highest version runs, and an importer the catalog holds at
the name and version of a core importer, with its module beside it, runs in
its place. A Plugin entity of a core importer's name with no module beside it
is no candidate: the core importer runs in its place at its own version, and
at another version the entity stays a candidate only where an attachment names
exactly that version, or where no importer of that name that can run
advertises the format. An attachment's
with: sources and settings are handed to the importer it attaches and to no
other, so an importer no attachment names is handed none.

Pass --output-dir to write the drafts beneath another directory instead. A
relative path resolves against the directory you run the command in, as every
path you type does, and a drive named bare on Windows, such as D:, is the
current directory on that drive. The directory is resolved before any draft is
placed beneath it, so a draft whose path opens with a separator lands beneath
it rather than at the top of the drive. A directory you name outside
the workspace is used where you named it, and what is written beneath it is
held to it. Wherever the drafts go, a link on the way to one that leads out of
the workspace — or, beneath a directory you named outside it, out of that
directory — is refused, and nothing is written.

Pass --target to draft, beside the importer's drafts, the Manifest the drafted
Release builds against for one provider. The target is a provider capability —
the word a Recipe's spec.capability binds to, such as compose or helm. For each
component type and each feature type the drafts need — on the drafted
Aggregate's components, their connections and its subsystems, on the catalog
Aggregates it composes, and on the drafted Release's attachments — in the order
the drafts first declare it, import looks in the workspace's catalog for the
Recipes, or for a feature type the feature recipes, that implement the type and
bind to that capability: where there is exactly one — several versions of one
count as one — the Manifest maps the type to it by its capability-qualified name
with no version, such as compose/postgres, which the first pull pins in the
lockfile at the highest version available; where there are several of different
names, it maps the one named after the type itself, such as helm/postgres for
core/datastore/postgres; where there is none, or several with none so named, the
type is left unmapped and a warning names it and why, so a build of the drafts
stops naming each instance or attachment of it until you add the mapping. Where
the importer drafts the Manifest itself, to choose the Recipe one instance
renders through or a feature recipe among several, each mapping it wrote that
the catalog offers for that type and capability is kept, any other is dropped
with a warning, and the types it leaves are mapped as above. The Manifest is
written as manifest.yaml beside the drafted Release, with the Release's name
and version, and the Release's spec.manifest is set to that name — the comment
the importer wrote in its place is replaced, and nothing else in the Release
changes. A Release that already names a Manifest is left as it is; where the
import drafts no Release, the Manifest is drafted beside the Aggregate, with its
name and version, and nothing references it. The Manifest and the edited
Release are drafts like the others: recorded, held inside the output directory,
and shown by --dry-run. A target no Recipe in the catalog binds to stops the
import before the importer runs, naming the target and the capabilities the
catalog's Recipes bind to, and nothing is written. Without --target no Manifest
is drafted and the drafts are the importer's alone — except under --sync, which
reuses the target the earlier import was given.

Beside its drafts, every import that drafts anything writes .aggrega-import.json,
the record of what it wrote: the target it was given, where it was given one,
the catalog snapshot it read, where it read one, and each drafted file and, in a drafted Aggregate or Release, each key at every
depth, with a digest of the text written there; any other drafted file is
recorded whole. A key's text is its line, its value's lines where its value is
not a mapping of keys, and the comment lines written directly above it at its
own indentation. The record is JSON, so nothing that reads the workspace's YAML
documents reads it; keep it beside the drafts for as long as you mean to sync
them.

Some values no source can hold: the image of an application built from your
own code, the email of an owner account, a model the source does not name, the
name of a Kubernetes Secret. The drafts write each such value as an empty
string under a comment saying what it is. After drafting, import reads every
drafted document against its own schema and against the catalog schema of each
Component, Feature and connection it declares, and lists every value still
empty where that schema requires one, or where it declares the key and nothing
supplied it — each described by the schema's own description. The values are
answered from the answers file: --answers names it, and without it import reads
the one the record beside the drafts names, or else import-answers.yaml beside
the source file, or inside the source directory. The answers file holds, under
each drafted file's path, the key path inside that document and its answer as a
string, with the schema's description in a comment above each key. Each answer
is written into the drafts before anything is written or recorded, so an import
of the same source, and --sync, read the same answers and draft the same files.
An answer for a key these drafts do not leave empty — one only another
target's drafts ask for, say — is kept in the file and not applied, so one
answers file serves every target: import adds the keys it owes, sets the
answers it is given, and leaves every other key and comment as it is, writing
the file only where that changes it. The record beside the drafts names the
answers file where it is not the one beside the source, and holds no answer.

The answers file never holds a secret. A secret's value — one its schema marks
sensitive — is answered with where the secret comes from: a variable name, a
reference such as ${OPENAI_API_KEY}, or the name of a Kubernetes Secret.
Anything else is refused, naming the key and never the answer, and nothing is
written.

Where standard input and standard output are both a terminal, and --dry-run is
not given, import asks one question for each value the answers file leaves
unanswered, worded from the schema's description; an empty answer leaves the
value for later, and a secret's answer that is not a name is refused and asked
again. Every answer is written into the answers file, so a later run asks
nothing. Anywhere else — a pipe, continuous integration, the assistant's import
tool, the editor — nothing is asked: the drafts keep their empty values, the
answers file is written with every owed key present and empty, each owed value
is named on standard error, and import exits 1 with one sentence saying how
many values are owed and where to write them. Under --dry-run nothing is asked
and nothing is written: each owed value is named on standard error, and the
exit status is the dry run's own.

When the drafts include a Release, owe nothing, and the importer finished,
import pulls that Release's dependencies once the drafts are written, exactly
as aggrega pull --release does, writing its release.lock, so aggrega validate
and aggrega build work on the drafts at once. Under --offline nothing is pulled,
and import names the aggrega pull to run next. A pull that fails leaves the
drafts written and stops import, naming why and the pull to run once it is
fixed.

An import never writes over an Aggregate already at one of its drafted paths:
an Aggregate is the document an author goes on editing once it is drafted, so
import stops, naming it and --sync, and writes nothing — under --dry-run too.
Every other file already at a drafted path is written over, and a file an
earlier import drafted that this one does not draft is left where it is.

--sync brings what an earlier import drafted up to date with the source instead,
changing only what the import wrote. A sync given no --target drafts for the
target the record names, so it drafts the Manifest the earlier import drafted;
given one, it drafts for that target and records it in place of the one
recorded. A recorded target no Recipe in the catalog binds to stops the sync as
a target you pass does, saying the target is the recorded one. It judges every
part three ways — what the record says the import
last wrote there, what is on disk, and what the source drafts now:

  - a part the source left as the import last wrote it stays exactly as it is
    on disk, whether or not you edited it;
  - a part the source changed is written anew, where it is on disk as the
    import last wrote it;
  - a part the source dropped is removed, where it is as the import last wrote
    it and holds nothing you added — a drafted file is deleted whole;
  - a part the source gained is added beside the parts the draft names around
    it.

Everything else stays byte for byte: a key you added anywhere — a parameter, a
Feature, under a drafted Component instance too, another Component, the
environment a drafted Release leaves for you — a comment not written directly
above a drafted key, and every file the record does not list. Before anything is written, standard error names each part that drifted,
one line each:

  added|removed|changed <key> in <file>
  added|removed|changed <file>

Where the sync would change or remove a part you edited, add a part where you
already wrote one, or remove a part holding something you added, import stops,
naming each such part and why, and writes no draft (an answer you typed is kept
in the answers file); reconcile them by hand and sync again. A comment you write directly above a drafted key edits that key.
An Aggregate at a drafted path that no record lists stops the sync too, saying
so, as does a record that cannot be read. Where the importer reports a
diagnostic that stops the import, a sync writes nothing. A sync into a directory
holding no record and nothing at its drafted paths writes the whole draft.

With --sync, --dry-run writes nothing and names the same drift, or stops on the
same conflicts, and the exit status says which: 0 when the drafts are in step
with the source, 2 when they drifted, and 1 on an error or when the sync is
refused. Standard output carries the files the sync would write, with the
content it would give them.

On Windows, a draft whose path holds a part Windows cannot hold as written — a
name it reserves for a device, such as NUL or aux, with or without an extension
and in any letter case, or a part ending in a full stop or a space — is refused
naming the draft, and nothing is written. On every other platform such a draft
is written as it is named.

The source format selects how the importer reads the source. Pass --format to
name it explicitly. When --format is omitted, import recognizes the format by
the signatures the importers declare — the workspace catalog's and the core
importers' alike: each names the syntax a source is read in, the file names it
applies to and the paths its parsed tree must or must not carry. A file is
parsed once for each syntax a signature applying to its name reads it in, and
the format of the one importer whose signature matches is the one read. The
signatures of the Langflow, Flowise and n8n importers, the MCP importer's for a
registry server description and the LangGraph importer's for a configuration
naming its schema, read a file as JSON and name no file, and
the Dify and Agent Framework importers' read it as YAML and name no file, so
recognizing a file imported on its own reads it as JSON and as YAML too. The Dify importer
recognizes an application Dify exports, under any name, by app at its kind and
by the application's mode at app.mode and the DSL's version at version.
The MCP importer recognizes a client's configuration by its name — .mcp.json,
claude_desktop_config.json and .cursor/mcp.json read as JSON, .vscode/mcp.json
read as JSON with comments, as Visual Studio Code reads it — so such a file under
another name is imported naming --format mcp. The Compose importer reads a file as YAML and recognizes it by the names
Compose reads by default — compose.yaml, compose.yml, docker-compose.yml and
docker-compose.yaml, and their override files compose.override.yml,
compose.override.yaml, docker-compose.override.yml and
docker-compose.override.yaml — and an object at services, so a Compose file
under another name is imported naming --format compose. The CrewAI importer
recognizes a project's declarations by their names: config/agents.yaml and
config/tasks.yaml, read as YAML, and crew.jsonc holding a list at agents and
agents/<name>.jsonc holding a role, read as JSON with comments, as are their
strict-JSON spellings crew.json and agents/<name>.json, a .json file not being
read where its .jsonc spelling is handed too; it is handed those files and no
other, so a crew's program is never read. The LangGraph importer recognizes an
application's configuration, read as JSON with an object at graphs, by its name,
langgraph.json, or, under any name, by https://langgra.ph/schema.json at its
$schema; of a directory it is handed that file alone, so neither the
application's code nor an environment file is ever read, and the environment
file a configuration names is read, for its variables' names alone, only where
the importer's with.sources hands it. The Google ADK importer recognizes an application's root agent
configuration, read as YAML, by its name, root_agent.yaml, and an agent's name
with its instruction or its agent_class; of a directory it is handed each
root_agent.yaml alone, so neither the application's code nor its environment
file is ever read, and the configuration a sub_agents entry names is read only
where the importer's with.sources hands it. The Agent Framework importer
recognizes a declarative agent, under any name, by Prompt at its kind and an
object at its model, read as YAML; it names no file, so a directory is never
handed to it, and a declarative agent is imported as a file of its own. A directory is
recognized the same way over the files it holds: each signature is tried against the files
its file names match, and a signature that names no file applies to none of
them. If no signature matches, import stops, asks for --format and names the
formats the importers advertise — or, for a directory, asks for one of its
files imported on its own or for a format whose importer declares file
patterns, naming only those; if signatures of more than one format match,
it stops and names them. It does not guess. Recognition reads nothing but the
source — of a directory, only the files a signature's file names match — and
reaches no network.

Recognition and the importer read the source through the parser the
workspace's catalog serves for its syntax, and, for a syntax the catalog
serves no parser for, through the parser the compiler itself carries for it —
JSON, JSON with comments and YAML among them — so a workspace whose catalog holds no parser still
recognizes and imports a source the core importers read. Where the catalog
serves a parser for a syntax, the compiler's own plays no part in reading it.
The compiler's parsers are part of the binary, so nothing is fetched for one.
A syntax neither serves stops the import, naming the syntax no parser serves,
and a source its parser refuses stops the import with the parser's reason.

Before the drafted output, import names on standard error the format it read
the source as and the directory the drafted paths are relative to, then any
diagnostics the importer reported, then one line for each source node the
importer mapped, in the importer's order:

  mapped <node id> (<node type>) to <target> as a <mode>, <tier> at <score>

naming the catalog Component or draft it chose for the node, whether it is
referenced or drafted, the match tier, and the score of the best candidate it
weighed. A node the importer weighed no candidate for has no score, and its line
ends at the tier; a node it made no choice for reads "made no choice for <node
id> (<node type>)"; then, under --sync, the drift lines. Standard output
carries only the result — the paths written, and under --sync the paths
removed, or the drafted files themselves under --dry-run — so it can be piped
unchanged.

--dry-run does everything import does except write: standard output carries one
document listing each drafted file's path and its content, so the result can be
reviewed, parsed or piped before anything reaches disk. Every other behaviour is
the write's — the same importer runs over the same source and reports the same
diagnostics — so what a dry run shows is what a write would put on disk, and a
source the write would refuse is refused here too.
```

**Flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--answers` | — | The answers file the values the drafts leave empty that no source can hold are read from and written to: under each drafted file's path, the key path inside it and its answer. A relative path resolves against the directory you run the command in. Without it, the answers file the record beside the drafts names, or else import-answers.yaml beside the source file, or inside the source directory. A secret's answer is the name of where the secret comes from, never the secret itself. |
| `--dry-run` | `false` | Do everything except write: hand back the drafted files as content, naming the file each is for, and create or modify nothing. Every other behaviour is the write's, the importer run included. Without it the drafts are written to disk. |
| `--format` | — | Name the source format explicitly, overriding detection by the importers' signatures (for example langflow, flowise, n8n, mcp, compose, dify, crewai, langgraph, google-adk or agent-framework) |
| `--output-dir` | — | Directory the drafted files are written under. A relative path resolves against the directory you run the command in, and a drive named bare on Windows, such as D:, is the current directory on that drive. Without it the drafts are written beneath the root of the workspace the run resolved. |
| `--sync` | `false` | Bring what an earlier import drafted up to date with the source, changing only what the import wrote, as the record beside the drafts lists it, and naming each part that drifted. With --dry-run, exit 0 when in step, 2 when drifted, 1 on an error or a refusal. |
| `--target` | — | Draft a Manifest for this provider capability — the word a Recipe's spec.capability binds to, for example compose or helm — mapping each component type and feature type the drafts need to the Recipe or feature recipe of that capability the workspace's catalog offers for it, the one there is or, among several, the one named after the type, and point the drafted Release at it. A capability no Recipe in the catalog binds to is refused before the importer runs. Without it no Manifest is drafted, except that --sync reuses the target the earlier import was given. |
| `--upgrade` | `false` | Re-read the published catalog from current registry state: fetch the newest catalog snapshot the workspace's default registry publishes, verify it, and import against it, holding it as the snapshot this workspace reads from then on in place of the one it holds or the one the record beside the drafts names. It has an effect only where the workspace names no catalog folder, and is refused under --offline |
<!-- END GENERATED: cli-import -->
