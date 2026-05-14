# Extensibility

## Ecosystem Extensibility & Compiler Guardrails

### 1. The Universal WebAssembly (Wasm) Interface

To ensure architectural symmetry across the ecosystem, Aggrega utilizes a completely standardized execution contract that applies uniformly to every Wasm socket in the compiler pipeline.

The YAML interface for invoking *any* plugin relies on two explicitly chosen keywords: `function` and `with`.

* **Why `function` (Not `command`):** Aggrega embeds Wazero, executing Wasm directly in memory. Using `command` implies an OS-level CLI execution (e.g., `docker run`). Using `function` correctly aligns the DSL with the underlying WebAssembly physics: the Go host is invoking an explicitly exported function from the Wasm module.
* **Why `with` (Not `values` or `parameters`):** Using `values` would conflate the Plugin's inputs with the Developer's cognitive payload. Using `parameters` would conflate them with the Release's environment variables. By adopting the GitHub Actions standard (`with:`), the schema clearly designates an explicit mapping contract that is validated against the plugin's own embedded JSON schema before execution.

**The 6 Types of Wasm Plugins:**
This universal `function` and `with` interface supports every programmable socket in the compiler:

| Execution Phase | Plugin Type | Purpose | Expected Output |
| :--- | :--- | :--- | :--- |
| **Step 2 (Topology)** | **Metadata Mutator** (`mutator.wasm`) | Silently auto-tags nodes with compliance or environmental labels based on context. | Array of JSONPatches targeting `metadata.labels`. |
| **Step 4 (Validation)** | **Policy Validator** (`policy-validator.wasm`) | Acts as the Loud Guardrail. Evaluates graph edges, paths, and labels for security boundaries. | Array of Failure Objects (e.g., `pass: false, msg: "..."`). Halts compilation. |
| **Step 5 (Formatting)**| **Eval Formatter** (`eval` provider) | Builds complex connection strings (DSNs, URIs) for out-of-perimeter legacy DBs or SaaS APIs. | A flat JSON Dictionary (mapped directly to the node's `.locals`). |
| **Step 5 (Modifiers)** | **Pipeline Mutators** (`Feature/Secret`) | The core pipeline plugins. Fetches secrets or injects sidecars into Base ASTs sequentially. | The Universal JSONPatch Handshake (`root_objects`, `patch`, `env_vars`). |
| **Step 5 (Generation)**| **Renderer** (`renderer.wasm`) | Translates the final in-memory JSON into physical stringified files (Helm, Terraform). | Array of Stringified Files. |
| **Out of Band** | **Linter/Estimator** (`linter.wasm`) | Optional FinOps or hygiene checks (e.g., calculating cloud costs based on `.infra`). | Warning Strings or Fatal Halts. |

*The full engineering mandates governing how these sockets integrate with the Go compiler's pipeline and data-flow integrity rules live in the internal Wasm-sockets reference.*

### 2. FeatureRecipe Plugin Pipelines

FeatureRecipes bind abstract operational intents (like a security proxy attachment or a sidecar injection) to versioned WebAssembly (Wasm) plugin pipelines. Ops declares what a Feature needs at a concrete provider target; the compiler executes the declared pipeline against the flat IR graph.

This binding carries three consequences for the ecosystem:

* **Decoupling evolution.** The infrastructure vocabulary grows through external Wasm plugins without requiring a core release of the Aggrega compiler. New providers, new sidecars, and new security integrations ship as independent Wasm binaries against the stable Wasm ABI.
* **Semantic versioning.** FeatureRecipes reference Wasm plugins with SemVer constraints (`>= 1.0.0`, `< 2.0.0`). Ops locks down major versions while safely picking up minor and patch releases.
* **Offloading complexity.** Vendor-specific CRD generation or complex rendering (vendor-specific policy objects, provider-native routing resources) lives in pure Wasm plugins operating on the flat IR graph, rather than threading through schema declarations or template logic inside component definitions.

**Pipeline chaining — separating concerns across plugins.** A FeatureRecipe pipeline can chain multiple Wasm plugins sequentially, each receiving the same IR node context from the compiler. The standard pattern splits responsibility so that a single plugin does not carry both the semantic intent of a feature and the physical traffic-interception mechanism of a specific target environment.

A canonical two-plugin chain looks like this:

* A **configuration plugin** that emits the semantic rules for the feature (security policy rules, audit patterns, rate-limit thresholds). It understands the feature's intent; it does not understand the target environment's traffic-interception fabric.
* A **routing plugin** that emits the physical mesh configuration that carries those rules (gateway CRDs, sidecar injection patches, firewall rules). It understands the target environment's fabric; it does not understand the feature's semantic intent.

Both plugins receive the same IR node context from the compiler in sequence, so they compose cleanly without direct coupling between them. The compiler orchestrates the pipeline; the plugins carry domain knowledge.

### 3. Traffic Interception: The HTTPRoute Target

Aggrega's extensibility model targets the Kubernetes Gateway API HTTPRoute standard as the cross-provider artifact for mesh-level traffic interception. Standard-library routing plugins are intended to emit HTTPRoute objects; target environments that consume Gateway API translate HTTPRoute to their native fabrics. The routing-plugin family is under active development; the FeatureRecipe pipeline schema carries it today, and specific plugins ship as standard-library FeatureRecipes land.

### 4. Plugin Autonomy: Label Resolution

When Wasm plugins generate physical resources from the IR graph, SREs need to trace a running Kubernetes Pod or cloud resource back to the developer's semantic intent in the Aggregate. Aggrega's extensibility model places that translation entirely inside the Wasm plugin author's control.

The compiler passes the full IR-graph `labels` dictionary into the Wasm sandbox without interpretation. The plugin author — Platform Ops — decides the mapping logic from there: pass all labels blindly, filter for specific domain prefixes (`*.aggrega.ai/*`), or map graph labels directly to native provider tagging schemas (translating an IR label into AWS `tags`, Kubernetes `annotations`, or a cloud-specific metadata mechanism). The compiler enforces no restrictions on how the generated artifacts are tagged.

This autonomy keeps domain-specific intelligence — which labels matter for observability, which map to native tagging conventions, which are platform-internal — inside the Wasm plugin layer, where the ecosystem evolves independently of the Go compiler's release cadence.

