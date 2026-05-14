# Compact-form authoring

The compact form is a YAML-shaped declarative shorthand for JSON Schema 2020-12. Authors write per-field constraints as inline-flow YAML maps (`port: { type: integer, min: 1, max: 65535, default: 8080 }`); intermediate object nodes are natural YAML nesting; references use JSON Schema's standard `$ref:`. The compiler transforms compact form to JSON Schema 2020-12 before any validation runs, so all downstream pipeline stages (validator, merger, error formatter, publishing-discipline classifier, hub UI) operate on the resolved JSON Schema regardless of the authoring path.

This page documents the compact-form vocabulary, the structural conventions, the inferred-vs-explicit object dispatch, the closure semantics, the `type:` heterogeneity that allows arrays of permitted types, the typeIdentity-keyword constraint at every inferred-form scope, and the `x-aggrega-*` extension namespace. For cross-document `$ref:` resolution semantics, see [cross-document-ref.md](cross-document-ref.md). For the assertions-block authoring grammar, see [templates/assertions-block.md](../templates/assertions-block.md). For the data-pillar set (`values:`, `infra:`, `provides:`, `uses:`, `secrets:`, `locals:`, `parameters:`), see [data-pillars.md](data-pillars.md).

The compact form is the default authoring surface for `schema:`, `parameters:`, and SchemaLibrary entries. JSON Schema YAML is a co-equal authoring option; both forms are first-class and may be mixed within a single schema. The two forms compile to the same resolved JSON Schema document; downstream tooling and validation are oblivious to the authoring path.

## Vocabulary

The compact form has about 15 keywords. Authors learn them once and apply them across `schema:`, `parameters:`, and SchemaLibrary entries.

### Type and identity keywords

| Keyword | Meaning | Compiles to JSON Schema |
| --- | --- | --- |
| `type` | Field type (`string`, `integer`, `number`, `boolean`, `object`, `array`, or an array of permitted types) | `type:` |
| `description` | Human-readable documentation | `description:` |
| `default` | Default value when the field is missing | `default:` |
| `required` | Per-leaf marker (`required: true`) for fields that must be present | Adds the field name to the parent's `required:` array |

### Constraint keywords

| Keyword | Meaning | Compiles to JSON Schema |
| --- | --- | --- |
| `enum` | Permitted values (list) | `enum:` |
| `min` | Minimum value (numeric) or minimum length (string/array) | `minimum:` (numeric); `minLength:` (string); `minItems:` (array) — chosen by `type:` |
| `max` | Maximum value or length, parallel to `min` | `maximum:` / `maxLength:` / `maxItems:` |
| `minLength` / `maxLength` | Explicit string-length constraints | Direct map to `minLength:` / `maxLength:` (use when `min`/`max` would be ambiguous) |
| `pattern` | Regex pattern for strings | `pattern:` |
| `format` | Named format (`email`, `ipv4`, `uri`, `password`, etc.) | `format:` |

### Composition and reference keywords

| Keyword | Meaning | Compiles to JSON Schema |
| --- | --- | --- |
| `$ref` | Reference to a JSON Pointer fragment or external SchemaLibrary entry | `$ref:` |
| `allOf` / `anyOf` / `oneOf` | JSON Schema composition | Same keywords |
| `patternProperties` | Regex-keyed map | Same keyword |
| `valuesType` | Shorthand for typed-value maps (e.g., "object whose values are all strings") | `additionalProperties: { type: <X> }` |

### Container keywords

| Keyword | Meaning | Compiles to JSON Schema |
| --- | --- | --- |
| `items` | Array element shape | `items:` (recursive compact form or JSON Schema) |
| `properties` | Explicit children declaration (rarely needed; usually implicit via YAML structure) | `properties:` |
| `additionalProperties` | Whether undeclared properties are allowed (default `false`; opt-in `true`) | `additionalProperties:` |

### Aggrega-specific keywords

| Keyword | Meaning |
| --- | --- |
| `validate` | Per-field Go template predicate returning boolean; false halts validation with `validateMessage:` |
| `validateMessage` | Error message accompanying a `validate:` failure |
| `when` | Conditional subtree application; Go template predicate gating whether the node's constraints apply |
| `$jsonschema` | Escape hatch — embedded full JSON Schema sub-document at this node |
| `$mode` | Optional dispatch annotation for ambiguous cases (rarely needed; see "Inferred vs explicit object form" below) |

The borrowed JSON Schema keywords (`$ref`, `allOf`, `format`, etc.) reuse identical syntax to JSON Schema, so authors who already know JSON Schema recognize them immediately.

