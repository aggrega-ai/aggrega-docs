# Credential Model

## One attachment family

A credential in Aggrega is a **Feature**. It is attached on the same surface, under the same keyword, in the same shape as any other Feature. Here the developer attaches the database's credential in the Aggregate, writing its locator in `values`:

```yaml
# the Aggregate — its parameters and the components' own values left out
spec:
  components:
    api:
      type: core/compute/server
    db:
      type: core/datastore/mariadb
      features:
        root_password:                        # a credential Feature
          type: core/secret-value:1.0.0
          values:
            key: MARIADB_ROOT_PASSWORD
            origin: "{{ .parameters.db_root_pass }}"
```

and the operator attaches a metrics scrape target to the server in the Release, because every input `core/prometheus-exporter` takes — the port, the path and the interval of the scrape — is operational, so it is written in `infra`:

```yaml
# the Release — the api's own infra and the db's entry left out
spec:
  components:
    api:
      features:
        metrics:                              # an operational Feature
          type: core/prometheus-exporter:1.0.0
          infra:
            port: http                        # the named port of the api's Service
```

There is one attachment keyword (`features:`), one render-context shape (`.features.<name>`, and the same shape under a connection, `.context.uses.<alias>.features.<slot>`, for an attachment written on one), one execution order, and one set of output coordinates — for an attachment on a component, the component it is attached to and then the name it is attached under, whether the target's layout carries those two as a `<component>--<instance>/` directory beside the component's own or as a `<component>--<instance>--` filename prefix. What varies between attachments is **what they produce** — an injected value, a referenceable resource, a sidecar, a cloud identity — not the surface they are declared on.

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

An attachment whose instance name matches a declared slot **fills** that slot. An attachment under any other name is a **free** attachment: the entity did not ask for it, and it renders alongside anything the entity did ask for. The generated schema for a declared slot stays open, so declaring one slot never closes the block against free attachments. One shape halts instead of rendering: an attachment written on the component itself whose Feature satisfies the `selector` of a slot nothing binds there, which is a fill written under the wrong name rather than a free attachment.

Two things a slot may constrain:

- **`inject`** — the delivery mechanisms a Workload may select for what fills the slot. An empty list is a *blackbox* slot: the Recipe's own plumbing delivers it (a chart's `existingSecret` knob, for instance), and a Workload may not reference it from a container.
- **`selector`** — a label-selector string the filling Feature's labels must satisfy. This is where the `kind=secret` label earns its keep: an entity author who wants a slot filled only by a credential says so with a selector, and the check is a label-set evaluation the compiler performs during static analysis.

A third thing a slot may do is demand that it end up bound. `required: true` makes the slot's name compulsory: the compiler halts during static analysis when nothing binds it, with a diagnostic naming the slot and the component type that declared it. The demand is read against the attachment set the component ends up with once every scope has cascaded, so an attachment contributed above the component binds the slot exactly as a fill authored on the component does.

A second surface expresses a different demand. The repeatable Component annotation `features.aggrega.ai/requiredType.<label>` declares a **presence mandate**: at least one attachment must carry the Feature type the annotation names, under any name and at any scope, and a mandate nothing satisfies halts during the same static analysis with its own diagnostic. The two never answer for each other — a slot asks whether one named binding point is bound, a mandate whether some attachment carries a named type — so an entity that needs its Recipe to *read* what was attached declares a slot, while one whose contract simply demands a capability be present declares a mandate.

## What the compiler does and does not guarantee

This section is the load-bearing one. Aggrega is an ahead-of-time compiler, and its guarantees are narrower than the word "secret" invites a reader to assume.

**The compiler never resolves a credential.** It does not authenticate with a cloud API, does not read a vault, and does not fetch material during `aggrega build`. A credential attachment's `values` and `infra` travel through the graph and into the render context as opaque scalars, and a FeatureRecipe renders them into whatever artifact the target platform expects. Resolution happens later, in the cluster or the IaC state manager, against whatever the rendered artifact points at.

**The compiler cannot tell a pointer from a material value.** It is blind to what a scalar means (see [05-invariants.md](05-invariants.md)). A credential attachment whose locator carries a store coordinate (`path`, `key`, an ARN) renders a *reference* to that coordinate; a credential attachment whose locator carries the material itself renders the **material, verbatim, into the output file**. Both are legal, and the compiler treats them identically because it has no way to distinguish them.

