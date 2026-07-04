# The Entity Taxonomy

Aggrega's architecture is organized into four domains, each owned by a different persona and housing specific entity kinds, plus a Tier 3 library layer that holds reusable schema and mapping content. The diagram below shows the entities and their relationships across the four domains plus the Tier 3 libraries. Detailed authoring surfaces (fields, schemas, examples) for each entity live in the [Language Reference entities catalog](../language-reference/entities/).

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

    subgraph D1 ["Domain 1: Developer Intent"]
        P1["Developer"]:::role
        A["Aggregate<br/>The 'What'"]:::baseNode
        P1 ~~~ A
    end

    subgraph D2 ["Domain 2: Platform Catalog"]
        P2["Platform Architect"]:::role
        CC["Component<br/>The Compute Interface"]:::baseNode
        CapC["Feature<br/>The Operational Trait<br/>(plus Credential Features<br/>via feature.aggrega.ai/kind: secret label)"]:::baseNode
        P2 ~~~ CC
        CC ~~~ CapC
    end

    subgraph D4 ["Domain 4: Routing & Policy"]
        P4["Platform Operator / DevOps"]:::role
        EB["Release<br/>The Deployment Router"]:::baseNode
        ENV["Manifest<br/>The Dependency Lockfile"]:::baseNode
        P4 ~~~ EB
        EB ~~~ ENV
    end

    subgraph D3 ["Domain 3: Infrastructure Base"]
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
        SL ~~~ ML
    end

    %% Logical Flow Connections
    A -.->|"Requests"| CC
    A -.->|"Attaches (features +<br/>credential features in secrets:)"| CapC
    A -->|"Binds via"| EB

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

    %% Apply the domain class to the subgraphs
    class D1,D2,D3,D4,DL domain;
~~~

The corpus carries ten entity kinds across four domains plus the Tier 3 library layer:

| # | Entity | Domain | Role |
|---|---|---|---|
| 1 | Aggregate | D1 — Developer Intent | Application topology blueprint |
| 2 | Component | D2 — Platform Catalog | Abstract compute-node interface |
| 3 | Feature | D2 — Platform Catalog | Operational trait (including credential Features) |
| 4 | Recipe | D3 — Infrastructure Base | Component implementation, per provider |
| 5 | FeatureRecipe | D3 — Infrastructure Base | Feature implementation, per provider |
| 6 | Plugin | D3 — Infrastructure Base | Content-addressed WebAssembly plugin (provider rendering, pipeline steps, linting) |
| 7 | Manifest | D4 — Routing & Policy | Dependency lockfile mapping interfaces to Recipes |
| 8 | Release | D4 — Routing & Policy | Deployment router binding Aggregate to Manifest |
| 9 | SchemaLibrary | Tier 3 — Libraries | Reusable JSON Schema 2020-12 definitions |
| 10 | MappingLibrary | Tier 3 — Libraries | Reusable Go template fragments |

The Workload kind is platform-owned content embedded inside a Recipe's synthesized input rather than a standalone catalog entity (see chapter 16).

The Plugin is a first-class authoring entity — its own kind, JSON Schema, and catalog directory — owned by Platform Ops in Domain 3. A Plugin is a content-addressed reference to a WebAssembly artifact, declaring the socket type it implements: `provider` (rendering IR nodes into provider-native artifacts), `linter` (raising diagnostics on authored content), or `frp_step` (a feature-recipe-pipeline step). A provider-rendering Plugin (`pluginType: provider`) is the unit that serves provider rendering: it declares the provider name(s) it renders in `compatibleProviders` and carries its provider-socket metadata in `spec.provider`. The compiler pins and routes the reference; the WebAssembly runtime executes the bytes; the compiler is blind to what the plugin does — the plugin is the transport for the domain-specific intelligence that lives in WebAssembly. Its authoring and metadata surface is documented at [language-reference/entities/plugin.md](../language-reference/entities/plugin.md).

## Domain 1: Developer Intent (The "What")

* **Role:** The Developer. Focuses purely on AI architecture, cognitive loops, and application survival requirements. They know nothing about CEL, OPA, or physical ports.
* **1. Aggregate:** The map-based declarative blueprint of the application topology. Serving as either the root application or a parameterized, reusable module, it defines logical `components` and attaches operational `features`. Both natively support an isolated `secrets` dictionary to request credentials autonomously via credential Features. It defines abstract capacity requirements via `parameters` (typed contracts authored in the compact-form vocabulary) and payload state via `values`. Component instances support an optional `description` field for documentation and Studio rendering. It promotes the "Zero-Port" convention (abstracting network ports unless explicitly required by legacy code) with zero hardcoded deployment targets or namespaces.

## Domain 2: Platform Catalog (The "Interfaces & Intelligence")

