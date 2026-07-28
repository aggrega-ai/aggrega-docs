# MariaDB worked example

This page walks through a full production-grade MariaDB Component end-to-end: the SchemaLibrary entry that holds the bulk of the schema, the Component definition that consumes it, the MappingLibrary entry that holds the bulk of the Recipe mapping, the Recipe definition that consumes it, the Aggregate composing MariaDB with an API server, the Manifest binding selectors to Recipes, and the Release supplying production parameter values.

The example is realistic. It covers standalone and replication architectures, primary and secondary node pools with full resource specifications, metrics configuration with Prometheus ServiceMonitor, backup configuration with S3 destination, full credential management for root + optional replication credentials, and the Bitnami chart 20.x-specific implementation invariants the Recipe enforces. Every authoring surface uses the compact form for schema content, JSON Schema 2020-12 cross-document `$ref:` for library composition, and Go templates with `$import:` for mapping library reuse.

## The catalog structure

The example organises catalog content into per-entity directories:

```text
catalog/
├── components/
│   └── core/
│       └── datastore/
│           └── mariadb/
│               └── component.yaml          # The Component definition
├── recipe/
│   └── helm/
│       └── mariadb-bitnami/
│           └── recipe.yaml                 # The Helm Recipe
├── schemalibs/
│   └── aggrega-datastores/
│       └── library.yaml                    # SchemaLibrary with MariaDBPayload + helpers
├── mappinglibs/
│   └── aggrega-bitnami-helpers/
│       └── library.yaml                    # MappingLibrary with MariaDBBitnamiCore + helpers
├── aggregates/
│   └── checkout-service.yaml               # Aggregate composing API + MariaDB
├── manifests/
│   └── k8s-prod.yaml                       # Manifest binding for production
└── releases/
    └── prod-release.yaml                   # Release with production values
```

Each file is shown in full below.

## The SchemaLibrary entry

```yaml
# schemalibs/aggrega-datastores/library.yaml
apiVersion: aggrega.ai/v1alpha1
kind: SchemaLibrary
metadata:
  name: aggrega/datastores
  version: 1.0.0
  description: "Shared schemas for stateful datastore Components."

spec:
  schemas:
    PodResources:
      requests:
        cpu: { type: string, pattern: "^[0-9]+(m|\\.[0-9]+)?$" }
        memory: { type: string, pattern: "^[1-9][0-9]*(Mi|Gi)$" }
      limits:
        cpu: { type: string, pattern: "^[0-9]+(m|\\.[0-9]+)?$" }
        memory: { type: string, pattern: "^[1-9][0-9]*(Mi|Gi)$" }

    PersistenceSpec:
      size: { type: string, pattern: "^[1-9][0-9]*(Mi|Gi|Ti)$", required: true }
      storageClass: { type: string }
      accessModes:
        type: array
        items: { type: string, enum: [ReadWriteOnce, ReadWriteMany, ReadOnlyMany] }
        default: [ReadWriteOnce]

    NodePool:
      replicaCount: { type: integer, min: 1, max: 9, default: 1 }
      resources: { $ref: "#/schemas/PodResources" }
      persistence: { $ref: "#/schemas/PersistenceSpec" }
      nodeSelector: { type: object, valuesType: string }
      podAntiAffinityPreset: { type: string, enum: [soft, hard, ""], default: soft }

    MariaDBAuth:
      username: { type: string, pattern: "^[a-zA-Z][a-zA-Z0-9_]*$", default: app_user }
      database: { type: string, pattern: "^[a-zA-Z][a-zA-Z0-9_]*$", required: true }
      existingSecret: { type: string }

    MariaDBPayload:
      architecture: { type: string, enum: [standalone, replication], default: standalone }
      image:
        tag: { type: string, default: "11.4.4-debian-12-r0" }
        pullPolicy: { type: string, enum: [Always, IfNotPresent, Never], default: IfNotPresent }
      auth: { $ref: "#/schemas/MariaDBAuth", required: true }
      primary: { $ref: "#/schemas/NodePool", required: true }
      secondary:
        $ref: "#/schemas/NodePool"
        when: '{{ eq $.architecture "replication" }}'
        required: true
        properties:
          replicaCount: { min: 2 }
      metrics:
        enabled: { type: boolean, default: false }
        serviceMonitor:
          enabled: { type: boolean, default: false }
          namespace: { type: string }
          interval: { type: string, pattern: "^[0-9]+(s|m|h)$", default: "30s" }
      backup:
        enabled: { type: boolean, default: false }
        schedule: { type: string, pattern: "^[0-9*/,-]+ [0-9*/,-]+ [0-9*/,-]+ [0-9*/,-]+ [0-9*/,-]+$" }
        retention_days: { type: integer, min: 1, max: 365, default: 30 }
        s3_bucket: { type: string, format: uri, validate: '{{ hasPrefix "s3://" . }}', validateMessage: "s3_bucket must use s3:// URI scheme" }
```

