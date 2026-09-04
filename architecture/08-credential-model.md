# Credential Model

## One attachment family

A credential in Aggrega is a **Feature**. It is attached on the same surface, under the same keyword, in the same shape as any other Feature:

```yaml
spec:
  components:
    db:
      type: core/datastore/mariadb
      features:
        metrics:                              # an operational Feature
          type: core/observability/prometheus-scrape:1.0.0
        root_password:                        # a credential Feature
          type: core/secret-value:1.0.0
          values:
            key: MARIADB_ROOT_PASSWORD
            origin: "{{ .parameters.db_root_pass }}"
```

There is one attachment keyword (`features:`), one render-context pillar (`.features.<name>`), one execution order, and one set of output coordinates — for an attachment on a component, the component it is attached to and then the name it is attached under, whether the target's layout carries those two as a `features/<component>/<instance>/` directory or as a `<component>--<instance>--` filename prefix. What varies between attachments is **what they produce** — an injected value, a referenceable resource, a sidecar, a cloud identity — not the surface they are declared on.

A credential Feature carries the label `feature.aggrega.ai/kind: secret` on its catalog entity. That label is **descriptive metadata**: it tells a reader, a catalog site, and a label selector what the Feature is for. No compiler branch reads it, and no behaviour turns on it. The behaviour comes from the FeatureRecipe an operator maps the Feature type to.

The one-sentence mental model: *there is one kind of attachment; what varies is what it produces.*

## Slots and free attachments

A Component or Feature may declare **slots** in `featuresSchema`:

```yaml
spec:
  featuresSchema:
    root_password:
      required: true
      inject: []                              # blackbox — the Recipe delivers it
      selector: "feature.aggrega.ai/kind=secret"
    user_password:
      inject: [env, file]                     # transparent — the developer may dictate delivery
```

An attachment whose instance name matches a declared slot **fills** that slot. An attachment under any other name is a **free** attachment: the entity did not ask for it, and it renders alongside anything the entity did ask for. The generated schema for a declared slot stays open, so declaring one slot never closes the block against free attachments.

Two things a slot may constrain:

- **`inject`** — the delivery mechanisms a Workload may select for what fills the slot. An empty list is a *blackbox* slot: the Recipe's own plumbing delivers it (a chart's `existingSecret` knob, for instance), and a Workload may not reference it from a container.
- **`selector`** — a label-selector string the filling Feature's labels must satisfy. This is where the `kind=secret` label earns its keep: an entity author who wants a slot filled only by a credential says so with a selector, and the check is a label-set evaluation the compiler performs during static analysis.

Slot `required` is declared on the surface today; the presence mandate that halts a build for a missing attachment is expressed instead by the repeatable Component annotation `features.aggrega.ai/requiredType.<label>`, which names a Feature type the deployment must attach.

## What the compiler does and does not guarantee

This section is the load-bearing one. Aggrega is an ahead-of-time compiler, and its guarantees are narrower than the word "secret" invites a reader to assume.

**The compiler never resolves a credential.** It does not authenticate with a cloud API, does not read a vault, and does not fetch material during `aggrega build`. A credential attachment's `values` travel through the graph and into the render context as opaque scalars, and a FeatureRecipe renders them into whatever artifact the target platform expects. Resolution happens later, in the cluster or the IaC state manager, against whatever the rendered artifact points at.

**The compiler cannot tell a pointer from a material value.** It is blind to what a scalar means (see [05-invariants.md](05-invariants.md)). A credential attachment whose `values` carry a store coordinate (`path`, `key`, an ARN) renders a *reference* to that coordinate; a credential attachment whose `values` carry the material itself renders the **material, verbatim, into the output file**. Both are legal, and the compiler treats them identically because it has no way to distinguish them.

So the honest statement of the guarantee is:

> Aggrega guarantees that the compiler performs no resolution. It does not guarantee that rendered output contains no material — that depends entirely on which credential Feature is attached and what the author put in its `values`.

