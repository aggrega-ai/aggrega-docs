# Dependency Resolution

## Aggrega Dependency Resolution & The Structural Topology Pillar

In the Aggrega architecture, topological dependencies are mapped explicitly via the `uses` schema pillar to maintain a fully opaque `values` payload. Resolving "who talks to whom" presents a unique challenge: we must map complex, multi-node application topologies without forcing the Developer to write explicit network routing, orchestrator-level execution orders, or infrastructure dependencies.

### 1. The Core Philosophy: Why `uses`?

The `uses` block declares cross-component dependencies as pure topology: Component A depends on Component B's public `provides` contract, not on Component B's physical address or connection details. Topology lives in `uses`; configuration lives in `values`. The separation lets the compiler see all cross-component edges explicitly without inferring them from `values` content.

Aggrega solves this by elevating topology to a first-class schema pillar called `uses`.

* **The Semantic Proxy Argument:** The keyword `uses` represents L7 Semantic Intent. If an agent `uses` a database, it remains semantically true even if Platform Ops injects transparent Wasm proxy meshes between them.
* **Mathematical Blindness:** The Go compiler parses the `uses` struct natively to draw the Intermediate Representation (IR) graph. It never attempts to parse or query the developer's application logic (`values`).
* **Feature Atomicity:** The `uses` pillar applies identically to Components and Features (including credential Features). This allows a sidecar proxy (a Feature) or a credential fetcher to autonomously declare its own network dependencies without polluting its parent Component's configuration.

---

### 2. The Mechanics of the Unified Schema Contract

To extract operational instructions without parsing the application payload, the system relies on strict JSON Schema 2020-12 declarations governing explicitly separated YAML structures.

**Domain 2: The Split Schema (`usesSchema` & `schema`)**
To prevent the Platform Catalog from fragmenting into unmanageable schema files, Aggrega utilizes a Split Schema engine. The Native YAML `usesSchema` strictly defines and validates the topology, while `schema:` (JSON Schema 2020-12 — typically authored via the compact-form shorthand) validates the `values`, `infra`, and `provides` pillars. **The `usesSchema` is the enabling schema for `uses` declarations: a Component or Feature that does not define `usesSchema` cannot accept `uses` blocks on its instances, and every socket name in the developer's `uses` must match a key defined in the catalog entity's `usesSchema`.** Inside the `usesSchema`, Platform Architects use the `selector:` field — synthesised into the merged JSON Schema as the `x-aggrega-selector:` extension keyword — and the native Go selector engine evaluates it to enforce **Cross-Node Type Safety**. It ensures that if a socket requires a database, the developer cannot plug in a web server.

**Domain 1: The Developer Experience (Polymorphism)**
Developers write `uses:` as a sibling to `values:` and `secrets:`. To ensure a frictionless UX, the schema natively supports polymorphism:

* **Arrays of Strings:** Used for simple logical component references (e.g., `tools: ["search-api"]`) where standard routing is sufficient.
* **Maps of Objects:** Used when strict delivery contracts are required (e.g., `databases: { hr_db: { target: "corporate-hr", inject: { env: { DB_URL: "host" } } } }`).
* **No Wildcards:** Wildcards (e.g., `["*"]`) are rejected by the schema to prevent "Ghost Dependencies" and unauthorized auto-wiring.

**Domain 3: The Ops Reality (Normalization)**
To maintain predictable Go templates, the Go compiler normalizes the polymorphic `uses` inputs. Arrays of logical component references are converted into standard objects before being passed into the strict, flat dictionary known as `.context.uses`.

---

### 3. End-to-End Examples

The following two examples demonstrate the two distinct superpowers of the explicit Topology Pillar: **Example A** proves *whether* a connection is authorized (Cross-Node Type Safety), and **Example B** proves *how* the connection data is physically delivered (Polymorphism & Normalization).

#### Example A: Topological Validation & Cross-Node Type Safety

