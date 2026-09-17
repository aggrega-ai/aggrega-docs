# AI Features

## The Aggrega AI Feature Set

To support the unique demands, volatility, and security threats of modern AI systems, Aggrega embeds specialized intelligence directly into its open-source **AI Standard Library (The Catalog)**. It ensures that both generic cloud-native scaffolding and highly specialized AI-native reasoning engines coexist securely.

The core Go compiler is a dumb universal router; all AI-specific intelligence lives in pluggable WebAssembly (Wasm) policies and the JSON Schema 2020-12 declarations Platform Architects author on Catalog entities.

### 1. The 7-Type Cloud Ontology & AI Duck-Typing

To bridge the generic Open Application Model (OAM) with the strict realities of modern infrastructure, the `component.aggrega.ai/type` label maps exclusively to **7 Universal Cloud-Native Primitives**. This semantic identity dictates precisely how the Wasm rendering plugins should treat state, network ingress, and lifecycles.

**The 7 Cloud-Native Types (The Infrastructure Base):**

* `server`: Long-running, stateless compute that *expects inbound application traffic* (e.g., an AI Gateway or a Chat UI).
* `worker`: Long-running, stateless compute that *pulls from queues or runs background loops* with zero inbound application ports (e.g., a LangGraph agent or Celery worker).
* `task`: Ephemeral compute that runs to completion and dies (e.g., DB migration scripts).
* `function`: Event-driven compute that scales to zero (e.g., AWS Lambda).
* `stateful-server`: In-cluster compute requiring stable network identities and permanent disks (e.g., a Qdrant vector database).
* `resource`: External, platform-managed infrastructure (e.g., AWS RDS PostgreSQL, S3 buckets).
* `messaging`: Event routing and decoupling glue (e.g., a Kafka topic, SQS queue).

See [entities/component](../language-reference/entities/component.md) for the Semantic Label Taxonomy tables — the Generic Cloud Layer, Specialized AI Layer, Cross-Cutters, and Dynamic Business Context labels Architects use to layer cognitive identity on top of the 7 base types.

---

#### 1.2 The Open-Source Catalog Standard: "Naked Base, Flavored Edges"

When applying these labels, there is a critical distinction between the **Official Aggrega Open-Source Catalog** (`core/*`) and a **Private Enterprise Catalog** (`acme/*`).

For the official open-source catalog to remain universally usable, it must strictly distinguish between **Immutable Technical Physics** and **Subjective Cognitive Intent**. If the general-purpose `core/datastore/postgres` is hardcoded with `engine: relational`, a governance verdict plugin configured to enforce datastore-type matching will halt the build when a developer enables the `pgvector` extension in their `values` and attempts to connect an AI Agent that requires a `vector` datastore.

To maintain an unopinionated core catalog, official components follow this standard: **Keep the Base Naked, and Flavor the Edges.**

1. **The Naked Base:** The root-level open-source `Component` hardcodes only what is objectively true of the product and cannot be changed by anything a deployment configures — first and always the 7-Type Primitive (`component.aggrega.ai/type`). A Postgres database is objectively a `stateful-server`; that fact cannot change. The same test admits a capability label where the product's identity *is* that capability: `core/datastore/qdrant` and `core/datastore/weaviate` are vector search engines and nothing a deployment writes makes them anything else, so each carries `datastore.aggrega.ai/engine: vector` on the base, exactly as `core/datastore/redis` carries `kv`. What the naked base refuses is the opposite case — a trait that depends on how a deployment is configured or used, which the third mechanism below exists for.
2. **The Flavored Interfaces (Schema Inheritance):** A Component may declare `extends`, naming another Component as its base, and what that composes is **structure**: labels, annotations, attachment slots, the self-inject allowlist, topology sockets and named `assertions`. The three data pillars do not compose — an extending Component writes the literal marker `schema: inherited` and authors no `values`, `infra` or `provides` content of its own, so its contract is its base's identically. That is why the mechanism **narrows rather than varies**: because the contract is unchanged, every Recipe written for the base already serves the specialization, and the specialization costs one catalog entity and one Manifest mapping line. What a specialization adds is therefore identity a selector or a policy reads — an audit tier, a data zone, a governance contact, or a socket whose selector admits less than the base's. It cannot add a different contract, because it has no surface on which to author one. One consequence is easy to miss: **the mapping line is still required.** Recipe selection is by exact mapping key, so a specialization needs its own `mappings.components.type` entry even though it needs no Recipe of its own. See [examples/extends-wrapper](../language-reference/examples/extends-wrapper/) for a published wrapper that adds a reviewed-tier label and narrows a socket on it, together with the build that halts when an edge wired into that socket leaves the tier. A trait that depends on how a deployment is configured is **not** this mechanism's subject: a specialization pins its base's artifact and inherits its contract, so a trait true of the specialization is already true of the base, where the Naked Base rule puts it. Such a trait belongs to the Dynamic Mutator below.
3. **The Dynamic Mutator (Wasm Promotion):** If a trait is dictated by the developer's payload (e.g., `enable_vector: true`), the enterprise uses the governance socket's `label-transform` role at topology construction to dynamically read the opaque `values` and automatically inject the `engine: vector` label into the IR Graph before policies run. This is where a configuration-dependent trait becomes available to strict policy evaluation — the developer's declared `values` are what promote it, and the transform runs before any policy reads a label.

