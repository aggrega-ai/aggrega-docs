# The governance socket

_The whole socket rather than one role of it: the four roles — two that judge a build, two that shape it — both policy engines that ship in the compiler, and how an operator attaches a plugin._

An operator attaches a Wasm governance plugin to inspect a build and act on what
it finds. The compiler host stays content-neutral and unopinionated: it routes the build
payload to the guest and acts on what the guest returns, and it never interprets
the policy itself. All the domain policy intelligence — the policy language, its
engine, and the rules — lives inside the guest.

This is the same ahead-of-time-purity contract every socket runs under: the
guest evaluates the payload it is handed and returns a result the host consumes
verbatim (see [the sandbox contract](plugin-contract.md#the-sandbox-contract)).
The host learns nothing about the policy language the guest speaks and carries no
policy-engine code of its own.

A governance plugin is attached at exactly one **role**, and the role — not the
plugin — fixes both which payload arrives and what the attachment may do with it.
Two are **verdict** roles: the attachment judges the build, and the host takes
exactly one of three actions per verdict it returns. Two are **transform** roles:
the attachment reports a change to the build's labels or annotations, and the host
applies it. A plugin that serves more than one role is attached once per role, and
it declares no role of its own — the attachment carries it.

This page is the comprehensive treatment of the governance socket: the four roles
and the payload each carries, the verdict severities the host acts on, the
engine-agnostic input channel an operator supplies, how to write a policy for either
of the two policy engines that ship inside the compiler — one evaluating Rego, one
evaluating CEL — how a guest wraps a foreign policy engine, the reference guests that
ship, and how an operator attaches a plugin to a workspace. For the socket's place in the pipeline and its typed wire shapes, see
[`plugin-contract.md`](plugin-contract.md); for authoring and publishing a
plugin as a catalog entity, see the
[Wasm plugin developer guide](plugin-developer-guide.md).

## The mental model: the host routes, the guest decides

On a build the host assembles the payload for the attachment's role, hands it
across the ABI boundary, and reads back what the guest returned. At a verdict role
that is a list of verdicts, each carrying a severity and a human-readable message:
the host maps each severity to a build action, and it does not read the message for
meaning, does not know what the policy checked, and does not know which engine
produced the decision. At a transform role it is the change to make, addressed to
the labels or the annotations that role governs and to nothing else.

Because the host does not interpret policy content, the entire policy surface is the
guest's: which language the rules are written in, which engine evaluates them, and
how a rule firing becomes a verdict or a change. The socket contract is narrow by
design — a role, a set of inputs, and a result — so that any policy technology that
compiles to Wasm can serve it.

A verdict role accepts or rejects and does nothing else: the host reads its output
only as a decision and never applies it as a change, so a policy cannot quietly
bring a non-compliant build into compliance. A transform role is the deliberate
exception, and what makes it one is that the operator attached it — attaching a
plugin to shape labels is a declaration that labels are to be shaped. What such an
attachment may change is bounded to its own role's surface, and the build halts
loudly on anything outside it.

## The four roles

A plugin is attached at exactly one role, and the role fixes where in the pipeline
the host evaluates it, what payload it receives, and what it may return. A plugin
that should serve two roles is attached twice — once per role.

### The verdict roles: `ir-verdict` and `render-verdict`

- **`ir-verdict`** — the guest reasons over the intermediate-representation
  graph, before rendering. The payload carries the full capability-agnostic IR graph (every
  node, edge, and attachment the compiler holds) plus the routing paths the
  analyzer enumerates, so a policy can reason about topology and reachability
  without re-walking the graph. That path list is **bounded per starting node** —
  a densely connected or cyclic topology can hold more distinct routes than the
  enumeration emits, and once the bound is reached the remaining routes from that
  starting node are not listed. A path that is present is therefore real, while
  the absence of a path is not proof that none exists: a policy whose verdict
  turns on something being *unreachable* should establish that from the nodes and
  edges, which the payload carries in full, rather than from the path list alone.
  One thing in the graph is not as written: every value an author declared
  sensitive — in an attachment's `values` or `infra`, in a boundary
  attachment's `infra`, in a node's own `values` or `infra`, or in a
  connection's own `values` or `infra` — arrives as the
  withheld marker `{"aggrega_withheld": "declared"}`, while its key, its
  sensitivity marking and every undeclared value beside it arrive as written. A
  policy judges where declared-sensitive material travels and never receives the
  material; see
  [the attachment facts a governance policy reads](governance-attachment-facts.md#declared-sensitive-values-arrive-withheld).
  An `ir-verdict` policy runs at the static-analysis
  gate, before any artifacts are produced. Use it for policies about
  architecture and wiring — topology invariants, cross-boundary auth,
  credential-flow shape — that should halt a build before it renders anything.
- **`render-verdict`** — the guest reasons over the rendered output, after
  rendering. The payload carries the emitted artifacts sorted by path, so the wire
  is byte-identical across runs of identical input. Each artifact carries its
  output path and its rendered text; it additionally carries the format it was
  rendered in, when the producing provider declared one, and a parsed structured
  view of its content, when the content is in a format that was parsed ahead of the
  policy. A `render-verdict` policy sees exactly what the build produced, and
  nothing in it is withheld: a value a Recipe rendered into an artifact arrives
  as rendered, because the artifact is what the policy judges. Use it
  for policies about the concrete output — a rule that inspects rendered Docker
  Compose services or Kubernetes objects, for example.

### The transform roles: `annotation-transform` and `label-transform`

- **`annotation-transform`** — the guest reports annotations to add, during
  resolution and before annotation expansion. The payload carries every component
  the attachment may annotate, each with the annotations it already has, plus the
  annotation keys the Manifest registers a binding for. An injected annotation
  under a registered key goes on to expand into a Feature attachment, which is how
  this role adds to a build a capability the developer did not type.

  The components it may annotate are every component a boundary names under
  `components:`, and every component a boundary's `aggregates:` routing entry
  routes in. A routing entry places every component of its module, the
  components of the modules nested inside it included, whether its own
  `components:` names all of them, some, or none, as `documents: {}` names none;
  the payload carries each. A routed component is addressed by the id it carries
  in the build graph — the module's name, a dot, and the component's name inside
  the module, as in `documents.backend`, with one more module name and dot for
  each nested module — which is how the build graph and its diagnostics spell it,
  so a decision names it that way too. A component
  the routing entry places without naming it carries no annotations of its own on
  the payload, and an annotation injected onto it is applied as one written on it
  under the routing entry.
- **`label-transform`** — the guest reports label changes to apply, during topology
  construction: after the graph is built, and before the graph is judged. The
  payload carries a projection of the build's nodes — each with the Component it
  instantiates, the version resolved for it, the labels it currently carries, and
  the values its instance declares, read-only and with every value its Component
  declares sensitive withheld as the graph verdict withholds it — plus the Release's name and
  environment. Use it for derived metadata a developer should never have to type
  (compliance scope, ownership, cost attribution) and for a capability label a
  developer's declared configuration earns.

The roles carry different payloads because they act at different moments and answer
different questions. All four carry the same operator-supplied input channel
described below. To see a payload rather than read about it,
[`aggrega build --release <release> --policy-input <dir>`](../cli/aggrega-build.md)
writes the payload each role hands a plugin attached there — a role with nothing
attached included — as one JSON file per role, or per attachment where a role's
attachments receive different payloads, and combined with `--dry-run` it writes those
files and nothing else. At `annotation-transform`, `label-transform` and `ir-verdict`
the file is the `input` document a policy reads. At `render-verdict` the policy engine
reshapes the payload before a policy reads it — each artifact's `documents` are parsed
from it — so a `render-verdict` policy on an engine inside the compiler is tested in a
build, attached at `warn` or `info`, as
[Testing a policy before it gates a build](#testing-a-policy-before-it-gates-a-build)
shows. For a plugin whose `.wasm` you built yourself,
`aggrega plugin run-local --plugin <plugin.wasm> --export verdict_render --with @<dir>/render-verdict.json`
runs it on that file.

## Verdicts and severities

The severities below are the verdict roles' vocabulary. A transform role reports a
change rather than a verdict, so it carries no severity.

A guest returns a list of verdicts. Each verdict carries a severity that
determines the build action:

- **`halt`** — stops the build; the host surfaces the verdict's message as the
  reason. The build produces no artifacts.
- **`warn`** — flags the verdict; the build proceeds.
- **`info`** — records the verdict; the build outcome is unchanged.

These three are the whole set, and they are the same three every other socket's
diagnostics use, so a severity means the same thing wherever you read one.

A verdict carrying any other value is a contract violation rather than a fourth
route. The build halts, and the message names the plugin, the value the verdict
carried, and the three the contract declares — so a misspelled severity is
reported as a build error instead of passing as a verdict nothing acts on. A
guest that reports from the three is unaffected.

An allowing evaluation returns nothing. A guest emits a verdict only when a rule
fires, so an empty verdict list means the policy allowed the build. There is no
"pass" verdict to emit — silence is the allow.

A guest may return many verdicts in one evaluation, mixing severities. The host
walks them all: any `halt` stops the build (and every `halt` message is
surfaced), while `warn` and `info` verdicts are reported without blocking. This
mirrors the halt-versus-advise split that separates a build-halting policy from
an advisory lint check.

## The `with` channel: sources and settings

A policy guest is usually generic over the specific rules it enforces — the
engine is baked into the guest, but the rules are supplied per attachment. The
`with` channel carries that per-attachment input. It has two engine-agnostic
fields:

- **`sources`** — the policy-definition files the guest loads. The host reads
  each named file at build time and passes its bytes to the guest opaquely: it
  never parses a source, and the path it hands the guest is the file's base name,
  never an absolute host path. What the bytes mean is entirely the guest's
  business — a `.rego` file to one guest, some other policy format to another, and
  a base64-encoded archive of a whole policy set to a guest that reads one.
- **`settings`** — a configuration map the guest maps onto its engine. A guest
  reads its tunables (a replica ceiling, a required label key) from this map. By
  default the host hands it through verbatim without acting on it; a guest may
  additionally declare a schema for it (see below), in which case the host
  validates the map against that schema before running the guest.

A fully-baked guest — one whose rules are compiled in rather than supplied at
attach time — omits `with` entirely. The channel is optional at every role.

### Typed settings

A guest may declare a JSON Schema for the `settings` it expects. When it does,
the host validates the attachment's `settings` against that schema **before it
runs the guest**. Settings that do not conform halt the build with a message
naming the offending key and what the schema expected — a missing required key, a
value of the wrong type, an unknown key, or a value out of range is caught up
front rather than surfacing as an obscure guest failure or, worse, a
wrong-but-successful build.

Typed settings are optional and declared by the guest, not the host. A guest that
declares no settings schema keeps the free-form behavior: the host passes its
`settings` through unchecked. The host runs ordinary JSON Schema validation
against whatever schema the guest declared; it does not interpret what the
settings mean. This keeps the check engine-neutral — each guest describes the
shape of the settings it reads, and the host enforces exactly that shape and
nothing more.

**An attachment that declares no settings is validated as JSON `null`.** That is
what lets a guest make its settings mandatory: a schema admitting only an object
refuses an attachment that supplies none, and the build halts. The consequence
runs the other way too, and it is the one to author for deliberately: **a guest
whose settings are genuinely optional must declare a schema that admits `null`
as well as an object**, or it cannot be attached without settings at all. The
two policy engines that ship inside the compiler declare `"type": ["object",
"null"]` for exactly this reason — attach one with no `with:` block and it runs
on its defaults. A guest that declares `"type": "object"` alone has made its
settings required, whether or not that was the intent.

## The ABI is Aggrega's own

The socket contract is Aggrega's own ABI, not any policy engine's. That is what
lets any policy technology compiled to Wasm serve as a drop-in guest: the guest
speaks the Aggrega surface outward — `describe()`, plus the export the role it
serves calls — and whatever engine it uses is an implementation detail behind
that surface.

A guest that wraps a foreign policy engine **absorbs that engine's ABI inside
itself**. If the engine has its own Wasm ABI, its own entrypoints, or its own
host-callback protocol, the wrapping guest instantiates and drives it internally
and maps the engine's decision back to the socket's verdict shape. The compiler
host sees only the standard governance verdict surface; it never learns which
engine is involved and carries no engine-specific code. Switching a policy from
one engine to another is an attachment change, not a host change.

## Two policy engines ship inside the compiler

Two policy engines are compiled into the CLI binary, and an operator attaches
either — or both — the same way any governance plugin is attached:

| Coordinate | Policy language | Attached source |
| --- | --- | --- |
| `governance/rego` | Rego | `.rego` files, or a base64-encoded archive of a whole policy set |
| `governance/cel` | Common Expression Language (CEL) | `.cel` expression files, or `.yaml` / `.yml` rules documents |

Everything around the language is shared. Both serve all four roles, both read the
same per-role payload under the same field names, both map their decisions onto the
same three verdict severities through the same `translation` setting, and both fail
loudly rather than allowing a build they could not evaluate. Each carries the
compiler release that ships it as its version, and neither needs an external
toolchain or fetches anything at build time. What each language can *say* is not
shared: a rule that is a few helper rules in Rego can need settings and repetition
in CEL — see [What an expression can say](#what-an-expression-can-say) before writing
one that walks a route.

What differs is the language the rules are written in, and that is the whole basis
for choosing. An estate that already keeps a Rego corpus — or a team that writes
Rego for admission control elsewhere — attaches the Rego engine and its policies run
as they stand. A team that expresses its rules as single expressions over a
document, the way a Kubernetes validating-admission policy does, attaches the CEL
engine. The two are attached per role, so a workspace may run Rego at one role and
CEL at another, or both at the same role as two attachments.

The host is agnostic to which of them a decision came from: it routes the payload, reads
back a verdict or a change, and acts on it. Switching a policy from one language to
the other is an attachment change and a rewrite of the rules — never a host change.

## Rego policies: two roads

Rego is a common policy language, and there are two roads to running it — a
low-friction engine that ships inside the compiler, and a full-fidelity escape
hatch.

**The Rego engine in the compiler** is the low-friction road. It carries a
Wasm-native Rego evaluator, so an operator drops a `.rego` file into `sources` and
attaches the plugin — no external toolchain, and nothing fetched at build time. It
serves all four roles: the same plugin judges the build graph, judges the rendered
output, shapes labels, or injects annotations, according to the role it is attached
at. Its catalog identity is the bare name `rego` under `pluginType: governance` —
the coordinate `governance/rego` — and its version is the compiler release that
ships it. [Writing a policy for it](#writing-a-policy-for-the-rego-engine) is the
next section.

The evaluator reimplements Rego independently rather than embedding the reference
implementation, and it does not implement every Rego builtin. When a policy calls a
builtin the evaluator does not implement, the attachment **fails loudly**: it
returns a fault, not an allow. The build then halts with a fault that names the
plugin — deliberately distinct from a `halt` verdict, so that "the engine cannot
evaluate this policy" is never mistaken for "the policy allows the build." An
unevaluable policy stops the build; it never passes silently.

**The `opa build -t wasm` escape hatch** is the full-fidelity road. When a
policy needs the complete builtin surface or exact reference-engine semantics,
compile it with OPA's own toolchain to a Wasm module and run that module behind
a thin adapter guest. The adapter absorbs OPA's Wasm ABI entirely inside itself
(per [The ABI is Aggrega's own](#the-abi-is-aggregas-own) above): it
instantiates the OPA-built module, sets the input, invokes evaluation, and maps
the decision back to the verdict shape. The host sees only the standard
governance verdict surface.

A reference adapter guest ships as a worked example. It embeds a policy authored
in Rego and pre-compiled with `opa build -t wasm` into a WebAssembly module — a
pinned, checked-in artifact, so evaluation runs entirely in-guest with no OPA
process and nothing fetched. On each build the adapter instantiates that baked
module inside itself with an embedded Wasm interpreter, satisfies the module's
own imports (its linear memory and its builtin callbacks), reads the payload as
the OPA `input` document and the attachment's `settings` as the OPA `data`
document, evaluates each compiled entrypoint, and maps each entrypoint's
`deny` / `warn` / `audit` entrypoint name to a verdict severity — `halt`, `warn`,
and `info` respectively. If a baked
policy needs a host-provided builtin the adapter does not implement, the adapter
**fails loudly** — refusing the module rather than returning an allow — so an
unevaluable policy stops the build instead of passing silently. Regenerating the
baked module from its Rego source is an authoring step run with the OPA CLI, not
a build-time dependency. [`../examples/policy-data-class-route/`](../examples/policy-data-class-route/README.md)
builds that adapter around a module of its own, and gives the commands that
regenerate both.

The two roads share the same host contract, so moving a policy from the engine in
the compiler to the full engine is an attachment change.

## Writing a policy for the Rego engine

The engine evaluates operator-authored Rego entirely inside the guest, at whichever
of the four roles it is attached at. Attaching it twice, at two roles, with two
different policy files, is how one engine covers two moments of the same build.

The payload for the attachment's role is the policy's `input` document, and the
attachment's `settings` object is the policy's `data` document — so a policy reads
an operator-supplied threshold as `data.max_replicas`. Every file the attachment
declares under `sources` becomes a policy module, and every package those files
declare is evaluated.

### Which rule syntax a policy is written in

Rego is written in two rule syntaxes and the engine accepts both, module by module.
A policy set assembled before the current syntax existed therefore evaluates
alongside one written today, in the same attachment.

In the **current syntax** a rule body is introduced by `if`, a rule that collects
into a set says so with `contains`, and the module states which syntax it is
written in by declaring `import rego.v1` on its own line below the package
declaration:

```rego
package example

import rego.v1

deny contains msg if {
    count(input.graph.spec.nodes) > 20
    msg := "this build declares more than twenty nodes"
}
```

In the **older bracketed-head syntax** the value a rule collects sits in brackets
on the rule head and the body follows it directly. A module in that syntax
declares nothing, because it is recognised by not parsing as the current one:

```rego
package example

deny[msg] {
    count(input.graph.spec.nodes) > 20
    msg := "this build declares more than twenty nodes"
}
```

**A module that parses as the current syntax while declaring nothing is refused,
by name.** The declaration is what fixes the reading, and without it the same rule
text can reach the opposite decision: a rule body that never holds contributes no
decision under the current syntax and contributes one under the older syntax — so
a policy that should have stayed silent stops the build, and the mirror case lets
a build through that a rule was written to stop. Rather than pick a reading for
such a module, the engine refuses it and says what to add:

```
policy source "policy.rego" must declare `import rego.v1`. Both Rego rule syntaxes are accepted, and this module parses as either one — so without the import its rules could be read in the older syntax, where the same text can reach the opposite decision. Add `import rego.v1` on its own line below the package declaration.
```

The refusal is a build fault naming the plugin rather than a verdict, so it stops
the build the way an unevaluable policy does and never reads as a policy that
allowed it.

Two edges are worth knowing before they surprise you. A module with **no rule
bodies at all** — one that only declares data — parses as the current syntax, so it
is asked for the declaration too, even though the two readings could not have
differed for it. And a module written in the **older syntax is never refused**,
because it does not parse as the current one: the engine itself is what tells the
two apart, so a deliberate bracketed-head policy is never mistaken for a
current-syntax one that forgot to say so.

### A policy collects its decisions under a decision key

Every role reads a policy's decisions off a **decision key** — a rule the policy
collects into, named. Which keys are read, and what a decision under one means, is
fixed by the role.

At a **verdict** role a decision is a message, and the key it was collected under
fixes the severity that message is reported at. By default the keys are the
conventional Rego collection names:

| Collected under | Reported as | Effect on the build |
| --- | --- | --- |
| `deny` | `halt` | stops the build |
| `warn` | `warn` | surfaces alongside a build that completes |
| `audit` | `info` | recorded; the build outcome is unchanged |

Keep the two vocabularies apart, because they are two: `deny`, `warn` and `audit`
are names in **your policy**, and `halt`, `warn` and `info` are the severities the
**socket** reports from. The left column is yours to rename; the right column is the
closed set every socket shares.

A policy that names its decisions differently declares the mapping in the
attachment's settings:

```yaml
with:
  settings:
    translation:
      - key: blocked
        severity: halt
      - key: advisory
        severity: warn
```

A declared mapping **replaces** the default rather than extending it: the keys it
names are exactly the keys read, so a policy still collecting into `deny` reaches no
verdict once the mapping above is declared. The order the rules are declared in is
the order verdicts are reported in. A key the policy does not declare is an absent
decision rather than a failure, so one policy file may serve several attachments.

A severity outside the three, and a mapping declared empty, are refused by the
settings schema the plugin declares — the host validates an attachment's settings
against it ahead of dispatch. The same key mapped twice is refused when the mapping
is read, which is also before any policy runs. Either way the build halts before a
decision is reached, never with a mapping half-applied.

Settings are otherwise the policy's own data: the mapping is read out of the object
and the object reaches the policy's `data` document unchanged, so a policy written
for the default keys sees exactly the data document it would have seen with no
mapping configured at all.

At a **transform** role a decision is the change to make rather than a message, so
there is no severity to fix and the key is fixed instead: `labels` at the
label-shaping role, `annotations` at the annotation-injecting role. A `translation`
setting is read only where verdicts are reported, so a transform attachment that
declares one is carrying a setting its role does not consume.

**A decision key is read from every package the attachment loads**, so a policy set
may spread its rules across packages and each contributes what it collected. The
other side of that is worth knowing before it bites: within one attachment the
decision key is a reserved rule name in *every* package, so a helper package that
happens to collect into `labels` for its own purposes has its entries read as label
decisions. That fails loudly rather than silently — the attachment reports that
something collected under the key is not a decision of that shape — but the fastest
way to read such a message is as a name collision, so keep the key for the decision
and give a helper rule a different name.

### What each role's payload exposes

The payload is the policy's `input` document, so a policy reads it under the names
the wire gives it.

**The build graph sits at a different path in the two roles that carry one.** A
verdict over the graph receives the whole graph document, so its nodes are at
`input.graph.spec.nodes`; the label-shaping role receives a projection of the nodes,
so its nodes are at `input.graph.nodes`. A rule moved between those two roles is
therefore edited, not copied — and the symptom of forgetting is a rule that never
fires rather than an error, because a path that is not there is simply undefined.

| Role | What a policy reads |
| --- | --- |
| `ir-verdict` | `input.graph` — the whole build graph document: nodes at `input.graph.spec.nodes` keyed by node id, edges at `input.graph.spec.edges`. A value an author declared sensitive reads as `{"aggrega_withheld": "declared"}`. `input.precalculated_paths` — the enumerated routing paths, each carrying its ordered `nodes` list and `attached_features`, the Feature types attached anywhere on it (see below). The list is always present: a build with no route between components carries an empty list. |
| `render-verdict` | `input.artifacts` — one entry per emitted file, each with `path`, `content`, `format`, and `documents`, the parsed documents of the file. `format` is the format the provider that rendered the file declared for it — the Terraform provider declares `hcl` for every `.tf` file it emits and `json` for every `.tf.json` file, a vendored module's files included — and the empty string where no provider declared one, as for a file a Recipe contributes to a boundary's shared output. Such a file is still parsed by its extension, so its `documents` are there either way. An artifact that could not be read structurally carries `parse_error` and no documents, so a policy can reject on the failure itself rather than let an unreadable file pass unexamined. |
| `label-transform` | `input.graph.nodes` — the build's nodes keyed by node id, each with `component`, `resolved_version`, `labels`, and `values`: the values the node's instance declares in the Aggregate, with its templates evaluated against its parameters, absent when it declares none. A value the node's Component declares sensitive reads as `{"aggrega_withheld": "declared"}`, as it does at `ir-verdict`, and its undeclared siblings read as written. A rule reads `input.graph.nodes[id].values` to decide a label; it cannot change a value. `input.compilation_context` — the Release's `release_name` and `environment`, so a policy can decide differently per environment. |
| `annotation-transform` | `input.targets` — every component the attachment may annotate, each with `boundary_path`, `component_name` — for a component a routing entry places, its id in the build graph, such as `metrics.query` — and the `annotations` the Release writes on the component itself, each value as written: a string, an object of subkeys, or `null` where the component opts out of an annotation it would inherit. Every key the component carries is present whatever its value, so a rule can leave alone a key someone already wrote. `input.binding_keys` — the annotation keys the Manifest registers a binding for. |

**A Terraform resource reads at a different path in each of Terraform's two forms.**
In the `documents` of a native `.tf` file a block nests under its type and then
under each of its labels, and the last label holds a list of blocks, because blocks
sharing a type and labels collect into one list in source order. A resource
attribute therefore reads at
`input.artifacts[_].documents[_].resource.<type>.<name>[_].<attr>` — for an RDS
instance of any name,
`input.artifacts[_].documents[_].resource.aws_db_instance[_][_].allocated_storage`.
A `.tf.json` file is read as the Recipe wrote it, so its conventional object form,
where the name holds the block itself, reads at `resource.<type>.<name>.<attr>`, and
a policy meant for both forms reads both paths. That holds for both policy engines
inside the compiler. A Rego rule written for the other form finds the path it names
undefined: a rule testing for a value there never fires, and one refusing on an absent
value, with `not`, fires on every resource; a CEL expression that indexes or selects into the other
form stops the build with an evaluation fault naming its policy file. The reference
Rego render adapter, described under
[Render-stage policy adapters](#render-stage-policy-adapters) below, parses a native
`.tf` file itself and reads a single block as an object, so a Terraform path is
edited, not copied, when a policy moves between that adapter and an engine inside
the compiler.

Every role additionally carries `input.sources` — the attachment's own files, each
with its base-name `path` and its `content`. A policy runs only as one of those files,
so wherever a rule reads the list it holds at least that file.

`input.settings` is the attachment's settings object, the same object as the
policy's `data` document, and it is there when the attachment declares settings.
When the attachment declares none, what a rule finds depends on the role: at
`ir-verdict`, `label-transform` and `annotation-transform` the field is absent, so
`input.settings` is undefined like any path the payload does not carry, and at
`render-verdict` it is the empty object. So a rule that depends on whether a
setting was configured tests the setting it reads rather than the object, which
behaves the same at every role — a configured `max_nodes` is read, and an
unconfigured one leaves `input.settings.max_nodes` undefined and the rule silent:

```rego
package example

import rego.v1

deny contains msg if {
    limit := input.settings.max_nodes
    count(input.graph.spec.nodes) > limit
    msg := sprintf("this build declares more than %v nodes", [limit])
}
```

The CEL engine treats an undeclared settings object differently, and says so in its
own section below.

`attached_features` and `binding_keys` are lists rather than objects, so a policy
tests membership with `in`:

```rego
package security

import rego.v1

deny contains msg if {
    some path in input.precalculated_paths
    some gateway in path.nodes
    input.graph.spec.nodes[gateway].labels["dataplane.aggrega.ai/content-masking"]
    not "core/data-masking" in path.attached_features
    msg := sprintf("path %v passes through %v with no masking Feature attached.", [concat(" -> ", path.nodes), gateway])
}
```

`attached_features` is the union of the Feature types of every attachment held by
any node on the path — an attachment written on one of that node's connections
included, whichever connection it was written on — so the rule is satisfied by a
`core/data-masking` attachment on the gateway itself, which is where that Feature
attaches: it selects on the content-masking capability the gateway declares. What
the attachment masks is the chat and completion text passing through that gateway;
the rule checks that the attachment exists, not what it lists.

Because it is a union over the whole path, the list says that a Feature is attached
somewhere on a route and never where. A rule that has to know whether a Feature sits
*between* two particular components of a route — the one holding restricted data
and the one it reaches — reads the route's `nodes` in order and each node's own
attachments, at `input.graph.spec.feature_values_mapping[<node>]`; asked of
`attached_features`, the same question passes a route on which the Feature sits
beyond the second component.
[`../examples/policy-data-class-route/`](../examples/policy-data-class-route/README.md) is
written that way, for the Rego engine, the CEL engine and OPA.

A node object carries no id of its own: the id is the key it sits under in
`input.graph.spec.nodes`, which is why the rule above carries the ids it read from
`path.nodes` into its message rather than reading an `id` field.

### The order a policy meets a map's keys in

The graph keeps the order its author wrote: the nodes in the order the components
were declared, and each node's labels in the order the node carries them. That
order crosses into the guest intact — the payload carries both as ordered entries
(see [maps that keep their order](plugin-contract.md#maps-that-keep-their-order)).
Whether a policy meets it is decided by how the engine evaluating the policy holds
an object, not by the payload:

- **The Rego engine holds an object's keys sorted.** A rule iterating
  `input.graph.spec.nodes`, a node's `labels`, or any other object — one written in
  the policy itself included — meets the keys in sorted order: components declared
  `web`, `api`, `metrics` are met as `api`, `metrics`, `web`.
- **The CEL engine fixes no order for a map.** A comprehension over
  `input.graph.spec.nodes` or over a node's `labels` can meet the keys in a
  different order on two builds of identical input, and two walks of the same map
  within one expression can differ from each other. That is why
  [the messages under one decision key are sorted](#ordering-sorted-within-a-key-and-a-total-order-over-decisions):
  write a rule whose decision does not depend on the position a key sits at.
- **A guest written against a plugin kit meets the author's order.** Decoded
  through its kit, the nodes and each node's labels arrive in the kit's
  order-keeping container in the order the payload carries them, and the
  governance adapter skeleton each kit ships hands its engine a JSON document
  written in that same order. An engine that converts that document into a value
  type of its own meets that type's order instead, as
  [maps that keep their order](plugin-contract.md#maps-that-keep-their-order)
  describes.

### Shaping labels: a policy names the label, and the engine addresses it

At the label-shaping role a policy collects one decision per label under `labels`,
naming the node, the label key, and the value the label takes:

```rego
package tagging

import rego.v1

labels contains {"node": id, "key": "compliance.example.com/tier", "value": "gold"} if {
    some id, node in input.graph.nodes
    node.labels["component.aggrega.ai/type"] == "stateful-server"
}
```

Setting a key that is already present replaces its value. A decision may instead ask
for a key to be dropped:

```rego
labels contains {"node": id, "key": "draft.example.com/scratch", "op": "remove"} if {
    some id, node in input.graph.nodes
    node.labels["draft.example.com/scratch"]
}
```

A policy names the label rather than writing the edit instruction the build applies,
and the reason is worth knowing: the instruction addresses a label by path, and an
Aggrega label key routinely contains a `/`, which is the path separator — so a
hand-written path would address a nested location instead of one label. The engine
addresses the label the decision names, so the escaping is written once instead of in
every policy, and a policy stays readable as a statement about labels rather than
about paths.

A decision may only change a label. Every instruction the engine emits addresses one
label on one node, so a policy has no way to express a change to a node's Component,
its resolved version, the set of nodes, or a label value that is not a string. A
decision naming a node the build does not have, or dropping a label the node does not
carry, is refused by the build with a message naming the instruction — never silently
ignored.

[`../examples/policy-label-transform/`](../examples/policy-label-transform/README.md)
attaches such a policy beside the two built-in tagging plugins, and a verdict over the
graph that reads the labels they write. What each of those plugins reads and writes is on
[The built-in tagging plugins](tagging-plugins.md).

### Injecting annotations

At the annotation-injecting role a policy collects one decision per annotation under
`annotations`, naming the target by the coordinate the target itself carries, plus
the key and its value:

```rego
package tagging

import rego.v1

annotations contains {
    "boundary_path": target.boundary_path,
    "component_name": target.component_name,
    "annotation_key": "backup.example.com/schedule",
    "annotation_value": "nightly",
} if {
    some target in input.targets
    not target.annotations["backup.example.com/schedule"]
}
```

The field names a decision writes are the field names it read its targets under, so
the convention is learnable from the payload alone. Reading `input.binding_keys`
lets a policy inject only keys the Manifest has registered a meaning for — those
are the ones that expand into a Feature attachment.

A decision's value is one you could write on that annotation yourself: a string,
or an object of subkeys. A binding that routes one subkey takes a string; a binding
that routes several takes an object naming each of them, exactly as an operator
writes it in the Release:

```rego
annotations contains {
    "boundary_path": target.boundary_path,
    "component_name": target.component_name,
    "annotation_key": "feature.aggrega.ai/monitoring",
    "annotation_value": {"interval": "30s", "port": "metrics", "path": "/metrics"},
} if {
    some target in input.targets
    not target.annotations["feature.aggrega.ai/monitoring"]
}
```

The build reads an injected value exactly as it reads the same value written in the
Release, so it expands the same way and is checked against the bound Feature the
same way. The engine holds an object's keys sorted, so the subkeys reach the build
in sorted order. A value of any other shape — `null`, a list, a number, a boolean,
or an object with no subkeys — is refused by the build, naming the injection: the
role adds annotations, and `null` or an empty object reads as the opt-out an author
writes to remove one. A decision naming a component the payload does not carry is
refused the same way, naming the coordinate and the annotation.

Where the build refuses an injected annotation for how it routes or what it carries
— a string fed to a binding that routes several subkeys, a subkey value the bound
Feature's schema does not admit, or a subkey routed through the `values` pillar,
which a Release-side annotation may not use — the refusal names the plugin that
injected it and the governance role it is attached at, so the value is traced to the
policy that decided it rather than to a line of the Release nobody wrote.

[`../examples/policy-annotation-transform/`](../examples/policy-annotation-transform/README.md)
attaches such a policy, injecting a string under one binding and an object of subkeys
under another, and builds the same files as a Release writing those annotations by hand.

### Attaching a whole policy set as one archive

A policy set is attached file by file, or as a single archive carrying its policy
files and its data documents together — the shape a Rego toolchain builds. An
attached file's content travels to the guest as text, and a compressed archive is
arbitrary bytes rather than text, so an archive is attached base64-encoded, named so
that its name ends `.base64`:

```sh
tar czf bundle.tar.gz policy.rego data.json
base64 -w0 bundle.tar.gz > bundle.tar.gz.base64
```

```yaml
with:
  sources:
    - ./policies/bundle.tar.gz.base64
```

The name is what marks a file as an archive rather than as policy text, which keeps
the choice the operator's own statement: a damaged archive is then reported as a
damaged archive, naming the file and the step that failed, instead of being read as
a policy file that does not parse. Encoding the archive is a step the operator adds
after their toolchain has built it.

Inside the archive, every `.rego` member is a policy module and every `data.json` or
`data.yaml` member is a data document nested under the directory it sits in — a
`limits/data.json` holding `{"max": 3}` is read by a policy as `data.limits.max`.
Members of any other kind are carried by the archive for its own toolchain and are
not policy input.

An archive that cannot be opened is a failure naming the attached file: an encoding
that does not decode, a stream that does not decompress, a truncated archive, a data
file that does not read, or an archive holding no policy at all. None of them yields
an empty policy set, because an empty policy set reaches no decision — and "the
archive was unreadable" must never be indistinguishable from "the policy allowed the
build".

## Writing a policy for the CEL engine

The engine evaluates operator-authored CEL entirely inside the guest, at whichever
of the four roles it is attached at. Its catalog identity is the bare name `cel`
under `pluginType: governance` — the coordinate `governance/cel` — and its version is
the compiler release that ships it. Attaching it twice, at two roles, with two
different policy files, is how one engine covers two moments of the same build.

```yaml
plugins:
  governance:
    - uri: governance/cel:<version>
      role: ir-verdict
      with:
        sources:
          - ./policies/topology.cel
        settings:
          max_nodes: 20
```

A policy addresses the whole payload through one name, `input`, so the names it reads
are the names the wire gives them: the build graph at `input.graph`, the enumerated
routing paths at `input.precalculated_paths`, the rendered files at
`input.artifacts`, the annotation targets at `input.targets`. Those per-role paths are
the ones tabulated in [What each role's payload exposes](#what-each-roles-payload-exposes)
above, and they are identical for both engines — one wire, read under one root name.

The attachment's own files are at `input.sources` and its settings at
`input.settings`, so an operator-supplied threshold is read as
`input.settings.max_nodes`. There is no second document to learn: settings are part of
`input` like everything else. Both are always present as a value — the settings are the
empty object at every role when the attachment declares none — so an expression
addressing them does not have to guard for their absence, and whether one setting was
configured is a test on its key: `has(input.settings.max_nodes)`.

### The two authored forms, and the file name that chooses between them

A policy is attached in either of two forms, and **the file's name says which**:

| File name ends in | Read as |
| --- | --- |
| `.cel` | one expression, evaluated as it stands |
| `.yaml` or `.yml` | a rules document — a list of rules |
| anything else | one expression |

The name is the whole rule. No setting selects a form, and the file's text is not
examined to guess one — it could not answer the question anyway, because an
expression's own outermost value is a map and so is a rules document's, which makes
the two forms indistinguishable by shape.

**So the rule cuts both ways, and both mistakes are refused rather than
misread.** A rules document named `policy.cel` is refused, because a list of YAML
rules is not an expression; an expression named `policy.yaml` is refused, because an
expression is not a list of rules. Each refusal names the file. Renaming the file is
the fix in both directions.

A policy set is as many files as it needs, and the two forms mix freely within one
attachment.

### An expression, in a file named `.cel`

An expression language has no rule names to collect decisions under, so the decisions
*are* the value the expression produces: **a map from decision key to what that key
collects.** At a verdict role a key collects the messages reached under it; at a role
that shapes the build it collects the decisions to apply.

```cel
{
  "deny": input.graph.spec.nodes
            .filter(n, input.graph.spec.nodes[n].resolved_version == "latest")
            .map(n, "component " + n + " tracks the latest version; pin it"),
  "warn": size(input.graph.spec.nodes) > input.settings.max_nodes ? ["this build declares a lot of components"] : [],
}
```

A key the file omits reached no decision there, so a file need not name every key —
and each role reads only the key it is about, so one policy set can serve a verdict
role and a role that shapes the build from the same files. A key carries a list of
what it collects, a single one of them, or the null value for none.

An expression that evaluates to anything other than a map is refused, naming the shape
to write. A bare `size(input.graph.spec.nodes) <= 5` is the mistake worth expecting:
it is a boolean, and reading `false` as a halt would mean inventing a message the
author never wrote.

### A rules document, in a file named `.yaml` or `.yml`

A rules document is a list of rules, each naming the decision key it reaches, the
expression that decides whether it is reached, and what is reported when it is:

```yaml
- key: deny
  expression: size(input.graph.spec.nodes) > 20
  message: this build declares a lot of components
- key: warn
  expression: has(input.settings.max_nodes)
  message: a component ceiling is configured for this environment
```

What a rule reports follows the decision key it reaches, exactly as it does in an
expression. **Text** is the message a verdict carries. A **mapping** is the fields of
the one decision a role that shapes the build reads:

```yaml
- key: labels
  expression: input.compilation_context.environment == "production"
  message:
    node: app
    key: compliance.example.com/tier
    value: gold
```

Which of the two a rule writes is decided by the rule alone — there is no setting that
selects it — and a rule writing the wrong one for its key is refused, by name.

One YAML detail worth knowing before it bites: an expression that begins with a double
quote has to be quoted for the document reader, because a value opening with `"` is
read as a quoted scalar rather than as text beginning with a quote.

```yaml
- key: annotations
  expression: '"backup.example.com/schedule" in input.binding_keys'
  message:
    boundary_path: main
    component_name: app
    annotation_key: backup.example.com/schedule
    annotation_value: nightly
```

**A rules document is read as the expression it stands for before anything is
evaluated.** Each rule becomes its decision key carrying its report when the
expression holds and nothing when it does not, and rules sharing a key are joined. So
one evaluator runs both forms, and a rules document decides exactly what the
expression it stands for decides — at every role, verdicts and build-shaping decisions
alike. Two consequences follow. A document and the hand-written expression it stands
for reach the same decisions, because they are the same evaluation. And the ordering
rules below are the evaluated form's rather than the document's — a document's rules
are not reported in the order they were written.

### Which form fits — they are not interchangeable

Both forms run through one evaluator, so neither is faster or more trustworthy than
the other. What differs is what each can *say*, and because two forms are two things
to learn, the split is worth stating plainly rather than leaving to taste.
**Pick by what the rule reports.**

- **A rules document, when the report is fixed.** The message or the decision is
  written once, beside the expression that reaches it, and the file reads as a list of
  guards. This is the shorter form for "if this is true, say exactly this".
- **An expression, when the report names what it found.** One expression filters the
  components of a build and produces a message — or a decision — *per component*, so a
  reader gets `component payments tracks the latest version; pin it` for each offender
  rather than one sentence about a count.

That second job is the one a rules document cannot do: each of its rules carries one
report, written in advance, so it has nothing to say about which component tripped it.
Reaching for the document form and then wanting the offender's name in the message is
the path that ends in rewriting the rule as an expression, so it is worth choosing on
that question up front.

### What an expression can say

The expressions this engine evaluates use the `filter`, `map` and `exists`
comprehensions, `+` on strings and on lists, `size`, `in`, `startsWith`, `string()`,
the conditional operator, and a list indexed by a computed integer. They do not
offer the extension functions some CEL environments add: `join`, `split`,
`substring`, `indexOf`, `flatten`, `cel.bind` and `lists.range` are each refused as an
undeclared reference, and a comprehension takes one variable, so a two-variable form
such as `exists(i, v, …)` is refused the same way. A refusal is a build fault naming
the file and the reference:

```
policy source "routes.cel" could not be evaluated: Undeclared reference to 'join'
```

Three consequences shape a rule that walks a route:

- **There is no way to name an intermediate value.** A sub-expression used twice is
  written twice, or bound by mapping a one-item list: `[value].map(name, …)[0]`
  evaluates its body once with `name` bound to `value`.
- **There is no way to walk a list's positions.** A rule comparing a route's
  components by position takes the positions from its settings — a `positions` list
  such as `[0, 1, 2, …]` — and indexes the route at each, so it has to guard a route
  longer than the list itself, by halting on one, rather than read it in part.
- **A decision key collects messages, not lists of them.** An expression producing one
  list of messages per route is refused under a decision key — the fault says it
  collected a value of type list rather than a message — so a rule produces one
  record per route and builds the message from it. And a message the expression
  produces twice is reported twice: the sort described below orders what a key
  collected, and does not remove a repeat.

[`../examples/policy-data-class-route/`](../examples/policy-data-class-route/README.md) carries
a CEL rule written under all three, beside the same rule for the Rego engine.

### Decision keys and severities

The decision keys, the default mapping onto severities, and the `translation` setting
that renames them are the same as for the Rego engine — see
[A policy collects its decisions under a decision key](#a-policy-collects-its-decisions-under-a-decision-key)
above. By default `deny` reports at `halt`, `warn` at `warn`, and `audit` at `info`; a
declared `translation` replaces that default rather than extending it, and the order it
declares is the order verdicts are reported in.

Both engines declare the same settings schema for it, so a `translation` block means
the same thing whichever language expresses the decisions, and a malformed one is
refused before any policy runs.

At a role that shapes the build the key is fixed rather than mapped: `labels` at the
label-shaping role, `annotations` at the annotation-injecting role.

### Ordering: sorted within a key, and a total order over decisions

**The messages under one decision key are reported in sorted order.** That is part of
the contract rather than a presentation choice, and the reason is worth carrying: a
comprehension over a map — `.filter(...)` and `.map(...)` over `input.graph.spec.nodes`,
which is the most natural way to write a per-component rule — walks that map in an
order the evaluator does not fix. Left alone, identical input would report the same
messages in a different sequence on every build. Sorting removes that.

Two things follow that are easy to read as bugs and are not:

- **A rules document's rules are reported sorted too**, not in the order they were
  written — because the document is evaluated as the expression it stands for, and the
  sort applies to what a key collected.
- **A hand-written list is sorted as well.** A key carrying `["second", "first"]`
  reports `first` before `second`. Nothing in an evaluated result distinguishes a list
  the author typed out from one a comprehension produced, so there is no authored order
  to preserve.

Across keys the order is the `translation`'s declared order. Across files it is the
order of the file names, because an attachment's sources arrive sorted by name
rather than in the order the attachment lists them.

At a role that shapes the build the same reasoning applies to the decisions
themselves, and the order is stronger: **decisions are reported in ascending order of
everything they name**, which is a total order over what a decision can express — the
node, then the label key, then whether the label is added or dropped, then the value;
and for an injection, the boundary, then the component, then the annotation key, then
its value. A change to labels or annotations reaches the rendered output, so an
arbitrary order would mean identical input rendering differently from one build to the
next.

### Shaping labels

At the label-shaping role a policy collects one decision per label under `labels`,
naming the node, the label key, and the value the label takes:

```cel
{
  "labels": input.graph.nodes
              .filter(n, input.graph.nodes[n].labels["component.aggrega.ai/type"] == "stateful-server")
              .map(n, {
                "node": n,
                "key": "compliance.example.com/tier",
                "value": input.compilation_context.environment == "production" ? "gold" : "bronze",
              }),
}
```

Setting a key that is already present replaces its value. A decision may instead ask
for a key to be dropped, by naming `op` as `remove`:

```cel
{
  "labels": input.graph.nodes
              .filter(n, "draft.example.com/scratch" in input.graph.nodes[n].labels)
              .map(n, {"node": n, "key": "draft.example.com/scratch", "op": "remove"}),
}
```

One decision needs no list around it, and a file naming no `labels` key decides no
labels.

A policy names the label rather than writing the edit instruction the build applies,
for the reason given in the Rego engine's
[label-shaping section](#shaping-labels-a-policy-names-the-label-and-the-engine-addresses-it):
an Aggrega label key routinely contains a `/`, and a hand-written path would address a
nested location instead of one label. The engine addresses the label the decision
names.

**Reading a label a node may not carry is a failure rather than an empty value**,
which is why the second example asks whether the key is present before reading it.
That is the expression language's own rule about reading an absent key, and it is
loud: a policy reaching for a label no node carries reports that it could not be
evaluated instead of quietly deciding nothing.

A decision may only change a label. A decision naming a node the build does not have,
or dropping a label the node does not carry, is refused by the build with a message
naming the instruction — never silently ignored.

**Reach one decision per node and label key.** A rule that can produce two different
values for the same label on the same node is under-specified: resolve the value inside
the expression — with a conditional, or with a filter that admits one branch — rather
than emitting both decisions.

[`../examples/policy-label-transform/`](../examples/policy-label-transform/README.md)
shows the label-shaping role end to end, with its policy written for the Rego engine.

### Injecting annotations under a registered key

At the annotation-injecting role a policy collects one decision per annotation under
`annotations`, naming the target by the coordinate the target itself carries, plus the
key and its value:

```cel
{
  "annotations": input.targets
                   .filter(t, "backup.example.com/schedule" in input.binding_keys)
                   .map(t, {
                     "boundary_path": t.boundary_path,
                     "component_name": t.component_name,
                     "annotation_key": "backup.example.com/schedule",
                     "annotation_value": "nightly",
                   }),
}
```

The field names a decision writes are the field names it read its targets under, so
the convention is learnable from the payload alone. Reading `input.binding_keys` lets a
policy inject only keys the Manifest has registered a meaning for — those are the
ones that expand into a Feature attachment. Every field is required: an annotation with
an empty key or an empty component name is not something a policy meant to ask for. The
boundary a component sits under can legitimately be named by the empty string, so that
field must be present but may be empty.

The value is one you could write on that annotation yourself: a string, or a map of
subkeys, which is what feeds a binding that routes several subkeys at once —
`"annotation_value": {"interval": "30s", "port": "metrics", "path": "/metrics"}`. The
engine writes a map's subkeys in sorted order, since the expression language fixes no
order for a map, and passes the value on as the expression produced it; a value the
JSON model cannot hold — bytes, a timestamp, a duration — is refused rather than
turned into text. The build then reads the value exactly as it reads the same value
written in the Release, and refuses `null`, a list, a number, a boolean or an empty
map, naming the injection. Two decisions for one component and key with different
values are ordered by the value's JSON. A target's `annotations` carry each existing
value as written — a string, a map, or `null` for an opt-out — so testing
`"feature.aggrega.ai/monitoring" in t.annotations` finds a key whatever its value.

A decision naming a component the payload does not carry is refused by the build,
naming the coordinate and the annotation. Where the build refuses an injected
annotation for its routing, its subkey values or its pillar, the refusal names the
plugin that injected it and the role it is attached at. As with labels, **reach one decision per component and annotation key**, resolving
the value inside the expression rather than emitting two decisions for one key.

[`../examples/policy-annotation-transform/`](../examples/policy-annotation-transform/README.md)
shows the annotation-injecting role end to end, with its policy written for both engines.

### When a policy or a decision cannot be read

A policy the engine cannot read, cannot evaluate, or that produces something other
than decisions in the documented shape makes the build **fail** rather than return a
verdict or a change. The failure is reported as a build fault naming the file and,
where the fault belongs to one part of the file, the position within it — deliberately
distinct from a `halt` verdict, so that "this policy could not be evaluated" is never
mistaken for "this policy allows the build".

For an **expression**, that covers a source that does not parse — reported with the
parser's own line and column and a caret under the offending position — and a source
that evaluates to something other than a map from decision key to what that key
collects.

For a **rules document**, it covers text that is not a list of rules, a list with no
rules in it, a rule missing a field or carrying an empty one, a field the form does not
define, a report that is neither text nor a mapping of text to text, and an expression
that cannot be read. A fault belonging to one rule names that rule's position —
counted from one, the way an author counts their own file — and its decision key. A
rule whose expression does not parse is refused before evaluation, so the caret lands
inside the expression the author wrote rather than at a position in translated text
they never saw.

For a **decision at a role that shapes the build**, it covers a message where a
decision belongs, a missing coordinate, and a field this engine's decision form does
not define. That last one is worth stating on its own: a misspelled `annotation_valu`
is **refused, not ignored**, so the mistake is reported rather than quietly injecting
an empty value and leaving a build that completes without the change. Every such
refusal names the file and ends by naming what a decision of that kind must name.

## Render-stage policy adapters

A render-stage adapter reasons over the build's **rendered output** rather than
its IR graph. The render payload carries the emitted artifacts — each with its
output path and its rendered content, and, where they apply, the format it was
rendered in and a parsed structured view of it — plus the attachment's own sources
and settings, each where the attachment declares it. An adapter reads that content for the output shape it targets,
evaluates a policy over the structured result, and maps the outcome to
`halt` / `warn` / `info` verdicts. Because the payload names no output shape of its
own, one adapter pattern serves any render target; a new output shape is a new
adapter, not a host change.

Each render-stage adapter is an adapter in the sense above: it speaks the Aggrega
ABI outward and absorbs a target-specific format or a foreign policy engine's
contract inward, so the compiler stays free of any output-format or policy logic.
The Rego and CEL engines in the compiler serve the `render-verdict` role directly; beyond
them, two reference render-stage adapters ship as worked examples among the plugin
development kit's Rust examples, one per common output shape.

[`../examples/policy-render-verdict/`](../examples/policy-render-verdict/README.md)
attaches one rule at `render-verdict` over the output of every target — Kubernetes
objects, a Docker Compose file, a Terraform root configuration, a
CloudFormation template and an Azure Resource Manager template — written once for each engine in the compiler, and
checks that each target's planted violation halts and its control passes.

To write an adapter of your own, at this role or any other, start from the
governance adapter skeleton each plugin development kit ships:
[Writing a governance plugin of your own](writing-a-governance-plugin.md) walks it
from the skeleton to a build it refuses.

**An Azure Resource Manager template reads as JSON.** The `arm` provider writes `arm-template.json`, whose `documents` hold one object. Its `resources` is an object keyed by symbolic name, so a policy reads `input.artifacts[_].documents[_].resources.<symbol>` or ranges over `resources` with `some resource in doc.resources`. The provider always writes that object; `is_object(doc.resources)` keeps a rule off any other document of the build whose top-level `resources` holds a list. A resource a Recipe sources from a module is a nested deployment, of type `Microsoft.Resources/deployments`, and its parameters sit at `properties.parameters.<name>.value`, so a policy over those resources reads them there rather than among the module's own resources. [`policy-render-verdict`](../examples/policy-render-verdict/README.md) reads container images this way.

### YAML, JSON, and Terraform HCL output — the reference Rego render adapter

The reference Rego render adapter runs operator-supplied Rego over any YAML or
JSON render output, and over Terraform's native-HCL output. It is a worked example
of the render-stage shape: the same Wasm-native Rego evaluator as the engine in the
compiler, and the same `deny` / `warn` / `audit` collection convention mapped onto
the same three verdict severities, reasoning over rendered files rather than over
the build graph.

It is **output-shape independent** across YAML/JSON targets. The adapter parses
each artifact's content as one or more YAML or JSON documents — YAML is a
superset of JSON, so a JSON template such as a CloudFormation stack parses
through the same parser — and exposes the parsed documents to the policy
alongside the raw content. A policy reasons over the structured render output of
any such target with ordinary Rego: `input.artifacts[_].documents[_]` yields the
parsed documents (a Docker Compose file's `services`, a CloudFormation template's
`Resources`), `input.artifacts[_].content` yields the raw text, and the
attachment's `settings` object is the Rego `data` document. A require-approved-
registry policy over Docker Compose output, for instance, denies any service
whose image carries no registry prefix.

The adapter also reasons over Terraform's **native-HCL** render output. A native
`.tf` file is neither YAML nor JSON, so the adapter projects it into the same
canonical object a Terraform-JSON (`.tf.json`) file already parses to: a policy
reads a resource attribute at
`input.artifacts[_].documents[_].resource.<type>.<name>.<attr>` — for an RDS
instance, `input.artifacts[_].documents[_].resource.aws_db_instance[_].allocated_storage`
— the same way whichever Terraform form the compiler emitted. Attribute types are
preserved (a number stays a number, a boolean a boolean), and an unresolved
Terraform expression stays a string in its `${ ... }` form. Terraform-JSON bodies
(`.tf.json`, `.auto.tfvars.json`) parse through the YAML/JSON path unchanged, and
a Terraform template file (`.tftpl`) — template text rather than standalone
configuration — is not projected and surfaces `parse_error` like any
non-structured content.

**That list says what the adapter's parser accepts, not what the compiler emits.**
The two are not the same set, and an auto-loaded variables file is the case where
they differ: the compiler emits no such overlay on any path — a sourced module's
inputs are the arguments of that component's module block in the boundary's root
configuration — so the shape reaches a policy's view only when a vendored module
ships one of its own, which the sourced path copies into the output verbatim. A
policy written to expect the compiler to produce one will never fire.

When an artifact's content does not parse, the adapter does not silently allow it:
it keeps the raw content, exposes no parsed documents for that artifact, and
records the parser's message under `input.artifacts[_].parse_error`, so a policy
can stop the build on a malformed artifact explicitly. As with the Rego engine in the compiler, a
policy that calls a builtin the embedded evaluator does not implement **fails
loudly** — a fault naming the plugin, never a silent allow.

### Kubernetes output — the Kubewarden render adapter

The Kubewarden render adapter runs Kubewarden-style admission policies over
rendered Kubernetes manifests. It absorbs the Kubernetes admission-review
contract inward: a Kubewarden policy receives a request wrapping a single object
and returns an accept-or-reject response. At the render stage the build's output
already *is* a set of Kubernetes resources, which makes that stage the natural
place to run an admission-shaped policy. For each rendered object the adapter
derives the admission fields from the parsed object itself, wraps the object in
an admission-review-shaped request inside the guest, runs the policy, and maps
the response to a verdict: a rejection becomes one verdict; an acceptance emits
nothing. The bundled reference policy is a require-label rule — every object must
carry a label key named by `settings` — a common Kubewarden pattern.

### Scope shared by render-stage adapters

- **Render stage, one output shape per adapter.** A render-stage adapter reasons
  over rendered artifacts, not the IR graph, and targets the output shape it
  parses — YAML/JSON and Terraform native HCL for the reference Rego render
  adapter, Kubernetes objects for the Kubewarden adapter. A graph-stage policy, or a
  policy over an output shape no shipped adapter parses, is a different guest.
- **Validating only.** A render-stage adapter accepts or rejects; it never
  returns a mutated object. A mutating policy's mutated object is ignored — the
  compiler never rewrites rendered output from a policy verdict. A policy decides;
  it does not edit.

## Attaching a policy

An operator attaches a governance plugin through the `plugins.governance` list in
the workspace configuration (`.aggrega-config.yaml`). Each entry names a plugin, the
`role` it is attached at, and, optionally, the `with` channel that supplies its
rules and tunables:

```yaml
plugins:
  governance:
    - uri: <resolvable-plugin-reference>
      role: ir-verdict
      with:
        sources:
          - ./policies/replicas.rego
        settings:
          max_replicas: 3
```

The `uri` resolves to the plugin. The host reads each `sources` file at build time
and hands its bytes to the guest, and passes `settings` through verbatim. A build
with no governance plugin attached runs the socket as a no-op, so attachment is
purely additive to a workspace.

One plugin serving several roles is attached once per role, each attachment with its
own rules and its own settings:

```yaml
plugins:
  governance:
    - uri: governance/rego:<version>
      role: label-transform
      with:
        sources:
          - ./policies/tagging.rego
    - uri: governance/rego:<version>
      role: ir-verdict
      with:
        sources:
          - ./policies/topology.rego
        settings:
          translation:
            - key: blocked
              severity: halt
```

**Which version an attachment names.** A `uri` names a Plugin entity — the
`<pluginType>/<name>` coordinate and, after the colon, a version — and the version
takes part in resolution. For the two engines compiled into the CLI, the entity
comes from one of two places. Each compiler release publishes the Plugin entities
of `governance/rego` and `governance/cel` at its own version, and the
standard-library catalog carries them, each at the version of the release that
published it; a workspace reads them from the catalog directories it lists. The
`aggrega` binary carries one entity of each, at its own release's version and no
other. An attachment naming a version that neither carries, and that no pull has
fetched into the content cache, stops the build with `E0137`, naming the
reference.

So an attachment names a version the catalog the workspace reads carries. That
version resolves from the catalog under a release of `aggrega` other than its own
as well, while a version only the binary carries — its own release's — resolves
with that release alone, at a verdict role and at a transform role alike. At a
transform role the pull pins the version it resolved in the lockfile, and refuses
with `E0103` a version that neither a catalog the workspace reads nor the binary carries. The version selects the Plugin entity, which records the
plugin's exports and runtime limits, and not the engine: once the reference
resolves, the engine that runs is the one compiled into the binary running the
build, because the plugins built into the binary are the first place a plugin's
module is read from. A governance plugin the workspace declares itself — a Plugin
entity in its own catalog directory, its `.wasm` beside it — is named at the
version that entity records.

Each role selects a default entry function — `verdict_ir` for the role that judges
the graph, `verdict_render` for the role that judges the rendered artifacts,
`mutate` for the label-shaping role, `transform_annotations` for the
annotation-injecting role — and an attachment may point a role at a different export
with `function:`. The host refuses a dispatch to an export the guest did not declare
in its `describe()` self-report, so an attachment naming a role its guest does not
serve is reported by name, before the guest runs, rather than quietly doing nothing.

`function:` names an export on the plugin the `uri` names. An attachment in a verdict
role — `ir-verdict` or `render-verdict` — that names a `function:` and no `uri:` names
a function on no plugin, so the configuration is refused as it is read, under
[`E0224`](../errors/fatal-halts.md#the-workspace-configuration-is-invalid), naming the
file and the entry's place in its list: add the `uri` of the plugin that exports the
function.

The `plugins.governance` list has an additive companion, `plugins.governance_append`:
entries in the companion are concatenated onto the resolved `governance` list at each
configuration layer, so a workspace or a global config composes policy
attachments rather than shadowing a base list.

### The CI-owned overlay

Beside the hand-authored `.aggrega-config.yaml`, an automated pipeline can own a
separate overlay file, `.aggrega-config-append-ci.yaml`. It exists so a pipeline
can attach policies (or other list-valued config) it controls without ever
editing the developer's hand-authored base config — the pipeline may overwrite
its own overlay file wholesale.

The overlay is strictly additive. It validates against the same configuration
schema as the base file, and for each list-valued field its entries are
concatenated onto the resolved list. It can only add: it cannot remove a base
entry and cannot scalar-override a base value — a scalar or map key it carries
has no additive meaning and is ignored (and named in a resolution warning)
rather than applied. And it never anchors a workspace root: only a
`.aggrega-config.yaml` carrying a `workspace:` block does that, so dropping the
overlay into a directory adds attachments without changing where the workspace
begins.

This gives a pipeline a clean seam to enforce organization-wide policy: the
pipeline drops a `.aggrega-config-append-ci.yaml` naming the mandatory policy
plugins, and those attachments merge on top of whatever the developer authored,
never in place of it.

```yaml
# .aggrega-config-append-ci.yaml — owned by the pipeline, additive only
plugins:
  governance_append:
    - uri: <organization-policy-plugin-reference>
      role: render-verdict
      with:
        settings:
          required_label: app.kubernetes.io/name
```

[`examples/policy-org-overlay/`](../examples/policy-org-overlay/README.md) builds
one workspace with a team's attachment, an organization's added through a global
configuration file's `governance_append`, and a pipeline's added through this
overlay, and checks what each combination prints and whether it completes.

## Testing a policy before it gates a build

A Rego rule that names a path its role's payload does not carry is not an error:
the path is undefined, the rule never holds, and the build completes as though
the policy allowed it. So a new policy earns `halt` in three moves: attach it at a
severity that reports without stopping, check every path it names against the
payload its role receives, and read what it reports on the builds it will judge.

The commands below run in a copy of
[`examples/policy-org-overlay/`](../examples/policy-org-overlay/README.md) whose
`.aggrega-config.yaml` attaches one new policy in place of the team's. It is meant
to refuse a datastore that runs with high availability off, and its rule was
copied from a label-shaping policy:

```rego
package datastores

import rego.v1

deny contains msg if {
    some id, node in input.graph.nodes
    node.labels["component.aggrega.ai/category"] == "datastore"
    input.graph.spec.infra_mapping[id].ha.enabled == false
    msg := sprintf("%v is a datastore running with high availability off", [id])
}
```

**Attach it so that it reports.** The policy collects under `deny`, which halts by
default. A `translation` naming `deny` alone, at `warn`, reports each of its
decisions as a warning and lets the build complete; `info` records them instead.
The policy itself stays as it will be enforced:

```yaml
plugins:
  governance:
    - uri: governance/rego:0.9.0
      role: ir-verdict
      with:
        sources:
          - policies/datastore-ha.rego
        settings:
          translation:
            - key: deny
              severity: warn
```

**Write the payload, and look the paths up in it.** Once a build has filled the
Release's lockfile,

```bash
aggrega build --release release.yaml --dry-run --policy-input payloads
```

writes the payload each role hands its attachments into `payloads/` and nothing
else, reporting, with `<workspace>` standing for the directory the build ran in:

```text
  policy input: 4 file(s) written to <workspace>/payloads
[… omitted: a lint notice about core/secret-value, the rendered files the run prints in place of writing them, the build's time, and the line saying only the policy inputs were written]
```

The four are `annotation-transform.json`, `ir-verdict.json`,
`label-transform.json` and `render-verdict.json`; a role with nothing attached is
written too, so a policy can be checked against its role before it is attached
anywhere. At `ir-verdict`, `label-transform` and `annotation-transform` the file
is the `input` document a policy reads, so each path a rule names can be read out
of it with any JSON tool before the rule is trusted:

```bash
jq '.graph.nodes' payloads/ir-verdict.json
# null
jq -c '.graph.spec.nodes | keys' payloads/ir-verdict.json
# ["db","web"]
jq -c '.graph.spec.infra_mapping.db.ha' payloads/ir-verdict.json
# {"enabled":false,"read_replicas":0}
```

The rule's nodes are not there: `input.graph.nodes` is where the label-shaping
role carries them, and at `ir-verdict` they sit at `input.graph.spec.nodes` (see
[What each role's payload exposes](#what-each-roles-payload-exposes)). The file
also says what the corrected rule must decide: `db` is a datastore, its high
availability is off, and it is to be reported.

Where OPA is installed, a Rego policy evaluates against the same file directly,
`opa eval -i payloads/ir-verdict.json -d policies/datastore-ha.rego 'data.datastores.deny'`.
The Rego engine in the compiler is an independent implementation, so the build is
still the evaluation that decides: a builtin it does not implement
[stops the build](#rego-policies-two-roads) rather than evaluating.

At `render-verdict` the file is not the policy's `input`. Each artifact in it
carries its `path`, `content` and `format`; the `documents` a rule reads are
parsed from the content by the policy engine once it receives the payload, so a
rule over `documents` finds nothing in the file. A policy at that role is tested
where the engine parses them: in a build, as the next step shows.

**Build, and compare what it reports with what the payload says.** With the
copied path,

```bash
aggrega build --release release.yaml --auto-pull
```

completes and reports nothing:

```text
Pull complete: release.lock (entities=11, source_artifacts=0, external_inputs=0)
  notice: LINT: Feature "core/secret-value" at core/secret-value:1.0.0 declares property "origin" in both values: and infra: pillars (path: origin)
[… omitted: the build's time and the line naming the dist/ directory it wrote]
```

The payload has a datastore with high availability off, and the policy said
nothing about it: that silence is the mistake, and nothing else in the build
points to it. With the rule reading `input.graph.spec.nodes`, the same command
reports `db` and completes:

```text
  policy plugin "rego" warning: db is a datastore running with high availability off
Pull complete: release.lock (entities=11, source_artifacts=0, external_inputs=0)
  notice: LINT: Feature "core/secret-value" at core/secret-value:1.0.0 declares property "origin" in both values: and infra: pillars (path: origin)
[… omitted: the build's time and the line naming the dist/ directory it wrote]
```

Adding `--dry-run` reports the same verdicts and writes no `dist/`, so the loop
runs against a workspace without disturbing its output.

The same rule written for the CEL engine does not fail silently. Reading a key the
payload does not carry is an evaluation fault there, so the copied path, in
`policies/datastore-ha.cel` attached with the same `translation`,

```cel
{
  "deny": input.graph.nodes
            .filter(n, input.graph.nodes[n].labels["component.aggrega.ai/category"] == "datastore"
                       && input.graph.spec.infra_mapping[n].ha.enabled == false)
            .map(n, n + " is a datastore running with high availability off"),
}
```

stops the build even at `warn`. It exits `1`, and its last line names the policy
file and the key:

```text
ir-verdict: plugin "governance/cel:0.9.0": call "verdict_ir": wasm: plugin "cel" call to verdict_ir: policy source "datastore-ha.cel" could not be evaluated: No such key: nodes
```

A `render-verdict` policy is tested the same way. Attached at `render-verdict` in
the same workspace, with the same `translation`, a rule that refuses a Compose
service publishing a port on the host,

```rego
package published

import rego.v1

deny contains msg if {
    some artifact in input.artifacts
    some doc in artifact.documents
    some name, service in doc.services
    count(service.ports) > 0
    msg := sprintf("%v publishes a port on the host", [name])
}
```

reports the one service that does:

```text
  policy plugin "rego" warning: web publishes a port on the host
[… omitted: the pull's line, a lint notice about core/secret-value, the build's time and the line naming the dist/ directory it wrote]
```

**Then enforce it.** Removing the `translation` returns `deny` to `halt`, and the
build that reported `db` now stops on it, exits `1` and writes no `dist/`:

```text
[… omitted: the lines printed while the lockfile is resolved, which carry the refusal below once more, and a lint notice about core/secret-value]
[POLICY_ERROR E0005]
  policy plugin "rego" rejected the build: db is a datastore running with high availability off
  caused by: policy violation
```

The reporting attachment need not be removed everywhere at once. One configuration
file can keep its attachment's `translation` at `warn` while a pipeline's overlay
attaches the same policy with `deny` at `halt`, which is how
[`examples/policy-org-overlay/`](../examples/policy-org-overlay/README.md) rolls an
organization's rule out: a warning on a developer's build, and the reason a
pipeline's build stops.

## Running policy in CI, over the build output

Everything above attaches a policy **inside** a build. There is a second route,
and it needs nothing from the socket: run your own tool in the pipeline, over the
files the build wrote.

It works because of what a build emits. The Kubernetes and Compose targets write
YAML; the Terraform target writes native HCL, or JSON in its `.tf.json` form.
Those are the formats the ecosystem's configuration tools already read — and
`aggrega build` writes plain files to a directory, with no wrapper format, no
index, and nothing to unpack. So a tool that reads YAML, JSON or HCL runs over a
build's output the same way it runs over configuration a person wrote by hand,
and Aggrega grows no socket, no plugin kind and no configuration key for it.

So an existing rule corpus needs no port. If you already keep rules in Conftest,
the Kyverno CLI, kubeconform, Checkov or OPA, those rules run over an Aggrega
build's output as they stand, and the tool that evaluates them is the one your
pipeline already installs.

Two ready-to-use rule scripts, each with the pipeline step that invokes it and
both refusals they produced over real builds, are at
[`examples/policy-in-ci/`](../examples/policy-in-ci/README.md). They use
[`yq`](https://github.com/mikefarah/yq) and nothing else, so they run with no
policy toolchain installed; the shape they show — read the output directory,
decide, exit non-zero with the offending artifacts named — is the shape any tool
in this position takes.

### Which route a rule belongs to

Both routes are first-class, and a workspace commonly uses both. What decides is
what the rule needs to see and when it needs to act.

**Attach it to the socket when:**

- **the build must not produce the artifact at all.** An `ir-verdict` policy runs
  at the static-analysis gate, before anything is rendered, so a halt there
  leaves nothing written — no output file to review, quarantine, or accidentally
  apply. A pipeline check necessarily runs after the files exist.
- **the rule needs facts only the build holds.** The `ir-verdict` role reads the
  assembled graph: nodes, edges and their sockets, every attachment with the slot
  it filled, which values an author declared sensitive, the routing paths. None
  of that survives into rendered output — a Kubernetes manifest does not record
  which socket delivered a value or which Feature contributed a resource — so a
  rule about topology or about provenance has one home, and it is the socket.
- **the rule must hold wherever the build runs.** A governance attachment lives
  in the workspace configuration, so it applies to a developer's local build as
  much as to the pipeline's. A pipeline check applies where the pipeline runs.
- **the rule should shape the build rather than judge it.** Only a transform role
  does that, and only because an operator attached it.

**Run it in CI when:**

- **the rule already exists**, in a tool your team runs and reviews, over a
  format that tool already parses. Re-expressing it as socket policy content is
  work with no new coverage at the end of it.
- **the rule is about the artifacts as the target will receive them** — the final
  file set, after every transform, in the form that gets applied. That is the
  `render-verdict` role's subject too, so on this point alone the two routes see
  the same thing and the choice turns on the others.
- **the finding is for a reviewer rather than for the build.** A pipeline that
  publishes the artifacts and the findings side by side gives a reviewer both;
  a halted build gives them a message.
- **the check reaches beyond one build** — comparing this build's output against
  the last one, against a cluster's live state, or against an inventory no build
  payload carries. A policy at either verdict role sees the build it is attached
  to, and that is all it sees.

The routes compose rather than compete: a topology invariant halts the build from
`ir-verdict`, and the same pipeline then runs the estate's existing artifact
rules over what that build wrote.

## Cross-references

- [`plugin-contract.md`](plugin-contract.md) — the socket's pipeline placement,
  the typed wire shapes it carries, and the sandbox every plugin runs under.
- [`plugin-developer-guide.md`](plugin-developer-guide.md) — authoring a plugin,
  the `describe()` self-report, and the publish → pull → build lifecycle.
- [`../entities/plugin.md`](../entities/plugin.md) — the `Plugin` entity that
  carries a plugin into the catalog.
- [`../cli/aggrega-build.md`](../cli/aggrega-build.md) — the build command that
  dispatches the socket.
- [`../schema/other/aggrega-config.md`](../schema/other/aggrega-config.md) — the
  workspace configuration schema, including the `plugins.governance` attachment
  surface.
- [`../examples/policy-in-ci/`](../examples/policy-in-ci/README.md) — two runnable rule
  scripts over a build's output, with the pipeline step for each.
- [`../examples/policy-data-class-route/`](../examples/policy-data-class-route/README.md) — one
  `ir-verdict` rule over routes, written for the Rego engine, the CEL engine and OPA
  behind the reference adapter guest, attached per build by one `--config` file per
  engine, with a script checking that all three reach the same outcome on every
  Release.
