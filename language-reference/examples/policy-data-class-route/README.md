---
example:
  level: advanced
  products: [core/ai-agent/langgraph, core/ai-model/openai, core/datastore/valkey, core/gateway/litellm, core/security/presidio-analyzer, core/security/presidio-anonymizer]
  shows: [policy, guardrails, connections, features, catalog-authoring]
---

# A policy that halts a build when restricted data reaches a managed model unmasked

An estate runs a claims assistant that handles restricted customer data, and a
helpdesk assistant that handles none. Both send their model traffic to OpenAI's
managed API through an in-cluster AI gateway. The estate's house rule:

> Data of one class does not reach a component of another class along a route
> of the build graph unless a declassifying Feature is attached on that route.

This workspace attaches that rule as a policy over the build graph and builds
three Releases of one Aggregate. In one, the claims assistant's requests go
through a gateway that masks them, and the build completes. In the other two
they do not, and the build halts before anything is rendered, with the policy
naming both ends of the route.

The rule is written three times, once for each policy engine it runs on — the
Rego and CEL engines compiled into the CLI, and OPA — and the three copies agree
on every build here. A script beside the Releases builds all nine combinations
and checks each outcome.

## What it builds

| instance | catalog Component | what it is here |
|---|---|---|
| `assistant` | `local/ai-agent/claims-assistant` | the claims assistant: the standard-library LangGraph agent, declared in this workspace's catalog with one label added — the class of the data it handles |
| `helpdesk` | `core/ai-agent/langgraph` | the helpdesk assistant, which carries no class |
| `checkpointer` | `core/datastore/valkey` | where both assistants keep their run state |
| `masking-gateway` | `core/gateway/litellm` | an AI gateway serving one alias, `chat`, with `core/data-masking` attached |
| `plain-gateway` | `core/gateway/litellm` | the same gateway with nothing attached |
| `gpt` | `core/ai-model/openai` | OpenAI's managed API, reached as a reference: nothing runs for it in the cluster |
| `analyzer`, `anonymizer` | `core/security/presidio-analyzer`, `core/security/presidio-anonymizer` | the recognizer services the masking calls |

Both gateways are wired to `gpt` through their `models` socket, each presenting
the model's key on that connection. The masking attachment lists what to mask: a
pattern for the estate's claim numbers, and the entity types `PERSON` and
`EMAIL_ADDRESS`. The two assistants declare the `model` socket their Component
declares, which admits a model or a gateway serving a model API, and leave it
unbound: each Release wires it.

## The three Releases

The Releases differ only in which gateway each assistant's model traffic goes
through:

| Release | the claims assistant's traffic | the helpdesk assistant's traffic | the build |
|---|---|---|---|
| `release-masked.yaml` | through `masking-gateway` | through `plain-gateway` | completes |
| `release-unmasked.yaml` | through `plain-gateway` | through `plain-gateway` | halts |
| `release-masking-off-route.yaml` | through `plain-gateway` | through `masking-gateway` | halts |

Each Release binds the `model` socket of the two assistants to a gateway the
Aggregate declares. That is edge wiring within a socket the Component declares,
which a Release may do; it adds no component and changes no value.

## Building

```bash
aggrega build --release release-masked.yaml --config governance-rego.yaml --auto-pull
aggrega build --release release-unmasked.yaml --config governance-rego.yaml --auto-pull           # halts; exits 1
aggrega build --release release-masking-off-route.yaml --config governance-rego.yaml --auto-pull  # halts; exits 1
```

Swap `governance-rego.yaml` for `governance-cel.yaml` or `governance-opa.yaml` to
run the same rule on another engine.

**`--config` names the global configuration file for that run.** It is read in
place of the one the machine would otherwise read — the file `AGGREGA_CONFIG`
names, or the default location — and this workspace's own `.aggrega-config.yaml`
still layers on top of it. So for that run, nothing you keep in your own global
file applies: another governance attachment, a `default_registry`, an offline
setting. A credential you stored with `aggrega login` is not part of that file
and still applies. The workspace file declares the catalog directories and no
governance attachment of its own; a list it declared would replace the one the
named file carries, so the attachment in the named file is the one that runs.

