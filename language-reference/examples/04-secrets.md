# Secrets

This page explains one idea, how a credential reaches the component that needs it, and is not a runnable workspace.
[Advanced platform — a multi-boundary Kubernetes platform](advanced-platform/README.md) shows both delivery models in
a workspace you build; write it into a folder of your own with:

```sh
aggrega scaffold --example advanced-platform && cd advanced-platform
```

## The secret-delivery checklist

A credential passes through six surfaces before it reaches a running container. These are the touch-points to check
when wiring a new one:

| Step | Surface | Action |
| --- | --- | --- |
| 1 | Component `featuresSchema:` | **Declare** the credential slot: its name, whether it is `required`, and its `inject:` allowlist — the delivery mechanisms an attachment may name, `[env]` or `[env, file]` for a transparent slot, `[]` for an opaque one. |
| 2 | Credential Feature `schema:` | **Define** what an author supplies: the standard library's credential Features carry the `feature.aggrega.ai/kind: secret` label and take the credential's locator as `origin`, and the data key as `key`. |
| 3 | Aggregate `features:` | **Request** the credential, under the same `features:` keyword as any other Feature: its `type`, its `values` and, on a transparent slot only, an `inject:` block saying how the application reads it. |
| 4 | FeatureRecipe | **Realize** it for the target: write the value where the component reads it, render a resource holding it, or render one that fetches it from a secret store. |
| 5 | Manifest `mappings.features.type` | **Bind** the credential Feature to its FeatureRecipe, in the same tier as every other Feature. |
| 6 | Recipe | **Read** it, on an opaque slot: the component's Recipe reads the locator the credential publishes, `.features.<slot>.provides.name`, and hands it to the product's own mechanism, such as a chart's `existingSecret`. |

A transparent slot uses the first five; an opaque slot uses all six, which is the usual case for packaged
infrastructure such as a vendor's chart.

## Transparent and opaque slots

A **transparent** slot lets the developer say how the application reads the credential. An **opaque** slot leaves
delivery to the Recipe, and an attachment writing an `inject:` block on it halts the build. In the example,
`core/datastore/mariadb` declares one of each, and the Aggregate fills both, from `aggregate.yaml` with its comments
left out:

```yaml
    db:
      type: core/datastore/mariadb
      features:
        root_password:
          type: core/secret-value
          values:
            key: MARIADB_ROOT_PASSWORD
            origin: dev-root-pw-change-me
        user_password:
          type: core/secret-provided
          values:
            origin: dev-app-pw-change-me
          inject:
            env:
              - in: MARIADB_PASSWORD
                from: value
```

`root_password` is opaque: `core/secret-value` delivers the value under the key the attachment names, where the
database's Recipe reads it. `user_password` is transparent: `core/secret-provided` publishes the value as `value`, and
the attachment's own `inject:` block delivers it into `MARIADB_PASSWORD`. An `inject:` block naming a mechanism the
slot does not list halts the build, as does one naming a key nothing publishes or reads.

For an opaque slot filled by a referenceable credential, the component's Recipe reads the published locator rather
than deriving a name, `existingSecret: "{{ .features.root_password.provides.name }}"`, so the Secret a FeatureRecipe
emits and the reference to it are one string. [MariaDB (Bitnami chart) — one multi-key credential Secret](mariadb-bitnami-credential-set/README.md)
builds that flow against a vendor's chart.

## Realizing a credential: a resource, or a two-step pipeline

The standard library's Kubernetes realizations render the credential's resource from a small chart beside the
FeatureRecipe: `helm/k8s-secret-from-parameter` a Secret holding the value an author supplied, and
`helm/k8s-external-secret` an `ExternalSecret` that the External Secrets Operator reconciles from a secret store.
[Credential Features](05-credential-features.md) walks through each.

A FeatureRecipe can instead realize a credential with a `pipeline:` of two steps, each a plugin. The first, the
fetcher, writes the store-specific resource — an `ExternalSecret`, say — naming the store entry the attachment's values
give. The second, the injector, patches the component's rendered workload to mount the resulting Secret into its
container, at the variables or files the attachment's `inject:` block names, which the step reads at `.inject`.
Moving to another secret store replaces the fetcher; the injector stays. A step returns the resources it adds as side
effects and its changes to the rendered documents as patches; the
[Wasm plugin contract](../plugins/plugin-contract.md) is the shape of both.

## A Feature's own credential

A Feature can need a credential of its own: a guardrail proxy that authenticates to an upstream service, a log
shipper with an ingest token. The Feature declares the slot in its own `featuresSchema`, exactly as a Component does,
and the FeatureRecipe bound to it reads what fills that slot when it renders the Feature's workload.

**Attachments do not nest.** The credential is attached beside the Feature, on the same component, under the name the
Feature's slot declares; the slot name is what ties the two together. The guard Feature and the component below are
the workspace's own entities; `core/referenced-secret` is the standard library's.

```yaml
# The Feature declares the slot
kind: Feature
metadata:
  name: local/guard
spec:
  appliesTo: "component.aggrega.ai/type in (server, worker)"
  featuresSchema:
    guard_api_key:
      selector: "feature.aggrega.ai/kind=secret"
      sensitive: true
      inject: [env]
---
# The Aggregate fills it beside the Feature
spec:
  components:
    finance-agent:
      type: local/compute/guarded-worker
      features:
        ai-guard:
          type: local/guard
        guard_api_key:
          type: core/referenced-secret
          values:
            origin: dev-guard-key-change-me
            key: api-key
```

The guard's FeatureRecipe renders a workload whose container references the slot,
`attachments: { GUARD_API_KEY: { from: guard_api_key, as: env } }`, so the reference lands on the guard's container
and on no other. The host component's Recipe cannot reference the slot, because it belongs to the Feature: a workload
reaching for it halts the build naming the slot. A workload entry naming a slot nothing fills halts too, since there
is no published locator to resolve.

The same holds for the connections a Feature draws: a connection in the Feature's own `uses:` block carries no
attachments, so a credential such a connection needs is a slot the Feature declares, filled beside the Feature.

## A connection's own credential

A gateway reaching two models may present a different key to each, or a key to one and none to the other. A slot on
the gateway holds one credential for the whole component, so the credential goes on the **connection** instead: the
gateway's socket declares the slot every connection through it may fill, and each connection fills it, or does not, on
its own.

```yaml
spec:
  components:
    router:
      type: core/gateway/litellm
      uses:
        models:
          gpt:
            target: gpt
            features:
              credential:            # a slot the models socket declares
                type: core/referenced-secret
                values:
                  key: api-key
```

The gateway's Recipe reads the attachment from its connection, at `.context.uses.gpt.features.credential`, so a
gateway reaching several models reads each model's own key; `core/gateway/litellm` delivers each as a variable of its
own, which the connection's entry in its routing table names. An attachment under a name the socket declares no slot
for halts the build, naming the slots it does declare. The Manifest can realize one connection's credential
differently from the rest, keyed by `<connection>.credential` in its per-instance tier.
[Credentials on connections — a key per connection, and one key at both ends](connection-credentials/README.md) builds
this; a Release can also wire such a connection and name the secret in the attachment's `infra`, as
[Credential Features](05-credential-features.md#who-names-the-credential-values-or-infra-exactly-one) describes.
