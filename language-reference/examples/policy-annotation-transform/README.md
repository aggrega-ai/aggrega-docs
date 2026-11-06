---
example:
  level: advanced
  products: []
  shows: [policy, features, guardrails]
---

# A policy that attaches Features nobody wrote: annotations injected at `annotation-transform`

A governance policy gives every component of a shop the platform's monitoring
and an AWS IAM role. It does so by adding annotations. The Manifest binds two
annotation keys to two Features, and an annotation under a bound key expands
into a Feature attachment. So the annotations the policy adds bring a
Prometheus ServiceMonitor and a Kubernetes ServiceAccount to each component,
and the Aggregate and the Release write neither.

The policy is attached at the `annotation-transform` role, once for each policy
engine compiled into the CLI: Rego and CEL. The central proof is a control
Release that writes the same annotations by hand. Built with no policy, it
renders the same files, byte for byte, as the Release the policy annotates.

## What it builds

| instance | catalog Component | what it carries in `release.yaml` |
|---|---|---|
| `api` | `example/compute/service` | nothing |
| `worker` | `example/compute/service` | nothing |
| `gateway` | `example/compute/service` | its own monitoring annotation, with a 10-second interval |

All three are compiled to Kubernetes through Helm, into `dist/shop/helm/`.
`example/compute/service` is a demonstration Component in the standard-library
catalog. Every instance of it must carry a `core/prometheus-exporter`
attachment, a requirement the Component states and the build checks.

## The two annotation bindings

`manifest.yaml` gives two annotation keys a meaning:

```yaml
features:
  type:
    core/prometheus-exporter: helm/prometheus-exporter:1.0.0
    core/aws-irsa: helm/aws-irsa:1.0.0
  annotations:
    feature.aggrega.ai/monitoring:
      feature: core/prometheus-exporter
      maps:
        infra:
          - interval
          - port
          - path
    aws-role:
      feature: core/aws-irsa
      maps:
        infra:
          - role_arn
```

A binding that routes several subkeys takes an object naming each of them as
its value, so `feature.aggrega.ai/monitoring` takes
`{interval: …, port: …, path: …}`. A binding that routes one subkey takes a
string, so `aws-role` takes the role's ARN. The attachment an annotation expands
into is named after its key. `core/aws-irsa` names its ServiceAccount after the
attachment, which is why that key carries no dot or slash.

## Attaching the policy

`.aggrega-config.yaml` declares the catalog directories and no governance
attachment. The policy is attached by the file a build names with `--config`:
`governance-rego.yaml` for the Rego engine, `governance-cel.yaml` for the CEL
engine. The Rego one reads:

```yaml
plugins:
  governance:
    - uri: governance/rego:0.8.6
      role: annotation-transform
      with:
        sources:
          - policies/platform-defaults.rego
```

`--config` names the global configuration file for that run, in place of the
one the machine would otherwise read, and this workspace's
`.aggrega-config.yaml` still layers on top of it.

`0.8.6` is a version at which the standard-library catalog carries each engine's
Plugin entity, so the attachment resolves from the catalog the workspace reads.
The engine that runs is the one compiled into the `aggrega` binary running the
build, whatever version the attachment names. The object the monitoring
annotation takes needs an engine that injects an object of subkeys, and the engines of releases before 0.8.7 do not.

## What an annotation-transform policy reads

A policy at `annotation-transform` reads two things:

- **`input.targets`** lists every component it may annotate. Each target has a
  `boundary_path`, a `component_name`, and the `annotations` the Release writes
  on that component, each value as written.
- **`input.binding_keys`** lists the annotation keys the Manifest binds.

`aggrega build --release <release> --dry-run --policy-input <dir>` writes the
payload each role receives into `<dir>` and writes nothing else. After a build
of `release.yaml` has filled its lockfile:

```bash
aggrega build --release release.yaml --config governance-rego.yaml --dry-run --policy-input payloads
jq -c '.binding_keys' payloads/annotation-transform.json
# ["feature.aggrega.ai/monitoring","aws-role"]
jq -c '.targets[]' payloads/annotation-transform.json
# {"boundary_path":"shop","component_name":"api","annotations":{}}
# {"boundary_path":"shop","component_name":"worker","annotations":{}}
# {"boundary_path":"shop","component_name":"gateway","annotations":{"feature.aggrega.ai/monitoring":{"interval":"10s","port":"metrics","path":"/metrics"}}}
```

