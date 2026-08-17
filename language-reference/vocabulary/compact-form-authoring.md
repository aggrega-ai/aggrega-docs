# Compact-form authoring

The compact form is a YAML-shaped declarative shorthand for JSON Schema 2020-12. Authors write per-field constraints as inline-flow YAML maps (`port: { type: integer, min: 1, max: 65535, default: 8080 }`); intermediate object nodes are natural YAML nesting; references use JSON Schema's standard `$ref:`. The compiler transforms compact form to JSON Schema 2020-12 before any validation runs, so all downstream pipeline stages (validator, merger, error formatter, publishing-discipline classifier, hub UI) operate on the resolved JSON Schema regardless of the authoring path.

This page documents the compact-form vocabulary, the structural conventions, the inferred-vs-explicit object dispatch, the closure semantics, the `type:` heterogeneity that allows arrays of permitted types, the typeIdentity-keyword constraint at every inferred-form scope, and the `x-aggrega-*` extension namespace. For cross-document `$ref:` resolution semantics, see [cross-document-ref.md](cross-document-ref.md). For the assertions-block authoring grammar, see [templates/assertions-block.md](../templates/assertions-block.md). For the data-pillar set (`values:`, `infra:`, `provides:`, `uses:`, `features:`, `locals:`, `parameters:`), see [data-pillars.md](data-pillars.md).

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
| `sensitive` | Declares that this leaf carries secret material. Compiles to `x-aggrega-sensitive: true`. See "Declaring a leaf sensitive" below |
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

