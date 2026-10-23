# Helm Provider

The helm provider produces flat rendered Kubernetes YAML for GitOps consumers (ArgoCD, Flux). The provider assembles per-`(path, provider)`: every helm-targeted node's rendered YAML is routed to the assembler keyed on the boundary's evaluated `directory:` joined with the per-component `subDirectory:`, and that assembler emits one YAML file per Kubernetes resource. Downstream tooling diffs and applies the files directly without a Helm install step.

Each emitted Kubernetes resource carries the boundary's `syncWave: <integer>` value as the `argocd.argoproj.io/sync-wave: "<N>"` annotation; Helm hooks additionally carry `helm.sh/hook-weight: "<N>"`. ArgoCD, Flux, and Helm read these annotations natively and order resource application accordingly.

This page is the helm provider's authoring reference. For the cross-provider input-composition model, see [architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md). For current shipping-state classifications, see [Status of the Language → Providers](../10-status.md#providers).

## Supported input kinds

The helm provider accepts all three of the Recipe input kinds in different roles:

- **Sourced mode.** A Recipe with `source: <chart-path>` points at an on-disk Helm chart directory. The Helm Go SDK loads the chart, the base-rendering values dictionary is coalesced with the chart's defaults, and the chart's templates render to flat Kubernetes YAML.
- **Workload (synthesized) mode.** A Recipe with `workload:` (inline or `$import:`-loaded) declares a Workload document. The provider synthesizes one or more Kubernetes resources per node — a Deployment (or StatefulSet) plus per-service Services and per-persistent-volume PVCs — directly from the Workload spec.
- **Artifacts-only mode.** A Recipe with `artifacts:` and neither `source:` nor `workload:` emits the manifests its author wrote, with the build's provenance labels and annotations spliced into each resource's own metadata.

The three combine: a Recipe may declare a chart, a Workload and `artifacts:` together, and each renders and emits on its own, side by side in the node's output — see [What each provider accepts, in full](../../architecture/16-recipe-input-composition.md#what-each-provider-accepts-in-full).

## `source:` keyset

The helm provider's `source:` names a chart, and it accepts both of the shapes the `source:` field takes: a **bare filesystem path string**, and a **structured object** whose `url:` carries the location. Wherever that location is a filesystem path, it is anchored to the directory holding the `recipe.yaml` that declares it, not to the directory the build is invoked from, and it must stay inside that directory: one that climbs out of it, or an absolute one, is refused, because every file a publication of the Recipe carries is taken from its directory — see [`entities/recipe.md`](../entities/recipe.md) "Content paths stay inside the Recipe's own directory". A chart named this way is published with the Recipe, every file under it that the ignore rules recorded when the Recipe was pinned keep — the helm provider leaves out the version-control directories and the hidden files under the chart's `templates/`, and honours the chart's own `.helmignore`, and the author's `.aggregaignore` has the last word, as [Which files ship with an entity](../cli/aggrega-pin.md#which-files-ship-with-an-entity) describes — while a file beside the Recipe that nothing it declares names is not. The render reads the same files the publication carries, so a chart renders alike from your directory and from a registry. The shape you wrote it in does not change that: a structured `source:` whose `url:` is `./charts/api-server` is anchored exactly as the bare string `./charts/api-server` is.

```yaml
spec:
  capability: helm
  source: ./charts/api-server     # filesystem path to a chart directory
  valuesMapping: |
    image: "{{ .values.image }}"
    replicas: {{ optional .infra `replicas` 2 }}
```

A structured `source:` says the same thing with named fields, and what its `url:` carries decides whether anything is fetched. Where `url:` carries a transport scheme — `oci://…` for an OCI chart, an `https://….tgz` for a direct chart archive, or an `https://` repo root paired with `chart:` — the chart is fetched: the kind comes from the URL scheme or from an explicit `kind:`, `aggrega pull` fetches and pins the chart in the lockfile, and the build extracts it from the cache. Where `url:` names a filesystem path, nothing is fetched and nothing is pinned — the chart is read from disk, anchored exactly as the bare-string form above.

```yaml
spec:
  capability: helm
  source:
    kind: helm-oci-chart
    url: ./charts/api-server       # a path, so nothing is fetched and nothing is pinned
    version: "1.0.0"
```

Only `url:` decides where a chart is read from. The other fields select what would be fetched, so for a path they select nothing — they still reach the Recipe's own templates as `.source.*`.

Vendoring a chart locally is supported as an alternative to fetching, and is not required. The schema accepts an open structured object, so a provider Wasm plugin can later validate provider-declared source keys (e.g. a `registry` + `chart` pair) — `planned`.

The chart at the source path must contain a valid `Chart.yaml`. Sourced renders that fail to load the chart surface the underlying Helm SDK error verbatim. An empty `source: ""` is not a helm matter: it names neither sourceless nor sourced mode, so the refusal it earns is the same whichever provider the Recipe targets, and it comes before any chart is loaded and before this provider is dispatched. Which command reports that refusal — and which reports something else first — is set out in [`entities/recipe.md`](../entities/recipe.md) "Source field scheme inventory" and [`errors/fatal-halts.md`](../errors/fatal-halts.md) "Recipe `source:` is an empty string".

