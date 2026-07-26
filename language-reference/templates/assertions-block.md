# The `assertions:` block

Component, Feature, Recipe, and FeatureRecipe carry an optional `spec.assertions:` field — a Go template body the compiler evaluates after schema validation but before rendering. The block expresses **cross-field rules** that JSON Schema cannot capture compactly: invariants involving multiple fields where no single field is "the one being validated." This page covers the authoring grammar, the evaluation phase, the template context, and the responsibility split between Component / Feature assertions (architectural invariants of the contract) and Recipe / FeatureRecipe assertions (implementation invariants of the specific provider).

For per-field constraints (range, pattern, enum, format), use JSON Schema's native keywords inside `schema:`. For per-field custom predicates, use the compact form's `validate:` field. For conditional shape, use `when:`. The `assertions:` field complements these — it is the home for genuine cross-field rules.

## Where the field appears

The four entities that may carry `assertions:`:

- **Component** — architectural invariants of the Component contract.
- **Feature** — architectural invariants of the Feature contract.
- **Recipe** — implementation invariants of the Recipe's underlying chart or module.
- **FeatureRecipe** — implementation invariants of the FeatureRecipe's underlying mechanism.

The field is optional on each. Entities without cross-field rules omit the field entirely.

## When assertions run

The assertion evaluation phases sit between schema validation and rendering in the compilation pipeline:

1. Parameter resolution, parameter validation, parameter purge.
2. Graph assembly.
3. Selector resolution: `uses:` sockets matched to provider Components.
4. Schema validation against `schema:` / `usesSchema:` / `featuresSchema:`.
5. **Component / Feature assertions** evaluated against each instance.
6. Recipe binding.
7. **Recipe / FeatureRecipe assertions** evaluated against the bound instance.
8. Rendering: mapping templates evaluated, output produced.

The two assertion phases run before any rendering — no provider plugins invoked, no charts rendered, no Compose files generated. A failing assertion halts the build immediately with the assertion's specific error message; subsequent steps do not execute.

The split between the two phases reflects the responsibility split: Component-level rules apply regardless of which Recipe binds, so they fire before binding; Recipe-level rules apply given a specific Recipe choice, so they fire after binding.

## The template context

For Component and Feature `assertions:`, the template context exposes the resolved instance state:

- `.values` — the developer's `values` content.
- `.infra` — the Ops `infra` content (from Aggregate or Release).
- `.uses` — the resolved `uses:` sockets (post-selector-resolution).
- `.features` — the resolved attachments, each carrying its `type`, `values`, `infra`, and resolved `provides`.
- `.metadata` — the entity's metadata.

For Recipe and FeatureRecipe `assertions:`, the context adds Recipe-specific fields:

- `.provides` — the values produced by the Recipe.
- `.locals` — the Recipe's locals.
- `.recipe.metadata` — the Recipe's metadata.
- `.recipe.source` — the Recipe's source pointer.

Field access uses standard Go template syntax (`.values.architecture`, `.uses.primary_db.host`); the halting construct is `{{ fail "message" }}` per the Loud Guardrails contract — a failed assertion produces a clear, specific build-time error naming the violated invariant.

For the broader template context shape and per-field availability semantics, see [template-context-contract.md](template-context-contract.md).

## Component / Feature assertions — architectural invariants

These express rules that hold regardless of which Recipe binds the Component. The rule is a property of the *contract*, not the implementation.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Component
metadata:
  name: core/datastore/mariadb
  version: 1.0.0
spec:
  schema:
    values:
      architecture: { type: string, enum: [standalone, replication], default: standalone }
      primary:
        replicaCount: { type: integer, min: 1, max: 9, default: 1 }
      secondary:
        replicaCount: { type: integer, min: 0, max: 9, default: 0 }

  assertions: |
    {{- /* Replication mode requires at least 2 secondary replicas */ -}}
    {{- if eq .values.architecture "replication" -}}
      {{- if lt .values.secondary.replicaCount 2 -}}
        {{- fail "architecture=replication requires secondary.replicaCount >= 2" -}}
      {{- end -}}
    {{- end -}}

    {{- /* Total node count limit for safe replication coordination */ -}}
    {{- $total := add .values.primary.replicaCount .values.secondary.replicaCount -}}
    {{- if gt $total 9 -}}
      {{- fail (printf "total node count must not exceed 9; got %d" $total) -}}
    {{- end -}}
