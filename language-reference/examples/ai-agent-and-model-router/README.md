# An agent, a router, and two upstream models

An agent application that reaches two upstream provider models through one
in-cluster router, compiled to Kubernetes manifests.

The agent asks for a model by one name. Behind that name sits a router holding a
map of aliases, and behind the map sit two providers. The agent never learns
which provider answered, never holds a provider credential, and does not change
when the map is repointed — which is the reason to put a router there at all.

This workspace authors **no catalog entity of its own**. Every Component,
Feature and Recipe it names ships in the standard-library catalog; the three
entity files here — an Aggregate, a Manifest and a Release — are the whole of
what anyone writes.

## What it builds

```
   agent ─────►  model ─────┐                       ┌────►  openai/gpt-4o
     │        (a name, not  │                       │
     ▼         a workload)  ├────►   router   ──────┤
   checkpointer             │     (the alias map)   └────►  anthropic/claude-sonnet-4
   (run state)              │
                            │
   an Ingress at ───────────┘
   assistant.example.internal
```

The router has two ways in — the agent reaches it through the model handle, and
anything outside reaches it through the Ingress — and one way out per map entry.

Four components, and each one is doing a different job:

| instance | catalog Component | what it is here |
|---|---|---|
| `router` | `core/gateway/litellm` | the routing component: one endpoint, a map of aliases, two upstream providers |
| `model` | `core/ai-model/openai-compatible` | the name the agent asks for. No inference runs here — it is a handle |
| `agent` | `core/ai-agent/langgraph` | the application, running its own graph image |
| `checkpointer` | `core/datastore/valkey` | where the agent keeps run state, selected by the datastore category |

Two `uses` edges, both into sockets the agent's Component declares: `model`
(required, selecting on the model category) and `checkpointer_db` (required,
selecting on the datastore category). Five Feature attachments over three
Feature kinds, each of which puts something in the rendered output — the section
below shows what each one produces.

## Building

```bash
./build-release.sh
```

A release needs a lockfile before it builds, and lockfiles are generated rather
than shipped, so a fresh clone has none. `aggrega build` is read-only by default:
with no lockfile it halts and names the two ways forward. Resolve one first, or
let the build fill it:

```bash
aggrega pull --release release.yaml      # resolve once, then build with no flag
./build-release.sh -- --auto-pull        # or resolve during the build
```

The helper echoes the equivalent direct command before running it. This
workspace resolves its entities through the `catalog_dirs` in
`.aggrega-config.yaml`, so no `--catalog` flag is needed:

```bash
aggrega build --release release.yaml
```

**Several sections below ask you to change a line and rebuild.** The lockfile
pins a digest for every entity the release resolved, including the Aggregate and
the Manifest in this directory, and records the Release itself by the digest of
its content — so editing any of these three files puts the lockfile out of date,
and the next build halts rather than rendering against a stale pin. The message
reports which file changed and prints the digest it recorded beside the one it
found. A pull records the change while honouring every other pin:

```bash
aggrega pull --release release.yaml
```

Run that and build again, or build with `--auto-pull`, which runs the same pull
first.
Either way the halt is the point rather than an obstacle: a build does not render
against a pin it can see is stale.

The build prints:

```text
  lint: Recipe publishes a provides key its Component does not declare (Recipe openai-compatible, at .spec.provides.provider, "provider", on component type "core/ai-model/openai-compatible", bound to component instance "model")
Pull complete: release.lock (entities=23, source_artifacts=0)
  lint: Recipe publishes a provides key its Component does not declare (Recipe openai-compatible, at .spec.provides.provider, "provider", on component type "core/ai-model/openai-compatible", bound to component instance "model")
[… omitted: a total build time, which differs per run]
Build completed: 13 files written to dist/
```

**That advisory is expected here, and nothing in this workspace causes it.** It
reports that the Recipe bound to the model publishes one key — `provider` — that
the model's Component does not declare in its `provides`. It is an advisory
rather than a halt: the build completes, and the key is simply not part of the
contract a consumer may read, so nothing here reads it. It prints twice because
the entities are checked once while the lockfile is resolved and once while the
release is built.

For the full text of any advisory, with the entity file it came from and what
would make it agree, ask for it directly:

```bash
aggrega lint --release release.yaml
```

## The rendered tree

```
dist/helm/
├── agent--model-zuapi-zukey--agent-secret-agent-model-api-key.yaml
├── agent-deployment.yaml
├── checkpointer-default-service.yaml
├── checkpointer-deployment.yaml
├── model-service.yaml
├── router--master-zukey--router-secret-router-master-key.yaml
├── router--metrics--router-servicemonitor-router-scrape.yaml
├── router--provider-zukey--router-secret-router-provider-key.yaml
├── router--published--router-ingress-router-ingress.yaml
├── router-default-service.yaml
├── router-deployment.yaml
└── router/
    ├── litellm-gateway-config.configmap.yaml
    └── request-guard/
        └── request-guard.yaml
```

