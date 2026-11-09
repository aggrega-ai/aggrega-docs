# Composition

## Example 15: Nested Aggregates & Exported Components

Aggregates can import other Aggregates as parameterized modules, enabling team-level composition. The `exportedComponents` block defines the sub-module's Public API.

**1. Dev Domain: The Sub-Aggregate (Database Module)**

```yaml
apiVersion: aggrega.ai/v1beta1
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
      type: core/postgres:2.0.0             # Uses Component from Example 4
      annotations:
        aggrega.ai/namespace: data           # The module places its own database
      values:
        db_name: "{{ .parameters.env_db_name }}"
  exportedComponents:
    public_db: "main-db"                     # The Public API: expose main-db as "public_db"
```

**2. Dev Domain: The Root Aggregate**
The root Aggregate imports the database module and connects to its exported component using the dotted path syntax `data-layer.public_db`.

```yaml
apiVersion: aggrega.ai/v1beta1
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
      type: db-module:1.0.0
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
                - in: DB_HOST
                  from: "host"
                - in: DB_PORT
                  from: "port"
```

**3. Routing Domain: The Release**
DevOps routes the sub-aggregate's internal components into specific boundaries. The `aggregates` block inside the boundary mirrors the Aggregate's nesting.

```yaml
apiVersion: aggrega.ai/v1beta1
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

**Annotations inside a module.** A module's own annotations reach the module's own components exactly as an Aggregate's reach its own, whether declared on one of its subsystems or on a component instance, so `main-db` renders into the `data` namespace the module declares. The importing Aggregate declares nothing that reaches into the module; the Release does, and its value wins on the same key — writing `annotations: { aggrega.ai/namespace: prod-data }` on the `main-db` entry above, or on the `prod-cluster` boundary, places `main-db` there instead.

---

## Example 16: External Services & Parameter Hoisting

External SaaS APIs and legacy databases are first-class graph nodes. They produce no compute artifacts but participate in topology, policy validation, and inject resolution.

**1. Platform Catalog: The External Service Component**
The Recipe declares a Workload of `form: reference` — an `endpoint` and no containers — so nothing is provisioned for the service, and it publishes the service's `hostname` as `primary_endpoint`.

```yaml
apiVersion: aggrega.ai/v1beta1
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
apiVersion: aggrega.ai/v1beta1
kind: Recipe
metadata:
  name: external-service-reference
  version: 1.0.0
spec:
  capability: helm
  implements: core/external-service:1.0.0
  provides:
    primary_endpoint: "{{ .values.hostname }}"
  workload: |
    apiVersion: aggrega.ai/v1beta1
    kind: Workload
    form: reference
    endpoint: "{{ .values.hostname }}"
```

**2. Dev Domain: The Aggregate**
The developer uses **Parameter Hoisting** — the physical IP of the legacy database is unknown to the developer and demanded from Ops via the `parameters` contract.

```yaml
apiVersion: aggrega.ai/v1beta1
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
                - in: STRIPE_URL
                  from: "primary_endpoint"
        databases:
          oracle:
            target: legacy-oracle
            inject:
              env:
                - in: ORACLE_DSN
                  from: "primary_endpoint"
```

**3. Routing Domain: Manifest & Release**
The Manifest maps both component types to their Recipes in one `components.type` map. The Recipe named for the external service, `external-service-reference`, binds the `helm` provider with a `form: reference` Workload, so neither external node provisions compute: the build writes one ExternalName Service for each, carrying its `hostname`, and `billing-agent` receives `STRIPE_URL: api.stripe.com` and `ORACLE_DSN: 10.0.4.55` through the inject contract. Kubernetes treats an `externalName` as a DNS name, so the legacy database's Service does not resolve to its IP address; `billing-agent` reaches the database at the address `ORACLE_DSN` carries. The Release fulfills the parameter contract.

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Manifest
metadata:
  name: payment-manifest
  version: 1.0.0
spec:
  mappings:
    components:
      type:
        "core/python-worker": "python-worker-helm:1.0.0"
        "core/external-service": "external-service-reference:1.0.0"
---
apiVersion: aggrega.ai/v1beta1
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

## Example 17: Subsystems — Logical Grouping with Cascading Annotations

Subsystems organize components into logical groups within an Aggregate. Annotations cascade down to every component in the subsystem, and Features attached at the subsystem level apply to all nested components.

**1. Dev Domain: The Aggregate**

```yaml
apiVersion: aggrega.ai/v1beta1
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
        aggrega.ai/namespace: "billing"        # where the billing components render
      features:
        # Cross-cutting: all components in this subsystem get audit logging
        audit-logger:
          type: core/enterprise-audit-logger:1.0.0
          values:
            events: [create, update, delete]   # what is logged
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

