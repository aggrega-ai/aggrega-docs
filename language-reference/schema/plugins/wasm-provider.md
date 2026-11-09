# Aggrega Wasm Provider Render Socket schema

_Generated reference. Do not edit by hand — regenerate from the published JSON Schema._

Schema id: `https://aggrega.ai/schemas/wasm-provider-v1beta1.schema.json`

The wire shapes a Provider render plugin socket consumes and emits. A Provider guest renders one IR node into output files on its render_node export (RenderNodeInput to RenderNodeOutput), and optionally merges the per-node outputs at one boundary into a single assembled artifact on its assemble_boundary export (AssembleBoundaryInput to AssembleBoundaryOutput). AssembleBoundaryOutput carries the assembled files and any diagnostics; where each contributor's files sit is declared once on the guest's describe() contract rather than on this reply. A guest may also declare an optional validate_node_input export that structurally checks a node's resolved input before render dispatch: it consumes the same RenderNodeInput projection render_node receives and returns a ValidateNodeOutput carrying only diagnostics — a halt-severity diagnostic stops the build loudly, a warn-severity diagnostic surfaces to the build result. A guest whose target bounds or restricts the names it accepts may also declare an optional name_bound export, which the host asks before it settles a node's component identity: it consumes a NameBoundInput carrying one proposed name and returns a NameBoundOutput carrying one verdict per kind of name the guest would derive from it. A verdict carries a constraint — usable, or bounded to a shorter length — and never a name the guest built, so the knowledge of what the target accepts stays in the guest. Separately, a guest whose target derives a name of its own for the resources it renders — from author-supplied source, or from a workload it synthesizes — may declare an optional rendered_name export, which the host asks so a Recipe author can read that name and publish an address built from it: it consumes a RenderedNameInput carrying the identities the target derives from and the input kinds the node's Recipe declares, and returns a RenderedNameOutput carrying the name the guest itself will render under, or no name where it derives none. The two exports are opposite directions of one subject and neither stands in for the other — name_bound asks the guest to judge a name the host proposes, while rendered_name reports a name the guest composed, which the host carries without reading. A guest may also declare carve and reassemble, which carve its own output into addressable units for a pipeline step and splice the patched units back, and link_publish and link_resolve, which wire a uses edge whose ends assemble into different dispatch groups. Each payload's shape is the definition its export names: the x-aggrega-exports table maps every export the host calls a guest with — carve and reassemble included — to the definition of its input and the definition of its output, each as a JSON Pointer into this document's $defs, so a tool validating a payload looks its definition up there. The document root declares no shape of its own, because one document can be a valid payload of several exports (an empty object is a valid answer from validate_node_input, name_bound and rendered_name alike). The guest returns each output file's serialized bytes; the host writes them verbatim and runs no serializer, so determinism is the guest's responsibility: identical input must produce identical bytes. The Go, Rust and TypeScript payload types are generated from this schema into the plugin-ABI packages, so the three languages read and write one wire; a guest imports them from those packages, or through its plugin kit where the kit re-exports them.

## Exports

The schema's `x-aggrega-exports` table maps each export the host calls a guest with to the definition of its input and the definition of its output. A payload's shape is the definition its export names.

| Export | Input | Output |
| --- | --- | --- |
| `render_node` | `RenderNodeInput` | `RenderNodeOutput` |
| `validate_node_input` | `RenderNodeInput` | `ValidateNodeOutput` |
| `assemble_boundary` | `AssembleBoundaryInput` | `AssembleBoundaryOutput` |
| `carve` | `CarveInput` | `CarveOutput` |
| `reassemble` | `ReassembleInput` | `ReassembleOutput` |
| `name_bound` | `NameBoundInput` | `NameBoundOutput` |
| `rendered_name` | `RenderedNameInput` | `RenderedNameOutput` |
| `link_publish` | `LinkPublishInput` | `LinkPublishOutput` |
| `link_resolve` | `LinkResolveInput` | `LinkResolveOutput` |

## Definitions

### `RenderNodeInput`

The payload a Provider guest receives on its render_node export: the per-node IR projection the guest renders, the render-time context, the pre-evaluated inputs the node's bound Recipe declares — an acquired-source listing, a workload, an artifact set — each present only when that Recipe declares it, and the entries naming rendered units the guest leaves out of a source render.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `node` | IRNodeProjection | yes | The per-node IR data a Provider guest renders — a bounded projection of the full IR node carrying the per-node identity and the provenance the guest stamps onto every emitted manifest: its id, type, resolved recipe, values, whether a values mapping produced those values, feature attachments, the sensitivity marking over its rendered keys and over the values as a whole, outbound uses edges, boundary path, sync wave, Recipe identity, component-id override, derived-name basis, and build provenance. The identity and the derived-name basis are two carries because they answer two questions — what a resource belongs to, and what an author's own source renders against — and a Feature attachment delivering source its author wrote is where the two answers differ. Source-file content is not carried here; it travels separately in the source projection. Every key set here has a fixed order — features and uses in author order, values and the sensitivity marking in sorted key order — so the wire payload is byte-identical across runs of identical input. |
| `context` | object | yes | The render-time context the host hands the guest, carried as the bytes of its JSON document; this schema leaves the object undeclared. It is the context a pipeline step of the same node receives, plus the indentation width: parameters, the Release's parameter values sorted by name, absent when there are none; annotations, the node's annotations split by where each was written into aggregate, release and catalog, each absent when empty; boundary, the boundary the node sits in: name, path (its segments), sync_wave (absent when 0), directory, sub_directory (absent when there is none) and annotations (the set the Release's boundaries cascade down to the node, with its own Release entry's layered last; absent when empty); and yaml_indent, the render-wide indentation width the guest serializes its output at. The render of a boundary-scope FeatureRecipe, which has no host component, receives the context its pipeline step receives, plus yaml_indent: parameters; annotations carrying the release bucket alone, which is the boundary's own annotation set; and a boundary carrying its name, path and that same set as its annotations. The well-known aggrega.ai/* annotations are read from the aggregate bucket with the release bucket written over it, so a key both carry takes the Release's value; a standard-library provider reads them from that layered set and never from the catalog bucket, so a catalog value never decides one, and a boundary-scope FeatureRecipe, whose context carries no aggregate bucket, renders by its boundary's values rather than by any component's. |
| `source_listing` | SourceListing | no | The generic enumeration of the acquired source the host hands the guest for a sourced provider: the source root, whether that root is a directory, and the sorted root-relative entries under it. The host reads no file content here — it lists names only. The guest applies its own resolution logic over the listing and asks the host to pack a chosen selection through the pack-source host function, so all per-provider source-resolution intelligence lives in the guest. Present for sourced providers; absent otherwise. |
| `workload_projection` | WorkloadProjection | no | The pre-evaluated workload the host hands the guest to synthesize provider-native manifests from; present when the bound Recipe declares a workload rather than a chart source, absent otherwise. |
| `artifacts_projection` | ArtifactsProjection | no | The pre-evaluated artifact set the host hands the guest to place into the node's output, present when the bound Recipe declares artifacts. The host has already read each entry's source, evaluated it as a Go template against the render context, and computed the build-provenance key sets; the guest decides the output format, the provenance placement, the on-disk path, and the final bytes. Absent when the node declares no artifacts. |
| `omits` | OmitEntry[] | no | The entries naming rendered units the guest leaves out of this node's output, in the order the author declared them. Each entry arrives resolved, its fields plain strings, and an entry that does not apply to this build is not carried. What an entry's kind, name, namespace and subchart select is this provider's own documented contract, not this socket's: the guest matches every entry against what it rendered in its own format's terms, leaves each unit an entry matches out of everything it returns — its files, the names it declares in derived_keys and the facts it reports in render_facts — and reports in the output's omitted how many units each entry matched. The entries accompany a source listing and no other input: a render of a synthesized workload or of an artifact set never carries them. Absent when there are no entries, and a guest handed none renders exactly as it would if the field did not exist. |

_Additional properties are not permitted._

### `IRNodeProjection`

