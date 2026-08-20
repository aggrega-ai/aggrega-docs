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

The two identifiers carry their stability separately, and that separation is the reason a condition has both. A code is fixed once its condition is published, so it is the identifier to record wherever a condition has to be named durably. The accessors listed below are stable across patch releases; renames or removals are signalled by a release-notes entry and a deprecation cycle, and adding a new accessor within a package is additive and does not break existing matchers. Renaming an accessor does not move the code its condition was registered under, so a code you have recorded outlives a refactor of the Go surface. The message column is the literal text the sentinel renders; the user-facing diagnostic adds a category prefix (`DEVELOPER_ERROR:` / `OPS_ERROR:` / `CATALOG_ERROR:` / `TRANSLATION_ERROR:` / `FETCH_ERROR:` / `POLICY_ERROR:` per [error-translation.md](./error-translation.md)) and the source location ahead of that text.

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

**Where a code does travel outside Go is the structured diagnostic the compiler-as-service daemon publishes**, as a `code` field of its own on each entry rather than anything folded into the message text — so an editor extension, or any other client of that protocol, branches on the condition without linking these packages and without parsing prose. The field is omitted on an entry whose failure names no condition of Aggrega's own; [aggrega serve](../cli/aggrega-serve.md) documents the entry shape and when the field is present.

## The matchable surface, by declaring package

Every section below is one package you can import. Its heading is the package path relative to the module path `github.com/aggrega-ai/aggrega-cli`, so the section headed `pkg/resolver` is imported as `github.com/aggrega-ai/aggrega-cli/pkg/resolver`.

Entries are grouped by the package that **declares** the sentinel, because that is the package a matcher imports. Where in a build the condition is raised is a separate question, and one this page deliberately does not answer: a single sentinel is frequently raised from several places, and several are raised only from code the module does not export, so no per-entry answer would be true for every row. The message-keyed views answer the when-in-a-build question in terms you can observe — [fatal-halts.md](./fatal-halts.md) above all.

A few names appear in more than one package. Those are re-exports of one shared value rather than two conditions, so matching either name succeeds; the tables say so where both names are importable.

<!-- BEGIN GENERATED: error-identities -->
### pkg/catalog

| Sentinel | Message |
| --- | --- |
| `ErrAllVersionsRetracted()` | `every published version this reference could select has been withdrawn` |
| `ErrAmbiguousImporterPlugin()` | `format is advertised by more than one importer plugin` |
| `ErrAmbiguousParserPlugin()` | `format is advertised by more than one parser plugin` |
| `ErrAmbiguousProviderPlugin()` | `capability is served by more than one provider plugin; add a plugins.providers entry to select one` |
| `ErrAmbiguousTypeMapping()` | `manifest maps multiple version-distinct keys to the same base type; the type-to-recipe lookup is ambiguous` |
| `ErrDuplicateEntityIdentity()` | `duplicate entity identity within a single catalog directory` |
| `ErrMalformedRecipeReference()` | `malformed recipe reference in a Manifest mapping value` |
| `ErrManifestImplementsMismatch()` | `manifest mapping entry's recipe spec.implements does not match the mapped component-type / feature-type key` |
| `ErrNoImporterForFormat()` | `no importer plugin advertises the requested format` |
| `ErrNoParserForFormat()` | `no parser plugin advertises the requested format` |
| `ErrNoRecipeResolved()` | `no recipe resolved for component/feature instance: add an explicit Manifest mapping for its type` |
| `ErrProviderBindingUnsatisfied()` | `plugins.providers entry names a plugin no provider-rendering plugin serving the capability matches` |
| `ErrProviderVersionUnsatisfiable()` | `no provider-rendering plugin version satisfies the recipe's provider version pin` |
| `ErrQualifiedPluginReference()` | `wasm plugin reference must be the plugin coordinate identity (<pluginType>/<name>:<version>), not a registry-qualified or artifact path` |
| `ErrUnsatisfiableEntityVersion()` | `no catalog version satisfies the referenced version constraint` |
| `ErrUnscopedPluginReference()` | `wasm plugin reference must carry a pluginType scope (<pluginType>/<name>); an empty scope cannot bind to an OCI location` |
| `ErrUnscopedRecipeReference()` | `recipe reference must be provider-scoped (<provider>/<name>); an empty provider cannot bind to an OCI location` |

### pkg/closure

