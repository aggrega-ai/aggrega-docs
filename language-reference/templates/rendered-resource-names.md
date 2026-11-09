# Naming a Rendered Resource

A Recipe routinely has to name something its own output produced: a hostname to publish through
`provides:`, a reference inside a `valuesMapping:`, an identifier written into an `artifacts:` body.
Two template-context keys carry the names available for that, and they answer different questions.
Reading the wrong one produces output that is silently wrong rather than refused — an address naming a
resource nothing emitted — so this page sets out which key answers which question.

It also sets out the distinction the two keys rest on: a **target** and a **reference** are not the
same thing, and a target is never a name a deployment platform will resolve.

## A target names a component; a reference names a rendered resource

**A target is an authoring identity.** It is the value a developer writes to say which component an
edge points at — `target: my_db` in a `uses` block — and it is the identity the build uses to find
that component, report on it in diagnostics, and key its facts by. It reads the same under every
provider, because it is a fact about your documents rather than about any platform.

**A reference is what makes one rendered artifact point at another.** It is written in one provider's
own vocabulary: a cluster-internal address under `helm`, a service name under `compose`, an
interpolation under `terraform`, an imported value under `cloudformation`. A reference is different
under every provider, because each platform resolves references its own way.

🔴 **A target is never written into rendered output.** Every provider derives its own names, so an
authored identity handed to a platform as a name is wrong whenever the two spellings differ — and they
differ for exactly the characters a target's own alphabet does not admit. An identity carrying no such
character survives unchanged, which is what makes this easy to get wrong: the mistake works until
somebody names a component with an underscore or a capital letter.

The reference a consumer needs is therefore published by the **producer**, because a producer's Recipe
is what knows its own provider's vocabulary — a consumer may bind a different provider entirely, and
cannot spell a reference for a platform it does not render to. The consumer reads an ordinary
published string.

### The worked pair

The producer's Recipe publishes the address; the consumer reads it back through the edge's alias.

```yaml
# The PRODUCER's Recipe — a helm Recipe sourcing a chart the author supplied.
# It publishes an in-cluster address built from the name that chart's own
# templates render their resources against.
spec:
  capability: helm
  source: ./charts/postgres
  provides:
    host: "{{ .context.rendered_name }}.svc.cluster.local"
    port: "5432"
```

```yaml
# The CONSUMER's Aggregate — it names the producer by its TARGET, which is an
# authoring identity and stays in the documents. The uses block is keyed by the
# socket the catalog entity declares, then by the alias you choose for the edge.
spec:
  components:
    api:
      type: core/compute/api-server
      uses:
        databases:
          primary:
            target: my_db
            inject:
              env:
                - in: DB_HOST
                  from: host
                - in: DB_PORT
                  from: port
```

```yaml
# The CONSUMER's Recipe — it reads the published REFERENCE, never the target.
# The context keys an edge by its alias, so the socket does not reappear here.
spec:
  capability: helm
  valuesMapping: |
    {
      "db_host": "{{ .context.uses.primary.provides.host }}"
    }
```

For an author-supplied chart under `helm`, a component named `my_db` renders its resources under the
release name `my-zudb`. So the producer's chart emits a Service whose `metadata.name` is `my-zudb`,
the published `host` is `my-zudb.svc.cluster.local`, and the consumer dials a Service that exists —
whether it reads the value through `.context.uses.primary.provides.host` or receives it as the
injected `DB_HOST`.

Writing `{{ .context.uses.primary.target }}` there would publish `my_db.svc.cluster.local` instead.
That value is not wrong-looking: it is the identity the developer wrote, spelled exactly as they wrote
it. It simply names no Service, and nothing about the build says so.

## The two keys, as a pair

Neither key is legible on its own, because each is defined by what the other is not.