So the honest statement of the guarantee is:

> Aggrega guarantees that the compiler performs no resolution. It does not guarantee that rendered output contains no material — that depends entirely on which credential Feature is attached and what its author put in it, the developer in `values` or the operator in `infra`.

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

The two levels are not a convenience duplicate of one another, and the referenceable-credential shape is the worked case that shows why. A referenceable credential publishes `provides.name` and `provides.key` — the resource's locator and the data key within it — and **neither is sensitive**: a Kubernetes Secret's name is public, and so is the key inside it. Both are rendered in the clear into the consumer's own manifest as a `secretKeyRef`. Yet the slot that credential fills unquestionably handles secret material. One level alone cannot express both facts: marking the published locators to make the slot read as sensitive would state something false about them and carry that error everywhere the declaration is read.

From those two declarations the compiler derives, per attachment, whether the attachment handles declared-sensitive material — true when the attached Feature declares a sensitive leaf, or when the slot it binds declares one, either alone sufficing. It derives this from the attachment as it stands after every authoring scope has folded, so a broader-scope declaration a narrower fill displaced does not linger, and a slot's demand applies to whichever fill actually won. A credential Feature that declares no sensitive leaf at all — because the target engine owns the material and the author writes nothing — still yields a sensitive attachment when it binds a sensitive slot.

### The ceiling, stated plainly

The word "sensitive" invites a reader to expect a confidentiality mechanism. It is not one, and the guarantee is narrower than the name suggests in five specific ways:

- **It does not encrypt.** Nothing is wrapped, sealed, or transformed.
- **It does not change the build's verdict.** No value is accepted or rejected because a declaration exists, and no build halts because one is missing. A catalog whose credential entities carry no declaration builds successfully, and adding declarations to an existing catalog leaves every build that succeeded still succeeding.
- **It does not guarantee that rendered output is free of material.** The guarantee stated above is unchanged: whether an artifact carries material depends on which fill was attached and what its author put in it. A declared-sensitive value supplied inline is rendered exactly as an undeclared one is, and `dist/` remains as sensitive as its most material-carrying attachment.
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

Two credentials delivered under one key halt the build, naming both attachments: a mapping writing a key another attached Feature already delivered — through that Feature's own mapping or its own `inject:` block — is refused rather than merged, so one credential is never presented in place of another. The rule is the same for every attachment, wherever it was attached and whether it fills a slot on the component or on a connection. A mapping replacing a key the component's own `inject:` block or one of its connections delivered is the interception the routing Features rely on, and stays legal.

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

## Who names the credential

A credential's **locator** — the secret's name, the store entry to fetch, the value to deliver — is written by whoever knows it, and that is not always the developer. A connection the Release wires has no entry in the Aggregate, and the Release writes `values` nowhere, so a credential that took its locator from `values` alone could never be named on such a connection, nor on any attachment the Release makes.

So each standard-library credential Feature that carries a caller's locator — `core/referenced-secret`, `core/referenced-secret-set`, `core/secret-value` and `core/secret-provided` — accepts it from either author: the developer in the attachment's `values`, in the Aggregate, or the operator in its `infra`, in the Release. The leaf has one name, one shape and one `sensitive: true` declaration in both pillars, and every realization reads whichever pillar carries it. The Release's `values:` ban is untouched: the operator's locator is `infra`. The Features that take no locator — `core/random-password`, `core/generated-secret` — are unaffected.

**Exactly one, held by the Feature.** An attachment carries the locator in one pillar, never both and never neither. No pillar's schema can say that, because each pillar is validated on its own; each Feature's own `assertions` block does, and an attachment that breaks it halts the build naming the Feature, the attachment and the component. That is the catalog entity's contract, upheld the way every Feature assertion is: the compiler evaluates the template the Feature's author wrote and holds no rule of its own about credentials, pillars or locators.

**What stays where it was.** Every other field keeps its pillar — a referenceable credential's data key is still written in `values`, so an attachment the Release alone makes reads its default — and `core/secret-provided` still delivers only through the attachment's own `inject:` block, which only the Aggregate writes and a connection's attachment never carries.

## Sharing one credential across consumers

