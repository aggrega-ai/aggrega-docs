# Recipe

The conceptual role of the Recipe entity (the Ops-authored translation template that maps Developer Intent into the physical format) lives in [architecture/04-entity-taxonomy.md](../../architecture/04-entity-taxonomy.md). This page covers the Recipe authoring surface — the pointer (`source`), the mapper (`valuesMapping:`), native IaC support, and worked examples.

## The Recipe Architecture: Pointers and Mappers

A Recipe serves exactly two functions:

1. **The Pointer (`source`):** Tells the compiler exactly where the infrastructure code lives.
2. **The Mapper (`valuesMapping`):** Injects Aggrega's abstract context into the specific variables the underlying code expects. The field is a single Go template surface with three authoring modes — inline block scalar, file `$import:`, or library `$import:` — dispatched by content shape. See [The `valuesMapping` field — three authoring modes](#the-valuesmapping-field--three-authoring-modes) below.

Because a Recipe is strictly 1:1 with a render capability, that capability (`spec.capability`) is explicitly declared at the root level, ensuring the Go compiler knows exactly which downstream Wasm rendering plugin to invoke.

`spec.implements` declares which catalog component type the Recipe is able to implement. The compiler uses it to verify Manifest mappings (a mapped Recipe's `implements` must match the mapped type) and to suggest candidates — the recipes listed in a no-mapping diagnostic and ranked first in editor completion. It never resolves a build: the Manifest mapping is the user's explicit deployment choice, pinned in the lockfile. A Recipe whose `implements` is unversioned, exact, or a major-compatible range still only *offers* itself for a type; the user pins the choice. `FeatureRecipe.spec.implements` carries the identical role for feature types.

### A. Wasm-Driven Source Schemas (The Ultimate Agnosticism)

To keep implementation biases out of the compiler, the `source` block is not a fixed set of infrastructure fields. The `source` field supports two formats:

* **The Universal String (Fast & Clean):** Best for local paths, OCI artifacts, and Git repositories. The compiler deduces the fetch method via the prefix (`./src`, `git::https://...`, `oci://...`).
* **The Open Structured Object:** An open dictionary (`additionalProperties: true`) whose keys are provider-defined and are exposed to the Recipe's templates as `.source.*` (for example `.source.chart`). The design intent is that each provider's WebAssembly socket defines and validates its own source shape (e.g., `registry`/`chart`/`appVersion` for Helm).

**What the core resolves today.** Per-provider Wasm source validation is not yet implemented. A *fetched* source is resolved by a built-in identity whose `kind` selects a resolver — today `helm-oci-chart`, `helm-https-chart`, `compose-https-fragment`, and `git-repository`. A fetch-intended source must carry `kind` and `url`; which further coordinate selects the content depends on the kind. The chart and fragment kinds take `version`, and pin it as written. `git-repository` takes `ref` — a tag, a branch, or a commit — and optionally `module_subdir`, naming the directory inside the repository that is the artifact; because only a commit names content that cannot be repointed, the reference is resolved at lock time and the lockfile records both the reference that was authored and the commit it resolved to. A `module_subdir` that climbs above the repository as written — a backslash counts as a separator — is refused before anything is fetched. The repository is archived from its own checkout: a symbolic link it commits is archived as the file or directory it points to where that lies inside the repository, and one leading out of it halts the pull, naming the link by its place in the repository. A structured source whose `url:` names a filesystem path is not fetched: it is read from disk on the same terms as a bare path string, with a relative `url:` anchored to the directory holding the entity file that declares it. A structured source that omits `kind`/`url` is not fetched either, and if a fetch was intended the build halts loudly at lock-time source descent rather than silently resolving to nothing. When the per-provider Wasm socket ships, it validates provider-specific shapes and translates them ahead-of-time into a deterministic fetch identity — the content always pins ahead-of-time; the compiler never fetches live runtime state.

**What is pinned beside the Recipe.** For a fetched source whose `kind`, `url`, `chart`, `module_subdir`, `version` and `ref` are all written out rather than templated, [`aggrega pin`](../cli/aggrega-pin.md) records the digest of what it fetched in `entity.lock`, a file in the Recipe's own directory that you commit beside it. Pinning is the Recipe author's step, and needs no Release; a pull over a Recipe whose lock does not record the pin halts and names it, unless the pull is asked to run the same step. A build compares that digest with the one the Release's lockfile records for the same source, and halts where the two disagree — except for a source written at a git `ref:`, whose row is recorded at the commit the ref resolved to and is not compared. A fetched source whose coordinates are filled in from a template is pinned per Release instead, in each Release's lockfile. A source that names a directory or a file beside the Recipe is not fetched: `aggrega pin` records one digest per file it contributes to what a publication of the Recipe carries — every file in the Recipe's directory, for a source written as a template — and once the lock records them a build compares the source with them before the provider reads it, halting on a file added, changed or removed since the pin — with `E0305`, or first with `E0130` where the Release's lockfile, written before the change, records the Recipe by what it carries. A lock that records no pin for such a source leaves a build nothing to compare, and a pull or a publication that does not pin refuses it. The Recipe file itself is never written to. [`aggrega pull`](../cli/aggrega-pull.md#the-entity-lock) describes the file and how to answer each halt.

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

The compiler loads the file's content (a Go template), template-renders it against the standard Recipe template context, and treats the result as the mapping output. Path resolution is relative to the Recipe's directory — a relative path is anchored to the directory holding the `recipe.yaml` that declares it, not to the directory the build is invoked from — and the path must stay inside that directory, as [Content paths stay inside the Recipe's own directory](#content-paths-stay-inside-the-recipes-own-directory) explains. File mode suits medium-to-large mapping content (~50+ lines) and review patterns where mapping changes show up as standalone file diffs.

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

> **Status: native IaC transpilation is a designed capability. No `terraform` or `cloudformation` provider is registered with the production dispatch today; the pipeline below describes the designed flow. See [Status of the Language](../10-status.md#providers) for the shipping provider set.**

If an Ops team wants to bring their own raw infrastructure-as-code, they bundle their source files into a `src/` directory inside the Recipe package. To bridge this human-readable code with the Wasm JSONPatch security plugins and rendering sockets, the compiler uses a transparent transpilation pipeline:

1. **Parse:** The compiler reads the raw files into an in-memory representation.
2. **Inject:** It evaluates the mapping layer (`valuesMapping:` — inline, file-import, or library-import) to inject the abstract context (e.g., mapping `{{ .values.storage_size }}` to `TF_VAR_db_size`).
3. **Patch:** The Wasm plugins execute their surgical JSONPatch operations (like injecting an Envoy sidecar or an IAM policy) directly against the in-memory object.
4. **Output:** The compiler passes the finalized in-memory JSON to the corresponding Wasm rendering socket (e.g., the plugin bound for Terraform), which serializes the object and outputs a deployment-ready `main.tf.json` or `template.json` string to be written to the target destination.

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
    # The Base Recipe EXPLICITLY dictates the physical secret name to the Wasm
    # pipeline: the suffix it follows the rendered name with. A local cannot read
    # .context.rendered_name, so each template writing the full name joins the two.
    secret_target_db_password: "mariadb-auth"

  provides:
    # The chart's primary Service, named by the fullnameOverride pinned below
    host: "{{ .context.rendered_name }}"
    port: "3306"

  valuesMapping: |
    fullnameOverride: "{{ .context.rendered_name }}"
    auth:
      # Reads the suffix from the local rather than restating it, so the secret
      # name is authored once and every reader follows that one definition
      existingSecret: "{{ .context.rendered_name }}-{{ .locals.secret_target_db_password }}"
    primary:
      persistence:
        size: "{{ .infra.storage.size }}"
```

**Example B: The Local Terraform Module (File Mapping)**

> **Status: the terraform provider is currently `planned` — the provider name is documented as designed, but no provider is registered with the production dispatch. See [Status of the Language](../10-status.md#providers) for current behaviour. The example below illustrates the designed flow.**

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
Ops maps the generic interface to physical reality. (This is where the L4 network details are bound — either hardcoded, or, as with the proxy port below, taken from the `infra` block the Release fills in.)

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Recipe
metadata:
  name: kong-gateway
  version: 1.0.0
spec:
  capability: helm
  implements: core/gateway/kong:1.0.0
  source:
    # Planned: provider-declared source keys, validated by the provider's Wasm plugin.
    # The built-in resolver today uses the { kind, url, version } form.
    registry: https://charts.konghq.com
    chart: kong

  provides:
    # The chart's proxy Service: it suffixes the name pinned below with "-proxy"
    host: "{{ .context.rendered_name }}-proxy"
    port: "{{ .infra.proxy_port }}"
    protocol: "http"

  valuesMapping: |
    fullnameOverride: "{{ .context.rendered_name }}"
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

and the structured-object form (each string-valued sub-field is template-evaluated; non-string sub-fields pass through). Templates evaluate at source resolution against the same self-contained context as Recipe `locals` — `.context.instance_id`, `.values`, `.infra`, and `.locals`, the node's whole resolved block. Sharing that context means the two surfaces admit and refuse the same reference roots, with one difference in the source template's favour: it evaluates after the whole `locals:` block has resolved, so it reads every local rather than only the entries above it. `.provides` is not on that context, and a source template reaching for its own node's provides halts the build and names the offending reference. That is a fixed property of the surface rather than a gap awaiting later work — a node's locals resolve ahead of its provides so that `provides:` can read `.locals`, and a source template reads those same resolved locals instead of reaching forward for provides. References to `.context.inject` and `.context.uses` are forbidden on the same self-containment grounds; the source URI must resolve before the topology pipe is hydrated and before anything downstream loads the chart, module, or artifact body the URI points at. The full availability rules and forbidden-reference rationale live in [Template Expansion Matrix row #5](../templates/expansion-matrix.md). The canonical use is a Component-exposed `infra.source_version` override threaded into the source's version field — see [entities/component](component.md) "The `infra` Pillar" — so a catalog need not republish a Recipe on every compatible upstream version bump.

**Source field scheme inventory.**
The `source:` field accepts several shape variants in the schema. Each variant's runtime support varies per provider; the table below documents what ships today and what is reserved for future provider work.

| Shape | Example | Status today |
| --- | --- | --- |
| Bare relative filesystem path | `source: "./charts/postgres"` | `available` — every shipping provider (helm, helm-chart, compose) accepts a bare filesystem path string. |
| Bare absolute filesystem path | `source: "/abs/path/to/chart"` | `accepted but blocked` — the schema accepts it and every command that reads the Recipe refuses it: an absolute path names a place on the machine it was written on rather than content inside the Recipe's own directory, so it would not travel with the Recipe. Move the chart into the Recipe's directory and name it relative to it; see [Content paths stay inside the Recipe's own directory](#content-paths-stay-inside-the-recipes-own-directory). |
| Empty string | `source: ""` | `accepted but blocked` — the schema accepts the empty string and no command builds from it, but which refusal you meet depends on the command. `aggrega validate <recipe-file>` renders the Recipe in isolation, and that render names the ambiguity itself along with the two ways out of it: omit the field for sourceless mode, or give it a real path or URI for sourced mode. `aggrega pull` refuses it too, for a different reason and with different advice: pinning cannot infer a source kind from an empty reference, so it reports the reference as ambiguous and points at the structured `{kind, url, version, ...}` form — which is not the fix when a URI was deleted and its key left behind. `aggrega build` reports neither of those: it stops at the lockfile — missing before the first pull, and out of date once you edit a Recipe the lockfile already pins — and with `--auto-pull` it reports the pull refusal instead. Nothing rejects the empty string at the moment the document is read. See [`errors/fatal-halts.md`](../errors/fatal-halts.md) "Recipe `source:` is an empty string". |
| Structured object whose `url:` carries a transport scheme | `source: { url: "oci://…/mariadb", version: "25.0.8" }` | `available` — the built-in source-resolver reads the `{kind, url, version, chart, ref, module_subdir}` form (`url:`'s scheme selects the kind — `oci://` → OCI chart, `https://….tgz` → chart archive, `https://` repo root paired with `chart:` → repo chart — or name it with `kind:`), fetches and pins the artifact at `aggrega pull`, and the build extracts it from the cache. Vendoring a chart locally is supported as an alternative, and is not required. The schema accepts an open structured object so a provider can later declare its own source keys (e.g. a Helm `registry` + `chart` pair) validated by the provider's Wasm plugin — `planned`. See [`providers/helm.md`](../providers/helm.md) "`source:` keyset". |
| Structured object whose `url:` names a filesystem path | `source: { kind: helm-oci-chart, url: "./charts/postgres", version: "1.0.0" }` | `available` — a `url:` carrying no transport scheme names a path, so nothing is fetched and nothing is pinned; the build reads the content from disk. A relative `url:` is anchored to the directory holding the `recipe.yaml` that declares it, and one that leaves that directory — an absolute one included — is refused: the same reading the two bare-path rows above get, and the shape you wrote it in does not change it. Only `url:` decides where the content is read from; the other fields select what *would* be fetched, and still reach the Recipe's templates as `.source.*`. |
| OCI URI (`oci://...`) | `source: "oci://hub.aggrega.ai/recipe/helm/postgres:1.0.0"` | `planned` — design target for catalog distribution. Today's three-tier resolver (local paths, workspace catalogs, remote OCI registry) is documented at [`architecture/13-catalog-and-registry.md`](../../architecture/13-catalog-and-registry.md); the entity-level resolver consumes OCI URIs through that cascade, but the per-Recipe `source:` field's OCI form is not wired in the providers today. |
| Other URL schemes (`https://`, `git+https://`, etc.) | (illustrative) | `planned` — documented as design intent in the architecture's pluggable-source roadmap; no provider support today. |

**How a `source:` path is anchored.**
Anchoring applies to filesystem paths and to nothing else, and it applies whichever of the two shapes carries the path. A relative path is anchored to the directory holding the `recipe.yaml` that declares it, and a path that leaves that directory — an absolute path included — is refused, as [Content paths stay inside the Recipe's own directory](#content-paths-stay-inside-the-recipes-own-directory) explains. A reference carrying a transport scheme — `oci://`, `https://`, `http://`, `git://`, `ssh://`, `git+ssh://`, or any reference ending in `.git` — names something to be fetched rather than a path, so it is carried through exactly as you wrote it and is never joined to a directory.

In the structured shape the path is the `url:` field, and it is read the same way: a relative `url:` is anchored to the directory holding the `recipe.yaml`, one that leaves that directory is refused, and one carrying a transport scheme is fetched. Every other field of a structured `source:` is carried through untouched, the provider-defined ones included.

A `source:` written as a template is anchored against the value the template produces, not against the template's own text. A template names nothing until it has been evaluated, so the reading above is applied to its result: a result that is a relative path is anchored to the directory holding the `recipe.yaml`, one that leaves that directory — an absolute path included — halts the build, and one carrying a transport scheme is carried through and fetched. A template is therefore free to produce any of the shapes in the inventory above, and each is treated exactly as the same value written literally would be; the difference is only when the path can be judged, which for a template is when the build evaluates it rather than when the Recipe is read.

A template that produces nothing — an empty result — leaves the Recipe with no source, which is the sourceless mode. That is distinct from writing `source: ""` yourself, which names neither mode and is refused; see the inventory row above.

The inventory is the canonical reference for what authors can put in `source:` today. Authors targeting future shipping milestones (OCI URI, structured forms validated by the provider's Wasm plugin when it ships) should expect the framings above to update from `planned` to `available` per the four-label taxonomy at [`10-status.md`](../10-status.md).

**Authoring vs. Execution: `.tf.json` as a Compiled Artifact**

`.tf.json` is valid Terraform input — the `terraform` CLI executes it identically to `.tf` HCL. GitOps pipelines (GitHub Actions, Atlantis) and scanning tools (Checkov) handle `.tf.json` the same way they handle standard HCL. *The terraform provider is currently `planned`; this discussion describes the designed flow.*

JSON is suited for machine-to-machine communication, not for manual human authoring. Ops engineers author their Recipes using standard `.tf` HCL files; the Wasm rendering socket generates the final JSON artifacts. The `.tf.json` in the `dist/` folder is a compiled output, following the same authoring-vs-output split established by AWS CDK and CDKTF.

## Content paths stay inside the Recipe's own directory

A Recipe's content lives in the Recipe's own directory, because every file a publication of it carries is taken from there. Every path a Recipe writes for content it carries — its `source:`, whether a bare path or the `url:` of the structured form, and each file its `valuesMapping:`, `workload:` and `artifacts:` entries import with `$import:` — is read against the directory holding the `recipe.yaml` and must stay inside it. Those paths are also what a publication carries: the files they name travel with the Recipe, and nothing else in its directory does (see [`aggrega push`](../cli/aggrega-push.md#bundling)). A path that leaves the directory points at a file that would not travel with the Recipe, so the file is not there for whoever consumes it, and a pin recorded over it would vouch for bytes they cannot obtain.

Two shapes leave the directory, and both are refused:

- a path that climbs above it, such as `../shared/charts/app`;
- an absolute path, such as `/opt/charts/app`, which names a place on the machine it was written on.

A path that climbs and comes back inside is an ordinary path inside the directory: `./charts/../values.tmpl` names the `values.tmpl` beside the Recipe. What is judged is where the path lands, measured from the Recipe's directory without leaving it — so a climb out that names the directory again on the way back, such as `../1.0.0/values.tmpl` written in a directory called `1.0.0`, is refused too. The directory's own name does not travel: a published Recipe is read from a directory the consumer's cache names, where that name finds nothing.

**Where it is refused.** Every command that reads the Recipe refuses such a path as it reads it, before anything is fetched, rendered or published: `aggrega validate`, over the catalog or over the Recipe's own file, `aggrega pull`, `aggrega build`, `aggrega pin` and `aggrega push`. A `source:` written as a template names nothing until the build evaluates it, so a template producing a path outside the directory is refused by the build, at the moment the value exists. The halt is [A path names content outside the entity's own directory](../errors/fatal-halts.md#a-path-names-content-outside-the-entitys-own-directory), and it names the path you wrote.

**What to do instead.** Put the file in the Recipe's directory, or in a directory beneath it, and name it relative to the Recipe: `./charts/app`, `./extras/netpol.yaml`. A chart several Recipes use is copied into each Recipe's directory, since each Recipe is published on its own; a mapping, workload or artifact body several Recipes share belongs in a [MappingLibrary](mappinglibrary.md), [WorkloadLibrary](workloadlibrary.md) or [ArtifactLibrary](artifactlibrary.md), which each Recipe references by identity.

**Why a Release is different.** A Release points at other entities — its Aggregate, its Manifest, the Release it extends — and is never published, so nothing it reads travels anywhere. Those references, and the file its `parameters:` imports, are read as written, which is what lets one Aggregate be shared by Release variants in subdirectories. See [entities/release.md](release.md).

The same bound holds for a FeatureRecipe, and for every schema a Component or a Feature imports.

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

Path resolution matches `valuesMapping:`: a relative path is anchored to the directory holding the `recipe.yaml` that declares it, not to the directory the build is invoked from, and it must stay inside that directory. The imported body is a Go template evaluated in the Recipe's render context, exactly as an inline body is.

**Mode 3: Library `$import:`.** The value is a map with a single `$import:` key carrying a bare-name identity reference to a WorkloadLibrary entry:

```yaml
spec:
  workload:
    $import: BaseWorkloads#/workloads/StatelessService
```

The `#/workloads/` fragment is what selects a Workload entry, and it is the fragment that distinguishes this reference from the `#/mappings/` form `valuesMapping:` uses — that one addresses a MappingLibrary entry and does not name a Workload body. The reference carries no registry host, the resolved version comes from the per-Release lockfile, an optional `:<version>` minimum-version floor may be asserted as `<Library>:<version>#/workloads/<Entry>`, and an entry whose body is itself a field-root `$import:` resolves recursively. The imported body is a Go template evaluated in the consuming Recipe's render context, so `.values`, `.infra` and `.features` flow into it exactly as they do into an inline body. See [entities/workloadlibrary](workloadlibrary.md) for the library entity and the full reference grammar.

The target provider must support synthesis (the standard-library catalog declares `workloadSchema` on such providers by convention); targeting a provider that cannot synthesize is rejected when the node renders, with the provider-capability diagnostic — keyed on provider capability, not on `workloadSchema` presence. For the full Workload grammar, the K8s-shape pass-through fields, and the per-provider translation behavior, see [entities/workload.md](workload.md). For the broader three-input-kinds model and the assembler that merges synthesis with source-rendered output and artifacts, see [architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md).

## The `artifacts:` field — auxiliary manifests

`Recipe.spec.artifacts:` is a map of entry name → artifact-body authoring whose entries emit additional manifest files alongside the Recipe's sourced or synthesized primary output. It is one of the three input kinds (sourced / synthesized / artifacts) — a Recipe may declare `artifacts:` alone, or alongside `workload:` and/or `source:`.

Each entry's value carries one of three content-shape-dispatched modes parallel to `workload:` — inline content, a file `$import:`, or a library `$import:`. The compiler dispatches on the value's content shape; no `$mode:` annotation is needed. The map key names what the entry emits in all three: for the two single-file modes it is the output filename, and for the bundle mode it is the directory the bundle's files are nested under. Because the key names the output, it is bounded to what a single filename can be: a leading letter or digit, then letters, digits, dots, hyphens and underscores. The dots keep the extension a key conventionally carries — `main.tf`, `template.yaml`, `serviceaccount.yaml` — while the alphabet admits no `/`, which would make one key name a path rather than a file, and no leading `.`, so a key can never be the parent-directory segment. A key outside that alphabet fails envelope validation at workspace load, at `aggrega validate`, and in editor diagnostics.

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
    operator-support:
      $import: PlatformArtifacts#/artifacts/OperatorSupport
```

**Mode 1: Inline (Go template string scalar).** The value is a block scalar, and the map key is the output filename, used as written — the first entry above emits `extra-configmap.yaml`.

**Mode 2: File `$import:`.** The value is a map with a single `$import:` key pointing at a local Go-template file, and **the map key is the output filename, exactly as in mode 1**. The imported file supplies the content; it does not supply the name. The second entry above is keyed `network-policy.yaml` and emits `network-policy.yaml`, even though the file it imports is called `network-policy.tmpl`. So an author who wants a particular output filename writes it as the key, and two entries importing different files that happen to share a name — `./extras/shared.yaml` and `./overrides/shared.yaml` — are two distinct outputs. Path resolution matches `valuesMapping:` and `workload:`: a relative path is anchored to the directory holding the `recipe.yaml` that declares it, not to the directory the build is invoked from, and it must stay inside that directory.

**Mode 3: Library `$import:`.** The value is a map with a single `$import:` key carrying a bare-name identity reference to an ArtifactLibrary bundle, `<Library>#/artifacts/<name>`. A bundle is a set of files imported as one unit, so **one entry expands into one output per file in the bundle, each nested under the map key as `<key>/<filename>`** — the key names the consumption site and is the directory those files land in rather than the name of any one of them. The third entry above is keyed `operator-support`; if `PlatformArtifacts#/artifacts/OperatorSupport` declares `crd.yaml` and `rbac.yaml`, that single entry emits `operator-support/crd.yaml` and `operator-support/rbac.yaml`. The reference carries no registry host — a host-bearing `oci://…` form is rejected — the resolved version comes from the per-Release lockfile, and an optional `:<version>` minimum-version floor may be asserted as `<Library>:<version>#/artifacts/<name>`. See [entities/artifactlibrary](artifactlibrary.md) for the library entity and the full reference grammar.

**A file `$import:` is pinned beside the Recipe.** [`aggrega pin`](../cli/aggrega-pin.md) records the digest of each imported file's bytes in the `entity.lock` in the Recipe's directory, keyed by the entry's map key, and `aggrega build` digests the file again and halts with `[CATALOG_ERROR E0026]` when it no longer matches — or first with `E0130` where the Release's lockfile, written before the edit, records the Recipe by what it carries — so a file edited after it was pinned is never rendered unverified. If the change was intended, run `aggrega pin` on the Recipe to record the new digest; otherwise restore the file. An inline entry is part of the Recipe file, and a library entry is pinned by the library version the lockfile records, so neither carries a pin of its own. [`aggrega pull`](../cli/aggrega-pull.md#the-entity-lock) describes the file.

Each artifact entry's template evaluates with the same template context as `valuesMapping:`, whichever mode supplied its body. Two outputs carrying the same filename halt the build when the node renders. Two entries of one `artifacts:` map cannot name one output: a map key is unique within one document and spells a single filename, so a single-file entry's output is its key and a bundle entry's files sit beneath a directory named by its key — the first segment of every path an entry emits is the key that produced it, so distinct keys stay distinct output names whatever the imported files are called. What the halt covers is one filename contributed by two different input kinds — a chart template and an artifact entry both producing `servicemonitor.yaml` — reported against that Recipe with a diagnostic naming every contributing origin.

**Use cases.** `artifacts:` is the home for auxiliary resources that the primary chart or module does not produce: a `NetworkPolicy` accompanying a workload, an `HPA` paired with a Deployment, a sidecar `ConfigMap` keyed off `instance_id`. Cross-cutting auxiliary resources that apply across many components (a backup sidecar attached to every datastore, for example) belong on FeatureRecipe Resource Generation rather than per-Recipe `artifacts:` — see [entities/featurerecipe.md](featurerecipe.md) for the FeatureRecipe extension surface.

## The `outputLabels:` field — author-declared labels on rendered output

`Recipe.spec.outputLabels:` is a map of label key → value that the provider stamps onto every object the Recipe's rendered output produces. It is the honest home for a *realization trait* — a property of how a particular Recipe realizes a component, as opposed to what the component is. Take the storage a realization persists with, written below as the illustrative key `example.io/storage-backing`: a Helm Recipe mounting a PersistentVolumeClaim and a Compose Recipe mounting a named volume realize the same component through different machinery, so they carry different `outputLabels` and downstream tooling (cost allocation, policy, inventory) can tell them apart on the emitted resources. The key is illustrative — `example.io/` is an example namespace, and a catalog picks the keys its own tooling reads.

```yaml
spec:
  capability: helm
  implements: core/datastore/postgres:1.0.0
  outputLabels:
    example.io/storage-backing: persistent-volume
    example.io/team: platform
```

Output labels ride the same rail as the fixed build-provenance labels: they are merged into the label set every emitting surface stamps, so they land wherever provenance lands. What differs is ownership — provenance keys are compiler-owned, `outputLabels` are Recipe-author-owned.

**A component's own identity label is not typed here — a catalog convention, not a rule the compiler enforces.** Keys that state what the component *is* rather than how one Recipe realizes it — its cognitive category, its operational type, its per-role capability labels, who operates the underlying resource, the licensing class of what it wraps — are declared on the Component's `metadata.labels`; see [entities/component](component.md) "The Semantic Label Taxonomy" for the axes. A Recipe puts one of those onto its rendered output by naming the key in `outputComponentLabels:` below, not by typing the key and a value here. The reason is that a literal entry is a *second copy* of a value the component already carries, and a second copy can disagree with the first: a Recipe author can type one posture on a node whose Component declares another, telling a downstream reader something the graph does not say. A promoted entry copies by reference and so has no second copy to drift. The core accepts whichever you write, beyond the reserved-namespace rule below; the convention is upheld by catalog authors.

**Reserved namespaces.** The `aggrega.ai/` and `app.kubernetes.io/` namespaces are reserved for platform-native provenance. A Recipe that declares an `outputLabels` key under either prefix is rejected at load with a clear catalog error naming the offending key. Every other key is accepted. The core does not otherwise police the key or value — a key or value that is not valid for the target engine's label surface is the author's responsibility, and the downstream runtime rejects it; the compiler stays out of the way beyond the reserved-namespace rule.

**Per-provider surfacing.** Each provider translates the labels onto its own output surface:

* **helm, workload synthesis** — on both the object `metadata.labels` and the pod-template `metadata.labels`, matching where synthesis places provenance.
* **helm, source-render and artifacts** — on the object `metadata.labels`.
* **compose** — on each service's `labels:` map.
* **terraform** — as per-resource tags on structurally addressable `.tf.json` artifact bodies, best-effort: a resource block that already declares a `tags` (AWS/azurerm) or `labels` (Google) map receives the output labels there, an author-declared key is never overwritten, and a resource with no such attribute is left untouched (an attribute is never invented). Native-HCL bodies (`main.tf`, `*.tf`) and vendored modules emit verbatim and carry no injected tags. Terraform provenance continues to travel in its companion comment file, separate from the tag rail.

Output labels are labels only; there is no separate output-annotation surface. `outputLabels` is declared by the Recipe author (the ops-authored realization layer), not by the Aggregate — it describes the realization, never the developer's abstract-graph identity.

## The `outputComponentLabels:` field — promoting a component's own labels

`Recipe.spec.outputComponentLabels:` is a list of label **keys**, not of key-value pairs. For each key it names, the provider stamps that key onto the rendered output with the value the key carries on the component instance being rendered. Where `outputLabels` states a value, `outputComponentLabels` names where the value is to be read from.

```yaml
spec:
  capability: helm
  implements: core/datastore/postgres:1.0.0
  outputLabels:
    example.io/team: platform
  outputComponentLabels:
    - component.aggrega.ai/hosting
```

Given a Component whose `metadata.labels` declare `component.aggrega.ai/hosting: managed`, every object this Recipe renders for that component carries `component.aggrega.ai/hosting: managed`. Bind the same Recipe to a component declaring `self-hosted` and that component's objects carry `self-hosted` instead — one Recipe, one named key, a value per component.

**Promotion is by reference, and that is the point.** The value is read from the component whenever output is rendered, so it cannot drift from the identity it came from: there is no second copy to keep in step when the component's label changes. A literal `outputLabels` entry restating a component's label *is* that second copy, and the two disagree the moment either one moves. So reach for `outputLabels` when the value is a property of how this Recipe realizes the component, and for `outputComponentLabels` when the value already exists on the component and the rendered output should carry it too.

A promoted key lands on exactly the same surface as a literal one — the per-provider surfacing described above applies unchanged, and no provider distinguishes a key that was promoted from one that was written in place.

**Reserved namespaces.** The `aggrega.ai/` and `app.kubernetes.io/` namespaces are reserved for platform-native provenance, and a promoted key under either prefix is rejected at load with a catalog error naming the key and the field it appears in. The test is the bare prefix: a key such as `component.aggrega.ai/hosting` sits in a namespace of its own rather than under the reserved root, and is promotable.

**A key belongs to one block or the other.** Declaring the same key in both `outputLabels` and `outputComponentLabels` is rejected at load, so every stamped key has a single source — either the literal value written on the Recipe or the component's own label, never both.

**A promoted key the component does not declare stamps nothing.** The build continues and emits a warning naming the node, the Recipe and the missing key. This is deliberate: a Recipe bound to components whose label sets differ still renders, and the discrepancy is surfaced rather than halted on.

**Single-posture components — a convention, not a rule.** Promotion carries whatever value the component declares, and the compiler does not interpret that value. A component whose identity label holds a placeholder standing in for "varies" therefore promotes that placeholder onto every object rendered for it. Where a component genuinely has more than one posture, the standard-library catalog convention is for each Recipe to state the posture of *its own* realization through an `outputLabels` key the Recipe owns, rather than through the component's identity key, which the same convention routes through `outputComponentLabels:` instead — or to stamp nothing at all. The two keys answer different questions and neither replaces the other: the identity key says what the component is across every realization, the Recipe-owned key says what this one realization does. That is a catalog convention upheld by its authors, not a constraint the compiler enforces.

## The `locals:` block

`Recipe.spec.locals:` is the **Private Ops State** — a map of named Go template strings whose rendered output exposes a `.locals.*` map to the Recipe's later templates. It is the workspace for computing physical realities (target containers, JSON paths, derived hostnames) once and reusing them across `provides:`, `source:`, `valuesMapping:`, `workload:`, `artifacts:`, `assertions:`, and `pipeline[].with` payloads without recomputation.

```yaml
spec:
  capability: helm
  implements: core/postgres-db:1.0.0
  source: ./charts/postgresql
  locals:
    primary_compute: postgresql
    listen_port: "5432"
    secret_target_db_password: "postgres-auth"
    volumes_path: "/spec/template/spec/volumes"
  valuesMapping: |
    primary:
      auth:
        existingSecret: "{{ .context.rendered_name }}-{{ .locals.secret_target_db_password }}"
```

`locals:` is never exposed to callers — downstream components consuming this Recipe via `uses:` see only `provides:`. The Recipe's own `provides:`, `source:`, `valuesMapping:`, `workload:`, `artifacts:`, `assertions:`, and `pipeline[].with` templates all see the resolved `.locals.*` map. Per-key values may be plain strings or Go templates; the compiler resolves the whole block in the locals preamble, ahead of that node's `provides:`, so every later template observes stable resolved values.

Each entry evaluates against a self-contained node-local context: `.context.instance_id`, `.values`, `.infra`, and the entries of this same block already resolved. A local cannot read `.provides` — that pillar is not on this surface, and an entry reaching for it halts. Nor can it read `.context.rendered_name`, the name a provider such as `helm` gives the resources it renders for the node, so a local naming one of those resources carries only the part after that name, as `secret_target_db_password` does above, and the template writing the full name joins the two.

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

**The check follows an alias for the block.** A key reached through the dot a `with .locals` body rebinds, or through a variable bound to `.locals`, is checked on exactly the terms the direct spelling gets: `{{ with .locals }}{{ .nope }}{{ end }}` and `{{ $l := .locals }}{{ $l.nope }}` both halt naming `.locals.nope`, just as `{{ .locals.nope }}` does. Two spellings escape the check. One is a key reached through a call whose result the template text cannot name — `{{ index .locals "nope" }}` — because what such a call yields is decided when the template runs rather than by what is written. The other is a key read off a parenthesised block — `{{ (.locals).nope }}` or `{{ ($.locals).nope }}` — where the key hangs off the value the parentheses yield rather than off the block itself. An absent key read off a parenthesised block does not halt, and it renders the literal text `<no value>` rather than nothing at all. An absent key reached through `index` halts, naming the key, because `index` halts on every template surface when the map it reads does not hold the key it is asked for — a different report from this check's, documented at [errors/fatal-halts.md](../errors/fatal-halts.md) under "A template indexes a map with a key the map does not hold". `index` therefore remains the way to reach a key whose name is itself computed, such as `{{ index .locals (printf "secret_target_%s" .values.slot) }}`, and a computed name the block does not declare is still reported by its key.

`provides:` reads `.locals` and receives resolved values, because a node's locals resolve before its provides. A `provides:` template naming a key the locals block does not declare halts. This means a value both a `provides:` entry and an artifact need is authored **once**, in `locals:`, and read from both places.

For the public-API counterpart, see [The `provides:` block](#the-provides-block) below. The FeatureRecipe surface follows the same rules — see [entities/featurerecipe.md](featurerecipe.md) "The `locals:` block".

## The `provides:` block

`Recipe.spec.provides:` is the **Public Developer API** — a map of name → Go template string declaring the values this Recipe contributes to downstream callers' `.context.inject` and `.context.uses` pipes. The compiler evaluates `provides:` templates at provides evaluation (self-contained, any order); callers' `inject` keys resolve against these values at inject hydration.

```yaml
spec:
  capability: helm
  implements: core/postgres-db:1.0.0
  source: ./charts/postgresql
  provides:
    # The Service this chart names after its release name, suffixed "-postgresql"
    host: "{{ .context.rendered_name }}-postgresql"
    port: "5432"
    database: "{{ .values.db_name }}"
```

Each entry's template evaluates against the self-contained provides-evaluation surface — `.context.instance_id`, `.context.rendered_name` where the node's provider reports one, `.values`, `.infra`, the node's resolved `.locals`, and static text. The namespace the node is placed in is not on it, so a published host carries none: a consumer in another namespace qualifies it on its own side. `.locals` is on it because the node's locals resolve in the preamble of the same stage, ahead of its provides; a `provides` template naming a key the locals block does not declare halts. Separating provides evaluation from inject hydration is load-bearing: a Recipe's `provides:` cannot reference any caller's state because callers have not been resolved when provides evaluation runs — `provides:` is self-contained per the architectural invariant. Callers then read these values via `.context.uses.<alias>.provides.<provided-name>` in their own templates — the provided names nest under `provides` on the edge, alongside the edge's other fields. A caller that declares an `inject:` allowlist on the edge reaches the same values through its `.context.inject` pipe instead.

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

An attachment written on one of the component's connections — a credential the component presents to one target — is read in the same shape under that connection, at `.context.uses.<alias>.features.<slot>`, and is never among `.features`. A Recipe reaching several targets reads each target's own credential under that target's alias, and a loop over `.features` that picks attachments out by type meets only the component's own:

```yaml
artifacts:
  routes.yaml: |
    {{- range $alias, $edge := .context.uses }}
    - name: {{ $alias }}
      {{- with $edge.features }}{{ with .credential }}
      api_key_secret: {{ .provides.name }}
      {{- end }}{{ end }}
    {{- end }}
```

See [A connection's attachments](../templates/template-context-contract.md#a-connections-attachments--contextusesaliasfeatures) for the shape and for the order a template ranges the connections in.

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

`Recipe.spec.assertions:` is an optional map of **named** rules expressing **implementation invariants of the Recipe** — cross-field rules that hold given the specific chart or module the Recipe sources. Each key is a rule identifier that appears in the failure message; each value is a Go template body. Unlike Component assertions (which express contract-level invariants regardless of which Recipe binds), Recipe assertions are properties of the specific implementation chosen.

```yaml
spec:
  implements: core/datastore/mariadb:^1.0.0
  source:
    # Planned provider-declared form; the built-in resolver today uses { kind, url, version }.
    chart: oci://registry-1.docker.io/bitnamicharts/mariadb
    version: "20.0.0"
  assertions:
    # Bitnami 20.x: serviceMonitor namespace requirement.
    service-monitor-namespace-required: |
      {{- if and (eq .values.architecture "replication") .values.metrics.serviceMonitor.enabled -}}
        {{- if not .values.metrics.serviceMonitor.namespace -}}
          {{- fail "Bitnami MariaDB 20.x requires metrics.serviceMonitor.namespace when architecture=replication and metrics.serviceMonitor.enabled=true" -}}
        {{- end -}}
      {{- end -}}
```

The rule above is specific to Bitnami chart 20.x; it does not apply if a different MariaDB Recipe binds. The Component-level rules from the contract still apply alongside, evaluated at an earlier pipeline phase.

Recipe assertions evaluate after Recipe binding and before rendering, once every node's locals and provides are resolved. The template context includes the Recipe's `.provides`, `.locals`, and `.recipe.source` in addition to the entity-instance fields (`.values`, `.infra`, `.uses`, `.features`). `.uses` and `.features` there are the assertion surface's narrower shapes, not a Recipe template's: a connection's entry carries its target and alias, the target's `labels`, the connection's own `values` and the attachments written on it under `features`, but nothing the target publishes; and an attachment's entry, the component's own or a connection's, carries its `type`, `resolved_version` and `values` but neither its `infra` nor its `provides` — an attachment's FeatureRecipe has not resolved its provides when the assertion runs. A reference to `.features.<name>.provides` therefore halts, and a presence-aware read of it returns its fallback. For the full authoring grammar, the responsibility split between contract-level and implementation-level rules, and worked examples, see [templates/assertions-block.md](../templates/assertions-block.md).

## The `omits:` field — leaving rendered documents out of a source

Most Recipes never need this. It is for a source you take as it is — a chart fetched from a registry, most often — that renders a document your Release must not ship: a Secret the chart generates afresh on every render, say, which makes two builds differ and, once applied, overwrites the Secret the operator supplied. You do not edit a fetched chart, and no ignore rule reaches into one, so `omits:` is how a Recipe leaves such a document out of the build.

```yaml
spec:
  capability: helm
  implements: core/gateway/kong:1.0.0
  source:
    kind: helm-oci-chart
    url: oci://registry.example.com/charts/gateway
    version: "2.4.0"
  omits:
    # The chart generates this key on every render; the operator supplies it.
    - kind: Secret
      name: "{{ .context.rendered_name }}-session-key"
    # Left out only where the Release asks for it.
    - when: "{{ .infra.without_dashboards }}"
      kind: ConfigMap
      name: "{{ .context.rendered_name }}-dashboards"
      namespace: monitoring
```

**What it covers.** Only what `source:` renders. A `workload:` and the `artifacts:` entries are never filtered: you write those in the Recipe, so a document you do not want there is one you leave unwritten. The key requires `source:`, and a Recipe on the `eval` provider cannot declare it; a document breaking either rule is refused when it is read, naming the rule.

**An entry.** Each entry names the documents to leave out by three fields, and a fourth decides whether it applies:

- `kind` — the kind of a rendered document: `Secret`, `ConfigMap`, `Deployment`. It is unrelated to the `kind:` a structured `source:` carries, which names how the source is fetched.
- `name` — the document's `metadata.name`.
- `namespace` *(optional)* — the namespace the document is in. Without it the entry names the kind and name in any namespace; a `namespace` that renders to nothing is treated as absent.
- `when` *(optional)* — whether the entry applies to this build. It is evaluated first and read by the same rule a pipeline step's [`when:`](featurerecipe.md#conditional-steps--when) is: a false result drops the entry, so its other fields are not evaluated and it is neither handed to the provider nor checked, while an absent or empty `when:` keeps it.

`kind` and `name` are required, and an entry carrying any other field is refused when the Recipe is read.

**Every value is a template**, evaluated against the same context as `valuesMapping:`. That context carries `.context.rendered_name`, the name the provider gives the node's resources and the one a chart typically names them after, so an entry can name a document exactly as the chart will. A template that fails to render halts the build as a failing `valuesMapping:` template does.

**Every entry that applies must leave something out.** The provider reports how many documents each entry matched, and an entry that matched none stops the build, naming the entry; see [An omits entry left out nothing the source rendered](../errors/fatal-halts.md#an-omits-entry-left-out-nothing-the-source-rendered). A source upgrade that renames or removes the document is the usual cause, and the halt is what keeps a renamed document from reaching your output unnoticed. To leave a document out only sometimes, say so with `when:` rather than relying on the document being absent.

**The source still renders in full.** Only its output is filtered: every template of the chart still runs, so a template that fails still fails the build, and a document left out is rendered and then dropped. Once dropped it reaches nothing the build does afterwards — no emitted file, no name compared with other components' names, no fact a Feature reads about the render, nothing a pipeline step is handed.

**A Release reaches the key through `infra` and `parameters`.** The key belongs to the Recipe, so a Release cannot write it. It can still decide what an entry does: an entry's templates read the `infra` the Release fills in, and the `parameters` it supplies reach the Recipe's `.values` wherever the Aggregate routes them there. So a Release switches an entry on or off with `when:`, as the second entry above does, or decides what it names.

**What you leave out is yours to answer for.** Nothing in the build knows what a document is for. Leaving out one the rest of the chart depends on at runtime — the Secret a Deployment mounts, the ServiceAccount a pod runs as — produces output that builds cleanly and then fails when it is applied, unless something else applied beside it provides that document.

**Which providers honour it.** Leaving a document out is something only the provider can do, because only the provider knows what its source renders, so whether a provider honours the key is part of the provider's own declaration. A Recipe declaring `omits:` whose provider does not honour it is refused before anything renders, whatever its entries' `when:` render to; see [The provider does not support omits](../errors/fatal-halts.md#the-provider-does-not-support-omits).

| Provider | `omits:` |
| --- | --- |
| `helm` | Honoured. An entry names a document the chart renders — from a template or from its `crds/` directory — by the document's own `kind`, `metadata.name` and, where the entry names one, the namespace the document is in. See [helm → Sourced mode](../providers/helm.md#sourced-mode). |
| `compose`, `cloudformation` | Refused, until the provider honours the key. |
| `helm-chart`, `terraform` | Refused: the provider hands its source on to be rendered when it is deployed, so no document exists at build time to leave out. For a local chart or module, a line in the `.aggregaignore` beside the Recipe leaves a file of it out instead. |

The same key is authored on a FeatureRecipe; see [entities/featurerecipe.md](featurerecipe.md#the-omits-field--leaving-rendered-documents-out-of-a-source).
