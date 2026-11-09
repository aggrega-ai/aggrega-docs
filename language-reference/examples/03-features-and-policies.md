# Features and Policies

## Example 7: Your First Feature — Masking Sensitive Text on the AI Gateway

Features are modular operational behaviors attached to Components. Who attaches one follows from who decides its inputs: the developer attaches, in the Aggregate, a Feature whose behaviour is application intent, and operations attach, in the Release, one whose inputs are all operational. Masking is the developer's: the developer requests *what* they want (sensitive text masked before it reaches a model provider). Ops decides *how* it is realized (the FeatureRecipe the Manifest binds — here one that writes guardrails into the AI gateway's own configuration through a Wasm pipeline step).

<figure class="diagram not-content">
<div class="diagram-canvas">
<div class="diagram-lanes">
<div class="diagram-lane">

Without a Feature

<div class="diagram-flow">
<div class="diagram-flow-part">
<div class="diagram-node diagram-node-file">
<div class="diagram-node-label"><code>core/gateway/litellm</code></div>

the gateway, realized by the Recipe the Manifest binds to it

</div>
</div>
<div class="diagram-arrow" aria-hidden="true"></div>
<div class="diagram-flow-part">
<div class="diagram-node diagram-node-compiler">
<div class="diagram-node-label"><code>aggrega build</code></div>
</div>
</div>
<div class="diagram-arrow" aria-hidden="true"></div>
<div class="diagram-flow-part">
<div class="diagram-node diagram-node-output-file">

the gateway's configuration

as its own Recipe renders it

</div>
</div>
</div>
</div>
<div class="diagram-lane">

With the Feature attached

<div class="diagram-flow">
<div class="diagram-flow-part">
<div class="diagram-group">
<div class="diagram-node diagram-node-file">
<div class="diagram-node-label"><code>core/gateway/litellm</code></div>

the gateway, realized by the Recipe the Manifest binds to it

</div>
<div class="diagram-node diagram-node-file">
<div class="diagram-node-label"><code>core/data-masking</code></div>

the Feature, attached to the gateway in the Aggregate and realized by the FeatureRecipe the Manifest binds to it

</div>
</div>
</div>
<div class="diagram-arrow" aria-hidden="true"></div>
<div class="diagram-flow-part">
<div class="diagram-node diagram-node-compiler">
<div class="diagram-node-label"><code>aggrega build</code></div>
</div>
</div>
<div class="diagram-arrow" aria-hidden="true"></div>
<div class="diagram-flow-part">
<div class="diagram-group">
<div class="diagram-node diagram-node-output-file">

the same configuration, with masking

guardrails and a request policy, written by the FeatureRecipe

</div>
<div class="diagram-node diagram-node-output-file">
<div class="diagram-node-label"><code>data_masking.py</code></div>

a module beside it, added with the attachment

</div>
</div>
</div>
</div>
</div>
</div>
</div>
<figcaption class="diagram-caption">

Attaching `core/data-masking` to the gateway changes only what the build writes for the gateway: the FeatureRecipe writes its masking into the configuration the gateway's own Recipe renders, and a module is added beside it. Every other file the build writes is byte-identical to a build without the attachment.

</figcaption>
</figure>

**1. Platform Catalog: The Feature Interface**
The Feature uses an `appliesTo` label selector to restrict which Components can receive it — here the data-path capability a gateway declares when it can mask the chat and completion payload it routes. The `schema:` block defines the developer-facing configuration surface. Abridged from the standard library's `core/data-masking`, which also carries a description of every value:

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Feature
metadata:
  name: core/data-masking
  version: 1.0.0
spec:
  appliesTo: "dataplane.aggrega.ai/content-masking"
  schema:
    values:
      type: object
      properties:
        action: { type: string, enum: [redact, restore, refuse], default: redact }
        scope: { type: string, enum: [request, response, both], default: request }
        placeholder_shows_name: { type: boolean, default: true }
        patterns:
          type: array
          items:
            type: object
            properties:
              name: { type: string, min: 1 }
              regex: { type: string, min: 1 }
            required: [name, regex]
        entities:
          type: array
          items: { type: string, min: 1 }
      required: [action]
