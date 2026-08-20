# Error sentinels — canonical reference

Every fatal halt the compiler emits names a condition, and each condition carries two identifiers because two different kinds of consumer have to name it. The **code** is the string the condition is registered under: it names the condition itself, and it is what stays fixed as the Go packages around it evolve. The **sentinel** is the Go value `errors.Is` matches, obtained by calling the accessor the declaring package exports. One condition, two identifiers — match the sentinel to recognise the condition from Go, read the code when you need to record or key on it.

The user-facing diagnostic (the prefixed message catalogued in [fatal-halts.md](./fatal-halts.md) and [error-translation.md](./error-translation.md)) carries the developer-facing prose; the wrapped sentinel is what `errors.Is` matches against in programmatic consumers.

This page is the sentinel-keyed view of the catalogue. Programmers writing CI gates, IDE integrations, or build-orchestration code that needs to distinguish error kinds match against the sentinels listed here with the standard `errors.Is` predicate. Authors debugging a build by reading the emitted error text usually want the message-keyed views — [fatal-halts.md](./fatal-halts.md) for build-stopping errors, [warnings.md](./warnings.md) for advisory output.

Each row in the tables below names an **accessor** — a function taking no arguments, exported from the package the table names, that returns the sentinel. Importing that package and calling the accessor is the supported integration surface, which is why the tables write each one with its parentheses — the call is what yields a value `errors.Is` can match, and the name without them is a function rather than an error:

```go
import (
    "errors"

    "github.com/aggrega-ai/aggrega-cli/pkg/resolver"
)

if errors.Is(err, resolver.ErrParameterContractViolation()) {
    // handle parameter contract violations
}
```

The two identifiers carry their stability separately, and that separation is the reason a condition has both. A code is fixed once its condition is published, so it is the identifier to record wherever a condition has to be named durably. The accessors listed below are stable across patch releases; renames or removals are signalled by a release-notes entry and a deprecation cycle, and adding a new accessor within a package is additive and does not break existing matchers. Renaming an accessor does not move the code its condition was registered under, so a code you have recorded outlives a refactor of the Go surface. The code column carries that identifier, and it is the value a client of the structured diagnostic reads without linking these packages. It is published rather than inferred, because it need not restate the row it sits on — a re-exported name reports the code of the condition it forwards to, and a rule's code names the rule rather than the accessor. The message column is the literal text the sentinel renders; the user-facing diagnostic adds a bracketed category prefix (`[DEVELOPER_ERROR]` / `[OPS_ERROR]` / `[CATALOG_ERROR]` / `[TRANSLATION_ERROR]` / `[FETCH_ERROR]` / `[POLICY_ERROR]` per [error-translation.md](./error-translation.md)) and the source location ahead of that text.

## Reading the code of a condition

A code qualifies the declaring package and then names the rule — `<declaring-package>/<rule>` — in kebab-case throughout. Read it off an error with `CodeOf`, from `github.com/aggrega-ai/aggrega-cli/pkg/errors`, which walks the wrap chain the way `errors.Is` does, so the code survives however many frames wrapped the error on its way back to you. That package is itself named `errors`, so an import alias keeps it apart from the standard library:

```go
package release

import (
    "log"

    aggregaerrors "github.com/aggrega-ai/aggrega-cli/pkg/errors"
    "github.com/aggrega-ai/aggrega-cli/pkg/resolver"
)

// Load reads a Release and reports the code of whatever condition halted it.
func Load(path string) error {
    _, err := resolver.LoadRelease(path)
    if err == nil {
        return nil
    }
    if code, ok := aggregaerrors.CodeOf(err); ok {
        // code names the condition, in the form <declaring-package>/<rule>.
        log.Printf("%s halted: %s", path, code)
    }
    return err
}
```

`CodeOf` also reports whether any error in the chain carried a code at all; a chain carrying none is a fact about that chain rather than a failure. Where you would rather match the interface yourself, the same package exports it as `CodedError`, and `errors.As` finds it in the same walk.

**A code travels one way.** It is what a condition reports, never what identifies it to a matcher: writing the string into your own code gives you a string, and there is no path back from a string to the value `errors.Is` matches. Match the sentinel to recognise a condition; read the code to record one.

**A code is not part of what `aggrega` prints on a terminal.** That output is the category prefix, the source location and the message text catalogued in [fatal-halts.md](./fatal-halts.md), and a reader working from it uses the message-keyed views.

