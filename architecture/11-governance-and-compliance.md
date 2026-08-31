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
To prevent a developer from bypassing the internal catalog and pulling a naked `core/postgres` component directly from the public hub, the enterprise registers a topological validation plugin. It is evaluated during static analysis — after the graph is assembled and before any artifact is rendered — which is why it sees the whole topology rather than one component at a time.

```rego
# Evaluated by the governance ir-verdict role over the assembled graph
package acme.governance

import rego.v1

deny contains msg if {
    some id, _ in input.graph.spec.nodes
    not input.graph.spec.values_mapping[id].owner
    msg := sprintf("node %v declares no owner; use a component that extends 'acme/corporate-baseline'.", [id])
}
```

A decision the policy collects under its deny key is a rejection, and the build halts on it.

**Forbidding free-form connections:**
A developer may wire an edge through a socket the catalog did not declare — an ad-hoc socket (see [dependency-resolution](07-dependency-resolution.md)). That openness is deliberate, and so is the fact that the compiler holds no opinion about it: an organisation that wants every connection to go through a socket its Architects declared expresses that as policy rather than relying on the compiler. Every edge in the graph carries `socket_declaration`, which reads `declared` or `ad-hoc`, so the rule is one line:

```rego
# Evaluated by the governance ir-verdict role over the assembled graph
package acme.governance

import rego.v1

deny contains msg if {
    some e in input.graph.spec.edges
    e.socket_declaration == "ad-hoc"
    msg := sprintf("%v connects to %v through the free-form socket %v; declare the socket in the component type's usesSchema.",
                   [e.source, e.target, e.socket])
}
```

The value is always present on every edge, whichever way the edge was authored, so a policy never has to read an absent field as "declared". And it is an axis of its own: it says where the socket came from, not who drew the edge, so it composes with `origin_feature` and `origin_release` rather than overlapping them — a policy can forbid free-form connections while still allowing the Release to wire declared ones.

**Centralized Enterprise Governance (Evaluating Complete Reality):**
Relying on out-of-band mechanisms (like `CODEOWNERS` on a git repository) to govern architecture is a weak workaround. All governance is localized in the compiler's governance verdict roles. Because the AOT compiler builds the IR Graph by flattening *both* the Developer's `Aggregate` and the Ops Engineer's `Release`, the policy engine evaluates the complete reality before physical artifacts are generated. Policies can fatally halt the build if a developer requests an unapproved Component, if Ops maps a component to an unapproved Recipe in the Manifest, or if an insecure Wasm mutation is attached to a Component carrying a `restricted` subsystem label.

### 2. The Wasm Mutator Gate (Dynamic Compliance)

Developers should not be forced to manually type environmental compliance tags (e.g., `environment: production` or `soc2_in_scope: true`) into their `Aggregate`, as these change depending on the GitOps target.

For dynamic metadata, enterprises utilize the **Mutation Gate — the governance socket's `label-transform` role**, which runs during topology construction. After the graph is expanded, and before static analysis evaluates it, the compiler executes the Wasm plugin the enterprise attached. That plugin reads the deployment's environment and the labels the nodes already declare, and names the labels the build's nodes should carry — so the required metadata reaches the component without the developer typing it (e.g., the label `compliance.aggrega.ai/data-class: restricted` decided from environment boundaries).

A policy at this role **names the label** — the node, the key, and the value it takes — rather than writing the edit instruction the build applies. The reason matters to whoever authors one: the instruction addresses a label by path, and an Aggrega label key routinely contains a `/`, which is the path separator, so a hand-written path would address a nested location instead of one label. The build addresses the label the decision names, and the labels-only projection this role receives puts its nodes one level shallower than a verdict over the whole graph.

```rego
# Evaluated by the governance label-transform role, during topology construction
package acme.tagging

import rego.v1

labels contains {"node": id, "key": "acme.com/soc2-scope", "value": "true"} if {
    input.compilation_context.environment == "production"
    some id, node in input.graph.nodes
    node.labels["component.aggrega.ai/type"] == "stateful-server"
}
```

Because these tags are injected into the standard metadata dictionary in-memory before rendering begins, Wasm rendering plugins can read them to conditionally generate specific physical configurations — hardened AWS or Kubernetes resources, for instance — as artifacts are rendered.

**Stating a rule once: governance attachments are workspace-scoped.**
The two patterns above are authored per component and per Feature, but the governance attachment that enforces them is not. A governance plugin is attached at the workspace configuration's `plugins.governance` key, and that attachment binds **every build in the workspace**. A corporate rule is therefore stated in exactly one place: the platform team attaches the plugin once, and no component, Aggregate or Release has to opt in, mention it, or be edited for it to apply. This is what makes the validation failsafe in pattern 1 a complete answer rather than a per-project convention — a developer who bypasses the internal catalog and requests a naked `core/postgres` is evaluated by the same attached policy as everyone else, because the policy is a property of the workspace rather than of the component they chose.

