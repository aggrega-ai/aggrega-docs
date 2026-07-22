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
| `--from` | — | Batch file (YAML, or JSON as a subset) whose top-level list attaches one marker per entry. Each entry carries reference and severity and reason, plus optional replacement and message. Mutually exclusive with a positional reference. |
| `--fulcio-url` | — | Fulcio certificate-authority URL for keyless signing. |
| `--identity-token` | — | OIDC identity token for keyless signing. Optional at an interactive terminal (a browser flow acquires one) and on GitHub Actions (the workflow OIDC token is minted automatically); required for other non-interactive/CI use, where it may instead be exported as AGGREGA_IDENTITY_TOKEN or SIGSTORE_ID_TOKEN. |
| `--key` | — | Path to a held ECDSA P-256 private key PEM for offline keyed signing. When omitted, keyless signing is used. |
| `--message` | — | Optional legacy message retained for audit and for the recorded build-time diagnostic; defaults to --reason when unset. |
| `--reason` | — | Human-readable reason for the deprecation — why it is deprecated and what to do instead. Required unless --from or an interactive prompt supplies it. |
| `--rekor-url` | — | Rekor transparency-log URL for keyless signing. |
| `--replacement` | — | Optional artifact reference that replaces the deprecated one. |
| `--severity` | — | Deprecation severity: one of warning, error, retracted. Required unless --from or an interactive prompt supplies it. |
| `--timestamp-url` | — | Optional RFC3161 timestamp-authority URL for keyless signing. |
<!-- END GENERATED: cli-deprecate -->