```

The Feature also carries an assertion that halts the build when an attachment lists neither `patterns` nor `entities`: no list is assumed on an author's behalf, so an attachment always names what it masks. `refuse` stops text carrying a match rather than replacing the match: a request carrying one is not forwarded and a reply carrying one is not delivered. The abridged form leaves out the `infra` values the operator sets on the attachment in the Release, each of whose defaults is the protection: `allow_unmasked_text` and `allow_unmasked_reply_parts` (off, so what a realization does not mask in a request is refused and what a masked reply carries unread is withheld), `allow_non_text_content` and `allow_streamed_replies` (off), and `mask_reasoning` (on). The abridged form shows `patterns` and `entities` inline; in the standard library they are declared once, in the `TextMaskingSchemas` schema library, which `core/data-masking` and the AI gateway's own `values.log_masking` both reference, so a pattern or an entity type means the same thing on both. That library entry is the one schema reference the Feature's values compose, so they carry no Feature base: an attachment writing `display_name`, `description`, `severity` or `as` is refused.

**2. Platform Catalog: The Component That Declares the Capability**
Abridged from `core/gateway/litellm`. The label is what the Feature's selector reads; the `models` socket takes the models the gateway serves, and the other two sockets the pair of services it calls to find and replace entity types.

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Component
metadata:
  name: core/gateway/litellm
  version: 1.0.0
  labels:
    component.aggrega.ai/type: server
    gateway.aggrega.ai/intelligence: semantic
    dataplane.aggrega.ai/content-masking: entity-recognition
spec:
  usesSchema:
    models:
      selector: "component.aggrega.ai/category=ai-model"
    pii_analyzer:
      selector: "security.aggrega.ai/text-anonymization=analyzer"
    pii_anonymizer:
      selector: "security.aggrega.ai/text-anonymization=anonymizer"
```

**3. Dev Domain: The Aggregate**
The developer attaches the Feature to the gateway and says what to mask: a pattern for the company's project codes, and two entity types a recognizer finds. The recognizer is two catalog services wired to the gateway's sockets, and the model the gateway serves is a catalog component wired to its `models` socket, the key the gateway presents to it held on that connection. The developer names no address, no guardrail and no provider setting.

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Aggregate
metadata:
  name: masked-router
  version: 1.0.0
spec:
  components:
    router:
      type: core/gateway/litellm
      values:
        model: assistant
      features:
        pii-filter:
          type: core/data-masking
          values:
            action: redact
            scope: request
            patterns:
              - name: project_code
                regex: '\bPRJ-[0-9]{4}\b'
            entities: [PERSON, EMAIL_ADDRESS]
      uses:
        models:
          assistant:
            target: gpt
            features:
              credential:
                type: core/referenced-secret
                values:
                  key: api-key
                  origin: openai-api-key
        pii_analyzer:
          recognizer:
            target: analyzer
        pii_anonymizer:
          replacer:
            target: anonymizer
    gpt:
      type: core/ai-model/openai
      values:
        model: gpt-4o
    analyzer:
      type: core/security/presidio-analyzer
    anonymizer:
      type: core/security/presidio-anonymizer
```

**4. Ops Domain: The FeatureRecipe (Wasm Pipeline)**
The FeatureRecipe maps the abstract Feature to a concrete Wasm plugin pipeline. The pipeline executes sequentially in the plugin pipeline that closes rendering: this one patches the configuration the gateway's own Recipe already renders rather than emitting a file of its own. The plugin pipeline runs during `aggrega build`; see [Status of the Language](../10-status.md#compilation-pipeline-phases).

> **The `pipeline:` field executes during `aggrega build`: the compiler runs each declared step in order against the rendered document set. See [Status of the Language](../10-status.md#compilation-pipeline-phases) for the per-phase readiness.**

Abridged from the standard library's `helm/data-masking-litellm`:

```yaml
apiVersion: aggrega.ai/v1beta1
kind: FeatureRecipe
metadata:
  name: data-masking-litellm
  version: 1.0.0
