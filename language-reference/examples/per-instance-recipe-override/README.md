---
example:
  level: authoring
  tier: authoring
  position: 2
  products: []
  shows: [recipe-selection]
---

# Per-instance recipe override

This example teaches one Manifest feature: the **`name` mapping tier**, which
overrides the Recipe for a single component *instance* while every other
instance of the same type keeps the bulk `type`-tier Recipe.

## What it shows

The Aggregate declares two instances of one component type (`example/compute/greeter`):

```yaml
components:
  greeter-default:
    type: example/compute/greeter
  greeter-special:
    type: example/compute/greeter
```

The catalog ships two Recipes that both implement `example/compute/greeter` — `greeter-blue`
(the default build) and `greeter-green` (an alternate build). The Manifest maps
the type in bulk and overrides one instance by name:

```yaml
mappings:
  components:
    type:
      example/compute/greeter:1.0.0: compose/greeter-blue:1.0.0   # every greeter instance...
    name:
      greeter-special: compose/greeter-green:1.0.0      # ...except this one
```

Name wins over type, so `greeter-special` deploys through `greeter-green` and
`greeter-default` through `greeter-blue`.

## Scaffold the example

You can build this example with the commands below, or [have your AI assistant build it for you](#with-an-ai-assistant).

Write the example into a new folder named after it:

```sh
aggrega scaffold --example per-instance-recipe-override
```

It then prints the commands to run next. The first changes into the new folder:

```sh
cd per-instance-recipe-override
```

## Build

```bash
aggrega pull --release release.yaml     # writes release.lock, which the build reads
aggrega build --release release.yaml
```

This example consumes the standard library for its provider: the `compose`
provider ships in the standard catalog. The override lesson's own toys — the
`example/compute/greeter` demo component and its two recipes (`greeter-blue` /
`greeter-green`), which exist purely to make the per-instance override visible —
live in the shared catalog under the `example/` publisher, alongside the
standard-library entities. `.aggrega-config.yaml` declares `hub.aggrega.ai` as
the default registry, so the entities resolve from the hub — the build command
needs no `--catalog` flag.

The rendered `dist/app/compose/docker-compose.yaml` shows the override firing —
`greeter-default` runs `image: greeter:blue`, `greeter-special` runs
`image: greeter:green`, and each service's `aggrega.ai/recipe-uri` provenance
label names the distinct Recipe it resolved to.

## With an AI assistant

An AI assistant [set up with Aggrega's tools](../../../ai-assistants/set-up.md)
can do the same: paste this prompt into it.

<!-- copyable -->

> Use the Aggrega tools only, and create no folder yourself. If the Workspace folder holds no `per-instance-recipe-override` folder yet, call the `scaffold` tool once with `example` set to `per-instance-recipe-override` and no `dir`: it writes the example into a new `per-instance-recipe-override` folder. Then call the `build` tool with `workspace_root` set to `per-instance-recipe-override`, `release` set to `release.yaml`, `auto_pull` set to true and `write` set to true. Tell me which files the build wrote; they are under `per-instance-recipe-override/dist/`.

## Why this is useful

Two instances of one component type sometimes need different physical
implementations — for example a primary database on a managed cloud Recipe while
its replicas use the in-cluster Recipe. The `name` tier expresses that per
instance, in the Manifest, without forking the component type or duplicating the
Aggregate. A type that more than one Recipe implements must be disambiguated by a
mapping; left unmapped, the build halts and names the candidates rather than
guessing.