**The Enterprise Exception:** Because the compiler is completely mathematically unopinionated, enterprises authoring their own internal catalogs are free to break this rule. If a corporate security policy dictates that *all* internal databases are highly sensitive, the Platform Architect can and should hardcode `compliance.aggrega.ai/data-class: restricted` (or a company dictated similar label) directly onto their `acme/postgres` base component to enforce maximum rigidity.

#### 1.3 How Semantic Labels Power the Compiler Pipeline

To enforce the Separation of Concerns, Developers are **strictly forbidden** from writing labels on their `Component` instances inside the `Aggregate`. Labels exist exclusively in the Platform Catalog. Here is exactly how these immutable labels drive the compilation pipeline without requiring custom Go code:

**1. `component.aggrega.ai/type` (The Base Primitive)**

* **Who writes it?** The Platform Architect (Domain 2). This is mandatory for every component in the catalog.
* **Who consumes it?** The Static Analyzer and Wasm Rendering Plugins.
* **Compiler Use Case:** This is the core 7-type cloud ontology. The Static Analyzer evaluates the `usesSchema` selector strings natively in Go to guarantee a Developer cannot attach an Agent to a standard Database if the socket requires a specific AI capability. Furthermore, DevOps uses this label to explicitly route stateful primitives (`stateful-server`, `resource`) into physical cluster boundaries that support persistent disks, while a governance verdict role can enforce that stateful components are never placed in ephemeral-only boundaries.

**2. `model.aggrega.ai/capability`**

* **Who writes it?** The Platform Architect.
* **Who consumes it?** The Static Analyzer (via JSON Schema 2020-12 `usesSchema` selectors).
* **Compiler Use Case:** When an Architect authors a `usesSchema` selector naming the required capability label, the compiler's native label-matching engine rejects wiring that does not satisfy the selector before artifacts are generated. The compiler treats these labels as opaque strings; the semantic meaning of "text-generation" vs "embedding" lives in the Architect's selector authoring.

**3. `component.aggrega.ai/hosting`**

* **Who writes it?** The Platform Architect.
* **Who consumes it?** The Policy Engine (a governance verdict role) and Wasm Rendering Plugins.
* **Compiler Use Case:** It records who operates the component's underlying resource, letting the policy engine calculate Data Exfiltration risk. When an Agent holding "Internal" data connects to a Model labeled `managed` — a service operated outside the deployment's own boundary — the policy evaluates that the data is leaving the corporate VPC, and can halt the build unless a data-masking feature is attached to the connection. This is a cross-cutting trait: the same `self-hosted | managed | external` values describe a managed database or a self-run inference server just as they describe a model, so the label lives under the shared `component.aggrega.ai/` namespace rather than the model-specific one.

**4. `agent.aggrega.ai/autonomy`**

