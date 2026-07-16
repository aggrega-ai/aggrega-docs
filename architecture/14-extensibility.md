# Extensibility

## Ecosystem Extensibility & Compiler Guardrails

### 1. The Universal WebAssembly (Wasm) Interface

To ensure architectural symmetry across the ecosystem, Aggrega utilizes a completely standardized execution contract that applies uniformly to every Wasm socket in the compiler pipeline.

The YAML interface for invoking *any* plugin relies on two explicitly chosen keywords: `function` and `with`.

* **Why `function` (Not `command`):** Aggrega embeds a Wasm runtime (the Extism toolkit on top of the Wazero engine), executing Wasm directly in memory. Using `command` implies an OS-level CLI execution (e.g., `docker run`). Using `function` correctly aligns the DSL with the underlying WebAssembly physics: the Go host is invoking an explicitly exported function from the Wasm module.
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

**The host runtime: a capability-denying sandbox.** Aggrega embeds the Wasm host as the Extism toolkit running on top of the Wazero engine; the host binary stays pure Go with no native toolchain dependency, so `aggrega` cross-compiles cleanly. Every socket runs behind an **AOT-purity firewall**: the host refuses to grant a plugin any runtime-access capability — no network, no filesystem, no wall-clock, no environment, no standard I/O — and rejects a plugin that asks for one. A plugin that cannot reach the network or read the clock cannot break the compiler's ahead-of-time guarantee that the same input produces the same output. Language runtimes that need a few benign startup imports run against a deterministic, capability-denied configuration of those imports: the host fixes the observable wall clock, supplies zero entropy, discards standard I/O, and grants no filesystem, argument, or environment access — so a plugin still cannot observe anything that varies across builds.

**Authoring against the host: the PDK.** Plugin authors do not hand-write the Wasm memory ABI. Aggrega ships a Plugin Development Kit in three languages — Go, Rust, and TypeScript — thin wrappers that present each socket's typed input and output so the author writes ordinary functions. The `function` / `with` interface above is what an Aggregate or FeatureRecipe uses to *invoke* a plugin; the PDK is what a plugin author *builds against*.

**Which sockets run today.** The host runtime ships, and the first socket dispatched through it in a shipping command is the **linter socket** — the standard publishing-linter, run by [`aggrega lint`](../language-reference/cli/aggrega-lint.md). The in-band build sockets — the Step 2 mutator, the Step 4 policy-validator, and the Step 5 Phase C pipeline — carry stable contracts but are not yet dispatched during `aggrega build`; they activate one socket at a time against the same host. See [Status of the Language](../language-reference/10-status.md) for the per-socket readiness.

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

### 5. CLI Extensions: Runtime Commands

The sockets above run **inside a build** — the compiler dispatches them as it parses, mutates, validates, and renders an Aggregate. The **CLI-extension socket** is different in kind: it runs **at the terminal, outside any build**, when an operator types `aggrega <command>`. It is how the `aggrega` command surface itself grows without a core release.

**What a CLI extension is.** A CLI extension is a drop-in `aggrega <command>` contributed by a signed, sandboxed Wasm plugin. It takes the same guest-owned drop-in stance the rendering socket takes: the domain logic lives entirely in the guest, and the Go host contributes zero per-command code. Adding a new top-level command needs only three things — a `.wasm` binary, one `Plugin` entity declaring `pluginType: cli` (see [`Plugin`](../language-reference/entities/plugin.md)), and an explicit [`aggrega plugin add cli`](../language-reference/cli/aggrega-plugin.md). The host discovers the command from the installed plugin's self-report; no command is compiled into the binary.

**Why a runtime socket can do what a build socket cannot.** Because the compile-time sockets run *during* a build, they stay capability-denied and deterministic: Aggrega is an ahead-of-time compiler, and the same input must always produce the same output (see [Architectural Invariants](05-invariants.md)). A render or policy plugin therefore cannot reach the network, read the clock, or stream to the terminal — anything that varies across runs would break that guarantee. A CLI extension runs *after* and *outside* that boundary, driven by a human at a prompt rather than by the deterministic pipeline. That is precisely why a CLI plugin **may** stream standard output and standard error as it runs and return a process exit code: there is no build artifact whose byte-for-byte stability those effects could threaten.

**Install, run, and discover.** [`aggrega plugin add cli <query>`](../language-reference/cli/aggrega-plugin.md) searches the configured registry for a matching `cli` plugin, verifies it against the registry's trust policy, and installs it as a top-level command — printing the plugin's declared capabilities first, so the operator confirms exactly what the command is allowed to do before it lands. Once installed, `aggrega <command>` runs it like any built-in. To find installable commands and catalog content, [`aggrega search`](../language-reference/cli/aggrega-search.md) queries the local index of configured registries — `--kind plugin` narrows the results to installable CLI plugins, and an unfiltered search covers catalog entities; [`aggrega plugin list`](../language-reference/cli/aggrega-plugin.md) shows what is already installed. The per-command flags and output shapes live on those reference pages.

**The capability model.** A CLI extension starts from a fixed **baseline** that every command receives with no declaration and no prompt:

| Baseline capability | Granted |
| --- | --- |
| Command-line arguments in | Always |
| Streamed standard output and standard error | Always |
| Process exit code out | Always |

Anything beyond the baseline is **off by default**. A plugin that needs more declares each additional capability explicitly, and the host grants it only after showing it at install time for the operator to confirm. Further capability classes — environment access, filesystem access, network access, interactive input — are the direction the model grows toward; they are granted as they are wired, each behind the same declare-and-confirm gate, so a command can never silently acquire a reach the operator did not approve.

**Built-ins always win.** An installed plugin can never shadow a built-in command. A reserved-name guard backed by a denylist protects both the commands that ship today and the names reserved for future built-ins, and a collision is refused at install rather than allowed to override core behavior. The command surface an operator relies on stays stable no matter what is installed on top of it.

