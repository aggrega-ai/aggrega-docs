# An APISIX gateway that holds its models to a token budget

A team puts two OpenAI models behind one gateway and wants a ceiling on what the
gateway spends on them each day, counted in tokens. This workspace compiles such
a gateway to Kubernetes manifests: Apache APISIX in front of the two models,
with `core/period-budget` attached.

The page also shows the one thing this gateway refuses to do for an AI
workload: keep a semantic cache. Adding one halts the build, and the reason is
worth reading before choosing a gateway for that job.

This workspace authors **no catalog entity of its own**. The three entity files
here — an Aggregate, a Manifest and a Release — are the whole of what anyone
writes.

## What it builds

| instance | catalog Component | what it is here |
|---|---|---|
| `gateway` | `core/gateway/apisix` | the gateway, serving two aliases: `assistant`, from the model `chat`, and `summarizer`, from the model `mini` |
| `chat` | `core/ai-model/openai` | OpenAI's `gpt-4o`, reached as a reference: nothing runs for it in the cluster |
| `mini` | `core/ai-model/openai` | OpenAI's `gpt-4o-mini`, reached the same way |

Two `uses` edges into the gateway's `models` socket, one to each model, each
carrying as its `credential` the key the gateway presents to that model; both
read one parameter, `openai_key`, which the Release fulfils. One Feature
attachment on the gateway, `budget`: the Aggregate writes what is counted,
`total_tokens`, and whose traffic one limit covers, `gateway` — everything the
gateway serves — and the Release writes how much and over how long: two million
tokens a day.

The Manifest maps the gateway to `apisix-chart`, the realization that renders
the project's own APISIX chart, at APISIX 3.18.0, and serves the models wired to
the gateway. With a model wired, the gateway reads its routes from a file
rendered with it, so it takes no etcd connection and no Admin API key; the
Aggregate wires neither.

## Building

```bash
./build-release.sh
```

A release needs a lockfile before it builds, and lockfiles are generated rather
than shipped, so a fresh clone has none. Resolve one first, or let the build
fill it:

```bash
aggrega pull --release release.yaml --pin-sources   # resolve once, then build with no flag
./build-release.sh -- --auto-pull                   # or resolve during the build
```

Resolving pins the APISIX chart the gateway's Recipe renders, fetched from the
chart's own repository, so it needs the network. This workspace resolves the
catalog entities through the `catalog_dirs` in `.aggrega-config.yaml`.

The build prints, with `<workspace>` standing for this example's folder:

```text
[… omitted: the resolution's summary and a total build time, which differ per run]
Build completed: 8 files written to <workspace>/dist
```

## The rendered tree

```
dist/helm/
├── chat-service.yaml
├── gateway--assistant-zdcredential--gateway-secret-gateway-assistant-credential.yaml
├── gateway--summarizer-zdcredential--gateway-secret-gateway-summarizer-credential.yaml
├── gateway-configmap-default-gateway.yaml
├── gateway-deployment-default-gateway.yaml
├── gateway-service-default-gateway-gateway.yaml
├── mini-service.yaml
└── gateway/
    └── model-routes.yaml
```

The budget brings no file of its own. What it does is written into the routes
file, `dist/helm/gateway/model-routes.yaml`, a ConfigMap the gateway mounts and
reads its whole routing configuration from. Each model renders one file, a
Service mapping an in-cluster name onto OpenAI's API host, and each credential
on a model connection renders a Secret of its own, named for the gateway and the
connection's alias.

## The budget, as the gateway reads it

Here is the `apisix.yaml` key of that ConfigMap:

```yaml
services:
  - id: "model-budget"
    plugins:
      ai-rate-limiting:
        limit: 2000000
        time_window: 86400
        limit_strategy: "total_tokens"
routes:
  - id: "model-assistant-chat"
    uri: "/assistant/v1/chat/completions"
    service_id: "model-budget"
    methods:
      - POST
    plugins:
      ai-proxy:
        provider: openai-compatible
        auth:
          header:
            Authorization: "$env://AI_PROXY_ASSISTANT_AUTHORIZATION"
        options:
          model: "gpt-4o"
        override:
          endpoint: "https://api.openai.com/v1/chat/completions"
  - id: "model-summarizer-chat"
    uri: "/summarizer/v1/chat/completions"
    service_id: "model-budget"
    [… omitted: the same route for gpt-4o-mini, presenting AI_PROXY_SUMMARIZER_AUTHORIZATION]
#END
```

Five things are worth reading off it.

**The budget sits on a service both routes name.** APISIX's token rate
limiting, `ai-rate-limiting`, keeps its count under the object it is declared
on. Written on each route, it would keep one count per route; written once on
`model-budget`, which every route names through `service_id`, it keeps one
count for everything the gateway serves — the `gateway` scope the attachment
asked for. With `scope: model` the Recipe writes one service per connection
instead, `model-assistant-budget` and `model-summarizer-budget`, so each model
has a limit of its own.

**The period is a window of seconds.** `1d` is written as `86400`. The window
opens with the first model request after the previous window closed and lasts
that long; it does not start at midnight. A calendar month has no fixed number
of seconds, so `1mo` is refused, as below.

**The unit is what is counted.** `total_tokens` is the tokens each model's
reply reports reading and writing together; `prompt_tokens` and
`completion_tokens` count one side. The gateway counts what the reply reports
and prices nothing, so it keeps no budget in US dollars.

**Each model has a chat route and no completion route.** Without the budget,
each alias also gets `/<alias>/v1/completions`. APISIX reads a reply's tokens
only from a request it recognises the protocol of, and a completion request,
whose body carries a `prompt` rather than `messages`, is not one: it would be
answered and never counted. So while the budget is attached that route is not
written, and a completion request is answered `404 Route Not Found`.

