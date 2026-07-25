# Well-Known Annotations

Provider engines read specific boundary annotations from the Release to configure platform-specific deployment context. The compiler itself is blind to these annotations — it passes them through as opaque strings. Each provider documents which annotations it reads and what defaults it applies when the annotation is absent. A provider-rendering Plugin declares the annotation vocabulary it recognises on its `spec.provider.wellKnownAnnotations`, and the `aggrega inspect` surface renders that declaration for catalog readers. The declaration is the reserved vocabulary; the matrix in this chapter states which of those keys a provider actually reads today and which are reserved for future use.

## The Invariants

1. The compiler never reads or validates provider well-known annotations.
2. Each provider documents which annotations it reads and what defaults it applies.
3. Annotations apply uniformly within a boundary. If a value varies per component, it belongs in component-level annotations (overriding boundary annotations) or in component `infra`.
4. Provider well-known annotations never duplicate component labels. Component labels describe *what a component is*. Boundary annotations describe *where a component deploys*.
5. Recipes do not handle provider well-known annotations. The provider engine applies placement context (namespace, registry prefix, service account) automatically after the Recipe produces its content.
6. The `aggrega.ai/` prefix is reserved for the standard library. Custom enterprise annotations use their own prefix.
7. Component-level annotations in the Release override boundary-level annotations (deep-merge, component wins). Where a provider assembles the output of several boundaries into one artifact, it may require an annotation to resolve uniformly across them — the `helm-chart` provider takes the umbrella chart's name from `aggrega.ai/chart-name`, and when more than one boundary contributes to the same chart and they resolve that annotation to different values, the build halts naming the disagreeing boundaries, because one chart cannot carry two names.

## The Complete Annotation Matrix

### Category 1 — Placement

| Annotation | Consumed By | Purpose | Default |
| --- | --- | --- | --- |
| `aggrega.ai/namespace` | `helm`, `compose` | Kubernetes namespace (helm); per-boundary Docker network name (compose) | Not injected if absent (helm); network derived from the boundary path (compose) |
| `aggrega.ai/project-name` | not yet consumed | Reserved for a Docker Compose project name | — |

`aggrega.ai/namespace` is dual-purpose by design. It expresses the same logical-isolation intent — *"this boundary's resources live in their own addressable scope"* — in each target's native form: a Kubernetes `metadata.namespace` for helm, a Docker network name for compose. Recipe authors set one annotation; each provider materialises it appropriately for the target. For the compose case, the network name is resolved per node in three branches: a non-empty annotation value is sanitised (lowercased, with non-`[a-z0-9._-]` characters replaced by `_`); otherwise, when the boundary path is empty, the network is named `default`; otherwise the sanitised boundary path is used.

### Category 2 — Registry

| Annotation | Consumed By | Purpose | Default |
| --- | --- | --- | --- |
| `aggrega.ai/image-registry` | `helm`, `compose` | Registry prefix for container images, applied to every synthesised container image reference | No prefix |
| `aggrega.ai/image-pull-secret` | `helm` | Kubernetes `imagePullSecrets` name, unioned into the synthesised pod's existing entries | None |

### Category 3 — Networking

| Annotation | Consumed By | Purpose | Default |
| --- | --- | --- | --- |
| `aggrega.ai/cluster-domain` | not yet consumed | Reserved for a DNS suffix for cross-namespace service discovery | — |
| `aggrega.ai/ingress-class` | not yet consumed | Reserved for a Kubernetes IngressClass on Ingress resources | — |
| `aggrega.ai/service-mesh` | not yet consumed | Reserved for mesh sidecar injection annotations | — |

### Category 4 — Security

| Annotation | Consumed By | Purpose | Default |
| --- | --- | --- | --- |
| `aggrega.ai/service-account` | `helm` | Kubernetes `ServiceAccount` for synthesised Pods; overrides the Recipe's `workload.serviceAccount` when both are set | The Recipe's `workload.serviceAccount`, or unset when the Recipe declares none |
| `aggrega.ai/pod-security-standard` | not yet consumed | Reserved for a Pod Security Standards level | — |

### Category 5 — Packaging

| Annotation | Consumed By | Purpose | Default |
| --- | --- | --- | --- |
| `aggrega.ai/chart-name` | `helm-chart` | Umbrella chart name | Aggregate name and boundary name joined, or the boundary name alone when the Aggregate is unnamed |
| `aggrega.ai/chart-version` | not yet consumed | Reserved for a Helm chart version | — |

### Category 6 — Cloud target

