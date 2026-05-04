# Governance and Compliance

This chapter defines how Platform Teams enforce corporate compliance, manage Day-2 lifecycle events, and ensure the physical infrastructure scales safely across multiple environments.

## Part 15: Enterprise Governance & Compliance Patterns

A core challenge in platform engineering is enforcing corporate governance (such as SOC 2 compliance, FinOps cost-center tracking, and strict ownership mapping) without polluting the open-source catalog.

If Aggrega hardcoded domain-specific logic into its official components, it would cease to be an unopinionated compiler and devolve into an opinionated framework. Conversely, if compliance is left entirely to the developer, critical tags will be misspelled, forgotten, or bypassed.

To solve this, Aggrega provides the **Wasm socket mechanisms** for compliance, while the Enterprise dictates the **policy**. Enterprises achieve zero-trust governance by adopting two distinct social contracts within their ecosystem.

### 1. The "Bring Your Own Baseline" (BYOB) + Wasm Validation Gate

For static, developer-provided data (such as team ownership or data classification), enterprises should never rely on the raw open-source catalog directly. Instead, the Platform Architect authors a corporate baseline component that enforces their specific CUE constraints, and uses the `policy-validator.wasm` socket to enforce its use.

**The Catalog Contract:**
The enterprise creates a baseline that requires specific tags but provisions no infrastructure.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Component
metadata:
  name: acme/corporate-baseline
  version: 1.0.0
  labels:
    component.aggrega.ai/type: "server" # Placeholder, safely overwritten by child components during Two-Tiered Merge
spec:
  cueSchema: |
    values: {
        // The developer MUST provide these, or the CUE validator halts the build
        owner: string 
        cost_center: string
    }
