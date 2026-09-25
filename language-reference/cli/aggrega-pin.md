# aggrega pin

`aggrega pin <entity-path>` records, in the `entity.lock` beside a Recipe or FeatureRecipe, the content pin for every input the entity reads from outside its own document. It is the entity author's step: run it before the entity is consumed or published, and commit the lock it writes.

```
aggrega pin catalog/recipe/helm/server/1.0.0/recipe.yaml
```

## What it records

An entity can depend on bytes outside its own document, and the lock holds one pin for each:

- **A remote `source:` whose coordinates you wrote out in full** — no template in its `kind`, `url`, `chart`, `module_subdir`, `version` or `ref`. The step fetches it and records the version it resolved to — for a git source, the commit its `ref` named — and the content digest of what was fetched.
- **A file an `artifacts` entry imports with `$import`.** The step digests the file as it stands in your workspace.
- **Each file of a `source:` that names a directory or a file beside the entity.** Nothing is fetched: the step digests each file the source contributes to what a publication of the entity carries — every file under the directory it names, or the one file — and records it by its path beside the entity. A file next to the Recipe that the source does not contribute, such as a README, is not pinned. A source written as a template, such as `./charts/{{ .values.flavour }}`, names its directory only once a Release fills it in, so it contributes every file in the entity's directory, and each of those is pinned. A build compares the source with these pins before its provider reads it, so a file added, changed or removed since the pin halts the build — [A local source no longer matches the pins recorded beside its Recipe](../errors/fatal-halts.md#a-local-source-no-longer-matches-the-pins-recorded-beside-its-recipe).

What it does not record: a remote source whose coordinates are filled in from a template, which names an artifact only once a Release fills it in and is pinned in each Release's lockfile by [`aggrega pull`](aggrega-pull.md); and an inline `artifacts` entry or one taken from an ArtifactLibrary. The file itself is described field by field in the [entity lock schema](../schema/other/entity-lock.md).

**No Release is needed.** A source written out in full names the same artifact for every Release that will ever use the entity, so resolving it needs nothing a Release supplies. That is what lets an author pin an entity in a workspace that has no Release at all.

**The entity file is never written.** What the step derives goes beside the entity; what you typed is left exactly as you typed it. Re-running over unchanged inputs leaves the lock byte-identical, and an entity that stops reading anything a lock records has its lock removed. A Component, a Feature, or any other kind that reads no such input is reported as having nothing to pin, and nothing beside it is touched.

## Where the lock goes

The lock is written beside the document you name, in the same directory, so the entity needs a writable home: a document in a directory of yours. An entity a pull resolved from the content cache has no such home and is never pinned by anything.

