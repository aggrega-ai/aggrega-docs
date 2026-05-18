# Parameters template context

The `parameters:` pillar is a Step-1-only template context: it carries the Release-fulfilled, contract-validated parameter values during the YAML-string interpolation pass that runs before Component / Feature schema validation. Once Step 1 completes, the compiler purges the `.parameters` map from the in-memory context, so downstream pipeline stages (Component / Feature validation, Recipe binding, Phase B rendering) do not see `.parameters` directly — they consume the resolved values that interpolation wrote into the surrounding `values:` strings.

This page documents the Step-1 template context, the per-slot value shapes, the access patterns inside Aggregate YAML strings, and the boundary semantics that separate the parameters context from the downstream Recipe / FeatureRecipe template context. For the broader template context shape that Recipes consume during Phase B (`.values`, `.infra`, `.uses`, etc.), see [template-context-contract.md](template-context-contract.md). For per-template-site availability across the compilation pipeline, see [expansion-matrix.md](expansion-matrix.md). For the typed-parameter contract declaration shape on the Aggregate, see [`entities/aggregate.md`](../entities/aggregate.md) §"Typed parameter contracts".

## When the `.parameters` map exists

The `.parameters` map is available exclusively during Step 1 of the compilation pipeline:

1. **Parameter contract validation** — each Release-supplied value validates against the Aggregate's `spec.parameters.<slot>` declared `type` / `enum` / `min` / `max` / `pattern` / nested-structure constraints. The `.parameters` map exists in the validator's in-memory context as the structured payload being checked.
2. **Default fill** — slots with `default:` defined and no Release-supplied value receive their default. The `.parameters` map is in scope at this point.
3. **Interpolation** — the compiler walks every YAML string in the Aggregate that contains a `{{ .parameters.<slot> }}` reference and replaces it with the resolved value. The `.parameters` map is the template context.
4. **Parameter purge** — once interpolation completes, the `.parameters` map is dropped from the in-memory context. Downstream pipeline stages do not see `.parameters`.

Templates inside Aggregate YAML strings (component `values:`, feature `values:`, sub-aggregate `parameters:` pass-through expressions) read the `.parameters` map via standard Go template syntax. Templates inside Recipe and FeatureRecipe files (which evaluate at Phase B, after the parameter purge) do NOT have access to `.parameters`.

## The `.parameters.<slot>` access pattern

Each declared parameter slot is accessible as a field on the `.parameters` map. Type-correct access matches the declared `type`:

```yaml
# Aggregate fragment — parameter declarations
spec:
  parameters:
    region: { type: string, enum: [us-east-1, us-west-2] }
    cache_ttl_seconds: { type: integer, min: 1, max: 86400, default: 60 }
    enable_debug: { type: boolean, default: false }

  components:
    web:
      type: core/web-server:1.0.0
      values:
        region: "{{ .parameters.region }}"                       # string
        cache_ttl_seconds: "{{ .parameters.cache_ttl_seconds }}" # integer (renders as YAML string; the values-side schema validates type)
        debug: "{{ .parameters.enable_debug }}"                  # boolean
```

The interpolation pass produces a Go template evaluation against the `.parameters` map; the result replaces the template expression inline at the YAML string position. The Component / Feature `values:` schema then validates the resulting value at Step 1 sub-step 3 (post-interpolation schema validation).

## Object-typed and array-typed slot access

Object-typed parameter slots expose their declared properties as nested fields on the `.parameters.<slot>` map. Array-typed slots expose Go template slice semantics (`range`, `index`, `len`).

```yaml
# Aggregate fragment — object-typed parameter
spec:
  parameters:
    database_config:
      type: object
      properties:
        host: { type: string, required: true }
        port: { type: integer, min: 1, max: 65535, default: 5432 }
        ssl_mode: { type: string, enum: [disable, require, verify-full] }

  components:
    api:
      type: core/server/api:1.0.0
      values:
        db_host: "{{ .parameters.database_config.host }}"
        db_port: "{{ .parameters.database_config.port }}"
        db_ssl: "{{ .parameters.database_config.ssl_mode }}"
```

Array-typed parameter slots support iteration via `range`:

```yaml
# Aggregate fragment — array-typed parameter
spec:
  parameters:
    allowed_hosts:
      type: array
      items: { type: string, format: hostname }
      min: 1

  components:
    ingress:
      type: core/ingress:1.0.0
      values:
        # Compose a comma-separated list from the parameter array
        hosts: "{{ range $i, $h := .parameters.allowed_hosts }}{{ if $i }},{{ end }}{{ $h }}{{ end }}"
```

The Sprig template library is available during interpolation, providing helpers like `join` for compact array-to-string conversions:

```yaml
hosts: "{{ join \",\" .parameters.allowed_hosts }}"
```

## Default fill semantics

A parameter slot with a `default:` declaration receives its default value when the Release omits the slot. The default applies before the contract-validation pass runs, so the validation sees the resolved (Release-supplied or default) value:

```yaml
# Aggregate
spec:
  parameters:
    timeout_seconds:
      type: integer
      min: 1
      max: 300
      default: 30

  components:
    api:
      type: core/server/api:1.0.0
      values:
        timeout: "{{ .parameters.timeout_seconds }}"

# Release omits timeout_seconds — interpolation uses default: 30
# Release supplies timeout_seconds: 60 — interpolation uses 60
# Release supplies timeout_seconds: 0 — validation rejects (below min: 1)
# Release supplies timeout_seconds: 500 — validation rejects (above max: 300)
# Release supplies timeout_seconds: "thirty" — validation rejects (type mismatch)
```

