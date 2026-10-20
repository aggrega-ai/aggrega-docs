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

  allocated_storage = 100
  db_name           = "appdb"
  engine_version    = "11.4"
}
```

Each component's own files — the vendored module or the authored body, and the provenance stamp — sit in the sub-directory its block points at. This is Terraform's standard root-composes-children structure, whose convention is that nested modules live under a `modules/` sub-directory, and it is the layout every terraform boundary gets, whether it holds one component or several. A Feature attached to a component or to the boundary is declared as a `module` block of its own in the same root configuration — see [Where an attached Feature's output lands](#where-an-attached-features-output-lands).

The shape is load-bearing rather than cosmetic, for two reasons.

**A Terraform dependency graph is per-configuration.** Components emitted into separate directories are separate graphs with no relationship: neither a reference nor a `depends_on` can reach from one to another, and no single `terraform plan` sees both. One root composing each component as a child module puts a whole boundary in one graph and one plan.

**A component's files are addressed by its own directory.** Two components in one boundary can vendor modules that write identically-named files — `main.tf`, `variables.tf` — and each set sits under its own component's directory rather than contending for one path.

### Where a provider is configured

A provider's configuration — a `provider` block — is written at the root, never inside a component's module. Terraform's documentation says a module meant to be called by another must not contain `provider` blocks, and a module it calls inherits the root's default configuration of each provider that module uses. A module carrying a `provider` block of its own cannot be called with `depends_on`, `count` or `for_each`, and this provider writes `depends_on` on a component's `module` block whenever another component of the same root carries an earlier `syncWave`, as Deployment ordering below describes; Terraform then refuses the whole configuration while it is loaded, before it plans anything.

So a Recipe whose provider needs configuring writes that configuration as a file under [`spec.boundary.artifacts`](../entities/recipe.md#the-boundary-block--files-for-the-boundarys-shared-output). Each such file is written once beside `aggrega.modules.tf`, where Terraform reads it together with the root configuration, and the component's module keeps only its `required_providers` declaration of the provider's source and version:

```text
infra/terraform/
  aggrega.modules.tf
  provider-azurerm.tf
  modules/
    gateway/main.tf
```

Components of one root that declare the same file with the same bytes share the one copy; the same name with different bytes stops the build. The modules' resources are recorded against that one configuration, so it is also what Terraform destroys them with. A Release that removes the last component declaring the file removes the file with it, and Terraform then refuses to plan the destruction of what those modules created, asking for a provider block that configures the provider. Destroy those resources before removing the last such component.

### Where a component's inputs are supplied

A component's inputs are the **arguments of its `module` block** in the root configuration, and that is the only place they are written. A block carries arguments where the compiler supplies the module's inputs — a Recipe that vendors a module with `source:`. It is bare where the Recipe authored the configuration body itself and resolved its values into that body, so there is nothing left for the compiler to pass.

A module argument is a position Terraform evaluates, which is why it is where the values go. A `${ ... }` pointer a Recipe supplies resolves there rather than arriving at the module as a literal string. What it resolves *against* is the root configuration: a reference names something that configuration declares — one of its `module` blocks, as `module.<name>.<output>` — and a reference to anything it does not declare is a loud error at plan time naming the missing referent.

**A component's own directory is therefore not a configuration you can plan as deployed.** Its inputs are stated one level up, in the root, so standing in `modules/<component>` and running the engine there plans something else, and which of two things it does depends on the module's own `variable` blocks:

- Where at least one input declares no `default`, the plan **fails loudly** — `No value for required variable`, naming each unset variable and its line, and offering Terraform's own `-var` / `-var-file` remedy.
- Where **every** input carries a `default`, the plan **succeeds** and builds from the module's defaults rather than from the values the root configuration supplies. Nothing warns, so this is the case to know about: a plan that looks right is describing a configuration nobody asked for.

Plan the boundary's own output directory instead — the one holding `aggrega.modules.tf`, immediately above `modules/`. That is where the deployment's values are, and it is the one place a single plan sees the whole boundary.

### Consuming another component's published value

A component wired to another with a `uses` edge reads that component's published values through its own `.context.inject` pipe (or through `.context.uses.<alias>.provides.<name>`). What it reads is a string the compiler pipes without interpreting, and where that string lands is **text Terraform evaluates in the scope the Recipe wrote it into**. A terraform boundary has two such scopes, and only one of them declares the module calls a cross-component reference needs:

- the **root configuration** declares every contributor as a `module` block, so `module.<name>.<output>` resolves there;
- a **component's own directory** declares no module calls at all, so `module.<name>.<output>` names nothing there — **whatever `<name>` is**. Substituting the correct name changes nothing, because what is missing is the declaration, not the spelling.

So the consuming Recipe's input kind decides whether a consumed reference can resolve, and the value being consumed does not.

**Write a consuming Recipe as a `source:` Recipe.** Its `valuesMapping:` becomes the arguments of its own `module` block in the root configuration — the one position that is both evaluated and in a scope where its neighbours are declared.

#### A worked pair

The producer publishes an address naming **its own module call**, which is the form its consumer's scope declares. `.context.instance_id` is on the provides-evaluation surface, and for a component the deployment's Aggregate declares it is the name that component's `module` block carries:

```yaml
# Recipe — the producer. Its vendored module declares `output "endpoint"`.
spec:
  capability: terraform
  implements: example/storage/object-store:1.0.0
  source: ./module
  valuesMapping: |
    bucket: "{{ .values.bucket }}"
  provides:
    endpoint: "${module.{{ .context.instance_id }}.endpoint}"
