# Recipe

The conceptual role of the Recipe entity (the Ops-authored translation template that maps Developer Intent to a physical execution engine) lives in [architecture/04-eight-entity-taxonomy.md](../../architecture/04-eight-entity-taxonomy.md). This page covers the Recipe authoring surface — the pointer (`source`), the mapper (`valuesMapping` variants), native IaC support, and worked examples.

## The Recipe Architecture: Pointers and Mappers

A Recipe in Aggrega is no longer a multi-provider mega-template. It serves exactly two functions:

1. **The Pointer (`source`):** Tells the compiler exactly where the infrastructure code lives.
2. **The Mapper (`valuesMapping` / `valuesMappingFile` / `valuesMappingJsonnet`):** Injects Aggrega's abstract context into the specific variables the underlying code expects. Ops can author mappings in Go templates (inline or file) for standard use cases, or in Jsonnet for complex transformations where Go template logic becomes unwieldy.

Because a Recipe is strictly 1:1 with a physical execution engine, the `provider` is explicitly declared at the root level, ensuring the Go compiler knows exactly which downstream Wasm rendering plugin to invoke.

### A. Wasm-Driven Source Schemas (The Ultimate Agnosticism)

To eradicate implementation biases from the core engine, the `source` block abandons hardcoded infrastructure fields (like `registry` or `chart`). The core JSON schema delegates validation entirely to the Provider's WebAssembly socket. The `source` field supports two formats:

* **The Universal String (Fast & Clean):** Best for local paths, OCI artifacts, and Git repositories. The compiler deduces the fetch method via the prefix (`./src`, `git::https://...`, `oci://...`).
* **The Open Structured Object:** An open dictionary (`additionalProperties: true`). The exact required keys (e.g., `registry`, `chart`, `appVersion` for Helm, or `workspace` for Terraform) are dictated and validated dynamically at compile-time by the Provider's Wasm socket.

To guarantee predictable validation, Recipes should reference the exact version of the provider they were authored for (e.g., `spec.provider: "helm:1.0.0"`). If the version tag is omitted (e.g., `spec.provider: "helm"`), the compiler dynamically falls back to fetching the `latest` available version of the Wasm plugin from the registry. The IDE Language Server (LSP) runs this resolved Wasm plugin in the background, extracting its native JSON schema to provide real-time autocomplete and linting directly to the developer.

### B. Context Injection: The Semantic Mapping Layer

To prevent the compiler from performing dangerous, non-deterministic deep-merges across multiple environments, a Recipe only allows a **single source of truth** for its mapping layer.

Ops engineers author these mapping blocks to translate abstract context before Wasm plugins execute. The compiler supports two mapping languages: **Go text templates** (`{{ ... }}`) for standard use cases (the default, leveraging the existing Helm/Ops muscle memory and Sprig library) and **Jsonnet** for complex conditional nesting, array comprehensions, and multi-level object construction.

| Field Name | Scope & Execution Phase | Best Use Case |
| :--- | :--- | :--- |
| **`injectMapping`** *(FeatureRecipe only)* | **Pre-Render Interception.** Evaluated in Go memory *before* the Base Recipe. Natively deep-merges its output dictionary strictly over the Caller's `.context.inject` pipe. Intentionally absent from the base `Recipe` schema — see [entities/featurerecipe](featurerecipe.md) for the architectural rationale. | Surgically rewriting injected `env` variables or formatting FQDNs for a caller without requiring Wasm JSONPatch. |
| **`valuesMapping`** | **Base Rendering (Go Template).** Evaluated to map variables into the underlying `source` infrastructure chart/module. | Mapping standard variables (like replicas or image tags) into a Helm chart directly in the YAML. |
| **`valuesMappingFile`** | **Base Rendering (Go Template).** Points to a single Go template mapping file inside the Recipe tarball (e.g., `./mappings/vars.yaml`). | Essential for massive configurations like Terraform state, keeping the root YAML clean. |
| **`valuesMappingJsonnet`** | **Base Rendering (Jsonnet).** Points to a Jsonnet file inside the Recipe tarball (e.g., `./mappings/vars.jsonnet`). The compiler evaluates the Jsonnet program with the full Aggrega context injected via `std.extVar()`. | Complex mapping logic involving deep conditional nesting, array comprehensions, or multi-level object construction where Go templates become write-only code. |