Under `router/` are the files the router's Recipe emits itself. The second one
comes from a bundle the Recipe imports rather than writes, so it sits under the
key it was imported at, `request-guard`.

Everything an attachment brought sits in the same directory as the component's
own manifests, carrying two coordinates in its filename: the component it
attached to, and the name the attachment was given. `router--metrics--` is the
`metrics` attachment on `router`. What came from where is still readable off the
tree, and every file is where a tool that reads one directory will find it —
which is what this target's consumers do unless you tell them otherwise.

The two coordinates are encoded rather than written as you typed them, because
they share one string with the file's own name. A character a filename cannot
safely carry becomes `-z` and a letter: `master_key` is `master-zukey`, and
`feature.aggrega.ai/monitoring` — an attachment name a Feature's own annotation
mints — would be `feature-zdaggrega-zdai-zsmonitoring`. The file's own name keeps
whatever dots it carries, so the `.yaml` suffix still reads as a suffix.

Where a page here prints what a build produced, the block is copied from a real
run — see [Reading the output on these pages](../reading-the-output.md) for the
convention and the mark it uses for lines left out.

## The routing table

The router's reason to exist is its map, and the map reaches the rendered output
rather than staying in the authored file. Here is the whole `data` block of
`dist/helm/router/litellm-gateway-config.configmap.yaml`:

```yaml
data:
  config.yaml: |
    model_list:
      - model_name: assistant
        litellm_params:
          model: openai/gpt-4o
          api_key: os.environ/LITELLM_PROVIDER_API_KEY
      - model_name: assistant
        litellm_params:
          model: anthropic/claude-sonnet-4
          api_key: os.environ/LITELLM_PROVIDER_API_KEY
    router_settings:
      routing_strategy: latency-based-routing
    litellm_settings:
      callbacks:
        - /etc/litellm-request-guard/request_field_filter.filter
```

and the `data` block of the second ConfigMap,
`dist/helm/router/request-guard/request-guard.yaml`, with the text of the files
it carries left out:

```yaml
data:
  request_field_filter.py: |
    [… omitted: the text of the router's request guard, a Python module described below]
  path-allowlist.conf: |
    [… omitted: the configuration of the router's path allowlist, described below]
```

Five things are worth reading off those.

**Both entries publish the same alias.** That is what gives
`routing_strategy` something to do: with two entries under one name, the router
has a choice to make on each request, and `latency-based-routing` is the rule it
applies. A map whose aliases are all distinct routes by name alone, and the
strategy changes nothing about it.

**The targets are strings the compiler does not interpret.**
`openai/gpt-4o` is a deterministic pointer: the running proxy resolves it when it
serves a request. The compiler never contacts a provider at build time, so it
cannot tell you that a target exists, that it is spelled correctly, or that your
account can reach it. Change `openai/gpt-4o` to `openai/not-a-real-model` and the
build still succeeds — the failure arrives at request time, from the provider.

**No credential value is in this file.** Each entry names an environment
variable instead, through the proxy's own indirection. The value arrives in the
container by another route entirely, shown below.

**Every request meets a guard first.** The `callbacks` entry registers the
module `request_field_filter` by the full path of its file: the second ConfigMap
is mounted in the router's container at `/etc/litellm-request-guard`, a
directory of its own beside `/etc/litellm`, where the first is mounted and the
proxy reads its configuration. That second ConfigMap comes from
`LiteLLMGuard#/artifacts/RequestGuard`, a bundle every Recipe running this proxy
imports, so the guard and the allowlist below have one text wherever the proxy
runs. The router's Recipe delivers this guard on every Release, because the
router holds the provider credential. It forwards from a caller only the request
fields the proxy declares for the route the request took, plus any the Release
names in the router's `infra.admitted_request_fields`, and answers any other
field with an error naming it, forwarding nothing — so a caller cannot point the
router at an address of its own through a request-body model list, or send a
provider key of its own in place of the router's. This Release admits nothing
further.

**Only the router's own routes are reachable.** The guard sees only the routes
that hand it the request, so the second ConfigMap's other file configures the
pod's second container, which mounts that ConfigMap alone and runs the official
nginx image as a path allowlist. The router itself listens on the pod's
loopback address, where nothing outside the pod reaches it, and the allowlist
listens on port 4000, the port the Service below targets. It forwards a request
only when its method and path are one of the routes the router serves — the
model request routes the guard checks, in the spellings the router serves
whatever the alias, `/v1/chat/completions` and `/v1/messages` among them; the
model listing; the health checks; and, of its
administrative routes, key management and the creating, reading, updating and
deleting of organizations — and answers every other path 403, forwarding
nothing. So the proxy's token-count routes, its pass-through routes to
providers' own APIs, its other administrative routes and its administrative
console cannot be reached through the router, and neither can a model route
whose path carries the model name, as the paths Azure's client sends do:
there the proxy reads words in the path, the alias included, to decide how it
records a request, and the router would refuse a request for this map's own
`assistant` on it.