Two consequences worth internalising:

- A rendered artifact tree is **as sensitive as its most material-carrying attachment**. Treat `dist/` accordingly: if any attachment carries material inline, the tree holds material.
- The catalog's own `core/secret-value` and `core/referenced-secret` families include forms that accept a value directly. They exist because real deployments need a local-development path, and they are honest about it: the shipped worked examples use obvious placeholders (`dev-root-pw-change-me`) precisely so the material in a rendered example is visibly not a real credential. For a deployment that must not carry material, attach a store-backed credential Feature whose FeatureRecipe emits a fetch resource (an `ExternalSecret`, a vault-fetch custom resource, a provider-native secret reference) rather than one that emits data.

The standard-library **convention** is that a credential is requested as an attachment rather than written into a `values` block, so that swapping a local-development fill for a store-backed one is a Manifest change rather than an edit to developer intent. That is a convention the catalog follows, not a rule the compiler enforces.

## Declared sensitivity

The compiler cannot tell a pointer from a material value, per the section above — but an **author** can, and can say so. Sensitivity in Aggrega is an annotation on a declaration: the author of a catalog entity states what carries secret material, and the compiler derives the rest from that statement plus the wiring it already built. Nothing is inferred from a value, and nothing is guessed from a field's name.

It is authored in exactly two places, and they carry genuinely different claims.

**On a schema leaf — *this datum is secret material*.** A `values`, `infra` or `provides` leaf declares `sensitive: true`:

```yaml
spec:
  schema:
    values:
      origin:
        type: string
        required: true
        sensitive: true              # the material
      key:
        type: string
        default: value               # a data key — a locator, not material
```

**On an attachment slot — *whatever binds this point handles secret material*.** A `featuresSchema` slot declares `sensitive: true`:

```yaml
spec:
  featuresSchema:
    password:
      selector: "feature.aggrega.ai/kind=secret"
      sensitive: true
      inject: [env]
```

The two levels are not a convenience duplicate of one another, and the referenceable-credential shape is the worked case that shows why. A referenceable credential publishes `provides.name` and `provides.key` — the produced resource's locator and the data key within it — and **neither is sensitive**: a Kubernetes Secret's name is public, and so is the key inside it. Both are rendered in the clear into the consumer's own manifest as a `secretKeyRef`. Yet the slot that credential fills unquestionably handles secret material. One level alone cannot express both facts: marking the published locators to make the slot read as sensitive would state something false about them and carry that error everywhere the declaration is read.

From those two declarations the compiler derives, per attachment, whether the attachment handles declared-sensitive material — true when the attached Feature declares a sensitive leaf, or when the slot it binds declares one, either alone sufficing. It derives this from the attachment as it stands after every authoring scope has folded, so a broader-scope declaration a narrower fill displaced does not linger, and a slot's demand applies to whichever fill actually won. A credential Feature that declares no sensitive leaf at all — because the target engine owns the material and the deployment authors nothing — still yields a sensitive attachment when it binds a sensitive slot.

### The ceiling, stated plainly

The word "sensitive" invites a reader to expect a confidentiality mechanism. It is not one, and the guarantee is narrower than the name suggests in five specific ways:

- **It does not encrypt.** Nothing is wrapped, sealed, or transformed.
- **It does not change the build's verdict.** No value is accepted or rejected because a declaration exists, and no build halts because one is missing. A catalog whose credential entities carry no declaration builds successfully, and adding declarations to an existing catalog leaves every build that succeeded still succeeding.
- **It does not guarantee that rendered output is free of material.** The guarantee stated above is unchanged: whether an artifact carries material depends on which fill was attached and what the author put in its `values`. A declared-sensitive value supplied inline is rendered exactly as an undeclared one is, and `dist/` remains as sensitive as its most material-carrying attachment.
- **It does not force a delivery mechanism.** A declaration cannot convert an inline value into a store reference, and it does not narrow what a slot's `inject` allowlist permits. Forcing delivery would mean emitting a resource the author never declared, which is precisely what the no-ghost-infrastructure invariant forbids — see [05-invariants.md](05-invariants.md).
- **It changes no rendered byte today, and on most targets it never will.** No shipped render path reads the declaration, so adding declarations across an existing catalog leaves every rendered artifact identical. The ceiling beyond that is structural rather than a matter of what has been built: a declaration can only ever reach a rendered artifact on a target platform whose own language carries a sensitivity notion — a declaration that platform understands, governing how it displays a value rather than how it stores one. On a target with no such notion there is nothing for a declaration to become, so identical input renders identically with or without it, permanently.

