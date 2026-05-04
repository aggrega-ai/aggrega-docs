# Data Taxonomy and Composition

## Part 6: The Unified Data Taxonomy & Composition Rules

To establish a predictable schema and eliminate cognitive friction, the platform utilizes exactly five universally understood keywords and a strictly Map-based (Dictionary) YAML structure, replacing disjointed terminology and deeply nested arrays.

### 1. The 5-Keyword Map Standard & Total Schema Symmetry

**The Direct Structural Vocabulary:** A fundamental rule of the schema design is that root data structures must be single, structural keywords. While utilizing conversational English phrases (like depends_on or runs_within) can make a YAML DSL read more naturally to a developer, it introduces structural complexity when mapping those keys into programmatic Go templates. To maintain a direct 1:1 variable mapping and prevent Domain Specific Language (DSL) fragmentation, the JSON schemas of the core catalog entities (`Component`, `Feature`) express a near-total structural symmetry, driven by the same core set of structural keywords used across authored instance slots. Credential Features (labeled `feature.aggrega.ai/kind: secret`) share this identical paradigm — there is no separate schema for secrets.

* **`parameters` (The Global Environment Contract)**
  * **Scope:** Defined at the root of the `Aggregate`; fulfilled by the `Release` (CI/CD) natively or via the external `parametersFrom` array.
  * **Meaning:** External arguments that dynamically alter the cognitive or logical state of the application across environments (e.g., changing `workers: 2` to `workers: 10`). Supports an optional **typed contract** (see [data-pillars](../language-reference/vocabulary/data-pillars.md) for the full typed-contract syntax) validated before interpolation. For GitOps workflows, Ops can point to external parameter files via `parametersFrom`; the compiler fetches the file and deep-merges it into the in-memory parameter map.
* **`values` (The Cognitive Intent - Developer Owned)**
  * **Scope:** Used uniformly inside `components`, `features`, and `secrets` within the `Aggregate`.
  * **Meaning:** The core cognitive state, business logic, and operational configuration. Mathematically opaque to the Go compiler but strictly validated by the Catalog's unified `cueSchema`.
* **`uses` (The Structural Topology - Declarative State)**
  * **Scope:** Used uniformly inside `components`, `features`, and `secrets` within the `Aggregate`.
  * **Meaning:** A declarative statement of fact defining network edges and dependencies (e.g., "This agent *uses* this database"). Parsed natively by the Go compiler to draw the Intermediate Representation (IR) graph. Validated by the Catalog's unified `cueSchema` to enforce cross-node type safety.
* **`infra` (The Physical Reality - Ops Owned)**
  * **Scope:** Used uniformly inside `components`, `features`, and `secrets` within the `Release`.
  * **Meaning:** The physical footprint and mechanical sizing injected during Late Binding (e.g., `cpu_limit: "4"`, `port: 5432`). The Aggregate's `component_instance` / `feature` / `secret` slots do not include an `infra` field and, combined with `additionalProperties: false`, reject `infra` at schema validation. Validated by the Catalog's unified `cueSchema`.
* **`inject` (The Delivery Contract - Imperative Command)**
  * **Scope:** Used strictly inside explicit target definitions within `uses`, attached `features`, and `secrets`.
  * **Meaning:** An explicit, imperative command dictating the *intent* of the delivery (e.g., "Compiler, *inject* this mapped value as an environment variable"). It establishes the abstract contract (`env`, `file`, `arg`, or custom mechanisms) for a physical output, a resolved endpoint, or a retrieved credential, while the physical mechanics of exactly *how* that mount is executed are delegated entirely to the underlying Ops Recipe. Supports two equivalent syntaxes: a compact map form (`{ API_HOST: "host" }`) and a verbose array form (`[{ in: API_HOST, from: "host" }]`). Both normalize to `map[string]string` internally. See [topology-triad](../language-reference/vocabulary/topology-triad.md) for the full injection-contract syntax.
