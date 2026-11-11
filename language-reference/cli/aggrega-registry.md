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
and prints a notice suggesting manual --identity / --key pinning. The official
hub writes its built-in baseline instead, and the notice says the baseline was
pinned.

When the workspace is offline the advertised policy cannot be fetched, so the
registry is never asked. Adding a registry other than the official hub is then
refused unless --identity or --key supplies the policy, rather than writing an
entry that trusts nothing: register it once while online, or pin it by hand.
Adding the official hub offline pins its built-in baseline, with a notice saying
so, and a manual policy registers offline exactly as it does online.

Existing settings in the target config file are preserved.
```

**`aggrega registry add` flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--advisory` | `false` | Downgrade verification failures for this registry to warnings instead of halting |
| `--fetch-trust` | `true` | Fetch and pin the registry's advertised trust policy on first use. Use --fetch-trust=false to skip; manual --identity/--key also skip the fetch. |
| `--global` | `false` | Write the entry to the global config shared across every workspace. A registry defaults here. |
| `--identity` | `[]` | Trusted keyless identity as `identity=issuer`, for example dev@example.com=https://accounts.google.com (repeatable; OR-set). Overrides the fetched trust policy. |
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

A registry that asks the walk to slow down — a 429 answer, or a 503 that says
how long to wait (Retry-After) — is left alone for as long as it asks, or ten
seconds where it does not say, and the walk reads fewer of its repositories at
once until it answers again, then returns to its usual pace; on a terminal the
wait is shown beside that registry's row. A registry that answers nothing but
"slow down" for five minutes is not indexed: it keeps the index it had before
the run, and the command names it, its last answer and how long it waited.

A read the registry fails or drops in passing — a 5xx answer, a connection
reset or timed out, an answer cut short — is asked again a few times, with a
growing wait between attempts. A repository with a read still
failing after that is not recorded from this run: it keeps the record the index
already holds for it, where that record was judged under the trust policy now in
force, and is otherwise left out of the index; either way it is named as a
repository that could not be read, as the walk goes and again in the closing
summary under its registry's row, with the kind of the read's last failure — the
status the registry answered, a timeout, a reset, an answer cut short — and the
read that failed. So a version is never recorded unsigned,
undated or without its deprecation marker because a read failed, with or without
--upgrade. Each registry's row in the closing summary also says how many reads
were asked again, whether or not they then succeeded — a read sent again after
the registry asked the walk to slow down among them — and says zero when none
was.

Every signature a registry's walk verifies against the public Sigstore trust root
is verified against the same copy of that root, fetched once for the walk rather
than once per signature; a registry whose trust policy pins a trust root of its
own is verified against that file.

A registry whose repository listing repeats itself — naming a repository it has
already named, or answering two pages in a row with no repository while still
pointing to a next page — is not followed round again. That registry is reported
as not indexed, with a message naming it and saying its repository listing
repeated itself; the other registries are still indexed, and the command exits
non-zero.

A registry that is not indexed keeps the index it had before the run, unchanged:
nothing is written for a registry whose walk failed, whose listing repeated
itself, or that was being walked when the command was interrupted. Registries
indexed earlier in the same run keep what this run wrote for them. A registry's
new index is written aside and put in place whole, so a command stopped while
writing one leaves that registry with a complete index — the one it had before
the run, or the new one — or with none, never with a partial one.

Every strict-SemVer version a recorded repository publishes is listed too, each
with the manifest digest its tag resolves to — the address of the exact bytes
published under that version. Where the registry's trust policy pins a public key
or trusted identities, and verification is not switched off, each version's own
signatures are verified against that policy and the signer is recorded when one
verifies; a version with no signature, or none that verifies, is recorded with no
signer. Where several verify, the signer recorded is the one the transparency log
recorded earliest, whatever order the registry lists them in, so signing a version
again never changes its recorded signer.

