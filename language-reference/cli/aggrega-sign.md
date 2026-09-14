# aggrega sign

`aggrega sign` signs one or more already-published catalog artifacts and attaches each signature as an OCI referrer. It is the post-publish counterpart of `aggrega push --sign`: use it to sign an artifact that was published unsigned, to add a signature from a different identity, or to sign a whole batch of artifacts in one invocation.

## What it does

`aggrega sign` resolves the digest the registry already holds for each `<reference>`, signs that digest, and attaches the signature bundle as a referrer. It never re-pushes, re-tags, or otherwise mutates the published bytes — the artifact is immutable, and the signature is a sibling manifest pointing back at it. So an artifact can be signed after the fact with no version bump.

The signature is a Sigstore (cosign-compatible) bundle, the same format `aggrega push --sign` attaches and `aggrega pull` verifies.

## Batch signing

Pass several references to sign them in one invocation:

```
aggrega sign \
  hub.example.com/component/core/api-server:1.0.0 \
  hub.example.com/component/core/worker:1.0.0 \
  hub.example.com/feature/core/telemetry:2.1.0
```

Keyless signing resolves the identity **once** for the whole batch — one interactive authentication, or on GitHub Actions the runner's ambient OIDC endpoint — and reuses it across every artifact, issuing a fresh short-lived Fulcio certificate per artifact. An interactively-acquired or supplied token is reused for every signature; the ambient endpoint mints a fresh token per signature. References may target different registries; the per-registry signing endpoints are resolved independently, but the identity is resolved a single time. The keyed path (`--key`) signs the batch with no authentication at all.

Signing is **continue-and-report**: every signable reference is signed, a reference that fails to resolve, sign, or attach is recorded, and the batch proceeds to the next reference rather than halting on the first failure. After the batch, if any reference failed, a summary listing the failed references is printed to stderr and the command exits non-zero. References that succeeded are signed regardless of others' failures.

### Identity-token expiry mid-batch

A long batch can outlive a short-lived identity token. On **GitHub Actions** this is a non-issue: the ambient endpoint mints a fresh token for each signature, so a batch never outlives its identity. For an **interactively-acquired or operator-supplied** token (`--identity-token`, `AGGREGA_IDENTITY_TOKEN`, or `SIGSTORE_ID_TOKEN`), one token serves the whole batch; if it expires mid-batch, the affected reference is recorded under continue-and-report and the batch proceeds. Re-run the command to sign the reported references — or, for a long scripted batch, acquire a fresh token up front.

For scripted batches, acquire the token once up front and export it, signing each reference without a browser round-trip:

```
export AGGREGA_IDENTITY_TOKEN=$(aggrega auth token)
aggrega sign hub.example.com/component/core/api-server:1.0.0
aggrega sign hub.example.com/component/core/worker:1.0.0
```

See [./aggrega-auth.md](./aggrega-auth.md) for `aggrega auth token`.

## Signing modes

- **Keyless** (default) — an ephemeral key bound to an OIDC identity by a short-lived Fulcio certificate, recorded in the Rekor transparency log. Fulcio and Rekor default to the public-good Sigstore instances (`https://fulcio.sigstore.dev`, `https://rekor.sigstore.dev`). The keyless trusted timestamp comes from Rekor's transparency-log inclusion; a separate RFC3161 timestamp authority is **optional** — supply `--timestamp-url` with a full endpoint to enable one. At an **interactive terminal** keyless signing needs no flags: the CLI opens a browser to acquire a short-lived OIDC identity token. On **GitHub Actions** it needs none either: the CLI mints the workflow OIDC token automatically from the runner's ambient endpoint. For **other non-interactive / CI** use, export `AGGREGA_IDENTITY_TOKEN` (or `SIGSTORE_ID_TOKEN`), or pass `--identity-token`; with no supplied token, no ambient endpoint, and no terminal the command is refused.
- **Keyed** (`--key`) — an offline held ECDSA P-256 key (cosign-compatible PEM). No network is contacted.

The keyless URLs and the keyed key path can also come from the `.aggrega-config.yaml` `signing:` block (global and per-registry); a flag overrides the config, and the config overrides the public-good default. The OIDC identity token is never a config field, and the private key is never inline — only a path to it.

The construction and the sign-and-attach behaviour are shared with `aggrega push`, so both verbs sign identically.

## Environment variables

The signing inputs can be supplied through the environment, overriding the `.aggrega-config.yaml` `signing:` block while a flag still wins:

- `AGGREGA_IDENTITY_TOKEN` — the keyless OIDC identity token (the env counterpart of `--identity-token`). `SIGSTORE_ID_TOKEN` is honored as a sigstore-ecosystem interop alias, ranked below `AGGREGA_IDENTITY_TOKEN` and the ambient GitHub Actions endpoint. The token is never a config field.
- `AGGREGA_SIGNING_FULCIO_URL`, `AGGREGA_SIGNING_REKOR_URL`, `AGGREGA_SIGNING_TIMESTAMP_URL` — the keyless service URLs.
- `AGGREGA_SIGNING_KEY_PATH` — a path pointer to a keyed-key PEM (never key material).

`aggrega sign` resolves the signing config and these variables for the artifact's registry host, the same way `aggrega push` does. Precedence is flag > environment > config > default. See [environment-variables.md](environment-variables.md) for the full list.

## See also

- [./aggrega-auth.md](./aggrega-auth.md) — acquire an OIDC identity token once for a batch of keyless signs.
- [./aggrega-push.md](./aggrega-push.md) — publish, optionally signing at push time (sign-before-push).
- [./aggrega-pull.md](./aggrega-pull.md) — the consuming side, which verifies signatures against the per-registry trust policy.
- [./aggrega-serve.md](./aggrega-serve.md) — the daemon carries the same batch at
  `aggrega/signArtifacts`, resolving its identity from the request or the environment and refusing
  rather than prompting; a request there names no key, so keyed signing reads the workspace's own
  `signing:` block.
- [./aggrega-mcp.md](./aggrega-mcp.md) — the same capability as the `sign-artifacts` tool, which an
  assistant can call, and which accepts `key_path`. Read what that page says about allowing it before
  you do.

<!-- BEGIN GENERATED: cli-sign -->
**Synopsis**

```
aggrega sign <reference>... [flags]
```

**Flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--fulcio-url` | — | Fulcio certificate-authority URL for keyless signing. When omitted, the public-good Fulcio instance is used. |
| `--identity-token` | — | OIDC identity token for keyless signing. Optional at an interactive terminal (a browser flow acquires one) and on GitHub Actions (the workflow OIDC token is minted automatically); required for other non-interactive/CI use, where it may instead be exported as AGGREGA_IDENTITY_TOKEN or SIGSTORE_ID_TOKEN. |
| `--key` | — | Path to a held ECDSA P-256 private key PEM for offline keyed signing. When omitted, keyless signing is used. |
| `--rekor-url` | — | Rekor transparency-log URL for keyless signing. When omitted, the public-good Rekor instance is used. |
| `--timestamp-url` | — | Optional RFC3161 timestamp-authority URL for keyless signing. |
<!-- END GENERATED: cli-sign -->
