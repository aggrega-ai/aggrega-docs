# Features and Policies

## Example 7: Your First Feature — Masking Sensitive Text on the AI Gateway

Features are modular operational behaviors attached to Components. The developer requests *what* they want (sensitive text masked before it reaches a model provider). Ops decides *how* it is realized (the FeatureRecipe the Manifest binds — here one that writes guardrails into the AI gateway's own configuration through a Wasm pipeline step).

**1. Platform Catalog: The Feature Interface**
The Feature uses an `appliesTo` label selector to restrict which Components can receive it — here the data-path capability a gateway declares when it can mask the chat and completion payload it routes. The `schema:` block defines the developer-facing configuration surface. Abridged from the standard library's `core/data-masking`, which also carries a description of every value:

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Feature
metadata:
  name: core/data-masking
  version: 1.0.0
spec:
  appliesTo: "dataplane.aggrega.ai/content-masking"
  schema:
    values:
      $ref: "BaseComponents#/schemas/BaseFeatureParameter"
      properties:
        action: { type: string, enum: [redact, restore], default: redact }
        scope: { type: string, enum: [request, response, both], default: request }
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

The Feature also carries an assertion that halts the build when an attachment lists neither `patterns` nor `entities`: no list is assumed on an author's behalf, so an attachment always names what it masks.

**2. Platform Catalog: The Component That Declares the Capability**
Abridged from `core/gateway/litellm`. The label is what the Feature's selector reads; the two sockets take the pair of services the gateway calls to find and replace entity types.

```yaml
apiVersion: aggrega.ai/v1alpha1
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
    pii_analyzer:
      selector: "security.aggrega.ai/text-anonymization=analyzer"
    pii_anonymizer:
      selector: "security.aggrega.ai/text-anonymization=anonymizer"
```

**3. Dev Domain: The Aggregate**
The developer attaches the Feature to the gateway and says what to mask: a pattern for the company's project codes, and two entity types a recognizer finds. The recognizer is two catalog services wired to the gateway's sockets. The developer names no address, no guardrail and no provider setting.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: masked-router
  version: 1.0.0
spec:
  components:
    router:
      type: core/gateway/litellm
      values:
        models:
          - name: assistant
            target: openai/gpt-4o
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
        pii_analyzer:
          recognizer:
            target: analyzer
        pii_anonymizer:
          replacer:
            target: anonymizer
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
apiVersion: aggrega.ai/v1alpha1
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
          # one entry for the listed patterns, and one for the listed
          # entity types in each direction they are masked, each
          # rendered from .values
    - id: turn_off_message_logging
      plugin: pipeline-step/litellm-gateway-config:1.0.0
      function: step
      with: |
        section: litellm_settings
        settings:
          turn_off_message_logging: true
```

Its assertions halt the build on what this gateway cannot honour — `restore` without entity types, an entity type the analyzer does not recognize, entity types with the recognizer sockets unwired — each naming the constraint and the capability the gateway declares. Entity types masked in a reply are masked by a guardrail loaded from a module the gateway's own Recipe delivers beside its configuration: a request asking for a streamed reply is then refused before it is forwarded, unless the Release sets `allow_streamed_replies` on the attachment, in which case the masked reply arrives in one piece at the end rather than as it is produced.

**5. Routing Domain: Manifest & Release**

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Manifest
metadata:
  name: masked-router-manifest
  version: 1.0.0
spec:
  mappings:
    components:
      type:
        core/gateway/litellm:1.0.0: helm/litellm-gateway:1.0.0
        core/security/presidio-analyzer:1.0.0: helm/presidio-analyzer:1.0.0
        core/security/presidio-anonymizer:1.0.0: helm/presidio-anonymizer:1.0.0
    features:
      type:
        core/data-masking:1.0.0: helm/data-masking-litellm:1.0.0
---
apiVersion: aggrega.ai/v1alpha1
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
        # attachment, and its one infra setting, allow_streamed_replies,
        # matters only while entity types are masked in replies.
        router:
          infra: { port: 4000 }
        analyzer:
          infra: { port: 3000 }
        anonymizer:
          infra: { port: 3000 }
```

**6. What the Build Writes**
The gateway's rendered ConfigMap gains exactly these lines after its routing table, and every other rendered file is byte-identical to a build without the attachment. No address appears in them: the gateway reads the analyzer's and anonymizer's addresses from the environment its Recipe fills from the two sockets.

```yaml
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
    litellm_settings:
      turn_off_message_logging: true
```

At runtime the gateway replaces `PRJ-1234` in a request's messages with `[PROJECT_CODE_REDACTED]`, a person's name with `<PERSON>` and an email address with `<EMAIL_ADDRESS>` before the request reaches the model provider, whatever the caller asks. When the analyzer or the anonymizer cannot be reached it refuses the request rather than forwarding it, and its logging integrations receive a redacted copy of every request and reply.

**7. What It Does Not Do**
Masking is not prevention. The gateway refuses no request on its content; text no pattern matches and the recognizer does not detect passes unchanged; tool-call arguments pass as sent; the gateway and the two recognizer services see the original text; and traffic that does not pass through the gateway is not touched. The FeatureRecipe's own description lists what this gateway leaves unmasked.

---

## Example 8: Duck-Typing Labels, Semantic Selectors & Interoperability

Labels are the semantic identity layer. They drive policy, Feature binding, and `usesSchema` selectors — all without code changes.

**1. Platform Catalog: Richly Labeled Components**

```yaml
apiVersion: aggrega.ai/v1alpha1
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
This Feature targets components with the autonomy label present, regardless of its value. It declares `conflictsWith` to prevent attaching alongside another conflicting Feature.

```yaml
apiVersion: aggrega.ai/v1alpha1
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
This Feature auto-binds to all servers and workers, but explicitly excludes components carrying a generative model capability.

```yaml
apiVersion: aggrega.ai/v1alpha1
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
apiVersion: aggrega.ai/v1alpha1
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
apiVersion: aggrega.ai/v1alpha1
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
The developer attaches the approval gate Feature to the email tool, not to the agent. The compiler traces the topological edge from the agent to the tool and generates the interception proxy configuration on the tool's ingress path.

```yaml
apiVersion: aggrega.ai/v1alpha1
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

## Example 10: Programmable Policies — Wasm Mutators & OPA Validators

The compiler pipeline executes two Wasm gates. The `label-transform` role auto-tags the graph. A governance verdict role evaluates security boundaries. Both are authored by the Platform Architect in Domain 2.

**1. The Wasm Mutator (topology construction — graph enrichment)**
Auto-tags every AI gateway — a router that parses the model payload it forwards to an upstream provider — as a point where prompts leave for a model provider.

```javascript
// governance label-transform guest (compiled from JS/Go/Rust into WebAssembly)
// Input: each node from the flat IR graph
// Output: mutated labels dictionary
if (node.labels["gateway.aggrega.ai/intelligence"] === "semantic") {
    node.labels["compliance.aggrega.ai/egress"] = "model-provider";
}
```

**2. The OPA Policy Validator (static analysis — security boundaries)**
Traces precalculated topological paths and blocks any path through a model-provider egress that carries no masking Feature.

```rego
# governance verdict guest: operator-authored Rego, attached at the ir-verdict role
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

**3. Practical Trigger**
Using the `masked-router` Aggregate from Example 7: the mutator tags the gateway `router` as a model-provider egress, and the gateway's edges to the analyzer and the anonymizer are paths through it. If the developer removes the `pii-filter` Feature from `router`, the policy halts compilation with the message the rule composed. With the masking Feature attached, the same policy reaches no decision and the build proceeds. A rule over paths sees a node only where an edge reaches or leaves it — a path has at least two nodes — so a gateway wired to nothing appears on no path; a policy that must cover that case also reads the nodes themselves at `input.graph.spec.nodes`.
