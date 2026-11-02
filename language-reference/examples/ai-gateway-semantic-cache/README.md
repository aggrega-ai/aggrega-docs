---
example:
  level: start
  products: [core/ai-model/openai, core/ai-model/openai-embedding, core/datastore/redis, core/gateway/litellm]
  shows: [connections, features]
---

# An AI gateway that answers from what it already said

A support assistant is asked the same questions all day in slightly different
words. The gateway in front of its model can answer a question from the reply it
gave an earlier one close enough in meaning, rather than calling the model
again. This workspace compiles such a gateway to Kubernetes manifests, with the
store it keeps those replies in.

The Feature that does it is `core/semantic-caching`. Which replies one caller
can be served that another caller's request produced is the question this page
spends most of its time on, because a cache shared by the wrong callers hands
one person a reply generated for another.

This workspace authors **no catalog entity of its own**. The three entity files
here — an Aggregate, a Manifest and a Release — are the whole of what anyone
writes.

## What it builds

| instance | catalog Component | what it is here |
|---|---|---|
| `router` | `core/gateway/litellm` | the AI gateway: a chat alias, `assistant`, and an embedding alias, `embedder`, each served from a model wired to its `models` socket |
| `chat` | `core/ai-model/openai` | the chat model behind `assistant`, OpenAI's own API, reached as a reference: nothing runs for it in the cluster |
| `embeddings` | `core/ai-model/openai-embedding` | the embedding model behind `embedder`, reached the same way |
| `cache` | `core/datastore/redis` | the store the gateway keeps its replies in |

Three `uses` edges: two into the gateway's `models` socket, one to each model,
each carrying as its `credential` the key the gateway presents to that model,
and one into its `cache_store` socket, carrying as its `credential` the password
the cache presents to the store. Two Feature attachments on the gateway:
`api_key`, its administrative key, and `answers`, the cache; and one on the
store, `password`, the password it requires. Both password attachments read one
parameter, `cache_password`, and both model credentials another, `openai_key`;
the Release fulfils both. The `answers` attachment names the embedding alias
that turns each prompt into a vector, how alike two prompts must be — `0.9`,
as a cosine similarity — and how long a stored reply lasts, an hour. It leaves
`scope` out, so it takes the default, `end_user`.

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
`.aggrega-config.yaml` names. The cache's realization runs one plugin that ships in
neither the compiler nor the catalog, the gateway configuration step
`pipeline-step/litellm-gateway-config`, which the resolution fetches from the
registry `default_registry` names, `hub.aggrega.ai`.

The build prints, with `<workspace>` standing for this example's folder:

```text
[… omitted: a line reporting on the gateway configuration step's plugin, five warnings, one per credential attachment, that the declared-sensitive origin reaches the target with no per-key sensitivity marking, because the realization maps it through a valuesMapping, the resolution's summary and a total build time, which differ per run, and a notice that core/referenced-secret declares origin in both of its pillars]
Build completed: 13 files written to <workspace>/dist
```

## The rendered tree

```
dist/helm/
├── cache--password--cache-secret-cache-password.yaml
├── cache-default-service.yaml
├── cache-deployment.yaml
├── chat-service.yaml
├── embeddings-service.yaml
├── router--api-zukey--router-secret-router-api-key.yaml
├── router--assistant-zdcredential--router-secret-router-assistant-credential.yaml
├── router--embedder-zdcredential--router-secret-router-embedder-credential.yaml
├── router--replies-zdcredential--router-secret-router-replies-credential.yaml
├── router-default-service.yaml
├── router-deployment.yaml
└── router/
    ├── litellm-gateway-config/
    │   └── configmap.yaml
    └── request-guard/
        └── request-guard.yaml
```

The cache attachment brings no file of its own. What it does is written into the
gateway's configuration. Each model renders one file, a Service mapping an
in-cluster name onto OpenAI's API host, and each credential on a model
connection renders a Secret of its own, named for the gateway and the
connection's alias.

## The models it serves

The routing table, the start of the gateway's configuration body, has one entry
per connection on the `models` socket, written from what each model publishes —
its endpoint, OpenAI's API base URL, and its model name — and naming the
variable the gateway's Recipe delivers that connection's key under:

```yaml
model_list:
  - model_name: "assistant"
    litellm_params:
      model: "openai/gpt-4o"
      api_base: "https://api.openai.com/v1"
      api_key: os.environ/LITELLM_MODEL_ASSISTANT_API_KEY
  - model_name: "embedder"
    litellm_params:
      model: "openai/text-embedding-3-small"
      api_base: "https://api.openai.com/v1"
      api_key: os.environ/LITELLM_MODEL_EMBEDDER_API_KEY
```

