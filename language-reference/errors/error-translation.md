# Error translation discipline

Aggrega's compilation pipeline emits errors from many surfaces — schema validators, the resolver, the IR builder, the providers, the Go template engine, and the underlying YAML / Helm / docker-compose libraries the providers wrap. Errors that bubble to the CLI open with a bracketed head naming two things — one of six categories, which says which surface is at fault, and the short code of the condition that halted the build — followed by a source pointer and a message. This page documents the shape of that output so authors interpret error messages directly.

For the per-error catalog (every fatal halt with how-to-fix guidance), see [`fatal-halts.md`](fatal-halts.md). For the four schema-validation layers and how their error shapes interact, see [`vocabulary/validation-surface.md`](../vocabulary/validation-surface.md).

## The six error categories

Every CLI-bubbling error carries one of six category tags. The tag identifies the surface where the fix lives:

- **`[DEVELOPER_ERROR]`** — the failure attaches to Aggregate authoring. The fix is in the Aggregate YAML or in the developer-authored portion of the catalog (Component values, `uses` sockets, Feature attachments). Example surfaces: resolver halts on Aggregate-side issues; analyzer selector and `appliesTo` violations.
- **`[OPS_ERROR]`** — the failure attaches to Release authoring. The fix is in the Release YAML (boundary topology, parameter values, Feature attachments at the Release level). Example surfaces: Release schema validation; boundary-path template evaluation; `subDirectory` collisions across providers.
- **`[CATALOG_ERROR]`** — the failure attaches to a catalog entity (Recipe, FeatureRecipe, Component, Feature, Plugin, Manifest). The fix is in the catalog content. Example surfaces: Recipe shape rules; Workload `featuresSchema` cross-checks; template parse errors in catalog-authored templates.
- **`[TRANSLATION_ERROR]`** — the failure attaches to provider-side synthesis (the helm, helm-chart, or compose provider attempting to translate a Workload, valuesMapping output, or sourced overlay into provider-native artifacts). The fix is typically in the Workload's `services` / `containers` / `volumes` shape, the Recipe's `valuesMapping` template output, or the source-mode overlay structure.
- **`[FETCH_ERROR]`** — the failure attaches to fetching a pinned dependency from a registry or remote source, not to any authoring surface. The fix is usually operational: authenticate to the registry (`docker login <registry>`), restore connectivity, or re-pin a drifted or tampered artifact (`aggrega pull --upgrade --release <release>`). Example surfaces: a catalog entity or chart not found at the registry; authentication required or failed; the network unreachable; a cached artifact's digest not matching the lockfile. Fetch errors carry a concrete remediation pointer in the message.
- **`[POLICY_ERROR]`** — the build was rejected by a policy plugin attached at a governance verdict role. This is not an authoring-surface fault: the input is well-formed, but it fails a governance rule (compliance, FinOps, or security) the plugin enforces. The fix is to bring the deployment into compliance with the enforced policy, or to reconsider the policy attachment. The message names the rejecting plugin and carries the rule message it supplied.

## Output shape

A printed diagnostic opens with the bracketed head and the source pointer, and puts the message on its own indented line:

```text
[CATEGORY SHORTCODE] <source>
  <message>
```

The head carries two tokens, and they answer different questions. The category is one of the six above and says where the fix lives. The short code is the letter `E` and four digits, and it names the exact condition that halted the build: quote it in a report, type it into a search, or resolve it against the table of every condition in [`sentinels.md`](sentinels.md). Neither is derivable from the other, which is why both are printed.

A failure that names no condition of Aggrega's own prints the category alone. Nothing stands in for the absent token.

The same error reduced to one line, the form suitable for log output rather than for a terminal, carries the category and drops the short code:

```text
[CATEGORY] <source>: <message>
```

The source is a structured pointer — typically `<file>:<line>:<column>` when a YAML position is available, or a logical identifier (the catalog entity name, the Release name, the boundary path) when no file position applies. A third shape, `<file> at <key>`, appears when the pointer knows both the document and the authoring key inside it but no byte position: the file is what you open, and the key is what to look at once open. The message is the per-surface diagnostic.

