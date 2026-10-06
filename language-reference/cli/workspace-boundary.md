# The workspace boundary

A workspace is the directory tree a project root marks — the root your configuration's `workspace:`
block sits in, the one `--workspace-root` names, the folder an editor opened, or the one an assistant's
server was started over. Everything Aggrega reads and writes on its own account is held to that tree,
except where you, or the workspace configuration, name a place outside it. A symbolic link inside it
can point anywhere on the machine, so a link is never taken as part of the workspace just because it
sits there: what counts is where it leads.

This page states the rule whole. The pages for each surface —
[the command line](../07-cli.md#paths-you-type-and-the-workspace-boundary),
[the language server](aggrega-serve.md#which-spellings-a-parameter-you-send-accepts) and
[the assistant tools](aggrega-mcp.md#reaching-the-server-over-https) — say how their own requests meet it.

## What lies inside the workspace

**A path is inside the workspace when the deepest part of it that exists, with its links followed,
is the workspace root or lies beneath it** — the root's own links followed the same way, so a
workspace you reach through a link of its own still holds everything beneath it.

That one reading covers every kind of path:

- **Where a path leads decides it, not how it is spelled.** `./shared/app.yaml` is outside when
  `shared` is a link to a directory elsewhere, though every part of it is written inside the
  workspace. A request parameter can still ask for a spelling of its own — a path relative to the
  root, say — and its own page says so; that is a rule about the parameter, not about the boundary.
- **A path that does not exist yet is judged by the directories on the way to it.** A file a build is
  about to create beneath a `dist` that is a link leading out is outside before it is written.
- **A link that leads nowhere, or round a loop, is not something that exists.** The directory holding
  it is judged instead, and nothing is followed to find out where the link was meant to go. Where such
  a link stands exactly where a file is about to be created, the place it points to is checked too,
  since that is where the file would land.
- **A link to somewhere else inside the workspace is followed as usual.** Only a link leading out is
  held.

The rule judges where a path leads on disk and nothing else. It reads no value and infers nothing from
a name.

## What a link leading out does

What happens to a path that leads out depends on what kind of path it is. There are three outcomes.

### Listed as not read

**Where Aggrega lists what the workspace holds, a link leading out is not read, and the listing says
so.** The Releases an editor offers to choose from, the entity index and the completions and
candidates an editor draws from it, and an assistant's `list-releases` and `list-entities` do not
search a directory outside the workspace or read a file outside it, whatever that file declares — so
an entity your editor shows under such a link is not listed as the workspace's own. The Release
listings and the entity listings name every such link by its own place in the workspace, never by
where it leads: `unreadLinkedDirs` and `unreadLinkedFiles` on the language server,
`unread_linked_dirs` and `unread_linked_files` on the assistant tools. A link to a directory your
configuration lists under `catalog_dirs`, or to a directory beneath one, or to a Release it names, is
not named: the configuration has reached that place — a listed directory is read with everything
beneath it — as [the exceptions](#the-exceptions-and-why-each-is-one) below describe. A
`.gitignore` that is a link leading out is not read either, so a file elsewhere on the machine never
decides which of the workspace's documents are searched.

### Refused

**A path a request names, where the caller is not the machine's owner typing it, is refused.** Apart
from [the exceptions](#the-exceptions-and-why-each-is-one) below, every path an editor's request to
`aggrega serve` names for the server to read or write, and every path an assistant names to a server
reached over HTTP, has to lead inside the workspace; one that leads out is refused with nothing read
or written, and the refusal names the parameter, as each surface's page sets out. The document edit is
refused this way on every surface, the command line included — see
[The document edit stays inside](#the-document-edit-stays-inside).

### Halted

**Where an operation would read or write through a link leading out on its own account, it stops.**
These are the paths the product works out for itself rather than paths you named, and passing over one
in silence could change what a build means, so each stops the operation, names the link and where it
leads, and leaves the place the link points to exactly as it was:

- **What a lookup reads** — a document beneath a catalog directory, or beside a Release that names its
  Aggregate or its Manifest by identity, or beside a Manifest that names the Manifest it extends that
  way. The Release or the Manifest the operation was named is not one of those documents: it was read
  where it was named — see [A Release or a Manifest named through a link](#a-release-or-a-manifest-named-through-a-link).
  A lookup that skipped such a link could resolve another entity
  of the same name from a later directory in its place, so a build, a pull, a validation, an inspection
  that reads the catalog, a lint of one Release or of the whole catalog, and the editor's and an
  assistant's requests that build, preview, graph, validate, lint or describe a Release all stop before
  anything is resolved or checked:
  [`E0321`](../errors/fatal-halts.md#a-file-the-operation-reads-leads-through-a-link-out-of-the-directory-it-must-stay-inside).
- **A Release's lockfile** — read beside the Release for the pins a build, a pull, a validation, a lint,
  an inspection, `aggrega cache prune` and the editor's and an assistant's requests resolve against. It
  is held where it is read exactly as where it is written, so a lockfile that is a link leading out
  stops each of them rather than lending them pins kept elsewhere on the machine:
  [`E0321`](../errors/fatal-halts.md#a-file-the-operation-reads-leads-through-a-link-out-of-the-directory-it-must-stay-inside).
- **The workspace's own configuration** — every `.aggrega-config.yaml` from the root down to the
  directory a command runs in, and a pipeline's `.aggrega-config-append-ci.yaml` beside any of them.
  Every command, the language server and an assistant's tools read the configuration before anything
  else, so one of these files that is a link leading out stops each of them there — the language server
  launched over the workspace stops at launch — rather than running on a configuration made from
  whatever remained:
  [`E0321`](../errors/fatal-halts.md#a-file-the-operation-reads-leads-through-a-link-out-of-the-directory-it-must-stay-inside).
- **What an operation writes or removes** — a build's output directory, its boundary directories and
  every file written there, the trace; a Release's lockfile and the plugin trust record beside it; an
  `entity.lock`; the workspace configuration file a command writes; the artifact cache and each part of
  it a pull fills or `aggrega cache clear` and `aggrega cache prune` empty; the drafts an import writes
  and the Plugin entities `aggrega plugin gen-catalog` writes; and the `.aggrega/active-release` marker
  an editor records a default Release in, which the language server writes for it. A `dist` that is a
  link would otherwise turn "rebuild the output" into deleting a directory somewhere else on the machine:
  [`E0320`](../errors/fatal-halts.md#a-path-the-operation-writes-leads-through-a-link-out-of-the-directory-it-must-stay-inside).
- **What a document names by a path** — see [A reference a document writes](#a-reference-a-document-writes):
  [`E0324`](../errors/fatal-halts.md#a-reference-to-another-file-leads-out-of-the-directory-it-must-stay-inside).
- **The content an entity declares** — a `source:` or an `$import:` whose path passes through a
  directory that is a link leading out of the entity's own directory, which a publication would
  otherwise carry under a name inside the entity:
  [`E0304`](../errors/fatal-halts.md#a-path-names-content-outside-the-entitys-own-directory).

These hold whoever started the operation — the command line, an editor, or an assistant on either
transport — because the path is the workspace's and the product's, not the caller's.

## A reference a document writes

A Release and a Manifest can name another file by a path: a Release's `aggregate:` and `manifest:`
written as `./…` or `../…`, its `extends:`, a Manifest's `extends:` written as a path, and a Release's
`parameters: { $import: … }`. **A document in the workspace reaches only files inside the workspace
that way** — a path that climbs out as written is refused, and so is one that stays inside as written
but meets a link leading out on the way. Nothing is read from the file either names.

A workspace you cloned carries its author's references, so confining what you name while following
whatever a document then leads to would leave the boundary one `../` away. Where a document needs an
entity kept elsewhere, it names the entity rather than a file — `aggregate: payments` — and the
workspace configuration lists the catalog directory holding it. A name is looked up, not followed, so
it is never refused here.

A Release or a Manifest that lies outside the workspace, admitted because you named it, reaches only
files in its own directory — see [An exception reaches the directory it names, and no further](#an-exception-reaches-the-directory-it-names-and-no-further).

## The exceptions, and why each is one

A path in one of these classes is honoured where it leads, inside the workspace or not. Each is a
class of path rather than a list of places, and each is an exception for a reason of its own.

- **What the workspace configuration names.** Its catalog directories — `catalog_dirs` and
  `catalog_dirs_append`, for the workspace or for a Release under `workspace.releases` — the Release
  files keyed under `workspace.releases`, `build.authoring_release`, a plugin attachment's local
  `.wasm` and the files under its `with.sources`, `mcp.tls.cert_file`, `mcp.tls.key_file`,
  `mcp.authorization.jwks_file`, a registry's pinned trust root, and an `artifact_cache_dir` that
  climbs out of the workspace root. **Naming a path in the configuration is the deliberate way a
  workspace reaches outside itself**: it is written down once, kept with the project, and read by
  anyone reviewing it. The workspace's conventional `catalog` directory counts as named when the
  configuration lists it or you pass it with `--catalog` — or lists, or you pass, the place it leads
  to, in any spelling, or a directory above that place, which then reads what lies there once, through
  the directory you named. Read only because it is there, it is the workspace's own content, so a
  `catalog` that is a link leading out of the workspace is not read until you name it or where it leads.
- **A path you type on the command line.** `aggrega build --release ../other/release.yaml`,
  `--catalog /srv/shared-catalog`, `--output-dir`, a file to validate, lint, pin or publish: each is
  used where it leads — the document edit apart, below. You own the machine the command runs on and
  can already read and write anything you would type, so holding you to a directory would buy nothing.
- **A path an assistant names over the process's own streams.** A client that launched `aggrega mcp`
  on your machine runs as you, and its host usually gives it file and shell tools of its own, so a
  path it names is honoured as if you had typed it — see [The two assistant transports](#the-two-assistant-transports).
- **The product's machine-wide stores** — the global configuration file, the compiled-module store and
  the plugin descriptor cache, and the registry credential store. They belong to the machine rather
  than to any workspace, so no workspace holds them.
- **A file picked in a dialog, read where it is.** An editor sends the key file or trust root of a
  registry registration as an absolute path, the description `aggrega/import` converts, and the module
  `aggrega/pluginGenCatalog` generates an entity for with the overlay beside it. A person chose each
  one, wherever they keep it. They are only read: nothing a request writes goes to a path chosen this
  way.
- **A document your editor holds open.** Validating it, asking for its diagnostics or dropping them,
  hovering, completing, resolving, and finding references and implementations in it are answered from
  the content the editor sent, so no file is read at the path that names it, and the path is never
  refused for where it leads. A request that does read the document from disk is the refused kind
  above.

The command line's typed paths and the machine-wide stores are never judged at all; the others are
let through by their class, never by the request that happens to carry them.

### An exception reaches the directory it names, and no further

**A directory you named outside the workspace is a root of its own** for everything read or written
beneath it. The directory itself is used as you named it — one that is a link is followed to where it
points — and a link beneath it leading out of it is held exactly as a link inside the workspace is: not
read in a listing, and halting a lookup or a write. So a catalog directory you list outside the
workspace, an output directory you pass to `aggrega plugin gen-catalog`, the directory you run a build
in when the workspace root you named lies elsewhere, and an `artifact_cache_dir` that climbs out of the
workspace each hold what is beneath them to themselves. Where a directory you named lies inside the
workspace, the workspace is the root.

**A Release or a Manifest you named outside the workspace is the same rule read for a file**: its own
directory is the root, so what it names by a path — and what every Release its `extends:` chain leads
to names — must stay inside that directory. A Release kept beside its Aggregate and Manifest builds
from anywhere; one in the usual `releases/` layout, naming `../aggregates/app.yaml`, is built from its
own workspace instead.

### A Release or a Manifest named through a link

**A Release you name through a link is read where the link leads, and resolved where you named it.**
Typed as `--release release.yaml` where `release.yaml` is a link to a file kept elsewhere — or named
that way under `workspace.releases`, or as `build.authoring_release` — the Release is read from the
place the link leads to. The Aggregate and the Manifest it names, by identity or by a path, are looked
for beside the link, in the directory you named it in, and held to that directory's root: the
workspace, or the directory itself where it lies outside the workspace. Its lockfile is read and
written beside the link too, never where the link leads. The Release is not one of the documents its
own lookup meets beside it, so it never stops that lookup; another Release kept beside it that is a
link leading out still does. A Manifest you inspect on its own through a link is read and resolved
the same way.

**The artifact cache is held by how its value is spelled.** Written inside the workspace root — the
default `.aggrega/cache` included — it is the workspace's own directory, so a cache directory that is a
link leading out is refused rather than followed. Written climbing out (`../shared-cache`), it is a
directory the configuration names, and a root of its own.

### The document edit stays inside

`aggrega edit-document`, the language server's document edit and insertion point, and the assistant's
`edit-document` and `insertion-point` act only on a document the workspace carries. A document outside
the workspace, as written or through a link leading out of it, is refused on every surface with nothing
read or written — including where a path you name is otherwise honoured.

## The two assistant transports

`aggrega mcp` serves the same tools two ways, and the boundary differs between them because the
caller does.

- **Over the process's own streams**, the client launched the server on your machine, so a call is
  you typing on the command line: a path argument may be absolute and may lie outside the workspace, a
  call may name its own `workspace_root` and `catalog_dirs`, and the tools that run an `aggrega`
  command in a separate process are offered. Only the path a call names is honoured as named. What the
  operation then reads and writes on its own account is held as it is at a terminal: a listing does not
  read through a link leading out, a reference a document writes does not leave the workspace, and a
  write does not go through a linked output or cache directory. Workspace content can steer what an
  assistant asks for, so on a host where these tools are its only reach into your files, a document in a
  workspace you cloned can still lead it to name a path outside the workspace and have it read or
  written; [what an assistant can do without asking you first](aggrega-mcp.md#what-an-assistant-can-do-without-asking-you-first)
  is where you set how much it does unprompted.
- **Over HTTP**, the caller does not own the machine the server runs on. The workspace is the one the
  server was started over and is fixed for its life; every path argument is held inside it, judged as
  above; a call naming `workspace_root` or `catalog_dirs`, or selecting a signing key held on the host,
  is refused; and the tools that run an `aggrega` command are not offered. A refusal names the argument
  and quotes a relative value as sent, but names neither the workspace root nor where a path would have
  led.

## When something is refused or halts

| What you see | What to do |
| --- | --- |
| A listing names a link among those it did not read | Replace the link with a copy of what it leads to; or, for entities kept elsewhere, list the directory the link leads to under `catalog_dirs`; for a Release kept elsewhere, name it under `workspace.releases` or as `build.authoring_release`. |
| `E0321`, a read through a link out of a catalog directory or a Release's directory | List the directory the link leads to as a catalog directory, or pass it with `--catalog`, rather than reaching it through a link beneath one; or replace the link with a copy. Where the link is the conventional `catalog` itself, list `catalog` or the directory it leads to, or pass either with `--catalog`. |
| `E0321` on a Release's lockfile | Remove the link and pull the Release again, which writes a fresh lockfile beside it. A lockfile has no other place. |
| `E0321` on a configuration file | Replace the link with a copy kept in the workspace. A configuration shared between workspaces is read by naming it as the global configuration file, with `--config` or `AGGREGA_CONFIG`, beneath each workspace's own files. |
| `E0320`, a write or removal through a link | Remove the link the message names, or make it lead somewhere inside the directory the message names, and run the operation again. Nothing in your entity files causes it. |
| `E0324`, a reference leading out | Name an Aggregate kept elsewhere by its `metadata.name` and list its catalog directory; keep a Manifest, a Release an `extends:` names and a parameters file inside the workspace — or, for a document you named from outside, in its own directory; or open the workspace at a directory holding both documents. |
| `E0304`, content through a link | Replace the link with a copy of what it leads to, inside the entity's own directory. |
| A language-server request refused for a path leading out | Send a path inside the workspace, relative to its root. A Release kept outside the workspace is reached by naming it in the configuration, under `workspace.releases` or as `build.authoring_release`, and naming in the request the link inside the workspace that leads to it — the place the Release listing offers it at. |
| An assistant call over HTTP refused for a path | Send a path relative to the root of the workspace the server serves; where the refusal offers the relative spelling of an absolute path, send that. |
| A document edit refused | Edit a document the workspace carries; a link to a document elsewhere is not edited through. |

## See also

- [Configuration](configuration.md) — where each of the settings above is written, and how a relative
  path in it is resolved.
- [`aggrega serve`](aggrega-serve.md) and [`aggrega mcp`](aggrega-mcp.md) — each request and tool, and
  which of its parameters name a path.
- [Fatal halts](../errors/fatal-halts.md) — the full entry for each condition above.