The per-node IR data a Provider guest renders — a bounded projection of the full IR node carrying the per-node identity and the provenance the guest stamps onto every emitted manifest: its id, type, resolved recipe, values, whether a values mapping produced those values, feature attachments, the sensitivity marking over its rendered keys and over the values as a whole, outbound uses edges, boundary path, sync wave, Recipe identity, component-id override, derived-name basis, and build provenance. The identity and the derived-name basis are two carries because they answer two questions — what a resource belongs to, and what an author's own source renders against — and a Feature attachment delivering source its author wrote is where the two answers differ. Source-file content is not carried here; it travels separately in the source projection. Every key set here has a fixed order — features and uses in author order, values and the sensitivity marking in sorted key order — so the wire payload is byte-identical across runs of identical input.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | yes | The node's absolute id within the topology graph. |
| `type` | string | yes | Declared and deliberately withheld: the host always emits this as the empty string. The node's component-type label is opaque metadata rather than a behavior switch, so carrying it here would only invite a guest to branch on it. A guest reads an empty string and must not read that as a node whose component type is unset. (The boundary-assembly node shape carries a type of its own, for a different purpose.) |
| `resolved_recipe` | string | yes | Declared and deliberately withheld: the host always emits this as the empty string. The bound Recipe's identity already reaches the guest as the recipe name and version it stamps into provenance, so the resolved URI adds nothing a guest renders from. A guest that needs to attribute output to a Recipe reads those provenance fields instead. |
| `values` | object | no | The node's rendered values dictionary, the key set the guest renders from. Keys arrive in sorted order, not author order, and that sorting is what makes the payload byte-identical across runs of identical input; a guest needing any other ordering imposes it itself. |
| `features` | object | no | The node's feature attachments keyed by feature alias, carrying the same per-node feature-attachment shape the IR carries. Each entry carries the attachment's values, infra and inject mapping alongside its derived sensitivity marking, so a guest reads whether an attachment handles declared-sensitive material from the payload alone. Preserves author order so the payload is byte-identical across runs of identical input. Opaque at this schema layer; the guest reads the feature-entry shape through the IR wire contract. |
| `sensitive_rendered_keys` | map of string | no | Rendered keys whose identity is recovered from a datum an author declared sensitive, each mapped to the declaration it inherited that sensitivity from. Travels host to guest on the render input — the opposite direction from the names a guest declares on the render output. What a key names follows the shape this payload carries: on a payload carrying the node's values it is one of that map's keys; on a payload carrying a workload it names an entry in the workload's own attachment maps, where the node's values are empty. A key is present only where the recovery is exact, joining a declaration to a rendered identity with nothing read out of the key's own text and no per-node or per-attachment marking spread across individual keys. A key a template invented is therefore absent, because no declaration names it: the output keys of a recipe's valuesMapping, and the content of an artifact, are template-authored, so neither yields a key here — whether such a payload was produced from a value declared sensitive is carried instead by sensitive_values, and by an artifact entry's own sensitive_content. Absence therefore states that no key's identity could be recovered, never that nothing on this payload carries sensitive material — a guest that reads an absent key as permission to display or emit a value in the clear has read it backwards. Keys arrive in sorted order, which is what makes the payload byte-identical across runs of identical input. |
| `sensitive_values` | boolean | no | True when the values this payload carries were produced by a template that reads a value an author declared sensitive, or a value traced to one: a Recipe's or a FeatureRecipe's valuesMapping, a single template whose output keys and values are its own invention, so no key of that output can be traced back to the datum it came from and the whole map is marked instead. It is read from the template's own references against the declarations — a reference reaching a declared value, the template handing on the whole of its data, or a template that does not parse all count — and never from a value's content or a key's name. A guest composing text a person reads, a refusal or a warning, keeps every value of the node's values out of that text when this is true, and keeps out the value under any key sensitive_rendered_keys names whether or not it is: the two compose, one naming the keys whose identity is recovered exactly and this one covering the map where none can be. Absent when no such template read such a value, which includes values that are the declared leaves themselves, marked per key in sensitive_rendered_keys instead, and absent on a payload carrying no values. Absence never states that no value is sensitive. |
| `values_mapped` | boolean | no | True when the values this payload carries are the output of the bound Recipe's or FeatureRecipe's valuesMapping, rather than the node's values handed on as the author wrote them. A guest whose own contract binds to the inputs its source declares only the values a mapping produced reads this, and leaves values written for something else, such as the Recipe's artifacts, unread; a guest that binds the node's values to its source however they were produced does not read it. It records how the values were produced and is never derived from a key's name or a value's content. Absent where no valuesMapping ran, and on a payload carrying no values. |
| `uses` | map of string[] | no | Declared and deliberately withheld: the host never populates this, so the map is absent from every render payload. An outbound edge is consumed before dispatch — the edge's published values are rehydrated into the node's own inject pipe, which the Recipe has already evaluated into the values and workload the guest receives — and a guest assembling a boundary receives the edge list on its own input instead. Were it populated it would key the node's outbound uses edges by socket alias, each carrying that socket's ordered target node ids in author order. |
| `boundary_path` | string | no | The node's boundary path, stamped as the aggrega.ai/boundary-path annotation on every emitted manifest that carries a metadata block. |
| `sync_wave` | integer | no | The deployment wave this node inherited from its containing boundary (default 0; negative permitted), carrying the value the IR node holds as `sync_wave`. What a guest does with it is the guest's own choice, and recording the value and ordering on it are independent rather than alternatives — a guest may do either, both or neither. Among the standard-library providers: `helm` and `helm-chart` emit it as an `argocd.argoproj.io/sync-wave` annotation on every rendered resource, and additionally as `helm.sh/hook-weight` on a resource the chart already marks as a Helm hook; `compose` both records it as a service label and orders the services of the file it renders into, through `depends_on` between them; `cloudformation` orders provisioning of the assembled stack, declaring every resource in a wave to depend on the resources of the wave before it; `terraform` orders the module blocks of the root configuration a boundary assembles into, declaring every module in a wave to depend on the modules of the wave before it, and also records it with the node's build provenance. |
| `recipe_name` | string | no | The bound Recipe's name, paired with recipe_version to form the aggrega.ai/recipe-uri annotation; when either half is empty the annotation is not stamped. |
| `recipe_version` | string | no | The bound Recipe's version, paired with recipe_name to form the aggrega.ai/recipe-uri annotation; when either half is empty the annotation is not stamped. |
| `label_component_id` | string | no | The Kubernetes-safe component identity — what a resource this node emits BELONGS to, which is what provenance records and what a selector queries. When non-empty it overrides the node id as the app.kubernetes.io/name and aggrega.ai/component-id label value; empty means the node id is already label-valid and is used directly. It is carried for every resource a Feature attachment emits, whatever way the attachment delivers them, so an attachment's resources are distinguishable from its host component's by label alone. What a guest derives its own names from is a separate carry, derived_name_basis, and the two answer different questions. |
| `derived_name_basis` | string | no | The identity a guest derives its own names from — the release name a chart installer's templates read, which such a guest may also name the resources it synthesizes for a component after, and the prefix on the files a source render emits. Empty means the node id is used directly, which is the value for an ordinary component and for a per-component Feature attachment: an attachment delivering a chart or a fragment its author wrote renders it against the HOST component's name, because the author's own templates name resources after that name and a different one would rename resources already deployed. A node whose id carries marker syntax a target's name alphabet refuses carries this explicitly instead, so the name a guest derives stays one the target accepts. It is deliberately separate from label_component_id: a guest that BUILDS resources for a Feature attachment rather than rendering its author's source names them after the identity, so the attachment's own resources cannot collide with its host's, while the name an author's source renders against stays put. The two carry the same value wherever a node's identity is also what its source renders against. |
| `output_labels` | map of string | no | The recipe-author-declared output labels the guest stamps onto every emitted manifest alongside the build-identity provenance, keyed by label name. Two authored blocks merge into this one map: the literal key-value pairs a recipe writes in `outputLabels`, and one entry for each key a recipe names in `outputComponentLabels`, whose value is read from that key on the rendered component's own labels — so a promoted value follows the component it came from rather than being repeated in the recipe. Both blocks are disjoint from the provenance keyspace by load-time validation (no aggrega.ai/ or app.kubernetes.io/ key), so stamping never collides with a provenance label. A promoted key the component does not declare stamps nothing and raises an advisory rather than an empty label. A guest whose output is not Kubernetes YAML translates them onto its own label surface (Compose service labels) or ignores them. |
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

