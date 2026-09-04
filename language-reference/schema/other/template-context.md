# Aggrega Internal Template Context schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/template-context-v1alpha1.schema.json`

The runtime view assembled by the Go compiler and injected into Recipe and FeatureRecipe Go templates during rendering. When rendering an attachment FeatureRecipe the compiler additionally populates .attachment_name and .inject with the attachment-scoped context. For boundary-scope FeatureRecipes (spec.executionScope: boundary), the .context, .workload, .attachment_name, .inject, and .inject_raw pillars are absent and a .boundary.* pillar is populated instead — see the boundary block at the bottom of properties. This is NOT persisted to disk; it exists only in compiler memory during rendering. This schema documents the contract between the compiler and Ops template authors.

Base-rendering stage availability, in the order the stages run: Provides evaluation (locals preamble, then provides): node-local pillars only. A locals entry reads the entries above it in its own block; a provides template reads the node's whole resolved .locals. Self-reference banned (no provides entry reads another). Source resolution (locals publication + source eval): all pillars; .source and .workload absent. Those locals are published onto .locals here, then source: is evaluated against them. Values mapping (valuesMapping): all pillars + .source; .workload absent. Workload synthesis (workload eval): all pillars + .source; .workload being evaluated (absent from self-reference). Artifact evaluation (artifacts): all pillars + .source + .workload (fullest context).

**Top-level type:** `object`

## Properties

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `context` | object | yes | The compiler-assembled execution context providing identity, topology, and delivery data. |
| `values` | object | yes | The opaque cognitive payload for this node, already validated by the schema validator at resolution. Passed through untouched. |
| `infra` | object | yes | The physical sizing payload injected from the Release for this node. Bypasses the Developer entirely. |
| `locals` | map of string | yes | The Recipe's own private state (e.g., primary_compute, volumes_path). Evaluated in the locals preamble — ahead of that node's provides — and published onto this pillar at source resolution. Each entry is a Go template evaluated against a self-contained node-local context carrying the entries of the same block resolved so far, so an entry MAY read a sibling defined ABOVE it and receives that sibling's resolved value. Author order is part of the contract wherever one entry reads another: moving a definition below its reader breaks the build. A '.locals.<key>' reference to a later entry, or to a key the block does not declare, halts. The check reads the path a reference RESOLVES to rather than the keystrokes, so it covers the direct form, a read inside a '{{ with .locals }}' block, and a read through a variable bound directly to '.locals' alike; a reference whose path the template text does not decide — one reached through a function, such as 'index .locals', or through a 'with' block or a variable binding whose pipeline applies one — is not analysed and renders as an empty value when absent. A locals entry cannot read '.provides'. Available in provides (at provides evaluation, after the preamble), source, valuesMapping, workload, artifacts, assertions, and to downstream Wasm plugins via pipeline[].with (and pipeline[].when). Never exposed to callers. |
| `provides` | map of string | no | The Recipe's public API contract. Populated from provides evaluation. Available in base-rendering valuesMapping for self-reference (e.g., {{ .provides.host }}). NOT available within the provides template itself (the provides self-containment invariant). Callers resolve inject keys against these values. |
| `features` | map of template_attachment | no | Every attachment on this node, keyed by the instance name the author gave it. One pillar carries them all whatever they produce — an operational Feature, a credential Feature, an identity Feature — because what differs between attachments is what they produce, not how a template reads them. A Recipe reads them to adapt its rendering to the attached capabilities and to consume what an attachment publishes. |
| `metadata` | object | no | Release and compilation metadata providing global identity for deterministic naming. Available in all template blocks (valuesMapping, injectMapping, pipeline with). |
| `attachment_name` | string | no | Only populated when rendering an attachment FeatureRecipe. Contains the attachment's instance name — the slot it fills in the owning entity's featuresSchema, or the free name the author gave it (e.g., 'admin_password', 'db_credentials'). Used to construct deterministic resource names (e.g., '{{ .context.instance_id }}-{{ .attachment_name }}'). |
| `inject` | object | no | Only populated when rendering an attachment FeatureRecipe that carries an authored inject block (e.g., { env: { OPENAI_API_KEY: 'api_token' } }). Distinct from .context.inject which is the base component's pre-hydrated delivery pipe from uses edges. Evaluates to null/absent for attachments with no authored inject and for base Recipes. |
| `inject_raw` | object or null | no | The immutable, unmutated Developer intent for the inject block. Evaluates to null if the Developer omitted the inject block entirely. Used by Ops for logical checks (e.g., {{ if not .inject_raw }}) to detect omission before the mutations of inject mapping. |
| `steps` | map of object | no | Pipeline inter-step communication. Only available inside Wasm pipeline 'with:' blocks. Each key is a pipeline step ID, containing the outputs exported by that step. |
| `source` | string or object or null | no | Resolved source field content. Populated at source resolution from the Recipe's source: field after Go-template evaluation. Available from values mapping onward (valuesMapping, workload, artifacts). Evaluates to null when the Recipe has no source:. String form = URI path; object form = structured source (e.g., OCI descriptor with resolved version). |
| `workload` | workload-v1alpha1.schema.json or null | no | Parsed Workload spec for this node. Populated at workload synthesis from the Recipe's workload: field after Go-template evaluation + Workload JSON-schema validation (against workload-v1alpha1.schema.json). Available from artifact evaluation onward (artifacts) so artifacts can reference workload fields without duplication (e.g., a ServiceMonitor reading .workload.services.metrics.ports.prom). Evaluates to null when the Recipe has no workload: block. Template attempts to dereference .workload.* on a null value fail with a clear error at template eval time. |
| `boundary` | object | no | Boundary-scope context — populated only when evaluating a FeatureRecipe whose spec.executionScope is 'boundary'. Component-scope FRs do not receive this pillar; their context.instance_id, context.inject, context.uses, and the .workload pillar carry per-component data instead. Boundary-scope FRs receive .boundary.* in place of those per-component pillars. |

