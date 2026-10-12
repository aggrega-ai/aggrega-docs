# Wasm plugin contract

Aggrega's compilation pipeline includes designated socket points where WebAssembly (Wasm) plugins extend the compiler's behaviour: a Mutation Gate at topology construction, a Validation Gate at static analysis, a post-render plugin pipeline for FeatureRecipe execution, an out-of-band linting socket, and a provider-rendering socket. This page documents the public Wasm plugin contract: which sockets exist, what each socket consumes and produces, where each socket sits in the compilation pipeline, and the sandbox every plugin executes inside.

This page covers the *sockets* — the pipeline points and their input/output shapes. For the *plugin* — the `Plugin` entity, the per-export capability claims, the runtime limits, and the publish→pull→build lifecycle — see the [Wasm plugin developer guide](plugin-developer-guide.md).

Aggrega embeds a Wasm host runtime — Extism on top of the Wazero engine — that loads and executes plugins behind an AOT-purity firewall: the host grants a guest zero ambient capability — no network, no filesystem, no environment, discarded stdio, an observable wall clock frozen to a build-invariant instant — so a plugin cannot break the compiler's ahead-of-time guarantees. The full capability surface — the import-module rule at load, the instantiation-time denials, and the curated host functions — is [the sandbox contract](#the-sandbox-contract) below. Plugin authors target the host through the three-language PDK (Go, Rust, TypeScript). The first socket dispatched through the host in a shipping command is the **linter socket** — the standard publishing-linter, executed by [`aggrega lint`](../cli/aggrega-lint.md). `aggrega build` dispatches the governance socket's build-time roles when a workspace configures them: the annotation-transform role during resolution and the label-transform role at topology construction (both shape output), plus the IR verdict at static analysis and the render verdict over the rendered artifacts. Each is a no-op when no plugin is attached at that role, so a build with no governance configuration is unchanged. `aggrega build` also dispatches the FeatureRecipe and Recipe `pipeline:` in the plugin pipeline that closes rendering — each declared step runs through the host against the rendered document set, applying the step's RFC 6902 patches and emitting its side effects. See [Status of the Language → Compilation pipeline phases](../10-status.md#compilation-pipeline-phases).

## The sandbox contract

Every socket dispatches its plugin through the same host sandbox. The sandbox has two independent layers — a structural check at load and capability denial at instantiation — and together they define what a plugin can reach, what it cannot, and what it is responsible for.