* **Who writes it?** The Platform Architect.
* **Who consumes it?** The Policy Engine (a governance verdict role).
* **Compiler Use Case:** It identifies the execution risk of the cognitive loop. If an agent is labeled `autonomous` (meaning it runs background loops without user prompts) and connects to a highly sensitive database, the policy engine can halt the build unless an author attaches whatever approval or containment Feature the enterprise's own rules require, so an unattended loop cannot reach that data unreviewed.
* **What an unlabeled component means on this axis, because the absence is deliberate.** The label describes the execution risk of a cognitive loop, so a component that holds no loop of its own carries no value here rather than the lower of the two. A good many components in the agent category are unlabeled for exactly that reason: the supporting pieces an agent platform ships alongside its server — a browser console, a schema-migration run, a task worker, a code sandbox, an egress proxy — are in that category because it is where you look for them, while the loop they support lives in the platform's server, which is where the label sits. The clearest case is a single product split across both treatments: a platform's server carries `copilot`, and the code sandbox it ships beside it carries nothing. The test is where the loop lives rather than what shape the piece takes, so a runtime that hosts agent code *you* supply is also unlabeled — the loop there is whatever you deploy into it, not something the product asserts. A selector naming either value therefore matches the components that hold a loop and no others, and one written to match any autonomy posture skips the supporting pieces rather than treating them as the least autonomous thing in the deployment.

**5. `gateway.aggrega.ai/intelligence`**

* **Who writes it?** The Platform Architect.
* **Who consumes it?** The Static Analyzer, and enterprise-authored linter Wasm plugins.
* **Compiler Use Case:** It dictates what features a router can physically support. An AI `token-budget` Feature declares `appliesTo: gateway.aggrega.ai/intelligence=semantic`, and the Static Analyzer evaluates that selector against the target component's labels before any artifact is rendered. If a Developer attaches it to a standard `l4-mesh` gateway the build halts with a selector violation naming the Feature and the selector it failed, because the Architect authored that selector knowing a standard TCP mesh cannot parse LLM JSON payloads to count tokens. The refusal reads off the **absence** of `semantic` rather than the presence of `l4-mesh`, so it holds equally on a router that carries no intelligence label at all. The compiler treats the label as an opaque string, exactly as above: what `semantic` means lives in the Architect's selector authoring.
* **What the standard library carries today.** One component carries `semantic` — `core/gateway/litellm`, whose realization renders the proxy's routing table: a model map over several upstream providers, plus the strategy that picks between them — so the AI Features that require this value resolve against it. No component carries `l4-mesh`, and the standard library's other gateway components carry no intelligence label at all: the ones that route traffic terminate HTTP and route at layer 7, and one of them is a control plane that routes nothing at all, so neither value describes it. A layer-4 TCP mesh is a different product class again. That leaves the refusal above fully in force, because it reads off the absence of `semantic`: an attachment requiring that value halts on any of them. An Architect whose catalog does run a layer-4 mesh carries `l4-mesh` on that component, which makes the distinction selectable in both directions.

**6. `tool.aggrega.ai/impact`**

* **Who writes it?** The Platform Architect.
* **Who consumes it?** The Policy Engine and Wasm Rendering Plugins.
* **Compiler Use Case:** By moving this out of the developer's mutable `values` block and into the immutable label identity, it allows the policy engine to evaluate strict, least-privilege configurations. A rendering plugin might generate standard `invoke` permissions for a `read_only` web-search tool, but demand strict cryptographic signature configurations to invoke a `mutating` SQL-drop tool.

**7. `compliance.aggrega.ai/data-class`**

* **Who writes it?** The Platform Architect (or dynamically injected via the governance `label-transform` role).
* **Who consumes it?** The Policy Engine (a governance verdict role).
* **Compiler Use Case:** Acts as the cornerstone for Zero-Trust data-plane rules. By tracking this label across the flat IR graph, policies evaluate whether an agent holding `restricted` enterprise data is illegally passing payloads into a `public` tool socket.

**8. `hardware.aggrega.ai/accelerator`**

* **Who writes it?** The Platform Architect. When packaging a local model component, they know it fundamentally requires a GPU to function.
* **Who consumes it?** DevOps (Domain 4).
* **Compiler Use Case:** DevOps explicitly routes GPU-labeled components into physical hardware pool boundaries in the `Release` via the `components: {}` map. The Developer simply asks for the cognitive model in their `Aggregate`, and DevOps places it into the expensive GPU cluster boundary, entirely preserving the Separation of Concerns. A governance verdict role can additionally enforce that any component carrying this label is never placed in a boundary lacking GPU infrastructure.