* **`.context` (The Generic Metadata Pipe)**
  * **Scope:** Injected silently by the Compiler into the Ops `Recipe` templates.
  * **Meaning:** Contains the universally resolved deployment realities (like `.context.uses`) passed directly to the Ops templating engine.

#### The 1:1 Mapping Reality

By replacing conversational prepositions with strict infrastructure keywords, this achieves perfect 1:1 mapping. The Ops engineer doesn't have to translate grammar; they just reference the exact keys the developer wrote.

**Structural shapes: maps at the root, arrays in payloads.** Root topology blocks — `components`, `features`, `secrets`, `aggregates`, `subsystems`, `boundaries` — are YAML maps with user-authored keys serving as stable instance IDs. Arrays are not valid at these positions; the map key is the identity the compiler uses for cross-references (`target: my-db`), graph-node construction, and Manifest resolution. Inside the opaque payload blocks (`values`, `infra`, `parameters`), arrays are fully permitted — developers can write `tools_allowed: ["sql", "web"]` or `hostnames: ["stripe.com", "twilio.com"]` inside a Component's `values`. The Aggregate schema declares these payload blocks as `additionalProperties: true`, so they are opaque to the Go compiler and validated entirely by the Catalog's embedded `cueSchema`. This places framework volatility (new AI API shapes, new cloud-native payload formats) inside the Catalog Domain where it can evolve independently, while the Go compiler stays addressable-keys-only at the structural root.

### 2. The Information Flows: Who, When, and For What?

To prevent template namespace collisions and the unintended leaking of physical infrastructure configurations into the cognitive application logic, the architecture explicitly separates data into six distinct streams:

* **Flow 1: The Environmental Injection (`parameters`):** The CI/CD Pipeline injects deployment realities. The compiler interpolates these Go template variables *before* running CUE validation.
  * **Recommended usage:** `parameters` are reserved for cognitive application logic that varies between environments (e.g., `LOG_LEVEL=debug`, `ENABLE_BETA=true`). Operational sizing and physical infrastructure concerns — replicas, CPU limits, AWS ARNs, ingress hostnames — flow through the `Release`'s `infra` block and boundary overlays, keeping the Developer's `Aggregate` focused on application intent.
  * **Pragmatic escape hatch:** For smaller teams, rapid prototyping, or legacy CI/CD integrations where strict separation is not practical, `parameters` can carry global environment configurations through the stack. The compiler accepts whatever passes schema validation; the recommendation above is a social contract, not a compiler rule.
* **Flow 2: Cognitive Application Intent (`values` in Components):** Defines the intrinsic application logic. The Component's CUE schema provides strict type-checking and validation for this payload, providing immediate "Shift-Left" feedback to developers and ensuring the requested configurations perfectly match the underlying infrastructure API.
* **Flow 3: Operational Feature Intent (`values` in Features/Secrets):** Requests infrastructure capabilities or queries strictly typed credentials without modifying the internal code.
* **Flow 4: Physical Infrastructure Sizing (`infra`):** Bypassing the Developer entirely, physical `infra` sizing is explicitly projected from the environment-specific `Release` directly onto locally-scoped Components and their attached Features/Secrets. To avoid closed-CUE validation collisions from blindly broadcasting dictionaries, `infra` sizing is strictly localized to the explicit component targeting it. This guarantees True Separation of Concerns by placing compute limits, replicas, and mechanical resource requirements strictly in the Ops domain.
* **Flow 5: Cascading Annotations (Contextual Metadata):** Broad contextual data (like operational domains, namespaces, or billing codes) is handled via Cascading Annotations, preventing `infra` broadcasting pollution. These are explicitly segregated into memory buckets based on their origin to enforce strict consumption rules:
  * **`.context.annotations.release` (Domain 4 Boundaries):** Used exclusively to govern physical realities. Ops explicitly routes these annotations into strict local `infra` fields via Go templates (e.g., mapping a regional namespace to a compute component).
  * **`.context.annotations.aggregate` (Domain 1 Subsystems):** Used exclusively to govern cognitive and operational logic. These annotations are explicitly routed into the component's `values` payloads (e.g., cascading a team billing code down to an application configuration).
  * **`.context.annotations.catalog` (Domain 2 Catalog):** Immutable intrinsic traits authored by the Architect, used primarily for programmatic Wasm policy evaluation.
