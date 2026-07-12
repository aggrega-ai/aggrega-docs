# Aggrega Internal Template Context schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/template-context-v1alpha1.schema.json`

The runtime view assembled by the Go compiler and injected into Recipe and FeatureRecipe Go templates during Step 5. For credential FeatureRecipes (implementing Features labeled feature.aggrega.ai/kind: secret), the compiler additionally populates .secret_name and .inject with the secret-specific context. For boundary-scope FeatureRecipes (spec.executionScope: boundary), the .context, .workload, .secret_name, .inject, and .inject_raw pillars are absent and a .boundary.* pillar is populated instead — see the boundary block at the bottom of properties. This is NOT persisted to disk; it exists only in compiler memory during rendering. This schema documents the contract between the compiler and Ops template authors.

Phase B sub-pass availability: Pass 1 (provides): partial pillars (self-ref banned). Phase B.0 (locals + source eval): all pillars; .source and .workload absent. Phase B.1 (valuesMapping): all pillars + .source; .workload absent. Phase B.2 (workload eval): all pillars + .source; .workload being evaluated (absent from self-reference). Phase B.3 (artifacts): all pillars + .source + .workload (fullest context).

**Top-level type:** `object`

## Properties

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `context` | object | yes | The compiler-assembled execution context providing identity, topology, and delivery data. |
| `values` | object | yes | The opaque cognitive payload for this node, already validated by the schema validator in Step 1. Passed through untouched. |
| `infra` | object | yes | The physical sizing payload injected from the Release for this node. Bypasses the Developer entirely. |
| `locals` | map of string | yes | The Recipe's own private state (e.g., primary_compute, volumes_path). Available for self-referencing within valuesMapping, provides templates, and for downstream Wasm plugins via pipeline[].with blocks. Never exposed to callers. |
| `provides` | map of string | no | The Recipe's public API contract. Populated from Pass 1 evaluation. Available in Phase B valuesMapping for self-reference (e.g., {{ .provides.host }}). NOT available within the provides template itself (Pass 1 self-containment invariant). Callers resolve inject keys against these values. |
| `features` | map of object | no | The attached features for this node, keyed by instance name. Available for Base Recipes to conditionally adapt rendering based on attached capabilities. |
| `secrets` | map of object | no | The attached credential Features for this node, keyed by instance name. |
| `metadata` | object | no | Release and compilation metadata providing global identity for deterministic naming. Available in all template blocks (valuesMapping, injectMapping, pipeline with). |
| `secret_name` | string | no | Only populated when rendering a credential FeatureRecipe. Contains the logical secret key name from the Component's secretsSchema or the Developer's secrets: block (e.g., 'admin_password', 'db_credentials'). Used to construct deterministic physical secret names (e.g., '{{ .context.instance_id }}-{{ .secret_name }}'). |
| `inject` | object | no | Only populated when rendering a credential FeatureRecipe. Contains the secret-specific inject block from the Developer's secrets entry (e.g., { env: { OPENAI_API_KEY: 'api_token' } }). Distinct from .context.inject which is the base component's pre-hydrated delivery pipe from uses edges. Evaluates to null/absent for non-credential FeatureRecipes and base Recipes. |
| `inject_raw` | object or null | no | The immutable, unmutated Developer intent for the inject block. Evaluates to null if the Developer omitted the inject block entirely. Used by Ops for logical checks (e.g., {{ if not .inject_raw }}) to detect omission before Phase A mutations. |
| `steps` | map of object | no | Pipeline inter-step communication. Only available inside Wasm pipeline 'with:' blocks. Each key is a pipeline step ID, containing the outputs exported by that step. |
| `source` | string or object or null | no | Resolved source field content. Populated at Phase B.0 from the Recipe's source: field after Go-template evaluation. Available in Phase B.1+ (valuesMapping, workload, artifacts). Evaluates to null when the Recipe has no source:. String form = URI path; object form = structured source (e.g., OCI descriptor with resolved version). |
| `workload` | workload-v1alpha1.schema.json or null | no | Parsed Workload spec for this node. Populated at Phase B.2 from the Recipe's workload: field after Go-template evaluation + Workload JSON-schema validation (against workload-v1alpha1.schema.json). Available in Phase B.3+ (artifacts) so artifacts can reference workload fields without duplication (e.g., a ServiceMonitor reading .workload.services.metrics.ports.prom). Evaluates to null when the Recipe has no workload: block. Template attempts to dereference .workload.* on a null value fail with a clear error at template eval time. |
| `boundary` | object | no | Boundary-scope context — populated only when evaluating a FeatureRecipe whose spec.executionScope is 'boundary'. Component-scope FRs do not receive this pillar; their context.instance_id, context.inject, context.uses, and the .workload pillar carry per-component data instead. Boundary-scope FRs receive .boundary.* in place of those per-component pillars. |

