# Advanced Patterns

This page explains one idea, the Manifest and the FeatureRecipe as the places that decide what a build writes beyond a
component's own Recipe, and is not a runnable workspace. [Per-instance recipe override](per-instance-recipe-override/README.md)
shows the Manifest half in a workspace you build; write it into a folder of your own with:

```sh
aggrega scaffold --example per-instance-recipe-override
```

It then prints the commands to run next:

```sh
cd per-instance-recipe-override
aggrega pull --release release.yaml     # writes release.lock, which the build reads
aggrega build --release release.yaml
```

## One instance, a Recipe of its own

The Manifest's `type` tier binds every instance of a component type to one Recipe. Its `name` tier binds one instance,
by its name in the Aggregate, to another, and the instance named there takes it while every other instance of the type
keeps the `type` binding. From the example's `manifest.yaml`:

```yaml
spec:
  mappings:
    components:
      type:
        example/compute/greeter:1.0.0: compose/greeter-blue:1.0.0
      name:
        greeter-special: compose/greeter-green:1.0.0
```

The most specific entry wins:

1. the `name` entry for the instance's name;
2. the `type` entry naming the type at the instance's version, such as `example/compute/greeter:1.0.0`;
3. the `type` entry naming the type with no version;
4. with no entry at all, the build halts naming the unmapped instance.

A Manifest is ordinary YAML, so a value it repeats can be written once with an anchor and referenced with an alias.

## A Feature that brings resources of its own

A FeatureRecipe can render resources beside the component's own, from a chart of its own named by `source:` and fed
by its `valuesMapping`, rather than changing what the component's Recipe renders. The standard library's
`core/public-ingress` is realized this way on Kubernetes, by `helm/public-ingress`, which renders an Ingress for the
component it is attached to.

The request path a component serves is part of what the application is, so the Feature takes it in `values`; the
hostname is the environment's name for the component, so it is `infra`, beside the settings that describe the
cluster. In [An agent, a router, and two upstream models](ai-agent-and-model-router/README.md), the developer
attaches it in the Aggregate and writes the path:

```yaml
      features:
        published:
          type: core/public-ingress
          values:
            path: /
```

and the Release gives the same attachment its host, and affirms that an ingress controller runs in the target
cluster, without which the build halts, from `release.yaml` with its comments left out:

```yaml
        published:
          infra:
            host: assistant.example.internal
            control_plane_present: true
```

The FeatureRecipe names the resources it renders after `.context.rendered_name`, the host component's name as its
provider reports it, so the Ingress points at the Service the component's own Recipe renders. A `host` written in the
Aggregate's `values`, or a `path` in the Release's `infra`, is refused naming the field: each pillar is closed, and the
field belongs to the other one. A path that differs between environments is a parameter the Aggregate declares and
each Release fulfils.
