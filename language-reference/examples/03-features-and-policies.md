# Features and Policies

This page explains one idea, attaching a behaviour to a component and checking the result with a policy, and is not
a runnable workspace.
[A policy that halts a build when restricted data reaches a managed model unmasked](policy-data-class-route/README.md)
shows both in a workspace you build; write it into a folder of your own with:

```sh
aggrega draft --example policy-data-class-route
```

It then prints the commands to run next:

```sh
cd policy-data-class-route
aggrega build --release release-masked.yaml --config governance-rego.yaml --auto-pull
aggrega build --release release-unmasked.yaml --config governance-rego.yaml --auto-pull           # halts; exits 1
aggrega build --release release-masking-off-route.yaml --config governance-rego.yaml --auto-pull  # halts; exits 1
```

## A Feature is attached, and realized by a FeatureRecipe

A Feature is a behaviour a component does not carry by itself — masking, a backup, an ingress, a credential — that an
author attaches to it under `features:`. Who attaches it follows from who decides its inputs: the developer attaches,
in the Aggregate, a Feature whose behaviour is part of what the application is; the operator attaches, in the
Release, one whose inputs are all operational. Either way the Manifest binds each Feature to a FeatureRecipe, which
decides how it is realized for the target.

In the example, the developer attaches the standard library's `core/data-masking` to an AI gateway and lists what to
mask, from `aggregate.yaml` with its comments left out:

```yaml
    masking-gateway:
      type: core/gateway/litellm
      values:
        model: chat
      features:
        masking:
          type: core/data-masking
          values:
            patterns:
              - name: claim_number
                regex: '\bCLM-[0-9]{8}\b'
            entities: [PERSON, EMAIL_ADDRESS]
```

The developer names no address, guardrail or provider setting. The Manifest binds `core/data-masking` to
`helm/data-masking-litellm`, which writes the masking into the configuration the gateway's own Recipe renders, through
steps of the plugin pipeline that closes rendering, and adds a module the gateway loads beside it. Every other file
the build writes is byte-identical to a build without the attachment.

What the attachment does not do is stated as carefully as what it does: text no pattern matches and the recognizer
does not detect passes unchanged, the gateway and the two recognizer services see the original text, and traffic that
does not pass through the gateway is not touched. The FeatureRecipe's comments list what this gateway refuses and what
it passes on as sent.

## Labels decide where a Feature may go

Labels are a component's semantic identity, and they drive Feature placement, socket selectors and policy without
any change to the compiler. A Feature's `appliesTo` is a label selector over the component it is attached to.
`core/data-masking` declares `appliesTo: "dataplane.aggrega.ai/content-masking"`, a bare key, which matches any
component carrying that label whatever its value; `core/gateway/litellm` carries it, with the value
`entity-recognition`. A selector can also match values, `component.aggrega.ai/type in (server, worker)`, or exclude
a label, `!model.aggrega.ai/capability`; the requirements of one selector, separated by commas, must all hold, and the
Feature attaches only to a component they match. [Label-Based Attachment](../entities/feature.md#label-based-attachment)
gives the whole selector grammar.

Two more declarations constrain attachments:

- **Interoperability.** A Feature can name Features it cannot share a component with. `core/data-masking` declares
  `interoperability.conflictsWith: [core/semantic-caching]`, so a build in which one component ends up carrying both
  — attached on the component itself, or on a subsystem or boundary holding it — halts before rendering.
- **Presence mandates.** A Component can require that an attachment of a given type is present. The catalog's
  `example/compute/service` carries the annotation `features.aggrega.ai/requiredType.monitoring:
  core/prometheus-exporter`, so a build in which an instance of it carries no `core/prometheus-exporter`, at any scope,
  halts naming the `monitoring` requirement. Repeat the key with another suffix to require a second type; see
  [entities/component.md](../entities/component.md) "Presence mandates" for how a mandate differs from an attachment
  slot.

A Feature goes on the component whose behaviour it changes. `core/caller-allowlist` is attached to a model server, not
to the gateways allowed to call it; [A model server that only its gateway may call](model-server-caller-allowlist/README.md)
builds that.

## A policy reads the built graph

Policy is attached by the operator under `plugins.governance` in the workspace configuration, each attachment in a
role. A policy at the `label-transform` role adds labels to the graph; one at the `ir-verdict` role judges it and may
halt the build. The Rego engine runs both; it is compiled into the CLI, and `governance/rego` is its Plugin entity in
the standard-library catalog.

The first rule below tags every gateway that parses the model payload it forwards as a point where prompts leave for a
model provider. At this role the nodes are at `input.graph.nodes`:

```rego
# policies/egress-tagging.rego: attached at the label-transform role
package aggrega.tagging

import rego.v1

labels contains {"node": id, "key": "compliance.aggrega.ai/egress", "value": "model-provider"} if {
    some id, node in input.graph.nodes
    node.labels["gateway.aggrega.ai/intelligence"] == "semantic"
}
```

The second halts any path through such a gateway that carries no masking:

```rego
# policies/model-egress.rego: attached at the ir-verdict role
package aggrega.security

import rego.v1

deny contains msg if {
    some path in input.precalculated_paths
    some egress in path.nodes
    input.graph.spec.nodes[egress].labels["compliance.aggrega.ai/egress"] == "model-provider"
    not "core/data-masking" in path.attached_features

    msg := sprintf(
      "BLOCKED: path %v sends model traffic through %v without core/data-masking attached.",
      [concat(" -> ", path.nodes), egress]
    )
}
```

A node's id is the key it sits under in `input.graph.spec.nodes`; `attached_features` lists the Feature types attached
to any node on the path, so membership is tested with `in`; the rule checks that masking is attached, not what it
lists; and a decision collected under `deny` is reported at the `halt` severity, which stops the build. A rule over
paths sees a node only where an edge reaches or leaves it, so a policy that must also cover an unconnected node reads
the nodes themselves.

The operator attaches the engine once per role, each attachment with its own policy file; a relative path under
`sources` resolves against the directory of the configuration file, and the transform runs before the verdict:

```yaml
# .aggrega-config.yaml
plugins:
  governance:
    - uri: governance/rego:0.9.0
      role: label-transform
      with:
        sources:
          - policies/egress-tagging.rego
    - uri: governance/rego:0.9.0
      role: ir-verdict
      with:
        sources:
          - policies/model-egress.rego
```

The [governance socket page](../plugins/policy-socket.md) is the full authoring surface: the payload each role
exposes, the decision keys, and how to name your own. [Policies that shape labels](policy-label-transform/README.md)
attaches a label-shaping policy beside the two built-in tagging plugins and builds it.
