# Sprig Functions and Helpers

The Aggrega template engine wires the [Sprig v3](https://github.com/Masterminds/sprig) function library plus one Aggrega-specific helper (`optional`) into every Go template the renderer evaluates. Authors writing Recipe `valuesMapping:`, FeatureRecipe `injectMapping:`, or any other template surface have the full Sprig helper set available alongside Go `text/template` built-ins and the runtime context fields documented in [template-context-contract.md](template-context-contract.md).

The Sprig surface is registered through `sprig.FuncMap()` at the parameter-interpolation pass and through Aggrega's own helper bundle (which embeds the Sprig set) at the renderer's value-template surfaces. The version pin lives in `aggrega-cli/go.mod`.

## What is wired

`sprig.FuncMap()` exposes the full Sprig helper surface — roughly 200 functions across the categories below. This page sketches the categories with the common helpers in each; the canonical per-function reference is the upstream Sprig documentation.

- **Strings** — `upper`, `lower`, `title`, `trim`, `trimAll`, `trimPrefix`, `trimSuffix`, `replace`, `contains`, `hasPrefix`, `hasSuffix`, `substr`, `quote`, `squote`, `cat`, `indent`, `nindent`, `repeat`, case helpers (`snakecase`, `camelcase`, `kebabcase`), abbreviation helpers (`abbrev`, `abbrevboth`, `trunc`), checksum helpers (`sha1sum`, `sha256sum`, `sha512sum`, `adler32sum`), `toString`.
- **Lists** — `list`, `tuple`, `first`, `last`, `rest`, `initial`, `append`/`push`, `prepend`, `concat`, `reverse`, `uniq`, `without`, `has`, `slice`, `chunk`, `join`, `splitList`, `split`, `splitn`, `sortAlpha`, `compact`.
- **Dicts** — `dict`, `get`, `set`, `unset`, `hasKey`, `keys`, `values`, `pick`, `omit`, `pluck`, `merge`, `mergeOverwrite`, `dig`, `deepCopy`.
- **Math** — `add`, `sub`, `mul`, `div`, `mod`, `add1`, `min`, `max`, `ceil`, `floor`, `round`, plus the `f`-suffixed decimal variants (`addf`, `subf`, `mulf`, `divf`, `minf`, `maxf`).
- **Conversion** — `int`, `int64`, `float64`, `atoi`, `toString`, `toDecimal`, `seq`, `until`, `untilStep`.
- **Encoding** — `b64enc`, `b64dec`, `b32enc`, `b32dec`, `toJson`, `toPrettyJson`, `toRawJson`, `fromJson`, plus the `must`-prefixed JSON variants that surface decode errors instead of silently zeroing.
- **Type checks** — `typeOf`, `typeIs`, `typeIsLike`, `kindOf`, `kindIs`, `deepEqual`, `empty`.
- **Defaults and flow** — `default`, `coalesce`, `all`, `any`, `ternary`, `fail` (raises a template error with a custom message — the canonical way to abort a render with a guard message).
- **Regex** — `regexMatch`, `regexFind`, `regexFindAll`, `regexReplaceAll`, `regexReplaceAllLiteral`, `regexSplit`, `regexQuoteMeta`, plus the `must`-prefixed strict variants.
- **Paths** — `base`, `dir`, `clean`, `ext`, `isAbs` (Unix-style); `osBase`, `osClean`, `osDir`, `osExt`, `osIsAbs` (OS-aware).
- **SemVer** — `semver`, `semverCompare`.
- **URL** — `urlParse`, `urlJoin`.
- **Dates** — `ago`, `date`, `dateInZone`, `dateModify`, `duration`, `durationRound`, `htmlDate`, `htmlDateInZone`, `now`, `toDate`, `unixEpoch`.

## Determinism caveat

Aggrega guarantees byte-identical output for byte-identical input. A subset of Sprig helpers reads ambient state and breaks that guarantee when invoked from a template. Authors should avoid the following helpers in template surfaces that contribute to rendered artifacts:

- **Wall-clock readers** — `now`, `date`, `dateInZone`, `dateModify`, `htmlDate`, `htmlDateInZone`, `ago` when called without a frozen reference time.
- **Random generators** — `randAlpha`, `randAlphaNum`, `randAscii`, `randNumeric`, `randBytes`, `randInt`, `uuidv4`.
- **Environment readers** — `env`, `expandenv` (read process environment variables, which differ across operator workstations and CI runners).
- **Network resolvers** — `getHostByName`.

These helpers are not blocked by the engine; they are wired by Sprig's default `FuncMap()`. The discipline of avoiding them in render-path templates is upheld by reviewers and by the deterministic-output guarantee that authors and the standard-library catalog rely on.

## Aggrega-specific helpers

### `optional` — presence-aware fallback

`optional <map> <key> <fallback>` returns the value at `<key>` in `<map>` if the key is present, otherwise returns `<fallback>`. Unlike Sprig's `default`, `optional` distinguishes "key absent" from "key present with a zero, empty, or false value."

The signature takes the map and the key as separate arguments because a value piped through Go template's `|` operator has lost access to its parent map. Without the parent map in scope, presence cannot be checked.

```yaml
# Present and non-zero: returns 3
{{ optional .infra `replicas` 1 }}            # .infra.replicas = 3   → 3

# Absent: returns the fallback
{{ optional .infra `replicas` 1 }}            # .infra.replicas unset → 1

# Present but authored zero: returns 0 (the discriminator)
{{ optional .infra `replicas` 1 }}            # .infra.replicas = 0   → 0
```

The last case is the discriminator Sprig's `default` cannot make. `{{ .infra.replicas | default 1 }}` returns `1` whether `replicas` was authored as `0` or omitted — the conflation that prevents legitimate scale-to-zero, no-retries, no-timeout, and false-flag patterns.

**Key-quoting convention: prefer backticks.** Go templates accept both double-quoted (`"replicas"`) and backtick-quoted (`` `replicas` ``) string literals for the key argument; both produce the same string at template-eval time. The catalog and documentation examples uniformly use the **backtick form** because it is YAML-safe in every quoting context. A double-quoted key inside a double-quoted YAML scalar terminates the YAML string mid-template:

```yaml
# BROKEN — the inner " closes the outer YAML string:
service_port: "{{ optional .infra "port" 8080 }}"

# WORKS — backticks are not a YAML escape character:
service_port: "{{ optional .infra `port` 8080 }}"
```

When the template lives inside a YAML block-scalar (`|` form) or as a bare-value scalar, both forms render correctly. When the template is embedded inside a double-quoted YAML scalar (the `field: "{{ ... }}"` field-value-as-template pattern), backticks are required. The single convention (always backticks) avoids the YAML-quoting trap entirely.

**When to prefer `optional` over `default`.** Use `optional` when the field can legitimately be zero, empty, or false and the catalog author needs to distinguish "author didn't set this" from "author set this to a falsy value." Use `default` when the conflation is acceptable (e.g., string fields where empty is invalid; numeric fields where zero is invalid).

**Per-surface availability.** `optional` is registered on the value-template surfaces (Recipe `valuesMapping`, FeatureRecipe `injectMapping`, `provides`, `pipeline.with`, the Workload body) and on the assertion evaluator. Path templates (`directory:` / `subDirectory:` on Release boundaries) exclude `optional` by design — the path-template surface uses strict missing-key handling, and a presence-aware fallback would weaken that discipline.

## Common helpers NOT available

Helm extends Go's `text/template` with chart-template helpers that are commonly mistaken for general Sprig helpers. **None of these are registered in Aggrega's renderer.** Templates that the Aggrega renderer evaluates (Recipe `valuesMapping:`, FeatureRecipe `injectMapping:`, `provides`, Workload body, the assertion evaluator) cannot call them:

- **`include`** — Helm's preferred form for invoking a defined template fragment with a pipeable string output. Aggrega's renderer does not register it. Use standard Go template's `{{ template "name" . }}` instead (the side-effect-only form); for pipeable output, compose using MappingLibrary fragments and `$import:` directives.
- **`tpl`** — re-evaluates a string as a nested template against the current context. Aggrega does not register it; nested re-evaluation is not part of the template surface. Authors needing computed values should compose them with Sprig's string helpers and emit the final value directly.
- **`required`** — fails the chart-render with a custom message when the named value is missing. Aggrega does not register it. Aggrega's required-field enforcement lives at the typed-parameter-contract layer (Aggregate `parameters:` slots with `required: true` produce `ErrParameterMissing` at Step 1a with file:line provenance); per-template required-marker checks use Sprig's `fail` to raise a fatal template error carrying the supplied string.
- **`warn`** — emits a non-fatal note to the operator's terminal. Aggrega does not register it. Templates that need to halt the render with an explanatory message should use Sprig's `fail`; templates that need to fall back without halting should rely on standard Go `if`/`else` branches.

### Cross-engine helper inventory (load-bearing for MappingLibrary authors)

MappingLibrary fragments can target either of two consumption sites:

- **Aggrega-side consumption** (Recipe `valuesMapping:`, FeatureRecipe `injectMapping:`, etc., evaluated by Aggrega's renderer). The available helpers are: full Sprig v3 (`default`, `coalesce`, `quote`, `nindent`, `indent`, `b64enc`, etc.) **plus** `optional` (Aggrega-specific). The chart-template helpers (`include`, `tpl`, `required`, `warn`) are NOT available.
- **Helm chart-internal consumption** (chart `values.yaml` content or chart `templates/*.yaml` rendered downstream by Helm's own template engine). The available helpers are: full Sprig v3 **plus** Helm's chart-template helpers (`include`, `tpl`, `required`, `warn`). `optional` (Aggrega-specific) is NOT available.

The two helper sets share the Sprig surface but diverge on the engine-specific extensions. MappingLibrary entries that target Helm chart-internal consumption use Helm conventions (`.Values.<key>` capital-V root, `| default`, `include`-based composition); entries that target Aggrega-side consumption use Aggrega conventions (lowercase `.values.<key>`, `optional` for presence-aware fallback). The library entity stores fragments verbatim; the authoring shape follows where the fragment is meant to render.

Aggrega's only custom helper on top of Sprig is `optional` (documented above). The remainder of the helper surface is exactly what `sprig.FuncMap()` exposes.

## Cross-references

- [`template-context-contract.md`](template-context-contract.md) — the runtime fields templates read alongside Sprig helpers.
- [`expansion-matrix.md`](expansion-matrix.md) — per-template-site evaluation order.
- [`05-templates.md`](../05-templates.md) — templating overview and authoring conventions.
- [Sprig v3 documentation](https://masterminds.github.io/sprig/) — canonical per-function reference.
