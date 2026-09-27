# Error translation discipline

Aggrega's compilation pipeline emits errors from many surfaces — schema validators, the resolver, the IR builder, the providers, the Go template engine, and the underlying YAML / Helm / docker-compose libraries the providers wrap. Errors that bubble to the CLI open with a bracketed head naming up to two things — a category, which says which concern to look at (for most values, the authoring surface at fault), and the short code of the condition that halted the build — followed by a source pointer and a message. Where a plugin raised the condition, the code is qualified by the plugin that raised it, because a code is unique only within whoever handed it out. This page documents the shape of that output so authors interpret error messages directly.

For the per-error catalog (every fatal halt with how-to-fix guidance), see [`fatal-halts.md`](fatal-halts.md). For the four schema-validation layers and how their error shapes interact, see [`vocabulary/validation-surface.md`](../vocabulary/validation-surface.md).

## The error categories

A category tag says which concern to look at. Most of them name the authoring surface where the fix lives; the rest name a concern that is nobody's authoring mistake — acquiring an artifact, a governance verdict, or trust and signing — and the head's short code beside the category is what identifies the specific condition in every case:

- **`[DEVELOPER_ERROR]`** — the failure attaches to Aggregate authoring. The fix is in the Aggregate YAML or in the developer-authored portion of the catalog (Component values, `uses` sockets, Feature attachments). Example surfaces: resolver halts on Aggregate-side issues; analyzer selector and `appliesTo` violations.
- **`[OPS_ERROR]`** — the failure attaches to the operator's own documents, the Release and the Manifest. The fix is in the Release YAML (boundary topology, parameter values, Feature attachments at the Release level) or in the Manifest YAML (which Recipe a type is deployed through, and the annotation bindings written beside it). Example surfaces: Release schema validation; boundary-path template evaluation; `subDirectory` collisions across providers; Manifest mapping and annotation-binding refusals.
- **`[CATALOG_ERROR]`** — the failure attaches to a catalog entity (Recipe, FeatureRecipe, Component, Feature, Plugin). The fix is in the catalog content. Example surfaces: Recipe shape rules; Workload `featuresSchema` cross-checks; template parse errors in catalog-authored templates.
- **`[TRANSLATION_ERROR]`** — the failure attaches to provider-side synthesis (the helm, helm-chart, or compose provider attempting to translate a Workload, valuesMapping output, or sourced overlay into provider-native artifacts). The fix is typically in the Workload's `services` / `containers` / `volumes` shape, the Recipe's `valuesMapping` template output, or the source-mode overlay structure.
- **`[FETCH_ERROR]`** — the failure attaches to fetching a pinned dependency from a registry or remote source, not to any authoring surface. The fix is usually operational: authenticate to the registry (`docker login <registry>`), restore connectivity, or re-pin a drifted or tampered artifact (`aggrega pull --upgrade --release <release>`). Example surfaces: a catalog entity or chart not found at the registry; authentication required or failed; the network unreachable; a cached artifact's digest not matching the lockfile. Fetch errors carry a concrete remediation pointer in the message.
- **`[POLICY_ERROR]`** — the build was rejected by a policy plugin attached at a governance verdict role. This is not an authoring-surface fault: the input is well-formed, but it fails a governance rule (compliance, FinOps, or security) the plugin enforces. The fix is to bring the deployment into compliance with the enforced policy, or to reconsider the policy attachment. The message names the rejecting plugin and carries the rule message it supplied.
- **`[TRUST_ERROR]`** — the trust and signing layer refused the operation. This category names a concern rather than an authoring surface, and it covers two remedies you can tell apart from the short code beside it. **Your trust configuration is wrong:** a trust policy that cannot be read, a pinned trust root that cannot be loaded, a keyless policy declaring no trusted identity, a signing policy that requires a signature for the artifact kind you are publishing, or a plugin recorded as trusted for a verdict attachment your configuration no longer attaches. **This artifact failed verification:** a signature that does not verify against the trust anchor, an artifact carrying no signature where one is required, a signature from a real but untrusted signer, or a plugin whose recorded trusted identity no longer matches what resolves. The fix in the first case is in your configuration or in the committed trust record; in the second it is a decision about the artifact — restore the reviewed one, or review and re-record what changed.

## Output shape

A printed diagnostic opens with the bracketed head and the source pointer, and puts the message on its own indented line:

<!-- unregistered-output: an output grammar, whose metavariables stand in for whichever condition was met rather than quoting one -->