**Where a code does travel outside Go is the structured diagnostic the compiler-as-service daemon publishes**, as a `code` field of its own on each entry rather than anything folded into the message text — so an editor extension, or any other client of that protocol, branches on what an entry reports without linking these packages and without parsing prose. That one key carries a machine-matchable code whoever assigned it, and the entry says which layer raised it: the code of the condition a failure names, which is what this page catalogues, and equally the class code of an advisory a render raised — `unsupported-field` is one, and [warnings.md](./warnings.md) describes it — which is assigned where the advisory is raised rather than registered as a condition here. The field is omitted where nothing that produced the entry assigned a code: a failure naming no condition of Aggrega's own, and an advisory whose raiser assigned none. [aggrega serve](../cli/aggrega-serve.md) documents the entry shape, the key that names the layer, and when the field is present.

**Going the other way — from a code you are holding to the condition it names — the tables below are the published list.** Each row carries the code beside the accessor that yields the same condition in Go, so a code read off a structured diagnostic resolves to a name you can match and to the text the condition renders. The tables cover the conditions whose accessor you can import, and two kinds of code sit outside them: a class code, which names a class of advisory rather than a condition and so has no accessor to put beside it, and a code whose condition is declared only in a package you cannot import and is re-exported nowhere, where there is no matchable name to put beside it.

## The matchable surface, by declaring package

Every section below is one package you can import. Its heading is the package path relative to the module path `github.com/aggrega-ai/aggrega-cli`, so the section headed `pkg/resolver` is imported as `github.com/aggrega-ai/aggrega-cli/pkg/resolver`.

Entries are grouped by the package that **declares** the sentinel, because that is the package a matcher imports. Where in a build the condition is raised is a separate question, and one this page deliberately does not answer: a single sentinel is frequently raised from several places, and several are raised only from code the module does not export, so no per-entry answer would be true for every row. The message-keyed views answer the when-in-a-build question in terms you can observe — [fatal-halts.md](./fatal-halts.md) above all.

A few names appear in more than one package. Those are re-exports of one shared value rather than two conditions, so matching either name succeeds; the tables say so where both names are importable. Both rows carry the same code, which is the same fact stated on the identifier a client outside Go holds: one condition, one code, however many names reach it.

<!-- BEGIN GENERATED: error-identities -->
### pkg/catalog

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrAllVersionsRetracted()` | `catalog/all-versions-retracted` | `every published version this reference could select has been withdrawn` |
| `ErrAmbiguousImporterPlugin()` | `catalog/ambiguous-importer-plugin` | `format is advertised by more than one importer plugin` |
| `ErrAmbiguousParserPlugin()` | `catalog/ambiguous-parser-plugin` | `format is advertised by more than one parser plugin` |
| `ErrAmbiguousProviderPlugin()` | `catalog/ambiguous-provider-plugin` | `capability is served by more than one provider plugin; add a plugins.providers entry to select one` |
| `ErrAmbiguousTypeMapping()` | `catalog/ambiguous-type-mapping` | `manifest maps multiple version-distinct keys to the same base type; the type-to-recipe lookup is ambiguous` |
| `ErrDuplicateEntityIdentity()` | `catalog/duplicate-entity-identity` | `duplicate entity identity within a single catalog directory` |
| `ErrMalformedRecipeReference()` | `catalog/malformed-recipe-reference` | `malformed recipe reference in a Manifest mapping value` |
| `ErrManifestImplementsMismatch()` | `catalog/manifest-implements-mismatch` | `manifest mapping entry's recipe spec.implements does not match the mapped component-type / feature-type key` |
| `ErrNoImporterForFormat()` | `catalog/no-importer-for-format` | `no importer plugin advertises the requested format` |
| `ErrNoParserForFormat()` | `catalog/no-parser-for-format` | `no parser plugin advertises the requested format` |
| `ErrNoRecipeResolved()` | `catalog/no-recipe-resolved` | `no recipe resolved for component/feature instance: add an explicit Manifest mapping for its type` |
| `ErrProviderBindingUnsatisfied()` | `catalog/provider-binding-unsatisfied` | `plugins.providers entry names a plugin no provider-rendering plugin serving the capability matches` |
| `ErrProviderVersionUnsatisfiable()` | `catalog/provider-version-unsatisfiable` | `no provider-rendering plugin version satisfies the recipe's provider version pin` |
| `ErrQualifiedPluginReference()` | `catalog/qualified-plugin-reference` | `wasm plugin reference must be the plugin coordinate identity (<pluginType>/<name>:<version>), not a registry-qualified or artifact path` |
| `ErrUnsatisfiableEntityVersion()` | `catalog/unsatisfiable-entity-version` | `no catalog version satisfies the referenced version constraint` |
| `ErrUnscopedPluginReference()` | `catalog/unscoped-plugin-reference` | `wasm plugin reference must carry a pluginType scope (<pluginType>/<name>); an empty scope cannot bind to an OCI location` |
| `ErrUnscopedRecipeReference()` | `catalog/unscoped-recipe-reference` | `recipe reference must be provider-scoped (<provider>/<name>); an empty provider cannot bind to an OCI location` |

