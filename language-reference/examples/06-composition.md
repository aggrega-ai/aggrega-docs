# Composition

## Example 14: Nested Aggregates & Exported Components

Aggregates can import other Aggregates as parameterized modules, enabling team-level composition. The `exportedComponents` block defines the sub-module's Public API.

**1. Dev Domain: The Sub-Aggregate (Database Module)**

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: db-module
  version: 1.0.0
spec:
  parameters:
    env_db_name:
      type: string
      required: true
  components:
    main-db:
      type: core/postgres:1.0.0             # Uses Component from Example 2
      values:
        db_name: "{{ .parameters.env_db_name }}"
  exportedComponents:
    public_db: "main-db"                     # The Public API: expose main-db as "public_db"
```

**2. Dev Domain: The Root Aggregate**
The root Aggregate imports the database module and connects to its exported component using the dotted path syntax `data-layer.public_db`.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: full-app
  version: 1.0.0
spec:
  parameters:
    corp_db_name:
      type: string
      required: true

  aggregates:
    data-layer:
      type: local/db-module:1.0.0
      parameters:
        env_db_name: "{{ .parameters.corp_db_name }}"

  components:
    backend:
      type: core/web-server:1.0.0            # Uses Component from Example 2
      values:
        image: "corp/backend:v3"
      uses:
        databases:
          main:
            target: data-layer.public_db     # Dotted path into sub-aggregate
            inject:
              env:
                DB_HOST: "host"
                DB_PORT: "port"
```

**3. Routing Domain: The Release**
DevOps routes the sub-aggregate's internal components into specific boundaries. The `aggregates` block inside the boundary mirrors the Aggregate's nesting.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Release
metadata:
  name: full-app-release
  version: 1.0.0
  environment: production
spec:
  aggregate: full-app
  manifest: full-app-manifest
  parameters:
    corp_db_name: "enterprise_data"
  boundaries:
    prod-cluster:
      directory: "deploy/prod"
      components:
        backend: {}
      aggregates:
        data-layer:
          components:
            main-db:
              infra:
                cpu_limit: "4"
                storage_size: "200Gi"
```

---

## Example 15: External Services & Parameter Hoisting

External SaaS APIs and legacy databases are first-class graph nodes. They produce no compute artifacts but participate in topology, policy validation, and inject resolution.

**1. Platform Catalog: The External Service Component**
The `eval` provider executes formatting in-memory — no source chart, no valuesMapping. The Recipe simply exports provides strings.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Component
metadata:
  name: core/external-service
  version: 1.0.0
  labels:
    component.aggrega.ai/type: "server"
spec:
  schema:
    values:
      hostname: { type: string, required: true }
    provides:
      primary_endpoint: { type: string }
---
apiVersion: aggrega.ai/v1alpha1
kind: Recipe
metadata:
  name: external-formatter
  version: 1.0.0
spec:
  capability: eval
  implements: core/external-service:1.0.0
  locals:
    primary_compute: "virtual"
  provides:
    primary_endpoint: "{{ .values.hostname }}"
```

**2. Dev Domain: The Aggregate**
The developer uses **Parameter Hoisting** — the physical IP of the legacy database is unknown to the developer and demanded from Ops via the `parameters` contract.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: payment-processor
  version: 1.0.0
spec:
  parameters:
    legacy_db_ip:                            # The contract Ops must fulfill
      type: string
      required: true

  components:
    stripe-api:
      type: core/external-service:1.0.0
      values:
        hostname: "api.stripe.com"

    legacy-oracle:
      type: core/external-service:1.0.0
      values:
        hostname: "{{ .parameters.legacy_db_ip }}"

    billing-agent:
      type: core/python-worker:1.0.0
      values:
        image: "corp/billing:v3"
      uses:
        apis:
          stripe:
            target: stripe-api
            inject:
              env:
                STRIPE_URL: "primary_endpoint"
        databases:
          oracle:
            target: legacy-oracle
            inject:
              env:
                ORACLE_DSN: "primary_endpoint"
