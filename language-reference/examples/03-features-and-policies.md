# Features and Policies

## Example 7: Your First Feature — Attaching a Data Masking Sidecar

Features are modular operational behaviors attached to Components. The developer requests *what* they want (data masking). Ops decides *how* to implement it (a Lakera Guard sidecar via a Wasm pipeline).

**1. Platform Catalog: The Feature Interface**
The Feature uses an `appliesTo` label selector to restrict which Components can receive it. The `schema:` block defines the developer-facing configuration surface.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Feature
metadata:
  name: core/data-masking
  version: 1.0.0
spec:
  appliesTo: "component.aggrega.ai/type in (server, worker)"
  schema:
    values:
      action: { type: string, enum: [redact, tokenize, block], default: redact }
    infra:
      sidecar_cpu_limit: { type: string }
```

**2. Dev Domain: The Aggregate**
The developer attaches the Feature to their worker. They configure the cognitive `values`. They have no awareness of how the masking is physically implemented.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: masked-agent
  version: 1.0.0
spec:
  components:
    finance-agent:
      type: core/python-worker:1.0.0       # Assumes a worker Component exists in the catalog
      values:
        image: "corp/finance-agent:v2"
      features:
        pii-filter:
          type: core/data-masking:1.0.0
          values:
            action: "redact"
```

**3. Platform Catalog: The Worker Component (with `usesSchema`)**

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Component
metadata:
  name: core/python-worker
  version: 1.0.0
  labels:
    component.aggrega.ai/type: "worker"
spec:
  schema:
    values:
      image: { type: string, required: true }
```

**4. Ops Domain: The FeatureRecipe (Wasm Pipeline)**
The FeatureRecipe maps the abstract Feature to a concrete Wasm plugin pipeline. The pipeline is designed to execute sequentially during Step 5 Phase C, mutating the base infrastructure AST. *Phase C is currently `accepted but inert`; see [Status of the Language](../10-status.md#compilation-pipeline-phases) for current behaviour.*

> **Status: the `pipeline:` field is currently `accepted but inert` — the schema accepts the array shape but the compiler does not yet execute the plugins. See [Status of the Language](../10-status.md#compilation-pipeline-phases) for current behaviour. The example below illustrates the designed flow.**

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: FeatureRecipe
metadata:
  name: lakera-guard-sidecar
  version: 1.0.0
spec:
  capability: helm
  implements: core/data-masking:1.0.0
  pipeline:
    - id: "policy_gen"
      plugin: security/lakera-policy-gen:1.0.0
      function: generate_policy
      with: |
        target_action: "{{ .values.action }}"

    - id: "sidecar_inject"
      plugin: networking/envoy-sidecar-injector:2.0.0
      function: inject_sidecar
      with: |
        generated_policy: "{{ .steps.policy_gen.outputs.policy_id }}"
        cpu_limit: "{{ optional .infra `sidecar_cpu_limit` "100m" }}"
        target_container: "{{ .locals.primary_compute }}"
```

**5. Routing Domain: Manifest & Release**

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Manifest
metadata:
  name: masked-agent-manifest
  version: 1.0.0
spec:
  mappings:
    helm:
      components:
        type:
          "core/python-worker": "python-worker-helm:1.0.0"
      features:
        type:
          "core/data-masking": "lakera-guard-sidecar:1.0.0"
---
apiVersion: aggrega.ai/v1alpha1
kind: Release
metadata:
  name: masked-agent-release
  version: 1.0.0
  environment: production
spec:
  aggregate: masked-agent
  manifest: masked-agent-manifest
  boundaries:
    prod-cluster:
      directory: "deploy/prod"
      components:
        finance-agent:
          infra: { cpu_limit: "500m" }
          features:
            pii-filter:
              # Ops injects physical sizing for the Feature.
              # values come from the Aggregate — the Release MUST NOT provide them.
              infra:
                sidecar_cpu_limit: "200m"
```

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

**4. Platform Catalog: Component with `requiredFeatures`**
The Architect mandates that any instance of this Component must have an audit logger attached. The compiler halts if the developer omits it.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Component
metadata:
  name: core/payment-processor
  version: 1.0.0
  labels:
    component.aggrega.ai/type: "server"
    compliance.aggrega.ai/scope: "pci-dss"
spec:
  requiredFeatures:
    - "core/enterprise-audit-logger"
  schema:
    values:
      merchant_id: { type: string, required: true }
```

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

The compiler pipeline executes two Wasm gates. The `mutator.wasm` auto-tags the graph. The `policy.wasm` evaluates security boundaries. Both are authored by the Platform Architect in Domain 2.

**1. The Wasm Mutator (Step 2 — Graph Enrichment)**
Auto-tags stateful servers with a `restricted` data classification label.

```javascript
// mutator.wasm (compiled from JS/Go/Rust into WebAssembly)
// Input: each node from the flat IR graph
// Output: mutated labels dictionary
if (node.labels["component.aggrega.ai/type"] === "stateful-server") {
    node.labels["compliance.aggrega.ai/data-class"] = "restricted";
}
```

**2. The OPA Policy Validator (Step 4 — Security Boundaries)**
Traces precalculated topological paths and blocks any connection to restricted data without a masking Feature attached.

```rego
# policy.wasm (compiled from Rego into WebAssembly)
package aggrega.security

deny[msg] {
    path := input.precalculated_paths[_]
    source := input.graph.nodes[path.nodes[0]]
    target := input.graph.nodes[path.nodes[count(path.nodes) - 1]]

    target.labels["compliance.aggrega.ai/data-class"] == "restricted"
    not path.attached_features["core/data-masking"]

    msg := sprintf(
      "BLOCKED: %v cannot access restricted node %v without core/data-masking attached.",
      [source.id, target.id]
    )
}
```

**3. Practical Trigger**
Using the `masked-agent` Aggregate from Example 7: the mutator auto-tags any Postgres database as `restricted`. If the developer removes the `pii-filter` Feature from `finance-agent`, the OPA policy halts compilation with the explicit deny message.
