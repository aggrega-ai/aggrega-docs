# Sprig Functions and Helpers

The Aggrega template engine wires the [Sprig v3](https://github.com/Masterminds/sprig) function library plus Aggrega's own helpers (`optional` and `capitalizedWords`) into every Go template the renderer evaluates. Authors writing Recipe `valuesMapping:`, FeatureRecipe `injectMapping:`, or any other template surface the renderer evaluates have the full Sprig helper set available alongside Go `text/template` built-ins and the runtime context fields documented in [template-context-contract.md](template-context-contract.md).

🔴 **Read "the renderer evaluates" as the scope it is, because one authoring surface sits outside it.** A structured `source:` coordinate is resolved so the artifact it names can be pinned, and that resolution is not a rendering pass: it registers **Aggrega's own helpers and nothing else**, so a Sprig call there halts the build. The reach is the entity's whole `locals:` block, not only the entries the coordinate reads. Resolving a coordinate fixes what gets pinned rather than producing an artifact, which is why its function set is deliberately narrower — see [`errors/fatal-halts.md`](../errors/fatal-halts.md) "Resolving a `source:` coordinate registers a narrower function set" for the halt and the portable form to use instead.

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

One bound on the presence check, and it comes from the template rather than from the helper: a value template reads an absent key as nothing, which it does by supplying an empty value at each absent key the template names as a dotted path and reads as a value. So a template that reads one key **both** through `optional` and as such a path finds that key present and empty, and gets the empty value rather than the fallback. Read a key one way per template and the two answers agree.

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

**Per-surface availability.** `optional` is registered on every surface the renderer evaluates: the value-template surfaces (Recipe `valuesMapping`, FeatureRecipe `injectMapping`, `provides`, `pipeline.with`, the Workload body), the assertion evaluator, and path templates (`directory:` / `subDirectory:` on Release boundaries). What differs on the path-template surface is not the helper set but the missing-key policy: a path template treats an absent key as an error rather than as empty, because a silently empty path segment produces a broken filesystem layout that is only discovered after the build. `optional` reads a key without that strict policy firing first, which is what makes it usable there.

### `capitalizedWords` — fold a name into letters and digits

`capitalizedWords <string>` reads its argument as words separated by runs of anything outside ASCII letters and digits, capitalises each word's first letter, and joins them. Every character of the result is a letter or a digit.

It exists because some targets accept only letters and digits in the names they address resources by, while a component id may legitimately carry a dot, a hyphen or an underscore. Writing that conversion by hand in each Recipe that needs it produces several spellings of one idea; a single helper gives every author the same answer.

```yaml
# separators become word boundaries
{{ capitalizedWords `payments-db` }}          # → PaymentsDb
{{ capitalizedWords `payments_db` }}          # → PaymentsDb
{{ capitalizedWords `payments.db` }}          # → PaymentsDb

# a run of separators is one boundary, and leading or trailing ones add nothing
{{ capitalizedWords `-payments--db-` }}       # → PaymentsDb

# characters already inside a word keep the case they were authored with
{{ capitalizedWords `MY-app` }}               # → MYApp

# a word beginning with a digit is carried as authored
{{ capitalizedWords `1st-app` }}              # → 1stApp

# anything outside the alphabet is a boundary, including a non-ASCII letter
{{ capitalizedWords `café-app` }}             # → CafApp
```

🔴 **The result does not identify the name it came from.** Every separator is dropped, so two ids differing only in where their separators sit reach the same result — `payments-db` and `payments_db` both give `PaymentsDb`. The helper cannot detect that, because it sees one name at a time; catching it belongs to whatever addresses resources by the result. A target that does so refuses the collision rather than emitting a deployment with one of the two missing: building for CloudFormation, two components whose ids fold onto one name halt the build, and the message names every id that reached it. Choose ids that differ in more than punctuation, and the question does not arise.

**Per-surface availability.** `capitalizedWords` is registered wherever `optional` is: every surface the renderer evaluates, and the resolution of a structured `source:` coordinate. It is not available in Aggregate parameter interpolation, which offers the Sprig set alone.

## Common helpers NOT available

Helm extends Go's `text/template` with chart-template helpers that are commonly mistaken for general Sprig helpers. **None of these are registered in Aggrega's renderer.** Templates that the Aggrega renderer evaluates (Recipe `valuesMapping:`, FeatureRecipe `injectMapping:`, `provides`, Workload body, the assertion evaluator) cannot call them:

- **`include`** — Helm's preferred form for invoking a defined template fragment with a pipeable string output. Aggrega's renderer does not register it. Use standard Go template's `{{ template "name" . }}` instead (the side-effect-only form); for pipeable output, compose using MappingLibrary fragments and `$import:` directives.
- **`tpl`** — re-evaluates a string as a nested template against the current context. Aggrega does not register it; nested re-evaluation is not part of the template surface. Authors needing computed values should compose them with Sprig's string helpers and emit the final value directly.
- **`required`** — fails the chart-render with a custom message when the named value is missing. Aggrega does not register it. Aggrega's required-field enforcement lives at the typed-parameter-contract layer (Aggregate `parameters:` slots with `required: true` produce `ErrParameterMissing` there, with file:line provenance); per-template required-marker checks use Sprig's `fail` to raise a fatal template error carrying the supplied string.
- **`warn`** — emits a non-fatal note to the operator's terminal. Aggrega does not register it. Templates that need to halt the render with an explanatory message should use Sprig's `fail`; templates that need to fall back without halting should rely on standard Go `if`/`else` branches.

### Cross-engine helper inventory (load-bearing for MappingLibrary authors)

MappingLibrary fragments can target either of two consumption sites:

- **Aggrega-side consumption** (Recipe `valuesMapping:`, FeatureRecipe `injectMapping:`, etc., evaluated by Aggrega's renderer). The available helpers are: full Sprig v3 (`default`, `coalesce`, `quote`, `nindent`, `indent`, `b64enc`, etc.) **plus** Aggrega's own (`optional`, `capitalizedWords`). The chart-template helpers (`include`, `tpl`, `required`, `warn`) are NOT available.
- **Helm chart-internal consumption** (chart `values.yaml` content or chart `templates/*.yaml` rendered downstream by Helm's own template engine). The available helpers are: full Sprig v3 **plus** Helm's chart-template helpers (`include`, `tpl`, `required`, `warn`). Aggrega's own helpers are NOT available.

The two helper sets share the Sprig surface but diverge on the engine-specific extensions. MappingLibrary entries that target Helm chart-internal consumption use Helm conventions (`.Values.<key>` capital-V root, `| default`, `include`-based composition); entries that target Aggrega-side consumption use Aggrega conventions (lowercase `.values.<key>`, `optional` for presence-aware fallback). The library entity stores fragments verbatim; the authoring shape follows where the fragment is meant to render.

Aggrega's custom helpers on top of Sprig are `optional` and `capitalizedWords`, both documented above. The remainder of the helper surface is exactly what `sprig.FuncMap()` exposes.

## Cross-references

- [`template-context-contract.md`](template-context-contract.md) — the runtime fields templates read alongside Sprig helpers.
- [`expansion-matrix.md`](expansion-matrix.md) — per-template-site evaluation order.
- [`05-templates.md`](../05-templates.md) — templating overview and authoring conventions.
- [Sprig v3 documentation](https://masterminds.github.io/sprig/) — canonical per-function reference.
