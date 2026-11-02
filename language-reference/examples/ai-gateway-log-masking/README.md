---
example:
  level: start
  products: [core/ai-model/openai, core/gateway/litellm, core/security/presidio-analyzer, core/security/presidio-anonymizer]
  shows: [connections]
---

# An AI gateway that keeps personal data out of its logs

A support assistant has to work with customers' names and email addresses, so
the model it calls must see them. The gateway in front of that model keeps logs
for audit and for debugging, and those logs must not keep them. This workspace
compiles such a gateway to Kubernetes manifests.

What does it is a value of the gateway itself, `values.log_masking` on
`core/gateway/litellm`. It masks the copy of each call the gateway hands to its
logs, and nothing else: the model receives the request exactly as the caller
sent it, and the caller receives the reply exactly as the model wrote it. That
is the difference from the Feature `core/data-masking`, which hides the text from
the model itself. The two are alternatives, and the section on choosing between
them below shows what happens when both are set on one gateway.

This workspace authors **no catalog entity of its own**. The three entity files
here — an Aggregate, a Manifest and a Release — are the whole of what anyone
writes.

## What it builds

| instance | catalog Component | what it is here |
|---|---|---|
| `router` | `core/gateway/litellm` | the AI gateway: one published alias, `assistant`, served from the model wired to its `models` socket |
| `gpt` | `core/ai-model/openai` | the model behind that alias, OpenAI's own API, reached as a reference: nothing runs for it in the cluster |
| `analyzer` | `core/security/presidio-analyzer` | finds the sensitive spans in a text |
| `anonymizer` | `core/security/presidio-anonymizer` | replaces the spans it is handed |

Three `uses` edges: the gateway's `models` socket to the model, carrying as its
`credential` the key the gateway presents to it, and its `pii_analyzer` and
`pii_anonymizer` sockets to the two recognizer services. The Aggregate attaches
that credential without naming a secret, and the Release names it in the
attachment's `infra`: a Secret the namespace already holds, which the Manifest's
realization references and does not render. The gateway's `values.log_masking`
lists what to mask: a regular expression for the company's ticket numbers under
`patterns`, and the entity types `PERSON` and `EMAIL_ADDRESS` under `entities`.
There is no default list; a gateway listing neither masks nothing in its logs,
and renders exactly as it does without the value.

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
`.aggrega-config.yaml` names. The gateway's own Recipe writes the log masking, so the
build runs no plugin beyond those the compiler carries.

The build prints, with `<workspace>` standing for this example's folder:

```text
[… omitted: the resolution's summary, a notice that core/referenced-secret declares origin in both of its pillars, and a total build time, which differs per run]
Build completed: 9 files written to <workspace>/dist
```

## The rendered tree

```
dist/helm/
├── analyzer-default-service.yaml
├── analyzer-deployment.yaml
├── anonymizer-default-service.yaml
├── anonymizer-deployment.yaml
├── gpt-service.yaml
├── router-default-service.yaml
├── router-deployment.yaml
└── router/
    ├── litellm-gateway-config/
    │   └── configmap.yaml
    └── request-guard/
        └── request-guard.yaml
```

The value brings no file of its own. The gateway's Recipe writes it into the
gateway's configuration, and adds a module that configuration loads to the
gateway's ConfigMap. The model renders one file, `gpt-service.yaml`, a Service
mapping an in-cluster name onto OpenAI's API host, `api.openai.com`; its key
renders none, because the Secret holding it already exists.

The routing table, the start of the gateway's configuration body, has one
entry, written from what the model publishes — its endpoint, OpenAI's API base
URL, and its model name — and naming the variable the gateway's Recipe delivers
the connection's key under:

```yaml
model_list:
  - model_name: "assistant"
    litellm_params:
      model: "openai/gpt-4o"
      api_base: "https://api.openai.com/v1"
      api_key: os.environ/LITELLM_MODEL_ASSISTANT_API_KEY
```

## The guardrail entry

Here is the gateway's configuration body, the `config.yaml` key of
`dist/helm/router/litellm-gateway-config/configmap.yaml`, from its
`litellm_settings` section on:

```yaml
[… omitted: the routing table]
litellm_settings:
  callbacks:
    - /etc/litellm-request-guard/request_field_filter.filter
    - log_masking.withhold_failed_calls
  redact_messages_in_exceptions: true
guardrails:
  - guardrail_name: "router.log-masking"
    litellm_params:
      guardrail: log_masking.LogMasking
      default_on: true
      mode: logging_only
      patterns:
        - pattern_type: regex
          name: "ticket"
          pattern: "\\bTCK-[0-9]{6}\\b"
          action: MASK
      pii_entities_config:
        "PERSON": MASK
        "EMAIL_ADDRESS": MASK
general_settings:
  disable_error_logs: true
```

The gateway's Recipe writes all of it from `values.log_masking`, and names the
entry after the gateway, `router` here, with a dot where the guardrail entries
the standard library's realizations write carry a hyphen, so no attachment of
theirs, whatever its name, can take this entry's place. Five things are worth
reading off it.

**`mode: logging_only` is the gateway's own mode for a guardrail that runs
where a finished call is handed to its logs, and nowhere else.** The class the
entry loads keeps to it whatever an entry names, so it is never called on a
request before the request is forwarded, or on a reply before the reply is
returned.

**`default_on: true` runs it on every call.** A caller cannot switch it off
from the request, a request asking to disable the gateway's always-on
guardrails included.

**The pattern reaches the gateway exactly as authored.** It is matched inside
the gateway, ignoring letter case, and every match is replaced for good by the
pattern's name in capitals in brackets: `[TICKET_REDACTED]`. The gateway
compiles the expression when it starts, and one that does not compile stops it
starting — the compiler hands the string through without reading it.

**The entity types are found by the two recognizer services.** The entry names
no address: the gateway reads both from its environment, which the gateway's
Recipe fills from the two edges. From `dist/helm/router-deployment.yaml`, the
`env` of the gateway's container:

```yaml
env:
  - name: LITELLM_MODEL_ASSISTANT_API_KEY
    valueFrom:
      secretKeyRef:
        name: openai-api-key
        key: api-key
  - name: PRESIDIO_ANALYZER_API_BASE
    value: http://analyzer-default:3000
  - name: PRESIDIO_ANONYMIZER_API_BASE
    value: http://anonymizer-default:3000
```

The first is the model's key, referenced from the Secret the Release names and
never written out; the other two are the recognizers' addresses. A person's
name becomes `<PERSON>` and an address `<EMAIL_ADDRESS>`.

**A failed call is withheld rather than masked.** The gateway runs no logging
guardrail for a call that fails, so the module the entry loads also provides
`log_masking.withhold_failed_calls`, registered right after the request guard,
and the gateway's Recipe writes the two settings beside it. The callback
is handed a failed call's record before any callback registered after it, and
replaces every text a caller or the model wrote with `[TEXT_WITHHELD]`, matched
or not, and the error's text with `[ERROR_TEXT_WITHHELD]`, leaving what a retried
attempt sends as it was. `disable_error_logs` keeps failed calls out of the spend
logs, and `redact_messages_in_exceptions` keeps the request's messages out of the
details the gateway attaches to an error.

The same ConfigMap carries a second key, `log_masking.py`: the module the entry's
`guardrail` and the second `callbacks` entry name. The gateway's Recipe adds the
module, that `callbacks` entry, the guardrail entry and the two settings only
while `values.log_masking` lists something, so a gateway listing nothing renders
the ConfigMap without any of them, byte for byte as a gateway without the value.

## What a log reader sees, and what the model sees

Take a caller whose request carries this text:

```text
My name is David Johnson and my email is david.johnson@example.com, ticket TCK-104882. Call me on 212-555-0147.
```

The block above and the three below illustrate what the running gateway does
with it; they are not output of the build.

The model provider receives the request exactly as the caller sent it, and the
caller receives the model's reply exactly as it came. A logging integration the
gateway hands the call to receives the same messages masked:

```text
My name is <PERSON> and my email is <EMAIL_ADDRESS>, ticket [TICKET_REDACTED]. Call me on 212-555-0147.
```

**The phone number is logged as sent**, because the attachment does not list
`PHONE_NUMBER` and no pattern matches it. Text nothing listed matches is never
masked.

Every copy of a successful call the gateway hands to its logs is masked the same
way: the messages, the standard logging payload's messages and reply, a streamed
reply as the gateway assembles it, the request and reply as the provider saw
them, the request the spend logs keep, and the reply each integration receives.
The model's reply is masked in those copies too:

```text
Reply for <PERSON> (<EMAIL_ADDRESS>) about [TICKET_REDACTED].
```

## What stays unmasked

Masking the logs keeps the text from nobody else, and the description of
`values.log_masking` says so:

- **The model provider receives everything unmasked**, and so do the gateway
  and both recognizer services.
- **A failed call keeps no request text in any log the gateway writes, and that
  costs two things.** The gateway's own line for a failed call keeps only the
  kind of error, such as `An error was logged with its text withheld, as log
  masking is on: BadRequestError`, so the provider's message and its
  traceback leave that log; and failed calls leave the spend logs and the daily
  spend totals, which count successful calls only. A logging integration
  configured outside the catalog can still read a provider's own error message
  on the exception a failed call carries, and one registered ahead of the
  gateway's own callback is handed a failed call's text as it came.
- **Only the logs the masking writes through are covered:** not the
  gateway's debug output, and not a provider's own logs. A request's metadata,
  its tool definitions and its headers are logged as sent.
- **A call whose copies cannot be masked is logged with its text withheld.**
  When a recognizer cannot be reached, no copy is logged masked in part: every
  text in every copy of that call is replaced by `[TEXT_WITHHELD]`, and the record
  is handed to the logs as usual, so the call is still counted in the spend logs.
  The gateway's own log records that the call's text was withheld. The call itself
  is answered as usual.

As the catalog renders this gateway, it hands its logs to no logging integration,
and its spend logs keep no request or reply text and no failed call. So the
copies the masking protects are the ones an integration or a text-keeping spend
log configured on the gateway would receive.

## Log masking or data masking

`core/data-masking` hides the listed text from the model, and on this gateway
its realization turns the gateway's logging of message contents off while it is
attached. Beside it, log masking would have nothing left to act on, and a reader
could take the two for one protection. So the gateway refuses the two together:
while `values.log_masking` lists something, a `core/data-masking` attachment on
the gateway halts the build, by an assertion of the gateway's own Component.
Adding one named `masked` to the gateway, with its realization bound in the
Manifest, prints:

```text
[… omitted: what resolving the lockfile prints, the same halt among it, and a notice that core/referenced-secret declares origin in both of its pillars]
[DEVELOPER_ERROR E0033]
  Component/Feature assertions
  caused by: Component "core/gateway/litellm" instance "router" assertion "log_masking_not_beside_data_masking": [… omitted: the template position and the assertion's own source]: error calling fail: assertion failed: "router" lists what to mask in its logs under values.log_masking, and the core/data-masking attachment "masked" is on it too: that attachment's realization turns the gateway's logging of message contents off, so log masking would have nothing left to act on, and a reader could take the two for one protection. Remove values.log_masking to mask what travels, or the "masked" attachment to mask only what is logged
```

Reach for log masking where the model must see the data and the logs must not
keep it; reach for data masking where the model must not see it either. Both
read the same `patterns` and `entities`, so a list means the same thing on
either.

## Where the compiler does not interpret

The compiler routes the pattern and the entity types into the gateway's
configuration as strings. It does not compile the expression, does not know what
a ticket number or a person is, and does not see the traffic the gateway will
carry. Each halt this workspace can meet — entity types with a recognizer socket
unwired, an entity type the analyzer does not recognize in English, log masking
beside data masking on one gateway, the connection to the managed model carrying
no credential — is declared by the catalog's own entities, as an assertion of
the gateway's Component or of its Recipe, and none of them rests on any
understanding of the text.

## Adapting it

- **Mask patterns only.** Drop `entities` from `values.log_masking`, and the two
  recognizer components with their edges and their entries in the Release; the
  patterns are matched inside the gateway and need neither service.
- **Mask more entity types.** Add them to `entities`, in the recognizer's own
  vocabulary; a type the analyzer does not recognize in English halts the build
  and names the ones it does.
- **Hide the text from the model as well.** Replace `values.log_masking` with a
  `core/data-masking` attachment on the gateway listing the same `patterns` and
  `entities`, and bind its realization in the Manifest.
- **Serve a second model.** Wire another model component to the `models`
  socket under an alias of its own, with the key the gateway presents to it on
  that connection; `values.model` keeps naming the alias the gateway publishes.
  The masking applies to the calls of every alias the gateway serves.