```text
[CATEGORY SHORTCODE] <source>
  <message>
```

The head carries two tokens, and they answer different questions. The category is one of those above and says which concern to look at. The short code is the letter `E` and four digits, and it names the exact condition that halted the build: quote it in a report, type it into a search, or resolve it against the table of every condition in [`sentinels.md`](sentinels.md). Neither is derivable from the other, which is why both are printed — and where a category covers more than one remedy, as `[TRUST_ERROR]` does, the short code is what tells you which one you met.

### A code a plugin raised is qualified by the plugin that raised it

A short code is unique only within whoever handed it out. Aggrega's own codes cannot collide with one another: a condition declared under a number another condition already holds is refused before the compiler reads any input. Nothing holds that across plugin authors — each allocates codes for their own plugin's conditions, and no author can see another's allocations — so two plugins can publish the same short code for two conditions that have nothing to do with each other.

The plugin's identity is what tells those apart, and a head reporting a condition a plugin raised carries it immediately before the code:

<!-- unregistered-output: an output grammar, whose metavariables stand in for whichever plugin and condition were met rather than quoting one -->

```text
[CATEGORY PLUGIN/SHORTCODE] <source>
  <message>
```

**The short code is always the final segment** — the letter `E` and four digits, after the last `/`. A plugin's identity carries separators of its own, and may carry a version, so reading from the end rather than from the first `/` is what makes the code recoverable from any head. Everything before that final segment is the plugin.

Where you resolve the code depends on which of the two segments you are holding. A plugin that ships with Aggrega declares its conditions the same way the compiler does, so its codes are listed beside the compiler's in the table of every condition in [`sentinels.md`](sentinels.md), and `aggrega explain` resolves them. A plugin you obtained elsewhere allocates its own codes, and they are the plugin author's to document: that table lists the conditions Aggrega declares, and a code it does not list is one to look up in the plugin's own reference. Either way, quote the final segment alone to `aggrega explain` — the qualifier says whose code it is, not which code it is.

A head printing a bare short code is reporting a condition Aggrega itself raised, which includes the case where a plugin failed and named no condition of its own. There the compiler's generic plugin-failure condition is what halted the build, and the plugin's message carries the detail.

### Either token may be absent, and an absent one is omitted

Nothing ever stands in for a token the diagnostic does not have — no placeholder, no empty brackets. There are three ways a head can be short, and each tells you something:

- **No short code.** The failure names no condition of Aggrega's own — most often a fault reported by a library the compiler wraps. The head prints the category alone, so you still know which surface to look at.
- **No category.** The failure has no concern to send you to, so none is guessed. The head prints the short code alone, and the code is what you resolve. Two situations produce it, and they read alike because for your purposes they are alike — neither tells you where to look, and the code tells you what happened. One is a fault in the compiler itself, where the message says so and asks you to report it; the compiler's own views of the catalog disagreeing with each other is the case that arises. The other is a failure that names a condition but never crossed a surface that files it under a concern, which is the usual shape for a refusal raised at the command boundary. **A category is never invented to fill the gap**, and that is the point of the omission rather than a limitation of it: the category answers "which concern do I look at", and an answer supplied where the question has none is not a cautious answer but a wrong one, acted on first. It is also worth saying that the reverse inference does not hold: a head that *does* carry a category is not always pointing at something you authored, because `[FETCH_ERROR]`, `[POLICY_ERROR]` and `[TRUST_ERROR]` each name a concern rather than an authoring surface.
- **Neither.** The brackets are omitted entirely and the diagnostic is its message. This is a failure that names no condition of Aggrega's own *and* has no concern to send you to: a command that refuses its arguments, a file it cannot read, a cancellation, or a fault reported by a library the compiler wraps without any condition of ours underneath it. There is nothing to resolve against [`sentinels.md`](sentinels.md), and the message is the whole of what the failure has to say.

The same error reduced to one line, the form suitable for log output rather than for a terminal, carries the category and drops the short code:

<!-- unregistered-output: an output grammar, whose metavariables stand in for whichever condition was met rather than quoting one -->

```text
[CATEGORY] <source>: <message>
```

A category absent from the head is absent here too, brackets included, so this line is never `[] <source>: <message>`. The one-line form is re-wrapped into enclosing frames as the failure travels up, so an empty tag would be carried into every one of them.

The source is a structured pointer — typically `<file>:<line>:<column>` when a YAML position is available, or a logical identifier (the catalog entity name, the Release name, the boundary path) when no file position applies. A third shape, `<file> at <key>`, appears when the pointer knows both the document and the authoring key inside it but no byte position: the file is what you open, and the key is what to look at once open. The message is the per-surface diagnostic.

