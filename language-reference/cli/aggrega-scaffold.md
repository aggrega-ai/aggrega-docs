# aggrega scaffold

Draft a starter document for an entity kind, or write a runnable example into a new directory

<!-- BEGIN GENERATED: cli-scaffold -->
**Synopsis**

```
aggrega scaffold <kind> [name] | --example <name> [dir] | --example --list [flags]
```

**Description**

```
Draft a starter document for an entity kind from its schema, or write one of the documentation's runnable examples into a new directory.

Drafting a starter document

The kind is the lowercase-hyphenated schema token — for example component, aggregate, release, recipe, manifest, or feature. Run aggrega get-schema --list to print the whole set; a token no schema answers to is refused with that set in the message, so a typo is corrected without a second lookup.

The document is derived from that kind's own contract and from nothing else. It carries exactly the fields that kind's schema requires, with the fixed apiVersion and kind filled in and a placeholder everywhere a value is needed. It is not a worked example: there is no namespace, no category, no label set and no commented suggestion of what people usually write, because a catalog decides those for itself and a starter document that guessed at them would teach a requirement that does not exist.

The optional name seeds metadata.name for a kind whose schema requires one. Every other required value is left as a placeholder to fill in.

Nothing is written to disk. The document goes to standard output, so a redirect decides where it lands:

  aggrega scaffold component my-service > my-service.yaml

The same starter document is served to an assistant by the scaffold tool that aggrega mcp exposes, which returns these bytes alongside a machine-readable payload; this command is the terminal route to the same drafting.

Writing a runnable example

With --example, the argument is the name of one of the runnable examples the documentation publishes, and the command writes that example's files into a new directory — the second argument, or a directory named after the example in the current directory when there is none — then prints the commands the example's own page gives for building it:

  aggrega scaffold --example redis-cache

The directory must not exist yet, or must be empty; a directory holding anything is refused and left as it is. With --list, the command prints every example there is, each with its level and the first sentence of its page, and writes nothing:

  aggrega scaffold --example --list

The examples are read from the documentation bundle published for this version of aggrega on the default registry — or, where none is published for it, the newest one published for an earlier version. It is kept in the cache every project on this machine shares, so a second example needs no second download. It is fetched through the same network settings as every other registry read, and verified against this workspace's signature policy before it is kept or read; a bundle that does not verify is refused, never used. Offline, an example is written only from a copy already cached on this machine.

An example's files are written only as files and directories inside the directory named: a bundle carrying an entry that would land outside it, or a link, is refused whole and nothing is written.

The scaffold tool that aggrega mcp exposes, and the editor's language server that aggrega serve runs, write and list the examples on the same terms, with the directory named relative to the workspace root, and answer with the files written and these same commands.
```

**Flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--example` | `false` | write the runnable example the argument names into a new directory, read from the signed documentation bundle |
| `--list` | `false` | with --example, print every runnable example the documentation publishes, and write nothing |
<!-- END GENERATED: cli-scaffold -->

## What it does

The command has two forms. `aggrega scaffold <kind>` drafts a starter document from a kind's schema and prints it, which is what this section and the next three describe. `aggrega scaffold --example <name>` writes one of the documentation's runnable examples into a new directory instead — see [Starting from a runnable example](#starting-from-a-runnable-example).

`aggrega scaffold <kind>` prints a starter document for one entity kind to standard output. The document carries exactly the fields that kind's schema requires: `apiVersion` and `kind` are filled in, because the schema fixes them, and every other required value is left as a placeholder for you to replace.

The optional `[name]` seeds `metadata.name` for a kind whose schema requires one:

```bash
aggrega scaffold component my-service
```

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Component
metadata:
  name: my-service
  version: ""
  labels:
    component.aggrega.ai/type: ""
spec: {}
```

The kind is the lowercase-hyphenated schema token — `component`, `aggregate`, `release`, `recipe`, `manifest`, `feature`, and the rest. [`aggrega get-schema --list`](aggrega-get-schema.md) prints the whole set, and a token no schema answers to is refused with that set in the message, so a typo is corrected without a second lookup.

## What it hands back, and what it does not

**The document comes from the kind's own contract and from nothing else.** It is not a worked example. There is no namespace, no category, no label values filled in for you, and no commented suggestion of what people usually write — because none of those is something the compiler requires. A catalog chooses its own naming, its own categories and its own directory layout; the schema decides the fields, and the schema is all this command reads. A starter document that guessed at the rest would teach you a rule that does not exist.

