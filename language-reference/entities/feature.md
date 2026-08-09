# Feature

The conceptual role of the Feature entity (the modular operational trait in Domain 2) lives in [architecture/04-entity-taxonomy.md](../../architecture/04-entity-taxonomy.md). The Credential Feature partition (operational Features vs. credential Features labeled `feature.aggrega.ai/kind: secret`) is described in [architecture/08-credential-model.md](../../architecture/08-credential-model.md). The semantic-label vocabulary used by Feature selectors lives in [entities/component](component.md). This page covers the Feature catalog authoring surface.

## Catalog Location

Unlike Components (which use three-segment URIs with category subdirectories), Features are organized flat — only ~25 files in the standard library, growing slowly.

```text
aggrega-catalog/
└── feature/
    └── {publisher}/               # e.g., `core`, `acme`
        ├── secret-value.yaml      # feature.aggrega.ai/kind: secret (credential Feature)
        ├── data-masking.yaml
        ├── k8s-dns-resolver.yaml
        ├── env-override.yaml
        ├── ingress.yaml
        └── ...
```

OCI URI: `hub.aggrega.ai/feature/{publisher}/{feature-name}:{version}` (e.g., `hub.aggrega.ai/feature/core/data-masking:1.0.0`).

## Authoring Contract

Features declare:

* `metadata.labels`: Use `feature.aggrega.ai/kind: secret` to mark a Feature as a credential Feature. The label selects the pipeline the attachment routes through, not the block it is authored in: a credential Feature and an ordinary Feature are attached the same way, on the same attachment surface, at any scope. The standard library's credential family splits by *result*: **`core/secret-value`** delivers a value into the inject pipe; **`core/referenced-secret`** materializes a referenceable secret resource (a Kubernetes Secret, an AWS Secrets Manager secret, a Vault entry) and declares a `schema.provides` output contract — `name` (the resource's provider-neutral locator) and `key` (the data field within it) — that a consumer reads as `.features.<slot>.provides.<key>` to reference the resource without re-deriving its name; **`core/referenced-secret-set`** materializes one resource carrying a caller-supplied set of data keys and publishes the locator alone, for a consumer whose target already knows the key names it reads; **`core/secret-provided`** exposes a pre-existing secret's value; **`core/generated-secret`** produces nothing, because the target engine generates and manages the credential itself, so it declares neither `values` nor `provides` and its FeatureRecipes are pure wiring that render no bytes. Two axes separate the members: who supplies the material — the deployment authors it or names where to fetch it, or the target engine owns it outright, as with `core/generated-secret` — and what the attachment yields, an injected value or a referenceable resource or nothing rendered at all. Every member is a peer of the others on the same attachment surface, so a credential slot is always bound and what varies between deployments is what binds it. A credential Feature that declares a `schema.provides` contract obliges every FeatureRecipe implementing it to publish those keys — the build halts otherwise — and a `featuresSchema` slot's `selector` targets the family member it needs.
* `usesSchema` (optional): Declares the topological sockets the Feature can consume (e.g., a credential Feature's `path` / `key` socket targeting a vault). See [architecture/13-catalog-and-registry.md §2](../../architecture/13-catalog-and-registry.md) for the Split Schema mechanism.
* `schema`: Validates the Feature's `values` block (the cognitive intent the Developer configures on each Feature attachment in the Aggregate — values are the Developer's domain; the Release schema bans `values:` on Feature attachments). Accepts JSON Schema 2020-12 expressed in the compact-form YAML shorthand (the default; see [`vocabulary/compact-form-authoring.md`](../vocabulary/compact-form-authoring.md)) or in full JSON Schema YAML, with cross-document `$ref:` to SchemaLibrary entries for shared shapes (see [`vocabulary/cross-document-ref.md`](../vocabulary/cross-document-ref.md)). A leaf that carries secret material declares `sensitive: true` — the credential Features in the standard library mark the leaf holding the material and deliberately leave their published locators unmarked, since a resource name and a data key are both public. The keyword, and the ceiling on what declaring it achieves, are at [`vocabulary/compact-form-authoring.md`](../vocabulary/compact-form-authoring.md) "Declaring a leaf sensitive".
* `featuresSchema` (optional): Declares the attachment slots the Feature needs for its own operation — a Feature declares slots exactly as a Component does, so a Feature that itself needs a credential (a Datadog sidecar Feature's API key, for example) names the binding point rather than reaching for the host Component's slots. See [architecture/08-credential-model.md §8](../../architecture/08-credential-model.md) for the Feature-owned secrets pattern. Each slot accepts the same fields a Component's `featuresSchema` slot does, with the same semantics — including an optional `selector` (a Kubernetes-style label selector constraining which Feature may fill the slot, the slot analog of a `usesSchema` socket selector; a fill whose labels do not satisfy it halts, and the selector is evaluated against the attached Feature's labels and nothing else), an optional `sensitive` (declaring that whatever binds the slot handles secret material — a statement about the binding point rather than about any particular fill), and the same openness: declaring a slot never forbids an attachment under a name no slot declares. The full field table, the slot-level sensitivity declaration and how it differs from a schema leaf's, and the two deployment shapes one slot-declaring entity serves are all in [entities/component.md "Attachment Slots"](component.md).
* `appliesTo` / `appliesToAnyOf`: Label selectors controlling which Components the Feature can attach to. Evaluated by the compiler's native label-matching engine during the static analysis stage. See [Label-Based Attachment](#label-based-attachment) below and [architecture/13-catalog-and-registry.md §2 "Kubernetes-Style Selectors"](../../architecture/13-catalog-and-registry.md) for the selector syntax reference.
* `interoperability` (optional): A nested block grouping operational safety mechanisms — `conflictsWith` (array of Feature type URIs that cannot attach to the same component simultaneously) and `componentRefPath` (JSONPath telling the renderer where to inject the resolved target component's name). See [The `interoperability` Block](#the-interoperability-block) below for the full teaching.

The structural rendering of a Feature is bound to its corresponding [FeatureRecipe](featurerecipe.md), which maps the Feature interface to a concrete infrastructure implementation.

## Label-Based Attachment

The two applies-selectors on the Feature schema control which Components the Feature attaches to, evaluated by the compiler's native label-matching engine during the static analysis stage:

* **`appliesTo`** — a Kubernetes-style label-selector string; the AND-composition surface. Comma-separated requirements all must hold, with the full operator vocabulary: `key=value`, `key!=value`, `key in (v1, v2)`, `key notin (v1, v2)`, bare `key` (label present), `!key` (label absent). A Feature declaring `appliesTo: "datastore.aggrega.ai/engine=vector"` attaches only to Components labeled with that exact key-value pair; `appliesTo: "component.aggrega.ai/type in (server, worker), compliance.aggrega.ai/data-class notin (restricted)"` expresses "any server or worker that does not hold restricted data" in a single selector string.
* **`appliesToAnyOf`** — the OR-composition surface. A list of selector items where any single item matching is sufficient. Each item is either a string-form selector (same grammar as `appliesTo`; requirements inside the string AND together) or a flat key-value map for equality-only matching. Used when a Feature fits multiple unrelated component shapes — for example, an observability Feature that applies to either `{ component.aggrega.ai/type: worker }` OR `{ component.aggrega.ai/type: task }` without forcing the two into a single selector string.

Without the any-of form, Architects would need to duplicate the same Feature YAML for every unrelated component shape the Feature fits. The two forms compose: a Feature may declare both, and the results AND across the forms — the `appliesTo` string must hold and at least one `appliesToAnyOf` item must match. An omitted or empty selector declares no constraint and matches every label set.

See [architecture/13-catalog-and-registry.md §2 "Kubernetes-Style Selectors"](../../architecture/13-catalog-and-registry.md) for the selector-syntax reference — the grammar a Feature selector accepts is the same grammar `usesSchema` socket selectors accept, the string form Kubernetes users know from `kubectl get -l`.

## The `interoperability` Block

The Feature schema declares an optional `spec.interoperability` block that groups two operational safety mechanisms — one controlling how the Feature can coexist with others on the same component, and one instructing the renderer where the Feature's resolved artifacts land in the generated output.

**`interoperability.conflictsWith`** — an array of Feature type URIs mutually exclusive with the Feature being defined. If a developer attaches two Features to the same component and one Feature's `conflictsWith` array references the other's type, a custom `linter.wasm` plugin detects the intersection and halts the build before rendering physical artifacts. This prevents generating incompatible configurations — e.g., attaching both a TCP-only mesh and an HTTP-aware proxy to the same component.

**`interoperability.componentRefPath`** — a deterministic JSONPath / YAMLPath string that tells the provider engine exactly where to inject the resolved physical target ID of the component during Late Binding. Because Aggrega compiles ahead of time, a FeatureRecipe's Wasm plugin executes before the final Helm chart is fully rendered, so the plugin does not know the final physical name of the deployment target. `componentRefPath` is the deterministic coordinate the Wasm renderer uses to write that name into the final generated artifact.

**Example:**

```yaml
apiVersion: aggrega.ai/v1alpha1
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
    componentRefPath: "/spec/scaleTargetRef/name"
```

This Feature attaches only to `server`-typed Components, declares incompatibility with another replica-controlling Feature, and instructs the renderer to write the target component's resolved name into the generated artifact at `.spec.scaleTargetRef.name`.

## Inheritance via `extends`

A Feature may declare `spec.extends: <feature-name>` pointing to a base Feature whose authoring surface it inherits. The reference names the base by its `metadata.name`, not by the registry coordinate the Feature publishes under, and takes the same three version forms every catalog reference takes: bare (`core/queue`) for the highest available release, exact (`core/queue:1.0.0`), or a caret range (`core/queue:^1.0.0`). The compiler walks the parent chain at catalog load, validates that the chain is acyclic, then merges parent specs into the child to produce a single resolved Feature. The child's authored fields take precedence on key collision; the parent's `metadata.labels`, `appliesTo` / `appliesToAnyOf` selectors, `interoperability` block, `usesSchema`, `featuresSchema`, and the JSON Schema 2020-12 declarations on `schema` are auto-merged downward.

**What a Feature's `metadata:` inherits.** `labels` and `annotations` merge per key along the chain, base first, with the extending Feature's value winning on a shared key — the same rule Components follow. The rest of `metadata:` does not travel: `name`, `version`, `description`, `maintainers`, `license`, `repository`, `home` and `keywords` are the extending Feature's own, exactly as authored.

```yaml
# Base Feature — generic message queue intent
apiVersion: aggrega.ai/v1alpha1
kind: Feature
metadata:
  name: core/queue
spec:
  appliesTo: "component.aggrega.ai/type=worker"
  schema:
    values:
      qos: { type: string, enum: [at-most-once, at-least-once, exactly-once], required: true }
    infra:
      partition_count: { type: integer, min: 1 }

---
# Child Feature — Kafka-specialized variant
apiVersion: aggrega.ai/v1alpha1
kind: Feature
metadata:
  name: core/kafka-queue
spec:
  extends: core/queue:1.0.0
  schema:
    values:
      compression_codec: { type: string, enum: [none, gzip, snappy, lz4], default: none }
```

The merged `core/kafka-queue` inherits `appliesTo` from the parent, inherits the `values.qos` and `infra.partition_count` properties, and adds `values.compression_codec` on top. A child explicitly declaring `appliesTo` overrides the parent's selector wholesale (label-selector merge is not deep — the child's selector replaces the parent's). A child's `schema.values.qos` overrides the parent's declaration for that property.

**How each part of the attachment surface inherits.** The two selector forms inherit independently of each other, because they compose rather than replace: each form that is present must hold — the `appliesTo` string must match, *and* at least one `appliesToAnyOf` item must match — while a form left absent constrains nothing. So a Feature may take its base's AND-selector while declaring an OR-set of its own. The `interoperability` block inherits field by field — a child that declares only `componentRefPath` still carries the `conflictsWith` list its base declared, while a child that declares its own `conflictsWith` replaces the base's list rather than adding to it. A Feature that declares none of the three attaches exactly where its base attaches.

**Inheritance is schema-merge, not interface-binding.** A Feature `extends:` chain produces one resolved Feature, not a polymorphic family. The base Feature URI from the chain is not what a Manifest binding's `feature:` field references — Manifests bind by the leaf Feature's URI, and the resolved schema includes the inherited properties. The Feature contract a FeatureRecipe `implements:` is similarly the leaf URI; FeatureRecipes do not navigate the inheritance chain.

**Error modes.** Cyclic `extends:` chains and missing parent URIs halt catalog load with explicit error sentinels (`ErrCyclicExtension` / `ErrInheritanceMerge`) naming the offending Feature, the parent reference that failed, and the chain reconstruction. See [errors/fatal-halts.md](../errors/fatal-halts.md) for the per-error message shapes.

For the broader inheritance / interface vocabulary across Components, Features, and credential Features, see [vocabulary/inheritance-and-interface.md](../vocabulary/inheritance-and-interface.md).

## Composability: the Purity Social Contract

The standard-library convention is **one Feature, one internal function** — an observability sidecar is an observability Feature; a network-proxy sidecar is a network-proxy Feature; they do not combine into a single composite with two unrelated concerns. The convention keeps individual Features composable, independently versioned, and independently attachable.

The core Go compiler does not enforce this convention. Feature definitions with mixed concerns are syntactically legal and compile cleanly. Enforcement is opt-in:

* Enterprises authoring internal catalogs may author a custom `linter.wasm` plugin that inspects Feature definitions in CI/CD and warns when a single Feature's `appliesTo` labels span unrelated capability domains.
* The `interoperability.conflictsWith` declaration on paired Features provides runtime composition discipline when two attached Features would otherwise overlap on a component.

Open-source standard-library Features follow the purity convention by authoring discipline; enterprise catalogs are free to deviate when a tightly-coupled composite genuinely fits the deployment model.

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

The Feature's `schema:` validates the Feature's `values:` block. The Component's `schema:` validates the Component's `values:` block. The two are evaluated independently at the static analysis stage; a Feature `values:` shape that does not match the Feature's `schema:` halts the build with an error scoped to the Feature attachment site, not the host Component.

The compiler's template context exposes the Feature's instance state to the bound FeatureRecipe through the `.features.<alias>` field (containing `.type`, `.values`, `.infra` per attachment). Templates inside the FeatureRecipe read the Feature's own `values:` via `.values.<field>` at the FeatureRecipe's own template scope; the host Component's `values:` are not directly visible to the FeatureRecipe's templates unless the Feature explicitly declares a `uses:` socket to the host Component.

This scope separation makes Features composable: an `autoscaler` Feature does not depend on which Component it attaches to; its `schema:` describes the autoscaling intent regardless of host. The host Component's `values:` are the host's concern; the Feature's `values:` are the Feature's concern; the two pillars compose without leaking field names across the boundary.

## Annotation-binding targets

A Feature does not declare annotation bindings itself; the Manifest's `mappings.features.annotations` map carries them. A Feature participates in the binding relationship indirectly as the routing target: each binding names a Feature type via its `feature:` field, and the binding's `maps.infra` and `maps.values` lists declare dotted paths into the named Feature's `spec.schema.infra.<path>` and `spec.schema.values.<path>` properties.

At catalog load, the compiler verifies that every dotted path in a binding's `maps` lists corresponds to a property the target Feature's `spec.schema` actually declares at the named pillar. A binding routing to a path the Feature schema does not declare halts catalog load with a clear OPS_ERROR. Schema authors therefore know that any property they declare under `spec.schema.values.<path>` or `spec.schema.infra.<path>` is reachable as a binding target; conversely, any property a Manifest binding routes through must exist on the target Feature's schema.

When an Aggregate-side or Release-side annotation matches a binding, the compiler synthesizes a Feature attachment whose pillar payloads route the annotation value into the named paths. The synthesized attachment is structurally indistinguishable from an explicit author-declared Feature attachment at the same site; downstream rendering, validation, and the FeatureRecipe template context all consume both shapes uniformly. For the binding shape, the side-vs-pillar partition, and the explicit-attachment-wins discipline, see [entities/manifest.md](manifest.md) §"Annotation-Driven Feature Bindings". For the Aggregate-side cascade rule and authoring example, see [providers/well-known-annotations.md](../providers/well-known-annotations.md) §"Aggregate-side annotation cascade".

## The `assertions:` block

`Feature.spec.assertions:` is an optional Go template body that expresses **architectural invariants of the Feature contract** — cross-field rules over the Feature's `values:` and the attached Component's resolved state. The compiler evaluates the template after schema validation and before the bound FeatureRecipe renders; a failing assertion halts the build with the assertion's specific error message.

```yaml
spec:
  appliesTo: "component.aggrega.ai/type=server"
  assertions: |
    {{- if and (eq .values.mode "active-active") (lt .values.replicas 2) -}}
      {{- fail "mode=active-active requires replicas >= 2" -}}
    {{- end -}}
```

Like Component assertions, Feature assertions express contract-level invariants — properties the Feature attachment must satisfy regardless of which FeatureRecipe implements the rendering. For cross-field rules that depend on the specific implementation (a Wasm plugin requirement, a chart quirk), use the FeatureRecipe's `assertions:` field instead. For the full authoring grammar, template context, and the responsibility split between Feature and FeatureRecipe assertions, see [templates/assertions-block.md](../templates/assertions-block.md).