| Sentinel | Message |
| --- | --- |
| `ErrInvalidLibraryRef()` | `resolve: invalid library reference URI` |
| `ErrMVSConflict()` | `resolve: minimum version selection conflict — incompatible library version requirements` |
| `ErrNoAggregateLoader()` | `resolve: catalog lookup cannot load resolved sub-aggregate bodies` |
| `ErrNoRecipeLoader()` | `resolve: catalog lookup cannot load resolved recipe and plugin bodies` |
| `ErrSourceTemplateAtLockTime()` | `resolve: source-template evaluation failure at lock time` |
| `ErrSourceTemplateParse()` | `resolve: source-template parse error` |
| `ErrSourceTemplateProvidesRef()` | `resolve: source-template references .provides (invalid reverse reference)` |
| `ErrSubAggregateDepth()` | `resolve: sub-aggregate inclusion depth exceeded` |
| `ErrUnresolvableURI()` | `resolve: no entity in the catalog matches this URI` |

### pkg/compactform

| Sentinel | Message |
| --- | --- |
| `ErrAmbiguousDispatch()` | `compactform: ambiguous dispatch — $mode required` |
| `ErrCircularRef()` | `circular reference expansion` |
| `ErrConstraintTypeMismatch()` | `compactform: constraint not valid for declared type` |
| `ErrEscapeContentInvalid()` | `compactform: $jsonschema content invalid` |
| `ErrHostInLibraryRef()` | `compactform: cross-document $ref carries a registry host; reference the library by identity` |
| `ErrReferenceUnresolvable()` | `compactform: $ref unresolvable` |
| `ErrUnknownKeyword()` | `compactform: unknown keyword` |
| `ErrUnresolvedSchemaLibraryRef()` | `compactform: cross-document $ref target not found` |

- `ErrCircularRef()` is the same value as `pkg/refcycle.ErrCycle()`, so a match against either name succeeds.

### pkg/deprecation

| Sentinel | Message |
| --- | --- |
| `ErrDeprecatedEntity()` | `deprecation: build consumes a deprecated entity` |

### pkg/docscache

| Sentinel | Message |
| --- | --- |
| `ErrFetchNotFound()` | `oci: artifact not found at remote source` |
| `ErrNotDocsBundle()` | `docscache: artifact is not a documentation bundle` |
| `ErrPageNotFound()` | `docscache: page not found in documentation bundle` |

- `ErrFetchNotFound()` is the same value as `pkg/oci.ErrFetchNotFound()`, so a match against either name succeeds.

### pkg/egress

| Sentinel | Message |
| --- | --- |
| `ErrOfflineEgress()` | ``egress: network access refused because the workspace is offline; remediation: unset workspace.offline (or AGGREGA_OFFLINE) or run `aggrega pull --release <release>` from a connected environment to populate the cache`` |

### pkg/externalinputs

| Sentinel | Message |
| --- | --- |
| `ErrAcquisitionDisabled()` | `externalinputs: acquisition is disabled for unpinned inputs` |
| `ErrDigestMismatch()` | `externalinputs: fetched bytes mismatch the pinned digest` |
| `ErrSchemeNotAllowed()` | `externalinputs: URL scheme is not allowed` |
| `ErrStoreCorrupt()` | `externalinputs: store blob mismatches its pinned record` |

### pkg/lockfile

| Sentinel | Message |
| --- | --- |
| `ErrLockfileDrift()` | `lockfile: out of date; it no longer matches the current catalog` |
| `ErrLockfileInvalid()` | `lockfile: file failed schema validation` |

### pkg/oci

| Sentinel | Message |
| --- | --- |
| `ErrAmbiguousContentLayer()` | `oci: manifest has multiple layers of the expected content media type` |
| `ErrCachedManifestIntegrity()` | `oci: cached manifest digest mismatch` |
| `ErrEntityVersionPathMismatch()` | `oci: entity per-version subdirectory mismatch` |
| `ErrFetchIntegrity()` | `oci: content digest mismatch` |
| `ErrFetchNetworkUnreachable()` | `oci: network unreachable` |
| `ErrFetchNotFound()` | `oci: artifact not found at remote source` |
| `ErrFetchUnauthorized()` | `oci: authentication required or failed` |
| `ErrImmutableTagConflict()` | `oci: tag already published with different content` |
| `ErrNoContentLayer()` | `oci: manifest has no layer of the expected content media type` |
| `ErrOCILocationCollision()` | `oci: distinct catalog identities map to the same OCI repository location` |
| `ErrReferrerDiscoveryUnavailable()` | `oci: referrer discovery could not be completed` |
| `ErrUnknownEntityKind()` | `oci: unknown entity kind for mediatype dispatch` |

