# aggrega import

Turn a foreign source description into draft Aggrega authoring files

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
network. Nothing else is written for it: no lockfile, and no record of trusted
plugins. A module that does not verify is refused, and nothing is kept. Where
the module cannot be fetched — the workspace is offline, its registry cannot be
reached, or the registry does not hold it — import stops, naming the importer
and its version and what puts its module on the machine: running the import
once with the network available, where that would fetch it, or placing the
module beside a Plugin entity of that importer at that version in a catalog
folder.

The source is a file or a directory. A file is handed to the importer whole. A
directory is read into named sources: exactly the files the importer's declared
file patterns match, at any depth, each named by its path inside the directory
written with forward slashes, in sorted order, and no other file of the
directory is opened. A link inside the directory is never followed out of it:
the directory is held to itself wherever it lies, inside the workspace or
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
the name and version of a core importer runs in its place. An attachment's
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

Beside its drafts, every import that drafts anything writes .aggrega-import.json,
the record of what it wrote: each drafted file and, in a drafted Aggregate, each
key at every depth, with a digest of the text written there. A key's text is its
line, its value's lines where its value is not a mapping of keys, and the comment
lines written directly above it at its own indentation. The record is JSON, so
nothing that reads the workspace's YAML documents reads it; keep it beside the
drafts for as long as you mean to sync them.

An import never writes over an Aggregate already at one of its drafted paths:
an Aggregate is the document an author goes on editing once it is drafted, so
import stops, naming it and --sync, and writes nothing — under --dry-run too.
Every other file already at a drafted path is written over, and a file an
earlier import drafted that this one does not draft is left where it is.

--sync brings what an earlier import drafted up to date with the source instead,
changing only what the import wrote. It judges every part three ways — what the
record says the import last wrote there, what is on disk, and what the source
drafts now:

  - a part the source left as the import last wrote it stays exactly as it is
    on disk, whether or not you edited it;
  - a part the source changed is written anew, where it is on disk as the
    import last wrote it;
  - a part the source dropped is removed, where it is as the import last wrote
    it and holds nothing you added — a drafted file is deleted whole;
  - a part the source gained is added beside the parts the draft names around
    it.

Everything else stays byte for byte: a key you added anywhere — a parameter, a
Feature, under a drafted Component instance too, another Component — a comment
not written directly above a drafted key, and every file the record does not
list. Before anything is written, standard error names each part that drifted,
one line each:

  added|removed|changed <key> in <file>
  added|removed|changed <file>

Where the sync would change or remove a part you edited, add a part where you
already wrote one, or remove a part holding something you added, import stops,
naming each such part and why, and writes nothing; reconcile them by hand and
sync again. A comment you write directly above a drafted key edits that key.
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
core importers' signatures read a file as JSON and name no file, so recognizing
a file imported on its own reads it as JSON too. A directory is recognized the
same way over the files it holds: each signature is tried against the files
its file names match, and a signature that names no file applies to none of
them. If no signature matches, import stops, asks for --format and names the
formats the importers advertise; if signatures of more than one format match,
it stops and names them. It does not guess. Recognition reads nothing but the
source — of a directory, only the files a signature's file names match — and
reaches no network.

Recognition and the importer read the source through the parser the
workspace's catalog serves for its syntax, and, for a syntax the catalog
serves no parser for, through the parser the compiler itself carries for it —
JSON among them — so a workspace whose catalog holds no parser still
recognizes and imports a source the core importers read. Where the catalog
serves a parser for a syntax, the compiler's own plays no part in reading it.
The compiler's parsers are part of the binary, so nothing is fetched for one.
A syntax neither serves stops the import, naming the syntax no parser serves.

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
| `--dry-run` | `false` | Do everything except write: hand back the drafted files as content, naming the file each is for, and create or modify nothing. Every other behaviour is the write's, the importer run included. Without it the drafts are written to disk. |
| `--format` | — | Name the source format explicitly, overriding detection by the importers' signatures (for example langflow, flowise or n8n) |
| `--output-dir` | — | Directory the drafted files are written under. A relative path resolves against the directory you run the command in, and a drive named bare on Windows, such as D:, is the current directory on that drive. Without it the drafts are written beneath the root of the workspace the run resolved. |
| `--sync` | `false` | Bring what an earlier import drafted up to date with the source, changing only what the import wrote, as the record beside the drafts lists it, and naming each part that drifted. With --dry-run, exit 0 when in step, 2 when drifted, 1 on an error or a refusal. |
<!-- END GENERATED: cli-import -->
