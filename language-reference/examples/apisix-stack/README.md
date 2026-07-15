# APISIX stack — a dynamic API gateway composed as a module

This example compiles a small, real stack — a **dynamic API gateway** — to
synthesized Kubernetes manifests from one Developer-authored `Aggregate`.

The gateway is not a single component. It is a **module**: a reusable
sub-aggregate that composes two single-workload components —

- a **gateway** that terminates client traffic on its proxy port and holds no
  local state, and
- a **store**, etcd, which holds the gateway's configuration and persists it on
  a volume.

The module wires its own internal edge from the gateway to the store and exports
the gateway as its public endpoint `proxy`. The top-level Aggregate imports the
module by name and renders the composed stack; the operator sizes the module's
internal components in the Release.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: imports the API-gateway module (`core/apisix`). |
| `manifest-helm-synth.yaml` | Maps the gateway and store types to their synth helm Recipes. |
| `release-helm-synth.yaml` | Operator record for the Kubernetes target. Sizes the module's internal components by their module-scoped IDs; anything left to schema defaults renders self-contained. |

## What it demonstrates

- **Composition as a module.** A multi-workload capability — an API gateway that
  is really a proxy plus a configuration store — is packaged as a sub-aggregate
  composing two single-workload components, not as one monolithic component. The
  module is imported by name and reused wherever a gateway is needed.
- **An internal edge inside the module.** The gateway declares a use of the
  store; the store Recipe's `provides` host and port are piped into the gateway
  and composed into its etcd connection. The compiler routes the strings without
  interpreting them.
- **A public endpoint.** The module exports its gateway as `proxy`, the stable
  public name a consumer connects to — decoupled from the module's internal
  component names.
- **Operator sizing of internal components.** The Release addresses the module's
  internal components by their module-scoped IDs (`gateway.store`,
  `gateway.gateway`) to set compute, without the developer's Aggregate restating
  physical sizing.
- **A configuration file mounted alongside runtime-written files.** The gateway
  reads its configuration from a file in a directory it also writes to at
  startup. The Recipe emits that configuration as a ConfigMap and mounts it as a
  single file, so it configures the gateway without masking the files the gateway
  writes there.
- **A static Admin API key.** The gateway administers its routes through an Admin
  API authenticated by a static key. This example pins a deterministic
  development key, so the stack runs self-contained with no external secret.
- **Reproducible images.** Both the gateway and the store pin explicit image
  tags, so the rendered manifests reference stable images.

## Build

The workspace catalog supplies the standard-library entities, so no explicit
catalog flag is needed:

```sh
aggrega build --release release-helm-synth.yaml
```

Rendered artifacts land under `dist/`. The Kubernetes target renders plain
manifests offline — no chart pull is required.

## What the composed stack looks like

The gateway renders as a stateless Deployment plus a ClusterIP Service on the
proxy port. Its configuration is delivered as a ConfigMap mounted as a single
file into the container's conf directory; the config carries the store's
in-cluster Service name and the static Admin API key:

```yaml
apisix:
  node_listen: 9080
deployment:
  role: traditional
  role_traditional:
    config_provider: etcd
  admin:
    admin_key:
      - name: admin
        key: edd1c9f034335f136f87ad84b625c8f1
        role: admin
    admin_listen:
      ip: 0.0.0.0
      port: 9180
  etcd:
    host:
      - "http://gateway.store-default:2379"
    prefix: "/apisix"
    timeout: 30
```

The store renders as a StatefulSet with a persistent volume mounted at
`/etcd-data`, plus a ClusterIP Service and a headless Service.
