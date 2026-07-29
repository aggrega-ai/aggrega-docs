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

## Attachment-slot near-miss lint

**Fires when** a component instance attaches a Feature under a name that is not one of its Component type's declared `featuresSchema` slots, but is within one edit of one — a single inserted, deleted, or substituted character, or two adjacent characters swapped. That is the shape a slot-name typo takes, and the lint names both spellings so the author can see the pair.

**Why it exists.** Declaring a slot does not close the attachment surface: an attachment under a name no slot declares is legal, because that openness is what lets one catalog entity serve both a slot-filled attachment and a credential shared at a broader scope. The cost is that a misspelled slot name is silently a *free attachment* rather than a fill of the slot the author meant — the build succeeds and the slot simply stays empty. The lint is the disclosed mitigation for exactly that case.

**Pipeline placement.** The lint runs at resolution, in the same pass as the catalog-aware semantic guards, over the resolved Aggregate. It walks every component instance's attachment names against the declared slot names of that instance's Component type, and emits one warning per near-miss pair.

**Emit shape:**

```text
LINT: Aggregate 'nearmiss' at .spec.components["db"].features["app_user_passwrod"]: attachment "app_user_passwrod" on component "db" is not a declared slot of type "core/datastore/postgres", but the type declares the slot "app_user_password" — if "app_user_password" was meant, the attachment is currently a free attachment and does not fill it
```

**Editor visibility.** The warning also reaches editor diagnostics through the language server, at warning severity, positioned on the offending authoring site. An author who never reads terminal output still sees the pair.

**Threshold and its trade-off.** The lint pairs names only at one edit's distance, and only when both names are at least four characters long. Below that length nearly every short name sits within one edit of every other, so pairing them would produce noise rather than signal; above one edit the pairs stop resembling typos. A transposition counts as one edit rather than two, because a swapped pair of characters is the commonest slip and a stricter count would miss it.

**Authoring note.** The lint is advisory and never changes the build's verdict — the compiler does not police what an author names an attachment. An author who deliberately attaches a Feature under a name that resembles a slot (a second, differently-configured credential named alongside the slot it complements) can ignore the warning; the attachment behaves exactly as authored.

## Ghost Infrastructure Tracker warnings

**Fires when** a Recipe's template body — `valuesMapping:`, `workload:`, `artifacts:`, `provides:`, `pipeline[].with`, FeatureRecipe `injectMapping:` — references a strict subset of the keys present on the node's `.values` and `.infra` pillars. The "ghost" keys (keys the pillars carry but the template never reads) become silent infrastructure: configuration the developer asked for that the Recipe never wired into the rendered output. The tracker surfaces these so the developer can see configuration drift between intent and rendering.

**Pipeline placement.** The tracker runs at base rendering, alongside template evaluation. Each Recipe's template AST is parsed and walked to collect the set of dot-qualified field paths it references (e.g., `.values.port`, `.infra.replicas`). The compiler compares this set against the resolved key set in the node's `.values` and `.infra` pillars; the difference is the unread set.

**Emit shape:**

```text
WARN: Component 'customer-db' (Recipe 'postgres') — unread key: values.tls_version
WARN: Component 'customer-db' (Recipe 'postgres') — unread key: infra.metrics.enabled
```

Each unread key emits its own warning naming the Component instance, the bound Recipe, and the dotted path to the key.

**Why a warning and not a fatal halt.** Developers may legitimately consume different `.values` subsets in conditional template logic — a Recipe whose template branches on `.values.mode` reads `mode` but conditionally reads `.values.replication_password` only when `mode == "replication"`. The static AST walk cannot tell whether an unreferenced key is a don't-care or a bug. The tracker's purpose is to make the discrepancy visible rather than to police it; silent omission is the failure mode the tracker prevents.

**Recipe-author response.** When a Recipe author sees a Ghost Infrastructure warning for a key they expected the Recipe to consume, the fix is to wire the key into the template. When the unread key is a deliberate omission (a feature the chart does not support, an authoring affordance the Recipe deliberately ignores), the author can document the omission in the Recipe's header comment so future readers know the discrepancy is intentional.

## Per-entity partial-coverage warnings

The standard library defines metadata.labels and metadata.annotations as authoring surfaces on every entity kind. Today the compiler renders these annotations through to provider output uniformly only on Components and Features; per-entity rendering coverage on Aggregate, Release, Manifest, Recipe, FeatureRecipe, Plugin, SchemaLibrary, and MappingLibrary is partial — see [Status of the Language](../10-status.md) for the per-entity matrix.

When an entity-level `metadata.labels` or `metadata.annotations` declaration on an entity whose rendering coverage is partial reaches the renderer, the compiler emits a one-line warning naming the entity, the unrendered surface, and a link to the status page so the author knows the declaration was accepted by the schema but not consumed by today's rendering. The warning is informational; rendered output is produced regardless. The warning's emit shape and the per-entity coverage table track the rendering work as it lands.

## Unsupported-field warnings

Targets differ in fidelity. A Workload field that one target expresses natively may have no equivalent on another — Docker Compose has no notion of a scheduling constraint, a service account, or a priority class, for instance. When a Workload declares such a field and the target cannot express it, the field is **omitted with a warning**, one warning per authored field. It is neither dropped silently nor treated as a fatal error.

The distinction from a fatal halt is the granularity. An unsupported *form* halts the build loudly — the target cannot produce that shape of workload at all. A supported form that carries an *unexpressible field* renders, minus that field, and says so.

On the compose target the class currently covers `scheduling`, `serviceAccount`, `replicas`, `runtimeClassName`, `priorityClassName`, `imagePullSecrets`, `dnsPolicy`, `dnsConfig.options`, container `runAsNonRoot`, and extended-resource keys such as `nvidia.com/gpu`. Two cases emit a partial variant of the same class, where the field is reduced rather than removed:

- `persistentTemplate` — per-replica volume templating is unavailable, so the volume collapses to a single shared persistent volume rather than disappearing.
- A container `attachments` entry with `as: env` — compose cannot source an environment variable from an attachment, so the variable is emitted with an empty value. The warning names the entry at its authored coordinate (`containers.<name>.attachments.<KEY>`, or `initContainers[<i>].attachments.<KEY>` for a positional init entry), so it is clear which variable arrives empty and which container it belongs to. An entry with `as: file` is bind-mounted normally and raises nothing.

Each warning carries the stable, machine-matchable class code `unsupported-field`, so tooling can match the class rather than parse the message text. Both the omitted-outright and the reduced-form variants carry that one code, which is what lets a single filter suppress the whole class. The warnings travel out-of-band from the rendered artifacts, which means **rendered bytes are byte-identical whether or not the warnings surface** — suppressing them cannot change your output.

### Suppressing the class

Both commands that render accept `--no-unsupported-field-warnings`, which silences this class alone while every other render warning still surfaces:

```bash
aggrega build --release release.yaml --no-unsupported-field-warnings
aggrega validate ./catalog/recipe/compose/mariadb/1.0.0/recipe.yaml --no-unsupported-field-warnings
```

The flag is display-only and does not change the rendered output. `aggrega lint` has no equivalent flag because it runs no render pass — it checks publishing conventions only, so no render warning can arise there.

Reach for the flag when you have accepted the reduced fidelity deliberately — a compose target used for local development, where the production Workload's scheduling and service-account fields are expected to be inert. Leave it off otherwise: the warning is how you learn that a field you authored is not reaching the target.
