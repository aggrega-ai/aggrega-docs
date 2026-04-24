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

*Typed parameter contracts — declaring `type`, `description`, `default`, `enum`, and `min`/`max` constraints per parameter key to validate values before interpolation — are under active development. Today `parameters` are simple string-valued keys; type validation errors surface during CUE validation of the component `values` they flow into, rather than at the parameter-contract level. The typed form will enable earlier diagnostics when it ships.*
