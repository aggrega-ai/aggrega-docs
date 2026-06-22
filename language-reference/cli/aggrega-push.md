# aggrega push

`aggrega push` publishes a catalog entity to an OCI registry, where other workspaces can resolve it with `aggrega pull`.

## Synopsis

```
aggrega push <entity-path> [--registry <ref>] [--dry-run]
              [--sign] [--key <pem>] [--identity-token <token>]
              [--fulcio-url <url>] [--rekor-url <url>] [--timestamp-url <url>]
```

## What it does

`aggrega push` reads a single entity YAML, bundles it for transport, and pushes it to `<registry>/<kind>/<metadata.name>:<metadata.version>`. The publishable kinds are the seven catalog kinds — Component, Feature, Recipe, FeatureRecipe, Provider, SchemaLibrary, and MappingLibrary — plus the Aggregate, which is a reusable module. Publishability is a property of the entity, not of how it is used: an Aggregate is publishable whether it is later referenced as a Release's top-level `spec.aggregate` or nested in another Aggregate's `aggregates:` block. Release and Manifest are deployment-side inputs, not catalog artifacts, and are rejected.

## Bundling

- Component, Feature, Provider, Aggregate, SchemaLibrary, and MappingLibrary publish as bare YAML.
- Recipe and FeatureRecipe publish as a `.tar.gz` that bundles the entity YAML together with its co-located source files — a filesystem `source:` directory, `$import:`-referenced template files, and inline `artifacts:`.

A remote `source:` URL on a Recipe (an OCI chart reference, an HTTPS chart or fragment URL, a Git module) is **preserved verbatim** in the published YAML; it is not pulled and vendored into the artifact. Consumers resolve and pin remote sources independently at their own pull time. This keeps catalog-entity distribution and source-artifact resolution as separate concerns.

An Aggregate publishes as its own single document: a sub-aggregate it references in `aggregates:` is **not** bundled into the artifact. Each sub-aggregate is a separately published Aggregate that consumers resolve and pin independently at pull time, by identity — the same separation-of-distribution principle that applies to remote sources.

## Registry, tag, and content-addressing

The target registry is `--registry <ref>` when supplied, otherwise the workspace's `default_registry` (`hub.aggrega.ai` by default). The tag is the entity's `metadata.version`. Libraries are enforced into a per-version subdirectory so a published version always lands at a predictable path.

Publish computes a content digest over the entity's authoring tree and embeds it in the OCI manifest; `aggrega pull` verifies that digest when it fetches the entity, so tampering between publish and pull is caught.

## Signing

`aggrega push` can sign the artifact as it publishes and attach the signature as an OCI referrer — a Sigstore (cosign-compatible) bundle on the artifact's immutable manifest digest. The signature is a sibling manifest, so signing never re-pushes or mutates the published bytes.

Signing is **sign-before-push**: the manifest digest is known before publishing, so `aggrega push` constructs the signer and signs the digest **before any bytes reach the registry**. If the signer cannot be constructed or signing fails, the push is refused before the network call — nothing is published. This means an unsigned artifact can never leak onto a registry that requires signatures: there is no window in which content is published but unsigned.

A registry that requires signatures (its `requires_signatures` policy) signs by default; `--sign` requests signing explicitly. There is no flag to push unsigned content to a signature-requiring registry — that push always halts.

Two signing modes:

- **Keyless** (default) — an ephemeral key bound to an OIDC identity by a short-lived Fulcio certificate, recorded in the Rekor transparency log. The service URLs default to the public-good Sigstore instances (`https://fulcio.sigstore.dev`, `https://rekor.sigstore.dev`, `https://timestamp.sigstore.dev`). The identity token is required: supply it with `--identity-token`. Automatic OIDC-token acquisition is not yet available.
- **Keyed** (`--key`) — an offline held ECDSA P-256 key (cosign-compatible PEM), the escape hatch for environments with no OIDC identity provider. No network is contacted.

The keyless service URLs and the keyed key path can also be set in `.aggrega-config.yaml` under a `signing:` block (global and per-registry); a flag overrides the config, and the config overrides the public-good default. The OIDC identity token is never a config field (it is a short-lived secret), and the private key is never inline in config — only a path to it.

## Flags

- `<entity-path>` — the entity YAML to publish.
- `--registry <ref>` — override the workspace's default registry for this push.
- `--dry-run` — report what would be pushed without contacting the registry.
- `--sign` — sign the artifact and attach the signature as a referrer. When omitted, signing follows the destination registry's policy.
- `--key <pem>` — path to a held ECDSA P-256 private-key PEM for offline keyed signing. When omitted, keyless signing is used.
- `--identity-token <token>` — OIDC identity token for keyless signing. Required for keyless signing; automatic OIDC-token acquisition is not yet available.
- `--fulcio-url <url>` — Fulcio certificate-authority URL for keyless signing. Defaults to the public-good Fulcio instance (`https://fulcio.sigstore.dev`).
- `--rekor-url <url>` — Rekor transparency-log URL for keyless signing. Defaults to the public-good Rekor instance (`https://rekor.sigstore.dev`).
- `--timestamp-url <url>` — RFC3161 timestamp-authority URL for keyless signing. Defaults to the public-good timestamp authority (`https://timestamp.sigstore.dev`).

## Authentication

`aggrega push` uses the same standard registry authentication as `aggrega pull` — Docker / Podman / Helm config files and credential helpers. Run `docker login <registry>` (or `helm registry login <registry>` for Helm-specific OCI) before pushing to a private registry. See [`aggrega-pull.md`](aggrega-pull.md#authentication) for the full priority order.

## See also

- [./aggrega-sign.md](./aggrega-sign.md) — sign an already-published artifact after the fact (the post-publish counterpart of `--sign`).
- [./aggrega-lint.md](./aggrega-lint.md) — the publish gate (`--pre-publish`) that should precede a push.
- [./aggrega-pull.md](./aggrega-pull.md) — the consuming side, which resolves and pins what `push` publishes.
- [../../architecture/13-catalog-and-registry.md](../../architecture/13-catalog-and-registry.md) — the catalog, registry, and OCI mediatype model.
