---
example:
  level: start
  products: [core/ai-model/ollama, core/gateway/nginx]
  shows: [connections, features]
---

# A model server that only its gateway may call

A model server running in a cluster answers whoever reaches its address. On a
pod network with no network policy, which is Kubernetes' default, that is every
workload in the cluster: the gateway placed in front of the model is the way
traffic is meant to arrive, not the only way it can.

The Aggregate already says which components call which: the gateway's
`upstream` connection names the model server. `core/caller-allowlist`, which
the operator attaches to the model server in the Release, turns that declared
connection into the cluster network's rule. This workspace compiles the
arrangement to Kubernetes manifests: an NGINX gateway in the namespace `edge`,
an Ollama model server in the namespace `models`, and the network policy the
attachment writes beside the model server.

This workspace authors **no catalog entity of its own**. The three entity files
here — an Aggregate, a Manifest and a Release — are the whole of what anyone
writes.

## Who writes what

| file | author | what it says here |
|---|---|---|
| `aggregate.yaml` | the developer | the gateway, the model server, and the gateway's `upstream` connection to it |
| `release.yaml` | the operator | the two namespaces, and on the model server's entry the `allowlist` attachment with its `infra` |
| `manifest.yaml` | the operator | which Recipe realizes each component and the Feature on Kubernetes |

The Aggregate carries nothing about network policy. The developer declares the
connection the gateway makes; whether the cluster refuses every other one
is the operator's decision for this environment, made in the Release under
`components.model.features`. Every input the Feature takes is `infra`, the
operator's pillar. What the developer should know is the consequence: wherever
a Release attaches this Feature to a component, a call the Aggregate does not
declare as a `uses` edge to that component is refused by the cluster, where its
network plugin enforces network policy.

## What it builds

| instance | catalog Component | namespace | what it is here |
|---|---|---|---|
| `gateway` | `core/gateway/nginx` | `edge` | the gateway clients call; it forwards to the model server |
| `model` | `core/ai-model/ollama` | `models` | the model server, serving `llama3.1` |

One `uses` edge: the gateway's `upstream` socket to the model server. One
Feature attachment, in the Release: `allowlist`, `core/caller-allowlist`, on the
model server. The Release affirms that the cluster enforces network policy and
names one source outside the Aggregate, a monitoring agent.

## Building

```bash
aggrega build --release release.yaml
```

A release needs a lockfile before it builds, and lockfiles are generated rather
than shipped, so a fresh clone has none. Resolve one first, or let the build
fill it:

```bash
aggrega pull --release release.yaml                 # resolve once, then build with no flag
aggrega build --release release.yaml --auto-pull    # or resolve during the build
```

This workspace resolves the catalog entities from the default registry
`.aggrega-config.yaml` names; nothing is fetched from a chart repository.

The build prints, with `<workspace>` standing for this example's folder:

```text
  warning: node "model" (provider "helm"): target "helm" does not support annotation aggrega.ai/namespace on artifacts-only input and ignored it
[… omitted: the resolution's summary and a total build time, which differ per run]
Build completed: 6 files written to <workspace>/dist
```

The warning is about the policy. The target does not place a Feature's own
manifests in a namespace, so the attachment's template writes into the policy
the namespace the model server's StatefulSet is emitted into —
`namespace: "models"` below.

## The rendered tree

```
dist/
├── edge/helm/
│   ├── gateway-default-service.yaml
│   └── gateway-deployment.yaml
└── models/helm/
    ├── model--allowlist--networkpolicy.yaml
    ├── model-default-service.yaml
    ├── model-headless-service.yaml
    └── model-statefulset.yaml
```

The attachment adds one file, the policy. Every other file is byte-for-byte
what the same Release renders without it.

## What can reach the model server

`dist/models/helm/model--allowlist--networkpolicy.yaml`, from its `spec` on:

```yaml
spec:
  podSelector:
    matchLabels:
      "app": "model"
  policyTypes:
    - Ingress
  ingress:
    - from:
        -
          namespaceSelector:
            matchLabels:
              "kubernetes.io/metadata.name": "models"
          podSelector:
            matchLabels:
              "app": "model"
        -
          namespaceSelector:
            matchLabels:
              "kubernetes.io/metadata.name": "edge"
          podSelector:
            matchLabels:
              "app": "gateway"
        -
          namespaceSelector:
            matchLabels:
              "kubernetes.io/metadata.name": "monitoring"
          podSelector:
            matchLabels:
              "app.kubernetes.io/name": "prometheus"
      ports:
        - port: 11434
          protocol: "TCP"
```

The policy sits in `models`, the namespace the model server's StatefulSet is
emitted into, selects the model server's pods, and admits connections to them
from three sources, on the one port the model server's container declares:

- **The model server's own pods, in `models`**, so replicas of one server can
  reach each other.
