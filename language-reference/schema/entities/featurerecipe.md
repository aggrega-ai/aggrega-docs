# Aggrega Infrastructure Base (FeatureRecipe) schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/featurerecipe-v1alpha1.schema.json`

Ops-authored definitions mapping Dev abstract features to concrete, versioned Go plugin pipelines. Strictly 1:1 with a physical provider and catalog feature.

See the [featurerecipe authoring reference](../../../entities/featurerecipe/) for prose guidance on authoring featurerecipe entities; this page documents the structural schema that reference describes.

**Top-level type:** `object`

## Properties

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `apiVersion` | const "aggrega.ai/v1alpha1" | yes | Constant: `"aggrega.ai/v1alpha1"` |
| `kind` | const "FeatureRecipe" | yes | Constant: `"FeatureRecipe"` |
| `metadata` | object | yes |  |
| `spec` | object | yes | The render-engine capability binding, mapping, pipeline, and inject mapping for a FeatureRecipe. Carries the same three input kinds as a Recipe (sourced, synthesized, artifacts) plus the FeatureRecipe-only injectMapping; a pure-wiring FeatureRecipe declaring only capability and implements is valid and renders nothing. |

_Additional properties are not permitted._

#### `featurerecipe.metadata`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes |  |
| `version` | string | yes | Strict Semantic Versioning of the feature plugin pipeline (e.g., 1.2.5). |
| `description` | string | no | A concise, one-sentence summary of what the entity does. |
| `maintainers` | object[] | no | List of maintainers who own this entity. |
| `license` | string | no | Legal compliance license (e.g., Apache-2.0). |
| `repository` | string | no | The URL to the Git repository where the source files live. |
| `home` | string | no | The URL of this entity's home page, wiki, or documentation. |
| `keywords` | string[] | no | A list of descriptive keywords for UI discoverability. |
| `deprecated` | boolean | no | Indicates whether this entity is deprecated and should no longer be used. |

_Additional properties are not permitted._

##### `featurerecipe.metadata.maintainers[]`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes |  |
| `email` | string | no |  |
| `url` | string | no |  |

_Additional properties are not permitted._

#### `featurerecipe.spec`