**The import-module rule (load time).** The loader walks the plugin binary's import section and admits function imports only under three module namespaces: `wasi_snapshot_preview1` (the WASI preview-1 runtime a guest language runtime links against), `extism:host/env` (the Extism runtime ABI — the PDK's own memory and IO intrinsics), and `extism:host/user` (Aggrega's curated host functions). A guest may import **any function name** under an allowed module; an import under any other module names a surface the host does not provide, and the plugin is rejected at load with a diagnostic naming the module and the import. The rule deliberately does not censor individual WASI function names: a statically-linked language runtime imports filesystem and socket functions its live code paths never call — pulled in transitively by dependencies — and naming an import grants nothing. Capability denial at instantiation, not import censorship, is what guarantees no I/O.

**Zero ambient capability (instantiation).** The host instantiates the guest with real WASI behaviour and zero ambient authority:

- no filesystem — no preopened directories, so a filesystem call fails at the call boundary;
- no network sockets;
- an empty environment;
- discarded stdio — nothing the guest writes to stdout or stderr reaches the host's streams;
- a frozen observable wall clock, pinned to a build-invariant instant, so a guest reading the time cannot leak build time into its output;
- a real, advancing monotonic clock — a guest language runtime needs one to bootstrap, and monotonic time measures elapsed duration, not a wall-clock instant;
- real host entropy — pinned entropy would stabilise a language runtime's internal hash seed and mask guest nondeterminism instead of letting it surface as differing output;
- a single synthetic program name as argv.

An I/O call a guest actually makes — opening a file, dialing a socket — fails at the call boundary. This is WASI's own capability-based security model: the sandbox denies the capability rather than policing the code.

**Inputs arrive only through the payload and the curated host functions.** A plugin receives everything it renders or evaluates in the payload its socket carries — graph and node projections, values, and render context. Which encoding a payload arrives in is fixed per socket and named in that socket's own section below; each published payload type ships an encode and a decode entry point for its socket's encoding, so a guest calls one function rather than choosing a parser. For a sourced provider render, the payload carries a **source listing** rather than the source bytes: a sorted set of `{path, is_dir}` entries under the node's source root, with no provider-layout interpretation by the host. The guest applies its own layout logic — select the single compose file, descend to a chart root, require a `Chart.yaml`, vendor a module recursively — and reads back exactly the slice it selects through a host callback. Beyond the payload, the host binds a curated, least-privilege set of host functions, and grants a plugin exactly the ones its binary imports:

- `aggrega_log` — a log line on the host's log destination.
- `aggrega_emit_warning` — a structured warning the host surfaces after the call.
- `aggrega_fetch_external_input` — the external-input fetch channel (below).
- `aggrega_pack_source` — the source-selection callback: the guest names a `{file | dir | tree, path}` selection under the source root and the host reads and packs exactly that under a sandbox that resolves paths under the root and rejects `..`.
- `aggrega_read_source_file` — a single-file content read under the same sandbox, for content-dependent source selection.
- `aggrega_parse_source` — the producer-consumption callback: the guest names a syntactic format and hands over the source bytes, and the host resolves a parser for that format, runs it, and returns the canonical tree it produced. It is how a consumer obtains a producer's output through the host instead of invoking a producer guest itself, and the host bounds it to a single level — a producer reached this way that calls it again is denied — so a consumer calls it once per source and may consume many sources in sequence.

The host derives the set a plugin imports from its `.wasm` binary, validates it against the curated allowlist, cross-checks it against the host functions the guest's `describe()` declares, and stamps it on the published entity's `spec.runtime.hostFunctions`, so every plugin's host surface is visible in the catalog and cannot drift from the binary.

**Callback failures carry a machine-matchable code, under `hostfunc_error_code`.** The reply-returning host callbacks — `aggrega_fetch_external_input`, `aggrega_pack_source`, `aggrega_read_source_file`, and the `aggrega_parse_source` producer-consumption callback — deliver failure in-band: the reply envelope carries a human-readable message and, beside it, an optional machine-matchable code under `hostfunc_error_code`, drawn from a closed vocabulary. The message is free-form prose for a person; the code is the stable identity a guest branches on without parsing the message. On success the code is absent; on failure the host sets both. The PDK surfaces the pair as a typed error whose text is the message and whose code field a guest matches against the language's re-exported code constants. A guest tolerates an absent code (an older host that predates the field) and an unrecognized code (a newer host emitting a code the guest predates) by falling back to the message — so matching on a code is a best-effort refinement layered over the always-present message, never a replacement for it. The closed value set is the [host-function error-code schema](../schema/plugins/wasm-hostfunc-error.md).

🔴 **Two different vocabularies name a failure on this boundary, and the key you read says which one you are holding.** Confusing them is the one mistake worth calling out here, because a value from either is a plain string and neither the host nor the guest checks which set it came from.

- **`hostfunc_error_code`, on a reply the host sends a guest.** Its value is a member of the closed catalogue linked above — a fixed, slowly-changing list naming the ways a host callback can fail. Because the set is closed, a guest can match a value against a named constant its kit re-exports and branch on the result.
- **`condition_code` beside `condition_short_code`, on a socket output a guest returns to the host.** These are the two identifiers of a halting condition the guest itself raised, and they come from the open, growing set of conditions the compiler registers rather than from the catalogue. `condition_code` is the descriptive code the condition is registered under; `condition_short_code` is the compact form — the letter `E` and four digits — that a reader quotes, searches for and pastes into a report. The host prints the short code in the bracketed head of the diagnostic it renders, so a condition a guest raises is quotable exactly as one the compiler raises is. It derives neither value, but it does check them: a short code resolving to no condition this compiler declares, or to one whose number has been retired, halts the build instead of reaching a reader as an identifier that resolves to nothing.

The two identifiers on the guest side are reported **together**: a guest that sets one and not the other has named a condition the host cannot resolve, and the host then reports its own generic plugin-failure condition instead, with the message still carrying the whole failure. And a `condition_code` is never a member of the host-function catalogue, so comparing one against a re-exported constant never matches — which is why each key names its own vocabulary rather than failure in general.

**Each callback's slots carry a stated encoding, and the three callbacks that take a payload document take it as binary.** Every argument a host callback takes is a pointer into guest memory, apart from `aggrega_log`'s numeric level; a reply-returning callback answers with a pointer too. What each of those slots holds is fixed per callback:

| Callback | Argument slots | Reply slot |
| --- | --- | --- |
| `aggrega_log`, `aggrega_emit_warning` | UTF-8 text — no payload document | no reply |
| `aggrega_fetch_external_input` | a bare UTF-8 URL — no payload document | JSON |
| `aggrega_pack_source`, `aggrega_read_source_file`, `aggrega_parse_source` | **canonical CBOR** ([RFC 8949](https://datatracker.ietf.org/doc/html/rfc8949) §4.2.1) | **canonical CBOR** |

The table splits on what the **argument** is rather than on the callback's identity: a callback whose argument is a payload document carries canonical CBOR in both directions, and a callback whose argument is a bare string — a log line, a diagnostic field, a URL — carries UTF-8 text. `aggrega_fetch_external_input` is the one that is neither: its argument is a bare URL, and its reply is a JSON envelope.

**What a guest does at a payload-carrying callback, and what it must not do.** 🔴 The request slot holds an **opaque byte run, not UTF-8 text** — so this is the shape a guest declares, not only the bytes it puts there. A guest that allocates the request as a string, or reads the reply as a string, does not interoperate: a text conversion in either direction corrupts binary bytes. The failure is loud rather than partial — a request the host cannot decode comes back as a reply envelope carrying the `request_undecodable` code, in the same in-band shape as any other callback failure, so the guest reports it instead of proceeding on a half-read payload. The payload types are `SourcePackRequest` and `SourcePackResponse` for `aggrega_pack_source`, `SourceFileRequest` and `SourceFileResponse` for `aggrega_read_source_file`, and `ParseInput` and `ParseSourceResponse` for `aggrega_parse_source`. Concretely, per kit:

- **Go** — build the request with the request type's `EncodeCBOR()`, allocate it with `pdk.AllocateBytes` (not `pdk.AllocateString`), and read the reply with `ReadBytes()` on the memory the reply pointer resolves to, into the reply type's `DecodeCBOR`. The `//go:wasmimport` declaration is a pointer either way, so nothing in the signature shows the shape — the allocation and the read are where it lives.
- **Rust** — the `#[host_fn]` declaration states the shape directly: each of the three reads `fn <callback>(request: Vec<u8>) -> Vec<u8>;`. Build the request with the request type's `encode_cbor()` and read the reply with the reply type's `decode_cbor(&raw)`.
- **TypeScript** — build the request with the request type's `encodeCBOR…` function, allocate it with `Memory.fromBuffer` (not `Memory.fromString`), and read the reply with `readBytes()` into the reply type's `decodeCBOR…` function. As in Go, the `declare module` entry is a pointer either way.

**A guest that calls a PDK wrapper needs none of that, and the distinction decides what an existing plugin has to do.** The wrappers — `PackSource`, `ReadSourceFile` and `ParseSource`, in each language's own spelling — do the allocation and the encoding, and none of their signatures names a wire type. So a plugin that reaches these callbacks through its kit is **rebuilt** against the current kit and its own source is unchanged; a plugin that declares and calls the host functions itself has to move its declarations and its memory handling as described above. Either way the move is not optional: a guest left on the text slot is refused rather than half-served, so the two sides cannot drift apart silently.

Two properties worth relying on. **The reply carries the same encoding whether it succeeds or fails**: a guest reads one slot and cannot know before decoding which of the two it holds, so one decode entry point reads both, and the error code and message described above arrive through it. And **a guest fills a byte-valued field exactly as it does for a payload in the textual encoding** — a byte slice in Go, a base64 string in Rust and TypeScript, matching each kit's own field type — because the conversion to the raw byte run the binary encoding carries is the generated encoder's job, done on the way out and reversed on the way in. That covers `ParseInput`'s source bytes, the file content `aggrega_read_source_file` returns, and each packed file's content in a pack-source reply: those bytes cross the boundary once rather than twice-encoded, and no guest base64s anything the encoder is about to un-base64. The tree `aggrega_parse_source` returns travels as a byte run holding its own JSON document verbatim; the host neither reads nor reshapes it.

Canonical means identical input produces identical bytes on every side, which is what lets a payload be compared across the three plugin kits rather than only round-tripped, and it is why a build's output stays byte-identical. No CBOR library is needed in a guest and nothing hand-parses bytes: each published payload type ships the encode and decode entry points its slot's encoding needs.

**Determinism is the plugin author's responsibility.** The host consumes a guest's output bytes verbatim and runs no serializer over them, so the contract every plugin must uphold is: identical input produces identical output bytes. The sandbox removes the ambient sources of nondeterminism — wall time, environment, filesystem state — but deliberately does not mask the rest: a guest that encodes entropy or elapsed monotonic time into its output produces visibly differing bytes across runs rather than a stably-hidden defect.

**The external-input fetch channel.** `aggrega_fetch_external_input` is the one sanctioned channel for remote content, and it is host-mediated, not guest network access: the guest names a URL, and the host serves bytes under the external-input pin discipline. A URL pinned in the Release's lockfile is served from the local content-addressed store and verified against its recorded digest; an unpinned URL is refused with a diagnostic naming the URL and the step that pins it, because a render consumes the closure its lockfile records and never widens it. The pins are written when the Release's dependencies are resolved, which is the one moment anything is pinned. The [developer guide](plugin-developer-guide.md) carries the authoring how-to and the pin discipline in full.

## Values an input marks sensitive

**A plugin never quotes, in a refusal or a warning it returns, a value its input marks sensitive — by its key, or as part of a payload marked as a whole.** A refusal is the `error` an output carries; a warning is a `Diagnostic` the output carries, whatever its severity, or one raised through `aggrega_emit_warning`. The host carries that text unchanged wherever it reports it — the command line, the language server and the editor's problem list, the assistant tools — and reads no value out of it, so the plugin is the only party able to keep the value out. Name the key, the setting or the position instead: a reader finds the value from there.

The rule covers text a library writes for the plugin as much as text the plugin writes itself. A template engine reports the data it was evaluating, a schema validator quotes a value that fails a `pattern`, a parser quotes the token it could not read. Where such a failure ran over a value the input marks, report it without the value — for instance, run the same step again with every marked value replaced by a placeholder, report that run's failure when it fails at the same place, and otherwise say that the failure text is withheld. Under a payload marked as a whole, every value in that payload is a marked value, while its keys — the shape of the document — stay readable.

Where an input marks a key or a payload sensitive, spelled as the wire names it:

| Socket and export | Where the marking is read |
| --- | --- |
| provider `render_node` and `validate_node_input` (`RenderNodeInput`) | `node.sensitive_rendered_keys`: each key names an entry of `node.values` when those values are the Component's own, keyed by the leaves it declares — a Recipe's `valuesMapping` writes keys no declaration names, so none of them is marked here — or an entry of a workload container's `attachments` map that reads a slot declared sensitive. `node.sensitive_values` marks `node.values` as a whole: it is `true` when a `valuesMapping` — the Recipe's, or an attachment's FeatureRecipe's — produced those values and reads a value an author declared sensitive. `workload_projection.sensitive_workload` marks every value of the workload the same way when the workload's template reads one, and each entry of `artifacts_projection.entries` carries `sensitive_content` for its own content, a parser's message about that content included. Each entry of `omits` carries `sensitive` when the template producing any of its kind, name or namespace reads one, and then every field of that entry is a marked value. Each entry of `node.features` carries its own attachment's marking: `sensitive_payload_leaves` (the `values.<path>` and `infra.<path>` leaves its Feature declares sensitive), `sensitive_inject` (the inject delivery keys that read a provides key its Feature declares sensitive) and `sensitive` (whether the attachment handles declared-sensitive material at all). |
| governance `ir-verdict` (`PolicyInput`) | `graph`: each node's `sensitive_payload_leaves`, and each attachment's `sensitive_payload_leaves`, `sensitive_inject` and `sensitive`. Every value those markings name already arrives as the withheld marker `{"aggrega_withheld": "declared"}`, so the value itself never reaches the plugin. |

No other socket input, and no other provider export's input, carries a marking. A key marking names only what it joins exactly to a declaration, so an absent key never means a value is safe to quote: it means no declaration could be joined to that key. A payload marking is read from the references of the template that produced the payload — a reference reaching a declared value, the template handing on the whole of its data, or a template that does not parse — and never from a value, so its absence means that template read no declared value as far as its references show, or that no template produced the payload; it is not a statement that the payload carries nothing sensitive.

## Pipeline placement of Wasm sockets

The compilation pipeline reserves the following socket points. The shape labels follow the four-label taxonomy from the Status page.

| Socket | Pipeline placement | Status today |
| --- | --- | --- |
| Governance socket, `annotation-transform` role | Resolution (before annotation expansion) | **available** — dispatched when a workspace attaches an annotation-transform plugin; injects annotations that expansion turns into Feature attachments |
| Governance socket, `label-transform` role | Topology construction (the Topology Builder) | **available** — dispatched when a workspace attaches a label-transform plugin; auto-tags node labels via JSON Patch |
| Governance socket, `ir-verdict` role | Static analysis (the Static Analyzer, over the IR graph) | **available** — dispatched when a workspace attaches an ir-verdict plugin; a `halt` verdict stops the build |
| Governance socket, `render-verdict` role | Rendering (over the rendered artifacts) | **available** — dispatched when a workspace attaches a render-verdict plugin; a `halt` verdict stops the build |
| FeatureRecipe `pipeline:` plugins | The plugin pipeline (post-render mutation) | **available** — each declared step runs against the rendered document set, applying RFC 6902 patches and emitting side effects |
| Provider rendering plugins (helm, helm-chart, compose, terraform) | Base rendering (the providers) | **available** — every provider renders through its Wasm guest; rendering is Wasm-only, with no in-host renderer fallback |
| `linter.wasm` (publishing-linter) | Out-of-band (`aggrega lint`) | **available** — the publishing-linter ships and runs through the host via `aggrega lint` |

The annotation-driven Feature expansion sub-phase, part of resolution, is a native Go pipeline pass, not a Wasm socket. It validates annotation values against the target Feature's `spec.schema` and injects synthetic Feature attachments at IR build time. See [`vocabulary/labels-and-annotations.md`](../vocabulary/labels-and-annotations.md) for the six annotation- and label-bearing surfaces and [`providers/well-known-annotations.md`](../providers/well-known-annotations.md) for the binding-shape and authoring teaching.

## Output shape contract — what exists today

The governance socket carries a typed contract surface at each of its four roles, and the role fixes which one. Plugin authors implement guest-side code that produces the documented shapes; the host reads them at build time, once per configured plugin, when a workspace attaches a plugin at that role. The subsections below follow the order the pipeline dispatches them in.

### The `annotation-transform` role — annotation-injection output

**Pipeline placement.** Resolution, after the components resolve and before annotation-driven Feature expansion runs.

**Input shape (host → guest).** An `AnnotationTransformInput` document carrying:

- `targets` — the injection targets: the resolved components the guest may annotate, each carrying its `boundary_path`, its `component_name`, and the `annotations` it already holds, so a guest can decide what to add without displacing an authored value. Ordered deterministically by the host.
- `binding_keys` — the annotation keys the Manifest registers a binding for, in author order. An injection under a registered key goes on to expand into a Feature attachment, so a guest reads this list to inject keys that will take effect. The host does not require an injection to name a registered key: an unregistered injected annotation behaves exactly as an authored unbound annotation does.
- `sources` — the definition files the attachment declared under `with.sources`, each carrying its base-name path and content, sorted by path.
- `settings` — the free-form settings object the attachment declared under `with.settings`, handed to the guest verbatim.

`settings` and `sources` are the same engine-agnostic `with` channel every other role reads, and both are absent when the attachment declares none. Because this role's output shapes the build, the attachment's settings and source content are pinned in the release lockfile at pull and reconstructed from it at build.

**Output shape (guest → host).** An `AnnotationTransformOutput` document carrying:

- `injections` — the annotations to add, in order. Each names an existing target coordinate (`boundary_path` and `component_name`) plus the `annotation_key` and its string `annotation_value`.

The host applies annotation *additions* only, to coordinates it supplied, with string values. An injection naming a coordinate the payload does not carry halts the build with a message naming the coordinate and the annotation, rather than being silently dropped. That confinement is what bounds the role: an operator attaching a plugin here has declared annotation injection and nothing further.

**Type definitions.** The annotation-transform wire types — `AnnotationTransformInput`, `AnnotationTransformOutput`, `AnnotationTarget`, `AnnotationInjection`, `AnnotationSource` — are published in all three ABI packages, generated from one codec so the three stay in lockstep.

### The `label-transform` role — JSONPatch output

**Pipeline placement.** Topology construction, after IR graph construction but before the analyzer runs.

**Input shape (host → guest).** A `MutatorInput` document carrying:

- `compilation_context` — release identity (`release_name`, `environment`).
- `graph` — a `MutatorGraph` projection of topology nodes with their compiler-assigned labels.
- `settings` — the free-form settings object the attachment declared under `with.settings`, handed to the guest verbatim.
- `sources` — the definition files the attachment declared under `with.sources`, each carrying its base-name path and content, so a mutator can be driven by a checked-in rules or mapping file rather than inline settings.

The graph is a labels-only projection (nodes carry their resolved label sets; the full IR graph stays inside the compiler). `settings` and `sources` are the same engine-agnostic `with` channel the verdict roles read; the host passes them through and never interprets their content. Because a mutator's output shapes the build, the attachment's settings and source content are pinned in the release lockfile at pull and reconstructed from it at build, so the mutator input is invariant to a post-pull change to either until the next pull.

**Output shape (guest → host).** A `MutatorOutput` document carrying:

- `patches` — an array of opaque JSONPatch documents (RFC 6902) that the host applies to the labels-only projection.

Each patch addresses a specific node's labels via [JSON Pointer (RFC 6901)](https://datatracker.ietf.org/doc/html/rfc6901); the host applies the patches in array order and re-ingests the mutated label set into the IR graph. The label-transform role's job is enterprise auto-tagging — adding compliance / observability / cost-attribution labels declared by enterprise policy without modifying catalog content. The label surface is this role's only sanctioned target: a patch that touches a node field other than its labels, adds or removes a node, or sets a non-string label value halts the build rather than being silently absorbed. RFC 6901 is the path-grammar baseline for every document-path surface in Aggrega — the Wasm plugin contract here, plus `.locals` `*_path` exports, plus the `*Path` schema fields elsewhere in the corpus. See [`02-naming-conventions.md`](../02-naming-conventions.md) "Document-path naming-suffix discipline" for the canonical baseline declaration and the `*Path` / `*_path` suffix discipline that distinguishes the two authoring sides.

**Wire encoding.** This role's payload and result travel as **canonical CBOR** ([RFC 8949](https://datatracker.ietf.org/doc/html/rfc8949) §4.2.1), in both directions. Canonical means identical input produces identical bytes on every side, which is what lets a payload be compared across the three plugin kits rather than only round-tripped, and it is why a build's output stays byte-identical. A guest reads and writes it through the entry points its kit's payload type already carries — `DecodeCBOR` and `EncodeCBOR` in Go, `decode_cbor` and `encode_cbor` in Rust, `decodeCBORMutatorInput` and `encodeCBORMutatorOutput` in TypeScript — so no CBOR library is needed and nothing hand-parses bytes. In Rust the export takes and returns `Vec<u8>`; in TypeScript it reads `Host.inputBytes()` and writes `Host.outputBytes(...)`.

Two things this does *not* change. The `patches` array stays JSON: the socket carries each patch document verbatim as opaque content and neither side reads into it, so a patch document's own shape is independent of the encoding its socket carries. And `settings` and `sources` are still handed through verbatim — `settings` arrives as the bytes the attachment authored, which a guest parses as JSON if it needs to look inside.

The other three governance roles carry JSON. A guest serving more than one role reads each payload independently, so it may speak a different encoding at each of its exports; that is expected rather than a sign of a half-finished guest.

**Type definitions.** The mutator wire types — `MutatorInput`, `MutatorOutput`, `CompilationContext`, `MutatorGraph`, `MutatorNode` — are published in all three ABI packages (`github.com/aggrega-ai/aggrega-abi-go`, the `aggrega-abi` crate, and `@aggrega-ai/aggrega-abi`), generated from one codec so the three stay in lockstep. The host assembles the input and applies the patches the guest returns.

### The verdict roles — verdict array output

A policy guest inspects a build and returns a list of verdicts; the host acts on
each verdict's severity and never interprets the policy itself. The full
treatment — the four roles, severities, the operator-supplied input channel, writing
a policy for either of the two engines that ship inside the compiler, wrapping a
foreign policy engine, the reference guests, and how an operator attaches a
policy — is on the [governance socket page](policy-socket.md). This section records
the pipeline placement and the typed wire shapes.

**Pipeline placement.** A policy is attached at exactly one verdict role, which fixes where it evaluates:

- `ir-verdict` — evaluated at static analysis, before base rendering. The analyzer assembles the payload on every build.
- `render-verdict` — evaluated after render, over the emitted artifacts.

When a workspace attaches a verdict-role plugin, the pipeline marshals that role's payload to the plugin and reads its verdicts back.

**Input shape (host → guest).** The role selects the payload:

- The `ir-verdict` `PolicyInput` carries `graph` — the full capability-agnostic IR graph (the same shape the Topology Builder emits), with every node, edge, and attachment detail the compiler holds — and `precalculated_paths`, the routing paths the analyzer enumerates alongside, so a policy can reason about reachability without re-walking the graph. The graph is the versioned IR graph, single-sourced from the `ir-v1alpha1` schema; the IR shape is not secret (it is the same graph `aggrega inspect` emits) and secrets in it are pointers, never plaintext.
- The `render-verdict` `RenderPolicyInput` carries `artifacts` — the rendered output files sorted by path, so the wire is byte-identical across runs of identical input. Each entry carries the artifact's output `path` and its rendered `content`; it also carries the `format` it was rendered in, when the producing provider declared one, and a `tree`, the parsed canonical view of a format the guest does not read natively, which the host parses through the resolved parser and pipes through opaquely. Both are absent when they do not apply — a format the guest reads natively (JSON, YAML) is left unparsed for the guest to read from `content`.

Both roles additionally carry the attachment's `sources` (policy-definition files the host reads at build time and hands the guest verbatim, paths as base names, content opaque) and `settings` (a free-form object handed through untouched). Both are absent when the attachment declares none.

**Output shape (guest → host).** A `PolicyOutput` document carrying:

- `results` — an array of `Diagnostic` entries, each with a `severity` (`halt`, `warn`, or `info`) and a `message` string. A verdict may also set `code`, `rule_id`, `classification`, `source_ref`, `location`, and `suggest` on the same entry; the host appends whichever of those the verdict carried to the rendered verdict, on every severity route.

Only fired verdicts appear; an allowing evaluation returns an empty array. The host walks the verdicts and maps each severity to an action: `halt` stops the build (surfacing every `halt` message), `warn` flags the verdict and lets the build proceed, `info` records it without affecting the outcome. A `halt` stops through the same gate a selector or `appliesTo` violation uses.

**Type definitions.** The policy wire types are published in the same three ABI packages: `PolicyInput` (ir-verdict role), `RenderPolicyInput` (render-verdict role), the shared `PolicySource`, and `PolicyOutput`, whose `results` entries are `Diagnostic` values. A diagnostic's severity is one of three values every socket shares — `halt`, `warn`, or `info` — and the three are published as constants alongside the wire types in each of the three packages, so a guest reports from the same closed set the host routes on. A guest that returns any other value halts the build, with the message naming the plugin and the value it returned: an unroutable severity is a plugin defect the host reports rather than a diagnostic it drops.

## Output shape contract — the FeatureRecipe pipeline and provider sockets

The sockets below carry typed contract surfaces the compiler dispatches at build. The FeatureRecipe and Recipe `pipeline:` steps run in the plugin pipeline over the rendered document set; the provider-rendering socket runs at base rendering; the publishing-linter runs out of band.

### RFC 6902 patches (the plugin pipeline)

FeatureRecipe and Recipe `pipeline:` steps running in the plugin pipeline emit RFC 6902 JSON Patch operations against the rendered document set. The host hands each step the keyed document set whole; the step selects the documents it targets by content and returns key-addressed patches, which the apply engine applies to the addressed documents — typically appending a sidecar container, mounting a secret volume, or rewriting an env var. A step also returns `side_effects` (below), `diagnostics` — each entry the same shared `Diagnostic` shape every socket reports issues in — and `outputs` (below). Demonstrated at [`examples/04-secrets.md`](../examples/04-secrets.md).

**Status today:** **available**. Each declared step runs during `aggrega build`.

### Side effects — emitting resources (credential plugins in the plugin pipeline)

Credential FeatureRecipe pipelines (Two-Part Plugin Principle: Fetcher + Injector) emit full resources alongside a patch through a step's `side_effects` — for example an `ExternalSecret` or `VaultSecret` CRD (`emit_crd`) that the cluster fetches at runtime, or a written file (`emit_file`). The Fetcher's step emits the complete resource; the Injector's step returns a patch that mounts the resulting Kubernetes Secret. Demonstrated at [`examples/04-secrets.md`](../examples/04-secrets.md).

**Status today:** **available**.

### Step output (`pipeline:` step `outputs` map)

A plugin-pipeline step publishes named outputs that subsequent steps consume via `{{ .steps.<id>.outputs.<key> }}`. The output shape is provider-defined per plugin; step outputs are scoped to the same pipeline and visible only to subsequent steps in declaration order. Documented at [`templates/expansion-matrix.md`](../templates/expansion-matrix.md) row 11.

**Status today:** **available**.

### Provider rendering — the guest-driven socket

A provider is a Wasm guest. Rendering is Wasm-only: a Recipe's `capability:` name resolves to the provider-rendering Plugin (`pluginType: provider`) that lists the name in its `spec.provider.capabilities` and advertises a `render_node` export, and that plugin's guest renders the node. There is no in-host renderer to fall back to; a provider name that resolves to no serving Plugin halts the build at routing time. Adding a standard provider is shipping a `.wasm` guest and a catalog `Plugin` entity — the host carries no per-provider code.

**A capability a provider serves carries no colon, and neither does one a pipeline step declares itself compatible with.** A Recipe's `capability:` is read as the capability up to its last colon and a version pin after it — `helm:1.0.0` asks for `helm` at `1.0.0` — so a name containing a colon is one no Recipe can ask for. The host refuses such a name in `describe()`'s `capabilities` for a `provider` or `pipeline-step` guest when the guest loads and when its entity is generated for publication, naming the guest and the name. A parser's `parse:<format>` and an importer's `import:<format>` keep their colon: those are looked up by format, never through a Recipe's `capability:`.

The host is a generic router. It reads the guest's `describe()` self-report — including its **render-behavior contract** — and dispatches the guest's exports without understanding any provider format. That contract drives dispatch as data:

- `input_kinds` (`sourced`, `synthesized`, `artifacts_standalone`) — which Recipe input kinds the guest renders; the host gates a node's input kind against this set.
- `boundary_assembly` (`none` | `merge` | `nest`) — how the guest combines a dispatch group's output: `merge` classifies per-node output as fragments the assembler merges into one artifact, `nest` nests per-node files under an assembled wrapper, `none` writes each node's output directly.
- `artifact_delimiters` (optional) — the Go-template delimiter pair the guest applies to artifact bodies.
- `reusable_instance` (optional) — whether one loaded instance may serve every crossing of the build (see [Determinism and instance reuse](#determinism-and-instance-reuse) below).
- `omits` (optional) — whether the guest honours the omit entries a source render carries (see [Leaving rendered units out](#leaving-rendered-units-out) below).
- `source_ignore` (optional) — the files the guest's ecosystem never ships beside a source it renders (see [Declaring what a source's ecosystem never ships](#declaring-what-a-sources-ecosystem-never-ships) below).

The socket is a fixed export set — one mandatory, the rest optional and advertised in `describe()`:

- `render_node` (mandatory) — render one IR node into provider-native files.
- `assemble_boundary` (optional) — merge a dispatch group's per-node output into one artifact per path (present when `boundary_assembly` is `merge` or `nest`).
- `validate_node_input` (optional) — structural pre-render validation of a node's input; a `halt` diagnostic stops the build, a `warn` surfaces to the build result.
- `carve` / `reassemble` (optional, paired) — the guest's own byte-faithful patch codec for post-render pipeline steps, used only when both are advertised.
- `boundary_env_overrides` (optional) — the guest computes per-consumer boundary environment overrides the host then applies.

Recipe `artifacts:` fold into `render_node` through an artifacts projection on the input: the host does the `$import` read, the Go-template evaluation, and the provenance key/value computation, and hands the guest each entry already read and evaluated; the guest owns placement and emission in the format only it knows. Documented at [`architecture/13-catalog-and-registry.md`](../../architecture/13-catalog-and-registry.md).

**Status today:** **available** for all four providers. The helm guest renders sourced charts (resolving the chart root), synthesized workloads, and standalone artifacts as flat Kubernetes manifests. The helm-chart guest assembles an umbrella chart, nesting each node's sourced chart as a sub-chart, and carries a byte-faithful patch codec and bracket (`[[ ]]`) artifact delimiters. The compose guest renders sourced compose files and synthesized workloads and merges a dispatch group into one `docker-compose.yaml`, and bridges cross-network consumers through a gateway. The terraform guest emits Terraform configuration verbatim (HCL or JSON) or vendors a sourced module and supplies its inputs as that component's module-block arguments, validates a sourced module's HCL structurally before render, and composes a boundary into one root configuration declaring each component as a module block sourcing that component's own sub-directory. Each renders offline and deterministically.

#### Declaring the names a guest derives

A provider guest usually derives names its output needs but nobody authored — the identifier a target addresses one resource by, the name one output is published under for another to reference — from the node identity and the resource it is emitting. Two nodes can arrive at one name whenever the parts they are derived from agree, and because the name lives inside the file bytes the host writes verbatim, the host cannot see the clash: it would have to parse the provider's format to find it, which is exactly the knowledge that stays in the guest.

`render_node` therefore returns an optional `derived_keys` on its output, and the direction is inverted — rather than the host inspecting output, the guest declares and the host checks:

```json
{
  "files": [ { "path": "stack.yaml", "content": "..." } ],
  "derived_keys": {
    "logical-ids": ["paymentsapiQueue", "paymentsapiTopic"],
    "export-names": ["aggrega--prod--api--orders-db--host"]
  }
}
```

Each key of `derived_keys` is a **key space** the guest names, and each space carries the names the guest derived into it, in derivation order. Both the space names and the names within them are your vocabulary: the host reads them only as strings to compare for equality within one space. It does not parse a name, does not learn what a space or a name means, and never derives one itself — so one check covers every kind of name every provider derives, and a new provider needs no new host code.

What the host does with them is a single question: within one space, is every declared name distinct across the contributors whose output merges into one assembly? Two contributors declaring one name in one space halt the build, and the halt names the space, the name and both contributors, so an author can act without reading the provider. Distinct names, and names that happen to match across two *different* spaces, pass.

Three properties are worth knowing when you decide what to declare:

- **The scope is one assembled output** — the set of contributors whose files merge together. A guest wanting uniqueness across a narrower or wider scope than that expresses the scope in the space name it declares, which keeps the choice yours rather than the host's.
- **One contributor may repeat a name freely.** A node can render across several crossings — a source render, a workload synthesis, an artifacts placement — and the declarations merge. The same name declared twice by one contributor is that contributor describing one resource twice, not a clash.
- **Declaring changes no bytes.** The field is an assertion about what the guest derived, never a change to what it emitted, so a guest's rendered output is identical whether it declares or not. Omitting `derived_keys` is valid and leaves the check inert for that guest.

#### Reporting facts about what a guest emitted

Some things about a node's render are visible only to the provider that produced it — what the documents it wrote contain, which names they define, how many of something it emitted — because reading them out of the file bytes means understanding the provider's format. `render_node` can report such things itself, on an optional `render_facts` list beside its files:

```json
{
  "files": [ { "path": "stack.yaml", "content": "..." } ],
  "render_facts": [
    { "name": "exported_outputs", "value": ["QueueUrl", "TopicArn"] },
    { "name": "stacks", "value": [ { "name": "payments-api", "resources": 2 } ] }
  ]
}
```

Each fact is a `name` and a `value`, and both belong to your provider: which facts it reports, what each name means and what each entry holds are part of your provider's own documented contract, so document them for the authors who will read them.

**Report every fact's value as a list — a JSON array — even when it holds one entry.** One name can be reported by more than one render of a component: its own render can take several calls — a chart render and an artifacts placement, say — and each Feature attached to the component renders through a provider call of its own. No provider can know when it renders whether its report will be the only one under a name, so every report is a list, and the compiler joins the lists one name gets into one list. A fact whose value is anything else — an object, a string, a number, a boolean, `null` — is refused when your guest returns it: the build halts with the short code `E0325`, naming the fact, the node and your guest, and saying what the value was. The entries inside a list are any JSON values in the shape you document.

That a value is a list is the one thing the compiler learns about it. It keys the facts by name and hands each list to the templates that read it — the host component's facts to every Feature attached to it, and each caller's facts to a Feature that declares it reads its callers' render facts, as [the template context](../templates/template-context-contract.md) describes — decoding each list into a value a template can range over. It never learns what a name or an entry means and never derives a fact itself, so a new provider can report new facts without any change on the compiler's side. The facts a Feature attached to the node reports from its own render are kept apart from the ones the node's own render reported.

Four properties are worth knowing when you decide what to report:

- **The order is yours.** The facts keep the order your guest lists them in, and each value keeps its own bytes — the order of a list's entries and of each object's keys is the order your guest wrote. List the facts in a fixed order, and write each entry with a fixed key order, so identical input produces identical bytes; a list of facts rather than a map exists precisely so that order survives, since a map type in some languages would put the facts in key order on the way out.
- **Reporting changes no bytes.** The files the compiler writes are the files your guest returned, whether or not facts accompany them.
- **A node may report across several crossings.** A node can render as a source render, a workload synthesis and an artifacts placement; the facts each one reports are kept in the order the crossings ran, and a name reported by more than one of them reads as one list joining them in that order.
- **Reporting nothing is complete.** Omitting `render_facts` is valid, and a provider that reports nothing renders exactly as it would without the field.

The `RenderFact` type is published in the three ABI packages and re-exported by each language's plugin development kit, and the kits' render examples report two facts beside their files. In Go, a value is the JSON your guest writes; marshalling a slice of structs rather than of maps is what keeps each entry's keys in the order you declared them:

```go
type stackFact struct {
	Name      string `json:"name"`
	Resources int    `json:"resources"`
}

stacks, err := json.Marshal([]stackFact{{Name: "payments-api", Resources: 2}})
if err != nil {
	pdk.SetError(err)
	return 1
}
out := aggrega.RenderNodeOutput{
	Files:       files,
	RenderFacts: []aggrega.RenderFact{{Name: "stacks", Value: stacks}},
}
```

#### Leaving rendered units out

A source render can name units the provider must leave out of what it renders — a Secret a fetched chart generates afresh on every render, say. Which rendered unit an entry names is knowledge only your provider has, so the entries travel to your guest and your guest does the leaving out. They arrive on `render_node`'s input as an optional `omits` list beside the `source_listing`:

```json
{
  "node": { "id": "payments-api" },
  "context": { },
  "source_listing": { "root": "/acquired/payments-chart", "root_is_dir": true, "entries": [] },
  "omits": [
    { "kind": "Secret", "name": "payments-api-token", "namespace": "payments" },
    { "kind": "ConfigMap", "name": "payments-api-dashboards" }
  ]
}
```

Each entry is a `kind`, a `name` and an optional `namespace`, already resolved to plain strings and listed in the order the author declared them; an entry that does not apply to the build is not carried. What the three fields select is your provider's own contract — the kind, name and namespace of a resource in your target's format — so document it for the authors who write the entries.

An author can build an entry's fields from a value they declared sensitive — a resource named after a sensitive setting, say. Such an entry arrives with `"sensitive": true`, and your guest treats it as it treats every other marked value the render input carries (see [Values an input marks sensitive](#values-an-input-marks-sensitive)): it still matches and counts the entry by its fields, which is what the entry is for, and keeps every one of its fields out of a refusal, a warning or a log line. The mark covers the whole entry, because the compiler does not say which field the value produced. It is absent when no field was built from such a value.

A guest that honours the entries does three things:

- **Matches every entry against what it rendered**, in your format's terms.
- **Leaves each matched unit out of everything it returns** — its `files`, the names it declares in `derived_keys` and the facts it reports in `render_facts` — so nothing the compiler receives still describes it.
- **Reports one count per entry** on an optional `omitted` list in its output, in the order the entries arrived, each the number of units that entry matched, counted whether or not another entry also matched them:

```json
{
  "files": [ { "path": "templates/deployment.yaml", "content": "..." } ],
  "omitted": [1, 0]
}
```

A zero is a complete answer: that entry matched nothing your guest rendered. The counts are all that travels back about what was left out; the units themselves are simply absent from what your guest returned.

A provider that does all three declares it with `omits: true` on its contract. The `Plugin` entity records the same claim as `spec.provider.contract.omits`; where the entity carries a render-behavior contract, the load refuses a guest whose `describe()` reports a different value. The entries accompany a source listing and nothing else: a render of a synthesized workload or of an artifact set never carries them.

**A guest handed no entries renders exactly as before.** Both fields are optional and absent when empty, so a render that carries no entries crosses the socket byte for byte as it would if the fields did not exist, and a guest that never reads them is unaffected by them. The `OmitEntry` type is published in the three ABI packages and re-exported by each language's plugin development kit.

**What the compiler does with your answer.** The entries come from the `omits:` key an author writes on a Recipe or a FeatureRecipe ([Recipe → The `omits:` field](../entities/recipe.md#the-omits-field--leaving-rendered-documents-out-of-a-source)); the compiler evaluates each entry's templates and hands your guest the ones that apply. It then reads your counts, and only your counts — it never looks into a returned file to check them:

- **A count list that is not one non-negative count per entry it handed over halts the build** — missing, too short, too long, or holding a count below zero — naming the node, your provider, how many entries went over and how many counts came back. A report that does not line up leaves no way to tell which entry left what out. See [A provider's omitted counts do not match the omits entries it was handed](../errors/fatal-halts.md#a-providers-omitted-counts-do-not-match-the-omits-entries-it-was-handed).
- **A zero halts the build**, naming the first entry in the author's order whose count is zero: the node, your provider, the entry's position in the list its document declares, and the kind, name and namespace it resolved to. Your guest reports the zero; the halt is the compiler's. See [An omits entry left out nothing the source rendered](../errors/fatal-halts.md#an-omits-entry-left-out-nothing-the-source-rendered).
- **A document declaring `omits:` whose provider does not claim `omits: true` is refused before anything renders**, so an author learns at once that the key would have no effect rather than finding the document in the output. The compiler reads your claim from your `describe()` once every Recipe and FeatureRecipe in the build is bound, and refuses before the first component renders — so a guest that does not claim the key is never handed an entry. The refusal names the provider and the component the document renders for, or, for a FeatureRecipe that generates once for a boundary, the boundary and the attachment. See [The provider does not support omits](../errors/fatal-halts.md#the-provider-does-not-support-omits).

**Status today:** **available**. The helm and compose guests distributed with the compiler declare the claim and honour the entries. The helm guest writes no field of any entry into a text it returns. The compose guest names an entry's kind, name and namespace when it refuses the entry, and the units an entry left out when it refuses a file that still names them, and shows every field of a marked entry as `<redacted>` there. The helm-chart and terraform guests do not declare the claim, and neither does cloudformation, so a document declaring `omits:` that one of them renders is refused.

#### Declaring what a source's ecosystem never ships

A Recipe's local source directory — a co-located chart, a module — is published with the Recipe, and not every file in it belongs to it. A provider guest says what its own ecosystem never ships through `source_ignore` on its contract, as ignore rules in the syntax `.gitignore` uses:

```json
"contract": {
  "input_kinds": { "sourced": true, "synthesized": false, "artifacts_standalone": false },
  "boundary_assembly": "none",
  "source_ignore": {
    "patterns": [".git/", ".hg/", ".svn/", ".bzr/", "templates/.?*"],
    "files": [".helmignore"]
  }
}
```

- `patterns` are rules read from the root of the source directory, applied in order, a later match overriding an earlier one.
- `files` names the ignore files your ecosystem honours inside a source. Wherever the walk of a source meets one, its lines are read as further rules for the directory holding it, after your patterns.

**The declaration is read when an entity is pinned, not when it is rendered.** The author's pin step resolves the plugin serving the entity's capability in their workspace, composes your rules with their own `.aggregaignore` — whose lines come last and so win on any path they name — and records your plugin's reference and digest, together with the exact composed rules, in the entity's `entity.lock`. Every later publication, comparison and render of that entity applies the recorded rules; the host matches them and holds no opinion of its own about any ecosystem. So the files your guest is handed at render — the listing, and every file it asks the host to pack or read — are exactly the files a publication of the entity carries, and a file the rules leave out is answered as not there, naming it. A symbolic link under a source is refused before your guest is invoked.

**Compatibility follows from what was recorded.** A guest can render a Recipe published for its capability when it speaks the same ABI version, its contract matches its entity's claim, and it needs no file outside the published set. A guest that needs a file the set left out must fail its build loudly and name the file — the host's refusal of a pack or a read names it, and a guest carries that into its own failure. Where the plugin a consumer's workspace binds for a capability declares rules other than the ones an entity's lock records, the consumer's pull prints a warning naming both plugins and the difference; it never halts on it.

Omitting `source_ignore` declares no rules, and a source you render then keeps every file the author's own rules keep. The field is optional and needs no ABI version of its own: a guest that omits it loads as one declaring nothing. The `Plugin` entity records the same declaration as `spec.provider.contract.sourceIgnore`; where it does, the load refuses a guest whose `describe()` reports something different.

#### Determinism and instance reuse

The host consumes a guest's output bytes verbatim, so a guest must produce identical output from identical input. By default a guest is loaded fresh per node — zero state carried across nodes by construction. A guest that self-declares `reusable_instance` is instead loaded once per build and its single instance serves every crossing, which recovers the dominant per-node instantiation cost. Because reuse is safe only for a stateless guest, `aggrega build --verify-determinism` renders each node twice through the same instance and halts the build if any node's two renders differ; the default build renders once and trusts the declaration. The Wasm compilation cache is disk-backed and process-wide, so a guest compiles once and warm builds skip recompilation.

### `linter.wasm` (publishing-linter)

The `linter.wasm` socket ships as the standard **publishing-linter**, an out-of-band gate that runs through `aggrega lint` rather than at compile time. It consumes a catalog entity (and, in `--pre-publish` mode, the entity's currently-published version) and returns a list of findings, each with a severity and a message; in `--pre-publish` mode it also returns a version-bump classification. The host dispatches it through the embedded Wasm runtime, behind the same AOT-purity firewall as every other socket. The full rule set, severities, and per-rule opt-outs are documented at [`cli/aggrega-lint.md`](../cli/aggrega-lint.md).

The linter is opt-in catalog discipline: the compiler does not run it during `aggrega build` (with the single exception of the `x-aggrega-*` discouragement advisory, which surfaces at `warn` severity during build and at `halt` severity under `aggrega lint --pre-publish`). Because the rules live in a plugin, an enterprise can point `aggrega lint` at a different linter plugin to enforce its own discipline.

No parameter value reaches a linter plugin, at any scope `aggrega lint` runs. Before any document is handed over, the host withholds an Aggregate's parameter defaults, the values it passes to each module it imports, and a Release's parameters, keeping each parameter declaration's contract — only the keys a declaration is written with, at every level it nests — and any template text that reads a parameter: a parameter's value can be a credential itself, and the plugin attached here may be code the workspace did not write. What each document carries is set out under [What a linter plugin is handed](../cli/aggrega-lint.md#what-a-linter-plugin-is-handed).

**Status today:** **available**. The publishing-linter ships and runs through the host via `aggrega lint`.

## Placement criterion: the linter socket vs the governance verdict roles

Two of the documented sockets share a similar surface — both emit per-rule results — but differ in pipeline placement and gating semantics. The criterion for deciding which socket carries a given check:

- **The governance verdict roles (in-band, build-halting).** Reserved for **build-halting policies**: a `halt` verdict stops the compilation pipeline and the build produces no artifacts. Use cases are policies whose violation makes the output unsafe to apply: compliance gates (PCI / SOC2 boundary placement), topology invariants (zero-trust ingress, cross-boundary auth), credential-flow shape (no plaintext secrets in IR), etc. A policy reasons over the IR graph (`ir-verdict`, before render) or the rendered artifacts (`render-verdict`, after render).
- **`linter.wasm` (out-of-band, CI / IDE, advisory).** Reserved for **best-practice and discoverability checks**: rules whose violation is suspicious but not unsafe — orphaned secrets, unused parameters, deprecated label vocabulary, tag completeness for cost attribution, naming-convention drift. Failure produces advisory output; the build still produces artifacts.

The placement criterion phrased as a single rule: **if the check should halt the build, it belongs at a governance verdict role; if the check should warn an author or a reviewer without blocking the pipeline, it belongs in `linter.wasm`**.

Both are usable today. The `linter.wasm` socket runs the publishing-linter via `aggrega lint`; the governance verdict roles are dispatched in-band during `aggrega build` when a workspace attaches a verdict-role plugin. Note that a verdict role carries its own severities — a policy may itself emit `warn` and `info` verdicts that advise without halting — so the halt-versus-advise line above is the placement guidance for whole checks, not a claim that a policy can only halt. See the [governance socket page](policy-socket.md) for the severity model.

## Design surfaces without current code anchors

One design surface named elsewhere in the corpus is not yet fully anchored in current code today:

- **Full Wasm-socket role enumeration.** The current typed surface is the governance socket (its transform and verdict roles) plus the linter socket; the broader role design documented across architecture chapters is not centralized in a Go type registry.

The `linter.wasm` socket, by contrast, is fully anchored in current code: it is the publishing-linter, a typed contract with host dispatch via `aggrega lint`.

The pipeline placement table at the top of this page reflects today's state plus the planned placements; readers interested in the full architectural design target should consult [`architecture/09-ai-features.md`](../../architecture/09-ai-features.md) and [`architecture/13-catalog-and-registry.md`](../../architecture/13-catalog-and-registry.md).

## Cross-references

- [`policy-socket.md`](policy-socket.md) — the comprehensive governance-socket treatment: the four roles, verdict severities, the operator input channel, writing a policy for either of the two engines that ship inside the compiler, wrapping a foreign policy engine, and the reference guests.
- [`10-status.md#compilation-pipeline-phases`](../10-status.md#compilation-pipeline-phases) — Status page plugin-pipeline classification (Wasm plugin pipeline runtime readiness).
- [`architecture/04-entity-taxonomy.md`](../../architecture/04-entity-taxonomy.md) §"Domain 3: Infrastructure Base" — Two-Part Plugin Principle for credential FeatureRecipes (Fetcher + Injector pattern).
- [`architecture/13-catalog-and-registry.md`](../../architecture/13-catalog-and-registry.md) — the OCI taxonomy that leads with the provider segment.
- [`entities/featurerecipe.md`](../entities/featurerecipe.md) — FeatureRecipe `pipeline:` authoring surface.
- [`when-to-use-a-pipeline-step.md`](when-to-use-a-pipeline-step.md) — decision guide: a pipeline step vs a templated FeatureRecipe.
- [`templates/expansion-matrix.md`](../templates/expansion-matrix.md) — the plugin pipeline's `pipeline:` `with:` block template-evaluation rules and `.steps` access semantics.
- [`examples/04-secrets.md`](../examples/04-secrets.md) — worked credential FeatureRecipe with Fetcher + Injector pipeline shape.
- [`errors/error-translation.md`](../errors/error-translation.md) — error-translation discipline that future plugin guests participate in.