_Additional properties are not permitted._

#### `template-context.context`

The compiler-assembled execution context providing identity, topology, and delivery data.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `instance_id` | string | yes | The absolute flattened ID of the current node (e.g., 'backend' or 'data-layer.main-db'), written into the alphabet every authored component name satisfies. Deterministic and stable across compilations for the same Aggregate. It is the name the compiler gives the resources it builds itself — a workload it synthesized, an artifact set it placed — so an address published for one of those is built from this value. |
| `rendered_name` | string | no | The name the provider bound to this node gives the resources it renders from source the author supplied — the name the supplied templates themselves render against, such as the release name a chart reads. Read it when publishing an address for a resource a supplied chart or module named, because the provider may spell that name in a poorer alphabet than an authored component name is written in and the two then differ. Empty when the bound provider derives no such name: the resources of a synthesized workload and of a placed artifact set are named after the node's identity, so publish '{{ .context.instance_id }}' for those, and a Recipe that wrote its own resource names already knows them. Reading this key where the bound provider reports no name halts the build and says which to write instead. |
| `labels` | map of string | no | The duck-typing and ontology labels of the current node, including any mutations applied by mutator.wasm at topology construction. |
| `annotations` | object | no | The three cascading annotation buckets for the current node, segregated by origin. |
| `inject` | object | yes | The pre-hydrated and intercepted delivery pipe. Starts as a compiler-generated map resolving Developer inject keys to Target provides values. Mutated in-place by the injectMapping deep-merges. By the time the Base Recipe renders, this contains the fully resolved physical strings. |
| `uses` | map of enriched_edge | yes | The enriched topological edge map. Keyed by the Developer's alias (e.g., 'my_db', 'my_api'). Each entry is a compiler-assembled view of the target node's identity, resolved provides, injection mapping, and cascaded annotations. This is NOT the raw IR edge — it is an enriched projection built by the compiler specifically for template consumption. |

_Additional properties are not permitted._

##### `template-context.context.annotations`

The three cascading annotation buckets for the current node, segregated by origin.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `release` | map of string | no | Physical topology strings cascading from Release boundaries. |
| `catalog` | map of string | no | Immutable intrinsic traits authored by the Platform Architect in Domain 2. |
| `aggregate` | map of string | no | Cognitive metadata cascading from Aggregate subsystems. |

_Additional properties are not permitted._