A rule evaluated over the finished graph reports in that third shape, and the key is what tells two findings apart when the message alone cannot. A rule of this kind names the *declaring* component type rather than the instance, so two components of one type failing the same rule carry the same message about the same file:

```text
[DEVELOPER_ERROR E0162] aggregate.yaml at .spec.components.checkout
  missing required feature: attach a Feature of the required type to the component ("core/compute/api-server", "core/observability/monitoring", "monitoring")
---
[DEVELOPER_ERROR E0162] aggregate.yaml at .spec.components.inventory
  missing required feature: attach a Feature of the required type to the component ("core/compute/api-server", "core/observability/monitoring", "monitoring")
```

The key is the only part that differs, and it is what names which of the two components to edit. Both findings carry the same short code because both are the same condition, met twice — the short code names the rule, and the key names the occurrence.

Two further lines belong to the shape, for a failure that carries the context to fill them — the template expression that failed, and a snapshot of the pillars in scope where it failed:

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

**Only the head carries a short code, and the continuations carry their category alone.** The condition is named once, at the point the reader meets the failure; the frames beneath a `caused by:` marker are that same failure seen from further in, so repeating its identifier on each would add lines without adding facts. The code the head prints is the one the chain names — here the rule at the very bottom — so a phase-context frame at the top still identifies the condition underneath it.

Reading top-down: the phase that failed, then the entity (with its file path) that caused it, then the rule it violated. A nested frame that adds nothing beyond its parent (same category, same source, a message the parent already contains) is deduplicated rather than repeated, and a terminal explanation renders only when the frames above it don't already carry its text.

When the failure forks beneath a frame — a phase that collected several independent violations before halting — the continuation carries a count, and every collected failure renders beneath it, separated by the same `---` rule the multi-error chains below use:

```text
[CATALOG_ERROR E0099]
  recipe resolution
  caused by (2):
    no recipe resolved for component/feature instance: add an explicit Manifest mapping for its type: component "edge" (type "example/gateway/nginx-reviewed"); no recipe implements this type
  ---
    no recipe resolved for component/feature instance: add an explicit Manifest mapping for its type: component "internal" (type "example/gateway/nginx-reviewed"); no recipe implements this type
```

The collected failures beneath the count are continuations too, so none of them repeats the head's short code — which is what keeps a fork of a dozen violations from printing the same identifier a dozen times.

One separator grammar applies throughout: `---` between sibling failures, `caused by:` between nested context frames.

## The document-envelope failure class

Every entity document — catalog entities, Aggregates, Manifests, Releases — is validated against its kind's published JSON schema when it is loaded, before typed parsing. A document that violates its envelope (an unknown key, a missing required field, a value of the wrong shape, a banned construct such as Release `values:`) halts loudly with a diagnostic that names the condition first, then the entity kind and the file, then each offending key or shape with the line and column it sits on, and finally what to do about it:

```text
[OPS_ERROR E0215] release.yaml
  Release: document envelope validation failed (Release, at release.yaml); 12:7: spec.boundaries.main.values: /$defs/boundary: unexpected property: "values". correct the document to match its kind's schema
```

The diagnostic opens with the condition, names the kind and the file, and closes with what to do; each violation between them carries `line:column` alone, since the head has already named the file. Each offending key is reported at **its own** position rather than at the position of the block containing it, so the line and column point at the key you need to change. Where the position's shape comes from a reusable definition in the schema, the diagnostic names that definition — `/$defs/boundary` above — so it is clear which contract the key was measured against. A document with several violations lists each on its own position, in key order, and the report stops after four with a count of the rest.

Two things are worth knowing about where a position points, because both are useful rather than surprising:

- **A missing required key has no position of its own** — it is absent from the document by definition. The violation points at the enclosing key instead, which is where the missing entry belongs. So `spec.capability: missing required property` points at `spec:`, and that is where you add it.
- **A key whose own name contains a dot** — every `component.aggrega.ai/…` label and `features.aggrega.ai/…` annotation — is reported at the block that holds it rather than at the entry itself, since the dots read as steps down into the document. A violation on a label points at `labels:`.

Where a violation names a key that is nowhere in the document — a whole `metadata:` block left out, say — the position is omitted rather than guessed, and the violation reads as the key path and the message alone. A position you would have to distrust is worse than none.

