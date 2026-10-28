# Release

The conceptual role of the Release entity (Domain 4 — the deployment router binding an Aggregate to a Manifest and mapping components into physical boundaries) lives in [architecture/04-entity-taxonomy.md](../../architecture/04-entity-taxonomy.md). The temporal-sequencing mechanism (per-boundary `syncWave`), the Dynamic Addressing Polyfill, and the Parameter Hoisting pattern live in [architecture/12-day-two-lifecycles.md](../../architecture/12-day-two-lifecycles.md). This page covers the Release authoring surface.

## The Release's Role

The Release binds an `aggregate` to a `manifest` and maps components to physical deployment boundaries (e.g., `aws-eks-production`). It is the single entry point for compilation: `aggrega build --release release.yaml`.

The Release fulfills the abstract aggregate contract by injecting physical realities strictly into the `parameters` block, and injects physical sizing (like CPUs or ports) via the `infra` parallel namespace.

Every Release declares a `manifest:` field naming its Manifest (unless the Release uses `extends:`, which inherits the parent's manifest pointer). The `aggrega build` CLI reads this field directly; no `--manifest` CLI flag exists, so the dependency specification stays Git-committed alongside the Release itself, making deployment history auditable through the Release's own Git history.

The `aggregate:` and `manifest:` fields are resolved **by identity or by relative-path file**, the same way the rest of the language resolves references — never as a release-relative filename stem. A `./` or `../` value is an explicit local file, read directly relative to the Release. A bare token is an **identity** — the referenced entity's `metadata.name`. A `manifest:` identity is resolved by scanning the Release's own directory (a Manifest is deployment-side operator config, so it has no catalog or registry tier). An `aggregate:` identity resolves through the full cascade — the Release's directory, then the catalog, then the registry — so a Release can name a published Aggregate by identity and the same published module resolves whether it is a Release's top-level `spec.aggregate` or a sub-aggregate inside another Aggregate. This identity-or-path model lets a shared Aggregate back many Release variants without coupling the reference to a filename, and a published Aggregate be deployed directly by name.

**A path stays inside the workspace.** A `./` or `../` value names a file the workspace holds, and so does every other path a Release writes — its `extends:` and a parameters `$import:`, below. One that climbs out of the workspace as it is written, or that a symbolic link on the way carries out of it, is refused before anything is read from the file it names. To deploy an Aggregate kept outside the workspace, name it by identity and list the directory holding it as a catalog directory in the workspace configuration; a Manifest, a Release an `extends:` names and a parameters file are read beside the Release and never looked up by name, so they are kept inside the workspace. A Release you name on the command line, or that the workspace configuration names, outside the workspace is a root of its own: every path it writes — and every path a Release its `extends:` chain leads to writes — must lead to a file inside the directory holding that Release, and one that climbs out of that directory, or that a link carries out of it, is refused the same way. Keep what such a Release names beside it, or build it in the workspace that holds both. See [errors/fatal-halts.md](../errors/fatal-halts.md) §"A reference to another file leads out of the directory it must stay inside".

The Release dictates the destination for compiled artifacts; provider dispatch belongs to the Manifest the Release points at (see [Manifest vs. Release: concern separation](manifest.md#manifest-vs-release-concern-separation) for the role split).

## Environment Metadata

Every Release metadata block accepts an `environment:` field — a free-form string identifying the environment the Release deploys to (typical values: `production`, `staging`, `dev`). The field is informational: it carries no enumeration, no schema-level pattern, and no cross-entity validation beyond `type: string`. The compiler emits its value as the `aggrega.ai/environment` label on every Kubernetes manifest the helm provider renders, alongside the rest of the Aggrega provenance label suite; the helm-chart provider adds the same labels to each `$import:`-loaded artifact it places in a sub-chart, while the sub-chart's own templates carry what their author wrote. The compose provider carries the same value as the `aggrega.ai/environment` label on each service it emits.

Five practical patterns drive `environment:` authoring:

1. **OTel/FinOps cost attribution.** Cloud cost dashboards (AWS Cost Explorer, Datadog Cloud Cost Management, CloudHealth) tag-filter Kubernetes pods by environment. The `aggrega.ai/environment: production` label flows into pod labels via the Helm provider's label injection; cost reports group spend by `aggrega.ai/environment` without manual per-resource tagging.

2. **OTel trace and log filtering.** Observability dashboards (Datadog, New Relic, Honeycomb, Grafana Tempo) filter telemetry by environment label. `aggrega.ai/environment: staging` lets operators scope log queries and trace lookups to staging without filtering on namespace conventions or chart names — a single canonical label across the rendered surface.

3. **Kubernetes operator targeting.** GitOps controllers (ArgoCD, Flux) and policy operators (Kyverno, OPA Gatekeeper) sometimes filter resources by environment label for environment-specific policies (for example, "production-only resources require an approved-image-source label"). The `aggrega.ai/environment` label provides a stable selector distinct from namespace conventions or naming patterns.

4. **Multi-region production differentiation.** A team running a `production-us-east` Release alongside a `production-eu-west` Release — both with `metadata.environment: production` — gets the same `aggrega.ai/environment: production` label across regions. Combined with a separate region label, this enables cross-region cost rollup ("total production spend") and per-region drill-down.

5. **Compliance scoping.** SOC 2, PCI, and HIPAA evidence collection scopes by environment (production-only audit, etc.). The `aggrega.ai/environment` label is consumed by compliance-evidence-gathering tooling (Vanta, Drata) to filter resources by audit scope.

*The field is informational and optional in intent; the current schema declares it required, and the requirement will be relaxed in a future iteration. The renderer already handles empty values — a Release that omits `environment:` (when the schema relaxes) produces no `aggrega.ai/environment` label, while all other provenance labels emit normally.*

## Schema-Level Constraints

Two structural guarantees protect the Aggregate as the Single Source of Truth:

* **`values:` is forbidden.** To protect the Aggregate as the Single Source of Truth, the Release schema mechanically bans a `values:` block — the Operator cannot declare `values` on any Component or Feature from a Release. The ban extends to `uses` edges: a Release per-edge `uses` entry carries `infra` and the attachments it writes on the connection, and those carry `infra` too — never `values` (developer-facing per-edge values, and the values of an attachment on a connection, stay in the Aggregate). Per-environment variation of Developer-facing values flows through **Parameter Hoisting**: the Developer exposes a typed `parameters.*` field in the Aggregate, the Component's `values` template references it, and the Release fulfills the parameter for its environment. See [architecture/06-data-taxonomy-and-composition.md §8 Constraint 4](../../architecture/06-data-taxonomy-and-composition.md) for the schema-level ban stated explicitly. The Release's `uses` edge surface — what it may configure and wire — is documented in [Per-edge connection configuration](#per-edge-connection-configuration) below.
* **`extends` + `aggregate:` is rejected.** To prevent untraceable "aggregate-mutating" Releases, when a Release uses `extends`, declaring an `aggregate` pointer is rejected by the Release schema. The child release must map to the exact same Developer Intent as its parent. The `manifest`, however, becomes optional, unlocking "Late Binding" — allowing the Operator to inherit the entire physical topology but surgically swap the Manifest.

## The `parameters:` block

A Release fulfills the typed parameter contract the Aggregate declares. `spec.parameters:` is the authoring surface — a YAML map whose keys match the Aggregate's `parameters.*` declarations and whose values supply the per-environment fulfillment.

```yaml
# Aggregate declares the typed contract
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: my-app
  version: 1.0.0
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
  environment: production
spec:
  aggregate: my-app
  manifest: prod-manifest
  parameters:
    db_size: "100Gi"
    timeout_seconds: 60
    region: "us-east-1"
```

Each value passes the Aggregate-declared schema check at the parameter-contract layer, and the build halts when a Release omits a required parameter (`E0165`, `parameter-missing`) or supplies a value its slot's contract refuses (`E0164`, `parameter-contract-violation`). Parameters declared with a `default:` receive the default when the Release omits the slot; the typed contract is the only authoring vocabulary.

**Two authoring modes — content-shape dispatch.** `parameters:` accepts either an inline YAML map (Mode 1, shown above) or a single `$import:` key pointing at a local file (Mode 2):

```yaml
spec:
  aggregate: my-app
  manifest: prod-manifest
  parameters:
    $import: ./prod-parameters.yaml
```

A relative `$import:` path is resolved from the directory holding the Release that writes it, wherever a command is run from, so the command line and the editor read the same file; an absolute path names its own place, and either must lead to a file inside the workspace — or, for a Release named outside the workspace, inside the directory holding it. The two modes are mutually exclusive at this site, and only a single file may be imported. Multi-file parameter layering is the province of Release `extends:` chains: the parent Release supplies a base set of parameters and the child extends-and-overrides per environment. See [Composite Release / `extends:` inheritance](#composite-release-and-extends-inheritance) further down for the pattern.

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

**Multiple scopes.** When a Release spans more than one physical grouping — separate clusters, regions, or sync waves — declare named boundaries under `boundaries:`. Each boundary carries its own `directory:`, annotation cascade, and `syncWave:`, and components are addressed within their boundary.

**Mutual exclusivity.** `spec.components:` and `spec.boundaries:` are mutually exclusive at the Release root — a Release authors one or the other, never both. A document declaring both halts at load with an envelope error. The top-level `components` surface carries the same per-component operator shape a boundary's `components` carry (`infra:`, `annotations:`, `uses:`).

**A declared boundary named `default`.** The flat output is a property of the *synthesized* default, not of the name. A Release that explicitly declares a boundary named `default` under `boundaries:` is an ordinary named boundary: its output follows its `directory:` (defaulting to `dist/boundaries/default/`), exactly like any other declared boundary.

See [architecture/06-data-taxonomy-and-composition.md §7](../../architecture/06-data-taxonomy-and-composition.md) for the default-scope pattern.

## Spatial Segregation and Output Paths

Each boundary declares a physical output `directory` for its compiled artifacts; components within a boundary may override via a per-component `subDirectory`. The compiler computes the final artifact path by joining them, in slash-separated form on every platform: `Final_Path = Clean(Join(Evaluated(directory), Evaluated(subDirectory)))`.

* **One directory, one spelling.** The evaluated path is cleaned once, so `out/a`, `out//a`, `./out/a` and `out/a/` are one directory. Boundaries whose paths clean to the same directory and render through the same provider are assembled together, exactly as boundaries written with identical paths are.
* **The path stays beneath the output root.** A path that climbs out of the output root (`..`, `../escape`, `a/../..`), an absolute one, or one naming no directory at all — empty, or cleaning to the output root itself — stops the build before anything is written. The message names the Release, the boundary, the field at fault (`directory:` or `subDirectory:`) and the value it evaluated to, since that value is often the result of a template.
* **Safe default.** If `subDirectory` is omitted or empty, the compiler applies `subDirectory: "{{ .capability }}"` automatically — each rendering capability's artifacts (Helm, Helm-chart, Compose, Terraform, CloudFormation) end up in its own sub-folder, preventing mixed-artifact collisions in downstream CI/CD tools. A `subDirectory: ""` written out is read exactly as an omitted one, so it takes this default too.
* **Flat override.** To disable sub-directories entirely (all artifacts directly under `directory`), set `subDirectory: "."`. A `subDirectory` template that evaluates to an empty string — `"{{ .parameters.sub }}"` with `sub` set to `""`, say — disables it as well.
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
          subDirectory: "." # not "", which takes the default
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

**Well-known annotations.** Beyond ad-hoc keys, the Aggrega standard library defines a set of well-known annotations under the `aggrega.ai/` and `feature.aggrega.ai/` namespaces, grouped into placement, networking, security, and observability categories. Authors adding annotations to a Release boundary should consult [providers/well-known-annotations.md](../providers/well-known-annotations.md) for the full matrix plus per-provider consumption rules — the page documents which providers apply each well-known key and what behaviour they emit when the key is present.

## Per-edge connection configuration

A boundary component may carry a `uses:` block that configures or wires the topology edges within the sockets the Component's catalog `usesSchema` declares. This is the operator's per-connection surface, bounded so the developer keeps ownership of the architecture they authored:

* **Configure an existing edge.** Set per-edge `infra` on an edge the developer already declared. The entry names the developer's alias and supplies `infra`; it either names the same target the developer wired or omits the target. The `infra` is validated against the socket's `infraSchema`.
* **Wire an unbound socket.** Create an edge into a socket the Component's `usesSchema` declares but the developer left unwired, pointing at an existing component. The created edge may also carry per-edge `infra`.
* **Attach on a connection.** Carry attachments under the entry's `features:`, keyed by a slot the socket declares in its `featuresSchema` — the same slots the developer's connection entry fills. Each carries `type`, an optional `description`, and `infra`, and never `values`. Under a slot the developer already filled on the same connection, the entry sizes that attachment: write `infra` only, since the type and the values come from the Aggregate (a `type` written here must agree with the Aggregate's, or the build halts at this entry, naming both). Under a slot the developer left empty, the attachment is the Release's own and `type` is required. Either way the fill is held to the slot's `selector`, and counts toward a `required` slot, exactly as the developer's is.

The surface is **create-not-retarget**: a Release may add an edge into an unbound socket, but it may not redirect an edge the developer already declared. A per-edge entry that names a *different* target than the developer's edge halts the build; an entry that names the *same* target (or omits it) configures that edge. The Release also may not declare `values` on an edge or on an attachment it writes there (developer-facing values stay in the Aggregate), bind a socket the `usesSchema` does not declare, or point an edge at a component that does not exist — each is a fatal halt. So is an entry setting `infra` or `features` on a connection that does not exist once every edge is drawn, unless the consuming component is switched off with `active: false`. See [errors/fatal-halts.md](../errors/fatal-halts.md) §"When building the topology".

Three more halts keep a connection's attachments on their connection:

* **A name the socket declares no slot for** halts, exactly as it does on the Aggregate's connection entry, at this entry in the Release, naming the slots the socket declares and any of them the name is one edit from.
* **An attachment only the Release makes, written with no `type`,** halts at the connection entry, naming the slot. An attachment the Release makes carries no `values`, so it suits a Feature whose `values` require nothing; one whose schema requires a value halts on the missing value at the same entry. The standard library's credential Features that carry a caller's locator require none in `values`: each takes it in `infra` as well (see below).
* **The composed name written anywhere but the connection** halts. A connection attachment becomes an attachment of the consuming component named `<alias>.<slot>` (see [the Aggregate's connection entry](aggregate.md#a-connections-own-attachments-features-on-a-uses-entry)), and both a component entry's own `features:` keys and a boundary's admit a dot. A component entry writing that name, or a boundary writing it so that it reaches a component whose connection carries it — a component placed in that boundary or in one nested inside it, a routed sub-module's included — halts naming both spellings, once for each component it reaches. A socket's slot is filled on each connection and never by an attachment cascading from a broader scope.

```yaml
spec:
  components:
    router:
      uses:
        models:
          # Size the attachment the Aggregate declared on the "gpt" connection: infra only.
          gpt:
            features:
              credential:
                infra: { rotation: hourly }
          # Attach on a connection the developer left without one: the type is required.
          plain:
            features:
              credential:
                type: core/generated-secret
```

**A credential on a connection the Release wires names its secret in `infra`.** A connection the Release wires has no entry in the Aggregate, so nothing there writes the credential's `values`, and the Release writes `values` nowhere. Each standard-library credential Feature that carries a caller's locator — `core/referenced-secret`, `core/referenced-secret-set`, `core/secret-value` and `core/secret-provided` — therefore accepts it in `infra` as well as in `values`: `origin`, or `entries` for `core/referenced-secret-set`, with the same shape and the same `sensitive: true` declaration in both pillars. Every realization reads whichever pillar carries it.

```yaml
spec:
  components:
    router:
      uses:
        models:
          gpt:
            target: gpt                     # wire the socket the developer left unbound
            features:
              credential:
                type: core/referenced-secret
                infra:
                  origin: openai-team-a     # the secret the operator names
```

The locator is written in exactly one pillar per attachment. An attachment that carries it in both — the Aggregate's `values` and the Release's `infra` for the same slot — or in neither halts at the Feature's own assertion (`E0033`), naming the Feature, the attachment and the component, and saying which of the two it was. The rule belongs to those Features' catalog entities, not to the compiler, which evaluates their assertion as it evaluates any Feature's. Fields other than the locator keep their pillar: `key` stays a `values` leaf, so an attachment only the Release makes reads the Feature's default data key, `value`. The `values:` ban is unchanged — the operator's locator is `infra`.

`core/secret-provided` is the one that does not fit a connection: it publishes its value for the attachment's own `inject:` block to deliver, and a connection's attachment carries no `inject:` block in either document, so on a connection no `inject:` block delivers it. Use `core/referenced-secret` or `core/secret-value` there.

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

The resolved per-edge `infra` flows into the *consuming* component's render context at `.context.uses.<alias>.infra.<key>`; it never appears in the target component's context, so a target's rendered output is invariant with respect to the consumers that configure edges into it. An attachment on a connection lands on the consuming component too, as one of its attachments: its `infra` merges with the Aggregate's `values` for the same slot, and its FeatureRecipe renders against both. The consuming component's Recipe reads it under its connection, at `.context.uses.<alias>.features.<slot>`, and its Workload delivers it by naming the connection beside the slot — see [Delivering a credential a connection carries](workload.md#delivering-a-credential-a-connection-carries).

## The `aggregates:` field — routing nested sub-modules into boundaries

When the Aggregate declares nested sub-modules via `spec.aggregates:`, the Release decides which boundary each sub-module's components land in by declaring `aggregates:` alongside `components:` inside the target boundary:

```yaml
# Aggregate declares two sub-aggregates
apiVersion: aggrega.ai/v1alpha1
kind: Aggregate
metadata:
  name: platform
  version: 1.0.0
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
  version: 1.0.0
  environment: production
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

Place every sub-aggregate listed under `Aggregate.spec.aggregates:` in exactly one boundary.

Routing places components. Every component of a routed sub-module lands in the boundary that routes it and takes that boundary's `directory`, `subDirectory`, `syncWave` and annotation cascade — the same context a component named directly under `components:` receives, including the `aggrega.ai/boundary-path` provenance stamped on the emitted artifacts. Routing a sub-module and addressing each of its components by qualified dotted path with an empty body therefore produce identical artifacts; routing is the shorter way to say it, and the only way to say it without knowing the sub-module's contents.

A component belongs to exactly one boundary, and the build halts when a document places one twice — the same sub-module routed into two boundaries, a sub-module routed into one boundary while one of its components is named in another, or a component named both directly and through a routing entry. The diagnostic names both sites, because which one to keep is the author's decision. Routing a sub-module into a boundary and naming one of its components under that *same* boundary is not a conflict: the routing places the component and the named entry configures it.

**A sub-aggregate the Release places nowhere halts the build.** Placement is read across both spellings, so the build halts only when *neither* reaches the sub-module: no boundary routes it under `aggregates:`, and no boundary names any of its components under `components:` by qualified dotted path. Either spelling on its own places it, and a sub-module whose components are all named individually needs no routing entry. The fix belongs in the `aggregates:` block of the Aggregate that imported the sub-module — the Aggregate the Release deploys, for one it imports directly, and the importing sub-module's own document for a nested one. The diagnostic names that entry by the key the importing document spells it with, so for a nested sub-module it reads as the local name rather than the dotted path.

Two cases deliberately do not halt. A sub-module contributing no components has nothing to place. A sub-module whose `active:` toggle resolves to `false` was never composed, so none of its components exist to be placed.

Partial placement does not halt *this* rule: a sub-module is placed once any of its components reaches a boundary, so naming one of them satisfies the sub-module. It does not follow that the rest may be left out. Each component the boundary did not name is then placed by nothing, and the component rule below reports it at its own key — so a partly placed sub-module halts the build once per component it left behind, not at the sub-module. The two spellings that place a whole sub-module in one line are the routing entry and naming every component; anything between them places what it names and no more.

**A component the Release places nowhere halts the build too, one level in.** The rule above asks whether a sub-module reached a boundary; this asks the same of every component the composition holds. A component reaches a boundary by being named under that boundary's `components:`, or by sitting inside a sub-module a boundary routes in. One reaching neither renders outside every boundary the Release declares, taking its `directory`, `subDirectory`, `syncWave`, annotation cascade and per-component `infra:` from nowhere — so the build stops and names the component rather than emitting artifacts the boundary configuration never reached.

The two rules divide the ground by asking about the component's sub-module, not merely by asking whether it has one. A component of a sub-module the Release placed **nowhere** is left to the sub-module rule, which reports that one authoring fault once at the `aggregates:` entry rather than once per component the module holds. A component of a sub-module the Release placed **in part** is this rule's, because the sub-module rule reads such a module as placed and says nothing about it — so each component the boundary did not name is reported here, at its own key inside the document that declares it. Placing a sub-module in part therefore names exactly what you meant to name, and tells you about each component you did not.

**And a boundary entry naming a component the deployed Aggregate does not hold halts the build.** The two rules above read placement from the component's side — did anything place it. This reads it from the Release's side: does the name resolve. An entry that resolves to nothing places nothing, so its `subDirectory`, annotations, per-component `infra:` and `uses:` configure a component that is not there, and the build stops rather than emitting a deployment the entry never reached. Both spellings are checked: a name under a boundary's `components:` is read as the id the component carries once composition is complete, and a name under a routing entry's `components:` is read as the local name it carries inside that sub-module. The diagnostic reports the id the entry addressed, which on the routed spelling is not the name in the file — the file spells the local half and the sub-module supplies its prefix.

A name is refused for resolving to nothing and never for its shape: a dotted name is ordinary, because a component one module in carries that module's prefix. A component whose `active:` toggle resolves to `false` stays nameable — switching a component off does not require editing the Release that configures it.

**A subsystem contributes nothing to the qualified path, so a boundary addresses a component by its bare name however the Aggregate groups it.** Only sub-module composition qualifies an id. A component of the deployed Aggregate is `store` whether the author wrote it at the top level or inside a subsystem named `data`; a component one module in is `data.store`, and the `data` there is the module's prefix rather than any subsystem's. So a boundary entry spelled `data.store` for a component sitting in a *subsystem* named `data` addresses nothing: the entry itself halts under the rule above, and the component it was meant for reaches no boundary either. Correcting the entry to `store` resolves both.

Placing a sub-module therefore requires `boundaries:`. The single-scope form has no routing surface — `aggregates:` is a key of a boundary, not of `spec:` — and the top-level `components:` map accepts only unqualified names, so a Release deploying an Aggregate that imports sub-modules declares `boundaries:`.

**Recursive routing.** `aggregates:` is recursive — each entry under a boundary's `aggregates:` may itself declare a nested `aggregates:` map for deeply-nested module composition.

**Per-aggregate routing block.** A routing entry accepts exactly two keys and nothing else: `components:`, to configure individual components of that sub-module, and a nested `aggregates:` for modules nested deeper. `annotations:` belongs to the boundary, and per-component `infra:` belongs to an entry under the routing entry's own `components:`.

Inside a routing entry a component is keyed by the name it carries **inside its sub-module** — `consumer`, not `data.consumer` — because that is the only name it has there. The qualified dotted path is how a boundary's own `components:` map addresses the same component; the two spellings are not interchangeable, and a routing entry rejects a dotted key.

```yaml
  boundaries:
    eu-prod:
      directory: "deploy/eu-prod"
      annotations:
        aggrega.ai/namespace: "finance-zone"
      aggregates:
        finance:
          components:
            ledger:                 # the component's name inside the finance module
              infra:
                replicas: 3
          aggregates:
            reporting: {}           # a module nested inside finance
```

The sub-aggregate's own components and Features are not redeclared at the Release — the Release routes them rather than restating them, and names one only in order to configure it.

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

**Per-provider emission.** The compiler emits the boundary's wave value into rendered output in provider-native form. Three of the shapes are worked through below; what the wave does on **every** standard-library provider, `terraform` included, is tabulated at [`providers/reference-matrix.md`](../providers/reference-matrix.md) "What a boundary's `syncWave` does on each provider".

* **Kubernetes (helm / helm-chart provider).** Every Kubernetes resource the helm provider renders for the boundary carries the GitOps-standard `argocd.argoproj.io/sync-wave: "<N>"` annotation; Helm hooks additionally carry the `helm.sh/hook-weight: "<N>"` annotation so the same wave value drives Helm's own pre/post-install ordering. ArgoCD, Flux, and Helm read these annotations natively and order resource application accordingly. The helm-chart provider copies a source chart's templates as their author wrote them, so a sub-chart's own resources carry the wave only where those templates write it; an `$import:`-loaded artifact it adds carries `argocd.argoproj.io/sync-wave` and no `helm.sh/hook-weight` (see [`providers/helm-chart.md`](../providers/helm-chart.md)).
* **Compose.** Every service in the compose file a boundary renders into waits, through `depends_on`, on the services of the immediately-preceding wave that contributed to the same file — gated on the target's health where the target declares a `healthcheck`, and on its start where it does not. So the wave orders the services of one file and nothing outside it: boundaries that render into separate `docker-compose.yaml` files are separate compose projects, and sequencing those is the operator's concern. `uses:` edges continue to express per-edge ordering alongside the wave. See [`providers/compose.md`](../providers/compose.md#deployment-wave-ordering).
* **CloudFormation.** Every resource in the assembled stack template depends, through `DependsOn`, on the resources of the immediately-preceding wave that contributed to the same stack — so the wave fixes the order resources are created in and, in reverse, the order they are deleted in. It is not readiness ordering: a stack template has no notion of a resource being serviceable. A fragment's own `DependsOn` is extended rather than replaced. Components that assemble into a different stack are out of reach, and sequencing two stacks is the operator's concern. See [`providers/cloudformation.md`](../providers/cloudformation.md#deployment-ordering).

**Wave-authoring vs deployable unit.** The boundary is the wave-authoring unit. The deployable unit is whichever assembly path the components emit into — by default 1:1 with the boundary, but two sibling boundaries that share a `directory:` collapse into one assembled output (one `Chart.yaml`, one `docker-compose.yaml`). When that happens, the assembled output may carry resources from multiple waves; an ArgoCD Application reading the rendered chart sees per-resource `sync-wave` annotations and orders application accordingly within the Application. Cross-Application sequencing across paths is the operator's CI concern.

**Use cases.** Wave ordering matters whenever startup of one boundary depends on another's prior completion. Canonical pattern: an `infra` boundary at wave 0 (VPC + database), a `migrations` boundary at wave 1 (schema-migration job), and an `apps` boundary at wave 2 (the application that consumes the migrated schema). Without explicit waves, all three deploy concurrently and the application crash-loops while waiting for the migration to complete.

For the full architectural framing — the DAG execution model, the rationale for placing temporal sequencing on the Release rather than the Aggregate, and the wave-authoring vs deployable-unit distinction — see [`architecture/12-day-two-lifecycles.md` §1](../../architecture/12-day-two-lifecycles.md).

## Feature Attachment

The Release can attach Features both at boundary scope (broad policy) and at component-specific scope (precise targeting), with execution following the 5-Tier Onion Model defined in [architecture/10-compilation-pipeline.md](../../architecture/10-compilation-pipeline.md). Features declared in the Release contribute `type`, `infra`, and `uses`; they cannot declare `values` (see Schema-Level Constraints above).

A Feature attached at a boundary is keyed by an instance name you choose, and that name cannot be `.` or `..`. On a provider that gives each contributor a directory of its own — terraform, under `modules/`, and helm-chart, under `charts/` — a boundary-level Feature's files are written in a directory named for the instance alone, and neither of those names is a directory of its own: the build stops, naming the Release, the boundary and the instance. A name that merely contains dots, such as `audit.v2`, is an ordinary name.

`features:` is the Release's only attachment surface, at both scopes — as it is the Aggregate's. A credential is a Feature carrying the `feature.aggrega.ai/kind: secret` label, so an Operator-attached credential is attached under `features:` like any other Feature, and names its secret in `infra` exactly as one on a connection does (see [Per-edge connection configuration](#per-edge-connection-configuration)) — on a component the Aggregate left without one, or as the sizing of an attachment the Aggregate declared without naming a secret. There is no second attachment keyword at any scope; a document that declares one is rejected at load with an envelope error naming the unexpected property.

A feature attached boundary-wide may carry a `uses:` block, and that block projects to every component routed into the boundary: each component gains a dependency edge to the feature's named targets and is injected those targets' `provides`. This expresses a shared dependency once at the boundary — "every component in this boundary talks to the shared cache / collector / message bus" — rather than repeating the same `uses:` edge on each component. A subsystem-level Feature attachment in the Aggregate projects its `uses:` the same way across the subsystem's components. `uses` is a topology wiring declaration, not a value, so it is permitted on the Release. The projection is independent of the attached Feature's execution scope: a Feature whose FeatureRecipe renders once per boundary still projects its `uses:` per component, while the shared resource itself renders once.

A feature attached to a single component carries the same `uses:` block and wires the same edge from that one component: the component gains a dependency edge to each named target, is injected those targets' `provides`, and the edge records the attachment as its origin exactly as the boundary-wide form does. The two are one declaration at two breadths — attach at the boundary to wire every component in it, attach on a component to wire that one — and the choice between them is a matter of reach, never of what the wiring does. Neither creates compute: the target must already name a component the Aggregate declared, and one that does not halts the build. A connection a Feature draws carries no attachments of its own: its entry takes `target` and `inject`, and a `features:` key there is refused when the Release loads.

```yaml
boundaries:
  cluster:
    directory: ./dist/cluster
    components:
      api:
        features:
          shared_backend:
            type: core/shared-backend
            uses:
              backend:
                primary:
                  target: db          # a component of the assembled graph
                  inject:
                    env:
                      - in: DB_HOST
                        from: host    # db's `host` provides reaches api as DB_HOST
      db: {}
```

**How a target is spelled.** An edge target names a component of the assembled graph, so it is written with the qualified dotted path — `data.store`, not `store` — whenever the target belongs to a routed sub-module. That holds even where the attachment itself sits under a routing entry, whose `components:` keys are module-local: the key says *which component the attachment is on* and the target says *which component the edge reaches*, and only the second is a graph-wide name. A target written with a module-local name matches no component and halts with the same diagnostic any dangling edge produces.

## Composite Release and `extends:` inheritance

A Release may declare `spec.extends:` pointing at a base Release whose authoring surface it inherits.

**The reference is a path to a file beside the declaring Release** — `./base-release.yaml`, or `../shared/base-release.yaml`. A Release is deployment-side and is not catalog-indexed, so an `extends:` reference never resolves through the catalog. The relative path is the **only** form it accepts: a reference written as a registry coordinate is refused, and so is a bare name, each with the relative-path form named in the diagnostic. A Manifest's `extends:` is the near neighbour that reads differently — it takes a relative path *or* the bare `metadata.name` of a Manifest beside the Release — so the two forms are not interchangeable, and a bare name that would resolve on a Manifest does not resolve here. Each link of a chain is read the same way: a parent Release kept in another directory names its own parent by a path beside itself, wherever the Release you named sits, exactly as its parameters `$import:` is resolved beside it. The path must lead to a Release inside the workspace, as every path a Release writes must — or, for a Release named outside the workspace, inside the directory holding that Release, which every link of its chain is held to: one that climbs out, or that a link carries out, is refused before the file it names is read.

The compiler follows the chain when the Release is loaded — refusing a chain that returns to a file already in it, one that runs past the depth bound, and a reference that names nothing — and then folds the chain into a single resolved Release.

**What you inherit, you may replace key by key.** Your value wins, all the way down, until you reach a value that is one indivisible thing — a scalar, a list, a template — which you take or replace whole. You remove something you inherited by writing it `null`. This is the same rule an extending Component, Feature and Manifest follow, so an author who has met one has met all of them.

Applied to a Release: `boundaries` compose per boundary name and a boundary per key, `components` per component name, `infra` deep, `features` per instance name and then per pillar; a component's `uses` per socket and then per connection, where a `target` the child writes replaces the inherited one, the connection's `infra` composes key by key, and its `features` compose per slot and then per pillar by the same rule a component's own `features` follow; `directory`, `subDirectory`, `syncWave` and the Aggregate and Manifest pointers are scalars that replace.

Two things do not travel:

* **Identity and provenance.** No `metadata` field is inherited. `metadata.environment` is the one to know about: it is required of every Release and is per-Release by nature, so a child renders with its own environment in its provenance labels rather than its parent's.
* **The Aggregate pointer is inherited rather than overridable.** The child cannot declare `aggregate:` — the schema refuses `extends:` and `aggregate:` in one document — so a child deploys the same Developer Intent as its base.

The child may omit `manifest:`, inheriting its base's, or override it for Late Binding.

**One routing shape across the chain.** `boundaries:` and `components:` are mutually exclusive within a single Release, and that holds across a chain too: a base declaring named boundaries and a child declaring top-level components is refused, and the diagnostic names both files and both keys. Choose one routing shape and use it the whole way down.

**The local-development bridge pattern.** The canonical use case is a developer running their team's production Aggregate locally without forking the Aggregate or duplicating the boundary topology. The team publishes a production Release; a local Release `extends:` it and overrides only the Manifest pointer, swapping cloud-targeted Recipes for local equivalents:

```yaml
# production Release (committed; the source of truth for prod deployments)
apiVersion: aggrega.ai/v1alpha1
kind: Release
metadata:
  name: prod-release
  environment: production
  version: "1.0.0"
spec:
  aggregate: my-app
  manifest: prod-manifest
  parameters:
    region: us-east-1
    db_size: 100Gi
    out_dir: prod
  boundaries:
    prod:
      # A directory is a TEMPLATE, not a fixed path. Writing it against a
      # parameter is what lets a child render somewhere else without
      # restating the boundary topology.
      directory: deploy/{{ .parameters.out_dir }}
      components:
        api: { infra: { replicas: 5 } }
        db: {}

---
# Local Release (developer-side; inherits everything, swaps the Manifest)
apiVersion: aggrega.ai/v1alpha1
kind: Release
metadata:
  name: local-release
  environment: local
  version: "1.0.0"
spec:
  extends: ./prod-release.yaml
  manifest: local-manifest    # surgically overrides for local
  parameters:
    region: dev-local
    db_size: 1Gi
    out_dir: local            # the inherited directory resolves here instead
```

`local-release` inherits its base's boundary topology, Feature attachments and component overrides; the developer keeps one `local-release.yaml` and runs `aggrega build --release local-release.yaml` with no production configuration duplicated.

**Write `directory:` against a parameter.** Because a directory is inherited like any other scalar, a child that inherits a directory carrying no template variable renders into the same path its base renders into, and no command-line option redirects it. That is legitimate when it is what you meant — swapping only the Recipes to compare their output, say — so the build reports it and continues rather than refusing. Writing the directory against a parameter, as above, keeps the topology in one place and still sends each Release's output somewhere of its own.

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

Each child sees its base's inherited parameters merged with its own. Map-valued parameters deep-merge with child-key wins; scalar-valued parameters child-replace; a key a child writes as `null` is removed rather than set to nothing.

**A base may import its parameters and a child may still override individual keys.** The two authoring modes described under `parameters:` above — inline, or a single `$import:` — are a rule about one document, not about a chain: each Release along the chain declares one mode or the other, and each one's import is resolved against the directory holding that Release before the chain is folded. So a base importing a shared file and a child writing a few keys inline compose per key, exactly as two inline blocks would:

```yaml
# base-release.yaml — parameters arrive from a shared file beside it
spec:
  aggregate: my-app
  parameters:
    $import: ./shared-params.yaml      # tier: prod, region: eu

---
# local-release.yaml — overrides one key, inherits the rest
spec:
  extends: ./base-release.yaml
  manifest: local-manifest
  parameters:
    tier: local                        # region stays eu, from the imported file
```

**Error modes.** Cyclic `extends:` chains, missing parent pointers, and child-side `aggregate:` declarations all halt workspace load with explicit diagnostics naming the offending Release and the schema-level violation. See [errors/fatal-halts.md](../errors/fatal-halts.md) for the per-error message shapes.