**Mapping Language Guidance:** `valuesMapping`, `valuesMappingFile`, and `valuesMappingJsonnet` are mutually exclusive — a Recipe must choose exactly one. Go templates are the recommended default: they leverage existing Helm/Ops muscle memory, the Sprig library is pre-registered, and standard `.tpl` helpers are fully supported. Jsonnet is the recommended alternative when the mapping logic exceeds ~20 lines of nested `{{ if }}` / `{{ range }}` blocks. Both languages produce identical output: a JSON/YAML dictionary consumed by the Provider Engine. The IR graph is unaffected by the choice — parallelism converges at the compiler boundary.

*(Note: Naming it `valuesMappingFile` instead of `valueFiles` strictly reinforces the mental model: "This is a mapping layer, not a place to hardcode static passwords.")*

*(Note: `injectMapping` is exclusive to FeatureRecipes and isolates variable interception from `valuesMapping`. The Base Recipe's `valuesMapping` unknowingly consumes the rewritten `.context.inject` strings generated by FeatureRecipe `injectMapping` blocks, ensuring perfect decoupling.)*

**Jsonnet Evaluation Mechanics & Constraints**

When the compiler encounters a `valuesMappingJsonnet` file, it executes the Jsonnet program using an embedded pure-Go Jsonnet implementation. Jsonnet runs hermetically — no filesystem or network access from within the program by default — which aligns with the AOT compiler model.

* **Context Injection via `std.extVar()`:** The Go compiler serializes the identical context object that Go templates receive (`.values`, `.infra`, `.context`, `.features`, `.locals`) as JSON strings and registers them as Jsonnet external variables. The Jsonnet program accesses them idiomatically:

```jsonnet
  local values = std.parseJson(std.extVar('values'));
  local infra = std.parseJson(std.extVar('infra'));
  local ctx = std.parseJson(std.extVar('context'));
  
  {
    namespace: infra.namespace,
    env: ctx.inject.env,
    database: values.db_name,
  }
```

* **Output Contract:** The Jsonnet program must evaluate to a single JSON object. The compiler treats this output identically to the rendered output of a Go template `valuesMapping`—it is fed directly to the Provider Engine for base AST rendering.
* **Error Diagnostics:** Jsonnet produces stack traces with line numbers pointing to the exact failing expression, providing a meaningful DX improvement over Go template errors for complex mapping logic.
* **Scope:** Jsonnet is available for `valuesMappingJsonnet` (Base Rendering). The `injectMapping` block uses Go templates. Inject mappings are typically short (5–10 lines of string formatting) and benefit from consistency with the Sprig-enriched Go template ecosystem.

### C. Native IaC Support & In-Memory Transpilation

If an Ops team wants to bring their own Terraform or CloudFormation code, they simply bundle their raw `.tf` (HCL) or `.yaml` files into a `src/` directory inside the Recipe package. To bridge this human-readable code with the Wasm JSONPatch security plugins and rendering sockets, the compiler uses a transparent transpilation pipeline:

1. **Parse:** The compiler reads the raw files into an in-memory representation.
2. **Inject:** It evaluates the mapping layer (`valuesMapping`, `valuesMappingFile`, or `valuesMappingJsonnet`) to inject the abstract context (e.g., mapping `{{ .values.storage_size }}` or `std.extVar('values').storage_size` to `TF_VAR_db_size`).
3. **Patch:** The Wasm plugins execute their surgical JSONPatch operations (like injecting an Envoy sidecar or an IAM policy) directly against the in-memory object.
4. **Output:** The compiler passes the finalized in-memory JSON to the corresponding Wasm rendering socket (e.g., `terraform-renderer.wasm`), which serializes the object and outputs a deployment-ready `main.tf.json` or `template.json` string to be written to the target destination.

Because Terraform and CloudFormation natively accept JSON as first-class citizens, the underlying cloud provisioner executes the compiled output perfectly.

**Example A: The Remote Helm Chart (Inline Mapping & Locals Contract)**

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Recipe
metadata:
  name: postgres-bitnami
  version: 1.0.0
spec:
  provider: helm # Unpinned version, compiler will fetch 'latest'
  implements: core/postgres-db:1.0.0
  source:
    # Validated dynamically by the 'helm' Wasm socket
    registry: https://charts.bitnami.com/bitnami
    chart: postgresql
    version: 12.1.0
    appVersion: 15.4.0 # Explicit binary override handled safely by the plugin
    
  locals:
    primary_compute: postgresql
    listen_port: "5432"
    volumes_path: "/spec/template/spec/volumes"
    root_path: "/-"
    # The Base Recipe EXPLICITLY dictates the physical secret name to the Wasm pipeline
    secret_target_db_password: "{{ .context.instance_id }}-postgres-auth"
    
  valuesMapping: |
    primary:
      persistence:
        size: "{{ .infra.storage_size }}"
      auth:
        # Uses the exact string defined in locals, preserving AOT execution
        existingSecret: "{{ .context.instance_id }}-postgres-auth"
```

**Example B: The Local Terraform Module (File Mapping)**

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Recipe
metadata:
  name: aws-s3-tf
  version: 1.0.0
spec:
  provider: terraform
  implements: aws/s3-bucket:1.0.0
  source: "./src"
  
  locals:
    primary_compute: bucket_instance
    resource_path: "/resource/aws_s3_bucket/main"
    root_path: "/data"
  
  # Guaranteeing global uniqueness across multiple AWS environments
  valuesMapping: |
    bucket_name: "{{ .metadata.release_name }}-{{ .context.instance_id }}-data"
    region: "{{ .infra.aws_region }}"
```

**Example C: Concrete Component Recipe (Binds Infrastructure)**
Ops maps the generic interface to physical reality. (This is where the hardcoded L4 network ports actually live).

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Recipe
metadata:
  name: kong-gateway
  version: 1.0.0
spec:
  provider: helm
  implements: core/ai-gateway:1.0.0
  source:
    registry: https://charts.konghq.com
    chart: kong
```

**Source field templating.**
A Recipe's `source` field is itself a templating surface. Both shapes of `source` accept Go templates: the universal-string form (`source: "{{ .infra.module_path | default \"./src\" }}"`) and the structured-object form (each string-valued sub-field is template-evaluated; non-string sub-fields pass through). Templates evaluate in Phase B.0 with the same self-contained context as Recipe `provides` — `.context.instance_id`, `.values`, `.infra`, and the same node's resolved `.provides`. References to `.context.inject` and `.context.uses` are forbidden; the source URI must resolve before the topology pipe is hydrated and before downstream sub-passes load the chart, module, or artifact body the URI points at. The full availability rules and forbidden-reference rationale live in [Template Expansion Matrix row #5](../templates/expansion-matrix.md). The canonical use is a Component-exposed `infra.source_version` override threaded into the source's version field — see [entities/component](component.md) "The `infra` Pillar" — so a catalog need not republish a Recipe on every compatible upstream version bump.

**Authoring vs. Execution: `.tf.json` as a Compiled Artifact**

`.tf.json` is valid Terraform input — the `terraform` CLI executes it identically to `.tf` HCL. GitOps pipelines (GitHub Actions, Atlantis) and scanning tools (Checkov) handle `.tf.json` the same way they handle standard HCL.

JSON is suited for machine-to-machine communication, not for manual human authoring. Ops engineers author their Recipes using standard `.tf` HCL files; the Wasm rendering socket generates the final JSON artifacts. The `.tf.json` in the `dist/` folder is a compiled output, following the same authoring-vs-output split established by AWS CDK and CDKTF.
