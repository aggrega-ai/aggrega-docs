# aggrega push

`aggrega push` publishes a catalog entity to an OCI registry, where other workspaces can resolve it with `aggrega pull`.

## What it does

`aggrega push` reads a single entity YAML, bundles it for transport, and pushes it to `<registry>/<kind>/<metadata.name>:<metadata.version>`. Run `aggrega push --list-kinds` for the entity kinds the installed binary publishes — one kind per line, sorted, and nothing else, so a script can read it directly. The set spans the catalog authoring kinds together with the Aggregate, a reusable module, and the Plugin, a content-addressed reference to a WebAssembly artifact the compiler routes and the runtime executes. The Plugin is a structural publishable artifact rather than a catalog authoring kind. Publishability is a property of the entity, not of how it is used: an Aggregate is publishable whether it is later referenced as a Release's top-level `spec.aggregate` or nested in another Aggregate's `aggregates:` block. Release and Manifest are deployment-side inputs, not catalog artifacts, and are rejected.

## Bundling

- Component, Feature, Aggregate, Plugin, and the library kinds publish as bare YAML.
- Recipe and FeatureRecipe publish as a `.tar.gz` that bundles the entity YAML together with its co-located source files — a filesystem `source:` directory, `$import:`-referenced template files, and inline `artifacts:`.

Each published file is named on the artifact's manifest, so a generic OCI client such as `oras` writes it to a file of that name: `entity.yaml` for a bare-YAML kind, `entity.tar.gz` for a Recipe or FeatureRecipe, and for a Plugin `entity.yaml` for the entity beside `entity.wasm` for its executable. The name follows from the kind, not from the file you publish from, so the same content published from a renamed file publishes the same artifact. [Catalog and Registry](../../architecture/13-catalog-and-registry.md) §6 lists every published shape and the file each lands as.

A remote `source:` URL on a Recipe (an OCI chart reference, an HTTPS chart or fragment URL, a Git module) is **preserved verbatim** in the published YAML; it is not pulled and vendored into the artifact. Consumers resolve and pin remote sources independently at their own pull time. This keeps catalog-entity distribution and source-artifact resolution as separate concerns.

An Aggregate publishes as its own single document: a sub-aggregate it references in `aggregates:` is **not** bundled into the artifact. Each sub-aggregate is a separately published Aggregate that consumers resolve and pin independently at pull time, by identity — the same separation-of-distribution principle that applies to remote sources.

### One entity per directory

The bundle is built from the **directory** the entity file sits in, so everything in that directory is published and the entity has to be found again on the way back out. A consumer finds it by the preamble it carries: the document at the top of the bundle whose `kind:` is a publishable entity kind is the entity. The file it is authored in may be called anything — `recipe.yaml` is the catalog's convention rather than a requirement — and a compose fragment, a chart template or a Kubernetes manifest sitting beside the entity is not mistaken for one, because those declare something else or no kind at all. Entity documents further down, inside a `source/` tree, are content the entity ships rather than the entity itself and are never considered.

