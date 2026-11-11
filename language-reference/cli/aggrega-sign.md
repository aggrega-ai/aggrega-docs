# aggrega sign

`aggrega sign` signs one or more already-published catalog artifacts and attaches each signature as an OCI referrer. It is the post-publish counterpart of `aggrega push --sign`: use it to sign an artifact that was published unsigned, or to sign a whole batch of artifacts in one invocation. It does not add a second signature to an artifact that already carries one its registry's trust policy verifies.

## What it does

`aggrega sign` resolves the digest the registry already holds for each `<reference>`, signs that digest, and attaches the signature bundle as a referrer. It never re-pushes, re-tags, or otherwise mutates the published bytes — the artifact is immutable, and the signature is a sibling manifest pointing back at it. So an artifact can be signed after the fact with no version bump.

Before signing, it reads the signatures the reference already carries and judges them against the trust policy this workspace holds for the reference's registry — the policy `aggrega pull` verifies against. Where one verifies, whoever signed it, the reference is already signed: the command prints `Already signed:` with the reference, its digest, the signing identity and, where the transparency log recorded the signature, when — the earliest such signature where there are several — attaches nothing, and counts the reference as signed. A reader that verifies keyless signatures dates a version by the earliest of them that verifies and names that signature's signer, as [`aggrega registry update`](aggrega-registry.md#the-publication-date-each-version-records) describes, so another signature would add a referrer and a transparency-log entry and change nothing such a reader takes from the version.

A registry whose policy pins no public key and no trusted identity gives nothing to judge a signature against, so a reference there is signed whatever it already carries. A reference carrying only signatures the policy does not admit is signed, since none of them counts for a reader verifying under that policy.

The signature is a Sigstore (cosign-compatible) bundle, the same format `aggrega push --sign` attaches and `aggrega pull` verifies. The referrer names the bundle `signature.json`, so a generic OCI client pulling the referrer by its digest writes the bundle to that file.

## Batch signing

Pass several references to sign them in one invocation:

```
aggrega sign \
  hub.example.com/component/core/api-server:1.0.0 \
  hub.example.com/component/core/worker:1.0.0 \
  hub.example.com/feature/core/telemetry:2.1.0
```

Keyless signing resolves the identity **once** for the whole batch — one interactive authentication, or on GitHub Actions the runner's ambient OIDC endpoint — and reuses it across every artifact, issuing a fresh short-lived Fulcio certificate per artifact. An interactively-acquired or supplied token is reused for every signature; the ambient endpoint mints a fresh token per signature. References may target different registries: each is signed with that one identity against the Fulcio and Rekor endpoints configured for its own registry. The keyed path (`--key`) signs the batch with no authentication at all.

Signing is **continue-and-report**: every signable reference is signed, a reference that fails to resolve, sign, or attach is recorded, and the batch proceeds to the next reference rather than halting on the first failure. A reference already carrying a signature that verifies is reported as already signed and counts as signed. A reference whose existing signatures cannot be read — the registry does not complete the listing, or a signature cannot be fetched or judged while none verifies — is recorded as failed and is not signed: an unanswered question is never read as an unsigned artifact. After the batch, if any reference failed, a summary listing the failed references is printed to stderr and the command exits non-zero. References that succeeded are signed regardless of others' failures.

### Signing several references at once

By default the batch signs one reference after another. `--jobs N` signs up to N references at once, and never more than N. Each is still signed exactly as it would be alone: its published digest is resolved, it is left as it is when it already carries a signature that verifies, and otherwise it gets a signature of its own — keyless, its own ephemeral key, its own short-lived certificate and its own transparency-log entry. The identity is still resolved once, for the whole batch, before any reference is read. A value below 1 is refused, and nothing is signed.

Whatever order the references finish in, the output keeps the order they were given: each reference's lines are printed whole, once every reference named before it has finished, so the lines of two references never interleave, and the summary of failed references lists them in that order too. One consequence of signing each reference as if alone: a batch naming the same artifact twice gets two signatures when both are signed at once, because neither sees the other's signature while it is being made, whereas one after another the second finds the first's and, where its registry's trust policy verifies it, attaches nothing.

The default is 1 because keyless signing reaches the public-good certificate authority and transparency log unless your configuration names others, and those services limit how many requests they accept.

### One credential per batch

Every reference in one invocation is signed with the same credential: a single held key, or a single keyless identity. Which one a reference needs is decided by the configuration for its registry — a `signing.key_path` that applies to that registry selects the key it names, and where none applies the reference is signed keyless. When the references would need different credentials — the configuration names a key for one registry and none for another, or two different keys — the command signs nothing and names the registries on each side. It does so before any identity is asked for and before any registry is read, so nothing is attached and nobody is prompted for a run that is not going ahead.

Run one invocation per credential instead: one naming the references on the registries signed with a key, another naming the rest. A key passed with `--key` applies to every reference named, whatever the configuration says for each registry, so an invocation with `--key` is never refused for this.

The batch is refused rather than signed with whichever credential one of its references needs, because a signature cannot be recalled from anyone who has fetched it. Unlike the per-reference failures described above, this is the batch's refusal rather than one reference's: no reference is signed. Where a registry in the batch requires signatures, the message names it, so the refusal reads as one about combining the references rather than as a statement that they cannot be signed. The message, and what each part of it names, is in [References signed together need different signing credentials](../errors/fatal-halts.md#references-signed-together-need-different-signing-credentials).

### Identity-token expiry mid-batch

A long batch can outlive a short-lived identity token. On **GitHub Actions** this is a non-issue: the ambient endpoint mints a fresh token for each signature, so a batch never outlives its identity. For an **interactively-acquired or operator-supplied** token (`--identity-token`, `AGGREGA_IDENTITY_TOKEN`, or `SIGSTORE_ID_TOKEN`), one token serves the whole batch; if it expires mid-batch, the affected reference is recorded under continue-and-report and the batch proceeds. Re-run the command to sign the reported references — or, for a long scripted batch, acquire a fresh token up front.

For scripted batches, acquire the token once up front and export it, signing each reference without a browser round-trip:

```
export AGGREGA_IDENTITY_TOKEN=$(aggrega auth token)
aggrega sign hub.example.com/component/core/api-server:1.0.0
aggrega sign hub.example.com/component/core/worker:1.0.0
```

See [./aggrega-auth.md](./aggrega-auth.md) for `aggrega auth token`.

## When a step fails transiently

Each reference is signed in three steps: its published digest is resolved, the digest is signed, and the signature is attached. Two of them are retried when they fail in a way a later attempt can succeed:

- **The signing call** — on any failure a registry write is retried for, and on the keyless certificate authority reporting that it could not process the identity token.
- **The attach**, which writes the signature bundle and the referrer manifest to the registry — on a server error, a timeout or a reset connection; [`aggrega push`](aggrega-push.md#when-the-registry-fails-a-write) lists those failures. Each attempt is a new upload of the same bytes rather than a resend of the request that failed, and a repeated attach leaves one signature, not two.

Each is tried at most three times, half a second and then a second apart. Resolving the digest is a read and is not retried. A registry that asks to slow down is a different case: every request to it, the digest resolution and the attach included, waits as long as it asks, as [A registry that asks to slow down](aggrega-registry.md#a-registry-that-asks-to-slow-down) describes.

A keyless signing call asks up to three services — the certificate authority for a certificate, the transparency log for an entry and, where one is configured, the timestamp authority for a timestamp — and each request is retried on its own inside the call. A request one of them answers with `429 Too Many Requests` or a server error (for the transparency log, any but `501 Not Implemented`) is sent to that service again, so it is tried at most three times, a second and then two seconds apart; only that request is repeated, so a transparency-log entry asked for again asks for no second certificate. The transparency log is also asked again when the connection to it fails, and a `Retry-After` it sends with a `429` or a `503` is waited out for as long as it asks. A rate-limited or server-error answer still coming back after those attempts fails the signing call, which is not then retried as a whole.

A step still failing after its last attempt is recorded against that reference under continue-and-report, with its error, and the batch moves on — a failed attach is reported as the signature that could not be attached; any other failure is recorded at once.

## Signing modes

- **Keyless** (default) — an ephemeral key bound to an OIDC identity by a short-lived Fulcio certificate, recorded in the Rekor transparency log. Fulcio and Rekor default to the public-good Sigstore instances (`https://fulcio.sigstore.dev`, `https://rekor.sigstore.dev`). The keyless trusted timestamp comes from Rekor's transparency-log inclusion; a separate RFC3161 timestamp authority is **optional** — supply `--timestamp-url` with a full endpoint to enable one. At an **interactive terminal** keyless signing needs no flags: the CLI opens a browser to acquire a short-lived OIDC identity token. On **GitHub Actions** it needs none either: the CLI mints the workflow OIDC token automatically from the runner's ambient endpoint. For **other non-interactive / CI** use, export `AGGREGA_IDENTITY_TOKEN` (or `SIGSTORE_ID_TOKEN`), or pass `--identity-token`; with no supplied token, no ambient endpoint, and no terminal the command is refused.
- **Keyed** (`--key`) — an offline held ECDSA P-256 key (cosign-compatible PEM). No identity provider, certificate authority or transparency log is contacted; the registry still is, to resolve each digest and attach its signature.

The keyless URLs and the keyed key path can also come from the `.aggrega-config.yaml` `signing:` block (global and per-registry); a flag overrides the config, and the config overrides the public-good default. In that file each URL is written as an absolute `https` URL — `https://`, a host, and optionally a port and a path, such as `https://fulcio.sigstore.dev` — and a value in any other shape, one with no scheme or one beginning `http://`, is refused when the file loads, naming the file and the key. The OIDC identity token is never a config field, and the private key is never inline — only a path to it.

The construction and the sign-and-attach behaviour are shared with `aggrega push`, so both verbs sign identically.

## Environment variables

The signing inputs can be supplied through the environment, overriding the `.aggrega-config.yaml` `signing:` block while a flag still wins:

- `AGGREGA_IDENTITY_TOKEN` — the keyless OIDC identity token (the env counterpart of `--identity-token`). `SIGSTORE_ID_TOKEN` is honored as a sigstore-ecosystem interop alias, ranked below `AGGREGA_IDENTITY_TOKEN` and the ambient GitHub Actions endpoint. The token is never a config field.
- `AGGREGA_SIGNING_FULCIO_URL`, `AGGREGA_SIGNING_REKOR_URL`, `AGGREGA_SIGNING_TIMESTAMP_URL` — the keyless service URLs.
- `AGGREGA_SIGNING_KEY_PATH` — a path pointer to a keyed-key PEM (never key material).

`aggrega sign` resolves the signing config and these variables for the artifact's registry host, the same way `aggrega push` does. Precedence is flag > environment > config > default. See [environment-variables.md](environment-variables.md) for the full list.

A URL supplied through one of these variables, or through `--fulcio-url`, `--rekor-url` or `--timestamp-url`, is taken as written. The configuration file is checked before either is applied on top of it, so the `https` shape its values are held to does not reach them, and a malformed one fails only when signing contacts that service.

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

**Description**

```
Sign amends already-published artifacts by attaching a signature to each as an OCI referrer. It does not re-push, re-tag, or otherwise mutate the published bytes — the artifacts are immutable; each signature is a sibling manifest pointing back at its artifact. With --key signatures are produced offline from a held ECDSA P-256 key; without --key the keyless flow is used, which requires a live identity provider, Fulcio, and Rekor. Multiple references are signed in one invocation: the keyless identity is acquired once and reused across every artifact, and a fresh short-lived certificate is issued per artifact. Every reference in one invocation is signed with one credential: where the configuration names a held key (signing.key_path) for one reference's registry and none for another's, or two different keys, nothing is signed and the command says to run one invocation per credential; --key applies its key to every reference. A reference that already carries a signature its registry's trust policy verifies is reported as already signed, naming who signed it and when, and nothing is attached to it; a registry whose policy pins no public key or trusted identity gives nothing to judge a signature against, so a reference there is signed. Every other signable reference is signed; failures are collected and reported at the end, and the command exits non-zero if any reference failed — including one whose existing signatures could not be read, which is not signed. With --jobs N up to N references are signed at once; each is still signed exactly as it would be alone — when keyless, with its own certificate and its own transparency-log entry — and the output lists the references in the order they were given. The default, 1, signs one reference after another, because keyless signing reaches the public certificate authority and transparency log by default, and those limit how many requests they accept.
```

**Flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--fulcio-url` | — | Fulcio certificate-authority URL for keyless signing. When omitted, the public-good Fulcio instance is used. |
| `--identity-token` | — | OIDC identity token for keyless signing. Optional at an interactive terminal (a browser flow acquires one) and on GitHub Actions (the workflow OIDC token is minted automatically); required for other non-interactive/CI use, where it may instead be exported as AGGREGA_IDENTITY_TOKEN or SIGSTORE_ID_TOKEN. |
| `--jobs` | `1` | Number of references signed at once. Each is still signed exactly as it would be alone, and the output keeps the order the references were given. At least 1. |
| `--key` | — | Path to a held ECDSA P-256 private key PEM for offline keyed signing. When omitted, keyless signing is used. |
| `--rekor-url` | — | Rekor transparency-log URL for keyless signing. When omitted, the public-good Rekor instance is used. |
| `--timestamp-url` | — | Optional RFC3161 timestamp-authority URL for keyless signing. |
<!-- END GENERATED: cli-sign -->
