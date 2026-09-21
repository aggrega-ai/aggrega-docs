# Recipe Input Composition — Three Input Kinds, Workload, Artifacts

A Recipe produces manifest files for its target provider. This chapter covers how Recipes compose their output from three orthogonal input kinds — sourced, synthesized, and artifacts — how each input kind is structured, and which provider produces which output today. The conceptual role of the Recipe entity (the Ops-authored translation template that maps Developer Intent to a single physical provider) lives in [04-entity-taxonomy.md](04-entity-taxonomy.md); the Recipe authoring surface at keyword level lives in [../language-reference/entities/recipe.md](../language-reference/entities/recipe.md).

## Rationale

Each provider's native rendering tool — Helm, Docker Compose — already knows how to render provider-native manifests. A Recipe's job is to declare WHAT those manifests should say: which container images, which ports, which environment variables, which volumes, which services, which resource limits.

An early approach extracts a fixed key set (e.g., `image`, `environment`, `ports`, `replicas`) from a Recipe's `valuesMapping` output and constructs a Kubernetes Deployment + Service from scratch. That approach is structurally unable to express:

- `resources` (CPU/memory requests/limits)
- Liveness, readiness, or startup probes
- `volumeMounts` / `volumes`
- `nodeSelector` / `affinity` / `tolerations`
- `serviceAccount` / `securityContext`
- Multi-container pods, sidecars
- ConfigMap / Secret / PVC / CRD resources
- Non-ClusterIP Services (LoadBalancer, NodePort, Headless)

The abstraction layer needs to describe a full workload shape, not a fixed key set. The three input kinds described below are that abstraction: a Recipe composes its output additively from an externally-loaded chart or module (`source:`), an abstract Workload specification the provider synthesizes into provider-native manifests (`workload:`), and templated provider-native manifests the Recipe emits directly (`artifacts:`).

## The Three Input Kinds

### Composition by Addition

There are three ways to produce provider-native manifest files from a Recipe, and they compose by addition rather than by mutual exclusion:

1. **`source:`** — an externally-loaded artifact (Helm chart, compose file) that the provider renders natively, with `valuesMapping:` supplying the overlay values.
2. **`workload:`** — an abstract Workload specification (platform-owned kind) that the provider synthesizes into provider-native manifests. The field accepts an inline YAML block scalar or a `$import:` to a single local file or library entry; the dispatch is content-shape driven.
3. **`artifacts:`** — a map of inline or `$import:`-loaded provider-native manifests, Go-templated against the full pillar context. Each entry may be authored inline (the entry's value is a block scalar) or via `$import:` to a single file or library content.

All three produce files that the compiler emits to the boundary's output directory. All three may coexist in a single Recipe, subject to the validation rules below. Merge semantics are top-level-only: each input kind produces complete files; files are concatenated; collision on output filename is a fatal error.

### Descriptive Mode Names

The three "modes" are descriptive vocabulary for documentation and diagnostics. Recipe authors do not declare a mode; they write the keywords they need. A Recipe is characterized by its dominant input:

| Dominant keyword(s) | Descriptive mode name |
| --- | --- |
| `source:` + `valuesMapping:` (no `workload:`, no artifacts) | **sourced** |
| `workload:` (no `source:`, no artifacts) | **synthesized** |
| `artifacts:` (no `source:`, no `workload:`) | **artifacts** (informally: "inline") |
| Any combination of two or more | described explicitly (e.g., "sourced with artifacts", "synthesized with artifacts") |

There is no keyword named `mode:` and no enum. The mode is an emergent property of which inputs are present.

### Recipe Shape at a Glance

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Recipe
metadata:
  name: ...
  version: 1.0.0
spec:
  capability: helm | compose | helm-chart | ...
  implements: core/...:1.0.0

  locals: { ... }
  provides: { ... }

  # ─── Sourced input (optional, paired) ───
  source: ...
  valuesMapping: |
    # Go template → YAML/JSON overlay values
  # OR:
  valuesMapping:
    $import: ./mappings/api-server.tmpl        # local file path
  # OR:
  valuesMapping:
    $import: <Lib>#/mappings/<entry>   # MappingLibrary entry

  # ─── Synthesized input (optional) ───
  workload: |
    # Go template → YAML → parsed Workload
  # OR (single-source $import for whole-content load from a file or library):
  workload:
    $import: ./workload.yaml

  # ─── Artifacts input (optional, multiple entries permitted) ───
  artifacts:
    "filename.yaml": |
      # Inline Go template → manifest YAML
    "other.yaml":
      $import: ./artifacts/other.yaml         # per-entry $import: for file or library content
```

*Every field above is accepted by the Recipe schema, and the compiler consumes all three input kinds today — sourced rendering, Workload synthesis, and artifacts emission all ship. What differs is per-provider support — which provider renders which input kind — captured in the Provider Capability Matrix at the end of this chapter.*

### Load-Time Validation Rules

The Recipe schema and load validation enforce these composition rules:

1. **`valuesMapping:` requires `source:`.** Without a `source:` to overlay, there is nothing to receive the mapped values. A Recipe with `valuesMapping:` and no `source:` is a load-time error. (A `source:` without `valuesMapping:` is permitted — the chart or module renders with its own defaults.)
2. **`workload:` accepts one source — inline or `$import:`, not both.** A Recipe specifies the Workload as either an inline block scalar or a `$import:` to a single file. The `$import:` form is single-source per the unified file-import vocabulary; multi-source merge is not supported at `workload:`. Load-time error on a malformed dispatch.
3. **`workload:` requires a synthesis-capable provider.** Synthesis support is a property of the provider itself, not of any declared field. A `workload:` Recipe bound to a provider that cannot synthesize is rejected when the node renders — through the provider-capability gate (see the Provider Capability Matrix) — with a clear diagnostic. The standard-library catalog declares `workloadSchema` on synthesis-capable providers by convention, as the documented translation contract, but the gate keys on the provider's own reported capability rather than on that field's presence.
4. **At least one input kind must be present.** A Recipe with none of `source:`+`valuesMapping:`, `workload:`, or `artifacts:` produces no output and is a load-time error.
5. **Inline and `$import:` artifact entries may coexist.** A Recipe may declare some `artifacts:` entries inline and others via per-entry `$import:` directives. Filename collision across the two forms is a load-time error.
6. **Cross-input-kind filename collisions are render-time errors.** If two of a Recipe's input kinds — source-rendered output, workload-synthesized output, or artifact-emitted output — produce a file with the same name, the compiler emits a fatal error identifying every contributor. This check runs after Workload translation, so it's render-time rather than load-time.

## The Workload Kind

### Ownership and Location

`Workload` is a platform-owned kind at `apiVersion: aggrega.ai/v1alpha1`. Its JSON Schema 2020-12 declaration is embedded in the compiler binary at build time; catalog authors do not edit the Workload schema, nor do they author standalone `Workload` YAML files as catalog entities. The Workload grammar is consumed inside a Recipe's `workload:` field (inline or via `$import:` to a single file) and nowhere else.

Workload is a platform kind and a compiler concept, not a separate entity in the [Entity Taxonomy](04-entity-taxonomy.md). The Recipe is the authoring entity; the Workload is the shape the Recipe's synthesized input takes.

### One Workload per Recipe

A Recipe declares exactly one `workload:`. The Workload represents the single deployment unit associated with the Component this Recipe implements. A FeatureRecipe likewise declares at most one `workload:` of its own — a Feature-owned deployment unit synthesized through the same Workload kind — see [FeatureRecipe](../language-reference/entities/featurerecipe.md). Use cases requiring additional side-workloads are expressed via:

- `artifacts:` — additional manifests alongside the workload, in the same Recipe (inline or via per-entry `$import:`).
- Features with Resource Generation — cross-cutting side-workloads (e.g., a backup sidecar attached to databases) declared as separate catalog entities, where the FeatureRecipe synthesizes its own `workload:` (or renders via `source:` / `artifacts:`). See [14-extensibility.md](14-extensibility.md) for FeatureRecipe Resource Generation.

This preserves the one-deployment-unit-per-author model: a Recipe synthesizes the Component's workload; a FeatureRecipe synthesizes its own.

### The Full Surface

The Workload's field set is large and it grows. Rather than restate it here, where a copy would fall behind the contract without anything reporting that it had, this chapter points at the two surfaces that carry the whole of it:

- **[The generated Workload schema reference](../language-reference/schema/entities/workload.md)** — every field, its type, its default and its constraints, generated from the published JSON Schema and compared against it on every build, so it cannot describe a shape the compiler does not accept.
- **[The Workload authoring page](../language-reference/entities/workload.md)** — field-level authoring guidance: what each field means, what each provider renders it to, and which combinations the build refuses.

*The Workload JSON Schema 2020-12 declaration is authoritative and ships embedded in the compiler binary. Recipe-side `workload:` consumption (inline or `$import:`) and the helm and compose synthesizers ship today; see the Provider Capability Matrix for per-provider support.*

### Secrets Integration with `featuresSchema`

The Workload's `containers.<name>.attachments` block *references* slots declared by the Component's `featuresSchema`; it does not declare new slots. See [../language-reference/entities/component.md](../language-reference/entities/component.md) for the `featuresSchema` authoring surface.

The validation contract:

- Every `attachments.<KEY>.from` value must match a slot name declared in the Component's `featuresSchema`.
- The `as:` delivery mechanism (`env` or `file`) must be allowlisted in that slot's `inject:` array.
- Slots marked `inject: []` (blackbox) in the Component's `featuresSchema` cannot appear in Workload `attachments:` blocks — those slots are delivered by the Recipe's internal plumbing (e.g., via Helm `existingSecret`), not via Workload exposure.

Example:

```yaml
# In the Component
spec:
  featuresSchema:
    db_password:
      required: true
      inject: [env, file]      # transparent: Workload may dictate delivery
    root_password:
      required: true
      inject: []               # blackbox: Recipe handles internally

# In the Recipe
workload: |
  containers:
    main:
      attachments:
        DB_PASSWORD:                 # OK — db_password slot allows env inject
          from: db_password
          as: env
        # ROOT_PASSWORD: ...         # rejected — root_password is blackbox
```

### Health Probes: Intent, Not Mechanism

Kubernetes probes and Docker Compose healthchecks have different shapes. A single abstract intent shape translates cleanly to both:

```yaml
health:
  ready:
    http: /healthz           # intent: HTTP GET probe
    timeoutSeconds: 5
  live:
    tcp: 8080                # intent: TCP socket check
    timeoutSeconds: 5
  startup:
    exec: ["check-ready.sh"] # intent: command exec
    timeoutSeconds: 30
    periodSeconds: 10
```

Providers translate each intent to their native shape:

| Intent | Helm (K8s) | Compose |
| --- | --- | --- |
| `http: /path` | `httpGet.path: /path, httpGet.port: <alphabetically-first port name>` | `CMD-SHELL "curl -f http://localhost:<port>/path"` |
| `tcp: <port>` | `tcpSocket.port: <port>` | `CMD-SHELL "nc -z localhost <port>"` |
| `exec: [cmd]` | `exec.command: [cmd]` | `CMD [cmd]` |

Port resolution for `http:` without an explicit port takes the alphabetically-first port name the container declares under `containers.<name>.ports`, on both targets. A container declaring no named port cannot carry an HTTP probe, and the build halts naming the probe.

Compose degrades HTTP/TCP probes to healthcheck shell commands.

### Volume Types

Five volume types; no compound:

| Type | Semantics | K8s (helm) | Compose |
| --- | --- | --- | --- |
| `ephemeral` | Tmpfs / emptyDir; dies with pod | `emptyDir: { sizeLimit }` | `tmpfs: { size }` (in-memory; warning if semantics differ) |
| `configmap` | Read-only config files | ConfigMap volume reference | service-level `configs:` reference to a top-level config the Recipe's `artifacts:` declares |
| `secret` | Read-only secret files | Secret volume reference | env_file or bind-mounted secret file |
| `persistent` | Single PVC; survives pod restarts | PVC resource + `volume.persistentVolumeClaim` | named volume |
| `persistentTemplate` | Per-replica PVC; companion of `form: stateful` | `StatefulSet.volumeClaimTemplates` | named volume (degraded; warning emitted) |

Compose cannot express per-replica templates. When `persistentTemplate` is translated to compose, it degrades to a single named volume shared by every replica, and a warning reports the degradation. A `persistentTemplate` volume requires `form: stateful`; declaring it on any other form halts the build.

### Multi-Service Exposures

Each service is an independent exposure. A common pattern: an HTTP service on port 8080 (ClusterIP internal) + a metrics service on port 9090 (ClusterIP) + an admin endpoint on port 9901 (LoadBalancer):

```yaml
services:
  http:
    type: ClusterIP
    ports:
      web: 8080
  metrics:
    type: ClusterIP
    ports:
      prom: 9090
  admin:
    type: LoadBalancer
    ports:
      admin: 9901
```

Each becomes a separate Kubernetes Service object when rendered under the helm provider. In compose, services that aren't `ClusterIP` result in port publishing on the compose service.

Service names in K8s output are prefixed with the component's `instance_id` for uniqueness. Port names must match container port names declared in `containers.<name>.ports`.

### Provider-Side Translation Contract: `workloadSchema`

A provider-rendering Plugin (`pluginType: provider`) declares a `spec.provider.workloadSchema` — a JSON Schema 2020-12 declaration documenting how Workload fields translate to that provider's native output. This is the self-documenting translation contract. See [../language-reference/entities/plugin.md](../language-reference/entities/plugin.md) for the Plugin authoring surface, including the `spec.provider` block.

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Plugin
metadata:
  name: helm-renderer
  version: 1.0.0
  pluginType: provider
spec:
  plugin: "oci://hub.aggrega.ai/plugin/provider/helm-renderer"
  abiVersion: v1alpha1
  targets:
    - helm
  provider:
    workloadSchema: |   # how Workload translates to K8s manifests
      // Each Workload produces: 1 controller object chosen by workload.form
      //   (stateless -> Deployment, stateful -> StatefulSet, daemon -> DaemonSet, task -> Job)
      // + 1..N Services (one per workload.services entry)
      // + 1..N PVCs (one per workload.volumes.*.persistent entry)
      // + 1..N ConfigMap volume refs (from workload.volumes.*.configmap.source)
      // ...
```

The `workloadSchema` field communicates translation intent to catalog authors and IDE tooling. It is the documented translation contract, declared by convention on providers that synthesize — but synthesis support is determined by the provider itself, not by this field's presence. A Recipe targeting a provider that cannot synthesize with `workload:` is rejected when the node renders — through the provider-capability gate — with a clear error, whether or not the provider declares `workloadSchema`.

*The Plugin schema declares `spec.provider.workloadSchema` today — its body is compiled to JSON Schema 2020-12 when the Plugin loads — and Recipe-side `workload:` consumption ships. Synthesis support is enforced at render time by the provider-capability gate, keyed on the bound provider's reported capability; `workloadSchema` is the documented contract the standard-library catalog keeps in sync with that capability, not itself the gate input. `aggrega lint` additionally surfaces a `workload:` Recipe bound to a non-synthesizing provider early, before a build.*

### Auxiliary Resources Live Outside the Workload

The Workload spec has no `additionalResources` field, no `extras`, no inline ConfigMap/Secret/CRD declarations. The Workload models the workload shape only: containers, volumes, services, replicas, scheduling, security context, service account — everything that describes how the single deployment unit runs.

Auxiliary resources have two legitimate homes outside the Workload:

1. **Features + FeatureRecipes** — the mechanism for cross-cutting concerns. A ServiceMonitor attached to "any server with metrics exposed" is `core/prometheus-exporter` as a Feature. The routing resource that publishes a server at a hostname is a Feature too, and the routing form decides which one: `core/public-ingress` where the target reconciles an Ingress, `core/http-route` where it runs the Gateway API — each realized by a FeatureRecipe the Manifest selects per Release. A NetworkPolicy enforced on all production workloads is a Feature attached via Release-level selectors. Features compose orthogonally and can be reused across Recipes. See [14-extensibility.md](14-extensibility.md) for FeatureRecipe Resource Generation.
2. **Recipe-level `artifacts:`** — for resources that belong to this specific Recipe's implementation and aren't worth creating a Feature for. A one-off CRD registration the Recipe needs. A Recipe-specific PodDisruptionBudget that applies only when this Recipe is used. A ConfigMap the Recipe's Workload references. Each entry is inline or `$import:`-loaded; see the Artifacts Mechanism section below.

The line between Feature and artifact is a social convention. If an auxiliary resource is cross-cutting (applies to many Recipes, or is attached conditionally via selectors), it's a Feature. If it's intrinsic to this one Recipe (the Recipe can't do its job without emitting that resource), it's an artifact. Authors choose based on reuse and attachment semantics; the compiler does not police the choice.

Features and Recipe artifacts together cover every auxiliary-resource case currently known.

## The Artifacts Mechanism

### Inline and File-Loaded Artifacts

The artifacts input kind emits templated provider-native manifest files directly to the boundary output, alongside any source-rendered or workload-synthesized output. Authors declare it via two surfaces:

```yaml
spec:
  artifacts:
    "servicemonitor.yaml": |
      apiVersion: monitoring.coreos.com/v1
      kind: ServiceMonitor
      metadata:
        name: {{ .context.instance_id }}-monitor
      spec:
        endpoints:
          - port: {{ .workload.services.metrics.ports.prom }}

    "networkpolicy.yaml":
      $import: ./artifacts/networkpolicy.yaml
    "crd-registration.yaml":
      $import: ./artifacts/crd-registration.yaml
```

The `$import:` paths are relative to the Recipe directory. A typical convention places them in an `./artifacts/` subdirectory, though the compiler does not enforce this. The map key names each emitted file — the next section covers what that means in each of the three forms.

Each entry (inline or `$import:`-loaded) is Go-templated against the full TemplateContext before being emitted to the output directory.

### What Names Each Output File

The map is keyed by entry name, and the key names what the entry emits in every authoring form. For an inline entry the key is the output filename, used as written:

```yaml
artifacts:
  "configmap-config.yaml": |
    ...
  "pdb.yaml": |
    ...
```

Produces `configmap-config.yaml` and `pdb.yaml`. The key fixes the filename; where the file lands is the target's decision, and the section on per-provider emission below covers it.

For a file `$import:` entry the key is the output filename too. The imported file supplies the *content*; it does not supply the name, so an author who wants a particular output filename writes that name as the key:

```yaml
artifacts:
  "monitor.yaml":
    $import: ./artifacts/monitor.yaml
  "netpol.yaml":
    $import: ./artifacts/subdir/some-other-name.yaml
```

Produces `.../monitor.yaml` and `.../netpol.yaml`. The second entry's imported file is called `some-other-name.yaml`, and that name does not reach the output — the key does. Two entries importing different files that happen to share a name, `./extras/shared.yaml` and `./overrides/shared.yaml`, are therefore two distinct outputs, each named by its own key.

For a library `$import:` entry, which pulls in a bundle of files as one unit, the entry expands into one output per file in the bundle, each nested under the key as `<key>/<filename>`. One key names many files, so the key alone cannot name them: it is the directory the bundle's files land in rather than the name of any one of them.

Because every form names its output from the key, the key is bounded at the authoring surface to what a single filename can be: a leading letter or digit, then letters, digits, dots, hyphens and underscores. The dots carry the extension a consumer expects, which is what makes a key usable as a filename directly; and the alphabet holds no `/` and no leading `.`, so one key can never spell more than one path segment and can never be the parent-directory segment. A key outside the alphabet fails envelope validation at workspace load, at `aggrega validate`, and in editor diagnostics.

Two `artifacts:` outputs carrying the same filename halt the build when the node renders, whichever forms produced them. Two entries of one `artifacts:` map never name one output: a key is unique within one document and is a single filename, so a single-file entry's output name is its key and a bundle entry's outputs all sit under a directory named by its key. The first segment of every emitted path is therefore the key that produced it, and distinct keys stay distinct output names. What the halt covers is the case that crosses input kinds — one filename contributed by two of them, a chart template and an artifact entry both producing `servicemonitor.yaml` — with a diagnostic naming every contributing origin.

### Template Context for Artifacts

Artifact templates have access to the full pillar context:

- `.values`, `.infra`, `.context.*`, `.locals`, `.provides`, `.features`, `.metadata` — the standard Aggrega pillars described in [06-data-taxonomy-and-composition.md](06-data-taxonomy-and-composition.md).
- `.workload` — the parsed Workload spec for this Recipe (if present). Allows artifacts to reference Workload values without duplication, e.g., a ServiceMonitor referencing `.workload.services.metrics.ports.prom`.
- `.source` — the resolved `source:` field content (if present).

Artifacts evaluate after the Workload is parsed, so `.workload` is available when present. For Recipes without `workload:`, `.workload` is nil; a template attempting to dereference it fails with a clear error. For Recipes without `source:`, `.source` is nil with the same failure mode.

*The `.workload` and `.source` top-level TemplateContext fields are declared in the schema today. Full runtime population of these fields alongside artifact evaluation lands with the artifacts render path; templates that dereference `.workload.*` or `.source.*` today may not receive populated values across every provider path.*

### The Self-Containment Invariant

Artifacts must be self-contained. They can only reference the Recipe's declared inputs: the pillar context, the Recipe's own Workload (when present), and the Recipe's own `source:` value. They cannot reference:

- Other Recipes' outputs in the same boundary.
- Ambient Kubernetes resources that the Recipe did not declare.
- Secrets, ConfigMaps, or other resources assumed to exist externally (unless referenced via a declared pillar).

A ConfigMap artifact that's referenced by the Workload's `volumes.*.configmap.source` must be emitted by THIS Recipe (via `artifacts:` producing that ConfigMap) or by a Feature attached to this node. Cross-Recipe dependencies within a boundary are not supported.

This invariant preserves Recipe reusability: a Recipe can be dropped into any Aggregate + Release combination that satisfies its pillar contract, with no hidden dependencies.

### Provenance Labels

Post-translation, every emitted file carries `aggrega.ai/*` provenance in its metadata — whether it was source-rendered, workload-synthesized, or emitted from an artifact template. Every emitting surface stamps it from one shared set of builders, so the same file always carries the same provenance whichever input kind produced it. The set splits by whether a value satisfies the Kubernetes label-value charset: label-safe keys are **labels** (queryable); charset-unsafe keys — `recipe-uri` (carries a `:`), `boundary-path` (a nested path carries `/`), and `sync-wave` (a negative wave's leading `-`) — are **annotations**, whose values are unconstrained. All files carrying the same Recipe's output share the same provenance:

```yaml
metadata:
  labels:
    aggrega.ai/component-id: api
    # ... plus the standard OTel / recommended label set
  annotations:
    aggrega.ai/recipe-uri: api-server-helm:1.0.0
    aggrega.ai/boundary-path: production
```

This split is uniform across all three input kinds. (The Compose provider has no annotation concept and its label values are unconstrained, so it emits the whole set as service labels.) See [11-governance-and-compliance.md](11-governance-and-compliance.md) for compile-time provenance stamping.

Because a provider stamps provenance where its own output format carries it, a provider whose format offers no such place for a given file emits that file unchanged and says so. Compose is the case to know: its provenance site is a service's `labels:` block, so a compose artifact fragment contributing only top-level `networks:`, `volumes:` or `configs:` carries no provenance, and the build emits a "skipped provenance label injection" warning naming the artifact. That warning is expected for a fragment of that shape rather than a sign of a problem — the services the same component emits carry the full set, and nothing about the emitted bytes changes. What it rules out is the third possibility: a file leaving the build unstamped without being named.

CloudFormation is the other case to know, and it differs in *where* provenance lands rather than in whether it lands. A CloudFormation template carries no document-level metadata block that travels with a resource, so provenance goes on each resource's own `Metadata` attribute, under one `aggrega.ai/provenance` key holding the whole set:

```json
"StoreBucket": {
  "Type": "AWS::S3::Bucket",
  "Metadata": {
    "aggrega.ai/provenance": {
      "aggrega.ai/component-id": "store",
      "aggrega.ai/recipe-uri": "store-recipe:1.0.0",
      "aggrega.ai/boundary-path": "stack"
    }
  }
}
```

Three properties follow from that site. The `Metadata` attribute is available on every resource whatever its type, so every resource an assembled stack carries is stamped — including the many resource types that accept no tags at all, which a tag-based stamp would have had no place on. The stamp is *added to* whatever `Metadata` the author wrote rather than replacing it, so an author's own entries stand alongside it. And because it is per resource rather than per template, a stack that several components assemble into carries each resource's own contributing identity — its component, its Recipe and its boundary — which a single template-wide entry could not express.

The whole set travels together under that key. A `Metadata` value is unconstrained JSON, so there is no charset split to make; the two keys only a Kubernetes runtime reads — the standard recommended-label name and the deployment-ordering annotation a GitOps controller consumes — are left out, since neither names anything in a stack. The plain `aggrega.ai/sync-wave` provenance entry stays, because it records the wave the component declared rather than instructing a controller.

The shape with no site here is a template or fragment declaring no resource — one contributing only `Parameters`, `Mappings`, `Conditions` or `Rules`. It carries no provenance, reaches the assembled stack with its own content intact, and the build emits a "skipped provenance injection" warning naming it. As with compose, that warning is expected for a contribution of that shape: the resources the same component contributes elsewhere carry the full set, and the emitted bytes are the same whether or not anything is listening.

### Per-Provider Artifact Semantics

*The per-provider semantics below describe how each provider integrates artifacts into its native output. The artifacts render path ships today.*

**helm provider:** artifacts are Kubernetes YAML documents written under a directory named for the component that declared them, inside the output directory holding the manifests rendered from the chart and synthesized from the Workload. The reason is the naming: a rendered or synthesized manifest is named by the provider from the component it belongs to, while an artifact is named by the key its author wrote, which says nothing about which component that is — so two components bound to one Recipe would write one path with neither author able to separate them. The directory is the component's own name, so the file the author reads back in the output is the name they wrote, one level down.

An operator who wants a different layout has the boundary's `subDirectory:` template, which moves **every** file a contributor emits rather than the artifacts alone. See [`../language-reference/path-template-variables.md`](../language-reference/path-template-variables.md).

**compose provider:** artifacts are compose fragments. Top-level keys (`services:`, `volumes:`, `configs:`) are merged into the per-boundary combined `docker-compose.yaml` during the boundary composition step.

**helm-chart provider (special case):** artifacts are not written to the output directory as standalone files — Helm owns the rendering pipeline. Instead, the helm-chart provider places each `artifacts:` entry inside the chart itself, and the entry's authored form decides where it lands. Every entry is Go-templated with Aggrega's pillar context FIRST, before any placement; from there the two forms diverge. An `$import:`-loaded entry is a pre-Helm template file: it is injected into the chart's `templates/` directory BEFORE Helm rendering, so Helm renders it alongside the sourced chart's own templates. An inline block scalar is a loose chart file: it is placed at the chart root under its authored key, carrying no `templates/` prefix and no merged provenance labels, so the chart's own templates can read it through Helm's `.Files.Get` / `.Files.Glob` — the ConfigMap-from-files pattern. This gives the helm-chart provider an extension mechanism equivalent to what `artifacts:` provides for the plain helm provider, while respecting Helm's chart model.

The injected file lands at `boundaries/<bp>/charts/<nodeID>/templates/<authored-key>` — a bundle's files nested beneath that key — so it sits alongside the sourced chart's templates and Helm picks it up during the downstream render pass. An inline block scalar lands at `boundaries/<bp>/charts/<nodeID>/<authored-key>` — the chart root, one level above `templates/` — because a file read through `.Files` must sit where the chart looks for it, and a file placed under `templates/` is rendered as a manifest instead. Both forms are named by the key they are authored under; what differs between them is the directory the provider places them in.

**helm-chart delimiter convention.** Aggrega's pre-template pass on helm-chart `$import:`-loaded artifact entries uses `[[ ]]` delimiters rather than the default `{{ }}` so Helm's own `{{ ... }}` syntax inside the file survives untouched into Helm's render pass. Authors write Aggrega-side substitutions as `[[ .context.instance_id ]]`, `[[ .values.name ]]`, etc.; Helm-side substitutions stay as `{{ .Values.x }}`, `{{ .Release.Name }}`, `{{- include "common.labels" . }}`, etc. Authors mixing the two delimiter pairs in one file is the supported authoring shape.

**Provenance and helm-chart artifacts.** Provenance is merged into `metadata.labels` and `metadata.annotations` (per the charset-split above) for `$import:`-loaded files that round-trip through YAML with their Helm tokens preserved — files using only `[[ ]]` Aggrega context or with Helm `{{ }}` only at quoted scalar positions. Files with structural Helm template actions (`{{- include ... }}`, `{{- if ... }}`, `{{- range ... }}`, `{{- with ... }}` at positions where they emit YAML structure rather than scalar leaves), or files with unquoted `{{ ... }}` at value positions, do not survive Aggrega's YAML round-trip; the build emits a "skipped provenance label injection" warning naming the artifact and passes the file through unchanged. **This warning is expected for any helm-chart `$import:`-loaded artifact file using structural Helm template actions or unquoted Helm value substitutions** — it is the common case in production Helm authoring, not the edge case. Authors who need provenance labels on such files inject them via the chart's `_helpers.tpl` `aggrega.commonLabels` template or equivalent Helm-side mechanism, not via Aggrega's pre-template injection.

**Chart-root filename collisions.** An `$import:`-loaded artifact whose authored key collides with a chart-root filename (`Chart.yaml`, `values.yaml`, `.helmignore`, etc.) is not detected by Aggrega's filename-collision check — the artifact lands at `templates/<authored-key>` while the chart-root file lands at the chart root, and the path-prefixing makes them distinct in Aggrega's view. Authors avoid these key names; the consequence of using them is that Helm sees both files (one at the chart root, one inside `templates/`) and may render the templates-side copy unexpectedly.

**terraform provider:** artifacts are Terraform configuration files, emitted verbatim into the component's own directory under the boundary's `modules/` tree. HCL (`main.tf`) is the ergonomic default and Terraform JSON (`.tf.json`) is accepted equivalently; neither is transpiled or reformatted. The boundary's root configuration declares that component as a `module` block whose `source` points at that directory, so a whole boundary stays one dependency graph; it is the same directory a vendored module's files occupy, so a Recipe declaring both `source:` and `artifacts:` writes them side by side. Provenance rides as a leading Terraform comment block; where a component contributes a JSON body, which has no comment syntax, every body is emitted unchanged and the provenance travels in a companion comment-only `.tf` file beside them, so the stamp is never duplicated across the two. See [the terraform provider page](../language-reference/providers/terraform.md#supported-input-kinds).

**cloudformation provider:** artifacts are stack fragments — the resources one component contributes rather than a whole template. The provider normalizes each fragment to pure-JSON long-form intrinsics and merges it into the single stack assembled for that output directory, where resources join one `Resources` map and the component's `provides` surface as stack `Outputs` under names scoped to the publishing component. Which of a fragment's other top-level sections survive the assembly is under [What a merged document carries from `artifacts:`](#what-a-merged-document-carries-from-artifacts). See [the cloudformation provider page](../language-reference/providers/cloudformation.md#fragment-recipes-assembled-into-a-stack).

### What Artifacts Is Not

Three structural distinctions:

**Not cross-provider within a single Recipe.** A Recipe declares exactly one `capability:` at the top of its `spec`. Everything the Recipe produces — source-rendered output, workload-synthesized output, and artifact emissions — is in that provider's native format. A helm Recipe's artifacts contain Kubernetes YAML. A compose Recipe's artifacts contain compose fragments. A Recipe targets one provider; every output is in that provider's native format.

Multi-provider composition happens at the Release level. Boundaries hold mixed-provider components; each provider's contributors at a boundary's evaluated path are dispatched and assembled per-(path, provider) independently. A Release with components targeting helm, helm-chart, and compose respectively can place all three in one boundary; the dispatch grouping partitions them per provider, each provider's contributors land in their own assembled output under the boundary's path, and the operator authors the cross-provider coordination via the boundary structure they choose. Cross-provider coordination is the Release author's responsibility.

**Not Recipes-in-Recipes.** Artifacts do not load or compose other Recipes. They are inline manifests (or file paths to inline manifests), templated with this Recipe's pillars, emitted to this Recipe's output. Recipe reuse happens through three mechanisms: `extends:` (inheritance of metadata and schemas, not of output files); the Manifest's flat-URI mapping (the same Component can resolve to different Recipes across catalogs — see [../language-reference/entities/manifest.md](../language-reference/entities/manifest.md)); and Features + FeatureRecipes (cross-cutting concerns attached orthogonally).

**Not a cross-Recipe glue layer.** Artifacts cannot reference names, resources, or state that the Recipe did not itself declare. A ConfigMap artifact referenced by the Recipe's Workload must be emitted by this Recipe. An artifact that expects an externally-provisioned Secret must get that Secret's name via the `.features` pillar — from the resolved `provides` of the attachment that emits it — not assume it exists. This is the self-containment invariant (above) stated from the artifact-authoring perspective: each Recipe emits files in one format, applied by one tool, into one boundary's output directory.

## Provider Capability Matrix

Each provider declares which input kinds it renders; a central input-kind gate accepts the supported combinations and rejects the rest with a uniform diagnostic when the node renders. Capability is a property of the provider, not the Recipe — a provider renders a subset of the three kinds. The `artifacts:` column distinguishes artifacts riding *alongside* a sourced/synthesized primary from a *standalone* artifacts-only Recipe (no `source:`, no `workload:`).

**Read each column on its own.** A row says which kinds a provider renders taken one at a time. It does not say that two ticked kinds may be declared together. Because the kinds compose by addition, each declared kind is dispatched and emitted separately, so a pair can be refused for a reason neither column carries — most often because both kinds produce a file under the same output name. Which combinations each provider actually accepts is stated in prose under [What each provider accepts, in full](#what-each-provider-accepts-in-full).

<!-- BEGIN GENERATED: provider-capability-matrix -->
| Provider | `source:` + `valuesMapping:` | `workload:` | `artifacts:` (alongside) | artifacts-only (standalone) |
| --- | --- | --- | --- | --- |
| helm | ✅ | ✅ | ✅ | ✅ |
| compose | ✅ | ✅ | ✅ | ✅ |
| helm-chart | ✅ | ❌ | ✅ templated with `[[` `]]` delimiters | ❌ |
| terraform | ✅ | ❌ | ✅ | ✅ |
| cloudformation | ✅ | ❌ | ✅ | ✅ |

*This grid covers the providers distributed with the compiler. A provider supplied separately declares the input kinds it accepts in the same way, and the compiler reads that declaration by the same route — it is not listed here, because a published page cannot enumerate providers it has never seen.*
<!-- END GENERATED: provider-capability-matrix -->

*Cells marked `✅` ship; `❌` is a provider-capability decline surfaced by the gate. The per-node compose fragments are merged per boundary today; a further Release-level cross-boundary merge is a future refinement.*

### What each provider accepts, in full

**`helm` — every combination.** `source:` + `valuesMapping:`, `workload:`, `artifacts:`, any two of them, or all three. It is the only provider distributed with the compiler that refuses no combination, and the reason is how it names output: each emitted file is named after the resource inside it, so a chart's rendered manifests and a synthesized Workload's manifests never land on one name. A Recipe declaring all three emits the chart's files, the Workload's files and the artifact files side by side in the boundary's output directory.

**`compose` — every combination except the two in which `source:` and `workload:` appear together.** Each kind on its own builds, and `artifacts:` rides alongside either one. `source:` with `workload:` cannot build, and neither can all three together; [Why `compose` cannot combine a source with a workload](#why-compose-cannot-combine-a-source-with-a-workload) says why, and it is not a capability decline.

**`helm-chart` — `source:` + `valuesMapping:`, alone or with `artifacts:` alongside. Nothing else.** It does not synthesize a `workload:`, and it has no artifacts-only form: a Recipe whose only input kind is `artifacts:` halts. The reason is where this provider puts an artifact — inside the component's own chart — so a Recipe with no `source:` leaves it no chart to put one in.

**`terraform` — three shapes:** `source:` + `valuesMapping:` on its own, `artifacts:` on its own, or the two together. It does not synthesize a `workload:`.

**`cloudformation` — the same three shapes as `terraform`, with the same single exclusion.** `source:` + `valuesMapping:` on its own, `artifacts:` on its own, or the two together; no `workload:`.

#### What a declined input kind looks like

A Recipe that declares an input kind its bound provider does not render halts the build when the node renders, and it halts whatever else the Recipe declares alongside that kind — pairing a `workload:` with a `source:` the provider *can* render does not carry the workload through. The halt names the provider, the kind it cannot render, and the kinds it does render:

```
[CATALOG_ERROR E0265] unit
  provider does not support the node's input kind (node "unit"). provider "terraform" does not support synthesized recipes (this provider supports: sourced, artifacts-only); declare one of the supported input kinds, or target a provider that supports synthesized
```

The artifacts-only decline reads the same way and names that form: `provider "helm-chart" does not support artifacts-only recipes (this provider supports: sourced)`. `E0265` is the identifier to record when this halt needs naming durably — in a continuous-integration gate, an issue, or a runbook; [the table of every condition](../language-reference/errors/sentinels.md#every-condition-by-short-code) resolves it.

### Why `compose` cannot combine a source with a workload

The compose provider produces one fragment per component and names that fragment after the component. Sourced rendering and Workload synthesis each produce that component's fragment under that one name, so a Recipe declaring both produces two files called the same thing, and the build halts on the collision:

```
[CATALOG_ERROR E0211] unit
  rendering node "unit"
  caused by: [CATALOG_ERROR] aggregate.yaml at .spec.components.unit
    filename collision across input kinds: two input-kind blocks produced a file under one output name (output name "unit.compose-fragment.yaml", produced by "source, workload")
```

The fragment's name comes from the component's own identifier and there is no authoring surface for it, so no change to the Recipe's own content avoids the collision. The halt is a property of the *pair* rather than of either kind — compose renders a source, and compose synthesizes a Workload, and the grid is right to tick both. To use both shapes for one component under compose, split them across two components, or fold the source's content into the Workload.

### What a merged document carries from `artifacts:`

Two providers merge their contributors into a single document per assembly path: `compose` into one `docker-compose.yaml`, `cloudformation` into one stack template. A merged document can only carry the sections its assembler models, so an `artifacts:` tick says where a fragment's content is *placed* and not that every key inside the fragment survives.

**`compose` carries `services:`, `volumes:` and `configs:` from an artifact fragment, and those three only.** Anything else a fragment declares at the top level is dropped without a warning — `networks:`, because networks are derived per boundary rather than accumulated from contributors, and equally a `secrets:` block, a top-level `name:`, or an `x-`-prefixed extension key. [The compose provider page](../language-reference/providers/compose.md#artifacts-emitted-compose-fragments) gives the per-key merge rules and the alternative for cross-network routing.

**`cloudformation` carries `Resources`, `Outputs`, `Parameters`, `Mappings`, `Conditions`, `Metadata` and `Rules`.** `Description` and `Transform` are not carried, and unlike compose the build says so: each raises an unsupported-field warning naming the section and the component, so nothing is dropped silently. The warning is advisory — the emitted template is byte-for-byte what it would be without it, and `--no-unsupported-field-warnings` silences the class. `Outputs` is carried under a name the provider scopes to the contributing component, so two components contributing an output of the same name to one stack keep them apart. [Top-level sections in the assembled stack](../language-reference/providers/cloudformation.md#top-level-sections-in-the-assembled-stack) accounts for every section one by one.

The other three providers do not merge, so no artifact key is at risk of being dropped by an assembler. `helm` assembles nothing: each component's manifests reach the boundary's output directory as themselves. `terraform` and `helm-chart` *nest* — each component's files land in a directory of their own, a Terraform module directory or a subchart, and a root document at the boundary references them — so an artifact entry is placed as a whole file rather than read into a shared document. Where a `helm-chart` artifact entry lands, and why its delimiter pair differs, is under [Per-Provider Artifact Semantics](#per-provider-artifact-semantics).
