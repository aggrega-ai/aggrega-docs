# Aggrega Per-Release Lockfile schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/lockfile-v1alpha1.schema.json`

Machine-generated lockfile pinning every URI resolved from a Release for deterministic future builds. Lives at `<release-stem>.lock` next to `<release-stem>.yaml`; produced by `aggrega pull <release>`; consumed by `aggrega build <release>`. Two provenance shapes serve two distinct closure-graph relationships: `referenced_from` (list of strings — dotted authoring-site paths) appears on `entities` and `plugins` to record where in the Release / Aggregate / Manifest / `.aggrega-config.yaml` each URI was pulled in from; `consumers` (list of `{consumer_uri, fragments}` records) appears on `schema_libraries` and `mapping_libraries` to record which catalog entity references which `<entry-name>` fragments of a library — the structured shape makes consumer-affected-by-library-bump diffs traceable without re-running closure. Schema evolution discipline: adding a new top-level section is SemVer-MINOR (additive); adding a new field inside an existing section is SemVer-MINOR; removing a key or tightening a constraint is SemVer-MAJOR. A future additive `source_artifacts` section is reserved for the source-resolution amendment.

**Top-level type:** `object`

## Properties

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `entities` | object[] | no | Catalog entities reachable from this Release: Component, Feature, Recipe, FeatureRecipe, Aggregate. Each entry is keyed by canonical URI and records the resolved version, content digest, resolution path, and the authoring-site origins (`referenced_from`) that pulled the URI into closure. Default: `[]` |
| `external_inputs` | ExternalInput[] | no | Remote inputs pinned into the content-addressed input store at acquisition time — content a provider plugin's render consumes from beyond the workspace, such as remote schema documents or non-vendored chart dependencies. Each entry pins one URL to the digest that names its bytes in the store. Build serves pinned inputs from the store and reads this section without network access. Default: `[]` |
| `generated_at` | string | yes | ISO-8601 timestamp of the pull that produced this lockfile. Diagnostic provenance — records the wall-clock moment of resolution. Intentionally changes between pulls; not part of the WriteLockfile byte-identity guarantee. |
| `mapping_libraries` | LibraryEntry[] | no | MappingLibrary entries the closure references via Recipe / FeatureRecipe `valuesMapping: { $import: ... }` sites. Each entry's `consumers` list records which catalog entity references which `<entry-name>` fragments of the library — a structured record that makes library-version-bump impact diffs traceable without re-running closure. Default: `[]` |
| `mutators` | object[] | no | Resolved mutator-socket attachments, in authored order. The mutator rewrites the IR and therefore shapes the rendered output bytes, so the attachment set — the ordered list, plus per attachment the plugin coordinate and export function — is a byte-determining input pinned here. Build reads this section — never `.aggrega-config.yaml` — to reconstruct the mutator set, order, and export function, so build output is invariant to a `plugins.mutator` change made after the pull (adopted only on the next pull). Order is SEMANTIC: the runner applies attachments in list order, so unlike the URI-sorted `plugins` / `providers` sections this list is never reordered. The plugin's content digest is NOT duplicated here: it is single-sourced in the `plugins` and `entities` sections, which this record points into by identity. Default: `[]` |
| `plugins` | object[] | no | Wasm plugins the closure references — workspace-level plugin pins from `.aggrega-config.yaml` `plugins.{mutator,policy,linter,importer}[]:` plus any embedded plugin URIs from referenced Recipes / FeatureRecipes / Providers. Default: `[]` |
| `providers` | object[] | no | Resolved per-capability render-engine selections. Each entry pins one capability (e.g. `helm`) to the digest-free OCI identity of the provider-rendering plugin that renders it, resolved at pull from the `.aggrega-config.yaml` `plugins.providers` list (when the capability is ambiguously served) or from the sole serving plugin (when unambiguous). Build reads this section — never `.aggrega-config.yaml` — to select the render engine, so build output is invariant to workspace-config changes made after the pull. The plugin's content digest is NOT duplicated here: it is single-sourced in the `plugins` and `entities` sections, which this record points into by identity. Version coexistence is preserved: this record selects the plugin repository per capability; the concrete versions live in `entities` (one entry per resolved plugin version), and each Recipe's `spec.capability` version pin selects among them at render. Default: `[]` |
| `release` | string | yes | Path to the Release this lockfile corresponds to, resolved relative to the lockfile's own directory (e.g. `./release-prod.yaml`). The per-Release naming convention places `<release-stem>.lock` next to `<release-stem>.yaml`; the relative path makes the lockfile self-describing without machine-specific absolute paths. |
| `schema_libraries` | LibraryEntry[] | no | SchemaLibrary entries the closure references via `$ref` and `$import:` sites in entity `schema:` / `usesSchema:` / `secretsSchema:` content. Each entry's `consumers` list records which catalog entity references which `<entry-name>` fragments of the library — a structured record that makes library-version-bump impact diffs traceable without re-running closure. Default: `[]` |
| `source_artifacts` | SourceArtifactEntry[] | no | Source artifacts pulled from Recipe / FeatureRecipe `spec.source` fields at pull time. Each entry identifies a unique `{kind, url, chart, pinned_version}` identity with content digest, mediatype, and the structured `referenced_by:` back-pointers naming every catalog entity that resolved to this artifact. `url` is the authored identity URL; the resolved artifact location for a repo-root helm source is recorded separately under `resolved_url:` as provenance. Multiple Recipes pinning the same chart at the same version dedupe to a single entry with multiple `referenced_by:` records. The kind enum covers the four currently-supported source kinds plus one reserved (terraform-module-oci) for the future terraform engine. Default: `[]` |
| `version` | const 1 | yes | Lockfile schema version. Currently 1; future SemVer-MAJOR breaks of the schema increment this integer. Constant: `1` |

