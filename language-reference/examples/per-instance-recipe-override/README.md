# Per-instance recipe override

This example teaches one Manifest feature: the **`name` mapping tier**, which
overrides the Recipe for a single component *instance* while every other
instance of the same type keeps the bulk `type`-tier Recipe.

## What it shows

The Aggregate declares two instances of one component type (`app/greeter`):

```yaml
components:
  greeter-default:
    type: app/greeter
  greeter-special:
    type: app/greeter
```

The catalog ships two Recipes that both implement `app/greeter` — `greeter-blue`
(the default build) and `greeter-green` (an alternate build). The Manifest maps
the type in bulk and overrides one instance by name:

```yaml
mappings:
  components:
    type:
      app/greeter:1.0.0: greeter-blue:1.0.0     # every greeter instance...
    name:
      greeter-special: greeter-green:1.0.0      # ...except this one
```

Name wins over type, so `greeter-special` deploys through `greeter-green` and
`greeter-default` through `greeter-blue`.

## Build it

```bash
aggrega build --release release.yaml --catalog catalog
```

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