### pkg/pluginpath

| Sentinel | Message |
| --- | --- |
| `ErrPluginBundleDigestMismatch()` | `cached signature bundle does not match its recorded digest` |
| `ErrPluginEntityNotFound()` | `plugin reference is not a Plugin entity` |

### pkg/plugintest

| Sentinel | Message |
| --- | --- |
| `ErrCommandsMismatch()` | `wasm: recorded command mirror does not match plugin describe()` |
| `ErrContractMismatch()` | `wasm: entity contract claim does not match plugin describe()` |
| `ErrHostFunctionsMismatch()` | `wasm: stamped host-function record does not match .wasm imports` |
| `ErrRejected()` | `wasm: plugin rejected by the sandbox` |
| `ErrTypeMismatch()` | `wasm: declared plugin type does not match plugin describe()` |

### pkg/refcycle

| Sentinel | Message |
| --- | --- |
| `ErrCycle()` | `circular reference expansion` |

### pkg/registrytrust

| Sentinel | Message |
| --- | --- |
| `ErrMalformedTrust()` | `registrytrust: advertised trust config is malformed` |
| `ErrNoTrustAdvertised()` | `registrytrust: registry advertises no trust config` |

### pkg/resolver

| Sentinel | Message |
| --- | --- |
| `ErrAttachmentSlotNearMiss()` | `attachment name is a near miss for a declared slot` |
| `ErrAttachmentSlotShape()` | `attachment does not conform to its declared slot shape` |
| `ErrDuplicateBoundaryComponent()` | `component declared in more than one boundary: declare each component in exactly one boundary` |
| `ErrDuplicateTriadIdentity()` | `duplicate Aggregate/Manifest identity (metadata.name) in the Release directory` |
| `ErrFeatureMergeConflict()` | `feature merge conflict: reconcile the Aggregate and Release declarations for the feature` |
| `ErrGuardEntityViewInconsistency()` | `guard catalog-entity view inconsistency` |
| `ErrInjectKeyCollision()` | `duplicate delivery key across inject sources` |
| `ErrInvalidInjectKey()` | `invalid inject key: the from-key must name a declared provides key of the target component type` |
| `ErrInvalidInstanceName()` | `invalid instance name: names must match ^[a-zA-Z0-9_-]+$ (letters, digits, hyphen, underscore; no dots)` |
| `ErrInvalidParameterRef()` | `invalid parameter reference: check the {{ .parameters.* }} expression names a declared parameter and parses as a Go template` |
| `ErrInvalidTargetRef()` | `invalid target reference: each dot-separated segment must match ^[a-zA-Z0-9_-]+$` |
| `ErrManifestCrossBindingPillarCollision()` | `manifest annotation bindings collide on same Feature path+pillar` |
| `ErrManifestReservedPrefix()` | `manifest annotation binding uses reserved prefix` |
| `ErrMissingRequiredFeature()` | `missing required feature: attach a Feature of the required type to the component` |
| `ErrMissingRequiredSocket()` | `required uses socket not populated` |
| `ErrParameterContractViolation()` | `parameter contract violated` |
| `ErrParameterMissing()` | `required parameter not supplied` |
| `ErrParametersImportLoad()` | `parameters $import: load failed` |
| `ErrProvidesKeyNotDeclared()` | `Recipe publishes a provides key its Component does not declare` |
| `ErrSchemaConformance()` | `authored pillar does not conform to its declared schema` |
| `ErrSelfInjectForbidden()` | `self-inject on component without spec.inject allowlist` |
| `ErrTriadRefUnresolvable()` | `aggregate/manifest reference unresolvable` |
| `ErrUnknownUsesSocket()` | `unknown uses socket: name a socket the entity declares in its usesSchema — only a component's own uses block may name one the catalog did not declare` |
| `ErrUnnormalizedRelease()` | `release reached resolve un-normalized (non-empty root components alongside a synthesized default boundary)` |
| `ErrUnreadParameter()` | `declared parameter is read by no reference in the Aggregate` |
| `ErrUsesSocketNearMiss()` | `uses socket name is a near miss for a declared socket` |
| `ErrYAMLLoad()` | `YAML load failed: check the file exists, is readable, and contains well-formed YAML` |

