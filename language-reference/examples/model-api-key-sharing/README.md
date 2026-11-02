---
example:
  level: start
  products: [core/ai-agent/crewai, core/ai-model/openai-compatible]
  shows: [connections, credentials, parameters]
---

# Sharing a credential — per-consumer, shared, and both at once

Two CrewAI agents behind one OpenAI-compatible gateway. Each agent's `model`
socket declares a `credential` slot, so the key an agent presents to the model
it reaches is attached on that connection. This workspace fills the slot three
ways without changing a single catalog entity: a key per connection, one Secret
every connection points at, and a shared default one connection overrides.

**Two consumers is the point.** The three forms are indistinguishable with a
single consumer — the difference is *which* Secret each consumer ends up
pointing at, and that question has no content until there is more than one
consumer.

## Building

Three releases, one per form. Build one per run:

```bash
aggrega build --release release-per-consumer.yaml    # → dist/per-consumer/
aggrega build --release release-shared.yaml          # → dist/shared/
aggrega build --release release-composed.yaml        # → dist/composed/
```

Each release writes to its own directory, so all three rendered trees coexist
and can be diffed against each other.

A release needs its lockfile before it builds. On a fresh checkout, resolve one
first — either as its own step or by letting the build fill it:

```bash
aggrega pull --release release-shared.yaml                 # resolve, then build normally
aggrega build --release release-shared.yaml --auto-pull    # or resolve during the build
```

The releases resolve their catalog entities from the configured catalog, so no
`--catalog` flag is needed.

All three build on the helm target, deliberately. The observable that separates
the three forms is the **name of the Secret each agent's container references**,
and helm is where a credential is a named Kubernetes Secret that a container
references by name. Two Manifests bind the credential: `manifest.yaml` to
`k8s-secret-from-parameter`, which renders a Secret from the value the
attachment carries, for the per-consumer release; and
`manifest-existing-secret.yaml` to `k8s-existing-secret`, which renders nothing
and points each consumer at a Secret already in the namespace, for the shared
and composed releases.

## Per-consumer — each connection holds its own key

`aggregate-per-consumer.yaml` fills the slot on each agent's connection, with a
different `origin` per agent:

```yaml
researcher:
  type: core/ai-agent/crewai
  uses:
    model:
      gateway:
        target: gateway
        features:
          credential:
            type: core/referenced-secret
            values:
              key: OPENAI_API_KEY
              origin: researcher-key-change-me
```

An attachment on a connection becomes one of the agent's own attachments, named
for the connection and the slot — here `gateway.credential` — so two Secrets are
emitted, one per agent, each carrying that agent's own material:

```yaml
# dist/per-consumer/helm/researcher--gateway-zdcredential--researcher-secret-researcher-gateway-credential.yaml
[… omitted: the apiVersion and the Secret kind]
metadata:
  name: researcher-gateway.credential
  [… omitted: the labels and annotations every rendered document carries]
stringData:
  OPENAI_API_KEY: "researcher-key-change-me"

# dist/per-consumer/helm/writer--gateway-zdcredential--writer-secret-writer-gateway-credential.yaml
[… omitted: the apiVersion and the Secret kind]
metadata:
  name: writer-gateway.credential
  [… omitted: the labels and annotations every rendered document carries]
stringData:
  OPENAI_API_KEY: "writer-key-change-me"
```

and each Deployment references its own:

```yaml
# dist/per-consumer/helm/researcher-deployment.yaml
- name: OPENAI_API_KEY
  valueFrom:
    secretKeyRef:
      name: researcher-gateway.credential
      key: OPENAI_API_KEY

# dist/per-consumer/helm/writer-deployment.yaml
- name: OPENAI_API_KEY
  valueFrom:
    secretKeyRef:
      name: writer-gateway.credential
      key: OPENAI_API_KEY
```

Revoking one agent's key leaves the other running.

## Shared — one Secret, referenced from each connection

A credential on a connection is written on that connection: nothing attached
elsewhere fills it. So several consumers share one credential **by authoring**:
each connection's credential reads the same value, and that value names one
Secret.

`aggregate-shared.yaml` declares one parameter and reads it on both
connections:

```yaml
parameters:
  team_model_key:
    type: string
    default: team-model-key
components:
  researcher:
    uses:
      model:
        gateway:
          target: gateway
          features:
            credential:
              type: core/referenced-secret
              values:
                key: OPENAI_API_KEY
                origin: "{{ .parameters.team_model_key }}"
  writer: { ... }   # the same credential, reading the same parameter
```

The release binds the credential to `k8s-existing-secret`, which reads `origin`
as the name of a Secret that already exists in the namespace. It renders no
Secret at all — only the gateway's Service and the two Deployments are written —
and both Deployments reference the one Secret the parameter names:

```yaml
# dist/shared/helm/researcher-deployment.yaml
- name: OPENAI_API_KEY
  valueFrom:
    secretKeyRef:
      name: team-model-key
      key: OPENAI_API_KEY

# dist/shared/helm/writer-deployment.yaml
- name: OPENAI_API_KEY
  valueFrom:
    secretKeyRef:
      name: team-model-key
      key: OPENAI_API_KEY
```

That is exactly one physical Secret, created outside the Release by whoever
deploys it, and read by every consumer. The key's material never passes through
an authored file or a rendered artifact.

**What the parameter carries follows the realization the Manifest binds.** Under
`k8s-existing-secret` it is a Secret's name. Bound instead to
`k8s-secret-from-parameter`, the same two connections reading one parameter
would carry the key itself, and the build would render one Secret per consumer,
each holding the same material: rendering runs per component, and that
realization names the Secret it renders after the consuming component and the
connection. The one parameter is what keeps the consumers from drifting apart;
which realization reads it decides whether they share a resource. A credential
generated in the cluster is shared the same way — one request and many
references; see [Credential Model](../../../architecture/08-credential-model.md).

## Composed — shared default, one connection overriding

`aggregate-composed.yaml` keeps the shared parameter as the default and lets one
connection name a Secret of its own:

```yaml
researcher:
  uses:
    model:
      gateway:
        target: gateway
        features:
          credential:
            type: core/referenced-secret
            values:
              key: OPENAI_API_KEY
              origin: researcher-model-key       # this connection's own Secret
writer:
  uses:
    model:
      gateway:
        target: gateway
        features:
          credential:
            type: core/referenced-secret
            values:
              key: OPENAI_API_KEY
              origin: "{{ .parameters.team_model_key }}"   # the shared default
```

The override is what that one connection authors; nothing cascades onto it, and
`writer` keeps the shared Secret untouched:

```yaml
# dist/composed/helm/researcher-deployment.yaml
- name: OPENAI_API_KEY
  valueFrom:
    secretKeyRef:
      name: researcher-model-key
      key: OPENAI_API_KEY

# dist/composed/helm/writer-deployment.yaml
- name: OPENAI_API_KEY
  valueFrom:
    secretKeyRef:
      name: team-model-key
      key: OPENAI_API_KEY
```

A connection's credential is a whole attachment of its own, so an override
restates every field it needs — here the Feature type, `key` and `origin` — and
inherits none from the default.

## What the slot buys

`core/ai-agent/crewai` declares the slot once, on its `model` socket, and the
three forms are all choices made in the Aggregate:

```yaml
usesSchema:
  model:
    selector: "component.aggrega.ai/category in (ai-model, gateway), model.aggrega.ai/api"
    required: true
    inject: [env, file]
    featuresSchema:
      credential:
        selector: "feature.aggrega.ai/kind=secret"
        sensitive: true
        inject: [env]
```

The slot is optional, so a fourth shape is attaching nothing at all: drop the
`features:` block from both connections and the rendered tree loses every
`OPENAI_API_KEY` env entry, leaving the two Deployments and the gateway Service.
Nothing is invented to fill the gap. The catalog entity is identical in every
case; the author decides.

That builds because the gateway here, `core/ai-model/openai-compatible`, carries
no `component.aggrega.ai/hosting` label. A connection reaching a target the
catalog labels `managed` — `core/ai-model/openai`, say — with no credential halts
the build on the agent's own assertion, unless the connection says in its
`values` that the target takes none, `unauthenticated: true`.

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
