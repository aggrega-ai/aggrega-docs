---
example:
  level: start
  products: [core/ai-agent/langgraph, core/datastore/valkey, core/gateway/litellm]
  shows: [connections, features, credentials, parameters]
---

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
   agent ───────────────────┐                       ┌────►  openai/gpt-4o
     │                      │                       │
     ▼                      ├────►   router   ──────┤
   checkpointer             │     (the alias map)   └────►  anthropic/claude-sonnet-4
   (run state)              │
                            │
   an Ingress at ───────────┘
   assistant.example.internal
```

The router has two ways in for requests — the agent reaches it over its `model`
edge, and anything outside reaches it through the Ingress — and one way out per
map entry. A third port serves its metrics to a scraper inside the cluster.

Three components, and each one is doing a different job:

| instance | catalog Component | what it is here |
|---|---|---|
| `router` | `core/gateway/litellm` | the routing component: one endpoint, a map of aliases, two upstream providers. It publishes its address and the alias the agent asks for |
| `agent` | `core/ai-agent/langgraph` | the application, running its own graph image |
| `checkpointer` | `core/datastore/valkey` | where the agent keeps run state, selected by the datastore category |

Two `uses` edges, both into sockets the agent's Component declares: `model`
(required, admitting a model component or a gateway serving a model API — the
router is the second) and `checkpointer_db` (required, selecting on the
datastore category). Six Feature attachments over four Feature kinds — five on
the router, one on the agent's `model` connection — each of which puts something
in the rendered output; the section below shows what each one produces.

## Building

```bash
aggrega build --release release.yaml
```

A release needs a lockfile before it builds, and lockfiles are generated rather
than shipped, so a fresh clone has none. `aggrega build` is read-only by default:
with no lockfile it halts and names the two ways forward. Resolve one first, or
let the build fill it:

```bash
aggrega pull --release release.yaml                 # resolve once, then build with no flag
aggrega build --release release.yaml --auto-pull    # or resolve during the build
```

This workspace resolves its entities from the default registry
`.aggrega-config.yaml` names, so no `--catalog` flag is needed.

The realization of the router's `selection` attachment runs one plugin that
ships in neither the compiler nor the catalog, the gateway configuration step
`pipeline-step/litellm-gateway-config`, which the resolution fetches from the
registry `default_registry` names, `hub.aggrega.ai`.

**Several sections below ask you to change a line and rebuild.** The lockfile
pins a digest for every entity the release resolved, including the Aggregate and
the Manifest in this directory, and records the Release itself by the digest of
its content — so editing any of these three files puts the lockfile out of date,
and the next build halts rather than rendering against a stale pin. The message
names what changed — the Release by its file, the Aggregate or the Manifest by
its name — and prints the digest it recorded beside the one it found. A pull records the change while honouring every other pin:

```bash
aggrega pull --release release.yaml
```

Run that and build again, or build with `--auto-pull`, which runs the same pull
first.
Either way the halt is the point rather than an obstacle: a build does not render
against a pin it can see is stale.

The build prints, with `<workspace>` standing for this example's folder:

```text
  verify: plugin pipeline-step/litellm-gateway-config:1.0.0 host functions match the published .wasm
[… omitted: three warnings, one per credential attachment, that the declared-sensitive origin reaches the target with no per-key sensitivity marking, because the realization maps it through a valuesMapping]
Pull complete: release.lock (entities=24, source_artifacts=0, external_inputs=0)
[… omitted: a notice that core/referenced-secret declares origin in both of its pillars, and a total build time, which differs per run]
Build completed: 12 files written to <workspace>/dist
```

The entities are checked against the catalog's conventions once while the
lockfile is resolved and once while the release is built, and each advisory
those checks raise is printed as a `lint:` line; this release raises none. To
run the same checks on their own, and read any advisory in full with the entity
file it came from and what would make it agree:

```bash
aggrega lint --release release.yaml
```

which here reports `conventions checked: 19 entities, 0 advisory finding(s)`.

## The rendered tree

```
dist/helm/
├── agent--router-zumodel-zdcredential--agent-secret-agent-router-model-credential.yaml
├── agent-deployment.yaml
├── checkpointer-default-service.yaml
├── checkpointer-deployment.yaml
├── router--api-zukey--router-secret-router-api-key.yaml
├── router--metrics--router-servicemonitor-router-scrape.yaml
├── router--provider-zukey--router-secret-router-provider-key.yaml
├── router--published--router-ingress-router-ingress.yaml
├── router-default-service.yaml
├── router-deployment.yaml
└── router/
    ├── litellm-gateway-config/
    │   └── configmap.yaml
    └── request-guard/
        └── request-guard.yaml
