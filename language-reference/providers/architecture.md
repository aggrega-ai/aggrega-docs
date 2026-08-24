# Provider Architecture

A provider renders a Recipe's input kinds into provider-native manifest files. When a Recipe declares `capability: helm`, `capability: compose`, or any other provider name, the compiler dispatches rendering to the provider that serves that name. This chapter covers how a provider is realised as a provider-rendering Plugin, how dispatch works, and the plugin-socket contract that binds the compiler to each provider.

What this chapter does **not** cover: the three-input-kinds composition model (`source:` + `valuesMapping:`, `workload:`, `artifacts:` — each accepting inline content or `$import:` per the unified file-import vocabulary) that a Recipe uses to produce its output. That model is cross-cutting across every provider and lives in [../../architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md), including the Provider Capability Matrix that maps which input kind each provider supports.

## The provider-rendering Plugin

Provider rendering is served by a Plugin with `pluginType: provider`. The provider-rendering Plugin:

- **serves one or more provider names** — declared in `spec.provider.capabilities`. The provider name a Recipe names (`spec.capability: helm`) binds to the provider-rendering Plugin whose `spec.provider.capabilities` list includes that name. When more than one Plugin serves the same target, the workspace chooses between them via a provider binding in `.aggrega-config.yaml`, resolved at `aggrega pull` and recorded in the lockfile; with no binding and exactly one candidate that candidate is used, and with no binding and more than one candidate the build halts loudly, naming the candidate plugins.
- **carries its provider-socket metadata in the same block** — `spec.provider` holds the capability list above alongside the rest of the provider's declarations. `spec.provider.workloadSchema` is a JSON Schema 2020-12 declaration documenting how the platform-owned Workload kind translates into this provider's native output; the standard-library catalog declares it on providers that synthesize, as the documented translation contract. `spec.provider.wellKnownAnnotations` enumerates the `aggrega.ai/` boundary annotations the provider reads. Synthesized-input (`workload:`) support is a property of the provider, enforced at render time — not determined by `workloadSchema`'s presence.

See [../entities/plugin.md](../entities/plugin.md) for the full field-level authoring surface of the Plugin entity, including the `spec.provider` block.

## Per-provider dispatch

Every Recipe declares exactly one `capability:` at the top of its `spec`. The compiler reads this field and dispatches rendering to the provider that serves the name. A Recipe cannot target multiple providers at once. Multi-provider composition happens at the Release level: a boundary can hold mixed-provider components, and each provider's contributors at the boundary's evaluated assembly path are assembled independently — one assembly per `(path, provider)` tuple.

The dispatch path for a single node:

1. The compiler resolves the Recipe URI for this node through the Manifest's three-tier lookup under the target provider's mapping section. The Manifest's provider-axis grouping is what makes "the same Component, different Recipes for different providers" a natural pattern.
2. The resolved Recipe's `spec.capability` identifies the provider name to dispatch to.
3. The compiler binds the provider for that name: it resolves the provider-rendering Plugin whose `spec.provider.capabilities` list includes the name and renders through that Plugin's guest. Rendering is Wasm-only — there is no in-host renderer to fall back to, so a provider name that resolves to no serving Plugin halts the build loudly at routing time.
4. The provider is invoked with the per-node render context (pillar values, `.context.*` projections, the Recipe's input kinds).
5. The provider returns rendered output. The compiler routes the rendered files to the per-`(path, provider)` assembler keyed on the boundary's evaluated `directory:` joined with the per-component `subDirectory:`. Two boundaries that evaluate to the same path under the same provider share an assembler — the canonical pattern is a parent boundary plus two child boundaries with `directory: "{{ .parent_boundary.directory }}"` collapsing into one merged assembly.

See [../entities/manifest.md](../entities/manifest.md) for the Manifest's provider-axis dispatch shape, and [../entities/recipe.md](../entities/recipe.md) for the Recipe-side single-provider declaration. The per-`(path, provider)` assembly model and the path-template variable allowlist that controls evaluated paths are documented in [../path-template-variables.md](../path-template-variables.md).

## The Wasm plugin contract

Provider rendering runs inside a WebAssembly sandbox. The Go compiler is the host; the provider-rendering Plugin is the guest. The compiler passes the per-node render context as a JSON payload; the plugin returns rendered manifest files as a JSON response. This contract is uniform across every provider:

- **JSON in, JSON out.** The compiler serializes the render context (pillars, resolved `.source`, parsed `.workload`, artifact templates, and boundary metadata) as JSON and hands it to the plugin. The plugin returns a JSON object mapping output filenames to their rendered content.
- **No filesystem access.** Plugins cannot read arbitrary files from the host filesystem. File inputs the plugin needs (a Helm chart directory) are either staged into the sandbox's virtual filesystem by the compiler or fetched via an OCI pull the compiler performs before invoking the plugin.
- **No network access.** Plugins are deterministic and hermetic. Any external resources the plugin needs arrive as inputs in the JSON payload or in the pre-staged virtual filesystem.
- **Deterministic output.** Given the same JSON input and the same plugin version, the plugin must produce byte-identical JSON output. This is the contract that makes the compiler's byte-identical output guarantee hold end-to-end through the plugin layer.

The plugin-socket architecture at the broader extensibility level, including the other Wasm sockets in the compilation pipeline (the governance socket's transform and verdict roles), lives in [../../architecture/14-extensibility.md](../../architecture/14-extensibility.md).

## Aggrega's standard-library providers

The `helm`, `helm-chart`, `compose`, `terraform`, and `cloudformation` providers together form the standard-library provider set. They cover the common deployment targets without requiring enterprise teams to author their own providers.

[`helm`](helm.md) supports all three input kinds: **sourced** (Helm chart wrapping via the Helm SDK with the Recipe's `valuesMapping` output as the chart's overrides), **synthesized** (flat Kubernetes YAML — a controller object chosen by the Workload's `form` (Deployment, StatefulSet, DaemonSet, or Job) plus Services and PVCs — emitted from a parsed Workload), and **artifacts** (standalone YAML files alongside the chart output). See the Provider Capability Matrix in [../../architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md) for current shipping status across the three kinds.

[`helm-chart`](helm-chart.md) supports sourced mode (umbrella-chart composition: one chart per boundary, one sub-chart per component) and both artifact forms. An `$import:`-loaded `artifacts:` entry is Go-templated by Aggrega first, then injected into the chart's `templates/` directory pre-render; an inline-content `artifacts:` entry is placed verbatim at the sub-chart root, where the chart's own templates read it via Helm's `.Files.Get` / `.Files.Glob`. The synthesized input kind is not applicable: the umbrella orchestrates sub-charts, while the Workload kind is a leaf concept that belongs inside each sub-chart (the `helm` provider's domain).

[`compose`](compose.md) supports all three input kinds: **sourced** (loads a compose file and deep-merges the `valuesMapping` overlay), **synthesized** (emits compose `services:` + `volumes:` + `networks:` from a parsed Workload for the `stateless` and `stateful` forms, with degraded volume handling for `persistentTemplate` — per-replica PVCs collapse to a single shared named volume with a warning; the `daemon`, `scheduled`, and `task` forms have no compose mapping and halt loudly), and **artifacts** (compose fragments whose top-level keys `services:` / `networks:` / `volumes:` / `configs:` merge into the per-boundary combined `docker-compose.yaml`).

[`terraform`](terraform.md) supports **sourced** (vendors a Terraform module verbatim and supplies the `valuesMapping` output as the arguments of that component's `module` block in the boundary's root configuration) and **artifacts** (emits an authored HCL or `.tf.json` body byte-for-byte). It does not offer the synthesized input kind — there is no faithful mapping from the platform Workload kind to arbitrary Terraform resources. The provider emits configuration and never runs Terraform; runtime-dependent values stay as `${ ... }` interpolation strings the Terraform runtime resolves at apply time.

[`cloudformation`](cloudformation.md) renders a boundary into one AWS CloudFormation stack template, assembling the resource fragments its components author into a single pure-JSON template, surfacing each component's `provides` as stack `Outputs`, and wiring `uses` edges as `Fn::GetAtt` within a stack and as `Fn::ImportValue` / `Fn::GetStackOutput` across stacks. It supports sourced and artifacts input and emits configuration without ever running CloudFormation; runtime-only values stay as CloudFormation intrinsics.

The [provider reference index](reference-matrix.md) routes you to each provider's own reference page; which input kinds each one accepts is answered by the capability matrix in [../../architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md).

## Custom providers

Enterprise teams authoring their own providers follow the same pattern as the standard library: author a provider-rendering Plugin (`pluginType: provider`) declaring the provider name(s) it serves in `spec.provider.capabilities`, alongside the rest of its `spec.provider` metadata, then ship the Wasm artifact implementing the JSON-in / JSON-out rendering contract. The compiler treats custom providers identically to standard-library providers; per-provider dispatch works on the provider name declared by the Recipe.

Plugin authoring conventions (Rust, Go, or TypeScript targeting the Aggrega JSON-in / JSONPatch-out handshake) and the SDK that supports them are tracked in the project roadmap.
