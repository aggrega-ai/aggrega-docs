# The governance socket

An operator attaches a Wasm governance plugin to inspect a build and act on what
it finds. The compiler host stays dumb and unopinionated: it routes the build
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

Because the host is blind to policy content, the entire policy surface is the
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
  policy. A `render-verdict` policy sees exactly what the build produced. Use it
  for policies about the concrete output — a rule that inspects rendered Docker
  Compose services or Kubernetes objects, for example.

### The transform roles: `annotation-transform` and `label-transform`

- **`annotation-transform`** — the guest reports annotations to add, during
  resolution and before annotation expansion. The payload carries every component
  the attachment may annotate, each with the annotations it already has, plus the
  annotation keys the Manifest registers a binding for. An injected annotation
  under a registered key goes on to expand into a Feature attachment, which is how
  this role adds a capability to a deployment the developer did not type.
- **`label-transform`** — the guest reports label changes to apply, during topology
  construction: after the graph is built, and before the graph is judged. The
  payload carries a labels-only projection of the build's nodes — each with the
  Component it instantiates, the version resolved for it, and the labels it
  currently carries — plus the deployment's name and environment. Use it for
  derived metadata a developer should never have to type: compliance scope,
  ownership, cost attribution.

The roles carry different payloads because they act at different moments and answer
different questions. All four carry the same operator-supplied input channel
described below.

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
toolchain or fetches anything at build time.

What differs is the language the rules are written in, and that is the whole basis
for choosing. An estate that already keeps a Rego corpus — or a team that writes
Rego for admission control elsewhere — attaches the Rego engine and its policies run
as they stand. A team that expresses its rules as single expressions over a
document, the way a Kubernetes validating-admission policy does, attaches the CEL
engine. The two are attached per role, so a workspace may run Rego at one role and
CEL at another, or both at the same role as two attachments.

The host is blind to which of them a decision came from: it routes the payload, reads
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
a build-time dependency.

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
`input.graph.spec.nodes`; the label-shaping role receives a labels-only projection,
so its nodes are at `input.graph.nodes`. A rule moved between those two roles is
therefore edited, not copied — and the symptom of forgetting is a rule that never
fires rather than an error, because a path that is not there is simply undefined.

| Role | What a policy reads |
| --- | --- |
| `ir-verdict` | `input.graph` — the whole build graph document: nodes at `input.graph.spec.nodes` keyed by node id, edges at `input.graph.spec.edges`. `input.precalculated_paths` — the enumerated routing paths, each carrying its ordered `nodes` list and the `attached_features` reached along it. |
| `render-verdict` | `input.artifacts` — one entry per emitted file, each with `path`, `content`, `format`, and `documents`, the parsed documents of the file. An artifact that could not be read structurally carries `parse_error` and no documents, so a policy can reject on the failure itself rather than let an unreadable file pass unexamined. |
| `label-transform` | `input.graph.nodes` — the build's nodes keyed by node id, each with `component`, `resolved_version` and `labels`. `input.compilation_context` — the deployment's `release_name` and `environment`, so a policy can decide differently per environment. |
| `annotation-transform` | `input.targets` — every component the attachment may annotate, each with `boundary_path`, `component_name` and its current `annotations`. `input.binding_keys` — the annotation keys the Manifest registers a binding for. |

Every role additionally carries `input.sources` — the attachment's own files, each
with its base-name `path` and its `content` — and `input.settings`, the attachment's
settings object, which is also the policy's `data` document.

`attached_features` and `binding_keys` are lists rather than objects, so a policy
tests membership with `in`:

```rego
package security

import rego.v1

deny contains msg if {
    some path in input.precalculated_paths
    target := path.nodes[count(path.nodes) - 1]
    input.graph.spec.nodes[target].labels["compliance.aggrega.ai/data-class"] == "restricted"
    not "core/data-masking" in path.attached_features
    msg := sprintf("%v reaches restricted node %v with no masking Feature attached.", [path.nodes[0], target])
}
```

A node object carries no id of its own: the id is the key it sits under in
`input.graph.spec.nodes`, which is why the rule above carries `path.nodes[0]` into
its message rather than reading an `id` field.

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
lets a policy inject only keys the deployment has registered a meaning for — those
are the ones that expand into a Feature attachment. An annotation value is a string.
A decision naming a component the deployment does not have is refused by the build,
naming the coordinate and the annotation.

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
`input` like everything else. Both are always present as a value — empty when the
attachment declares none — so an expression addressing them does not have to guard for
their absence.

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
policy inject only keys the deployment has registered a meaning for — those are the
ones that expand into a Feature attachment. Every field is required: an annotation with
an empty key or an empty component name is not something a policy meant to ask for. The
boundary a component sits under can legitimately be named by the empty string, so that
field must be present but may be empty.

A decision naming a component the deployment does not have is refused by the build,
naming the coordinate and the annotation. As with labels, **reach one decision per
component and annotation key**, resolving the value inside the expression rather than
emitting two decisions for one key.

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
and settings. An adapter reads that content for the output shape it targets,
evaluates a policy over the structured result, and maps the outcome to
`halt` / `warn` / `info` verdicts. Because the payload names no output shape of its
own, one adapter pattern serves any render target; a new output shape is a new
adapter, not a host change.

Each render-stage adapter is an adapter in the sense above: it speaks the Aggrega
ABI outward and absorbs a target-specific format or a foreign policy engine's
contract inward, so the compiler stays free of any output-format or policy logic.
The Rego engine in the compiler serves the `render-verdict` role directly; beyond
it, two reference render-stage adapters ship as worked examples, one per common
output shape.

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

When an artifact's content does not parse, the adapter does not silently allow it:
it keeps the raw content, exposes no parsed documents for that artifact, and
records the parser's message under `input.artifacts[_].parse_error`, so a policy
can stop the build on a malformed artifact explicitly. As with the `ir`-stage guest, a
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

Each role selects a default entry function — `verdict_ir` for the role that judges
the graph, `verdict_render` for the role that judges the rendered artifacts,
`mutate` for the label-shaping role, `transform_annotations` for the
annotation-injecting role — and an attachment may point a role at a different export
with `function:`. The host refuses a dispatch to an export the guest did not declare
in its `describe()` self-report, so an attachment naming a role its guest does not
serve is reported by name, before the guest runs, rather than quietly doing nothing.

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