```

Under `router/` are the files the router's Recipe emits itself. Both come from
bundles the Recipe imports rather than writes, so each sits under the key it was
imported at, `litellm-gateway-config` and `request-guard`.

Everything an attachment brought sits in the same directory as the component's
own manifests, carrying two coordinates in its filename: the component it
attached to, and the name the attachment was given. `router--metrics--` is the
`metrics` attachment on `router`. What came from where is still readable off the
tree, and every file is where a tool that reads one directory will find it —
which is what this target's consumers do unless you tell them otherwise.

The two coordinates are encoded rather than written as you typed them, because
they share one string with the file's own name. A character a filename cannot
safely carry becomes `-z` and a letter: `api_key` is `api-zukey`;
`router_model.credential` — the name the attachment on the agent's
`router_model` connection takes, the connection's alias, a dot and the slot — is
`router-zumodel-zdcredential`; and `feature.aggrega.ai/monitoring` — an
attachment name a Feature's own annotation mints — would be
`feature-zdaggrega-zdai-zsmonitoring`. The file's own name keeps
whatever dots it carries, so the `.yaml` suffix still reads as a suffix.

Where a page here prints what a build produced, the block is copied from a real
run — see [Reading the output on these pages](../reading-the-output.md) for the
convention and the mark it uses for lines left out.

## The routing table

The router's reason to exist is its map, and the map reaches the rendered output
rather than staying in the authored file. Here is the whole `data` block of
`dist/helm/router/litellm-gateway-config/configmap.yaml`:

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
    litellm_settings:
      callbacks:
        - /etc/litellm-request-guard/request_field_filter.filter
        - prometheus
    router_settings:
      routing_strategy: latency-based-routing
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

**Both entries publish the same alias.** That is what gives the router a choice
to make on each request, and the `router_settings` at the end of the body says
how it makes it: `latency-based-routing`, written there by the router's
`selection` attachment rather than by its own Recipe, as the section on that
attachment below shows. A map whose aliases are all distinct routes by name
alone, and the strategy changes nothing about it. Sharing one alias is also why
both are typed by hand into `values.models` rather than served from model
components wired to the router's `models` socket: a wired model is served under
the alias of its own connection, which no other entry may publish, so two wired
models never share one. The second reason is Anthropic's: the router writes a
wired model's entry through the OpenAI API alone, while Anthropic's model
answers its own API, so wiring `core/ai-model/anthropic` halts the build, saying
to type that upstream into the map instead.

**The targets are strings the compiler does not interpret.**
`openai/gpt-4o` is a deterministic pointer: the running proxy resolves it when it
serves a request. The compiler never contacts a provider at build time, so it
cannot tell you that a target exists, that it is spelled correctly, or that your
account can reach it. Change `openai/gpt-4o` to `openai/not-a-real-model` and the
build still succeeds — the failure arrives at request time, from the provider.

**No credential value is in this file.** Each entry names an environment
variable instead, through the proxy's own indirection. The value arrives in the
container by another route entirely, shown below.

**Every request meets a guard first.** The first `callbacks` entry registers the
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
provider key of its own in place of the router's. Nor can a caller set the
identity the router writes into every request itself — the hash of the key it
verified, that key's team and organization, and the end user: on a responses or
messages request, where the router keeps the caller's `metadata` apart from its
own, it removes any team, organization or end user field the caller wrote there
and the guard refuses a request naming the key there, `metadata.user_api_key`,
and on every other route the router's value replaces any the caller sent. This
Release admits nothing further. The second entry, `prometheus`, is the proxy's
own metrics callback, which the router's `metrics_enabled` value turns on; the
`metrics` attachment below scrapes what it records.

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
administrative routes, key management — and answers every other path 403,
forwarding nothing. So the proxy's token-count routes, its pass-through routes to
providers' own APIs, its other administrative routes and its administrative
console cannot be reached through the router, and neither can a model route
whose path carries the model name, as the paths Azure's client sends do:
there the proxy reads words in the path, the alias included, to decide how it
records a request, and the router would refuse a request for this map's own
`assistant` on it. The proxy's metrics are not among those routes either: port
4000 answers `/metrics` 403. With the router's `metrics_enabled` true, as the
Aggregate sets it, the allowlist also listens on port 9090 and forwards a GET of
`/metrics` there alone, to the listener the proxy keeps for its metrics on the
loopback address, answering every other request 403. That port checks no
caller, and the metrics name the hashed keys, key aliases and user emails the
router attributes spend to.

## What the router publishes

The router's Recipe publishes the two keys every model component publishes: an
`endpoint`, the base URL a client library is handed, and a `model`, the name a
request asks for. That is what lets the agent's `model` socket take the router
in place of a model. The socket's selector is
`component.aggrega.ai/category in (ai-model, gateway), model.aggrega.ai/api`: it
admits a component in the model or the gateway category that carries
`model.aggrega.ai/api`, the label naming which model API answers at the address
the component publishes. The router carries `model.aggrega.ai/api: openai`. A
gateway that serves no model API carries no such label, and an edge from the
agent to one halts the build, naming the socket and the selector the target does
not satisfy.

The address is the Service the router's own Recipe emits — the whole `spec` of
`dist/helm/router-default-service.yaml`:

```yaml
spec:
  type: ClusterIP
  selector:
    app: router
  ports:
    - name: http
      port: 4000
      targetPort: http
    - name: metrics
      port: 9090
      targetPort: metrics
