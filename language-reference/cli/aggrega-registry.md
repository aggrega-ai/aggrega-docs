# aggrega registry

Manage registries and their signature trust policy

<!-- BEGIN GENERATED: cli-registry -->
**Synopsis**

```
aggrega registry
```

**Description**

```
Manage the OCI registries Aggrega publishes to and resolves from, together with
the signature trust policy for each.

A registry entry records where to reach the registry and what to require of the
signatures on artifacts it serves — which identities are trusted, and whether a
signature is required at all. That policy is what "aggrega pull" enforces when
it verifies an artifact and what "aggrega push" honours when it decides whether
to sign.

"aggrega registry add" can fetch a registry's own advertised trust policy rather
than having you write it out. "aggrega registry update" builds the local
searchable index that "aggrega search" and "aggrega plugin add" read.

A registry entry is written to the global config shared across every workspace
on this machine, because a registry and the identities you trust on it are
usually the same wherever you work. That makes adding or removing one a
machine-wide change: every project on this machine resolves through the entry
you just wrote or dropped. Pass --workspace to write it to this project's config
file instead. Building the searchable index is the exception — that lands in
this workspace's own artifact cache and reaches no other project.
```

**Subcommands**

| Command | Description |
| --- | --- |
| `aggrega registry add` | Register a registry and its signature trust policy |
| `aggrega registry list` | List configured registries and their trust posture |
| `aggrega registry remove` | Remove a registry and its trust policy from a config file |
| `aggrega registry update` | Build the local searchable index of configured registries |

**`aggrega registry add` description**

```
Register a registry host and its signature trust policy.

The entry is keyed under the host exactly as written, and every lookup of it is
made in one spelling: a lowercase host name containing a dot, localhost, a single
name followed by a port (registry:5000), an IPv4 address, or an IPv6 address in
brackets, each with an optional :port. A reference may be given instead — its
scheme, path and credentials are dropped and the entry is keyed under the host it
names — but a host written in capitals, with the default HTTPS port, or as a
single name with no port is refused, naming the spelling to write where there is
one.

The entry is written to the global config shared across every workspace, since a
registry and the identities you trust on it are usually the same wherever you
work. Pass --workspace to write it to this project's config file instead; the two
flags are mutually exclusive.

By default the registry's advertised trust policy is fetched once from the
registry's own origin (https://<host>/.well-known/aggrega-trust) and pinned
locally — trust-on-first-use. Verification at pull time always runs against the
pinned local policy, never a live re-fetch. Pass --fetch-trust=false to skip the
fetch and pin only what the flags supply.

A trust policy can also be set by hand: keyless (one or more --identity entries,
each an "identity=issuer" pair) or keyed (--key pointing at a pinned public-key
PEM). Manual --identity / --key flags OVERRIDE the fetched set — when either is
supplied, the fetch is skipped and the policy is built from the flags alone.
Pass --trusted-root to pin a Sigstore trust-root bundle for air-gapped keyless
verification. Adding the official hub host with no policy flags pins the built-in
official baseline.

When the registry advertises no trust policy (a 404 or an unreachable endpoint),
the add does not fail: it writes the policy from the flags (or an empty policy)
and prints a notice suggesting manual --identity / --key pinning.

Existing settings in the target config file are preserved.
```

**`aggrega registry add` flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--advisory` | `false` | Downgrade verification failures for this registry to warnings instead of halting |
| `--fetch-trust` | `true` | Fetch and pin the registry's advertised trust policy on first use. Use --fetch-trust=false to skip; manual --identity/--key also skip the fetch. |
| `--global` | `false` | Write the entry to the global config shared across every workspace. A registry defaults here. |
| `--identity` | `[]` | Trusted keyless identity as `identity=issuer` (repeatable; OR-set). E.g. dev@example.com=https://accounts.google.com. Overrides the fetched trust policy. |
| `--key` | — | Path to a pinned cosign-compatible public-key PEM for keyed verification. Overrides the fetched trust policy. |
| `--name` | — | Optional friendly alias for this registry. The host stays the identity; the alias resolves to it wherever a registry is named (e.g. --registry). Must be unique across registries. |
| `--require-signatures` | `false` | Require a signature on every artifact pulled from (and pushed to) this registry |
| `--trusted-root` | — | Path to a pinned Sigstore trust-root bundle for air-gapped keyless verification |
| `--workspace` | `false` | Write the entry to this project's workspace config instead of the global config. |

**`aggrega registry list` description**

```
List every registry configured in the effective merged config, one per line,
with its friendly alias (if any), a short trust-posture summary, and a marker on
the default registry.

This reads the resolved configuration and never contacts a registry. Registries
are listed in ascending host order.

