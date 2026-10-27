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
| `metadata` | IRMetadata | yes | Identity of the graph: the Aggregate it was built from. |
| `spec` | IRSpec | yes | The graph itself: its nodes, its edges and the payloads keyed by node. |

_Additional properties are not permitted._

## Definitions

### `Maintainer`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | The maintainer's name. |
| `email` | string | no | The maintainer's email address. |
| `url` | string | no | The maintainer's web address. |

### `FieldProvenance`

Origin of one leaf in an attachment's values or infra payload.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `origin` | string | yes | Whether the leaf was authored explicitly or contributed by the annotation-driven expansion pass. |
| `side` | string | no | Authoring surface the annotation was declared on; absent for explicit leaves. |
| `annotation_key` | string | no | Annotation name that contributed this leaf; absent for explicit leaves. |
| `annotation_source` | string | no | Source location of the annotation declaration as <file-path>:<dotted-yaml-key-path>; absent for explicit leaves. |
| `overridden_annotation` | FieldProvenance | no | The annotation contribution that lost this leaf to an explicit one: when an explicit leaf overwrote an annotation-contributed leaf, the suppressed provenance it replaced. Singular — exactly one suppressed contribution is ever retained. |

_Additional properties are not permitted._

### `AttachmentConnection`

The connection an attachment belongs to, for an attachment written on a connection a component draws rather than on the component's own attachment block: the socket the connection is wired through and the alias it is written under. The pair names one of the graph's edges — the edge whose source is the node carrying the attachment and whose socket and alias are these — so a consumer joins the attachment to that edge, and through it to the target the attachment is presented to.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `socket` | string | yes | The socket the connection is wired through: the socket of the edge the attachment belongs to. |
| `alias` | string | yes | The alias the connection is written under: the alias of the edge the attachment belongs to. |

_Additional properties are not permitted._

### `IRFeatureEntry`

