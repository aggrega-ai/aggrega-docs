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

## What `registry update` reports about deprecation markers

While it walks a registry, `aggrega registry update` reads each published version's
deprecation markers and records the ones it can authenticate into the local index.
It reports the outcome of that scan on every path, so a registry that published no
marker is distinguishable from a run that did not look for one.

Each marker the walk meets produces one line naming the repository, the version, and
the severity the publisher recorded — `warning`, `error` or `retracted` — together
with whether the marker was recorded. A marker is recorded only when its own
signature verifies against the signers the registry's trust policy honors. One that
is present but unreadable, or present but not honored, is reported as such and left
out of the index rather than recorded on evidence that could not be authenticated.

Each registry then reports how many markers its index now records, including when
that number is zero. Where signature verification is switched off — globally, or for
that one registry — the walk reports instead that markers were not examined for it.
The two are different facts: the first says the registry published nothing this
workspace can act on, the second says this run had no trust basis on which to judge a
marker at all. A registry whose markers were not examined contributes no withdrawal
to version selection, so an author who attached a marker and sees that line knows why
it has no effect.

## What a routine refresh does not pick up

A refresh revalidates each repository before deciding to re-read it: where the tag
listing and the selected version's manifest digest are both unchanged, the cached
record is reused as it stands, and that repository's published versions are not
re-examined for markers.

A deprecation marker moves neither of those. It is attached to the published artifact
as a separate signed object pointing back at it — which is exactly what lets a
publisher deprecate a version without re-publishing it — so attaching one adds no tag
and leaves the artifact's own manifest untouched. **A marker attached to a version
whose repository is otherwise unchanged is therefore not picked up by a routine
refresh**, and the count that run reports is the count the reused records already
carried rather than a fresh one.

Pass `--upgrade` to re-read every repository and pick it up. This matters beyond the
report: the version exclusion and `aggrega inspect` both read this index, so a version
retracted since your last full re-read is neither excluded from selection nor shown.