| Annotation | Consumed By | Purpose | Default |
| --- | --- | --- | --- |
| `aggrega.ai/aws-account` | `cloudformation` | AWS account the stack (boundary) deploys into | Same-account — a cross-stack reference resolves through a same-account stack-export import |
| `aggrega.ai/aws-region` | `cloudformation` | AWS region the stack (boundary) deploys into | Same-region — a cross-stack reference resolves through a same-region stack-export import |
| `aggrega.ai/aws-assume-role-arn` | `cloudformation` | IAM role ARN a cross-account stack read assumes to reach a peer stack's exported values | No role is supplied on a cross-account reference |

Each CloudFormation boundary renders into one stack. When a `uses` edge crosses
from one boundary to another, the `cloudformation` engine needs to know where the
peer stack lives to shape the reference: two stacks in the same account and region
exchange values through a stack export and import; a peer in a different account or
region needs a cross-account stack-output read, optionally under an assumed role.
These annotations carry that placement context. They are opaque scalar pointer
strings — the engine pipes them into the reference it builds and never resolves
them against live AWS state; the account, region, and role are supplied by the
Release, and the runtime environment resolves the final physical read. When every
annotation is absent, the engine treats the peer as same-account and same-region
and supplies no role.

### Reserved names no provider reads yet

Six keys in the matrix above are marked *not yet consumed*:
`aggrega.ai/project-name`, `aggrega.ai/cluster-domain`,
`aggrega.ai/ingress-class`, `aggrega.ai/service-mesh`,
`aggrega.ai/pod-security-standard`, and `aggrega.ai/chart-version`.

Setting one of these on a Release today has **no effect on rendered output**. No
provider engine reads them, and no default is applied on their behalf — in
particular, no DNS suffix is applied for `aggrega.ai/cluster-domain`, so a Recipe
that needs a cluster domain must supply it as an ordinary value rather than rely
on this annotation. A Recipe author who needs one of these behaviours today
expresses it as a Recipe value or a component `infra` field.

The names remain listed because the `aggrega.ai/` prefix is reserved: an
enterprise catalog must not reuse one of these keys for its own meaning, because
doing so would collide when the annotation becomes live. Each key is also carried
in the reserved-prefix set the publishing lint checks, so authoring one does not
trip the "do not use the bare `aggrega.ai/` prefix" rule.

The umbrella chart version a `helm-chart` boundary emits is currently always
`0.1.0`; it is a fixed value rather than an `aggrega.ai/chart-version` default.

> Note: Manifest `features.annotations` bindings using the `aggrega.ai/`
> prefix are rejected at load time; the prefix is reserved exclusively
> for the provider well-known annotations documented in this chapter.
> Authors of annotation-driven Feature bindings use `feature.aggrega.ai/`
> for standard-library shortcuts or a custom domain for enterprise
> shortcuts.
>
> Note: explicit `null` on a Release annotation removes the inherited
> binding from the overriding boundary or component (annotation-driven
> Feature opt-out). Sibling components in the same boundary that did
> not opt out retain the inherited binding; absent keys continue to
> inherit from the parent cascade as normal.

## Provenance labels emitted by providers

The annotations above flow *into* the build — the Release authors them, providers consume them. Providers also emit a parallel set of labels *out of* the build, attaching them to the rendered output so downstream tooling can attribute runtime resources back to the catalog content that produced them. These provenance labels are not authored on the Release; they are derived from the build's own state (Recipe identity, boundary path, aggregate name, environment, sync wave, compiler version) and emitted by the provider at render time.

The shipping emit set, attached to every rendered Kubernetes manifest by helm and helm-chart, and to every emitted service by compose:

| Label | Source | Emission |
| --- | --- | --- |
| `app.kubernetes.io/name` | Node ID (or sanitised label-component identifier for FeatureRecipe-emitted resources) | helm and helm-chart only — Kubernetes-standard label, not emitted on compose services |
| `aggrega.ai/component-id` | Node ID (or sanitised label-component identifier for FeatureRecipe-emitted resources) | All three engines |
| `aggrega.ai/recipe-uri` | `<recipe-name>:<recipe-version>` of the producing Recipe (or producing FeatureRecipe for FR-emitted resources) | All three engines, when the producing entity has both name and version set |
| `aggrega.ai/boundary-path` | Boundary path the component was routed into | All three engines, when the boundary path is non-empty |
| `aggrega.ai/aggregate-name` | Aggregate `metadata.name` | All three engines, when set |
| `aggrega.ai/compiler-version` | Compiler version stamped at build time | All three engines, when set |
| `aggrega.ai/environment` | Release `metadata.environment` | All three engines, when the Release sets it |
| `aggrega.ai/sync-wave` | Per-boundary `syncWave` integer | All three engines, when non-zero |

