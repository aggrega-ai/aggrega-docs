# aggrega import

Turn a foreign source description into draft Aggrega authoring files

<!-- BEGIN GENERATED: cli-import -->
**Synopsis**

```
aggrega import <file> [flags]
```

**Description**

```
Turn a foreign source description into draft Aggrega authoring files.

The importer reads the source file, drafts Aggrega entities from it, and writes
the drafted files beneath the root of the workspace the run resolved, from
whichever folder the command is run in (creating parent directories as needed).
The translation is done by the importer plugin in the workspace's catalog that
advertises the source format; import selects it, runs it, and writes what it
produces. Its .wasm is read from the places a build reads a plugin from — beside
its Plugin entity in a catalog folder among them — and nothing is fetched.

A plugins.importer attachment attaches the importer its uri names by identity
and version — importer/<name>:<version>, as plugin add importer writes it. An
attached importer that advertises the source format is the one that runs, at
the version its uri names, whatever other importers advertise the format too.
Where more than one importer advertises the format and no single one of them is
attached, import stops and names the importers it could not choose between. An
attachment's with: sources and settings are handed to the importer it attaches
and to no other, so an importer no attachment names is handed none.

Pass --output-dir to write the drafts beneath another directory instead. A
relative path resolves against the directory you run the command in, as every
path you type does. A directory you name outside the workspace is used where you
named it, and what is written beneath it is held to it. Wherever the drafts go,
a link on the way to one that leads out of the workspace — or, beneath a
directory you named outside it, out of that directory — is refused, and nothing
is written.

The source format selects how the importer reads the file. Pass --format to
name it explicitly. When --format is omitted, import recognizes the format by
the signatures the importers in the workspace's catalog declare: each names the
syntax a source is read in, the file names it applies to and the paths its
parsed tree must or must not carry. The file is parsed by the parser the catalog
serves for a syntax, once for each syntax a signature applying to its name reads
it in, and the format of the one importer whose signature matches is the one
read. If no signature matches, import stops, asks
for --format and names the formats the catalog's importers advertise; if
signatures of more than one format match, it stops and names them. It does not
guess. Detection reads only the named file — no other source, no network.

Before the drafted output, import names on standard error the format it read
the source as and the directory the drafted paths are relative to, then any
diagnostics the importer reported, then one line for each source node the
importer mapped, in the importer's order:

  mapped <node id> (<node type>) to <target> as a <mode>, <tier> at <score>

naming the catalog Component or draft it chose for the node, whether it is
referenced or drafted, the match tier, and the score of the best candidate it
weighed. A node the importer weighed no candidate for has no score, and its line
ends at the tier; a node it made no choice for reads "made no choice for <node
id> (<node type>)". Standard output carries only the result — the paths
written, or the drafted files themselves under --dry-run — so it can be piped
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
| `--format` | — | Name the source format explicitly, overriding detection by the catalog's importer signatures (for example langflow or flowise) |
| `--output-dir` | — | Directory the drafted files are written under. A relative path resolves against the directory you run the command in. Without it the drafts are written beneath the root of the workspace the run resolved. |
<!-- END GENERATED: cli-import -->
