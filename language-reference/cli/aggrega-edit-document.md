# aggrega edit-document

Apply one bounded structured edit to a document, preserving every byte it does not touch

<!-- BEGIN GENERATED: cli-edit-document -->
**Synopsis**

```
aggrega edit-document <edit> <file> [flags]
```

**Description**

```
Apply one bounded structured edit to a document in the workspace.

The edit is named first and the document second. One call adds one entry under one container, or sets one scalar, and it can do nothing else:

  add-component   add a component instance under a components container
  attach-feature  attach a Feature to the node you name
  wire-edge       wire a connection inside one of that node's sockets
  set-value       set one value on that node

There is no edit that deletes, replaces a block you already wrote, reorders anything, or writes bytes you supply verbatim. The edits this command applies are add-component, attach-feature, wire-edge, set-value, and a name outside that set is refused rather than interpreted.

Name the node with --node, once per path segment, from the document root. It is a segment at a time rather than one dotted string because a dot is a legal character in a name you type, so a joined path could address a key nobody wrote and the entry would be created there rather than refused:

  aggrega edit-document add-component app.yaml \
    --node spec --node components --name web --value example/service

  aggrega edit-document wire-edge app.yaml \
    --node spec --node components --node web \
    --socket database --name db --value spec.components.store

For add-component the path names the components container itself, because the entry being added is the node. For the other three it names the node the edit is about, and the container follows from the edit.

--name is the key the entry is written under: the instance name, the attachment's name, the connection's alias, or the value's key. --value is what that entry carries, and what it means follows from the edit — the entity the entry requests, the node a connection points at, or the scalar a value is set to. It is read as a YAML scalar, so --value 3 sets a number, --value true a boolean, and --value '"3"' the string; omitting it sets nothing at all.

Every byte the edit does not touch survives. The document is parsed only to locate the container and the line its block ends at, so comments, blank lines, quoting style, folded and literal scalars and the trailing-newline shape all carry through, and the nesting step is measured from the document's own indentation rather than imposed. The same request against the same document produces the same bytes.

The result has to be a document you could have typed, and that is what the write is gated on: the composed document is checked against its own kind's schema and reaches disk only if that passes. A request that would produce something the schema refuses is refused, naming the property the schema would not admit and where, and the file is left byte-for-byte as it was — so a refused edit is indistinguishable from one never attempted and you can retry a corrected request against the document you started with.

An entry that is already there, carrying what you asked for, is a no-op. An entry of that name carrying something else is refused rather than replaced.

--dry-run does everything the plain command does except write: the edited document goes to standard output as content, naming the file it is for, and nothing is created — for a caller that puts the result in front of someone before it is saved. Every other behaviour is the write's, the schema gate included, so a request the write would refuse is refused under --dry-run too and its exit code predicts the write's. Without it the document is written.

Whether what you wire is semantically admissible is not decided here. Whether a socket is one the producer declares, or whether a Feature's applicability is satisfied, is what aggrega validate answers.
```

**Flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--dry-run` | `false` | Do everything except write: hand back the edited document as content, naming the file it is for, and create or modify nothing. Every other behaviour is the write's, the schema gate included. Without it the document is written |
| `--name` | — | The key the new entry is written under: the component instance name, the attachment's name, the connection's alias, or the value's key |
| `--node` | `[]` | One segment of the structural path to the node the edit is about, from the document root. Repeat it once per segment, outermost first. It takes a segment at a time rather than one dotted path because a dot is a legal character in a name you type, so a joined path could address a key nobody wrote |
| `--socket` | — | The dependency socket a connection is wired inside. Read for wire-edge and ignored otherwise |
| `--value` | — | What the entry carries, read as a YAML scalar. Its meaning follows from the edit: the entity the entry requests, the node a connection points at, or the scalar a value is set to |
<!-- END GENERATED: cli-edit-document -->

## What it does

`aggrega edit-document <edit> <file>` applies one structured edit to a document in your workspace and leaves every byte it did not touch exactly as you wrote it. The edit is named first and the document second:

```bash
aggrega edit-document add-component storefront.aggregate.yaml \
  --node spec --node components \
  --name checkout --value core/api-server:1.0.0