* **Role:** The Platform Architect. The "Programmer" of the platform. They define the 7-type taxonomy, author the programmable policies (Wasm mutators and validators), and establish the semantic duck-typing labels.
* **2. Component:** The abstract interface for a compute node. It declares its base shape via the 7-type cloud ontology (e.g., `component.aggrega.ai/type: server`), and layers its cognitive identity via duck-typing labels (e.g., `model.aggrega.ai/capability: generative`). It declares credential slots via `secretsSchema` (required/optional, blackbox/transparent) and uses `schema:` (JSON Schema 2020-12, typically authored via the compact-form shorthand) to strictly validate the developer's opaque `values` block.
* **3. Feature:** A modular operational trait (e.g., Data Masking, DNS Routing, Secret Management). It uses `appliesTo` label selectors to dynamically bind to specific semantic labels. Like Components, it declares credential slots via `secretsSchema` to enforce API key provisioning. Crucially, it uses `metadata.annotations` to explicitly tag elements in the flat IR Graph, which informs downstream Wasm policy validators and rendering plugins how to handle the Feature's configuration payload.
  * **Credential Features:** The platform unifies credential management into the Feature entity: a Feature with the label `feature.aggrega.ai/kind: secret` is a credential feature — it defines a vault query interface (e.g., AWS Secrets Manager, HashiCorp Vault). The compiler enforces a hard partition: credential-labeled Features may only appear in the Developer's `secrets:` block, and non-credential Features may only appear in the `features:` block. This preserves the Developer's cognitive separation between "capabilities I'm attaching" and "credentials I'm requesting" while eliminating two entity types (`SecretStore` and `SecretRecipe`) from the taxonomy. The architectural reasoning: the `SecretRecipe` was already schema-identical to `FeatureRecipe` ("Total Schema Symmetry"), the Fetcher/Injector two-part pipeline works identically for both, and the `inject` delivery contract (`env`, `file`, `arg`) is shared. Unifying them reduces the entity count, simplifies the Manifest (credentials are mapped under `features.type`), and gives the compiler a single modifier execution path in Step 5.

**Ontology as label.** The 7-type cloud ontology is declared in `metadata.labels["component.aggrega.ai/type"]` rather than as a top-level `spec.type` field. This choice lets the compiler's label-selector engine target ontology values directly — a Feature declares `appliesTo: "component.aggrega.ai/type in (server, worker)"` to dynamically attach to every server or worker component without any new Go logic in the core compiler. Adding a new ontology value does not require a compiler release: the Catalog Architect authors the label, Features select against it, and the Wasm ecosystem evaluates the bindings. The same selector machinery applies to every Aggrega label — there is nothing special about `component.aggrega.ai/type` at the compiler level beyond its role as the standard-library convention for the core ontology.

## Domain 3: Infrastructure Base (The "Implementations")

* **Role:** The Infrastructure Engineer / Ops. Owns the physical reality, network port assignment, and templating logic.
* **4. Recipe:** The multi-provider translation template (e.g., Helm or Docker Compose). It establishes a strict 1:1 API Contract with the catalog component via the `implements` keyword. The Recipe maps the developer's `.values` into the physical format. It hardcodes the physical network ports (e.g., `5432`) and utilizes the `.context.uses` pipe to dynamically resolve the target's `provides`, satisfying the Injection Contract without hardcoding database names.
* **5. FeatureRecipe:** Explicitly maps a `Feature` to a concrete infrastructure implementation via the `implements` keyword. It mandates a target `provider` (e.g., `helm`, `compose`). Because the platform unifies credential management into the Feature entity, FeatureRecipes handle both operational features (data masking, DNS routing, sidecar injection) and credential features (vault CRD generation, secret volume mounting). To support this full spectrum, it supports three distinct execution blocks:
  1. **`pipeline`:** A sequential array of WebAssembly (Wasm) plugins for Post-Render Workload Mutation (e.g., injecting an Envoy sidecar via JSONPatch, or mounting a secret volume).
  2. **`source` & `valuesMapping`:** Used for Resource Generation, allowing Ops to render static templates natively (e.g., generating a new `HTTPRoute` CRD or an `ExternalSecret` CRD) alongside the base component.
  3. **`injectMapping` (Pre-Render Interception):** A native Go template block executed *before* the Base Recipe renders. It outputs a JSON dictionary that the compiler natively deep-merges over the Caller's `.context.inject` memory pipe, allowing Wasm-free, Caller-Side mutation of environment variables and connection strings.
  * **The Credential FeatureRecipe Pattern:** When a FeatureRecipe implements a credential Feature (labeled `feature.aggrega.ai/kind: secret`), the standard Two-Part Plugin Principle applies: the `pipeline` chains a Fetcher plugin (generating the vault-specific CRD) followed by an Injector plugin (mounting the secret to the target container). The Fetcher/Injector split maximizes reusability — swapping from AWS Secrets Manager to HashiCorp Vault only requires replacing the Fetcher plugin; the Injector remains identical.