## The cache, as the gateway reads it

Here is the gateway's configuration body, the `config.yaml` key of
`dist/helm/router/litellm-gateway-config/configmap.yaml`, from its
`litellm_settings` on:

```yaml
[… omitted: the routing table]
litellm_settings:
  callbacks:
    - /etc/litellm-request-guard/request_field_filter.filter
  cache: true
  cache_params:
    host: os.environ/SEMANTIC_CACHE_STORE_HOST
    port: os.environ/SEMANTIC_CACHE_STORE_PORT
    redis_semantic_cache_embedding_model: embedder
    redis_semantic_cache_index_name: router-answers
    semantic_cache_scope: end_user
    similarity_threshold: 0.9
    supported_call_types:
      - acompletion
      - completion
      - aresponses
      - responses
      - aanthropic_messages
      - anthropic_messages
    ttl: 3600
    type: redis-semantic
```

Five things are worth reading off it.

**The store's address is not in it.** `host` and `port` name two environment
variables through the gateway's own indirection, and the gateway's Recipe sets
those from the `cache_store` edge. From `dist/helm/router-deployment.yaml`, the
`env` of the gateway's container:

```yaml
          env:
            - name: LITELLM_MASTER_KEY
              valueFrom:
                secretKeyRef:
                  name: router-api-key
                  key: master-key
            - name: REDIS_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: router-replies.credential
                  key: password
            - name: LITELLM_MODEL_ASSISTANT_API_KEY
              valueFrom:
                secretKeyRef:
                  name: router-assistant.credential
                  key: api-key
            - name: LITELLM_MODEL_EMBEDDER_API_KEY
              valueFrom:
                secretKeyRef:
                  name: router-embedder.credential
                  key: api-key
            - name: SEMANTIC_CACHE_STORE_HOST
              value: cache-default
            - name: SEMANTIC_CACHE_STORE_PORT
              value: "6379"
```

`cache-default` is the Service the store's own Recipe emits, read off what that
Recipe publishes, and `6379` the port it publishes. The cache reads the store's
password from `REDIS_PASSWORD`, a reference to the Secret the `credential` on
the `cache_store` edge renders, `router-replies.credential`, and never the
password itself. The store renders a Secret of its own from the same
parameter, `cache-password`, and starts with `--requirepass` read from it, so
the password the cache presents and the one the store requires are one value,
written once. With no `cache_store` edge none of the three variables the store's
address and password arrive under is rendered, and the cache, with nowhere to
keep its replies, halts the build, as below. The third and fourth entries are
the models' keys, each referenced from the Secret its own connection's
credential renders, under the variable its entry in the routing table names;
the helm provider writes every entry it reads from a Secret ahead of the plain
ones.

**The embedding model is an alias of the gateway's own map.** The gateway sends
each prompt to `embedder` through the same map a caller's request goes through,
so the cache holds no address or credential of its own. Name an alias the map
does not publish and the build halts, listing the ones it does.

**The lifetime is the store's.** Each reply is written with `ttl` as its
expiry, so Redis removes it an hour after it was stored. The next request for
that prompt is answered by the model and stored afresh.

**Only the kinds of request whose prompt the cache reads are named.** Chat
requests, streamed or not, and the responses and messages APIs are cached. A
completions request is not, and neither is an embeddings request: left to its
own default the gateway would store the reply to every embeddings request,
embedding each input a second time to do it, and serve none of them back.

**The index is named for the gateway and the attachment**, `router-answers`, so
two gateways of one Release sharing a store keep their replies in separate
indexes.

## Who is served from one cache entry

A stored reply is served to a later request only when everything that makes up
its bucket matches, and the prompt is at least `0.9` alike to the one it
answered:

- the key the request presents, as the gateway verified it, with that key's
  team and organization;
- under `end_user`, the end user the request names;
- the model the request asks for, and the request's other parameters — a
  different temperature is a different bucket.

The gateway writes the key, its team and organization and the end user into the
request itself. On a chat request it writes them into the request's `metadata`,
over any value the caller sent there; on a responses or messages request it
keeps them apart from the caller's `metadata`, removes from it any team,
organization or end user field the caller wrote, and the request guard its
Recipe delivers refuses a request naming the key there, `metadata.user_api_key`,
with HTTP 400 naming the field. So no request can name its way into another
key's bucket.

A request's own `metadata` can still move it among the buckets of the key it
presents. On a responses request, `model_group` takes the place of the model the
request asks for in its bucket. On a responses or messages request,
`caching_groups` lets requests naming the same group of model aliases share
replies across them. On a responses or chat request, `redis_namespace` keeps
requests naming a namespace in buckets apart from those naming none. None of
them reaches another key's bucket.