Required parameters (slots with no `default:` and no `required: false` opt-out — required is the implicit default) trigger a build-time error when the Release omits them. The error names the slot, the declared type, and the contract location for the author to fix.

### Nested-object parameters

When a parameter declares `type: object` with `properties:` whose children themselves carry `default:` values, three authoring cases produce distinct results. Understanding the distinction matters when the parameter declaration is a structured object — a database configuration, a feature-flag bundle, a timeout-and-retry policy — rather than a single scalar.

**Case 1 — Release omits the parent slot.** The contract's children defaults fill. The Aggregate author who declared the nested defaults gets the behavior they intended: when ops doesn't supply the slot, the configuration uses the documented defaults.

```yaml
# Aggregate
spec:
  parameters:
    database:
      type: object
      properties:
        host: { type: string, default: "localhost" }
        port: { type: integer, default: 5432 }

# Release (parent omitted)
spec:
  parameters: {}

# Resolved at template-interpolation time
parameters:
  database:
    host: "localhost"
    port: 5432
```

**Case 2 — Release authors the parent as an explicit empty map.** The explicit empty is honored as a deliberate opt-out. Children's defaults are NOT filled; the slot remains empty. Use this form when ops wants to suppress the contract's nested defaults without supplying overrides — for example, when a downstream consumer expects the slot present but empty.

```yaml
# Release (parent explicit empty)
spec:
  parameters:
    database: {}

# Resolved at template-interpolation time
parameters:
  database: {}
```

The distinction from Case 1 is deliberate: ops can express both "use the defaults" (by omitting the slot) and "suppress the defaults" (by authoring the slot as `{}`). This mirrors how Aggrega treats explicit null in annotations — an annotation authored as `aggrega.ai/<key>: null` is a deliberate opt-out distinct from omitting the annotation entirely.

**Case 3 — Release partially authors the parent.** Children the Release supplied take their authored values; children the Release did not supply fill from defaults.

```yaml
# Release (partial)
spec:
  parameters:
    database:
      host: "db.prod.example.com"

# Resolved at template-interpolation time
parameters:
  database:
    host: "db.prod.example.com"   # Release-supplied
    port: 5432                    # filled from default
```

This is the common case for Release authors who want to override selected fields while leaving the rest at their contract defaults.

#### When to use each form

- **Omit the slot** when you want the contract's defaults to apply.
- **Author `{}`** when you deliberately want the slot present but empty — when the contract's defaults are wrong for your environment and you don't have overrides.
- **Author partially** when you want some overrides and want the rest to use the contract's defaults.

A Release author who types `database: {}` expecting "give me the defaults" will be surprised — the resolved value is empty, not the filled defaults. To get the defaults, omit the slot entirely.

The three-case dispatch is per-sibling at every nesting depth. A parent authored as `{ connection: {}, other_field: "x" }` produces a resolved tree where `connection` is empty (Case 2 at depth 1) and `other_field` is the Release-supplied value (Case 3 at depth 0) — the cases dispatch independently for each sibling, not as a single decision for the whole subtree.

## Boundary with downstream template contexts

The parameters pillar is **purged** after Step 1. Recipes and FeatureRecipes at Phase B do not see `.parameters`. The template-context fields available to Recipes (`.values`, `.infra`, `.uses`, `.secrets`, `.metadata`, `.context.*`, `.provides`, `.locals`) are documented at [template-context-contract.md](template-context-contract.md).

The boundary semantics:

- A Recipe `valuesMapping:` template that writes `{{ .parameters.X }}` produces a template-execution error at Phase B (`.parameters` is nil at that scope).
- An Aggregate component-`values:` template that writes `{{ .parameters.X }}` resolves correctly at Step 1.
- A FeatureRecipe `provides:` template that writes `{{ .parameters.X }}` produces a template-execution error at Phase B (same reason).

The boundary is load-bearing: the architecture preserves the parameters-as-authoring-time-only invariant by purging the map. Recipes operate on the resolved values dictionary; the `.parameters` map exists exclusively at the Aggregate-authoring scope where interpolation runs.

## Cross-pillar bridging

Parameters interpolate into the surrounding values strings during Step 1. The interpolated values can land in any pillar that the Aggregate authors at its scope: component `values:` strings, feature `values:` strings, sub-aggregate `parameters:` pass-through declarations (where the parent Aggregate's parameter value resolves and then propagates into the child Aggregate's parameter slot), and metadata `name:` / `labels:` strings.

The bridging is one-directional: a parameter value flows from the Release-supplied (or defaulted) `.parameters.<slot>` into the YAML string at the reference site. Parameters do not flow the other direction — a parameter cannot read a `values:` field, a `provides:` field, or any other pillar's content. The directionality is part of the parameter contract's compile-time-only guarantee.

## Cross-pointers

- For the typed-parameter contract declaration shape on the Aggregate: [`entities/aggregate.md`](../entities/aggregate.md) §"Typed parameter contracts".
- For the broader template context that Recipes consume at Phase B (`.values`, `.infra`, `.uses`, `.context.*`, etc.): [template-context-contract.md](template-context-contract.md).
- For per-template-site availability across the compilation pipeline (which fields are present at which evaluation site): [expansion-matrix.md](expansion-matrix.md).
- For the parameter-hoisting checklist (the four sequential authoring touchpoints — Aggregate declaration, values reference, Release fulfilment, Recipe consumption): [`vocabulary/data-pillars.md`](../vocabulary/data-pillars.md) §"The parameter-hoisting checklist".
- For the broader data-pillar set (`values:`, `infra:`, `provides:`, `uses:`, `secrets:`, `locals:`, `parameters:`): [`vocabulary/data-pillars.md`](../vocabulary/data-pillars.md).