## One address, two names

The model component runs nothing. Its Recipe emits a reference — the whole `spec`
of `dist/helm/model-service.yaml`:

```yaml
spec:
  type: ExternalName
  externalName: router-default
```

And `router-default` is exactly the Service the router's own Recipe emits — the
whole `spec` of `dist/helm/router-default-service.yaml`:

```yaml
spec:
  type: ClusterIP
  selector:
    app: router
  ports:
    - name: http
      port: 4000
      targetPort: http
```

So the chain is visible end to end in the output: a workload can reach the
router under the model component's own name, and the two resources agree because
the operator wrote the router's address into `model.infra.endpoint` in the
Release. The port the Service targets, `http`, is the one the router's path
allowlist listens on.

**That address is written by hand, and it has to be.** The model is a broker
component: nothing runs behind it in-cluster, so there is no Recipe output to
read an address from. What makes writing it down safe is that the name is
deterministic — the router's Service is named from the component's own name and
its service key, so `router-default` is knowable before anything is deployed.
What makes it the author's responsibility is that the compiler does not check
it: to the compiler that string is a string. Rename the `router` component and
this line must be changed in the same edit.

## What the agent receives

The agent's Recipe reads both of its edges and turns them into container
environment. Here is the whole `env` block of `dist/helm/agent-deployment.yaml`:

```yaml
          env:
            - name: OPENAI_BASE_URL
              value: http://router-default:4000/v1
            - name: OPENAI_MODEL
              value: assistant
            - name: LANGGRAPH_CHECKPOINTER_HOST
              value: checkpointer-default
            - name: LANGGRAPH_CHECKPOINTER_PORT
              value: "6379"
            - name: OPENAI_API_KEY
              valueFrom:
                secretKeyRef:
                  name: agent-model-api-key
                  key: api-key
```

The first two came off the `model` edge, the next two off the `checkpointer_db`
edge, and the last from an attachment. Note what the Aggregate did **not** have
to say: neither edge carries an `inject` block, because the delivery is the
consuming Recipe's own decision. The developer declares that the agent uses a
model; which variable the model's endpoint arrives under is the Recipe's answer,
and it is the one the client library reads.

Note also `LANGGRAPH_CHECKPOINTER_PORT: "6379"`. The Release declares
`checkpointer: {}` and configures nothing, so that port is the cache Component's
own schema default, materialized and piped across the edge.

The agent talks to the router in exactly the dialect it would use to talk to a
provider directly — a base URL, a model name, and a key. That is what lets the
router be inserted, moved or repointed without the application changing.

## The five attachments, and what each one renders

An attachment that changes nothing in the output teaches nothing. Each of these
five puts something there.

### `master_key` on the router — the key it requires of callers

`core/referenced-secret`, filling a slot the router's Component declares. It
renders its own Secret, and the router's container references it. From
`dist/helm/router--master-zukey--router-secret-router-master-key.yaml`:

```yaml
stringData:
  master-key: "dev-router-admin-key-change-me"
```

and in the router's container `env`, from `dist/helm/router-deployment.yaml`:

```yaml
            - name: LITELLM_MASTER_KEY
              valueFrom:
                secretKeyRef:
                  name: router-master-key
                  key: master-key
```

The container carries a reference, not the value. The Secret's name is published
by the attachment and read by the consumer, so neither side re-derives it.

### `provider_key` on the router — the key it presents upstream

The same Feature in a different slot, and the difference between the two slots is
the point of the router. From
`dist/helm/router--provider-zukey--router-secret-router-provider-key.yaml`:

```yaml
stringData:
  provider-key: "upstream-provider-key-change-me"
```

and in the same container `env`:

```yaml
            - name: LITELLM_PROVIDER_API_KEY
              valueFrom:
                secretKeyRef:
                  name: router-provider-key
                  key: provider-key
```

**This attachment also changes the routing table.** Look back at the routing
table's `data` block above: every map entry carries
`api_key: os.environ/LITELLM_PROVIDER_API_KEY`, naming this same variable.
Remove the `provider_key` attachment from the Aggregate and rebuild. The build
reports twelve files rather than thirteen — the Secret is gone — and the routing
table's ConfigMap differs by exactly those two `api_key` lines and nothing else;
the guard's ConfigMap is unchanged. The rest of the map keeps its authored order
and formatting, the router still serves and routes, and a routed request now
fails at the provider because there is no credential to present.

The variable name is authored once in the router's Recipe and read from there by
both the routing table and the container's environment, so a table cannot come
to name a variable nothing sets.

