# Governance and Compliance

This chapter defines how Platform Teams enforce corporate compliance, manage Day-2 lifecycle events, and ensure the physical infrastructure scales safely across multiple environments.

## Enterprise Governance & Compliance Patterns

A core challenge in platform engineering is enforcing corporate governance (such as SOC 2 compliance, FinOps cost-center tracking, and strict ownership mapping) without polluting the open-source catalog.

If Aggrega hardcoded domain-specific logic into its official components, it would cease to be an unopinionated compiler and devolve into an opinionated framework. Conversely, if compliance is left entirely to the developer, critical tags will be misspelled, forgotten, or bypassed.

To solve this, Aggrega provides the **Wasm socket mechanisms** for compliance, while the Enterprise dictates the **policy**. Enterprises achieve zero-trust governance by adopting two distinct social contracts within their ecosystem.

### 1. The "Bring Your Own Baseline" (BYOB) + Wasm Validation Gate

For static, developer-provided data (such as team ownership or data classification), enterprises should never rely on the raw open-source catalog directly. Instead, the Platform Architect authors a corporate baseline component that enforces their specific schema constraints, and uses a governance verdict role to enforce its use.

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
  schema:
    values:
      # The developer MUST provide these, or the schema validator halts the build
      owner: { type: string, required: true }
      cost_center: { type: string, required: true }
```

All internal components (e.g., `acme/postgres`) must use `extends: "acme/corporate-baseline"`.

**The Wasm Validation Failsafe:**
To prevent a developer from bypassing the internal catalog and pulling a naked `core/postgres` component directly from the public hub, the enterprise registers a topological validation plugin (executed in Step 4).

```javascript
// Evaluated by the governance ir-verdict role in Step 4
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
Relying on out-of-band mechanisms (like `CODEOWNERS` on a git repository) to govern architecture is a weak workaround. All governance is localized in the compiler's governance verdict roles. Because the AOT compiler builds the IR Graph by flattening *both* the Developer's `Aggregate` and the Ops Engineer's `Release`, the policy engine evaluates the complete reality before physical artifacts are generated. Policies can fatally halt the build if a developer requests an unapproved Component, if Ops maps a component to an unapproved Recipe in the Manifest, or if an insecure Wasm mutation is attached to a Component carrying a `restricted` subsystem label.

### 2. The Wasm Mutator Gate (Dynamic Compliance)

Developers should not be forced to manually type environmental compliance tags (e.g., `environment: production` or `soc2_in_scope: true`) into their `Aggregate`, as these change depending on the GitOps target.

