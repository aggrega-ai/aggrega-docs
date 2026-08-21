# Aggrega Wasm Provider Render Socket schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/wasm-provider-v1alpha1.schema.json`

The JSON wire shapes a Provider render plugin socket consumes and emits. A Provider guest renders one IR node into output files on its render_node export (RenderNodeInput to RenderNodeOutput), and optionally merges the per-node outputs at one boundary into a single assembled artifact on its assemble_boundary export (AssembleBoundaryInput to AssembleBoundaryOutput). AssembleBoundaryOutput carries the assembled files and diagnostics like RenderNodeOutput, plus a nest-per-node signal telling the orchestrator whether to nest each contributor's per-node files under a per-node sub-directory. A guest may also declare an optional validate_node_input export that structurally checks a node's resolved input before render dispatch: it consumes the same RenderNodeInput projection render_node receives and returns a ValidateNodeOutput carrying only diagnostics — a halt-severity diagnostic stops the build loudly, a warn-severity diagnostic surfaces to the build result. The guest returns each output file's serialized bytes; the host writes them verbatim and runs no serializer, so determinism is the guest's responsibility: identical input must produce identical bytes. The wire shapes are co-canonical with the host's Go render types and with each per-language plugin-development-kit mirror; cross-language round-trip tests catch drift.

## One of the following shapes

- `RenderNodeInput`
- `RenderNodeOutput`
- `ValidateNodeOutput`
- `AssembleBoundaryInput`
- `AssembleBoundaryOutput`
- `BoundaryEnvOverridesInput`
- `BoundaryEnvOverridesOutput`
- `LinkPublishInput`
- `LinkPublishOutput`
- `LinkResolveInput`
- `LinkResolveOutput`

## Definitions

### `RenderNodeInput`

The payload a Provider guest receives on its render_node export: the per-node IR projection the guest renders, the render-time context, and the pre-evaluated inputs the node's bound Recipe declares — an acquired-source listing, a workload, an artifact set — each present only when that Recipe declares it.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `node` | IRNodeProjection | yes |  |
| `context` | object | yes | The render-time context the host hands the guest. The guest reads it to resolve parameters, annotations, and boundary metadata; the schema does not interpret its internal shape (an opaque passthrough), so the provider socket schema does not rebind the cross-boundary render-context shape. The render context's own contract is the render-context wire shape; a guest that reads it consults that contract. |
| `source_listing` | SourceListing | no | The generic enumeration of the acquired source the host hands the guest for a sourced provider: the source root, whether that root is a directory, and the sorted root-relative entries under it. The host reads no file content here — it lists names only. The guest applies its own resolution logic over the listing and asks the host to pack a chosen selection through the pack-source host function, so all per-provider source-resolution intelligence lives in the guest. Present for sourced providers; absent otherwise. |
| `workload_projection` | WorkloadProjection | no | The pre-evaluated workload the host hands the guest to synthesize provider-native manifests from; present when the bound Recipe declares a workload rather than a chart source, absent otherwise. |
| `artifacts_projection` | ArtifactsProjection | no | The pre-evaluated artifact set the host hands the guest to place into the node's output, present when the bound Recipe declares artifacts. The host has already read each entry's source, evaluated it as a Go template against the render context, and computed the build-provenance key sets; the guest decides the output format, the provenance placement, the on-disk path, and the final bytes. Absent when the node declares no artifacts. |

_Additional properties are not permitted._

### `IRNodeProjection`