### pkg/closure

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrInvalidLibraryRef()` | `closure/invalid-library-ref` | `resolve: invalid library reference URI` |
| `ErrMVSConflict()` | `closure/mvs-conflict` | `resolve: minimum version selection conflict — incompatible library version requirements` |
| `ErrNoAggregateLoader()` | `closure/no-aggregate-loader` | `resolve: catalog lookup cannot load resolved sub-aggregate bodies` |
| `ErrNoRecipeLoader()` | `closure/no-recipe-loader` | `resolve: catalog lookup cannot load resolved recipe and plugin bodies` |
| `ErrSourceTemplateAtLockTime()` | `closure/source-template-at-lock-time` | `resolve: source-template evaluation failure at lock time` |
| `ErrSourceTemplateParse()` | `closure/source-template-parse` | `resolve: source-template parse error` |
| `ErrSourceTemplateProvidesRef()` | `closure/source-template-provides-ref` | `resolve: source-template references .provides (invalid reverse reference)` |
| `ErrSubAggregateDepth()` | `closure/sub-aggregate-depth` | `resolve: sub-aggregate inclusion depth exceeded` |
| `ErrUnresolvableURI()` | `closure/unresolvable-uri` | `resolve: no entity in the catalog matches this URI` |

### pkg/compactform

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrAmbiguousDispatch()` | `compactform/ambiguous-dispatch` | `compactform: ambiguous dispatch — $mode required` |
| `ErrCircularRef()` | `refcycle/cycle` | `circular reference expansion` |
| `ErrConstraintTypeMismatch()` | `compactform/constraint-type-mismatch` | `compactform: constraint not valid for declared type` |
| `ErrEscapeContentInvalid()` | `compactform/escape-content-invalid` | `compactform: $jsonschema content invalid` |
| `ErrHostInLibraryRef()` | `compactform/host-in-library-ref` | `compactform: cross-document $ref carries a registry host; reference the library by identity` |
| `ErrReferenceUnresolvable()` | `compactform/reference-unresolvable` | `compactform: $ref unresolvable` |
| `ErrUnknownKeyword()` | `compactform/unknown-keyword` | `compactform: unknown keyword` |
| `ErrUnresolvedSchemaLibraryRef()` | `compactform/unresolved-schema-library-ref` | `compactform: cross-document $ref target not found` |

- `ErrCircularRef()` is the same value as `pkg/refcycle.ErrCycle()`, so a match against either name succeeds.

### pkg/deprecation

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrDeprecatedEntity()` | `deprecation/deprecated-entity` | `deprecation: build consumes a deprecated entity` |

### pkg/docscache

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrFetchNotFound()` | `oci/fetch-not-found` | `oci: artifact not found at remote source` |
| `ErrNotDocsBundle()` | `docscache/not-docs-bundle` | `docscache: artifact is not a documentation bundle` |
| `ErrPageNotFound()` | `docscache/page-not-found` | `docscache: page not found in documentation bundle` |

- `ErrFetchNotFound()` is the same value as `pkg/oci.ErrFetchNotFound()`, so a match against either name succeeds.

### pkg/egress

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrOfflineEgress()` | `egress/offline-egress` | ``egress: network access refused because the workspace is offline; remediation: unset workspace.offline (or AGGREGA_OFFLINE) or run `aggrega pull --release <release>` from a connected environment to populate the cache`` |

### pkg/externalinputs

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrAcquisitionDisabled()` | `externalinputs/acquisition-disabled` | `externalinputs: acquisition is disabled for unpinned inputs` |
| `ErrDigestMismatch()` | `externalinputs/digest-mismatch` | `externalinputs: fetched bytes mismatch the pinned digest` |
| `ErrSchemeNotAllowed()` | `externalinputs/scheme-not-allowed` | `externalinputs: URL scheme is not allowed` |
| `ErrStoreCorrupt()` | `externalinputs/store-corrupt` | `externalinputs: store blob mismatches its pinned record` |