_Additional properties are not permitted._

#### `template-context.context`

The compiler-assembled execution context providing identity, topology, and delivery data.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `instance_id` | string | yes | The absolute flattened ID of the current node (e.g., 'backend' or 'data-layer.main-db'). Deterministic and stable across compilations for the same Aggregate. |
| `labels` | map of string | no | The duck-typing and ontology labels of the current node, including any mutations applied by mutator.wasm in Step 2. |
| `annotations` | object | no | The three cascading annotation buckets for the current node, segregated by origin. |
| `inject` | object | yes | The pre-hydrated and intercepted delivery pipe. Starts as a compiler-generated map resolving Developer inject keys to Target provides values. Mutated in-place by Phase A injectMapping deep-merges. By the time the Base Recipe renders in Phase B, this contains the fully resolved physical strings. |
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

The pre-hydrated and intercepted delivery pipe. Starts as a compiler-generated map resolving Developer inject keys to Target provides values. Mutated in-place by Phase A injectMapping deep-merges. By the time the Base Recipe renders in Phase B, this contains the fully resolved physical strings.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `env` | map of string | no | Environment variable delivery. Keys are the Developer's local variable names, values are the resolved target strings. |
| `file` | map of string | no | File mount delivery. Keys are local file paths, values are the resolved target strings. |
| `arg` | map of string | no | Command-line argument delivery. Keys are flag prefixes, values are the resolved target strings. |
| `all` | map of string | no | Pre-calculated flat merge of env + file + arg + custom mechanisms. Populated after Pass 2b and recalculated after Phase A. Templates use {{ toJson .context.inject.all }} for universal serialization. |

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

Only populated when rendering a credential FeatureRecipe. Contains the secret-specific inject block from the Developer's secrets entry (e.g., { env: { OPENAI_API_KEY: 'api_token' } }). Distinct from .context.inject which is the base component's pre-hydrated delivery pipe from uses edges. Evaluates to null/absent for non-credential FeatureRecipes and base Recipes.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `env` | map of string | no | Secret-specific environment variable delivery. |
| `file` | map of string | no | Secret-specific file mount delivery. |
| `arg` | map of string | no | Secret-specific argument delivery. |
| `all` | map of string | no | Compiler-generated convenience merge of all secret inject paradigms. |

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
| `feature_attachments` | object[] | no | List of features directly attached to this boundary (for cross-feature reference within boundary scope). |

_Additional properties are not permitted._

## Definitions

### `enriched_edge`

A single enriched topological edge assembled by the compiler. Contains the target's resolved identity, provides, and cascaded annotations.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `target` | string | yes | The absolute flattened ID of the target node (e.g., 'data-layer.main-db'). |
| `socket` | string | yes | The usesSchema category this edge belongs to (e.g., 'databases', 'apis'). |
| `source` | string | no | The absolute flattened ID of the source (consumer) node. Populated for boundary-scope views that key per-consumer outputs by the consumer node. |
| `source_namespace` | string | no | Raw aggrega.ai/namespace annotation of the source endpoint (empty when absent). Opaque data for a provider engine's network-identity resolution; the core does not interpret it. |
| `source_boundary_path` | string | no | Boundary path of the source endpoint, used by a provider engine's no-namespace network fallback. |
| `target_namespace` | string | no | Raw aggrega.ai/namespace annotation of the target endpoint (empty when absent). Opaque data for a provider engine's network-identity resolution. |
| `target_boundary_path` | string | no | Boundary path of the target endpoint, used by a provider engine's no-namespace network fallback. |
| `provides` | map of string | yes | The target node's fully resolved provides dictionary. Evaluated in Pass 1 of Step 5 before inject pre-hydration. |
| `inject` | object | yes | The Developer's original inject mapping for this edge (keys = local variable names, values = target provides keys). This is the RAW mapping, not the resolved values. |
| `labels` | map of string | no | The target node's duck-typing and ontology labels (post-mutation from Step 2). |
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