spec:
  capability: helm
  implements: core/data-masking:1.0.0
  pipeline:
    - id: write_masking_guardrails
      plugin: pipeline-step/litellm-gateway-config:1.0.0
      function: step
      with: |
        section: guardrails
        identifiedBy: guardrail_name
        entries:
          # two entries for the listed patterns, one for the text of the
          # messages and one for tool calls, tool results and the other
          # text a request carries, and while replies are masked one more,
          # first, holding a streamed reply whole; one for the listed entity types in
          # each direction they are masked, and one more on requests for
          # tool calls, tool results and that other text, each rendered
          # from .values
    - id: write_request_policy
      plugin: pipeline-step/litellm-gateway-config:1.0.0
      function: step
      with: |
        section: callback_settings
        settings:
          # one member per attachment, holding the policy the gateway's
          # request guard reads: the request types, fields, parts of a
          # conversation and kinds of tool it forwards while this
          # attachment masks, rendered from .values and .infra
    - id: turn_off_message_logging
      plugin: pipeline-step/litellm-gateway-config:1.0.0
      function: step
      with: |
        section: litellm_settings
        settings:
          turn_off_message_logging: true
```

Its assertions halt the build on what this gateway cannot honour — `restore`, an entity type the analyzer does not recognize, entity types with the recognizer sockets unwired, patterns masking replies while `mask_reasoning` is on — each naming the constraint and the capability the gateway declares. This gateway numbers the stand-ins of `restore` afresh in every text it masks, so two people's names in one request can share one stand-in and restoring could hand the caller one person's name where another's was written; the Feature keeps `restore` for a gateway that can map its stand-ins back reliably, and on this one an attachment uses `redact`, or `refuse`, under which every listed pattern and entity type is configured to refuse rather than mask, wherever this realization would have masked it. Listed entity types and listed patterns are also masked in tool-call arguments, both in the tool calls a request's earlier turns carry and in a reply's, by guardrails loaded from a module the gateway's own Recipe delivers beside its configuration; both are masked in the results of those earlier tool calls too, on the chat, messages and responses routes, and in the other text a request carries beside its messages — a messages request's system prompt, a responses request's instructions, the user field and the metadata the caller sent, among others. The arguments, and a result that is JSON, are masked value by value rather than as one text: they are read as JSON, every string value and every number the analyzer recognizes or a pattern matches is masked, the keys are not, and the JSON is written back, so the JSON stays valid. A masked number becomes the placeholder as a string, so a tool whose schema asks for a number there refuses the call rather than receiving the original; a result that is not JSON is masked as one text. Arguments that are not JSON, other than empty ones, are never masked as one text: a request carrying them in its conversation is refused before it is forwarded, and a reply carrying them is refused before any of it is sent. A streamed chat reply masked by pattern is held until all of it has arrived and then sent whole and masked, at the end rather than as it is produced, so no part of a match is sent before the rest of it arrives; a reply streamed on any other route is not masked, so while replies are masked a request asking for one there is refused before it is forwarded. Entity types masked in a reply are masked by a guardrail loaded from that module: a request asking for a streamed chat reply is then refused before it is forwarded as well, unless the Release sets `allow_streamed_replies` on the attachment, in which case the masked reply arrives in one piece at the end rather than as it is produced. The same guardrail masks the reasoning text a reasoning model returns beside its reply, in the fields the FeatureRecipe's comments beside its `write_masking_guardrails` step list, unless the Release sets `mask_reasoning` to `false` on the attachment: a provider that signs its reasoning refuses a signed block that a client sends back changed, so a client that must send those blocks back turns it off, and the reasoning text then reaches it unmasked. Listed patterns are never matched against a reply's reasoning text, so an attachment listing patterns with `scope` `response` or `both` builds only with `mask_reasoning` set to `false` on it, and that attachment then masks none of a reply's reasoning text; to have reasoning text masked, list the entity types in an attachment of their own. While replies are masked, by entity type or by pattern, the gateway also masks the parts a model or its provider adds to a reply beside its text — a refusal, citations and annotations, a web search's query and results, fields under names of the provider's own — withholds from the caller what masking cannot read — spoken audio and its transcript, an image, the probabilities of the tokens the model chose — and passes on a failed call with a fixed message in place of the one the provider returned, which can quote text from the request or from the reply, unless the Release sets `allow_unmasked_reply_parts` on the attachment, in which case those reach the caller as the provider sent them, unmasked.

The attachment also has the gateway refuse what its masking does not reach. The FeatureRecipe writes a policy into the gateway's configuration, and the request guard the gateway's Recipe delivers on every Release reads it: while the attachment is present, the guard forwards only the kinds of request, the request fields, the parts of a conversation and the kinds of tool that the masking reaches, that carry no caller's text, or that are the developer's own definitions, which pass as sent — tools, a response format, stop sequences. It refuses every other request with HTTP 400 naming what to change, and forwards nothing of it: an image generation request, a field such as `safety_identifier`, a tool the provider runs itself and, while requests are masked, an image or a file in the conversation, which masking cannot see into, unless the Release sets `allow_non_text_content` on the attachment, in which case they are forwarded as the caller sent them, unmasked. With `allow_unmasked_text` set on the attachment in the Release, the guard stops refusing the request text the masking does not reach and forwards it unmasked, as the FeatureRecipe's comments list it. While replies are masked it also refuses the options that ask for output the reply masking does not read, such as `logprobs`, a spoken reply or an image, unless the Release sets `allow_unmasked_reply_parts` on the attachment.

**5. Routing Domain: Manifest & Release**

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Manifest
metadata:
  name: masked-router-manifest
  version: 1.0.0
spec:
  mappings:
    components:
      type:
        core/gateway/litellm:1.0.0: helm/litellm-gateway:1.0.0
        core/ai-model/openai:1.0.0: helm/openai:1.0.0
        core/security/presidio-analyzer:1.0.0: helm/presidio-analyzer:1.0.0
        core/security/presidio-anonymizer:1.0.0: helm/presidio-anonymizer:1.0.0
    features:
      type:
        core/data-masking:1.0.0: helm/data-masking-litellm:1.0.0
        # origin names a Secret the namespace already holds.
        core/referenced-secret:1.0.0: helm/k8s-existing-secret:1.0.0
---
apiVersion: aggrega.ai/v1beta1
kind: Release
metadata:
  name: masked-router-release
  version: 1.0.0
  environment: production
spec:
  aggregate: masked-router
  manifest: masked-router-manifest
  boundaries:
    prod-cluster:
      directory: "deploy/prod"
      components:
        # The Feature's values come from the Aggregate — the Release MUST NOT
        # provide them — and this attachment sets no infra: the recognizers it
        # depends on are wired to the gateway's sockets, not configured on the
        # attachment; allow_streamed_replies, allow_unmasked_reply_parts and
        # mask_reasoning matter only while replies are masked, which this
        # attachment's scope: request does not do; allow_non_text_content,
        # left off, has the gateway refuse an image, a file or audio in a
        # request rather than forward it unmasked; and allow_unmasked_text,
        # left off, has it refuse the request text its masking does not reach.
        router:
          infra: { port: 4000 }
        gpt: {}
        analyzer:
          infra: { port: 3000 }
        anonymizer:
          infra: { port: 3000 }
```

