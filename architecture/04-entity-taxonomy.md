# The Entity Taxonomy

Aggrega's architecture is organized into four domains, each owned by a different persona and housing specific entity kinds, plus a Tier 3 library layer — the third tier of the Language Reference's [entity tier model](../language-reference/README.md#entity-tier-model) — that holds reusable schema, mapping, workload, and artifact content. The diagram below shows the entities and their relationships across the four domains plus the Tier 3 libraries. Detailed authoring surfaces (fields, schemas, examples) for each entity live in the [Language Reference entities catalog](../language-reference/03-entities.md).

~~~mermaid
%%{
  init: {
    'theme': 'base',
    'themeVariables': {
      'fontSize': '25px',
      'fontFamily': 'sans-serif',
      'primaryTextColor': '#111',
      'edgeLabelBackground': '#ffffff',
      'clusterBkg': '#fafafa',
      'clusterBorder': '#cccccc'
    }
  }
}%%
graph LR
    classDef domain fill:transparent,stroke:#cccccc,stroke-width:2px,font-weight:bold,font-style:italic,font-size:34px,color:#444;
    classDef role fill:transparent,stroke:none,font-weight:bold,font-style:italic,font-size:30px,color:#444;
    classDef baseNode fill:#eef2ff,stroke:#818cf8,stroke-width:2px,font-size:25px,color:#000;

    subgraph Dom1 ["Domain 1: Developer Intent"]
        P1["Developer"]:::role
        A["Aggregate<br/>The 'What'"]:::baseNode
        P1 ~~~ A
    end

    subgraph Dom2 ["Domain 2: Platform Catalog"]
        P2["Platform Architect"]:::role
        CC["Component<br/>The Compute Interface"]:::baseNode
        CapC["Feature<br/>The Operational Trait<br/>(plus Credential Features<br/>via feature.aggrega.ai/kind: secret label)"]:::baseNode
        P2 ~~~ CC
        CC ~~~ CapC
    end

    subgraph Dom4 ["Domain 4: Routing & Policy"]
        P4["Platform Operator / DevOps"]:::role
        EB["Release<br/>The Deployment Router"]:::baseNode
        ENV["Manifest<br/>The Dependency Lockfile"]:::baseNode
        P4 ~~~ EB
        EB ~~~ ENV
    end

    subgraph Dom3 ["Domain 3: Infrastructure Base"]
        P3["Infrastructure Engineer / Ops"]:::role
        CD["Recipe<br/>The Implementation"]:::baseNode
        CapD["FeatureRecipe<br/>The Binding<br/>(operational + credential)"]:::baseNode
        T["Plugin<br/>Wasm Rendering /<br/>Pipeline / Linter Plugin"]:::baseNode
        P3 ~~~ CD
        CD ~~~ CapD
        CapD ~~~ T
    end

    subgraph DL ["Tier 3: Libraries"]
        SL["SchemaLibrary<br/>Reusable JSON Schema 2020-12 Definitions"]:::baseNode
        ML["MappingLibrary<br/>Reusable Go Template Fragments"]:::baseNode
        WL["WorkloadLibrary<br/>Reusable Workload Template Fragments"]:::baseNode
        AL["ArtifactLibrary<br/>Reusable Named Artifact Bundles"]:::baseNode
        SL ~~~ ML
        ML ~~~ WL
        WL ~~~ AL
    end

    %% Logical Flow Connections
    A -.->|"Requests"| CC
    A -.->|"Attaches — application intent, values<br/>(features: — one pillar, every family)"| CapC
    A -->|"Binds via"| EB
    EB -.->|"Attaches — operations, infra"| CapC

    CC -.->|"Resolved to"| CD
    CapC -.->|"Resolved to"| CapD

    EB -->|"Uses"| ENV

    ENV -->|"Resolves Interfaces to"| CD
    ENV -->|"Resolves Interfaces to"| CapD

    EB -->|"Renders via"| T

    %% Library references (Tier 3 — opt-in for catalogs needing cross-Component reuse)
    CC -.->|"$ref: &lt;Library&gt;#/schemas/&lt;name&gt;"| SL
    CapC -.->|"$ref"| SL
    CD -.->|"valuesMapping: { $import: &lt;Library&gt;#/mappings/&lt;name&gt; }"| ML
    CapD -.->|"$import"| ML
    CD -.->|"workload: { $import: &lt;Library&gt;#/workloads/&lt;entry&gt; }"| WL
    CD -.->|"artifacts.&lt;name&gt;: { $import: &lt;Library&gt;#/artifacts/&lt;name&gt; }"| AL
    CapD -.->|"$import"| AL

    %% Apply the domain class to the subgraphs
    class Dom1,Dom2,Dom3,Dom4,DL domain;
~~~

The corpus spans four domains plus the Tier 3 library layer:

| # | Entity | Domain | Role |
|---|---|---|---|
| 1 | Aggregate | Domain 1 — Developer Intent | Application topology blueprint |
| 2 | Component | Domain 2 — Platform Catalog | Abstract compute-node interface |
| 3 | Feature | Domain 2 — Platform Catalog | Operational trait (including credential Features) |
| 4 | Recipe | Domain 3 — Infrastructure Base | Component implementation, per provider |
| 5 | FeatureRecipe | Domain 3 — Infrastructure Base | Feature implementation, per provider |
| 6 | Plugin | Domain 3 — Infrastructure Base | Content-addressed WebAssembly plugin (provider rendering, pipeline steps, linting) |
| 7 | Manifest | Domain 4 — Routing & Policy | Dependency lockfile mapping interfaces to Recipes |
| 8 | Release | Domain 4 — Routing & Policy | Deployment router binding Aggregate to Manifest |
| 9 | SchemaLibrary | Tier 3 — Libraries | Reusable JSON Schema 2020-12 definitions |
| 10 | MappingLibrary | Tier 3 — Libraries | Reusable Go template fragments |
| 11 | WorkloadLibrary | Tier 3 — Libraries | Reusable Workload template fragments |
| 12 | ArtifactLibrary | Tier 3 — Libraries | Reusable named artifact bundles |

That table is the whole set of authoring entity kinds — the kinds an author declares in a `kind:` field. The Workload kind is platform-owned content embedded inside a Recipe's synthesized input rather than a standalone catalog entity (see chapter 16), so it is deliberately absent from the table above.

The Plugin is a first-class authoring entity — its own kind, JSON Schema, and catalog directory — owned by Platform Ops in Domain 3. A Plugin is a content-addressed reference to a WebAssembly artifact, declaring the one socket type it implements. The taxonomy has seven members: `provider` (rendering IR nodes into provider-native artifacts), `linter` (raising diagnostics on authored content), `pipeline-step` (a feature-recipe-pipeline step), `governance` (serving a governance role — transforming labels or annotations, or returning an accept/reject verdict over the IR graph or the rendered artifacts), `cli` (contributing an `aggrega` subcommand an operator invokes at the command line), `parser` (turning a foreign source text into a canonical structured tree), and `importer` (turning a foreign infrastructure or agent-definition source into draft Aggrega authoring files). A provider-rendering Plugin (`pluginType: provider`) is the unit that serves provider rendering: it declares the provider name(s) it renders in `spec.provider.capabilities` and carries the rest of its provider-socket metadata in that same `spec.provider` block. The compiler pins and routes the reference; the WebAssembly runtime executes the bytes; the compiler does not interpret what the plugin does — the plugin is the transport for the domain-specific intelligence that lives in WebAssembly. Its authoring and metadata surface is documented at [language-reference/entities/plugin.md](../language-reference/entities/plugin.md).

## Domain 1: Developer Intent (The "What")

* **Role:** The Developer. Focuses purely on AI architecture, cognitive loops, and application survival requirements. They need no knowledge of CEL, OPA, or physical ports.
* **1. Aggregate:** The map-based declarative blueprint of the application topology. Serving as either the root application or a parameterized, reusable module, it defines logical `components` and attaches, under `features`, the Features whose behaviour is application intent, with their `values`; a Feature whose inputs are all operational is attached by the operator in the Release instead (see Domain 4). A credential is requested on that same `features` attachment surface, through a credential Feature — there is no separate block for one. It defines abstract capacity requirements via `parameters` (typed contracts authored in the compact-form vocabulary) and payload state via `values`. Component instances support an optional `description` field for documentation and Studio rendering. It promotes the "Zero-Port" convention (abstracting network ports unless explicitly required by legacy code) with no target platform or namespace hardcoded.

## Domain 2: Platform Catalog (The "Interfaces & Intelligence")

* **Role:** The Platform Architect. The "Programmer" of the platform. They place each component on the operational ontology, author the programmable policies (Wasm mutators and validators), and establish the semantic duck-typing labels.
* **2. Component:** The abstract interface for a compute node. It declares its base shape via the operational cloud ontology (e.g., `component.aggrega.ai/type: server`), and layers its cognitive identity via duck-typing labels (e.g., `model.aggrega.ai/capability: generative`). It declares credential slots via `featuresSchema` (required/optional, blackbox/transparent) and uses `schema:` (JSON Schema 2020-12, typically authored via the compact-form shorthand) to strictly validate the developer's opaque `values` block.
* **3. Feature:** A modular operational trait (e.g., Data Masking, DNS Routing, Secret Management). It uses `appliesTo` label selectors to dynamically bind to specific semantic labels. Like Components, it declares credential slots via `featuresSchema` to enforce API key provisioning. Crucially, it uses `metadata.annotations` to explicitly tag elements in the flat IR Graph, which informs downstream Wasm policy validators and rendering plugins how to handle the Feature's configuration payload.
  * **Credential Features:** The platform unifies credential management into the Feature entity: a Feature with the label `feature.aggrega.ai/kind: secret` is a credential feature — it defines a query interface onto a secret store (e.g., AWS Secrets Manager, HashiCorp Vault). It is attached under `features:` like any other Feature, on the same surface and in the same shape; the label is metadata the catalog carries to describe what the attachment produces, and no compiler branch reads it. There is no separate secret-store or secret-recipe kind: a credential FeatureRecipe has the same shape as any other FeatureRecipe, the fetch-then-deliver pipeline is the same for both, and the `inject` delivery contract (`env`, `file`, `arg`) is shared. One entity, one attachment keyword, one modifier execution path through rendering — and credentials map under `features.type` in the Manifest.

**Ontology as label.** The operational cloud ontology is declared in `metadata.labels["component.aggrega.ai/type"]` rather than as a top-level `spec.type` field. This choice lets the compiler's label-selector engine target ontology values directly — a Feature declares `appliesTo: "component.aggrega.ai/type in (server, worker)"` to dynamically attach to every server or worker component without any new Go logic in the core compiler. The same selector machinery applies to every Aggrega label, so a Feature, a socket selector, or a Release boundary mapping reads a catalog's own label key exactly as it reads this one.

`component.aggrega.ai/type` is Aggrega's key, and its value set is closed: the published Component schema enumerates the primitives, and a document carrying anything else is refused when it loads, with `E0215` naming the label and listing what it accepts. A catalog needing a classification Aggrega does not define adds **its own label key** beside it — the Component schema accepts any further label key with a string value — so a new axis costs a key of your own and no compiler release, while the reserved key keeps one meaning everywhere. That is what makes a Feature written against `component.aggrega.ai/type in (stateful-server)` work against Components from authors who never met.

## Domain 3: Infrastructure Base (The "Implementations")

* **Role:** The Infrastructure Engineer / Ops. Owns the physical reality, network port assignment, and templating logic.
* **4. Recipe:** The multi-provider translation template (e.g., Helm or Docker Compose). It establishes a strict 1:1 API Contract with the catalog component via the `implements` keyword. The Recipe maps the developer's `.values` into the physical format. It hardcodes the physical network ports (e.g., `5432`) and reads the target's `provides` through the `.context.uses` pipe, satisfying the Injection Contract without hardcoding database names.
* **5. FeatureRecipe:** Explicitly maps a `Feature` to a concrete infrastructure implementation via the `implements` keyword. It mandates a target provider capability in `capability` (e.g., `helm`, `compose`). Because the platform unifies credential management into the Feature entity, FeatureRecipes handle both operational features (data masking, DNS routing, sidecar injection) and credential features (vault CRD generation, secret volume mounting). To support this full spectrum, it supports three distinct execution blocks:
  1. **`pipeline`:** A sequential array of WebAssembly (Wasm) plugins for Post-Render Workload Mutation (e.g., injecting an Envoy sidecar via JSONPatch, or mounting a secret volume).
  2. **`source` & `valuesMapping`, `workload`, `artifacts`:** The same three input kinds a Recipe carries, used for Resource Generation, allowing Ops to render static templates natively (e.g., generating a new `HTTPRoute` CRD or an `ExternalSecret` CRD) alongside the base component.
  3. **`injectMapping` (Pre-Render Interception):** A native Go template block executed *before* the Base Recipe renders. It outputs a JSON dictionary that the compiler natively deep-merges over the Caller's `.context.inject` memory pipe, allowing Wasm-free, Caller-Side mutation of environment variables and connection strings.
  * **The Credential FeatureRecipe Pattern:** When a FeatureRecipe implements a credential Feature (labeled `feature.aggrega.ai/kind: secret`), the standard Two-Part Plugin Principle applies: the `pipeline` chains a Fetcher plugin (generating the vault-specific CRD) followed by an Injector plugin (mounting the secret to the target container). The Fetcher/Injector split maximizes reusability — swapping from AWS Secrets Manager to HashiCorp Vault only requires replacing the Fetcher plugin; the Injector remains identical.
* **6. Plugin:** The content-addressed WebAssembly plugin. A provider-rendering Plugin (`pluginType: provider`) is the unit that turns a Recipe's input kinds into the final stringified file format: it declares the provider name(s) it serves in `spec.provider.capabilities` (e.g., `helm`), advertising a `render_node` export the compiler dispatches to, and carries the rest of its provider-socket metadata (`workloadSchema`, `wellKnownAnnotations`) in that same `spec.provider` block. The other socket types a Plugin may declare are `pipeline-step`, `linter`, `governance`, `cli`, `parser` and `importer`. The compiler routes the pinned reference; the WebAssembly runtime executes the bytes.

## Domain 4: Routing & Policy (The "Glue")

* **Role:** The Platform Operator / DevOps.
* **7. Manifest:** The dependency lockfile. It uses a flat URI mapping: a `components.type` dictionary maps catalog component types to Recipe URIs, and a `features.type` dictionary maps Feature types to FeatureRecipe URIs. Resolution is direct URI lookup against the lockfile + catalog; capability determination flows from each resolved Recipe's `spec.capability` field at build time. After resolution, every entity must have a mapping or the compiler halts. To maintain a DRY ecosystem, Manifests support a Kustomize-style composition pattern via an `extends` keyword, allowing environment-specific manifests (like local or staging) to cleanly inherit from a global base manifest and only declare their specific overrides.
* **8. Release:** The router. It binds an `aggregate` to a `manifest` and maps components to physical boundaries (e.g., `aws-eks-production`). To maintain a DRY workflow, Releases support inheritance via the `extends` keyword, allowing environment-specific releases to cleanly inherit from a global base release. It fulfills the abstract aggregate contract by injecting physical realities strictly into the `parameters` block, and injects physical sizing (like CPUs or ports) via the `infra` parallel namespace. To protect the Aggregate as the Single Source of Truth, the Release schema mechanically bans a `values:` block — Ops cannot declare `values` on any Component or Feature from a Release. Per-environment variation of developer-facing values flows through **Parameter Hoisting**: the Developer exposes a typed `parameters.*` field in the Aggregate, the Component's `values` template references it, and the Release fulfills the parameter for its environment. The rendered values differ across environments while the Aggregate — the authoring surface for *which* values exist and *how* they flow — remains the single source of truth. See Constraint 4, "Release Cannot Override Developer Values", under [Architectural Constraints and Recommended Patterns](06-data-taxonomy-and-composition.md#8-architectural-constraints-and-recommended-patterns) for the schema-level ban stated explicitly. Crucially, to prevent untraceable "aggregate-mutating" Releases, when a Release uses `extends`, declaring an `aggregate` is rejected by the Release schema (the schema constraint disallows declaring `aggregate` when `extends` is used). The child release must map to the exact same Developer Intent as its parent. The `manifest`, however, becomes optional, unlocking "Late Binding"—allowing Ops to inherit the entire physical topology but surgically swap the dependency lockfile.
  * **Feature attachment:** The Release attaches Features as well, under `features` on a boundary or on one component. A Feature whose inputs are all operational it attaches outright, with its `type` and `infra`; a Feature the Aggregate attached it sizes, writing that attachment's `infra` under the same name.

**Why split the Manifest from the Release.** Separating the software lockfile (Manifest) from the deployment router (Release) enables a shape the two entities could not produce alone: DevOps deploys a single application to multiple regional deployment routers — different Releases targeting different cloud regions, all referencing the same Manifest — without duplicating Recipe bindings across environments. Each regional Release carries its boundary layout and environment-specific parameters while consuming the same software lockfile the Manifest provides. Multi-region scaling follows from the domain separation, not from Manifest duplication.

## Tier 3: Libraries (Catalog Reuse)

* **Role:** The Platform Architect (same persona as Domain 2), but the role kicks in only when catalog content grows large enough to benefit from cross-Component schema reuse or cross-Recipe reuse of templates, workload shapes, or artifact bundles. Solo authors and small catalogs ship without any Tier 3 entities.
* **9. SchemaLibrary:** Reusable JSON Schema 2020-12 definitions. A library declares named schemas at `spec.schemas:` and optional parameterized helpers at `spec.templates:` (with `$params:` declarations and `$instantiate:` references for parametric reuse). Catalog entities consume library entries via the standard JSON Schema `$ref:` keyword pointing at the library entry by identity — the host-less `<library>#/schemas/<name>` form (the version comes from the lockfile, not the reference). PascalCase naming, OCI-distributed, lockfile-pinned. Opt-in for catalogs that need cross-Component schema reuse — common shapes like `PodResources`, `PersistenceSpec`, `NodePool`, `MetricsServiceMonitor` recur across every datastore Component and every workload Component, and SchemaLibrary entries factor that repetition out of per-Component authoring.
* **10. MappingLibrary:** Reusable Go template fragments. A library declares named templates at `spec.mappings:`. Recipes and FeatureRecipes consume library entries by identity via `valuesMapping: { $import: <library>#/mappings/<name> }`. Single authoring mode (Go templates only); no parallel Jsonnet authoring path. Opt-in for catalogs that need cross-Recipe mapping reuse — common patterns like Bitnami chart helper logic or shared pod-template patterns recur across every datastore Recipe targeting the same provider, and MappingLibrary entries factor that repetition out of per-Recipe authoring.
* **11. WorkloadLibrary:** Reusable Workload template fragments. A library declares named workload entries at `spec.workloads:`. A Recipe consumes an entry by identity via `workload: { $import: <library>#/workloads/<entry> }`, and the imported body validates against the platform-owned Workload schema exactly as an inline `workload:` block does — so a library-imported workload renders identically to the equivalent inline one. Single authoring mode (Go templates only). Opt-in for catalogs that need cross-Recipe workload reuse, where several Recipes share one deployment shape and only their values differ.
* **12. ArtifactLibrary:** Reusable named artifact bundles. A library declares named bundles at `spec.artifacts:`, each bundle grouping the output files that belong together — a CRD, its RBAC, and a ConfigMap, for instance — and imported as one unit. Recipes and FeatureRecipes consume a bundle by identity via `artifacts.<name>: { $import: <library>#/artifacts/<name> }`. Single authoring mode (Go templates only). Opt-in for catalogs that need cross-Recipe artifact reuse, where the same auxiliary resource set accompanies many Recipes.

Every library publishes via OCI, pins in the lockfile (the `schema_libraries:`, `mapping_libraries:`, `workload_libraries:`, and `artifact_libraries:` sections), and surfaces in the Hub UI with consumer awareness (which Components reference which library entries; which Recipes consume which library entries).
