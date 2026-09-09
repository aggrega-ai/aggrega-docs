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
# The PRODUCER's Recipe — a helm Recipe wrapping a chart the author supplied.
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
| `{{ .context.instance_id }}` | The name **the compiler** gave the resources it built for this node — a workload it synthesized from your `workload:` block, an artifact set it placed from your `artifacts:` block. Always present. |
| `{{ .context.rendered_name }}` | The name **the bound provider** gave output it rendered from source **you supplied** — the name your own supplied templates render their resources against, such as the release name a chart reads. Present only where that provider derives one. |

The split follows from where the name has to be usable. A resource the compiler built has no templates
of its own, so nothing renders against its name and it is named after the node's identity. A chart or
module **you** supplied does have templates, and those templates name their resources after whatever
identity the platform hands them — so the name has to be the one that platform will use, spelled in
that platform's own alphabet.

**A node declaring both a supplied source and a `workload:` emits both kinds of output at once, and
needs no third key.** Name the supplied chart's own resource with `rendered_name`; name the
synthesized one with `instance_id`. The two are different resources with different names, and that is
correct rather than a conflict.

The alphabets are why the two can differ at all. An authored component name may carry an underscore or
a capital letter; a chart's release name may not, and rather than fold such a character onto a similar
one — which would let two components you can tell apart arrive at one name in a cluster — the
derivation writes it out. See [`../providers/helm.md`](../providers/helm.md) "How the release name is
derived" for that provider's own alphabet and length limit.

## Which providers report a name, and why the others do not

`helm` reports one: the release name a sourced chart reads as `.Release.Name`, which is what such a
chart's templates routinely name their resources after.

The other four report none, and the reasons are **not** the same. None of them is a provider awaiting
support — in each case either there is no derived name to report, or the name you want is already
reachable another way.

- **`cloudformation` and `compose` — you wrote the names, so you already know them.** A
  cloudformation Recipe authors its resources' logical ids and the provider reads them exactly as
  written; a compose file you supplied names its own services and the provider merges and labels that
  file without renaming anything in it. There is no derivation to report, and the names are the ones
  standing in your own document.

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

- A node supplying **no** source of its own has its resources named after its identity, so the halt
  names `{{ .context.instance_id }}` — there is a correct value and it says so.
- A node that does supply source, under a provider deriving no name for it, has no substitute. The
  halt says so instead of offering one, because sending you to the identity there would name resources
  your node does not carry.

The refusal covers `provides:` and every other template a Recipe writes inline — its
`valuesMapping:`, its `workload:` body, each `artifacts:` entry, and each pipeline step's `with:` and
`when:`.

🔴 **Both import forms are outside it.** A `valuesMapping:`, `workload:` or `artifacts:` entry supplied
through `$import:` — whether the import names a local file or a library entry — carries no text in your
Recipe until the render resolves it, so a reference to this key **inside such a body** renders as an
empty value rather than halting. Where an imported body names a rendered resource, pass the name in
through a value the importing Recipe sets rather than reading the key inside the imported body.

## On a Feature attachment's own templates

A Feature attachment's templates do **not** read this key. The value available where an attachment
renders is the **host component's** answer — the name the host's own provider reports for output
rendered from the host Recipe's source — and an attachment binds its own recipe and therefore its own
provider. So that value is not an answer about the attachment's own output: it is absent whenever the
host supplies no source even where the attachment's author did, and it comes from a different platform
entirely whenever the two capabilities differ.

Reading it on any of an attachment's own templates is therefore refused, and the diagnostic lists the
keys that surface does define. `{{ .context.instance_id }}` is among them, and on an attachment's
surface it names the **host component** the attachment is resolving for — which is what it names
everywhere else too.

Where an attachment delivers a chart its author supplied, that chart's templates render against the
host component's release name, deliberately: deriving it from the attachment instead would rename
resources the chart's author declared and may already have deployed. `.attachment_name` is the value
that tells two attachments on one host apart — see [`../providers/helm.md`](../providers/helm.md)
"How the release name is derived".

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