### pkg/lockfile

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrLockfileDrift()` | `lockfile/lockfile-drift` | `lockfile: out of date; it no longer matches the current catalog` |
| `ErrLockfileInvalid()` | `lockfile/lockfile-invalid` | `lockfile: file failed schema validation` |

### pkg/oci

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrAmbiguousContentLayer()` | `oci/ambiguous-content-layer` | `oci: manifest has multiple layers of the expected content media type` |
| `ErrCachedManifestIntegrity()` | `oci/cached-manifest-integrity` | `oci: cached manifest digest mismatch` |
| `ErrEntityVersionPathMismatch()` | `oci/entity-version-path-mismatch` | `oci: entity per-version subdirectory mismatch` |
| `ErrFetchIntegrity()` | `oci/fetch-integrity` | `oci: content digest mismatch` |
| `ErrFetchNetworkUnreachable()` | `oci/fetch-network-unreachable` | `oci: network unreachable` |
| `ErrFetchNotFound()` | `oci/fetch-not-found` | `oci: artifact not found at remote source` |
| `ErrFetchUnauthorized()` | `oci/fetch-unauthorized` | `oci: authentication required or failed` |
| `ErrImmutableTagConflict()` | `oci/immutable-tag-conflict` | `oci: tag already published with different content` |
| `ErrNoContentLayer()` | `oci/no-content-layer` | `oci: manifest has no layer of the expected content media type` |
| `ErrOCILocationCollision()` | `oci/oci-location-collision` | `oci: distinct catalog identities map to the same OCI repository location` |
| `ErrReferrerDiscoveryUnavailable()` | `oci/referrer-discovery-unavailable` | `oci: referrer discovery could not be completed` |
| `ErrUnknownEntityKind()` | `oci/unknown-entity-kind` | `oci: unknown entity kind for mediatype dispatch` |

### pkg/pluginpath

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrPluginBundleDigestMismatch()` | `pluginpath/plugin-bundle-digest-mismatch` | `cached signature bundle does not match its recorded digest` |
| `ErrPluginEntityNotFound()` | `pluginpath/plugin-entity-not-found` | `plugin reference is not a Plugin entity` |

### pkg/plugintest

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrCommandsMismatch()` | `wasm/wasm-commands-mirror-mismatch` | `wasm: recorded command mirror does not match plugin describe()` |
| `ErrContractMismatch()` | `wasm/wasm-contract-mismatch` | `wasm: entity contract claim does not match plugin describe()` |
| `ErrHostFunctionsMismatch()` | `wasm/wasm-host-functions-stamp-mismatch` | `wasm: stamped host-function record does not match .wasm imports` |
| `ErrRejected()` | `wasm/wasm-manifest-rejected` | `wasm: plugin rejected by the sandbox` |
| `ErrTypeMismatch()` | `wasm/wasm-plugin-type-mismatch` | `wasm: declared plugin type does not match plugin describe()` |

### pkg/refcycle

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrCycle()` | `refcycle/cycle` | `circular reference expansion` |

### pkg/registrytrust

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrMalformedTrust()` | `registrytrust/malformed-trust` | `registrytrust: advertised trust config is malformed` |
| `ErrNoTrustAdvertised()` | `registrytrust/no-trust-advertised` | `registrytrust: registry advertises no trust config` |

