# Team Topologies and the Four Domains

This chapter defines the semantic grammar, the structural primitives, and the domain-driven boundaries required to author an Aggrega architecture.

To prevent the platform from collapsing into a convoluted "DevOps overlap" where developers are forced to write infrastructure, Aggrega's entity taxonomy is mapped directly to the industry-standard **Team Topologies** framework.

The system explicitly serves distinct functional personas across 4 Domains. By separating the cognitive load of application development from the mechanics of cloud architecture, the burden of governance is shifted securely to the Platform Catalog. This formalizes the boundary between the teams building the applications and the teams building the platform, while establishing a dedicated Credential Pillar that treats secrets as first-class citizens.

## The Team Topologies Alignment

* **Stream-Aligned Teams (Domain 1):** These are the Application Developers and AI Engineers. Their sole objective is delivering business value and cognitive logic. They require a "Paved Road" (a self-service vending machine) where they can request databases and agents with zero cognitive load regarding Kubernetes, Terraform, or network policies.
* **The Platform Team (Domains 2 & 4):** These are the modern Platform Architects and CISOs. They act as the builders of the Paved Road. They author JSON Schema 2020-12 declarations (typically in compact form), define the agnostic security policies (evaluated via Wasm validation sockets), and manage the GitOps routing (`Manifests` and `Releases`). They treat the Stream-Aligned developers as their internal customers, guaranteeing the vending machine dispenses secure architecture.
* **Infrastructure & Cloud Ops (Domain 3):** These are the infrastructure engineers who manage the physical execution layer (Helm, AWS IAM, Terraform state). By isolating Domain 3, the architecture allows the enterprise to reuse this existing infrastructure code directly. Engineers package their standard `.tf` files as `Recipes` and are never required to learn catalog-specific policy languages like Rego.

---

## Why Four Domains

Separating the **Catalog Interface** (Domain 2) from the **Infrastructure Recipe** (Domain 3) is what makes Late Binding possible. The Interface defines *what* a developer can request; the Implementation defines *how* that request is realized on a specific execution engine. Domain 4 (the Manifest) routes between them at compile time, so the same Aggregate can target different implementations across environments without the developer's code changing.

### What the Four-Domain Split Enables

Each domain has a single responsibility:

| Domain | Entity | What it Does | Architectural Role |
| :--- | :--- | :--- | :--- |
| **Domain 2** | `core/postgres` | Validates that the developer asked for `storage_size` using a JSON Schema 2020-12 `schema:` declaration. | The Developer's `Aggregate.yaml` remains target-agnostic, completely blind to whether it will run on AWS or a local laptop. |
| **Domain 3** | `aws-rds` | Maps `storage_size` into a Terraform `.tf.json` payload. | The Ops engineer writes highly specific, vendor-locked infrastructure code in its own file, decoupled from the developer's authoring surface. |
| **Domain 4** | The `Manifest` | Instructs the compiler: *"When the dev asks for `core/postgres`, use the `aws-rds` recipe."* | Ops can swap the Manifest for local testing, routing `core/postgres` to a Docker Compose recipe instead, and the developer's code remains untouched. |

The `Manifest` routing layer carries a small authoring overhead, and it is what lets Aggrega target Docker Compose, AWS CloudFormation, and enterprise Kubernetes from a single developer authoring surface.

## Team Scale (The "Hats" Analogy)

While the architecture defines four distinct roles, these represent *functional personas*, not mandatory human headcount. In a large enterprise, these are distinct departments. In a small startup, a single developer might wear all four hats. Because Domains 2 and 3 (the Catalog and Recipes) are shareable open-source artifacts, a solo developer can operate purely in Domain 1 (Intent) by leveraging the pre-built components in the Aggrega ecosystem.

See [The Entity Taxonomy](04-eight-entity-taxonomy.md) for a visual overview of the entities grouped by domain and the detailed per-entity descriptions.
