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

There is one attachment keyword (`features:`), one render-context pillar (`.features.<name>`), one execution order, and one output prefix (`features/<instance>/`). What varies between attachments is **what they produce** — an injected value, a referenceable resource, a sidecar, a cloud identity — not the surface they are declared on.

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
- **`selector`** — a label-selector string the filling Feature's labels must satisfy. This is where the `kind=secret` label earns its keep: an entity author who wants a slot filled only by a credential says so with a selector, and the check is a label-set evaluation the compiler performs at Step 4.

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
- [../language-reference/entities/component.md](../language-reference/entities/component.md) — `featuresSchema` slot authoring.
- [../language-reference/entities/workload.md](../language-reference/entities/workload.md) — the container `attachments:` map and its validation rules.
- [../language-reference/examples/04-secrets.md](../language-reference/examples/04-secrets.md) — the authoring checklist and worked transparent / blackbox examples.
- [../language-reference/examples/05-credential-features.md](../language-reference/examples/05-credential-features.md) — the credential Feature families and an end-to-end walkthrough.