_Additional properties are not permitted._

#### `lockfile.entities[]`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `uri` | string | yes | Canonical URI of the catalog entity (e.g. `hub.aggrega.ai/component/core/compute/api-server`). |
| `resolved_version` | string | yes | Concrete version the resolver selected at pull time (e.g. `1.2.3`). |
| `digest` | string | yes | Content digest of the resolved artifact (e.g. `sha256:...`). |
| `manifest_digest` | string | no | OCI manifest digest of the resolved artifact (e.g. `sha256:...`). The signature commits to this digest; the content `digest` above is the portable identity used for the cache pin and integrity check. Present only for a registry-resolved entity. |
| `referenced_from` | string[] | no | Authoring-site origins — dotted paths into Release / Aggregate / Manifest YAML (e.g. `aggregate.spec.components.api.type`) recording why this URI is in the closure. Default: `[]` |
| `signature` | object | no | Verified-signature fact recorded when this entity's signature was verified at pull time. Records the verification mode, the keyless identity/issuer that matched (when keyless), and the content-addressed digest of the signature bundle cached in the closure for air-gapped re-verification. Build does not re-run verification; it re-verifies the cached bundle's digest only. |
| `deprecation` | DeprecationRecord | no |  |

_Additional properties are not permitted._

##### `lockfile.entities[].signature`

Verified-signature fact recorded when this entity's signature was verified at pull time. Records the verification mode, the keyless identity/issuer that matched (when keyless), and the content-addressed digest of the signature bundle cached in the closure for air-gapped re-verification. Build does not re-run verification; it re-verifies the cached bundle's digest only.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `bundle_digest` | string | yes | SHA-256 digest (`sha256:...`) of the cached signature bundle blob. Names the cache blob and is the integrity gate for an air-gapped re-verify. |
| `identity` | string | no | Verified certificate subject for a keyless signature (which trusted identity matched). Empty for a keyed signature. |
| `issuer` | string | no | Verified OIDC issuer for a keyless signature. Empty for a keyed signature. |
| `mode` | string (enum) | yes | Verification mode that admitted the signature. Allowed values: `"keyless"`, `"keyed"` |