### pkg/resolver

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrAttachmentSlotNearMiss()` | `resolver/attachment-slot-near-miss` | `attachment name is a near miss for a declared slot` |
| `ErrAttachmentSlotShape()` | `resolver/attachment-slot-shape` | `attachment does not conform to its declared slot shape` |
| `ErrDuplicateBoundaryComponent()` | `resolver/duplicate-boundary-component` | `component declared in more than one boundary: declare each component in exactly one boundary` |
| `ErrDuplicateTriadIdentity()` | `resolver/duplicate-triad-identity` | `duplicate Aggregate/Manifest identity (metadata.name) in the Release directory` |
| `ErrFeatureMergeConflict()` | `resolver/feature-merge-conflict` | `feature merge conflict: reconcile the Aggregate and Release declarations for the feature` |
| `ErrGuardEntityViewInconsistency()` | `resolver/guard-entity-view-inconsistency` | `guard catalog-entity view inconsistency` |
| `ErrInjectKeyCollision()` | `resolver/inject-key-collision` | `duplicate delivery key across inject sources` |
| `ErrInvalidInjectKey()` | `resolver/invalid-inject-key` | `invalid inject key: the from-key must name a declared provides key of the target component type` |
| `ErrInvalidInstanceName()` | `resolver/invalid-instance-name` | `invalid instance name: names must match ^[a-zA-Z0-9_-]+$ (letters, digits, hyphen, underscore; no dots)` |
| `ErrInvalidParameterRef()` | `resolver/invalid-parameter-ref` | `invalid parameter reference: check the {{ .parameters.* }} expression names a declared parameter and parses as a Go template` |
| `ErrInvalidTargetRef()` | `resolver/invalid-target-ref` | `invalid target reference: each dot-separated segment must match ^[a-zA-Z0-9_-]+$` |
| `ErrManifestCrossBindingPillarCollision()` | `resolver/manifest-cross-binding-pillar-collision` | `manifest annotation bindings collide on same Feature path+pillar` |
| `ErrManifestReservedPrefix()` | `resolver/manifest-reserved-prefix` | `manifest annotation binding uses reserved prefix` |
| `ErrMissingRequiredFeature()` | `resolver/missing-required-feature` | `missing required feature: attach a Feature of the required type to the component` |
| `ErrMissingRequiredSocket()` | `resolver/missing-required-socket` | `required uses socket not populated` |
| `ErrParameterContractViolation()` | `resolver/parameter-contract-violation` | `parameter contract violated` |
| `ErrParameterMissing()` | `resolver/parameter-missing` | `required parameter not supplied` |
| `ErrParametersImportLoad()` | `resolver/parameters-import-load` | `parameters $import: load failed` |
| `ErrProvidesKeyNotDeclared()` | `resolver/provides-key-not-declared` | `Recipe publishes a provides key its Component does not declare` |
| `ErrSchemaConformance()` | `resolver/schema-conformance` | `authored pillar does not conform to its declared schema` |
| `ErrSelfInjectForbidden()` | `resolver/self-inject-forbidden` | `self-inject on component without spec.inject allowlist` |
| `ErrTriadRefUnresolvable()` | `resolver/triad-ref-unresolvable` | `aggregate/manifest reference unresolvable` |
| `ErrUnknownUsesSocket()` | `resolver/unknown-uses-socket` | `unknown uses socket: name a socket the entity declares in its usesSchema — only a component's own uses block may name one the catalog did not declare` |
| `ErrUnnormalizedRelease()` | `resolver/unnormalized-release` | `release reached resolve un-normalized (non-empty root components alongside a synthesized default boundary)` |
| `ErrUnreadParameter()` | `resolver/unread-parameter` | `declared parameter is read by no reference in the Aggregate` |
| `ErrUsesSocketNearMiss()` | `resolver/uses-socket-near-miss` | `uses socket name is a near miss for a declared socket` |
| `ErrYAMLLoad()` | `resolver/yaml-load` | `YAML load failed: check the file exists, is readable, and contains well-formed YAML` |

### pkg/signing

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrKeylessLive()` | `signing/keyless-live` | `signing: keyless signing requires a live identity provider, Fulcio, and Rekor` |
| `ErrNoSignatureFound()` | `signing/no-signature-found` | `signing: no signature found for an artifact that requires one` |
| `ErrNoTrustedIdentities()` | `signing/no-trusted-identities` | `signing: keyless verification requires at least one trusted identity` |
| `ErrSignatureInvalid()` | `signing/signature-invalid` | `signing: signature does not verify` |
| `ErrSignatureVerificationFailed()` | `signing/signature-verification-failed` | `signing: signature bundle does not verify` |
| `ErrSigningPolicyRequiresSignature()` | `signing/signing-policy-requires-signature` | `signing: signing policy requires a signature for this artifact kind; refusing to push unsigned content` |
| `ErrTrustRootLoad()` | `signing/trust-root-load` | `signing: cannot load pinned trust root` |
| `ErrUnsignedPushRefused()` | `signing/unsigned-push-refused` | `signing: registry requires signatures; refusing to push unsigned content` |
| `ErrUnsupportedKey()` | `signing/unsupported-key` | `signing: unsupported held-key type` |
| `ErrUntrustedIdentity()` | `signing/untrusted-identity` | `signing: signature identity is not trusted for this registry` |

### pkg/sourcecache

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrFetchIntegrity()` | `oci/fetch-integrity` | `oci: content digest mismatch` |
| `ErrFetchNotFound()` | `oci/fetch-not-found` | `oci: artifact not found at remote source` |

