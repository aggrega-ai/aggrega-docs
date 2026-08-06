# Release

The conceptual role of the Release entity (Domain 4 — the deployment router binding an Aggregate to a Manifest and mapping components into physical boundaries) lives in [architecture/04-entity-taxonomy.md](../../architecture/04-entity-taxonomy.md). The temporal-sequencing mechanism (per-boundary `syncWave`), the Dynamic Addressing Polyfill, and the Parameter Hoisting pattern live in [architecture/12-day-two-lifecycles.md](../../architecture/12-day-two-lifecycles.md). This page covers the Release authoring surface.

## The Release's Role

The Release binds an `aggregate` to a `manifest` and maps components to physical deployment boundaries (e.g., `aws-eks-production`). It is the single entry point for compilation: `aggrega build --release release.yaml`.

The Release fulfills the abstract aggregate contract by injecting physical realities strictly into the `parameters` block, and injects physical sizing (like CPUs or ports) via the `infra` parallel namespace.

Every Release declares a `manifest:` field naming its Manifest (unless the Release uses `extends:`, which inherits the parent's manifest pointer). The `aggrega build` CLI reads this field directly; no `--manifest` CLI flag exists, so the dependency specification stays Git-committed alongside the Release itself, making deployment history auditable through the Release's own Git history.

The `aggregate:` and `manifest:` fields are resolved **by identity or by relative-path file**, the same way the rest of the language resolves references — never as a release-relative filename stem. A `./` or `../` value is an explicit local file, read directly relative to the Release. A bare token is an **identity** — the referenced entity's `metadata.name`. A `manifest:` identity is resolved by scanning the Release's own directory (a Manifest is deployment-side operator config, so it has no catalog or registry tier). An `aggregate:` identity resolves through the full cascade — the Release's directory, then the catalog, then the registry — so a Release can name a published Aggregate by identity and the same published module resolves whether it is a Release's top-level `spec.aggregate` or a sub-aggregate inside another Aggregate. This identity-or-path model lets a shared Aggregate back many Release variants without coupling the reference to a filename, and a published Aggregate be deployed directly by name.

The Release dictates the destination for compiled artifacts; provider-engine dispatch belongs to the Manifest the Release points at (see [Manifest vs. Release: concern separation](manifest.md#manifest-vs-release-concern-separation) for the role split).

## Environment Metadata

Every Release metadata block accepts an `environment:` field — a free-form string identifying the deployment environment (typical values: `production`, `staging`, `dev`). The field is informational: it carries no enumeration, no schema-level pattern, and no cross-entity validation beyond `type: string`. The compiler emits its value as the `aggrega.ai/environment` label on every rendered Kubernetes manifest produced by the helm and helm-chart providers, alongside the rest of the Aggrega provenance label suite. The compose provider translates the same identifier into its native tagging mechanism as its renderer adds that capability.

Five practical patterns drive `environment:` authoring:

1. **OTel/FinOps cost attribution.** Cloud cost dashboards (AWS Cost Explorer, Datadog Cloud Cost Management, CloudHealth) tag-filter Kubernetes pods by environment. The `aggrega.ai/environment: production` label flows into pod labels via the Helm provider's label injection; cost reports group spend by `aggrega.ai/environment` without manual per-resource tagging.

2. **OTel trace and log filtering.** Observability dashboards (Datadog, New Relic, Honeycomb, Grafana Tempo) filter telemetry by environment label. `aggrega.ai/environment: staging` lets operators scope log queries and trace lookups to staging without filtering on namespace conventions or chart names — a single canonical label across the rendered surface.

3. **Kubernetes operator targeting.** GitOps controllers (ArgoCD, Flux) and policy operators (Kyverno, OPA Gatekeeper) sometimes filter resources by environment label for environment-specific policies (for example, "production-only resources require an approved-image-source label"). The `aggrega.ai/environment` label provides a stable selector distinct from namespace conventions or naming patterns.

4. **Multi-region production differentiation.** A team running a `production-us-east` Release alongside a `production-eu-west` Release — both with `metadata.environment: production` — gets the same `aggrega.ai/environment: production` label across regions. Combined with a separate region label, this enables cross-region cost rollup ("total production spend") and per-region drill-down.

5. **Compliance scoping.** SOC 2, PCI, and HIPAA evidence collection scopes by environment (production-only audit, etc.). The `aggrega.ai/environment` label is consumed by compliance-evidence-gathering tooling (Vanta, Drata) to filter resources by audit scope.

*The field is informational and optional in intent; the current schema declares it required, and the requirement will be relaxed in a future iteration. The renderer already handles empty values — a Release that omits `environment:` (when the schema relaxes) produces no `aggrega.ai/environment` label, while all other provenance labels emit normally.*

## Schema-Level Constraints

Two structural guarantees protect the Aggregate as the Single Source of Truth:

* **`values:` is forbidden.** To protect the Aggregate as the Single Source of Truth, the Release schema mechanically bans a `values:` block — the Operator cannot declare `values` on any Component, Feature, or Secret from a Release. The ban extends to `uses` edges: a Release per-edge `uses` entry carries `infra` only, never `values` (developer-facing per-edge values stay in the Aggregate). Per-environment variation of Developer-facing values flows through **Parameter Hoisting**: the Developer exposes a typed `parameters.*` field in the Aggregate, the Component's `values` template references it, and the Release fulfills the parameter for its environment. See [architecture/06-data-taxonomy-and-composition.md §8 Constraint 4](../../architecture/06-data-taxonomy-and-composition.md) for the schema-level ban stated explicitly. The Release's `uses` edge surface — what it may configure and wire — is documented in [Per-edge connection configuration](#per-edge-connection-configuration) below.
* **`extends` + `aggregate:` is rejected.** To prevent untraceable "aggregate-mutating" deployments, when a Release uses `extends`, declaring an `aggregate` pointer is rejected by the Release schema. The child release must map to the exact same Developer Intent as its parent. The `manifest`, however, becomes optional, unlocking "Late Binding" — allowing the Operator to inherit the entire physical topology but surgically swap the dependency lockfile.

## The `parameters:` block

A Release fulfills the typed parameter contract the Aggregate declares. `spec.parameters:` is the authoring surface — a YAML map whose keys match the Aggregate's `parameters.*` declarations and whose values supply the per-environment fulfillment.

```yaml
# Aggregate declares the typed contract
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: my-app
spec:
  parameters:
    db_size: { type: string, required: true }
    timeout_seconds: { type: integer, default: 30 }
    region: { type: string, enum: [us-east-1, eu-west-1], required: true }
```

```yaml
# Release fulfills the contract for this environment
apiVersion: aggrega.ai/v1alpha1
kind: Release
metadata:
  name: prod-release
  version: 1.0.0
spec:
  aggregate: my-app
  manifest: prod-manifest
  parameters:
    db_size: "100Gi"
    timeout_seconds: 60
    region: "us-east-1"
```

Each value passes the Aggregate-declared schema check at the parameter-contract layer, and the compiler emits clear `ErrParameterContractViolation` / `ErrParameterMissing` errors when a Release omits a required parameter or supplies a value of the wrong type. Parameters declared with a `default:` receive the default when the Release omits the slot; the typed contract is the only authoring vocabulary.

**Two authoring modes — content-shape dispatch.** `parameters:` accepts either an inline YAML map (Mode 1, shown above) or a single `$import:` key pointing at a local file (Mode 2):

```yaml
spec:
  aggregate: my-app
  manifest: prod-manifest
  parameters:
    $import: ./prod-parameters.yaml
```

The two modes are mutually exclusive at this site, and only a single file may be imported. Multi-file parameter layering is the province of Release `extends:` chains: the parent Release supplies a base set of parameters and the child extends-and-overrides per environment. See [Composite Release / `extends:` inheritance](#composite-release-and-extends-inheritance) further down for the pattern.

**Boundary between parameters and infra.** Parameters carry the Developer's cognitive intent expressed as typed slots the Aggregate declares; the Release fulfills them. `infra:` on the Release carries the Operator's physical sizing (replica counts, CPU/memory bounds, storage classes) attached to specific components or Feature attachments. Parameters flow into the Aggregate's `values:` templates via `.parameters.X`; `infra:` flows into the Recipe's `valuesMapping:` template via `.infra.X`. See [architecture/06-data-taxonomy-and-composition.md §3](../../architecture/06-data-taxonomy-and-composition.md) for the data-pillar taxonomy and [templates/parameters-context.md](../templates/parameters-context.md) for the parameter lifecycle through the pipeline.

## Boundaries and the default scope

A Release groups components into **boundaries** — physical deployment units, each with its own output directory and annotation cascade. The single-boundary case is the common one, so it needs no ceremony.

**Single scope (the default).** Author components directly under `spec.components:` and omit the `boundaries:` block. The compiler folds them into a synthesized `default` boundary whose output is **flat** — artifacts land directly under `dist/` (per provider, via the safe `subDirectory` default below: `dist/compose/`, `dist/helm/`, …), with no boundary-name segment in the path. This is the simplest deployment: `aggrega build` over a flat Compose or single-cluster target without naming boundaries.

```yaml
spec:
  aggregate: aggregate
  manifest: manifest
  components:
    db:
      infra:
        engine_version: "11.4"
    web:
      infra:
        port: 8080
```

**Multiple scopes (Level 2).** When a deployment spans more than one physical grouping — separate clusters, regions, or sync waves — declare named boundaries under `boundaries:`. Each boundary carries its own `directory:`, annotation cascade, and `syncWave:`, and components are addressed within their boundary.

**Mutual exclusivity.** `spec.components:` and `spec.boundaries:` are mutually exclusive at the Release root — a Release authors one or the other, never both. A document declaring both halts at load with an envelope error. The top-level `components` surface carries the same per-component operator shape a boundary's `components` carry (`infra:`, `annotations:`, `uses:`).

**A declared boundary named `default`.** The flat output is a property of the *synthesized* default, not of the name. A Release that explicitly declares a boundary named `default` under `boundaries:` is an ordinary named boundary: its output follows its `directory:` (defaulting to `dist/default/`), exactly like any other declared boundary.

See [architecture/06-data-taxonomy-and-composition.md §7](../../architecture/06-data-taxonomy-and-composition.md) for the default-scope pattern.

## Spatial Segregation and Output Paths

Each boundary declares a physical output `directory` for its compiled artifacts; components within a boundary may override via a per-component `subDirectory`. The compiler computes the final artifact path by joining them: `Final_Path = filepath.Join(Evaluated(directory), Evaluated(subDirectory))`.

* **Safe default.** If `subDirectory` is omitted, the compiler applies `subDirectory: "{{ .capability }}"` automatically — each rendering capability's artifacts (Helm, Helm-chart, Compose) end up in its own sub-folder, preventing mixed-artifact collisions in downstream CI/CD tools.
* **Flat override.** To disable sub-directories entirely (all artifacts directly under `directory`), set `subDirectory: "."` or `subDirectory: ""`.
* **Template variables.** `directory` evaluates with `{{ .capability }}`, `{{ .boundary_name }}`, `{{ .parameters.X }}`, `{{ .manifest.recipe_name }}`, and `{{ .parent_boundary.* }}` for cascading data from an enclosing boundary. `subDirectory` evaluates with the same set plus `{{ .component_id }}` (per-component overrides only). The compiler evaluates path templates with `missingkey=error` — referencing an undeclared variable halts the build with a precise diagnostic. See [path-template variables](../path-template-variables.md) for the per-context matrix and parent-boundary cascade rules.

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
      # Scenario A: Safe Default. Compiler automatically applies `subDirectory: "{{ .capability }}"`.
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

**Structured annotation values.** When a Manifest binding declares multiple infra-pillar routing paths for one annotation key, the Release-side annotation value can be a structured object carrying values for several Feature schema fields in one declaration:

```yaml
boundaries:
  prod:
    annotations:
      feature.myco/db-pool:
        pool_size: 20
        max_connections: 100
      components:
        api:
          annotations:
            feature.myco/db-pool:
              max_connections: 200   # closer-level override
              # pool_size not listed → inherits 20 from boundary
```

Structured values cascade with per-subkey deep merge; closer-level subkeys override parent subkeys. Per-subkey `null` opts out one subkey while sibling subkeys stand. The Release side fires only the subkeys whose binding-map pillar is `infra`; subkeys routing to `values` belong on Aggregate-side annotations. For the full structured-value teaching — cross-side composition, per-subkey type validation, the relaxed-default discipline — see [providers/well-known-annotations.md](../providers/well-known-annotations.md) §"Structured annotation values".

**Well-known annotations.** Beyond ad-hoc keys, the Aggrega standard library defines a set of well-known annotations under the `aggrega.ai/` and `feature.aggrega.ai/` namespaces, grouped into placement, networking, security, and observability categories. Authors adding annotations to a Release boundary should consult [providers/well-known-annotations.md](../providers/well-known-annotations.md) for the full matrix plus per-provider consumption rules — the page documents which providers honour each well-known key and what behaviour they emit when the key is present.

## Per-edge connection configuration

A boundary component may carry a `uses:` block that configures or wires the topology edges within the sockets the Component's catalog `usesSchema` declares. This is the operator's per-connection surface, bounded so the developer keeps ownership of the architecture they authored:

* **Configure an existing edge.** Set per-edge `infra` on an edge the developer already declared. The entry names the developer's alias and supplies `infra`; it either names the same target the developer wired or omits the target. The `infra` is validated against the socket's `infraSchema`.
* **Wire an unbound socket.** Create an edge into a socket the Component's `usesSchema` declares but the developer left unwired, pointing at an existing component. The created edge may also carry per-edge `infra`.

The surface is **create-not-retarget**: a Release may add an edge into an unbound socket, but it may not redirect an edge the developer already declared. A per-edge entry that names a *different* target than the developer's edge halts the build; an entry that names the *same* target (or omits it) configures that edge. The Release also may not declare `values` on an edge (developer-facing values stay in the Aggregate), bind a socket the `usesSchema` does not declare, or point an edge at a component that does not exist — each is a fatal halt. See [errors/fatal-halts.md](../errors/fatal-halts.md) §"When building the topology".

```yaml
spec:
  aggregate: spatial-app
  manifest: prod-manifest
  boundaries:
    eu-prod:
      components:
        api-server:
          uses:
            databases:
              # Configure the developer-declared edge "primary": add per-edge infra.
              # The target matches what the Aggregate wired (or is omitted) — a configure, not a retarget.
              primary:
                infra: { storage_class: fast-ssd }
            caches:
              # Wire an edge into the declared-but-unbound "caches" socket to an existing component.
              main:
                target: redis-prod
                infra: { storage_class: standard }
```

The resolved per-edge `infra` flows into the *consuming* component's render context at `.context.uses.<alias>.infra.<key>`; it never appears in the target component's context, so a target's rendered output is invariant with respect to the consumers that configure edges into it.

## The `aggregates:` field — routing nested sub-modules into boundaries

When the Aggregate declares nested sub-modules via `spec.aggregates:`, the Release decides which boundary each sub-module's components land in by declaring `aggregates:` alongside `components:` inside the target boundary:

```yaml
# Aggregate declares two sub-aggregates
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: platform
spec:
  aggregates:
    finance:
      type: finance-module:1.2.0
    analytics:
      type: analytics-module:2.0.0
  components:
    gateway:
      type: core/ingress
---
# Release routes each sub-aggregate into a specific boundary
apiVersion: aggrega.ai/v1alpha1
kind: Release
metadata:
  name: prod-release
spec:
  aggregate: platform
  manifest: prod-manifest
  boundaries:
    eu-prod:
      directory: "deploy/eu-prod"
      aggregates:
        finance: {}
      components:
        gateway: {}
    us-prod:
      directory: "deploy/us-prod"
      aggregates:
        analytics: {}
```

Place every sub-aggregate listed under `Aggregate.spec.aggregates:` in exactly one boundary when the Release declares `boundaries:`.

🔴 **Sub-aggregate routing is accepted and structurally validated; it is not yet consumed.** The `aggregates:` map is checked against the Release schema when the Release loads — its shape, its recursion, and the per-component overrides inside it are all validated — but no compiler stage reads it. So routing a sub-aggregate into a boundary does not currently affect emitted artifacts, and neither an unplaced sub-aggregate nor one placed in more than one boundary is reported. Author the placement as described below: it becomes load-bearing when the routing consumer ships, and a document written to this shape needs no change at that point.

**Recursive routing.** `aggregates:` is recursive — each entry under a boundary's `aggregates:` may itself declare a nested `aggregates:` map for deeply-nested module composition.

**Per-aggregate routing block.** Inside the routing entry the Release may declare the same shape as a regular boundary entry: `annotations:`, `infra:`, and per-component overrides. The sub-aggregate's own components and Features are not redeclared at the Release — the Release routes them rather than restating them.

## Temporal Sequencing — per-boundary `syncWave`

Each boundary in the Release optionally declares an integer `syncWave:` field, giving the Operator explicit control over deployment order without touching the Developer's Aggregate. The wave number is a property of the boundary itself; every component contained in the boundary's subtree inherits its boundary's wave value when artifacts emit.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Release
metadata:
  name: prod-release
  version: 1.0.0
  environment: production
spec:
  aggregate: my-app
  manifest: prod-manifest
  boundaries:
    infra:
      directory: "deploy/infra"
      syncWave: 0
      components:
        core-vpc: {}
        postgres-db: {}
    migrations:
      directory: "deploy/migrations"
      syncWave: 1
      components:
        db-migration-task: {}
    apps:
      directory: "deploy/apps"
      syncWave: 2
      components:
        web-server: {}
        ai-agent: {}
```

**Wave value semantics.** `syncWave:` is a signed integer (positive, zero, or negative). The default when the field is omitted is `0`. Wave values are not inherited from a parent boundary — each boundary that wants a non-default wave declares one explicitly. Components cannot override their boundary's wave (the wave is a property of the spatial unit, not of individual components).

**Per-provider emission.** The compiler emits the boundary's wave value into rendered output in provider-native form:

* **Kubernetes (helm / helm-chart provider).** Every Kubernetes resource produced for the boundary carries the GitOps-standard `argocd.argoproj.io/sync-wave: "<N>"` annotation; Helm hooks additionally carry the `helm.sh/hook-weight: "<N>"` annotation so the same wave value drives Helm's own pre/post-install ordering. ArgoCD, Flux, and Helm read these annotations natively and order resource application accordingly.
* **Compose.** The compose provider does not translate `syncWave:` into compose-native ordering; the docker-compose `depends_on` mechanism (per [`providers/compose.md`](../providers/compose.md) "depends_on inference") handles per-edge ordering rather than wave-based ordering. Authors targeting compose should rely on `uses:` edges for inter-component dependencies.

**Wave-authoring vs deployable unit.** The boundary is the wave-authoring unit. The deployable unit is whichever assembly path the components emit into — by default 1:1 with the boundary, but two sibling boundaries that share a `directory:` collapse into one assembled output (one `Chart.yaml`, one `docker-compose.yaml`). When that happens, the assembled output may carry resources from multiple waves; an ArgoCD Application reading the rendered chart sees per-resource `sync-wave` annotations and orders application accordingly within the Application. Cross-Application sequencing across paths is the operator's CI concern.

**Use cases.** Wave ordering matters whenever startup of one boundary depends on another's prior completion. Canonical pattern: an `infra` boundary at wave 0 (VPC + database), a `migrations` boundary at wave 1 (schema-migration job), and an `apps` boundary at wave 2 (the application that consumes the migrated schema). Without explicit waves, all three deploy concurrently and the application crash-loops while waiting for the migration to complete.

For the full architectural framing — the DAG execution model, the rationale for placing temporal sequencing on the Release rather than the Aggregate, and the wave-authoring vs deployable-unit distinction — see [`architecture/12-day-two-lifecycles.md` §1](../../architecture/12-day-two-lifecycles.md).

## Feature Attachment

The Release can attach Features both at boundary scope (broad policy) and at component-specific scope (precise targeting), with execution following the 5-Tier Onion Model defined in [architecture/10-compilation-pipeline.md](../../architecture/10-compilation-pipeline.md). Features declared in the Release contribute `type`, `infra`, and `uses`; they cannot declare `values` (see Schema-Level Constraints above).

`features:` is the Release's only attachment surface, at both scopes — as it is the Aggregate's. A credential is a Feature carrying the `feature.aggrega.ai/kind: secret` label, so an Operator-attached credential is attached under `features:` like any other Feature. There is no second attachment keyword at any scope; a document that declares one is rejected at load with an envelope error naming the unexpected property.

A feature attached boundary-wide may carry a `uses:` block, and that block projects to every component routed into the boundary: each component gains a dependency edge to the feature's named targets and is injected those targets' `provides`. This expresses a shared dependency once at the boundary — "every component in this boundary talks to the shared cache / collector / message bus" — rather than repeating the same `uses:` edge on each component. A subsystem-level Feature attachment in the Aggregate projects its `uses:` the same way across the subsystem's components. `uses` is a topology wiring declaration, not a value, so it is permitted on the Release. The projection is independent of the attached Feature's execution scope: a Feature whose FeatureRecipe renders once per boundary still projects its `uses:` per component, while the shared resource itself renders once.

## Composite Release and `extends:` inheritance

A Release may declare `spec.extends: <release-uri>` pointing to a base Release whose authoring surface it inherits. The compiler walks the inheritance chain at workspace load, validates that the chain is acyclic, and merges parent fields into the child to produce a single resolved Release. The Schema-Level Constraints above govern the merge:

* The child cannot declare `aggregate:` — it inherits the parent's Aggregate pointer unchanged (the schema rejects child-side overrides of the Developer Intent).
* The child may omit `manifest:` — inheriting the parent's manifest pointer — or surgically override it for Late Binding.
* All other fields (`parameters:`, `boundaries:`, per-boundary `infra:`, annotations, Feature attachments) merge with child-wins-on-collision semantics.

**The local-development bridge pattern.** The canonical use case is a developer running their team's production Aggregate against local Docker Compose without forking the Aggregate or duplicating the boundary topology. The team publishes a production Release; a local Release `extends:` the production Release and overrides only the Manifest pointer (swapping cloud-targeted Recipes for local equivalents):

```yaml
# production Release (committed; the source of truth for prod deployments)
apiVersion: aggrega.ai/v1alpha1
kind: Release
metadata:
  name: prod-release
spec:
  aggregate: my-app
  manifest: prod-manifest
  parameters:
    region: us-east-1
    db_size: 100Gi
  boundaries:
    prod:
      directory: deploy/prod
      components:
        api: { infra: { replicas: 5 } }
        db: {}

---
# Local Release (developer-side; inherits everything, swaps the Manifest)
apiVersion: aggrega.ai/v1alpha1
kind: Release
metadata:
  name: local-release
spec:
  extends: hub.aggrega.ai/release/prod-release:1.0.0
  manifest: local-manifest    # surgically overrides for local
  parameters:
    region: dev-local
    db_size: 1Gi
```

`local-release` inherits the parent's boundary topology, Feature attachments, and component overrides; the developer sees one `local-release.yaml` and runs `aggrega build --release local-release.yaml` with no production-config duplication.

**Multi-file parameter layering.** Release inheritance is the home for multi-file parameter layering. A base Release supplies the common parameter set; per-environment children `extends:` the base and override the slots that differ:

```yaml
# base-release.yaml — common parameters
spec:
  aggregate: my-app
  parameters:
    timeout_seconds: 30
    feature_flags: { dark_mode: true }

---
# prod-release.yaml
spec:
  extends: ./base-release.yaml
  manifest: prod-manifest
  parameters:
    feature_flags: { dark_mode: false }   # override one nested key

---
# staging-release.yaml
spec:
  extends: ./base-release.yaml
  manifest: staging-manifest
```

Each child sees the parent's inherited parameters merged with its own. Map-valued parameters deep-merge with child-key wins; scalar-valued parameters child-replace.

**Error modes.** Cyclic `extends:` chains, missing parent pointers, and child-side `aggregate:` declarations all halt workspace load with explicit diagnostics naming the offending Release and the schema-level violation. See [errors/fatal-halts.md](../errors/fatal-halts.md) for the per-error message shapes.