##### `template-context.context.inject`

The pre-hydrated and intercepted delivery pipe. Starts as a compiler-generated map resolving Developer inject keys to Target provides values. Mutated in-place by the injectMapping deep-merges. By the time the Base Recipe renders, this contains the fully resolved physical strings.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `env` | map of string | no | Environment variable delivery. Keys are the Developer's local variable names, values are the resolved target strings. |
| `file` | map of string | no | File mount delivery. Keys are local file paths, values are the resolved target strings. |
| `arg` | map of string | no | Command-line argument delivery. Keys are flag prefixes, values are the resolved target strings. |
| `all` | map of string | no | Pre-calculated flat merge of env + file + arg + custom mechanisms. Populated after uses-inject resolution and recalculated after inject mapping. Templates use {{ toJson .context.inject.all }} for universal serialization. |

#### `template-context.metadata`

Release and compilation metadata providing global identity for deterministic naming. Available in all template blocks (valuesMapping, injectMapping, pipeline with).

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `release_name` | string | no | The name of the Release driving this deployment (e.g., 'prod-billing'). Used by Ops to construct globally unique cloud resource names (S3 buckets, IAM roles). Combined with .context.instance_id to guarantee uniqueness across environments. |
| `release_version` | string | no | The semantic version of the Release. |
| `environment` | string | no | The environment string from the Release metadata (e.g., 'production', 'local'). |
| `aggregate_name` | string | no | The name of the root Aggregate being compiled. |

_Additional properties are not permitted._

#### `template-context.inject`

Only populated when rendering an attachment FeatureRecipe that carries an authored inject block (e.g., { env: { OPENAI_API_KEY: 'api_token' } }). Distinct from .context.inject which is the base component's pre-hydrated delivery pipe from uses edges. Evaluates to null/absent for attachments with no authored inject and for base Recipes.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `env` | map of string | no | Attachment-scoped environment variable delivery. |
| `file` | map of string | no | Attachment-scoped file mount delivery. |
| `arg` | map of string | no | Attachment-scoped argument delivery. |
| `all` | map of string | no | Compiler-generated convenience merge of every attachment inject paradigm. |

#### `template-context.boundary`

Boundary-scope context — populated only when evaluating a FeatureRecipe whose spec.executionScope is 'boundary'. Component-scope FRs do not receive this pillar; their context.instance_id, context.inject, context.uses, and the .workload pillar carry per-component data instead. Boundary-scope FRs receive .boundary.* in place of those per-component pillars.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `path` | string | no | The boundary's evaluated directory path (post-template-evaluation). Same string used for per-(path, provider) dispatch grouping at orchestrator-time. |
| `boundary_name` | string | no | The boundary's name (the map key in release.spec.boundaries). |
| `components` | object | no | Map of instance_id to ComponentInfo for every component in the boundary's subtree (recursive, includes nested-boundary components). Each entry carries the component's resolved type URI, instance ID, and provided values from per-component provides evaluation. |
| `internal_uses_edges` | object[] | no | Uses edges where source AND target are both in this boundary's subtree. |
| `outgoing_cross_boundary_uses_edges` | object[] | no | Uses edges where source is in subtree, target is outside. Used by compose-bridge: which outbound connections need the bridge to proxy. |
| `incoming_cross_boundary_uses_edges` | object[] | no | Uses edges where target is in subtree, source is outside. Used by ingress-style aggregators that need to know who's calling in. |
| `cross_boundary_uses_edges` | object[] | no | Convenience union of outgoing and incoming cross-boundary edges. |
| `labels` | map of string | no | Union of components' labels in the subtree, with author-order preservation. |
| `annotations` | map of string | no | The boundary's own annotations after the cascade resolves. |
| `feature_attachments` | template_attachment[] | no | The attachments directly attached to this boundary (for cross-attachment reference within boundary scope), in the same attachment shape .features carries. |

_Additional properties are not permitted._

## Definitions

### `template_attachment`

