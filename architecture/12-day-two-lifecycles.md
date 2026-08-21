# Day-2 Lifecycles

## Day-2 Lifecycles & Temporal Execution

A capability-agnostic Ahead-of-Time (AOT) compiler inherently creates a gap between declarative intent (Day-1) and operational reality (Day-2). The cloud is not perfectly deterministic, deployment requires temporal sequencing, and developers require imperative triggers for maintenance tasks.

Aggrega structurally bridges these gaps through specific architectural polyfills and GitOps-native routing, ensuring the generated configurations are fully equipped to handle real-world enterprise chaos without compromising the purity of the core compiler.

### 1. The DAG Execution Model (Temporal Sequencing)

**The Problem:** Infrastructure deployment is a Directed Acyclic Graph (DAG) of *time*. A database migration `task` must run to completion *before* the web `server` boots up. However, AOT compilers generate flat folders of static YAML or Terraform. If you hand these flat folders to a GitOps controller (like ArgoCD), it applies everything simultaneously, causing the web server to crash-loop while waiting for the database.

**The Solution: per-boundary `syncWave` in the Release**
We leave the Developer's `Aggregate` completely untouched. Because sequencing is a physical operational reality, it is strictly managed in Domain 4 (the `Release`). Each boundary in the Release carries an optional `syncWave: <integer>` field, allowing DevOps to explicitly stage deployment ordering at the boundary level.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Release
metadata:
  name: sequenced-release
  version: 1.0.0
  environment: production
spec:
  aggregate: my-app
  manifest: prod-manifest
  boundaries:
    infra:
      syncWave: 0
      components:
        core-vpc: {}
        postgres-db: {}
    migrations:
      syncWave: 1
      components:
        db-migration-task: {}
    apps:
      syncWave: 2
      components:
        web-server: {}
        support-agent: {}
