# Sharing a credential — per-consumer, shared, and both at once

Two CrewAI agents behind one OpenAI-compatible gateway. Each agent's component
type declares a `model_api_key` attachment slot, and this workspace fills that
slot three ways without changing a single catalog entity: once per agent, once
for both, and both at once with one agent overriding the shared default.

**Two consumers is the point.** The three forms are indistinguishable with a
single consumer — the difference is *which* rendered resource each consumer ends
up pointing at, and that question has no content until there is more than one
consumer.

## Building

Three releases, one per form. Build one per run with the helper script, which
echoes the equivalent direct `aggrega build` command before running it:

```bash
./build-release.sh per-consumer    # release-per-consumer.yaml → dist/per-consumer/
./build-release.sh shared          # release-shared.yaml       → dist/shared/
./build-release.sh composed        # release-composed.yaml     → dist/composed/
```

Each release writes to its own directory, so all three rendered trees coexist
and can be diffed against each other.

A release needs its lockfile before it builds. On a fresh checkout, resolve one
first — either as its own step or by letting the build fill it:

```bash
aggrega pull --release release-shared.yaml     # resolve, then build normally
./build-release.sh shared -- --auto-pull       # or resolve during the build
```

The releases resolve their catalog entities from the configured catalog, so no
`--catalog` flag is needed; the direct invocation is:

```bash
aggrega build --release release-shared.yaml
```

All three build on the helm target, deliberately. The observable that separates
the three forms is the **identity of the emitted credential resource**, and helm
is where a credential materializes as a named Kubernetes Secret that a container
references by name. `core/referenced-secret` has no compose realization in the
standard-library catalog — compose credential delivery goes through the
inject-value family, which publishes a value on the inject pipe and no resource
at all — so a compose variant would have no resource identity to compare.

## Per-consumer — each agent holds its own key

`aggregate-per-consumer.yaml` fills the slot on each agent separately, with a
different `origin` per agent:

```yaml
researcher:
  features:
    model_api_key:
      type: core/referenced-secret
      values:
        key: OPENAI_API_KEY
        origin: researcher-key-change-me
```

Two Secrets are emitted, one per agent, each carrying that agent's own material:

```yaml
# dist/per-consumer/helm/features/model_api_key/researcher-secret-researcher-model-api-key.yaml
metadata:
  name: researcher-model-api-key
stringData:
  OPENAI_API_KEY: "researcher-key-change-me"

# dist/per-consumer/helm/features/model_api_key/writer-secret-writer-model-api-key.yaml
metadata:
  name: writer-model-api-key
stringData:
  OPENAI_API_KEY: "writer-key-change-me"
```

and each Deployment references its own:

```yaml
# dist/per-consumer/helm/researcher-deployment.yaml
- name: OPENAI_API_KEY
  valueFrom:
    secretKeyRef:
      name: researcher-model-api-key
      key: OPENAI_API_KEY

# dist/per-consumer/helm/writer-deployment.yaml
- name: OPENAI_API_KEY
  valueFrom:
    secretKeyRef:
      name: writer-model-api-key
      key: OPENAI_API_KEY
```

Revoking one agent's key leaves the other running.

## Shared — one declaration, both agents

`aggregate-shared.yaml` fills the slot on *neither* agent. Instead it attaches
one credential at subsystem scope, and the attachment cascades to every
component in that subsystem:

```yaml
subsystems:
  agents:
    features:
      model_api_key:
        type: core/referenced-secret
        values:
          key: OPENAI_API_KEY
          origin: team-key-change-me
    components:
      researcher: { ... }   # no features: block
      writer:     { ... }   # no features: block
```

The subsystems here are what make the shared form expressible. An Aggregate has
no root-level `features:` block — a subsystem's `features:` block is the
Aggregate's only shared-attachment surface — so declaring subsystems is how a
developer attaches one credential to several components at once.

The gateway sits in its own `model` subsystem deliberately, so the attachment
reaches the two agents and nothing else. Placing it in the `agents` subsystem
instead would attach `model_api_key` to the gateway too, and since a slot is not
required for an attachment to be legal, that renders a third Secret
(`gateway-model-api-key`) that nothing references — the gateway's Recipe reads a
slot named `api_key`, not `model_api_key`. The scope of the subsystem is the
scope of the cascade.

**Read the output carefully, because the intuitive expectation is wrong.** One
declaration does **not** produce one Secret. Two Secrets are emitted, with the
same names as in the per-consumer form, both carrying the same material:

```yaml
# dist/shared/helm/features/model_api_key/researcher-secret-researcher-model-api-key.yaml
metadata:
  name: researcher-model-api-key
stringData:
  OPENAI_API_KEY: "team-key-change-me"

# dist/shared/helm/features/model_api_key/writer-secret-writer-model-api-key.yaml
metadata:
  name: writer-model-api-key
stringData:
  OPENAI_API_KEY: "team-key-change-me"
```

