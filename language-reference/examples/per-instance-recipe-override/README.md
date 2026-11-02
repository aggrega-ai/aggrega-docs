---
example:
  level: authoring
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

## Build it

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

## Why this is useful

Two instances of one component type sometimes need different physical
implementations — for example a primary database on a managed cloud Recipe while
its replicas use the in-cluster Recipe. The `name` tier expresses that per
instance, in the Manifest, without forking the component type or duplicating the
Aggregate. A type that more than one Recipe implements must be disambiguated by a
mapping; left unmapped, the build halts and names the candidates rather than
guessing.
