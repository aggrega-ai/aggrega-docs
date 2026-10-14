# FeatureRecipe

The conceptual role of the FeatureRecipe entity (Domain 3 — the Wasm-plugin-driven implementation of a Feature interface) lives in [architecture/04-entity-taxonomy.md](../../architecture/04-entity-taxonomy.md). This page covers the FeatureRecipe catalog authoring surface.

## Catalog Location

FeatureRecipes are organized with the provider in the leading path segment (same pattern as Recipes):

```text
aggrega-catalog/
└── feature-recipe/
    └── {provider}/                          # e.g., `helm`, `compose`, `eval`
        └── {feature-recipe-name}/
            └── recipe.yaml
```

OCI URI: `hub.aggrega.ai/featurerecipe/{provider}/{name}:{version}` (e.g., `hub.aggrega.ai/featurerecipe/helm/k8s-secret-from-parameter:1.0.0`).

## Authoring Contract

FeatureRecipes bind to a Feature interface via `implements` and declare a concrete provider. Their authoring surface is the base Recipe's full set of input kinds plus two FeatureRecipe-specific blocks:

1. **The three input kinds — `source` + `valuesMapping` (sourced), `workload` (synthesized), and `artifacts`:** identical in shape to the base Recipe (see [Recipe Input Composition](../../architecture/16-recipe-input-composition.md) and [`entities/recipe.md`](recipe.md)). A FeatureRecipe that carries any of these is **resource-generating** — it renders resources alongside the base component. Where those resources land carries the component the Feature is attached to and then the name it is attached under, in whichever of the two forms the target's own layout admits: as a `{component}--{instance}/` directory beside its host's, under whatever that target calls the directory its contributors live in, on a target whose provider gives each contributor a position of its own; as a `{component}--{instance}--` filename prefix beside the component's own files, on a target that reads only the files sitting directly in a directory. On a provider that composes its contributors into a single document the resources are folded into that document instead — whatever family the Feature belongs to: a `ServiceMonitor` or `ExternalSecret` CRD as inline or `$import` `artifacts:`; an external chart or module via `source:` + `valuesMapping:`; or its own compute (for example a sidecar-agent Deployment) via `workload:`. `valuesMapping:` shares the base Recipe's three authoring modes (inline block scalar, file `$import:`, library `$import:` to a MappingLibrary entry) — see [`entities/recipe.md`](recipe.md) "The `valuesMapping` field — three authoring modes". By convention a FeatureRecipe *modifies* the base component or *adds resources alongside* it, but the schema does not restrict which input kinds it may use — the compiler renders whatever the FeatureRecipe declares, gated only by the bound provider's capability, and stays unopinionated about whether a given kind is "modifier-appropriate" (see [the founding invariants](../../architecture/05-invariants.md)). Synthesis (`workload:`) requires a provider that supports it; otherwise the build halts at render with the provider-capability diagnostic.
2. **`injectMapping` (Pre-Render Interception):** A native Go template block executed *before* the Base Recipe renders. It outputs a JSON dictionary that the compiler natively deep-merges over the Caller's `.context.inject` memory pipe, allowing Wasm-free, Caller-Side mutation of environment variables and connection strings.
3. **`pipeline`:** A sequential array of WebAssembly (Wasm) plugin steps for Post-Render Workload Mutation (e.g., injecting an Envoy sidecar via JSONPatch, or mounting a secret volume). Each step's `plugin` field names a `Plugin` entity by its URI, always scoped by the plugin's own socket type (`<pluginType>/<name>`, optionally versioned, as in `parser/yaml` or `parser/yaml:1.0.0`); the entity's `spec.plugin` is the content-addressed `.wasm` artifact, and a bare `.wasm` or artifact reference is not accepted here. See the [Wasm plugin developer guide](../plugins/plugin-developer-guide.md) for authoring and referencing a plugin, and [architecture/04-entity-taxonomy.md](../../architecture/04-entity-taxonomy.md) §"Domain 3: Infrastructure Base" for the Two-Part Plugin Principle (Fetcher / Injector). The compiler executes each step in declared order: it dispatches the named plugin's guest export against the rendered output and applies the returned JSON Patches and emitted side effects; see [Status of the Language](../10-status.md#compilation-pipeline-phases) for the execution state of each pipeline surface. A `pipeline:` stands on its own: a FeatureRecipe may declare one and no input kind at all, in which case it emits no resources of its own and its whole effect is what its steps patch into, or emit alongside, the documents the build has already rendered.

A FeatureRecipe may also carry **none** of these blocks: a pure-wiring Feature whose effect is the `uses`-edge it carries renders nothing, and its FeatureRecipe exists only to satisfy resolution — every feature instance resolves to a FeatureRecipe, the same way every component resolves to a Recipe. Among the blocks above, `injectMapping` is the one field with no base-Recipe counterpart; the three input kinds and `pipeline` are shared with the base Recipe.

**What is pinned beside a FeatureRecipe is what is pinned beside a Recipe:** the digest of each file an `artifacts` entry imports, and of each remote `source:` whose coordinates are written out in full, in an `entity.lock` in the FeatureRecipe's own directory, which [`aggrega pin`](../cli/aggrega-pin.md) writes and you commit beside it. A pull over a FeatureRecipe whose lock does not record those pins halts and names that step, unless the pull is asked to run it. A build halts when an imported file no longer matches its digest, and when a source's digest disagrees with the one the Release's lockfile records (a source written at a git `ref:` is recorded at the commit it resolved to and is not compared); the FeatureRecipe file itself is never written to. [`aggrega pull`](../cli/aggrega-pull.md#the-entity-lock) describes the file and how to answer each halt.

## Source Field Templating

A FeatureRecipe's `source:` is a templating surface on the same terms as a Recipe's: the template is evaluated at source resolution, and what it produced is what the build then resolves. Both shapes accept Go templates — the universal-string form, and the structured-object form whose string-valued sub-fields are template-evaluated while non-string sub-fields pass through. The shape inventory, the scheme handling and the anchoring reading are the ones set out in [`entities/recipe.md`](recipe.md) "Source field templating", "Source field scheme inventory" and "How a `source:` path is anchored"; this section states only what differs for an attachment.

```yaml
locals:
  chart_dir: ./charts/exporter
source: "{{ .locals.chart_dir }}"
```

**What a relative result is resolved against.** The directory holding the FeatureRecipe document that declared it — the attachment's own file, never the component's — and the result must stay inside that directory, exactly as for a Recipe: a result that climbs out of it, or is an absolute path, names a file that would not travel with the FeatureRecipe and halts the build. One carrying a transport scheme is fetched rather than joined to a directory. A FeatureRecipe resolved from a registry is read from the files its published archive carries, laid out in the content cache, so a relative result resolves inside what was published exactly as it resolves beside the FeatureRecipe in a catalog directory, held to the same bound.

**What the template may read.** The reference set is the one the FeatureRecipe's own `locals:` entries are checked against, which differs from a Recipe's in two ways that follow from an attachment being resolved rather than a component:

- `.attachment_name` **is available**, naming the instance the Feature is attached under. A Recipe's source template refuses it, because a Recipe's source resolves for a node and no attachment is in play.
- `.context.instance_id` names the **host component** the attachment is resolving for, not the attachment, and `.context.rendered_name` carries the name the host's own provider reports for the host — present only where that provider reports one, and halting the build where it does not. See [Naming a Rendered Resource](../templates/rendered-resource-names.md#on-a-feature-attachments-own-templates).

`.locals` carries the set this FeatureRecipe's other templates read: its own resolved block, with the host Recipe's beneath it, so a key the attachment declares wins over a host key of the same name. A reference to a key that set does not carry halts and names it, rather than rendering the key away. `.provides`, `.context.inject` and `.context.uses` are refused on the same self-containment grounds a Recipe's source surface refuses them.

**A boundary-scope FeatureRecipe reads the boundary instead.** A Feature whose FeatureRecipe declares `executionScope: boundary` renders once for the boundary rather than once per component, so there is no host component and no per-attachment delivery pipe. Its source template reads `.boundary.*` — the same pillars its `locals:` and `provides:` read — and the per-component pillars (`.context`, `.workload`, `.attachment_name`, `.inject`) are unavailable to it.

**An empty result.** A template that produces nothing leaves the attachment with no source, which is the sourceless mode — the same reading a Recipe's source takes, and distinct from writing `source: ""` yourself.

## `injectMapping` Exclusivity

The `injectMapping` field is **exclusive to FeatureRecipes** — it is intentionally absent from the base `Recipe` schema. This exclusivity isolates variable interception from `valuesMapping`: the Base Recipe's `valuesMapping` unknowingly consumes the rewritten `.context.inject` strings generated by FeatureRecipe `injectMapping` blocks, ensuring perfect decoupling. See the inject-mapping interception section below for how the mechanism runs, and [architecture/10-compilation-pipeline.md](../../architecture/10-compilation-pipeline.md) on inject mapping for the full pre-render interception semantics.

## Inject-mapping Interception: How `injectMapping` Works

When a caller needs the connection string to its target shaped differently than the target's unmodified `.provides.host` — appending a namespace for cross-boundary Kubernetes DNS, prefixing a region code for a multi-region gateway, or adding an SSL mode suffix to a DSN — `injectMapping` handles the mutation at the caller, before the base Recipe's `valuesMapping` ever sees the inject pipe.

The `injectMapping` field is a Go `text/template` that the renderer evaluates at inject mapping, before the base Recipe's rendering runs. The template outputs a JSON dictionary with optional mechanism keys (`env`, `file`, `arg`) — or a flat map which defaults to `env` — and the renderer deep-merges this overlay over the caller node's `.context.inject` pipe. Caller-side routing via `injectMapping` runs at inject mapping without invoking a Wasm sandbox for simple string manipulation; Wasm plugins remain reserved for structural AST changes via the `pipeline` array.

**Mutation is strictly caller-local.** The FeatureRecipe modifies only the inject pipe of the node it is attached to, never the target's `.provides` output. A target's `.provides.host` is consumed by potentially many callers across the cluster; caller-side `injectMapping` merges only into the specific caller's pipe, so routing mutations stay scoped to the edge that requested them.

**What a mapping may rewrite.** Every `inject:` block has delivered by the time the mappings render, so a mapping's output is always merged over keys something else already wrote — and who wrote a key decides what happens. A key the caller's own `inject:` block or one of its connections' `inject:` blocks delivered is the mapping's to rewrite: that is interception, and the mapping's value replaces that one entry. A key the mapping's own attachment delivered through its `inject:` block is likewise its own to rewrite. A key a *different* attached Feature already delivered — through its own `inject:` block or its own FeatureRecipe's `injectMapping` — is not: the build halts naming both attachments, rather than letting whichever mapping ran last decide which value the caller reads. So two routing Features can each qualify a key of their own, but two Features cannot both deliver one key — two routing Features rewriting the same connection's key included, since the first is interception and the second meets the first's delivery; see [fatal-halts.md](../errors/fatal-halts.md) "Two attached Features deliver one key, the later through its FeatureRecipe's injectMapping".

### Zero-coupling target inference

Because the compiler embeds each target's cascaded annotations into the caller's `.context.uses` pipe, the `injectMapping` template can extract routing coordinates without Ops hardcoding the target identity into the Feature's `infra`:

1. The template searches `.context.uses` to find the exact topological edge that injected the developer's requested variable.
2. It extracts the target's cascaded `release_annotations` (e.g., `aggrega.ai/namespace`).
3. It formats the Fully Qualified Domain Name (FQDN) or connection string.
4. It emits the override dictionary.

The compiler remains agnostic to the networking semantics — Kubernetes namespaces, cloud regions, bridge-proxy topologies — and simply executes the deep-merge with whatever the template produced. When the base Recipe's `valuesMapping` subsequently runs, it consumes the intercepted, rewritten strings from `.context.inject.env` as if they were the developer's originals.

### Worked example: K8s DNS resolver

The standard catalog ships this as `core/k8s-dns-resolver` with a helm FeatureRecipe. Because environment variable names must be unique within a container, the `target_var` (e.g., `API_HOST`) acts as a globally unique identifier for a specific injection contract within the caller. By looping over the explicit edges in `.context.uses` and checking which edge claimed the `target_var`, the template locates the correct target node and reads its namespace. The single parameter is the variable to rewrite; the target and its namespace are discovered, never hardcoded.

**The Routing Feature schema (`core/k8s-dns-resolver`):**

```yaml
infra: {
  target_var: string  # Ops dictates WHICH injected var to rewrite
}
```

**The FeatureRecipe implementation:**

```gotemplate
injectMapping: |
  # 1. Grab the atomic base host directly from the flattened pipe, or an
  #    empty value when nothing was injected under target_var
  {{ $base_host := optional .context.inject.env .infra.target_var "" }}
  
  # 2. Dynamically locate the specific edge that injected this variable
  {{ $target_edge := dict }}
  {{ range $alias, $edge := .context.uses }}
    {{ if hasKey $edge.inject.env $.infra.target_var }}
      {{ $target_edge = $edge }}
    {{ end }}
  {{ end }}
  
  # 3. Read the target's namespace from its cascaded release annotation,
  #    coalescing an absent namespace to "default"
  {{ $ns := "default" }}
  {{ if $target_edge.annotations }}{{ if $target_edge.annotations.release }}
    {{ $raw := optional $target_edge.annotations.release "aggrega.ai/namespace" "" }}
    {{ if $raw }}{{ $ns = $raw }}{{ end }}
  {{ end }}{{ end }}

  # 4. Qualify the host with the namespace — but only when a target connection
  #    and a base host were actually found, so a target_var that matches no
  #    connection injects nothing instead of a spurious variable. An unset
  #    namespace resolves to "default", where the helm provider deploys an
  #    unannotated workload, so the qualified host always matches the service's
  #    actual location and is never malformed.
  {{ if and $target_edge $base_host }}
  {{ $resolved_host := printf "%s.%s" $base_host $ns }}

  # 5. Emit the precise override dictionary for the compiler to deep-merge
  env:
    "{{ .infra.target_var }}": "{{ $resolved_host }}"
  {{ end }}
```

## Use Cases Beyond Routing

`injectMapping` is most commonly used for cross-boundary address resolution (like the K8s DNS resolver above), but that caller-side mutation applies to any scenario that requires intercepting and formatting developer intent before infrastructure rendering. Two further patterns illustrate the range.

**Dynamic security formatting (the SSL appender).** If an enterprise mandates that all external database connections use strict TLS verification, a Feature can intercept the developer's requested `DB_URL` and append the required SSL mode so the application boots with the correct security parameters.

```gotemplate
# Inside force-ssl-feature
injectMapping: |
  {{ $base_url := index .context.inject.env .infra.target_var }}
  env:
    "{{ .infra.target_var }}": "{{ $base_url }}?sslmode=verify-full"
```

**Multi-region gateway prefixing.** If a generic API component is deployed globally, a regional routing Feature can autonomously look up its own environment boundary annotations to prefix the injected connection strings for its callers.

```gotemplate
# Inside regional-router
injectMapping: |
  {{ $base_host := index .context.inject.env .infra.target_var }}
  {{ $region_code := index .context.annotations.release "cloud.aggrega.ai/region" }}
  env:
    "{{ .infra.target_var }}": "{{ $region_code }}.{{ $base_host }}"
```

**The boundary of `injectMapping`.** The mechanism is limited to mutating the `.context.inject` memory pipe (the Delivery Contract). It cannot append new containers, mount volumes, or alter the base Recipe's `valuesMapping` output. Any mutation that requires structural changes to the rendered AST (like JSON or YAML arrays) belongs in the FeatureRecipe's `pipeline` array, executed via WebAssembly plugins.

**The patch-target boundary of `pipeline`.** A `pipeline` step patches only output the provider renders into a structured tree. YAML- and JSON-shaped output is structured — including JSON-authored Terraform `.tf.json` modules — so a step's JSONPatch edits the addressed values in place, leaving every other byte (comments, ordering, formatting) untouched. Output the provider emits as an opaque body, such as native-HCL Terraform configuration, is not a patch target: a patch against an opaque body halts the build with a diagnostic rather than mutating text it cannot address structurally. Authoring a `pipeline` step against opaque output is therefore a design error surfaced as a loud halt, not a silent no-op.

**The inputs of a vendored Terraform module are not a patch target, and the absence is worth stating.** They are the arguments of that component's `module` block, which the terraform provider writes into the boundary's *root* configuration: native HCL, so opaque by the rule above, and an artifact of the whole boundary rather than of the node whose output the step patches. So there is no position from which a `pipeline` step can address them, and nothing it can do to change what a sourced Terraform module receives. Those values are shaped where they are authored — in the base Recipe's `valuesMapping:`.

## Conditional steps — `when:`

A `pipeline` step may carry an optional `when:` field: an inline Go template the compiler evaluates at pipeline-walk time, against the same template context and evaluator the step's `with:` body uses. The rendered result decides whether the step runs.

* A **falsy** result skips the step as a pass-through: the document set flows to the next step unchanged, and the skipped step contributes nothing — no patch, no side effect, no record of having run.
* An **empty or absent** `when:` always runs the step.

`when:` and `optional:` are independent. `when:` decides whether a step runs at all; `optional:` softens a *running* step's failure. A step may declare both — `when:` gates entry, and if the step does run, `optional:` governs how a failure inside it is handled. A `when:` template that fails to render is an authoring defect and halts the build regardless of `optional:`.

The rendered `when:` text is judged by the shared boolean-template rule: the strings `true`, `True`, and `TRUE`, any nonzero number, and any other non-empty string are true; the strings `false`, `False`, and `FALSE`, the empty string, and a zero number are false.

## Credential FeatureRecipe Pattern

When a FeatureRecipe implements a credential Feature (one labeled `feature.aggrega.ai/kind: secret`), it follows the Two-Part Plugin Principle: the `pipeline` chains a Fetcher plugin (generating the vault-specific CRD) followed by an Injector plugin (mounting the secret to the target container). See [examples/05-credential-features](../examples/05-credential-features.md) for the complete worked example.

A credential FeatureRecipe renders through the same Resource Generation pass as any other attachment's, and **its `pipeline:` executes on the same terms**: the compiler walks every attachment that has work in that pass as one ordered sequence and runs each one's declared pipeline, with the same `/own` and `/host` document-set semantics. An attachment joins that sequence for either of two reasons — its FeatureRecipe declares an input kind, so it generates resources of its own, or it declares a `pipeline:`, so it rewrites documents already emitted. A credential attachment can therefore reach into the host component's rendered documents — mounting a secret volume, adding an env reference — exactly as an operational attachment can, and the only difference between the two is where its own generated files land.

## The `provides:` block — publishing to the consumer

A FeatureRecipe's `provides:` block is its published output: a string-valued map of Go templates evaluated against the attachment's own scope (`.values`, `.infra`, the FeatureRecipe's fully resolved `.locals`, and the host node's `.context.instance_id` and `.context.rendered_name`). The locals resolve first, so a `provides:` entry reads them and receives resolved values; naming a key the `locals:` block does not declare halts. It is how an attachment tells its consumer what it produced — an emitted resource's name, a generated data key, a cloud identity — without the consumer re-deriving that identity from the same inputs.

The consumer reads it at `.features.<instance-name>.provides.<key>` (or `.features.<slot>.provides.<key>` for a credential attachment), mirroring `.context.uses.<alias>.provides` for a `uses` edge. Where the attachment is written on one of the consumer's connections, the consumer reads the same map under that connection, at `.context.uses.<alias>.features.<slot>.provides.<key>`, and the attachment is not among its `.features` (see [A connection's attachments](../templates/template-context-contract.md#a-connections-attachments--contextusesaliasfeatures)). The attachment's own `inject:` block resolves its `from:` references against the same map, so an author may choose either channel: `provides` for a template read, `inject` for delivery into an env var, file, or arg.

```yaml
# FeatureRecipe: emits a ServiceAccount and publishes its name.
provides:
  name: "{{ .infra.service_account_name }}"
```

```yaml
# Consuming Recipe: binds the pod to what the attachment published.
workload: |
  serviceAccount: "{{ .features.identity.provides.name }}"
```

When the Feature this FeatureRecipe `implements` declares a `schema.provides` contract, the contract is enforced against the FeatureRecipe: every key the Feature declares must appear in the FeatureRecipe's `provides:`, or the build halts naming the missing key. Extra published keys are permitted — the contract is a floor, not a ceiling. Values are never inspected; they are opaque deterministic pointers the runtime resolves.

Resolution happens once per attachment, before the consumer renders, and the same resolved map feeds the consumer's read, the contract check, and the attachment's own Resource Generation — so what the consumer reads and what the attachment emits cannot disagree.

## Provider & `implements`

The `provider` field is mandatory at the root level and declares which Wasm rendering plugin will execute the FeatureRecipe's output (`helm`, `helm-chart`, `compose`, etc.). The `implements` field binds the FeatureRecipe to its Feature interface and supports exact, major-compatible range, or unversioned matching — see [vocabulary/inheritance-and-interface](../vocabulary/inheritance-and-interface.md) for `implements` Version Matching semantics.

## Execution Scope — `spec.executionScope`

The optional `spec.executionScope` enum selects the dispatch model for Resource Generation. Two values are accepted; the default when the field is omitted is `component`.

* **`component` (default).** The FeatureRecipe's Resource Generation runs once per attached component instance. Each invocation receives a per-component `TemplateContext` rooted at `.context.*` — `.context.instance_id`, `.context.inject`, `.context.uses`, `.context.annotations`, etc. — exactly as today. Existing FeatureRecipes that omit `executionScope` continue to behave identically. Its `valuesMapping:`, `workload:` and `artifacts:` also read [`.context.used_by`](../templates/template-context-contract.md#the-components-that-use-this-one--contextused_by), the components whose `uses` entries point at the host — each with its identity, its socket, what it publishes, and the namespace and boundary it is placed in — which no template the host itself renders can see.
* **`boundary`.** Resource Generation runs **once per attached boundary**, regardless of how many components inside the boundary's subtree consume the feature. Each invocation receives a boundary-scope `TemplateContext` rooted at `.boundary.*` instead of `.context.*`.

The `injectMapping` interception described above is **always per-consumer** regardless of `executionScope`. Each component that uses the feature still gets its own caller-side rewrite of `.context.inject`. Only the Resource Generation step (`source`/`valuesMapping` and the `pipeline` array) deduplicates at boundary scope.

### Boundary-scope `TemplateContext`

When `executionScope: boundary`, the FeatureRecipe's templates evaluate against a `.boundary.*` view of the boundary the feature is attached to. The view exposes:

* `.boundary.path` — the boundary's evaluated `directory:` path (replaces `.context.instance_id`).
* `.boundary.boundary_name` — the boundary's authored name in the Release.
* `.boundary.components` — a map keyed by instance ID containing every component in the boundary's subtree (`instance_id`, `component`, `resolved_version`, `boundary_path`).
* `.boundary.internal_uses_edges` — `uses:` edges where both endpoints are inside this boundary's subtree (the compose-bridge pattern enumerates these, filtered to endpoints on different networks, to derive its per-edge proxy config). Each edge carries its endpoints' resolved provides, the injected env vars, and each endpoint's network inputs: `source_namespace` and `target_namespace`, the `aggrega.ai/namespace` annotation that applies to that endpoint — its own Release entry's setting where it has one, its boundary's otherwise — and `source_boundary_path` and `target_boundary_path`.
* `.boundary.outgoing_cross_boundary_uses_edges` — edges with the source inside the subtree and the target outside.
* `.boundary.incoming_cross_boundary_uses_edges` — edges with the target inside the subtree and the source outside (used by ingress-style aggregators).
* `.boundary.cross_boundary_uses_edges` — the union of incoming and outgoing cross-boundary edges, when the FeatureRecipe wants the full cross-boundary view.
* `.boundary.labels` — the union of subtree labels with author-order preservation.
* `.boundary.annotations` — the boundary's own annotations plus the cascade.
* `.boundary.feature_attachments` — every feature attached at this boundary (so a boundary-scope FR can introspect siblings if needed).

The `.infra` pillar on a boundary-scope FR resolves to the **boundary-attached feature's** `infra:` block (Release-side authored physical sizing for that boundary attachment). `.values` is **always empty** for boundary-scope FRs: the Release schema's pillar-split rule forbids `values:` on Release-level Feature attachments, so a `BoundaryFeature` carries no values to project. Boundary-scope FRs that need parameter-shaped data should consume it via `.infra` (the operator's authoring surface for boundary-feature configuration), via `.boundary.annotations` (cascade-resolvable string values authored on the boundary or any ancestor), or via `.parameters.X` (Release-fulfilled typed parameters from the Aggregate's `parameters:` declaration). `.locals` continues to be the FR's own locals block. `.steps`, `.metadata`, `.parameters` remain unchanged.

### Boundary-scope template field allowlist

Boundary-scope FRs may only reference fields available in the boundary-scope view. Authoring a template that references a per-component-only field (e.g., `.context.instance_id`, `.context.inject`, `.context.uses`) when `executionScope: boundary` causes the FeatureRecipe to fail validation at parse time with an error naming the FR, the offending field, and the alternative fields available in the boundary-scope view. The mirror rule applies in the other direction: a component-scope FR that references `.boundary.*` fields fails the same validator.

The validator runs the same template-AST walk that the path-template variable allowlist uses, with a different reference set per scope.

### Deduplication and Resource Generation output

For `executionScope: boundary`, the compiler deduplicates Resource Generation by the tuple `(boundary_path, FR-instance)`. Two components in the same boundary subtree both consuming the same boundary-attached feature trigger one FR invocation, not two. Cross-boundary attachments of the same feature run independently per boundary.

A boundary-scope FR emits one set of non-intermediate files per `(boundary_path, FR-instance)` tuple, and where they sit follows from how the provider combines its boundary's output. **The instance name alone is the coordinate here**, where a component-scope attachment carries its component as well: a boundary-scope feature is attached to the boundary rather than to any component, so the enclosing boundary directory already says everything a component segment would, and there is no component to name.

A provider that writes each document directly at the boundary directory declares that its target reads only the files sitting directly in a directory. There is therefore no enclosing directory for an attachment to sit in, and the instance name becomes a filename prefix instead: `<boundary_directory>/<fr-provider>/<feature-instance>--<file>`, beside the boundary's own files. The instance name is encoded, because a filename has no separator to fall back on, and it meets the file's own name at a two-character boundary no encoded coordinate can contain — so two attachments emitting one filename still reach two files.

A provider that composes its boundary's output into an enclosing structure — one chart holding a chart per contributor, one root configuration holding a module per contributor — places every contributor in a sub-directory of its own, and a boundary attachment is a contributor like any other. Its output then sits at `<boundary_directory>/<fr-provider>/<contributors-directory>/<feature-instance>/`, where `<contributors-directory>` is whatever that target calls the place its child units live. The sub-directory carries the attachment's instance name, which is the name you wrote it under in the boundary's `features:` block, so the directory a build produces is one you can find in what you authored.

Intermediate output flows to the boundary's per-(path, provider) assembler at the FR's evaluated path under the FR's own `spec.capability` — this is the mechanism the compose-bridge proof case uses to merge a bridge service alongside per-component compose contributors at the same assembly path.

### Cascade-aware `provides:` resolution

Boundary-scope FRs produce one `provides:` set per `(boundary_path, FR-instance)` tuple. The FR's `provides:` template evaluates with the boundary-scope `TemplateContext` (so it can reference `.boundary.components`, `.boundary.path`, `.infra`, but not per-consumer fields and not `.values`). The provides values are **constants relative to consumers** — every consumer in the boundary's subtree sees the same provided values.

**Consumer-side resolution of boundary-scope FR provides** works the same way as for component-scope FeatureRecipes: a consumer Component reads `.context.uses.<feature-alias>.provides.<provided-name>` and the compiler resolves it to the boundary-scope FeatureRecipe's `provides:` for the boundary the consumer sits in. The cascade walks from the consumer's `uses`-edge — which carries the per-attachment feature-instance identity — to the boundary-scope FR's rendered `provides:`; a pre-pass evaluates those provides before consumer assembly, so the values are present when the consumer's pipe is built. (`injectMapping` remains available for per-consumer caller-side rewrites, but `provides:` is the right channel for a boundary-scope FeatureRecipe exposing values to every consumer in its boundary.)

### Compose-bridge proof case

The compose-bridge FeatureRecipe is the canonical boundary-scope-FR pattern. A `core/compose-bridge` feature is attached at a parent boundary that contains two sub-boundaries (e.g., `services-net` and `data-net`) with shared `directory:`. Its `executionScope: boundary` runs the FR once per parent-boundary attachment. The FR forwards the boundary's `internal_uses_edges` to the compose provider, which selects the edges whose endpoints land on different networks, derives a gateway listen port per edge (the target's own port, with a `portBase` collision fallback), generates one nginx `stream` `server` block per bridged edge (`listen <port>; set $uN <target-host>:<target-port>; proxy_pass $uN;`, under a `resolver` directive so each upstream resolves at connection time rather than once at startup; the `$` in those variables is escaped to `$$` so Docker Compose's `$`-interpolation leaves a literal `$` for nginx), and delivers the aggregated config as a mounted compose config — a top-level `configs:` entry with inline `content:`, referenced from `aggrega-gw` and mounted at `/etc/nginx/nginx.conf` (so nginx loads it without an authored `command:`). Inline `configs.content` requires Docker Compose ≥ 2.23.1. From the **same** per-edge derivation, the boundary→component env channel rewrites each consumer's host env var (e.g. `DB_HOST`) to `aggrega-gw:<port>` — so the gateway's `listen` and the consumer's rewrite agree per edge by construction, including the `portBase`-reassigned collisions. The rewrite applies to a key the consumer's own connection delivered, which is interception; where another Feature attached to the consumer delivered that key — through its `inject:` block, its `injectMapping`, or a boundary Feature's override of its own — the build halts naming both Features rather than replace that delivery (see "A Feature attached to a boundary overrides a key another attached Feature delivered" in [fatal-halts.md](../errors/fatal-halts.md)). The gateway also joins **every network its bridged edges span** (the consumer's network and the target's), so at runtime the consumer can reach `aggrega-gw:<port>` and the gateway can `proxy_pass` to the target — the relay path resolves end-to-end. The per-(path, provider) compose assembler merges the gateway alongside the per-component contributors at the same evaluated path: one `docker-compose.yaml` containing every component plus the bridge gateway. The upstream is a deterministic compile-time compose service pointer; compose's runtime DNS resolves it (no compile-time runtime resolution).

## Rendering after the callers — `spec.readsCallerRenderFacts`

The optional `spec.readsCallerRenderFacts` (boolean, default `false`) declares that this FeatureRecipe's templates read what the components connecting to its host rendered: the render facts each of those callers' providers reports about the output it emitted. What a provider reports, and under which names, is that provider's own contract; [Reporting facts about what a guest emitted](../plugins/plugin-contract.md#reporting-facts-about-what-a-guest-emitted) describes the facts a provider may report.

**When such an attachment renders.** The build renders its components one at a time, in a fixed order, and an attachment normally renders right after the component it is attached to. A component that connects to the host and comes later in that order has not rendered yet at that point, so nothing it emitted exists to be read. An attachment whose FeatureRecipe sets `readsCallerRenderFacts: true` renders instead once every component in the build has rendered, together with every attachment that does not set the key — so each caller's render is complete before the attachment is evaluated. Its output lands where it would have landed and under the same names; the key changes when the attachment renders, not what it renders. One ordering follows from the later render: where the FeatureRecipe carries a `pipeline` that rewrites its host component's documents and the host's provider writes discrete documents, those steps run after the pipelines of the host's other attachments rather than in their attachment order.

**What it reads.** With the key set, each entry of `.context.used_by` carries `.render_facts`: the caller's render facts, keyed by fact name. **Every render fact is a list, so a template always ranges over it — even when it holds one entry.** Its entries can come from the caller's own render and from the renders of the Features attached to the caller: the lists one name gets from each are joined into one, the caller's own provider calls first, then each of its Features in the order they rendered. A Feature of the caller that itself sets the key renders after every component too, so what it reported is not among them. A caller whose providers report nothing carries an empty `.render_facts`, so a name nobody reported reads as nothing:

```yaml
artifacts:
  callers.yaml: |
    callers:
    {{- range .context.used_by }}
      - component: {{ .component_id }}
        ports:
        {{- range .render_facts.ports }}
          - {{ .port }}
        {{- end }}
    {{- end }}
```

Which fact names exist, and what each entry holds, is the caller's provider's documented contract — the helm provider's, for instance, are its [render facts](../providers/helm.md#render-facts), which name the labels of the pods it rendered. The callers' facts are on the connections the FeatureRecipe's `valuesMapping:`, `workload:` and `artifacts:` read; a `pipeline:` step's `with:` and `when:` see no connections at all, so a step reads only the host's own facts. Every FeatureRecipe attached to a component — whether or not it sets the key — reads the component's own facts at `.context.render_facts`, in the same shape; [the template context](../templates/template-context-contract.md#what-a-provider-reported-about-a-render--contextrender_facts) describes both.

**Declare it whenever a template reads the facts.** A template written inline in a FeatureRecipe that does not set the key — its `valuesMapping:`, its `workload:` or an `artifacts:` entry — that reads `render_facts` beneath `.context.used_by` halts the build before anything renders, naming the reference and the field it was written in (see "A template reads its callers' render facts without declaring it" in [fatal-halts.md](../errors/fatal-halts.md)). The check reads the template as written, so it does not see a reference built while the template runs, or one written in content imported from a file or a library — and a template reading a field named `render_facts` off some other list beside `.context.used_by`, or reading the host's own facts as `.render_facts` inside `{{ with .context }}` beside it, is treated as reading the callers' facts; write the host's own as `.context.render_facts` in full. The key, not the check, is what decides when the attachment renders, so set it on every FeatureRecipe whose templates read their callers' render facts, however they reach them; setting it costs nothing but the later render.

**A pipeline step reads only its host's own facts.** A step may rewrite the host component's own documents, and a component's own output stays the same whoever connects to it, so a step's `with:` and `when:` never see the connections — whether or not the FeatureRecipe sets the key, which decides when the attachment renders and nothing about what a step sees. A step's `with:` or `when:` written inline that reads `render_facts` beneath `.context.used_by` therefore halts the build before anything renders, with the short code `E0326`, naming the reference and the step's field — rather than rendering an empty value. Read the host's own facts in a step at `.context.render_facts`, written in full, and read the callers' facts in the FeatureRecipe's `valuesMapping:`, `workload:` or `artifacts:`. This check reads the template as written, with the same limits as the one above.

**Scope.** The key applies to a FeatureRecipe that renders once per component — `executionScope: component`, the default. A FeatureRecipe declaring `executionScope: boundary` renders where it always does whether or not it sets the key, and its templates do not read `.context` at all.

## The `locals:` block

`FeatureRecipe.spec.locals:` is an optional **map of named Go template strings** whose rendered output exposes a `.locals.*` map to every other template inside the same FeatureRecipe. It is the FeatureRecipe-private equivalent of Recipe `locals:` — a place to compute derived strings once and reference them from `injectMapping`, `valuesMapping`, `pipeline[].with`, `provides`, and `assertions:` without recomputing. The block is a map, not a single template body; a scalar in this position is schema-rejected.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: FeatureRecipe
metadata:
  name: regional-router
spec:
  implements: core/regional-router:^1.0.0
  capability: helm
  locals:
    region_prefix: "{{ .infra.region | lower }}"
    fqdn_suffix: "{{ printf \"%s.svc.cluster.local\" .infra.namespace }}"
  injectMapping: |
    env:
      "{{ .infra.target_var }}": "{{ .locals.region_prefix }}.{{ .infra.target_var | lower }}.{{ .locals.fqdn_suffix }}"
```

`.locals.*` is per-invocation: each FR invocation resolves its own `locals:` block, and the result is visible only to that invocation's downstream templates. The block resolves before the FR's other authoring-surface templates evaluate, so every one of them sees resolved values.

Each entry evaluates against a self-contained context: `.context.instance_id`, `.context.rendered_name`, `.attachment_name`, `.values`, `.infra`, and the entries of this same block already resolved. That is deliberately narrower than the context the FR's *other* templates read — a `locals:` entry cannot reach `.context.annotations`, `.context.inject`, `.context.uses`, or `.provides`, and a reference to any of them halts naming the reference. Derived values that need those pillars belong in the template that reads them, not in `locals:`.

The names in that context answer different questions, and a `locals:` entry reads them exactly as the FeatureRecipe's other templates do:

* **`.context.instance_id`** is the **host component** the attachment is resolving for. It means the host component on every template surface the compiler evaluates, so the same reference reads the same way whichever entity's block you are writing.
* **`.context.rendered_name`** is the **host component's name as its own provider reports it** — under `helm`, the release name, which is the host's identity written in the alphabet a Kubernetes name admits. It is present only where the host's provider reports a name, and reading it on a host whose provider reports none halts the build.
* **`.attachment_name`** is the **attachment instance** being resolved — the slot it fills in the owning entity's `featuresSchema`, or the free name you gave it.

So a `locals:` entry that derives a name for an emitted resource composes the host and the attachment, exactly as an `artifacts:` template would:

```yaml
spec:
  locals:
    scrape_name: "{{ .context.instance_id }}-{{ .attachment_name }}"    # api-scrape_target
```

Where the name has to be one the platform accepts and the host's provider reports one, compose it from `.context.rendered_name` instead: for a host named `my_api` under `helm` and an attachment `scrape`, `{{ .context.rendered_name }}-{{ .attachment_name }}` gives `my-zuapi-scrape`, where the identity would give `my_api-scrape`, which a Kubernetes name refuses. See [Naming a Rendered Resource](../templates/rendered-resource-names.md#on-a-feature-attachments-own-templates).

`.values` and `.infra` in a `locals:` entry are the **attachment's own** pillars, authored on the attachment declaration — not the host component's.

### Author order is load-bearing

Entries resolve in the order they are written, and **an entry may read a sibling defined above it**, receiving that sibling's resolved value:

```yaml
spec:
  locals:
    region_prefix: "{{ .infra.region | lower }}"          # defined first
    bucket: "{{ .locals.region_prefix }}-artifacts"       # reads the entry above
```

Chaining runs **downward only**. Where one entry reads another, the order of the entries decides whether the build succeeds: move `region_prefix` below `bucket` and the build halts. The compiler never reorders the block to make a reference resolve, so reordering a `locals:` block is a behavioural change, not a cosmetic one.

A reference to an entry the block defines **later** halts naming the ordering fault (move the definition above its reader); a reference to a key the block **does not declare at all** halts naming the key (correct the spelling). **The check follows an alias for the block:** a key reached through the dot a `with .locals` body rebinds, or through a variable bound to `.locals`, halts on exactly the terms the direct spelling gets. Two spellings escape it: a key reached through a call whose result the template text cannot name — `{{ index .locals "nope" }}` — and a key read off a parenthesised block — `{{ (.locals).nope }}` or `{{ ($.locals).nope }}`, where the key hangs off the value the parentheses yield rather than off the block itself. The parenthesised read does not halt and renders the literal text `<no value>`; the `index` read halts naming the key, because `index` halts on every template surface when the map it reads does not hold the key — see [errors/fatal-halts.md](../errors/fatal-halts.md) "A template indexes a map with a key the map does not hold". `provides:` reads the fully resolved block, because this FeatureRecipe's locals resolve before its provides; a `provides:` template naming an undeclared key halts. These are the same rules a Recipe's `locals:` block follows — see [entities/recipe.md](recipe.md) "The `locals:` block".

**Scope behavior.** For `executionScope: component` (default), `locals:` evaluates per attached component instance against the self-contained context above. For `executionScope: boundary`, `locals:` evaluates per boundary attachment against the boundary-scope view rooted at `.boundary.*`; the per-component fields (`.context.instance_id`, `.context.inject`, `.context.uses`) and `.attachment_name` are not available, because the FeatureRecipe runs once for the boundary rather than once per component. The boundary-scope template field allowlist applies to `locals:` the same way it applies to the other FR authoring-surface templates. The evaluation contract — author order, downward-only sibling reads, the two halts — is identical at both scopes; only the surrounding context shape differs.

**Distinction from `injectMapping` overlays and `pipeline[].with` mappings.** `locals:` produces a context-visible map for downstream templates; it does not contribute output. `injectMapping` writes into the consumer's `.context.inject` pipe (caller-side mutation). `pipeline[].with` supplies the Wasm plugin's `args` payload. The three surfaces are orthogonal — a FeatureRecipe routinely uses all three together, with `locals:` carrying the shared derived strings the other two reference.

## The `assertions:` block

`FeatureRecipe.spec.assertions:` is an optional map of **named** rules expressing **implementation invariants of the FeatureRecipe** — cross-field rules that hold given the specific Wasm plugin pipeline, chart, or mechanism the FeatureRecipe is built on. Each key is a rule identifier that appears in the failure message; each value is a Go template body. Like Recipe assertions, FeatureRecipe assertions are properties of the specific implementation; the Feature-level contract rules apply independently at an earlier pipeline phase.

```yaml
spec:
  implements: core/referenced-secret:^1.0.0
  pipeline:
    - id: fetch-secret
      plugin: pipeline-step/aws-secrets-manager:1.2.0
  assertions:
    # aws-secrets-manager plugin 1.x requires an explicit region when none is
    # implied through the Aggregate's infra block.
    region-supplied-for-secrets-manager: |
      {{- if not .values.region -}}
        {{- if not .infra.aws.region -}}
          {{- fail "aws-secrets-manager plugin 1.x requires either values.region or infra.aws.region to be set" -}}
        {{- end -}}
      {{- end -}}
```

The rule above is specific to the `aws-secrets-manager` plugin 1.x; it does not apply if a different `core/referenced-secret` FeatureRecipe binds. The Feature-level contract rules from the Feature definition still apply alongside.

FeatureRecipe assertions evaluate after FeatureRecipe binding and before Resource Generation. The template context for component-scope FRs mirrors the Recipe assertions context (entity-instance fields plus `.provides`, `.locals`, `.recipe.metadata`, `.recipe.source`); for boundary-scope FRs (`executionScope: boundary`), assertions evaluate against the boundary-scope view (`.boundary.*` fields available; per-component fields not). For the full authoring grammar and worked examples, see [templates/assertions-block.md](../templates/assertions-block.md).

## The `omits:` field — leaving rendered documents out of a source

Most FeatureRecipes never need this. It is for a FeatureRecipe whose `source:` is a chart you take as it is — one fetched from a registry, most often — that renders a document the attachment must not emit: a Secret the chart generates afresh on every render, or an object the host component or the operator already provides. `omits:` leaves such a document out of what the FeatureRecipe generates — or, for a compose file the FeatureRecipe sources, a service, a volume or a config the attachment must not contribute, and for a CloudFormation template it sources, a resource.

```yaml
spec:
  capability: helm
  implements: core/observability/collector:1.0.0
  source:
    kind: helm-oci-chart
    url: oci://registry.example.com/charts/collector
    version: "0.9.1"
  omits:
    # The collector chart ships its own ServiceAccount; the host supplies one.
    - kind: ServiceAccount
      name: collector
    - when: "{{ .infra.without_dashboards }}"
      kind: ConfigMap
      name: collector-dashboards
```

The key is authored identically on a Recipe, and [Recipe → The `omits:` field](recipe.md#the-omits-field--leaving-rendered-documents-out-of-a-source) is its full reference: what each entry field selects, that `when:` is evaluated first and a false one drops the entry, that every entry which applies must leave something out or the build halts naming it, that the source still renders in full and only its output is filtered, and which providers honour the key. What differs on a FeatureRecipe is only where the templates are evaluated:

- **Each entry's templates evaluate against the context this FeatureRecipe's `valuesMapping:` is evaluated against**, at the scope its `executionScope` selects. A component-scope FeatureRecipe's entries are evaluated once per attachment, against that attachment's `.values` and `.infra`; a boundary-scope one's once per boundary, against the boundary-scope view and the boundary attachment's `.infra`. The rules on what an attachment's templates may read apply to the entries as they apply to its `valuesMapping:`.
- **Only what this FeatureRecipe's own `source:` renders is filtered.** Its `workload:` and `artifacts:` are not, and neither is the host component's output: an attachment's entries reach its own chart, its own compose file or its own CloudFormation template, and nothing else — a compose service the host declares under the same key in the `docker-compose.yaml` both assemble into is untouched, and so is a resource the host declares under the same logical ID in the stack both assemble into. To change a document the host renders, the host's Recipe declares the entry, or a `pipeline:` step patches it.

A halt on an entry names the node, the provider, this FeatureRecipe and the entry's position in its `omits:` list; for a boundary-scope FeatureRecipe, the line above the message names the attachment and its boundary.
