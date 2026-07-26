# Error sentinels — canonical reference

Every fatal halt the compiler emits wraps a named Go error sentinel. The user-facing diagnostic (the prefixed message catalogued in [fatal-halts.md](./fatal-halts.md) and [error-translation.md](./error-translation.md)) carries the developer-facing prose; the wrapped sentinel is what `errors.Is` matches against in programmatic consumers.

This page is the sentinel-keyed view of the catalogue. Programmers writing CI gates, IDE integrations, or build-orchestration code that needs to distinguish error kinds match against the sentinels listed here using the standard `errors.Is(err, sentinel)` idiom. Authors debugging a build by reading the emitted error text usually want the message-keyed views — [fatal-halts.md](./fatal-halts.md) for build-stopping errors, [warnings.md](./warnings.md) for advisory output.

The compiler exports each sentinel from its declaring package; importing the package and dereferencing the sentinel by name is the supported integration surface:

```go
import "github.com/aggrega/aggrega-cli/pkg/resolver"

if errors.Is(err, resolver.ErrParameterContractViolation) {
    // handle parameter contract violations
}
```

The sentinels listed below are stable across patch releases; renames or removals are signalled by a release-notes entry and a deprecation cycle. Adding a new sentinel within a package is additive and does not break existing matchers. The message text on the right-hand column is the literal wrapped string; the user-facing diagnostic adds a category prefix (`DEVELOPER_ERROR:` / `OPS_ERROR:` / `CATALOG_ERROR:` / `TRANSLATION_ERROR:` / `FETCH_ERROR:` / `POLICY_ERROR:` per [error-translation.md](./error-translation.md)) and the source location ahead of the sentinel's text.

## Resolver-stage sentinels (`pkg/resolver`)

Step 1 of the compilation pipeline — workspace load, parameter interpolation, target-reference validation, inject-contract checks, attachment-presence completeness.

| Sentinel | Wrapped message | User-facing surface |
| --- | --- | --- |
| `ErrInvalidParameterRef` | `invalid parameter reference: check the {{ .parameters.* }} expression names a declared parameter and parses as a Go template` | Subsumed under "Parameter type mismatch / contract violation" in fatal-halts. |
| `ErrParametersImportLoad` | `parameters $import: load failed` | Surfaces as "External parameters file cannot be loaded" in fatal-halts. |
| `ErrInvalidInstanceName` | `invalid instance name: names must match ^[a-zA-Z0-9_-]+$ (letters, digits, hyphen, underscore; no dots)` | Surfaces as "Instance name fails the naming pattern" in fatal-halts. |
| `ErrInvalidTargetRef` | `invalid target reference: each dot-separated segment must match ^[a-zA-Z0-9_-]+$` | Surfaces as "Dangling `uses` target" in fatal-halts. |
| `ErrYAMLLoad` | `YAML load failed: check the file exists, is readable, and contains well-formed YAML` | YAML-load failures present through schema-validation paths covered under "When loading your files" in fatal-halts. |
| `ErrManifestReservedPrefix` | `manifest annotation binding uses reserved prefix` | Surfaces during Manifest validation; reserved annotation namespaces (`aggrega.ai/`, `feature.aggrega.ai/`) cannot be redefined by ad-hoc bindings. |
| `ErrManifestCrossBindingPillarCollision` | `manifest annotation bindings collide on same Feature path+pillar` | Two bindings route different annotation keys into the same Feature path through the same pillar — collision halts catalog load. |
| `ErrInvalidInjectKey` | `invalid inject key: the from-key must name a declared provides key of the target component type` | Surfaces as "Inject `from` key is not in the target's `provides`" in fatal-halts. |
| `ErrMissingRequiredFeature` | `missing required feature: attach a Feature of the required type to the component` | Surfaces as "Required feature not attached" in fatal-halts. |
| `ErrFeatureMergeConflict` | `feature merge conflict: reconcile the Aggregate and Release declarations for the feature` | Surfaces under "Manifest merge strategy" in fatal-halts. |
| `ErrUnknownUsesSocket` | `unknown uses socket: declare the socket in the component type's usesSchema, or use a socket it already declares` | Surfaces as "`uses:` socket not declared in the target's `usesSchema`" in fatal-halts. |
| `ErrSelfInjectForbidden` | `self-inject on component without spec.inject allowlist` | Surfaces as "Self-inject on a component without an allowlist" in fatal-halts. |
| `ErrInjectKeyCollision` | `duplicate delivery key across inject sources` | Surfaces as "Duplicate delivery key across inject sources" in fatal-halts. |
| `ErrSchemaValidation` | `schema validation failed: correct the flagged field to satisfy its declared schema` | Generic JSON Schema validation failure — the user-facing message attached to the error names the failing field and the constraint violated. |
| `ErrMissingRequiredSocket` | `required uses socket not populated` | Surfaces as "Required `uses:` socket not populated" in fatal-halts. |
| `ErrParameterMissing` | `required parameter not supplied` | Surfaces as the missing-parameter branch of "Parameter type mismatch / contract violation" in fatal-halts. |
| `ErrParameterContractViolation` | `parameter contract violated` | Surfaces as the contract-violation branch of "Parameter type mismatch / contract violation" in fatal-halts. |

