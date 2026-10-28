# Helm-Chart Provider

The helm-chart provider produces a packaged Helm umbrella chart per assembly path. Where the [helm provider](helm.md) emits flat Kubernetes YAML for direct GitOps consumption, helm-chart emits a chart scaffold — an umbrella `Chart.yaml` + `values.yaml` plus one sub-chart per contributing node — that downstream tooling can install via `helm install` or vendor for further per-environment customisation. The provider assembles per-`(path, provider)`: every node bound to a helm-chart Recipe contributes to the umbrella at the boundary's evaluated `directory:` joined with the per-component `subDirectory:`. Two boundaries that evaluate to the same path collapse into one merged umbrella chart that lists every contributor as a sub-chart dependency.

A sub-chart's templates copied from the source chart carry what their author wrote: the boundary's `syncWave: <integer>` value, the `helm.sh/hook-weight` on a hook and the Aggrega provenance labels reach them only where the chart writes them. The [helm provider](helm.md) is the one that stamps `argocd.argoproj.io/sync-wave: "<N>"`, `helm.sh/hook-weight: "<N>"` and the provenance labels onto every resource it renders. An `$import:`-loaded artifact this provider adds to a sub-chart carries the provenance labels and the `argocd.argoproj.io/sync-wave` annotation, and no `helm.sh/hook-weight` (see "`artifacts:` injection rule" below). ArgoCD reads the sync-wave annotation, and Helm reads a hook's weight.

This page is the helm-chart provider's authoring reference. For the helm vs helm-chart split, see the [Providers](../10-status.md#providers) section of the Status page; for the cross-provider input-composition model, see [architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md).

## Supported input kinds

The helm-chart provider accepts two input kinds:

- **Sourced mode.** A Recipe with `source: <chart-path>` points at an on-disk Helm chart directory. The chart is copied into the umbrella structure as a sub-chart, verbatim except for the chart's own `name` — see ["The chart name the umbrella owns"](#the-chart-name-the-umbrella-owns); no rendering or templating is performed at the per-node level. Aggrega's role is composition (umbrella assembly across the boundary's nodes), not template evaluation.
- **`$import:`-loaded `artifacts:` mode.** A Recipe with `artifacts:` entries authored as `$import:` per-entry declares additional template files that the helm-chart provider injects into the sub-chart's `templates/` directory after the source-chart copy. Each file is pre-templated against Aggrega's template context using `[[ ]]` delimiters (see "`artifacts:` injection rule" below) so any `{{ }}` Helm templating in the same file survives into the downstream `helm install` render.

A Recipe targeting helm-chart that declares `workload:` is rejected before it renders, with the refusal any provider gives for an input kind it does not declare — it names the kind this provider supports and points the author at a provider that synthesizes:

> provider does not support the node's input kind (node "api"). provider "helm-chart" does not support synthesized recipes (this provider supports: sourced); declare one of the supported input kinds, or target a provider that supports synthesized

The split is deliberate: workload synthesis (translating an abstract Workload into Kubernetes resources) is the helm provider's exclusive concern. helm-chart's role is umbrella + sub-chart composition for charts the author has already produced.

A Recipe targeting helm-chart may also declare **inline-content `artifacts:` entries** (entries whose value is a block scalar carrying the file body inline in the Recipe rather than an `$import:`-loaded reference). An inline-content entry is placed at the sub-chart root under its authored key — no `templates/` prefix and no provenance splice. A chart's own templates read such a loose file through Helm's `.Files.Get` / `.Files.Glob` (the canonical ConfigMap-from-files pattern), so a chart-root file is a legitimate, first-class shape rather than an error.

**Both forms are evaluated with the `[[ ]]` Aggrega delimiters before placement**, so a body of either form may read the Recipe's pillar context; `{{ }}` in either body is left untouched and becomes a Helm directive at downstream `helm install` time. What differs between the forms is where the file lands and whether provenance is merged into it:

- An **`$import:`-loaded entry** is a template file: after evaluation (see "`artifacts:` injection rule" below) it is injected into the sub-chart's `templates/` directory with provenance merged in, so Helm renders it as a manifest alongside the chart's own templates.
- An **inline-content entry** is a loose data file: after evaluation it lands at the chart root, unchanged from what the evaluation produced and carrying no merged provenance, for `.Files`-based consumption.

## `artifacts:` injection rule

When a helm-chart Recipe declares `artifacts:` entries via per-entry `$import:`, each `$import:` value is a path to a template file resolved **relative to the Recipe's own directory** (the directory containing the Recipe YAML on disk). The provider:

1. Reads each file's content.
2. Pre-templates the content with Aggrega delimiters `[[ ]]` against the Recipe's template context (the same context the Recipe's `valuesMapping:` evaluates against). `{{ }}` inside the file content is left untouched — those become Helm template directives at `helm install` time.
3. Writes each file to `charts/<instance-id>/templates/<authored-key>` under the umbrella's assembly path, a bundle's files nested beneath that key. The key the entry is authored under names the file; the `$import:` path selects its content and contributes nothing to the name, so the directory structure within that path never reaches the output.

