# Warnings and Linter Output

Non-fatal warnings the compiler emits during compilation. Warnings do not halt the build — they surface authoring smells, deterministic tie-breaks the compiler chose, and resources the developer's templates never consumed. Every warning carries a clear `LINT:` or `WARN:` prefix on stderr so CI pipelines can capture and re-surface them; rendered artifacts are produced regardless.

For fatal compilation halts (the diagnostics that stop a build), see [fatal-halts.md](./fatal-halts.md).

## Schema-pillar-overlap lint

**Fires when** a Component or Feature declares the same property name in both the `values:` and `infra:` pillars of its `spec.schema:` block at the same nesting depth. Schema authors who put the same field name in both pillars usually mean to put it in one or the other; the lint flags the duplication so the author can resolve which pillar owns the field.

**Pipeline placement.** The lint runs in the validation pass after schema unification, before topology construction. It walks the resolved schema (after compact-form expansion and `$ref:` resolution against SchemaLibrary entries) and reports each overlapping property as a separate warning.

**Emit shape:**

```text
LINT: Component 'core/web-server' at ./catalog/component/core/web-server.yaml declares property 'storage_size' in both values: and infra: pillars (path: spec.schema)
```

For nested properties, the warning includes the dotted path:

```text
LINT: Feature 'core/db-pool' at ./catalog/feature/core/db-pool.yaml declares property 'connection.timeout' in both values: and infra: pillars (path: spec.schema.connection)
```

**Soft-skip discipline.** The walker terminates without warning when a schema branch carries one of the JSON Schema 2020-12 escape hatches that prevent statically-derivable property sets: `$ref` (cross-document or in-document references), `patternProperties` (key-shape-based property declarations), and the composition operators `oneOf` / `anyOf` / `allOf` (disjunctions and conjunctions whose branches may declare divergent property sets). Walking these branches would either require evaluating the referenced or composed schema at lint time (a class of work the lint does not perform) or produce false positives when one branch's `values:` property name happens to collide with another branch's `infra:` property name. The lint emits no warning for the affected nesting depth; deeper levels of the same schema are still walked and lintable.

**Authoring note.** The compiler does not reject pillar-name overlaps — the lint is advisory. A Component with `storage_size` in both pillars compiles; the developer-side `values.storage_size` and the operator-side `infra.storage_size` are validated independently by their pillar schemas, and the Recipe's `valuesMapping:` template chooses which pillar's value flows into the rendered output. The lint exists because the authoring pattern is almost always a mistake; conscious cross-pillar duplication is rare enough that authors who genuinely want it can ignore the warning. For the broader cross-pillar mechanics — including the rare cases where deliberate cross-pillar piping is justified — see [vocabulary/data-pillars.md](../vocabulary/data-pillars.md) "Cross-pillar mechanics".

## Binding-map-overlap lint

**Fires when** a Manifest annotation binding declares the same dotted path in both its `maps.infra` and `maps.values` lists. The path would route through both pillars; the compiler's deterministic tie-break sends it through `infra:`, which makes the `values:` side unreachable from the Aggregate. The lint surfaces this so the author can either narrow the binding to a single pillar or accept the infra-side-only routing consciously.

**Pipeline placement.** The lint runs at workspace load, after Manifest resolution but before any annotation expansion fires. It walks every annotation binding's `maps.infra` and `maps.values` lists, computes the intersection, and emits one warning per overlapping path.

**Emit shape:**

```text
LINT: Manifest annotation binding 'compliance.aggrega.ai/data-class' on Feature 'core/data-masking' declares path 'classifier_endpoint' in both Maps.Infra and Maps.Values; the runtime deterministically routes this subkey through the infra pillar, making it Aggregate-inaccessible (side-vs-pillar enforcement halts the Aggregate side at expansion time)
```

**Deterministic tie-break.** The runtime resolves the collision by routing the path through the `infra:` pillar exclusively. The choice is consistent across builds; the author can rely on it. The `values:` side is silently dropped from the binding's effective routing — Aggregate-side annotations attempting to reach the path receive no routing target and the side-vs-pillar enforcement at expansion time halts the Aggregate side with a clear error. The lint is the early warning surface; the fatal-halt at expansion time is the runtime enforcement surface.

**Authoring note.** Like the schema-pillar-overlap lint, this lint is advisory — the binding compiles and the runtime tie-break produces deterministic output. The lint fires because the authoring pattern is almost always unintended; a binding author who genuinely wanted both pillars to route the same path would author two separate bindings with different annotation keys.

## Ghost Infrastructure Tracker warnings

**Fires when** a Recipe's template body — `valuesMapping:`, `workload:`, `artifacts:`, `provides:`, `pipeline[].with`, FeatureRecipe `injectMapping:` — references a strict subset of the keys present on the node's `.values` and `.infra` pillars. The "ghost" keys (keys the pillars carry but the template never reads) become silent infrastructure: configuration the developer asked for that the Recipe never wired into the rendered output. The tracker surfaces these so the developer can see configuration drift between intent and rendering.

**Pipeline placement.** The tracker runs in the renderer's Phase B, alongside template evaluation. Each Recipe's template AST is parsed and walked to collect the set of dot-qualified field paths it references (e.g., `.values.port`, `.infra.replicas`). The compiler compares this set against the resolved key set in the node's `.values` and `.infra` pillars; the difference is the unread set.

**Emit shape:**

```text
WARN: Component 'customer-db' (Recipe 'postgres-bitnami') — unread key: values.tls_version
WARN: Component 'customer-db' (Recipe 'postgres-bitnami') — unread key: infra.metrics.enabled
```

Each unread key emits its own warning naming the Component instance, the bound Recipe, and the dotted path to the key.

**Why a warning and not a fatal halt.** Developers may legitimately consume different `.values` subsets in conditional template logic — a Recipe whose template branches on `.values.mode` reads `mode` but conditionally reads `.values.replication_password` only when `mode == "replication"`. The static AST walk cannot tell whether an unreferenced key is a don't-care or a bug. The tracker's purpose is to make the discrepancy visible rather than to police it; silent omission is the failure mode the tracker prevents.

**Recipe-author response.** When a Recipe author sees a Ghost Infrastructure warning for a key they expected the Recipe to consume, the fix is to wire the key into the template. When the unread key is a deliberate omission (a feature the chart does not support, an authoring affordance the Recipe deliberately ignores), the author can document the omission in the Recipe's header comment so future readers know the discrepancy is intentional.

## Per-entity partial-coverage warnings

The standard library defines metadata.labels and metadata.annotations as authoring surfaces on every entity kind. Today the compiler renders these annotations through to provider output uniformly only on Components and Features; per-entity rendering coverage on Aggregate, Release, Manifest, Recipe, FeatureRecipe, Provider, SchemaLibrary, and MappingLibrary is partial — see [Status of the Language](../10-status.md) for the per-entity matrix.

When an entity-level `metadata.labels` or `metadata.annotations` declaration on an entity whose rendering coverage is partial reaches the renderer, the compiler emits a one-line warning naming the entity, the unrendered surface, and a link to the status page so the author knows the declaration was accepted by the schema but not consumed by today's rendering. The warning is informational; rendered output is produced regardless. The warning's emit shape and the per-entity coverage table track the rendering work as it lands.
