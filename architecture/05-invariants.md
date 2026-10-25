# Architectural Invariants

These eight invariants are the founding rules of Aggrega. They hold across releases, across the compiler core, the schema layer, the catalog, and the Wasm plugin surface. Every design decision, every feature, and every authored entity respects them.

Invariants are referenced by number across other architecture chapters. When a later chapter says "per Invariant 2" or "by the String Pipe rule (Invariant 3)," it points here.

## 1. The compiler is content-neutral, unopinionated, and agnostic to user intent

The Aggrega compiler is an Ahead-Of-Time (AOT) text-router. It parses YAML, traverses graphs, evaluates label intersections, and pipes strings from sources to sinks. It does not police what authors put into `values`, `parameters`, `infra`, `provides`, or `locals`. It does not enforce naming conventions, port conventions, or the semantic labels an Architect invents.

Many rules that sound like compiler rules — the Zero-Port Contract, Naked-Base / Flavored-Edges catalog style, the choice of which operational primitive fits a given component — are **Social Contracts**: best practices with escape hatches, upheld by Platform Architects authoring the standard-library catalog. The compiler does not interpret them.

**This invariant is about what the compiler infers from content you author, and that scope is the whole of it.** A handful of keys are Aggrega's own — reserved, with the values they accept written into the published schema — and the schema checks those the way it checks any other declared field. `component.aggrega.ai/type` is one: its value set is closed, and a document carrying a value outside it is refused when it loads. That is the platform stating what its own key means, not the compiler reading meaning into a string you wrote, and it leaves every key of your own exactly as unpoliced as this invariant says. A catalog classifying components on an axis Aggrega does not define authors its own label key, which the schema accepts with any string value and every selector surface reads identically.

What the compiler does enforce is narrow: schema validation, YAML parsing, graph construction, template evaluation, and the plain text-routing of the Injection Contract. Everything else is convention, enforced at catalog authoring time or inside the opt-in Wasm governance socket.

Enterprises authoring their own internal catalogs are explicitly free to break standard-library conventions. The compiler accepts whatever they write provided it passes schema validation. The architecture promotes best practices; it does not build prisons.

## 2. AOT purity: the compiler has no access to runtime information

Aggrega is an Ahead-Of-Time compiler. At compile time:

- It does not authenticate with cloud APIs.
- It does not fetch live IP addresses, DNS names, or cloud-generated URLs.
- It does not resolve secrets into plaintext — secrets remain metadata pointers throughout the Intermediate Representation.
- It does not know the runtime state of target clusters or services.
- It cannot fetch data that does not yet exist (post-provisioning endpoints, dynamically-assigned ports, auto-generated resource names).

Anything that depends on runtime state is expressed as a **deterministic pointer string** — a stable DNS name, a Terraform interpolation string, a CloudFormation resource reference — supplied by the Ops Recipe. The compiler pipes the pointer through without resolving it. The runtime environment (the cluster, the IaC state manager) resolves the final physical data.

This is **True Control Inversion**: developers dictate an Injection Contract in the Aggregate, the compiler wires deterministic pointers ahead of time, and the runtime environment resolves the final physical data. Requirements that genuinely need runtime resolution belong in an Ops Recipe's Wasm pipeline, not in the compiler core.

## 3. The String Pipe: the compiler cannot infer meaning

The compiler does not interpret what piped values mean. When Component A uses Component B, the compiler takes the scalar Component B's Recipe produces via `provides` — a string, a number, or a boolean — and pipes it into Component A's Recipe context, stringified deterministically at the injection boundary. Whether that value is an FQDN, a local hostname, an IP literal, a port number, or a Wasm-formatted DSN makes no difference: the compiler does not validate routability, protocol correctness, or semantic appropriateness.

Two consequences follow:

- The compiler does not guess component purpose from names. A component named `database-production` is not recognized as a database. Semantic type labels such as `component.aggrega.ai/type` (when present) are opaque metadata consumed for label matching, not compiler branching logic.
- The compiler does not distinguish a hostname from a database name from a port number from an arbitrary opaque value. They are all scalar entries in the injection context, delivered as strings.

The topology triad — `provides` on the producing Recipe, `uses` on the consuming Aggregate, `inject` on the edge — is the Injection Contract. The compiler evaluates labels and passes strings; interpretation is the authoring contract between Recipe and Component.

## 4. No Ghost Infrastructure: the compiler never invents compute or features

The compiler never silently injects compute, Features, annotations, routing proxies, or any other resource the author did not explicitly declare. Policy violations produce **Loud Guardrails** — the build halts with a specific error telling the author what to fix, in the document they wrote — not silent mutations that produce infrastructure mysteries at debug time.

Resources enter the graph through explicit authoring-time declarations:

