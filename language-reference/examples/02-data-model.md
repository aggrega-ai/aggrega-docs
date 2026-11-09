# Data Model

## Example 4: The Parallel Namespace — Separating Logic from Physics

The Architect enforces structural separation: the Developer controls cognitive `values`, the Operator controls physical `infra`. They cannot step on each other's fields.

**1. Platform Catalog: The Component with `infra`**
The `schema:` declaration covers both `values` (Developer's domain) and `infra` (Operator's domain) as separate namespaces. The Aggregate schema bans Developers from writing `infra`; the Release schema bans Operators from writing `values`.

```yaml
apiVersion: aggrega.ai/v1beta1
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
apiVersion: aggrega.ai/v1beta1
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
apiVersion: aggrega.ai/v1beta1
kind: Release
metadata:
  name: prod-datastore
  version: 1.0.0
  environment: production
spec:
  aggregate: scalable-datastore
  manifest: global-manifest                # Maps core/postgres to the Recipe below; shown in Example 5
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
apiVersion: aggrega.ai/v1beta1
kind: Recipe
metadata:
  name: postgres-chart-v2
  version: 1.0.0
spec:
  capability: helm
  implements: core/postgres:2.0.0
  source:
    # A chart repository root paired with the chart's name.
    kind: helm-https-chart
    url: https://charts.example.com
    chart: postgresql
    version: 12.1.0
  locals:
    primary_compute: "postgresql"
  provides:
    host: "{{ .context.rendered_name }}"
    port: "5432"
  valuesMapping: |
    fullnameOverride: "{{ .context.rendered_name }}"
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
apiVersion: aggrega.ai/v1beta1
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
apiVersion: aggrega.ai/v1beta1
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
apiVersion: aggrega.ai/v1beta1
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
apiVersion: aggrega.ai/v1beta1
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
A flat, single boundary with laptop-sized `infra`. The developer runs `aggrega build --release local-release.yaml`, and `main-db` renders through the Helm Recipe the base Manifest maps it to, into `dist/deploy/local/helm/`. The swapped credential mapping changes nothing in that output: this Aggregate attaches no Feature to `main-db`, so no credential Feature is realized at all.

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Release
metadata:
  name: local-dev
  version: 1.0.0
  environment: local
spec:
  aggregate: scalable-datastore
  manifest: local-manifest
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

## Example 6: The Cloud-Native Types

Every Component in Aggrega carries one value from the closed set on the reserved `component.aggrega.ai/type` label. This Aggregate puts every one of those values to work in a single standard backend.

The value lives on the Component catalog entity, never on the instance — an Aggregate wires instances and cannot label them — so each comment below names the type the referenced catalog entity carries.

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Aggregate
metadata:
  name: enterprise-backend
  version: 1.0.0
spec:
  components:
    api-gateway:
      type: cloud/api-gateway:1.0.0        # server — long-running HTTP endpoint
      values: { routing_mode: "latency" }

    job-processor:
      type: cloud/batch-worker:1.0.0        # worker — background consumer
      values: {}

    primary-db:
      type: cloud/mariadb:1.0.0             # stateful-server — persistent datastore
      values: {}

    event-bus:
      type: cloud/kafka-broker:1.0.0        # stateful-server — a broker holds its own disk
      values: { partitions: 3 }

    asset-storage:
      type: aws/s3-bucket:1.0.0             # resource — managed cloud resource (no compute)
      values: {}

    db-migration:
      type: cloud/db-migrator:1.0.0         # task — run-to-completion job
      values: {}

    webhook-handler:
      type: aws/lambda:1.0.0                # function — event-driven serverless
      values: {}
```

**The broker is the entry worth reading twice.** `event-bus` is a message broker, and a reader reaching for a type called after its domain will not find one: the reserved axis says how infrastructure must treat a component, and a broker holding its own durable disk is a `stateful-server` exactly as the database above it is. Where the broker *does* differ is the axis a user browses on — its `component.aggrega.ai/category` is `messaging`, and the database's is `datastore`. Two axes, two questions: the category is where you look for a component, the type is what a Recipe emits for it. A selector written against one never matches on the other.
