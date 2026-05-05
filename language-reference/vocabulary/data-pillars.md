# values, infra, parameters, locals

The conceptual framing of the five DSL structural keywords — `parameters`, `values`, `uses`, `infra`, `inject` — lives in [architecture/06-data-taxonomy-and-composition.md](../../architecture/06-data-taxonomy-and-composition.md). This page covers the four data pillars (`values`, `infra`, `parameters`, `locals`) that carry user-authored or Recipe-computed data payloads. The complementary topology triad (`provides`, `inject`, `uses`) — the keywords that wire graph edges rather than carry data — lives in [topology-triad.md](topology-triad.md).

*Coverage note: this page currently documents `parameters` in full. Authoring details for `values`, `infra`, and `locals` are tracked for later migration.*

## Parameters

Both the `Aggregate` and `Release` schemas carry a `parameters` dictionary at their root. Developers declare the keys the Aggregate expects; Ops fills the values from environment-specific Release files. This decoupling is the mechanism for GitOps promotion: a single immutable `Aggregate.yaml` moves through Dev, Staging, and Production environments, with each environment's Release supplying its own parameter values.

```yaml
# aggregate.yaml
spec:
  parameters:
    corp_db_name: ""
    env_workers: ""
    region: ""
    enable_debug: ""
  components:
    my-backend:
      type: core/python-worker:1.0.0
      values:
        workers: "{{ .parameters.env_workers }}"
        region: "{{ .parameters.region }}"
```

```yaml
# release-prod.yaml
spec:
  aggregate: my-app
  manifest: prod-manifest
  parameters:
    corp_db_name: "enterprise_data"
    env_workers: "10"
    region: "eu-west-1"
    enable_debug: "false"
  parametersFrom:
    - "./prod-values.yaml"    # Deep-merged into the parameters map
```

**Parameter lifecycle.** The compiler interpolates parameters into the Aggregate's YAML strings during Step 1 (before CUE validation runs), then purges them from the in-memory context. Parameters do not persist as a live pillar through the compilation pipeline; they exist only as raw YAML template strings (`{{ .parameters.X }}`) at authoring time and as resolved string values during Step 1 interpolation.

### The parameter-hoisting checklist

Every cross-environment value flows through four authoring touchpoints in sequence. The mental model authors carry: for any value that varies between Dev / Staging / Production, expect to touch the Aggregate (declare), the values template (reference), the Release (fulfill), and the Recipe template (consume).

| Step | Surface | Action |
| --- | --- | --- |
| 1 | Aggregate `spec.parameters.<name>` | **Declare** the parameter as part of the Aggregate's typed authoring contract. Today the value is a string-valued slot; the typed-parameters extension under development will add `type` / `description` / `default` / `enum` / range constraints per slot. |
| 2 | Component `values:` template inside the same Aggregate | **Reference** the parameter via `{{ .parameters.<name> }}` from inside the `values:` block of any component (or feature, or sub-aggregate) that consumes it. The reference is a Go template expression — the compiler evaluates it during Step 1 interpolation. |
| 3 | Release `spec.parameters.<name>` (or `parametersFrom:` external file) | **Fulfill** the parameter with the environment-specific value at the Release surface. Per-environment Release files supply different values for the same parameter key without modifying the Aggregate. |
| 4 | Recipe `valuesMapping:` template | **Consume** the resolved value via `{{ .values.<key> }}` — the Recipe sees the post-interpolation `values:` dictionary and never sees `.parameters` directly. The `parameters` pillar is purged after Step 1; only the resolved values dictionary flows through to Step 5 rendering. |

The four touchpoints are sequential and load-bearing: skipping the Aggregate declaration leaves the Release with no slot to fulfill; skipping the values reference leaves the Recipe with no value to consume; skipping the Release fulfilment leaves the parameter empty. The compiler validates the chain across Step 1 (interpolation) and downstream CUE validation of the resulting `values:` dictionary; mismatches surface as either an unfilled-template error or a CUE constraint violation against the typed values schema.

The pattern is the canonical mechanism for GitOps promotion: a single immutable Aggregate moves through environments with each environment's Release supplying its own parameter values. Every per-environment value an author wants to vary belongs in the parameter chain rather than embedded directly in the Aggregate.

*Typed parameter contracts — declaring `type`, `description`, `default`, `enum`, and `min`/`max` constraints per parameter key to validate values before interpolation — are under active development. Today `parameters` are simple string-valued keys; type validation errors surface during CUE validation of the component `values` they flow into, rather than at the parameter-contract level. The typed form will enable earlier diagnostics when it ships.*