### pkg/signing

| Sentinel | Message |
| --- | --- |
| `ErrKeylessLive()` | `signing: keyless signing requires a live identity provider, Fulcio, and Rekor` |
| `ErrNoSignatureFound()` | `signing: no signature found for an artifact that requires one` |
| `ErrNoTrustedIdentities()` | `signing: keyless verification requires at least one trusted identity` |
| `ErrSignatureInvalid()` | `signing: signature does not verify` |
| `ErrSignatureVerificationFailed()` | `signing: signature bundle does not verify` |
| `ErrSigningPolicyRequiresSignature()` | `signing: signing policy requires a signature for this artifact kind; refusing to push unsigned content` |
| `ErrTrustRootLoad()` | `signing: cannot load pinned trust root` |
| `ErrUnsignedPushRefused()` | `signing: registry requires signatures; refusing to push unsigned content` |
| `ErrUnsupportedKey()` | `signing: unsupported held-key type` |
| `ErrUntrustedIdentity()` | `signing: signature identity is not trusted for this registry` |

### pkg/sourcecache

| Sentinel | Message |
| --- | --- |
| `ErrFetchIntegrity()` | `oci: content digest mismatch` |
| `ErrFetchNotFound()` | `oci: artifact not found at remote source` |

- `ErrFetchIntegrity()` is the same value as `pkg/oci.ErrFetchIntegrity()`, so a match against either name succeeds.
- `ErrFetchNotFound()` is the same value as `pkg/oci.ErrFetchNotFound()`, so a match against either name succeeds.

### pkg/sourceresolver

| Sentinel | Message |
| --- | --- |
| `ErrFetchIntegrity()` | `oci: content digest mismatch` |
| `ErrFetchNetworkUnreachable()` | `oci: network unreachable` |
| `ErrFetchNotFound()` | `oci: artifact not found at remote source` |
| `ErrFetchUnauthorized()` | `oci: authentication required or failed` |
| `ErrUnknownKind()` | `sourceresolver: no adapter registered for source kind` |

- `ErrFetchIntegrity()` is the same value as `pkg/oci.ErrFetchIntegrity()`, so a match against either name succeeds.
- `ErrFetchNetworkUnreachable()` is the same value as `pkg/oci.ErrFetchNetworkUnreachable()`, so a match against either name succeeds.
- `ErrFetchNotFound()` is the same value as `pkg/oci.ErrFetchNotFound()`, so a match against either name succeeds.
- `ErrFetchUnauthorized()` is the same value as `pkg/oci.ErrFetchUnauthorized()`, so a match against either name succeeds.

### pkg/sourceresolver/cacheslot

| Sentinel | Message |
| --- | --- |
| `ErrEmptyWorkspaceRoot()` | `cacheslot: empty workspaceRoot` |

### pkg/types

| Sentinel | Message |
| --- | --- |
| `ErrArtifactEntryShape()` | `artifacts entry: shape must be a string scalar or {$import: <local-path>}` |
| `ErrArtifactsLibraryEntryShape()` | `artifactslibrary: entry must be a mapping of filename to a string body` |
| `ErrForbiddenKeyword()` | `schemalibrary: forbidden JSON Schema keyword` |
| `ErrMappingEntryNotScalar()` | `mappinglibrary: entry body must be a string scalar` |
| `ErrOrderedMapDecodeDepthExceeded()` | `OrderedMap: decode depth exceeded` |
| `ErrParametersShape()` | `parameters: shape must be an inline object or {$import: <local-path>}` |
| `ErrTemplateNotFound()` | `schemalibrary: template not found` |
| `ErrTemplateParamMissing()` | `schemalibrary: template parameter missing` |
| `ErrTemplateParamTypeMismatch()` | `schemalibrary: template parameter type mismatch` |
| `ErrValuesMappingShape()` | `valuesmapping: shape must be a string scalar or {$import: <path-or-library-identity>}` |
| `ErrWellKnownAnnotationScope()` | `wellKnownAnnotations: a key is declared at a scope the provider's contract does not render` |
| `ErrWorkloadEntryNotScalar()` | `workloadlibrary: entry body must be a string scalar` |
| `ErrWorkloadTemplateShape()` | `workload: shape must be a string scalar or {$import: <path-or-library-identity>}` |

