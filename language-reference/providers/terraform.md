# Terraform Provider

The terraform provider renders Aggrega Recipes into Terraform configuration. It emits configuration and **never runs Terraform**: an Aggrega build is an ahead-of-time compilation, so it cannot resolve the resource IDs, IP addresses, and outputs that only exist after `terraform apply`. Terraform's `${ ... }` interpolations pass through untouched as deterministic pointer strings that the Terraform runtime resolves later. The provider is offline and hermetic — it never touches the network and never invokes `terraform` or `tofu`.

## How a boundary is laid out

The terraform provider composes a boundary rather than emitting its components side by side. Every boundary it renders gets one **root configuration**, `aggrega.modules.tf`, declaring each component rendered there as a `module` block whose `source` is that component's own sub-directory under `modules/`:

```hcl
module "cache" {
  source = "./modules/cache"
}

module "db" {
  source = "./modules/db"
}
```

Each component's own files — the vendored module, the generated overlay, the provenance stamp — sit in the sub-directory its block points at. This is Terraform's standard root-composes-children structure, whose convention is that nested modules live under a `modules/` sub-directory, and it is the layout every terraform boundary gets, whether it holds one component or several.

The shape is load-bearing rather than cosmetic, for two reasons.

**A Terraform dependency graph is per-configuration.** Components emitted into separate directories are separate graphs with no relationship: neither a reference nor a `depends_on` can reach from one to another, and no single `terraform plan` sees both. One root composing each component as a child module puts a whole boundary in one graph and one plan.

**A component's files are addressed by its own directory.** Two components in one boundary can vendor modules that write identically-named files — `main.tf`, `variables.tf`, the generated overlay — and each set sits under its own component's directory rather than contending for one path.

## Supported input kinds

The terraform provider accepts two of the three Recipe input kinds:

- **Artifacts mode.** A Recipe authors Terraform configuration as a templated body; the provider evaluates the Aggrega template and emits the result verbatim, byte-for-byte. HCL (`main.tf`) is the ergonomic default, and Terraform JSON (`.tf.json`) is accepted equivalently. Build provenance is stamped as a Terraform comment; for a JSON body — which has no comment syntax — provenance is written as a companion file rather than inline.
- **Sourced mode.** A Recipe references a Terraform module with `source:`. The module's files are vendored verbatim into the node's output, and the Recipe's `valuesMapping:` becomes `aggrega.auto.tfvars.json`, written beside the module's own files in that component's directory. The module body is preserved exactly as authored; only the generated `.tfvars.json` carries Aggrega-supplied values. Where the node's declared `values` leaves become the module's inputs directly — a `source:` Recipe with no `valuesMapping:` — an input carrying material an author declared sensitive also gets a generated override file carrying Terraform's own sensitivity attribute; a `valuesMapping:` template invents its output names, so that case carries no marking. Both are described under [Declared-sensitive module inputs](#declared-sensitive-module-inputs).

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

The worked example [`terraform-declared-sensitivity`](../examples/terraform-declared-sensitivity/) builds this end to end and is small enough to read in full: one component declaring three `values` leaves, of which two carry public identifiers and one carries the credential. Its rendered output shows the overlay carrying all three module inputs and the override naming only the declared one, so both halves of the rule are visible in the same build — including that a credential *identifier* sitting beside the secret is left unmarked. Removing the one declaration and rebuilding emits no override file at all.

### What Terraform's `sensitive` does and does not guarantee

Aggrega promises exactly what Terraform's own attribute delivers, and no more.

**It bounds display.** A sensitive value reads as `(sensitive value)` in plan output and `<sensitive>` in apply output. The marking propagates through expressions, so a value derived from a sensitive input is sensitive too, and Terraform refuses to export one from a root `output` that is not itself marked sensitive — a loud error rather than a silent disclosure.

**It does not change storage, and it is not encryption.** Terraform records a sensitive value in state in the clear. Reading `sensitive = true` as a promise that state is safe to commit or share is the one misreading to avoid: protecting state remains a matter of how the state backend is configured, exactly as it is for a module carrying no marking at all. The attribute also does not restrict who may read the value, does not affect what a provider transmits, and does not change the rendered configuration in any other way.

So the marking makes a declared-sensitive input harder to disclose by accident when someone reads a plan. It does not make the deployable safe to publish. See [Declaring a leaf sensitive](../vocabulary/compact-form-authoring.md) for the keyword and for what a declaration achieves across every target.

## Structural input validation

The terraform provider validates a sourced module's structure **before** it renders. It parses the module's HCL and `.tf.json` files and reports parse errors, halting the build with a clear message that names the offending node and the provider. The parse checks shape, not semantics — it does not resolve providers, evaluate expressions, or contact a registry. Validation is hermetic: it uses a self-contained HCL parser compiled into the provider, with no `terraform` binary and no network access. A malformed module is caught at the authoring boundary rather than surfacing as a confusing error at a later `terraform` run.

## FeatureRecipe patch boundary

A post-render FeatureRecipe `pipeline` step patches only output the provider renders into a **structured tree**. For terraform this means:

- **JSON-authored Terraform is patchable.** A `.tf.json` module and the `aggrega.auto.tfvars.json` overlay are structured documents, so a pipeline step's JSONPatch edits the addressed values in place and leaves every other byte — ordering, formatting, surrounding keys — untouched.
- **Native HCL is opaque.** A native-HCL body (`main.tf`) is not a structured patch target. A patch against an opaque body halts the build with a diagnostic rather than mutating text it cannot address structurally; authoring a pipeline step against an HCL body is a design error surfaced as a loud halt, not a silent no-op.

An author who needs a Terraform body to be pipeline-patchable therefore authors it as `.tf.json` (or drives the values through the `.tfvars.json` overlay). See [FeatureRecipe](../entities/featurerecipe.md) for the general patch-target boundary across providers.

## Deployment ordering

A Release boundary's `syncWave:` value orders the `module` blocks of the root configuration that boundary assembles into. Every component in the boundary inherits the boundary's wave, and where several boundaries resolve to the same output directory — so their components are composed into a single root configuration — that root holds more than one wave and the provider expresses the ordering between them as `depends_on` on the `module` blocks.

**Each module names every module of the immediately-preceding wave that has any components, and no earlier wave than that.** Terraform chains the rest: a module in wave `2` depends on wave `1`, which depends on wave `0`, so the whole sequence is ordered while each module's own list stays the size of one wave rather than of the whole boundary. Waves need not be contiguous, and negative values are ordinary — `-1` is a common choice for a bucket or a role the rest of the configuration reads. The lowest wave names nothing, because nothing precedes it.

**What the ordering is: the order Terraform performs its actions in.** Terraform builds a dependency graph and works through it in parallel to the extent the graph allows. `depends_on` adds an edge to that graph, so Terraform completes its actions on the named modules before it begins the ones on the module that declares the dependency. A wave therefore stages the run: the earlier wave's components are acted on before the later wave's are begun.

**It is not readiness ordering.** A Terraform configuration expresses no notion of a resource being serviceable, so nothing here waits for one to become ready — only for Terraform to finish acting on it. That is a real difference from the same wave on [compose](compose.md#deployment-wave-ordering), where a service that declares a `healthcheck` is waited on until it reports healthy: compose has a readiness primitive to gate on and a Terraform configuration has none. Action order is what this target offers, and stating it plainly is more useful than a caveat attached to a promise it cannot make.

**No teardown order is promised.** What `depends_on` states is that Terraform completes the dependency's actions before it begins the dependent's; the order a `destroy` removes them in is not part of that statement, so nothing is claimed here about teardown sequence. This is a narrower promise than the same wave carries on [cloudformation](cloudformation.md#deployment-ordering), whose attribute governs both directions — worth knowing if you are relying on a wave to sequence a teardown, because on this target it does not.

**A boundary whose components all carry one wave gets nothing from this.** So does a Release that declares no `syncWave` at all: every contributor carries the field's default of `0`, the root configuration holds a single wave, and the emitted bytes are exactly what they would be if the provider expressed no wave ordering.

**Ordering across two root configurations is not expressible, and it is not approximated.** A Terraform dependency graph is per-configuration and `depends_on` names a module inside the configuration that declares it, so a wave orders every component composed into that root and nothing beyond it. Sequencing two configurations is the operator's concern, the same way a remote-state reference is a deploy-time resolution rather than a build-time one.

The wave is recorded as well as acted on: it travels with the rest of the node's build provenance, as `aggrega.ai/sync-wave` in the stamped comment block, or in the companion provenance file where the body is JSON. So a rendered configuration records which wave its boundary declared as well as being ordered by it.

Ordering the waves do not express stays Terraform's own concern, and the references between resources already carry much of it: a reference to another resource's attribute tells Terraform to act on that resource first. A module needing a constraint neither the references nor the waves imply writes its own `depends_on` inside the module, which the provider emits verbatim like every other part of the body.

## Related references

- [Provider architecture](architecture.md) — how providers fit into the compilation pipeline and per-provider dispatch.
- [Provider reference index](reference-matrix.md) — what each standard-library provider produces, and which page answers which question.
- [Recipe entity](../entities/recipe.md) — the Recipe authoring surface and the three input kinds.
- [FeatureRecipe](../entities/featurerecipe.md) — the post-render `pipeline` patch model and its structured/opaque boundary.
- [Recipe input composition](../../architecture/16-recipe-input-composition.md) — the canonical Provider Capability Matrix.
