# aggrega registry

Manage registries and their signature trust policy

<!-- BEGIN GENERATED: cli-registry -->
**Synopsis**

```
aggrega registry
```

**Subcommands**

| Command | Description |
| --- | --- |
| `aggrega registry add` | Register a registry and its signature trust policy in the workspace config |
| `aggrega registry list` | List configured registries and their trust posture |
| `aggrega registry remove` | Remove a registry and its trust policy from a config file |
| `aggrega registry update` | Build the local searchable index of configured registries |

**`aggrega registry add` flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--advisory` | `false` | Downgrade verification failures for this registry to warnings instead of halting |
| `--fetch-trust` | `true` | Fetch and pin the registry's advertised trust policy on first use. Use --no-fetch-trust to skip; manual --identity/--key also skip the fetch. |
| `--global` | `false` | Write the entry to the global config shared across every workspace. A registry defaults here. |
| `--identity` | `[]` | Trusted keyless identity as `identity=issuer` (repeatable; OR-set). E.g. dev@example.com=https://accounts.google.com. Overrides the fetched trust policy. |
| `--key` | — | Path to a pinned cosign-compatible public-key PEM for keyed verification. Overrides the fetched trust policy. |
| `--name` | — | Optional friendly alias for this registry. The host stays the identity; the alias resolves to it wherever a registry is named (e.g. --registry). Must be unique across registries. |
| `--require-signatures` | `false` | Require a signature on every artifact pulled from (and pushed to) this registry |
| `--trusted-root` | — | Path to a pinned Sigstore trust-root bundle for air-gapped keyless verification |
| `--workspace` | `false` | Write the entry to this project's workspace config instead of the global config. |

**`aggrega registry list` flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--output`, `-o` | `table` | Output format: table\|json. |

**`aggrega registry remove` flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--global` | `false` | Remove the entry from the global config shared across every workspace. |
| `--workspace` | `false` | Remove the entry from this project's workspace config instead of the global config. |

**`aggrega registry update` flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--upgrade` | `false` | Re-read every repository from the registry, ignoring the cached revalidation validators (picks up changes a conditional refresh would skip) |
<!-- END GENERATED: cli-registry -->
