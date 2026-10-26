# Examples Overview

The Examples chapter set collects end-to-end worked examples exercising specific authoring patterns. Each chapter stands alone: the reader can read a single example in isolation to understand one pattern, or walk the set sequentially to build up a cohesive picture of how the authoring pieces compose. Examples are numbered sequentially across the chapter set — so a single authoritative Example N exists, regardless of which chapter introduces it.

Use this chapter set in two modes. For pattern lookup, jump directly to the chapter matching the concern: secret delivery in [Secrets](examples/04-secrets.md), cross-boundary routing in [Cross-Boundary Routing](examples/09-cross-boundary-routing.md), nested-aggregate composition in [Composition](examples/06-composition.md). For cumulative learning, read in order from Getting Started through Cross-Boundary Routing; later chapters reference patterns established in earlier ones without re-deriving them.

## Per-example reference

- [Getting Started](examples/01-getting-started.md) — Examples 1 through 3: Hello World (a single Component round-trip), Connecting Components (the injection contract), Parameters (one blueprint, many environments).
- [Data Model](examples/02-data-model.md) — Examples 4 through 6: the Parallel Namespace pattern for separating logic from physics, Release Inheritance and Manifest Composition, the Cloud-Native Types as component-classification vocabulary.
- [Features and Policies](examples/03-features-and-policies.md) — Examples 7 through 10: attaching a Feature that masks sensitive text on the AI gateway, Duck-Typing labels plus semantic selectors and interoperability constraints, Human-in-the-Loop approval gates, programmable policies — a Wasm mutator and an OPA validator.
- [Secrets](examples/04-secrets.md) — Examples 11 through 14: White-Box secrets where the Developer controls delivery, Black-Box secrets where Ops controls delivery, a Feature's own credential declared on the Feature and delivered to the workload that Feature renders, and a credential carried on one connection.
- [Credential Features](examples/05-credential-features.md) — the `core/secret-value` abstract credential Feature and its provider-specific FeatureRecipes walked through end-to-end.
- [Composition](examples/06-composition.md) — Examples 15 through 18: Nested Aggregates and Exported Components, External Services and Parameter Hoisting, Subsystems with cascading annotations, Feature Atomicity and attachment-owned topology.
- [Input Kinds](examples/07-input-kinds.md) — Examples 19 through 22: Recipe composition exercising the three input kinds (synthesized-only stateless service, multi-container synthesized Recipe with ConfigMap volumes, sourced chart with artifacts, external-file Workload loaded via `workload: { $import: ... }`).
- [Advanced Patterns](examples/08-advanced-patterns.md) — Examples 23 through 24: FeatureRecipe Resource Generation via `source:` + `valuesMapping:`, the Manifest Name-Tier Override with YAML Anchors.
- [Cross-Boundary Routing](examples/09-cross-boundary-routing.md) — Examples 25 through 26: Pre-Render Injection Interception via `injectMapping`, the complete Wasm stdin/stdout handshake for plugin authors.

## Runnable example workspaces

The chapters above teach one pattern at a time, inline. For complete, forkable workspaces you can compile with the `aggrega` CLI and run, see [Runnable Examples](examples/README.md), organised as a progressive-complexity path: a catalog-only stack assembled purely from standard-library entities (the smallest authoring surface), an authoring tier that builds its own catalog layer (a single-application stack across Compose and Kubernetes; the Manifest per-instance Recipe override), and an advanced tier (a multi-boundary platform, cross-boundary networking deployed two ways, annotation-driven Feature expansion).