For dynamic metadata, enterprises utilize the **Mutation Gate (the governance socket's `label-transform` role) in Step 2**. After the AST is expanded, the compiler executes the Wasm mutation plugin authored by the enterprise. This plugin silently evaluates the deployment context and returns JSONPatches to inject the required metadata directly into the component's labels, completely bypassing the developer's YAML (e.g., injecting the label `compliance.aggrega.ai/data-class: restricted` based on environment boundaries).

```javascript
// Evaluated by the governance label-transform role in Step 2
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
> While the BYOB and Wasm mutation patterns provide strict, explicit governance, they still require developer participation (e.g., explicitly extending a corporate baseline). To completely close the compliance circle, a planned extension introduces **Global Schema Overlays** (detailed in the Roadmap). This Aspect-Oriented feature will allow Platform Ops to transversally inject JSON Schema 2020-12 fragments across the entire workspace, silently upgrading naked open-source components with corporate rules before compilation even begins.

### 3. Preserving Domain Intelligence (The Configurations & Safety)

Because the Aggrega compiler is mathematically unopinionated, it possesses zero hardcoded knowledge of AI frameworks, token budgets, or memory partitioning. Instead, the generic cloud-native schemas act as an empty vessel. Rather than being hardcoded into the core engine, highly specialized domain intelligence is distributed across the entire extensible Aggrega ecosystem. It is encapsulated within the Platform Catalog through specialized `components`, `features`, and `recipes`. Developers preserve their specific application intent within their `values` and `uses` blocks — strictly governed by the Architect's `schema:` declarations (compact form or full JSON Schema 2020-12) — while the physical translation of that intelligence is executed by target-specific WebAssembly plugins.

**A. Modeling Domain-Specific Implementations (Validated via Split Schemas)**

Platform Architects can leverage the Split Schema pipeline to model any complex architecture, completely independent of the core compiler:

* **Opaque Execution Logic (`values`):** If an enterprise deploys an AI Gateway, the Developer might need to configure `semantic_routing` logic, `fallback_chain` arrays, or `token_budget` metrics. The core compiler does not parse these concepts. They reside safely in the opaque `values` payload, strictly validated by the component's `schema:` declaration. The compiler simply passes this payload to the Wasm plugin to generate the gateway's configuration.
* **Topological Dependency Mapping (`uses`):** If an AI framework requires `tools_allowed` arrays or explicitly maps agents to vector datastores, these configurations dictate *who talks to whom*. Therefore, they must be declared in the `uses` pillar. The compiler blindly draws these explicit edges in the IR Graph. This allows downstream Wasm rendering plugins to programmatically generate the network policies and physical boundaries required to secure the connections, without the compiler understanding the underlying AI framework.
* **Complex Data Structures (e.g., CoALA):** Rather than being limited to flat arrays, Architects can use JSON Schema 2020-12 (in compact form or full form) to enforce deeply structured dictionaries in the `uses` block. For example, to implement the CoALA framework, an Architect can mandate `semantic_memory`, `episodic_memory`, and `working_memory` as distinct topological targets. The generic policy engines evaluate these structured edges to mandate granular access control guardrails for each distinct cognitive lobe.

**B. Core Security & Indirection Mechanisms**

While the payload is unopinionated, the generic schema enforces strict structural mechanisms to guarantee secure artifact generation:

* **The Attachment-Not-A-Value Pattern:** the standard-library convention is that a credential is requested as an *attachment*, never written into a `values` block where it would be an inline literal the compiler carries verbatim. A credential attachment names a credential Feature `type` (one labeled `feature.aggrega.ai/kind: secret`) and uses its own `values` to describe the query against a secret store. Credential routing is then capability-agnostic late binding, and the core compiler never resolves or exposes the material — it pipes the pointer the Ops Recipe supplied. This is a **convention** the catalog and the schemas encourage, not a compiler check: the compiler is blind to what a `values` leaf means, so an author who inlines material inlines it. What the schema *does* guarantee is that the attachment surface exists and is typed.
* **Abstract Trust Verification:** Because the `values` block is broadly extensible, Architects can mandate abstract directives like `tls_pinning` or `required_signatures: 2` (for Quorum consensus). The core compiler blindly passes these schema-validated objects into the flat IR graph. A custom Wasm rendering plugin can then read these values to generate artifacts for hardware-level Human-in-the-Loop (HITL) approval gates. If an application attempts to bypass consensus rules, the physically deployed proxy blocks the execution until a webhook approval is received.

**C. Advanced Operational Safety (`spec.interoperability`)**

To protect fragile workloads from conflicting infrastructure mutations, the generic `Feature` schema defines strict interoperability boundaries:

* **`spec.interoperability.conflictsWith`** — an array of Feature type URIs that cannot be attached to the same component simultaneously. Rather than hardcoding architectural purity checks into the core Go compiler, this array is evaluated by a custom `linter.wasm` plugin before rendering. If the linter detects incompatible features attached to a node, it halts the build.
* **`spec.interoperability.componentRefPath`** — a JSONPath / YAMLPath string defining exactly where the Wasm rendering plugin should safely inject the resolved target ID of the component during late-binding configuration generation.

### 4. Network Boundary Governance (Default Deny Convention)

Developers do not write network policies directly; the required network boundaries are mapped by the compiler's Intermediate Representation (IR) graph, which carries every topological edge between components declared in the Aggregate.

* **Internal boundaries.** The compiler draws the flat IR graph, and the standard-library convention assumes every connection is unreachable by default. A Wasm rendering plugin generates an `allow_ingress_from` / `allow_egress_to` configuration rule only if the compiler detected a direct topological edge between the two nodes. Nodes without a declared edge produce no allow rule.
* **Public ingress (agnostic perimeter control).** Public ingress is governed by the enterprise's custom rules at a governance verdict role. A corporate security team can author a policy that evaluates a node's cloud-native ontology type and rejects the build if a developer attempts to attach a `public-ingress` feature to a `worker` or `task` node. The compiler is blind to what "public" means; it enforces the Boolean output of the Wasm validation gate.

### 5. Compile-Time Provenance Stamping

The compiler builds a provenance record during compilation, capturing compiler version, catalog digests, and the build timestamp. Helm and helm-chart renderers emit this as the `aggrega.ai/compiler-version` label on generated Kubernetes manifests; enterprise security teams use this to identify which deployments were built by which compiler version — critical when a vulnerability is discovered in a specific compiler release and affected deployments need to be audited.

*The compose provider stamps provenance in its native tagging mechanism as its renderer adds that capability; the in-memory provenance record exists for every compilation today.*

### 6. Metadata and Annotations as the Extension Surface

The Go compiler is blind to domain-specific concepts — AI frameworks, database engines, Kubernetes idioms — and works only on flat graph-level operations against the IR. To drive the ecosystem without hardcoding domain-specific logic into the Go binary, the platform uses standard metadata labels and annotations as the extension surface for domain intelligence.

The compiler reads no domain-specific annotations. It bundles all developer-provided annotations and duck-typing labels into the flat IR graph and passes this metadata blindly to the governance and rendering plugins. The WebAssembly ecosystem interprets the metadata and executes the required logic — evaluating compliance policies, injecting tags into cloud-native artifacts, or triggering feature expansion — independently of the core compiler.

This keeps the extensibility surface wide (anyone can author a Wasm plugin that reads a new annotation prefix) while keeping the core compiler stable: no core release is required for the ecosystem to add a new domain-specific annotation.

## What a policy reads about an attachment

A verdict role evaluating the IR graph receives the graph whole, and that includes every attachment each node carries, keyed by the name the author gave it. The point of carrying attachment detail rather than a summary is that Aggrega has no opinion to summarise: the compiler routes attachments without judging what they hold, so the facts a policy needs to judge them are the facts a policy is given.

Per attachment, the graph carries:

* **The Feature type it requests, and the catalog version resolved for it.** The type is the string the author wrote, verbatim — a version-pinned reference and a bare one are different strings for one referent, so a policy that compares types should expect either spelling.
* **The attached Feature's catalog labels, verbatim.** Unfiltered, unnormalised, in the order the catalog entity declares them. A policy reads exactly what the catalog author wrote, including labels of the author's own invention that Aggrega has no knowledge of.
* **Which declared attachment slot it fills.** A `featuresSchema` slot is filled by attaching a Feature under the slot's name, so an attachment naming a slot its Component declares reports that slot's name, and one that fills none reports `free`. The value is the slot's name rather than a flag, because which binding point was filled is usually the more useful half of the answer.
* **Whether it handles material an author declared sensitive**, and which of its delivery keys carry that material. Both are derived from declarations — a `sensitive` leaf on a Feature's schema, a `sensitive` slot on the consuming Component — never from inspecting a value.
* **Its `values`, its `infra`, and its delivery mapping**, plus whether the attachment was written in a `features:` block or contributed by annotation-driven expansion.

An attachment's labels bind the compiler in exactly one place, and it is not a policy decision: a slot may declare a `selector`, and a fill whose labels do not satisfy it halts the build. Past that gate the labels steer nothing — how a value is routed and delivered is the same whichever labels a Feature carries. So a policy reading a label is reading metadata the compiler carried without interpreting, not second-guessing a branch inside it.

Three rules this makes writable, none of which the compiler makes for you:

* **Forbid free-form attachment.** An estate that requires every attachment to fill a declared binding point rejects any attachment reporting `free`. This is the counterpart of the attachment surface staying open: composition is free by default, and an operator who does not want it free says so.
* **Refuse by-value delivery of sensitive material.** Aggrega warns when a declared-sensitive datum travels through a delivery key as a literal, and never halts — the by-value credential family is deliberate. An operator who wants that warning to be a refusal expresses it here.
* **Decide for yourself what counts as a credential.** The standard library marks its credential Features with a family label, and reading that label is one way to reason about them. A broader or narrower predicate — an internal label, a naming rule, a set of approved types — is equally available, because the labels arrive rather than a verdict about them.

A verdict role accepts or rejects; it never rewrites. The build either proceeds unchanged or halts with the verdict's message, so a policy cannot quietly bring a non-compliant graph into compliance.

Attachment detail reaches a policy evaluating the **IR graph**. A policy evaluating **rendered artifacts** receives those artifacts and no graph, which is a property of that input rather than a restriction applied to it: the two stages answer different questions, and attachment topology is not among the questions rendered output can be asked.

## Inheritance and policy narrowing

Inheritance via `extends:` is the catalog mechanism that lets Platform Architects build specialised child entities on top of shared baselines. The merger composes parent and child specs at workspace-load time, producing a unified schema with per-leaf provenance. The substantive governance question — what constraints a child may declare relative to the parent — is enforced not at the schema layer but at the **publishing-discipline policy plugin** (`linter.wasm` in its standard publishing-discipline mode), which gates publishes against the monotonic-narrowing rule.

Schema composition under JSON Schema 2020-12 is structurally permissive: a child schema that relaxes a parent's constraint (e.g., widens an `enum:` set, raises a `max:` value) is structurally valid JSON Schema. Aggrega's narrowing rule — "a child may narrow a parent's constraint but cannot widen it" — is a policy rule, not a language rule. The policy plugin walks the resolved schema at publish time, consults the per-leaf provenance tag (parent vs child), and compares the child's constraint against the parent's per-dimension.

### Per-dimension narrowing comparison

The plugin compares constraints per dimension:

| Constraint dimension | Narrowing direction |
| --- | --- |
| `min` (numeric / length / items) | child's value is greater than or equal to the parent's value |
| `max` (numeric / length / items) | child's value is less than or equal to the parent's value |
| `enum` | child's value set is a subset of the parent's |
| `pattern` | child's pattern is at least as restrictive (heuristic; uncertain results emit a warning rather than a violation) |
| `format` | child's format is at least as restrictive (e.g., `email` is narrower than `string`) |
| `required` | child's required-field set is a superset of the parent's |
| `additionalProperties` | child can move from `true` to `false` (narrower); the reverse direction is a relaxation |

Combinations of constraints (e.g., `min: 5, max: 10` vs parent's `min: 3, max: 12`) compare per dimension; the result is "narrower" only if every dimension is narrower-or-equal.

### Policy configuration and the per-entity exemption pattern

The standard publishing-discipline plugin reads workspace policy from the `lint.publishing_discipline` block of `.aggrega-config.yaml`:

```yaml
lint:
  publishing_discipline:
    enforce_monotonic_narrowing: true   # default true; preserves the typical inheritance contract

    # Per-entity exemptions (the common pattern for legitimate relaxation)
    narrowing_exemptions:
      - entity: my-team/datastore/mariadb-eu
        paths:
          - spec.schema.values.primary.replicaCount
        reason: "EU regional capacity constraint differs from parent's range"
      - entity: my-team/server/cluster-prod
        paths:
          - spec.schema.values.architecture
        reason: "Production-only architecture options not in parent"
```

Three configuration patterns emerge in practice:

1. **Default (most workspaces)**: `enforce_monotonic_narrowing: true`, no exemptions. The plugin rejects any publish where a child relaxes a parent constraint. This matches the typical inheritance contract — a child Component must satisfy every constraint its parent declares.
2. **Workspace-wide opt-out (rare)**: `enforce_monotonic_narrowing: false`. All relaxations pass. Appropriate only for workspaces with explicit reasons to bypass narrowing (research catalogs where contracts evolve rapidly; experimental playgrounds).
3. **Per-entity exemptions (common for legitimate relaxation)**: Specific entities and constraint paths are exempted; the architect provides a `reason:` string. Code review of the policy file is the governance layer; exemptions are explicit, reviewable, and documented in the workspace.

Per-entity exemptions are the recommended pattern when relaxation is needed. They are explicit and reviewable; they do not disable the check workspace-wide; they document the architectural reason.

### Diagnostic output for narrowing violations

When the plugin detects a violation, the diagnostic names the entity, the constraint path, both source positions (parent and child), the direction of the violation, and the available remediations:

```text
Publishing-discipline violation: monotonic narrowing
  Entity: my-team/datastore/mariadb-strict@1.0.0
  Constraint path: spec.schema.values.primary.replicaCount.maximum
  Parent declares maximum: 9
    (defined in: core/datastore/mariadb-base.yaml:42)
  Child declares maximum: 12  (wider — relaxes parent)
    (declared in: my-team/mariadb-strict.yaml:23)
  Suggestion: either narrow the child's constraint to satisfy the parent,
              or add an exemption to .aggrega-config.yaml under lint.publishing_discipline.narrowing_exemptions.
```

The error formatter (see [compilation-pipeline §"The Validator Pipeline"](10-compilation-pipeline.md#the-validator-pipeline-step-4a)) produces the same parent-child framing for build-time validation diagnostics; the publishing-discipline plugin reuses the format at publish time.

### Rule placement: which rules live in the policy plugin vs the per-Component schema

The publishing-discipline plugin is the home for **cross-cutting rules that apply across the catalog**: monotonic narrowing on `extends:` chains, supply-chain rules (e.g., "every Recipe must `implements:` a Component that exists in the catalog"), enterprise compliance rules (e.g., "every Component with `compliance.aggrega.ai/scope: pci-dss` must `extends:` the corporate pci baseline"). These rules cross multiple entities, evaluate the workspace as a unit, or enforce conventions at publish time rather than at build time.

The per-Component / per-Feature `schema:` declaration is the home for **per-entity constraints**: per-field types, ranges, patterns, enums; cross-field rules expressed in the dedicated `assertions:` block (chapter 08). These constraints are local to one entity and travel with it through the catalog.

The split is not arbitrary. A rule like "every required field must be present" is a per-entity constraint that belongs in `required:` arrays. A rule like "every child entity that extends a `pci-dss` parent must declare a workspace-level governance label" is a cross-entity rule that the policy plugin enforces. The two rule classes never overlap because they answer different questions: the schema validates "does this instance match its contract"; the policy plugin validates "does this catalog satisfy the cross-cutting rules the workspace requires".

When authoring a new governance rule, the placement question is: does the rule depend only on a single entity's content (→ schema or assertions block) or does it depend on the relationship between multiple entities or workspace-level configuration (→ policy plugin). The Wasm-linter pattern is the canonical mechanism for the cross-cutting case; enterprise catalogs may distribute custom policy plugins that consume the same plugin-contract interface as the standard publishing-discipline plugin.

## Annotation prefix discipline

The annotation namespace carries origin semantics — different prefixes signal different audiences and different governance authorities. Catalog authors, enterprise platform teams, and the Aggrega platform itself all author annotations into the same flat dictionary; the prefix is what keeps the audiences distinct.

| Prefix | Origin | Audience | Mutability |
| --- | --- | --- | --- |
| `aggrega.ai/` (bare) | **Reserved**: emitted by the Aggrega compiler only | Internal tooling, provenance stamping | Not user-authorable; bare-prefix annotations declared in user content are rejected at publish time |
| `<sub-domain>.aggrega.ai/` (e.g., `component.aggrega.ai/`, `feature.aggrega.ai/`, `compliance.aggrega.ai/`) | Catalog convention | Architects authoring catalog entities; Wasm policy plugins consuming the labels | Catalog publisher authors; consumers read |
| `<enterprise-domain>/` (e.g., `acme.com/`, `my-org.io/`) | Enterprise overlay | Enterprise platform teams; enterprise Wasm plugins | Enterprise authors; the platform compiler ignores them as opaque metadata |
| `<community-domain>/` (e.g., `cncf.io/`, `kubernetes.io/`) | External ecosystem | Cross-ecosystem tooling reading well-known labels | Community-governed |

The bare `aggrega.ai/` prefix carries the strongest discipline: it is reserved for platform-emitted annotations only. The compiler emits `aggrega.ai/compiler-version`, `aggrega.ai/component-id`, `aggrega.ai/recipe-uri`, `aggrega.ai/boundary-path`, and related provenance keys on rendered output; user content that declares an `aggrega.ai/<key>` annotation directly is rejected at publish time. The discipline prevents user-authored annotations from colliding with platform-emitted provenance.

Sub-domain prefixes under `<sub-domain>.aggrega.ai/` are the catalog-convention space. The standard library uses `component.aggrega.ai/type` (the cloud-native ontology label), `feature.aggrega.ai/kind` (the operational-vs-credential Feature partition), `compliance.aggrega.ai/*` (the compliance-axis labels), and similar scoped sub-namespaces. Each sub-domain is governed by a specific catalog audience: `component.aggrega.ai/*` by Component-entity authors, `feature.aggrega.ai/*` by Feature-entity authors, `compliance.aggrega.ai/*` by the compliance-policy audience. Cross-sub-domain reads (a Wasm plugin reading from multiple sub-namespaces) are permitted but rare; each plugin typically scopes itself to one sub-namespace.

Enterprise-domain prefixes (`acme.com/...`, `my-org.io/...`) are the platform-extension surface. The Aggrega compiler treats them as opaque metadata; enterprise Wasm plugins consume them. Enterprises author whatever prefix structure fits their governance — flat (`acme.com/owner: team-payments`), sub-domain (`security.acme.com/scope: pii`), or hierarchical (`org.acme.com/billing-center: finance`). The platform does not constrain enterprise prefix layout; the only rule is that enterprise prefixes do not collide with `aggrega.ai/` or its sub-domains.

The discipline matters because annotations cascade — labels authored on an Aggregate's subsystem propagate to every component in the subsystem; annotations on a Release boundary propagate to every component in the boundary. Without prefix discipline, an Aggregate-side annotation could silently override a platform-emitted provenance key, or an enterprise annotation could collide with a catalog-convention key. The prefix table makes the audiences explicit and the collision-prevention rule enforceable at publish time.

See [`language-reference/vocabulary/labels-and-annotations.md`](../language-reference/vocabulary/labels-and-annotations.md) for the per-entity annotation surface enumeration and the three-bucket cascade semantics (`.context.annotations.release` / `.context.annotations.catalog` / `.context.annotations.aggregate`).