A rule evaluated over the finished graph reports in that third shape, and the key is what tells two findings apart when the message alone cannot. A rule of this kind names the *declaring* component type rather than the instance, so two components of one type failing the same rule carry the same message about the same file:

```text
[DEVELOPER_ERROR E0162] aggregate.yaml at .spec.components.checkout
  missing required feature: attach a Feature of the required type to the component ("core/observability/monitoring", required by component type "core/compute/api-server", under the requirement label "monitoring")
---
[DEVELOPER_ERROR E0162] aggregate.yaml at .spec.components.inventory
  missing required feature: attach a Feature of the required type to the component ("core/observability/monitoring", required by component type "core/compute/api-server", under the requirement label "monitoring")
```

The key is the only part that differs, and it is what names which of the two components to edit. Both findings carry the same short code because both are the same condition, met twice — the short code names the rule, and the key names the occurrence.

Two further lines belong to the shape, for a failure that carries the context to fill them — the template expression that failed, and a snapshot of the pillars in scope where it failed:

<!-- unregistered-output: an output grammar, whose metavariables stand in for whichever condition was met rather than quoting one -->

```text
[CATEGORY SHORTCODE] <source>
  <message>
  expression: <the template excerpt that triggered the failure>
  active pillars:
    <one line per top-level pillar key in scope at the point of failure>
```

The `expression:` line carries the template excerpt that triggered the failure. The `active pillars:` block lists the top-level pillar keys available at the point of failure, so authors see what was queryable. Both are omitted when the failure carries neither.

## Nested context frames

An error often crosses more than one surface on its way to the CLI: a load phase wraps the specific entity failure, which itself wraps a sentinel explaining the rule. Every categorized frame in such a chain renders — the outermost as the head in the shape above, each nested frame as an indented `caused by:` continuation carrying its own category tag, source pointer, and message. The innermost file-pointed frame is always visible:

```text
[CATALOG_ERROR E0094] aggrega-catalog
  catalog load
  caused by: [CATALOG_ERROR] aggrega-catalog/recipe/compose/mariadb-copy/recipe.yaml
    recipe identity "compose/mariadb:1.0.0" already declared in this catalog directory
    caused by: duplicate entity identity within a single catalog directory
```

**Only the head carries a short code, and the continuations carry their category alone.** The condition is named once, at the point the reader meets the failure; the frames beneath a `caused by:` marker are that same failure seen from further in, so repeating its identifier on each would add lines without adding facts. A `note:` block is not a continuation and does not follow this rule — it reports *other* documents' conditions rather than the same one from further in; [the section below](#a-refused-catalog-file-and-the-failure-it-explains) covers it. The code the head prints is the one the chain names — here the rule at the very bottom — so a phase-context frame at the top still identifies the condition underneath it.

Reading top-down: the phase that failed, then the entity (with its file path) that caused it, then the rule it violated. A nested frame that adds nothing beyond its parent (same category, same source, a message the parent already contains) is deduplicated rather than repeated, and a terminal explanation renders only when the frames above it don't already carry its text.

A chain runs deeper whenever a failure crosses more surfaces on its way out, and the rule holds at every depth. A template refused inside a Recipe's synthesized Workload crosses three — the node being rendered, the Recipe's template surface, and the template itself:

```text
[CATALOG_ERROR E0060] db
  rendering node "db"
  caused by: [CATALOG_ERROR]
    recipe "mariadb" workload template
    caused by: [CATALOG_ERROR] workload[mariadb]
      template references a root the render context does not define (template "workload[mariadb]" references ".nosuchroot.database", the render context defines .context, .values, .infra, .locals, .provides, .features, .metadata, .attachment_name, .inject, .inject_raw, .steps, .source, .workload, .boundary)
```

Read it top-down as before, and note three things the extra depth makes visible. **The short code appears once, on the head**, however many continuations follow it. **The innermost frame is where the condition's own sentence sits**, so the deepest line is both the one to match on and the one that says what to change. And **a frame with no source pointer prints its category alone**: the middle frame above names the surface it failed on inside its message, because that surface is a template rather than a file and has no position to point at.

When the failure forks beneath a frame — a phase that collected several independent violations before halting — the continuation carries a count, and every collected failure renders beneath it, separated by the same `---` rule the multi-error chains below use:

```text
[OPS_ERROR E0099]
  recipe resolution
  caused by (2):
    no recipe resolved for component/feature instance: add an explicit Manifest mapping for its type: component "edge" (type "example/gateway/nginx-reviewed"); no recipe implements this type
  ---
    no recipe resolved for component/feature instance: add an explicit Manifest mapping for its type: component "internal" (type "example/gateway/nginx-reviewed"); no recipe implements this type
```

The collected failures beneath the count are continuations too, so none of them repeats the head's short code — which is what keeps a fork of a dozen violations from printing the same identifier a dozen times.

One separator grammar applies throughout: `---` between sibling failures, `caused by:` between nested context frames.

## A refused catalog file and the failure it explains

Loading a catalog to resolve what a Release depends on is tolerant on purpose: a file that cannot be read, parsed or indexed is refused and recorded rather than aborting the whole load. That is what keeps a broken entity your Release never touches from failing an unrelated build.

The consequence is that a refused file goes missing from the catalog silently — and if your Release *does* reach it, what fails is the attempt to resolve a reference to what that file declared. That failure is a *consequence* of the refusal rather than the refusal itself, so the report puts the two in causal order wherever it can name the refusal exactly:

```text
[CATALOG_ERROR E0215] catalog/recipes/helm/server.yaml
  document envelope validation failed (Recipe, at catalog/recipes/helm/server.yaml); 6:1: spec.implements: missing required property: implements. correct the document to match its kind's schema
  note: this file was skipped at load, so the catalog holds nothing under the identity it declares.
  This Release reaches that identity, so what failed is the attempt to resolve the reference to it:
    resolve: resolve entity "server-recipe:1.0.0": catalog: tier-3 pull server-recipe:1.0.0: recipe reference must be provider-scoped (<provider>/<name>); an empty provider cannot bind to an OCI location: "server-recipe"
```

The refusal leads, with its own category and its own short code, because it names the thing you can act on: the fix is a missing `implements:` in a Recipe, not anything about how a reference is looked up in a registry. The resolution failure is still reported, beneath it, because it is what says why that document was needed at all.

**A refusal leads only when exactly one refused file declares the identity the failing reference names.** The match is on the identity each document declares for itself — its kind, its name, its version, and for a recipe the `spec.capability` that scopes it — so a refused file declaring what the reference asks for is the file that reference would have resolved to. Two consequences follow. A reference stating a version *range* rather than a version names no single document, so it singles out nothing. And a document too malformed for its header to be read declares no identity at all, so it is never named as the cause of anything.

Where no refused file declares that identity, or more than one does, the report is what it would be with no refusal record: the failure leads, and every refusal is listed beneath it for you to weigh. Naming the wrong file as the cause would be worse than naming none, because you would act on it.

```text
[E0105]
  resolve: resolve entity "server-recipe:1.0.0": catalog: tier-3 pull server-recipe:1.0.0: recipe reference must be provider-scoped (<provider>/<name>); an empty provider cannot bind to an OCI location: "server-recipe"
  note: catalog files skipped at load. A refusal outside this Release's closure is tolerated and never fails a build,
  so this failure is explained only by a refusal naming something this Release reaches:
    - Recipe "server-recipe" (catalog/recipes/helm/server.yaml): [CATALOG_ERROR E0215] catalog/recipes/helm/server.yaml: document envelope validation failed (Recipe, at catalog/recipes/helm/server.yaml); 6:1: spec.implements: missing required property: implements. correct the document to match its kind's schema
```

A few things about that second shape are worth knowing, because each answers a question the block would otherwise raise.

**The head names the failure, not a refusal.** The short code at the top is the one the resolution failure raised, because that failure is what leads here — no refused file was singled out, so none of them heads the line. It carries no category beside it because nothing on this path filed the failure under a concern. Each refusal's own head sits on its own entry beneath, which is where you read it.

**Every refusal is listed, not only the one that mattered.** Reaching this shape means the record could not single one out, so the note states the distinction instead of guessing: a refusal outside this Release's closure is tolerated and cannot be what failed, which leaves a refusal naming something the Release reaches as the only entry that explains it. Read the entries against what your Release actually uses.

**Each entry carries its own bracketed head — its own category and its own short code.** This is the one place a short code appears below the head of the diagnostic, and it is not an exception to the continuation rule above but a consequence of it: an entry under `note:` is not the same failure seen from further in, it is a *different* condition raised by a *different* document. Naming its condition is what lets you look the refusal up and fix the file, which is the action the block exists to enable.