One resolved attachment for a node, carried in feature_values_mapping. Every attachment family shares this shape — an operational Feature, a credential Feature, an identity Feature — so no family gets a lossier projection than another. What a credential attachment's values carries is the author's choice: a by-reference credential carries a pointer into a secret store, a by-value one carries the material itself, and the compiler carries whichever was written verbatim without resolving either.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `type` | string | yes | URI of the Catalog Feature this attachment requests. |
| `resolved_version` | string | yes | The exact semantic version resolved during compilation. |
| `labels` | map of string | no | The attached Feature's catalog labels, carried verbatim in the order its catalog entity declares them — never filtered, normalised or prefix-stripped, so a consumer reads exactly what the catalog author wrote. The compiler reads none of them. Absent when the Feature declares no labels, and when its type resolves to no catalog entity. |
| `catalog_annotations` | map of string | no | The attached Feature's catalog annotations — the metadata.annotations of the Feature entity this attachment names — carried verbatim in the order that entity declares them, never filtered, normalised or prefix-stripped, so a consumer reads exactly what the catalog author wrote, including keys in the author's own namespace. The compiler reads none of them. Distinct from annotation_key and annotation_source, which name and locate the annotation that caused this attachment to exist at all: those two report how the attachment came to be, this one reports the metadata of the entity it names, and an attachment written in a features: block carries these annotations while carrying neither of those. Absent when the Feature declares no annotations, and when its type resolves to no catalog entity. |
| `binding` | string | no | Names the attachment slot this attachment fills, or "free" when it fills no declared slot. A slot is declared in one of two places, and where the attachment was written decides which: an attachment of the node's own attachment block fills a slot the host Component declares in its featuresSchema, and an attachment written on a connection fills a slot the connection's socket declares in that socket's featuresSchema on the host Component. The pairing is by name in both — an attachment fills a slot when the Feature is attached under the slot's name, on the component's block or on the connection — so the value is an exact key from the declared slot set, never anything read out of the attachment's key. A socket's slot set is closed, since an attachment written on a connection under a name its socket does not declare halts the build, so an attachment that carries a connection never reports free. The slot name is carried rather than a bare boolean because which slot was filled is the more useful half of the answer. Empty when the host Component's declared slot set could not be resolved, which is distinct from "free": free is the positive finding that no declared slot carries this name. |
| `values` | object | no | Operational configuration payload for the attachment. For a credential, whichever form the author declared — a pointer into a secret store, or the material itself. |
| `infra` | object | no | Per-instance physical sizing for this attachment. |
| `inject` | object | no | Agnostic injection routing. Maps local variables to Target provides keys. |
| `origin` | string (enum) | no | Distinguishes attachments authored in a features: block (explicit) from synthetic attachments produced by the annotation-driven expansion pass (annotation), or mixed when the attachment's value/infra leaves carry a mix of both (per-leaf detail then lives in the provenance maps). Allowed values: `"explicit"`, `"annotation"`, `"mixed"` |
| `annotation_key` | string | no | Annotation name that triggered a synthetic attachment. Absent when origin is explicit. |
| `annotation_source` | string | no | Source location of the annotation declaration as <release-file-path>:<dotted-yaml-key-path>. Absent when origin is explicit. |
| `values_provenance` | map of FieldProvenance | no | Per-leaf origin for the values payload, keyed by dotted leaf path. |
| `infra_provenance` | map of FieldProvenance | no | Per-leaf origin for the infra payload, keyed by dotted leaf path. |
| `sensitive` | boolean | no | True when this attachment handles material an author declared sensitive — either the attached Feature declares a sensitive leaf in its values, infra or provides pillar, or the slot the attachment fills declares the material it carries sensitive: the host Component's attachment slot of the same name, or, for an attachment written on a connection, the slot of that name the connection's socket declares. Derived from those declarations over the merged attachment, never from a value's content or a name. Unset when neither declaration is present. |
| `sensitive_inject` | map of map of string | no | The delivery keys of inject whose referenced provides key the attached Feature declares sensitive, in inject's own shape: mechanism, then delivery key, with the referenced provides key as the value. A subset of inject. Absent when the attachment declares no delivery mechanism or references no sensitive provides key. |
| `sensitive_payload_leaves` | string[] | no | The leaves this attachment's values and infra payload carries that the attached Feature declares sensitive, each as the pillar-prefixed dotted path the datum occupies: values.<path> or infra.<path>. The payload read here is the one the attachment ends up carrying, so a leaf standing at a value the Feature's schema declares as a default is named alongside one an author wrote — a filled default is a datum the payload carries, and a marking read off the written block alone would leave it unnamed. This is the per-leaf unit of the sensitivity marking, and it answers a question neither of the other two does — sensitive gives one answer for the whole attachment, sensitive_inject gives one per inject delivery key, and neither names an individual leaf. A leaf appears where a path the Feature's schema declares sensitive covers it: the declaration names that leaf, or names an object containing it, so a leaf beneath an object a declaration covers is named by that declaration. Matching runs segment-wise over the dotted path, with nothing read out of the path's own text and no value inspected, so a declaration at `db` covers `db.password` and does not reach a sibling leaf named `dbPassword`. The per-attachment answer is never spread across individual leaves, which would assert something false about a leaf left readable. An absent key states that this attachment names no leaf its Feature declares sensitive. It does not assert that the payload is insensitive, and it does not separate an attachment that has no such leaf to name from a producer that does not report this axis at all — a guest that reads an absent key as permission to display or emit a value in the clear has read it backwards. Leaves arrive in the order the payload holds them, the values pillar's before the infra pillar's — the same order the values and infra payloads themselves carry, and what makes the payload byte-identical across runs of identical input. Absent when the attachment carries no leaf its Feature declares sensitive. |
| `connection` | AttachmentConnection | no | The connection this attachment belongs to: present on every attachment written on one of the node's connections, and absent on every attachment of the node's own attachment block. An attachment written on a connection is one of the node's attachments in every other respect — keyed by its qualified name, the connection's alias and the slot joined by a dot, and taking its binding and its sensitivity from the slot the connection's socket declares — so this field is what tells the two apart, and it carries the connection as data rather than leaving it to be read out of the key. A consumer joins it to the graph's edges by socket and alias: the edge whose source is the node carrying this attachment and whose socket and alias are these is the connection the attachment is presented on, and that edge's target is what it is presented to. An attachment of a connection a Feature attachment draws never carries one, because such a connection carries no attachments. |
| `realization` | string | no | The FeatureRecipe that realizes this attachment, as <name>:<version>: the one the Manifest binds to it — by the attachment's own name where the Manifest's name tier maps that name, otherwise by its Feature type — which is the one a build of the same documents renders it with. For an attachment written on a connection the name the name tier is read by is its qualified name, the connection's alias and the slot joined by a dot. The value is the pair aggrega inspect prints as the attachment's realization and, where a target stamps provenance on what it renders, the aggrega.ai/recipe-uri value on the documents that FeatureRecipe renders, so a consumer joins an attachment to what it renders without translating between forms. It names the FeatureRecipe by name and version and not by capability. The field records which FeatureRecipe the Manifest binds, read from the Manifest and the catalog when the graph is built: nothing is fetched to produce it, and the FeatureRecipe is rendered only when the build renders. Absent when the Manifest binds the attachment to no FeatureRecipe the catalog holds. |

