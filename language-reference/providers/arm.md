# ARM Provider

The `arm` provider renders Aggrega Recipes into Azure Resource Manager (ARM) templates at resource-group scope. Every component rendering to the same output directory under this provider assembles into one template, written as `arm-template.json` in the boundary's output directory: a single JSON document in template language version 2.0, with resources keyed by symbolic name. A boundary therefore becomes one template in the ordinary case — and two boundaries whose `directory:` resolves to the same path assemble into one template together, sharing its names. Like every Aggrega provider it is offline and hermetic: an Aggrega build is an ahead-of-time compilation, so the provider never calls Azure, never resolves a live address and never runs ARM. Runtime-only values stay as ARM template expressions (`reference()`, `resourceId()`, `parameters()`) that ARM evaluates when the template is deployed.

## Fragments assembled into a template

An `arm` Recipe authors a **fragment** — the ARM resources contributed by a single component — rather than a whole template. When a boundary's components render, the provider assembles every fragment in the dispatch group into one template: the resources merge under one `resources` object, the `outputs` each fragment authors are carried into the template's `outputs`, and the template's other top-level sections are accounted for one by one under [Top-level sections in the assembled template](#top-level-sections-in-the-assembled-template). Two authoring shapes are accepted:

- **Fragment (artifacts) input.** A Recipe or FeatureRecipe authors the sections of a template under `artifacts:`, in YAML or JSON. The provider reads each entry, checks it and merges it into the assembled template.
- **Sourced input.** A Recipe references a compiled ARM template — a single `.json` file, or a directory holding `main.json` (the file Bicep and Azure Verified Modules commit) or, failing that, `azuredeploy.json`. The provider wraps it as one nested deployment, fills the parameters it declares from the Recipe's `valuesMapping`, and leaves out any resource the Recipe's `omits:` entries name. See [Sourced templates](#sourced-templates) and [Leaving resources out of a sourced template](#leaving-resources-out-of-a-sourced-template). A `.bicep` source is compiled with `bicep build` first; the provider reads templates, not Bicep.

A Recipe that declares neither a `source:` nor `artifacts:` has nothing for this provider to render, and `arm` does not accept a `workload:`: it does not synthesize compute from a Workload.

### A Feature attached to a component contributes to the same template

A Feature attached to a component contributes its resources to the template its host component assembles into, on the same terms as the host component's own Recipe. There is no separate template beside it: the assembled template is the whole of what this provider emits for an output directory, so an attached Feature's resources are either in that template or not deployed at all. Detaching the Feature removes exactly those resources and leaves the host component's own untouched.

Because they land in the assembled template, they share its names. A resource's symbolic name is emitted exactly as the FeatureRecipe authored it, in the same space as the host component's and every other attachment's, so [Names](#names) applies to them unchanged. Where two contributors meet on one name the halt names both, so each end of the collision is searchable in your own files.

**An attached Feature's outputs publish under its host component's name, and its resource symbolic names do not.** A Feature attached to `payments-db` that authors an output `alarm` reaches the same output name it would reach had the host authored that output itself, so an entry name the host also publishes meets the attachment's at one output name and the build halts. Choose entry names that read as the Feature's own — `backup-alarm` rather than `alarm`. Each resource a Feature contributes keeps the identity composed for that attachment in the provenance written onto it. [Labels and annotations](../vocabulary/labels-and-annotations.md) covers how that identity is built.

## Top-level sections in the assembled template

Several components assemble into one template, so every top-level key an ARM template admits is accounted for by the assembly. Each falls into exactly one group below, and a top-level key a component writes that is no section at all gets a warning naming the component and the key, so nothing is dropped without being said.

| Top-level key | What the assembled template does with it |
| --- | --- |
| `$schema` | Read for the scope the content is written for: the file name of the schema (`deploymentTemplate`, `subscriptionDeploymentTemplate`, `managementGroupDeploymentTemplate`). Absent means resource group. The assembled template carries the resource-group schema. A fragment written for another scope halts; see [What `arm` does not do](#what-arm-does-not-do). |
| `languageVersion` | Written as `2.0` by the provider. A fragment's own must be absent or `2.0`; any other value, every experimental one included, halts naming the key. |
| `contentVersion` | Written as `1.0.0.0` by the provider. A fragment's own is reported with a warning and not carried. |
| `apiProfile` | Halts naming the key: a profile changes the API version of every contributor's resources, so one component cannot carry it into a template other components share. |
| `resources` | Merged by symbolic name and read as written. The section must be an object keyed by symbolic name; a list halts and says so. |
| `parameters`, `variables`, `definitions` | Carried under the names written. Two components declaring one name with the same content merge into one entry; with different content the build halts naming both. |
| `functions` | Carried by `<namespace>.<member>`, on the same rule. |
| `outputs` | Carried under names the provider derives from the publishing component; see [Names](#names). Each keeps its `type`. |
| `metadata` | Carried by key, on the same rule as the sections above. |
| any other key | A warning naming the component and the key; not carried. |

Two components declaring different names in a carried section both land. Two declaring one name with **different** content halt the build, naming the section, the name and both components, because one of the two bodies would otherwise be discarded. Two names that differ only in letter case but are spelled differently also halt, because ARM reads parameter, variable and function names without regard to case; the halt names both spellings. Renaming either entry clears it. The warning for a `contentVersion` or an unknown key is out of band — the emitted template is byte-for-byte what it would be without it — and `--no-unsupported-field-warnings` silences it along with the rest of that class.

## Names

Every component assembling into one template shares its names — including components from a second boundary, when both resolve to the same output directory. Each name the template addresses something by has to be distinct across every contributor.

**Resource symbolic names come from the Recipe.** The provider emits them exactly as authored and rewrites none of them. A symbolic name admits letters, digits and underscores; a name outside that alphabet halts the build, naming the contributor, the JSON pointer and the name. Symbolic names are case-sensitive. A symbolic name two contributors both declare with different content halts the build naming both of them: one symbolic name addresses one resource.

**Output names are scoped by the component that published them.** Each entry of a fragment's own `outputs` section is carried into the template's `outputs` under a name built from the publishing component and the entry together, so two components authoring the same entry reach two separate outputs, and an output's meaning does not change when another component joins the template. The name is built over `[a-z0-9]`: each character outside that alphabet, and each upper-case letter, is spelled out in characters the alphabet admits, opened by `_`, so no two different names collide. The two halves meet at `__`, and a name never opens with a digit:

```
component payments-db  authoring output host   →  payments_zhdb__host
```

A Recipe's `provides` are not projected into the template's `outputs`: a `provides` value is an ARM expression, such as `[reference('PaymentsDb').outputs.fqdn.value]`, that a consumer in the same template reads directly. A value that should appear among the template's outputs, for an operator to read once the template is deployed, is authored in the fragment's `outputs` section.

An attached Feature's authored outputs are named under the host component's name (see [A Feature attached to a component](#a-feature-attached-to-a-component-contributes-to-the-same-template)). Two entries that reach one output name — the same Feature attached twice to one component, say — halt the build naming the component and the attachment each side was carrying; either attach the Feature once or choose entry names that read as that attachment's own. Output names are read, in the emitted template, as the provider writes them; a consumer inside the same template reads the producer's value through the expression the producer's `provides` carries, not through an output.

**A nested deployment's symbolic name is derived from the instance id.** A sourced template is wrapped as one nested deployment, named by folding the component's instance id into words: `payments-db` becomes `PaymentsDb`. A Recipe writes the same fold with `{{ capitalizedWords .context.instance_id }}`. The name holds at most 50 characters and does not open with a digit. An instance id that folds to nothing, opens with a digit or folds to more than 50 characters halts the build naming the id; two ids that fold to one name halt naming both instances, because one symbolic name would otherwise address two nested deployments. Renaming the instance clears it.

**A name outside the alphabet halts rather than being repaired.** A symbolic name is how ARM identifies a resource within a template, so rewriting one on your behalf would address a different resource than the one you wrote. The build stops and names the problem while it is still yours to fix.

## Writing ARM text

Every string a Recipe writes into an `arm` template is ARM text, read the way ARM reads it:

- A string that starts with `[` and ends with `]` is an **expression**. It must parse; an expression that does not halts the build naming the JSON pointer.
- A string that starts with `[[` is a **literal** that opens with `[`. ARM reads `[[` as one `[`, so `"[[prod]"` is the text `[prod]`.
- Any other string is a literal. Bracketed text inside a larger literal — `array[0]`, `[a-z]`, `[test] value`, `[ -f x ]` — reaches the template byte for byte.

A whole string that ARM would read as an expression but that cannot parse, such as `"[prod]"`, halts naming its pointer and says to write `[[` to keep it literal.

**Escaping.** To keep bracketed text literal, open it with `[[`. Inside a `format()` string, a literal `{` or `}` is written doubled. A literal ARM `{{` inside an artifact the Aggrega template engine evaluates is written `{{ "{{" }}`, because the engine reads `{{` as its own action: ARM uses single braces, so most artifacts need none of this.

**Composing a delivered value.** A component can write a neighbour's value three ways, and the same text works wherever the neighbour lands:

| Written as | What the template carries |
| --- | --- |
| The value whole, `"<value>"` | The producer's expression as it stands, evaluated as written. |
| Inside literal text, `"postgres://<value>:5432"` | A `format()` expression: `"[format('postgres://{0}:5432', <expression>)]"`. |
| Inside an expression you wrote, `"[concat('x', <value>)]"` | The build halts: the value's own brackets cannot nest inside an expression. Write the expression with the producer's call in place of the value, or compose the text literally. |

A value is never rewritten except in the second row, and the provider reads only spans that parse as a complete call to an ARM template function — or to a `namespace.member` the template's own `functions` declares — with any member or index accessors after it. Each such rewrite is reported as an **info** diagnostic naming the component and the JSON pointer, so a rewrite is never silent:

> arm-provider: `<where>`, a value written inside literal text is written as a format() expression, so that ARM evaluates it; to keep the text literal, write the whole string as an expression, such as [format('...')]

**Keeping a literal that looks like a call.** Text meant literally that is nonetheless a complete bracketed ARM call is kept literal by writing the whole string as an expression: `[format('…')]`. The provider does not read the string tokens of an expression for calls.

**Where a state-reading call may appear.** `reference()` and the `list*` functions are admitted in a resource's `properties`, in an output's `value` and in the `input` of an output loop; anywhere else — a variable, a parameter default, a resource's `name` — the build halts naming the pointer, because ARM evaluates them only at those places. They are refused inside a user-defined function for the same reason: call them where the function is used and pass the result in as an argument.

## Structural validation

A sourced template is validated before it renders. A template that cannot be read as JSON — byte-order marks, CRLF line endings and JSONC comments in a template saved by Windows tools are read, and anything else is not — reports the validation code `arm-template-parse`. A document that reads as JSON but is not an ARM template at resource-group scope reports `arm-template-shape`: not an object, no `$schema`, a schema that names no template scope, or a `resources` of the wrong form for its language version (a list under `languageVersion` 2.x, an object under none). Both validation codes name the file and what to fix. A template that passes is not thereby carried whole: what reaches the assembled template is decided under [Sourced templates](#sourced-templates).

## Sourced templates

**Selection.** A single-file source is that file, whatever its name. A directory source's root must hold `main.json`, else `azuredeploy.json`; a directory holding neither halts, naming both file names and saying that a `.bicep` source is compiled with `bicep build` first. Only the selected file is read: an Azure Verified Modules directory holds tests and other files beside it, and none of them is packed.

**Wrapping.** The template becomes the `properties.template` of one nested deployment resource, written with sorted keys. The nested deployment evaluates in its own scope (`expressionEvaluationOptions.scope` `inner`) and deploys incrementally; its `name` is `[format('<Symbol>-{0}', uniqueString(deployment().name))]`, so it is stable for one outer deployment. The vendored template is carried as it was read, apart from the resources an `omits:` entry removes. A 1.0-language template nests inside the 2.0 outer template.

**Telemetry.** A module that sends telemetry from the deployment it creates is told not to by the Recipe that wraps it: a Recipe for an Azure Verified Module binds `enableTelemetry: false` in its `valuesMapping`. The provider never adds a binding the Recipe did not write.

**Binding.** The Recipe's `valuesMapping` binds the template's parameters, becoming the nested deployment's `properties.parameters`. Each mapping key names a parameter the template declares, matched without regard to letter case, as ARM matches parameter names; a key naming none halts, listing the parameters the template declares. A key written twice in different cases halts naming both. Each value is bound by what it is:

| A mapped value | What the nested deployment's parameter receives |
| --- | --- |
| An expression string, `[…]` | `{"value": "<expression>"}`. The expression is evaluated in the outer template's scope, so a neighbour's symbolic name resolves. It must parse. |
| A Key Vault reference object, exactly `reference: {keyVault: {id: …}, secretName: …}` with an optional `secretVersion` | The object itself, written as the parameter's entry. Admitted only for a `securestring` or `secureObject` parameter (declared directly, or through one `$ref` into `definitions`); for any other the build halts. |
| `null` | `{"value": null}`, only for a parameter that declares `nullable`; otherwise the build halts. |
| A literal | Converted as ARM reads the parameter's declared `type`: text for `string`, a whole number for `int` (integer text is written as a canonical JSON number), `true` or `false` for `bool`, a list for `array`, an object for `object`. It is then checked against `allowedValues`, `minLength`, `maxLength`, `minValue` and `maxValue`. A failure halts naming the parameter and the constraint, never the value. A parameter typed by a `$ref` passes its literal unchecked, because ARM validates it when the template deploys. |

Every string in a bound value, at any depth, is ARM text under [Writing ARM text](#writing-arm-text): `[…]` is an expression that must parse, and `[[…` is a literal.

**A literal into a secure parameter halts.** A literal for a `securestring` or `secureObject` parameter would write the secret into the template as text, so the build halts and says to map a Key Vault reference or an expression.

**The sensitive-mapping rule.** When a `valuesMapping` reads a value a Feature declares sensitive, every literal the mapping produces is refused — the build cannot tell which of the mapping's output keys carries the secret — and the halt names the parameters the literals would have bound, never a value. Expressions and Key Vault reference objects pass as written, so route each parameter to one of them. The mark is exact on the read side:

**Exact-leaf reads.** A Recipe's `valuesMapping` marks itself sensitive only by reading a value declared sensitive, or a whole object or map that holds one. A Recipe therefore reads an attachment and the inject pipe by exact leaf — `.features.password.provides.name`, `.features.password.type` — and never ranges over `.features`, reads `.features.password` whole or reads `default dict .features`, any of which marks the mapping. The leaf a Feature's `provides.name` publishes is a locator, not a secret, so reading it leaves the mapping unmarked and the Recipe's other literals — SKUs, `enableTelemetry: false` — bind normally.

**The Key Vault reference object.** On `arm`, a Feature that names a secret publishes where the secret lives — for a Key Vault secret, its resource ID — and never the secret itself. The consuming Recipe writes the reference object ARM reads in a parameter's place:

```yaml
valuesMapping: |
  adminPassword:
    reference:
      keyVault:
        id: /subscriptions/<subscription>/resourceGroups/<group>/providers/Microsoft.KeyVault/vaults/<vault>
      secretName: <secret>
```

**A required parameter left unbound halts.** A nested deployment's parameters cannot be supplied when it deploys: a parameter with no `defaultValue` that does not admit null and has no mapped value halts the build, naming the parameter and saying to map each one. To take a value at deploy time, map the parameter to `[parameters('<name>')]` and declare that top-level parameter in the Recipe's own `artifacts:` fragment.

## The `arm` Recipes in the catalog

Each `arm` Recipe in the table that names a module wraps one of Microsoft's Azure Verified Modules at a pinned tag, each fetched from its git repository at the commit `entity.lock` records, and each binds `enableTelemetry: false`; `arm/azure-api-management` authors its resources itself and `arm/key-vault-secret` renders none. A Recipe reads the Release's `infra.overrides` for the operator's own resources, and halts by name on a value it cannot realize.

| Recipe | Implements | What it wraps or authors | Notable refusals |
| --- | --- | --- | --- |
| `arm/postgres-flexible-server` | `core/datastore/postgres` | `avm/res/db-for-postgre-sql/flexible-server` 0.16.2: one flexible server with private access in the operator's delegated subnet and private DNS zone | init scripts, a configuration file, another port, a storage size the service does not offer; an administrator password from anything but a Key Vault secret |
| `arm/redis-azure-managed` | `core/datastore/redis` | `avm/res/cache/redis-enterprise` 0.5.2: one Azure Managed Redis instance with its one database | an attached password, `maxmemory`, `databases`, another port, a container image, a server certificate |
| `arm/server-container-apps` | `core/compute/server` | `avm/res/app/container-app` 0.23.1: one Container Apps app with internal ingress, in the operator's environment | `infra.published_port`, a delivery its producer declares sensitive, a registry password written as text |
| `arm/worker-container-apps` | `core/compute/worker` | `avm/res/app/container-app` 0.23.1: one Container Apps app with no ingress, in the operator's environment | a delivery its producer declares sensitive, a registry password written as text |
| `arm/azure-openai` | `core/ai-model/azure-openai` | `avm/res/cognitive-services/account` 0.19.2: an Azure OpenAI account under the custom subdomain the Release names, and one chat model deployment | `infra.endpoint`, `infra.overrides.enable_telemetry: true` |
| `arm/azure-openai-embedding` | `core/ai-model/azure-openai-embedding` | `avm/res/cognitive-services/account` 0.19.2: the account and one embedding model deployment | `infra.endpoint`, `infra.overrides.enable_telemetry: true` |
| `arm/azure-api-management` | `core/gateway/azure-api-management` | Authors an API, its chat completions operation, its backend and its policy on an API Management instance that already exists; it creates no instance | a Feature that writes a policy element: `core/semantic-caching`, `core/period-budget`, `core/prompt-injection-shield` and `core/retry-policy` |
| `arm/key-vault-secret` (FeatureRecipe) | `core/referenced-secret` | Renders no resource; publishes the Key Vault secret's resource ID as the locator a consuming Recipe uses | an `origin` that is not a Key Vault secret's resource ID |

Deploying the template is the operator's: a build sees neither the subscription's quota nor the regions' offerings, so a value Azure refuses surfaces when the template deploys.

## Key Vault routes

On `arm`, a secret reaches a resource as a reference to a Key Vault secret that already exists, so neither the Release nor the emitted template carries its value. Bind `core/referenced-secret` to `arm/key-vault-secret`: `origin` is the secret's resource ID, `/subscriptions/<subscription>/resourceGroups/<group>/providers/Microsoft.KeyVault/vaults/<vault>/secrets/<secret>`, and `values.key` is the data key; both are published as written. The deploying identity must be able to read the secret.

**Into a sourced module.** `arm/postgres-flexible-server` reads the secret's location from the attachment on its `password` slot and binds the module's secure password parameter as a Key Vault reference object, as under [Sourced templates](#sourced-templates). With nothing attached, or another credential, the build halts naming the slot. `arm/azure-api-management` reads its `provider_key` slot the same way: the template writes a named value the instance reads from the secret with its managed identity, which needs read access to it.

**Into a Container Apps container.** A value a neighbour delivers and its producer declares sensitive halts the build in `arm/server-container-apps` and `arm/worker-container-apps`; the route for such a credential is `infra.overrides.secrets`, a map from the name of a container variable to an entry holding `origin` and `identity`:

```yaml
infra:
  overrides:
    secrets:
      DATABASE_PASSWORD:
        origin: /subscriptions/<subscription>/resourceGroups/<group>/providers/Microsoft.KeyVault/vaults/<vault>/secrets/<secret>
        identity: /subscriptions/<subscription>/resourceGroups/<group>/providers/Microsoft.ManagedIdentity/userAssignedIdentities/<identity>
```

`origin` is the Key Vault secret's resource ID and `identity` is a user-assigned managed identity allowed to read it. The Recipe writes one Key Vault-backed app secret for each entry, named after the variable in lowercase with each underscore a hyphen, whose `keyVaultUrl` is built from the vault and secret names with `environment().suffixes.keyvaultDns`, so the address is the one of the cloud the template deploys to. The container variable names that app secret with `secretRef`, and the template holds no value. An entry that sets `value` or any key beyond `origin` and `identity` halts, as does an `origin` that is not a Key Vault secret's resource ID.

**No generator.** ARM has no secret generator, so `core/generated-secret` and `core/random-password` have no `arm` FeatureRecipe and a build binding either halts for want of a Recipe; see [the credential model](../../architecture/08-credential-model.md#a-credential-the-target-generates).

## Leaving resources out of a sourced template

A sourced template's resources are its own: values reach it only through the parameters it declares, so a template fetched from a git repository that declares a resource the Release must not create — a diagnostic setting the platform provides elsewhere, a key vault the operator already owns — cannot be changed by a value. That is what the [`omits:`](../entities/recipe.md#the-omits-field--leaving-rendered-documents-out-of-a-source) entries of a Recipe or a FeatureRecipe are for. This provider honours them on a sourced template and on nothing else: the fragments an `artifacts:` entry authors render without them.

An entry's `kind` is a resource's `type`. Its `name` is the resource's symbolic name in a template with `languageVersion` 2.x, or the resource's `name` property exactly as written in a template without one; both compare exactly. An entry naming a `namespace` or a `subchart` halts, because a template has neither. Each entry that matches nothing halts as every provider's omits do: an entry that leaves nothing out is a mistake to fix, not a no-op.

**A reference that still names a removed resource halts.** ARM refuses a template that names a resource it does not declare, so once the entries' resources are removed the provider reads what remains for references to them, and halts naming the template, the resource, the form and the JSON pointer. In a 2.x template it reads `dependsOn` entries (a `parent::child` entry by its head as well) and the symbolic first argument of `reference`, `references`, `resourceInfo` and the `list*` functions; in a template without a language version, `dependsOn` names, `reference('<name>')` and a `resourceId(…)` call whose literal type and last name are the removed resource's. A string in a template where an entry matched that reads as an expression but does not parse halts too, rather than let a reference through unproven. Leave out whatever names the resource as well, or remove the entry. Nothing else about the template changes.

**What you leave out is yours to answer for.** Nothing in the build knows what a resource is for. Removing one the rest of the template reads at deploy time produces output that builds cleanly and fails when it deploys.

## Deployment ordering

A Release boundary's `syncWave:` value orders the resources of the template that boundary assembles into. Every component in the boundary inherits the boundary's wave, and where several boundaries resolve to the same output directory the template holds more than one wave; the provider expresses the order between them as `dependsOn`.

**Each resource names every resource of the immediately preceding wave that has any, and no earlier wave than that.** ARM chains the rest: a resource in wave `2` depends on wave `1`, which depends on wave `0`. The units are the resources of the template — fragment resources and nested deployments alike — and the entries are symbolic names, sorted. Waves need not be contiguous, and negative values are ordinary. The lowest wave names nothing.

**An authored `dependsOn` is extended, never replaced.** The entries a resource wrote stay first, in the order it wrote them, and the wave's entries follow. A single symbolic name and a list are both read, and the merged value is a list. A `dependsOn` that is neither halts, naming the pointer. A resource declared `existing: true` is neither a dependent nor a target, because the template does not deploy it.

**It is deployment order, not readiness.** A template expresses no notion of a resource being serviceable: `dependsOn` waits for ARM to finish deploying the named resource. A template whose resources all carry one wave, and a Release that declares no `syncWave`, get no ordering added. A wave orders one template and nothing beyond it; sequencing two templates is the operator's concern.

## Provenance

Each resource the template deploys carries the build's provenance on its own `metadata`, under the single reserved key `aggrega.ai/provenance`, merged beside any `metadata` the resource already wrote. A resource declared `existing: true` is not stamped, since the template does not deploy it. A sourced template's stamp lands on the nested deployment resource only, never inside the vendored template, which is carried as it was read. A resource whose `metadata` is not an object is left as written, and a warning names it; a fragment that deploys no resource gets a warning that its provenance has no resource to describe.

**Provenance is not readable back from a deployed resource.** ARM keeps a resource's `metadata` in the template that declared it and does not return it with the resource, so `az resource show` and the portal do not show the stamp. Read it in the emitted `arm-template.json`, or in the build's other outputs. [Labels and annotations](../vocabulary/labels-and-annotations.md) says what the provenance holds.

## Limits

Each assembled template is checked before it is written against the limits ARM sets on one template: 4 MB for the template, 1 MB for a resource, 256 parameters, 512 variables, 800 resources, 64 outputs, and 24,576 characters for one expression. A template over a limit halts the build naming the measure, the limit and the remedy: split the boundary so that its resources deploy as more than one template.

**The check is made before `copy` expansion.** A resource or output carrying a `copy` loop counts once; ARM expands it when the template deploys, so a template that passes here can still exceed a limit then, and `what-if` reports it.

## Determinism

Given the same inputs the provider emits a byte-identical template across runs: symbolic names, output names, section content and `dependsOn` entries are all deterministic, written with sorted keys, two-space indentation and one trailing newline. An `arm-template.json` diffs cleanly in review.

## Deploying at resource-group scope

The assembled template is a resource-group template, and the provider writes no parameters file: its `parameters` are exactly the ones the contributors declared, supplied when the template is deployed. A deploy-time secret is a top-level `securestring` parameter, supplied with `--parameters` or a parameters file you write, which is also where a static Key Vault reference goes.

```bash
# Preview what the template would change.
az deployment group what-if --resource-group <group> --template-file arm-template.json

# Deploy it.
az deployment group create --resource-group <group> --name <name> --template-file arm-template.json

# Or deploy it as a deployment stack that never deletes what it stops managing.
az stack group create --name <stack> --resource-group <group> --template-file arm-template.json \
  --action-on-unmanage detachAll --deny-settings-mode none
```

`--action-on-unmanage detachAll` leaves a resource alone when a later template stops declaring it, and `--deny-settings-mode none` puts no deny assignment on what the stack manages; choose other values where the stack should enforce more. The provider decides none of this — the commands are the operator's.

## What `arm` does not do

- **An edge between two `arm` boundaries halts as a dangling reference.** A `uses` edge whose producer and consumer assemble into different templates does not reach the consumer: the consumer's expression names a symbolic name its own template does not declare, and the build halts naming the contributor, the JSON pointer and the symbol. Keep the two components in one boundary, or in boundaries that resolve to one output directory, so that they assemble into one template.
- **Subscription and management-group content halts.** A fragment whose `$schema` declares subscription or management-group scope is refused naming the scope: the provider assembles a boundary at resource-group scope only. A tenant-scope `$schema` is refused too. Write the resources of a boundary in a resource-group template.
- **It never signs in to Azure or runs ARM.** No build contacts Azure; every value ARM resolves at deploy time stays an expression.
- **It does not generate a secret.** See [the credential model](../../architecture/08-credential-model.md): on `arm`, the generating Features halt the build, and a supplied secret travels as a `securestring` parameter or a Key Vault reference.