The render-engine capability binding, mapping, pipeline, and inject mapping for a FeatureRecipe. Carries the same three input kinds as a Recipe (sourced, synthesized, artifacts) plus the FeatureRecipe-only injectMapping; a pure-wiring FeatureRecipe declaring only capability and implements is valid and renders nothing.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `capability` | string | yes | The explicit render-engine capability this recipe binds to (e.g., 'helm', 'terraform', 'compose') — the provider engine kind that renders it. |
| `implements` | string | yes | Declares which catalog Feature type this recipe is able to implement (including credential Features labeled feature.aggrega.ai/kind: secret; exact version, major-compatible range '^', or unversioned). The compiler uses it to verify Manifest mappings and to suggest candidates in diagnostics and editor completion; it never resolves a build. The Manifest mapping is the user's explicit deployment choice, pinned in the lockfile. |
| `locals` | map of string | no | The Private Ops State. Internal computation results available only within this FeatureRecipe's templates as '.locals.*'. Each entry is itself a Go template, evaluated against a self-contained context: '.context.instance_id' (the HOST COMPONENT this attachment is resolving for, which is what that reference denotes on every template surface), '.attachment_name' (the attachment instance being resolved, and the only route to that name from a local), the attachment's own '.values' and '.infra', and the entries of this same block resolved so far. Entries resolve in the order they are written, and an entry MAY read a sibling defined ABOVE it, receiving that sibling's resolved value rather than its template text. Author order is part of the contract wherever one entry reads another: moving a definition below its reader breaks the build, and the block is never reordered to make a reference resolve. A direct '.locals.<key>' reference to an entry this block defines LATER halts naming the ordering fault; a direct reference to a key the block does not declare at all halts naming the key. Only direct '.locals.<key>' references are checked — a key reached indirectly, through 'index .locals', a 'with .locals' block, or a variable bound to '.locals', is not analysed, and an absent key reached that way renders as an empty value. This FeatureRecipe's locals resolve BEFORE its provides, so a provides template may read '.locals' and receives resolved values, while a provides template naming a key this block does not declare halts. The rules are the same ones a Recipe's locals block follows. Used to export physical realities (e.g., target containers, JSON paths) for downstream Wasm plugins. Never exposed to callers — use provides for the public API. |
| `provides` | map of string | no | The Public Developer API. Contractual output variables available for downstream Caller inject resolution. |
| `source` | string or object | no | Optional path to infrastructure code. Accepts a Universal URI string or an open structured object. If provided alongside valuesMapping, the compiler renders it and appends the objects to the base AST before Wasm plugins execute. |
| `valuesMapping` | string or object | no | Values mapping content with three authoring modes via content-shape dispatch. Mode 1 (inline): a Go template string scalar producing the provider's expected values format. Mode 2 (file import): a YAML map of exactly one key, `$import: ./relative/path.tmpl`, pointing at a local Go-template file. Mode 3 (library import): a YAML map of exactly one key, `$import: <Library>#/mappings/<entry>`, referencing a MappingLibrary entry by bare-name identity (the version is supplied by the per-Release lockfile; no registry host appears in the reference). |
| `workload` | string or object | no | Workload YAML producer with three authoring modes via content-shape dispatch. Mode 1 (inline): a Go template string scalar whose output parses as 'aggrega.ai/v1alpha1 Workload'. Mode 2 (file import): a YAML map of exactly one key, `$import: ./relative/path.yaml`, pointing at a local Go-template file. Mode 3 (library import): a YAML map of exactly one key, `$import: <Library>#/workloads/<entry>`, referencing a WorkloadLibrary entry by bare-name identity (the version is supplied by the per-Release lockfile; no registry host appears in the reference). The target Provider's engine must support workload synthesis; the standard-library catalog declares workloadSchema on such providers as the documented contract. A workload: FeatureRecipe bound to a provider whose engine cannot synthesize halts loudly at render time. A synthesized FeatureRecipe workload emits its provider-native manifests under the feature's output directory. |
| `artifacts` | map of string or object | no | Map of output filename to artifact-content authoring. Each entry's value carries one of three modes via content-shape dispatch. Mode 1 (inline): a Go template string scalar whose output is the artifact body. Mode 2 (file import): a YAML map of exactly one key, `$import: ./relative/path.yaml`, pointing at a local Go-template file. Mode 3 (library import): a YAML map of exactly one key, `$import: <Library>#/artifacts/<entry>`, referencing an ArtifactsLibrary bundle by bare-name identity (the version is supplied by the per-Release lockfile; no registry host appears in the reference). A bundle expands into one output per file, each named by the bundle's authored filename. Map keys become output filenames verbatim. The auxiliary resources a resource-generating FeatureRecipe emits (ConfigMap, ServiceMonitor, NetworkPolicy, ExternalSecret CRD, etc.) are artifact-shaped; artifacts: is the primary resource-generation mechanism. Collisions across artifact entries, bundle files, source output, and workload synthesis are load-time or render-time errors. |
| `injectMapping` | string | no | Optional inline Go template evaluated during the Pre-Render Interception phase. Outputs a JSON/YAML dictionary that the Go compiler natively deep-merges over the Caller's '.context.inject' memory pipe. Used for Wasm-free Caller-Side mutation of environment variables and delivery contracts. |
| `pipeline` | object[] | no | Sequential list of Wasm plugins to execute for stateful AST mutation. |
| `executionScope` | string (enum) | no | Whether this FeatureRecipe's Resource Generation runs per-component (default, today's behavior) or once per boundary attachment. Boundary-scope FeatureRecipes deduplicate by (boundary_path, FR-instance) and receive a different TemplateContext shape (.boundary.* pillars instead of per-component .context.* pillars). The injectMapping of inject mapping continues to fan per-consumer regardless of executionScope. Allowed values: `"component"`, `"boundary"` Default: `"component"` |
| `assertions` | map of string | no | Build-time cross-field validation. Each entry is a named assertion: the key is a stable rule identifier surfaced in error messages; the value is a Go template string with `{{ fail "message" }}` halt semantics. Multiple named assertions per entity evaluate per-instance in author-declared order; the first failing assertion halts the build. FeatureRecipe assertions evaluate after recipe binding (post-binding, post-allProvides-evaluation, pre-render) and express implementation invariants of the specific wrapped chart or module. Template context: .values / .infra / .uses / .features / .metadata plus .provides / .locals / .recipe. The evaluator uses missingkey=error: references to undefined keys halt with a no-such-key diagnostic. Because the bare reference halts before any fallback can run, a plain `default` does not supply an optional-field fallback on this surface — gate the reference with `hasKey`, or read it through `index` and then apply `default`, or use the `optional` helper, which performs the presence check directly. |
| `sourceDigests` | object[] | no | Content pins for the remote sources this feature recipe references, frozen at resolution from the fetched bytes and read back at build to verify the cached source has not drifted. Each entry mirrors the resolved-source identity {kind, url, chart, version} plus the content digest (and, for an OCI-distributed source, the manifest digest). One entry per distinct resolved-source identity the recipe fetches. Local (filesystem-relative) sources are never pinned. Written by the resolution phase into a writable recipe file; a recipe fetched from a registry arrives pre-pinned. |
| `artifactDigests` | object[] | no | Content pins for the external files this feature recipe's artifacts import via $import, frozen at resolution and read back at build to verify the imported file has not drifted. One entry per artifact whose value is a file import; an inline (literal) artifact is already part of the entity and carries no separate pin. Written by the resolution phase into a writable recipe file. |

