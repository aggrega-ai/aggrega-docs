# Environment Variables

The `aggrega` CLI reads a fixed set of `AGGREGA_`-prefixed environment variables. Each one overrides the corresponding `.aggrega-config.yaml` setting at runtime — the layer a CI job or secret-injecting orchestrator controls without editing tracked files — while a command-line flag still wins over everything.

## Precedence

An environment variable sits **above the committed configuration files** — a runtime override a pipeline or a secret-injecting orchestrator applies without editing a tracked file — and **below a command-line flag**, so an explicit value typed on the command line is never silently overridden by the ambient environment. [Configuration](configuration.md#what-overrides-what) carries the full ladder and the layering of the files beneath.

A variable that is unset (or empty) falls through to the layer below — it never overwrites a configured value with a blank. To see the configuration that applies right now, and which layer decided each setting, run [`aggrega config show --origin`](aggrega-config.md).

## Naming

A variable name is `AGGREGA_` followed by its config path upper-snake-cased (dots become underscores): `signing.fulcio_url` becomes `AGGREGA_SIGNING_FULCIO_URL`. One name is shortened for ergonomics — `workspace.catalog_dirs` binds to `AGGREGA_CATALOG_DIRS`, paralleling `PATH`.

Per-registry settings (`registries[].*`) have **no** environment variable: a list of per-host policy blocks does not express as a single variable, and a registry's trust and signing policy is committed configuration, not an ambient override. Situational, one-shot, and positional flags (`--dry-run`, `--trace`, `--detail`, `--output`, `--skip-verify`, `--release`, `--entity`, and the `lint --allow-*/--enforce-*` family) also have no environment variable — they are per-run decisions.

## Config-backed settings

| Variable | Config path | Notes |
| --- | --- | --- |
| `AGGREGA_DEFAULT_REGISTRY` | `default_registry` | Destination/registry host (`hub.aggrega.ai` by default). Written the way `default_registry` is written in a file — see [how a registry host is written](configuration.md#how-a-registry-host-is-written) — and a value that is not is refused when the configuration resolves, naming this variable. |
| `AGGREGA_OFFLINE` | `offline` | Boolean. Forbids all network egress: every command that would fetch, pull, acquire, push, sign, or contact a registry refuses loudly instead of dialing, and a build runs only against the existing lockfile and cache. Discovery then reads the local index — the deprecation advisory is served from the built index rather than probed live, and the unknown-command install hint and the remote-registry catalog-resolution tier are skipped. Verification of already-cached or pinned material still runs — offline forbids the fetch, not the local check. [`--offline`](global-flags.md#--offline) is the flag above it, in both directions: it sets the posture for one run, and `--offline=false` allows the network for one run where this variable or a configuration file has set it. |
| `AGGREGA_AUTO_PULL` | `auto_pull` | Boolean. Auto-fetch missing dependencies at build time. |
| `AGGREGA_ARTIFACT_CACHE_DIR` | `artifact_cache_dir` | On-disk content cache directory, written relative to the workspace root so it names the same directory wherever the command runs. An absolute value is refused, as is one naming the workspace root itself — give the cache its own subdirectory. |
| `AGGREGA_CATALOG_DIRS` | `workspace.catalog_dirs` | OS-path-list separated (`:` on Unix). Supply absolute paths. Replaces the configured list; a Release given its own list under `workspace.releases` keeps that list. |
| `AGGREGA_SIGNING_FULCIO_URL` | `signing.fulcio_url` | Keyless Fulcio CA URL. |
| `AGGREGA_SIGNING_REKOR_URL` | `signing.rekor_url` | Keyless Rekor transparency-log URL. |
| `AGGREGA_SIGNING_TIMESTAMP_URL` | `signing.timestamp_url` | Keyless RFC3161 timestamp-authority URL. |
| `AGGREGA_SIGNING_KEY_PATH` | `signing.key_path` | Path to a held ECDSA P-256 key PEM for keyed signing. A path pointer only — never key material. |
| `AGGREGA_SKIP_SIGNATURE_VERIFICATION` | `skip_signature_verification` | Boolean. Globally disables signature verification — loud: every pull logs a warning. |
| `AGGREGA_WORKSPACE_ROOT` | (pairs with `--workspace-root`) | Absolute workspace root, skipping discovery. Not a config field; the flag wins when set. |

`AGGREGA_CONFIG` points at an explicit global config file to load beneath the project's own files; it selects which file applies rather than overriding a single setting. When it is unset, that layer loads automatically from the platform's default location — on Windows `aggrega\config.yaml` inside the directory the `APPDATA` environment variable names, and elsewhere `aggrega/config.yaml` inside the directory `XDG_CONFIG_HOME` names, falling back to `~/.config/aggrega/config.yaml`. See [Configuration](configuration.md#naming-the-global-file-explicitly).

### Where the machine's own files are

The global configuration file and the machine-wide caches sit where each platform keeps a user's own files, so `aggrega` also reads the variables that name those places. None of them is an `AGGREGA_` variable and none overrides a setting: each says where a file is looked for when nothing names it.

| Variable | Read on | What it places |
| --- | --- | --- |
| `APPDATA` | Windows | The global configuration file, at `aggrega\config.yaml` inside the directory `APPDATA` names. |
| `LOCALAPPDATA` | Windows | The machine-wide caches, under `aggrega\cache` inside the directory `LOCALAPPDATA` names. |
| `XDG_CONFIG_HOME`, then `HOME` | Linux, macOS and the other Unix systems | The global configuration file, at `aggrega/config.yaml` inside the directory `XDG_CONFIG_HOME` names, or at `~/.config/aggrega/config.yaml` when `XDG_CONFIG_HOME` is unset. |
| `XDG_CACHE_HOME`, then `HOME` | Linux and the other Unix systems | The machine-wide caches, under an `aggrega` directory inside the one `XDG_CACHE_HOME` names, or under `~/.cache/aggrega` when `XDG_CACHE_HOME` is unset. An `XDG_CACHE_HOME` that is not an absolute path places no cache, and compiled plugins are then kept only for the run. |
| `HOME` | macOS | The machine-wide caches, under `~/Library/Caches/aggrega`. |

`AGGREGA_CONFIG`, or `--config`, names the global file outright on every platform and wins over these. A project's own caches are placed by none of them: they sit inside the project, under `artifact_cache_dir`. [`aggrega config init`](aggrega-config.md#config-init--seed-a-working-configuration) says where both the global file and the machine-wide caches are on the machine it runs on.

### Booleans

A boolean variable accepts `true`, `false`, `1`, or `0` (case-insensitive). Any other non-empty value is a loud error rather than a silent guess — unlike YAML, `yes`/`no`/`on`/`off` are not accepted.

## Secrets

Secrets are supplied by environment variable or flag and are **never** config fields.

| Variable | Purpose | Precedence |
| --- | --- | --- |
| `AGGREGA_IDENTITY_TOKEN` | Keyless OIDC identity token. | `--identity-token` flag > `AGGREGA_IDENTITY_TOKEN` > ambient GitHub Actions OIDC > `SIGSTORE_ID_TOKEN`. |
| `AGGREGA_REGISTRY_PASSWORD` | Registry password for non-interactive `aggrega login`. | `--password-stdin` > `AGGREGA_REGISTRY_PASSWORD` > interactive prompt. |

`SIGSTORE_ID_TOKEN` is honored as a sigstore-ecosystem interop alias for the identity token, ranked below `AGGREGA_IDENTITY_TOKEN` and the ambient GitHub Actions endpoint. It is the variable the broader sigstore tooling already sets.

The same identity resolution serves all three signing verbs — `aggrega push --sign`, `aggrega sign`, and `aggrega deprecate`. At an interactive terminal each acquires a short-lived token through a browser flow with no flags. On GitHub Actions each mints a fresh workflow OIDC token automatically from the runner's ambient endpoint, so no token export is needed. Any other non-interactive run has no terminal and no ambient endpoint, so it must supply the token explicitly (export `AGGREGA_IDENTITY_TOKEN`, or pass `--identity-token`). With no supplied token, no ambient endpoint, and no terminal, keyless signing is refused rather than left to hang.

### CI guidance (GitHub Actions)

On GitHub Actions the CLI detects the runner's ambient OIDC endpoint and mints a fresh workflow token for each signature automatically. Grant the job permission to mint a token and sign with no token export:

```yaml
permissions:
  id-token: write   # allow the job to mint a workflow OIDC token
# ...
- run: aggrega push <entity> --sign
```

The same holds for `aggrega sign` and `aggrega deprecate`. To pin a specific identity instead of the automatically-minted one, export `AGGREGA_IDENTITY_TOKEN` explicitly; an explicit token (or `--identity-token`) always wins over the ambient endpoint:

```yaml
- run: |
    AGGREGA_IDENTITY_TOKEN=$(curl -s -H "Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" \
      "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=sigstore" | jq -r .value)
    export AGGREGA_IDENTITY_TOKEN
    aggrega push <entity> --sign
```

CI that is not GitHub Actions has no ambient endpoint: export `AGGREGA_IDENTITY_TOKEN` from that provider's OIDC mechanism, or pass `--identity-token`.

For an **interactive** batch the counterpart is `aggrega auth token`, which runs the browser OIDC flow once and prints the identity token to stdout so it can be exported the same way:

```bash
export AGGREGA_IDENTITY_TOKEN=$(aggrega auth token)
```

See [aggrega-auth.md](aggrega-auth.md). Either path lets a batch of `aggrega sign` invocations reuse one identity with no per-artifact browser round-trip.

**Prefer `--password-stdin` over `AGGREGA_REGISTRY_PASSWORD`.** An environment variable is readable by child processes and may persist in a shell; stdin is the more secure path for the password. The environment variable exists as a CI convenience.

## See also

- [configuration.md](configuration.md) — which file a setting belongs in, and the full precedence model these variables sit inside.
- [global-flags.md](global-flags.md) — `--workspace-root` and `AGGREGA_CONFIG`.
- [aggrega-push.md](aggrega-push.md) and [aggrega-sign.md](aggrega-sign.md) — signing variables and the identity-token alias.
- [aggrega-auth.md](aggrega-auth.md) — `aggrega auth token` for acquiring the identity token interactively.
- [aggrega-pull.md](aggrega-pull.md) and [aggrega-build.md](aggrega-build.md) — offline, auto-pull, catalog-dir, and cache variables.
- [../../architecture/13-catalog-and-registry.md](../../architecture/13-catalog-and-registry.md) — the registry and signing settings several of these variables override.
