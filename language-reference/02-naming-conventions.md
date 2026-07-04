# Naming Conventions

This chapter covers the naming and casing rules that apply to authored Aggrega content: the pattern for user-authored instance names, the casing discipline for field names in the DSL, and the comment syntax used at the YAML authoring surface.

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

* **Developer-facing YAML (camelCase):** Multi-word field names in Aggregate, Release, Component, Feature, Recipe, FeatureRecipe, Manifest, and Plugin schemas use camelCase. Examples: `exportedComponents`, `syncWave`, `subDirectory`, `secretsSchema`, `requiredFeatures`, `usesSchema`, `valuesMapping`, `injectMapping`, `executionScope`, `appliesTo`, `appliesToAnyOf`, `conflictsWith`, `componentRefPath`. Follows Kubernetes API conventions.
* **Internal contracts (snake_case):** Multi-word field names in the IR Graph schema and the Template Context schema use snake_case. User-facing examples Recipe authors encounter: `instance_id` (in `.context.instance_id` — the Recipe's identity), `inject_raw` (in `.context.inject_raw` — the unmutated injection contract), `secret_name` (in credential FeatureRecipe context — identifies which declared secret slot the FeatureRecipe is processing). Follows JSON API conventions and aligns with Go's JSON struct tag generation.
* **Single-word fields:** Lowercase regardless of context. Examples: `values`, `infra`, `inject`, `provides`, `locals`, `features`, `secrets`, `labels`, `annotations`, `boundaries`, `components`, `subsystems`, `pipeline`, `source`.

Developers do not encounter snake_case in their authored YAML, and template authors do not encounter camelCase in their Go templates. Schema additions follow these conventions.

### Three casings crossing in one statement

Recipe authoring routinely crosses all three casing conventions in a single statement: the schema-defined DSL field uses **camelCase**, the user-authored instance name uses **kebab-case** or **snake_case**, and the template-context reference uses **snake_case**. Authors who notice the crossings as separate conventions read the resulting YAML cleanly; authors who try to rationalise the casings as one convention struggle with the boundaries.

The canonical worked example: a Recipe's `valuesMapping:` template referencing the rendered Component instance via the template context.

```yaml
# Recipe authored against a Component the developer instantiated as "web-server"
# (kebab-case instance name) in their Aggregate.
spec:
  valuesMapping: |        # camelCase — schema-defined DSL field
    name: "{{ .context.instance_id }}"   # snake_case — template context
                                         #   internal contract
    image: "{{ .values.image }}"         # snake_case — template context
                                         #   internal contract
```

Three casings, one statement:

* `valuesMapping` — **camelCase**. The DSL field name the schema defines for the Recipe's mapping template. Camel because the language's developer-facing YAML follows Kubernetes API conventions.
* `web-server` (referenced indirectly via the rendered component) — **kebab-case**. The user-authored instance name in the Aggregate; the developer chose the hyphenated form. Could equally be `web_server` (snake_case); both are valid per the instance-name pattern.
* `instance_id`, `image` — **snake_case**. Field names inside the template context (`.context.instance_id`, `.values.image`). Snake because the IR Graph and template context follow JSON-API conventions and align with Go's JSON struct tag generation.

The three casings are not interchangeable. A Recipe author who writes `{{ .context.instanceId }}` (camelCase) gets a missing-template-key error because the template context uses snake_case; a developer who writes `web.server` (with a dot) hits the instance-name pattern rejection because the dot is reserved as the path separator. The discipline target: hold the three conventions in mind when reading or authoring; rely on the boundaries (where you are in the YAML or template) to know which casing applies.

## Document-path naming-suffix discipline

A subset of fields across the language carry document-path values — strings that point at a position inside another document (a rendered Workload's volumes section, a Component's secretsSchema entry, a Manifest's mappings tier). The values follow [RFC 6901 JSON Pointer](https://datatracker.ietf.org/doc/html/rfc6901) syntax — slash-separated tokens identifying the path through the target document.

**RFC 6901 is the path-grammar baseline for every document-path surface in Aggrega.** The Wasm plugin contract consumes RFC 6901 patches (per [`plugins/plugin-contract.md`](plugins/plugin-contract.md) `mutator.wasm` JSONPatch output); the URI grammar's format-string inventory names RFC 6901 alongside Go template syntax and Sprig helpers (per [`vocabulary/uri-grammar.md`](vocabulary/uri-grammar.md) "Format-string inventory"); the per-Recipe `.locals` exports use RFC 6901 to point at synthesised-Workload positions Wasm Injector plugins read at Phase C. One grammar, multiple consuming surfaces.

**The naming-suffix discipline** distinguishes the two authoring sides of these path values via a deliberate suffix split aligned with the broader Field Casing section above:

* **Schema fields** carrying RFC 6901 JSON Pointers use **camelCase `*Path`** suffix. The fields are part of the developer-facing YAML schema, so they follow the camelCase convention. Examples:
  * `componentRefPath` — a schema-defined field referencing a target component's path inside the IR Graph.
  * `targetPath` — a schema-defined field naming the path the Wasm Injector should patch.
* **`.locals` export keys** carrying RFC 6901 JSON Pointers use **snake_case `*_path`** suffix. The keys are part of the Recipe's internal export surface (consumed by Wasm plugin pipelines reading `.context.uses[].locals` or by the Recipe's own subsequent templates), so they follow the snake_case convention. Examples:
  * `volumes_path` — `.locals.volumes_path: "/spec/template/spec/volumes"` exposing the synthesised Workload's volumes-array position.
  * `containers_path` — `.locals.containers_path: "/spec/template/spec/containers"` exposing the containers-array position.
  * `resource_path` — `.locals.resource_path: "/resource/aws_s3_bucket/main"` exposing a Terraform-native resource path.
  * `root_path` — `.locals.root_path: "/data"` exposing the root path the renderer's pipe consumes.

The two suffix conventions reflect the Field Casing section's two-tier convention: schema-defined fields use camelCase; user-authored or Recipe-private identifiers use snake_case (or kebab-case). The `*Path` / `*_path` suffix discipline makes the path-grammar nature of the value visible at the identifier level — readers seeing either suffix know the value follows RFC 6901 syntax without having to inspect the value itself.

**Worked example: a Wasm Injector consuming a Recipe's `*_path` exports.**

```yaml
# Recipe (Domain 3) — declares .locals exports the Wasm Injector consumes
spec:
  locals:
    primary_compute: "worker-container"
    containers_path: "/spec/template/spec/containers"
    volumes_path: "/spec/template/spec/volumes"
```

```yaml
# Credential FeatureRecipe (Domain 3) — declares an Injector pipeline step
# that reads the Recipe's .locals via .context.uses[].locals
spec:
  pipeline:
    - id: workload_injector
      plugin: mutator/k8s-workload-injector:2.0.0
      function: inject_secret
      with: |
        target_container: "{{ .context.uses[0].locals.primary_compute }}"
        containers_path: "{{ .context.uses[0].locals.containers_path }}"
        volumes_path: "{{ .context.uses[0].locals.volumes_path }}"
```

The `*_path` keys are Recipe-private exports; the `containers_path` / `volumes_path` values are RFC 6901 JSON Pointer strings. The Injector plugin consumes the strings to position its JSONPatch output against the rendered Workload's AST.

For the broader format-string inventory (Go template syntax, Sprig functions, JSON Pointer alongside SemVer regex and label selector grammar), see [`vocabulary/uri-grammar.md`](vocabulary/uri-grammar.md) "Format-string inventory". For the Wasm plugin contract surface that consumes RFC 6901 patches, see [`plugins/plugin-contract.md`](plugins/plugin-contract.md).

## Comment Syntax

Comment characters depend on the surrounding language:

* **YAML context** (the default authoring surface for every Aggrega entity): use `#`
* **Go template context** (inside Recipe `valuesMapping:` block scalars, FeatureRecipe `injectMapping:` block scalars, SchemaLibrary `$templates:` bodies, MappingLibrary mapping entries, assertion-block `assertions:` bodies): use `{{/* ... */}}` for template comments that the template engine recognises and strips at render time, or `#` for YAML-level comments outside the template body.

Compact-form schemas under `schema:`, `usesSchema:`, `secretsSchema:`, and `parameters:` are YAML throughout; the per-field `description:` annotation is the documented surface for inline field documentation (`port: { type: integer, description: "TCP listen port" }`).