* **6. Plugin:** The content-addressed WebAssembly plugin. A provider-rendering Plugin (`pluginType: provider`) is the unit that turns a Recipe's input kinds into the final stringified file format: it declares the provider name(s) it serves in `compatibleProviders` (e.g., `helm`), advertising a `render_node` export the compiler dispatches to, and carries its provider-socket metadata (`workloadSchema`, `wellKnownAnnotations`) in `spec.provider`. Plugins also carry the pipeline-step (`frp_step`) and linting (`linter`) roles. The compiler routes the pinned reference; the WebAssembly runtime executes the bytes.

## Domain 4: Routing & Policy (The "Glue")

* **Role:** The Platform Operator / DevOps.
* **7. Manifest:** The dependency lockfile. It uses a flat URI mapping: a `components.type` dictionary maps catalog component types to Recipe URIs, and a `features.type` dictionary maps Feature types to FeatureRecipe URIs. Resolution is direct URI lookup against the lockfile + catalog; provider determination flows from each resolved Recipe's `spec.provider` field at orchestrator time, not from a per-provider Manifest tier. After resolution, every entity must have a mapping or the compiler halts. To maintain a DRY ecosystem, Manifests support a Kustomize-style composition pattern via an `extends` keyword, allowing environment-specific manifests (like local or staging) to cleanly inherit from a global base manifest and only declare their specific overrides.
* **8. Release:** The deployment router. It binds an `aggregate` to a `manifest` and maps components to physical deployment boundaries (e.g., `aws-eks-production`). To maintain a DRY workflow, Releases support inheritance via the `extends` keyword, allowing environment-specific releases to cleanly inherit from a global base release. It fulfills the abstract aggregate contract by injecting physical realities strictly into the `parameters` block, and injects physical sizing (like CPUs or ports) via the `infra` parallel namespace. To protect the Aggregate as the Single Source of Truth, the Release schema mechanically bans a `values:` block — Ops cannot declare `values` on any Component, Feature, or Secret from a Release. Per-environment variation of developer-facing values flows through **Parameter Hoisting**: the Developer exposes a typed `parameters.*` field in the Aggregate, the Component's `values` template references it, and the Release fulfills the parameter for its environment. The rendered values differ across environments while the Aggregate — the authoring surface for *which* values exist and *how* they flow — remains the single source of truth. See [§8 Constraint 4 (Silently Mutated State)](06-data-taxonomy-and-composition.md) for the schema-level ban stated explicitly. Crucially, to prevent untraceable "aggregate-mutating" deployments, when a Release uses `extends`, declaring an `aggregate` is rejected by the Release schema (the schema constraint disallows declaring `aggregate` when `extends` is used). The child release must map to the exact same Developer Intent as its parent. The `manifest`, however, becomes optional, unlocking "Late Binding"—allowing Ops to inherit the entire physical topology but surgically swap the dependency lockfile.

**Why split the Manifest from the Release.** Separating the software lockfile (Manifest) from the deployment router (Release) enables a shape the two entities could not produce alone: DevOps deploys a single application to multiple regional deployment routers — different Releases targeting different cloud regions, all referencing the same Manifest — without duplicating Recipe bindings across environments. Each regional Release carries its boundary layout and environment-specific parameters while consuming the same software lockfile the Manifest provides. Multi-region scaling follows from the domain separation, not from Manifest duplication.

## Tier 3: Libraries (Catalog Reuse)

* **Role:** The Platform Architect (same persona as Domain 2), but the role kicks in only when catalog content grows large enough to benefit from cross-Component schema reuse or cross-Recipe template reuse. Solo authors and small catalogs ship without any Tier 3 entities.
* **9. SchemaLibrary:** Reusable JSON Schema 2020-12 definitions. A library declares named schemas at `spec.schemas:` and optional parameterized helpers at `spec.templates:` (with `$params:` declarations and `$instantiate:` references for parametric reuse). Catalog entities consume library entries via the standard JSON Schema `$ref:` keyword pointing at the library entry by identity — the host-less `<library>#/schemas/<name>` form (the version comes from the lockfile, not the reference). PascalCase naming, OCI-distributed, lockfile-pinned. Opt-in for catalogs that need cross-Component schema reuse — common shapes like `PodResources`, `PersistenceSpec`, `NodePool`, `MetricsServiceMonitor` recur across every datastore Component and every workload Component, and SchemaLibrary entries factor that repetition out of per-Component authoring.
* **10. MappingLibrary:** Reusable Go template fragments. A library declares named templates at `spec.mappings:`. Recipes and FeatureRecipes consume library entries by identity via `valuesMapping: { $import: <library>#/mappings/<name> }`. Single authoring mode (Go templates only); no parallel Jsonnet authoring path. Opt-in for catalogs that need cross-Recipe mapping reuse — common patterns like Bitnami chart helper logic or shared pod-template patterns recur across every datastore Recipe targeting the same provider, and MappingLibrary entries factor that repetition out of per-Recipe authoring.

Both libraries publish via OCI, pin in the workspace lockfile (`schema_libraries:` and `mapping_libraries:` sections), and surface in the Hub UI with consumer awareness (which Components reference which library entries; which Recipes consume which library templates).