The library carries five named schemas (`PodResources`, `PersistenceSpec`, `NodePool`, `MariaDBAuth`, `MariaDBPayload`) with full field constraints, pattern validation, conditional shape via `when:`, per-field custom validation via `validate:` / `validateMessage:`, and cross-references via `$ref:`. The library is published to OCI; consumer Components reference it via the canonical `$ref:` URL.

## The Component

```yaml
# components/core/datastore/mariadb/component.yaml
apiVersion: aggrega.ai/v1alpha1
kind: Component
metadata:
  name: core/datastore/mariadb
  version: 1.0.0
  labels:
    component.aggrega.ai/type: stateful-server
    component.aggrega.ai/category: datastore
  description: "MariaDB managed instance with optional replication."

spec:
  schema:
    values:
      $ref: Datastores#/schemas/MariaDBPayload

    infra:
      cpu_arch: { type: string, enum: [amd64, arm64], default: amd64 }
      kubernetes_version: { type: string, pattern: "^v?[0-9]+\\.[0-9]+(\\.[0-9]+)?$" }

    provides:
      host: { type: string, format: hostname }
      port: { type: integer, min: 1024, max: 65535 }
      connection_url: { type: string, format: uri }
      replicas:
        type: object
        properties:
          primary: { type: integer }
          secondary: { type: integer }

  usesSchema: {}    # MariaDB is a leaf in the dependency graph

  featuresSchema:
    root_credentials:
      required: true
      inject:
        username: auth.rootUser
        password: auth.rootPassword
      description: "Root credentials for MariaDB administration."

    replication_credentials:
      required: false
      inject:
        username: auth.replicationUser
        password: auth.replicationPassword
      description: "Replication credentials, required when architecture: replication."

  assertions: |
    {{- /* Architectural rule: replication requires at least 2 secondary replicas */ -}}
    {{- if eq .values.architecture "replication" -}}
      {{- if lt .values.secondary.replicaCount 2 -}}
        {{- fail "architecture=replication requires secondary.replicaCount >= 2" -}}
      {{- end -}}
    {{- end -}}

    {{- /* Architectural rule: replication requires replication_credentials secret */ -}}
    {{- if eq .values.architecture "replication" -}}
      {{- if not .features.replication_credentials -}}
        {{- fail "architecture=replication requires replication_credentials secret to be supplied" -}}
      {{- end -}}
    {{- end -}}

    {{- /* Architectural rule: backup requires schedule when enabled */ -}}
    {{- if and .values.backup.enabled (not .values.backup.schedule) -}}
      {{- fail "backup.schedule is required when backup.enabled=true" -}}
    {{- end -}}

    {{- /* Architectural rule: total node count cap */ -}}
    {{- $total := add .values.primary.replicaCount (default 0 .values.secondary.replicaCount) -}}
    {{- if gt $total 9 -}}
      {{- fail (printf "total node count exceeds 9: got %d (primary=%d, secondary=%d)"
                       $total .values.primary.replicaCount
                       (default 0 .values.secondary.replicaCount)) -}}
    {{- end -}}
```

The body schema lives in the SchemaLibrary; the Component imports it via `$ref:`. The `infra:` and `provides:` pillars are inline (small and Component-specific). The `usesSchema:` is empty — MariaDB is a leaf in the dependency graph, it does not declare outbound sockets. The `featuresSchema:` declares two slots: a required root credential and an optional replication credential. The `assertions:` block carries four rules covering architectural invariants the Component contract requires regardless of which Recipe binds.

## The MappingLibrary entry