```

The consumer vendors a module declaring an input, and maps the injected value onto it:

```yaml
# Recipe — the consumer. Its vendored module declares `variable "store_endpoint"`.
spec:
  capability: terraform
  implements: example/compute/reporting-api:1.0.0
  source: ./module
  valuesMapping: |
    store_endpoint: "{{ .context.inject.env.STORE_ENDPOINT }}"
```

The Aggregate wires them, naming the published key the edge carries:

```yaml
spec:
  components:
    store:
      type: example/storage/object-store
      values:
        bucket: app-artifacts

    api:
      type: example/compute/reporting-api
      uses:
        store:
          store:
            target: store
            inject:
              env:
                - in: STORE_ENDPOINT
                  from: endpoint
```

The build emits one root configuration in which the reference and its referent are declared together:

```hcl
module "api" {
  source = "./modules/api"

  store_endpoint = "${module.store.endpoint}"
}

module "store" {
  source = "./modules/store"

  bucket = "app-artifacts"
}
```

Terraform resolves `module.store.endpoint` because the same configuration declares `module "store"`, and the value reaches the consumer's module as an ordinary input.

#### Three ways this goes wrong, and what each looks like

**A Recipe that authors its own body cannot consume a cross-component reference.** An `artifacts:` Recipe resolves its values into the body it writes, and that body emits into the component's own directory. The reference is then sitting in a scope that declares no module calls:

```
Error: Reference to undeclared module
  on modules/api/main.tf line 11, in output "seen":
  11:   value = "${module.store.endpoint}"
No module call named "store" is declared in module.api.
```

There is no spelling that fixes this, because a nested module's expressions cannot name a sibling module at all — a nested module receives a neighbour's value only as an **input**, which is the `module` block argument the sourced path already supplies. **A component that consumes another component's published value is authored as a `source:` Recipe.**

**An address naming something inside the producer's own module resolves against the root, not against that module.** A `provides` entry spelling `aws_db_instance.this.endpoint` names a resource the producer's module declares; written as an interpolation it is evaluated where the consumer's argument sits, which is the root:

```
Error: Reference to undeclared resource
  on aggrega.modules.tf line 19, in module "api":
  19:   store_endpoint = "${aws_db_instance.this.endpoint}"
