# Aggrega Cache-Slot Metadata schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/cache-metadata-v1alpha1.schema.json`

The metadata.yaml file written into every source-artifact cache slot alongside blob.tgz. Records the {kind, url, version, digest, mediatype, pulled_at} identity tuple so cache inspection and build-time integrity verification have a single canonical record. The wire shape is closed (additionalProperties: false) and all six fields are required. Schema evolution discipline: adding a new optional field is SemVer-MINOR (additive); removing a field or tightening a constraint is SemVer-MAJOR.

**Top-level type:** `object`

## Properties

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `kind` | enum | yes | The source kind that produced this cache slot. Mirrors the lockfile's source_artifacts[].kind enum; the matching kind is what every build-time consumer reads to choose the right loader. Allowed values: `"helm-oci-chart"`, `"helm-https-chart"`, `"compose-https-fragment"`, `"terraform-module-git"`, `"terraform-module-oci"` |
| `url` | string | yes | The canonical resolved URL. For helm-https when the input was a repo-root URL, this is the direct .tgz URL the index resolved to. For terraform-git, this is the cloneable repository URL. For helm-oci, the registry reference. |
| `version` | string | yes | The concrete version the resolver pinned at pull time. For helm-* kinds, the chart version. For terraform-module-git, the resolved commit SHA. |
| `digest` | string | yes | Content digest of the cached .tar.gz archive in sha256:<hex> form. Build-time verification computes the SHA-256 of blob.tgz, compares against this field AND the lockfile entry's digest, and halts with ErrFetchIntegrity on mismatch. |
| `mediatype` | string | yes | Canonical media type the registry advertised (or the kind's default for kinds without registry metadata). Recorded for diagnostic provenance and forward-compatibility with future kind-mediatype enrichments. |
| `pulled_at` | string | yes | RFC 3339 timestamp recording the pull-time wall clock. Diagnostic provenance only — not part of any integrity contract. The pattern enforces the RFC 3339 shape at the validator boundary; format: date-time is documentation-bearing. |

_Additional properties are not permitted._