**One directory, one entity.** A directory holds one `entity.lock`, so the step refuses a Recipe or FeatureRecipe that shares its directory with any other entity, whether or not either of them has anything to pin, naming each entity in the way — the refusal is [An entity shares its directory with another entity](../errors/fatal-halts.md#an-entity-shares-its-directory-with-another-entity). Every kind has a directory of its own except Aggregate, Release and Manifest, which may sit side by side; a push holds the entity it publishes to the same rule, as [One entity per directory](aggrega-push.md#one-entity-per-directory) sets out. The step judges only what it writes a lock for, so a Component or any other kind it has nothing to pin for is reported as having nothing to pin, and the refusal reaches that entity when it is published. A file beside the entity that is not an entity document — a chart file, the imported file itself — is not in the way.

## Who pins, and when

**Pinning is an authoring duty.** An entity whose inputs are not pinned is not yet ready to be consumed, so by default a pull records no pin: over a Recipe or FeatureRecipe in one of your catalog directories that the Release builds, it compares what this step would record with what the lock holds, and halts when a pin is missing or no longer matches its input. The halt names the entity, each input and whether it is a remote source, an imported file or a file of a local source, and this command. It is [An entity reads an input the lock beside it records no pin for](../errors/fatal-halts.md#an-entity-reads-an-input-the-lock-beside-it-records-no-pin-for). **A push holds the entity it publishes to the same comparison** and refuses with the same halt, so an entity cannot reach a registry through `aggrega push` with a remote source's or an imported file's pin unrecorded — [Pinning before publishing](aggrega-push.md#pinning-before-publishing) sets that out. **A local source is held only once it is pinned:** where the lock records its files, a file that moved stops a pull or a push like any other stale pin, and where the lock records none, neither stops on the source.

**A halt on a first pull is the publisher's to fix, never the consumer's.** Where you consume a catalog someone else authors — a checkout of it in a directory of your own, say — and an entity there is unpinned, the author never ran this step. Your remedy is not to edit their directory by hand: set the workspace key below, so your pulls record the pins themselves.

**Two commands run this same step on your behalf, and write the same bytes:**

- `aggrega pull --pin-sources` runs it over the entities the Release builds, instead of halting.
- `aggrega push --pin-sources` runs it on the entity before bundling it, so the lock it writes is part of what is published, instead of refusing.

**Each has a workspace key that makes pinning its default**, `pin_sources_at_pull` and `pin_sources_at_push`, both off by default and each governing only its own command. The flag overrides its key in both directions: `--pin-sources` pins for one run whatever the key says, and `--pin-sources=false` does not. So a workspace configured to pin can still get the halt back for one pull. A build that fills its own lockfile is a pull, so it follows `pin_sources_at_pull`. The keys are described in [the configuration reference](configuration.md).

## Changing a published entity

**Best practice: an edit to an entity you have already published belongs in a new version, and then a pin — never a re-pin of the version that is already out.** Copy the entity into a new version directory, make the change there, and run `aggrega pin` on the new version. The published version keeps describing exactly the bytes it was published with, and a consumer moving to the new one moves on purpose.

The product enforces one half of this: publishing changed content at a version that is already published is refused, so a published version cannot be quietly replaced. It does not enforce the other half in your own workspace. Re-pinning an existing version after an edit is sometimes exactly right — an entity you consume inside one application and have not published, for instance — so nothing stops you, and the discipline is yours to keep.

## The same step on the other surfaces

The daemon carries this step as `aggrega/pin` ([`aggrega serve`](aggrega-serve.md)), and the tool protocol as the `pin` tool ([`aggrega mcp`](aggrega-mcp.md)); both write the same bytes this command writes. Over an HTTP listener, the tool writes inside the workspace and reaches the hosts an entity's sources name, so a caller needs the workspace-write scope to call it — the same grant a pull needs.

## See also

- [aggrega-pull.md](aggrega-pull.md) — the entity lock, what a build compares against it, and the halt.
- [aggrega-push.md](aggrega-push.md) — publishing an entity, and publishing a version once.
- [configuration.md](configuration.md) — `pin_sources_at_pull` and `pin_sources_at_push`.

<!-- BEGIN GENERATED: cli-pin -->
**Synopsis**

```
aggrega pin <entity-path> [flags]
```

**Description**

```
Record, in the entity.lock beside a Recipe or FeatureRecipe, the content pin for every input
the entity reads from outside its own document: a remote source: whose coordinates you wrote out
in full, a file an artifacts entry imports with $import, and each file of a local source:.

Pinning is the entity author's step. Run it on an entity before it is consumed — before you
publish it, and after every change to one of its inputs — and commit the entity.lock it writes
beside the entity. A pull over an entity whose lock does not record these pins halts and names
this command, and so does a push of it. A lock that records no pin for a local source is the one
exception and is not refused; once it records them, the source is held to them.

No Release is needed. A source whose coordinates carry no template names one artifact for every
Release that uses the entity, so it is resolved and pinned here, with nothing supplied. A remote
source whose coordinates are filled in from a template is not pinned here: which artifact it names is
decided by each Release, and each identity it resolves to is pinned in that Release's lockfile.
A source that names a directory beside the entity is not fetched: each file it contributes to what
a publication of the entity carries is digested as it stands and pinned by its path, so a build
refuses a file added, changed or removed after the pin. A local source written as a template
contributes every file in the entity's directory, so each of those is pinned.

The step writes beside the entity, so the entity needs a writable home: the document you name is
read from its own directory and the lock lands next to it. The entity file itself is never
written to. Re-running over unchanged inputs leaves the lock byte-identical; an entity that reads
nothing a lock records has its lock removed. A Component, a Feature or any other kind that reads
no such input is reported as having nothing to pin, and nothing beside it is touched.

A directory holds one entity.lock, so the step refuses a Recipe or FeatureRecipe that shares its
directory with any other entity, naming the entity in the way, whether or not either has anything
to pin. Every kind has a directory of its own except Aggregate, Release and Manifest, which may sit
side by side; a push holds the entity it publishes to the same rule.

aggrega pull --pin-sources and aggrega push --pin-sources run this same step on your behalf, and
write the same bytes.
```

**Flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--dry-run` | `false` | Resolve the entity's inputs and print the entity.lock the step would write instead of writing it: its path and the content it would hold go to stdout, and nothing on disk moves. A lock the step would leave byte-identical is not printed. The resolution runs exactly as it would otherwise, so the content cache still fills |
<!-- END GENERATED: cli-pin -->
