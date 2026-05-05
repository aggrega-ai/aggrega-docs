# Well-Known Annotations

Provider engines read specific boundary annotations from the Release to configure platform-specific deployment context. The compiler itself is blind to these annotations — it passes them through as opaque strings. Each provider documents which annotations it reads and what defaults it applies when the annotation is absent.

## The Invariants

1. The compiler never reads or validates provider well-known annotations.
2. Each provider documents which annotations it reads and what defaults it applies.
3. Annotations apply uniformly within a boundary. If a value varies per component, it belongs in component-level annotations (overriding boundary annotations) or in component `infra`.
4. Provider well-known annotations never duplicate component labels. Component labels describe *what a component is*. Boundary annotations describe *where a component deploys*.
5. Recipes do not handle provider well-known annotations. The provider engine applies placement context (namespace, registry prefix, service account) automatically after the Recipe produces its content.
6. The `aggrega.ai/` prefix is reserved for the standard library. Custom enterprise annotations use their own prefix.
7. Component-level annotations in the Release override boundary-level annotations (deep-merge, component wins). The provider validates consistency when grouping — for example, the `helm-chart` provider rejects components with different `aggrega.ai/namespace` values in the same chart.

## The Complete Annotation Matrix

### Category 1 — Placement

| Annotation | Consumed By | Purpose | Default |
| --- | --- | --- | --- |
| `aggrega.ai/namespace` | `helm`, `helm-chart`, `compose` | Kubernetes namespace (helm / helm-chart); per-boundary Docker network name (compose) | Not injected if absent (helm / helm-chart); sanitised boundary path (compose) |
| `aggrega.ai/region` | `terraform`, `cloudformation` | Cloud provider region | Provider-specific or fatal halt |
| `aggrega.ai/account-id` | `terraform`, `cloudformation` | Cloud account / project | Provider reads from environment |
| `aggrega.ai/project-name` | `compose` | Docker Compose project name | Leaf boundary name |

`aggrega.ai/namespace` is dual-purpose by design. It expresses the same logical-isolation intent — *"this boundary's resources live in their own addressable scope"* — in each target's native form: a Kubernetes `metadata.namespace` for helm and helm-chart, a Docker network name for compose. Recipe authors set one annotation; each provider materialises it appropriately for the target. For the compose case, the per-boundary derivation reads the alphabetically-first node's annotation; when unset on every node in the boundary, the network name falls back to the sanitised boundary path (lowercased, with non-`[a-z0-9._-]` characters replaced by `_`).

### Category 2 — Registry

| Annotation | Consumed By | Purpose | Default |
| --- | --- | --- | --- |
| `aggrega.ai/image-registry` | `helm`, `helm-chart`, `compose` | Registry prefix for container images | No prefix |
| `aggrega.ai/image-pull-secret` | `helm`, `helm-chart` | Kubernetes `imagePullSecrets` name | None |

### Category 3 — Networking

| Annotation | Consumed By | Purpose | Default |
| --- | --- | --- | --- |
| `aggrega.ai/cluster-domain` | `helm`, `helm-chart` | DNS suffix for cross-namespace service discovery | `cluster.local` |
| `aggrega.ai/ingress-class` | `helm`, `helm-chart` | Kubernetes IngressClass for Ingress resources | Provider default or omitted |
| `aggrega.ai/service-mesh` | `helm`, `helm-chart` | Mesh sidecar injection annotations | None |

### Category 4 — Security

| Annotation | Consumed By | Purpose | Default |
| --- | --- | --- | --- |
| `aggrega.ai/service-account` | `helm`, `helm-chart` | Kubernetes `ServiceAccount` for Pods | `default` |
| `aggrega.ai/pod-security-standard` | `helm`, `helm-chart` | Pod Security Standards level | None |
| `aggrega.ai/iam-role` | `terraform`, `cloudformation` | Execution role ARN | Provider reads from environment |

### Category 5 — Packaging

| Annotation | Consumed By | Purpose | Default |
| --- | --- | --- | --- |
| `aggrega.ai/chart-name` | `helm-chart` | Helm chart name | Leaf boundary name |
| `aggrega.ai/chart-version` | `helm-chart` | Helm chart version | `0.1.0` |
| `aggrega.ai/stack-name` | `cloudformation` | CloudFormation stack name | Leaf boundary name |
| `aggrega.ai/tf-backend` | `terraform` | Terraform state backend key | None |

## Provenance labels emitted by providers

The annotations above flow *into* the build — the Release authors them, providers consume them. Providers also emit a parallel set of labels *out of* the build, attaching them to the rendered output so downstream tooling can attribute runtime resources back to the catalog content that produced them. These provenance labels are not authored on the Release; they are derived from the build's own state (release identity, aggregate name, environment, sync wave, compiler version) and emitted by the provider at render time.

The current emit set on rendered Kubernetes manifests:

| Label | Source | Always emitted? |
| --- | --- | --- |
| `app.kubernetes.io/name` | Node ID | Yes |
| `aggrega.ai/component-id` | Node ID | Yes |
| `aggrega.ai/boundary-path` | Boundary path | When set |
| `aggrega.ai/compiler-version` | Provenance struct | When set |
| `aggrega.ai/aggregate-name` | Aggregate `metadata.name` | When set |
| `aggrega.ai/environment` | Release `metadata.environment` | When the Release sets it (the field is moving to optional) |
| `aggrega.ai/sync-wave` | Per-node sync-wave | When set |

### Per-provider asymmetry

The provenance label emission is **not uniform across providers today**. The current shipping state:

- **`helm`** — emits the full provenance label set above on every rendered Kubernetes resource (Deployment, Service, PVC, etc.). Both sourced-mode (Helm SDK render with post-render label injection) and synthesised-mode (workload synthesis) paths produce the same labels.
- **`helm-chart`** — emits the same set on its sub-chart resources via the same label-injection mechanism as helm.
- **`compose`** — does **not** emit aggrega-prefixed provenance labels on rendered docker-compose services today. The compose engine consumes `aggrega.ai/namespace` for per-boundary network derivation but does not write a parallel set of labels onto compose services. Downstream tooling that filters compose output by aggrega provenance has nothing to filter on for compose-targeted boundaries.
- **`terraform` / `cloudformation`** — `planned`; the engines do not ship today, so there is no emission discipline yet. When the engines ship, the design target is to emit equivalent tags via each cloud's native tagging mechanism (Terraform `tags` block, CloudFormation `Tags`); the per-provider translation lands with the engine.

The asymmetry is a real authoring caveat. Authors targeting cost-attribution dashboards or environment-filtered observability across mixed compose + helm boundaries should expect the compose subset of resources to carry no aggrega provenance labels until compose adopts the emission discipline. This is tracked as a documentation observation rather than a bug — the compose docker-compose output shape is structurally different from K8s manifests, and the canonical compose label-host (the service block's labels field) requires a per-service decision on which subset of provenance to emit.

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
        aggrega.ai/cluster-domain: cluster.prod.internal
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

## Related references

- [Provider architecture](architecture.md) — the provider-plugin architecture and the Provider entity's role.
- [../entities/release.md](../entities/release.md) — the Release authoring surface where boundary and component annotations live.
- [../../architecture/11-governance-and-compliance.md](../../architecture/11-governance-and-compliance.md) — the compile-time provenance stamping story that complements author-controlled annotations.
