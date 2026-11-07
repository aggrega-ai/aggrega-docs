---
example:
  level: start
  products: [core/ai-agent/crewai, core/ai-model/openai, core/datastore/redis, core/gateway/envoy-ai-gateway-operator, core/gateway/envoy-gateway, core/security/cert-manager]
  shows: [connections, features]
---

# Envoy Gateway in front of OpenAI, with a monthly token budget

A team puts OpenAI's `gpt-4o-mini` behind an in-cluster gateway, wants a ceiling
on the tokens the gateway spends on it each calendar month, and points its agent
at the gateway rather than at OpenAI. This workspace compiles that to Kubernetes
manifests: Envoy Gateway serving the model through Envoy AI Gateway, with
`core/period-budget` attached, a Redis keeping the count, and a CrewAI agent
sending its model requests through the gateway.

The page also shows what this gateway refuses to count: a budget in US dollars
halts the build, and so does a budget per caller.

This workspace authors **no catalog entity of its own**. The three entity files
here — an Aggregate, a Manifest and a Release — are the whole of what anyone
writes.

## What it builds

| instance | catalog Component | what it is here |
|---|---|---|
| `edge` | `core/gateway/envoy-gateway` | the gateway, serving one alias, `assistant`, from the model `chat` |
| `ai-controller` | `core/gateway/envoy-ai-gateway-operator` | Envoy AI Gateway's controller, which the gateway calls as its extension server, installed with the six AI Gateway resource definitions |
| `chat` | `core/ai-model/openai` | OpenAI's `gpt-4o-mini`, reached as a reference: nothing runs for it in the cluster |
| `counters` | `core/datastore/redis` | the store the gateway's rate-limit service keeps the budget's count in |
| `assistant` | `core/ai-agent/crewai` | an agent whose model requests go to the gateway |
| `certs` | `core/security/cert-manager` | cert-manager, which issues the certificate the controller's webhook serves |

The gateway's `uses` edges leave from its `extension` socket, to the
controller; from `models`, to the model, carrying as its `credential` the key
the gateway presents to OpenAI; and from `cache`, to the store, carrying the
password the rate-limit service presents to it. The agent's `model` edge points
at the gateway, not at the model. One Feature attachment on the gateway,
`budget`: the Aggregate writes what is counted, `total_tokens`, and whose
traffic one limit covers, `gateway` — everything the gateway serves — and the
Release writes how much and over how long: twenty million tokens a calendar
month.

The Manifest binds every credential to `k8s-existing-secret`, which points a
workload at a Secret already in its namespace and renders none, so no key or
password is in the Aggregate, the Release or the rendered output. The Secrets'
names are two parameters the Release fulfils, and the store's own `password`
slot reads the same parameter as the gateway's `cache` connection, so the store
and the service presenting the password to it name one Secret.

The Release declares where each workload runs: cert-manager in `cert-manager`,
the controller in `envoy-ai-gateway-system`, the agent in `assistant`, and the
gateway in `envoy-gateway-system` — the controller looks for the gateway's
control plane there, and the build halts with the gateway placed anywhere else —
with the store beside it. The model runs nothing: its one file, a Service
mapping an in-cluster name onto OpenAI's host, names no namespace, and the
gateway reaches OpenAI at the endpoint the model publishes rather than through
that Service.

## cert-manager is declared, not assumed

The controller's webhook serves a certificate cert-manager issues: its Recipe
renders a cert-manager `Certificate` and the self-signed `Issuer` that signs it,
which only a running cert-manager reconciles. The compiler cannot look at a
cluster to see whether one runs there, so the workspace declares cert-manager
rather than assuming it: `certs` sits in the Aggregate beside the controller,
and the build renders cert-manager with everything else.

A cluster runs one cert-manager. Where yours already runs one, remove `certs`
from the Aggregate and the Release before building; the build then renders the
same files less cert-manager's own.

## Building

```bash
aggrega build --release release.yaml
```

A release needs a lockfile before it builds, and lockfiles are generated rather
than shipped, so a fresh clone has none. Resolve one first, or let the build
fill it:

```bash
aggrega pull --release release.yaml --pin-sources   # resolve once, then build with no flag
aggrega build --release release.yaml --auto-pull    # or resolve during the build
```

Resolving pins the three charts the Recipes render — Envoy Gateway's and
Envoy AI Gateway's from Docker Hub, cert-manager's from quay.io — so it needs
the network. This workspace resolves the catalog entities from the
default registry `.aggrega-config.yaml` names.

Building with `--auto-pull` prints, with `<workspace>` standing for this example's folder:

```text
Pull complete: release.lock (entities=26, source_artifacts=3, external_inputs=0)
[… omitted: a notice that core/referenced-secret declares origin in both of its pillars, and the total build time, which differs per run]
Build completed: 113 files written to <workspace>/dist
```

## The rendered tree

```
dist/helm/
├── ai-controller-certificate-envoy-ai-gateway-system-self-signed-cert-for-mutating-webhook.yaml
[… omitted: the controller's two cluster roles and their bindings]
├── ai-controller-deployment-envoy-ai-gateway-system-ai-controller.yaml
├── ai-controller-issuer-envoy-ai-gateway-system-self-signed-issuer-for-mutating-webhook.yaml
├── ai-controller-mutatingwebhookconfiguration-envoy-ai-gateway-gateway-pod-mutator-envoy-ai-gateway-system.yaml
├── ai-controller-service-envoy-ai-gateway-system-ai-controller.yaml
[… omitted: the controller's service account]
├── ai-controller/
│   ├── aigateway.envoyproxy.io_aigatewayroutes.yaml
[… omitted: the other five AI Gateway resource definitions]
├── assistant-deployment.yaml
[… omitted: the files cert-manager's chart renders, each named certs-…]
├── chat-service.yaml
├── counters-default-service.yaml
├── counters-deployment.yaml
[… omitted: Envoy Gateway's cluster roles and their bindings]
├── edge-configmap-envoy-gateway-system-envoy-gateway-config.yaml
[… omitted: the resource definitions Envoy Gateway's chart installs]
├── edge-deployment-envoy-gateway-system-envoy-gateway.yaml
[… omitted: the rest of Envoy Gateway's chart — its certificate job, admission configurations, roles, bindings, Service and service accounts]
└── edge/
    ├── gateway.yaml
    ├── gatewayclass.yaml
    └── models.yaml
```

The budget brings no file of its own. What it does is written into two of the
gateway's files: `dist/helm/edge/models.yaml`, which holds the AI route and the
resources reaching the model, and the control plane's configuration,
`dist/helm/edge-configmap-envoy-gateway-system-envoy-gateway-config.yaml`.

## The budget, as the gateway reads it

From `models.yaml`, the AI route:

```yaml
apiVersion: aigateway.envoyproxy.io/v1beta1
kind: AIGatewayRoute
metadata:
  [… omitted: the labels and annotations every rendered resource carries]
  name: edge-models
  namespace: "envoy-gateway-system"
spec:
  parentRefs:
    - name: edge
      kind: Gateway
      group: gateway.networking.k8s.io
  llmRequestCosts:
    - metadataKey: llm_total_token
      type: TotalToken
  rules:
    - matches:
        - headers:
            - type: Exact
              name: x-ai-eg-model
              value: "assistant"
      backendRefs:
        - name: edge-assistant
          modelNameOverride: "gpt-4o-mini"
```

and, from the same file, the traffic policy that limits it, named like the route
it targets:

```yaml
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: BackendTrafficPolicy
metadata:
  [… omitted: the labels and annotations every rendered resource carries]
  name: edge-models
  namespace: "envoy-gateway-system"
spec:
  targetRefs:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      name: edge-models
  rateLimit:
    global:
      rules:
        - limit:
            requests: 20000000
            unit: Month
          shared: true
          cost:
            request:
              from: Number
              number: 0
            response:
              from: Metadata
              metadata:
                namespace: io.envoy.ai_gateway
                key: llm_total_token
```

Here is the `envoy-gateway.yaml` key of the control plane's configuration:

```yaml
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: EnvoyGateway
extensionApis:
  enableBackend: true
  enableEnvoyPatchPolicy: true
extensionManager:
  hooks:
    xdsTranslator:
      post:
      - Translation
      - Cluster
      - Route
      translation:
        cluster:
          includeAll: true
        listener:
          includeAll: true
        route:
          includeAll: true
        secret:
          includeAll: true
  service:
    fqdn:
      hostname: ai-controller.envoy-ai-gateway-system.svc.cluster.local
      port: 1063
gateway:
  controllerName: gateway.envoyproxy.io/gatewayclass-controller
logging:
  level:
    default: info
provider:
  kubernetes:
    rateLimitDeployment:
      container:
        env:
        - name: REDIS_AUTH
          valueFrom:
            secretKeyRef:
              key: password
              name: counter-store-password
        - name: USE_CALENDAR_MONTH_RATE_LIMIT
          value: "true"
        image: docker.io/envoyproxy/ratelimit:8fe6ea42
      patch:
        type: StrategicMerge
        value:
          spec:
            template:
              spec:
                containers:
                - imagePullPolicy: IfNotPresent
                  name: envoy-ratelimit
    shutdownManager:
      image: docker.io/envoyproxy/gateway:v1.9.1
  type: Kubernetes
rateLimit:
  backend:
    redis:
      url: counters-default.envoy-gateway-system.svc.cluster.local:6379
    type: Redis
  failClosed: true
```

What to read off them:

**The cost sits on the AI route, the limit on the route it becomes.** Envoy AI
Gateway reads the `total_tokens` each reply of the model reports and writes it
into the request's metadata under `llm_total_token`: that is what
`llmRequestCosts` declares. The controller turns the AI route into an HTTP route
of the same name, `edge-models`, and the traffic policy targets that route, so
the budget covers the model traffic and no other route attached to the gateway.

**A reply is charged when it completes.** `cost.request` charges nothing as a
request arrives; `cost.response` charges the reply's tokens once the reply is
complete. A request is refused once the count charged so far exceeds `limit`.

**One count for the whole gateway.** `shared: true` keeps one count across
every rule of the route — the `gateway` scope the attachment asked for. With
`scope: model` the Recipe writes one rule per connection on the `models` socket,
each matching the model name a request carries in `x-ai-eg-model`, so each model
is counted apart.

**The period is a unit on the clock.** `1mo` is written as `unit: Month`, and
the configuration tells Envoy Gateway's rate-limit service, through
`USE_CALENDAR_MONTH_RATE_LIMIT`, to count a Month from the first day of a
calendar month to its last. That setting belongs to the service, so it applies
to every Month rate limit this Envoy Gateway install keeps, the budget's and any
other. Every window starts at a fixed point on the UTC clock rather than with a
first request: a day at 00:00 UTC, a week on a Thursday.

**The count lives in the store on the `cache` socket.** The `rateLimit` block
turns on Envoy Gateway's own rate-limit service, which the control plane
creates in its namespace and turns on for every gateway it serves, and points it
at the Redis the gateway's `cache` socket reaches. The store publishes its host
with no namespace, so the gateway qualifies it with the one the Release places
the store in.

**A check that gets no answer refuses the request.** `failClosed: true` has
Envoy refuse a model request with HTTP 500 while the store or the rate-limit
service cannot be reached, or a check takes longer than Envoy's rate-limit
timeout, 20 ms by default, rather than serve it and not count it. That setting
belongs to the control plane, so it holds for every rate limit this Envoy
Gateway install keeps, and a rate limit applied to the install by hand fails
closed too. The configuration carries it only while the budget is attached.

**No password is in it.** The service reads the store's password as
`REDIS_AUTH`, from the Secret the `cache` connection's credential names,
`counter-store-password`, which it resolves in its own namespace, the gateway's.
The store, `counters-deployment.yaml`, starts with `--requirepass` read from the
same Secret.

## The path from the agent to the model

From `assistant-deployment.yaml`, the `env` of the agent's container:

```yaml
          env:
            - name: OPENAI_BASE_URL
              value: http://envoy-envoy-gateway-system-edge-06431a46.envoy-gateway-system.svc.cluster.local:80/v1
            - name: MODEL
              value: assistant
            - name: CREWAI_ALLOW_DELEGATION
              value: "false"
            - name: CREWAI_BACKSTORY
              value: a help-desk agent answering customers
            - name: CREWAI_GOAL
              value: answer questions about the product
            - name: CREWAI_LOG_LEVEL
              value: DEBUG
            - name: CREWAI_ROLE
              value: support assistant
```

The agent reads the two keys the gateway publishes, which are the two a model
publishes, so its Recipe reads them as it would read a model's. The `CREWAI_`
variables carry the agent's own values, under the names the CrewAI Component
gives them by default. The address is
the Service Envoy Gateway creates for the gateway's data plane, named from the
gateway's namespace, its name and a hash of the two, and qualified with
`envoy-gateway-system`, so it resolves from the agent's namespace. The model
name is the alias `assistant`; the route sends a request naming it to the
model's backend, asking for `gpt-4o-mini` instead.

The backend reaches OpenAI at the endpoint the model publishes:
`models.yaml` carries an Envoy Gateway `Backend` for `api.openai.com` on port
443, a TLS policy checking its certificate against the system's trust anchors,
an `AIServiceBackend` for the OpenAI API under `/v1`, and the security policy
presenting the key, `edge-assistant`, whose `spec` is:

```yaml
spec:
  targetRefs:
    - group: aigateway.envoyproxy.io
      kind: AIServiceBackend
      name: edge-assistant
  type: APIKey
  apiKey:
    secretRef:
      name: "openai-api-key"
```

The controller reads the key from that Secret, in the gateway's namespace,
under the data key `apiKey`, and sends it to OpenAI as a bearer token, so no
rendered file carries it and the agent never holds it. The gateway calls the
controller at the address the controller publishes, qualified with the
namespace the Release places it in — the `extensionManager` block above. While a
model is wired, the gateway also takes Envoy AI Gateway's client traffic
policy, `edge-client-buffer-limit` in `models.yaml`, raising the buffer each
incoming connection is allowed to 50Mi; it targets the gateway, so it applies to
every route attached to it.

## What the gateway does at run time

On each model request the gateway asks the rate-limit service whether the
tokens charged so far this month exceed `limit`. Once they do, it answers model
requests with HTTP 429 until the month ends. A request's tokens are added once
its reply is complete, so the request that crosses the limit is served, and so
is any request answered beside it. While the store or the rate-limit service
cannot be reached, or a check takes longer than Envoy's rate-limit timeout, it
refuses model requests with HTTP 500, under the `failClosed` setting above, so
no model request is admitted while its count cannot be checked.

What follows from that is the product's behaviour rather than configuration:

- **A request admitted just before an outage is still served and not
  counted.** Its tokens are charged after the reply, so a reply completing
  while the store or the service cannot be reached adds nothing to the count.
- **A store keeping the count in memory starts every window again when it
  restarts.** `core/datastore/redis` keeps its entries in memory by default, so a
  restarted store loses the count kept so far, and the rest of the month is
  counted from zero.
- **A reply reporting no usage adds nothing.** The count is what each reply
  reports; Envoy AI Gateway asks the model to report its usage at the end of a
  streamed reply too.

## What halts the build

Each of these is a sentence the build prints, naming what to change:

- **A cost in US dollars.** Set `unit: usd` in the attachment and the build
  halts before anything renders:

  ```text
  [… omitted: what resolving the lockfile prints, the same halt among it, and a notice that core/referenced-secret declares origin in both of its pillars]
  [CATALOG_ERROR E0033]
    Recipe/FeatureRecipe assertions
    caused by: FeatureRecipe "period-budget-envoy-gateway" instance "edge" assertion "unit_is_a_token_count": [… omitted: the template position and the assertion's own source]: error calling fail: assertion failed: core/period-budget attachment "budget" on "edge" asks for unit usd, but core/gateway/envoy-gateway, which declares dataplane.aggrega.ai/period-budget: tokens, counts the tokens each model's reply reports and prices nothing, so it keeps no budget in US dollars; set unit to total_tokens, prompt_tokens or completion_tokens, or attach the Feature to a gateway that counts cost
  ```

