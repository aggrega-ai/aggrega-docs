# Terraform Provider

The terraform provider renders Aggrega Recipes into Terraform configuration. It emits configuration and **never runs Terraform**: an Aggrega build is an ahead-of-time compilation, so it cannot resolve the resource IDs, IP addresses, and outputs that only exist after `terraform apply`. Terraform's `${ ... }` interpolations pass through untouched as deterministic pointer strings that the Terraform runtime resolves later. The provider is offline and hermetic — it never touches the network and never invokes `terraform` or `tofu`.

The terraform provider writes each node's files directly at the node's evaluated path; it performs no per-boundary merge or umbrella step. Two nodes rendered by the terraform provider produce two independent file sets.

## Supported input kinds

The terraform provider accepts two of the three Recipe input kinds:

- **Artifacts mode.** A Recipe authors Terraform configuration as a templated body; the provider evaluates the Aggrega template and emits the result verbatim, byte-for-byte. HCL (`main.tf`) is the ergonomic default, and Terraform JSON (`.tf.json`) is accepted equivalently. Build provenance is stamped as a Terraform comment; for a JSON body — which has no comment syntax — provenance is written as a companion file rather than inline.
- **Sourced mode.** A Recipe references a Terraform module with `source:`. The module's files are vendored verbatim into the node's output, and the Recipe's `valuesMapping:` overlays the module's input variables as an auto-loaded `aggrega.auto.tfvars.json`. The module body is preserved exactly as authored; only the generated `.tfvars.json` carries Aggrega-supplied values.

The **synthesized** input kind is not offered. There is no faithful, capability-agnostic mapping from the platform Workload kind to arbitrary Terraform resources, so a Recipe that declares `workload:` against the terraform provider is a loud error rather than an invented translation.

## Verbatim emission and vendoring

The terraform provider does not transpile, reformat, or rewrite Terraform bodies. An authored HCL or `.tf.json` body is emitted exactly as written, and a sourced module is vendored file-for-file. This is what keeps terraform output deterministic and reproducible: given the same inputs, the rendered configuration is byte-identical across runs, and a vendored module round-trips unchanged. Because the provider never resolves runtime state, everything runtime-dependent stays an interpolation string that Terraform binds at apply time.

## Structural input validation

The terraform provider validates a sourced module's structure **before** it renders. It parses the module's HCL and `.tf.json` files and reports parse errors, halting the build with a clear message that names the offending node and the provider. The parse checks shape, not semantics — it does not resolve providers, evaluate expressions, or contact a registry. Validation is hermetic: it uses a self-contained HCL parser compiled into the provider, with no `terraform` binary and no network access. A malformed module is caught at the authoring boundary rather than surfacing as a confusing error at a later `terraform` run.

## FeatureRecipe patch boundary

A post-render FeatureRecipe `pipeline` step patches only output the provider renders into a **structured tree**. For terraform this means:

- **JSON-authored Terraform is patchable.** A `.tf.json` module and the auto-loaded `aggrega.auto.tfvars.json` overlay are structured documents, so a pipeline step's JSONPatch edits the addressed values in place and leaves every other byte — ordering, formatting, surrounding keys — untouched.
- **Native HCL is opaque.** A native-HCL body (`main.tf`) is not a structured patch target. A patch against an opaque body halts the build with a diagnostic rather than mutating text it cannot address structurally; authoring a pipeline step against an HCL body is a design error surfaced as a loud halt, not a silent no-op.

An author who needs a Terraform body to be pipeline-patchable therefore authors it as `.tf.json` (or drives the values through the `.tfvars.json` overlay). See [FeatureRecipe](../entities/featurerecipe.md) for the general patch-target boundary across providers.

## Related references

- [Provider architecture](architecture.md) — how providers fit into the compilation pipeline and per-provider dispatch.
- [Provider capability matrix](reference-matrix.md) — per-provider input-kind support across the current surface.
- [Recipe entity](../entities/recipe.md) — the Recipe authoring surface and the three input kinds.
- [FeatureRecipe](../entities/featurerecipe.md) — the post-render `pipeline` patch model and its structured/opaque boundary.
- [Recipe input composition](../../architecture/16-recipe-input-composition.md) — the canonical Provider Capability Matrix.
