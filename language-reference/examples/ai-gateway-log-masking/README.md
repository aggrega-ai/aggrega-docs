# An AI gateway that keeps personal data out of its logs

A support assistant has to work with customers' names and email addresses, so
the model it calls must see them. The gateway in front of that model keeps logs
for audit and for debugging, and those logs must not keep them. This workspace
compiles such a gateway to Kubernetes manifests.

The Feature that does it is `core/log-masking`. It masks the copy of each call
the gateway hands to its logs, and nothing else: the model receives the request
exactly as the caller sent it, and the caller receives the reply exactly as the
model wrote it. That is the difference from `core/data-masking`, which hides the
text from the model itself. The two are alternatives, and the section on
choosing between them below shows what happens when both are attached.

This workspace authors **no catalog entity of its own**. The three entity files
here — an Aggregate, a Manifest and a Release — are the whole of what anyone
writes.

## What it builds

| instance | catalog Component | what it is here |
|---|---|---|
| `router` | `core/gateway/litellm` | the AI gateway: one published alias, `assistant`, pointing at one upstream model |
| `analyzer` | `core/security/presidio-analyzer` | finds the sensitive spans in a text |
| `anonymizer` | `core/security/presidio-anonymizer` | replaces the spans it is handed |

Two `uses` edges, into the gateway's `pii_analyzer` and `pii_anonymizer`
sockets, and one Feature attachment, `logs`, on the gateway. The attachment
lists what to mask: a regular expression for the company's ticket numbers, and
the entity types `PERSON` and `EMAIL_ADDRESS`. There is no default list; an
attachment listing neither halts the build.

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
`.aggrega-config.yaml`. The log-masking realization runs one plugin, the
gateway configuration step `pipeline-step/litellm-gateway-config`, which the
resolution fetches from the registry `default_registry` names.

The build prints:

```text
[… omitted: the resolution's summary and a total build time, which differ per run]
Build completed: 8 files written to dist/
```

## The rendered tree

```
dist/helm/
├── analyzer-default-service.yaml
├── analyzer-deployment.yaml
├── anonymizer-default-service.yaml
├── anonymizer-deployment.yaml
├── router-default-service.yaml
├── router-deployment.yaml
└── router/
    ├── litellm-gateway-config.configmap.yaml
    └── request-guard/
        └── request-guard.yaml
```

The attachment brings no file of its own. What it does is written into the
gateway's configuration, and a module that configuration loads is added to the
gateway's ConfigMap.

## The guardrail entry

Here is the gateway's configuration body, the `config.yaml` key of
`dist/helm/router/litellm-gateway-config.configmap.yaml`, from its guardrails
section on:

```yaml
[… omitted: the routing table, the routing strategy and the request guard's registration]
guardrails:
  -
    guardrail_name: router-logs-log-masking
    litellm_params:
      default_on: true
      guardrail: log_masking.LogMasking
      mode: logging_only
      patterns:
        -
          action: MASK
          name: ticket
          pattern: "\\bTCK-[0-9]{6}\\b"
          pattern_type: regex
      pii_entities_config:
        EMAIL_ADDRESS: MASK
        PERSON: MASK
```

Four things are worth reading off it.

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
  - name: PRESIDIO_ANALYZER_API_BASE
    value: http://analyzer-default:3000
  - name: PRESIDIO_ANONYMIZER_API_BASE
    value: http://anonymizer-default:3000
```

A person's name becomes `<PERSON>` and an address `<EMAIL_ADDRESS>`.

The same ConfigMap carries a second key, `log_masking.py`: the module the entry's
`guardrail` names. The gateway's Recipe adds it only while a `core/log-masking`
attachment lists something, so a Release without the attachment renders the
ConfigMap without it.

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

Masking the logs keeps the text from nobody else, and the attachment's
realization says so:

- **The model provider receives everything unmasked**, and so do the gateway
  and both recognizer services.
- **A failed call's record keeps the text.** The gateway runs no logging
  guardrail on a call that fails, so what it logs for one — the messages, the
  request as sent, the error the provider returned — is logged as it came. A
  provider error that quotes the request reaches the gateway's own log that way.
- **Only the logs the realization writes through are covered:** not the
  gateway's debug output, and not a provider's own logs. A request's metadata,
  its tool definitions and its headers are logged as sent.
- **A call whose copies cannot be masked is logged with its text withheld.**
  When a recognizer cannot be reached, no copy is logged masked in part: every
  text in every copy of that call is replaced by `[TEXT_WITHHELD]`, and the record
  is handed to the logs as usual, so the call is still counted in the spend logs.
  The gateway's own log records that the call's text was withheld. The call itself
  is answered as usual.

As the catalog renders this gateway, it hands its logs to no logging integration
and its spend logs keep no request or reply text, so the copies the masking
protects are the ones an integration or a text-keeping spend log configured on
the gateway would receive.

## Log masking or data masking

`core/data-masking` hides the listed text from the model, and turns the
gateway's logging of message contents off while it is attached. Beside it, log
masking would have nothing left to act on, and a reader could take the two for
one protection. So each declares a conflict with the other, and attaching both
to the gateway halts the build. Adding a `core/data-masking` attachment named
`masked` above `logs` prints:

```text
[DEVELOPER_ERROR E0308] aggregate.yaml at .spec.components.router
  a Feature reaches a component alongside a Feature it declares a conflict with ("core/data-masking", attached in the Aggregate on component "router", conflicts with "core/log-masking", attached in the Aggregate on component "router", on component "router"). Attach only one of the two where they meet: remove one attachment, or move it to a scope that does not hold this component.
```

Reach for log masking where the model must see the data and the logs must not
keep it; reach for data masking where the model must not see it either. Both
read the same `patterns` and `entities`, so an attachment's list means the same
thing on either.

## Where the compiler is blind

The compiler routes the pattern and the entity types into the gateway's
configuration as strings. It does not compile the expression, does not know what
a ticket number or a person is, and does not see the traffic the gateway will
carry. Each halt this workspace can meet — an attachment listing nothing,
entity types with a recognizer socket unwired, an entity type the analyzer does
not recognize in English, both masking Features on one component — is declared
by the catalog's own entities, as an assertion in the Feature or its
realization or as the conflict the two Features declare, and none of them rests
on any understanding of the text.

## Adapting it

- **Mask patterns only.** Drop `entities` from the attachment and the two
  recognizer components with their edges; the patterns are matched inside the
  gateway and need neither service.
- **Mask more entity types.** Add them to `entities`, in the recognizer's own
  vocabulary; a type the analyzer does not recognize in English halts the build
  and names the ones it does.
- **Hide the text from the model as well.** Replace the `core/log-masking`
  attachment with a `core/data-masking` one listing the same `patterns` and
  `entities`, and bind its realization in the Manifest.