| Key | What it names |
| --- | --- |
| `{{ .context.instance_id }}` | The node's identity, and the name of the resources built for this node that no provider derives a name for — an artifact set placed from your `artifacts:` block, and a workload synthesized from your `workload:` block by a provider that names it after the identity, as `compose` does. Always present. |
| `{{ .context.rendered_name }}` | The name **the bound provider** derives for the resources it renders for this node — for source **you supplied**, the name your own supplied templates render their resources against, such as the release name a chart reads; for a `workload:` it synthesizes, the name it gives those resources where it names them after a name of its own rather than the identity, as `helm` does. Present only where that provider derives one. On a Feature attachment's own templates it is the host component's name — see [below](#on-a-feature-attachments-own-templates). |

The split follows from where the name has to be usable. A chart or module **you** supplied has
templates, and those templates name their resources after whatever identity the platform hands them —
so the name has to be the one that platform will use, spelled in that platform's own alphabet. A
synthesized workload has no templates of yours, but its resources still have to carry names the
platform accepts: a provider whose names admit everything an authored name may carry names them after
the identity, and one whose names do not names them after the name it derives — and then reports that
name here, so you never have to predict it.

**A node declaring both a supplied source and a `workload:` emits both kinds of output at once, and
needs no third key.** Under `helm` both are named after the one release name, so `rendered_name`
serves either: the chart's own resources carry it however its templates compose it, and each
synthesized Service is `<rendered_name>-<service key>`. Under a provider that names a synthesized
workload after the identity, name that workload's resources with `instance_id` and the supplied
output's with whatever the provider reports for it.

The alphabets are why the two can differ at all. An authored component name may carry an underscore or
a capital letter; a chart's release name may not, and rather than fold such a character onto a similar
one — which would let two components you can tell apart arrive at one name in a cluster — the
derivation writes it out. See [`../providers/helm.md`](../providers/helm.md) "How the release name is
derived" for that provider's own alphabet and length limit.

## Which providers report a name, and why the others do not

`helm` reports one: the release name. A sourced chart reads it as `.Release.Name` and routinely names
its resources after it, and the provider names every resource it synthesizes for a component after it
too — the controller under the release name itself, and each Service as `<release name>-<service
key>`. So an address published for either kind of output is built from `rendered_name`. For a node
that places an artifact set alone it reports none: the names in that set are the ones its author
wrote.

```yaml
# A synthesized helm Recipe publishing the address of the Service its workload
# declares under the key `default`.
spec:
  capability: helm
  workload: |
    apiVersion: aggrega.ai/v1beta1
    kind: Workload
    containers:
      main:
        image: "valkey/valkey:8"
        ports:
          redis: 6379
    services:
      default:
        type: ClusterIP
        ports:
          redis: 6379
  provides:
    host: "{{ .context.rendered_name }}-default"
    port: "6379"
```

A component named `cache` publishes `cache-default`, and one named `my_cache` publishes
`my-zucache-default` — in each case the name of the Service the build emits.

The other four report none, and the reasons are **not** the same. None of them is a provider awaiting
support — in each case either there is no derived name to report, or the name you want is already
reachable another way.

- **`cloudformation` and `compose` — you wrote the names, or the identity is the name.** A
  cloudformation Recipe authors its resources' logical ids and the provider reads them exactly as
  written; a compose file you supplied names its own services and the provider merges and labels that
  file without renaming anything in it. A workload `compose` synthesizes is named after the node's
  identity, which a compose file admits as written, so `{{ .context.instance_id }}` is that name.
  There is no derivation to report, and the names are the ones standing in your own documents. That
  name is the workload's main service, the one a peer reaches; a sidecar or init service it carries
  is named from the same identity and the container's name, joined by `--`, as
  [How a sidecar or init service is named](../providers/compose.md#how-a-sidecar-or-init-service-is-named)
  describes.

- **`terraform` — the name is a function of where the files were placed.** A contributor's `module`
  block is named from the output directory its configuration was written into, which is settled when
  the boundary's files are assembled rather than when a node is rendered. At the point a Recipe's
  templates run, that position does not exist yet.

- **`helm-chart` — the name it derives is the placed chart's own address, which is a different thing
  from the name that chart's templates render against.** This provider sets the `name` field of a chart
  you vendored to the encoded identity of whatever contributed it, which is also the alias the umbrella
  binds that sub-chart by and the key its values are scoped under. For a component, that identity is
  what `{{ .context.instance_id }}` carries, so the placed chart's name is already reachable under the
  key that says what it is. The name the vendored chart's own *templates* render against is the release
  name, which the umbrella's release supplies at install time rather than this provider deriving it —
  so there is no such name here for this key to report. See
  [`../providers/helm-chart.md`](../providers/helm-chart.md) "The chart name the umbrella owns".

## Reading the key where no name is reported

Reading `{{ .context.rendered_name }}` on a node whose provider reports no such name **halts the
build**, and the diagnostic says which key to write instead. It does not render an empty value: an
address one segment short is a wrong artifact that deploys, which is worse than a build that stops.

Which remedy the halt offers depends on the node rather than on where you wrote the reference:

- A node supplying **no** source of its own, under a provider reporting no name for it, has its
  resources named after its identity, so the halt names `{{ .context.instance_id }}` — there is a
  correct value and it says so.
- A node that does supply source, under a provider deriving no name for it, has no substitute. The
  halt says so instead of offering one, because sending you to the identity there would name resources
  your node does not carry.

The refusal covers `provides:` and every other template a Recipe writes inline — its
`valuesMapping:`, its `workload:` body, each `artifacts:` entry, and each pipeline step's `with:` and
`when:`.

🔴 **Both import forms are outside it.** A `valuesMapping:`, `workload:` or `artifacts:` entry supplied
through `$import:` — whether the import names a local file or a library entry — carries no text in your
Recipe until the render resolves it, so a reference to this key **inside such a body** is not checked.
It renders the name the importing node's provider reports where that provider reports one, and an empty
value rather than a halt where it reports none. An imported body therefore reads the key only when every Recipe that
imports it binds a provider reporting a name — a library entry written for `helm` Recipes that source a
chart, and saying so in its description. A body meant for importers whose provider may report none takes
the name through a value the importing Recipe sets instead.

A Recipe's `locals:` entries do not read the key at all. A local shares its context with the Recipe's
`source:` template, and whether the node supplies source is one of the things the name depends on, so
the name is not offered there. A reference to `{{ .context.rendered_name }}` in a local therefore halts whatever
the provider reports, with the diagnostic for a reference the render context does not define (`E0060`),
which lists `.context.instance_id` as the one key `.context` offers there. Read the key in the `provides:`
entry or the inline template that needs it.

## On a Feature attachment's own templates

On the templates a Feature attachment's FeatureRecipe writes — its `locals:`, `source:`, `provides:`,
`injectMapping:`, `valuesMapping:`, `workload:`, each `artifacts:` entry, and each pipeline step's
`with:` and `when:` — `{{ .context.rendered_name }}` is the **host component's** name: the one the
host's own provider reports for the resources it renders for the host, which is the value the host's
own Recipe reads. It pairs with `{{ .context.instance_id }}`, which on those templates is the host
component's identity; the attachment itself is `.attachment_name`. An attachment written on one of a
component's connections reads the consuming component's name, because that component is its host.

That is the key to build an attachment's own resource names from. A FeatureRecipe that names a Secret,
a route or a policy after the component it is attached to needs a name the platform accepts, and the
host's identity as written is not one wherever it carries an underscore or a capital letter. Under
`helm`, a component named `my_db` reports `my-zudb`, so a Secret named
`{{ .context.rendered_name }}-{{ .attachment_name }}` for an attachment `root` renders as
`my-zudb-root`, where `{{ .context.instance_id }}` would give `my_db-root`, which a cluster refuses.
The value stays the host's whichever provider the attachment renders through.

It is present wherever the host's provider reports a name — under `helm`, a host whose Recipe supplies
a chart or declares a `workload:` — and absent where it reports none: a host placing an artifact set
alone, and a host on any other provider. Reading it on an attachment of such a host **halts the build**
with the diagnostic for a reference the render context does not define (`E0060`), which lists the keys
`.context` defines there. `{{ .context.instance_id }}` is among them, and it is what the host's own
resources are named after on such a host, so a FeatureRecipe written for hosts that may report no name
reads the identity instead.

The refusal covers the templates a FeatureRecipe writes inline, other than its `injectMapping:`. An
`injectMapping:`, and a `valuesMapping:`, `workload:` or `artifacts:` entry the FeatureRecipe supplies
through `$import:`, is not checked: on a host reporting no name a reference there renders an empty
value rather than halting.

Where an attachment delivers a chart its author supplied, that chart's templates render against the
host component's release name, deliberately: deriving it from the attachment instead would rename
resources the chart's author declared and may already have deployed. `.attachment_name` is the value
that tells two attachments on one host apart — see [`../providers/helm.md`](../providers/helm.md)
"How the release name is derived".

## Names derived from a connection's attachment

An attachment a connection carries is an attachment of the consuming component, named `<alias>.<slot>` — `gpt.credential` for the `credential` slot of the connection written under the alias `gpt` (see [the Aggregate's connection entry](../entities/aggregate.md#a-connections-own-attachments-features-on-a-uses-entry)). That composed name is the `.attachment_name` its FeatureRecipe renders against, and it carries the dot.

Two kinds of name follow from it, and they treat the dot differently.

**A name the FeatureRecipe composes keeps whatever its template writes.** The standard-library credential realizations name their resource `{{ .context.rendered_name }}-{{ .attachment_name | replace "_" "-" }}`, so the credential on the `gpt` connection of a component named `router` renders as a resource named `router-gpt.credential`, dot included, which is a valid Kubernetes object name. The dot survives in a name of this kind exactly when the template keeps it.

**A name the build derives from the attachment's identity writes the dot out.** The identity labels and the emitted file are composed from the host component and the attachment name through the same encoding every name derived from an identity goes through, and it writes the dot as `zd` and a capital letter as an escape of its code point, because the identity is spent as a resource name as well as a label, and a Service name admits neither: a connection written under the alias `gptPro` would reach `cfr--router--gpt-zx000050ro-zdcredential`. The resource above is labelled `aggrega.ai/component-id: cfr--router--gpt-zdcredential` (and `app.kubernetes.io/name` alike), and under the `helm` provider it is emitted as `router--gpt-zdcredential--router-secret-router-gpt-credential.yaml`. See [Naming Conventions](../02-naming-conventions.md) "The separator does not reach a name" for why the dot is written out rather than replaced.

## Related

- [Template context contract](template-context-contract.md) — the full shape of the context these keys
  sit in.
- [Template expansion matrix](expansion-matrix.md) — which pillars each template site reads.
- [Topology triad: `provides`, `inject`, `uses`](../vocabulary/topology-triad.md) — how a published
  value crosses an edge to a consumer.
- [Naming Conventions](../02-naming-conventions.md) — what you may write for a component name, and
  what a name costs under a narrower alphabet.
- [`errors/fatal-halts.md`](../errors/fatal-halts.md) — the halt this page describes, with its emitted
  message.