## Sourced mode

A Recipe with `source: <chart-path>` and `valuesMapping:` runs the following pipeline at base rendering:

1. The chart at `<chart-path>` is loaded via the Helm Go SDK.
2. The `valuesMapping` template evaluates against the Recipe's TemplateContext. Its YAML output is treated as a **values overlay** for the chart.
3. The overlay is coalesced with the chart's `values.yaml` defaults, once; overlay keys win on collision (Helm's standard `helm install --values` semantics). A key the overlay sets to `null` removes the chart's default for it — at the top level, inside a table, or in a dependency's values — as `helm install --values` does, so the chart's templates read the key as absent; a `null` at a key the chart gives no default reaches the templates as `null`.
4. The Helm SDK renders the chart's templates against the merged values.
5. Aggrega injects its provenance metadata into the rendered manifests via post-render YAML rewriting, ensuring sourced output carries the same labelling as workload-mode output. Charset-safe values become labels (`app.kubernetes.io/name`, `aggrega.ai/component-id`, and — when set — `aggrega.ai/aggregate-name`, `aggrega.ai/compiler-version`, `aggrega.ai/environment`); values a Kubernetes label cannot represent become annotations (`aggrega.ai/recipe-uri`, `aggrega.ai/boundary-path`, `aggrega.ai/sync-wave`).
6. Output files land flat in the Recipe's output directory, one per rendered resource, named `<name-basis>-<kind>[-<namespace>]-<name>.yaml` — the same basis the release name below is derived from, followed by the resource's own kind, namespace where it has one, and name, each lowercased with every run of other characters reduced to a single hyphen. For an ordinary component that basis is the component's own identity, which is also what the resource's `aggrega.ai/component-id` label carries; for a chart a Feature attachment's author supplied it stays the host component's, while the label carries the attachment's own identity. A document carrying no kind or no name is named for its template path instead. The chart's directory layout is flattened: there is no `templates/` subdirectory in the rendered output, and two templates in different subdirectories that share a filename stay two files because the name comes from the resource rather than from the template. A file the Recipe's `artifacts:` block names does not land here: it sits one directory down, under a directory named for the component that declared it, because such a file is named by the key its author wrote rather than by the resource it carries — so without that directory two components bound to one Recipe would write one path, with neither author able to separate them.

The namespace the chart renders against is read from the `aggrega.ai/namespace` annotation cascading from the boundary and reaches the chart as its release namespace; when no boundary declares one, the chart renders against `default`. Where a boundary declares one, every **namespaced** resource the chart renders without a namespace — no `metadata.namespace`, or one written empty or null — is emitted in the declared namespace, which is where installing the chart with Helm under that release namespace puts it, and its file is named with the namespace segment exactly as a resource whose template writes the field. A resource whose template writes a namespace keeps it, whichever namespace it names. A **cluster-scoped** resource stays without one. Whether a kind is namespaced is the Kubernetes API's own scope for a kind the API serves itself, and for a custom kind the `scope` a `CustomResourceDefinition` in the same render declares for it — from the chart's templates or from its `crds/` directory. A resource of a kind neither of those classifies is left as the chart wrote it, and the build reports it, once per kind, naming the kind and its API group; so does a `kind: List` document, whose items are not placed. Where no boundary declares a namespace, nothing is placed and nothing is reported: a resource the chart writes without a namespace is emitted without one, placed by whatever the applying tool selects.

The report is a warning on the build, which still completes:

```text
  warning: node "store" (provider "helm"): resources of kind "Probe" in API group "monitoring.example.org" write no namespace and are left without one rather than placed in namespace "shop": the kind is not one the Kubernetes API serves itself, and no CustomResourceDefinition in this chart's render gives it a single scope, so whether it is namespaced is not known when the build runs, and they land wherever the tool applying the output places them
```

Where the chart has a value that renders the kind's `CustomResourceDefinition`, or one that writes the namespace itself, setting it through the Recipe's `valuesMapping` places such a resource.

### The Kubernetes version a chart is rendered for

A chart's templates read the Kubernetes version they are rendered for as `.Capabilities.KubeVersion`, and many choose an API version, a field or a whole mechanism by it — a service-account token projected from 1.21 on, say, and a first-party one below. The build has no cluster to ask, so the version is one you state, where the Release says where a component deploys: the `aggrega.ai/kubernetes-version` annotation on a boundary, or on a component, where it wins over its boundary's, cascading exactly as `aggrega.ai/namespace` does.

```yaml
spec:
  boundaries:
    production:
      annotations:
        aggrega.ai/kubernetes-version: "1.31"
      components:
        api: {}
        legacy:
          annotations:
            aggrega.ai/kubernetes-version: "1.28"   # this component deploys to an older cluster
```

