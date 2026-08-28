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

One thing no surface can tell you about, and it is worth knowing: a
`plugins.linter` attachment, and a `plugins.governance` attachment in an
`ir-verdict` or `render-verdict` role, are pinned in
[`plugins-trust.yaml`](../schema/other/plugins-trust.md) beside the lockfile
rather than in the lockfile itself. That record carries identity and nothing
else — no deprecation marker — so a withdrawal published against one of those
plugins is not reported on any surface today.

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

Where nothing is chosen there is nothing for the exclusion to act on: a reference
naming an exact version resolves to that version, and the withdrawal is announced
rather than acted on. Nor does any of this change what you are told at build time —
`aggrega build` reports every marker the lockfile records, whatever route pinned
the version.
