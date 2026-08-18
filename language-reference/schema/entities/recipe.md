# Aggrega Infrastructure Base (Recipe) schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/recipe-v1alpha1.schema.json`

Ops-authored pointer and mapping layer connecting Dev intent to a specific infrastructure provider. Strictly 1:1 with a physical provider and catalog component.

See the [recipe authoring reference](../../entities/recipe.md) for prose guidance on authoring recipe entities; this page documents the structural schema that reference describes.

**Top-level type:** `object`

## Properties

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `apiVersion` | const "aggrega.ai/v1alpha1" | yes | Constant: `"aggrega.ai/v1alpha1"` |
| `kind` | const "Recipe" | yes | Constant: `"Recipe"` |
| `metadata` | object | yes |  |
| `spec` | object | yes | The provider binding, source, value mapping, and pipeline for a Recipe. Supports three input kinds composed by addition: sourced (source plus valuesMapping overlay), synthesized (workload), and artifacts (named output files). |

_Additional properties are not permitted._

#### `recipe.metadata`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes |  |
| `version` | string | yes | Strict Semantic Versioning of the implementation recipe (e.g., 2.1.0). |
| `description` | string | no | A concise, one-sentence summary of what the entity does. |
| `maintainers` | object[] | no | List of maintainers who own this entity. |
| `license` | string | no | Legal compliance license (e.g., Apache-2.0). |
| `repository` | string | no | The URL to the Git repository where the source files live. |
| `home` | string | no | The URL of this entity's home page, wiki, or documentation. |
| `keywords` | string[] | no | A list of descriptive keywords for UI discoverability. |

_Additional properties are not permitted._

##### `recipe.metadata.maintainers[]`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes |  |
| `email` | string | no |  |
| `url` | string | no |  |

_Additional properties are not permitted._

#### `recipe.spec`

