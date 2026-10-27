# Cross-document `$ref:` resolution

This page documents the resolution semantics of cross-document `$ref:` references in Aggrega's schema authoring surface — what authors of Components, Features, and SchemaLibrary entries see when a `$ref:` crosses a document boundary into a library, and the per-syntax `required:` rules that pin which authoring forms work cleanly with cross-document expansion.

`$ref:` is JSON Schema 2020-12-native. It appears inside `schema:` content (Component, Feature, SchemaLibrary entries), inside compact-form schemas, and inside the synthesized JSON Schema layer that `usesSchema:` and `featuresSchema:` emit. This page focuses on the cross-document case, where `$ref:` targets a SchemaLibrary entry in a separate file or OCI artifact.

For catalog-entity inheritance (Component-extends-Component), see [inheritance-and-interface.md](inheritance-and-interface.md). A Release extending a Release is a different mechanism over a document that is not catalog-indexed; it is documented at [`entities/release.md`](../entities/release.md#composite-release-and-extends-inheritance).

`$import:` is the other keyword that reaches content outside the document, and the two answer different questions. `$ref:` names an **entry in a SchemaLibrary** by identity — the catalog resolves it, the lockfile supplies the version — and it composes at any node. `$import:` names a **file** beside the entity and replaces whole content with what that file holds. `$import:` applies on the schema surface as well as at `valuesMapping:`, `workload:`, `artifacts:` and `parameters:`; for `$import:` on a schema, see [compact-form-authoring.md](compact-form-authoring.md) §"Importing a contract from a file".

## `$ref:` resolution semantics

`$ref:` follows JSON Schema 2020-12 standard resolution. The following reference shapes appear in practice:

- **Local fragments** within the same document: `{ $ref: "#/$defs/PodResources" }` — resolves to the `PodResources` entry under the schema's `$defs`.
- **SchemaLibrary entry references** by identity: `{ $ref: "WebPrimitives#/schemas/URL" }` — the bare-name `<Library>#/schemas/<Entry>` form. The library name resolves against the resolved catalog and the `#/schemas/<Entry>` JSON Pointer fragment selects the entry; the version is supplied by the lockfile, not the reference. A reference carries no registry host — a host-bearing `oci://<host>/…` form is rejected at compile with a diagnostic that steers the author to the identity form, so a physical registry location never enters authored source. Where the library's bytes are served from (a local catalog directory, the content cache, or a remote registry) is the resolver's concern, bound at resolution time, never part of the reference.
- **A file path is not a reference target**: `{ $ref: "./schemas/foo.yaml#/definitions/Foo" }` is refused when the schema compiles, with a diagnostic naming the `<Library>#/schemas/<Entry>` form. Schema content kept in a file beside the entity is brought in with `$import:` instead, which is bounded by the entity's own directory like every file an entity reads.

The reference resolves at compile time. The expander inlines the referenced content into the consumer's schema; the rendered IR carries the inlined content, not the indirection. Per-property attribution is preserved via the `x-aggrega-source` annotation (see [Library-to-library chain expansion](#library-to-library-chain-expansion) below).

`$ref:` composes naturally with JSON Schema's composition keywords:

```yaml
secondary:
  allOf:
    - { $ref: "#/$defs/NodePool" }
    - replicaCount: { type: integer, min: 2 }
    - description: "Replication-mode secondary instances."
```

The `allOf` composes the referenced `NodePool` shape with the additional constraints.

## `required:` syntax under cross-document `$ref:`

Catalog authors choose between two authoring shapes when declaring required properties on a Component or Feature: leaf-level markers (`required: true` on each property) or the parent-level array (`required: [name1, name2, ...]` at the object scope). Both shapes are valid in JSON Schema 2020-12. Under cross-document `$ref:` expansion, only one of them threads through cleanly.

**Inferred-form authoring without `$ref:`** — leaf-level markers accumulate at compile time. The compactform compiler walks each property and, where a leaf carries `required: true`, contributes the property name to the synthesized parent's `required:` array.

```yaml
spec:
  schema:
    values:
      database: { type: string, required: true }
      display_name: { type: string, required: true }
      default_locale: { type: string, default: "en-US" }
```

The compiler emits `required: [database, display_name]` at the parent scope.

**`$ref:`-bearing consumers** — beside a cross-document `$ref:` only `properties`, `required` and `description` may be written, and the requirements the consumer adds are the ones in a parent-level `required:` array there. The referenced entry's own requirements — leaf-level markers in its inferred form, or a `required:` array of its own — apply through the reference unchanged. Authors of `$ref:`-bearing consumers should declare the requirement set explicitly at the parent level:

```yaml
spec:
  schema:
    values:
      $ref: "Datastores#/schemas/PostgresPayload"
      required: [database, display_name]
```

The authoring criterion is simple: any consumer that uses `$ref:` to pull a library entry into its schema must declare its `required:` set as a parent-level array. Mixing parent-level `required:` with `$ref:` is the canonical authoring shape; leaf-level `required: true` markers in this case do nothing.

## Library-to-library chain expansion

A SchemaLibrary entry may itself contain a `$ref:` pointing into another SchemaLibrary entry, producing a chain. The compactform compiler walks the chain at compile time: each `$ref:` met while an entry is expanded is itself expanded, in the terms of the library that holds it.

```yaml
# Library A
spec:
  schemas:
    DatabasePayload:
      type: object
      properties:
        host: { type: string }
        credentials: { $ref: "Credentials#/schemas/BasicAuth" }

# Library B (referenced from library A above)
spec:
  schemas:
    BasicAuth:
      type: object
      properties:
        username: { type: string }
        password: { type: string }
```

A consumer Component that references `DatabasePayload` receives the fully-expanded shape with `credentials` populated from library B's `BasicAuth`.

### `x-aggrega-source` attribution

The expander annotates each property in the rendered shape with `x-aggrega-source`, pointing at the immediate parent library entry that contributed the property. Under chain expansion, the annotation attributes to the **immediate parent only**:

- `host` in the expanded `DatabasePayload` carries `x-aggrega-source: <library-A>/DatabasePayload`.
- `username` in the expanded `credentials` carries `x-aggrega-source: <library-A>/DatabasePayload` (the immediate parent in the chain), not `<library-B>/BasicAuth`.

The deeper origin (library B) is not preserved in the current annotation shape. This is documented authoring-surface behaviour, not a defect — the chain can be reconstructed by recursive library lookup if needed. A future authoring polish may surface chain depth via an `x-aggrega-source-chain:` extension; until then, the immediate-parent attribution is the contract.

## Consumer narrows library entry

A consumer Component may declare a property whose name matches a property pulled in from a library entry. When this happens, the consumer's compiled property entirely replaces the library entry's in the merged shape; the library's `x-aggrega-source` annotation drops with the replaced property.

```yaml
# Library entry
spec:
  schemas:
    ToolContract:
      type: object
      properties:
        side_effects:
          type: array
          items: { type: string, enum: [read, write, delete] }

# Consumer Component
spec:
  schema:
    values:
      $ref: "Tools#/schemas/ToolContract"
      properties:
        side_effects:
          type: array
          items: { type: string, enum: [read] }
          default: [read]
```

In the merged shape, `side_effects` reflects the consumer's narrower contract (`enum: [read]`, with a `default`); the library entry's broader `enum: [read, write, delete]` is gone. The `x-aggrega-source` annotation on the consumer's `side_effects` property is dropped — the property is consumer-authored.

This is the expected behaviour: consumers refining a library entry's property is the canonical narrowing pattern. A future polish surface may add `x-aggrega-narrowed-from:` to record that a consumer property derives from a library entry it narrows; until then, narrowing is silent and the consumer's property stands on its own provenance.

## Cross-pointers

- For catalog-entity inheritance (Component-extends-Component, Feature-extends-Feature), see [inheritance-and-interface.md](inheritance-and-interface.md).
- For inheritance between the deployment-side documents, whose references name files rather than catalog entities: a Release extending a Release is documented at [`entities/release.md`](../entities/release.md#composite-release-and-extends-inheritance), and a Manifest extending a Manifest at [`entities/manifest.md`](../entities/manifest.md).
- For provider-specific source pointers (`Recipe.spec.source.chart:`, `Recipe.spec.source.modulePath:`), see the per-entity Recipe documentation. Provider source pointers are not unified under `$ref:`; the provider plugin consumes them directly.
- For OCI URI shorthand expansion rules (domain default, contextual entity expansion, resolution precedence, version handling), see [uri-grammar.md](uri-grammar.md).
