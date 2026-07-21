# Extensibility

## Ecosystem Extensibility & Compiler Guardrails

### 1. The Universal WebAssembly (Wasm) Interface

To ensure architectural symmetry across the ecosystem, Aggrega utilizes a completely standardized execution contract that applies uniformly to every Wasm socket in the compiler pipeline.

The YAML interface for invoking *any* plugin relies on two explicitly chosen keywords: `function` and `with`.

* **Why `function` (Not `command`):** Aggrega embeds a Wasm runtime (the Extism toolkit on top of the Wazero engine), executing Wasm directly in memory. Using `command` implies an OS-level CLI execution (e.g., `docker run`). Using `function` correctly aligns the DSL with the underlying WebAssembly physics: the Go host is invoking an explicitly exported function from the Wasm module.
* **Why `with` (Not `values` or `parameters`):** Using `values` would conflate the Plugin's inputs with the Developer's cognitive payload. Using `parameters` would conflate them with the Release's environment variables. By adopting the GitHub Actions standard (`with:`), the schema clearly designates an explicit mapping contract that is validated against the plugin's own embedded JSON schema before execution.

**The 7 Types of Wasm Plugins:**
This universal `function` and `with` interface supports every programmable socket in the compiler:

| Plugin Type | Where it runs | Purpose | Expected Output |
| :--- | :--- | :--- | :--- |
| **Provider** (`provider`) | Step 5 (Generation) | Translates the final in-memory IR into physical stringified files for a target format (Helm, Terraform, Compose). | An array of stringified files. |
| **FeatureRecipe pipeline step** (`frp_step`) | FeatureRecipe pipeline (Phase C) | Sequential steps that fetch secrets or inject sidecars into base ASTs. | RFC 6902 `patches` against the keyed document set, plus `side_effects` (emit a new document or file), `diagnostics`, and `outputs` a later step can read. The step input carries that keyed document set and the step's rendered `with` input. |
| **Metadata Mutator** (`mutator`) | Step 2 (Topology) | Auto-tags nodes with compliance or environmental labels; an operator opts one in. | An array of JSONPatches targeting `metadata.labels`. |
| **Policy Validator** (`policy`) | Step 4 (Validation) or the render stage | Acts as the Loud Guardrail: evaluates graph edges, paths, and labels — or the rendered artifacts — against security boundaries. | `deny` / `warn` / `audit` verdicts; a `deny` halts the build. |
| **Linter** (`linter`) | Out of band | Optional FinOps or hygiene checks (e.g. cloud-cost estimation from `.infra`) and publish-time discipline. | Warning strings or fatal halts. |
| **CLI extension** (`cli`) | Runtime (`aggrega <command>`) | A drop-in top-level command contributed by a signed, sandboxed plugin, with zero per-command Go in the host. | Streamed standard output and error, plus the guest's exit code. |
| **Parser** (`parser`) | On demand, wherever a foreign format is read | Turns foreign source text (HCL, TOML, YAML, JSON) into a canonical JSON tree. | `tree` plus `diagnostics`, and optional source `spans`. |
| **Importer** (`importer`) | On demand (`aggrega import`) | Turns a foreign infrastructure or agent-definition source (Langflow, Flowise) into draft Aggrega authoring files, advertising the formats it handles as `import:<format>` capabilities. | Draft `Aggregate` / `Component` entities, the mapping decisions behind them, diagnostics, and the scaffold files to write. |

*The full engineering mandates governing how these sockets integrate with the Go compiler's pipeline and data-flow integrity rules live in the internal Wasm-sockets reference.*