_Additional properties are not permitted._

#### `IRFeatureEntry.inject`

Agnostic injection routing. Maps local variables to Target provides keys.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `env` | map of string | no | Environment variable delivery: keys are the consumer's local variable names, values are the target's provides keys. |
| `file` | map of string | no | File mount delivery: keys are the consumer's local file paths, values are the target's provides keys. |
| `arg` | map of string | no | Command-line argument delivery: keys are the consumer's flag prefixes, values are the target's provides keys. |

### `IRBoundaryFeature`

A boundary-level Feature attachment projected into the IR: the Feature type URI plus the boundary infra a boundary-scope FeatureRecipe renders and resolves its source against. Boundary-level attachments carry no values payload.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `type` | string | yes | URI of the Catalog Feature attached at this boundary. |
| `infra` | object | no | Physical sizing for the boundary attachment; the infra a boundary-scope FeatureRecipe evaluates its templates and source against. |
| `sensitive_payload_leaves` | string[] | no | The leaves this boundary attachment's infra payload carries that the attached Feature declares sensitive, each as the pillar-prefixed dotted path the datum occupies. Only infra.<path> coordinates appear here, because a boundary-level attachment carries no values payload. The payload read here is the one the attachment ends up carrying, so a leaf standing at a value the Feature's schema declares as a default is named alongside one a boundary wrote — a filled default is a datum the payload carries, and a marking read off the written block alone would leave it unnamed. A leaf appears where a path the Feature's schema declares sensitive covers it: the declaration names that leaf, or names an object containing it, so a leaf beneath an object a declaration covers is named by that declaration. Matching runs segment-wise over the dotted path, with nothing read out of the path's own text and no value inspected, so a declaration at `db` covers `db.password` and does not reach a sibling leaf named `dbPassword`. An absent key states that this attachment names no leaf its Feature declares sensitive, which includes the case where the attached Feature resolves to no schema this reader could read. It does not assert that the infra payload is insensitive, and it does not separate an attachment that has no such leaf to name from a producer that does not report this axis at all. A consumer that reads an absent key as permission to display or emit a value in the clear has read it backwards. Leaves arrive in the order the payload holds them, which is the same order the infra payload itself carries and what keeps the graph byte-identical across runs of identical input. Absent when the attachment carries no leaf its Feature declares sensitive. |
| `realization` | string | no | The FeatureRecipe that realizes this boundary attachment, as <name>:<version>: the one the Manifest binds to it — by the attachment's own name where the Manifest's name tier maps that name, otherwise by its Feature type — which is the one a build of the same documents renders it with. It is the same field, read the same way, as an attachment entry's realization under feature_values_mapping. Absent when the Manifest binds the attachment to no FeatureRecipe the catalog holds. |

_Additional properties are not permitted._

### `CatalogMetadata`

The Enterprise Metadata Suite explicitly extracted from the Catalog entity, exposing lifecycle and ownership data to Wasm linters.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `maintainers` | Maintainer[] | no | The maintainers the Catalog entity lists as owning it. |
| `license` | string | no | The SPDX license identifier the Catalog entity declares for the software it describes. |
| `repository` | string | no | The URL of the Git repository the Catalog entity names as holding its source files. |
| `home` | string | no | The URL of the Catalog entity's home page, wiki or documentation. |
| `keywords` | string[] | no | The descriptive keywords the Catalog entity declares. |

_Additional properties are not permitted._

