# The policy socket

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

This page is the comprehensive treatment of the policy socket: the two stages a
plugin evaluates, the verdict severities the host acts on, the engine-agnostic
input channel an operator supplies, how a guest wraps a foreign policy engine,
the reference guests that ship, and how an operator attaches a policy to a
workspace. For the socket's place in the pipeline and its typed wire shapes, see
[`plugin-contract.md`](plugin-contract.md); for authoring and publishing a
plugin as a catalog entity, see the
[Wasm plugin developer guide](plugin-developer-guide.md).

## The mental model: the host routes, the guest decides

A policy plugin is a `policy-validator` guest. On a build the host assembles the
payload for the plugin's declared stage, hands it across the ABI boundary, and
reads back a list of verdicts. Each verdict carries a severity and a
human-readable message. The host maps each severity to a build action; it does
not read the message for meaning, does not know what the policy checked, and
does not know which engine produced the decision.

Because the host is blind to policy content, the entire policy surface is the
guest's: which language the rules are written in, which engine evaluates them,
and how a violation becomes a verdict. The socket contract is narrow by design —
a stage, a set of inputs, and a verdict list — so that any policy technology
that compiles to Wasm can serve it.

## Stages: `ir` and `render`

A policy plugin declares exactly one stage in its `describe()` self-report,
which fixes where in the pipeline the host evaluates it and what payload it
receives.

- **`ir`** — the guest reasons over the intermediate-representation graph,
  before rendering. The payload carries the full provider-agnostic IR graph (every
  node, edge, and attachment the compiler holds) plus the routing paths the
  analyzer enumerates, so a policy can reason about topology and reachability
  without re-walking the graph. An `ir`-stage policy runs at the static-analysis
  gate, before any artifacts are produced. Use it for policies about
  architecture and wiring — topology invariants, cross-boundary auth,
  credential-flow shape — that should halt a build before it renders anything.
- **`render`** — the guest reasons over the rendered output, after rendering.
  The payload carries the emitted artifacts as a `{path, content}` list, sorted
  by path so the wire is byte-identical across runs of identical input. A
  `render`-stage policy sees exactly what the build produced. Use it for policies
  about the concrete output — a rule that inspects rendered Kubernetes objects,
  for example.

The two stages carry different payloads because they reason over different
things: the `ir` stage over topology, the `render` stage over emitted files.
Both stages carry the same operator-supplied input channel described below.

## Verdicts and severities

A guest returns a list of verdicts. Each verdict carries a severity that
determines the build action:

- **`deny`** — halts the build; the host surfaces the verdict's message as the
  reason. The build produces no artifacts.
- **`warn`** — flags the verdict; the build proceeds.
- **`audit`** — records the verdict; the build outcome is unchanged.

An allowing evaluation returns nothing. A guest emits a verdict only when a rule
fires, so an empty verdict list means the policy allowed the build. There is no
"pass" verdict to emit — silence is the allow.

A guest may return many verdicts in one evaluation, mixing severities. The host
walks them all: any `deny` halts the build (and every `deny` message is
surfaced), while `warn` and `audit` verdicts are reported without blocking. This
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
host sees only the standard policy-validator surface; it never learns which
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
collections into verdicts of the matching severity.

The embedded evaluator reimplements Rego independently rather than embedding the
reference implementation, and it does not implement every Rego builtin. When a
policy calls a builtin the evaluator does not implement, the guest **fails
loudly**: it returns a fault, not an allow. The build then halts with a fault
that names the plugin — deliberately distinct from a `deny` verdict, so that
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
policy-validator surface. This road is heavier to stand up but gives a policy
the exact engine it targets.

The two roads share the same host contract, so moving a policy from the embedded
evaluator to the full engine is an attachment change.

## The Kubewarden render adapter

The Kubewarden render adapter is a reference `render`-stage guest that runs
Kubewarden-style admission policies over rendered Kubernetes manifests. It is an
adapter in the sense above: it speaks the Aggrega ABI outward and absorbs the
Kubernetes admission-control contract inward, so the compiler stays free of any
admission-control logic.

Kubewarden policies are written against the Kubernetes admission-review
contract: a policy receives a request wrapping a single object and returns an
accept-or-reject response. At the render stage the build's output already *is* a
set of Kubernetes resources, which makes that stage the natural place to run an
admission-shaped policy. For each rendered object the adapter derives the
admission fields from the parsed object itself, wraps the object in an
admission-review-shaped request inside the guest, runs the policy, and maps the
response to a verdict: a rejection becomes one verdict; an acceptance emits
nothing. The bundled reference policy is a require-label rule — every object must
carry a label key named by `settings` — a common Kubewarden pattern.

The adapter is deliberately scoped:

- **Render stage, Kubernetes output only.** It reasons over rendered manifests,
  not the IR graph, and over Kubernetes objects, not other render output such as
  compose or Terraform. A graph-stage policy, or a policy over a different output
  shape, is a different guest.
- **Validating only.** The adapter accepts or rejects; it never returns a
  mutated object. A mutating policy's mutated object is ignored — the compiler
  never rewrites rendered output from a policy verdict. A policy decides; it does
  not edit.

Present it as a reusable pattern: a render-stage adapter that wraps each rendered
object in the shape a foreign admission engine expects, runs that engine, and
maps its decision to a verdict. Adapters for other output shapes follow the same
pattern.

## Attaching a policy

An operator attaches a policy through the `plugins.policy` list in the
workspace configuration (`.aggrega-config.yaml`). Each entry names a plugin and,
optionally, the `with` channel that supplies its rules and tunables:

```yaml
plugins:
  policy:
    - uri: <resolvable-plugin-reference>
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

The `plugins.policy` list has an additive companion, `plugins.policy_append`:
entries in the companion are concatenated onto the resolved `policy` list at each
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
  policy_append:
    - uri: <organization-policy-plugin-reference>
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
  workspace configuration schema, including the `plugins.policy` attachment
  surface.
