# Annotation-driven monitoring — one annotation, many components

This example attaches a monitoring Feature to **six services across a nested
topology** without writing a single per-component `features:` block. One
operator annotation on the top boundary, refined by two subtree overrides,
expands — via the Manifest's `features.annotations` binding — into a
`core/prometheus-exporter` attachment on every contained component, and each renders
its own Prometheus **ServiceMonitor**.

This is the **annotation-driven Feature expansion** surface: the pattern for
compressing repetitive per-component Feature attachments into a single
annotation that cascades down the boundary tree.

## The shape

- **Developer intent (`aggregate.yaml`)** declares only six `app/service`
  components — `gateway`, and `api`/`worker`/`ledger`/`etl`/`reconcile`. **No
  component carries a monitoring `features:` block.**
- **The Manifest (`manifest.yaml`)** binds the annotation to the Feature:
  ```yaml
  features:
    type:
      core/prometheus-exporter: prometheus-exporter:1.0.0   # the FeatureRecipe version binding
    annotations:
      feature.aggrega.ai/monitoring:
        feature: core/prometheus-exporter
        maps:
          infra: [interval, port, path]              # structured-value subkeys → the feature's infra
  ```
- **The Release (`release.yaml`)** sets the annotation once on the `platform`
  boundary and refines it per subtree:
  ```yaml
  platform:   { monitoring: {interval: 30s, port: metrics, path: /metrics} }   # gateway inherits this
    payments: { monitoring: {interval: 15s} }                                   # api/worker/ledger
    batch:    { monitoring: {interval: 120s} }                                  # etl/reconcile
  ```

`core/prometheus-exporter` and its **component-scope** ServiceMonitor
FeatureRecipe are consumed from the standard catalog (this example declares no
local copy). The recipe's chart emits one `monitoring.coreos.com/v1`
ServiceMonitor per attached component, templating `interval`/`port`/`path` from
the resolved annotation — all three are operator scrape knobs in the feature's
`infra`. (It is Go-native Resource Generation — `source:` + `valuesMapping:` —
not a Wasm mutator or pipeline step.)

## What the rendered output proves

Build it and inspect `dist/<boundary>/helm/features/feature.aggrega.ai/monitoring/<component>-servicemonitor.yaml`:

```bash
aggrega build --release release.yaml
```

This example consumes `core/prometheus-exporter` and its ServiceMonitor
FeatureRecipe (plus the `helm` provider) from the **standard library**. The
`app/service` demo component and its recipe live in the shared catalog under the
`app/` namespace, alongside those standard-library entities. Its
`.aggrega-config.yaml` lists the catalog checkout under `catalog_dirs` and
declares `hub.aggrega.ai` as the default registry, so a standalone consumer
resolves the entities from the hub — the build command needs no `--catalog` flag.

| Component | Boundary | interval | port | path |
| --- | --- | --- | --- | --- |
| `gateway` | platform | `30s` (platform default) | `metrics` | `/metrics` |
| `api` / `worker` / `ledger` | payments | `15s` (override) | `metrics` | `/metrics` |
| `etl` / `reconcile` | batch | `120s` (override) | `metrics` | `/metrics` |

Three facts the table makes concrete:

1. **Annotation-driven, not author-declared.** The Aggregate has no monitoring
   `features:` anywhere, yet six ServiceMonitors render. They exist *only*
   because the annotation expanded `core/prometheus-exporter` onto each component (the
   attachment's IR origin is annotation-synthesised, not explicit).
2. **Per-subkey deep merge.** `payments` and `batch` set only `interval`, yet
   their ServiceMonitors carry `port: metrics` and `path: /metrics` — inherited
   from the platform annotation's structured value, merged per subkey. A subtree
   overrides one field while inheriting its siblings.
3. **Fan-out.** Six components are monitored from **one** platform annotation
   plus **two** one-line overrides — no `features:` block repeated per component.

The ServiceMonitor scrapes the Service's **named** `metrics` port (the synthesized
Service exposes `metrics: 9090`), so the binding's `port: metrics` resolves to a
real endpoint.

## Compile-time vs runtime

This is a Kubernetes/Helm example; the proof is the **rendered** manifests in
`dist/`. The ServiceMonitor `port` references the Service's named port, so the
selector and endpoint match by construction — no cluster is needed to verify the
wiring. A live Prometheus Operator would consume the rendered ServiceMonitors at
deploy time; the compiler's job (annotation → per-component ServiceMonitor with
the cascade-resolved profile) is complete and inspectable ahead of time.

The build is deterministic — re-run it and the output is byte-identical.
