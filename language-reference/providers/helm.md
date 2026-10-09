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
3. The overlay is coalesced with the chart's `values.yaml` defaults; overlay keys win on collision (Helm's standard `helm install --values` semantics).
4. The Helm SDK renders the chart's templates against the merged values.
5. Aggrega injects its provenance metadata into the rendered manifests via post-render YAML rewriting, ensuring sourced output carries the same labelling as workload-mode output. Charset-safe values become labels (`app.kubernetes.io/name`, `aggrega.ai/component-id`, and — when set — `aggrega.ai/aggregate-name`, `aggrega.ai/compiler-version`, `aggrega.ai/environment`); values a Kubernetes label cannot represent become annotations (`aggrega.ai/recipe-uri`, `aggrega.ai/boundary-path`, `aggrega.ai/sync-wave`).
6. Output files land flat in the Recipe's output directory, one per rendered resource, named `<name-basis>-<kind>[-<namespace>]-<name>.yaml` — the same basis the release name below is derived from, followed by the resource's own kind, namespace where it has one, and name, each lowercased with every run of other characters reduced to a single hyphen. For an ordinary component that basis is the component's own identity, which is also what the resource's `aggrega.ai/component-id` label carries; for a chart a Feature attachment's author supplied it stays the host component's, while the label carries the attachment's own identity. A document carrying no kind or no name is named for its template path instead. The chart's directory layout is flattened: there is no `templates/` subdirectory in the rendered output, and two templates in different subdirectories that share a filename stay two files because the name comes from the resource rather than from the template. A file the Recipe's `artifacts:` block names does not land here: it sits one directory down, under a directory named for the component that declared it, because such a file is named by the key its author wrote rather than by the resource it carries — so without that directory two components bound to one Recipe would write one path, with neither author able to separate them.

The namespace the chart renders against is read from the `aggrega.ai/namespace` annotation cascading from the boundary and reaches the chart as its release namespace; when no boundary declares one, the chart renders against `default`. Whether a rendered resource then carries `metadata.namespace` is the chart's own decision: a chart whose template writes the field emits it, and a chart that omits the field emits a resource with no namespace, placed by whatever the applying tool selects.

### How the release name is derived

A sourced chart renders against a release name, which reaches every template as `.Release.Name`. Charts routinely name resources after it, so a release name is an identity inside the cluster rather than a label on the build.

The release name is the encoded form of the same basis the rendered resource's output filename is prefixed with, so the two are one name written twice. That basis is an `instance_id` for an ordinary component, and the composed identity a Feature attached to a **boundary** carries. For a chart a Feature attachment's author supplied it is the **host component's** name: the chart's own templates render against the release name, so deriving it from the attachment instead would rename resources the chart declares, in a cluster where they are already deployed. Those resources still carry the attachment's own identity in their `aggrega.ai/component-id` label — what a resource is called and what it belongs to are separate questions here, and only for an ordinary component do they have the same answer. A Helm release name accepts a narrower set of characters than an identity may carry: lowercase letters, digits, hyphens and dots, beginning and ending with a lowercase letter or a digit, up to 53 characters. Rather than substitute for a character the target does not accept, the derivation writes it out, so two component identities differing only in punctuation or in case always arrive at two release names.

- A lowercase letter and a digit are carried through exactly as authored.
- A hyphen is kept as authored wherever the character after it is carried through directly and is not a lowercase `z`. A hyphen followed by a lowercase `z` opens an escape, so an authored one in that position is itself written out — `api-zone` becomes `api-zhzone`, which is what lets any name be read back without guessing. A hyphen with nothing after it is written out for the same reason, so `db-` gives `db-zh`.
- Every other character is written as `-z` followed by a letter naming it: `d` for a dot, `u` for an underscore, `s` for a path separator, `h` for a hyphen the rule above does not keep. Anything else — an uppercase letter included — is written as `x` and the character's six-digit hexadecimal code point, and a byte that begins no character at all as `b` and its own two-digit value.
- An empty value is written `-ze`, which no non-empty value can produce.

A dot is written out rather than carried through, even though Helm accepts one in a release name, because Helm requires a lowercase letter or a digit on each side of a dot and the derivation places hyphens of its own.