### `IRNode`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `description` | string | no | Optional developer-authored documentation describing this component instance's role in the application. Carried through from the Aggregate for rendering and for lint diagnostics. |
| `labels` | map of string | yes | The entity's duck-typing and ontology labels. |
| `component` | string | yes | The name of the underlying Component. |
| `resolved_version` | string | yes | The exact Semantic Version of the Component resolved during compilation. |
| `sync_wave` | integer | no | The deployment wave inherited from the containing boundary's `syncWave` field (default 0; negative permitted). On K8s and Helm the wave is what orders the deployment: it becomes an `argocd.argoproj.io/sync-wave` annotation, and on a resource the chart already marks as a Helm hook it also becomes that hook's `helm.sh/hook-weight`. On compose the value both is recorded as a service label and orders the services of the file it renders into, through `depends_on` between them. On cloudformation it orders provisioning of the stack a dispatch group assembles into, every resource in a wave being declared to depend on the resources of the wave before it: the order they are created in and, in reverse, the order they are deleted in, never readiness, because a stack template expresses no notion of a resource being ready. On terraform it orders the module blocks of the root configuration a boundary assembles into, every module in a wave being declared to depend on the modules of the wave before it: the order the engine performs its actions in, never readiness, because a configuration expresses no notion of a resource being ready. The value also travels with the node's build provenance. |
| `boundary_path` | string | no | The path of the Release boundary this node is placed in: the boundary names from the outermost boundary inward, joined with `/` (e.g., 'data/inner' for a component placed in a boundary `inner` declared inside a boundary `data`). A boundary name cannot contain `/`, so the path splits back into its boundaries without ambiguity. A node of an imported Aggregate the Release routes into a boundary carries that boundary's path. Allows rendering plugins to generate boundary-aware unique identifiers. |
| `subsystem_path` | string | no | The path of the Aggregate subsystem this node's component is declared in: the subsystem names from the outermost subsystem inward, joined with `.` (e.g., 'backend.storage' for a component declared in a subsystem `storage` nested inside a subsystem `backend`). A subsystem name cannot contain `.`, so the path splits back into its subsystems without ambiguity. A component of an Aggregate that declares top-level `components` carries the synthesized `default`, marked by `synthesized_subsystem`. The path is relative to the Aggregate that declares the component: a node an imported Aggregate contributes carries its path within that Aggregate, without the name it is imported under (e.g., 'tier' for a component in the imported Aggregate's subsystem `tier`), so nodes from different Aggregates can share one path. The node's ID, which begins with the import name, and `source_file` tell them apart. |
| `synthesized_subsystem` | boolean | no | True when this node's subsystem was synthesized by the compiler — the `default` subsystem created for an Aggregate that declares top-level `components` rather than named `subsystems`. Derived provenance, never authored: it distinguishes the synthesized `default` from a subsystem a user explicitly named `default`. Independent of `synthesized_boundary` (a node may be synthesized on either axis or both). Absent (false) for every authored subsystem. |
| `synthesized_boundary` | boolean | no | True when this node's boundary was synthesized by the compiler — the `default` boundary created for a Release that declares top-level `components` rather than named `boundaries`. Derived provenance, never authored: it distinguishes the synthesized `default` from a boundary a user explicitly named `default`, and routes the node's artifacts to `dist/` flat instead of `dist/boundaries/default/`. Absent (false) for every authored boundary. |
| `catalog_metadata` | CatalogMetadata | no | The Enterprise Metadata Suite explicitly extracted from the Catalog entity, exposing lifecycle and ownership data to Wasm linters. |
| `catalog_annotations` | map of string | no | Immutable, intrinsic component characteristics authored by the Platform Architect in Domain 2. |
| `release_annotations` | map of string | no | Physical topology strings and Ops realities cascading from boundaries in the Release. |
| `aggregate_annotations` | map of string | no | Cognitive metadata, developer intent, and FinOps cascading from subsystems in the Aggregate. |
| `self_inject` | object | no | Component-level self-inject block carried from the Aggregate; the agnostic injection routing the node declares for itself. Opaque at this schema layer; a policy plugin that reads it parses the bytes. |
| `source_file` | string | no | Workspace-relative path of the Aggregate file where this node was authored. Root-tier nodes carry the root Aggregate's path; sub-aggregate nodes carry the imported Aggregate's file path. The path is relative to the workspace root (the directory containing .aggrega-config.yaml), so the graph is byte-identical on machines whose workspaces sit at different absolute paths. Consumers that filter diagnostics per file resolve the field against the same workspace root before comparison. Absent when the graph was built without a workspace root. |
| `uses` | object | no | The node's `uses` block exactly as authored: each socket name maps to either a list of target instance names or an alias-keyed map of connection entries, in the order the author declared them. This is the block as written, which is a different fact from the resolved connections in `edges`: a socket the author populated appears here even where it produced no connection, so a reader can tell a socket the author filled apart from a socket that reaches a target. Absent when the node authored no `uses` block. Opaque at this schema layer; a policy plugin that reads it parses the bytes. |
| `sensitive_payload_leaves` | string[] | no | The leaves this node's values and infra payload carries that its Component declares sensitive, each as the pillar-prefixed dotted path the datum occupies: values.<path> or infra.<path>. It names the node's OWN data — what values_mapping and infra_mapping carry for this node — and is a different subject from the marking on an attachment entry, which names data an attachment carries against its Feature's declaration. Neither is recoverable from the other: a node's Component and an attachment's Feature declare different schemas, and a node that attaches nothing still carries values. The payload read here is the one those two mappings carry, so a leaf standing at a value the Component's schema declares as a default is named alongside one an author wrote — a filled default is a datum the graph carries, and a marking read off the written blocks alone would leave it unnamed. A leaf appears where a path the Component's schema declares sensitive covers it: the declaration names that leaf, or names an object containing it, so a leaf beneath an object a declaration covers is named by that declaration. Matching runs segment-wise over the dotted path, with nothing read out of the path's own text and no value inspected, so a declaration at `db` covers `db.password` and does not reach a sibling leaf named `dbPassword`. An absent key states that this node names no leaf its Component declares sensitive, which includes the case where the node's Component resolves to no schema this reader could read. It does not assert that the node's payload is insensitive, and it does not separate a node that has no such leaf to name from a producer that does not report this axis at all. A consumer that reads an absent key as permission to display or emit a value in the clear has read it backwards. Leaves arrive in the order the payload holds them, the values pillar's before the infra pillar's, which is the same order those payloads themselves carry and what keeps the graph byte-identical across runs of identical input. Absent when the node carries no leaf its Component declares sensitive. |

