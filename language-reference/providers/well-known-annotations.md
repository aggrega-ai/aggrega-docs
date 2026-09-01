# Well-Known Annotations

Providers read specific boundary annotations from the Release to configure platform-specific deployment context. The compiler itself is blind to the *values* of these annotations — it passes them through as opaque strings. Each provider declares which annotations it reads, at which scope, and what default applies when the annotation is absent. That declaration lives on a provider-rendering Plugin's `spec.provider.wellKnownAnnotations`, and it is deliberately narrow: a provider lists a key only where it reads it.

The support matrix in this chapter is **generated from those declarations**, at the grain the declaration carries — per provider **per input kind**, because a provider can read a key when it synthesizes a deployment unit and have no way to read it when it renders a vendored artifact. Author against the matrix here: a cell says what that provider reads on that path, because a cell cannot say anything the provider did not declare. A declaration that names an input kind the provider's own render-behavior contract does not render is refused when the Plugin entity is read, so the two claims cannot disagree.

The **reserved vocabulary** is the wider set, and it lives in two places instead — this chapter, which names every reserved key including the ones no provider reads yet, and the reserved-prefix set the publishing lint checks.

## The Invariants

1. The compiler never reads or validates provider well-known annotations.
2. Each provider documents which annotations it reads and what defaults it applies.
3. Annotations apply uniformly within a boundary. If a value varies per component, it belongs in component-level annotations (overriding boundary annotations) or in component `infra`.
4. Provider well-known annotations never duplicate component labels. Component labels describe *what a component is*. Boundary annotations describe *where a component deploys*.
5. Recipes do not handle provider well-known annotations. The provider applies placement context (namespace, registry prefix, service account) automatically after the Recipe produces its content.
6. The `aggrega.ai/` prefix is reserved for the standard library. Custom enterprise annotations use their own prefix.
7. Component-level annotations in the Release override boundary-level annotations (deep-merge, component wins). Where a provider assembles the output of several boundaries into one artifact, it may require an annotation to resolve uniformly across them — the `helm-chart` provider takes the umbrella chart's name from `aggrega.ai/chart-name`, and when more than one boundary contributes to the same chart and they resolve that annotation to different values, the build halts naming the disagreeing boundaries, because one chart cannot carry two names.

## The Complete Annotation Matrix

### How to read this matrix

