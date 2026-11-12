# Shared schema and mapping libraries: a MariaDB Component

This page explains one idea, keeping the bulk of a Component's schema and a Recipe's mapping in libraries that several
entities share, and is not a runnable workspace. [MariaDB + Adminer — a runnable dual-target example](mariadb-adminer/README.md)
composes its database's storage settings from a schema library; write it into a folder of your own with:

```sh
aggrega scaffold --example mariadb-adminer && cd mariadb-adminer
```

The entities on this page are a catalog of your own, in the namespace `my-org`; the shape of each is what a
production-grade MariaDB Component, its Recipe and the two libraries behind them take.

## A schema library holds the shape

A SchemaLibrary declares named schemas, written in the compact form — one line per field, with its type, constraints
and default — which the build compiles to JSON Schema 2020-12 before any value is checked against it. An excerpt:

```yaml
apiVersion: aggrega.ai/v1beta1
kind: SchemaLibrary
metadata:
  name: Datastores
  version: 1.0.0
spec:
  schemas:
    PodResources:
      requests:
        cpu: { type: string, pattern: "^[0-9]+(m|\\.[0-9]+)?$", default: "250m" }
        memory: { type: string, pattern: "^[1-9][0-9]*(Mi|Gi)$", default: "512Mi" }
    NodePool:
      replicaCount: { type: integer, min: 1, max: 9, default: 1 }
      resources: { $ref: "Datastores#/schemas/PodResources" }
    MariaDBPayload:
      architecture: { type: string, enum: [standalone, replication], default: standalone }
      image:
        tag: { type: string, validate: '{{ ne . "latest" }}', validateMessage: "image.tag must name a version: latest moves with every chart release" }
      primary: { $ref: "Datastores#/schemas/NodePool", required: true }
      secondary:
        when: '{{ eq $.architecture "replication" }}'
        required: true
        properties:
          replicaCount: { type: integer, min: 2, max: 8, default: 2 }
```

A reference names the library by its `metadata.name` — `Datastores#/schemas/<entry>` — never by where the library is
stored, inside the library as well, so the same reference resolves whether the library sits in the workspace's catalog
or is published to a registry. `validate:` and `validateMessage:` add a check of a field's own; `when:` makes a whole
object conditional, so the secondary pool's constraints bind only where the architecture resolves to `replication`. A
cross-document `$ref:` takes only `properties`, `required` and `description` beside it, which is why the secondary pool
is written out rather than referencing `NodePool`.

## The Component references it

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Component
metadata:
  name: my-org/datastore/mariadb
  version: 1.0.0
  labels:
    component.aggrega.ai/type: stateful-server
    component.aggrega.ai/category: datastore
spec:
  schema:
    values:
      $ref: Datastores#/schemas/MariaDBPayload
    infra:
      cpu_arch: { type: string, enum: [amd64, arm64], default: amd64 }
    provides:
      host: { type: string, format: hostname }
      port: { type: integer, min: 1024, max: 65535 }
  featuresSchema:
    root_credentials:
      required: true
      inject: []
    replication_credentials:
      required: false
      inject: []
  assertions:
    replication-needs-credentials: |
      {{- if eq .values.architecture "replication" -}}
        {{- if not (hasKey .features "replication_credentials") -}}
          {{- fail "architecture=replication requires replication_credentials secret to be supplied" -}}
        {{- end -}}
      {{- end -}}
```

The `values` pillar is one `$ref:` line; the small, Component-specific `infra` and `provides` stay inline. The
assertions hold rules of the Component's contract that no schema keyword expresses, whichever Recipe realizes it.

## A mapping library holds the translation

A MappingLibrary holds template fragments a Recipe imports. One entry renders a chart's values, and declares a helper
with `define` that it invokes with `template` for each node pool:

```yaml
apiVersion: aggrega.ai/v1beta1
kind: MappingLibrary
metadata:
  name: BitnamiHelpers
  version: 1.0.0
spec:
  mappings:
    MariaDBBitnamiCore: |
      {{- define "BitnamiNodePool" }}
        resources:
          requests:
            cpu: {{ .pool.resources.requests.cpu | quote }}
            memory: {{ .pool.resources.requests.memory | quote }}
      {{- end }}
      {{- with .values -}}
      fullnameOverride: {{ $.context.rendered_name | quote }}
      architecture: {{ .architecture }}
      primary:
        name: primary
      {{- template "BitnamiNodePool" (dict "pool" .primary) }}
      {{- end }}
```

The helper is declared inside the entry that uses it, because a Recipe imports one entry and a definition travels with
the entry holding it. The fragment is evaluated by Aggrega's renderer, so it uses Sprig's functions and Aggrega's
`optional` for a key that may be absent (see [sprig-functions.md](../templates/sprig-functions.md#optional--presence-aware-fallback));
Helm's `include` is not one of them, and `template` writes its output exactly where it stands.

## The Recipe imports it

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Recipe
metadata:
  name: mariadb-bitnami
  version: 1.0.0
spec:
  capability: helm
  implements: my-org/datastore/mariadb:^1.0.0
  source:
    kind: helm-oci-chart
    url: oci://registry-1.docker.io/bitnamicharts/mariadb
    version: "25.0.8"
  valuesMapping:
    $import: BitnamiHelpers#/mappings/MariaDBBitnamiCore
  provides:
    host: "{{ .context.rendered_name }}{{ if eq .values.architecture `replication` }}-primary{{ end }}"
    port: "3306"
```

The Recipe is small: the mapping lives in the library, and the Recipe keeps what is its own — the chart it renders and
the address it publishes. Because the mapping pins the chart's `fullnameOverride` to `.context.rendered_name`, the
Recipe can compute the primary's Service name rather than assume it.

## What the libraries buy

Written as JSON Schema, each field's one-line map becomes a nested block and every object adds `type: object`,
`properties:` and a `required:` list; `when:` and `validate:` have no JSON Schema keyword of their own. The compact form
covers everything this Component needs, with no `$jsonschema:` escape hatch. The saving grows with sharing: the
library is written once, and each further Component's `values` pillar is a single `$ref:` line.

The references: [compact-form authoring](../vocabulary/compact-form-authoring.md),
[cross-document `$ref:`](../vocabulary/cross-document-ref.md), [the assertions block](../templates/assertions-block.md),
[SchemaLibrary](../entities/schemalibrary.md) and [MappingLibrary](../entities/mappinglibrary.md).
