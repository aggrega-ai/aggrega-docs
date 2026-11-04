# Dependency Resolution

## Aggrega Dependency Resolution & The Structural Topology Pillar

In the Aggrega architecture, topological dependencies are mapped explicitly via the `uses` schema pillar to maintain a fully opaque `values` payload. Resolving "who talks to whom" presents a specific challenge: complex, multi-node application topologies must be mapped without forcing the Developer to write explicit network routing, orchestrator-level execution orders, or infrastructure dependencies.

### 1. The Core Philosophy: Why `uses`?

The `uses` block declares cross-component dependencies as pure topology: Component A depends on Component B's public `provides` contract, not on Component B's physical address or connection details. Topology lives in `uses`; configuration lives in `values`. The separation lets the compiler see all cross-component edges explicitly without inferring them from `values` content.

Aggrega solves this by elevating topology to a first-class schema pillar called `uses`.

* **The Semantic Proxy Argument:** The keyword `uses` represents L7 Semantic Intent. If an agent `uses` a database, it remains semantically true even if Platform Ops injects transparent Wasm proxy meshes between them.
* **Mathematical Neutrality:** The Go compiler parses the `uses` struct natively to draw the Intermediate Representation (IR) graph. It never attempts to parse or query the developer's application logic (`values`).
* **Feature Atomicity:** The `uses` pillar applies identically to Components and Features (including credential Features). This allows a sidecar proxy (a Feature) or a credential fetcher to autonomously declare its own network dependencies without polluting its parent Component's configuration.

---

### 2. The Mechanics of the Unified Schema Contract

To extract operational instructions without parsing the application payload, the system relies on strict JSON Schema 2020-12 declarations governing explicitly separated YAML structures.

**Domain 2: The Split Schema (`usesSchema` & `schema`)**
To prevent the Platform Catalog from fragmenting into unmanageable schema files, Aggrega utilizes a Split Schema engine. The Native YAML `usesSchema` strictly defines and validates the topology, while `schema:` (JSON Schema 2020-12 — typically authored via the compact-form shorthand) validates the content of the `values` and `infra` pillars and declares the shape of the `provides` pillar. The `values` a developer authors and the `infra` an operator sets are checked against their declared types; the `provides` sub-schema declares the key names and types of the downstream contract a Recipe produces, and the compiler checks that every `inject` reference names a declared `provides` key — but the produced `provides` values themselves travel downstream as opaque strings the compiler pipes without interpretation, not values it type-checks, because the core does not interpret what a piped value means. **The `usesSchema` is where a socket is *declared*, and declaring one is what gives it a contract.** A socket the catalog entity declares carries that entity's constraints: a selector saying which targets it may reach, an `inject` allowlist, and per-edge `valueSchema` / `infraSchema`. Inside the `usesSchema`, Platform Architects use the `selector:` field — read as the string the Architect wrote, not copied into any generated schema — and the native Go selector engine evaluates it to enforce **Cross-Node Type Safety** over declared sockets. It ensures that if a socket requires a database, the developer cannot plug in a web server.

The selector is held to its grammar at the moment it is evaluated, which is once for every edge wired through the socket. A selector the engine cannot read as one of its six requirement forms — an empty requirement left by a stray comma, a key carrying whitespace or one of the characters the grammar uses to tell its forms apart (`=`, `!`, `(`, `)` and the comma), or a set without its closing parenthesis — halts the build on that edge, naming the requirement, instead of being read as some other selector. The strictness is what keeps the check honest: read leniently, `!tier=frontend`, written to keep frontends out, would ask only that no label be *named* `tier=frontend`, and every target — frontends included — would pass. The same grammar governs attachment-slot selectors and a Feature's `appliesTo`; [the selector grammar](../language-reference/vocabulary/modifier-system.md) lists every form and every refusal. A build never evaluates a socket no edge is wired through, so `aggrega validate` — over the whole catalog, or over the Component or Feature declaring the socket — reads every declared socket's selector and refuses a malformed one there, under the code and in the words a build that wires the socket uses.