```

Both rules express properties of the MariaDB contract. Whatever Recipe binds — a Bitnami chart, a hand-rolled alternative — the rules apply.

The `{{- ... -}}` whitespace control matters: assertions templates don't produce output, only side effects via `{{ fail }}`. The whitespace trim keeps the rendered template body empty in the success case.

## Recipe / FeatureRecipe assertions — implementation invariants

These express rules that hold for the *specific* chart or module the Recipe wraps. The rule is a property of the implementation, not the contract.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Recipe
metadata:
  name: bitnami/datastore/mariadb/k8s
  version: 1.0.0
spec:
  implements: core/datastore/mariadb:^1.0.0
  source:
    # Planned provider-declared form; the built-in resolver today uses { kind, url, version }.
    chart: oci://registry-1.docker.io/bitnamicharts/mariadb
    version: "20.0.0"

  valuesMapping:
    $import: BitnamiHelpers#/mappings/MariaDBBitnamiCore

  assertions: |
    {{- /* Bitnami chart 20.x requires explicit ServiceMonitor namespace
           when replication and metrics scraping are both enabled */ -}}
    {{- if and (eq .values.architecture "replication") .values.metrics.serviceMonitor.enabled -}}
      {{- if not .values.metrics.serviceMonitor.namespace -}}
        {{- fail "Bitnami MariaDB 20.x requires metrics.serviceMonitor.namespace when architecture=replication and metrics.serviceMonitor.enabled=true" -}}
      {{- end -}}
    {{- end -}}

    {{- /* ARM-node incompatibility */ -}}
    {{- if and (eq .values.primary.podAntiAffinityPreset "hard") (eq .infra.cpu_arch "arm64") -}}
      {{- fail "Bitnami MariaDB 20.x is incompatible with ARM nodes when podAntiAffinityPreset=hard; use 'soft' or omit" -}}
    {{- end -}}
```

Each rule is specific to the Bitnami chart 20.x implementation. If a different MariaDB Recipe binds — a hand-rolled chart, an alternative implementation — these rules do not apply. The Component-level rules (architecture-replication-secondary-count, total-node-count) still apply because those are properties of the contract.

## Why Component and Recipe assertions are separate

The two roles look similar (both run `{{ fail }}` halts on cross-field rules), but the responsibility split is load-bearing:

- **Component assertions are part of the contract.** When the developer authors `architecture: replication` with `secondary.replicaCount: 1`, the build refuses regardless of which Recipe binds. A future alternative Recipe doesn't change that.
- **Recipe assertions are part of the implementation.** When the architect chooses Bitnami chart 20.x as the Recipe, the chart has specific quirks (the `serviceMonitor.namespace` requirement, the ARM-node bug). These don't apply to a different chart.

Co-locating both rule types on the Component would entangle the contract with its implementations: the Component would need to reference its bound Recipe to know which implementation rules to enforce, breaking the Component-Recipe separation. Splitting the rules to their natural location keeps the responsibility model clean. The runtime cost of splitting is negligible; both phases run pre-rendering and produce identical Loud Guardrails errors.

## The `fail` message convention

The argument to `{{ fail "..." }}` is the user-facing build-time error. Conventions:

- **Name the constraint** — "architecture=replication requires secondary.replicaCount >= 2".
- **Name the value when relevant** — "total node count must not exceed 9; got 12".
- **Suggest the fix when possible** — "use 'soft' or omit the field".
- **Avoid jargon** — the reader is the developer who authored the Aggregate, not the architect who wrote the assertion.

For long or value-bearing messages, use `printf`:

```yaml
{{- fail (printf "field %s exceeds limit: got %d, max is %d" .field .value .max) -}}
```

The compiler surfaces the message in the Loud Guardrails error format with the entity name, the assertion source location, and the failing message. The diagnostic is specific enough for the developer to identify and fix the root cause.