A governance policy attaches through configuration, not through a Release — a
Release has no field for it — which is why the engine is chosen per build rather
than per Release.

**Two things have to be in place before a first build:**

- **The standard-library catalog.** `.aggrega-config.yaml` lists this
  workspace's own `catalog/`, which holds the claims assistant and the OPA
  engine's Plugin entity. Everything else, the Rego and CEL engines' Plugin
  entities included, resolves from the hub registry below, or from a checkout
  of the catalog named with `--catalog`.
- **The hub registry.** The data-masking realization writes its
  guardrails through one plugin that ships in neither the compiler nor the
  catalog, the gateway configuration step
  `pipeline-step/litellm-gateway-config`, and the build pulls it from the
  registry `default_registry` names, `hub.aggrega.ai`.

`--auto-pull` fills each Release's lockfile during the build; lockfiles and the
rendered output are generated, not shipped.

## The halt

`release-unmasked.yaml`, under each engine. The Rego engine:

```text
[… omitted: the pull's lines, and a lint notice about core/referenced-secret]
[POLICY_ERROR E0005]
  policy plugin "rego" rejected the build: assistant (restricted) reaches gpt (public) with no declassifying Feature attached between them
  caused by: policy violation
```

The CEL engine:

```text
[… omitted: the pull's lines, and a lint notice about core/referenced-secret]
[POLICY_ERROR E0005]
  policy plugin "cel" rejected the build: assistant (restricted) reaches gpt (public) with no declassifying Feature attached between them
  caused by: policy violation
```

OPA:

```text
[… omitted: a warning that the OPA guest runs unverified, the pull's lines, and a lint notice about core/referenced-secret]
[POLICY_ERROR E0005]
  policy plugin "opa" rejected the build: assistant (restricted) reaches gpt (public) with no declassifying Feature attached between them
  caused by: policy violation
```

The build exits `1` and writes no `dist/`: the policy is evaluated over the
build graph before anything is rendered. `E0005` is the diagnostic a policy
refusal carries — see [the diagnostic reference](../../errors/sentinels.md).
`release-masking-off-route.yaml` prints the same refusal, under each engine.

Read the sentence as the route it found. `assistant` holds `restricted` data. Its
model traffic reaches `gpt`, which the policy classes `public`, through
`plain-gateway`, and nothing on that route — not the assistant, not the gateway,
not the model — carries a Feature the policy counts as declassifying. Two classes
ranked differently meet on one route with nothing between them, so the policy
refuses the build.

The pull also renders the Release, to find any external inputs it needs pinned,
and meets the same refusal there; that is why the omitted lines above carry the
sentence a second time. The lockfile is still written.

## Satisfying it: the masking gateway on the route

`release-masked.yaml` routes the claims assistant through `masking-gateway`, and
every engine lets it build, with `<workspace>` standing for this example's folder:

```text
[… omitted: the pull's lines, a lint notice, under OPA a warning that its guest runs unverified, and the total build time]
Build completed: 17 files written to <workspace>/dist
```

The masking gateway is now on the claims assistant's only route to the model,
and the policy reads it there: on that route, a component carries an attachment
whose type the policy's `declassifying_features` setting lists, at or before the
point where the classes differ. The route reads from the rendered output:
`dist/helm/assistant-deployment.yaml` sends the claims assistant to the masking
gateway, and `dist/helm/helpdesk-deployment.yaml` sends the helpdesk to the plain
one.

```yaml
# dist/helm/assistant-deployment.yaml, the env of the assistant's container
env:
  [… omitted: the recursion limit]
  - name: OPENAI_BASE_URL
    value: http://masking-gateway-default:4000/v1
  [… omitted: the alias, the checkpointer's address and the graph's entrypoint]
```

```yaml
# dist/helm/helpdesk-deployment.yaml, the env of the helpdesk's container
env:
  [… omitted: the recursion limit]
  - name: OPENAI_BASE_URL
    value: http://plain-gateway-default:4000/v1
  [… omitted: the alias, the checkpointer's address and the graph's entrypoint]
```

