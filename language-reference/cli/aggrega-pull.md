# aggrega pull

`aggrega pull` resolves all of a Release's dependencies and writes a **lockfile** that pins every dependency to an exact version and content digest. A subsequent `aggrega build` uses what the lockfile pins, verifies it, and halts naming anything it needs that is not pinned there — so builds are reproducible and offline-capable.

**Everything a build consumes is pinned at this one moment.** The catalog entities, the source artifacts a Recipe points a provider at, and the remote documents a provider asks for while it renders are resolved by the same command and recorded in the same lockfile write. `aggrega pull` is the step that touches the network; build does not. That is the whole of the rule, and the rest of this page is what follows from it.

## What it does

`aggrega pull` resolves three kinds of dependency in one pass:

- **Catalog entities** — the Components, Features, Recipes, FeatureRecipes, schema and mapping libraries, and Wasm plugins the Release references, resolved transitively (through `extends:`, `implements:`, `aggregate:`, Feature attachments, and library `$import:` / `$ref:` sites) and fetched from the registry when not already local.
- **Source artifacts** — the remote `source:` that an individual Recipe or FeatureRecipe points a provider at: a Helm chart (OCI or classic HTTPS) or a Compose fragment over HTTPS. Each is fetched, cached, and pinned.
- **External inputs** — the remote documents a provider asks the host for while it renders, such as a `$ref` in a chart's `values.schema.json` that points at a URL. Each is fetched, stored under its content digest, and pinned.