_Additional properties are not permitted._

### `IREdge`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `source` | string | yes | The ID of the consuming node, where the connection starts. |
| `target` | string | yes | The ID of the node the connection reaches. |
| `socket` | string | no | The usesSchema category this edge belongs to (e.g., 'databases', 'tools'). |
| `alias` | string | no | The developer-defined alias for this connection (e.g., 'primary_db'). |
| `socket_declaration` | string (enum) | yes | Where the socket came from: declared when the catalog entity that owns the socket lists it in usesSchema (the consuming Component, or the originating Feature for a Feature-authored edge), ad-hoc when the Aggregate author named a socket the catalog did not declare. This is a third axis, independent of edge authorship: it says where the socket came from, not who drew the edge, so a Release-authored edge into a declared socket and an Aggregate-authored edge into an ad-hoc socket differ on the two axes independently. A declared socket carries its usesSchema entry, including the selector that constrains which targets the edge may reach; an ad-hoc socket has no catalog entry and therefore no selector, so what the edge may carry is bounded by the target's declared provides alone. Always present, so a consumer never has to read an absent value as declared, and a policy can require every edge to be declared. Distinct from an attachment's binding marker, which answers the same shape of question about a different subject. Allowed values: `"declared"`, `"ad-hoc"` |
| `origin_feature` | string | no | If this edge was autonomously declared by a Feature (including credential Features labeled feature.aggrega.ai/kind: secret), this identifies the Feature type URI. Allows Wasm plugins to isolate their own topology. |
| `origin_feature_instance` | string | no | The per-attachment instance name of the Feature that declared this edge. Locates a boundary-scope FeatureRecipe's resolved provides by instance, disambiguating two attachments of the same Feature type on one boundary. |
| `origin_release` | boolean | no | True when this edge was created by a Release wiring a declared-but-unbound socket to an existing component. Marks edge AUTHORSHIP, not configuration: a developer-declared edge that a Release merely supplied infra for stays Aggregate-origin (origin_release unset; its Release infra appears in the edge's infra map). origin_feature set => Feature-origin; origin_release true => Release-origin; neither => Aggregate-origin. |
| `values` | object | no | Resolved per-connection developer values for this edge (from the Aggregate edge), validated at resolution against the valueSchema declared by the source socket (the socket on the consuming component, which is the edge's source) and projected into the consuming node's render context at .context.uses.<alias>.values. Keys the author omitted are filled from the socket's declared defaults; an authored value wins. |
| `infra` | object | no | Resolved per-connection infra for this edge, supplied by a Release edge entry, validated at resolution against the infraSchema declared by the source socket (the socket on the consuming component, which is the edge's source) and projected at .context.uses.<alias>.infra. Keys the author omitted are filled from the socket's declared defaults; an authored value wins. |
| `inject` | object | no | Agnostic injection routing. Maps local variables to Target provides keys. |

_Additional properties are not permitted._

#### `IREdge.inject`

Agnostic injection routing. Maps local variables to Target provides keys.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `env` | map of string | no | Environment variable delivery: keys are the consumer's local variable names, values are the target's provides keys. |
| `file` | map of string | no | File mount delivery: keys are the consumer's local file paths, values are the target's provides keys. |
| `arg` | map of string | no | Command-line argument delivery: keys are the consumer's flag prefixes, values are the target's provides keys. |

### `IRMetadata`

Identity of the graph: the Aggregate it was built from.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `aggregate_name` | string | yes | The Aggregate's metadata.name. |

_Additional properties are not permitted._

### `IRProvenance`

Traceability metadata for diagnostics and auditing.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `schema_version` | string | yes | The version of the IR schema the graph conforms to — aggrega.ai/v1alpha1, the same value the graph's apiVersion carries. |
| `compiler_version` | string | yes | Mandatory compliance stamp. Identifies, by its version, the aggrega binary that built this graph. |
| `aggregate_version` | string | yes | The exact semantic version of the root Aggregate intent used during compilation. |
| `manifest_version` | string | yes | The exact semantic version of the Manifest lockfile used during compilation. |
| `release_version` | string | yes | The exact semantic version of the Release routing file used during compilation. |

_Additional properties are permitted._

### `IRSpec`

The graph itself: its nodes, its edges and the payloads keyed by node.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `nodes` | map of IRNode | yes | Dictionary of all nodes in the graph, keyed by their absolute ID. Purely topological. Keys: one or more letters, digits, underscores, dots or hyphens. Pattern: `^[a-zA-Z0-9_.-]+$`. |
| `edges` | IREdge[] | yes | Explicit logical network paths and dependencies between nodes. |
| `values_mapping` | object | yes | The single source of truth for opaque pass-through cognitive payloads, mapped by node ID. |
| `infra_mapping` | object | yes | The physical sizing payload injected from the Release, mapped by node ID. |
| `feature_values_mapping` | map of map of IRFeatureEntry | yes | Normalized map of Node IDs to their attached Feature configurations. One bucket carries every attachment on a node whatever it produces — operational Features, credential Features, identity Features — keyed by the instance name the author gave each attachment. An attachment written on one of the node's connections is keyed by its qualified name, the connection's alias and the slot joined by a dot, and names its connection in its own connection field. Keys: one or more letters, digits, underscores, dots or hyphens. Pattern: `^[a-zA-Z0-9_.-]+$`. |
| `boundary_features` | map of map of IRBoundaryFeature | no | Each boundary's Feature attachments, keyed by boundary path then by instance name. Present only when the graph has boundary-level Feature attachments. Keys: one or more letters, digits, underscores, dots, slashes or hyphens. Pattern: `^[a-zA-Z0-9_./-]+$`. |
| `provenance` | IRProvenance | yes | Traceability metadata for diagnostics and auditing. |

_Additional properties are not permitted._

### `IRGraph`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `apiVersion` | const "aggrega.ai/v1alpha1" | yes | Constant: `"aggrega.ai/v1alpha1"` |
| `kind` | const "IR" | yes | Constant: `"IR"` |
| `metadata` | IRMetadata | yes | Identity of the graph: the Aggregate it was built from. |
| `spec` | IRSpec | yes | The graph itself: its nodes, its edges and the payloads keyed by node. |

_Additional properties are not permitted._