**A refused file whose header was too malformed to recover the identity it declares is listed by path alone.** That is the honest reading of a document nothing could peek at, and the path is still enough to open the file.

**Whichever shape you get, the failure keeps its own identity.** The note is added to the failure rather than rendered over it, and leading with a refusal changes only what you read first — so the condition the failure raised stays intact either way: its short code still resolves, and a tool matching on the condition still matches.

**Where the refused document is itself what a command reports, the refusal is stated once.** `aggrega inspect <name>` loads the catalog strictly, so a document the load refuses stops it, and what it prints is that document's refusal as a single diagnostic: the head carrying the refusal's category and short code, the document as its source, and beneath it what is wrong with the document — for a schema violation, the violated keys with their lines and columns, and the advice. The load that raised it passed through the directory it was walking and the step that read the file, and those are not printed as frames of their own, because each would name the same document again without adding a fact. `aggrega serve`, asked what a name refers to where a refused document declares that name, answers with the same refusal in the same words on one line, followed by the note that the file was skipped at load. As above, the refusal's condition stays matchable either way.

**Both shapes reach you wherever that resolution runs.** [`aggrega build`](../cli/aggrega-build.md), [`aggrega pull`](../cli/aggrega-pull.md), [`aggrega validate --release`](../cli/aggrega-validate.md) and [`aggrega inspect --closure`](../cli/aggrega-inspect.md) produce them at a terminal, and an AI assistant connected through [`aggrega mcp`](../cli/aggrega-mcp.md) receives the same account from the `build` and `validate` tools. Which surface you asked from changes nothing about which file you are sent to open, and where a refusal leads, the authoring contract the answer points at is the one for the kind that refused document declares — not the kind of the reference that failed.

## The document-envelope failure class

Every entity document — catalog entities, Aggregates, Manifests, Releases — is validated against its kind's published JSON schema when it is loaded, before typed parsing. A document that violates its envelope (an unknown key, a missing required field, a value of the wrong shape, a banned construct such as Release `values:`) halts loudly with a diagnostic that names the condition first, then the entity kind and the file, then each offending key or shape with the line and column it sits on, and finally what to do about it:

```text
[OPS_ERROR E0215] release.yaml
  document envelope validation failed (Release, at release.yaml); 12:7: spec.boundaries.main.values: against /$defs/boundary: unexpected property: "values". correct the document to match its kind's schema
```

The diagnostic opens with the condition, names the kind and the file, and closes with what to do; each violation between them carries `line:column` alone, since the head has already named the file. Each offending key is reported at **its own** position rather than at the position of the block containing it, so the line and column point at the key you need to change. Where the position's shape comes from a reusable definition in the schema, the diagnostic names that definition after the word `against` — `against /$defs/boundary` above — so it is clear which contract the key was measured against, and the definition does not read as one more step along the key path you wrote. A document with several violations lists each on its own position, in key order, and the report stops after four with a count of the rest.

Two things are worth knowing about where a position points, because both are useful rather than surprising:

- **A missing required key has no position of its own** — it is absent from the document by definition. The violation points at the enclosing key instead, which is where the missing entry belongs. So `spec.capability: missing required property` points at `spec:`, and that is where you add it.
- **A key whose own name contains a dot** — every `component.aggrega.ai/…` label and `features.aggrega.ai/…` annotation — is reported at the block that holds it rather than at the entry itself, since the dots read as steps down into the document. A violation on a label points at `labels:`.

Where a violation names a key that is nowhere in the document — a whole `metadata:` block left out, say — the position is omitted rather than guessed, and the violation reads as the key path and the message alone. A position you would have to distrust is worse than none.

The category follows the authoring surface: `[CATALOG_ERROR]` for catalog entities, `[DEVELOPER_ERROR]` for Aggregates, `[OPS_ERROR]` for Releases and Manifests. The same gate runs at every surface that loads entities — `aggrega build`, `aggrega lint`, `aggrega validate`, and the editor diagnostics `aggrega serve` publishes — so a stray or misspelled key is rejected wherever the document is first read instead of being silently dropped. Each of those surfaces resolves the position the same way, so they point at the same key, and each reads the condition's sentence from the condition itself: the line your editor underlines is the line the terminal names, and the sentence the editor's entry opens with is the sentence the terminal opens with. What the two surfaces do *not* share is the whole message, and that is deliberate — the terminal groups every finding under one header and closes with the advice for the path, while the editor emits one entry per finding, positioned on its own key, repeating neither the file it is already attached to nor advice it would otherwise say once per underline. So the part that converges is the part you recognise the condition by.