## How a compact-form leaf is structured

The unit of authoring is a leaf node — a field with a constraint dict:

```yaml
field_name: { type: <type>, ...constraints... }
```

Common patterns:

```yaml
port: { type: integer, default: 8080 }
port: { type: integer, min: 1, max: 65535, default: 8080 }
identifier: { type: string, pattern: "^[a-zA-Z][a-zA-Z0-9_]*$" }
log_level: { type: string, enum: [debug, info, warn, error], default: info }
name: { type: string, minLength: 1, required: true }
email: { type: string, format: email }
enabled: { type: boolean, default: false }
```

Each leaf is one line. The constraint dict captures everything about the field's shape; the parent node's structure captures the field's location.

## Nested objects

Object structure mirrors YAML nesting. Deep nesting works directly, with each leaf still on one line:

```yaml
spec:
  schema:
    architecture: { type: string, enum: [standalone, replication], default: standalone }
    primary:
      replicaCount: { type: integer, min: 1, max: 9, default: 1 }
      resources:
        requests:
          cpu: { type: string, pattern: "^[0-9]+(m|\\.[0-9]+)?$", default: "250m" }
          memory: { type: string, pattern: "^[1-9][0-9]*(Mi|Gi)$", default: "512Mi" }
        limits:
          cpu: { type: string, pattern: "^[0-9]+(m|\\.[0-9]+)?$", default: "500m" }
          memory: { type: string, pattern: "^[1-9][0-9]*(Mi|Gi)$", default: "1Gi" }
    auth:
      username: { type: string, default: app_user }
      password: { type: string, format: password }
```

The compiler infers object structure from the YAML hierarchy. Intermediate nodes (here: `primary`, `resources`, `requests`, `limits`, `auth`) are object types containing the nested children. The compiler emits explicit `type: object` and `properties:` blocks in the resolved JSON Schema; the author does not write them.

## Inferred vs explicit object form

A compact-form object scope can be authored two ways:

**Inferred form** — children directly under the parent key, no `type: object` declaration:

```yaml
auth:
  username: { type: string, default: app_user }
  password: { type: string, format: password, required: true }
```

The compiler recognises the scope as an object because its children are property declarations. It emits `type: object`, `properties: { ... }`, and **automatically injects `additionalProperties: false`** at compile time. The closure semantic is part of the inferred-form contract: typos in developer-authored fields fail loudly.

**Explicit form** — `type: object` declared, `properties:` enumerated:

```yaml
auth:
  type: object
  properties:
    username: { type: string, default: app_user }
    password: { type: string, format: password, required: true }
  additionalProperties: true   # genuinely-open map authored on purpose
```

The compiler does NOT inject `additionalProperties: false` in the explicit form. Authors who declare `type: object` carry full responsibility for the closure decision; the explicit form is the surface for genuinely-open maps (`additionalProperties: true`) and for objects that need other JSON Schema keywords (`patternProperties`, `propertyNames`, `unevaluatedProperties`).

**Authoring criterion**: use the inferred form for ordinary closed objects (the common case in catalog schemas). Use the explicit form when the object should be genuinely open, or when the schema requires JSON Schema keywords that the compact form doesn't carry directly.

## Closure semantics

By convention, compact-form **inferred-form** objects are closed: undeclared properties produce a validation error. The compiler emits `additionalProperties: false` on every inferred-form object scope automatically. This matches the catalog discipline of typos failing loudly.

To open an object (allowing arbitrary additional properties), use the explicit form with `additionalProperties: true`:

```yaml
labels:
  type: object
  additionalProperties: true   # opt-in; allow any string-keyed values
```

For the common pattern "object whose values all share a type" (e.g., a map of string → string for labels), use `valuesType:`:

```yaml
labels: { type: object, valuesType: string }
nodeSelector: { type: object, valuesType: string }
counters: { type: object, valuesType: integer }
```

`valuesType: <type>` compiles to `additionalProperties: { type: <type> }`. It's a frequent enough pattern to deserve a single-keyword shorthand.

## Required fields

Required fields use `required: true` per leaf:

```yaml
auth:
  username: { type: string, default: app_user }
  password: { type: string, format: password, required: true }
  database: { type: string, pattern: "^[a-zA-Z][a-zA-Z0-9_]*$", required: true }
```

The compiler collects all `required: true` markers within an inferred-form object scope and emits them as JSON Schema's `required: [field1, field2]` array.