One attachment as a template reads it: the per-instance view of an attached Feature. Every attachment exposes the same fields regardless of what it produces, so .features.<name> reads the same way whether that name is a slot the entity declared or a free attachment.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `type` | string | no | The Catalog Feature URI of the attached Feature. |
| `resolved_version` | string | no | The attached Feature's version after Manifest resolution — the version actually bound for this build, read as .features.<name>.resolved_version. Mirrors .context.uses.<alias>.resolved_version, so an attachment and an edge report a bound version the same way. Empty when the attachment's type resolves to no Catalog entity. |
| `labels` | map of string | no | The attached Feature's Catalog labels, carried verbatim in the order the Feature declares them — nothing is filtered, renamed or prefix-stripped, so a template reads exactly what the Feature's author wrote. Lets a template branch on what the attached Feature is rather than on its name or its URI. Mirrors .context.uses.<alias>.labels. The key is absent altogether when the Feature declares no labels and when the attachment's type resolves to no Catalog entity, so guard with `if` or range over the map before addressing an individual label. |
| `values` | object | no | The attachment's own developer-intent pillar, carried verbatim from the attachment declaration. |
| `infra` | object | no | The attachment's own operational-sizing pillar, carried verbatim from the attachment declaration. |
| `provides` | map of string | no | The resolved public contract of the FeatureRecipe bound to this attachment — the emitted resource's name, its key, an identity, and any additional produced keys — exposed to the consumer as .features.<name>.provides.<key>. The consumer reads these values instead of re-deriving the attachment's physical identity. An attachment whose bound FeatureRecipe publishes nothing carries no provides key at all rather than an empty map, so a template guards before addressing an individual key. |

_Additional properties are not permitted._

### `enriched_edge`

A single enriched topological edge assembled by the compiler. Contains the target's resolved identity, provides, and cascaded annotations.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `target` | string | yes | The absolute flattened ID of the target node (e.g., 'data-layer.main-db'). |
| `socket` | string | yes | The usesSchema category this edge belongs to (e.g., 'databases', 'apis'). |
| `source` | string | no | The absolute flattened ID of the source (consumer) node. Populated for boundary-scope views that key per-consumer outputs by the consumer node. |
| `source_namespace` | string | no | Raw aggrega.ai/namespace annotation of the source endpoint (empty when absent). Opaque data for a provider's network-identity resolution; the core does not interpret it. |
| `source_boundary_path` | string | no | Boundary path of the source endpoint, used by a provider's no-namespace network fallback. |
| `target_namespace` | string | no | Raw aggrega.ai/namespace annotation of the target endpoint (empty when absent). Opaque data for a provider's network-identity resolution. |
| `target_boundary_path` | string | no | Boundary path of the target endpoint, used by a provider's no-namespace network fallback. |
| `provides` | map of string | yes | The target node's fully resolved provides dictionary. Evaluated at provides evaluation, before inject hydration. |
| `inject` | object | yes | The Developer's original inject mapping for this edge (keys = local variable names, values = target provides keys). This is the RAW mapping, not the resolved values. |
| `labels` | map of string | no | The target node's duck-typing and ontology labels (post-mutation from topology construction). |
| `annotations` | object | no | The target node's three cascading annotation buckets. |
| `component` | string | no | The target node's Catalog component type URI (e.g., 'core/postgres'). |
| `resolved_version` | string | no | The target node's resolved SemVer. |
| `boundary_path` | string | no | The target node's physical spatial hierarchy from the Release (e.g., 'aws-eks-cluster/backend-ns'). |
| `origin_feature` | string | no | If this edge was autonomously declared by a Feature (including credential Features labeled feature.aggrega.ai/kind: secret), the Feature instance name. Null/absent for Developer-declared edges. |

_Additional properties are not permitted._

#### `enriched_edge.inject`

The Developer's original inject mapping for this edge (keys = local variable names, values = target provides keys). This is the RAW mapping, not the resolved values.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `env` | map of string | no |  |
| `file` | map of string | no |  |
| `arg` | map of string | no |  |

#### `enriched_edge.annotations`

The target node's three cascading annotation buckets.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `release` | map of string | no | Physical topology strings from the target node's Release boundaries. |
| `catalog` | map of string | no | Immutable traits from the target node's Catalog entity. |
| `aggregate` | map of string | no | Cognitive metadata from the target node's Aggregate subsystems. |

_Additional properties are not permitted._
