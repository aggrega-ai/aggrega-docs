# Recipe Input Kinds — Worked Examples

Four worked Recipes exercising the three input kinds (sourced, synthesized, artifacts) in different combinations. The conceptual composition model — how the three kinds compose by addition — lives in [../../architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md). The Workload kind's authoring surface lives in [../entities/workload.md](../entities/workload.md); the Recipe entity's keyword surface in [../entities/recipe.md](../entities/recipe.md); and the pillar context (`.values`, `.infra`, `.context`, `.locals`, `.features`) in [../vocabulary/data-pillars.md](../vocabulary/data-pillars.md).

## Example 19: Minimal synthesized Recipe (stateless HTTP service)

Pattern: **synthesized mode** — no `source:`, no `artifacts:`; the Workload alone drives all output. Pillars exercised: `.values`, `.infra`, `.context.inject`, `.features`. Expected output: one Deployment + one ClusterIP Service per node.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Recipe
metadata:
  name: api-server-helm
  version: 1.0.0
  maintainers:
    - name: Example Author
      email: e@example.com
spec:
  capability: helm
  implements: core/compute/server:1.0.0

  locals:
    port: "{{ optional .values `port` 8080 }}"

  provides:
    host: "{{ .context.rendered_name }}-http"
    port: "{{ .locals.port }}"
    protocol: http

  workload: |
    apiVersion: aggrega.ai/v1alpha1
    kind: Workload
    replicas: {{ optional .infra `replicas` 1 }}

    containers:
      main:
        image: "{{ .values.image }}:{{ optional .values `tag` `latest` }}"
        variables:
          {{- range $k, $v := .context.inject.env }}
          {{ $k }}: "{{ $v }}"
          {{- end }}
          LOG_LEVEL: "{{ optional .values `log_level` `info` }}"
        attachments:
          {{- range $name, $attachment := .features }}
          {{ upper $name | replace "-" "_" }}:
            from: {{ $name }}
            as: env
          {{- end }}
        ports:
          web: {{ .locals.port }}
        resources:
          requests:
            cpu: "{{ optional .infra `cpu_request` `100m` }}"
            memory: "{{ optional .infra `memory_request` `128Mi` }}"
        health:
          ready:
            http: "{{ optional .values `health_path` `/healthz` }}"

    services:
      http:
        type: ClusterIP
        ports:
          web: {{ .locals.port }}
```

Synthesized output for `instance_id: api`, `values.port: 8080`, `infra.replicas: 2`:

- `dist/boundaries/production/api-deployment.yaml` — Kubernetes Deployment
- `dist/boundaries/production/api-service.yaml` — Kubernetes ClusterIP Service

## Example 20: Multi-container synthesized Recipe with ConfigMap volumes

Pattern: **synthesized with artifacts** (mixed) — the Workload drives the pod spec; two inline `artifacts:` entries produce the ConfigMaps that the Workload's `volumes:` references. Pillars exercised: `.values`, `.infra`, `.locals`, `.context.rendered_name`, `.workload` (from artifacts). Expected output: one Deployment with two containers, two Services, and two ConfigMap YAML files.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Recipe
metadata:
  name: api-with-envoy-helm
  version: 1.0.0
spec:
  capability: helm
  implements: core/compute/server:1.0.0

  locals:
    # The suffix each ConfigMap's name carries after the rendered name
    app_cm: "app-config"
    envoy_cm: "envoy-config"

  provides:
    host: "{{ .context.rendered_name }}-http"
    port: "8080"

  workload: |
    apiVersion: aggrega.ai/v1alpha1
    kind: Workload
    replicas: {{ optional .infra `replicas` 2 }}

    containers:
      main:
        image: "{{ .values.image }}"
        ports:
          web: 8080
        variables:
          CONFIG_PATH: /etc/app/config.yaml
        volumeMounts:
          - name: app-config
            path: /etc/app
            readonly: true
          - name: cache
            path: /var/cache/app
        health:
          ready:
            http: /healthz

      envoy:
        image: envoyproxy/envoy:v1.28
        command: [/usr/local/bin/envoy]
        args: [-c, /etc/envoy/envoy.yaml, --log-level, info]
        ports:
          proxy: 9901
          admin: 9902
        volumeMounts:
          - name: envoy-config
            path: /etc/envoy
            readonly: true

    volumes:
      app-config:
        configmap:
          source: "{{ .context.rendered_name }}-{{ .locals.app_cm }}"
      envoy-config:
        configmap:
          source: "{{ .context.rendered_name }}-{{ .locals.envoy_cm }}"
      cache:
        persistent:
          size: "5Gi"
          class: "gp3"

    services:
      http:
        type: ClusterIP
        ports:
          web: 8080
      admin:
        type: ClusterIP
        ports:
          proxy: 9901
          admin: 9902

  artifacts:
    app-config.yaml: |
      apiVersion: v1
      kind: ConfigMap
      metadata:
        name: {{ .context.rendered_name }}-{{ .locals.app_cm }}
      data:
        config.yaml: |
          listen: 0.0.0.0:{{ .workload.containers.main.ports.web }}
          log_level: {{ optional .values `log_level` "info" }}

    envoy-config.yaml: |
      apiVersion: v1
      kind: ConfigMap
      metadata:
        name: {{ .context.rendered_name }}-{{ .locals.envoy_cm }}
      data:
        envoy.yaml: |
          static_resources:
            listeners:
              - name: main
                address: { socket_address: { address: 0.0.0.0, port_value: 9901 } }
                # ... full envoy config
```

