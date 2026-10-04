# The `assertions:` block

Component, Feature, Recipe, and FeatureRecipe carry an optional `spec.assertions:` field — a map of **named** rules the compiler evaluates after schema validation but before rendering. Each key is a rule identifier that appears in the failure message; each value is a Go template body. A single template body written directly under `assertions:` is not the field's shape and is rejected when the entity is read, so every rule is authored under a name of its own. The block expresses **cross-field rules** that JSON Schema cannot capture compactly: invariants involving multiple fields where no single field is "the one being validated." This page covers the authoring grammar, the evaluation phase, the template context, and the responsibility split between Component / Feature assertions (architectural invariants of the contract) and Recipe / FeatureRecipe assertions (implementation invariants of the specific provider).

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

1. Parameter resolution, parameter validation, parameter interpolation.
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
- `.uses` — the resolved `uses:` connections (post-selector-resolution), in the shape the author writes them: keyed by **socket name**, and under each socket by the **alias** of every connection on it — the name the author gave the connection under the socket, or, for a connection written as a list entry, its target. Each connection's entry describes the connection itself and carries nothing its target published — `target` is the resolved target's instance id, `alias` repeats the name it is keyed by, and `origin_feature` is present when a Feature attachment drew the connection. So `.uses.<socket>.<alias>.target` reads one connection's resolved target, a socket holding several connections holds an entry for each, and a reference reaching through this map for a value the target published halts, because the entry carries no such field.
- `.features` — the resolved attachments, keyed by the instance name the author gave each one. Each entry carries `type` (the attached Feature's catalog URI), `resolved_version` (the version bound for this build), and `values` (the attachment's own developer-intent content). An attachment written on one of the component's connections is not among them, exactly as it is not among a Recipe template's `.features`, and `.uses` carries no attachment either.
- `.metadata` — the entity's metadata.

For Recipe and FeatureRecipe `assertions:`, the context adds Recipe-specific fields:

- `.provides` — the resolved `provides:` values of the component being evaluated, already computed by the time the assertion runs. A *target's* published values are not on this surface; they reach a caller in the render context instead.
- `.locals` — the Recipe's locals.
- `.recipe.metadata` — the Recipe's metadata.
- `.recipe.source` — the Recipe's source pointer.

Field access uses standard Go template syntax (`.values.architecture`, `.uses.databases.primary.target`); the halting construct is `{{ fail "message" }}` per the Loud Guardrails contract — a failed assertion produces a clear, specific build-time error naming the violated invariant.

**This surface evaluates with `missingkey=error`.** A reference to a key the context does not carry halts the build — naming the entity, the instance, the assertion and the absent key — rather than rendering as nothing. That strictness is what makes an assertion trustworthy: a predicate whose reference rendered empty would compare against nothing and pass, so a single typo would quietly retire the rule the assertion was written to enforce. It also means the bare reference resolves before any fallback can run, so an optional field needs a presence-aware form; [errors/fatal-halts.md](../errors/fatal-halts.md) carries the per-surface missing-key policy and the forms that work under it.

**Reading the connections on a socket.** A socket's entry has one shape whatever it holds: one entry per connection, under its alias. An assertion reads one connection by its alias, counts or ranges the socket to see every connection on it, and tests the socket's own key to ask whether it is wired at all. Given a component whose Aggregate entry writes

```yaml
uses:
  models:
    local: { target: llama }
    fast: { target: turbo }
```

these assertions read it each way:

```yaml
assertions:
  # The socket's presence: the socket key alone, however many connections it holds.
  models-wired: |
    {{- if not (hasKey .uses "models") -}}
      {{- fail "wire at least one model to the models socket" -}}
    {{- end -}}
  # Every connection on the socket: a range visits each one.
  every-model-distinct: |
    {{- $seen := list -}}
    {{- range $alias, $connection := (optional .uses "models" dict) -}}
      {{- if has $connection.target $seen -}}
        {{- fail (printf "connection %s points at %s, which another models connection already points at" $alias $connection.target) -}}
      {{- end -}}
      {{- $seen = append $seen $connection.target -}}
    {{- end -}}
  # One connection, by the alias it was written under; guarded, because the
  # connection is optional.
  fast-is-not-local: |
    {{- with (optional .uses "models" dict) -}}
      {{- if and (hasKey . "fast") (hasKey . "local") (eq .fast.target .local.target) -}}
        {{- fail (printf "the fast and local connections both point at %s" .local.target) -}}
      {{- end -}}
    {{- end -}}
```

A range visits a socket's connections in alphabetical order of their aliases — `fast` before `local` here — not in the order the Aggregate wrote them. A socket holding a single connection is read the same way: `.uses.models.local.target` reads `llama` whether or not `fast` is wired beside it, and `.uses.models.target` addresses no connection and halts.