Two of the three are read out of the documents you authored. The third is not: external inputs are found by rendering the Release, which is why this command renders one. Running the command needs none of that — [How the resolution finds external inputs](#how-the-resolution-finds-external-inputs) carries it in full, along with what the render costs, what happens when it cannot complete, and how a build that fills its own lockfile relates to it.

It writes the result to `<release-stem>.lock` next to the Release. A workspace that attaches a plugin returning an accept-or-reject verdict also gets a second file in that directory — the [plugin trust record](#the-plugin-trust-record).

**A pull asked to pin writes one more kind of file.** Beside each Recipe and FeatureRecipe in your catalog directories that imports an artifact file, or points at a remote `source:` you wrote out in full, sits an `entity.lock` recording what that content digested to. Recording it is the entity author's step, [`aggrega pin`](aggrega-pin.md), and by default a pull does not do it: it holds each such entity's lock to what the step would record, and halts where a pin is missing. `aggrega pull --pin-sources`, or a workspace that sets `pin_sources_at_pull: true`, runs the step instead — and then a pull's effect reaches further than the directory the Release sits in, though the entity files you authored are never written to. [The entity lock](#the-entity-lock) describes that file, and [Previewing what a pull would write](#previewing-what-a-pull-would-write) shows the whole set for your workspace before anything moves.

## The lockfile

The lockfile pins each dependency to its URI, resolved version, and content digest. It has sections for catalog entities, schema and mapping libraries (each carrying back-pointers to the Components and Features that consume it), Wasm plugins, source artifacts, external inputs (each keyed by URL and carrying the plugins that asked for it), and the Release files themselves. The file is written in a canonical, deterministic form.

**The Release is recorded by its content, not only by its name.** Everything the Release asks for — which chart version a source resolves to, which components land in which boundary — is resolved from what the file holds, so `release_documents` records the digest of the Release and of each Release it extends, alongside `release`, which names it. Edit the Release after pulling and the next build halts before anything renders, naming the file you edited and telling you to pull again; a plain `aggrega pull --release <release>` records the edit while honouring every other pin. The digest covers the file's bytes as they are, so a comment or whitespace change counts too, exactly as it does for the Aggregate and the Manifest. A file the Release imports through `parameters` is not recorded this way.

Commit `<release-stem>.lock` alongside the Release, the way you commit any pinned-dependency manifest. A lockfile diff shows reviewers exactly which dependency versions and digests changed; a library digest change names the consumers it affects.

What a given pull *did* — whether each entity was fetched fresh from a registry (`fetched-fresh`), reused a cache slot (`cache-reuse`), found in a local catalog (`local`), served from the copy inside the compiler binary (`in-binary`), or was external (`external`) — is a transient pull-event diagnostic printed to stdout by `--detail`, and it is never written to the lockfile. Which source served an entity depends on the pulling machine's local state, so persisting it would break the lockfile's byte-identity across machines. It reports what *this pull* did, which is unrecoverable afterward (a freshly-pulled entity is cached by the next run); for the post-pull resolution *state* of a Release's dependencies, use `aggrega inspect`.

## The entity lock

A Recipe or FeatureRecipe can depend on bytes it does not carry itself: a chart or fragment fetched from a remote `source:`, or a file an `artifacts` entry brings in with `$import`. What each of those digested to is recorded in a file named `entity.lock`, in the same directory as the entity file. The entity file you wrote is never written to; what was derived lives beside it. The [entity lock schema](../schema/other/entity-lock.md) describes the file field by field.

**Who writes it.** One step writes it: [`aggrega pin`](aggrega-pin.md), which the entity's author runs, needs no Release, and records every class of pin the lock holds. `aggrega pull --pin-sources` and `aggrega push --pin-sources` run that same step on the author's behalf and write the same bytes. A pull that was not asked to pin writes no lock at all: over each Recipe and FeatureRecipe the Release builds from your catalog directories, it compares what the step would record with what the lock holds, and halts where a pin is missing or no longer matches its input, naming the entity, each input and its class, and `aggrega pin`. The workspace key `pin_sources_at_pull` makes pinning every pull's default, and `--pin-sources=false` restores the halt for one run. Pinning is an authoring duty, so a halt on a consumer's first pull means the entity's publisher never pinned it; the consumer's remedy is that key rather than a hand edit of someone else's directory. [`aggrega pin`](aggrega-pin.md#who-pins-and-when) sets this out in full.

**What it holds.** Two lists, each row naming one input:

- `sourceDigests` — one row for each remote `source:` whose coordinates you wrote out in full, with no template in its `kind`, `url`, `chart`, `module_subdir`, `version` or `ref`. The row carries the source's `kind` and `url`, its `chart` or `module_subdir` where it has one, the version it resolved to — for a git source, the commit its `ref` named — and the content digest of the fetched archive, plus the manifest digest for a chart fetched over OCI.
- `artifactDigests` — one row for each `artifacts` entry supplied by a file imported with `$import`, naming the entry's key and the digest of the file's bytes.

**What it does not hold:**

- **A source whose coordinates are filled in from a template** — a `version` read from `.infra`, for instance. Which artifact it names is decided by each Release that uses the entity, so each version it resolves to is pinned in that Release's lockfile, and nothing about it is written beside the entity.
- **A source that names a path in your workspace.** Nothing is fetched for it, so there is nothing to pin.
- **An inline `artifacts` entry**, which is part of the entity file, and **an entry taken from an ArtifactLibrary**, whose content is pinned by the library version the lockfile records.

An entity with nothing to pin gets no `entity.lock`, and the step, run over an entity which no longer needs one, removes it.

**Commit it beside the entity.** Every Recipe and FeatureRecipe uses the same file name, and the directory it sits in says which entity it belongs to, so the lock travels with that directory. It carries no timestamp and its rows are kept in a fixed order, so the step over unchanged inputs leaves it byte-identical, and a diff over it names the source or the imported file that moved. A directory holds one lock, so the step refuses a Recipe or FeatureRecipe with any other entity beside it — every kind has a directory of its own except Aggregate, Release and Manifest — and a pull asked to pin refuses such an entity before anything is resolved; [One entity per directory](aggrega-push.md#one-entity-per-directory) sets the rule out. A pull that does not pin writes nothing beside an entity and does not judge its directory.

**`aggrega build` holds your files to it.** A build reads the lock and makes two comparisons:

- **Each imported file is digested again and compared with its row.** A file edited after it was pinned halts the build with `[CATALOG_ERROR E0026]`, naming the artifact, the imported file and both digests.
- **Each source row is compared with the digest the Release's lockfile records for the same source.** A disagreement halts the build with `[FETCH_ERROR E0135]`, naming the lock and both digests. The two files are written by two resolutions of the same source — the pin step's and the pull's — so they disagree when those resolutions got different bytes, or when one of the two files was edited. Different bytes under one version is what an upstream that re-published a version looks like.

**Answering the halt.** If you changed the imported file on purpose, run `aggrega pin` on the entity: the step records the file's new digest, and the next build accepts it. If you did not, restore the file. For a source row that disagrees with the lockfile, restore `entity.lock` from version control, or run `aggrega pin` on the entity to rewrite it.

**`aggrega pull --verify` checks it too.** A verifying pull makes the same two comparisons over the locks beside the Recipes and FeatureRecipes the Release reaches in your catalog directories, reports every pin a build would refuse under the same code and in the same words, exits non-zero if there is one, and writes nothing.

**Where no lock is compared.** A Recipe or FeatureRecipe resolved from a registry rather than from one of your catalog directories has no lock a build reads; its sources are held to the Release's lockfile alone. And a source written at a git `ref:` is recorded in the lock at the commit that ref resolved to, while a build looks for the source's pin at the version the entity names, so that row is never compared — by a build or by a verifying pull. The lockfile still pins the commit, and every build verifies the cached archive against it.

## The plugin trust record

Some plugins the workspace attaches never shape the rendered output. A `plugins.governance` attachment in an `ir-verdict` or `render-verdict` role, and every `plugins.linter` attachment, return an accept-or-reject verdict and nothing else — no bytes of theirs reach an artifact. So they are not part of what a build reproduces byte-for-byte, and the lockfile, which pins exactly that, is the wrong place for them.

Their identities go in a second committed file instead: `plugins-trust.yaml`, beside the lockfile. It carries one entry per such plugin, recording the plugin's identity coordinate, the version selected for it, and the content digest of the resolved artifact — plus, when the publisher has deprecated that artifact since publishing it, the marker pull found and verified. The [plugin trust record schema](../schema/other/plugins-trust.md) describes the file field by field.

Commit `plugins-trust.yaml` alongside the lockfile, for the reason you commit the lockfile: a record kept outside version control is one nobody can review and nothing can compare against. Committed, it is one shared statement of which plugin each of those attachments resolved to, and a diff over it names the identity that changed.

**The file appears only when there is something to record.** A workspace that attaches no verdict-returning plugin resolves no such identity, so pull writes no file and says nothing about one — an absence, not a missing file. When pull does create it, it names the file it created and tells you to commit it. A later pull adds an identity the record does not yet hold and leaves every identity already recorded exactly as it is.

**Every change to this file is announced, and nothing else is.** A pull that moves the record prints one line per entry that moved, naming the plugin and which change it was: an identity recorded for the first time, an identity adopted in place of the one held (naming both, so you can see what was swapped), a deprecation recorded against the artifact an entry already names, a deprecation cleared from one, or the entry dropped. The creation line above is separate and is about the file rather than about an entry, so a first resolution says both: this file is new and must be committed, and these are the identities it now holds.

**A pull that leaves the record exactly as it was says nothing about it.** So a line about this file means the committed file has moved and its diff is worth reading — which matters here more than it does for the lockfile. Everything the lockfile pins is also part of what a build reproduces byte-for-byte, so a change there has a second place to show up; a verdict plugin's identity has none. This file is the only place a swapped gate is written down.

`aggrega pull --dry-run` announces none of this, because it changes nothing. It lists the record among the files it would write instead, as [Previewing what a pull would write](#previewing-what-a-pull-would-write) describes.

**A deprecation is added to an entry the record already holds, and that is not the same as rewriting it.** If a publisher deprecates a plugin you already trust, the next `aggrega pull` records the marker on that plugin's existing entry — the coordinate, the version and the digest are untouched, because the artifact has not moved and nothing new is being adopted. So a plain pull can add a `deprecation` block, and only an explicit upgrade ever changes an identity. A marker is recorded only against the artifact the entry already names, and no pull chases one that has stopped being published: a recorded marker leaves only with the entry that carried it, which means either when that entry is dropped, or when an explicit upgrade re-resolves the plugin and finds no marker on the bytes the entry already records.

**A resolved identity that disagrees with the recorded one halts the pull.** A recorded entry names both a version and a digest, so either moving is the same event: the plugin that would run is not the plugin the record was reviewed for. The diagnostic names the plugin, what the record holds, and what this resolution reported, on both axes at once — and pull stops without touching the record, so the reviewed identity is still there to compare against. It halts on the version alone (a re-publish whose bytes did not change) exactly as it halts on the digest alone (a re-push at the same version).

`aggrega pull --verify` makes the same comparison. It writes nothing, so it adopts nothing; it reports whether the files a pull commits still describe what resolves today, and the record is one of those files.

**To adopt a new identity, ask for it by name:** `aggrega pull --upgrade --release <release> <plugin>`, naming the plugin as your `.aggrega-config.yaml` attachment names it, without any version suffix. That re-resolves that one plugin and rewrites its entry, leaving every other pinned dependency and every other recorded identity untouched — and it works even though the plugin has no lockfile pin, because a named target may also name one of those attachments. A bare `aggrega pull --upgrade`, which re-resolves every dependency, re-resolves and rewrites every recorded identity too. So does `aggrega build --upgrade`, which runs a bare full-refresh pull and has no way to name a single target.

**To remove an identity, ask for that by name too.** Detaching a plugin from `.aggrega-config.yaml` does not clear its entry, and that is deliberate: a plain `aggrega pull` never removes one. Run `aggrega pull --upgrade --release <release> <plugin>`, naming the plugin as the record names it — its identity coordinate, which is the string the halt below prints — and the entry is dropped, leaving every other pinned dependency and every other recorded identity untouched. A bare `aggrega pull --upgrade` drops every entry no verdict attachment names any more, in the same pass that re-resolves everything else.

Dropping the last entry leaves the file in place and empty rather than deleting it. An empty record holds nothing, so it pins nothing and halts nothing — the same as no record at all — and keeping the file means the removal shows up in its diff as a removal.

**A record that does not satisfy its schema halts every command that reads it** — a build, a release-scoped lint, and a pull, including a pull that has nothing of its own to record. An emptied record and a damaged one are deliberately different: emptying is how the last entry is removed, and an emptied record stays silent, while a file whose contents no longer parse is a fault rather than an empty record — reading it as empty would make truncating the file a way to switch the comparison off. Restore it from version control to get the reviewed identities back.

**A plugin served from the copy inside the compiler binary is not recorded.** Pull records what it *acquired* — fetched from a registry, or read from the cache — and nothing is acquired from the binary: those bytes are identified by the compiler version that carries them, so there is no resolution of their own to record. Attaching a plugin the binary already carries therefore produces no entry for it. That is the record staying about acquired artifacts, not a resolution that failed.

**A build, a release-scoped lint and a release-scoped validation hold the workspace configuration to the record.** Before any of those attachments runs, `aggrega build`, `aggrega lint --release` and `aggrega validate --release` — and the same operations reached through `aggrega serve` and `aggrega mcp` — compare the verdict attachments the configuration names against the entries the record holds. A plugin whose resolved artifact digest is not the recorded one is refused rather than run. A record entry that no configured verdict attachment accounts for halts the run: a gate that was reviewed and is now absent leaves output indistinguishable from output that gate approved, which is exactly what someone reading the output cannot see. The halt names the plugin and offers the two remedies that differ by what you meant — attach the plugin again if the removal was a mistake, or run the explicit upgrade above if it was intended — and it prints that upgrade ready to run. The reverse direction — an attachment the record does not yet hold — is the first sighting described above, and halts nothing. The whole-catalog and single-entity lint scopes consult no record.

**A validation is held to the record because it runs the same checks a build runs.** `aggrega validate --release` reaches every check `aggrega build` reaches short of writing the artifacts, gate plugins included — that is what makes "this validates" mean the same as "this builds" — so the identity of the plugin it runs is compared against the record exactly as a build's is. `aggrega validate`'s other scopes are not held to it: validating the whole catalog, a single entity, or a plugin binary does not read the workspace's plugin attachments at all, so no verdict plugin runs in them and there is nothing for a record to hold.

**Holding a configuration to the record establishes presence and identity, and nothing beyond them.** It establishes that every gate the record names is still attached, and that each one runs from the artifact recorded for it. It does not establish that a gate which ran returned a verdict at all, and one case of that is caught nowhere: an attachment whose `function` names an export the plugin *does* declare, which is not the verdict export its socket reads, and whose output carries no top-level field outside the shape that socket expects — the empty object being the simplest — runs, returns nothing to reject on, and lets the build through. Its output is indistinguishable from an approving gate's, and no comparison against the record can notice it, because nothing about the record is wrong: the plugin that ran is exactly the one recorded, and it simply ran nothing. Two neighbouring cases do halt, so the bound is not wider than it reads — a `function` naming an export the plugin does not declare is refused when the plugin is loaded, and an output carrying a top-level field the socket's shape does not declare is refused rather than read as a verdict list that happens to be empty. So a recorded identity is not on its own sufficient for a gate to have judged anything.

**The recorded digest governs the plugins the workspace resolves from the cache `aggrega pull` populates, and nothing it resolves another way.** That is the resolution a verdict attachment normally takes — nothing pins it in the lockfile, so its bytes come from the cache, and that read is where the resolved digest is compared against the recorded one. A verdict plugin the workspace resolves some other way never reaches that read, and is governed by whatever governs the way it did resolve rather than by the record: bytes served from the copy inside the compiler binary are identified by the compiler version carrying them, a `.wasm` sitting beside its catalog entity is a file in your own catalog directory, an explicit filesystem path is the path you named, and a plugin carrying a lockfile pin is governed by that pin. The other half of holding a configuration to the record is not bounded that way: every entry the record holds must still be accounted for by a configured attachment, however that plugin resolves. So the record establishes that the gates it names are still attached whatever serves them, and it establishes the artifact identity of the ones served from the cache.

## Honoring vs. updating

By default `aggrega pull` **honors** an existing lockfile: a dependency already pinned resolves to its exact pinned version (verified against its pinned digest), only references that are not yet pinned are resolved and added, and pins for references the Release no longer reaches are pruned. So a re-pull of an unchanged Release is a no-op — it reproduces the same lockfile byte-for-byte (including `generated_at`). Adding a new dependency, or pulling after a hand-edit removed a pin, resolves just that gap and leaves every other pin untouched.

**What that honoring governs is what a registry or the cache serves.** An entity a local catalog directory supplies is resolved from that directory, at the version its file declares, and the entry the lockfile records for it is not consulted on the way. The lockfile still records such an entity, so you will see it there — but editing that entry by hand does not hold the entity at the version you wrote, and the next reconcile rewrites the entry to match the file. To change which version of a locally-supplied entity a Release resolves, edit the catalog file rather than the lockfile.

**To update pinned versions, run `aggrega pull --upgrade --release <release>`** — it discards the existing pins and re-resolves all dependencies to the latest satisfying versions. Updating is the explicit act; the default never floats a pinned dependency. This mirrors the convention of `npm ci` / `cargo` / `go build` (the default realizes the lock; updating is opt-in), and it is what makes `aggrega build`'s automatic pull safe — build resolves exactly what the lockfile pins, never silently moving a version.

That bare form drops every recorded pin, so it asks for confirmation before doing anything. Answer it in advance with `--yes` for non-interactive use; with standard input not a terminal and no `--yes`, it refuses rather than waiting for an answer nobody can give. Naming targets (`aggrega pull --upgrade --release <release> <uri>`) holds every pin it did not name, so that form asks nothing. `aggrega build --upgrade` runs the bare form and is gated on the same terms.

If a pinned version's bytes in the registry no longer match the digest the lockfile recorded (an immutability violation upstream), `pull` halts with an integrity error rather than silently adopting the changed bytes — run `--upgrade` to deliberately re-pin.

## Previewing what a pull would write

`aggrega pull --dry-run --release <release>` resolves the dependencies exactly as an ordinary pull does and then, instead of writing, prints what it would have written: one header naming each file's path, followed by the content that file would hold.

```
aggrega pull --dry-run --release release.yaml
```

**It names every file, not just the lockfile.** The lockfile, the `entity.lock` beside each Recipe and FeatureRecipe whose recorded pins would move under `--pin-sources`, and the plugin trust record all appear in the same report, because a preview that showed only the lockfile would teach you that the lockfile is all that moves. A pull that would halt on an unpinned entity halts under `--dry-run` too, for the same reason: what a preview shows is what the pull would do. The files a pull would leave byte-for-byte as they are do not appear at all — a name in the report means that file is about to change. The last line counts them, and a workspace a pull would not change reports a count of zero.

**Nothing on disk moves.** No lockfile is written or created, no entity lock is written or removed, and no trust record is created or amended. Where a capability is served by more than one provider plugin and nothing has chosen between them, the run halts naming what to supply rather than offering to write the choice into your configuration — a preview does not edit a config file on its way past.

**The resolution itself still runs, so the cache still fills.** Which external inputs a Release consumes is a product of rendering it, and a run that declined to resolve would have nothing to report, so `--dry-run` fetches and stores exactly as a pull does. The content under `.aggrega/cache` is read only through the pins a lockfile records, so filling it changes nothing a build resolves; what a dry run shows is what a pull would write.

**A bare `--upgrade` asks nothing under this flag.** The confirmation exists because a full refresh drops every recorded pin, and a preview drops none — so `aggrega pull --dry-run --upgrade --release <release>` is the form to reach for when what you want to know is what a refresh would cost you, and it runs without an answer.

**It is not accepted with `--verify`,** which already writes nothing. The pair would leave the flag doing nothing while reading as though it had done something, so it is refused rather than ignored.

**One thing a pinning preview cannot always show in full, and it says so when it happens.** A pull asked to pin rewrites the `entity.lock` beside each Recipe and FeatureRecipe and then renders the Release to discover its external inputs; a preview leaves those locks alone, so where a pin recorded there has gone stale — you edited an imported file since it was pinned, for instance — that render is held to the stale digest the unwritten lock still records, and stops. Everything else in the report is exactly what a pull would write; only the reported lockfile's external-input pins are short. The run says so on both its output and its diagnostics rather than handing you a lockfile that looks complete. A first resolution of a workspace is unaffected, because there is no recorded digest yet for anything to be stale against.

## The composition these pins describe

A lockfile pins what a build of this Release will consume, so the resolution draws the composition that build draws: it resolves the documents, applies the transformations the workspace's attachments declare, and puts the result through the checks a build makes over a finished graph. Two things follow from that, and both arrive at the pass that writes the lockfile rather than at the first build to read it.

**A composition those checks reject halts the pull.** A `uses:` edge whose target does not satisfy its socket's `selector:`, a Feature attached to a component its `appliesTo:` does not admit, and every other violation those checks report stop this command, with the diagnostic a build of the same documents prints — and the halt names every finding in one run rather than the first, so one pass hands you the whole list to correct. It happens before the write, so `<release-stem>.lock` and `plugins-trust.yaml` are left exactly as they were and a Release that will not build is never recorded as one that resolved cleanly. What that does not cover is the attachments that return a verdict: no `ir-verdict` or `render-verdict` attachment runs here, so a rejecting verdict stops the build, release-scoped lint or release-scoped validation that dispatches it rather than this command.

**An attachment in a role that shapes the graph runs during that pass, so a plugin that will not resolve halts the pull.** A `label-transform` attachment decides node labels before anything is matched against them, and an `annotation-transform` attachment injects annotations that expand into Feature attachments — both change what the graph holds, so drawing the graph means dispatching them, and dispatching them means holding each plugin's own bytes. A plugin whose bytes this pass cannot obtain halts the run, naming the plugin and what could not be found for it — the same refusal a build of the same workspace makes when it cannot obtain them. What it dispatches is the attachment list this pass has just resolved, carrying the settings and definition files the lockfile records for a later build to reconstruct, so both passes run the same attachment against the same input.

**That halt and a degraded run are different outcomes, deliberately.** A render that cannot finish — the one [How the resolution finds external inputs](#how-the-resolution-finds-external-inputs) and [Offline](#offline) both describe — leaves every dependency pin correct, so the pins are written and the shortfall is reported. A composition the checks reject is not a shortfall in what was resolved: it is a Release that will not build, so nothing is pinned for it and the run stops.

## The cache

Pulled content is stored under `.aggrega/cache`, split into an `entities/` subtree for catalog entities, a `source-artifacts/` subtree for source artifacts, and an `inputs/` subtree for the external inputs a render consumes. A catalog entity's slot is named by its coordinate and version, a source artifact's by where it was fetched from, its version and a prefix of its content digest, and an external input's by its content digest; what a build reads from any of them is checked against what the lockfile records. Identical version pins therefore share one slot across Releases. Each source-artifact slot holds the authoritative archive, a regenerated extraction, and a small metadata file; the extraction is regenerated on every read, so build output depends on the archive and the lockfile, not on the state of the extracted files.

The cache is anchored to the workspace rather than to the directory you ran the command from, so one workspace has one cache and a pull run from a subdirectory fills the same store a build run from the root reads.

## Building where the network cannot be reached

Because this command is the only step that reaches out, one connected run is enough to make every later build local. That run writes the lockfile and fills the workspace cache with the bytes those pins name, and a build then needs nothing beyond them.

Three things travel to the disconnected machine:

- **The Release and its lockfile.** Commit `<release-stem>.lock` beside the Release; it is what tells the build which version and digest every dependency resolved to.
- **`plugins-trust.yaml`, where the workspace attaches a verdict-returning plugin.** A build compares the verdict attachments its configuration names against that record before any of them runs, so carrying the record is what holds the disconnected build to the identities that were reviewed. Commit it beside the lockfile, as [The plugin trust record](#the-plugin-trust-record) describes.
- **The cache directory.** The entities, the source artifacts and the pinned inputs all live under it, and anything a local `catalog_dirs` directory does not supply is read from there.

Build on the disconnected machine as usual. Setting the offline posture there is worth doing even though a build over a filled lockfile reads its closure from the cache: it turns a would-be network reach into an immediate refusal naming the posture, rather than a connection attempt that has to time out first. Anything the cache does not hold, and any external input the lockfile does not pin, halts the build naming what is missing and the resolution that would pin it — nothing is fetched quietly to fill the gap.

**An airgapped machine and an offline workspace are different claims, and the difference is worth keeping.** A machine behind an air gap may hold a local copy of a registry, or a `catalog_dirs` catalog carrying everything it needs, in which case an ordinary pull on that machine is satisfiable without reaching out at all. The offline posture describes what a command may reach for, not what the machine holds; [Offline](#offline) sets out what it refuses and what it leaves alone.

## Offline

Under the offline posture — the top-level `offline` key in a configuration file, `AGGREGA_OFFLINE` in the environment, or [`--offline`](global-flags.md#--offline) on the command line — `aggrega pull` refuses network access. The refusal happens before any connection is attempted rather than as a timeout partway through a fetch, so an offline pull reaches no registry and no remote source. Where a committed file or an exported variable set the posture and you want past it for one command, `--offline=false` allows the network for that run alone.

**`--upgrade` is refused outright under the posture, and it is the one option here that is.** A full refresh floats every dependency to the highest version a registry currently offers, so it needs to ask a registry what it currently serves. An ordinary pull does not: it honours the pins it already records, resolves only what has none, and is therefore satisfiable from what the machine holds. The refusal says which of the three places set the posture and how to allow the network for one run.

Resolution then draws only on what the machine already holds: the `catalog_dirs` search stack and the cache under `.aggrega/cache`. Against a catalog and cache that satisfy every reference, an offline pull completes normally and writes an ordinary lockfile. The lockfile records each dependency's URI, resolved version and digest, and never which of those places served the bytes — so an offline pull and an online pull that resolve the same versions write the same lockfile.

**A dependency an offline pull cannot satisfy locally halts it.** The entry is never skipped:

- A catalog entity that resolves nowhere halts the pull, naming the reference and where it was referenced from, so both the missing dependency and the thing that asked for it are named.
- A remote `source:` halts the pull, naming the source and telling you either to allow network access or to populate the cache from a connected environment.

**An external input is the one that does not halt, and it says so instead.** The render that finds them cannot fetch what is not already stored, so an offline pull over a Release with an unpinned external input completes, writes every dependency pin it resolved, and reports three things: that the render did not finish, what it did pin, and that a build of this Release will halt naming the URL. The dependency pins it wrote are correct — nothing about them depended on the render — so they are kept rather than thrown away for a reader to reproduce.

That is deliberate rather than a gap, and there is no switch for it. A pull that discarded correct work would cost you the part that succeeded; a pull that stayed quiet would hand you a lockfile that looks complete and is not. Saying so is the only outcome that leaves you able to act: run the pull again from a connected environment, or from one whose cache already holds the content, and the same command pins it.

So an offline pull is a refusal to touch the network rather than a reduced result for everything a document names, and for external inputs it is a completed resolution that tells you what it could not reach. A lockfile that exists is one whose dependency resolution completed; whether its external inputs are complete is what the pull's own output tells you, and what a build then holds it to.

**`--verify` under the offline posture covers less, and reports that it does.** Asking where a recorded source ref points today means reaching its remote, which the offline posture refuses. So an offline `--verify` checks the pinned dependencies and skips that one axis, and it prints a line saying so rather than reporting a match it never established. An air-gapped verify stays available; what it does not tell you is whether a ref has moved since.

## Integration with `aggrega build`

- **Verification.** `aggrega build` verifies every resolved dependency against the lockfile and halts on drift between the lockfile and the current catalog or registry state. Run `aggrega pull --upgrade --release <release>` to adopt the new state. It halts the same way on a Release file edited since the pull, and there a plain `aggrega pull --release <release>` is enough, because nothing needs to float.
- **Auto-pull.** If the lockfile is missing and `auto_pull` is true, `aggrega build` runs the pull first automatically. If `auto_pull` is false, which is its default, the build halts and asks you to pull. The pull a build runs follows `pin_sources_at_pull`, so over an unpinned entity it halts exactly as a pull does. The pull step a build runs is the same one this page describes, so a build that fills an existing lockfile halts on a moved source ref exactly as `aggrega pull` does — see [Determinism and integrity](#determinism-and-integrity).
- **Offline.** Under the offline posture, `aggrega build` uses only what the machine already holds, and refuses network access before any connection is attempted. A reference whose content the cache does not hold halts the build rather than failing partway through a fetch, and a build with no lockfile at all halts naming the posture and the pull that would fill it. `--auto-pull` is not itself refused, since an incremental fill over references already cached or present in a local catalog needs nothing from a registry; `--upgrade` is, for the reason [Offline](#offline) gives.
- **Catalog search.** Pull honors `catalog_dirs` from `.aggrega-config.yaml` even when no `--catalog` is given, and resolves the same first-win search stack `aggrega build` does, so the dependencies it pins match what build searches.

## How the resolution finds external inputs

Nothing in this section changes the rule above — there is still one moment at which anything is pinned, and it is this command. What it describes is how the command reaches the third of the three kinds, which matters when you are wiring the resolution into a pipeline, reading a run that degraded, or reasoning about why this command renders at all.

**A catalog entity and a source artifact are each named in a document; an external input is not.** Resolving the first two is a matter of reading what you authored. An external input is named by a *provider*, part-way through a render, and which URLs it names follows from the values being rendered — a values entry that is absent leaves a whole subtree of a chart's schema uncompiled and every remote reference in that subtree unrequested. No read of the Release can enumerate the set.

So the command does two things in one pass: it resolves and pins the closure the documents name, then renders that closure to see which remote documents the providers ask for. The rendered artifacts are dropped and the pins are kept. Both are internal to the one command, and neither is a second moment at which something might be pinned — there is one lockfile write, and it carries every pin.

**Two consequences are worth knowing before wiring the resolution into an automated pipeline as a cheap step.** It costs more than a resolution that only reads documents, because it renders. And it can fail for a reason a document-only resolution could not: a provider that cannot render this Release. When that happens the dependency pins are still written, because nothing about them depended on the render, and the diagnostic names the stage that stopped, what was pinned, and that a build will halt naming the unpinned URL. The run is not lost, and [Offline](#offline) shows the same outcome reached a different way.

**There is no switch to skip the render.** One would preserve as an option exactly the surprise a single moment removes: a Release that resolves cleanly while an input its render needs is left unpinned, found only at build time.

**`--auto-pull` folds this same resolution into a build, and the build renders once.** The fill's render is the one that finds and pins the external inputs, and the build presents that render rather than performing a second one, so a one-command build costs the same render an ordinary build over a filled lockfile costs. [`aggrega build`](aggrega-build.md#filling-the-lockfile-as-part-of-the-build) sets out which of a build's render flags reach it.

**The set follows from the Release's parameters, which is how component pins already behave.** Editing a Release's parameters between the resolution and the build is an edit to the Release, so the build halts at the drift comparison naming the file, before any render could request a URL that is not pinned; the remedy is this command. Parameters imported from a separate file are not recorded by content, so editing that file instead reaches the render, which halts naming the unpinned URL — with the remedy naming this command too.

## Determinism and integrity

A Recipe's `source:` may template its version against the Release's resolved `values` and `infra` (and over `locals` defined on the same); these resolve at pull time and the result is pinned. A mutable Git tag or branch is pinned to the concrete commit it points at, and the ref you authored is recorded beside it. At build time the cached archive's digest is re-verified against the lockfile, so a tampered cache is caught.

**A recorded ref is held to the commit it pinned.** The ref is recorded because later runs ask it again, not for readability — a build asks which artifact it names, and a pull asks whether it still points where it did. A `pull` that is not an upgrade re-asks each recorded ref where it points, and a ref that has moved at its remote halts the run — naming the artifact, the ref, the commit the lockfile pins and the commit it resolves to now — rather than adopting the move. Run `aggrega pull --upgrade --release <release>` to adopt it. A targeted upgrade, which names entity URIs, does not: a source reference is not an entity you can name, so a targeted run holds it exactly as a plain pull does.

That check is the one thing the build-time digest re-verify cannot do for you. A pull that adopted a moved ref would rewrite the fetched bytes and the recorded digest in the same act, so the two values a build compares would have moved together and agreed — and you would be building different source content than the lockfile was reviewed against, with nothing reporting it.

**Only a ref the lockfile records is held this way**, and a ref is recorded whenever you author one. A Recipe that names its source by `version:` alone has no ref, so there is nothing for a later run to re-ask — which is the right answer, because a version you wrote yourself cannot move under you. The [lockfile reference](../schema/other/lockfile.md) states what is recorded.

**Write the ref, not the commit.** A `build` finds a git-sourced artifact by the ref you authored, matched against the ref the lockfile recorded, so `ref: v1.2.3` builds against the commit that tag was pinned at and the commit never has to appear in your Recipe. Naming a mutable tag in `version:` instead does not work and is not meant to: `version:` is matched as written, and for a git source the lockfile pins a commit.

The lockfile pins content fetched from registries and remote sources, and records the digest of each entity file it resolves from your catalog directories and of each Release file the resolution read. A source beginning with `./` or `../` is not pinned, and an artifact file an entity imports is pinned in the lock beside that entity rather than in the lockfile, as [The entity lock](#the-entity-lock) describes; the integrity of the rest of your workspace between builds is the responsibility of the source-control system. See [byte-identical output](../../architecture/05-invariants.md) for the scope of the determinism guarantee.

## Authentication

Aggrega does not implement its own authentication for remote registries. Authentication uses the standard tooling configs in priority order:

- `~/.docker/config.json` (Docker login)
- `$XDG_RUNTIME_DIR/containers/auth.json` (Podman / Skopeo)
- `~/.config/helm/registry/config.json` (Helm OCI)

Credential-helper delegation via `credsStore` and `credHelpers` is honored across all three locations, so OS-keychain integration via delegated helper binaries works without further configuration. For a private OCI catalog or chart repository, run `docker login <registry>` (or `helm registry login <registry>` for Helm-specific OCI) before `aggrega pull`. The credentials persist in the standard config file; Aggrega reads them automatically.

Other source kinds use their native authentication conventions:

- Helm classic HTTPS chart repositories (non-OCI) read `~/.config/helm/repositories.yaml` per Helm's own convention.
- Git module sources use the standard Git transport credentials — SSH agent, `~/.netrc`, gitconfig credential helpers.
- Plain HTTPS fragment sources transport with no authentication today; richer per-host token configuration is a future iteration.

The goal across kinds is to let each kind's native tooling continue to own its authentication story. Aggrega does not interpose its own credential store or auth layer.

## Environment variables

The workspace settings pull reads can be overridden through the environment, above the committed config and below any flag: `AGGREGA_OFFLINE` (see [Offline](#offline), and [`--offline`](global-flags.md#--offline) for the flag above it), `AGGREGA_CATALOG_DIRS` (OS-path-list separated; supply absolute paths), `AGGREGA_ARTIFACT_CACHE_DIR`, `AGGREGA_DEFAULT_REGISTRY`, and `AGGREGA_SKIP_SIGNATURE_VERIFICATION` (loud — every pull logs a warning when verification is globally disabled). See [environment-variables.md](environment-variables.md) for the full list and the precedence model.

## See also

- [./aggrega-build.md](./aggrega-build.md) — verifies the lockfile and auto-pulls when configured.
- [./aggrega-serve.md](./aggrega-serve.md) — the daemon carries this same resolution at
  `aggrega/resolveDependencies`, and inside `aggrega/build` for a request whose `autoPull` field asks
  for it, so an editor can run it without leaving the session; either way it runs only when a request
  names it, and writes the same lockfile this command does.
- [./aggrega-push.md](./aggrega-push.md) — publishes catalog entities to a registry.
- [./aggrega-lint.md](./aggrega-lint.md) — the publish gate that precedes `aggrega push`.
- [../../architecture/13-catalog-and-registry.md](../../architecture/13-catalog-and-registry.md) — the catalog, lockfile, and cache model in full.

<!-- BEGIN GENERATED: cli-pull -->
**Synopsis**

```
aggrega pull [<uri>...] [flags]
```

**Description**

```
Resolve the Release's catalog and source dependencies into the cache and write the per-Release lockfile.

By default, pull reconciles the lockfile against the current dependency resolution while honoring
the pins it already records. That pin discipline governs what a registry or the content cache
serves: such an entity is fetched at its pinned version and verified against its pinned digest,
and if the registry no longer serves the pinned bytes, pull halts rather than silently re-pinning.
An entity a local catalog directory supplies is resolved from that directory instead, at the
version its file declares, and its recorded pin is not consulted — so editing a pin by hand does
not hold a locally-supplied entity at that version, and the reconcile rewrites the entry to match
the file. A reference with no pin — newly added, or removed from the lockfile by hand — is
resolved fresh and added. Entities no longer among the resolved dependencies are pruned.
Re-running pull on an unchanged dependency set is a no-op.

Use --upgrade with no positional arguments to discard the existing lockfile and re-resolve
every entity from current registry state, floating each dependency to the highest available
version. That form drops every recorded pin, so it asks for confirmation first; --yes answers in
advance, and on a non-interactive stdin it refuses rather than waiting for an answer nobody can
give. Pass one or more entity URIs after --upgrade to upgrade only those: each named pin
is dropped and re-resolved fresh while every other pin — and the recorded external inputs —
is held unchanged. A named target may also be a plugin that returns an accept-or-reject verdict;
such a plugin carries no lockfile pin, and its identity is recorded beside the lockfile instead.
Naming one the workspace still attaches adopts the identity it resolves to. Naming one the
workspace no longer attaches drops its recorded identity — the one way to clear an entry that
outlived the attachment it was recorded for. A bare --upgrade does both for every plugin at once.
A URI given without --upgrade is a usage error.

Each Recipe and FeatureRecipe this Release builds from one of your catalog directories carries
the pins for its own inputs in the entity.lock beside it: a remote source: written out in full,
and a file an artifacts entry imports. Recording them is the entity author's step, aggrega pin.
By default pull records none of them, and halts on an entity whose lock is missing any, naming
the entity, each input and its class, and the command that records them. Pass --pin-sources,
or set pin_sources_at_pull in the workspace configuration, to have pull run that same step
instead; --pin-sources=false restores the halt for one run.
```

**Flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--catalog` | `[]` | Catalog directory; repeatable. Each --catalog is prepended to the workspace catalog_dirs search stack (first match wins), which ends with the `catalog` directory at the workspace root when there is one. A workspace whose catalog_dirs is written as an empty list reads no local catalog at all. |
| `--detail` | `false` | Print, per resolved entity, what this pull did — fetched fresh from a registry, reused a cache slot, found in a local catalog, served from inside the compiler binary, or external. Stdout only; not written to the lockfile |
| `--dry-run` | `false` | Resolve the dependencies and print what this pull would write instead of writing it: each file's path and the content it would hold go to stdout, and the lockfile, the entity.lock beside every Recipe and FeatureRecipe whose recorded pins would move under --pin-sources, and the plugin trust record are all left untouched. Only the files that would actually change are named. The resolution itself runs exactly as it would otherwise, so the content cache still fills, a pull that would halt on an unpinned entity halts here too, and a bare --upgrade asks nothing because it drops no pin — what a dry run shows is what a pull would write. Not accepted with --verify, which already writes nothing |
| `--include-prerelease` | `false` | Not yet implemented: accepted and ignored, so a script that passes it keeps working when it starts having an effect |
| `--pin-sources` | `false` | Run the entity author's pin step over the Recipes and FeatureRecipes this Release builds, recording in the entity.lock beside each the pin for every input it reads — a remote source: written out in full, and a file an artifacts entry imports — instead of halting on an entity whose lock does not record them. The same step as aggrega pin, writing the same bytes. It writes beside the entity, so it runs only where the entity has a writable home: a document in one of your catalog directories. An entity resolved from the cache has none and is never pinned. Overrides the workspace's pin_sources_at_pull in both directions: --pin-sources pins for this run and --pin-sources=false halts for this run, whatever the setting says |
| `--progress` | `false` | Force the pull-progress surface on even when stderr is not a terminal, printing plain static phase lines. The default is auto: the interactive phase checklist is shown only when stderr is a terminal |
| `--quiet` | `false` | Silence the pull-progress surface on stderr. Does not affect stdout. Takes precedence over --progress |
| `--release` | — | Path to Release YAML file (required). A relative path resolves against the directory you run the command in, not against the workspace root |
| `--upgrade` | `false` | Re-resolve dependencies from current registry state, floating each to the highest available version. Bare (no positional URIs) discards the lockfile and re-resolves every entity, and asks for confirmation first because it drops every recorded pin; with one or more entity URIs, re-resolves only those, holding all other pins and the recorded external inputs unchanged, and asks nothing (mutually exclusive with --verify) |
| `--verify` | `false` | Verify the existing lockfile against the current dependency resolution without writing; exits non-zero on drift or missing lockfile. Also holds the entity.lock beside each Recipe and FeatureRecipe in your catalog directories that the Release reaches to what a build compares it with, and exits non-zero on a pin a build would refuse: an imported file that no longer matches its recorded digest, or a source pin that disagrees with the lockfile. Also reports the compiler and core-plugin versions the lockfile records — reported for audit and never compared against this binary, so a toolchain difference is never drift (mutually exclusive with --upgrade) |
| `--yes` | `false` | Answer the bare --upgrade confirmation in advance, for non-interactive use. It reaches that one prompt and nothing else: every other form of pull asks nothing, so passing it changes no behaviour there |
<!-- END GENERATED: cli-pull -->
