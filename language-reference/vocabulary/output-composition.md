# Output composition

A single Aggrega build produces output files into per-boundary directories under `dist/` through six distinct mechanisms — sourced rendering, workload synthesis, FeatureRecipe Resource Generation, FeatureRecipe plugin-pipeline patches, Release-level composition, and direct artifact emission. The mechanisms run in a defined order; outputs collide deterministically when two mechanisms produce a file with the same name in the same boundary directory; the build halts before emission under the `CATALOG_ERROR` category, naming every contributor, when a collision is detected.

This page documents the six mechanisms in one place and names the rendering order across them. The per-chapter and per-entity references cover their own surfaces; the collision-detection rules across all six live here.

## The six output-producing mechanisms

Each mechanism lives at a specific Recipe / FeatureRecipe authoring surface and produces files under specific naming conventions. The mechanisms accumulate per node — a single component instance can drive multiple mechanisms at once (a sourced base Recipe + a Workload-synthesized companion file + a FeatureRecipe-emitted ExternalSecret CRD + a plugin-pipeline patch applied to the synthesized Deployment).

### 1 — Recipe sourced rendering (`source:` + `valuesMapping:`)

**Authoring surface.** Recipe declares `source: <path>` plus `valuesMapping:` (the field accepts inline Go template, file `$import:`, or library `$import:` to a MappingLibrary entry — see [`entities/recipe.md`](../entities/recipe.md) "The `valuesMapping` field — three authoring modes"). The source points at an on-disk Helm chart, a docker-compose YAML file, or another provider-native artefact.

**Pipeline placement.** Base rendering, after the Recipe's locals and provides resolve.

**Output shape.** Provider-specific:

- **helm provider** — flat Kubernetes YAML files, named for the component identity and then for the resource itself: `<component-id>-<kind>[-<namespace>]-<name>.yaml`, with a document carrying no kind or no name named for its template path instead. The name comes from the resource rather than from the template, so two templates in different subdirectories that share a filename stay two files. The Helm SDK renders the chart with the merged values; Aggrega injects provenance labels and annotations post-render.
- **helm-chart provider** — sub-chart files copied under `charts/<instance_id>/`, verbatim except the chart's own `name`, which the umbrella sets to the instance's encoded identity so two components vendoring charts that declare one name stay distinguishable (see [`providers/helm-chart.md`](../providers/helm-chart.md)); per-boundary umbrella `Chart.yaml` + `values.yaml` emitted alongside.
- **compose provider** — intermediate `<nodeID>.compose-fragment.yaml` files that flow into Release-level composition (mechanism 5).

### 2 — Recipe Workload synthesis (`workload:`)

**Authoring surface.** Recipe declares `workload:` carrying a Workload document. The field accepts inline content (block scalar) or `$import:` (file path) per the unified file-import vocabulary.

**Pipeline placement.** Base rendering, after the Recipe's valuesMapping resolves (the Workload body is itself a Go-templated string evaluated with full TemplateContext).

**Output shape.** Provider-specific:

- **helm provider** — one controller object chosen by the Workload's `form` (Deployment for stateless, StatefulSet for stateful, DaemonSet for daemon, Job for task, CronJob for scheduled) + per-service Service + one PVC per `persistent` volume. **Two naming shapes, and they are not the same:** the controller object is named for the node and its kind — `<nodeID>-deployment.yaml`, `<nodeID>-statefulset.yaml`, `<nodeID>-daemonset.yaml`, `<nodeID>-job.yaml`, `<nodeID>-cronjob.yaml` — while a per-resource file is named for **the resource it carries**, with the kind last: `<nodeID>-<svcName>-service.yaml` and `<nodeID>-<volName>-pvc.yaml`, because each is named from that resource's own `metadata.name` (see [`entities/workload.md`](../entities/workload.md) "Synthesized-name convention"). A Workload whose only exposure is an external name emits `<nodeID>-service.yaml` instead, there being no service key to carry.
- **compose provider** — intermediate `<nodeID>.compose-fragment.yaml` files that flow into Release-level composition.
- **helm-chart provider** — not supported; helm-chart's role is sourced-mode chart composition only. A Recipe targeting helm-chart with `workload:` is rejected at render time (the helm-chart provider reports no synthesis capability).