The per-node IR data a Provider guest renders — a bounded projection of the full IR node carrying the per-node identity and the provenance the guest stamps onto every emitted manifest: its id, type, resolved recipe, values, feature attachments, the sensitivity marking over its rendered keys, outbound uses edges, boundary path, deployment wave, Recipe identity, component-id override, and build provenance. Source-file content is not carried here; it travels separately in the source projection. Every key set here has a fixed order — features and uses in author order, values and the sensitivity marking in sorted key order — so the wire payload is byte-identical across runs of identical input.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | yes | The node's absolute id within the topology graph. |
| `type` | string | yes | The node's component-type label — opaque metadata for the guest, not a behavior switch. |
| `resolved_recipe` | string | yes | The Universal URI of the Recipe the resolver pinned for this node. |
| `values` | object | no | The node's rendered values dictionary, the key set the guest renders from. Keys arrive in sorted order, not author order, and that sorting is what makes the payload byte-identical across runs of identical input; a guest needing any other ordering imposes it itself. |
| `features` | object | no | The node's feature attachments keyed by feature alias, carrying the same per-node feature-attachment shape the IR carries. Each entry carries the attachment's values, infra and inject mapping alongside its derived sensitivity marking, so a guest reads whether an attachment handles declared-sensitive material from the payload alone. Preserves author order so the payload is byte-identical across runs of identical input. Opaque at this schema layer; the guest reads the feature-entry shape through the IR wire contract. |
| `sensitive_rendered_keys` | map of string | no | Rendered keys whose identity is recovered from a datum an author declared sensitive, each mapped to the declaration it inherited that sensitivity from. Travels host to guest on the render input — the opposite direction from the names a guest declares on the render output. What a key names follows the shape this payload carries: on a payload carrying the node's values it is one of that map's keys; on a payload carrying a workload it names an entry in the workload's own attachment maps, where the node's values are empty. A key is present only where the recovery is exact, joining a declaration to a rendered identity with nothing read out of the key's own text and no per-node or per-attachment marking spread across individual keys. A key a template invented is therefore absent, because no declaration names it: the output keys of a recipe's valuesMapping, and the content of an artifact, are template-authored, so neither yields a key here. Absence therefore states that no key's identity could be recovered, never that nothing on this payload carries sensitive material — a guest that reads an absent key as permission to display or emit a value in the clear has read it backwards. Keys arrive in sorted order, which is what makes the payload byte-identical across runs of identical input. |
| `uses` | map of string[] | no | The node's outbound uses edges keyed by socket alias, each carrying the ordered target node ids bound to that socket. Preserves author order so the payload is byte-identical across runs of identical input. |
| `boundary_path` | string | no | The node's boundary path, stamped as the aggrega.ai/boundary-path annotation on every emitted manifest that carries a metadata block. |
| `sync_wave` | integer | no | The deployment wave this node inherited from its containing boundary (default 0; negative permitted). Renderers that support ordering translate it into a target-native form; a target with no ordering concept carries it as a label and orders nothing. |
| `recipe_name` | string | no | The bound Recipe's name, paired with recipe_version to form the aggrega.ai/recipe-uri annotation; when either half is empty the annotation is not stamped. |
| `recipe_version` | string | no | The bound Recipe's version, paired with recipe_name to form the aggrega.ai/recipe-uri annotation; when either half is empty the annotation is not stamped. |
| `label_component_id` | string | no | The Kubernetes-safe component identity. When non-empty it overrides the node id as the app.kubernetes.io/name and aggrega.ai/component-id label value, for resources whose node id carries marker syntax that needs sanitization; empty means the node id is already label-valid and is used directly. |
| `output_labels` | map of string | no | The recipe-author-declared output labels (recipe.spec.outputLabels) the guest stamps onto every emitted manifest alongside the build-identity provenance, keyed by label name. Disjoint from the provenance keyspace by load-time validation (no aggrega.ai/ or app.kubernetes.io/ key), so stamping never collides with a provenance label. A guest whose output is not Kubernetes YAML translates them onto its own label surface (Compose service labels) or ignores them. |
| `provenance` | NodeProvenance | yes | The build-identity provenance the guest stamps onto every emitted manifest as aggrega.ai labels. |

_Additional properties are not permitted._

### `NodeProvenance`

The build-identity provenance for one node — the compiler, aggregate, and environment identity the guest stamps onto every emitted manifest as aggrega.ai labels. Each field elides when empty, so a partial identity stamps only the labels it carries.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `compiler_version` | string | no | The compiler version, stamped as the aggrega.ai/compiler-version label when non-empty. |
| `aggregate_name` | string | no | The aggregate name, stamped as the aggrega.ai/aggregate-name label when non-empty. |
| `environment` | string | no | The environment name, stamped as the aggrega.ai/environment label when non-empty. |
| `provider_name` | string | no | The bare provider kind, stamped as the aggrega.ai/provider label when non-empty. |
| `provider_version` | string | no | The resolved provider-rendering plugin version, stamped as the aggrega.ai/provider-version label when non-empty. |

_Additional properties are not permitted._

### `RenderNodeOutput`

The payload a Provider guest returns from its render_node export: the serialized bytes of each output file the guest emitted, the names it derived into each of its own key spaces, and any diagnostics the guest raised while rendering. The guest returns each file's serialized bytes; the host writes them verbatim and runs no serializer. Determinism is the guest's responsibility: identical input must produce identical bytes.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `files` | RenderedFile[] | yes | The output files the guest emitted, in emission order. Each names its on-disk path and carries the serialized bytes the host writes verbatim. |
| `derived_keys` | map of string[] | no | The names the guest derived while rendering this node, keyed by the key space it derived them into, each space carrying its names in derivation order. A guest that derives the name its output addresses a resource by has put that name inside the file bytes the host writes verbatim, where the host cannot see it; declaring it here is how the guest asks the host to confirm no two derivations landed on one name. The host compares declared names for equality within one declared space and does nothing else — it does not parse a name, does not learn what a space or a name means, and never derives one itself. Two contributors to the same assembled output that declare the same name in the same space halt the build, and the halt names the space, the name, and both contributors. Both the space names and the names within them are the guest's own vocabulary: a guest wanting uniqueness across a narrower or wider scope than one assembled output expresses that scope in the space name it declares. Preserves declaration order so the payload is byte-identical across runs of identical input. Absent when the guest derives no names it wants checked, which leaves the check inert for that guest. |
| `diagnostics` | Diagnostic[] | no | Diagnostics the guest raised while rendering. Each element is the shared Wasm-plugin diagnostic shape. |
| `error` | string | no | A failure message set when the guest ran but could not complete the operation; absent on success. It is distinct from any diagnostics the output carries: diagnostics report issues found during a run that still produced a result, while error reports that the operation itself did not complete. The host surfaces a present error as a failed plugin invocation. |