**The consumer may hold the credential.** A slot belongs to whichever entity needs the credential, and that is often the *caller* rather than the thing being called: a component that presents a key when it reaches out declares the slot for that key on its own catalog entity, on the socket it reaches out through, so the key is held on the connection it is presented on — and nothing about a `uses` edge obliges the target to supply one. `core/ai-agent/crewai` is the shipped shape — its `model` socket declares an optional `credential` slot carrying the `feature.aggrega.ai/kind=secret` selector, `inject: [env]`, and `sensitive: true`, and an Aggregate fills it under the connection, at `uses.model.<alias>.features.credential`. What the standard-library model components publish for a consumer to read is a serving location and a model name, not a credential, so the key the agent presents when it calls that endpoint is declared by the agent and held on its connection. The slot is optional, but a connection reaching a model its catalog labels `component.aggrega.ai/hosting: managed` that carries no credential halts the build unless its own `values` say the model takes none, `unauthenticated: true` — an assertion the agent's catalog entity carries, which the compiler evaluates as it evaluates any assertion, reading the label as a string. The model component it connects to may hold a key of its own for its *own* callers — `core/ai-model/vllm` declares an `api_key` slot for exactly that — and the two are separate binding points: an attachment binds a slot by name where it is declared, on the component or on the connection, so filling one says nothing about the other.

That placement is what makes the two forms below deployment choices at all: with the slot on the consumer, one build can give each consumer its own key and another can give them all the same one, with no catalog entity changing between them.

The same catalog entity serves both shapes, and the **author** chooses which:

- **Per-consumer.** Each consumer fills its own slot with its own credential attachment — on the component, or on its connection where the slot is a socket's. Each gets its own rendered resource.
- **Shared.** For a slot a component declares, one credential is attached once at a shared scope — a subsystem in the Aggregate, a boundary in the Release — and cascades to every component in that scope. A slot a socket declares is filled per connection, and nothing cascades into a connection, so there the shared shape is authored on each connection: every connection's credential reads one parameter. Where the consumers must reference one physical resource, that parameter names it — `core/referenced-secret` bound to the existing-Secret realization points every connection at one Secret by name, and a generated credential is one request and many references, as [below](#a-credential-the-target-generates).

State the shared form's rendering precisely, because it is easy to assume otherwise: **a shared attachment renders one resource per consumer**, each carrying the same material from the one declaration. Rendering runs per component, and a resource name derived from `{{ .context.instance_id }}-{{ .attachment_name }}` therefore differs per consumer. The single declaration is what is shared; the emitted resources are not deduplicated into one. One parameter read on each connection renders the same way under a realization that renders a resource — one per connection, the attachment's name being the connection's alias, a dot and the slot.

If a deployment needs exactly one physical Secret that several consumers read, express that with a credential Feature whose FeatureRecipe runs at boundary scope (`executionScope: boundary`), which renders once for the boundary rather than once per component.

### A key both ends of a connection hold

A server that checks a key and the component calling it each hold that key, each on its own side. The server holds the key it verifies in a slot of its own Component — `core/ai-model/vllm`, `core/ai-model/tei` and `core/ai-model/tgi` each declare `api_key`, as do the LiteLLM model and gateway for the key LiteLLM calls its master key — and its Recipe delivers whatever fills the slot as the variable the server reads. The caller holds the key it presents on its own side: on the connection it presents it on, in a slot its socket declares — as `core/ai-agent/crewai`'s `model` socket declares `credential` — or, where its Component declares the key on itself, in that slot, for every connection it makes. Neither end sees the other's attachments: an attachment on a connection lands on the caller alone, and a server's rendered output is the same whatever the connections reaching it carry. The server never learns which key a caller holds, and the caller reads only what the server publishes — an address and a model name. The two ends agree because the Aggregate feeds both from one parameter:

```yaml
spec:
  parameters:
    model_key_secret: { type: string }
  components:
    model:
      type: core/ai-model/vllm
      values: { model: Qwen/Qwen2.5-0.5B-Instruct }
      features:
        api_key:                         # the key the server verifies
          type: core/referenced-secret
          values:
            origin: "{{ .parameters.model_key_secret }}"
            key: api-key
    router:
      type: local/gateway/model-router   # its `models` socket declares a `credential` slot
      uses:
        models:
          local:
            target: model
            features:
              credential:                # the key the caller presents
                type: core/referenced-secret
                values:
                  origin: "{{ .parameters.model_key_secret }}"
                  key: api-key
```