**A workspace rule rejects; it does not rewrite the developer's contract.**
The scope is universal, and the effect is deliberately limited to a verdict. A rule that applies everywhere halts a build that violates it, naming what to fix, and it cannot instead amend the offending component into compliance. That boundary is what keeps the mechanism debuggable at estate scale: a build either matches the rules the workspace declares or stops with a message pointing at the authored line, and rendered output never contains a constraint or a resource that no authored file asked for. Where an enterprise does want the graph changed rather than judged, it attaches a transform role — pattern 2 above — and that change is scoped to what the operator attached it to do, which is why it is an explicit act of the platform team rather than an invisible rewrite.

The practical consequence for a platform team closing the compliance circle: express the *shape* a payload must have as schema constraints on a corporate baseline, express the *cross-entity* rules the estate requires as an attached verdict role, and express *derived metadata* the developer should never type as an attached transform role. All three are declared once and apply to every build, and none of them requires the developer to know they exist.

### 3. Preserving Domain Intelligence (The Configurations & Safety)

Because the Aggrega compiler is mathematically unopinionated, it possesses zero hardcoded knowledge of AI frameworks, token budgets, or memory partitioning. Instead, the generic cloud-native schemas act as an empty vessel. Rather than being hardcoded into the compiler core, highly specialized domain intelligence is distributed across the entire extensible Aggrega ecosystem. It is encapsulated within the Platform Catalog through specialized `components`, `features`, and `recipes`. Developers preserve their specific application intent within their `values` and `uses` blocks — strictly governed by the Architect's `schema:` declarations (compact form or full JSON Schema 2020-12) — while the physical translation of that intelligence is executed by target-specific WebAssembly plugins.

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
* **The attached Feature's catalog annotations, verbatim.** The Feature entity's own `metadata.annotations`, carried on exactly the same terms as its labels — unfiltered, unnormalised, in the entity's declared order — so an annotation key in an author's own namespace arrives as authored. This is a different subject from the annotation that caused an annotation-expanded attachment to exist in the first place: the graph reports that origin separately, and an attachment written in a `features:` block carries the entity's annotations while reporting no expansion origin at all.
* **Which declared attachment slot it fills.** A `featuresSchema` slot is filled by attaching a Feature under the slot's name, so an attachment naming a slot its Component declares reports that slot's name, and one that fills none reports `free`. The value is the slot's name rather than a flag, because which binding point was filled is usually the more useful half of the answer.
* **Whether it handles material an author declared sensitive**, and which of its delivery keys carry that material. Both are derived from declarations — a `sensitive` leaf on a Feature's schema, a `sensitive` slot on the consuming Component — never from inspecting a value.
* **Its `values`, its `infra`, and its delivery mapping**, plus whether the attachment was written in a `features:` block or contributed by annotation-driven expansion.

An attachment's labels bind the compiler in exactly one place, and it is not a policy decision: a slot may declare a `selector`, and a fill whose labels do not satisfy it halts the build. Past that gate the labels steer nothing — how a value is routed and delivered is the same whichever labels a Feature carries. So a policy reading a label is reading metadata the compiler carried without interpreting, not second-guessing a branch inside it.

A Feature's catalog annotations bind it in no place at all: no compiler behaviour branches on them, and a slot declares no constraint over them the way it may over labels. They are carried and nothing else.

Four rules this makes writable, none of which the compiler makes for you:

* **Forbid free-form attachment.** An estate that requires every attachment to fill a declared binding point rejects any attachment reporting `free`. This is the counterpart of the attachment surface staying open: composition is free by default, and an operator who does not want it free says so.
* **Refuse by-value delivery of sensitive material.** Aggrega warns when a declared-sensitive datum travels through a delivery key as a literal, and never halts — the by-value credential family is deliberate. An operator who wants that warning to be a refusal expresses it here.
* **Decide for yourself what counts as a credential.** The standard library marks its credential Features with a family label, and reading that label is one way to reason about them. A broader or narrower predicate — an internal label, a naming rule, a set of approved types — is equally available, because the labels arrive rather than a verdict about them.
* **Gate on whatever your catalog records in its own metadata.** An estate that keeps review status, data residency or ownership as annotations on its Feature entities can require them of every attachment. A rule keyed on an annotation Aggrega has never heard of works exactly as well as one keyed on a key it ships, because the annotations arrive as authored — which also means a Feature and a Component are now judged on the same footing, each by the catalog metadata its own entity declares.

A verdict role accepts or rejects; it never rewrites. The build either proceeds unchanged or halts with the verdict's message, so a policy cannot quietly bring a non-compliant graph into compliance.

Attachment detail reaches a policy evaluating the **IR graph**. A policy evaluating **rendered artifacts** receives those artifacts and no graph, which is a property of that input rather than a restriction applied to it: the two stages answer different questions, and attachment topology is not among the questions rendered output can be asked.

## Expressing the estate's rules in a policy language