The masking itself is in the masking gateway's configuration, the `config.yaml`
key of `dist/helm/masking-gateway/litellm-gateway-config/configmap.yaml`:

```yaml
[… omitted: the routing table]
litellm_settings:
  callbacks:
    - /etc/litellm-request-guard/request_field_filter.filter
  turn_off_message_logging: true
guardrails:
  -
    guardrail_name: masking-gateway-masking
    litellm_params:
      default_on: true
      guardrail: litellm_content_filter
      mode: pre_call
      patterns:
        -
          action: MASK
          name: claim_number
          pattern: "\\bCLM-[0-9]{8}\\b"
          pattern_type: regex
      skip_tool_message_in_guardrail: true
  [… omitted: three more guardrail entries masking the same pattern and the two entity types, and the request guard's settings]
```

The plain gateway's configuration has no guardrail entries at all.

**The policy changes nothing in what is rendered.** Each engine's `release-masked`
tree is byte-identical to the same Release built with no policy attached. The
policy is attached at the `ir-verdict` role, a verdict role: it returns an accept
or a refusal, and the path that dispatches a verdict has no way to apply one as a
change, so a policy there can stop a build and cannot rewrite one into
compliance.

**The policy checks that the masking is attached on the route, not what it
masks.** An attachment listing a pattern nobody's data matches satisfies it as
well as this one does. What a masking attachment lists is the estate's own
judgement, made where the attachment is written.

## Why the Releases move the route, not the attachment

A Release can attach a Feature, but an attachment written in a Release carries no
`values`, and `core/data-masking` keeps what it masks — `patterns` and `entities`
— in `values`, halting an attachment that lists neither. So the masking is
attached in the Aggregate, on `masking-gateway`, and it is in the graph of every
one of the three builds:

- in `release-masked.yaml` it sits on the claims assistant's route, and the build
  completes;
- in `release-unmasked.yaml` it sits on no assistant's route, and the build halts;
- in `release-masking-off-route.yaml` it sits on the helpdesk's route, and the
  build halts again.

The second and third builds carry the same attachment and differ only in whose
route it is on. Both halt, so the policy is reading the route, not counting
attachments in the build.

## What the policy reads

All of it comes from the build graph the compiler hands an `ir-verdict`
attachment, and all of its meaning from the attachment's settings:

- **The routes the compiler enumerates**, `input.precalculated_paths`: each an
  ordered list of components joined by `uses` edges. On `release-unmasked.yaml`
  one of them is `assistant → plain-gateway → gpt`. The policy reads each route
  from its first component, which is enough because the compiler enumerates the
  routes leaving every component. It enumerates nothing itself.
- **Each component's class.** The value of the label `class_label` names,
  `compliance.aggrega.ai/data-class`, where a component carries it: only
  `assistant` does, with `restricted`. Otherwise, the class of the first
  `classes_by_label` entry whose label and value the component carries.
- **Each component's attachments**, `input.graph.spec.feature_values_mapping`.
  The route's own `attached_features` list is deliberately not read: it names
  every Feature attached anywhere on the route, so it cannot say whether one sits
  between the two components in question.

A component with no class is passed over. So are the direction a route is drawn
in — a connection carries a request one way and its reply the other — and
classes the settings rank alike.

**The model's class comes from its hosting label.** `gpt` carries no class label.
Its Component, `core/ai-model/openai`, carries `component.aggrega.ai/hosting:
managed`, the catalog's statement that the service is run by its provider,
outside the cluster, and the settings map that to a class:

```yaml
classes_by_label:
  - label: component.aggrega.ai/hosting
    value: managed
    class: public
```

A managed model holds whatever is sent to it, which this estate treats as public.
A self-hosted model such as `core/ai-model/vllm`, and either gateway here, carries
`self-hosted` instead, and so no class.

