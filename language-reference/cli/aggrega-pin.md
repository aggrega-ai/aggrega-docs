# aggrega pin

`aggrega pin <entity-path>` records, in the `entity.lock` beside a Recipe or FeatureRecipe, the content pin for every input the entity reads from outside its own document. It is the entity author's step: run it before the entity is consumed or published, and commit the lock it writes.

```
aggrega pin catalog/recipe/helm/server/1.0.0/recipe.yaml
```

## What it records

An entity can depend on bytes outside its own document, and the lock holds one pin for each:

- **A remote `source:` whose coordinates you wrote out in full** — no template in its `kind`, `url`, `chart`, `module_subdir`, `version` or `ref`. The step fetches it and records the version it resolved to — for a git source, the commit its `ref` named — and the content digest of what was fetched.
- **A file an `artifacts` entry imports with `$import`.** The step digests the file as it stands in your workspace.
- **Each file of a `source:` that names a directory or a file beside the entity.** Nothing is fetched: the step digests each file the source contributes to what a publication of the entity carries — every file under the directory it names that the entity's ignore rules keep, or the one file — and records it by its path beside the entity. A file next to the Recipe that the source does not contribute, such as a README, is not pinned. A source written as a template, such as `./charts/{{ .values.flavour }}`, names its directory only once a Release fills it in, so it contributes every file in the entity's directory the rules keep, and each of those is pinned. A build compares the source with these pins before its provider reads it, so a file added, changed or removed since the pin halts the build — [A local source no longer matches the pins recorded beside its Recipe](../errors/fatal-halts.md#a-local-source-no-longer-matches-the-pins-recorded-beside-its-recipe).
- **The ignore rules themselves, for a `source:` that is a directory.** The step records which plugin served the entity's capability and the exact rules it composed, as the next section describes.

What it does not record: a remote source whose coordinates are filled in from a template, which names an artifact only once a Release fills it in and is pinned in each Release's lockfile by [`aggrega pull`](aggrega-pull.md); and an inline `artifacts` entry or one taken from an ArtifactLibrary. The file itself is described field by field in the [entity lock schema](../schema/other/entity-lock.md).

**No Release is needed.** A source written out in full names the same artifact for every Release that will ever use the entity, so resolving it needs nothing a Release supplies. That is what lets an author pin an entity in a workspace that has no Release at all.

**The entity file is never written.** What the step derives goes beside the entity; what you typed is left exactly as you typed it. Re-running over unchanged inputs leaves the lock byte-identical, and an entity that stops reading anything a lock records has its lock removed. A Component, a Feature, or any other kind that reads no such input is reported as having nothing to pin, and nothing beside it is touched.

## Which files ship with an entity

A Recipe or FeatureRecipe whose `source:` names a directory beside it — a co-located chart, a module — carries that directory's files when it is published. Not every file in it belongs there: a version-control directory, a dependency cache, an editor's leftovers. **Which files belong is decided by ignore rules, in the syntax `.gitignore` uses, and you control them.** They come from two places:

- **The plugin that renders the entity's capability** declares what its own ecosystem never ships. The chart plugins leave out the version-control directories (`.git/`, `.hg/`, `.svn/`, `.bzr/`) and the hidden files under a chart's `templates/`, and they honour the chart's own `.helmignore`: wherever the walk of the source meets one, its lines are read as further rules for the directory holding it. The Terraform plugin leaves out the version-control directories and the `.terraform/` working directory — not the dependency lock file, which is meant to travel with the module — and honours `.terraformignore` the same way. A plugin that declares nothing leaves everything in.
- **Your own `.aggregaignore`**, one file beside the entity document, in the same syntax. Its lines apply after the plugin's and after every ignore file the plugin names, so you have the final say on any path you name: a line such as `.venv/` leaves out a directory the plugin knows nothing about, and a line such as `!.git/` brings back one the plugin left out. The file itself never travels; its rules do, inside the lock.

```
# catalog/recipe/helm/server/1.0.0/.aggregaignore
.venv/
*.bak
!notes.bak
```

**Each rule is read relative to the directory it belongs to.** A rule the plugin declares is read from the root of the source directory; a line of a `.helmignore` from the directory holding that file; a line of your `.aggregaignore` from the entity's own directory. A rule with no slash, or only a trailing one, matches a name at any depth; a trailing slash matches only a directory; a leading `!` brings back what an earlier rule left out. **A directory a rule leaves out is not entered**, so a file inside it comes back only once the directory itself does — `!.git/HEAD` alone does not bring the file back while `.git/` is left out, and `!.git/` does.

**The plugin whose rules are read is the one serving the capability in your workspace when you pin**: your workspace's provider binding for that capability, or else the plugin built into `aggrega`. The step records that plugin — its reference and the digest of its entity — and the exact rules it composed in the `entity.lock`. From then on, every reading of the directory applies the recorded rules and no others: a publication of the entity, the comparison a pull or a push holds the lock to, the entity's row in a lockfile, a build's comparison, the render that hands the directory to a provider, and `aggrega pull --verify`. So what you publish is exactly what your own build renders, and a changed binding, an edited `.aggregaignore` or a newer `aggrega` changes nothing until you pin again — at which point the lock's diff shows what moved. A file a plugin names as an ignore file, such as a `.helmignore`, is itself one of the source's files and is pinned like any other unless a rule leaves it out, so editing it without pinning again is caught by the next pull or build. A lock that records no rules keeps every file under the directory.

**A consumer renders the files your rules kept.** A plugin can render a Recipe published for its capability when it speaks the same ABI version, its contract matches its entity's claim, and it needs no file outside the published set. A plugin that needs a file the set left out must fail its build loudly and name the file; the host's part is to refuse any pack or read of a file the set does not carry, naming it. Where the plugin a consumer's workspace binds for the capability declares different rules from the ones your lock records, the consumer's `aggrega pull` says so in a warning naming both plugins and the difference, and carries on.

**A symbolic link among an entity's files is refused**, wherever it points and whether or not it resolves — see [A symbolic link sits among the files an entity carries](../errors/fatal-halts.md#a-symbolic-link-sits-among-the-files-an-entity-carries). A link your rules leave out is passed over like any other file they leave out. A path the entity names that passes through a directory which is a link leading out of the entity's directory is refused as well, before anything is pinned — see [A path names content outside the entity's own directory](../errors/fatal-halts.md#a-path-names-content-outside-the-entitys-own-directory).

## Where the lock goes

The lock is written beside the document you name, in the same directory, so the entity needs a writable home: a document in a directory of yours. An entity a pull resolved from the content cache has no such home and is never pinned by anything.

**One directory, one entity.** A directory holds one `entity.lock`, so the step refuses a Recipe or FeatureRecipe that shares its directory with any other entity, whether or not either of them has anything to pin, naming each entity in the way — the refusal is [An entity shares its directory with another entity](../errors/fatal-halts.md#an-entity-shares-its-directory-with-another-entity). Every kind has a directory of its own except Aggregate, Release and Manifest, which may sit side by side; a push holds the entity it publishes to the same rule, as [One entity per directory](aggrega-push.md#one-entity-per-directory) sets out. The step judges only what it writes a lock for, so a Component or any other kind it has nothing to pin for is reported as having nothing to pin, and the refusal reaches that entity when it is published. A file beside the entity that is not an entity document — a chart file, the imported file itself — is not in the way.

## Who pins, and when

**Pinning is an authoring duty.** An entity whose inputs are not pinned is not yet ready to be consumed, so by default a pull records no pin: over a Recipe or FeatureRecipe in one of your catalog directories that the Release builds, it compares what this step would record with what the lock holds, and halts when a pin is missing or no longer matches its input. The halt names the entity, each input and whether it is a remote source, an imported file or a file of a local source, and this command. It is [An entity reads an input the lock beside it records no pin for](../errors/fatal-halts.md#an-entity-reads-an-input-the-lock-beside-it-records-no-pin-for). **A push holds the entity it publishes to the same comparison** and refuses with the same halt, so an entity cannot reach a registry through `aggrega push` with a pin unrecorded — [Pinning before publishing](aggrega-push.md#pinning-before-publishing) sets that out. **A local source is held as one set of files:** a lock recording none of them stops a pull or a push, and so does a file added, changed or removed since the pin, like any other missing or stale pin.

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
this command, and so does a push of it; so does one whose local source has had a file added,
changed or removed since it was pinned.

No Release is needed. A source whose coordinates carry no template names one artifact for every
Release that uses the entity, so it is resolved and pinned here, with nothing supplied. A remote
source whose coordinates are filled in from a template is not pinned here: which artifact it names is
decided by each Release, and each identity it resolves to is pinned in that Release's lockfile.
A source that names a directory beside the entity is not fetched: each file it contributes to what
a publication of the entity carries is digested as it stands and pinned by its path, so a build
refuses a file added, changed or removed after the pin. A local source written as a template
contributes every file in the entity's directory, so each of those is pinned.

Which files a source directory contributes is decided here, once, and recorded. The step reads the
ignore rules the plugin serving the entity's capability declares — this workspace's provider binding
for that capability, or else the plugin built into aggrega — together with the ignore files that
plugin names inside the source, such as a chart's .helmignore, and the .aggregaignore beside the
entity, in gitignore syntax, whose lines come last and so have the final say. It records the plugin
and the composed rules in the entity.lock, and every publication, pull, build and render of the
entity applies the recorded rules and no others, so a changed binding or a newer binary moves
nothing until you pin again. A symbolic link among the files is refused rather than followed.

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
