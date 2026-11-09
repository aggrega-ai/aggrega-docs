# Advanced Patterns

## Example 23: FeatureRecipe Resource Generation (Source + ValuesMapping)

A FeatureRecipe can generate entirely new infrastructure resources (like an Ingress) alongside the base component. This uses the `source` + `valuesMapping` pattern rather than a `pipeline`. The standard library's `core/public-ingress` is built this way.

**1. Platform Catalog: The Ingress Feature**

The request path a component serves is part of what the application is, so it is `values`. The hostname is the environment's name for the component, so it is `infra`, beside the knobs that describe the cluster. An excerpt, with descriptions and comments left out:

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Feature
metadata:
  name: core/public-ingress
  version: 1.0.0
spec:
  appliesTo: "component.aggrega.ai/type=server"
  schema:
    values:
      $ref: "BaseComponents#/schemas/BaseFeatureParameter"
      properties:
        path:
          type: string
    infra:
      host:
        type: string
      control_plane_present:
        type: boolean
        default: false
      service_name:
        type: string
      service_port_name:
        type: string
      ingress_class_name:
        type: string
      tls_secret:
        type: string
```

**2. Ops Domain: The FeatureRecipe**
The FeatureRecipe renders its own Helm chart, from a `chart/` directory beside it, and what that chart renders is written beside the base component's own output. An excerpt, with its prerequisite assertion and the namespace it reads from the Release's annotations left out:

```yaml
apiVersion: aggrega.ai/v1beta1
kind: FeatureRecipe
metadata:
  name: public-ingress
  version: 1.0.0
spec:
  capability: helm
  implements: core/public-ingress:1.0.0
  source: ./chart
  valuesMapping: |
    {{- $service := default (printf "%s-default" .context.rendered_name) .infra.service_name }}
    {{- $portName := default "http" .infra.service_port_name }}
    {{- $path := default "/" .values.path }}
    targetName: "{{ .context.rendered_name }}"
    host: "{{ .infra.host }}"
    serviceName: "{{ $service }}"
    servicePortName: "{{ $portName }}"
    path: "{{ $path }}"
    ingressClassName: "{{ .infra.ingress_class_name }}"
    tlsSecret: "{{ .infra.tls_secret }}"
```

`targetName` and the fallback `serviceName` name resources of the host component, so both are built from `.context.rendered_name` — the host component's name as its provider reports it, spelled in the characters a Kubernetes name allows — and not from `.context.instance_id`, which keeps any underscore or capital the component's name carries.

**3. Developer Domain: The Aggregate**
The developer attaches the Feature to the component it publishes and writes the path.

```yaml
# Inside the Aggregate — the component's own type and values left out:
components:
  web-server:
    features:
      external-ingress:
        type: core/public-ingress:1.0.0
        values:
          path: /
```

**4. Routing Domain: The Release**
Ops sizes the same attachment on the Release's entry for the component, under the same attachment name: the physical hostname, and the affirmation that an ingress controller runs in the target cluster, without which the build halts. The type and the path come from the Aggregate.

```yaml
# Inside a Release boundary:
components:
  web-server:
    features:
      external-ingress:
        infra:
          host: "app.enterprise.com"
          control_plane_present: true
```

A path that differs from one environment to the next is a parameter the Aggregate declares and each Release fulfils, written into the attachment's `values` as `path: "{{ .parameters.<name> }}"`. A `host` written in the Aggregate's `values`, or a `path` in the Release's `infra`, halts `aggrega pull` naming the field: each pillar is closed, and the field belongs to the other one.

---

## Example 24: The Manifest Name-Tier Override & YAML Anchors

When a single instance requires a non-standard Recipe, the `name` tier overrides the `type` tier. YAML anchors keep the Manifest DRY.

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Manifest
metadata:
  name: enterprise-manifest
  version: 1.0.0
defs:
  - &standard_worker "python-worker-helm:1.0.0"
spec:
  mappings:
    components:
      type:
        # Bulk DRY mapping — all python-workers use the standard Recipe
        "core/python-worker": *standard_worker
        "core/postgres": "postgres:1.0.0"
      name:
        # Granular override — this specific instance uses a custom Recipe
        "legacy-billing-agent": "legacy-worker:3.0.0"
    features:
      type:
        "core/data-masking": "data-masking-litellm:1.0.0"
        "core/aws-secrets-manager": "eso-aws-fetcher:1.0.0"
```

**Resolution Order (Most Specific Wins):**

1. `name` lookup (exact instance name) — highest priority
2. `type` lookup with version (exact version match, e.g., `"core/python-worker:2.0.0"`)
3. `type` lookup without version (any version match, e.g., `"core/python-worker"`)
4. No match → Fatal Halt listing the unmapped entity