## Validator-stage sentinels (`pkg/validator`)

Catalog-side validation — `extends:` inheritance chain walks, `usesSchema` composition, JSON Schema unification.

| Sentinel | Wrapped message | User-facing surface |
| --- | --- | --- |
| `ErrSchemaValidation` | `schema validation failed: correct the flagged field to satisfy its declared schema` | Same generic surface as the resolver-stage copy; distinguish by package on the wrap path when matching. |
| `ErrInheritanceMerge` | `inheritance merge failed: resolve the conflicting field definitions across the extends chain` | Surfaces as the merge-failure branch of "Cyclic extends chain" / "`usesSchema` composition failure on `extends` chain" in fatal-halts. |
| `ErrCyclicExtension` | `cyclic extends chain` | Surfaces as "Cyclic extends on Components or Features" in fatal-halts. |
| `ErrUsesSchemaUnification` | `usesSchema unification failed: reconcile the conflicting socket definitions across the extends chain` | Surfaces as "`usesSchema` composition failure on `extends` chain" in fatal-halts. |

## Compact-form sentinels (`pkg/compactform`)

Compact-form authoring surface validation — keyword vocabulary, constraint-type compatibility, cross-document `$ref:` resolution.

| Sentinel | Wrapped message | User-facing surface |
| --- | --- | --- |
| `ErrUnknownKeyword` | `compactform: unknown keyword` | A schema author used a compact-form keyword the vocabulary does not declare; the message lists allowed keywords. See [vocabulary/compact-form-authoring.md](../vocabulary/compact-form-authoring.md). |
| `ErrAmbiguousDispatch` | `compactform: ambiguous dispatch — $mode required` | A schema author wrote a leaf whose shape could match multiple compact-form modes; the message names the conflicting modes and asks the author to disambiguate via `$mode:`. |
| `ErrEscapeContentInvalid` | `compactform: $jsonschema content invalid` | The `$jsonschema:` escape hatch's nested content failed JSON Schema parsing. |
| `ErrConstraintTypeMismatch` | `compactform: constraint not valid for declared type` | A constraint keyword does not apply to the declared type (`min:` on `type: object`, `pattern:` on `type: integer`). |
| `ErrReferenceUnresolvable` | `compactform: $ref unresolvable` | A `$ref:` URL did not resolve to a target schema. |
| `ErrUnresolvedSchemaLibraryRef` | `compactform: cross-document $ref target not found` | A cross-document `$ref:` (typically targeting a SchemaLibrary entry) failed to resolve the named target inside the resolved document. |
| `ErrCircularRef` | `compactform: circular cross-document $ref expansion` | A SchemaLibrary chain forms a cycle; expansion would not terminate. |
| `ErrHostInLibraryRef` | `compactform: cross-document $ref carries a registry host; reference the library by identity` | A cross-document `$ref:` carries a registry host (an `oci://<host>/…` form). References address libraries by identity — the bare-name `<Library>#/schemas/<Entry>` form — so the host is rejected with a steer to the identity form. |