One thing a declaration does change is what the CLI prints for a human to read. A declared-sensitive value is replaced by a fixed placeholder in the per-pass trace and in the `inspect` layouts, keeping the key and withholding only the value. That is a display decision on surfaces nobody deploys, and rendered artifacts are emitted verbatim because they are the deployable.

Where the compiler can identify the value by key — a declared leaf, or a delivery key carrying material from a declared `provides` key — the substitution is exact. A value a template has already written into another document carries no key to substitute at, because a rendered document records nothing about which declaration each character came from, and recovering that would mean inspecting content. So the trace shows such a document by evaluating the same template a second time against a context whose declared-sensitive data already reads as the placeholder, and it labels the result as a re-render rather than as what was rendered: a template that branches on the *content* of a value renders differently against a placeholder, and a datum no declaration names is carried through unchanged. The surfaces, that labelling, and its limits are at [language-reference/vocabulary/compact-form-authoring.md](../language-reference/vocabulary/compact-form-authoring.md) "Declaring a leaf sensitive".

So the honest statement of what the axis buys:

> A sensitivity declaration is a statement of authorial intent that travels with the entity, so tooling and policy can reason about what a deployment handles. It is not a mechanism that protects it.

Protecting material remains the job of the secret store, the cluster, and the pipeline that handles the rendered tree — as the rest of this chapter says.

## How a credential reaches a container

Two delivery shapes, chosen by the attachment's FeatureRecipe rather than by the developer:

**Injected value.** The FeatureRecipe declares an `injectMapping` and no resources. Its output is deep-merged into the consuming component's delivery pipe before the base Recipe renders, so a Recipe reading `.context.inject.env.<KEY>` receives the value. Nothing standalone is emitted.

**Referenceable resource.** The FeatureRecipe declares a `source`, `workload`, `artifacts` and/or `valuesMapping`, so it emits a resource — typically a platform-native Secret. It publishes that resource's identity through its `provides`, and a consumer reads it back as `.features.<name>.provides.name` / `.provides.key`. The resource's own name is derived from the same published `provides`, so the name the consumer reads and the name the resource carries are one evaluated string rather than two derivations that could drift.

A Recipe's Workload consumes a referenceable fill through a container's `attachments:` map:

```yaml
workload: |
  containers:
    main:
      attachments:
        DB_PASSWORD:
          from: root_password       # a slot the Component declares
          as: env
```

The synthesizer resolves the reference from the slot's published `provides` — a Kubernetes `secretKeyRef` for `as: env`, a secret-backed volume for `as: file`. The Recipe author writes only the slot name and the mechanism.

A FeatureRecipe may do both: rewrite the delivery pipe *and* emit a resource. It may also declare a `pipeline` of Wasm steps, which run for every attachment family alike — a credential attachment can transform the host component's rendered documents on invitation exactly as an operational attachment can.

## Sharing one credential across consumers

The same catalog entity serves both shapes, and the **deployment** chooses which:

- **Per-consumer.** Each component instance fills its own slot with its own credential attachment. Each gets its own rendered resource.
- **Shared.** One credential is attached once at a shared scope — a subsystem in the Aggregate, a boundary in the Release — and cascades to every component in that scope.

