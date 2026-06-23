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

## The `plugin:` field

Every Provider declares a `spec.plugin:` field carrying the URI of the Wasm rendering socket capable of producing the target format:

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Provider
metadata:
  name: helm
spec:
  plugin: "hub.aggrega.ai/providers/helm-renderer:1.0.0"
  baseSchema: |
    ...
  workloadSchema: |
    ...
```

`plugin:` is the routing primitive that ties the logical provider name (the Provider's `metadata.name`, e.g. `helm`) to the concrete Wasm artifact (`hub.aggrega.ai/providers/helm-renderer:1.0.0`). The compiler resolves a Recipe's `spec.provider: helm` value to the matching Provider entity, then dereferences `spec.plugin` to load the Wasm socket. The Recipe never names the Wasm plugin directly; it names the logical provider, and the Provider catalog entry supplies the indirection.

The plugin URI uses the same OCI registry conventions as the rest of the catalog. The version tag may be omitted at the Recipe authoring surface (per **Versioning** above); the resolved Provider entity still carries an explicit `plugin:` URI with a concrete version, captured at catalog publish time.

`plugin:` is distinct from FeatureRecipe `spec.pipeline[].plugin` — the latter is a Wasm mutation socket attached to a single FeatureRecipe pipeline step, not the format-renderer the whole Provider routes to. See [entities/featurerecipe.md](featurerecipe.md) for the FeatureRecipe pipeline shape.

## Standard Library Providers

The official catalog ships six first-class rendering providers:

* `helm` — Kubernetes Helm charts rendered to flat YAML via the Helm Go SDK
* `helm-chart` — Helm umbrella chart with per-component sub-charts (for Helm-native distribution)
* `compose` — Docker Compose fragments merged into a combined `docker-compose.yaml`
* `terraform` — Terraform `.tf.json` interoperable with standard HCL tooling
* `cloudformation` — AWS CloudFormation JSON templates
* `eval` — Wasm-formatter virtual-component provider (no physical compute; see [architecture/06-data-taxonomy-and-composition.md §10](../../architecture/06-data-taxonomy-and-composition.md))

Community and enterprise providers are registered via additional Wasm plugins published to the OCI registry.

## Provider Capability Gates

Some Recipe input kinds depend on Provider engine capability. For example, the synthesized input kind (`workload:`) requires a provider whose rendering engine can synthesize; a Recipe using `workload:` against a provider whose engine cannot is rejected at render time. The standard-library catalog declares `workloadSchema` on synthesis-capable providers by convention, as the documented translation contract — support is keyed on engine capability, not on that field's presence. See [providers/reference-matrix](../providers/reference-matrix.md) for the per-provider capability matrix.

## The two schemas — `baseSchema` vs `workloadSchema`

A Provider declares two distinct JSON Schema 2020-12 declarations that validate two distinct surfaces. The schemas are independent — they cover different validation scopes, run at different points in the compilation pipeline, and apply to different Recipe input kinds.

| Schema | Validates | Required? | Pipeline placement |
| --- | --- | --- | --- |
| `baseSchema` | The values dictionary the renderer assembles before invoking the provider engine for sourceless (generative) rendering | Required on every Provider | Step 5 Phase B, before the engine renders |
| `workloadSchema` | Documents how the provider's engine translates a Workload into native output — the translation contract, not a body validator (Workload bodies are validated against the platform-owned Workload schema, not this field) | Declared by convention on providers whose engine synthesizes; not compiler-required, and not the synthesis-capability gate (engine capability is) | Documentation-only today; consumed by the Wasm translator when it ships |

**`baseSchema:`** is the Recipe-output validation contract — what the values dict the renderer hands to the engine must look like. The values dict is assembled from the Recipe's `valuesMapping:` template output (sourced mode) or from the developer's component `values:` dictionary (sourceless mode). Each provider declares the keys + types its engine expects; sourceless-mode Recipes targeting a Provider whose `baseSchema` rejects the values dict halt at the Provider validation pass with a `CATALOG_ERROR:` attributing the failure to the Recipe + Provider pairing.

**`workloadSchema:`** is the Workload-to-native-output translation contract. Synthesized-mode Recipes (those declaring `workload:`) emit a Workload body that the bound Provider's engine translates into provider-native resources (Deployment + Services + PVCs for helm; service + volumes + networks for compose). A synthesis-capable Provider declares `workloadSchema` by convention to document how its engine reads the Workload — what fields it consumes, what closed sets each enum-shape field accepts, what range constraints apply. The field is documentation-only today: the per-provider synthesizer is hardcoded in the engine, informed by but not driven by the schema text, and it becomes the translator's rule set when the Wasm translator ships. Workload bodies themselves are validated against the platform-owned Workload schema (embedded in the compiler), not against this per-provider field.

The two schemas are independent JSON Schema 2020-12 declarations — they cover distinct surfaces and don't unify into one schema. A Provider whose engine supports both sourced and synthesized modes declares both by convention; a sourced-only provider declares only `baseSchema:`, and a synthesized-mode Recipe bound to it is rejected at render time.

## The `wellKnownAnnotations:` field

A Provider MAY declare an optional `wellKnownAnnotations:` array enumerating the platform-native well-known annotation keys — those under the reserved `aggrega.ai/` namespace — that its rendering engine reads, together with the behavior applied when each is absent. Each entry carries a `key` (the engine-read annotation, e.g. `aggrega.ai/namespace`), a `purpose` (what the annotation controls when present), and an optional `defaultBehavior` (what the engine does when the annotation is absent). `key` and `purpose` are required; entries preserve author order.

The field is documentation-of-contract: it describes which platform directives the engine recognises, for catalog readers and the `aggrega inspect` surface. The compiler does not consume it to gate, branch, or reject a build — it never cross-checks the annotations a deployment actually carries against this list. Schema validation checks only the shape of each entry (the key sits under the `aggrega.ai/` namespace, `purpose` is present); it is distinct from the runtime check that governs binding a value into the reserved namespace.

```yaml
spec:
  wellKnownAnnotations:
    - key: aggrega.ai/namespace
      purpose: Overrides the target namespace the engine renders into.
      defaultBehavior: Renders into the boundary's default namespace.
```

For the four-layer validation model that places these schemas alongside the JSON Schema envelope at higher entity boundaries, the per-pillar declarations, and the annotation-binding fragments, see [`vocabulary/validation-surface.md`](../vocabulary/validation-surface.md). For the per-provider schema content the standard-library Providers ship today, see [`providers/helm.md`](../providers/helm.md), [`providers/helm-chart.md`](../providers/helm-chart.md), and [`providers/compose.md`](../providers/compose.md).