With -o json the same set is emitted as one structured document per registry:
its host, its alias, whether it is the default, its trust posture as discrete
fields rather than the table's rendered sentence, and whether a credential for
that host is present in the shared credential store. The credential state reports
presence only — a credential is never read out, measured, or shown in any form,
and whether the registry would accept it is not asked, since that would take a
network round trip. Reading it consults the local credential store, which honors
a configured credential helper. The order is the same ascending host order the
table uses.
```

**`aggrega registry list` flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--output`, `-o` | `table` | Output format: table\|json. |

**`aggrega registry remove` description**

```
Remove a registry's trust-policy entry from a config file, addressed by its host
or its friendly alias.

By default the entry is removed from the global config shared across every
workspace; pass --workspace to remove it from this project's workspace config
instead. Setting both --global and --workspace is a usage error.

The default_registry pointer is left untouched — removing a registry's trust
policy reverts that host to default trust; it does not change which registry is
the default. Where default_registry names the removed entry by its alias, that
alias names nothing afterwards, and the configuration is refused until
default_registry is written as a host or as another entry's name.
```

**`aggrega registry remove` flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--global` | `false` | Remove the entry from the global config shared across every workspace. |
| `--workspace` | `false` | Remove the entry from this project's workspace config instead of the global config. |

**`aggrega registry update` description**

```
Walk each configured registry's repositories, read the latest published version
of each, and write a deterministic local searchable index to the artifact cache.

With no argument, every configured registry is indexed. With a single registry
argument (a host or a friendly alias), only that registry is indexed.

This is the one registry command that reaches the network. The index it writes
lands in this workspace's own artifact cache, so refreshing it changes nothing
another project on this machine resolves through. Credentials are read from a
supplied or ambient source and never asked for: a registry that needs one you do
not have fails with a message naming what it wanted.

For each repository the highest strict-SemVer version is selected (pre-release
versions are skipped) and its catalog facets — kind, description, category,
labels, and, for plugins, socket type and capabilities — are recorded from the
published manifest. A repository with no conforming version is skipped; a
repository that cannot be read is skipped with a note, so one unreadable
repository does not abandon the whole index.

A registry whose repository listing repeats itself — naming a repository it has
already named, or answering two pages in a row with no repository while still
pointing to a next page — is not followed round again. That registry is reported
as not indexed, with a message naming it and saying its repository listing
repeated itself; the other registries are still indexed, and the command exits
non-zero.

A registry that is not indexed keeps the index it had before the run, unchanged:
nothing is written for a registry whose walk failed, whose listing repeated
itself, or that was being walked when the command was interrupted. Registries
indexed earlier in the same run keep what this run wrote for them.

Every strict-SemVer version a recorded repository publishes is listed too, each
with the manifest digest its tag resolves to — the address of the exact bytes
published under that version. Where the registry's trust policy pins a public key
or trusted identities, and verification is not switched off, each version's own
signature is verified against that policy and the signer is recorded when one
verifies; a version with no signature, or none that verifies, is recorded with no
signer. Only manifests and signature attachments are read: no entity's content is
fetched. 'aggrega search -o json' reports these under each record's 'published'
field.

The per-repository records are byte-identical across two runs against the same
registry state; the freshness timestamp is written to a sibling file so it never
disturbs the records.

A refresh revalidates each repository conditionally: it re-resolves the selected
version's manifest digest and reuses the cached record untouched when the tag set
and digest are unchanged, so an unchanged registry costs a round of cheap digest
resolves rather than a full re-read of every repository's manifest and referrers.
Use --upgrade to ignore the cached validators and re-read every repository — this
picks up a change a conditional refresh skips, such as a deprecation marker or a
signature added to an existing version whose digest did not change, or an older
version published again under its existing tag while the selected one stayed the
same.

Each published version's deprecation markers are read as the walk goes, and the ones
whose own signature verifies are recorded into the index. Every marker met is
reported, whether or not it was recorded, and each registry reports how many markers
its index now records — including when that number is zero. Where signature
verification is disabled for a registry, the walk reports that its markers were not
examined rather than a count, so a registry that published nothing is never confused
with one this run had no basis to judge.
```

**`aggrega registry update` flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--upgrade` | `false` | Re-read every repository from the registry, ignoring what is already cached (picks up changes a conditional refresh would skip) |
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

## Offline

`aggrega registry update` is the one command in this group that reaches the network, and
under the offline posture — the top-level `offline` key in a configuration file,
`AGGREGA_OFFLINE`, or [`--offline`](global-flags.md#--offline) — it refuses before it
walks anything. The refusal names which of the three set the posture.

There is no partial form to fall back on, because the index records what each registry
currently serves and that cannot be learned without asking one. What an offline workspace
*can* do is read the index it already has: `aggrega search` and the deprecation notice on
`aggrega inspect` both read the local snapshot and need no network at all, so a refresh is
the only thing the posture takes away. To refresh for one run from an offline workspace,
pass `--offline=false`.

The other commands in this group — `add`, `list`, `remove` — change or read local
configuration and are unaffected.