- **A budget per caller**, `scope: caller`. The gateway tells callers apart
  only by a header the caller writes itself, and nothing on this path verifies
  who the caller is, so a caller sending a new value would start a fresh budget
  and one sending none would not be counted.
- **Any period the gateway has no window for.** It keeps one whole unit of its
  rate limit: `1s`, `1m`, `1h`, `1d`, `7d`, `30d`, `365d`, or `1mo`, or the same
  length spelt otherwise, as `24h`. `2h`, `14d` or `2mo` halts.
- **A limit that is not a whole number of tokens**, or one above 4294967295.
- **A second `core/period-budget` attachment on the gateway**, which writes one
  budget onto the route serving its models.
- **Nothing wired to the `models` socket**, which leaves no model route to
  count, **or to the `cache` socket**, which leaves the count nowhere to live.
  Remove the model's connection alone and the gateway's own Component halts
  first, on `values.model` naming an alias nothing serves.
- **A store on the `cache` socket that does not speak the Redis protocol** —
  one publishing a protocol other than `redis` or `valkey`.
- **The gateway placed outside `envoy-gateway-system`** while the controller is
  wired to its `extension` socket.

## Before applying it

The tree holds no Namespace and no Secret, so a cluster receiving
`dist/helm/` needs:

- **The namespaces** `cert-manager`, `envoy-ai-gateway-system`,
  `envoy-gateway-system` and `assistant`.
- **The Secrets, in `envoy-gateway-system`**: `openai-api-key`, holding
  OpenAI's key under the data key `apiKey`, and `counter-store-password`,
  holding the store's password under `password`. A workload referencing a Secret
  that does not exist does not start.
- **A server-side apply for two of the AI Gateway definitions**,
  `aigateway.envoyproxy.io_backendsecuritypolicies.yaml` and
  `aigateway.envoyproxy.io_mcproutes.yaml`, which are larger than the copy of the
  applied object a client-side apply records, so a client-side apply refuses
  them.
- **An image for the agent.** The Release names
  `registry.example/crew-assistant:1.0.0`; the catalog packages the agent
  runtime, and the crew it runs is your own code.

## Where the compiler does not interpret

The compiler pipes the limit, the unit and the token cost into the gateway's
resources as strings, and the model's endpoint, the store's address and the
controller's address from what each publishes. It does not reach OpenAI, does
not know whether a reply reports its tokens, and counts nothing itself; it does
not check that the Secrets exist or that cert-manager runs. Each halt above is
declared by the catalog's own entities, as an assertion in the budget's
realization or in the gateway's Component or Recipe, and none of them rests on
any understanding of the traffic.

## Adapting it

- **A limit per model.** Wire more models to the `models` socket and set
  `scope: model`: each gets a rule, and a count, of its own.
- **Count one side.** Set `unit: prompt_tokens` to count what the model reads,
  or `completion_tokens` for what it writes.
- **Send a failed request again.** Attach `core/retry-policy` to the gateway
  with `max_attempts` and map it in the Manifest to
  `helm/retry-policy-envoy-gateway`: the same traffic policy, `edge-models`,
  gains a `retry` beside the rate limit, because Envoy Gateway attaches one
  traffic policy to a route.
- **A shorter or a fixed-length window.** Set `period` in the Release to one of
  the lengths above: `1d` is a day from 00:00 UTC, and `30d` is 30 days counted
  from 1 January 1970 rather than a calendar month. With any period but `1mo`
  the configuration leaves the calendar-month setting unset.
- **MCP routes.** The controller encrypts MCP session identifiers under a key
  derived from the seed in the Secret `infra.mcp_session_seed_secret` names on
  `ai-controller`; with none named, as here, the seed is its chart's published
  default, so name one before serving an MCP route through it.