```

**Wave value semantics:**

* The wave is a signed integer; the default is `0`. Negative values run before everything else (CRDs, namespaces, RBAC); larger values run after lower values. Operators set values to fit their deployment topology.
* Every component instance directly contained in a boundary inherits the boundary's wave value into its IR node. There is no per-component override at the authoring layer — provider-internal per-resource ordering inside a single boundary is the provider's concern.
* Nested boundaries do not implicitly inherit. A nested boundary that does not declare `syncWave` defaults to `0` regardless of the outer boundary's declaration. Operators wanting "all of `outer` is wave 1, including its `inner` sub-boundary" declare `syncWave: 1` on both.

**The Compiler Effect:**
The compiler propagates each boundary's wave value to every rendered manifest in that boundary. Providers emit native sequencing primitives:

* **For Kubernetes (ArgoCD/Flux):** the helm and helm-chart providers emit `argocd.argoproj.io/sync-wave: "<N>"` as a `metadata.annotations` entry on every rendered manifest. Helm hook resources additionally receive `helm.sh/hook-weight: "<N>"` for native Helm hook ordering.
* **For Compose:** the compose provider expresses the ordering as `depends_on` between the services of the file a boundary renders into, gated on the target's health where the target declares a `healthcheck` and on its start where it does not. `depends_on` names a service inside one file, so ordering across two compose files is not expressible; operators sequence separate compose projects at the `docker compose up` invocation layer.

The Aggrega-internal `aggrega.ai/sync-wave: "<N>"` label continues to ship alongside the ArgoCD annotation for observability and provenance use (queryable via `kubectl get -l aggrega.ai/sync-wave=1`); the annotation is what GitOps controllers consume.

#### Wave-authoring vs deployable unit

The boundary is the **wave-authoring unit**. The deployable unit is the **assembly path** — the on-disk output produced by the compiler that a CI/CD pipeline orchestrates against. By default, one boundary maps to one assembly path: each boundary's components emit under `boundaries/<boundary-name>/<provider>/`, and `helm install` / `docker compose up` runs against that path.

Operators can collapse this 1:1 mapping. Boundaries may declare `directory:` (and `subDirectory:`) path-template fields that, when shared across boundaries, route those boundaries' components into a single assembled output at the shared path. Two boundaries declaring `directory: "deploy/cluster"` produce one assembled output containing components from both — the deployable becomes the assembly path, not the boundary identity.

Mixed-wave manifests within one assembled output are normal and supported. When boundary A declares `syncWave: 1` and boundary B declares `syncWave: 2`, and both share `directory: "deploy/cluster"`, the resulting deployable contains both boundaries' components; each manifest carries its author-boundary's wave annotation. Runtime tooling reads per-resource annotations and orders within the assembled deployment unit — ArgoCD's per-Application sync context processes wave 1 manifests, waits for them to be Healthy, then processes wave 2; Helm's hook ordering reads `helm.sh/hook-weight` per-hook-resource. This is the standard ArgoCD pattern: the per-resource emission is exactly the input cross-tool consumers expect.

Cross-Application sequencing (when an operator runs multiple ArgoCD Applications against separate assembled outputs) is operator-level CI configuration — Aggrega produces the artifacts; the operator wires their ArgoCD Applications around them via app-of-apps or Progressive Sync. Aggrega's per-resource annotation pattern is the standard input shape every cross-tool consumer expects.

### 2. The Dynamic Addressing Polyfill

**The Problem:** The cloud is non-deterministic at creation time. Resources like AWS RDS instances or S3 buckets generate random URL hashes *only after* they are physically provisioned. Because the AOT compiler generates configuration *before* the cloud provisions anything, it is physically impossible for the compiler to inject the literal database URL into a container's environment variable.

**The Solution: Deterministic Pointers via the Credential Pillar**
Aggrega solves this by leveraging the existing `inject` mechanism, shifting the definition of "deterministic" from a literal IP address to a *deterministic pointer*. The generated configuration does not pass the URL; it passes the path to a Cloud Vault where the URL *will* exist.

* **Example 1: The Output Generation (Terraform RDS)**
  The Ops Recipe for the database creates the AWS RDS instance. Crucially, the Recipe is authored to natively output that newly generated dynamic URL into AWS Systems Manager (SSM) Parameter Store at a deterministically named path (e.g., `/aggrega/prod/db-url`).
* **Example 2: The Input Injection (Kubernetes App)**
  The Developer writes `inject: { env: { DB_URL: "host" } }`. During compilation, Aggrega maps the deterministic pointer string (`"/aggrega/prod/db-url"`) through the IR graph edges. The Wasm rendering plugin for the worker application translates this edge into a generated Kubernetes `ExternalSecret` configuration and a Pod environment variable mapped to `valueFrom: secretKeyRef`.

At runtime, Terraform provisions the DB and saves the URL to the vault. The container boots up, reads the vault, and connects flawlessly. The AOT compiler generated the relationships via stable pointer strings without ever needing the literal IP address.

### 3. Imperative Actions (The Executable Handoff)

**The Problem:** Declarative state is perfect for Day-1 provisioning, but developers need to run imperative actions: *"Run a DB backup right now."* A strictly declarative GitOps pipeline has no native mechanism to re-trigger a static script.

**The Solution: Dormant Tasks & Script Generation**
Aggrega solves this by preserving strict AOT purity. It generates configurations for dormant infrastructure and outputs the exact commands the developer needs to invoke.

1. **The Dev Intent:** The developer declares the script as a `task` in the `Aggregate` and attaches an operational feature (e.g., `core/manual-trigger`).
2. **The Wasm Execution:** The Wasm rendering plugin evaluates the baseline Kubernetes `Job` payload. It logically transforms it into a `CronJob` configuration with `suspend: true`, generating a dormant Day-2 task for the cluster.
3. **The UX (Script Generation):** The AOT compiler does not connect to the cluster. Instead, the Wasm formatting plugin outputs a generated shell script to the `dist/scripts/` folder (e.g., `run-db-backup.sh`). This script contains the exact native orchestrator command (e.g., `kubectl create job --from=cronjob/db-backup`). On Day 2, the developer simply executes the generated script, maintaining perfect separation between configuration generation and runtime execution.

*(Note: While Ops could manually author a dedicated `CronJob` Recipe to achieve this, utilizing Wasm plugins allows them to reuse their standard Python Worker Recipe, keeping the infrastructure catalog DRY).*

### 4. Pre-Analysis: The Workspace Hook (Platform RBAC & Quotas)

**The Problem:** Some changes provision expensive or production-critical infrastructure — a large GPU cluster, say — and must not flow into the GitOps pipeline unreviewed. *Which* contributors may promote *which* changes to *which* environments is an organizational policy decision; the compiler must not hard-code it.

**The Solution:**
A pure AOT compiler cannot ping Active Directory or fetch cloud credentials to figure out who is running the build. To prevent unauthorized generation before CI/CD ever runs, the architecture relies on explicit context injection.

When `aggrega build` is invoked by a CI/CD runner, the pipeline explicitly passes the execution context (e.g., `--context approval=standard`) to the CLI. The enterprise's custom governance verdict plugin evaluates this injected context against the enterprise's `Workspace` rules and the `Release` mapping (e.g., returning a failure array if `context.approval !== "platform-approved" && release.environment === "production-aws"`). This isolates RBAC from the compiler's native logic, ensuring the compiler acts purely as a deterministic evaluator of the provided data.

### 5. Shift-Left FinOps (Cost Estimation via Policies)

**The Problem:** Accidental misconfigurations (e.g., requesting `workers: 500`) can bypass financial safeguards and trigger massive cloud overruns.

**The Solution (Enterprise Wasm Policies):**
Because the IR Graph contains the complete topology and the `Release` contains the physical mapping (`.infra`), enterprises can evaluate exact deployment costs prior to generation without needing a hardcoded compiler feature. Enterprises simply author a custom FinOps WebAssembly plugin and slot it into their governance verdict or `linter.wasm` CI/CD gates. This custom plugin can read the `.infra` payloads, calculate the estimated monthly cost, and return a fatal failure to the compiler if the calculated cost exceeds the enterprise's internally defined budget limits.

### 6. The "Brownfield" Import Lifecycle

**The Problem:** Enterprises already have most of their infrastructure running. While Aggrega generates configurations to connect to unmanaged infrastructure via Wasm formatter stubs (pass-through networking), shifting an *existing* Oracle database into Aggrega's generated Terraform state typically causes orchestrators to attempt to *recreate* the database, destroying the existing data.

**The Solution (Future Implementation):**
Aggrega will introduce the `core/resource-adoption` feature to manage the import lifecycle.

When a developer models the existing database in their `Aggregate` and attaches the `resource-adoption` feature in a sequentially executed pipeline, the Wasm rendering plugin will evaluate the baseline Ops `Recipe` payload. Instead of emitting standard creation configurations, the plugin will output the target platform's explicit adoption syntax (e.g., returning a JSONPatch with Terraform `import {}` blocks or Crossplane `ObserveOnly` management policies). This allows enterprises to safely generate configurations that absorb legacy architecture into the GitOps control plane without downtime.

### 7. Ops Best Practices & Deterministic Naming

While the core compiler relies on stable, internal node IDs (e.g., `support-db`) in the flat IR Graph, physical cloud providers (like AWS, Azure, and GCP) often require globally unique strings for physical infrastructure (e.g., S3 Bucket names, IAM Role names, or API Gateway domains).

If a Platform Ops engineer hardcodes a physical name in their baseline template (e.g., `bucket_name: "enterprise-data-bucket"`), the generated artifacts will deploy flawlessly the first time. However, if a developer deploys a second environment (e.g., `staging` vs `prod`), the cloud provider will reject the deployment at runtime due to a naming collision.

**The Deterministic Output Rule (GitOps Safety):**
Because GitOps controllers (ArgoCD, Flux) perform byte-level diff detection on rendered artifacts, the compiler guarantees that identical inputs produce byte-identical outputs. Maps that flow through the template context (`.context.inject.env`, `.values`, `.infra`, and the rest of the runtime view) are backed by ordered-map structures that preserve author insertion order across the data layer; `{{ range }}` over those maps iterates in author order, not in alphabetical order. Ops engineers can rely on iteration order being deterministic across runs of the same input. The Sprig `keys` function, however, returns Go-map iteration order (which is non-deterministic by language design); templates that compose a deterministic key sequence from `keys` output must pipe through `sortAlpha` (e.g., `{{ keys .values | sortAlpha }}`) to recover determinism.

**The Golden Rule for Ops Recipes (The Helm Pattern):**
Platform Ops engineers must **never** hardcode physical cloud resource names. Instead, they must construct deterministically unique names by concatenating the Aggrega deployment context during the template evaluation phase. This is a **reusability and collision-safety rule**, not a determinism rule — hardcoded names produce stable output but fatally collide when the same Recipe renders multiple component instances or when the same Aggregate deploys across multiple Releases.

The compiler provides exactly two variables to guarantee global uniqueness:

1. `{{ .metadata.release_name }}`: The name of the `Release` driving the deployment (e.g., `prod-billing`).
2. `{{ .context.instance_id }}`: The specific Component ID from the Developer's `Aggregate` (e.g., `receipt-storage`).

By concatenating these (e.g., `{{ .metadata.release_name }}-{{ .context.instance_id }}`), Ops guarantees that the configurations generated by the Wasm plugins utilize unique resource names per environment, per component, without requiring the Developer to manage physical naming conventions.