### Per-engine emission notes

- **`helm`** — labels land in `metadata.labels` on every rendered Kubernetes resource (Deployment, Service, PVC, etc.). Both sourced-mode (Helm SDK render with post-render label injection) and synthesised-mode (workload synthesis) paths produce the same set.
- **`helm-chart`** — labels land in `metadata.labels` on every sub-chart resource via the same label-injection mechanism as helm.
- **`compose`** — labels land in `services.<name>.labels` on every emitted compose service. Sourced-mode (post-merge label injection on the merged base + valuesMapping document) and synthesised-mode (workload synthesis directly setting the service's labels block) both produce the same set. The Kubernetes-specific `app.kubernetes.io/name` is omitted from compose output.

For resources emitted by a boundary-scope FeatureRecipe (the `compose-bridge` gateway service is the canonical example), the `aggrega.ai/component-id` value carries a sanitised form of the FR-instance attachment identifier rather than a regular component name; the value remains a valid Kubernetes label string in all cases. The `aggrega.ai/recipe-uri` resolves to the FeatureRecipe's own `name:version`, not the consuming Recipe's identity — downstream tooling reading the label to identify the producing entity gets the correct provenance for both component-emitted and FR-emitted output.

## Sync-wave annotations

The `aggrega.ai/sync-wave` label above is paired with a sync-wave annotation that downstream tooling consumes for deployment ordering. The label exposes the wave value for selector queries; the annotation surfaces the value where each tool conventionally reads it.

| Annotation | Emission | Consumed by |
| --- | --- | --- |
| `argocd.argoproj.io/sync-wave` | helm and helm-chart, on every Kubernetes resource where `syncWave` is non-zero on the contributing boundary | ArgoCD's sync-wave ordering |
| `helm.sh/hook-weight` | helm only, on chart-templated manifests that already carry a `helm.sh/hook` annotation when `syncWave` is non-zero | Helm's hook-weight ordering within a hook phase |

### `helm.sh/hook-weight` emission is path-dependent

A subtlety worth flagging for chart authors: `helm.sh/hook-weight` is emitted only on manifests rendered through the chart-templating path — the chart's `templates/` directory rendered via the Helm SDK. Manifests produced through the artifacts path (the Recipe's `artifacts:` block, whether each entry is inline content or `$import:`-loaded) carry the `argocd.argoproj.io/sync-wave` annotation and the full provenance label set, but they do **not** receive `helm.sh/hook-weight` — even when the artifact carries a `helm.sh/hook` annotation.

The distinction is structural: `helm.sh/hook` and `helm.sh/hook-weight` are Helm-runtime ordering primitives that apply to chart-templated hook resources. Recipe-author artifacts are extra resources declared at the Recipe layer; they do not participate in Helm's hook lifecycle by default.

If you need Helm hook-weight ordering on a hook resource, author the resource as a chart template under the Recipe's `source:` directory rather than as an `artifacts:` entry. The chart template will receive both `argocd.argoproj.io/sync-wave` and `helm.sh/hook-weight` matching the contributing boundary's `syncWave` value.

## Authoring examples

Boundary-level placement and registry configuration:

```yaml
# release.yaml
spec:
  boundaries:
    production:
      annotations:
        aggrega.ai/namespace: prod-zone
        aggrega.ai/image-registry: registry.corp.com
        aggrega.ai/image-pull-secret: corp-registry-creds
      components:
        api: {}
        worker: {}
```

Per-component override (component wins over boundary on the same annotation key):

```yaml
# release.yaml
spec:
  boundaries:
    production:
      annotations:
        aggrega.ai/namespace: prod-zone
      components:
        api: {}
        legacy-thing:
          annotations:
            aggrega.ai/namespace: legacy-zone   # override — this component deploys elsewhere
```

## Aggregate-side annotation cascade

Annotations also live on the Aggregate authoring surface — at the subsystem scope (`spec.subsystems.<name>.annotations`) and at the component-instance scope (`spec.subsystems.<name>.components.<name>.annotations` or `spec.components.<name>.annotations` for top-level components). The Aggregate-side cascade carries Developer-authored annotations down through the subsystem tree to contained components.

### The cascade rule

A subsystem-level annotation propagates to every nested subsystem and every contained component in the subsystem's subtree. Closer-level annotations override outer-level annotations at per-key granularity: a component-level annotation overrides any inherited subsystem-level annotation for the same key without affecting sibling keys or sibling components.

Annotation values carry pointer-tristate semantics:

- **Absent key** — the scope declares no value for this annotation. Nested subsystems and contained components inherit any binding from an ancestor scope.
- **Non-nil pointer (a string value)** — the scope declares a value. Nested subsystems and contained components inherit this value unless they declare their own value or opt out.
- **Nil pointer (explicit YAML `null`)** — the scope removes any inherited binding for this key from its subtree. Sibling components and siblings subsystems retain their independent inheritance; only the opting-out scope's subtree loses the binding.

```yaml
spec:
  subsystems:
    data:
      annotations:
        feature.myco/db-pool: "shared-pool"   # propagates to api and worker
      components:
        api:
          # inherits feature.myco/db-pool: "shared-pool"
        worker:
          annotations:
            feature.myco/db-pool: null         # opts out for this component only
        special:
          annotations:
            feature.myco/db-pool: "vip-pool"   # closer-level override
```

### The side-vs-pillar partition

The Aggregate-as-Authoring-Surface invariant restricts Aggregate-side annotations to the values pillar. A Manifest annotation binding declares routing paths under either `maps.infra` (Release-side routing) or `maps.values` (Aggregate-side routing); an Aggregate-side annotation whose binding declares only `maps.infra` paths halts the build with a clear OPS_ERROR naming the annotation key, the routed pillar, and the authoring side. The symmetric rule applies to the Release side: Release-side annotations may only route through `maps.infra`; a Release-side annotation against a values-only binding fires the parallel error.

Bindings that declare paths in both pillars route the side-compatible subset on each pass: an Aggregate-side annotation fires the values-pillar paths only, and a Release-side annotation fires the infra-pillar paths only. Cross-side composition — values from the Aggregate, infra from the Release — produces one Feature attachment per (Component, Feature) pair with both pillars populated and per-leaf provenance recording which side contributed each leaf.

### Authoring example — subsystem annotation routes to values

```yaml
# Manifest binding
spec:
  mappings:
    features:
      type:
        core/db-pool: db-pool-helm:1.0.0
      annotations:
        feature.myco/db-pool:
          feature: core/db-pool:1.0.0
          maps:
            values:
              - pool                            # routes to values.pool
```

```yaml
# Aggregate
spec:
  subsystems:
    data:
      annotations:
        feature.myco/db-pool: "shared-pool"
      components:
        api:
          type: core/server:1.0.0
        worker:
          type: core/server:1.0.0
```

After annotation expansion, both `api` and `worker` carry a synthetic `feature.myco/db-pool` Feature attachment whose `values.pool` field reads `"shared-pool"`. The provenance side-table records each leaf as `Origin: annotation`, `Side: aggregate`, `AnnotationSource: aggregate.yaml:subsystems.data.annotations.feature.myco/db-pool`.

## Structured annotation values

A Feature with multiple configurable fields invites a single annotation key that carries values for several of them at once. The structured annotation form lets one key route to multiple binding paths in one declaration:

```yaml
# Aggregate Subsystem — Developer's intent for db-pool (values-pillar subkeys)
subsystems:
  data:
    annotations:
      feature.myco/db-pool:
        db_name: "prod-db"
        read_replicas: 5
```

```yaml
# Release Boundary — Operator's sizing for db-pool (infra-pillar subkeys)
boundaries:
  prod:
    annotations:
      feature.myco/db-pool:
        pool_size: 20
        max_connections: 100
```

The Manifest binding declares all four subkeys' routing in pillar-grouped `maps:` lists:

```yaml
# Manifest
spec:
  mappings:
    features:
      annotations:
        feature.myco/db-pool:
          feature: core/db-pool:1.0.0
          maps:
            values:
              - db_name
              - read_replicas
            infra:
              - pool_size
              - max_connections
```

The annotation value's shape is one of three forms:

- **Scalar string** — a single value. The binding must declare exactly one path total; the scalar routes to that path.
- **Structured object** — a map of subkey to subvalue. Each subkey's path must appear in the binding's `maps.infra` or `maps.values` list; the subvalue routes to the named Feature schema field at the declared pillar.
- **Explicit YAML `null`** — opts out of the inherited binding wholesale for this cascade scope.

Each subkey within a structured value resolves against the binding's `maps` list independently. A subkey absent from both `maps.infra` and `maps.values` halts the build with a clear error naming the offending subkey and the declared paths.

### Cascade merge for structured values

Structured annotations cascade with per-subkey deep merge. A child cascade scope's annotation merges with the parent's annotation per subkey; closer-level overrides parent at subkey granularity:

```yaml
subsystems:
  data:
    annotations:
      feature.myco/db-pool:
        db_name: "data-default"
        read_replicas: 3
    components:
      api:
        annotations:
          feature.myco/db-pool:
            db_name: "api-override"     # overrides parent at this subkey only
            # read_replicas not listed → inherits 3 from parent
      analytics:
        annotations:
          feature.myco/db-pool:
            read_replicas: null         # per-subkey opt-out: removes inherited subkey
            # db_name not listed → inherits "data-default" from parent
```

Effective annotations after the cascade:

- Component `api`: `{ db_name: "api-override", read_replicas: 3 }`
- Component `analytics`: `{ db_name: "data-default" }` — `read_replicas` opted out at this scope

A child cascade level whose value is a scalar (against a structured parent) replaces wholesale rather than merging. Shape mismatches between cascade levels resolve in favour of the closer-level value; the compiler does not warn on shape mismatch.

### Whole-value null vs per-subkey null

The cascade carries two opt-out mechanisms at different granularities:

```yaml
# Whole-value null — opts out wholesale at this scope
components:
  api:
    annotations:
      feature.myco/db-pool: null
```

The entire annotation binding is suppressed at this component; no synthetic Feature attachment synthesizes from this annotation key at this scope. Sibling components retain their inherited binding.

```yaml
# Per-subkey null — opts out just one subkey
components:
  api:
    annotations:
      feature.myco/db-pool:
        db_name: "api-db"
        read_replicas: null
```

The annotation continues to contribute at this scope, but the `read_replicas` subkey is suppressed. Other subkeys (declared at this scope or inherited from parent cascade levels) stand.

Authoring guidance: use whole-value null to disable an annotation-driven Feature attachment at a scope. Use per-subkey null when you want to keep most of an annotation's contribution but suppress one or more specific fields.

### Side-vs-pillar partition per subkey

The Aggregate-as-Authoring-Surface invariant applies per subkey when an annotation value is structured. Each subkey's pillar (per the binding's `maps` declaration) must be compatible with the authoring side:

- Aggregate-side annotation may carry only subkeys routing to `maps.values`.
- Release-side annotation may carry only subkeys routing to `maps.infra`.

A subkey routing to an incompatible pillar halts the build with a clear error citing the specific subkey and pillar. The error chain collects all incompatible subkeys per annotation before halting — operators see every problem per build cycle rather than fix-rebuild-fix-rebuild cycling.

### Per-subkey type validation

Each subkey's runtime value is validated against the target Feature's `spec.schema` declared type at the routed pillar. The supported declared types are `string`, `integer`, `number`, `boolean`, `object`, `array`, `null`. A subvalue whose Go type does not match the schema's declared type halts the build with a clear error naming the subkey, the actual type, and the declared type.

Type matching is strict — no coercion. A string `"20"` against an integer-typed schema field halts; authors declare types correctly on the Feature schema or use scalar annotations that pass through as strings.

**Authoring lever for strict validation.** Properties without a declared `type` in the Feature's `spec.schema` accept any runtime value shape including nested maps. The validator's default-to-skip discipline trades strictness for progress — when the schema does not declare a constraint, the validator does not invent one. Authors who want strict per-subkey type validation declare `type` on every property in `spec.schema`. The FeatureRecipe rendering layer downstream handles whatever shape the annotation contribution carries.

### Cross-side composition

When both an Aggregate-side annotation (values subkeys) and a Release-side annotation (infra subkeys) target the same Feature attachment on the same Component, the IR builder merges the contributions into a single Feature attachment with both pillars populated. Per-leaf provenance records each subkey's source — the synthesized attachment carries `values.db_name` attributed to the Aggregate authoring site and `infra.pool_size` attributed to the Release authoring site.

The cross-side composition pattern is the canonical authoring shape for Features with mixed Developer-intent and Operator-sizing fields: the Aggregate declares the cognitive choices (which database, how many replicas at the application level); the Release declares the physical sizing (how big the pool, how many connections at the infrastructure level). One Manifest binding ties them together with a single set of `maps` declarations.

## Related references

- [Provider architecture](architecture.md) — the provider-plugin architecture and the provider-rendering Plugin's role.
- [../entities/release.md](../entities/release.md) — the Release authoring surface where boundary and component annotations live.
- [../entities/aggregate.md](../entities/aggregate.md) — the Aggregate authoring surface where subsystem and component-level annotations live.
- [../entities/manifest.md](../entities/manifest.md) — the Manifest's `mappings.features.annotations` map where annotation bindings declare their `maps:` routing.
- [../../architecture/11-governance-and-compliance.md](../../architecture/11-governance-and-compliance.md) — the compile-time provenance stamping story that complements author-controlled annotations.