- `ErrFetchIntegrity()` is the same value as `pkg/oci.ErrFetchIntegrity()`, so a match against either name succeeds.
- `ErrFetchNotFound()` is the same value as `pkg/oci.ErrFetchNotFound()`, so a match against either name succeeds.

### pkg/sourceresolver

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrFetchIntegrity()` | `oci/fetch-integrity` | `oci: content digest mismatch` |
| `ErrFetchNetworkUnreachable()` | `oci/fetch-network-unreachable` | `oci: network unreachable` |
| `ErrFetchNotFound()` | `oci/fetch-not-found` | `oci: artifact not found at remote source` |
| `ErrFetchUnauthorized()` | `oci/fetch-unauthorized` | `oci: authentication required or failed` |
| `ErrUnknownKind()` | `sourceresolver/unknown-kind` | `sourceresolver: no adapter registered for source kind` |

- `ErrFetchIntegrity()` is the same value as `pkg/oci.ErrFetchIntegrity()`, so a match against either name succeeds.
- `ErrFetchNetworkUnreachable()` is the same value as `pkg/oci.ErrFetchNetworkUnreachable()`, so a match against either name succeeds.
- `ErrFetchNotFound()` is the same value as `pkg/oci.ErrFetchNotFound()`, so a match against either name succeeds.
- `ErrFetchUnauthorized()` is the same value as `pkg/oci.ErrFetchUnauthorized()`, so a match against either name succeeds.

### pkg/sourceresolver/cacheslot

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrEmptyWorkspaceRoot()` | `sourceresolver-cacheslot/empty-workspace-root` | `cacheslot: empty workspaceRoot` |

### pkg/types

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrArtifactEntryShape()` | `types/artifact-entry-shape` | `artifacts entry: shape must be a string scalar or {$import: <local-path>}` |
| `ErrArtifactsLibraryEntryShape()` | `types/artifacts-library-entry-shape` | `artifactslibrary: entry must be a mapping of filename to a string body` |
| `ErrForbiddenKeyword()` | `types/forbidden-keyword` | `schemalibrary: forbidden JSON Schema keyword` |
| `ErrMappingEntryNotScalar()` | `types/mapping-entry-not-scalar` | `mappinglibrary: entry body must be a string scalar` |
| `ErrOrderedMapDecodeDepthExceeded()` | `types/ordered-map-decode-depth-exceeded` | `OrderedMap: decode depth exceeded` |
| `ErrParametersShape()` | `types/parameters-shape` | `parameters: shape must be an inline object or {$import: <local-path>}` |
| `ErrTemplateNotFound()` | `types/template-not-found` | `schemalibrary: template not found` |
| `ErrTemplateParamMissing()` | `types/template-param-missing` | `schemalibrary: template parameter missing` |
| `ErrTemplateParamTypeMismatch()` | `types/template-param-type-mismatch` | `schemalibrary: template parameter type mismatch` |
| `ErrValuesMappingShape()` | `types/values-mapping-shape` | `valuesmapping: shape must be a string scalar or {$import: <path-or-library-identity>}` |
| `ErrWellKnownAnnotationScope()` | `types/well-known-annotation-scope` | `wellKnownAnnotations: a key is declared at a scope the provider's contract does not render` |
| `ErrWorkloadEntryNotScalar()` | `types/workload-entry-not-scalar` | `workloadlibrary: entry body must be a string scalar` |
| `ErrWorkloadTemplateShape()` | `types/workload-template-shape` | `workload: shape must be a string scalar or {$import: <path-or-library-identity>}` |

