# Helm-Chart Provider

The helm-chart provider produces a packaged Helm umbrella chart per assembly path. Where the [helm provider](helm.md) emits flat Kubernetes YAML for direct GitOps consumption, helm-chart emits a chart scaffold — an umbrella `Chart.yaml` + `values.yaml` plus one sub-chart per contributing node — that downstream tooling can install via `helm install` or vendor for further per-environment customisation. The provider assembles per-`(path, provider)`: every node bound to a helm-chart Recipe contributes to the umbrella at the boundary's evaluated `directory:` joined with the per-component `subDirectory:`. Two boundaries that evaluate to the same path collapse into one merged umbrella chart that lists every contributor as a sub-chart dependency.

Each rendered Kubernetes resource emitted from sub-chart templates carries the boundary's `syncWave: <integer>` value as the `argocd.argoproj.io/sync-wave: "<N>"` annotation; Helm hooks additionally carry `helm.sh/hook-weight: "<N>"`. ArgoCD, Flux, and Helm read these annotations natively.

This page is the helm-chart provider's authoring reference. For the helm vs helm-chart split, see the [Providers](../10-status.md#providers) section of the Status page; for the cross-provider input-composition model, see [architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md).

## Supported input kinds

The helm-chart provider accepts two input kinds:

- **Sourced mode.** A Recipe with `source: <chart-path>` points at an on-disk Helm chart directory. The chart is copied into the umbrella structure as a sub-chart, verbatim except for the chart's own `name` — see ["The chart name the umbrella owns"](#the-chart-name-the-umbrella-owns); no rendering or templating is performed at the per-node level. Aggrega's role is composition (umbrella assembly across the boundary's nodes), not template evaluation.
- **`$import:`-loaded `artifacts:` mode.** A Recipe with `artifacts:` entries authored as `$import:` per-entry declares additional template files that the helm-chart provider injects into the sub-chart's `templates/` directory after the source-chart copy. Each file is pre-templated against Aggrega's TemplateContext using `[[ ]]` delimiters (see "`artifacts:` injection rule" below) so any `{{ }}` Helm templating in the same file survives into the downstream `helm install` render.

A Recipe targeting helm-chart that declares `workload:` is rejected at render time with a diagnostic pointing the author at the helm provider:

> source is required (helm-chart provider supports sourced mode only; for synthesized K8s manifests use the helm provider with workload:)

The split is deliberate: workload synthesis (translating an abstract Workload into Kubernetes resources) is the helm provider's exclusive concern. helm-chart's role is umbrella + sub-chart composition for charts the author has already produced.

A Recipe targeting helm-chart may also declare **inline-content `artifacts:` entries** (entries whose value is a block scalar carrying the file body inline in the Recipe rather than an `$import:`-loaded reference). An inline-content entry is placed at the sub-chart root under its authored key — no `templates/` prefix and no provenance splice. A chart's own templates read such a loose file through Helm's `.Files.Get` / `.Files.Glob` (the canonical ConfigMap-from-files pattern), so a chart-root file is a legitimate, first-class shape rather than an error.

**Both forms are evaluated with the `[[ ]]` Aggrega delimiters before placement**, so a body of either form may read the Recipe's pillar context; `{{ }}` in either body is left untouched and becomes a Helm directive at downstream `helm install` time. What differs between the forms is where the file lands and whether provenance is merged into it:

- An **`$import:`-loaded entry** is a template file: after evaluation (see "`artifacts:` injection rule" below) it is injected into the sub-chart's `templates/` directory with provenance merged in, so Helm renders it as a manifest alongside the chart's own templates.
- An **inline-content entry** is a loose data file: after evaluation it lands at the chart root, unchanged from what the evaluation produced and carrying no merged provenance, for `.Files`-based consumption.

## `artifacts:` injection rule

When a helm-chart Recipe declares `artifacts:` entries via per-entry `$import:`, each `$import:` value is a path to a template file resolved **relative to the Recipe's own directory** (the directory containing the Recipe YAML on disk). The provider:

1. Reads each file's content.
2. Pre-templates the content with Aggrega delimiters `[[ ]]` against the Recipe's TemplateContext (the same context the Recipe's `valuesMapping:` evaluates against). `{{ }}` inside the file content is left untouched — those become Helm template directives at `helm install` time.
3. Writes each file to `boundaries/<boundary-path>/charts/<instance-id>/templates/<authored-key>` of the umbrella output, a bundle's files nested beneath that key. The key the entry is authored under names the file; the `$import:` path selects its content and contributes nothing to the name, so the directory structure within that path never reaches the output.

The `[[ ]]` / `{{ }}` dual-delimiter discipline is the load-bearing detail. A typical `$import:`-loaded artifact file might mix Aggrega-time interpolation (e.g., `[[ .values.image ]]`) with Helm-time interpolation (e.g., `{{ .Release.Namespace }}`). Each delimiter pair fires at its own phase: Aggrega resolves `[[ ]]` at compile time before the file lands; Helm resolves `{{ }}` at install time after the umbrella ships.

Filename collisions across the source-chart's templates and the `$import:`-loaded artifact injections raise `CATALOG_ERROR` — the diagnostic names both the chart-supplied template and the conflicting `$import:` source. Authors resolve the collision by renaming the artifact's key or the chart's own template.

## `source:` keyset

The helm-chart provider accepts `source:` as a **bare filesystem path string only**. Structured source objects (e.g. `source: { repo: ..., chart: ..., version: ... }`) are reserved for future registry integration and are rejected today.

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

## Path-keyed composition — the umbrella shape