Declaring the socket is not, however, the *only* way to draw an edge. An Aggregate author may name a socket on their own component that the catalog entity does not declare — including on a component type that declares no `usesSchema` at all — and the edge is built. A catalog that declares no entry for a socket has not anticipated the connection, which is not the same as forbidding it, and the developer owns the application's topology. Such a socket is called **ad-hoc**, and what it costs is exactly what declaring it buys: there is no catalog entry, so there is no selector and no per-edge contract, and cross-node type safety has nothing to evaluate. What the edge may *carry* is unchanged — every key it injects must still name a key the target's `provides` declares, and the target must still exist. Every edge in the emitted graph records which of the two it is, so a consumer never has to guess; see [governance-and-compliance](11-governance-and-compliance.md) for how an operator forbids ad-hoc sockets outright.

Two surfaces are deliberately not open this way, because they do not author the application's topology. A Feature attachment's `uses` may only name a socket the attached Feature declares, and a Release's per-edge `uses` may only name a socket the consuming component's catalog entity declares in its `usesSchema`, never one the Aggregate authored ad hoc — an operator configures and wires within an architecture, and a Feature participates in the topology its own catalog entity declares. Declaring the socket in the catalog also remains the better path and is what the standard-library catalog does: an ad-hoc socket is an escape hatch, not a new default.

**Domain 1: The Developer Experience (Polymorphism)**
Developers write `uses:` as a sibling to `values:` and `features:`. To ensure a frictionless UX, the schema natively supports polymorphism:

* **Arrays of Strings:** Used for simple logical component references (e.g., `tools: ["search-api"]`) where standard routing is sufficient.
* **Maps of Objects:** Used when strict delivery contracts are required (e.g., `databases: { hr_db: { target: "corporate-hr", inject: { env: [{ in: DB_URL, from: "host" }] } } }`).
* **No Wildcards:** There is no wildcard form, which prevents "Ghost Dependencies" and unauthorized auto-wiring: every entry names one component, so `["*"]` halts the build as a target that does not exist — no component name can contain `*`.

**Domain 3: The Ops Reality (Normalization)**
To maintain predictable Go templates, the Go compiler normalizes the polymorphic `uses` inputs. Arrays of logical component references are converted into standard objects before being passed into the strict, flat dictionary known as `.context.uses`.

---

### 3. End-to-End Examples

The following two examples demonstrate the two distinct properties of the explicit Topology Pillar: **Example A** proves *whether* a connection is authorized (Cross-Node Type Safety), and **Example B** proves *how* the connection data is physically delivered (Polymorphism & Normalization).

#### Example A: Topological Validation & Cross-Node Type Safety

This scenario traces how the selector on a declared socket detects that an AI Agent is about to connect to a database lacking required compliance labels, and halts the build. The compiler evaluates the label selector the Architect wrote against the target's labels, as strings; it does not interpret what a label means, and no policy plugin is involved.

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

1. **Local Validation:** The Go compiler evaluates the entire object against the resolved JSON Schema at resolution. It checks the underlying catalog labels of `my_secure_vector_db`. If the database lacked the `restricted` label, the compiler would immediately halt the build with a type-safety violation.
2. **Graph Drawing:** At topology construction, the Go compiler ignores schema-validated content entirely. It reads `uses.datastores.finance_memory.target` natively from the YAML and draws the explicit edge in the IR graph.

#### Example B: Polymorphism & The Normalized `.context.uses`

This scenario demonstrates how the compiler handles both a black-box AI tool (passed as an array) and a legacy relational database (requiring a map with an `inject` contract).

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
        hr_db:
          target: corporate-hr-db
          inject:
            env:
              - in: HR_DATABASE_URI # Local env var
                from: "host"        # Target provides key
```

**3. The Ops Reality (Domain 3): The Recipe**
The Go Compiler normalizes the polymorphism. Ops receives a flat, predictable `.context.uses` dictionary. They simply loop through the `.context.inject` pipe in the relevant sections of their template.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Recipe
metadata:
  name: generic-worker
  version: 1.0.0
spec:
  capability: helm
  implements: core/python-worker:1.0.0
  source: "./charts/internal/python-runner"
  
  locals:
    primary_compute: worker-container
    
  valuesMapping: |
    env:
      # Ops uses the pre-resolved inject map, kept apart from values and topology loops
      {{- range $key, $value := .context.inject.env }}
      - name: {{ $key }}
        value: "{{ $value }}"
      {{- end }}
```
