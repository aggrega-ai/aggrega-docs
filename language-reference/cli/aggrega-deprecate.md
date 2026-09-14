# aggrega deprecate

Attach a signed deprecation marker to an already-published artifact

<!-- BEGIN GENERATED: cli-deprecate -->
**Synopsis**

```
aggrega deprecate <reference> [flags]
```

**Description**

```
Deprecate amends an already-published artifact by attaching a deprecation marker to it as an OCI referrer, then signing that marker. It does not re-push, re-tag, or otherwise mutate the published bytes — the artifact is immutable; the marker is a sibling manifest pointing back at it, so a marker can be attached retroactively. The marker records a severity (warning, error, or retracted), a reason, an optional replacement reference, and the timestamp it was issued. Run it three ways: pass the content as flags; omit the content flags at an interactive terminal to be prompted for severity, reason, and replacement; or pass --from <file> to attach one marker per entry from a batch file. The marker itself is signed the same way artifacts are: its manifest digest is signed and the signature is attached as a referrer of the marker, so the marker is verifiable the same way artifact signatures are. With --key the signature is produced offline from a held ECDSA P-256 key; without --key the keyless flow is used, which requires a live identity provider, Fulcio, and Rekor.
```

**Flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--from` | — | Batch file (YAML, or JSON as a subset) whose top-level list attaches one marker per entry. Each entry carries reference and severity and reason, plus optional replacement and message. Mutually exclusive with a positional reference. |
| `--fulcio-url` | — | Fulcio certificate-authority URL for keyless signing. When omitted, the public-good Fulcio instance is used. |
| `--identity-token` | — | OIDC identity token for keyless signing. Optional at an interactive terminal (a browser flow acquires one) and on GitHub Actions (the workflow OIDC token is minted automatically); required for other non-interactive/CI use, where it may instead be exported as AGGREGA_IDENTITY_TOKEN or SIGSTORE_ID_TOKEN. |
| `--key` | — | Path to a held ECDSA P-256 private key PEM for offline keyed signing. When omitted, keyless signing is used. |
| `--message` | — | Optional legacy message retained for audit and for the recorded build-time diagnostic; defaults to --reason when unset. |
| `--reason` | — | Human-readable reason for the deprecation — why it is deprecated and what to do instead. Required unless --from or an interactive prompt supplies it. |
| `--rekor-url` | — | Rekor transparency-log URL for keyless signing. When omitted, the public-good Rekor instance is used. |
| `--replacement` | — | Optional artifact reference that replaces the deprecated one. |
| `--severity` | — | Deprecation severity: one of warning, error, retracted. Required unless --from or an interactive prompt supplies it. |
| `--timestamp-url` | — | Optional RFC3161 timestamp-authority URL for keyless signing. |
<!-- END GENERATED: cli-deprecate -->

## What each severity does

The three severities form an ordered set — `warning`, then `error`, then
`retracted` — and they split into two tiers that differ in *when* they act.

`warning` and `error` are advisory tiers. A marker at either severity never
changes which version a reference resolves to. It is recorded when you run
`aggrega pull`, and every surface that reads the lockfile reports it.

Every one of those surfaces reports **every** deprecated reference the lockfile
pins, whatever the severity, naming the reference, its severity, its message, and
when the record was observed:

| Surface | What it does with a recorded marker |
| --- | --- |
| `aggrega build` | Reports it, and stops if you configured a halt at that severity. |
| `aggrega validate --release` | Reports it. The verdict is unchanged. |
| `aggrega lint --release` | Reports it. The verdict is unchanged. |
| `aggrega serve` | Publishes it to your editor as a warning while the Aggregate is open. |
| The AI-native `build` tool | Reports it, and refuses if you configured a halt at that severity. |
| The AI-native `describe` and `validate` tools | Report it alongside their own output. |

Whether a marker also *stops* a build is a separate setting:
`build.halt_on_deprecated_severity` is unset by default, so nothing halts, and
setting it to a severity halts on that severity and above. It governs the build —
`aggrega build` and the AI-native build tool, which is the same operation — and
nothing else: the reporting surfaces name the marker and carry on either way.
Raising the threshold never reduces what you are told, on any surface — you still
get the notice for everything below it, and for everything the halt does not
cover.

Some plugins are recorded somewhere else, and their markers come from there. A
`plugins.linter` attachment, and a `plugins.governance` attachment in an
`ir-verdict` or `render-verdict` role, shape none of the rendered output, so they
are pinned in [`plugins-trust.yaml`](../schema/other/plugins-trust.md) beside the
lockfile rather than in the lockfile itself. Each record there carries the marker
discovered for the plugin it names, alongside its identity, and `aggrega pull`
records one the same way it records a marker on a lockfile row.

`aggrega build`, `aggrega lint --release` and `aggrega validate --release` read
both records, so a deprecated plugin is named there just as a deprecated
reference is, and `build.halt_on_deprecated_severity` governs both alike. Two
differences are worth knowing. The notice for such a plugin does not say when the
record was observed — that file carries no timestamps at all, which is what makes
it reproduce byte-for-byte — so it names where the fact came from and the command
that refreshes it instead. And an entry there is never rewritten by an ordinary
pull: a newly published marker is added to the record the plugin already has,
while the identity it is held to stays put until you ask for it to change with
`aggrega pull --upgrade`.

`retracted` is the withdrawal tier, and it acts earlier as well. A version
recorded as retracted is **removed from consideration** when `aggrega pull`
chooses a version for a reference that did not name one. If another published
version satisfies the reference, that version is taken and the pull says so,
naming the version it skipped, the reason recorded against it, and the version it
took instead. If no published version is left to satisfy the reference, the pull
halts and says that every candidate has been withdrawn — it does not report the
entity as missing, and it never falls back in silence.

## Naming a version explicitly overrides the withdrawal

A reference that names an exact version always resolves to that version, whether
or not it has been retracted. Naming the version *is* the override, so there is no
separate setting to turn the exclusion off — and a pinned version from a previous
`aggrega pull` keeps resolving for exactly the same reason.

The pull says so out loud when the version you named has been withdrawn, so the
build that already committed to it keeps working while you can still see why you
might want to move.

## Withdrawal records are a snapshot, not a live answer

A published artifact is immutable, but a withdrawal is not: a version can be
retracted after you last looked. The exclusion reads what your workspace recorded
the last time it built its local registry index, so it protects you from selecting
a version *known* to be withdrawn. It cannot tell you that a version is not
withdrawn right now.

Every report of a marker recorded earlier states when that record was observed, so a
stale record is distinguishable from a fresh one, and each names the command that
refreshes it. Two records are kept and they refresh separately: the version exclusion
and `aggrega inspect` read your local registry index, which `aggrega registry update`
refreshes, while `aggrega build` reads the marker recorded in the lockfile, which
`aggrega pull` refreshes. What `aggrega pull` prints while it is looking carries no
such moment — it is reporting what it found just then.

For the same reason, the absence of a withdrawal is not evidence that none exists —
only that none had been recorded when you last refreshed.

## Where you are told

Which command tells you about a withdrawal follows from which record it reads. The
table further up covers the marker recorded in your lockfile — what this Release
pinned. This one covers the local registry index — what a registry published — which
is the record the version exclusion reads.

| Command | What it tells you about a recorded withdrawal |
| --- | --- |
| `aggrega registry update` | Names each marker it meets while walking the registry: the repository, the version it was recorded on, the severity, and whether the marker was recorded. Each registry then reports how many markers its index now holds. |
| `aggrega search` | Reports the version a resolution would take rather than a retracted one, and names the retracted versions in a `NOTES` column. `--include-retracted` reports the highest published version instead. |
| `aggrega inspect` | Prints the recorded severity beneath the entity, with the version it was recorded on, the reason, the replacement where one is named, and the date it was issued — for every kind it resolves by name. |
| `aggrega pull` | Names each version it skipped, the reason recorded against it, and the version it took instead. A version you named explicitly still resolves, and the withdrawal is announced rather than acted on. |
| `aggrega plugin add` | The same, on either route it resolves an unpinned plugin reference by. Where the markers could not be read, it says so and states that the published versions were not screened. |
| `aggrega build` | Nothing from this record. It reads your lockfile alone and never the index, so what it reports is the marker recorded against the version you pinned. |
| `aggrega serve` | Nothing from this record. Its own resolution does not consult the withdrawal records, so a retracted version can still be selected there; it publishes the lockfile's marker to your editor as before. |

Read the last two rows together with the rest: a command tells you about a withdrawal
only where it is doing something the withdrawal bears on — choosing a version, or
showing you what a publisher said. Silence from a command that does neither is not
evidence that nothing is recorded.

A notice names the severity the publisher recorded. A retracted artifact is reported
as `retracted`; the two advisory severities are reported as deprecated, naming which
of the two. So what you read back matches the value that was authored and the value
you would configure a halt threshold with.

Two kinds of notice are kept apart because they report different events. A
`deprecation:` line tells you something about an artifact. A `retraction:` line tells
you what you did not get — a version that was skipped, or a screening that could not
be performed. Where one command emits both about the same artifact, they are two
facts rather than one statement made twice.

## Which resolutions the exclusion covers

The exclusion acts wherever a command **chooses** a version for you. That is the
rule, and it settles whether any particular resolution is covered.

`aggrega pull` applies it wherever it chooses a version for a reference that did
not name one — whatever the reference names: a catalog entity, a library, a
published Aggregate. One rule governs all of them, so the version a reference
resolves to does not depend on which kind of reference asked for it.

`aggrega plugin add` applies it on every route it resolves an unpinned plugin
reference by: against the published versions your local registry index already
carries, and against the live version list it reaches for when that index does not
carry the repository. A withdrawn version is skipped, and the substitution
announced, on whichever route resolved it.

The editor-facing daemon is the exception. It resolves references on demand while
it serves an editor, and that resolution chooses versions without consulting the
withdrawal records, so a version recorded as retracted can still be selected there.

## See also

- [./aggrega-sign.md](./aggrega-sign.md) — a marker is signed by its own digest, so the signing modes
  and the credentials each needs are the ones described there.
- [./aggrega-serve.md](./aggrega-serve.md) — the daemon attaches the same marker at
  `aggrega/deprecateArtifact`. The content a terminal is prompted for is required on a request there,
  because nothing on that surface can ask for it.
- [./aggrega-mcp.md](./aggrega-mcp.md) — the same capability as the `deprecate-artifact` tool, which
  an assistant can call. Read what that page says about allowing it before you do: a withdrawal
  changes what every consumer of that registry resolves.

Where nothing is chosen there is nothing for the exclusion to act on: a reference
naming an exact version resolves to that version, and the withdrawal is announced
rather than acted on. Nor does any of this change what you are told at build time —
`aggrega build` reports every marker the lockfile records, whatever route pinned
the version.