```

The Recipe composes the endpoint it publishes, `http://router-default:4000/v1`,
from the same two facts the Service is named and ported from: the component's
own name and its `infra.port`. The port the Service targets, `http`, is the one
the router's path allowlist listens on; `metrics`, the second, is there because
the router's metrics are on, and carries only them. Nothing in the three files spells
`router-default` out. Rename the `router` component — its key in the Aggregate
and in the Release, and the agent's edge that names it — and the address the
agent receives follows: renamed `gateway`, the agent's `OPENAI_BASE_URL` is
`http://gateway-default:4000/v1`.

The name is the alias the router publishes as its model. This map publishes one
alias, `assistant`, from both of its entries, so the router publishes that one
and its `values.model` is left out. Give the second entry an alias of its own —
`summarizer`, say — and the build halts before anything renders, because the
router can publish only one. The halt is `E0033`, a failed assertion of the
router's Component, and its message ends with the rule's own sentence:
*values.model is not set, but values.models publishes 2 aliases (assistant,
summarizer), so the gateway cannot tell which one a component wired to it asks
for; set values.model to one of them*. Setting `model: assistant` beside
`models` clears it, and the agent is handed `assistant` again. A caller wanting
`summarizer` asks the same endpoint for it by name.

## What the agent receives

The agent's Recipe reads both of its edges and the agent's own values, and turns
them into container environment. Here is the whole `env` block of
`dist/helm/agent-deployment.yaml`:

```yaml
          env:
            - name: OPENAI_API_KEY
              valueFrom:
                secretKeyRef:
                  name: agent-router-model.credential
                  key: api-key
            - name: LANGGRAPH_DEFAULT_RECURSION_LIMIT
              value: "25"
            - name: OPENAI_BASE_URL
              value: http://router-default:4000/v1
            - name: OPENAI_MODEL
              value: assistant
            - name: LANGGRAPH_CHECKPOINTER_HOST
              value: checkpointer-default
            - name: LANGGRAPH_CHECKPOINTER_PORT
              value: "6379"
            - name: LANGGRAPH_GRAPH_ENTRYPOINT
              value: app.graph:graph
```

The first came from the attachment the `model` edge carries, and the helm
provider writes such an entry, read from a Secret, ahead of the plain ones. The
recursion limit is the agent's own `recursion_limit`, under the variable
LangGraph reads by itself; the next two came off the `model` edge, the two after
them off the `checkpointer_db` edge, and the last is the agent's own
`graph_entrypoint`, under a default name the application's code reads, which an
`inject` block on the component itself would replace. Note what the Aggregate
did **not** have to say: neither edge carries an
`inject` block, because the consuming Recipe delivers each connection under
default names, which an `inject` block on the edge would replace. The developer
declares that the agent uses a model; the variable its endpoint arrives under is
the one the client library reads, and it stays whatever the edge dictates.