### pkg/usesedge

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrDanglingUsesTarget()` | `compiler-topology/dangling-uses-target` | `uses edge target does not exist` |
| `ErrReleaseEdgeRetarget()` | `compiler-topology/release-edge-retarget` | `release edge retargets a developer-declared edge` |

### pkg/validator

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrAssertionNameCollision()` | `validator/assertion-name-collision` | `assertion name declared twice across the extends chain: rename the extending entity's assertion, whose assertions add to the base's and never replace one` |
| `ErrCyclicExtension()` | `validator/cyclic-extension` | `cyclic extends chain` |
| `ErrFeatureRecipeEvalProviderConstraint()` | `validator/feature-recipe-eval-provider-constraint` | `featurerecipe eval-provider constraint: render input-kind fields are forbidden when provider is eval` |
| `ErrFeatureRecipeRule1()` | `validator/feature-recipe-values-mapping-requires-source` | `FeatureRecipe: valuesMapping requires source` |
| `ErrInheritanceMerge()` | `validator/inheritance-merge` | `inheritance merge failed: resolve the conflicting field definitions across the extends chain` |
| `ErrRecipeEvalProviderConstraint()` | `validator/recipe-eval-provider-constraint` | `recipe eval-provider constraint: input-kind fields are forbidden when provider is eval` |
| `ErrRecipeOutputComponentLabelCollision()` | `validator/recipe-output-component-label-collision` | `recipe output-component-labels constraint: key is also declared in outputLabels` |
| `ErrRecipeOutputLabelReservedNamespace()` | `validator/recipe-output-label-reserved-namespace` | `recipe output-labels constraint: key uses a reserved namespace` |
| `ErrRecipeRule1()` | `validator/recipe-values-mapping-requires-source` | `Recipe: valuesMapping requires source` |
| `ErrRecipeRule5()` | `validator/recipe-no-input-kind` | `Recipe: at least one input kind required` |
| `ErrRecipeRule7()` | `validator/recipe-filename-collision-across-input-kinds` | `Recipe: filename collision across input-kind origins at emission` |
| `ErrSlotNotReferenceable()` | `validator/slot-not-referenceable` | `workload attachment slot is not referenceable` |
| `ErrWorkloadFeaturesSchema()` | `validator/workload-features-schema` | `workload featuresSchema cross-check failed` |
| `ErrWorkloadValidation()` | `validator/workload-validation` | `workload validation failed` |

### pkg/validator/envelope

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrEntityEnvelope()` | `validator-envelope/entity-envelope` | `document envelope validation failed` |

### pkg/validator/jsonschema

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrExtensionEval()` | `validator-jsonschema/extension-eval` | `validator/jsonschema: x-aggrega extension evaluation failed` |
| `ErrInstanceValidation()` | `validator-jsonschema/instance-validation` | `validator/jsonschema: instance validation failed` |
| `ErrSchemaResolve()` | `validator-jsonschema/schema-resolve` | `validator/jsonschema: schema resolution failed` |

### pkg/validator/merger

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrCyclicExtension()` | `validator-merger/cyclic-extension` | `merger: cyclic extends chain` |
| `ErrMaxDepth()` | `validator-merger/max-depth` | `merger: extends chain exceeds maximum depth` |
| `ErrMergeInvalid()` | `validator-merger/merge-invalid` | `merger: invalid merge input` |

### pkg/workspaceconfig

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrAmbiguousRegistryAlias()` | `workspaceconfig/ambiguous-registry-alias` | `workspaceconfig: registry alias matches more than one host` |
| `ErrCapabilityOnCrossCuttingSocket()` | `workspaceconfig/capability-on-cross-cutting-socket` | `workspaceconfig: a cross-cutting socket is bound by capability but attaches by uri` |
| `ErrConfigInvalid()` | `workspaceconfig/config-invalid` | `workspaceconfig: file failed schema validation` |
| `ErrDuplicateProviderTarget()` | `workspaceconfig/duplicate-provider-target` | `workspaceconfig: capability is bound to more than one provider plugin` |
| `ErrDuplicateRegistryAlias()` | `workspaceconfig/duplicate-registry-alias` | `workspaceconfig: registry alias is already used by another host` |
| `ErrGovernanceRoleInvalid()` | `workspaceconfig/governance-role-invalid` | `workspaceconfig: a governance attachment declares no role or an unknown role` |
| `ErrInertFieldOnProviderSocket()` | `workspaceconfig/inert-field-on-provider-socket` | `workspaceconfig: a provider socket binding sets a field with no referent on that socket` |

