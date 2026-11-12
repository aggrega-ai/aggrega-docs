# Feature

The conceptual role of the Feature entity (the modular operational trait in Domain 2) lives in [architecture/04-entity-taxonomy.md](../../architecture/04-entity-taxonomy.md). The distinction between operational Features and credential Features (those labeled `feature.aggrega.ai/kind: secret`) is described in [architecture/08-credential-model.md](../../architecture/08-credential-model.md). The semantic-label vocabulary used by Feature selectors lives in [entities/component](component.md). This page covers the Feature catalog authoring surface.

## Catalog Location

Unlike Components (which use three-segment URIs with category subdirectories), Features are organized flat: one directory per Feature under its publisher, holding one directory per version.

```text
aggrega-catalog/
└── feature/
    └── {publisher}/                 # e.g., `core`, `acme`
        ├── secret-value/
        │   └── 1.0.0/
        │       └── feature.yaml     # feature.aggrega.ai/kind: secret (credential Feature)
        ├── data-masking/
        │   └── 1.0.0/
        │       └── feature.yaml
        └── ...
```

OCI URI: `hub.aggrega.ai/feature/{publisher}/{feature-name}:{version}` (e.g., `hub.aggrega.ai/feature/core/data-masking:1.0.0`).

## Authoring Contract

Features declare:

* `metadata.labels`: Use `feature.aggrega.ai/kind: secret` to mark a Feature as a credential Feature. The label is descriptive metadata for the author, for the catalog site, and for label selectors; no compiler branch reads it, and what an attachment produces is decided by the FeatureRecipe the Manifest maps its type to, not by the label. A credential Feature and an ordinary Feature are attached the same way, on the same attachment surface, at any scope. The standard library's credential family splits by *result*: **`core/secret-value`** delivers a value into the inject pipe; **`core/referenced-secret`** names a referenceable secret resource (a Kubernetes Secret, an AWS Secrets Manager secret, a Vault entry), one its FeatureRecipe's output creates or one that already exists, and declares a `schema.provides` output contract — `name` (the resource's provider-neutral locator) and `key` (the data field within it) — that a consumer reads as `.features.<slot>.provides.<key>` to reference the resource without re-deriving its name; **`core/referenced-secret-set`** materializes one resource carrying a caller-supplied set of data keys and publishes the locator alone, for a consumer whose target already knows the key names it reads; **`core/secret-provided`** exposes a pre-existing secret's value; **`core/generated-secret`** produces nothing, because the target engine generates and manages the credential itself, so it declares neither `values` nor `provides` and its FeatureRecipes are pure wiring that render no bytes. Two axes separate the members: who supplies the material — an author writes it or names where to fetch it, or the target engine owns it outright, as with `core/generated-secret` — and what the attachment yields, an injected value or a referenceable resource or nothing rendered at all. Every member is a peer of the others on the same attachment surface, so a credential slot is always bound and what varies between Releases is what binds it. A credential Feature that declares a `schema.provides` contract obliges every FeatureRecipe implementing it to publish those keys — the build halts otherwise — and a `featuresSchema` slot's `selector` targets the family member it needs.
* `usesSchema` (optional): Declares the topological sockets the Feature can consume (e.g., a credential Feature's `path` / `key` socket targeting a vault). See [architecture/13-catalog-and-registry.md §2](../../architecture/13-catalog-and-registry.md) for the Split Schema mechanism.
* `schema`: Validates the Feature attachment's `values` and `infra` blocks — the cognitive intent the Developer configures on each attachment in the Aggregate (`values` are the Developer's domain, and the Release schema bans `values:` on Feature attachments) and the capacity the Operator decides per environment in the Release (`infra`). A field declaring a `default:` is both validated against and filled into the rendered pillar when nothing authors it; see [Feature scope and authoring shape](#feature-scope-and-authoring-shape). Accepts JSON Schema 2020-12 expressed in the compact-form YAML shorthand (the default; see [`vocabulary/compact-form-authoring.md`](../vocabulary/compact-form-authoring.md)) or in full JSON Schema YAML, with cross-document `$ref:` to SchemaLibrary entries for shared shapes (see [`vocabulary/cross-document-ref.md`](../vocabulary/cross-document-ref.md)). A leaf that carries secret material declares `sensitive: true` — the credential Features in the standard library mark the leaf holding the material and deliberately leave their published locators unmarked, since a resource name and a data key are both public. The keyword, and the ceiling on what declaring it achieves, are at [`vocabulary/compact-form-authoring.md`](../vocabulary/compact-form-authoring.md) "Declaring a leaf sensitive".
* `featuresSchema` (optional): Declares the attachment slots the Feature needs for its own operation — a Feature declares slots exactly as a Component does, so a Feature that itself needs a credential (a Datadog sidecar Feature's API key, for example) names the binding point rather than reaching for the host Component's slots. See [A Feature's Own Credential](../examples/04-secrets.md#a-features-own-credential) for a Feature declaring its own slot and a FeatureRecipe reading what fills it. Each slot accepts the same fields a Component's `featuresSchema` slot does, with the same semantics — including an optional `selector` (a Kubernetes-style label selector constraining which Feature may fill the slot, the slot analog of a `usesSchema` socket selector; a fill whose labels do not satisfy it halts, and the selector is evaluated against the attached Feature's labels and nothing else), an optional `sensitive` (declaring that whatever binds the slot handles secret material — a statement about the binding point rather than about any particular fill), and the same openness: declaring a slot never forbids an attachment under a name no slot declares. The full field table, the slot-level sensitivity declaration and how it differs from a schema leaf's, and the two shapes one slot-declaring entity is deployed in are all in [entities/component.md "Attachment Slots"](component.md).
* `appliesTo` / `appliesToAnyOf`: Label selectors controlling which Components the Feature can attach to. Evaluated by the compiler's native label-matching engine during the static analysis stage. See [Label-Based Attachment](#label-based-attachment) below and [architecture/13-catalog-and-registry.md §2 "Kubernetes-Style Selectors"](../../architecture/13-catalog-and-registry.md) for the selector syntax reference.
* `interoperability` (optional): A nested block carrying `conflictsWith` — the Features this Feature cannot reach a component alongside. The build halts before rendering when one component ends up carrying both, whichever scope each was attached at. See [The `interoperability` Block](#the-interoperability-block) below for the full teaching.

The structural rendering of a Feature is bound to its corresponding [FeatureRecipe](featurerecipe.md), which maps the Feature interface to a concrete infrastructure implementation.

## Label-Based Attachment

The two applies-selectors on the Feature schema control which Components the Feature attaches to, evaluated by the compiler's native label-matching engine during the static analysis stage:

* **`appliesTo`** — a Kubernetes-style label-selector string; the AND-composition surface. Comma-separated requirements all must hold, with the full operator vocabulary: `key=value`, `key!=value`, `key in (v1, v2)`, `key notin (v1, v2)`, bare `key` (label present), `!key` (label absent). A Feature declaring `appliesTo: "datastore.aggrega.ai/engine=vector"` attaches only to Components labeled with that exact key-value pair; `appliesTo: "component.aggrega.ai/type in (server, worker), compliance.aggrega.ai/data-class notin (restricted)"` expresses "any server or worker that does not hold restricted data" in a single selector string.
* **`appliesToAnyOf`** — the OR-composition surface. A list of selector items where any single item matching is sufficient. Each item is either a string-form selector (same grammar as `appliesTo`; requirements inside the string AND together) or a flat key-value map for equality-only matching. Used when a Feature fits multiple unrelated component shapes — for example, an observability Feature that applies to either `{ component.aggrega.ai/type: worker }` OR `{ component.aggrega.ai/type: task }` without forcing the two into a single selector string.

Without the any-of form, Architects would need to duplicate the same Feature YAML for every unrelated component shape the Feature fits. The two forms compose: a Feature may declare both, and the results AND across the forms — the `appliesTo` string must hold and at least one `appliesToAnyOf` item must match. An omitted or empty selector declares no constraint and matches every label set.

A selector string is read against the six forms each time an attachment of the Feature is evaluated, and a requirement outside them stops the build rather than being read as some other selector: an empty requirement (a leading, trailing or doubled comma, or a string of separators alone), a key carrying whitespace or any of `=`, `!`, `(`, `)` and the comma, and an `in (` or `notin (` set that is not closed. That is what catches the mistakes that would otherwise quietly select the opposite of what was meant: `appliesTo: "!tier=frontend"`, written to keep a Feature off frontends, is refused because `!` names a label key and nothing else — `tier!=frontend` is how a value is excluded — and `tier in frontend` is refused in favour of `tier in (frontend)`. A value is the text after its operator, whatever characters it carries, so `tier==frontend` asks for a label whose value is `=frontend`. The halt names the Feature, its selector and the requirement that could not be read. A Feature nothing attaches is never evaluated, so a malformed selector on it is not reported until an attachment names it.

See [architecture/13-catalog-and-registry.md §2 "Kubernetes-Style Selectors"](../../architecture/13-catalog-and-registry.md) for the selector-syntax reference — the grammar a Feature selector accepts is the same grammar `usesSchema` socket selectors accept, the string form Kubernetes users know from `kubectl get -l`.

## The `interoperability` Block

The Feature schema declares an optional `spec.interoperability` block carrying one control: which other Features this Feature can coexist with on a component.

**`interoperability.conflictsWith`** — a list of the Features mutually exclusive with the Feature being defined, each written the way an attachment's `type` names a Feature. It prevents generating incompatible configurations — attaching both a TCP-only mesh and an HTTP-aware proxy to the same component, say.

The build halts before rendering anything when one component ends up carrying this Feature and a Feature its list names. What counts is **reach**: an attachment reaches the component it is written on, and every component inside the subsystem or boundary it is written on, nested boundaries included; an attachment written on a Release component entry, or produced by annotation-driven expansion, reaches its component the same way. So a declared conflict halts when the two Features are attached to the same component, when one is on a boundary and the other on a component inside it, when one is on an outer boundary and the other on a boundary nested inside it that holds a component, and when one is on a subsystem and the other on a component in that subsystem. Two Features attached to sibling boundaries that share no component never meet, and a boundary holding no component reaches nothing — neither halts.

* **One declaration is enough.** The build halts when either Feature's list names the other; the second Feature does not have to list the first back.
* **Names, whatever the versions.** Each entry and each attachment's type are compared with any version removed, so an entry of `core/fixed-replica-controller` matches an attachment of `core/fixed-replica-controller:2.0.0`, and an entry carrying a version matches every version of the Feature it names.
* **Names are all it reads.** The compiler compares the names the Feature's author declared against the Features a component carries — the same kind of evaluation as `appliesTo`, over data the author wrote. Whether two Features are incompatible is the author's judgement, and the list is where it is recorded.

The halt names the Feature whose list names the other, every place each of the two was attached — on the component in the Aggregate, on a subsystem, on a Release boundary with its path, on a Release component entry, or by annotation-driven expansion of a named annotation — and the component where they meet. A pair that meets on several components is reported once for each. See [errors/fatal-halts.md](../errors/fatal-halts.md#two-features-declared-to-conflict-reach-one-component) for the message.

**Example:**

```yaml
apiVersion: aggrega.ai/v1beta1
kind: Feature
metadata:
  name: core/autoscaler
  version: 1.0.0
spec:
  appliesTo: "component.aggrega.ai/type=server"
  schema:
    values:
      metric_target: { type: string, enum: [cpu, memory, custom], required: true }
    infra:
      min_replicas: { type: integer, min: 1, required: true }
      max_replicas: { type: integer, min: 1, required: true }
  interoperability:
    conflictsWith:
      - core/fixed-replica-controller
```

This Feature attaches only to `server`-typed Components and declares incompatibility with another replica-controlling Feature: a build in which any component ends up carrying both halts before rendering. A FeatureRecipe that needs the name of the component it is attached to — to point an autoscaler at its target, for instance — reads it from its template context and writes it wherever its output needs it: `.context.instance_id` is the component's identity, and `.context.rendered_name` is the name the component's own provider gives the resources it renders for it, which is the one to target a resource by — under `helm`, the name of the Deployment a synthesized workload emits, and the release name a chart builds its own names from.

## Inheritance via `extends`

A Feature may declare `spec.extends: <feature-name>` pointing to a base Feature whose authoring surface it inherits. The reference names the base by its `metadata.name`, not by the registry coordinate the Feature publishes under, and takes the same three version forms every catalog reference takes: bare (`core/queue`) for the highest available release, exact (`core/queue:1.0.0`), or a caret range (`core/queue:^1.0.0`). The compiler walks the parent chain at catalog load, validates that the chain is acyclic, then merges parent specs into the child to produce a single resolved Feature. The child's authored fields take precedence on key collision; the parent's `metadata.labels` and `metadata.annotations`, `appliesTo` / `appliesToAnyOf` selectors, `interoperability` block, `usesSchema`, `featuresSchema`, and the JSON Schema 2020-12 declarations on `schema` are auto-merged downward. Every other `metadata` field is the child's verbatim, so identity and provenance never inherit.

**What a Feature's `metadata:` inherits.** `labels` and `annotations` merge per key along the chain, base first, with the extending Feature's value winning on a shared key — the same rule Components follow. The rest of `metadata:` does not travel: `name`, `version`, `description`, `maintainers`, `license`, `repository`, `home` and `keywords` are the extending Feature's own, exactly as authored.

```yaml
# Base Feature — generic message queue intent
apiVersion: aggrega.ai/v1beta1
kind: Feature
metadata:
  name: core/queue
  version: 1.0.0
spec:
  appliesTo: "component.aggrega.ai/type=worker"
  schema:
    values:
      qos: { type: string, enum: [at-most-once, at-least-once, exactly-once], required: true }
    infra:
      partition_count: { type: integer, min: 1 }

---
# Child Feature — Kafka-specialized variant
apiVersion: aggrega.ai/v1beta1
kind: Feature
metadata:
  name: core/kafka-queue
  version: 1.0.0
spec:
  extends: core/queue:1.0.0
  schema:
    values:
      compression_codec: { type: string, enum: [none, gzip, snappy, lz4], default: none }
```

The merged `core/kafka-queue` inherits `appliesTo` from the parent, inherits the `values.qos` and `infra.partition_count` properties, and adds `values.compression_codec` on top. A child explicitly declaring `appliesTo` overrides the parent's selector wholesale (label-selector merge is not deep — the child's selector replaces the parent's). A child's `schema.values.qos` overrides the parent's declaration for that property.

**How each part of the attachment surface inherits.** The two selector forms inherit independently of each other, because they compose rather than replace: each form that is present must hold — the `appliesTo` string must match, *and* at least one `appliesToAnyOf` item must match — while a form left absent constrains nothing. So a Feature may take its base's AND-selector while declaring an OR-set of its own. The `interoperability` block inherits field by field — a child that declares the block without a `conflictsWith` list still carries the list its base declared, while a child that declares its own `conflictsWith` replaces the base's list rather than adding to it. A Feature that declares none of the three attaches exactly where its base attaches.

**Inheritance is schema-merge, not interface-binding.** A Feature `extends:` chain produces one resolved Feature, not a polymorphic family. The base Feature URI from the chain is not what a Manifest binding's `feature:` field references — Manifests bind by the leaf Feature's URI, and the resolved schema includes the inherited properties. The Feature contract a FeatureRecipe `implements:` is similarly the leaf URI; FeatureRecipes do not navigate the inheritance chain.

**`aggrega pull` fetches the base.** A base Feature is a dependency of every Release that attaches a Feature extending it, whether or not anything else names it. [`aggrega pull`](../cli/aggrega-pull.md) follows each `extends:` to the end of the chain, fetches a base no catalog directory holds from the registry, and records every base in the Release's lockfile, referenced from the `spec.extends` of the Feature that names it; a build reads the base from there.

**Error modes.** A cyclic `extends:` chain, and a parent no catalog entity provides, halt the build, naming the Feature the resolution started from, the Feature whose `extends:` line to open, and the reference it declares. The messages are at [Cyclic extends on Components or Features](../errors/fatal-halts.md#cyclic-extends-on-components-or-features) and [An `extends:` chain cannot be assembled](../errors/fatal-halts.md#an-extends-chain-cannot-be-assembled).

For the broader inheritance / interface vocabulary across Components, Features, and credential Features, see [vocabulary/inheritance-and-interface.md](../vocabulary/inheritance-and-interface.md).

## Composability: the Purity Social Contract

The standard-library convention is **one Feature, one internal function** — an observability sidecar is an observability Feature; a network-proxy sidecar is a network-proxy Feature; they do not combine into a single composite with two unrelated concerns. The convention keeps individual Features composable, independently versioned, and independently attachable.

The core Go compiler does not enforce this convention. Feature definitions with mixed concerns are syntactically legal and compile cleanly. Enforcement is opt-in:

* Enterprises authoring internal catalogs may author a custom linter plugin that inspects Feature definitions in CI/CD and warns when a single Feature's `appliesTo` labels span unrelated capability domains.
* A Feature author who records, in `interoperability.conflictsWith`, that two Features would overlap opts into a build-time check: the compiler halts wherever the two reach one component. It compares the declared names and nothing more, so it enforces the declaration an author wrote rather than the purity convention itself.

Open-source standard-library Features follow the purity convention by authoring discipline; enterprise catalogs are free to deviate when a tightly-coupled composite genuinely fits the deployment model.

## What earns a Feature, and where a product's own dial belongs

A Feature is an **attachment**: it brings something the developer or the operator attaches deliberately — resources, a pipeline step, wiring — and the standard-library convention is that it be honourable by **at least two independent products**. That second half is the test to apply before authoring one, because portability is what the word *attachment* promises. An attachment says the capability travels: attach it to one component, attach it to another, and each product's realization honours it in its own terms.

**A capability that only one product in the field has is that product's own dial rather than a Feature.** It belongs as an authored value on that product's own surface, which the author who decides it sets in that author's pillar and reads beside everything else that configures the same product. Publishing it as a Feature instead offers portability no other product can deliver: the attachment names one product by construction, so an author who attaches it to the next product they reach for meets a build that halts naming the type, and the Feature has taught a capability it never had.

The test counts products in **the field**, not components in this catalog, each read from its own current configuration reference. Two independent products implementing a capability make it portable however many of them are shipped here, so a Feature can be declared before anything in the catalog realizes it — attaching it then halts the build naming the type — and each realization that is shipped is a FeatureRecipe for one product, honouring the attachment in whatever way that product configures it.

**Upstream certificate pinning is the worked case.** A pin is a control over which key an upstream may present: accept only a certificate whose public key matches one the Release supplies. That is a different assertion from requiring an upstream's certificate to chain to a trust anchor the Release supplies, and different again from asserting what a certificate's subject says — both of those state what a certificate must *say*, while a pin states which key it must *be*. Several gateways here can verify against an anchor, which is why `dataplane.aggrega.ai/upstream-tls: trust-anchor` is a value a selector can match. Pinning is a separate capability, and at least two independent products implement it for the connections they open to an upstream: Tyk takes the upstream's public key in PEM form, and Envoy takes a hash of it. So it is a Feature, `core/upstream-key-pinning`, whose selector names `dataplane.aggrega.ai/upstream-pinning: public-key`, and what this catalog realizes is answered product by product: `core/gateway/tyk` carries the value and a FeatureRecipe for each of its targets, while the gateways here that embed Envoy expose its pin setting only for the certificates clients present, or not at all, so they carry no value and an attachment to them halts at the selector. A pin narrows what an upstream may present; it is a control, not an assurance that the connection is otherwise sound.

Two bounds on the test, and the second is the half most easily dropped:

* **It is authoring discipline, not a compiler check.** A Feature declaring options no product implements passes schema validation, the publishing linter and a render alike — the compiler does not interpret what a Feature promises. The judgement stays with the catalog author.
* **One product's inability to honour an option is not grounds to drop that option.** Where two or more products ship a capability under names that group, the capability is portable and the Feature keeps it; the product that cannot honour it declines it. A Feature shrunk to what every product supports has almost nothing left to say.

## Feature scope and authoring shape

A Feature's `spec.schema` defines the **Feature's own** `values:` and `infra:` shapes — the cognitive intent the Developer configures per Feature attachment in the Aggregate (`values`), distinct from the capacity numbers the Operator decides per environment (`infra`). The Feature's pillars live in their own namespaces and are validated independently from the host Component's pillars. When the Developer attaches an `autoscaler` Feature to a `web-server` Component in the Aggregate, the Aggregate carries the Component's `values:` (host shape) plus the Feature's `values:` (the scaling-intent shape — which metric drives scaling); the operator-facing capacity numbers (`min_replicas` / `max_replicas`) flow through the Release's `infra:` block on the Feature attachment.

```yaml
# Aggregate fragment — Feature attachment with its own values:
components:
  web-server:
    type: core/web-server
    values:
      log_level: "info"     # the Component's own values
      tls_enabled: true
    features:
      autoscaler:
        type: core/autoscaler
        values:
          metric_target: "cpu"   # the Feature's own values (dev intent: scale on CPU)
```

```yaml
# Release fragment — Feature attachment's infra block (operator-side capacity):
boundaries:
  prod:
    components:
      web-server:
        features:
          autoscaler:
            infra:
              min_replicas: 2
              max_replicas: 10
```

The Feature's `schema:` validates the Feature attachment's own `values:` and `infra:` blocks. The Component's `schema:` validates the Component's own. The two are evaluated independently at the static analysis stage; an attachment pillar that does not match the Feature's `schema:` halts the build with an error scoped to the Feature attachment site, not the host Component. What is validated is the attachment's **effective** configuration — the result of composing every scope that configured it — so a value made conformant at one scope and then overridden to something illegal at a narrower one is caught.

**Declared defaults materialize into the attachment's rendered pillars.** Beyond validation, a `default:` declared on a Feature's `values` or `infra` field is filled into that attachment's rendered pillar at build time for every key nothing authored — so a FeatureRecipe template reading `{{ .infra.tier }}` receives the schema-declared value rather than an empty one. Author-supplied values always win, and a default fills only the keys they omit: an attachment that authors one key of the Feature's schema still receives the declared defaults for that schema's other keys, and a partially-authored nested object keeps what was written and gains the siblings that were not.

Three properties of the fill are worth knowing when authoring:

* **A default never displaces a value any scope supplied.** Where a Feature is attached at more than one scope — a Release boundary and one of its components, say — the narrower scope's value stands and the default fills only what no scope wrote at all.
* **A default fills an attachment; it never creates one.** Declaring defaults on a Feature nothing attaches contributes nothing to the output, so a Feature's schema cannot add configuration no author asked for.
* **An attachment declared on a Release boundary rather than on a single component fills `infra` only**, because that surface carries no `values:` block to fill.

Because materialization uses the same schema resolution as validation, a default declared on a parent Feature reaches an `extends:` child's attachments, and defaults reached through a cross-document `$ref:` into a SchemaLibrary materialize too. Defaults declared only inside a local in-document `#/$defs/` reference, or under an `allOf` / `oneOf` / `anyOf` branch, are not materialized.

One consequence is worth stating plainly, because validation alone will not reveal it: a `required:` field that also carries a `default:` is satisfied by that default, so omitting it is legal — and the value the check accepted on is the value the rendered output carries.

The compiler's template context exposes the Feature's instance state to the bound FeatureRecipe through the `.features.<alias>` field (containing `.type`, `.resolved_version`, `.labels`, `.values`, `.infra` and `.provides` per attachment). Templates inside the FeatureRecipe read the Feature's own `values:` via `.values.<field>` at the FeatureRecipe's own template scope; the host Component's `values:` are not directly visible to the FeatureRecipe's templates unless the Feature explicitly declares a `uses:` socket to the host Component.

This scope separation makes Features composable: an `autoscaler` Feature does not depend on which Component it attaches to; its `schema:` describes the autoscaling intent regardless of host. The host Component's `values:` are the host's concern; the Feature's `values:` are the Feature's concern; the two pillars compose without leaking field names across the boundary.

## Annotation-binding targets

A Feature does not declare annotation bindings itself; the Manifest's `mappings.features.annotations` map carries them. A Feature participates in the binding relationship indirectly as the routing target: each binding names a Feature type via its `feature:` field, and the binding's `maps.infra` and `maps.values` lists declare dotted paths into the named Feature's `spec.schema.infra.<path>` and `spec.schema.values.<path>` properties.

At catalog load, the compiler verifies that every dotted path in a binding's `maps` lists corresponds to a property the target Feature's `spec.schema` actually declares at the named pillar. A binding routing to a path the Feature schema does not declare halts catalog load with a clear OPS_ERROR, naming the binding, the target Feature, and the pillar and path it routed through — the binding is written in the Manifest, which is the operator's document. Schema authors therefore know that any property they declare under `spec.schema.values.<path>` or `spec.schema.infra.<path>` is reachable as a binding target; conversely, any property a Manifest binding routes through must exist on the target Feature's schema.

When an Aggregate-side or Release-side annotation matches a binding, the compiler synthesizes a Feature attachment whose pillar payloads route the annotation value into the named paths. The synthesized attachment is structurally indistinguishable from an explicit author-declared Feature attachment at the same site; downstream rendering, validation, and the FeatureRecipe template context all consume both shapes uniformly. For the binding shape, the side-vs-pillar partition, and the explicit-attachment-wins discipline, see [entities/manifest.md](manifest.md) §"Annotation-Driven Feature Bindings". For the Aggregate-side cascade rule and authoring example, see [providers/well-known-annotations.md](../providers/well-known-annotations.md) §"Aggregate-side annotation cascade".

## The `assertions:` block

`Feature.spec.assertions:` is an optional map of **named** rules expressing **architectural invariants of the Feature contract** — cross-field rules over the Feature's `values:` and the attached Component's resolved state. Each key is a rule identifier that appears in the failure message; each value is a Go template body. The compiler evaluates them after schema validation and before the bound FeatureRecipe renders, in the order they are written, and the first failing rule halts the build with that rule's own error message.

```yaml
spec:
  appliesTo: "component.aggrega.ai/type=server"
  assertions:
    active-active-needs-two-replicas: |
      {{- if and (eq .values.mode "active-active") (lt .values.replicas 2) -}}
        {{- fail "mode=active-active requires replicas >= 2" -}}
      {{- end -}}
```

Like Component assertions, Feature assertions express contract-level invariants — properties the Feature attachment must satisfy regardless of which FeatureRecipe implements the rendering. For cross-field rules that depend on the specific implementation (a Wasm plugin requirement, a chart quirk), use the FeatureRecipe's `assertions:` field instead. For the full authoring grammar, template context, and the responsibility split between Feature and FeatureRecipe assertions, see [templates/assertions-block.md](../templates/assertions-block.md).