There is no managed resource "aws_db_instance" "this" definition in the root module.
```

Publish `${module.<...>.<output>}` and give the module an `output` block for the value, rather than reaching into its resources.

**A `provides` entry carrying no interpolation is delivered as text.** This is the one that does not fail: the compiler pipes strings and cannot tell a pointer from a literal, so `aws_db_instance.this.endpoint` written without `${ ... }` renders as a quoted string, the build succeeds, the engine validates, and the consumer receives the characters `aws_db_instance.this.endpoint`. Write the `${ ... }` wrapper whenever the value is meant as a reference — it is what marks the string as something for Terraform to evaluate.

#### One bound worth knowing before you rely on it

`.context.instance_id` spells the component's identity, and a `module` block's name is derived from the directory the component's files sit in. **For a component the deployment's own Aggregate declares, those are the same name.** For a component composed in from another Aggregate they are not: the composed identity and the module name are written into their two alphabets differently, and the reference then fails loudly at the root rather than quietly:

```
Error: Reference to undeclared module
  on aggrega.modules.tf line 25, in module "api":
  25:   store_endpoint = "${module.nested-zdinner.endpoint}"
No module call named "nested-zdinner" is declared in the root module.
```

Declare a producer whose address another component resolves in the deployment's own Aggregate, alongside the component that consumes it.

### Where an attached Feature's output lands

A Feature attachment that renders configuration of its own gets a **module of its own**, declared in the same root configuration as the components beside it. This is what makes its configuration part of the deployment at all: Terraform loads only the files sitting directly in a directory and treats a nested directory as a completely separate module that has to be called explicitly, so an attachment's files are read because the root declares a block naming the directory they sit in.

An attachment's module directory sits **beside** the component's, one level under `modules/`, and is named for the two things that identify it — the component hosting it and the name it was attached under, joined on `--`. So for a component `api` carrying an attachment named `aux`, the root configuration declares two modules:

```hcl
module "api--aux" {
  source = "./modules/api--aux"
}

module "api" {
  source = "./modules/api"
}
```

A Feature attached at the **boundary** rather than at a component has no host component to name, so its directory is its own name alone: an attachment named `aux` on a boundary holding component `api` yields `./modules/aux` beside `./modules/api`.

**Why beside rather than inside.** Terraform merges every top-level file in a module directory into one namespace — `output`, `variable`, `resource` and `locals` alike — so two contributors sharing a directory collide on any name they both declare, whatever their files are called. A directory each is what keeps them apart. Beside rather than inside is also what Terraform's own guidance for nested modules asks for: that they be composable by the caller rather than calling directly to each other and creating a deeply-nested tree of modules.

**The join is escaped per coordinate.** Each of the two coordinates is written into the directory alphabet before they are joined, so a coordinate that itself contains `--` cannot be confused with the join: a host named `a--b` with an attachment `c` is distinguishable from a host `a` with an attachment `b--c`. ASCII letters in both cases, digits, the full stop and the underscore pass through as written; a hyphen you wrote is kept wherever the character after it is one of those; anything else is escaped. **The same rule and the same alphabet produce a chart target's child directories**, so one attachment's directory is spelled the same way whichever of the two targets renders it.

**A block's name is derived from the directory its `source` points at**, with each character outside Terraform's grammar for a module name replaced by an underscore. That mapping is not one-to-one, so where two contributors would arrive at a single module name the build halts and names both, rather than emitting a configuration Terraform would reject.

Two things follow from an attachment being a module of its own.

**Its resources sit in the boundary's one dependency graph.** A reference or a `depends_on` reaches between an attachment and the component it attached to, and one `terraform plan` sees both — the same property the root-composes-children shape gives components, for the same reason.

**Its top-level names are its own.** Because the namespace merge described above is per directory, a contributor sitting in a directory of its own declares its `output`, `variable`, `resource` and `locals` names without contending with its neighbours' — so an attachment may reuse a name its host already declares, and neither has to know what the other called anything.

Note what this target does **not** require, because a chart target's constraint is different and the shared layout can be read as implying more than it does: a module nested inside another contributor's directory is still reachable here, since the root configuration reads each contributor's `source` from the position the build composed rather than rebuilding it from an identifier. What this target refuses is two contributors *sharing* a directory. A chart target refuses the nested position outright, because it discovers a child chart one level down and no further.

## Supported input kinds

The terraform provider accepts two of the three Recipe input kinds:

- **Artifacts mode.** A Recipe authors Terraform configuration as a templated body; the provider evaluates the Aggrega template and emits the result verbatim, byte-for-byte. HCL (`main.tf`) is the ergonomic default, and Terraform JSON (`.tf.json`) is accepted equivalently. Build provenance is stamped as a Terraform comment; for a JSON body — which has no comment syntax — provenance is written as a companion file rather than inline.
- **Sourced mode.** A Recipe references a Terraform module with `source:`. The module's files are vendored verbatim into that component's directory, and the Recipe's `valuesMapping:` becomes the arguments of that component's `module` block in the boundary's root configuration. The module body is preserved exactly as authored and nothing is written into it; the values are stated once, in the root, where Terraform evaluates them. Where the node's declared `values` leaves become the module's inputs directly — a `source:` Recipe with no `valuesMapping:` — an input carrying material an author declared sensitive also gets a generated override file carrying Terraform's own sensitivity attribute; a `valuesMapping:` template invents its output names, so that case carries no marking. Both are described under [Declared-sensitive module inputs](#declared-sensitive-module-inputs).

The **synthesized** input kind is not offered. There is no faithful, capability-agnostic mapping from the platform Workload kind to arbitrary Terraform resources, so a Recipe that declares `workload:` against the terraform provider is a loud error rather than an invented translation.

**A Recipe declaring `omits:` is refused.** The [`omits:`](../entities/recipe.md#the-omits-field--leaving-rendered-documents-out-of-a-source) key leaves documents a source renders out of the build, and this provider renders nothing from a sourced module at build time: it vendors the module's files verbatim, and Terraform evaluates them when the configuration is planned and applied. With nothing rendered there is nothing to leave out, so this provider does not declare that it honours the key, and a Recipe or FeatureRecipe declaring it is refused before anything is vendored — see [The provider does not support omits](../errors/fatal-halts.md#the-provider-does-not-support-omits). For a module you keep beside the Recipe, a line in the `.aggregaignore` there leaves a file of the module out instead, from the next time the Recipe is pinned.

### Sourcing a module a registry publishes

A module registry publishes each version of a module as a tag of the module's own git repository, and what it answers when asked to download a version is a git source pinned to the commit that tag names. So a Recipe sources a published module from that repository at that tag, with the `git-repository` source kind:

```yaml
spec:
  capability: terraform
  implements: example/storage/database:1.0.0
  source:
    kind: git-repository
    url: https://github.com/terraform-aws-modules/terraform-aws-rds.git
    ref: v7.2.2
  valuesMapping: |
    identifier: "{{ .values.identifier }}"
  provides:
    host: "${module.{{ .context.instance_id }}.db_instance_address}"
    port: "${module.{{ .context.instance_id }}.db_instance_port}"