- The developer's Aggregate (components, `uses` edges, Feature attachments).
- The Release's Feature attachments (Operator-level adds).
- Annotation-driven expansion (the Manifest declares annotation → Feature bindings; the annotation on a Component or boundary is explicit declaration).
- Recipe-level resource production: the Recipe's `source` rendering produces the primary artifact; `workload` synthesis emits the provider-specific deployment shape (Pod spec, Compose service, etc.); `artifacts:` entries (inline or `$import:`-loaded) emit Recipe-intrinsic auxiliary manifests; FeatureRecipe Resource Generation emits per-Feature auxiliary resources triggered by an explicit Feature attachment.

Recipe-level paths are authoring-time declarations one step removed: the Recipe author writes `source` / `workload` / `artifacts` / `valuesMapping` against a Component contract, and the developer's Aggregate selects which Components participate. A resource appearing in rendered output traces back to either a declaration in the Aggregate, the Release, an annotation binding, or the Recipe authoring that the Aggregate's component types selected.

Synthesis transforms author-declared shapes into provider-specific output formats. A Workload spec authored as a map of containers may render as a Kubernetes Pod spec, a Compose service block, or a Terraform module — the transformation is provider-driven, but the resources trace back to the author's Workload declaration.

The governance socket carries a per-attachment **role**, and the role — not the plugin's kind — fixes what an attachment may do to a build. A governance plugin attached in a **verdict role** — reviewing the IR graph (`ir-verdict`) or the rendered artifacts (`render-verdict`) — may reject a build but cannot change it. If such a verdict wants a resource added, it fails the build with a remediation pointer so the author adds the resource themselves; the host reads a verdict's output only as accept-or-reject and never applies it as a change, so an uninvited rewrite of the graph into compliance — exactly the ghost infrastructure this invariant forbids — cannot come from a verdict role. A governance plugin attached in a **transform role** (`label-transform` or `annotation-transform`) is the narrow, explicit exception: an operator who attaches one — opt-in, through the workspace `plugins.governance` configuration — has declared that transformation, so the changes it makes are explicit declaration, the same standing annotation-driven expansion has, not silent injection. The distinction is invitation: an unrequested verdict may not rewrite the build, while an explicitly-attached transform may, because the operator asked for it. Because a transform shapes the rendered output, it is pinned in the lockfile like every output-shaping plugin — the transform that applies is fixed at pull time, so changing it means re-pulling rather than a silent shift between builds; a verdict shapes no output and is not pinned.

## 5. The Aggregate is the authoring surface; Release cannot declare `values:`

The Release schema mechanically bans a `values:` block. Operators cannot write `values` on a Component or a Feature from a Release. This is schema enforcement at the JSON Schema level — not a social contract, not a convention — and it is loud: every entity document is validated against its kind's schema when it is loaded, so a Release carrying `values:` halts the build with a diagnostic naming the file and the offending key rather than being silently ignored.

This does not mean values are identical across environments. The supported path for per-environment variation is **Parameter Hoisting**:

1. The Developer exposes a typed `parameters.*` field in the Aggregate.
2. The Component's `values` template references it: `storage_size: "{{ .parameters.db_size }}"`.
3. The Release fulfills the parameter: `parameters: { db_size: "100Gi" }`.
4. The rendered output reflects the environment-specific value.

The Aggregate remains the Single Source of Truth for which values are exposed for environment variation (the `parameters` declaration) and how they flow into component values (the template reference). The Release fulfills; it does not override.

Two other constraints protect the same invariant:

- When a Release uses `extends`, declaring an `aggregate:` pointer is schema-forbidden. The child Release must deploy the same Developer Intent as its parent.
- The Release cannot introduce compute the Aggregate did not declare, and cannot retarget an edge the developer declared. Within the sockets the Architect declared, the Release may wire and configure edges between existing components: it sets per-edge `infra` on an edge the developer wired, or wires an edge into a declared-but-unbound socket to an existing component. It cannot declare per-edge `values` (those stay in the Aggregate), bind a socket the Component's `usesSchema` does not declare, or point an edge at a component that does not exist — each halts the build. Note which declaration that middle clause means: the socket must appear in the **catalog Component's** `usesSchema`. An Aggregate author may name a socket their component type does not declare, and the Release surface is deliberately not opened the same way — an operator wires and configures within an architecture rather than inventing one.

Per-edge connection configuration is consumer-scoped: the `values` and `infra` carried on an edge surface only in the render context of the node that authored the edge, never in the target's context. A component's own rendered output is therefore invariant with respect to the connections other components make to it — wiring or configuring an edge into a target never perturbs what the target's Recipe renders. The one place those connections are visible is a Feature attached to the target: its FeatureRecipe can read which components use the target, so the resources it emits — a policy admitting exactly the declared callers, say — follow the wiring, while the target's own output does not. Even there, the per-edge `values` and `infra` stay with the consumer.

## 6. The WebAssembly ABI Boundary: domain-specific intelligence lives in Wasm

The Go host binary contains zero cloud-specific or infrastructure logic. All domain-specific intelligence, template rendering, and formatting live strictly inside WebAssembly plugins executed by the embedded Wazero runtime. The Go host orchestrates the pipeline and passes payloads across the ABI to Wasm guests as memory pointers, in the encoding each socket carries.

Two corollaries follow:

- Provider-specific logic (Helm-specific rendering, Terraform-specific formatting, Compose-specific merging) never lives in the Go compiler core. The compiler resolves the provider name a Recipe declares in `spec.capability` to the provider-rendering Plugin that serves it and dispatches the node to that plugin; the translation itself runs entirely in the Wasm guest. The host holds no per-provider Go for a standard provider, so there is nothing in-process to fall back to — a provider name that resolves to no serving Plugin halts the build rather than rendering some built-in default.
- Policy logic (security rules, compliance checks, FinOps calculations) never lives in the Go compiler core. Policy belongs in the Wasm governance socket that enterprises opt into — a plugin attached in a verdict role (`ir-verdict` / `render-verdict`) to accept or reject a build, or in a transform role (`label-transform` / `annotation-transform`) to shape labels or annotations.

The ABI boundary keeps the Go core compact, auditable, and cloud-agnostic. Swapping a provider's rendering logic is a Wasm artifact swap, not a recompile of Aggrega itself.

## 7. Separation of Concerns (Four-Domain Split) — guidance, not prison

Aggrega's design guidance separates authoring into four domains:

- **Developer Intent** — Aggregate.
- **Platform Architect** — Component and Feature catalog entities.
- **Platform Ops** — Recipe, FeatureRecipe, Plugin (including the provider-rendering Plugin).
- **Platform Operator** — Manifest, Release.

The typical well-functioning deployment follows this split: developers write application intent, not physical infrastructure; Ops write physical infrastructure, not application logic. Aggrega is designed to be used this way, and official documentation, examples, and the standard-library catalog are authored against this split.

The Four-Domain Split is **guidance and design framing, not compiler enforcement**. The compiler (per Invariant 1) is unopinionated. Users are free to:

- Collapse roles (one person writing both Aggregates and Recipes).
- Mix concerns (Architects hardcoding compliance labels directly onto `core/*` Components when enterprise catalogs demand it).
- Cross domain boundaries (Developers using Parameter Hoisting to inject infrastructure concerns into the Aggregate when legacy code demands it).

The compiler accepts any authoring pattern that passes schema validation. The architecture promotes best practices; schema-level constraints (such as the Release `values:` ban in Invariant 5) are the only domain crossings the compiler actually rejects. All other separation is a Social Contract upheld by catalog authors and, where enterprises opt in, by the Wasm governance socket.

## 8. Deterministic Output

Given identical input, the compiler produces byte-identical output. Two compiles of the same Aggregate + Release + Manifest against the same catalog yield rendered artifacts that compare equal byte-for-byte.

This is the contract GitOps tools and diff-based review workflows rely on. A pull request that did not change input should produce no diff in rendered output. A pull request that did change input should show only the diff implied by that change — no spurious re-ordering, no timestamp churn, no map-iteration artefacts.

Deterministic output is maintained through three disciplines:

- Author-ordered maps: every map whose iteration order could affect rendered output uses an ordered-map container so iteration follows author declaration order rather than hash order.
- No wall-clock or random content in rendered artifacts unless the author explicitly injected it via template input.
- Rendering is pure: the same Wasm guest invocation with the same input produces the same output.

The compiler's `--trace` flag (see [`language-reference/cli/aggrega-build.md`](../language-reference/cli/aggrega-build.md)) gives authors and operators a verification surface for this invariant. Two compiles of the same input with `--trace` enabled produce byte-identical trace dumps; any per-pass diff localises a regression. Determinism is not just a release-time property — it is observable at every intermediate compiler state through the per-node trace layout.

Deterministic output is the contract that makes Aggrega safe to use as the source of truth in a GitOps loop.

### Tier-1 invariance scope

The byte-identical-output guarantee scopes to artifacts pinned in the lockfile — entities resolved through registry artifacts whose digests the lockfile records (Tier-3 acquisitions, in the [three-tier entity resolution model](13-catalog-and-registry.md#5-the-three-tier-entity-resolution-model)). When a build reads the files a Release names by path (Tier-1 paths beginning with `./` or `../`) or entities in workspace catalog directories (Tier-2 `catalog_dirs:`), invariance depends on those files remaining unchanged between builds. The lockfile records an entity in a workspace catalog directory by the digest of its document and the files it declares, so a build halts on one that changed since the pull rather than rendering it — with one exception: a Recipe or FeatureRecipe the Manifest names by a reference that is also a Component's or Feature's name is recorded under that reference as the Component or Feature, so its inputs are held only by the pins in the lock beside it, and an edit to its own document is not caught. Keeping the files as they were is the responsibility of the source-control system (typically Git).

A Tier-1 reference whose underlying file changes between two compiles produces a legitimate diff in rendered output even though the compiler's input shape is unchanged — the deterministic-output guarantee is preserved (same byte input → same byte output), but the inputs differ because the local file changed. Catalogs that need cross-build invariance for every source pull artifacts from a registry into the lockfile-pinned cache (Tier 3) rather than from a workspace directory (Tier 1/2); the lockfile is the byte-identity anchor.