### 3 — FeatureRecipe Resource Generation (sourced mode for FeatureRecipes)

**Authoring surface.** FeatureRecipe declares `source:` plus `valuesMapping:` (or equivalent), same pattern as Recipe sourced rendering but for Feature attachments rather than primary Components.

**Pipeline placement.** Base rendering, alongside the base Recipe rendering for the parent Component. Each Feature attachment runs its own FeatureRecipe rendering pass.

**Output shape.** Decided by the parent Component's provider, because the attachment's output joins that Component's assembly group rather than one of its own — and it follows from how that provider combines the group, since that is what says whether there is a place to put an attachment at all. Three shapes, one per way of combining:

- A provider that gives each contributor a **position of its own** — one chart holding a chart per contributor, one root configuration holding a module per contributor — gives an attachment a position of its own too, **beside** the component it attached to rather than inside it. The two coordinates compose that position's single directory segment, `<component-id>--<feature-instance-id>`, so a component `api` carrying an attachment `aux` sits at `api--aux` beside `api`, under whichever directory that provider names for its contributors. Beside rather than inside, because such a provider's target discovers its contributors *at* the positions it gave them: a directory one level below one of those positions is content belonging to that contributor rather than a contributor of its own, so it is addressed by nothing and read by nothing. An attachment declared on the **boundary** has no host component to name, so its segment is its instance name alone. Each coordinate is encoded before the two are joined, so a coordinate that itself contains the join sequence cannot be mistaken for the join.
- A provider that writes each document **directly at the boundary directory** has no such place, because that is exactly what it declares about its target: only the files sitting directly in a directory are read. So the same two coordinates move out of directory segments and into the filename, and the attachment's files land beside the component's own as `<component-id>--<feature-instance-id>--<file>`. The two coordinates are encoded, because a filename has no separator to fall back on, and they are joined to the file's own name at a two-character boundary that no encoded coordinate can contain — which is what keeps two attachments emitting one filename at two distinct files.
- A provider that **folds its group's contributors into one document** folds the attachment's output into that document too, where each resource carries the attachment's own identity so what came from where stays readable. Where such a provider carries an attachment that rendered for a *different* target, that content cannot be folded into a document it does not belong to, so it is written beside the assembled one — in the filename-prefix shape above, for the same reason.

Common shapes:

- An `ExternalSecret` / `VaultSecret` CRD generated by a credential FeatureRecipe's Fetcher.
- A `ServiceMonitor` / `PrometheusRule` CRD generated by an observability Feature.
- An `HTTPRoute` / `Gateway` CRD generated by a routing Feature.

### 4 — FeatureRecipe plugin pipeline (RFC 6902 patches + resource emission)

**Authoring surface.** FeatureRecipe declares `pipeline:` — an array of Wasm plugin steps (Two-Part Plugin Principle: Fetcher + Injector for credential Features; arbitrary plugin pipelines for non-credential Features).

**Pipeline placement.** The plugin pipeline, after base rendering and FeatureRecipe sourced rendering complete.

**Output shape.** Plugin-specific. A step returns two output classes:

- **RFC 6902 patches** that the apply engine applies to the addressed documents in the rendered set (e.g., appending a sidecar container, mounting a secret volume, rewriting an env var on the synthesized Deployment).
- **Side effects** — full new resources emitted alongside the patch through a step's `side_effects` (typically the Fetcher's vault-fetch CRD that the Injector then references).