_Additional properties are not permitted._

### `ValidateNodeOutput`

The payload a Provider guest returns from its optional validate_node_input export: the diagnostics raised by a structural check of the node's resolved input. The export consumes the same RenderNodeInput projection render_node receives and emits no files — it only reports diagnostics. A halt-severity diagnostic stops the build loudly, naming the node and provider; a warn- or info-severity diagnostic surfaces to the build result without changing rendered output. An empty diagnostics list means the input passed the structural check.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `diagnostics` | Diagnostic[] | no | Diagnostics the guest raised while validating the node's input. Each element is the shared Wasm-plugin diagnostic shape. Empty when the input passed the structural check. |
| `error` | string | no | A failure message set when the guest ran but could not complete the operation; absent on success. It is distinct from any diagnostics the output carries: diagnostics report issues found during a run that still produced a result, while error reports that the operation itself did not complete. The host surfaces a present error as a failed plugin invocation. |

_Additional properties are not permitted._

### `RenderedFile`

One output file a Provider guest emitted: its on-disk path relative to the node's output root, and its serialized bytes exactly as the guest produced them. The host writes these bytes verbatim and runs no serializer, so the on-disk output is byte-identical to what the guest emitted.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `path` | string | yes | The output file's path relative to the node's output root (for example Chart.yaml or templates/deployment.yaml). |
| `content` | string | yes | The file's serialized bytes exactly as the guest produced them; the host writes these bytes verbatim and runs no serializer, so output is byte-identical to what the guest emitted (base64 on the JSON wire). |
| `format` | string | no | The format the guest declares the emitted file was rendered in, so the host can route the file to a matching parser. Absent when the guest declares no format, in which case the host infers the format from the file extension. |

_Additional properties are not permitted._

### `SourceFile`

One file of a pre-packaged source projection: its chart-root-relative path and its raw bytes, exactly as the host read them from the local source at compile time.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `path` | string | yes | The file's path relative to the source root (for example Chart.yaml or templates/deployment.yaml). |
| `content` | string | yes | The file's raw bytes exactly as the host read them from the local source (base64 on the JSON wire). |

_Additional properties are not permitted._

### `SourceProjection`