The value is read the way `helm template --kube-version` reads its flag, so it accepts the forms that flag accepts and a chart reads exactly what that flag would give it: `"1.31"` reads as `v1.31`, `"v1.31.2"` as `v1.31.2`, and text after the numbers stays in `.Capabilities.KubeVersion.Version` as written — `"1.29.3-gke.100"` reads as `v1.29.3-gke.100` — while `.Capabilities.KubeVersion` printed whole reads the version without it. A chart comparing `.Capabilities.KubeVersion.Version` with `semverCompare` reads such a suffix as a pre-release, so a constraint without a `-0` floor, such as `">=1.21"`, does not match it, and a value carrying surrounding space reads with that space — `" 1.30 "` reads as `"v 1.30 "` — and fails such a comparison outright: write the bare version where a chart compares it. A value that is not a version — `"one.two"`, `"latest"`, a single number — halts the build under the condition for a value a plugin has no representation for, naming the value, the component and its boundary; the chart is never rendered for some other version in its place. See [A Kubernetes version the helm provider cannot render a chart for](../errors/fatal-halts.md#a-kubernetes-version-the-helm-provider-cannot-render-a-chart-for). An empty value is treated as unset.

Where no annotation names a version, a chart renders for the version the stock `helm template` of the same helm release renders for, which is the version of the Kubernetes client library the provider is built with: a provider built against client library v0.37 renders for Kubernetes v1.37.0. So a chart renders in Aggrega as its own authors' `helm template` renders it, and the default moves only when the client library the provider is built with moves. Name the version of the cluster you deploy to whenever it differs: a chart rendered for a newer version than the cluster runs can emit an API version that cluster does not serve.

Only the version is set this way. Every other capability a chart reads — `.Capabilities.APIVersions` and `.Capabilities.HelmVersion` — is the helm library's built-in one, so an API a cluster serves from an installed `CustomResourceDefinition` is not reported to the chart. A chart's own `kubeVersion` range in its `Chart.yaml` is not compared with the version: `helm template` refuses a chart whose range excludes the version it renders for, and the build renders it. The annotation shapes a chart rendered from source and nothing else: a synthesized Workload and an `artifacts:` body read no `.Capabilities`, and the [`helm-chart`](helm-chart.md) provider hands its chart on unrendered, to be rendered when it is installed.

**Leaving rendered documents out.** This provider honours the [`omits:`](../entities/recipe.md#the-omits-field--leaving-rendered-documents-out-of-a-source) entries a Recipe or a FeatureRecipe declares, in this mode and in no other: a synthesized Workload and an `artifacts:` body render without them. Every document the chart renders — from a template or from a file of its `crds/` directory — is matched against each entry that applies to the build, and a document any entry names is left out. An entry names a document by the words the document itself carries, the same words its output filename and its render facts are built from: its `kind`, its `metadata.name` and, only where the entry names one, the namespace the document is in — the one its template writes, or the boundary's declared namespace where this provider places the document as described above. It is never the namespace the chart merely renders against: with no namespace declared the chart renders against `default`, yet a document whose template writes no namespace is in none, so an entry naming `default` does not match it. A document carrying no kind or no name matches no entry. The documents left out are rendered and then dropped once every file's name is settled, so each document kept is named and written exactly as it would be without the entries, and a document left out reaches nothing the build does afterwards — no file, no name in the comparison that refuses two contributors landing on one, no render fact a Feature reads, nothing a pipeline step is handed. The provider reports how many documents each entry matched, and an entry that matched none stops the build; see [An omits entry left out nothing the source rendered](../errors/fatal-halts.md#an-omits-entry-left-out-nothing-the-source-rendered).

### The Helm release a chart renders under

The provider renders with the Helm 4 SDK, at v4.3, so a chart reads what Helm 4's own `helm template` gives it, and the same chart and values render the same bytes on every build. A chart written and checked against Helm 3 can observe these Helm 4 behaviours:

- **`.Capabilities.HelmVersion`** reports Helm 4's version, `v4.3`.
- **The default Kubernetes version** is v1.37.0, because Helm 4 at v4.3 is built against client library v0.37, and `.Capabilities.APIVersions` is that client library's set of API versions. Name the version your cluster runs, as [The Kubernetes version a chart is rendered for](#the-kubernetes-version-a-chart-is-rendered-for) describes.
- **A `null` chart default is dropped.** A key the chart's `values.yaml` sets to `null` — at the top level or inside a table — is absent from `.Values` unless the values the Recipe supplies set it, so `hasKey` reports it missing, `toYaml` leaves it out, and the chart's `values.schema.json` is checked against the values without it.
- **A block scalar keeps its final line break before `---`.** A document that ends in a block scalar and is followed by another document from the same template keeps that scalar's last line break, so it is written `|` rather than `|-`.
- **`.Chart` is a map keyed by field name.** `.Chart.Name`, `.Chart.Version`, `.Chart.AppVersion` and the other fields read as before, but `toYaml .Chart` or `toJson .Chart.Maintainers` print the keys as `Name`, `AppVersion` and so on, with empty fields present, and a field the chart's metadata does not carry reads as empty rather than failing the render.
- **`.Capabilities.KubeVersion.Version` keeps a version's text as written**, as described above for the `aggrega.ai/kubernetes-version` annotation.
- **A `values.yaml` holding several YAML documents** is read whole, later documents merged over earlier ones.
- **`.Files.Lines` of an empty file** returns no lines rather than failing the render.
- **Helm 4's added template functions** — `mustToYaml`, `mustToJson`, `mustToToml`, `mustToDuration` and the `duration…` conversions — are available to a chart's templates.
- **A dependency aliased twice** gives each alias its own copy of that dependency's own dependencies.
- **Values-schema validation** accepts or refuses differently only at the edges: a quoted email local part, `NaN` and infinite numbers, a number compared with a non-number in `enum` and `const`, and the location reported for a failing `propertyNames`, `contentSchema` or later array item.

A template the engine itself fails to execute — a value read through a missing table, say — is reported in Helm 4's form: the template's file, line and column on a line of their own, then what was being executed and the message, indented, for each template the failure passed through. A chart's own `fail` or `required` keeps its one-line `execution error at (<file>:<line>:<col>): <message>` form, and so does an error a template function returns.

### How the release name is derived

A sourced chart renders against a release name, which reaches every template as `.Release.Name`. Charts routinely name resources after it, so a release name is an identity inside the cluster rather than a label on the build.

The release name is the encoded form of the same basis the rendered resource's output filename is prefixed with, so the two are one name written twice. That basis is an `instance_id` for an ordinary component, and the composed identity a Feature attached to a **boundary** carries. For a chart a Feature attachment's author supplied it is the **host component's** name: the chart's own templates render against the release name, so deriving it from the attachment instead would rename resources the chart declares, in a cluster where they are already deployed. Those resources still carry the attachment's own identity in their `aggrega.ai/component-id` label — what a resource is called and what it belongs to are separate questions here, and only for an ordinary component do they have the same answer. A Helm release name accepts a narrower set of characters than an identity may carry: lowercase letters, digits, hyphens and dots, beginning and ending with a lowercase letter or a digit, up to 53 characters. Rather than substitute for a character the target does not accept, the derivation writes it out, so two component identities differing only in punctuation or in case always arrive at two release names.

- A lowercase letter and a digit are carried through exactly as authored.
- A hyphen is kept as authored wherever the character after it is carried through directly and is not a lowercase `z`. A hyphen followed by a lowercase `z` opens an escape, so an authored one in that position is itself written out — `api-zone` becomes `api-zhzone`, which is what lets any name be read back without guessing. A hyphen with nothing after it is written out for the same reason, so `db-` gives `db-zh`.
- Every other character is written as `-z` followed by a letter naming it: `d` for a dot, `u` for an underscore, `s` for a path separator, `h` for a hyphen the rule above does not keep. Anything else — an uppercase letter included — is written as `x` and the character's six-digit hexadecimal code point, and a byte that begins no character at all as `b` and its own two-digit value.
- An empty value is written `-ze`, which no non-empty value can produce.

A dot is written out rather than carried through, even though Helm accepts one in a release name, because Helm requires a lowercase letter or a digit on each side of a dot and the derivation places hyphens of its own.

Because two Features attached to one component both render against that component's release name, two charts that each name a resource after `.Release.Name` emit two resources with one name. This provider reports the name every resource its own rendering produces carries, scoped to that resource's kind and, for a kind the cluster keeps in a namespace, to its namespace, and the build refuses two contributors landing on one of them rather than emitting output where applying both leaves only the last — see [`../errors/fatal-halts.md`](../errors/fatal-halts.md) "The same name is derived more than once inside the output". A kind the cluster keeps outside every namespace — a `ClusterRole`, a `CustomResourceDefinition`, or a custom kind a `CustomResourceDefinition` in the same render declares with the scope `Cluster` — is scoped to its kind alone, classified exactly as the namespace placement above classifies it, so two components of one output each writing one such object under one name are refused even where the Release places them in different namespaces. The fix is to compose the name, and which coordinate it needs depends on the arrangement. Two attachments on one component already share the host, so it is the attachment that has to reach the template: pass `.attachment_name` into the chart through the FeatureRecipe's `valuesMapping:` and set it on whichever of the chart's own values its resource names are built from. One chart attached to two components is the other way round — the release name already differs per host, so a resource named after `.Release.Name` carries a name of its own on each of them while a literal name does not. A FeatureRecipe delivering its resources through `artifacts:` is reported on the same terms: this provider reads the name each emitted document carries whether that document came from a chart template or from an artifacts body, so a literal name in such a body attached to two components halts too. An artifacts body is a template, so compose the name from `.context.rendered_name` — the host's release name, which differs per host and is spelled in the characters a Kubernetes name allows — and `.attachment_name` where it has to be distinct per host; on a host that places an artifact set alone, which reports no release name, compose it from `.context.instance_id` instead. Not every name is reported, so a build that does not halt has not compared everything its output will eventually carry. The one you are most likely to meet writing a chart is a resource declaring `generateName`, which is left for the cluster to complete and so has nothing yet to compare. The page linked above carries the full set.

So an `instance_id` of `api` gives the release name `api`, `data.main-db` gives `data-zdmain-db`, and `db_host` gives `db-zuhost`. An identity built only from lowercase letters, digits and hyphens the derivation keeps appears exactly as authored. Identical input always produces the identical name.

Two of Helm's conditions are properties of the basis rather than of the derivation: a release name has to begin with a lowercase letter or a digit, and it has to be at most 53 characters. A basis whose first character is written out begins its name with the hyphen every escape opens with, and one carrying characters that are written out encodes longer than it was authored. **The build asks this provider about both, and acts on the answer at build time** rather than leaving the refusal to the cluster at apply time — see [`../errors/fatal-halts.md`](../errors/fatal-halts.md) "The target will not accept a name derived from an authored identity". What it does with the answer depends on who wrote the basis. A name you wrote is refused rather than altered, and the refusal names the field you wrote and the budget you have; a name Aggrega composed is shortened until this provider accepts it.

The cluster holds the resources named after a component to one rule stricter than Helm's: a Service name has to begin with a letter, while a release name may begin with a digit. A chart routinely names its Services after the release name, and a synthesized workload's Services open with it too, so this provider also refuses a component name beginning with a digit, reporting it as a `Service name` the target cannot use. No length repairs a first character, so that refusal states none. So begin an `instance_id` with a lowercase letter, and keep it short enough that its encoded form still fits.

**Changing the basis a release name is derived from renames the cluster resources a chart names after `.Release.Name`, and every resource this provider synthesizes for the component, and Kubernetes does not rename a resource in place.** The applying tool creates the resource under its new name and removes the one under the old name, which for stateful resources means the storage bound to the old name is released. Treat such a change as a replacement to be planned — drained, migrated, or scheduled — rather than as an update to be rolled out.

## Workload (synthesized) mode

A Recipe with `workload:` (inline or `$import:`-loaded) synthesizes Kubernetes resources from the Workload's abstract intent. The Workload schema is documented at [entities/workload.md](../entities/workload.md); this section covers what the helm provider emits.

For each node:

- One **controller object** chosen by the Workload's `form`: `stateless` (and the default) emits a **Deployment**, `stateful` a **StatefulSet**, `daemon` a **DaemonSet**, `task` a **Job**, `scheduled` a **CronJob** whose `spec.schedule` is the Workload's `schedule` field (a 5-field cron expression or an `@` macro); a `scheduled` workload with no schedule, or a malformed one, halts loudly. The Deployment and StatefulSet carry the replica count; DaemonSet, Job, and CronJob carry none. A `stateful` Workload requires exactly one `type: Headless` Service declared in the Workload to govern the StatefulSet; the provider wires the StatefulSet's `serviceName` to that Service's rendered name, and the build halts if no headless Service is declared (or if more than one is). A `persistentTemplate` volume is a companion of `form: stateful` — declaring one on any other form halts with a message naming the fix.
- One **Service** per declared `services:` entry on the Workload, exposing the named ports the service spec lists. The entry's `type` becomes the Service's type — `ClusterIP`, `NodePort` and `LoadBalancer` verbatim, and `Headless` as a `ClusterIP` Service with `clusterIP: None`. A `Loopback` entry halts the build instead, naming the node and the service: a Kubernetes Service has no type that binds to a host's loopback address, and which node addresses a `NodePort` Service listens on is a setting of the whole cluster, so the entry is refused rather than rendered with a reach it did not ask for. See [A service type the helm provider cannot render](../errors/fatal-halts.md#a-service-type-the-helm-provider-cannot-render).
- One **PersistentVolumeClaim** per `persistent` volume, sized and shaped from the volume's spec. A `persistentTemplate` volume emits no standalone claim: it becomes a `volumeClaimTemplates` entry inside the StatefulSet's own spec, which is why it is a companion of `form: stateful`.

**Resource names.** Every resource this mode emits for a component is named after the component's release name — the same name a sourced chart renders against, derived as [How the release name is derived](#how-the-release-name-is-derived) sets out — and the provider reports that name to the build as `{{ .context.rendered_name }}`. The controller object carries the release name itself; each Service is `<release name>-<service key>`; each standalone claim is `<release name>-<volume>`, and the pod's volume references exactly that claim; a secret delivered as a file is mounted from a pod volume named `<release name>-secret-<slot>`, with the slot written in the alphabet the cluster accepts, the way the release name is — so a slot `server_certificate` is mounted from `<release name>-secret-server-zucertificate`, and a slot read through a connection has the dot after the connection's name written the same way; a StatefulSet's `serviceName` is the name of the headless Service it emits; and a Workload exposed only by external name emits one Service carrying the release name. So a component `api` emits a Deployment `api` and a `default` Service `api-default`, and a component `my_api` emits `my-zuapi` and `my-zuapi-default` — names the cluster accepts, where the identity as written would not be. A Recipe publishing the address of one of those Services builds it from `{{ .context.rendered_name }}`, as [`../templates/rendered-resource-names.md`](../templates/rendered-resource-names.md) shows; for a component whose name carries no underscore and no capital letter the release name equals its `instance_id`, so its names read exactly as the identity does. A workload a Feature attachment synthesizes is the one exception: it is named after the attachment's own composed identity — the value its `aggrega.ai/component-id` label carries — because the attachment renders against its host component, and a release name derived there would name the attachment's workload after the host and collide with the host's own. That identity never carries a capital letter: a capital in the host's name or in the attachment's is written out as an escape, as every other character a resource name refuses is, so an attachment `worker` on a component `myApi` emits a Deployment `cfr--my-zx000041pi--worker` and a `default` Service `cfr--my-zx000041pi--worker-default`, and each name the workload carries is one the cluster accepts.

Each emitted resource carries the full Aggrega provenance labels and annotations plus a selector pair (`app: <instance_id>`) wired between the Deployment/StatefulSet and its Services. A label value admits the identity as written, so the selector keeps it while the names above take the release name. Container names in the rendered Deployment are the Workload's container keys with `.` and `_` characters replaced by `-` (Kubernetes name-sanitisation).

**Port transport.** A container port that declares a transport emits it verbatim as `protocol:` on the rendered `containerPort`, and every Service port naming that container port carries the same value — the transport is declared once, on the container port, so the exposure cannot disagree with it. A port that declares no transport emits no `protocol` key on either resource, leaving the cluster's default in force. All three values the Workload admits (`TCP`, `UDP`, `SCTP`) are emitted verbatim; helm needs no degradation, since Kubernetes expresses each of them directly.

**Running on the node's network.** A Workload declaring `hostNetwork: true` emits `hostNetwork: true` on the rendered pod spec, so the pod runs in the node's own network namespace and the ports its containers open are reachable on the node's addresses. Kubernetes expresses the choice directly, so nothing is degraded. The declaration reaches the pod spec and nothing else: it adds, removes and rewrites no port, and the emitted Services are identical with and without it. A Workload that does not declare it emits no `hostNetwork` key at all.

**Resource quantities.** Every quantity the provider copies into the manifests is emitted verbatim, and each is checked first against the quantity form set out in [Workload → Resource quantities](../entities/workload.md#resource-quantities): each container's and init container's `resources.requests` and `resources.limits` values — `cpu`, `memory` and every extended resource such as `nvidia.com/gpu` — and each volume's `ephemeral.sizeLimit`, `persistent.size` and `persistentTemplate.size`. The check runs on the Workload as the Recipe's templates evaluated it, so a value that arrived through `infra` or a Release parameter is judged on what it rendered to. A value outside the form halts the build with a `TRANSLATION_ERROR` naming the node, the field's path in the Workload and the value — for example `containers.main.resources.requests.cpu: "lots" is not a quantity: it does not begin with a number` — where the chart would otherwise build cleanly and be refused by the cluster at install. A `cpu`, `memory` or `sizeLimit` left empty is omitted from the manifests and so not checked; an extended-resource value or a persistent size left empty would still be emitted, so it is refused. The check judges form only: whether the cluster can schedule the amount is not something the provider can know at build time.

Output file naming has two shapes. The controller object is named for the release name and its kind — `<release name>-deployment.yaml`, `<release name>-statefulset.yaml`, `<release name>-daemonset.yaml`, `<release name>-job.yaml`, `<release name>-cronjob.yaml`. A per-resource file is named for the resource it carries, with the kind last: `<release name>-<svcName>-service.yaml` and `<release name>-<volName>-pvc.yaml`, each taken from that resource's own `metadata.name` per the synthesized-name convention at [entities/workload.md](../entities/workload.md). A Workload exposed only by external name emits `<release name>-service.yaml`, there being no service key to carry.

## Render facts

Beside the files it renders, this provider reports four **render facts** about every node: what the Kubernetes documents it emitted say about their pods, their selectors, their ports and the namespace each is emitted into. A FeatureRecipe attached to the component reads the component's own facts at [`.context.render_facts`](../templates/template-context-contract.md#what-a-provider-reported-about-a-render--contextrender_facts); one that sets [`readsCallerRenderFacts: true`](../entities/featurerecipe.md#rendering-after-the-callers--specreadscallerrenderfacts) also reads, on each entry of `.context.used_by`, the facts of a component connecting to its host, and one that sets [`readsTargetRenderFacts: true`](../entities/featurerecipe.md#rendering-after-the-targets--specreadstargetrenderfacts) reads, on each entry of `.context.uses`, the facts of a component its host is wired to. That is how a Feature can name the pods of the components that call its host, or of the components its host reaches — a network policy admitting exactly those, for instance — from what their renders actually emitted, without anyone restating a label by hand. The names and the entries below are this provider's contract.

| Fact | One entry per | Each entry carries |
| --- | --- | --- |
| `pod_template_labels` | pod template emitted: a Deployment's, StatefulSet's, DaemonSet's, ReplicaSet's or Job's `spec.template`, a CronJob's job template, and a bare Pod, which is its own | `kind`, `name` and `namespace` of the resource carrying the template; `labels`, the template's labels |
| `controller_selectors` | Deployment, StatefulSet, DaemonSet, ReplicaSet, Job and CronJob emitted | `kind`, `name`, `namespace`; `match_labels`, its selector's `matchLabels` |
| `service_selectors` | Service emitted | `name`, `namespace`; `selector`, the labels it sends traffic to |
| `container_ports` | container of a pod template that declares a `ports` list, init containers included | `kind`, `name` and `namespace` of the resource carrying the template; `container`, the container's name; `ports`, one entry per port with its `name`, `container_port` and `protocol` |

How the facts read:

- **Every fact is a list.** A template always ranges over a fact, even when it holds one entry; there is no single value to read on its own.
- **All four, on every render.** Each is reported whenever this provider renders a node, as an empty list when the render emitted nothing it describes — a component whose chart emits only a ConfigMap reports four empty lists. Another provider's render reports none of these names, and a name nobody reported reads as nothing.
- **Read from what was emitted, on every path.** The facts come from the documents the render emitted, whichever mode produced them: a chart's rendered manifests, a synthesized Workload's, and the manifests an author placed through `artifacts:`, which report exactly what those manifests carry. They are read in the same pass, over the same documents, as the resource names this provider reports for the build's duplicate-name check. A resource's own provenance labels are part of what it carries, so a bare Pod's `labels` include them; a chart's or an artifact's pod template keeps the labels its author wrote.
- **Entries can come from the component's own render and from its Features' renders.** One component can be rendered by more than one call — a chart and an `artifacts:` placement, say — and the lists one name gets from those calls are joined into one, in the order the calls ran. On `.context.used_by` and `.context.uses`, the facts of the component at the other end of a connection also join what the Features attached to it rendered, after its own; `.context.render_facts` carries the component's own render only.
- **In the order emitted.** Entries follow the order the render emitted the resources. A label map is a keyed map like every other on the context, so a template ranging one meets its keys in key order.
- **What a document leaves out, its entry leaves out.** A resource named by `generateName` has no `name`; a resource writing no `metadata.namespace` has no `namespace`, and neither has one writing it empty or null, which names no namespace either; a controller written without `matchLabels` — a Job relying on the selector the cluster generates — has no `match_labels`; a Service without a selector has no `selector`; a port without a name or a protocol has neither. Any other part written empty is reported empty. `protocol` is reported only where the document writes one, so a template that needs it writes the cluster's own default, `TCP`, itself. `container_port` is a number wherever the document writes one.
- **`namespace` is the one the document writes, never a guess.** It is the resource's own `metadata.namespace` — for a pod template, that of the resource carrying it, which is where its pods run; a namespace written inside the pod template itself is not read. A synthesized Workload writes the namespace its boundary declares on every resource it emits, so its entries carry that namespace. A chart's entries carry what its emitted documents write: where a boundary declares a namespace, that namespace — whether the chart's templates project it or the provider places the resource in it (see [Sourced mode](#sourced-mode)) — unless a template pins one of its own, which the entry carries instead; where none is declared, the release namespace, `default`, where the templates project it, and nothing where they write none. Where nothing is written the entry carries no `namespace` rather than the boundary's or the cluster's default, because such a resource lands wherever the tool applying the output places it, which is not known when the build runs. A template tells the two apart with [`optional`](../templates/sprig-functions.md#optional--presence-aware-fallback): `{{ optional . "namespace" "" }}` is empty exactly where the document wrote none, so a Feature placing something beside a component's pods can tell a component whose pods' namespace is known from one whose is not.
- **Recognised by kind and API group.** `Pod` and `Service` are read in the core group, the four controllers in `apps`, `Job` and `CronJob` in `batch`, at any version of the group. A custom resource of another group that happens to carry one of these kind names is not read as one. A selector's `matchExpressions` are not reported, and neither is a resource wrapped inside a `kind: List` document or a value written through a YAML merge key.

**What the facts cannot see.** They describe the documents the build emits, and nothing the cluster creates later. The pods a controller creates at runtime from a custom resource — an operator's database cluster, say — appear in no emitted document, so they are absent by construction; so is any label a mutating admission controller adds when the manifests are applied. A Feature that must admit such pods takes their labels from the custom resource's own documentation, as an author would without these facts.

A FeatureRecipe admitting into its host's pods exactly the pods of the components that call it, selecting its host's own pods by the host's controller selector:

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: FeatureRecipe
metadata:
  name: admit-callers
  version: 1.0.0
spec:
  capability: helm
  implements: example/admit-callers:1.0.0
  readsCallerRenderFacts: true
  artifacts:
    allow-callers.yaml: |
      apiVersion: networking.k8s.io/v1
      kind: NetworkPolicy
      metadata:
        name: {{ .context.rendered_name }}-allow-callers
      spec:
        podSelector:
          matchLabels:
          {{- range .context.render_facts.controller_selectors }}
          {{- range $k, $v := .match_labels }}
            {{ $k }}: {{ toJson $v }}
          {{- end }}
          {{- end }}
        policyTypes:
          - Ingress
        ingress:
          - from:
          {{- range .context.used_by }}
          {{- range .render_facts.pod_template_labels }}
              - podSelector:
                  matchLabels:
                  {{- range $k, $v := .labels }}
                    {{ $k }}: {{ toJson $v }}
                  {{- end }}
          {{- end }}
          {{- end }}
```

For a host `api` called by a component `web` whose Workload this provider synthesized, the policy selects `app: "api"` and admits a `podSelector` carrying every label of `web`'s pod template — the same labels its emitted Deployment's `spec.template.metadata.labels` holds. Because the FeatureRecipe sets the key, its attachment renders once every component has rendered, so the facts are there whichever of `api` and `web` the build reaches first; without the key, a template reading `render_facts` on `.context.used_by` halts the build before anything renders.

A `podSelector` in a policy's `from` matches pods in the policy's own namespace, so the policy above admits callers emitted into the namespace it is applied in. A caller whose entries carry another `namespace` is admitted by pairing its `podSelector` with a `namespaceSelector` on that namespace's `kubernetes.io/metadata.name` label, which Kubernetes sets on every namespace.

## Provider-specific quirks

- **Chart downloads use Helm's built-in handlers only.** A chart fetched from a Helm repository is downloaded with Helm's own built-in `http` and `https` handlers. A Helm downloader plugin — one installed for the `helm` command, or one sitting in the directory the build runs from — is never consulted, so what is in that directory cannot change how a chart is fetched.
- **Provenance injection.** The sourced and synthesized paths converge on the same label-and-annotation set; sourced renders inject them via post-render YAML rewriting (after the Helm SDK has already rendered), so chart authors do not need to thread Aggrega labels through their own templates.
- **Environment order — Secret-read entries first.** A synthesized container's `env` list carries two kinds of entry: each `attachments` entry delivered `as: env` reads its value from a Secret through `valueFrom.secretKeyRef`, and each `variables` entry carries a plain `value`. The provider writes every Secret-read entry first and every plain variable after them, each kind in the order it is authored, and lists `envFrom` sources separately under `envFrom`. Kubernetes expands a `$(NAME)` reference in an `env` value from the entries listed before it in the same container, never from one listed after it, so this order lets a plain variable compose a Secret-read value by reference while the secret itself stays in the Secret:

  ```yaml
  containers:
    api:
      image: "api:1.0"
      variables:
        DATABASE_URL: "postgres://app:$(DB_PASSWORD)@db:5432/app"
      attachments:
        DB_PASSWORD: { from: db-credentials, as: env }
  ```

  The rendered container lists `DB_PASSWORD` ahead of `DATABASE_URL`, so the process receives the URL with the password in place. A variable may also reference any variable authored before it, which keeps authored order meaningful within `variables`. Init containers follow the same order. A container that gives one name both as a `variables` entry and as an `attachments` entry delivered `as: env` halts the build rather than writing both entries, because this order alone would then decide which value the process sees (see [A container gives one environment variable two values](../errors/fatal-halts.md#a-container-gives-one-environment-variable-two-values)).
- **Namespace cascade — the two modes reach the resource differently.** Both read `aggrega.ai/namespace` from the boundary annotation cascade, and neither invents a namespace when no boundary declares one. In synthesized mode the provider writes `metadata.namespace` directly, and omits the field entirely when the cascade yields no value. In sourced mode the provider supplies the value as the chart's release namespace — `default` when the cascade yields none — and the chart's own template decides whether to project it; where a namespace is declared, the provider then writes it into every namespaced resource the chart rendered without one (see [Sourced mode](#sourced-mode)). So with a namespace declared both modes place every namespaced resource in it — a namespace a chart pins itself, and a kind the provider cannot classify, aside. With none declared they part: a chart that projects the release namespace places its resources in `default`, where synthesized output writes none, and a chart that writes no namespace places them in none, so they land where the tool applying the manifests puts them. The local charts the standard-library FeatureRecipes carry read the cascade value directly through their `valuesMapping` instead: doing so lets them omit the field when no boundary declares a namespace, matching synthesized output, which the release namespace alone cannot express because it is never empty.

## Worked examples

**Sourced mode — Recipe pointing at a vendored chart:**

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Recipe
metadata:
  name: api-server-helm
  version: 1.0.0
spec:
  capability: helm
  implements: core/api-server
  source: ./vendor/charts/api-server
  valuesMapping: |
    image: "{{ .values.image }}"
    replicaCount: {{ optional .infra `replicas` 2 }}
    service:
      type: ClusterIP
      port: {{ .values.port }}
    env:
      LOG_LEVEL: "{{ optional .values `log_level` "info" }}"
```

**Workload mode — Recipe declaring an inline Workload:**

```yaml
apiVersion: aggrega.ai/v1alpha1
kind: Recipe
metadata:
  name: api-server-workload
  version: 1.0.0
spec:
  capability: helm
  implements: core/api-server
  workload: |
    apiVersion: aggrega.ai/v1alpha1
    kind: Workload
    replicas: {{ optional .infra `replicas` 2 }}
    containers:
      api:
        image: "{{ .values.image }}"
        ports:
          web: {{ .values.port }}
    services:
      svc:
        type: ClusterIP
        ports:
          web: {{ .values.port }}
```

## Cross-references

- [`entities/recipe.md`](../entities/recipe.md) — Recipe authoring surface and the three input kinds.
- [`entities/workload.md`](../entities/workload.md) — Workload schema for synthesized mode.
- [`providers/helm-chart.md`](helm-chart.md) — sister provider that emits a Helm chart scaffold rather than flat manifests.
- [`providers/well-known-annotations.md`](well-known-annotations.md) — well-known annotations the helm provider applies (`aggrega.ai/namespace`, etc.).
- [`architecture/16-recipe-input-composition.md`](../../architecture/16-recipe-input-composition.md) — cross-provider Provider Capability Matrix.
- [`10-status.md#providers`](../10-status.md#providers) — current readiness classification.