**9. `datastore.aggrega.ai/engine`**

* **Who writes it?** The Platform Architect, on datastore-category components (statically, on a flavored specialization, or injected by the `label-transform` role when developer `values` promote the role). The value set is stabilizing against the populated catalog: `relational`, `document`, `kv`, `vector`, `graph`, `semantic-memory`. Each value names a storage engine a product *is*, so a trait that lives in an application's own schema and access pattern rather than in any deployable store is not a value on this axis.
* **Who consumes it?** The Static Analyzer (via selector strings) and the Policy Engine.
* **Compiler Use Case:** Selectors target storage semantics rather than products — an agent's knowledge-base socket selects `datastore.aggrega.ai/engine in (vector, semantic-memory)`, and a policy engine can refuse SQL payload routing to a vector engine. AI-relevance across dual-use datastores is derived from this label, never stored as a separate boolean.
* **What the standard library carries today.** Two components carry `vector` — `core/datastore/qdrant` and `core/datastore/weaviate` — and one carries `semantic-memory`, `core/datastore/cognee`, so the knowledge-base selector above resolves against any of the three. Three components carry `kv`: `core/datastore/redis`, `core/datastore/valkey` and `core/datastore/memcached`. Every one of these labels sits on the component's own base, because the product's identity is that engine. `relational`, `document` and `graph` have no standard-library carrier, so a selector naming one of them matches nothing here and is satisfied by a catalog that carries it.

**10. `pipeline.aggrega.ai/mode`**

* **Who writes it?** The Platform Architect, on pipeline-category components. The value set is stabilizing against the populated catalog: `streaming`, `batch`, `multimodal-rag`, `document-chunking`.
* **Who consumes it?** The Policy Engine and Wasm Rendering Plugins.
* **Compiler Use Case:** Lets policies and renderers distinguish continuous stream consumers from run-to-completion batches — a streaming pipeline routes into long-running compute with backpressure configuration, while a batch pipeline gets job semantics with completion deadlines.

### 2. Port Abstraction (The Zero-Port Convention)

The open-source Aggrega standard-library catalog recommends omitting physical port declarations from Components' cognitive layer, routing port selection through the Ops Recipe instead. Authors following this recommendation avoid port collisions across deployment targets, prevent backdoor APIs that bypass the Injection
Contract, and keep network topography flexible across providers. The compiler itself is blind to ports — it pipes whatever values the resolved JSON Schema permits. The
convention operates with an explicit escape hatch for legacy systems whose physical ports cannot move.

* **The Cloud-Native Default (Dynamic Injection):** For modern workloads,
  Components omit physical ports entirely (no `ports` or `expose` arrays) from their `schema:` declaration. Platform Ops Recipes dynamically assign the internal TCP/UDP
  port and inject it into downstream consumers via the `.context.uses` Injection Contract as a named `provides` key.
* **The Legacy Escape Hatch (Explicit Declaration):** When a legacy component has an unchangeable, hardcoded port, the Platform Architect explicitly exposes
  a `port` field within the Component's `schema:` declaration. This gives the Developer a validated way to declare the physical constraint. The compiler carries the
  value through the pipeline unchanged; the Recipe consumes it via `{{ .values.port }}`.
* **Operational Ports (Out-of-Band):** Ports used strictly by cluster infrastructure (e.g., Prometheus scraping, Envoy sidecar metrics) remain hidden from the Developer's cognitive layer. They are injected out-of-band by Platform Ops via **Features** (e.g., attaching a `metrics-exporter` Feature).

### 3. Domain-Specific Schemas (Configuration Intelligence)

The developer's `values` blocks (which are opaque to the Go compiler but strictly typed by the Component's `schema:` declaration) are validated to support explicit AI workflows:

* **Agent Links (Dependency Arrays):** While standard variables belong in `values`, the `uses` pillar natively supports arrays for defining topological relationships like `tools_allowed` and `agents_allowed`.
* **Deep Cognitive Memory Partitioning (CoALA):** Replaces flat memory buckets with structured `cognitive_memory` dictionaries inside the `uses` pillar. By mapping Semantic, Episodic, and Procedural memory to distinct infrastructure targets as explicit topological edges, policy engines can evaluate and mandate granular access guardrails (e.g., ensuring an agent can read Semantic memory, but cannot overwrite it if hijacked).
* **Multimodal Pipelines:** Supports declarative data flows through explicit execution stages such as `document_chunking`, `embedding_generation`, and `storage_routing`.

### 4. Gateway Intelligence & Routing

The Intermediate Representation (IR) graph and gateway components are uniquely tailored to handle the volatility and cost of LLM APIs:

* **Dynamic Routing:** Utilizes `semantic_routing` logic for condition-based routing.
* **AI API Resilience & FinOps:** Employs `fallback_chain` arrays for cross-provider failovers, `retry_policy` configurations for handling transient 429/500 errors, and `token_budget` to enforce hard cost and token usage limits per tenant or agent.
* **Local Model Protection:** Utilizes `concurrency_limit` to configure a strict load-shedding queue, protecting GPU-bound local models from crashing due to Out-Of-Memory (OOM) errors during traffic spikes.
* **Response Validation & Evals:** Natively supports configuration for `response_validation` (to filter output toxicity) and `traffic_shadowing` (to duplicate live requests out-of-band for safe model evaluations).

### 5. Asynchronous Execution & HITL Infrastructure

Aggrega treats human-interactive frameworks (like AutoGen and LangGraph) as blackbox worker nodes. To support "sleeping" agents waiting for human input without losing state, **Platform Architects can author Component `schema:` declarations** that strictly enforce the explicit binding of datastore-category components to these agents, selected by the datastore engine label — `datastore.aggrega.ai/engine in (vector, semantic-memory)` for a store the agent retrieves from by similarity, or `datastore.aggrega.ai/engine: kv` for one it checkpoints its run state into. The socket binds on the engine label rather than on a product name, so an author chooses which store arrives and the declaration still holds. Furthermore, for human-to-agent feedback loops (e.g., Slack integrations), a governance verdict role can be configured to reject the architecture unless an explicitly declared Gateway component is attached, guaranteeing secure ingress boundaries for callback webhooks.

### 6. Topological Security Validation & Runtime Enforcement

Because AI workloads introduce novel attack vectors (like prompt injection and autonomous data exfiltration), securing them requires bridging static architectural governance with active runtime enforcement. As an Ahead-of-Time (AOT) compiler, Aggrega does not intercept live network traffic or evaluate AI prompts. Instead, it solves complex security requirements through a two-part architectural handshake: **Static Architecture Compilation** (Compile-Time) and **Execution Handoff** (Deploy-Time).

#### A. Compile-Time: Policy Validation & Artifact Generation

The compiler constructs a flat Intermediate Representation (IR) graph containing all nodes, edges, and attached Features. Before any physical infrastructure is generated, the enterprise's security posture is enforced by evaluating this static JSON graph against industry-standard policy engines at a governance verdict role.

Because the socket evaluates generic JSON data, it is not locked into a single policy language. Enterprises can compile and enforce their architectural rules using the standard that best fits their ecosystem:

* **Open Policy Agent (OPA/Rego):** The industry standard for evaluating complex, multi-hop graph relationships and calculating least-privilege access across distributed topologies.
* **Kyverno (CLI):** Natively supports evaluating static JSON/YAML manifests, allowing teams to write policies in native YAML rather than learning Rego.
* **Custom Rust/TypeScript Validation:** Security teams can write bespoke organizational policies in standard languages and compile them to Wasm to act as the validation gate.

Once the policy engine validates the graph, the compiler translates those abstract security requirements into physical configuration. When a developer attaches a security feature (like `data_masking`) to an agent, the Aggrega Go compiler executes an isolated WebAssembly (Wasm) plugin. That plugin configures the exact proxy logic needed, outputting a static artifact (e.g., a Kubernetes `EnvoyFilter` or an Istio `AuthorizationPolicy`) perfectly tuned to the developer's request.