### pkg/usesedge

| Sentinel | Message |
| --- | --- |
| `ErrDanglingUsesTarget()` | `uses edge target does not exist` |
| `ErrReleaseEdgeRetarget()` | `release edge retargets a developer-declared edge` |

### pkg/validator

| Sentinel | Message |
| --- | --- |
| `ErrAssertionNameCollision()` | `assertion name declared twice across the extends chain: rename the extending entity's assertion, whose assertions add to the base's and never replace one` |
| `ErrCyclicExtension()` | `cyclic extends chain` |
| `ErrFeatureRecipeEvalProviderConstraint()` | `featurerecipe eval-provider constraint: render input-kind fields are forbidden when provider is eval` |
| `ErrFeatureRecipeRule1()` | `FeatureRecipe: valuesMapping requires source` |
| `ErrInheritanceMerge()` | `inheritance merge failed: resolve the conflicting field definitions across the extends chain` |
| `ErrRecipeEvalProviderConstraint()` | `recipe eval-provider constraint: input-kind fields are forbidden when provider is eval` |
| `ErrRecipeOutputComponentLabelCollision()` | `recipe output-component-labels constraint: key is also declared in outputLabels` |
| `ErrRecipeOutputLabelReservedNamespace()` | `recipe output-labels constraint: key uses a reserved namespace` |
| `ErrRecipeRule1()` | `Recipe: valuesMapping requires source` |
| `ErrRecipeRule5()` | `Recipe: at least one input kind required` |
| `ErrRecipeRule7()` | `Recipe: filename collision across input-kind origins at emission` |
| `ErrSlotNotReferenceable()` | `workload attachment slot is not referenceable` |
| `ErrWorkloadFeaturesSchema()` | `workload featuresSchema cross-check failed` |
| `ErrWorkloadValidation()` | `workload validation failed` |

### pkg/validator/envelope

| Sentinel | Message |
| --- | --- |
| `ErrEntityEnvelope()` | `document envelope validation failed` |

### pkg/validator/jsonschema

| Sentinel | Message |
| --- | --- |
| `ErrExtensionEval()` | `validator/jsonschema: x-aggrega extension evaluation failed` |
| `ErrInstanceValidation()` | `validator/jsonschema: instance validation failed` |
| `ErrSchemaResolve()` | `validator/jsonschema: schema resolution failed` |

### pkg/validator/merger

| Sentinel | Message |
| --- | --- |
| `ErrCyclicExtension()` | `merger: cyclic extends chain` |
| `ErrMaxDepth()` | `merger: extends chain exceeds maximum depth` |
| `ErrMergeInvalid()` | `merger: invalid merge input` |

### pkg/workspaceconfig

| Sentinel | Message |
| --- | --- |
| `ErrAmbiguousRegistryAlias()` | `workspaceconfig: registry alias matches more than one host` |
| `ErrCapabilityOnCrossCuttingSocket()` | `workspaceconfig: a cross-cutting socket is bound by capability but attaches by uri` |
| `ErrConfigInvalid()` | `workspaceconfig: file failed schema validation` |
| `ErrDuplicateProviderTarget()` | `workspaceconfig: capability is bound to more than one provider plugin` |
| `ErrDuplicateRegistryAlias()` | `workspaceconfig: registry alias is already used by another host` |
| `ErrGovernanceRoleInvalid()` | `workspaceconfig: a governance attachment declares no role or an unknown role` |
| `ErrInertFieldOnProviderSocket()` | `workspaceconfig: a provider socket binding sets a field with no referent on that socket` |

### pkg/yamlpos

| Sentinel | Message |
| --- | --- |
| `ErrPositionOutOfRange()` | `position out of range` |
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

For the user-facing diagnostic catalogue (the messages developers see in their terminal when a build halts), see [fatal-halts.md](./fatal-halts.md). For the advisory-warning catalogue (the non-halting `warning:`, `lint:` and `notice:` output), see [warnings.md](./warnings.md). For the category-prefix taxonomy (`DEVELOPER_ERROR:` / `OPS_ERROR:` / `CATALOG_ERROR:` / `TRANSLATION_ERROR:` / `FETCH_ERROR:` / `POLICY_ERROR:`), see [error-translation.md](./error-translation.md).
