# Aggrega Capability-Agnostic Graph (IR) schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/ir-v1alpha1.schema.json`

The flattened, fully resolved 1-dimensional graph emitted by the Topology Builder.

**Top-level type:** `object`

## Properties

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `apiVersion` | const "aggrega.ai/v1alpha1" | yes | Constant: `"aggrega.ai/v1alpha1"` |
| `kind` | const "IR" | yes | Constant: `"IR"` |
| `metadata` | object | yes |  |
| `spec` | object | yes |  |

_Additional properties are not permitted._

#### `ir.metadata`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `aggregate_name` | string | yes | The Aggregate's metadata.name. Follows IR snake_case convention. |

_Additional properties are not permitted._

#### `ir.spec`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `nodes` | object | yes | Dictionary of all application nodes, keyed by their absolute ID. Purely topological. |
| `edges` | object[] | yes | Explicit logical network paths and dependencies between nodes. |
| `feature_markers` | string[] | yes | Explicit canonical strings (e.g., semantic_routing, data_masking) derived from annotations, utilized for downstream Feature Negotiation. |
| `values_mapping` | object | yes | The single source of truth for opaque pass-through cognitive payloads, mapped by node ID. |
| `infra_mapping` | object | yes | The physical sizing payload injected from the Release, mapped by node ID. |
| `feature_values_mapping` | object | yes | Normalized map of Node IDs to their attached Feature configurations. One bucket carries every attachment on a node whatever it produces — operational Features, credential Features, identity Features — keyed by the instance name the author gave each attachment. |
| `boundary_features` | object | no | Un-folded projection of each boundary's Feature attachments, keyed by boundary path then by instance name. Mirrors the boundaries' feature attachments as the single source both lock-time source resolution and the render-time boundary-scope dispatch read, so neither re-walks the routing tree. Present only when the graph has boundary-level Feature attachments. |
| `provenance` | object | yes | Traceability metadata for diagnostics and auditing. |

_Additional properties are not permitted._