The payload a Provider guest returns from its render_node export: the serialized bytes of each output file the guest emitted, the names it derived into each of its own key spaces, the facts it reports about what it emitted, how many rendered units each omit entry it was handed matched, and any diagnostics the guest raised while rendering. The guest returns each file's serialized bytes; the host writes them verbatim and runs no serializer. Determinism is the guest's responsibility: identical input must produce identical bytes.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `files` | RenderedFile[] | yes | The output files the guest emitted, in emission order. Each names its on-disk path and carries the serialized bytes the host writes verbatim. |
| `derived_keys` | map of string[] | no | The names the guest derived while rendering this node, keyed by the key space it derived them into, each space carrying its names in derivation order. A guest that derives the name its output addresses a resource by has put that name inside the file bytes the host writes verbatim, where the host cannot see it; declaring it here is how the guest asks the host to confirm no two derivations landed on one name. The host compares declared names for equality within one declared space and does nothing else — it does not parse a name, does not learn what a space or a name means, and never derives one itself. Two contributors to the same assembled output that declare the same name in the same space halt the build, and the halt names the space, the name, and both contributors. Both the space names and the names within them are the guest's own vocabulary: a guest wanting uniqueness across a narrower or wider scope than one assembled output expresses that scope in the space name it declares. Preserves declaration order so the payload is byte-identical across runs of identical input. Absent when the guest derives no names it wants checked, which leaves the check inert for that guest. |
| `render_facts` | RenderFact[] | no | Facts the guest reports about what it emitted for this node, in the order the guest lists them. Each fact pairs a name with a value, and both are the guest's own vocabulary: which facts a provider reports, what each name means and what its entries hold are part of that provider's documented contract, not of this socket's. Every fact's value is a list, even when it holds one entry: the host refuses a fact whose value is anything else, naming the provider and the fact, and halts the build. That is the one thing the host learns about a value. It keys facts by name and hands each list to the templates that read it, joining the lists of one name reported by more than one render of the same node in the order those renders ran, and it never learns what a name or an entry means or derives a fact itself — so a provider can report something only its own format knowledge can see, such as a property of the documents it wrote, without the host learning that format. Reporting facts never changes what is written: the files the host writes are the files the guest returned, whether or not facts accompany them. The guest lists its facts in a fixed order so the payload is byte-identical across runs of identical input. Absent when the guest reports nothing, which is a complete answer rather than a missing one. |
| `omitted` | integer[] | no | How many rendered units each entry of the input's omits matched: one count per entry the guest was handed, in the same order, each the number of units that entry matched whether or not another entry also matched them. A count of zero is a complete answer — the entry matched nothing the guest rendered. The counts are all the socket carries back about what was left out: the units themselves are simply absent from what the guest returned. Absent when the guest was handed no entries. |
| `diagnostics` | Diagnostic[] | no | Diagnostics the guest raised while rendering. Each element is the shared Wasm-plugin diagnostic shape. |
| `error` | string | no | A failure message set when the guest ran but could not complete the operation; absent on success. It is distinct from any diagnostics the output carries: diagnostics report issues found during a run that still produced a result, while error reports that the operation itself did not complete. The host surfaces a present error as a failed plugin invocation. |
| `condition_code` | string | no | The descriptive, machine-matchable identity of the condition the failure names — the code the condition is registered under, in the same open set the compiler registers its own halting conditions in, and not a member of the closed host-function error-code catalog a reply envelope's hostfunc_error_code draws from. Set beside the human error message; absent on success, and absent when the guest names no such condition. A guest that halts reports here the identifier of the condition its message names, so a consumer branches on it instead of recovering an identity by reading the message. The host resolves this identifier against the conditions the compiler declares and publishes the resolved condition's own identifiers on the structured diagnostic, so a code that reaches a reader always resolves; an identifier naming no such condition, or one the numbering has retired, halts the build. A guest with no precise condition to name reaches instead for one of the generic plugin-failure conditions the compiler declares for the purpose, and puts the specifics in its own message. This identifier and condition_short_code are reported together, because they name one condition in two forms: a guest that sets one and not the other has named a condition the host cannot resolve, and the host then reports its own generic plugin-failure condition instead while the message still carries the whole failure. |
| `condition_short_code` | string | no | The compact identifier of the same condition — the letter E and four digits, the form a reader quotes, searches for and pastes into a report — set beside the human error message; absent on success, and absent when the guest names no such condition. The host prints it in the bracketed head of the diagnostic it renders for this failure, so a condition a guest raises is quotable exactly as one the compiler raises is. The host resolves the value against the conditions the compiler declares rather than carrying it on trust: a value naming no such condition, a value the numbering has retired, or a spelling the registration does not carry halts the build and quotes the offending value, with the guest's own message still reported. It is reported together with condition_code, for the reason stated there. |

_Additional properties are not permitted._

### `ValidateNodeOutput`

The payload a Provider guest returns from its optional validate_node_input export: the diagnostics raised by a structural check of the node's resolved input. The export consumes the same RenderNodeInput projection render_node receives and emits no files — it only reports diagnostics. A halt-severity diagnostic stops the build loudly, naming the node and provider; a warn- or info-severity diagnostic surfaces to the build result without changing rendered output. An empty diagnostics list means the input passed the structural check.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `diagnostics` | Diagnostic[] | no | Diagnostics the guest raised while validating the node's input. Each element is the shared Wasm-plugin diagnostic shape. Empty when the input passed the structural check. |
| `error` | string | no | A failure message set when the guest ran but could not complete the operation; absent on success. It is distinct from any diagnostics the output carries: diagnostics report issues found during a run that still produced a result, while error reports that the operation itself did not complete. The host surfaces a present error as a failed plugin invocation. |
| `condition_code` | string | no | The descriptive, machine-matchable identity of the condition the failure names — the code the condition is registered under, in the same open set the compiler registers its own halting conditions in, and not a member of the closed host-function error-code catalog a reply envelope's hostfunc_error_code draws from. Set beside the human error message; absent on success, and absent when the guest names no such condition. A guest that halts reports here the identifier of the condition its message names, so a consumer branches on it instead of recovering an identity by reading the message. The host resolves this identifier against the conditions the compiler declares and publishes the resolved condition's own identifiers on the structured diagnostic, so a code that reaches a reader always resolves; an identifier naming no such condition, or one the numbering has retired, halts the build. A guest with no precise condition to name reaches instead for one of the generic plugin-failure conditions the compiler declares for the purpose, and puts the specifics in its own message. This identifier and condition_short_code are reported together, because they name one condition in two forms: a guest that sets one and not the other has named a condition the host cannot resolve, and the host then reports its own generic plugin-failure condition instead while the message still carries the whole failure. |
| `condition_short_code` | string | no | The compact identifier of the same condition — the letter E and four digits, the form a reader quotes, searches for and pastes into a report — set beside the human error message; absent on success, and absent when the guest names no such condition. The host prints it in the bracketed head of the diagnostic it renders for this failure, so a condition a guest raises is quotable exactly as one the compiler raises is. The host resolves the value against the conditions the compiler declares rather than carrying it on trust: a value naming no such condition, a value the numbering has retired, or a spelling the registration does not carry halts the build and quotes the offending value, with the guest's own message still reported. It is reported together with condition_code, for the reason stated there. |

_Additional properties are not permitted._

### `RenderedFile`

One output file a Provider guest emitted: its on-disk path relative to the node's output root, and its serialized bytes exactly as the guest produced them. The host writes these bytes verbatim and runs no serializer, so the on-disk output is byte-identical to what the guest emitted.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `path` | string | yes | The output file's path relative to the node's output root (for example Chart.yaml or templates/deployment.yaml). |
| `content` | string | yes | The file's serialized bytes exactly as the guest produced them; the host writes these bytes verbatim and runs no serializer, so output is byte-identical to what the guest emitted. Each kit carries them in its own field type — raw where that type is a byte type, base64-encoded where it is a string the guest decodes to recover them — and the generated encoder converts between the field and the form the wire carries bytes in. |
| `format` | string | no | The format the guest declares the emitted file was rendered in, so the host can route the file to a matching parser. Absent when the guest declares no format, in which case the host infers the format from the file extension. |

_Additional properties are not permitted._

### `RenderFact`

One fact a Provider guest reports about what it emitted for a node: a name and a list of entries, both defined and documented by the provider. The host carries the fact as the guest wrote it, refuses one whose value is not a list, and learns nothing else about either half.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | The fact's name, from the provider's own documented vocabulary. |
| `value` | array | yes | The fact's value: a JSON array — always a list, even with one entry or none — whose entries are any JSON values in the shape the provider documents for that name. A list is what lets one name be reported by more than one render of a node: the host joins the lists into one. It is carried as the JSON document the guest wrote, byte for byte, so the order of the list's entries and of each object's keys is the guest's own. |

_Additional properties are not permitted._

### `OmitEntry`