The per-leaf marker form works cleanly for inferred-form objects without `$ref:`. For consumers that pull a SchemaLibrary entry into their schema via `$ref:`, the parent-level `required: [name1, name2]` array is the canonical authoring shape; leaf-level markers inside a `$ref:`-bearing consumer's content do not contribute to the parent's required set. See [cross-document-ref.md](cross-document-ref.md) §"`required:` syntax under cross-document `$ref:`" for the full rule.

## Arrays

Arrays use `type: array` with `items:` describing the element shape:

```yaml
tags: { type: array, items: { type: string } }

ports: { type: array, items: { type: integer, min: 1, max: 65535 } }

extraEnvVars:
  type: array
  items:
    name: { type: string, required: true }
    value: { type: string }
    valueFrom: { type: object, additionalProperties: true }

allowedHosts:
  type: array
  min: 1                # minItems
  max: 100              # maxItems
  items: { type: string, format: uri }
```

For the common case "array of typed scalars", the inline form is one line. For arrays of objects, `items:` introduces a nested compact-form schema.

## The `type:` keyword — scalar or array of types

`type:` accepts either a single value (`type: string`) or an array of permitted types (`type: [string, integer, boolean]`). The array form is JSON Schema 2020-12's standard expression of "this field accepts one of several types":

```yaml
release_tier: { type: [string, integer], description: "Numeric tier or named tag" }
```

When `type:` carries an array, the value space is the union of the named types' value spaces. Authors writing schemas that consume the array form must handle both shapes downstream — the resolved JSON Schema's `type` field holds either a string or an array, and consumers walking the resolved schema check both shapes.

## Reserved keywords at every inferred-form scope

The inferred-form dispatch recognises a small set of keywords that carry meaning at the compact-form vocabulary level: `description`, `type`, `default`, `required`, and the constraint keywords (`enum`, `min`, `max`, `pattern`, `format`, etc.). When any of these keywords appears as a field name at an inferred-form object scope, the compiler routes the enclosing scope through the constraint-emission path instead of the implicit-object path. The resulting schema would treat the keyword as a constraint declaration, not as a child property.

For schemas that need a property named after a reserved keyword (e.g., a Component contract with a developer-authored `description:` field, or a `type:` field, or a `default:` field), use the explicit form for the offending scope:

```yaml
spec:
  schema:
    values:
      type: object
      properties:
        description: { type: string }        # property named "description"
        type: { type: string }               # property named "type"
        default: { type: string }            # property named "default"
      required: [description, type]
      additionalProperties: false
```

The explicit form bypasses the dispatch — `properties:` enumerates the children explicitly, so the keyword collision doesn't arise.

This constraint applies at every inferred-form scope, recursively. A nested inferred-form object that contains a property named after a reserved keyword routes through the constraint-emission path at that scope. The fix is the same: switch the offending scope to the explicit form.

## References

References borrow JSON Schema's `$ref:` syntactically and semantically:

```yaml
resources: { $ref: "#/$defs/PodResources" }

auth: { $ref: "oci://hub.aggrega.ai/aggrega/datastores@1.0.0#/schemas/MariaDBAuth" }

secondary:
  allOf:
    - { $ref: "#/$defs/NodePool" }
    - replicaCount: { min: 2 }
```

`$defs:` blocks within a compact-form schema declare reusable definitions. Each entry is itself a compact-form (or JSON Schema, or mixed) schema. Reference via `#/$defs/<Name>` JSON Pointer fragment:

```yaml
$defs:
  PodResources:
    requests:
      cpu: { type: string, pattern: "^[0-9]+(m|\\.[0-9]+)?$" }
      memory: { type: string, pattern: "^[1-9][0-9]*(Mi|Gi)$" }
    limits:
      cpu: { type: string, pattern: "^[0-9]+(m|\\.[0-9]+)?$" }
      memory: { type: string, pattern: "^[1-9][0-9]*(Mi|Gi)$" }

primary:
  replicaCount: { type: integer, min: 1, max: 9, default: 1 }
  resources: { $ref: "#/$defs/PodResources" }
```

For cross-document references targeting SchemaLibrary entries, see [cross-document-ref.md](cross-document-ref.md). For OCI URI shorthand expansion, see [uri-grammar.md](uri-grammar.md).

## Conditional shape via `when:`

JSON Schema 2020-12 expresses conditional shape via `if`/`then`/`else`. The compact form provides `when:` as a more direct shorthand: a Go template predicate that, if true, applies the rest of the node's constraints; if false, the node is treated as if its constraints did not exist.

```yaml
secondary:
  $ref: "#/$defs/NodePool"
  when: '{{ eq $.architecture "replication" }}'
  required: true
  properties:
    replicaCount: { min: 2 }
```

