# Terraform Provider

The terraform provider renders Aggrega Recipes into Terraform configuration. It emits configuration and **never runs Terraform**: an Aggrega build is an ahead-of-time compilation, so it cannot resolve the resource IDs, IP addresses, and outputs that only exist after `terraform apply`. Terraform's `${ ... }` interpolations pass through untouched as deterministic pointer strings that the Terraform runtime resolves later. The provider is offline and hermetic — it never touches the network and never invokes `terraform` or `tofu`.

The terraform provider writes each node's files directly at the node's evaluated path; it performs no per-boundary merge or umbrella step. Two nodes rendered by the terraform provider produce two independent file sets.

## Supported input kinds

The terraform provider accepts two of the three Recipe input kinds:

- **Artifacts mode.** A Recipe authors Terraform configuration as a templated body; the provider evaluates the Aggrega template and emits the result verbatim, byte-for-byte. HCL (`main.tf`) is the ergonomic default, and Terraform JSON (`.tf.json`) is accepted equivalently. Build provenance is stamped as a Terraform comment; for a JSON body — which has no comment syntax — provenance is written as a companion file rather than inline.
- **Sourced mode.** A Recipe references a Terraform module with `source:`. The module's files are vendored verbatim into the node's output, and the Recipe's `valuesMapping:` overlays the module's input variables as an auto-loaded `aggrega.auto.tfvars.json`. The module body is preserved exactly as authored; only the generated `.tfvars.json` carries Aggrega-supplied values. Where the node's declared `values` leaves become the module's inputs directly — a `source:` Recipe with no `valuesMapping:` — an input carrying material an author declared sensitive also gets a generated override file carrying Terraform's own sensitivity attribute; a `valuesMapping:` template invents its output names, so that case carries no marking. Both are described under [Declared-sensitive module inputs](#declared-sensitive-module-inputs).

The **synthesized** input kind is not offered. There is no faithful, capability-agnostic mapping from the platform Workload kind to arbitrary Terraform resources, so a Recipe that declares `workload:` against the terraform provider is a loud error rather than an invented translation.

## Verbatim emission and vendoring

The terraform provider does not transpile, reformat, or rewrite Terraform bodies. An authored HCL or `.tf.json` body is emitted exactly as written, and a sourced module is vendored file-for-file. This is what keeps terraform output deterministic and reproducible: given the same inputs, the rendered configuration is byte-identical across runs, and a vendored module round-trips unchanged. Because the provider never resolves runtime state, everything runtime-dependent stays an interpolation string that Terraform binds at apply time.

## Declared-sensitive module inputs

Terraform is the one standard-library target with a native per-value sensitivity primitive, so a datum an author declared sensitive can be rendered in Terraform's own terms rather than only recorded in Aggrega's.

When a vendored module's input carries material an author declared sensitive, the provider appends one more file beside the module, `aggrega_override.tf.json`, declaring `sensitive = true` for that input:

```json
{
  "variable": {
    "db_password": {
      "sensitive": true
    }
  }
}
```

Terraform merges a configuration file whose name is the bare `override` or ends in `_override` into the configuration in the same directory, so the module's own `variable` block acquires the attribute while every vendored byte stays exactly as authored. The input's declared type, default and description are untouched — the override carries the sensitivity attribute and nothing else. An unmarked node gains no such file.

**Which input is marked comes from a declaration, never from a name.** The provider reads the marking the compilation computed and inspects nothing itself: it does not recognise `password`, `secret` or `token`, and it does not read the module's text to guess. A module input named `db_password` whose value carries no declaration is emitted unmarked, and a declared input named `region` is marked.

**The marking travels only where the input's identity is recoverable from the declaration.** A Recipe that vendors a module with `source:` and lets the node's declared `values` leaves become the module's inputs directly gives each input the same name the author declared, so the link is exact. A Recipe that reshapes those values through a `valuesMapping:` template invents its output names, and no declaration names them — so the marking is absent rather than approximated. Absence is deliberate: guessing which reshaped input carried the declared datum would mark a public input as secret, and Terraform would then suppress a value from plan output that was never sensitive.