Each version's publication date is recorded too, with its source. Where one of the
version's keyless signatures verified, the date is the time the transparency log
recorded that earliest signature, as the verified log entry attests it (source
'transparency-log') — so signing a version again never moves its date. Otherwise
it is the date the publication itself stated beside what it published (source
'publisher'), the earliest where several are stated: the publishing machine's own
clock, which nothing attests, read from any registry whatever its trust policy.
A version with neither — published without stating a date, and not signed
keyless in a way this policy verifies — is recorded with no date.

Only manifests, signature attachments and publication-date attachments are read:
no entity's content is fetched. 'aggrega search -o json' reports these under each
record's 'published' field.

The per-repository records are byte-identical across two runs against the same
registry state; the freshness timestamp is written to a sibling file so it never
disturbs the records.

A refresh reads again only what changed, and finds every change a full re-read
would. For each repository it revalidates the tag listing with a conditional
request, resolves every version's tag to its manifest digest, and revalidates every
version's attachments — its signatures, publication-date statements and deprecation
markers — with one conditional request, plus one for the signatures of a
deprecation marker it judged before. A version whose digest or attachments changed
is read again in full, and its signatures and markers are verified again exactly as
a full re-read verifies them; everything else is kept as recorded. A change to this
registry's trust policy reads every version again under the policy now in force, and
so does a repository whose entry in the index records none of these checks. An
unchanged registry therefore costs one conditional request per repository and two
small requests per version (three where a deprecation marker was judged), with
nothing downloaded. A version is read again on the next refresh where it carries a
deprecation marker that was not honored, or where this run got no way to
revalidate its attachments — which, on a registry that offers none, is every
version.

Several repositories are read at a time. Everything the command records and prints
comes out in repository order, so the index and the output are the same as reading
one repository at a time would produce.

While it walks, a terminal shows the walk's progress on standard error, the way
build and pull show theirs: a row naming each registry, a spinner while that
registry's repository listing is read, then how many of its repositories the walk
has finished out of how many it lists, counted in repository order, and a bar for
the whole walk below the rows. On a terminal that cannot redraw in place, or with
--plain, each registry gets one plain line instead, written when its walk ends,
with the count it ended on and the time it took. When standard error is not a
terminal, no progress is shown. The progress changes nothing the command prints on
standard output.

Use --upgrade to read every repository in full, comparing nothing with the index
already written — to rebuild an index from the registry alone. It finds no change a
refresh without it would miss.

Each published version's deprecation markers are read as the walk goes, and the ones
whose own signature verifies are recorded into the index. Every marker read is
reported, whether or not it was recorded — a version kept as recorded is not read, so
its marker is not reported again — and each registry reports how many markers its
index now records, including when that number is zero. Where signature
verification is disabled for a registry, the walk reports that its markers were not
examined rather than a count, so a registry that published nothing is never confused
with one this run had no basis to judge.
```

**`aggrega registry update` flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--upgrade` | `false` | Read every repository in full, comparing nothing with the index already written (a refresh without it already re-reads whatever changed) |
<!-- END GENERATED: cli-registry -->

## What `registry update` reports about deprecation markers

While it walks a registry, `aggrega registry update` reads each published version's
deprecation markers and records the ones it can authenticate into the local index.
It reports the outcome of that scan on every path, so a registry that published no
marker is distinguishable from a run that did not look for one.