```

**3. Routing Domain: Manifest & Release**
The Manifest maps both component types to their Recipes in one `components.type` map. The Recipe named for the external service, `external-formatter`, declares `spec.capability: eval`, so that node renders in memory and provisions no compute. The Release fulfills the parameter contract.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Manifest
metadata:
  name: payment-manifest
  version: 1.0.0
spec:
  mappings:
    components:
      type:
        "core/python-worker": "python-worker-helm:1.0.0"
        "core/external-service": "external-formatter:1.0.0"
---
apiVersion: aggrega.ai/v1alpha1
kind: Release
metadata:
  name: payment-release
  version: 1.0.0
  environment: production
spec:
  aggregate: payment-processor
  manifest: payment-manifest
  parameters:
    legacy_db_ip: "10.0.4.55"
  boundaries:
    prod-vpc:
      directory: "deploy/aws-prod"
      components:
        stripe-api: {}
        legacy-oracle: {}
        billing-agent: {}
```

---

## Example 16: Subsystems — Logical Grouping with Cascading Annotations

Subsystems organize components into logical groups within an Aggregate. Annotations cascade down to every component in the subsystem, and Features attached at the subsystem level apply to all nested components.

**1. Dev Domain: The Aggregate**

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: multi-team-app
  version: 1.0.0
spec:
  subsystems:
    billing-domain:
      annotations:
        team.aggrega.ai/owner: "billing-squad"
        cost.aggrega.ai/center: "CC-3421"
      features:
        # Cross-cutting: all components in this subsystem get audit logging
        audit-logger:
          type: core/enterprise-audit-logger:1.0.0
          values:
            retention: "365d"
      components:
        invoice-api:
          type: core/web-server:1.0.0
          values:
            image: "corp/invoice-api:v2"
        payment-worker:
          type: core/python-worker:1.0.0
          values:
            image: "corp/payment-worker:v1"

    analytics-domain:
      annotations:
        team.aggrega.ai/owner: "data-team"
        cost.aggrega.ai/center: "CC-5500"
      components:
        metrics-collector:
          type: core/python-worker:1.0.0
          values:
            image: "corp/metrics:v3"
```

**Compilation:** The compiler flattens the subsystem tree. `invoice-api` and `payment-worker` both receive the `audit-logger` Feature and the cascading annotation `team.aggrega.ai/owner: "billing-squad"` in their `.context.annotations.aggregate` bucket. The Recipe template can access these via `{{ index .context.annotations.aggregate "cost.aggrega.ai/center" }}`.

---

## Example 17: Feature Atomicity & Attachment-Owned Topology

A Feature attachment can autonomously declare its own `uses` edges, creating independent topological connections without polluting the parent component. Attachments share one surface: an operational Feature and a credential Feature — one labeled `feature.aggrega.ai/kind: secret` — are attached under the same `features:` keyword and in the same shape, and either may carry a `uses` block of its own.

**1. Dev Domain: The Aggregate**

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: autonomous-system
  version: 1.0.0
spec:
  components:
    search-api:
      type: core/external-service:1.0.0     # Uses Component from Example 15
      values:
        hostname: "api.search.com"

    internal-vault:
      type: core/vault-server:1.0.0
      values: {}

    compliance-s3:
      type: core/s3-bucket:1.0.0
      values: {}

    finance-agent:
      type: core/python-worker:1.0.0
      values:
        image: "corp/finance-agent:v3"
      uses:
        tools: ["search-api"]                # The agent's own topology

      features:
        db_password:
          type: core/hashicorp-vault:1.0.0
          values:
            path: /secret/data/finance/db
          inject:
            env:
              DB_PASS: "password"
          uses:
            # The credential Feature autonomously maps its own network dependency
            vault_backend:
              vault:
                target: internal-vault

        audit-logger:
          type: core/enterprise-logger:1.0.0
          values:
            retention: "30d"
          uses:
            # The Feature autonomously requests its storage target
            storage:
              archive:
                target: compliance-s3
```

Both attachments sit in one `features:` block, because one component declares its attachments once — a credential Feature is not a second kind needing a keyword of its own.

**Compilation:** The compiler draws three independent edge sets:

1. `finance-agent` → `search-api` (Developer-owned topology, agent socket)
2. `finance-agent[feature:db_password]` → `internal-vault` (attachment-owned topology, tagged `origin_feature_instance: db_password`)
3. `finance-agent[feature:audit-logger]` → `compliance-s3` (attachment-owned topology, tagged `origin_feature_instance: audit-logger`)

Each edge set passes through the compiler's policy validation independently.