## Topology-stage sentinels (`internal/compiler/topology`)

Step 2 — topology graph construction, sub-aggregate flattening.

| Sentinel | Wrapped message | User-facing surface |
| --- | --- | --- |
| `ErrSubAggregateLoad` | `sub-aggregate load failed` | A sub-Aggregate referenced via `spec.aggregates.<name>.type:` could not be loaded; the message names the unreachable Aggregate URI. |
| `ErrInvalidUsesFormat` | `invalid uses format: a uses socket value must be a string array of target names or a verbose alias-keyed map` | A `uses:` declaration's structural shape did not match the schema (e.g., a string where a map was expected). |
| `ErrMaxDepth` | `max sub-aggregate nesting depth exceeded` | Surfaces as "Sub-aggregate nesting depth exceeded" in fatal-halts. |
| `ErrSubAggregateNameCollision` | `flattened node ID collision: rename one of the colliding instances so their flattened IDs differ` | Two sub-Aggregates flatten to the same node ID after compilation; rename one of the sub-Aggregate instance names to disambiguate. |

## IR-stage sentinels (`internal/compiler/ir`)

Step 3 — IR construction, Feature merging across Aggregate + Release surfaces.

| Sentinel | Wrapped message | User-facing surface |
| --- | --- | --- |
| `ErrFeatureTypeMismatch` | `feature type mismatch between Aggregate and Release` | Surfaces as "Feature type mismatch between Aggregate and Release" in fatal-halts. |

## Static analyzer sentinels (`internal/compiler/analyzer`)

Step 4 — selector evaluation, cross-node type-safety checks.

| Sentinel | Wrapped message | User-facing surface |
| --- | --- | --- |
| `ErrSelectorViolation` | `selector violation` | Surfaces as "Cross-node type safety violation via `selector:`" in fatal-halts. |
| `ErrCatalogLookup` | `catalog lookup failed` | A catalog-resolution miss the analyzer cannot proceed past; the message names the unreachable entity. |
| `ErrPolicyViolation` | `policy violation` | A policy plugin attached at a governance verdict role rejected the assembled build; surfaces under the `POLICY_ERROR` category with the rejecting plugin named and the rule message it supplied. |

## Provider-engine sentinels

Step 5 — renderer dispatch and per-engine rendering.

| Sentinel | Wrapped message | User-facing surface |
| --- | --- | --- |
| `ErrUnknownProvider` | `unknown provider` | Surfaces as "Unknown provider" in fatal-halts. |

## Fetch sentinels (`pkg/oci`, re-exported by `pkg/sourceresolver`)

`aggrega pull`, `aggrega push`, and `aggrega build`'s lockfile verification acquire pinned catalog entities and source artifacts. Acquisition failures wrap one of four shared fetch sentinels and carry the `FETCH_ERROR` category. `pkg/sourceresolver` re-exports the four `ErrFetch*` values as identity-equal aliases, so a match against either package's name succeeds.

| Sentinel | Wrapped message | User-facing surface |
| --- | --- | --- |
| `ErrFetchNotFound` | `oci: artifact not found at remote source` | A pinned entity, chart, or module is not present at the registry / remote source — or, under offline mode, not in the local cache. |
| `ErrFetchUnauthorized` | `oci: authentication required or failed` | The registry or source rejected the request; the message carries a remediation pointer (e.g. `docker login <registry>`). |
| `ErrFetchNetworkUnreachable` | `oci: network unreachable` | A transport-layer failure — DNS, connection refused, TLS, or a retry-class status. |
| `ErrFetchIntegrity` | `oci: content digest mismatch` | A cached artifact's digest does not match the lockfile entry; remediation: `aggrega pull --upgrade --release <release>`. |
| `ErrUnknownEntityKind` | `oci: unknown entity kind for mediatype dispatch` | `aggrega push` was given a non-publishable kind (Aggregate, Release, Manifest). |
| `ErrEntityVersionPathMismatch` | `oci: entity per-version subdirectory mismatch` | A published entity's `metadata.version` does not match its versioned-directory path. |

