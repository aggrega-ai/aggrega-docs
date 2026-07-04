# aggrega deprecate

Attach a signed deprecation marker to an already-published artifact

<!-- BEGIN GENERATED: cli-deprecate -->
**Synopsis**

```
aggrega deprecate <reference> [flags]
```

**Flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--fulcio-url` | — | Fulcio certificate-authority URL for keyless signing. |
| `--identity-token` | — | OIDC identity token for keyless signing. Optional at an interactive terminal (a browser flow acquires one); required for non-interactive/CI use, where it may instead be exported as AGGREGA_IDENTITY_TOKEN or SIGSTORE_ID_TOKEN. |
| `--key` | — | Path to a held ECDSA P-256 private key PEM for offline keyed signing. When omitted, keyless signing is used. |
| `--message` | — | Human-readable deprecation message, e.g. a migration pointer. Required. |
| `--rekor-url` | — | Rekor transparency-log URL for keyless signing. |
| `--severity` | — | Deprecation severity: one of warning, error, retracted. Required. |
| `--timestamp-url` | — | Optional RFC3161 timestamp-authority URL for keyless signing. |
<!-- END GENERATED: cli-deprecate -->
