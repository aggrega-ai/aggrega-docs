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
the drafted files into the current directory (creating parent directories as
needed). The importer attached at the workspace's import socket does the
translation; import selects it, runs it, and writes what it produces.

The source format selects how the importer reads the file. Pass --format to
name it explicitly. When --format is omitted, import inspects the file's
top-level shape to recognize the format; if the shape is not recognized, import
stops and asks for --format rather than guessing. Detection reads only the
named file — no other files, no network.

Before the drafted output, import names on standard error the format it read
the source as and the directory the drafted paths are relative to, alongside
any diagnostics the importer reported. Standard output carries only the result
— the paths written, or the drafted files themselves under --dry-run — so it can
be piped unchanged.

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
| `--format` | — | Name the source format explicitly, overriding shape detection (for example langflow or flowise) |
<!-- END GENERATED: cli-import -->
