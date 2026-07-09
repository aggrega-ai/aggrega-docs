# Advanced Patterns

## Example 20: FeatureRecipe Resource Generation (Source + ValuesMapping)

A FeatureRecipe can generate entirely new infrastructure resources (like an Ingress CRD) alongside the base component. This uses the `source` + `valuesMapping` pattern rather than a `pipeline`.

**1. Platform Catalog: The Ingress Feature**

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Feature
metadata:
  name: core/ingress
  version: 1.0.0
spec:
  schema:
    infra:
      hostname: { type: string, required: true }
```

**2. Ops Domain: The FeatureRecipe**
The FeatureRecipe renders its own Helm chart. The compiler appends the generated objects to the base component's AST.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: FeatureRecipe
metadata:
  name: ingress-helm
  version: 1.0.0
spec:
  target: helm
  implements: core/ingress:1.0.0
  source: "./charts/generic-ingress"
  valuesMapping: |
    ingress:
      hostname: "{{ .infra.hostname }}"
      targetService: "{{ .context.instance_id }}"
      targetPort: "8080"
```

**3. Routing Domain: The Release**
Ops attaches the Ingress feature and provides the physical hostname via `infra`.

```yaml
# Inside a Release boundary:
components:
  web-server:
    features:
      external-ingress:
        type: core/ingress:1.0.0
        infra:
          hostname: "app.enterprise.com"
```

---

## Example 21: The Manifest Name-Tier Override & YAML Anchors

When a single instance requires a non-standard Recipe, the `name` tier overrides the `type` tier. YAML anchors keep the Manifest DRY.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Manifest
metadata:
  name: enterprise-manifest
  version: 1.0.0
defs:
  - &standard_worker "python-worker-helm:1.0.0"
spec:
  mappings:
    helm:
      components:
        type:
          # Bulk DRY mapping — all python-workers use the standard Recipe
          "core/python-worker": *standard_worker
          "core/postgres": "postgres-bitnami:1.0.0"
        name:
          # Granular override — this specific instance uses a custom Recipe
          "legacy-billing-agent": "custom/legacy-worker:3.0.0"
      features:
        type:
          "core/data-masking": "lakera-guard-sidecar:1.0.0"
          "core/aws-secrets-manager": "eso-aws-fetcher:1.0.0"
```

**Resolution Order (Most Specific Wins):**

1. `name` lookup (exact instance name) — highest priority
2. `type` lookup with version (exact version match, e.g., `"core/python-worker:2.0.0"`)
3. `type` lookup without version (any version match, e.g., `"core/python-worker"`)
4. No match → Fatal Halt listing the unmapped entity