**A push refuses an entity that shares its directory with another entity.** Every kind has a directory of its own except Aggregate, Release and Manifest, which a workspace root holds side by side. For any other kind, a push checks before it does anything else with the entity — before the pin step, the signing policy and the bundle — that no other entity document sits in the same directory, and refuses otherwise, naming each entity in the way, whether or not the push was asked to pin. [`aggrega pin`](aggrega-pin.md) refuses the same directory in the same words; the halt is [An entity shares its directory with another entity](../errors/fatal-halts.md#an-entity-shares-its-directory-with-another-entity). A document of no entity kind beside the entity — a chart file, a compose fragment, a README — is not in the way, and neither is anything in a subdirectory.

The rule is what keeps two published coordinates from carrying the same bytes: two entities authored in one directory would each publish an archive of that whole directory, and share the one `entity.lock` it has room for. It is judged only when something is produced from the directory, so a directory holding several entities still loads, lints and builds.

**The directory's name is not judged.** An entity alone in its directory publishes at its `metadata.version` wherever that directory sits; `<name>/<version>/`, the layout the standard-library catalog follows, is a convention. An artifact another client published from a directory holding two entities is still read safely: a pull of it halts naming both documents rather than answering with either, catalogued at [errors/fatal-halts.md](../errors/fatal-halts.md).

## Pinning before publishing

A Recipe or FeatureRecipe carries the pins for the inputs it reads — a remote `source:` written out in full, a file an `artifacts` entry imports — in the `entity.lock` beside it, and that file is part of the directory a push bundles. Pinning is a step you run before publishing, [`aggrega pin`](aggrega-pin.md), and commit the lock it writes.

**A push refuses an entity whose lock does not record those pins.** Before it builds the bundle, a push works out what the pin step would record for the entity and compares it with the `entity.lock` beside it. Where a pin is missing, or the lock holds one an input no longer matches, the push stops before any archive is built or any registry is contacted. The refusal names the entity and every such input — each a `remote source` or an `imported file` — and what to run: `aggrega pin` on the entity, `--pin-sources` on the push you just ran, or `pin_sources_at_push` for every push in the workspace. It is the same refusal a pull raises over the same lock, [An entity reads an input the lock beside it records no pin for](../errors/fatal-halts.md#an-entity-reads-an-input-the-lock-beside-it-records-no-pin-for), with a push's own remedies. So a Recipe or FeatureRecipe a push publishes carries, inside its bundle, a lock recording every pin the step would have recorded at the moment it was published.

Two kinds of entity have nothing to pin and publish untouched: an entity that reads no remote source and imports no file, and a Recipe whose source coordinates are filled in from a template. That source names an artifact only once a Release fills the template in, so its pin belongs in each Release's lockfile, and a push does not ask for one beside the entity. A Component, a Feature, a library, an Aggregate or a Plugin reads nothing the lock records and is never refused here.

Comparing a remote source's pin means fetching the source, as `aggrega pin` does, because a pin that no longer matches is only visible against what the source serves now. A push over an entity with such a source therefore reaches the source's host before it reaches the registry. The comparison reads a Recipe or FeatureRecipe the way the pin step does, through the catalog, so one the catalog refuses to read — a document that fails its kind's schema, say — is refused here with the catalog's own reason.

**`aggrega push --pin-sources` runs that same step for you, first.** The step runs before the bundle is built, so the lock it writes is in the published artifact and the published digest covers it; and it runs ahead of every other refusal that judges the entity, so what is judged is the entity as pinned. Only the directory rule above comes first, because the step writes the one lock the directory holds. It writes the same bytes `aggrega pin` writes, so the refusal above never fires on that run: the lock the step has just written records exactly what the refusal would compare against. The workspace key `pin_sources_at_push` makes this every push's default, and `--pin-sources=false` skips the step for one run, which brings the refusal back. The step writes beside the entity, which needs a writable home — and a push always has one, since it publishes the document you name.

**`--dry-run` answers the way the publication would.** Without `--pin-sources` it refuses an unpinned entity exactly as the publication does, so a dry run that reports a bundle is one this refusal would let through. With `--pin-sources` the step pins as a dry run: it prints the lock it would write and writes nothing, and the bundle facts that follow describe the directory as it stands, without that lock — the refusal does not fire, because the publication would have pinned first.

**Best practice: a change to a version you have already published goes into a new version, and then a pin.** Copy the entity into a new version directory, make the change there, pin it, and publish that. The half of this the product enforces is the next section: publishing different content at a version that is already published is refused. The other half — not re-pinning an already-published version after editing it in your own workspace — is yours to keep; nothing refuses it locally, because re-pinning is legitimate for an entity you have not published.

## Registry, tag, and content-addressing

The target registry is `--registry <ref>` when supplied, otherwise the workspace's `default_registry` (`hub.aggrega.ai` by default). The tag is the entity's `metadata.version`, and the repository path is derived from its kind and name, so where a published version lands does not depend on the directory it was published from.

Publish computes a content digest over the entity's authoring tree and embeds it in the OCI manifest; `aggrega pull` verifies that digest when it fetches the entity, so tampering between publish and pull is caught.

## Publishing over an existing version

Before any bytes are uploaded, `aggrega push` resolves what the target registry already holds at the reference it is about to write and compares it against the content in front of it. Three outcomes:

- **Nothing is published there yet** — the push proceeds and publishes normally.
- **The same content** — nothing is uploaded, and the command reports the version as already published, so a repeated or retried push is not an error.
- **Different content** — the push halts, naming the digest already published and the one it would have written. No flag forces it through.

A version that is already published therefore keeps denoting the bytes published under it. Content that has changed is published under a new `metadata.version`; [`aggrega lint --pre-publish`](aggrega-lint.md) answers the next question — how far that version must move — by classifying the change against the previously published version.

## Signing

`aggrega push` can sign the artifact as it publishes and attach the signature as an OCI referrer — a Sigstore (cosign-compatible) bundle on the artifact's immutable manifest digest. The signature is a sibling manifest, so signing never re-pushes or mutates the published bytes. The referrer names its bundle `signature.json`, so a generic OCI client pulling the referrer by its digest writes the bundle to that file.

Signing is **sign-before-push**: the manifest digest is known before publishing, so `aggrega push` constructs the signer and signs the digest **before any bytes reach the registry**. If the signer cannot be constructed or signing fails, the push is refused before the network call — nothing is published. This means an unsigned artifact can never leak onto a registry that requires signatures: there is no window in which content is published but unsigned.

A registry requires signatures when its per-registry `signing` block sets `required: true`; such a registry signs by default, and `--sign` requests signing explicitly. There is no flag to push unsigned content to a signature-requiring registry — that push always halts.

Two signing modes:

- **Keyless** (default) — an ephemeral key bound to an OIDC identity by a short-lived Fulcio certificate, recorded in the Rekor transparency log. Fulcio and Rekor default to the public-good Sigstore instances (`https://fulcio.sigstore.dev`, `https://rekor.sigstore.dev`). The keyless trusted timestamp comes from Rekor's transparency-log inclusion; a separate RFC3161 timestamp authority is **optional** — supply `--timestamp-url` with a full endpoint to enable one. At an **interactive terminal** keyless signing needs no flags: the CLI opens a browser to acquire a short-lived OIDC identity token. On **GitHub Actions** it needs none either: the CLI mints the workflow OIDC token automatically from the runner's ambient endpoint. For **other non-interactive / CI** use, export `AGGREGA_IDENTITY_TOKEN` (or `SIGSTORE_ID_TOKEN`), or pass `--identity-token`; with no supplied token, no ambient endpoint, and no terminal the push is refused. See [environment-variables.md](environment-variables.md) for the CI token model.
- **Keyed** (`--key`) — an offline held ECDSA P-256 key (cosign-compatible PEM), the escape hatch for environments with no OIDC identity provider. No network is contacted.

The keyless service URLs and the keyed key path can also be set in `.aggrega-config.yaml` under a `signing:` block (global and per-registry); a flag overrides the config, and the config overrides the public-good default. The OIDC identity token is never a config field (it is a short-lived secret), and the private key is never inline in config — only a path to it.

## Offline

Publishing is a network round trip and has no form that is not, so under the offline posture — the top-level `offline` key in a configuration file, `AGGREGA_OFFLINE`, or [`--offline`](global-flags.md#--offline) — `aggrega push` refuses before it reads your entity. The refusal names which of those three set the posture, which is what a reader needs when a project's committed configuration turned it on rather than anything they typed.

`--dry-run` is the exception, and it is an exception because of what it does: it computes the bundle, prints the reference it would publish, and never contacts the registry. That makes it the offline-safe form of publishing rather than a conflict with the posture, and it keeps working under it — with one qualification. A Recipe or FeatureRecipe whose remote `source:` is written out in full has that source fetched to compare its pin, and under the offline posture that fetch is refused in its own words, so a dry run over such an entity stops there rather than reporting a bundle it cannot vouch for.

To publish for one run from a workspace whose configuration is offline, pass `--offline=false`.

## Environment variables

The signing inputs and the destination registry can be supplied through the environment, overriding `.aggrega-config.yaml` while a flag still wins:

- `AGGREGA_IDENTITY_TOKEN` — the keyless OIDC identity token (the env counterpart of `--identity-token`). `SIGSTORE_ID_TOKEN` is honored as a sigstore-ecosystem interop alias, ranked below `AGGREGA_IDENTITY_TOKEN` and the ambient GitHub Actions endpoint. The token is never a config field.
- `AGGREGA_SIGNING_FULCIO_URL`, `AGGREGA_SIGNING_REKOR_URL`, `AGGREGA_SIGNING_TIMESTAMP_URL` — the keyless service URLs.
- `AGGREGA_SIGNING_KEY_PATH` — a path pointer to a keyed-key PEM (never key material).
- `AGGREGA_DEFAULT_REGISTRY` — the destination registry when `--registry` is omitted.

Precedence is flag > environment > config > default. See [environment-variables.md](environment-variables.md) for the full list and the precedence model.

## Authentication

`aggrega push` uses the same standard registry authentication as `aggrega pull` — Docker / Podman / Helm config files and credential helpers. Run `docker login <registry>` (or `helm registry login <registry>` for Helm-specific OCI) before pushing to a private registry. See [`aggrega-pull.md`](aggrega-pull.md#authentication) for the full priority order.

## See also

- [./aggrega-sign.md](./aggrega-sign.md) — sign an already-published artifact after the fact (the post-publish counterpart of `--sign`).
- [./aggrega-lint.md](./aggrega-lint.md) — the publish gate (`--pre-publish`) that should precede a push.
- [./aggrega-pull.md](./aggrega-pull.md) — the consuming side, which resolves and pins what `push` publishes.
- [./aggrega-serve.md](./aggrega-serve.md) — the daemon carries this same publication at
  `aggrega/publishEntity`, so an editor can run it without leaving the session; it runs only when a
  request names it, and answers with the reference, the published digest and how far the call reached.
- [./aggrega-mcp.md](./aggrega-mcp.md) — the same capability as the `publish-entity` tool, which an
  assistant can call. Read what that page says about allowing it before you do.
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
<registry>/<kind>/<metadata.name>:<metadata.version>. The tag is the entity's
own metadata.version. Run "aggrega push --list-kinds" for the kinds this binary
publishes, one per line and nothing else, so a script can read it directly.
Release and Manifest are deployment-side inputs rather than catalog artifacts
and are refused.

Every kind has a directory of its own except Aggregate, Release and Manifest: an
entity of any other kind is refused when another entity sits in its directory,
before anything is pinned or bundled, and the refusal names the entity in the way.
The directory's name is not judged.

A content digest is computed over the entity's authoring tree and embedded in
the OCI manifest, so "aggrega pull" can detect tampering between publish and
pull.

Push signs before it publishes: where signing applies, the signature is made
over the manifest digest before any bytes reach the registry, so a failed
signing refuses the push rather than leaving unsigned content published.

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
| `--dry-run` | `false` | Compute the bundle and print the proposed <reference>:<tag> without contacting the registry. An entity the publication would refuse for a missing pin is refused here too |
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