Note also `LANGGRAPH_CHECKPOINTER_PORT: "6379"`. The Release declares
`checkpointer: {}` and configures nothing, so that port is the cache Component's
own schema default, materialized and piped across the edge.

The agent talks to the router in exactly the dialect it would use to talk to a
provider directly — a base URL, a model name, and a key. That is what lets the
router be inserted, moved or repointed without the application changing.

## The six attachments, and what each one renders

An attachment that changes nothing in the output teaches nothing. Each of these
six puts something there.

### `api_key` on the router — the key it requires of callers

`core/referenced-secret`, filling a slot the router's Component declares; the
key it holds is the one LiteLLM calls its master key. It renders its own Secret,
and the router's container references it. From
`dist/helm/router--api-zukey--router-secret-router-api-key.yaml`:

```yaml
stringData:
  master-key: "dev-router-admin-key-change-me"
```

and in the router's container `env`, from `dist/helm/router-deployment.yaml`:

```yaml
            - name: LITELLM_MASTER_KEY
              valueFrom:
                secretKeyRef:
                  name: router-api-key
                  key: master-key
```

The container carries a reference, not the value. The Secret's name is published
by the attachment and read by the consumer, so neither side re-derives it.

### `provider_key` on the router — the key it presents upstream

The same Feature in a different slot, and the difference between the two slots is
the point of the router. It is the one credential of the entries typed into
`values.models`, both of them here; a model wired to the router's `models`
socket presents the key its own connection carries instead, never this one. From
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
reports eleven files rather than twelve — the Secret is gone — and the routing
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

### `credential` on the agent's `model` connection — the key it presents to the router

`core/referenced-secret` again, on the other side of the same conversation. The
agent's `model` socket declares a `credential` slot, so the key is attached on
the connection it is presented on, under the edge in the Aggregate:

```yaml
uses:
  model:
    router_model:
      target: router
      features:
        credential:
          type: core/referenced-secret
          values:
            key: api-key
            origin: "{{ .parameters.router_admin_key }}"
```

From
`dist/helm/agent--router-zumodel-zdcredential--agent-secret-agent-router-model-credential.yaml`:

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
consumes it — and, for the agent's, the connection it is attached on:
`agent-router-model.credential`. What the shared parameter shares is the value,
not the resource.

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

The developer attaches it in the Aggregate with the `path`, because which
requests an application serves is part of what the application is. The operator
writes the `host` and the port name on the Release's entry for the same
attachment: the host is the environment's name for the router, so the operator
names it per environment, in each environment's Release. The backend Service was
supplied by neither: `service_name` is left unset, and the attachment's
realization falls back to the Service the router's own Recipe emits. There is no
`ingressClassName` field in the output, because nothing set one and the
realization omits what it was not given, leaving the cluster's default class to
claim the resource.

### `metrics` on the router — a scrape target

`core/prometheus-exporter`, admitted by the same selector, bringing another
resource of its own. Every input it takes is operator sizing rather than
application intent — how often a platform scrapes, and which port and path it
reads, are properties of the platform — so the operator attaches it, in the
Release, on the router's entry, with its type beside its `infra`. The Aggregate
does not mention it:

```yaml
  components:
    router:
      features:
        metrics:
          type: core/prometheus-exporter
          infra:
            interval: 30s
            port: metrics
            path: /metrics
```

The whole `spec` of
`dist/helm/router--metrics--router-servicemonitor-router-scrape.yaml`:

```yaml
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: router
  endpoints:
    - port: metrics
      interval: 30s
      path: /metrics
```

The `port` names a Service port rather than a number: `metrics`, which the
router's Recipe emits because the Aggregate sets the router's `metrics_enabled`
value, and which serves its metrics. That is also the Feature's default port
name, written out here with the other two knobs. The `http` port the Ingress
above routes to answers `/metrics` 403, so a scrape pointed there would collect
nothing. Whether metrics are served at all is the developer's choice, made in
the Aggregate; how often and at which port and path a platform scrapes them is
the operator's, made here.