The category follows the authoring surface: `[CATALOG_ERROR]` for catalog entities, `[DEVELOPER_ERROR]` for Aggregates, `[OPS_ERROR]` for Releases and Manifests. The same gate runs at every surface that loads entities — `aggrega build`, `aggrega lint`, `aggrega validate`, and the editor diagnostics `aggrega serve` publishes — so a stray or misspelled key is rejected wherever the document is first read instead of being silently dropped. Each of those surfaces resolves the position the same way, so they point at the same key: the line your editor underlines is the line the terminal names.

## Multi-error chains

When a single compile detects multiple independent violations (most commonly during static analysis, where every selector and `appliesTo` violation is collected before any one halts the build), the errors are joined into a single chain via Go's `errors.Join`. The CLI walks the chain and renders each sub-error independently, separated by a horizontal-rule line:

```text
[DEVELOPER_ERROR E0007] aggregate.yaml at .spec.components.edge.uses.reviewed_upstream.internal
  selector violation ("gateway.example.com/audit-tier=reviewed", "internal")
---
[DEVELOPER_ERROR E0007] aggregate.yaml at .spec.components.edge2.uses.reviewed_upstream.internal
  selector violation ("gateway.example.com/audit-tier=reviewed", "internal")
```

The `---` separator is literal — readers and downstream tools can split on it to enumerate the joined errors. Each sub-error is a failure in its own right rather than a detail of its neighbour, so each carries a full head: its own category, and its own short code. Two violations of one rule name the same short code, as above; two violations of different rules name different ones.

## Reading an error end-to-end

For most authoring contexts, the category prefix and the source pointer together identify what to fix:

| Category | Where the fix lives | Example surfaces |
| --- | --- | --- |
| `[DEVELOPER_ERROR]` | Aggregate YAML | Selector / `appliesTo` violations; Aggregate-side `uses` socket mismatch; resolver halts on developer authoring. |
| `[OPS_ERROR]` | Release YAML | Boundary path template references unsupported field; `subDirectory` causes path collision; resolver halts on Release authoring. |
| `[CATALOG_ERROR]` | Recipe / FeatureRecipe / Component / Feature / Manifest | Recipe shape rules; FeatureRecipe template references a per-component-only field with `executionScope: boundary`; Workload `featuresSchema` cross-check fails. |
| `[TRANSLATION_ERROR]` | Workload / valuesMapping output / source overlay | Helm probe port resolution; compose service-name collision across boundaries; chart-name mismatch on `helm-chart` umbrella. |
| `[FETCH_ERROR]` | Registry / remote-source acquisition (operational, not authoring) | Artifact not found at the registry; authentication required; network unreachable; cached digest mismatch vs the lockfile. Fix: authenticate, restore connectivity, or `aggrega pull --upgrade --release <release>`. |
| `[POLICY_ERROR]` | Policy plugin (governance rule) | A policy plugin attached at a governance verdict role rejected the assembled build against a rule it enforces. Fix: satisfy the enforced policy or reconsider the attachment. |

Per-provider context prefixes (`helm: node "<id>": ...`, `compose: node "<id>": ...`) appear inside the message portion of `[TRANSLATION_ERROR]` and `[CATALOG_ERROR]` outputs to localise the failing provider when more than one provider is in play.

## Library-native errors

Errors that originate inside an underlying library (Helm SDK chart-load errors, docker-compose YAML parser errors, file I/O errors from a missing source path) are wrapped with the per-provider context prefix and surface under `[TRANSLATION_ERROR]` or `[CATALOG_ERROR]` depending on whether they fired in synthesis or in catalog-content load. The wrapped library message preserves the original tool's diagnostic verbatim so authors can match it against the tool's own documentation.

## Cross-references

- [`fatal-halts.md`](fatal-halts.md) — per-error catalog of every fatal halt with intended message and how-to-fix.
- [`warnings.md`](warnings.md) — non-fatal advisories the compiler emits.
- [`vocabulary/validation-surface.md`](../vocabulary/validation-surface.md) — the four schema-validation layers and how their error shapes interact.