The `[[ ]]` / `{{ }}` dual-delimiter discipline is the load-bearing detail. A typical `$import:`-loaded artifact file might mix Aggrega-time interpolation (e.g., `[[ .values.image ]]`) with Helm-time interpolation (e.g., `{{ .Release.Namespace }}`). Each delimiter pair fires at its own phase: Aggrega resolves `[[ ]]` at compile time before the file lands; Helm resolves `{{ }}` at install time after the umbrella ships.

Filename collisions across the source-chart's templates and the `$import:`-loaded artifact injections raise `CATALOG_ERROR` — the diagnostic names the colliding output path, such as `templates/cm.yaml`, and the two input kinds that produced it. Authors resolve the collision by renaming the artifact's key or the chart's own template.

## `source:` keyset

The helm-chart provider's `source:` names a chart, and it accepts both of the shapes the `source:` field takes, read exactly as the [helm provider's `source:` keyset](helm.md#source-keyset) describes: a **bare filesystem path string**, and a **structured object** whose `url:` carries the location. Where `url:` names a filesystem path, nothing is fetched and the chart is read from disk; where it carries a transport scheme — `oci://…`, for instance, with `kind: helm-oci-chart` — `aggrega pull` fetches and pins the chart, and the build copies it out of the cache into the umbrella as a sub-chart, on the same terms as a chart read from disk.

```yaml
spec:
  capability: helm-chart
  source: ./charts/api-server     # filesystem path to a chart directory
  valuesMapping: |
    image: "{{ .values.image }}"
    replicaCount: {{ optional .infra `replicas` 2 }}
```

The chart at the source path **must contain a valid `Chart.yaml`** at its root; missing it surfaces a clear error before the copy runs. The chart's directory layout is preserved when copied — `templates/`, `values.yaml`, `Chart.yaml`, and any other files are present in the sub-chart directory after composition. Every file arrives with the bytes you wrote, down to comments, key order and quoting; the single exception is the `name` field of the chart's own `Chart.yaml`, which the umbrella sets — see ["The chart name the umbrella owns"](#the-chart-name-the-umbrella-owns).

Both ways of failing to name a chart are refused, and the two refusals come from
different places — worth knowing, because only one of them changes if you switch
capability. A `source:` that is **present and yet declares nothing** is refused by
the compiler before any provider runs, so the outcome is the same whichever
capability the Recipe names; the diagnostic tells you to omit the field for
sourceless mode or name a non-empty path. **Omitting `source:` altogether** is
legal authoring — it is how a Recipe asks for sourceless mode — and it is refused
here because **helm-chart declares only the sourced input kind**, so the compiler
refuses the combination with the same message it gives for any capability asked
for an input kind it does not declare. What is helm-chart's own is the declaration, not
a refusal of its own: for Kubernetes resources generated from a `workload:` block,
use the `helm` capability instead.

**A Recipe declaring `omits:` is refused.** The [`omits:`](../entities/recipe.md#the-omits-field--leaving-rendered-documents-out-of-a-source)
key leaves documents a source renders out of the build, and this provider renders no
document at build time: it copies the chart into the umbrella, and the chart's
templates render when the umbrella is installed. With nothing rendered there is
nothing to leave out, so this provider does not declare that it honours the key, and
a Recipe or FeatureRecipe declaring it is refused before anything is copied — see
[The provider does not support omits](../errors/fatal-halts.md#the-provider-does-not-support-omits).
For a chart you keep beside the Recipe, a line in the `.aggregaignore` there leaves a
file of the chart out instead, from the next time the Recipe is pinned; for a fetched
chart whose output must lose a document, render it through the `helm` provider, which
honours the key.

## Path-keyed composition — the umbrella shape

The provider runs in two phases per assembly path:

1. **Per-contributor copy.** For each node bound to a helm-chart Recipe, the provider copies the source chart's full directory tree into a sub-chart slot. Files land flat in the per-contributor output map; the assembler names `charts` as the sub-directory its contributors sit under, and the orchestrator gives each contributor a directory of its own there when assembling the umbrella — `charts/<instance_id>/` for a component. A Feature attachment is a contributor too — whether it vendors a chart or renders manifests through the helm provider — and gets a directory beside the component's rather than inside it; see ["Where an attachment's chart lands"](#where-an-attachments-chart-lands).
2. **Per-`(path, provider)` umbrella assembly.** Once all per-node copies for the path complete, the assembler emits an umbrella `Chart.yaml` + `values.yaml` at the assembly path's root. The umbrella declares one dependency per contributing node and routes per-node values under instance-id-keyed sub-blocks. When the assembly path receives contributors from more than one boundary (boundaries with shared `directory:`), every contributor lands as a dependency in the same umbrella.

The umbrella `Chart.yaml` has the shape:

```yaml
apiVersion: v2
name: <effective-chart-name>                # see "Chart-name resolution" below
version: 0.1.0
description: Aggrega umbrella chart for boundary "<assembly-path>"
dependencies:
  - name: <encoded-instance-id>               # the name the placed sub-chart carries
    version: <user-chart-version>           # from the source chart's Chart.yaml
    alias: <encoded-instance-id>              # see "How a name is derived" below
    repository: file://charts/<instance_id>    # the sub-chart's own directory
```

### Chart-name resolution

The umbrella's chart `name` is resolved through the boundary annotation cascade. Each contributing boundary's effective `aggrega.ai/chart-name` annotation (the cascade-resolved value, walking up the boundary tree) determines the umbrella name; the resolved value is encoded for the chart-name position exactly as any other identity is, so a value carrying only letters, digits, underscores and hyphens the rule below keeps reaches the chart verbatim. When the assembly path receives contributors from more than one boundary, every contributor's effective `aggrega.ai/chart-name` MUST resolve to the same value; mismatches halt the build with a diagnostic naming the conflicting values and the contributing boundaries.

The cascade resolves the DRY tension naturally: declare `aggrega.ai/chart-name` once on the parent boundary and child boundaries inherit it through the cascade; sibling boundaries with no common parent must declare matching values explicitly. Boundaries with no `aggrega.ai/chart-name` declared anywhere in their cascade fall back to the aggregate name and the assembly path — the umbrella's output directory under `dist/`, such as `boundaries/data/helm-chart` — each encoded and joined as described below.

Each dependency entry's `name` is the name the placed sub-chart carries — the component instance's own encoded identity, the same value as the `alias` — for the reasons in ["The chart name the umbrella owns"](#the-chart-name-the-umbrella-owns). Its `version` is still the version from the source chart's own `Chart.yaml`. The alias scopes the sub-chart's values under `values.yaml.<alias>.*`, matching Helm's umbrella-values convention so per-instance values propagate correctly when the umbrella is installed.

A component's sub-chart directory keeps the instance_id exactly as authored, so `charts/<instance_id>/` is where its files land and what the dependency's `repository` points at. Two instances of the same source chart therefore coexist without a filesystem collision, and each keeps its own values block under its own alias.

**The dependency's `name` and its `repository` are different strings, and that is by design.** `name` is what the chart at that location DECLARES, because Helm binds a dependency to a child chart by the child's own declared name; `repository` is where that chart sits. For a component the two happen to read alike, since both derive from the same instance id. For a Feature attachment they differ — the declared name carries the attachment's composed identity while the directory carries its two coordinates joined — so reading either as the other names something that is not there.

### Where an attachment's chart lands

A Feature attachment that vendors a chart gets a directory of its own **beside** the component it is attached to, one level under `charts/`:

```
charts/
├── api/                    # the component's own chart
├── api--guardrail/         # a Feature attached to `api` under `guardrail`
└── api--audit/             # a second Feature attached to the same component
```

A Feature attached to a **boundary** rather than to a component has no host component to name, so its directory is its instance name alone: `charts/aux/`.

**Why beside rather than inside.** Helm discovers a child chart at `charts/*` — one level, not a recursive walk. A chart placed deeper than that is not a child of anything; it is data inside another child's directory, reachable only through `.Files`. So a chart placed inside the component's own chart directory would be copied into the output, would make the build succeed, and would contribute none of its resources to what you deploy — with nothing reporting it. Placing each contributor at its own top-level directory is what makes the attachment's resources render.

The umbrella also declares the attachment as one of its dependencies. Both halves are needed: a chart present under `charts/` and absent from `dependencies:` is a lint error, and a chart declared in `dependencies:` with no matching child chart present makes the umbrella refuse to load.

**The two coordinates are joined, not concatenated.** A directory name is composed from the host and the instance through the same escaping rule described below, applied to each coordinate before they are joined on `--`. Running them together on `--` directly would be ambiguous: a host named `a--b` with an instance `c`, and a host `a` with an instance `b--c`, would reach one directory. Encoding each coordinate first keeps them apart, so an authored `--` inside a coordinate appears as `-zh-`.

**What the directory name admits.** ASCII letters in both cases, digits, the full stop and the underscore pass through as you wrote them, so `API--aux` and `web.api--aux` read as you would expect. A hyphen you wrote is kept wherever the character after it is one of those, so `web-api--aux` is unchanged; a doubled hyphen escapes, because the pair is the join. Anything else is escaped by the same rule as a chart name. The set is drawn where it is because these directory names are both paths on disk and the location a dependency's `file://` pointer resolves, and a character that is fine in a filename can truncate or re-decode a URL.

**Values follow the declared name, not the directory.** A child chart's values are scoped under the name that chart declares, so values for the chart above are addressed as `api--guardrail`'s *declared* name — `cfr-zh-api-zh-guardrail` — rather than as its directory.

**You never write that key yourself.** You write the values on the attachment, and the umbrella's `values.yaml` is composed for you with the block already at the address the placed chart is addressed by. For a Feature attached to a component that is the `values:` you declare on the attachment, read by the FeatureRecipe's own `valuesMapping:`; for a Feature attached to a boundary it is the `infra:` you declare there, since a boundary-attached Feature has no component values pillar. Whichever it is, the map that `valuesMapping:` resolves to becomes the attachment's own block in the umbrella:

```yaml
# the umbrella's values.yaml, composed for you
api:                              # the component's own chart
  replicaCount: 3
cfr-zh-api-zh-guardrail:          # the chart the Feature attached under `guardrail` brought
  auditEndpoint: "https://audit.internal"
```

**This is the only route those values have.** A chart a Feature brings arrives with its files as its author wrote them — apart from the single manifest field described in ["The chart name the umbrella owns"](#the-chart-name-the-umbrella-owns) — so nothing writes your values into that chart, and the umbrella's block is what supplies them. A chart whose block never arrived is not a broken chart: it renders the defaults its own `values.yaml` ships and reports success, so give a default a value you would notice if you want to see the difference while authoring.

#### An attachment whose FeatureRecipe renders through the helm provider

A FeatureRecipe of the `helm` capability, attached to a component on this target, brings finished Kubernetes manifests rather than a chart. They land in the attachment's own directory exactly as the [helm provider](helm.md) rendered them, and the provider gives that directory the two things that make it a chart Helm installs: a minimal `Chart.yaml`, declaring the attachment's own name at version `0.1.0`, and one template, `templates/rendered.yaml`, which emits each rendered YAML file through Helm's `.Files.Get` by its name:

```text
charts/api--guardrail/
├── Chart.yaml               # apiVersion: v2, name: cfr-zh-api-zh-guardrail, version: 0.1.0
├── guardrail-config.yaml    # the manifest the helm provider rendered
└── templates/
    └── rendered.yaml        # {{ .Files.Get "guardrail-config.yaml" }}
```

The declared name is the one a chart the same attachment vendored would declare, so the umbrella's dependency entry and its values block are addressed exactly as described above. `.Files.Get` returns a file's bytes as they are rather than evaluating them a second time, so a manifest carrying literal template braces — an alerting rule's `{{ $labels.instance }}`, a dashboard's query — installs with them intact. Its values were resolved into those manifests when the helm provider rendered them, so the block the umbrella's `values.yaml` carries under that name is read by nothing.

### The chart name the umbrella owns

**The one thing Aggrega changes inside a chart you vendored is that chart's own `name` field.** In the placed chart's `Chart.yaml`, `name` is set to the encoded identity of whatever contributed that chart.

For a component, that is the component instance's own identity — the same value as the dependency's `alias` — and the umbrella's dependency entry names that value too, so the two sides always agree.

A chart a **Feature attachment** brings is a contributor in its own right, and it declares its own identity rather than repeating the identity of the component it is attached to. That identity is composed from two things you wrote — the component hosting the attachment, and the name the Feature is attached under — behind a short opening that marks it as an attachment's identity rather than a component's; the composed value is then written for the chart-name position through the derivation below, exactly as any other identity is.

So attaching a chart-vendoring Feature to a component named `api` under the name `guardrail` places a chart declaring `cfr-zh-api-zh-guardrail`, while that component's own chart still declares `api`. The two are separate contributors, and each declares a name of its own rather than both declaring the host's.

Nothing else in the chart is touched. Every other file arrives byte for byte as you wrote it, and inside `Chart.yaml` every other field, every comment, the key order and the quoting are exactly as authored. A key nested somewhere else in the manifest that also happens to be called `name` — a maintainer's name, for instance — is left alone.

**Why the umbrella needs that field.** A chart's `name` is what Helm binds an umbrella's dependency to. It is written by whoever authored the chart, which for a chart acquired from upstream is not the person deploying it — so two components in one assembly path can perfectly reasonably vendor charts whose manifests declare the same name. If both sub-charts kept that shared name, both of the umbrella's dependencies would resolve to whichever of the two Helm loaded first: one component's chart would render twice and the other's not at all, while each component's values still arrived, so the output would look complete and be wrong. Deriving the placed name from the component instance removes the shared name altogether, which is why nothing has to be refused — including the two cases that have no other remedy: **vendoring the same chart under two components**, where the name is shared by construction, and **vendoring a chart you did not write**, whose name you cannot change.

**The one thing you can observe.** A template that reads its own chart's name — `{{ .Chart.Name }}`, and anything derived from it such as the common `{{ .Chart.Name }}-{{ .Release.Name }}` resource-naming idiom — reads the encoded instance identity, not the name written in the source chart's `Chart.yaml`. That is what such a template already read before the field was set, because Helm reports a sub-chart under the alias its parent binds it by; setting the field makes the file on disk agree with what the render already produced. So for the worked example below, a template in the `api-east` sub-chart reads `api-east`.

If a resource name has to carry the chart's authored name, put that name in the chart's `values.yaml` and read it from there — a value is yours and Aggrega does not touch it.

### How a name is derived

A Helm chart name and a Helm dependency alias each accept a narrower set of characters than an aggregate name, a boundary path or an instance_id may carry. Rather than substitute for a character the target does not accept, the derivation writes it out, so two identities that differ only in punctuation always arrive at two names — and a value written under one alias can only ever reach the sub-chart that alias names.

- A letter, a digit and an underscore are carried through exactly as authored.
- A hyphen is kept as authored wherever the character after it is carried through directly and is not a lowercase `z`. A hyphen followed by a lowercase `z` opens an escape, so an authored one in that position is itself written out — `api-zone` becomes `api-zhzone`, which is what lets any name be read back without guessing.
- Every other character is written as `-z` followed by a letter naming it: `d` for a dot, `s` for a path separator, `h` for a hyphen the rule above does not keep. Anything else is written as `x` and the character's six-digit hexadecimal code point, and a byte that begins no character at all as `b` and its own two-digit value — so a name that is not valid text is still written out distinctly rather than collapsed.
- An empty value is written `-ze`, which no non-empty value can produce.
- Where two identities compose one chart name — an aggregate name qualifying an assembly path — they are joined by `--`. A single encoded identity never contains that pair, so the joined name says unambiguously which identity is which.

So an instance_id of `data.main-db` gives the alias `data-zdmain-db`, and the aggregate `fullstack-app` with the assembly path `boundaries/data/helm-chart` gives the chart name `fullstack-app--boundaries-zsdata-zshelm-chart`. Identical input always produces the identical name.

The umbrella `values.yaml` is keyed by alias:

```yaml
api-server:                          # sub-chart alias = encoded instance_id
  image: "registry/api-server:v2"
  replicaCount: 3
billing-svc:
  image: "registry/billing:v1"
  replicaCount: 2
```

When a sub-chart's `valuesMapping:` evaluates against its template context, the resulting values map populates this alias-keyed sub-block automatically. That holds for every contributor to the umbrella, not for components alone: a Feature attachment that vendors a chart is a contributor in its own right, so its FeatureRecipe's `valuesMapping:` populates a block of its own, keyed by the name its placed chart declares. See ["Where an attachment's chart lands"](#where-an-attachments-chart-lands).

A key the `valuesMapping:` sets to `null` is written into its block as `null`. Installed with Helm 4, a `null` in the umbrella's own `values.yaml` removes the sub-chart's default for that key only when the install also supplies values for that sub-chart; an install supplying none for it drops the `null`, and the sub-chart's default stands. A `null` in the values given to `helm install` removes the default either way.

## Provider-specific quirks

- **Sub-chart `Chart.yaml` is required.** The copy operation enforces a present `Chart.yaml` at the source-path root. Missing it halts the build before the umbrella step runs.
- **The placed chart's `name` is the umbrella's.** It is set to the encoded identity of whatever contributed the chart — a component instance's own identity, or, for a chart a Feature attachment brings, that attachment's own identity — and it is the only thing inside a vendored chart that Aggrega changes. See ["The chart name the umbrella owns"](#the-chart-name-the-umbrella-owns).
- **A source chart must declare a version, and a name.** The dependency entry's version is the one the source chart's own `Chart.yaml` declares, so a chart that declares no version halts the build rather than being given one — a dependency pinned to a version the sub-chart does not carry would leave the umbrella's per-instance values unable to reach it. A chart whose `Chart.yaml` declares no name, holds more than one YAML document, or does not parse halts for the same reason: the umbrella cannot compose a sub-chart it cannot read.
- **Encoded aliases and chart names.** An instance_id, aggregate name or boundary path carrying a character a Helm chart name or dependency alias does not accept appears encoded in the rendered umbrella, per "How a name is derived" above. An identity built only from letters, digits, underscores and hyphens the derivation keeps appears exactly as authored.
- **`file://` repository pointer.** The umbrella's dependency entries use a `file://` repository pointer naming the child chart's own directory — `file://charts/<instance_id>` for a component, and the attachment's own directory for a chart a Feature brings. This is the local-filesystem convention for in-tree child charts and lets `helm dependency build` resolve the umbrella without external registry calls. The pointer names a location and never the chart's declared name; the two differ for an attachment, and `helm dependency build` is the step that refuses a pointer naming a directory that is not there.
- **No template rendering at the helm-chart level.** The provider does not invoke the Helm SDK's render pipeline; it copies and composes. Authors who need pre-rendered flat manifests should use the helm provider's sourced mode instead.

## Worked example

A two-node boundary, each node bound to a helm-chart Recipe pointing at the same source chart:

```yaml
# Recipe — used by both `api-east` and `api-west` instances
apiVersion: aggrega.ai/v1alpha1
kind: Recipe
metadata:
  name: api-server-helmchart
  version: 1.0.0
spec:
  capability: helm-chart
  implements: core/api-server
  source: ./charts/api-server
  valuesMapping: |
    image: "{{ .values.image }}"
    replicaCount: {{ optional .infra `replicas` 2 }}
```

After composition, the boundary's evaluated assembly path (default `dist/<boundary-directory>/<capability>/` because `subDirectory:` defaults to `{{ .capability }}`) contains:

```text
dist/<boundary-directory>/helm-chart/
├── Chart.yaml                       # umbrella; lists api-east and api-west as dependencies
├── values.yaml                      # alias-keyed: api-east + api-west values blocks
└── charts/
    ├── api-east/                    # ./charts/api-server, name: api-east
    │   ├── Chart.yaml
    │   ├── values.yaml
    │   └── templates/
    │       └── deployment.yaml
    └── api-west/                    # ./charts/api-server, name: api-west
        ├── Chart.yaml
        ├── values.yaml
        └── templates/
            └── deployment.yaml
```

Both sub-charts are copies of the one source chart, and each carries its own instance's name in its `Chart.yaml` — which is what lets one chart be vendored twice in a single umbrella. Everything else in both copies is identical to the source.

A `helm install <release-name> dist/<boundary-directory>/helm-chart` against this layout installs both instances as a single Helm release, with the umbrella's alias-keyed values driving each sub-chart's templates.

## Cross-references

- [`providers/helm.md`](helm.md) — sister provider that emits flat rendered Kubernetes YAML rather than a chart scaffold; carries workload synthesis.
- [`entities/recipe.md`](../entities/recipe.md) — Recipe authoring surface and the three input kinds.
- [`entities/release.md`](../entities/release.md) — Release boundary semantics and per-boundary output directories.
- [`architecture/16-recipe-input-composition.md`](../../architecture/16-recipe-input-composition.md) — cross-provider Provider Capability Matrix.
- [`10-status.md#providers`](../10-status.md#providers) — current readiness classification.