#### B. Deploy-Time & Runtime: Execution Handoff & Enforcement

Aggrega's responsibility ends the exact moment it finishes processing the input and writes the configured static artifacts to the output directory. It is a pure compiler: it writes the configuration, and then control returns entirely to whatever system invoked it.

How those configurations are executed is highly flexible and completely up to the enterprise:

* **The Artifact Handoff (Deploy-Time):** External deployment controllers take over to push the artifacts into reality. This *could* be a strict GitOps controller (like ArgoCD or Flux) syncing files into a Kubernetes cluster, but it could just as easily be a standard CI/CD pipeline executing `terraform apply`, or a developer running a local shell script against Docker Compose.
* **Runtime Enforcement:** Once the configurations are applied to the target environment, the physical infrastructure takes over. The specialized tools configured by Aggrega (such as a Lakera Guard sidecar, an active service mesh, or native cloud firewalls) boot up and begin their active work: physically intercepting payloads, verifying JWTs, or dropping malicious prompt injections.

### 7. How Aggrega Solves AI Security Challenges

By decoupling architectural validation from runtime execution, Platform Teams can use Aggrega to explicitly model, validate, and generate configuration solutions to the most critical AI vulnerabilities.

#### A. Data Exfiltration & Payload Interception

* **The Problem:** An autonomous agent might attempt to leak restricted enterprise data to an unauthorized external API.
* **The Aggrega Solution:**
  1. **Compile-Time (Validation & Generation):** The Platform Team authors a policy (e.g., Rego) evaluated at a governance verdict role stating: *"If an edge connects an internal node to an external node, the source node must have a Feature attached with the label `security: data_masking`."* If missing, the compiler halts. If present, the compiler executes a Wasm plugin to output the specific sidecar configuration (e.g., a Lakera Guard `EnvoyFilter`).
  2. **Runtime (Physical Enforcement):** Once the orchestrator deploys the generated artifacts, the active sidecar physically intercepts and redacts the outbound payload before it leaves the cluster.

#### B. Defending Against MCP Poisoning (Trust & Isolation)

* **The Problem:** If an agent is compromised via a poisoned Model Context Protocol (MCP) tool, it may autonomously execute destructive actions (like dropping a database or authorizing a transfer).
* **The Aggrega Solution:**
  1. **Compile-Time (Validation & Generation):** The developer attaches a `human_approval_gate` Feature to the sensitive tool in their `Aggregate.yaml`. The compiler validates the graph and translates this Feature into the configuration for an L7 proxy or webhook gateway.
  2. **Runtime (Physical Enforcement):** When the hijacked agent attempts to invoke the tool, the deployed proxy pauses the request and physically blocks execution until a cryptographically signed approval is received from a human operator.

#### C. Solving the "Confused Deputy" (Context Propagation)

* **The Problem:** In multi-agent chains, a public-facing agent might be hijacked and command an internal, highly privileged agent to fetch sensitive data. Standard firewalls only see that "Agent A is talking to Agent B" and allow the traffic, completely losing the context of the original malicious user.
* **The Aggrega Solution:** Enterprises can layer two specific patterns:
  1. **Cryptographic Context Propagation:** The developer attaches an identity-verification Feature to the internal agent. At **compile-time**, a Wasm plugin generates the required Service Mesh configuration (e.g., an Istio JWT `AuthorizationPolicy`). At **runtime**, the mesh physically rejects any request at the internal agent's ingress that lacks a trace ID or signed token proving the original user's intent.
  2. **The Semantic Edge Firewall:** The developer attaches a payload-inspection Feature. At **compile-time**, a Wasm plugin generates a sidecar proxy configuration (e.g., NeMo Guardrails). At **runtime**, this proxy intercepts the request between the two agents, evaluates the prompt against corporate exfiltration policies, and drops the connection if a Confused Deputy attack is detected.

#### D. Topological Risk Analysis

