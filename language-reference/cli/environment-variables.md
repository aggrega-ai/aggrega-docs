# Environment Variables

The `aggrega` CLI reads a fixed set of `AGGREGA_`-prefixed environment variables. Each one overrides the corresponding `.aggrega-config.yaml` setting at runtime — the layer a CI job or secret-injecting orchestrator controls without editing tracked files — while a command-line flag still wins over everything.

## Precedence

Every configurable setting resolves through one layered ladder:

```
CLI flag  >  environment variable  >  .aggrega-config.yaml  >  built-in default
```

- A **flag** is the most explicit, per-invocation signal and always wins.
- An **environment variable** sits above the committed config file (a runtime override) and below the flag (an explicit command-line value is never silently overridden by the ambient environment).
- The **`.aggrega-config.yaml` cascade** is below the environment, and the **built-in default** is the base.

A variable that is unset (or empty) falls through to the layer below — it never overwrites a configured value with a blank. When the CLI applies an environment override, it reports it alongside the loaded config files so the effective configuration is always visible.

## Naming

A variable name is `AGGREGA_` followed by its config path upper-snake-cased (dots become underscores): `signing.fulcio_url` becomes `AGGREGA_SIGNING_FULCIO_URL`. One name is shortened for ergonomics — `workspace.catalog_dirs` binds to `AGGREGA_CATALOG_DIRS`, paralleling `PATH`.

Per-registry settings (`registries[].*`) have **no** environment variable: a list of per-host policy blocks does not express as a single variable, and a registry's trust and signing policy is committed configuration, not an ambient override. Situational, one-shot, and positional flags (`--dry-run`, `--trace`, `--detail`, `--json`, `--skip-verify`, `--release`, `--entity`, and the `lint --allow-*/--enforce-*` family) also have no environment variable — they are per-run decisions.

## Config-backed settings

| Variable | Config path | Notes |
| --- | --- | --- |
| `AGGREGA_DEFAULT_REGISTRY` | `default_registry` | Destination/registry host (`hub.aggrega.ai` by default). |
| `AGGREGA_OFFLINE` | `offline` | Boolean. Never contacts the network; builds against the existing lockfile. |
| `AGGREGA_AUTO_PULL` | `auto_pull` | Boolean. Auto-fetch missing dependencies at build time. |
| `AGGREGA_ARTIFACT_CACHE_DIR` | `artifact_cache_dir` | On-disk content cache directory. |
| `AGGREGA_CATALOG_DIRS` | `workspace.catalog_dirs` | OS-path-list separated (`:` on Unix). Supply absolute paths. Replaces the configured list. |
| `AGGREGA_SIGNING_FULCIO_URL` | `signing.fulcio_url` | Keyless Fulcio CA URL. |
| `AGGREGA_SIGNING_REKOR_URL` | `signing.rekor_url` | Keyless Rekor transparency-log URL. |
| `AGGREGA_SIGNING_TIMESTAMP_URL` | `signing.timestamp_url` | Keyless RFC3161 timestamp-authority URL. |
| `AGGREGA_SIGNING_KEY_PATH` | `signing.key_path` | Path to a held ECDSA P-256 key PEM for keyed signing. A path pointer only — never key material. |
| `AGGREGA_SKIP_SIGNATURE_VERIFICATION` | `skip_signature_verification` | Boolean. Globally disables signature verification — loud: every pull logs a warning. |
| `AGGREGA_WORKSPACE_ROOT` | (pairs with `--workspace-root`) | Absolute workspace root, skipping discovery. Not a config field; the flag wins when set. |

`AGGREGA_CONFIG` points at an explicit global config file to load beneath the workspace cascade; it selects which file applies rather than overriding a single setting. When it is unset, the global layer loads automatically from the XDG default location (`~/.config/aggrega/config.yaml`). See [global-flags.md](global-flags.md#global-config-file).

### Booleans

A boolean variable accepts `true`, `false`, `1`, or `0` (case-insensitive). Any other non-empty value is a loud error rather than a silent guess — unlike YAML, `yes`/`no`/`on`/`off` are not accepted.

## Secrets

Secrets are supplied by environment variable or flag and are **never** config fields.

| Variable | Purpose | Precedence |
| --- | --- | --- |
| `AGGREGA_IDENTITY_TOKEN` | Keyless OIDC identity token. | `--identity-token` flag > `AGGREGA_IDENTITY_TOKEN` > `SIGSTORE_ID_TOKEN`. |
| `AGGREGA_REGISTRY_PASSWORD` | Registry password for non-interactive `aggrega login`. | `--password-stdin` > `AGGREGA_REGISTRY_PASSWORD` > interactive prompt. |

`SIGSTORE_ID_TOKEN` is honored as a sigstore-ecosystem interop alias for the identity token, after `AGGREGA_IDENTITY_TOKEN`. It is the variable the broader sigstore tooling already sets.

The identity-token variables are the **non-interactive** keyless path: at an interactive terminal `aggrega push --sign` and `aggrega sign` acquire a short-lived token through a browser flow with no flags, but a CI job or other non-interactive run has no terminal and must supply the token explicitly (export it, or pass `--identity-token`). With neither a token nor a terminal, keyless signing is refused rather than left to hang.

### CI guidance (GitHub Actions)

GitHub Actions can mint a workflow OIDC token and export it for keyless signing in a few lines:

```yaml
permissions:
  id-token: write   # allow the job to mint a workflow OIDC token
# ...
- run: |
    AGGREGA_IDENTITY_TOKEN=$(curl -s -H "Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" \
      "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=sigstore" | jq -r .value)
    export AGGREGA_IDENTITY_TOKEN
    aggrega push <entity> --sign
```

Automatic CI-provider detection across multiple CI platforms is not yet available, so the token is exported explicitly as shown.

For an **interactive** batch the counterpart is `aggrega auth token`, which runs the browser OIDC flow once and prints the identity token to stdout so it can be exported the same way:

```bash
export AGGREGA_IDENTITY_TOKEN=$(aggrega auth token)
```

See [aggrega-auth.md](aggrega-auth.md). Either path lets a batch of `aggrega sign` invocations reuse one identity with no per-artifact browser round-trip.

**Prefer `--password-stdin` over `AGGREGA_REGISTRY_PASSWORD`.** An environment variable is readable by child processes and may persist in a shell; stdin is the more secure path for the password. The environment variable exists as a CI convenience.

## See also

- [global-flags.md](global-flags.md) — `--workspace-root` and `AGGREGA_CONFIG`.
- [aggrega-push.md](aggrega-push.md) and [aggrega-sign.md](aggrega-sign.md) — signing variables and the identity-token alias.
- [aggrega-auth.md](aggrega-auth.md) — `aggrega auth token` for acquiring the identity token interactively.
- [aggrega-pull.md](aggrega-pull.md) and [aggrega-build.md](aggrega-build.md) — offline, auto-pull, catalog-dir, and cache variables.
- [../../architecture/13-catalog-and-registry.md](../../architecture/13-catalog-and-registry.md) — the `.aggrega-config.yaml` model these variables override.
