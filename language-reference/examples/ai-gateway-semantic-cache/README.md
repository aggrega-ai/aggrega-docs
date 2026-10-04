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
| `router` | `core/gateway/litellm` | the AI gateway: a chat alias, `assistant`, and an embedding alias, `embedder`, each pointing at one upstream model |
| `cache` | `core/datastore/redis` | the store the gateway keeps its replies in |

One `uses` edge, into the gateway's `cache_store` socket, and three Feature
attachments on the gateway: `master_key` and `provider_key`, two credentials,
and `answers`, the cache. The attachment names the embedding alias that turns
each prompt into a vector, how alike two prompts must be — `0.9`, as a cosine
similarity — and how long a stored reply lasts, an hour. It leaves `scope` out,
so it takes the default, `end_user`.

## Building

```bash
./build-release.sh
```

A release needs a lockfile before it builds, and lockfiles are generated rather
than shipped, so a fresh clone has none. Resolve one first, or let the build
fill it:

```bash
aggrega pull --release release.yaml      # resolve once, then build with no flag
./build-release.sh -- --auto-pull        # or resolve during the build
```

This workspace resolves the catalog entities through the `catalog_dirs` in
`.aggrega-config.yaml`. The cache's realization runs one plugin, the gateway
configuration step `pipeline-step/litellm-gateway-config`, which the resolution
fetches from the registry `default_registry` names.

The build prints:

```text
[… omitted: the resolution's summary and a total build time, which differ per run]
Build completed: 8 files written to dist/
```

## The rendered tree

```
dist/helm/
├── cache-default-service.yaml
├── cache-deployment.yaml
├── router--master-zukey--router-secret-router-master-key.yaml
├── router--provider-zukey--router-secret-router-provider-key.yaml
├── router-default-service.yaml
├── router-deployment.yaml
└── router/
    ├── litellm-gateway-config.configmap.yaml
    └── request-guard/
        └── request-guard.yaml
```

The cache attachment brings no file of its own. What it does is written into the
gateway's configuration.

## The cache, as the gateway reads it

Here is the gateway's configuration body, the `config.yaml` key of
`dist/helm/router/litellm-gateway-config.configmap.yaml`, from its
`litellm_settings` on:

```yaml
[… omitted: the routing table and the routing strategy]
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
            - name: SEMANTIC_CACHE_STORE_HOST
              value: cache-default
            - name: SEMANTIC_CACHE_STORE_PORT
              value: "6379"
            - name: REDIS_PASSWORD
            - name: LITELLM_MASTER_KEY
              valueFrom:
                secretKeyRef:
                  name: router-master-key
                  key: master-key
            - name: LITELLM_PROVIDER_API_KEY
              valueFrom:
                secretKeyRef:
                  name: router-provider-key
                  key: provider-key
```

`cache-default` is the Service the store's own Recipe emits, read off what that
Recipe publishes, and `6379` the port it publishes. The cache reads the store's
password from `REDIS_PASSWORD`; nothing is attached to the store's password
slot here, so the store runs without one and the variable is empty. Remove the
`cache_store` edge and none of the three variables is rendered.

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

**This gateway's key is its administrative key, and every caller holds it.**
It has no bookkeeping database attached, so it issues no keys of its own: every
caller presents `master_key`, and a request with no key, or with a key the
gateway did not issue, is refused before anything is looked up. So the key
separates no caller from another here, and under the default scope what keeps
two callers apart is the end user each request names.

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

- **No administrative key.** Remove the `master_key` attachment and the build
  halts before anything renders:

  ```text
  [CATALOG_ERROR E0033]
    Recipe/FeatureRecipe assertions
    caused by: FeatureRecipe "semantic-caching-litellm" instance "router" assertion "gateway_checks_the_caller": [… omitted: the template position and the assertion's own source]: error calling fail: assertion failed: core/semantic-caching attachment "answers" on "router" needs core/gateway/litellm to check every caller's key before a cached reply is served, but its master_key credential slot is not attached, so the gateway checks no caller and a cache bucket would be made only of what each caller claims. Attach a credential to the master_key slot of "router"
  ```

- **No store.** Remove the `cache_store` edge and the build halts naming the
  socket to wire.
- **A store that is not `core/datastore/redis`.** The socket admits the
  key-value stores, and the gateway's Recipe halts on any other than Redis: the
  cache searches its replies with the Redis query engine's vector search and
  JSON commands, which the Redis image the catalog pins loads, and a store
  without them would cache nothing while every request still succeeded.
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
says so. A store needing a password takes a credential on its own `password`
slot, and the gateway takes one holding the same password on its
`cache_store_password` slot, which renders `REDIS_PASSWORD` as a reference to
the Secret holding it rather than empty.

## Where the compiler is blind

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
- **Give the store a password.** Attach a credential to the store's `password`
  slot and one holding the same password to the gateway's
  `cache_store_password` slot.
- **Match more or fewer prompts.** Raise `similarity_threshold` to serve only
  closer matches, or lower it to serve more; which value suits depends on the
  embedding model.