```

It exists for the case where you would rather the file be edited than be told where to edit it. If you hold your own buffer and your own undo history, [`aggrega serve`](aggrega-serve.md) reports a position and lets you place the text yourself; this composes the entry and writes it.

**The document is one your workspace carries.** Name it relative to the workspace root or by its absolute path; one outside the workspace is refused with nothing read or written, whether it is written that way or reached through a link leading out of the workspace — a link to the file, or a directory on the way that is a link. An edit reads the document before it writes it back, so a document behind such a link is a file the workspace does not hold, and the refusal says so:

```
the document named leads outside the workspace through a link, and an edit is only applied to a document the workspace carries: "shared/storefront.aggregate.yaml"
```

To edit a document kept elsewhere, run the command in the workspace that holds it. The language server's and the assistant tools' edits apply the same rule, because all three apply one edit. Its document is the one path you type that is held to the workspace, as [The workspace boundary](workspace-boundary.md#the-document-edit-stays-inside) sets out.

## One call, one entry, and the set is closed

There are four edits and no others:

| Edit | What it adds |
| --- | --- |
| `add-component` | a component instance under a components container |
| `attach-feature` | a Feature attachment on the node you name |
| `wire-edge` | a connection inside one of that node's dependency sockets |
| `set-value` | one value on the node you name |

**There is no edit that deletes, replaces a block you already wrote, reorders anything, or writes bytes you supply verbatim.** That is the whole design rather than a restriction on it: a name outside the four has no path through the command at all, so this is not a file writer wearing a narrower name. A name outside the set is refused rather than interpreted.

**An entry that is already there, carrying what you asked for, is a no-op** — the command says so and writes nothing:

```
storefront.aggregate.yaml already carries that entry; nothing was written
```

An entry of that name carrying something else is refused rather than replaced, because replacing what you wrote is not one of the four.

## You name the node as a path, one segment at a time

`--node` is repeated once per segment of the path from the document root, outermost first:

```bash
aggrega edit-document wire-edge storefront.aggregate.yaml \
  --node spec --node components --node web \
  --socket database --name replica --value store
```

**It takes a segment at a time rather than one dotted path on purpose, and the reason is a correctness one.** A dot is a legal character in a name you type, so nothing outside the document can tell a structural dot from one inside a name. A joined path would read correctly and address a key nobody wrote — and because `add-component` may create a container the document does not carry, the entry would land under that invented key rather than being refused. Segments remove the ambiguity instead of moving it.

For `add-component` the path names the components container itself, because the entry being added *is* the node. For the other three it names the node the edit is about, and the container follows from the edit: an attachment goes under that node's `features`, a connection under its `uses` and the socket you named, a value under its `values`.

`--name` is the key the entry is written under — the instance name, the attachment's name, the connection's alias, or the value's key. `--socket` is read for `wire-edge` and ignored otherwise.

## A value keeps the type its characters carry

`--value` is read as a YAML scalar, which is the same way the characters would be read had you typed them into the document:

```bash
aggrega edit-document set-value storefront.aggregate.yaml \
  --node spec --node components --node web --name workers --value 4
```

```yaml
      values:
        replicas: 3
        workers: 4
