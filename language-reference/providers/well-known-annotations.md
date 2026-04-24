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
| `aggrega.ai/namespace` | `helm`, `helm-chart` | Kubernetes namespace for manifests | Not injected if absent |
| `aggrega.ai/region` | `terraform`, `cloudformation` | Cloud provider region | Provider-specific or fatal halt |
| `aggrega.ai/account-id` | `terraform`, `cloudformation` | Cloud account / project | Provider reads from environment |
| `aggrega.ai/project-name` | `compose` | Docker Compose project name | Leaf boundary name |

### Category 2 — Registry

| Annotation | Consumed By | Purpose | Default |
| --- | --- | --- | --- |
| `aggrega.ai/image-registry` | `helm`, `helm-chart`, `compose` | Registry prefix for container images | No prefix |
| `aggrega.ai/image-pull-secret` | `helm`, `helm-chart` | Kubernetes `imagePullSecrets` name | None |

### Category 3 — Networking

| Annotation | Consumed By | Purpose | Default |
| --- | --- | --- | --- |
| `aggrega.ai/cluster-domain` | `helm`, `helm-chart` | DNS suffix for cross-namespace service discovery | `cluster.local` |
| `aggrega.ai/network` | `compose` | Docker Compose network name | `default` |
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
