# Provider

The conceptual role of the Provider entity (Domain 3 — the global plugin registrar) lives in [architecture/04-eight-entity-taxonomy.md](../../architecture/04-eight-entity-taxonomy.md). This page covers the Provider catalog authoring surface. The per-provider capability matrix (helm, helm-chart, compose, terraform, cloudformation) lives in [providers/](../providers/).

## The Provider's Role

A Provider acts as an "Engine Format Instruction" mapping a logical name (e.g., `helm`) to a concrete Wasm rendering plugin (e.g., `helm-renderer.wasm`). It is the routing contract between the Go compiler and the downstream format-specific rendering logic.

When a Recipe declares `spec.provider: helm`, the compiler:

1. Resolves the Provider entry to locate its associated Wasm rendering plugin.
2. Consults the Provider's Wasm socket to dynamically validate the Recipe's `source` block (because Recipe source schemas are target-agnostic — see [entities/recipe](recipe.md) §A Wasm-Driven Source Schemas).
3. Passes the rendered AST to the Wasm rendering socket for final stringification to the native format (YAML for Helm, `.tf.json` for Terraform, etc.).

## Versioning

Recipes should reference the exact version of the provider they were authored for (e.g., `spec.provider: "helm:1.0.0"`). If the version tag is omitted (e.g., `spec.provider: "helm"`), the compiler dynamically falls back to fetching the `latest` available version of the Wasm plugin from the registry. The IDE Language Server (LSP) runs this resolved Wasm plugin in the background, extracting its native JSON schema to provide real-time autocomplete and linting directly to the developer.

## Standard Library Providers

The official catalog ships four first-class rendering providers:

* `helm` — Kubernetes Helm charts rendered to flat YAML via the Helm Go SDK
* `helm-chart` — Helm umbrella chart with per-component sub-charts (for Helm-native distribution)
* `compose` — Docker Compose fragments merged into a combined `docker-compose.yaml`
* `terraform` — Terraform `.tf.json` interoperable with standard HCL tooling
* `cloudformation` — AWS CloudFormation JSON templates
* `eval` — Wasm-formatter virtual-component provider (no physical compute; see [architecture/06-data-taxonomy-and-composition.md §10](../../architecture/06-data-taxonomy-and-composition.md))

Community and enterprise providers are registered via additional Wasm plugins published to the OCI registry.

## Provider Capability Gates

Some Recipe input kinds are gated by Provider capability declaration. For example, the synthesized input kind (`workload:` / `workloadFrom:`) requires the target Provider to declare `workloadSchema` on its `spec`; Recipes using `workload:` against a Provider that does not declare `workloadSchema` are rejected at Recipe load time. See [providers/reference-matrix](../providers/reference-matrix.md) for the per-provider capability matrix.
