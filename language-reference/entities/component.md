# Component

The conceptual role of the Component entity (the abstract compute-node interface in Domain 2) lives in [architecture/04-eight-entity-taxonomy.md](../../architecture/04-eight-entity-taxonomy.md). This page covers the Semantic Label Taxonomy — the label vocabulary Architects use to layer cognitive identity on top of the 7-type base ontology. Additional authoring-surface detail (schemas, worked examples) lands during later migrations.

## The Semantic Label Taxonomy (The Standard Library Convention)

If the base types are purely cloud-native, the operational and cognitive intelligence of the architecture is layered entirely through semantic duck-typing.

The core Go compiler does not read these labels. The compiler builds the flat Intermediate Representation (IR) graph without interpreting label semantics. These labels represent the **Standard Library Convention**—immutable "genetic markers" authored by the Platform Architect in Domain 2. They provide the explicit semantic hooks the Wasm policy validators and the physical Ops Recipes use to govern the architecture.

**(A) The Generic Cloud Layer**
These labels describe universal behaviors, allowing policy engines and generated L7 proxies to govern standard enterprise architectures without needing to natively understand AI frameworks.

| Label Prefix | Allowed Values (Convention) | Why Platform Ops needs it (The Policy Hook) |
| :--- | :--- | :--- |
| `api.aggrega.ai/protocol` | `http`, `grpc`, `tcp`, `udp` | Allows Ops rendering plugins (like an Istio recipe) to know if they should configure HTTP termination or just pass raw TCP packets. |
| `tool.aggrega.ai/impact` | `read-only`, `mutating` | Allows policy engines to evaluate Least-Privilege AuthZ. Mutating tools can automatically trigger policies that require strict approval-gate sidecars to be attached. |
| `datastore.aggrega.ai/engine` | `relational`, `vector`, `blob` | Allows policy engines to enforce cross-node type-safety (e.g., preventing an agent from attempting to send SQL payloads to a Vector DB). |
| `execution.aggrega.ai/pattern` | `sync`, `async`, `autonomous-loop` | Allows policies to distinguish between a standard background worker and a runaway AI agent, mandating strict Time-To-Live (TTL) timeouts for autonomous loops. |
| `gateway.aggrega.ai/intelligence` | `semantic`, `l4-mesh` | Dictates what features a router can physically support (e.g., preventing token-budget features on a standard TCP mesh). |

**(B) The Specialized AI Layer (The Cognitive Identity)**
These labels describe the *cognitive* identity of the workload, allowing the architecture to secure modern AI frameworks and memory structures.

| Label Prefix | Allowed Values (Convention) | Why Platform Ops needs it (The Policy Hook) |
| :--- | :--- | :--- |
| `model.aggrega.ai/capability` | `generative`, `embedding`, `transcription` | Used by the `usesSchema` selector strings (evaluated natively by the Go compiler in Step 4) to guarantee a developer doesn't accidentally route a generative text payload to an embedding endpoint. |
| `model.aggrega.ai/hosting` | `saas`, `local` | Allows policy engines to calculate Data Exfiltration risk (e.g., routing internal data to a SaaS LLM). |
| `agent.aggrega.ai/autonomy` | `autonomous`, `copilot` | Identifies the execution risk of the cognitive loop, allowing policies to mandate human-approval features for fully autonomous agents. |
| `cognitive.aggrega.ai/memory` | `semantic`, `episodic`, `working` | Natively supports the CoALA framework. Policy engines read this label on a database to mandate `read/write` scopes for episodic logs, but strict `read-only` access for semantic enterprise facts. |

**(C) The Cross-Cutters (Governance, State, & Hardware)**
These represent the foundational enterprise tags that drive Zero-Trust validation and hardware routing.