**This gateway's key is its administrative key, and every caller holds it.**
It has no bookkeeping database attached, so it issues no keys of its own: every
caller presents the key attached to `api_key`, and a request with no key, or
with a key the gateway did not issue, is refused before anything is looked up.
So the key separates no caller from another here, and under the default scope
what keeps two callers apart is the end user each request names.

**Under `end_user`, the default, an entry is served to requests naming the same
end user.** The gateway reads the end user from the request: an
`x-litellm-end-user-id` or `x-litellm-customer-id` header, or the body's `user`,
`metadata.user_id`, `litellm_metadata.user` or `safety_identifier` field. A
reply stored for `alice` is served for `alice`'s similarly worded question, and
not for `bob`'s.

Two things follow, and both are the gateway's behaviour rather than
configuration:

- **The gateway verifies none of those names.** Whoever holds the key can name
  any end user and is served what was stored for that end user. Keep the key
  with the application that knows who its end users are, and let it name them;
  do not hand the key to the end users themselves.
- **Requests naming no end user share one cache.** Every such request presenting
  the same key is served from the same entries, whoever sent it.

**Under `key`, every caller presenting the key is served from one cache.** Add
`scope: key` to the attachment's values and rebuild: the configuration's
`semantic_cache_scope` reads `key`, and nothing else in the rendered output
changes. The end user a header names is then no part of the bucket, so a reply
stored for `alice`, named in an `x-litellm-end-user-id` header, is served for
`bob`'s similarly worded question naming him the same way, tool calls in it
included. The body's `user` field is one of the request's other parameters,
though, so two requests naming different end users there still fall in
different buckets, as two temperatures do. That suits a cache of answers that
are the same for everyone and nothing else.

## What halts the build

Each of these is a sentence the build prints, naming what to change:

- **No administrative key.** Remove the `api_key` attachment and the build
  halts before anything renders:

  ```text
  [… omitted: a line reporting on the gateway configuration step's plugin, what resolving the lockfile prints, the same halt among it, and a notice that core/referenced-secret declares origin in both of its pillars]
  [CATALOG_ERROR E0033]
    Recipe/FeatureRecipe assertions
    caused by: FeatureRecipe "semantic-caching-litellm" instance "router" assertion "gateway_checks_the_caller": [… omitted: the template position and the assertion's own source]: error calling fail: assertion failed: core/semantic-caching attachment "answers" on "router" needs core/gateway/litellm to check every caller's key before a cached reply is served, but its api_key credential slot is not attached, so the gateway checks no caller and a cache bucket would be made only of what each caller claims. Attach a credential to the api_key slot of "router"
  ```

- **No store.** Remove the `cache_store` edge and the build halts naming the
  socket to wire.
- **A store that publishes no `vector_search`.** The socket admits the
  key-value stores, and the gateway's Recipe halts on one that does not state it
  serves the Redis query engine's vector search, which the cache searches its
  replies with: a Redis before release 8.0, or Valkey, would cache nothing while
  every request still succeeded.
- **A second `core/semantic-caching` attachment on the gateway**, which has one
  cache.
- **`core/data-masking` on the same gateway.** The two declare a conflict,
  because a cache keys a request after masking, so two requests differing only
  in what masking replaces would share one stored reply.

## When the store cannot be used

The gateway connects to the store when it first serves a request, not when it
starts. If it cannot use the store — the store wants a password the gateway was
not given, or refuses one it was — every lookup misses and nothing is stored,
while every request is still answered by the model. Only the gateway's own log
says so. That is why the two ends of the password read one parameter: the
store's `password` slot and the `credential` on the `cache_store` edge.

## Where the compiler does not interpret

The compiler pipes the store's Service name and port from the store's Recipe
into the gateway's environment as strings, and the alias and the numbers into
the gateway's configuration. It does not connect to the store, does not know
whether anything answers at `cache-default:6379`, and does not know what an end
user is. Each halt above is declared by the catalog's own entities, as an
assertion in the realization or the gateway's Recipe or as the conflict the two
Features declare, and none of them rests on any understanding of the traffic.

## Adapting it

- **Share one cache per key.** Add `scope: key` to the `answers` attachment,
  where every caller should be served the same replies.
- **Run the store without a password.** Remove the store's `password`
  attachment and the `credential` on the `cache_store` edge together, with the
  `cache_password` parameter in the Aggregate and the Release; the gateway's
  `REDIS_PASSWORD` is then rendered empty, which connects without one. Removing
  only one of the two attachments leaves the cache unable to use the store.
- **Match more or fewer prompts.** Raise `similarity_threshold` to serve only
  closer matches, or lower it to serve more; which value suits depends on the
  embedding model.
