# Data Model

## Example 4: The Parallel Namespace — Separating Logic from Physics

The Architect enforces structural separation: the Developer controls cognitive `values`, the Operator controls physical `infra`. They cannot step on each other's fields.

**1. Platform Catalog: The Component with `infra`**
The `schema:` declaration covers both `values` (Developer's domain) and `infra` (Operator's domain) as separate namespaces. The Aggregate schema bans Developers from writing `infra`; the Release schema bans Operators from writing `values`.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Component
metadata:
  name: core/postgres
  version: 2.0.0
  labels:
    component.aggrega.ai/type: "stateful-server"
spec:
  schema:
    values:
      db_name: { type: string, default: "defaultdb" }
    infra:
      cpu_limit:    { type: string }
      storage_size: { type: string }
    provides:
      host: { type: string }
      port: { type: string }
```

**2. Dev Domain: The Aggregate**
The developer requests the database using `values`. They have zero visibility into `infra` sizing.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: scalable-datastore
  version: 1.0.0
spec:
  components:
    main-db:
      type: core/postgres:2.0.0
      values:
        db_name: "customer_data"
      # infra: {...} ← BANNED by the Aggregate schema. Developer cannot dictate physical sizing.
```

**3. Routing Domain: The Release**
The Operator injects physical sizing via the `infra` block on the component inside the boundary. The compiler passes `.values` and `.infra` as two cleanly separated objects to the Recipe.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Release
metadata:
  name: prod-datastore
  version: 1.0.0
  environment: production
spec:
  aggregate: scalable-datastore
  manifest: web-app-manifest
  boundaries:
    corporate-cloud:
      directory: "deploy/corporate"
      boundaries:
        main-cluster:
          components:
            main-db:
              infra:
                cpu_limit: "4"
                storage_size: "500Gi"
```

**4. Ops Domain: The Recipe**
Ops consumes both `.values` and `.infra` without conflict.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Recipe
metadata:
  name: postgres-chart-v2
  version: 1.0.0
spec:
  capability: helm
  implements: core/postgres:2.0.0
  source:
    # Planned: provider-declared source keys, validated by the provider's Wasm plugin.
    # The built-in resolver today uses the { kind, url, version } form.
    registry: https://charts.example.com
    chart: postgresql
    version: 12.1.0
  locals:
    primary_compute: "postgresql"
  provides:
    host: "{{ .context.instance_id }}"
    port: "5432"
  valuesMapping: |
    primary:
      initdb:
        scripts:
          create_db.sql: "CREATE DATABASE {{ .values.db_name }};"
      persistence:
        size: {{ .infra.storage_size }}
      resources:
        limits:
          cpu: {{ .infra.cpu_limit }}
```

---

## Example 5: Release Inheritance & Manifest Composition

Ops defines a global baseline. DevOps inherits it and surgically overrides for production. Developers override the secret implementation for local prototyping.

**1. Routing Domain: The Global Base Release**

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Release
metadata:
  name: global-base
  version: 1.0.0
  environment: global
spec:
  aggregate: scalable-datastore            # Uses Aggregate from Example 4
  manifest: global-manifest
  boundaries:
    corporate-cloud:
      directory: "deploy/corporate"
      boundaries:
        main-cluster:
          components:
            main-db:
              infra:
                cpu_limit: "2"
                storage_size: "50Gi"
```

**2. Routing Domain: The Production Override**
The `extends` keyword inherits all boundaries, routing, and parameters from the base. DevOps surgically overrides only the storage size. When a Release uses `extends`, declaring `aggregate` is rejected by the Release schema — the child must map to the exact same Developer Intent. A boundary's `directory:` is inherited like any other scalar, so a child that inherits one written as a literal path renders into the same place its base does; writing the directory against a parameter is what sends each Release's output somewhere of its own. See [`entities/release.md`](../entities/release.md#composite-release-and-extends-inheritance) for that pattern.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Release
metadata:
  name: prod-datastore
  version: 1.0.0
  environment: production
spec:
  extends: ./global-base.yaml    # a Release names its base as a relative path
  # aggregate: ← BANNED when using extends. Inherited from global-base.
  # manifest: ← Optional. If omitted, inherits from global-base. If provided, enables "Late Binding".
  boundaries:
    corporate-cloud:
      boundaries:
        main-cluster:
          components:
            main-db:
              infra:
                storage_size: "500Gi"     # Surgical override. cpu_limit inherits "2".
```

**3. Routing Domain: Manifest Composition for Local Dev**
The base Manifest maps all components to Helm Recipes. The local Manifest inherits everything but swaps the secret implementation for a Docker `.env` injector.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Manifest
metadata:
  name: global-manifest
  version: 1.0.0
spec:
  mappings:
    components:
      type:
        "core/postgres": "postgres-chart-v2:1.0.0"
    features:
      type:
        # Credential Feature — mapped under features, not a separate secrets section
        "core/aws-secrets-manager": "eso-aws-fetcher:1.0.0"
---
apiVersion: aggrega.ai/v1alpha1
kind: Manifest
metadata:
  name: local-manifest
  version: 1.0.0
spec:
  extends: global-manifest
  mappings:
    features:
      type:
        # Surgically swap the credential Feature to local .env injection
        "core/aws-secrets-manager": "compose/docker-env-injector:1.0.0"
```

**4. Routing Domain: The Local Dev Release (Permissive Escape Hatch)**
A flat, single boundary with compose-friendly parameters. The developer runs `aggrega build --release local-release.yaml` and gets a Docker Compose file.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Release
metadata:
  name: local-dev
  version: 1.0.0
  environment: local
spec:
  aggregate: scalable-datastore
  manifest: local-manifest
  parameters:
    dev_bypass_networking: "true"
    dev_bypass_l7_proxies: "true"
  boundaries:
    local-machine:
      directory: "deploy/local"
      components:
        main-db:
          infra:
            cpu_limit: "1"
            storage_size: "1Gi"
```

---

## Example 6: The 7 Cloud-Native Types

Every Component in Aggrega maps to one of 7 universal cloud primitives. This Aggregate demonstrates all seven in a single standard backend.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: enterprise-backend
  version: 1.0.0
spec:
  components:
    api-gateway:
      type: cloud/api-gateway:1.0.0        # 1. server — long-running HTTP endpoint
      values: { routing_mode: "latency" }

    event-bus:
      type: cloud/kafka-topic:1.0.0         # 2. messaging — async pub/sub
      values: { partitions: 3 }

    job-processor:
      type: cloud/batch-worker:1.0.0        # 3. worker — background consumer
      values: {}

    primary-db:
      type: cloud/mariadb:1.0.0             # 4. stateful-server — persistent datastore
      values: {}

    asset-storage:
      type: aws/s3-bucket:1.0.0             # 5. resource — managed cloud resource (no compute)
      values: {}

    db-migration:
      type: cloud/db-migrator:1.0.0         # 6. task — run-to-completion job
      values: {}

    webhook-handler:
      type: aws/lambda:1.0.0                # 7. function — event-driven serverless
      values: {}
```