**The host runtime: a capability-denying sandbox.** Aggrega embeds the Wasm host as the Extism toolkit running on top of the Wazero engine; the host binary stays pure Go with no native toolchain dependency, so `aggrega` cross-compiles cleanly. Every socket runs behind an **AOT-purity firewall**: the host refuses to grant a plugin any runtime-access capability — no network, no filesystem, no wall-clock, no environment, no standard I/O — and rejects a plugin that asks for one. A plugin that cannot reach the network or read the clock cannot break the compiler's ahead-of-time guarantee that the same input produces the same output. Language runtimes that need a few benign startup imports run against a deterministic, capability-denied configuration of those imports: the host fixes the observable wall clock, supplies zero entropy, discards standard I/O, and grants no filesystem, argument, or environment access — so a plugin still cannot observe anything that varies across builds.

**Authoring against the host: the PDK.** Plugin authors do not hand-write the Wasm memory ABI. Aggrega ships a Plugin Development Kit in three languages — Go, Rust, and TypeScript — thin wrappers that present each socket's typed input and output so the author writes ordinary functions. The `function` / `with` interface above is what an Aggregate or FeatureRecipe uses to *invoke* a plugin; the PDK is what a plugin author *builds against*.

**Which sockets run today.** The host runtime ships. The publishing-linter runs through it under [`aggrega lint`](../language-reference/cli/aggrega-lint.md), and the in-band build sockets — the Step 2 mutator, the Step 4 policy, and the Step 5 Phase C pipeline — dispatch through the same host during `aggrega build`. See [Status of the Language](../language-reference/10-status.md) for the per-socket readiness.

**Which plugins are pinned, and which your environment chooses.** Aggrega splits plugins by whether they change the output you ship. Output-shaping plugins — the render providers, the mutator, and the FeatureRecipe and Recipe pipeline steps — are pinned in the release lockfile when you `aggrega pull`, and reproduced byte-identically at `aggrega build` and `aggrega serve` from that lockfile alone. To change which output-shaping plugin applies, you re-pull; a change to your workspace configuration after a pull does not move a build's output until the next pull. Gate plugins — policy and lint — judge a build without changing its bytes, so they are cached at pull (so a build can still run them offline) but not pinned: which gate runs is chosen by your environment at build time, so a dev-permissive / CI-strict split is an ordinary configuration choice rather than a re-pull, and switching gates never changes the output a passing build emits. Plugins that act only on authoring input, such as importers and CLI extensions, shape no build output and are neither pinned nor part of the build's cached set.

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

**Install, run, and discover.** [`aggrega plugin add cli <query>`](../language-reference/cli/aggrega-plugin.md) searches the configured registry for a matching `cli` plugin, verifies it against the registry's trust policy, and installs it as a top-level command — printing the plugin's declared capabilities first, so the operator confirms exactly what the command is allowed to do before it lands. Once installed, `aggrega <command>` runs it like any built-in. A CLI plugin declares its commands and their flags in its `describe()` self-report, and the host renders each command's flags in `aggrega help <command>` exactly as it does for a built-in command, so an operator discovers an installed command's `--flags` the same way. To find installable commands and catalog content, [`aggrega search`](../language-reference/cli/aggrega-search.md) queries the local index of configured registries — `--kind plugin` narrows the results to installable CLI plugins, and an unfiltered search covers catalog entities; [`aggrega plugin list`](../language-reference/cli/aggrega-plugin.md) shows what is already installed. The per-command flags and output shapes live on those reference pages.

**The capability model.** A CLI extension starts from a fixed **baseline** that every command receives with no declaration and no prompt:

| Baseline capability | Granted |
| --- | --- |
| Command-line arguments in | Always |
| Streamed standard output and standard error | Always |
| Process exit code out | Always |

Anything beyond the baseline is **off by default**. A plugin that needs more declares each additional capability explicitly, and the host grants it only after showing it at install time for the operator to confirm. Further capability classes — environment access, filesystem access, network access, interactive input — are the direction the model grows toward; they are granted as they are wired, each behind the same declare-and-confirm gate, so a command can never silently acquire a reach the operator did not approve.

**Built-ins always win.** An installed plugin can never shadow a built-in command. A reserved-name guard backed by a denylist protects both the commands that ship today and the names reserved for future built-ins, and a collision is refused at install rather than allowed to override core behavior. The command surface an operator relies on stays stable no matter what is installed on top of it.

