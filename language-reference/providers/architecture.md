# Provider Architecture

A Provider is a rendering engine registered with the compiler. When a Recipe declares `provider: helm`, `provider: compose`, or any other provider name, the compiler dispatches rendering to the Provider entity registered under that name. This chapter covers the Provider entity's role in the compilation pipeline, how dispatch works, and the plugin-socket contract that binds the Go compiler to each rendering engine.

What this chapter does **not** cover: the three-input-kinds composition model (`source:` + `valuesMapping:`, `workload:` / `workloadFrom:`, `artifacts:` / `artifactsFrom:`) that a Recipe uses to produce its output. That model is cross-cutting across every provider and lives in [../../architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md), including the Provider Capability Matrix that maps which input kind each provider supports today.

## The Provider entity

A Provider is an authored catalog entity — a YAML document with `kind: Provider` — that declares:

- **`plugin`** — the URI of the Wasm rendering socket that implements the provider's translation from Recipe input into provider-native output. Different providers bind different plugins (`helm-renderer.wasm`, `compose-renderer.wasm`, and so on).
- **`baseSchema`** — a CUE schema describing the keys the provider understands when a Recipe uses the sourceless sub-mode of the sourced input kind (a Recipe with `valuesMapping:` but no external `source:`). Sourceless Recipes have their `valuesMapping` output validated against this schema.
- **`workloadSchema`** — a CUE schema documenting how the platform-owned Workload kind translates into this provider's native output. A Provider declaring `workloadSchema` supports the synthesized input kind (`workload:` / `workloadFrom:`); a Provider omitting `workloadSchema` does not.

See [../entities/provider.md](../entities/provider.md) for the full field-level authoring surface of the Provider entity.

## Per-provider dispatch

Every Recipe declares exactly one `provider:` at the top of its `spec`. The compiler reads this field and dispatches rendering through the matching Provider entity's plugin. A Recipe cannot target multiple providers at once. Multi-provider composition happens at the Release level: a boundary can hold mixed-provider components, and each provider's contributors at the boundary's evaluated assembly path are assembled independently — one assembly per `(path, provider)` tuple.

The dispatch path for a single node:

1. The compiler resolves the Recipe URI for this node through the Manifest's three-tier lookup under the target provider's mapping section. The Manifest's provider-axis grouping is what makes "the same Component, different Recipes for different providers" a natural pattern.
2. The resolved Recipe's `spec.provider` identifies the Provider entity to dispatch to.
3. The compiler resolves the Provider entity through the standard catalog three-tier lookup (local path, workspace cache, remote OCI registry).
4. The compiler invokes the Provider's plugin socket with the per-node render context (pillar values, `.context.*` projections, the Recipe's input kinds).
5. The plugin returns rendered output. The compiler routes the rendered files to the per-`(path, provider)` assembler keyed on the boundary's evaluated `directory:` joined with the per-component `subDirectory:`. Two boundaries that evaluate to the same path under the same provider share an assembler — the canonical pattern is a parent boundary plus two child boundaries with `directory: "{{ .parent_boundary.directory }}"` collapsing into one merged assembly.

See [../entities/manifest.md](../entities/manifest.md) for the Manifest's provider-axis dispatch shape, and [../entities/recipe.md](../entities/recipe.md) for the Recipe-side single-provider declaration. The per-`(path, provider)` assembly model and the path-template variable allowlist that controls evaluated paths are documented in [../path-template-variables.md](../path-template-variables.md).

## The Wasm plugin contract

Provider rendering runs inside a WebAssembly sandbox. The Go compiler is the host; each provider's rendering plugin is the guest. The compiler passes the per-node render context as a JSON payload; the plugin returns rendered manifest files as a JSON response. This contract is uniform across every provider:

- **JSON in, JSON out.** The compiler serializes the render context (pillars, resolved `.source`, parsed `.workload`, artifact templates, and boundary metadata) as JSON and hands it to the plugin. The plugin returns a JSON object mapping output filenames to their rendered content.
- **No filesystem access.** Plugins cannot read arbitrary files from the host filesystem. File inputs the plugin needs (a Helm chart directory, a Terraform module tree) are either staged into the sandbox's virtual filesystem by the compiler or fetched via an OCI pull the compiler performs before invoking the plugin.
- **No network access.** Plugins are deterministic and hermetic. Any external resources the plugin needs arrive as inputs in the JSON payload or in the pre-staged virtual filesystem.
- **Deterministic output.** Given the same JSON input and the same plugin version, the plugin must produce byte-identical JSON output. This is the contract that makes the compiler's byte-identical output guarantee hold end-to-end through the plugin layer.

The plugin-socket architecture at the broader extensibility level, including the other Wasm sockets in the compilation pipeline (the `mutator.wasm` and `policy-validator.wasm` gates), lives in [../../architecture/14-extensibility.md](../../architecture/14-extensibility.md).

## Aggrega's standard-library providers

The `helm`, `helm-chart`, `compose`, `terraform`, and `cloudformation` Providers together form the standard-library provider set. Each ships as a YAML Provider entity plus its Wasm plugin; together they cover the common deployment targets without requiring enterprise teams to author their own Providers.

- [`helm`](helm.md) — native Kubernetes rendering. Sourced mode wraps Helm charts via the Helm SDK; the synthesized input kind translates the Workload into Deployment / StatefulSet + Services + PVCs.
- [`helm-chart`](helm-chart.md) — umbrella-chart composition. Packages multiple components into a single Helm chart per boundary, one sub-chart per component.
- [`compose`](compose.md) — Docker Compose rendering. Per-boundary `docker-compose.yaml` output; the synthesized input kind translates the Workload into compose `services:` + `volumes:` + `networks:`.
- [`terraform`](terraform.md) — Terraform rendering. `.tf.json` output for IaC-native deployments; Workload synthesis for Terraform targets is not yet implemented.
- [`cloudformation`](cloudformation.md) — CloudFormation rendering. Template-JSON output for AWS-native deployments; Workload synthesis for CloudFormation targets is not yet implemented.

The [reference matrix](reference-matrix.md) summarises per-provider input-kind support at a glance; the canonical matrix covering both what ships today and the designed target shape lives in [../../architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md).

## Custom providers

Enterprise teams authoring their own providers follow the same pattern as the standard library: author a Provider YAML entity declaring `plugin:`, `baseSchema:`, and optionally `workloadSchema:`, then ship a Wasm plugin implementing the JSON-in / JSON-out rendering contract. The compiler treats custom Providers identically to standard-library Providers; per-provider dispatch works on the provider name declared by the Recipe, not on any standard-library enumeration.

Plugin authoring conventions (Rust, Go, or TypeScript targeting the Aggrega JSON-in / JSONPatch-out handshake) and the SDK that supports them are tracked in the project roadmap.