_Additional properties are not permitted._

#### `lockfile.mutators[]`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `plugin` | string | yes | Resolved plugin coordinate of the mutator — a Plugin entity's `<pluginType>/<name>` identity (e.g. `mutator/tag-injector`). Joins by identity into the `plugins` and `entities` sections for the pinned digest and version set. |
| `function` | string | no | Export override the attachment names. Absent selects the mutator socket's default `mutate` export. |

_Additional properties are not permitted._

#### `lockfile.plugins[]`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `uri` | string | yes | Bare identity of the Wasm plugin's `.wasm` artifact — the `<socket>/<name>` path (e.g. `policy/aggrega-security-baseline`). The first segment is the plugin's socket (`linter`, `policy`, `mutator`, `formatter`, `importer`, `security`, `pipeline`, `provider`); the segment after that is the plugin name. Socket + name together form the plugin's identity — same name in different sockets is a different plugin. The physical fetch location is derived from this identity plus the configured registry, never carried in the lockfile. |
| `resolved_version` | string | yes | Concrete version resolved at pull time. |
| `digest` | string | yes | Content digest of the resolved Wasm artifact (e.g. `sha256:...`). |
| `manifest_digest` | string | no | OCI manifest digest of the resolved Wasm artifact (e.g. `sha256:...`). The signature commits to this digest; the content `digest` above is the portable identity used for the cache pin and integrity check. Present only for a registry-resolved artifact. |
| `referenced_from` | string[] | no | Authoring-site origins — dotted paths recording why this URI is in the closure (e.g. `.aggrega-config.yaml.plugins.policy`). Default: `[]` |
| `signature` | object | no | Verified-signature fact recorded when this plugin's signature was verified at pull time, against the same per-registry trust policy as catalog entities. Records the verification mode, the keyless identity/issuer that matched (when keyless), and the content-addressed digest of the signature bundle cached in the closure for air-gapped re-verification. Build does not re-run verification; it re-verifies the cached bundle's digest only. |
| `deprecation` | DeprecationRecord | no |  |

_Additional properties are not permitted._

##### `lockfile.plugins[].signature`

Verified-signature fact recorded when this plugin's signature was verified at pull time, against the same per-registry trust policy as catalog entities. Records the verification mode, the keyless identity/issuer that matched (when keyless), and the content-addressed digest of the signature bundle cached in the closure for air-gapped re-verification. Build does not re-run verification; it re-verifies the cached bundle's digest only.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `bundle_digest` | string | yes | SHA-256 digest (`sha256:...`) of the cached signature bundle blob. Names the cache blob and is the integrity gate for an air-gapped re-verify. |
| `identity` | string | no | Verified certificate subject for a keyless signature (which trusted identity matched). Empty for a keyed signature. |
| `issuer` | string | no | Verified OIDC issuer for a keyless signature. Empty for a keyed signature. |
| `mode` | string (enum) | yes | Verification mode that admitted the signature. Allowed values: `"keyless"`, `"keyed"` |

_Additional properties are not permitted._