Because two Features attached to one component both render against that component's release name, two charts that each name a resource after `.Release.Name` emit two resources with one name. This provider reports the name every resource its own rendering produces carries, scoped to that resource's kind and namespace, and the build refuses two contributors landing on one of them rather than emitting output where applying both leaves only the last — see [`../errors/fatal-halts.md`](../errors/fatal-halts.md) "The same name is derived more than once inside the output". The fix is to compose the name, and which coordinate it needs depends on the arrangement. Two attachments on one component already share the host, so it is the attachment that has to reach the template: pass `.attachment_name` into the chart through the FeatureRecipe's `valuesMapping:` and set it on whichever of the chart's own values its resource names are built from. One chart attached to two components is the other way round — the release name already differs per host, so a resource named after `.Release.Name` carries a name of its own on each of them while a literal name does not. A FeatureRecipe delivering its resources through `artifacts:` is reported on the same terms: this provider reads the name each emitted document carries whether that document came from a chart template or from an artifacts body, so a literal name in such a body attached to two components halts too. An artifacts body is a template, so compose the name from `.context.rendered_name` — the host's release name, which differs per host and is spelled in the characters a Kubernetes name allows — and `.attachment_name` where it has to be distinct per host; on a host that places an artifact set alone, which reports no release name, compose it from `.context.instance_id` instead. Not every name is reported, so a build that does not halt has not compared everything its output will eventually carry. The one you are most likely to meet writing a chart is a resource declaring `generateName`, which is left for the cluster to complete and so has nothing yet to compare. The page linked above carries the full set.

So an `instance_id` of `api` gives the release name `api`, `data.main-db` gives `data-zdmain-db`, and `db_host` gives `db-zuhost`. An identity built only from lowercase letters, digits and hyphens the derivation keeps appears exactly as authored. Identical input always produces the identical name.

Two of Helm's conditions are properties of the basis rather than of the derivation: a release name has to begin with a lowercase letter or a digit, and it has to be at most 53 characters. A basis whose first character is written out begins its name with the hyphen every escape opens with, and one carrying characters that are written out encodes longer than it was authored. **The build asks this provider about both, and acts on the answer at build time** rather than leaving the refusal to the cluster at apply time — see [`../errors/fatal-halts.md`](../errors/fatal-halts.md) "The target will not accept a name derived from an authored identity". What it does with the answer depends on who wrote the basis. A name you wrote is refused rather than altered, and the refusal names the field you wrote and the budget you have; a name Aggrega composed is shortened until this provider accepts it.

The cluster holds the resources named after a component to one rule stricter than Helm's: a Service name has to begin with a letter, while a release name may begin with a digit. A chart routinely names its Services after the release name, and a synthesized workload's Services open with it too, so this provider also refuses a component name beginning with a digit, reporting it as a `Service name` the target cannot use. No length repairs a first character, so that refusal states none. So begin an `instance_id` with a lowercase letter, and keep it short enough that its encoded form still fits.

**Changing the basis a release name is derived from renames the cluster resources a chart names after `.Release.Name`, and every resource this provider synthesizes for the component, and Kubernetes does not rename a resource in place.** The applying tool creates the resource under its new name and removes the one under the old name, which for stateful resources means the storage bound to the old name is released. Treat such a change as a replacement to be planned — drained, migrated, or scheduled — rather than as an update to be rolled out.

## Workload (synthesized) mode

A Recipe with `workload:` (inline or `$import:`-loaded) synthesizes Kubernetes resources from the Workload's abstract intent. The Workload schema is documented at [entities/workload.md](../entities/workload.md); this section covers what the helm provider emits.

For each node:

- One **controller object** chosen by the Workload's `form`: `stateless` (and the default) emits a **Deployment**, `stateful` a **StatefulSet**, `daemon` a **DaemonSet**, `task` a **Job**, `scheduled` a **CronJob** whose `spec.schedule` is the Workload's `schedule` field (a 5-field cron expression or an `@` macro); a `scheduled` workload with no schedule, or a malformed one, halts loudly. The Deployment and StatefulSet carry the replica count; DaemonSet, Job, and CronJob carry none. A `stateful` Workload requires exactly one `type: Headless` Service declared in the Workload to govern the StatefulSet; the provider wires the StatefulSet's `serviceName` to that Service's rendered name, and the build halts if no headless Service is declared (or if more than one is). A `persistentTemplate` volume is a companion of `form: stateful` — declaring one on any other form halts with a message naming the fix.
- One **Service** per declared `services:` entry on the Workload, exposing the named ports the service spec lists.
- One **PersistentVolumeClaim** per `persistent` volume, sized and shaped from the volume's spec. A `persistentTemplate` volume emits no standalone claim: it becomes a `volumeClaimTemplates` entry inside the StatefulSet's own spec, which is why it is a companion of `form: stateful`.

