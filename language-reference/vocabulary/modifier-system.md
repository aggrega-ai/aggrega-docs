# appliesTo and selectors

The modifier system governs which nodes a Feature attaches to. A Feature
declares label selectors; the compiler's native label-matching engine
evaluates them against each target Component's `metadata.labels` during
the static analysis stage. The same engine — and the same selector
grammar — also evaluates `usesSchema` socket selectors for cross-node
type safety, so one vocabulary serves every selector surface in the
language.

## The two envelopes

A Feature spec carries up to two selector fields:

* **`appliesTo`** — the AND-composition surface. A single
  Kubernetes-style label-selector string; every comma-separated
  requirement must hold for the attachment to be valid.
* **`appliesToAnyOf`** — the OR-composition surface. A list of selector
  items; any single matching item satisfies the attachment. Each item is
  either a string-form selector (same grammar as `appliesTo`,
  requirements inside the string AND together) or a flat key-value map
  matched by equality only.

When a Feature declares both, the results AND across the envelopes: the
`appliesTo` string must hold and at least one `appliesToAnyOf` item must
match. An omitted or empty selector declares no constraint and matches
every label set — a Feature with neither field attaches anywhere the
developer puts it.

```yaml
spec:
  appliesTo: "compliance.aggrega.ai/scope in (pci), tier notin (dev, staging)"
  appliesToAnyOf:
    - { component.aggrega.ai/type: stateful-server }
    - "datastore.aggrega.ai/engine in (relational, document, vector)"
```

## The string grammar

The selector string is the grammar `kubectl get -l` accepts:
comma-separated requirements, AND-composed, each in one of six forms:

| Form | Meaning |
| --- | --- |
| `key=value` | the label exists with exactly this value |
| `key!=value` | the label is absent, or present with a different value |
| `key in (v1, v2)` | the label's value is one of the set |
| `key notin (v1, v2)` | the label is absent, or its value is outside the set |
| `key` | the label exists (any value) |
| `!key` | the label is absent |

Keys may carry DNS-style prefixes (`team.aggrega.ai/owner`). The
operator vocabulary is a closed set of six; the engine does not support
regex, substring, or numeric comparison.

```yaml
appliesTo: "component.aggrega.ai/type in (server, worker), !legacy.aggrega.ai/exempt"
```

## Where validation lives

Two layers check a selector, with deliberately different strictness:

* **The JSON Schema `pattern` is a loose outer gate.** The Feature
  schema declares `appliesTo` (and string-form `appliesToAnyOf` items)
  as strings with a bounding pattern that rejects only
  obviously-malformed shapes. It is deliberately permissive — the schema
  never rejects a selector the engine would evaluate.
* **The parser is the validator.** The compiler's selector parser owns
  the grammar: a selector that fails to parse (an unclosed `in (...)`
  set, a bare `!` with no key) halts the build with a selector
  parse-error diagnostic naming the attachment site. Parse failures are
  loud and specific, never silently skipped.

A selector that parses but does not match is not an error in itself —
it is an unsatisfied constraint. At static analysis, every Feature
attachment whose target labels fail the Feature's selectors produces a
violation diagnostic naming the feature instance, the target node, its
labels, and the constraint; the analyzer collects every violation
before halting, so one compile surfaces all of them.

## What the compiler does not do

The compiler is blind to label semantics. It evaluates whatever label
strings it finds — it does not recognize `component.aggrega.ai/type` as
special, does not validate that a category value belongs to the
standard catalog's closed set, and does not infer meaning from key
names. The label vocabulary itself — the operational type contract, the
cognitive category axis, the per-role capability labels — is a
standard-library convention upheld by catalog authors and the
publishing linter, not by the compiler. Enterprises authoring their own
catalogs are free to define their own label vocabulary; the selector
engine evaluates it identically. For the three-axis label scheme the
standard catalog uses, see
[architecture/13-catalog-and-registry.md](../../architecture/13-catalog-and-registry.md);
for the per-label teaching, see
[architecture/09-ai-features.md](../../architecture/09-ai-features.md) §1.3.

## Selector kinship across the language

`usesSchema` socket selectors (`selector: "component.aggrega.ai/type=stateful-server"`)
and the `x-aggrega-selector:` annotations synthesized from them use the
same grammar and the same engine as Feature `appliesTo`. Authoring
knowledge transfers one-to-one: a string that works as a socket
selector works as an attachment selector. For the socket-side teaching,
see [topology-triad.md](topology-triad.md) and
[entities/component.md](../entities/component.md).

For the Feature-side authoring surface — the spec fields, worked
attachment examples, and the interplay with `extends` inheritance — see
[entities/feature.md](../entities/feature.md) §Label-Based Attachment.
