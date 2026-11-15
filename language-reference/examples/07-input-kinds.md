# Recipe Input Kinds

This page explains one idea, the three inputs a Recipe renders from and how they add up, and is not a runnable
workspace. [MariaDB + Adminer — a runnable dual-target example](mariadb-adminer/README.md) realizes one component
with a synthesized Recipe, a fetched chart and artifacts beside them; write it into a folder of your own with:

```sh
aggrega draft --example mariadb-adminer
```

It then prints the commands to run next:

```sh
cd mariadb-adminer
aggrega pull --release release-compose.yaml
aggrega build --release release-compose.yaml
```

A Recipe has three inputs, and uses any combination of them:

- a **Workload** (`workload:`), the build's own description of containers, ports, volumes and services, which the
  provider synthesizes into the target's resources — a Deployment and a Service on Kubernetes, a service on Docker
  Compose;
- a **source** (`source:`), a chart, a module or a template the provider renders, fed by the Recipe's
  `valuesMapping`;
- **artifacts** (`artifacts:`), files the Recipe writes as they are, after templating, beside what the other two
  produce.

How the three compose is set out in [Recipe input composition](../../architecture/16-recipe-input-composition.md); the
Workload's own surface is [entities/workload.md](../entities/workload.md), and the context every template reads —
`.values`, `.infra`, `.context`, `.locals`, `.features` — is [vocabulary/data-pillars.md](../vocabulary/data-pillars.md).

The Recipes below implement a Component the workspace declares for itself, `local/compute/api-server`, with an
`image` and a `port` among its `values`, `replicas` among its `infra`, and `host`, `port` and `protocol` among what it
publishes.

## A Workload alone

With no `source:` and no `artifacts:`, the Workload drives the whole output:

```yaml
kind: Recipe
metadata:
  name: api-server-helm
spec:
  capability: helm
  implements: local/compute/api-server:1.0.0
  locals:
    port: "{{ optional .values `port` 8080 }}"
  provides:
    host: "{{ .context.rendered_name }}-http"
    port: "{{ .locals.port }}"
    protocol: http
  workload: |
    apiVersion: aggrega.ai/v1beta1
    kind: Workload
    replicas: {{ optional .infra `replicas` 1 }}
    containers:
      main:
        image: "{{ .values.image }}"
        variables:
          {{- range $k, $v := .context.inject.env }}
          {{ $k }}: "{{ $v }}"
          {{- end }}
        ports:
          web: {{ .locals.port }}
    services:
      http:
        type: ClusterIP
        ports:
          web: {{ .locals.port }}
```

For a component named `api`, the helm provider writes a Deployment and a ClusterIP Service. The variables the
connections deliver arrive at `.context.inject.env` and are written into the container.

## A Workload and artifacts

Artifacts add files the Workload refers to. A Workload with a second container mounting a ConfigMap, and the
ConfigMap as an artifact:

```yaml
spec:
  locals:
    proxy_cm: "proxy-config"
  workload: |
    apiVersion: aggrega.ai/v1beta1
    kind: Workload
    containers:
      main:
        image: "{{ .values.image }}"
        ports:
          web: 8080
      proxy:
        image: envoyproxy/envoy:v1.28
        volumeMounts:
          - name: proxy-config
            path: /etc/envoy
            readonly: true
    volumes:
      proxy-config:
        configmap:
          source: "{{ .context.rendered_name }}-{{ .locals.proxy_cm }}"
  artifacts:
    proxy-config.yaml: |
      apiVersion: v1
      kind: ConfigMap
      metadata:
        name: {{ .context.rendered_name }}-{{ .locals.proxy_cm }}
      data:
        listen-port: "{{ .workload.containers.main.ports.web.port }}"
```

An artifact reads the Workload at `.workload` rather than repeating its values: a container port reaches it as an
object holding its number under `port`, whichever form the Workload wrote it in. The ConfigMap is named after
`.context.rendered_name`, the name the helm provider gives the component's resources, then a suffix a local carries; a
local cannot read the rendered name, so the volume and the artifact each join the two, and the name the volume mounts
is the name the artifact writes.

## A source and artifacts

A Recipe can render a fetched chart and add files of its own beside it. Here the catalog's `core/datastore/mariadb` is
realized by a vendor's chart, and an artifact adds a Prometheus ServiceMonitor:

```yaml
kind: Recipe
metadata:
  name: mariadb-with-monitor
spec:
  capability: helm
  implements: core/datastore/mariadb:1.0.0
  provides:
    host: "{{ .context.rendered_name }}"
    port: "{{ .infra.port }}"
    protocol: mariadb
  source:
    kind: helm-oci-chart
    url: oci://registry-1.docker.io/bitnamicharts/mariadb
    version: "25.0.8"
  valuesMapping: |
    fullnameOverride: "{{ .context.rendered_name }}"
    auth:
      database: "{{ .values.database }}"
  artifacts:
    servicemonitor.yaml: |
      apiVersion: monitoring.coreos.com/v1
      kind: ServiceMonitor
      metadata:
        name: {{ .context.rendered_name }}-monitor
      spec:
        selector:
          matchLabels:
            app.kubernetes.io/instance: {{ .context.rendered_name }}
        endpoints:
          - port: mysql
            interval: 30s
```

The chart labels its resources with the release name the build gives it, so the selector is built from
`.context.rendered_name`; one built from `.context.instance_id` would match nothing for a component whose name carries
an underscore or a capital. An artifact's key is its output file name, used as written, and the build halts if the
chart also renders a file of that name.

## A Workload kept in a file of its own

`workload:` and an `artifacts:` entry can each import a file instead of holding the text inline:

```yaml
spec:
  workload:
    $import: ./workload/workload.yaml
  artifacts:
    networkpolicy:
      $import: ./artifacts/networkpolicy.yaml
```

The imported Workload file is templated against the same context as an inline one. A file an `artifacts:` entry
imports is pinned before a build reads it: `aggrega pin <recipe-dir>/recipe.yaml` writes an `entity.lock` beside the
Recipe recording the file's digest, and a build halts, naming that command, while the lock records no pin for the file
or the file no longer matches it. [Workload library import — a shared Workload body via `$import`](workload-library-import/README.md)
builds a Recipe whose Workload is imported.