The packed source content (e.g. a Helm chart's files, keyed by source-root-relative path, in walk order) the host reads and returns to the guest in response to a pack-source request, so the guest reconstructs the selected source in memory and touches no filesystem. It is the pack-source host function's success payload.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `files` | SourceFile[] | yes | The source files, keyed by source-root-relative path, in the host's deterministic walk order. |

_Additional properties are not permitted._

### `SourceEntry`

One entry of a source listing: its path relative to the source root, and whether it is a directory. The host lists names only and reads no content, so an entry carries no bytes.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `path` | string | yes | The entry's path relative to the source root, slash-separated (for example Chart.yaml or templates/deployment.yaml). |
| `is_dir` | boolean | yes | Whether the entry is a directory. A guest that resolves a chart root or a single source file among the listing reads this to distinguish directories from files without touching the filesystem. |

_Additional properties are not permitted._

### `SourceListing`

The generic enumeration of an acquired source the host hands a sourced provider guest: the source root, whether that root is a directory, and the sorted root-relative entries under it. The host walks the acquired source with no domain knowledge and reads no file content — it lists names only. The guest applies its own resolution logic over the listing (locating a chart root, selecting a single compose document, vendoring a module tree) and asks the host to pack a chosen selection through the pack-source host function. Entries are sorted by path so the listing is byte-identical across runs of identical input.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `root` | string | yes | The acquired source location the host enumerated. The guest carries it into its own diagnostics when it cannot resolve the source, so a resolution halt names the source the author supplied. |
| `root_is_dir` | boolean | no | Whether the acquired source root is a directory. False for a single-file source (a lone compose document, a single module file, an archive), in which case entries is empty and the guest packs the root itself. |
| `entries` | SourceEntry[] | yes | The root-relative entries under a directory source root, sorted by path. Empty for a single-file source root. |

_Additional properties are not permitted._

### `SourcePackRequest`

The selection a guest asks the host to pack from the acquired source through the pack-source host function. The op names the shape of the selection and the path names it relative to the source root; the host resolves the path under the source root, rejecting any escape above it, and returns the packed bytes as a SourceProjection.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `op` | string (enum) | yes | The selection shape: file packs the single file at path; dir packs the immediate files of the directory at path; tree packs the whole subtree rooted at path, recursively, in the host's deterministic walk order. Allowed values: `"file"`, `"dir"`, `"tree"` |
| `path` | string | yes | The selection location relative to the source root, slash-separated. The empty string (or ".") names the source root itself, so a single-file source is packed with an empty path. |

_Additional properties are not permitted._

### `SourcePackResponse`

The pack-source host function's reply: on success the packed source, on failure an error message. Exactly one of the two fields is populated. Failure is delivered in-band rather than by trapping, so a guest carries a sandbox rejection or a read failure into its own diagnostics as a deterministic render failure.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `source_projection` | SourceProjection | no | The packed source on success; absent on failure. |
| `error` | string | no | The failure message on failure, naming the selection and the reason; absent on success. |
| `error_code` | string (enum) | no | The machine-matchable failure identity on failure, from the closed host-function error-code catalog, set beside the human error message; absent on success. A guest branches on this code without parsing the message, tolerating an absent code (older host) or an unrecognized one (newer host) by falling back to the message. Allowed values: `"fetch_request_unreadable"`, `"fetch_input_unavailable"`, `"fetch_failed"`, `"request_unreadable"`, `"request_undecodable"`, `"source_root_unavailable"`, `"source_read_failed"`, `"unknown_selection_op"`, `"source_escape"`, `"producer_consumption_reentry"`, `"no_source_parser"`, `"no_parser_for_format"`, `"parse_failed"` |

_Additional properties are not permitted._

### `SourceFileRequest`

The single-file content read a guest asks the host to perform through the read-source-file host function, for a guest whose resolution logic must inspect a file's content before choosing what to pack. The host resolves the path under the source root, rejecting any escape above it, and returns the file's bytes.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `path` | string | yes | The file location relative to the source root, slash-separated. |

_Additional properties are not permitted._

### `SourceFileResponse`

The read-source-file host function's reply: on success the file's bytes, on failure an error message. Exactly one of the two fields is populated. Failure is delivered in-band rather than by trapping, so a guest carries a sandbox rejection or a read failure into its own diagnostics as a deterministic render failure.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `content` | string | no | The file's raw bytes on success; absent on failure (base64 on the JSON wire). |
| `error` | string | no | The failure message on failure, naming the file and the reason; absent on success. |
| `error_code` | string (enum) | no | The machine-matchable failure identity on failure, from the closed host-function error-code catalog, set beside the human error message; absent on success. A guest branches on this code without parsing the message, tolerating an absent code (older host) or an unrecognized one (newer host) by falling back to the message. Allowed values: `"fetch_request_unreadable"`, `"fetch_input_unavailable"`, `"fetch_failed"`, `"request_unreadable"`, `"request_undecodable"`, `"source_root_unavailable"`, `"source_read_failed"`, `"unknown_selection_op"`, `"source_escape"`, `"producer_consumption_reentry"`, `"no_source_parser"`, `"no_parser_for_format"`, `"parse_failed"` |

_Additional properties are not permitted._

### `FetchExternalInputResponse`

The fetch-external-input host function's reply: on success the fetched content, on failure an error message. Exactly one of content or error is populated. Failure is delivered in-band rather than by trapping, so a guest carries an unresolvable URL or a fetch failure into its own diagnostics as a deterministic render failure. The request is a bare URL string rather than a JSON payload, so only the reply has a wire shape.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `content` | string | no | The fetched content on success (base64 on the JSON wire); absent on failure. A pointer so a zero-length payload still emits the content key and stays distinguishable from a failure. |
| `error` | string | no | The failure message on failure, naming the URL and the remedy; absent on success. |
| `error_code` | string (enum) | no | The machine-matchable failure identity on failure, from the closed host-function error-code catalog, set beside the human error message; absent on success. A guest branches on this code without parsing the message, tolerating an absent code (older host) or an unrecognized one (newer host) by falling back to the message. Allowed values: `"fetch_request_unreadable"`, `"fetch_input_unavailable"`, `"fetch_failed"`, `"request_unreadable"`, `"request_undecodable"`, `"source_root_unavailable"`, `"source_read_failed"`, `"unknown_selection_op"`, `"source_escape"`, `"producer_consumption_reentry"`, `"no_source_parser"`, `"no_parser_for_format"`, `"parse_failed"` |

_Additional properties are not permitted._

### `WorkloadProjection`

The pre-evaluated workload content the host hands a Provider guest so the guest synthesizes provider-native manifests from it in memory, present when the bound Recipe declares a workload rather than a chart source. Determinism is the guest's responsibility: identical input must produce identical bytes.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workload` | object | yes | The host-evaluated, post-validation Workload the guest synthesizes; opaque at this schema layer so the socket schema does not rebind the Workload entity contract. |
| `attachment_provides` | object | no | Every attachment on the node, projected to its resolved provides and keyed by the attachment instance name a workload attachment reference carries; absent when the node carries no attachments. The host copies the strings through without interpreting them, so the guest reads whichever entries of an attachment's provides it needs to resolve a reference to the resource that attachment produced. Whether an attachment handles declared-sensitive material is not repeated here: it travels on the node projection's matching feature entry, which a guest reads by the same instance name. |

_Additional properties are not permitted._

### `ArtifactsProjection`

The pre-evaluated artifact set the host hands a Provider guest to place into the node's output. The host has already resolved each entry's source (inline content or an imported file it read), evaluated it as a Go template against the render context using the guest's declared artifact-template delimiter pair, and computed the build-provenance label and annotation key sets. The guest owns the format decision, the provenance placement, the on-disk path, and the final bytes. Entries preserve author order so the placed output is byte-identical across runs of identical input.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `entries` | ArtifactProjectionEntry[] | yes | The artifact entries the guest places, in author order. |

_Additional properties are not permitted._

### `ArtifactProjectionEntry`

One pre-evaluated artifact entry the host hands a Provider guest to place: its host-resolved output name, its origin, the already-template-evaluated content bytes, and the build-provenance label and annotation key sets the host computed for the node. The guest decides how to place the provenance (splicing it into a manifest's metadata, prepending it as a comment, or emitting a companion file) and where the file lands.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | The host-resolved output name for the entry: the author-declared map key, with a file supplied by a library bundle nested under that key. The guest places the entry at this name or under a provider-specific sub-path derived from it. |
| `origin` | string (enum) | yes | Whether the entry was authored as inline content or as an imported file. A guest that rejects one form (an umbrella-chart provider rejects inline content) reads this to halt loudly. Allowed values: `"inline"`, `"import"` |
| `content` | string | yes | The already-template-evaluated content bytes the host produced from the entry's inline content or imported file, evaluated against the render context using the guest's declared artifact-template delimiter pair (base64 on the JSON wire). |
| `labels` | object | no | The Kubernetes-label-safe build-provenance key set the host computed for the node, keyed by label name. A guest that stamps provenance into a manifest's metadata.labels splices these; a guest whose output is not Kubernetes YAML ignores them. |
| `annotations` | object | no | The build-provenance key set the host computed for the node that a Kubernetes label cannot represent, keyed by annotation name. A guest that stamps provenance into a manifest's metadata.annotations splices these; a guest whose output is not Kubernetes YAML ignores them. |

_Additional properties are not permitted._

### `AssembleBoundaryInput`

The payload a Provider guest receives on its assemble_boundary export — the export that merges the per-node render outputs at one dispatch group into a single assembled artifact (an umbrella chart, a merged compose file). It carries the per-node render outputs with their merged annotations and deployment waves, the dispatch-group output path the assembled artifact lands at, the graph's uses edges for per-service dependency inference, and the render-time context. Not every provider declares the export: providers that emit only flat per-node output omit it.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `boundary` | object | no | Optional per-render boundary metadata a guest may consult. A dispatch group can merge contributors from multiple boundaries, so there is no single boundary; the field is carry-only-consumed and absent when the host merges across boundaries. Opaque at this schema layer; the guest reads the boundary-context shape through the render-context wire contract. |
| `rendered_nodes` | RenderedNode[] | yes | The per-node render outputs that fed this dispatch group, in node order. |
| `context` | object | yes | The render-time context the host hands the guest, the same opaque render-context passthrough the render_node export receives. |
| `boundary_path` | string | yes | The evaluated dispatch-group output path the assembled artifact lands at; a boundary assembler uses it as the boundary-level fallback identity (e.g. the compose network name for a node carrying no namespace annotation). |
| `edges` | RenderEdge[] | no | The graph's directed uses edges, so a boundary assembler can infer per-service ordering/dependencies across the dispatch group's contributors (e.g. compose depends_on). |
| `sub_charts` | SubChart[] | no | The per-sub-chart payload an umbrella-chart assembler consumes to emit one dependency and one values scope per contributor. Each entry carries the sub-chart's identity, per-instance values, and, for a sub-chart vendored from a chart source, the pristine bytes of that chart's Chart.yaml file. Present for umbrella-chart assembly; a flat-merging assembler omits it. |
| `chart_name` | string | no | The chart name an umbrella-chart assembler uses for the assembled chart when a name is supplied for the dispatch group; empty when the assembler derives the name from the dispatch-group output path. |
| `aggregate_name` | string | no | The top-level aggregate name an umbrella-chart assembler folds into the assembled chart's derived name; empty when no aggregate identity contributes to the name. |

_Additional properties are not permitted._

### `RenderedNode`

One node's render output as it appears in an assemble_boundary input: the node id, its type, its merged annotations, its deployment wave, and the render output the render_node export produced for it.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | yes | The node's absolute id within the topology graph. |
| `type` | string | yes | The node's component-type label. |
| `rendered` | RenderNodeOutput | yes |  |
| `annotations` | map of string | no | The node's merged annotations, so a boundary assembler can attribute per-node placement (e.g. the compose network derived from the aggrega.ai/namespace annotation). |
| `sync_wave` | integer | no | The deployment wave this node inherited from its containing boundary (default 0; negative permitted), so a boundary assembler can order the contributors it merges relative to one another. A dispatch group can merge contributors from several boundaries, each carrying its own wave, so the wave travels with every node here rather than once for the whole payload. An assembler whose output shape expresses no ordering ignores it. |

_Additional properties are not permitted._

### `RenderEdge`

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `source` | string | yes | The consuming node's id — the source end of a directed uses edge. |
| `target` | string | yes | The consumed node's id — the target end a directed uses edge points at. |

_Additional properties are not permitted._

### `SubChart`

One sub-chart contributing to an umbrella chart: its instance identity, the version the umbrella pins, the per-instance values the umbrella scopes under the sub-chart's alias, and, for a sub-chart vendored from a chart source, the pristine bytes of that chart's Chart.yaml file. An umbrella-chart assembler builds the umbrella's dependencies and values file from these pure-data views alone and touches no filesystem.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `instance_id` | string | yes | The sub-chart's instance identity within the dispatch group; the umbrella scopes the sub-chart's dependency alias and its values under it, so multiple instances of one source chart stay distinct. |
| `version` | string | no | The version the umbrella pins for the sub-chart. A sub-chart vendored from a chart source instead draws its dependency name and version from that chart's Chart.yaml file so the dependency binds; this value applies to a generative sub-chart that carries no vendored chart. |
| `values` | object | no | The per-instance values the umbrella scopes under the sub-chart's alias in the umbrella values.yaml file. Keys arrive in sorted order, not author order, and that sorting is what makes the payload byte-identical across runs of identical input; a guest needing any other ordering imposes it itself. |
| `chart_yaml` | string | no | The pristine bytes of the vendored chart's Chart.yaml, read from the local source at compile time, from which the umbrella draws the sub-chart dependency's name and version. Empty for a generative sub-chart that carries no vendored chart (base64 on the JSON wire). |

_Additional properties are not permitted._

### `AssembleBoundaryOutput`

The payload a Provider guest returns from its assemble_boundary export: the serialized bytes of each assembled file, any diagnostics the guest raised while assembling, and whether the orchestrator nests each contributor's per-node files under a per-node sub-directory. The guest returns each file's serialized bytes; the host writes them verbatim and runs no serializer. Determinism is the guest's responsibility: identical input must produce identical bytes.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `files` | RenderedFile[] | yes | The assembled output files the guest emitted, in emission order. Each names its on-disk path and carries the serialized bytes the host writes verbatim. |
| `diagnostics` | Diagnostic[] | no | Diagnostics the guest raised while assembling. Each element is the shared Wasm-plugin diagnostic shape. |
| `nest_per_node` | boolean | no | Whether the orchestrator nests each contributor's per-node files under charts/<nodeID>/ rather than emitting them flat; the assembler signals this per provider (compose emits flat, so false; an umbrella-chart assembler nests, so true). |
| `error` | string | no | A failure message set when the guest ran but could not complete the operation; absent on success. It is distinct from any diagnostics the output carries: diagnostics report issues found during a run that still produced a result, while error reports that the operation itself did not complete. The host surfaces a present error as a failed plugin invocation. |

_Additional properties are not permitted._

### `CarveInput`

The payload a Provider guest receives on its optional carve export: one named output file the pipeline carves into addressable units before a FeatureRecipe step edits some of them. A provider whose output shape the stock YAML codec cannot carve directly (a templated chart, for instance) advertises carve and reassemble so its own output-shape knowledge lives in the guest; a provider that omits the exports borrows the host's stock YAML codec.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | The output file's name, so the codec can apply any name-scoped carving rule. |
| `body` | string | yes | The output file's bytes to carve into addressable units (base64 on the JSON wire). |
| `yaml_indent` | integer | no | The indentation width the codec uses when it must synthesize new structured text; carried so the guest's carving matches the render-wide indentation. |

_Additional properties are not permitted._

### `CarveOutput`

The payload a Provider guest returns from its carve export: the ordered addressable units it carved the file into. A structured unit carries a tree (a PATCH target); an opaque unit carries only its media type and bytes.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `units` | object[] | yes | The ordered addressable units the guest carved the file into. |

_Additional properties are not permitted._

### `ReassembleInput`

The payload a Provider guest receives on its optional reassemble export: the original file plus its carved units and the patched units a pipeline step produced, so the guest splices the changes back into the original bytes surgically. A token absent from the patched set is re-joined from its original bytes verbatim; a patched token has only its addressed byte-spans edited.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | The output file's name, matching the name the same file was carved under. |
| `body` | string | yes | The original file bytes the reassembly splices the patched units back into (base64 on the JSON wire). |
| `segs` | object[] | no | The units the file was carved into, as carve returned them. |
| `patched` | object[] | no | The units a pipeline step changed, each carrying its token, patched tree, and the ops that produced the change. |
| `yaml_indent` | integer | no | The indentation width the codec uses when an op must synthesize new structured text; carried so the reassembly matches the render-wide indentation. |

_Additional properties are not permitted._

### `ReassembleOutput`

The payload a Provider guest returns from its reassemble export: the file's bytes with the patched units spliced back in. Reassembly is byte-faithful — every byte the ops did not touch survives verbatim.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `body` | string | yes | The reassembled file bytes the host writes verbatim (base64 on the JSON wire). |

_Additional properties are not permitted._

### `BoundaryEnvOverridesInput`

The payload a Provider guest receives on its optional boundary_env_overrides export: a boundary's internal uses edges and the driving feature's resolved infra, from which the guest computes per-consumer environment overrides for the boundary-to-consumer env channel. A guest whose provider drives that channel (a compose guest bridging cross-network endpoints) advertises the export; a provider that drives no such channel omits it, and the host applies no overrides for it. The edges and infra are opaque at this schema layer — the guest reads their shapes through the template-context wire contract; the schema does not interpret them.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `internal_uses_edges` | object[] | no | The boundary's internal uses edges — the directed edges whose endpoints both live inside the boundary's subtree, each enriched with the producer's provides and the consumer's inject mapping. The guest reads them to decide which consumers need an env override and what value to write. Opaque at this schema layer; the guest reads the enriched-edge shape through the template-context wire contract. |
| `infra` | object | no | The driving feature's resolved infra, an author-ordered key set the guest reads for the channel's tunables (for a compose bridge, the listen-port base and the upstream host provides-field selector). Preserves author order so the payload is byte-identical across runs of identical input. |

_Additional properties are not permitted._

### `BoundaryEnvOverridesOutput`

The payload a Provider guest returns from its boundary_env_overrides export: the per-consumer environment overrides the host applies to each named consumer's injected env after the per-node render pass. The values are opaque strings the host carries without interpretation; a consumer absent from the map is left untouched.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `overrides` | object | no | The per-consumer environment overrides, keyed by consumer node id to a map of environment-variable name to override value. An empty or absent map means the guest computed no overrides. |

_Additional properties are not permitted._

### `LinkEndpoint`

One endpoint of a cross-boundary link: the node, the boundary path its rendered output assembles into, and the provider that rendered it. The two endpoints of a link name the consuming and consumed ends of a uses edge whose ends assemble into different dispatch groups.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `node` | string | yes | The endpoint node's absolute id within the topology graph. |
| `boundary` | string | yes | The endpoint's boundary path — the dispatch group its rendered output assembles into. |
| `provider` | string | yes | The provider that rendered the endpoint (the bare provider name). Both endpoints of a wired link name the same provider; the host does not route a link whose endpoints name different providers. |
| `deployment` | string | no | The deployment identity the endpoint's rendered output belongs to — the scope its assembled artifacts are named within. The host assembles it from the build's deployment identity and passes it verbatim; it infers no meaning from the value. A provider reads it to scope a cross-reference name to the deployment. An absent value is the empty string, which a provider treats as an unscoped name. |

_Additional properties are not permitted._

### `LinkEdge`

The generalized, domain-blind per-edge payload the host assembles for a uses edge whose consuming and consumed ends assemble into different dispatch groups. It carries both endpoints, both endpoints' placement annotations as opaque scalar maps the host does not interpret, the consumed endpoint's provides output, and the socket and inject mapping the edge wires. A provider reads it to produce the provider-native cross-reference wiring the two ends need; the host assembles it and passes the annotation map as opaque scalars, inferring no meaning from any value.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `source` | LinkEndpoint | yes | The consuming endpoint — the source end of the directed uses edge, whose assembled output the consumer-side wiring is injected into. |
| `target` | LinkEndpoint | yes | The consumed endpoint — the target end the uses edge points at, whose assembled output the producer-side wiring publishes. |
| `target_annotations` | map of string | no | The consumed (target) endpoint's placement annotations as an opaque scalar map, keyed by annotation name. The host assembles them from the target's resolved annotations and passes them verbatim; it infers no meaning from any value. A provider reads them to decide how to shape a cross-reference (for example whether the two ends share a placement or need a cross-placement reference). Keys serialize in sorted order so the payload is byte-identical across runs of identical input. |
| `source_annotations` | map of string | no | The consuming (source) endpoint's placement annotations as an opaque scalar map, keyed by annotation name. The host assembles them from the source's resolved annotations and passes them verbatim; it infers no meaning from any value. A provider reads them to compare the two ends' placement — for example whether the source and target share a placement or sit in different ones. Keys serialize in sorted order so the payload is byte-identical across runs of identical input. |
| `socket` | string | yes | The socket alias the uses edge is bound under. |
| `provides` | map of string | yes | The consumed endpoint's provides output, an author-ordered key set exposing the target's declared outputs. Preserves author order so the payload is byte-identical across runs of identical input. |
| `inject` | object | yes | The consuming endpoint's inject mapping, keyed by delivery mechanism to an author-ordered key set, describing how the consuming end receives the consumed endpoint's output. Preserves author order so the payload is byte-identical across runs of identical input. |

_Additional properties are not permitted._

### `LinkPatch`

One per-file structural patch a provider returns as artifact wiring: the output file and the ordered structural operations to apply to it. A later host pass carves the named file, applies the operations, and reassembles it byte-faithfully. The operation shape is the shared pipeline patch-operation vocabulary; it is opaque at this schema layer, so a guest carries each operation verbatim while the host realizes the typed operation its pipeline applies.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `file` | string | yes | The output file the operations apply to, named as the provider emitted it. |
| `ops` | any[] | yes | The ordered structural operations to apply to the file, in application order. |

_Additional properties are not permitted._

### `LinkPublishInput`

The payload a provider receives on its link_publish export: one cross-boundary link whose consumed endpoint's output is referenced across a boundary. The export returns the published identity the consumer resolves against and any producer-side artifact wiring the consumed endpoint's output needs.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `edge` | LinkEdge | yes | The cross-boundary link being published, read from the consumed (target) endpoint's side. |

_Additional properties are not permitted._

### `LinkPublishOutput`

The payload a provider returns from its link_publish export: the published identity handle the consumer resolves against, and the producer-side artifact wiring to apply to the consumed endpoint's assembled output.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `handle` | map of string | yes | The published identity the consumed endpoint exposes for the consumer to resolve against, an opaque deterministic-pointer string map keyed by field name (for example an export name, a stack name, a region, a role reference). The values are deterministic pointer strings the compiler pipes and never resolves; the runtime environment resolves them at deploy time. Keys serialize in sorted order so the payload is byte-identical across runs of identical input. |
| `patches` | LinkPatch[] | no | The producer-side artifact wiring, one structural patch per consumed-endpoint output file the publish must edit. Empty when the consumed endpoint's output needs no change for the link. |

_Additional properties are not permitted._

### `LinkResolveInput`

The payload a provider receives on its link_resolve export: one cross-boundary link, the published identity handle its consumed endpoint exposed, and the consuming endpoint's assembled files. The export returns the consumer-side artifact wiring that injects the reference into the consuming endpoint's assembled output.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `edge` | LinkEdge | yes | The cross-boundary link being resolved, read from the consuming (source) endpoint's side. |
| `handle` | map of string | yes | The published identity handle the consumed endpoint's link_publish returned, which the consumer resolves its reference against. Opaque deterministic-pointer strings keyed by field name; the compiler pipes them and never resolves them. Keys serialize in sorted order so the payload is byte-identical across runs of identical input. |
| `consumer_files` | RenderedFile[] | no | The consuming endpoint's assembled files, so the provider can locate the placeholder the host stamped into the consuming output and author its replacement at the placeholder's real path. Each names its on-disk path and carries the assembled bytes. Absent when the host has no assembled consumer output to hand the resolve; a provider that needs no document to author its wiring ignores it. |

_Additional properties are not permitted._

### `LinkResolveOutput`

The payload a provider returns from its link_resolve export: the consumer-side artifact wiring to apply to the consuming endpoint's assembled output, injecting the reference to the consumed endpoint's published identity.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `patches` | LinkPatch[] | yes | The consumer-side artifact wiring, one structural patch per consuming-endpoint output file the resolve must edit. |

_Additional properties are not permitted._
