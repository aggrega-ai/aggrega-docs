# Recipe

The conceptual role of the Recipe entity (the Ops-authored translation template that maps Developer Intent to a physical execution engine) lives in [architecture/04-entity-taxonomy.md](../../architecture/04-entity-taxonomy.md). This page covers the Recipe authoring surface — the pointer (`source`), the mapper (`valuesMapping:`), native IaC support, and worked examples.

## The Recipe Architecture: Pointers and Mappers

A Recipe serves exactly two functions:

1. **The Pointer (`source`):** Tells the compiler exactly where the infrastructure code lives.
2. **The Mapper (`valuesMapping`):** Injects Aggrega's abstract context into the specific variables the underlying code expects. The field is a single Go template surface with three authoring modes — inline block scalar, file `$import:`, or library `$import:` — dispatched by content shape. See [The `valuesMapping` field — three authoring modes](#the-valuesmapping-field--three-authoring-modes) below.

Because a Recipe is strictly 1:1 with a physical execution engine, the render capability (`spec.capability`) is explicitly declared at the root level, ensuring the Go compiler knows exactly which downstream Wasm rendering plugin to invoke.

`spec.implements` declares which catalog component type the Recipe is able to implement. The compiler uses it to verify Manifest mappings (a mapped Recipe's `implements` must match the mapped type) and to suggest candidates — the recipes listed in a no-mapping diagnostic and ranked first in editor completion. It never resolves a build: the Manifest mapping is the user's explicit deployment choice, pinned in the lockfile. A Recipe whose `implements` is unversioned, exact, or a major-compatible range still only *offers* itself for a type; the user pins the choice. `FeatureRecipe.spec.implements` carries the identical role for feature types.

### A. Wasm-Driven Source Schemas (The Ultimate Agnosticism)

To keep implementation biases out of the core engine, the `source` block is not a fixed set of infrastructure fields. The `source` field supports two formats:

* **The Universal String (Fast & Clean):** Best for local paths, OCI artifacts, and Git repositories. The compiler deduces the fetch method via the prefix (`./src`, `git::https://...`, `oci://...`).
* **The Open Structured Object:** An open dictionary (`additionalProperties: true`) whose keys are provider-defined and are exposed to the Recipe's templates as `.source.*` (for example `.source.chart`). The design intent is that each provider's WebAssembly socket defines and validates its own source shape (e.g., `registry`/`chart`/`appVersion` for Helm).

**What the core resolves today.** Per-provider Wasm source validation is not yet implemented. A *fetched* source is resolved by the `{ kind, url, version }` form, where `kind` selects a built-in resolver — today `helm-oci-chart`, `helm-https-chart`, and `compose-https-fragment`. A fetch-intended source must use `{ kind, url, version }`; a structured source that omits `kind`/`url` is not fetched, and if a fetch was intended the build halts loudly at lock-time source descent rather than silently resolving to nothing. When the per-provider Wasm socket ships, it validates provider-specific shapes and translates them ahead-of-time into a deterministic `{ kind, url, version }` fetch identity — the version always pins ahead-of-time; the compiler never fetches live runtime state.

To guarantee predictable validation, Recipes should reference the exact version of the provider they were authored for (e.g., `spec.capability: "helm:1.0.0"`). If the version tag is omitted (e.g., `spec.capability: "helm"`), the compiler dynamically falls back to fetching the `latest` available version of the Wasm plugin from the registry. The IDE Language Server (LSP) runs this resolved Wasm plugin in the background, extracting its native JSON schema to provide real-time autocomplete and linting directly to the developer.

Mental model: `spec.capability` names the output format you want (e.g. `helm`, `terraform`, `compose`); the compiler resolves it to the Wasm plugin that renders that format (e.g. `helm-renderer`). You declare the format; Aggrega binds the tool.

### B. Context Injection: The Semantic Mapping Layer

To prevent the compiler from performing dangerous, non-deterministic deep-merges across multiple environments, a Recipe allows only a **single source of truth** for its mapping layer.

Ops engineers author the mapping content to translate abstract context before the Wasm rendering plugin executes. The mapping language is Go template (text/template + Sprig); the Sprig library is pre-registered; standard `define` / `include` / `template` helpers are fully supported.

| Field Name | Scope and Execution Phase | Best Use Case |
| :--- | :--- | :--- |
| **`injectMapping`** *(FeatureRecipe only)* | **Pre-Render Interception.** Evaluated in Go memory *before* the Base Recipe. Natively deep-merges its output dictionary strictly over the Caller's `.context.inject` pipe. Intentionally absent from the base `Recipe` schema — see [entities/featurerecipe](featurerecipe.md) for the architectural rationale. | Surgically rewriting injected `env` variables or formatting FQDNs for a caller without requiring Wasm JSONPatch. |
| **`valuesMapping`** | **Base Rendering (Go template).** Evaluated to map variables into the underlying `source` infrastructure chart/module. Single field, three authoring modes (inline, file `$import:`, library `$import:`). See the subsection below for the dispatch mechanism. | Mapping standard variables (like replicas or image tags) into a Helm chart directly in the Recipe YAML, or referencing a shared template via `$import:` for cross-Recipe reuse. |

*Note: `injectMapping` is exclusive to FeatureRecipes and isolates variable interception from `valuesMapping`. The Base Recipe's `valuesMapping` unknowingly consumes the rewritten `.context.inject` strings generated by FeatureRecipe `injectMapping` blocks, ensuring perfect decoupling.*

### The `valuesMapping` field — three authoring modes

A Recipe's `valuesMapping:` is a single Go template surface that accepts three dispatch modes. The compiler dispatches based on the field's content shape; no `$mode:` annotation is needed.

**Mode 1: Inline Go template (YAML block scalar).** The field's value is a string written in YAML block-scalar `|` form:

```yaml
spec:
  valuesMapping: |
    {{- with .values -}}
    image:
      tag: {{ optional .image `tag` "11.4.4-debian-12-r0" }}
      pullPolicy: {{ optional .image `pullPolicy` "IfNotPresent" }}
    architecture: {{ optional . `architecture` "standalone" }}
    primary:
      replicaCount: {{ optional .primary `replicaCount` 1 }}
    {{- end }}
```

Inline mode is the typical authoring form for Recipes whose mapping content is small to medium (under ~50 lines). The template body sits inline with the rest of the Recipe envelope; the Recipe's content is self-contained.

**Mode 2: File `$import:`.** The field's value is a map containing only `$import:` with a local file path:

```yaml
spec:
  valuesMapping:
    $import: ./mappings/api-server.tmpl
```

The compiler loads the file's content (a Go template), template-renders it against the standard Recipe template context, and treats the result as the mapping output. Path resolution is relative to the Recipe's directory. File mode suits medium-to-large mapping content (~50+ lines) and review patterns where mapping changes show up as standalone file diffs.

**Mode 3: Library `$import:`.** The field's value is a map containing only `$import:` with a bare-name identity reference to a MappingLibrary entry:

```yaml
spec:
  valuesMapping:
    $import: DatastoreHelpers#/mappings/MariaDBCore
```

The compiler resolves the reference against the resolved MappingLibrary set (the local catalog plus any lockfile-pinned libraries), loads the entry's content, and treats it as the mapping output; an entry whose body is itself a field-root `$import:` resolves recursively. The reference carries no registry host — the library name resolves by identity and the version comes from the per-Release lockfile, with an optional `:<version>` minimum-version floor (`<Library>:<version>#/mappings/<entry>`). Library content shares the standard Recipe template context. Library mode suits cross-Recipe reuse — mapping patterns that recur across many Recipes (multiple datastore Recipes sharing datastore helper logic; multiple Helm-provider Recipes sharing pod-template patterns). The MappingLibrary entity provides versioning, lockfile pinning, and hub-UI surfacing.

**Dispatch rules.** The compiler walks the YAML node and dispatches by content shape:

1. If the node is a string scalar, dispatch as inline mode (Mode 1).
2. Otherwise the node is a map; check for `$import:` key.
3. If the `$import:` value is a bare-name library reference (`<Library>#/mappings/<Entry>`, optionally with a `:<version>` floor), dispatch as library mode (Mode 3).
4. Otherwise (a local file path) dispatch as file mode (Mode 2).
5. Any other shape (a map without `$import:`, a map with extra keys beyond `$import:`, etc.) produces a build-time error.

**Single-source `$import:` only.** Per the unified file-import vocabulary, `$import:` accepts a single source. Multi-source merge is not supported at `valuesMapping:`. A Recipe needing to compose multiple mapping fragments uses a MappingLibrary entry with internal Go template `define` / `include` composition, a local file with Go template `template` directives invoking sibling files, or inline composition for short content. See [entities/mappinglibrary](mappinglibrary.md) for the library entity, [vocabulary/cross-document-ref](../vocabulary/cross-document-ref.md) for the broader `$ref:` / `$import:` distinction, and the file-import vocabulary discussion.

**Provenance.** Error messages from template-rendering failures cite the appropriate provenance per mode: inline templates cite the Recipe's file:line where the block scalar begins; file imports cite the imported file's content; library imports cite the MappingLibrary entry's source position, with the host-less library identity (`<Library>#/mappings/<entry>`) as the canonical pointer for stable references — a registry host in a reference is rejected, so physical location never enters the pointer.

### C. Native IaC Support & In-Memory Transpilation

> **Status: native IaC transpilation is a designed capability. No `terraform` or `cloudformation` rendering engine is registered with the production dispatch today; the pipeline below describes the designed flow. See [Status of the Language](../10-status.md#provider-engines) for the shipping provider set.**

If an Ops team wants to bring their own raw infrastructure-as-code, they bundle their source files into a `src/` directory inside the Recipe package. To bridge this human-readable code with the Wasm JSONPatch security plugins and rendering sockets, the compiler uses a transparent transpilation pipeline:

1. **Parse:** The compiler reads the raw files into an in-memory representation.
2. **Inject:** It evaluates the mapping layer (`valuesMapping:` — inline, file-import, or library-import) to inject the abstract context (e.g., mapping `{{ .values.storage_size }}` to `TF_VAR_db_size`).
3. **Patch:** The Wasm plugins execute their surgical JSONPatch operations (like injecting an Envoy sidecar or an IAM policy) directly against the in-memory object.
4. **Output:** The compiler passes the finalized in-memory JSON to the corresponding Wasm rendering socket (e.g., `terraform-renderer.wasm`), which serializes the object and outputs a deployment-ready `main.tf.json` or `template.json` string to be written to the target destination.

Because Terraform and CloudFormation natively accept JSON as first-class citizens, the underlying cloud provisioner executes the compiled output perfectly.

**Example A: The Remote Helm Chart (Inline Mapping & Locals Contract)**

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Recipe
metadata:
  name: mariadb-chart
  version: 1.0.0
spec:
  capability: helm
  implements: core/datastore/mariadb:1.0.0
  source:
    # The shipped fetch form: { kind, url, version }. 'kind' selects a built-in
    # resolver (helm-oci-chart, helm-https-chart, compose-https-fragment).
    kind: helm-oci-chart
    url: oci://registry-1.docker.io/bitnamicharts/mariadb
    # Default chart version. Override via infra.source_version.
    version: "{{ optional .infra `source_version` \"25.0.8\" }}"
    # Planned (not yet implemented): a provider's Wasm socket may instead validate
    # provider-declared keys like registry/chart/appVersion and translate them
    # ahead-of-time into this { kind, url, version } fetch identity. See "Source
    # Schemas" above.

  locals:
    primary_compute: mariadb
    listen_port: "3306"
    volumes_path: "/spec/template/spec/volumes"
    root_path: "/-"
    # The Base Recipe EXPLICITLY dictates the physical secret name to the Wasm pipeline
    secret_target_db_password: "{{ .context.instance_id }}-mariadb-auth"

  provides:
    host: "{{ .context.instance_id }}"
    port: "3306"

  valuesMapping: |
    primary:
      persistence:
        size: "{{ .infra.storage_size }}"
      auth:
        # Reads the local rather than restating the expression, so the secret
        # name is authored once and every reader follows that one definition
        existingSecret: "{{ .locals.secret_target_db_password }}"
```

**Example B: The Local Terraform Module (File Mapping)**

> **Status: the terraform provider is currently `planned` — the provider name is documented as designed, but no engine is registered with the production dispatch. See [Status of the Language](../10-status.md#provider-engines) for current behaviour. The example below illustrates the designed flow.**

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Recipe
metadata:
  name: aws-s3-tf
  version: 1.0.0
spec:
  capability: terraform
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
  capability: helm
  implements: core/gateway/ai-gateway:1.0.0
  source:
    # Planned: provider-declared source keys, validated by the provider's Wasm plugin.
    # The built-in resolver today uses the { kind, url, version } form.
    registry: https://charts.konghq.com
    chart: kong
```

**Cloud-resource naming discipline.**

Recipes that emit cloud-resource names — S3 bucket names, RDS database identifiers, IAM role names, CloudFormation stack names, and any other field whose value occupies a global namespace at the cloud provider — must concatenate `{{ .metadata.release_name }}` and/or `{{ .context.instance_id }}` into the rendered name to avoid collisions when the same Recipe runs across multiple Releases or component instances. Example B's `bucket_name: "{{ .metadata.release_name }}-{{ .context.instance_id }}-data"` is the canonical pattern.

The discipline applies wherever a single global namespace constrains the name. AWS S3 bucket names share a global namespace across every account in a region; two Releases of the same Aggregate (`prod-billing` and `staging-billing`) cannot both deploy buckets named `customer-data` — the second deployment fails at runtime with an AWS-side rejection. Concatenating `release_name` differentiates the Release; concatenating `context.instance_id` differentiates per-component-instance; concatenating both differentiates per-component-per-Release.

**What the compiler does and does not check.** The compiler does not inspect `valuesMapping:` outputs for cloud-resource-name fields without these interpolations. The discipline is upheld by Recipe authors (who know which fields name globally-unique resources for the target provider) and reviewers (who catch unnamed-resource patterns at PR review). A future `linter.wasm` plugin could flag Recipes whose `valuesMapping:` outputs reference cloud-resource-name fields without `release_name` / `instance_id` interpolation; the linter is `planned` per the Wasm plugin contract surface (see [`plugins/plugin-contract.md`](../plugins/plugin-contract.md) "Placement criterion: the linter socket vs the governance verdict roles") and not yet wired.

This discipline is one of several Class C contracts (convention-enforced authoring discipline) that authors learn from documentation rather than from compiler enforcement. See [`vocabulary/social-contracts.md`](../vocabulary/social-contracts.md) for the broader Class C inventory and the architectural rationale for each contract's classification.

**Source field templating.**
A Recipe's `source` field is itself a templating surface. Both shapes of `source` accept Go templates: the universal-string form

```yaml
  source: "{{ optional .infra `module_path` \"./src\" }}"
```

and the structured-object form (each string-valued sub-field is template-evaluated; non-string sub-fields pass through). Templates evaluate at source resolution with the same self-contained context as Recipe `provides` — `.context.instance_id`, `.values`, `.infra`, and the same node's resolved `.provides`. References to `.context.inject` and `.context.uses` are forbidden; the source URI must resolve before the topology pipe is hydrated and before anything downstream loads the chart, module, or artifact body the URI points at. The full availability rules and forbidden-reference rationale live in [Template Expansion Matrix row #5](../templates/expansion-matrix.md). The canonical use is a Component-exposed `infra.source_version` override threaded into the source's version field — see [entities/component](component.md) "The `infra` Pillar" — so a catalog need not republish a Recipe on every compatible upstream version bump.

**Source field scheme inventory.**
The `source:` field accepts several shape variants in the schema. Each variant's runtime support varies per provider engine; the table below documents what ships today and what is reserved for future provider work.

| Shape | Example | Status today |
| --- | --- | --- |
| Bare relative filesystem path | `source: "./charts/postgres"` | `available` — every shipping provider engine (helm, helm-chart, compose) accepts a bare filesystem path string. |
| Bare absolute filesystem path | `source: "/abs/path/to/chart"` | `available` — same engines, same handling; the path is interpreted against the build's working directory regardless of relative vs absolute form. |
| Empty string | `source: ""` | `accepted but blocked` — the schema accepts the empty string; the Recipe loader rejects it with a clear authoring-disambiguation message. See [`errors/fatal-halts.md`](../errors/fatal-halts.md) "Recipe `source:` is an empty string". |
| Structured object (built-in `{kind, url, version, chart, ...}`) | `source: { url: "oci://…/mariadb", version: "25.0.8" }` | `available` — the built-in source-resolver reads the `{kind, url, version, chart, ref, module_subdir}` form (`url:`'s scheme selects the kind — `oci://` → OCI chart, `https://….tgz` → chart archive, `https://` repo root paired with `chart:` → repo chart — or name it with `kind:`), fetches and pins the artifact at `aggrega pull`, and the build extracts it from the cache. The former render-time `structured source not supported` rejection is retired; vendoring a chart locally remains supported but is no longer required. The schema accepts an open structured object so a provider can later declare its own source keys (e.g. a Helm `registry` + `chart` pair) validated by the provider's Wasm plugin — `planned`. See [`providers/helm.md`](../providers/helm.md) "`source:` keyset". |
| OCI URI (`oci://...`) | `source: "oci://hub.aggrega.ai/recipe/helm/postgres:1.0.0"` | `planned` — design target for catalog distribution. Today's three-tier resolver (local paths, workspace catalogs, remote OCI registry) is documented at [`architecture/13-catalog-and-registry.md`](../../architecture/13-catalog-and-registry.md); the entity-level resolver consumes OCI URIs through that cascade, but the per-Recipe `source:` field's OCI form is not wired in the engines today. |
| Other URL schemes (`https://`, `git+https://`, etc.) | (illustrative) | `planned` — documented as design intent in the architecture's pluggable-source roadmap; no engine support today. |

The inventory is the canonical reference for what authors can put in `source:` today. Authors targeting future shipping milestones (OCI URI, structured forms with the helm-renderer.wasm Wasm engine when it ships) should expect the framings above to update from `planned` to `available` per the four-label taxonomy at [`10-status.md`](../10-status.md).

**Authoring vs. Execution: `.tf.json` as a Compiled Artifact**

`.tf.json` is valid Terraform input — the `terraform` CLI executes it identically to `.tf` HCL. GitOps pipelines (GitHub Actions, Atlantis) and scanning tools (Checkov) handle `.tf.json` the same way they handle standard HCL. *The terraform provider engine is currently `planned`; this discussion describes the designed flow.*

JSON is suited for machine-to-machine communication, not for manual human authoring. Ops engineers author their Recipes using standard `.tf` HCL files; the Wasm rendering socket generates the final JSON artifacts. The `.tf.json` in the `dist/` folder is a compiled output, following the same authoring-vs-output split established by AWS CDK and CDKTF.

## The `workload:` field — synthesized input kind

`Recipe.spec.workload:` declares the Workload body the compiler synthesizes into provider-native resources. It is one of the three input kinds a Recipe may declare alongside `source:` (sourced rendering) and `artifacts:` (auxiliary manifests). At least one of the three must be present for non-`eval` providers; the `eval` provider rejects all three by schema constraint.

The field accepts three authoring modes — inline block scalar, file `$import:`, or library `$import:`. The compiler dispatches on the field's content shape; no `$mode:` annotation is needed.

**Mode 1: Inline (Go template string scalar).** The value is a YAML block scalar whose output parses as `aggrega.ai/v1alpha1 Workload`:

```yaml
spec:
  capability: helm
  implements: core/web-server:1.0.0
  workload: |
    apiVersion: aggrega.ai/v1alpha1
    kind: Workload
    replicas: {{ .infra.replicas | default 1 }}
    containers:
      app:
        image: "{{ .values.image }}"
        ports:
          http: 8080
```

A Workload's fields sit at the document root — there is no `spec:` wrapper — and `containers:` and each container's `ports:` are name-keyed maps rather than sequences, with author order preserved. The provider translates that shape into its own native form, so a container map entry surfaces in helm's rendered output as a `containers[]` element named by its key; the authored shape is the map, not the rendered list.

**Mode 2: File `$import:`.** The value is a map with a single `$import:` key pointing at a local Go-template file:

```yaml
spec:
  workload:
    $import: ./workload/web-server.yaml.tmpl
```

**Mode 3: Library `$import:`.** The value is a map with a single `$import:` key carrying a bare-name identity reference to a WorkloadLibrary entry:

```yaml
spec:
  workload:
    $import: BaseWorkloads#/workloads/StatelessService
```

The `#/workloads/` fragment is what selects a Workload entry, and it is the fragment that distinguishes this reference from the `#/mappings/` form `valuesMapping:` uses — that one addresses a MappingLibrary entry and does not name a Workload body. The reference carries no registry host, the resolved version comes from the per-Release lockfile, an optional `:<version>` minimum-version floor may be asserted as `<Library>:<version>#/workloads/<Entry>`, and an entry whose body is itself a field-root `$import:` resolves recursively. The imported body is a Go template evaluated in the consuming Recipe's render context, so `.values`, `.infra` and `.features` flow into it exactly as they do into an inline body. See [entities/workloadlibrary](workloadlibrary.md) for the library entity and the full reference grammar.

The target provider's engine must support synthesis (the standard-library catalog declares `workloadSchema` on such providers by convention); targeting a provider whose engine cannot synthesize is rejected when the node renders, with the provider-capability diagnostic — keyed on engine capability, not on `workloadSchema` presence. For the full Workload grammar, the K8s-shape pass-through fields, and the per-provider translation behavior, see [entities/workload.md](workload.md). For the broader three-input-kinds model and the assembler that merges synthesis with source-rendered output and artifacts, see [architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md).

## The `artifacts:` field — auxiliary manifests

`Recipe.spec.artifacts:` is a map of output-filename → artifact-body authoring whose entries emit additional manifest files alongside the Recipe's sourced or synthesized primary output. It is one of the three input kinds (sourced / synthesized / artifacts) — a Recipe may declare `artifacts:` alone, or alongside `workload:` and/or `source:`.

Map keys become output filenames verbatim; each entry's value carries one of two content-shape-dispatched modes parallel to `workload:`:

```yaml
spec:
  capability: helm
  implements: core/web-server:1.0.0
  artifacts:
    extra-configmap.yaml: |
      apiVersion: v1
      kind: ConfigMap
      metadata:
        name: "{{ .context.instance_id }}-extras"
      data:
        threshold: "{{ .values.threshold }}"
    network-policy.yaml:
      $import: ./artifacts/network-policy.tmpl
```

Each artifact entry's template evaluates with the same template context as `valuesMapping:`. Map keys translate to filenames in the assembled output; filename collisions across artifact entries, source output, and workload synthesis are load-time or render-time errors with a clear diagnostic naming every contributor. Library `$import:` is not available at this site; artifacts are Recipe-local.

**Use cases.** `artifacts:` is the home for auxiliary resources that the primary chart or module does not produce: a `NetworkPolicy` accompanying a workload, an `HPA` paired with a Deployment, a sidecar `ConfigMap` keyed off `instance_id`. Cross-cutting auxiliary resources that apply across many components (a backup sidecar attached to every datastore, for example) belong on FeatureRecipe Resource Generation rather than per-Recipe `artifacts:` — see [entities/featurerecipe.md](featurerecipe.md) for the FeatureRecipe extension surface.

## The `outputLabels:` field — author-declared labels on rendered output

`Recipe.spec.outputLabels:` is a map of label key → value that the provider stamps onto every object the Recipe's rendered output produces. It is the honest home for a *realization trait* — a property of how a particular Recipe realizes a component, as opposed to what the component is. The motivating case is `hosting: managed | self-hosted`: a managed-service Recipe and a self-hosted-chart Recipe for the same component type carry different `outputLabels`, so downstream tooling (cost allocation, policy, inventory) can tell them apart on the emitted resources.

```yaml
spec:
  capability: helm
  implements: core/datastore/postgres:1.0.0
  outputLabels:
    hosting: self-hosted
    example.io/team: platform
```

Output labels ride the same rail as the fixed build-provenance labels: they are merged into the label set every emitting surface stamps, so they land wherever provenance lands. What differs is ownership — provenance keys are compiler-owned, `outputLabels` are Recipe-author-owned.

**Reserved namespaces.** The `aggrega.ai/` and `app.kubernetes.io/` namespaces are reserved for platform-native provenance. A Recipe that declares an `outputLabels` key under either prefix is rejected at load with a clear catalog error naming the offending key. Every other key is accepted. The core does not otherwise police the key or value — a key or value that is not valid for the target engine's label surface is the author's responsibility, and the downstream runtime rejects it; the compiler stays out of the way beyond the reserved-namespace rule.

**Per-engine surfacing.** Each provider translates the labels onto its own output surface:

* **helm, workload synthesis** — on both the object `metadata.labels` and the pod-template `metadata.labels`, matching where synthesis places provenance.
* **helm, source-render and artifacts** — on the object `metadata.labels`.
* **compose** — on each service's `labels:` map.
* **terraform** — as per-resource tags on structurally addressable `.tf.json` artifact bodies, best-effort: a resource block that already declares a `tags` (AWS/azurerm) or `labels` (Google) map receives the output labels there, an author-declared key is never overwritten, and a resource with no such attribute is left untouched (an attribute is never invented). Native-HCL bodies (`main.tf`, `*.tf`) and vendored modules emit verbatim and carry no injected tags. Terraform provenance continues to travel in its companion comment file, separate from the tag rail.

Output labels are labels only; there is no separate output-annotation surface. `outputLabels` is declared by the Recipe author (the ops-authored realization layer), not by the Aggregate — it describes the realization, never the developer's abstract-graph identity.

## The `locals:` block

`Recipe.spec.locals:` is the **Private Ops State** — a map of named Go template strings whose rendered output exposes a `.locals.*` map to the Recipe's later templates. It is the workspace for computing physical realities (target containers, JSON paths, derived hostnames) once and reusing them across `provides:`, `source:`, `valuesMapping:`, `workload:`, `artifacts:`, `assertions:`, and `pipeline[].with` payloads without recomputation.

```yaml
spec:
  capability: helm
  implements: core/postgres-db:1.0.0
  locals:
    primary_compute: postgresql
    listen_port: "5432"
    secret_target_db_password: "{{ .context.instance_id }}-postgres-auth"
    volumes_path: "/spec/template/spec/volumes"
  valuesMapping: |
    primary:
      auth:
        existingSecret: "{{ .locals.secret_target_db_password }}"
```

`locals:` is never exposed to callers — downstream components consuming this Recipe via `uses:` see only `provides:`. The Recipe's own `provides:`, `source:`, `valuesMapping:`, `workload:`, `artifacts:`, `assertions:`, and `pipeline[].with` templates all see the resolved `.locals.*` map. Per-key values may be plain strings or Go templates; the compiler resolves the whole block in the locals preamble, ahead of that node's `provides:`, so every later template observes stable resolved values.

Each entry evaluates against a self-contained node-local context: `.context.instance_id`, `.values`, `.infra`, and the entries of this same block already resolved. A local cannot read `.provides` — that pillar is not on this surface, and an entry reaching for it halts.

### Author order is load-bearing

Entries resolve in the order they are written, and **an entry may read a sibling defined above it**, receiving that sibling's resolved value:

```yaml
spec:
  locals:
    db_identifier: "{{ .context.instance_id }}-postgres"     # defined first
    secret_target: "{{ .locals.db_identifier }}-auth"        # reads the entry above
```

Chaining runs **downward only**. Where one entry reads another, the order of the entries decides whether the build succeeds: move `db_identifier` below `secret_target` and the build halts. The compiler never sorts or reorders the block to make a reference resolve, so the written order is the contract — reordering a `locals:` block is a behavioural change, not a cosmetic one.

Two halts separate the two mistakes an author can make, because they have different fixes:

* A reference to an entry the block defines **later** halts naming the ordering fault; the fix is to move the definition above its reader.
* A reference to a key the block **does not declare at all** halts naming the key; the fix is to correct the spelling.

The check reads **direct** `.locals.<key>` references. A key reached indirectly — through `index .locals`, a `with .locals` block, or a variable bound to `.locals` — is not analysed, so an absent key reached that way renders as an empty value rather than halting. Indirect forms remain the way to reach a key whose name is itself computed, such as `{{ index .locals (printf "secret_target_%s" .values.slot) }}`; direct references are the form the ordering check covers.

`provides:` reads `.locals` and receives resolved values, because a node's locals resolve before its provides. A `provides:` template naming a key the locals block does not declare halts. This means a value both a `provides:` entry and an artifact need is authored **once**, in `locals:`, and read from both places.

For the public-API counterpart, see [The `provides:` block](#the-provides-block) below. The FeatureRecipe surface follows the same rules — see [entities/featurerecipe.md](featurerecipe.md) "The `locals:` block".

## The `provides:` block

`Recipe.spec.provides:` is the **Public Developer API** — a map of name → Go template string declaring the values this Recipe contributes to downstream callers' `.context.inject` and `.context.uses` pipes. The compiler evaluates `provides:` templates at provides evaluation (self-contained, any order); callers' `inject` keys resolve against these values at inject hydration.

```yaml
spec:
  capability: helm
  implements: core/postgres-db:1.0.0
  provides:
    host: "{{ .context.instance_id }}-postgresql.{{ .context.annotations.release.\"aggrega.ai/namespace\" }}.svc.cluster.local"
    port: "5432"
    database: "{{ .values.db_name }}"
```

Each entry's template evaluates against the self-contained provides-evaluation surface — `.context.instance_id`, `.values`, `.infra`, the node's resolved `.locals`, and static text. `.locals` is on it because the node's locals resolve in the preamble of the same stage, ahead of its provides; a `provides` template naming a key the locals block does not declare halts. Separating provides evaluation from inject hydration is load-bearing: a Recipe's `provides:` cannot reference any caller's state because callers have not been resolved when provides evaluation runs — `provides:` is self-contained per the architectural invariant. Callers then read these values via `.context.uses.<alias>.provides.<provided-name>` in their own templates — the provided names nest under `provides` on the edge, alongside the edge's other fields. A caller that declares an `inject:` allowlist on the edge reaches the same values through its `.context.inject` pipe instead.

`provides:` keys are part of the Recipe's contract surface. Renaming or removing a key is a breaking change for every caller relying on the old name; the `implements:` interface version should reflect the contract evolution. For the cascade resolution semantics, the inject-pipe contract, and worked examples covering cross-namespace and cross-region routing, see [architecture/06-data-taxonomy-and-composition.md §3](../../architecture/06-data-taxonomy-and-composition.md) and [templates/expansion-matrix.md](../templates/expansion-matrix.md).

## Reading an attachment's published values

A Recipe reads the Features attached to its component at `.features.<instance-name>` and the credential Features at `.features.<slot>`. Both are the same attachment shape — `.type`, `.values`, `.infra`, `.provides` — so an attachment is read the same way whichever map carries it; what differs between them is what the attachment produces.

`.provides` is the attachment's published output, resolved from the FeatureRecipe bound to it. It is the counterpart of the `provides:` block above, seen from the consuming side: where a Recipe *publishes* to its callers, an attachment publishes to its host component.

```yaml
workload: |
  # The identity attachment emits a ServiceAccount and publishes its name;
  # the pod binds to that published name rather than restating it.
  serviceAccount: "{{ .features.identity.provides.name }}"
  containers:
    main:
      env:
        DB_SECRET: "{{ .features.app_credentials.provides.name }}"
```

Reading the published value rather than recomputing it from the same `values`/`infra` inputs is the difference between one statement of a name and two that can drift apart. The full field-by-field shape, including the availability rules, is at [templates/template-context-contract.md](../templates/template-context-contract.md#the-attachment-shape).

## The `pipeline:` field

`Recipe.spec.pipeline:` is a sequential array of Wasm plugin invocations for stateful AST mutation directly on the base infrastructure. Each entry declares an `id` (per-step identifier), a `plugin` URI (the Wasm artifact), a `function` (the plugin export to invoke), an optional `with:` Go template body supplying the plugin's payload, and an optional `when:` Go template that gates whether the step runs — a falsy result skips the step as a pass-through, leaving the document set unchanged. The `when:` gate, its independence from `optional:`, and its truthiness rule are covered in full under [entities/featurerecipe.md](featurerecipe.md) "Conditional steps — `when:`":

```yaml
spec:
  capability: helm
  implements: core/web-server:1.0.0
  source: { registry: "...", chart: "..." }
  pipeline:
    - id: inject-sidecar
      plugin: hub.aggrega.ai/plugin/envoy-sidecar:1.0.0
      function: Inject
      with: |
        target_container: "{{ .locals.primary_compute }}"
        envoy_version: "{{ .values.envoy_version | default \"1.30.0\" }}"
```

The compiler executes a base Recipe's `pipeline:` steps in declared order, the same way it executes a FeatureRecipe's `pipeline:`: it dispatches each step's named Wasm plugin against the rendered output, applies the returned JSON Patch operations to the addressed documents, and emits the step's side effects. The FeatureRecipe `pipeline:` field shares the same schema shape and the same execution — see [entities/featurerecipe.md](featurerecipe.md) "Authoring Contract" and [Status of the Language](../10-status.md#compilation-pipeline-phases) for the execution state of each surface.

The field's mechanics mirror the FeatureRecipe semantics: sequential evaluation in declared order, JSON Patch operations applied to the rendered documents, side effects emitted alongside them, and errors surfaced with provenance pointing at the offending step. A step whose `when:` gate renders falsy is skipped as a pass-through, leaving the document set unchanged for the next step.

## The `assertions:` block

`Recipe.spec.assertions:` is an optional Go template body that expresses **implementation invariants of the Recipe** — cross-field rules that hold given the specific chart or module the Recipe wraps. Unlike Component assertions (which express contract-level invariants regardless of which Recipe binds), Recipe assertions are properties of the specific implementation chosen.

```yaml
spec:
  implements: core/datastore/mariadb:^1.0.0
  source:
    # Planned provider-declared form; the built-in resolver today uses { kind, url, version }.
    chart: oci://registry-1.docker.io/bitnamicharts/mariadb
    version: "20.0.0"
  assertions: |
    {{- /* Bitnami 20.x: serviceMonitor namespace requirement */ -}}
    {{- if and (eq .values.architecture "replication") .values.metrics.serviceMonitor.enabled -}}
      {{- if not .values.metrics.serviceMonitor.namespace -}}
        {{- fail "Bitnami MariaDB 20.x requires metrics.serviceMonitor.namespace when architecture=replication and metrics.serviceMonitor.enabled=true" -}}
      {{- end -}}
    {{- end -}}
```

The rule above is specific to Bitnami chart 20.x; it does not apply if a different MariaDB Recipe binds. The Component-level rules from the contract still apply alongside, evaluated at an earlier pipeline phase.

Recipe assertions evaluate after Recipe binding and before rendering. The template context includes the Recipe's `.provides`, `.locals`, and `.recipe.source` in addition to the entity-instance fields (`.values`, `.infra`, `.uses`, `.features`). For the full authoring grammar, the responsibility split between contract-level and implementation-level rules, and worked examples, see [templates/assertions-block.md](../templates/assertions-block.md).