The artifact templates reference `.workload.containers.main.ports.web` rather than duplicating the port literal. This is self-containment in action: the Recipe emits both the ConfigMaps and the Workload that consumes them, all templated from the Recipe's own context.

Each ConfigMap is named after `.context.rendered_name` — the release name the helm provider names the workload's resources after, spelled in the characters a Kubernetes name allows — followed by the suffix a local carries. A local cannot read the rendered name, so the volume and the artifact each join the two, and the name a volume mounts is the name the artifact emits.

## Example 21: Mixed sourced Recipe with artifacts

Pattern: **sourced with artifacts** — the Bitnami MariaDB chart renders the StatefulSet/Service; one inline artifact adds a Prometheus ServiceMonitor alongside. Pillars exercised: `.values`, `.infra`, `.context.rendered_name`. Expected output: chart-rendered Kubernetes manifests + one ServiceMonitor YAML.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Recipe
metadata:
  name: mariadb-bitnami-enhanced
  version: 1.0.0
spec:
  capability: helm
  implements: core/datastore/mariadb:1.0.0

  provides:
    host: "{{ .context.rendered_name }}"
    port: "{{ .infra.port }}"
    protocol: mariadb

  source:
    # Planned: provider-declared source keys, validated by the provider's Wasm plugin.
    # The built-in resolver today uses the { kind, url, version } form.
    registry: oci://registry-1.docker.io/bitnamicharts
    chart: mariadb
    version: "{{ optional .infra `source_version` `25.0.8` }}"

  valuesMapping: |
    fullnameOverride: "{{ .context.rendered_name }}"
    auth:
      database: "{{ .values.database }}"
      existingSecret: "{{ .context.rendered_name }}-mariadb-auth"
    primary:
      resources:
        requests:
          cpu: "{{ .infra.compute.cpu }}"
          memory: "{{ .infra.compute.memory }}"

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

The Recipe mixes chart output with an additional ServiceMonitor artifact; both land in the output directory. The ServiceMonitor's own name and its selector read `.context.rendered_name`, the release name the chart renders its resources under: the chart stamps that name on its resources' `app.kubernetes.io/instance` label, so a selector built from `.context.instance_id` would match nothing for a Component whose name carries an underscore or a capital. The artifact key is the output filename, used as written, so the build halts if a chart template also produced a file named `servicemonitor.yaml`.

## Example 22: External workload file (`workload: { $import: ... }`)

Pattern: **synthesized with artifacts**, using `$import:` on the `workload:` field to keep the Workload grammar in a dedicated file rather than inline. Pillars exercised: `.values`, `.infra`. Expected output: synthesized Deployment + a NetworkPolicy artifact.

```yaml
# recipe.yaml
spec:
  capability: helm
  implements: core/compute/server:1.0.0
  workload:
    $import: ./workload.yaml
  artifacts:
    networkpolicy:
      $import: ./artifacts/networkpolicy.yaml
```

```yaml
# workload.yaml (relative to recipe.yaml)
apiVersion: aggrega.ai/v1alpha1
kind: Workload
replicas: {{ optional .infra `replicas` 1 }}
containers:
  main:
    image: "{{ .values.image }}"
    ports:
      web: 8080
    # ... rest of workload
```

The `workload.yaml` file is Go-templated against the full pillar context before parsing. Same templating rules apply as for inline `workload:`.