| Label Prefix | Allowed Values (Convention) | Why Platform Ops needs it (The Policy Hook) |
| :--- | :--- | :--- |
| `compliance.aggrega.ai/data-class`| `public`, `internal`, `restricted` | Tracked topologically by the policy engine. If a continuous path exists from a `public` node to a `restricted` database without a masking proxy feature attached, the policy halts the build. |
| `compliance.aggrega.ai/contains-pii` | `true`, `false` | Explicitly flags workloads for GDPR/CCPA. Policy engines use this to mandate the attachment of specific L7 data-redaction proxies. |
| `hardware.aggrega.ai/accelerator` | `gpu`, `tpu`, `npu` | Used by DevOps in the `Release` file. They explicitly route these components into physical hardware pool boundaries (e.g., a GPU-capable cluster) via the `components: {}` map, while `policy-validator.wasm` can enforce that GPU-labeled components are never placed in non-GPU boundaries. |
| `state.aggrega.ai/retention` | `retain`, `delete` | **Solves the AOT Deletion Blind Spot.** If a developer deletes a database from their `Aggregate`, a GitOps orchestrator will physically drop the disk. A `mutator.wasm` plugin can read the `retain` label and automatically mutate the output artifacts to include orchestrator-native protection (e.g., `helm.sh/resource-policy: keep`). |
| `state.aggrega.ai/backup-tier` | `mission-critical`, `standard`, `ephemeral` | **SOC2 Availability Hook.** Tells the Ops `FeatureRecipe` whether to physically generate automated Snapshot/Volume Backup configurations for the resource. |

**(D) The Dynamic Business Context (Cascading Annotations)**
While `labels` define the immutable Catalog DNA, dynamic business contexts (like SOC2 audit scoping or FinOps cost tracking) change depending on who deploys the application and where it runs. These are governed by **Annotations** injected dynamically by the Developer's `subsystems`, the Ops `Release` boundaries, or the `mutator.wasm` auto-tagger.

| Annotation Prefix | Allowed Values (Convention) | Why Platform Ops needs it (The Policy Hook) |
| :--- | :--- | :--- |
| `business.aggrega.ai/cost-center` | e.g., `finance`, `ai-research` | Required by Wasm rendering plugins to inject physical tagging (e.g., AWS tags or K8s labels) into the final generated artifacts for cloud billing dashboards. |
| `business.aggrega.ai/owner` | e.g., `team-alpha@corp.com` | Incident Response routing. Guarantees the infrastructure is mapped to a human team. |
| `compliance.aggrega.ai/frameworks` | e.g., `soc2, hipaa` | **SOC2 Scope Trigger.** Injected via the environment `Release`. Wasm plugins read this string to automatically generate rigid audit-logging sidecars and disable debug ports when an application enters a production compliance boundary. |

*The taxonomy is a catalog convention, not a compiler rule. Enterprises can ignore it, delete it, or invent their own label vocabulary (`mycompany.com/custom-trait`). Wasm plugins evaluate whatever label keys the enterprise authors.*

## CUE Schema Authoring

The `Component` schema (and its `Feature` counterpart, including credential Features labeled `feature.aggrega.ai/kind: secret`) offers two ways to declare the CUE validation contract for developer-authored `values`:

* **Inline (`cueSchema`):** an embedded string carrying the CUE code directly in the Component YAML. Fits simple validations cleanly and keeps everything in one file.
* **External URI (`cueSchemaRef`):** a pointer to a shared `.cue` file in the registry. Enterprise schemas can span hundreds of lines and may be reused across multiple Components; `cueSchemaRef` keeps the Component YAML compact and lets the CUE library live in its own versioned artifact.

One of `cueSchema` / `cueSchemaRef` applies per Component; the compiler reads the inline string or fetches the referenced file and unifies the result with the auto-generated bases derived from `usesSchema` and `secretsSchema` (see the section below) during the Component's validation pass.

## Credential Slots: `secretsSchema`

A Component may declare credential slots through a `secretsSchema` block — a declarative YAML map parallel to `usesSchema`. Each slot names a credential the Component needs (a root password, an API key, an auth token) and governs how the developer's Aggregate may populate it. The compiler auto-generates CUE validation rules from the declared slots and unifies them with the Component's `cueSchema` during Component resolution; developers do not hand-author a `secrets:` pillar inside `cueSchema`, because the structure comes from `secretsSchema`.

**Schema definition on the Component:**

```yaml
spec:
  secretsSchema:
    root_password:
      required: true
      inject: []
      description: Root database password. Recipe controls delivery (Black-Box).
    user_password:
      inject: [env, file]
      description: Application user password, auto-generated if omitted.
    replication_password:
      inject: []
      description: Replication password for HA setups.
```

**Field semantics:**

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `required` | bool | `false` | When `true`, the developer must provide this secret in their Aggregate `secrets:` block. When `false` or omitted, the secret is optional. |
| `inject` | string[] | — | Allowlist of allowed inject delivery mechanisms. `[]` (empty) means blackbox — no `inject:` block allowed on the developer's secret, Recipe controls delivery. `[env, file]` means transparent — the developer may dictate delivery via the listed mechanisms. Same semantics as `usesSchema[].inject`. |
| `description` | string | — | Human documentation, rendered by IDE and hub. |