The provider runs in two phases per assembly path:

1. **Per-node copy.** For each node bound to a helm-chart Recipe, the provider copies the source chart's full directory tree into a sub-chart slot. Files land flat in the per-node output map; the assembler names `charts` as the sub-directory its contributors sit under, and the orchestrator nests them at `charts/<instance_id>/` when assembling the umbrella.
2. **Per-`(path, provider)` umbrella assembly.** Once all per-node copies for the path complete, the assembler emits an umbrella `Chart.yaml` + `values.yaml` at the assembly path's root. The umbrella declares one dependency per contributing node and routes per-node values under instance-id-keyed sub-blocks. When the assembly path receives contributors from more than one boundary (boundaries with shared `directory:`), every contributor lands as a dependency in the same umbrella.

The umbrella `Chart.yaml` has the shape:

```yaml
apiVersion: v2
name: <effective-chart-name>                # see "Chart-name resolution" below
version: 0.1.0
description: Aggrega umbrella chart at <assembly-path>
dependencies:
  - name: <encoded-instance-id>               # the name the placed sub-chart carries
    version: <user-chart-version>           # from the source chart's Chart.yaml
    alias: <encoded-instance-id>              # see "How a name is derived" below
    repository: file://charts/<instance_id>    # the sub-chart's own directory
```

### Chart-name resolution

The umbrella's chart `name` is resolved through the boundary annotation cascade. Each contributing boundary's effective `aggrega.ai/chart-name` annotation (the cascade-resolved value, walking up the boundary tree) determines the umbrella name; the resolved value is encoded for the chart-name position exactly as any other identity is, so a value carrying only letters, digits, underscores and hyphens the rule below keeps reaches the chart verbatim. When the assembly path receives contributors from more than one boundary, every contributor's effective `aggrega.ai/chart-name` MUST resolve to the same value; mismatches halt the build with a diagnostic naming the conflicting values and the contributing boundaries.

The cascade resolves the DRY tension naturally: declare `aggrega.ai/chart-name` once on the parent boundary and child boundaries inherit it through the cascade; sibling boundaries with no common parent must declare matching values explicitly. Boundaries with no `aggrega.ai/chart-name` declared anywhere in their cascade fall back to the aggregate name and the contributing boundary name, each encoded and joined as described below.

Each dependency entry's `name` is the name the placed sub-chart carries — the component instance's own encoded identity, the same value as the `alias` — for the reasons in ["The chart name the umbrella owns"](#the-chart-name-the-umbrella-owns). Its `version` is still the version from the source chart's own `Chart.yaml`. The alias scopes the sub-chart's values under `values.yaml.<alias>.*`, matching Helm's umbrella-values convention so per-instance values propagate correctly when the umbrella is installed.

The sub-chart's own directory keeps the instance_id exactly as authored, so `charts/<instance_id>/` is where each contributor's files land and what the dependency's `repository` points at. Two instances of the same source chart therefore coexist without a filesystem collision, and each keeps its own values block under its own alias.

### The chart name the umbrella owns

**The one thing Aggrega changes inside a chart you vendored is that chart's own `name` field.** In the placed sub-chart's `Chart.yaml`, `name` is set to the component instance's encoded identity — the same value as the dependency's `alias` — and the umbrella's dependency entry names that value too, so the two sides always agree.

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
- Where two identities compose one chart name — an aggregate name qualifying a boundary path — they are joined by `--`. A single encoded identity never contains that pair, so the joined name says unambiguously which identity is which.

So an instance_id of `data.main-db` gives the alias `data-zdmain-db`, and the aggregate `fullstack-app` with the boundary path `dist/data/helm-chart` gives the chart name `fullstack-app--dist-zsdata-zshelm-chart`. Identical input always produces the identical name.

The umbrella `values.yaml` is keyed by alias:

```yaml
api-server:                          # sub-chart alias = encoded instance_id
  image: "registry/api-server:v2"
  replicaCount: 3
billing-svc:
  image: "registry/billing:v1"
  replicaCount: 2
```

When a sub-chart's `valuesMapping:` evaluates against its TemplateContext, the resulting values map populates this alias-keyed sub-block automatically.

## Provider-specific quirks

- **Sub-chart `Chart.yaml` is required.** The copy operation enforces a present `Chart.yaml` at the source-path root. Missing it halts the build before the umbrella step runs.
- **The placed chart's `name` is the umbrella's.** It is set to the component instance's encoded identity, and it is the only thing inside a vendored chart that Aggrega changes. See ["The chart name the umbrella owns"](#the-chart-name-the-umbrella-owns).
- **A source chart must declare a version, and a name.** The dependency entry's version is the one the source chart's own `Chart.yaml` declares, so a chart that declares no version halts the build rather than being given one — a dependency pinned to a version the sub-chart does not carry would leave the umbrella's per-instance values unable to reach it. A chart whose `Chart.yaml` declares no name, holds more than one YAML document, or does not parse halts for the same reason: the umbrella cannot compose a sub-chart it cannot read.
- **Encoded aliases and chart names.** An instance_id, aggregate name or boundary path carrying a character a Helm chart name or dependency alias does not accept appears encoded in the rendered umbrella, per "How a name is derived" above. An identity built only from letters, digits, underscores and hyphens the derivation keeps appears exactly as authored.
- **`file://` repository pointer.** The umbrella's dependency entries use a `file://charts/<instance_id>` repository pointer, naming the sub-chart's own directory; this is the local-filesystem convention for in-tree sub-charts and lets `helm dependency build` resolve the umbrella without external registry calls.
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