#### `lockfile.providers[]`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `capability` | string | yes | The capability this binding selects an engine for — the bare engine name a Recipe binds through `spec.capability` (e.g. `helm`, `compose`). |
| `plugin` | string | yes | Bare identity of the resolved provider-rendering plugin (a Plugin entity's `metadata.name`, the `<socket>/<name>` path, e.g. `provider/helm`). Joins by identity into the `plugins` and `entities` sections for the pinned digest and version set. |

_Additional properties are not permitted._

## Definitions

### `DeprecationRecord`

Verified retroactive deprecation marker recorded when a signed, trusted deprecation marker was discovered on this artifact at pull time. A marker is a signed OCI referrer of the artifact it deprecates, attached after publication without re-publishing the artifact. Records the marker's severity and message plus the verified signer that authored it. Build reads this fact and enforces the deprecation policy from the lockfile alone; it never re-discovers or re-verifies the marker.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `message` | string | yes | Human-readable deprecation message carried by the marker — typically a migration pointer. |
| `severity` | string (enum) | yes | Marker severity, ordered warning < error < retracted. The build halts when this severity meets or exceeds the configured halt threshold, and emits an advisory otherwise. Allowed values: `"warning"`, `"error"`, `"retracted"` |
| `signer` | object | no | Verified signer of the marker, recorded the same way an artifact signature's signer is: the certificate subject/issuer for keyless, or the pinned-key fingerprint for keyed. |

_Additional properties are not permitted._

#### `DeprecationRecord.signer`

Verified signer of the marker, recorded the same way an artifact signature's signer is: the certificate subject/issuer for keyless, or the pinned-key fingerprint for keyed.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `bundle_digest` | string | yes | SHA-256 digest (`sha256:...`) of the marker's signature bundle. |
| `identity` | string | no | Verified certificate subject for a keyless marker signature (which trusted identity matched). Empty for a keyed signature. |
| `issuer` | string | no | Verified OIDC issuer for a keyless marker signature. Empty for a keyed signature. |
| `mode` | string (enum) | yes | Verification mode that admitted the marker's signature. Allowed values: `"keyless"`, `"keyed"` |

_Additional properties are not permitted._

### `ExternalInput`

A single pinned external input: the URL a render requested, the SHA-256 pin naming its bytes in the content-addressed input store (`sha256/<digest>`), the payload size, and the provenance of the consumers that required it. The pin is authoritative — a pinned URL is always served from the store, and a store refill is verified against this digest before the bytes reach a render.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `required_by` | string[] | yes | Provenance — the render sites that requested this input. Sorted and deduplicated by the lockfile writer. |
| `sha256` | string | yes | Lowercase hex SHA-256 pin. For an https input, the digest of the payload bytes; for an oci input, the manifest digest the reference resolved to. Names the store blob at `sha256/<digest>`. |
| `size` | integer | yes | Size in bytes of the pinned payload. |
| `url` | string | yes | The input URL as authored at the render site — the lookup key matching a render-time request to its pin. |

_Additional properties are not permitted._

### `LibraryEntry`

Common shape shared by `schema_libraries` and `mapping_libraries` entries. The `consumers` list captures the catalog-graph relationship — which catalog entity references which `<entry-name>` fragments of this library — supporting structured impact diffs when the library's digest changes.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `uri` | string | yes | Canonical URI of the library entity. |
| `resolved_version` | string | yes | Concrete version resolved at pull time (MVS selection over the library-dependency graph). |
| `digest` | string | yes | Content digest of the resolved library artifact (e.g. `sha256:...`). |
| `consumers` | object[] | no | Records of which catalog entity references this library and at which `<entry-name>` fragments. Captures the fan-in: many consumers per library, each potentially referencing many fragments. Each record carries the consumer URI plus the set of fragments that consumer pulls in. Default: `[]` |

_Additional properties are not permitted._

#### `LibraryEntry.consumers[]`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `consumer_uri` | string | yes | Canonical URI of the catalog entity (Component or Feature) referencing this library. |
| `fragments` | string[] | yes | Set of `<entry-name>` fragments this consumer references within the library (e.g. `["#/schemas/PortSpec", "#/schemas/EndpointSpec"]`). Order is canonicalized lexicographically by the writer. |

_Additional properties are not permitted._

### `SourceArtifactEntry`

A single source artifact pin: the {kind, url, chart, pinned_version} identity, the content digest verifying the pull, the canonical mediatype, and the structured back-pointers to every catalog entity that resolved to this artifact.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `kind` | enum | yes | The source kind. Determines which adapter resolved the artifact and which mediatype is expected. `terraform-module-oci` is reserved for the future terraform provider; no adapter ships at the moment. Allowed values: `"helm-oci-chart"`, `"helm-https-chart"`, `"compose-https-fragment"`, `"terraform-module-git"`, `"terraform-module-oci"` |
| `url` | string | yes | The authored URL — the identity URL as written in the Recipe's spec.source.url. For helm-https this is the repo root (repo-root form) or the direct .tgz (direct form) exactly as authored; build reconstructs this same URL offline, so it is the stable identity the pin is keyed on. For terraform-git, the cloneable repository URL. For helm-oci, the registry reference. The resolved artifact location for a repo-root helm source is recorded separately under `resolved_url:` as provenance. |
| `chart` | string | no | The chart name for a repo-root helm source (the Recipe's spec.source.chart), part of the {kind, url, chart, pinned_version} identity so two charts served from one repo root at the same version pin to distinct entries. Absent for a direct .tgz, OCI, compose, or git source, where the URL alone identifies the artifact. |
| `pinned_version` | string | yes | The concrete version the resolver pinned at pull time. For helm-* kinds, the chart version. For terraform-module-git, the resolved commit SHA (NOT the original tag/branch ref — that is recorded under `requested_ref:` on each `referenced_by:` entry when it differs from the SHA). |
| `resolved_url` | string | no | Provenance only: the concrete artifact location the authored URL resolved to at pull time. For a repo-root helm source this is the direct .tgz URL the repository index resolved the chart+version to; it is recorded for diagnostics and is NOT part of the artifact identity. Absent when the resolved location equals the authored URL (a direct .tgz, OCI, compose, or git source). |
| `digest` | string | yes | Content digest of the resolved .tar.gz archive (e.g. `sha256:...`). Build-time verification reads the cache slot's bytes, recomputes the digest, and compares against this field; mismatch halts with ErrFetchIntegrity. |
| `manifest_digest` | string | no | OCI manifest digest of the resolved artifact (e.g. `sha256:...`). The manifest is the independent root of trust the cached archive is verified against; the content `digest` above is the portable identity used for the cache pin and integrity check. Present only for an OCI-distributed source (a helm-oci-chart). |
| `mediatype` | string | yes | Canonical media type the registry advertised (or the kind's default for kinds without registry metadata). Recorded for diagnostic provenance and forward-compatibility with future kind-mediatype enrichments. |
| `referenced_by` | SourceArtifactReference[] | yes | Catalog entities that resolved to this artifact. The list is sorted by `(uri, field)` for deterministic output. `minItems: 1` because an artifact entry exists only because at least one Recipe / FeatureRecipe pulled it; the closure walker never emits an unreferenced entry. |

_Additional properties are not permitted._

### `SourceArtifactReference`

A single catalog-entity → source-artifact back-pointer. `entity` + `uri` together identify the catalog entity; `field` names the source-side path inside the entity's spec where the artifact was declared. The optional `requested_ref:` preserves the user-authored ref string when the resolved `pinned_version:` is a transformed value (terraform-module-git tags/branches → commit SHA).

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `entity` | enum | yes | The catalog-entity kind that holds this back-pointer. Allowed values: `"recipe"`, `"feature_recipe"` |
| `uri` | string | yes | Canonical URI of the Recipe or FeatureRecipe (e.g. `hub.aggrega.ai/recipe/helm/mariadb-bitnami:1.0.0`). |
| `field` | string | yes | Source-side path inside the entity's spec where the artifact was declared. In the current implementation the value is always `spec.source`. A future extension covering remote-URL forms of `spec.artifacts[*].source` will widen the value space. |
| `requested_ref` | string | no | Optional — the user-authored ref string when `pinned_version:` is a transformed value. For terraform-module-git Recipes authoring `ref: v1.0.0`, this preserves `"v1.0.0"` while `pinned_version:` holds the resolved commit SHA. Absent for kinds where `pinned_version:` IS the authored version (helm-*, compose-*). |

_Additional properties are not permitted._