The patterns above describe what a governance attachment does; this section is about
what an enterprise writes to get it. A platform team with fifty rules to state does
not want fifty plugins. It wants its rules as *content* — files it reviews, versions
and ships like any other artifact — with one attached engine evaluating them.

That is what a policy-language engine attached to the socket provides, and two of them
ship inside the compiler for exactly this purpose: a Rego engine and a CEL engine. An
operator attaches one, declares the policy files it should load, and the rules run: no
external toolchain, nothing fetched at build time, and no policy logic in the compiler.
Evaluation happens inside the WebAssembly guest, which is where all domain intelligence
lives.

The same engine serves every governance role, so an estate covers its whole surface
with one attached plugin and several attachments of it:

* **Judging the architecture.** Attached over the build graph, a policy reads every
  node, edge and attachment the compiler holds, plus the routing paths enumerated
  alongside them, and reports what must stop the build. This is where a topology
  invariant, a cross-boundary authorisation rule, or a credential-flow rule lives.
* **Judging the output.** Attached over the rendered artifacts, a policy reads the
  files the build produced — as text, and as parsed documents where the format was
  parsed ahead of the policy — and reports on the concrete result.
* **Supplying derived metadata.** Attached to shape labels, a policy decides which
  labels the build's nodes carry, from the deployment's environment and from what the
  nodes already declare. This is the mechanism pattern 2 above describes, with the
  rule expressed as policy content rather than as a purpose-built plugin.
* **Adding a capability the developer did not type.** Attached to inject annotations,
  a policy adds annotations to the deployment's components; an annotation under a key
  the Manifest registers a binding for expands into a Feature attachment, so a
  corporate rule can supply the wrap a component needs rather than merely rejecting
  its absence.

A rule reads what the payload carries and reports its decision under a named key:

```rego
# Evaluated by a governance verdict role over the assembled graph
package acme.security

import rego.v1

deny contains msg if {
    some id, node in input.graph.spec.nodes
    node.labels["compliance.aggrega.ai/data-class"] == "restricted"
    not node.labels["acme.com/owner"]
    msg := sprintf("node %v holds restricted data and declares no owner.", [id])
}
```

**A policy's own vocabulary is preserved.** The severities the socket acts on are a
closed set, but the names a policy collects its decisions under belong to the policy.
The default names are the conventional ones a Rego corpus already uses, and an
operator whose policies name their decisions differently declares the mapping in the
attachment's settings — so an estate that already maintains a policy library adopts
the socket without rewriting it. The mapping is typed by the schema the plugin
declares for its settings, so a malformed one halts the build before any policy runs
rather than mis-routing a verdict.

**A whole policy library travels as one attachment.** A policy set can be attached
file by file, or as a single archive carrying its policy files and its data documents
together, which the guest opens. An archive that cannot be read is reported as such,
naming the file — never as a policy set that reached no decision, because "the
library was unreadable" must never be indistinguishable from "the library allowed the
build".

**An unevaluable policy stops the build.** When a policy cannot be evaluated, the
attachment fails and the build halts with a fault naming the plugin, deliberately
distinct from a verdict that stops the build. The two cases must not be confused,
and neither of them is an allow.

The full authoring surface — the payload each role exposes, the decision keys, the
mapping onto severities, and how an archive is attached — is in
[`language-reference/plugins/policy-socket.md`](../language-reference/plugins/policy-socket.md).

## Inheritance and publishing discipline

Inheritance via `extends:` is the catalog mechanism that lets Platform Architects build specialised child entities on top of shared baselines. The two catalog kinds part company on their data pillars. A Feature's parent and child schemas compose at workspace-load time, producing a unified schema with per-leaf provenance. An extending **Component** authors no pillar content: it writes the literal marker `schema: inherited` and receives its base's `schema:` block exactly as the base authored it, at every depth of a chain.

That is what settles the governance question a shared baseline raises — what constraints a child may declare relative to its base. For a Component the answer is structural rather than policed: the child's declared contract simply *is* the base's, so a base's constraint cannot be loosened, dropped or retyped by a child, and no publish-time check is needed to keep the baseline intact. A child that legitimately needs a *tighter* rule than its base declares expresses that as an added entry in its `assertions:` block, which composes alongside the base's rules rather than replacing them.

What a child Component does compose is **structure**: its attachment slots (`featuresSchema`), topology sockets (`usesSchema`), self-inject allowlist (`inject`) and named `assertions` all merge along the chain, with a redeclared entry replacing the base's outright.

### Rule placement: which rules live in the policy plugin vs the per-Component schema

The publishing-discipline plugin is the home for **cross-cutting rules that apply across the catalog**: supply-chain rules (e.g., "every Recipe must `implements:` a Component that exists in the catalog"), enterprise compliance rules (e.g., "every Component with `compliance.aggrega.ai/scope: pci-dss` must `extends:` the corporate pci baseline"). These rules cross multiple entities, evaluate the workspace as a unit, or enforce conventions at publish time rather than at build time.

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