The predicate evaluates against the parent's instance values. `$` refers to the surrounding object scope. When `architecture` is `replication`, the constraints (`required: true`, the additional `replicaCount: min: 2`) apply on top of the referenced `NodePool`. When `architecture` is `standalone`, those constraints are inactive.

The predicate has access to the standard Go template functions (Sprig). The compiler compiles `when:` to JSON Schema's `if`/`then`/`else` plus a wrapper to evaluate the Go template predicate before validation runs. Determinism is preserved because the predicate is pure with respect to the instance.

## Per-field custom validation via `validate:` and `validateMessage:`

Some constraints cannot be expressed with `min` / `max` / `pattern` / `enum`. For these, the compact form provides `validate:` — a Go template predicate that, if false, halts validation with a custom error.

```yaml
db_size:
  type: string
  pattern: "^[1-9][0-9]*(Mi|Gi|Ti)$"
  validate: '{{ regexFind "^[0-9]+" . | atoi | gt 100 }}'
  validateMessage: "db_size must exceed 100 in its declared unit"
```

The predicate runs against the field's value (accessible as `.`); the surrounding object scope is `$`. If the predicate returns false, validation produces an error using `validateMessage:` (or a default message if not provided).

`validate:` handles cases beyond JSON Schema's standard vocabulary: custom semantic validation (semver format checking, JSON-content-of-a-string), cross-field-but-narrow-scope rules where one field's constraint depends on a sibling, and constraints that are not worth a full `assertions:` block.

`validate:` differs from `when:` in role: `when:` toggles whether constraints apply; `validate:` is itself a constraint.

For genuinely cross-field rules with broad scope, where no single field is "the one being validated," use the dedicated `assertions:` block. See [templates/assertions-block.md](../templates/assertions-block.md).

## Composition with `allOf`, `anyOf`, `oneOf`

Composition keywords work as in JSON Schema:

```yaml
# Inherit and extend
secondary:
  allOf:
    - { $ref: "#/$defs/NodePool" }
    - replicaCount: { min: 2 }

# Disjunction (one of several shapes)
auth:
  oneOf:
    - existingSecret: { type: string, required: true }
    - properties:
        rootPassword: { type: string, required: true }
        username: { type: string, default: app_user }
        password: { type: string, required: true }
```

The compiler emits the same composition keywords in resolved JSON Schema. The composing entries can each be compact form, JSON Schema, or `$ref:` references. Mixing within a composition is supported.

## The escape hatch — `$jsonschema:`

For cases beyond the compact form's vocabulary (`$dynamicRef`, complex `unevaluatedProperties` interactions, deep `not:` composition, recursive types), any node can drop to full JSON Schema:

```yaml
values:
  architecture: { type: string, enum: [standalone, replication] }
  some_complex_field:
    $jsonschema: |
      type: object
      unevaluatedProperties: false
      allOf:
        - $ref: "#/$defs/Foo"
        - not:
            required: [conflicting_field]
      patternProperties:
        "^x-": { type: string }
```

The `$jsonschema:` block contains JSON Schema YAML; the compiler treats it as a transparent passthrough — the content goes directly into the resolved JSON Schema document at that node's position. Validation, error reporting, and tooling all work on the resolved document; the escape is purely an authoring convenience.

The `$jsonschema:` escape is per-node, not per-document. A schema can use compact form for the simple parts, JSON Schema escape for the one complex field, and `$ref:` for shared shapes — all in one document.

## Mixing compact form and JSON Schema in one document

Compact form and JSON Schema can be freely mixed at any node boundary. The dispatch rule is content-shape-driven:

- A node containing `$jsonschema:` is treated as JSON Schema (the escape hatch).
- A node containing JSON-Schema-style top-level keywords (`type:`, `properties:`, `additionalProperties:`, `if:`, etc.) is treated as JSON Schema (the explicit form).
- A node containing only property-name → child-schema entries (no JSON-Schema-reserved keywords) is treated as compact form (inferred form).
- A node with `$ref:` only is a reference passthrough.
- A node with `allOf:` / `anyOf:` / `oneOf:` is composition; each entry independently dispatches.

For compact-form leaves, the standard pattern is `field_name: { type: ..., constraints... }` — a YAML map containing a known compact-form vocabulary. The dispatch recognises constraint dicts by their keys.

For the rare ambiguous case (e.g., a compact-form schema with a field literally named `type` that the inferred-form dispatch would interpret as the JSON Schema keyword), the explicit form is the canonical fix — see "Reserved keywords at every inferred-form scope" above.

## Aggrega extension namespace — `x-aggrega-*`

