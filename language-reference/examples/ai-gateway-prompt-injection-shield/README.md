---
example:
  level: start
  products: [core/gateway/litellm, core/security/nemo-guardrails, core/security/trustyai-huggingface-detector]
  shows: [connections, features]
---

# An AI gateway that screens each request for an attempt to override the model

A support assistant's users can type anything, and some of what they type tries
to make the model ignore the instructions it was given. The gateway in front of
the model can send every request through a guard first: a service that asks a
trained classifier whether the request is such an attempt, refuses it if so, and
forwards the rest to the model. This workspace compiles that arrangement to
Kubernetes manifests: the gateway, the guard, and the detector the guard's
classifier runs in.

The Feature that asks for it is `core/prompt-injection-shield`. What it does is
narrower than its name may suggest, and this page spends as much time on what it
does not do as on what it does: the verdict is a probabilistic classifier's, it
misses some attacks and refuses some legitimate requests, it is known to be
evadable, and it judges neither the model's reply, nor tool-call arguments, nor
images. It is one control beside others.

This workspace authors **no catalog entity of its own**. The three entity files
here — an Aggregate, a Manifest and a Release — are the whole of what anyone
writes.

## What it builds

| instance | catalog Component | what it is here |
|---|---|---|
| `router` | `core/gateway/litellm` | the AI gateway: one alias, `assistant`, typed into its model map and pointing at a model behind the guard |
| `guard` | `core/security/nemo-guardrails` | NVIDIA NeMo Guardrails' server in the model's path, which checks each chat request and forwards what it admits to the model |
| `detector` | `core/security/trustyai-huggingface-detector` | the classifier service the guard asks, running its default prompt-injection classifier |

Two `uses` edges: the gateway's `guard` socket to the guard, and the guard's
`detector` socket to the detector. Two Feature attachments: `shield`, the
shield, on the gateway, at `sensitivity: standard`; and `upstream_key`, the
credential the guard presents to the model API, on the guard.

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
`.aggrega-config.yaml` names. The shield's realization runs one plugin that ships in
neither the compiler nor the catalog, the gateway configuration step
`pipeline-step/litellm-gateway-config`, which the resolution fetches from the
registry `default_registry` names, `hub.aggrega.ai`.

The build prints, with `<workspace>` standing for this example's folder:

```text
[… omitted: a line reporting on the gateway configuration step's plugin, a warning that the upstream_key credential's declared-sensitive origin reaches the target with no per-key sensitivity marking, because the realization maps it through a valuesMapping, the resolution's summary, a notice that core/referenced-secret declares origin in both of its pillars, and a total build time, which differs per run]
Build completed: 10 files written to <workspace>/dist
```

**The Release names the guard's and the detector's images, because the catalog
names neither.** Each Component's `infra.image` is a required setting with no
default; the comment beside it in the Component says why, and names the build
its behaviour was proved on. The two values in `release.yaml` are placeholders
for a copy of the build you run, mirrored into a registry you control. The build
pipes whatever string is there; replace both before deploying.

## The rendered tree

```
dist/helm/
├── detector-default-service.yaml
├── detector-deployment.yaml
├── guard--upstream-zukey--guard-secret-guard-upstream-key.yaml
├── guard-default-service.yaml
├── guard-deployment.yaml
├── guard/
│   └── nemo-guardrails-config.configmap.yaml
├── router-default-service.yaml
├── router-deployment.yaml
└── router/
    ├── litellm-gateway-config/
    │   └── configmap.yaml
    └── request-guard/
        └── request-guard.yaml
```

The shield brings no file of its own. What it does is written into the
gateway's configuration.

## The route, as the gateway reads it

The gateway's configuration body, the `config.yaml` key of
`dist/helm/router/litellm-gateway-config/configmap.yaml`:

```yaml
model_list:
  - model_name: assistant
    litellm_params:
      model: openai/gpt-4o-mini
      api_base: "http://guard-default:8000/v1"
      api_key: "the-guard-holds-the-upstream-credential"
litellm_settings:
  callbacks:
    - /etc/litellm-request-guard/request_field_filter.filter
callback_settings:
  request_field_filter.router-shield:
    policies:
      -
        reason: "sends every model request through a prompt-injection guard, which checks chat completions only"
        served_request_types:
          - acompletion
```

Three things are worth reading off it.

