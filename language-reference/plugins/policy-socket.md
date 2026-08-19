# The governance socket: policy verdicts

An operator attaches a Wasm policy plugin to inspect a build and return a
decision. The compiler host stays dumb and unopinionated: it routes the build
payload to the guest and acts on the verdicts the guest returns, and it never
interprets the policy itself. All the domain policy intelligence — the policy
language, its engine, and the rules — lives inside the guest.

This is the same ahead-of-time-purity contract every socket runs under: the
guest evaluates the payload it is handed and returns a result the host consumes
verbatim (see [the sandbox contract](plugin-contract.md#the-sandbox-contract)).
A policy plugin adds nothing to that surface except a decision. The host learns
nothing about the policy language the guest speaks, carries no policy-engine
code of its own, and takes exactly one of three actions per returned verdict.

This page is the comprehensive treatment of the governance socket's verdict
roles: the two verdict roles a policy is attached at, the verdict severities the
host acts on, the engine-agnostic
input channel an operator supplies, how a guest wraps a foreign policy engine,
the reference guests that ship, and how an operator attaches a policy to a
workspace. For the socket's place in the pipeline and its typed wire shapes, see
[`plugin-contract.md`](plugin-contract.md); for authoring and publishing a
plugin as a catalog entity, see the
[Wasm plugin developer guide](plugin-developer-guide.md).

## The mental model: the host routes, the guest decides

A policy plugin is a `governance` guest attached in a verdict role (`ir-verdict` or `render-verdict`). On a build the host assembles the
payload for the attachment's verdict role, hands it across the ABI boundary, and
reads back a list of verdicts. Each verdict carries a severity and a
human-readable message. The host maps each severity to a build action; it does
not read the message for meaning, does not know what the policy checked, and
does not know which engine produced the decision.

Because the host is blind to policy content, the entire policy surface is the
guest's: which language the rules are written in, which engine evaluates them,
and how a violation becomes a verdict. The socket contract is narrow by design —
a role, a set of inputs, and a verdict list — so that any policy technology
that compiles to Wasm can serve it.

## Verdict roles: `ir-verdict` and `render-verdict`

A policy is attached at exactly one verdict role, and the role fixes where in
the pipeline the host evaluates it and what payload it receives. A guest that
should judge both moments is attached twice — once at each role.

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
  rendering. The payload carries the emitted artifacts as a `{path, content}` list, sorted
  by path so the wire is byte-identical across runs of identical input. A
  `render-verdict` policy sees exactly what the build produced. Use it for policies
  about the concrete output — a rule that inspects rendered Docker Compose
  services or Kubernetes objects, for example.

The two roles carry different payloads because they reason over different
things: the `ir-verdict` role over topology, the `render-verdict` role over
emitted files. Both roles carry the same operator-supplied input channel
described below.

## Verdicts and severities

A guest returns a list of verdicts. Each verdict carries a severity that
determines the build action:

- **`halt`** — stops the build; the host surfaces the verdict's message as the
  reason. The build produces no artifacts.
- **`warn`** — flags the verdict; the build proceeds.
- **`info`** — records the verdict; the build outcome is unchanged.

These three are the whole set, and they are the same three every other socket's
diagnostics use, so a severity means the same thing wherever you read one.

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
  business — a `.rego` file to one guest, some other policy format to another.
- **`settings`** — a configuration map the guest maps onto its engine. A guest
  reads its tunables (a replica ceiling, a required label key) from this map. By
  default the host hands it through verbatim without acting on it; a guest may
  additionally declare a schema for it (see below), in which case the host
  validates the map against that schema before running the guest.

A fully-baked guest — one whose rules are compiled in rather than supplied at
attach time — omits `with` entirely. The channel is optional on both stages.

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
speaks the Aggrega `describe()` / `validate` surface outward, and whatever
engine it uses is an implementation detail behind that surface.

A guest that wraps a foreign policy engine **absorbs that engine's ABI inside
itself**. If the engine has its own Wasm ABI, its own entrypoints, or its own
host-callback protocol, the wrapping guest instantiates and drives it internally
and maps the engine's decision back to the socket's verdict shape. The compiler
host sees only the standard governance verdict surface; it never learns which
engine is involved and carries no engine-specific code. Switching a policy from
one engine to another is an attachment change, not a host change.

## Rego policies: two roads

Rego is a common policy language, and the reference guests offer two roads to
running it — a low-friction embedded road and a full-fidelity escape hatch.

**The embedded Regorus-backed guest** is the low-friction road. It embeds a
Wasm-native Rego evaluator, so an operator drops a `.rego` file into `sources`
and attaches the guest — no external toolchain. The guest reads the payload as
the Rego `input` document and the attachment's `settings` as the Rego `data`
document, and it collects the policy's `deny`, `warn`, and `audit` message
collections into verdicts. Those three names are Rego's own naming for a decision
rule; the guest maps them onto the three verdict severities — `deny` lands as
`halt`, `warn` as `warn`, and `audit` as `info`.

The embedded evaluator reimplements Rego independently rather than embedding the
reference implementation, and it does not implement every Rego builtin. When a
policy calls a builtin the evaluator does not implement, the guest **fails
loudly**: it returns a fault, not an allow. The build then halts with a fault
that names the plugin — deliberately distinct from a `halt` verdict, so that
"the engine cannot evaluate this policy" is never mistaken for "the policy
allows the build." An unevaluable policy stops the build; it never passes
silently.

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

The two roads share the same host contract, so moving a policy from the embedded
evaluator to the full engine is an attachment change.

## Render-stage policy adapters

A render-stage adapter reasons over the build's **rendered output** rather than
its IR graph. The render payload carries the emitted artifacts — each a path and
its rendered content — plus the attachment's own sources and settings. An adapter
parses that content for the output shape it targets, evaluates a policy over the
structured result, and maps the outcome to `halt` / `warn` / `info` verdicts.
Because the payload is shape-agnostic (a list of path/content pairs), one adapter
pattern serves any render target; a new output shape is a new adapter, not a host
change.

Each render-stage adapter is an adapter in the sense above: it speaks the Aggrega
ABI outward and absorbs a target-specific format or a foreign policy engine's
contract inward, so the compiler stays free of any output-format or policy logic.
Two reference render-stage adapters ship, one per common output shape.

### YAML, JSON, and Terraform HCL output — the embedded-Rego render adapter

The embedded-Rego render adapter runs operator-supplied Rego over any YAML or
JSON render output, and over Terraform's native-HCL output. It is the
render-stage sibling of the embedded Regorus-backed `ir`-stage guest: the same
Wasm-native Rego evaluator, the same `deny` / `warn` / `audit` Rego collection
convention mapped onto the same three verdict severities, moved to the render
stage.

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
  parses — YAML/JSON and Terraform native HCL for the embedded-Rego adapter,
  Kubernetes objects for the Kubewarden adapter. A graph-stage policy, or a
  policy over an output shape no shipped adapter parses, is a different guest.
- **Validating only.** A render-stage adapter accepts or rejects; it never
  returns a mutated object. A mutating policy's mutated object is ignored — the
  compiler never rewrites rendered output from a policy verdict. A policy decides;
  it does not edit.

## Attaching a policy

An operator attaches a policy through the `plugins.governance` list in the
workspace configuration (`.aggrega-config.yaml`). Each entry names a plugin, the
verdict `role` it is attached at (`ir-verdict` or `render-verdict`), and,
optionally, the `with` channel that supplies its rules and tunables:

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

The `uri` resolves to the policy plugin; the socket's default entry function is
`validate`. The host reads each `sources` file at build time and hands its bytes
to the guest, and passes `settings` through verbatim. A build with no policy
attached runs the socket as a no-op, so policy attachment is purely additive to a
workspace.

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