The compact form recognises any keyword prefixed with `x-aggrega-` as an Aggrega-specific extension. The namespace is open: new annotations enter the catalog without per-keyword vocabulary edits. Authors writing `x-aggrega-source`, `x-aggrega-selector`, `x-aggrega-narrowed-from`, or future annotations land their content at the right scope in the resolved JSON Schema without compile-time rejection.

The namespace prefix matters: a typo like `x-agrega-source` (missing one `g`) is NOT recognised as an extension keyword and would be rejected by the closed-object semantics on inferred-form scopes. The prefix scope acts as a typo-detection net for the catalog's annotation surface.

Specific `x-aggrega-*` annotations are emitted by the compiler at well-known points in the pipeline:

- `x-aggrega-source:` — populated by the cross-document `$ref:` expander to attribute each property to its origin SchemaLibrary entry. See [cross-document-ref.md](cross-document-ref.md) §"Library-to-library chain expansion".
- `x-aggrega-selector:` — emitted by `usesSchema:` and `secretsSchema:` synthesis to carry the selector string that targets compatible provider Components.

Catalog authors writing their own extension keywords use the same namespace; downstream tooling that consumes the compiled JSON Schema reads `x-aggrega-*` keys without colliding with JSON Schema's own keyword space.

## Worked example — MariaDB Component schema

A representative compact-form Component schema for a MariaDB datastore, showing inferred form throughout, mixed leaf constraints, references, conditional shape, and a worked `oneOf` for the authentication block:

```yaml
spec:
  schema:
    values:
      architecture:
        type: string
        enum: [standalone, replication]
        default: standalone
        description: |
          Topology mode. `standalone` runs a single primary; `replication` runs a primary
          plus N secondary replicas governed by the secondary block.

      primary:
        replicaCount: { type: integer, min: 1, max: 9, default: 1 }
        resources: { $ref: "#/$defs/PodResources" }
        persistence: { $ref: "#/$defs/PersistenceSpec" }

      secondary:
        when: '{{ eq $.architecture "replication" }}'
        replicaCount: { type: integer, min: 2, max: 8, default: 2 }
        resources: { $ref: "#/$defs/PodResources" }
        persistence: { $ref: "#/$defs/PersistenceSpec" }

      auth:
        oneOf:
          - existingSecret: { type: string, required: true }
          - properties:
              rootPassword: { type: string, format: password, required: true }
              username: { type: string, default: app_user }
              password: { type: string, format: password, required: true }
              database: { type: string, pattern: "^[a-zA-Z][a-zA-Z0-9_]*$", required: true }

      metrics:
        enabled: { type: boolean, default: false }
        serviceMonitor:
          enabled: { type: boolean, default: false }
          namespace: { type: string }

      labels: { type: object, valuesType: string }

    $defs:
      PodResources:
        requests:
          cpu: { type: string, pattern: "^[0-9]+(m|\\.[0-9]+)?$" }
          memory: { type: string, pattern: "^[1-9][0-9]*(Mi|Gi)$" }
        limits:
          cpu: { type: string, pattern: "^[0-9]+(m|\\.[0-9]+)?$" }
          memory: { type: string, pattern: "^[1-9][0-9]*(Mi|Gi)$" }

      PersistenceSpec:
        size: { type: string, pattern: "^[1-9][0-9]*(Mi|Gi|Ti)$", required: true }
        storageClass: { type: string }
```

The example fits in ~40 LOC of compact form; the equivalent JSON Schema YAML expands to roughly 2.5x the line count. The compactness gain compounds across larger Component contracts and is meaningful enough to make the compact form the default authoring surface for `schema:`, `parameters:`, and SchemaLibrary entries.

## Cross-pointers

- For cross-document `$ref:` resolution semantics (Pattern A vs B `required:` syntax; library-to-library chain expansion; consumer narrows library): [cross-document-ref.md](cross-document-ref.md).
- For the `assertions:` block authoring grammar (cross-field rules that compact-form `validate:` cannot express): [templates/assertions-block.md](../templates/assertions-block.md).
- For the data-pillar set that hosts the compact-form schemas (`values:`, `infra:`, `provides:`, `uses:`, `secrets:`, `locals:`, `parameters:`): [data-pillars.md](data-pillars.md).
- For OCI URI shorthand expansion rules (domain default, registry segment, version fallback, namespace expansion): [uri-grammar.md](uri-grammar.md).
- For SchemaLibrary entity authoring (where `$ref:`-referenceable schemas live in the catalog): [../entities/schemalibrary.md](../entities/schemalibrary.md).