**6. What the Build Writes**
The gateway's rendered configuration ends with the lines below, two of its lists shortened where marked. The `litellm_settings` block and its `callbacks` entry are in every build of this gateway: the entry registers the request guard the gateway's Recipe delivers on every Release, which refuses a request field the gateway was not configured to forward (the gateway Component's description says which). The attachment adds `turn_off_message_logging: true` to that block and everything from `guardrails:` on, and a further file beside the configuration, `data_masking.py`, the module the second and third entries' guardrails are loaded from; every other rendered file is byte-identical to a build without the attachment. The second and third entries mask, value by value, the conversation's tool calls and tool results and the other text the request carries beside its messages; the third comes before the gateway's built-in entity guardrail, which masks the text of the messages. That guardrail and the content filter in the first entry are kept off the tool turns, whose results the second and third entries mask. No address appears in the entries: the gateway reads the analyzer's and anonymizer's addresses from the environment its Recipe fills from the two sockets. The `callback_settings` block is the attachment's policy, under a member of its own, so a second attachment's policy sits beside it: the request guard forwards the kinds of request, the fields, the parts of a conversation and the kinds of tool it lists, named as the gateway names them — `acompletion` is a chat completion, `atext_completion` a completion, `aembedding` an embedding, `aresponses` a responses request and `anthropic_messages` a messages request, and `function` and `client` are tools of the caller's own, on the chat and responses routes and on the messages route — refuses every other request, and gives the policy's `reason` in its refusal, as in `This gateway masks sensitive text in the requests it forwards, and it does not forward a request carrying safety_identifier while it does, so the request was not forwarded. Remove: safety_identifier.`

```yaml
    litellm_settings:
      callbacks:
        - /etc/litellm-request-guard/request_field_filter.filter
      turn_off_message_logging: true
    guardrails:
      -
        guardrail_name: router-pii-filter
        litellm_params:
          default_on: true
          guardrail: litellm_content_filter
          mode: pre_call
          patterns:
            -
              action: MASK
              name: project_code
              pattern: "\\bPRJ-[0-9]{4}\\b"
              pattern_type: regex
          skip_tool_message_in_guardrail: true
      -
        guardrail_name: router-pii-filter-field-patterns
        litellm_params:
          default_on: true
          guardrail: data_masking.FieldPatternMasking
          mode: pre_call
          patterns:
            -
              action: MASK
              name: project_code
              pattern: "\\bPRJ-[0-9]{4}\\b"
              pattern_type: regex
      -
        guardrail_name: router-pii-filter-field-entities
        litellm_params:
          default_on: true
          guardrail: data_masking.FieldEntityMasking
          mode: pre_call
          pii_entities_config:
            EMAIL_ADDRESS: MASK
            PERSON: MASK
      -
        guardrail_name: router-pii-filter-entities
        litellm_params:
          default_on: true
          guardrail: presidio
          mode: pre_call
          pii_entities_config:
            EMAIL_ADDRESS: MASK
            PERSON: MASK
          presidio_filter_scope: input
          skip_tool_message_in_guardrail: true
    callback_settings:
      request_field_filter.router-pii-filter:
        policies:
          -
            reason: masks sensitive text in the requests it forwards
            served_fields:
              - audio
              - best_of
              - cache_control
              [… omitted: the other request fields it forwards, in alphabetical order]
            served_parts:
              - document.text
              - item.function_call
              - item.function_call_output
              [… omitted: the other parts of a conversation it forwards]
            served_request_types:
              - acompletion
              - aembedding
              - anthropic_messages
              - aresponses
              - atext_completion
            served_tools:
              - client
              - function
```

At runtime the gateway replaces `PRJ-1234` in a request's messages with `[PROJECT_CODE_REDACTED]`, a person's name with `<PERSON>` and an email address with `<EMAIL_ADDRESS>` before the request reaches the model provider, whatever the caller asks; the project code, the name and the address are replaced as well in the arguments of the tool calls the conversation carries and in the results of those calls, value by value, and in the other text the request carries beside its messages, such as a messages request's system prompt, a responses request's instructions, the user field and the metadata the caller sent. A request carrying something the policy does not list — an image in the conversation, a `safety_identifier`, a web search tool — or sent to a route such as image generation is refused with HTTP 400 before anything of it is forwarded. When the analyzer or the anonymizer cannot be reached, or the analyzer errs, it refuses the request rather than forwarding it. While the attachment is present the gateway also turns off its logging of message contents, so a logging integration would receive a request's messages and a reply's message text redacted — and the rest of each call as it came, including the request as the caller sent it, the provider's reply, the tool definitions and a failed call's error message. The gateway's Recipe configures no logging integration, and the gateway's own log records a provider's error message.

**7. What It Does Not Do**
Masking is not prevention. Under `redact`, as here, the gateway refuses no request for the sensitive text it finds in it — what it refuses is what its masking does not reach; text no pattern matches and the recognizer does not detect passes unchanged; the names of the keys in tool-call arguments, tool results and the caller's metadata are not masked; the developer's own definitions — tools, a response format, stop sequences — and the reasoning of an earlier turn that a client sends back pass as sent; the gateway and the two recognizer services see the original text, and what the gateway records about a call — in its own log, or in what it hands a logging integration — can still hold it; and traffic that does not pass through the gateway is not touched. The FeatureRecipe's comments beside its `write_request_policy` step list what this gateway refuses and what it passes on as sent.

---

## Example 8: Duck-Typing Labels, Semantic Selectors & Interoperability

Labels are the semantic identity layer. They drive policy, Feature binding, and `usesSchema` selectors — all without code changes.

**1. Platform Catalog: Richly Labeled Components**

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Component
metadata:
  name: core/langgraph-agent
  version: 1.0.0
  labels:
    component.aggrega.ai/type: "worker"
    agent.aggrega.ai/autonomy: "semi"       # Semantic Duck-Typing label
    agent.aggrega.ai/framework: "langgraph"
  annotations:
    catalog.aggrega.ai/compliance-tier: "high"  # Immutable catalog trait
spec:
  usesSchema:
    datastores:
      selector: "component.aggrega.ai/type=stateful-server"
      inject: ["env"]
  schema:
    values:
      system_prompt: { type: string, required: true }
```

**2. Platform Catalog: Features Using Advanced Selectors**
This Feature targets components with the autonomy label present, regardless of its value. It declares `conflictsWith`, so a build in which any component ends up carrying both it and `core/full-auto-mode` — attached on the component itself or on a subsystem or boundary that holds it — halts before rendering.

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Feature
metadata:
  name: core/autonomy-guardrail
  version: 1.0.0
spec:
  appliesTo: "agent.aggrega.ai/autonomy"      # Bare key: matches any component with this label
  interoperability:
    conflictsWith: ["core/full-auto-mode"]    # Cannot coexist on same component
  schema:
    values:
      max_tool_calls_per_turn: { type: integer, min: 1, default: 5 }
```

**3. Platform Catalog: Feature with `DoesNotExist` (Exclusion Pattern)**
This Feature can be attached to any server or worker, but explicitly excludes components carrying a generative model capability.

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Feature
metadata:
  name: core/global-pii-masking
  version: 1.0.0
spec:
  # !key excludes components carrying the label (here: local generative models)
  appliesTo: "component.aggrega.ai/type in (server, worker), !model.aggrega.ai/capability"
  schema:
    values:
      strict_mode: { type: boolean, default: true }
```

**4. Platform Catalog: Component with a presence mandate**
The Architect mandates that any instance of this Component must have an audit logger attached. The compiler halts if no attachment of that type is present, at any scope.

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Component
metadata:
  name: core/payment-processor
  version: 1.0.0
  labels:
    component.aggrega.ai/type: "server"
    compliance.aggrega.ai/scope: "pci-dss"
  annotations:
    features.aggrega.ai/requiredType.audit: core/enterprise-audit-logger
spec:
  schema:
    values:
      merchant_id: { type: string, required: true }
```

The `audit` suffix names the requirement in the halt's message; repeat the key with another suffix to mandate a second type. See [entities/component.md](../entities/component.md) "Presence mandates" for how a mandate differs from a `featuresSchema` slot.

---

## Example 9: Human-in-the-Loop — Approval Gates

An AI agent uses a sensitive corporate tool. Aggrega generates the webhook proxy configuration that physically blocks unapproved executions.

**1. Platform Catalog: The Feature Interface**

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Feature
metadata:
  name: core/human-approval-gate
  version: 1.0.0
spec:
  appliesTo: "tool.aggrega.ai/impact=mutating"
  schema:
    values:
      channel: { type: string, required: true }
```

**2. Dev Domain: The Aggregate**
The developer attaches the approval gate Feature to the email tool, not to the agent. The compiler draws the edge from the agent to the tool; the FeatureRecipe the Manifest binds for the gate renders the interception proxy configuration on the tool's ingress path.

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Aggregate
metadata:
  name: hitl-email-workflow
  version: 1.0.0
spec:
  components:
    finance-agent:
      type: core/langgraph-agent:1.0.0     # Uses Component from Example 8
      values:
        system_prompt: "Process invoices and send receipts."
      uses:
        tools:
          - "corporate-email"               # Array shorthand — no inject needed

    corporate-email:
      type: tools/smtp-sender:1.0.0
      features:
        human-approval:
          type: core/human-approval-gate:1.0.0
          values:
            channel: "#finance-approvals"
      values: {}
```

**The `tools/smtp-sender` Component** must carry the label `tool.aggrega.ai/impact: "mutating"` for the Feature's `appliesTo` selector to validate.

---

## Example 10: Programmable Policies — Label Transforms & Graph Verdicts

This example runs two Rego policies, both evaluated by the Rego engine compiled into the CLI. One, attached at the `label-transform` role, tags the graph; the other, attached at the `ir-verdict` role, judges it. Both run in governance plugins the operator attaches under `plugins.governance` in the workspace configuration.

**1. The Label Transform (topology construction — graph enrichment)**
Auto-tags every AI gateway — a router that parses the model payload it forwards to an upstream provider — as a point where prompts leave for a model provider. The policy collects one decision per label under `labels`, naming the node, the label key and the value; the engine turns each into the change the build applies. At this role the nodes are at `input.graph.nodes`, one level shallower than the verdict below reads them.

```rego
# policies/egress-tagging.rego: attached at the label-transform role
package aggrega.tagging

import rego.v1

labels contains {"node": id, "key": "compliance.aggrega.ai/egress", "value": "model-provider"} if {
    some id, node in input.graph.nodes
    node.labels["gateway.aggrega.ai/intelligence"] == "semantic"
}
```

**2. The Graph Verdict (static analysis — security boundaries)**
Traces precalculated topological paths and blocks any path through a model-provider egress that carries no masking Feature.

```rego
# policies/model-egress.rego: attached at the ir-verdict role
package aggrega.security

import rego.v1

deny contains msg if {
    some path in input.precalculated_paths
    some egress in path.nodes
    input.graph.spec.nodes[egress].labels["compliance.aggrega.ai/egress"] == "model-provider"
    not "core/data-masking" in path.attached_features

    msg := sprintf(
      "BLOCKED: path %v sends model traffic through %v without core/data-masking attached.",
      [concat(" -> ", path.nodes), egress]
    )
}
```

Four details in that rule are the ones worth carrying to your own policies: a node's
id is the key it sits under in `input.graph.spec.nodes` rather than a field on the
node; `attached_features` is the list of Feature types attached to any node on the
path, so membership is tested with `in`; the rule checks that the masking is
attached, not what it lists; and a
decision collected under `deny` is reported at the `halt` severity, which is what
stops the build. The [governance socket page](../plugins/policy-socket.md) is the
full authoring surface — the payload each role exposes, the decision keys, and how
to name your own.

**3. Attaching Both (the operator's workspace configuration)**
The operator attaches the Rego engine twice, once per role, each attachment with its own policy file. A relative path under `sources` resolves against the directory of the configuration file. The transform runs before the verdict, so the verdict reads the label the first policy wrote.

```yaml
# .aggrega-config.yaml
plugins:
  governance:
    - uri: governance/rego:0.8.6
      role: label-transform
      with:
        sources:
          - policies/egress-tagging.rego
    - uri: governance/rego:0.8.6
      role: ir-verdict
      with:
        sources:
          - policies/model-egress.rego
```

`0.8.6` is the version of the `governance/rego` Plugin entity in the standard-library catalog; the engine itself is compiled into the CLI, and a build serves it from there. [`policy-label-transform/`](policy-label-transform/README.md) attaches a label-shaping policy beside the two built-in tagging plugins, with a verdict that reads the labels they write, and builds it.

**4. Practical Trigger**
Using the `masked-router` Aggregate from Example 7: the label-transform policy tags the gateway `router` as a model-provider egress, and the gateway's edges to the model, the analyzer and the anonymizer are paths through it. If the developer removes the `pii-filter` Feature from `router`, the verdict halts compilation with the message the rule composed. With the masking Feature attached, the same verdict reaches no decision and the build proceeds. A rule over paths sees a node only where an edge reaches or leaves it — a path has at least two nodes — so a gateway wired to nothing appears on no path; a policy that must cover that case also reads the nodes themselves at `input.graph.spec.nodes`.