* **Flow 6: The Metadata Pipe (`.context`):** Applies global enterprise requirements (SOC2 tags) directly to the physical infrastructure templates.

### 3. Network Abstraction: The "Zero-Port" Convention

* **The Best Practice:** Developers should omit ports from the `Aggregate`. The Ops Recipe handles internal routing dynamically.
* **The Escape Hatch:** If an application's internal code *cannot* be changed, the Platform Architect explicitly exposes an `port` field in the CUE schema.
**Architectural Note:** The "Zero-Port" convention is the most prominent example of the platform's broader **Separation of Concerns**. This exact same philosophy—abstracting the physical mechanics away from the developer—applies to CPU requests, memory limits, operational domains, and disk sizing. Whenever a physical infrastructure constraint *must* leak into the developer's application payload (due to legacy code or strict hardware requirements), it must always be governed by an explicit "Escape Hatch" in the Architect's CUE schema, rather than breaking the core compiler rules.

**The CUE Schema (Domain 2):**

```cue
values: {
    image: string
    // The architect explicitly allows the developer to declare a hardcoded constraint
    port?: int & >=1024 & <=65535 
}
```

**The Developer YAML (Domain 1):**

```yaml
components:
  legacy-payment-engine:
    type: core/java-tomcat:1.0.0
    values:
      image: "corp/payments:v4"
      port: 8080 # The infrastructure must adapt to the app, not vice versa
```

**Compiler Behavior:** The Go compiler passes `port: 8080` into the IR graph. The Ops Recipe then reads `{{ .values.port }}` to configure the Kubernetes `TargetPort` or AWS Target Group, successfully bridging the legacy gap without violating the schema.

### 4. The Injection Contract & Pre-Resolved Map

The `inject` mechanism is the strict delivery contract mapping data into a target's physical destination. See [topology-triad](../language-reference/vocabulary/topology-triad.md) for the full Injection Contract specification, including dual-state context semantics, compact vs. verbose syntax, key-collision rules, and worked examples.

### 5. The Templating Engine (Ops DX)

Platform Ops engineers author the translation templates and require the full power of standard infrastructure templating without proprietary roadblocks. Aggrega delivers a frictionless Go `text/template` experience:

* **No "Magic" Strings:** The compiler preserves the Developer's exact map keys. Ops accesses features safely via standard Go map indexing: `{{ (index .features "public-route").values.hostname }}`.
* **The Sprig Library:** The compiler natively registers the Helm-standard Sprig library, providing immediate access to pipelines like `| default`, `| quote`, and `| toYaml`.
* **Native `.tpl` Helpers:** Ops writes standard `.tpl` files (e.g., `helpers/labels.tpl`). The Aggrega Go compiler natively parses the `helpers/` directory via `template.ParseGlob` before rendering, providing full IDE syntax highlighting and standard Helm-like `{{ include "macro" . }}` capabilities.

### 6. Rules of Composition: Aggregates, Subsystems, and Components

* **Logical Grouping (The `subsystems` Array):** Developers can apply logical metadata (team ownership, compliance labels) and cross-cutting features across dozens of components simultaneously using `subsystems`. Subsystems act as recursive folders on the logical/intent plane, cascading `annotations` downward into the `.context.annotations.aggregate` bucket and **attaching features to all contained components** without dictating physical boundaries. Subsystem-level features follow the same schema as component-level features (supporting `type`, `values`, `uses`, `inject`) because they are in Domain 1 (Developer Intent). The compiler flattens subsystem features into each contained component's feature list during Step 3 (Graph Finalization), positioned after the component's own features and before any Release-attached features in the execution order.

