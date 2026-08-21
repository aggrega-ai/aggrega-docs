# Aggrega Plugin Trust Record schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/plugins-trust-v1alpha1.schema.json`

Machine-generated record of the plugin identity trusted for each attachment that returns an accept-or-reject verdict — a `plugins.governance` attachment in an `ir-verdict` or `render-verdict` role, and every `plugins.linter` attachment. Lives at `plugins-trust.yaml` beside the lockfile and is committed alongside it, because a record held outside version control is one nobody can review and nothing can compare against. A file carrying records for only some of the configured attachments is a valid intermediate state rather than a damaged one. Each record is addressed by the plugin's own identity coordinate and carries the selected version and the artifact digest as fields, so a version change is a change to a field of an existing record rather than a new record under a new address — which is what lets a build tell a re-versioned plugin from one it is seeing for the first time. This file records identity and nothing else: no signature, no rule inputs, and no resolution provenance — no registry host, no path on the machine that wrote it — so the same resolution produces the same bytes wherever it runs. A `plugins.governance` verdict attachment's external rule files are recorded as digests in the lockfile's `verdict_inputs`; a `plugins.linter` attachment's rule inputs are recorded in neither file. Everything a build reproduces byte-for-byte is pinned in the lockfile instead; a verdict attachment shapes none of the rendered output, which is why its identity is recorded here rather than there. Schema evolution discipline: adding a new top-level section is SemVer-MINOR (additive); adding a new field inside an existing section is SemVer-MINOR; removing a key or tightening a constraint is SemVer-MAJOR.

**Top-level type:** `object`

## Properties

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `plugins` | object[] | no | One record per plugin trusted for a verdict-returning attachment, addressed by the plugin's identity coordinate. A plugin attached at two verdict roles at once — the same governance plugin bound to both `ir-verdict` and `render-verdict` — contributes a single record, because the recorded subject is the plugin's identity rather than the attachment: the two attachments read the same artifact. Records are emitted in ascending coordinate order. Default: `[]` |
| `version` | const 1 | yes | Trust-record schema version. Currently 1; future SemVer-MAJOR breaks of the schema increment this integer. Constant: `1` |

_Additional properties are not permitted._

#### `plugins-trust.plugins[]`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `plugin` | string | yes | The plugin's identity coordinate: its socket segment and its bare name joined by a slash, as in `governance/aggrega-security-baseline`. A bare name is unique only within its socket, so the socket segment is what distinguishes two same-named plugins in different sockets. The coordinate deliberately carries no version — that is what makes a version change visible as an edit to `resolved_version` below rather than as an unrelated record. |
| `resolved_version` | string | yes | Concrete version selected for this plugin when the record was written (e.g. `1.2.3`). |
| `digest` | string | yes | Content digest of the resolved plugin artifact (e.g. `sha256:...`). |

_Additional properties are not permitted._