A target's `annotations` hold what the Release writes on the component itself.
The boundary's `aggrega.ai/namespace` is not among them.

## The policy

`policies/platform-defaults.rego` collects one decision per annotation under
`annotations`. Each decision names the target by the two fields it was read
under, then the key and the value:

```rego
annotations contains {
    "boundary_path": t.boundary_path,
    "component_name": t.component_name,
    "annotation_key": monitoring,
    "annotation_value": {"interval": "30s", "port": "metrics", "path": "/metrics"},
} if {
    monitoring in input.binding_keys
    some t in input.targets
    not monitoring in object.keys(t.annotations)
}

annotations contains {
    "boundary_path": t.boundary_path,
    "component_name": t.component_name,
    "annotation_key": role,
    "annotation_value": sprintf("arn:aws:iam::123456789012:role/shop-%v", [t.component_name]),
} if {
    role in input.binding_keys
    some t in input.targets
    not role in object.keys(t.annotations)
}
```

Each rule fires only for a key in `input.binding_keys`, so the policy adds
nothing a Manifest has not given a meaning to. Each rule also skips a target
that already carries the key. A decision under a key the component already
carries replaces the value the Release wrote. Without that test, `gateway`
would lose its 10-second interval to the policy's 30 seconds.

`policies/platform-defaults.cel` states the same two decisions as one
expression, joining two lists with `+`. A map key is tested with `in` rather
than `object.keys`, and the role's ARN is joined with `+`, since the expression
language has no `sprintf`. The role's half of the expression reads:

```cel
    + input.targets
      .filter(t, "aws-role" in input.binding_keys
                 && !("aws-role" in t.annotations))
      .map(t, {
        "boundary_path": t.boundary_path,
        "component_name": t.component_name,
        "annotation_key": "aws-role",
        "annotation_value": "arn:aws:iam::123456789012:role/shop-" + t.component_name,
      }),
```

## What the build renders

```bash
aggrega build --release release.yaml --config governance-rego.yaml --auto-pull
```

writes twelve files under `dist/shop/helm/`: a Deployment and a Service for
each component, the ServiceMonitor its monitoring annotation expands into, and
the ServiceAccount its `aws-role` annotation expands into. The `spec` of `api`'s
ServiceMonitor, from the annotation the policy injected:

```yaml
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: api
  endpoints:
    - port: metrics
      interval: 30s
      path: /metrics
```

`gateway`'s carries `interval: 10s`, the value its Release entry writes. The
ServiceAccount `api` runs under, from the injected `aws-role`:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: api-aws-role
  namespace: shop
  annotations:
    eks.amazonaws.com/role-arn: "arn:aws:iam::123456789012:role/shop-api"
    aggrega.ai/boundary-path: shop
    aggrega.ai/recipe-uri: "aws-irsa:1.0.0"
  [… omitted: the labels, which carry the version of the aggrega binary that built the file]
```

## Injected or written by hand: the same files

`release-by-hand.yaml` is `release.yaml` with the annotations the policy injects
written on each component by hand. Built with no policy attached,

```bash
aggrega build --release release-by-hand.yaml --auto-pull
```

it writes the same twelve files, byte for byte, as `release.yaml` with the
policy attached on either engine. Nothing is excluded from that comparison:
whether an annotation was injected is not recorded in any rendered file.
`check.sh` compares the trees on every run.

The build reads an injected value exactly as it reads the same value written
in the Release, so the value expands into the same attachment.

## Where the injection is recorded

The build graph records it, and `--ir-graph` prints the graph. Every component
that received an injected annotation carries
`aggrega.ai/injected-by`, naming the plugin, among its Release annotations.
After `aggrega build --release release.yaml --config governance-rego.yaml
--auto-pull --ir-graph`, `api` reads:

```json
"release_annotations": {
  "aggrega.ai/namespace": "shop",
  "aws-role": "arn:aws:iam::123456789012:role/shop-api",
  "aggrega.ai/injected-by": "governance/rego"
},
```

The record is per component, not per key: `gateway` carries it too, for its
`aws-role`. Each attachment the annotations expanded into has
`"origin": "annotation"` in the graph, as it would for an annotation written
by hand.

The Helm target renders no `aggrega.ai/injected-by` annotation, and it says so.
In this build, each component that received an injection adds three warnings
to the output. The first of `api`'s reads:

```text
  warning: node "api" (provider "helm"): target "helm" does not support annotation aggrega.ai/injected-by on synthesized input and ignored it