**Status today:** **available** per [Status of the Language → Compilation pipeline phases](../10-status.md#compilation-pipeline-phases). Each declared step runs during `aggrega build`: the host dispatches the step's Wasm plugin against the rendered set, applies the returned patches, and emits the step's side effects. See [`plugins/plugin-contract.md`](../plugins/plugin-contract.md) for the plugin contract surface.

### 5 — Release-level composition (per-provider boundary assembly)

**Authoring surface.** Driven by the Release shape — no per-Recipe authoring. A capability that assembles a boundary does so once, after every node in that boundary has rendered: the compose capability gathers all per-node fragments into one `docker-compose.yaml` per boundary, and the helm-chart capability gathers per-node sub-chart copies into one umbrella chart per boundary.

**Pipeline placement.** After base rendering, once every node's per-Recipe output has accumulated for the boundary.

**Output shape.** Per-provider:

- **compose provider** — one `docker-compose.yaml` at the boundary root, aggregating every contributing node's services, volumes, and networks. The intermediate `<nodeID>.compose-fragment.yaml` files (mechanisms 1 + 2) are merged into the single output; the fragments do not appear in the final boundary directory.
- **helm-chart provider** — one umbrella `Chart.yaml` + `values.yaml` at the boundary root, plus per-node sub-chart directories under `charts/<instance_id>/`.

### 6 — Recipe direct artifact emission (`artifacts:`)

**Authoring surface.** Recipe declares `artifacts:` as a map of named entries; each entry is either inline content (a templated string carrying the file body) or an `$import:` reference to a template file path — direct file emission without going through a provider.

**Pipeline placement.** Artifact evaluation, within base rendering.

**Output shape.** One file per artifact entry, named per the entry's key in the `artifacts:` map. The Recipe author dictates filename and content directly.

**Status today:** **available** per [Status of the Language → Recipe input kinds](../10-status.md#recipe-input-kinds). Each entry is evaluated with the full template context after workload synthesis and source resolution, and the resulting file is emitted under the entry's key. What a target does with an emitted artifact depends on the capability: a provider that accepts a standalone artifact emits it as its own file, while one that only accepts artifacts alongside another input kind folds the entry into what it assembles — so a body that is not the shape that assembler expects halts under the `TRANSLATION_ERROR` category rather than being emitted verbatim. Check the per-capability grid at [`architecture/16-recipe-input-composition.md`](../../architecture/16-recipe-input-composition.md) before authoring an artifact for a capability.

## Rendering order

The six mechanisms run in a defined order so downstream mechanisms can read upstream outputs. The order:

1. **Provides evaluation** — per node, the Recipe's `locals:` block resolves first, in author order, each entry reading the entries above it; the node's `provides:` templates then evaluate, in any order among themselves (self-contained: `.context.instance_id`, `.values`, `.infra`, the resolved `.locals`, static text). The locals-before-provides order is what lets a `provides:` entry read a local and receive a resolved value.
2. **Locals publication and source resolution** — those locals are published onto `.locals`, and the Recipe's `source:` URI template evaluates against them (resolving the source pointer if templated). The source surface shares the locals context, so it reads `.locals` and not `.provides`.
3. **Inject mapping** — FeatureRecipe `injectMapping:` blocks evaluate (the inject pipe is intercepted before Recipe rendering).
4. **Values mapping** — Recipe `valuesMapping:` evaluates (sourced mode + sourceless mode produce values dictionaries).
5. **Workload synthesis** — Recipe Workload synthesis (mechanism 2 emits manifests for synthesized mode).
6. **Artifact evaluation** — Recipe `artifacts:` evaluation (mechanism 6).
7. **Provider render** — the provider renders (mechanism 1 — sourced mode produces flat manifests; sourceless mode produces generative manifests).
8. **Feature rendering** — FeatureRecipe rendering for every Feature attachment on the node (mechanisms 3 + 4 — Resource Generation runs here; the plugin pipeline runs later, at step 9).
9. **The plugin pipeline** — post-render mutation: FeatureRecipe `pipeline:` plugin steps apply RFC 6902 patches and emit additional resources (mechanism 4).
10. **Release-level composition** — the capability's boundary assembly gathers per-node fragments into per-boundary outputs (mechanism 5).

The order matters because downstream mechanisms can read upstream outputs — for example, a plugin-pipeline step can patch a provider-rendered Deployment, and a Release-level composer can merge fragments emitted by the provider render, by feature rendering, and by the plugin pipeline.

## Collision-detection rule set

When two mechanisms produce a file with the same name in the same boundary directory, the build halts under the `CATALOG_ERROR` category, naming every contributor. The rule set:

### Recipe shape rule: `artifacts:` entry-key collision

A Recipe declares two entries under `artifacts:` with the same key (the key dictates the emitted filename, whether the entry's body is authored inline or loaded via `$import:`). Detected at Recipe load time per [`errors/fatal-halts.md`](../errors/fatal-halts.md) "`artifacts:` entry keys must be unique".

### Recipe shape rule: Cross-input-kind emission-time collision

A Recipe's three input kinds — sourced, synthesized, and artifacts — each emit files into the same boundary directory. If source-rendered, workload-synthesized, or artifact-emitted output produces a file whose name another input kind also produced, the build halts at emission. Detected at emit time per [`errors/fatal-halts.md`](../errors/fatal-halts.md) "Emission-time filename collision across input kinds".

### Compose service-name collision (Release-level)

When two different nodes (in any combination of boundaries) contribute services with the same name to the merged compose output, the compose provider halts as it composes the boundary, under the `TRANSLATION_ERROR` category, naming every contributing `(boundary, node, serviceName)` tuple. Detected at Release-level composition per [`providers/compose.md`](../providers/compose.md) Release-level output section.

A service is refused on the name alone, without comparing what the two nodes declared. A compose service is a single running container, so two nodes that each wanted one get one between them, and a contributor's intent is lost however identical the two definitions are.

### Compose volume-name and config-name conflict (Release-level)

When two different nodes contribute a top-level `volumes:` or `configs:` entry of the same name to the merged compose output, and the two declarations differ, the compose provider halts under the `TRANSLATION_ERROR` category, naming the entry and every contributing `(boundary, node)` tuple. Detected at Release-level composition per [`providers/compose.md`](../providers/compose.md) Release-level output section.

Unlike the service rule above, this one compares the declarations, and a shared name is legitimate where the contributors agree. A named volume or config is one object, so two nodes declaring it identically have both asked for exactly the entry the merged document ends up with and nothing is lost. Two nodes declaring it differently disagree about that one object, and keeping either declaration would discard the other from a build that would otherwise succeed. Two declarations count as agreeing when they describe the same entry in the assembled file, so a body written as an empty mapping and one omitted altogether agree.

### Helm-chart sub-chart alias and directory

A helm-chart sub-chart sits at `charts/<instance_id>/` and its values are scoped under its alias, which is the instance ID encoded for the alias position. Two instances cannot arrive at one alias unless their instance IDs are the same string, because the encoding writes out the characters an alias does not accept rather than substituting for them — so an alias identifies exactly one sub-chart, and the values written under it reach that sub-chart alone. Instance IDs are in turn unique per boundary by Aggregate-flattening rules, so the directory cannot collide either. Both halves are structural: neither rests on a check.

### Helm rendered-resource name collision

Within a boundary, two nodes that render to the same Kubernetes resource name produce two YAML files with overlapping `metadata.name` fields. The file names differ, because each is prefixed with its own naming basis, while the `metadata.name` inside them may still meet — so the helm provider does not detect this at render time and Kubernetes rejects the apply instead, which surfaces the collision after the build rather than during it.

**The largest case is closed by construction rather than checked.** A sourced chart that names its resources after the release name can no longer produce this between two components, because two naming bases that differ at all arrive at two release names — see [`providers/helm.md`](../providers/helm.md) "How the release name is derived". Two cases remain. A chart that writes a resource name into its templates literally is one, and no derivation can tell such a name apart from any other literal. The other is two Feature attachments on **one** component that each deliver a chart their author wrote: both render against that component's release name, by design, so two charts naming a resource after `.Release.Name` meet there — give the two charts' resources distinct names, or attach them to different components.

Every synthesized name opens with the node's own identity — the controller object's, and each per-resource name through the synthesized Service-name convention `<nodeID>-<svcName>` (per [`entities/workload.md`](../entities/workload.md) "Synthesized-name convention") — which makes cross-node collisions structurally impossible by construction. Authors who hit a runtime K8s rejection on a Deployment / Service name should look first at whether two different Recipes are emitting same-named resources via different rendering paths (e.g., a sourced chart's `templates/deployment.yaml` colliding with a workload-synthesized Deployment's `metadata.name`).

## Cross-mechanism interaction patterns

### Workload-synthesized + plugin-pipeline patch

The canonical pattern: mechanism 2 (workload synthesis) emits a base Deployment; mechanism 4 (the Injector plugin) applies an RFC 6902 patch that mounts a secret volume into the Deployment. The two mechanisms compose — the Deployment is the same K8s resource, with the patch layering ConfigMap / Secret references onto the synthesized base.

This is the dominant pattern for credential injection on synthesized workloads. The Fetcher (mechanism 3, Resource Generation) emits an `ExternalSecret` CRD that the cluster fetches at runtime; the Injector (mechanism 4, a plugin-pipeline patch) modifies the Deployment to mount the resulting K8s Secret.

### Sourced + Workload synthesis on different boundaries

A single Aggregate can have one component bound to a sourced helm Recipe (mechanism 1) on boundary A and a sibling component bound to a Workload-synthesizing helm Recipe (mechanism 2) on boundary B. Each boundary's directory carries the appropriate output shape; cross-boundary file naming does not collide because per-boundary `dist/` directories are sibling-isolated.

### Compose Release-level merge across boundaries

The compose capability's boundary assembly is unusual — it gathers per-node fragments not just within one boundary but across every compose-targeted boundary in the Release into a **single** `docker-compose.yaml`. This is the canonical compose shape (one compose file per project); the per-boundary fragmentation is intermediate state.

Service-name collisions across boundaries are therefore real and detected at the Release-level merge per the rule above. Two compose-targeted boundaries that each declare a service named `api` collide unless the boundaries are isolated (different Releases, different `dist/` directories).

## Cross-references

- [`entities/recipe.md`](../entities/recipe.md) — Recipe authoring surface (mechanisms 1 + 2 + 6 emit from Recipe content).
- [`entities/featurerecipe.md`](../entities/featurerecipe.md) — FeatureRecipe authoring surface (mechanisms 3 + 4 emit from FeatureRecipe content).
- [`providers/helm.md`](../providers/helm.md) — helm provider's per-mechanism output shapes and naming conventions.
- [`providers/helm-chart.md`](../providers/helm-chart.md) — helm-chart provider's umbrella + sub-chart composition (mechanism 5).
- [`providers/compose.md`](../providers/compose.md) — compose provider's per-node fragmentation + Release-level composition (mechanism 5).
- [`errors/fatal-halts.md`](../errors/fatal-halts.md) — the Recipe shape rules on unique `artifacts:` entry keys and on cross-input-kind filename collision.
- [`templates/expansion-matrix.md`](../templates/expansion-matrix.md) — per-template-site evaluation timing across the rendering order.
- [`plugins/plugin-contract.md`](../plugins/plugin-contract.md) — the plugin-pipeline contract surface (mechanism 4 design target).
- [`10-status.md`](../10-status.md) — current readiness state for mechanism 6 (`artifacts:`) and mechanism 4's plugin-pipeline runtime.
- [`architecture/10-compilation-pipeline.md`](../../architecture/10-compilation-pipeline.md) — full compilation pipeline including the order of the rendering stages.
- [`architecture/16-recipe-input-composition.md`](../../architecture/16-recipe-input-composition.md) — three Recipe input kinds (the upstream framing for mechanisms 1 + 2 + 6).