The provider binding, source, value mapping, and pipeline for a Recipe. Supports three input kinds composed by addition: sourced (source plus valuesMapping overlay), synthesized (workload), and artifacts (named output files).

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `capability` | string | yes | The explicit provider capability this recipe binds to (e.g., 'helm', 'terraform', 'compose', 'eval') — the provider kind that renders it. Accepts an optional version pin, in the same three forms as 'implements': unversioned ('helm'), exact ('helm:1.0.0'), or major-compatible range ('helm:^1.0.0'). The bare name selects the provider kind; the pin, when present, selects which version of the provider-rendering plugin serving that capability renders this recipe — highest available when unpinned, exact for an exact pin, highest-in-range for a caret. A pin that no serving plugin version satisfies halts the build loudly. Everything downstream of provider selection — output grouping, path segments, pipeline compatibility, and codec choice — keys on the bare capability, so two recipes pinning different plugin versions of the same capability coexist in one build. |
| `implements` | string | yes | Declares which catalog component type this recipe is able to implement (exact version 'core/api-server:1.0.0', major-compatible range 'core/api-server:^1.0.0', or unversioned 'core/api-server'). The compiler uses it to verify Manifest mappings and to suggest candidates in diagnostics and editor completion; it never resolves a build. The Manifest mapping is the user's explicit deployment choice, pinned in the lockfile. |
| `source` | string or object | no | The location of the infrastructure code. Accepts a Universal URI string, or an open structured object whose provider-defined keys are exposed to the Recipe's templates as '.source.*'. |
| `locals` | map of string | no | The Private Ops State. Internal computation results available within this Recipe's templates as '.locals.*'. Each entry is itself a Go template, evaluated against a self-contained node-local context: '.context.instance_id', '.values', '.infra', and the entries of this same block resolved so far. Entries resolve in the order they are written, and an entry MAY read a sibling defined ABOVE it, receiving that sibling's resolved value rather than its template text. Author order is part of the contract wherever one entry reads another: moving a definition below its reader breaks the build, and the block is never reordered to make a reference resolve. A direct '.locals.<key>' reference to an entry this block defines LATER halts naming the ordering fault; a direct reference to a key the block does not declare at all halts naming the key. Only direct '.locals.<key>' references are checked — a key reached indirectly, through 'index .locals', a 'with .locals' block, or a variable bound to '.locals', is not analysed, and an absent key reached that way renders as an empty value. A local cannot read '.provides': that pillar is not part of this context, and an entry reaching for it halts. The resolved values reach provides, source, valuesMapping, workload, artifacts, assertions, and pipeline[].with (and pipeline[].when) — this Recipe's locals resolve BEFORE its provides, so a provides template may read '.locals' and receives resolved values, while a provides template naming a key this block does not declare halts. Used to export physical realities (e.g., target containers, JSON paths) for downstream Wasm plugins. Never exposed to callers — use provides for the public API. |
| `provides` | map of string or number or boolean | no | The Public Developer API. Contractual output variables available for downstream Caller inject resolution. The compiler evaluates provides templates against a self-contained context, in any order among themselves — no provides entry reads another. The node's locals resolve in the locals preamble, ahead of its provides, so a provides template may read '.locals' and receives resolved values; naming a key the locals block does not declare halts. Callers resolve inject keys against these values at inject hydration. Values are scalars — the pipe carries them blindly and stringifies deterministically at the injection boundary. |
| `valuesMapping` | string or object | no | Values mapping content with three authoring modes via content-shape dispatch. Mode 1 (inline): a Go template string scalar (typically block-scalar YAML `\|`) producing the provider's expected values format from Aggrega context (.values, .features, .infra). Mode 2 (file import): a YAML map of exactly one key, `$import: ./relative/path.tmpl`, pointing at a local Go-template file. Mode 3 (library import): a YAML map of exactly one key, `$import: <Library>#/mappings/<entry>`, referencing a MappingLibrary entry by bare-name identity (the version is supplied by the per-Release lockfile; no registry host appears in the reference). |
| `workload` | string or object | no | Workload YAML producer with three authoring modes via content-shape dispatch. Mode 1 (inline): a Go template string scalar whose output parses as 'aggrega.ai/v1alpha1 Workload'. Mode 2 (file import): a YAML map of exactly one key, `$import: ./relative/path.yaml`, pointing at a local Go-template file. Mode 3 (library import): a YAML map of exactly one key, `$import: <Library>#/workloads/<entry>`, referencing a WorkloadLibrary entry by bare-name identity (the version is supplied by the per-Release lockfile; no registry host appears in the reference). The target Provider must support workload synthesis; the standard-library catalog declares workloadSchema on such providers as the documented contract. A workload: Recipe bound to a provider that cannot synthesize halts loudly at render time. |
| `artifacts` | map of string or object | no | Map of entry name to artifact-content authoring. Each entry's value carries one of three modes via content-shape dispatch. Mode 1 (inline): a Go template string scalar whose output is the artifact body. Mode 2 (file import): a YAML map of exactly one key, `$import: ./relative/path.yaml`, pointing at a local Go-template file. Mode 3 (library import): a YAML map of exactly one key, `$import: <Library>#/artifacts/<entry>`, referencing an ArtifactsLibrary bundle by bare-name identity (the version is supplied by the per-Release lockfile; no registry host appears in the reference). A bundle expands into one output per file, each named by the bundle's authored filename. A mode-1 entry's key is its output filename, used as written; a mode-2 entry's output takes the imported file's own name rather than the key. Collisions across artifact entries, bundle files, source output, workload synthesis halt the build when the node renders. |
| `outputLabels` | map of string | no | Recipe-author-declared labels stamped onto every object this recipe's rendered output produces, provider-translated onto each provider's label surface (Kubernetes metadata.labels for helm synthesis, source-render, and artifacts; Compose service labels; per-resource tags on Terraform .tf.json artifact bodies). They ride the same rail as the fixed provenance labels but are author-owned rather than compiler-owned. The aggrega.ai/ and app.kubernetes.io/ namespaces are reserved for platform-native provenance and are rejected at load. A key or value that is not a valid label for the target provider is the recipe author's responsibility; the core does not police label charset beyond the reserved-namespace rule. |
| `outputComponentLabels` | string[] | no | Component identity-label keys this recipe promotes onto its rendered output. Each entry names a label key; the value is taken from the labels of the component instance this recipe renders, so the stamped label carries that component's declared value rather than one repeated here. Promoted labels reach the same label surface as outputLabels, which instead carries literal key-value pairs authored in place. A key declared in both blocks is rejected at load, so each stamped key has a single source. The aggrega.ai/ and app.kubernetes.io/ namespaces are reserved for platform-native provenance and are rejected at load; a scoped key such as component.aggrega.ai/hosting lies outside those reserved roots and may be promoted. |
| `pipeline` | object[] | no | Sequential list of Wasm plugins to execute for stateful AST mutation directly on the base infrastructure. |
| `assertions` | map of string | no | Build-time cross-field validation. Each entry is a named assertion: the key is a stable rule identifier surfaced in error messages; the value is a Go template string with `{{ fail "message" }}` halt semantics. Multiple named assertions per entity evaluate per-instance in author-declared order; the first failing assertion halts the build. Recipe assertions evaluate after recipe binding (post-binding, post-allProvides-evaluation, pre-render) and express implementation invariants of the specific wrapped chart or module. Template context: .values / .infra / .uses / .features / .metadata plus .provides / .locals / .recipe. The evaluator uses missingkey=error: references to undefined keys halt with a no-such-key diagnostic. Because the bare reference halts before any fallback can run, a plain `default` does not supply an optional-field fallback on this surface — gate the reference with `hasKey`, or read it through `index` and then apply `default`, or use the `optional` helper, which performs the presence check directly. |
| `sourceDigests` | object[] | no | Content pins for the remote sources this recipe references, frozen at resolution from the fetched bytes and read back at build to verify the cached source has not drifted. Each entry mirrors the resolved-source identity {kind, url, chart, version} plus the content digest (and, for an OCI-distributed source, the manifest digest). One entry per distinct resolved-source identity the recipe fetches; a recipe whose source resolves to different identities per consuming instance carries one entry per identity. Local (filesystem-relative) sources are never pinned. Written by the resolution phase into a writable recipe file; a recipe fetched from a registry arrives pre-pinned. |
| `artifactDigests` | object[] | no | Content pins for the external files this recipe's artifacts import via $import, frozen at resolution and read back at build to verify the imported file has not drifted. One entry per artifact whose value is a file import; an inline (literal) artifact is already part of the entity and carries no separate pin. Written by the resolution phase into a writable recipe file. |