The two credentials stay apart, and that separation is what the router buys: the
upstream key stays inside the router, and the calling application holds nothing
but the key to the router.

### `model_api_key` on the agent — the key it presents to the router

`core/referenced-secret` again, on the other side of the same conversation. From
`dist/helm/agent--model-zuapi-zukey--agent-secret-agent-model-api-key.yaml`:

```yaml
stringData:
  api-key: "dev-router-admin-key-change-me"
```

That is the same value as the router's `master-key` above, and it is not written
twice. Both attachments read one hoisted parameter:

```yaml
origin: "{{ .parameters.router_admin_key }}"
```

The Aggregate declares the parameter and the Release fulfils it, so the key has
one authored home and the two Secrets cannot be edited apart. Change it once in
the Release and both rendered Secrets move together.

Each attachment still renders its **own** Secret, named from the component that
consumes it. What the shared parameter shares is the value, not the resource.

### `published` on the router — an address outside the cluster

`core/public-ingress`, which fills no slot: it is admitted by its own selector,
`component.aggrega.ai/type=server`, which the router carries. It brings a
resource the router's Recipe knows nothing about. The whole `spec` of
`dist/helm/router--published--router-ingress-router-ingress.yaml`:

```yaml
spec:
  rules:
    - host: assistant.example.internal
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: router-default
                port:
                  name: http
```

The `host` is developer intent, authored in the Aggregate, because which name an
application answers on is part of what the application is. The path and the port
name are operator sizing, authored in the Release. The backend Service was
supplied by neither: `service_name` is left unset, and the attachment's
realization falls back to the Service the router's own Recipe emits. There is no
`ingressClassName` field in the output, because nothing set one and the
realization omits what it was not given, leaving the cluster's default class to
claim the resource.

### `metrics` on the router — a scrape target

`core/prometheus-exporter`, admitted by the same selector, bringing another
resource of its own. The whole `spec` of
`dist/helm/router--metrics--router-servicemonitor-router-scrape.yaml`:

```yaml
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: router
  endpoints:
    - port: http
      interval: 30s
      path: /metrics
```

All three scrape settings are authored in the Release, under this attachment's
own `infra`. They are operator sizing rather than application intent: how often
a platform scrapes is a property of the platform.

The `port` names a Service port rather than a number, and `http` is the one the
router's Recipe emits — the same name the Ingress above routes to.

## Where the compiler is blind

Two pairs of names in this workspace have to agree, and nothing checks either.

- The alias the model asks for (`model.values.model: assistant`) and an alias the
  router's map publishes (`model_name: assistant`).
- The address the operator wrote (`model.infra.endpoint`) and the Service the
  router renders (`router-default`).

Both are strings being piped from one place to another. The compiler routes them
without reading them: it does not know that one is a model alias and the other a
hostname, and it has no access to a running cluster to check either. Break
either pair and the build still succeeds; the failure appears at request time.

This is the same property that makes the rest of the example work. Because the
compiler does not interpret what it pipes, the router can be repointed at a
different provider, the model can be repointed at a different router, and the
credential realization can be swapped for a store-backed one — all without the
compiler needing to understand any of it, and without the agent changing.

## Adapting it

- **Repoint a provider.** Edit a `target` in the router's map. Nothing else
  changes: not the model, not the agent, not a rendered Secret.
- **Add a third provider.** Add a map entry. If it publishes the existing alias,
  the strategy starts choosing between three; if it publishes a new one, add a
  model component asking for that alias.
- **Fetch the credentials from a store instead.** Change the one Manifest line
  binding `core/referenced-secret` to `helm/k8s-external-secret` and rebuild.
  Each rendered `Secret` becomes an `ExternalSecret` naming an entry in a
  cluster secret store, for a store operator to reconcile — and every consumer's
  rendered reference stays **byte-identical**, because the locator is published
  by the producing side rather than agreed between both. Nothing else in the
  three files has to change for the build to succeed.

  One thing does need re-authoring before the swap means anything, though:
  `origin` changes meaning between the two realizations. This workspace's
  realization reads it as the value to store; the other reads it as the key to
  fetch. Swap the line
  without revisiting the `origin` values and the rendered `remoteRef.key` is
  whatever placeholder was standing in for the value —
  `dev-router-admin-key-change-me` here. Nothing in the output tree is then
  holding that string as material, but it is still there as a store key naming
  an entry that does not exist.
- **Drop the router.** Point the agent's `model` edge at a per-provider model
  component instead. The agent then holds a provider credential itself, which is
  the trade the router exists to remove.

For filling one credential slot across several consumers at once, see
[model-api-key-sharing](../model-api-key-sharing/). For a socket no catalog
entity declares, see [adhoc-uses-socket](../adhoc-uses-socket/).