- **The gateway's pods, in the namespace `edge`.** The namespace selector and
  the pod selector sit in one entry, so a pod has to match both. A workload in
  another namespace carrying the same labels — the same Aggregate released
  again elsewhere, say — is not the gateway and is not admitted.
- **The monitoring agent the Release names**: pods labelled
  `app.kubernetes.io/name: prometheus` in the namespace `monitoring`.

Each component's pods are selected by the selector its own controller writes —
`app: model` for the model server's StatefulSet, `app: gateway` for the
gateway's Deployment — and each namespace is the one its workload is emitted
into, both read from what the renders emitted rather than restated by hand.
Neither selector carries a version, so when a new build rolls out, the pods of
the previous one are still selected and still admitted until they are replaced.

## What cannot reach it

- **Any other workload**, in `models`, in `edge` or in any other namespace —
  another agent in `monitoring` included.
- **An ingress controller, or any client outside the cluster.** Nothing outside
  the Aggregate is admitted unless the Release names it, and this Release names
  only the monitoring agent. Clients reach the model server through the gateway,
  which is the connection the Aggregate declares.
- **Any port other than 11434.**

The policy restricts who may connect, not what a connection carries: a request
the gateway forwards reaches the model as the gateway sent it.

## What the build cannot know

**Whether the rule is enforced.** A network policy is enforced by the cluster's
network plugin, and only where that plugin implements network policy; a cluster
whose plugin does not accepts the policy and enforces nothing. The build writes
the policy and cannot see the cluster, which is why the Release carries
`control_plane_present: true` on the attachment: it is the operator's statement
that the target cluster enforces it, and the build halts until it is made.

Three more limits come from how network policy works rather than from this
Feature:

- **Policies add up.** Where another policy in the cluster selects the same
  pods, a connection either of them admits is admitted.
- **The gateway is not restricted by this attachment.** It protects the model
  server; attach the Feature to the gateway's entry in the Release as well to
  restrict who reaches the gateway, and name there the clients it serves.
- **Outbound traffic is untouched.** The model server still reaches the
  registry it pulls weights from, and resolves names as before.

## What halts the build

Each of these is a sentence the build prints, naming what to change:

- **The prerequisite is not affirmed.** Remove `control_plane_present: true`
  from the Release:

  ```text
  [… omitted: what resolving the lockfile prints, the same halt among it, and the halt's heading, the template position and the assertion's own source]
  error calling fail: assertion failed: core/caller-allowlist attachment "allowlist" on "model" writes a network policy, which restricts connections only where the cluster's network plugin enforces network policy; once the target cluster's plugin does, affirm it by setting infra.control_plane_present to true on this attachment in the Release
  ```

- **A caller whose workload is emitted into no namespace.** Remove the
  `aggrega.ai/namespace` annotation from the `edge` boundary, and the gateway's
  Deployment is emitted with none:

  ```text
  [… omitted: what resolving the lockfile prints, the same halt among it, and the halt's heading, the artifact being rendered, the template position and the template's own source]
  error calling fail: core/caller-allowlist attachment "allowlist" on "model": "gateway" connects to "model" through its "upstream" socket, but the Deployment "gateway" it renders is emitted into no namespace, so the policy cannot name where its pods run; set aggrega.ai/namespace on the boundary holding "gateway", or on its own entry, in the Release, or have the manifest that carries it write one
  ```

- **The model server's workload emitted into no namespace**, for the same
  reason: a policy selects pods in its own namespace only.
- **A workload of either that writes no controller selector and carries none
  of the identity labels the build stamps on its pods** — a chart's Job relying
  on the selector the cluster generates, say. Selecting it by every label it
  carries would stop matching its pods the first time a version label changed,
  so the build stops instead.
- **A caller, or the model server, whose render emits no pods** — one realized
  by a custom resource whose controller creates the pods later, or reached at
  an address outside the cluster. Such a component cannot be named in a
  policy, so the build stops rather than writing a policy that would refuse it
  or select nothing.
- **A source in `admitted_sources` naming both an address range and pods, or
  naming neither.**

## Where the compiler does not interpret

The compiler pipes the selectors, labels and namespaces each render reported
into the policy as strings. It does not contact the cluster, does not know
which network plugin runs there, and does not know which workloads already run
in a namespace. Each halt above is declared by the catalog's own entities, in
the Feature's realization, and none of them rests on any knowledge of the
cluster.

## Adapting it

- **Admit an ingress controller.** Add an entry to `admitted_sources` with its
  namespace and its pods' labels — both in one entry, so only those pods in that
  namespace are admitted.
- **Admit an address range.** Add an entry with `cidr`, such as
  `10.20.0.0/16`.
- **A second caller.** Add a `uses` edge from it to the model server in the
  Aggregate and place it in a namespace the Release declares; the next build
  admits it with no change to the attachment.
- **Compose.** The Feature is not realized there: a Compose stack puts every
  service of a group on one network, and one service's configuration cannot
  move another service off it, so a Release binding this Feature on Compose
  halts for want of a realization.