### `selection` on the router — how it chooses between its targets

`core/target-selection`, which attaches to a gateway carrying
`gateway.aggrega.ai/intelligence: semantic`, as the router does. Which way the
router chooses is part of what the application asks of it, so the developer
attaches it in the Aggregate, with its `strategy` as a value:

```yaml
  components:
    router:
      features:
        selection:
          type: core/target-selection
          values:
            strategy: latency
```

and the Manifest binds it to the realization for this router:

```yaml
        core/target-selection:1.0.0: helm/target-selection-litellm:1.0.0
```

It renders no file of its own. Its realization writes one setting into the
routing table the router's Recipe renders — the last two lines of the `data`
block above:

```yaml
    router_settings:
      routing_strategy: latency-based-routing
```

With it, the proxy sends each request for `assistant` to the entry whose last
ten replies took the least time on average, per output token where a reply
reports its tokens, and an entry not yet tried counts as quickest, so each is
tried before the averages decide. Remove the attachment
from the Aggregate and rebuild: the build still reports twelve files, and the
routing table's ConfigMap differs by exactly those two lines. The router's
Recipe writes no strategy of its own, and without one the proxy picks between
the two entries at random.

Ask for `strategy: cost` instead and the build halts, writing nothing. The halt
is `E0033`, a failed assertion of the realization, and its message ends
with the rule's own sentence: *core/target-selection attachment "selection" on
"router" asks for strategy cost, but core/gateway/litellm cannot choose between
the entries of its model map by cost: the proxy looks each entry's target up,
exactly as written, in its own price table, which names OpenAI's and Anthropic's
models without the provider prefix a target carries (gpt-4o, not
openai/gpt-4o) and which the proxy may fetch afresh when it starts, and it
prices an entry it does not find, and that carries no price of its own, at a
fixed fallback, so the entries sharing an alias are priced alike and the choice
falls to their order. Ask for strategy latency, or remove the attachment*. Both
targets here are written that way, so the proxy would send every request to the
first of them while the Aggregate asked for cost.

## Where the compiler does not interpret

The agent's address and model name are read off what the router publishes, so
no pair of names in the three files has to be kept in step by hand. What the
build does check is the router's own rule that the alias it publishes is one its
map publishes — a rule its Component declares and the build evaluates, like any
other assertion an entity carries.

The rest is strings piped from one place to another. The compiler routes the
address and the alias without reading them: it does not know that one is a
hostname and the other a model name, and it has no access to a running cluster
to check that anything answers at `router-default:4000`. The
`model.aggrega.ai/api` label that admitted the router is the same kind of
string — the socket's selector matches it, and nothing checks what API actually
answers there. And every `target` in the map is a pointer the running proxy
resolves: change `openai/gpt-4o` to `openai/not-a-real-model` and the build
still succeeds, with the failure arriving at request time.

This is the same property that makes the rest of the example work. Because the
compiler does not interpret what it pipes, the router can be repointed at a
different provider, the agent can be wired to a different router, and the
credential realization can be swapped for a store-backed one — all without the
compiler needing to understand any of it, and without the agent changing.

## Adapting it

- **Repoint a provider.** Edit a `target` in the router's map. Nothing else
  changes: not the model, not the agent, not a rendered Secret.
- **Add a third provider.** Add a map entry. If it publishes the existing alias,
  the strategy starts choosing between three. If it publishes a new one, the map
  publishes two aliases, and the router's `values.model` names the one the agent
  is handed; a caller wanting the other asks for it by name. A model the catalog
  models whose API is the OpenAI API can instead be wired to the router's
  `models` socket, under an alias of its own and presenting the key its
  connection carries; `values.model` then names the alias the agent is handed.
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
- **Reach a router the catalog does not model.** Point the agent's `model` edge
  at a `core/ai-model/openai-compatible` component and write that router's
  address into its `infra.endpoint` in the Release. Nothing runs behind that
  component in-cluster, so the address is the operator's to write and to keep in
  step with the service it names.

For sharing one credential across several consumers' connections, see
[model-api-key-sharing](../model-api-key-sharing/). For a socket no catalog
entity declares, see [adhoc-uses-socket](../adhoc-uses-socket/).