Each Deployment still references its own Secret, and its `secretKeyRef` block is
identical to the per-consumer form's. Rendering runs per component, and the
standard-library credential FeatureRecipe derives its resource name from the
consuming component, so the name differs per consumer. What is shared is the
*declaration*; the emitted resources are not deduplicated into one.

That makes the rendered difference between the two forms narrow and precise:
identical resource count, identical resource names, identical references — only
the material differs. Diff `dist/per-consumer/` against `dist/shared/` and the
only changes are the two Secrets' values and the `aggrega.ai/aggregate-name`
label, which differs because the two forms are authored as two Aggregates. The
choice between per-consumer and shared is a choice about **where the value comes
from and who edits it**, not about how many resources land in the cluster.

If a deployment needs exactly one physical Secret that several consumers read,
that is a different mechanism: a credential Feature whose FeatureRecipe runs at
boundary scope, which renders once for the boundary instead of once per
component. Every credential FeatureRecipe in the standard-library catalog renders
per component, so that shape needs a purpose-authored FeatureRecipe. See
[Credential Model](../../architecture/08-credential-model.md).

### Why the shared attachment is on the Aggregate, not the Release

A Release boundary is the other shared scope, and for many Features it is the
natural one — but it cannot carry this credential. A boundary-wide attachment
declares `type`, `infra` and `uses`; it cannot declare `values`. And
`core/referenced-secret` requires `origin`, which has no default. So attaching it
boundary-wide leaves a required value unfulfillable, and the build halts naming
the missing `origin` rather than rendering a Secret with no material.

The Operator surface fulfils `infra` and wires topology; the material a
credential carries is developer-declared. So for this Feature the Aggregate
subsystem is the shared scope, and a Release boundary suits a credential whose
FeatureRecipe reads its material from `infra` or from an external store instead.

## Composed — shared default, one agent overriding

The two forms compose. `aggregate-composed.yaml` keeps the subsystem-wide
attachment and *also* fills the slot on `researcher` alone:

```yaml
subsystems:
  agents:
    features:
      model_api_key:
        type: core/referenced-secret
        values:
          key: OPENAI_API_KEY
          origin: team-key-change-me
    components:
      researcher:
        features:
          model_api_key:
            type: core/referenced-secret
            values:
              origin: researcher-own-key-change-me   # only origin restated
      writer: { ... }                                # no features: block
```

The nearer scope wins for `researcher`; `writer` keeps the subsystem-wide
attachment untouched:

```yaml
# dist/composed/helm/features/model_api_key/researcher-secret-researcher-model-api-key.yaml
metadata:
  name: researcher-model-api-key
stringData:
  OPENAI_API_KEY: "researcher-own-key-change-me"

# dist/composed/helm/features/model_api_key/writer-secret-writer-model-api-key.yaml
metadata:
  name: writer-model-api-key
stringData:
  OPENAI_API_KEY: "team-key-change-me"
```

**The Secret's data key is the proof that the override is field-by-field.** The
component-scoped fill restated only `origin` — it never mentions `key`. The
`key` field on `core/referenced-secret` carries a schema default of `value`, so a
fill that replaced the subsystem attachment wholesale would have produced a
Secret keyed `value`. It is keyed `OPENAI_API_KEY`, inherited from the subsystem
scope, and the Deployment's `secretKeyRef.key` agrees:

```yaml
# dist/composed/helm/researcher-deployment.yaml
- name: OPENAI_API_KEY
  valueFrom:
    secretKeyRef:
      name: researcher-model-api-key
      key: OPENAI_API_KEY
```

A component override therefore restates only what it changes. Restating the
Feature `type` is required — the types across scopes must agree, and a mismatch
halts the build.

## What the slot buys

`core/ai-agent/crewai` declares the slot once, and the three forms are all
deployment choices made in the Aggregate:

```yaml
featuresSchema:
  model_api_key:
    selector: "feature.aggrega.ai/kind=secret"
    inject: [env]
```

The slot is optional, so a fourth shape is attaching nothing at all: drop the
`features:` block from `aggregate-shared.yaml` and the rendered tree loses both
Secrets and every `OPENAI_API_KEY` env entry, leaving the two Deployments and the
gateway Service. Nothing is invented to fill the gap. The catalog entity is
identical in every case; the deployment decides.

The slot is also family-agnostic (`feature.aggrega.ai/kind=secret` admits either
credential family), which is what lets the same agent take a referenceable
Secret on helm and an inject-value credential on compose.
[Credential delivery — `secretKeyRef` end-to-end](../credential-secretkeyref/)
works that provider split, and its negative release shows what happens when a
non-referenceable credential is asked to satisfy a reference.

## Determinism

All three releases build under `--verify-determinism`, which renders every node
twice and compares the emitted bytes:

```bash
aggrega build --release release-shared.yaml --auto-pull --verify-determinism
```

Rebuilding any of the three from a clean tree reproduces its rendered output
byte-for-byte.
