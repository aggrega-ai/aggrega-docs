---
example:
  level: advanced
  products: []
  shows: [features, boundaries]
---

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

- **Developer intent (`aggregate.yaml`)** declares only six `example/compute/service`
  components — `gateway`, and `api`/`worker`/`ledger`/`etl`/`reconcile`. **No
  component carries a monitoring `features:` block.**
- **The Manifest (`manifest.yaml`)** binds the annotation to the Feature:
  ```yaml
  features:
    type:
      core/prometheus-exporter: helm/prometheus-exporter:1.0.0   # the FeatureRecipe version binding
    annotations:
      feature.aggrega.ai/monitoring:
        feature: core/prometheus-exporter
        maps:
          infra: [interval, port, path]              # structured-value subkeys → the feature's infra
  ```
- **The Release (`release.yaml`)** sets the annotation once on the `platform`
  boundary and refines it per subtree:
  ```yaml
  platform:
    annotations:
      feature.aggrega.ai/monitoring: {interval: 30s, port: metrics, path: /metrics}   # gateway inherits this
    boundaries:
      payments:
        annotations:
          feature.aggrega.ai/monitoring: {interval: 15s}                              # api/worker/ledger
      batch:
        annotations:
          feature.aggrega.ai/monitoring: {interval: 120s}                             # etl/reconcile
  ```

`core/prometheus-exporter` and its **component-scope** ServiceMonitor
FeatureRecipe are consumed from the standard catalog (this example declares no
local copy). The recipe's chart emits one `monitoring.coreos.com/v1`
ServiceMonitor per attached component, templating `interval`/`port`/`path` from
the resolved annotation — all three are operator scrape knobs in the feature's
`infra`. (It is FeatureRecipe Resource Generation — `source:` + `valuesMapping:`
rendered by the helm provider — not a Wasm mutator or pipeline step.)

## What the rendered output proves

Resolve the lockfile, build it, and inspect `dist/<boundary>/helm/<component>--feature-zdaggrega-zdai-zsmonitoring--<component>-servicemonitor-<component>-scrape.yaml`:

```bash
aggrega pull --release release.yaml
aggrega build --release release.yaml
```

**That filename is worth decoding, because nothing here typed it.** This target
reads only the files sitting directly in a directory, so an attachment's files
land beside the component's own and carry their two coordinates in the filename
instead of in directory segments: the component the Feature is attached to, then
the name it is attached under. Here the second coordinate is not a name anyone
wrote — the annotation mints it, and it is the annotation key itself,
`feature.aggrega.ai/monitoring`. A dot and a slash cannot go into a filename as
written, so each becomes `-z` and a letter: `-zd` for the dot, `-zs` for the
slash. For the `api` component in the `payments` boundary the build writes

```text
dist/payments/helm/api--feature-zdaggrega-zdai-zsmonitoring--api-servicemonitor-api-scrape.yaml
```

The encoding is why the slash in that key opens no directory of its own — which
is the point, since a file one level down is a file a scrape-config consumer
reading the boundary directory would not pick up.

This example consumes `core/prometheus-exporter` and its ServiceMonitor
FeatureRecipe (plus the `helm` provider) from the **standard library**. The
`example/compute/service` demo component and its recipe live in the shared catalog
under the `example/` publisher, alongside those standard-library entities. Its
`.aggrega-config.yaml` declares `hub.aggrega.ai` as the default registry, so the
entities resolve from the hub — neither command needs a `--catalog` flag.

| Component | Boundary | interval | port | path |
| --- | --- | --- | --- | --- |
| `gateway` | platform | `30s` (platform default) | `metrics` | `/metrics` |
| `api` / `worker` / `ledger` | payments | `15s` (override) | `metrics` | `/metrics` |
| `etl` / `reconcile` | batch | `120s` (override) | `metrics` | `/metrics` |

Three facts the table makes concrete:

1. **Annotation-driven, not author-declared.** The Aggregate has no monitoring
   `features:` anywhere, yet six ServiceMonitors render. They exist *only*
   because the annotation expanded `core/prometheus-exporter` onto each component (the
   attachment's `origin` in the build graph is `annotation`, not `explicit`).
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