```yaml
# mappinglibs/aggrega-bitnami-helpers/library.yaml
apiVersion: aggrega.ai/v1alpha1
kind: MappingLibrary
metadata:
  name: aggrega/bitnami-helpers
  version: 1.0.0
  description: "Shared mapping fragments for Bitnami chart conventions."

spec:
  mappings:
    BitnamiPodResources: |
      {{ define "BitnamiPodResources" }}
      requests:
        cpu: {{ .requests.cpu | default "250m" | quote }}
        memory: {{ .requests.memory | default "512Mi" | quote }}
      limits:
        cpu: {{ .limits.cpu | default "500m" | quote }}
        memory: {{ .limits.memory | default "1Gi" | quote }}
      {{ end }}

    BitnamiPersistence: |
      {{ define "BitnamiPersistence" }}
      enabled: true
      size: {{ .size | default "20Gi" | quote }}
      {{- if .storageClass }}
      storageClass: {{ .storageClass | quote }}
      {{- end }}
      accessModes:
      {{- range .accessModes | default (list "ReadWriteOnce") }}
        - {{ . | quote }}
      {{- end }}
      {{ end }}

    MariaDBBitnamiCore: |
      {{- with .values -}}
      image:
        tag: {{ .image.tag | quote }}
        pullPolicy: {{ .image.pullPolicy }}
      architecture: {{ .architecture }}
      auth:
        username: {{ .auth.username | quote }}
        database: {{ .auth.database | quote }}
        {{- if .auth.existingSecret }}
        existingSecret: {{ .auth.existingSecret | quote }}
        {{- end }}
        rootUser: {{ $.features.root_credentials.username | quote }}
        rootPassword: {{ $.features.root_credentials.password | quote }}
        {{- if .secondary }}
        replicationUser: {{ $.features.replication_credentials.username | quote }}
        replicationPassword: {{ $.features.replication_credentials.password | quote }}
        {{- end }}
      primary:
        name: primary
        replicaCount: {{ .primary.replicaCount }}
        resources:
          {{- include "BitnamiPodResources" .primary.resources | nindent 4 }}
        persistence:
          {{- include "BitnamiPersistence" .primary.persistence | nindent 4 }}
        nodeSelector:
          {{- range $k, $v := .primary.nodeSelector }}
          {{ $k }}: {{ $v | quote }}
          {{- end }}
        podAntiAffinityPreset: {{ .primary.podAntiAffinityPreset | quote }}
      {{- if eq .architecture "replication" }}
      secondary:
        name: secondary
        replicaCount: {{ .secondary.replicaCount }}
        resources:
          {{- include "BitnamiPodResources" .secondary.resources | nindent 4 }}
        persistence:
          {{- include "BitnamiPersistence" .secondary.persistence | nindent 4 }}
        nodeSelector:
          {{- range $k, $v := .secondary.nodeSelector }}
          {{ $k }}: {{ $v | quote }}
          {{- end }}
        podAntiAffinityPreset: {{ .secondary.podAntiAffinityPreset | quote }}
      {{- end }}
      metrics:
        enabled: {{ .metrics.enabled }}
        serviceMonitor:
          enabled: {{ .metrics.serviceMonitor.enabled }}
          {{- if .metrics.serviceMonitor.namespace }}
          namespace: {{ .metrics.serviceMonitor.namespace | quote }}
          {{- end }}
          interval: {{ .metrics.serviceMonitor.interval | quote }}
      {{- end }}
```

The mapping uses two helper templates (`BitnamiPodResources`, `BitnamiPersistence`) defined within the library and the main `MariaDBBitnamiCore` entry references them via `include`. The mapping handles the standalone-vs-replication architecture variants, credential injection from `.features.*`, and the metrics block. Consumer Recipes import the entire `MariaDBBitnamiCore` entry via library-form `$import:`.