The developer attaches the logger once, on the subsystem, and decides what it records: the events listed in its `values` are part of what the billing domain is, the same in every environment.

**2. Routing Domain: The Release**
How long the audit records are kept is a retention period the operator sets for each environment, so it is `infra`, not a developer value. The Release writes it on the attachment under each component's entry, using the attachment name the subsystem gave it.

```yaml
# the Release — its metadata and the boundary's directory left out
spec:
  boundaries:
    prod-cluster:
      components:
        invoice-api:
          features:
            audit-logger:
              infra:
                retention: "365d"
        payment-worker:
          features:
            audit-logger:
              infra:
                retention: "365d"
        metrics-collector: {}
```

**Compilation:** The compiler flattens the subsystem tree. `invoice-api` and `payment-worker` both receive the `audit-logger` Feature, each carrying the `values` the subsystem wrote and the `infra` the Release wrote on that component's entry, and the cascading annotation `team.aggrega.ai/owner: "billing-squad"` in their `.context.annotations.aggregate` bucket. The Recipe template can access these via `{{ index .context.annotations.aggregate "cost.aggrega.ai/center" }}`.

The subsystem's `aggrega.ai/namespace` is a provider annotation, so it does more than reach the template: the provider places `invoice-api` and `payment-worker` in the `billing` namespace, and `metrics-collector`, whose subsystem declares none, keeps the placement it would have had. A Release that sets `aggrega.ai/namespace` — on `prod-cluster` or on one component's entry — overrides the subsystem's value for the components it covers; the subsystem's applies wherever the Release sets none.

---

## Example 18: Feature Atomicity & Attachment-Owned Topology

A Feature attachment can autonomously declare its own `uses` edges, creating independent topological connections without polluting the parent component. Attachments share one surface: an operational Feature and a credential Feature — one labeled `feature.aggrega.ai/kind: secret` — are attached under the same `features:` keyword and in the same shape, and either may carry a `uses` block of its own.

**1. Dev Domain: The Aggregate**

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Aggregate
metadata:
  name: autonomous-system
  version: 1.0.0
spec:
  components:
    search-api:
      type: core/external-service:1.0.0     # Uses Component from Example 16
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
              - in: DB_PASS
                from: "password"
          uses:
            # The credential Feature autonomously maps its own network dependency
            vault_backend:
              vault:
                target: internal-vault

        audit-logger:
          type: core/enterprise-logger:1.0.0
          values:
            events: [tool-call, decision]      # what is logged
          uses:
            # The Feature autonomously requests its storage target
            storage:
              archive:
                target: compliance-s3
```

Both attachments sit in one `features:` block, because one component declares its attachments once — a credential Feature is not a second kind needing a keyword of its own.

**2. Routing Domain: The Release**
What the logger records — each tool call the agent makes and each decision it returns, listed in its `values` — is the developer's to decide, once and the same in every environment, so the developer attaches it in the Aggregate. Its retention is a period the operator sets for each environment, so the Release writes it as `infra` on the same attachment:

```yaml
# the Release — its other entries left out
spec:
  components:
    finance-agent:
      features:
        audit-logger:
          infra:
            retention: "30d"
```

**Compilation:** The compiler draws three independent edge sets:

1. `finance-agent` → `search-api` (Developer-owned topology, agent socket)
2. `finance-agent[feature:db_password]` → `internal-vault` (attachment-owned topology, tagged `origin_feature_instance: db_password`)
3. `finance-agent[feature:audit-logger]` → `compliance-s3` (attachment-owned topology, tagged `origin_feature_instance: audit-logger`)

Each edge set passes through the compiler's policy validation independently.