```

All internal components (e.g., `acme/postgres`) must use `extends: "acme/corporate-baseline"`.

**The Wasm Validation Failsafe:**
To prevent a developer from bypassing the internal catalog and pulling a naked `core/postgres` component directly from the public hub, the enterprise registers a topological validation plugin (executed in Step 4).

```javascript
// Evaluated by policy-validator.wasm in Step 4
export function validate(graph) {
    let failures = [];
    for (const [id, node] of Object.entries(graph.nodes)) {
        if (!node.values.owner) {
            failures.push({
                pass: false,
                message: `Governance Violation: Node '${id}' is missing the 'owner' field. You must use components that extend 'acme/corporate-baseline'.`
            });
        }
    }
    return failures;
}
```

If the plugin returns a failure, the compiler instantly halts.

**Centralized Enterprise Governance (Evaluating Complete Reality):**
Relying on out-of-band mechanisms (like `CODEOWNERS` on a git repository) to govern architecture is a weak workaround. All governance is localized in the compiler's `policy-validator.wasm` socket. Because the AOT compiler builds the IR Graph by flattening *both* the Developer's `Aggregate` and the Ops Engineer's `Release`, the policy engine evaluates the complete reality before physical artifacts are generated. Policies can fatally halt the build if a developer requests an unapproved Component, if Ops maps a component to an unapproved Recipe in the Manifest, or if an insecure Wasm mutation is attached to a Component carrying a `restricted` subsystem label.

### 2. The Wasm Mutator Gate (Dynamic Compliance)

Developers should not be forced to manually type environmental compliance tags (e.g., `environment: production` or `soc2_in_scope: true`) into their `Aggregate`, as these change depending on the GitOps target.

For dynamic metadata, enterprises utilize the **Mutation Gate (`mutator.wasm`) in Step 2**. After the AST is expanded, the compiler executes the Wasm mutation plugin authored by the enterprise. This plugin silently evaluates the deployment context and returns JSONPatches to inject the required metadata directly into the component's labels, completely bypassing the developer's YAML (e.g., injecting the label `compliance.aggrega.ai/data-class: restricted` based on environment boundaries).

```javascript
// Evaluated by mutator.wasm in Step 2
// Silently returns a JSONPatch to tag the node based on the physical Release parameters
export function mutate(context, graph) {
    let patches = [];
    for (const [nodeId, node] of Object.entries(graph.nodes)) {
        if (context.parameters.env === "production" && node.labels["component.aggrega.ai/type"] === "stateful-server") {
            patches.push({ op: "add", path: `/nodes/${nodeId}/labels/acme.com~1soc2-scope`, value: "true" });
            patches.push({ op: "add", path: `/nodes/${nodeId}/labels/acme.com~1environment`, value: "prod" });
        }
    }
    return patches;
}
```

Because these tags are silently injected into the standard metadata dictionary in-memory, Wasm rendering plugins can easily read them to conditionally generate specific physical configurations (like hardened AWS or Kubernetes resources) during Step 5.

> **Looking Ahead: "Zero-Touch" Governance**
> While the BYOB and Wasm mutation patterns provide strict, explicit governance, they still require developer participation (e.g., explicitly extending a corporate baseline). To completely close the compliance circle, a planned extension introduces **Global Schema Overlays** (detailed in the Roadmap). This Aspect-Oriented feature will allow Platform Ops to transversally inject CUE schemas across the entire workspace, silently upgrading naked open-source components with corporate rules before compilation even begins.

### 3. Preserving Domain Intelligence (The Configurations & Safety)

Because the Aggrega compiler is mathematically unopinionated, it possesses zero hardcoded knowledge of AI frameworks, token budgets, or memory partitioning. Instead, the generic cloud-native schemas act as an empty vessel. Rather than being hardcoded into the core engine, highly specialized domain intelligence is distributed across the entire extensible Aggrega ecosystem. It is encapsulated within the Platform Catalog through specialized `components`, `features`, and `recipes`. Developers preserve their specific application intent within their `values` and `uses` blocks—strictly governed by the Architect's CUE schemas—while the physical translation of that intelligence is executed by target-specific WebAssembly plugins.

**A. Modeling Domain-Specific Implementations (Validated via Split Schemas)**

Platform Architects can leverage the Split Schema pipeline to model any complex architecture, completely independent of the core compiler:

* **Opaque Execution Logic (`values`):** If an enterprise deploys an AI Gateway, the Developer might need to configure `semantic_routing` logic, `fallback_chain` arrays, or `token_budget` metrics. The core compiler does not parse these concepts. They reside safely in the opaque `values` payload, strictly validated by the component's `cueSchema`. The compiler simply passes this payload to the Wasm plugin to generate the gateway's configuration.
* **Topological Dependency Mapping (`uses`):** If an AI framework requires `tools_allowed` arrays or explicitly maps agents to vector datastores, these configurations dictate *who talks to whom*. Therefore, they must be declared in the `uses` pillar. The compiler blindly draws these explicit edges in the IR Graph. This allows downstream Wasm rendering plugins to programmatically generate the network policies and physical boundaries required to secure the connections, without the compiler understanding the underlying AI framework.
* **Complex Data Structures (e.g., CoALA):** Rather than being limited to flat arrays, Architects can use CUE to enforce deeply structured dictionaries in the `uses` block. For example, to implement the CoALA framework, an Architect can mandate `semantic_memory`, `episodic_memory`, and `working_memory` as distinct topological targets. The generic policy engines evaluate these structured edges to mandate granular access control guardrails for each distinct cognitive lobe.

**B. Core Security & Indirection Mechanisms**

While the payload is unopinionated, the generic schema enforces strict structural mechanisms to guarantee secure artifact generation:

* **The Explicit `secrets` Object Pattern:** Aggrega strictly forbids the placement of credentials within `values` blocks (where they might be accidentally logged or printed). Instead, developers must place them in a strongly typed, core-schema-enforced `secrets` dictionary, referencing a credential Feature `type` (labeled `feature.aggrega.ai/kind: secret`) and its `values` configuration. The compiler enforces this partition: only Features with the `feature.aggrega.ai/kind: secret` label are accepted in the `secrets:` block, and these Features are rejected if placed in the `features:` block. This ensures that credential routing is handled via target-agnostic late binding without the core compiler ever resolving or exposing plaintext secret strings.
* **Abstract Trust Verification:** Because the `values` block is broadly extensible, Architects can mandate abstract directives like `tls_pinning` or `required_signatures: 2` (for Quorum consensus). The core compiler blindly passes these CUE-validated objects into the flat IR graph. A custom Wasm rendering plugin can then read these values to generate artifacts for hardware-level Human-in-the-Loop (HITL) approval gates. If an application attempts to bypass consensus rules, the physically deployed proxy blocks the execution until a webhook approval is received.

**C. Advanced Operational Safety (`spec.interoperability`)**

To protect fragile workloads from conflicting infrastructure mutations, the generic `Feature` schema defines strict interoperability boundaries:

* **`spec.interoperability.conflictsWith`** — an array of Feature type URIs that cannot be attached to the same component simultaneously. Rather than hardcoding architectural purity checks into the core Go compiler, this array is evaluated by a custom `linter.wasm` plugin before rendering. If the linter detects incompatible features attached to a node, it halts the build.
* **`spec.interoperability.componentRefPath`** — a JSONPath / YAMLPath string defining exactly where the Wasm rendering plugin should safely inject the resolved target ID of the component during late-binding configuration generation.

### 4. Network Boundary Governance (Default Deny Convention)

Developers do not write network policies directly; the required network boundaries are mapped by the compiler's Intermediate Representation (IR) graph, which carries every topological edge between components declared in the Aggregate.

* **Internal boundaries.** The compiler draws the flat IR graph, and the standard-library convention assumes every connection is unreachable by default. A Wasm rendering plugin generates an `allow_ingress_from` / `allow_egress_to` configuration rule only if the compiler detected a direct topological edge between the two nodes. Nodes without a declared edge produce no allow rule.
* **Public ingress (agnostic perimeter control).** Public ingress is governed by the enterprise's custom rules in the `policy-validator.wasm` socket. A corporate security team can author a policy that evaluates a node's cloud-native ontology type and rejects the build if a developer attempts to attach a `public-ingress` feature to a `worker` or `task` node. The compiler is blind to what "public" means; it enforces the Boolean output of the Wasm validation gate.

### 5. Compile-Time Provenance Stamping

The compiler builds a provenance record during compilation, capturing compiler version, catalog digests, and the build timestamp. Helm and helm-chart renderers emit this as the `aggrega.ai/compiler-version` label on generated Kubernetes manifests; enterprise security teams use this to identify which deployments were built by which compiler version — critical when a vulnerability is discovered in a specific compiler release and affected deployments need to be audited.

*Other providers (Terraform, Compose, CloudFormation) stamp provenance in their native tagging mechanisms as their renderers add that capability; the in-memory provenance record exists for every compilation today.*

### 6. Metadata and Annotations as the Extension Surface

The Go compiler is blind to domain-specific concepts — AI frameworks, database engines, Kubernetes idioms — and works only on flat graph-level operations against the IR. To drive the ecosystem without hardcoding domain-specific logic into the Go binary, the platform uses standard metadata labels and annotations as the extension surface for domain intelligence.

The compiler reads no domain-specific annotations. It bundles all developer-provided annotations and duck-typing labels into the flat IR graph and passes this metadata blindly to the `policy-validator.wasm`, `mutator.wasm`, and rendering plugins. The WebAssembly ecosystem interprets the metadata and executes the required logic — evaluating compliance policies, injecting tags into cloud-native artifacts, or triggering feature expansion — independently of the core compiler.

This keeps the extensibility surface wide (anyone can author a Wasm plugin that reads a new annotation prefix) while keeping the core compiler stable: no core release is required for the ecosystem to add a new domain-specific annotation.