```

`--no-unsupported-field-warnings` silences that class of warning, and changes
nothing the build writes.

## The role adds annotations, and nothing else

A decision names one component, one annotation key and its value. Nothing in a
decision adds a component, changes a label, or attaches a Feature directly. The
policy reaches a Feature only through a key the Manifest binds, and the
Manifest decides which Feature that is.

A decision cannot remove an annotation either. Its value is a string or an
object of subkeys, and a `null` is refused, naming the injection, because
`null` is how an author opts a component out of an annotation it would inherit.

## A string where the binding routes three subkeys

`governance-monitoring-as-string.yaml` attaches
`policies/monitoring-as-string.rego`, which injects the string `"30s"` under the
monitoring key. That binding routes three subkeys, and a string names none of
them, so

```bash
aggrega build --release release.yaml --config governance-monitoring-as-string.yaml --auto-pull
```

halts, exits `1` and writes no `dist/`. The policy injected the string on `api`
and on `worker`, and each is refused. Each refusal names the plugin that
injected the value and the role it is attached at, so the value is traced to
the policy that decided it, rather than to a line of the Release nobody wrote:

```text
[… omitted: a warning that the attachment is in the global configuration named with --config]
[OPS_ERROR E0367] .spec.boundaries.shop.components.api.annotations
  a scalar annotation value does not route to exactly one path of its binding (Release shop-production, at .spec.boundaries.shop.components.api.annotations, "feature.aggrega.ai/monitoring", carrying the bare value "30s", whose binding routes "interval, port, path", whose value plugin "governance/rego" injected at governance role "annotation-transform")
---
[OPS_ERROR E0367] .spec.boundaries.shop.components.worker.annotations
  a scalar annotation value does not route to exactly one path of its binding (Release shop-production, at .spec.boundaries.shop.components.worker.annotations, "feature.aggrega.ai/monitoring", carrying the bare value "30s", whose binding routes "interval, port, path", whose value plugin "governance/rego" injected at governance role "annotation-transform")
```

## Without the policy

`release.yaml` built with no governance attachment,

```bash
aggrega build --release release.yaml --auto-pull
```

halts. Its Component requires a `core/prometheus-exporter` attachment, and
nothing gives one to `api` or `worker`:

```text
[DEVELOPER_ERROR E0162] aggregate.yaml at .spec.components.api
  missing required feature: attach a Feature of the required type to the component ("core/prometheus-exporter", required by component type "example/compute/service", under the requirement label "monitoring")
---
[DEVELOPER_ERROR E0162] aggregate.yaml at .spec.components.worker
  missing required feature: attach a Feature of the required type to the component ("core/prometheus-exporter", required by component type "example/compute/service", under the requirement label "monitoring")
```

`gateway` is not named, because its Release entry writes its own monitoring.
With the policy attached, the same Release builds: an attachment that an
injected annotation expands into meets the requirement, just as one written by
hand does.

## What the lockfile records

An `annotation-transform` attachment changes what the build renders, so the
lockfile pins it. After the Rego build, `release.lock` carries the attachment
under `mutators:`, with its plugin, its role, and the content and digest of
its policy file:

```yaml
mutators:
    - plugin: governance/rego
      role: annotation-transform
      sources:
        - content: |
            [… omitted: the policy file, as written]
          digest: sha256:4fe7eef3877c3e87c4c9f8b9540874af5ae1411da223876354b33f6d214f5f4e
          path: platform-defaults.rego
```

It also pins the plugin under `plugins:`:

```yaml
plugins:
    - uri: governance/rego
      [… omitted: the artifact digest, which depends on the aggrega binary that built it, recorded twice]
      referenced_from:
        - governance/rego:0.8.6