## What `assertions:` does not replace

`assertions:` is the cross-field rule home. It does not replace:

- **JSON Schema constraints inside `schema:`** — per-field rules (range, pattern, enum, format, type) belong in JSON Schema's native keywords.
- **The compact-form `validate:` field** — per-field custom predicates with single-field scope. Use `validate:` when the rule applies to a specific field; use `assertions:` when the rule involves multiple fields where no single field is "the one being validated."
- **The compact-form `when:` field** — conditional *shape* (whether a subtree's constraints apply). Use `when:` for shape variation; use `assertions:` when the *combination of values* is invalid in a way better expressed as a free-form predicate.
- **Runtime checks** — `assertions:` runs at compile time only. Anything depending on runtime cluster state (live IPs, vault contents, runtime pod status) must be expressed as deterministic pointer strings (see the AOT-purity contract).

## Worked examples

### Minimal — single architectural rule

```yaml
spec:
  assertions: |
    {{- if and (eq .values.architecture "replication") (lt .values.secondary.replicaCount 2) -}}
      {{- fail "replication requires secondary.replicaCount >= 2" -}}
    {{- end -}}
```

### Mid-size — multi-rule Component contract

```yaml
spec:
  assertions: |
    {{- /* Replication minimum */ -}}
    {{- if eq .values.architecture "replication" -}}
      {{- if lt .values.secondary.replicaCount 2 -}}
        {{- fail "architecture=replication requires secondary.replicaCount >= 2" -}}
      {{- end -}}
    {{- end -}}

    {{- /* Total node limit */ -}}
    {{- $total := add .values.primary.replicaCount .values.secondary.replicaCount -}}
    {{- if gt $total 9 -}}
      {{- fail (printf "total node count exceeds 9: got %d (primary=%d, secondary=%d)"
                       $total .values.primary.replicaCount .values.secondary.replicaCount) -}}
    {{- end -}}

    {{- /* Backup requires schedule when enabled */ -}}
    {{- if and .values.backup.enabled (not .values.backup.schedule) -}}
      {{- fail "backup.schedule must be specified when backup.enabled=true" -}}
    {{- end -}}
```

### Production — Recipe with implementation rules

```yaml
spec:
  assertions: |
    {{- /* Bitnami 20.x: serviceMonitor namespace requirement */ -}}
    {{- if and (eq .values.architecture "replication") .values.metrics.serviceMonitor.enabled -}}
      {{- if not .values.metrics.serviceMonitor.namespace -}}
        {{- fail "Bitnami MariaDB 20.x requires metrics.serviceMonitor.namespace when architecture=replication and metrics.serviceMonitor.enabled=true" -}}
      {{- end -}}
    {{- end -}}

    {{- /* TLS certificate consistency */ -}}
    {{- if .values.tls.enabled -}}
      {{- if not (and .values.tls.certFilename .values.tls.certKeyFilename) -}}
        {{- fail "tls.enabled=true requires both tls.certFilename and tls.certKeyFilename" -}}
      {{- end -}}
    {{- end -}}

    {{- /* Replication-mode storage class consistency */ -}}
    {{- if eq .values.architecture "replication" -}}
      {{- $primaryClass := .values.primary.persistence.storageClass -}}
      {{- $secondaryClass := .values.secondary.persistence.storageClass -}}
      {{- if and $primaryClass $secondaryClass (ne $primaryClass $secondaryClass) -}}
        {{- fail "replication mode requires primary and secondary to use the same storageClass" -}}
      {{- end -}}
    {{- end -}}
```

## Tooling integration

- `aggrega build` evaluates assertions between schema validation and rendering; a failing assertion halts the build with the assertion's `{{ fail }}` message.
- `aggrega validate` applies the same correctness ahead of render without writing artifacts — for a Recipe it drives the real compilation pipeline around a synthesized minimal deployment, so a malformed assertion template or an assertion that references an unknown field surfaces as a correctness error. (`aggrega lint` covers publishing conventions, not assertion correctness.)
- IDEs with Sprig-template support highlight `.values.X` references; hover documentation resolves to the schema definition when the IDE integration is configured.