### 6. Parser Plugins: Reading Foreign Formats

The compiler routinely needs to read text written in a format it did not author — a Terraform module in HCL, a config file in TOML, a manifest in YAML or JSON. The **parser socket** supplies that reading capability without teaching the compiler core any one format. A parser is a stateless plugin that turns a foreign source *text* into a structured JSON tree: hand it the bytes of an HCL file and it returns the same content as a JSON object the rest of the pipeline already knows how to walk. Any part of the compiler that needs to read a format it does not parse natively asks for a parsed tree and works from there.

**A format is a capability, not a compiler feature.** A parser advertises the formats it handles as capabilities — `parse:hcl`, `parse:toml`, and so on — and the host resolves a parser by the requested format, runs it, and hands the tree back. This is the same drop-in, capability-advertised model the render providers and CLI plugins take: the compiler core holds no built-in list of formats, so adding one is shipping a new parser plugin, never a core release. Parsers for HCL, TOML, YAML, and JSON ship inside the binary as a starter set; an enterprise that needs another format ships a parser plugin that advertises it.

**Format selection is declarative, never guessed.** The host never inspects a file's content to decide what it is. It picks a format through declared signals in a fixed order of preference. A render provider can declare the format of each file it emits, and the host prefers that producer-declared format outright — the provider that wrote the bytes is the authority on how to read them. For a file the producer did not tag, a fixed file-extension map is the fallback — `.tf` selects HCL, `.toml` selects TOML, `.yaml` selects YAML, `.json` selects JSON. Choosing by a declared format or a fixed extension keeps parsing deterministic and legible: the same input always routes to the same parser, and an operator can read off which parser will run without knowing the bytes inside the file. Content-sniffing would make the choice depend on the payload, and Aggrega does not do it.

**A parser is purely syntactic.** The output is a JSON tree plus diagnostics, and optionally the source locations each node came from. A parser carries no Aggrega meaning — it reports what the text says structurally, nothing about what it means as a Component, a Recipe, or any other entity. Turning a parsed tree into Aggrega entities is a separate concern that lives elsewhere; the parser's single job is faithful syntax-to-JSON translation. The reading direction is one-way in the same spirit: a parser reads a format into a tree, it does not write a format back out.

**The first consumer: policy over Terraform HCL.** A render-stage policy that needs to inspect the Terraform a build produces does not learn HCL itself. The host parses the HCL artifact through the parser socket and hands the policy plugin the JSON tree it already reads, so the policy reasons over structured data in the shape every other socket receives. New readers of foreign formats compose the same way — ask the host for the tree, then work in JSON — so the compiler's ability to understand a format grows by adding parser plugins rather than by growing the core.

### 7. Importer Plugins: Drafting Authoring Files From Foreign Sources

A team rarely starts from a blank page. Its agent architecture often already exists somewhere else — a Langflow or Flowise flow, a graph of nodes wired together in another tool. The **importer socket** turns that foreign source into a running start on Aggrega authoring: it reads the source and scaffolds first-draft `Aggregate` and `Component` entities for an author to review and finish, so a team carries a flow it already has forward into Aggrega rather than re-authoring it by hand. An importer maps *meaning* — it reads what a source node is and proposes the Aggrega entity that stands for it; the compiler pipes the emitted entities through opaquely, exactly as it stays blind to what any plugin produces.

**A format is a capability, not a compiler feature.** An importer advertises the formats it handles as capabilities — `import:langflow`, `import:flowise`, and so on — and the host resolves an importer by the requested format, runs it, and takes back the entities it drafted. This is the same drop-in, capability-advertised model the parser socket takes with `parse:<format>`: the compiler core holds no built-in list of importable formats, so supporting a new one is shipping an importer plugin that advertises it, never a core release.

