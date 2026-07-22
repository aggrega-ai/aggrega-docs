# aggrega push

`aggrega push` publishes a catalog entity to an OCI registry, where other workspaces can resolve it with `aggrega pull`.

## Synopsis

```
aggrega push <entity-path> [--registry <ref>] [--dry-run]
              [--sign] [--key <pem>] [--identity-token <token>]
              [--fulcio-url <url>] [--rekor-url <url>] [--timestamp-url <url>]
```

## What it does

`aggrega push` reads a single entity YAML, bundles it for transport, and pushes it to `<registry>/<kind>/<metadata.name>:<metadata.version>`. The publishable kinds are the six catalog kinds — Component, Feature, Recipe, FeatureRecipe, SchemaLibrary, and MappingLibrary — plus the Aggregate, a reusable module, and the Plugin, a content-addressed reference to a WebAssembly artifact the compiler routes and the runtime executes. The Plugin is a structural publishable artifact rather than a catalog authoring kind. Publishability is a property of the entity, not of how it is used: an Aggregate is publishable whether it is later referenced as a Release's top-level `spec.aggregate` or nested in another Aggregate's `aggregates:` block. Release and Manifest are deployment-side inputs, not catalog artifacts, and are rejected.

## Bundling

- Component, Feature, Aggregate, SchemaLibrary, MappingLibrary, and Plugin publish as bare YAML.
- Recipe and FeatureRecipe publish as a `.tar.gz` that bundles the entity YAML together with its co-located source files — a filesystem `source:` directory, `$import:`-referenced template files, and inline `artifacts:`.

A remote `source:` URL on a Recipe (an OCI chart reference, an HTTPS chart or fragment URL, a Git module) is **preserved verbatim** in the published YAML; it is not pulled and vendored into the artifact. Consumers resolve and pin remote sources independently at their own pull time. This keeps catalog-entity distribution and source-artifact resolution as separate concerns.

An Aggregate publishes as its own single document: a sub-aggregate it references in `aggregates:` is **not** bundled into the artifact. Each sub-aggregate is a separately published Aggregate that consumers resolve and pin independently at pull time, by identity — the same separation-of-distribution principle that applies to remote sources.

## Registry, tag, and content-addressing

The target registry is `--registry <ref>` when supplied, otherwise the workspace's `default_registry` (`hub.aggrega.ai` by default). The tag is the entity's `metadata.version`. Libraries are enforced into a per-version subdirectory so a published version always lands at a predictable path.

Publish computes a content digest over the entity's authoring tree and embeds it in the OCI manifest; `aggrega pull` verifies that digest when it fetches the entity, so tampering between publish and pull is caught.

## Signing

`aggrega push` can sign the artifact as it publishes and attach the signature as an OCI referrer — a Sigstore (cosign-compatible) bundle on the artifact's immutable manifest digest. The signature is a sibling manifest, so signing never re-pushes or mutates the published bytes.

Signing is **sign-before-push**: the manifest digest is known before publishing, so `aggrega push` constructs the signer and signs the digest **before any bytes reach the registry**. If the signer cannot be constructed or signing fails, the push is refused before the network call — nothing is published. This means an unsigned artifact can never leak onto a registry that requires signatures: there is no window in which content is published but unsigned.

A registry requires signatures when its per-registry `signing` block sets `required: true`; such a registry signs by default, and `--sign` requests signing explicitly. There is no flag to push unsigned content to a signature-requiring registry — that push always halts.

Two signing modes:

- **Keyless** (default) — an ephemeral key bound to an OIDC identity by a short-lived Fulcio certificate, recorded in the Rekor transparency log. Fulcio and Rekor default to the public-good Sigstore instances (`https://fulcio.sigstore.dev`, `https://rekor.sigstore.dev`). The keyless trusted timestamp comes from Rekor's transparency-log inclusion; a separate RFC3161 timestamp authority is **optional** — supply `--timestamp-url` with a full endpoint to enable one. At an **interactive terminal** keyless signing needs no flags: the CLI opens a browser to acquire a short-lived OIDC identity token. On **GitHub Actions** it needs none either: the CLI mints the workflow OIDC token automatically from the runner's ambient endpoint. For **other non-interactive / CI** use, export `AGGREGA_IDENTITY_TOKEN` (or `SIGSTORE_ID_TOKEN`), or pass `--identity-token`; with no supplied token, no ambient endpoint, and no terminal the push is refused. See [environment-variables.md](environment-variables.md) for the CI token model.
- **Keyed** (`--key`) — an offline held ECDSA P-256 key (cosign-compatible PEM), the escape hatch for environments with no OIDC identity provider. No network is contacted.

The keyless service URLs and the keyed key path can also be set in `.aggrega-config.yaml` under a `signing:` block (global and per-registry); a flag overrides the config, and the config overrides the public-good default. The OIDC identity token is never a config field (it is a short-lived secret), and the private key is never inline in config — only a path to it.

## Flags

- `<entity-path>` — the entity YAML to publish.
- `--registry <ref>` — override the workspace's default registry for this push.
- `--dry-run` — report what would be pushed without contacting the registry.
- `--sign` — sign the artifact and attach the signature as a referrer. When omitted, signing follows the destination registry's policy.
- `--key <pem>` — path to a held ECDSA P-256 private-key PEM for offline keyed signing. When omitted, keyless signing is used.
- `--identity-token <token>` — OIDC identity token for keyless signing. Optional at an interactive terminal (the CLI acquires one through a browser flow) and on GitHub Actions (the workflow OIDC token is minted automatically); required for other non-interactive / CI use, where it may instead be exported as `AGGREGA_IDENTITY_TOKEN` or `SIGSTORE_ID_TOKEN`.
- `--fulcio-url <url>` — Fulcio certificate-authority URL for keyless signing. Defaults to the public-good Fulcio instance (`https://fulcio.sigstore.dev`).
- `--rekor-url <url>` — Rekor transparency-log URL for keyless signing. Defaults to the public-good Rekor instance (`https://rekor.sigstore.dev`).
- `--timestamp-url <url>` — optional RFC3161 timestamp-authority URL for keyless signing. None by default: the keyless trusted timestamp comes from Rekor's transparency-log inclusion. Supply a full endpoint to additionally stamp the signature with an RFC3161 timestamp authority.

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
- [../../architecture/13-catalog-and-registry.md](../../architecture/13-catalog-and-registry.md) — the catalog, registry, and OCI mediatype model.

<!-- BEGIN GENERATED: cli-push -->
**Synopsis**

```
aggrega push <entity-path> [flags]
```

**Flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--dry-run` | `false` | Compute the bundle and print the proposed <reference>:<tag>; skip the network call |
| `--entity` | — | Path to the entity YAML to publish (alternatively pass as the positional arg) |
| `--fulcio-url` | — | Fulcio certificate-authority URL for keyless signing. When omitted, the public-good Fulcio instance is used. |
| `--identity-token` | — | OIDC identity token for keyless signing. Optional at an interactive terminal (a browser flow acquires one) and on GitHub Actions (the workflow OIDC token is minted automatically); required for other non-interactive/CI use, where it may instead be exported as AGGREGA_IDENTITY_TOKEN or SIGSTORE_ID_TOKEN. |
| `--key` | — | Path to a held ECDSA P-256 private key PEM for offline keyed signing. When omitted, keyless signing is used. |
| `--plugin` | — | Path to the local .wasm artifact for a Plugin entity. Required when publishing a Plugin: publish pushes the .wasm artifact, computes its content digest, and pushes the entity. |
| `--registry` | — | Destination registry host (overrides the workspace's default_registry) |
| `--rekor-url` | — | Rekor transparency-log URL for keyless signing. When omitted, the public-good Rekor instance is used. |
| `--sign` | `false` | Sign the published artifact and attach the signature as an OCI referrer. When omitted, signing follows the destination registry's policy. |
| `--timestamp-url` | — | Optional RFC3161 timestamp-authority URL for keyless signing. |
<!-- END GENERATED: cli-push -->