Each marker the walk reads produces one line naming the repository, the version, and
the severity the publisher recorded — `warning`, `error` or `retracted` — together
with whether the marker was recorded. A version whose attachments are unchanged since
the last refresh is kept as recorded rather than read, so its marker is not reported
again; the count below still includes it. A marker is recorded only when its own
signature verifies against the signers the registry's trust policy honors. One that
is present but does not decode, or present but not honored, is reported as such and left
out of the index rather than recorded on evidence that could not be authenticated — and
so is one the registry answers it does not hold. A marker whose read failed is a
different case: see [A read that fails](#a-read-that-fails).

Each registry then reports how many markers its index now records, including when
that number is zero. Where signature verification is switched off — globally, or for
that one registry — the walk reports instead that markers were not examined for it.
The two are different facts: the first says the registry published nothing this
workspace can act on, the second says this run had no trust basis on which to judge a
marker at all. A registry whose markers were not examined contributes no withdrawal
to version selection, so an author who attached a marker and sees that line knows why
it has no effect.

## The publication date each version records

A published manifest's creation time is pinned, so its digest depends only on what is
published and never on when. The date a version was published is therefore read from beside
the manifest, and `aggrega registry update` records it for each version with the source it
came from:

- **`transparency-log`** — where the version's signature is keyless and verifies against the
  registry's trust policy, the time the transparency log recorded that signature, which the
  log's signed promise attests. Where several of the version's signatures verify, it is the
  earliest of their times, and the signer recorded for the version is that same signature's —
  whatever order the registry lists the signatures in — so a version signed again keeps its date
  and its signer. For a version signed as it was published, that is its publication; for one
  first signed afterwards with [`aggrega sign`](aggrega-sign.md), it is when it was signed.
  This source wins wherever it exists.
- **`publisher`** — otherwise, the time the publication stated beside what it published: a
  small published-at attachment that [`aggrega push`](aggrega-push.md) and
  [`aggrega push-artifact`](aggrega-push-artifact.md) write carrying the publishing machine's
  own clock, which nothing attests. It is read from any registry whatever its trust policy,
  because it is the publisher's statement rather than a trust decision. Where several are
  attached, the earliest is taken.

A version with neither records no date. That is a publication that stated none, where its
signature is not a keyless one this policy verifies — for example a keyless publication read
under a policy that trusts no keyless identity, since a keyless publication states no date of
its own. `aggrega search -o json` reports the date under each version in `published`.

## What a refresh reads again

A refresh compares what the registry serves now with what the index recorded, and reads
again everything that changed — the same answer a full re-read gives. For each repository
it:

- revalidates the tag listing, so a version published or deleted since is picked up;
- resolves every version's tag to the manifest it names, so an older version published
  again under its existing tag is read again;
- revalidates every version's attachments — its signatures, its publication-date statements
  and its deprecation markers — so a signature, a date or a marker attached to a version
  since is read and verified, and does the same for the signatures of a deprecation marker
  it judged before;
- compares the registry's trust policy with the one the index was built under, so a change
  to the policy reads every version again under the new one.

A deprecation marker, a signature and a publication date are each attached to a published
version as a separate object pointing back at it — which is what lets a publisher deprecate
or sign a version without publishing it again — so none of them adds a tag or changes the
version's own manifest. They change the version's attachments, and that is what the third
check revalidates. The version exclusion and `aggrega inspect` both read this index, so a
version retracted since the last refresh is excluded from selection, and shown, once the
next refresh has run.

Each check is a small request — a manifest digest resolve, or a conditional request the
registry answers as unchanged without sending anything — so a refresh of an unchanged
registry downloads nothing. A version that carries a deprecation marker that was not
honored, or whose attachments this run got no way to revalidate, is read again on the next
refresh. A registry that cannot say whether a version's attachments changed has every
version read again on every refresh: the answer is the same, and so is the cost of a full
re-read.

`--upgrade` reads every repository in full, comparing nothing with the index already
written. Use it to rebuild an index from the registry alone; it picks up nothing a refresh
misses.

## A read that fails

A walk reads many small objects from a registry, and some reads fail in passing: the
registry answers that it is overloaded or unavailable (a 429 or 5xx status), the connection
is reset or times out, or an answer stops before it is complete. Each such read is asked
again a few times, with a growing wait between attempts; where the registry says how long to
wait, with a `Retry-After` header, the walk waits that long.

A read that still fails is never taken as an answer. A signature that could not be read is
not a version without a signature, and a deprecation marker that could not be read is not a
version that was never withdrawn, so the walk records nothing about that repository from this
run. The repository keeps the record the index already holds for it, where that record was
judged under the registry's trust policy now in force, and is otherwise left out of the
index. Either way the walk names the repository in its running commentary, saying which of
the two happened and which read failed, and names it again in its closing summary, on a line
of its own under its registry's row, among the repositories that could not be read:

```text
Indexed 1 registry.
  registry.example.com: 41 entities, 1 repository could not be read, 4 reads retried
    component/core/web: the registry answered 503 Service Unavailable: …
```

The registry's row also says how many reads were asked again, each read counted once however
many attempts it took and whether or not it then succeeded, and says `0 reads retried` when
none was. A walk whose reads all succeeded in the end shows no repository on its row, so this
count is what says how close it came to leaving one out.

Each such line opens with the kind of the read's last failure — the status the registry
answered with, a read that timed out, a connection that was reset, or an answer cut short —
followed by the failure itself, which says which read it was. A failure of none of those
kinds, such as a trust root that could not be obtained to verify a signature against, is
given as the failure alone. The `aggrega/registryUpdate` method of
[`aggrega serve`](aggrega-serve.md) answers with the same repositories under each host's
`skipped`, each with the same `reason`, and with the count of reads asked again as
`readsRetried`. The same holds for a refresh and for `--upgrade`, and the next walk
starts from whatever the index then holds, as it does for any repository.

## The public key a keyed policy pins

A keyed trust policy pins the registry's public key inline, as the entry's `public_key`:
`aggrega registry add --key <file>` copies the file's contents there, and so does pinning a
policy the registry advertises with a key in it. The value is a PEM public-key block — the
text from a `-----BEGIN PUBLIC KEY-----` line, or `-----BEGIN RSA PUBLIC KEY-----`, to its
matching `-----END` line — and any text above the block is ignored.

A value carrying no `-----BEGIN … PUBLIC KEY-----` line is refused when the configuration
file loads, naming the file and the entry. `registry add` makes the same check before it
writes, so a `--key` file holding anything else — a private key, a certificate, or a key in
another encoding — is refused and the configuration file is left as it was. Only that line
is checked: whether the block decodes to a usable key is found when a signature from the
registry is verified against it.

## Offline

`aggrega registry update` is the one command in this group whose whole work is a walk of
the registries, and under the offline posture — the top-level `offline` key in a
configuration file, `AGGREGA_OFFLINE`, or [`--offline`](global-flags.md#--offline) — it
refuses before it walks anything. The refusal names which of the three set the posture.

There is no partial form to fall back on, because the index records what each registry
currently serves and that cannot be learned without asking one. What an offline workspace
*can* do is read the index it already has: `aggrega search` and the deprecation notice on
`aggrega inspect` both read the local snapshot and need no network at all, so a refresh is
the only thing the posture takes away. To refresh for one run from an offline workspace,
pass `--offline=false`.

`aggrega registry add` reaches the network once, for the trust policy the registry
advertises, unless `--fetch-trust=false`, `--identity` or `--key` says not to fetch. Under
the offline posture that fetch is refused before anything is dialled, so the registry is
never asked. Adding a registry other than the official hub is then **refused** — adding a
registry is the one moment its trust is pinned, and an entry written without the policy
would trust nothing while every later pull held the registry to it. The refusal carries the
short code `E0310` and names both ways forward: register it once while online, which
`--offline=false` allows for one run, or pin the policy by hand with `--identity` or `--key`,
which registers exactly what you supply and makes no fetch at all. The official hub is added on its built-in
baseline, with a notice saying the hub was not asked for its trust policy because the
workspace is offline and the baseline is used instead, and `--fetch-trust=false` registers
the entry from its flags exactly as it does online. The
same registration made through [`aggrega serve`](aggrega-serve.md) or
[`aggrega mcp`](aggrega-mcp.md) behaves the same way: the same refusal in the same words,
and otherwise the same entry. [A registry is added offline with no trust policy to
pin](../errors/fatal-halts.md#a-registry-is-added-offline-with-no-trust-policy-to-pin)
quotes the refusal.

`list` and `remove` change or read local configuration and are unaffected.