**An importer reads through the parser socket; it does not re-parse.** An importer needs the structured shape of its source, but it does not re-implement the reading of a format the ecosystem already parses. When it needs the tree, it asks the host to run the matching parser through the same host-mediated parse capability the rest of the pipeline uses, and works from the JSON tree that comes back. Reading (syntax to tree) stays the parser's job; mapping (tree to Aggrega entities) is the importer's. The two sockets compose without duplicating each other: an importer adds the mapping intelligence for a source and leans on the existing parser for the bytes.

**Mapping is deterministic and confidence-scored.** For each node in the source, an importer scores the catalog's components with a deterministic, no-model confidence model and records the decision — the candidates it weighed, the match tier it assigned, and the choice it made — as reviewable hints an author can read and revise. The default is hints only: the import proposes, and the author decides. A high-confidence match can be written as a reference to an existing catalog component instead of a freshly drafted body, but only when the operator opts in — always as an explicit, reversible suggestion the author gates, never a silent rewrite. Because the scoring carries no model and no runtime lookup, the same source scored against the same catalog always produces the same hints.

**The command.** [`aggrega import <file>`](../language-reference/cli/aggrega-import.md) runs an import from the terminal. `--format` names the source format explicitly — for example `langflow` or `flowise` — for a source whose shape the command cannot read off on its own; `--stdout` writes the drafted files to standard output instead of to disk, so an author can preview the scaffold before committing anything to the working tree. The command drives the importer the workspace resolves for the named format and lays down the entities and any scaffold files the import produced.

**What ships today.** The importer socket and the `aggrega import` command are in place, and the first version targets declarative agent-definition formats — Langflow and Flowise flows. The format-specific mapping intelligence lives in the importer plugin, not in the core, so running the command end to end needs a catalog-published importer plugin that advertises the source format. A standard-library Langflow/Flowise importer is still forthcoming; until one is published, the command has the socket and the workflow but not yet a plugin to resolve for those formats.

## Seeding and Growing a Catalog

A catalog does not have to be built from nothing. Most of the work of seeding
Recipes and plugins for a new environment is scaffolding and reuse rather than
writing every binary by hand.

**Importing a foreign source into draft authoring files.** `aggrega import <file>`
reads a declarative agent-definition source — a Langflow or Flowise flow — and
scaffolds first-draft `Aggregate` and `Component` YAML for an author to review and
finish, so a team carries forward a flow it already has rather than re-authoring it
by hand. For each node in the source it scores catalog components with a
deterministic, no-model confidence model and records the decision — the candidates
it weighed, the tier it assigned, and the choice it made — as reviewable hints; a
high-confidence match can be written as a catalog reference when the operator opts
in, always as an explicit, reversible suggestion the author gates rather than a
silent rewrite. The format-specific mapping intelligence lives in an importer plugin
the workspace resolves for the source format; a catalog-published Langflow/Flowise
importer is still forthcoming, so running the command end to end needs an importer
plugin that advertises the source format.

**Most plugin work is templates, not compiled code.** A large share of features
only inject a static sidecar, environment variable, or label — a plain JSONPatch
with no conditional logic. A configurable patcher plugin that takes a declarative
JSONPatch template as its `with` input covers that common case without a unique
compiled binary per feature: the author writes a template, and for many CRD-style
targets a `valuesMapping` template (often referencing shared fragments in a
MappingLibrary entry) is enough on its own. Purpose-written PDK plugins are for
the genuinely conditional remainder.

**Referencing established tools.** When writing new plugin logic, authors can
consult the publicly documented output *shapes* of established open-source tools —
the structure of the CRDs, patches, or templates those tools are known to emit —
as a reference for the target shape a new plugin must produce, while respecting
each project's license. Sidecar-injection webhooks, higher-level construct
libraries, operator CRD generators, and trait or composition catalogs all publish
output structures that map closely to what a comparable FeatureRecipe or plugin
needs to emit. The goal is matching a well-understood output contract, not copying
any project's implementation.