One entry naming rendered units a Provider guest leaves out of a node's output, its fields already resolved to plain strings and marked where any of them was produced from a value declared sensitive. The socket attaches no meaning to them: each provider documents what kind, name, namespace and subchart select in its own format, and matches them itself.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `kind` | string | yes | The kind of rendered unit the entry names, in the provider's own vocabulary. |
| `name` | string | yes | The name of the rendered unit the entry names, in the provider's own vocabulary. |
| `namespace` | string | no | The namespace the named unit sits in, for a provider whose format places units in one. Absent when the author wrote none; what an entry with no namespace matches is the provider's own contract. |
| `subchart` | string | no | The nested source the named unit came from, for a provider whose source is assembled from nested sources, as a chart is from its subcharts. Absent when the author wrote none; what an entry with no subchart matches, and what a provider whose source has no nested sources does with an entry naming one, is the provider's own contract. |
| `sensitive` | boolean | no | True when the template that produced any of the entry's kind, name, namespace or subchart reads a value an author declared sensitive, or a value traced to one. It is read from each field's template against the declarations — a reference reaching a declared value, the template handing on the whole of its data, or a template that does not parse all count — and never from the resolved strings. The mark covers the whole entry rather than naming the field, so a guest treats a marked entry as it treats every other marked value on its input: it still matches and counts the entry by its fields, which is what the entry is for, and keeps every field of it out of any text a person reads — a refusal, a warning or a log line. Absent when no field's template reads such a value; absence never states that no field is sensitive. |

_Additional properties are not permitted._

### `SourceFile`

One file of a pre-packaged source projection: its path relative to the source root and its raw bytes, exactly as the host read them from the local source at compile time.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `path` | string | yes | The file's path relative to the source root (for example Chart.yaml or templates/deployment.yaml). |
| `content` | string | yes | The file's raw bytes exactly as the host read them from the local source. Each kit carries them in its own field type — raw where that type is a byte type, base64-encoded where it is a string the guest decodes to recover them — and the generated encoder converts between the field and the form the wire carries bytes in. |

_Additional properties are not permitted._

### `SourceProjection`