_Additional properties are not permitted._

##### `recipe.spec.pipeline[]`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | yes | A unique programmatic identifier for this step, allowing downstream plugins to reference its outputs. |
| `plugin` | string | yes | The URI of the Plugin entity this step runs (e.g. `name:version` or `provider/name:version`). The entity's spec.plugin is the content-addressed .wasm artifact; the build resolves the entity to its artifact and loads the bytes. A bare .wasm or artifact reference is not accepted here. |
| `function` | string | yes | The exported Wasm function to invoke. |
| `with` | string | no | Inline Go template evaluating to a JSON/YAML map that strictly satisfies this plugin's explicit input schema. |
| `optional` | boolean | no | When true, a failure of this step (a guest trap, a patch targeting a document not present in the set, a malformed patch, or an error-severity diagnostic) is downgraded to a loud warning: the pre-step document set is restored, this step's output is discarded, and the pipeline continues. When false or absent, any step failure halts the build after restoring the pre-step document set. |
| `when` | string | no | Inline Go template evaluated at pipeline-walk time. When it renders a falsy value the step is skipped — a pass-through: the document set flows to the next step unchanged, contributing no patches, side effects, or step record. An empty or absent `when` always runs the step. Truthiness follows the standard convention for boolean-like template output: the strings `true`/`True`/`TRUE`, any nonzero number, and any other non-empty string are true, while `false`/`False`/`FALSE`, the empty string, and zero are false. `when` and `optional` are independent: a step may declare both. |

_Additional properties are not permitted._

##### `recipe.spec.sourceDigests[]`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `kind` | string | yes | The resolved source kind (e.g. helm-oci-chart, helm-https-chart, compose-https-fragment, terraform-module-git). |
| `url` | string | yes | The authored source URL the digest pins — the identity URL as written in spec.source.url (a repo root or a direct .tgz for helm-https). Build reconstructs this same URL offline, so it is the stable identity the pin is keyed on, not a resolved artifact location. |
| `chart` | string | no | The chart name for a repo-root helm source (spec.source.chart), part of the resolved-source identity so two charts served from one repo root at the same version pin distinctly. Absent for a direct .tgz, OCI, compose, or git source, where the URL alone identifies the artifact. |
| `version` | string | yes | The concrete pinned version the source resolved to. |
| `digest` | string | yes | The SHA-256 content digest (sha256:<hex>) of the fetched source archive, verified against the cached bytes at build. |
| `manifestDigest` | string | no | The OCI manifest digest for an OCI-distributed source — the independent root of trust. Present only for an OCI source (a helm-oci-chart); absent for an https or git source, which carries no manifest by construction. |

_Additional properties are not permitted._

##### `recipe.spec.artifactDigests[]`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | The artifact key (the artifacts: map key) whose $import file this entry pins. |
| `digest` | string | yes | The SHA-256 content digest (sha256:<hex>) of the imported file's bytes, verified at build. |

_Additional properties are not permitted._