**The routes are bounded.** The compiler lists a bounded number of routes from
each starting component and lists nothing past the bound, so on a graph with more
routes than that, a route can go unread and the build pass. A route the policy
reads is real; the absence of one is not proof that it does not exist. See
[the verdict roles](../../plugins/policy-socket.md#the-verdict-roles-ir-verdict-and-render-verdict).

## The classes are the policy's, not the compiler's

The compiler carries `compliance.aggrega.ai/data-class` to the build graph as a
string and reads no meaning into it. It does not know that `restricted` is more
sensitive than `public`, or that either word means anything. The classes and their
ranking are the policy's settings, the same in all three engine files:

```yaml
class_label: compliance.aggrega.ai/data-class
rank:
  public: 0
  internal: 1
  restricted: 2
```

An estate with its own vocabulary substitutes its own: its classes and their
order under `rank`, the label it keeps them in under `class_label`, its
derivations under `classes_by_label`, and the Features it accepts as declassifying
under `declassifying_features`. Change all three engine files alike, since a
difference between them is a difference between the engines' verdicts. A class a
component carries that `rank` does not list halts the build rather than reading
as no class, so a misspelling is reported instead of passing. With the claims
assistant's label written `Restricted`, every engine refuses `release-masked.yaml`;
`aggrega build --release release-masked.yaml --config governance-rego.yaml
--auto-pull` prints the refusal below, and each other engine's file prints the
same one headed with that engine's name:

```text
[… omitted: under OPA a warning that its guest runs unverified, the pull's lines, and a lint notice about core/referenced-secret]
[POLICY_ERROR E0005]
  policy plugin "rego" rejected the build: assistant carries the data class "Restricted", which the policy's rank setting does not list; correct the class or rank it
  caused by: policy violation
```

The class is carried by this workspace's own Component, not by the standard
library's. Whether an assistant handles restricted data is a statement about how
an estate uses it, not about LangGraph, so `local/ai-agent/claims-assistant`
extends `core/ai-agent/langgraph`, inherits its contract, and adds the one label.
An Aggregate cannot put a label on a component instance, so a class is always a
property of the Component an instance is declared as. With the claims assistant
declared as the standard-library agent instead, no component carries a class
label, and `release-unmasked.yaml` builds under every engine, byte for byte what
it builds with no policy: the model still derives `public`, but there is no
second class for it to meet.

## Three engines, the rule written three times

| engine | attached by | the rule |
|---|---|---|
| the Rego engine compiled into the CLI | `governance-rego.yaml` | `policies/data-class-paths.rego`, named under `with.sources` |
| the CEL engine compiled into the CLI | `governance-cel.yaml` | `policies/data-class-paths.cel`, named under `with.sources` |
| OPA, behind the reference adapter guest | `governance-opa.yaml` | `policies/data-class-paths-opa.rego`, compiled into the guest |

**The three copies are a deliberate near-duplicate.** Each is written on its own
from the rule, so a build on which the engines disagree shows the disagreement:
the same build halting under one engine and completing under another is the
signal. None is generated from another, and they are not to be merged into one
shared implementation, which would make the engines agree by construction and
hide the difference this exists to catch. Each file opens by saying so.

They differ where the engines do:

- **The CEL copy** cannot bind a name to a value or walk a list's positions, so
  its settings carry one more entry, `positions`, the positions 0 to 15 a route's
  components are read at. A route longer than that halts the build, naming where
  it starts, rather than being read in part.
- **The OPA copy** is compiled ahead of time with OPA's own toolchain and baked
  into the guest beside `catalog/plugin/governance/opa/1.0.0/plugin.yaml`, so its
  attachment supplies settings and no policy file. The adapter provides none of
  the builtins OPA leaves to its host, so this copy joins its messages with
  `concat` where the Rego engine's copy formats them with `sprintf`. Editing it
  changes no build until the guest is rebuilt, below.

The Rego and CEL attachments name the Plugin entities the standard-library
catalog carries for the two engines compiled into the CLI, `governance/rego:0.8.6`
and `governance/cel:0.8.6`, and the engine that runs is the one compiled into the
binary running the build. OPA's Plugin entity, in `catalog/plugin/governance/`, is
this workspace's own declaration at version `1.0.0`, so its attachment names
`governance/opa:1.0.0`. A refusal is headed with the last segment of the
attachment's reference, its version left off — `policy plugin "rego"`, `"cel"` or
`"opa"` — and each build attaches one engine, so the refusal it prints names that
engine. The OPA guest is read from beside its entity on every build, and since
nothing records its digest, every build with it warns that it runs unverified.

## Checking every build

This self-check runs in a checkout of the documentation repository, which holds
the shared build helper it uses; a copy written by `aggrega scaffold --example`
does not carry that helper.

```bash
./check.sh
```

`check.sh` builds the three Releases under the three engines through
`./build-release.sh`, and checks each outcome against the one this page
describes. A halt must exit non-zero with `E0005` whose message is the sentence
above, and no other refusal beside it; a completed build must exit 0 and write
the same files, byte for byte, as the same Release built with no policy, which it
builds first as a reference. Every engine is held to the same sentence. It prints
one line per build and exits 1 if any outcome differs, printing that build's
output:

```text
ENGINE   RELEASE                          EXIT  EXPECTED  VERDICT
------------------------------------------------------------------------------------------
none     release-masked.yaml              0     reference OK
rego     release-masked.yaml              0     pass      OK: completed, byte-identical to the build with no policy
rego     release-unmasked.yaml            1     halt      OK: E0005, the expected sentence
rego     release-masking-off-route.yaml   1     halt      OK: E0005, the expected sentence
cel      release-masked.yaml              0     pass      OK: completed, byte-identical to the build with no policy
cel      release-unmasked.yaml            1     halt      OK: E0005, the expected sentence
cel      release-masking-off-route.yaml   1     halt      OK: E0005, the expected sentence
opa      release-masked.yaml              0     pass      OK: completed, byte-identical to the build with no policy
opa      release-unmasked.yaml            1     halt      OK: E0005, the expected sentence
opa      release-masking-off-route.yaml   1     halt      OK: E0005, the expected sentence

check: every build ended as expected.
```

It needs what a single build needs: the standard-library catalog and the hub
registry. It uses the binary `./build-release.sh` resolves, so `AGGREGA_BIN`
chooses it; arguments after `--` reach every build, so `./check.sh -- --offline`
runs it without the network once everything it pulls is cached. It refuses to
start while a `dist/` sits in this directory, because it compares the trees the
builds write, and it leaves none behind. Its exit status is the whole verdict, so
a pipeline can run it in place of building each Release on its own.

## Rebuilding the OPA guest

`catalog/plugin/governance/opa/1.0.0/governance--opa.wasm` is the reference OPA
adapter guest from the plugin kit, `rust/examples/policy-opa-wasm` in the
`aggrega-pdk` repository, with the module OPA compiles from
`policies/data-class-paths-opa.rego` in place of the adapter's own. It was built
from `aggrega-pdk` at `afd9ac6c6800c34c6c47a2030f580c9681387047` and `aggrega-abi`,
the ABI crate the adapter builds against, at
`2ececa8d3b598243f023a2a6c80b351c8d1411a1`, with rustc 1.97.1, around the module
OPA 1.21.1 compiles.

First the module, from this directory. Naming the rule by its path relative to
here keeps that path, and nothing of the machine, in the module:

```bash
opa build -t wasm -e data_class_paths/deny policies/data-class-paths-opa.rego -o bundle.tar.gz
tar -xzf bundle.tar.gz -O /policy.wasm > policy.wasm
rm bundle.tar.gz
sha256sum policy.wasm
# 321e8a1f150a7ef7625e174cf636967b6c0e1f7bd39c3b7fa1010838ce35c871  policy.wasm
```

OPA 1.21.1 compiles the same bytes from the same source whichever directory this
workspace sits in.

Then the guest, in a scratch directory `$BUILD`, given as an absolute path,
holding the two repositories side by side, the adapter's path dependency reaching
from one to the other. The three path maps keep the build directory, the cargo
home and the toolchain's own sources out of the guest:

```bash
mkdir -p "$BUILD/aggrega-pdk" "$BUILD/aggrega-abi"
git -C <aggrega-pdk checkout> archive afd9ac6c6800c34c6c47a2030f580c9681387047 | tar -x -C "$BUILD/aggrega-pdk"
git -C <aggrega-abi checkout> archive 2ececa8d3b598243f023a2a6c80b351c8d1411a1 | tar -x -C "$BUILD/aggrega-abi"
cp policy.wasm "$BUILD/aggrega-pdk/rust/examples/policy-opa-wasm/policy.wasm"
cd "$BUILD/aggrega-pdk/rust/examples/policy-opa-wasm"
SRC="$(rustc +stable --print sysroot)/lib/rustlib/src/rust"
HASH="$(rustc +stable -vV | awk '/^commit-hash: /{print $2}')"
RUSTFLAGS="--remap-path-prefix=$BUILD=/build --remap-path-prefix=${CARGO_HOME:-$HOME/.cargo}=/cargo --remap-path-prefix=$SRC=/rustc/$HASH" \
  CARGO_TARGET_DIR="$BUILD/target" \
  cargo +stable build --locked --release --target wasm32-wasip1
```

and copy `$BUILD/target/wasm32-wasip1/release/policy_opa_wasm_rust.wasm` to
`catalog/plugin/governance/opa/1.0.0/governance--opa.wasm`.

The guest is the cargo build's output as it comes. The adapter's own build script
also runs an optional size pass, which is skipped here: it rewrites the guest's
data, and without it the module stays in the guest byte for byte. That lets you
check what a guest carries against what the rule compiles to:

```bash
python3 -c 'import sys; print(open(sys.argv[1], "rb").read() in open(sys.argv[2], "rb").read())' \
  policy.wasm catalog/plugin/governance/opa/1.0.0/governance--opa.wasm
# True
```

The guest's own bytes also depend on the directory its crates were built in, and
on the toolchain, so a rebuild elsewhere is an equivalent guest with another
sha256. The one shipped here is
`eb53965efd7e812ecc933c7b681936c87aa0d242b28628a957f44a6a8072ec93`.

## Where the compiler does not interpret

The compiler routes the class label to the build graph as a string, enumerates
routes over the `uses` edges the Aggregate and the Releases declared, and hands
both to the policy. It does not rank a class, does not know that `managed` means
the data leaves the cluster for a provider, and does not know that
`core/data-masking` hides anything. Every one of those meanings is the policy's settings, which is what lets
an estate with other classes, other labels and other declassifying Features run
the same machinery unchanged. For the socket the policy is attached to — the
roles, the payload, the verdict severities — see
[the policy socket](../../plugins/policy-socket.md), and for where policy sits in
the product, [Governance and Compliance](../../../architecture/11-governance-and-compliance.md).

## Files

- `aggregate.yaml` — the two assistants, their checkpointer, the two gateways,
  the model and the recognizer pair; the masking attached to `masking-gateway`;
  neither assistant's `model` socket bound.
- `manifest.yaml` — binds every component type and both Feature types to their
  Kubernetes Recipes, the claims assistant to the base agent's Recipe. Shared by
  the three Releases.
- `release-masked.yaml`, `release-unmasked.yaml`,
  `release-masking-off-route.yaml` — the three routings, and the Secret each
  gateway's key is read from.
- `catalog/component/local/ai-agent/claims-assistant/1.0.0/component.yaml` — the
  claims assistant, `core/ai-agent/langgraph` with the class label added.
- `catalog/plugin/governance/opa/1.0.0/plugin.yaml` — the OPA engine's Plugin
  entity, with its guest, `governance--opa.wasm`, beside it.
- `policies/data-class-paths.rego`, `policies/data-class-paths.cel`,
  `policies/data-class-paths-opa.rego` — the rule, once per engine.
- `governance-rego.yaml`, `governance-cel.yaml`, `governance-opa.yaml` — one
  `--config` file per engine, each attaching the rule at `ir-verdict` with the
  same settings.
- `.aggrega-config.yaml` — the catalog search stack and the registry; no
  governance attachment.
- `build-release.sh` — builds one Release, echoing the equivalent `aggrega build`
  command.
- `check.sh` — builds all nine and checks each outcome.