##### `ir.spec.edges[]`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `source` | string | yes |  |
| `target` | string | yes |  |
| `socket` | string | no | The usesSchema category this edge belongs to (e.g., 'databases', 'tools'). |
| `alias` | string | no | The developer-defined alias for this connection (e.g., 'primary_db'). |
| `origin_feature` | string | no | If this edge was autonomously declared by a Feature (including credential Features labeled feature.aggrega.ai/kind: secret), this identifies the Feature type URI. Allows Wasm plugins to isolate their own topology. |
| `origin_feature_instance` | string | no | The per-attachment instance name of the Feature that declared this edge. Locates a boundary-scope FeatureRecipe's resolved provides by instance, disambiguating two attachments of the same Feature type on one boundary. |
| `origin_release` | boolean | no | True when this edge was created by a Release wiring a declared-but-unbound socket to an existing component. Marks edge AUTHORSHIP, not configuration: a developer-declared edge that a Release merely supplied infra for stays Aggregate-origin (origin_release unset; its Release infra appears in the edge's infra map). origin_feature set => Feature-origin; origin_release true => Release-origin; neither => Aggregate-origin. |
| `values` | object | no | Resolved per-connection developer values for this edge (from the Aggregate edge), validated at resolution against the valueSchema declared by the source socket (the socket on the consuming component, which is the edge's source) and projected into the consuming node's render context at .uses.<alias>.values. Keys the author omitted are filled from the socket's declared defaults; an authored value wins. |
| `infra` | object | no | Resolved per-connection infra for this edge (Aggregate-seeded and/or Release-supplied), validated at resolution against the infraSchema declared by the source socket (the socket on the consuming component, which is the edge's source) and projected at .uses.<alias>.infra. Keys the author omitted are filled from the socket's declared defaults; an authored value wins. |
| `inject` | object | no | Agnostic injection routing. Maps local variables to Target provides keys. |

_Additional properties are not permitted._

###### `ir.spec.edges[].inject`

Agnostic injection routing. Maps local variables to Target provides keys.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `env` | map of string | no |  |
| `file` | map of string | no |  |
| `arg` | map of string | no |  |

##### `ir.spec.provenance`

Traceability metadata for diagnostics and auditing.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `schema_version` | string | yes |  |
| `compiler_version` | string | yes | Mandatory compliance stamp. Identifies the specific Go compiler binary used to generate this graph. |
| `aggregate_version` | string | yes | The exact semantic version of the root Aggregate intent used during compilation. |
| `manifest_version` | string | yes | The exact semantic version of the Manifest lockfile used during compilation. |
| `release_version` | string | yes | The exact semantic version of the Release routing file used during compilation. |
| `source_identifiers` | string[] | yes |  |

_Additional properties are permitted._

## Definitions

### `Maintainer`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | no |  |
| `email` | string | no |  |
| `url` | string | no |  |

### `FieldProvenance`

Origin of one leaf in an attachment's values or infra payload.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `origin` | string | yes | Whether the leaf was authored explicitly or contributed by the annotation-driven expansion pass. |
| `side` | string | no | Authoring surface the annotation was declared on; empty for explicit leaves. |
| `annotation_key` | string | no | Annotation name that contributed this leaf; empty for explicit leaves. |
| `annotation_source` | string | no | Source location of the annotation declaration as <file-path>:<dotted-yaml-key-path>; empty for explicit leaves. |
| `overridden_annotation` | FieldProvenance | no | The annotation contribution that lost this leaf to an explicit one: when an explicit leaf overwrote an annotation-contributed leaf, the suppressed provenance it replaced. Singular — exactly one suppressed contribution is ever retained. |

_Additional properties are not permitted._

### `IRFeatureEntry`

One resolved attachment for a node, carried in feature_values_mapping. Every attachment family shares this shape — an operational Feature, a credential Feature, an identity Feature — so no family gets a lossier projection than another. What a credential attachment's values carries is the author's choice: a by-reference credential carries a pointer into a secret store, a by-value one carries the material itself, and the compiler carries whichever was written verbatim without resolving either.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `type` | string | yes | URI of the Catalog Feature this attachment requests. |
| `resolved_version` | string | yes | The exact semantic version resolved during compilation. |
| `labels` | map of string | no | The attached Feature's catalog labels, carried verbatim in the order its catalog entity declares them — never filtered, normalised or prefix-stripped, so a consumer reads exactly what the catalog author wrote. The compiler reads none of them. Empty when the Feature declares no labels, and when its type resolves to no catalog entity. |
| `catalog_annotations` | map of string | no | The attached Feature's catalog annotations — the metadata.annotations of the Feature entity this attachment names — carried verbatim in the order that entity declares them, never filtered, normalised or prefix-stripped, so a consumer reads exactly what the catalog author wrote, including keys in the author's own namespace. The compiler reads none of them. Distinct from annotation_key and annotation_source, which name and locate the annotation that caused this attachment to exist at all: those two report how the attachment came to be, this one reports the metadata of the entity it names, and an attachment written in a features: block carries these annotations while carrying neither of those. Empty when the Feature declares no annotations, and when its type resolves to no catalog entity. |
| `binding` | string | no | Names the host Component attachment slot this attachment fills, or "free" when it fills no declared slot. The pairing is by name — a deployment fills a slot by attaching a Feature under the slot's name — so the value is an exact key from the resolved Component's declared slot set, never anything read out of the name itself. The slot name is carried rather than a bare boolean because which slot was filled is the more useful half of the answer. Empty when the host Component's declared slot set could not be resolved, which is distinct from "free": free is the positive finding that no declared slot carries this name. |
| `values` | object | no | Operational configuration payload for the attachment. For a credential, whichever form the author declared — a pointer into a secret store, or the material itself. |
| `infra` | object | no | Per-instance physical sizing for this attachment. |
| `inject` | object | no | Agnostic injection routing. Maps local variables to Target provides keys. |
| `origin` | string (enum) | no | Distinguishes attachments authored in a features: block (explicit) from synthetic attachments produced by the annotation-driven expansion pass (annotation), or mixed when the attachment's value/infra leaves carry a mix of both (per-leaf detail then lives in the provenance maps). Allowed values: `"explicit"`, `"annotation"`, `"mixed"` |
| `annotation_key` | string | no | Annotation name that triggered a synthetic attachment. Empty when origin is explicit. |
| `annotation_source` | string | no | Source location of the annotation declaration as <release-file-path>:<dotted-yaml-key-path>. Empty when origin is explicit. |
| `values_provenance` | map of FieldProvenance | no | Per-leaf origin for the values payload, keyed by dotted leaf path. |
| `infra_provenance` | map of FieldProvenance | no | Per-leaf origin for the infra payload, keyed by dotted leaf path. |
| `sensitive` | boolean | no | True when this attachment handles material an author declared sensitive — either the attached Feature declares a sensitive leaf in its values, infra or provides pillar, or the host Component's attachment slot of the same name declares the material it carries sensitive. Derived from those declarations over the merged attachment, never from a value's content or a name. Unset when neither declaration is present. |
| `sensitive_inject` | map of map of string | no | The delivery keys of inject whose referenced provides key the attached Feature declares sensitive, in inject's own shape: mechanism, then delivery key, with the referenced provides key as the value. A subset of inject. Empty when the attachment declares no delivery mechanism or references no sensitive provides key. |

_Additional properties are not permitted._

#### `IRFeatureEntry.inject`

Agnostic injection routing. Maps local variables to Target provides keys.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `env` | map of string | no |  |
| `file` | map of string | no |  |
| `arg` | map of string | no |  |

### `IRBoundaryFeature`

A boundary-level Feature attachment projected into the IR: the Feature type URI plus the boundary infra a boundary-scope FeatureRecipe renders and resolves its source against. Boundary-level attachments carry no values payload.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `type` | string | yes | URI of the Catalog Feature attached at this boundary. |
| `infra` | object | no | Physical sizing for the boundary attachment; the infra a boundary-scope FeatureRecipe evaluates its templates and source against. |

_Additional properties are not permitted._

### `CatalogMetadata`

The Enterprise Metadata Suite explicitly extracted from the Catalog entity, exposing lifecycle and ownership data to Wasm linters.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `maintainers` | Maintainer[] | no |  |
| `license` | string | no |  |
| `repository` | string | no |  |
| `home` | string | no |  |
| `keywords` | string[] | no |  |
| `deprecated` | boolean | no |  |

_Additional properties are not permitted._

### `IRNode`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `description` | string | no | Optional developer-authored documentation describing this component instance's role in the application. Passed through from the Aggregate for augmenting rendering and linting diagnostics. |
| `labels` | map of string | yes | The entity's duck-typing and ontology labels. |
| `component` | string | yes | The name of the underlying Component. |
| `resolved_version` | string | yes | The exact Semantic Version of the Component resolved during compilation. |
| `sync_wave` | integer | no | The deployment wave inherited from the IRNode's containing boundary's syncWave field (default 0; negative permitted). Renderers translate the integer to provider-native sequencing artifacts (argocd.argoproj.io/sync-wave for K8s/Helm; depends_on for Terraform; DependsOn for CloudFormation; no-op for Compose). |
| `boundary_path` | string | no | The physical spatial hierarchy mapped from the Release boundaries (e.g., 'aws-prod/eks-main/payments'). Allows rendering plugins to generate boundary-aware unique identifiers. |
| `subsystem_path` | string | no | The logical spatial hierarchy mapped from the Aggregate subsystems (e.g., 'finance-module/ledger-api'). Allows rendering plugins to generate logical metadata tags. |
| `synthesized_subsystem` | boolean | no | True when this node's subsystem was synthesized by the compiler — the `default` subsystem created for an Aggregate that declares top-level `components` rather than named `subsystems`. Derived provenance, never authored: it distinguishes the synthesized `default` from a subsystem a user explicitly named `default`. Independent of `synthesized_boundary` (a node may be synthesized on either axis or both). Absent (false) for every authored subsystem. |
| `synthesized_boundary` | boolean | no | True when this node's boundary was synthesized by the compiler — the `default` boundary created for a Release that declares top-level `components` rather than named `boundaries`. Derived provenance, never authored: it distinguishes the synthesized `default` from a boundary a user explicitly named `default`, and routes the node's artifacts to `dist/` flat instead of `dist/boundaries/default/`. Absent (false) for every authored boundary. |
| `source_file` | string | no | Workspace-relative path of the Aggregate file where this node was authored. Root-tier nodes carry the root Aggregate's path; sub-aggregate nodes carry the imported Aggregate's file path. The emitter normalizes against the workspace root (the directory containing .aggrega-config.yaml) so the IR wire shape stays byte-identical across developer machines whose workspaces live at different absolute paths. Consumers that filter diagnostics per file resolve the field against the same workspace root before comparison. Empty when the emitter has no workspace concept (e.g., synthetic test fixtures); the field is omitted from the JSON when empty. |
| `catalog_metadata` | CatalogMetadata | no |  |
| `catalog_annotations` | map of string | no | Immutable, intrinsic component characteristics authored by the Platform Architect in Domain 2. |
| `release_annotations` | map of string | no | Physical topology strings and Ops realities cascading from boundaries in the Release. |
| `aggregate_annotations` | map of string | no | Cognitive metadata, developer intent, and FinOps cascading from subsystems in the Aggregate. |
| `self_inject` | object | no | Component-level self-inject block carried from the Aggregate; the agnostic injection routing the node declares for itself. Opaque at this schema layer; a policy plugin that reads it parses the bytes. |

_Additional properties are not permitted._

### `IREdge`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `source` | string | yes |  |
| `target` | string | yes |  |
| `socket` | string | no | The usesSchema category this edge belongs to (e.g., 'databases', 'tools'). |
| `alias` | string | no | The developer-defined alias for this connection (e.g., 'primary_db'). |
| `origin_feature` | string | no | If this edge was autonomously declared by a Feature (including credential Features labeled feature.aggrega.ai/kind: secret), this identifies the Feature type URI. Allows Wasm plugins to isolate their own topology. |
| `origin_feature_instance` | string | no | The per-attachment instance name of the Feature that declared this edge. Locates a boundary-scope FeatureRecipe's resolved provides by instance, disambiguating two attachments of the same Feature type on one boundary. |
| `origin_release` | boolean | no | True when this edge was created by a Release wiring a declared-but-unbound socket to an existing component. Marks edge AUTHORSHIP, not configuration: a developer-declared edge that a Release merely supplied infra for stays Aggregate-origin (origin_release unset; its Release infra appears in the edge's infra map). origin_feature set => Feature-origin; origin_release true => Release-origin; neither => Aggregate-origin. |
| `values` | object | no | Resolved per-connection developer values for this edge (from the Aggregate edge), validated at resolution against the valueSchema declared by the source socket (the socket on the consuming component, which is the edge's source) and projected into the consuming node's render context at .uses.<alias>.values. Keys the author omitted are filled from the socket's declared defaults; an authored value wins. |
| `infra` | object | no | Resolved per-connection infra for this edge (Aggregate-seeded and/or Release-supplied), validated at resolution against the infraSchema declared by the source socket (the socket on the consuming component, which is the edge's source) and projected at .uses.<alias>.infra. Keys the author omitted are filled from the socket's declared defaults; an authored value wins. |
| `inject` | object | no | Agnostic injection routing. Maps local variables to Target provides keys. |

_Additional properties are not permitted._

#### `IREdge.inject`

Agnostic injection routing. Maps local variables to Target provides keys.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `env` | map of string | no |  |
| `file` | map of string | no |  |
| `arg` | map of string | no |  |

### `IRMetadata`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `aggregate_name` | string | yes | The Aggregate's metadata.name. Follows IR snake_case convention. |

_Additional properties are not permitted._

### `IRProvenance`

Traceability metadata for diagnostics and auditing.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `schema_version` | string | yes |  |
| `compiler_version` | string | yes | Mandatory compliance stamp. Identifies the specific Go compiler binary used to generate this graph. |
| `aggregate_version` | string | yes | The exact semantic version of the root Aggregate intent used during compilation. |
| `manifest_version` | string | yes | The exact semantic version of the Manifest lockfile used during compilation. |
| `release_version` | string | yes | The exact semantic version of the Release routing file used during compilation. |
| `source_identifiers` | string[] | yes |  |

_Additional properties are permitted._

### `IRSpec`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `nodes` | object | yes | Dictionary of all application nodes, keyed by their absolute ID. Purely topological. |
| `edges` | IREdge[] | yes | Explicit logical network paths and dependencies between nodes. |
| `feature_markers` | string[] | yes | Explicit canonical strings (e.g., semantic_routing, data_masking) derived from annotations, utilized for downstream Feature Negotiation. |
| `values_mapping` | object | yes | The single source of truth for opaque pass-through cognitive payloads, mapped by node ID. |
| `infra_mapping` | object | yes | The physical sizing payload injected from the Release, mapped by node ID. |
| `feature_values_mapping` | object | yes | Normalized map of Node IDs to their attached Feature configurations. One bucket carries every attachment on a node whatever it produces — operational Features, credential Features, identity Features — keyed by the instance name the author gave each attachment. |
| `boundary_features` | object | no | Un-folded projection of each boundary's Feature attachments, keyed by boundary path then by instance name. Mirrors the boundaries' feature attachments as the single source both lock-time source resolution and the render-time boundary-scope dispatch read, so neither re-walks the routing tree. Present only when the graph has boundary-level Feature attachments. |
| `provenance` | IRProvenance | yes |  |

_Additional properties are not permitted._

### `IRGraph`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `apiVersion` | const "aggrega.ai/v1alpha1" | yes | Constant: `"aggrega.ai/v1alpha1"` |
| `kind` | const "IR" | yes | Constant: `"IR"` |
| `metadata` | IRMetadata | yes |  |
| `spec` | IRSpec | yes |  |

_Additional properties are not permitted._
