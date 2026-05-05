# Aggregate

The conceptual role of the Aggregate entity (Domain 1 — the Developer's declarative topology blueprint) lives in [architecture/04-eight-entity-taxonomy.md](../../architecture/04-eight-entity-taxonomy.md). The composition patterns (subsystems, nested aggregates, Zero-Port Convention, Parameter Hoisting) live in [architecture/06-data-taxonomy-and-composition.md](../../architecture/06-data-taxonomy-and-composition.md). This page covers the Aggregate catalog authoring surface — specifically, authoring reusable Aggregate modules for catalog distribution.

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
  - &default_replicas 3
spec:
  components:
    primary:
      type: core/server/api-server:1.0.0
      values:
        replicas: *default_replicas
    secondary:
      type: core/worker/python:1.0.0
      values:
        replicas: *default_replicas
```

Anchors resolve at YAML-parse time, so `*default_replicas` is the integer `3` by the time the compiler reads the values block. The `defs:` block is the conventional home for the anchor definitions; YAML allows anchors to be declared anywhere, but co-locating them keeps the rest of the Aggregate readable. The block is optional — Aggregates that do not need anchors omit it entirely.
