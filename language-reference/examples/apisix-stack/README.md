---
example:
  level: start
  products: [core/datastore/etcd, core/gateway/apisix]
  shows: [modules, parameters, credentials]
---

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
| `aggregate.yaml` | Developer intent: imports the API-gateway module (`core/apisix`) and passes it the gateway's Admin API key from a parameter of its own. |
| `manifest-helm-synth.yaml` | Maps the gateway and store types to their synth helm Recipes, and the credential Feature the module attaches to the realization that reads a Secret already in the namespace. |
| `release-helm-synth.yaml` | Operator record for the Kubernetes target. Names the Secret holding the Admin API key, and sizes the module's internal components by their module-scoped IDs; anything else is left to schema defaults. |

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
- **An Admin API key read from a Secret.** The gateway administers its routes
  through an Admin API, and its key arrives through a credential slot on the
  gateway, which the gateway requires while nothing is wired to its models
  socket, as here, so no default key exists. The module takes the key as a
  parameter, `admin_key`, and attaches the `core/referenced-secret` credential
  Feature to the slot with it; this Aggregate declares a parameter of its own
  and passes it down, and the Release fulfills it. The Manifest maps the
  Feature to `k8s-existing-secret`, so the value is the name of a Secret that
  already exists in the namespace: the build reads no key and renders none, and
  the gateway reads the key from that Secret when it starts. A Release that
  supplies no value halts the build, naming the parameter.
- **Reproducible images.** Both the gateway and the store pin explicit image
  tags, so the rendered manifests reference stable images.

## Build

This workspace carries no `.aggrega-config.yaml`, so the standard-library
entities resolve from the hub registry, `hub.aggrega.ai`, and no catalog flag is
needed; `--auto-pull` writes the lockfile a fresh clone lacks during the build:

```sh
aggrega build --release release-helm-synth.yaml --auto-pull
```

Rendered artifacts land under `dist/`. The Kubernetes target renders plain
manifests offline — no chart pull is required.

Before applying them, create the Secret the Release names, `apisix-admin-key`,
in the target namespace, holding a key of your own under the data key
`admin-key`. The key must not be empty, which stops the gateway at start-up,
and must not be a value APISIX reads as a number or as true or false, such as
an all-digit key, because APISIX then never matches it against the key a
request presents.

## What the composed stack looks like

The gateway renders as a stateless Deployment plus a ClusterIP Service on the
proxy port. Its configuration is delivered as a ConfigMap mounted as a single
file into the container's conf directory; the config carries the store's
in-cluster Service name and, where the Admin API key goes, the name of the
environment variable APISIX reads the key from when it loads the file:

```yaml
apisix:
  node_listen: 9080
deployment:
  role: traditional
  role_traditional:
    config_provider: etcd
  admin:
    [… omitted: the client range the Admin API accepts]
    admin_key:
      - name: admin
        key: ${{APISIX_ADMIN_KEY}}
        role: admin
    admin_listen:
      ip: 0.0.0.0
      port: 9180
  etcd:
    host:
      - "http://gateway-zdstore-default:2379"
    prefix: "/apisix"
    timeout: 30
```

The Deployment delivers that variable from the Secret, so the key appears in
no rendered file:

```yaml
env:
  - name: APISIX_ADMIN_KEY
    valueFrom:
      secretKeyRef:
        name: apisix-admin-key
        key: admin-key
```

The store renders as a StatefulSet with a persistent volume mounted at
`/etcd-data`, plus a ClusterIP Service and a headless Service.
