# Release

The conceptual role of the Release entity (Domain 4 — the deployment router binding an Aggregate to a Manifest and mapping components into physical boundaries) lives in [architecture/04-eight-entity-taxonomy.md](../../architecture/04-eight-entity-taxonomy.md). The temporal-sequencing mechanisms (`syncWaves`), the Dynamic Addressing Polyfill, and the Parameter Hoisting pattern live in [architecture/12-day-two-lifecycles.md](../../architecture/12-day-two-lifecycles.md). This page covers the Release authoring surface.

## The Release's Role

The Release binds an `aggregate` to a `manifest` and maps components to physical deployment boundaries (e.g., `aws-eks-production`). It is the single entry point for compilation: `aggrega build release.yaml`.

The Release fulfills the abstract aggregate contract by injecting physical realities strictly into the `parameters` block, and injects physical sizing (like CPUs or ports) via the `infra` parallel namespace.

Every Release declares a `manifest:` field pointing at its dependency lockfile (unless the Release uses `extends:`, which inherits the parent's manifest pointer). The `aggrega build` CLI reads this field and resolves the Manifest from the Release's directory; no `--manifest` CLI flag exists, so the dependency specification stays Git-committed alongside the Release itself, making deployment history auditable through the Release's own Git history.

The Release dictates the destination for compiled artifacts; provider-engine dispatch belongs to the Manifest the Release points at (see [Manifest vs. Release: concern separation](manifest.md#manifest-vs-release-concern-separation) for the role split).

## Schema-Level Constraints

Two structural guarantees protect the Aggregate as the Single Source of Truth:

* **`values:` is forbidden.** To protect the Aggregate as the Single Source of Truth, the Release schema mechanically bans a `values:` block — Ops cannot declare `values` on any Component, Feature, or Secret from a Release. Per-environment variation of developer-facing values flows through **Parameter Hoisting**: the Developer exposes a typed `parameters.*` field in the Aggregate, the Component's `values` template references it, and the Release fulfills the parameter for its environment. See [architecture/06-data-taxonomy-and-composition.md §8 Constraint 4](../../architecture/06-data-taxonomy-and-composition.md) for the schema-level ban stated explicitly.
* **`extends` + `aggregate:` is rejected.** To prevent untraceable "aggregate-mutating" deployments, when a Release uses `extends`, declaring an `aggregate` pointer is rejected by the Release schema. The child release must map to the exact same Developer Intent as its parent. The `manifest`, however, becomes optional, unlocking "Late Binding" — allowing Ops to inherit the entire physical topology but surgically swap the dependency lockfile.

## Boundaries and Flat Release

If the Release omits the `boundaries` block entirely, the compiler creates an implicit `default` boundary containing all components. Output goes to `dist/default/`. This supports the simplest use case: a developer running `aggrega build --release local.yaml` for a flat Docker Compose deployment without needing to understand boundaries. See [architecture/06-data-taxonomy-and-composition.md §7](../../architecture/06-data-taxonomy-and-composition.md) for the Optional Top-Level Structures pattern.

## Spatial Segregation and Output Paths

Each boundary declares a physical output `directory` for its compiled artifacts; components within a boundary may override via a per-component `subDirectory`. The compiler computes the final artifact path by joining them: `Final_Path = filepath.Join(Evaluated(directory), Evaluated(subDirectory))`.

* **Safe default.** If `subDirectory` is omitted, the compiler applies `subDirectory: "{{ .provider }}"` automatically — each provider's artifacts (Helm, Terraform, Compose, Eval) end up in its own sub-folder, preventing mixed-artifact collisions in downstream CI/CD tools.
* **Flat override.** To disable sub-directories entirely (all artifacts directly under `directory`), set `subDirectory: "."` or `subDirectory: ""`.
* **Template variables available in both `directory` and `subDirectory`:** `{{ .provider }}`, `{{ .component_id }}`, `{{ .parameters.X }}`, `{{ .boundary_name }}`, `{{ .boundary_type }}`, `{{ .manifest.recipe_name }}`.

Boundary annotations cascade downward to every contained component; `infra` stays strictly localized to the component targeting it. The recursive `boundaries` map allows arbitrary nesting (boundary inside boundary inside boundary) while the annotation-cascade and local-infra invariants hold at every level.

**Worked example:**

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Release
metadata:
  name: spatial-release
  version: 1.0.0
  environment: production
spec:
  aggregate: spatial-app
  manifest: prod-manifest
  boundaries:
    eu-prod:
      directory: "deploy/eu-prod"
      # Scenario A: Safe Default. Compiler automatically applies `subDirectory: "{{ .provider }}"`.
      annotations:
        "aggrega.ai/namespace": "finance-frontend" # Merges downwards as annotations
      components:
        api-server: 
          infra: { replicas: 5 } # Strictly local
        aws-rds:
          # Scenario B: Bespoke Enterprise Naming.
          subDirectory: provisioning 
        postgres-db:
          # Scenario C: The Flat Directory Override.
          subDirectory: "." # or ""
```

Annotations cascaded by this mechanism surface in downstream Recipe templates via `.context.annotations.release`; see [Recipe authoring](recipe.md) and the [Template Expansion Matrix](../templates/expansion-matrix.md) for how renderers consume them.

## Temporal Sequencing

The optional `syncWaves` dictionary maps component IDs to integer deployment stages, giving Ops explicit control over deployment order without touching the Developer's Aggregate. See [architecture/12-day-two-lifecycles.md §1](../../architecture/12-day-two-lifecycles.md) for the full syncWaves mechanism and downstream GitOps annotation emission.

## Feature Attachment

The Release can attach Features both at boundary scope (broad policy) and at component-specific scope (precise targeting), with execution following the 5-Tier Onion Model defined in [architecture/10-compilation-pipeline.md](../../architecture/10-compilation-pipeline.md). Features declared in the Release contribute `type` and `infra`; they cannot declare `values` (see Schema-Level Constraints above).
