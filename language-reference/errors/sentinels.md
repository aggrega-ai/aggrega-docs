# Error sentinels — canonical reference

Every fatal halt the compiler emits names a condition, and each condition carries three identifiers, because recognising a condition, recording it and quoting it are three different jobs. The **sentinel** is the Go value `errors.Is` matches, obtained by calling the accessor the declaring package exports: the identifier Go code recognises. The **code** is the string the condition is registered under: it names the condition itself in words, and it is what stays fixed as the Go packages around it evolve — the identifier a program records. The **short code** is the letter `E` and four digits, short enough to read out, type into a search or paste into a report: the identifier a person quotes. One condition, three identifiers — match the sentinel to recognise the condition from Go, read the code when you need to record or key on it, and resolve a short code against the table of every condition further down this page.

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

The three identifiers carry their stability separately, and that separation is the reason a condition has all three. The accessors listed below are stable across patch releases; renames or removals are signalled by a release-notes entry and a deprecation cycle, and adding a new accessor within a package is additive and does not break existing matchers. A code is fixed once its condition is published, so it is the identifier to record wherever a condition has to be named durably: renaming an accessor does not move the code its condition was registered under, and a code you have recorded outlives a refactor of the Go surface. A short code is the most durable of the three: a number is handed out once and then fixed, and a retired condition's number stays retired rather than being handed to a different condition, so a short code recorded in an old report still names the condition it named when it was recorded. That is enforced rather than merely intended — a condition declared under a retired number is refused before the compiler reads any input, on every run — and every retired number is published beside the live ones in [the table of every condition](#every-condition-by-short-code). The code column below carries the code, and it is the value a client of the structured diagnostic reads without linking these packages. It is published rather than inferred, because it need not restate the row it sits on — a re-exported name reports the code of the condition it forwards to, and a rule's code names the rule rather than the accessor. The message column is the literal text the sentinel renders; the user-facing diagnostic puts a bracketed head and the source location ahead of that text. That head carries the condition's short code, with the occurrence's category beside it where the occurrence has one, as in `[DEVELOPER_ERROR E0007]` — so a reader can resolve either independently: the categories (`DEVELOPER_ERROR` / `OPS_ERROR` / `CATALOG_ERROR` / `TRANSLATION_ERROR` / `FETCH_ERROR` / `POLICY_ERROR` / `TRUST_ERROR`) are taught in [error-translation.md](./error-translation.md), and the short codes resolve in [the table of every condition](#every-condition-by-short-code) on this page. Where a plugin raised the condition, the code token is qualified by the plugin that raised it — `[TRANSLATION_ERROR provider/example:1.0.0/E0007]` — and the short code is the final segment; [error-translation.md](./error-translation.md) carries why the qualifier is there and which of the two segments resolves where.

## Reading the code of a condition

A code names the condition and nothing else, in kebab-case — `parameter-contract-violation`, `lockfile-drift`. It carries no prefix: not the package that declares it, not the stage that raises it, not a grouping of any kind. So a code stays the same when the compiler is reorganised around it, and a condition raised at more than one point in a compilation still has one name. Every condition's name is distinct on its own, which is what makes the prefix unnecessary, and two conditions cannot be registered under one code. Read it off an error with `CodeOf`, from `github.com/aggrega-ai/aggrega-cli/pkg/errors`, which walks the wrap chain the way `errors.Is` does, so the code survives however many frames wrapped the error on its way back to you. That package is itself named `errors`, so an import alias keeps it apart from the standard library:

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

**The code `aggrega` prints on a terminal is the short one, not this one.** A halting diagnostic opens with a bracketed head carrying the condition's short code, with the occurrence's category beside it where the occurrence has one — `[DEVELOPER_ERROR E0007]`, or `[TRANSLATION_ERROR provider/example:1.0.0/E0007]` where a plugin raised the condition and the code is qualified by the plugin that raised it, or `[E0007]` where the failure has no concern to route you to — and then the source location and the message text catalogued in [fatal-halts.md](./fatal-halts.md). The descriptive code names the condition in words and is far too wide for that position: on the longest conditions it would fill a narrow terminal before the message began, which is the whole reason a second, compact identifier exists. So the token to work from when you have only printed output is the short code, and it resolves against [the table of every condition](#every-condition-by-short-code) further down this page: from a number you can read out over a phone you reach the condition, its accessor and its message text. `aggrega explain <code>` does that resolution at the terminal — it takes either of the condition's codes and prints the condition together with the entry documenting the authoring fix, and it is described in [aggrega explain](../cli/aggrega-explain.md). The message-keyed views in [fatal-halts.md](./fatal-halts.md) remain the way to work from wording rather than from an identifier.

**Where a code does travel outside Go is the structured diagnostic the compiler-as-service daemon publishes**, as a `code` field of its own on each entry rather than anything folded into the message text — so an editor extension, or any other client of that protocol, branches on what an entry reports without linking these packages and without parsing prose. That one key carries a machine-matchable code whoever assigned it, and the entry says which layer raised it. A code there has three origins, and the third is the reason a code you can look up on this page is **not** on its own a sign that anything failed:

- **The code of the condition a failure names**, which is what this page catalogues.
- **The class code of an advisory about the shape of the deployment** — `unsupported-field` is one, and [warnings.md](./warnings.md) describes it. It is assigned wherever the advisory was raised rather than registered as a condition, so it has no row here.
- **The registered code of an advisory about the authored documents** — a name one edit from a declared one, a parameter nothing reads. Such a finding names a condition in the same form a failure does, so its code is registered and **has a row on this page**, and reading that row tells you what the finding is about.

So the same code you would read off a halt can also reach you from a build that finished, carried by a finding that changed nothing about the outcome. What separates the two is the outcome you were given and the layer the entry names — never the code's own form, and never whether it resolves here. The field is omitted where nothing that produced the entry assigned a code: a failure naming no condition of Aggrega's own, and an advisory whose raiser assigned none. [aggrega serve](../cli/aggrega-serve.md) documents the entry shape, the key that names the layer, and when the field is present.

**A structured diagnostic carries both of a condition's identifiers, and knowing which is which is the difference between an identifier you can act on and one you cannot.** The `code` key above is for a **program**: hyphenated and naming the condition in words, so an extension branching on it reads as what it means, and it is the value `CodeOf` reports in Go. The `shortCode` key beside it is for a **person** — the letter `E` and four digits, the same token a halting diagnostic prints in its bracketed head. It is what you read out over a phone, type into a search box, or paste into an issue, and it is the token [the table of every condition](#every-condition-by-short-code) is keyed on.

Neither is short for the other, and neither is a fallback for the other. Match on the descriptive code; show a reader the short one. A surface that offered only the descriptive code would be handing an author an identifier meant for a matcher, and one that matched on the short code would be matching on a number that says nothing about the condition — which is why both travel rather than one being chosen.

**A third key, `codeDescription`, carries where the condition is published**, as a reference to open for more about the diagnostic. Its address resolves to the table of every condition on this page, so a reader following it from an editor arrives holding the short code the table is keyed on. An entry carries the short code and the reference **together, or carries neither**: both are present exactly where the entry names a registered condition — one with a row in that table — and both are absent where the code names a class of advisory or the identity of a conventions rule, because there is no number to quote for those and nothing here that describes them.

**Going the other way — from a code you are holding to the condition it names — the tables below are the published list.** Each row carries the code beside the accessor that yields the same condition in Go, so a code read off a structured diagnostic resolves to a name you can match and to the text the condition renders. The tables cover the conditions whose accessor you can import, and two kinds of code sit outside them: a class code, which names a class of advisory rather than a condition and so has no accessor to put beside it, and a code whose condition is declared only in a package you cannot import and is re-exported nowhere, where there is no matchable name to put beside it. That second kind still names a condition, and that condition still has a short code — the table of every condition, further down this page, is keyed on the short code instead of on an importable name and so covers those as well.

## The matchable surface, by declaring package

Every section below is one package you can import. Its heading is the package path relative to the module path `github.com/aggrega-ai/aggrega-cli`, so the section headed `pkg/resolver` is imported as `github.com/aggrega-ai/aggrega-cli/pkg/resolver`.

Entries are grouped by the package that **declares** the sentinel, because that is the package a matcher imports. Where in a build the condition is raised is a separate question, and one this page deliberately does not answer: a single sentinel is frequently raised from several places, and several are raised only from code the module does not export, so no per-entry answer would be true for every row. The message-keyed views answer the when-in-a-build question in terms you can observe — [fatal-halts.md](./fatal-halts.md) above all.

A few names appear in more than one package. Those are re-exports of one shared value rather than two conditions, so matching either name succeeds; the tables say so where both names are importable. Both rows carry the same code, which is the same fact stated on the identifier a client outside Go holds: one condition, one code, however many names reach it.

<!-- BEGIN GENERATED: error-identities -->
### pkg/catalog

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrAllVersionsRetracted()` | `all-versions-retracted` | `every published version this reference could select has been withdrawn` |
| `ErrAmbiguousImporterPlugin()` | `ambiguous-importer-plugin` | `format is advertised by more than one importer plugin` |
| `ErrAmbiguousParserPlugin()` | `ambiguous-parser-plugin` | `format is advertised by more than one parser plugin` |
| `ErrAmbiguousProviderPlugin()` | `ambiguous-provider-plugin` | `capability is served by more than one provider plugin; add a plugins.providers entry to select one` |
| `ErrAmbiguousTypeMapping()` | `ambiguous-type-mapping` | `manifest maps multiple version-distinct keys to the same base type; the type-to-recipe lookup is ambiguous` |
| `ErrDuplicateEntityIdentity()` | `duplicate-entity-identity` | `duplicate entity identity within a single catalog directory` |
| `ErrManifestImplementsMismatch()` | `manifest-implements-mismatch` | `manifest mapping entry's recipe spec.implements does not match the mapped component-type / feature-type key` |
| `ErrNoImporterForFormat()` | `no-importer-for-format` | `no importer plugin advertises the requested format` |
| `ErrNoParserForFormat()` | `no-parser-for-format` | `no parser plugin advertises the requested format` |
| `ErrNoRecipeResolved()` | `no-recipe-resolved` | `no recipe resolved for component/feature instance: add an explicit Manifest mapping for its type` |
| `ErrProviderBindingUnsatisfied()` | `provider-binding-unsatisfied` | `plugins.providers entry names a plugin no provider-rendering plugin serving the capability matches` |
| `ErrProviderVersionUnsatisfiable()` | `provider-version-unsatisfiable` | `no provider-rendering plugin version satisfies the recipe's provider version pin` |
| `ErrQualifiedPluginReference()` | `plugin-reference-must-not-be-registry-qualified` | `wasm plugin reference must be the plugin coordinate identity (<pluginType>/<name>:<version>), not a registry-qualified or artifact path` |
| `ErrUnsatisfiableEntityVersion()` | `unsatisfiable-entity-version` | `no catalog version satisfies the referenced version constraint` |
| `ErrUnscopedPluginReference()` | `plugin-reference-must-be-scoped` | `wasm plugin reference must carry a pluginType scope (<pluginType>/<name>); an empty scope cannot bind to an OCI location` |
| `ErrUnscopedRecipeReference()` | `recipe-reference-must-be-scoped` | `recipe reference must be provider-scoped (<provider>/<name>); an empty provider cannot bind to an OCI location` |
| `ErrUnusableSchemaImport()` | `unusable-schema-import` | ``a schema `$import:` could not be applied`` |

- `ErrManifestImplementsMismatch()` is the same value as `pkg/resolver.ErrManifestImplementsMismatch()`, so a match against either name succeeds.

### pkg/closure

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrInvalidLibraryRef()` | `invalid-library-ref` | `resolve: invalid library reference URI` |
| `ErrMVSConflict()` | `version-selection-conflict` | `resolve: minimal version selection conflict — incompatible library version requirements` |
| `ErrNoAggregateLoader()` | `catalog-cannot-load-sub-aggregate-bodies` | `resolve: catalog lookup cannot load resolved sub-aggregate bodies` |
| `ErrNoRecipeLoader()` | `catalog-cannot-load-recipe-bodies` | `resolve: catalog lookup cannot load resolved recipe and plugin bodies` |
| `ErrSourceTemplateAtLockTime()` | `source-template-at-lock-time` | `resolve: source-template evaluation failure at lock time` |
| `ErrSourceTemplateParse()` | `source-template-not-parsable` | `resolve: source-template parse error` |
| `ErrSourceTemplateProvidesRef()` | `source-template-provides-ref` | `resolve: source-template references .provides (invalid reverse reference)` |
| `ErrSubAggregateDepth()` | `sub-aggregate-depth` | `resolve: sub-aggregate inclusion depth exceeded` |
| `ErrUnresolvableURI()` | `unresolvable-uri` | `resolve: no entity in the catalog matches this URI` |

### pkg/compactform

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrAmbiguousDispatch()` | `ambiguous-dispatch` | `compactform: ambiguous dispatch — $mode required` |
| `ErrCircularRef()` | `reference-cycle` | `circular reference expansion` |
| `ErrConstraintTypeMismatch()` | `constraint-type-mismatch` | `compactform: constraint not valid for declared type` |
| `ErrEscapeContentInvalid()` | `escape-content-invalid` | `compactform: $jsonschema content invalid` |
| `ErrHostInLibraryRef()` | `host-in-library-ref` | `compactform: cross-document $ref carries a registry host; reference the library by identity` |
| `ErrReferenceUnresolvable()` | `reference-unresolvable` | `compactform: $ref unresolvable` |
| `ErrUnknownKeyword()` | `unknown-keyword` | `compactform: unknown keyword` |
| `ErrUnresolvedSchemaLibraryRef()` | `unresolved-schema-library-ref` | `compactform: cross-document $ref target not found` |

- `ErrCircularRef()` is the same value as `pkg/refcycle.ErrCycle()`, so a match against either name succeeds.

### pkg/deprecation

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrDeprecatedEntity()` | `deprecated-entity` | `deprecation: build consumes a deprecated entity` |

### pkg/docscache

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrFetchNotFound()` | `fetch-not-found` | `oci: artifact not found at remote source` |
| `ErrNotDocsBundle()` | `not-docs-bundle` | `docscache: artifact is not a documentation bundle` |
| `ErrPageNotFound()` | `page-not-found` | `docscache: page not found in documentation bundle` |

- `ErrFetchNotFound()` is the same value as `pkg/oci.ErrFetchNotFound()`, so a match against either name succeeds.

### pkg/egress

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrOfflineEgress()` | `offline-egress` | ``egress: network access refused because the workspace is offline; remediation: pass `--offline=false` to allow the network for this one run, or clear the top-level `offline` key in the configuration file (or AGGREGA_OFFLINE) to allow it from now on; where the work is a build that needs content the machine does not have, run `aggrega pull --release <release>` from a connected environment first to populate the cache`` |

### pkg/externalinputs

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrAcquisitionDisabled()` | `acquisition-disabled` | `externalinputs: acquisition is disabled for unpinned inputs` |
| `ErrDigestMismatch()` | `digest-mismatch` | `externalinputs: fetched bytes mismatch the pinned digest` |
| `ErrSchemeNotAllowed()` | `scheme-not-allowed` | `externalinputs: URL scheme is not allowed` |
| `ErrStoreCorrupt()` | `store-corrupt` | `externalinputs: store blob mismatches its pinned record` |

### pkg/lockfile

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrLockfileDrift()` | `lockfile-drift` | `lockfile: out of date; it no longer matches the current catalog` |
| `ErrLockfileInvalid()` | `lockfile-invalid` | `lockfile: file failed schema validation` |

### pkg/oci

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrAmbiguousContentLayer()` | `ambiguous-content-layer` | `oci: manifest has multiple layers of the expected content media type` |
| `ErrBundleAmbiguousEntityDocument()` | `bundle-ambiguous-entity-document` | `oci: published bundle carries more than one entity document` |
| `ErrBundleNoEntityDocument()` | `bundle-no-entity-document` | `oci: published bundle carries no entity document` |
| `ErrBundleUnreadable()` | `bundle-unreadable` | `oci: published bundle cannot be unpacked` |
| `ErrCacheLocationOutsideCache()` | `cache-location-outside-cache` | `a value a cache location is built from would place cached files outside the place it names in the cache` |
| `ErrCachedManifestIntegrity()` | `cached-manifest-integrity` | `oci: cached manifest digest mismatch` |
| `ErrFetchIntegrity()` | `fetch-integrity` | `oci: content digest mismatch` |
| `ErrFetchNetworkUnreachable()` | `fetch-network-unreachable` | `oci: network unreachable` |
| `ErrFetchNotFound()` | `fetch-not-found` | `oci: artifact not found at remote source` |
| `ErrFetchUnauthorized()` | `fetch-unauthorized` | `oci: authentication required or failed` |
| `ErrImmutableTagConflict()` | `immutable-tag-conflict` | `oci: tag already published with different content` |
| `ErrNoContentLayer()` | `no-content-layer` | `oci: manifest has no layer of the expected content media type` |
| `ErrOCILocationCollision()` | `oci-location-collision` | `oci: distinct catalog identities map to the same OCI repository location` |
| `ErrPublishedArtifactNotAnEntity()` | `published-artifact-not-an-entity` | `oci: published artifact is not an entity document` |
| `ErrReferrerDiscoveryUnavailable()` | `referrer-discovery-unavailable` | `oci: referrer discovery could not be completed` |
| `ErrUnknownEntityKind()` | `unknown-entity-kind` | `oci: unknown entity kind for mediatype dispatch` |

### pkg/pluginpath

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrPluginArtifactNotFound()` | `plugin-artifact-not-found` | `plugin artifact not found on this machine` |
| `ErrPluginBundleDigestMismatch()` | `plugin-bundle-digest-mismatch` | `cached signature bundle does not match its recorded digest` |
| `ErrPluginEntityNotFound()` | `plugin-entity-not-found` | `plugin reference is not a Plugin entity` |

### pkg/pluginstrust

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrVerdictAttachmentNotConfigured()` | `verdict-attachment-not-configured` | `a plugin recorded as trusted for an accept-or-reject verdict is no longer attached at any verdict role` |

### pkg/plugintest

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrCommandsMismatch()` | `wasm-command-set-mismatch` | `wasm: recorded command mirror does not match plugin describe()` |
| `ErrContractMismatch()` | `wasm-contract-mismatch` | `wasm: entity contract claim does not match plugin describe()` |
| `ErrHostFunctionsMismatch()` | `wasm-host-function-set-mismatch` | `wasm: stamped host-function record does not match .wasm imports` |
| `ErrRejected()` | `wasm-manifest-rejected` | `wasm: plugin rejected by the sandbox` |
| `ErrTypeMismatch()` | `wasm-plugin-type-mismatch` | `wasm: declared plugin type does not match plugin describe()` |

### pkg/recipepin

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrEntityNotPinned()` | `entity-not-pinned` | `an input the entity reads has no pin recorded for it in the entity.lock beside it` |
| `ErrLocalSourceContentMismatch()` | `local-source-content-mismatch` | `the files of the entity's local source do not match the pins recorded for them in entity.lock` |

### pkg/refcycle

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrCycle()` | `reference-cycle` | `circular reference expansion` |

### pkg/registrytrust

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrMalformedTrust()` | `malformed-trust-policy` | `registrytrust: advertised trust config is malformed` |
| `ErrNoTrustAdvertised()` | `no-trust-advertised` | `registrytrust: registry advertises no trust config` |

### pkg/resolver

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrAnnotationBindingPillarOverlap()` | `annotation-binding-pillar-overlap` | `annotation binding declares one path in both pillar lists` |
| `ErrAnnotationBindingTargetUnresolved()` | `annotation-binding-target-unresolved` | `annotation binding does not resolve against its target Feature` |
| `ErrAnnotationSidePillarMismatch()` | `annotation-side-pillar-mismatch` | `annotation routes through a pillar its authoring side may not use` |
| `ErrAnnotationSubkeyNotConforming()` | `annotation-subkey-not-conforming` | `annotation subkey does not conform to the target Feature's schema at the routed pillar` |
| `ErrAttachmentSlotNearMiss()` | `attachment-slot-near-miss` | `attachment name is a near miss for a declared slot` |
| `ErrAttachmentSlotShape()` | `attachment-slot-shape` | `attachment does not conform to its declared slot shape` |
| `ErrDuplicateBoundaryComponent()` | `duplicate-boundary-component` | `component declared in more than one boundary: declare each component in exactly one boundary` |
| `ErrDuplicateTriadIdentity()` | `duplicate-triad-identity` | `duplicate Aggregate/Manifest identity (metadata.name) in the Release directory` |
| `ErrFeatureMergeConflict()` | `feature-merge-conflict` | `feature merge conflict: reconcile the Aggregate and Release declarations for the feature` |
| `ErrGuardEntityViewInconsistency()` | `internal-catalog-view-disagreement` | `the compiler's own views of the catalog disagree` |
| `ErrInheritedBoundaryDirectoryIsLiteral()` | `inherited-boundary-directory-is-literal` | `inherited boundary directory carries no template variable, so it resolves to the path the extended Release writes to` |
| `ErrInjectKeyCollision()` | `inject-key-collision` | `duplicate delivery key across inject sources` |
| `ErrInvalidInjectKey()` | `invalid-inject-key` | `invalid inject key: the from-key must name a declared provides key of the target component type` |
| `ErrInvalidParameterRef()` | `invalid-parameter-ref` | `invalid parameter reference: check the {{ .parameters.* }} expression names a declared parameter and parses as a Go template` |
| `ErrMalformedRecipeReference()` | `malformed-recipe-reference` | `malformed recipe reference in a Manifest mapping value` |
| `ErrManifestCrossBindingPillarCollision()` | `manifest-cross-binding-pillar-collision` | `manifest annotation bindings collide on same Feature path+pillar` |
| `ErrManifestImplementsMismatch()` | `manifest-implements-mismatch` | `manifest mapping entry's recipe spec.implements does not match the mapped component-type / feature-type key` |
| `ErrManifestReservedPrefix()` | `manifest-reserved-prefix` | `manifest annotation binding uses reserved prefix` |
| `ErrMissingRequiredFeature()` | `missing-required-feature` | `missing required feature: attach a Feature of the required type to the component` |
| `ErrMissingRequiredSocket()` | `missing-required-socket` | `required uses socket not populated` |
| `ErrParameterContractViolation()` | `parameter-contract-violation` | `parameter contract violated` |
| `ErrParameterMissing()` | `parameter-missing` | `required parameter not supplied` |
| `ErrProvidesKeyNotDeclared()` | `provides-key-not-declared` | `Recipe publishes a provides key its Component does not declare` |
| `ErrReleaseChainComposesBothRoutingKeys()` | `release-chain-composes-both-routing-keys` | `release extends chain composes both named boundaries and top-level components: declare one routing shape across the chain, never both` |
| `ErrSchemaConformance()` | `schema-conformance` | `authored pillar does not conform to its declared schema` |
| `ErrSchemaContractCompileFailure()` | `schema-contract-compile-failure` | `declared schema contract could not be compiled into a usable schema, so nothing was validated against it: correct the contract where it is declared, or remove it if the configuration it covers needs no validation` |
| `ErrSelfInjectForbidden()` | `self-inject-forbidden` | `self-inject on component without spec.inject allowlist` |
| `ErrTriadRefUnresolvable()` | `triad-ref-unresolvable` | `aggregate/manifest reference unresolvable` |
| `ErrUnknownUsesSocket()` | `unknown-uses-socket` | `unknown uses socket: name a socket the entity declares in its usesSchema — only a component's own uses block may name one the catalog did not declare` |
| `ErrUnnormalizedRelease()` | `release-not-in-canonical-form` | `release reached resolve un-normalized (non-empty root components alongside a synthesized default boundary)` |
| `ErrUnreadParameter()` | `unread-parameter` | `declared parameter is read by no reference in the Aggregate` |
| `ErrUsesSocketNearMiss()` | `uses-socket-near-miss` | `uses socket name is a near miss for a declared socket` |
| `ErrVerdictPluginTrustMismatch()` | `verdict-plugin-trust-mismatch` | `the digest recorded as trusted for this plugin does not match the digest its cached manifest reports` |
| `ErrYAMLLoad()` | `document-not-loadable` | `file load failed: the file could not be read, or its bytes did not parse` |

### pkg/signing

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrKeylessLive()` | `keyless-signing-requires-network` | `signing: keyless signing requires a live identity provider, Fulcio, and Rekor` |
| `ErrNoSignatureFound()` | `no-signature-found` | `signing: no signature found for an artifact that requires one` |
| `ErrNoTrustedIdentities()` | `no-trusted-identities` | `signing: keyless verification requires at least one trusted identity` |
| `ErrSignatureInvalid()` | `signature-invalid` | `signing: signature does not verify` |
| `ErrSignatureVerificationFailed()` | `signature-verification-failed` | `signing: signature bundle does not verify` |
| `ErrSigningPolicyRequiresSignature()` | `signing-policy-requires-signature` | `signing: signing policy requires a signature for this artifact kind; refusing to push unsigned content` |
| `ErrTrustRootLoad()` | `trust-root-not-loadable` | `signing: cannot load pinned trust root` |
| `ErrUnsignedPushRefused()` | `unsigned-push-refused` | `signing: registry requires signatures; refusing to push unsigned content` |
| `ErrUnsupportedKey()` | `unsupported-key` | `signing: unsupported held-key type` |
| `ErrUntrustedIdentity()` | `untrusted-identity` | `signing: signature identity is not trusted for this registry` |

### pkg/sourcecache

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrFetchIntegrity()` | `fetch-integrity` | `oci: content digest mismatch` |
| `ErrFetchNotFound()` | `fetch-not-found` | `oci: artifact not found at remote source` |

- `ErrFetchIntegrity()` is the same value as `pkg/oci.ErrFetchIntegrity()`, so a match against either name succeeds.
- `ErrFetchNotFound()` is the same value as `pkg/oci.ErrFetchNotFound()`, so a match against either name succeeds.

### pkg/sourceresolver

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrFetchIntegrity()` | `fetch-integrity` | `oci: content digest mismatch` |
| `ErrFetchNetworkUnreachable()` | `fetch-network-unreachable` | `oci: network unreachable` |
| `ErrFetchNotFound()` | `fetch-not-found` | `oci: artifact not found at remote source` |
| `ErrFetchUnauthorized()` | `fetch-unauthorized` | `oci: authentication required or failed` |
| `ErrUnknownKind()` | `unknown-source-kind` | `sourceresolver: no adapter registered for source kind` |

- `ErrFetchIntegrity()` is the same value as `pkg/oci.ErrFetchIntegrity()`, so a match against either name succeeds.
- `ErrFetchNetworkUnreachable()` is the same value as `pkg/oci.ErrFetchNetworkUnreachable()`, so a match against either name succeeds.
- `ErrFetchNotFound()` is the same value as `pkg/oci.ErrFetchNotFound()`, so a match against either name succeeds.
- `ErrFetchUnauthorized()` is the same value as `pkg/oci.ErrFetchUnauthorized()`, so a match against either name succeeds.

### pkg/sourceresolver/cacheslot

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrEmptyWorkspaceRoot()` | `empty-workspace-root` | `cacheslot: empty workspaceRoot` |

### pkg/types

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrArtifactEntryShape()` | `artifact-entry-shape` | `artifacts entry: shape must be a string scalar or {$import: <local-path>}` |
| `ErrArtifactLibraryEntryShape()` | `artifact-library-entry-shape` | `artifactlibrary: entry must be a mapping of filename to a string body` |
| `ErrForbiddenKeyword()` | `forbidden-keyword` | `schemalibrary: forbidden JSON Schema keyword` |
| `ErrLibraryReferenceWhitespace()` | `library-reference-whitespace` | `library reference: a reference to a library entry carries no whitespace or line break` |
| `ErrMappingEntryNotScalar()` | `mapping-entry-not-scalar` | `mappinglibrary: entry body must be a string scalar` |
| `ErrOrderedMapDecodeDepthExceeded()` | `document-nesting-depth-exceeded` | `OrderedMap: decode depth exceeded` |
| `ErrParametersShape()` | `parameters-shape` | `parameters: shape must be an inline object or {$import: <local-path>}` |
| `ErrTemplateNotFound()` | `template-not-found` | `schemalibrary: template not found` |
| `ErrTemplateParamMissing()` | `template-param-missing` | `schemalibrary: template parameter missing` |
| `ErrTemplateParamTypeMismatch()` | `template-param-type-mismatch` | `schemalibrary: template parameter type mismatch` |
| `ErrValuesMappingShape()` | `values-mapping-shape` | `valuesmapping: shape must be a string scalar or {$import: <path-or-library-identity>}` |
| `ErrWellKnownAnnotationScope()` | `well-known-annotation-scope` | `wellKnownAnnotations: a key is declared at a scope the provider's contract does not render` |
| `ErrWorkloadEntryNotScalar()` | `workload-entry-not-scalar` | `workloadlibrary: entry body must be a string scalar` |
| `ErrWorkloadTemplateShape()` | `workload-template-shape` | `workload: shape must be a string scalar or {$import: <path-or-library-identity>}` |

### pkg/usesedge

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrDanglingUsesTarget()` | `dangling-uses-target` | `uses edge target does not exist` |
| `ErrReleaseEdgeRetarget()` | `release-edge-retarget` | `release edge retargets a developer-declared edge` |

### pkg/validator

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrAssertionNameCollision()` | `assertion-name-collision` | `assertion name declared twice across the extends chain` |
| `ErrCyclicExtension()` | `cyclic-extension` | `cyclic extends chain` |
| `ErrExtendsChainTooDeep()` | `extends-chain-too-deep` | `extends chain exceeds maximum depth` |
| `ErrFeatureRecipeEvalProviderConstraint()` | `feature-recipe-eval-provider-constraint` | `featurerecipe eval-provider constraint: render input-kind fields are forbidden when provider is eval` |
| `ErrFeatureRecipeValuesMappingRequiresSource()` | `feature-recipe-values-mapping-requires-source` | `FeatureRecipe: valuesMapping requires source` |
| `ErrInheritanceMerge()` | `extends-merge-failed` | `inheritance merge failed` |
| `ErrRecipeEvalProviderConstraint()` | `recipe-eval-provider-constraint` | `recipe eval-provider constraint: input-kind fields are forbidden when provider is eval` |
| `ErrRecipeFilenameCollisionAcrossInputKinds()` | `recipe-filename-collision-across-input-kinds` | `filename collision across input kinds: two input-kind blocks produced a file under one output name` |
| `ErrRecipeNoInputKind()` | `recipe-no-input-kind` | `Recipe: at least one input kind required` |
| `ErrRecipeOutputComponentLabelCollision()` | `recipe-output-component-label-collision` | `recipe output-component-labels constraint: key is also declared in outputLabels` |
| `ErrRecipeOutputLabelReservedNamespace()` | `recipe-output-label-reserved-namespace` | `recipe output-labels constraint: key uses a reserved namespace` |
| `ErrRecipeValuesMappingRequiresSource()` | `recipe-values-mapping-requires-source` | `Recipe: valuesMapping requires source` |
| `ErrSlotNotReferenceable()` | `slot-not-referenceable` | `workload attachment slot is not referenceable` |
| `ErrUnknownSchemaPillar()` | `unknown-schema-pillar` | `a schema block declares a key that names no data pillar` |
| `ErrWorkloadFeaturesSchema()` | `workload-features-schema` | `workload featuresSchema cross-check failed` |
| `ErrWorkloadValidation()` | `workload-not-valid` | `workload validation failed` |

### pkg/validator/envelope

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrEntityEnvelope()` | `entity-envelope-invalid` | `document envelope validation failed` |

### pkg/validator/jsonschema

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrExtensionEval()` | `schema-extension-evaluation-failed` | `validator/jsonschema: x-aggrega extension evaluation failed` |
| `ErrSchemaResolve()` | `schema-not-resolvable` | `validator/jsonschema: schema resolution failed` |

### pkg/validator/merger

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrMergeInvalid()` | `schema-merge-input-invalid` | `merger: invalid merge input` |

### pkg/workspaceconfig

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrAmbiguousRegistryAlias()` | `ambiguous-registry-alias` | `registry alias matches more than one host` |
| `ErrCapabilityOnCrossCuttingSocket()` | `capability-on-cross-cutting-socket` | `a cross-cutting socket is bound by capability but attaches by uri` |
| `ErrConfigInvalid()` | `workspace-config-invalid` | `file failed schema validation` |
| `ErrDuplicateProviderTarget()` | `duplicate-provider-target` | `capability is bound to more than one provider plugin` |
| `ErrDuplicateRegistryAlias()` | `duplicate-registry-alias` | `registry alias is already used by another host` |
| `ErrGovernanceRoleInvalid()` | `governance-role-invalid` | `a governance attachment declares no role or an unknown role` |
| `ErrInertFieldOnProviderSocket()` | `inert-field-on-provider-socket` | `a provider socket binding sets a field with no referent on that socket` |

### pkg/yamlpos

| Sentinel | Code | Message |
| --- | --- | --- |
| `ErrPositionOutOfRange()` | `position-out-of-range` | `position out of range` |
<!-- END GENERATED: error-identities -->

## Sentinels that carry another sentinel

`ErrCacheMetadataInvalid` (`pkg/sourceresolver/metadata`) reports a corrupt source-artifact cache slot. It is declared as a wrapper around `ErrFetchIntegrity()` rather than as an identity of its own, so it does not appear in the tables above and a match against `ErrFetchIntegrity()` succeeds for it as well. Because it wraps a sentinel instead of declaring one, it is exported as a value rather than as a function: match it as `ErrCacheMetadataInvalid`, with no parentheses. Match the wrapper when you want that specific condition, and the wrapped sentinel when you want the whole integrity class.

## Sentinels reachable under a second name in one package

Where a package exports two accessors for one condition — the second declared as a forward to the first — the tables above carry the declaring accessor and leave the forwarding name out. Both names are exported from the same package, so an import that reaches either already reaches the other, and a second row would list one condition twice under a name that matches nothing new. Matching either name succeeds: the forward returns the same value the declaring accessor returns.

This is not the cross-package case. A sentinel re-exported from another package carries a row in each package's table, because a matcher importing one of those packages cannot reach the other's name without importing that package too; a forward inside a single package needs no second row, because one import reaches both names.

`ErrDuplicateRecipeIdentity()` in `pkg/catalog` is such a forward: it returns `ErrDuplicateEntityIdentity()`, which is the name the table for that package carries.

## Conditions with no matchable sentinel

Some compilation stages declare their sentinels in packages the compiler does not export, so there is nothing for `errors.Is` to reference and no matcher can be written against them. They are described here rather than tabulated, because a table on this page is a promise that the left-hand column can be dereferenced.

Their diagnostics reach you in full through the emitted error text and through the message-keyed views — [fatal-halts.md](./fatal-halts.md) in particular — which is the supported way to recognise them:

- **Topology construction** (graph construction and sub-aggregate flattening) reports a sub-Aggregate that could not be loaded, naming the unreachable Aggregate URI; a `uses:` declaration whose structural shape does not match the schema; nesting depth exceeded; and a flattened node-ID collision, where two sub-Aggregates compile to the same node ID and one instance name has to be renamed to disambiguate.
- **Graph finalization** (Feature merging across the Aggregate and Release surfaces) reports a Feature type declared inconsistently between the two.
- **Static analysis** (selector evaluation and cross-node type-safety checks) reports a `selector:` violation; a catalog-resolution miss it cannot proceed past, naming the unreachable entity; and a policy rejection, where a plugin attached at a governance verdict role rejected the assembled build. A policy rejection carries the `POLICY_ERROR` category, the rejecting plugin's name, and the rule message the plugin supplied.
- **Rendering** (provider dispatch and per-provider rendering) reports an unknown provider.
- **The embedded Wasm host loader** emits its own guardrail sentinels — a manifest-rejected guardrail (a plugin requested a runtime-access capability the AOT-purity firewall denies), a guest-panic recovery, and a deterministic plugin-exit trap. These surface in the user-facing diagnostic when running a plugin (for example through `aggrega lint`). Plugin authors testing a guest against the host reach the same conditions by importable name through `pkg/plugintest`, listed above.

To gate a pipeline on a policy rejection specifically, match the `POLICY_ERROR` category prefix in the diagnostic rather than a sentinel; the category is a documented part of the error surface, described in [error-translation.md](./error-translation.md).

## Every condition, by short code

The table below runs the lookup the other way round: a short code in the left-hand column, and beside it the condition that code names and the text that condition renders. It covers every condition a build can report, the ones the sections above cannot list included.

That wider coverage is the point of this table rather than an accident of it. The sections above are keyed on a name you can import, so a condition declared only in a package you cannot import — and re-exported nowhere you can import either — has nothing to put in their left-hand column. This table is keyed on the short code, and every condition has one, so no reportable condition falls outside it. A short code you are holding resolves here whether or not the condition behind it also has an accessor you can match.

**What earns a place in this table is that the compiler can actually report the condition.** The rows are derived from the code rather than transcribed into it: a condition appears here because something in the compiler raises it, so every code in the left-hand column is one a build can print. That is the promise the table makes, and it is what lets you read a row as a check that really runs.

A very small number of conditions are the deliberate exception, and each says so in a note directly beneath the table. Those are declared before the code that reports them exists, so that the code and the wording are fixed in advance and never change under a reader who has already quoted them. They are listed rather than hidden — a code you are holding should always resolve — and the note beside each one tells you plainly that no build raises it yet, and what would have to exist before one did.

**A retired number is listed too, in its own set of notes beneath the table, and it stays listed permanently.** A condition is occasionally withdrawn — it is replaced by one covering more ground, or nothing ever reported it — and from that moment its number is retired: it is never handed to a different condition, so a short code you quote off an old report can only ever name what it named when the report was written. That promise is mechanical rather than editorial. A condition declared under a retired number is refused before the compiler reads any input, on every run, so no release can carry one — the same class of refusal a number two live conditions tried to share would meet, worded so you can tell which of the two you hit. The note for a retired code tells you what it named and, where the condition was replaced, which code reports that ground now.

Never reusing a number is also what gives the sequence its permanent gaps, and the notes are what make those gaps readable. **A missing number is not on its own evidence of anything:** it may be retired, and it may equally be one nothing has reached yet. The notes are the record of which numbers are retired and what each of them named, so a code resolving to neither a row nor a note is one this compiler has never issued.

A short code is deliberately opaque: four digits say nothing about a condition on their own, which is the price of an identifier short enough to read out, type into a search, or paste into a report. The correspondence below is what makes it usable. A number is handed out once, from a single ascending sequence, and is fixed from then on; it says nothing about the condition it names. So a short code is an identifier and nothing more — its value is not a classification, and neither it nor any grouping you may notice in the table is a guide to where a condition lives or to what it is about.

**The table carries no category column, and that is not an omission: a category is a property of a particular failure rather than of the condition behind it.** Some conditions belong to one category by construction. For others the category follows from the kind of entity the failure is about, so one such condition reported once against an Aggregate and once against a Release carries a different category each time — and a single value written beside the condition here would be wrong for every condition of that second kind.

**Where the categories are taught is [error-translation.md](./error-translation.md)** — each one, what it means, and where the fix for it lives. A category and a short code answer different questions about the same failure: the category identifies the surface the fix belongs on, and the short code identifies which condition halted the build. Neither is derivable from the other, which is why each has its own published list — and why a failure with no authoring surface to name still carries a code you can look up here.

<!-- BEGIN GENERATED: condition-short-codes -->
| Code | Condition | Message |
| --- | --- | --- |
| `E0001` | `no-plugin-resolution-configured` | `cliplugin: no plugin resolver configured` |
| `E0003` | `malformed-attachment-requirement` | `malformed attachment requirement` |
| `E0004` | `overridden-annotation` | `annotation contribution overridden by an explicit value` |
| `E0005` | `policy-violation` | `policy violation` |
| `E0006` | `required-slot-unfilled` | `required attachment slot unfilled` |
| `E0007` | `selector-violation` | `selector violation` |
| `E0008` | `slot-selector-unsatisfied` | `attachment slot selector unsatisfied` |
| `E0009` | `pipeline-contract-violation` | `pipeline step typed-I/O contract violation` |
| `E0010` | `pipeline-step-failed` | `pipeline step failed` |
| `E0011` | `pipeline-target-absent` | `pipeline patch targets a document not present in the set` |
| `E0012` | `pipeline-target-opaque` | `pipeline patch targets an opaque (non-structured) unit` |
| `E0013` | `feature-type-mismatch` | `feature type mismatch between Aggregate and Release` |
| `E0014` | `inject-entry-ambiguous` | ``inject entry carries both `value:` and `from:`; schema requires exactly one`` |
| `E0015` | `uses-inject-forbidden` | `uses-edge inject dictates a delivery mechanism the socket does not permit` |
| `E0016` | `patch-test-operation-failed` | `jsonpatch: test operation failed` |
| `E0017` | `annotation-injection-rejected` | `annotation-transform plugin output was rejected: an injection targets a component coordinate the host did not supply` |
| `E0018` | `policy-settings-invalid` | `policy attachment settings do not satisfy the plugin's declared settings schema` |
| `E0019` | `endpoint-requires-reference-form` | `endpoint requires form: reference` |
| `E0020` | `invalid-cron-schedule` | `schedule is not a valid cron expression` |
| `E0021` | `persistent-template-requires-stateful-form` | `persistentTemplate volume requires form: stateful` |
| `E0022` | `pipeline-patch-target-not-structured` | `pipeline PATCH target is not parseable structured YAML/JSON` |
| `E0023` | `reference-form-requires-endpoint` | `form: reference requires an endpoint` |
| `E0024` | `schedule-requires-scheduled-form` | `schedule requires form: scheduled` |
| `E0025` | `scheduled-form-requires-schedule` | `form: scheduled requires a schedule` |
| `E0026` | `artifact-content-mismatch` | `imported artifact content does not match the digest recorded for it in entity.lock` |
| `E0027` | `artifact-import-shape` | `artifacts $import: is not a bare-name artifact-library reference (<Library>#/artifacts/<entry>)` |
| `E0028` | `artifact-output-collision` | `artifacts output filename collision: two artifact outputs carry the same filename` |
| `E0029` | `artifact-pillar-not-declared` | `artifact template references a pillar the Recipe does not declare` |
| `E0030` | `artifact-library-entry-not-found` | `artifact-library import references a bundle not present in the ArtifactLibrary` |
| `E0031` | `artifact-library-not-found` | `artifact-library import references an ArtifactLibrary not present in the catalog` |
| `E0032` | `assembled-output-collision` | `assembled output collision: two contributors write the same output path` |
| `E0033` | `authored-assertion-failed` | `assertion failed` |
| `E0034` | `attachment-inject-key-collision` | `duplicate delivery key across attachment-inject and another inject source` |
| `E0035` | `boundary-assembly-not-provided` | `provider expected to assemble its dispatch group provides no boundary assembler` |
| `E0036` | `chart-name-mismatch` | `merged-path assembly has conflicting assembly-name annotation values` |
| `E0037` | `cross-provider-link-unsupported` | `cross-boundary link between endpoints rendered by different providers is not supported` |
| `E0038` | `derived-key-collision` | `derived name collision: one name is derived more than once in one key space` |
| `E0039` | `featurerecipe-template-invalid-field` | `FeatureRecipe template references a per-component-only field with executionScope: boundary` |
| `E0040` | `host-in-library-import` | `library $import: carries a registry host; reference the library by bare-name identity` |
| `E0041` | `instance-id-collision` | `multiple contributors share an instance ID at the same dispatch path` |
| `E0042` | `locals-forward-reference` | `locals entry references a sibling defined later in the same block` |
| `E0043` | `locals-unknown-reference` | `template references a key the locals block does not declare` |
| `E0044` | `mapping-entry-not-found` | `mapping-library import references an entry not present in the MappingLibrary` |
| `E0045` | `mapping-import-shape` | `valuesMapping $import: is not a bare-name mapping-library reference (<Library>#/mappings/<entry>)` |
| `E0046` | `mapping-library-not-found` | `mapping-library import references a MappingLibrary not present in the catalog` |
| `E0047` | `orphan-cross-boundary-link-placeholder` | `assembled output retains an unresolved cross-boundary link placeholder` |
| `E0048` | `path-collision` | `dispatch path produced multiple provider outputs` |
| `E0049` | `path-template-invalid-field` | `path template references a field not in the documented allowlist` |
| `E0050` | `pipeline-host-scope-unavailable` | `pipeline /host operation from a step with no host component` |
| `E0051` | `pipeline-patch-targets-unassembled-fragments` | `pipeline PATCH targets an assembler provider's pre-assembly fragments` |
| `E0052` | `pipeline-target-not-emitted` | `pipeline PATCH targets a document the node did not emit` |
| `E0053` | `plugin-provider-incompatible` | `pipeline plugin is not compatible with the rendering provider` |
| `E0054` | `provider-node-input-invalid` | `provider rejected node input` |
| `E0055` | `provides-contract-unfulfilled` | `realizer does not publish a provides key its abstract entity's schema.provides contract declares` |
| `E0056` | `provides-evaluation-failed` | `provides template evaluation failed` |
| `E0057` | `provides-self-containment` | `provides block references a root outside the self-contained set` |
| `E0058` | `render-nondeterministic` | `provider render is not deterministic` |
| `E0059` | `self-inject-key-collision` | `duplicate delivery key across self-inject and uses-inject` |
| `E0060` | `template-unknown-root` | `template references a root the render context does not define` |
| `E0061` | `unknown-provider` | `unknown provider` |
| `E0062` | `custom-mechanism-has-no-mapping` | `custom inject mechanism has no matching key in injectMapping output; add the mechanism's key to the Recipe injectMapping` |
| `E0063` | `workload-entry-not-found` | `workload-library import references an entry not present in the WorkloadLibrary` |
| `E0064` | `workload-import-shape` | `workload $import: is not a bare-name workload-library reference (<Library>#/workloads/<entry>)` |
| `E0065` | `workload-library-not-found` | `workload-library import references a WorkloadLibrary not present in the catalog` |
| `E0066` | `dangling-uses-target` | `uses edge target does not exist` |
| `E0067` | `active-toggle-not-a-boolean` | `active toggle did not resolve to a boolean` |
| `E0068` | `sub-aggregate-nesting-depth-exceeded` | `max sub-aggregate nesting depth exceeded` |
| `E0069` | `mutator-patch-rejected` | `mutator patch rejected` |
| `E0070` | `reexport-cycle` | `re-exported component alias forms a cycle` |
| `E0071` | `release-edge-retarget` | `release edge retargets a developer-declared edge` |
| `E0072` | `sub-aggregate-not-loadable` | `sub-aggregate load failed` |
| `E0073` | `sub-aggregate-name-collision` | `flattened node ID collision: rename one of the colliding instances so their flattened IDs differ` |
| `E0074` | `unbound-release-edge-config` | `release per-edge configuration has no edge to apply to` |
| `E0075` | `aggregate-not-in-canonical-form` | `aggregate reached topology un-normalized (non-empty root components alongside a synthesized default subsystem)` |
| `E0076` | `unplaced-sub-module` | `` sub-module placed in no boundary: route it into a boundary under `aggregates`, or name its components there under `components` `` |
| `E0077` | `uses-target-not-active` | `uses edge target was pruned because its active toggle resolved to false` |
| `E0078` | `wasm-nested-producer-consumption-denied` | `producer-consumption re-entry denied: a producer reached through the host may not issue a further producer-consumption call` |
| `E0079` | `wasm-command-set-mismatch` | `wasm: recorded command mirror does not match plugin describe()` |
| `E0080` | `wasm-contract-mismatch` | `wasm: entity contract claim does not match plugin describe()` |
| `E0081` | `wasm-diagnostic-severity-invalid` | `wasm: guest plugin returned a diagnostic whose severity the contract does not declare` |
| `E0082` | `wasm-guest-error` | `wasm: guest plugin reported an error` |
| `E0083` | `wasm-guest-panic` | `wasm: guest plugin panicked during call` |
| `E0084` | `wasm-host-function-set-mismatch` | `wasm: stamped host-function record does not match .wasm imports` |
| `E0085` | `wasm-manifest-rejected` | `wasm: plugin rejected by the sandbox` |
| `E0086` | `wasm-plugin-exited` | `wasm: plugin invoked proc_exit` |
| `E0087` | `wasm-plugin-type-mismatch` | `wasm: declared plugin type does not match plugin describe()` |
| `E0088` | `wasm-plugin-version-mismatch` | `wasm: entity metadata.version does not match plugin describe()` |
| `E0089` | `all-versions-retracted` | `every published version this reference could select has been withdrawn` |
| `E0090` | `ambiguous-importer-plugin` | `format is advertised by more than one importer plugin` |
| `E0091` | `ambiguous-parser-plugin` | `format is advertised by more than one parser plugin` |
| `E0092` | `ambiguous-provider-plugin` | `capability is served by more than one provider plugin; add a plugins.providers entry to select one` |
| `E0093` | `ambiguous-type-mapping` | `manifest maps multiple version-distinct keys to the same base type; the type-to-recipe lookup is ambiguous` |
| `E0094` | `duplicate-entity-identity` | `duplicate entity identity within a single catalog directory` |
| `E0095` | `malformed-recipe-reference` | `malformed recipe reference in a Manifest mapping value` |
| `E0096` | `manifest-implements-mismatch` | `manifest mapping entry's recipe spec.implements does not match the mapped component-type / feature-type key` |
| `E0097` | `no-importer-for-format` | `no importer plugin advertises the requested format` |
| `E0098` | `no-parser-for-format` | `no parser plugin advertises the requested format` |
| `E0099` | `no-recipe-resolved` | `no recipe resolved for component/feature instance: add an explicit Manifest mapping for its type` |
| `E0100` | `provider-binding-unsatisfied` | `plugins.providers entry names a plugin no provider-rendering plugin serving the capability matches` |
| `E0101` | `provider-version-unsatisfiable` | `no provider-rendering plugin version satisfies the recipe's provider version pin` |
| `E0102` | `plugin-reference-must-not-be-registry-qualified` | `wasm plugin reference must be the plugin coordinate identity (<pluginType>/<name>:<version>), not a registry-qualified or artifact path` |
| `E0103` | `unsatisfiable-entity-version` | `no catalog version satisfies the referenced version constraint` |
| `E0104` | `plugin-reference-must-be-scoped` | `wasm plugin reference must carry a pluginType scope (<pluginType>/<name>); an empty scope cannot bind to an OCI location` |
| `E0105` | `recipe-reference-must-be-scoped` | `recipe reference must be provider-scoped (<provider>/<name>); an empty provider cannot bind to an OCI location` |
| `E0106` | `invalid-library-ref` | `resolve: invalid library reference URI` |
| `E0107` | `version-selection-conflict` | `resolve: minimal version selection conflict — incompatible library version requirements` |
| `E0108` | `catalog-cannot-load-sub-aggregate-bodies` | `resolve: catalog lookup cannot load resolved sub-aggregate bodies` |
| `E0109` | `catalog-cannot-load-recipe-bodies` | `resolve: catalog lookup cannot load resolved recipe and plugin bodies` |
| `E0110` | `source-template-at-lock-time` | `resolve: source-template evaluation failure at lock time` |
| `E0111` | `source-template-not-parsable` | `resolve: source-template parse error` |
| `E0112` | `source-template-provides-ref` | `resolve: source-template references .provides (invalid reverse reference)` |
| `E0113` | `sub-aggregate-depth` | `resolve: sub-aggregate inclusion depth exceeded` |
| `E0114` | `unresolvable-uri` | `resolve: no entity in the catalog matches this URI` |
| `E0115` | `ambiguous-dispatch` | `compactform: ambiguous dispatch — $mode required` |
| `E0116` | `constraint-type-mismatch` | `compactform: constraint not valid for declared type` |
| `E0117` | `escape-content-invalid` | `compactform: $jsonschema content invalid` |
| `E0118` | `host-in-library-ref` | `compactform: cross-document $ref carries a registry host; reference the library by identity` |
| `E0119` | `reference-unresolvable` | `compactform: $ref unresolvable` |
| `E0120` | `unknown-keyword` | `compactform: unknown keyword` |
| `E0121` | `unresolved-schema-library-ref` | `compactform: cross-document $ref target not found` |
| `E0122` | `deprecated-entity` | `deprecation: build consumes a deprecated entity` |
| `E0123` | `not-docs-bundle` | `docscache: artifact is not a documentation bundle` |
| `E0124` | `page-not-found` | `docscache: page not found in documentation bundle` |
| `E0125` | `offline-egress` | ``egress: network access refused because the workspace is offline; remediation: pass `--offline=false` to allow the network for this one run, or clear the top-level `offline` key in the configuration file (or AGGREGA_OFFLINE) to allow it from now on; where the work is a build that needs content the machine does not have, run `aggrega pull --release <release>` from a connected environment first to populate the cache`` |
| `E0126` | `acquisition-disabled` | `externalinputs: acquisition is disabled for unpinned inputs` |
| `E0127` | `digest-mismatch` | `externalinputs: fetched bytes mismatch the pinned digest` |
| `E0128` | `scheme-not-allowed` | `externalinputs: URL scheme is not allowed` |
| `E0129` | `store-corrupt` | `externalinputs: store blob mismatches its pinned record` |
| `E0130` | `lockfile-drift` | `lockfile: out of date; it no longer matches the current catalog` |
| `E0131` | `lockfile-invalid` | `lockfile: file failed schema validation` |
| `E0132` | `ambiguous-content-layer` | `oci: manifest has multiple layers of the expected content media type` |
| `E0133` | `cached-manifest-integrity` | `oci: cached manifest digest mismatch` |
| `E0135` | `fetch-integrity` | `oci: content digest mismatch` |
| `E0136` | `fetch-network-unreachable` | `oci: network unreachable` |
| `E0137` | `fetch-not-found` | `oci: artifact not found at remote source` |
| `E0138` | `fetch-unauthorized` | `oci: authentication required or failed` |
| `E0139` | `immutable-tag-conflict` | `oci: tag already published with different content` |
| `E0140` | `no-content-layer` | `oci: manifest has no layer of the expected content media type` |
| `E0141` | `oci-location-collision` | `oci: distinct catalog identities map to the same OCI repository location` |
| `E0142` | `referrer-discovery-unavailable` | `oci: referrer discovery could not be completed` |
| `E0143` | `unknown-entity-kind` | `oci: unknown entity kind for mediatype dispatch` |
| `E0144` | `plugin-bundle-digest-mismatch` | `cached signature bundle does not match its recorded digest` |
| `E0145` | `plugin-entity-not-found` | `plugin reference is not a Plugin entity` |
| `E0146` | `reference-cycle` | `circular reference expansion` |
| `E0147` | `malformed-trust-policy` | `registrytrust: advertised trust config is malformed` |
| `E0148` | `no-trust-advertised` | `registrytrust: registry advertises no trust config` |
| `E0149` | `attachment-slot-near-miss` | `attachment name is a near miss for a declared slot` |
| `E0150` | `attachment-slot-shape` | `attachment does not conform to its declared slot shape` |
| `E0151` | `duplicate-boundary-component` | `component declared in more than one boundary: declare each component in exactly one boundary` |
| `E0152` | `duplicate-triad-identity` | `duplicate Aggregate/Manifest identity (metadata.name) in the Release directory` |
| `E0153` | `feature-merge-conflict` | `feature merge conflict: reconcile the Aggregate and Release declarations for the feature` |
| `E0154` | `internal-catalog-view-disagreement` | `the compiler's own views of the catalog disagree` |
| `E0155` | `inject-key-collision` | `duplicate delivery key across inject sources` |
| `E0156` | `invalid-inject-key` | `invalid inject key: the from-key must name a declared provides key of the target component type` |
| `E0158` | `invalid-parameter-ref` | `invalid parameter reference: check the {{ .parameters.* }} expression names a declared parameter and parses as a Go template` |
| `E0160` | `manifest-cross-binding-pillar-collision` | `manifest annotation bindings collide on same Feature path+pillar` |
| `E0161` | `manifest-reserved-prefix` | `manifest annotation binding uses reserved prefix` |
| `E0162` | `missing-required-feature` | `missing required feature: attach a Feature of the required type to the component` |
| `E0163` | `missing-required-socket` | `required uses socket not populated` |
| `E0164` | `parameter-contract-violation` | `parameter contract violated` |
| `E0165` | `parameter-missing` | `required parameter not supplied` |
| `E0167` | `provides-key-not-declared` | `Recipe publishes a provides key its Component does not declare` |
| `E0168` | `schema-conformance` | `authored pillar does not conform to its declared schema` |
| `E0169` | `self-inject-forbidden` | `self-inject on component without spec.inject allowlist` |
| `E0170` | `triad-ref-unresolvable` | `aggregate/manifest reference unresolvable` |
| `E0171` | `unknown-uses-socket` | `unknown uses socket: name a socket the entity declares in its usesSchema — only a component's own uses block may name one the catalog did not declare` |
| `E0172` | `release-not-in-canonical-form` | `release reached resolve un-normalized (non-empty root components alongside a synthesized default boundary)` |
| `E0173` | `unread-parameter` | `declared parameter is read by no reference in the Aggregate` |
| `E0174` | `uses-socket-near-miss` | `uses socket name is a near miss for a declared socket` |
| `E0175` | `document-not-loadable` | `file load failed: the file could not be read, or its bytes did not parse` |
| `E0176` | `keyless-signing-requires-network` | `signing: keyless signing requires a live identity provider, Fulcio, and Rekor` |
| `E0177` | `no-signature-found` | `signing: no signature found for an artifact that requires one` |
| `E0178` | `no-trusted-identities` | `signing: keyless verification requires at least one trusted identity` |
| `E0179` | `signature-invalid` | `signing: signature does not verify` |
| `E0180` | `signature-verification-failed` | `signing: signature bundle does not verify` |
| `E0181` | `signing-policy-requires-signature` | `signing: signing policy requires a signature for this artifact kind; refusing to push unsigned content` |
| `E0182` | `trust-root-not-loadable` | `signing: cannot load pinned trust root` |
| `E0183` | `unsigned-push-refused` | `signing: registry requires signatures; refusing to push unsigned content` |
| `E0184` | `unsupported-key` | `signing: unsupported held-key type` |
| `E0185` | `untrusted-identity` | `signing: signature identity is not trusted for this registry` |
| `E0186` | `unknown-source-kind` | `sourceresolver: no adapter registered for source kind` |
| `E0187` | `empty-workspace-root` | `cacheslot: empty workspaceRoot` |
| `E0188` | `artifact-entry-shape` | `artifacts entry: shape must be a string scalar or {$import: <local-path>}` |
| `E0189` | `artifact-library-entry-shape` | `artifactlibrary: entry must be a mapping of filename to a string body` |
| `E0190` | `forbidden-keyword` | `schemalibrary: forbidden JSON Schema keyword` |
| `E0191` | `mapping-entry-not-scalar` | `mappinglibrary: entry body must be a string scalar` |
| `E0192` | `document-nesting-depth-exceeded` | `OrderedMap: decode depth exceeded` |
| `E0193` | `parameters-shape` | `parameters: shape must be an inline object or {$import: <local-path>}` |
| `E0194` | `template-not-found` | `schemalibrary: template not found` |
| `E0195` | `template-param-missing` | `schemalibrary: template parameter missing` |
| `E0196` | `template-param-type-mismatch` | `schemalibrary: template parameter type mismatch` |
| `E0197` | `values-mapping-shape` | `valuesmapping: shape must be a string scalar or {$import: <path-or-library-identity>}` |
| `E0198` | `well-known-annotation-scope` | `wellKnownAnnotations: a key is declared at a scope the provider's contract does not render` |
| `E0199` | `workload-entry-not-scalar` | `workloadlibrary: entry body must be a string scalar` |
| `E0200` | `workload-template-shape` | `workload: shape must be a string scalar or {$import: <path-or-library-identity>}` |
| `E0201` | `assertion-name-collision` | `assertion name declared twice across the extends chain` |
| `E0202` | `cyclic-extension` | `cyclic extends chain` |
| `E0203` | `feature-recipe-eval-provider-constraint` | `featurerecipe eval-provider constraint: render input-kind fields are forbidden when provider is eval` |
| `E0204` | `feature-recipe-values-mapping-requires-source` | `FeatureRecipe: valuesMapping requires source` |
| `E0205` | `extends-merge-failed` | `inheritance merge failed` |
| `E0206` | `recipe-eval-provider-constraint` | `recipe eval-provider constraint: input-kind fields are forbidden when provider is eval` |
| `E0207` | `recipe-output-component-label-collision` | `recipe output-component-labels constraint: key is also declared in outputLabels` |
| `E0208` | `recipe-output-label-reserved-namespace` | `recipe output-labels constraint: key uses a reserved namespace` |
| `E0209` | `recipe-values-mapping-requires-source` | `Recipe: valuesMapping requires source` |
| `E0210` | `recipe-no-input-kind` | `Recipe: at least one input kind required` |
| `E0211` | `recipe-filename-collision-across-input-kinds` | `filename collision across input kinds: two input-kind blocks produced a file under one output name` |
| `E0212` | `slot-not-referenceable` | `workload attachment slot is not referenceable` |
| `E0213` | `workload-features-schema` | `workload featuresSchema cross-check failed` |
| `E0214` | `workload-not-valid` | `workload validation failed` |
| `E0215` | `entity-envelope-invalid` | `document envelope validation failed` |
| `E0216` | `schema-extension-evaluation-failed` | `validator/jsonschema: x-aggrega extension evaluation failed` |
| `E0218` | `schema-not-resolvable` | `validator/jsonschema: schema resolution failed` |
| `E0220` | `extends-chain-too-deep` | `extends chain exceeds maximum depth` |
| `E0221` | `schema-merge-input-invalid` | `merger: invalid merge input` |
| `E0222` | `ambiguous-registry-alias` | `registry alias matches more than one host` |
| `E0223` | `capability-on-cross-cutting-socket` | `a cross-cutting socket is bound by capability but attaches by uri` |
| `E0224` | `workspace-config-invalid` | `file failed schema validation` |
| `E0225` | `duplicate-provider-target` | `capability is bound to more than one provider plugin` |
| `E0226` | `duplicate-registry-alias` | `registry alias is already used by another host` |
| `E0227` | `governance-role-invalid` | `a governance attachment declares no role or an unknown role` |
| `E0228` | `inert-field-on-provider-socket` | `a provider socket binding sets a field with no referent on that socket` |
| `E0229` | `position-out-of-range` | `position out of range` |
| `E0246` | `verdict-plugin-trust-mismatch` | `the digest recorded as trusted for this plugin does not match the digest its cached manifest reports` |
| `E0247` | `verdict-attachment-not-configured` | `a plugin recorded as trusted for an accept-or-reject verdict is no longer attached at any verdict role` |
| `E0248` | `wasm-output-shape` | `wasm: guest plugin returned an output that is not the shape the socket reads` |
| `E0250` | `nest-segment-not-one-directory` | `provider named a directory for each contributor's own sub-directory that is not a single directory name` |
| `E0251` | `recipe-source-is-empty` | `recipe source is an empty string, which names neither sourceless mode nor sourced mode` |
| `E0252` | `artifact-library-file-escapes-key` | `artifact-library bundle file name leaves the artifacts key its output is nested under` |
| `E0253` | `annotation-binding-target-unresolved` | `annotation binding does not resolve against its target Feature` |
| `E0254` | `annotation-subkey-not-conforming` | `annotation subkey does not conform to the target Feature's schema at the routed pillar` |
| `E0255` | `annotation-side-pillar-mismatch` | `annotation routes through a pillar its authoring side may not use` |
| `E0256` | `annotation-binding-pillar-overlap` | `annotation binding declares one path in both pillar lists` |
| `E0257` | `schema-contract-compile-failure` | `declared schema contract could not be compiled into a usable schema, so nothing was validated against it: correct the contract where it is declared, or remove it if the configuration it covers needs no validation` |
| `E0259` | `boundary-scope-attachment-not-declared-at-a-boundary` | `attachment binds a FeatureRecipe with executionScope: boundary and no boundary holding the component declares it` |
| `E0260` | `unplaced-component` | `` component placed in no boundary: name it under a boundary's `components`, or place the sub-module that contributes it under `aggregates` `` |
| `E0261` | `unresolved-boundary-component` | `boundary names a component the composition does not hold: correct the name, or remove the entry` |
| `E0262` | `unusable-component-identity` | `component identity cannot be the name its emitted resources are stamped with: rename the component` |
| `E0263` | `component-identity-target-refuses` | `the target will not accept a name derived from this component's authored identity: rename the component` |
| `E0264` | `provider-refused-every-component-identity` | `provider guest never accepted a component identity the compiler composed for it` |
| `E0265` | `unsupported-input-kind` | `provider does not support the node's input kind` |
| `E0266` | `unusable-schema-import` | ``a schema `$import:` could not be applied`` |
| `E0267` | `unknown-schema-pillar` | `a schema block declares a key that names no data pillar` |
| `E0268` | `pipeline-patch-unit-not-carved` | `reassemble names a patched unit token the carve did not produce; a conforming codec carves and reassembles a file under the same tokens` |
| `E0269` | `provider-render-duplicate-path` | `provider guest returned two output files under one path; a conforming guest returns each output path at most once` |
| `E0270` | `link-patch-file-not-emitted` | `link patch names an output file the dispatch group did not emit; a conforming link patch names a file the group's own render returned` |
| `E0271` | `pipeline-emit-file-absent` | `emit_file side effect carries no file; a conforming emit_file side effect carries a file with its path and content` |
| `E0272` | `pipeline-side-effect-kind-undefined` | `side effect declares a kind the plugin contract does not define; a conforming side effect declares emit_file or emit_crd` |
| `E0273` | `rendered-name-unavailable` | `template reads the name the target renders author-supplied source under, and this node's provider reports no such name; a conforming template reads a value the node's own provider supplies` |
| `E0274` | `verdict-plugin-identity-changed` | `the plugin identity recorded as trusted no longer matches what this resolution reports` |
| `E0275` | `edit-refused-invalid-result` | `the edit was refused because the resulting document would not be valid, and nothing was written` |
| `E0276` | `schema-evolution` | `the version being published changes the published predecessor in a way the documented evolution rubric objects to` |
| `E0277` | `annotation-prefix` | `an annotation key on the entity uses a prefix the platform reserves` |
| `E0278` | `name-shape` | `the entity's name does not follow the documented name shape for its kind` |
| `E0279` | `dynamic-refs` | `a schema in the entity uses a dynamic reference construct that cross-document reference resolution cannot follow` |
| `E0280` | `id-overrides` | `a schema in the entity declares an identifier of its own, where the platform owns that schema's identity` |
| `E0281` | `category-matches-directory` | `the entity's category label does not match the category directory the entity is filed under` |
| `E0282` | `x-aggrega-discouragement` | `the entity writes an Aggrega schema extension directly into schema content instead of declaring it under usesSchema or featuresSchema` |
| `E0283` | `plugin-default-limits` | `the Plugin entity declares no runtime resource cap of its own, so the platform defaults apply` |
| `E0284` | `secret-slot-declares-sensitive` | `an attachment slot admits only secret material and does not declare that it handles it` |
| `E0285` | `provides-declared-by-component` | `the Recipe publishes a provides key the Component it implements does not declare, so a consumer wiring that key is refused` |
| `E0286` | `publish-bump-below-classification` | `the version bump being published is smaller than the evolution check's classification of the change requires` |
| `E0287` | `import-halting-diagnostic` | `the importer reported a diagnostic that stops the import, so the source was not fully turned into draft authoring files` |
| `E0288` | `plugin-cannot-express-input` | `a plugin has no expression for a construct this build declares` |
| `E0289` | `plugin-required-input-unresolved` | `a plugin could not resolve something it requires to exactly one value` |
| `E0290` | `plugin-output-name-collision` | `two things a plugin produced occupy one name in its output` |
| `E0291` | `plugin-value-not-representable` | `a plugin has no representation for a value it was given` |
| `E0292` | `plugin-failure-unclassified` | `a plugin reported a failure that none of the declared kinds names` |
| `E0293` | `wasm-guest-condition-undeclared` | `wasm: guest plugin named a condition the socket does not declare` |
| `E0294` | `subsystem-component-identity-collision` | `components in different subsystems take the same identity: rename one of them, since a subsystem contributes nothing to a component's identity` |
| `E0295` | `library-reference-whitespace` | `library reference: a reference to a library entry carries no whitespace or line break` |
| `E0296` | `release-chain-composes-both-routing-keys` | `release extends chain composes both named boundaries and top-level components: declare one routing shape across the chain, never both` |
| `E0297` | `inherited-boundary-directory-is-literal` | `inherited boundary directory carries no template variable, so it resolves to the path the extended Release writes to` |
| `E0298` | `bundle-no-entity-document` | `oci: published bundle carries no entity document` |
| `E0299` | `bundle-ambiguous-entity-document` | `oci: published bundle carries more than one entity document` |
| `E0300` | `bundle-unreadable` | `oci: published bundle cannot be unpacked` |
| `E0301` | `published-artifact-not-an-entity` | `oci: published artifact is not an entity document` |
| `E0302` | `entity-not-pinned` | `an input the entity reads has no pin recorded for it in the entity.lock beside it` |
| `E0303` | `entity-shares-its-directory` | `the entity shares its directory with another entity, and an entity of its kind has a directory of its own` |
| `E0304` | `content-outside-entity-directory` | `a path names content outside the entity's own directory` |
| `E0305` | `local-source-content-mismatch` | `the files of the entity's local source do not match the pins recorded for them in entity.lock` |
| `E0306` | `plugin-artifact-not-found` | `plugin artifact not found on this machine` |
| `E0307` | `cache-location-outside-cache` | `a value a cache location is built from would place cached files outside the place it names in the cache` |
| `E0308` | `conflicting-features-reach-one-component` | `a Feature reaches a component alongside a Feature it declares a conflict with` |

- `E0002` is retired: nothing reports it now, and the number is never handed to a different condition. It named a catalog lookup that fails while the graph's static contracts are checked — a fault in the compiler rather than in an authored document — and the condition raised when a build resolves a component type the catalog it reads then holds no entry for reports that state now, and its code is `E0154`.
- `E0134` is retired: nothing reports it now, and the number is never handed to a different condition. It named a publishable entity whose directory was not named after the version the entity declares; a publication no longer judges a directory's name, and the condition raised when an entity shares its directory with another entity where its kind has a directory of its own is `E0303`.
- `E0157` is retired: nothing reports it now, and the number is never handed to a different condition. It named an Aggregate key — a component, feature, subsystem or nested-module instance name — that did not match the authored-name pattern. Every one of those key surfaces is constrained to that same spelling by the Aggregate schema, which refuses the document while validating its envelope and reports the offending key with a line and column; that condition's code is `E0215`.
- `E0159` is retired: nothing reports it now, and the number is never handed to a different condition. It named a target reference whose dot-separated segments did not all match the instance-name pattern, and no build reported it before the condition was withdrawn.
- `E0166` is retired: nothing reports it now, and the number is never handed to a different condition. It named the file a Release's `parameters: { $import: … }` points at when that file could not be read or its bytes did not parse; a file that yields no document is one condition wherever the path was written, and its code is `E0175`.
- `E0217` is retired: nothing reports it now, and the number is never handed to a different condition. It named a schema-validation failure that could not be reported against a particular field, and no build reported it before the condition was withdrawn.
- `E0219` is retired: nothing reports it now, and the number is never handed to a different condition. It named a cyclic `extends` chain, reported by a second chain walk the schema-merge library kept beside its combining step; one walk reports every cyclic chain now, and its code is `E0202`.
- `E0230` is retired: nothing reports it now, and the number is never handed to a different condition. The condition this number named was withdrawn, and no build reports it.
- `E0231` is retired: nothing reports it now, and the number is never handed to a different condition. The condition this number named was withdrawn, and no build reports it.
- `E0232` is retired: nothing reports it now, and the number is never handed to a different condition. The condition this number named was withdrawn, and no build reports it.
- `E0233` is retired: nothing reports it now, and the number is never handed to a different condition. The condition this number named was withdrawn, and no build reports it.
- `E0234` is retired: nothing reports it now, and the number is never handed to a different condition. It named a Recipe source that is an empty string, reported while rendering through the compose provider; one condition covering every provider reports that now, and its code is `E0251`.
- `E0235` is retired: nothing reports it now, and the number is never handed to a different condition. The condition this number named was withdrawn, and no build reports it.
- `E0236` is retired: nothing reports it now, and the number is never handed to a different condition. The condition this number named was withdrawn, and no build reports it.
- `E0237` is retired: nothing reports it now, and the number is never handed to a different condition. The condition this number named was withdrawn, and no build reports it.
- `E0238` is retired: nothing reports it now, and the number is never handed to a different condition. The condition this number named was withdrawn, and no build reports it.
- `E0239` is retired: nothing reports it now, and the number is never handed to a different condition. The condition this number named was withdrawn, and no build reports it.
- `E0240` is retired: nothing reports it now, and the number is never handed to a different condition. The condition this number named was withdrawn, and no build reports it.
- `E0241` is retired: nothing reports it now, and the number is never handed to a different condition. The condition this number named was withdrawn, and no build reports it.
- `E0242` is retired: nothing reports it now, and the number is never handed to a different condition. It named a Recipe source that is an empty string, reported while rendering through the Helm provider; one condition covering every provider reports that now, and its code is `E0251`.
- `E0243` is retired: nothing reports it now, and the number is never handed to a different condition. The condition this number named was withdrawn, and no build reports it.
- `E0244` is retired: nothing reports it now, and the number is never handed to a different condition. The condition this number named was withdrawn, and no build reports it.
- `E0245` is retired: nothing reports it now, and the number is never handed to a different condition. The condition this number named was withdrawn, and no build reports it.
- `E0249` is retired: nothing reports it now, and the number is never handed to a different condition. The condition this number named was withdrawn, and no build reports it.
- `E0258` is retired: nothing reports it now, and the number is never handed to a different condition. The condition this number named was withdrawn, and no build reports it.
<!-- END GENERATED: condition-short-codes -->

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

There is no exported entry point that runs a whole build, so `errors.Is` matching applies to code calling these packages directly. To gate CI on a build, run `aggrega build` and read its exit status and its diagnostics: their message text is catalogued in [fatal-halts.md](./fatal-halts.md), their category in [error-translation.md](./error-translation.md), and the short code in their bracketed head resolves in [the table of every condition](#every-condition-by-short-code) on this page.

The two gating paths exist because the three identifiers reach different distances. A gate written in Go links these packages, matches sentinels, and can read either code off any error it holds. A gate written around the command has the exit status and the printed text — and the printed text names the condition, because the short code sits in the bracketed head. So such a gate keys on that short code rather than on message wording, and the message-keyed views stay the way to work back from wording it already has. Match the sentinel from Go; key on the short code around the command; read the descriptive code off the structured diagnostic where a client speaks that protocol.

Sentinels declared in different packages with the same short name are distinct conditions, not two spellings of one: `errors.Is` distinguishes them by identity, so a match against one does not match the other. The re-exports called out in the tables are the exception, and they are called out precisely because they are the case where two names do match. Match against the name in the package the tables list it under, and treat a short name on its own as ambiguous.

For the user-facing diagnostic catalogue (the messages developers see in their terminal when a build halts), see [fatal-halts.md](./fatal-halts.md). For the advisory-warning catalogue (the non-halting `warning:`, `lint:` and `notice:` output), see [warnings.md](./warnings.md). For the category-prefix taxonomy (`[DEVELOPER_ERROR]` / `[OPS_ERROR]` / `[CATALOG_ERROR]` / `[TRANSLATION_ERROR]` / `[FETCH_ERROR]` / `[POLICY_ERROR]` / `[TRUST_ERROR]`), see [error-translation.md](./error-translation.md).