The bare type name above is the `schema:` and SchemaLibrary spelling. **On an Aggregate `parameters:` slot, write the value as a contract instead** — `valuesType: { type: string }`. The same applies to the other two keywords whose value is itself a contract, `items:` and each entry under `properties:`, because a parameter declaration and every contract nested inside it carry one shape. A bare type name in any of those three positions on a parameter slot is refused, and the diagnostic names which nested contract carried it. See [`entities/aggregate.md`](../entities/aggregate.md#parameter-slot-vocabulary) for the parameter-slot vocabulary in full.

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

The inferred-form dispatch recognises a small set of keywords that carry meaning at the compact-form vocabulary level: `description`, `type`, `default`, `required`, the constraint keywords (`enum`, `min`, `max`, `pattern`, `format`, etc.), and the Aggrega-specific keywords (`validate`, `validateMessage`, `when`, `sensitive`). When any of these keywords appears as a field name at an inferred-form object scope, the compiler routes the enclosing scope through the constraint-emission path instead of the implicit-object path. The resulting schema would treat the keyword as a constraint declaration, not as a child property.

`sensitive` deserves specific mention here, because it is a far more plausible name for a real developer-authored field than the other Aggrega-specific keywords are. A schema that genuinely needs a property *named* `sensitive` — a component whose `values` expose a `sensitive` flag of their own, say — must declare the enclosing scope explicitly, exactly as it would for a property named `type` or `default`. Either the explicit form below or `$mode: jsonschema` on the enclosing scope achieves it: under `$mode: jsonschema` the whole node is read as authored JSON Schema, where `sensitive` is ordinary content rather than the compact-form keyword.

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

auth: { $ref: "Datastores#/schemas/MariaDBAuth" }

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

### Point a reference at a definition, not at a property

A pointer naming a `$defs:` entry — `#/$defs/PodResources` — is the shape to reach for. A pointer is
legal wherever JSON Schema allows one, so a pointer into a declared property is accepted and enforced
too, but it is reported less precisely, and the difference is worth knowing before you write one.

A field whose shape comes from a `$defs:` entry is checked field by field: a failure is reported at
the path of the value that is actually wrong, and every failure under that field is reported, not
just the first.

```yaml
$defs:
  PodResources:
    requests:
      cpu: { type: string, pattern: "^[0-9]+(m|\\.[0-9]+)?$" }

primary:
  resources: { $ref: "#/$defs/PodResources" }
```

A bad `cpu` here is reported at `primary.resources.requests.cpu`.

A field whose shape comes from a pointer into a declared property is checked as part of the document
as a whole. The constraints still apply and a document violating them still halts — but the failure
is reported at the field carrying the pointer rather than at the value inside it, and where several
such fields are wrong at once only one of them is named.

```yaml
primary:
  resources:
    requests:
      cpu: { type: string, pattern: "^[0-9]+(m|\\.[0-9]+)?$" }

secondary:
  resources: { $ref: "#/properties/primary/properties/resources" }
```

A bad `cpu` under `secondary` is reported at `secondary.resources`.

Both authorings accept and refuse exactly the same documents. What differs is how much the message
tells you, which matters most in an editor, where the marker is placed from that path. The same
applies to a `$defs:` entry whose own pointer reaches back out into the properties: reaching a
definition through it inherits the coarser report.

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

## Declaring a leaf sensitive — `sensitive:`

A `values`, `infra` or `provides` leaf may declare that the datum it describes carries secret material:

```yaml
spec:
  schema:
    values:
      origin:
        type: string
        required: true
        sensitive: true
        description: "The credential material itself."
      key:
        type: string
        default: value
        description: "The data key the material is stored under."
```

`sensitive: true` compiles to the extension keyword `x-aggrega-sensitive: true` on that node in the resolved JSON Schema, alongside the other `x-aggrega-*` annotations. The compiler reads it to derive which attachments in a deployment handle declared-sensitive material, and carries that derived fact on the compiled graph.

**Declare it on the datum, not on its locator.** The distinction is the whole point of the keyword and it is easy to get backwards. A credential's *material* is sensitive; the *name* of the resource holding it and the *data key* within that resource are not — both are public, and both are rendered in the clear into every consumer that references the resource. Marking a locator states something untrue about it and propagates that error to everything downstream that reads the declaration. In the example above, `origin` is marked and `key` deliberately is not.

The complementary statement — *whatever binds this point handles secret material*, regardless of what the fill declares about its own leaves — is not a leaf declaration at all. It is `sensitive` on an attachment slot; see [entities/component.md](../entities/component.md) "Attachment Slots".

### What the keyword does not do

The name invites assumptions the keyword does not earn, so state the ceiling plainly:

- **It does not encrypt anything.** It is an annotation on a declaration, not a confidentiality mechanism.
- **It does not validate or reject.** No value is accepted or refused because a leaf is declared sensitive, and no build outcome changes.
- **It does not guarantee that rendered output is free of material.** Whether an artifact carries material depends on which fill a deployment attached and what the author wrote in its `values` — see [architecture/08-credential-model.md](../../architecture/08-credential-model.md) "What the compiler does and does not guarantee". A declared-sensitive value an author supplied inline is rendered exactly as an undeclared one is.
- **It does not force a delivery mechanism.** It cannot turn an inline value into a store reference, and it does not narrow what a slot's `inject` allowlist permits.
- **It does not halt a build.** The one build-time notice it raises, described below, is an advisory: the build runs to completion and writes its artifacts. Making the notice fatal is an organisation's choice, expressed as a governance policy attached to the build, not something the keyword does on its own.
- **It changes no rendered byte today, and on most targets it never will.** No shipped render path turns the declaration into different output, so declaring a leaf sensitive across an existing catalog leaves every rendered artifact identical. A target platform that carries a sensitivity notion of its own is where a declaration has somewhere to land; a target with none has nothing for it to change, permanently.

### What it changes in what the tool prints

The one thing a declaration does change is the CLI's own debug output. A declared-sensitive value is replaced by the fixed text `<redacted>` on the surfaces the tool prints for a human to read:

- the per-pass trace `aggrega build --trace` writes to `.trace/`;
- the per-node `Values:` block `aggrega inspect` prints for an Aggregate;
- the per-leaf attachment block `aggrega inspect` prints for a resolved Release.

The key is always kept and only its value is replaced, so a reader still sees that the leaf is authored and that something was withheld. A leaf the author did not declare prints its value verbatim beside a withheld sibling — the substitution follows the declaration and nothing else, so a field named `password` that carries no declaration is printed, and a declared field named `key` is not.

The trace's withholding can be turned off for one build, when the withheld value is the one being debugged: `aggrega build --trace --trace-unredacted` writes the values into the trace files and marks each of those files with a header saying so. It is an invocation-time choice with no configuration setting, it reaches the trace alone, and it is documented with [`cli/aggrega-build.md`](../cli/aggrega-build.md) "Showing the withheld values". The `aggrega inspect` layouts have no such switch.

Five boundaries on that behaviour matter more than the behaviour itself.

**Rendered artifacts are never redacted.** Everything under `dist/` is emitted exactly as the render produced it, because it is the deployable: a placeholder written into a manifest would be a broken deployment rather than a protected one. Redaction covers what the tool *prints*, never what it *writes*. Reading a declaration as a promise that `dist/` is safe to publish is the one misreading to avoid — the ceiling above is unchanged, and `dist/` remains as sensitive as its most material-carrying attachment.

One thing a declaration may add to a rendered artifact, and it is not redaction: **where a target has a sensitivity primitive of its own, the declaration is rendered into it.** The value is still written in full — nothing is withheld or replaced — and what the artifact gains is the target's own marking beside it, so the target's tooling can treat the value as the author declared it. Terraform is the target that offers one today, and what its attribute does and does not guarantee is at [`providers/terraform.md`](../providers/terraform.md) "Declared-sensitive module inputs". Such a marking travels only where the rendered name's identity is recovered from the declaration itself; where a template invented the name, the marking is absent rather than approximated, because marking a value the author did not declare would assert something false about it.

**Redaction reaches what a declaration names, plus what a template is seen to read.** A declared leaf in a `values` or `infra` pillar, and a delivery key that carries material from a `provides` key declared sensitive, are both identified by name and withheld. A value a template computed lands under a key nobody declared, so what identifies it instead is the reference the author wrote: in the trace, a `locals:` entry or a `source:` field whose template reads a declared-sensitive leaf is withheld, and so is a `locals:` entry that reads an already-withheld sibling. The reading is deliberately conservative — reaching a whole object reaches every declared leaf under it — so an unresolvable reference withholds rather than prints.

**A rendered document is shown as a re-render, and says so.** The trace's parsed `Workload` is a document the Recipe's template produced: nothing in it records which declaration each character came from, so there is no key at which to substitute inside it, and recovering the link field by field would mean inspecting the content of a value — which the compiler does not do. What the trace shows instead is the same `workload:` template evaluated again against a context whose declared-sensitive data already reads as the replacement text, announced in a `workload_note` entry beside the document. Because the template sees a string where a string was, the re-render keeps the emitted document's shape and the replacement text stands in the withheld datum's own position. Two differences remain and the note states both: a template that branches on the *content* of a value renders differently against the replacement text, and a datum the axis does not name is carried through unchanged. It is a debugging view of what was rendered, never a copy of it.

**A consumed node's values are withheld against that node's declarations, on both surfaces the edge carries them to.** A `uses`-edge view reproduces what a target component published, so the target's own schema governs it: a `provides` key the target declared sensitive is withheld on the consumer's trace even when the consumer declares nothing. Where the edge's own `inject` block routes that key onto a delivery key of the consuming component, that delivery key is withheld too — the same rule an attachment's `inject` mapping follows, reading the same declaration, so the two wirings cannot disagree. The `aggrega inspect` layouts show a node's own pillars and its attachments, not a consumed node's published values, so nothing there carries a cross-node view to withhold.

**The machine-readable projections are verbatim by contract, and need the same handling as the files they came from.** `aggrega inspect --raw` emits an entity exactly as authored, and `aggrega inspect --output yaml` emits its render subject — the authored entity for a catalog kind or an Aggregate, the compiled graph for a resolved Release. Neither substitutes anything, and that is deliberate: these are the outputs a script parses and a diff compares, so an output that quietly withheld part of itself would misrepresent the input it claims to reproduce and break the round-trip its consumers depend on. The same holds for the compiled graph an editor integration reads over the daemon's protocol. Declaring a leaf sensitive is not sufficient to keep it out of those outputs: pipe them, store them and share them the way you would the Aggregate and the Release themselves.

### The build advisory for a value travelling as a literal

A build prints one advisory per delivery key that carries declared-sensitive material as a literal value. It fires when an attachment's `inject` block routes a `provides` key the attachment's Feature declared sensitive onto a delivery key of the consuming component, and the value is actually delivered:

```text
warning: node "db" (provider "helm"): attachment "user_password" delivers a value
declared sensitive to env delivery key "MARIADB_PASSWORD" as a literal; where the
target supports it, fill the slot with an attachment that delivers a reference instead
```

Three things about it are deliberate.

**It reports how a value travels, not that something is wrong.** Delivering a literal is frequently the only thing a target accepts, and a whole family of attachments exists to do exactly that. The advisory tells an author which value takes that route and where, so the choice is visible rather than implicit; it does not claim the choice is a mistake.

**It is a warning and never a halt.** The build succeeds and writes its artifacts unchanged. An organisation that wants a literal-delivered credential to fail the build expresses that as a governance policy over the build, which is where a rejection belongs — a rule some deployments must break is not a compiler default.

**It is decided from the wiring, never from the value.** The advisory reads the sensitivity a schema declared plus the delivery the deployment authored. No value is inspected, so a field is never guessed to be a credential from its name or its contents, and an undeclared value that happens to hold a password raises nothing.

Two cases deliberately stay silent. A delivery key whose referenced `provides` key publishes nothing delivers no literal and reports nothing — the advisory follows a delivery that happened. And a slot whose `inject` allowlist is empty leaves delivery to the Recipe, so the deployment authored no delivery key to report and an author has nothing to act on.

The advisory is its own class, keyed on its own code, and `--no-unsupported-field-warnings` does not silence it: that flag covers a target's fidelity notices, which are a different judgement silenced for different reasons. It also reaches the editor, where it appears as a problem on the Aggregate, whenever the language server is running with `--build-on-inspect` (or the `serve.build_on_inspect` config key) turned on. That setting is off by default for consistency with `aggrega inspect`: the terminal command never runs the build's analysis while inspecting a graph, so it raises no such advisory either, and an editor inspection that also raises none is showing you the same thing the terminal does. Turning the setting on is how you ask the editor for the additional layer, and nothing is written to disk when you do — it is the build's findings, not its artifacts. Every published problem names the layer that raised it, so an editor can keep this advisory apart from the ones the resolution and analysis stages report.

### Where the declaration is read, and where it is not

The keyword is read on the node it sits on, and the read descends only through property maps. Three shapes therefore need the marker placed deliberately:

- **Beside a `$ref`**, not inside the reference's target. A marker in the referenced schema is not collected for the referring leaf.
- **Beside a composition keyword** (`allOf` / `anyOf` / `oneOf`), not inside a branch's own `properties`.
- **On the array leaf itself**, not on its `items` element type. An array whose elements carry material is declared sensitive at the array, because an element type is not a property map and is not descended into.

### `parameters:` is a different vocabulary

`sensitive` is not part of the `parameters:` typed-contract vocabulary. An Aggregate that declares it on a parameter entry is rejected when the Aggregate loads, with a document-envelope diagnostic reporting `unexpected property: "sensitive"` positioned on the offending key itself — the same treatment any key outside that vocabulary receives, since the parameter contract is a closed object.

The asymmetry is deliberate: the sensitivity axis covers the three data pillars a catalog entity declares, and a parameter is an environment-contract input rather than a pillar leaf. A deployment that hoists credential material through a parameter is documented at [architecture/08-credential-model.md](../../architecture/08-credential-model.md) "Legacy charts that demand a formatted string", which states the trade-off that path makes.

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
- `x-aggrega-selector:` — emitted by `usesSchema:` and `featuresSchema:` synthesis to carry the selector string that targets compatible provider Components.
- `x-aggrega-sensitive:` — emitted by a leaf declaring `sensitive: true`. See "Declaring a leaf sensitive" below.

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
- For the data-pillar set that hosts the compact-form schemas (`values:`, `infra:`, `provides:`, `uses:`, `features:`, `locals:`, `parameters:`): [data-pillars.md](data-pillars.md).
- For OCI URI shorthand expansion rules (domain default, registry segment, version fallback, publisher expansion): [uri-grammar.md](uri-grammar.md).
- For SchemaLibrary entity authoring (where `$ref:`-referenceable schemas live in the catalog): [../entities/schemalibrary.md](../entities/schemalibrary.md).
