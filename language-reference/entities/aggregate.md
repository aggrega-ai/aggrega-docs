# Aggregate

The conceptual role of the Aggregate entity (Domain 1 — the Developer's declarative topology blueprint) lives in [architecture/04-eight-entity-taxonomy.md](../../architecture/04-eight-entity-taxonomy.md). The composition patterns (subsystems, nested aggregates, Zero-Port Convention, Parameter Hoisting) live in [architecture/06-data-taxonomy-and-composition.md](../../architecture/06-data-taxonomy-and-composition.md). This page covers the Aggregate catalog authoring surface — specifically, authoring reusable Aggregate modules for catalog distribution.

## Reusable Aggregate Modules

Aggregates serve as both the root application and reusable modules. A parent Aggregate can declare a child Aggregate exactly like a component, passing `parameters` down into it. To prevent tight coupling, child Aggregates expose an **`exportedComponents:`** contract, establishing a stable public interface name. The parent requests this interface, and the Go compiler dynamically rewires the topological edge to the correct internal node.

### Catalog Location

Reusable Aggregate modules live in the catalog under:
```
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