```yaml
# aggregate.yaml
subsystems:
  finance-module:
    annotations:
      "billing.corp.com/team": "payments"
    features:
      audit-logging:
        type: core/audit-logger:1.0.0
        values: { log_level: "verbose" }
    components:
      ledger-api:
        type: core/python-worker:1.0
      ledger-db:
        type: core/postgres:1.0
```

* **Composite Aggregates are SUPPORTED (The Module Pattern):** Aggregates act as both the root application and reusable modules. A parent Aggregate can declare a child Aggregate exactly like a component, passing `parameters` down into it. To prevent tight coupling, child Aggregates expose an **`exportedComponents:`** contract, establishing a stable public interface name. The parent requests this interface, and the Go compiler dynamically rewires the topological edge to the correct internal node.

```yaml
# child-database-module.yaml
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: child-database-module
  version: 1.0.0
spec:
  components:
    internal-pg-primary:
      type: core/postgres:1.0.0
      
  exportedComponents:
    # The Public Contract (Written once by the module author)
    primary_db: "internal-pg-primary" 
```

```yaml
# parent-app.yaml
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: parent-app
  version: 1.0.0
spec:
  aggregates:
    finance-db-subsystem:
      type: my-catalog/child-database-module:1.0.0

  components:
    billing-api:
      type: core/python-worker:1.0.0
      uses:
        databases:
          - finance-db-subsystem.primary_db
```

* **Components cannot contain sub-components:** Components are atomic building blocks. Composition happens at the Aggregate level through subsystems and sub-aggregates. If an application requires multiple physical containers (like an API + a sidecar), that physical nesting lives inside the Ops Recipe template, not the Component definition.

### 7. Optional Top-Level Structures & The Implicit Default

Both `subsystems` (in the Aggregate) and `boundaries` (in the Release) are optional top-level structures. For simple, flat architectures that don't require logical grouping or multi-boundary deployment, the compiler silently creates an implicit `default` container.

* **Flat Aggregate (No Subsystems):** If the developer declares components at the top-level `spec.components` without any `subsystems`, the compiler wraps all components in an implicit `default` subsystem. Annotations and subsystem-level features are not applicable in this case — the developer can always add explicit subsystems later as the architecture grows.
* **Flat Release (No Boundaries):** If the Release omits the `boundaries` block entirely, the compiler creates an implicit `default` boundary containing all components. Output goes to `dist/default/`. This supports the simplest use case: a developer running `aggrega build --release local.yaml` for a flat Docker Compose deployment without needing to understand boundaries.
* **The Upgrade Path:** When an architecture outgrows the flat model (e.g., components need different namespaces, or teams need separate logical groupings), the developer simply adds explicit `subsystems` or Ops adds explicit `boundaries`. The compiler transitions seamlessly — no breaking changes to the Aggregate or existing features.

The reasoning: requiring mandatory top-level structures for trivial use cases (a single-service demo, a quick local prototype) creates unnecessary friction. The "10-minute zero-to-working" onboarding test demands that a developer can write a minimal Aggregate with one component, one Manifest, and one Release and get a working output without understanding subsystems or boundaries.

### 8. Architectural Constraints and Recommended Patterns

The compiler and the core schemas enforce the following structural rules.

* **Recommended pattern: Parameter Hoisting via Template Strings**
  * **Example:** Developer writes `workers: "{{ .parameters.env_workers }}"` in their `values` block.
  * **Why:** If the Aggregate declares `env_workers` as a typed parameter (`type: int`), the compiler first validates the Release-provided value against the type constraint. Parameter interpolation happens *before* CUE validation, preserving the reusability of the Aggregate. Ops injects the integer via the `Release` parameters, the compiler validates it, interpolates it, and the Component's CUE schema successfully validates the resulting integer.

* **Constraint 1: Strict Credential Scoping**
  * **Unsupported pattern:** Developer writes `values: { password: "123" }` under a `secrets` block.
  * **Why:** The schema requires strictly typed credential Features mapped to the component. Secrets must reference a credential Feature `type` (labeled `feature.aggrega.ai/kind: secret`) and use `values` to query an external vault. The compiler enforces the partition: only credential-labeled Features are accepted in the `secrets:` block.