Two related sentinels live alongside the source-resolver: `ErrUnknownKind` (`pkg/sourceresolver`) for a Recipe `source:` whose kind has no registered adapter, and `ErrCacheMetadataInvalid` (`pkg/sourceresolver/metadata`) for a corrupt source-artifact cache slot — the latter wraps `ErrFetchIntegrity`, so it matches that sentinel too.

## Lockfile sentinels (`pkg/lockfile`)

The per-Release lockfile reader and the build-time drift verifier.

| Sentinel | Wrapped message | User-facing surface |
| --- | --- | --- |
| `ErrLockfileInvalid` | `lockfile: file failed schema validation` | The `<release-stem>.lock` file is structurally malformed (older and partial shapes load with diagnostics rather than this error). |
| `ErrLockfileDrift` | `lockfile: out of date; it no longer matches the current catalog` | A build's resolved dependencies do not match the lockfile; remediation: `aggrega pull --upgrade --release <release>`. |

## Dependency-resolution sentinels (`pkg/closure`)

The dependency resolution that `aggrega pull` runs to compute the lockfile.

| Sentinel | Wrapped message | User-facing surface |
| --- | --- | --- |
| `ErrMVSConflict` | `resolve: minimum version selection conflict — incompatible library version requirements` | Two consumers require incompatible versions of the same library. |
| `ErrUnresolvableURI` | `resolve: URI not resolvable via Lookup` | A referenced URI resolves through no tier (local, cache, or registry). |
| `ErrInvalidLibraryRef` | `resolve: invalid library reference URI` | A malformed schema / mapping library `$import:` or `$ref:` URI. |
| `ErrSourceTemplateAtLockTime` | `resolve: source-template evaluation failure at lock time` | A Recipe `source:` version template failed at lock time — typically by referencing `.provides`, which does not exist until build. |

## Workspace-config sentinel (`pkg/workspaceconfig`)

| Sentinel | Wrapped message | User-facing surface |
| --- | --- | --- |
| `ErrConfigInvalid` | `workspaceconfig: file failed schema validation` | A present `.aggrega-config.yaml` is structurally malformed. A missing file is not an error — defaults apply. |

## Wasm host loader

The embedded Wasm host loader emits its own guardrail sentinels — a manifest-rejected guardrail (a plugin requested a runtime-access capability the AOT-purity firewall denies), a guest-panic recovery, and a deterministic plugin-exit trap. These surface in the user-facing diagnostic when running a plugin (for example through `aggrega lint`), but they are declared in an internal package and are not part of the importable `errors.Is` matching surface.

## Matching guidance

The `errors.Is` predicate walks the wrap chain, so a sentinel match works even when the error is wrapped multiple times across pipeline stages. The typical integration pattern:

```go
err := compiler.Build(release, options)
switch {
case errors.Is(err, resolver.ErrParameterMissing):
    // distinct UX for missing-parameter cases
case errors.Is(err, resolver.ErrParameterContractViolation):
    // distinct UX for contract-violation cases
case errors.Is(err, resolver.ErrMissingRequiredFeature):
    // distinct UX for an unsatisfied required-feature declaration
case err != nil:
    // catch-all
}
```

Sentinels declared in different packages with the same short name (e.g., `ErrSchemaValidation` in both `pkg/resolver` and `pkg/validator`) are distinct values — they live in separate `var` blocks in separate packages and `errors.Is` distinguishes them by identity, not by name. Match against the fully-qualified package path the wrap chain carries; the wrapped message text is shared by both sentinels but the identity is the discriminator.

For the user-facing diagnostic catalogue (the messages developers see in their terminal when a build halts), see [fatal-halts.md](./fatal-halts.md). For the advisory-warning catalogue (non-halting `LINT:` and `WARN:` output), see [warnings.md](./warnings.md). For the category-prefix taxonomy (`DEVELOPER_ERROR:` / `OPS_ERROR:` / `CATALOG_ERROR:` / `TRANSLATION_ERROR:` / `FETCH_ERROR:` / `POLICY_ERROR:`), see [error-translation.md](./error-translation.md).