```

So `--value 4` sets a number, `--value true` a boolean, and `--value '"4"'` the string `4` — quoting says "this is text" here exactly as it does in the document. Omitting `--value` sets nothing at all. A mapping or a sequence is refused, because writing one would be adding a block, and that is not one of the four edits.

## Everything you did not edit survives, and the same request produces the same bytes

The document is parsed only to locate the container and the line its block ends at; the entry is rendered and spliced at the line level. Comments, blank lines, quoting style, folded and literal scalars, template expressions and the trailing-newline shape all carry through unchanged, and the nesting step is measured from the document's own indentation rather than imposed — so an entry lands in the style you are already writing in.

Given the same document and the same request, the bytes are the same every time. So you can compare two runs, and a review reads one edit as one diff.

## The result has to be a document you could have typed

**That is what the write is gated on.** The composed document is checked against its own kind's schema, read off the document rather than supplied by you, and the bytes reach disk only if that passes. A request that would produce something the schema refuses is refused, naming the property the schema would not admit and where:

```
the edit was refused because the resulting document would not be valid, and nothing
was written: document envelope validation failed (Release, at prod.release.yaml);
15:7: spec.components.web.values: … unexpected property: "values"
```

**The file is left byte-for-byte as it was**, and the write itself is atomic, so a refused or interrupted edit is indistinguishable from one never attempted and you can retry a corrected request against the document you started with. It is also why no authoring rule is restated here: asking a Release document to carry a developer value is refused by the same schema that would refuse the hand-typed document.

**What is *semantically* admissible is not decided here.** Whether a dependency socket is one the producer declares, or whether a Feature's applicability is satisfied, belongs to the resolution a build performs. So you may name a connection this command has never heard of, and an Aggregate may author a socket its catalog entity does not pre-declare; what may be *consumed* across a socket stays the producer's to declare. Run [`aggrega validate`](aggrega-validate.md) naming a Release when that is the question.

## Seeing the result before it is saved

`--dry-run` does everything the plain command does except write: the edited document goes to standard output as content, naming the file it is for, and nothing is created:

```bash
aggrega edit-document attach-feature storefront.aggregate.yaml \
  --node spec --node components --node web \
  --name tls --value core/tls:1.0.0 --dry-run
```

```yaml
documents:
  - path: storefront.aggregate.yaml
    content: |
      # The storefront application.
      ...
```

**Without it the document is written.** The default is the write, because the product of this command is an edited document and a command that produces one owes it — a request that says nothing about delivery edits the file.

**Every other behaviour is the write's**, the validation gate included. An edit whose result the schema would refuse is refused under `--dry-run` too, naming the same property and leaving the file exactly as it was — so the exit code you get from a dry run is the exit code the write would have given you.

## The same edit from an editor or an assistant

The bytes are the same whichever surface applies the edit. An editor driving [`aggrega serve`](aggrega-serve.md) reaches it at `aggrega/editDocument`, and an AI assistant connected through [`aggrega mcp`](aggrega-mcp.md) reaches it as the tool this command is exposed under there. The entry is composed, spliced and gated on validation in one place, and each surface is a thin entry point onto it — so the document you edit at a terminal and the document an editor edits for you are byte for byte identical.

The one place the surfaces differ is which bytes they read. This command and the session method both read the file on disk, never an unsaved buffer: writing from a buffer would put content you had not saved onto the page under the guise of applying one entry. Save first, then edit.

## Examples

Add a component instance at the top level of an Aggregate:

```bash
aggrega edit-document add-component storefront.aggregate.yaml \
  --node spec --node components --name checkout --value core/api-server:1.0.0
```

Attach a Feature to a component authored inside a subsystem:

```bash
aggrega edit-document attach-feature storefront.aggregate.yaml \
  --node spec --node subsystems --node billing --node components --node ledger \
  --name audit-log --value core/observability/audit-log:1.0.0
```

Set a value on a component authored inside a subsystem:

```bash
aggrega edit-document set-value storefront.aggregate.yaml \
  --node spec --node subsystems --node billing --node components --node ledger \
  --name replicas --value 5
```

Review the result before anything is written:

```bash
aggrega edit-document wire-edge storefront.aggregate.yaml \
  --node spec --node components --node web \
  --socket cache --name sessions --value redis --dry-run
```

To find out which container an entry belongs in before you name one, and to read a position without applying anything, see [`aggrega serve`](aggrega-serve.md).
