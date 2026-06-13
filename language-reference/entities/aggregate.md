# Aggregate

The conceptual role of the Aggregate entity (Domain 1 — the Developer's declarative topology blueprint) lives in [architecture/04-eight-entity-taxonomy.md](../../architecture/04-eight-entity-taxonomy.md). The composition patterns (subsystems, nested aggregates, Zero-Port Convention, Parameter Hoisting) live in [architecture/06-data-taxonomy-and-composition.md](../../architecture/06-data-taxonomy-and-composition.md). This page covers the Aggregate catalog authoring surface — specifically, authoring reusable Aggregate modules for catalog distribution.

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

**Multiple scopes (Level 2).** When components fall into distinct cross-cutting groups, declare named subsystems under `subsystems:`. Each subsystem carries its own components and annotation cascade, and may nest further subsystems.

**Mutual exclusivity.** `spec.components:` and `spec.subsystems:` are mutually exclusive at the Aggregate root — author one or the other, never both. A document declaring both halts at load with an envelope error. (A subsystem a developer explicitly names `default` is an ordinary declared subsystem, addressed at its qualified `spec.subsystems.default.components[…]` path — the synthesized-scope elision keys on provenance, not on the name.)

## Reusable Aggregate Modules

Aggregates serve as both the root application and reusable modules. A parent Aggregate can declare a child Aggregate exactly like a component, passing `parameters` down into it. To prevent tight coupling, child Aggregates expose an **`exportedComponents:`** contract, establishing a stable public interface name. The parent requests this interface, and the Go compiler dynamically rewires the topological edge to the correct internal node.

**Why explicit `exportedComponents:` rather than default-export.** The explicit contract is the discipline target: a child Aggregate's authors decide which internal nodes are part of the public interface and which remain implementation detail. Default-export-everything (where the parent reaches every internal component by name) would couple the parent to the child's internal layout, so refactoring the child's internals — renaming a node, splitting one component into two, swapping a worker for a managed service — would silently break parent code that named the now-absent node. The explicit listing carries an authoring cost (one declaration per exported node) and a maintenance benefit (internal refactors are non-breaking by default unless they touch the published interface). There is no shorthand or "expose all" convention; the explicit declaration is the architectural commitment.

### Catalog Location

Reusable Aggregate modules live in the catalog under:

```text
aggrega-catalog/
└── aggregate/
    └── {namespace}/             # e.g., `core`, `acme`
        └── {module-name}/
            └── aggregate.yaml   # The module definition
```

OCI URI: `hub.aggrega.ai/aggregate/{namespace}/{module-name}:{version}` (e.g., `hub.aggrega.ai/aggregate/core/db-module:1.0.0`).

### The Module Pattern

**Child module (`aggregate/core/db-module/aggregate.yaml`):**

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

**Parent application:**

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: parent-app
  version: 1.0.0
spec:
  aggregates:
    finance-db-subsystem:
      type: my-catalog/child-database-module:1.0.0

  components:
    billing-api:
      type: core/python-worker:1.0.0
      uses:
        databases:
          - finance-db-subsystem.primary_db
```

### Module Labels

When an Aggregate is published to the catalog as a reusable module, it may carry `metadata.labels` on its YAML envelope. These labels describe the **module's identity** for two specific consumers:

* **Catalog discovery and Studio filtering.** Labels like `aggregate.aggrega.ai/tier: infrastructure` or `aggregate.aggrega.ai/compliance: pci-dss` allow the Studio, the IDE, and the CLI to filter and search reusable modules by semantic category.
* **Policy evaluation.** The `policy-validator.wasm` socket receives the full IR graph. If a parent imports a sub-aggregate labeled `aggregate.aggrega.ai/compliance: pci-dss`, the policy can enforce that all components from that module land in a PCI-compliant boundary, targeting the module's catalog identity rather than fragile name-string matching.

**The critical distinction.** Aggregate labels describe the *reusable module's identity* in the catalog. They do **not** cascade down to child component nodes. Component labels come exclusively from the `Component` catalog entity in Domain 2. If a developer imports a module labeled `aggregate.aggrega.ai/tier: infrastructure`, the individual components inside that module retain only their own Catalog-defined labels (e.g., `component.aggrega.ai/type: stateful-server`). The Aggregate label is never injected into the IR node's `labels` dictionary.

See [architecture/06-data-taxonomy-and-composition.md §6](../../architecture/06-data-taxonomy-and-composition.md) for the full Composite Aggregates / Module Pattern discussion (including the no-sub-components rule for Components), and for the `subsystems` cross-cutting grouping mechanism. See [vocabulary/data-pillars](../vocabulary/data-pillars.md) for the typed `parameters` contract authoring surface.

## Typed parameter contracts

The Aggregate's `spec.parameters:` block declares the typed contract for the parameters the Release fulfills. Each parameter slot carries a declared `type`, an optional `description`, an optional `default`, optional value-space constraints, and (for object-typed slots) nested structure. The compiler validates each Release-supplied value against the contract during Step 1 before parameter interpolation runs.

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
      valuesType: boolean
      default: {}
    allowed_hosts:
      type: array
      description: Hostnames the ingress accepts
      items: { type: string, format: hostname }
      min: 1
      default: ["*"]

  components:
    web:
      type: core/web-server:1.0.0
      values:
        default_locale: "{{ .parameters.default_locale }}"
        region: "{{ .parameters.region }}"
        debug: "{{ .parameters.enable_debug }}"
```

### Parameter slot vocabulary

The typed `parameters:` block accepts the compact-form vocabulary: `type`, `description`, `default`, `enum`, `min`, `max`, `pattern`, `minLength`, `maxLength`, `format`, `items` (for arrays), `properties` (for objects), `valuesType` (for typed-value maps), and `required: true` (per-slot marker). The compiler resolves the parameter declarations to JSON Schema 2020-12 and validates each Release-supplied value against the resolved schema before interpolation. See [`vocabulary/compact-form-authoring.md`](../vocabulary/compact-form-authoring.md) for the full keyword vocabulary.

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
      additionalProperties: false

    metric_labels:
      type: array
      description: Custom Prometheus labels to attach to scraped metrics
      items:
        type: object
        properties:
          name: { type: string, required: true }
          value: { type: string, required: true }
        additionalProperties: false
```

The Release fulfills object-typed parameters with structured YAML; the compiler validates the structure against the declared schema before interpolation. Templates referencing the object's fields use the standard Go template syntax: `{{ .parameters.database_config.host }}`, `{{ .parameters.database_config.port }}`, etc.

### Parameter contract validation

The compiler runs three sub-steps during Step 1 parameter processing:

1. **Contract validation** — each Release-supplied value validates against the declared `type` / `enum` / `min` / `max` / `pattern` / nested-structure constraints. Validation failures halt the build with a clear error naming the offending slot, the supplied value, and the violated constraint. Missing required parameters with no `default:` produce a similar halt with the slot name.
2. **Default fill** — slots with `default:` defined and no Release-supplied value receive their default. Nested-object parameters carry a three-case authoring semantic for omitted, explicit-empty, and partially-authored parent slots: omitting the parent fills the children's defaults, authoring the parent as `{}` preserves the explicit empty (suppresses children's defaults), and authoring the parent as a non-empty map fills only the children the Release did not supply. See [`templates/parameters-context.md`](../templates/parameters-context.md#nested-object-parameters) for the YAML examples and the "when to use each form" decision guide.
3. **Interpolation** — the compiler walks the Aggregate's YAML strings and replaces every `{{ .parameters.<slot> }}` reference inside value-template surfaces (component / feature / sub-aggregate `values:` strings) with the resolved value. After this pass, value-template surfaces consume already-interpolated literals and do not receive `.parameters` in their TemplateContext.

The merged parameter map remains alive through Step 5 to support **path-template** evaluation. Operator-authored `directory:` and `subDirectory:` templates on Release boundaries read `.parameters.<slot>` directly at orchestrator time against a closed allowlist; path emission needs region / environment vocabulary for per-environment artifact layout, and the asymmetric grant keeps that operator concern inside the operator surface without round-tripping through the Aggregate's `values`. The map is actively purged at end-of-pipeline after every render phase completes; recipes consuming developer-authored `values:` see the post-interpolation strings, while path templates see live `.parameters` data through Step 5. See [`templates/expansion-matrix.md`](../templates/expansion-matrix.md) row 3 for the path-template availability matrix and [`path-template-variables.md`](../path-template-variables.md) for the path-template variable allowlist.

For the broader parameter-hoisting checklist (Aggregate declaration → values reference → Release fulfilment → Recipe consumption) and the cross-pillar mechanics, see [`vocabulary/data-pillars.md`](../vocabulary/data-pillars.md) §"Parameters" and §"The parameter-hoisting checklist". For the template-context fields exposed during Step 1 interpolation and the path-template carve-out, see [`templates/parameters-context.md`](../templates/parameters-context.md).

## Annotations on subsystems and components

Subsystems and component instances both carry an `annotations:` field. Developer-authored annotations on the Aggregate surface drive the Aggregate-side annotation cascade — a subsystem annotation propagates to every nested subsystem and every contained component, with closer-level overrides at per-key granularity. The Manifest's `mappings.features.annotations` map declares the bindings that translate annotation keys into synthetic Feature attachments at build time. The Aggregate-as-Authoring-Surface invariant restricts these annotations to routing through the binding's `maps.values` paths; a binding declaring only `maps.infra` paths fires from the Release side, not from the Aggregate side.

### Value shapes

Each annotation value carries one of three forms, distinguishing "I'm silent" from "I declare a value" from "I opt out":

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
          # inherits feature.myco/db-pool: "shared-pool"
        worker:
          annotations:
            feature.myco/db-pool: null         # opts out for this component only
        special:
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
          annotations:
            feature.myco/db-pool:
              db_name: "api-override"   # closer-level override at subkey granularity
              # read_replicas not listed → inherits 5 from parent
        analytics:
          annotations:
            feature.myco/db-pool:
              read_replicas: null       # per-subkey opt-out
```

Structured values cascade with per-subkey deep merge: closer-level subkeys override parent subkeys; an explicit `null` at a subkey suppresses the inherited subkey for that scope while sibling subkeys stand. For the full structured-value teaching — cross-side composition with Release-side infra subkeys, per-subkey type validation, the relaxed-default discipline for schema fields without a declared `type` — see [providers/well-known-annotations.md](../providers/well-known-annotations.md) §"Structured annotation values".

### Per-key independence

Each annotation key inherits, overrides, and opts out independently. A component declaring `annotations.feature.myco/db-pool: null` opts out only of that key; other keys inherited from the enclosing subsystem continue to propagate to that component. Sibling components in the same subsystem retain their own annotation maps independently — one component's opt-out does not affect siblings.

### Top-level component annotations

Top-level components (declared directly under `spec.components` rather than inside a subsystem) carry no inherited cascade. Their `annotations:` field declares values directly on the component scope; expansion synthesises Feature attachments from each declared annotation that the Manifest carries a matching binding for.

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
  - &standard_labels
    aggregate.aggrega.ai/tier: "infrastructure"
    aggregate.aggrega.ai/compliance: "pci-dss"
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