*Note on the `| default` filter, the `.Values` capital-V convention, and the `include` directive in this MappingLibrary: the fragments shown above are shaped for downstream consumption by Helm's chart-template engine, where Helm conventions are the established idiom — `.Values.X` for chart values, `default` for absent-field fallback, `include` for composing helper templates. The `optional` helper that Aggrega adds for absent-field fallback on its own renderer (Recipe `valuesMapping:` content, FeatureRecipe `injectMapping:`, and similar) is not registered in Helm's template engine. Likewise `include` is not registered in Aggrega's renderer. The MappingLibrary entity stores fragments verbatim; the authoring shape follows where the fragment is meant to render. The Bitnami-flavored library above renders Helm chart values; the Aggrega-side authoring shape uses lowercase `.values.X` and the presence-aware `optional` helper for fallback — see [sprig-functions.md](../templates/sprig-functions.md#optional--presence-aware-fallback) for the Aggrega convention.*

## The Recipe

```yaml
# recipe/helm/mariadb-bitnami/recipe.yaml
apiVersion: aggrega.ai/v1alpha1
kind: Recipe
metadata:
  name: mariadb-bitnami
  version: 1.0.0
  labels:
    recipe.aggrega.ai/scope: kubernetes
  description: "Bitnami MariaDB Helm chart 20.x for Kubernetes."

spec:
  capability: helm
  implements: core/datastore/mariadb:^1.0.0

  source:
    # Planned provider-declared form; the built-in resolver today uses { kind, url, version }.
    chart: oci://registry-1.docker.io/bitnamicharts/mariadb
    version: "20.0.0"

  valuesMapping:
    $import: BitnamiHelpers#/mappings/MariaDBBitnamiCore

  provides: |
    host: {{ .recipe.metadata.name }}-primary.{{ .recipe.metadata.namespace }}.svc.cluster.local
    port: 3306
    connection_url: mysql://{{ .values.auth.username }}:****@{{ .recipe.metadata.name }}-primary.{{ .recipe.metadata.namespace }}.svc.cluster.local:3306/{{ .values.auth.database }}
    replicas:
      primary: {{ .values.primary.replicaCount }}
      {{- if eq .values.architecture "replication" }}
      secondary: {{ .values.secondary.replicaCount }}
      {{- else }}
      secondary: 0
      {{- end }}

  assertions: |
    {{- /* Bitnami chart 20.x: serviceMonitor namespace required for replication */ -}}
    {{- if and (eq .values.architecture "replication") .values.metrics.serviceMonitor.enabled -}}
      {{- if not .values.metrics.serviceMonitor.namespace -}}
        {{- fail "Bitnami MariaDB 20.x requires metrics.serviceMonitor.namespace when architecture=replication and metrics.serviceMonitor.enabled=true" -}}
      {{- end -}}
    {{- end -}}

    {{- /* Bitnami 20.x: ARM64 incompatible with podAntiAffinityPreset=hard */ -}}
    {{- if and (eq .values.primary.podAntiAffinityPreset "hard") (eq .infra.cpu_arch "arm64") -}}
      {{- fail "Bitnami MariaDB 20.x is incompatible with ARM64 nodes when podAntiAffinityPreset=hard; use 'soft' or omit" -}}
    {{- end -}}
```

The Recipe is small. The mapping body lives in the MappingLibrary; the Recipe imports it via library-form `$import:`. The `provides:` block computes connection details from the rendered chart's deterministic-naming output. The `assertions:` block carries two rules tied to Bitnami chart 20.x — implementation invariants distinct from the Component-level contract invariants.

## The Aggregate

```yaml
# aggregates/checkout-service.yaml
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: my-org/checkout-service
  version: 1.0.0

spec:
  parameters:
    environment:
      type: string
      enum: [dev, staging, prod]
      required: true
      description: "Deployment environment."

    region:
      type: string
      pattern: "^[a-z]{2}-[a-z]+-\\d$"

    database:
      replicas:
        type: integer
        min: 1
        max: 9
        default: 1
      size:
        type: string
        pattern: "^[1-9][0-9]*(Mi|Gi|Ti)$"
        default: "20Gi"
      backup:
        enabled:
          type: boolean
          default: false
        retention_days:
          type: integer
          min: 1
          max: 365
          default: 30

    api:
      log_level:
        type: string
        enum: [debug, info, warn, error]
        default: info
      cache_ttl_seconds:
        type: integer
        min: 1
        max: 86400
        default: 60

  components:
    db:
      type: core/datastore/mariadb:1.0.0
      values:
        architecture: '{{ if eq .parameters.environment "prod" }}replication{{ else }}standalone{{ end }}'
        primary:
          replicaCount: '{{ .parameters.database.replicas }}'
          persistence:
            size: '{{ .parameters.database.size }}'
        {{- if eq .parameters.environment "prod" }}
        secondary:
          replicaCount: '{{ sub .parameters.database.replicas 1 }}'
          persistence:
            size: '{{ .parameters.database.size }}'
        {{- end }}
        auth:
          database: checkout
        backup:
          enabled: '{{ .parameters.database.backup.enabled }}'
          retention_days: '{{ .parameters.database.backup.retention_days }}'

    api:
      type: my-org/server/checkout-api:1.0.0
      values:
        log_level: '{{ .parameters.api.log_level }}'
        cache_ttl_seconds: '{{ .parameters.api.cache_ttl_seconds }}'
      uses:
        primary_db: db    # Reference to the db Component above
```