* **The Problem:** Complex AI architectures with dozens of interconnected models, vectors, and tools are too massive for a human to manually audit for transitive vulnerabilities (e.g., "Can Agent A talk to Tool B, which talks to Agent C, which has access to Database D?").
* **The Aggrega Solution:** This is the ultimate Ahead-of-Time failsafe. Because Aggrega builds a complete IR graph of the intended topology in memory, a governance verdict role can run advanced pathfinding rules across the entire architecture. If the policy detects a continuous, transitive chain of edges originating from a public node and terminating at a highly sensitive database without a masking proxy anywhere in the path, it immediately halts the build. The insecure architecture is blocked before a single line of infrastructure code is ever generated.

### 8. Observability & Compliance

To satisfy stringent regulatory requirements (e.g., the EU AI Act), **Platform Architects can utilize Aggrega's feature system** to enforce AI observability as a structural infrastructure requirement rather than relying on application code:

* **Audit Logging:** Enterprise-authored Wasm plugins can configure gateway sidecars to asynchronously stream raw, unredacted prompts and responses to a secure WORM (Write Once, Read Many) storage bucket, bypassing standard application logs.
* **LLM Tracing:** Proxy features can configure the data-plane to extract and forward AI-specific OpenTelemetry span headers, ensuring complex agent reasoning loops can be visualized in external tools.

### 9. Feature Compatibility & Topological Safety

Because the core compiler is blind to physical infrastructure mechanics, it relies entirely on explicit declarations from Platform Ops to prevent the generation of incompatible configurations.

* **`conflictsWith`:** An array defined within a Feature's Catalog schema that lists mutually exclusive capabilities. A dedicated linter Wasm plugin cross-references the list of features a developer attached to a given component in the `Aggregate`. If an intersection occurs (i.e., a developer attempts to attach two features that Ops has explicitly declared incompatible), the compilation halts before rendering any physical artifacts. Feature atomicity and purity are enforced as a social contract and validated via these custom Wasm linting rules.

### 10. Dynamic Topology Mapping (Dependency Resolution)

To build the IR graph without hardcoded orchestrator rules, the compiler uses a three-tiered pattern:

* **AST Variable Interpolation:** Developers intuitively link components within their `values` definitions (e.g., referencing a database map ID).
* **Dynamic Schema Extension:** The Component's `schema:` declaration restricts `uses` and enforces that inputs are valid component references.
* **Cross-Node Type Safety:** The `usesSchema` selector strings act as explicit out-of-band instructions, evaluated natively by the Go compiler's label-matching engine during static analysis. They guarantee that developers cannot accidentally wire standard components into a **declared** socket that requires a specific AI-native capability or compliance label. The guarantee is scoped to declared sockets by construction: a selector lives in a `usesSchema` entry, so an ad-hoc socket has none to evaluate. Each edge records whether its socket was catalog-declared, so an operator who needs the guarantee to be total can require it as a governance verdict.

### 11. Automated Design of Agentic Systems (ADAS)

Advanced AI systems feature Meta-Agents that write code to invent and deploy new agents on the fly. Because Aggrega requires an ahead-of-time (AOT) static architecture, it solves runtime infrastructure evolution through two explicit boundaries:

* **The Pre-Provisioned Sandbox Boundary:** For ephemeral tools invented at runtime, the Architect defines a feature (e.g., `dynamic-execution-environment`). When attached, the Wasm rendering plugin generates the configuration to provision a locked-down compute pool (like a WebAssembly runtime). The Meta-Agent injects new code into this sandbox, but its blast radius is permanently clamped by the generated static network policies.
* **The Meta-Agent as the "Developer" Role (The GitOps Loop):** If the Meta-Agent needs genuine new physical infrastructure, it acts as a Developer. It writes a new `Aggregate.yaml` and commits it to Git. This triggers the standard CI/CD pipeline. A governance verdict role statically analyzes the AI's requested topology, safely halting the deployment if the AI hallucinated a vulnerability.

### 12. Model Serialization & Supply Chain Security

Deploying an open-source model often means downloading opaque `.pkl` or `.gguf` files that can contain malicious code payloads. **Enterprises can treat** model supply chain security as a deployment configuration problem. By defining a `model_provenance` feature in the Catalog, an enterprise's Wasm rendering plugin can evaluate the configuration and translate it into runtime artifacts (like Kubernetes Kyverno policies), guaranteeing the target cluster is configured to block the orchestrator from pulling unsigned or unverified model weights.