**Resource names.** Every resource this mode emits for a component is named after the component's release name — the same name a sourced chart renders against, derived as [How the release name is derived](#how-the-release-name-is-derived) sets out — and the provider reports that name to the build as `{{ .context.rendered_name }}`. The controller object carries the release name itself; each Service is `<release name>-<service key>`; each standalone claim is `<release name>-<volume>`, and the pod's volume references exactly that claim; a secret delivered as a file is mounted from a pod volume named `<release name>-secret-<slot>`; a StatefulSet's `serviceName` is the name of the headless Service it emits; and a Workload exposed only by external name emits one Service carrying the release name. So a component `api` emits a Deployment `api` and a `default` Service `api-default`, and a component `my_api` emits `my-zuapi` and `my-zuapi-default` — names the cluster accepts, where the identity as written would not be. A Recipe publishing the address of one of those Services builds it from `{{ .context.rendered_name }}`, as [`../templates/rendered-resource-names.md`](../templates/rendered-resource-names.md) shows; for a component whose name carries no underscore and no capital letter the release name equals its `instance_id`, so its names read exactly as the identity does. A workload a Feature attachment synthesizes is the one exception: it is named after the attachment's own composed identity — the value its `aggrega.ai/component-id` label carries — because the attachment renders against its host component, and a release name derived there would name the attachment's workload after the host and collide with the host's own.

Each emitted resource carries the full Aggrega provenance labels and annotations plus a selector pair (`app: <instance_id>`) wired between the Deployment/StatefulSet and its Services. A label value admits the identity as written, so the selector keeps it while the names above take the release name. Container names in the rendered Deployment are the Workload's container keys with `.` and `_` characters replaced by `-` (Kubernetes name-sanitisation).

**Port transport.** A container port that declares a transport emits it verbatim as `protocol:` on the rendered `containerPort`, and every Service port naming that container port carries the same value — the transport is declared once, on the container port, so the exposure cannot disagree with it. A port that declares no transport emits no `protocol` key on either resource, leaving the cluster's default in force. All three values the Workload admits (`TCP`, `UDP`, `SCTP`) are emitted verbatim; helm needs no degradation, since Kubernetes expresses each of them directly.

**Running on the node's network.** A Workload declaring `hostNetwork: true` emits `hostNetwork: true` on the rendered pod spec, so the pod runs in the node's own network namespace and the ports its containers open are reachable on the node's addresses. Kubernetes expresses the choice directly, so nothing is degraded. The declaration reaches the pod spec and nothing else: it adds, removes and rewrites no port, and the emitted Services are identical with and without it. A Workload that does not declare it emits no `hostNetwork` key at all.

