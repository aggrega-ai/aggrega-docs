# aggrega push

`aggrega push` publishes a catalog entity to an OCI registry, where other workspaces can resolve it with `aggrega pull`.

## What it does

`aggrega push` reads a single entity YAML, bundles it for transport, and pushes it to `<registry>/<kind>/<metadata.name>:<metadata.version>`, with the repository path lowercased; a Recipe or FeatureRecipe carries its `spec.capability`, and a Plugin its `metadata.pluginType`, as a segment between the kind and the name. Run `aggrega push --list-kinds` for the entity kinds the installed binary publishes — one kind per line, sorted, and nothing else, so a script can read it directly. The set spans the catalog authoring kinds together with the Aggregate, a reusable module, and the Plugin, a content-addressed reference to a WebAssembly artifact the compiler routes and the runtime executes. The Plugin is a structural publishable artifact rather than a catalog authoring kind. Publishability is a property of the entity, not of how it is used: an Aggregate is publishable whether it is later referenced as a Release's top-level `spec.aggregate` or nested in another Aggregate's `aggregates:` block. Release and Manifest are deployment-side inputs, not catalog artifacts, and are rejected.

## Bundling

**A push publishes the entity document and the files the entity itself names beside it — and nothing else in its directory.** The files an entity names are:

- for a Recipe or FeatureRecipe, its local `source:` — a directory travels with every file under it that the ignore rules recorded in its `entity.lock` keep, as [Which files ship with an entity](aggrega-pin.md#which-files-ship-with-an-entity) describes; each file its `valuesMapping:`, `workload:` and `artifacts:` entries import with `$import:`; and the `entity.lock` beside it;
- for a Component or Feature, each schema file its `spec.schema`, a pillar or a `usesSchema` socket imports with `$import:`, including every file an imported file imports in turn.

An Aggregate, a Plugin and the library kinds name no file beside their document. A note, a README, another entity's files or a build's output sitting in the directory is not published, whatever it is called. A symbolic link among the files an entity names is refused rather than followed — [A symbolic link sits among the files an entity carries](../errors/fatal-halts.md#a-symbolic-link-sits-among-the-files-an-entity-carries) — and so is a path an entity names through a directory that is a link leading out of the entity's directory, before anything is packed — [A path names content outside the entity's own directory](../errors/fatal-halts.md#a-path-names-content-outside-the-entitys-own-directory).

**The shape follows from that.** An entity that names nothing publishes as its document, unchanged, under its kind's `+yaml` media type. One that names a file publishes as a `.tar.gz` holding the document and those files at their places in the directory, under its kind's `+tar+gz` media type. So a Recipe whose content is all inline publishes as its document, and a Component whose schema is imported from a file publishes as an archive. [Catalog and Registry](../../architecture/13-catalog-and-registry.md) §6 lists both media types for every kind.

**Each file in an archive carries mode `0644` and no timestamp, whatever its permission bits on disk.** A checkout writes files with its own permission bits, and a system that records no execute bit checks out as an ordinary file what another system checks out as executable, so the archive carries no mode read from disk: two checkouts of one commit publish the same files whatever their umask and whichever system they were made on, and flipping a script's execute bit changes nothing that is published.

**A push warns about each entry an archive carries that Windows cannot hold as written** — a path with a part named after a device, such as `CON`, `AUX` or `NUL`, in any letter case and whatever extension follows, like `aux/x.yaml`, or a part ending in a full stop or a space, like `report.`. On Windows, `aggrega` refuses to unpack such an entry, so a Windows workspace cannot use the version. The warning is written to standard error on every platform, one line per entry, ahead of the publication's own account; the entity document's own file name is judged with the files it names, and an entity that names nothing publishes as its document alone and is never warned about. It refuses nothing: the push goes ahead or is refused exactly as it would be without it, and `--dry-run` warns the same way. [A published archive carries an entry Windows cannot use](../errors/warnings.md#a-published-archive-carries-an-entry-windows-cannot-use) shows the line and what to do about it.

**A local `source:` written as a template carries the whole directory.** A template such as `./charts/{{ .values.flavour }}` names a directory only once a Release fills it in, so no publication can tell which one it will be. Such an entity carries every file in its own directory that its recorded ignore rules keep — never its `.aggregaignore`, whose rules travel inside the lock — and the push says so beneath its other facts:

```
  carries: every file in the entity's directory, because its source "./charts/{{ .values.flavour }}" is a template and the directory it names is decided by each Release that uses it
```

**What is not named does not travel, and a consumer is the one who finds out.** A file the entity relies on without naming it through one of the fields above is not in the publication, and a consumer's build of it fails naming the path inside its cache slot that is missing — not your push. Name every file the entity needs through one of those fields.

Each published file is named on the artifact's manifest, so a generic OCI client such as `oras` writes it to a file of that name: `entity.yaml` for an entity published as its document, `entity.tar.gz` for one published with its files, and for a Plugin `entity.yaml` for the entity beside `entity.wasm` for its executable. The name follows from the media type, not from the file you publish from, so the same content published from a renamed file publishes the same artifact. [Catalog and Registry](../../architecture/13-catalog-and-registry.md) §6 lists every published shape and the file each lands as.

A remote `source:` URL on a Recipe (an OCI chart reference, an HTTPS chart or fragment URL, a Git module) is **preserved verbatim** in the published YAML; it is not pulled and vendored into the artifact. Consumers resolve and pin remote sources independently at their own pull time. This keeps catalog-entity distribution and source-artifact resolution as separate concerns.

An Aggregate publishes as its own single document: a sub-aggregate it references in `aggregates:` is **not** bundled into the artifact. Each sub-aggregate is a separately published Aggregate that consumers resolve and pin independently at pull time, by identity — the same separation-of-distribution principle that applies to remote sources.

### One entity per directory

An archive holds the entity file among the files it names, so the entity has to be found again on the way back out. A consumer finds it by the preamble it carries: the document at the top of the bundle whose `kind:` is a publishable entity kind is the entity. The file it is authored in may be called anything — `recipe.yaml` is the catalog's convention rather than a requirement — and a compose fragment, a chart template or a Kubernetes manifest sitting beside the entity is not mistaken for one, because those declare something else or no kind at all. Entity documents further down, inside a `source/` tree, are content the entity ships rather than the entity itself and are never considered.

**A push refuses an entity that shares its directory with another entity.** Every kind has a directory of its own except Aggregate, Release and Manifest, which a workspace root holds side by side. For any other kind, a push checks before it does anything else with the entity — before the pin step, the signing policy and the bundle — that no other entity document sits in the same directory, and refuses otherwise, naming each entity in the way, whether or not the push was asked to pin. [`aggrega pin`](aggrega-pin.md) refuses the same directory in the same words; the halt is [An entity shares its directory with another entity](../errors/fatal-halts.md#an-entity-shares-its-directory-with-another-entity). A document of no entity kind beside the entity — a chart file, a compose fragment, a README — is not in the way, and neither is anything in a subdirectory. Each document beside the entity is read only from inside the workspace, or, for an entity you name outside it, from inside the entity's own directory, so one that is a link leading out stops the push naming the link, unread, as [the workspace boundary](workspace-boundary.md#halted) sets out.

The rule is what keeps one `entity.lock` belonging to one entity: the lock's file name is the same for every entity, so two entities authored in one directory would share the one lock it has room for. It is judged only when something is produced from the directory, so a directory holding several entities still loads, lints and builds.

**The directory's name is not judged.** An entity alone in its directory publishes at its `metadata.version` wherever that directory sits; `<name>/<version>/`, the layout the standard-library catalog follows, is a convention. An artifact another client published from a directory holding two entities is still read safely: a pull of it halts naming both documents rather than answering with either, catalogued at [errors/fatal-halts.md](../errors/fatal-halts.md).

## Reading the entity before it is bundled

**A push reads a Component, a Feature, a Recipe or a FeatureRecipe the way a build reads it, and refuses one that read refuses** — for the same reason, under the same short code, before the bundle is built and before the destination registry is contacted. So a document that fails its kind's schema, a path naming content outside the entity's own directory, and a schema a Component or Feature imports with `$import:` that is missing or cannot be used are refused at publication rather than published. Each of them is an entity its consumers' first build would refuse; a path that leaves the directory also names a file that would not travel with the entity, because every file a publication carries is taken from the entity's own directory — see [A path names content outside the entity's own directory](../errors/fatal-halts.md#a-path-names-content-outside-the-entitys-own-directory).

A Recipe or FeatureRecipe is read this way as its pins are compared, which the next section describes, so the reading happens whether or not the push is asked to pin and whether or not the entity has anything to pin. Every one of the four kinds is also read this way immediately before its bundle is built, because that reading is what says which files it names. An Aggregate and a library name no file and are not read this way. A Plugin names no file either, and is read against its kind's schema before its `.wasm` is, as [Publishing a Plugin](#publishing-a-plugin) describes.

## Publishing a Plugin

A Plugin publishes together with its `.wasm`, named by `--plugin`, and a push judges the two before any bytes are published or the registry is contacted. `--dry-run` judges them exactly as a publication does.

**The entity is read against its kind's schema first**, the way a catalog load reads it, before the `.wasm` is read. So a `metadata.version` that is not a semantic version — a bare commit such as `415148e` — is refused under the schema's own condition, naming the field, and so is any other departure from the schema, such as a missing `spec.abiVersion`. What counts as a semantic version here is the schema's own pattern for `metadata.version`; the push adds no rule of its own.

**Then the `.wasm` is loaded and held to the entity.** What it reports offering must agree with what the entity claims, the command set and host functions the entity records must match it, and the version it reports about its own build must equal `metadata.version` — see [A Plugin entity's recorded version does not match the plugin](../errors/fatal-halts.md#a-plugin-entitys-recorded-version-does-not-match-the-plugin).

**A `.wasm` built from a working tree with uncommitted changes is refused.** Such a build carries the `-dirty` mark at the end of the version it reports — `1.0.0-dirty`, `1.0.0-3-g1a2b3c4-dirty`. That is a valid semantic version, but it names a commit that does not hold what was built, so nobody could rebuild what was published from the version it was published under. The push refuses it, naming the version and the repair: build the plugin from a clean checkout of the commit the release's tag names, so it reports the release version itself — and to release the change, commit it with the entity's `metadata.version` set to the new release and tag that commit first — rather than copying the version a rebuild reports into the entity. A development version built from a commit, such as `1.0.0-3-g1a2b3c4`, and a prerelease such as `1.0.0-rc.1` both publish. The refusal is [A plugin was built from a working tree with uncommitted changes](../errors/fatal-halts.md#a-plugin-was-built-from-a-working-tree-with-uncommitted-changes).

## Pinning before publishing

A Recipe or FeatureRecipe carries the pins for the inputs it reads — a remote `source:` written out in full, a file an `artifacts` entry imports, the files of a `source:` beside it — in the `entity.lock` beside it, and a push publishes that file with the entity. Pinning is a step you run before publishing, [`aggrega pin`](aggrega-pin.md), and commit the lock it writes.

**A push refuses an entity whose lock does not record those pins.** Before it builds the bundle, a push works out what the pin step would record for the entity and compares it with the `entity.lock` beside it. Where a pin is missing, or the lock holds one an input no longer matches, the push stops before any archive is built or any registry is contacted. The refusal names the entity and every such input — each a `remote source`, an `imported file` or a `local source file` — and what to run: `aggrega pin` on the entity, `--pin-sources` on the push you just ran, or `pin_sources_at_push` for every push in the workspace. It is the same refusal a pull raises over the same lock, [An entity reads an input the lock beside it records no pin for](../errors/fatal-halts.md#an-entity-reads-an-input-the-lock-beside-it-records-no-pin-for), with a push's own remedies. So a Recipe or FeatureRecipe a push publishes carries, inside its bundle, a lock recording every pin the step would have recorded at the moment it was published.

Two kinds of entity have nothing to pin and publish untouched: an entity that reads no remote source, imports no file and names no local source, and a Recipe whose remote source coordinates are filled in from a template. That source names an artifact only once a Release fills the template in, so its pin belongs in each Release's lockfile, and a push does not ask for one beside the entity. A Component, a Feature, a library, an Aggregate or a Plugin reads nothing the lock records and is never refused here.

Comparing a remote source's pin means fetching the source, as `aggrega pin` does, because a pin that no longer matches is only visible against what the source serves now. A push over an entity with such a source therefore reaches the source's host before it reaches the registry. The comparison reads a Recipe or FeatureRecipe the way the pin step does, through the catalog, so one the catalog refuses to read — a document that fails its kind's schema, say — is refused here with the catalog's own reason.

**Where no workspace was found and none was named, a push that would fetch a remote source for the comparison is refused before it fetches it, as `aggrega pin` is.** The comparison fetches each remote source the entity writes out in full into the artifact cache, exactly as the pin step does, and a cache written in a folder no workspace was found from would make that folder a workspace. So when nothing names a root and nothing anchors one — from the folder you run the push in, or, for an entity named by an absolute path, from the entity's own folder — a push of a Recipe or FeatureRecipe with such a source stops before the source is fetched, a dry run and `--pin-sources` included, and names the source, the folder and the two ways out: name your workspace with `--workspace-root` or `AGGREGA_WORKSPACE_ROOT`, or give that folder a `.aggrega-config.yaml` carrying a `workspace:` block. The comparison fetches nothing for the two kinds of entity above, nor for one whose source is local, so each of those is compared with its lock and published there as anywhere else; and every other kind is not held to a lock and is not refused for this. [Configuration](configuration.md#the-other-ways-a-project-root-is-recognised) lists the other commands this holds for.

**`aggrega push --pin-sources` runs that same step for you, first.** The step runs before the bundle is built, so the lock it writes is in the published artifact and the published digest covers it; and it runs ahead of every other refusal that judges the entity, so what is judged is the entity as pinned. Only the directory rule above comes first, because the step writes the one lock the directory holds. It writes the same bytes `aggrega pin` writes, so the refusal above never fires on that run: the lock the step has just written records exactly what the refusal would compare against. The workspace key `pin_sources_at_push` makes this every push's default, and `--pin-sources=false` skips the step for one run, which brings the refusal back. The step writes beside the entity, which needs a writable home — and a push always has one, since it publishes the document you name.

**`--dry-run` answers the way the publication would.** Without `--pin-sources` it refuses an unpinned entity exactly as the publication does, so a dry run that reports a bundle is one this refusal would let through. With `--pin-sources` the step pins as a dry run: it prints the lock it would write and writes nothing, and the bundle facts that follow describe the directory as it stands, without that lock — so the digest is that of a publication without it, and where the lock would be new, so are the size and, for an entity naming nothing else, the media type. The refusal does not fire, because the publication would have pinned first.

**Best practice: a change to a version you have already published goes into a new version, and then a pin.** Copy the entity into a new version directory, make the change there, pin it, and publish that. The half of this the product enforces is the next section: publishing different content at a version that is already published is refused. The other half — not re-pinning an already-published version after editing it in your own workspace — is yours to keep; nothing refuses it locally, because re-pinning is legitimate for an entity you have not published.

## Registry, tag, and content-addressing

The target registry is `--registry <ref>` when supplied, otherwise the workspace's `default_registry` (`hub.aggrega.ai` by default). The tag is the entity's `metadata.version`, and the repository path is derived from its kind and name, so where a published version lands does not depend on the directory it was published from.

**A `default_registry` may carry a repository path, and a publication through it lands under that path.** With `default_registry: ghcr.io/acme`, the Component `core/api-server` at version `1.0.0` is published at `ghcr.io/acme/component/core/api-server:1.0.0` — the place a pull through the same default fetches it from, so the signature attached here is the one that pull finds. `--registry` names a host, and a publication it directs lands at that host with no path. Whichever way the destination is named, the signing requirement and the signing configuration that apply are the ones kept for its host: a path never selects a different policy. The spelling of a path is set out in [how a registry host is written](configuration.md#how-a-registry-host-is-written).

**The manifest names the digest of the bytes published, and the lockfile records the digest of what they carry.** The OCI manifest a push writes names the digest of the published document or archive, and `aggrega pull` refuses a download that does not match it, so bytes altered between publish and pull are caught. The lockfile a pull writes records the entity by a different digest: the digest of its content — each file's path and its bytes, and nothing about how the archive was compressed or what permission bits its files had. That is the digest a pull in the author's own workspace records for the same entity in its catalog directory, so an author and every consumer of one publication record the same value, and a build on either side refuses content that no longer matches it. The two digests answer different questions: the manifest's checks the download, and the lockfile's is the entity's identity.

## Publishing over an existing version

Before any bytes are uploaded, `aggrega push` resolves what the target registry already holds at the reference it is about to write and compares it against the content in front of it. Three outcomes:

- **Nothing is published there yet** — the push proceeds and publishes normally.
- **The same content** — nothing is uploaded, and the command reports the version as already published, so a repeated or retried push is not an error. What an earlier push left unattached — the signature, or the publication date — is attached now, as [Completing a publication an earlier push left partial](#completing-a-publication-an-earlier-push-left-partial) describes.
- **Different content** — the push halts, naming the digest already published and the one it would have written. No flag forces it through.

A version that is already published therefore keeps denoting the bytes published under it. Content that has changed is published under a new `metadata.version`; [`aggrega lint --pre-publish`](aggrega-lint.md) answers the next question — how far that version must move — by classifying the change against the previously published version.

**`--dry-run` prints the digest a push would write**, beside the reference it would write it at:

```
aggrega push (dry-run): <reference>:<tag> (<digest>)
```

It is the digest the push itself compares with what is already published, computed the same way from the content alone, and printing it contacts no registry. So the content in front of you can be held against the digest a version was published as before anything is pushed: where they differ at a published version, the push would be refused. With `--pin-sources`, it is the digest of the directory as it stands, as [Pinning before publishing](#pinning-before-publishing) describes.

### Completing a publication an earlier push left partial

A push writes the content first and attaches the signature and the publication date afterwards, so a push that fails on one of those attachments — after [its retries](#when-the-registry-fails-a-write) — leaves the content published without it, and exits non-zero naming what it could not attach. Running the same push again completes that publication. It finds the content already published, prints the `Already published:` line, uploads nothing, and attaches what the version still lacks, each on the line a first publication prints for it:

- **The signature, where this push signs.** It is attached when the version carries no signature that counts as this publication's. Where your configuration pins a trust policy for the destination's host — a `public_key` or `trusted_identities`, or for `hub.aggrega.ai` the built-in baseline — a signature counts when it verifies under that policy, so a signature the policy does not admit is never taken for the publication's own. Where the policy pins neither, no signature can verify against it, so any signature the version carries counts and the push signs only a version that carries none; judging by verification there would attach another signature on every run.
- **The publication date**, where [the rule for dates](#the-publication-date) owes one — read from the signature just attached, or from the one already counted — and the version carries no published-at referrer at all. A push that does not sign owes a date as an unsigned publication does, whatever signatures were attached to the version afterwards. The date it states is this push's own clock: the time the publication was completed, which is later than the time the content first landed, since nothing the registry serves records that moment.

A publication that is already complete gets nothing attached, however many times the push is repeated. Before it attaches anything, the push reads which signatures and dates the version carries and makes any signature it owes. A question it cannot answer — a listing or a signature it cannot read, or a signature it cannot judge because the trust root cannot be obtained — and a signature it cannot make each exit non-zero with nothing attached, rather than being taken to mean the version carries none.

## When the registry fails a write

A push writes to the registry in steps: the content — for a Plugin, the entity and its `.wasm` — then the manifest that names it, then the version tag, then the signature and the publication date beside it. **Each step that writes is retried when it fails in a way a later attempt can succeed:** the registry answers with a server error (any `5xx` status), `408 Request Timeout` or `429 Too Many Requests`, or the connection times out, is reset, or ends in the middle of a response. A step is tried at most three times, waiting half a second before the second attempt and a second before the third.

**Each attempt is a new upload of the same bytes, never a resend of the request that failed.** A registry that has already taken in an upload's body can refuse the same request a second time, and a new upload is what it accepts. Content the registry already holds counts as uploaded, and a retried step writes what the first attempt would have, so an attempt that landed but whose answer was lost lands nothing twice: the manifest keeps its digest, and the version carries one signature and one publication date.

Every other failure ends the step at once: a refused credential (`401`, `403`, or no stored credential for the registry), any other answer the registry gives, a registry that cannot be reached at all, or a push you interrupt. **A step still failing after its last attempt fails the command, and the error names the step** — the content, the manifest, the tag, the signature or the publication date. What earlier steps published stays published; [Signing](#signing) and [The publication date](#the-publication-date) say what that means for the version.

Only writes are retried. Reading what the registry already holds at the version, before anything is uploaded, is not.

## Signing

`aggrega push` can sign the artifact as it publishes and attach the signature as an OCI referrer — a Sigstore (cosign-compatible) bundle on the artifact's immutable manifest digest. The signature is a sibling manifest, so signing never re-pushes or mutates the published bytes. The referrer names its bundle `signature.json`, so a generic OCI client pulling the referrer by its digest writes the bundle to that file.

Signing is **sign-before-push**: the manifest digest is known before publishing, so `aggrega push` constructs the signer and signs the digest **before any bytes reach the registry**. If the signer cannot be constructed or signing fails, the push is refused before anything is uploaded — nothing is published, so a failed signing never leaves unsigned content on the registry. Before it refuses, a signing call that failed transiently — any failure a registry write is retried for, or the keyless certificate authority reporting that it could not process the identity token — is tried again, up to three attempts with the same waits.

**The signature is attached after the content lands, so a failed attach does leave the content published without it.** The attach is a write, retried as [When the registry fails a write](#when-the-registry-fails-a-write) describes. If it still fails, the command exits non-zero naming the signature it could not attach, and a consumer whose registry requires signatures refuses the version until a signature is attached. Running the same push again attaches it, as [Completing a publication an earlier push left partial](#completing-a-publication-an-earlier-push-left-partial) describes; [`aggrega sign`](aggrega-sign.md) attaches one to the published version by reference.

A publication requires a signature when the destination registry's own `signing` block sets `required: true`, or the top-level `signing` block does for every registry — each limited to the kinds its `kinds` lists, where it lists any. Such a publication signs by default, and `--sign` requests signing explicitly. There is no flag to push unsigned content where a signature is required — that push always halts.

Two signing modes:

- **Keyless** (default) — an ephemeral key bound to an OIDC identity by a short-lived Fulcio certificate, recorded in the Rekor transparency log. Fulcio and Rekor default to the public-good Sigstore instances (`https://fulcio.sigstore.dev`, `https://rekor.sigstore.dev`). The keyless trusted timestamp comes from Rekor's transparency-log inclusion; a separate RFC3161 timestamp authority is **optional** — supply `--timestamp-url` with a full endpoint to enable one. At an **interactive terminal** keyless signing needs no flags: the CLI opens a browser to acquire a short-lived OIDC identity token. On **GitHub Actions** it needs none either: the CLI mints the workflow OIDC token automatically from the runner's ambient endpoint. For **other non-interactive / CI** use, export `AGGREGA_IDENTITY_TOKEN` (or `SIGSTORE_ID_TOKEN`), or pass `--identity-token`; with no supplied token, no ambient endpoint, and no terminal the push is refused. See [environment-variables.md](environment-variables.md) for the CI token model.
- **Keyed** (`--key`) — an offline held ECDSA P-256 key (cosign-compatible PEM), the escape hatch for environments with no OIDC identity provider. No identity provider, certificate authority or transparency log is contacted.

The keyless service URLs and the keyed key path can also be set in `.aggrega-config.yaml` under a `signing:` block (global and per-registry); a flag overrides the config, and the config overrides the public-good default. The OIDC identity token is never a config field (it is a short-lived secret), and the private key is never inline in config — only a path to it.

## The publication date

The manifest's creation time is pinned, so a manifest digest depends only on what is published and never on when. The date a version was published travels beside it instead, and where it comes from depends on the signature:

- **A keyless signature already carries it.** Its transparency-log entry records when the log integrated the signature, and the log's signed promise attests that time. `aggrega push` writes nothing more.
- **A keyed signature, or no signature, carries no time.** So after the entity and any signature have landed, `aggrega push` attaches a small published-at referrer to the manifest — named `published-at.json` for a generic OCI client — holding one RFC 3339 timestamp in UTC to the second, read from the publishing machine's own clock. It is not signed: it is the publisher's statement, and a reader records it as that. The line `Publication date attached:` reports it.

Like a signature, the published-at referrer is a sibling manifest pointing back at the published one, so it moves no digest and changes no tag, and the check on publishing over an existing version is unaffected by it. A repeated push of the same content attaches a date only to a version that carries none, stating its own clock — see [Completing a publication an earlier push left partial](#completing-a-publication-an-earlier-push-left-partial). The date is read from the clock once, before the attach is first tried, so a retried attach — see [When the registry fails a write](#when-the-registry-fails-a-write) — states the same date. A push that published its content but could not attach the date after those attempts exits non-zero and names what was not attached. [`aggrega registry update`](aggrega-registry.md#the-publication-date-each-version-records) records each version's date together with which of the two sources it came from.

## Offline

Publishing is a network round trip and has no form that is not, so under the offline posture — the top-level `offline` key in a configuration file, `AGGREGA_OFFLINE`, or [`--offline`](global-flags.md#--offline) — `aggrega push` refuses before it reads your entity. The refusal names which of those three set the posture, which is what a reader needs when a project's committed configuration turned it on rather than anything they typed.

`--dry-run` is the exception, and it is an exception because of what it does: it computes the bundle, prints the reference it would publish and the digest that publication would land, and never contacts the registry. That makes it the offline-safe form of publishing rather than a conflict with the posture, and it keeps working under it — with one qualification. A Recipe or FeatureRecipe whose remote `source:` is written out in full has that source fetched to compare its pin, and under the offline posture that fetch is refused in its own words, so a dry run over such an entity stops there rather than reporting a bundle it cannot vouch for.

To publish for one run from a workspace whose configuration is offline, pass `--offline=false`.

## Environment variables

The signing inputs and the destination registry can be supplied through the environment, overriding `.aggrega-config.yaml` while a flag still wins:

- `AGGREGA_IDENTITY_TOKEN` — the keyless OIDC identity token (the env counterpart of `--identity-token`). `SIGSTORE_ID_TOKEN` is honored as a sigstore-ecosystem interop alias, ranked below `AGGREGA_IDENTITY_TOKEN` and the ambient GitHub Actions endpoint. The token is never a config field.
- `AGGREGA_SIGNING_FULCIO_URL`, `AGGREGA_SIGNING_REKOR_URL`, `AGGREGA_SIGNING_TIMESTAMP_URL` — the keyless service URLs.
- `AGGREGA_SIGNING_KEY_PATH` — a path pointer to a keyed-key PEM (never key material).
- `AGGREGA_DEFAULT_REGISTRY` — the destination registry when `--registry` is omitted.

Precedence is flag > environment > config > default. See [environment-variables.md](environment-variables.md) for the full list and the precedence model.

## Authentication

`aggrega push` uses the same standard registry authentication as `aggrega pull` — Docker / Podman / Helm config files and credential helpers. Run [`aggrega login <registry>`](aggrega-login.md), which needs no other tool, or `docker login <registry>` (or `helm registry login <registry>` for Helm-specific OCI) before pushing to a private registry. See [`aggrega-pull.md`](aggrega-pull.md#authentication) for the full priority order.

## See also

- [./aggrega-sign.md](./aggrega-sign.md) — sign an already-published artifact after the fact (the post-publish counterpart of `--sign`).
- [./aggrega-lint.md](./aggrega-lint.md) — the publish gate (`--pre-publish`) that should precede a push.
- [./aggrega-pull.md](./aggrega-pull.md) — the consuming side, which resolves and pins what `push` publishes.
- [./aggrega-serve.md](./aggrega-serve.md) — the daemon carries this same publication at
  `aggrega/publishEntity`, so an editor can run it without leaving the session; it runs only when a
  request names it, and answers with the reference, the published digest — on a dry run, the digest
  `--dry-run` prints — how far the call reached, and the entries this command warns about as
  `windowsUnusableEntries`.
- [./aggrega-mcp.md](./aggrega-mcp.md) — the same capability as the `publish-entity` tool, which an
  assistant can call, answering with those entries as `windows_unusable_entries`. Read what that page
  says about allowing it before you do.
- [../../architecture/13-catalog-and-registry.md](../../architecture/13-catalog-and-registry.md) — the catalog, registry, and OCI mediatype model.

<!-- BEGIN GENERATED: cli-push -->
**Synopsis**

```
aggrega push <entity-path> [flags]
```

**Description**

```
Publish a single catalog entity to an OCI registry, where other workspaces
resolve it with "aggrega pull".

The entity is read from the path given, bundled for transport, and pushed to
<registry>/<kind>/<metadata.name>:<metadata.version>, the repository path
lowercased; a Recipe or FeatureRecipe carries its spec.capability, and a Plugin
its metadata.pluginType, as a segment between <kind> and <metadata.name>. The
tag is the entity's own metadata.version. Run "aggrega push --list-kinds" for
the kinds this binary publishes, one per line and nothing else, so a script can
read it directly. Release and Manifest are deployment-side inputs rather than
catalog artifacts and are refused.

Every kind has a directory of its own except Aggregate, Release and Manifest: an
entity of any other kind is refused when another entity sits in its directory,
before anything is pinned or bundled, and the refusal names the entity in the way.
The directory's name is not judged.

A Component, Feature, Recipe or FeatureRecipe is read the way a build reads it
before it is bundled, and one that read refuses is refused here for the same
reason: a document that fails its kind's schema, a path naming content outside
the entity's own directory, which would not travel with the entity, or a schema
a Component or Feature imports that cannot be read or used.

A Plugin is read against its kind's schema too, before its .wasm is read, so a
metadata.version that is not a semantic version is refused. Its .wasm must then
agree with the entity on what the plugin offers and on its version, and a .wasm
whose version says it was built from a working tree with uncommitted changes —
the -dirty mark a build adds — is refused. A version disagreement and a build
from uncommitted changes are both cleared by building the plugin from a clean
checkout of the commit its release tag names, never by copying the version it
reports into the entity. A development version such as 1.0.0-3-g1a2b3c4, built
from a commit, and a prerelease such as 1.0.0-rc.1 publish.

What is published is the entity document and the files the entity itself names
beside it — a Recipe's or FeatureRecipe's local source, each file an $import:
names, the entity.lock beside it, and each schema file a Component or Feature
imports — and nothing else in its directory. An entity that names nothing
publishes as its document, unchanged; one that names a file publishes as a
gzipped archive of the document and those files. A directory it names travels
with every file under it that the ignore rules recorded in its entity.lock keep:
the rules the plugin serving its capability declared, and the author's own
.aggregaignore beside it, composed when the entity was pinned. A symbolic link
among those files is refused rather than followed. A local source written as a
template names no one directory until a Release fills it in, so an entity with
one carries every such file in its own directory, and push says so.

Push warns about each file an archive carries whose path holds a part Windows
cannot hold as written: a name Windows reserves for a device — CON, PRN, AUX,
NUL, COM1 or LPT1, say, in any letter case and whatever extension follows — or a
part ending in a full stop or a space. On Windows, aggrega refuses to unpack
such a file, so a Windows workspace cannot use the version. The warning is
written to standard error on every platform, one line per file, the entity
document's own file name judged with the rest, and it refuses nothing: the push,
or its dry run, goes ahead or stops exactly as it would without it. An entity
that names nothing publishes as its document alone and is never warned about.

Each file travels with mode 0644, whatever its permission bits — the execute
bit included — in the checkout it is published from. The OCI manifest names the
digest of the published bytes, so "aggrega pull" refuses a download that does
not match it. The lockfile a pull writes records the entity by the digest of its
content — each file's path and its bytes — which is the digest a pull in the
author's own workspace records for the same entity in its catalog directory, so
a build on either side refuses content that no longer matches.

Push signs before it publishes: where signing applies, the signature is made
over the manifest digest before any bytes reach the registry, so a failed
signing refuses the push rather than leaving unsigned content published.

The manifest's creation time is pinned, so the digest depends only on what is
published and never on when. Push states when it published beside the manifest
instead, as a small published-at attachment carrying this machine's clock, in
UTC to the second — unless the signature it attached already carries a time a
transparency log attests, as a keyless signature does. So a keyed or unsigned
publication writes one, and a keyless one does not. The attachment moves no
digest and changes no tag. "aggrega registry update" records the date, with
which of the two it came from.

Push refuses to replace content already published at the same version:
publish changed content under a new version instead.

A Recipe or FeatureRecipe carries the pins for its own inputs in the entity.lock
beside it, and pinning them is a step you run before publishing: aggrega pin.
A push that does not run that step refuses an entity whose entity.lock is
missing a pin, or holds one an input no longer matches, and names the step.
Pass --pin-sources, or set pin_sources_at_push in the workspace configuration, to
have push run that same step first, so the lock it writes is part of what is
published; --pin-sources=false skips it for one run.
```

**Flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--dry-run` | `false` | Compute the bundle and print the proposed <reference>:<tag> with the digest a publication would land, without contacting the registry. An entity the publication would refuse for a missing pin is refused here too |
| `--entity` | — | Path to the entity YAML to publish (alternatively pass as the positional arg) |
| `--fulcio-url` | — | Fulcio certificate-authority URL for keyless signing. When omitted, the public-good Fulcio instance is used. |
| `--identity-token` | — | OIDC identity token for keyless signing. Optional at an interactive terminal (a browser flow acquires one) and on GitHub Actions (the workflow OIDC token is minted automatically); required for other non-interactive/CI use, where it may instead be exported as AGGREGA_IDENTITY_TOKEN or SIGSTORE_ID_TOKEN. |
| `--key` | — | Path to a held ECDSA P-256 private key PEM for offline keyed signing. When omitted, keyless signing is used. |
| `--list-kinds` | `false` | List every entity kind that can be published, then exit without publishing anything. The output is machine-readable and its shape is stable: one kind per line, in sorted order, with nothing else. |
| `--pin-sources` | `false` | Run the entity author's pin step on the entity before bundling it, so the entity.lock the step writes beside it is part of what is published, instead of refusing an entity whose lock does not record its pins. The same step as aggrega pin, writing the same bytes. It writes beside the entity, so it runs only where the entity has a writable home: a document in a directory it was read from — which a push always has, since it publishes the entity document you name. Overrides the workspace's pin_sources_at_push in both directions: --pin-sources pins for this run and --pin-sources=false does not, whatever the setting says |
| `--plugin` | — | Path to the local .wasm artifact for a Plugin entity. Required when publishing a Plugin: publish pushes the .wasm artifact, computes its content digest, and pushes the entity. |
| `--registry` | — | Destination registry host (overrides the workspace's default_registry) |
| `--rekor-url` | — | Rekor transparency-log URL for keyless signing. When omitted, the public-good Rekor instance is used. |
| `--sign` | `false` | Sign the published artifact and attach the signature as an OCI referrer. When omitted, signing follows the destination registry's policy. |
| `--timestamp-url` | — | Optional RFC3161 timestamp-authority URL for keyless signing. |
<!-- END GENERATED: cli-push -->