* **Constraint 2: Target-Agnostic Components**
  * **Unsupported pattern:** Architect writes `aws_instance_type: string` in `api-server.cue`.
  * **Why:** Components are target-agnostic by convention. Physical hardware targets live in Ops Recipes or generic `.context` annotations, not inside the core cognitive application logic.

* **Constraint 3: Conditional Logic on Metadata**
  * **Unsupported pattern:** Ops writes `{{ if eq .context.labels.gpu "true" }}` in a `Recipe` to fundamentally change the deployment strategy.
  * **Why:** The `.context` pipe bypasses CUE validation. Relying on unvalidated labels for core infrastructure logic makes the platform brittle. The `.context` object carries metadata tagging (e.g., billing, SOC2); structural routing belongs in CUE-validated pillars.

* **Constraint 4: Release Cannot Override Developer Values**
  * **Unsupported pattern:** Ops attempts to override a developer's cognitive logic (e.g., changing `workers: 4` to `workers: 10`) from the `Release`.
  * **Why:** The `Aggregate` is the Single Source of Truth for Developer Intent. If a value is hardcoded in the `Aggregate`, it is immutable across environments. If a value must change per environment, the Developer uses Parameter Hoisting. The `Release` schema enforces this by banning `values` blocks, limiting Ops to fulfilling the `parameters` contract and defining physical `infra`.

* **Constraint 5: Instance-Level Labels on the Aggregate**
  * **Unsupported pattern:** Developer writes `labels: {}` on a component instance inside the `Aggregate`.
  * **Why:** Labels are immutable Catalog-level traits authored by the Platform Architect — the semantic identity that policy engines and selectors read. The Release routes components to boundaries via explicit map-based ID targeting (`components: { "my-agent": {} }`), which preserves the ability to nest `infra` and feature overrides per component without mixing label authorship into the developer's deployment surface.

### 9. The Security Perimeter & Explicit Egress Guardrails (Out-of-Perimeter Destinations)

No application exists in a vacuum. A compiled Aggrega architecture represents a strictly mapped graph. However, modern AI systems constantly interact with entities outside this compiled perimeter—such as public SaaS LLMs (Anthropic, OpenAI), generic public APIs (Stripe, Twilio), or legacy brownfield databases (on-premise Oracle).

To securely integrate these external systems, Aggrega strictly separates the **Security Boundary** from the **Execution Mechanics**. The Security Boundary is governed by the **Universal Component Rule** and the **Explicit Egress Guardrail**.

#### 1. The Universal Component Rule

If an application interacts with an entity—whether it is a local database, a managed cloud resource, a SaaS LLM, or a generic public API endpoint—that entity **MUST** be declared as a distinct Component in the `Aggregate`.

By treating external SaaS APIs and legacy databases as first-class nodes in the Intermediate Representation (IR) graph, developers unlock the ability to attach Zero-Trust proxy configurations directly to the outbound call. For example, by modeling the Stripe API as a distinct node, a developer can seamlessly attach a `header-injector` feature to it, ensuring the generated configuration prevents the calling Agent from holding the raw API token in its own memory.

#### 2. The Explicit Egress Guardrail (Infrastructure Conformance)

Rather than relying on hardcoded compiler logic to govern network egress, Aggrega delegates perimeter security entirely to the enterprise's agnostic policy engines and Wasm rendering plugins. This ensures the generated configurations conform strictly to explicit egress approvals.

* **The Catalog Hook (Domain 2):** When an Architect defines a public SaaS component (e.g., `core/external-api`), they attach an immutable corporate label to it (e.g., `security.enterprise.com/zone: "untrusted-external"`).
* **The Policy Guardrail (Compile-Time):** Before any configuration is generated, the OPA or Kyverno policy engine evaluates the graph. The enterprise authors a simple rule: *"If an internal node connects to a node labeled `untrusted-external`, that target node's ID must be explicitly listed in the environment's `parameters.approved_egress` array."* If a developer attempts to route data to an unapproved external destination, the policy engine halts the build.
* **The Configuration Generation (Deploy-Time):** If the policy passes, the Wasm rendering plugin associated with the internal Agent evaluates the topological edge. Because it sees the target is an external node, the plugin programmatically generates the precise L4 Egress configuration artifacts (e.g., an Istio `ServiceEntry` or AWS Security Group rule) required to authorize the connection. *The developer never writes a firewall rule.*