_Additional properties are not permitted._

##### `featurerecipe.spec.pipeline[]`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | yes | A unique programmatic identifier for this step, allowing downstream plugins to reference its outputs. |
| `plugin` | string | yes | The URI of the Plugin entity this step runs (e.g. `name:version` or `provider/name:version`). The entity's spec.plugin is the content-addressed .wasm artifact; the build resolves the entity to its artifact and loads the bytes. A bare .wasm or artifact reference is not accepted here. |
| `function` | string | yes | The exported Wasm function to invoke. |
| `with` | string | no | Inline Go template evaluating to a JSON/YAML map that strictly satisfies this plugin's explicit input schema. |
| `optional` | boolean | no | When true, a failure of this step (a guest trap, a patch targeting a document not present in the set, a malformed patch, or an error-severity diagnostic) is downgraded to a loud warning: the pre-step document set is restored, this step's output is discarded, and the pipeline continues. When false or absent, any step failure halts the build after restoring the pre-step document set. |
| `when` | string | no | Inline Go template evaluated at pipeline-walk time. When it renders a falsy value the step is skipped — a pass-through: the document set flows to the next step unchanged, contributing no patches, side effects, or step record. An empty or absent `when` always runs the step. Truthiness follows the standard convention for boolean-like template output: the strings `true`/`True`/`TRUE`, any nonzero number, and any other non-empty string are true, while `false`/`False`/`FALSE`, the empty string, and zero are false. `when` and `optional` are independent: a step may declare both. |

_Additional properties are not permitted._

##### `featurerecipe.spec.sourceDigests[]`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `kind` | string | yes | The resolved source kind (e.g. helm-oci-chart, helm-https-chart, compose-https-fragment, terraform-module-git). |
| `url` | string | yes | The authored source URL the digest pins — the identity URL as written in spec.source.url (a repo root or a direct .tgz for helm-https). Build reconstructs this same URL offline, so it is the stable identity the pin is keyed on, not a resolved artifact location. |
| `chart` | string | no | The chart name for a repo-root helm source (spec.source.chart), part of the resolved-source identity so two charts served from one repo root at the same version pin distinctly. Absent for a direct .tgz, OCI, compose, or git source, where the URL alone identifies the artifact. |
| `version` | string | yes | The concrete pinned version the source resolved to. |
| `digest` | string | yes | The SHA-256 content digest (sha256:<hex>) of the fetched source archive, verified against the cached bytes at build. |
| `manifestDigest` | string | no | The OCI manifest digest for an OCI-distributed source — the independent root of trust. Present only for an OCI source (a helm-oci-chart); absent for an https or git source, which carries no manifest by construction. |

_Additional properties are not permitted._

##### `featurerecipe.spec.artifactDigests[]`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | The artifact key (the artifacts: map key) whose $import file this entry pins. |
| `digest` | string | yes | The SHA-256 content digest (sha256:<hex>) of the imported file's bytes, verified at build. |

_Additional properties are not permitted._