**No key is in it.** Each route names the variable holding its connection's
bearer token through APISIX's `$env://` reference. From
`dist/helm/gateway-deployment-default-gateway.yaml`, the `env` of the gateway's
container:

```yaml
          env:
            - name: AI_PROXY_ASSISTANT_API_KEY
              valueFrom:
                secretKeyRef:
                  key: api-key
                  name: gateway-assistant.credential
            - name: AI_PROXY_ASSISTANT_AUTHORIZATION
              value: Bearer $(AI_PROXY_ASSISTANT_API_KEY)
            [… omitted: the same two variables for summarizer]
```

The same Deployment runs one replica, `replicas: 1`. The count is held in the
memory of the gateway process, so a second replica would keep a count of its
own; while a budget is attached the Recipe holds the chart at one.

## What the gateway does at run time

On every model request the gateway checks the count against `limit`. Once the
count has reached it, the gateway answers `503 Service Temporarily Unavailable`
until the window closes, with the request never sent to the model; the
response carries the gateway's own `X-AI-RateLimit-Limit-…`,
`X-AI-RateLimit-Remaining-…` and `X-AI-RateLimit-Reset-…` headers. A request's
tokens are added when its reply completes, so the request that brings the count
to the limit is served, and so is any request already in flight beside it.

Two consequences follow, and both are the gateway's behaviour rather than
configuration:

- **A restart starts a new window.** The count lives in the gateway process's
  memory, so a rolled or restarted pod begins counting from zero.
- **A reply reporting no tokens counts nothing.** The count is what each model
  reports; the gateway asks a streamed chat request to report its usage, and a
  model that reports none adds nothing.

## What halts the build

Each of these is a sentence the build prints, naming what to change:

- **A cost in US dollars.** Set `unit: usd` in the attachment and the build halts
  before anything renders:

  ```text
  [CATALOG_ERROR E0033]
    Recipe/FeatureRecipe assertions
    caused by: FeatureRecipe "period-budget-apisix" instance "gateway" assertion "unit_is_a_token_count": [… omitted: the template position and the assertion's own source]: error calling fail: assertion failed: core/period-budget attachment "budget" on "gateway" asks for unit usd, but core/gateway/apisix, which declares dataplane.aggrega.ai/period-budget: tokens, counts the tokens each model's reply reports and prices nothing, so it keeps no budget in US dollars; set unit to total_tokens, prompt_tokens or completion_tokens, or attach the Feature to a gateway that counts cost
  ```

- **A budget per caller**, `scope: caller`. The gateway tells callers apart only
  by the consumer an authentication plugin names, and a gateway reading its
  routes from a rendered file holds no consumers the file does not declare.
- **A calendar month**, `period: 1mo`, and **a limit that is not a whole number
  of tokens**.
- **A second `core/period-budget` attachment on the gateway**, which runs one
  token rate limit on a route.
- **Nothing wired to the `models` socket**, which leaves no model route to count.
- **The other realization.** Map `core/gateway/apisix` to `helm/apisix` in the
  Manifest and the build halts on the `models` connections, naming
  `helm/apisix-chart`: that realization runs APISIX 3.17.0 with its routes in
  etcd and renders none. It halts on a budget attachment as well, since it has
  no route to write one onto and, at 3.17.0, each gateway process counts on its
  own.

## A semantic cache halts the build

APISIX 3.18.0 carries a semantic cache, and `core/semantic-caching` attaches to
this gateway. Add one to the gateway's `features` in `aggregate.yaml`:

```yaml
        answers:
          type: core/semantic-caching
          values:
            embedding_model: assistant
            similarity_threshold: 0.9
            ttl_seconds: 3600
```

The Manifest already routes the Feature to its APISIX realization, and the build
halts:

```text
[CATALOG_ERROR E0033]
  Recipe/FeatureRecipe assertions
  caused by: FeatureRecipe "semantic-caching-apisix" instance "gateway" assertion "gateway_tells_callers_apart": [… omitted: the template position and the assertion's own source]: error calling fail: assertion failed: core/semantic-caching attachment "answers" on "gateway" asks for scope end_user, which keeps each end user the gateway identifies apart, but core/gateway/apisix keeps two callers' cached replies apart only by the consumer an authentication plugin names, or by a value the request itself carries, which it does not verify, and while it serves the models wired to it, it reads its routes from a file rendered with it and runs no Admin API, so it has no consumers: the file declares none, and it identifies no caller, no end user and no key. Every request would share one cache, and a reply generated for one caller could be served to another; remove the attachment
```

A cache keeps a reply for whoever asks something close enough later, so who
shares one cache decides who can be served a reply generated for someone else.
This gateway has no caller it can tell apart: with `scope: key` the build halts
the same way. Rather than render a cache every caller shares under a scope that
says it does not, the realization refuses every attachment. A gateway that
identifies its callers, such as `core/gateway/litellm`, realizes the cache.

## Where the compiler is blind

The compiler pipes the limit, the window and the unit into the routes file as
strings, and each model's endpoint and model name from what that model
publishes. It does not reach OpenAI, does not know whether a reply reports its
tokens, and counts nothing itself. Each halt above is declared by the catalog's
own entities, as an assertion in the budget's or the cache's realization or in
the gateway's other Recipe, and none of them rests on any understanding of the
traffic.

## Adapting it

- **A limit per model.** Set `scope: model`: each alias gets a service, and a
  count, of its own.
- **Count one side.** Set `unit: prompt_tokens` to count what the models read,
  or `completion_tokens` for what they write.
- **A shorter or longer window.** Set `period` to a number of seconds, minutes,
  hours or days in the Release, as in `6h` or `30d`.