This guarantees — via the `policy-validator.wasm` socket evaluating the declared topology — that the *explicitly declared* infrastructure conforms to the egress policy without the core Go compiler needing to understand what "external" means. *(Note: True zero-trust egress relies on the target cluster running a Default Deny CNI at runtime; the generated configurations simply map the authorized exceptions).*

#### One Component Per External Service

Each external service is declared as a distinct component, not collapsed into a multi-target array. If an application calls five different third-party APIs, the developer declares five distinct `core/external-service` components. This per-service declaration is what lets policy engines and Wasm plugins target each outbound destination individually — attaching different egress policies, different proxy features, or different observability hooks to each external dependency.

#### Decoupling Security from Execution (The "Brownfield" Scenario)

It is critical to note that the semantic label (e.g., `untrusted-external`) dictates **network security policy**, not execution. It is completely decoupled from whether the resource is physically provisioned by Aggrega.

* **Scenario A (Public SaaS API):** Labeled `untrusted-external` in the Catalog (triggers Policy Egress Guardrails). Executed via the `formatter.wasm` plugin (no compute provisioned).
* **Scenario B (Internal Legacy Database):** Labeled `internal-trusted` (bypasses Egress Guardrails, stays inside the VPC). Executed via the `formatter.wasm` plugin (no compute provisioned).
* **Scenario C (AWS RDS Database):** Labeled `internal-trusted`. Executed via the `terraform-renderer.wasm` plugin (physically provisioned by the generated IaC).

### 10. The `eval` Provider: Virtual Components via Wasm Formatters

When an application interacts with a legacy on-premise database or a public SaaS API (like Stripe), the Universal Component Rule dictates that these external entities must be declared as distinct components in the `Aggregate`. However, Aggrega must not attempt to generate a physical Kubernetes Pod or AWS RDS instance artifact for them.

To solve this without polluting the architecture with placeholder Helm charts, Aggrega introduces a first-class programmatic execution socket: the **`eval.wasm` plugin.**

The `eval.wasm` plugin tells the Go compiler: *"Do not provision physical compute. Do not output physical IaC files. Simply execute this WebAssembly logic to construct complex URIs, parse cryptographic hashes, or build connection strings, save the resulting formatted string in memory, and pass it to the component's dependents."*

This creates an broadly extensible, native mechanism for Platform Ops to format complex Database Source Names (DSNs), custom API URIs, or Kafka bootstrap strings without relying on the brittleness of standard Go text templates.

#### The Step-by-Step Execution Pipeline

**1. Domain 1 (The Aggregate): Developer Intent**
The developer requests a legacy Oracle database. They do not care where it lives; they just dictate that their calling Agent expects the connection string to be delivered as an environment variable. Because the IP is static and known ahead of time, they pass it via parameters.

```yaml
components:
  legacy-oracle:
    type: core/legacy-database:1.0.0
    values:
      host: "{{ .parameters.legacy_oracle_ip }}"
      sid: "PROD_DB"

  my-agent:
    type: core/python-worker:1.0.0
    values: {}
    uses:
      databases:
        legacy_db:
          target: legacy-oracle
          inject: 
            env: 
              ORACLE_DSN: "primary_endpoint" # Maps Local Env : Target Output Key
```

**2. Domain 4 (The Manifest): The Routing**
Ops maps the legacy database explicitly to the `eval` format engine. The word `eval` acts as a sibling to `helm` and `terraform`, keeping the Manifest routing perfectly flat and predictable.

```yaml
spec:
  mappings:
    eval:
      components:
        type:
          "core/legacy-database": "oracle-dsn-formatter:1.0.0"
```