The packed source content (e.g. a Helm chart's files, each named by its path relative to the source root, in walk order) the host reads and returns to the guest in response to a pack-source request, so the guest reconstructs the selected source in memory and touches no filesystem. It is the pack-source host function's success payload.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `files` | SourceFile[] | yes | The source files, each named by its path relative to the source root, in the host's deterministic walk order. |

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
| `hostfunc_error_code` | string (enum) | no | The machine-matchable failure identity on failure, drawn from the closed host-function error-code catalog, set beside the human error message; absent on success. That catalog is a fixed vocabulary naming the ways a host function can fail, and it is a different vocabulary from the halting conditions the compiler registers, whose identifiers a guest reports on a socket output as condition_code and condition_short_code — the key name says which of the two a value belongs to, so the two are never read as one set. A guest branches on this code without parsing the message, tolerating an absent code (older host) or an unrecognized one (newer host) by falling back to the message. Allowed values: `"fetch_request_unreadable"`, `"fetch_input_unavailable"`, `"fetch_failed"`, `"request_unreadable"`, `"request_undecodable"`, `"source_root_unavailable"`, `"source_read_failed"`, `"unknown_selection_op"`, `"source_escape"`, `"producer_consumption_reentry"`, `"no_source_parser"`, `"no_parser_for_format"`, `"parse_failed"` |

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
| `content` | string | no | The file's raw bytes on success; absent on failure. Each kit carries them in its own field type — raw where that type is a byte type, base64-encoded where it is a string the guest decodes to recover them — and the generated encoder converts between the field and the form the wire carries bytes in. |
| `error` | string | no | The failure message on failure, naming the file and the reason; absent on success. |
| `hostfunc_error_code` | string (enum) | no | The machine-matchable failure identity on failure, drawn from the closed host-function error-code catalog, set beside the human error message; absent on success. That catalog is a fixed vocabulary naming the ways a host function can fail, and it is a different vocabulary from the halting conditions the compiler registers, whose identifiers a guest reports on a socket output as condition_code and condition_short_code — the key name says which of the two a value belongs to, so the two are never read as one set. A guest branches on this code without parsing the message, tolerating an absent code (older host) or an unrecognized one (newer host) by falling back to the message. Allowed values: `"fetch_request_unreadable"`, `"fetch_input_unavailable"`, `"fetch_failed"`, `"request_unreadable"`, `"request_undecodable"`, `"source_root_unavailable"`, `"source_read_failed"`, `"unknown_selection_op"`, `"source_escape"`, `"producer_consumption_reentry"`, `"no_source_parser"`, `"no_parser_for_format"`, `"parse_failed"` |

_Additional properties are not permitted._

### `FetchExternalInputResponse`

The fetch-external-input host function's reply: on success the fetched content, on failure an error message and its code. A reply that carries neither failure field is a success, so a zero-length payload is the reply with every field absent. Failure is delivered in-band rather than by trapping, so a guest carries an unresolvable URL or a fetch failure into its own diagnostics as a deterministic render failure. The request is a bare URL string rather than a structured payload, so only the reply has a declared shape.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `content` | string | no | The fetched payload's raw bytes on success; absent on failure, and absent when the payload is empty. The bytes cross the wire as a byte string, never as base64 text. The Go kit holds them as a byte slice; the Rust and TypeScript kits hold them as a base64 string, which each kit's fetch wrapper decodes, so every wrapper returns the payload's raw bytes. |
| `error` | string | no | The failure message on failure, naming the URL and the remedy; absent on success. |
| `hostfunc_error_code` | string (enum) | no | The machine-matchable failure identity on failure, drawn from the closed host-function error-code catalog, set beside the human error message; absent on success. That catalog is a fixed vocabulary naming the ways a host function can fail, and it is a different vocabulary from the halting conditions the compiler registers, whose identifiers a guest reports on a socket output as condition_code and condition_short_code — the key name says which of the two a value belongs to, so the two are never read as one set. A guest branches on this code without parsing the message, tolerating an absent code (older host) or an unrecognized one (newer host) by falling back to the message. Allowed values: `"fetch_request_unreadable"`, `"fetch_input_unavailable"`, `"fetch_failed"`, `"request_unreadable"`, `"request_undecodable"`, `"source_root_unavailable"`, `"source_read_failed"`, `"unknown_selection_op"`, `"source_escape"`, `"producer_consumption_reentry"`, `"no_source_parser"`, `"no_parser_for_format"`, `"parse_failed"` |

_Additional properties are not permitted._

### `WorkloadProjection`

The pre-evaluated workload content the host hands a Provider guest so the guest synthesizes provider-native manifests from it in memory, present when the bound Recipe declares a workload rather than a chart source. Determinism is the guest's responsibility: identical input must produce identical bytes.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `workload` | object | yes | The host-evaluated, post-validation Workload the guest synthesizes; opaque at this schema layer so the socket schema does not rebind the Workload entity contract. |
| `sensitive_workload` | boolean | no | True when the template that produced workload reads a value an author declared sensitive, or a value traced to one. It is read from the template's own references against the declarations — a reference reaching a declared value, the template handing on the whole of its data, or a template that does not parse all count — and never from the content of any field. A rendered workload's fields carry no link back to the data its template read, so this marks the whole document: a guest composing text a person reads, a refusal or a warning, keeps every value the workload carries out of that text when this is true, while the document's shape — its keys and where a value sits — stays readable. The attachment entries the node projection's sensitive_rendered_keys names are marked there whether or not this is set. Absent when the template reads no such value; absence never states that no field is sensitive. |
| `attachment_provides` | object | no | Every attachment on the node, projected to its resolved provides and keyed by the attachment instance name a workload attachment reference carries; absent when the node carries no attachments. The host copies the strings through without interpreting them, so the guest reads whichever entries of an attachment's provides it needs to resolve a reference to the resource that attachment produced. Whether an attachment handles declared-sensitive material is not repeated here: it travels on the node projection's matching feature entry, which a guest reads by the same instance name. |

_Additional properties are not permitted._

### `ArtifactsProjection`

The pre-evaluated artifact set the host hands a Provider guest to place into the node's output. The host has already resolved each entry's source (inline content or an imported file it read), evaluated it as a Go template against the render context using the guest's declared artifact-template delimiter pair, and computed the build-provenance label and annotation key sets. The guest owns the format decision, the provenance placement, the on-disk path, and the final bytes. Entries preserve author order so the placed output is byte-identical across runs of identical input.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `entries` | ArtifactProjectionEntry[] | yes | The artifact entries the guest places, in author order. |

_Additional properties are not permitted._

### `ArtifactProjectionEntry`

One pre-evaluated artifact entry the host hands a Provider guest to place: its host-resolved output name, its origin, the already-template-evaluated content bytes, whether the template those bytes came from reads a value declared sensitive, and the build-provenance label and annotation key sets the host computed for the node. The guest decides how to place the provenance (splicing it into a manifest's metadata, prepending it as a comment, or emitting a companion file) and where the file lands.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | The host-resolved output name for the entry: the author-declared map key, with a file supplied by a library bundle nested under that key. The guest places the entry at this name or under a provider-specific sub-path derived from it. |
| `origin` | string (enum) | yes | Whether the entry was authored as inline content or as an imported file. A guest that rejects one form (an umbrella-chart provider rejects inline content) reads this to halt loudly. Allowed values: `"inline"`, `"import"` |
| `content` | string | yes | The already-template-evaluated content bytes the host produced from the entry's inline content or imported file, evaluated against the render context using the guest's declared artifact-template delimiter pair. Each kit carries them in its own field type — raw where that type is a byte type, base64-encoded where it is a string the guest decodes to recover them — and the generated encoder converts between the field and the form the wire carries bytes in. |
| `sensitive_content` | boolean | no | True when the template this entry's content was evaluated from reads a value an author declared sensitive, or a value traced to one. It is read from the template's own references against the declarations, with the delimiter pair the content was evaluated with — a reference reaching a declared value, the template handing on the whole of its data, or a template that does not parse all count — and never from the content itself. The content is that template's output, so nothing in it can be traced back to the datum it came from: a guest composing text a person reads, a refusal or a warning, keeps every part of the content out of that text when this is true, a parser's own message about the content included. It is set per entry, so one entry's template reading such a value says nothing about another's. Absent when the template reads no such value; absence never states that the content is not sensitive. |
| `labels` | object | no | The Kubernetes-label-safe build-provenance key set the host computed for the node, keyed by label name. A guest that stamps provenance into a manifest's metadata.labels splices these; a guest whose output is not Kubernetes YAML ignores them. |
| `annotations` | object | no | The build-provenance key set the host computed for the node that a Kubernetes label cannot represent, keyed by annotation name. A guest that stamps provenance into a manifest's metadata.annotations splices these; a guest whose output is not Kubernetes YAML ignores them. |

_Additional properties are not permitted._

### `AssembleBoundaryInput`

The payload a Provider guest receives on its assemble_boundary export — the export that merges the per-node render outputs at one dispatch group into a single assembled artifact (an umbrella chart, a merged compose file). It carries the per-node render outputs with their merged annotations and deployment waves, the dispatch-group output path the assembled artifact lands at, the graph's uses edges for per-service dependency inference, and the render-time context. Not every provider declares the export: providers that emit only flat per-node output omit it.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `rendered_nodes` | RenderedNode[] | yes | The per-node render outputs that fed this dispatch group, in node order. |
| `context` | object | yes | The render-time context, carried as the bytes of its JSON document. On this export the host sets only yaml_indent, the render-wide indentation width the assembled files are serialized at; the context's other members carry nothing here, because an assembly merges contributors whose annotations and boundaries differ, and each contributor's annotations arrive on its rendered_nodes entry instead. |
| `boundary_path` | string | yes | The evaluated dispatch-group output path the assembled artifact lands at; a boundary assembler uses it as the boundary-level fallback identity (e.g. the compose network name for a node carrying no namespace annotation). |
| `edges` | RenderEdge[] | no | The graph's directed uses edges, so a boundary assembler can infer per-service ordering/dependencies across the dispatch group's contributors (e.g. compose depends_on). |
| `sub_charts` | SubChart[] | no | The per-sub-chart payload an umbrella-chart assembler consumes to emit one dependency and one values scope per contributor. Each entry carries the sub-chart's identity, per-instance values, and, for a sub-chart vendored from a chart source, the pristine bytes of that chart's Chart.yaml file. Present for umbrella-chart assembly; a flat-merging assembler omits it. |
| `chart_name` | string | no | The chart name an umbrella-chart assembler uses for the assembled chart when a name is supplied for the dispatch group; empty when the assembler derives the name from the dispatch-group output path. |
| `aggregate_name` | string | no | The top-level aggregate name an umbrella-chart assembler folds into the assembled chart's derived name; empty when no aggregate identity contributes to the name. |

_Additional properties are not permitted._

### `RenderedNode`

One node's render output as it appears in an assemble_boundary input: the node id, its type, its merged annotations, its sync wave, the values the compiler resolved for it where those are the compiler's to supply and whether a values mapping produced them, and the files the render_node export produced for it — carried in the render output's shape, with every member of that shape other than its files left absent.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | yes | The node's absolute id within the topology graph. A contributor that is not one of the graph's nodes — a Feature attached at a boundary rather than at a component — carries the compiler's own dispatch identity for it here instead, which is the same identity the render_node call for that contributor carried; it distinguishes one contributor from another and is not a name any target accepts. What such a contributor derives names from inside the assembled artifact is a separate carry, derived_name_basis. |
| `type` | string | yes | The node's component-type label, carried on this shape — unlike the per-node render projection, which withholds it. Opaque metadata rather than a behavior switch: it is here so an assembler can group and label the nodes it merges, not so a guest can branch on it. |
| `derived_name_basis` | string | no | The identity this contributor derives its own names from inside the assembled artifact — a logical id an assembler mints for one of the contributor's published entries, a per-contributor scope in a merged document, the name of a child unit placed at a position of its own. Empty means the id is used directly, which is the value for an ordinary component. A contributor whose id is a dispatch identity a target's name alphabet refuses carries this explicitly, so the assembled artifact addresses its content by a name the target accepts, and two contributors an author can tell apart cannot arrive under one. Where the contributor's content is folded into a document the assembler merges, this is the same carry the render_node call for that contributor received, and carrying it on both is what keeps the two answers equal: a name the contributor declared while rendering and the name the merged document addresses that content by are derived from one identity rather than from two that happen to agree. Where the contributor is placed at a position of its own instead, this is the identity composed for that contributor — for a Feature attached to a component, its own rather than the host component's its render ran against — so a child unit placed beside its host is addressed apart from it. |
| `output_directory` | string | no | The directory this contributor's rendered files sit in, relative to the assembled artifact's own position, carrying no trailing separator. A guest that has to name a contributor's files from inside the assembled artifact — the source path of a module block, an include directive — reads the position from here rather than composing one from the contributor's identity, so the path the assembled artifact points at is the path the files were written to. The two are not always one directory apart: a contributor the host placed inside another contributor's position sits deeper than the contributors placed directly beneath the assembly. Present only where the assembling provider places each contributor under a position of its own; a provider that folds its contributors into one document places no per-contributor directory and receives none. |
| `rendered` | RenderNodeOutput | yes | The payload a Provider guest returns from its render_node export: the serialized bytes of each output file the guest emitted, the names it derived into each of its own key spaces, the facts it reports about what it emitted, how many rendered units each omit entry it was handed matched, and any diagnostics the guest raised while rendering. The guest returns each file's serialized bytes; the host writes them verbatim and runs no serializer. Determinism is the guest's responsibility: identical input must produce identical bytes. |
| `annotations` | map of string | no | The node's merged annotations, so a boundary assembler can attribute per-node placement (e.g. the compose network derived from the aggrega.ai/namespace annotation). |
| `sync_wave` | integer | no | The deployment wave this node inherited from its containing boundary (default 0; negative permitted), so a boundary assembler can order the contributors it merges relative to one another. A dispatch group can merge contributors from several boundaries, each carrying its own wave, so the wave travels with every node here rather than once for the whole payload. An assembler whose output shape expresses no ordering ignores it. |
| `values` | object | no | The values the compiler resolved for this node, present only for a node rendered from a source — the render_node call that produced its files carried a source_listing. That is the one case where the files came from elsewhere and the values could not be written into them, so a position outside them has to supply them: a boundary assembler places a present dictionary as that contributor's inputs in the assembled artifact itself, rather than beside the contributor's own files, and where the assembled artifact is the only position the target evaluates, that is the difference between an input the target reads and one it never reaches. A node rendered from a workload_projection or an artifacts_projection resolved these values into the files it produced, so it carries none here and the field is absent: supplying them a second time would offer the assembled artifact inputs that node's own files never declare, which the target is free to reject. Keys arrive in sorted order, not author order, and that sorting is what makes the payload byte-identical across runs of identical input; a guest needing any other ordering imposes it itself. An assembler whose output shape carries no per-contributor inputs ignores the field. |
| `values_mapped` | boolean | no | True when the values this node carries are the output of its bound Recipe's or FeatureRecipe's valuesMapping (a component's Recipe, an attached Feature's FeatureRecipe), rather than the node's values handed on as the author wrote them — the same mark the render_node call for this node carried on its node projection, carried here beside the values it describes. Absent where no valuesMapping ran, and wherever values is absent. Whether an assembler reads it is that assembler's own contract: one whose render_node binds a mapped node's values to the inputs its source declares can learn from it which names that binding filled, while one that places a node's values as its inputs however they were produced does not read it. It records how the values were produced and is never derived from a key's name or a value's content. |

_Additional properties are not permitted._

### `RenderEdge`

One directed uses edge of the graph, named by its two node ids: source is the consuming node and target the consumed one. The list carries every uses edge of the graph, so either end may be a node outside this dispatch group.

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
| `chart_yaml` | string | no | The pristine bytes of the vendored chart's Chart.yaml, read from the local source at compile time, from which the umbrella draws the sub-chart dependency's name and version. Empty for a generative sub-chart that carries no vendored chart. Each kit carries them in its own field type — raw where that type is a byte type, base64-encoded where it is a string the guest decodes to recover them — and the generated encoder converts between the field and the form the wire carries bytes in. |

_Additional properties are not permitted._

### `AssembleBoundaryOutput`

The payload a Provider guest returns from its assemble_boundary export: the serialized bytes of each assembled file and any diagnostics the guest raised while assembling. Where the assembled group's per-node files sit is not part of this reply — it is a static property of the provider, declared once on its describe() contract and in hand before any node renders. The guest returns each file's serialized bytes; the host writes them verbatim and runs no serializer. Determinism is the guest's responsibility: identical input must produce identical bytes.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `files` | RenderedFile[] | yes | The assembled output files the guest emitted, in emission order. Each names its on-disk path and carries the serialized bytes the host writes verbatim. |
| `diagnostics` | Diagnostic[] | no | Diagnostics the guest raised while assembling. Each element is the shared Wasm-plugin diagnostic shape. |
| `error` | string | no | A failure message set when the guest ran but could not complete the operation; absent on success. It is distinct from any diagnostics the output carries: diagnostics report issues found during a run that still produced a result, while error reports that the operation itself did not complete. The host surfaces a present error as a failed plugin invocation. |
| `condition_code` | string | no | The descriptive, machine-matchable identity of the condition the failure names — the code the condition is registered under, in the same open set the compiler registers its own halting conditions in, and not a member of the closed host-function error-code catalog a reply envelope's hostfunc_error_code draws from. Set beside the human error message; absent on success, and absent when the guest names no such condition. A guest that halts reports here the identifier of the condition its message names, so a consumer branches on it instead of recovering an identity by reading the message. The host resolves this identifier against the conditions the compiler declares and publishes the resolved condition's own identifiers on the structured diagnostic, so a code that reaches a reader always resolves; an identifier naming no such condition, or one the numbering has retired, halts the build. A guest with no precise condition to name reaches instead for one of the generic plugin-failure conditions the compiler declares for the purpose, and puts the specifics in its own message. This identifier and condition_short_code are reported together, because they name one condition in two forms: a guest that sets one and not the other has named a condition the host cannot resolve, and the host then reports its own generic plugin-failure condition instead while the message still carries the whole failure. |
| `condition_short_code` | string | no | The compact identifier of the same condition — the letter E and four digits, the form a reader quotes, searches for and pastes into a report — set beside the human error message; absent on success, and absent when the guest names no such condition. The host prints it in the bracketed head of the diagnostic it renders for this failure, so a condition a guest raises is quotable exactly as one the compiler raises is. The host resolves the value against the conditions the compiler declares rather than carrying it on trust: a value naming no such condition, a value the numbering has retired, or a spelling the registration does not carry halts the build and quotes the offending value, with the guest's own message still reported. It is reported together with condition_code, for the reason stated there. |

_Additional properties are not permitted._

### `CarveInput`

The payload a Provider guest receives on its optional carve export: one named output file the pipeline carves into addressable units before a FeatureRecipe step edits some of them. A provider whose output shape the stock YAML codec cannot carve directly (a templated chart, for instance) advertises carve and reassemble so its own output-shape knowledge lives in the guest; a provider that omits the exports borrows the host's stock YAML codec.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | The output file's name, so the codec can apply any name-scoped carving rule. |
| `body` | string | yes | The output file's bytes to carve into addressable units. Each kit carries them in its own field type — raw where that type is a byte type, base64-encoded where it is a string the guest decodes to recover them — and the generated encoder converts between the field and the form the wire carries bytes in. |
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
| `body` | string | yes | The original file bytes the reassembly splices the patched units back into. Each kit carries them in its own field type — raw where that type is a byte type, base64-encoded where it is a string the guest decodes to recover them — and the generated encoder converts between the field and the form the wire carries bytes in. |
| `segs` | object[] | no | The units the file was carved into, as carve returned them. |
| `patched` | object[] | no | The units a pipeline step changed, each carrying its token, patched tree, and the ops that produced the change. |
| `yaml_indent` | integer | no | The indentation width the codec uses when an op must synthesize new structured text; carried so the reassembly matches the render-wide indentation. |

_Additional properties are not permitted._

### `ReassembleOutput`

The payload a Provider guest returns from its reassemble export: the file's bytes with the patched units spliced back in. Reassembly is byte-faithful — every byte the ops did not touch survives verbatim.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `body` | string | yes | The reassembled file bytes the host writes verbatim. Each kit carries them in its own field type — raw where that type is a byte type, base64-encoded where it is a string the guest decodes to recover them — and the generated encoder converts between the field and the form the wire carries bytes in. |

_Additional properties are not permitted._

### `NameBoundInput`

The payload a Provider guest receives on its optional name_bound export: one name the host proposes to use as a node's component identity, for the guest to judge against every name it would derive from that identity for its target, together with the facts of the node's resolved workload that some of those names depend on, where the identity is settled after that workload is resolved. The guest answers with a constraint rather than with a name of its own — a derived name travelling back would put the host in the business of composing names for a target it knows nothing about, which is exactly what asking the question removes. A provider whose target bounds or restricts the names it accepts advertises the export; a provider whose target accepts any name omits it and is never asked, and its rendering is unchanged.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `proposed` | string | yes | The name the host proposes as the node's component identity. The guest derives from it, in memory, every name it derives from a component identity and reports whether each one is a name its target accepts. A verdict speaks about the PROPOSAL rather than about the node: the host asks one question wherever it composes an identity, and it does not say which of that node's names this identity will end up being the basis for, so a guest answers as though it were the basis for all of them. That is the conservative direction, because the host only ever shortens on the answer and never lengthens — a name the node will in fact derive from some other carry is therefore judged too strictly rather than too loosely. |
| `authored` | boolean | no | Whether the proposed name is one a person wrote rather than one the compiler composed from authored parts. It is carried so a guest can phrase its reason for the reader who is able to act on it. It does not decide what a refusal does: an authored name is refused and a composed one is shortened, and that decision is the host's. |
| `workload_form` | string | no | The form of the workload the node's Recipe or FeatureRecipe resolves to, as its workload template produced it, carried when the identity is settled after that workload is resolved and the workload states a form. It is carried as written; the host does not interpret it. A guest whose target bounds a name it emits for one form only — a scheduled job, whose name the target holds shorter than its other names because a suffix is appended to it for each run — reads it to judge that name. Absent means the host carries no form for this question: the node declares no workload, its workload states none, or the identity is settled before any workload is resolved. A guest then judges no name that depends on the form, and answers exactly as it would if the field did not exist. |
| `service_keys` | string[] | no | The keys of the Services the node's resolved workload declares, in the order the workload declares them, carried when the identity is settled after that workload is resolved and the workload declares any. A guest whose target names each Service it emits for the node from the component identity and the Service's key reads them to judge each such name. A key is written by the Recipe's or FeatureRecipe's author rather than by whoever wrote the identity, so a guest words a refusal a key causes for that author too. Absent means the host carries no keys for this question: the node declares no workload, its workload declares no Service, or the identity is settled before any workload is resolved. A guest then judges no name built from a Service key, and answers exactly as it would if the field did not exist. |

_Additional properties are not permitted._

### `DerivedNameVerdict`

One name kind's verdict on a proposed identity: whether the name the guest would derive for that kind is one its target accepts, and — where a shorter identity would be accepted — the greatest length that would be. It carries a constraint and a reason, never a name the guest built.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `kind` | string | yes | The guest's own name for the kind of name this verdict covers, written in the target's vocabulary rather than the compiler's — a chart installer's release name, a container orchestrator's service name. It reaches a reader verbatim in a refusal, so it is written for somebody who knows the target. |
| `usable` | boolean | yes | Whether the name the guest would derive for this kind from the proposed identity is one the target accepts. |
| `bound` | integer | no | The greatest number of characters a proposed identity may carry for this kind's derived name to be one the target accepts. Present only on a refusal that a shorter identity would satisfy. ABSENT means length is not what the target objected to — either there is no length limit at all, or the objection is one no shortening repairs, such as a character the target's grammar refuses in the position it landed in. Absent is therefore distinct from a bound of zero, which does state a length: that no identity of any length yields an acceptable name of this kind. The host shortens to a present bound and asks again; on an absent bound it stops, because there is nothing left to try. |
| `reason` | string | no | Why the target does not accept the derived name, in the target's own terms, for a reader deciding what to write instead. Empty when the verdict is usable. |

_Additional properties are not permitted._

### `NameBoundOutput`

The payload a Provider guest returns from its name_bound export: one verdict per kind of name it would derive from the proposed identity. A proposal is usable when every verdict is; where one is not, the host shortens the proposal to the smallest bound the refusing verdicts carry and asks again, and it stops when a refusing verdict carries no bound. An empty list of verdicts means the guest derives no name from a component identity, which is the same answer as accepting the proposal.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `names` | DerivedNameVerdict[] | no | One entry per kind of name the guest derives from a component identity, in the guest's own order. A guest reports every kind it would derive rather than only the kinds that refused, so a reader sees which names were judged and a host reading the entries needs no second call to learn the rest. |
| `error` | string | no | A failure message set when the guest ran but could not complete the operation; absent on success. It is distinct from a refusing verdict: a verdict reports a name the target will not accept, while error reports that the question itself could not be answered. The host surfaces a present error as a failed plugin invocation. |
| `condition_code` | string | no | The descriptive, machine-matchable identity of the condition the failure names — the code the condition is registered under, in the same open set the compiler registers its own halting conditions in, and not a member of the closed host-function error-code catalog a reply envelope's hostfunc_error_code draws from. Set beside the human error message; absent on success, and absent when the guest names no such condition. A guest that halts reports here the identifier of the condition its message names, so a consumer branches on it instead of recovering an identity by reading the message. The host resolves this identifier against the conditions the compiler declares and publishes the resolved condition's own identifiers on the structured diagnostic, so a code that reaches a reader always resolves; an identifier naming no such condition, or one the numbering has retired, halts the build. A guest with no precise condition to name reaches instead for one of the generic plugin-failure conditions the compiler declares for the purpose, and puts the specifics in its own message. This identifier and condition_short_code are reported together, because they name one condition in two forms: a guest that sets one and not the other has named a condition the host cannot resolve, and the host then reports its own generic plugin-failure condition instead while the message still carries the whole failure. |
| `condition_short_code` | string | no | The compact identifier of the same condition — the letter E and four digits, the form a reader quotes, searches for and pastes into a report — set beside the human error message; absent on success, and absent when the guest names no such condition. The host prints it in the bracketed head of the diagnostic it renders for this failure, so a condition a guest raises is quotable exactly as one the compiler raises is. The host resolves the value against the conditions the compiler declares rather than carrying it on trust: a value naming no such condition, a value the numbering has retired, or a spelling the registration does not carry halts the build and quotes the offending value, with the guest's own message still reported. It is reported together with condition_code, for the reason stated there. |

_Additional properties are not permitted._

### `RenderedNameInput`

The payload a Provider guest receives on its optional rendered_name export: the two identities a target derives its own names from, and which input kinds the node's Recipe declares — source the author supplied, a workload the guest synthesizes. The guest answers with the name its target will give the resources it renders for that node: for supplied source, the name the author's own templates render against, such as the release name a chart reads; for a synthesized workload, the name the guest gives the resources it builds, where it derives one rather than writing the node's identity as it is. A guest that derives no such name reports none, which is the honest answer for a target whose resource names a Recipe writes verbatim, and for one whose name is a function of where the files are placed rather than of the node. This export reports a name the guest itself composes and is not the exchange that asks the guest to judge a name the host proposes; those are different questions and each has its own export.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `node_id` | string | yes | The node's own identity, as authored. It is carried unencoded: a target narrows it through its own alphabet, so encoding it first would put one escape inside another and spell the name differently from the one a recipe author predicts it by. |
| `derived_name_basis` | string | no | The identity a contributor's own source renders against when it is not the node's own — set for a contributor whose identity a target's name alphabet refuses, absent otherwise. A guest resolves the pair the same way every other surface does: this value when it is present, the node id when it is not. |
| `sourced` | boolean | no | Whether the node's bound Recipe declares source the author supplied, read from the text the author wrote. It is carried, with synthesized, so the question can be asked of any node and answered correctly: a guest reports no name for a node declaring neither, whose output is an artifact set alone, because the resources in such a set are named by the artifacts the author wrote rather than by any name the guest derives. |
| `synthesized` | boolean | no | Whether the node's bound Recipe declares a workload for the guest to synthesize, read from the text the author wrote, as sourced is. A guest whose target names the resources it synthesizes after a name it derives, rather than after the node's identity as written, reports that name for such a node, so an address a Recipe publishes for one of those resources can be built from the name the resource carries. |

_Additional properties are not permitted._

### `RenderedNameOutput`

The payload a Provider guest returns from its rendered_name export: the name its target gives the resources it renders for the node — from the node's author-supplied source, or from the workload it synthesizes — or no name at all. An absent or empty name is a positive answer rather than a failure — it says this target derives no such name — and the host uses what it was told without reading it, so no knowledge of the target's naming crosses the boundary.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | no | The name under which the guest renders this node's author-supplied source, or which it gives the resources it synthesizes for the node, already written in the alphabet its target accepts in that position. Empty or absent means the guest derives no such name. |
| `error` | string | no | A failure message set when the guest ran but could not complete the operation; absent on success. It is distinct from reporting no name: no name is an answer about the target, while error reports that the question itself could not be answered. The host surfaces a present error as a failed plugin invocation. |
| `condition_code` | string | no | The descriptive, machine-matchable identity of the condition the failure names — the code the condition is registered under, in the same open set the compiler registers its own halting conditions in. Set beside the human error message; absent on success, and absent when the guest names no such condition. The host resolves this identifier against the conditions the compiler declares and publishes the resolved condition's own identifiers on the structured diagnostic, so a code that reaches a reader always resolves; an identifier naming no such condition, or one the numbering has retired, halts the build. A guest with no precise condition to name reaches instead for one of the generic plugin-failure conditions the compiler declares for the purpose, and puts the specifics in its own message. This identifier and condition_short_code are reported together, because they name one condition in two forms: a guest that sets one and not the other has named a condition the host cannot resolve, and the host then reports its own generic plugin-failure condition instead while the message still carries the whole failure. |
| `condition_short_code` | string | no | The compact identifier of the same condition — the letter E and four digits, the form a reader quotes, searches for and pastes into a report — set beside the human error message; absent on success, and absent when the guest names no such condition. The host prints it in the bracketed head of the diagnostic it renders for this failure, so a condition a guest raises is quotable exactly as one the compiler raises is. The host resolves the value against the conditions the compiler declares rather than carrying it on trust: a value naming no such condition, a value the numbering has retired, or a spelling the registration does not carry halts the build and quotes the offending value, with the guest's own message still reported. It is reported together with condition_code, for the reason stated there. |

_Additional properties are not permitted._

### `LinkEndpoint`

One endpoint of a cross-boundary link: the node, the boundary path its rendered output assembles into, and the provider that rendered it. The two endpoints of a link name the consuming and consumed ends of a uses edge whose ends assemble into different dispatch groups.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `node` | string | yes | The endpoint node's absolute id within the topology graph. |
| `boundary` | string | yes | The endpoint's boundary path — the dispatch group its rendered output assembles into. |
| `provider` | string | yes | The provider that rendered the endpoint (the bare provider name). Both endpoints of a wired link name the same provider; the host does not route a link whose endpoints name different providers. |
| `release` | string | no | The Release the endpoint's rendered output belongs to — the scope its assembled artifacts are named within. The host assembles it from the Release the build resolved and passes it verbatim; it infers no meaning from the value. A provider reads it to scope a cross-reference name to the Release. An absent value is the empty string, which a provider treats as an unscoped name. |

_Additional properties are not permitted._

### `LinkEdge`

The generalized, domain-agnostic per-edge payload the host assembles for a uses edge whose consuming and consumed ends assemble into different dispatch groups. It carries both endpoints, both endpoints' placement annotations as opaque scalar maps the host does not interpret, the consumed endpoint's provides output, and the socket and inject mapping the edge wires. A provider reads it to produce the provider-native cross-reference wiring the two ends need; the host assembles it and passes the annotation map as opaque scalars, inferring no meaning from any value.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `source` | LinkEndpoint | yes | The consuming endpoint — the source end of the directed uses edge, whose assembled output the consumer-side wiring is injected into. |
| `target` | LinkEndpoint | yes | The consumed endpoint — the target end the uses edge points at, whose assembled output the producer-side wiring publishes. |
| `target_annotations` | map of string | no | The consumed (target) endpoint's placement annotations as an opaque scalar map, keyed by annotation name. The host assembles them from the target's resolved annotations and passes them verbatim; it infers no meaning from any value. A provider reads them to decide how to shape a cross-reference (for example whether the two ends share a placement or need a cross-placement reference). Keys serialize in sorted order so the payload is byte-identical across runs of identical input. |
| `source_annotations` | map of string | no | The consuming (source) endpoint's placement annotations as an opaque scalar map, keyed by annotation name. The host assembles them from the source's resolved annotations and passes them verbatim; it infers no meaning from any value. A provider reads them to compare the two ends' placement — for example whether the source and target share a placement or sit in different ones. Keys serialize in sorted order so the payload is byte-identical across runs of identical input. |
| `socket` | string | yes | The socket alias the uses edge is bound under. |
| `provides` | map of string | yes | The consumed endpoint's provides output, an author-ordered key set exposing the target's declared outputs. Preserves author order so the payload is byte-identical across runs of identical input. |
| `inject` | object | yes | The consuming endpoint's inject mapping, keyed by delivery mechanism to an author-ordered key set, describing how the consuming end receives the consumed endpoint's output. Preserves author order so the payload is byte-identical across runs of identical input. |
| `read_provides_keys` | string[] | no | The keys of the consumed endpoint's provides output that the consuming endpoint's templates read directly through .context.uses, whether or not the inject mapping also delivers them, in the author order of provides. Each entry is one of the keys provides carries. The list rides on the edge so the producer-side publish and the consumer-side resolve read one list. Absent when the consuming endpoint read no provides key directly, and a provider handed none wires the link exactly as it would if the field did not exist. |

_Additional properties are not permitted._

### `LinkPatch`

One per-file structural patch a provider returns as artifact wiring: the output file and the ordered structural operations to apply to it. A later host pass carves the named file, applies the operations, and reassembles it byte-faithfully. The operation shape is the shared pipeline patch-operation vocabulary; it is opaque at this schema layer, so a guest carries each operation verbatim while the host realizes the typed operation its pipeline applies.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `file` | string | yes | The output file the operations apply to, named as the provider emitted it. |
| `ops` | any[] | yes | The ordered structural operations to apply to the file, in application order. |

_Additional properties are not permitted._

### `LinkPublishInput`

The payload a provider receives on its link_publish export: one cross-boundary link whose consumed endpoint's output is referenced across a boundary, and that endpoint's assembled files. The export returns the published identity the consumer resolves against and any producer-side artifact wiring the consumed endpoint's output needs.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `edge` | LinkEdge | yes | The cross-boundary link being published, read from the consumed (target) endpoint's side. |
| `producer_files` | RenderedFile[] | no | The consumed endpoint's assembled files, so the provider can read what that endpoint already declares and check the names it is about to publish against them. Each names its on-disk path and carries the assembled bytes. Absent when the host has no assembled producer output to hand the publish; a provider that needs no document to author its wiring ignores it. |

_Additional properties are not permitted._

### `LinkPublishOutput`

The payload a provider returns from its link_publish export: the published identity handle the consumer resolves against, and the producer-side artifact wiring to apply to the consumed endpoint's assembled output.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `handle` | map of string | yes | The published identity the consumed endpoint exposes for the consumer to resolve against, an opaque deterministic-pointer string map keyed by field name (for example an export name, a stack name, a region, a role reference). The values are deterministic pointer strings the compiler pipes and never resolves; the runtime environment resolves them at deploy time. Keys serialize in sorted order so the payload is byte-identical across runs of identical input. |
| `patches` | LinkPatch[] | no | The producer-side artifact wiring, one structural patch per consumed-endpoint output file the publish must edit. Empty when the consumed endpoint's output needs no change for the link. |
| `error` | string | no | A failure message set when the guest ran but could not publish the link; absent on success. The host surfaces a present error as a failed plugin invocation. A publish that cannot proceed — an export name the stack already declares under another entry, say — is reported here rather than only as a crash, so the condition behind it can be named. |
| `condition_code` | string | no | The descriptive, machine-matchable identity of the condition the failure names — the code the condition is registered under, in the same open set the compiler registers its own halting conditions in, and not a member of the closed host-function error-code catalog a reply envelope's hostfunc_error_code draws from. Set beside the human error message; absent on success, and absent when the guest names no such condition. A guest that halts reports here the identifier of the condition its message names, so a consumer branches on it instead of recovering an identity by reading the message. The host resolves this identifier against the conditions the compiler declares and publishes the resolved condition's own identifiers on the structured diagnostic, so a code that reaches a reader always resolves; an identifier naming no such condition, or one the numbering has retired, halts the build. A guest with no precise condition to name reaches instead for one of the generic plugin-failure conditions the compiler declares for the purpose, and puts the specifics in its own message. This identifier and condition_short_code are reported together, because they name one condition in two forms: a guest that sets one and not the other has named a condition the host cannot resolve, and the host then reports its own generic plugin-failure condition instead while the message still carries the whole failure. |
| `condition_short_code` | string | no | The compact identifier of the same condition — the letter E and four digits, the form a reader quotes, searches for and pastes into a report — set beside the human error message; absent on success, and absent when the guest names no such condition. The host prints it in the bracketed head of the diagnostic it renders for this failure, so a condition a guest raises is quotable exactly as one the compiler raises is. The host resolves the value against the conditions the compiler declares rather than carrying it on trust: a value naming no such condition, a value the numbering has retired, or a spelling the registration does not carry halts the build and quotes the offending value, with the guest's own message still reported. It is reported together with condition_code, for the reason stated there. |

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
| `error` | string | no | A failure message set when the guest ran but could not resolve the link; absent on success. The host surfaces a present error as a failed plugin invocation. A resolve that cannot proceed — a reference the target can only carry as a whole scalar, met inside a larger string — is reported here rather than only as a crash, so the condition behind it can be named. |
| `condition_code` | string | no | The descriptive, machine-matchable identity of the condition the failure names — the code the condition is registered under, in the same open set the compiler registers its own halting conditions in, and not a member of the closed host-function error-code catalog a reply envelope's hostfunc_error_code draws from. Set beside the human error message; absent on success, and absent when the guest names no such condition. A guest that halts reports here the identifier of the condition its message names, so a consumer branches on it instead of recovering an identity by reading the message. The host resolves this identifier against the conditions the compiler declares and publishes the resolved condition's own identifiers on the structured diagnostic, so a code that reaches a reader always resolves; an identifier naming no such condition, or one the numbering has retired, halts the build. A guest with no precise condition to name reaches instead for one of the generic plugin-failure conditions the compiler declares for the purpose, and puts the specifics in its own message. This identifier and condition_short_code are reported together, because they name one condition in two forms: a guest that sets one and not the other has named a condition the host cannot resolve, and the host then reports its own generic plugin-failure condition instead while the message still carries the whole failure. |
| `condition_short_code` | string | no | The compact identifier of the same condition — the letter E and four digits, the form a reader quotes, searches for and pastes into a report — set beside the human error message; absent on success, and absent when the guest names no such condition. The host prints it in the bracketed head of the diagnostic it renders for this failure, so a condition a guest raises is quotable exactly as one the compiler raises is. The host resolves the value against the conditions the compiler declares rather than carrying it on trust: a value naming no such condition, a value the numbering has retired, or a spelling the registration does not carry halts the build and quotes the offending value, with the guest's own message still reported. It is reported together with condition_code, for the reason stated there. |

_Additional properties are not permitted._