**Resource quantities.** Every quantity the provider copies into the manifests is emitted verbatim, and each is checked first against the quantity form set out in [Workload → Resource quantities](../entities/workload.md#resource-quantities): each container's and init container's `resources.requests` and `resources.limits` values — `cpu`, `memory` and every extended resource such as `nvidia.com/gpu` — and each volume's `ephemeral.sizeLimit`, `persistent.size` and `persistentTemplate.size`. The check runs on the Workload as the Recipe's templates evaluated it, so a value that arrived through `infra` or a Release parameter is judged on what it rendered to. A value outside the form halts the build with a `TRANSLATION_ERROR` naming the node, the field's path in the Workload and the value — for example `containers.main.resources.requests.cpu: "lots" is not a quantity: it does not begin with a number` — where the chart would otherwise build cleanly and be refused by the cluster at install. A `cpu`, `memory` or `sizeLimit` left empty is omitted from the manifests and so not checked; an extended-resource value or a persistent size left empty would still be emitted, so it is refused. The check judges form only: whether the cluster can schedule the amount is not something the provider can know at build time.

Output file naming has two shapes. The controller object is named for the release name and its kind — `<release name>-deployment.yaml`, `<release name>-statefulset.yaml`, `<release name>-daemonset.yaml`, `<release name>-job.yaml`, `<release name>-cronjob.yaml`. A per-resource file is named for the resource it carries, with the kind last: `<release name>-<svcName>-service.yaml` and `<release name>-<volName>-pvc.yaml`, each taken from that resource's own `metadata.name` per the synthesized-name convention at [entities/workload.md](../entities/workload.md). A Workload exposed only by external name emits `<release name>-service.yaml`, there being no service key to carry.

## Render facts

Beside the files it renders, this provider reports four **render facts** about every node: what the Kubernetes documents it emitted say about their pods, their selectors, their ports and the namespace each is emitted into. A FeatureRecipe attached to the component reads the component's own facts at [`.context.render_facts`](../templates/template-context-contract.md#what-a-provider-reported-about-a-render--contextrender_facts); one that sets [`readsCallerRenderFacts: true`](../entities/featurerecipe.md#rendering-after-the-callers--specreadscallerrenderfacts) also reads, on each entry of `.context.used_by`, the facts of a component connecting to its host. That is how a Feature can name the pods of the components that call its host — a network policy admitting exactly those, for instance — from what their renders actually emitted, without anyone restating a label by hand. The names and the entries below are this provider's contract.

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
- **Entries can come from the component's own render and from its Features' renders.** One component can be rendered by more than one call — a chart and an `artifacts:` placement, say — and the lists one name gets from those calls are joined into one, in the order the calls ran. On `.context.used_by`, a connecting component's facts also join what the Features attached to it rendered, after its own; `.context.render_facts` carries the component's own render only.
- **In the order emitted.** Entries follow the order the render emitted the resources. A label map is a keyed map like every other on the context, so a template ranging one meets its keys in key order.
- **What a document leaves out, its entry leaves out.** A resource named by `generateName` has no `name`; a resource writing no `metadata.namespace` has no `namespace`, and neither has one writing it empty or null, which names no namespace either; a controller written without `matchLabels` — a Job relying on the selector the cluster generates — has no `match_labels`; a Service without a selector has no `selector`; a port without a name or a protocol has neither. Any other part written empty is reported empty. `protocol` is reported only where the document writes one, so a template that needs it writes the cluster's own default, `TCP`, itself. `container_port` is a number wherever the document writes one.
- **`namespace` is the one the document writes, never a guess.** It is the resource's own `metadata.namespace` — for a pod template, that of the resource carrying it, which is where its pods run; a namespace written inside the pod template itself is not read. A synthesized Workload writes the namespace its boundary declares on every resource it emits, so its entries carry that namespace. A chart's entries carry what its templates write: the release namespace where they project it (see the namespace cascade under [Provider-specific quirks](#provider-specific-quirks)), a namespace of their own where they pin one, and nothing where they write none. Where nothing is written the entry carries no `namespace` rather than the boundary's or the cluster's default, because such a resource lands wherever the tool applying the output places it, which is not known when the build runs. A template tells the two apart with [`optional`](../templates/sprig-functions.md#optional--presence-aware-fallback): `{{ optional . "namespace" "" }}` is empty exactly where the document wrote none, so a Feature placing something beside a component's pods can tell a component whose pods' namespace is known from one whose is not.
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

- **Provenance injection.** The sourced and synthesized paths converge on the same label-and-annotation set; sourced renders inject them via post-render YAML rewriting (after the Helm SDK has already rendered), so chart authors do not need to thread Aggrega labels through their own templates.
- **Ordered env emission.** Kubernetes environment variables are an ordered list (later entries can `$(VAR)`-reference earlier ones); the provider emits them in author order from the OrderedMap-backed `environment` map. Authoring environment-variable order matters for correctness.
- **Namespace cascade — the two modes reach the resource differently.** Both read `aggrega.ai/namespace` from the boundary annotation cascade, and neither invents a namespace when no boundary declares one. In synthesized mode the provider writes `metadata.namespace` directly, and omits the field entirely when the cascade yields no value. In sourced mode the provider supplies the value as the chart's release namespace — `default` when the cascade yields none — and the chart's own template decides whether to project it. A sourced resource therefore carries the namespace only where its chart writes the field. A chart Recipe in the standard-library catalog follows the release namespace, so a chart that writes the field places its resources in the declared namespace, and in `default` where no boundary declares one, where synthesized output writes none; a chart that does not write it places them in no namespace, and they land where the tool applying the manifests puts them. The local charts the standard-library FeatureRecipes carry read the cascade value directly through their `valuesMapping` instead: doing so lets them omit the field when no boundary declares a namespace, matching synthesized output, which the release namespace alone cannot express because it is never empty.

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