### pkg/yamlpos

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrPositionOutOfRange()` | `yamlpos/position-out-of-range` | `position out of range` |
<!-- END GENERATED: error-identities -->

## Sentinels that carry another sentinel

`ErrCacheMetadataInvalid` (`pkg/sourceresolver/metadata`) reports a corrupt source-artifact cache slot. It is declared as a wrapper around `ErrFetchIntegrity()` rather than as an identity of its own, so it does not appear in the tables above and a match against `ErrFetchIntegrity()` succeeds for it as well. Because it wraps a sentinel instead of declaring one, it is exported as a value rather than as a function: match it as `ErrCacheMetadataInvalid`, with no parentheses. Match the wrapper when you want that specific condition, and the wrapped sentinel when you want the whole integrity class.

## Conditions with no matchable sentinel

Some compilation stages declare their sentinels in packages the compiler does not export, so there is nothing for `errors.Is` to reference and no matcher can be written against them. They are described here rather than tabulated, because a table on this page is a promise that the left-hand column can be dereferenced.

Their diagnostics reach you in full through the emitted error text and through the message-keyed views — [fatal-halts.md](./fatal-halts.md) in particular — which is the supported way to recognise them:

- **Topology construction** (graph construction and sub-aggregate flattening) reports a sub-Aggregate that could not be loaded, naming the unreachable Aggregate URI; a `uses:` declaration whose structural shape does not match the schema; nesting depth exceeded; and a flattened node-ID collision, where two sub-Aggregates compile to the same node ID and one instance name has to be renamed to disambiguate.
- **Graph finalization** (Feature merging across the Aggregate and Release surfaces) reports a Feature type declared inconsistently between the two.
- **Static analysis** (selector evaluation and cross-node type-safety checks) reports a `selector:` violation; a catalog-resolution miss it cannot proceed past, naming the unreachable entity; and a policy rejection, where a plugin attached at a governance verdict role rejected the assembled build. A policy rejection carries the `POLICY_ERROR` category, the rejecting plugin's name, and the rule message the plugin supplied.
- **Rendering** (provider dispatch and per-provider rendering) reports an unknown provider.
- **The embedded Wasm host loader** emits its own guardrail sentinels — a manifest-rejected guardrail (a plugin requested a runtime-access capability the AOT-purity firewall denies), a guest-panic recovery, and a deterministic plugin-exit trap. These surface in the user-facing diagnostic when running a plugin (for example through `aggrega lint`). Plugin authors testing a guest against the host reach the same conditions by importable name through `pkg/plugintest`, listed above.

To gate a pipeline on a policy rejection specifically, match the `POLICY_ERROR` category prefix in the diagnostic rather than a sentinel; the category is a documented part of the error surface, described in [error-translation.md](./error-translation.md).

## Matching guidance

The `errors.Is` predicate walks the wrap chain, so a sentinel match works even when the error is wrapped several times on its way back to you. Match against the error an exported function returned:

```go
package release

import (
    "errors"
    "fmt"

    "github.com/aggrega-ai/aggrega-cli/pkg/resolver"
    "github.com/aggrega-ai/aggrega-cli/pkg/validator/envelope"
)

// Load reads a Release and reports the distinct failures a caller handles
// differently.
func Load(path string) error {
    _, err := resolver.LoadRelease(path)
    switch {
    case errors.Is(err, envelope.ErrEntityEnvelope()):
        return fmt.Errorf("%s is not a Release: %w", path, err)
    case errors.Is(err, resolver.ErrYAMLLoad()):
        return fmt.Errorf("%s could not be read as YAML: %w", path, err)
    case err != nil:
        return err
    }
    return nil
}
```

There is no exported entry point that runs a whole build, so `errors.Is` matching applies to code calling these packages directly. To gate CI on a build, run `aggrega build` and read its exit status and its diagnostics, whose message prefixes and text are catalogued in [fatal-halts.md](./fatal-halts.md) and [error-translation.md](./error-translation.md).

The two gating paths exist because the two identifiers reach different distances. A gate written in Go links these packages, matches sentinels, and can read a code off any error it holds. A gate written around the command has neither — it has the exit status and the printed text, which is why the message-keyed views are the surface it works against. Carry a code through a Go integration; do not look for one in the command's output.

Sentinels declared in different packages with the same short name are distinct conditions, not two spellings of one: `errors.Is` distinguishes them by identity, so a match against one does not match the other. The re-exports called out in the tables are the exception, and they are called out precisely because they are the case where two names do match. Match against the name in the package the tables list it under, and treat a short name on its own as ambiguous.

For the user-facing diagnostic catalogue (the messages developers see in their terminal when a build halts), see [fatal-halts.md](./fatal-halts.md). For the advisory-warning catalogue (the non-halting `warning:`, `lint:` and `notice:` output), see [warnings.md](./warnings.md). For the category-prefix taxonomy (`[DEVELOPER_ERROR]` / `[OPS_ERROR]` / `[CATALOG_ERROR]` / `[TRANSLATION_ERROR]` / `[FETCH_ERROR]` / `[POLICY_ERROR]`), see [error-translation.md](./error-translation.md).