Whether that is one secret or two follows from where the two ends resolve secrets. A provider resolves a secret by reference within a **secret scope**: a Kubernetes namespace on `helm`, a Compose project on `compose`, a boundary's root configuration on `terraform`, and on `cloudformation` a stack, in the AWS account and region it deploys into. Where both ends sit in one scope, they reference one secret resource. Where they sit in different scopes, each end holds a secret resource of its own, realized from the same store entry. The Manifest chooses each end's realization — by Feature type, or for one attachment by its name, which for a connection's attachment is `<alias>.<slot>` (`local.credential` above). Since one parameter feeds both, the two realizations read `origin` as the same kind of locator: both a Secret's name, both the key of a store entry, or both the value itself.

On `helm` with both ends in one namespace, binding `core/referenced-secret` to `helm/k8s-existing-secret` and fulfilling the parameter with the name of a Secret that namespace holds, `model-keys`, has both ends reference it by name and renders no Secret. The server's container carries:

```yaml
- name: VLLM_API_KEY
  valueFrom:
    secretKeyRef:
      name: model-keys
      key: api-key
```

and the router's Recipe reads the same name and key from its connection, at `.context.uses.local.features.credential.provides`. With the two ends in different namespaces, binding it to `helm/k8s-external-secret` and fulfilling the parameter with the key of a store entry gives each end an `ExternalSecret` of its own, in its own namespace, both fetching that one entry. On `compose`, both ends carry the same `${VAR}` reference, which Docker Compose substitutes from the environment the one project is started with. This placement is a convention the standard-library catalog follows; the compiler compares nothing between the two ends.

**One key serves every caller.** vLLM, TEI and TGI each check a single key, so every caller presents the same key and the server cannot tell one caller from another, however many connections reach it. That is the server's own limit. TGI matches its key without regard to letter case, so two keys differing only in case are one key to it. The LiteLLM model and gateway also accept the keys they issue themselves, while their bookkeeping database is attached.

## A credential the target generates

Where a Release supplies no credential, a catalog entity often falls back on a development default — an inline value in a Recipe, a default on a module's parameter. That value is the same for every reader of the catalog, which is acceptable for evaluation and for nothing else. `core/random-password` removes the need for it: no one writes the credential, because the target generates it.

The build cannot be where the password is made. Its output is a pure function of its input and never carries a secret's value, so a password drawn at build time would change on every build and sit in the rendered files. The FeatureRecipe renders a **request** instead — a generator resource naming the secret resource it fills — and the target draws the value at deploy time:

- on `helm`, a controller in the cluster: the External Secrets Operator's password generator, reconciled through an `ExternalSecret`, or the kubernetes-secret-generator controller, reconciling a `StringSecret`;
- on `terraform`, the random provider's `random_password`, drawn when the configuration is applied;
- on `cloudformation`, a Secrets Manager secret that generates its own string when the stack creates it.

In every case the rendered output names the generator and the secret resource and carries no value. That is a property of what the build has, not a protection it adds: the value never exists until the target makes it. Where the target keeps it afterwards is the target's — Terraform keeps it in the plan and state, a cluster in a Secret.

**What the target needs running.** A request is only filled where something fills it. On `helm` that is the controller, and the compiler cannot inspect the cluster to know whether one runs, so the helm FeatureRecipes halt the build unless the Release affirms the prerequisite with `infra.control_plane_present: true` on the attachment. On `terraform` and `cloudformation` the apply or the stack generates the value itself and nothing needs to be running beforehand.

**Where it cannot be used.** Compose runs no controller and has no resource that generates a value, so no FeatureRecipe realizes `core/random-password` there, and a build binding it on compose halts for want of one. A Release targeting compose supplies its credential through `core/secret-value`, typically as a variable reference Docker Compose substitutes when the stack starts.

**How a consumer reads it.** `core/random-password` publishes the same `provides.name` and `provides.key` as `core/referenced-secret`, and carries the same `feature.aggrega.ai/kind: secret` label, so a slot selecting the credential family admits it and a consumer reads a generated credential exactly as it reads one that already exists.