This scenario traces how a `policy.wasm` socket — when Ops has configured the Release to invoke it — detects that an AI Agent is about to connect to a database lacking required compliance labels, and halts the build. The core Go compiler pipes labels opaquely; the detection logic lives inside the Wasm plugin that Ops has chosen to wire in.

**1. The Standard Library (The Unified `schema:` in the Catalog)**
The Platform Architect defines the schema structure, separating cognitive logic from topological targets natively.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Component
metadata:
  name: core/enterprise-agent
  version: 1.0.0
  labels:
    component.aggrega.ai/type: "worker"
spec:
  usesSchema:
    datastores:
      selector: "component.aggrega.ai/type=stateful-server, compliance.aggrega.ai/data-class=restricted"

  schema:
    # 1. The Cognitive Intent
    values:
      system_prompt: { type: string, required: true }
```

**2. The Developer's Intent (The Aggregate)**
The Developer cleanly separates what the agent does (`values`) from what the agent connects to (`uses`).

```yaml
components:
  my_secure_vector_db:
    type: core/qdrant-secure:1.0.0
    values:
      collection_name: finance_data

  auditing_agent:
    type: core/enterprise-agent:1.0.0
    values:
      system_prompt: "You are a financial auditing AI..."
    uses:
      datastores: 
        finance_memory: { target: "my_secure_vector_db" }
```

**3. Compiler Execution & Topological Validation**

1. **Local Validation:** The Go compiler evaluates the entire object against the resolved JSON Schema in Step 1. It checks the underlying catalog labels of `my_secure_vector_db`. If the database lacked the `restricted` label, the engine would immediately halt the build with a type-safety violation.
2. **Graph Drawing:** In Step 2, the Go compiler ignores schema-validated content entirely. It reads `uses.datastores.finance_memory.target` natively from the YAML and draws the explicit edge in the IR graph.

#### Example B: Polymorphism & The Normalized `.context.uses`

This scenario demonstrates how the compiler seamlessly handles both a black-box AI tool (passed as an array) and a legacy relational database (requiring a map with an `inject` contract).

**1. The Catalog (Domain 2): The `schema:` declaration**
The Architect allows polymorphic arrays for tools, but demands strict objects for databases.

```yaml
spec:
  usesSchema:
    # Polymorphic Array Socket (No injection needed)
    tools:
      selector: "tool.aggrega.ai/impact=read-only"

    # Strict Map Socket (Requires delivery contract)
    databases:
      selector: "component.aggrega.ai/type=stateful-server"
      inject: ["env", "file"]

  schema:
    values:
      system_prompt: { type: string, required: true }
```

**2. The Developer Intent (Domain 1): The Aggregate**
The Developer uses a clean array for the tool, and an explicit map for the database.

```yaml
components:
  my-agent:
    type: core/python-worker:1.0.0
    values:
      system_prompt: "You are an HR bot."
      
uses:
        # 1. Polymorphic Array: Simple logical component reference
        tools:
          - "corporate-search-api" 
            
        # 2. Strict Map: Dictating the environment variable delivery
        databases:
          corporate-hr-db:
            inject: 
              env: 
                HR_DATABASE_URI: "host" # Local Env : Target Provide Key
```

**3. The Ops Reality (Domain 3): The Recipe**
The Go Compiler normalizes the polymorphism. Ops receives a perfectly flat, predictable `.context.uses` dictionary. They simply loop through the `.context.inject` pipe in the relevant sections of their template.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Recipe
metadata:
  name: generic-worker
  version: 1.0.0
spec:
  target: helm
  implements: core/python-worker:1.0.0
  source: "./charts/internal/python-runner"
  
  locals:
    primary_compute: worker-container
    
  valuesMapping: |
    env:
      # Ops uses the pre-resolved inject map, perfectly separated from values and topology loops
      {{- range $key, $value := .context.inject.env }}
      - name: {{ $key }}
        value: "{{ $value }}"
      {{- end }}
```