The `required: false` default matches the most common authoring pattern: most Components work fine without an explicit credential provided by the developer, because the Recipe or the underlying chart supplies a sensible default or auto-generates one. Only credentials the Component genuinely cannot boot without are marked `required: true`.

### CUE generation from `secretsSchema`

The compiler generates a base CUE schema from the declared slots and unifies it with the user's `cueSchema` — the same pattern `usesSchema` uses for its own base schema generation. The generated schema never touches disk; it exists only in memory during the Component validation pass.

Input `secretsSchema`:

```yaml
secretsSchema:
  root_password:
    required: true
    inject: []
  user_password:
    inject: [env, file]
```

Generated base schema (in memory):

```cue
secrets: {
  root_password: {
    type: string
    values?: _
    // inject is ABSENT — inject: [] means no inject block allowed
  }
  user_password?: {           // optional (?) because required defaults to false
    type: string
    values?: _
    inject?: {
      env?: [string]: string
      file?: [string]: string
      // arg is absent — not in inject allowlist
    }
  }
}
```

The compiler unifies the generated base with the user's `cueSchema` via CUE's `&` operator, producing a single validation schema for the Component's authored instances. The user's `cueSchema` does not need a `secrets:` pillar — the generated schema handles all structure and validation for the declared slots.

### Validation behavior

If a developer attempts to populate a blackbox slot with an `inject:` block, the compiler halts during Component validation:

```yaml
# Developer writes in Aggregate:
secrets:
  root_password:
    type: core/secret-value:1.0.0
    values:
      source: "{{ .parameters.db_root_pass }}"
      key: mariadb-root-password
    inject:                    # ← CUE validation REJECTS this
      env:                     #    because the generated base schema
        DB_PASS: root_password #    has no inject field for root_password
```

The developer gets a clear error: *"field `inject` not allowed on secret `root_password` (blackbox: Recipe controls delivery)."*

The end-to-end flow through the compilation pipeline — how the Aggregate's `secrets:` block connects to a credential Feature (such as `core/secret-value`) and then to a provider-specific FeatureRecipe that delivers the secret to the running workload — is worked through in [examples/05-credential-features](../examples/05-credential-features.md).

## Catalog Authoring: Extending Base Components

Platform Architects use the `extends` keyword to layer specialized interfaces on top of corporate or community baselines. The Go compiler recursively fetches the parent, performing a **Two-Tiered Merge**: it deep-merges the YAML metadata (overwriting labels on conflict and appending arrays) and auto-unifies the CUE schemas in memory (`ParentSchema & ChildSchema`). The `cueSchema` unification is strictly monotonic — a child can narrow a parent's constraint, but never relax or bypass it.

See [architecture/13-catalog-and-registry.md §3](../../architecture/13-catalog-and-registry.md) for the Schema Formats and Composition mechanism (Shared CUE Libraries and Single Inheritance).

**Example A: The Base Component (The Corporate Baseline)**
The Platform Architect defines a foundational enterprise server. This base template sets the required 7-Type cloud primitive label and establishes immutable security constraints in CUE.
```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Component
metadata:
  name: core/base-enterprise-server
  version: 1.0.0
  labels:
    component.aggrega.ai/type: "server"
spec:
  cueSchema: |
    // The corporate baseline constraint:
    values: {
      // CUE unification ensures no child component can ever set this to false.
      tls_enabled: true 
      
      // Default fallback for application logic, children can override this integer.
      timeout_ms: int | *5000
    }
```

**Example B: The Child Component (Extending the Baseline)**
A specialized AI Gateway is created. Notice how the component inherits from the base enterprise server, meaning the Architect doesn't have to rewrite the base ontology labels or the standard `tls_enabled` security schemas.
```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Component
metadata:
  name: core/ai-gateway
  version: 1.0.0
  labels:
    gateway.aggrega.ai/intelligence: "semantic" # Appended to parent labels
spec:
  extends: core/base-enterprise-server # Triggers the Two-Tiered Merge
  cueSchema: |
    values: {
      routing_mode: *"latency_optimized" | "cost_optimized"
      
      // NOTE: If the architect attempted to write `tls_enabled: false` here, 
      // the compiler's auto-merge evaluates true & false for such cases,
      // resulting in a native CUE error (_|_) that instantly halts the build.
    }
```

For the Recipe that implements this `core/ai-gateway` interface against a physical Helm chart, see [entities/recipe](recipe.md) Example C (`kong-gateway`).