State the shared form's rendering precisely, because it is easy to assume otherwise: **a shared attachment renders one resource per consumer**, each carrying the same material from the one declaration. Rendering runs per component, and a resource name derived from `{{ .context.instance_id }}-{{ .attachment_name }}` therefore differs per consumer. The single declaration is what is shared; the emitted resources are not deduplicated into one.

If a deployment needs exactly one physical Secret that several consumers read, express that with a credential Feature whose FeatureRecipe runs at boundary scope (`executionScope: boundary`), which renders once for the boundary rather than once per component.

## Attachment precedence

An attachment may be declared at several scopes at once. Ownership of a contested field resolves by three rules, applied in this order:

1. **Origin.** An explicitly authored field beats one contributed by annotation-driven expansion, whatever scope either came from.
2. **Composition authority.** A declaration in the Aggregate you are deploying beats one inside an Aggregate it composes, even when the composed document declared at the narrower scope.
3. **Specificity.** Within one authoring level, the narrower scope refines the broader one **field by field**: a component-level fill overrides a subsystem-wide or boundary-wide attachment of the same instance name only for the fields it mentions, and fields it omits keep the broader scope's values.

The developer side supplies `values` and the operator side supplies `infra`, so the two never contest the same field. Precedence governs field values only; it does not reorder evaluation, which follows the cascade sequence in [10-compilation-pipeline.md](10-compilation-pipeline.md).

## Legacy charts that demand a formatted string

A chart sometimes wants a single connection string with material embedded in it — `oracle://admin:PASSWORD@HOST:1521/DB`. An ahead-of-time compiler cannot build that string from a store coordinate, because it never holds the material. Two supported paths:

**Cluster-side templating.** The credential FeatureRecipe emits a resource that formats the string *in the cluster*, using the vault operator's own templating. The application then references the resulting platform Secret by name, and the compiler wired the relationship without ever holding the material:

```json
{
  "apiVersion": "external-secrets.io/v1beta1",
  "kind": "ExternalSecret",
  "metadata": { "name": "oracle-dsn-secret" },
  "spec": {
    "target": {
      "name": "oracle-formatted-dsn",
      "template": {
        "engineVersion": "v2",
        "data": { "ORACLE_DSN": "oracle://admin:{{ .password }}@10.0.5.55:1521/PROD_DB" }
      }
    },
    "data": [
      { "secretKey": "password", "remoteRef": { "key": "arn:aws:secretsmanager:prod/oracle" } }
    ]
  }
}
```

**Parameter hoisting.** The Aggregate declares a typed parameter and the surrounding CI pipeline supplies the value at build time (`aggrega build --set parameters.legacy_db_pass=$DB_PASS`). This is the explicit escape hatch, and it makes the trade-off visible: the material now flows through the build, so the rendered output carries it and must be handled accordingly.

## Local development

The golden local-development path keeps developer intent unchanged and swaps the binding. The Aggregate keeps attaching the same credential Feature type; the local Manifest maps that type to a local FeatureRecipe instead of the store-backed one. The compiler still fetches nothing — the local FeatureRecipe simply emits provider-native syntax the local runtime resolves (`env_file: [".env"]` or `${SECRET_NAME}` for Compose). Swapping environments is a Manifest edit.

## Data governance around credentials

Aggrega does not model data schemas — rows, columns, files are application concerns. It models the *governance identity* of data with labels, and the standard-library convention is:

- Data lives in components whose ontology label marks them stateful or resource-like (`component.aggrega.ai/type: stateful-server`, `resource`, `messaging`).
- `compliance.aggrega.ai/data-class` (`public`, `internal`, `restricted`) gives that data a semantic identity. It is an ordinary label: label selectors evaluate it, and a governance plugin an operator attaches may read it and reject a build. The compiler itself does not interpret it.

**`data-class` and `sensitive` are two axes, and collapsing them loses information.** They sit next to each other and are easy to mistake for one surface, so hold the distinction:

| | `compliance.aggrega.ai/data-class` | `sensitive` |
|---|---|---|
| Shape | graded — `public` / `internal` / `restricted` | boolean |
| Granularity | a whole node | one schema leaf, or one attachment slot |
| Says | what governance identity the data a component holds has | that this datum is secret material, or that this binding point handles it |
| Authored as | a label in `metadata.labels` | a keyword on a declaration |

Neither substitutes for the other: forcing sensitivity into the graded label would impose an ordering on a fact that has none, and forcing a data class onto a leaf would impose a granularity the classification does not have. An entity may carry both, and a component holding `restricted` data whose credential slot is declared `sensitive` is stating two separate true things. The leaf and slot keywords are taught at [../language-reference/vocabulary/compact-form-authoring.md](../language-reference/vocabulary/compact-form-authoring.md) "Declaring a leaf sensitive" and [../language-reference/entities/component.md](../language-reference/entities/component.md) "Declaring a slot sensitive".

Encryption at rest is deliberately outside developer intent and outside the compiler. It belongs to the Ops Recipe for the stateful component, and to the rendering plugin that reads the node's labels and emits the encrypted storage configuration. That placement is design guidance about where the concern belongs — the compiler does not check that any Recipe honours it.

## What is distinctive here, and what is not

Public positioning is worth stating plainly and narrowly, so a reader can calibrate.

**Distinctive: the socket contract is published, not declared inline.** The contract a credential must satisfy — the slot, its delivery allowlist, its label selector — is authored on the *catalog entity* by whoever published it, and lives in a catalog a third party maintains. A consumer does not describe the contract inline in its own configuration; it fills a contract someone else published, and the compiler checks the fill against that published declaration. The consumer and the contract author are different people, working in different repositories, on different release cadences.

**Distinctive: filling is label-selector-constrained.** A slot may say *what kind of thing* may fill it (`selector: "feature.aggrega.ai/kind=secret"`) rather than naming a specific implementation. The check is a label-set evaluation, so an entity can accept a family of fills it has never heard of, and a new fill becomes eligible by carrying the right labels.

**Not distinctive: the inject mapping.** Mapping "this local environment variable name receives that produced value" is a well-known pattern; several configuration and deployment tools express the same idea in their own syntax. Aggrega's version is a mapping evaluated ahead of time and merged into a delivery pipe, but the idea is the ecosystem's, not ours.

**Not distinctive: ahead-of-time static generation.** Generating deployment artifacts statically from a higher-level description, with no live cluster access at generation time, is not an Aggrega invention. Other tools do it, and did it before Aggrega existed. What Aggrega adds is the published-contract layer above it, not the static generation itself.

**Not a security boundary.** Nothing in this chapter is a confidentiality mechanism. The credential model is a *wiring* model: it decides where a pointer or a value comes from, who may constrain it, and how it reaches a container. Protecting material is the job of the secret store, the cluster, and the pipeline that handles the rendered tree.

## Cross-references

- [05-invariants.md](05-invariants.md) — the ahead-of-time and string-pipe invariants this chapter rests on.
- [10-compilation-pipeline.md](10-compilation-pipeline.md) — where attachment resolution and Resource Generation sit in the pipeline.
- [../language-reference/entities/component.md](../language-reference/entities/component.md) — `featuresSchema` slot authoring, including the slot-level `sensitive` declaration.
- [../language-reference/vocabulary/compact-form-authoring.md](../language-reference/vocabulary/compact-form-authoring.md) — the leaf-level `sensitive` keyword, where the declaration is read, and the `parameters:` asymmetry.
- [../language-reference/entities/workload.md](../language-reference/entities/workload.md) — the container `attachments:` map and its validation rules.
- [../language-reference/examples/04-secrets.md](../language-reference/examples/04-secrets.md) — the authoring checklist and worked transparent / blackbox examples.
- [../language-reference/examples/05-credential-features.md](../language-reference/examples/05-credential-features.md) — the credential Feature families and an end-to-end walkthrough.