## Multi-error chains

When a single compile detects multiple independent violations (most commonly during static analysis, where every selector and `appliesTo` violation is collected before any one halts the build), the errors are joined into a single chain via Go's `errors.Join`. The CLI walks the chain and renders each sub-error independently, separated by a horizontal-rule line:

```text
[DEVELOPER_ERROR E0007] aggregate.yaml at .spec.components.edge.uses.reviewed_upstream.internal
  selector violation ("gateway.example.com/audit-tier=reviewed", declared on socket "reviewed_upstream", not satisfied by the labels of "internal"). Add the labels the selector requires to the target's component type, or wire the socket to a component that already carries them.
---
[DEVELOPER_ERROR E0007] aggregate.yaml at .spec.components.edge2.uses.reviewed_upstream.internal
  selector violation ("gateway.example.com/audit-tier=reviewed", declared on socket "reviewed_upstream", not satisfied by the labels of "internal"). Add the labels the selector requires to the target's component type, or wire the socket to a component that already carries them.
```

The `---` separator is literal — readers and downstream tools can split on it to enumerate the joined errors. Each sub-error is a failure in its own right rather than a detail of its neighbour, so each carries a full head: its own category, and its own short code. Two violations of one rule name the same short code, as above; two violations of different rules name different ones.

## Reading an error end-to-end

For most authoring contexts, the category prefix and the source pointer together identify what to fix:

| Category | Where the fix lives | Example surfaces |
| --- | --- | --- |
| `[DEVELOPER_ERROR]` | Aggregate YAML | Selector / `appliesTo` violations; Aggregate-side `uses` socket mismatch; resolver halts on developer authoring. |
| `[OPS_ERROR]` | Release YAML / Manifest YAML | Boundary path template references unsupported field; `subDirectory` causes path collision; resolver halts on Release authoring; a Manifest mapping or annotation binding is refused. |
| `[CATALOG_ERROR]` | Recipe / FeatureRecipe / Component / Feature / Plugin | Recipe shape rules; FeatureRecipe template references a per-component-only field with `executionScope: boundary`; Workload `featuresSchema` cross-check fails. |
| `[TRANSLATION_ERROR]` | Workload / valuesMapping output / source overlay | Helm probe port resolution; compose service-name collision across boundaries; two compose contributors declaring one top-level volume or config name with conflicting bodies; chart-name mismatch on `helm-chart` umbrella. |
| `[FETCH_ERROR]` | Registry / remote-source acquisition (operational, not authoring) | Artifact not found at the registry; authentication required; network unreachable; cached digest mismatch vs the lockfile. Fix: authenticate, restore connectivity, or `aggrega pull --upgrade --release <release>`. |
| `[POLICY_ERROR]` | Policy plugin (governance rule) | A policy plugin attached at a governance verdict role rejected the assembled build against a rule it enforces. Fix: satisfy the enforced policy or reconsider the attachment. |
| `[TRUST_ERROR]` | Trust configuration, or the artifact's own signature (a concern, not an authoring surface) | An unreadable trust policy or pinned trust root; a keyless policy declaring no trusted identity; a signing policy requiring a signature for the kind being published; a recorded verdict-attachment gate the configuration no longer attaches. Or: a signature that does not verify; an artifact carrying none where one is required; an untrusted signer; a plugin whose recorded trusted identity no longer matches. Fix: correct the configuration or the committed trust record, or decide about the artifact — the short code says which. |

Per-provider context prefixes (`helm: node "<id>": ...`, `compose: node "<id>": ...`) appear inside the message portion of `[TRANSLATION_ERROR]` and `[CATALOG_ERROR]` outputs to localise the failing provider when more than one provider is in play.

## Library-native errors

Errors that originate inside an underlying library (Helm SDK chart-load errors, docker-compose YAML parser errors, file I/O errors from a missing source path) are wrapped with the per-provider context prefix and surface under `[TRANSLATION_ERROR]` or `[CATALOG_ERROR]` depending on whether they fired in synthesis or in catalog-content load. The wrapped library message preserves the original tool's diagnostic verbatim so authors can match it against the tool's own documentation.

## Cross-references

- [`fatal-halts.md`](fatal-halts.md) — per-error catalog of every fatal halt with intended message and how-to-fix.
- [`warnings.md`](warnings.md) — non-fatal advisories the compiler emits.
- [`vocabulary/validation-surface.md`](../vocabulary/validation-surface.md) — the four schema-validation layers and how their error shapes interact.