**Every alias is addressed to the guard.** `api_base` is the endpoint the guard
publishes, read off the `guard` edge, so a request for `assistant` goes to the
guard over the OpenAI API, asking for `gpt-4o-mini`; the guard forwards what it
admits to the model API `release.yaml` names in its `upstream_endpoint`. Remove
the shield and the entry is written without `api_base`, exactly as before. That
is why the alias is typed into the gateway's `values.models` rather than served
from a model wired to its `models` socket: a wired model's entry is written with
that model's own endpoint and its connection's own key, so its requests would
go to the model past the guard, and the shield refuses such a connection, as
below.

**The gateway holds no credential for the model.** The entry names a fixed word
in place of a key, because the gateway reaches the guard rather than the
provider, and the guard presents its own credential, the one attached to its
`upstream_key` slot. A caller's own `Authorization` header never reaches the
model.

**Only chat completions are served.** The guard checks chat completions and
serves no completions, embeddings, responses or messages route, so the policy
has the gateway's request guard refuse every other kind of request with HTTP
400, saying why, before anything is forwarded:

```text
This gateway sends every model request through a prompt-injection guard, which checks chat completions only, and it does not serve embeddings requests while it does, so the request was not forwarded. It serves chat completions requests.
```

## What the guard does

The guard's configuration, the `config.yaml` key of
`dist/helm/guard/nemo-guardrails-config.configmap.yaml`, from its rails on:

```yaml
rails:
  config:
    hf_classifier:
      prompt_injection:
        engine: fms
        model: "protectai/deberta-v3-base-prompt-injection-v2"
        base_url: "http://detector-default:8000"
        threshold: 0.5
        blocked_labels: ["INJECTION"]
  input:
    flows:
      - hf classifier check input $classifier=prompt_injection
```

For each chat request, plain or streamed, the guard sends the latest user
message to the detector, which scores it with the classifier it loaded, and
refuses the request when the detector reports `INJECTION` at or above `0.5`. A
refused request is answered by the guard itself, with an ordinary completion
whose message is *I'm sorry, I can't respond to that.* — streamed when the
request asked for a stream — and nothing of it reaches the model. A
request it admits reaches the model as the caller sent it, its system message and
earlier turns included.

A caller cannot switch the check off from the request. The guard's
configuration carries a flow, `rails.co`, that runs the check whatever a request
body asks, and the guard runs this one configuration and refuses a request
naming another. On this gateway, a `guardrails` field is the gateway's own and is
not forwarded, and a field the gateway was not configured to forward, such as
`extra_body`, is refused.

## What it does not do

- **It misses some attacks and refuses some legitimate requests.** The verdict
  is a classifier's score against a threshold. An attempt reworded, written in
  another language, encoded or respelled can score low and be served; an
  ordinary request can score high and be refused.
- **It reads the latest user message only.** An attempt placed in a system
  message, an earlier turn or a tool result reaches the model unread.
- **It does not judge the model's reply**, tool-call arguments or images.
- **It covers only traffic that crosses the gateway.** A workload calling the
  model's address directly goes around it. The guard and the detector
  authenticate no caller, so their Services are addresses for the components
  that call them, not ones to publish.

## Sensitivity

`standard` and `strict` are run as the guard's threshold: `0.5` and `0.001`.
Those two numbers are measured for the detector's default classifier, whose
scores sit close to 0 or close to 1. At `0.5` the guard refuses plain attempts
to override the model's instructions. At `0.001` it also refuses such an attempt
respelled in leetspeak, which the classifier scores near `0.008`, and with it
some ordinary requests the classifier scores low but not near zero.

The threshold is the guard's own value, so moving to `strict` is two edits made
together: `sensitivity: strict` on the attachment, and `threshold: 0.001` in the
guard's `values`. The realization checks that the two agree. It sees the guard
and not the detector behind it, so it cannot tell which model the detector
loaded; a detector running another model scores differently, and its thresholds
are measured again.

## What halts the build

Each of these is a sentence the build prints, naming what to change:

- **The sensitivity and the guard's threshold disagree.** Set `sensitivity:
  strict` and leave the guard at its default:

  ```text
  [… omitted: a line reporting on the gateway configuration step's plugin, what resolving the lockfile prints, the same halt among it, and a notice that core/referenced-secret declares origin in both of its pillars]
  [CATALOG_ERROR E0010] instance router
    node "router": pipeline step failed
    [… omitted: the step, the template position and the template's own source]
  error calling fail: core/prompt-injection-shield attachment "shield" on "router" asks for sensitivity strict, which this realization runs as the guard's threshold 0.001, but the guard "guard" runs at 0.5; set values.threshold of "guard" to 0.001
  ```

- **No guard wired.** Remove the gateway's `uses` block, which holds only the
  `guard` edge, and the build halts before anything renders, naming the socket:

  ```text
  [… omitted: a line reporting on the gateway configuration step's plugin, what resolving the lockfile prints, the same halt among it, and a notice that core/referenced-secret declares origin in both of its pillars]
  [CATALOG_ERROR E0033]
    Recipe/FeatureRecipe assertions
    caused by: FeatureRecipe "prompt-injection-shield-litellm" instance "router" assertion "guard_is_wired": [… omitted: the template position and the assertion's own source]: error calling fail: assertion failed: core/prompt-injection-shield attachment "shield" on "router" needs a guard to send the gateway's model requests through, but nothing is wired to its guard socket; wire a core/security/nemo-guardrails to the guard socket of "router"
  ```

- **A model wired to the gateway's `models` socket.** Its entry would be sent to
  that model's own endpoint with its connection's own key, past the guard. Wire
  a `core/ai-model/openai` to the socket as `fast`, with a credential on the
  connection, beside the typed alias — setting `values.model: assistant`, since
  the gateway then serves two aliases and publishes one, and naming `fast` in the
  Release and its Recipe in the Manifest — and the build halts before anything
  renders, naming the connection:

  ```text
  [… omitted: a line reporting on the gateway configuration step's plugin, what resolving the lockfile prints, the same halt among it, and a notice that core/referenced-secret declares origin in both of its pillars]
  [CATALOG_ERROR E0033]
    Recipe/FeatureRecipe assertions
    caused by: FeatureRecipe "prompt-injection-shield-litellm" instance "router" assertion "no_wired_models": [… omitted: the template position and the assertion's own source]: error calling fail: assertion failed: core/prompt-injection-shield attachment "shield" on "router" sends every model request through the guard, which forwards it to its own upstream with its own credential, but the models socket of "router" holds fast, each sent to its own model's endpoint with its own connection's credential, past the guard; remove those connections and reach that model through the guard's upstream, or remove the shield attachment
  ```

- **A credential on the gateway's `provider_key` slot.** It would be presented to
  the guard and to no model; the build names the guard's `upstream_key` slot
  instead.
- **Another guard.** The socket admits any component whose prompt guard is a
  trained classifier's, and the realization halts on any but
  `core/security/nemo-guardrails`, the one its two sensitivities are measured
  on — on a second guard wired to the socket too.
- **A target not written `openai/<model>`**, which the gateway would address to
  the guard over another API.
- **`core/semantic-caching` on the same gateway.** The cache embeds each prompt
  through an alias of the map, which would be sent to the guard, which answers no
  embeddings request; the cache would cache nothing.
- **A second shield on the gateway.**

## When the guard or the detector cannot be reached

The request is refused, and nothing reaches the model. With the detector down,
the guard answers a plain request with a completion reporting an internal error
and a streamed one with a stream carrying no text. With the guard down, the
gateway answers with an error. Nothing in this configuration sends a request
around the guard when it fails.

## Where the compiler does not interpret

The compiler pipes the guard's Service name and port into the gateway's
configuration, and the threshold and the detector's address into the guard's,
as strings. It does not evaluate a prompt, does not know what the classifier
will score, and does not contact the guard, the detector or the model. Each halt
above is declared by the catalog's own entities, as an assertion in the shield's
realization or a check in its pipeline step, and none of them rests on any
understanding of the traffic.

## Adapting it

- **Stricter.** Set `sensitivity: strict` on the attachment and `threshold:
  0.001` on the guard, together.
- **A model you run yourself.** Point the guard's `upstream_endpoint` at the
  model server's endpoint — `core/ai-model/vllm` publishes one — and write the
  alias's target `openai/<the name that server serves>`.
- **An NGINX gateway instead.** `core/gateway/nginx` declares the same `guard`
  socket, and `prompt-injection-shield-nginx`, on helm and on compose, points its
  one location at the guard in place of its upstream. Set the guard's
  `upstream_endpoint` to the model the gateway's `upstream` socket names. Every
  request on that location goes to the guard, which serves chat completions and
  answers the other model routes 404.