```

The attachment names a version that catalog carries, so the pin resolves
through the catalog the workspace reads.

## Building

```bash
aggrega build --release release.yaml --config governance-rego.yaml --auto-pull
aggrega build --release release.yaml --config governance-cel.yaml --auto-pull
aggrega build --release release-by-hand.yaml --auto-pull
```

**The standard-library catalog supplies every Component, Feature, Recipe and
FeatureRecipe here, and both engines' Plugin entities.** They resolve from
`hub.aggrega.ai`, the default registry `.aggrega-config.yaml` names. With a
checkout of the catalog ([where to get one](../../../authoring/import/README.md#how-an-import-runs)) named with `--catalog`, nothing is fetched from a
registry, so the builds run offline. `--auto-pull` fills
each Release's lockfile during the build. Lockfiles and the rendered output are
generated, not shipped.

## Checking every build

This self-check runs in a checkout of the documentation repository, which holds
the shared build helper it uses; a copy written by `aggrega scaffold --example`
does not carry that helper.

```bash
./check.sh
```

`check.sh` makes five builds through the build-release helper and checks each
outcome against the one this page describes:

- `release-by-hand.yaml` with no policy is the reference. It must render the six
  files the annotations expand into.
- `release.yaml` with no policy must halt with `E0162` for `api` and `worker`,
  and for no other component.
- `release.yaml` with the policy is built once on each engine. Each build must
  write the reference's files byte for byte, pin the plugin in its lockfile,
  and record all three components as injected by that plugin.
- `release.yaml` with the planted string must halt with the refusal above.

It prints one line per build, then the files the two bindings rendered, and
exits 1 if any outcome differs, printing that build's output:

```text
POLICY  RELEASE               EXIT  EXPECTED  VERDICT
----------------------------------------------------------------------------------------------------
none    release-by-hand.yaml  0     reference OK: the six attachments' files
none    release.yaml          1     halt      OK: E0162 for api and worker
rego    release.yaml          0     pass      OK: byte-identical to the build by hand; pinned; injected
cel     release.yaml          0     pass      OK: byte-identical to the build by hand; pinned; injected
string  release.yaml          1     halt      OK: refused, naming the plugin and its role

files the two annotation bindings rendered, release.yaml with governance-rego.yaml:
  shop/helm/api--aws-role--api-serviceaccount-shop-api-aws-role.yaml
  shop/helm/api--feature-zdaggrega-zdai-zsmonitoring--api-servicemonitor-shop-api-scrape.yaml
  shop/helm/gateway--aws-role--gateway-serviceaccount-shop-gateway-aws-role.yaml
  shop/helm/gateway--feature-zdaggrega-zdai-zsmonitoring--gateway-servicemonitor-shop-gateway-scrape.yaml
  shop/helm/worker--aws-role--worker-serviceaccount-shop-worker-aws-role.yaml
  shop/helm/worker--feature-zdaggrega-zdai-zsmonitoring--worker-servicemonitor-shop-worker-scrape.yaml

check: every build ended as expected.
```

Each build runs in its own copy of this workspace, made in a temporary
directory, with the catalog path in its `.aggrega-config.yaml` made absolute so
that it still resolves from there. Nothing in this directory is written. It uses
the binary the build-release helper resolves, so `AGGREGA_BIN` chooses it, and
arguments after `--` reach every build. Its exit status is the whole verdict.

## Where the compiler does not interpret

The compiler hands the policy the components and the bound keys. It adds the
annotations the policy decides, and expands them through the Manifest's
bindings as it expands any annotation. It does not know that a service should be
monitored, what a scrape interval is, or which IAM role a component should run
under: those meanings belong to the policy and the Manifest. For the roles, the
payloads and the decision keys, see
[the governance socket](../../plugins/policy-socket.md). For annotation
expansion with no policy, see
[annotation-driven-monitoring](../annotation-driven-monitoring/README.md).

## Files

- `aggregate.yaml` — the three services, with no annotation.
- `manifest.yaml` — binds the component type and the two Features to their
  Helm Recipes, and the two annotation keys to the two Features.
- `release.yaml` — the Release the policy annotates; only `gateway` writes an
  annotation.
- `release-by-hand.yaml` — the control: every annotation written by hand.
- `.aggrega-config.yaml` — the default registry; no governance attachment.
- `governance-rego.yaml`, `governance-cel.yaml` — the policy attached at
  `annotation-transform` through each engine, each named with `--config`.
- `governance-monitoring-as-string.yaml` — the planted mistake, named with
  `--config`.
- `policies/platform-defaults.rego`, `policies/platform-defaults.cel` — the
  policy, once per engine.
- `policies/monitoring-as-string.rego` — the planted mistake.
- `build-release.sh` — builds one Release, echoing the equivalent `aggrega build`
  command.
- `check.sh` — makes the five builds and checks each outcome.