**How several consumers share one.** A generator draws a new value for every request, so the sharing rule of the previous section applies with a sharper edge: a generated credential attached at a shared scope — or on each consumer — renders one request per consumer, and each request draws a **different** password, which a database and its clients cannot use. One generated credential shared by several consumers is expressed as one request and many references: `core/random-password` on one component, with its `name` value pinning the Secret it fills, and `core/referenced-secret` on the others, bound to the existing-Secret realization and pointed at that same name. Written from one parameter, the two cannot disagree, and the render carries exactly one request that every consumer references.

`core/random-password` is not `core/generated-secret`. That Feature hands a credential to an engine that already owns its whole lifecycle — a managed database, a database controller — and renders nothing. `core/random-password` renders the request itself, for a workload whose Recipe expects to be handed a credential.

## Attachment precedence

An attachment may be declared at several scopes at once. Ownership of a contested field resolves by three rules, applied in this order:

1. **Origin.** An explicitly authored field beats one contributed by annotation-driven expansion, whatever scope either came from.
2. **Composition authority.** A declaration in the Aggregate you are deploying beats one inside an Aggregate it composes, even when the composed document declared at the narrower scope.
3. **Specificity.** Within one authoring level, the narrower scope refines the broader one **field by field**: a component-level fill overrides a subsystem-wide or boundary-wide attachment of the same instance name only for the fields it mentions, and fields it omits keep the broader scope's values.

The developer side supplies `values` and the operator side supplies `infra`, so the two never contest the same field. A credential Feature taking its locator from either side declares it as two fields, one per pillar, and its own assertion refuses an attachment carrying both, so precedence has no tie to break there either. Precedence governs field values only; it does not reorder evaluation, which follows the cascade sequence in [10-compilation-pipeline.md](10-compilation-pipeline.md).

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

The golden local-development path keeps developer intent unchanged and swaps the binding. The Aggregate keeps attaching the same credential Feature type; the local Manifest maps that type to a local FeatureRecipe instead of the store-backed one. The compiler still fetches nothing — the local FeatureRecipe simply delivers provider-native syntax the local runtime resolves: for Compose, a variable reference such as `${SECRET_NAME}` written into the service's environment, which Docker Compose substitutes from the shell environment or a `.env` file when the stack starts. Swapping environments is a Manifest edit.

## Data governance around credentials

Aggrega does not model data schemas — rows, columns, files are application concerns. It models the *governance identity* of data with labels, and the standard-library convention is:

- Data lives in components whose ontology label marks them stateful or resource-like (`component.aggrega.ai/type: stateful-server`, `resource`). A message broker holding queued payloads is one of these too: it carries `stateful-server` when it owns its disk and `resource` when the Release wires a hosted one, and the `messaging` shelf it browses under is the separate `component.aggrega.ai/category` axis.
- `compliance.aggrega.ai/data-class` (`public`, `internal`, `restricted`) gives that data a semantic identity. The convention fixes the key and its values, not which components carry it: no standard-library Component does, because the class of the data a component holds is a statement about how an estate uses the component rather than a property of the product, so an estate states it on its own Components. It is an ordinary label: label selectors evaluate it, and a governance plugin an operator attaches may read it and reject a build. The compiler itself does not interpret it and ranks no class above another — which classes exist and how they rank is the attached policy's own settings, as in [../language-reference/examples/policy-data-class-route/](../language-reference/examples/policy-data-class-route/).

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
- [../language-reference/entities/component.md](../language-reference/entities/component.md) — `featuresSchema` slot authoring, including the slot-level `sensitive` declaration, the `required` keyword, and the point-by-point contrast between a slot and a presence mandate.
- [../language-reference/vocabulary/compact-form-authoring.md](../language-reference/vocabulary/compact-form-authoring.md) — the leaf-level `sensitive` keyword, where the declaration is read, and the `parameters:` asymmetry.
- [../language-reference/entities/workload.md](../language-reference/entities/workload.md) — the container `attachments:` map and its validation rules.
- [../language-reference/examples/04-secrets.md](../language-reference/examples/04-secrets.md) — the authoring checklist and worked transparent / blackbox examples.
- [../language-reference/examples/05-credential-features.md](../language-reference/examples/05-credential-features.md) — the credential Feature families and an end-to-end walkthrough.
- [../language-reference/examples/model-api-key-sharing/](../language-reference/examples/model-api-key-sharing/) — a credential slot an agent's socket declares, filled on each connection three ways from one catalog entity: a key per connection, one Secret every connection references, and a shared default one connection overrides, with each form's rendered output.