**3. Domain 3 (The Wasm Formatter Recipe): Structuring the Handoff**
The Ops engineer writes the stub recipe. It maps the Developer's `values` into a payload for the Wasm plugin to process and defines the expected `primary_endpoint` string in the `locals` block.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Recipe
metadata:
  name: oracle-dsn-formatter
  version: 1.0.0
spec:
  provider: eval 
  implements: core/legacy-database:1.0.0
  
  # The programmatic logic executed in-memory by the Wasm sandbox
  pipeline:
    - id: "dsn_builder"
      plugin: eval/oracle-dsn-builder:1.0
      function: build_dsn
      with: |
        db_host: "{{ .values.host }}"
        db_sid: "{{ .values.sid }}"
  
  # The resulting string is saved to the primary_endpoint key
  locals: 
    primary_endpoint: "" 
```

**4. Step 5 Compiler Execution (The Handoff)**

1. The Go compiler executes the `eval` pipeline for `legacy-oracle` first. It feeds the mapped `values` into the Wasm plugin.
2. The Wasm plugin constructs the required strings and returns a flat JSON dictionary via `stdout` (e.g., `{"primary_endpoint": "oracle://..."}`).
3. The Go compiler blindly assigns this entire JSON dictionary to the Oracle node's exported `.locals` state in memory.
4. The compiler then executes the recipe for `my-agent`. It builds the `.context.uses` pipe, seamlessly including the Oracle node's evaluated `.locals` dictionary.

**5. Domain 3 (The Caller Recipe): Fulfilling the Contract**
The standard Helm recipe for the Python worker loops over its connected components (uses:) and natively indexes the dictionary it received from the `eval` stub.

```yaml
# Inside python-worker-helm (The calling agent's recipe)
env:
  # The compiler pre-resolved the eval's output into the inject map
  {{- range $key, $value := .context.inject.env }}
  - name: {{ $key }}          # Renders: ORACLE_DSN
    value: "{{ $value }}"     # Renders: oracle://...
  {{- end }}
```

#### Architectural Benefits

* **Broadly Extensible:** Ops can format arbitrary connection strings, API paths, or complex URI structures using programmatic WebAssembly, rather than being constrained by string templating.
* **Zero Magic:** The core compiler doesn't have to guess formatting or rely on hardcoded URL builders; it just evaluates the string from the Wasm plugin's `exports` and passes it to the Caller's `.context`.
* **Unified Ecosystem:** In an Aggrega catalog, this Wasm "eval stub" is version-controlled, auditable, and shareable just like a physical Helm chart.

### 11. CUE Inheritance: Bridging Intent to Infrastructure

See [inheritance-and-interface](../language-reference/vocabulary/inheritance-and-interface.md) for the CUE-inheritance bridge pattern that safely exposes specialized infrastructure dials through child components.

### 12. Greenfield Provisioning ("Platform Aggregates")

A recurring trap in platform engineering is forcing the deployment router (our `Release` file) to handle heavy Day-0 cluster provisioning (e.g., spinning up a new AWS EKS cluster before deploying the app into it). This creates bloated, unreadable routing files.

Aggrega solves this using the principle of "Turtles All the Way Down." We do not introduce a new `install_infrastructure:` block into the `Release` schema. Instead, we use **Platform Aggregates**.

Because an AWS EKS Cluster, an Istio Control Plane, and an AWS VPC are ultimately just physical cloud resources, they are modeled exactly like application components.

1. **The Platform Aggregate:** The Infrastructure team writes a standard `Aggregate.yaml` where the components are `core/aws-vpc`, `core/eks-cluster`, and `core/istio-base`.
2. **The Platform Release:** They deploy this aggregate. The `terraform-renderer.wasm` plugin outputs the raw Terraform files required to stand up the base infrastructure.
3. **The Application Release:** When the Application Developer is ready to deploy their AI Agent, the Ops team simply targets the newly created cluster as an `environment` inside the App's `Release` file.
