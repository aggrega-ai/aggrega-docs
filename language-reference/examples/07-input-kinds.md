# Recipe Input Kinds — Worked Examples

Four worked Recipes exercising the three input kinds (sourced, synthesized, artifacts) in different combinations. The conceptual composition model — how the three kinds compose by addition — lives in [../../architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md). The Workload kind's authoring surface lives in [../entities/workload.md](../entities/workload.md); the Recipe entity's keyword surface in [../entities/recipe.md](../entities/recipe.md); and the pillar context (`.values`, `.infra`, `.context`, `.locals`, `.features`) in [../vocabulary/data-pillars.md](../vocabulary/data-pillars.md).

## Example 22: Minimal synthesized Recipe (stateless HTTP service)

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
  implements: core/compute/api:1.0.0

  locals:
    port: "{{ optional .values `port` 8080 }}"

  provides:
    host: "{{ .context.instance_id }}"
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

## Example 23: Multi-container synthesized Recipe with ConfigMap volumes

Pattern: **synthesized with artifacts** (mixed) — the Workload drives the pod spec; two inline `artifacts:` entries produce the ConfigMaps that the Workload's `volumes:` references. Pillars exercised: `.values`, `.infra`, `.locals`, `.context.instance_id`, `.workload` (from artifacts). Expected output: one Deployment with two containers, two Services, and two ConfigMap YAML files.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Recipe
metadata:
  name: api-with-envoy-helm
  version: 1.0.0
spec:
  capability: helm
  implements: core/compute/api:1.0.0

  locals:
    app_cm: "{{ .context.instance_id }}-app-config"
    envoy_cm: "{{ .context.instance_id }}-envoy-config"

  provides:
    host: "{{ .context.instance_id }}"
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
          source: "{{ .locals.app_cm }}"
      envoy-config:
        configmap:
          source: "{{ .locals.envoy_cm }}"
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
    "{{ .locals.app_cm }}.yaml": |
      apiVersion: v1
      kind: ConfigMap
      metadata:
        name: {{ .locals.app_cm }}
      data:
        config.yaml: |
          listen: 0.0.0.0:{{ .workload.containers.main.ports.web }}
          log_level: {{ optional .values `log_level` "info" }}

    "{{ .locals.envoy_cm }}.yaml": |
      apiVersion: v1
      kind: ConfigMap
      metadata:
        name: {{ .locals.envoy_cm }}
      data:
        envoy.yaml: |
          static_resources:
            listeners:
              - name: main
                address: { socket_address: { address: 0.0.0.0, port_value: 9901 } }
                # ... full envoy config
```

The artifact templates reference `.workload.containers.main.ports.web` rather than duplicating the port literal. This is self-containment in action: the Recipe emits both the ConfigMaps and the Workload that consumes them, all templated from the Recipe's own context.

## Example 24: Mixed sourced Recipe with artifacts

Pattern: **sourced with artifacts** — the Bitnami MariaDB chart renders the StatefulSet/Service; one inline artifact adds a Prometheus ServiceMonitor alongside. Pillars exercised: `.values`, `.infra`, `.locals`, `.context.instance_id`. Expected output: chart-rendered Kubernetes manifests + one ServiceMonitor YAML.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Recipe
metadata:
  name: mariadb-bitnami-enhanced
  version: 1.0.0
spec:
  capability: helm
  implements: core/datastore/mariadb:1.0.0

  locals:
    monitor_name: "{{ .context.instance_id }}-monitor"

  provides:
    host: "{{ .context.instance_id }}"
    port: "{{ .infra.port }}"
    protocol: mariadb

  source:
    # Planned: provider-declared source keys, validated by the provider's Wasm plugin.
    # The built-in resolver today uses the { kind, url, version } form.
    registry: oci://registry-1.docker.io/bitnamicharts
    chart: mariadb
    version: "{{ optional .infra `source_version` `25.0.8` }}"

  valuesMapping: |
    auth:
      database: "{{ .values.database }}"
      existingSecret: "{{ .context.instance_id }}-mariadb-auth"
    primary:
      resources:
        requests:
          cpu: "{{ .infra.compute.cpu }}"
          memory: "{{ .infra.compute.memory }}"

  artifacts:
    "{{ .locals.monitor_name }}.yaml": |
      apiVersion: monitoring.coreos.com/v1
      kind: ServiceMonitor
      metadata:
        name: {{ .locals.monitor_name }}
      spec:
        selector:
          matchLabels:
            app.kubernetes.io/instance: {{ .context.instance_id }}
        endpoints:
          - port: mysql
            interval: 30s
```

The Recipe mixes chart output with an additional ServiceMonitor artifact; both land in the output directory. Filename-collision detection verifies no chart template produced a file named `<monitor_name>.yaml`.

## Example 25: External workload file (`workload: { $import: ... }`)

Pattern: **synthesized with artifacts**, using `$import:` on the `workload:` field to keep the Workload grammar in a dedicated file rather than inline. Pillars exercised: `.values`, `.infra`. Expected output: synthesized Deployment + a NetworkPolicy artifact.

```yaml
# recipe.yaml
spec:
  capability: helm
  implements: core/compute/api:1.0.0
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
