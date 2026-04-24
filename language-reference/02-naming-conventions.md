# Naming Conventions

This chapter covers the naming and casing rules that apply to authored Aggrega content: the pattern for user-authored instance names, the casing discipline for field names in the DSL, and the comment syntax that depends on the surrounding language (YAML vs CUE).

## Instance Names

User-authored instance names — the keys the developer writes for components, features, secrets, aggregates, subsystems, boundaries, `uses` sockets and aliases, and Manifest provider sections — all match a single pattern: `^[a-zA-Z0-9_-]+$`. Both **kebab-case** (`pii-filter`, `my-agent`) and **snake_case** (`openai_key`, `db_credentials`) are valid; teams may adopt whichever convention they prefer.

**Allowed characters:** alphanumeric (`a-z`, `A-Z`, `0-9`), hyphens (`-`), and underscores (`_`). No other characters are permitted.

**Examples:**

```yaml
components:
  web-server:        # kebab-case
  finance_worker:    # snake_case

features:
  pii-filter:        # kebab-case
  audit_logger:      # snake_case

secrets:
  openai_key:        # snake_case — natural for credentials
  db-password:       # kebab-case — also valid
```

| Pattern            | Scope                            | Examples                                 |
|--------------------|----------------------------------|------------------------------------------|
| `^[a-zA-Z0-9_-]+$` | All user-authored instance names | `web-server`, `openai_key`, `pii-filter` |

The pattern is enforced at Step 1 via JSON Schema `patternProperties`.

## The Dot as a Reserved Path Separator

The period character (`.`) is reserved from all user-authored instance names. The dot serves the structural purpose of a compiler-generated path separator for cross-aggregate component references.

When a root Aggregate imports a sub-aggregate named `data-layer` containing a component named `main-db`, the compiler constructs the flattened absolute ID `data-layer.main-db` by joining the aggregate instance name and the component instance name with a dot. This dotted path appears in:

* **Developer `uses` targets:** `target: data-layer.public_db` — referencing an exported component from a nested aggregate.
* **Recipe template context:** `{{ .context.instance_id }}` receives the full dotted path as the Recipe's identity string when rendering artifacts for the component.

Socket names in a developer's `uses` block must match a key in the catalog entity's `usesSchema`. A `uses` socket with no matching `usesSchema` key fails with an unknown-uses-socket validation error at Step 1. A catalog entity with no `usesSchema` at all cannot have instances that declare `uses`.

## Field Casing

The DSL separates developer-facing YAML (authored by humans) from internal compiler contracts (consumed by templates and tooling):

* **Developer-facing YAML (camelCase):** Multi-word field names in Aggregate, Release, Component, Feature, Recipe, FeatureRecipe, Manifest, and Provider schemas use camelCase. Examples: `exportedComponents`, `syncWaves`, `subDirectory`, `parametersFrom`, `secretsSchema`, `requiredFeatures`, `usesSchema`, `cueSchema`, `valuesMapping`, `injectMapping`, `appliesTo`, `appliesToExpressions`, `matchLabels`, `conflictsWith`, `componentRefPath`. Follows Kubernetes API conventions.
* **Internal contracts (snake_case):** Multi-word field names in the IR Graph schema and the Template Context schema use snake_case. User-facing examples Recipe authors encounter: `instance_id` (in `.context.instance_id` — the Recipe's identity), `inject_raw` (in `.context.inject_raw` — the unmutated injection contract), `secret_name` (in credential FeatureRecipe context — identifies which declared secret slot the FeatureRecipe is processing). Follows JSON API conventions and aligns with Go's JSON struct tag generation.
* **Single-word fields:** Lowercase regardless of context. Examples: `values`, `infra`, `inject`, `provides`, `locals`, `features`, `secrets`, `labels`, `annotations`, `boundaries`, `components`, `subsystems`, `pipeline`, `source`.

Developers do not encounter snake_case in their authored YAML, and template authors do not encounter camelCase in their Go templates. Schema additions follow these conventions.

## Comment Syntax

Comment characters depend on the surrounding language:

* **YAML context** (outside `cueSchema: |` blocks): use `#`
* **CUE context** (inside `cueSchema: |` blocks, standalone `.cue` files): use `//`

CUE's parser rejects `#` as a comment character; YAML's parser rejects `//`. A `cueSchema: |` block is CUE code embedded in a YAML literal scalar — the inner content follows CUE conventions.