The Aggregate composes a MariaDB Component (`db`) with an API server Component (`api`). The typed `parameters:` block declares environment, region, database configuration, and API configuration with nested-structure parameters. The `db.values` template handles the standalone-vs-replication branching based on `.parameters.environment`. The `api.uses.primary_db: db` declares the dependency edge in the graph; the compiler resolves it to the Component instance during selector resolution.

## The Manifest

```yaml
# manifests/k8s-prod.yaml
apiVersion: aggrega.ai/v1alpha1
kind: Manifest
metadata:
  name: my-org/k8s-prod-manifest
  version: 1.0.0

spec:
  mappings:
    components:
      type:
        core/datastore/mariadb: helm/mariadb-bitnami:1.0.0
        my-org/server/checkout-api: helm/checkout-api:1.0.0

    features:
      type:
        core/secret-value: helm/vault-secret:1.0.0
```

The Manifest's flat URI mapping binds component-type URIs to Recipe URIs. A Recipe URI is at most two segments — an optional leading capability, then the recipe name — plus an optional `:version`; the bare one-segment form resolves whenever a single recipe carries the name. The Manifest itself is capability-agnostic; capability determination flows from each resolved Recipe's `spec.capability` field at orchestrator-time.

## The Release

```yaml
# releases/prod-release.yaml
apiVersion: aggrega.ai/v1alpha1
kind: Release
metadata:
  name: my-org/checkout-service-prod
  version: 1.0.0
  environment: production

spec:
  aggregate: my-org/checkout-service:1.0.0
  manifest: my-org/k8s-prod-manifest:1.0.0

  parameters:
    environment: prod
    region: us-east-1
    database:
      replicas: 3
      size: "200Gi"
      backup:
        enabled: true
        retention_days: 90
    api:
      log_level: warn
      cache_ttl_seconds: 300
```

The Release supplies parameter values for production. The Aggregate's typed-parameter defaults are overridden by the Release's explicit values; the resolved parameters drive the Aggregate's compilation.

## End-to-end build

`aggrega build --release releases/prod-release.yaml` runs the compilation pipeline:

1. **Step 1.** Parameter contract validation against the Aggregate's typed `parameters:` declarations; Release overrides applied; defaults filled; interpolation into the Aggregate's `components.X.values:` templates; parameter purge.
2. **Step 2.** Graph assembly; `db` and `api` Components instantiated; dependency edge `api → db` recorded.
3. **Step 3.** Selector resolution; `api`'s `primary_db: db` resolves to the `db` Component instance.
4. **Step 4a.** Schemas resolved (compact form → JSON Schema 2020-12; SchemaLibrary `MariaDBPayload` resolved via cross-document `$ref:` expansion); instances validated against the resolved schemas.
5. **Step 4b.** Component assertions evaluated (the four rules from the MariaDB Component's `assertions:` block); pass.
6. **Step 5a.** Recipes bound per the Manifest's flat URI mapping (MariaDB → helm/mariadb-bitnami; api → helm/checkout-api); credential Features attached per `featuresSchema:` × Manifest's `features.type` mapping.
7. **Step 5b.** Recipe assertions evaluated (the two Bitnami-specific rules from the Recipe's `assertions:` block); pass.
8. **Step 5c.** Rendering. MariaDB Recipe's `valuesMapping:` (loaded from the MappingLibrary entry) renders into Helm chart values:

```yaml
# Rendered chart values for MariaDB (excerpt)
image:
  tag: "11.4.4-debian-12-r0"
  pullPolicy: IfNotPresent
architecture: replication
auth:
  username: "app_user"
  database: "checkout"
  rootUser: "<from-vault>"
  rootPassword: "<from-vault>"
  replicationUser: "<from-vault>"
  replicationPassword: "<from-vault>"
primary:
  name: primary
  replicaCount: 3
  resources:
    requests:
      cpu: "250m"
      memory: "512Mi"
    limits:
      cpu: "500m"
      memory: "1Gi"
  persistence:
    enabled: true
    size: "200Gi"
    accessModes:
      - "ReadWriteOnce"
  podAntiAffinityPreset: "soft"
secondary:
  name: secondary
  replicaCount: 2
  resources:
    requests:
      cpu: "250m"
      memory: "512Mi"
    limits:
      cpu: "500m"
      memory: "1Gi"
  persistence:
    enabled: true
    size: "200Gi"
    accessModes:
      - "ReadWriteOnce"
  podAntiAffinityPreset: "soft"
metrics:
  enabled: false
  serviceMonitor:
    enabled: false
    interval: "30s"
```

The chart values are what the Helm provider plugin consumes; the rendered output lands at `dist/boundaries/<boundary>/` and is deployable via standard kubectl + Helm tooling.

## Line count comparison

The compact form's compactness, measured against the same schema surface authored in alternative forms:

| Form | Lines | Notes |
| --- | --- | --- |
| JSON Schema YAML | ~198 | Same schema content authored in JSON Schema YAML directly |
| **Compact form** | **~79** | Same schema content; equivalent expressivity |
| Compact form + library extraction | **~30** (Component) + ~50 (library) = ~80 total, **~30 per consumer** | The pattern when the library is shared across multiple Components; per-Component cost drops |

The compact form stays compact while using YAML throughout (familiar to Helm/Kubernetes users) and producing a JSON Schema 2020-12 sidecar consumable by external tooling. The library extraction pattern is where the catalog pays back: as more Components share the schema, the per-Component authoring cost drops.

The MariaDB example covers the full surface needed for production usage. **No `$jsonschema:` escape hatch is needed** for this realistic catalog content. The compact form's vocabulary covers everything this Component requires.

## What this example doesn't show

For clarity:

### Non-standard JSON Schema patterns

If a future Component needs `$dynamicRef` for recursive types, complex `unevaluatedProperties` interactions, or other esoteric JSON Schema 2020-12 features, the `$jsonschema:` escape hatch is available. None of the cases in MariaDB needed it.

### Multiple Recipes per Component

The example shows one Recipe (Bitnami chart for Kubernetes). A real catalog might have alternatives: a hand-rolled chart, a different vendor's chart, a Compose-based variant, an AWS RDS Terraform Recipe. The Component contract is the same; the Recipes vary per provider and per implementation. The Manifest's flat URI mapping selects the appropriate Recipe per workspace.

### Complex multi-component coordination

The example has two Components (`db` + `api`). Larger Aggregates with ten or more Components, complex dependency graphs, and cross-cutting Features stress the Aggregate's `parameters:` block and Manifest's mapping rules more substantially. The per-Component compactness of this example multiplies favourably at scale.

### Custom Features

The example uses standard credential Features. A real catalog might have custom Features for routing rules, observability sidecars, network policies, and similar cross-cutting concerns. Each Feature is its own Component-like contract; the principles in this worked example extend to Features uniformly.

## Cross-pointers

- For the compact-form authoring vocabulary: [`../vocabulary/compact-form-authoring.md`](../vocabulary/compact-form-authoring.md).
- For cross-document `$ref:` resolution semantics: [`../vocabulary/cross-document-ref.md`](../vocabulary/cross-document-ref.md).
- For the assertions block authoring grammar: [`../templates/assertions-block.md`](../templates/assertions-block.md).
- For the typed-parameters template context: [`../templates/parameters-context.md`](../templates/parameters-context.md).
- For the SchemaLibrary entity authoring surface: [`../entities/schemalibrary.md`](../entities/schemalibrary.md).
- For the MappingLibrary entity authoring surface: [`../entities/mappinglibrary.md`](../entities/mappinglibrary.md).
- For the Manifest entity's flat URI mapping: [`../entities/manifest.md`](../entities/manifest.md).