**An assertion's `.uses` is not a Recipe template's `.context.uses`, and a reference written for one does not transfer to the other.** The render context carries a richer projection of the same edges: keyed by **alias** alone, with the socket name as a field on the entry, and with each target's published values nested under `provides` — so a Recipe template reads `.context.uses.<alias>.provides.<name>` where an assertion reads `.uses.<socket>.<alias>.target`. Both assertion phases evaluate before rendering, which is why an assertion's view of an edge stops at the edge's own identity.

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

  assertions:
    # Replication mode requires at least 2 secondary replicas.
    replication-needs-two-secondaries: |
      {{- if eq .values.architecture "replication" -}}
        {{- if lt .values.secondary.replicaCount 2 -}}
          {{- fail "architecture=replication requires secondary.replicaCount >= 2" -}}
        {{- end -}}
      {{- end -}}

    # Total node count limit for safe replication coordination.
    total-node-count-within-cap: |
      {{- $total := add .values.primary.replicaCount .values.secondary.replicaCount -}}
      {{- if gt $total 9 -}}
        {{- fail (printf "total node count must not exceed 9; got %d" $total) -}}
      {{- end -}}
```

Both rules express properties of the MariaDB contract. Whatever Recipe binds — a Bitnami chart, a hand-rolled alternative — the rules apply.

The `{{- ... -}}` whitespace control matters: assertions templates don't produce output, only side effects via `{{ fail }}`. The whitespace trim keeps the rendered template body empty in the success case.

## Recipe / FeatureRecipe assertions — implementation invariants

These express rules that hold for the *specific* chart or module the Recipe sources. The rule is a property of the implementation, not the contract.

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

  assertions:
    # Bitnami chart 20.x requires an explicit ServiceMonitor namespace when
    # replication and metrics scraping are both enabled.
    service-monitor-namespace-required: |
      {{- if and (eq .values.architecture "replication") .values.metrics.serviceMonitor.enabled -}}
        {{- if not .values.metrics.serviceMonitor.namespace -}}
          {{- fail "Bitnami MariaDB 20.x requires metrics.serviceMonitor.namespace when architecture=replication and metrics.serviceMonitor.enabled=true" -}}
        {{- end -}}
      {{- end -}}

    # ARM-node incompatibility.
    arm-rejects-hard-anti-affinity: |
      {{- if and (eq .values.primary.podAntiAffinityPreset "hard") (eq .infra.cpu_arch "arm64") -}}
        {{- fail "Bitnami MariaDB 20.x is incompatible with ARM nodes when podAntiAffinityPreset=hard; use 'soft' or omit" -}}
      {{- end -}}
```

Each rule is specific to the Bitnami chart 20.x implementation. If a different MariaDB Recipe binds — a hand-rolled chart, an alternative implementation — these rules do not apply. The Component-level rules (`replication-needs-two-secondaries`, `total-node-count-within-cap`) still apply because those are properties of the contract.

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
  assertions:
    replication-needs-two-secondaries: |
      {{- if and (eq .values.architecture "replication") (lt .values.secondary.replicaCount 2) -}}
        {{- fail "replication requires secondary.replicaCount >= 2" -}}
      {{- end -}}
```

### Mid-size — multi-rule Component contract

```yaml
spec:
  assertions:
    # Replication minimum.
    replication-needs-two-secondaries: |
      {{- if eq .values.architecture "replication" -}}
        {{- if lt .values.secondary.replicaCount 2 -}}
          {{- fail "architecture=replication requires secondary.replicaCount >= 2" -}}
        {{- end -}}
      {{- end -}}

    # Total node limit.
    total-node-count-within-cap: |
      {{- $total := add .values.primary.replicaCount .values.secondary.replicaCount -}}
      {{- if gt $total 9 -}}
        {{- fail (printf "total node count exceeds 9: got %d (primary=%d, secondary=%d)"
                         $total .values.primary.replicaCount .values.secondary.replicaCount) -}}
      {{- end -}}

    # Backup requires a schedule when enabled.
    backup-needs-schedule: |
      {{- if and .values.backup.enabled (not .values.backup.schedule) -}}
        {{- fail "backup.schedule must be specified when backup.enabled=true" -}}
      {{- end -}}
```

### Production — Recipe with implementation rules

```yaml
spec:
  assertions:
    # Bitnami 20.x: serviceMonitor namespace requirement.
    service-monitor-namespace-required: |
      {{- if and (eq .values.architecture "replication") .values.metrics.serviceMonitor.enabled -}}
        {{- if not .values.metrics.serviceMonitor.namespace -}}
          {{- fail "Bitnami MariaDB 20.x requires metrics.serviceMonitor.namespace when architecture=replication and metrics.serviceMonitor.enabled=true" -}}
        {{- end -}}
      {{- end -}}

    # TLS certificate consistency.
    tls-needs-both-certificate-files: |
      {{- if .values.tls.enabled -}}
        {{- if not (and .values.tls.certFilename .values.tls.certKeyFilename) -}}
          {{- fail "tls.enabled=true requires both tls.certFilename and tls.certKeyFilename" -}}
        {{- end -}}
      {{- end -}}

    # Replication-mode storage class consistency.
    replication-needs-one-storage-class: |
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
- `aggrega validate` applies the same correctness ahead of render without writing artifacts — for a Recipe it drives the real compilation pipeline around a synthesized minimal Aggregate, Manifest and Release, so a malformed assertion template or an assertion that references an unknown field surfaces as a correctness error. (`aggrega lint` covers publishing conventions, not assertion correctness.)
- IDEs with Sprig-template support highlight `.values.X` references; hover documentation resolves to the schema definition when the IDE integration is configured.
