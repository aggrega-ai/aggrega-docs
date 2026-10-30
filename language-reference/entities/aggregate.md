# Aggregate

The conceptual role of the Aggregate entity (Domain 1 — the Developer's declarative topology blueprint) lives in [architecture/04-entity-taxonomy.md](../../architecture/04-entity-taxonomy.md). The composition patterns (subsystems, nested aggregates, Zero-Port Convention, Parameter Hoisting) live in [architecture/06-data-taxonomy-and-composition.md](../../architecture/06-data-taxonomy-and-composition.md). This page covers the Aggregate catalog authoring surface — specifically, authoring reusable Aggregate modules for catalog distribution.

## Component scope: the default subsystem

An Aggregate organizes components into **subsystems** — named groupings for cross-cutting concerns (a data tier, an edge tier) that carry their own annotation cascade. Most Aggregates have a single grouping, so it needs no ceremony.

**Single scope (the default).** Author components directly under `spec.components:` and omit the `subsystems:` block:

```yaml
spec:
  components:
    api:
      type: core/server:1.0.0
    worker:
      type: core/worker:1.0.0
```

The compiler folds these into a synthesized `default` subsystem. Node identity is unchanged — `api` stays `api`, never `default.api` — so an Aggregate authored this way is interchangeable with the explicit single-subsystem form, and addressing it (in `uses:` targets, in diagnostics) uses the bare `spec.components[…]` path. The synthesized scope is recorded honestly in the exported IR (carrying a synthesized-subsystem marker), but it never appears in the paths an author writes or reads.

**Multiple scopes.** When components fall into distinct cross-cutting groups, declare named subsystems under `subsystems:`. Each subsystem carries its own components and annotation cascade, and may nest further subsystems.

**Mutual exclusivity.** `spec.components:` and `spec.subsystems:` are mutually exclusive at the Aggregate root — author one or the other, never both. A document declaring both halts at load with an envelope error. (A subsystem a developer explicitly names `default` is an ordinary declared subsystem, addressed at its qualified `spec.subsystems.default.components[…]` path — the synthesized-scope elision keys on provenance, not on the name.)

## Reusable Aggregate Modules

Aggregates serve as both the root Aggregate a Release builds and reusable modules. A parent Aggregate can declare a child Aggregate exactly like a component, passing `parameters` down into it. To prevent tight coupling, child Aggregates expose an **`exportedComponents:`** contract, establishing a stable public interface name. The parent reaches the module's components only through this interface: a `uses:` target is the module's name, a dot and one of its exported aliases, and the compiler wires the edge to the internal component the alias names. A target that reaches into a module by any other name — the component's name inside the module, or a path into a module nested inside it — halts the build, naming the module and the aliases it exports; see [A `uses` target names a module's component the module does not export](../errors/fatal-halts.md#a-uses-target-names-a-modules-component-the-module-does-not-export).

**Why an explicit `exportedComponents:` list.** A module's authors decide which of its components form the public interface and which remain implementation detail. Because a parent can name only what the list publishes, the module's internals can be refactored — a component renamed, one component split into two, a worker swapped for a managed service — without breaking any parent, as long as each published name still points at a component. The list costs one entry per published component, and a component may be published under its own name (`store: store`) where that is the name importers should use. The same rule holds inside a composition: a module reaches a module it imports through that module's exported aliases. A Release may wire two components of one module to each other, since that connection crosses no module's interface.

**Re-exporting a nested module's interface.** An `exportedComponents:` entry may point at a nested sub-aggregate's exported alias rather than at a directly-declared component — a module re-publishing part of a module it imports, under its own interface name and optionally with a new name. A `uses:` edge that targets such a re-exported alias resolves transitively through the chain to the concrete internal node, so a module composes deeper modules into its own public interface without exposing their internal layout, and a consumer never needs to know how deeply the target is nested. The stable-interface discipline holds at every hop: each module re-exports only what it chooses to publish. A re-exported target that resolves to no internal node halts loudly the same way a direct dangling target does, and a re-export chain that closes back on itself is rejected rather than followed indefinitely.

**A module's declarations are checked as the Aggregate's are.** A module's document is read only when the composition that imports it is built, and its declarations are checked from that point, at any depth of nesting. A module component's own `inject:` block is held to its type's `spec.inject` allowlist, and to the rules against claiming one delivery key twice and against reading a key the type does not publish. An attachment written at one of the module's own subsystems may name only a socket its Feature declares, and so may an attachment the Release writes against a component a module contributes. A finding about a module's own declarations names the module and the key inside its document — `.spec.subsystems.<subsystem>.features.<attachment>`, say — so the edit is made in the module, where the declaration sits, rather than in the Aggregate that imports it.

### Catalog Location

A reusable Aggregate module sits under the `aggregate/` kind directory at the path its `metadata.name` spells out, segment for segment, with a version directory at the leaf:

```text
aggrega-catalog/
└── aggregate/
    └── {module-name}/           # the module's metadata.name, segment for segment
        └── {version}/           # the module's metadata.version
            └── aggregate.yaml   # The module definition
```

A module name may carry a leading `{publisher}` segment naming the vendor or author — `core` for the standard library, `acme` for an enterprise — and the published standard-library modules are named that way: `core/agenta` sits at `aggregate/core/agenta/1.0.0/aggregate.yaml`. A name that is a single token sits one level shallower, at `aggregate/{module-name}/{version}/aggregate.yaml`. Both forms are well-formed; the name is what the author writes, and the directory mirrors it. That mirroring is a catalog convention rather than something the compiler checks — a module is found by the name it declares, not by where its file sits.

OCI URI: `hub.aggrega.ai/aggregate/{module-name}:{version}`, lowercased — so a module named `core/agenta` publishes to `hub.aggrega.ai/aggregate/core/agenta:1.0.0`, and one named `db-module` to `hub.aggrega.ai/aggregate/db-module:1.0.0`.

### The Module Pattern

**Child module (`aggregate/child-database-module/1.0.0/aggregate.yaml`, published as `hub.aggrega.ai/aggregate/child-database-module:1.0.0`):**

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: child-database-module
  version: 1.0.0
spec:
  components:
    internal-pg-primary:
      type: core/postgres:1.0.0
      
  exportedComponents:
    # The Public Contract (Written once by the module author)
    primary_db: "internal-pg-primary" 
```

**Parent Aggregate:**

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: parent-app
  version: 1.0.0
spec:
  aggregates:
    finance-db-subsystem:
      type: child-database-module:1.0.0

  components:
    billing-api:
      type: core/python-worker:1.0.0
      uses:
        databases:
          - finance-db-subsystem.primary_db
```

### Module Labels

When an Aggregate is published to the catalog as a reusable module, it may carry `metadata.labels` on its YAML envelope — for example `aggregate.aggrega.ai/tier: infrastructure` or `aggregate.aggrega.ai/compliance: pci-dss`. These labels describe the **module's identity** and are carried on the module document as published; no command reads them yet. Catalog search does not index Aggregates, and the build graph carries neither a module's labels nor its catalog name, so a governance policy cannot select a module's components by the module they came from.

**The critical distinction.** Aggregate labels describe the *reusable module's identity* in the catalog. They do **not** cascade down to child component nodes. Component labels come exclusively from the `Component` catalog entity in Domain 2. If a developer imports a module labeled `aggregate.aggrega.ai/tier: infrastructure`, the individual components inside that module retain only their own Catalog-defined labels (e.g., `component.aggrega.ai/type: stateful-server`). The Aggregate label is never injected into the IR node's `labels` dictionary.

See [architecture/06-data-taxonomy-and-composition.md §6](../../architecture/06-data-taxonomy-and-composition.md) for the full Composite Aggregates / Module Pattern discussion (including the no-sub-components rule for Components), and for the `subsystems` cross-cutting grouping mechanism. See [vocabulary/data-pillars](../vocabulary/data-pillars.md) for the typed `parameters` contract authoring surface.

## Typed parameter contracts

The Aggregate's `spec.parameters:` block declares the typed contract for the parameters the Release fulfills. Each parameter slot carries a declared `type`, an optional `description`, an optional `default`, optional value-space constraints, and (for object-typed slots) nested structure. The compiler validates each Release-supplied value against the contract during resolution, before parameter interpolation runs.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: web-app
  version: 1.0.0
spec:
  parameters:
    region:
      type: string
      description: Cloud region the deployment targets
      enum: [us-east-1, us-west-2, eu-west-1, ap-northeast-1]
    default_locale:
      type: string
      description: Default UI locale presented to end users
      enum: [en-US, en-GB, fr-FR, ja-JP]
      default: en-US
    enable_debug:
      type: boolean
      description: Toggle verbose request logging
      default: false
    feature_flags:
      type: object
      description: Per-feature enablement map
      valuesType: { type: boolean }
      default: {}
    allowed_hosts:
      type: array
      description: Hostnames the ingress accepts
      items: { type: string, format: hostname }
      min: 1
      default: ["web-app.example.com"]

  components:
    web:
      type: core/web-server:1.0.0
      values:
        default_locale: "{{ .parameters.default_locale }}"
        region: "{{ .parameters.region }}"
        debug: {{ .parameters.enable_debug }}
```

The quoting on each reference is deliberate: it is what decides the type the hoisted value arrives with. See [`templates/parameters-context.md`](../templates/parameters-context.md#quoting-decides-the-hoisted-type).

### Parameter slot vocabulary

The typed `parameters:` block accepts the compact-form vocabulary: `type`, `description`, `default`, `enum`, `min`, `max`, `pattern`, `minLength`, `maxLength`, `format`, `validate` and `validateMessage` (a custom check and the message it reports), `items` (for arrays), `properties` (for objects), `valuesType` (for typed-value maps), and `required: true` (per-slot marker). Three of those keywords take a contract as their value rather than a plain setting — `items`, `valuesType`, and each entry under `properties` — and on a parameter slot that nested contract is written in the same typed form as the slot around it: `valuesType: { type: boolean }`, not `valuesType: boolean`. Before interpolation, the compiler checks the merged parameter map against these declarations directly: a parameter no slot declares is rejected, a slot marked `required: true` that neither the Release fills nor a `default` supplies halts the build, and every supplied value is checked against its slot's declared `type`, its `enum` membership, the `minLength` and `maxLength` bounds, the `pattern` regular expression and the `format` on a string slot, and the `min` and `max` bounds — a numeric slot's value, a string slot's length and an array slot's number of items. Object and array slots recurse: each entry under `properties` and each element against `items` is checked the same way, a `valuesType` contract governs the keys `properties` does not name, and a nested key no declaration names is rejected. See [`vocabulary/compact-form-authoring.md`](../vocabulary/compact-form-authoring.md) for the full keyword vocabulary, including where a `schema:` pillar spells these keywords differently.

The keywords below are also checked on the declaration itself, before any Release value is read, so a slot that could constrain nothing halts the build even when no Release supplies it:

- **Length bounds are zero or more.** A negative `minLength` or `maxLength` on a parameter's own declaration is refused by the Aggregate's schema when the Aggregate loads, naming the parameter and the key. Inside a nested contract — under `items`, `properties` or `valuesType` — a length bound is read as written and is not held to that floor when the Aggregate loads, so write it as zero or more there too: a negative `minLength` imposes nothing, and a negative `maxLength` refuses every value.
- **`min` and `max` must bound something.** On a boolean or object slot the pair bounds nothing, so a `min` or `max` written there is refused when the Aggregate loads, naming the parameter and the key.
- **A pattern must compile.** Every `pattern` is compiled as a regular expression when the parameter contract is read — on the slot itself and inside any nested contract, at any depth — and one that does not compile is refused naming the parameter, the pattern and the reason. The contract is read for every build, pull and Release validation that reaches the Aggregate, whether it is the Release's own Aggregate or a module that Aggregate imports. The value check then matches each supplied value against that same compiled expression.
- **A format must be one the compiler checks.** `format` names one of `email`, `uri`, `hostname`, `ipv4`, `ipv6`, `uuid`, `date-time` and `date`, spelled as JSON Schema spells them. Any other name — a misspelling such as `emial`, or a name JSON Schema does not define such as `password` — is refused when the Aggregate loads, naming the parameter and listing the supported names: on the slot itself by the Aggregate's schema, and inside a nested contract, at any depth, when the parameter contract is read. A supplied string that does not have the named format is then refused naming the parameter, the value and the format. What each name checks is in [`vocabulary/compact-form-authoring.md`](../vocabulary/compact-form-authoring.md#named-formats).

### Object-typed and array-typed parameters

Parameter slots accept any type the compact form supports, including nested objects and arrays of typed elements:

```yaml
spec:
  parameters:
    database_config:
      type: object
      description: Database connection configuration
      properties:
        host: { type: string, required: true }
        port: { type: integer, min: 1, max: 65535, default: 5432 }
        ssl_mode: { type: string, enum: [disable, require, verify-full], default: require }
        pool_size: { type: integer, min: 1, max: 100, default: 10 }

    metric_labels:
      type: array
      description: Custom Prometheus labels to attach to scraped metrics
      items:
        type: object
        properties:
          name: { type: string, required: true }
          value: { type: string, required: true }
```

The Release fulfills object-typed parameters with structured YAML; the compiler validates the structure against the declared schema before interpolation. Templates referencing the object's fields use the standard Go template syntax: `{{ .parameters.database_config.host }}`, `{{ .parameters.database_config.port }}`, etc.

### Parameter contract validation

The contract itself is checked first, when it is read — the length-bound and pattern checks under "Parameter slot vocabulary" above. The compiler then runs three sub-steps during parameter processing:

1. **Default fill** — slots with `default:` defined and no Release-supplied value receive their default. Nested-object parameters carry a three-case authoring semantic for omitted, explicit-empty, and partially-authored parent slots: omitting the parent fills the children's defaults, authoring the parent as `{}` preserves the explicit empty (suppresses children's defaults), and authoring the parent as a non-empty map fills only the children the Release did not supply. See [`templates/parameters-context.md`](../templates/parameters-context.md#nested-object-parameters) for the YAML examples and the "when to use each form" decision guide.
2. **Contract validation** — each value in the merged map, whether the Release supplied it or a `default:` filled it, validates against the declared `type` / `enum` / `min` / `max` / `pattern` / nested-structure constraints. Validation failures halt the build with a clear error naming the offending slot, the supplied value, and the violated constraint. Missing required parameters with no `default:` produce a similar halt with the slot name.
3. **Interpolation** — the compiler evaluates the Aggregate's whole text as a template, before reading it as YAML, and replaces every `{{ .parameters.<slot> }}` reference — typically inside component / feature / sub-aggregate `values:` strings — with the resolved value; any other `{{` in the text is read as template syntax too, so a value carrying double braces of its own — a flow platform's exported definition, say — writes each `{{` as `{{"{{"}}`, as [Text that carries its own double braces](../templates/parameters-context.md#text-that-carries-its-own-double-braces) describes. After this pass, value-template surfaces consume already-interpolated literals and do not receive `.parameters` in their template context.

The merged parameter map remains alive through rendering to support **path-template** evaluation. Operator-authored `directory:` and `subDirectory:` templates on Release boundaries read `.parameters.<slot>` directly at render time against a closed allowlist; path emission needs region / environment vocabulary for per-environment artifact layout, and the asymmetric grant keeps that operator concern inside the operator surface without round-tripping through the Aggregate's `values`. The map stays readable until every render phase has completed and is reachable only from the compilation it was resolved for; recipes consuming developer-authored `values:` see the post-interpolation strings, while path templates see live `.parameters` data through rendering. See [`templates/expansion-matrix.md`](../templates/expansion-matrix.md) row 3 for the path-template availability matrix and [`path-template-variables.md`](../path-template-variables.md) for the path-template variable allowlist.

For the broader parameter-hoisting checklist (Aggregate declaration → values reference → Release fulfilment → Recipe consumption) and the cross-pillar mechanics, see [`vocabulary/data-pillars.md`](../vocabulary/data-pillars.md) §"Parameters" and §"The parameter-hoisting checklist". For the template-context fields exposed during interpolation and the path-template carve-out, see [`templates/parameters-context.md`](../templates/parameters-context.md).

## A `uses` edge is a call the Aggregate declares

A `uses` edge is the Aggregate's statement that one component calls another. The compiler pipes the values the target publishes into the caller and restricts nothing: on its own, an edge neither admits the caller nor refuses anyone else, and a workload that reaches the target's address without an edge reaches it all the same.

Restricting who may call a component, and what it may call, is the operator's decision, made per environment in the Release. Where a Release attaches the standard-library catalog's `core/caller-allowlist` Feature to a component, the build writes a network policy admitting exactly the components whose `uses` edges point at it, that component's own pods and the sources the attachment names. Its outbound counterpart, `core/egress-allowlist`, lets the component it is attached to reach only the components its own `uses` edges point at, its own pods, the cluster's DNS and the address ranges the Release lists. A call the Aggregate does not declare as an edge can then be refused by the cluster at either end, wherever its network plugin enforces network policy. So write an edge for every call your components make, including one that injects no value: an edge that is missing is a call a fenced component may refuse. [model-server-caller-allowlist](../examples/model-server-caller-allowlist/README.md) shows a model server reachable only through the gateway in front of it.

## A connection's own attachments: `features` on a `uses` entry

A connection a component draws in its verbose `uses:` form is an entry of its own, and beside `target`, `inject` and `values` it may carry **attachments**, under `features:`. Each one is keyed by a **slot the socket declares**: the consuming Component lists, in the socket's `featuresSchema`, the slots every connection wired through that socket may fill (see [Topology Sockets](component.md#topology-sockets-usesschema)). This is how one component holds a different credential for each component it reaches — a gateway calling two models with two keys, or an agent presenting a key of its own to a model.

```yaml
spec:
  parameters:
    openai_key_secret: { type: string }
  components:
    router:
      type: core/gateway/litellm         # its `models` socket declares a `credential` slot
      values: { model: gpt }             # the alias it publishes as its model
      uses:
        models:
          gpt:
            target: gpt
            features:
              credential:
                type: core/referenced-secret
                values:
                  origin: "{{ .parameters.openai_key_secret }}"
                  key: api-key
          plain:
            target: plain                # this connection carries no attachment
    gpt:
      type: core/ai-model/openai
      values: { model: gpt-4o-mini }
    plain:
      type: core/ai-model/ollama
      values: { model: llama3.1 }
```

An attachment on a connection carries `type` (required), an optional `description`, and `values` for the Feature. It carries no `uses` and no `inject`: an attachment on a connection does not nest, and how its material reaches the consumer is the consuming component's Recipe's to decide rather than an `inject` block's. A document writing either is refused when it loads, naming the key.

**Only the slots the socket declares.** An attachment under a name the socket's `featuresSchema` does not list halts the build when it loads, naming the connection, the socket, the component and the slots the socket does declare — and, where the name is one edit from one of them, that slot, as the likely intended spelling. A filled slot is then held to the slot's own declaration on each connection: a `selector` the Feature's labels do not satisfy halts at this entry, and a `required` slot left empty on any connection halts naming that connection. A socket that declares no slots admits no attachment on its connections, and neither does an ad-hoc socket — one the Aggregate wires without the Component declaring it — since it declares no slots at all. A component a sub-module contributes is held to the same rule, and the finding points into the sub-module's own document. See [A connection carries an attachment under a name its socket declares no slot for](../errors/fatal-halts.md#a-connection-carries-an-attachment-under-a-name-its-socket-declares-no-slot-for).

**A connection a Feature draws carries none.** An attached Feature's own `uses:` block — on a component or on a subsystem — is written in the same shape but refuses `features:` when the document loads. A credential such a connection needs fills a slot the Feature declares in its own `featuresSchema`, attached beside the Feature; see [A Feature's Own Credential](../examples/04-secrets.md#example-13-a-features-own-credential).

**The name the attachment takes.** Each connection attachment becomes an attachment of the **consuming** component, named `<alias>.<slot>` — the alias the connection is written under, a dot, and the slot: `gpt.credential` above. The dot is the separator reserved for names the compiler composes, which no alias, slot or attachment name in an Aggregate may contain, so the composed name never equals one written on the component's own `features:` block; a Release spelling it on a component or a boundary is refused (see [Per-edge connection configuration](release.md#per-edge-connection-configuration)). It is the name the Manifest's per-instance tier keys the attachment by (see [Flat URI mapping](manifest.md#flat-uri-mapping)), the name diagnostics and the IR graph report it under, and the value the attachment's FeatureRecipe reads as `.attachment_name` (see [Names derived from a connection's attachment](../templates/rendered-resource-names.md#names-derived-from-a-connections-attachment)).

From there it resolves like any attachment: the Manifest binds its Feature type to a FeatureRecipe, its `values` are validated against the Feature's schema — a failure is reported at the connection entry that wrote them — and its FeatureRecipe renders against the attachment's own `values` and `infra`. Two things set it apart from the component's own attachments:

* **It is not in the consuming Recipe's `.features`.** That pillar carries only the attachments written on the component's own block, so a Recipe looking through `.features` for its own attachments by type is never handed a connection's credential. A Recipe reads a connection's attachment from the connection itself, at `.context.uses.<alias>.features.<slot>`, in the shape `.features` carries — its resolved `provides` included (see [A connection's attachments](../templates/template-context-contract.md#a-connections-attachments--contextusesaliasfeatures)).
* **It lands on the consumer alone.** A target's rendered output is the same whatever the connections reaching it carry.

**The graph's copy of the authored block.** The IR graph keeps each component's `uses:` block as authored, and there a connection attachment keeps its `type` and `description` and none of its `values`. The values appear once, on the attachment the consumer carries, where a value the Feature declares sensitive is withheld.

A Release may size an attachment declared here with `infra`, or attach one of its own on a connection it reaches — see [Per-edge connection configuration](release.md#per-edge-connection-configuration).

## Switching a component or module off: `active:`

A component instance and a sub-aggregate module each accept an `active:` toggle deciding whether that entity is part of the compiled topology at all. Omit it and the entity is present; that is the default and the ordinary case.

```yaml
spec:
  parameters:
    enable_cache:
      type: boolean
      default: false
  components:
    api:
      type: core/server:1.0.0
    redis:
      type: core/redis:1.0.0
      active: "{{ .parameters.enable_cache }}"
  aggregates:
    reporting:
      type: my-catalog/reporting-module:1.0.0
      active: false
```

Write a boolean directly, or a template over `.parameters` that resolves to one. The template form is the reason the toggle exists: it lets a Release decide an entity's presence by fulfilling a parameter, so one Aggregate covers environments that differ by which pieces they deploy — without the Release declaring anything the Aggregate did not.

**What a false toggle removes.** The entity is pruned before the graph is built, and the prune cascades: a component takes its own `uses:` edges and its attached Features with it, and a module takes everything it contributed — its components, their edges, their attachments. Nothing the pruned entity brought is rendered. What the prune does *not* reach is a reference to it from somewhere that survived, which is the next paragraph.

**A surviving component that still points at a pruned one halts the build.** If `api` declares a `uses:` edge onto `redis` and `redis` is switched off, the build stops rather than letting the edge vanish, which would leave `api`'s injected values silently empty at deploy time. Decide which of the two belongs in this environment: switch the target back on, gate the consumer behind the same parameter so the pair leaves together, or drop the edge from the consumer's `uses:` block.

**A toggle that is written must resolve to a boolean, and an empty value is not one.** The toggle is read strictly after its template is resolved, and a literal that does not parse as a boolean stops the build instead of defaulting to anything. The case worth watching for is a toggle reading a parameter that has no value: it resolves to nothing, and reading nothing as "present" would deploy the very entity you gated behind that parameter. So writing `active:` with nothing after it is **not** the same as leaving the key out — only a toggle nobody wrote defaults to present. Give the parameter a `default:` in `spec.parameters` so every environment has an answer, or fulfil it in the Release. To make an entity unconditionally present, remove the `active:` key rather than emptying it. The halt is described under "An `active:` toggle does not resolve to true or false" in [the halting-conditions reference](../errors/fatal-halts.md).

**A component switched off stays nameable from a Release.** A Release may still name it in a boundary, and that is deliberate: switching a component off is an authoring act, and the Release that configures it is not expected to be rewritten in the same edit.

## Annotations on subsystems and components

Subsystems and component instances both carry an `annotations:` field. Developer-authored annotations on the Aggregate surface drive the Aggregate-side annotation cascade — a subsystem annotation propagates to every nested subsystem and every contained component, with closer-level overrides at per-key granularity. The Manifest's `mappings.features.annotations` map declares the bindings that translate annotation keys into synthetic Feature attachments at build time. The Aggregate-as-Authoring-Surface invariant restricts these annotations to routing through the binding's `maps.values` paths; a binding declaring only `maps.infra` paths fires from the Release side, not from the Aggregate side.

### Value shapes

Each annotation key takes one of four forms, distinguishing "I'm silent" from "I declare a value" — a scalar or a structured object — from "I opt out":

* **Absent key** — the scope declares no value for this annotation. Nested subsystems and contained components inherit any binding from an ancestor scope.
* **A scalar string** — a single value. The Manifest binding must declare exactly one path total; the scalar routes to that path.
* **A structured object** — a map of subkey to subvalue. Each subkey of the object routes through the Manifest binding's `maps` to the corresponding Feature schema field at the declared pillar.
* **Explicit YAML `null`** — the scope removes any inherited binding for this key from its subtree. Sibling components and sibling subsystems retain their inheritance; only the opting-out scope loses the binding.

```yaml
spec:
  subsystems:
    data:
      annotations:
        feature.myco/db-pool: "shared-pool"   # scalar value — propagates to api and worker
      components:
        api:
          type: core/server:1.0.0
          # inherits feature.myco/db-pool: "shared-pool"
        worker:
          type: core/server:1.0.0
          annotations:
            feature.myco/db-pool: null         # opts out for this component only
        special:
          type: core/server:1.0.0
          annotations:
            feature.myco/db-pool: "vip-pool"   # closer-level override
```

### Structured values for multi-field Features

A Feature with multiple configurable fields invites a structured annotation value: one annotation key carrying values for several Feature schema fields in one declaration. The Aggregate side fires only the subkeys whose binding-map pillar is `values`; subkeys routing to `infra` belong on Release-side annotations.

```yaml
spec:
  subsystems:
    data:
      annotations:
        feature.myco/db-pool:
          db_name: "prod-db"
          read_replicas: 5
      components:
        api:
          type: core/server:1.0.0
          annotations:
            feature.myco/db-pool:
              db_name: "api-override"   # closer-level override at subkey granularity
              # read_replicas not listed → inherits 5 from parent
        analytics:
          type: core/server:1.0.0
          annotations:
            feature.myco/db-pool:
              read_replicas: null       # per-subkey opt-out
```

Structured values cascade with per-subkey deep merge: closer-level subkeys override parent subkeys; an explicit `null` at a subkey suppresses the inherited subkey for that scope while sibling subkeys stand. For the full structured-value teaching — cross-side composition with Release-side infra subkeys, per-subkey type validation, the relaxed-default discipline for schema fields without a declared `type` — see [providers/well-known-annotations.md](../providers/well-known-annotations.md) §"Structured annotation values".

### Per-key independence

Each annotation key inherits, overrides, and opts out independently. A component declaring `annotations.feature.myco/db-pool: null` opts out only of that key; other keys inherited from the enclosing subsystem continue to propagate to that component. Sibling components in the same subsystem retain their own annotation maps independently — one component's opt-out does not affect siblings.

### Top-level component annotations

Top-level components (declared directly under `spec.components` rather than inside a subsystem) carry no inherited cascade. Their `annotations:` field declares values directly on the component scope; expansion synthesizes Feature attachments from each declared annotation that the Manifest carries a matching binding for.

For the Aggregate-side cascade rule applied to bindings, the side-vs-pillar partition, and a worked end-to-end example showing the bindings translating annotations into synthetic Feature attachments, see [providers/well-known-annotations.md](../providers/well-known-annotations.md) §"Aggregate-side annotation cascade".

## YAML anchor patterns (`defs:` block)

The Aggregate schema accepts an optional root-level `defs:` block — a list of YAML strings used purely as a host for standard YAML anchors (`&anchor`) and references (`*anchor`). The block's contents are never read by the compiler; it exists so authors can declare anchor definitions in one place and reference them across the rest of the Aggregate, keeping repeated values DRY without losing the flat O(1) dictionary the compiler iterates. The mechanism mirrors the equivalent `defs:` block on the Manifest entity.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: anchored-app
  version: 1.0.0
defs:
  - &default_log_level "info"
spec:
  components:
    primary:
      type: core/compute/api-server:1.0.0
      values:
        log_level: *default_log_level
    secondary:
      type: core/compute/python:1.0.0
      values:
        log_level: *default_log_level
```

Anchors resolve at YAML-parse time, so `*default_log_level` is the string `"info"` by the time the compiler reads the values block. The `defs:` block is the conventional home for the anchor definitions; YAML allows anchors to be declared anywhere, but co-locating them keeps the rest of the Aggregate readable. The block is optional — Aggregates that do not need anchors omit it entirely.
