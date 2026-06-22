# aggrega sign

`aggrega sign` signs an already-published catalog artifact and attaches the signature as an OCI referrer. It is the post-publish counterpart of `aggrega push --sign`: use it to sign an artifact that was published unsigned, or to add a signature from a different identity.

## Synopsis

```
aggrega sign <reference> [--key <pem>] [--identity-token <token>]
              [--fulcio-url <url>] [--rekor-url <url>] [--timestamp-url <url>]
```

## What it does

`aggrega sign` resolves the digest the registry already holds for `<reference>`, signs that digest, and attaches the signature bundle as a referrer. It never re-pushes, re-tags, or otherwise mutates the published bytes — the artifact is immutable, and the signature is a sibling manifest pointing back at it. So an artifact can be signed after the fact with no version bump.

The signature is a Sigstore (cosign-compatible) bundle, the same format `aggrega push --sign` attaches and `aggrega pull` verifies.

## Signing modes

- **Keyless** (default) — an ephemeral key bound to an OIDC identity by a short-lived Fulcio certificate, recorded in the Rekor transparency log. The service URLs default to the public-good Sigstore instances (`https://fulcio.sigstore.dev`, `https://rekor.sigstore.dev`, `https://timestamp.sigstore.dev`). At an **interactive terminal** keyless signing needs no flags: the CLI opens a browser to acquire a short-lived OIDC identity token. For **non-interactive / CI** use, export `AGGREGA_IDENTITY_TOKEN` (or `SIGSTORE_ID_TOKEN`), or pass `--identity-token`; with no token and no terminal the command is refused.
- **Keyed** (`--key`) — an offline held ECDSA P-256 key (cosign-compatible PEM). No network is contacted.

The keyless URLs and the keyed key path can also come from the `.aggrega-config.yaml` `signing:` block (global and per-registry); a flag overrides the config, and the config overrides the public-good default. The OIDC identity token is never a config field, and the private key is never inline — only a path to it.

The construction and the sign-and-attach behaviour are shared with `aggrega push`, so both verbs sign identically.

## Flags

- `<reference>` — the published artifact reference to sign (e.g. `hub.example.com/component/core/api-server:1.0.0`).
- `--key <pem>` — path to a held ECDSA P-256 private-key PEM for offline keyed signing. When omitted, keyless signing is used.
- `--identity-token <token>` — OIDC identity token for keyless signing. Optional at an interactive terminal (the CLI acquires one through a browser flow); required for non-interactive / CI use, where it may instead be exported as `AGGREGA_IDENTITY_TOKEN` or `SIGSTORE_ID_TOKEN`.
- `--fulcio-url <url>` — Fulcio certificate-authority URL for keyless signing. Defaults to the public-good Fulcio instance (`https://fulcio.sigstore.dev`).
- `--rekor-url <url>` — Rekor transparency-log URL for keyless signing. Defaults to the public-good Rekor instance (`https://rekor.sigstore.dev`).
- `--timestamp-url <url>` — RFC3161 timestamp-authority URL for keyless signing. Defaults to the public-good timestamp authority (`https://timestamp.sigstore.dev`).

## Environment variables

The signing inputs can be supplied through the environment, overriding the `.aggrega-config.yaml` `signing:` block while a flag still wins:

- `AGGREGA_IDENTITY_TOKEN` — the keyless OIDC identity token (the env counterpart of `--identity-token`). `SIGSTORE_ID_TOKEN` is honored as a sigstore-ecosystem interop alias, after `AGGREGA_IDENTITY_TOKEN`. The token is never a config field.
- `AGGREGA_SIGNING_FULCIO_URL`, `AGGREGA_SIGNING_REKOR_URL`, `AGGREGA_SIGNING_TIMESTAMP_URL` — the keyless service URLs.
- `AGGREGA_SIGNING_KEY_PATH` — a path pointer to a keyed-key PEM (never key material).

`aggrega sign` resolves the signing config and these variables for the artifact's registry host, the same way `aggrega push` does. Precedence is flag > environment > config > default. See [environment-variables.md](environment-variables.md) for the full list.

## See also

- [./aggrega-push.md](./aggrega-push.md) — publish, optionally signing at push time (sign-before-push).
- [./aggrega-pull.md](./aggrega-pull.md) — the consuming side, which verifies signatures against the per-registry trust policy.
