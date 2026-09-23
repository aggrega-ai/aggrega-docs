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

### One entity per version directory

The bundle is built from the **directory** the entity file sits in, so everything in that directory is published and the entity has to be found again on the way back out. A consumer finds it by the preamble it carries: the document at the top of the bundle whose `kind:` is a publishable entity kind is the entity. The file it is authored in may be called anything — `recipe.yaml` is the catalog's convention rather than a requirement — and a compose fragment, a chart template or a Kubernetes manifest sitting beside the entity is not mistaken for one, because those declare something else or no kind at all. Entity documents further down, inside a `source/` tree, are content the entity ships rather than the entity itself and are never considered.

**What follows is a layout obligation on the publisher: a version directory holds one entity.** Two entities authored side by side in one version directory each publish an artifact built from that whole directory, so their two published coordinates carry *the same bytes*. Nothing about the publish reports it — each push succeeds and reports its own reference — and a consumer asking for either one would otherwise receive whichever entity was picked. Rather than answer with the wrong entity, a pull of such an artifact halts, naming both documents; the halt is catalogued at [errors/fatal-halts.md](../errors/fatal-halts.md). Give each entity its own `<name>/<version>/` directory, which is the layout the standard-library catalog already follows.

## Registry, tag, and content-addressing

The target registry is `--registry <ref>` when supplied, otherwise the workspace's `default_registry` (`hub.aggrega.ai` by default). The tag is the entity's `metadata.version`. Libraries are enforced into a per-version subdirectory so a published version always lands at a predictable path.

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

`--dry-run` is the exception, and it is an exception because of what it does: it computes the bundle, prints the reference it would publish, and makes no call. That makes it the offline-safe form of publishing rather than a conflict with the posture, and it keeps working under it.

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

A content digest is computed over the entity's authoring tree and embedded in
the OCI manifest, so "aggrega pull" can detect tampering between publish and
pull.

Push signs before it publishes: where signing applies, the signature is made
over the manifest digest before any bytes reach the registry, so a failed
signing refuses the push rather than leaving unsigned content published.

Push refuses to replace content already published at the same version:
publish changed content under a new version instead.
```

**Flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--dry-run` | `false` | Compute the bundle and print the proposed <reference>:<tag>; skip the network call |
| `--entity` | — | Path to the entity YAML to publish (alternatively pass as the positional arg) |
| `--fulcio-url` | — | Fulcio certificate-authority URL for keyless signing. When omitted, the public-good Fulcio instance is used. |
| `--identity-token` | — | OIDC identity token for keyless signing. Optional at an interactive terminal (a browser flow acquires one) and on GitHub Actions (the workflow OIDC token is minted automatically); required for other non-interactive/CI use, where it may instead be exported as AGGREGA_IDENTITY_TOKEN or SIGSTORE_ID_TOKEN. |
| `--key` | — | Path to a held ECDSA P-256 private key PEM for offline keyed signing. When omitted, keyless signing is used. |
| `--list-kinds` | `false` | List every entity kind that can be published, then exit without publishing anything. The output is machine-readable and its shape is stable: one kind per line, in sorted order, with nothing else. |
| `--plugin` | — | Path to the local .wasm artifact for a Plugin entity. Required when publishing a Plugin: publish pushes the .wasm artifact, computes its content digest, and pushes the entity. |
| `--registry` | — | Destination registry host (overrides the workspace's default_registry) |
| `--rekor-url` | — | Rekor transparency-log URL for keyless signing. When omitted, the public-good Rekor instance is used. |
| `--sign` | `false` | Sign the published artifact and attach the signature as an OCI referrer. When omitted, signing follows the destination registry's policy. |
| `--timestamp-url` | — | Optional RFC3161 timestamp-authority URL for keyless signing. |
<!-- END GENERATED: cli-push -->
