# aggrega login

Authenticate to an OCI registry and store the credential

<!-- BEGIN GENERATED: cli-login -->
**Synopsis**

```
aggrega login <registry> [flags]
```

**Description**

```
Store a username/password credential for a registry so subsequent push, pull, and lint --pre-publish authenticate transparently. The credential is written to the shared OCI credential store (the same store those commands read), honoring a configured credential helper or OS keychain when present. No external login tool is required.
```

**Flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--password-stdin` | `false` | Read the password from stdin (requires --username; for non-interactive use) |
| `--skip-verify` | `false` | Store the credential without first verifying it against the registry |
| `--username`, `-u` | — | Registry username (prompted if omitted) |
<!-- END GENERATED: cli-login -->