```

`ref:` is the release tag exactly as the repository names it. `valuesMapping:` supplies the module's inputs, by the names its `variable` blocks declare — Terraform requires a value for every input that declares no `default` — and they become the arguments of this component's `module` block in the root configuration, as for any sourced module.

**What is pinned.** [`aggrega pin`](../cli/aggrega-pin.md) and the pull resolve the tag to the commit it names and archive the repository at that commit. The Release's lockfile then records that commit as the source's pinned version, the tag as the reference you wrote, and the digest of the archive. Every later build reads the archive from the cache and verifies it against that digest before vendoring anything, so it needs no network, and a cached archive whose bytes no longer match halts the build. A tag is a name a repository can move to another commit; a later pull that finds yours resolving somewhere else halts rather than adopting the new commit, and `aggrega pull --upgrade` adopts it deliberately. That is a tighter pin than Terraform's own dependency lock file, which records the providers a configuration selected and no module at all, so a module written into a configuration as a git source at a tag is only as fixed as the tag. Here the module's commit and the digest of its bytes are fixed in the lock, the bytes are vendored into the output, and the root configuration calls them by a local path, so the engine fetches nothing to load the module itself — a module the vendored one calls by a registry or remote source is still fetched, and the build reports each such call, as [A module call the engine fetches when it initialises](#a-module-call-the-engine-fetches-when-it-initialises) describes.

**What is vendored.** The whole repository at the pinned commit, apart from its `.git/` directory, lands in the component's own directory under `modules/`, byte-for-byte — the module's own configuration files and child modules, and also whatever else the repository carries: its `examples/` and `wrappers/` directories, its documentation, its CI configuration, and any test fixtures, binary ones included. The engine reads only what the module calls: when the root configuration calls the component's directory, the engine loads the configuration files directly in it and in each directory a local `source` reaches from there. An example directory that calls other registry modules is therefore vendored and never loaded, and nothing it calls is fetched.

**Narrowing what is vendored.** A fetched source is the archive it was fetched as, so the one way to narrow it is `module_subdir:`, which makes one directory of the repository the artifact. That only helps when the module you want sits in a sub-directory: a module at the repository root that calls its own `./modules/*` needs the whole tree. Neither a `.terraformignore` the repository carries nor an `.aggregaignore` beside the Recipe changes what a fetched source vendors — both shape a module kept beside the Recipe, and neither is read for one fetched from a repository.

**Reading what the module publishes.** A value the module publishes is one of its `output` blocks, and a consumer reads it as `${module.<name>.<output>}`, where `<name>` is the producer's module block — which is why the producer above publishes `${module.{{ .context.instance_id }}.<output>}`. The engine resolves the reference against the module's own `output` blocks when it validates the root configuration, so an output name the module does not declare is refused there, naming it:

```
Error: Unsupported attribute
  on aggrega.modules.tf line 9, in module "api":
   9:   db_host = "${module.db.db_instance_addresz}"
This object does not have an attribute named "db_instance_addresz".
```

The build reads none of the module's `variable` or `output` blocks, writes nothing into the module, and adds no provider configuration to it, so a mistyped output name is caught by the engine rather than by the build. See [Consuming another component's published value](#consuming-another-components-published-value) for the consumer's side.

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

**That bound is deliberate rather than something the file format imposes:** nothing in an override refuses a second attribute, and a `variable` block's `default` is the nearest slot to reach for if you wanted to carry a value into a vendored module without editing its bytes — but it would not arrive. A `default` in the JSON configuration syntax this file is written in is not a position Terraform evaluates, so a value carrying a `${ ... }` pointer written there reaches the module as the literal characters of the pointer, at a plan that succeeds and says nothing. The same pointer written into a `default` in native HCL is rejected outright, which places that silence in this syntax rather than in override files as such. So the override carries `sensitive` alone: its meaning does not depend on being evaluated.

**Which input is marked comes from a declaration, never from a name.** The provider reads the marking the compilation computed and inspects nothing itself: it does not recognise `password`, `secret` or `token`, and it does not read the module's text to guess. A module input named `db_password` whose value carries no declaration is emitted unmarked, and a declared input named `region` is marked.

**The marking travels only where the input's identity is recoverable from the declaration.** A Recipe that vendors a module with `source:` and lets the node's declared `values` leaves become the module's inputs directly gives each input the same name the author declared, so the link is exact. A Recipe that reshapes those values through a `valuesMapping:` template invents its output names, and no declaration names them — so the marking is absent rather than approximated. Absence is deliberate: guessing which reshaped input carried the declared datum would mark a public input as secret, and Terraform would then suppress a value from plan output that was never sensitive.

The worked example [`terraform-declared-sensitivity`](../examples/terraform-declared-sensitivity/) builds this end to end and is small enough to read in full: one component declaring three `values` leaves, of which two carry public identifiers and one carries the credential. Its rendered output shows the `module` block's arguments carrying all three module inputs and the override naming only the declared one, so both halves of the rule are visible in the same build — including that a credential *identifier* sitting beside the secret is left unmarked. Removing the one declaration and rebuilding emits no override file at all.

### What Terraform's `sensitive` does and does not guarantee

Aggrega promises exactly what Terraform's own attribute delivers, and no more.

**It bounds display.** A sensitive value reads as `(sensitive value)` in plan output and `<sensitive>` in apply output. The marking propagates through expressions, so a value derived from a sensitive input is sensitive too, and Terraform refuses to export one from a root `output` that is not itself marked sensitive — a loud error rather than a silent disclosure.

**It does not change storage, and it is not encryption.** Terraform records a sensitive value in state in the clear. Reading `sensitive = true` as a promise that state is safe to commit or share is the one misreading to avoid: protecting state remains a matter of how the state backend is configured, exactly as it is for a module carrying no marking at all. The attribute also does not restrict who may read the value, does not affect what a provider transmits, and does not change the rendered configuration in any other way.

So the marking makes a declared-sensitive input harder to disclose by accident when someone reads a plan. It does not make the deployable safe to publish. See [Declaring a leaf sensitive](../vocabulary/compact-form-authoring.md) for the keyword and for what a declaration achieves across every target.

## Structural input validation

The terraform provider validates a sourced module's structure **before** it renders. It parses the module's HCL and `.tf.json` files and reports parse errors, halting the build with a clear message that names the offending node and the provider. The parse checks shape, not semantics — it does not resolve providers, evaluate expressions, or contact a registry. Validation is hermetic: it uses a self-contained HCL parser compiled into the provider, with no `terraform` binary and no network access. A malformed module is caught at the authoring boundary rather than surfacing as a confusing error at a later `terraform` run.

### A module call the engine fetches when it initialises

The same read reports, as a warning that refuses nothing, each `module` block whose source Terraform downloads when the configuration is initialised. A vendored module's commit and archive digest are fixed in the lock, but a `module` block inside it whose `source` is a registry address, a git, Mercurial or HTTP archive URL, an S3 or GCS bucket, or an absolute path names a module the engine fetches at initialisation, at whatever version it then selects — and Terraform's own dependency lock file records providers only, so nothing pins that module. A local `source` that climbs out of the vendored module is reported as well, because it names files the build did not vendor. Each finding names the node and the provider, then the block, the file and line it sits at, and the source as written:

```text
  warning: node "app" (provider "terraform"): module "vpc" (main.tf, line 2) has the source "terraform-aws-modules/vpc/aws", which Terraform downloads when the configuration is initialised, at whatever version it then selects, so no commit or digest this build records covers that module
```

**What is read.** The files the engine loads when the module is called: the configuration files directly in the module's own directory, then those in each directory a local `source` — one beginning `./` or `../`, or their backslash spellings — reaches from there, followed from directory to directory and each read once. A directory nothing calls is not read, so the calls a module's `examples/` or `tests/` directory makes are not reported: the engine never loads them when the module is called, and nothing they call is fetched. The parse check above still parses every vendored configuration file. A Recipe's authored body is read the same way when it renders, starting from the directory the body is written into, so a `module` block an authored body writes with a registry source is reported too.

**What is not read.** Only what a `source` says is read. The build does not read the module a call names, does not judge what that module does, and does not decide whether the call is acceptable. A `source` the engine evaluates rather than reads as written — one carrying an interpolation, or a reference — is judged by its leading text: one opening with an address is reported as written, while one opening with a local prefix, or with the interpolation itself, is neither reported nor followed, because where it leads is not in the text. A `source` inside `required_providers` names a provider rather than a module and is not a module call.

**Why it is reported rather than refused.** A module that calls another module is legitimate input: Terraform fetches the called module and the configuration works. What the author gives up is the build's pin over the called module, which is a fact worth knowing rather than a fault to fix, and whether that fetch is acceptable is the author's judgement. A configuration that must stay fully pinned vendors only modules that make no such call. The warning, its class code and where else it reaches are described in [Warnings and Linter Output](../errors/warnings.md#a-terraform-module-call-the-engine-fetches-when-it-initialises).

## FeatureRecipe patch boundary

A post-render FeatureRecipe `pipeline` step patches only output the provider renders into a **structured tree**. For terraform this means:

- **JSON-authored Terraform is patchable.** A `.tf.json` module is a structured document, so a pipeline step's JSONPatch edits the addressed values in place and leaves every other byte — ordering, formatting, surrounding keys — untouched.
- **Native HCL is opaque.** A native-HCL body (`main.tf`) is not a structured patch target. A patch against an opaque body halts the build with a diagnostic rather than mutating text it cannot address structurally; authoring a pipeline step against an HCL body is a design error surfaced as a loud halt, not a silent no-op.
- **A sourced module's inputs are not a patch target at all.** They are the arguments of the component's `module` block, which sits in the root configuration: native HCL, and therefore opaque, and an artifact of the whole boundary rather than of any one node. A `pipeline` step patches a node's own rendered output, so there is no position from which to address them.

An author who needs a Terraform body to be pipeline-patchable therefore authors it as `.tf.json`. See [FeatureRecipe](../entities/featurerecipe.md) for the general patch-target boundary across providers.

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
