# MariaDB worked example

This page walks through a full production-grade MariaDB Component end-to-end: the SchemaLibrary entry that holds the bulk of the schema, the Component definition that consumes it, the MappingLibrary entry that holds the bulk of the Recipe mapping, the Recipe definition that consumes it, the Aggregate composing MariaDB with an API server, the Manifest binding component and Feature types to Recipes, and the Release supplying production parameter values.

The example is realistic. It covers standalone and replication architectures, primary and secondary node pools with full resource specifications, metrics configuration with a Prometheus ServiceMonitor, credentials for the root account, the application user and replication, and the Bitnami chart 25.x-specific implementation invariants the Recipe enforces. A datastore's backup is not part of its contract: it is the `core/backup` attachment the operator writes in the Release. Every authoring surface uses the compact form for schema content, cross-document `$ref:` for library composition, and Go templates with `$import:` for mapping library reuse.

The files below are a workspace you can build. Write each one at the path its first line names and run the two commands under [End-to-end build](#end-to-end-build); the output blocks on this page are copied from a build of these files, as [Reading the output on these pages](reading-the-output.md) describes.

## The catalog structure

The example organises catalog content into per-entity directories, under a workspace root:

```text
.aggrega-config.yaml                        # Marks the workspace root
catalog/
├── components/
│   └── my-org/
│       ├── datastore/
│       │   └── mariadb/
│       │       └── component.yaml          # The Component definition
│       └── server/
│           └── checkout-api/
│               └── component.yaml          # The API server's Component
├── recipe/
│   └── helm/
│       ├── mariadb-bitnami/
│       │   └── recipe.yaml                 # The Helm Recipe
│       └── checkout-api/
│           └── recipe.yaml                 # The API server's Recipe
├── schemalibs/
│   └── aggrega-datastores/
│       └── library.yaml                    # SchemaLibrary with MariaDBPayload + helpers
├── mappinglibs/
│   └── aggrega-bitnami-helpers/
│       └── library.yaml                    # MappingLibrary with MariaDBBitnamiCore
├── aggregates/
│   └── checkout-service.yaml               # Aggregate composing API + MariaDB
├── manifests/
│   └── k8s-prod.yaml                       # Manifest binding for production
└── releases/
    └── prod-release.yaml                   # Release with production values
```

Each file is shown in full below. The first is the workspace configuration:

```yaml
# .aggrega-config.yaml
workspace: {}
default_registry: hub.aggrega.ai
```

The `workspace:` block marks the folder as the workspace root, and the `catalog` directory beside it is read as the workspace's catalog without being named. The example also uses two standard-library entities it does not show — the `core/secret-value` credential Feature and its `helm/env-secret` FeatureRecipe — and `default_registry` names the registry they are pulled from.

## The SchemaLibrary entry

```yaml
# catalog/schemalibs/aggrega-datastores/library.yaml
apiVersion: aggrega.ai/v1beta1
kind: SchemaLibrary
metadata:
  name: Datastores
  version: 1.0.0
  description: "Shared schemas for stateful datastore Components."

spec:
  schemas:
    PodResources:
      requests:
        cpu: { type: string, pattern: "^[0-9]+(m|\\.[0-9]+)?$", default: "250m" }
        memory: { type: string, pattern: "^[1-9][0-9]*(Mi|Gi)$", default: "512Mi" }
      limits:
        cpu: { type: string, pattern: "^[0-9]+(m|\\.[0-9]+)?$", default: "500m" }
        memory: { type: string, pattern: "^[1-9][0-9]*(Mi|Gi)$", default: "1Gi" }

    PersistenceSpec:
      size: { type: string, pattern: "^[1-9][0-9]*(Mi|Gi|Ti)$", required: true }
      storageClass: { type: string }
      accessModes:
        type: array
        items: { type: string, enum: [ReadWriteOnce, ReadWriteMany, ReadOnlyMany] }
        default: [ReadWriteOnce]

    NodePool:
      replicaCount: { type: integer, min: 1, max: 9, default: 1 }
      resources: { $ref: "Datastores#/schemas/PodResources" }
      persistence: { $ref: "Datastores#/schemas/PersistenceSpec" }
      nodeSelector: { type: object, valuesType: string }
      podAntiAffinityPreset: { type: string, enum: [soft, hard, ""], default: soft }

    MariaDBAuth:
      username: { type: string, pattern: "^[a-zA-Z][a-zA-Z0-9_]*$", default: app_user }
      database: { type: string, pattern: "^[a-zA-Z][a-zA-Z0-9_]*$", required: true }
      existingSecret: { type: string }

    MariaDBPayload:
      architecture: { type: string, enum: [standalone, replication], default: standalone }
      image:
        tag: { type: string, validate: '{{ ne . "latest" }}', validateMessage: "image.tag must name a version: latest moves with every chart release" }
        pullPolicy: { type: string, enum: [Always, IfNotPresent, Never], default: IfNotPresent }
      auth: { $ref: "Datastores#/schemas/MariaDBAuth", required: true }
      primary: { $ref: "Datastores#/schemas/NodePool", required: true }
      secondary:
        when: '{{ eq $.architecture "replication" }}'
        required: true
        properties:
          replicaCount: { type: integer, min: 2, max: 8, default: 2 }
          resources: { $ref: "Datastores#/schemas/PodResources" }
          persistence: { $ref: "Datastores#/schemas/PersistenceSpec" }
          nodeSelector: { type: object, valuesType: string }
          podAntiAffinityPreset: { type: string, enum: [soft, hard, ""], default: soft }
      metrics:
        enabled: { type: boolean, default: false }
        serviceMonitor:
          enabled: { type: boolean, default: false }
          namespace: { type: string }
          interval: { type: string, pattern: "^[0-9]+(s|m|h)$", default: "30s" }
```

The library carries five named schemas (`PodResources`, `PersistenceSpec`, `NodePool`, `MariaDBAuth`, `MariaDBPayload`) with full field constraints, defaults, pattern validation, conditional shape via `when:`, per-field custom validation via `validate:` / `validateMessage:`, and cross-references via `$ref:`. A reference names the library by its `metadata.name` — `Datastores#/schemas/<entry>` — and never by where the library is stored. That holds inside the library as well, which is why `NodePool` reaches `PodResources` as `Datastores#/schemas/PodResources`. The same reference resolves whether the library sits in the workspace's catalog, as here, or is published to a registry.

The secondary pool is written out as an object of its own rather than as a `$ref:` to `NodePool`, because a cross-document `$ref:` takes only `properties`, `required` and `description` beside it, and the pool needs a `when:`. What `when:` does there is covered under [The Aggregate](#the-aggregate).

## The Component

```yaml
# catalog/components/my-org/datastore/mariadb/component.yaml
apiVersion: aggrega.ai/v1beta1
kind: Component
metadata:
  name: my-org/datastore/mariadb
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

  usesSchema: {}    # MariaDB is a leaf in the dependency graph

  featuresSchema:
    root_credentials:
      required: true
      inject: []
      description: "Root password for MariaDB administration."

    user_credentials:
      required: true
      inject: []
      description: "Password of the application user auth.username names."

    replication_credentials:
      required: false
      inject: []
      description: "Replication password, required when architecture: replication."

  assertions:
    # Architectural rule: replication requires at least 2 secondary replicas.
    replication-needs-two-secondaries: |
      {{- if eq .values.architecture "replication" -}}
        {{- if lt .values.secondary.replicaCount 2 -}}
          {{- fail "architecture=replication requires secondary.replicaCount >= 2" -}}
        {{- end -}}
      {{- end -}}

    # Architectural rule: replication requires the replication credential.
    replication-needs-credentials: |
      {{- if eq .values.architecture "replication" -}}
        {{- if not (hasKey .features "replication_credentials") -}}
          {{- fail "architecture=replication requires replication_credentials secret to be supplied" -}}
        {{- end -}}
      {{- end -}}

    # Architectural rule: total node count cap.
    total-node-count-within-cap: |
      {{- $secondary := 0 -}}
      {{- if eq .values.architecture "replication" -}}
        {{- $secondary = .values.secondary.replicaCount -}}
      {{- end -}}
      {{- $total := add .values.primary.replicaCount $secondary -}}
      {{- if gt $total 9 -}}
        {{- fail (printf "total node count exceeds 9: got %v (primary=%v, secondary=%v)"
                         $total .values.primary.replicaCount $secondary) -}}
      {{- end -}}
```

The body schema lives in the SchemaLibrary; the Component imports it via `$ref:`. The `infra:` and `provides:` pillars are inline (small and Component-specific). The `usesSchema:` is empty — MariaDB is a leaf in the dependency graph, it does not declare outbound sockets. The `featuresSchema:` declares three slots: required root and application-user credentials, and an optional replication credential. Each slot's `inject: []` leaves delivery to the Recipe: the developer attaches a credential and the Recipe decides where its value goes. The `assertions:` block carries three rules covering architectural invariants the Component contract requires regardless of which Recipe binds.

## The MappingLibrary entry

```yaml
# catalog/mappinglibs/aggrega-bitnami-helpers/library.yaml
apiVersion: aggrega.ai/v1beta1
kind: MappingLibrary
metadata:
  name: BitnamiHelpers
  version: 1.0.0
  description: "Shared mapping fragments for Bitnami chart conventions."

spec:
  mappings:
    MariaDBBitnamiCore: |
      {{- define "BitnamiNodePool" }}
        resources:
          requests:
            cpu: {{ .pool.resources.requests.cpu | quote }}
            memory: {{ .pool.resources.requests.memory | quote }}
          limits:
            cpu: {{ .pool.resources.limits.cpu | quote }}
            memory: {{ .pool.resources.limits.memory | quote }}
        persistence:
          enabled: true
          size: {{ .pool.persistence.size | quote }}
          {{- with optional .pool.persistence "storageClass" "" }}
          storageClass: {{ . | quote }}
          {{- end }}
          accessModes:
          {{- range .pool.persistence.accessModes }}
            - {{ . | quote }}
          {{- end }}
        nodeSelector:
          kubernetes.io/arch: {{ .arch | quote }}
          {{- range $k, $v := optional .pool "nodeSelector" dict }}
          {{ $k }}: {{ $v | quote }}
          {{- end }}
        podAntiAffinityPreset: {{ .pool.podAntiAffinityPreset | quote }}
      {{- end }}
      {{- with .values -}}
      fullnameOverride: {{ $.context.rendered_name | quote }}
      {{- with optional $.infra "kubernetes_version" "" }}
      kubeVersion: {{ . | quote }}
      {{- end }}
      image:
        {{- with optional .image "tag" "" }}
        tag: {{ . | quote }}
        {{- end }}
        pullPolicy: {{ .image.pullPolicy }}
      architecture: {{ .architecture }}
      auth:
        username: {{ .auth.username | quote }}
        database: {{ .auth.database | quote }}
        {{- with optional .auth "existingSecret" "" }}
        existingSecret: {{ . | quote }}
        {{- else }}
        rootPassword: {{ $.context.inject.env.MARIADB_ROOT_PASSWORD | quote }}
        password: {{ $.context.inject.env.MARIADB_PASSWORD | quote }}
        {{- if eq .architecture "replication" }}
        replicationPassword: {{ $.context.inject.env.MARIADB_REPLICATION_PASSWORD | quote }}
        {{- end }}
        {{- end }}
      primary:
        name: primary
      {{- template "BitnamiNodePool" (dict "pool" .primary "arch" $.infra.cpu_arch) }}
      {{- if eq .architecture "replication" }}
      secondary:
        name: secondary
        replicaCount: {{ .secondary.replicaCount }}
      {{- template "BitnamiNodePool" (dict "pool" .secondary "arch" $.infra.cpu_arch) }}
      {{- end }}
      metrics:
        enabled: {{ .metrics.enabled }}
        serviceMonitor:
          enabled: {{ .metrics.serviceMonitor.enabled }}
          {{- with optional .metrics.serviceMonitor "namespace" "" }}
          namespace: {{ . | quote }}
          {{- end }}
          interval: {{ .metrics.serviceMonitor.interval | quote }}
      {{- end }}
```

The entry renders the chart's values. A helper template, `BitnamiNodePool`, writes one node pool's resources, persistence, node selector and anti-affinity preset; the entry declares it with `define` and invokes it with `template`, for the primary pool and, under replication, the secondary pool. The helper is declared inside the entry that uses it, because a Recipe imports one entry and a definition travels with the entry that holds it. The library's defaults fill every resource field the Aggregate leaves out, so the helper reads them without a fallback. The mapping handles the standalone-vs-replication architecture variants, the credentials the attachments deliver (read from `.context.inject.env`), and the metrics block. Consumer Recipes import the entire `MariaDBBitnamiCore` entry via library-form `$import:`.

*Note on the functions this fragment uses: Aggrega's renderer evaluates it, so it uses that renderer's functions — Sprig's, plus Aggrega's presence-aware `optional` for a key that may be absent (see [sprig-functions.md](../templates/sprig-functions.md#optional--presence-aware-fallback)). Helm's `include`, whose output can be piped through `nindent`, is not registered in Aggrega's renderer; `template` writes its output exactly where it stands, so the helper's lines are written at the depth they take under `primary:` and `secondary:`. Helm then renders the chart with the values the fragment produces.*

## The Recipe

```yaml
# catalog/recipe/helm/mariadb-bitnami/recipe.yaml
apiVersion: aggrega.ai/v1beta1
kind: Recipe
metadata:
  name: mariadb-bitnami
  version: 1.0.0
  description: "Bitnami MariaDB Helm chart 25.x for Kubernetes."

spec:
  capability: helm
  implements: my-org/datastore/mariadb:^1.0.0

  source:
    # An OCI chart: the registry path and the chart's name in one URL.
    kind: helm-oci-chart
    url: oci://registry-1.docker.io/bitnamicharts/mariadb
    version: "25.0.8"

  valuesMapping:
    $import: BitnamiHelpers#/mappings/MariaDBBitnamiCore

  provides:
    host: "{{ .context.rendered_name }}{{ if eq .values.architecture `replication` }}-primary{{ end }}"
    port: "3306"
    connection_url: "mysql://{{ .values.auth.username }}@{{ .context.rendered_name }}{{ if eq .values.architecture `replication` }}-primary{{ end }}:3306/{{ .values.auth.database }}"

  assertions:
    # Bitnami chart 25.x: one primary server.
    one-primary: |
      {{- if gt .values.primary.replicaCount 1 -}}
        {{- fail (printf "the Bitnami MariaDB chart runs one primary server, and primary.replicaCount is %v: set it to 1 and size reads with secondary.replicaCount" .values.primary.replicaCount) -}}
      {{- end -}}

    # Bitnami chart 25.x: the ServiceMonitor renders only beside the metrics exporter.
    service-monitor-needs-metrics: |
      {{- if and .values.metrics.serviceMonitor.enabled (not .values.metrics.enabled) -}}
        {{- fail "the Bitnami MariaDB chart renders its ServiceMonitor only when metrics.enabled is true: set metrics.enabled to true, or metrics.serviceMonitor.enabled to false" -}}
      {{- end -}}
```

The Recipe is small. The mapping body lives in the MappingLibrary; the Recipe imports it via library-form `$import:`. The `source:` names the chart in its OCI registry at version 25.0.8. The mapping pins the chart's `fullnameOverride` to the name the build gives the component, `.context.rendered_name`, so the `provides:` block computes the primary's Service name instead of assuming it: the chart names the primary `<name>-primary` under replication and `<name>` alone in standalone mode. The `assertions:` block carries two rules tied to Bitnami chart 25.x — implementation invariants distinct from the Component-level contract invariants. The chart runs one primary server and renders its ServiceMonitor only beside the metrics exporter, so the Recipe refuses each of those values rather than letting it reach a chart that would drop it.

## The Aggregate

The API server the Aggregate composes with MariaDB is a small Component and Recipe of their own. The Component declares the values the API reads and one dependency socket, `primary_db`, whose selector admits a stateful server; the Recipe synthesizes a Deployment and reads the database's published `provides` through that connection:

```yaml
# catalog/components/my-org/server/checkout-api/component.yaml
apiVersion: aggrega.ai/v1beta1
kind: Component
metadata:
  name: my-org/server/checkout-api
  version: 1.0.0
  labels:
    component.aggrega.ai/type: server
    component.aggrega.ai/category: server
  description: "The checkout service's HTTP API."

spec:
  schema:
    values:
      log_level: { type: string, enum: [debug, info, warn, error], default: info }
      cache_ttl_seconds: { type: integer, min: 1, max: 86400, default: 60 }
      region: { type: string }

  usesSchema:
    primary_db:
      selector: "component.aggrega.ai/type=stateful-server"
      required: true
```

```yaml
# catalog/recipe/helm/checkout-api/recipe.yaml
apiVersion: aggrega.ai/v1beta1
kind: Recipe
metadata:
  name: checkout-api
  version: 1.0.0
  description: "The checkout API as a Kubernetes Deployment."

spec:
  capability: helm
  implements: my-org/server/checkout-api:^1.0.0

  workload: |
    apiVersion: aggrega.ai/v1beta1
    kind: Workload
    replicas: 2
    containers:
      main:
        image: "registry.example.com/checkout-api:1.0.0"
        variables:
          LOG_LEVEL: "{{ .values.log_level }}"
          CACHE_TTL_SECONDS: "{{ .values.cache_ttl_seconds }}"
          REGION: "{{ .values.region }}"
          DATABASE_HOST: "{{ .context.uses.db.provides.host }}"
          DATABASE_PORT: "{{ .context.uses.db.provides.port }}"
          DATABASE_URL: "{{ .context.uses.db.provides.connection_url }}"
        ports:
          http: 8080
```

```yaml
# catalog/aggregates/checkout-service.yaml
apiVersion: aggrega.ai/v1beta1
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
      type: object
      properties:
        replicas:
          type: integer
          min: 1
          max: 9
          default: 1
        secondary_replicas:
          type: integer
          min: 2
          max: 8
          default: 2
          description: "Secondary node-pool size, applied where the architecture resolves to replication."
        size:
          type: string
          pattern: "^[1-9][0-9]*(Mi|Gi|Ti)$"
          default: "20Gi"

    api:
      type: object
      properties:
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
      type: my-org/datastore/mariadb:1.0.0
      values:
        architecture: '{{ if eq .parameters.environment "prod" }}replication{{ else }}standalone{{ end }}'
        primary:
          replicaCount: {{ .parameters.database.replicas }}
          persistence:
            size: '{{ .parameters.database.size }}'
        secondary:
          replicaCount: {{ .parameters.database.secondary_replicas }}
          persistence:
            size: '{{ .parameters.database.size }}'
        auth:
          database: checkout
      features:
        root_credentials:
          type: core/secret-value:1.0.0
          values: { key: MARIADB_ROOT_PASSWORD }
        user_credentials:
          type: core/secret-value:1.0.0
          values: { key: MARIADB_PASSWORD }
        replication_credentials:
          type: core/secret-value:1.0.0
          values: { key: MARIADB_REPLICATION_PASSWORD }

    api:
      type: my-org/server/checkout-api:1.0.0
      values:
        log_level: '{{ .parameters.api.log_level }}'
        cache_ttl_seconds: {{ .parameters.api.cache_ttl_seconds }}
        region: '{{ .parameters.region }}'
      uses:
        primary_db: [db]    # Reference to the db Component above
```

The Aggregate composes a MariaDB Component (`db`) with an API server Component (`api`). The typed `parameters:` block declares environment, region, database configuration, and API configuration with nested-structure parameters. The `db.values` template selects the architecture from `.parameters.environment`. The `db.features` block attaches one `core/secret-value` credential to each slot and names the key it delivers under — the keys the mapping reads; the Release supplies the secret values themselves. The `api.uses.primary_db` socket declares the dependency edge in the graph: the build checks `db` against the socket's selector, and the API's Recipe receives what `db`'s Recipe publishes under `.context.uses.db`, since a connection listed by target is keyed by the target's name.

An expression decides a **value**, never whether a key is present. The document has to be well-formed YAML before any expression is evaluated, so an expression sits where a value goes — inside a quoted scalar for `architecture`, bare for the numeric hoists that must stay numbers. That is why `secondary:` is declared unconditionally here rather than wrapped in a branch that would emit or withhold whole lines.

Deciding *whether* the secondary pool applies is the Component's job rather than the Aggregate's. The SchemaLibrary gates that slot with `when: '{{ eq $.architecture "replication" }}'`, so the slot's constraints — including a `replicaCount` of at least two — bind exactly where the architecture resolves to `replication`, and are inert in every environment that resolves to `standalone`. The Aggregate's part is to hoist the pool size as a parameter and let each Release supply it.

## The Manifest

```yaml
# catalog/manifests/k8s-prod.yaml
apiVersion: aggrega.ai/v1beta1
kind: Manifest
metadata:
  name: my-org/k8s-prod-manifest
  version: 1.0.0

spec:
  mappings:
    components:
      type:
        my-org/datastore/mariadb: helm/mariadb-bitnami:1.0.0
        my-org/server/checkout-api: helm/checkout-api:1.0.0

    features:
      type:
        core/secret-value: helm/env-secret:1.0.0
```

The Manifest's flat URI mapping binds component-type URIs to Recipe URIs. A Recipe URI is at most two segments — an optional leading capability, then the recipe name — plus an optional `:version`; the bare one-segment form resolves whenever a single recipe carries the name. The `features` tier binds the credential Feature to `helm/env-secret`, which delivers each attachment's value into the component's inject pipe under the attachment's key. The Manifest itself is capability-agnostic; the build dispatches each resolved Recipe to the provider its `spec.capability` field names.

## The Release

```yaml
# catalog/releases/prod-release.yaml
apiVersion: aggrega.ai/v1beta1
kind: Release
metadata:
  name: my-org/checkout-service-prod
  version: 1.0.0
  environment: production

spec:
  aggregate: my-org/checkout-service:1.0.0
  manifest: ../manifests/k8s-prod.yaml

  parameters:
    environment: prod
    region: us-east-1
    database:
      secondary_replicas: 3
      size: "200Gi"
    api:
      log_level: warn
      cache_ttl_seconds: 300

  boundaries:
    prod:
      components:
        db:
          features:
            root_credentials:
              infra: { origin: "replace-with-the-root-password" }
            user_credentials:
              infra: { origin: "replace-with-the-app-user-password" }
            replication_credentials:
              infra: { origin: "replace-with-the-replication-password" }
        api: {}
```

The Release supplies parameter values for production. The Aggregate's typed-parameter defaults are overridden by the Release's explicit values; the resolved parameters drive the Aggregate's compilation. The Release names its Manifest by path, because a Manifest is not catalog-indexed: it is found in the Release's own directory or at the path the Release gives. The `boundaries:` block places both components in one boundary, `prod`, and supplies each credential's value as the attachment's `infra.origin` — the operator's half of an attachment the developer declared (see [Who names the credential](05-credential-features.md#who-names-the-credential-values-or-infra-exactly-one)). The three `origin` values are placeholders: `helm/env-secret` delivers a value as written, and the chart writes it into the Secret it renders. The other members of the [credential Feature family](05-credential-features.md#the-credential-feature-family) name a secret that already exists or have the target generate one, so no value enters the build.

## End-to-end build

From the workspace root, pull the Release's dependencies once — the standard-library Feature and FeatureRecipe from the hub, the chart from its OCI registry — and build. `--pin-sources` has the pull record the chart's pin in the `entity.lock` beside the Recipe, which a Recipe in your own catalog carries for each input it reads:

```bash
aggrega pull --pin-sources --release catalog/releases/prod-release.yaml
aggrega build --release catalog/releases/prod-release.yaml
```

The build runs the compilation pipeline:

1. **Resolution.** Parameter contract validation against the Aggregate's typed `parameters:` declarations; Release overrides applied; defaults filled; interpolation into the Aggregate's `components.X.values:` templates. Each component's `values` and `infra` are validated against its schema here: the compact form is compiled to JSON Schema 2020-12, the SchemaLibrary's `MariaDBPayload` is expanded through cross-document `$ref:`, and its `when:` gate is applied.
2. **Topology construction.** Graph assembly; `db` and `api` Components instantiated; dependency edge `api → db` recorded.
3. **Graph finalization.** Each credential attachment is validated against the Feature's schema; `api`'s `primary_db` socket selector is checked against `db`'s labels.
4. **Assertion evaluation.** Component assertions evaluated (the three rules from the MariaDB Component's `assertions:` block, and the `core/secret-value` rule that each attachment carries its `origin` in exactly one pillar); pass.
5. **Recipe binding.** Recipes bound per the Manifest's flat URI mapping (MariaDB → helm/mariadb-bitnami; api → helm/checkout-api); the three credential attachments bound to `helm/env-secret` per the Manifest's `features.type` mapping.
6. **Recipe assertion evaluation.** Recipe assertions evaluated (the two Bitnami-specific rules from the Recipe's `assertions:` block); pass.
7. **Rendering.** `helm/env-secret` delivers each credential into the inject pipe; the MariaDB Recipe's `valuesMapping:` (loaded from the MappingLibrary entry) renders the chart's values, and the helm provider renders the chart with them; the API Recipe's Workload is synthesized into a Deployment.

The build prints:

```text
  notice: LINT: Feature "core/secret-value" at core/secret-value:1.0.0 declares property "origin" in both values: and infra: pillars (path: origin)
Total build time:               6.8s
Build completed: 13 files written to <workspace>/dist
```

The notice is [by design](05-credential-features.md#who-names-the-credential-values-or-infra-exactly-one): `core/secret-value` declares `origin` in both pillars so that either author can write it.

The output lands in `dist/boundaries/prod/helm/` — the API's Deployment and the twelve documents the chart renders:

```text
api-deployment.yaml
db-configmap-default-db-primary.yaml
db-configmap-default-db-secondary.yaml
db-networkpolicy-default-db.yaml
db-poddisruptionbudget-default-db-primary.yaml
db-poddisruptionbudget-default-db-secondary.yaml
db-secret-default-db.yaml
db-service-default-db-headless.yaml
db-service-default-db-primary.yaml
db-service-default-db-secondary.yaml
db-serviceaccount-default-db.yaml
db-statefulset-default-db-primary.yaml
db-statefulset-default-db-secondary.yaml
```

The secondary pool shows what the mapping handed the chart — the Release's three replicas and `200Gi` volumes, the node selector built from `infra.cpu_arch`, and the resources the library's defaults filled:

```yaml
# dist/boundaries/prod/helm/db-statefulset-default-db-secondary.yaml
[… omitted: apiVersion, kind and the metadata block]
spec:
  replicas: 3
  [… omitted: revisionHistoryLimit, the selector, serviceName, updateStrategy, the pod template's metadata, the service-account settings and the affinity]
      nodeSelector:
        kubernetes.io/arch: amd64
      [… omitted: the pod's securityContext and its init container]
      containers:
        - name: mariadb
          image: registry-1.docker.io/bitnami/mariadb:latest
          [… omitted: imagePullPolicy and the container's securityContext]
          env:
            - name: BITNAMI_DEBUG
              value: "false"
            - name: MARIADB_REPLICATION_MODE
              value: "slave"
            - name: MARIADB_MASTER_HOST
              value: db-primary
          [… omitted: the remaining environment, the port and the two probes]
          resources:
            limits:
              cpu: 500m
              memory: 1Gi
            requests:
              cpu: 250m
              memory: 512Mi
          [… omitted: the container's volume mounts and the pod's volumes]
  volumeClaimTemplates:
    - metadata:
        name: data
        [… omitted: the labels]
      spec:
        accessModes:
          - "ReadWriteOnce"
        resources:
          requests:
            storage: "200Gi"
```

The image tag is the chart's own default, because the Aggregate sets no `image.tag`; set one to pin the server version.

The API receives what the database's Recipe published, through the `primary_db` connection:

```yaml
# dist/boundaries/prod/helm/api-deployment.yaml
[… omitted: everything above the container's env]
          env:
            - name: LOG_LEVEL
              value: warn
            - name: CACHE_TTL_SECONDS
              value: "300"
            - name: REGION
              value: us-east-1
            - name: DATABASE_HOST
              value: db-primary
            - name: DATABASE_PORT
              value: "3306"
            - name: DATABASE_URL
              value: mysql://app_user@db-primary:3306/checkout
```

A Recipe assertion stops a value the chart cannot honour before anything renders. Set `replicas: 3` under `database` in the Release, pull and build again, and the build stops on the Recipe's `one-primary` rule:

```text
  notice: LINT: Feature "core/secret-value" at core/secret-value:1.0.0 declares property "origin" in both values: and infra: pillars (path: origin)
[CATALOG_ERROR E0033]
  Recipe/FeatureRecipe assertions
  caused by: Recipe "mariadb-bitnami" instance "db" assertion "one-primary": assertion "Recipe/mariadb-bitnami/db/one-primary": template: Recipe/mariadb-bitnami/db/one-primary:2:6: executing "Recipe/mariadb-bitnami/db/one-primary" at <fail (printf "the Bitnami MariaDB chart runs one primary server, and primary.replicaCount is %v: set it to 1 and size reads with secondary.replicaCount" .values.primary.replicaCount)>: error calling fail: assertion failed: the Bitnami MariaDB chart runs one primary server, and primary.replicaCount is 3: set it to 1 and size reads with secondary.replicaCount
```

## Line count comparison

The compact form's compactness, counted as non-blank lines of the files on this page:

| Form | Lines | Notes |
| --- | --- | --- |
| **Compact form** | **55** | The Component's `schema:` block (10 lines) with the library's five entries (46 lines) in place of its one `$ref:` line |
| Compact form + library extraction | **10** (Component `schema:`) + **55** (library file) | The pattern when the library is shared across multiple Components: the library is written once, and each Component's `values` pillar is a single `$ref:` line |

Written as JSON Schema YAML, the same content runs longer: each field's one-line map becomes a nested block, and every object adds `type: object`, `properties:` and a `required:` list. `when:` and `validate:` are compact-form keywords with no JSON Schema keyword of their own.

The compact form stays compact while using YAML throughout (familiar to Helm/Kubernetes users) and compiling to JSON Schema 2020-12 before any value is validated against it. The library extraction pattern is where the catalog pays back: as more Components share the schema, the per-Component authoring cost drops.

The MariaDB example covers the full surface needed for production usage. **No `$jsonschema:` escape hatch is needed** for this realistic catalog content. The compact form's vocabulary covers everything this Component requires.

## What this example doesn't show

For clarity:

### Non-standard JSON Schema patterns

If a future Component needs `$dynamicRef` for recursive types, complex `unevaluatedProperties` interactions, or other esoteric JSON Schema 2020-12 features, the `$jsonschema:` escape hatch is available. None of the cases in MariaDB needed it.

### Multiple Recipes per Component

The example shows one Recipe for the MariaDB Component (the Bitnami chart for Kubernetes). A real catalog might have alternatives: a hand-rolled chart, a different vendor's chart, a Compose-based variant, an AWS RDS Terraform Recipe. The Component contract is the same; the Recipes vary per provider and per implementation. The Manifest's flat URI mapping selects the Recipe each Release builds with.

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