**Drafting writes no file.** The document goes to standard output, so a redirect decides where it lands and nothing on disk is replaced without you asking for it:

```bash
aggrega scaffold component my-service > my-service.yaml
```

**It is not a finished entity, and that is what a placeholder means.** An empty required value is not a value, so running [`aggrega validate`](aggrega-validate.md) over the document exactly as it came out refuses it and names every placeholder still owed at once, each with what it takes — above, the version and the component type:

```
Entity: my-service.yaml
Kind:   Component
[E0215]
  document envelope validation failed: 2 placeholders still owed in my-service.yaml; an empty required value is not a value, so each of these needs one before the document validates:
    5:3: metadata.version takes a semantic version, such as 1.0.0
    7:5: metadata.labels.component.aggrega.ai/type takes one of: server, worker, task, function, stateful-server, resource
```

What each value takes is read from the kind's own schema: the values it accepts where the schema lists them, a semantic version where it asks for one, and otherwise the schema's own description of the field. Supply those values and the same command accepts the document. Nothing about its shape has to change, because the shape came from the schema.

**A value is owed even where the schema would take it empty.** A drafted Recipe or FeatureRecipe carries an empty `capability` and `implements`. Their schema admits an empty string, but an empty one names no provider and no type, so `aggrega validate` names both as still owed until you fill them in. That reading belongs to validating one entity file: a whole-catalog run, `aggrega validate --release` and [`aggrega build`](aggrega-build.md) do not apply it. See [placeholders still owed](aggrega-validate.md#placeholders-still-owed) for what it covers. A drafted Recipe also declares none of the input kinds its schema asks for at least one of — `source`, `valuesMapping`, `workload` or `artifacts` — because which one fits is yours to choose, so `aggrega validate` refuses its `spec` until you add one.

## The same document from an assistant or an editor

The starter document is the same bytes whichever surface asks for it. An AI assistant connected through [`aggrega mcp`](aggrega-mcp.md) reaches it as the `scaffold` tool, which returns the document as text alongside a machine-readable payload. An editor driving [`aggrega serve`](aggrega-serve.md) reaches it at `aggrega/scaffoldEntity`. The document is derived from the schema once, so the one you draft at a terminal and the one an assistant drafts for you are byte for byte identical.

Writing and listing runnable examples is on the same surfaces, with the command's own words as the field names. Send the `scaffold` tool, or `aggrega/scaffoldEntity`, `example` instead of `kind` to write one, `dir` to name the new directory relative to the workspace root — a directory named after the example there when you send none — and `list: true` alone to be answered with every example. The example is read from the same bundle, verified against the same policy, and written by the same extraction, so the files and the commands next are the same as at a terminal, and so are the refusals: a directory that holds anything, an entry leading out of the directory or a link, a bundle your policy does not accept, an offline workspace with nothing cached. The answer is structured: for a list, `examples`, each with its `name`, `level` and `summary`; for a write, `example`, `dir`, `files` — the files written, relative to `dir` — `next`, the commands the example's page gives, and `version`, the documentation version the example was read from. The `scaffold` tool's text is the account this command prints. Fields of two forms sent together — `kind` with `example`, say — are refused in the same words on both, before anything is read. An editor names the workspace in the request's `workspaceRoot` for the example form, and `dir` must be a relative path that stays inside it and does not lead out of it through a link; over HTTP the tool holds `dir` to the workspace it serves too, and over standard input and output it takes `dir` as named, as it takes every path. The capability index reports the `scaffold` tool as writing, because of that form, and `cli-scaffold`, which runs this command in a separate process, as writing too.

## Starting from a runnable example

The documentation carries runnable examples — each a directory holding an Aggregate, its Releases and whatever else it builds from, with a page saying how to build it. `--example` writes one of them into a new directory, so you can start from a working project rather than from a blank one:

```bash
aggrega scaffold --example redis-cache
```

```
Wrote the example redis-cache into redis-cache (12 files).

Next:

  cd redis-cache
  # Local development (Docker Compose), no authentication
  aggrega build --release release-compose.yaml --auto-pull
  ...

Its page, redis-cache/README.md, explains what it shows.
```

**What it writes, and where.** The example's files, as the documentation carries them, into the directory you name as the second argument — or, when you name none, a directory called after the example in the folder you run the command in. The directory must not exist yet, or must be empty. Anything else is refused and left exactly as it was: a directory that holds a file, a file standing at that path, or a link. Directories above it that do not exist yet are created. No file of the example is left anywhere else, and none is put in place before all of them are written: they are written aside first and moved in once every one of them is there.

**The commands it prints next** are the ones the example's own page gives: the first `sh`, `bash` or `shell` block under the page's `## Build` heading, as the page writes it, comments included, after a `cd` into the directory. An example whose page has no such block is answered with the path of its page instead.

**Which examples there are.** `--list` prints every example, once each, in the order the documentation teaches them — its name, the level its page declares, and the first sentence of its page — and writes nothing:

```bash
aggrega scaffold --example --list
```

```
EXAMPLE                LEVEL         DESCRIPTION
...
redis-cache            start         This lean example compiles a single **Redis** in-memory cache (Redis wire protocol) from one Developer-authored `Aggregate` to two realizations.
...
```

The list is the documentation's own list of examples, the one published beside them as [Examples by product and capability](../examples/by-product-and-capability.md). A name the bundle carries no example under is refused, pointing you at `--list`, and nothing is written.

**Where the examples come from.** They are read from the documentation bundle — the signed archive of the published documentation that [`aggrega explain`](aggrega-explain.md) reads its walk-throughs from — published on your workspace's default registry. The bundle read is the one published for the version of `aggrega` you are running. Where none is published for that version, it is the newest one published for an earlier release, and the command says so on standard error:

```
note: no documentation is published for 0.9.1; the examples are read from the documentation published for 0.9.0, the newest before it
```

A build of `aggrega` made from some commits after a release — one whose `aggrega version` reads like `0.9.0-12-g1a2b3c4d` — reads the documentation of the release it was built after, `0.9.0` here, or an earlier one where that is not published. A build stamped with no release number reads the documentation of its own version or none. [`aggrega explain`](aggrega-explain.md) chooses the bundle it reads its walk-throughs from the same way.

Where none is published for your version and the newest earlier one is in a format this version of `aggrega` no longer reads — a release candidate run before its own documentation is published, say — the command refuses, saying both in one sentence, and nothing is written:

```
[E0137]
  hub.aggrega.ai/docs/aggrega-docs publishes no documentation bundle for 0.9.1-rc.1, and the newest earlier one, 0.8.11, is in a format this version of aggrega no longer reads, so the examples cannot be read
```

**It is verified before it is used.** The bundle is fetched through the same network settings as every other registry read, and its signature is checked against your workspace's signature policy for that registry before it is kept — and again before a copy already on the machine is read, so a copy another project's looser policy let in is not used under yours. A bundle your policy does not accept is refused, and nothing is written.

**It is fetched once per machine.** The bundle is kept in the cache every Aggrega project on the machine shares — see [`aggrega cache`](aggrega-cache.md) — so a second example, or a second project, needs no second download, and `aggrega explain` reads the same copy where both read the same version.

**Offline, it reads only what is cached.** In an offline workspace nothing is fetched: an example is written from a copy already on the machine that your policy admits — the one for this version, or else the newest earlier one cached — and with none, the command refuses with the offline refusal every network read gives, naming how to allow the network.

**A bundle carrying something unexpected is refused whole.** The bundle comes from a registry, so the extraction trusts nothing about its layout: an entry whose name would land outside the directory you named, or outside the bundle, and an entry that is a link or anything other than a file or a directory, each refuse the whole example, naming the entry, and nothing is written. An executable file in the example stays executable.

**The workspace's configuration is read.** The default registry and the signature policy come from it, so a configuration file that is a link leading out of the workspace stops the example form as it stops every other command that reads the configuration — see [the workspace boundary](workspace-boundary.md).

## Examples

Draft an unnamed Release and read it on the terminal:

```bash
aggrega scaffold release
```

Draft a Recipe straight into a file:

```bash
aggrega scaffold recipe postgres-helm > postgres-helm.yaml
```

Check what you still owe before filling anything in:

```bash
aggrega scaffold component my-service > my-service.yaml
aggrega validate my-service.yaml
```

See which runnable examples there are, then write one into a directory of your choosing:

```bash
aggrega scaffold --example --list
aggrega scaffold --example redis-cache my-cache
```

For the authoring loop this command starts — draft the shape, fill the placeholders, validate — see [Authoring Aggrega files](../../authoring/getting-started.md).
