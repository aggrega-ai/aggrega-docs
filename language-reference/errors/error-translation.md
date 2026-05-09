# Error translation discipline

Aggrega's compilation pipeline emits errors from many surfaces — schema validators, the resolver, the IR builder, the per-provider engines, the Go template engine, and the underlying YAML / Helm / docker-compose libraries the engines wrap. Errors that bubble to the CLI are tagged with one of four category prefixes that name the authoring surface at fault, paired with a source pointer and message. This page documents the shape of that output so authors interpret error messages directly.

For the per-error catalog (every fatal halt with how-to-fix guidance), see [`fatal-halts.md`](fatal-halts.md). For the four schema-validation layers and how their error shapes interact, see [`vocabulary/validation-surface.md`](../vocabulary/validation-surface.md).

## The four error categories

Every CLI-bubbling error carries one of four category tags. The tag identifies the authoring surface where the fix lives:

- **`[DEVELOPER_ERROR]`** — the failure attaches to Aggregate authoring. The fix is in the Aggregate YAML or in the developer-authored portion of the catalog (Component values, `uses` sockets, Feature attachments). Example surfaces: resolver halts on Aggregate-side issues; analyzer selector and `appliesTo` violations.
- **`[OPS_ERROR]`** — the failure attaches to Release authoring. The fix is in the Release YAML (boundary topology, parameter values, Feature attachments at the Release level). Example surfaces: Release schema validation; boundary-path template evaluation; `subDirectory` collisions across providers.
- **`[CATALOG_ERROR]`** — the failure attaches to a catalog entity (Recipe, FeatureRecipe, Component, Feature, Provider, Manifest). The fix is in the catalog content. Example surfaces: Recipe shape rules; Workload `secretsSchema` cross-checks; template parse errors in catalog-authored templates.
- **`[TRANSLATION_ERROR]`** — the failure attaches to provider-side synthesis (the helm, helm-chart, compose, terraform, or cloudformation engine attempting to translate a Workload, valuesMapping output, or sourced overlay into provider-native artifacts). The fix is typically in the Workload's `services` / `containers` / `volumes` shape, the Recipe's `valuesMapping` template output, or the source-mode overlay structure.

## Output shape

The single-line representation suitable for log output is:

```text
[CATEGORY] <source>: <message>
```

The source is a structured pointer — typically `<file>:<line>:<column>` when a YAML position is available, or a logical identifier (the catalog entity name, the Release name, the boundary path) when no file position applies. The message is the per-surface diagnostic.

The CLI renders a richer multi-line form when an error carries additional context — the failing template expression, a snapshot of the active pillars at evaluation time:

```text
[CATALOG_ERROR] recipe.yaml:24:7
  injectMapping references undefined field .context.inject.foo
  expression: {{ .context.inject.foo }}
  active pillars:
    .values
    .context.inject
    .infra
```

The `expression:` line carries the template excerpt that triggered the failure. The `active pillars:` block lists the top-level pillar keys available at the point of failure, so authors see what was queryable.

## Multi-error chains

When a single compile detects multiple independent violations (most commonly during static analysis, where every selector and `appliesTo` violation is collected before any one halts the build), the errors are joined into a single chain via Go's `errors.Join`. The CLI walks the chain and renders each sub-error independently, separated by a horizontal-rule line:

```text
[DEVELOPER_ERROR] aggregate.yaml:12:5
  selector "tier=backend" matches no component declared in the Aggregate

---

[DEVELOPER_ERROR] aggregate.yaml:18:5
  appliesTo on Feature "metrics" requires label "exporter=prometheus" which the target component lacks
```

The `---` separator is literal — readers and downstream tools can split on it to enumerate the joined errors. The category prefix appears on each sub-error so each violation carries its own attribution.

## Reading an error end-to-end

For most authoring contexts, the category prefix and the source pointer together identify what to fix:

| Category | Where the fix lives | Example surfaces |
| --- | --- | --- |
| `[DEVELOPER_ERROR]` | Aggregate YAML | Selector / `appliesTo` violations; Aggregate-side `uses` socket mismatch; resolver halts on developer authoring. |
| `[OPS_ERROR]` | Release YAML | Boundary path template references unsupported field; `subDirectory` causes path collision; resolver halts on Release authoring. |
| `[CATALOG_ERROR]` | Recipe / FeatureRecipe / Component / Feature / Manifest | Recipe shape rules; FeatureRecipe template references a per-component-only field with `executionScope: boundary`; Workload `secretsSchema` cross-check fails. |
| `[TRANSLATION_ERROR]` | Workload / valuesMapping output / source overlay | Helm probe port resolution; compose service-name collision across boundaries; chart-name mismatch on `helm-chart` umbrella. |

Per-engine context prefixes (`helm: node "<id>": ...`, `compose: node "<id>": ...`) appear inside the message portion of `[TRANSLATION_ERROR]` and `[CATALOG_ERROR]` outputs to localise the failing engine when more than one provider is in play.

## Library-native errors

Errors that originate inside an underlying library (Helm SDK chart-load errors, docker-compose YAML parser errors, file I/O errors from a missing source path) are wrapped with the per-engine context prefix and surface under `[TRANSLATION_ERROR]` or `[CATALOG_ERROR]` depending on whether they fired in synthesis or in catalog-content load. The wrapped library message preserves the original tool's diagnostic verbatim so authors can match it against the tool's own documentation.

## Cross-references

- [`fatal-halts.md`](fatal-halts.md) — per-error catalog of every fatal halt with intended message and how-to-fix.
- [`warnings.md`](warnings.md) — non-fatal advisories the compiler emits.
- [`vocabulary/validation-surface.md`](../vocabulary/validation-surface.md) — the four schema-validation layers and how their error shapes interact.