### What Terraform's `sensitive` does and does not guarantee

Aggrega promises exactly what Terraform's own attribute delivers, and no more.

**It bounds display.** A sensitive value reads as `(sensitive value)` in plan output and `<sensitive>` in apply output. The marking propagates through expressions, so a value derived from a sensitive input is sensitive too, and Terraform refuses to export one from a root `output` that is not itself marked sensitive — a loud error rather than a silent disclosure.

**It does not change storage, and it is not encryption.** Terraform records a sensitive value in state in the clear. Reading `sensitive = true` as a promise that state is safe to commit or share is the one misreading to avoid: protecting state remains a matter of how the state backend is configured, exactly as it is for a module carrying no marking at all. The attribute also does not restrict who may read the value, does not affect what a provider transmits, and does not change the rendered configuration in any other way.

So the marking makes a declared-sensitive input harder to disclose by accident when someone reads a plan. It does not make the deployable safe to publish. See [Declaring a leaf sensitive](../vocabulary/compact-form-authoring.md) for the keyword and for what a declaration achieves across every target.

## Structural input validation

The terraform provider validates a sourced module's structure **before** it renders. It parses the module's HCL and `.tf.json` files and reports parse errors, halting the build with a clear message that names the offending node and the provider. The parse checks shape, not semantics — it does not resolve providers, evaluate expressions, or contact a registry. Validation is hermetic: it uses a self-contained HCL parser compiled into the provider, with no `terraform` binary and no network access. A malformed module is caught at the authoring boundary rather than surfacing as a confusing error at a later `terraform` run.

## FeatureRecipe patch boundary

A post-render FeatureRecipe `pipeline` step patches only output the provider renders into a **structured tree**. For terraform this means:

- **JSON-authored Terraform is patchable.** A `.tf.json` module and the auto-loaded `aggrega.auto.tfvars.json` overlay are structured documents, so a pipeline step's JSONPatch edits the addressed values in place and leaves every other byte — ordering, formatting, surrounding keys — untouched.
- **Native HCL is opaque.** A native-HCL body (`main.tf`) is not a structured patch target. A patch against an opaque body halts the build with a diagnostic rather than mutating text it cannot address structurally; authoring a pipeline step against an HCL body is a design error surfaced as a loud halt, not a silent no-op.

An author who needs a Terraform body to be pipeline-patchable therefore authors it as `.tf.json` (or drives the values through the `.tfvars.json` overlay). See [FeatureRecipe](../entities/featurerecipe.md) for the general patch-target boundary across providers.

## Deployment ordering

A Release boundary's `syncWave:` value does not order Terraform configuration. The wave is a deployment-ordering hint that Kubernetes tooling reads from an annotation on each rendered resource, and a Terraform configuration has no equivalent surface — the provider derives no `depends_on`, and no other ordering construct, from it.

The value is not discarded: it is recorded with the rest of the node's build provenance, as `aggrega.ai/sync-wave` in the stamped comment block, or in the companion provenance file where the body is JSON. A rendered configuration therefore records which wave its boundary declared without that record changing anything Terraform does.

Ordering between Terraform resources stays Terraform's own concern. Express it with the module's own `depends_on` and reference expressions, which the provider emits verbatim like every other part of the body.

## Related references

- [Provider architecture](architecture.md) — how providers fit into the compilation pipeline and per-provider dispatch.
- [Provider reference index](reference-matrix.md) — what each standard-library provider produces, and which page answers which question.
- [Recipe entity](../entities/recipe.md) — the Recipe authoring surface and the three input kinds.
- [FeatureRecipe](../entities/featurerecipe.md) — the post-render `pipeline` patch model and its structured/opaque boundary.
- [Recipe input composition](../../architecture/16-recipe-input-composition.md) — the canonical Provider Capability Matrix.