The six category tables below name every annotation in the reserved `aggrega.ai/` vocabulary, what it controls, and what the provider does when it is absent. Whether a given provider applies a given key is a finer question, because a provider renders more than one **input kind** — a vendored artifact (`sourced`), a Workload the provider synthesizes itself (`synthesized`), or a Recipe's `artifacts:` as a node's whole output (`artifacts-only`) — and a key can be read on one of those paths while being unreachable on another. Which provider renders which input kind is at [../../architecture/16-recipe-input-composition.md](../../architecture/16-recipe-input-composition.md); what each one applies is [Support by provider and input kind](#support-by-provider-and-input-kind) below, which is this page's authoritative statement.

Every cell in that grid carries one of three tiers:

- **Applied** — the provider applies the key on this input kind, and the rendered output changes deterministically as a result.
- **Applied conditionally** — the compiler emits an *additive* override beside the target artifact instead of editing the artifact, so whether the value takes effect depends on that artifact exposing a matching key of its own. Effective in practice, never a guarantee. **No provider implements a conditional cell today**, and the declaration surface carries no way to express one, so the generated grid below emits only the other two tiers. The tier is named because the route genuinely exists for a vendored artifact, and a two-tier vocabulary would force the matrix either to claim a guarantee it cannot make or to deny that the route exists at all.
- **Not applied** — no provider applies the key on this path: the target has no render slot for it there, so the placement mechanism contributes nothing to what is rendered, and the category table's **Default** column says what you get instead. The value still passes through the build as an opaque string, untouched. The tier is named for the mechanism rather than for the fate of the value, because those are different questions and only the first is one a cell can answer: what a provider applies is a property of that target's render slots, which is exactly what the declaration behind each cell states.

Two scopes, and only one of them makes input kind a meaningful axis:

- **Node-scoped** — `aggrega.ai/namespace`, `aggrega.ai/image-registry`, `aggrega.ai/image-pull-secret` and `aggrega.ai/service-account` shape one component's own rendered output, which the path its input kind selects produces. These are the grid's columns.
- **Assembly- and reference-scoped** — `aggrega.ai/chart-name` is resolved once when an umbrella chart is assembled, and the three `aggrega.ai/aws-*` keys are resolved when a reference crosses a boundary. Input kind is not an axis for either: the value is read at the assembly or at the reference, however each contributing node was rendered. They have their own table at [Keys resolved per assembly and per reference](#keys-resolved-per-assembly-and-per-reference).

### Category 1 — Placement

| Annotation | Applied by | Purpose | Default |
| --- | --- | --- | --- |
| `aggrega.ai/namespace` | `helm` (sourced, synthesized); `compose` (sourced, synthesized) | Kubernetes namespace (helm); per-boundary Docker network name (compose) | Not injected if absent (helm); network derived from the boundary path (compose) |
| `aggrega.ai/project-name` | not yet consumed | Reserved for a Docker Compose project name | — |
| `aggrega.ai/region` | not yet consumed | Reserved for a cloud region at placement scope | — |
| `aggrega.ai/account-id` | not yet consumed | Reserved for a cloud account identifier at placement scope | — |

`aggrega.ai/namespace` is dual-purpose by design. It expresses the same logical-isolation intent — *"this boundary's resources live in their own addressable scope"* — in each target's native form: a Kubernetes `metadata.namespace` for helm, a Docker network name for compose. Recipe authors set one annotation; each provider materialises it appropriately for the target. For the compose case, the network name is resolved per node from the annotation on that node, falling back to the boundary path where the node carries no annotation. Whichever of the two supplies the identity, it is then written into the characters a compose network name accepts — every other character is written out as an escape rather than substituted for, so two identities that differ at all stay on two networks, and the identity's case is kept as authored. [The compose provider reference](compose.md) documents the derivation in full, including how to read an encoded name and what a rename costs.

### Category 2 — Registry

| Annotation | Applied by | Purpose | Default |
| --- | --- | --- | --- |
| `aggrega.ai/image-registry` | `helm`, `compose` — synthesized only | Registry prefix for container images, applied to every synthesised container image reference | No prefix |
| `aggrega.ai/image-pull-secret` | `helm` — synthesized only | Kubernetes `imagePullSecrets` name, unioned into the synthesised pod's existing entries | None |

### Category 3 — Networking

| Annotation | Applied by | Purpose | Default |
| --- | --- | --- | --- |
| `aggrega.ai/cluster-domain` | not yet consumed | Reserved for a DNS suffix for cross-namespace service discovery | — |
| `aggrega.ai/ingress-class` | not yet consumed | Reserved for a Kubernetes IngressClass on Ingress resources | — |
| `aggrega.ai/service-mesh` | not yet consumed | Reserved for mesh sidecar injection annotations | — |

### Category 4 — Security

| Annotation | Applied by | Purpose | Default |
| --- | --- | --- | --- |
| `aggrega.ai/service-account` | `helm` — synthesized only | Kubernetes `ServiceAccount` for synthesised Pods; overrides the Recipe's `workload.serviceAccount` when both are set | The Recipe's `workload.serviceAccount`, or unset when the Recipe declares none |
| `aggrega.ai/pod-security-standard` | not yet consumed | Reserved for a Pod Security Standards level | — |
| `aggrega.ai/iam-role` | not yet consumed | Reserved for a cloud identity role bound to a workload | — |

### Category 5 — Packaging

| Annotation | Applied by | Purpose | Default |
| --- | --- | --- | --- |
| `aggrega.ai/chart-name` | `helm-chart` — per assembly | Umbrella chart name | Aggregate name and boundary name joined, or the boundary name alone when the Aggregate is unnamed |
| `aggrega.ai/chart-version` | not yet consumed | Reserved for a Helm chart version | — |
| `aggrega.ai/stack-name` | not yet consumed | Reserved for an explicitly named deployment stack | — |
| `aggrega.ai/tf-backend` | not yet consumed | Reserved for a Terraform state backend identifier | — |

### Category 6 — Cloud target

| Annotation | Applied by | Purpose | Default |
| --- | --- | --- | --- |
| `aggrega.ai/aws-account` | `cloudformation` — per cross-boundary reference | AWS account the stack (boundary) deploys into | Same-account — a cross-stack reference resolves through a same-account stack-export import |
| `aggrega.ai/aws-region` | `cloudformation` — per cross-boundary reference | AWS region the stack (boundary) deploys into | Same-region — a cross-stack reference resolves through a same-region stack-export import |
| `aggrega.ai/aws-assume-role-arn` | `cloudformation` — per cross-boundary reference | IAM role ARN a cross-account stack read assumes to reach a peer stack's exported values | No role is supplied on a cross-account reference |

Each CloudFormation boundary renders into one stack. When a `uses` edge crosses
from one boundary to another, the `cloudformation` provider needs to know where the
peer stack lives to shape the reference: two stacks in the same account and region
exchange values through a stack export and import; a peer in a different account or
region needs a cross-account stack-output read, optionally under an assumed role.
These annotations carry that placement context. Each is read at the moment the
provider shapes such a reference, and resolved through the ordinary annotation
cascade at that moment — a value set on the component wins over a value set on
the boundary. A boundary-level value is therefore the common way to express
them, not the only one. They are opaque scalar pointer
strings — the provider pipes them into the reference it builds and never resolves
them against live AWS state; the account, region, and role are supplied by the
Release, and the runtime environment resolves the final physical read. When every
annotation is absent, the provider treats the peer as same-account and same-region
and supplies no role.

### Support by provider and input kind

The node-scoped keys, per provider per input kind. Column headers drop the `aggrega.ai/` prefix every key carries. `applied` and `—` carry the tiers defined above, `—` being *not applied*; `n/a` means the provider does not render that input kind at all, so no path exists there for the key to be applied on or missed on.

<!-- BEGIN GENERATED: well-known-annotation-support -->
| Provider | Input kind | `namespace` | `image-registry` | `image-pull-secret` | `service-account` |
| --- | --- | --- | --- | --- | --- |
| `helm` | sourced | applied | — | — | — |
| `helm` | synthesized | applied | applied | applied | applied |
| `helm` | artifacts-only | — | — | — | — |
| `compose` | sourced | applied | — | — | — |
| `compose` | synthesized | applied | applied | — | — |
| `compose` | artifacts-only | n/a | n/a | n/a | n/a |
| `helm-chart` | sourced | — | — | — | — |
| `helm-chart` | synthesized | n/a | n/a | n/a | n/a |
| `helm-chart` | artifacts-only | n/a | n/a | n/a | n/a |
| `terraform` | sourced | — | — | — | — |
| `terraform` | synthesized | n/a | n/a | n/a | n/a |
| `terraform` | artifacts-only | — | — | — | — |
| `cloudformation` | sourced | — | — | — | — |
| `cloudformation` | synthesized | n/a | n/a | n/a | n/a |
| `cloudformation` | artifacts-only | — | — | — | — |

*Every provider distributed with the compiler has rows here, including one that reads no placement annotation at all — an empty row set would be indistinguishable from a provider nobody has described yet. A provider supplied separately declares what it reads in the same way and is not listed here, because a published page cannot enumerate providers it has never seen.*
<!-- END GENERATED: well-known-annotation-support -->

A Recipe may declare more than one input kind at once — a `workload:` with `artifacts:` alongside it, for instance. Read the grid per kind: the synthesized output of such a node is the `synthesized` row, and its artifact files are the artifacts case. The `artifacts-only` row is the input kind where a Recipe declares `artifacts:` and nothing else.

**You do not have to consult the grid to find out.** Setting a key on a node whose target reads it on none of that node's input kinds produces a warning naming the key, the target and every input kind the node declares, so a cell you landed in by accident announces itself at the moment you build rather than waiting for you to think of looking here:

```text
warning: node "frontend" (provider "helm-chart"): target "helm-chart" does not support annotation aggrega.ai/namespace on sourced input and ignored it
```

**On a node declaring more than one input kind the warning is about the node, not about one of its halves.** Because the kinds compose by addition, a target reading the key on any one of them does apply it, and the node's rendered output carries the result — so no warning is raised. A warning appears only when every declared kind misses the key, and it names them all:

```text
warning: node "backend" (provider "helm"): target "helm" does not support annotation aggrega.ai/cluster-domain on sourced or synthesised input and ignored it
```

So a `workload:` alongside a `source:` is enough to make `aggrega.ai/service-account` take effect on that node, and the build stays quiet about it — which is the honest report, because the value reaches the synthesised half and appears in the emitted manifests.

The value still passes through untouched — the build does not halt, because a boundary spanning components on heterogeneous targets will always have some node that cannot act on a given key, and that is an ordinary deployment rather than a mistake. A boundary annotation cascades, so one authored line yields one warning per node that cannot act on it, which is how you see *which* nodes are affected. It belongs to the `unsupported-field` class and is silenced with that class's flag; [Warnings](../errors/warnings.md) has the detail. Two limits worth knowing: only the bare `aggrega.ai/` keys are checked, since a sub-prefixed key is your own vocabulary, and a provider that declares no support claim at all produces no warning, because there is nothing to compare what you authored against.

**Why a vendored artifact applies fewer keys.** A node-scoped annotation is applied where the provider has a render slot for it. When the provider synthesizes the deployment unit itself it owns every field of the result, so a registry prefix, a pull secret and a service account all have somewhere to land. A vendored artifact — a Helm chart, a compose file, a Terraform module — carries its own configuration interface instead, and the compiler does not read that interface, so it cannot know which of the artifact's own keys a registry prefix or a service account would correspond to. Placement that the surrounding render call controls still applies, which is why `aggrega.ai/namespace` is applied to a chart rendered from source. Placement that would mean deciding where inside someone else's artifact a value belongs does not, and an author supplies it through that artifact's own values. This is why the sourced rows are sparse where the synthesized rows are full, and it is the shape to expect of any key added later.

### Keys resolved per assembly and per reference

Four of the shipped keys are not node-scoped, so they sit outside the grid above rather than being folded into it: input kind is not a meaningful axis for them, and giving each one a row per input kind would repeat a single cell three times and imply a distinction that does not exist. Each declares the boundary scope, and the table below is generated from those declarations.

<!-- BEGIN GENERATED: well-known-annotation-boundary-scope -->
| Annotation | Applied by | Purpose | Default |
| --- | --- | --- | --- |
| `aggrega.ai/chart-name` | `helm-chart` | Name of the assembled umbrella Helm chart. | The leaf boundary name is used. |
| `aggrega.ai/aws-account` | `cloudformation` | The AWS account the stack (boundary) deploys into. A cross-boundary reference reads it to decide whether a peer stack sits in the same account. | The peer is treated as same-account, and a cross-stack reference resolves through a same-account stack-export import rather than a cross-account stack-output read. |
| `aggrega.ai/aws-region` | `cloudformation` | The AWS region the stack (boundary) deploys into. A cross-boundary reference reads it to decide whether a peer stack sits in the same region. | The peer is treated as same-region, and a cross-stack reference resolves through a same-region stack-export import. |
| `aggrega.ai/aws-assume-role-arn` | `cloudformation` | The IAM role ARN a cross-account stack read assumes to reach a peer stack's exported values. | No role is supplied, and a cross-account reference carries no assume-role. |
<!-- END GENERATED: well-known-annotation-boundary-scope -->

**When each is resolved**, which the declaration itself does not carry. `aggrega.ai/chart-name` is resolved once per umbrella-chart assembly, from the boundary annotation cascade; every contributor to one assembly must resolve it to the same value, and disagreement halts the build naming the boundaries. The three `aggrega.ai/aws-*` keys are resolved per cross-boundary reference under component-over-boundary precedence, so a component value wins over a boundary value; Category 6 above describes the reference each one shapes.

### Reserved names no provider reads yet

Eleven keys in the matrix above are marked *not yet consumed*:
`aggrega.ai/project-name`, `aggrega.ai/region`, `aggrega.ai/account-id`,
`aggrega.ai/cluster-domain`, `aggrega.ai/ingress-class`,
`aggrega.ai/service-mesh`, `aggrega.ai/pod-security-standard`,
`aggrega.ai/iam-role`, `aggrega.ai/chart-version`, `aggrega.ai/stack-name`,
and `aggrega.ai/tf-backend`.

Setting one of these on a Release today has **no effect on rendered output**. No
provider reads them, and no default is applied on their behalf — in
particular, no DNS suffix is applied for `aggrega.ai/cluster-domain`, so a Recipe
that needs a cluster domain must supply it as an ordinary value rather than rely
on this annotation. A Recipe author who needs one of these behaviours today
expresses it as a Recipe value or a component `infra` field.

**No provider declares these eleven.** A provider's `wellKnownAnnotations` lists
only what it reads, so none of the eleven appears there — a reader opening the
helm, helm-chart, compose or cloudformation Plugin sees the keys that work and
nothing else. That is the point of the narrow declaration: a declared key is a
working key, and the scope beside it says on which path.

Two of the reserved names sit close to live keys and are not
interchangeable with them. `aggrega.ai/region` and `aggrega.ai/account-id` name a
region and an account at placement scope and reach no provider; the keys the
`cloudformation` provider reads are the cloud-namespaced `aggrega.ai/aws-region`
and `aggrega.ai/aws-account` in Category 6. When you mean the CloudFormation
cross-stack placement context, author the `aws-` form — the unprefixed pair is
held against collision, not wired to anything. Two further reserved names are
covered today by other surfaces rather than by an annotation:
`aggrega.ai/stack-name` is reserved, while the stack name a `cloudformation`
boundary renders into is derived deterministically from the deployment and
boundary identity; and a workload's cloud identity role is supplied as an
ordinary operator-set field on the Feature that emits the binding, not through
`aggrega.ai/iam-role`.

The names remain reserved, and remain listed *here*, because the `aggrega.ai/`
prefix is reserved: an enterprise catalog must not reuse one of these keys for its
own meaning, because doing so would collide when the annotation becomes live. This
matrix and the reserved-prefix set the publishing lint checks are together the
reservation register, and the two are held to the same set of names by a check
that reads both and fails when they diverge. Authoring one of the eleven
therefore neither fails validation nor trips the "do not use the bare
`aggrega.ai/` prefix" rule — it simply has no effect. If one of them gains a
provider that reads it, that provider's declaration gains the key at the same time.

The umbrella chart version a `helm-chart` boundary emits is currently always
`0.1.0`; it is a fixed value rather than an `aggrega.ai/chart-version` default.

> Note: Manifest `features.annotations` bindings using the `aggrega.ai/`
> prefix are rejected at load time; the prefix is reserved exclusively
> for the provider well-known annotations documented in this chapter.
> Authors of annotation-driven Feature bindings use `feature.aggrega.ai/`
> for standard-library shortcuts or a custom domain for enterprise
> shortcuts.
>
> Note: explicit `null` on a Release annotation removes the inherited
> binding from the overriding boundary or component (annotation-driven
> Feature opt-out). Sibling components in the same boundary that did
> not opt out retain the inherited binding; absent keys continue to
> inherit from the parent cascade as normal.

## Catalog-authored annotations the compiler reads

Everything above is a *provider* annotation: authored on the Release, passed through by the compiler as an opaque string, read by a provider. A second, much smaller vocabulary runs the other way — authored by the Architect on a **catalog entity's own** `metadata.annotations`, read by the **compiler**, and never seen by a provider. Invariant 1 above is about the provider vocabulary and does not extend to these; the compiler reads exactly the keys listed here and no others.

These keys sit under a `<scope>.aggrega.ai/` sub-prefix, not the bare `aggrega.ai/` prefix, so they are outside the reservation register the matrix above carries and outside the reserved-prefix rule the publishing lint applies to bare-prefix keys.

| Annotation | Authored on | Read by | Purpose |
| --- | --- | --- | --- |
| `features.aggrega.ai/requiredType.<label>` | Component `metadata.annotations` | the compiler, over the finalised graph | Declares a **presence mandate**: every instance of this Component must carry at least one attachment whose type equals the annotation's value. `<label>` is an author-chosen suffix that names the requirement in the diagnostic; it is not a slot name and nothing dereferences it. Repeat the key with different labels to declare several mandates. |

The mandate is satisfied by an attachment at any scope — a component-level or subsystem-level `features:` block, a Release boundary-level or component-level block, or annotation-driven expansion — because it tests the instance's final attachment set rather than where each attachment came from. An unmet mandate halts the build naming the label and the required type; a value that is not a Feature type URI, or a key with no label after the prefix, halts with a distinct malformed-declaration diagnostic. Full authoring treatment, and how a mandate differs from a `featuresSchema` slot, is at [`entities/component.md`](../entities/component.md) "Presence mandates".

## Provenance labels emitted by providers

The annotations above flow *into* the build — the Release authors them, providers consume them. Providers also emit a parallel set of labels *out of* the build, attaching them to the rendered output so downstream tooling can attribute runtime resources back to the catalog content that produced them. These provenance labels are not authored on the Release; they are derived from the build's own state (Recipe identity, boundary path, aggregate name, environment, sync wave, compiler version) and emitted by the provider at render time.

The shipping emit set, attached to every rendered Kubernetes manifest by helm and helm-chart, and to every emitted service by compose:

| Label | Source | Emission |
| --- | --- | --- |
| `app.kubernetes.io/name` | Node ID (or, for a resource a FeatureRecipe emits, the identifier derived for that attachment — see below) | helm and helm-chart only — Kubernetes-standard label, not emitted on compose services |
| `aggrega.ai/component-id` | Node ID (or, for a resource a FeatureRecipe emits, the identifier derived for that attachment — see below) | All three providers |
| `aggrega.ai/recipe-uri` | `<recipe-name>:<recipe-version>` of the producing Recipe (or producing FeatureRecipe for FR-emitted resources) | All three providers, when the producing entity has both name and version set |
| `aggrega.ai/boundary-path` | Boundary path the component was routed into | All three providers, when the boundary path is non-empty |
| `aggrega.ai/aggregate-name` | Aggregate `metadata.name` | All three providers, when set |
| `aggrega.ai/compiler-version` | Compiler version stamped at build time | All three providers, when set |
| `aggrega.ai/environment` | Release `metadata.environment` | All three providers, when the Release sets it |
| `aggrega.ai/sync-wave` | Per-boundary `syncWave` integer | All three providers, when non-zero |

### Per-provider emission notes

- **`helm`** — labels land in `metadata.labels` on every rendered Kubernetes resource (Deployment, Service, PVC, etc.). Both sourced-mode (Helm SDK render with post-render label injection) and synthesised-mode (workload synthesis) paths produce the same set.
- **`helm-chart`** — labels land in `metadata.labels` on every sub-chart resource via the same label-injection mechanism as helm.
- **`compose`** — labels land in `services.<name>.labels` on every emitted compose service. Sourced-mode (post-merge label injection on the merged base + valuesMapping document) and synthesised-mode (workload synthesis directly setting the service's labels block) both produce the same set. The Kubernetes-specific `app.kubernetes.io/name` is omitted from compose output.

For resources a FeatureRecipe emits, the `aggrega.ai/component-id` value is built from the attachment rather than from the host component's name — for every way a FeatureRecipe can deliver those resources, so an attachment's resources are never indistinguishable by label from the host component's own. Whether that identity is also what those resources are **named** after depends on the delivery: a workload Aggrega synthesises is named after the identity, while a chart or fragment the attachment's author supplied keeps the host component's Helm release name and output-file prefix, because the author's own templates render against that name. How the value is composed — the two openings, the parts and their `--` join, how a character a label cannot carry is written out, how a value too long for its target is shortened, and which names it is and is not the basis for — is provider-independent, so it is stated once at [`vocabulary/labels-and-annotations.md`](../vocabulary/labels-and-annotations.md) "Provenance labels emitted on rendered output" rather than repeated here. This page owns the other half: where on each provider's rendered output the labels land.

The `aggrega.ai/recipe-uri` resolves to the FeatureRecipe's own `name:version`, not the consuming Recipe's identity — downstream tooling reading the label to identify the producing entity gets the correct provenance for both component-emitted and FR-emitted output.

## Sync-wave annotations

The `aggrega.ai/sync-wave` label above is paired with a sync-wave annotation that downstream tooling consumes for deployment ordering. The label exposes the wave value for selector queries; the annotation surfaces the value where each tool conventionally reads it.

| Annotation | Emission | Consumed by |
| --- | --- | --- |
| `argocd.argoproj.io/sync-wave` | helm and helm-chart, on every Kubernetes resource where `syncWave` is non-zero on the contributing boundary | ArgoCD's sync-wave ordering |
| `helm.sh/hook-weight` | helm only, on chart-templated manifests that already carry a `helm.sh/hook` annotation when `syncWave` is non-zero | Helm's hook-weight ordering within a hook phase |

### `helm.sh/hook-weight` emission is path-dependent

A subtlety worth flagging for chart authors: `helm.sh/hook-weight` is emitted only on manifests rendered through the chart-templating path — the chart's `templates/` directory rendered via the Helm SDK. Manifests produced through the artifacts path (the Recipe's `artifacts:` block, whether each entry is inline content or `$import:`-loaded) carry the `argocd.argoproj.io/sync-wave` annotation and the full provenance label set, but they do **not** receive `helm.sh/hook-weight` — even when the artifact carries a `helm.sh/hook` annotation.

The distinction is structural: `helm.sh/hook` and `helm.sh/hook-weight` are Helm-runtime ordering primitives that apply to chart-templated hook resources. Recipe-author artifacts are extra resources declared at the Recipe layer; they do not participate in Helm's hook lifecycle by default.

If you need Helm hook-weight ordering on a hook resource, author the resource as a chart template under the Recipe's `source:` directory rather than as an `artifacts:` entry. The chart template will receive both `argocd.argoproj.io/sync-wave` and `helm.sh/hook-weight` matching the contributing boundary's `syncWave` value.

## Authoring examples

Boundary-level placement and registry configuration:

```yaml
# release.yaml
spec:
  boundaries:
    production:
      annotations:
        aggrega.ai/namespace: prod-east
        aggrega.ai/image-registry: registry.corp.com
        aggrega.ai/image-pull-secret: corp-registry-creds
      components:
        api: {}
        worker: {}
```

Per-component override (component wins over boundary on the same annotation key):

```yaml
# release.yaml
spec:
  boundaries:
    production:
      annotations:
        aggrega.ai/namespace: prod-east
      components:
        api: {}
        legacy-thing:
          annotations:
            aggrega.ai/namespace: legacy-east   # override — this component deploys elsewhere
```

## Aggregate-side annotation cascade

Annotations also live on the Aggregate authoring surface — at the subsystem scope (`spec.subsystems.<name>.annotations`) and at the component-instance scope (`spec.subsystems.<name>.components.<name>.annotations` or `spec.components.<name>.annotations` for top-level components). The Aggregate-side cascade carries Developer-authored annotations down through the subsystem tree to contained components.

### The cascade rule

A subsystem-level annotation propagates to every nested subsystem and every contained component in the subsystem's subtree. Closer-level annotations override outer-level annotations at per-key granularity: a component-level annotation overrides any inherited subsystem-level annotation for the same key without affecting sibling keys or sibling components.

Annotation values carry pointer-tristate semantics:

- **Absent key** — the scope declares no value for this annotation. Nested subsystems and contained components inherit any binding from an ancestor scope.
- **Non-nil pointer (a string value)** — the scope declares a value. Nested subsystems and contained components inherit this value unless they declare their own value or opt out.
- **Nil pointer (explicit YAML `null`)** — the scope removes any inherited binding for this key from its subtree. Sibling components and siblings subsystems retain their independent inheritance; only the opting-out scope's subtree loses the binding.

```yaml
spec:
  subsystems:
    data:
      annotations:
        feature.myco/db-pool: "shared-pool"   # propagates to api and worker
      components:
        api:
          # inherits feature.myco/db-pool: "shared-pool"
        worker:
          annotations:
            feature.myco/db-pool: null         # opts out for this component only
        special:
          annotations:
            feature.myco/db-pool: "vip-pool"   # closer-level override
```

### The side-vs-pillar partition

The Aggregate-as-Authoring-Surface invariant restricts Aggregate-side annotations to the values pillar. A Manifest annotation binding declares routing paths under either `maps.infra` (Release-side routing) or `maps.values` (Aggregate-side routing); an Aggregate-side annotation whose binding declares only `maps.infra` paths halts the build with a clear OPS_ERROR naming the annotation key, the routed pillar, and the authoring side. The symmetric rule applies to the Release side: Release-side annotations may only route through `maps.infra`; a Release-side annotation against a values-only binding fires the parallel error.

Bindings that declare paths in both pillars route the side-compatible subset on each pass: an Aggregate-side annotation fires the values-pillar paths only, and a Release-side annotation fires the infra-pillar paths only. Cross-side composition — values from the Aggregate, infra from the Release — produces one Feature attachment per (Component, Feature) pair with both pillars populated and per-leaf provenance recording which side contributed each leaf.

### Authoring example — subsystem annotation routes to values

```yaml
# Manifest binding
spec:
  mappings:
    features:
      type:
        core/db-pool: db-pool-helm:1.0.0
      annotations:
        feature.myco/db-pool:
          feature: core/db-pool:1.0.0
          maps:
            values:
              - pool                            # routes to values.pool
```

```yaml
# Aggregate
spec:
  subsystems:
    data:
      annotations:
        feature.myco/db-pool: "shared-pool"
      components:
        api:
          type: core/server:1.0.0
        worker:
          type: core/server:1.0.0
```

After annotation expansion, both `api` and `worker` carry a synthetic `feature.myco/db-pool` Feature attachment whose `values.pool` field reads `"shared-pool"`. The provenance side-table records each leaf as `Origin: annotation`, `Side: aggregate`, `AnnotationSource: aggregate.yaml:subsystems.data.annotations.feature.myco/db-pool`.

## Structured annotation values

A Feature with multiple configurable fields invites a single annotation key that carries values for several of them at once. The structured annotation form lets one key route to multiple binding paths in one declaration:

```yaml
# Aggregate Subsystem — Developer's intent for db-pool (values-pillar subkeys)
subsystems:
  data:
    annotations:
      feature.myco/db-pool:
        db_name: "prod-db"
        read_replicas: 5
```

```yaml
# Release Boundary — Operator's sizing for db-pool (infra-pillar subkeys)
boundaries:
  prod:
    annotations:
      feature.myco/db-pool:
        pool_size: 20
        max_connections: 100
```

The Manifest binding declares all four subkeys' routing in pillar-grouped `maps:` lists:

```yaml
# Manifest
spec:
  mappings:
    features:
      annotations:
        feature.myco/db-pool:
          feature: core/db-pool:1.0.0
          maps:
            values:
              - db_name
              - read_replicas
            infra:
              - pool_size
              - max_connections
```

The annotation value's shape is one of three forms:

- **Scalar string** — a single value. The binding must declare exactly one path total; the scalar routes to that path.
- **Structured object** — a map of subkey to subvalue. Each subkey's path must appear in the binding's `maps.infra` or `maps.values` list; the subvalue routes to the named Feature schema field at the declared pillar.
- **Explicit YAML `null`** — opts out of the inherited binding wholesale for this cascade scope.

Each subkey within a structured value resolves against the binding's `maps` list independently. A subkey absent from both `maps.infra` and `maps.values` halts the build with a clear error naming the offending subkey and the declared paths.

### Cascade merge for structured values

Structured annotations cascade with per-subkey deep merge. A child cascade scope's annotation merges with the parent's annotation per subkey; closer-level overrides parent at subkey granularity:

```yaml
subsystems:
  data:
    annotations:
      feature.myco/db-pool:
        db_name: "data-default"
        read_replicas: 3
    components:
      api:
        annotations:
          feature.myco/db-pool:
            db_name: "api-override"     # overrides parent at this subkey only
            # read_replicas not listed → inherits 3 from parent
      analytics:
        annotations:
          feature.myco/db-pool:
            read_replicas: null         # per-subkey opt-out: removes inherited subkey
            # db_name not listed → inherits "data-default" from parent
```

Effective annotations after the cascade:

- Component `api`: `{ db_name: "api-override", read_replicas: 3 }`
- Component `analytics`: `{ db_name: "data-default" }` — `read_replicas` opted out at this scope

A child cascade level whose value is a scalar (against a structured parent) replaces wholesale rather than merging. Shape mismatches between cascade levels resolve in favour of the closer-level value; the compiler does not warn on shape mismatch.

### Whole-value null vs per-subkey null

The cascade carries two opt-out mechanisms at different granularities:

```yaml
# Whole-value null — opts out wholesale at this scope
components:
  api:
    annotations:
      feature.myco/db-pool: null
```

The entire annotation binding is suppressed at this component; no synthetic Feature attachment synthesizes from this annotation key at this scope. Sibling components retain their inherited binding.

```yaml
# Per-subkey null — opts out just one subkey
components:
  api:
    annotations:
      feature.myco/db-pool:
        db_name: "api-db"
        read_replicas: null
```

The annotation continues to contribute at this scope, but the `read_replicas` subkey is suppressed. Other subkeys (declared at this scope or inherited from parent cascade levels) stand.

Authoring guidance: use whole-value null to disable an annotation-driven Feature attachment at a scope. Use per-subkey null when you want to keep most of an annotation's contribution but suppress one or more specific fields.

### Side-vs-pillar partition per subkey

The Aggregate-as-Authoring-Surface invariant applies per subkey when an annotation value is structured. Each subkey's pillar (per the binding's `maps` declaration) must be compatible with the authoring side:

- Aggregate-side annotation may carry only subkeys routing to `maps.values`.
- Release-side annotation may carry only subkeys routing to `maps.infra`.

A subkey routing to an incompatible pillar halts the build with a clear error citing the specific subkey and pillar. The error chain collects all incompatible subkeys per annotation before halting — operators see every problem per build cycle rather than fix-rebuild-fix-rebuild cycling.

### Per-subkey type validation

Each subkey's runtime value is validated against the target Feature's `spec.schema` declared type at the routed pillar. The supported declared types are `string`, `integer`, `number`, `boolean`, `object`, `array`, `null`. A subvalue whose Go type does not match the schema's declared type halts the build with a clear error naming the subkey, the actual type, and the declared type.

Type matching is strict — no coercion. A string `"20"` against an integer-typed schema field halts; authors declare types correctly on the Feature schema or use scalar annotations that pass through as strings.

**Authoring lever for strict validation.** Properties without a declared `type` in the Feature's `spec.schema` accept any runtime value shape including nested maps. The validator's default-to-skip discipline trades strictness for progress — when the schema does not declare a constraint, the validator does not invent one. Authors who want strict per-subkey type validation declare `type` on every property in `spec.schema`. The FeatureRecipe rendering layer downstream handles whatever shape the annotation contribution carries.

### Cross-side composition

When both an Aggregate-side annotation (values subkeys) and a Release-side annotation (infra subkeys) target the same Feature attachment on the same Component, the IR builder merges the contributions into a single Feature attachment with both pillars populated. Per-leaf provenance records each subkey's source — the synthesized attachment carries `values.db_name` attributed to the Aggregate authoring site and `infra.pool_size` attributed to the Release authoring site.

The cross-side composition pattern is the canonical authoring shape for Features with mixed Developer-intent and Operator-sizing fields: the Aggregate declares the cognitive choices (which database, how many replicas at the application level); the Release declares the physical sizing (how big the pool, how many connections at the infrastructure level). One Manifest binding ties them together with a single set of `maps` declarations.

## Related references

- [Provider architecture](architecture.md) — the provider-plugin architecture and the provider-rendering Plugin's role.
- [../entities/release.md](../entities/release.md) — the Release authoring surface where boundary and component annotations live.
- [../entities/aggregate.md](../entities/aggregate.md) — the Aggregate authoring surface where subsystem and component-level annotations live.
- [../entities/manifest.md](../entities/manifest.md) — the Manifest's `mappings.features.annotations` map where annotation bindings declare their `maps:` routing.
- [../../architecture/11-governance-and-compliance.md](../../architecture/11-governance-and-compliance.md) — the compile-time provenance stamping story that complements author-controlled annotations.
