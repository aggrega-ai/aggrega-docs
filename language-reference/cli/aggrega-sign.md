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

- **Keyless** (default) — an ephemeral key bound to an OIDC identity by a short-lived Fulcio certificate, recorded in the Rekor transparency log. The service URLs default to the public-good Sigstore instances; supply `--identity-token` (or let it read the ambient OIDC environment) for the identity.
- **Keyed** (`--key`) — an offline held ECDSA P-256 key (cosign-compatible PEM). No network is contacted.

The keyless URLs and the keyed key path can also come from the `.aggrega-config.yaml` `signing:` block (global and per-registry); a flag overrides the config, and the config overrides the public-good default. The OIDC identity token is never a config field, and the private key is never inline — only a path to it.

The construction and the sign-and-attach behaviour are shared with `aggrega push`, so both verbs sign identically.

## Flags

- `<reference>` — the published artifact reference to sign (e.g. `hub.example.com/component/core/api-server:1.0.0`).
- `--key <pem>` — path to a held ECDSA P-256 private-key PEM for offline keyed signing. When omitted, keyless signing is used.
- `--identity-token <token>` — OIDC identity token for keyless signing (or read from the ambient OIDC environment).
- `--fulcio-url <url>` — Fulcio certificate-authority URL for keyless signing. Defaults to the public-good Fulcio instance.
- `--rekor-url <url>` — Rekor transparency-log URL for keyless signing. Defaults to the public-good Rekor instance.
- `--timestamp-url <url>` — RFC3161 timestamp-authority URL for keyless signing. Defaults to the public-good timestamp authority.

## See also

- [./aggrega-push.md](./aggrega-push.md) — publish, optionally signing at push time (sign-before-push).
- [./aggrega-pull.md](./aggrega-pull.md) — the consuming side, which verifies signatures against the per-registry trust policy.
